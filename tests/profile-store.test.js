'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ProfileStore } = require('../src/main/profile-store');

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlhub-profiles-'));
  return path.join(dir, 'profiles.json');
}

const baseInput = {
  name: 'Music-Bot',
  url: 'https://music.example.com/phpmyadmin/',
  databaseName: 'music',
  description: 'Musikbot DB'
};

test('create legt ein Profil an und list liefert es zurück', () => {
  const store = new ProfileStore({ file: tempFile() });
  const res = store.create(baseInput);
  assert.strictEqual(res.ok, true);
  assert.ok(res.profile.id);
  const list = store.list();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, 'Music-Bot');
});

test('create validiert Eingaben', () => {
  const store = new ProfileStore({ file: tempFile() });
  const res = store.create({ name: '', url: 'quatsch' });
  assert.strictEqual(res.ok, false);
  assert.ok(res.errors.length > 0);
});

test('Profile enthalten niemals Passwörter', () => {
  const store = new ProfileStore({ file: tempFile() });
  const res = store.create({ ...baseInput, password: 'supersecret', username: 'admin' });
  assert.strictEqual(res.ok, true);
  const raw = fs.readFileSync(store.file, 'utf8');
  assert.ok(!raw.includes('supersecret'));
  assert.strictEqual(res.profile.password, undefined);
  assert.strictEqual(res.profile.username, undefined);
});

test('update ändert Felder und erhält id/createdAt', () => {
  const store = new ProfileStore({ file: tempFile() });
  const created = store.create(baseInput).profile;
  const updated = store.update(created.id, { ...baseInput, name: 'Music-Bot 2' });
  assert.strictEqual(updated.ok, true);
  assert.strictEqual(updated.profile.name, 'Music-Bot 2');
  assert.strictEqual(updated.profile.id, created.id);
  assert.strictEqual(updated.profile.createdAt, created.createdAt);
});

test('duplicate erzeugt eine unabhängige Kopie', () => {
  const store = new ProfileStore({ file: tempFile() });
  const created = store.create(baseInput).profile;
  const dup = store.duplicate(created.id);
  assert.strictEqual(dup.ok, true);
  assert.notStrictEqual(dup.profile.id, created.id);
  assert.ok(dup.profile.name.includes('Kopie'));
  assert.strictEqual(store.list().length, 2);
});

test('delete entfernt ein Profil', () => {
  const store = new ProfileStore({ file: tempFile() });
  const created = store.create(baseInput).profile;
  const del = store.delete(created.id);
  assert.strictEqual(del.ok, true);
  assert.strictEqual(store.list().length, 0);
  assert.strictEqual(store.get(created.id), null);
});

test('Persistenz: neuer Store liest gleiche Daten', () => {
  const file = tempFile();
  const store1 = new ProfileStore({ file });
  store1.create(baseInput);
  const store2 = new ProfileStore({ file });
  assert.strictEqual(store2.list().length, 1);
});

test('touchOpened setzt lastOpenedAt', () => {
  const store = new ProfileStore({ file: tempFile() });
  const created = store.create(baseInput).profile;
  store.touchOpened(created.id);
  assert.ok(store.get(created.id).lastOpenedAt);
});

test('setLock speichert Kryptoparameter intern, gibt aber nur öffentliche Metadaten an den Renderer frei', () => {
  const store = new ProfileStore({ file: tempFile() });
  const created = store.create(baseInput).profile;
  store.setLock(created.id, {
    enabled: true,
    salt: 'secret-salt-hex',
    verifySalt: 'secret-verify-salt-hex',
    verifier: 'secret-verifier-hex',
    params: { N: 16384, r: 8, p: 1 },
    hint: 'Bot-PIN'
  });

  const pub = store.get(created.id);
  assert.strictEqual(pub.lock.enabled, true);
  assert.strictEqual(pub.lock.hint, 'Bot-PIN');
  assert.strictEqual(pub.lock.salt, undefined);
  assert.strictEqual(pub.lock.verifySalt, undefined);
  assert.strictEqual(pub.lock.verifier, undefined);

  const raw = store.getRaw(created.id);
  assert.strictEqual(raw.lock.salt, 'secret-salt-hex');
  assert.strictEqual(raw.lock.verifier, 'secret-verifier-hex');

  const dup = store.duplicate(created.id);
  assert.strictEqual(dup.ok, true);
  assert.strictEqual(dup.profile.lock, null);
});

