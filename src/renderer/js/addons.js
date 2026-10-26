// addons.js – Addon-Manager, Custom Installations-/Deinstallations-Assistent,
// Keep-Alive Multimedia-Engine (Musik/YouTube/Spotify) & Notizen-Workbench

import { api, events } from './api.js';
import { icon } from './icons.js';
import { escapeHtml, enhanceSelect } from './dom.js';
import { showToast } from './toast.js';
import { setView, setDynamicViewMeta, getCurrentView, onBeforeSwitch } from './view.js';

const addonState = {
  addons: [],
  directory: '',
  activeAddonId: null,
  searchQuery: '',
  statusFilter: 'all',
  notesFilter: '',
  notesCategory: 'all',
  selectedNoteId: null,
  guideTab: 'manifest',
  mountedKeepAlive: new Map(), // addonId -> HTMLElement
  miniPlayer: null // { addonId, active, title, subtitle, playing, onToggle, onNext }
};

let initialized = false;

export async function initAddons() {
  if (initialized) return;
  initialized = true;

  events.on('addons:changed', async () => {
    await refreshAddonsState();
    const viewEl = document.getElementById('view-addons');
    if (viewEl && !viewEl.hidden) {
      renderAddons();
    }
  });

  onBeforeSwitch((nextView) => {
    updateMiniPlayerVisibility(nextView);
  });

  await refreshAddonsState();
}

export async function refreshAddonsState() {
  try {
    const res = await api.addons.list();
    if (res && res.ok) {
      addonState.addons = Array.isArray(res.addons) ? res.addons : [];
      addonState.directory = res.directory || '';
      applyActiveAddonStyles();
      syncAddonSidebarItems();
      updateAddonCountBadge();
      cleanupDisabledKeepAliveContainers();
    }
  } catch {
    /* ignore */
  }
}

function cleanupDisabledKeepAliveContainers() {
  for (const [id, el] of addonState.mountedKeepAlive.entries()) {
    const stillActive = addonState.addons.some((a) => a.id === id && a.enabled);
    if (!stillActive) {
      try { el.remove(); } catch { /* ignore */ }
      addonState.mountedKeepAlive.delete(id);
      if (addonState.miniPlayer && addonState.miniPlayer.addonId === id) {
        addonState.miniPlayer = null;
        renderMiniPlayerBar();
      }
    }
  }
}

function updateAddonCountBadge() {
  const badge = document.getElementById('nav-addons-count');
  if (!badge) return;
  const enabledCount = addonState.addons.filter((a) => a.enabled).length;
  badge.textContent = String(enabledCount);
  badge.hidden = enabledCount === 0;
}

/**
 * Injiziert die CSS-Dateien aller aktivierten Addons live in `<head>`.
 */
function applyActiveAddonStyles() {
  document.querySelectorAll('style[data-sqlhub-addon]').forEach((el) => el.remove());
  for (const addon of addonState.addons) {
    if (!addon.enabled || !addon.cssContent) continue;
    const style = document.createElement('style');
    style.setAttribute('data-sqlhub-addon', addon.id);
    style.textContent = addon.cssContent;
    document.head.appendChild(style);
  }
}

/**
 * Rendert für jedes aktive Werkzeug-Addon ein eigenes Icon direkt unterhalb von `SFTP`
 * in der linken Hauptnavigation.
 */
function syncAddonSidebarItems() {
  const slot = document.getElementById('sidebar-addon-items');
  if (!slot) return;
  slot.innerHTML = '';

  const toolAddons = addonState.addons.filter((a) => a.enabled && a.sidebar);
  for (const addon of toolAddons) {
    const isCurrent = getCurrentView() === 'addon-custom' && addonState.activeAddonId === addon.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-item nav-item--addon' + (isCurrent ? ' is-active' : '');
    btn.setAttribute('data-addon-nav', addon.id);
    btn.title = `${addon.sidebar.title || addon.name} (Addon)`;
    btn.innerHTML = `
      <span class="nav-item__icon">${icon(addon.sidebar.icon || 'file-text', 19)}</span>
      <span class="nav-item__label">${escapeHtml(addon.sidebar.label || addon.name)}</span>
    `;
    btn.addEventListener('click', () => {
      openAddonToolView(addon.id);
    });
    slot.appendChild(btn);
  }
}

/**
 * Öffnet die eigene Seite eines Sidebar-Addons (unter SFTP).
 */
export async function openAddonToolView(addonId) {
  const addon = addonState.addons.find((a) => a.id === addonId && a.enabled && a.sidebar);
  if (!addon) return;

  addonState.activeAddonId = addon.id;
  setDynamicViewMeta('addon-custom', {
    title: addon.sidebar.title || addon.name,
    sub: addon.sidebar.subtitle || `Addon · v${addon.version}`,
    icon: addon.sidebar.icon || 'file-text'
  });
  setView('addon-custom');
  updateMiniPlayerVisibility('addon-custom');

  document.querySelectorAll('.nav-item[data-addon-nav]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-addon-nav') === addon.id);
  });

  const root = document.getElementById('view-addon-custom');
  if (!root) return;

  // Alle evtl. gemounteten Keep-Alive-Container anderer Addons ausblenden
  for (const [id, container] of addonState.mountedKeepAlive.entries()) {
    container.hidden = id !== addon.id;
  }

  let stage = root.querySelector('#addon-transient-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = 'addon-transient-stage';
    root.appendChild(stage);
  }

  if (addon.sidebar.keepAlive) {
    stage.hidden = true;
    stage.innerHTML = '';
    if (addonState.mountedKeepAlive.has(addon.id)) {
      const existing = addonState.mountedKeepAlive.get(addon.id);
      existing.hidden = false;
      return;
    }
    const keepContainer = document.createElement('div');
    keepContainer.className = 'addon-keepalive-container';
    keepContainer.setAttribute('data-keepalive-addon', addon.id);
    root.appendChild(keepContainer);
    addonState.mountedKeepAlive.set(addon.id, keepContainer);
    await renderCustomAddonWorkspace(keepContainer, addon);
  } else {
    stage.hidden = false;
    if (addon.sidebar.template === 'notes') {
      await renderNotesAddonWorkspace(stage, addon);
    } else {
      await renderCustomAddonWorkspace(stage, addon);
    }
  }
}

/* --------------------- Schwebende Mini-Player-Leiste (für Musik-Addons) --------------------- */

function updateMiniPlayerVisibility(targetView = getCurrentView()) {
  renderMiniPlayerBar(targetView);
}

function renderMiniPlayerBar(currentView = getCurrentView()) {
  let bar = document.getElementById('addon-miniplayer-bar');
  const mp = addonState.miniPlayer;
  const isViewingThisAddon = currentView === 'addon-custom' && mp && addonState.activeAddonId === mp.addonId;

  if (!mp || !mp.active || isViewingThisAddon) {
    if (bar) bar.hidden = true;
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'addon-miniplayer-bar';
    bar.className = 'addon-miniplayer';
    document.body.appendChild(bar);
  }

  bar.hidden = false;
  bar.innerHTML = `
    <div class="addon-miniplayer__icon">${icon('music', 15)}</div>
    <div class="addon-miniplayer__meta" id="addon-mp-open" title="Zum Musik-Player wechseln">
      <div class="addon-miniplayer__title">${escapeHtml(mp.title || 'Musik läuft')}</div>
      <div class="addon-miniplayer__sub">${escapeHtml(mp.subtitle || 'Addon im Hintergrund aktiv')}</div>
    </div>
    <div class="addon-miniplayer__btns">
      <button type="button" class="btn btn--xs btn--primary" id="addon-mp-toggle" title="Play / Pause">
        ${mp.playing ? '⏸' : '▶'}
      </button>
      <button type="button" class="btn btn--xs btn--ghost" id="addon-mp-next" title="Nächster Titel">⏭</button>
      <button type="button" class="btn btn--xs btn--ghost" id="addon-mp-goto" title="Player öffnen">Öffnen</button>
    </div>
  `;

  bar.querySelector('#addon-mp-toggle')?.addEventListener('click', () => {
    if (typeof mp.onToggle === 'function') mp.onToggle();
  });
  bar.querySelector('#addon-mp-next')?.addEventListener('click', () => {
    if (typeof mp.onNext === 'function') mp.onNext();
  });
  bar.querySelector('#addon-mp-open')?.addEventListener('click', () => {
    openAddonToolView(mp.addonId);
  });
  bar.querySelector('#addon-mp-goto')?.addEventListener('click', () => {
    openAddonToolView(mp.addonId);
  });
}

/* --------------------- 1. Addon-Verwaltungsseite (#view-addons) --------------------- */

export async function renderAddons() {
  await refreshAddonsState();
  const root = document.getElementById('view-addons');
  if (!root) return;

  const enabledCount = addonState.addons.filter((a) => a.enabled).length;
  const q = addonState.searchQuery.trim().toLowerCase();
  const filteredAddons = addonState.addons.filter((a) => {
    if (addonState.statusFilter === 'enabled' && !a.enabled) return false;
    if (addonState.statusFilter === 'disabled' && a.enabled) return false;
    if (addonState.statusFilter === 'tool' && a.type === 'theme') return false;
    if (addonState.statusFilter === 'theme' && a.type !== 'theme') return false;
    if (!q) return true;
    return (
      (a.name || '').toLowerCase().includes(q) ||
      (a.id || '').toLowerCase().includes(q) ||
      (a.description || '').toLowerCase().includes(q) ||
      (a.author || '').toLowerCase().includes(q)
    );
  });

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__titles">
        <div class="page-eyebrow">1-DATEI ADDON-SYSTEM (.JS) · ERWEITERUNGEN, THEMES &amp; MULTIMEDIA</div>
        <h1 class="page-title">Addons &amp; Baukasten</h1>
        <p class="page-sub">Erstelle in VS Code einfach eine einzige Datei (z. B. <code>meinaddon.js</code>), klicke auf <strong>+ Addon hinzufügen (.js wählen)</strong> und aktiviere dein Addon per Schalter</p>
      </div>
      <div class="page-head__actions">
        <button type="button" class="btn btn--ghost" id="addons-btn-rescan" title="Ordner SQLHubAddons neu einlesen">
          ${icon('refresh-cw', 14)}
          <span>Neu scannen</span>
        </button>
        <button type="button" class="btn btn--ghost" id="addons-btn-open-folder" title="Ordner SQLHubAddons im Explorer öffnen">
          ${icon('folder-open', 14)}
          <span>Ordner öffnen</span>
        </button>
        <button type="button" class="btn btn--primary" id="addons-btn-load-folder" title="Eine einzelne .js Addon-Datei (z. B. meinaddon.js) auswählen und installieren">
          ${icon('plus', 15)}
          <span>+ Addon hinzufügen (.js wählen)</span>
        </button>
        <button type="button" class="btn btn--subtle" id="addons-btn-install" title="Custom Addon-Installations-Assistent öffnen">
          ${icon('download', 14)}
          <span>Setup-Assistent</span>
        </button>
        <button type="button" class="btn btn--subtle" id="addons-btn-create">
          ${icon('sparkles', 14)}
          <span>Baukasten (.js generieren)</span>
        </button>
      </div>
    </div>

    <div class="addons-summary-bar">
      <div class="addons-summary-bar__item">
        <span class="addons-summary-bar__icon">${icon('blocks', 18)}</span>
        <div class="addons-summary-bar__text">
          <strong>${addonState.addons.length} Addons installiert · ${enabledCount} aktiv (1-Datei <code>.js</code> Architektur)</strong>
          <span>Hauptordner: <code>${escapeHtml(addonState.directory)}</code></span>
        </div>
      </div>
      <div class="addons-summary-bar__hint">
        ${icon('sparkles', 13)}
        <span>Addons bestehen aus <strong>nur 1 einzigen <code>.js</code>-Datei</strong> und sind standardmäßig <strong>deaktiviert</strong>, bis du sie per Schalter einschaltest.</span>
      </div>
    </div>

    <div class="addons-toolbar">
      <div class="search" style="flex:1;min-width:240px;max-width:440px;">
        ${icon('search', 14)}
        <input type="search" id="addons-search-input" value="${escapeHtml(addonState.searchQuery)}" placeholder="Addons nach Name, ID oder Funktion durchsuchen …" />
      </div>
      <div class="filter-pills">
        <button type="button" class="filter-pill ${addonState.statusFilter === 'all' ? 'is-active' : ''}" data-addon-filter="all">Alle (${addonState.addons.length})</button>
        <button type="button" class="filter-pill ${addonState.statusFilter === 'enabled' ? 'is-active' : ''}" data-addon-filter="enabled">Aktiviert (${enabledCount})</button>
        <button type="button" class="filter-pill ${addonState.statusFilter === 'disabled' ? 'is-active' : ''}" data-addon-filter="disabled">Deaktiviert (${addonState.addons.length - enabledCount})</button>
        <button type="button" class="filter-pill ${addonState.statusFilter === 'tool' ? 'is-active' : ''}" data-addon-filter="tool">Werkzeuge</button>
        <button type="button" class="filter-pill ${addonState.statusFilter === 'theme' ? 'is-active' : ''}" data-addon-filter="theme">Themes</button>
      </div>
    </div>

    <div class="addons-grid">
      ${filteredAddons.length > 0
        ? filteredAddons.map((a) => renderAddonCard(a)).join('')
        : `<div class="panel" style="grid-column:1 / -1;text-align:center;padding:28px;">
            <p class="muted" style="margin:0 0 10px;">Keine passenden Addons für deine Suche gefunden.</p>
            <button type="button" class="btn btn--subtle btn--sm" id="addons-btn-reset-filter">Filter zurücksetzen</button>
          </div>`}
    </div>

    <!-- Ausführliche Entwickler-Referenz direkt in der App (1-Datei .js System) -->
    <div class="panel addons-guide-panel">
      <div class="addons-guide-head">
        <div>
          <h2 style="margin:0;">${icon('terminal', 16)} Anleitung: Eigenes Addon in nur 1 einzigen Datei (<code>meinaddon.js</code>) erstellen</h2>
          <p class="panel__desc" style="margin:4px 0 0;">Keine 3 oder 4 Einzeldateien nötig! Öffne VS Code, erstelle <code>meinaddon.js</code>, füge den Code unten ein und wähle die Datei oben über <strong>+ Addon hinzufügen (.js wählen)</strong> aus.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn--subtle btn--sm" id="addons-btn-open-music-folder">
            ${icon('music', 13)} musik-player-addon.js zeigen
          </button>
          <button type="button" class="btn btn--subtle btn--sm" id="addons-btn-open-guide">
            ${icon('folder-open', 13)} SQLHubAddons-Ordner öffnen
          </button>
        </div>
      </div>

      <div class="addons-guide-cols">
        <div class="addons-guide-box">
          <div class="addons-guide-box__title">${icon('file-text', 14)} <span>Komplettes Beispiel: <code>meinaddon.js</code> (Alles in 1 Datei!)</span></div>
          <pre class="addons-code-block">export default {
  id: 'mein-eigenes-addon',
  name: 'Mein eigenes Addon',
  version: '1.0.0',
  author: 'Dein Name',
  description: 'Eigenes Sidebar-Werkzeug in nur einer .js Datei',
  type: 'tool', // 'tool' | 'theme' | 'hybrid'
  enabledByDefault: false,
  sidebar: {
    label: 'Mein Tool',
    icon: 'rocket',
    keepAlive: false
  },
  styles: \`
    .mein-box { padding: 18px; border: 2px solid #2b303c; background: #14171e; }
  \`,
  html: \`
    &lt;div class="mein-box"&gt;
      &lt;h2&gt;Hallo aus meinaddon.js!&lt;/h2&gt;
      &lt;button class="btn btn--primary" id="my-btn"&gt;Testen&lt;/button&gt;
    &lt;/div&gt;
  \`,
  async mount(addonRoot, addonApi) {
    addonRoot.querySelector('#my-btn')?.addEventListener('click', () =&gt; {
      addonApi.toast('Mein 1-Datei-Addon läuft!', 'success');
    });
  }
};</pre>
        </div>

        <div class="addons-guide-box">
          <div class="addons-guide-box__title">${icon('music', 14)} <span>Verfügbare <code>addonApi</code> Funktionen in <code>mount(addonRoot, addonApi)</code></span></div>
          <pre class="addons-code-block">// 1. Daten dauerhaft speichern &amp; laden:
const data = await addonApi.getStorage();
await addonApi.setStorage({ counter: 42 });

// 2. Lokale MP3/WAV/FLAC/MP4 Dateien oder Ordner wählen:
const tracks = await addonApi.pickMediaFiles();
const folder = await addonApi.pickMediaFolder();

// 3. Schwebenden Mini-Player unten rechts steuern:
addonApi.setMiniPlayer({
  active: true,
  title: 'Synthwave Radio',
  subtitle: 'Läuft im Hintergrund weiter',
  playing: true,
  onToggle: () =&gt; audio.paused ? audio.play() : audio.pause()
});

// 4. Zwischenablage, Instanzen &amp; Toast-Meldungen:
await addonApi.copyClipboard('SELECT * FROM users;');
const profiles = await addonApi.getProfiles();
addonApi.toast('Gespeichert!', 'success');</pre>
        </div>
      </div>
    </div>
  `;

  bindAddonsPageEvents(root);
}

function renderAddonCard(addon) {
  const isMusic = addon.id.includes('music') || (addon.sidebar && addon.sidebar.icon === 'music');
  const accent = addon.type === 'theme' ? '#10b981' : (isMusic ? '#e53935' : '#3b82f6');

  const typeBadge = addon.type === 'theme'
    ? `<span class="tag">${icon('palette', 11)} Design / Theme</span>`
    : addon.type === 'hybrid'
      ? `<span class="tag tag--ok">${icon('sparkles', 11)} Sidebar + Design</span>`
      : `<span class="tag tag--ok">${icon(addon.sidebar?.icon || 'terminal', 11)} Sidebar-Werkzeug (unter SFTP)</span>`;

  const keepAliveBadge = addon.sidebar && addon.sidebar.keepAlive
    ? `<span class="tag" title="Läuft beim Wechsel auf andere Seiten im Hintergrund weiter">${icon('activity', 11)} Hintergrund-Audio</span>`
    : '';

  return `
    <div class="addon-card ${addon.enabled ? 'is-enabled' : ''}" data-addon-id="${escapeHtml(addon.id)}" style="--addon-accent:${accent}">
      <div class="addon-card__head">
        <div class="addon-card__icon" style="color:${accent}">
          ${icon(addon.sidebar ? addon.sidebar.icon : (addon.type === 'theme' ? 'palette' : 'blocks'), 20)}
        </div>
        <div class="addon-card__titles">
          <div class="addon-card__title-row">
            <h3 class="addon-card__name">${escapeHtml(addon.name)}</h3>
            <code class="addon-card__ver">v${escapeHtml(addon.version)}</code>
          </div>
          <div class="addon-card__meta">von ${escapeHtml(addon.author)} · ID: <code>${escapeHtml(addon.id)}</code></div>
        </div>
        <label class="switch" title="${addon.enabled ? 'Addon deaktivieren' : 'Addon aktivieren'}">
          <input type="checkbox" data-addon-toggle="${escapeHtml(addon.id)}" ${addon.enabled ? 'checked' : ''} />
          <span class="switch__slider"></span>
        </label>
      </div>

      <p class="addon-card__desc">${escapeHtml(addon.description || 'Keine Beschreibung hinterlegt.')}</p>

      <div class="addon-card__foot">
        <div class="addon-card__badges">
          ${typeBadge}
          ${keepAliveBadge}
          <span class="tag ${addon.enabled ? 'tag--ok' : ''}">${addon.enabled ? 'Aktiviert' : 'Deaktiviert'}</span>
        </div>
        <div class="addon-card__actions">
          ${addon.sidebar && addon.enabled ? `
            <button type="button" class="btn btn--xs btn--primary" data-addon-open="${escapeHtml(addon.id)}">
              ${icon('play', 11)} <span>Öffnen</span>
            </button>
          ` : ''}
          <button type="button" class="btn btn--xs btn--ghost" data-addon-folder="${escapeHtml(addon.folderPath)}" title="Addon-Dateien im Explorer öffnen">
            ${icon('folder', 12)} <span>Dateien</span>
          </button>
          <button type="button" class="btn btn--xs btn--ghost" data-addon-delete="${escapeHtml(addon.id)}" title="Addon deinstallieren">
            ${icon('trash-2', 12)} <span>Deinstallieren</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function bindAddonsPageEvents(root) {
  root.querySelector('#addons-btn-rescan')?.addEventListener('click', async () => {
    await renderAddons();
    showToast({ type: 'success', message: 'Addons-Ordner wurde neu eingelesen.' });
  });

  root.querySelector('#addons-btn-open-folder')?.addEventListener('click', () => {
    api.addons.openFolder();
  });

  root.querySelector('#addons-btn-open-guide')?.addEventListener('click', () => {
    api.addons.openFolder();
  });

  root.querySelector('#addons-btn-open-music-folder')?.addEventListener('click', () => {
    api.addons.openFolder('C:\\Users\\lucsc\\OneDrive\\Desktop\\SQLHubAddons\\musik-player-addon.js');
  });

  const searchInput = root.querySelector('#addons-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      addonState.searchQuery = searchInput.value;
      const pos = searchInput.selectionStart || 0;
      renderAddons().then(() => {
        const nextInp = document.getElementById('addons-search-input');
        if (nextInp) {
          nextInp.focus();
          try { nextInp.setSelectionRange(pos, pos); } catch { /* ignore */ }
        }
      });
    });
  }

  root.querySelectorAll('[data-addon-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      addonState.statusFilter = btn.getAttribute('data-addon-filter') || 'all';
      renderAddons();
    });
  });

  root.querySelector('#addons-btn-reset-filter')?.addEventListener('click', () => {
    addonState.searchQuery = '';
    addonState.statusFilter = 'all';
    renderAddons();
  });

  root.querySelector('#addons-btn-load-folder')?.addEventListener('click', async () => {
    const res = await api.addons.install();
    if (!res || res.canceled) return;
    if (res.ok) {
      await renderAddons();
      showToast({
        type: 'success',
        title: 'Addon (.js) installiert',
        message: 'Deine .js Addon-Datei wurde installiert (standardmäßig deaktiviert). Du kannst das Addon jetzt per Schalter aktivieren.'
      });
    } else if (res.errors) {
      showToast({ type: 'error', message: res.errors.join(' ') });
    }
  });

  root.querySelector('#addons-btn-install')?.addEventListener('click', () => {
    openCustomInstallWizard();
  });

  root.querySelector('#addons-btn-create')?.addEventListener('click', () => {
    openCreateAddonModal();
  });

  root.querySelectorAll('[data-addon-toggle]').forEach((chk) => {
    chk.addEventListener('change', async () => {
      const id = chk.getAttribute('data-addon-toggle');
      const enabled = chk.checked;
      await api.addons.setEnabled(id, enabled);
      await renderAddons();
      showToast({
        type: 'info',
        message: enabled ? 'Addon wurde aktiviert.' : 'Addon wurde deaktiviert.'
      });
    });
  });

  root.querySelectorAll('[data-addon-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openAddonToolView(btn.getAttribute('data-addon-open'));
    });
  });

  root.querySelectorAll('[data-addon-folder]').forEach((btn) => {
    btn.addEventListener('click', () => {
      api.addons.openFolder(btn.getAttribute('data-addon-folder'));
    });
  });

  root.querySelectorAll('[data-addon-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-addon-delete');
      const addon = addonState.addons.find((a) => a.id === id);
      if (addon) openCustomUninstallWizard(addon);
    });
  });
}

/* --------------------- 2. Custom Addon-Installations-Fenster (Setup Wizard) --------------------- */

export function openCustomInstallWizard(initialPath = '') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  let inspectedAddon = null;

  overlay.innerHTML = `
    <div class="modal modal--wide installer-modal" role="dialog" aria-modal="true" aria-labelledby="addon-inst-title">
      <div class="modal__header">
        <div>
          <div class="modal__eyebrow">SQL HUB SETUP &amp; PAKET-INSTALLER</div>
          <h2 class="modal__title" id="addon-inst-title">Addon installieren</h2>
        </div>
        <button type="button" class="modal__close" id="addon-inst-close" title="Schließen (ESC)">
          ${icon('x', 16)}
        </button>
      </div>

      <div class="modal__body">
        <div class="installer-steps">
          <div class="installer-step is-active" id="inst-step-1-badge">
            <span class="installer-step__num">1</span>
            <span>Addon-Datei (<code>.js</code>) wählen</span>
          </div>
          <span class="installer-step__sep">→</span>
          <div class="installer-step" id="inst-step-2-badge">
            <span class="installer-step__num">2</span>
            <span>Metadaten &amp; Rechte prüfen</span>
          </div>
          <span class="installer-step__sep">→</span>
          <div class="installer-step" id="inst-step-3-badge">
            <span class="installer-step__num">3</span>
            <span>Installation in SQLHubAddons</span>
          </div>
        </div>

        <div class="field">
          <label for="inst-source-path">Addon-Datei (1-Datei <code>meinaddon.js</code>)</label>
          <div style="display:flex;gap:8px;">
            <input type="text" class="input" id="inst-source-path" value="${escapeHtml(initialPath)}" placeholder="z. B. C:\\Users\\lucsc\\OneDrive\\Desktop\\meinaddon.js" />
            <button type="button" class="btn btn--subtle" id="inst-btn-browse">
              ${icon('folder-open', 14)} <span>.js Datei wählen …</span>
            </button>
            <button type="button" class="btn btn--ghost" id="inst-btn-check">Prüfen</button>
          </div>
        </div>

        <div class="installer-quick-picks">
          <span class="installer-quick-picks__label">Schnellauswahl (.js):</span>
          <button type="button" class="btn btn--xs btn--ghost" data-quick-path="C:\\Users\\lucsc\\OneDrive\\Desktop\\SQLHubAddons\\musik-player-addon.js">
            ${icon('music', 12)} <span>musik-player-addon.js</span>
          </button>
          <button type="button" class="btn btn--xs btn--ghost" data-quick-path="C:\\Users\\lucsc\\OneDrive\\Desktop\\SQLHubAddons\\notizen-snippets-addon.js">
            ${icon('file-text', 12)} <span>notizen-snippets-addon.js</span>
          </button>
          <button type="button" class="btn btn--xs btn--ghost" data-quick-path="C:\\Users\\lucsc\\OneDrive\\Desktop\\SQLHubAddons\\emerald-pixel-theme.js">
            ${icon('palette', 12)} <span>emerald-pixel-theme.js</span>
          </button>
          <button type="button" class="btn btn--xs btn--ghost" data-quick-path="C:\\Users\\lucsc\\OneDrive\\Desktop\\SQLHubAddons\\beispiel-eigenes-addon.js">
            ${icon('rocket', 12)} <span>beispiel-eigenes-addon.js</span>
          </button>
        </div>

        <div id="inst-preview-box" class="installer-preview-box">
          <div class="installer-preview-empty">
            ${icon('blocks', 24)}
            <span>Wähle oben eine einzelne <code>.js</code> Addon-Datei (z. B. <code>meinaddon.js</code>) aus, um Metadaten und Berechtigungen vor der Installation zu prüfen.</span>
          </div>
        </div>

        <div id="inst-progress-wrap" class="installer-progress-wrap" hidden>
          <div class="installer-progress-head">
            <strong id="inst-progress-label">Installation wird vorbereitet …</strong>
            <span id="inst-progress-pct">0%</span>
          </div>
          <div class="installer-progress-track">
            <div class="installer-progress-fill" id="inst-progress-fill" style="width:0%"></div>
          </div>
          <div class="installer-log" id="inst-progress-log"></div>
        </div>
      </div>

      <div class="modal__footer modal__footer--split">
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);">
          Zielordner: <code>${escapeHtml(addonState.directory || 'SQLHubAddons')}</code>
        </div>
        <div class="modal__footer-right">
          <button type="button" class="btn btn--ghost" id="addon-inst-cancel">Abbrechen</button>
          <button type="button" class="btn btn--primary" id="addon-inst-submit" disabled>
            ${icon('download', 14)}
            <span>Jetzt installieren &amp; aktivieren</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-root').appendChild(overlay);

  const pathInp = overlay.querySelector('#inst-source-path');
  const previewBox = overlay.querySelector('#inst-preview-box');
  const submitBtn = overlay.querySelector('#addon-inst-submit');
  const step2Badge = overlay.querySelector('#inst-step-2-badge');
  const step3Badge = overlay.querySelector('#inst-step-3-badge');
  const progressWrap = overlay.querySelector('#inst-progress-wrap');
  const progressLabel = overlay.querySelector('#inst-progress-label');
  const progressPct = overlay.querySelector('#inst-progress-pct');
  const progressFill = overlay.querySelector('#inst-progress-fill');
  const progressLog = overlay.querySelector('#inst-progress-log');

  const close = () => overlay.remove();
  overlay.querySelector('#addon-inst-close')?.addEventListener('click', close);
  overlay.querySelector('#addon-inst-cancel')?.addEventListener('click', close);

  async function inspectPath(targetPath) {
    const clean = String(targetPath || '').trim();
    if (!clean) return;
    if (pathInp) pathInp.value = clean;
    const res = await api.addons.inspectPath(clean);
    if (!res || !res.ok || !res.addon) {
      inspectedAddon = null;
      if (submitBtn) submitBtn.disabled = true;
      step2Badge?.classList.remove('is-active');
      previewBox.innerHTML = `
        <div class="installer-preview-error">
          ${icon('triangle-alert', 20)}
          <div>
            <strong>Paket konnte nicht geladen werden</strong>
            <div>${escapeHtml((res && res.errors && res.errors.join(' ')) || 'Keine gültige manifest.json gefunden.')}</div>
          </div>
        </div>
      `;
      return;
    }

    inspectedAddon = res.addon;
    if (submitBtn) submitBtn.disabled = false;
    step2Badge?.classList.add('is-active');

    const perms = inspectedAddon.permissions && inspectedAddon.permissions.length
      ? inspectedAddon.permissions
      : (inspectedAddon.sidebar ? ['sidebar', 'storage'] : ['theme-css']);

    previewBox.innerHTML = `
      <div class="installer-pkg-card">
        <div class="installer-pkg-card__head">
          <div class="installer-pkg-card__icon">
            ${icon(inspectedAddon.sidebar ? inspectedAddon.sidebar.icon : 'palette', 22)}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <strong style="font-size:15px;">${escapeHtml(inspectedAddon.name)}</strong>
              <span class="tag tag--ok">v${escapeHtml(inspectedAddon.version)}</span>
              ${inspectedAddon.alreadyInstalled ? `<span class="tag">Bereits installiert (Update/Neuinstallation)</span>` : `<span class="tag tag--ok">Neues Paket</span>`}
            </div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:2px;">
              Autor: ${escapeHtml(inspectedAddon.author)} · ID: <code>${escapeHtml(inspectedAddon.id)}</code>
            </div>
          </div>
        </div>
        <p style="margin:8px 0;font-size:12.5px;color:var(--text-muted);">${escapeHtml(inspectedAddon.description)}</p>
        <div class="installer-pkg-meta-grid">
          <div>
            <span class="installer-meta-label">BERECHTIGUNGEN &amp; FUNKTIONEN</span>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;">
              ${perms.map((p) => `<span class="tag">${escapeHtml(p)}</span>`).join('')}
            </div>
          </div>
          <div>
            <span class="installer-meta-label">ENTHALTENE DATEIEN (${(inspectedAddon.files || []).length})</span>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;">
              ${(inspectedAddon.files || []).map((f) => `<code>${escapeHtml(f)}</code>`).join(' ')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  overlay.querySelector('#inst-btn-browse')?.addEventListener('click', async () => {
    const res = await api.addons.inspectFromDialog();
    if (!res || res.canceled) return;
    if (res.ok && res.addon) {
      await inspectPath(res.addon.sourceDir);
    } else if (res.errors) {
      showToast({ type: 'error', message: res.errors.join(' ') });
    }
  });

  overlay.querySelector('#inst-btn-check')?.addEventListener('click', () => {
    inspectPath(pathInp?.value || '');
  });

  pathInp?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inspectPath(pathInp.value);
    }
  });

  overlay.querySelectorAll('[data-quick-path]').forEach((btn) => {
    btn.addEventListener('click', () => {
      inspectPath(btn.getAttribute('data-quick-path'));
    });
  });

  submitBtn?.addEventListener('click', async () => {
    if (!inspectedAddon) return;
    submitBtn.disabled = true;
    step3Badge?.classList.add('is-active');
    if (progressWrap) progressWrap.hidden = false;

    const setStep = (pct, text, logLine) => {
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (progressPct) progressPct.textContent = `${pct}%`;
      if (progressLabel) progressLabel.textContent = text;
      if (progressLog && logLine) {
        const line = document.createElement('div');
        line.textContent = `✓ ${logLine}`;
        progressLog.appendChild(line);
      }
    };

    setStep(25, 'Prüfe manifest.json & Zielverzeichnis …', `Manifest für „${inspectedAddon.name}“ (v${inspectedAddon.version}) verifiziert`);
    await new Promise((r) => setTimeout(r, 220));
    setStep(65, 'Kopiere Addon-Dateien nach SQLHubAddons …', `Dateien (${(inspectedAddon.files || []).join(', ')}) übertragen`);
    const res = await api.addons.installPath(inspectedAddon.sourceDir);
    await new Promise((r) => setTimeout(r, 220));

    if (!res || !res.ok) {
      showToast({ type: 'error', message: (res && res.errors && res.errors.join(' ')) || 'Installation fehlgeschlagen.' });
      submitBtn.disabled = false;
      return;
    }

    setStep(100, 'Installation erfolgreich abgeschlossen!', `Addon „${inspectedAddon.name}“ geladen (Standard: Deaktiviert – manuell einschaltbar).`);
    await renderAddons();

    setTimeout(() => {
      close();
      showToast({
        type: 'success',
        title: 'Addon geladen',
        message: `„${inspectedAddon.name}“ wurde installiert (standardmäßig deaktiviert). Du kannst es jetzt per Schalter aktivieren.`
      });
    }, 450);
  });

  if (initialPath) {
    inspectPath(initialPath);
  }
}

/* --------------------- 3. Custom Addon-Deinstallations-Fenster (Uninstaller Wizard) --------------------- */

export function openCustomUninstallWizard(addon) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal installer-modal" style="max-width:540px;" role="dialog" aria-modal="true" aria-labelledby="addon-uninst-title">
      <div class="modal__header">
        <div>
          <div class="modal__eyebrow">SQL HUB DEINSTALLATIONS-ASSISTENT</div>
          <h2 class="modal__title" id="addon-uninst-title">Addon deinstallieren: ${escapeHtml(addon.name)}</h2>
        </div>
        <button type="button" class="modal__close" id="addon-uninst-close" title="Schließen (ESC)">
          ${icon('x', 16)}
        </button>
      </div>

      <div class="modal__body">
        <div class="installer-pkg-card">
          <div class="installer-pkg-card__head">
            <div class="installer-pkg-card__icon" style="color:var(--danger)">
              ${icon('trash-2', 20)}
            </div>
            <div>
              <strong style="font-size:14px;">${escapeHtml(addon.name)} (v${escapeHtml(addon.version)})</strong>
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);">Pfad: <code>${escapeHtml(addon.folderPath)}</code></div>
            </div>
          </div>
        </div>

        <div class="field" style="margin-top:12px;">
          <label>Deinstallations-Modus wählen</label>
          <label class="uninstall-option">
            <input type="radio" name="uninst-mode" value="delete" checked />
            <div>
              <strong>Addon vollständig deinstallieren (Dateien aus SQLHubAddons löschen)</strong>
              <span>Entfernt den Addon-Ordner, das Sidebar-Icon unter SFTP und alle zugehörigen Styles.</span>
            </div>
          </label>
          <label class="uninstall-option">
            <input type="radio" name="uninst-mode" value="disable" />
            <div>
              <strong>Addon nur deaktivieren (Dateien im Ordner behalten)</strong>
              <span>Schaltet das Addon aus, lässt aber den Ordner für spätere Nutzung bestehen.</span>
            </div>
          </label>
        </div>

        <label class="uninstall-option" style="margin-top:8px;">
          <input type="checkbox" id="uninst-wipe-storage" checked />
          <div>
            <strong>Gespeicherte Addon-Daten &amp; Einstellungen ebenfalls löschen</strong>
            <span>Bereinigt den lokalen Speicher (z. B. gespeicherte Playlists oder Notizen) dieses Addons.</span>
          </div>
        </label>

        <div id="uninst-progress" class="installer-progress-wrap" hidden>
          <div class="installer-progress-head">
            <strong id="uninst-progress-label">Deinstalliere Addon …</strong>
            <span id="uninst-progress-pct">0%</span>
          </div>
          <div class="installer-progress-track">
            <div class="installer-progress-fill" id="uninst-progress-fill" style="width:0%;background:var(--danger);"></div>
          </div>
        </div>
      </div>

      <div class="modal__footer">
        <button type="button" class="btn btn--ghost" id="addon-uninst-cancel">Abbrechen</button>
        <button type="button" class="btn btn--danger" id="addon-uninst-confirm">
          ${icon('trash-2', 14)}
          <span>Jetzt deinstallieren</span>
        </button>
      </div>
    </div>
  `;

  document.getElementById('modal-root').appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#addon-uninst-close')?.addEventListener('click', close);
  overlay.querySelector('#addon-uninst-cancel')?.addEventListener('click', close);

  overlay.querySelector('#addon-uninst-confirm')?.addEventListener('click', async () => {
    const mode = overlay.querySelector('input[name="uninst-mode"]:checked')?.value || 'delete';
    const wipeStorage = Boolean(overlay.querySelector('#uninst-wipe-storage')?.checked);
    const prog = overlay.querySelector('#uninst-progress');
    const fill = overlay.querySelector('#uninst-progress-fill');
    const pct = overlay.querySelector('#uninst-progress-pct');

    if (prog) prog.hidden = false;
    if (fill) fill.style.width = '55%';
    if (pct) pct.textContent = '55%';
    await new Promise((r) => setTimeout(r, 200));

    const res = await api.addons.remove(addon.id, {
      onlyDisable: mode === 'disable',
      wipeStorage
    });

    if (fill) fill.style.width = '100%';
    if (pct) pct.textContent = '100%';
    await new Promise((r) => setTimeout(r, 200));

    close();
    if (res && res.ok) {
      await renderAddons();
      showToast({
        type: 'success',
        title: mode === 'disable' ? 'Addon deaktiviert' : 'Addon deinstalliert',
        message: `„${addon.name}“ wurde ${mode === 'disable' ? 'deaktiviert' : 'vollständig entfernt'}.`
      });
    } else {
      showToast({
        type: 'error',
        message: (res && res.errors && res.errors[0]) || 'Deinstallation fehlgeschlagen.'
      });
    }
  });
}

/* --------------------- 4. In-App Addon-Baukasten (Modal) --------------------- */

function openCreateAddonModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <form class="modal modal--wide" id="addon-create-form" role="dialog" aria-modal="true" aria-labelledby="addon-create-title">
      <div class="modal__header">
        <div>
          <div class="modal__eyebrow">SQL HUB ADDON-BAUKASTEN</div>
          <h2 class="modal__title" id="addon-create-title">Eigenes Addon erstellen</h2>
        </div>
        <button type="button" class="modal__close" id="addon-modal-close" title="Schließen (ESC)">
          ${icon('x', 16)}
        </button>
      </div>
      <div class="modal__body">
        <div class="row">
          <div class="field">
            <label for="addon-name">Addon-Name *</label>
            <input type="text" class="input" id="addon-name" required placeholder="z. B. Mein Musik Player oder Server-Notizen" />
          </div>
          <div class="field">
            <label for="addon-author">Ersteller / Autor</label>
            <input type="text" class="input" id="addon-author" placeholder="Dein Name" value="SQL Hub User" />
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label for="addon-type">Addon-Art</label>
            <select id="addon-type">
              <option value="tool">Sidebar-Werkzeug (Neues Icon unter SFTP)</option>
              <option value="theme">Design-Theme (Farben &amp; CSS anpassen)</option>
              <option value="hybrid">Kombi (Sidebar-Icon + eigenes Design)</option>
            </select>
          </div>
          <div class="field" id="addon-template-wrap">
            <label for="addon-template">Start-Vorlage</label>
            <select id="addon-template">
              <option value="music">Musik-, Radio- &amp; YouTube/Spotify-Player</option>
              <option value="notes">Notizen &amp; SQL-Snippets Manager</option>
              <option value="custom">Freie HTML / JS / CSS Arbeitsfläche</option>
            </select>
          </div>
        </div>

        <div class="row" id="addon-sidebar-fields">
          <div class="field">
            <label for="addon-sidebar-label">Sidebar-Name (unter SFTP)</label>
            <input type="text" class="input" id="addon-sidebar-label" placeholder="z. B. Musik, Notizen, Wiki" value="Musik" />
          </div>
          <div class="field">
            <label for="addon-sidebar-icon">Sidebar-Icon</label>
            <select id="addon-sidebar-icon">
              <option value="music">Musiknote (music)</option>
              <option value="file-text">Notizblatt (file-text)</option>
              <option value="clipboard">Klemmbrett (clipboard)</option>
              <option value="terminal">Terminal / Konsole (terminal)</option>
              <option value="gamepad-2">Gaming / Controller (gamepad-2)</option>
              <option value="sparkles">Stern / Spezial (sparkles)</option>
              <option value="wrench">Werkzeug (wrench)</option>
              <option value="rocket">Rakete (rocket)</option>
              <option value="bot">Bot / Automation (bot)</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label for="addon-desc">Beschreibung</label>
          <input type="text" class="input" id="addon-desc" placeholder="Kurze Beschreibung, was das Addon macht …" />
        </div>

        <div class="field">
          <label for="addon-css">Eigenes CSS / Design-Regeln (optional, wird in <code>styles.css</code> gespeichert)</label>
          <textarea id="addon-css" class="input" rows="3" style="font-family:var(--font-mono);font-size:12px;" placeholder="/* Optional: Eigene CSS-Variablen oder Regeln */"></textarea>
        </div>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn btn--ghost" id="addon-modal-cancel">Abbrechen</button>
        <button type="submit" class="btn btn--primary">
          ${icon('check', 15)}
          <span>Addon in SQLHubAddons erstellen</span>
        </button>
      </div>
    </form>
  `;

  document.getElementById('modal-root').appendChild(overlay);
  enhanceSelect(overlay.querySelector('#addon-type'));
  enhanceSelect(overlay.querySelector('#addon-template'));
  enhanceSelect(overlay.querySelector('#addon-sidebar-icon'));

  const close = () => overlay.remove();
  overlay.querySelector('#addon-modal-close')?.addEventListener('click', close);
  overlay.querySelector('#addon-modal-cancel')?.addEventListener('click', close);

  const typeSel = overlay.querySelector('#addon-type');
  const sidebarFields = overlay.querySelector('#addon-sidebar-fields');
  const templateWrap = overlay.querySelector('#addon-template-wrap');
  typeSel?.addEventListener('change', () => {
    const isThemeOnly = typeSel.value === 'theme';
    if (sidebarFields) sidebarFields.hidden = isThemeOnly;
    if (templateWrap) templateWrap.hidden = isThemeOnly;
  });

  overlay.querySelector('#addon-create-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: overlay.querySelector('#addon-name').value.trim(),
      author: overlay.querySelector('#addon-author').value.trim(),
      type: overlay.querySelector('#addon-type').value,
      template: overlay.querySelector('#addon-template').value,
      sidebarLabel: overlay.querySelector('#addon-sidebar-label').value.trim(),
      sidebarIcon: overlay.querySelector('#addon-sidebar-icon').value,
      description: overlay.querySelector('#addon-desc').value.trim(),
      customCss: overlay.querySelector('#addon-css').value
    };

    const res = await api.addons.create(payload);
    if (!res || !res.ok) {
      showToast({ type: 'error', message: (res && res.errors && res.errors.join(' ')) || 'Addon konnte nicht erstellt werden.' });
      return;
    }
    close();
    await renderAddons();
    showToast({
      type: 'success',
      title: 'Addon erstellt & aktiviert',
      message: `Gespeichert unter ${res.folderPath}`
    });
  });
}

/* --------------------- 5. Interaktives Notizen- & SQL-Snippet-Addon (unter SFTP) --------------------- */

async function renderNotesAddonWorkspace(root, addon) {
  const storageRes = await api.addons.getStorage(addon.id);
  const storeData = (storageRes && storageRes.data) || {};
  const notes = Array.isArray(storeData.notes) ? storeData.notes : [];

  if (!addonState.selectedNoteId && notes.length > 0) {
    addonState.selectedNoteId = notes[0].id;
  }

  const saveNotes = async (nextNotes) => {
    await api.addons.setStorage(addon.id, { ...storeData, notes: nextNotes });
  };

  function paintNotes() {
    const filtered = notes.filter((n) => {
      if (addonState.notesCategory !== 'all' && (n.category || 'Allgemein') !== addonState.notesCategory) {
        return false;
      }
      if (!addonState.notesFilter) return true;
      const q = addonState.notesFilter.toLowerCase();
      return (
        (n.title || '').toLowerCase().includes(q) ||
        (n.content || '').toLowerCase().includes(q) ||
        (n.sql || '').toLowerCase().includes(q) ||
        (n.category || '').toLowerCase().includes(q)
      );
    });

    filtered.sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned ? 1 : -1;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });

    const activeNote = notes.find((n) => n.id === addonState.selectedNoteId) || filtered[0] || null;

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__titles">
          <div class="page-eyebrow">ADDON · ${escapeHtml(addon.name.toUpperCase())}</div>
          <h1 class="page-title">${escapeHtml(addon.sidebar.title || addon.name)}</h1>
          <p class="page-sub">${escapeHtml(addon.sidebar.subtitle || addon.description)}</p>
        </div>
        <div class="page-head__actions">
          <button type="button" class="btn btn--ghost" id="notes-open-addons-mgr">
            ${icon('blocks', 14)}
            <span>Addons verwalten</span>
          </button>
          <button type="button" class="btn btn--primary" id="notes-add-btn">
            ${icon('plus', 15)}
            <span>Neue Notiz / SQL-Snippet</span>
          </button>
        </div>
      </div>

      <div class="notes-workbench">
        <!-- Linke Spalte: Notiz-Liste & Suche -->
        <aside class="notes-sidebar">
          <div class="notes-sidebar__top">
            <div class="search search--compact">
              ${icon('search', 14)}
              <input type="search" id="notes-search-input" value="${escapeHtml(addonState.notesFilter)}" placeholder="Notiz oder SQL suchen …" />
            </div>
            <div class="filter-pills notes-filter-pills">
              <button type="button" class="filter-pill ${addonState.notesCategory === 'all' ? 'is-active' : ''}" data-note-cat="all">Alle (${notes.length})</button>
              <button type="button" class="filter-pill ${addonState.notesCategory === 'Allgemein' ? 'is-active' : ''}" data-note-cat="Allgemein">Notizen</button>
              <button type="button" class="filter-pill ${addonState.notesCategory === 'SQL-Snippet' ? 'is-active' : ''}" data-note-cat="SQL-Snippet">SQL</button>
            </div>
          </div>

          <div class="notes-list">
            ${filtered.map((n) => `
              <button type="button" class="notes-list-item ${activeNote && activeNote.id === n.id ? 'is-active' : ''}" data-note-select="${escapeHtml(n.id)}">
                <div class="notes-list-item__top">
                  <span class="notes-list-item__title">
                    ${n.pinned ? `<span class="notes-list-item__pin">${icon('pin', 12)}</span>` : ''}
                    <span>${escapeHtml(n.title || 'Unbenannte Notiz')}</span>
                  </span>
                  <span class="tag">${escapeHtml(n.category || 'Allgemein')}</span>
                </div>
                <div class="notes-list-item__preview">
                  ${escapeHtml((n.content || n.sql || 'Keine Beschreibung').slice(0, 95))}
                </div>
              </button>
            `).join('')}
            ${filtered.length === 0 ? `
              <div class="notes-empty-list">Keine passenden Notizen gefunden.</div>
            ` : ''}
          </div>
        </aside>

        <!-- Rechte Spalte: Notiz- & SQL-Editor -->
        <section class="notes-editor-pane">
          ${activeNote ? `
            <div class="notes-editor__head">
              <input type="text" class="input notes-title-input" id="note-edit-title" value="${escapeHtml(activeNote.title || '')}" placeholder="Titel der Notiz …" />
              <div style="width:170px;flex-shrink:0;">
                <select class="input" id="note-edit-cat">
                  <option value="Allgemein" ${(activeNote.category || 'Allgemein') === 'Allgemein' ? 'selected' : ''}>Allgemein / Info</option>
                  <option value="SQL-Snippet" ${activeNote.category === 'SQL-Snippet' ? 'selected' : ''}>SQL-Snippet</option>
                  <option value="Server / SFTP" ${activeNote.category === 'Server / SFTP' ? 'selected' : ''}>Server / SFTP</option>
                  <option value="To-Do" ${activeNote.category === 'To-Do' ? 'selected' : ''}>To-Do / Aufgabe</option>
                </select>
              </div>
              <button type="button" class="btn btn--sm ${activeNote.pinned ? 'btn--primary' : 'btn--ghost'}" id="note-toggle-pin" title="Oben anheften">
                ${icon('pin', 13)} <span>${activeNote.pinned ? 'Angeheftet' : 'Anheften'}</span>
              </button>
              <button type="button" class="btn btn--sm btn--danger" id="note-delete-btn" title="Notiz löschen">
                ${icon('trash-2', 13)}
              </button>
            </div>

            <div class="notes-editor__body">
              <div class="field" style="margin-bottom:0;">
                <label for="note-edit-content">Notiztext / Dokumentation / Checkliste</label>
                <textarea class="input notes-textarea" id="note-edit-content" placeholder="Schreibe hier deine Server-Notizen, Zugangs-Hinweise oder Aufgaben auf …">${escapeHtml(activeNote.content || '')}</textarea>
              </div>

              <div class="notes-sql-box">
                <div class="notes-sql-box__head">
                  <span style="display:inline-flex;align-items:center;gap:6px;">
                    ${icon('terminal', 13)}
                    <span>SQL-QUERY / SSH-BEFEHL (CODE-BLOCK)</span>
                  </span>
                  <button type="button" class="btn btn--xs btn--subtle" id="note-copy-sql">
                    ${icon('copy', 12)} <span>SQL / Code kopieren</span>
                  </button>
                </div>
                <textarea class="input notes-sql-textarea" id="note-edit-sql" spellcheck="false" placeholder="SELECT * FROM users WHERE active = 1 LIMIT 50;">${escapeHtml(activeNote.sql || '')}</textarea>
              </div>
            </div>

            <div class="notes-editor__foot">
              <span class="notes-status">
                Zuletzt gespeichert: ${activeNote.updatedAt ? new Date(activeNote.updatedAt).toLocaleString('de-DE') : 'Gerade eben'}
              </span>
              <button type="button" class="btn btn--primary" id="note-save-btn">
                ${icon('save', 14)} <span>Notiz speichern (Strg + S)</span>
              </button>
            </div>
          ` : `
            <div class="sftp-remote-placeholder">
              <div class="sftp-remote-placeholder__icon">${icon('file-text', 26)}</div>
              <h3>KEINE NOTIZ AUSGEWÄHLT</h3>
              <p>Erstelle über den Button oben rechts deine erste Server-Notiz oder dein erstes SQL-Snippet.</p>
              <button type="button" class="btn btn--primary btn--sm" id="notes-empty-add">
                ${icon('plus', 14)} <span>Erste Notiz anlegen</span>
              </button>
            </div>
          `}
        </section>
      </div>
    `;

    const catSel = root.querySelector('#note-edit-cat');
    if (catSel) enhanceSelect(catSel);

    root.querySelector('#notes-open-addons-mgr')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('sqlhub:navigate', { detail: 'addons' }));
    });

    const createNewNote = async () => {
      const newNote = {
        id: `note-${Date.now()}`,
        title: 'Neue Server-Notiz',
        category: addonState.notesCategory !== 'all' ? addonState.notesCategory : 'Allgemein',
        pinned: false,
        content: '',
        sql: '',
        updatedAt: new Date().toISOString()
      };
      notes.unshift(newNote);
      addonState.selectedNoteId = newNote.id;
      await saveNotes(notes);
      paintNotes();
      root.querySelector('#note-edit-title')?.focus();
      root.querySelector('#note-edit-title')?.select();
    };

    root.querySelector('#notes-add-btn')?.addEventListener('click', createNewNote);
    root.querySelector('#notes-empty-add')?.addEventListener('click', createNewNote);

    const searchInp = root.querySelector('#notes-search-input');
    searchInp?.addEventListener('input', () => {
      addonState.notesFilter = searchInp.value;
      const pos = searchInp.selectionStart;
      paintNotes();
      const nextInp = root.querySelector('#notes-search-input');
      if (nextInp) {
        nextInp.focus();
        try { nextInp.setSelectionRange(pos, pos); } catch { /* ignore */ }
      }
    });

    root.querySelectorAll('[data-note-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        addonState.notesCategory = btn.getAttribute('data-note-cat');
        paintNotes();
      });
    });

    root.querySelectorAll('[data-note-select]').forEach((btn) => {
      btn.addEventListener('click', () => {
        addonState.selectedNoteId = btn.getAttribute('data-note-select');
        paintNotes();
      });
    });

    if (activeNote) {
      const doSave = async (silent = false) => {
        activeNote.title = root.querySelector('#note-edit-title')?.value.trim() || 'Unbenannte Notiz';
        activeNote.category = root.querySelector('#note-edit-cat')?.value || 'Allgemein';
        activeNote.content = root.querySelector('#note-edit-content')?.value || '';
        activeNote.sql = root.querySelector('#note-edit-sql')?.value || '';
        activeNote.updatedAt = new Date().toISOString();
        await saveNotes(notes);
        paintNotes();
        if (!silent) {
          showToast({ type: 'success', message: `Notiz „${activeNote.title}“ gespeichert.` });
        }
      };

      root.querySelector('#note-save-btn')?.addEventListener('click', () => doSave(false));

      root.querySelector('#note-toggle-pin')?.addEventListener('click', async () => {
        activeNote.pinned = !activeNote.pinned;
        await doSave(true);
      });

      root.querySelector('#note-copy-sql')?.addEventListener('click', async () => {
        const sqlText = root.querySelector('#note-edit-sql')?.value || '';
        if (!sqlText.trim()) {
          showToast({ type: 'warning', message: 'Kein SQL-Code zum Kopieren vorhanden.' });
          return;
        }
        await api.app.copyClipboard(sqlText);
        showToast({ type: 'success', title: 'SQL kopiert', message: 'SQL-Snippet wurde in die Zwischenablage kopiert.' });
      });

      root.querySelector('#note-delete-btn')?.addEventListener('click', async () => {
        const idx = notes.findIndex((n) => n.id === activeNote.id);
        if (idx >= 0) notes.splice(idx, 1);
        addonState.selectedNoteId = notes[0] ? notes[0].id : null;
        await saveNotes(notes);
        paintNotes();
        showToast({ type: 'info', message: 'Notiz wurde gelöscht.' });
      });
    }
  }

  paintNotes();
}

/* --------------------- 6. Freie HTML/JS Addon-Ansicht (Musik-Player, Video, Custom Tools) --------------------- */

async function renderCustomAddonWorkspace(container, addon) {
  container.innerHTML = `
    <div id="addon-custom-mount">
      ${addon.sidebar.htmlContent || '<div class="panel"><p>Keine view.html hinterlegt.</p></div>'}
    </div>
  `;

  const mount = container.querySelector('#addon-custom-mount');
  if (addon.sidebar.scriptContent && mount) {
    try {
      const addonApi = {
        id: addon.id,
        name: addon.name,
        version: addon.version,
        getStorage: async () => {
          const r = await api.addons.getStorage(addon.id);
          return (r && r.data) || {};
        },
        setStorage: async (data) => {
          return api.addons.setStorage(addon.id, data);
        },
        pickMediaFiles: async () => {
          const r = await api.addons.pickMediaFiles();
          return (r && r.tracks) || [];
        },
        pickMediaFolder: async () => {
          const r = await api.addons.pickMediaFolder();
          return r || { folderPath: '', tracks: [] };
        },
        setMiniPlayer: (cfg = {}) => {
          addonState.miniPlayer = {
            addonId: addon.id,
            active: Boolean(cfg.active),
            title: cfg.title || addon.name,
            subtitle: cfg.subtitle || '',
            playing: Boolean(cfg.playing),
            onToggle: cfg.onToggle,
            onNext: cfg.onNext
          };
          renderMiniPlayerBar();
        },
        copyClipboard: async (text) => {
          return api.app.copyClipboard(String(text || ''));
        },
        getProfiles: async () => {
          const r = await api.profiles.list();
          return (r && r.profiles) || [];
        },
        navigate: (viewName) => {
          window.dispatchEvent(new CustomEvent('sqlhub:navigate', { detail: viewName }));
        },
        toast: (message, type = 'info', title = '') => showToast({ type, title, message })
      };
      window.__sqlhubAddonCtx = window.__sqlhubAddonCtx || {};
      const ctxKey = `${addon.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      window.__sqlhubAddonCtx[ctxKey] = { addonRoot: mount, addonApi, addon };
      const moduleSource = `
        const { addonRoot, addonApi, addon } = window.__sqlhubAddonCtx[${JSON.stringify(ctxKey)}];
        delete window.__sqlhubAddonCtx[${JSON.stringify(ctxKey)}];
        let __registeredAddon = null;
        const module = { exports: {} };
        const exports = module.exports;
        const registerAddon = (def) => { __registeredAddon = def; return def; };
        ${addon.sidebar.scriptContent}
        export const __sqlhubFallbackExport = __registeredAddon || (module.exports && Object.keys(module.exports).length ? module.exports : null);
      `;
      const blob = new Blob([moduleSource], { type: 'text/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      const mod = await import(blobUrl).finally(() => URL.revokeObjectURL(blobUrl));
      const def = (mod && mod.default) || (mod && mod.__sqlhubFallbackExport) || null;
      if (def) {
        if (typeof def.mount === 'function') {
          await def.mount(mount, addonApi, addon);
        } else if (typeof def.init === 'function') {
          await def.init(mount, addonApi, addon);
        } else if (typeof def === 'function') {
          await def(mount, addonApi, addon);
        }
      }
    } catch (err) {
      showToast({ type: 'error', title: `Fehler im Addon ${addon.name}`, message: err.message });
    }
  }
}
