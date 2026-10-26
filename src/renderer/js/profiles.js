// profiles.js – eigenständige Verwaltungsseite für Datenbankprofile

import { onChange } from './state.js';
import { createProfileGrid } from './profile-grid.js';
import { enhanceSelect } from './dom.js';

const gridEl = document.getElementById('profiles-grid');
const emptyEl = document.getElementById('profiles-empty');
const searchInput = document.getElementById('profiles-search');
const sortSelect = document.getElementById('profiles-sort');
const filterContainer = document.getElementById('profiles-filters');
const viewToggle = document.getElementById('profiles-view-toggle');
const subtitle = document.getElementById('profiles-sub');

let grid = null;

export function initProfiles() {
  enhanceSelect(sortSelect);
  grid = createProfileGrid({
    grid: gridEl,
    empty: emptyEl,
    searchInput,
    sortSelect,
    filterContainer,
    viewToggle,
    defaultSort: 'recent',
    onRender: ({ total, matches }) => updateSubtitle(total, matches)
  });

  document.getElementById('btn-add-profile-2').addEventListener('click', () => window.dispatchEvent(new CustomEvent('sqlhub:create-profile')));
  document.getElementById('btn-add-profile-2-empty').addEventListener('click', () => window.dispatchEvent(new CustomEvent('sqlhub:create-profile')));

  onChange(() => {
    if (grid) grid.render();
  });
}

export function renderProfiles() {
  if (grid) grid.render();
}

function updateSubtitle(total, matches) {
  if (!subtitle) return;
  if (total === 0) {
    subtitle.textContent = 'Verwalte, gruppiere und öffne deine gespeicherten Instanzen';
  } else {
    const base = `${total} gespeicherte${total === 1 ? ' Verbindung' : ' Verbindungen'}`;
    subtitle.textContent = matches < total ? `${base} · ${matches} Treffer angezeigt` : base;
  }
}
