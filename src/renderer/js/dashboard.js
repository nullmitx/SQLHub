// dashboard.js – Launcher-Dashboard mit Hero-Start-Dock, Schnellstart-Leiste, Status-Kacheln & Profil-Grid

import { state, onChange } from './state.js';
import { createProfileGrid } from './profile-grid.js';
import { icon, DEFAULT_PROFILE_ICON } from './icons.js';
import { escapeHtml, safeHost, toFileUrl } from './dom.js';
import { openProfile } from './browser-ui.js';

const gridEl = document.getElementById('profile-grid');
const emptyEl = document.getElementById('empty-state');
const statsEl = document.getElementById('dash-stats');
const subEl = document.getElementById('dashboard-sub');
const searchEl = document.getElementById('search-input');
const filtersEl = document.getElementById('dash-filters');
const viewToggleEl = document.getElementById('dash-view-toggle');
const navCountEl = document.getElementById('nav-profile-count');

const heroNameplateEl = document.getElementById('launcher-hero-nameplate');
const heroEmblemEl = document.getElementById('launcher-hero-emblem');
const activeIconEl = document.getElementById('launcher-active-icon');
const activeCatEl = document.getElementById('launcher-active-cat');
const playBtnEl = document.getElementById('launcher-play-btn');
const playTitleEl = document.getElementById('launcher-play-title');
const playSubEl = document.getElementById('launcher-play-sub');
const switchBtnEl = document.getElementById('launcher-switch-btn');
const quickbarListEl = document.getElementById('launcher-quickbar-list');

let grid = null;
let selectedLauncherProfileId = null;

export function initDashboard() {
  grid = createProfileGrid({
    grid: gridEl,
    empty: emptyEl,
    searchInput: searchEl,
    filterContainer: filtersEl,
    viewToggle: viewToggleEl,
    defaultSort: 'recent',
    onRender: ({ total }) => {
      updateNavCount(total);
      renderLauncherDock();
      renderStats();
      if (subEl) {
        subEl.textContent =
          total === 0
            ? 'Keine Instanzen'
            : `${total} ${total === 1 ? 'Instanz' : 'Instanzen'}`;
      }
    },
    onStatus: () => {
      renderLauncherDock();
      renderStats();
    }
  });

  if (playBtnEl) {
    playBtnEl.addEventListener('click', () => {
      const primary = getPrimaryLauncherProfile();
      if (primary) {
        openProfile(primary);
      } else {
        window.dispatchEvent(new CustomEvent('sqlhub:create-profile'));
      }
    });
  }

  if (switchBtnEl) {
    switchBtnEl.addEventListener('click', () => {
      if ((state.profiles || []).length > 0) {
        window.dispatchEvent(new CustomEvent('sqlhub:command-palette'));
      } else {
        window.dispatchEvent(new CustomEvent('sqlhub:create-profile'));
      }
    });
  }

  document.getElementById('btn-add-profile').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('sqlhub:create-profile'));
  });
  document.getElementById('btn-add-profile-empty').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('sqlhub:create-profile'));
  });

  if (quickbarListEl) {
    quickbarListEl.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        quickbarListEl.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  onChange(() => {
    renderDashboard();
  });
}

function getSortedProfiles() {
  const list = [...(state.profiles || [])];
  list.sort((a, b) => {
    if (Boolean(b.favorite) !== Boolean(a.favorite)) return b.favorite ? 1 : -1;
    const la = a.lastOpenedAt || '';
    const lb = b.lastOpenedAt || '';
    if (la !== lb) return lb.localeCompare(la);
    return (a.name || '').localeCompare(b.name || '', 'de');
  });
  return list;
}

function getPrimaryLauncherProfile() {
  const all = getSortedProfiles();
  if (all.length === 0) return null;
  if (selectedLauncherProfileId) {
    const found = all.find((p) => p.id === selectedLauncherProfileId);
    if (found) return found;
  }
  return all[0];
}

export function renderDashboard() {
  if (grid) grid.render();
  renderLauncherDock();
  renderStats();
}

function renderLauncherDock() {
  const all = getSortedProfiles();
  const primary = getPrimaryLauncherProfile();

  if (primary) {
    const host = safeHost(primary.url);
    const dbPart = primary.databaseName ? ` · ${primary.databaseName}` : '';
    const accent = primary.accentColor || '#e53935';
    if (heroNameplateEl) heroNameplateEl.textContent = primary.name;
    if (activeCatEl) activeCatEl.textContent = primary.category || primary.serverNote || 'phpMyAdmin';
    if (playTitleEl) playTitleEl.textContent = `Starte ${primary.name}`;
    if (playSubEl) playSubEl.textContent = `${host || 'Direktverbindung'}${dbPart}`;

    if (heroEmblemEl) {
      heroEmblemEl.style.setProperty('--hero-instance-accent', accent);
      if (primary.iconFile) {
        heroEmblemEl.innerHTML = `<img src="${escapeHtml(toFileUrl(primary.iconFile))}" class="launcher-hero__logo-img launcher-hero__logo-img--custom" alt="${escapeHtml(primary.name)}" />`;
      } else {
        heroEmblemEl.innerHTML = `<span class="launcher-hero__instance-icon" style="color:${escapeHtml(accent)}">${icon(primary.iconName || DEFAULT_PROFILE_ICON, 54)}</span>`;
      }
    }
    if (activeIconEl) {
      activeIconEl.style.color = accent;
      activeIconEl.innerHTML = primary.iconFile
        ? `<img src="${escapeHtml(toFileUrl(primary.iconFile))}" style="width:12px;height:12px;object-fit:cover;border-radius:1px;display:block;" alt="" />`
        : icon(primary.iconName || DEFAULT_PROFILE_ICON, 12);
    }
  } else {
    if (heroNameplateEl) heroNameplateEl.textContent = 'SQL HUB';
    if (activeCatEl) activeCatEl.textContent = 'phpMyAdmin Launcher';
    if (playTitleEl) playTitleEl.textContent = 'Erste Instanz anlegen';
    if (playSubEl) playSubEl.textContent = 'Noch kein Datenbankprofil hinterlegt';
    if (heroEmblemEl) {
      heroEmblemEl.style.removeProperty('--hero-instance-accent');
      heroEmblemEl.innerHTML = `<img src="../assets/sqlhubnew.png" class="launcher-hero__logo-img" alt="SQL Hub" />`;
    }
    if (activeIconEl) {
      activeIconEl.style.color = '';
      activeIconEl.innerHTML = icon('database', 12);
    }
  }

  if (!quickbarListEl) return;
  quickbarListEl.innerHTML = '';

  if (all.length === 0) {
    const emptyChip = document.createElement('button');
    emptyChip.type = 'button';
    emptyChip.className = 'quickplay-chip';
    emptyChip.innerHTML = `
      <span class="quickplay-chip__icon">${icon('plus', 11)}</span>
      <span>+ Instanz hinzufügen</span>
    `;
    emptyChip.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('sqlhub:create-profile'));
    });
    quickbarListEl.appendChild(emptyChip);
    return;
  }

  for (const p of all) {
    const st = state.statuses.get(p.id);
    const isOnline = st && st.state === 'online';
    const isSelected = primary && primary.id === p.id;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'quickplay-chip' + (isSelected ? ' is-selected' : '');
    chip.title = `${p.name} (${safeHost(p.url)}) direkt starten`;

    const iconHtml = p.iconFile
      ? `<img src="${escapeHtml(toFileUrl(p.iconFile))}" alt="" />`
      : icon(p.iconName || DEFAULT_PROFILE_ICON, 12);

    chip.innerHTML = `
      <span class="quickplay-chip__icon" style="color:${escapeHtml(p.accentColor || '#e53935')}">${iconHtml}</span>
      <span>${escapeHtml(p.name)}</span>
      <span class="quickplay-chip__dot ${isOnline ? 'quickplay-chip__dot--online' : ''}"></span>
    `;
    chip.addEventListener('mouseenter', () => {
      if (selectedLauncherProfileId !== p.id) {
        selectedLauncherProfileId = p.id;
        renderLauncherDock();
      }
    });
    chip.addEventListener('click', () => {
      selectedLauncherProfileId = p.id;
      renderLauncherDock();
      openProfile(p);
    });
    quickbarListEl.appendChild(chip);
  }
}

function updateNavCount(total) {
  if (!navCountEl) return;
  navCountEl.textContent = String(total);
}

function renderStats() {
  if (!statsEl) return;
  const profiles = state.profiles || [];
  const total = profiles.length;
  let online = 0;
  let favorites = 0;
  let protectedCount = 0;

  for (const p of profiles) {
    const s = state.statuses.get(p.id);
    if (s && s.state === 'online') online++;
    if (p.favorite) favorites++;
    if (p.lockEnabled || p.hasCredentials) protectedCount++;
  }

  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-card__icon">${icon('database', 16)}</div>
      <div class="stat-card__body">
        <div class="stat-card__value">${total}</div>
        <div class="stat-card__label">Instanzen</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-card__icon stat-card__icon--ok">${icon('wifi', 16)}</div>
      <div class="stat-card__body">
        <div class="stat-card__value">${online} / ${total}</div>
        <div class="stat-card__label">Online</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-card__icon stat-card__icon--accent">${icon('star', 16)}</div>
      <div class="stat-card__body">
        <div class="stat-card__value">${favorites}</div>
        <div class="stat-card__label">Favoriten</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-card__icon stat-card__icon--warn">${icon('shield', 16)}</div>
      <div class="stat-card__body">
        <div class="stat-card__value">${protectedCount}</div>
        <div class="stat-card__label">Geschützt</div>
      </div>
    </div>
  `;
}
