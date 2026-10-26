// profile-dialog.js – Übersichtlich strukturiertes Profilformular mit ein-/ausklappbaren Sektionen und passwortgeschützter Zugangsdaten-Einsicht

import { api, unwrap } from './api.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { icon, PROFILE_ICONS, DEFAULT_PROFILE_ICON } from './icons.js';
import {
  EXAMPLE_PHPMYADMIN_URL,
  DEFAULT_ACCENT,
  ACCENT_PRESETS,
  CATEGORY_PRESETS,
  DEFAULT_URL_FAVORITES,
  DB_SYSTEM_PRESETS
} from './constants.js';
import { toFileUrl, escapeHtml, infoTip, safeHost } from './dom.js';
import { promptPassword } from './password-prompt.js';

const URL_FAV_STORAGE_KEY = 'sqlhub.favoriteUrls';
const MASKED_USER_PLACEHOLDER = '••••••••••';
const MASKED_PASS_PLACEHOLDER = '••••••••••••';

function loadSavedUrlFavorites() {
  try {
    const raw = localStorage.getItem(URL_FAV_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string' && u.trim()) : [];
  } catch {
    return [];
  }
}

function saveUrlFavorites(urls) {
  try {
    localStorage.setItem(URL_FAV_STORAGE_KEY, JSON.stringify(urls.slice(0, 12)));
  } catch {
    /* ignore */
  }
}

/**
 * Öffnet ein Profilformular.
 * @param {{ mode: 'create'|'edit'|'credentials', profile?: object }} options
 * @returns {Promise<object|null>}
 */
export function openProfileDialog(options) {
  const { mode, profile } = options;
  const isEdit = mode === 'edit';
  const isCredentialsOnly = mode === 'credentials';

  return new Promise((resolve) => {
    let iconFile = profile ? profile.iconFile || null : null;
    let iconPreviewUrl = iconFile ? toFileUrl(iconFile) : null;
    let selectedIcon = (profile && profile.iconName) || DEFAULT_PROFILE_ICON;
    let lockState = { mode: profile && profile.lockEnabled ? 'already' : 'none' };
    const defaultAutoLogin = state.settings && state.settings.autoLoginDefault === false ? false : true;

    // Status für bereits gespeicherte Zugangsdaten im Bearbeiten-Modus
    let hasStoredCredentials = Boolean(profile && profile.hasCredentials);
    let credentialsLockedForEdit = (isEdit || isCredentialsOnly) && hasStoredCredentials;
    let credAuthMeta = { authType: 'password', lockHint: '' };
    let unlockedLockPassword = '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const titleText = isCredentialsOnly
      ? 'Zugangsdaten verwalten'
      : isEdit ? 'Datenbankprofil bearbeiten' : 'Neues Datenbankprofil';

    modal.innerHTML = `
      <div class="modal__header">
        <div>
          <div class="modal__eyebrow">${isCredentialsOnly ? 'SICHERHEIT & AUTHENTIFIZIERUNG' : 'VERBINDUNGSKONFIGURATION'}</div>
          <h2 class="modal__title">${titleText}</h2>
        </div>
        <button class="modal__close" data-close aria-label="Schließen">${icon('x', 18)}</button>
      </div>
      <form class="modal__body" novalidate>
        ${isCredentialsOnly ? '' : `
        <!-- 1. WICHTIGSTE VERBINDUNGSDATEN (Ganz oben, immer sichtbar) -->
        <div class="dialog-group dialog-group--primary">
          <div class="dialog-group__head-static">
            <span class="dialog-group__icon">${icon('database', 15)}</span>
            <span class="dialog-group__title">Wichtige Verbindungsdaten</span>
            <span class="dialog-group__badge">Pflichtangaben</span>
          </div>
          <div class="dialog-group__body">
            <div class="field">
              <label for="pd-name" class="field__label">
                <span>Profilname *</span>
                ${infoTip('Anzeigename dieser Datenbankverbindung im Dashboard, in der Suche (Strg + K) und in geöffneten Browser-Tabs.')}
              </label>
              <input type="text" id="pd-name" maxlength="120" placeholder="z. B. Haupt-Cluster / Verwaltungs-Bot" required />
            </div>

            <div class="field">
              <label for="pd-url" class="field__label">
                <span>phpMyAdmin- / Datenbank-URL *</span>
                ${infoTip('Vollständige Web-Adresse (http/https) deines Datenbank-Panels – unterstützt phpMyAdmin, Adminer, pgAdmin, Plesk, CloudPanel und andere Web-Interfaces. Unten kannst du Favoriten direkt auswählen oder eigene URLs als Favorit speichern.')}
              </label>
              <input type="text" id="pd-url" placeholder="${EXAMPLE_PHPMYADMIN_URL}" required />
            </div>
            <div class="category-chips url-chips" id="pd-url-chips"></div>

            <div class="row">
              <div class="field" style="margin-bottom:4px;">
                <label for="pd-database" class="field__label">
                  <span>Datenbankname (optional)</span>
                  ${infoTip('Name der primären Datenbank bzw. des Schemas. Dient zur schnellen Orientierung auf der Profilkarte und in der Suche.')}
                </label>
                <input type="text" id="pd-database" maxlength="200" placeholder="z. B. app_production" />
              </div>
              <div class="field" style="margin-bottom:4px;">
                <label for="pd-server" class="field__label">
                  <span>Datenbank-System / Server-Hinweis</span>
                  ${infoTip('Datenbank-Engine oder Panel-Typ (z. B. MySQL / MariaDB, PostgreSQL, Adminer, Redis). Wird als Typ-Badge auf der Profilkarte angezeigt.')}
                </label>
                <input type="text" id="pd-server" maxlength="500" placeholder="z. B. MySQL / MariaDB · EU-Central" />
              </div>
            </div>
            <div class="category-chips" id="pd-dbtype-chips" style="margin-top:4px;margin-bottom:0;"></div>
          </div>
        </div>
        `}

        <!-- 2. ZUGANGSDATEN & ANMELDUNG (Beim Erstellen ausgeklappt, beim Bearbeiten standardmäßig eingeklappt) -->
        <div class="collapsible-section ${isEdit ? 'is-collapsed' : ''}" id="pd-sec-credentials">
          <button type="button" class="collapsible-section__header" data-collapse-toggle="pd-sec-credentials" aria-expanded="${isEdit ? 'false' : 'true'}">
            <span class="collapsible-section__left">
              <span class="collapsible-section__icon">${icon('key-round', 15)}</span>
              <span class="collapsible-section__title">Zugangsdaten &amp; Anmeldung</span>
              ${infoTip('Hinterlege deine Login-Daten. Sie werden niemals im Klartext gespeichert, sondern über deinen System-Schlüsselbund (DPAPI / macOS Keychain / Secret Service) verschlüsselt.')}
            </span>
            <span class="collapsible-section__right">
              <span class="collapsible-section__badge" id="pd-cred-badge">${hasStoredCredentials ? 'Verschlüsselt hinterlegt' : 'Hardware-Schutz'}</span>
              <span class="collapsible-section__chev">${icon('chevron-down', 15)}</span>
            </span>
          </button>
          <div class="collapsible-section__body">
            <div class="cred-guard-bar" id="pd-cred-guard-bar" hidden></div>

            <div class="row">
              <div class="field">
                <label for="pd-username" class="field__label">
                  <span>Datenbank-Benutzername</span>
                  ${infoTip('Benutzername für die Anmeldung am Datenbank-Panel (Cookie-Login oder HTTP-Basic-Auth).')}
                </label>
                <div class="pw-wrap">
                  <input type="text" id="pd-username" name="username" autocomplete="username" placeholder="z. B. db_admin" />
                </div>
              </div>
              <div class="field">
                <label for="pd-password" class="field__label">
                  <span>Passwort</span>
                  ${infoTip('Zugehöriges Datenbank-Passwort. Bei bestehenden Profilen mit Passwort- oder Touch-ID-Bestätigung einsehbar und änderbar.')}
                </label>
                <div class="pw-wrap">
                  <input type="password" id="pd-password" name="password" autocomplete="current-password" placeholder="Passwort" />
                  <button type="button" class="pw-toggle" id="pd-toggle-pw" title="Passwort anzeigen / verbergen" aria-label="Passwort anzeigen">${icon('eye', 17)}</button>
                </div>
              </div>
            </div>

            <div class="field hint" id="pd-cred-hint" style="margin-top:-2px;margin-bottom:10px;"></div>

            ${isCredentialsOnly ? '' : `
            <div class="row" style="gap:10px;">
              <label class="checkbox" style="margin-bottom:0;">
                <input type="checkbox" id="pd-store" checked />
                <span class="checkbox__body">
                  <span class="checkbox__title">Verschlüsselt speichern ${infoTip('Bindet die Verschlüsselung der Anmeldedaten über DPAPI / Keychain / Secret Service direkt an dein lokales Benutzerkonto.')}</span>
                  <span class="hint">Hardwaregestützt im System-Schlüsselbund.</span>
                </span>
              </label>
              <label class="checkbox" style="margin-bottom:0;">
                <input type="checkbox" id="pd-autologin" ${defaultAutoLogin ? 'checked' : ''} />
                <span class="checkbox__body">
                  <span class="checkbox__title">Auto-Login aktivieren ${infoTip('Erkennt das Anmeldeformular beim Öffnen automatisch und meldet dich ohne Tipparbeit an. Nach 2 Fehlversuchen stoppt die Automatik sicher.')}</span>
                  <span class="hint">Automatische Anmeldung beim Verbinden.</span>
                </span>
              </label>
            </div>`}
          </div>
        </div>

        ${isCredentialsOnly ? '' : `
        <!-- 3. ERSCHEINUNGSBILD & KENNZEICHNUNG (Standardmäßig eingeklappt) -->
        <div class="collapsible-section is-collapsed" id="pd-sec-appearance">
          <button type="button" class="collapsible-section__header" data-collapse-toggle="pd-sec-appearance" aria-expanded="false">
            <span class="collapsible-section__left">
              <span class="collapsible-section__icon">${icon('palette', 15)}</span>
              <span class="collapsible-section__title">Erscheinungsbild &amp; Kennzeichnung</span>
              ${infoTip('Optionale Einstellungen für Kategorie, Beschreibung, Favoriten-Markierung, Symbol und Akzentfarbe.')}
            </span>
            <span class="collapsible-section__right">
              <span class="collapsible-section__badge" id="pd-appearance-badge">Icon, Farbe &amp; Kategorie</span>
              <span class="collapsible-section__chev">${icon('chevron-down', 15)}</span>
            </span>
          </button>
          <div class="collapsible-section__body">
            <div class="row">
              <div class="field">
                <label for="pd-category" class="field__label">
                  <span>Kategorie / Umgebung</span>
                  ${infoTip('Ordnet das Profil einer Gruppe zu (z. B. Produktion, Discord-Bot, Gameserver) – ideal zum schnellen Filtern und Sortieren.')}
                </label>
                <input type="text" id="pd-category" maxlength="60" placeholder="z. B. Produktion, Discord-Bot" />
              </div>
              <div class="field">
                <label for="pd-description" class="field__label">
                  <span>Beschreibung / Notiz</span>
                  ${infoTip('Optionale Kurznotiz zum Einsatzzweck, Projekt oder Server. Wird direkt unter dem Profilnamen auf der Karte angezeigt.')}
                </label>
                <input type="text" id="pd-description" maxlength="1000" placeholder="Kurze Notiz zum Einsatzzweck dieser Datenbank" />
              </div>
            </div>
            <div class="category-chips" id="pd-category-chips"></div>

            <div class="field">
              <label class="field__label">
                <span>Symbol wählen</span>
                ${infoTip('Vektor-Symbol für die Profilkarte und den Browser-Tab (wird verwendet, solange kein eigenes Bild hinterlegt ist).')}
              </label>
              <div class="icon-picker" id="pd-icon-picker"></div>
            </div>

            <div class="row" style="align-items: flex-start;">
              <div class="field">
                <label class="field__label">
                  <span>Eigenes Profilbild (optional)</span>
                  ${infoTip('Lade ein eigenes Projekt- oder Bot-Logo (PNG, JPG, WebP, GIF, SVG) hoch, das anstelle des Standard-Symbols erscheint.')}
                </label>
                <div class="icon-file-row">
                  <div class="icon-preview" id="pd-icon-preview"></div>
                  <button type="button" class="btn btn--ghost btn--sm" id="pd-pick-icon">${icon('image', 14)} Bild wählen</button>
                  <button type="button" class="btn btn--ghost btn--sm" id="pd-remove-icon">Zurücksetzen</button>
                </div>
              </div>

              <div class="field">
                <label for="pd-color" class="field__label">
                  <span>Akzentfarbe</span>
                  ${infoTip('Bestimmt die Farbe der oberen Karten-Lichtkante, des Symbols und der Hervorhebung im Browser-Tab.')}
                </label>
                <div class="color-field">
                  <label class="color-swatch" for="pd-color" title="Eigene Farbe wählen">
                    <input type="color" id="pd-color" value="${DEFAULT_ACCENT}" aria-label="Eigene Akzentfarbe" />
                    <span class="color-swatch__dot" aria-hidden="true"></span>
                  </label>
                  <div class="color-presets" id="pd-color-presets"></div>
                  <input type="text" class="color-hex" id="pd-color-hex" value="${DEFAULT_ACCENT}"
                         maxlength="7" spellcheck="false" aria-label="Hex-Farbwert" />
                </div>
              </div>
            </div>

            <label class="checkbox" style="margin-bottom:0;">
              <input type="checkbox" id="pd-favorite" />
              <span class="checkbox__body">
                <span class="checkbox__title">Als Favorit anheften ${infoTip('Angeheftete Favoriten werden mit einem goldenen Stern markiert und im Dashboard automatisch ganz oben einsortiert.')}</span>
                <span class="hint">Hebt dieses Profil im Dashboard und in der Schnellauswahl oben hervor.</span>
              </span>
            </label>
          </div>
        </div>
        `}

        <!-- 4. ZUSÄTZLICHER ZUGRIFFSSCHUTZ (Standardmäßig eingeklappt) -->
        <div class="collapsible-section is-collapsed" id="pd-sec-lock">
          <button type="button" class="collapsible-section__header" data-collapse-toggle="pd-sec-lock" aria-expanded="false">
            <span class="collapsible-section__left">
              <span class="collapsible-section__icon">${icon('lock', 15)}</span>
              <span class="collapsible-section__title">Zusätzlicher Zugriffsschutz</span>
              ${infoTip('Optionales zweites Passwort speziell für dieses Profil (AES-256-GCM). Vor jedem Öffnen oder Bearbeiten muss dieses Profil-Passwort eingegeben werden.')}
            </span>
            <span class="collapsible-section__right">
              <span class="collapsible-section__badge">${profile && profile.lockEnabled ? 'Schutz aktiv' : 'Optional'}</span>
              <span class="collapsible-section__chev">${icon('chevron-down', 15)}</span>
            </span>
          </button>
          <div class="collapsible-section__body">
            <div id="pd-lock-area"></div>
          </div>
        </div>
      </form>
      <div class="modal__footer modal__footer--split">
        <button type="button" class="btn btn--ghost" id="pd-test">${icon('plug', 15)} Verbindung testen</button>
        <div style="display:flex;gap:10px;">
          <button type="button" class="btn btn--ghost" data-close>Abbrechen</button>
          <button type="button" class="btn btn--primary" id="pd-save">${icon('check', 15)} Speichern</button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.getElementById('modal-root').appendChild(overlay);

    const $ = (sel) => modal.querySelector(sel);

    // Ein- und Ausklappen der Sektionen verdrahten
    modal.querySelectorAll('[data-collapse-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        // Klick auf Info-Tip in der Kopfzeile soll nicht zuklappen
        if (e.target.closest('.info-tip')) return;
        const secId = btn.getAttribute('data-collapse-toggle');
        const sec = document.getElementById(secId) || modal.querySelector(`#${secId}`);
        if (!sec) return;
        const collapsed = sec.classList.toggle('is-collapsed');
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      });
    });

    // Icon-Auswahl, Kategorien, URL-Favoriten & DB-Typ-Chips aufbauen
    if (!isCredentialsOnly) {
      const chipsEl = $('#pd-category-chips');
      const catInput = $('#pd-category');
      if (chipsEl && catInput) {
        CATEGORY_PRESETS.forEach((cat) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'category-chip';
          chip.textContent = cat;
          chip.addEventListener('click', () => {
            catInput.value = catInput.value === cat ? '' : cat;
            updateCategoryChips();
            updateAppearanceBadge();
          });
          chipsEl.appendChild(chip);
        });
        catInput.addEventListener('input', () => {
          updateCategoryChips();
          updateAppearanceBadge();
        });
      }

      function updateCategoryChips() {
        if (!chipsEl || !catInput) return;
        const val = catInput.value.trim().toLowerCase();
        chipsEl.querySelectorAll('.category-chip').forEach((c) => {
          c.classList.toggle('is-active', c.textContent.toLowerCase() === val);
        });
      }

      // URL-Favoriten / Schnellauswahl (inkl. https://phpmyadmin.hostl.eu/ + eigene Favoriten)
      const urlChipsEl = $('#pd-url-chips');
      const urlInput = $('#pd-url');

      function renderUrlChips() {
        if (!urlChipsEl || !urlInput) return;
        urlChipsEl.innerHTML = '';

        const savedCustom = loadSavedUrlFavorites();
        const currentVal = urlInput.value.trim().replace(/\/+$/, '').toLowerCase();

        const seen = new Set();
        const allFavs = [];

        for (const item of DEFAULT_URL_FAVORITES) {
          const norm = item.url.trim().replace(/\/+$/, '').toLowerCase();
          if (!seen.has(norm)) {
            seen.add(norm);
            allFavs.push({ label: item.label, url: item.url, custom: false });
          }
        }
        for (const customUrl of savedCustom) {
          const norm = customUrl.trim().replace(/\/+$/, '').toLowerCase();
          if (norm && !seen.has(norm)) {
            seen.add(norm);
            allFavs.push({ label: safeHost(customUrl) || customUrl, url: customUrl, custom: true });
          }
        }
        for (const p of state.profiles || []) {
          if (!p.url) continue;
          const norm = p.url.trim().replace(/\/+$/, '').toLowerCase();
          if (norm && !seen.has(norm)) {
            seen.add(norm);
            allFavs.push({ label: safeHost(p.url) || p.url, url: p.url, custom: false });
          }
        }

        const tagLabel = document.createElement('span');
        tagLabel.className = 'chips-prefix';
        tagLabel.innerHTML = `${icon('star', 11)} Favoriten:`;
        urlChipsEl.appendChild(tagLabel);

        allFavs.forEach((fav) => {
          const norm = fav.url.trim().replace(/\/+$/, '').toLowerCase();
          const isActive = currentVal !== '' && currentVal === norm;
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'category-chip category-chip--url' + (isActive ? ' is-active' : '');
          chip.title = fav.url;
          chip.innerHTML = `${icon('globe', 11)} <span>${escapeHtml(fav.label)}</span>`;
          chip.addEventListener('click', () => {
            urlInput.value = fav.url;
            renderUrlChips();
          });

          if (fav.custom) {
            const delSpan = document.createElement('span');
            delSpan.className = 'category-chip__del';
            delSpan.title = 'Aus URL-Favoriten entfernen';
            delSpan.textContent = '×';
            delSpan.addEventListener('click', (e) => {
              e.stopPropagation();
              const next = loadSavedUrlFavorites().filter(
                (u) => u.trim().replace(/\/+$/, '').toLowerCase() !== norm
              );
              saveUrlFavorites(next);
              renderUrlChips();
            });
            chip.appendChild(delSpan);
          }

          urlChipsEl.appendChild(chip);
        });

        if (currentVal && !seen.has(currentVal) && /^https?:\/\//i.test(urlInput.value.trim())) {
          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'category-chip category-chip--add';
          addBtn.innerHTML = `${icon('plus', 11)} Als Favorit merken`;
          addBtn.addEventListener('click', () => {
            const clean = urlInput.value.trim();
            const list = loadSavedUrlFavorites();
            if (!list.includes(clean)) {
              list.push(clean);
              saveUrlFavorites(list);
              renderUrlChips();
              showToast({ type: 'success', message: 'URL zu deinen Favoriten hinzugefügt.' });
            }
          });
          urlChipsEl.appendChild(addBtn);
        }
      }

      if (urlInput) {
        urlInput.addEventListener('input', renderUrlChips);
      }

      // Datenbank-System / Typ-Chips (#pd-dbtype-chips)
      const dbChipsEl = $('#pd-dbtype-chips');
      const serverInput = $('#pd-server');
      function updateDbChips() {
        if (!dbChipsEl || !serverInput) return;
        const val = serverInput.value.trim().toLowerCase();
        dbChipsEl.querySelectorAll('.category-chip').forEach((c) => {
          c.classList.toggle('is-active', c.dataset.dbtype.toLowerCase() === val);
        });
      }
      if (dbChipsEl && serverInput) {
        DB_SYSTEM_PRESETS.forEach((sys) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'category-chip';
          chip.dataset.dbtype = sys;
          chip.textContent = sys;
          chip.addEventListener('click', () => {
            serverInput.value = serverInput.value === sys ? '' : sys;
            updateDbChips();
          });
          dbChipsEl.appendChild(chip);
        });
        serverInput.addEventListener('input', updateDbChips);
      }

      const picker = $('#pd-icon-picker');
      PROFILE_ICONS.forEach((name) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-option';
        btn.dataset.icon = name;
        btn.title = name;
        btn.innerHTML = icon(name, 19);
        btn.addEventListener('click', () => {
          selectedIcon = name;
          updatePickerSelection();
          renderIconPreview();
          updateAppearanceBadge();
        });
        picker.appendChild(btn);
      });
      updatePickerSelection();

      // Akzentfarbe: Vorschläge + Hex-Eingabe + nativer Picker
      const colorInput = $('#pd-color');
      const hexInput = $('#pd-color-hex');
      const presetsEl = $('#pd-color-presets');
      ACCENT_PRESETS.forEach((hex) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'color-preset';
        b.dataset.color = hex.toLowerCase();
        b.style.background = hex;
        b.title = hex;
        b.setAttribute('aria-label', `Akzentfarbe ${hex}`);
        b.addEventListener('click', () => setAccent(hex));
        presetsEl.appendChild(b);
      });
      colorInput.addEventListener('input', () => setAccent(colorInput.value));
      hexInput.addEventListener('input', () => {
        const v = hexInput.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) setAccent(v, { keepHex: true });
      });
      hexInput.addEventListener('blur', () => setAccent(colorInput.value, { keepHex: true }));

      $('#pd-favorite').addEventListener('change', updateAppearanceBadge);

      buildLockArea();

      // Vorbelegung
      if (profile) {
        $('#pd-name').value = profile.name || '';
        $('#pd-category').value = profile.category || '';
        $('#pd-description').value = profile.description || '';
        $('#pd-url').value = profile.url || '';
        $('#pd-database').value = profile.databaseName || '';
        $('#pd-server').value = profile.serverNote || '';
        $('#pd-favorite').checked = Boolean(profile.favorite);
        $('#pd-store').checked = profile.storeCredentials !== false;
        $('#pd-autologin').checked = profile.autoLogin !== false;
        setAccent(profile.accentColor || DEFAULT_ACCENT);
        updateCategoryChips();
        updateDbChips();
        updateAppearanceBadge();
      } else {
        updateAppearanceBadge();
      }
      renderUrlChips();
    } else {
      buildCredentialsLockPrompt();
    }

    if (!isCredentialsOnly) {
      renderIconPreview();
      $('#pd-pick-icon').addEventListener('click', async () => {
        try {
          const res = await api.profiles.pickIcon();
          if (res && res.ok) {
            iconFile = res.path;
            iconPreviewUrl = res.fileUrl;
            renderIconPreview();
          } else if (res && res.errors) {
            showToast({ type: 'error', message: res.errors.join(' ') });
          }
        } catch (err) {
          showToast({ type: 'error', message: err.message });
        }
      });
      $('#pd-remove-icon').addEventListener('click', () => {
        iconFile = null;
        iconPreviewUrl = null;
        renderIconPreview();
      });
    }

    function updateAppearanceBadge() {
      const badge = $('#pd-appearance-badge');
      if (!badge) return;
      const cat = ($('#pd-category') && $('#pd-category').value.trim()) || 'Keine Kategorie';
      const fav = $('#pd-favorite') && $('#pd-favorite').checked ? '★ Favorit · ' : '';
      const col = ($('#pd-color') && $('#pd-color').value) || DEFAULT_ACCENT;
      badge.innerHTML = `<span class="badge-color-dot" style="background:${escapeHtml(col)}"></span> ${escapeHtml(fav + cat)}`;
    }

    /* ----------------------------------------------------------------
     * Maskierte Anzeige & passwortgeschütztes Anzeigen/Ändern beim Bearbeiten
     * ---------------------------------------------------------------- */
    const userInp = $('#pd-username');
    const passInp = $('#pd-password');
    const togglePwBtn = $('#pd-toggle-pw');
    const guardBar = $('#pd-cred-guard-bar');
    const credHint = $('#pd-cred-hint');
    const credBadge = $('#pd-cred-badge');

    function applyLockedCredentialState() {
      if (!userInp || !passInp) return;
      if (credentialsLockedForEdit) {
        userInp.value = MASKED_USER_PLACEHOLDER;
        passInp.value = MASKED_PASS_PLACEHOLDER;
        passInp.type = 'password';
        userInp.readOnly = true;
        passInp.readOnly = true;
        userInp.classList.add('input--locked');
        passInp.classList.add('input--locked');
        togglePwBtn.innerHTML = icon('eye', 17);
        if (credBadge) credBadge.textContent = 'Geschützt (••••)';
        if (guardBar) {
          guardBar.hidden = false;
          guardBar.className = 'cred-guard-bar cred-guard-bar--locked';
          guardBar.innerHTML = `
            <div class="cred-guard-bar__info">
              ${icon('lock', 15)}
              <span>Gespeicherte Zugangsdaten sind geschützt (in <code>*</code> maskiert). Gib dein Passwort ein, um sie anzuzeigen oder zu ändern.</span>
            </div>
            <div class="cred-guard-bar__actions">
              <button type="button" class="btn btn--subtle btn--sm" id="pd-cred-reveal-btn">${icon('eye', 13)} Anzeigen</button>
              <button type="button" class="btn btn--primary btn--sm" id="pd-cred-edit-btn">${icon('pencil', 13)} Ändern</button>
            </div>
          `;
          guardBar.querySelector('#pd-cred-reveal-btn').addEventListener('click', () => {
            unlockCredentialsForEdit({ revealPassword: true });
          });
          guardBar.querySelector('#pd-cred-edit-btn').addEventListener('click', () => {
            unlockCredentialsForEdit({ revealPassword: false });
          });
        }
        if (credHint) {
          credHint.textContent = 'Ohne Freigabe bleiben Benutzername und Passwort beim Speichern unverändert geschützt.';
        }
      } else {
        userInp.readOnly = false;
        passInp.readOnly = false;
        userInp.classList.remove('input--locked');
        passInp.classList.remove('input--locked');
      }
    }

    async function unlockCredentialsForEdit({ revealPassword = false } = {}) {
      if (!profile || !profile.id) return false;
      const authType = credAuthMeta.authType || 'password';
      let canUseBio = false;
      let bioLabel = 'Touch ID / Biometrie';
      try {
        if (authType !== 'profile' && api.biometrics && api.biometrics.status) {
          const bRes = await api.biometrics.status();
          if (bRes && (bRes.touchIdAvailable || bRes.vaultEnrolled)) {
            canUseBio = true;
            bioLabel = bRes.touchIdAvailable ? 'Touch ID' : 'Biometrie';
          }
        }
      } catch {
        /* ignore */
      }

      const promptTitle = revealPassword
        ? 'Zugangsdaten anzeigen'
        : 'Zugangsdaten zum Ändern entsperren';
      const promptLabel = authType === 'profile'
        ? 'Profil-Passwort'
        : (authType === 'vault' ? 'Hauptpasswort (oder gespeichertes Passwort)' : 'Gespeichertes Passwort bestätigen');
      const promptMessage = authType === 'profile'
        ? 'Bitte gib das Profil-Passwort ein, um Benutzername und Passwort im Klartext anzuzeigen oder zu bearbeiten.'
        : (authType === 'vault'
          ? 'Bitte gib dein Hauptpasswort (oder das aktuelle Datenbank-Passwort) ein, um die Zugangsdaten freizugeben.'
          : 'Bitte gib das aktuell gespeicherte Passwort zur Bestätigung ein, um die Zugangsdaten anzuzeigen oder zu bearbeiten.');

      const enteredPw = await promptPassword({
        title: promptTitle,
        message: promptMessage,
        label: promptLabel,
        hint: credAuthMeta.lockHint || '',
        confirmLabel: revealPassword ? 'Jetzt anzeigen' : 'Freigeben & bearbeiten',
        allowBiometric: canUseBio,
        biometricLabel: bioLabel
      });
      if (!enteredPw) return false;

      try {
        const res = enteredPw === '__BIOMETRIC_UNLOCK__'
          ? await api.biometrics.revealCredentials(profile.id)
          : await api.credentials.reveal(profile.id, enteredPw);
        if (!res || !res.ok || !res.credentials) {
          showToast({
            type: 'error',
            title: 'Freigabe abgelehnt',
            message: (res && res.errors && res.errors.join(' ')) || 'Falsches Passwort.'
          });
          return false;
        }

        credentialsLockedForEdit = false;
        if (authType === 'profile' && enteredPw !== '__BIOMETRIC_UNLOCK__') {
          unlockedLockPassword = enteredPw;
        }
        userInp.readOnly = false;
        passInp.readOnly = false;
        userInp.classList.remove('input--locked');
        passInp.classList.remove('input--locked');
        userInp.value = res.credentials.username || '';
        passInp.value = res.credentials.password || '';

        if (revealPassword) {
          passInp.type = 'text';
          togglePwBtn.innerHTML = icon('eye-off', 17);
        } else {
          passInp.type = 'password';
          togglePwBtn.innerHTML = icon('eye', 17);
          userInp.focus();
          userInp.select();
        }

        if (credBadge) credBadge.textContent = 'Freigegeben';
        if (guardBar) {
          guardBar.hidden = false;
          guardBar.className = 'cred-guard-bar cred-guard-bar--unlocked';
          guardBar.innerHTML = `
            <div class="cred-guard-bar__info">
              ${icon('lock-open', 15)}
              <span>Zugangsdaten entsperrt – du kannst Benutzername und Passwort jetzt einsehen oder anpassen.</span>
            </div>
          `;
        }
        if (credHint) {
          credHint.textContent = 'Änderungen an Benutzername oder Passwort werden beim Speichern verschlüsselt übernommen.';
        }
        showToast({
          type: 'info',
          title: 'Zugangsdaten freigegeben',
          message: revealPassword
            ? 'Benutzername und Passwort werden nun angezeigt.'
            : 'Du kannst Benutzername und Passwort jetzt bearbeiten.'
        });
        return true;
      } catch (err) {
        showToast({ type: 'error', message: err.message });
        return false;
      }
    }

    // Klick in ein gesperrtes Feld fragt direkt nach dem Passwort zum Entsperren
    [userInp, passInp].forEach((inp) => {
      if (!inp) return;
      inp.addEventListener('mousedown', (e) => {
        if (credentialsLockedForEdit) {
          e.preventDefault();
          unlockCredentialsForEdit({ revealPassword: false });
        }
      });
    });

    togglePwBtn.addEventListener('click', async () => {
      if (credentialsLockedForEdit) {
        await unlockCredentialsForEdit({ revealPassword: true });
        return;
      }
      const show = passInp.type === 'password';
      passInp.type = show ? 'text' : 'password';
      togglePwBtn.innerHTML = icon(show ? 'eye-off' : 'eye', 17);
    });

    // Gespeicherte Zugangsdaten prüfen und ggf. maskiert vorbelegen
    if (isEdit || isCredentialsOnly) {
      applyLockedCredentialState();
      api.credentials.has(profile.id).then((res) => {
        if (!res) return;
        hasStoredCredentials = Boolean(res.stored);
        credAuthMeta = {
          authType: res.authType || 'password',
          lockHint: res.lockHint || ''
        };
        credentialsLockedForEdit = hasStoredCredentials;
        applyLockedCredentialState();
        if (!hasStoredCredentials && credHint) {
          credHint.textContent = 'Aktuell sind noch keine Zugangsdaten für dieses Profil hinterlegt.';
          if (guardBar) guardBar.hidden = true;
        }
      });
    } else if (credHint) {
      credHint.textContent = 'Zugangsdaten werden lokal im System-Schlüsselbund (DPAPI / Keychain / Keyring) verschlüsselt abgelegt.';
    }

    $('#pd-test').addEventListener('click', async () => {
      const url = isCredentialsOnly ? profile.url : $('#pd-url').value;
      if (!url) {
        showToast({ type: 'warning', message: 'Bitte gib zuerst eine Datenbank-/phpMyAdmin-URL ein.' });
        return;
      }
      const btn = $('#pd-test');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Prüfe Verbindung …';
      try {
        const res = await api.status.check(url);
        if (res.ok && res.status.reachable) {
          showToast({
            type: 'success',
            title: 'Verbindung erfolgreich',
            message: `HTTP ${res.status.status || '?'} · Antwortzeit ${res.status.latencyMs} ms` +
              (res.status.isPhpMyAdmin ? ' · phpMyAdmin-Oberfläche erkannt' : '')
          });
        } else {
          showToast({
            type: 'error',
            title: 'Server nicht erreichbar',
            message: (res.status && res.status.error) || (res.errors && res.errors.join(' ')) || 'Keine Antwort vom Zielserver.'
          });
        }
      } catch (err) {
        showToast({ type: 'error', message: err.message });
      } finally {
        btn.disabled = false;
        btn.innerHTML = `${icon('plug', 15)} Verbindung testen`;
      }
    });

    function updatePickerSelection() {
      const picker = $('#pd-icon-picker');
      if (!picker) return;
      picker.querySelectorAll('.icon-option').forEach((el) => {
        el.classList.toggle('is-active', el.dataset.icon === selectedIcon);
      });
    }

    function setAccent(hex, opts = {}) {
      const colorInput = $('#pd-color');
      const hexInput = $('#pd-color-hex');
      if (!colorInput) return;
      const valid = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : DEFAULT_ACCENT;
      colorInput.value = valid;
      if (hexInput && !opts.keepHex) hexInput.value = valid;
      const dot = modal.querySelector('.color-swatch__dot');
      if (dot) dot.style.background = valid;
      const presetsEl = $('#pd-color-presets');
      if (presetsEl) {
        presetsEl.querySelectorAll('.color-preset').forEach((el) => {
          el.classList.toggle('is-active', el.dataset.color === valid.toLowerCase());
        });
      }
      renderIconPreview();
      updateAppearanceBadge();
    }

    function renderIconPreview() {
      const preview = $('#pd-icon-preview');
      if (!preview) return;
      const accent = ($('#pd-color') && $('#pd-color').value) || DEFAULT_ACCENT;
      preview.style.setProperty('--preview-accent', accent);
      preview.style.color = accent;
      preview.style.background = accent + '22';
      if (iconPreviewUrl) {
        preview.innerHTML = `<img src="${iconPreviewUrl}" alt="" />`;
      } else {
        preview.innerHTML = icon(selectedIcon, 24);
      }
    }

    function buildLockArea() {
      const area = $('#pd-lock-area');
      if (!area) return;

      const showPwManager = !(state.settings && state.settings.passwordManagerSupport === false);
      const pwManagerFooterHtml = showPwManager ? `
        <div class="lock-pw-manager-card">
          <div class="lock-pw-manager-card__info">
            <span class="lock-pw-manager-card__icon">${icon('key-round', 15)}</span>
            <div>
              <div class="lock-pw-manager-card__title">Zentraler Passwort-Manager</div>
              <div class="lock-pw-manager-card__sub">Alle gespeicherten Zugriffsschutz-Passwörter auf der eigenen Passwort-Manager-Seite mit deinem Hauptpasswort einsehen &amp; verwalten.</div>
            </div>
          </div>
          <button type="button" class="btn btn--subtle btn--sm" id="pd-open-pw-manager">
            ${icon('key-round', 13)} Passwort-Manager öffnen
          </button>
        </div>
      ` : '';

      const wireOpenPwManager = () => {
        const openBtn = area.querySelector('#pd-open-pw-manager');
        if (openBtn) {
          openBtn.addEventListener('click', () => {
            close(null);
            window.dispatchEvent(new CustomEvent('sqlhub:navigate', { detail: 'passwords' }));
          });
        }
      };

      if (profile && profile.lockEnabled) {
        lockState.mode = 'already';
        const hint = profile.lock && profile.lock.hint
          ? 'Passwort-Hinweis: ' + escapeHtml(profile.lock.hint)
          : 'Beim Öffnen dieses Profils wird das separate Profil-Passwort abgefragt.';
        area.innerHTML = `
          <div class="settings-list__item">
            <span class="item-icon">${icon('lock', 16)}</span>
            <span class="name">Separater Profilschutz aktiv
              <span class="hint" style="display:block;color:var(--text-dim);font-size:11.5px;">${hint}</span>
            </span>
            <button type="button" class="btn btn--ghost btn--sm" id="pd-lock-remove">Schutz aufheben</button>
          </div>
          ${pwManagerFooterHtml}`;
        $('#pd-lock-remove').addEventListener('click', async () => {
          const pw = await promptPassword({
            title: 'Profilschutz aufheben',
            message: 'Bitte gib das aktuelle Profil-Passwort ein, um die zusätzliche Verschlüsselung dieses Profils zu entfernen.',
            confirmLabel: 'Schutz entfernen'
          });
          if (!pw) return;
          const res = await api.profileLock.disable(profile.id, pw);
          if (res && res.ok) {
            profile.lockEnabled = false;
            profile.unlocked = true;
            lockState.mode = 'none';
            buildLockArea();
            showToast({ type: 'success', message: 'Profilschutz wurde aufgehoben.' });
          } else {
            showToast({ type: 'error', message: (res && res.errors && res.errors.join(' ')) || 'Entfernen fehlgeschlagen.' });
          }
        });
        wireOpenPwManager();
        return;
      }

      lockState.mode = 'none';
      area.innerHTML = `
        <label class="checkbox" style="margin-bottom:0;">
          <input type="checkbox" id="pd-lock-enable" />
          <span class="checkbox__body">
            <span class="checkbox__title">Profil mit eigenem Passwort sichern (AES-256-GCM) ${infoTip('Verschlüsselt die Anmeldedaten dieses Profils mit einem separaten Passwort (scrypt). Ohne dieses Passwort lässt sich die Verbindung nicht öffnen.')}</span>
            <span class="hint">Zugangsdaten werden mit einem profilspezifischen Schlüssel (scrypt) verschlüsselt und beim Öffnen abgefragt.</span>
          </span>
        </label>
        <div id="pd-lock-fields" hidden style="margin-top:12px;">
          <div class="row">
            <div class="field">
              <label for="pd-lock-pw" class="field__label">
                <span>Profil-Passwort *</span>
                ${infoTip('Mindestens 4 Zeichen. Wird bei jedem Öffnen dieses Profils abgefragt.')}
              </label>
              <div class="pw-wrap">
                <input type="password" id="pd-lock-pw" autocomplete="new-password" placeholder="Mindestens 4 Zeichen" />
                <button type="button" class="pw-toggle" id="pd-lock-pw-toggle" title="Passwort anzeigen / verbergen" aria-label="Passwort anzeigen">${icon('eye', 16)}</button>
              </div>
            </div>
            <div class="field">
              <label for="pd-lock-pw2" class="field__label">
                <span>Passwort bestätigen</span>
              </label>
              <input type="password" id="pd-lock-pw2" autocomplete="new-password" placeholder="Passwort wiederholen" />
            </div>
          </div>
          ${showPwManager ? `
          <div class="pw-manager-tools" id="pd-lock-pw-tools" style="margin-top:-2px;margin-bottom:12px;">
            <span class="chips-prefix">${icon('key-round', 11)} Passwort-Manager:</span>
            <button type="button" class="category-chip" id="pd-lock-pw-paste" title="Profil-Passwort aus der Zwischenablage einfügen">
              ${icon('clipboard', 11)} Aus Zwischenablage einfügen
            </button>
            <button type="button" class="category-chip" id="pd-lock-pw-generate" title="Starkes Profil-Passwort erzeugen und in beide Felder eintragen">
              ${icon('wand', 11)} Starkes Passwort generieren
            </button>
            <button type="button" class="category-chip" id="pd-lock-pw-copy" title="Profil-Passwort in die Zwischenablage kopieren">
              ${icon('copy', 11)} Passwort kopieren
            </button>
          </div>` : ''}
          <div class="field" style="margin-bottom:0;">
            <label for="pd-lock-hint" class="field__label">
              <span>Passwort-Hinweis (optional)</span>
              ${infoTip('Wird beim Entsperren als kleine Gedächtnisstütze angezeigt.')}
            </label>
            <input type="text" id="pd-lock-hint" maxlength="200" placeholder="Optionale Gedächtnisstütze (darf nicht das Passwort verraten)" />
          </div>
        </div>
        ${pwManagerFooterHtml}`;

      const enable = $('#pd-lock-enable');
      const fields = $('#pd-lock-fields');
      const lockPwInp = $('#pd-lock-pw');
      const lockPw2Inp = $('#pd-lock-pw2');
      const lockPwToggle = $('#pd-lock-pw-toggle');

      enable.addEventListener('change', () => {
        fields.hidden = !enable.checked;
        lockState.mode = enable.checked ? 'set' : 'none';
      });

      if (lockPwToggle && lockPwInp) {
        lockPwToggle.addEventListener('click', () => {
          const show = lockPwInp.type === 'password';
          lockPwInp.type = show ? 'text' : 'password';
          if (lockPw2Inp) lockPw2Inp.type = show ? 'text' : 'password';
          lockPwToggle.innerHTML = icon(show ? 'eye-off' : 'eye', 16);
        });
      }

      const pasteLockBtn = $('#pd-lock-pw-paste');
      const genLockBtn = $('#pd-lock-pw-generate');
      const copyLockBtn = $('#pd-lock-pw-copy');

      if (pasteLockBtn && lockPwInp && lockPw2Inp) {
        pasteLockBtn.addEventListener('click', async () => {
          let clip = '';
          try {
            if (api.app && api.app.readClipboard) {
              const r = await api.app.readClipboard();
              clip = (r && r.text) || '';
            }
          } catch { /* ignore */ }
          clip = String(clip || '').trim().split(/\r?\n/)[0] || '';
          if (!clip) {
            showToast({ type: 'warning', message: 'Die Zwischenablage ist leer.' });
            return;
          }
          lockPwInp.value = clip;
          lockPw2Inp.value = clip;
          showToast({ type: 'success', message: 'Profil-Passwort aus Zwischenablage übernommen.' });
        });
      }

      if (genLockBtn && lockPwInp && lockPw2Inp) {
        genLockBtn.addEventListener('click', async () => {
          const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*+-=?';
          const arr = new Uint32Array(18);
          window.crypto.getRandomValues(arr);
          let generated = '';
          for (let i = 0; i < arr.length; i++) {
            generated += chars[arr[i] % chars.length];
          }
          lockPwInp.value = generated;
          lockPw2Inp.value = generated;
          lockPwInp.type = 'text';
          lockPw2Inp.type = 'text';
          if (lockPwToggle) lockPwToggle.innerHTML = icon('eye-off', 16);
          if (api.app && api.app.copyClipboard) {
            await api.app.copyClipboard(generated).catch(() => {});
          }
          showToast({
            type: 'success',
            title: 'Profil-Passwort generiert',
            message: 'Starkes Schutzpasswort erzeugt und in die Zwischenablage kopiert.'
          });
        });
      }

      if (copyLockBtn && lockPwInp) {
        copyLockBtn.addEventListener('click', async () => {
          if (!lockPwInp.value) {
            showToast({ type: 'warning', message: 'Kein Profil-Passwort zum Kopieren vorhanden.' });
            return;
          }
          if (api.app && api.app.copyClipboard) {
            await api.app.copyClipboard(lockPwInp.value);
            showToast({ type: 'success', message: 'Profil-Passwort in die Zwischenablage kopiert.' });
          }
        });
      }

      wireOpenPwManager();
    }

    function buildCredentialsLockPrompt() {
      const area = $('#pd-lock-area');
      if (!area) return;
      if (profile && profile.lockEnabled && profile.unlocked === false) {
        area.innerHTML = `
          <div class="field" style="margin-bottom:0;">
            <label for="pd-profile-pw">Profil-Passwort zur Autorisierung *</label>
            <input type="password" id="pd-profile-pw" autocomplete="off" placeholder="Aktuelles Profil-Passwort eingeben" />
            <span class="hint">Dieses Profil ist geschützt. Zum Aktualisieren der Zugangsdaten wird das Profil-Passwort benötigt.</span>
          </div>`;
      } else {
        area.innerHTML = `<div class="hint" style="font-size:12px;">Neue Zugangsdaten werden verschlüsselt im lokalen Credential-Store abgelegt.</div>`;
      }
    }

    function close(result) {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result === undefined ? null : result);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      }
    }

    // Klick außerhalb des Fensters schließt das Formular NICHT – nur X im Kasten, Abbrechen oder Esc
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        modal.classList.remove('modal--bump');
        void modal.offsetWidth;
        modal.classList.add('modal--bump');
        const closeBtn = modal.querySelector('.modal__close');
        if (closeBtn) {
          closeBtn.classList.remove('modal__close--attention');
          void closeBtn.offsetWidth;
          closeBtn.classList.add('modal__close--attention');
        }
      }
    });
    modal.querySelectorAll('[data-close]').forEach((btn) =>
      btn.addEventListener('click', () => close(null))
    );
    document.addEventListener('keydown', onKey);

    $('#pd-save').addEventListener('click', async () => {
      const username = !credentialsLockedForEdit ? $('#pd-username').value.trim() : '';
      const password = !credentialsLockedForEdit ? $('#pd-password').value : '';
      const hasCredInput = !credentialsLockedForEdit && (username !== '' || password !== '');

      try {
        if (isCredentialsOnly) {
          if (credentialsLockedForEdit) {
            showToast({ type: 'info', message: 'Klicke zuerst auf „Ändern", um neue Zugangsdaten einzugeben.' });
            return;
          }
          if (!hasCredInput) {
            showToast({ type: 'warning', message: 'Bitte gib Benutzername und Passwort ein.' });
            return;
          }
          let lockPassword = unlockedLockPassword;
          if (profile && profile.lockEnabled && profile.unlocked === false && !lockPassword) {
            lockPassword = $('#pd-profile-pw') ? $('#pd-profile-pw').value : '';
            if (!lockPassword) {
              showToast({ type: 'warning', message: 'Bitte gib das Profil-Passwort zur Autorisierung ein.' });
              return;
            }
          }
          const res = await api.credentials.save(profile.id, { username, password }, lockPassword);
          unwrap(res);
          showToast({ type: 'success', message: 'Zugangsdaten sicher gespeichert.' });
          close({ saved: true });
          return;
        }

        const payload = {
          name: $('#pd-name').value.trim(),
          category: $('#pd-category').value.trim(),
          description: $('#pd-description').value.trim(),
          url: $('#pd-url').value.trim(),
          databaseName: $('#pd-database').value.trim(),
          serverNote: $('#pd-server').value.trim(),
          favorite: $('#pd-favorite').checked,
          iconName: selectedIcon,
          accentColor: $('#pd-color').value,
          iconFile,
          storeCredentials: $('#pd-store').checked,
          autoLogin: $('#pd-autologin').checked
        };

        if (payload.storeCredentials && hasCredInput) {
          payload.credentials = { username, password };
          if (unlockedLockPassword) {
            payload.lockPassword = unlockedLockPassword;
          }
        }

        if (!payload.name) {
          showToast({ type: 'warning', message: 'Bitte gib einen Profilnamen an.' });
          return;
        }
        if (!payload.url) {
          showToast({ type: 'warning', message: 'Bitte gib eine gültige Datenbank-URL an.' });
          return;
        }

        let lockPw = '';
        let lockHint = '';
        if (lockState.mode === 'set') {
          lockPw = $('#pd-lock-pw').value;
          const lockPw2 = $('#pd-lock-pw2').value;
          lockHint = $('#pd-lock-hint').value.trim();
          if (lockPw.length < 4) {
            showToast({ type: 'warning', message: 'Das Profil-Passwort muss mindestens 4 Zeichen lang sein.' });
            return;
          }
          if (lockPw !== lockPw2) {
            showToast({ type: 'warning', message: 'Die eingegebenen Profil-Passwörter stimmen nicht überein.' });
            return;
          }
        }

        const res = isEdit
          ? await api.profiles.update(profile.id, payload)
          : await api.profiles.create(payload);
        const out = unwrap(res);
        if (out && out.warning) {
          showToast({ type: 'warning', title: 'Hinweis', message: out.warning });
        } else {
          showToast({ type: 'success', message: isEdit ? 'Änderungen gespeichert.' : 'Neues Profil angelegt.' });
        }

        if (lockState.mode === 'set' && out && out.profile && out.profile.id) {
          const lockRes = await api.profileLock.enable(out.profile.id, { password: lockPw, hint: lockHint });
          if (lockRes && lockRes.ok) {
            showToast({ type: 'success', message: 'Zusätzlicher Profilschutz aktiviert.' });
          } else {
            showToast({ type: 'error', message: (lockRes && lockRes.errors && lockRes.errors.join(' ')) || 'Profilschutz konnte nicht aktiviert werden.' });
          }
        }

        close(out.profile || out);
      } catch (err) {
        showToast({ type: 'error', title: 'Speichern fehlgeschlagen', message: err.message });
      }
    });

    // Fokus auf erstes Feld
    setTimeout(() => {
      const first = modal.querySelector('#pd-name, #pd-username');
      if (first && !first.readOnly) first.focus();
    }, 60);
  });
}
