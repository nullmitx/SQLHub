// state.js – zentraler App-Zustand + Theme- und Status-Verwaltung

import { api } from './api.js';
import { applyAppearance } from './theme.js';

export const state = {
  profiles: [],
  settings: null,
  credentialsAvailable: false,
  statuses: new Map(), // profileId -> { state: 'unknown'|'checking'|'online'|'offline', detail }
  activeProfileId: null,
  openTabCount: 0,
  vaultStatus: { initialized: false, unlocked: false, state: 'uninitialized' },
  view: 'dashboard',
  layoutMode: 'grid', // 'grid' | 'list'
  backgroundImageUrl: ''
};

const listeners = new Set();

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit() {
  for (const fn of listeners) fn();
}

export function applyTheme() {
  const rawTheme = state.settings && state.settings.theme;
  const theme = ['light', 'midnight', 'slate'].includes(rawTheme) ? rawTheme : 'dark';
  document.documentElement.dataset.theme = theme;
  applyAppearance(state.settings, state.backgroundImageUrl);
}

/** Löst den gespeicherten Hintergrundbild-Pfad in eine file://-URL auf. */
export async function resolveBackgroundUrl() {
  const path = state.settings && state.settings.backgroundImage;
  if (!path) {
    state.backgroundImageUrl = '';
    return '';
  }
  try {
    const res = await api.app.fileUrl(path);
    state.backgroundImageUrl = res && res.ok ? res.fileUrl : '';
  } catch {
    state.backgroundImageUrl = '';
  }
  return state.backgroundImageUrl;
}

export async function loadProfiles() {
  const res = await api.profiles.list();
  state.profiles = (res && res.profiles) || [];
  emit();
  return state.profiles;
}

export async function loadSettings() {
  const res = await api.settings.get();
  state.settings = (res && res.settings) || state.settings;
  await resolveBackgroundUrl();
  applyTheme();
  emit();
  return state.settings;
}

export async function loadCredentialAvailability() {
  const res = await api.credentials.isAvailable();
  state.credentialsAvailable = Boolean(res && res.available);
  try {
    const v = await api.vault.status();
    if (v && v.ok !== false) {
      state.vaultStatus = {
        initialized: Boolean(v.initialized),
        unlocked: Boolean(v.unlocked),
        state: v.state || 'uninitialized'
      };
    }
  } catch {
    /* optional */
  }
  emit();
  return state.credentialsAvailable;
}

export function getProfile(id) {
  return state.profiles.find((p) => p.id === id) || null;
}

export function setStatus(profileId, value) {
  // Statusänderungen lösen bewusst KEIN vollständiges Neu-Rendern aus;
  // das Dashboard aktualisiert nur die betroffene Karte.
  state.statuses.set(profileId, value);
}
