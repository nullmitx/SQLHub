'use strict';

/**
 * BrowserView-Manager
 *
 * Verwaltete pro geöffnetes Profil eine eigene `WebContentsView` mit eigener
 * persistenter Session-Partition. Die Views bleiben am Leben, solange der
 * Tab geöffnet ist – so lässt sich schnell zwischen Profilen wechseln.
 *
 * Sicherheit:
 * - Externe Seiten laufen OHNE Preload und ohne Node-Integration.
 * - Popups werden unterdrückt und im selben View geöffnet.
 * - Berechtigungen (Kamera, Mikro, Benachrichtigungen …) sind standardmäßig blockiert.
 * - TLS-Zertifikatsfehler werden NICHT stillschweigend akzeptiert; erst nach
 *   ausdrücklicher Nutzeraktion (einmalig) kann fortfahren.
 */
const { WebContentsView } = require('electron');
const path = require('path');
const {
  DETECT_SCRIPT,
  buildFillScript,
  decideAutoLogin
} = require('./auto-login');
const { partitionForProfile, BROWSER } = require('./config');

const ERROR_PAGE = path.join(__dirname, '..', 'renderer', 'error-pages', 'net-error.html');

const DENIED_PERMISSIONS = new Set([
  'media', 'geolocation', 'notifications', 'fullscreen', 'pointerLock',
  'openExternal', 'midi', 'midiSysex', 'mediaKeySystem', 'keyboardLock'
]);

class BrowserViewManager {
  /**
   * @param {{
   *   getWindow: () => import('electron').BrowserWindow|null,
   *   credentialStore: import('./credential-store').CredentialStore,
   *   logger: object,
   *   emit: (channel: string, payload: any) => void
   * }} deps
   */
  constructor(deps) {
    this.getWindow = deps.getWindow;
    this.credentialStore = deps.credentialStore;
    this.logger = deps.logger;
    this.emit = deps.emit;
    /** @type {Map<string, { view: import('electron').WebContentsView, state: object }>} */
    this.tabs = new Map();
    this.activeProfileId = null;
    this.bounds = { x: 0, y: 96, width: 1200, height: 600 };
    this._attachedView = null;
  }

  get activeTab() {
    return this.activeProfileId ? this.tabs.get(this.activeProfileId) : null;
  }

  /* ------------------------------------------------------------------ *
   * Öffnen / Schließen / Umschalten
   * ------------------------------------------------------------------ */

  async open(profile, { activate = true } = {}) {
    let tab = this.tabs.get(profile.id);
    if (!tab) {
      tab = await this._createView(profile);
      tab.profileSnapshot = { ...profile };
      this.tabs.set(profile.id, tab);
    } else {
      tab.profileSnapshot = { ...profile };
    }
    if (activate) {
      this._activate(profile.id);
    }
    this._emitTabs();
    return { ok: true, profileId: profile.id };
  }

  switchTo(profileId) {
    if (!this.tabs.has(profileId)) {
      return { ok: false, errors: ['Dieser Tab ist nicht geöffnet.'] };
    }
    this._activate(profileId);
    this._emitTabs();
    return { ok: true };
  }

  close(profileId) {
    const tab = this.tabs.get(profileId);
    if (!tab) return { ok: false, errors: ['Tab ist nicht geöffnet.'] };
    const wasAttached = this._attachedView === tab.view;
    if (wasAttached) {
      this._detachActive();
    }
    try {
      tab.view.webContents.close();
    } catch (err) {
      this.logger.warn('View konnte nicht geschlossen werden.', { error: err.message });
    }
    this.tabs.delete(profileId);
    if (this.activeProfileId === profileId) {
      const next = this.tabs.keys().next();
      this.activeProfileId = next.done ? null : next.value;
      if (this.activeProfileId) this._attachActive();
    }
    this._emitTabs();
    return { ok: true, activeProfileId: this.activeProfileId };
  }

  closeAll() {
    for (const id of [...this.tabs.keys()]) {
      this.close(id);
    }
    return { ok: true };
  }

  has(profileId) {
    return this.tabs.has(profileId);
  }

  setBounds(rect) {
    if (!rect || typeof rect !== 'object') return;
    const x = Math.max(0, Math.round(rect.x || 0));
    const y = Math.max(0, Math.round(rect.y || 0));
    const width = Math.max(BROWSER.minWidth, Math.round(rect.width || 0));
    const height = Math.max(BROWSER.minHeight, Math.round(rect.height || 0));
    this.bounds = { x, y, width, height };
    const tab = this.activeTab;
    if (tab) {
      try {
        tab.view.setBounds(this.bounds);
      } catch (err) {
        this.logger.warn('setBounds fehlgeschlagen.', { error: err.message });
      }
    }
  }

  /**
   * Blendet die aktive View ein/aus (z. B. damit App-Dialoge sichtbar sind).
   * Die View bleibt dabei am Leben, Sitzung und Zustand bleiben erhalten.
   */
  setVisible(visible) {
    if (visible) {
      this._attachActive();
    } else {
      this._detachActive();
    }
    return { ok: true, visible: Boolean(visible) };
  }

  /* ------------------------------------------------------------------ *
   * Navigation
   * ------------------------------------------------------------------ */

  navigate(profileId, url) {
    const tab = this._require(profileId);
    if (!tab) return { ok: false, errors: ['Tab ist nicht geöffnet.'] };
    try {
      // URL-Eingabe der Leiste: fehlt das Protokoll, https annehmen.
      let target = String(url || '').trim();
      if (!/^https?:\/\//i.test(target)) {
        target = `https://${target}`;
      }
      new URL(target); // Validierung
      tab.state.attemptsOnThisPage = 0;
      tab.view.webContents.loadURL(target).catch((err) => {
        this.logger.warn('Navigation fehlgeschlagen.', { error: err.message });
      });
      return { ok: true };
    } catch {
      return { ok: false, errors: ['Die eingegebene URL ist ungültig.'] };
    }
  }

  back(profileId) {
    const tab = this._require(profileId);
    if (tab && canGoBack(tab.view.webContents)) {
      tab.state.attemptsOnThisPage = 0;
      goBack(tab.view.webContents);
    }
    return { ok: true };
  }

  forward(profileId) {
    const tab = this._require(profileId);
    if (tab && canGoForward(tab.view.webContents)) {
      tab.state.attemptsOnThisPage = 0;
      goForward(tab.view.webContents);
    }
    return { ok: true };
  }

  reload(profileId) {
    const tab = this._require(profileId);
    if (tab) {
      tab.state.attemptsOnThisPage = 0;
      tab.view.webContents.reload();
    }
    return { ok: true };
  }

  /** Zur Profil-Startseite (phpMyAdmin-URL) navigieren. */
  home(profileId, profileUrl) {
    const tab = this._require(profileId);
    if (!tab) return { ok: false, errors: ['Tab ist nicht geöffnet.'] };
    tab.state.attemptsOnThisPage = 0;
    tab.view.webContents.loadURL(profileUrl).catch((err) => {
      this.logger.warn('Home-Navigation fehlgeschlagen.', { error: err.message });
    });
    return { ok: true };
  }

  /**
   * Erlaubt einmalig (für diese Navigation) die Akzeptanz eines
   * fehlerhaften TLS-Zertifikats – NICHT automatisch, nur auf Nutzeraktion.
   */
  allowCertificateOnce(profileId) {
    const tab = this._require(profileId);
    if (!tab) return { ok: false, errors: ['Tab ist nicht geöffnet.'] };
    tab.state.allowCertificateBypass = true;
    tab.view.webContents.reload();
    return { ok: true };
  }

  /** Startet den Auto-Login manuell erneut (Renderer-Button). */
  retryAutoLogin(profileId) {
    const tab = this._require(profileId);
    if (!tab) return { ok: false, errors: ['Tab ist nicht geöffnet.'] };
    tab.state.attemptsOnThisPage = 0;
    this._maybeAutoLogin(profileId, tab);
    return { ok: true };
  }

  /* ------------------------------------------------------------------ *
   * Interna
   * ------------------------------------------------------------------ */

  _require(profileId) {
    return this.tabs.get(profileId) || null;
  }

  _createView(profile) {
    const partition = partitionForProfile(profile.id);
    const view = new WebContentsView({
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        spellcheck: false
      }
    });
    const wc = view.webContents;

    // Externe Seiten erhalten keinen Zugriff auf Popup-Fenster; nur http(s) im selben View laden.
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url || '')) {
        wc.loadURL(url).catch(() => {});
      }
      return { action: 'deny' };
    });

    // Unsichere Protokoll-Navigationen (z. B. file://, javascript:) in der WebContentsView verhindern.
    wc.on('will-navigate', (event, navUrl) => {
      if (!/^https?:\/\//i.test(navUrl || '') && !String(navUrl || '').startsWith('file://')) {
        event.preventDefault();
      }
    });

    // Berechtigungsanfragen blockieren (kein Zugriff auf Kamera etc.).
    try {
      wc.session.setPermissionRequestHandler((_contents, permission, callback) => {
        callback(!DENIED_PERMISSIONS.has(permission));
      });
    } catch {
      /* egal */
    }

    // HTTP Basic Auth: Zugangsdaten aus dem Credential-Store nutzen,
    // sonst die native Anmeldung des Browsers zeigen (nie blockieren).
    wc.on('login', (event, _wc, _details, authInfo, callback) => {
      event.preventDefault();
      const creds = this._credentialsFor(profile.id, profile);
      if (creds && profile.autoLogin !== false) {
        this.logger.info('HTTP Basic Auth: Auto-Login versucht.', {
          profileId: profile.id,
          realm: authInfo && authInfo.realm ? String(authInfo.realm).slice(0, 100) : undefined
        });
        callback(creds.username, creds.password);
      } else {
        // Zeigt den nativen Electron-Anmeldedialog – manueller Login bleibt möglich.
        callback();
      }
    });

    // TLS-Zertifikatsfehler: nie stillschweigend akzeptieren.
    wc.on('certificate-error', (event, errorUrl, error, _certificate, callback) => {
      const tab = this.tabs.get(profile.id);
      if (tab && tab.state.allowCertificateBypass) {
        event.preventDefault();
        tab.state.allowCertificateBypass = false;
        this.logger.warn('TLS-Zertifikat vom Nutzer einmalig akzeptiert.', {
          profileId: profile.id,
          url: safeOrigin(errorUrl)
        });
        if (typeof callback === 'function') callback(true);
        return;
      }
      this.emit('browser:cert-error', { profileId: profile.id, url: errorUrl, error });
    });

    wc.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3 /* abgebrochen */) return;
      if (!/^https?:/i.test(validatedURL || '')) return;
      this.logger.warn('Seite konnte nicht geladen werden.', {
        profileId: profile.id,
        errorCode,
        url: safeOrigin(validatedURL)
      });
      this._showErrorPage(tabState(this.tabs, profile.id), {
        title: 'Seite nicht erreichbar',
        message: errorDescription || 'Die Adresse konnte nicht geladen werden.',
        code: errorCode,
        url: validatedURL,
        certError: /CERT/i.test(String(errorCode))
      });
    });

    wc.on('did-start-loading', () => {
      const t = this.tabs.get(profile.id);
      if (t) {
        t.state.loading = true;
        this._emitState(profile.id);
      }
    });

    wc.on('did-stop-loading', () => {
      const t = this.tabs.get(profile.id);
      if (t) {
        t.state.loading = false;
        this._emitState(profile.id);
      }
    });

    wc.on('did-navigate', (_event, url) => {
      const t = this.tabs.get(profile.id);
      if (!t) return;
      t.state.currentUrl = url;
      t.state.title = wc.getTitle() || '';
      this._emitState(profile.id);
      this._maybeAutoLogin(profile.id, t);
    });

    wc.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      const t = this.tabs.get(profile.id);
      if (!t) return;
      t.state.currentUrl = url;
      this._emitState(profile.id);
    });

    wc.on('page-title-updated', (_event, title) => {
      const t = this.tabs.get(profile.id);
      if (!t) return;
      t.state.title = title || '';
      this._emitTabs();
    });

    const state = {
      profileId: profile.id,
      currentUrl: profile.url,
      title: '',
      canGoBack: false,
      canGoForward: false,
      loading: false,
      attemptsOnThisPage: 0,
      lastAttemptUrl: null,
      allowCertificateBypass: false,
      profileUrl: profile.url
    };

    this.logger.info('Browser-View erstellt.', {
      profileId: profile.id,
      partition
    });
    wc.loadURL(profile.url).catch((err) => {
      this.logger.warn('Start-URL konnte nicht geladen werden.', { error: err.message });
    });

    return { view, state };
  }

  _activate(profileId) {
    const tab = this.tabs.get(profileId);
    if (!tab) return;
    this.activeProfileId = profileId;
    this._attachActive();
  }

  _attachActive() {
    const win = this.getWindow();
    const tab = this.activeTab;
    if (!win || win.isDestroyed() || !tab) return;
    try {
      if (this._attachedView !== tab.view) {
        if (this._attachedView) {
          try {
            win.contentView.removeChildView(this._attachedView);
          } catch {
            /* war nicht angehängt */
          }
        }
        win.contentView.addChildView(tab.view);
        this._attachedView = tab.view;
      }
      tab.view.setBounds(this.bounds);
      tab.view.webContents.focus();
    } catch (err) {
      this.logger.error('View konnte nicht angehängt werden.', { error: err.message });
    }
  }

  _detachActive() {
    const win = this.getWindow();
    if (!win || win.isDestroyed() || !this._attachedView) return;
    try {
      win.contentView.removeChildView(this._attachedView);
    } catch {
      /* egal */
    }
    this._attachedView = null;
  }

  _credentialsFor(profileId, profile) {
    if (profile.storeCredentials === false) return null;
    const res = this.credentialStore.get(profileId);
    return res.ok ? res.credentials : null;
  }

  /** Führt den Auto-Login aus, wenn die Logik es erlaubt. */
  async _maybeAutoLogin(profileId, tab) {
    const profile = tab.profileSnapshot || this._profileSnapshot(profileId, tab);
    try {
      const kind = await tab.view.webContents.executeJavaScript(DETECT_SCRIPT, true);
      const currentUrl = tab.view.webContents.getURL();
      if (currentUrl !== tab.state.lastAttemptUrl) {
        tab.state.attemptsOnThisPage = 0;
        tab.state.lastAttemptUrl = currentUrl;
      }
      const creds = this._credentialsFor(profileId, profile);
      const decision = decideAutoLogin({
        pageKind: kind === 'pma-login' ? 'pma-login' : kind === 'pma-dashboard' ? 'pma-dashboard' : kind === 'other-login' ? 'other-login' : 'unknown',
        profile,
        attemptsOnThisPage: tab.state.attemptsOnThisPage,
        credentialsAvailable: Boolean(creds)
      });
      if (decision.action !== 'fill' || !creds) {
        this.logger.info('Auto-Login übersprungen.', {
          profileId,
          reason: decision.reason
        });
        return;
      }
      tab.state.attemptsOnThisPage += 1;
      this.logger.info('Auto-Login versucht (Formularfüllung).', { profileId });
      await tab.view.webContents.executeJavaScript(
        buildFillScript(creds.username, creds.password),
        true
      );
    } catch (err) {
      // Fehlschlägt der Auto-Login, bleibt die Anmeldeseite stehen – kein Abbruch.
      this.logger.warn('Auto-Login fehlgeschlagen.', {
        profileId,
        error: err.message
      });
    }
  }

  _profileSnapshot(profileId, tab) {
    if (tab && tab.profileSnapshot && tab.profileSnapshot.id === profileId) {
      return tab.profileSnapshot;
    }
    return { id: profileId, autoLogin: true, storeCredentials: true };
  }

  /** Aktualisiert den Profil-Snapshot (z. B. nach Änderungen). */
  updateProfileSnapshot(profile) {
    const tab = this.tabs.get(profile.id);
    if (tab) {
      tab.profileSnapshot = { ...profile };
      tab.state.profileUrl = profile.url;
    }
  }

  _showErrorPage(tabStateObj, details) {
    if (!tabStateObj) return;
    try {
      tabStateObj.view.webContents.loadFile(ERROR_PAGE, {
        query: {
          title: details.title || 'Fehler',
          message: String(details.message || '').slice(0, 500),
          code: String(details.code || ''),
          url: String(details.url || ''),
          cert: details.certError ? '1' : '0'
        }
      }).catch(() => {});
    } catch {
      /* egal */
    }
  }

  _emitState(profileId) {
    const tab = this.tabs.get(profileId);
    if (!tab) return;
    const wc = tab.view.webContents;
    this.emit('browser:state', {
      profileId,
      url: wc.getURL() || tab.state.currentUrl,
      title: tab.state.title || wc.getTitle() || '',
      canGoBack: canGoBack(wc),
      canGoForward: canGoForward(wc),
      loading: tab.state.loading
    });
  }

  _emitTabs() {
    const list = [...this.tabs.entries()].map(([id, tab]) => ({
      profileId: id,
      url: tab.view.webContents.getURL() || tab.state.currentUrl,
      title: tab.state.title || tab.view.webContents.getTitle() || '',
      loading: tab.state.loading,
      active: id === this.activeProfileId
    }));
    this.emit('browser:tabs', { tabs: list, activeProfileId: this.activeProfileId });
  }
}

function tabState(tabs, profileId) {
  return tabs.get(profileId) || null;
}

/* Navigationshelfer: bevorzugt die neue navigationHistory-API, mit Fallback. */
function canGoBack(wc) {
  return wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack();
}
function canGoForward(wc) {
  return wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward();
}
function goBack(wc) {
  if (wc.navigationHistory) wc.navigationHistory.goBack();
  else wc.goBack();
}
function goForward(wc) {
  if (wc.navigationHistory) wc.navigationHistory.goForward();
  else wc.goForward();
}

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

module.exports = { BrowserViewManager };
