(function () {
    'use strict';

    const BUTTON_ID = 'violet-atum-auto-spin';
    const STYLE_ID = 'violet-atum-layout';
    const DIALOG_ID = 'violet-atum-dialog';
    const STATUS_ID = 'violet-atum-status';
    const INIT_MARKER = 'data-violet-atum-initialized';
    const STEP_TIMEOUT = 45000;
    const POLL_DELAY = 200;

    if (document.documentElement.hasAttribute(INIT_MARKER)) return;
    document.documentElement.setAttribute(INIT_MARKER, '');

    let activeFrame = null;
    let wheelDocument = null;
    let wheelObserver = null;
    let activeRun = null;
    let runTimer = null;

    function isVisible(element) {
        if (!element?.isConnected || !element.getClientRects().length) return false;
        const style = element.ownerDocument.defaultView.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function findVisible(selector, root = wheelDocument) {
        return root ? [...root.querySelectorAll(selector)].find(isVisible) || null : null;
    }

    function getReadyPlayButton() {
        const button = findVisible('.roulette__game .roulette__click');
        if (!button || button.matches('.disabled, .loading, [disabled], [aria-disabled="true"]')) return null;
        return button;
    }

    function hasGameError() {
        return Boolean(findVisible('.aa__error, .mg-notify .error'));
    }

    function updateAutoSpinButton() {
        const button = wheelDocument?.getElementById(BUTTON_ID);
        if (!button) return;
        const text = activeRun?.stopRequested ? 'Остановка…'
            : activeRun ? `Стоп (${activeRun.completed}/${activeRun.limit})` : 'Автопрокрутка';
        if (button.textContent !== text) button.textContent = text;
    }

    function showRunStatus(message) {
        let panel = document.getElementById(STATUS_ID);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = STATUS_ID;
            panel.style.cssText = `
                position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
                width: 360px; max-width: calc(100vw - 40px); max-height: calc(100vh - 40px);
                overflow-y: auto; box-sizing: border-box;
                padding: 16px; background: #1c1c1c; border: 1px solid #7428ac;
                border-radius: 6px; color: #fff; font: 14px/1.5 Arial, sans-serif;
            `;
            panel.innerHTML = `
                <div role="status" aria-live="polite" style="margin-bottom: 12px;"></div>
                <div id="violet-atum-rewards" style="max-height: 45vh; overflow-y: auto; margin-bottom: 12px;"></div>
                <button type="button" style="padding: 8px 16px; border: 0; background: #7428ac; color: #fff; font: 14px Arial, sans-serif; cursor: pointer;"></button>
            `;
            panel.querySelector('button').addEventListener('click', () => {
                if (activeRun) stopAutoSpin('Автопрокрутка остановлена.');
                else panel.remove();
            });
            document.body.appendChild(panel);
        }
        panel.querySelector('[role="status"]').textContent = message;
        const stopButton = panel.querySelector('button');
        stopButton.textContent = activeRun?.stopRequested ? 'Остановка…' : activeRun ? 'Стоп' : 'Закрыть';
        stopButton.disabled = Boolean(activeRun?.stopRequested);
        updateAutoSpinButton();
    }

    function addReward(run, key, title) {
        const reward = run.rewards.get(key) || { title, hits: 0 };
        reward.hits++;
        run.rewards.set(key, reward);
        run.rewardCount++;
        showRewards(run);
    }

    function showRewards(run, finished = false) {
        const container = document.getElementById('violet-atum-rewards');
        if (!container) return;
        const scrollTop = container.scrollTop;
        container.replaceChildren();

        if (run.rewards.size) {
            const table = document.createElement('table');
            table.style.cssText = 'width: 100%; border-collapse: collapse; color: inherit; font: inherit;';
            table.innerHTML = '<thead><tr><th style="text-align: left; padding: 6px 8px 6px 0;">Награда</th><th style="text-align: right; padding: 6px 0;">Выпадений</th></tr></thead>';
            const body = document.createElement('tbody');
            const rewards = [...run.rewards.values()].sort((a, b) => a.hits - b.hits || a.title.localeCompare(b.title, 'ru'));
            for (const reward of rewards) {
                const row = document.createElement('tr');
                const title = document.createElement('td');
                title.style.cssText = 'padding: 8px 8px 8px 0; border-top: 1px solid #493253; overflow-wrap: anywhere;';
                title.textContent = reward.title;
                const hits = document.createElement('td');
                hits.style.cssText = 'padding: 8px 0; border-top: 1px solid #493253; text-align: right; vertical-align: top;';
                hits.textContent = String(reward.hits);
                row.append(title, hits);
                body.appendChild(row);
            }
            table.appendChild(body);
            container.appendChild(table);
        }
        if (finished && run.rewardCount < run.submitted) {
            const warning = document.createElement('p');
            warning.style.cssText = 'margin: 10px 0 0; color: #ffb0b0;';
            warning.textContent = 'Результат последней прокрутки не подтверждён и не включён в список. Проверьте его на сайте; повторный запрос не отправлялся.';
            container.appendChild(warning);
        }
        container.scrollTop = scrollTop;
    }

    function isCurrentRunPage(run) {
        try {
            return run.frame === activeFrame && run.frame?.isConnected &&
                run.frame.contentDocument === run.document && run.game?.isConnected;
        } catch {
            return false;
        }
    }

    function finishAutoSpin(message) {
        const run = activeRun;
        clearTimeout(runTimer);
        runTimer = null;
        activeRun = null;
        updateAutoSpinButton();
        if (message) {
            showRunStatus(message);
            if (run) showRewards(run, true);
        } else document.getElementById(STATUS_ID)?.remove();

        if (run?.turbo) {
            run.frame.inert = run.originalInert;
            // После прямых запросов Vue хранит старый баланс. Перезагружаем только тот же iframe.
            if (run.submitted && isCurrentRunPage(run)) {
                try {
                    run.frame.contentWindow.location.reload();
                } catch {
                    showRunStatus(`${message || 'Автопрокрутка остановлена.'} Обновите страницу для синхронизации баланса.`);
                }
            }
        }
    }

    function stopAutoSpin(message) {
        if (activeRun?.turbo && activeRun.inFlight) {
            activeRun.stopRequested = true;
            activeRun.stopMessage = message || 'Автопрокрутка остановлена.';
            showRunStatus('Останавливаемся: ожидаем ответ на текущий запрос. Новых прокруток не будет.');
            return;
        }
        finishAutoSpin(message);
    }

    function startAutoSpin(count, turbo = false) {
        if (activeRun) return;
        const run = {
            document: wheelDocument,
            frame: activeFrame,
            game: wheelDocument.querySelector('.roulette__game'),
            limit: count,
            turbo,
            rewards: new Map(),
            rewardCount: 0,
            stopRequested: false,
            inFlight: false,
            originalInert: activeFrame.inert,
            submitted: 0,
            completed: 0,
            phase: 'ready',
            deadline: Date.now() + STEP_TIMEOUT,
            nextSpinAt: 0
        };
        activeRun = run;
        document.getElementById('violet-atum-rewards')?.replaceChildren();
        showRunStatus(`Автопрокрутка: 0 / ${count}. Подготовка…`);
        if (turbo) {
            // Не даём вручную запустить параллельную прокрутку со старым балансом Vue.
            run.frame.inert = true;
            runTurbo(run);
        } else advanceAutoSpin(run);
    }

    async function requestTurboData(run, action, method) {
        const controller = new AbortController();
        run.controller = controller;
        run.inFlight = true;
        const timeout = setTimeout(() => controller.abort(), STEP_TIMEOUT);
        try {
            const headers = { Accept: 'application/json' };
            // Повторяем штатную CSRF-защиту Axios сайта, не сохраняя и не выводя токены.
            const csrfCookie = run.document.cookie.split(';').map(cookie => cookie.trim())
                .find(cookie => cookie.startsWith('XSRF-TOKEN='));
            if (csrfCookie) headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfCookie.slice('XSRF-TOKEN='.length));

            let response;
            try {
                response = await fetch(`/minigames/roulette/api/${action}`, {
                    method, headers, credentials: 'same-origin', mode: 'same-origin',
                    cache: 'no-store', redirect: 'error', referrer: run.document.URL,
                    signal: controller.signal
                });
            } catch {
                throw new Error(controller.signal.aborted
                    ? 'Истекло время ожидания ответа сервера. Турбо остановлено без повторного запроса.'
                    : 'Не удалось получить ответ сервера. Турбо остановлено без повторного запроса.');
            }
            if (response.status === 429) throw new Error('Сервер ограничил частоту запросов. Турбо остановлено.');
            if (!response.ok) throw new Error(`Сервер вернул ошибку HTTP ${response.status}. Турбо остановлено.`);
            let result;
            try {
                result = await response.json();
            } catch {
                throw new Error(controller.signal.aborted
                    ? 'Истекло время ожидания ответа сервера. Турбо остановлено без повторного запроса.'
                    : 'Сервер вернул непонятный ответ. Турбо остановлено без повторного запроса.');
            }
            if (result?.state !== 'Success') throw new Error('Сервер не подтвердил действие. Турбо остановлено.');
            const data = result.data;
            if (data?.type !== 'atum' || !Number.isSafeInteger(data.user?.coins) || data.user.coins < 0) {
                throw new Error('Не удалось проверить тип колеса или баланс в ответе сервера. Турбо остановлено.');
            }
            return data;
        } finally {
            clearTimeout(timeout);
            run.controller = null;
            run.inFlight = false;
        }
    }

    function recordServerReward(run, data) {
        const prize = data.user.lastResult;
        if (!prize || typeof prize.type !== 'string' || !prize.type.trim() || !Number.isSafeInteger(prize.id) || prize.id < 1) {
            throw new Error('Не удалось распознать награду в ответе сервера. Турбо остановлено.');
        }
        const catalogPrize = Array.isArray(data.settings?.prizes)
            ? data.settings.prizes.find(item => item.id === prize.id && item.type === prize.type) : null;
        const titles = [prize.itemInfo?.title, prize.extra?.title, prize.title,
            catalogPrize?.itemInfo?.title, catalogPrize?.extra?.title, catalogPrize?.title];
        const title = titles.find(value => typeof value === 'string' && value.trim())?.trim() || `Награда №${prize.id}`;
        const rawCount = prize.count ?? catalogPrize?.count ?? 1;
        const count = typeof rawCount === 'number' || (typeof rawCount === 'string' && /^\d+$/.test(rawCount))
            ? Number(rawCount) : NaN;
        if (!Number.isSafeInteger(count) || count < 1) throw new Error('В ответе сервера неизвестное количество наград. Турбо остановлено.');
        // Считаем выпадения наборов, а не отдельные предметы внутри набора.
        addReward(run, JSON.stringify([prize.type, prize.id, count]), count > 1 ? `${title} ×${count}` : title);
    }

    async function runTurbo(run) {
        try {
            if (!isCurrentRunPage(run)) throw new Error('Страница колеса изменилась. Турбо остановлено.');
            // Проверяем серверный баланс и тип игры до первого платного действия.
            let data = await requestTurboData(run, 'info', 'GET');
            while (activeRun === run && !run.stopRequested && run.submitted < run.limit && data.user.coins > 0) {
                if (!isCurrentRunPage(run)) throw new Error('Страница колеса изменилась. Турбо остановлено.');
                if (hasGameError() || findVisible('.roulette__overlay')) throw new Error('Состояние страницы колеса изменилось. Турбо остановлено.');
                run.submitted++;
                showRunStatus(`Турбо: ${run.completed} / ${run.limit}. Ожидаем ответ сервера…`);
                // Только один запрос в полёте. Ни сетевые ошибки, ни тайм-ауты не повторяем.
                data = await requestTurboData(run, 'turn', 'POST');
                if (activeRun !== run) return;
                recordServerReward(run, data);
                run.completed++;
            }
            if (activeRun !== run) return;
            finishAutoSpin(run.stopRequested ? run.stopMessage
                : run.completed >= run.limit ? `Прокрутки завершены: ${run.completed} / ${run.limit}.`
                    : `Жетоны закончились. Выполнено: ${run.completed} / ${run.limit}.`);
        } catch (error) {
            if (activeRun === run) finishAutoSpin(error instanceof Error ? error.message : 'Турбо остановлено из-за ошибки.');
        }
    }

    function advanceAutoSpin(run) {
        if (activeRun !== run) return;
        runTimer = null;
        try {
            if (!run.frame?.isConnected || run.frame.contentDocument !== run.document || !run.game?.isConnected) {
                stopAutoSpin('Страница колеса изменилась. Автопрокрутка остановлена.');
                return;
            }
            if (hasGameError()) {
                stopAutoSpin('Сайт сообщил об ошибке. Автопрокрутка остановлена; проверьте сообщение на странице.');
                return;
            }
            if (Date.now() > run.deadline) {
                stopAutoSpin('Не удалось дождаться ответа колеса. Автопрокрутка остановлена; проверьте страницу перед повторным запуском.');
                return;
            }

            const overlay = findVisible('.roulette__overlay');
            if (overlay && !overlay.querySelector('.roulette__popup.prize')) {
                stopAutoSpin('Открыто другое окно колеса. Автопрокрутка остановлена.');
                return;
            }

            if (run.phase === 'ready') {
                // Не закрываем чужое/предыдущее окно выигрыша и не продолжаем чужое вращение.
                if (overlay) {
                    stopAutoSpin('Открыто окно выигрыша вне текущей прокрутки. Автопрокрутка остановлена.');
                    return;
                }
                const balance = getTokenBalance();
                if (balance === null || balance < 1) {
                    stopAutoSpin(balance === null ? 'Не удалось прочитать баланс жетонов. Автопрокрутка остановлена.' : 'Жетоны закончились. Автопрокрутка остановлена.');
                    return;
                }
                const playButton = getReadyPlayButton();
                if (playButton && Date.now() >= run.nextSpinAt) {
                    if (run.submitted >= run.limit) {
                        stopAutoSpin(`Прокрутки завершены: ${run.completed} / ${run.limit}.`);
                        return;
                    }
                    // Резервируем одну попытку ДО клика. Не повторяем его при задержке ответа.
                    run.submitted++;
                    run.phase = 'prize';
                    run.deadline = Date.now() + STEP_TIMEOUT;
                    showRunStatus(`Автопрокрутка: ${run.completed} / ${run.limit}. Ожидание выигрыша…`);
                    playButton.click();
                }
            } else if (run.phase === 'prize') {
                const continueButton = overlay && [...overlay.querySelectorAll('.roulette__popup.prize .content .button')]
                    .find(button => isVisible(button) && button.textContent.trim() === 'Продолжить' &&
                        !button.matches('.disabled, [disabled], [aria-disabled="true"]'));
                if (continueButton && !overlay.matches('.fade-enter-active, .fade-leave-active')) {
                    const prizeName = (overlay.querySelector('.image_block p')?.textContent
                        || overlay.querySelector('.jackpot_popup')?.textContent || '').replace(/\s+/g, ' ').trim();
                    addReward(run, prizeName || `unknown-${run.submitted}`, prizeName || 'Награда без названия');
                    run.phase = 'closing';
                    run.deadline = Date.now() + STEP_TIMEOUT;
                    showRunStatus(`Автопрокрутка: ${run.completed} / ${run.limit}. Закрываем окно выигрыша…`);
                    continueButton.click();
                }
            } else if (run.phase === 'closing' && !overlay) {
                run.completed++;
                if (run.submitted >= run.limit) {
                    stopAutoSpin(`Прокрутки завершены: ${run.completed} / ${run.limit}.`);
                    return;
                }
                run.phase = 'ready';
                run.deadline = Date.now() + STEP_TIMEOUT;
                run.nextSpinAt = Date.now() + 500;
                showRunStatus(`Автопрокрутка: ${run.completed} / ${run.limit}. Подготовка…`);
            }
        } catch {
            stopAutoSpin('Не удалось выполнить действие на странице. Автопрокрутка остановлена.');
            return;
        }
        if (activeRun === run) runTimer = setTimeout(() => advanceAutoSpin(run), POLL_DELAY);
    }

    function getTokenBalance() {
        const text = wheelDocument?.querySelector('.roulette__buttons > p')?.textContent;
        const match = text?.match(/^\s*Жетонов:\s*([0-9][0-9\s]*)\s*$/i);
        if (!match) return null;

        const count = Number(match[1].replace(/\s/g, ''));
        return Number.isSafeInteger(count) ? count : null;
    }

    function closeDialog() {
        const dialog = document.getElementById(DIALOG_ID);
        if (!dialog) return;
        dialog.close();
        dialog.remove();
    }

    function showTokenSelector() {
        if (activeRun || document.getElementById(DIALOG_ID)) return;

        // Окно в основном документе: оно не обрезается границами высокого iframe.
        const dialog = document.createElement('dialog');
        dialog.id = DIALOG_ID;
        dialog.setAttribute('aria-labelledby', 'violet-atum-title');
        dialog.style.cssText = `
            position: fixed; inset: 0; margin: auto; padding: 24px;
            width: 400px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px);
            box-sizing: border-box; overflow-y: auto; background: #1c1c1c;
            color: #d0c696; border: 2px solid #d0c696; border-radius: 6px;
            font: 16px/1.5 Arial, sans-serif; text-align: left;
        `;
        dialog.innerHTML = `
            <style>
                #${DIALOG_ID}::backdrop { background: rgba(0, 0, 0, 0.7); }
                #violet-atum-quantity:focus-within { outline: 2px solid #ae72d6; outline-offset: 2px; }
                #violet-atum-count::-webkit-inner-spin-button,
                #violet-atum-count::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
                #violet-atum-count:disabled { opacity: 0.5; cursor: not-allowed; }
                #violet-atum-quantity > button {
                    flex: 0 0 46px; padding: 0; border: 0; border-radius: 0;
                    background: #7428ac; color: #fff; font: 26px/1 Arial, sans-serif; cursor: pointer;
                }
                #violet-atum-quantity > button:hover:not(:disabled) { background: #8c35c7; }
                #violet-atum-quantity > button:focus-visible { outline: 2px solid #fff; outline-offset: -4px; }
                #violet-atum-quantity > button:disabled { opacity: 0.4; cursor: not-allowed; }
                #${DIALOG_ID} #violet-atum-turbo { background: #333; border-color: #777; }
                #${DIALOG_ID} #violet-atum-turbo[aria-checked="true"] { background: #7428ac; border-color: #ae72d6; }
                #${DIALOG_ID} #violet-atum-turbo:focus-visible { outline: 2px solid #ae72d6; outline-offset: 3px; }
            </style>
            <form novalidate style="margin: 0;">
                <h2 id="violet-atum-title" style="margin: 0 0 16px; color: inherit; font: 24px/1.3 Arial, sans-serif;">Автопрокрутка</h2>
                <p id="violet-atum-balance" style="margin: 0 0 16px;"></p>
                <label for="violet-atum-count" style="display: block; margin-bottom: 8px;">Сколько жетонов потратить?</label>
                <div id="violet-atum-quantity" role="group" aria-label="Количество жетонов"
                    style="display: flex; width: 100%; height: 48px; box-sizing: border-box; overflow: hidden; border: 1px solid #7428ac; border-radius: 6px; background: #28212e;">
                    <button id="violet-atum-minus" type="button" aria-label="Уменьшить количество жетонов">−</button>
                    <input id="violet-atum-count" type="number" min="1" step="1" required autofocus
                        aria-describedby="violet-atum-balance violet-atum-error"
                        style="display: block; flex: 1; min-width: 0; width: 100%; height: 100%; box-sizing: border-box; margin: 0; padding: 8px 12px; border: 0; border-radius: 0; outline: none; appearance: textfield; background: transparent; color: #fff; color-scheme: dark; font: 600 22px Arial, sans-serif; font-variant-numeric: tabular-nums; text-align: center;">
                    <button id="violet-atum-plus" type="button" aria-label="Увеличить количество жетонов">+</button>
                </div>
                <p id="violet-atum-error" role="alert" style="min-height: 24px; margin: 8px 0 16px; color: #ffb0b0;"></p>
                <button id="violet-atum-turbo" type="button" role="switch" aria-checked="false" aria-labelledby="violet-atum-turbo-label"
                    style="display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 48px; box-sizing: border-box; margin: 0 0 20px; padding: 10px 12px; border-width: 1px; border-style: solid; border-radius: 6px; color: #fff; font: 16px/1.4 Arial, sans-serif; text-align: left; text-transform: none; cursor: pointer;">
                    <span id="violet-atum-turbo-label">Турбо режим</span>
                    <span id="violet-atum-turbo-state" aria-hidden="true" style="flex-shrink: 0; white-space: nowrap; font-weight: 700;">○ Выкл</span>
                </button>
                <div style="display: flex; justify-content: flex-end; gap: 12px; flex-wrap: wrap;">
                    <button type="submit" style="padding: 10px 20px; background: #7428ac; color: #fff; border: none; font: 16px Arial, sans-serif; cursor: pointer;">Начать</button>
                    <button id="violet-atum-cancel" type="button" style="padding: 10px 20px; background: #333; color: #fff; border: 1px solid #777; font: 16px Arial, sans-serif; cursor: pointer;">Отмена</button>
                </div>
            </form>
        `;

        const form = dialog.querySelector('form');
        const input = dialog.querySelector('#violet-atum-count');
        const turboToggle = dialog.querySelector('#violet-atum-turbo');
        turboToggle.addEventListener('click', () => {
            const enabled = turboToggle.getAttribute('aria-checked') !== 'true';
            turboToggle.setAttribute('aria-checked', String(enabled));
            dialog.querySelector('#violet-atum-turbo-state').textContent = enabled ? '✓ Вкл' : '○ Выкл';
        });
        const balanceText = dialog.querySelector('#violet-atum-balance');
        const errorText = dialog.querySelector('#violet-atum-error');
        const startButton = dialog.querySelector('[type="submit"]');
        const minusButton = dialog.querySelector('#violet-atum-minus');
        const plusButton = dialog.querySelector('#violet-atum-plus');

        function updateStepButtons() {
            const count = input.valueAsNumber;
            minusButton.disabled = input.disabled || count <= 1;
            plusButton.disabled = input.disabled || count >= Number(input.max);
        }

        function updateLimit() {
            const balance = getTokenBalance();
            balanceText.textContent = balance === null
                ? 'Не удалось определить количество жетонов.'
                : `Доступно жетонов: ${balance.toLocaleString('ru-RU')}`;
            input.max = String(balance ?? 0);
            input.disabled = balance === null || balance === 0;
            startButton.disabled = input.disabled;
            startButton.style.opacity = input.disabled ? '0.5' : '1';
            startButton.style.cursor = input.disabled ? 'not-allowed' : 'pointer';
            updateStepButtons();
            return balance;
        }

        const balance = updateLimit();
        input.value = balance > 0 ? String(balance) : '';
        updateStepButtons();

        function clearInputError() {
            errorText.textContent = '';
            input.removeAttribute('aria-invalid');
        }

        function changeCount(delta) {
            const currentBalance = updateLimit();
            if (input.disabled) return;

            const count = input.valueAsNumber;
            const nextCount = Number.isFinite(count)
                ? (delta < 0 ? Math.ceil(count) - 1 : Math.floor(count) + 1)
                : 1;
            input.value = String(Math.max(1, Math.min(currentBalance, nextCount)));
            clearInputError();
            updateStepButtons();
        }

        minusButton.addEventListener('click', () => changeCount(-1));
        plusButton.addEventListener('click', () => changeCount(1));
        input.addEventListener('input', () => {
            clearInputError();
            updateLimit();
        });
        form.addEventListener('submit', event => {
            event.preventDefault();
            const currentBalance = updateLimit();
            if (currentBalance === null || currentBalance === 0) return;

            const count = input.valueAsNumber;
            if (!Number.isSafeInteger(count) || count < 1 || count > currentBalance) {
                errorText.textContent = `Введите целое число от 1 до ${currentBalance.toLocaleString('ru-RU')}.`;
                input.setAttribute('aria-invalid', 'true');
                input.focus();
                return;
            }

            if (hasGameError() || findVisible('.roulette__overlay') || !getReadyPlayButton()) {
                errorText.textContent = 'Колесо сейчас недоступно. Дождитесь завершения вращения и закройте окна на странице.';
                return;
            }
            closeDialog();
            startAutoSpin(count, turboToggle.getAttribute('aria-checked') === 'true');
        });
        dialog.querySelector('#violet-atum-cancel').addEventListener('click', closeDialog);
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        document.body.appendChild(dialog);
        dialog.showModal();
        if (!input.disabled) input.select();
    }

    function addAutoSpinButton() {
        if (!wheelDocument || wheelDocument.getElementById(BUTTON_ID)) return;
        const playButton = wheelDocument.querySelector('.roulette__game .roulette__click');
        if (!playButton) return;

        if (!wheelDocument.getElementById(STYLE_ID)) {
            const style = wheelDocument.createElement('style');
            style.id = STYLE_ID;
            // Резервируем место под новой кнопкой, не перекрывая баланс и покупку жетонов.
            style.textContent = `
                .roulette__game:has(> #${BUTTON_ID}) { min-height: 544px; }
                .roulette__game:has(> #${BUTTON_ID}) .roulette__buttons { padding-top: 390px; }
            `;
            (wheelDocument.head || wheelDocument.documentElement).appendChild(style);
        }

        const button = wheelDocument.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.textContent = 'Автопрокрутка';
        button.style.cssText = `
            position: absolute; top: 326px; left: 50%; transform: translateX(-50%); z-index: 10;
            width: 206px; height: 44px; box-sizing: border-box; padding: 0;
            border: 2px solid #d0c696; border-radius: 0; background: #7428ac;
            color: #fff; font: normal 17px/40px HelveticaLight, Arial, sans-serif;
            text-align: center; text-transform: uppercase; cursor: pointer;
        `;
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (activeRun) stopAutoSpin('Автопрокрутка остановлена.');
            else showTokenSelector();
        });
        playButton.insertAdjacentElement('afterend', button);
        updateAutoSpinButton();
    }

    function connectWheelDocument() {
        let nextDocument = null;
        try {
            nextDocument = activeFrame?.contentDocument || null;
        } catch {
            // Не обращаемся к содержимому iframe, если сайт сменил его origin.
        }
        if (nextDocument === wheelDocument && wheelObserver) return;

        wheelObserver?.disconnect();
        wheelObserver = null;
        if (activeRun) stopAutoSpin('Страница колеса изменилась. Автопрокрутка остановлена.');
        closeDialog();
        wheelDocument = nextDocument;
        if (!wheelDocument?.documentElement) return;

        wheelObserver = new MutationObserver(addAutoSpinButton);
        wheelObserver.observe(wheelDocument.documentElement, { childList: true, subtree: true });
        addAutoSpinButton();
    }

    function connectFrame() {
        const nextFrame = document.querySelector('iframe.minigames-frame');
        if (nextFrame !== activeFrame) {
            activeFrame?.removeEventListener('load', connectWheelDocument);
            activeFrame = nextFrame;
            activeFrame?.addEventListener('load', connectWheelDocument);
        }
        connectWheelDocument();
    }

    // Сайт может вставить iframe или отрисовать само колесо после загрузки страницы.
    const pageObserver = new MutationObserver(connectFrame);
    pageObserver.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => {
        if (activeRun) {
            activeRun.stopRequested = true;
            activeRun.controller?.abort();
            if (activeRun.turbo) activeRun.frame.inert = activeRun.originalInert;
        }
        clearTimeout(runTimer);
        runTimer = null;
        activeRun = null;
    });
    connectFrame();
})();
