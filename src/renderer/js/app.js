// app.js – Einstiegspunkt des Renderers inkl. Command-Palette (Strg+K) und Native-View-Guardian

import { api, events } from './api.js';
import {
  state,
  onChange,
  loadProfiles,
  loadSettings,
  loadCredentialAvailability,
  applyTheme
} from './state.js';
import { initViews, setView, getCurrentView, onBeforeSwitch } from './view.js';
import { initDashboard, renderDashboard } from './dashboard.js';
import { initProfiles, renderProfiles } from './profiles.js';
import { checkAllStatuses } from './profile-grid.js';
import {
  initBrowserUI,
  handleTabs,
  handleState,
  reportBounds,
  showBrowserView,
  openProfile as openBrowserProfile
} from './browser-ui.js';
import { renderSettings } from './settings.js';
import { renderPasswords, lockPasswordManagerSession } from './passwords.js';
import { initSftp, renderSftp } from './sftp.js';
import { initAddons, renderAddons } from './addons.js';
import { renderAbout } from './about.js';
import { openProfileDialog } from './profile-dialog.js';
import { showToast } from './toast.js';
import { initVault, setVaultResume, lockVaultNow } from './vault-ui.js';
import { icon, DEFAULT_PROFILE_ICON } from './icons.js';
import { escapeHtml, safeHost } from './dom.js';

const PROFILE_VIEWS = new Set(['dashboard', 'profiles']);

async function boot() {
  initViews();
  initDashboard();
  initProfiles();
  initBrowserUI();
  initSftp();
  initAddons();

  // Titelzeilen-Steuerung
  document.getElementById('win-min').addEventListener('click', () => api.window.minimize());
  document.getElementById('win-max').addEventListener('click', () => api.window.maximize());
  document.getElementById('win-close').addEventListener('click', () => api.window.close());

  // Schnellbefehle & Status-Refresh in Titelzeile und Sidebar
  const cmdBtn = document.getElementById('btn-command-palette');
  const sideCmdBtn = document.getElementById('sidebar-cmd-btn');
  const refreshBtn = document.getElementById('btn-refresh-status');
  const sideLockBtn = document.getElementById('sidebar-lock-btn');

  if (cmdBtn) cmdBtn.addEventListener('click', openCommandPalette);
  if (sideCmdBtn) sideCmdBtn.addEventListener('click', openCommandPalette);
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      checkAllStatuses();
      showToast({ type: 'info', message: 'Erreichbarkeit aller Datenbankprofile wird geprüft …' });
    });
  }
  if (sideLockBtn) {
    sideLockBtn.addEventListener('click', () => lockVaultNow());
  }

  // Sidebar-Navigation
  document.querySelectorAll('.nav-item[data-view]').forEach((el) => {
    el.addEventListener('click', () => navigate(el.getAttribute('data-view')));
  });

  // „Profil hinzufügen"-Buttons (Dashboard + Profile-Seite)
  window.addEventListener('sqlhub:create-profile', createProfile);
  window.addEventListener('sqlhub:command-palette', openCommandPalette);

  // Navigation aus anderen Modulen
  window.addEventListener('sqlhub:navigate', (e) => navigate(e.detail));

  // Sichtbarkeit der nativen Browser-View steuern (inkl. Schutz vor Überdeckung von Modals)
  onBeforeSwitch((next) => {
    syncBrowserVisibility(next);
  });

  setupOverlayGuardian();
  subscribeEvents();
  registerShortcuts();

  onChange(updateSidebarSecurityCard);

  // Nach dem Entsperren (auch automatisch nach Auto-Sperre) Daten neu laden.
  setVaultResume(loadAllData);

  // Tresor prüfen – ggf. Einrichtung/Sperrbildschirm anzeigen.
  await initVault();

  await loadAllData();

  // Plattform-Kennzeichnung & Prüfen, ob die App gerade auf eine neuere Version aktualisiert wurde
  try {
    const verInfo = await api.app.version();
    if (verInfo && verInfo.platform) {
      document.documentElement.setAttribute('data-platform', verInfo.platform);
      if (verInfo.platform === 'darwin') {
        const kbdEl = document.querySelector('.cmd-trigger__kbd');
        if (kbdEl) kbdEl.textContent = '⌘ K';
      }
    }
    if (verInfo && verInfo.updatedFrom && verInfo.version) {
      showToast({
        type: 'success',
        title: `Auf Version ${verInfo.version} aktualisiert`,
        message: `SQL Hub wurde erfolgreich von v${verInfo.updatedFrom} auf v${verInfo.version} aktualisiert. Alle Profile und Zugangsdaten wurden übernommen.`
      });
    }
  } catch {
    /* optional */
  }
}

/**
 * Stellt sicher, dass eine aktive native WebContentsView ausgeblendet wird,
 * sobald ein HTML-Modal, Passwortdialog oder Tresor-Overlay geöffnet ist.
 */
function setupOverlayGuardian() {
  const observer = new MutationObserver(() => {
    syncBrowserVisibility(getCurrentView());
  });
  const modalRoot = document.getElementById('modal-root');
  if (modalRoot) observer.observe(modalRoot, { childList: true });
  observer.observe(document.body, { childList: true });
}

function hasBlockingOverlay() {
  return Boolean(
    document.querySelector('.modal-overlay') ||
    document.querySelector('.vault-overlay')
  );
}

function syncBrowserVisibility(targetView = getCurrentView()) {
  if (targetView === 'browser' && !hasBlockingOverlay()) {
    api.browser.setVisible(true);
    showBrowserView();
  } else {
    api.browser.setVisible(false);
  }
}

function updateSidebarSecurityCard() {
  const titleEl = document.getElementById('sidebar-sec-title');
  const subEl = document.getElementById('sidebar-sec-sub');
  const lockBtn = document.getElementById('sidebar-lock-btn');
  if (!titleEl || !subEl) return;

  const isMac = /mac/i.test(navigator.platform || navigator.userAgent || '');
  const isLinux = /linux/i.test(navigator.platform || navigator.userAgent || '');
  const osKeystoreLabel = isMac
    ? 'Keychain & Touch ID'
    : isLinux
      ? 'Secret Service geschützt'
      : 'DPAPI geschützt';

  const v = state.vaultStatus || {};
  if (v.initialized && v.unlocked) {
    titleEl.textContent = 'App-Schutz aktiv';
    subEl.textContent = `Entsperrt · ${osKeystoreLabel}`;
    if (lockBtn) lockBtn.hidden = false;
  } else if (v.initialized && !v.unlocked) {
    titleEl.textContent = 'App gesperrt';
    subEl.textContent = 'AES-256 Verschlüsselung';
    if (lockBtn) lockBtn.hidden = true;
  } else {
    titleEl.textContent = state.credentialsAvailable ? `${osKeystoreLabel} aktiv` : 'Lokaler Speicher';
    subEl.textContent = 'Verschlüsselte Ablage';
    if (lockBtn) lockBtn.hidden = true;
  }
}

async function loadAllData() {
  await Promise.all([loadSettings(), loadProfiles(), loadCredentialAvailability()]);
  updateSidebarSecurityCard();
  const start = state.settings && state.settings.startView === 'profiles' ? 'profiles' : 'dashboard';
  navigate(start);
}

/** Wechselt die Ansicht und rendert die zugehörige Seite. */
function navigate(view) {
  if (!view) return;
  setView(view);
  syncBrowserVisibility(view);
  if (view === 'dashboard') renderDashboard();
  else if (view === 'profiles') renderProfiles();
  else if (view === 'sftp') renderSftp();
  else if (view === 'addons') renderAddons();
  else if (view === 'passwords') renderPasswords();
  else if (view === 'settings') renderSettings();
  else if (view === 'about') renderAbout();
}

function subscribeEvents() {
  events.on('profiles:changed', () => {
    loadProfiles();
    loadCredentialAvailability();
  });

  events.on('vault:state', (status) => {
    if (status) {
      state.vaultStatus = {
        initialized: Boolean(status.initialized),
        unlocked: Boolean(status.unlocked),
        state: status.state || 'uninitialized'
      };
      if (! status.unlocked) {
        lockPasswordManagerSession();
      }
      updateSidebarSecurityCard();
    }
  });

  events.on('browser:tabs', (payload) => {
    handleTabs(payload);
    if (!payload.tabs || payload.tabs.length === 0) {
      if (getCurrentView() === 'browser') setView('dashboard');
    }
    requestAnimationFrame(reportBounds);
  });

  events.on('browser:state', (payload) => {
    handleState(payload);
  });

  events.on('settings:changed', (settings) => {
    state.settings = settings;
    applyTheme();
  });

  events.on('browser:cert-error', (payload) => {
    showToast({
      type: 'warning',
      title: 'TLS-Zertifikatswarnung',
      message: `Das Server-Zertifikat von ${shortHost(payload.url)} wurde nicht als vertrauenswürdig eingestuft. Fahre nur fort, wenn es sich um deinen eigenen Server handelt.`,
      timeout: 0,
      actions: [
        {
          label: 'Einmalig vertrauen & laden',
          primary: false,
          onClick: () => {
            const targetId = (payload && payload.profileId) || state.activeProfileId;
            if (targetId) {
              api.browser.allowCertificateOnce(targetId);
            }
          }
        }
      ]
    });
  });

  events.on('app:toast', (payload) => {
    showToast(payload || { message: 'Hinweis' });
  });
}

function registerShortcuts() {
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    } else if (mod && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      createProfile();
    } else if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (getCurrentView() !== 'profiles') navigate('dashboard');
      const search = document.getElementById(getCurrentView() === 'profiles' ? 'profiles-search' : 'search-input');
      if (search) {
        search.focus();
        search.select();
      }
    } else if (mod && e.key.toLowerCase() === 'r' && getCurrentView() === 'browser') {
      e.preventDefault();
      api.browser.reload(state.activeProfileId);
    } else if (e.key === 'Escape') {
      if (document.querySelector('.modal-overlay')) return; // Dialog schließt sich selbst
      if (getCurrentView() === 'settings' || getCurrentView() === 'about' || getCurrentView() === 'passwords') navigate('dashboard');
    } else if (e.altKey && e.key === 'ArrowLeft' && getCurrentView() === 'browser') {
      api.browser.back(state.activeProfileId);
    } else if (e.altKey && e.key === 'ArrowRight' && getCurrentView() === 'browser') {
      api.browser.forward(state.activeProfileId);
    }
  });
}

async function createProfile() {
  const result = await openProfileDialog({ mode: 'create' });
  if (result) {
    await loadProfiles();
    if (!PROFILE_VIEWS.has(getCurrentView())) navigate('dashboard');
  }
}

/* ------------------------------------------------------------------ *
 * Command Palette (Strg + K)
 * ------------------------------------------------------------------ */

function openCommandPalette() {
  const existing = document.getElementById('cmd-palette-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay cmd-overlay';
  overlay.id = 'cmd-palette-overlay';

  overlay.innerHTML = `
    <div class="cmd-modal" role="dialog" aria-label="Schnellbefehle und Suche">
      <div class="cmd-search">
        <span class="cmd-search__icon">${icon('search', 17)}</span>
        <input type="text" id="cmd-input" placeholder="Datenbankprofil öffnen oder Befehl eingeben …" autocomplete="off" spellcheck="false" />
        <kbd class="kbd">ESC</kbd>
      </div>
      <div class="cmd-list" id="cmd-list" role="listbox"></div>
      <div class="cmd-footer">
        <span><kbd class="kbd">↑</kbd> <kbd class="kbd">↓</kbd> Navigieren</span>
        <span><kbd class="kbd">↵</kbd> Ausführen</span>
        <span><kbd class="kbd">Strg + N</kbd> Neues Profil</span>
      </div>
    </div>
  `;

  document.getElementById('modal-root').appendChild(overlay);

  const input = overlay.querySelector('#cmd-input');
  const listEl = overlay.querySelector('#cmd-list');
  let activeIndex = 0;
  let currentItems = [];

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };

  function buildItems(q) {
    const query = q.trim().toLowerCase();
    const items = [];

    for (const p of state.profiles) {
      const host = safeHost(p.url);
      const hay = `${p.name} ${p.category || ''} ${host} ${p.databaseName || ''}`.toLowerCase();
      if (!query || hay.includes(query)) {
        items.push({
          group: 'Datenbankprofile',
          iconName: p.iconName || DEFAULT_PROFILE_ICON,
          accent: p.accentColor || '#7c5cff',
          title: p.name,
          sub: [p.category, host, p.databaseName].filter(Boolean).join(' · '),
          badge: p.favorite ? 'Favorit' : 'Verbinden',
          run: () => openBrowserProfile(p)
        });
      }
    }

    const actions = [
      {
        group: 'Aktionen & Navigation',
        iconName: 'plus',
        title: 'Neues Datenbankprofil anlegen',
        sub: 'Neue phpMyAdmin-Verbindung konfigurieren',
        badge: 'Strg + N',
        run: () => createProfile()
      },
      {
        group: 'Aktionen & Navigation',
        iconName: 'activity',
        title: 'Erreichbarkeit aller Server prüfen',
        sub: 'Live-Status und Antwortzeiten aktualisieren',
        badge: 'Ping',
        run: () => {
          checkAllStatuses();
          showToast({ type: 'info', message: 'Statusprüfung für alle Profile gestartet.' });
        }
      },
      {
        group: 'Aktionen & Navigation',
        iconName: 'layout-dashboard',
        title: 'Zum Dashboard wechseln',
        sub: 'Übersicht und Statistiken öffnen',
        badge: 'Ansicht',
        run: () => navigate('dashboard')
      },
      {
        group: 'Aktionen & Navigation',
        iconName: 'database',
        title: 'Datenbankprofile verwalten',
        sub: 'Alle gespeicherten Verbindungen durchsuchen',
        badge: 'Ansicht',
        run: () => navigate('profiles')
      },
      {
        group: 'Aktionen & Navigation',
        iconName: 'terminal',
        title: 'SFTP & Dateitransfer öffnen',
        sub: 'Termius-Stil Dual-Pane SFTP-Client & Server-Manager',
        badge: 'SFTP',
        run: () => navigate('sftp')
      },
      {
        group: 'Aktionen & Navigation',
        iconName: 'blocks',
        title: 'Addons & Baukasten öffnen',
        sub: 'Erweiterungen, Designs & Werkzeuge verwalten oder neu erstellen',
        badge: 'Addons',
        run: () => navigate('addons')
      },
      {
        group: 'Aktionen & Navigation',
        iconName: 'palette',
        title: 'Erscheinungsbild umschalten (Dunkel / Hell)',
        sub: 'Zwischen Studio-Dark und Light-Design wechseln',
        badge: 'Design',
        run: async () => {
          const nextTheme = state.settings && state.settings.theme === 'light' ? 'dark' : 'light';
          const res = await api.settings.set({ theme: nextTheme });
          if (res && res.settings) {
            state.settings = res.settings;
            applyTheme();
          }
        }
      },
      {
        group: 'Aktionen & Navigation',
        iconName: 'key-round',
        title: 'Passwort-Manager öffnen',
        sub: 'Gespeicherte Passwörter für Profile mit zusätzlichem Zugriffsschutz verwalten',
        badge: 'Sicherheit',
        run: () => navigate('passwords')
      },
      {
        group: 'Aktionen & Navigation',
        iconName: 'settings',
        title: 'Einstellungen öffnen',
        sub: 'Design, App-Schutz, Einblendungen und Sitzungen verwalten',
        badge: 'System',
        run: () => navigate('settings')
      }
    ];

    if (state.vaultStatus && state.vaultStatus.initialized && state.vaultStatus.unlocked) {
      actions.push({
        group: 'Aktionen & Navigation',
        iconName: 'lock',
        title: 'App sofort sperren',
        sub: 'Schlüssel aus dem Arbeitsspeicher löschen und Sitzungen schließen',
        badge: 'Sicherheit',
        run: () => lockVaultNow()
      });
    }

    for (const a of actions) {
      const hay = `${a.title} ${a.sub} ${a.badge}`.toLowerCase();
      if (!query || hay.includes(query)) items.push(a);
    }

    return items;
  }

  function render() {
    currentItems = buildItems(input.value);
    if (activeIndex >= currentItems.length) activeIndex = Math.max(0, currentItems.length - 1);
    listEl.innerHTML = '';

    if (currentItems.length === 0) {
      listEl.innerHTML = `<div class="cmd-empty">Keine passenden Profile oder Befehle gefunden.</div>`;
      return;
    }

    let lastGroup = '';
    currentItems.forEach((item, idx) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        const g = document.createElement('div');
        g.className = 'cmd-group';
        g.textContent = item.group;
        listEl.appendChild(g);
      }
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'cmd-item' + (idx === activeIndex ? ' is-active' : '');
      row.innerHTML = `
        <span class="cmd-item__icon" ${item.accent ? `style="color:${escapeHtml(item.accent)};background:${escapeHtml(item.accent)}22"` : ''}>
          ${icon(item.iconName, 16)}
        </span>
        <span class="cmd-item__text">
          <span class="cmd-item__title">${escapeHtml(item.title)}</span>
          ${item.sub ? `<span class="cmd-item__sub">${escapeHtml(item.sub)}</span>` : ''}
        </span>
        ${item.badge ? `<span class="cmd-item__badge">${escapeHtml(item.badge)}</span>` : ''}
      `;
      row.addEventListener('mouseenter', () => {
        activeIndex = idx;
        updateActiveRow();
      });
      row.addEventListener('click', () => {
        close();
        item.run();
      });
      listEl.appendChild(row);
    });
  }

  function updateActiveRow() {
    const rows = listEl.querySelectorAll('.cmd-item');
    rows.forEach((r, idx) => {
      r.classList.toggle('is-active', idx === activeIndex);
      if (idx === activeIndex) r.scrollIntoView({ block: 'nearest' });
    });
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentItems.length > 0) {
        activeIndex = (activeIndex + 1) % currentItems.length;
        updateActiveRow();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentItems.length > 0) {
        activeIndex = (activeIndex - 1 + currentItems.length) % currentItems.length;
        updateActiveRow();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = currentItems[activeIndex];
      if (chosen) {
        close();
        chosen.run();
      }
    }
  }

  input.addEventListener('input', () => {
    activeIndex = 0;
    render();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  render();
  setTimeout(() => input.focus(), 20);
}

function shortHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url || 'dieser Adresse';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  boot().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    showToast({
      type: 'error',
      title: 'Startfehler',
      message: err.message || 'SQL Hub konnte nicht initialisiert werden.',
      timeout: 0
    });
  });
});
