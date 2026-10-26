// settings.js – Studio-Einstellungsseite für Darstellung (Liquid Glass), Auto-Crop/HD-Bildschärfe, App-Schutz & Biometrie, Toasts, Sitzungen & geheime Admin-Konsole

import { api, unwrap } from './api.js';
import { state, loadProfiles, loadSettings, resolveBackgroundUrl, applyTheme } from './state.js';
import { showToast } from './toast.js';
import { confirmDialog } from './confirm.js';
import { icon, DEFAULT_PROFILE_ICON } from './icons.js';
import { ACCENT_PRESETS } from './constants.js';
import { openVaultSetup, openVaultChangePassword, lockVaultNow } from './vault-ui.js';
import { promptPassword } from './password-prompt.js';
import { enhanceSelect, escapeHtml, safeHost } from './dom.js';
import { lockPasswordManagerSession } from './passwords.js';

const view = document.getElementById('view-settings');

let activeSettingsTab = 'all';

const PANEL_COLOR_PRESETS = [
  '#121622',
  '#0a0c14',
  '#162038',
  '#141229',
  '#0d1f22',
  '#1f1624',
  '#18181b',
  '#ffffff'
];

export async function renderSettings() {
  const prevScrollTop = view ? view.scrollTop : 0;

  const settings = state.settings || {};
  const toastSec = Number(settings.toastDurationSeconds) || 5;
  const panelOpacity = typeof settings.panelOpacity === 'number' ? settings.panelOpacity : 100;
  const panelBlur = typeof settings.panelBlur === 'number' ? settings.panelBlur : 20;

  const isMac = navigator.platform && /Mac/i.test(navigator.platform);
  const isLinux = navigator.platform && /Linux/i.test(navigator.platform);
  const osCryptoLabel = isMac
    ? 'macOS Keychain & Touch ID'
    : (isLinux ? 'Linux Secret Service (libsecret / KWallet)' : 'Windows Data Protection API (DPAPI)');

  view.innerHTML = `
    <div class="page-head">
      <div class="page-head__titles">
        <div class="page-eyebrow">SYSTEMKONFIGURATION &amp; STUDIO-DESIGN</div>
        <h1 class="page-title">Einstellungen</h1>
        <p class="page-sub">Passe Liquid-Glass-Design, HD-Hintergrundschärfe, Button-Farbe, App-Schutz, Einblendungen und Sitzungen an</p>
      </div>
      <div class="page-head__actions">
        <button type="button" class="btn btn--subtle btn--sm" id="settings-goto-pw-mgr" title="Zum Passwort-Manager für zusätzlichen Zugriffsschutz wechseln">
          ${icon('key-round', 14)} Passwort-Manager
        </button>
        <button type="button" class="btn btn--ghost btn--sm" id="reset-appearance-defaults" title="Alle Darstellungs- und Farbwerte auf den Studio-Standard zurücksetzen">
          ${icon('rotate-ccw', 14)} Design zurücksetzen
        </button>
      </div>
    </div>

    <div class="settings-nav-bar" id="settings-nav-bar" role="tablist" aria-label="Einstellungsbereiche">
      <button type="button" class="settings-nav-pill ${activeSettingsTab === 'all' ? 'is-active' : ''}" data-stab="all">
        ${icon('sliders', 14)} <span>Alle Bereiche</span>
      </button>
      <button type="button" class="settings-nav-pill ${activeSettingsTab === 'appearance' ? 'is-active' : ''}" data-stab="appearance">
        ${icon('palette', 14)} <span>Darstellung &amp; Liquid Glass</span>
      </button>
      <button type="button" class="settings-nav-pill ${activeSettingsTab === 'security' ? 'is-active' : ''}" data-stab="security">
        ${icon('shield-check', 14)} <span>App-Schutz &amp; Sicherheit</span>
      </button>
      <button type="button" class="settings-nav-pill ${activeSettingsTab === 'workflow' ? 'is-active' : ''}" data-stab="workflow">
        ${icon('clock', 14)} <span>Ablauf &amp; Einblendungen</span>
      </button>
      <button type="button" class="settings-nav-pill ${activeSettingsTab === 'data' ? 'is-active' : ''}" data-stab="data">
        ${icon('database', 14)} <span>Sitzungen, Backup &amp; Update</span>
      </button>
    </div>

    <div class="settings-grid" id="settings-grid">
      <!-- 1. DARSTELLUNG & STUDIO-DESIGN -->
      <div class="panel panel--wide" data-section="appearance">
        <div class="panel__header-bar">
          <div>
            <h2>${icon('palette', 17)} Darstellung &amp; Liquid-Glass-Design</h2>
            <p class="panel__desc">Farbschema, Apple Liquid-Glass-Transparenz, Button-Stil &amp; Farbe, Karten-Design und HD-Wallpaper in Echtzeit anpassen.</p>
          </div>
          <div class="live-preview-pill">
            <span class="live-preview-pill__dot"></span> Live-Vorschau aktiv
          </div>
        </div>

        <div class="settings-subgrid">
          <!-- Linke Spalte: Thema, Akzent & Liquid Glass -->
          <div class="settings-subcol">
            <!-- Subcard A: Grundthema & Akzent -->
            <div class="settings-subcard">
              <div class="settings-subcard__head">
                <span class="settings-subcard__icon">${icon('sun', 15)}</span>
                <div>
                  <div class="settings-subcard__title">Farbmodus &amp; Primärer Akzent</div>
                  <div class="settings-subcard__sub">Grundthema der App sowie Fokus-, Badge- und Markierungsfarbe.</div>
                </div>
              </div>

              <div class="settings-field-block">
                <div class="panel__row-label">Grundthema wählen</div>
                <div class="segmented segmented--grid" id="theme-seg">
                  <button type="button" data-theme="dark">${icon('moon', 14)} <span>Dunkel</span></button>
                  <button type="button" data-theme="midnight">${icon('sparkles', 14)} <span>OLED Schwarz</span></button>
                  <button type="button" data-theme="slate">${icon('layers', 14)} <span>Schiefer</span></button>
                  <button type="button" data-theme="light">${icon('sun', 14)} <span>Hell</span></button>
                </div>
              </div>

              <div class="settings-field-block">
                <div class="panel__row-label">Primäre Akzentfarbe</div>
                <div id="accent-field"></div>
              </div>

              <div class="panel__row" style="padding-bottom:2px;">
                <div class="panel__row-label">Dynamischer Farbverlauf für Akzente
                  <span class="hint">Verwendet einen zweifarbigen Verlauf für primäre Akzentflächen.</span>
                </div>
                <label class="switch">
                  <input type="checkbox" id="set-accent-gradient" ${settings.accentGradient ? 'checked' : ''} />
                  <span class="switch__slider"></span>
                </label>
              </div>
              <div class="panel__row" id="accent-gradient-row" ${settings.accentGradient ? '' : 'hidden'}>
                <div class="panel__row-label">Verlaufsfarben</div>
                <div class="color-pair">
                  <input type="color" id="set-accent-from" value="${settings.accentGradientFrom || '#7c5cff'}" aria-label="Verlauf von" />
                  <span class="color-pair__arrow">${icon('arrow-right', 15)}</span>
                  <input type="color" id="set-accent-to" value="${settings.accentGradientTo || '#4d7cfe'}" aria-label="Verlauf bis" />
                </div>
              </div>
            </div>

            <!-- Subcard B: Liquid Glass & Panel-Hintergrund -->
            <div class="settings-subcard">
              <div class="settings-subcard__head">
                <span class="settings-subcard__icon">${icon('layers', 15)}</span>
                <div>
                  <div class="settings-subcard__title">Karten- &amp; Panel-Hintergrund (Liquid Glass)</div>
                  <div class="settings-subcard__sub">Wähle zwischen deckenden Panels oder dem refraktiven Apple Liquid-Glass-Effekt mit optimalem Lesekontrast.</div>
                </div>
              </div>

              <div class="settings-field-block">
                <div class="panel__row-label">Schnellwahl für Liquid Glass &amp; Deckkraft</div>
                <div class="segmented segmented--grid" id="panel-opacity-presets">
                  <button type="button" data-pop="100"><span>Deckend (100%)</span></button>
                  <button type="button" data-pop="75"><span>Frosted (75%)</span></button>
                  <button type="button" data-pop="45"><span>Liquid Glass</span></button>
                  <button type="button" data-pop="0"><span>Kristall (0%)</span></button>
                </div>
              </div>

              <div class="settings-field-block">
                <div class="slider-header">
                  <span class="panel__row-label">Glas-Tönung &amp; Deckkraft</span>
                  <code class="slider-badge" id="panel-opacity-val">${panelOpacity}%</code>
                </div>
                <div class="studio-slider-row">
                  <input type="range" class="studio-range" id="set-panel-opacity" min="0" max="100" step="1" value="${panelOpacity}" aria-label="Panel-Deckkraft in Prozent" />
                </div>
              </div>

              <div class="settings-field-block" id="panel-blur-block" ${panelOpacity < 100 ? '' : 'hidden'}>
                <div class="slider-header">
                  <span class="panel__row-label">Liquid-Glass-Brechung (Backdrop-Blur)</span>
                  <code class="slider-badge" id="panel-blur-val">${panelBlur} px</code>
                </div>
                <div class="studio-slider-row">
                  <input type="range" class="studio-range" id="set-panel-blur" min="6" max="40" step="1" value="${panelBlur}" aria-label="Panel-Weichzeichner in Pixeln" />
                </div>
              </div>

              <div class="settings-field-block" style="border-bottom:none;padding-bottom:0;">
                <div class="panel__row-label">Eigene Panel- &amp; Glasfarbe
                  <span class="hint">Bestimmt den Farbton der Karten, Eingabefelder und Seitenleiste.</span>
                </div>
                <div id="panel-color-field"></div>
              </div>
            </div>
          </div>

          <!-- Rechte Spalte: Button-Stil & Farbe, Karten-Design & Hintergrund des Arbeitsbereichs -->
          <div class="settings-subcol">
            <!-- Subcard E: Button-Darstellung & Eigene Button-Farbe -->
            <div class="settings-subcard">
              <div class="settings-subcard__head">
                <span class="settings-subcard__icon">${icon('sparkles', 15)}</span>
                <div>
                  <div class="settings-subcard__title">Button-Darstellung &amp; Eigene Button-Farbe</div>
                  <div class="settings-subcard__sub">Optik und Farbton für Aktions-Buttons und aktive Schalter.</div>
                </div>
              </div>

              <div class="settings-field-block">
                <div class="panel__row-label">Button-Stil</div>
                <div class="segmented segmented--grid" id="btn-style-seg">
                  <button type="button" data-bstyle="gradient"><span>Verlauf</span></button>
                  <button type="button" data-bstyle="solid"><span>Vollton</span></button>
                  <button type="button" data-bstyle="soft"><span>Glas / Soft</span></button>
                  <button type="button" data-bstyle="outline"><span>Kontur</span></button>
                </div>
              </div>

              <div class="settings-field-block">
                <div class="panel__row-label">Eigene Button-Farbe
                  <span class="hint">Unabhängig von der Akzentfarbe wählbar (oder „Wie Akzent“ nutzen).</span>
                </div>
                <div id="btn-color-field"></div>
              </div>

              <div class="settings-field-block" style="border-bottom:none;padding-bottom:0;">
                <div class="panel__row-label">Live-Button-Vorschau</div>
                <div class="btn-live-preview">
                  <button type="button" class="btn btn--primary btn--sm">${icon('zap', 14)} Primärer Button</button>
                  <button type="button" class="btn btn--subtle btn--sm">${icon('layers', 14)} Sekundär</button>
                  <button type="button" class="btn btn--ghost btn--sm">${icon('settings', 14)} Kontur</button>
                </div>
              </div>
            </div>

            <!-- Subcard F: Karten-Design, Dichte & Effekte -->
            <div class="settings-subcard">
              <div class="settings-subcard__head">
                <span class="settings-subcard__icon">${icon('layout-grid', 15)}</span>
                <div>
                  <div class="settings-subcard__title">Karten-Design, Dichte &amp; Animationen</div>
                  <div class="settings-subcard__sub">Rahmenstil, Abstände im Dashboard und sanfte UI-Übergänge.</div>
                </div>
              </div>

              <div class="settings-field-block">
                <div class="panel__row-label">Karten-Rahmenstil</div>
                <div class="segmented segmented--3" id="card-style-seg">
                  <button type="button" data-cstyle="glass">Studio Glas</button>
                  <button type="button" data-cstyle="flat">Flach</button>
                  <button type="button" data-cstyle="bordered">Kontrast-Rand</button>
                </div>
              </div>

              <div class="settings-field-block">
                <div class="panel__row-label">Oberflächen-Dichte</div>
                <div class="segmented segmented--3" id="density-seg">
                  <button type="button" data-density="compact">Kompakt</button>
                  <button type="button" data-density="normal">Standard</button>
                  <button type="button" data-density="comfortable">Großzügig</button>
                </div>
              </div>

              <div class="panel__row" style="padding-bottom:0;">
                <div class="panel__row-label">Schwebe-Animationen &amp; Leuchteffekte
                  <span class="hint">Sanfte Übergänge und dezente Lichtscheine auf Karten und Dialogen.</span>
                </div>
                <label class="switch">
                  <input type="checkbox" id="set-animations" ${settings.animationsEnabled !== false ? 'checked' : ''} />
                  <span class="switch__slider"></span>
                </label>
              </div>
            </div>

            <!-- Subcard C: Hintergrund des Arbeitsbereichs -->
            <div class="settings-subcard">
              <div class="settings-subcard__head">
                <span class="settings-subcard__icon">${icon('image', 15)}</span>
                <div>
                  <div class="settings-subcard__title">Hintergrund des Arbeitsbereichs</div>
                  <div class="settings-subcard__sub">Fläche hinter den Karten – eigene Bilder werden in voller HiDPI-Auflösung scharf dargestellt und automatisch ans Fenster angepasst.</div>
                </div>
              </div>

              <div class="segmented segmented--grid" id="bg-seg">
                <button type="button" data-bg="default">${icon('monitor', 14)} <span>Standard</span></button>
                <button type="button" data-bg="solid">${icon('square', 14)} <span>Vollton</span></button>
                <button type="button" data-bg="gradient">${icon('blend', 14)} <span>Verlauf</span></button>
                <button type="button" data-bg="image">${icon('image', 14)} <span>Eigenes Bild</span></button>
              </div>
              <div class="bg-options" id="bg-options"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. APP-SCHUTZ, BIOMETRIE (WINDOWS HELLO / TOUCH ID) & VERSCHLÜSSELUNG -->
      <div class="panel" data-section="security">
        <h2>${icon('shield-check', 16)} App-Schutz, Biometrie &amp; Verschlüsselung</h2>
        <p class="panel__desc">Schütze SQL Hub beim Start mit einem Hauptpasswort (AES-256-GCM), automatischer Inaktivitätssperre sowie Windows Hello / Touch ID.</p>
        <div id="vault-panel-body"></div>

        <div class="panel__row" style="margin-top:6px;">
          <div class="panel__row-label">
            <span class="panel__row-title">${icon('lock', 14)} <span>System-Schlüsselbund</span></span>
            <span class="hint">${state.credentialsAvailable
              ? `${escapeHtml(osCryptoLabel)} ist aktiv – Passwörter werden hardwaregebunden verschlüsselt.`
              : 'System-Verschlüsselung ist auf diesem System nicht verfügbar.'}</span>
          </div>
          <span class="tag ${state.credentialsAvailable ? 'tag--ok' : 'tag--warn'}">
            ${state.credentialsAvailable ? (isMac ? 'Keychain Aktiv' : (isLinux ? 'Keyring Aktiv' : 'DPAPI Aktiv')) : 'Inaktiv'}
          </span>
        </div>

        <div class="panel__row">
          <div class="panel__row-label">
            <span class="panel__row-title">${icon('wand', 14)} <span>Passwort-Manager-Werkzeuge im Profil-Dialog</span></span>
            <span class="hint">Blendet Generator, Zwischenablage-Übernahme und Direktzugriff unter „Zusätzlicher Zugriffsschutz“ ein.</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="set-pw-manager" ${settings.passwordManagerSupport !== false ? 'checked' : ''} />
            <span class="switch__slider"></span>
          </label>
        </div>

        <div class="panel__row" style="padding-bottom:0;">
          <div class="panel__row-label">
            <span class="panel__row-title">${icon('key-round', 14)} <span>Passwort-Manager (Zusätzlicher Zugriffsschutz)</span></span>
            <span class="hint">Verwalte alle Profil-Passwörter deiner zusätzlich geschützten Datenbankprofile auf der eigenen Passwort-Manager-Seite.</span>
          </div>
          <button type="button" class="btn btn--subtle btn--sm" id="open-pw-manager-page">
            ${icon('key-round', 14)} Passwort-Manager öffnen
          </button>
        </div>
      </div>

      <!-- 3. ARBEITSABLAUF & EINBLENDUNGEN (TOASTS) -->
      <div class="panel" data-section="workflow">
        <h2>${icon('settings', 16)} Arbeitsablauf &amp; Einblendungen</h2>
        <p class="panel__desc">Startverhalten, automatische Server-Prüfungen und Anzeigedauer für Einblendungen (Toasts).</p>

        <div class="panel__row panel__row--stack" style="padding-top:0;">
          <div class="panel__row-label">Anzeigedauer von Hinweisen (Toasts)
            <span class="hint">Legt fest, wie viele Sekunden der untere Ablaufbalken läuft, bevor Hinweise automatisch ausgeblendet werden (1–60 Sek.).</span>
          </div>

          <div class="duration-control-box">
            <div class="segmented duration-control-box__seg" id="toast-dur-seg">
              <button type="button" data-sec="2">2 Sek.</button>
              <button type="button" data-sec="4">4 Sek.</button>
              <button type="button" data-sec="5">5 Sek.</button>
              <button type="button" data-sec="8">8 Sek.</button>
              <button type="button" data-sec="12">12 Sek.</button>
            </div>
            <div class="duration-control-box__custom">
              <span class="duration-control-box__custom-label">Eigene Zeit:</span>
              <div class="num-stepper" title="Eigene Dauer in Sekunden (1–60 Sek.)">
                <button type="button" class="num-stepper__btn" id="toast-sec-dec" aria-label="1 Sekunde weniger">−</button>
                <div class="num-stepper__field">
                  <input type="number" id="set-toast-duration" min="1" max="60" step="1" value="${toastSec}" aria-label="Anzeigedauer in Sekunden" />
                  <span class="num-stepper__unit">Sek.</span>
                </div>
                <button type="button" class="num-stepper__btn" id="toast-sec-inc" aria-label="1 Sekunde mehr">+</button>
              </div>
            </div>
          </div>

          <div class="toast-preview-bar">
            <span class="chips-prefix">${icon('eye', 12)} Vorschau testen:</span>
            <div class="toast-preview-bar__chips">
              <button type="button" class="toast-test-chip toast-test-chip--info" data-test-toast="info">
                <span class="toast-test-chip__dot"></span> Info
              </button>
              <button type="button" class="toast-test-chip toast-test-chip--success" data-test-toast="success">
                <span class="toast-test-chip__dot"></span> Erfolg
              </button>
              <button type="button" class="toast-test-chip toast-test-chip--warning" data-test-toast="warning">
                <span class="toast-test-chip__dot"></span> Wichtig
              </button>
              <button type="button" class="toast-test-chip toast-test-chip--error" data-test-toast="error">
                <span class="toast-test-chip__dot"></span> Fehler
              </button>
            </div>
          </div>
        </div>

        <div class="panel__row">
          <div class="panel__row-label">Automatische Erreichbarkeitsprüfung
            <span class="hint">Prüft beim Öffnen des Dashboards den HTTP-Status und die Latenz deiner Server.</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="set-statuscheck" ${settings.statusCheckEnabled !== false ? 'checked' : ''} />
            <span class="switch__slider"></span>
          </label>
        </div>

        <div class="panel__row">
          <div class="panel__row-label">Auto-Login für neue Profile vorauswählen
            <span class="hint">Aktiviert die automatische Anmeldung standardmäßig beim Anlegen eines Profils.</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="set-autologin-default" ${settings.autoLoginDefault !== false ? 'checked' : ''} />
            <span class="switch__slider"></span>
          </label>
        </div>

        <div class="panel__row" style="padding-bottom:0;">
          <div class="panel__row-label">Startansicht beim Öffnen
            <span class="hint">Wähle, welche Ansicht direkt nach dem Programmstart geladen wird.</span>
          </div>
          <div class="segmented" id="startview-seg">
            <button type="button" data-view="dashboard">${icon('layout-dashboard', 14)} <span>Dashboard</span></button>
            <button type="button" data-view="profiles">${icon('database', 14)} <span>Profile</span></button>
          </div>
        </div>
      </div>

      <!-- 4. ISOLIERTE BROWSER-SITZUNGEN -->
      <div class="panel panel--admin-host" data-section="data">
        <h2>${icon('rotate-ccw', 16)} Isolierte Browser-Sitzungen</h2>
        <p class="panel__desc">Jedes Profil läuft in einer eigenen persistenten Chromium-Partition (Cookies &amp; Storage getrennt).</p>
        <div class="settings-list" id="session-list"></div>
        <div class="actions-row" style="margin-top:14px;">
          <button class="btn btn--danger" id="reset-all-sessions">${icon('trash-2', 15)} Alle Sitzungen zurücksetzen</button>
        </div>
        <button type="button" class="admin-secret-trigger" data-admin-secret-trigger aria-label="Admin-Konsole">
          ${icon('command', 11)}
        </button>
      </div>

      <!-- 5. BACKUP, PASSWORT-MANAGER-IMPORT & UPDATES (mit unsichtbarem Admin-Zeichen unten rechts) -->
      <div class="panel panel--admin-host" data-section="data">
        <h2>${icon('file-down', 16)} Backup, Import &amp; App-Update</h2>
        <p class="panel__desc">Exportiere deine Profile als JSON, importiere Profile aus SQL Hub oder deinem externen Passwort-Manager (Bitwarden, 1Password, KeePass CSV/JSON) oder installiere ein Update.</p>
        <div class="actions-row">
          <button class="btn btn--ghost" id="export-profiles">${icon('file-down', 15)} Profile exportieren (.json)</button>
          <button class="btn btn--ghost" id="import-profiles">${icon('file-up', 15)} Profile / CSV importieren</button>
          <button class="btn btn--subtle" id="install-update-settings">${icon('refresh-cw', 15)} App-Update installieren</button>
        </div>
        <button type="button" class="admin-secret-trigger" id="admin-secret-trigger" data-admin-secret-trigger aria-label="Admin-Konsole">
          ${icon('command', 11)}
        </button>
      </div>
    </div>
  `;

  applySettingsTabFilter();
  wireSettings(settings);
  renderSessionList();
  await renderVaultPanel();

  if (view && prevScrollTop > 0) {
    view.scrollTop = prevScrollTop;
  }
}

function applySettingsTabFilter() {
  const grid = view.querySelector('#settings-grid');
  if (!grid) return;
  grid.querySelectorAll('[data-section]').forEach((panel) => {
    const sec = panel.getAttribute('data-section');
    panel.hidden = activeSettingsTab !== 'all' && sec !== activeSettingsTab;
  });
}

function wireSettings(settings) {
  // Tab-Navigation in den Einstellungen
  const navBar = view.querySelector('#settings-nav-bar');
  if (navBar) {
    navBar.querySelectorAll('[data-stab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeSettingsTab = btn.getAttribute('data-stab') || 'all';
        navBar.querySelectorAll('[data-stab]').forEach((b) => b.classList.toggle('is-active', b === btn));
        applySettingsTabFilter();
      });
    });
  }

  // Direkt-Buttons zur eigenen Passwort-Manager-Seite
  ['#settings-goto-pw-mgr', '#open-pw-manager-page'].forEach((sel) => {
    const btn = view.querySelector(sel);
    if (btn) {
      btn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('sqlhub:navigate', { detail: 'passwords' }));
      });
    }
  });

  // Unsichtbares Admin-Zeichen unten rechts im Sitzungen/Backup-Bereich
  view.querySelectorAll('[data-admin-secret-trigger]').forEach((adminTrigger) => {
    adminTrigger.addEventListener('click', async () => {
      const pw = await promptPassword({
        title: 'Admin-Konsole authentifizieren',
        message: 'Gib dein Hauptpasswort (oder den Admin-Code „admin“) ein, um die System- & Notfall-Konsole zum Zurücksetzen aller Passwörter und Aufheben von Profilsperren zu öffnen.',
        label: 'Autorisierungs-Passwort',
        confirmLabel: 'Konsole öffnen'
      });
      if (!pw) return;
      try {
        const res = await api.admin.unlock(pw);
        unwrap(res);
        openAdminConsoleModal(res);
      } catch (err) {
        showToast({ type: 'error', title: 'Zugriff verweigert', message: err.message || 'Ungültiges Passwort.' });
      }
    });
  });

  // Design auf Standard zurücksetzen
  const resetBtn = view.querySelector('#reset-appearance-defaults');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Darstellung auf Standard zurücksetzen',
        message: 'Möchtest du Farbschema, Akzentfarbe, Liquid-Glass-Transparenz, Button-Design und Hintergrund auf die Studio-Standardwerte zurücksetzen?',
        confirmLabel: 'Zurücksetzen'
      });
      if (!ok) return;
      await updateSetting({
        theme: 'dark',
        accentColor: '',
        accentGradient: false,
        buttonRadius: 'sharp',
        buttonRadiusPx: 1,
        buttonStyle: 'gradient',
        buttonColor: '',
        cardStyle: 'glass',
        uiDensity: 'normal',
        animationsEnabled: true,
        panelColor: '',
        panelOpacity: 100,
        panelBlur: 20,
        backgroundStyle: 'default',
        backgroundImageSharpen: true
      });
      renderSettings();
      showToast({ type: 'success', message: 'Darstellung wurde auf den Studio-Standard zurückgesetzt.' });
    });
  }

  wireAppearance(settings);

  // Theme (dark | midnight | slate | light)
  const themeSeg = view.querySelector('#theme-seg');
  themeSeg.querySelectorAll('button').forEach((btn) => {
    if (btn.dataset.theme === (settings.theme || 'dark')) btn.classList.add('is-active');
    btn.addEventListener('click', async () => {
      themeSeg.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      await updateSetting({ theme: btn.dataset.theme });
    });
  });

  // Toast-Dauer (Sekunden) mit Preset-Buttons + Stepper (- / +)
  const toastSeg = view.querySelector('#toast-dur-seg');
  const toastInput = view.querySelector('#set-toast-duration');
  const syncToastSeg = (secVal) => {
    toastSeg.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.sec) === Number(secVal));
    });
  };
  syncToastSeg(settings.toastDurationSeconds || 5);

  const applyToastSec = async (rawVal) => {
    const raw = Number(rawVal);
    const sec = Number.isNaN(raw) ? 5 : Math.min(60, Math.max(1, Math.round(raw)));
    toastInput.value = String(sec);
    syncToastSeg(sec);
    await updateSetting({ toastDurationSeconds: sec });
    showToast({ type: 'info', message: `Anzeigedauer auf ${sec} Sekunden eingestellt.` });
  };

  toastSeg.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      applyToastSec(btn.dataset.sec);
    });
  });
  toastInput.addEventListener('change', () => applyToastSec(toastInput.value));
  view.querySelector('#toast-sec-dec').addEventListener('click', (e) => {
    e.preventDefault();
    applyToastSec((Number(toastInput.value) || 5) - 1);
  });
  view.querySelector('#toast-sec-inc').addEventListener('click', (e) => {
    e.preventDefault();
    applyToastSec((Number(toastInput.value) || 5) + 1);
  });

  // Toast-Vorschau-Buttons
  const SAMPLE_MESSAGES = {
    info: { title: 'Information', message: 'Erreichbarkeit aller Datenbankprofile wird im Hintergrund geprüft …' },
    success: { title: 'Verbindung aktiv', message: 'Datenbankprofil erfolgreich verbunden (Antwortzeit 24 ms).' },
    warning: { title: 'Wichtiger Hinweis', message: 'Bitte überprüfe die hinterlegte Server-Adresse oder das Zertifikat.' },
    error: { title: 'Verbindungsfehler', message: 'Der Zielserver hat nicht innerhalb des Zeitlimits geantwortet.' }
  };
  view.querySelectorAll('[data-test-toast]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-test-toast');
      const sample = SAMPLE_MESSAGES[t] || SAMPLE_MESSAGES.info;
      showToast({ type: t, title: sample.title, message: sample.message });
    });
  });

  view.querySelector('#set-statuscheck').addEventListener('change', (e) => {
    updateSetting({ statusCheckEnabled: e.target.checked });
  });
  view.querySelector('#set-autologin-default').addEventListener('change', (e) => {
    updateSetting({ autoLoginDefault: e.target.checked });
  });
  const pwMgrToggle = view.querySelector('#set-pw-manager');
  if (pwMgrToggle) {
    pwMgrToggle.addEventListener('change', (e) => {
      updateSetting({ passwordManagerSupport: e.target.checked });
      showToast({
        type: 'info',
        message: e.target.checked
          ? 'Passwort-Manager-Werkzeuge aktiviert.'
          : 'Passwort-Manager-Werkzeuge ausgeblendet.'
      });
    });
  }

  const startSeg = view.querySelector('#startview-seg');
  startSeg.querySelectorAll('button').forEach((btn) => {
    if (btn.dataset.view === (settings.startView || 'dashboard')) btn.classList.add('is-active');
    btn.addEventListener('click', async () => {
      startSeg.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      await updateSetting({ startView: btn.dataset.view });
    });
  });

  view.querySelector('#reset-all-sessions').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Alle Browser-Sitzungen zurücksetzen',
      message: 'Sämtliche gespeicherten Cookies und aktiven Anmeldungen aller Profile werden gelöscht. Beim nächsten Verbinden erfolgt eine neue Anmeldung.',
      confirmLabel: 'Alle zurücksetzen',
      danger: true
    });
    if (!ok) return;
    try {
      const res = await api.sessions.resetAll();
      unwrap(res);
      showToast({ type: 'success', message: `${res.count} Sitzungen erfolgreich bereinigt.` });
    } catch (err) {
      showToast({ type: 'error', message: err.message });
    }
  });

  view.querySelector('#export-profiles').addEventListener('click', async () => {
    try {
      const res = await api.app.exportProfiles();
      if (res && res.canceled) return;
      unwrap(res);
      showToast({ type: 'success', message: `${res.count} Profile erfolgreich exportiert (ohne Passwörter).` });
    } catch (err) {
      showToast({ type: 'error', message: err.message });
    }
  });

  view.querySelector('#import-profiles').addEventListener('click', async () => {
    try {
      const res = await api.app.importProfiles();
      if (res && res.canceled) return;
      unwrap(res);
      await loadProfiles();
      showToast({
        type: 'success',
        message: `${res.imported} Profile importiert${res.skipped ? `, ${res.skipped} übersprungen` : ''}.`
      });
      renderSettings();
    } catch (err) {
      showToast({ type: 'error', message: err.message });
    }
  });

  const updateBtn = view.querySelector('#install-update-settings');
  if (updateBtn) {
    updateBtn.addEventListener('click', async () => {
      try {
        const res = await api.app.installUpdate();
        if (res && res.canceled) return;
        if (res && res.ok) {
          showToast({
            type: 'info',
            title: 'Update wird gestartet',
            message: 'Das Update-Paket wird geöffnet und SQL Hub für die Aktualisierung geschlossen …'
          });
        } else if (res && res.errors) {
          showToast({ type: 'error', message: res.errors.join(' ') });
        }
      } catch (err) {
        showToast({ type: 'error', message: err.message });
      }
    });
  }
}

/* ------------------------- Geheime Admin-Konsole ------------------------- */

function openAdminConsoleModal(initialData) {
  const existing = document.getElementById('admin-console-overlay');
  if (existing) existing.remove();

  let profilesList = (initialData && Array.isArray(initialData.profiles)) ? initialData.profiles : [];
  let vaultInitialized = Boolean(initialData && initialData.vaultInitialized);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'admin-console-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal admin-console-modal';

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }

  function renderModalContent() {
    const lockedCount = profilesList.filter((p) => p.lockEnabled).length;
    modal.innerHTML = `
      <div class="modal__header">
        <div>
          <div class="modal__eyebrow">ROOT / SYSTEM-AUTORISIERUNG AKTIV</div>
          <h2 class="modal__title">Admin-Konsole &amp; Notfall-Steuerung</h2>
        </div>
        <button type="button" class="modal__close" data-admin-close aria-label="Schließen">${icon('x', 18)}</button>
      </div>
      <div class="modal__body" style="padding-bottom:18px;">
        <div class="admin-console-banner">
          ${icon('shield-check', 18)}
          <div>
            <strong>Admin-Freigabe aktiv:</strong> Du kannst hier sämtliche Profilsperren ohne Passwort aufheben, alle gespeicherten Passwörter zurücksetzen oder den App-Schutz (Hauptpasswort) entfernen.
          </div>
        </div>

        <div class="admin-console-grid">
          <div class="admin-action-box">
            <div>
              <div class="admin-action-box__title">${icon('lock-open', 15)} Alle Profilsperren aufheben (${lockedCount})</div>
              <div class="admin-action-box__desc">Entfernt sofort den zusätzlichen Zugriffsschutz von allen Profilen – ohne dass deren Profil-Passwörter bekannt sein müssen.</div>
            </div>
            <button type="button" class="btn btn--subtle btn--sm" id="admin-unlock-all-profiles" ${lockedCount === 0 ? 'disabled' : ''}>
              ${icon('lock-open', 14)} Alle Profilsperren aufheben
            </button>
          </div>

          <div class="admin-action-box">
            <div>
              <div class="admin-action-box__title">${icon('trash-2', 15)} Alle Passwörter zurücksetzen</div>
              <div class="admin-action-box__desc">Löscht sämtliche gespeicherten Datenbank-Passwörter und hebt alle Profilsperren auf. Die Profile selbst bleiben erhalten.</div>
            </div>
            <button type="button" class="btn btn--danger btn--sm" id="admin-reset-all-passwords">
              ${icon('trash-2', 14)} Alle Passwörter zurücksetzen
            </button>
          </div>

          <div class="admin-action-box">
            <div>
              <div class="admin-action-box__title">${icon('key-round', 15)} Hauptpasswort / App-Sperre zurücksetzen</div>
              <div class="admin-action-box__desc">Deaktiviert das Hauptpasswort und die biometrische Sperre vollständig (${vaultInitialized ? 'aktuell aktiv' : 'nicht eingerichtet'}).</div>
            </div>
            <button type="button" class="btn btn--ghost btn--sm" id="admin-reset-vault" ${vaultInitialized ? '' : 'disabled'}>
              ${icon('rotate-ccw', 14)} Hauptpasswort entfernen
            </button>
          </div>

          <div class="admin-action-box">
            <div>
              <div class="admin-action-box__title">${icon('globe', 15)} Alle Browser-Sitzungen bereinigen</div>
              <div class="admin-action-box__desc">Setzt Cookies, Cache und aktive Logins sämtlicher isolierten Browser-Partitionen sofort zurück.</div>
            </div>
            <button type="button" class="btn btn--ghost btn--sm" id="admin-clear-sessions">
              ${icon('rotate-ccw', 14)} Sitzungen zurücksetzen
            </button>
          </div>
        </div>

        <div class="section-label" style="margin-top:6px;">
          ${icon('database', 13)} <span>Profile &amp; Profilsperren einzeln verwalten (${profilesList.length})</span>
        </div>

        <div class="settings-list" style="max-height:240px;">
          ${profilesList.length === 0
            ? `<div class="muted" style="padding:10px 0;">Keine Datenbankprofile vorhanden.</div>`
            : profilesList.map((p) => {
                const host = safeHost(p.url) || p.url || '';
                return `
                  <div class="settings-list__item">
                    <span class="item-icon">${icon(p.lockEnabled ? 'lock' : 'database', 15)}</span>
                    <span class="name">
                      <strong>${escapeHtml(p.name)}</strong>
                      <span class="muted" style="font-size:11px;margin-left:6px;">${escapeHtml(host)}</span>
                      ${p.lockEnabled
                        ? `<span class="tag tag--warn" style="margin-left:6px;">Profilsperre aktiv${p.lockPassword ? ` · PW: ${escapeHtml(p.lockPassword)}` : ''}</span>`
                        : `<span class="tag" style="margin-left:6px;">Keine Sperre</span>`}
                    </span>
                    ${p.lockEnabled ? `
                      <button type="button" class="btn btn--subtle btn--sm" data-admin-unlock-one="${escapeHtml(p.id)}">
                        ${icon('lock-open', 13)} Sperre ohne PW aufheben
                      </button>
                    ` : ''}
                    ${p.hasCredentials ? `
                      <button type="button" class="btn btn--ghost btn--sm" data-admin-del-cred="${escapeHtml(p.id)}">
                        ${icon('trash-2', 13)} DB-Passwort löschen
                      </button>
                    ` : ''}
                  </div>
                `;
              }).join('')}
        </div>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn btn--primary" data-admin-close>${icon('check', 15)} Schließen</button>
      </div>
    `;

    modal.querySelectorAll('[data-admin-close]').forEach((b) => b.addEventListener('click', close));

    const unlockAllBtn = modal.querySelector('#admin-unlock-all-profiles');
    if (unlockAllBtn) {
      unlockAllBtn.addEventListener('click', async () => {
        try {
          const res = await api.admin.forceUnlockAllProfiles();
          unwrap(res);
          profilesList.forEach((p) => { p.lockEnabled = false; p.lockPassword = ''; });
          await loadProfiles();
          renderModalContent();
          showToast({ type: 'success', message: `${res.unlockedCount} Profilsperren ohne Passwort aufgehoben.` });
        } catch (err) {
          showToast({ type: 'error', message: err.message });
        }
      });
    }

    const resetAllPwBtn = modal.querySelector('#admin-reset-all-passwords');
    if (resetAllPwBtn) {
      resetAllPwBtn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Alle Passwörter & Profilsperren zurücksetzen',
          message: 'Sollen wirklich sämtliche gespeicherten Passwörter gelöscht und alle Profilsperren aufgehoben werden?',
          confirmLabel: 'Jetzt alles zurücksetzen',
          danger: true
        });
        if (!ok) return;
        try {
          const res = await api.admin.resetAllPasswords();
          unwrap(res);
          profilesList.forEach((p) => { p.lockEnabled = false; p.hasCredentials = false; p.lockPassword = ''; });
          lockPasswordManagerSession();
          await loadProfiles();
          renderModalContent();
          showToast({ type: 'success', message: 'Alle Passwörter und Profilsperren wurden zurückgesetzt.' });
        } catch (err) {
          showToast({ type: 'error', message: err.message });
        }
      });
    }

    const resetVaultBtn = modal.querySelector('#admin-reset-vault');
    if (resetVaultBtn) {
      resetVaultBtn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Hauptpasswort & App-Sperre entfernen',
          message: 'Möchtest du das Hauptpasswort sowie die biometrische Sperre vollständig zurücksetzen?',
          confirmLabel: 'Hauptpasswort entfernen',
          danger: true
        });
        if (!ok) return;
        try {
          const res = await api.admin.resetVault();
          unwrap(res);
          vaultInitialized = false;
          renderModalContent();
          renderVaultPanel();
          showToast({ type: 'success', message: 'Hauptpasswort und App-Sperre wurden zurückgesetzt.' });
        } catch (err) {
          showToast({ type: 'error', message: err.message });
        }
      });
    }

    const clearSessBtn = modal.querySelector('#admin-clear-sessions');
    if (clearSessBtn) {
      clearSessBtn.addEventListener('click', async () => {
        try {
          const res = await api.sessions.resetAll();
          unwrap(res);
          showToast({ type: 'success', message: `${res.count} Browser-Sitzungen bereinigt.` });
        } catch (err) {
          showToast({ type: 'error', message: err.message });
        }
      });
    }

    modal.querySelectorAll('[data-admin-unlock-one]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-admin-unlock-one');
        try {
          const res = await api.admin.forceUnlockProfile(id);
          unwrap(res);
          const item = profilesList.find((x) => x.id === id);
          if (item) {
            item.lockEnabled = false;
            item.lockPassword = '';
          }
          await loadProfiles();
          renderModalContent();
          showToast({ type: 'success', message: 'Profilsperre ohne Passwort aufgehoben.' });
        } catch (err) {
          showToast({ type: 'error', message: err.message });
        }
      });
    });

    modal.querySelectorAll('[data-admin-del-cred]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-admin-del-cred');
        try {
          const res = await api.credentials.remove(id);
          unwrap(res);
          const item = profilesList.find((x) => x.id === id);
          if (item) item.hasCredentials = false;
          await loadProfiles();
          renderModalContent();
          showToast({ type: 'success', message: 'Datenbank-Passwort für dieses Profil gelöscht.' });
        } catch (err) {
          showToast({ type: 'error', message: err.message });
        }
      });
    });
  }

  overlay.appendChild(modal);
  document.getElementById('modal-root').appendChild(overlay);
  document.addEventListener('keydown', onKey);
  renderModalContent();
}

/* ------------------------- Darstellung ------------------------- */

function createColorField(initial, onChange, { allowReset = false, resetLabel = 'Zurücksetzen', presets = ACCENT_PRESETS, defaultHex = '#7c5cff' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'color-field';
  const start = /^#[0-9a-fA-F]{6}$/.test(initial) ? initial.toLowerCase() : '';
  const fallback = start || defaultHex;
  wrap.innerHTML = `
    <label class="color-swatch" title="Eigene Farbe wählen">
      <input type="color" value="${fallback}" aria-label="Eigene Farbe" />
      <span class="color-swatch__dot"></span>
    </label>
    <div class="color-presets"></div>
    <input type="text" class="color-hex" maxlength="7" spellcheck="false" value="${start || fallback}" placeholder="${defaultHex.toUpperCase()}" aria-label="Hex-Farbwert" />
  `;
  const input = wrap.querySelector('input[type=color]');
  const hex = wrap.querySelector('.color-hex');
  const dot = wrap.querySelector('.color-swatch__dot');
  const presetsEl = wrap.querySelector('.color-presets');

  const paint = (hexVal) => {
    const v = /^#[0-9a-fA-F]{6}$/.test(hexVal) ? hexVal.toLowerCase() : '';
    input.value = v || fallback;
    dot.style.background = v || fallback;
    presetsEl.querySelectorAll('.color-preset').forEach((el) => {
      el.classList.toggle('is-active', (v || fallback.toLowerCase()) === el.dataset.color);
    });
  };

  presets.forEach((hexVal) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'color-preset';
    b.dataset.color = hexVal.toLowerCase();
    b.style.background = hexVal;
    b.title = hexVal;
    b.setAttribute('aria-label', `Farbe ${hexVal}`);
    b.addEventListener('click', () => {
      hex.value = b.dataset.color;
      paint(b.dataset.color);
      onChange(b.dataset.color);
    });
    presetsEl.appendChild(b);
  });

  input.addEventListener('input', () => {
    hex.value = input.value;
    paint(input.value);
    onChange(input.value);
  });
  hex.addEventListener('input', () => {
    const v = hex.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) { paint(v); onChange(v); }
    else if (v === '') { paint(''); onChange(''); }
  });
  hex.addEventListener('blur', () => paint(hex.value.trim()));

  if (allowReset) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn btn--ghost btn--sm';
    reset.innerHTML = `${icon('rotate-ccw', 13)} ${resetLabel}`;
    reset.addEventListener('click', () => { hex.value = defaultHex; paint(''); onChange(''); });
    wrap.appendChild(reset);
  }

  paint(start);
  return wrap;
}

function wireAppearance(settings) {
  const accentField = view.querySelector('#accent-field');
  accentField.replaceWith(
    createColorField(settings.accentColor || '', (hex) => updateSetting({ accentColor: hex }), {
      allowReset: true,
      resetLabel: 'Standard',
      defaultHex: '#7c5cff'
    })
  );

  const btnColorField = view.querySelector('#btn-color-field');
  btnColorField.replaceWith(
    createColorField(settings.buttonColor || '', (hex) => updateSetting({ buttonColor: hex }), {
      allowReset: true,
      resetLabel: 'Wie Akzent',
      defaultHex: (settings.accentColor || '#7c5cff')
    })
  );

  const panelColorField = view.querySelector('#panel-color-field');
  panelColorField.replaceWith(
    createColorField(settings.panelColor || '', (hex) => updateSetting({ panelColor: hex }), {
      allowReset: true,
      resetLabel: 'Thema-Standard',
      presets: PANEL_COLOR_PRESETS,
      defaultHex: '#121622'
    })
  );

  // Panel-Transparenz (Liquid Glass 0–100%) + Weichzeichner (6–40px)
  const panelOpSlider = view.querySelector('#set-panel-opacity');
  const panelOpVal = view.querySelector('#panel-opacity-val');
  const panelOpPresets = view.querySelector('#panel-opacity-presets');
  const panelBlurBlock = view.querySelector('#panel-blur-block');
  const panelBlurSlider = view.querySelector('#set-panel-blur');
  const panelBlurVal = view.querySelector('#panel-blur-val');

  const syncPanelOpacityUI = (opVal) => {
    const num = Math.max(0, Math.min(100, Math.round(Number(opVal) || 0)));
    panelOpSlider.value = String(num);
    panelOpVal.textContent = num === 0 ? '0% (Liquid Kristall)' : (num < 100 ? `${num}% (Liquid Glass)` : '100% (Deckend)');
    panelBlurBlock.hidden = num >= 100;
    panelOpPresets.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.pop) === num);
    });
  };
  syncPanelOpacityUI(settings.panelOpacity ?? 100);

  panelOpPresets.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const val = Number(btn.dataset.pop);
      syncPanelOpacityUI(val);
      await updateSetting({ panelOpacity: val });
    });
  });

  panelOpSlider.addEventListener('input', () => {
    const val = Number(panelOpSlider.value);
    syncPanelOpacityUI(val);
    state.settings = { ...state.settings, panelOpacity: val };
    applyTheme();
  });
  panelOpSlider.addEventListener('change', () => {
    updateSetting({ panelOpacity: Number(panelOpSlider.value) });
  });

  panelBlurSlider.addEventListener('input', () => {
    const val = Number(panelBlurSlider.value);
    panelBlurVal.textContent = `${val} px`;
    state.settings = { ...state.settings, panelBlur: val };
    applyTheme();
  });
  panelBlurSlider.addEventListener('change', () => {
    updateSetting({ panelBlur: Number(panelBlurSlider.value) });
  });

  // Dynamischer Akzent-Farbverlauf
  const gradientToggle = view.querySelector('#set-accent-gradient');
  const gradientRow = view.querySelector('#accent-gradient-row');
  gradientToggle.addEventListener('change', () => {
    gradientRow.hidden = !gradientToggle.checked;
    updateSetting({ accentGradient: gradientToggle.checked });
  });
  const from = view.querySelector('#set-accent-from');
  const to = view.querySelector('#set-accent-to');
  from.addEventListener('input', () => updateSetting({ accentGradientFrom: from.value }));
  to.addEventListener('input', () => updateSetting({ accentGradientTo: to.value }));

  // Button-Stil (gradient | solid | soft | outline)
  const bstyleSeg = view.querySelector('#btn-style-seg');
  bstyleSeg.querySelectorAll('button').forEach((btn) => {
    if (btn.dataset.bstyle === (settings.buttonStyle || 'gradient')) btn.classList.add('is-active');
    btn.addEventListener('click', async () => {
      bstyleSeg.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      await updateSetting({ buttonStyle: btn.dataset.bstyle });
    });
  });

  // Karten-Design (glass | flat | bordered)
  const cstyleSeg = view.querySelector('#card-style-seg');
  cstyleSeg.querySelectorAll('button').forEach((btn) => {
    if (btn.dataset.cstyle === (settings.cardStyle || 'glass')) btn.classList.add('is-active');
    btn.addEventListener('click', async () => {
      cstyleSeg.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      await updateSetting({ cardStyle: btn.dataset.cstyle });
    });
  });

  // UI-Dichte (compact | normal | comfortable)
  const densitySeg = view.querySelector('#density-seg');
  densitySeg.querySelectorAll('button').forEach((btn) => {
    if (btn.dataset.density === (settings.uiDensity || 'normal')) btn.classList.add('is-active');
    btn.addEventListener('click', async () => {
      densitySeg.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      await updateSetting({ uiDensity: btn.dataset.density });
    });
  });

  // Animationen
  view.querySelector('#set-animations').addEventListener('change', (e) => {
    updateSetting({ animationsEnabled: e.target.checked });
  });

  const bgSeg = view.querySelector('#bg-seg');
  bgSeg.querySelectorAll('button').forEach((btn) => {
    if (btn.dataset.bg === (settings.backgroundStyle || 'default')) btn.classList.add('is-active');
    btn.addEventListener('click', async () => {
      bgSeg.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      await updateSetting({ backgroundStyle: btn.dataset.bg });
      renderBackgroundOptions(state.settings);
    });
  });
  renderBackgroundOptions(settings);
}

const SOLID_BG_PRESETS = ['#07080d', '#0b1120', '#111827', '#13111c', '#091516'];

function renderBackgroundOptions(settings) {
  const box = view.querySelector('#bg-options');
  if (!box) return;
  const style = settings.backgroundStyle || 'default';
  box.innerHTML = '';

  if (style === 'default') return;

  if (style === 'solid') {
    const currentSolid = (settings.backgroundSolid || '#0f0f18').toLowerCase();
    box.innerHTML = `
      <div class="bg-options__row">
        <span class="bg-options__label">Hintergrundfarbe</span>
        <div class="color-field" style="flex:1;">
          <label class="color-swatch" title="Hintergrundfarbe wählen">
            <input type="color" id="set-bg-solid" value="${currentSolid}" aria-label="Hintergrundfarbe" />
            <span class="color-swatch__dot" id="set-bg-solid-dot" style="background:${currentSolid}"></span>
          </label>
          <div class="color-presets" id="set-bg-solid-presets"></div>
          <code class="bg-options__code" id="set-bg-solid-hex">${currentSolid.toUpperCase()}</code>
        </div>
      </div>`;
    const el = box.querySelector('#set-bg-solid');
    const dot = box.querySelector('#set-bg-solid-dot');
    const code = box.querySelector('#set-bg-solid-hex');
    const presetsWrap = box.querySelector('#set-bg-solid-presets');
    SOLID_BG_PRESETS.forEach((pHex) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'color-preset' + (pHex === currentSolid ? ' is-active' : '');
      b.style.background = pHex;
      b.title = pHex;
      b.addEventListener('click', () => {
        el.value = pHex;
        dot.style.background = pHex;
        code.textContent = pHex.toUpperCase();
        presetsWrap.querySelectorAll('.color-preset').forEach((c) => c.classList.toggle('is-active', c === b));
        updateSetting({ backgroundSolid: pHex });
      });
      presetsWrap.appendChild(b);
    });
    el.addEventListener('input', () => {
      dot.style.background = el.value;
      code.textContent = el.value.toUpperCase();
      updateSetting({ backgroundSolid: el.value });
    });
    return;
  }

  if (style === 'gradient') {
    const gFrom = settings.backgroundGradientFrom || '#161630';
    const gTo = settings.backgroundGradientTo || '#0a0a0f';
    box.innerHTML = `
      <div class="bg-options__row">
        <span class="bg-options__label">Farbverlauf</span>
        <div class="color-pair" style="flex:1;">
          <input type="color" id="set-bg-from" value="${gFrom}" aria-label="Verlauf von" />
          <span class="color-pair__arrow">${icon('arrow-right', 15)}</span>
          <input type="color" id="set-bg-to" value="${gTo}" aria-label="Verlauf bis" />
          <span class="bg-gradient-preview" id="set-bg-grad-preview" style="background:linear-gradient(135deg, ${gFrom}, ${gTo})"></span>
        </div>
      </div>`;
    const fromEl = box.querySelector('#set-bg-from');
    const toEl = box.querySelector('#set-bg-to');
    const prev = box.querySelector('#set-bg-grad-preview');
    const syncPreview = () => {
      prev.style.background = `linear-gradient(135deg, ${fromEl.value}, ${toEl.value})`;
    };
    fromEl.addEventListener('input', (e) => { syncPreview(); updateSetting({ backgroundGradientFrom: e.target.value }); });
    toEl.addEventListener('input', (e) => { syncPreview(); updateSetting({ backgroundGradientTo: e.target.value }); });
    return;
  }

  const sharpenChecked = settings.backgroundImageSharpen !== false;
  box.innerHTML = `
    <div class="bg-options__row">
      <span class="bg-options__label">Bilddatei</span>
      <div class="bg-image-row">
        <span class="bg-image-thumb" id="bg-thumb"></span>
        <button type="button" class="btn btn--ghost btn--sm" id="bg-pick">${icon('image', 14)} Bild auswählen</button>
        <button type="button" class="btn btn--ghost btn--sm" id="bg-clear">Entfernen</button>
      </div>
    </div>
    <div class="bg-options__row">
      <span class="bg-options__label">Deckkraft</span>
      <input type="range" class="studio-range" id="bg-opacity" min="0" max="100" value="${settings.backgroundImageOpacity ?? 100}" />
      <span class="bg-options__value" id="bg-opacity-val">${settings.backgroundImageOpacity ?? 100}%</span>
    </div>
    <div class="bg-options__row">
      <span class="bg-options__label">Weichzeichner</span>
      <input type="range" class="studio-range" id="bg-blur" min="0" max="40" value="${settings.backgroundImageBlur ?? 0}" />
      <span class="bg-options__value" id="bg-blur-val">${settings.backgroundImageBlur ?? 0}px</span>
    </div>
    <div class="bg-options__row" style="justify-content:space-between;">
      <span class="bg-options__label" style="min-width:0;flex:1;">
        HD-Bildschärfe &amp; Auto-Zuschnitt
        <span class="hint" style="display:block;font-size:11px;color:var(--text-dim);">Rendert das Bild mit Lanczos-3-Upscaling in nativer Display-Auflösung ohne Pixelbildung.</span>
      </span>
      <label class="switch">
        <input type="checkbox" id="bg-sharpen" ${sharpenChecked ? 'checked' : ''} />
        <span class="switch__slider"></span>
      </label>
    </div>`;

  const thumb = box.querySelector('#bg-thumb');
  if (state.backgroundImageUrl) thumb.style.backgroundImage = `url("${state.backgroundImageUrl}")`;
  else thumb.classList.add('is-empty');

  box.querySelector('#bg-pick').addEventListener('click', async () => {
    try {
      const res = await api.app.pickBackground();
      if (res && res.canceled) return;
      unwrap(res);
      await updateSetting({ backgroundImage: res.path });
      await resolveBackgroundUrl();
      applyTheme();
      renderBackgroundOptions(state.settings);
      showToast({ type: 'success', message: 'Hintergrundbild in HD-Schärfe übernommen.' });
    } catch (err) {
      showToast({ type: 'error', message: err.message });
    }
  });

  box.querySelector('#bg-clear').addEventListener('click', async () => {
    await updateSetting({ backgroundImage: '' });
    await resolveBackgroundUrl();
    applyTheme();
    renderBackgroundOptions(state.settings);
  });

  const op = box.querySelector('#bg-opacity');
  const opVal = box.querySelector('#bg-opacity-val');
  op.addEventListener('input', () => {
    opVal.textContent = `${op.value}%`;
    state.settings = { ...state.settings, backgroundImageOpacity: Number(op.value) };
    applyTheme();
  });
  op.addEventListener('change', () => updateSetting({ backgroundImageOpacity: Number(op.value) }));

  const bl = box.querySelector('#bg-blur');
  const blVal = box.querySelector('#bg-blur-val');
  bl.addEventListener('input', () => {
    blVal.textContent = `${bl.value}px`;
    state.settings = { ...state.settings, backgroundImageBlur: Number(bl.value) };
    applyTheme();
  });
  bl.addEventListener('change', () => updateSetting({ backgroundImageBlur: Number(bl.value) }));

  const sh = box.querySelector('#bg-sharpen');
  if (sh) {
    sh.addEventListener('change', () => {
      updateSetting({ backgroundImageSharpen: sh.checked });
    });
  }
}

function makeListIcon(profile) {
  const span = document.createElement('span');
  span.className = 'item-icon';
  if (profile.accentColor) {
    span.style.color = profile.accentColor;
    span.style.background = `${profile.accentColor}22`;
  }
  span.innerHTML = icon(profile.iconName || DEFAULT_PROFILE_ICON, 15);
  return span;
}

function renderSessionList() {
  const list = view.querySelector('#session-list');
  if (!list) return;
  list.innerHTML = '';
  if (state.profiles.length === 0) {
    list.innerHTML = '<div class="muted" style="font-size:12.5px;">Noch keine Profile angelegt.</div>';
    return;
  }
  for (const profile of state.profiles) {
    const item = document.createElement('div');
    item.className = 'settings-list__item';
    item.appendChild(makeListIcon(profile));

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = profile.name;
    item.appendChild(name);

    const btn = document.createElement('button');
    btn.className = 'btn btn--ghost btn--sm';
    btn.textContent = 'Sitzung leeren';
    btn.addEventListener('click', async () => {
      try {
        const res = await api.sessions.reset(profile.id);
        unwrap(res);
        showToast({ type: 'success', message: `Sitzung von „${profile.name}“ zurückgesetzt.` });
      } catch (err) {
        showToast({ type: 'error', message: err.message });
      }
    });
    item.appendChild(btn);
    list.appendChild(item);
  }
}

const AUTO_LOCK_PRESETS = [
  { value: 0, label: 'Deaktiviert (0 Min.)' },
  { value: 1, label: 'Nach 1 Minute' },
  { value: 5, label: 'Nach 5 Minuten' },
  { value: 10, label: 'Nach 10 Minuten' },
  { value: 15, label: 'Nach 15 Minuten' },
  { value: 30, label: 'Nach 30 Minuten' },
  { value: 60, label: 'Nach 60 Minuten' }
];

async function renderVaultPanel() {
  const box = view.querySelector('#vault-panel-body');
  if (!box) return;
  const savedScroll = view ? view.scrollTop : 0;

  let status = { initialized: false, unlocked: false, state: 'uninitialized' };
  let bio = { available: false, touchIdAvailable: false, methodLabel: 'Windows Hello', vaultEnrolled: false };
  try {
    const res = await api.vault.status();
    if (res && res.ok !== false) status = res;
  } catch {
    /* Status nicht verfügbar */
  }
  try {
    if (api.biometrics && api.biometrics.status) {
      const bRes = await api.biometrics.status();
      if (bRes && bRes.ok !== false) bio = bRes;
    }
  } catch {
    /* Biometrie nicht verfügbar */
  }

  const stateLabel = !status.initialized ? 'Nicht eingerichtet' : (status.unlocked ? 'Aktiv & Entsperrt' : 'Gesperrt');
  const stateClass = !status.initialized ? '' : (status.unlocked ? 'tag--ok' : 'tag--warn');
  const minutes = Number(state.settings && state.settings.autoLockMinutes) || 0;
  const isPreset = AUTO_LOCK_PRESETS.some((o) => o.value === minutes);

  const optionItems = [...AUTO_LOCK_PRESETS];
  if (!isPreset && minutes > 0) {
    optionItems.push({ value: minutes, label: `Eigene Zeit (${minutes} Min.)` });
  }
  const optionsHtml = optionItems
    .map((o) => `<option value="${o.value}"${o.value === minutes ? ' selected' : ''}>${o.label}</option>`)
    .join('');

  box.innerHTML = `
    <div class="panel__row">
      <div class="panel__row-label">
        <span class="panel__row-title">${icon('shield-check', 14)} <span>App-Schutz &amp; Hauptpasswort</span></span>
        <span class="hint">${status.initialized
          ? 'Profildaten, Passwörter und Einstellungen werden mit AES-256-GCM geschützt.'
          : 'Richte ein Hauptpasswort ein, um SQL Hub beim Start zu schützen und den Passwort-Manager abzusichern.'}</span>
      </div>
      <span class="tag ${stateClass}">${stateLabel}</span>
    </div>

    <div class="panel__row">
      <div class="panel__row-label">
        <span class="panel__row-title">${icon('fingerprint', 14)} <span>Schnell-Entsperrung mit ${escapeHtml(bio.methodLabel || 'Windows Hello')}</span></span>
        <span class="hint">${bio.touchIdAvailable
          ? 'Entsperre SQL Hub und den Passwort-Manager auf deinem Mac per Fingerabdruck (Touch ID).'
          : 'Ermöglicht auf dem Sperrbildschirm die direkte Entsperrung über deine System-Authentifizierung.'}</span>
      </div>
      <label class="switch" title="${status.initialized ? 'Biometrische Entsperrung umschalten' : 'Richte zuerst ein Hauptpasswort ein'}">
        <input type="checkbox" id="set-bio-unlock" ${bio.vaultEnrolled ? 'checked' : ''} ${status.initialized && bio.available ? '' : 'disabled'} />
        <span class="switch__slider"></span>
      </label>
    </div>

    <div class="panel__row panel__row--stack">
      <div class="panel__row-label">Automatische Inaktivitätssperre
        <span class="hint">Wähle eine Vorlage oder stelle deine eigene Zeit in Minuten ein (0 = deaktiviert, bis 1440 Min.).</span>
      </div>
      <div class="autolock-controls">
        <div class="select-wrap autolock-controls__select" id="autolock-select-wrap">
          <select id="set-autolock" aria-label="Automatisch sperren">${optionsHtml}</select>
        </div>
        <div class="num-stepper" title="Eigene Zeit in Minuten (0 = deaktiviert)">
          <button type="button" class="num-stepper__btn" id="autolock-dec" aria-label="1 Minute weniger">−</button>
          <div class="num-stepper__field">
            <input type="number" id="set-autolock-custom" min="0" max="1440" step="1" value="${minutes}" aria-label="Eigene Inaktivitätszeit in Minuten" />
            <span class="num-stepper__unit">Min.</span>
          </div>
          <button type="button" class="num-stepper__btn" id="autolock-inc" aria-label="1 Minute mehr">+</button>
        </div>
      </div>
    </div>
    <div class="actions-row" style="margin-top: 12px;" id="vault-actions"></div>
  `;

  if (view && savedScroll > 0) {
    view.scrollTop = savedScroll;
  }

  const bioToggle = box.querySelector('#set-bio-unlock');
  if (bioToggle) {
    bioToggle.addEventListener('change', async () => {
      if (bioToggle.checked) {
        const pw = await promptPassword({
          title: `${bio.methodLabel || 'Windows Hello'} aktivieren`,
          message: `Bitte gib einmalig dein Hauptpasswort ein, um ${bio.methodLabel || 'Windows Hello'} für SQL Hub zu aktivieren.`,
          label: 'Hauptpasswort',
          confirmLabel: 'Aktivieren'
        });
        if (!pw) {
          bioToggle.checked = false;
          return;
        }
        try {
          const res = await api.biometrics.enrollVault(pw);
          unwrap(res);
          showToast({ type: 'success', message: `${bio.methodLabel || 'Windows Hello'} erfolgreich aktiviert.` });
          renderVaultPanel();
        } catch (err) {
          bioToggle.checked = false;
          showToast({ type: 'error', message: err.message });
        }
      } else {
        try {
          await api.biometrics.disableVault();
          showToast({ type: 'info', message: `${bio.methodLabel || 'Windows Hello'} deaktiviert.` });
          renderVaultPanel();
        } catch (err) {
          showToast({ type: 'error', message: err.message });
        }
      }
    });
  }

  const autolockSelect = box.querySelector('#set-autolock');
  const autolockCustom = box.querySelector('#set-autolock-custom');
  enhanceSelect(autolockSelect);

  const syncAutolockSelectInPlace = (val) => {
    if (!autolockSelect) return;
    const isPresetVal = AUTO_LOCK_PRESETS.some((o) => o.value === val);
    const nextItems = [...AUTO_LOCK_PRESETS];
    if (!isPresetVal && val > 0) {
      nextItems.push({ value: val, label: `Eigene Zeit (${val} Min.)` });
    }
    autolockSelect.innerHTML = nextItems
      .map((o) => `<option value="${o.value}"${o.value === val ? ' selected' : ''}>${o.label}</option>`)
      .join('');
    autolockSelect.value = String(val);
    enhanceSelect(autolockSelect);
  };

  // In-Place-Aktualisierung ohne DOM-Neuaufbau des Panels (verhindert jegliches Hochscrollen beim Klick auf + / -)
  const applyAutoLockMin = async (rawVal) => {
    const keepScroll = view ? view.scrollTop : 0;
    const raw = Number(rawVal);
    const val = Number.isNaN(raw) ? 0 : Math.min(1440, Math.max(0, Math.round(raw)));
    autolockCustom.value = String(val);
    syncAutolockSelectInPlace(val);
    await updateSetting({ autoLockMinutes: val });
    if (view) view.scrollTop = keepScroll;
    showToast({
      type: 'info',
      message: val > 0
        ? `Automatische Inaktivitätssperre auf ${val} ${val === 1 ? 'Minute' : 'Minuten'} gesetzt.`
        : 'Automatische Inaktivitätssperre deaktiviert.'
    });
  };

  autolockSelect.addEventListener('change', (e) => applyAutoLockMin(e.target.value));
  autolockCustom.addEventListener('change', () => applyAutoLockMin(autolockCustom.value));
  box.querySelector('#autolock-dec').addEventListener('click', (e) => {
    e.preventDefault();
    applyAutoLockMin(Math.max(0, (Number(autolockCustom.value) || 0) - 1));
  });
  box.querySelector('#autolock-inc').addEventListener('click', (e) => {
    e.preventDefault();
    applyAutoLockMin((Number(autolockCustom.value) || 0) + 1);
  });

  const actions = box.querySelector('#vault-actions');
  if (!status.initialized) {
    const btn = document.createElement('button');
    btn.className = 'btn btn--primary';
    btn.innerHTML = `${icon('shield-check', 15)} Hauptpasswort einrichten`;
    btn.addEventListener('click', () => openVaultSetup());
    actions.appendChild(btn);
    return;
  }

  if (status.unlocked) {
    const change = document.createElement('button');
    change.className = 'btn btn--ghost';
    change.innerHTML = `${icon('key-round', 15)} Hauptpasswort ändern`;
    change.addEventListener('click', () => openVaultChangePassword());

    const lockBtn = document.createElement('button');
    lockBtn.className = 'btn btn--ghost';
    lockBtn.innerHTML = `${icon('lock', 15)} App jetzt sperren`;
    lockBtn.addEventListener('click', () => {
      lockPasswordManagerSession();
      lockVaultNow();
    });

    actions.append(change, lockBtn);
    return;
  }

  const unlock = document.createElement('button');
  unlock.className = 'btn btn--primary';
  unlock.innerHTML = `${icon('lock-open', 15)} App entsperren`;
  unlock.addEventListener('click', async () => {
    const password = await promptPassword({
      title: 'SQL Hub entsperren',
      message: 'Bitte gib dein Passwort ein, um den Arbeitsbereich freizugeben.',
      label: 'Passwort',
      confirmLabel: 'Entsperren',
      allowBiometric: bio.vaultEnrolled
    });
    if (!password) return;
    try {
      const res = password === '__BIOMETRIC_UNLOCK__'
        ? await api.biometrics.unlockVault()
        : await api.vault.unlock(password);
      unwrap(res);
      showToast({ type: 'success', message: 'Arbeitsbereich entsperrt.' });
      await loadSettings();
      renderVaultPanel();
    } catch (err) {
      showToast({ type: 'error', message: err.message });
    }
  });
  actions.appendChild(unlock);
}

async function updateSetting(patch) {
  try {
    const res = await api.settings.set(patch);
    unwrap(res);
    state.settings = res.settings;
    applyTheme();
    if (patch.startView) loadSettings();
  } catch (err) {
    showToast({ type: 'error', message: err.message });
  }
}
