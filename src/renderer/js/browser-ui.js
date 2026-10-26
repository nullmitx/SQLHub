// browser-ui.js – Steuerung des integrierten phpMyAdmin-Browsers

import { api, unwrap } from './api.js';
import { state, loadProfiles, emit } from './state.js';
import { showToast } from './toast.js';
import { setView } from './view.js';
import { icon, DEFAULT_PROFILE_ICON } from './icons.js';
import { promptPassword } from './password-prompt.js';
import { toFileUrl } from './dom.js';

const placeholder = document.getElementById('browser-placeholder');
const tabsEl = document.getElementById('browser-tabs');
const urlInput = document.getElementById('url-input');
const urlSpinner = document.getElementById('url-spinner');
const urlLock = document.getElementById('url-lock');
const urlCopy = document.getElementById('url-copy');
const progressEl = document.getElementById('browser-progress');
const btnBack = document.getElementById('nav-back');
const btnForward = document.getElementById('nav-forward');
const btnReload = document.getElementById('nav-reload');
const btnHome = document.getElementById('nav-home');
const btnAutoLogin = document.getElementById('nav-autologin');
const btnClose = document.getElementById('browser-close');
const btnTabNew = document.getElementById('browser-tab-new');
const navBrowserBtn = document.getElementById('nav-browser');
const navBrowserCount = document.getElementById('nav-browser-count');

let tabs = [];
let activeProfileId = null;
let observer = null;

export function initBrowserUI() {
  btnBack.addEventListener('click', () => api.browser.back(activeProfileId));
  btnForward.addEventListener('click', () => api.browser.forward(activeProfileId));
  btnReload.addEventListener('click', () => api.browser.reload(activeProfileId));
  btnHome.addEventListener('click', () => api.browser.home(activeProfileId));
  btnAutoLogin.addEventListener('click', () => {
    api.browser.retryAutoLogin(activeProfileId);
    showToast({ type: 'info', message: 'Automatische Anmeldung wird auf dieser Seite erneut ausgeführt.' });
  });
  btnClose.addEventListener('click', () => {
    if (activeProfileId) api.browser.close(activeProfileId);
  });

  if (btnTabNew) {
    btnTabNew.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('sqlhub:command-palette'));
    });
  }

  if (urlCopy) {
    urlCopy.addEventListener('click', async () => {
      const text = urlInput.value.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showToast({ type: 'success', message: 'Adresse in die Zwischenablage kopiert.' });
      } catch {
        urlInput.select();
        document.execCommand('copy');
        showToast({ type: 'success', message: 'Adresse kopiert.' });
      }
    });
  }

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeProfileId) api.browser.navigate(activeProfileId, urlInput.value);
    }
  });
  urlInput.addEventListener('focus', () => urlInput.select());

  // Größe des nativen Bereichs aktuell halten
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => reportBounds());
    observer.observe(placeholder);
  }
  window.addEventListener('resize', () => reportBounds());

  updateLock('');
}

/**
 * Öffnet ein Profil im integrierten Browser.
 */
export async function openProfile(profile) {
  try {
    if (profile.lockEnabled && profile.unlocked === false) {
      const password = await promptPassword({
        title: `„${profile.name}“ entsperren`,
        message: 'Dieses Profil ist durch ein eigenes Passwort geschützt. Bitte gib es ein, um die Sitzung zu starten.',
        hint: profile.lock && profile.lock.hint
      });
      if (!password) return;
      const unlockRes = await api.profileLock.unlock(profile.id, password);
      unwrap(unlockRes);
      await loadProfiles();
    }
    const res = await api.browser.open(profile.id);
    unwrap(res);
    activeProfileId = profile.id;
    state.activeProfileId = profile.id;
    setView('browser');
    // Bounds erst nach dem Layout melden
    requestAnimationFrame(() => reportBounds());
  } catch (err) {
    showToast({ type: 'error', title: 'Öffnen fehlgeschlagen', message: err.message });
    setView('dashboard');
  }
}

/** Wird vom App-Modul beim Wechsel in den Browser-View aufgerufen. */
export function showBrowserView() {
  requestAnimationFrame(() => reportBounds());
}

/** Meldet die Position/Größe des Platzhalters an den Main-Prozess. */
export function reportBounds() {
  const rect = placeholder.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  api.browser.setBounds({
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  });
}

export function handleTabs(payload) {
  tabs = payload.tabs || [];
  activeProfileId = payload.activeProfileId || null;
  state.activeProfileId = activeProfileId;
  state.openTabCount = tabs.length;

  if (navBrowserBtn) {
    navBrowserBtn.hidden = tabs.length === 0;
  }
  if (navBrowserCount) {
    navBrowserCount.textContent = String(tabs.length);
  }

  renderTabs();
  emit();
}

export function handleState(payload) {
  if (payload.profileId !== activeProfileId) {
    const tab = tabs.find((t) => t.profileId === payload.profileId);
    if (tab) {
      tab.url = payload.url;
      tab.loading = payload.loading;
      renderTabs();
    }
    return;
  }

  if (document.activeElement !== urlInput) {
    urlInput.value = payload.url || '';
  }
  btnBack.disabled = !payload.canGoBack;
  btnForward.disabled = !payload.canGoForward;
  urlSpinner.hidden = !payload.loading;
  if (progressEl) progressEl.hidden = !payload.loading;
  updateLock(payload.url);
}

/** Reagiert auf Tab-Schließen: bei keinem offenen Tab zurück zum Dashboard. */
export function handleTabClosed() {
  if (tabs.length === 0) {
    setView('dashboard');
  }
}

function updateLock(url) {
  if (!url) {
    urlLock.innerHTML = icon('lock', 13);
    urlLock.title = 'Verbindungssicherheit';
    urlLock.classList.remove('is-insecure');
    return;
  }
  const insecure = url.startsWith('http://');
  urlLock.innerHTML = icon(insecure ? 'triangle-alert' : 'lock', 13);
  urlLock.title = insecure ? 'Unverschlüsselte HTTP-Verbindung' : 'TLS-verschlüsselte HTTPS-Verbindung';
  urlLock.classList.toggle('is-insecure', insecure);
}

function renderTabs() {
  tabsEl.innerHTML = '';
  for (const tab of tabs) {
    const profile = state.profiles.find((p) => p.id === tab.profileId);
    const el = document.createElement('div');
    el.className = 'tab' + (tab.profileId === activeProfileId ? ' is-active' : '');
    el.setAttribute('role', 'tab');
    el.title = tab.title || (profile ? profile.name : '');
    if (profile && profile.accentColor) {
      el.style.setProperty('--tab-accent', profile.accentColor);
    }

    const iconEl = document.createElement('span');
    iconEl.className = 'tab__icon';
    if (profile && profile.iconFile) {
      const img = document.createElement('img');
      img.src = toFileUrl(profile.iconFile);
      img.alt = '';
      iconEl.appendChild(img);
    } else {
      iconEl.innerHTML = icon(profile ? (profile.iconName || DEFAULT_PROFILE_ICON) : 'globe', 13);
    }

    const title = document.createElement('span');
    title.className = 'tab__title';
    title.textContent = profile ? profile.name : (tab.title || 'Sitzung');

    el.append(iconEl, title);

    if (tab.loading) {
      const spinner = document.createElement('span');
      spinner.className = 'tab__spinner';
      el.appendChild(spinner);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab__close';
    closeBtn.innerHTML = icon('x', 13);
    closeBtn.title = 'Sitzungs-Tab schließen';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      api.browser.close(tab.profileId);
    });
    el.appendChild(closeBtn);

    el.addEventListener('click', () => {
      if (tab.profileId !== activeProfileId) api.browser.switchTo(tab.profileId);
    });
    el.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        api.browser.close(tab.profileId);
      }
    });
    tabsEl.appendChild(el);
  }
}
