// view.js – Umschaltung zwischen Dashboard, Datenbankprofile, Browser, Einstellungen und Über-Seite

import { icon } from './icons.js';
import { hydrateIcons } from './dom.js';

const VIEWS = {
  dashboard: { id: 'view-dashboard', title: 'Dashboard', sub: 'Übersicht & Status', icon: 'layout-dashboard' },
  profiles: { id: 'view-profiles', title: 'Datenbankprofile', sub: 'Verbindungsverwaltung', icon: 'database' },
  browser: { id: 'view-browser', title: 'phpMyAdmin', sub: 'Isolierte Sitzung', icon: 'globe' },
  sftp: { id: 'view-sftp', title: 'SFTP & Dateitransfer', sub: 'Termius-Stil Server & Dateien', icon: 'terminal' },
  addons: { id: 'view-addons', title: 'Addons & Baukasten', sub: 'Erweiterungen, Themes & Werkzeuge', icon: 'blocks' },
  'addon-custom': { id: 'view-addon-custom', title: 'Addon', sub: 'Erweiterung & Werkzeug', icon: 'file-text' },
  passwords: { id: 'view-passwords', title: 'Passwort-Manager', sub: 'Zusätzlicher Zugriffsschutz', icon: 'key-round' },
  settings: { id: 'view-settings', title: 'Einstellungen', sub: 'System, Design & App-Schutz', icon: 'settings' },
  about: { id: 'view-about', title: 'Über SQL Hub', sub: 'Architektur & Laufzeit', icon: 'info' }
};

export function setDynamicViewMeta(name, patch = {}) {
  if (!VIEWS[name]) return;
  if (patch.title) VIEWS[name].title = patch.title;
  if (patch.sub !== undefined) VIEWS[name].sub = patch.sub;
  if (patch.icon) VIEWS[name].icon = patch.icon;
  if (current === name) updateChrome();
}

let current = 'dashboard';
const beforeSwitchHandlers = new Set();

export function getCurrentView() {
  return current;
}

export function getViewId(name) {
  return VIEWS[name] ? VIEWS[name].id : null;
}

/** Registriert einen Handler, der vor jedem Wechsel ausgeführt wird. */
export function onBeforeSwitch(fn) {
  beforeSwitchHandlers.add(fn);
}

export function setView(name) {
  if (!VIEWS[name]) return;
  if (name !== current) {
    for (const fn of beforeSwitchHandlers) {
      try {
        fn(name, current);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('View-Wechsel-Handler-Fehler:', err);
      }
    }
  }

  for (const [key, meta] of Object.entries(VIEWS)) {
    const el = document.getElementById(meta.id);
    if (el) el.hidden = key !== name;
  }
  current = name;
  updateChrome();
}

export function initViews() {
  hydrateIcons();
  const brand = document.getElementById('brand-mark');
  if (brand && !brand.querySelector('img')) {
    brand.innerHTML = '<img src="../assets/sqlhubnew.png" class="brand__logo-img" alt="" />';
  }
  setView('dashboard');
}

function updateChrome() {
  const meta = VIEWS[current];

  // Titelzeile
  const iconEl = document.getElementById('titlebar-icon');
  const titleEl = document.getElementById('titlebar-title');
  const subEl = document.getElementById('titlebar-sub');
  if (iconEl) iconEl.innerHTML = icon(meta.icon, 15);
  if (titleEl) titleEl.textContent = meta.title;
  if (subEl) subEl.textContent = meta.sub || '';

  // Sidebar-Markierung
  document.querySelectorAll('.nav-item[data-view]').forEach((el) => {
    el.classList.toggle('is-active', el.getAttribute('data-view') === current);
  });
  if (current !== 'addon-custom') {
    document.querySelectorAll('.nav-item[data-addon-nav]').forEach((el) => {
      el.classList.remove('is-active');
    });
  }
}
