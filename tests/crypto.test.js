'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  SCRYPT_TEST,
  deriveKey,
  randomSalt,
  safeEqual,
  encrypt,
  decrypt,
  encodeString,
  decodeString
} = require('../src/main/crypto');

test('deriveKey ist deterministisch und liefert 32 Bytes', () => {
  const salt = randomSalt();
  const a = deriveKey('passwort', salt, SCRYPT_TEST);
  const b = deriveKey('passwort', salt, SCRYPT_TEST);
  assert.strictEqual(a.length, 32);
  assert.ok(safeEqual(a, b));
});

test('deriveKey unterscheidet Passwort und Salt', () => {
  const salt = randomSalt();
  const a = deriveKey('passwort-a', salt, SCRYPT_TEST);
  const b = deriveKey('passwort-b', salt, SCRYPT_TEST);
  const c = deriveKey('passwort-a', randomSalt(), SCRYPT_TEST);
  assert.ok(!safeEqual(a, b));
  assert.ok(!safeEqual(a, c));
});

test('deriveKey wirft ohne Passwort', () => {
  assert.throws(() => deriveKey('', randomSalt(), SCRYPT_TEST));
});

test('encrypt/decrypt round-trip', () => {
  const key = deriveKey('master', randomSalt(), SCRYPT_TEST);
  const plaintext = Buffer.from('geheim: geheimer text', 'utf8');
  const env = encrypt(key, plaintext);
  assert.strictEqual(env.v, 1);
  const out = decrypt(key, env);
  assert.ok(out.equals(plaintext));
});

test('decrypt erkennt Manipulation (GCM-Tag)', () => {
  const key = deriveKey('master', randomSalt(), SCRYPT_TEST);
  const env = encrypt(key, Buffer.from('daten', 'utf8'));
  env.data = Buffer.from('andere daten', 'utf8').toString('base64');
  assert.throws(() => decrypt(key, env));
});

test('encodeString/decodeString round-trip und Klartext-Erkennung', () => {
  const key = deriveKey('master', randomSalt(), SCRYPT_TEST);
  const raw = JSON.stringify([{ id: 'p1', name: 'Test' }]);
  const encoded = encodeString(key, raw);
  assert.notStrictEqual(encoded, raw);
  assert.ok(encoded.includes('__sqlhub_enc'));
  assert.strictEqual(decodeString(key, encoded), raw);
  // Klartext wird unverändert zurückgegeben (Migration).
  assert.strictEqual(decodeString(key, raw), raw);
});

test('decodeString meldet gesperrten Schlüssel', () => {
  const key = deriveKey('master', randomSalt(), SCRYPT_TEST);
  const encoded = encodeString(key, 'irgendwas');
  assert.throws(() => decodeString(null, encoded), (err) => err.code === 'VAULT_LOCKED');
});

test('safeEqual vergleicht nur gleich lange Buffers', () => {
  const a = Buffer.from('abc');
  assert.strictEqual(safeEqual(a, Buffer.from('abc')), true);
  assert.strictEqual(safeEqual(a, Buffer.from('abd')), false);
  assert.strictEqual(safeEqual(a, Buffer.from('ab')), false);
});
