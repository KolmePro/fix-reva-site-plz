(function() {
    'use strict';

    console.log('[VKPlay Pins Helper] loaded');

    // Получаем видимые ПИН-коды
    function getUnusedPinCodes() {
        const pins = [];
        document.querySelectorAll('.b-my-pin').forEach(pin => {
            const btn = pin.querySelector('[data-testid="pin-code-buttons__link"]');
            const input = pin.querySelector('.b-input_pin');
            if (btn && input) pins.push(input.value);
        });
        return pins;
    }

    // Показываем попап
    function showPinCodesPopup(pinCodes) {
        const popupHTML = document.createElement('div');
        popupHTML.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: #1e1e1e; padding: 20px; border: 1px solid #444;
            box-shadow: 0 0 10px rgba(0,0,0,0.5); z-index: 10000; border-radius: 8px;
            max-width: 400px; width: 90%; text-align: center; color: #fff; font-family: Arial, sans-serif;
        `;
        popupHTML.innerHTML = `
            <div style="margin-bottom: 15px;">
                <h3 style="margin: 0;">Всего ПИН-кодов (${pinCodes.length})</h3>
            </div>
            <p style="margin-bottom: 15px; color: #ccc; font-size: 14px;">
                Скопируйте эти ПИН-коды и вставьте их в поле активации.
            </p>
            <textarea style="
                width: 100%; height: 150px; resize: none; margin-bottom: 15px; padding: 10px;
                border-radius: 4px; border: 1px solid #444; background: #2d2d2d; color: #fff;
            ">${pinCodes.join('\n')}</textarea>
            <button style="
                background: #7428ac; color: #fff; border: none; padding: 10px 20px;
                border-radius: 4px; cursor: pointer; font-size: 14px;
            ">Закрыть</button>
        `;
        popupHTML.querySelector('button').addEventListener('click', () => popupHTML.remove());
        document.body.appendChild(popupHTML);
    }

    function ensureButtonPanel() {
        let panel = document.querySelector('#vkplay-pins-panel');
        if (panel) return panel;

        panel = document.createElement('div');
        panel.id = 'vkplay-pins-panel';
        panel.style.cssText = `
            position: fixed;
            left: 20px;
            bottom: 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            z-index: 10000;
        `;
        document.body.appendChild(panel);
        return panel;
    }

    // Добавляем кнопки в фиксированную панель поверх страницы
    function addButtons() {
        if (document.querySelector('#copy-pins-button')) return; // уже есть

        const panel = ensureButtonPanel();
        const copyBtn = document.createElement('button');
        copyBtn.id = 'copy-pins-button';
        copyBtn.innerText = 'Скопировать видимые ПИН-коды';
        copyBtn.style.cssText = `
            background: #7428ac; color: #fff; border: none; padding: 10px 20px;
            border-radius: 4px; cursor: pointer; font-size: 14px;
            width: 260px; text-align: left;
        `;
        copyBtn.addEventListener('click', () => {
            console.log('[click] copy pins');
            const pins = getUnusedPinCodes();
            showPinCodesPopup(pins);
        });

        const openBtn = document.createElement('button');
        openBtn.id = 'open-all-pins-button';
        openBtn.innerText = 'Открыть все ПИН-коды';
        openBtn.style.cssText = `
            background: #7428ac; color: #fff; border: none; padding: 10px 20px;
            border-radius: 4px; cursor: pointer; font-size: 14px;
            width: 260px; text-align: left;
        `;
        openBtn.addEventListener('click', () => {
            console.log('[click] open all pins');
            document.querySelectorAll('.b-my-pin__get').forEach(btn => btn.click());
        });

        panel.appendChild(copyBtn);
        panel.appendChild(openBtn);
    }

    // Отслеживаем готовность страницы и возвращаем панель после SPA-перерисовок
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
