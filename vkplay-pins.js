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

    // Добавляем кнопки внутрь контейнера
    function addButtons(container) {
        if (container.querySelector('#copy-pins-button')) return; // уже есть
        const copyBtn = document.createElement('button');
        copyBtn.id = 'copy-pins-button';
        copyBtn.innerText = 'Скопировать видимые ПИН-коды';
        copyBtn.style.cssText = `
            background: #7428ac; color: #fff; border: none; padding: 10px 20px;
            border-radius: 4px; cursor: pointer; font-size: 14px; margin-right: 10px;
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
        `;
        openBtn.addEventListener('click', () => {
            console.log('[click] open all pins');
            document.querySelectorAll('.b-my-pin__get').forEach(btn => btn.click());
        });

        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '10px';
        wrapper.appendChild(copyBtn);
        wrapper.appendChild(openBtn);

        container.prepend(wrapper);
    }

    // Отслеживаем появление контейнера
    const observer = new MutationObserver(() => {
        const container = document.querySelector('.b-game__container');
        if (container) {
            console.log('[observer] container found');
            addButtons(container);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
