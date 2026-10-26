'use strict';

/**
 * Tresor (Vault) für die Master-Passwort-Verschlüsselung.
 *
 * Idee:
 * - Beim Einrichten wird aus dem Master-Passwort ein Schlüssel abgeleitet
 *   (scrypt) und nur die öffentlichen Metadaten (Salt, Parameter, Verifier)
 *   in `vault.json` gespeichert. Das Passwort selbst wird NIE gespeichert.
 * - Beim Entsperren wird der Schlüssel erneut abgeleitet und gegen den
 *   Verifier geprüft. Der Schlüssel lebt nur im Arbeitsspeicher.
 * - Die Stores (Profile/Einstellungen) verschlüsseln ihre Dateien über den
 *   Codec mit diesem Schlüssel.
 *
 * Von Electron entkoppelt – unit-testbar.
 */
const fs = require('fs');
const path = require('path');
const {
  SCRYPT_DEFAULTS,
  deriveKey,
  randomSalt,
  safeEqual
} = require('./crypto');

class Vault {
  /**
   * @param {{ file: string, params?: object, logger?: object }} options
   */
  constructor(options) {
    if (!options || !options.file) {
      throw new Error('Vault benötigt eine Datei-Option.');
    }
    this.file = options.file;
    this.params = options.params || SCRYPT_DEFAULTS;
    this.logger = options.logger || { info() {}, warn() {}, error() {} };
    this._key = null; // Buffer | null – nur im Speicher
    this._meta = this._readMeta();
  }

  _readMeta() {
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (parsed && parsed.v === 1 && parsed.kdfSalt && parsed.verifySalt && parsed.verifier) {
          return parsed;
        }
      }
    } catch (err) {
      this.logger.error('Tresor-Metadaten konnten nicht gelesen werden.', { error: err.message });
    }
    return null;
  }

  /** Ist ein Master-Passwort eingerichtet? */
  isInitialized() {
    return this._meta !== null;
  }

  isUnlocked() {
    return this._key !== null;
  }

  /** Aktueller Schlüssel oder null. */
  getKey() {
    return this._key;
  }

  status() {
    return {
      initialized: this.isInitialized(),
      unlocked: this.isUnlocked(),
      state: !this.isInitialized() ? 'uninitialized' : (this.isUnlocked() ? 'unlocked' : 'locked')
    };
  }

  _writeMeta(meta) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
    this._meta = meta;
  }

  /**
   * Richtet den Tresor mit einem Master-Passwort ein.
   * @returns {{ ok:boolean, errors?:string[] }}
   */
  create(password) {
    if (this.isInitialized()) {
      return { ok: false, errors: ['Der App-Schutz ist bereits eingerichtet.'] };
    }
    if (typeof password !== 'string' || password.length < 8) {
      return { ok: false, errors: ['Das Hauptpasswort muss mindestens 8 Zeichen lang sein.'] };
    }

    const kdfSalt = randomSalt(16);
    const verifySalt = randomSalt(16);
    const key = deriveKey(password, kdfSalt, this.params);
    const verifier = deriveKey(password, verifySalt, this.params);

    this._writeMeta({
      v: 1,
      createdAt: new Date().toISOString(),
      kdf: 'scrypt',
      params: { ...this.params },
      kdfSalt: kdfSalt.toString('base64'),
      verifySalt: verifySalt.toString('base64'),
      verifier: verifier.toString('base64')
    });
    this._key = key;
    this.logger.info('App-Schutz eingerichtet.');
    return { ok: true };
  }

  /**
   * Entsperrt den App-Schutz mit dem Passwort.
   * @returns {{ ok:boolean, errors?:string[] }}
   */
  unlock(password) {
    if (!this.isInitialized()) {
      return { ok: false, errors: ['Der App-Schutz ist nicht eingerichtet.'] };
    }
    if (typeof password !== 'string' || password.length === 0) {
      return { ok: false, errors: ['Bitte das Passwort eingeben.'] };
    }
    const meta = this._meta;
    const params = meta.params || this.params;
    let verifier;
    try {
      verifier = deriveKey(password, Buffer.from(meta.verifySalt, 'base64'), params);
    } catch (err) {
      this.logger.error('Schlüsselableitung fehlgeschlagen.', { error: err.message });
      return { ok: false, errors: ['Entsperren fehlgeschlagen.'] };
    }
    if (!safeEqual(verifier, Buffer.from(meta.verifier, 'base64'))) {
      return { ok: false, errors: ['Falsches Passwort.'] };
    }
    this._key = deriveKey(password, Buffer.from(meta.kdfSalt, 'base64'), params);
    this.logger.info('App entsperrt.');
    return { ok: true };
  }

  /** Sperrt den App-Schutz und löscht den Schlüssel aus dem Speicher. */
  lock() {
    if (this._key) {
      this._key.fill(0);
      this._key = null;
    }
    return { ok: true };
  }

  /**
   * Prüft ein Passwort gegen den gespeicherten Verifier (ohne den Zustand zu verändern).
   * @param {string} password
   * @returns {boolean}
   */
  verifyPassword(password) {
    if (!this.isInitialized()) return false;
    if (typeof password !== 'string' || password.length === 0) return false;
    const meta = this._meta;
    const params = meta.params || this.params;
    try {
      const verifier = deriveKey(password, Buffer.from(meta.verifySalt, 'base64'), params);
      return safeEqual(verifier, Buffer.from(meta.verifier, 'base64'));
    } catch {
      return false;
    }
  }

  /**
   * Ändert das Hauptpasswort. Der Aufrufer muss zuvor sicherstellen,
   * dass die App entsperrt ist und die Stores neu verschlüsselt werden.
   * @returns {{ ok:boolean, errors?:string[] }}
   */
  changePassword(oldPassword, newPassword) {
    const unlockResult = this.unlock(oldPassword);
    if (!unlockResult.ok) return unlockResult;
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return { ok: false, errors: ['Das neue Hauptpasswort muss mindestens 8 Zeichen lang sein.'] };
    }
    const kdfSalt = randomSalt(16);
    const verifySalt = randomSalt(16);
    const key = deriveKey(newPassword, kdfSalt, this.params);
    const verifier = deriveKey(newPassword, verifySalt, this.params);
    this._key = key;
    this._writeMeta({
      v: 1,
      createdAt: this._meta ? this._meta.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      kdf: 'scrypt',
      params: { ...this.params },
      kdfSalt: kdfSalt.toString('base64'),
      verifySalt: verifySalt.toString('base64'),
      verifier: verifier.toString('base64')
    });
    this.logger.info('Hauptpasswort geändert.');
    return { ok: true };
  }

  /**
   * Codec für Stores: verschlüsselt beim Schreiben, entschlüsselt beim Lesen.
   * @returns {{ encode(text:string):string, decode(text:string):string, isEncrypted(text:string):boolean }}
   */
  createCodec() {
    const crypto = require('./crypto');
    return {
      isEncrypted: (text) => typeof text === 'string' && text.includes('"__sqlhub_enc"'),
      encode: (text) => {
        // Ohne eingerichteten Tresor bleiben Dateien im Klartext.
        if (!this.isInitialized()) return text;
        if (!this._key) {
          const err = new Error('Der Tresor ist gesperrt.');
          err.code = 'VAULT_LOCKED';
          throw err;
        }
        return crypto.encodeString(this._key, text);
      },
      decode: (text) => crypto.decodeString(this._key, text)
    };
  }
}

module.exports = { Vault };
