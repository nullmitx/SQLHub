// password-prompt.js – modaler Dialog zur Eingabe eines Passworts oder Freigabe per Touch ID / Biometrie

import { icon } from './icons.js';
import { escapeHtml } from './dom.js';

/**
 * Zeigt einen modalen Passwortdialog (schließt nur über X, Abbrechen oder Esc).
 * @param {{ title?: string, message?: string, hint?: string, label?: string, confirmLabel?: string, allowBiometric?: boolean, biometricLabel?: string }} opts
 * @returns {Promise<string|null>} Passwort, '__BIOMETRIC_UNLOCK__' oder null (abgebrochen)
 */
export function promptPassword(opts = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const bioBtnHtml = opts.allowBiometric
      ? `<button type="button" class="btn btn--subtle" id="pp-bio" title="Mit Fingerabdruck / Touch ID bestätigen">
           ${icon('fingerprint', 16)} ${escapeHtml(opts.biometricLabel || 'Touch ID / Biometrie')}
         </button>`
      : '';

    overlay.innerHTML = `
      <div class="modal modal--sm">
        <div class="modal__header">
          <div>
            <div class="modal__eyebrow">AUTORISIERUNG ERFORDERLICH</div>
            <h2 class="modal__title">${escapeHtml(opts.title || 'Profil entsperren')}</h2>
          </div>
          <button type="button" class="modal__close" data-close title="Schließen (Esc)" aria-label="Schließen">${icon('x', 18)}</button>
        </div>
        <form class="modal__body" novalidate>
          <p class="muted" style="margin:0 0 14px;font-size:13px;">${escapeHtml(opts.message || 'Dieses Profil ist durch ein Passwort geschützt.')}</p>
          <div class="field">
            <label for="pp-pw">${escapeHtml(opts.label || 'Profil-Passwort')}</label>
            <div class="pw-wrap">
              <input type="password" id="pp-pw" autocomplete="current-password" placeholder="Passwort eingeben" />
              <button type="button" class="pw-toggle" id="pp-toggle" aria-label="Anzeigen">${icon('eye', 17)}</button>
            </div>
            ${opts.hint ? `<span class="hint">Hinweis: ${escapeHtml(opts.hint)}</span>` : ''}
          </div>
          <p class="vault-error" hidden></p>
        </form>
        <div class="modal__footer ${opts.allowBiometric ? 'modal__footer--split' : ''}">
          ${bioBtnHtml}
          <div style="display:flex;gap:10px;margin-left:auto;">
            <button type="button" class="btn btn--ghost" data-close>Abbrechen</button>
            <button type="button" class="btn btn--primary" id="pp-ok">${escapeHtml(opts.confirmLabel || 'Entsperren')}</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('modal-root').appendChild(overlay);

    const modalEl = overlay.querySelector('.modal');
    const pw = overlay.querySelector('#pp-pw');
    const err = overlay.querySelector('.vault-error');

    const finish = (value) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish(null);
      }
    };
    document.addEventListener('keydown', onKey);

    // Klick neben das Fenster schließt den Dialog NICHT, sondern hebt das X-Kästchen kurz hervor
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay && modalEl) {
        modalEl.classList.remove('modal--bump');
        void modalEl.offsetWidth;
        modalEl.classList.add('modal--bump');
      }
    });

    overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => finish(null)));
    overlay.querySelector('#pp-toggle').addEventListener('click', () => {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      overlay.querySelector('#pp-toggle').innerHTML = icon(show ? 'eye-off' : 'eye', 17);
    });

    const bioBtn = overlay.querySelector('#pp-bio');
    if (bioBtn) {
      bioBtn.addEventListener('click', () => finish('__BIOMETRIC_UNLOCK__'));
    }

    const submit = () => {
      if (!pw.value) {
        err.textContent = 'Bitte ein Passwort eingeben.';
        err.hidden = false;
        return;
      }
      finish(pw.value);
    };
    overlay.querySelector('#pp-ok').addEventListener('click', submit);
    overlay.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });
    setTimeout(() => pw.focus(), 40);
  });
}
