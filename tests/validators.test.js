'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  validatePhpMyAdminUrl,
  validateProfileInput,
  redactSecrets,
  isHexColor,
  sanitizeIconName
} = require('../src/main/validators');

test('validatePhpMyAdminUrl akzeptiert https und http', () => {
  assert.strictEqual(validatePhpMyAdminUrl('https://db.example.com/phpmyadmin/').ok, true);
  assert.strictEqual(validatePhpMyAdminUrl('http://localhost/phpmyadmin').ok, true);
});

test('validatePhpMyAdminUrl lehnt ungültige und unsichere Schemata ab', () => {
  assert.strictEqual(validatePhpMyAdminUrl('').ok, false);
  assert.strictEqual(validatePhpMyAdminUrl('nicht-echt').ok, false);
  assert.strictEqual(validatePhpMyAdminUrl('file:///C:/secret.txt').ok, false);
  assert.strictEqual(validatePhpMyAdminUrl('javascript:alert(1)').ok, false);
  assert.strictEqual(validatePhpMyAdminUrl('ftp://host/x').ok, false);
});

test('validatePhpMyAdminUrl entfernt Fragmente', () => {
  const res = validatePhpMyAdminUrl('https://h.example/phpmyadmin/#hash');
  assert.strictEqual(res.ok, true);
  assert.ok(!res.url.includes('#'));
});

test('validateProfileInput verlangt Namen und URL', () => {
  const res = validateProfileInput({ name: '', url: '' });
  assert.strictEqual(res.ok, false);
  assert.ok(res.errors.length >= 2);
});

test('validateProfileInput akzeptiert vollständige Eingaben', () => {
  const res = validateProfileInput({
    name: 'Verwaltungs-Bot',
    description: 'Hauptbot',
    url: 'https://db.example.com/phpmyadmin/',
    databaseName: 'bots_main',
    serverNote: 'Hosting XY',
    iconEmoji: '🤖',
    accentColor: '#6c8cff',
    storeCredentials: true,
    autoLogin: true
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.value.name, 'Verwaltungs-Bot');
  assert.strictEqual(res.value.accentColor, '#6c8cff');
});

test('validateProfileInput übernimmt iconFile nur wenn gesetzt', () => {
  const without = validateProfileInput({ name: 'A', url: 'https://a.example' });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(without.value, 'iconFile'), false);

  const withIcon = validateProfileInput({ name: 'A', url: 'https://a.example', iconFile: 'C:/x.png' });
  assert.strictEqual(withIcon.value.iconFile, 'C:/x.png');

  const removed = validateProfileInput({ name: 'A', url: 'https://a.example', iconFile: null });
  assert.strictEqual(removed.value.iconFile, null);
});

test('redactSecrets entfernt Passwortfelder', () => {
  const red = redactSecrets({ username: 'admin', password: 'geheim', token: 'abc', other: 'ok' });
  assert.strictEqual(red.password, '***');
  assert.strictEqual(red.token, '***');
  assert.strictEqual(red.username, 'admin');
  assert.strictEqual(red.other, 'ok');
});

test('isHexColor prüft Format', () => {
  assert.strictEqual(isHexColor('#AABBCC'), true);
  assert.strictEqual(isHexColor('#abc'), false);
  assert.strictEqual(isHexColor('red'), false);
});

test('validateProfileInput setzt einen Standard-Icon-Namen', () => {
  const res = validateProfileInput({ name: 'A', url: 'https://a.example' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.value.iconName, 'database');
});

test('validateProfileInput übernimmt gültige Icon-Namen', () => {
  const res = validateProfileInput({ name: 'A', url: 'https://a.example', iconName: 'rocket' });
  assert.strictEqual(res.value.iconName, 'rocket');
});

test('sanitizeIconName bereinigt und fällt zurück', () => {
  assert.strictEqual(sanitizeIconName('Bot!!'), 'bot');
  assert.strictEqual(sanitizeIconName('  Music  '), 'music');
  assert.strictEqual(sanitizeIconName(''), 'database');
  assert.strictEqual(sanitizeIconName(null), 'database');
  assert.strictEqual(sanitizeIconName(42), 'database');
});

test('redactSecrets schwärzt rekursiv und entfernt eingebettete URL-Zugangsdaten', () => {
  const red = redactSecrets({
    url: 'https://admin:geheim123@db.example.com/phpmyadmin/',
    nested: {
      lockPassword: 'secret-lock-password',
      verifier: 'abcd1234',
      salt: '998877',
      normal: 'sichtbar'
    }
  });
  assert.ok(!red.url.includes('geheim123'));
  assert.ok(red.url.includes('***:***@db.example.com'));
  assert.strictEqual(red.nested.lockPassword, '***');
  assert.strictEqual(red.nested.verifier, '***');
  assert.strictEqual(red.nested.salt, '***');
  assert.strictEqual(red.nested.normal, 'sichtbar');
});

test('validateProfileInput unterstützt Kategorie und Favoriten-Flag', () => {
  const res = validateProfileInput({
    name: 'Prod DB',
    url: 'https://db.example.com/pma',
    category: 'Produktion',
    favorite: true
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.value.category, 'Produktion');
  assert.strictEqual(res.value.favorite, true);
});

