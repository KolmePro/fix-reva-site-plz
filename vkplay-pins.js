(function() {
    'use strict';

    const INIT_MARKER = 'data-violet-vkplay-initialized';
    const PIN_OPEN_SELECTOR = '.b-my-pin_inventory button[data-testid="user-items-presenter-pin_code_activation"]';
    const REQUEST_TIMEOUT = 45000;
    let openingRun = null;
    let openingNeedsRefresh = false;
    let copyRun = null;

    if (document.documentElement.hasAttribute(INIT_MARKER)) return;
    document.documentElement.setAttribute(INIT_MARKER, '');

    console.log('[VKPlay Pins Helper] loaded');

    function createCopyPopup(run) {
        const popup = document.createElement('div');
        popup.id = 'vkplay-pins-copy-popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-labelledby', 'vkplay-pins-copy-title');
        popup.tabIndex = -1;
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1e1e1e;
            padding: 20px;
            border: 1px solid #444;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            z-index: 2147483647;
            border-radius: 8px;
            max-width: 600px;
            width: 90%;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-sizing: border-box;
            text-align: center;
            color: #fff;
            font-family: Arial, sans-serif;
        `;
        popup.innerHTML = `
            <style>
                #vkplay-pins-copy-popup [hidden] { display: none !important; }
                #vkplay-pins-copy-popup button:disabled { opacity: 0.5; cursor: default !important; }
                #vkplay-pins-copy-popup [data-vkplay-copy-help] { position: relative; display: inline-flex; margin-left: auto; }
                #vkplay-pins-copy-popup [role="tooltip"] { position: absolute; top: calc(100% + 6px); right: 0; z-index: 1; width: 270px; max-width: calc(90vw - 80px); box-sizing: border-box; padding: 10px; border: 1px solid #9260b6; border-radius: 4px; background: #30203c; color: #fff; font: 13px/1.5 Arial, sans-serif; visibility: hidden; }
                #vkplay-pins-copy-popup [data-vkplay-copy-help]:hover [role="tooltip"],
                #vkplay-pins-copy-popup [data-vkplay-copy-help]:focus-within [role="tooltip"] { visibility: visible; }
            </style>
            <div style="flex: none; margin-bottom: 15px;">
                <h3 id="vkplay-pins-copy-title" style="margin: 0;">Неактивированные ПИН-коды</h3>
            </div>
            <div data-vkplay-copy-body style="min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 2px; text-align: left;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <label for="vkplay-pins-page-mode">Просматривать страницы</label>
                <span data-vkplay-copy-help>
                    <button type="button" data-vkplay-copy-help-button aria-label="Как работает автоматический просмотр" aria-describedby="vkplay-pins-page-mode-help" style="background: #30203c !important; color: #fff !important; border: 1px solid #9260b6 !important; border-radius: 50%; width: 24px; height: 24px; padding: 0; cursor: help; font: bold 14px Arial, sans-serif;">?</button>
                    <span role="tooltip" id="vkplay-pins-page-mode-help">В автоматическом режиме просмотр заканчивается на первой странице, где все ПИН-коды уже использованы.</span>
                </span>
            </div>
            <select id="vkplay-pins-page-mode" style="all: revert !important; display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 10px !important; margin-bottom: 12px !important; border: 1px solid #744591 !important; border-radius: 4px !important; background: #2d2d2d !important; color: #fff !important; font: 14px Arial, sans-serif !important;">
                <option value="all">Все страницы</option>
                <option value="count">Указанное количество</option>
                <option value="auto" selected>Автоматически</option>
            </select>
            <label data-vkplay-copy-page-count-wrap for="vkplay-pins-page-count" hidden style="display: block; margin-bottom: 12px;">
                Количество страниц
                <input id="vkplay-pins-page-count" type="number" min="1" step="1" value="1" disabled style="all: revert !important; display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 10px !important; margin-top: 8px !important; border: 1px solid #744591 !important; border-radius: 4px !important; background: #2d2d2d !important; color: #fff !important; font: 14px Arial, sans-serif !important;">
            </label>
            <button type="button" data-vkplay-copy-load>Загрузить ПИН-коды</button>
            <p data-vkplay-copy-status role="status" style="margin-bottom: 15px; color: #ccc; font-size: 14px;">
                Выберите режим просмотра и нажмите «Загрузить ПИН-коды».
            </p>
            <label style="display: flex !important; align-items: center; gap: 8px; margin-bottom: 12px; cursor: pointer;">
                <input id="vkplay-pins-group-by-reward" type="checkbox" disabled style="all: revert !important; accent-color: #7428ac !important; width: 16px !important; height: 16px !important; margin: 0 !important;">
                Сгруппировать по наградам
            </label>
            <textarea aria-label="ПИН-коды для копирования" readonly disabled style="
                width: 100%;
                height: 260px;
                resize: vertical;
                box-sizing: border-box;
                margin-bottom: 15px;
                padding: 10px;
                border-radius: 4px;
                border: 1px solid #444;
                background: #2d2d2d;
                color: #fff;
            "></textarea>
            <p style="font-size: 13px; color: #ccc;">Заголовки групп начинаются с # и пропускаются при массовой активации.</p>
            </div>
            <div style="display: flex; flex: none; justify-content: center; flex-wrap: wrap; gap: 10px; padding-top: 15px;">
            <button type="button" data-vkplay-copy-clipboard disabled>Скопировать</button>
            <button type="button" data-vkplay-copy-close>Закрыть</button>
            </div>
        `;
        popup.querySelectorAll('button:not([data-vkplay-copy-help-button])').forEach(button => {
            button.style.cssText = 'background: #7428ac !important; color: #fff !important; border: 0 !important; padding: 10px 20px; border-radius: 4px; cursor: pointer; font: 14px Arial, sans-serif;';
        });
        run.popup = popup;
        run.output = popup.querySelector('textarea');
        run.grouping = popup.querySelector('#vkplay-pins-group-by-reward');
        run.status = popup.querySelector('[data-vkplay-copy-status]');
        run.modeInput = popup.querySelector('#vkplay-pins-page-mode');
        run.countInput = popup.querySelector('#vkplay-pins-page-count');
        run.modeInput.addEventListener('change', () => resetCopyOptions(run));
        run.countInput.addEventListener('input', () => resetCopyOptions(run));
        popup.querySelector('[data-vkplay-copy-load]').addEventListener('click', () => loadCopiedPins(run));
        run.grouping.addEventListener('change', () => renderCopiedPins(run));
        popup.querySelector('[data-vkplay-copy-clipboard]').addEventListener('click', async () => {
            if (run.loading || run.cancelled) return;
            // A PIN can expire while the user is reviewing the loaded list.
            renderCopiedPins(run);
            if (!run.entries.length) return;
            const revision = run.resultRevision;
            const count = run.entries.length;
            const isCurrent = () => !run.cancelled && !run.loading && run.resultRevision === revision;
            try {
                await navigator.clipboard.writeText(run.output.value);
                if (isCurrent()) run.status.textContent = `${copyScopeText(run)} Скопировано ПИН-кодов: ${count}.`;
            } catch {
                if (!isCurrent()) return;
                run.output.focus();
                run.output.select();
                run.status.textContent = 'Нажмите Ctrl+C, чтобы скопировать выделенные ПИН-коды.';
            }
        });
        popup.querySelector('[data-vkplay-copy-close]').addEventListener('click', () => closeCopyPopup(run));
        popup.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeCopyPopup(run);
            }
        });
        document.body.appendChild(popup);
        popup.focus();
    }

    function clearCopiedPins(run) {
        run.resultRevision++;
        run.entries.length = 0;
        run.pagesLoaded = 0;
        run.output.value = '';
        run.output.disabled = true;
        run.grouping.disabled = true;
        run.popup.querySelector('[data-vkplay-copy-clipboard]').disabled = true;
    }

    function updateCopyOptions(run) {
        const limited = run.modeInput.value === 'count';
        run.modeInput.disabled = run.loading;
        run.countInput.disabled = run.loading || !limited;
        run.popup.querySelector('[data-vkplay-copy-page-count-wrap]').hidden = !limited;
        const load = run.popup.querySelector('[data-vkplay-copy-load]');
        load.disabled = run.loading;
        load.textContent = run.loading ? 'Загружаем…' : 'Загрузить ПИН-коды';
    }

    function resetCopyOptions(run) {
        if (run.loading || run.cancelled) return;
        clearCopiedPins(run);
        updateCopyOptions(run);
        run.status.textContent = 'Нажмите «Загрузить ПИН-коды», чтобы просмотреть страницы с выбранными настройками.';
    }

    function copyScopeText(run) {
        return `Просмотрено страниц: ${run.pagesLoaded}${run.pageMode === 'count' ? ` (лимит: ${run.pageLimit})` : ''}.`;
    }

    function closeCopyPopup(run) {
        run.cancelled = true;
        run.controller?.abort();
        clearCopiedPins(run);
        run.popup.remove();
        if (copyRun === run) copyRun = null;
        updateOpeningControls();
    }

    function renderCopiedPins(run) {
        if (run.loading || run.cancelled) return;
        const now = Date.now();
        run.entries = run.entries.filter(entry => entry.expiresAt === null || entry.expiresAt > now);
        run.resultRevision++;
        run.grouping.disabled = !run.entries.length;
        run.popup.querySelector('[data-vkplay-copy-clipboard]').disabled = !run.entries.length;
        if (run.grouping.checked) {
            const groups = new Map();
            for (const entry of run.entries) {
                if (!groups.has(entry.title)) groups.set(entry.title, []);
                groups.get(entry.title).push(entry.code);
            }
            run.output.value = [...groups.entries()]
                .sort(([a], [b]) => a.localeCompare(b, 'ru'))
                .map(([title, codes]) => `# ${title}\n${codes.join('\n')}`).join('\n\n');
        } else {
            run.output.value = run.entries.map(entry => entry.code).join('\n');
        }
        run.status.textContent = `${copyScopeText(run)} ${run.entries.length
            ? `Найдено неактивированных ПИН-кодов: ${run.entries.length}.`
            : 'На просмотренных страницах неактивированных ПИН-кодов нет.'}`;
    }

    function pinExpirationTime(code) {
        // VK Play renders code.expiredAt as the PIN's "valid until" date.
        // Only interpret explicit ISO timestamps with a timezone; other values are unknown.
        if (typeof code?.expiredAt !== 'string') return null;
        const value = code.expiredAt.trim();
        const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);
        if (!parts) return null;
        const [year, month, day] = parts.slice(1).map(Number);
        const daysInMonth = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) return null;
        const expiresAt = Date.parse(value);
        return Number.isFinite(expiresAt) ? expiresAt : null;
    }

    async function collectUnusedPins(run) {
        const enabledTypes = new Set(['activateInstruction', 'activate', 'redirect', 'download']);
        const pages = new Set();
        const recordIds = new Set();
        const codes = new Set();
        const entries = [];
        let url = new URL(run.endpoint, location.origin);
        while (url) {
            checkPinRun(run);
            if (pages.has(url.href)) throw new Error('Сервер повторил страницу ПИН-кодов.');
            pages.add(url.href);
            const page = await requestPinJSON(run, url.href);
            checkPinRun(run);
            if (!Array.isArray(page.results)) throw new Error('Не удалось прочитать список ПИН-кодов.');
            for (const record of page.results) {
                const id = record?.id;
                if (!(Number.isSafeInteger(id) && id > 0) && !(typeof id === 'string' && id.trim())) {
                    throw new Error('Не удалось определить записи в списке ПИН-кодов.');
                }
                if (recordIds.has(String(id))) throw new Error('Список ПИН-кодов изменился во время загрузки. Попробуйте ещё раз.');
                recordIds.add(String(id));
                const code = record.code;
                if (!enabledTypes.has(code?.buttonType)) continue;
                const expiresAt = pinExpirationTime(code);
                if (expiresAt !== null && expiresAt <= Date.now()) continue;
                const values = record.isUEC
                    ? [code.keys?.activation, ...(Array.isArray(code.keys?.additional) ? code.keys.additional.map(item => item?.key) : [])]
                    : [code.code];
                const title = typeof record.product?.title === 'string'
                    ? record.product.title.replace(/\s+/g, ' ').trim() || 'Без названия награды'
                    : 'Без названия награды';
                for (const value of values) {
                    if (typeof value !== 'string' || !value.trim() || codes.has(value.trim())) continue;
                    codes.add(value.trim());
                    entries.push({ title, code: value.trim(), expiresAt });
                }
            }
            if (page.next != null && !page.results.length) throw new Error('Сервер вернул пустую промежуточную страницу ПИН-кодов.');
            run.pagesLoaded = pages.size;
            run.status.textContent = `Загружено страниц: ${pages.size}. Неактивированных ПИН-кодов: ${entries.length}…`;
            if (run.pageMode === 'count' && pages.size >= run.pageLimit) break;
            if (run.pageMode === 'auto' && page.results.length && page.results.every(record => record.code?.buttonType === 'pinCodeIsUsed')) break;
            url = page.next == null ? null : nextInventoryURL(run, page.next);
        }
        return entries;
    }

    function startCopying() {
        if (openingRun) return;
        if (copyRun) {
            if (copyRun.popup.isConnected) { copyRun.popup.focus(); return; }
            closeCopyPopup(copyRun);
        }
        const showcase = location.pathname.match(/^\/(?:inventory_code|inventory|game|shop)\/(\d+)\/?$/)?.[1];
        if (!showcase) {
            setOpeningStatus('Откройте инвентарь или раздел ПИН-кодов нужной игры.');
            return;
        }
        const run = {
            copying: true, path: location.pathname, endpoint: `/api/showcases/${showcase}/pin_codes/`,
            scope: { search: '', filters: '', rarity: '' }, entries: [], loading: false, cancelled: false, controller: null,
            pageMode: 'auto', pageLimit: null, pagesLoaded: 0, resultRevision: 0
        };
        copyRun = run;
        createCopyPopup(run);
        updateOpeningControls();
    }

    async function loadCopiedPins(run) {
        if (copyRun !== run || run.loading || run.cancelled) return;
        const pageMode = run.modeInput.value;
        const pageLimit = pageMode === 'count' ? run.countInput.valueAsNumber : null;
        if (!['auto', 'all', 'count'].includes(pageMode)) return;
        if (pageMode === 'count' && (!Number.isSafeInteger(pageLimit) || pageLimit < 1 || !run.countInput.validity.valid)) {
            run.status.textContent = 'Введите целое количество страниц от 1.';
            run.countInput.focus();
            return;
        }
        clearCopiedPins(run);
        run.pageMode = pageMode;
        run.pageLimit = pageLimit;
        run.loading = true;
        run.status.textContent = 'Загружаем ПИН-коды с выбранных страниц…';
        updateCopyOptions(run);
        updateOpeningControls();
        try {
            run.entries = await collectUnusedPins(run);
            checkPinRun(run);
            run.loading = false;
            run.output.disabled = false;
            run.grouping.disabled = !run.entries.length;
            run.popup.querySelector('[data-vkplay-copy-clipboard]').disabled = !run.entries.length;
            renderCopiedPins(run);
        } catch (error) {
            clearCopiedPins(run);
            if (!run.cancelled && run.popup.isConnected) {
                run.status.textContent = error instanceof Error ? error.message : 'Не удалось загрузить ПИН-коды.';
            } else closeCopyPopup(run);
        } finally {
            run.loading = false;
            if (!run.cancelled) updateCopyOptions(run);
            updateOpeningControls();
        }
    }

    function ensureButtonPanel() {
        let panel = document.querySelector('#vkplay-pins-panel');
        if (panel) return panel;

        panel = document.createElement('div');
        panel.id = 'vkplay-pins-panel';
        panel.style.cssText = `
            position: fixed !important;
            left: auto !important;
            right: 20px !important;
            top: auto !important;
            bottom: 20px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
            margin: 0 !important;
            padding: 12px !important;
            background: rgba(48, 48, 48, 0.92) !important;
            border: 1px solid #6b6b6b !important;
            border-radius: 8px !important;
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35) !important;
            z-index: 2147483647 !important;
        `;
        document.body.appendChild(panel);
        return panel;
    }

    function applyButtonStyles(button) {
        button.style.cssText = `
            background: #7428ac !important;
            color: #fff !important;
            border: none !important;
            padding: 10px 20px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            font-size: 14px !important;
            width: 260px !important;
            text-align: left !important;
            margin: 0 !important;
            position: static !important;
        `;
    }

    function bindCopyButton(button) {
        if (button.dataset.vkplayPinsBound === 'copy') return;
        button.dataset.vkplayPinsBound = 'copy';
        button.type = 'button';
        button.addEventListener('click', startCopying);
    }

    function bindOpenButton(button) {
        if (button.dataset.vkplayPinsBound === 'open') return;
        button.dataset.vkplayPinsBound = 'open';
        button.type = 'button';
        button.addEventListener('click', () => {
            if (openingRun) {
                openingRun.stopping = true;
                if (!openingRun.submitted) openingRun.controller?.abort();
                renderOpening(openingRun, 'Останавливаем… Ждём завершения текущего запроса.');
                return;
            }
            startOpening();
        });
    }

    function setOpeningStatus(message) {
        let status = document.querySelector('#vkplay-pins-status');
        if (!status) {
            status = document.createElement('div');
            status.id = 'vkplay-pins-status';
            status.setAttribute('role', 'status');
            status.style.cssText = 'width: 260px !important; color: #fff !important; font: 13px/1.4 Arial, sans-serif !important;';
            ensureButtonPanel().appendChild(status);
        }
        if (status.textContent !== message) status.textContent = message;
    }

    function updateOpeningControls() {
        const copy = document.querySelector('#copy-pins-button');
        if (copy) {
            const label = copyRun?.loading ? 'Загружаем ПИН-коды…' : 'Скопировать все ПИН-коды';
            if (copy.textContent !== label) copy.textContent = label;
            copy.disabled = Boolean(openingRun) || Boolean(copyRun?.loading);
        }
        const button = document.querySelector('#open-all-pins-button');
        if (button) {
            const label = openingRun
                ? openingRun.stopping ? 'Останавливаем…' : `Остановить (получено: ${openingRun.received})`
                : 'Открыть все ПИН-коды';
            if (button.textContent !== label) button.textContent = label;
            button.disabled = Boolean(copyRun) || (!openingRun && openingNeedsRefresh);
        }
    }

    function renderOpening(run, message) {
        updateOpeningControls();
        const progress = run.total === null ? String(run.received) : `${run.received} / ${run.total}`;
        setOpeningStatus(`${message} Получено: ${progress}.`);
    }

    function readInventoryScope() {
        const params = new URL(location.href).searchParams;
        const search = document.querySelector('.b-game__top-filter .b-input_search')?.value ?? params.get('search') ?? '';
        const select = document.querySelector('.b-select_inventory .b-select__default');
        const label = select?.textContent.replace(/\s+/g, ' ').trim();
        const rarities = new Map([
            ['Показать все товары', ''], ['Показать редкие', 'rare'], ['Показать обычные', 'common'],
            ['Show all items', ''], ['Show rare', 'rare'], ['Show common', 'common']
        ]);
        if (select && !rarities.has(label)) throw new Error('Не удалось определить текущий фильтр инвентаря.');
        return { search, filters: params.get('filters') || '', rarity: select ? rarities.get(label) : '' };
    }

    function checkPinRun(run) {
        if (run.copying) {
            if (run.cancelled || !run.popup.isConnected || location.pathname !== run.path) {
                throw new Error('Копирование остановлено: окно закрыто или страница изменилась.');
            }
            return;
        }
        const scope = readInventoryScope();
        if (run.cancelled || location.pathname !== run.path ||
            Object.keys(run.scope).some(key => scope[key] !== run.scope[key])) {
            throw new Error('Страница или фильтры изменились. Получение остановлено.');
        }
        if (run.stopping) throw new Error('Получение остановлено.');
    }

    async function requestPinJSON(run, url, method = 'GET') {
        checkPinRun(run);
        const controller = new AbortController();
        run.controller = controller;
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
        try {
            const cookies = new Map(document.cookie.split(';').map(cookie => {
                const separator = cookie.indexOf('=');
                return [cookie.slice(0, separator).trim(), cookie.slice(separator + 1)];
            }));
            const csrf = cookies.get('csrftoken_v2') ?? cookies.get('csrftoken');
            const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
            if (csrf) headers['X-CSRFToken'] = decodeURIComponent(csrf);
            const version = [...document.scripts].map(script => script.src.match(/\/market-v(\d+)-(\d+)-(\d+)\//)).find(Boolean);
            if (version) headers['Client-Agent'] = `market/${version.slice(1).join('.')}`;
            if (method === 'POST') {
                run.submitted = true;
                openingNeedsRefresh = true;
                updateOpeningControls();
            }
            const response = await fetch(url, {
                method, headers, credentials: 'same-origin', mode: 'same-origin', redirect: 'error',
                cache: 'no-store', signal: controller.signal, body: method === 'POST' ? 'null' : undefined
            });
            if (!response.ok) throw new Error(`Сервер вернул ошибку HTTP ${response.status}.`);
            let data;
            try { data = await response.json(); } catch { throw new Error('Сервер вернул непонятный ответ.'); }
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Не удалось прочитать ответ сервера.');
            return data;
        } catch (error) {
            if (controller.signal.aborted) {
                throw new Error(run.stopping && method === 'GET' ? 'Получение остановлено.' : 'Истекло время ожидания ответа сервера.');
            }
            // Do not include response bodies, PINs, or account details in error messages.
            if (error instanceof TypeError) throw new Error('Ошибка соединения с сервером.');
            throw error;
        } finally {
            clearTimeout(timer);
            if (run.controller === controller) run.controller = null;
        }
    }

    function nextInventoryURL(run, next) {
        if (typeof next !== 'string' || !next.trim()) throw new Error('Не удалось прочитать следующую страницу инвентаря.');
        // Match the site's Axios baseURL resolution for server-provided pagination links.
        const absolute = /^([a-z][a-z\d+\-.]*:)?\/\//i.test(next);
        const url = new URL(absolute ? next : `${location.origin}/api/${next.replace(/^\/+/, '')}`, location.origin);
        if (url.origin !== location.origin || url.pathname !== run.endpoint || url.username || url.password || url.hash ||
            Object.entries(run.scope).some(([key, value]) => url.searchParams.getAll(key).length > 1 || (url.searchParams.get(key) || '') !== value)) {
            throw new Error('Сервер вернул неожиданную ссылку на страницу инвентаря.');
        }
        return url;
    }

    async function collectInventory(run) {
        let url = new URL(run.endpoint, location.origin);
        url.searchParams.set('pageSize', '72');
        Object.entries(run.scope).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
        const pages = new Set();
        const itemIds = new Set();
        const items = [];
        let count = null;
        while (url) {
            checkPinRun(run);
            if (pages.has(url.href)) throw new Error('Сервер повторил страницу инвентаря.');
            pages.add(url.href);
            const page = await requestPinJSON(run, url.href);
            checkPinRun(run);
            if (!Array.isArray(page.results) || !Number.isSafeInteger(page.count) || page.count < 0 ||
                !Number.isSafeInteger(page.pageSize) || page.pageSize < 1 || page.results.length > page.pageSize ||
                (count !== null && page.count !== count)) {
                throw new Error('Не удалось получить стабильный список предметов.');
            }
            count = page.count;
            for (const item of page.results) {
                if (!Number.isSafeInteger(item?.id) || item.id < 1 || itemIds.has(item.id) ||
                    !item.product || typeof item.state !== 'string') {
                    throw new Error('Список предметов содержит неизвестные или повторяющиеся записи.');
                }
                itemIds.add(item.id);
                const product = item.product;
                if (item.state === 'active' && product.activationType === 'pin_code_activation' &&
                    typeof product.kind === 'string' && product.kind && product.kind !== 'key') {
                    items.push(item.id);
                }
            }
            if (itemIds.size > count || (page.next && !page.results.length)) {
                throw new Error('Список предметов изменился во время загрузки.');
            }
            renderOpening(run, `Проверяем инвентарь: ${itemIds.size} / ${count}…`);
            url = page.next === null ? null : nextInventoryURL(run, page.next);
        }
        if (itemIds.size !== count) throw new Error('Не удалось загрузить весь список предметов.');
        return items;
    }

    async function startOpening() {
        const showcase = location.pathname.match(/^\/inventory\/(\d+)\/?$/)?.[1];
        if (openingRun || openingNeedsRefresh || copyRun) return;
        if (!showcase) {
            setOpeningStatus('Откройте страницу инвентаря для получения ПИН-кодов.');
            return;
        }
        if ([...document.querySelectorAll('.b-popup, .b-popup-message')].some(popup => popup.getClientRects().length)) {
            setOpeningStatus('Закройте окно сайта перед получением ПИН-кодов.');
            return;
        }
        const nativePending = [...document.querySelectorAll(PIN_OPEN_SELECTOR)].some(button =>
            (button.disabled || button.getAttribute('aria-disabled') === 'true') &&
            ['Получить ПИН-код', 'Receive a PIN code'].includes(button.textContent.replace(/\s+/g, ' ').trim()));
        if (nativePending) {
            setOpeningStatus('Дождитесь завершения уже начатого получения ПИН-кода.');
            return;
        }
        let scope;
        try { scope = readInventoryScope(); } catch (error) { setOpeningStatus(error.message); return; }
        const run = {
            path: location.pathname, endpoint: `/api/showcases/${showcase}/inventory_items/`, scope,
            total: null, received: 0, stopping: false, cancelled: false, submitted: false, controller: null
        };
        openingRun = run;
        renderOpening(run, 'Загружаем список предметов…');
        let message = 'ПИН-коды получены.';
        try {
            // Snapshot all pages first: each activation removes an item and shifts pagination.
            const items = await collectInventory(run);
            run.total = items.length;
            for (const itemId of items) {
                checkPinRun(run);
                renderOpening(run, 'Получаем ПИН-коды…');
                const result = await requestPinJSON(run, `${run.endpoint}${itemId}/activate`, 'POST');
                if (run.cancelled) return;
                const code = result.code;
                if (!code || typeof code !== 'object' || Array.isArray(code) || typeof code.code !== 'string' || !code.code.trim()) {
                    throw new Error('Сервер не подтвердил получение ПИН-кода.');
                }
                // Count a confirmed response even if Stop was pressed while this POST was in flight.
                run.received++;
                run.submitted = false;
                renderOpening(run, run.stopping ? 'Останавливаемся…' : 'ПИН-код получен.');
                if (run.stopping) break;
            }
            if (run.stopping) message = 'Получение остановлено.';
            else if (!items.length) message = 'В выбранном инвентаре нет доступных ПИН-кодов.';
        } catch (error) {
            message = error instanceof Error ? error.message : 'Не удалось получить ПИН-коды.';
        } finally {
            if (openingRun === run) {
                openingRun = null;
                if (!run.cancelled) {
                    const warning = run.submitted ? ' Результат последнего запроса не подтверждён.' : '';
                    const refresh = openingNeedsRefresh ? ' Обновите страницу для синхронизации инвентаря.' : '';
                    renderOpening(run, `${message}${warning}${refresh}`);
                }
            }
        }
    }

    function blockNativePinOpening(event) {
        if ((openingRun || openingNeedsRefresh) && event.target instanceof Element && event.target.closest(PIN_OPEN_SELECTOR) &&
            (event.type === 'click' || event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }
    document.addEventListener('click', blockNativePinOpening, true);
    document.addEventListener('keydown', blockNativePinOpening, true);
    window.addEventListener('pagehide', () => {
        if (copyRun) closeCopyPopup(copyRun);
        if (!openingRun) return;
        openingRun.cancelled = true;
        openingRun.controller?.abort();
    });

    function removeEmptyLegacyWrappers() {
        document.querySelectorAll('.b-game__container > div[style]').forEach(wrapper => {
            if (wrapper.id === 'vkplay-pins-panel') return;
            if (wrapper.querySelector('#copy-pins-button, #open-all-pins-button')) return;
            if (wrapper.childElementCount === 0) wrapper.remove();
        });
    }

    function migrateExistingButtons() {
        const copyBtn = document.querySelector('#copy-pins-button');
        const openBtn = document.querySelector('#open-all-pins-button');

        if (!copyBtn && !openBtn) return false;

        const panel = ensureButtonPanel();

        if (copyBtn) {
            applyButtonStyles(copyBtn);
            bindCopyButton(copyBtn);
            if (copyBtn.parentElement !== panel) panel.appendChild(copyBtn);
        }

        if (openBtn) {
            applyButtonStyles(openBtn);
            bindOpenButton(openBtn);
            if (openBtn.parentElement !== panel) panel.appendChild(openBtn);
        }

        removeEmptyLegacyWrappers();
        return true;
    }

    function addButtons() {
        if (migrateExistingButtons()) {
            updateOpeningControls();
            return;
        }

        const panel = ensureButtonPanel();

        const copyBtn = document.createElement('button');
        copyBtn.id = 'copy-pins-button';
        copyBtn.innerText = 'Скопировать все ПИН-коды';
        applyButtonStyles(copyBtn);
        bindCopyButton(copyBtn);

        const openBtn = document.createElement('button');
        openBtn.id = 'open-all-pins-button';
        openBtn.innerText = 'Открыть все ПИН-коды';
        applyButtonStyles(openBtn);
        bindOpenButton(openBtn);

        panel.appendChild(copyBtn);
        panel.appendChild(openBtn);
        updateOpeningControls();
    }

    const observer = new MutationObserver(() => {
        const hasPins = document.querySelector('.b-my-pin') || document.querySelector('.b-game__container');
        if (hasPins) {
            addButtons();
        }
    });

    if (document.querySelector('.b-my-pin') || document.querySelector('.b-game__container')) {
        addButtons();
    }

    observer.observe(document.body, { childList: true, subtree: true });
})();
