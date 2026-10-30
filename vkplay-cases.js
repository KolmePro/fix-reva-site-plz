(function () {
    'use strict';

    const INIT_MARKER = 'data-violet-vkplay-cases-initialized';
    const REQUEST_TIMEOUT = 45000;
    const QUEUE_TIMEOUT = 120000;
    const NATIVE_OPEN = '[data-testid="case__open-button"], [data-testid="user-case-prize-drop__open-next-button"]';
    if (document.documentElement.hasAttribute(INIT_MARKER)) return;
    document.documentElement.setAttribute(INIT_MARKER, '');

    let activeRun = null;
    let needsRefresh = false;
    const controlTargets = new WeakMap();
    const controlAnchors = new WeakMap();
    const normalizeTitle = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    const positiveInteger = value => Number.isSafeInteger(value) && value > 0;

    function currentShowcase() {
        return location.pathname.match(/^\/inventory\/(\d+)\/?$/)?.[1] || null;
    }

    function isCurrentPage(run) {
        return !run.cancelled && location.pathname === run.path;
    }

    function absoluteImage(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        try { return new URL(value, location.href).href; } catch { return ''; }
    }

    function hasNativeOpening() {
        return [...document.querySelectorAll('.b-popup__open-case')].some(popup => {
            if (!popup.isConnected || !popup.getClientRects().length || popup.querySelector('.b-open-case-prize')) return false;
            const style = getComputedStyle(popup);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });
    }

    function showProgress(run, message, finished = false) {
        let panel = document.getElementById('vkplay-case-progress');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'vkplay-case-progress';
            panel.style.cssText = 'position: fixed; left: 20px; bottom: 20px; z-index: 2147483647; width: 380px; max-width: calc(100vw - 40px); max-height: 65vh; overflow: auto; box-sizing: border-box; padding: 16px; background: #252129; color: #fff; border: 1px solid #a25bd3; border-radius: 8px; font: 14px/1.5 Arial, sans-serif;';
            panel.innerHTML = '<div data-violet-case-message role="status" aria-live="polite"></div><ul data-violet-case-rewards></ul><p data-violet-case-warning></p><button type="button" data-violet-case-stop>Стоп</button> <button type="button" data-violet-case-refresh>Обновить страницу</button>';
            panel.querySelectorAll('button').forEach(button => {
                button.style.cssText = 'background: #7428ac !important; color: #fff !important; border: 0 !important; border-radius: 4px; padding: 8px 12px; font: 14px Arial, sans-serif; cursor: pointer;';
            });
            panel.querySelector('[data-violet-case-stop]').addEventListener('click', () => {
                if (!activeRun) { panel.remove(); return; }
                activeRun.stopRequested = true;
                if (!activeRun.currentSubmitted) activeRun.controller?.abort();
                showProgress(activeRun, activeRun.currentSubmitted
                    ? 'Остановка: ожидаем результат текущего сундука. Следующие открываться не будут.'
                    : 'Останавливаемся…');
            });
            panel.querySelector('[data-violet-case-refresh]').addEventListener('click', () => {
                if (!activeRun) location.reload();
            });
            document.body.appendChild(panel);
        }
        panel.querySelector('[data-violet-case-message]').textContent = `${run.title || 'Сундуки'}${run.limit ? `: ${run.completed} / ${run.limit}` : ''}. ${message}`;
        const rewards = panel.querySelector('[data-violet-case-rewards]');
        rewards.replaceChildren();
        const sortedRewards = [...run.rewards.values()].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
        for (const reward of sortedRewards) {
            const item = document.createElement('li');
            item.textContent = `${reward.title} — ${reward.count}`;
            rewards.appendChild(item);
        }
        panel.querySelector('[data-violet-case-warning]').textContent = finished && run.currentSubmitted
            ? 'Результат последнего открытия не подтверждён. Обновите страницу и проверьте инвентарь.'
            : finished && needsRefresh ? 'Обновите страницу, чтобы синхронизировать инвентарь перед следующим запуском.' : '';
        const stop = panel.querySelector('[data-violet-case-stop]');
        stop.textContent = finished ? 'Закрыть' : run.stopRequested ? 'Остановка…' : 'Стоп';
        stop.disabled = !finished && run.stopRequested;
        const refresh = panel.querySelector('[data-violet-case-refresh]');
        refresh.hidden = !needsRefresh;
        refresh.disabled = !finished;
    }

    function updateButtons() {
        document.querySelectorAll('[data-violet-case-action]').forEach(button => {
            button.disabled = Boolean(activeRun) || needsRefresh;
            button.title = needsRefresh ? 'Сначала обновите страницу для синхронизации инвентаря.' : '';
        });
    }

    function cancelWait(run) {
        if (!run.wait) return;
        clearTimeout(run.wait.timer);
        run.wait.resolve(false);
        run.wait = null;
    }

    function waitForQueue(run, delay) {
        return new Promise(resolve => {
            run.wait = { resolve, timer: setTimeout(() => { run.wait = null; resolve(true); }, delay) };
        });
    }

    async function requestJSON(run, path, method = 'GET', options = {}) {
        if (!isCurrentPage(run)) throw new Error('Страница изменилась. Открытие остановлено.');
        const controller = new AbortController();
        run.controller = controller;
        const timer = setTimeout(() => controller.abort(), options.timeout ?? REQUEST_TIMEOUT);
        try {
            const cookies = new Map(document.cookie.split(';').map(cookie => {
                const separator = cookie.indexOf('=');
                return [cookie.slice(0, separator).trim(), cookie.slice(separator + 1)];
            }));
            const csrf = cookies.get('csrftoken_v2') ?? cookies.get('csrftoken');
            const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
            if (csrf) headers['X-CSRFToken'] = decodeURIComponent(csrf);
            const clientVersion = [...document.scripts].map(script => script.src.match(/\/market-v(\d+)-(\d+)-(\d+)\//)).find(Boolean);
            if (clientVersion) headers['Client-Agent'] = `market/${clientVersion.slice(1).join('.')}`;
            const response = await fetch(path, {
                method, headers, credentials: 'same-origin', mode: 'same-origin',
                cache: 'no-store', redirect: 'error', signal: controller.signal, body: options.body
            });
            const text = await response.text();
            let data = null;
            if (text) {
                try { data = JSON.parse(text); } catch { throw new Error('Сервер вернул непонятный ответ.'); }
            }
            const pendingStatus = response.ok || (response.status >= 400 && response.status < 500 && ![401, 403, 429].includes(response.status));
            if (options.pending && pendingStatus && data?.code === 'container_is_not_open_yet') return null;
            if (!response.ok) throw new Error(`Сервер вернул ошибку HTTP ${response.status}.`);
            if (data?.code) throw new Error('Сервер не подтвердил открытие сундука.');
            if (!options.empty && (!data || typeof data !== 'object' || Array.isArray(data))) throw new Error('Не удалось прочитать ответ сервера.');
            return data;
        } catch (error) {
            if (controller.signal.aborted) throw new Error('Истекло время ожидания ответа сервера.');
            throw error;
        } finally {
            clearTimeout(timer);
            if (run.controller === controller) run.controller = null;
        }
    }

    async function openCase(run, itemId) {
        if (!isCurrentPage(run)) throw new Error('Страница изменилась. Открытие остановлено.');
        if (hasNativeOpening()) throw new Error('Дождитесь завершения обычного открытия сундука.');
        const prefix = `/api/showcases/${run.showcase}/user_containers/${itemId}`;
        run.currentSubmitted = true;
        needsRefresh = true;
        updateButtons();
        if (!run.queued) return requestJSON(run, `${prefix}/open`, 'POST', { body: 'null' });
        const deadline = Date.now() + QUEUE_TIMEOUT;
        await requestJSON(run, `${prefix}/open_request`, 'POST', { empty: true, timeout: Math.min(REQUEST_TIMEOUT, QUEUE_TIMEOUT) });
        while (isCurrentPage(run)) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            const result = await requestJSON(run, `/api/queue/container_details/${run.showcase}/${itemId}`, 'GET', {
                pending: true, timeout: Math.min(REQUEST_TIMEOUT, remaining)
            });
            if (result) return result;
            if (Date.now() >= deadline) break;
            if (!await waitForQueue(run, Math.min(1000, deadline - Date.now()))) break;
        }
        throw new Error(isCurrentPage(run) ? 'Не удалось дождаться результата открытия.' : 'Страница изменилась. Открытие остановлено.');
    }

    async function startOpening(target) {
        const showcase = currentShowcase();
        if (activeRun || needsRefresh || !showcase) return;
        const run = {
            path: location.pathname, showcase, title: target.title, limit: 0, completed: 0,
            rewards: new Map(), seenIds: new Set(), stopRequested: false, cancelled: false,
            currentSubmitted: false, controller: null, wait: null
        };
        activeRun = run;
        updateButtons();
        showProgress(run, 'Проверяем сундуки в инвентаре…');
        let message = 'Открытие завершено.';
        try {
            if (hasNativeOpening()) throw new Error('Дождитесь завершения обычного открытия сундука.');
            const inventory = await requestJSON(run, `/api/showcases/${showcase}/postpaid_user_containers/`);
            if (run.stopRequested) return;
            if (!isCurrentPage(run)) throw new Error('Страница изменилась. Открытие остановлено.');
            if (!Array.isArray(inventory.containers)) throw new Error('Не удалось проверить список сундуков.');
            const matches = inventory.containers.filter(item => target.productId
                ? item.productId === target.productId
                : normalizeTitle(item.title) === target.title && absoluteImage(item.image) === target.image);
            if (matches.length !== 1) throw new Error('Не удалось однозначно определить выбранный сундук. Обновите страницу.');
            const selected = matches[0];
            if (!positiveInteger(selected.productId) || !positiveInteger(selected.inventoryItemId) || !positiveInteger(selected.count) ||
                !normalizeTitle(selected.title) || typeof selected.isQueueOpeningSystemEnabled !== 'boolean' ||
                (selected.isPostpaid !== undefined && typeof selected.isPostpaid !== 'boolean') ||
                (selected.isDisabled !== undefined && typeof selected.isDisabled !== 'boolean') || selected.isPostpaid || selected.isDisabled) {
                throw new Error('Этот сундук недоступен для быстрого открытия.');
            }
            run.title = normalizeTitle(selected.title);
            run.productId = selected.productId;
            run.limit = selected.count;
            run.queued = selected.isQueueOpeningSystemEnabled;
            let remaining = selected.count;
            let itemId = selected.inventoryItemId;
            while (run.completed < run.limit && !run.stopRequested && isCurrentPage(run)) {
                if (!positiveInteger(itemId) || run.seenIds.has(itemId)) throw new Error('Сервер вернул повторный или неизвестный сундук.');
                run.seenIds.add(itemId);
                showProgress(run, 'Ожидаем результат открытия…');
                const result = await openCase(run, itemId);
                if (run.cancelled) return;
                const product = result?.droppedItem?.product;
                if (!positiveInteger(product?.id) || !normalizeTitle(product.title)) {
                    throw new Error('Не удалось подтвердить награду.');
                }
                run.currentSubmitted = false;
                run.completed++;
                const title = normalizeTitle(product.title);
                const key = JSON.stringify([product.id, title]);
                const reward = run.rewards.get(key) || { title, count: 0 };
                reward.count++;
                run.rewards.set(key, reward);
                if (!Number.isSafeInteger(result.countLeft) || result.countLeft !== remaining - 1) {
                    throw new Error('Награда получена, но остаток сундуков изменился. Обновите страницу перед продолжением.');
                }
                remaining = result.countLeft;
                showProgress(run, run.stopRequested ? 'Останавливаемся…' : 'Награда получена.');
                itemId = result.nextItemId;
                if (run.completed < run.limit && (!positiveInteger(itemId) || run.seenIds.has(itemId))) {
                    throw new Error('Не удалось определить следующий сундук.');
                }
            }
            if (!isCurrentPage(run)) message = 'Страница изменилась. Открытие остановлено.';
        } catch (error) {
            message = error instanceof Error ? error.message : 'Не удалось открыть сундук.';
        } finally {
            cancelWait(run);
            if (activeRun === run) {
                activeRun = null;
                if (run.stopRequested && !run.currentSubmitted) message = 'Открытие остановлено.';
                showProgress(run, message, true);
                updateButtons();
            }
        }
    }

    function addControls(nativeButton, target) {
        const existing = nativeButton.parentElement?.querySelector('[data-violet-case-controls]');
        if (existing) {
            // React может сохранить узлы карточки или окна, заменив выбранный тип сундука.
            controlTargets.set(existing, target);
            return;
        }
        const controls = document.createElement('div');
        controlTargets.set(controls, target);
        controlAnchors.set(controls, nativeButton);
        controls.setAttribute('data-violet-case-controls', '');
        controls.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;';
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.violetCaseAction = 'all';
        button.textContent = 'Быстро открыть';
        button.style.cssText = 'background: #7428ac !important; color: #fff !important; border: 0 !important; border-radius: 4px; padding: 8px 10px; font: 13px Arial, sans-serif; cursor: pointer;';
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (button.isConnected) startOpening(controlTargets.get(controls));
        });
        controls.appendChild(button);
        nativeButton.insertAdjacentElement('afterend', controls);
    }

    function ensureControls() {
        const showcase = currentShowcase();
        document.querySelectorAll('[data-violet-case-controls]').forEach(controls => {
            const anchor = controlAnchors.get(controls);
            if (!showcase || !anchor?.isConnected || anchor.parentElement !== controls.parentElement) controls.remove();
        });
        if (!showcase) return;
        document.querySelectorAll('.b-my-cases__item').forEach(card => {
            const nativeButton = card.querySelector('[data-testid="case__open-button"]');
            const title = normalizeTitle(card.querySelector('.b-my-cases__name')?.textContent);
            const image = card.querySelector('.b-my-cases__img img')?.src;
            if (nativeButton && title && image && !card.classList.contains('b-my-cases__item--postpaid')) {
                addControls(nativeButton, { title, image: absoluteImage(image) });
            } else card.querySelector('[data-violet-case-controls]')?.remove();
        });
        document.querySelectorAll('.b-popup__open-case').forEach(popup => {
            const nativeButton = popup.querySelector('[data-testid="user-case-prize-drop__open-next-button"]');
            if (!nativeButton) { popup.querySelector('[data-violet-case-controls]')?.remove(); return; }
            const ids = new Set();
            popup.querySelectorAll('.b-social-share__item[href]').forEach(link => {
                try {
                    const shareUrl = new URL(link.href).searchParams.get('url');
                    if (!shareUrl) return;
                    const url = new URL(shareUrl);
                    const match = url.pathname.match(/^\/api\/social\/show\/\d+\/redirect\/(\d+)\/(\d+)\/$/);
                    if (url.origin === location.origin && match?.[1] === showcase && positiveInteger(Number(match[2]))) ids.add(Number(match[2]));
                } catch { /* Пропускаем неизвестный формат ссылки. */ }
            });
            if (ids.size === 1) addControls(nativeButton, { title: '', productId: [...ids][0] });
            else popup.querySelector('[data-violet-case-controls]')?.remove();
        });
        updateButtons();
    }

    function blockConcurrentOpen(event) {
        if (activeRun && event.target instanceof Element && event.target.closest(NATIVE_OPEN) &&
            (event.type === 'click' || event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }
    document.addEventListener('click', blockConcurrentOpen, true);
    document.addEventListener('keydown', blockConcurrentOpen, true);
    const observer = new MutationObserver(ensureControls);
    observer.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['src', 'href', 'class'] });
    window.addEventListener('pagehide', () => {
        if (!activeRun) return;
        activeRun.cancelled = true;
        activeRun.controller?.abort();
        cancelWait(activeRun);
        activeRun = null;
    });
    ensureControls();
})();
