// profile-grid.js – wiederverwendbares Profilkarten-Raster mit Suche, Schnellfiltern,
// Sortierung, Ansichtsumschaltung (Grid/Liste), Statusprüfung mit Latenz und Kontextmenü.

import { api, unwrap } from './api.js';
import { state, setStatus, loadProfiles, emit } from './state.js';
import { showToast } from './toast.js';
import { icon, DEFAULT_PROFILE_ICON } from './icons.js';
import { openProfileDialog } from './profile-dialog.js';
import { openProfile as openBrowserProfile } from './browser-ui.js';
import { confirmDialog } from './confirm.js';
import { escapeHtml, hexToRgba, safeHost, toFileUrl, cssEscape } from './dom.js';

const STATUS_LABELS = {
  unknown: 'Ungeprüft',
  checking: 'Prüfe …',
  online: 'Erreichbar',
  offline: 'Nicht erreichbar'
};

let openMenu = null;

function closeMenu() {
  if (openMenu) {
    openMenu.remove();
    openMenu = null;
  }
}

document.addEventListener('click', (e) => {
  if (openMenu && !e.target.closest('.context-menu')) closeMenu();
});
window.addEventListener('blur', closeMenu);
window.addEventListener('resize', closeMenu);

function formatStatusText(status) {
  if (!status || !status.state) return STATUS_LABELS.unknown;
  const base = STATUS_LABELS[status.state] || STATUS_LABELS.unknown;
  if (status.state === 'online' && status.detail && typeof status.detail.latencyMs === 'number') {
    return `${base} · ${status.detail.latencyMs} ms`;
  }
  return base;
}

/**
 * Prüft alle vorhandenen Profile neu auf Erreichbarkeit.
 */
export async function checkAllStatuses() {
  if (!state.profiles || state.profiles.length === 0) return;
  for (const p of state.profiles) {
    setStatus(p.id, { state: 'unknown' });
  }
  emit();
}

/**
 * Erstellt ein Raster-Objekt, das seine Karten in das übergebene Element rendert.
 * @param {{
 *   grid: HTMLElement,
 *   empty?: HTMLElement,
 *   searchInput?: HTMLInputElement,
 *   sortSelect?: HTMLSelectElement,
 *   filterContainer?: HTMLElement,
 *   viewToggle?: HTMLElement,
 *   defaultSort?: string,
 *   onRender?: (visible: { total: number, matches: number }) => void,
 *   onStatus?: () => void
 * }} config
 */
export function createProfileGrid(config) {
  const {
    grid,
    empty = null,
    searchInput = null,
    sortSelect = null,
    filterContainer = null,
    viewToggle = null,
    defaultSort = 'recent',
    onRender = null,
    onStatus = null
  } = config;

  let query = '';
  let sort = defaultSort;
  let activeFilter = 'all';

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      query = searchInput.value.trim().toLowerCase();
      render();
    });
  }
  if (sortSelect) {
    sortSelect.value = sort;
    sortSelect.addEventListener('change', () => {
      sort = sortSelect.value;
      render();
    });
  }
  if (filterContainer) {
    filterContainer.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFilter = btn.getAttribute('data-filter') || 'all';
        filterContainer.querySelectorAll('[data-filter]').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
        render();
      });
    });
  }
  if (viewToggle) {
    viewToggle.querySelectorAll('[data-layout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-layout') === 'list' ? 'list' : 'grid';
        state.layoutMode = mode;
        document.querySelectorAll('[data-layout]').forEach((b) => {
          b.classList.toggle('is-active', b.getAttribute('data-layout') === mode);
        });
        emit();
      });
    });
  }

  function collect() {
    let list = [...state.profiles];

    if (activeFilter === 'favorites') {
      list = list.filter((p) => Boolean(p.favorite));
    } else if (activeFilter === 'online') {
      list = list.filter((p) => {
        const s = state.statuses.get(p.id);
        return s && s.state === 'online';
      });
    } else if (activeFilter === 'locked') {
      list = list.filter((p) => Boolean(p.lockEnabled));
    }

    if (sort === 'name') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
    } else if (sort === 'favorites') {
      list.sort((a, b) => {
        if (Boolean(b.favorite) !== Boolean(a.favorite)) return b.favorite ? 1 : -1;
        return (a.name || '').localeCompare(b.name || '', 'de');
      });
    } else if (sort === 'category') {
      list.sort((a, b) => {
        const ca = (a.category || 'zzz').toLowerCase();
        const cb = (b.category || 'zzz').toLowerCase();
        if (ca !== cb) return ca.localeCompare(cb, 'de');
        return (a.name || '').localeCompare(b.name || '', 'de');
      });
    } else if (sort === 'created') {
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } else {
      list.sort((a, b) => {
        if (Boolean(b.favorite) !== Boolean(a.favorite)) return b.favorite ? 1 : -1;
        const la = a.lastOpenedAt || '';
        const lb = b.lastOpenedAt || '';
        if (la !== lb) return lb.localeCompare(la);
        return (a.name || '').localeCompare(b.name || '', 'de');
      });
    }

    if (query) {
      list = list.filter((p) => {
        const haystack = [p.name, p.description, p.category, p.url, p.databaseName, p.serverNote]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      });
    }
    return list;
  }

  function render() {
    const visible = collect();
    const total = state.profiles.length;
    grid.innerHTML = '';
    grid.classList.toggle('profile-grid--list', state.layoutMode === 'list');

    if (total === 0) {
      if (empty) empty.hidden = false;
      grid.hidden = true;
      if (onRender) onRender({ total, matches: 0 });
      return;
    }
    if (empty) empty.hidden = true;
    grid.hidden = false;

    if (visible.length === 0) {
      const noResult = document.createElement('div');
      noResult.className = 'empty-state';
      noResult.innerHTML = `
        <div class="empty-state__icon">${icon('search-x', 28)}</div>
        <h2>Keine passenden Profile gefunden</h2>
        <p>Passe deinen Suchbegriff oder den gewählten Schnellfilter an.</p>`;
      grid.appendChild(noResult);
      if (onRender) onRender({ total, matches: 0 });
      return;
    }

    visible.forEach((profile, index) => {
      const card = buildCard(profile);
      card.style.animationDelay = `${Math.min(index * 25, 200)}ms`;
      grid.appendChild(card);
    });

    if (onRender) onRender({ total, matches: visible.length });

    if (state.settings && state.settings.statusCheckEnabled === false) return;
    for (const profile of visible) {
      if (!state.statuses.has(profile.id) || state.statuses.get(profile.id).state === 'unknown') {
        checkProfileStatus(profile);
      }
    }
  }

  function buildCard(profile) {
    const card = document.createElement('article');
    card.className = 'card' + (profile.favorite ? ' card--favorite' : '');
    card.setAttribute('role', 'listitem');
    card.dataset.profileId = profile.id;
    const accent = profile.accentColor || '#e53935';
    card.style.setProperty('--card-accent', accent);
    card.style.setProperty('--card-accent-soft', hexToRgba(accent, 0.15));
    card.style.setProperty('--card-accent-glow', hexToRgba(accent, 0.24));

    const status = state.statuses.get(profile.id) || { state: 'unknown' };
    const statusText = formatStatusText(status);
    const hasCreds = Boolean(profile.hasCredentials);
    const host = safeHost(profile.url);
    const isFav = Boolean(profile.favorite);

    card.innerHTML = `
      <div class="card__glow" aria-hidden="true"></div>
      <div class="card__top">
        <div class="card__icon"></div>
        <div class="card__titles">
          <div class="card__name-row">
            <h3 class="card__name"></h3>
            ${profile.category ? `<span class="badge badge--category">${escapeHtml(profile.category)}</span>` : ''}
            ${profile.lockEnabled ? `<span class="badge badge--lock" title="Durch eigenes Profil-Passwort geschützt">${icon('lock', 11)} ${profile.unlocked ? 'Entsperrt' : 'Geschützt'}</span>` : ''}
          </div>
          <p class="card__desc"></p>
        </div>
        <div class="card__actions-top">
          <button class="card__fav-btn ${isFav ? 'is-active' : ''}" data-fav title="${isFav ? 'Aus Favoriten entfernen' : 'Als Favorit anheften'}" aria-label="Favorit">
            ${icon('star', 15)}
          </button>
          <button class="card__menu-btn" data-menu title="Weitere Aktionen" aria-label="Weitere Aktionen">
            ${icon('ellipsis-vertical', 17)}
          </button>
        </div>
      </div>

      <div class="card__meta">
        <div class="card__status-bar">
          <span class="badge badge--db">${icon('database', 12)} ${escapeHtml(profile.serverNote || 'MySQL / MariaDB')}</span>
          <span class="status-pill status-pill--${status.state}" data-status-pill>
            <span class="status-dot status-dot--${status.state}" title="${statusText}"></span>
            <span data-status-label>${escapeHtml(statusText)}</span>
          </span>
        </div>
        <div class="card__specs">
          <div class="card__meta-row" title="${escapeHtml(profile.url || '')}">
            ${icon('globe', 13)}
            <span class="card__mono">${escapeHtml(host || 'Keine URL hinterlegt')}</span>
          </div>
          ${profile.databaseName ? `
          <div class="card__meta-row" title="Datenbank: ${escapeHtml(profile.databaseName)}">
            ${icon('hard-drive', 13)}
            <span class="card__mono">${escapeHtml(profile.databaseName)}</span>
          </div>` : ''}
          <div class="card__meta-row">
            ${icon(hasCreds ? 'shield-check' : 'key-round', 13)}
            <span>${hasCreds ? (profile.autoLogin !== false ? 'DPAPI-Login & Auto-Connect aktiv' : 'Zugangsdaten verschlüsselt hinterlegt') : 'Manuelle Anmeldung im Browser'}</span>
          </div>
        </div>
      </div>

      <div class="card__footer">
        <button class="btn btn--primary card__open-btn" data-open>
          ${icon('external-link', 14)}
          <span>Verbinden</span>
        </button>
        <button class="btn btn--subtle btn--icon" data-edit title="Profil bearbeiten" aria-label="Profil bearbeiten">
          ${icon('pencil', 15)}
        </button>
      </div>
    `;

    const iconEl = card.querySelector('.card__icon');
    if (profile.iconFile) {
      const img = document.createElement('img');
      img.src = toFileUrl(profile.iconFile);
      img.alt = '';
      img.onerror = () => { iconEl.innerHTML = icon(profile.iconName || DEFAULT_PROFILE_ICON, 22); };
      iconEl.innerHTML = '';
      iconEl.appendChild(img);
    } else {
      iconEl.innerHTML = icon(profile.iconName || DEFAULT_PROFILE_ICON, 22);
    }

    card.querySelector('.card__name').textContent = profile.name;
    card.querySelector('.card__desc').textContent = profile.description || 'Direktverbindung zur Datenbank-Instanz';

    card.querySelector('[data-open]').addEventListener('click', () => openBrowserProfile(profile));
    card.querySelector('[data-edit]').addEventListener('click', () => editProfile(profile));
    card.querySelector('[data-fav]').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(profile);
    });
    card.querySelector('[data-menu]').addEventListener('click', (e) => {
      e.stopPropagation();
      openContextMenu(profile, e.currentTarget);
    });
    card.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      openBrowserProfile(profile);
    });

    return card;
  }

  function openContextMenu(profile, anchor) {
    closeMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const items = [
      { label: 'In Sitzung öffnen', icon: 'external-link', onClick: () => openBrowserProfile(profile) },
      { label: profile.favorite ? 'Favorit entfernen' : 'Als Favorit markieren', icon: 'star', onClick: () => toggleFavorite(profile) },
      { label: 'Erreichbarkeit prüfen', icon: 'activity', onClick: () => checkProfileStatus(profile) },
      'divider',
      { label: 'Profil bearbeiten', icon: 'pencil', onClick: () => editProfile(profile) },
      { label: 'Zugangsdaten verwalten', icon: 'key-round', onClick: () => editCredentials(profile) },
      { label: 'Profil duplizieren', icon: 'copy', onClick: () => duplicateProfile(profile) },
      'divider',
      { label: 'Browser-Sitzung zurücksetzen', icon: 'rotate-ccw', onClick: () => resetSession(profile) },
      { label: 'Profil löschen', icon: 'trash-2', danger: true, onClick: () => deleteProfile(profile) }
    ];

    for (const item of items) {
      if (item === 'divider') {
        menu.appendChild(document.createElement('hr'));
        continue;
      }
      const btn = document.createElement('button');
      if (item.danger) btn.classList.add('is-danger');
      btn.innerHTML = `${icon(item.icon, 15)}<span>${item.label}</span>`;
      btn.addEventListener('click', () => {
        closeMenu();
        item.onClick();
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = rect.right - menuRect.width;
    let top = rect.bottom + 6;
    if (top + menuRect.height > window.innerHeight - 12) top = rect.top - menuRect.height - 6;
    menu.style.left = `${Math.max(10, left)}px`;
    menu.style.top = `${Math.max(10, top)}px`;
    openMenu = menu;
  }

  function updateCardStatus(profileId) {
    const card = grid.querySelector(`[data-profile-id="${cssEscape(profileId)}"]`);
    if (!card) return;
    const status = state.statuses.get(profileId) || { state: 'unknown' };
    const statusText = formatStatusText(status);
    const pill = card.querySelector('[data-status-pill]');
    if (pill) pill.className = `status-pill status-pill--${status.state}`;
    const dot = card.querySelector('.status-dot');
    if (dot) {
      dot.className = `status-dot status-dot--${status.state}`;
      dot.title = statusText;
    }
    const label = card.querySelector('[data-status-label]');
    if (label) label.textContent = statusText;
    if (onStatus) onStatus();
  }

  async function checkProfileStatus(profile) {
    if (!profile.url) return;
    setStatus(profile.id, { state: 'checking' });
    updateCardStatus(profile.id);
    try {
      const res = await api.status.check(profile.url);
      if (res.ok && res.status && res.status.reachable) {
        setStatus(profile.id, { state: 'online', detail: res.status });
      } else {
        setStatus(profile.id, { state: 'offline', detail: res.status });
      }
    } catch {
      setStatus(profile.id, { state: 'offline' });
    }
    updateCardStatus(profile.id);
  }

  async function toggleFavorite(profile) {
    try {
      const res = await api.profiles.update(profile.id, {
        ...profile,
        favorite: !profile.favorite
      });
      unwrap(res);
      await loadProfiles();
    } catch (err) {
      showToast({ type: 'error', message: err.message });
    }
  }

  async function editProfile(profile) {
    const result = await openProfileDialog({ mode: 'edit', profile });
    if (result) await loadProfiles();
  }

  async function editCredentials(profile) {
    const result = await openProfileDialog({ mode: 'credentials', profile });
    if (result) await loadProfiles();
  }

  async function duplicateProfile(profile) {
    try {
      const res = await api.profiles.duplicate(profile.id);
      unwrap(res);
      showToast({ type: 'success', message: `„${profile.name}“ wurde dupliziert.` });
      await loadProfiles();
    } catch (err) {
      showToast({ type: 'error', message: err.message });
    }
  }

  async function resetSession(profile) {
    try {
      const res = await api.sessions.reset(profile.id);
      unwrap(res);
      showToast({ type: 'success', message: `Browser-Sitzung von „${profile.name}“ zurückgesetzt.` });
    } catch (err) {
      showToast({ type: 'error', message: err.message });
    }
  }

  async function deleteProfile(profile) {
    const confirmed = await confirmDialog({
      title: 'Datenbankprofil löschen',
      message: `Möchtest du das Profil „${profile.name}“ wirklich unwiderruflich entfernen? Gespeicherte Zugangsdaten und die isolierte Browser-Sitzung werden ebenfalls gelöscht.`,
      confirmLabel: 'Endgültig löschen',
      danger: true
    });
    if (!confirmed) return;
    try {
      const res = await api.profiles.remove(profile.id);
      unwrap(res);
      state.statuses.delete(profile.id);
      showToast({ type: 'success', message: `Profil „${profile.name}“ gelöscht.` });
      await loadProfiles();
    } catch (err) {
      showToast({ type: 'error', message: err.message });
    }
  }

  return { render, refresh: render };
}
