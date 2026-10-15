(function () {
    'use strict';

    const INIT_MARKER = 'data-violet-chests-initialized';
    const OPTION_CLASS = 'violet-chests-option';
    const PROGRESS_ID = 'violet-chests-progress';
    const REQUEST_TIMEOUT = 30000;
    const RETRY_DELAY = 3000;
    const MAX_503_RETRIES = 3;
    if (document.documentElement.hasAttribute(INIT_MARKER)) return;
    document.documentElement.setAttribute(INIT_MARKER, '');

    let activeRun = null;
    let refreshRequired = false;
    // Новый запуск не повторяет отправленные POST. Повтор после 503 разрешён только внутри текущего цикла.
    const submittedIds = new Set();
    const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim();

    function positiveId(value) {
        if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
        return /^(?:[1-9]\d*)$/.test(String(value)) ? String(value) : null;
    }

    function chestLinks() {
        return [...document.querySelectorAll('.js-chest-list .js-chest[data-chesttype="1"]')];
    }

    function chestName(link) {
        return normalize(link.closest('.item-line')?.querySelector('.item-line__name')?.textContent);
    }

    function getContext(done) {
        if (done.dataset.chesttype !== '1' || !['1', '2'].includes(done.dataset.itemtype)) return null;
        const chestId = positiveId(done.dataset.chest);
        const link = chestLinks().find(element => element.dataset.itemid === chestId);
        const overlay = done.closest('.ovl-wrap');
        const content = done.closest('.ovl-content');
        const title = link && chestName(link);
        if (!link || !overlay || !content || !title) return null;
        return { done, link, overlay, content, chestId, title, type: done.dataset.itemtype };
    }

    function validateItems(items) {
        if (!items.length || new Set(items.map(item => item.id)).size !== items.length ||
            items.some(item => !item.id || !item.title || !item.count)) {
            throw new Error('Не удалось проверить содержимое сундука. Открытие не продолжено.');
        }
        return items;
    }

    function readItems(context) {
        return validateItems([...context.content.querySelectorAll('.js-chest-items .js-chest-item')].map(item => ({
            id: positiveId(item.dataset.itemid),
            title: normalize(item.querySelector('.pin-item__text')?.textContent),
            count: positiveId(normalize(item.querySelector('.pin-item__count span')?.textContent))
        })));
    }

    function fingerprint(type, items) {
        return JSON.stringify([type, items.map(item => [item.id, item.title, item.count])
            .sort((a, b) => a[0].localeCompare(b[0]))]);
    }

    function serverFingerprint(response) {
        const data = response?.data;
        if (response?.error || !['1', '2'].includes(String(data?.type)) ||
            !data?.items || typeof data.items !== 'object') {
            throw new Error('Сервер не вернул содержимое сундука. Открытие остановлено.');
        }
        // Штатный $.each поддерживает как массив, так и объект с ключами-ID.
        const items = validateItems(Object.values(data.items).map(item => ({
            id: positiveId(item?.id), title: normalize(item?.title), count: positiveId(item?.count)
        })));
        return fingerprint(String(data.type), items);
    }

    function requireOpenSuccess(response) {
        // Штатный обработчик проверяет 1 == status, включая логическое true.
        if ([1, '1', true].includes(response?.status)) return;

        const detail = [response?.message, response?.error]
            .find(value => typeof value === 'string' && normalize(value));
        if (detail) {
            // Только текст в нашем окне: не исполняем HTML и не выводим ответ в консоль.
            throw new Error(`Сервер не подтвердил открытие сундука: ${normalize(detail).slice(0, 500)}`);
        }
        const status = response?.status;
        const description = ['string', 'number', 'boolean'].includes(typeof status)
            ? normalize(status).slice(0, 40) : 'не указан';
        throw new Error(`Сервер не подтвердил открытие сундука (статус: ${description}).`);
    }

    function addOptions() {
        for (const done of document.querySelectorAll('.ovl-wrap .js-chest-done')) {
            const context = getContext(done);
            if (!context || context.content.querySelector(`.${OPTION_CLASS}`)) continue;
            const action = done.closest('.text-center');
            if (!action) continue;
            const option = document.createElement('div');
            option.className = OPTION_CLASS;
            option.style.cssText = 'margin: 16px 0; text-align: center;';
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.setAttribute('role', 'checkbox');
            toggle.setAttribute('aria-checked', 'false');
            toggle.setAttribute('aria-label', 'Открыть все такие сундуки');
            toggle.textContent = '☐ Открыть все такие сундуки';
            toggle.title = 'Открыть одинаковые сундуки с тем же выбором награды.';
            toggle.style.cssText = `
                display: inline-block !important; position: relative; max-width: 100%;
                box-sizing: border-box; padding: 10px 16px; border: 1px solid #ae72d6;
                background: #7428ac !important; color: #fff !important; opacity: 1 !important;
                font: 16px/1.4 Arial, sans-serif; white-space: normal; cursor: pointer;
            `;
            toggle.addEventListener('click', () => {
                const enabled = toggle.getAttribute('aria-checked') !== 'true';
                toggle.setAttribute('aria-checked', String(enabled));
                toggle.textContent = `${enabled ? '☑' : '☐'} Открыть все такие сундуки`;
            });
            const error = document.createElement('p');
            error.setAttribute('role', 'alert');
            error.style.cssText = 'margin: 8px 0 0; color: #ffb0b0;';
            option.append(toggle, error);
            action.before(option);
        }
    }

    function showProgress(run, message) {
        run.dialog.querySelector('[role="status"]').textContent = `Открыто: ${run.completed} / ${run.ids.length}. ${message}`;
    }

    function cancelRetryWait(run) {
        const wait = run.retryWait;
        if (!wait) return;
        run.retryWait = null;
        clearTimeout(wait.timer);
        wait.resolve(false);
    }

    async function waitFor503Retry(run, attempt) {
        if (activeRun !== run || run.stopRequested) return false;
        showProgress(run, `Сервер вернул HTTP 503. Повтор через 3 секунды (${attempt}/${MAX_503_RETRIES})…`);
        const elapsed = await new Promise(resolve => {
            run.retryWait = {
                resolve,
                timer: setTimeout(() => {
                    run.retryWait = null;
                    resolve(true);
                }, RETRY_DELAY)
            };
        });
        return elapsed && activeRun === run && !run.stopRequested;
    }

    function requestStop(run) {
        if (activeRun !== run || run.stopRequested) return;
        run.stopRequested = true;
        run.dialog.querySelector('button').disabled = true;
        run.dialog.querySelector('button').textContent = 'Остановка…';
        showProgress(run, run.controller
            ? 'Ожидаем текущий ответ. Следующий сундук открываться не будет.'
            : 'Останавливаем открытие. Повторный запрос отправляться не будет.');
        cancelRetryWait(run);
    }

    function createProgress(run) {
        document.getElementById(PROGRESS_ID)?.remove();
        const dialog = document.createElement('dialog');
        dialog.id = PROGRESS_ID;
        dialog.setAttribute('aria-labelledby', 'violet-chests-title');
        dialog.style.cssText = `
            position: fixed; inset: 0; margin: auto; width: 440px;
            max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow-y: auto;
            box-sizing: border-box; padding: 24px; border: 1px solid #7428ac; border-radius: 6px;
            background: #1c1c1c; color: #fff; font: 16px/1.5 Arial, sans-serif; text-align: left;
        `;
        dialog.innerHTML = `
            <style>#${PROGRESS_ID}::backdrop { background: rgba(0, 0, 0, 0.7); }</style>
            <h2 id="violet-chests-title" style="margin: 0 0 16px; color: inherit; font: 22px/1.3 Arial, sans-serif;">Открытие сундуков</h2>
            <p class="violet-chests-name" style="margin: 0 0 12px;"></p>
            <p class="violet-chests-choice" style="margin: 0 0 16px;"></p>
            <p role="status" aria-live="polite" style="margin: 0 0 16px;"></p>
            <button type="button" style="padding: 10px 20px; border: 0; background: #7428ac; color: #fff; font: 16px Arial, sans-serif; cursor: pointer;">Стоп</button>
        `;
        dialog.querySelector('.violet-chests-name').textContent = run.title;
        dialog.querySelector('.violet-chests-choice').textContent = `Награда: ${run.selected.map(item => `${item.title} ×${item.count}`).join(', ')}`;
        dialog.querySelector('button').addEventListener('click', () => {
            if (activeRun === run) requestStop(run);
            else dialog.close();
        });
        dialog.addEventListener('cancel', event => {
            if (activeRun === run) {
                event.preventDefault();
                requestStop(run);
            }
        });
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        document.body.appendChild(dialog);
        dialog.showModal();
        return dialog;
    }

    async function requestJSON(run, url, body) {
        const controller = new AbortController();
        run.controller = controller;
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
        try {
            const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
            if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
            const response = await fetch(url, {
                method: body ? 'POST' : 'GET', headers, body,
                credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error',
                signal: controller.signal
            });
            if (!response.ok) {
                const error = new Error(`Сервер вернул HTTP ${response.status}. Открытие остановлено.`);
                error.status = response.status;
                throw error;
            }
            return await response.json();
        } catch (error) {
            if (controller.signal.aborted) throw new Error('Истекло время ожидания ответа сервера.');
            if (error instanceof SyntaxError || error instanceof TypeError) {
                throw new Error('Не удалось получить корректный ответ сервера.');
            }
            throw error;
        } finally {
            clearTimeout(timer);
            run.controller = null;
        }
    }

    function isCurrentPage(run) {
        return run.list.isConnected && run.storage.isConnected && run.dialog.isConnected;
    }

    function updateInventory(run, chestId, response) {
        if (!isCurrentPage(run)) throw new Error('Хранилище изменилось во время открытия.');
        const received = run.selected.map(item => ({ ...item, cartId: positiveId(response.itemid?.[item.id]) }));
        if (received.some(item => !item.cartId) || new Set(received.map(item => item.cartId)).size !== received.length) {
            throw new Error('Сундук открыт, но не удалось обновить список полученных предметов.');
        }
        const existing = new Set([...document.querySelectorAll('.js-item-add')].map(item => item.dataset.itemid));
        const fragment = document.createDocumentFragment();
        for (const item of received) {
            if (existing.has(item.cartId)) continue;
            const row = document.createElement('div');
            row.className = 'item-line';
            if (document.querySelector('.js-lootdog-filter-on')) row.classList.add('none');
            const name = document.createElement('div');
            name.className = 'item-line__name';
            name.textContent = item.title;
            const count = document.createElement('div');
            count.className = 'item-line__num';
            count.textContent = item.count;
            const add = document.createElement('div');
            add.className = 'b-link js-item-add';
            add.dataset.itemid = item.cartId;
            row.append(name, count, add);
            fragment.appendChild(row);
        }
        run.storage.querySelectorAll(':scope > p').forEach(element => element.remove());
        run.storage.prepend(fragment);
        chestLinks().filter(link => link.dataset.itemid === chestId).forEach(link => link.closest('.item-line')?.remove());
    }

    async function openAll(run) {
        let message = 'Открытие завершено.';
        try {
            for (const chestId of run.ids) {
                if (activeRun !== run) return;
                if (run.stopRequested) break;
                if (submittedIds.has(chestId)) {
                    throw new Error('Список сундуков изменился. Открытие остановлено.');
                }
                let retries = 0;
                while (activeRun === run && !run.stopRequested) {
                    try {
                        if (!isCurrentPage(run)) throw new Error('Страница хранилища изменилась.');
                        const link = chestLinks().find(element => element.dataset.itemid === chestId);
                        if (!link || chestName(link) !== run.title ||
                            link.closest('.disabled, [aria-disabled="true"]')) {
                            throw new Error('Список сундуков изменился. Открытие остановлено.');
                        }
                        // После 503 заново проверяем тот же ID и выбор награды перед повторным POST.
                        showProgress(run, 'Проверяем содержимое следующего сундука…');
                        const contents = await requestJSON(run, `/cart/_chestitems/1/${chestId}`);
                        if (activeRun !== run) return;
                        if (run.stopRequested) break;
                        if (serverFingerprint(contents) !== run.fingerprint) {
                            if (run.uncertain || chestId === run.ids[0]) {
                                throw new Error('Содержимое сундука не совпадает с открытым окном. Откройте его заново.');
                            }
                            run.skipped++;
                            break;
                        }
                        if (!isCurrentPage(run) || !link.isConnected) throw new Error('Страница хранилища изменилась.');
                        showProgress(run, 'Открываем сундук…');
                        // Перехватываем также первый клик: штатный обработчик не отправляет второй POST.
                        submittedIds.add(chestId);
                        run.uncertain = true;
                        const response = await requestJSON(run, '/cart/_chestopen', new URLSearchParams({
                            chestid: chestId, itemid: run.type === '1' ? run.selected[0].id : '1', type: '1'
                        }));
                        if (activeRun !== run) return;
                        requireOpenSuccess(response);
                        run.completed++;
                        updateInventory(run, chestId, response);
                        run.uncertain = false;
                        showProgress(run, 'Награда добавлена в хранилище.');
                        break;
                    } catch (error) {
                        if (error.status !== 503 || retries >= MAX_503_RETRIES || run.stopRequested) throw error;
                        if (!await waitFor503Retry(run, ++retries)) break;
                    }
                }
            }
            if (run.stopRequested) message = 'Остановлено.';
            if (run.skipped) message += ` Пропущено сундуков с другим содержимым: ${run.skipped}.`;
        } catch (error) {
            message = error instanceof Error ? error.message : 'Открытие остановлено из-за ошибки.';
        }
        if (activeRun !== run) return;
        if (run.uncertain) {
            refreshRequired = true;
            message += ' Результат последней попытки не подтверждён. Обновите страницу перед дальнейшим открытием.';
        }
        activeRun = null;
        showProgress(run, message);
        const button = run.dialog.querySelector('button');
        button.disabled = false;
        button.textContent = 'Закрыть';
    }

    function startBulk(context) {
        const items = readItems(context);
        const checked = [...context.content.querySelectorAll('.js-items-input:checked')];
        const selected = context.type === '1' ? items.filter(item => item.id === checked[0]?.value) : items;
        if ((context.type === '1' && checked.length !== 1) || !selected.length) {
            throw new Error('Сначала выберите предмет, который хотите получить из каждого сундука.');
        }
        if (context.done.closest('.btn')?.matches('.disabled, [disabled], [aria-disabled="true"]')) {
            throw new Error('Кнопка открытия пока недоступна. Выберите награду заново.');
        }
        const storage = document.querySelector('.js-items-list');
        const close = context.overlay.querySelector('.js-ovl-close');
        if (!storage || !close) throw new Error('Не удалось подготовить окно открытия. Обновите страницу.');
        const ids = [...new Set([context.chestId, ...chestLinks()
            .filter(link => chestName(link) === context.title).map(link => positiveId(link.dataset.itemid))])];
        if (ids.some(id => !id || submittedIds.has(id))) throw new Error('Список сундуков устарел. Обновите страницу.');
        const run = {
            title: context.title, type: context.type, selected, ids,
            fingerprint: fingerprint(context.type, items), storage, list: context.link.closest('.js-chest-list'),
            completed: 0, skipped: 0, stopRequested: false, uncertain: false, controller: null, retryWait: null
        };
        run.dialog = createProgress(run);
        activeRun = run;
        // Закрываем только исходное окно; остальные сундуки открываются исключительно запросами.
        close.click();
        openAll(run);
    }

    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        const done = target?.closest('.js-chest-done');
        const chest = target?.closest('.js-chest');
        if (!done && !chest) return;
        if (activeRun) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        const chestId = done?.dataset.chest || chest?.dataset.itemid;
        const isChest = done?.dataset.chesttype === '1' || Boolean(chest?.closest('.js-chest-list'));
        if (isChest && (refreshRequired || submittedIds.has(chestId))) {
            event.preventDefault();
            event.stopImmediatePropagation();
            window.alert('Список сундуков мог устареть. Обновите страницу перед дальнейшим открытием.');
            return;
        }
        const option = done?.closest('.ovl-content')?.querySelector(`.${OPTION_CLASS}`);
        if (option?.querySelector('[role="checkbox"]')?.getAttribute('aria-checked') !== 'true') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
            const context = getContext(done);
            if (!context) throw new Error('Этот сундук больше не найден в хранилище. Обновите страницу.');
            startBulk(context);
        } catch (error) {
            option.querySelector('[role="alert"]').textContent = error instanceof Error ? error.message : 'Не удалось начать открытие.';
        }
    }, true);

    const observer = new MutationObserver(addOptions);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    addOptions();
    window.addEventListener('pagehide', () => {
        if (activeRun) {
            activeRun.stopRequested = true;
            cancelRetryWait(activeRun);
            activeRun.controller?.abort();
            activeRun = null;
        }
        observer.disconnect();
    });
})();
