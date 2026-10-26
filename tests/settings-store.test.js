'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SettingsStore } = require('../src/main/settings-store');
const { DEFAULT_SETTINGS } = require('../src/main/config');

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlhub-settings-'));
  return path.join(dir, 'settings.json');
}

test('liefert Standardwerte ohne Datei', () => {
  const store = new SettingsStore({ file: tempFile() });
  assert.deepStrictEqual(store.get(), DEFAULT_SETTINGS);
});

test('set überschreibt gültige Einstellungen', () => {
  const store = new SettingsStore({ file: tempFile() });
  const res = store.set({ theme: 'light' });
  assert.strictEqual(res.theme, 'light');
  assert.strictEqual(res.startView, DEFAULT_SETTINGS.startView);
});

test('set ignoriert unbekannte Schlüssel und falsche Typen', () => {
  const store = new SettingsStore({ file: tempFile() });
  store.set({ boese: 'x', theme: 123, statusCheckEnabled: false });
  const values = store.get();
  assert.strictEqual(values.boese, undefined);
  assert.strictEqual(values.theme, DEFAULT_SETTINGS.theme);
  assert.strictEqual(values.statusCheckEnabled, false);
});

test('Persistenz über neuen Store', () => {
  const file = tempFile();
  const store1 = new SettingsStore({ file });
  store1.set({ theme: 'light', autoLoginDefault: false });
  const store2 = new SettingsStore({ file });
  assert.strictEqual(store2.get().theme, 'light');
  assert.strictEqual(store2.get().autoLoginDefault, false);
});

test('validiert neue v2.3.1-Einstellungen (buttonRadiusPx, panelColor, panelOpacity, panelBlur, biometricUnlock, passwordManagerSupport)', () => {
  const store = new SettingsStore({ file: tempFile() });
  const res = store.set({
    buttonRadiusPx: 18,
    panelColor: '#1a243b',
    panelOpacity: 65,
    panelBlur: 16,
    biometricUnlock: true,
    passwordManagerSupport: false
  });
  assert.strictEqual(res.buttonRadiusPx, 18);
  assert.strictEqual(res.panelColor, '#1a243b');
  assert.strictEqual(res.panelOpacity, 65);
  assert.strictEqual(res.panelBlur, 16);
  assert.strictEqual(res.biometricUnlock, true);
  assert.strictEqual(res.passwordManagerSupport, false);
});

