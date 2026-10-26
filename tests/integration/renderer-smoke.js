'use strict';

/**
 * Renderer-/IPC-Smoke-Test unter Electron.
 *
 * Lädt die echte Oberfläche (index.html) inkl. Preload und registrierten
 * IPC-Handlern und prüft:
 *   1. Die ES-Module werden geladen (keine CSP-/Modulfehler).
 *   2. window.sqlhub ist verfügbar und IPC funktioniert (Profil anlegen).
 *   3. Nach dem Anlegen erscheint eine Profilkarte im Dashboard.
 *   4. „Profil hinzufügen" öffnet das Formular-Modal.
 *
 * Aufruf: npm run test:renderer
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, safeStorage } = require('electron');
const { ProfileStore } = require('../../src/main/profile-store');
const { CredentialStore } = require('../../src/main/credential-store');
const { SettingsStore } = require('../../src/main/settings-store');
const { SessionManager } = require('../../src/main/session-manager');
const { BrowserViewManager } = require('../../src/main/browser-views');
const { SftpManager } = require('../../src/main/sftp-manager');
const { AddonManager } = require('../../src/main/addon-manager');
const { registerIpc } = require('../../src/main/ipc');
const { Vault } = require('../../src/main/vault');
const { SCRYPT_TEST } = require('../../src/main/crypto');

if (!process.versions.electron) {
  console.error('Dieser Test muss unter Electron laufen.');
  process.exit(1);
}

const failures = [];
const pass = (n) => console.log('PASS  ' + n);
const fail = (n, r) => { console.log('FAIL  ' + n + ' :: ' + r); failures.push(n + '::' + r); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 15000, interval = 200) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(interval);
  }
  throw new Error('Timeout');
}

app.whenReady().then(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlhub-renderer-'));
  const files = {
    profiles: path.join(dir, 'profiles.json'),
    sftpHosts: path.join(dir, 'sftp-hosts.json'),
    credentials: path.join(dir, 'credentials.enc'),
    settings: path.join(dir, 'settings.json'),
    vault: path.join(dir, 'vault.json'),
    iconsDir: path.join(dir, 'icons'),
    addonsState: path.join(dir, 'addons-state.json'),
    userAddonsDir: path.join(dir, 'addons'),
    desktopAddonsDir: path.join(dir, 'SQLHubAddons')
  };
  const logger = { info() {}, warn() {}, error() {} };

  // Tresor für den Test einrichten und entsperren (schnelle Test-Parameter).
  const vault = new Vault({ file: files.vault, logger, params: SCRYPT_TEST });
  vault.create('test-master-password');
  const codec = vault.createCodec();

  const profileStore = new ProfileStore({ file: files.profiles, logger, codec });
  const credentialStore = new CredentialStore({ file: files.credentials, safeStorage, logger });
  const settingsStore = new SettingsStore({ file: files.settings, codec });
  const sftpManager = new SftpManager({ file: files.sftpHosts, credentialStore, codec, logger });
  const addonManager = new AddonManager({
    userDataDir: dir,
    stateFile: files.addonsState,
    logger
  });
  const sessionManager = new SessionManager({ logger });
  const getWindow = () => BrowserWindow.getAllWindows()[0];
  const emit = (channel, payload) => {
    const w = getWindow();
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  };
  const browserViews = new BrowserViewManager({ getWindow, credentialStore, logger, emit });

  registerIpc({ profileStore, credentialStore, settingsStore, sftpManager, addonManager, sessionManager, browserViews, vault, logger, dataFiles: files });

  const win = new BrowserWindow({
    width: 1200, height: 800, show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'src', 'preload', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });

  const consoleErrors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) consoleErrors.push(String(message));
  });

  await win.loadFile(path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html'));

  try {
    /* 1) Module geladen & API verfügbar */
    await waitFor(() => win.webContents.executeJavaScript('!!window.sqlhub && !!document.getElementById("btn-add-profile")'));
    pass('Renderer-Module geladen, Preload-API verfügbar');

    const gearFilled = await win.webContents.executeJavaScript(
      'document.getElementById("btn-settings").innerHTML.includes("svg")'
    );
    if (gearFilled) pass('UI initialisiert (Einstellungs-Icon gesetzt)');
    else fail('UI-Init', 'Einstellungs-Icon wurde nicht gesetzt');

    /* 2) IPC-Roundtrip: Profil über die Bridge anlegen */
    const created = await win.webContents.executeJavaScript(`
      window.sqlhub.profiles.create({
        name: 'Smoke-Test-Bot',
        url: 'https://smoke.example.com/phpmyadmin/',
        storeCredentials: false,
        autoLogin: false
      }).then(r => r.ok)
    `);
    if (created === true) pass('IPC: Profil konnte über die Bridge erstellt werden');
    else fail('IPC-Profil', 'create lieferte kein ok');

    /* 3) Karte erscheint im Dashboard */
    await sleep(600);
    const cardCount = await win.webContents.executeJavaScript(
      'document.querySelectorAll("#profile-grid .card").length'
    );
    if (cardCount >= 1) pass('Dashboard zeigt die Profilkarte');
    else fail('Dashboard-Karte', 'Keine Karte gefunden (' + cardCount + ')');

    /* 4) Formular-Modal öffnet */
    await win.webContents.executeJavaScript('document.getElementById("btn-add-profile").click()');
    await waitFor(() => win.webContents.executeJavaScript('!!document.querySelector(".modal-overlay .modal")'));
    pass('„Profil hinzufügen" öffnet das Formular');

    /* 4b) Kein vorausgefülltes Platzhalter-Ziel; Beispiel nur als Platzhalter */
    const urlState = await win.webContents.executeJavaScript(
      'JSON.stringify({ value: document.getElementById("pd-url").value, placeholder: document.getElementById("pd-url").placeholder })'
    );
    const parsedUrl = JSON.parse(urlState);
    if (parsedUrl.value === '' && /example\.com/.test(parsedUrl.placeholder)) {
      pass('Standard-URL ist neutral (Beispiel nur als Platzhalter)');
    } else {
      fail('Standard-URL', 'unerwarteter Zustand: ' + urlState);
    }

    /* 4c) Standard-Einklappstatus beim Erstellen: Zugangsdaten offen, Erscheinungsbild & Zugriffsschutz eingeklappt */
    const collapseState = await win.webContents.executeJavaScript(`
      JSON.stringify({
        credCollapsed: document.getElementById("pd-sec-credentials").classList.contains("is-collapsed"),
        appCollapsed: document.getElementById("pd-sec-appearance").classList.contains("is-collapsed"),
        lockCollapsed: document.getElementById("pd-sec-lock").classList.contains("is-collapsed"),
        pwToolsInLock: !!document.querySelector("#pd-sec-lock #pd-open-pw-manager"),
        pwToolsInCreds: !!document.querySelector("#pd-sec-credentials #pd-pw-tools")
      })
    `);
    const parsedCollapse = JSON.parse(collapseState);
    if (!parsedCollapse.credCollapsed && parsedCollapse.appCollapsed && parsedCollapse.lockCollapsed) {
      pass('Beim Erstellen ist Zugangsdaten ausgeklappt, Erscheinungsbild & Schutz eingeklappt');
    } else {
      fail('Einklappstatus-Erstellen', collapseState);
    }
    if (parsedCollapse.pwToolsInLock && !parsedCollapse.pwToolsInCreds) {
      pass('Passwort-Manager befindet sich unter Zusätzlicher Zugriffsschutz (nicht in Zugangsdaten)');
    } else {
      fail('Passwort-Manager-Position', collapseState);
    }

    /* 4d) Klick neben das Fenster (Overlay) schließt den Dialog NICHT */
    await win.webContents.executeJavaScript('document.querySelector(".modal-overlay").click()');
    const stillOpen = await win.webContents.executeJavaScript('!!document.querySelector(".modal-overlay .modal")');
    if (stillOpen) pass('Klick neben das Modal schließt den Profil-Dialog nicht');
    else fail('Modal-Schutz', 'Dialog wurde durch Overlay-Klick geschlossen');

    /* 4e) Dialog über X-Kasten schließen */
    await win.webContents.executeJavaScript('document.querySelector(".modal__close").click()');

    /* 5) Navigation: Datenbankprofile */
    await win.webContents.executeJavaScript('document.getElementById("nav-profiles").click()');
    await waitFor(() => win.webContents.executeJavaScript(
      '!document.getElementById("view-profiles").hidden && !!document.getElementById("profiles-grid")'
    ));
    pass('Navigation: Datenbankprofile-Ansicht sichtbar');

    /* 5a) Navigation: SFTP-Client (Termius-Stil) & SFTP-Host anlegen */
    await win.webContents.executeJavaScript('document.getElementById("nav-sftp").click()');
    await waitFor(() => win.webContents.executeJavaScript(
      '!document.getElementById("view-sftp").hidden && !!document.getElementById("sftp-btn-add-host")'
    ));
    const sftpHostCreated = await win.webContents.executeJavaScript(`
      window.sqlhub.sftp.createHost({
        name: 'Smoke-SFTP-Server',
        host: '127.0.0.1',
        port: 22,
        username: 'deploy',
        remotePath: '/var/www'
      }).then(r => r.ok && r.host.name === 'Smoke-SFTP-Server')
    `);
    if (sftpHostCreated) pass('Navigation & IPC: SFTP-Ansicht sichtbar und SFTP-Host speicherbar');
    else fail('SFTP-Ansicht', 'SFTP-Host konnte nicht erstellt werden');

    /* 5a-2) Navigation: Addons (standardmäßig deaktiviert, manuell aktivierbar) */
    await win.webContents.executeJavaScript('document.getElementById("nav-addons").click()');
    await waitFor(() => win.webContents.executeJavaScript(
      '!document.getElementById("view-addons").hidden && !!document.getElementById("addons-btn-create") && !!document.getElementById("addons-search-input")'
    ));
    const defaultDisabledCheck = await win.webContents.executeJavaScript(
      '!document.querySelector("#sidebar-addon-items [data-addon-nav=\\"sqlhub-notes\\"]")'
    );
    if (defaultDisabledCheck) {
      pass('Addons sind standardmäßig deaktiviert und müssen manuell eingeschaltet werden');
    } else {
      fail('Addon-Default', 'Addons waren bereits ohne manuelles Einschalten aktiv');
    }

    // Manuell per Schalter aktivieren
    await win.webContents.executeJavaScript(`
      (async () => {
        await window.sqlhub.addons.setEnabled('sqlhub-notes', true);
        await window.sqlhub.addons.setEnabled('sqlhub-music-player', true);
      })()
    `);
    await waitFor(() => win.webContents.executeJavaScript(
      '!!document.querySelector("#sidebar-addon-items [data-addon-nav=\\"sqlhub-notes\\"]") && !!document.querySelector("#sidebar-addon-items [data-addon-nav=\\"sqlhub-music-player\\"]")'
    ));
    await win.webContents.executeJavaScript(
      'document.querySelector("#sidebar-addon-items [data-addon-nav=\\"sqlhub-notes\\"]").click()'
    );
    await waitFor(() => win.webContents.executeJavaScript(
      '!document.getElementById("view-addon-custom").hidden && !!document.getElementById("notes-add-btn")'
    ));
    await win.webContents.executeJavaScript(
      'document.querySelector("#sidebar-addon-items [data-addon-nav=\\"sqlhub-music-player\\"]").click()'
    );
    await waitFor(() => win.webContents.executeJavaScript(
      '!document.getElementById("view-addon-custom").hidden && !!document.querySelector("[data-keepalive-addon=\\"sqlhub-music-player\\"]")'
    ));
    pass('Addons-Ansicht sichtbar & Notizen- sowie Musik-Player-Addon erscheinen nach manuellem Aktivieren unter SFTP');

    /* 5b) Navigation: Eigene Passwort-Manager-Seite unter System & Sicherheit (nur für zusätzlichen Zugriffsschutz) */
    await win.webContents.executeJavaScript('document.getElementById("nav-passwords").click()');
    await waitFor(() => win.webContents.executeJavaScript(
      '!document.getElementById("view-passwords").hidden && !!document.getElementById("pw-page-main-panel")'
    ));
    pass('Navigation: Eigene Passwort-Manager-Seite sichtbar');

    /* 5c) Passwort-Manager listet ausschließlich Profile mit zusätzlichem Zugriffsschutz (nicht Datenbank-Logins) */
    const lockFilterCheck = await win.webContents.executeJavaScript(`
      (async () => {
        const before = await window.sqlhub.credentials.listForManager('test-master-password');
        const createdLockProf = await window.sqlhub.profiles.create({
          name: 'Locked-Test-Profile',
          url: 'https://locked.example.com/phpmyadmin/',
          storeCredentials: false,
          autoLogin: false
        });
        await window.sqlhub.profileLock.enable(createdLockProf.profile.id, { password: 'myLockPass123', hint: 'TestHint' });
        const after = await window.sqlhub.credentials.listForManager('test-master-password');
        return JSON.stringify({
          beforeCount: before.items.length,
          afterCount: after.items.length,
          lockName: after.items[0] && after.items[0].name,
          hasLockPw: Boolean(after.items[0] && after.items[0].lockPassword),
          lockedId: createdLockProf.profile.id
        });
      })()
    `);
    const parsedLockFilter = JSON.parse(lockFilterCheck);
    if (parsedLockFilter.beforeCount === 0 && parsedLockFilter.afterCount === 1 && parsedLockFilter.lockName === 'Locked-Test-Profile' && parsedLockFilter.hasLockPw) {
      pass('Passwort-Manager enthält ausschließlich Profile mit Zusätzlichem Zugriffsschutz inkl. Schutz-Passwort');
    } else {
      fail('Passwort-Manager-Filter', lockFilterCheck);
    }

    /* 6) Navigation: Einstellungen (ohne Eckenradius-Auswahl, mit Liquid Glass & unsichtbarem Admin-Trigger) */
    await win.webContents.executeJavaScript('document.getElementById("btn-settings").click()');
    await waitFor(() => win.webContents.executeJavaScript(
      '!document.getElementById("set-btn-radius-px") && !!document.getElementById("set-panel-opacity") && !!document.getElementById("set-panel-blur") && !!document.getElementById("admin-secret-trigger")'
    ));
    pass('Navigation: Einstellungen-Ansicht (1px Eckig-Standard, Liquid Glass & Admin-Trigger) sichtbar');

    /* 6b) Admin-Konsole entsperren & Profilsperre ohne Profil-Passwort aufheben */
    const adminCheck = await win.webContents.executeJavaScript(`
      (async () => {
        const unlocked = await window.sqlhub.admin.unlock('test-master-password');
        const forceRes = await window.sqlhub.admin.forceUnlockAllProfiles();
        const after = await window.sqlhub.credentials.listForManager('test-master-password');
        return JSON.stringify({
          adminOk: unlocked.ok,
          forceOk: forceRes.ok && forceRes.unlockedCount === 1,
          remainingLocked: after.items.length
        });
      })()
    `);
    const parsedAdmin = JSON.parse(adminCheck);
    if (parsedAdmin.adminOk && parsedAdmin.forceOk && parsedAdmin.remainingLocked === 0) {
      pass('Admin-Konsole kann entsperrt werden und hebt Profilsperren ohne Passwort auf');
    } else {
      fail('Admin-Konsole', adminCheck);
    }

    /* 7) Navigation: Über SQL Hub & Systemdaten kopieren */
    await win.webContents.executeJavaScript('document.querySelector(\'.nav-item[data-view="about"]\').click()');
    await waitFor(() => win.webContents.executeJavaScript(
      '!document.getElementById("view-about").hidden && !!document.getElementById("about-copy-diag")'
    ));
    await win.webContents.executeJavaScript('document.getElementById("about-copy-diag").click()');
    pass('Navigation: Über-SQL-Hub-Ansicht & Systemdaten-Kopieren verfügbar');

    /* 7b) Command-Palette (Strg + K) öffnet und zeigt Profil + Aktionen */
    await win.webContents.executeJavaScript('document.getElementById("btn-command-palette").click()');
    await waitFor(() => win.webContents.executeJavaScript(
      '!!document.getElementById("cmd-palette-overlay") && document.querySelectorAll("#cmd-list .cmd-item").length >= 2'
    ));
    pass('Command-Palette (Strg + K) öffnet und listet Profile & Befehle');
    await win.webContents.executeJavaScript('document.getElementById("cmd-palette-overlay").click()');

    /* 8) Keine Renderer-Fehler (CSP / Module) */
    if (consoleErrors.length === 0) pass('Keine Renderer-Fehler in der Konsole');
    else fail('Renderer-Konsole', consoleErrors.slice(0, 3).join(' | '));
  } catch (err) {
    fail('Renderer-Smoke', err.message);
    console.error(err.stack || err);
  } finally {
    if (failures.length > 0 && consoleErrors.length > 0) {
      console.log('\nRenderer-Konsole:');
      for (const msg of consoleErrors.slice(0, 20)) console.log('  ' + msg);
    }
    console.log(`\nErgebnis: ${failures.length === 0 ? 'ALLE TESTS BESTANDEN' : failures.length + ' FEHLER'}`);
    app.exit(failures.length === 0 ? 0 : 1);
  }
}).catch((err) => {
  console.error('Harness-Fehler:', err);
  app.exit(1);
});
