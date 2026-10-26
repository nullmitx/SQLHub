'use strict';

/**
 * SQL Hub – Hauptprozess.
 *
 * Startet das Fenster, initialisiert alle Dienste (Profile, Zugangsdaten,
 * Einstellungen, Sitzungen, Browser-Views) und verbindet sie über IPC.
 */
const { app, BrowserWindow, Menu, safeStorage, session, shell, systemPreferences } = require('electron');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { APP_NAME, dataFiles } = require('./config');
const { SecureLogger } = require('./logger');
const { ProfileStore } = require('./profile-store');
const { CredentialStore } = require('./credential-store');
const { SettingsStore } = require('./settings-store');
const { Vault } = require('./vault');
const { BiometricManager } = require('./biometrics');
const { SessionManager } = require('./session-manager');
const { BrowserViewManager } = require('./browser-views');
const { SftpManager } = require('./sftp-manager');
const { AddonManager } = require('./addon-manager');
const { registerIpc } = require('./ipc');
const cryptoModule = require('./crypto');

// Einklonung nur zulassen, aber keine unsicheren Fensterinhalte.
app.setName(APP_NAME);

// Unter Linux (z. B. Container, AppImage ohne User-Namespaces oder Root-Session)
// optional den Sandbox-Fallback aktivieren, damit die App auf jeder Distribution startet.
if (
  process.platform === 'linux' &&
  (process.env.SQLHUB_NO_SANDBOX === '1' || (typeof process.getuid === 'function' && process.getuid() === 0))
) {
  app.commandLine.appendSwitch('no-sandbox');
}

const isDev = process.argv.includes('--dev');
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
}

let mainWindow = null;
let logger = null;

/**
 * Erstellt auf macOS das native Anwendungs- & Bearbeiten-Menü, damit
 * Tastenkürzel wie ⌘+C, ⌘+V, ⌘+X, ⌘+A, ⌘+Z und ⌘+Q systemweit und in
 * eingebetteten Datenbank-Panels (WebContentsView) zuverlässig funktionieren.
 */
function configureApplicationMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `Über ${APP_NAME}` },
        { type: 'separator' },
        { role: 'hide', label: `${APP_NAME} ausblenden` },
        { role: 'hideOthers', label: 'Andere ausblenden' },
        { role: 'unhide', label: 'Alle einblenden' },
        { type: 'separator' },
        { role: 'quit', label: `${APP_NAME} beenden` }
      ]
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Widerrufen' },
        { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einsetzen' },
        { role: 'selectAll', label: 'Alles auswählen' }
      ]
    },
    {
      label: 'Fenster',
      submenu: [
        { role: 'minimize', label: 'Minimieren' },
        { role: 'zoom', label: 'Zoomen' },
        { role: 'togglefullscreen', label: 'Vollbild umschalten' },
        { type: 'separator' },
        { role: 'front', label: 'Alle nach vorne bringen' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Stellt sicher, dass die Zugangsdaten-Verschlüsselung unter Windows (DPAPI),
 * macOS (Keychain) und allen Linux-Distributionen funktioniert – inklusive
 * AES-256-GCM-Fallback mit lokal geschütztem Benutzerschlüssel (0600), falls
 * unter Linux kein GNOME Keyring / KWallet-Daemon läuft.
 */
function createSafeStorageAdapter(nativeSafeStorage, userDataDir) {
  const keyFile = path.join(userDataDir, 'local-keystore.key');
  const FALLBACK_PREFIX = 'SQLHUB_AES256:';

  function getOrCreateLocalKey() {
    try {
      if (fs.existsSync(keyFile)) {
        const raw = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'base64');
        if (raw.length === 32) return raw;
      }
      fs.mkdirSync(userDataDir, { recursive: true });
      const fresh = crypto.randomBytes(32);
      fs.writeFileSync(keyFile, fresh.toString('base64'), { encoding: 'utf8', mode: 0o600 });
      return fresh;
    } catch {
      return null;
    }
  }

  function isNativeReady() {
    try {
      return Boolean(
        nativeSafeStorage &&
        typeof nativeSafeStorage.isEncryptionAvailable === 'function' &&
        nativeSafeStorage.isEncryptionAvailable() === true
      );
    } catch {
      return false;
    }
  }

  return {
    isEncryptionAvailable() {
      if (isNativeReady()) return true;
      return Boolean(getOrCreateLocalKey());
    },
    encryptString(plainText) {
      if (isNativeReady()) {
        return nativeSafeStorage.encryptString(String(plainText));
      }
      const key = getOrCreateLocalKey();
      if (!key) throw new Error('Kein lokaler Verschlüsselungsschlüssel verfügbar.');
      const env = cryptoModule.encrypt(key, Buffer.from(String(plainText), 'utf8'));
      return Buffer.from(FALLBACK_PREFIX + JSON.stringify(env), 'utf8');
    },
    decryptString(encryptedBuf) {
      const asUtf8 = Buffer.isBuffer(encryptedBuf) ? encryptedBuf.toString('utf8') : String(encryptedBuf);
      if (asUtf8.startsWith(FALLBACK_PREFIX)) {
        const key = getOrCreateLocalKey();
        if (!key) throw new Error('Lokaler Schlüssel fehlt.');
        const env = JSON.parse(asUtf8.slice(FALLBACK_PREFIX.length));
        return cryptoModule.decrypt(key, env).toString('utf8');
      }
      if (isNativeReady()) {
        return nativeSafeStorage.decryptString(encryptedBuf);
      }
      throw new Error('Entschlüsselung nicht verfügbar.');
    }
  };
}

function createWindow() {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    show: false,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 12 } : undefined,
    backgroundColor: '#0f1116',
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'assets', iconFile),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Interne Navigation im App-Fenster erlauben, externe Links im Systembrowser öffnen.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Kein Wegnavigieren aus der lokalen Oberfläche heraus.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  // Warnungen und Fehler aus dem Renderer ins Log schreiben (ohne Inhalte zu loggen).
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    if (!logger) return;
    if (level >= 2) logger.warn('Renderer-Konsolenmeldung.', { message: String(message).slice(0, 300) });
  });

  return mainWindow;
}

function bootstrap() {
  const userDataDir = app.getPath('userData');
  const files = dataFiles(userDataDir);

  logger = new SecureLogger({ echo: isDev });
  logger.setLogFile(path.join(userDataDir, 'sql-hub.log'));
  logger.info('SQL Hub startet.', { version: app.getVersion(), platform: process.platform, userDataDir });

  const vault = new Vault({ file: files.vault, logger });
  const codec = vault.createCodec();
  const storageAdapter = createSafeStorageAdapter(safeStorage, userDataDir);

  const biometrics = new BiometricManager({
    file: files.biometrics,
    safeStorage: storageAdapter,
    systemPreferences,
    logger
  });

  const profileStore = new ProfileStore({ file: files.profiles, logger, codec });
  const credentialStore = new CredentialStore({
    file: files.credentials,
    safeStorage: storageAdapter,
    logger
  });
  const settingsStore = new SettingsStore({ file: files.settings, codec });
  const sftpManager = new SftpManager({
    file: files.sftpHosts,
    credentialStore,
    codec,
    logger
  });
  const addonManager = new AddonManager({
    userDataDir,
    stateFile: files.addonsState,
    logger
  });

  // Grundeinstellungen für alle Partitionen: keine Kamera/Mikro/Benachrichtigungen.
  const DEFAULT_PERMISSIONS = session.defaultSession;
  DEFAULT_PERMISSIONS.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  // Verhindert YouTube Embed „Fehler 153" (fehlender Referer bei file://-Ursprung)
  // und erlaubt YouTube / YouTube Music / Spotify Streams in Addon-Iframes.
  try {
    const mediaFilter = {
      urls: [
        '*://*.youtube.com/*',
        '*://*.youtube-nocookie.com/*',
        '*://*.googlevideo.com/*',
        '*://*.ytimg.com/*',
        '*://*.ggpht.com/*',
        '*://*.spotify.com/*',
        '*://*.scdn.co/*'
      ]
    };

    DEFAULT_PERMISSIONS.webRequest.onBeforeSendHeaders(mediaFilter, (details, callback) => {
      const headers = { ...details.requestHeaders };
      const currentRef = headers.Referer || headers.referer || '';
      const isSpotify = /spotify\.com|scdn\.co/i.test(details.url);
      if (!currentRef || currentRef.startsWith('file://')) {
        headers.Referer = isSpotify ? 'https://open.spotify.com/' : 'https://www.youtube.com/';
        delete headers.referer;
      }
      if (!headers.Origin || String(headers.Origin).startsWith('file://')) {
        headers.Origin = isSpotify ? 'https://open.spotify.com' : 'https://www.youtube.com';
        delete headers.origin;
      }
      callback({ requestHeaders: headers });
    });

    DEFAULT_PERMISSIONS.webRequest.onHeadersReceived(mediaFilter, (details, callback) => {
      const responseHeaders = { ...(details.responseHeaders || {}) };
      for (const key of Object.keys(responseHeaders)) {
        const lower = key.toLowerCase();
        if (lower === 'x-frame-options') {
          delete responseHeaders[key];
        } else if (lower === 'content-security-policy' || lower === 'content-security-policy-report-only') {
          const vals = Array.isArray(responseHeaders[key]) ? responseHeaders[key] : [String(responseHeaders[key])];
          responseHeaders[key] = vals.map((v) =>
            String(v).replace(/frame-ancestors[^;]*;?/gi, '')
          );
        }
      }
      callback({ responseHeaders });
    });
  } catch (err) {
    if (logger) logger.warn('Media-Embed-Header-Hook konnte nicht registriert werden.', { error: err.message });
  }

  const getWindow = () => (BrowserWindow.getAllWindows()[0] || null);
  const emit = (channel, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  const sessionManager = new SessionManager({ logger });
  const browserViews = new BrowserViewManager({
    getWindow,
    credentialStore,
    logger,
    emit
  });

  // TLS-/Zertifikatsfehler werden im Browser-View-Manager NUR nach
  // ausdrücklicher Bestätigung durch den Nutzer akzeptiert.
  app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
    if (event.defaultPrevented) return;
    callback(false);
  });

  registerIpc({
    profileStore,
    credentialStore,
    settingsStore,
    sftpManager,
    addonManager,
    sessionManager,
    browserViews,
    vault,
    biometrics,
    logger,
    dataFiles: files
  });

  return { files, logger, sessionManager, browserViews, vault, biometrics, sftpManager, addonManager };
}

app.whenReady().then(() => {
  configureApplicationMenu();
  bootstrap();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Globale Fehlerabsicherung: ein einzelner Fehler darf die App nicht beenden.
process.on('uncaughtException', (err) => {
  if (logger) logger.error('Unbehandelte Ausnahme.', { error: err.message });
});
process.on('unhandledRejection', (reason) => {
  if (logger) logger.error('Unbehandelte Promise-Rejection.', {
    error: reason && reason.message ? reason.message : String(reason)
  });
});
