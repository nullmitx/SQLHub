// about.js – „Über SQL Hub"-Seite im Studio-Showcase-Design inkl. Custom Setup-/Update- & Deinstallations-Assistent

import { api } from './api.js';
import { icon } from './icons.js';
import { escapeHtml } from './dom.js';
import { showToast } from './toast.js';

const view = document.getElementById('view-about');

export async function renderAbout() {
  view.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';

  let info = {};
  try {
    info = (await api.app.version()) || {};
  } catch {
    /* optional */
  }

  const versionStr = info.version || '2.4.4';
  const electronStr = info.electron || '—';
  const chromeStr = info.chrome || '—';
  const nodeStr = info.node || '—';
  const platformCode = info.platform || 'win32';
  const archStr = info.arch || 'x64';
  const platformLabel = platformCode === 'darwin'
    ? `macOS (${archStr})`
    : platformCode === 'linux'
      ? `Linux (${archStr})`
      : `Windows (${archStr})`;
  const osStoreLabel = platformCode === 'darwin'
    ? 'macOS Keychain & Touch ID'
    : platformCode === 'linux'
      ? 'Secret Service / Keyring'
      : 'Windows DPAPI';

  view.innerHTML = `
    <div class="page-head">
      <div class="page-head__titles">
        <div class="page-eyebrow">SYSTEMINFORMATIONEN &amp; ARCHITEKTUR</div>
        <h1 class="page-title">Über SQL Hub</h1>
        <p class="page-sub">Sicherheitsarchitektur, Laufzeitumgebung, SFTP-Client, Custom Setup/Deinstallation und Tastenkombinationen</p>
      </div>
    </div>

    <div class="about-hero">
      <div class="about-hero__glow" aria-hidden="true"></div>
      <div class="about-hero__top">
        <div class="about-hero__mark">
          <img src="../assets/sqlhubnew.png" class="about-hero__logo-img" alt="SQL Hub" />
        </div>
        <div class="about-hero__body">
          <div class="about-hero__title-row">
            <h2>SQL Hub</h2>
            <span class="tag tag--ok">${icon('circle-check', 12)} Version ${escapeHtml(versionStr)}</span>
          </div>
          <p>Open-Source Cross-Platform-Arbeitsumgebung (Windows, macOS &amp; Linux) zur zentralen Steuerung mehrerer Datenbank-Panels (phpMyAdmin, Adminer, pgAdmin, Plesk, CloudPanel) inklusive integriertem Termius-Stil SFTP-Client, Addon-Baukasten, isolierten Browser-Partitionen und mehrstufiger Kryptografie.</p>
          <div class="about-hero__pills">
            <span class="badge">${icon('shield-check', 12)} ${escapeHtml(osStoreLabel)}</span>
            <span class="badge">${icon('fingerprint', 12)} Touch ID &amp; Biometrie</span>
            <span class="badge">${icon('lock', 12)} AES-256-GCM App-Schutz</span>
            <span class="badge">${icon('puzzle', 12)} Offenes Addon-Ökosystem</span>
            <span class="badge">${icon('zap', 12)} Custom Setup &amp; Deinstaller</span>
          </div>
        </div>
      </div>

      <div class="about-hero__toolbar">
        <button type="button" class="about-action-card about-action-card--primary" id="about-install-update" title="Heruntergeladenes SQL Hub Update-Paket (.exe, .dmg, .AppImage, .deb, .rpm, .tar.gz) installieren">
          <span class="about-action-card__icon">${icon('refresh-cw', 16)}</span>
          <span class="about-action-card__text">
            <strong>App-Update installieren</strong>
            <small>Bestehende Installation aktualisieren</small>
          </span>
        </button>

        <button type="button" class="about-action-card" id="about-open-uninstaller" title="Custom Setup-, Reparatur- &amp; Deinstallations-Assistent öffnen">
          <span class="about-action-card__icon">${icon('hard-drive', 16)}</span>
          <span class="about-action-card__text">
            <strong>Setup &amp; Deinstallation</strong>
            <small>Custom Installer &amp; Deinstallations-Fenster</small>
          </span>
        </button>

        <button type="button" class="about-action-card" id="about-copy-diag" title="Versions- und Systeminformationen in die Zwischenablage kopieren">
          <span class="about-action-card__icon" id="about-copy-diag-icon">${icon('copy', 16)}</span>
          <span class="about-action-card__text">
            <strong id="about-copy-diag-title">Systemdaten kopieren</strong>
            <small id="about-copy-diag-sub">Versionsdaten in Zwischenablage</small>
          </span>
        </button>

        <button type="button" class="about-action-card" id="about-open-settings" title="Darstellung, App-Schutz &amp; Einstellungen öffnen">
          <span class="about-action-card__icon">${icon('settings', 16)}</span>
          <span class="about-action-card__text">
            <strong>Einstellungen öffnen</strong>
            <small>Design, App-Schutz &amp; Passwort-Manager</small>
          </span>
        </button>
      </div>
    </div>

    <div class="about-cards-grid">
      <div class="panel about-panel">
        <h2>${icon('cpu', 16)} Laufzeitumgebung</h2>
        <p class="panel__desc">Technische System- und Engine-Versionen deiner Installation.</p>
        <div class="about-kv-list">
          <div class="about-kv-row">
            <span class="about-kv-key">App-Version</span>
            <code class="about-kv-val about-kv-val--accent">v${escapeHtml(versionStr)}</code>
          </div>
          <div class="about-kv-row">
            <span class="about-kv-key">Electron Engine</span>
            <code class="about-kv-val">${escapeHtml(electronStr)}</code>
          </div>
          <div class="about-kv-row">
            <span class="about-kv-key">Chromium Core</span>
            <code class="about-kv-val">${escapeHtml(chromeStr)}</code>
          </div>
          <div class="about-kv-row">
            <span class="about-kv-key">Node.js Runtime</span>
            <code class="about-kv-val">${escapeHtml(nodeStr)}</code>
          </div>
          <div class="about-kv-row">
            <span class="about-kv-key">Plattform</span>
            <code class="about-kv-val">${escapeHtml(platformLabel)}</code>
          </div>
        </div>
      </div>

      <div class="panel about-panel">
        <h2>${icon('shield-check', 16)} Sicherheitsarchitektur</h2>
        <p class="panel__desc">Mehrstufiger Schutz deiner Datenbank-Zugangsdaten.</p>
        <div class="about-kv-list">
          <div class="about-kv-row">
            <span class="about-kv-key">Credential-Store</span>
            <code class="about-kv-val">${escapeHtml(osStoreLabel)}</code>
          </div>
          <div class="about-kv-row">
            <span class="about-kv-key">App-Verschlüsselung</span>
            <code class="about-kv-val">AES-256-GCM · scrypt</code>
          </div>
          <div class="about-kv-row">
            <span class="about-kv-key">Prozess-Isolation</span>
            <code class="about-kv-val">Sandbox · CSP · Preload</code>
          </div>
          <div class="about-kv-row">
            <span class="about-kv-key">Sitzungstrennung</span>
            <code class="about-kv-val">persist:sqlhub-…</code>
          </div>
        </div>
        <div class="security-note">
          ${icon('shield-check', 17)}
          <span>Passwörter werden niemals im Klartext abgelegt und bleiben auch bei App-Updates vollständig verschlüsselt erhalten.</span>
        </div>
      </div>

      <div class="panel about-panel">
        <h2>${icon('zap', 16)} Studio-Highlights &amp; Plattformen</h2>
        <p class="panel__desc">Entwickelt für Windows, macOS und alle Linux-Distributionen.</p>
        <div class="about-feature-list">
          <div class="about-feature">
            <div class="about-feature__icon">${icon('fingerprint', 16)}</div>
            <div class="about-feature__body">
              <b>Touch ID, Biometrie &amp; Passwort-Manager</b>
              <span>Unterstützt macOS Touch ID, Windows DPAPI, Linux Keyring (inkl. AES-256-Fallback) sowie den integrierten Passwort-Manager.</span>
            </div>
          </div>
          <div class="about-feature">
            <div class="about-feature__icon">${icon('refresh-cw', 16)}</div>
            <div class="about-feature__body">
              <b>Nahtlose In-Place-Aktualisierung</b>
              <span>Neue Setup-Versionen aktualisieren die bestehende App direkt – alle Profile &amp; Passwörter bleiben erhalten.</span>
            </div>
          </div>
          <div class="about-feature">
            <div class="about-feature__icon">${icon('activity', 16)}</div>
            <div class="about-feature__body">
              <b>Cross-Platform &amp; Echtzeit-Latenz</b>
              <span>Nativ verfügbar für Windows (.exe), macOS (.dmg/.pkg/.app) und Linux (.tar.gz, .AppImage, .deb, .rpm).</span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel panel--wide">
        <h2>${icon('monitor', 16)} Installation &amp; Nutzung auf Windows, macOS &amp; Linux</h2>
        <p class="panel__desc">SQL Hub v${escapeHtml(versionStr)} läuft nativ auf Windows, macOS (Intel &amp; Apple Silicon M1–M4) und allen Linux-Distributionen.</p>
        <div class="shortcut-grid">
          <div class="shortcut-item">
            <span class="shortcut-item__label">
              <strong>Windows 10 / 11 (x64)</strong><br />
              <span class="muted" style="font-size:11.5px;">NSIS-Installer &amp; Portable EXE im <code>dist/</code>-Ordner</span>
            </span>
            <button type="button" class="btn btn--subtle btn--sm" data-copy-cmd="dist\\SQL Hub-Setup-${escapeHtml(versionStr)}.exe">${icon('copy', 13)} Pfad kopieren</button>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-item__label">
              <strong>macOS (Intel &amp; Apple Silicon M1–M4)</strong><br />
              <span class="muted" style="font-size:11.5px;">Installiert <code>SQL Hub.app</code> in <code>/Applications</code> inkl. Touch ID &amp; Gatekeeper-Freigabe</span>
            </span>
            <button type="button" class="btn btn--subtle btn--sm" data-copy-cmd="bash scripts/install-macos.command">${icon('copy', 13)} Befehl kopieren</button>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-item__label">
              <strong>Linux Universal-Installer (alle Distros)</strong><br />
              <span class="muted" style="font-size:11.5px;">Richtet Starter, Icon &amp; Desktop-Eintrag für Ubuntu, Debian, Fedora, Arch, Mint ein</span>
            </span>
            <button type="button" class="btn btn--subtle btn--sm" data-copy-cmd="bash scripts/install-linux.sh">${icon('copy', 13)} Befehl kopieren</button>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-item__label">
              <strong>Linux Paket-Archiv (Fertig gebaut in <code>dist/</code>)</strong><br />
              <span class="muted" style="font-size:11.5px;">Direkt ausführbares Linux-Bundle <code>SQL Hub-${escapeHtml(versionStr)}-linux-x64.tar.gz</code></span>
            </span>
            <button type="button" class="btn btn--subtle btn--sm" data-copy-cmd="tar -xzf &quot;dist/SQL Hub-${escapeHtml(versionStr)}-linux-x64.tar.gz&quot; &amp;&amp; ./SQL\\ Hub-${escapeHtml(versionStr)}-linux-x64/sql-hub --no-sandbox">${icon('copy', 13)} Befehl kopieren</button>
          </div>
        </div>
      </div>

      <div class="panel panel--wide">
        <h2>${icon('command', 16)} Tastenkombinationen &amp; Produktivität</h2>
        <p class="panel__desc">Direkter Zugriff auf alle wichtigen Funktionen über die Tastatur (Windows/Linux: <code>Strg</code> · macOS: <code>⌘ Cmd</code>).</p>
        <div class="shortcut-grid">
          <div class="shortcut-item">
            <span class="shortcut-item__label">Befehlspalette &amp; Schnellsuche öffnen</span>
            <span class="shortcut-keys"><kbd class="kbd">Strg / ⌘</kbd><span>+</span><kbd class="kbd">K</kbd></span>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-item__label">Neues Datenbankprofil anlegen</span>
            <span class="shortcut-keys"><kbd class="kbd">Strg / ⌘</kbd><span>+</span><kbd class="kbd">N</kbd></span>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-item__label">Profilsuche fokussieren</span>
            <span class="shortcut-keys"><kbd class="kbd">Strg / ⌘</kbd><span>+</span><kbd class="kbd">F</kbd></span>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-item__label">Aktive Browser-Sitzung neu laden</span>
            <span class="shortcut-keys"><kbd class="kbd">Strg / ⌘</kbd><span>+</span><kbd class="kbd">R</kbd></span>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-item__label">Im Browser zurück / vorwärts navigieren</span>
            <span class="shortcut-keys"><kbd class="kbd">Alt</kbd><span>+</span><kbd class="kbd">←</kbd><span>/</span><kbd class="kbd">→</kbd></span>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-item__label">Dialog schließen / Zurück zum Dashboard</span>
            <span class="shortcut-keys"><kbd class="kbd">Esc</kbd></span>
          </div>
        </div>
      </div>
    </div>
  `;

  view.querySelectorAll('[data-copy-cmd]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cmd = btn.getAttribute('data-copy-cmd') || '';
      if (!cmd) return;
      try {
        if (api.app && api.app.copyClipboard) {
          await api.app.copyClipboard(cmd);
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(cmd);
        }
        showToast({
          type: 'success',
          title: 'Befehl kopiert',
          message: cmd
        });
      } catch {
        showToast({ type: 'error', message: 'Befehl konnte nicht kopiert werden.' });
      }
    });
  });

  const updateBtn = view.querySelector('#about-install-update');
  if (updateBtn) {
    updateBtn.addEventListener('click', async () => {
      try {
        const res = await api.app.installUpdate();
        if (res && res.canceled) return;
        if (res && res.ok) {
          showToast({
            type: 'info',
            title: 'Update wird gestartet',
            message: 'Der Installer wird geöffnet und SQL Hub für die Aktualisierung geschlossen …'
          });
        } else if (res && res.errors) {
          showToast({ type: 'error', message: res.errors.join(' ') });
        }
      } catch (err) {
        showToast({ type: 'error', message: err.message });
      }
    });
  }

  const copyBtn = view.querySelector('#about-copy-diag');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const text = [
        `SQL Hub Studio v${versionStr}`,
        `Electron: ${electronStr}`,
        `Chromium: ${chromeStr}`,
        `Node.js: ${nodeStr}`,
        `Platform: ${platformLabel}`
      ].join(' | ');

      let copied = false;
      try {
        if (api.app && api.app.copyClipboard) {
          const res = await api.app.copyClipboard(text);
          copied = Boolean(res && res.ok);
        }
      } catch {
        /* fallback below */
      }
      if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch {
          /* ignore */
        }
      }

      if (copied) {
        const iconEl = view.querySelector('#about-copy-diag-icon');
        const titleEl = view.querySelector('#about-copy-diag-title');
        const subEl = view.querySelector('#about-copy-diag-sub');
        copyBtn.classList.add('is-copied');
        if (iconEl) iconEl.innerHTML = icon('check', 16);
        if (titleEl) titleEl.textContent = 'Systemdaten kopiert!';
        if (subEl) subEl.textContent = text;
        showToast({
          type: 'success',
          title: 'In Zwischenablage kopiert',
          message: text
        });
        setTimeout(() => {
          if (!copyBtn.isConnected) return;
          copyBtn.classList.remove('is-copied');
          if (iconEl) iconEl.innerHTML = icon('copy', 16);
          if (titleEl) titleEl.textContent = 'Systemdaten kopieren';
          if (subEl) subEl.textContent = 'Versionsdaten in Zwischenablage';
        }, 2400);
      } else {
        showToast({ type: 'error', message: 'Zwischenablage konnte nicht beschrieben werden.' });
      }
    });
  }

  const uninstallerBtn = view.querySelector('#about-open-uninstaller');
  if (uninstallerBtn) {
    uninstallerBtn.addEventListener('click', () => {
      openAppSetupAndUninstallModal(versionStr, platformLabel);
    });
  }

  const settingsBtn = view.querySelector('#about-open-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('sqlhub:navigate', { detail: 'settings' }));
    });
  }
}

export function openAppSetupAndUninstallModal(versionStr = '2.4.4', platformLabel = 'Windows') {
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  const close = () => el.remove();
  el.innerHTML = `
    <div class="modal modal--lg installer-modal">
      <div class="modal__header">
        <div>
          <h2 class="modal__title">${icon('hard-drive', 18)} SQL Hub Setup-, Reparatur- &amp; Deinstallations-Assistent</h2>
          <p class="modal__sub">Custom Installations- &amp; Deinstallations-Fenster für SQL Hub v${escapeHtml(versionStr)} (${escapeHtml(platformLabel)})</p>
        </div>
        <button type="button" class="icon-btn" data-modal-close title="Schließen">${icon('x', 16)}</button>
      </div>
      <div class="modal__body">
        <div class="installer-pkg-card" style="padding:12px; background:var(--bg-input); border:1px solid var(--border-strong); margin-bottom:12px;">
          <div class="installer-pkg-card__head">
            <span class="installer-pkg-card__icon" style="background:rgba(225,29,72,0.14); color:var(--primary); border:1px solid rgba(225,29,72,0.4);">
              ${icon('layers', 20)}
            </span>
            <div class="installer-pkg-card__info">
              <div class="installer-pkg-card__title">
                <strong>SQL Hub Desktop Studio</strong>
                <span class="tag tag--ok">v${escapeHtml(versionStr)} installiert</span>
              </div>
              <div class="installer-pkg-card__sub">Plattform: ${escapeHtml(platformLabel)} · Lokaler Tresor &amp; Addon-Engine aktiv</div>
            </div>
          </div>
        </div>

        <div class="uninstall-options-list">
          <label class="uninstall-option">
            <input type="radio" name="app-setup-mode" value="update" checked />
            <div>
              <strong>App-Update / Reparatur-Installation ausführen</strong>
              <span>Wählt ein Setup-Paket (.exe, .dmg, .AppImage, .deb, .tar.gz) aus und aktualisiert SQL Hub unter Beibehaltung aller Profile, SFTP-Server und Addons.</span>
            </div>
          </label>
          <label class="uninstall-option">
            <input type="radio" name="app-setup-mode" value="uninstall-keep" />
            <div>
              <strong>SQL Hub deinstallieren (Profile, Tresor &amp; Addons behalten)</strong>
              <span>Startet den Deinstallations-Assistenten für die Anwendung, lässt aber deine gespeicherten Datenbank-Profile und Verschlüsselungsdaten für spätere Versionen unberührt.</span>
            </div>
          </label>
          <label class="uninstall-option">
            <input type="radio" name="app-setup-mode" value="uninstall-wipe" />
            <div>
              <strong style="color:#fda4af;">Vollständige Deinstallation inkl. aller Benutzerdaten &amp; Tresor löschen</strong>
              <span>Löscht alle gespeicherten Profile, SFTP-Hosts, Passwort-Tresor-Dateien, Sitzungs-Cookies und startet anschließend den System-Uninstaller.</span>
            </div>
          </label>
        </div>

        <div id="app-setup-progress" class="installer-progress-wrap hidden">
          <div class="installer-progress-head">
            <span id="app-setup-progress-label">Vorgang wird vorbereitet …</span>
            <span id="app-setup-progress-pct">0%</span>
          </div>
          <div class="installer-progress-track">
            <div id="app-setup-progress-bar" class="installer-progress-fill" style="width:0%"></div>
          </div>
          <div id="app-setup-log" class="installer-log"></div>
        </div>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn btn--ghost" data-modal-close>Abbrechen</button>
        <button type="button" class="btn btn--primary" id="app-setup-run-btn">${icon('play', 14)} Assistent ausführen</button>
      </div>
    </div>
  `;

  (document.getElementById('modal-root') || document.body).appendChild(el);
  el.querySelectorAll('[data-modal-close]').forEach((btn) => btn.addEventListener('click', close));

  const runBtn = el.querySelector('#app-setup-run-btn');
  const progWrap = el.querySelector('#app-setup-progress');
  const progLabel = el.querySelector('#app-setup-progress-label');
  const progPct = el.querySelector('#app-setup-progress-pct');
  const progBar = el.querySelector('#app-setup-progress-bar');
  const progLog = el.querySelector('#app-setup-log');

  const logLine = (msg, pct) => {
    if (progWrap) progWrap.classList.remove('hidden');
    if (progLabel) progLabel.textContent = msg;
    if (progPct) progPct.textContent = `${pct}%`;
    if (progBar) progBar.style.width = `${pct}%`;
    if (progLog) {
      const line = document.createElement('div');
      line.textContent = `[${new Date().toLocaleTimeString('de-DE')}] ${msg}`;
      progLog.appendChild(line);
      progLog.scrollTop = progLog.scrollHeight;
    }
  };

  runBtn?.addEventListener('click', async () => {
    const mode = el.querySelector('input[name="app-setup-mode"]:checked')?.value || 'update';
    runBtn.disabled = true;

    try {
      if (mode === 'update') {
        logLine('Öffne Setup-/Update-Paketauswahl …', 35);
        const res = await api.app.installUpdate();
        if (res && res.canceled) {
          logLine('Auswahl abgebrochen.', 0);
          runBtn.disabled = false;
          return;
        }
        if (res && res.ok) {
          logLine('Update-Installer gestartet. SQL Hub wird aktualisiert …', 100);
          showToast({ type: 'info', title: 'Setup gestartet', message: 'Installer wird ausgeführt …' });
          setTimeout(() => close(), 600);
        } else {
          showToast({ type: 'error', message: (res && res.errors && res.errors.join(' ')) || 'Update fehlgeschlagen.' });
          runBtn.disabled = false;
        }
      } else {
        const wipeUserData = mode === 'uninstall-wipe';
        logLine(wipeUserData ? 'Bereinige lokale Tresor- & Profildaten …' : 'Behalte Benutzerdaten, bereite Uninstaller vor …', 40);
        await new Promise((r) => setTimeout(r, 250));
        const res = await api.app.uninstall({ wipeUserData, quitAfterCleanup: false });
        if (res && res.ok) {
          logLine(
            res.launchedUninstaller
              ? 'System-Uninstaller wurde gestartet.'
              : 'Benutzerdaten wurden bereinigt.',
            100
          );
          showToast({
            type: 'info',
            title: 'Deinstallations-Assistent',
            message: res.launchedUninstaller
              ? 'Der Deinstallations-Assistent wurde gestartet.'
              : wipeUserData
                ? 'Alle lokalen Profildaten & Tresor-Einträge wurden bereinigt.'
                : 'Deinstallation vorbereitet.'
          });
          setTimeout(() => close(), 800);
        } else {
          showToast({ type: 'error', message: (res && res.errors && res.errors.join(' ')) || 'Deinstallation fehlgeschlagen.' });
          runBtn.disabled = false;
        }
      }
    } catch (err) {
      showToast({ type: 'error', message: err.message });
      runBtn.disabled = false;
    }
  });
}
