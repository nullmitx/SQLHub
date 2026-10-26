'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Vault } = require('../src/main/vault');
const { SCRYPT_TEST } = require('../src/main/crypto');
const { ProfileStore } = require('../src/main/profile-store');
const { SettingsStore } = require('../src/main/settings-store');

function tempFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlhub-vault-'));
  return path.join(dir, name);
}

test('Vault.create richtet ein und sperrt/entsperrt korrekt', () => {
  const file = tempFile('vault.json');
  const vault = new Vault({ file, params: SCRYPT_TEST });

  assert.strictEqual(vault.isInitialized(), false);
  assert.strictEqual(vault.status().state, 'uninitialized');

  const created = vault.create('meister-passwort');
  assert.strictEqual(created.ok, true);
  assert.strictEqual(vault.isInitialized(), true);
  assert.ok(vault.isUnlocked());

  vault.lock();
  assert.strictEqual(vault.isUnlocked(), false);
  assert.strictEqual(vault.getKey(), null);

  assert.strictEqual(vault.unlock('meister-passwort').ok, true);
  assert.ok(vault.isUnlocked());

  vault.lock();
  assert.strictEqual(vault.unlock('falsch').ok, false);
  assert.ok(!vault.isUnlocked());
});

test('Vault lehnt zu kurze Master-Passwörter ab', () => {
  const file = tempFile('vault.json');
  const vault = new Vault({ file, params: SCRYPT_TEST });
  assert.strictEqual(vault.create('kurz').ok, false);
  assert.strictEqual(vault.isInitialized(), false);
});

test('Vault.changePassword aktualisiert den Zugang', () => {
  const file = tempFile('vault.json');
  const vault = new Vault({ file, params: SCRYPT_TEST });
  vault.create('alt-passwort');
  assert.strictEqual(vault.changePassword('alt-passwort', 'neu-passwort').ok, true);
  vault.lock();
  assert.strictEqual(vault.unlock('alt-passwort').ok, false);
  assert.strictEqual(vault.unlock('neu-passwort').ok, true);
});

test('Store-Codec verschlüsselt Dateien nur bei eingerichtetem Tresor', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlhub-vault-'));
  const vault = new Vault({ file: path.join(dir, 'vault.json'), params: SCRYPT_TEST });
  const codec = vault.createCodec();
  const profileFile = path.join(dir, 'profiles.json');
  const store = new ProfileStore({ file: profileFile, codec });

  // Ohne Tresor: Klartext.
  store.create({ name: 'A', url: 'https://a.example/pma' });
  assert.ok(!fs.readFileSync(profileFile, 'utf8').includes('__sqlhub_enc'));

  // Tresor einrichten → Datei wird beim nächsten Schreiben verschlüsselt.
  vault.create('passwort');
  store.reload();
  store.resave();
  assert.ok(fs.readFileSync(profileFile, 'utf8').includes('__sqlhub_enc'));

  // Gesperrt: lesen schlägt fehl, ohne Daten zu löschen.
  vault.lock();
  assert.throws(() => { store.reload(); store.list(); }, (err) => err.code === 'VAULT_LOCKED');
  assert.ok(fs.readFileSync(profileFile, 'utf8').includes('__sqlhub_enc'));

  // Entsperren: Daten wieder lesbar.
  vault.unlock('passwort');
  store.reload();
  const list = store.list();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, 'A');
});

test('SettingsStore-Sanitizer bereinigt Erscheinungsbild-Werte', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlhub-vault-'));
  const store = new SettingsStore({ file: path.join(dir, 'settings.json') });

  store.set({
    accentColor: '#12ABEF',
    backgroundStyle: 'evil" onload="x',
    backgroundImageOpacity: 500,
    backgroundImageBlur: -5,
    accentGradient: true,
    autoLockMinutes: 9999,
    toastDurationSeconds: 120,
    buttonRadius: 'pill',
    buttonStyle: 'outline',
    buttonColor: '#10B981',
    cardStyle: 'bordered',
    uiDensity: 'compact',
    animationsEnabled: false
  });
  const s = store.get();
  assert.strictEqual(s.accentColor, '#12abef');
  assert.strictEqual(s.backgroundStyle, 'default');
  assert.strictEqual(s.backgroundImageOpacity, 100);
  assert.strictEqual(s.backgroundImageBlur, 0);
  assert.strictEqual(s.accentGradient, true);
  assert.strictEqual(s.autoLockMinutes, 1440);
  assert.strictEqual(s.toastDurationSeconds, 60);
  assert.strictEqual(s.buttonRadius, 'pill');
  assert.strictEqual(s.buttonStyle, 'outline');
  assert.strictEqual(s.buttonColor, '#10b981');
  assert.strictEqual(s.cardStyle, 'bordered');
  assert.strictEqual(s.uiDensity, 'compact');
  assert.strictEqual(s.animationsEnabled, false);
});

