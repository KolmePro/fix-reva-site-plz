(function() {
    'use strict';

    console.log('[VKPlay Pins Helper] loaded');

    function getUnusedPinCodes() {
        const pins = [];
        document.querySelectorAll('.b-my-pin').forEach(pin => {
            const btn = pin.querySelector('[data-testid="pin-code-buttons__link"]');
            const input = pin.querySelector('.b-input_pin');
            if (btn && input) pins.push(input.value);
        });
        return pins;
    }

    function showPinCodesPopup(pinCodes) {
        const popup = document.createElement('div');
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
            max-width: 400px;
            width: 90%;
            text-align: center;
            color: #fff;
            font-family: Arial, sans-serif;
        `;
        popup.innerHTML = `
            <div style="margin-bottom: 15px;">
                <h3 style="margin: 0;">Всего ПИН-кодов (${pinCodes.length})</h3>
            </div>
            <p style="margin-bottom: 15px; color: #ccc; font-size: 14px;">
                Скопируйте эти ПИН-коды и вставьте их в поле активации.
            </p>
            <textarea style="
                width: 100%;
                height: 150px;
                resize: none;
                margin-bottom: 15px;
                padding: 10px;
                border-radius: 4px;
                border: 1px solid #444;
                background: #2d2d2d;
                color: #fff;
            ">${pinCodes.join('\n')}</textarea>
            <button style="
                background: #7428ac;
                color: #fff;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            ">Закрыть</button>
        `;
        popup.querySelector('button').addEventListener('click', () => popup.remove());
        document.body.appendChild(popup);
    }

    function ensureButtonPanel() {
        let panel = document.querySelector('#vkplay-pins-panel');
        if (panel) return panel;

        panel = document.createElement('div');
        panel.id = 'vkplay-pins-panel';
        panel.style.cssText = `
            position: fixed !important;
            left: 20px !important;
            right: auto !important;
            top: auto !important;
            bottom: 20px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
            margin: 0 !important;
            padding: 0 !important;
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
        button.addEventListener('click', () => {
            console.log('[click] copy pins');
            showPinCodesPopup(getUnusedPinCodes());
        });
    }

    function bindOpenButton(button) {
        if (button.dataset.vkplayPinsBound === 'open') return;
        button.dataset.vkplayPinsBound = 'open';
        button.addEventListener('click', () => {
            console.log('[click] open all pins');
            document.querySelectorAll('.b-my-pin__get').forEach(btn => btn.click());
        });
    }

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
        if (migrateExistingButtons()) return;

        const panel = ensureButtonPanel();

        const copyBtn = document.createElement('button');
        copyBtn.id = 'copy-pins-button';
        copyBtn.innerText = 'Скопировать видимые ПИН-коды';
        applyButtonStyles(copyBtn);
        bindCopyButton(copyBtn);

        const openBtn = document.createElement('button');
        openBtn.id = 'open-all-pins-button';
        openBtn.innerText = 'Открыть все ПИН-коды';
        applyButtonStyles(openBtn);
        bindOpenButton(openBtn);

        panel.appendChild(copyBtn);
        panel.appendChild(openBtn);
    }

    const observer = new MutationObserver(() => {
        const hasPins = document.querySelector('.b-my-pin') || document.querySelector('.b-game__container');
        if (hasPins) {
            console.log('[observer] pin area found');
            addButtons();
        }
    });

    if (document.querySelector('.b-my-pin') || document.querySelector('.b-game__container')) {
        addButtons();
    }

    observer.observe(document.body, { childList: true, subtree: true });
})();
