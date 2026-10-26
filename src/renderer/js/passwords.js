// passwords.js – Eigene Seite für den Passwort-Manager (nur für Profile mit „Zusätzlicher Zugriffsschutz")

import { api, unwrap } from './api.js';
import { state, loadProfiles } from './state.js';
import { showToast } from './toast.js';
import { confirmDialog } from './confirm.js';
import { icon, DEFAULT_PROFILE_ICON } from './icons.js';
import { openVaultSetup } from './vault-ui.js';
import { promptPassword } from './password-prompt.js';
import { escapeHtml, safeHost } from './dom.js';
import { openProfileDialog } from './profile-dialog.js';

const view = document.getElementById('view-passwords');

let pwSession = {
  unlocked: false,
  items: []
};

export function lockPasswordManagerSession() {
  pwSession = { unlocked: false, items: [] };
}

async function fetchLockPasswordItems(masterPassword = '') {
  if (!api.credentials || !api.credentials.listForManager) {
    return { ok: false, errors: ['Passwort-Manager-Schnittstelle nicht verfügbar.'] };
  }
  const res = await api.credentials.listForManager(masterPassword);
  if (res && res.ok && Array.isArray(res.items)) {
    // Sicherheits-Garantie: Nur Profile anzeigen, bei denen „Zusätzlicher Zugriffsschutz" (lockEnabled) aktiv ist
    const lockItems = res.items.filter((it) => Boolean(it.lockEnabled));
    pwSession.unlocked = true;
    pwSession.items = lockItems;
    return { ok: true, items: lockItems };
  }
  return res;
}

export async function renderPasswords() {
  if (!view) return;
  view.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';

  let vaultStatus = { initialized: false, unlocked: false };
  let bioStatus = {
    available: false,
    touchIdAvailable: false,
    vaultEnrolled: false,
    methodLabel: 'Windows Hello',
    unlockButtonLabel: 'Mit Windows Hello entsperren'
  };

  try {
    const vRes = await api.vault.status();
    if (vRes && vRes.ok !== false) vaultStatus = vRes;
  } catch { /* ignore */ }
  try {
    if (api.biometrics && api.biometrics.status) {
      const bRes = await api.biometrics.status();
      if (bRes && bRes.ok !== false) bioStatus = bRes;
    }
  } catch { /* ignore */ }

  const lockedProfileCount = (state.profiles || []).filter((p) => Boolean(p.lockEnabled)).length;

  view.innerHTML = `
    <div class="page-head">
      <div class="page-head__titles">
        <div class="page-eyebrow">SYSTEM &amp; SICHERHEIT · ZUGRIFFSSCHUTZ-TRESOR</div>
        <h1 class="page-title">Passwort-Manager</h1>
        <p class="page-sub">Verwalte ausschließlich die Schutz-Passwörter deiner Datenbankprofile mit aktivem „Zusätzlichem Zugriffsschutz"</p>
      </div>
      <div class="page-head__actions" id="pw-page-head-actions"></div>
    </div>

    <div class="panel panel--wide" id="pw-page-main-panel">
      <div class="panel__header-bar">
        <div>
          <h2>${icon('key-round', 17)} Gespeicherte Zugriffsschutz-Passwörter (${lockedProfileCount})</h2>
          <p class="panel__desc">Hier erscheinen ausschließlich Profile, für die unter „Zusätzlicher Zugriffsschutz" ein eigenes Profil-Passwort eingerichtet wurde (keine Datenbank-Logins).</p>
        </div>
        <div class="pw-mgr-head-actions" id="pw-page-toolbar"></div>
      </div>
      <div id="pw-page-body"></div>
    </div>
  `;

  renderPasswordManagerContent(vaultStatus, bioStatus);
}

function renderPasswordManagerContent(vaultStatus, bioStatus) {
  const body = view.querySelector('#pw-page-body');
  const toolbar = view.querySelector('#pw-page-toolbar');
  const headActions = view.querySelector('#pw-page-head-actions');
  if (!body) return;

  if (!pwSession.unlocked) {
    if (toolbar) toolbar.innerHTML = '';
    if (headActions) headActions.innerHTML = '';
    const hasMaster = Boolean(vaultStatus && vaultStatus.initialized);
    const bioBtnText = bioStatus.unlockButtonLabel || `Mit ${bioStatus.methodLabel || 'Windows Hello'} entsperren`;

    body.innerHTML = `
      <div class="pw-vault-gate">
        <div class="pw-vault-gate__left">
          <div class="pw-vault-gate__icon">${icon('lock', 22)}</div>
          <div class="pw-vault-gate__text">
            <div class="pw-vault-gate__title">
              ${hasMaster ? 'Passwort-Manager ist gesperrt' : 'Passwort-Manager für zusätzlichen Zugriffsschutz'}
            </div>
            <div class="pw-vault-gate__sub">
              ${hasMaster
                ? 'Gib dein Hauptpasswort ein, um die Profil-Passwörter deiner geschützten Datenbankprofile („Zusätzlicher Zugriffsschutz") einzusehen, zu kopieren oder zu ändern.'
                : 'Entsperre die Übersicht direkt oder richte ein Hauptpasswort ein, um deine Profil-Schutzpasswörter zusätzlich abzusichern.'}
            </div>
          </div>
        </div>
        <form class="pw-vault-gate__form" id="pw-page-unlock-form" novalidate>
          ${hasMaster ? `
            <div class="pw-wrap pw-vault-gate__input">
              <input type="password" id="pw-page-master-input" placeholder="Hauptpasswort eingeben …" autocomplete="current-password" />
              <button type="button" class="pw-toggle" id="pw-page-master-toggle" aria-label="Passwort anzeigen">${icon('eye', 16)}</button>
            </div>
            <button type="submit" class="btn btn--primary" id="pw-page-unlock-btn">
              ${icon('lock-open', 15)} Entsperren
            </button>
            ${(bioStatus.vaultEnrolled || bioStatus.touchIdAvailable) ? `
              <button type="button" class="btn btn--subtle" id="pw-page-bio-btn" title="${escapeHtml(bioBtnText)}">
                ${icon('fingerprint', 16)} <span>${escapeHtml(bioStatus.methodLabel || 'Windows Hello')}</span>
              </button>
            ` : ''}
          ` : `
            <button type="button" class="btn btn--subtle" id="pw-page-setup-master">
              ${icon('shield-check', 15)} Hauptpasswort einrichten
            </button>
            <button type="submit" class="btn btn--primary" id="pw-page-unlock-btn">
              ${icon('lock-open', 15)} Passwort-Manager öffnen
            </button>
          `}
        </form>
      </div>
    `;

    const form = body.querySelector('#pw-page-unlock-form');
    const pwInp = body.querySelector('#pw-page-master-input');
    const pwTog = body.querySelector('#pw-page-master-toggle');
    const bioBtn = body.querySelector('#pw-page-bio-btn');
    const setupBtn = body.querySelector('#pw-page-setup-master');

    if (pwTog && pwInp) {
      pwTog.addEventListener('click', () => {
        const show = pwInp.type === 'password';
        pwInp.type = show ? 'text' : 'password';
        pwTog.innerHTML = icon(show ? 'eye-off' : 'eye', 16);
      });
    }

    if (setupBtn) {
      setupBtn.addEventListener('click', () => openVaultSetup());
    }

    if (bioBtn && api.biometrics && api.biometrics.listForManager) {
      bioBtn.addEventListener('click', async () => {
        bioBtn.disabled = true;
        try {
          const res = await api.biometrics.listForManager();
          if (!res || !res.ok) {
            showToast({
              type: 'error',
              message: (res && res.errors && res.errors.join(' ')) || 'Biometrische Freigabe fehlgeschlagen.'
            });
            bioBtn.disabled = false;
            return;
          }
          pwSession.unlocked = true;
          pwSession.items = (res.items || []).filter((it) => Boolean(it.lockEnabled));
          renderPasswordManagerContent(vaultStatus, bioStatus);
          showToast({ type: 'success', message: 'Passwort-Manager entsperrt.' });
        } catch (err) {
          bioBtn.disabled = false;
          showToast({ type: 'error', message: err.message });
        }
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const val = pwInp ? pwInp.value : '';
        if (hasMaster && !val) {
          showToast({ type: 'warning', message: 'Bitte gib dein Hauptpasswort ein.' });
          if (pwInp) pwInp.focus();
          return;
        }
        const res = await fetchLockPasswordItems(val);
        if (!res || !res.ok) {
          showToast({
            type: 'error',
            title: 'Zugriff verweigert',
            message: (res && res.errors && res.errors.join(' ')) || 'Falsches Passwort.'
          });
          if (pwInp) pwInp.select();
          return;
        }
        renderPasswordManagerContent(vaultStatus, bioStatus);
        showToast({ type: 'success', message: 'Passwort-Manager entsperrt.' });
      });
    }

    if (pwInp) setTimeout(() => pwInp.focus(), 30);
    return;
  }

  // Entsperrter Zustand: Kopfzeile mit Suche & Sperren-Button
  if (toolbar) {
    toolbar.innerHTML = `
      <div class="search pw-mgr-search">
        ${icon('search', 14)}
        <input type="search" id="pw-page-filter" placeholder="Geschütztes Profil suchen …" aria-label="Profile durchsuchen" />
      </div>
      <button type="button" class="btn btn--ghost btn--sm" id="pw-page-lock-btn">
        ${icon('lock', 14)} Sperren
      </button>
    `;
    toolbar.querySelector('#pw-page-lock-btn').addEventListener('click', () => {
      lockPasswordManagerSession();
      renderPasswordManagerContent(vaultStatus, bioStatus);
      showToast({ type: 'info', message: 'Passwort-Manager gesperrt.' });
    });
  }

  const unlockedProfiles = (state.profiles || []).filter((p) => !p.lockEnabled);
  if (headActions) {
    headActions.innerHTML = unlockedProfiles.length > 0 ? `
      <button type="button" class="btn btn--subtle btn--sm" id="pw-page-add-lock-btn">
        ${icon('plus', 14)} Zugriffsschutz für Profil aktivieren
      </button>
    ` : '';
    const addLockBtn = headActions.querySelector('#pw-page-add-lock-btn');
    if (addLockBtn) {
      addLockBtn.addEventListener('click', () => openEnableLockPicker(vaultStatus, bioStatus));
    }
  }

  const items = (pwSession.items || []).filter((it) => Boolean(it.lockEnabled));

  const renderRows = (filterText = '') => {
    const q = filterText.trim().toLowerCase();
    const filtered = items.filter((it) => {
      if (!q) return true;
      return `${it.name} ${it.url || ''} ${it.category || ''} ${it.lockHint || ''}`.toLowerCase().includes(q);
    });

    if (items.length === 0) {
      body.innerHTML = `
        <div class="empty-state" style="padding: 40px 24px;">
          <div class="empty-state__icon">${icon('lock', 28)}</div>
          <h2>Keine Profile mit zusätzlichem Zugriffsschutz</h2>
          <p>Im Passwort-Manager werden ausschließlich Profile angezeigt, bei denen „Zusätzlicher Zugriffsschutz" (eigenes Profil-Passwort) aktiviert ist.</p>
          ${unlockedProfiles.length > 0 ? `
            <div class="empty-state__actions">
              <button type="button" class="btn btn--primary" id="pw-empty-enable-btn">
                ${icon('lock', 15)} Zugriffsschutz für ein Profil einrichten
              </button>
            </div>
          ` : ''}
        </div>
      `;
      const emptyBtn = body.querySelector('#pw-empty-enable-btn');
      if (emptyBtn) {
        emptyBtn.addEventListener('click', () => openEnableLockPicker(vaultStatus, bioStatus));
      }
      return;
    }

    if (filtered.length === 0) {
      body.innerHTML = `<div class="muted" style="padding:14px 0;">Keine geschützten Profile für „${escapeHtml(filterText)}" gefunden.</div>`;
      return;
    }

    body.innerHTML = `
      <div class="pw-manager-list">
        ${filtered.map((item) => {
          const profileObj = state.profiles.find((p) => p.id === item.id) || item;
          const accent = profileObj.accentColor || item.accentColor || '#7c5cff';
          const iconName = profileObj.iconName || item.iconName || DEFAULT_PROFILE_ICON;
          const host = safeHost(item.url) || item.url || '';
          const lockPw = item.lockPassword || '';
          const hint = item.lockHint || '';

          return `
            <div class="pw-mgr-row" data-pmid="${escapeHtml(item.id)}">
              <div class="pw-mgr-row__profile">
                <span class="item-icon" style="color:${escapeHtml(accent)};background:${escapeHtml(accent)}22">
                  ${icon(iconName, 16)}
                </span>
                <div class="pw-mgr-row__meta">
                  <div class="pw-mgr-row__name">
                    <span>${escapeHtml(item.name)}</span>
                    ${item.category ? `<span class="tag">${escapeHtml(item.category)}</span>` : ''}
                    <span class="tag tag--warn">${icon('lock', 11)} Zusätzlicher Zugriffsschutz</span>
                  </div>
                  <div class="pw-mgr-row__host">${escapeHtml(host)}</div>
                </div>
              </div>

              <div class="pw-mgr-row__creds">
                <div class="pw-mgr-field">
                  <span class="pw-mgr-field__label">Zugriffsschutz-Passwort</span>
                  <div class="pw-mgr-field__box">
                    ${lockPw ? `
                      <input type="password" class="pw-mgr-pass-input" value="${escapeHtml(lockPw)}" readonly aria-label="Zugriffsschutz-Passwort" />
                      <button type="button" class="icon-btn" data-pm-toggle-pw="${escapeHtml(item.id)}" title="Passwort anzeigen / verbergen">${icon('eye', 14)}</button>
                      <button type="button" class="icon-btn" data-pm-copy-pw="${escapeHtml(item.id)}" title="Passwort kopieren">${icon('copy', 13)}</button>
                    ` : `
                      <span class="muted" style="font-size:12px;">Noch nicht synchronisiert – einmal entsperren oder neu setzen</span>
                    `}
                  </div>
                </div>
                <div class="pw-mgr-field">
                  <span class="pw-mgr-field__label">Passwort-Hinweis</span>
                  <div class="pw-mgr-field__box">
                    <span class="pw-mgr-field__val">${escapeHtml(hint || 'Kein Hinweis hinterlegt')}</span>
                  </div>
                </div>
              </div>

              <div class="pw-mgr-row__actions">
                <button type="button" class="btn btn--ghost btn--sm" data-pm-change-lock="${escapeHtml(item.id)}" title="Zugriffsschutz-Passwort für dieses Profil ändern">
                  ${icon('key-round', 13)} <span>Passwort ändern</span>
                </button>
                <button type="button" class="btn btn--ghost btn--sm" data-pm-remove-lock="${escapeHtml(item.id)}" title="Zusätzlichen Zugriffsschutz aufheben">
                  ${icon('lock-open', 13)} <span>Schutz aufheben</span>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Passwort ein-/ausblenden
    body.querySelectorAll('[data-pm-toggle-pw]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.pw-mgr-row');
        const inp = row && row.querySelector('.pw-mgr-pass-input');
        if (!inp) return;
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.innerHTML = icon(show ? 'eye-off' : 'eye', 14);
      });
    });

    // Passwort kopieren
    body.querySelectorAll('[data-pm-copy-pw]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-pm-copy-pw');
        const found = items.find((x) => x.id === id);
        if (found && found.lockPassword) {
          await api.app.copyClipboard(found.lockPassword);
          showToast({ type: 'success', message: `Zugriffsschutz-Passwort von „${found.name}" kopiert.` });
        }
      });
    });

    // Zugriffsschutz-Passwort ändern
    body.querySelectorAll('[data-pm-change-lock]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-pm-change-lock');
        const found = items.find((x) => x.id === id);
        if (!found) return;
        const newPw = await promptPassword({
          title: `Zugriffsschutz-Passwort für „${found.name}" ändern`,
          message: 'Gib ein neues Profil-Passwort (mind. 4 Zeichen) für den zusätzlichen Zugriffsschutz ein.',
          label: 'Neues Profil-Passwort',
          confirmLabel: 'Passwort speichern'
        });
        if (!newPw) return;
        if (newPw.length < 4) {
          showToast({ type: 'warning', message: 'Das Profil-Passwort muss mindestens 4 Zeichen lang sein.' });
          return;
        }
        try {
          const res = await api.profileLock.change(id, {
            oldPassword: found.lockPassword || '',
            newPassword: newPw,
            hint: found.lockHint || ''
          });
          unwrap(res);
          found.lockPassword = newPw;
          await loadProfiles();
          renderRows(toolbar && toolbar.querySelector('#pw-page-filter') ? toolbar.querySelector('#pw-page-filter').value : '');
          showToast({ type: 'success', message: `Zugriffsschutz-Passwort für „${found.name}" aktualisiert.` });
        } catch (err) {
          showToast({ type: 'error', message: err.message });
        }
      });
    });

    // Zugriffsschutz aufheben
    body.querySelectorAll('[data-pm-remove-lock]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-pm-remove-lock');
        const found = items.find((x) => x.id === id);
        if (!found) return;
        const ok = await confirmDialog({
          title: 'Zusätzlichen Zugriffsschutz aufheben',
          message: `Möchtest du den zusätzlichen Zugriffsschutz für „${found.name}" aufheben? Das Profil und seine Datenbank-Zugangsdaten bleiben erhalten.`,
          confirmLabel: 'Zugriffsschutz aufheben',
          danger: true
        });
        if (!ok) return;
        try {
          let res;
          if (found.lockPassword) {
            res = await api.profileLock.disable(id, found.lockPassword);
          } else if (api.admin && api.admin.forceUnlockProfile) {
            res = await api.admin.forceUnlockProfile(id);
          }
          unwrap(res);
          pwSession.items = pwSession.items.filter((x) => x.id !== id);
          await loadProfiles();
          renderPasswords();
          showToast({ type: 'success', message: `Zusätzlicher Zugriffsschutz für „${found.name}" wurde aufgehoben.` });
        } catch (err) {
          showToast({ type: 'error', message: err.message });
        }
      });
    });
  };

  renderRows('');
  const filterInp = toolbar && toolbar.querySelector('#pw-page-filter');
  if (filterInp) {
    filterInp.addEventListener('input', () => renderRows(filterInp.value));
  }
}

async function openEnableLockPicker(vaultStatus, bioStatus) {
  const unlockedProfiles = (state.profiles || []).filter((p) => !p.lockEnabled);
  if (unlockedProfiles.length === 0) {
    showToast({ type: 'info', message: 'Alle vorhandenen Profile verfügen bereits über einen zusätzlichen Zugriffsschutz.' });
    return;
  }
  const target = unlockedProfiles[0];
  const updated = await openProfileDialog({ mode: 'edit', profile: target });
  if (updated) {
    await loadProfiles();
    pwSession.unlocked = false;
    renderPasswords();
  }
}

