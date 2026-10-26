// constants.js – zentrale Werte für den Renderer

/** Platzhalter-Beispiel für die phpMyAdmin-Adresse (neutral, kein echter Host). */
export const DEFAULT_PHPMYADMIN_URL = '';

/** Beispiel-URL, nur als Hinweis im Formular. */
export const EXAMPLE_PHPMYADMIN_URL = 'https://server.example.com/phpmyadmin/';

/** Standard-Akzentfarbe für neue Profile. */
export const DEFAULT_ACCENT = '#7c5cff';

/** Vorschläge für Akzentfarben (Profil & Design). */
export const ACCENT_PRESETS = [
  '#7c5cff', '#4d7cfe', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#a855f7'
];

/** Schnellauswahl-Kategorien für Datenbankprofile. */
export const CATEGORY_PRESETS = [
  'Produktion',
  'Staging',
  'Discord-Bot',
  'Gameserver',
  'Webprojekt',
  'Entwicklung'
];

/** Standard-Favoriten für Datenbank-/Panel-URLs im Profilformular. */
export const DEFAULT_URL_FAVORITES = [
  { label: 'phpmyadmin.hostl.eu', url: 'https://phpmyadmin.hostl.eu/' },
  { label: 'Localhost phpMyAdmin', url: 'http://localhost/phpmyadmin/' },
  { label: '127.0.0.1:8080', url: 'http://127.0.0.1:8080/' }
];

/** Schnellauswahl für Datenbanksysteme / Panel-Typen. */
export const DB_SYSTEM_PRESETS = [
  'MySQL / MariaDB',
  'PostgreSQL (pgAdmin)',
  'Adminer',
  'Plesk / cPanel DB',
  'Redis / Key-Value',
  'CloudPanel / Hoster'
];

