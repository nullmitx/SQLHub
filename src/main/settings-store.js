'use strict';

/**
 * Einstellungs-Speicher (JSON-Datei, ohne Geheimnisse).
 * Von Electron entkoppelt für Testbarkeit.
 */
const fs = require('fs');
const path = require('path');
const { DEFAULT_SETTINGS } = require('./config');

const ALLOWED_KEYS = Object.keys(DEFAULT_SETTINGS);

const HEX_KEYS = new Set([
  'accentColor',
  'accentGradientFrom',
  'accentGradientTo',
  'buttonColor',
  'panelColor',
  'backgroundSolid',
  'backgroundGradientFrom',
  'backgroundGradientTo'
]);
const THEMES = new Set(['dark', 'light', 'midnight', 'slate']);
const BACKGROUND_STYLES = new Set(['default', 'solid', 'gradient', 'image']);
const BUTTON_RADII = new Set(['sharp', 'balanced', 'rounded', 'pill', 'custom']);
const BUTTON_STYLES = new Set(['gradient', 'solid', 'soft', 'outline']);
const CARD_STYLES = new Set(['glass', 'flat', 'bordered']);
const UI_DENSITIES = new Set(['compact', 'normal', 'comfortable']);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function clamp(value, min, max) {
  if (typeof value !== 'number' || Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Bereinigt einen Wert für einen erlaubten Schlüssel; gibt undefined zurück, wenn ungültig. */
function sanitizeValue(key, value) {
  if (HEX_KEYS.has(key)) {
    if (value === '') return '';
    return HEX_RE.test(value) ? value.toLowerCase() : undefined;
  }
  if (key === 'theme') {
    return THEMES.has(value) ? value : undefined;
  }
  if (key === 'backgroundStyle') {
    return BACKGROUND_STYLES.has(value) ? value : undefined;
  }
  if (key === 'buttonRadius') {
    return BUTTON_RADII.has(value) ? value : undefined;
  }
  if (key === 'buttonRadiusPx') {
    return clamp(value, 0, 28);
  }
  if (key === 'buttonStyle') {
    return BUTTON_STYLES.has(value) ? value : undefined;
  }
  if (key === 'cardStyle') {
    return CARD_STYLES.has(value) ? value : undefined;
  }
  if (key === 'uiDensity') {
    return UI_DENSITIES.has(value) ? value : undefined;
  }
  if (key === 'panelOpacity') {
    return clamp(value, 0, 100);
  }
  if (key === 'panelBlur') {
    return clamp(value, 0, 32);
  }
  if (key === 'backgroundImageOpacity') {
    return clamp(value, 0, 100);
  }
  if (key === 'backgroundImageBlur') {
    return clamp(value, 0, 40);
  }
  if (key === 'backgroundImage') {
    if (typeof value !== 'string') return undefined;
    return value.slice(0, 1024);
  }
  if (key === 'autoLockMinutes') {
    return clamp(value, 0, 1440);
  }
  if (key === 'toastDurationSeconds') {
    return clamp(value, 1, 60);
  }
  return value;
}

class SettingsStore {
  /** @param {{ file: string }} options */
  constructor(options) {
    if (!options || !options.file) {
      throw new Error('SettingsStore benötigt eine Datei-Option.');
    }
    this.file = options.file;
    this.codec = options.codec || null;
    this._cache = null;
  }

  _load() {
    if (this._cache) return this._cache;
    let values = { ...DEFAULT_SETTINGS };
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf8');
        const text = this.codec ? this.codec.decode(raw) : raw;
        const parsed = JSON.parse(text);
        for (const key of ALLOWED_KEYS) {
          if (parsed && typeof parsed[key] === typeof DEFAULT_SETTINGS[key]) {
            const clean = sanitizeValue(key, parsed[key]);
            if (clean !== undefined) values[key] = clean;
          }
        }
      }
    } catch (err) {
      if (err && err.code === 'VAULT_LOCKED') throw err;
      /* Standardwerte verwenden */
    }
    this._cache = values;
    return this._cache;
  }

  _persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const json = JSON.stringify(this._cache, null, 2);
    const text = this.codec ? this.codec.encode(json) : json;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, this.file);
  }

  /** Lädt die Datei neu (z. B. nach dem Entsperren des Tresors). */
  reload() {
    this._cache = null;
    return this._load();
  }

  /** Schreibt den aktuellen Stand erneut (z. B. Migration Klartext → verschlüsselt). */
  resave() {
    this._load();
    this._persist();
  }

  get() {
    return { ...this._load() };
  }

  /** Setzt einzelne Einstellungen; unbekannte Schlüssel werden ignoriert. */
  set(patch) {
    const current = this._load();
    if (!patch || typeof patch !== 'object') return this.get();
    for (const key of ALLOWED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        const value = patch[key];
        if (typeof value === typeof DEFAULT_SETTINGS[key]) {
          const clean = sanitizeValue(key, value);
          if (clean !== undefined) current[key] = clean;
        }
      }
    }
    this._cache = current;
    this._persist();
    return this.get();
  }
}

module.exports = { SettingsStore };
