'use strict';

/**
 * Integrierter End-to-End-Test (läuft unter Electron, nicht unter plain node).
 *
 * Startet einen lokalen Fake-phpMyAdmin-Server mit Cookie-Authentifizierung und
 * prüft mit dem echten BrowserViewManager:
 *   1. Automatischer Login auf der phpMyAdmin-Anmeldeseite (Formularfüllung).
 *   2. Getrennte persistente Sitzungen pro Profil (unterschiedliche Cookies).
 *   3. Sitzungs-Reset setzt die Anmeldung zurück (erneuter Login nötig).
 *   4. Manueller Login funktioniert weiterhin, wenn keine Auto-Login-Daten greifen.
 *
 * Aufruf: npm run test:integration
 * Ergebnis: Exit-Code 0 = bestanden, 1 = fehlgeschlagen.
 */
const http = require('http');
const { app, BrowserWindow, safeStorage } = require('electron');
const { ProfileStore } = require('../../src/main/profile-store');
const { CredentialStore } = require('../../src/main/credential-store');
const { SessionManager } = require('../../src/main/session-manager');
const { BrowserViewManager } = require('../../src/main/browser-views');

if (!process.versions.electron) {
  console.error('Dieser Test muss unter Electron laufen: npm run test:integration');
  process.exit(1);
}

const TIMEOUT_MS = 90000;
const failures = [];

function pass(name) {
  console.log(`PASS  ${name}`);
}
function fail(name, reason) {
  console.log(`FAIL  ${name} :: ${reason}`);
  failures.push(`${name} :: ${reason}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, timeoutMs = 20000, intervalMs = 250) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastErr = err;
    }
    await sleep(intervalMs);
  }
  throw lastErr || new Error('Zeitüberschreitung beim Warten auf Bedingung.');
}

/** Liefert die phpMyAdmin-Session eines View-WebContents für die Server-URL. */
async function cookieValueFor(webContents, serverUrl) {
  const cookies = await webContents.session.cookies.get({ url: serverUrl });
  const found = cookies.find((c) => c.name === 'PHPSESSID');
  return found ? found.value : null;
}

/** Mini-phpMyAdmin: Cookie-Login, Formular mit pma_username/pma_password. */
function createFakePhpMyAdmin() {
  const users = { admin: 'geheim', music: 'musik-pw', ticket: 'ticket-pw' };

  const loginPage = () => `<!DOCTYPE html><html><body>
    <form method="POST" action="/index.php">
      <input type="hidden" name="token" value="csrf-token-123" />
      <input type="text" name="pma_username" />
      <input type="password" name="pma_password" />
      <input type="submit" name="submit_login" value="OK" />
    </form></body></html>`;

  const dashboardPage = (user) => `<!DOCTYPE html><html><body>
    <div id="pma_navigation">nav</div>
    <div id="serverinfo">PMA_DASHBOARD_OK:${user}</div>
  </body></html>`;

  const server = http.createServer((req, res) => {
    const send = (code, body, headers = {}) => {
      res.writeHead(code, { 'Content-Type': 'text/html', 'Content-Length': Buffer.byteLength(body), ...headers });
      res.end(body);
    };

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const user = params.get('pma_username');
        const pass = params.get('pma_password');
        if (user && pass === users[user]) {
          send(200, dashboardPage(user), { 'Set-Cookie': `PHPSESSID=${user}; Path=/` });
        } else {
          send(200, loginPage());
        }
      });
      return;
    }

    // GET
    const cookies = req.headers.cookie || '';
    const match = /PHPSESSID=([^;]+)/.exec(cookies);
    if (match && users[match[1]]) {
      send(200, dashboardPage(match[1]));
    } else {
      send(200, loginPage());
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

app.whenReady().then(async () => {
  const overallTimer = setTimeout(() => {
    fail('Gesamtzeit', `Timeout nach ${TIMEOUT_MS} ms`);
    finish();
  }, TIMEOUT_MS);

  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const getWindow = () => win;
  const emit = () => {};
  const logger = {
    info() {}, warn() {}, error() {}
  };

  const tempDir = require('fs').mkdtempSync(require('os').tmpdir() + '/sqlhub-e2e-');
  const files = {
    profiles: `${tempDir}/profiles.json`,
    credentials: `${tempDir}/credentials.enc`,
    settings: `${tempDir}/settings.json`
  };

  const profileStore = new ProfileStore({ file: files.profiles, logger });
  const credentialStore = new CredentialStore({ file: files.credentials, safeStorage, logger });
  const sessionManager = new SessionManager({ logger });
  const browserViews = new BrowserViewManager({ getWindow, credentialStore, logger, emit });

  let serverUrl;
  let server;

  try {
    ({ server, url: serverUrl } = await createFakePhpMyAdmin());

    // Profile anlegen (so wie es der IPC-Handler tut)
    const profA = profileStore.create({
      name: 'Verwaltungs-Bot',
      url: serverUrl,
      autoLogin: true,
      storeCredentials: true
    }).profile;
    credentialStore.set(profA.id, { username: 'admin', password: 'geheim' });

    const profB = profileStore.create({
      name: 'Music-Bot',
      url: serverUrl,
      autoLogin: true,
      storeCredentials: true
    }).profile;
    credentialStore.set(profB.id, { username: 'music', password: 'musik-pw' });

    /* 1) Auto-Login auf Profil A */
    await browserViews.open(profA);
    await waitFor(async () => {
      const tab = browserViews.tabs.get(profA.id);
      if (!tab) return false;
      const url = tab.view.webContents.getURL();
      if (!url.includes('index.php')) return false;
      const html = await tab.view.webContents.executeJavaScript('document.body.innerText', true);
      return String(html).includes('PMA_DASHBOARD_OK:admin');
    }, 25000);

    if (!browserViews.tabs.get(profA.id)) throw new Error('Tab A fehlt.');
    pass('Auto-Login landet im phpMyAdmin-Dashboard (Profil A)');

    const cookieA = await cookieValueFor(browserViews.tabs.get(profA.id).view.webContents, serverUrl);
    if (cookieA !== 'admin') throw new Error(`Unerwarteter Cookie-Wert für A: ${cookieA}`);
    pass('Sitzungscookie von Profil A ist gesetzt');

    /* 2) Zweites Profil mit eigener Sitzung */
    await browserViews.open(profB);
    await waitFor(async () => {
      const tab = browserViews.tabs.get(profB.id);
      if (!tab) return false;
      const html = await tab.view.webContents.executeJavaScript('document.body.innerText', true);
      return String(html).includes('PMA_DASHBOARD_OK:music');
    }, 25000);

    const cookieB = await cookieValueFor(browserViews.tabs.get(profB.id).view.webContents, serverUrl);
    if (cookieB !== 'music') throw new Error(`Unerwarteter Cookie-Wert für B: ${cookieB}`);
    pass('Auto-Login mit zweitem Profil (Profil B)');

    if (cookieA === cookieB) throw new Error('Profile teilen sich eine Sitzung – Trennung fehlgeschlagen.');
    pass('Sitzungen von A und B sind voneinander getrennt');

    /* 3) Umschalten erhält beide Sitzungen */
    browserViews.switchTo(profA.id);
    const stillA = await cookieValueFor(browserViews.tabs.get(profA.id).view.webContents, serverUrl);
    if (stillA !== 'admin') throw new Error('Sitzung A nach Wechsel verloren.');
    pass('Sitzung von A bleibt erhalten, wenn B geöffnet wird');

    /* 4) Sitzungs-Reset → erneuter Login nötig */
    await sessionManager.clearProfile(profB.id);
    // View schließen und neu öffnen, damit die geleerte Session greift
    browserViews.close(profB.id);
    await browserViews.open(profB);
    await waitFor(async () => {
      const tab = browserViews.tabs.get(profB.id);
      if (!tab) return false;
      const html = await tab.view.webContents.executeJavaScript('document.body.innerText', true);
      return String(html).includes('PMA_DASHBOARD_OK:music');
    }, 25000);
    pass('Nach Sitzungs-Reset meldet sich Profil B automatisch erneut an');

    /* 5) Manueller Login bleibt möglich: Profil ohne Auto-Login & Credentials */
    const profC = profileStore.create({
      name: 'Ticket-Bot',
      url: serverUrl,
      autoLogin: false,
      storeCredentials: false
    }).profile;
    await browserViews.open(profC);
    const loginFormPresent = await waitFor(async () => {
      const tab = browserViews.tabs.get(profC.id);
      if (!tab) return false;
      return tab.view.webContents.executeJavaScript(
        'document.readyState === "complete" && !!document.querySelector(\'input[name="pma_username"]\')',
        true
      );
    }, 25000);
    if (loginFormPresent) {
      pass('Profil ohne Auto-Login zeigt die Anmeldeseite (manueller Login möglich)');
    } else {
      fail('Manueller Login', 'Erwartet war die Anmeldeseite.');
    }
  } catch (err) {
    fail('E2E-Test', err.message);
    console.error(err.stack || err);
  } finally {
    try {
      browserViews.closeAll();
    } catch { /* egal */ }
    try {
      server.close();
    } catch { /* egal */ }
    win.destroy();
    finish();
  }

  function finish() {
    clearTimeout(overallTimer);
    console.log(`\nErgebnis: ${failures.length === 0 ? 'ALLE TESTS BESTANDEN' : failures.length + ' FEHLER'}`);
    failures.forEach((f) => console.log('  - ' + f));
    app.exit(failures.length === 0 ? 0 : 1);
  }
}).catch((err) => {
  console.error('Fehler im Harness:', err);
  app.exit(1);
});
