// confirm.js – wiederverwendbarer Bestätigungsdialog (schließt über X, Abbrechen oder Esc)

import { icon } from './icons.js';

export function confirmDialog({
  title,
  message,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  danger = false
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal--sm">
        <div class="modal__header">
          <h2 class="modal__title"></h2>
          <button type="button" class="modal__close" data-cancel title="Schließen (Esc)" aria-label="Schließen">${icon('x', 18)}</button>
        </div>
        <div class="modal__body"><p class="muted" style="margin:0;font-size:13.5px;line-height:1.5;"></p></div>
        <div class="modal__footer">
          <button type="button" class="btn btn--ghost" data-cancel-btn></button>
          <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm></button>
        </div>
      </div>`;
    const modalEl = overlay.querySelector('.modal');
    overlay.querySelector('.modal__title').textContent = title;
    overlay.querySelector('.modal__body p').textContent = message;
    overlay.querySelector('[data-cancel-btn]').textContent = cancelLabel;
    const confirmBtn = overlay.querySelector('[data-confirm]');
    confirmBtn.textContent = confirmLabel;
    document.getElementById('modal-root').appendChild(overlay);

    const done = (val) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    overlay.querySelectorAll('[data-cancel], [data-cancel-btn]').forEach((b) =>
      b.addEventListener('click', () => done(false))
    );
    confirmBtn.addEventListener('click', () => done(true));

    // Klick neben das Fenster schließt den Dialog NICHT
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay && modalEl) {
        modalEl.classList.remove('modal--bump');
        void modalEl.offsetWidth;
        modalEl.classList.add('modal--bump');
      }
    });

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); done(false); }
      if (e.key === 'Enter') done(true);
    }
    document.addEventListener('keydown', onKey);
    setTimeout(() => confirmBtn.focus(), 50);
  });
}
