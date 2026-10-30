const PIN_API_TIMEOUT = 30000;
const PIN_API_RETRY_DELAY = 3000;
const PIN_API_PACE_STEP = 100;
const PIN_API_STABLE_PIN_COUNT = 50;
let pinApiRun = null;
let pinApiReport = null;
let pinNormalRunning = false;
let pinNormalRunId = 0;
let pinApiNeedsRefresh = false;

function parsePinCodes(text) {
    return text.split(/\r\n?|\n/)
        .filter(line => !line.trimStart().startsWith('#'))
        .join('\n')
        .split(/[\s,]+/)
        .filter(Boolean);
}

function showInputWindow() {
    if (pinApiRun || pinNormalRunning) return;
    const existing = document.getElementById('input-window');
    if (existing) { existing.querySelector('textarea')?.focus(); return; }
    const modalHtml = `
        <div id="input-window"
             style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a0b0a;z-index:9999;">
            <i class="icon icon--xsm icon--close" style="position:absolute;top:10px;right:10px;" id="input-window-close"></i>
            <div class="ovl-title">Введите пин-коды</div>
            <div class="ovl-content content-text">
                <p>Разделенные пробелами, переносами строк или запятыми.<br>Заголовки групп вида «# Название награды» будут пропущены.</p>
                <div class="js-chest-items">
                    <textarea id="input-window-textarea" style="width:500px;height:400px;margin-bottom:10px;"></textarea>
                </div>
                <div class="text-center">
                    <div class="btn btn--xsm btn--lite" id="input-window-submit">
                        <span class="btn__text">Проверить</span>
                    </div>
                    <button type="button" id="input-window-fast-submit" style="background: #7428ac !important; color: #fff !important; border: 0; padding: 10px 16px; margin: 10px; font: 15px Arial, sans-serif; cursor: pointer;">Быстро активировать</button>
                </div>
                <p id="input-window-error" role="alert" style="color: #ffb0b0;"></p>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('input-window-textarea').focus();

    const submit = fast => {
        if (pinApiRun || pinNormalRunning) return;
        const textarea = document.getElementById('input-window-textarea');
        const pinCodes = parsePinCodes(textarea.value);
        if (pinApiNeedsRefresh) {
            document.getElementById('input-window-error').textContent = 'Обновите страницу и проверьте результат предыдущей активации перед новым запуском.';
            return;
        }
        if (pinCodes.length) {
            document.getElementById('input-window').remove();
            if (fast) processPinCodesAPI(pinCodes);
            else processPinCodes(pinCodes);
        } else {
            alert('Введите хотя бы один пин-код.');
        }
    };
    document.getElementById('input-window-submit').onclick = () => submit(false);
    document.getElementById('input-window-fast-submit').onclick = () => submit(true);

    document.getElementById('input-window-close').onclick = () => {
        document.getElementById('input-window').remove();
    };
}

function createProgressBar(totalPins) {
    const progressBarHtml = `
        <div id="global-progress-bar" style="
            position: fixed;
            top: 20px;
            left: 20px;
            background: #160a0a;
            padding: 10px;
            border: 1px solid #d0c696;
            border-radius: 0;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
            z-index: 10000;
        ">
            <div id="progress-container" style="
                width: 400px; /* Увеличено в 2 раза */
                height: 40px; /* Увеличено в 2 раза */
                background: #262020;
                border: 1px solid #d0c696;
                border-radius: 0;
                position: relative;
                overflow: hidden;
            ">
                <div id="progress-fill" style="
                    width: 0%;
                    height: 100%;
                    background: #ac2c28;
                    transition: width 0.3s ease;
                "></div>
                <div id="progress-text" style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: #d0c696;
                    font-family: Arial, sans-serif;
                    font-size: 16px;
                    font-weight: bold;
                    z-index: 1;
                ">0 / ${totalPins}</div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', progressBarHtml);
}

function updateProgress(processedPins, totalPins) {
    const progress = (processedPins / totalPins) * 100;
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    if (progressFill && progressText) {
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `${processedPins} / ${totalPins}`; // Обновляем текст
    }
}

function removeProgressBar() {
    const progressBar = document.getElementById('global-progress-bar');
    if (progressBar) {
        progressBar.remove();
    }
}

function processPinCodes(pinCodes) {
    if (pinApiRun || pinNormalRunning || pinApiNeedsRefresh) return;
    pinNormalRunning = true;
    const runId = ++pinNormalRunId;
    const path = location.pathname;
    const isCurrent = () => pinNormalRunning && pinNormalRunId === runId && location.pathname === path;
    const totalPins = pinCodes.length;
    let processedPins = 0;

    function fail(message, uncertain = false) {
        if (!isCurrent()) return;
        pinNormalRunning = false;
        pinNormalRunId++;
        pinApiNeedsRefresh = pinApiNeedsRefresh || uncertain;
        removeProgressBar();
        alert(message);
    }

    // Создаем прогресс-бар и передаем общее количество пин-кодов
    createProgressBar(totalPins);

    (function processNext(index) {
        if (!isCurrent()) return;
        if (index >= pinCodes.length) {
            pinNormalRunning = false;
            console.log('Все пин-коды обработаны.');
            removeProgressBar(); // Удаляем прогресс-бар после завершения
            addButton();
            return;
        }
        const pinCode = pinCodes[index];
        let deadline = Date.now() + PIN_API_TIMEOUT;
        console.log(`Обработка пин-кода (${index + 1}/${pinCodes.length})`);

        const pinInput = document.querySelector('input[name="pin"]');
        if (pinInput) {
            pinInput.value = pinCode;
        } else {
            console.error('Поле для ввода пин-кода не найдено.');
            pinNormalRunning = false;
            removeProgressBar(); // Удаляем прогресс-бар в случае ошибки
            return;
        }

        const submitButton = document.querySelector('input[type="submit"]');
        if (submitButton) {
            submitButton.click();
        } else {
            console.error('Кнопка отправки не найдена.');
            pinNormalRunning = false;
            removeProgressBar(); // Удаляем прогресс-бар в случае ошибки
            return;
        }

        function activatePopup() {
            if (!isCurrent()) return;
            if (document.querySelector('#pin-form .input.error')) {
                fail('ПИН-код не прошёл проверку. Обработка остановлена.');
                return;
            }
            if (Date.now() >= deadline) {
                fail('Не удалось дождаться проверки ПИН-кода. Обработка остановлена.');
                return;
            }
            const activateSubmit = document.querySelector('.ovl input[type="submit"]');
            if (activateSubmit) {
                activateSubmit.click();
                deadline = Date.now() + PIN_API_TIMEOUT;
                setTimeout(() => clickOkButton(index + 1), 1000);
            } else {
                setTimeout(activatePopup, 1000);
            }
        }

        function clickOkButton(nextIndex) {
            if (!isCurrent()) return;
            if (document.querySelector('.ovl .js-pin-error')?.textContent.trim()) {
                fail('Не удалось подтвердить активацию. Проверьте сообщение сайта и обновите страницу перед повторным запуском.', true);
                return;
            }
            if (Date.now() >= deadline) {
                fail('Не удалось подтвердить активацию. Обновите страницу и проверьте результат перед повторным запуском.', true);
                return;
            }
            const okButton = document.querySelector('.js-ovl-close');
            if (okButton) {
                okButton.click();
                processedPins++;
                updateProgress(processedPins, totalPins); // Обновляем прогресс
                setTimeout(() => processNext(nextIndex), 1000);
            } else {
                setTimeout(() => clickOkButton(nextIndex), 1000);
            }
        }

        setTimeout(activatePopup, 1000);
    })(0);
}

function stopPinAPI(run) {
    if (pinApiRun !== run || run.stopping) return;
    run.stopping = true;
    cancelPinAPIRetry(run);
    if (!run.activating) run.controller?.abort();
    renderPinAPI(run, run.activating ? 'Ожидаем ответ текущей активации. Следующие коды обрабатываться не будут.' : 'Останавливаемся…');
}

function renderPinAPI(run, message, finished = false, phase = 'working') {
    if (!run.dialog || run.disposed) return;
    const processed = run.completed + run.skipped;
    const state = finished
        ? (run.submitted || run.unconfirmedSkipped ? 'attention' : run.stopping || processed < run.total ? 'stopped' : 'done')
        : run.stopping ? 'stopping' : phase;
    const titles = {
        working: 'Активация идёт', waiting: 'Ждём сервер', stopping: 'Останавливаемся',
        done: 'Обработка завершена', stopped: 'Обработка остановлена', attention: 'Нужно проверить результат'
    };
    run.dialog.dataset.pinApiState = state;
    const button = run.dialog.querySelector('[data-pin-api-stop]');
    button.textContent = finished ? 'Закрыть' : run.stopping ? 'Остановка…' : 'Стоп';
    button.disabled = !finished && run.stopping;
    const progress = run.dialog.querySelector('[data-pin-api-progress]');
    const fraction = `${processed.toLocaleString('ru-RU')} из ${run.total.toLocaleString('ru-RU')}`;
    progress.value = processed;
    progress.setAttribute('aria-valuetext', `Обработано ${fraction}`);
    run.dialog.querySelector('[data-pin-api-processed]').textContent = fraction;
    run.dialog.querySelector('[data-pin-api-percent]').textContent = `${Math.floor(processed / run.total * 100)}%`;
    run.dialog.querySelector('[data-pin-api-activated]').textContent = run.completed.toLocaleString('ru-RU');
    run.dialog.querySelector('[data-pin-api-skipped]').textContent = run.skipped.toLocaleString('ru-RU');
    run.dialog.querySelector('[data-pin-api-status-title]').textContent = titles[state];
    run.dialog.querySelector('[data-pin-api-status]').textContent = message;
    const remaining = run.remainingPins.length;
    run.dialog.querySelector('[data-pin-api-remaining]').hidden = !finished || !remaining;
    if (finished && remaining) {
        run.dialog.querySelector('[data-pin-api-remaining-note]').textContent =
            `Осталось кодов: ${remaining.toLocaleString('ru-RU')}. Скопируйте их перед обновлением страницы, чтобы продолжить с этого места.`
            + (run.submitted ? ' Первый код в списке мог уже активироваться: сервер не подтвердил результат. При повторной проверке использованный код будет пропущен.' : '');
    }
}

function disposePinAPIReport(run) {
    if (!run || run.disposed) return;
    run.disposed = true;
    run.remainingPins.length = 0;
    const textarea = run.dialog?.querySelector('[data-pin-api-remaining-text]');
    if (textarea) textarea.value = '';
    run.dialog?.remove();
    if (pinApiReport === run) pinApiReport = null;
}

async function copyRemainingPinCodes(run) {
    const canCopy = () => pinApiRun !== run && pinApiReport === run && !run.disposed
        && run.dialog?.isConnected && run.dialog.open && run.remainingPins.length > 0;
    if (!canCopy()) return;
    const button = run.dialog.querySelector('[data-pin-api-copy]');
    if (button.disabled) return;
    button.disabled = true;
    const status = run.dialog.querySelector('[data-pin-api-copy-status]');
    try {
        await navigator.clipboard.writeText(run.remainingPins.join('\n'));
        if (canCopy()) status.textContent = 'Оставшиеся ПИН-коды скопированы. После обновления страницы вставьте их в окно массовой активации.';
    } catch {
        if (!canCopy()) return;
        const textarea = run.dialog.querySelector('[data-pin-api-remaining-text]');
        textarea.value = run.remainingPins.join('\n');
        textarea.hidden = false;
        textarea.focus();
        textarea.select();
        status.textContent = 'Браузер не разрешил копирование. Коды выделены в поле — нажмите Ctrl+C.';
    } finally {
        if (canCopy()) button.disabled = false;
    }
}

function createPinAPIProgress(run) {
    disposePinAPIReport(pinApiReport);
    document.getElementById('violet-pin-api-progress')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'violet-pin-api-progress';
    dialog.setAttribute('aria-labelledby', 'violet-pin-api-title');
    dialog.style.cssText = 'position: fixed; inset: 0; margin: auto; width: 520px; max-width: calc(100vw - 32px); max-height: 85vh; overflow: hidden; box-sizing: border-box; padding: 0; background: #1b101f; color: #e0d7e5; border: 1px solid #60446f; border-radius: 0; box-shadow: 0 10px 40px #0008; font: 16px/1.5 HelveticaLight, Arial, sans-serif; color-scheme: dark;';
    dialog.innerHTML = `
        <style>
            #violet-pin-api-progress::backdrop { background: rgba(30, 20, 34, 0.75); }
            #violet-pin-api-progress[open] { display: flex; flex-direction: column; }
            #violet-pin-api-progress * { box-sizing: border-box; }
            #violet-pin-api-progress [hidden] { display: none !important; }
            #violet-pin-api-progress h2 { flex: none; margin: 0; padding: 18px 28px 16px; border-bottom: 1px solid #60446f; background: #2b1834; color: #fff; font: 30px/1.15 HelveticaCond, 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; }
            #violet-pin-api-progress [data-pin-api-body] { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 24px 28px; }
            #violet-pin-api-progress [data-pin-api-overview] { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; color: #cbbbd4; font-size: 14px; }
            #violet-pin-api-progress [data-pin-api-processed] { color: #fff; font-family: HelveticaNeue, Arial, sans-serif; font-weight: 700; }
            #violet-pin-api-progress [data-pin-api-percent] { color: #d5b6ea; font-variant-numeric: tabular-nums; }
            #violet-pin-api-progress progress { display: block; width: 100%; height: 10px; margin: 0; border: 1px solid #60446f; border-radius: 0; overflow: hidden; appearance: none; background: #100a14; }
            #violet-pin-api-progress progress::-webkit-progress-bar { background: #100a14; }
            #violet-pin-api-progress progress::-webkit-progress-value { background: #a36bc1; }
            #violet-pin-api-progress [data-pin-api-stats] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 22px 0; padding: 0; }
            #violet-pin-api-progress [data-pin-api-card] { min-width: 0; padding: 16px; border: 1px solid #51355f; background: #25162d; }
            #violet-pin-api-progress dt { margin: 0 0 10px; color: #e2d3eb; font: 14px/1.4 HelveticaLight, Arial, sans-serif; text-transform: uppercase; }
            #violet-pin-api-progress dd { margin: 0; padding: 0; }
            #violet-pin-api-progress [data-pin-api-activated], #violet-pin-api-progress [data-pin-api-skipped] { display: block; font: 36px/1.1 HelveticaCond, 'Arial Narrow', Arial, sans-serif; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
            #violet-pin-api-progress [data-pin-api-activated] { color: #e1c1f4; }
            #violet-pin-api-progress [data-pin-api-skipped] { color: #bfa8ce; }
            #violet-pin-api-progress [data-pin-api-caption] { display: block; margin-top: 8px; color: #bfb0c8; font-size: 12px; line-height: 1.4; }
            #violet-pin-api-progress [data-pin-api-notice] { padding: 15px 16px; border: 1px solid #51355f; background: #221529; overflow-wrap: anywhere; }
            #violet-pin-api-progress [data-pin-api-status-title] { display: block; color: #d5b6ea; font-family: HelveticaNeue, Arial, sans-serif; font-size: 14px; font-weight: 700; }
            #violet-pin-api-progress [data-pin-api-status] { margin: 8px 0 0; padding: 0; color: #ded3e5; font: 14px/1.6 HelveticaLight, Arial, sans-serif; }
            #violet-pin-api-progress[data-pin-api-state="waiting"] [data-pin-api-status-title], #violet-pin-api-progress[data-pin-api-state="attention"] [data-pin-api-status-title] { color: #f3ce8c; }
            #violet-pin-api-progress[data-pin-api-state="done"] [data-pin-api-status-title] { color: #e1c1f4; }
            #violet-pin-api-progress [data-pin-api-remaining] { margin-top: 22px; }
            #violet-pin-api-progress [data-pin-api-remaining-note], #violet-pin-api-progress [data-pin-api-copy-status] { margin: 0 0 12px; padding: 0; color: #ded3e5; font: 14px/1.6 HelveticaLight, Arial, sans-serif; overflow-wrap: anywhere; }
            #violet-pin-api-progress [data-pin-api-copy-status]:empty { display: none; }
            #violet-pin-api-progress [data-pin-api-copy-status] { margin: 12px 0 0; }
            #violet-pin-api-progress [data-pin-api-copy] { width: 100%; }
            #violet-pin-api-progress [data-pin-api-remaining-text] { display: block; width: 100%; height: 120px; margin: 12px 0 0; padding: 10px; resize: vertical; border: 1px solid #60446f; border-radius: 0; background: #100a14; color: #fff; font: 14px/1.5 monospace; }
            #violet-pin-api-progress [data-pin-api-actions] { display: flex; flex: none; justify-content: flex-end; padding: 16px 28px; border-top: 1px solid #60446f; background: #2b1834; }
            #violet-pin-api-progress button { min-width: 160px; min-height: 46px; margin: 0; padding: 11px 30px; border: 2px solid #c2a6d2; border-radius: 2px; background: #71358b; color: #fff; font: 16px/1.2 HelveticaLight, Arial, sans-serif; text-transform: uppercase; text-align: center; cursor: pointer; }
            #violet-pin-api-progress button:hover:not(:disabled) { background: #5d2c73; border-color: #fff; }
            #violet-pin-api-progress button:active:not(:disabled) { filter: brightness(0.9); }
            #violet-pin-api-progress button:disabled { border-color: #75677c; background: transparent; color: #b0a3b8; cursor: wait; }
            #violet-pin-api-progress button:focus-visible { outline: 2px solid #e1c1f4; outline-offset: 3px; }
            @media (max-width: 400px) {
                #violet-pin-api-progress h2 { padding: 16px 18px; font-size: 25px; }
                #violet-pin-api-progress [data-pin-api-body] { padding: 20px 18px; }
                #violet-pin-api-progress [data-pin-api-actions] { padding: 14px 18px; }
                #violet-pin-api-progress [data-pin-api-stats] { gap: 8px; }
                #violet-pin-api-progress [data-pin-api-card] { padding: 12px; }
                #violet-pin-api-progress dt { font-size: 12px; }
                #violet-pin-api-progress [data-pin-api-stop] { width: 100%; }
            }
        </style>
        <h2 id="violet-pin-api-title">Быстрая активация <span style="white-space: nowrap;">ПИН-кодов</span></h2>
        <div data-pin-api-body>
        <div data-pin-api-overview>
            <span>Обработано <strong data-pin-api-processed></strong></span>
            <span data-pin-api-percent>0%</span>
        </div>
        <progress data-pin-api-progress aria-label="Обработка ПИН-кодов"></progress>
        <dl data-pin-api-stats>
            <div data-pin-api-card>
                <dt>Активировано</dt>
                <dd><strong data-pin-api-activated>0</strong><span data-pin-api-caption>В этом запуске</span></dd>
            </div>
            <div data-pin-api-card>
                <dt>Пропущено</dt>
                <dd><strong data-pin-api-skipped>0</strong><span data-pin-api-caption>Уже активированы или просрочены</span></dd>
            </div>
        </dl>
        <div data-pin-api-notice role="status" aria-live="polite" aria-atomic="true">
            <strong data-pin-api-status-title></strong>
            <p data-pin-api-status></p>
        </div>
        <div data-pin-api-remaining hidden>
            <p data-pin-api-remaining-note></p>
            <button type="button" data-pin-api-copy>Скопировать оставшиеся ПИН-коды</button>
            <textarea data-pin-api-remaining-text aria-label="Оставшиеся ПИН-коды" readonly spellcheck="false" hidden></textarea>
            <p data-pin-api-copy-status role="status" aria-live="polite"></p>
        </div>
        </div>
        <div data-pin-api-actions>
            <button type="button" data-pin-api-stop>Стоп</button>
        </div>
    `;
    dialog.querySelector('[data-pin-api-progress]').max = run.total;
    dialog.querySelector('[data-pin-api-stop]').addEventListener('click', () => {
        if (pinApiRun === run) stopPinAPI(run);
        else disposePinAPIReport(run);
    });
    dialog.querySelector('[data-pin-api-copy]').addEventListener('click', () => copyRemainingPinCodes(run));
    // A held Escape must only stop the run, not dismiss its just-finished report.
    let stoppingWithEscape = false;
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape' && (pinApiRun === run || stoppingWithEscape)) {
            stoppingWithEscape = true;
            event.preventDefault();
            event.stopPropagation();
            stopPinAPI(run);
        }
    });
    dialog.addEventListener('keyup', event => {
        if (event.key === 'Escape' && stoppingWithEscape) {
            stoppingWithEscape = false;
            event.preventDefault();
            event.stopPropagation();
        }
    });
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        if (pinApiRun === run) stopPinAPI(run);
        else if (!stoppingWithEscape) disposePinAPIReport(run);
    });
    let closedWhileRunning = false;
    dialog.addEventListener('beforetoggle', event => {
        if (event.newState !== 'closed') return;
        closedWhileRunning = pinApiRun === run && !run.disposed && !run.cancelled;
        if (closedWhileRunning) stopPinAPI(run);
    });
    dialog.addEventListener('close', () => {
        if (run.disposed || run.cancelled) return;
        const retainReport = closedWhileRunning || pinApiRun === run;
        closedWhileRunning = false;
        // Preserve the result if the dialog was closed while a request was running.
        if (retainReport) {
            stopPinAPI(run);
            if (dialog.isConnected && !dialog.open) dialog.showModal();
        } else {
            disposePinAPIReport(run);
        }
    });
    run.dialog = dialog;
    pinApiReport = run;
    document.body.appendChild(dialog);
    dialog.showModal();
    return dialog;
}

function checkPinAPI(run) {
    if (run.cancelled || location.pathname !== run.path || pinApiRun !== run) {
        throw new Error('Страница изменилась. Активация остановлена.');
    }
    if (run.stopping) throw new Error('Активация остановлена.');
}

function cancelPinAPIRetry(run) {
    const wait = run.retryWait;
    if (!wait) return;
    run.retryWait = null;
    clearTimeout(wait.timer);
    wait.resolve();
}

function pinAPIRetryDelay(value) {
    if (!value?.trim()) return PIN_API_RETRY_DELAY;
    const seconds = Number(value);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
    return Number.isFinite(delay) ? Math.max(PIN_API_RETRY_DELAY, delay) : PIN_API_RETRY_DELAY;
}

function isRetryablePinAPIError(error) {
    return [429, 502, 503, 504].includes(error?.status);
}

async function waitPinAPIDelay(run, duration) {
    checkPinAPI(run);
    let remaining = duration;
    // Retry cooldowns and request pacing share one cancellable wait.
    // Split long waits to avoid the browser's timer overflow.
    while (remaining > 0) {
        const delay = Math.min(remaining, 2147483647);
        await new Promise(resolve => {
            run.retryWait = {
                resolve,
                timer: setTimeout(() => {
                    run.retryWait = null;
                    resolve();
                }, delay)
            };
        });
        checkPinAPI(run);
        remaining -= delay;
    }
}

async function waitForPinAPIRetry(run, error) {
    checkPinAPI(run);
    const delay = Math.max(error.retryDelay || PIN_API_RETRY_DELAY, run.requestDelay);
    const reason = error.status === 429 ? 'Сервер попросил снизить темп.'
        : error.status === 503 ? 'Сервер временно занят.' : 'Сервер пока не отвечает.';
    const continuation = error.status === 503
        ? (error.paceIncreased ? 'Затем продолжим немного медленнее, чтобы снизить нагрузку.' : 'Затем продолжим в прежнем темпе.')
        : 'Затем продолжим автоматически.';
    renderPinAPI(run, `${reason} Подождём ${Math.ceil(delay / 1000).toLocaleString('ru-RU')} сек. ${continuation} Прогресс сохранён.`, false, 'waiting');
    await waitPinAPIDelay(run, delay);
    renderPinAPI(run, 'Продолжаем обработку с того же места…');
}

async function pacePinAPIRequest(run) {
    checkPinAPI(run);
    if (run.lastRequestFinishedAt === null) return;
    while (run.requestDelay > 0) {
        const remaining = run.requestDelay - (performance.now() - run.lastRequestFinishedAt);
        if (remaining <= 0) break;
        await waitPinAPIDelay(run, Math.ceil(remaining));
    }
    checkPinAPI(run);
}

async function requestPinAPIWithRetry(run, path, body = null, html = false) {
    // Activation is retried only by activatePinCodeAPI after fresh validation.
    while (true) {
        checkPinAPI(run);
        try {
            return await requestPinAPI(run, path, body, html);
        } catch (error) {
            if (!isRetryablePinAPIError(error)) throw error;
            await waitForPinAPIRetry(run, error);
        }
    }
}

function parsePinAPIForm(html, id) {
    // Template content remains detached: scripts, images and inline event handlers are never run.
    const template = document.createElement('template');
    template.innerHTML = html;
    const forms = template.content.querySelectorAll(`form#${id}`);
    if (forms.length !== 1) throw new Error('Сайт не вернул ожидаемую форму. Проверьте вход в аккаунт.');
    return forms[0];
}

function serializePinAPIForm(form, confirmation = false) {
    if (!(form instanceof HTMLFormElement)) throw new Error('Форма активации недоступна. Обновите страницу.');
    const action = new URL(form.getAttribute('action') || '/pin', location.origin);
    if (action.origin !== location.origin) throw new Error('Сайт вернул неизвестный адрес формы.');
    if (confirmation && [...form.querySelectorAll('input, select, textarea, .js-items-input')].some(control =>
        !control.matches(':disabled') && (control.matches('select, input[type="radio"], input[type="checkbox"], .js-items-input') ||
            (control.matches('textarea, input:not([type]), input[type="text"], input[type="number"]') && !control.readOnly)))) {
        throw new Error('Этот ПИН-код требует выбора награды или заполнения полей. Используйте обычную активацию.');
    }
    if ([...form.elements].some(control => control.name !== 'pin' && !control.matches(':disabled') && control.validity && !control.validity.valid)) {
        throw new Error('В форме есть незаполненные поля. Используйте обычную активацию.');
    }
    if (confirmation && [...form.querySelectorAll('[type="submit"], .btn')].some(button =>
        button.disabled || button.classList.contains('disabled') || button.getAttribute('aria-disabled') === 'true')) {
        throw new Error('Сайт пока не разрешает активацию этого ПИН-кода.');
    }
    const body = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
        if (typeof value !== 'string') throw new Error('Форма содержит неподдерживаемое поле. Используйте обычную активацию.');
        body.append(name, value.replace(/\r?\n/g, '\r\n'));
    }
    return body;
}

async function requestPinAPI(run, path, body = null, html = false) {
    await pacePinAPIRequest(run);
    checkPinAPI(run);
    const controller = new AbortController();
    run.controller = controller;
    const timer = setTimeout(() => controller.abort(), PIN_API_TIMEOUT);
    try {
        const headers = { Accept: html ? 'text/html' : 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
        if (body !== null) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
        if (path === '/pin/_activate') {
            run.submitted = true;
            run.didActivate = true;
            run.activating = true;
        }
        const response = await fetch(path, {
            method: body === null ? 'GET' : 'POST', headers, body,
            credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal
        });
        if (!response.ok) {
            const error = new Error([401, 403].includes(response.status)
                ? 'Сайт не разрешил выполнить запрос. Проверьте вход в аккаунт и обновите страницу.'
                : 'Сайт не смог обработать запрос. Попробуйте продолжить позже.');
            error.status = response.status;
            if (response.status === 503) {
                const processed = run.completed + run.skipped;
                error.paceIncreased = run.processedAtLast503 === null || processed - run.processedAtLast503 < PIN_API_STABLE_PIN_COUNT;
                if (error.paceIncreased) run.requestDelay += PIN_API_PACE_STEP;
                // Each 503 starts a new interval, even when the current pace is retained.
                run.processedAtLast503 = processed;
            }
            error.retryDelay = pinAPIRetryDelay(response.headers.get('Retry-After'));
            // Release the error response before scheduling another request.
            await response.body?.cancel().catch(() => {});
            throw error;
        }
        if (html) return await response.text();
        let result;
        try { result = await response.json(); } catch { throw new Error('Сервер вернул непонятный ответ.'); }
        if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Не удалось прочитать ответ сервера.');
        return result;
    } catch (error) {
        if (controller.signal.aborted) throw new Error(run.stopping && !run.activating ? 'Активация остановлена.' : 'Истекло время ожидания ответа сервера.');
        if (error instanceof TypeError) throw new Error('Ошибка соединения с сервером.');
        throw error;
    } finally {
        clearTimeout(timer);
        run.lastRequestFinishedAt = performance.now();
        if (run.controller === controller) run.controller = null;
        if (path === '/pin/_activate') run.activating = false;
    }
}

function pinItemsPath(result) {
    const segments = ['type', 'pin', 'limit'].map(key => {
        const value = result[key];
        if (!['string', 'number'].includes(typeof value) || !String(value).trim() || ['.', '..'].includes(String(value))) {
            throw new Error('Сайт не вернул данные подтверждения ПИН-кода.');
        }
        return encodeURIComponent(String(value));
    });
    return `/pin/_items/${segments.join('/')}`;
}

async function readPinAPIValidationFields(run) {
    const html = await requestPinAPIWithRetry(run, '/pin/_index', null, true);
    checkPinAPI(run);
    const form = parsePinAPIForm(html, 'pin-form');
    if (!form.querySelector('input[name="pin"]')) throw new Error('Сайт не вернул форму следующего ПИН-кода.');
    return serializePinAPIForm(form);
}

function pinAPIErrorText(response) {
    if (typeof response.msg !== 'string') return '';
    const template = document.createElement('template');
    template.innerHTML = response.msg;
    template.content.querySelectorAll('script, style').forEach(node => node.remove());
    template.content.querySelectorAll('br').forEach(node => node.replaceWith(' '));
    return template.content.textContent.replace(/\s+/g, ' ').trim();
}

function isUsedPinAPIError(response) {
    if (response.status !== 'error') return false;
    const message = pinAPIErrorText(response).normalize('NFKC').toLowerCase()
        .replace(/[‐‑‒–—−]/g, '-').replace(/^(?:ошибка|внимание)\s*[:!]\s*/u, '');
    const firstSentence = message.split(/[.!]/, 1)[0];
    if (/\?|(?:^|\s)(?:ли|или|либо)(?:\s|$)/u.test(firstSentence)) return false;
    const code = '(?:пин[ -]?код|pin[ -]?код|код)';
    const boundary = '(?=$|[^\\p{L}\\p{N}_])';
    const passive = new RegExp(`^(?:(?:этот|данный|указанный|введ[её]нный)\\s+)?${code}\\s+(?:(?:уже|ранее)\\s+(?:был\\s+)?(?:активирован|использован)|был\\s+(?:(?:уже|ранее)\\s+)?(?:активирован|использован)|(?:активирован|использован)\\s+ранее)${boundary}`, 'u');
    const active = new RegExp(`^вы\\s+(?:уже|ранее)\\s+(?:активировали|использовали)\\s+(?:(?:этот|данный|указанный)\\s+)?${code}${boundary}`, 'u');
    return passive.test(message) || active.test(message);
}

function isExpiredPinAPIError(response) {
    if (response.status !== 'error') return false;
    const message = pinAPIErrorText(response).normalize('NFKC').toLowerCase()
        .replace(/[‐‑‒–—−]/g, '-').replace(/^(?:ошибка|внимание)\s*[:!]\s*/u, '');
    const firstSentence = message.split(/[.!]/, 1)[0].trim();
    return /^(?:(?:этот|данный|указанный|введ[её]нный)\s+)?(?:пин[ -]?код|pin[ -]?код|код)\s+(?:уже\s+)?просрочен$/u.test(firstSentence);
}

function skipPinAPI(run, hadUnconfirmedActivation, result = 'skipped') {
    // A used or expired rejection is not a confirmed success of our earlier request.
    if (hadUnconfirmedActivation) run.unconfirmedSkipped++;
    run.submitted = false;
    return result;
}

async function activatePinCodeAPI(run, pinCode, validationFields) {
    let attempt = 0;
    let originalItemsPath = null;
    let hadUnconfirmedActivation = false;
    while (true) {
        checkPinAPI(run);
        if (attempt) validationFields = await readPinAPIValidationFields(run);
        renderPinAPI(run, `Проверяем код №${run.index + 1}…`);
        const checkBody = new URLSearchParams(validationFields);
        checkBody.set('pin', pinCode);
        const validation = await requestPinAPIWithRetry(run, '/pin/_validate', checkBody.toString());
        checkPinAPI(run);
        if (isUsedPinAPIError(validation)) return skipPinAPI(run, hadUnconfirmedActivation);
        if (isExpiredPinAPIError(validation)) return skipPinAPI(run, hadUnconfirmedActivation, 'expired');
        if (validation.status === 'error') {
            throw new Error(`Код №${run.index + 1} не прошёл проверку. ${pinAPIErrorText(validation) || 'Проверьте его обычным способом.'}`);
        }
        if (validation.status !== 'showitems') throw new Error('Сайт не подтвердил проверку ПИН-кода.');
        const itemsPath = pinItemsPath(validation);
        if (originalItemsPath !== null && itemsPath !== originalItemsPath) {
            throw new Error('Данные ПИН-кода изменились после ошибки. Активация остановлена.');
        }
        originalItemsPath = itemsPath;
        const confirmationHTML = await requestPinAPIWithRetry(run, itemsPath, null, true);
        checkPinAPI(run);
        const confirmation = parsePinAPIForm(confirmationHTML, 'pin-items');
        const activationFields = serializePinAPIForm(confirmation, true);
        if (!activationFields.size || activationFields.getAll('pin').some(value => value !== String(validation.pin))) {
            throw new Error('Данные формы не соответствуют проверенному ПИН-коду.');
        }
        renderPinAPI(run, `Активируем код №${run.index + 1}…`);
        let activation;
        try {
            activation = await requestPinAPI(run, '/pin/_activate', activationFields.toString());
        } catch (error) {
            hadUnconfirmedActivation = true;
            if (!isRetryablePinAPIError(error)) throw error;
            attempt++;
            await waitForPinAPIRetry(run, error);
            continue;
        }
        if (run.cancelled) return null;
        if (isUsedPinAPIError(activation)) return skipPinAPI(run, hadUnconfirmedActivation);
        if (isExpiredPinAPIError(activation)) return skipPinAPI(run, hadUnconfirmedActivation, 'expired');
        if (activation.status === 'error') {
            // A later rejection cannot resolve an earlier ambiguous activation.
            run.submitted = hadUnconfirmedActivation;
            throw new Error(`Сайт отклонил активацию кода №${run.index + 1}. ${pinAPIErrorText(activation) || 'Проверьте его обычным способом.'}`);
        }
        // Match the site's PIN client: any valid object without status === 'error'
        // completes activation. Its success handler does not require a named status.
        run.submitted = false;
        return 'activated';
    }
}

async function processPinCodesAPI(pinCodes) {
    if (pinApiRun || pinNormalRunning || pinApiNeedsRefresh || !pinCodes.length) return;
    const mainForm = document.getElementById('pin-form');
    const run = {
        path: location.pathname, total: pinCodes.length, completed: 0, skipped: 0, unconfirmedSkipped: 0, index: 0,
        stopping: false, cancelled: false, submitted: false, didActivate: false, activating: false,
        controller: null, retryWait: null, dialog: null, requestDelay: 0, lastRequestFinishedAt: null,
        processedAtLast503: null, remainingPins: [], disposed: false
    };
    pinApiRun = run;
    const wasInert = mainForm?.inert;
    let message = 'Все коды из списка обработаны.';
    try {
        run.dialog = createPinAPIProgress(run);
        if (document.querySelector('.ovl #pin-items, .ovl-wrap #pin-items')) {
            throw new Error('Сначала закройте окно обычной активации ПИН-кода.');
        }
        if (!mainForm?.querySelector('input[name="pin"]')) throw new Error('Форма ПИН-кода не найдена. Проверьте вход в аккаунт.');
        let validationFields = serializePinAPIForm(mainForm);
        mainForm.inert = true;
        for (let index = 0; index < pinCodes.length; index++) {
            run.index = index;
            checkPinAPI(run);
            const result = await activatePinCodeAPI(run, pinCodes[index], validationFields);
            if (!result) return;
            if (result === 'skipped' || result === 'expired') {
                run.skipped++;
                renderPinAPI(run, `Код №${index + 1} ${result === 'expired' ? 'просрочен' : 'уже активирован'}, пропускаем.`);
            } else {
                run.completed++;
                renderPinAPI(run, `Код №${index + 1} активирован.`);
            }
            if (run.stopping) break;
            if (index + 1 < pinCodes.length) {
                // Native activation reloads this form too; keep refreshed CSRF fields without repainting the page.
                validationFields = await readPinAPIValidationFields(run);
            }
        }
        if (run.stopping) message = 'Новые коды больше не отправляются.';
    } catch (error) {
        message = error instanceof Error ? error.message : 'Не удалось активировать ПИН-код.';
    } finally {
        cancelPinAPIRetry(run);
        if (mainForm) mainForm.inert = wasInert;
        if (run.unconfirmedSkipped) {
            message += ` Пропущено после ошибки активации: ${run.unconfirmedSkipped}. Их активация в этом запуске не подтверждена.`;
        }
        if (run.submitted) {
            message += ' Результат последнего запроса не подтверждён. Обновите страницу и проверьте активацию перед повторным запуском.';
        } else if (run.didActivate) {
            message += ' Обновите страницу перед следующей активацией.';
        }
        pinApiNeedsRefresh = pinApiNeedsRefresh || run.didActivate;
        if (!run.cancelled && !run.disposed) {
            run.remainingPins = pinCodes.slice(run.completed + run.skipped);
        }
        pinCodes.length = 0;
        if (pinApiRun === run) pinApiRun = null;
        if (run.dialog && !run.cancelled) renderPinAPI(run, message, true);
    }
}

document.addEventListener('submit', event => {
    if ((pinApiRun || pinApiNeedsRefresh) && event.target instanceof Element && event.target.matches('#pin-form, #pin-items')) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }
}, true);

window.addEventListener('pagehide', () => {
    pinNormalRunning = false;
    pinNormalRunId++;
    if (pinApiRun) {
        pinApiRun.cancelled = true;
        cancelPinAPIRetry(pinApiRun);
        pinApiRun.controller?.abort();
    }
    disposePinAPIReport(pinApiReport);
});

function addButton() {
    const targetElement = document.querySelector('#pin-form > div.text-center');
    if (targetElement && !document.querySelector('#violet-add-pins')) {
        targetElement.insertAdjacentHTML('beforeend', `
            <div class="btn" style="background: #7428ac;" id="violet-add-pins">
                <div class="btn__text">Проверить несколько</div>
            </div>
        `);
        document.querySelector('#violet-add-pins').addEventListener('click', () => {
            showInputWindow();
        });
    }
}

const observer = new MutationObserver((mutations, obs) => {
    const targetElement = document.querySelector('#pin-form > div.text-center');
    if (targetElement) {
        addButton();
        obs.disconnect();
    }
});

observer.observe(document, {childList: true, subtree: true});
addButton();
