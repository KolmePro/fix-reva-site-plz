// === Автооткрытие карточек с модалкой выбора призов и действия ===

let autoOpenInterval = null;

function stopAutoOpenCards(iframeDocument) {
    clearInterval(autoOpenInterval);
    autoOpenInterval = null;
    const btn = iframeDocument.querySelector('#violet-open-cards');
    if (btn) btn.textContent = 'Авто-открытие';
}

function confirmPrize(iframeDocument) {
    const yesBtn = iframeDocument.querySelector('.modalDialog .get_prize');
    if (yesBtn) {
        yesBtn.click();
        console.log('✅ Приз забран — продолжаем открытие');
    }
}

function autoOpenCards(iframeDocument) {
    if (autoOpenInterval) return;

    showPrizeSelector(iframeDocument, (selectedPrizeIds, action) => {
        console.log('Выбранные призы:', selectedPrizeIds);
        console.log('Действие при появлении приза:', action);

        const handleUnselectedPrize = () => {
            for (let i = 1; i <= 5; i++) {
                const prize = iframeDocument.querySelector(`#prizeRow${i}`);
                if (prize && prize.classList.contains('full') && !selectedPrizeIds.includes(i)) {
                    const rowBlock = iframeDocument.querySelector(`#cardRow${i}`);
                    if (rowBlock) {
                        rowBlock.click();
                        setTimeout(() => {
                            const confirmBtn = iframeDocument.querySelector('.modalDialogCard .get_card');
                            if (confirmBtn) {
                                confirmBtn.click();
                                // после подтверждения проверяем, не появился ли нужный приз
                                setTimeout(() => {
                                    if (checkAndClaimExistingPrize()) return;
                                    const card = iframeDocument.querySelector("div.cardpack.js-cardpack > span");
                                    if (card) card.click();
                                }, 800);
                            }
                        }, 500);
                        return true; // приостановим основной интервал
                    }
                }
            }
            return false;
        };


        const checkAndClaimExistingPrize = () => {
            let blocked = false;

            // сначала обрабатываем ненужные призы
            if (handleUnselectedPrize()) {
                blocked = true;
            }

            // потом проверяем нужные
            for (let i of selectedPrizeIds) {
                const el = iframeDocument.querySelector(`#prizeRow${i}`);
                if (el && el.classList.contains('full')) {
                    if (action === 'stop') {
                        stopAutoOpenCards(iframeDocument);
                        return true;
                    } else if (action === 'auto') {
                        el.click();
                        setTimeout(() => {
                            const confirmBtn = iframeDocument.querySelector('.modal.modalDialog .get_prize');
                            if (confirmBtn) confirmBtn.click();
                        }, 300);
                        blocked = true;
                    }
                }
            }
            return blocked;
        };

        if (checkAndClaimExistingPrize()) return;

        autoOpenInterval = setInterval(() => {
            if (handleUnselectedPrize()) return;

            for (let i of selectedPrizeIds) {
                const el = iframeDocument.querySelector(`#prizeRow${i}`);
                if (el && el.classList.contains('full')) {
                    if (action === 'stop') {
                        stopAutoOpenCards(iframeDocument);
                        return;
                    } else if (action === 'auto') {
                        el.click();
                        setTimeout(() => {
                            const confirmBtn = iframeDocument.querySelector('.modal.modalDialog .get_prize');
                            if (confirmBtn) confirmBtn.click();
                        }, 300);
                        return;
                    }
                }
            }

            const card = iframeDocument.querySelector("div.cardpack.js-cardpack > span");
            if (card) card.click();
        }, 2000);

        const btn = iframeDocument.querySelector('#violet-open-cards');
        if (btn) btn.textContent = 'СТОП!';
    });
}

function showPrizeSelector(iframeDocument, onConfirm) {
    if (iframeDocument.querySelector('#violet-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'violet-modal';
    modal.style = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        font-family: 'HelveticaLight', sans-serif;
    `;

    const modalInner = document.createElement('div');
    modalInner.style = `
        background: #1c1c1c;
        padding: 30px;
        border: 2px solid #d0c696;
        border-radius: 10px;
        color: #d0c696;
        width: 700px;
        max-height: 90%;
        overflow-y: auto;
        box-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
    `;

    modalInner.innerHTML = `
        <h2 style="margin-top:0; font-size:24px; text-align: center;">Выберите призы, которые хотите забирать</h2>
        <div id="prize-options" style="display:flex; flex-direction: column; gap:8px; margin: 20px 0;"></div>
        <div style="margin: 20px 0 10px;">
            <div style="margin-bottom: 8px; font-size: 16px;">Когда появится желаемый приз:</div>
            <label style="display: block; margin-bottom: 6px;">
                <input type="radio" name="prize-action" value="stop" checked>
                Остановиться
            </label>
            <label style="display: block;">
                <input type="radio" name="prize-action" value="auto">
                Забрать автоматически
            </label>
        </div>
        <div style="text-align:right; margin-top:10px;">
            <button id="prize-confirm" style="padding:10px 20px; background:#7428ac; color:white; border:none; font-size:16px; cursor:pointer;">Подтвердить</button>
        </div>
    `;

    modal.appendChild(modalInner);
    iframeDocument.body.appendChild(modal);

    const container = modalInner.querySelector('#prize-options');

    for (let i = 1; i <= 5; i++) {
        const prizeEl = iframeDocument.querySelector(`#prizeRow${i}`);
        if (!prizeEl) continue;

        const icon = prizeEl.dataset.icon;
        const title = prizeEl.dataset.title;

        const wrapper = document.createElement('div');
        wrapper.classList.add('violet-prize-option');
        wrapper.dataset.prizeId = i;
        wrapper.style = `
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 10px;
            border: 2px solid transparent;
            cursor: pointer;
            border-radius: 8px;
            transition: 0.2s;
        `;

        wrapper.innerHTML = `
            <img src="${icon}" alt="${title}" style="width: 96px; height: 96px;">
            <div class="title" style="font-size: 18px; color: #d0c696;">${title}</div>
        `;

        wrapper.onclick = () => {
            wrapper.classList.toggle('selected');
            const titleDiv = wrapper.querySelector('.title');
            if (wrapper.classList.contains('selected')) {
                wrapper.style.border = '2px solid gold';
                titleDiv.style.color = 'gold';
            } else {
                wrapper.style.border = '2px solid transparent';
                titleDiv.style.color = '#d0c696';
            }
        };

        container.appendChild(wrapper);
    }

    modalInner.querySelector('#prize-confirm').onclick = () => {
        const selected = [...container.querySelectorAll('.violet-prize-option.selected')]
            .map(el => parseInt(el.dataset.prizeId));
        const action = modalInner.querySelector('input[name="prize-action"]:checked')?.value || 'stop';

        // 🎨 Подсвечиваем выбранные призы на сайте цветом #7428ac
        for (let i = 1; i <= 5; i++) {
            const prizeBlock = iframeDocument.querySelector(`#prizeRow${i}`);
            if (prizeBlock) {
                prizeBlock.style.background = selected.includes(i) ? '#7428ac' : '';
            }
        }

        iframeDocument.body.removeChild(modal);
        onConfirm(selected, action);
    };


}

function addButtonToIframe(iframe) {
    const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;

    const billingBtn = iframeDocument.querySelector('a.billing');
    if (billingBtn && !iframeDocument.querySelector('#violet-open-cards')) {
        billingBtn.insertAdjacentHTML('afterend', `
         <a class="billing" style="background: #7428ac; top: 200px;" id="violet-open-cards" href="#">Авто-открытие</a>
    `);

        iframeDocument.querySelector('#violet-open-cards').onclick = (e) => {
            e.preventDefault();
            if (autoOpenInterval) {
                stopAutoOpenCards(iframeDocument);
            } else {
                autoOpenCards(iframeDocument);
            }
        };
    }

}

function tryAttachButton() {
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentWindow.document.readyState === 'complete') {
        addButtonToIframe(iframe);
    } else if (iframe) {
        iframe.onload = () => addButtonToIframe(iframe);
    }
}

const observer = new MutationObserver(() => {
    if (document.querySelector('iframe')) {
        tryAttachButton();
        observer.disconnect();
    }
});

observer.observe(document.body, {childList: true, subtree: true});
