(function () {
    'use strict';

    const AUTO_TRANSFER_ID = 'violet-auto-transfer';
    const AUTO_TRANSFER_PANEL_ID = 'violet-auto-transfer-panel';
    const REQUIRED_ITEM_COUNT = 6;
    const MODAL_TIMEOUT = 15000;

    let automationEnabled = false;
    let transferInProgress = false;
    let lastSubmittedQueue = null;
    let runId = 0;
    let attemptTimer = null;

    function isVisible(element) {
        return Boolean(element && element.getClientRects().length);
    }

    function findVisible(selector, root = document) {
        return [...root.querySelectorAll(selector)].find(isVisible) || null;
    }

    function waitForVisible(selector, timeout, currentRunId, root = document) {
        return new Promise(resolve => {
            const startedAt = Date.now();
            const interval = setInterval(() => {
                if (!automationEnabled || currentRunId !== runId) {
                    clearInterval(interval);
                    resolve(null);
                    return;
                }

                const element = findVisible(selector, root);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                    return;
                }

                if (Date.now() - startedAt >= timeout) {
                    clearInterval(interval);
                    resolve(null);
                }
            }, 100);
        });
    }

    function getTransferLink() {
        const transferLink = document.querySelector('.transfer-btn .js-transfer');
        const button = transferLink?.closest('.btn');

        if (!transferLink || !button || button.classList.contains('disabled') || !isVisible(button)) {
            return null;
        }

        return transferLink;
    }

    function getQueuedItems() {
        return [...document.querySelectorAll('.items.js-items .js-item')];
    }

    function getQueueSignature(items) {
        return items.map((item, index) => {
            const itemId = item.querySelector('[data-itemid]')?.dataset.itemid;
            return itemId || `${index}:${item.textContent.trim()}`;
        }).join('|');
    }

    async function transferQueuedItems() {
        const queuedItems = getQueuedItems();
        const queueSignature = getQueueSignature(queuedItems);

        if (
            !automationEnabled ||
            transferInProgress ||
            queuedItems.length < REQUIRED_ITEM_COUNT ||
            queueSignature === lastSubmittedQueue
        ) {
            return;
        }

        const transferLink = getTransferLink();
        if (!transferLink) return;

        transferInProgress = true;
        const currentRunId = runId;
        transferLink.click();

        const confirmButton = await waitForVisible(
            '.ovl-wrap .js-transfer-message:not([style*="display: none"]) ~ .text-center .js-transfer-confirm, .ovl-wrap .js-transfer-confirm',
            MODAL_TIMEOUT,
            currentRunId
        );

        if (!confirmButton) {
            transferInProgress = false;
            if (automationEnabled && currentRunId === runId) {
                console.warn('[RevOnline Cart] Окно подтверждения перевода не найдено.');
            }
            return;
        }

        const overlay = confirmButton.closest('.ovl-wrap');
        lastSubmittedQueue = queueSignature;
        confirmButton.click();

        const successMessage = await waitForVisible('.js-ok', MODAL_TIMEOUT, currentRunId, overlay || document);
        if (!successMessage) {
            transferInProgress = false;
            if (automationEnabled && currentRunId === runId) {
                console.warn('[RevOnline Cart] Подтверждение успешного перевода не найдено.');
            }
            return;
        }

        const closeButton = findVisible('i.ovl-close.js-transfer-close', overlay || document);
        if (closeButton) {
            closeButton.click();
        } else {
            console.warn('[RevOnline Cart] Крестик окна результата не найден.');
        }

        transferInProgress = false;
    }

    function scheduleTransferAttempt() {
        clearTimeout(attemptTimer);
        attemptTimer = setTimeout(() => {
            attemptTimer = null;
            transferQueuedItems();
        }, 100);
    }

    function setAutomationEnabled(enabled) {
        automationEnabled = enabled;
        runId++;

        if (!enabled) {
            clearTimeout(attemptTimer);
            attemptTimer = null;
            transferInProgress = false;
            return;
        }

        scheduleTransferAttempt();
    }

    function findTransferContainer() {
        const container = document.querySelector('.transfer-btn');
        if (container) return container;

        const transferText = [...document.querySelectorAll('.btn__text')]
            .find(element => element.textContent.trim() === 'Перевести в игру');

        return transferText?.closest('.transfer-btn') || transferText?.closest('.btn')?.parentElement || null;
    }

    function updateButtonText(text, enabled) {
        text.textContent = `${enabled ? '☑' : '☐'} Авто отправка`;
    }

    function addAutoTransferCheckbox() {
        if (document.getElementById(AUTO_TRANSFER_PANEL_ID)) return;

        const transferContainer = findTransferContainer();
        if (!transferContainer) return;

        const label = document.createElement('label');
        label.id = AUTO_TRANSFER_PANEL_ID;
        label.className = 'btn btn--sm';
        label.style.cssText = `
            display: block !important;
            width: fit-content !important;
            margin: 10px auto 0 !important;
            background: #7428ac !important;
            cursor: pointer !important;
            user-select: none !important;
        `;

        const checkbox = document.createElement('input');
        checkbox.id = AUTO_TRANSFER_ID;
        checkbox.type = 'checkbox';
        checkbox.checked = automationEnabled;
        checkbox.style.cssText = `
            display: block !important;
            position: absolute !important;
            width: 1px !important;
            height: 1px !important;
            margin: 0 !important;
            padding: 0 !important;
            opacity: 0 !important;
            pointer-events: none !important;
        `;

        const text = document.createElement('span');
        text.className = 'btn__text';
        updateButtonText(text, automationEnabled);

        label.append(checkbox, text);

        checkbox.addEventListener('change', () => {
            setAutomationEnabled(checkbox.checked);
            updateButtonText(text, checkbox.checked);
        });

        transferContainer.appendChild(label);
    }

    const observer = new MutationObserver(() => {
        addAutoTransferCheckbox();
        if (automationEnabled) scheduleTransferAttempt();
    });

    addAutoTransferCheckbox();
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });
})();
