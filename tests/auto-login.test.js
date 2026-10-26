'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  decideAutoLogin,
  buildFillScript,
  isLoginLikeUrl,
  DETECT_SCRIPT
} = require('../src/main/auto-login');

const enabledProfile = { autoLogin: true, storeCredentials: true };

test('Auto-Login nur auf phpMyAdmin-Anmeldeseite', () => {
  assert.strictEqual(decideAutoLogin({ pageKind: 'pma-login', profile: enabledProfile, attemptsOnThisPage: 0 }).action, 'fill');
  assert.strictEqual(decideAutoLogin({ pageKind: 'pma-dashboard', profile: enabledProfile, attemptsOnThisPage: 0 }).action, 'none');
  assert.strictEqual(decideAutoLogin({ pageKind: 'other-login', profile: enabledProfile, attemptsOnThisPage: 0 }).action, 'none');
  assert.strictEqual(decideAutoLogin({ pageKind: 'unknown', profile: enabledProfile, attemptsOnThisPage: 0 }).action, 'none');
});

test('Auto-Login respektiert deaktivierte Einstellung', () => {
  const res = decideAutoLogin({
    pageKind: 'pma-login',
    profile: { autoLogin: false, storeCredentials: true },
    attemptsOnThisPage: 0
  });
  assert.strictEqual(res.action, 'none');
});

test('Auto-Login stoppt nach zwei Fehlversuchen', () => {
  assert.strictEqual(decideAutoLogin({ pageKind: 'pma-login', profile: enabledProfile, attemptsOnThisPage: 1 }).action, 'fill');
  assert.strictEqual(decideAutoLogin({ pageKind: 'pma-login', profile: enabledProfile, attemptsOnThisPage: 2 }).action, 'none');
});

test('Auto-Login benötigt gespeicherte Zugangsdaten', () => {
  const res = decideAutoLogin({
    pageKind: 'pma-login',
    profile: enabledProfile,
    attemptsOnThisPage: 0,
    credentialsAvailable: false
  });
  assert.strictEqual(res.action, 'none');
});

test('buildFillScript bettet Zugangsdaten sicher ein (JSON-kodiert)', () => {
  const script = buildFillScript('admin"evil', 'p"\'\n$(x)');
  assert.ok(script.includes('pma_username'));
  assert.ok(script.includes('form.submit'));
  // Anführungszeichen müssen escaped sein (kein roher Einbruch)
  assert.ok(script.includes(JSON.stringify('admin"evil')));
  assert.ok(!script.includes('"admin"evil"'));
});

test('isLoginLikeUrl erkennt typische Login-URLs', () => {
  assert.strictEqual(isLoginLikeUrl('https://x.example/index.php?route=/login'), true);
  assert.strictEqual(isLoginLikeUrl('https://x.example/phpmyadmin/'), false);
});
