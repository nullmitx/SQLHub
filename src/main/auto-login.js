'use strict';

/**
 * Auto-Login-Logik für phpMyAdmin.
 *
 * Wichtige Sicherheitshinweise:
 * - Automatisches Anmelden passiert ausschließlich über die *offizielle*
 *   Anmelde-Formular-Seite von phpMyAdmin (Cookie-Authentifizierung) bzw.
 *   über den nativen Electron-`login`-Handler (HTTP Basic Auth).
 * - Es werden keine Session-Tokens gefälscht und keine Sicherheitsmechanismen
 *   umgangen. Schlägt der Auto-Login fehl, bleibt die normale Anmeldeseite
 *   stehen und der manuelle Login funktioniert weiterhin.
 *
 * Die Entscheidungslogik ist rein und ohne Electron – dadurch unit-testbar.
 */

/** Erkennungsskript, das in der phpMyAdmin-Seite ausgeführt wird. */
const DETECT_SCRIPT = `(() => {
  const byName = (n) => document.querySelector('input[name="' + n + '"]');
  const user = byName('pma_username') || document.getElementById('input_username');
  const pass = byName('pma_password') || document.getElementById('input_password');
  if (user && pass) return 'pma-login';
  if (document.getElementById('pma_navigation') || document.getElementById('serverinfo') ||
      document.querySelector('frame[name="phpmyadmin"]') ||
      document.querySelector('iframe[src*="phpmyadmin"]')) {
    return 'pma-dashboard';
  }
  const pwd = document.querySelector('input[type="password"]');
  if (pwd) return 'other-login';
  return 'unknown';
})()`;

/**
 * Baut das Füll-Skript für die phpMyAdmin-Anmeldeseite.
 * Die Credentials werden als JSON-String eingebettet (sicher gegen
 * JS-Injection über Passwortinhalte).
 */
function buildFillScript(username, password) {
  const userLiteral = JSON.stringify(String(username));
  const passLiteral = JSON.stringify(String(password));
  return `(() => {
  const byName = (n) => document.querySelector('input[name="' + n + '"]');
  const user = byName('pma_username') || document.getElementById('input_username');
  const pass = byName('pma_password') || document.getElementById('input_password');
  if (!user || !pass) return false;
  const form = user.form || pass.form;
  user.value = ${userLiteral};
  pass.value = ${passLiteral};
  user.dispatchEvent(new Event('input', { bubbles: true }));
  pass.dispatchEvent(new Event('input', { bubbles: true }));
  if (form) { form.submit(); return true; }
  return false;
})()`;
}

/**
 * Entscheidet, ob und wie ein Auto-Login versucht werden soll.
 *
 * @param {{
 *   pageKind: 'pma-login'|'pma-dashboard'|'other-login'|'unknown',
 *   profile: { autoLogin: boolean, storeCredentials: boolean, hasCredentials?: boolean },
 *   attemptsOnThisPage: number,
 *   credentialsAvailable?: boolean
 * }} context
 * @returns {{ action: 'fill'|'none', reason: string }}
 */
function decideAutoLogin(context) {
  const { pageKind, profile, attemptsOnThisPage } = context;

  if (pageKind !== 'pma-login') {
    return { action: 'none', reason: 'Keine phpMyAdmin-Anmeldeseite erkannt.' };
  }
  if (!profile || profile.autoLogin === false) {
    return { action: 'none', reason: 'Automatischer Login ist für dieses Profil deaktiviert.' };
  }
  if (profile.storeCredentials === false) {
    return { action: 'none', reason: 'Zugangsdaten werden für dieses Profil nicht gespeichert.' };
  }
  if (context.credentialsAvailable === false) {
    return { action: 'none', reason: 'Keine gespeicherten Zugangsdaten vorhanden.' };
  }
  if (attemptsOnThisPage >= 2) {
    // Nach zwei Fehlversuchen nie wieder automatisch eingreifen –
    // der Benutzer meldet sich dann manuell an.
    return { action: 'none', reason: 'Zu viele Auto-Login-Versuche auf dieser Seite.' };
  }
  return { action: 'fill', reason: 'phpMyAdmin-Anmeldeseite und Credentials vorhanden.' };
}

/**
 * Prüft, ob eine URL nach einem fehlgeschlagenen Login erneut die
 * Anmeldeseite ist (Auto-Login-Schleifen-Schutz).
 */
function isLoginLikeUrl(url) {
  try {
    const u = new URL(url);
    return /login|auth|signin/i.test(u.pathname + u.search);
  } catch {
    return false;
  }
}

module.exports = {
  DETECT_SCRIPT,
  buildFillScript,
  decideAutoLogin,
  isLoginLikeUrl
};
