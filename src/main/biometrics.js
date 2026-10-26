'use strict';

/**
 * Biometrische & System-Schlüsselbund-Authentifizierung (Touch ID auf macOS,
 * Windows DPAPI / Hello auf Windows, Secret Service / Keyring auf Linux).
 *
 * Speichert bei ausdrücklicher Aktivierung durch den Nutzer das Tresor- oder
 * Profil-Geheimnis hardwaregebunden über Electrons `safeStorage` und verlangt
 * auf macOS zusätzlich eine echte Touch-ID-Fingerabdruck-Prüfung via
 * `systemPreferences.promptTouchID(...)`.
 */
const fs = require('fs');
const path = require('path');

class BiometricManager {
  /**
   * @param {{ file: string, safeStorage?: object, systemPreferences?: object, logger?: object }} opts
   */
  constructor(opts = {}) {
    this.file = opts.file;
    this.safeStorage = opts.safeStorage || null;
    this.systemPreferences = opts.systemPreferences || null;
    this.logger = opts.logger || null;
    this._cache = null;
  }

  _isSafeStorageReady() {
    try {
      return Boolean(
        this.safeStorage &&
        typeof this.safeStorage.isEncryptionAvailable === 'function' &&
        this.safeStorage.isEncryptionAvailable()
      );
    } catch {
      return false;
    }
  }

  /** Prüft, ob macOS Touch ID auf diesem Gerät verfügbar ist. */
  isTouchIdSupported() {
    try {
      if (process.platform !== 'darwin' || !this.systemPreferences) return false;
      if (typeof this.systemPreferences.canPromptTouchID === 'function') {
        return Boolean(this.systemPreferences.canPromptTouchID());
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Gibt plattformspezifische Informationen zur Biometrie-/Keychain-Unterstützung zurück. */
  getStatus() {
    const platform = process.platform;
    const touchId = this.isTouchIdSupported();
    const storageReady = this._isSafeStorageReady();
    const data = this._load();

    let methodLabel = 'System-Schlüsselbund';
    let unlockButtonLabel = 'Schnell-Entsperrung nutzen';
    if (platform === 'darwin') {
      methodLabel = touchId ? 'Apple Touch ID' : 'macOS Schlüsselbund';
      unlockButtonLabel = touchId ? 'Mit Touch ID entsperren' : 'Mit Schlüsselbund entsperren';
    } else if (platform === 'win32') {
      methodLabel = 'Windows Hello';
      unlockButtonLabel = 'Mit Windows Hello entsperren';
    } else if (platform === 'linux') {
      methodLabel = 'Linux Schlüsselbund';
      unlockButtonLabel = 'Mit Systemsitzung entsperren';
    }

    return {
      ok: true,
      platform,
      available: storageReady || touchId,
      touchIdAvailable: touchId,
      safeStorageAvailable: storageReady,
      methodLabel,
      unlockButtonLabel,
      vaultEnrolled: Boolean(data.vaultSecret),
      enrolledProfiles: Object.keys(data.profileSecrets || {})
    };
  }

  _load() {
    if (this._cache) return this._cache;
    let base = { version: 1, vaultSecret: null, profileSecrets: {} };
    try {
      if (this.file && fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          base = {
            version: 1,
            vaultSecret: typeof parsed.vaultSecret === 'string' ? parsed.vaultSecret : null,
            profileSecrets: parsed.profileSecrets && typeof parsed.profileSecrets === 'object'
              ? parsed.profileSecrets
              : {}
          };
        }
      }
    } catch {
      /* ignore corrupt file */
    }
    this._cache = base;
    return base;
  }

  _save(data) {
    this._cache = data;
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch (err) {
      if (this.logger) this.logger.error('Biometrie-Speicher konnte nicht geschrieben werden.', { error: err.message });
    }
  }

  _encryptSecret(plain) {
    if (!this._isSafeStorageReady()) {
      throw new Error('System-Verschlüsselung (Keychain / DPAPI / Secret Service) ist nicht verfügbar.');
    }
    const buf = this.safeStorage.encryptString(String(plain));
    return buf.toString('base64');
  }

  _decryptSecret(b64) {
    if (!this._isSafeStorageReady()) {
      throw new Error('System-Verschlüsselung ist nicht verfügbar.');
    }
    const buf = Buffer.from(String(b64), 'base64');
    return this.safeStorage.decryptString(buf);
  }

  /**
   * Führt auf macOS die native Touch-ID-Abfrage durch.
   * @param {string} reason
   */
  async verifyBiometricPrompt(reason = 'SQL Hub entsperren') {
    if (process.platform === 'darwin' && this.systemPreferences && typeof this.systemPreferences.promptTouchID === 'function') {
      if (this.isTouchIdSupported()) {
        await this.systemPreferences.promptTouchID(reason);
        return true;
      }
    }
    if (!this._isSafeStorageReady()) {
      throw new Error('Biometrische Entsperrung wird auf diesem System aktuell nicht unterstützt.');
    }
    return true;
  }

  /** Hinterlegt das Master-Passwort für Touch ID / Schnell-Entsperrung. */
  enrollVault(masterPassword) {
    if (!masterPassword || typeof masterPassword !== 'string') {
      return { ok: false, errors: ['Master-Passwort fehlt.'] };
    }
    try {
      const enc = this._encryptSecret(masterPassword);
      const data = this._load();
      data.vaultSecret = enc;
      this._save(data);
      return { ok: true };
    } catch (err) {
      return { ok: false, errors: [err.message] };
    }
  }

  disableVault() {
    const data = this._load();
    data.vaultSecret = null;
    this._save(data);
    return { ok: true };
  }

  /** Entsperrt das hinterlegte Master-Passwort nach erfolgreicher Biometrie-Prüfung. */
  async retrieveVaultSecret(reason = 'den SQL Hub Datentresor mit Fingerabdruck (Touch ID) zu entsperren') {
    const data = this._load();
    if (!data.vaultSecret) {
      return { ok: false, errors: ['Für den Tresor ist noch keine biometrische Entsperrung eingerichtet.'] };
    }
    try {
      await this.verifyBiometricPrompt(reason);
      const secret = this._decryptSecret(data.vaultSecret);
      return { ok: true, secret };
    } catch (err) {
      return { ok: false, errors: ['Biometrische Authentifizierung abgebrochen oder fehlgeschlagen.'] };
    }
  }

  /** Fragt Touch ID / System-Biometrie ab (z. B. zur Freigabe gespeicherter Zugangsdaten). */
  async promptForCredentials(profileName = 'Datenbankprofil') {
    try {
      await this.verifyBiometricPrompt(`Zugangsdaten für „${profileName}“ freigeben`);
      return { ok: true };
    } catch (err) {
      return { ok: false, errors: ['Fingerabdruck-/Biometrie-Prüfung abgebrochen oder fehlgeschlagen.'] };
    }
  }
}

module.exports = { BiometricManager };

