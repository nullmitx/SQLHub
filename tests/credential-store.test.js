'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CredentialStore } = require('../src/main/credential-store');

/** Test-Stub für Electron safeStorage (ver- und entschlüsselt nachvollziehbar). */
function stubSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from('ENC:' + Buffer.from(s, 'utf8').toString('base64'), 'utf8'),
    decryptString: (buf) => {
      const text = buf.toString('utf8');
      if (!text.startsWith('ENC:')) throw new Error('kein gültiger Blob');
      return Buffer.from(text.slice(4), 'base64').toString('utf8');
    }
  };
}

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlhub-cred-'));
  return path.join(dir, 'credentials.enc');
}

test('set und get liefern Zugangsdaten korrekt zurück', () => {
  const store = new CredentialStore({ file: tempFile(), safeStorage: stubSafeStorage() });
  const res = store.set('p1', { username: 'admin', password: 'geheim!' });
  assert.strictEqual(res.ok, true);
  const got = store.get('p1');
  assert.strictEqual(got.ok, true);
  assert.strictEqual(got.credentials.username, 'admin');
  assert.strictEqual(got.credentials.password, 'geheim!');
});

test('Passwort liegt nicht im Klartext in der Datei', () => {
  const file = tempFile();
  const store = new CredentialStore({ file, safeStorage: stubSafeStorage() });
  store.set('p1', { username: 'admin', password: 'streng-geheim' });
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!raw.includes('streng-geheim'));
});

test('has erkennt gespeicherte Zugangsdaten', () => {
  const store = new CredentialStore({ file: tempFile(), safeStorage: stubSafeStorage() });
  assert.strictEqual(store.has('p1'), false);
  store.set('p1', { username: 'u', password: 'p' });
  assert.strictEqual(store.has('p1'), true);
});

test('set verweigert Speichern ohne Verschlüsselung', () => {
  const store = new CredentialStore({ file: tempFile(), safeStorage: stubSafeStorage(false) });
  const res = store.set('p1', { username: 'u', password: 'p' });
  assert.strictEqual(res.ok, false);
  assert.ok(res.errors.join(' ').includes('nicht verfügbar'));
});

test('get meldet fehlende Zugangsdaten', () => {
  const store = new CredentialStore({ file: tempFile(), safeStorage: stubSafeStorage() });
  assert.strictEqual(store.get('unknown').ok, false);
});

test('delete entfernt einen Eintrag', () => {
  const store = new CredentialStore({ file: tempFile(), safeStorage: stubSafeStorage() });
  store.set('p1', { username: 'u', password: 'p' });
  assert.strictEqual(store.delete('p1'), true);
  assert.strictEqual(store.has('p1'), false);
});

test('deleteAll leert den Speicher', () => {
  const store = new CredentialStore({ file: tempFile(), safeStorage: stubSafeStorage() });
  store.set('p1', { username: 'u', password: 'p' });
  store.set('p2', { username: 'u2', password: 'p2' });
  assert.strictEqual(store.deleteAll(), 2);
  assert.strictEqual(store.has('p1'), false);
  assert.strictEqual(store.has('p2'), false);
});

test('get schlägt bei beschädigtem Blob fehl, ohne zu werfen', () => {
  const file = tempFile();
  const store = new CredentialStore({ file, safeStorage: stubSafeStorage() });
  store.set('p1', { username: 'u', password: 'p' });
  // Blob manipulieren
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  parsed.entries[0].password = Buffer.from('kaputt', 'utf8').toString('base64');
  fs.writeFileSync(file, JSON.stringify(parsed));
  const store2 = new CredentialStore({ file, safeStorage: stubSafeStorage() });
  const res = store2.get('p1');
  assert.strictEqual(res.ok, false);
});
