'use strict';

/**
 * Profilverwaltung (Profile-Store).
 * Speichert Profile in einer JSON-Datei – OHNE Passwörter.
 * Zugangsdaten liegen ausschließlich im Credential-Store (siehe credential-store.js).
 *
 * Der Store ist von Electron entkoppelt (Pfade werden injiziert), damit er
 * unit-getestet werden kann.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PROFILE_DEFAULTS, BROWSER } = require('./config');
const { validateProfileInput } = require('./validators');

class ProfileStore {
  /**
   * @param {{ file: string, logger?: { info(): void, warn(): void, error(): void } }} options
   */
  constructor(options) {
    if (!options || !options.file) {
      throw new Error('ProfileStore benötigt eine Datei-Option.');
    }
    this.file = options.file;
    this.logger = options.logger || { info() {}, warn() {}, error() {} };
    this.codec = options.codec || null;
    this._cache = null;
  }

  _ensureDir() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
  }

  _load() {
    if (this._cache) return this._cache;
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf8');
        const text = this.codec ? this.codec.decode(raw) : raw;
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          this._cache = parsed;
          return this._cache;
        }
      }
    } catch (err) {
      if (err && err.code === 'VAULT_LOCKED') throw err;
      // Beschädigte Datei nicht überschreiben: Backup anlegen.
      this.logger.error('Profile-Datei konnte nicht gelesen werden.', { error: err.message });
      try {
        fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`);
      } catch {
        /* egal */
      }
    }
    this._cache = [];
    return this._cache;
  }

  _persist() {
    this._ensureDir();
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

  _publicView(profile) {
    if (!profile) return null;
    const { ...rest } = profile;
    // Sicherheitsnetz: Falls jemals ein Passwort in ein Profil geraten ist, nie zurückgeben.
    delete rest.password;
    delete rest.username;
    // Kryptografische Parameter (Salt/Verifier) nicht an Renderer oder Export weitergeben.
    if (rest.lock && rest.lock.enabled) {
      rest.lock = {
        enabled: true,
        hint: rest.lock.hint || ''
      };
    } else {
      rest.lock = null;
    }
    return rest;
  }

  list() {
    return this._load().map((p) => this._publicView(p));
  }

  get(id) {
    const found = this._load().find((p) => p.id === id);
    return this._publicView(found);
  }

  /**
   * Erstellt ein neues Profil.
   * @param {object} input Roheingabe aus dem Formular
   * @returns {{ ok: boolean, errors?: string[], profile?: object }}
   */
  create(input) {
    const profiles = this._load();
    if (profiles.length >= BROWSER.maxProfiles) {
      return { ok: false, errors: [`Maximal ${BROWSER.maxProfiles} Profile sind möglich.`] };
    }
    const result = validateProfileInput(input);
    if (!result.ok) return result;

    const now = new Date().toISOString();
    const profile = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
      ...PROFILE_DEFAULTS,
      ...result.value
    };
    profiles.push(profile);
    this._persist();
    this.logger.info('Profil erstellt.', { id: profile.id, name: profile.name });
    return { ok: true, profile: this._publicView(profile) };
  }

  /**
   * Aktualisiert ein bestehendes Profil.
   */
  update(id, input) {
    const profiles = this._load();
    const idx = profiles.findIndex((p) => p.id === id);
    if (idx === -1) {
      return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    }
    const existing = profiles[idx];
    const merged = { ...existing, ...input, id: existing.id };
    const result = validateProfileInput(merged);
    if (!result.ok) return result;

    profiles[idx] = {
      ...existing,
      ...result.value,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };
    this._persist();
    this.logger.info('Profil aktualisiert.', { id });
    return { ok: true, profile: this._publicView(profiles[idx]) };
  }

  duplicate(id) {
    const profiles = this._load();
    if (profiles.length >= BROWSER.maxProfiles) {
      return { ok: false, errors: [`Maximal ${BROWSER.maxProfiles} Profile sind möglich.`] };
    }
    const source = profiles.find((p) => p.id === id);
    if (!source) {
      return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    }
    const now = new Date().toISOString();
    const copy = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} (Kopie)`.slice(0, 120),
      lock: null,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null
    };
    profiles.push(copy);
    this._persist();
    this.logger.info('Profil dupliziert.', { sourceId: id, id: copy.id });
    return { ok: true, profile: this._publicView(copy) };
  }

  /**
   * Löscht ein Profil. Die zugehörigen Zugangsdaten werden separat
   * über den Credential-Store entfernt (siehe ipc.js).
   * @returns {{ ok: boolean, deleted?: object, errors?: string[] }}
   */
  delete(id) {
    const profiles = this._load();
    const idx = profiles.findIndex((p) => p.id === id);
    if (idx === -1) {
      return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    }
    const [deleted] = profiles.splice(idx, 1);
    this._persist();
    this.logger.info('Profil gelöscht.', { id });
    return { ok: true, deleted: this._publicView(deleted) };
  }

  touchOpened(id) {
    const profiles = this._load();
    const found = profiles.find((p) => p.id === id);
    if (!found) return;
    found.lastOpenedAt = new Date().toISOString();
    this._persist();
  }

  /**
   * Setzt bzw. entfernt die Profil-Schutzmetadaten (Salt/Verifier, kein Passwort).
   * @param {string} id
   * @param {object|null} lockMeta
   */
  setLock(id, lockMeta) {
    const profiles = this._load();
    const found = profiles.find((p) => p.id === id);
    if (!found) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    found.lock = lockMeta;
    found.updatedAt = new Date().toISOString();
    this._persist();
    this.logger.info(lockMeta ? 'Profilschutz aktiviert.' : 'Profilschutz entfernt.', { id });
    return { ok: true, profile: this._publicView(found) };
  }

  /** Vollständiges Profil inkl. interner Felder (für Krypto-Metadaten). */
  getRaw(id) {
    const found = this._load().find((p) => p.id === id);
    return found ? { ...found } : null;
  }
}

module.exports = { ProfileStore };
