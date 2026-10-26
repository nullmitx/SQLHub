'use strict';

/**
 * Reine Validierungs- und Formatierungsfunktionen.
 * Ohne Electron-Abhängigkeit – dadurch unit-testbar.
 */
const { ALLOWED_URL_PROTOCOLS } = require('./config');

function isNonEmptyString(value, maxLength = 500) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isOptionalString(value, maxLength = 2000) {
  return value === undefined || value === null ||
    (typeof value === 'string' && value.length <= maxLength);
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

const DEFAULT_ICON_NAME = 'database';

/**
 * Normalisiert einen Icon-Namen (Lucide). Unbekannte/ungültige Werte
 * fallen auf den Standardnamen zurück.
 */
function sanitizeIconName(value) {
  if (typeof value !== 'string') return DEFAULT_ICON_NAME;
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  return clean || DEFAULT_ICON_NAME;
}

/**
 * Prüft und normalisiert eine phpMyAdmin-URL.
 * @returns {{ ok: true, url: string } | { ok: false, error: string }}
 */
function validatePhpMyAdminUrl(raw) {
  if (!isNonEmptyString(raw, 2048)) {
    return { ok: false, error: 'Die phpMyAdmin-URL ist erforderlich.' };
  }
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'Die phpMyAdmin-URL ist ungültig.' };
  }
  if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
    return { ok: false, error: 'Es sind nur http- und https-Adressen erlaubt.' };
  }
  if (!parsed.hostname) {
    return { ok: false, error: 'Die URL enthält keinen Hostnamen.' };
  }
  parsed.hash = '';
  return { ok: true, url: parsed.toString() };
}

/**
 * Validiert die Eingaben eines Profils.
 * @param {object} input
 * @param {{ requireUrl?: boolean }} [options]
 * @returns {{ ok: boolean, errors: string[], value?: object }}
 */
function validateProfileInput(input, options = {}) {
  const requireUrl = options.requireUrl !== false;
  const errors = [];

  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['Ungültige Profileingaben.'] };
  }

  if (!isNonEmptyString(input.name, 120)) {
    errors.push('Ein Profilname (max. 120 Zeichen) ist erforderlich.');
  }
  if (!isOptionalString(input.description, 1000)) {
    errors.push('Die Beschreibung ist zu lang.');
  }
  if (!isOptionalString(input.category, 60)) {
    errors.push('Die Kategorie darf maximal 60 Zeichen lang sein.');
  }
  if (!isOptionalString(input.iconEmoji, 8)) {
    errors.push('Das Icon-Emoji ist ungültig.');
  }
  if (!isOptionalString(input.iconName, 40)) {
    errors.push('Der Icon-Name ist ungültig.');
  }
  if (!isOptionalString(input.databaseName, 200)) {
    errors.push('Der Datenbankname ist zu lang.');
  }
  if (!isOptionalString(input.serverNote, 500)) {
    errors.push('Die Servernotiz ist zu lang.');
  }
  if (input.accentColor !== undefined && input.accentColor !== null &&
      input.accentColor !== '' && !isHexColor(input.accentColor)) {
    errors.push('Die Akzentfarbe ist ungültig.');
  }

  let url = null;
  if (requireUrl || (input.url && String(input.url).trim() !== '')) {
    const urlResult = validatePhpMyAdminUrl(input.url);
    if (!urlResult.ok) {
      errors.push(urlResult.error);
    } else {
      url = urlResult.url;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const value = {
    name: input.name.trim(),
    description: (input.description || '').trim(),
    category: (input.category || '').trim(),
    favorite: Boolean(input.favorite),
    url,
    databaseName: (input.databaseName || '').trim(),
    serverNote: (input.serverNote || '').trim(),
    iconName: sanitizeIconName(input.iconName),
    iconEmoji: (input.iconEmoji || '🤖').trim() || '🤖',
    accentColor: isHexColor(input.accentColor) ? input.accentColor : '#7c5cff',
    storeCredentials: input.storeCredentials !== false,
    autoLogin: input.autoLogin !== false
  };
  // Profilbild nur übernehmen, wenn es ausdrücklich gesetzt/entfernt wird.
  if (input.iconFile !== undefined) {
    value.iconFile = input.iconFile === null ? null : String(input.iconFile).slice(0, 1000);
  }

  return { ok: true, errors: [], value };
}

/**
 * Entfernt Passwörter und andere Geheimnisse rekursiv aus einem Objekt (für Logs/Exports).
 */
function redactSecrets(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) return obj.map((item) => redactSecrets(item, depth + 1));
  const clone = { ...obj };
  for (const key of Object.keys(clone)) {
    const val = clone[key];
    if (/pass|secret|token|pwd|credential|verifier|salt|key/i.test(key) && key !== 'hasCredentials') {
      clone[key] = val ? '***' : '';
    } else if (typeof val === 'string' && /^https?:\/\/[^/]+:[^/]+@/i.test(val)) {
      clone[key] = val.replace(/:\/\/[^/:]+:[^@]+@/i, '://***:***@');
    } else if (val && typeof val === 'object') {
      clone[key] = redactSecrets(val, depth + 1);
    }
  }
  return clone;
}

module.exports = {
  isNonEmptyString,
  isOptionalString,
  isHexColor,
  sanitizeIconName,
  validatePhpMyAdminUrl,
  validateProfileInput,
  redactSecrets
};
