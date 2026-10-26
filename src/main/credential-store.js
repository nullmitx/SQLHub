'use strict';

/**
 * Sichere Zugangsdatenverwaltung.
 *
 * Passwörter werden mit Electron `safeStorage` verschlüsselt – unter Windows
 * nutzt Electron dabei DPAPI (Data Protection API), das an den Windows-User
 * gebunden ist. Die verschlüsselten Blobs liegen in `credentials.enc`;
 * die Profile enthalten ausschließlich einen Verweis (`hasCredentials`).
 *
 * Der Store ist von Electron entkoppelt (safeStorage wird injiziert),
 * damit er unit-getestet werden kann.
 */
const fs = require('fs');
const path = require('path');
const cryptoModule = require('./crypto');

class CredentialStore {
  /**
   * @param {{
   *   file: string,
   *   safeStorage: { isEncryptionAvailable(): boolean, encryptString(s: string): Buffer, decryptString(b: Buffer): string },
   *   logger?: { info(): void, warn(): void, error(): void }
   * }} options
   */
  constructor(options) {
    if (!options || !options.file || !options.safeStorage) {
      throw new Error('CredentialStore benötigt file und safeStorage.');
    }
    this.file = options.file;
    this.safeStorage = options.safeStorage;
    this.logger = options.logger || { info() {}, warn() {}, error() {} };
    this._cache = null;
    // Entsperrte Profil-Passwörter nur im Speicher (profileId -> credentials).
    this._unlocked = new Map();
    // Abgeleitete Profil-Schlüssel nur im Speicher (profileId -> Buffer).
    this._keys = new Map();
  }

  /** Verschlüsselung verfügbar? Unter Windows: DPAPI via safeStorage. */
  isAvailable() {
    try {
      return this.safeStorage.isEncryptionAvailable() === true;
    } catch {
      return false;
    }
  }

  _ensureDir() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
  }

  _load() {
    if (this._cache) return this._cache;
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) {
          this._cache = parsed.entries;
          return this._cache;
        }
      }
    } catch (err) {
      this.logger.error('Credential-Datei konnte nicht gelesen werden.', { error: err.message });
    }
    this._cache = [];
    return this._cache;
  }

  _persist() {
    this._ensureDir();
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries: this._cache }, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  has(profileId) {
    return this._load().some((e) => e.profileId === profileId && Boolean(e.username || e.password || e.env));
  }

  /** Ist der Eintrag mit einem Profil-Passwort geschützt? */
  isLocked(profileId) {
    const entry = this._load().find((e) => e.profileId === profileId);
    return Boolean(entry && entry.locked);
  }

  /**
   * Speichert (oder überschreibt) Zugangsdaten für ein Profil.
   * @param {string} profileId
   * @param {{ username: string, password: string }} credentials
   * @param {Buffer} [profileKey] Schlüssel aus dem Profil-Passwort (schützt zusätzlich)
   * @returns {{ ok: boolean, errors?: string[] }}
   */
  set(profileId, credentials, profileKey) {
    if (!profileId || typeof profileId !== 'string') {
      return { ok: false, errors: ['Ungültige Profil-ID.'] };
    }
    if (!credentials || typeof credentials.username !== 'string' ||
        typeof credentials.password !== 'string') {
      return { ok: false, errors: ['Benutzername und Passwort sind erforderlich.'] };
    }
    if (credentials.username.length > 200 || credentials.password.length > 1000) {
      return { ok: false, errors: ['Zugangsdaten sind zu lang.'] };
    }

    let entryValue;
    if (profileKey) {
      // Profil-Passwortschutz: Credentials mit dem abgeleiteten Schlüssel.
      try {
        const env = cryptoModule.encrypt(profileKey, Buffer.from(JSON.stringify(credentials), 'utf8'));
        let safeBackup = null;
        if (this.isAvailable()) {
          try {
            safeBackup = this.safeStorage.encryptString(JSON.stringify(credentials)).toString('base64');
          } catch { /* optional */ }
        }
        entryValue = {
          locked: true,
          env: JSON.stringify(env),
          safeBackup,
          keyCheck: credentials.username.length
        };
      } catch (err) {
        this.logger.error('Profil-Verankerung fehlgeschlagen.', { error: err.message });
        return { ok: false, errors: ['Die Zugangsdaten konnten nicht geschützt gespeichert werden.'] };
      }
      this._unlocked.set(profileId, { username: credentials.username, password: credentials.password });
    } else {
      if (!this.isAvailable()) {
        return {
          ok: false,
          errors: ['Die Zugangsdatenverschlüsselung (DPAPI / Keychain / Secret Service) ist auf diesem System nicht verfügbar. Zugangsdaten werden nicht gespeichert.']
        };
      }
      try {
        entryValue = {
          locked: false,
          username: this.safeStorage.encryptString(credentials.username).toString('base64'),
          password: this.safeStorage.encryptString(credentials.password).toString('base64')
        };
      } catch (err) {
        this.logger.error('Verschlüsselung fehlgeschlagen.', { error: err.message });
        return { ok: false, errors: ['Die Zugangsdaten konnten nicht verschlüsselt gespeichert werden.'] };
      }
      this._unlocked.delete(profileId);
    }

    const entries = this._load();
    const existing = entries.find((e) => e.profileId === profileId);
    if (existing) {
      existing.locked = entryValue.locked;
      existing.username = entryValue.username;
      existing.password = entryValue.password;
      existing.env = entryValue.env;
      existing.safeBackup = entryValue.safeBackup || existing.safeBackup || null;
      existing.updatedAt = new Date().toISOString();
    } else {
      entries.push({
        profileId,
        ...entryValue,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    this._persist();
    this.logger.info('Zugangsdaten gespeichert.', { profileId, locked: Boolean(profileKey) });
    return { ok: true };
  }

  /**
   * Speichert das Profil-Zugriffsschutz-Passwort hardwareverschlüsselt für den Passwort-Manager.
   */
  setLockPassword(profileId, lockPassword) {
    if (!profileId || typeof lockPassword !== 'string' || !this.isAvailable()) return false;
    try {
      const encLockPw = this.safeStorage.encryptString(lockPassword).toString('base64');
      const entries = this._load();
      let existing = entries.find((e) => e.profileId === profileId);
      if (existing) {
        existing.lockSecret = encLockPw;
        existing.updatedAt = new Date().toISOString();
      } else {
        entries.push({
          profileId,
          locked: false,
          lockSecret: encLockPw,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      this._persist();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Liest das gespeicherte Profil-Zugriffsschutz-Passwort für den Passwort-Manager aus.
   */
  getLockPassword(profileId) {
    const entry = this._load().find((e) => e.profileId === profileId);
    if (!entry || !entry.lockSecret || !this.isAvailable()) return null;
    try {
      return this.safeStorage.decryptString(Buffer.from(entry.lockSecret, 'base64'));
    } catch {
      return null;
    }
  }

  deleteLockPassword(profileId) {
    const entries = this._load();
    const existing = entries.find((e) => e.profileId === profileId);
    if (!existing) return false;
    delete existing.lockSecret;
    if (!existing.username && !existing.password && !existing.env) {
      const idx = entries.indexOf(existing);
      if (idx !== -1) entries.splice(idx, 1);
    }
    this._persist();
    return true;
  }

  /**
   * Hebt die Profil-Passwortsperre ohne Kenntnis des alten Profil-Passworts auf (Admin-Konsole).
   */
  forceRemoveLock(profileId) {
    this.lock(profileId);
    const entries = this._load();
    const existing = entries.find((e) => e.profileId === profileId);
    if (!existing) return { ok: true };
    delete existing.lockSecret;

    if (existing.locked) {
      let restoredCreds = null;
      if (existing.safeBackup && this.isAvailable()) {
        try {
          const raw = this.safeStorage.decryptString(Buffer.from(existing.safeBackup, 'base64'));
          restoredCreds = JSON.parse(raw);
        } catch { /* ignore */ }
      }
      if (restoredCreds && restoredCreds.username !== undefined && restoredCreds.password !== undefined) {
        existing.locked = false;
        existing.username = this.safeStorage.encryptString(String(restoredCreds.username)).toString('base64');
        existing.password = this.safeStorage.encryptString(String(restoredCreds.password)).toString('base64');
        delete existing.env;
        delete existing.safeBackup;
        existing.updatedAt = new Date().toISOString();
        this._persist();
      } else {
        // Falls keine wiederherstellbare Backup-Kopie vorlag, gesperrten Credential-Blob entfernen
        const idx = entries.indexOf(existing);
        if (idx !== -1) entries.splice(idx, 1);
        this._persist();
      }
    } else {
      this._persist();
    }
    return { ok: true };
  }

  /**
   * Entsperrt die Zugangsdaten eines profilgeschützten Eintrags.
   * @returns {{ ok:boolean, credentials?:object, errors?:string[] }}
   */
  unlock(profileId, profileKey) {
    const entry = this._load().find((e) => e.profileId === profileId);
    if (!entry || !entry.locked) return { ok: false, errors: ['Kein geschützter Eintrag.'] };
    try {
      const decrypted = cryptoModule.decrypt(profileKey, JSON.parse(entry.env)).toString('utf8');
      const credentials = JSON.parse(decrypted);
      this._unlocked.set(profileId, credentials);
      this._keys.set(profileId, profileKey);
      return { ok: true, credentials };
    } catch {
      return { ok: false, errors: ['Falsches Profil-Passwort.'] };
    }
  }

  /** Merkt die Zugangsdaten als entsperrt (nach erfolgreicher Prüfung durch den Aufrufer). */
  cacheUnlocked(profileId, credentials) {
    this._unlocked.set(profileId, credentials);
  }

  /** Liefert den zwischengespeicherten Profil-Schlüssel (falls entsperrt). */
  getKey(profileId) {
    return this._keys.get(profileId) || null;
  }

  /** Ist ein geschützter Eintrag im Speicher entsperrt? */
  isUnlockedInMemory(profileId) {
    return this._unlocked.has(profileId);
  }

  /** Sperrt einen geschützten Eintrag (entfernt Klartext/Schlüssel aus dem Speicher). */
  lock(profileId) {
    this._unlocked.delete(profileId);
    const key = this._keys.get(profileId);
    if (key) key.fill(0);
    this._keys.delete(profileId);
  }

  lockAll() {
    this._unlocked.clear();
    for (const key of this._keys.values()) key.fill(0);
    this._keys.clear();
  }

  /**
   * Liest Zugangsdaten entschlüsselt zurück.
   * @returns {{ ok: boolean, credentials?: { username: string, password: string }, errors?: string[] }}
   */
  get(profileId) {
    const entry = this._load().find((e) => e.profileId === profileId);
    if (!entry) {
      return { ok: false, errors: ['Keine gespeicherten Zugangsdaten für dieses Profil.'] };
    }
    if (entry.locked) {
      if (this._unlocked.has(profileId)) {
        return { ok: true, credentials: this._unlocked.get(profileId) };
      }
      return { ok: false, locked: true, errors: ['Dieses Profil ist durch ein Passwort geschützt.'] };
    }
    if (!this.isAvailable()) {
      return { ok: false, errors: ['Die Zugangsdatenverschlüsselung ist nicht verfügbar.'] };
    }
    try {
      return {
        ok: true,
        credentials: {
          username: this.safeStorage.decryptString(Buffer.from(entry.username, 'base64')),
          password: this.safeStorage.decryptString(Buffer.from(entry.password, 'base64'))
        }
      };
    } catch (err) {
      this.logger.error('Entschlüsselung fehlgeschlagen.', { profileId, error: err.message });
      return {
        ok: false,
        errors: ['Gespeicherte Zugangsdaten konnten nicht entschlüsselt werden (anderes Benutzerkonto oder System?).']
      };
    }
  }

  /** Prüft, ob Zugangsdaten lesbar sind, ohne sie zurückzugeben. */
  verify(profileId) {
    const res = this.get(profileId);
    return { ok: res.ok, stored: this.has(profileId), errors: res.errors };
  }

  delete(profileId) {
    this.lock(profileId);
    const entries = this._load();
    const idx = entries.findIndex((e) => e.profileId === profileId);
    if (idx === -1) return false;
    entries.splice(idx, 1);
    this._persist();
    this.logger.info('Zugangsdaten gelöscht.', { profileId });
    return true;
  }

  deleteAll() {
    const count = this._load().length;
    this._cache = [];
    this.lockAll();
    this._persist();
    this.logger.info('Alle Zugangsdaten gelöscht.', { count });
    return count;
  }
}

module.exports = { CredentialStore };
