// vault-ui.js – Onboarding und Sperrbildschirm für den App-Schutz (Liquid Glass Design)

import { api, events, unwrap } from './api.js';
import { icon } from './icons.js';
import { escapeHtml } from './dom.js';

let onResume = () => {};
let overlayEl = null;
let clockInterval = null;

export function setVaultResume(cb) {
  onResume = typeof cb === 'function' ? cb : () => {};
}

/** Öffnet die Einrichtung des App-Schutzes (z. B. aus den Einstellungen). */
export function openVaultSetup() {
  showSetup(() => onResume());
}

/** Öffnet den Dialog zum Ändern des Hauptpassworts. */
export function openVaultChangePassword() {
  showChangePassword();
}

/** Sperrt die App sofort. */
export async function lockVaultNow() {
  try {
    await api.vault.lock();
  } catch {
    /* wird über vault:locked behandelt */
  }
}

function removeOverlay() {
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

/**
 * Prüft den Schutzstatus und zeigt ggf. Einrichtung/Sperrbildschirm.
 * Löst auf, sobald die App fortfahren darf.
 */
export function initVault() {
  return new Promise((resolve) => {
    let firstTime = true;
    const done = () => {
      if (firstTime) {
        firstTime = false;
        resolve();
      } else {
        onResume();
      }
    };

    events.on('vault:locked', (payload) => {
      const reason = payload && payload.reason === 'timeout'
        ? 'Automatisch wegen Inaktivität gesperrt.'
        : 'Dein Arbeitsbereich ist geschützt.';
      showLock(reason, done);
    });

    api.vault
      .status()
      .then((res) => {
        if (!res || res.ok === false) return resolve();
        if (res.unlocked) return resolve();
        if (!res.initialized) return showSetup(done);
        return showLock('', done);
      })
      .catch(() => resolve());
  });
}

function formatClock() {
  const now = new Date();
  const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  return { time, date };
}

function mountOverlay(inner) {
  removeOverlay();
  const { time, date } = formatClock();
  overlayEl = document.createElement('div');
  overlayEl.className = 'vault-overlay';
  overlayEl.innerHTML = `
    <div class="vault-topbar">
      <div class="vault-topbar__brand">
        <span class="vault-topbar__dot"></span>
        <span class="vault-topbar__name">SQL Hub</span>
        <span class="vault-topbar__badge">STUDIO</span>
      </div>
      <div class="vault-topbar__clock">
        <span class="vault-clock__time" id="vault-clock-time">${escapeHtml(time)}</span>
        <span class="vault-clock__sep">·</span>
        <span class="vault-clock__date" id="vault-clock-date">${escapeHtml(date)}</span>
      </div>
      <div class="vault-topbar__win">
        <button type="button" class="winbtn" id="vault-win-min" title="Minimieren" aria-label="Minimieren">
          <svg viewBox="0 0 12 12" width="12" height="12"><path d="M1 6h10" stroke="currentColor" stroke-width="1.2"/></svg>
        </button>
        <button type="button" class="winbtn" id="vault-win-max" title="Maximieren" aria-label="Maximieren">
          <svg viewBox="0 0 12 12" width="12" height="12"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        </button>
        <button type="button" class="winbtn winbtn--close" id="vault-win-close" title="Schließen" aria-label="Schließen">
          <svg viewBox="0 0 12 12" width="12" height="12"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" stroke-width="1.3"/></svg>
        </button>
      </div>
    </div>
    <div class="vault-stage">
      <div class="vault-card" id="vault-card-box">${inner}</div>
    </div>
  `;
  document.body.appendChild(overlayEl);

  const minBtn = overlayEl.querySelector('#vault-win-min');
  const maxBtn = overlayEl.querySelector('#vault-win-max');
  const closeBtn = overlayEl.querySelector('#vault-win-close');
  if (minBtn && api.window) minBtn.addEventListener('click', () => api.window.minimize());
  if (maxBtn && api.window) maxBtn.addEventListener('click', () => api.window.maximize());
  if (closeBtn && api.window) closeBtn.addEventListener('click', () => api.window.close());

  clockInterval = setInterval(() => {
    if (!overlayEl) return;
    const tEl = overlayEl.querySelector('#vault-clock-time');
    const dEl = overlayEl.querySelector('#vault-clock-date');
    const next = formatClock();
    if (tEl) tEl.textContent = next.time;
    if (dEl) dEl.textContent = next.date;
  }, 15000);

  return overlayEl;
}

function showError(msg) {
  const el = overlayEl && overlayEl.querySelector('.vault-error');
  const card = overlayEl && overlayEl.querySelector('#vault-card-box');
  if (el) {
    el.innerHTML = msg ? `${icon('alert-triangle', 14)} <span>${escapeHtml(msg)}</span>` : '';
    el.hidden = !msg;
  }
  if (msg && card) {
    card.classList.remove('is-shaking');
    // Reflow triggern für Shake-Animation
    void card.offsetWidth;
    card.classList.add('is-shaking');
  }
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> ${label || 'Bitte warten …'}`;
  } else if (btn.dataset.label) {
    btn.innerHTML = btn.dataset.label;
  }
}

/* ------------------------------ Einrichtung ----------------------------- */

function showSetup(done) {
  const el = mountOverlay(`
    <div class="vault-card__head">
      <div class="vault-emblem">
        <span class="vault-emblem__ring"></span>
        <span class="vault-card__mark">${icon('shield-check', 28)}</span>
      </div>
      <span class="vault-eyebrow">SICHERHEIT &amp; VERSCHLÜSSELUNG</span>
      <h1 class="vault-card__title">App-Schutz einrichten</h1>
      <p class="vault-card__sub">
        Schütze deine Datenbankprofile, Passwörter und Einstellungen lokal mit einem Hauptpasswort
        (AES-256-GCM &amp; scrypt). Dein Passwort verlässt niemals dein Gerät.
      </p>
    </div>
    <form class="vault-form" novalidate>
      <div class="field">
        <label for="vault-pw">Hauptpasswort festlegen</label>
        <div class="pw-wrap">
          <input type="password" id="vault-pw" autocomplete="new-password" placeholder="Mindestens 8 Zeichen …" />
          <button type="button" class="pw-toggle" id="vault-toggle" aria-label="Anzeigen">${icon('eye', 17)}</button>
        </div>
      </div>
      <div class="field">
        <label for="vault-pw2">Passwort bestätigen</label>
        <input type="password" id="vault-pw2" autocomplete="new-password" placeholder="Passwort wiederholen …" />
      </div>
      <div class="vault-error" hidden></div>
      <button type="submit" class="btn btn--primary vault-submit" id="vault-submit">
        ${icon('shield-check', 16)} App-Schutz aktivieren
      </button>
      <button type="button" class="btn btn--ghost vault-skip" id="vault-skip">Später einrichten (Standard-Systemschutz)</button>
      <p class="vault-hint">Du kannst das Hauptpasswort jederzeit in den Einstellungen aktivieren oder für den integrierten Passwort-Manager verwenden.</p>
    </form>
  `);

  const pw = el.querySelector('#vault-pw');
  const pw2 = el.querySelector('#vault-pw2');
  el.querySelector('#vault-toggle').addEventListener('click', () => {
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    el.querySelector('#vault-toggle').innerHTML = icon(show ? 'eye-off' : 'eye', 17);
  });
  el.querySelector('#vault-skip').addEventListener('click', () => {
    removeOverlay();
    done();
  });

  el.querySelector('.vault-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = el.querySelector('#vault-submit');
    if (pw.value.length < 8) return showError('Mindestens 8 Zeichen erforderlich.');
    if (pw.value !== pw2.value) return showError('Die Passwörter stimmen nicht überein.');
    setBusy(submit, true, 'Wird eingerichtet …');
    try {
      const res = await api.vault.create(pw.value);
      unwrap(res);
      removeOverlay();
      done();
    } catch (err) {
      showError(err.message);
      setBusy(submit, false);
    }
  });

  setTimeout(() => pw.focus(), 30);
}

/* --------------------- Hauptpasswort ändern --------------------- */

function showChangePassword() {
  const el = mountOverlay(`
    <div class="vault-card__head">
      <div class="vault-emblem">
        <span class="vault-emblem__ring"></span>
        <span class="vault-card__mark">${icon('key-round', 28)}</span>
      </div>
      <span class="vault-eyebrow">SICHERHEITSVERWALTUNG</span>
      <h1 class="vault-card__title">Hauptpasswort ändern</h1>
      <p class="vault-card__sub">Gib dein bisheriges Passwort sowie das neue Hauptpasswort ein. Alle gespeicherten Profile werden automatisch neu verschlüsselt.</p>
    </div>
    <form class="vault-form" novalidate>
      <div class="field">
        <label for="vault-old">Aktuelles Passwort</label>
        <input type="password" id="vault-old" autocomplete="current-password" placeholder="Aktuelles Passwort eingeben …" />
      </div>
      <div class="field">
        <label for="vault-new">Neues Hauptpasswort</label>
        <div class="pw-wrap">
          <input type="password" id="vault-new" autocomplete="new-password" placeholder="Mindestens 8 Zeichen …" />
          <button type="button" class="pw-toggle" id="vault-new-toggle" aria-label="Anzeigen">${icon('eye', 17)}</button>
        </div>
      </div>
      <div class="field">
        <label for="vault-new2">Neues Passwort bestätigen</label>
        <input type="password" id="vault-new2" autocomplete="new-password" placeholder="Neues Passwort wiederholen …" />
      </div>
      <div class="vault-error" hidden></div>
      <button type="submit" class="btn btn--primary vault-submit" id="vault-change-submit">
        ${icon('check', 16)} Passwort aktualisieren
      </button>
      <button type="button" class="btn btn--ghost vault-skip" id="vault-change-cancel">Abbrechen</button>
    </form>
  `);

  const oldPw = el.querySelector('#vault-old');
  const newPw = el.querySelector('#vault-new');
  const newPw2 = el.querySelector('#vault-new2');
  el.querySelector('#vault-new-toggle').addEventListener('click', () => {
    const show = newPw.type === 'password';
    newPw.type = show ? 'text' : 'password';
    el.querySelector('#vault-new-toggle').innerHTML = icon(show ? 'eye-off' : 'eye', 17);
  });
  el.querySelector('#vault-change-cancel').addEventListener('click', removeOverlay);

  el.querySelector('.vault-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = el.querySelector('#vault-change-submit');
    if (newPw.value.length < 8) return showError('Mindestens 8 Zeichen erforderlich.');
    if (newPw.value !== newPw2.value) return showError('Die Passwörter stimmen nicht überein.');
    setBusy(submit, true, 'Aktualisiere …');
    try {
      const res = await api.vault.changePassword(oldPw.value, newPw.value);
      unwrap(res);
      removeOverlay();
      onResume();
    } catch (err) {
      showError(err.message);
      setBusy(submit, false);
      oldPw.select();
    }
  });

  setTimeout(() => oldPw.focus(), 30);
}

/* --------------------- Sperrbildschirm --------------------- */

function showLock(message, done) {
  const safeMsg = escapeHtml(
    message || 'Gib dein Passwort ein oder verwende Touch ID / Biometrie, um deinen Arbeitsbereich freizugeben.'
  );
  const el = mountOverlay(`
    <div class="vault-card__head">
      <div class="vault-emblem">
        <span class="vault-emblem__ring"></span>
        <span class="vault-card__mark">${icon('lock', 28)}</span>
      </div>
      <span class="vault-eyebrow">ARBEITSBEREICH GESCHÜTZT</span>
      <h1 class="vault-card__title">SQL Hub ist gesperrt</h1>
      <p class="vault-card__sub">${safeMsg}</p>
    </div>
    <form class="vault-form" novalidate>
      <div class="field">
        <label for="vault-unlock-pw">Passwort</label>
        <div class="pw-wrap vault-pw-wrap">
          <input type="password" id="vault-unlock-pw" autocomplete="current-password" placeholder="Passwort eingeben …" />
          <button type="button" class="pw-toggle" id="vault-unlock-toggle" aria-label="Passwort anzeigen">${icon('eye', 17)}</button>
        </div>
      </div>
      <div class="vault-error" hidden></div>
      <button type="submit" class="btn btn--primary vault-submit" id="vault-unlock-submit">
        ${icon('lock-open', 16)} Entsperren
      </button>
      <button type="button" class="btn btn--subtle vault-skip vault-bio-btn" id="vault-unlock-bio" hidden>
        ${icon('fingerprint', 17)} <span id="vault-unlock-bio-label">Mit Windows Hello entsperren</span>
      </button>
      <div class="vault-card__foot">
        <span class="vault-foot-pill">${icon('shield', 12)} AES-256-GCM geschützt</span>
      </div>
    </form>
  `);

  const pw = el.querySelector('#vault-unlock-pw');
  const bioBtn = el.querySelector('#vault-unlock-bio');
  const bioLabel = el.querySelector('#vault-unlock-bio-label');

  if (api.biometrics && api.biometrics.status) {
    api.biometrics.status().then((bRes) => {
      if (bRes && bRes.vaultEnrolled && bioBtn) {
        bioBtn.hidden = false;
        if (bioLabel) {
          bioLabel.textContent = bRes.unlockButtonLabel || (bRes.touchIdAvailable
            ? 'Mit Touch ID entsperren'
            : `Mit ${bRes.methodLabel || 'Windows Hello'} entsperren`);
        }
      }
    }).catch(() => {});
  }

  if (bioBtn) {
    bioBtn.addEventListener('click', async () => {
      setBusy(bioBtn, true, 'Prüfe Biometrie …');
      try {
        const res = await api.biometrics.unlockVault();
        unwrap(res);
        removeOverlay();
        done();
      } catch (err) {
        showError(err.message);
        setBusy(bioBtn, false);
      }
    });
  }

  el.querySelector('#vault-unlock-toggle').addEventListener('click', () => {
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    el.querySelector('#vault-unlock-toggle').innerHTML = icon(show ? 'eye-off' : 'eye', 17);
  });

  el.querySelector('.vault-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = el.querySelector('#vault-unlock-submit');
    setBusy(submit, true, 'Entsperren …');
    try {
      const res = await api.vault.unlock(pw.value);
      unwrap(res);
      removeOverlay();
      done();
    } catch (err) {
      showError(err.message || 'Falsches Passwort.');
      setBusy(submit, false);
      pw.select();
    }
  });

  setTimeout(() => pw.focus(), 30);
}
