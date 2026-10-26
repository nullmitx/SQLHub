'use strict';

/**
 * Kryptografie-Bausteine für den Tresor (Vault) und den Profil-Passwortschutz.
 *
 * - Schlüsselableitung: scrypt (speicherharte KDF) aus einem Master-Passwort.
 * - Vertraulichkeit/Integrität: AES-256-GCM mit zufälligem IV und Auth-Tag.
 *
 * Reine Node.js-Implementierung (keine Electron-Abhängigkeit) – unit-testbar.
 */
const crypto = require('crypto');

const ENVELOPE_VERSION = 1;
const ENVELOPE_MARKER = '__sqlhub_enc';

/** Standard-scrypt-Parameter (bewusst speicherhart). */
const SCRYPT_DEFAULTS = Object.freeze({
  N: 32768,
  r: 8,
  p: 1,
  keylen: 32,
  // 128 * N * r + Puffer (Node verlangt maxmem > 128*N*r).
  maxmem: 128 * 1024 * 1024
});

/** Schnelle Parameter für Tests (werden nie in echten Tresoren geschrieben). */
const SCRYPT_TEST = Object.freeze({ N: 1024, r: 8, p: 1, keylen: 32, maxmem: 32 * 1024 * 1024 });

function normalizeParams(params) {
  const p = params || {};
  return {
    N: Number(p.N) || SCRYPT_DEFAULTS.N,
    r: Number(p.r) || SCRYPT_DEFAULTS.r,
    p: Number(p.p) || SCRYPT_DEFAULTS.p,
    keylen: Number(p.keylen) || SCRYPT_DEFAULTS.keylen,
    maxmem: Number(p.maxmem) || SCRYPT_DEFAULTS.maxmem
  };
}

/**
 * Leitet einen Schlüssel aus Passwort und Salt ab.
 * @returns {Buffer} 32-Byte-Schlüssel
 */
function deriveKey(password, salt, params) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Passwort fehlt.');
  }
  const p = normalizeParams(params);
  return crypto.scryptSync(Buffer.from(password, 'utf8'), salt, p.keylen, {
    N: p.N,
    r: p.r,
    p: p.p,
    maxmem: p.maxmem
  });
}

function randomSalt(bytes = 16) {
  return crypto.randomBytes(bytes);
}

/** Vergleicht zwei Puffer in konstanter Zeit. */
function safeEqual(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verschlüsselt einen Puffer mit AES-256-GCM.
 * @returns {{ v:number, iv:string, tag:string, data:string }}
 */
function encrypt(key, plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  return {
    v: ENVELOPE_VERSION,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64')
  };
}

/** Entschlüsselt ein Envelope-Objekt. Wirft bei Manipulation. */
function decrypt(key, envelope) {
  if (!envelope || typeof envelope !== 'object' || envelope.v !== ENVELOPE_VERSION) {
    throw new Error('Ungültiges Datenformat.');
  }
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const data = Buffer.from(envelope.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** Erzeugt einen verpackten Text: `{"__sqlhub_enc":1,...}`. */
function encodeString(key, text) {
  return JSON.stringify({ [ENVELOPE_MARKER]: ENVELOPE_VERSION, ...encrypt(key, Buffer.from(text, 'utf8')) });
}

/**
 * Erkennt und entschlüsselt verpackten Text. Klartext wird unverändert zurückgegeben.
 * @param {Buffer} key
 * @param {string} raw
 */
function decodeString(key, raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (parsed && typeof parsed === 'object' && parsed[ENVELOPE_MARKER]) {
    if (!key) {
      const err = new Error('Der Tresor ist gesperrt.');
      err.code = 'VAULT_LOCKED';
      throw err;
    }
    return decrypt(key, parsed).toString('utf8');
  }
  return raw;
}

module.exports = {
  ENVELOPE_VERSION,
  ENVELOPE_MARKER,
  SCRYPT_DEFAULTS,
  SCRYPT_TEST,
  normalizeParams,
  deriveKey,
  randomSalt,
  safeEqual,
  encrypt,
  decrypt,
  encodeString,
  decodeString
};
