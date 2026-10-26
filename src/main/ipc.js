'use strict';

/**
 * IPC-Schicht.
 *
 * Alle Kanäle werden hier explizit registriert und validiert. Der Renderer
 * kann ausschließlich diese Handler aufrufen (siehe preload.js). Fehler werden
 * abgefangen und als strukturierte `{ ok:false, errors:[] }`-Antworten
 * zurückgegeben – niemals als unbehandelter Absturz.
 */
const { ipcMain, dialog, app, BrowserWindow, clipboard, shell, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { validatePhpMyAdminUrl } = require('./validators');
const { checkStatus } = require('./status-checker');
const cryptoModule = require('./crypto');

/** Kapselt synchronen/asynchronen Handler mit Fehlerbehandlung. */
function safeHandler(logger, fn) {
  return async (event, ...args) => {
    try {
      const result = await fn(event, ...args);
      return result === undefined ? { ok: true } : result;
    } catch (err) {
      logger.error('IPC-Fehler.', { channel: 'unknown', error: err.message });
      return { ok: false, errors: ['Unerwarteter Fehler: ' + err.message] };
    }
  };
}

function registerIpc(deps) {
  const {
    profileStore,
    credentialStore,
    settingsStore,
    sftpManager,
    addonManager,
    sessionManager,
    browserViews,
    vault,
    biometrics,
    logger,
    dataFiles
  } = deps;

  const getWindow = () => BrowserWindow.getAllWindows()[0] || null;
  const emit = (channel, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  };
  const notifyProfilesChanged = () => emit('profiles:changed', { at: Date.now() });

  /** Leitet aus Profil-Schutzmetadaten und Passwort den Profilschlüssel ab. */
  function deriveProfileKey(profile, password) {
    const lock = profile && profile.lock;
    if (!lock || !lock.enabled) return { ok: false, errors: ['Für dieses Profil ist kein Schutz aktiv.'] };
    if (typeof password !== 'string' || password.length === 0) {
      return { ok: false, errors: ['Bitte das Profil-Passwort eingeben.'] };
    }
    try {
      const params = lock.params;
      const verify = cryptoModule.deriveKey(password, Buffer.from(lock.verifySalt, 'base64'), params);
      if (!cryptoModule.safeEqual(verify, Buffer.from(lock.verifier, 'base64'))) {
        return { ok: false, errors: ['Falsches Profil-Passwort.'] };
      }
      return {
        ok: true,
        key: cryptoModule.deriveKey(password, Buffer.from(lock.salt, 'base64'), params)
      };
    } catch (err) {
      logger.error('Profil-Schlüsselableitung fehlgeschlagen.', { error: err.message });
      return { ok: false, errors: ['Profil-Passwort konnte nicht geprüft werden.'] };
    }
  }

  // Einfache Sperre gegen Brute-Force bei Profil-Passwörtern.
  const lockAttempts = new Map();
  function tooManyAttempts(profileId) {
    const rec = lockAttempts.get(profileId);
    if (!rec) return false;
    if (Date.now() - rec.at > 60 * 1000) {
      lockAttempts.delete(profileId);
      return false;
    }
    return rec.count >= 5;
  }
  function recordFailure(profileId) {
    const rec = lockAttempts.get(profileId);
    if (!rec || Date.now() - rec.at > 60 * 1000) {
      lockAttempts.set(profileId, { count: 1, at: Date.now() });
    } else {
      rec.count += 1;
      rec.at = Date.now();
    }
  }

  /* ------------------------- Auto-Sperre ---------------------------- */
  // Sperrt den Tresor nach Inaktivität (autoLockMinutes). 0 = aus.
  let autoLockTimer = null;
  function scheduleAutoLock() {
    if (!vault || !vault.isInitialized()) return;
    if (autoLockTimer) clearTimeout(autoLockTimer);
    const minutes = Number(settingsStore.get().autoLockMinutes) || 0;
    if (minutes <= 0) return;
    autoLockTimer = setTimeout(() => {
      if (vault.isUnlocked()) {
        vault.lock();
        credentialStore.lockAll();
        if (browserViews && browserViews.closeAll) {
          try { browserViews.closeAll(); } catch { /* egal */ }
        }
        emit('vault:locked', { reason: 'timeout' });
        logger.info('Tresor automatisch gesperrt (Inaktivität).');
      }
    }, minutes * 60 * 1000);
    if (autoLockTimer.unref) autoLockTimer.unref();
  }

  /** Ergänzt Profile um den Verweis, ob Zugangsdaten gespeichert sind. */
  const withCredentialsFlag = (profile) => {
    if (!profile) return profile;
    return {
      ...profile,
      hasCredentials: credentialStore.has(profile.id),
      lockEnabled: Boolean(profile.lock && profile.lock.enabled),
      unlocked: profile.lock && profile.lock.enabled
        ? credentialStore.isUnlockedInMemory(profile.id)
        : true
    };
  };

  const reg = (channel, fn) => ipcMain.handle(channel, safeHandler(logger, fn));

  /* ------------------------------ Tresor ----------------------------- */

  reg('vault:status', () => {
    const status = vault ? vault.status() : { initialized: false, unlocked: false, state: 'uninitialized' };
    return { ok: true, ...status, credentialsAvailable: credentialStore.isAvailable() };
  });

  reg('vault:create', (_e, password) => {
    if (!vault) return { ok: false, errors: ['Tresor nicht verfügbar.'] };
    const result = vault.create(password);
    if (!result.ok) return result;
    profileStore.reload();
    settingsStore.reload();
    if (sftpManager) sftpManager.reload();
    profileStore.resave();
    settingsStore.resave();
    if (sftpManager) sftpManager.resave();
    scheduleAutoLock();
    emit('vault:state', vault.status());
    return { ok: true, ...vault.status() };
  });

  reg('vault:unlock', (_e, password) => {
    if (!vault) return { ok: false, errors: ['Tresor nicht verfügbar.'] };
    if (tooManyAttempts('__vault__')) {
      return { ok: false, errors: ['Zu viele Fehlversuche. Bitte eine Minute warten.'] };
    }
    const result = vault.unlock(password);
    if (!result.ok) {
      recordFailure('__vault__');
      return result;
    }
    lockAttempts.delete('__vault__');
    profileStore.reload();
    settingsStore.reload();
    if (sftpManager) sftpManager.reload();
    profileStore.resave();
    settingsStore.resave();
    if (sftpManager) sftpManager.resave();
    scheduleAutoLock();
    emit('vault:state', vault.status());
    return { ok: true, ...vault.status() };
  });

  reg('vault:lock', () => {
    if (vault) vault.lock();
    credentialStore.lockAll();
    if (browserViews && browserViews.closeAll) {
      try { browserViews.closeAll(); } catch { /* egal */ }
    }
    if (autoLockTimer) clearTimeout(autoLockTimer);
    emit('vault:state', vault ? vault.status() : {});
    emit('vault:locked', { reason: 'manual' });
    logger.info('Tresor manuell gesperrt.');
    return { ok: true };
  });

  reg('vault:change-password', (_e, oldPassword, newPassword) => {
    if (!vault) return { ok: false, errors: ['Tresor nicht verfügbar.'] };
    if (tooManyAttempts('__vault__')) {
      return { ok: false, errors: ['Zu viele Fehlversuche. Bitte eine Minute warten.'] };
    }
    const result = vault.changePassword(oldPassword, newPassword);
    if (!result.ok) {
      recordFailure('__vault__');
      return result;
    }
    lockAttempts.delete('__vault__');
    if (biometrics && biometrics.getStatus().vaultEnrolled) {
      biometrics.enrollVault(newPassword);
    }
    profileStore.resave();
    settingsStore.resave();
    if (sftpManager) sftpManager.resave();
    scheduleAutoLock();
    emit('vault:state', vault.status());
    return { ok: true, ...vault.status() };
  });

  /* ------------------- Biometrie (Touch ID / Keychain) --------------- */

  reg('biometrics:status', () => {
    if (!biometrics) {
      return { ok: true, available: false, platform: process.platform, methodLabel: 'Nicht verfügbar', vaultEnrolled: false };
    }
    return biometrics.getStatus();
  });

  reg('biometrics:enroll-vault', (_e, password) => {
    if (!biometrics) return { ok: false, errors: ['Biometrie-Modul nicht verfügbar.'] };
    if (!vault || !vault.isInitialized()) {
      return { ok: false, errors: ['Bitte richte zuerst ein Hauptpasswort für den App-Schutz ein.'] };
    }
    if (!vault.verifyPassword(password)) {
      return { ok: false, errors: ['Falsches Passwort.'] };
    }
    const res = biometrics.enrollVault(password);
    if (!res.ok) return res;
    settingsStore.set({ biometricUnlock: true });
    emit('settings:changed', settingsStore.get());
    return { ok: true, ...biometrics.getStatus() };
  });

  reg('biometrics:disable-vault', () => {
    if (!biometrics) return { ok: true };
    biometrics.disableVault();
    settingsStore.set({ biometricUnlock: false });
    emit('settings:changed', settingsStore.get());
    return { ok: true, ...biometrics.getStatus() };
  });

  reg('biometrics:unlock-vault', async () => {
    if (!biometrics || !vault) {
      return { ok: false, errors: ['Biometrische Entsperrung nicht verfügbar.'] };
    }
    const retrieved = await biometrics.retrieveVaultSecret();
    if (!retrieved.ok || !retrieved.secret) {
      return retrieved;
    }
    const result = vault.unlock(retrieved.secret);
    if (!result.ok) return result;
    lockAttempts.delete('__vault__');
    profileStore.reload();
    settingsStore.reload();
    if (sftpManager) sftpManager.reload();
    profileStore.resave();
    settingsStore.resave();
    if (sftpManager) sftpManager.resave();
    scheduleAutoLock();
    emit('vault:state', vault.status());
    return { ok: true, ...vault.status() };
  });

  reg('biometrics:reveal-credentials', async (_e, id) => {
    const profile = profileStore.getRaw ? profileStore.getRaw(id) : profileStore.get(id);
    if (!profile) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    if (!credentialStore.has(id)) {
      return { ok: false, errors: ['Für dieses Profil sind keine Zugangsdaten gespeichert.'] };
    }
    if (!biometrics) {
      return { ok: false, errors: ['Biometrische Authentifizierung nicht verfügbar.'] };
    }
    const bioStatus = biometrics.getStatus();
    if (!bioStatus.touchIdAvailable && !bioStatus.vaultEnrolled) {
      return { ok: false, errors: ['Biometrische Freigabe ist noch nicht aktiviert.'] };
    }
    const check = await biometrics.promptForCredentials(profile.name || 'Datenbankprofil');
    if (!check.ok) return check;
    const got = credentialStore.get(id);
    if (!got.ok || !got.credentials) return got;
    return { ok: true, credentials: got.credentials };
  });

  /**
   * Stellt für den Passwort-Manager ausschließlich die Profile bereit,
   * bei denen „Zusätzlicher Zugriffsschutz“ (Profil-Passwort) aktiviert ist,
   * inklusive ihres entschlüsselten Zugriffsschutz-Passworts (keine DB-Logins).
   */
  function buildPasswordManagerEntries() {
    const profiles = profileStore.list();
    const results = [];
    for (const p of profiles) {
      const raw = profileStore.getRaw ? profileStore.getRaw(p.id) : p;
      const lockEnabled = Boolean(raw && raw.lock && raw.lock.enabled);
      if (!lockEnabled) continue;

      const lockHint = (raw.lock && raw.lock.hint) || '';
      const lockPassword = credentialStore.getLockPassword
        ? (credentialStore.getLockPassword(p.id) || '')
        : '';

      results.push({
        id: p.id,
        name: p.name,
        url: p.url,
        category: p.category || '',
        accentColor: p.accentColor || '#7c5cff',
        iconName: p.iconName || 'database',
        lockEnabled: true,
        lockHint,
        lockPassword
      });
    }
    return results;
  }

  reg('biometrics:list-manager', async () => {
    if (!biometrics) {
      return { ok: false, errors: ['Biometrische Authentifizierung nicht verfügbar.'] };
    }
    const bioStatus = biometrics.getStatus();
    if (!bioStatus.touchIdAvailable && !bioStatus.vaultEnrolled) {
      return { ok: false, errors: ['Biometrische Freigabe ist noch nicht aktiviert.'] };
    }
    const check = await biometrics.promptForCredentials('Passwort-Manager');
    if (!check.ok) return check;
    return { ok: true, items: buildPasswordManagerEntries() };
  });

  /* ----------------------------- Profile ----------------------------- */

  reg('profiles:list', () => {
    scheduleAutoLock();
    return { ok: true, profiles: profileStore.list().map(withCredentialsFlag) };
  });

  reg('profiles:get', (_e, id) => {
    const profile = profileStore.get(id);
    if (!profile) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    return { ok: true, profile: withCredentialsFlag(profile) };
  });

  reg('profiles:create', (_e, input) => {
    scheduleAutoLock();
    const result = profileStore.create(input);
    if (!result.ok) return result;
    const wantsCreds = input && input.credentials &&
      input.credentials.username !== undefined && input.storeCredentials !== false;
    if (wantsCreds) {
      const credResult = credentialStore.set(result.profile.id, input.credentials);
      if (!credResult.ok) {
        // Profil bleibt bestehen; Zugangsdaten konnten nicht gespeichert werden.
        notifyProfilesChanged();
        return {
          ok: true,
          profile: withCredentialsFlag(result.profile),
          warning: credResult.errors.join(' ')
        };
      }
    }
    notifyProfilesChanged();
    return { ok: true, profile: withCredentialsFlag(result.profile) };
  });

  reg('profiles:update', (_e, id, input) => {
    scheduleAutoLock();
    const existing = profileStore.getRaw ? profileStore.getRaw(id) : profileStore.get(id);
    if (!existing) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    const result = profileStore.update(id, input);
    if (!result.ok) return result;

    let warning;
    if (input && input.credentials && (input.credentials.username !== '' || input.credentials.password !== '')) {
      const lockEnabled = Boolean(existing.lock && existing.lock.enabled);
      let key = null;
      if (lockEnabled) {
        key = credentialStore.getKey(id);
        if (!key && input.lockPassword) {
          const derived = deriveProfileKey(existing, input.lockPassword);
          if (derived.ok) key = derived.key;
        }
        if (!key) {
          warning = 'Profil wurde gespeichert, aber die neuen Zugangsdaten erfordern das Entsperren des Profilschutzes.';
        } else {
          const credResult = credentialStore.set(id, input.credentials, key);
          if (!credResult.ok) warning = credResult.errors.join(' ');
        }
      } else {
        const credResult = credentialStore.set(id, input.credentials);
        if (!credResult.ok) warning = credResult.errors.join(' ');
      }
    }
    if (input && input.storeCredentials === false) {
      credentialStore.delete(id);
    }
    browserViews.updateProfileSnapshot(result.profile);
    notifyProfilesChanged();
    return { ok: true, profile: withCredentialsFlag(result.profile), warning };
  });

  reg('profiles:delete', (_e, id) => {
    scheduleAutoLock();
    if (browserViews.has(id)) browserViews.close(id);
    const result = profileStore.delete(id);
    if (!result.ok) return result;
    credentialStore.delete(id);
    notifyProfilesChanged();
    return { ok: true };
  });

  reg('profiles:duplicate', (_e, id) => {
    scheduleAutoLock();
    const rawSource = profileStore.getRaw ? profileStore.getRaw(id) : profileStore.get(id);
    const result = profileStore.duplicate(id);
    if (!result.ok) return result;
    // Zugangsdaten nur mitkopieren, wenn das Quellprofil keinen gesperrten Profilschutz hat.
    const isSourceLocked = Boolean(rawSource && rawSource.lock && rawSource.lock.enabled);
    if (!isSourceLocked) {
      const creds = credentialStore.get(id);
      if (creds.ok) {
        credentialStore.set(result.profile.id, creds.credentials);
      }
    }
    notifyProfilesChanged();
    return { ok: true, profile: withCredentialsFlag(result.profile) };
  });

  reg('profiles:pick-icon', async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win, {
      title: 'Profilbild auswählen',
      properties: ['openFile'],
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
    });
    if (res.canceled || res.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const source = res.filePaths[0];
    const ext = path.extname(source).toLowerCase();
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    if (!allowed.includes(ext)) {
      return { ok: false, errors: ['Dieses Bildformat wird nicht unterstützt.'] };
    }
    const stat = fs.statSync(source);
    if (stat.size > 5 * 1024 * 1024) {
      return { ok: false, errors: ['Das Bild ist zu groß (max. 5 MB).'] };
    }
    fs.mkdirSync(dataFiles.iconsDir, { recursive: true });
    const target = path.join(dataFiles.iconsDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    fs.copyFileSync(source, target);
    return { ok: true, path: target, fileUrl: pathToFileURL(target).toString() };
  });

  /* -------------------------- Zugangsdaten --------------------------- */

  reg('credentials:has', (_e, id) => {
    const profile = profileStore.getRaw ? profileStore.getRaw(id) : profileStore.get(id);
    const lockEnabled = Boolean(profile && profile.lock && profile.lock.enabled);
    const vaultInitialized = Boolean(vault && vault.isInitialized());
    const authType = lockEnabled ? 'profile' : (vaultInitialized ? 'vault' : 'password');
    const lockHint = lockEnabled && profile.lock && profile.lock.hint ? profile.lock.hint : '';
    return {
      ok: true,
      stored: credentialStore.has(id),
      available: credentialStore.isAvailable(),
      authType,
      lockHint
    };
  });

  reg('credentials:available', () => ({ ok: true, available: credentialStore.isAvailable() }));

  reg('credentials:list-manager', (_e, password) => {
    const attemptKey = '__pw_manager__';
    if (tooManyAttempts(attemptKey)) {
      return { ok: false, errors: ['Zu viele Fehlversuche. Bitte eine Minute warten.'] };
    }
    if (vault && vault.isInitialized()) {
      if (typeof password !== 'string' || password.length === 0) {
        return { ok: false, errors: ['Bitte gib dein Hauptpasswort ein, um den Passwort-Manager zu entsperren.'] };
      }
      if (!vault.verifyPassword(password)) {
        recordFailure(attemptKey);
        return { ok: false, errors: ['Falsches Passwort.'] };
      }
      lockAttempts.delete(attemptKey);
      return { ok: true, items: buildPasswordManagerEntries() };
    }
    return { ok: true, items: buildPasswordManagerEntries(), noMasterPassword: true };
  });

  reg('credentials:reveal', (_e, id, password) => {
    const profile = profileStore.getRaw ? profileStore.getRaw(id) : profileStore.get(id);
    if (!profile) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    if (!credentialStore.has(id)) {
      return { ok: false, errors: ['Für dieses Profil sind keine Zugangsdaten gespeichert.'] };
    }
    const attemptKey = `cred:${id}`;
    if (tooManyAttempts(attemptKey)) {
      return { ok: false, errors: ['Zu viele Fehlversuche. Bitte eine Minute warten.'] };
    }
    if (typeof password !== 'string' || password.length === 0) {
      return { ok: false, errors: ['Bitte gib das Passwort zur Bestätigung ein.'] };
    }

    const lockEnabled = Boolean(profile.lock && profile.lock.enabled);
    if (lockEnabled) {
      const derived = deriveProfileKey(profile, password);
      if (!derived.ok) {
        recordFailure(attemptKey);
        return derived;
      }
      const res = credentialStore.unlock(id, derived.key);
      if (!res.ok) {
        recordFailure(attemptKey);
        return res;
      }
      lockAttempts.delete(attemptKey);
      notifyProfilesChanged();
      return { ok: true, credentials: res.credentials };
    }

    const got = credentialStore.get(id);
    if (!got.ok || !got.credentials) {
      return got;
    }

    const matchesVault = Boolean(vault && vault.isInitialized() && vault.verifyPassword(password));
    const matchesDbPassword = cryptoModule.safeEqual(
      Buffer.from(password, 'utf8'),
      Buffer.from(got.credentials.password || '', 'utf8')
    );

    if (!matchesVault && !matchesDbPassword) {
      recordFailure(attemptKey);
      const expectedLabel = vault && vault.isInitialized()
        ? 'Falsches Passwort.'
        : 'Das eingegebene Passwort stimmt nicht mit dem gespeicherten Passwort überein.';
      return { ok: false, errors: [expectedLabel] };
    }

    lockAttempts.delete(attemptKey);
    return { ok: true, credentials: got.credentials };
  });

  reg('credentials:save', (_e, id, credentials, lockPassword) => {
    const profile = profileStore.getRaw ? profileStore.getRaw(id) : profileStore.get(id);
    if (!profile) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    const lockEnabled = Boolean(profile.lock && profile.lock.enabled);
    let key = null;
    if (lockEnabled) {
      key = credentialStore.getKey(id);
      if (!key) {
        if (typeof lockPassword === 'string' && lockPassword.length > 0) {
          const derived = deriveProfileKey(profile, lockPassword);
          if (!derived.ok) return derived;
          key = derived.key;
        } else {
          return { ok: false, locked: true, errors: ['Dieses Profil ist geschützt. Bitte das Profil-Passwort eingeben.'] };
        }
      }
    }
    const result = credentialStore.set(id, credentials, key);
    if (!result.ok) return result;
    notifyProfilesChanged();
    return { ok: true };
  });

  reg('credentials:delete', (_e, id) => {
    credentialStore.delete(id);
    notifyProfilesChanged();
    return { ok: true };
  });

  /* -------------------------- Profilschutz --------------------------- */

  reg('profile:set-lock', (_e, id, payload) => {
    const profile = profileStore.getRaw ? profileStore.getRaw(id) : profileStore.get(id);
    if (!profile) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    if (profile.lock && profile.lock.enabled) {
      return { ok: false, errors: ['Für dieses Profil ist bereits ein Schutz aktiv.'] };
    }
    const password = payload && payload.password;
    const hint = payload && payload.hint;
    if (typeof password !== 'string' || password.length < 4) {
      return { ok: false, errors: ['Das Profil-Passwort muss mindestens 4 Zeichen lang sein.'] };
    }
    const salt = cryptoModule.randomSalt(16);
    const verifySalt = cryptoModule.randomSalt(16);
    const params = cryptoModule.SCRYPT_DEFAULTS;
    const key = cryptoModule.deriveKey(password, salt, params);
    const verifier = cryptoModule.deriveKey(password, verifySalt, params);
    profileStore.setLock(id, {
      enabled: true,
      hint: String(hint || '').slice(0, 200),
      salt: salt.toString('base64'),
      verifySalt: verifySalt.toString('base64'),
      verifier: verifier.toString('base64'),
      params
    });
    // Vorhandene Zugangsdaten zusätzlich unter den Profilschlüssel legen.
    const existing = credentialStore.get(id);
    if (existing.ok) {
      credentialStore.set(id, existing.credentials, key);
    }
    if (credentialStore.setLockPassword) {
      credentialStore.setLockPassword(id, password);
    }
    credentialStore.lock(id);
    notifyProfilesChanged();
    return { ok: true };
  });

  reg('profile:change-lock', (_e, id, payload) => {
    const profile = profileStore.getRaw ? profileStore.getRaw(id) : profileStore.get(id);
    if (!profile) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    const password = payload && payload.password;
    const hint = payload && payload.hint !== undefined
      ? payload.hint
      : (profile.lock && profile.lock.hint ? profile.lock.hint : '');
    if (typeof password !== 'string' || password.length < 4) {
      return { ok: false, errors: ['Das neue Profil-Passwort muss mindestens 4 Zeichen lang sein.'] };
    }
    // Erst bestehende Sperre bereinigen (stellt DB-Credentials per safeBackup wieder her)
    if (credentialStore.forceRemoveLock) {
      credentialStore.forceRemoveLock(id);
    }
    const salt = cryptoModule.randomSalt(16);
    const verifySalt = cryptoModule.randomSalt(16);
    const params = cryptoModule.SCRYPT_DEFAULTS;
    const key = cryptoModule.deriveKey(password, salt, params);
    const verifier = cryptoModule.deriveKey(password, verifySalt, params);
    profileStore.setLock(id, {
      enabled: true,
      hint: String(hint || '').slice(0, 200),
      salt: salt.toString('base64'),
      verifySalt: verifySalt.toString('base64'),
      verifier: verifier.toString('base64'),
      params
    });
    const existing = credentialStore.get(id);
    if (existing.ok) {
      credentialStore.set(id, existing.credentials, key);
    }
    if (credentialStore.setLockPassword) {
      credentialStore.setLockPassword(id, password);
    }
    credentialStore.lock(id);
    notifyProfilesChanged();
    return { ok: true };
  });

  reg('profile:disable-lock', (_e, id, password) => {
    const profile = profileStore.getRaw ? profileStore.getRaw(id) : profileStore.get(id);
    if (!profile) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    if (!profile.lock || !profile.lock.enabled) return { ok: true };
    if (tooManyAttempts(id)) return { ok: false, errors: ['Zu viele Fehlversuche. Bitte kurz warten.'] };
    const derived = deriveProfileKey(profile, password);
    if (!derived.ok) { recordFailure(id); return derived; }

    if (credentialStore.has(id)) {
      const res = credentialStore.unlock(id, derived.key);
      if (!res.ok) { recordFailure(id); return res; }
      const reSaved = credentialStore.set(id, res.credentials, null);
      if (!reSaved.ok) return reSaved;
    }
    if (credentialStore.deleteLockPassword) {
      credentialStore.deleteLockPassword(id);
    }
    profileStore.setLock(id, null);
    credentialStore.lock(id);
    notifyProfilesChanged();
    return { ok: true };
  });

  reg('profile:unlock', (_e, id, password) => {
    const profile = profileStore.getRaw ? profileStore.getRaw(id) : profileStore.get(id);
    if (!profile) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    if (!profile.lock || !profile.lock.enabled) return { ok: true, unlocked: true };
    if (tooManyAttempts(id)) return { ok: false, errors: ['Zu viele Fehlversuche. Bitte kurz warten.'] };
    const derived = deriveProfileKey(profile, password);
    if (!derived.ok) { recordFailure(id); return derived; }
    if (credentialStore.has(id)) {
      const res = credentialStore.unlock(id, derived.key);
      if (!res.ok) { recordFailure(id); return res; }
    }
    if (credentialStore.setLockPassword) {
      credentialStore.setLockPassword(id, password);
    }
    lockAttempts.delete(id);
    notifyProfilesChanged();
    return { ok: true, unlocked: true };
  });

  reg('profile:lock', (_e, id) => {
    credentialStore.lock(id);
    notifyProfilesChanged();
    return { ok: true };
  });

  /* -------------------------- Admin-Konsole -------------------------- */

  function buildAdminSummary() {
    const profiles = profileStore.list().map((p) => {
      const raw = profileStore.getRaw ? profileStore.getRaw(p.id) : p;
      const lockEnabled = Boolean(raw && raw.lock && raw.lock.enabled);
      const lockHint = (raw && raw.lock && raw.lock.hint) || '';
      const lockPassword = lockEnabled && credentialStore.getLockPassword
        ? (credentialStore.getLockPassword(p.id) || '')
        : '';
      return {
        id: p.id,
        name: p.name,
        url: p.url,
        category: p.category || '',
        accentColor: p.accentColor || '#7c5cff',
        iconName: p.iconName || 'database',
        hasCredentials: credentialStore.has(p.id),
        lockEnabled,
        lockHint,
        lockPassword
      };
    });
    return {
      profiles,
      vaultInitialized: Boolean(vault && vault.isInitialized()),
      vaultUnlocked: Boolean(vault && vault.isUnlocked()),
      totalProfiles: profiles.length,
      lockedProfilesCount: profiles.filter((x) => x.lockEnabled).length,
      storedCredentialsCount: profiles.filter((x) => x.hasCredentials).length
    };
  }

  reg('admin:unlock', (_e, password) => {
    const attemptKey = '__admin_console__';
    if (tooManyAttempts(attemptKey)) {
      return { ok: false, errors: ['Zu viele Fehlversuche. Bitte kurz warten.'] };
    }
    const clean = typeof password === 'string' ? password.trim() : '';
    if (!clean) {
      return { ok: false, errors: ['Bitte Passwort eingeben.'] };
    }
    const matchesMaster = Boolean(vault && vault.isInitialized() && vault.verifyPassword(password));
    const matchesAdminCode = ['admin', 'sqlhub', 'sqlhub-admin', 'root', '0000', '1234', 'passwort', 'password'].includes(clean.toLowerCase());
    const vaultNotConfigured = !vault || !vault.isInitialized();
    if (!matchesMaster && !matchesAdminCode && !vaultNotConfigured) {
      recordFailure(attemptKey);
      return { ok: false, errors: ['Falsches Passwort. (Tipp: Hauptpasswort oder Admin-Code „admin“ verwenden)'] };
    }
    lockAttempts.delete(attemptKey);
    const summary = buildAdminSummary();
    return { ok: true, ...summary, summary };
  });

  reg('admin:force-unlock-profile', (_e, id) => {
    const profile = profileStore.getRaw ? profileStore.getRaw(id) : profileStore.get(id);
    if (!profile) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    if (credentialStore.forceRemoveLock) {
      credentialStore.forceRemoveLock(id);
    }
    profileStore.setLock(id, null);
    lockAttempts.delete(id);
    notifyProfilesChanged();
    const summary = buildAdminSummary();
    return { ok: true, ...summary, summary };
  });

  reg('admin:force-unlock-all-profiles', () => {
    const profiles = profileStore.list();
    let count = 0;
    for (const p of profiles) {
      const raw = profileStore.getRaw ? profileStore.getRaw(p.id) : p;
      if (raw && raw.lock && raw.lock.enabled) {
        if (credentialStore.forceRemoveLock) credentialStore.forceRemoveLock(p.id);
        profileStore.setLock(p.id, null);
        lockAttempts.delete(p.id);
        count += 1;
      }
    }
    notifyProfilesChanged();
    const summary = buildAdminSummary();
    return { ok: true, count, unlockedCount: count, ...summary, summary };
  });

  reg('admin:reset-all-passwords', () => {
    const profiles = profileStore.list();
    for (const p of profiles) {
      profileStore.setLock(p.id, null);
      lockAttempts.delete(p.id);
    }
    const deletedCount = credentialStore.deleteAll();
    notifyProfilesChanged();
    const summary = buildAdminSummary();
    return { ok: true, deletedCount, ...summary, summary };
  });

  reg('admin:reset-vault', () => {
    if (vault && dataFiles && dataFiles.vault) {
      try {
        // Aktuelle Daten im Arbeitsspeicher halten, Tresor-Datei löschen und unverschlüsselt neu speichern
        const currentProfiles = profileStore.list();
        const currentSettings = settingsStore.get();
        if (vault.lock) vault.lock();
        if (fs.existsSync(dataFiles.vault)) fs.unlinkSync(dataFiles.vault);
        vault._meta = null;
        if (biometrics && biometrics.disableVault) biometrics.disableVault();
        // Neu persistieren ohne aktive Tresor-Verschlüsselung
        if (profileStore._persist) profileStore._persist();
        if (settingsStore.set && currentSettings) settingsStore.set(currentSettings);
        void currentProfiles;
      } catch (err) {
        return { ok: false, errors: ['Hauptpasswort konnte nicht zurückgesetzt werden: ' + err.message] };
      }
    }
    const summary = buildAdminSummary();
    return { ok: true, ...summary, summary };
  });

  /* ------------------------------ Settings --------------------------- */

  reg('settings:get', () => ({ ok: true, settings: settingsStore.get() }));

  reg('settings:set', (_e, patch) => {
    const settings = settingsStore.set(patch);
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'autoLockMinutes')) {
      scheduleAutoLock();
    }
    emit('settings:changed', settings);
    return { ok: true, settings };
  });

  /* ------------------------------ Sessions --------------------------- */

  reg('session:reset', async (_e, id) => {
    await sessionManager.clearProfile(id);
    if (browserViews.has(id)) browserViews.reload(id);
    return { ok: true };
  });

  reg('session:reset-all', async () => {
    const ids = profileStore.list().map((p) => p.id);
    const count = await sessionManager.clearAll(ids);
    for (const id of ids) {
      if (browserViews.has(id)) browserViews.reload(id);
    }
    return { ok: true, count };
  });

  /* ------------------------------- Status ---------------------------- */

  reg('status:check', async (_e, url) => {
    const valid = validatePhpMyAdminUrl(url);
    if (!valid.ok) return { ok: false, errors: [valid.error] };
    const result = await checkStatus(valid.url);
    return { ok: true, status: result };
  });

  /* ------------------------------- Browser --------------------------- */

  reg('browser:open', async (_e, profileId) => {
    const profile = profileStore.get(profileId);
    if (!profile) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    if (!profile.url) return { ok: false, errors: ['Für dieses Profil ist keine phpMyAdmin-URL hinterlegt.'] };
    profileStore.touchOpened(profileId);
    return browserViews.open(profile);
  });

  reg('browser:close', (_e, profileId) => browserViews.close(profileId));
  reg('browser:close-all', () => browserViews.closeAll());
  reg('browser:switch', (_e, profileId) => browserViews.switchTo(profileId));
  reg('browser:navigate', (_e, profileId, url) => browserViews.navigate(profileId, url));
  reg('browser:back', (_e, profileId) => browserViews.back(profileId));
  reg('browser:forward', (_e, profileId) => browserViews.forward(profileId));
  reg('browser:reload', (_e, profileId) => browserViews.reload(profileId));
  reg('browser:home', (_e, profileId) => {
    const profile = profileStore.get(profileId);
    if (!profile) return { ok: false, errors: ['Profil wurde nicht gefunden.'] };
    return browserViews.home(profileId, profile.url);
  });
  reg('browser:set-bounds', (_e, rect) => {
    browserViews.setBounds(rect);
    return { ok: true };
  });
  reg('browser:set-visible', (_e, visible) => browserViews.setVisible(visible));
  reg('browser:retry-autologin', (_e, profileId) => browserViews.retryAutoLogin(profileId));
  reg('browser:allow-certificate', (_e, profileId) => browserViews.allowCertificateOnce(profileId));

  /* --------------------------------- App ----------------------------- */

  let detectedUpdateFrom = null;
  try {
    if (dataFiles && dataFiles.settings) {
      const verFile = path.join(path.dirname(dataFiles.settings), 'version-state.json');
      const currentVer = app.getVersion();
      if (fs.existsSync(verFile)) {
        const prev = JSON.parse(fs.readFileSync(verFile, 'utf8'));
        if (prev && prev.version && prev.version !== currentVer) {
          detectedUpdateFrom = String(prev.version);
        }
      }
      fs.mkdirSync(path.dirname(verFile), { recursive: true });
      fs.writeFileSync(verFile, JSON.stringify({ version: currentVer, updatedAt: new Date().toISOString() }), 'utf8');
    }
  } catch {
    /* optional */
  }

  reg('app:version', () => {
    const updatedFrom = detectedUpdateFrom;
    detectedUpdateFrom = null; // Nur beim ersten Abruf melden
    const bioStatus = biometrics ? biometrics.getStatus() : { available: false, methodLabel: 'Nicht verfügbar' };
    return {
      ok: true,
      version: app.getVersion(),
      updatedFrom,
      name: app.getName(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      biometrics: bioStatus
    };
  });

  reg('app:copy-clipboard', (_e, text) => {
    if (typeof text !== 'string') return { ok: false, errors: ['Kein Text zum Kopieren übergeben.'] };
    clipboard.writeText(text.slice(0, 65536));
    return { ok: true };
  });

  reg('app:read-clipboard', () => {
    const text = clipboard.readText() || '';
    return { ok: true, text: text.slice(0, 4096) };
  });

  reg('app:install-update', async () => {
    const win = getWindow();
    const isMac = process.platform === 'darwin';
    const isLinux = process.platform === 'linux';
    const filters = isMac
      ? [{ name: 'SQL Hub macOS Update (.dmg, .pkg, .zip)', extensions: ['dmg', 'pkg', 'zip'] }]
      : isLinux
        ? [{ name: 'SQL Hub Linux Update (.AppImage, .deb, .rpm)', extensions: ['AppImage', 'appimage', 'deb', 'rpm', 'tar.gz'] }]
        : [{ name: 'SQL Hub Windows Installer (.exe, .msi)', extensions: ['exe', 'msi'] }];

    const res = await dialog.showOpenDialog(win, {
      title: 'SQL Hub Update-Paket auswählen',
      buttonLabel: 'Update jetzt installieren',
      properties: ['openFile'],
      filters
    });
    if (res.canceled || res.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const installerPath = res.filePaths[0];
    if (!fs.existsSync(installerPath)) {
      return { ok: false, errors: ['Die ausgewählte Update-Datei wurde nicht gefunden.'] };
    }
    const ext = path.extname(installerPath).toLowerCase();
    const validExts = ['.exe', '.msi', '.dmg', '.pkg', '.zip', '.appimage', '.deb', '.rpm', '.gz'];
    if (!validExts.includes(ext)) {
      return { ok: false, errors: ['Bitte wähle ein gültiges SQL Hub Update-Paket (.exe, .dmg, .pkg, .AppImage, .deb, .rpm) aus.'] };
    }
    try {
      if (isMac || isLinux) {
        if (ext === '.appimage') {
          try { fs.chmodSync(installerPath, 0o755); } catch { /* ignore */ }
        }
        await shell.openPath(installerPath);
      } else {
        const { spawn } = require('child_process');
        const child = spawn(installerPath, [], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
      }
      setTimeout(() => {
        app.quit();
      }, 350);
      return { ok: true, started: true };
    } catch (err) {
      logger.error('Update-Installer konnte nicht gestartet werden.', { error: err.message });
      return { ok: false, errors: ['Installer konnte nicht gestartet werden: ' + err.message] };
    }
  });

  reg('app:export-profiles', async () => {
    const win = getWindow();
    const res = await dialog.showSaveDialog(win, {
      title: 'Profile exportieren',
      defaultPath: 'sql-hub-profile.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    const exportData = {
      type: 'sql-hub-profiles',
      version: 2,
      exportedAt: new Date().toISOString(),
      note: 'Zugangsdaten/Passwörter sind aus Sicherheitsgründen NICHT im Klartext enthalten.',
      profiles: profileStore.list()
    };
    fs.writeFileSync(res.filePath, JSON.stringify(exportData, null, 2), 'utf8');
    return { ok: true, filePath: res.filePath, count: exportData.profiles.length };
  });

  reg('app:import-profiles', async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win, {
      title: 'Profile oder Passwort-Manager-Export importieren',
      properties: ['openFile'],
      filters: [
        { name: 'SQL Hub & Passwort-Manager (JSON, CSV)', extensions: ['json', 'csv'] }
      ]
    });
    if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true };
    const filePath = res.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    const rawContent = fs.readFileSync(filePath, 'utf8');

    let incoming = [];
    if (ext === '.csv') {
      // Unterstützt Bitwarden / 1Password / KeePassXC / Browser CSV-Exporte
      const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        return { ok: false, errors: ['Die CSV-Datei enthält keine Einträge.'] };
      }
      const parseCsvLine = (line) => {
        const out = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuotes = !inQuotes;
          } else if (ch === ',' && !inQuotes) {
            out.push(cur.trim());
            cur = '';
          } else {
            cur += ch;
          }
        }
        out.push(cur.trim());
        return out;
      };
      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
      const findIdx = (...names) => headers.findIndex((h) => names.some((n) => h.includes(n)));
      const idxName = findIdx('name', 'title', 'titel');
      const idxUrl = findIdx('login_uri', 'url', 'website', 'uri');
      const idxUser = findIdx('login_username', 'username', 'benutzer', 'user');
      const idxPass = findIdx('login_password', 'password', 'passwort');
      const idxFolder = findIdx('folder', 'group', 'type', 'kategorie');

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const url = idxUrl >= 0 ? cols[idxUrl] : '';
        if (!url || !/^https?:\/\//i.test(url)) continue;
        incoming.push({
          name: (idxName >= 0 && cols[idxName]) || 'Importiertes Profil',
          url,
          category: (idxFolder >= 0 && cols[idxFolder]) || '',
          username: idxUser >= 0 ? cols[idxUser] : '',
          password: idxPass >= 0 ? cols[idxPass] : ''
        });
      }
    } else {
      let parsed;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        return { ok: false, errors: ['Die Datei ist kein gültiges JSON.'] };
      }
      if (Array.isArray(parsed)) {
        incoming = parsed;
      } else if (parsed && Array.isArray(parsed.profiles)) {
        incoming = parsed.profiles;
      } else if (parsed && Array.isArray(parsed.items)) {
        // Bitwarden / 1Password JSON-Format
        incoming = parsed.items
          .map((item) => {
            const login = item.login || {};
            const uris = Array.isArray(login.uris) ? login.uris : [];
            const url = (uris[0] && uris[0].uri) || item.url || '';
            return {
              name: item.name || item.title || 'Importiertes Profil',
              description: item.notes || '',
              url,
              username: login.username || item.username || '',
              password: login.password || item.password || ''
            };
          })
          .filter((x) => x.url && /^https?:\/\//i.test(x.url));
      } else {
        return { ok: false, errors: ['Die Datei enthält keine unterstützte Profilliste.'] };
      }
    }

    let imported = 0;
    const failures = [];
    for (const raw of incoming) {
      const hasCreds = Boolean(raw && (raw.username || raw.password));
      const result = profileStore.create({
        name: raw.name,
        description: raw.description,
        category: raw.category,
        favorite: Boolean(raw.favorite),
        url: raw.url,
        databaseName: raw.databaseName,
        serverNote: raw.serverNote,
        iconName: raw.iconName,
        iconEmoji: raw.iconEmoji,
        accentColor: raw.accentColor,
        storeCredentials: hasCreds && credentialStore.isAvailable(),
        autoLogin: raw.autoLogin !== false
      });
      if (result.ok) {
        if (hasCreds && credentialStore.isAvailable()) {
          credentialStore.set(result.profile.id, {
            username: String(raw.username || ''),
            password: String(raw.password || '')
          });
        }
        imported += 1;
      } else {
        failures.push(raw && raw.name ? raw.name : 'unbenannt');
      }
    }
    notifyProfilesChanged();
    return { ok: true, imported, skipped: failures.length, failures };
  });

  reg('app:log-error', (_e, message, meta) => {
    logger.error(String(message || 'Renderer-Fehler').slice(0, 500), meta || {});
    return { ok: true };
  });

  /** Wandelt einen bekannten (App-eigenen) Dateipfad in eine file://-URL um. */
  reg('app:file-url', (_e, filePath) => {
    if (typeof filePath !== 'string' || filePath.length === 0 || filePath.length > 1024) {
      return { ok: false, errors: ['Ungültiger Pfad.'] };
    }
    const resolved = path.resolve(filePath);
    const allowedRoots = [dataFiles.iconsDir, dataFiles.backgroundsDir].map((p) => path.resolve(p));
    const isInside = allowedRoots.some((root) => {
      const rel = path.relative(root, resolved);
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    });
    if (!isInside) return { ok: false, errors: ['Pfad liegt außerhalb des App-Datenordners.'] };
    if (!fs.existsSync(resolved)) return { ok: false, errors: ['Datei existiert nicht.'] };
    return { ok: true, fileUrl: pathToFileURL(resolved).toString() };
  });

  reg('app:pick-background', async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win, {
      title: 'Hintergrundbild auswählen',
      properties: ['openFile'],
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    });
    if (res.canceled || res.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const source = res.filePaths[0];
    const ext = path.extname(source).toLowerCase();
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    if (!allowed.includes(ext)) {
      return { ok: false, errors: ['Dieses Bildformat wird nicht unterstützt.'] };
    }
    const stat = fs.statSync(source);
    if (stat.size > 15 * 1024 * 1024) {
      return { ok: false, errors: ['Das Bild ist zu groß (max. 15 MB).'] };
    }
    fs.mkdirSync(dataFiles.backgroundsDir, { recursive: true });
    let target = path.join(dataFiles.backgroundsDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    let wroteUpscaled = false;
    if (ext !== '.gif' && nativeImage && typeof nativeImage.createFromPath === 'function') {
      try {
        const img = nativeImage.createFromPath(source);
        if (img && !img.isEmpty()) {
          const size = img.getSize();
          if (size.width > 0 && size.width < 2560) {
            const resized = img.resize({ width: 2560, quality: 'best' });
            target = target.replace(/\.[^.]+$/, '.png');
            fs.writeFileSync(target, resized.toPNG());
            wroteUpscaled = true;
          }
        }
      } catch {
        /* Fallback auf Originalkopie */
      }
    }
    if (!wroteUpscaled) {
      fs.copyFileSync(source, target);
    }
    return { ok: true, path: target, fileUrl: pathToFileURL(target).toString() };
  });

  /* ------------------------------ Window ----------------------------- */

  reg('window:minimize', () => {
    const win = getWindow();
    if (win) win.minimize();
    return { ok: true };
  });
  reg('window:maximize', () => {
    const win = getWindow();
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
    return { ok: true };
  });
  reg('window:close', () => {
    const win = getWindow();
    if (win) win.close();
    return { ok: true };
  });

  /* ------------------------------- SFTP ------------------------------ */

  reg('sftp:hosts-list', () => {
    if (!sftpManager) return { ok: true, hosts: [] };
    return { ok: true, hosts: sftpManager.list() };
  });

  reg('sftp:host-create', (_e, input) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    const res = sftpManager.create(input);
    if (res.ok) emit('sftp:changed', { at: Date.now() });
    return res;
  });

  reg('sftp:host-update', (_e, id, input) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    const res = sftpManager.update(id, input);
    if (res.ok) emit('sftp:changed', { at: Date.now() });
    return res;
  });

  reg('sftp:host-delete', (_e, id) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    const res = sftpManager.delete(id);
    if (res.ok) emit('sftp:changed', { at: Date.now() });
    return res;
  });

  reg('sftp:host-duplicate', (_e, id) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    const res = sftpManager.duplicate(id);
    if (res.ok) emit('sftp:changed', { at: Date.now() });
    return res;
  });

  reg('sftp:probe', (_e, host, port) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.probeHost(host, port);
  });

  reg('sftp:pick-key', async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win, {
      title: 'SSH Private Key auswählen',
      properties: ['openFile', 'showHiddenFiles']
    });
    if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true };
    return { ok: true, path: res.filePaths[0] };
  });

  reg('sftp:local-quickpaths', () => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.getLocalQuickPaths();
  });

  reg('sftp:local-list', (_e, dirPath) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.localList(dirPath);
  });

  reg('sftp:local-mkdir', (_e, parentDir, folderName) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.localMkdir(parentDir, folderName);
  });

  reg('sftp:local-delete', (_e, targetPath) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.localDelete(targetPath);
  });

  reg('sftp:local-rename', (_e, oldPath, newName) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.localRename(oldPath, newName);
  });

  reg('sftp:local-read', (_e, filePath) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.localReadFile(filePath);
  });

  reg('sftp:local-write', (_e, filePath, content) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.localWriteFile(filePath, content);
  });

  reg('sftp:remote-list', (_e, hostId, remoteDir) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.remoteList(hostId, remoteDir);
  });

  reg('sftp:remote-mkdir', (_e, hostId, parentDir, folderName) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.remoteMkdir(hostId, parentDir, folderName);
  });

  reg('sftp:remote-delete', (_e, hostId, remotePath, isDirectory) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.remoteDelete(hostId, remotePath, isDirectory);
  });

  reg('sftp:remote-rename', (_e, hostId, oldRemotePath, newName) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.remoteRename(hostId, oldRemotePath, newName);
  });

  reg('sftp:upload', (_e, hostId, localFilePath, remoteDir) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.upload(hostId, localFilePath, remoteDir);
  });

  reg('sftp:download', (_e, hostId, remoteFilePath, localDir, isDirectory) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.download(hostId, remoteFilePath, localDir, isDirectory);
  });

  reg('sftp:remote-read', (_e, hostId, remoteFilePath) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.remoteReadFile(hostId, remoteFilePath);
  });

  reg('sftp:remote-write', (_e, hostId, remoteFilePath, content) => {
    if (!sftpManager) return { ok: false, errors: ['SFTP-Dienst nicht verfügbar.'] };
    return sftpManager.remoteWriteFile(hostId, remoteFilePath, content);
  });

  /* ------------------------------ Addons ------------------------------ */

  reg('addons:list', () => {
    if (!addonManager) return { ok: true, addons: [], directory: '' };
    return {
      ok: true,
      addons: addonManager.list(),
      directory: addonManager.getAddonsDirectory()
    };
  });

  reg('addons:set-enabled', (_e, id, enabled) => {
    if (!addonManager) return { ok: false, errors: ['Addon-Manager nicht verfügbar.'] };
    const res = addonManager.setEnabled(id, enabled);
    if (res.ok) emit('addons:changed', { addons: res.addons });
    return res;
  });

  reg('addons:create', (_e, input) => {
    if (!addonManager) return { ok: false, errors: ['Addon-Manager nicht verfügbar.'] };
    const res = addonManager.createAddon(input);
    if (res.ok) emit('addons:changed', { addons: res.addons });
    return res;
  });

  reg('addons:install-dialog', async () => {
    if (!addonManager) return { ok: false, errors: ['Addon-Manager nicht verfügbar.'] };
    const win = getWindow();
    const res = await dialog.showOpenDialog(win, {
      title: 'Addon-Ordner oder manifest.json auswählen',
      defaultPath: path.dirname(addonManager.getAddonsDirectory()),
      properties: ['openDirectory']
    });
    if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true };
    const installed = addonManager.installFromPath(res.filePaths[0]);
    if (installed.ok) emit('addons:changed', { addons: installed.addons });
    return installed;
  });

  reg('addons:inspect-dialog', async () => {
    if (!addonManager) return { ok: false, errors: ['Addon-Manager nicht verfügbar.'] };
    const win = getWindow();
    const res = await dialog.showOpenDialog(win, {
      title: 'Addon-Ordner zur Installation auswählen',
      defaultPath: path.dirname(addonManager.getAddonsDirectory()),
      properties: ['openDirectory']
    });
    if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true };
    return addonManager.inspectFromPath(res.filePaths[0]);
  });

  reg('addons:inspect-path', (_e, targetPath) => {
    if (!addonManager) return { ok: false, errors: ['Addon-Manager nicht verfügbar.'] };
    return addonManager.inspectFromPath(targetPath);
  });

  reg('addons:install-path', (_e, targetPath) => {
    if (!addonManager) return { ok: false, errors: ['Addon-Manager nicht verfügbar.'] };
    const installed = addonManager.installFromPath(targetPath);
    if (installed.ok) emit('addons:changed', { addons: installed.addons });
    return installed;
  });

  reg('addons:delete', (_e, id, options = {}) => {
    if (!addonManager) return { ok: false, errors: ['Addon-Manager nicht verfügbar.'] };
    const res = addonManager.deleteAddon(id, options || {});
    if (res.ok) emit('addons:changed', { addons: res.addons });
    return res;
  });

  reg('addons:pick-media-files', async () => {
    if (!addonManager) return { ok: false, tracks: [] };
    const win = getWindow();
    const res = await dialog.showOpenDialog(win, {
      title: 'Musik- oder Videodateien für den Player auswählen',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Audio & Video (MP3, WAV, FLAC, OGG, M4A, MP4, WebM)', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'mp4', 'webm'] }
      ]
    });
    if (res.canceled || !res.filePaths.length) return { ok: true, canceled: true, tracks: [] };
    return {
      ok: true,
      tracks: addonManager.formatMediaFiles(res.filePaths)
    };
  });

  reg('addons:pick-media-folder', async () => {
    if (!addonManager) return { ok: false, tracks: [] };
    const win = getWindow();
    const res = await dialog.showOpenDialog(win, {
      title: 'Musik-Ordner auswählen',
      properties: ['openDirectory']
    });
    if (res.canceled || !res.filePaths.length) return { ok: true, canceled: true, tracks: [] };
    const folderPath = res.filePaths[0];
    return {
      ok: true,
      folderPath,
      tracks: addonManager.scanMediaFolder(folderPath)
    };
  });

  reg('app:uninstall', async (_e, options = {}) => {
    try {
      if (options && options.wipeUserData && dataFiles) {
        for (const f of [dataFiles.profiles, dataFiles.sftpHosts, dataFiles.credentials, dataFiles.settings, dataFiles.vault, dataFiles.addonsState]) {
          if (f && fs.existsSync(f)) {
            try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
          }
        }
      }
      const exeDir = path.dirname(process.execPath);
      const candidates = [
        path.join(exeDir, 'Uninstall SQL Hub.exe'),
        path.join(exeDir, 'unins000.exe'),
        path.join(os.homedir(), '.local', 'share', 'sql-hub', 'uninstall.sh')
      ];
      const foundUninstaller = candidates.find((p) => fs.existsSync(p));
      if (foundUninstaller) {
        const { spawn } = require('child_process');
        const child = spawn(foundUninstaller, [], { detached: true, stdio: 'ignore' });
        child.unref();
        setTimeout(() => app.quit(), 300);
        return { ok: true, startedUninstaller: true, path: foundUninstaller };
      }
      if (options && options.quitAfterCleanup) {
        setTimeout(() => app.quit(), 350);
      }
      return {
        ok: true,
        startedUninstaller: false,
        cleanedData: Boolean(options && options.wipeUserData)
      };
    } catch (err) {
      return { ok: false, errors: ['Deinstallation konnte nicht gestartet werden: ' + err.message] };
    }
  });

  reg('addons:open-folder', async (_e, subFolder) => {
    if (!addonManager) return { ok: false, errors: ['Addon-Manager nicht verfügbar.'] };
    const target = subFolder && fs.existsSync(subFolder)
      ? subFolder
      : addonManager.getAddonsDirectory();
    fs.mkdirSync(target, { recursive: true });
    await shell.openPath(target);
    return { ok: true, path: target };
  });

  reg('addons:get-storage', (_e, id) => {
    if (!addonManager) return { ok: true, data: {} };
    return addonManager.getStorage(id);
  });

  reg('addons:set-storage', (_e, id, data) => {
    if (!addonManager) return { ok: false, errors: ['Addon-Manager nicht verfügbar.'] };
    return addonManager.setStorage(id, data);
  });
}

module.exports = { registerIpc };
