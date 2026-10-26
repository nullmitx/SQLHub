'use strict';

/**
 * Zentrale Konfiguration und Pfadverwaltung.
 * Pfade werden erst nach `app.setPath`/`app.getPath` aufgelöst – daher als Funktionen.
 */
const path = require('path');

const APP_NAME = 'SQL Hub';

/** Standard-Adresse für neue Profile (neutral; Nutzer trägt eigene Adresse ein). */
const DEFAULT_PHPMYADMIN_URL = '';
/** Beispiel-Adresse, die im Formular als Platzhalter angezeigt wird. */
const EXAMPLE_PHPMYADMIN_URL = 'https://server.example.com/phpmyadmin/';

const DEFAULT_SETTINGS = Object.freeze({
  theme: 'dark',
  startView: 'dashboard',
  autoLoginDefault: true,
  restoreLastProfiles: false,
  statusCheckEnabled: true,
  autoLockMinutes: 0,
  toastDurationSeconds: 5,
  biometricUnlock: false,
  passwordManagerSupport: true,
  // Erscheinungsbild & Design-Optionen
  accentColor: '',
  accentGradient: false,
  accentGradientFrom: '#7c5cff',
  accentGradientTo: '#4d7cfe',
  buttonRadius: 'sharp',
  buttonRadiusPx: 1,
  buttonStyle: 'gradient',
  buttonColor: '',
  cardStyle: 'glass',
  uiDensity: 'normal',
  animationsEnabled: true,
  // Panel- & Karten-Oberfläche (Farbe & Liquid-Glass-Transparenz)
  panelColor: '',
  panelOpacity: 100,
  panelBlur: 20,
  // Hintergrund des Arbeitsbereichs
  backgroundStyle: 'default',
  backgroundSolid: '#0f0f18',
  backgroundGradientFrom: '#161630',
  backgroundGradientTo: '#0a0a0f',
  backgroundImage: '',
  backgroundImageOpacity: 100,
  backgroundImageBlur: 0,
  backgroundImageSharpen: true
});

const PROFILE_DEFAULTS = Object.freeze({
  description: '',
  category: '',
  favorite: false,
  iconName: 'database',
  iconEmoji: '🤖',
  accentColor: '#7c5cff',
  iconFile: null,
  databaseName: '',
  serverNote: '',
  storeCredentials: true,
  autoLogin: true,
  lock: null
});

/** Sichere Grenzen für Browser-Inhalte */
const BROWSER = Object.freeze({
  minWidth: 320,
  minHeight: 200,
  navigationTimeoutMs: 30000,
  statusTimeoutMs: 6000,
  maxProfiles: 500
});

/** Erlaubte URL-Schemata für phpMyAdmin-Adressen */
const ALLOWED_URL_PROTOCOLS = Object.freeze(['https:', 'http:']);

function dataFiles(userDataDir) {
  return {
    profiles: path.join(userDataDir, 'profiles.json'),
    sftpHosts: path.join(userDataDir, 'sftp-hosts.json'),
    addonsState: path.join(userDataDir, 'addons-state.json'),
    settings: path.join(userDataDir, 'settings.json'),
    credentials: path.join(userDataDir, 'credentials.enc'),
    vault: path.join(userDataDir, 'vault.json'),
    biometrics: path.join(userDataDir, 'biometrics.enc'),
    iconsDir: path.join(userDataDir, 'icons'),
    backgroundsDir: path.join(userDataDir, 'backgrounds')
  };
}

function partitionForProfile(profileId) {
  // Persistente Partition: Cookies/Logins überleben App-Neustarts.
  const clean = String(profileId).replace(/[^a-zA-Z0-9_-]/g, '');
  return `persist:sqlhub-${clean}`;
}

module.exports = {
  APP_NAME,
  DEFAULT_PHPMYADMIN_URL,
  EXAMPLE_PHPMYADMIN_URL,
  DEFAULT_SETTINGS,
  PROFILE_DEFAULTS,
  BROWSER,
  ALLOWED_URL_PROTOCOLS,
  dataFiles,
  partitionForProfile
};
