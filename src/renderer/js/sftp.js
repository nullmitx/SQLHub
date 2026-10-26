// sftp.js – SFTP-Client & Server-Manager im Termius-Stil (Dual-Pane Datei-Explorer + Host-Vault)

import { api } from './api.js';
import { icon } from './icons.js';
import { escapeHtml, enhanceSelect } from './dom.js';
import { showToast } from './toast.js';
import { confirmDialog } from './confirm.js';

const SFTP_COLORS = [
  '#e11d48', '#f43f5e', '#f97316', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6'
];

const sftpState = {
  hosts: [],
  probes: new Map(), // hostId -> { online, latencyMs, banner, checking, error }
  activeHostId: null,
  connectedHostId: null,
  localPath: '',
  localParent: null,
  localEntries: [],
  localFilter: '',
  localQuickPaths: null,
  remotePath: '/',
  remoteParent: null,
  remoteEntries: [],
  remoteFilter: '',
  remoteLoading: false,
  remoteError: ''
};

let initialized = false;

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function buildBreadcrumbs(fullPath, isRemote = false) {
  const raw = String(fullPath || (isRemote ? '/' : '')).trim();
  if (!raw) return [];
  if (isRemote) {
    const clean = raw.replace(/\\/g, '/');
    const parts = clean.split('/').filter(Boolean);
    const crumbs = [{ label: '/', path: '/' }];
    let acc = '';
    for (const p of parts) {
      acc += '/' + p;
      crumbs.push({ label: p, path: acc });
    }
    return crumbs;
  }
  const sep = raw.includes('\\') ? '\\' : '/';
  const parts = raw.split(/[\\/]+/).filter(Boolean);
  const crumbs = [];
  let acc = '';
  parts.forEach((part, idx) => {
    if (idx === 0 && part.endsWith(':')) {
      acc = part + sep;
      crumbs.push({ label: part, path: acc });
    } else if (idx === 0 && raw.startsWith('/')) {
      acc = '/' + part;
      crumbs.push({ label: part, path: acc });
    } else {
      acc = acc.endsWith(sep) ? acc + part : acc + sep + part;
      crumbs.push({ label: part, path: acc });
    }
  });
  return crumbs.slice(-5); // Zeige die letzten 5 Segmente kompakt an
}

export async function initSftp() {
  if (initialized) return;
  initialized = true;
  try {
    const qp = await api.sftp.localQuickPaths();
    if (qp && qp.ok) {
      sftpState.localQuickPaths = qp;
      sftpState.localPath = qp.home || '';
    }
  } catch {
    /* ignore */
  }
}

export async function renderSftp() {
  await initSftp();
  const root = document.getElementById('view-sftp');
  if (!root) return;

  await loadHosts();
  if (!sftpState.localEntries.length) {
    await loadLocalDirectory(sftpState.localPath);
  }
  paint(root);
}

async function loadHosts() {
  const res = await api.sftp.listHosts();
  if (res && res.ok && Array.isArray(res.hosts)) {
    sftpState.hosts = res.hosts;
    const navCount = document.getElementById('nav-sftp-count');
    if (navCount) {
      navCount.textContent = String(sftpState.hosts.length);
      navCount.hidden = sftpState.hosts.length === 0;
    }
  }
}

async function probeAllHosts(root) {
  for (const h of sftpState.hosts) {
    sftpState.probes.set(h.id, { checking: true });
  }
  paint(root);
  await Promise.all(
    sftpState.hosts.map(async (h) => {
      try {
        const res = await api.sftp.probe(h.host, h.port);
        sftpState.probes.set(h.id, {
          checking: false,
          online: Boolean(res && res.online),
          latencyMs: res ? res.latencyMs : null,
          banner: res && res.banner ? res.banner : '',
          error: res && res.error ? res.error : ''
        });
      } catch (err) {
        sftpState.probes.set(h.id, {
          checking: false,
          online: false,
          error: err.message
        });
      }
    })
  );
  paint(root);
}

async function loadLocalDirectory(targetPath) {
  const res = await api.sftp.localList(targetPath);
  if (res && res.ok) {
    sftpState.localPath = res.path;
    sftpState.localParent = res.parentPath;
    sftpState.localEntries = res.entries || [];
  } else if (res && res.errors) {
    showToast({ type: 'error', title: 'Lokaler Ordner', message: res.errors.join(' ') });
  }
}

async function connectToHost(hostId, targetRemotePath) {
  const host = sftpState.hosts.find((h) => h.id === hostId);
  if (!host) return;
  const root = document.getElementById('view-sftp');

  sftpState.activeHostId = host.id;
  sftpState.remoteLoading = true;
  sftpState.remoteError = '';
  const desiredPath = targetRemotePath !== undefined ? targetRemotePath : (host.remotePath || '/');
  if (root) paint(root);

  const res = await api.sftp.remoteList(host.id, desiredPath);
  sftpState.remoteLoading = false;

  if (res && res.ok) {
    sftpState.connectedHostId = host.id;
    sftpState.remotePath = res.path || '/';
    sftpState.remoteParent = res.parentPath;
    sftpState.remoteEntries = res.entries || [];
    sftpState.remoteError = '';
  } else {
    sftpState.remoteEntries = [];
    sftpState.remoteError = (res && Array.isArray(res.errors) ? res.errors.join(' ') : 'SFTP-Verbindung fehlgeschlagen.');
  }

  if (root) paint(root);
}

function paint(root) {
  if (!root) return;
  const activeHost = sftpState.hosts.find((h) => h.id === sftpState.activeHostId) || null;
  const isConnected = Boolean(activeHost && sftpState.connectedHostId === activeHost.id && !sftpState.remoteError);

  const filteredLocal = sftpState.localEntries.filter((e) => {
    if (!sftpState.localFilter) return true;
    return e.name.toLowerCase().includes(sftpState.localFilter.toLowerCase());
  });

  const filteredRemote = sftpState.remoteEntries.filter((e) => {
    if (!sftpState.remoteFilter) return true;
    return e.name.toLowerCase().includes(sftpState.remoteFilter.toLowerCase());
  });

  const localCrumbs = buildBreadcrumbs(sftpState.localPath, false);
  const remoteCrumbs = buildBreadcrumbs(sftpState.remotePath, true);

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__titles">
        <div class="page-eyebrow">TERMIUS-STYLE SFTP &amp; SSH VAULT</div>
        <h1 class="page-title">SFTP &amp; Dateitransfer</h1>
        <p class="page-sub">Verbinde dich per SFTP/SSH mit deinen Servern und übertrage, bearbeite oder verwalte Dateien direkt im Dual-Pane-Explorer</p>
      </div>
      <div class="page-head__actions">
        <button type="button" class="btn btn--ghost" id="sftp-btn-probe-all" ${sftpState.hosts.length === 0 ? 'disabled' : ''}>
          ${icon('wifi', 14)}
          <span>Alle Server anpingen</span>
        </button>
        <button type="button" class="btn btn--primary" id="sftp-btn-add-host">
          ${icon('plus', 15)}
          <span>SFTP-Host anlegen</span>
        </button>
      </div>
    </div>

    <!-- SFTP Host-Leiste (Vault) -->
    <div class="sftp-hosts-strip">
      <div class="sftp-hosts-strip__head">
        <span class="sftp-hosts-strip__title">${icon('server', 14)} GESPEICHERTE SFTP-SERVER (${sftpState.hosts.length})</span>
        <span class="sftp-hosts-strip__hint">Wähle einen Server zum direkten Verbinden oder verwalte Zugangsdaten &amp; SSH-Keys</span>
      </div>
      ${sftpState.hosts.length === 0 ? `
        <div class="sftp-hosts-empty">
          <div class="sftp-hosts-empty__text">
            <strong>Noch kein SFTP-Server hinterlegt</strong>
            <span>Lege deinen ersten SFTP-/SSH-Host an, um Dateien zwischen deinem PC und deinem Datenbank- oder Webserver auszutauschen.</span>
          </div>
          <button type="button" class="btn btn--primary btn--sm" id="sftp-btn-add-host-empty">
            ${icon('plus', 14)} Ersten SFTP-Host anlegen
          </button>
        </div>
      ` : `
        <div class="sftp-hosts-list" id="sftp-hosts-list">
          ${sftpState.hosts.map((h) => renderHostCard(h, activeHost)).join('')}
        </div>
      `}
    </div>

    <!-- Dual-Pane SFTP Explorer (Termius-Stil) -->
    <div class="sftp-workbench">
      <!-- Linkes Panel: Lokal -->
      <section class="sftp-pane" aria-label="Lokales Dateisystem">
        <div class="sftp-pane__header">
          <div class="sftp-pane__badge">
            <span class="sftp-pane__icon">${icon('hard-drive', 15)}</span>
            <div>
              <div class="sftp-pane__title">LOKAL · DIESER COMPUTER</div>
              <div class="sftp-pane__sub">${filteredLocal.length} Einträge im Ordner</div>
            </div>
          </div>
          <div class="sftp-pane__quick">
            <button type="button" class="btn btn--xs btn--ghost" data-local-jump="home" title="Benutzerordner">Home</button>
            <button type="button" class="btn btn--xs btn--ghost" data-local-jump="desktop" title="Desktop">Desktop</button>
            <button type="button" class="btn btn--xs btn--ghost" data-local-jump="downloads" title="Downloads">Downloads</button>
            <button type="button" class="btn btn--xs btn--ghost" data-local-jump="documents" title="Dokumente">Dokumente</button>
          </div>
        </div>

        <div class="sftp-pane__toolbar">
          <button type="button" class="btn btn--sm btn--icon" id="sftp-local-up" title="Übergeordneter Ordner" ${!sftpState.localParent ? 'disabled' : ''}>
            ${icon('arrow-up', 14)}
          </button>
          <input type="text" class="input sftp-path-input" id="sftp-local-path" value="${escapeHtml(sftpState.localPath)}" spellcheck="false" aria-label="Lokaler Pfad" />
          <button type="button" class="btn btn--sm btn--icon" id="sftp-local-newfile" title="Neue lokale Datei anlegen">
            ${icon('file-text', 14)}
          </button>
          <button type="button" class="btn btn--sm btn--icon" id="sftp-local-mkdir" title="Neuer lokaler Ordner">
            ${icon('folder-plus', 14)}
          </button>
          <button type="button" class="btn btn--sm btn--icon" id="sftp-local-refresh" title="Aktualisieren">
            ${icon('refresh-cw', 14)}
          </button>
        </div>

        <div class="sftp-pane__subbar">
          <div class="sftp-breadcrumbs" aria-label="Lokaler Pfadverlauf">
            ${localCrumbs.map((c, idx) => `
              ${idx > 0 ? `<span class="sftp-breadcrumbs__sep">/</span>` : ''}
              <button type="button" class="sftp-breadcrumbs__item" data-local-open="${escapeHtml(c.path)}" title="${escapeHtml(c.path)}">${escapeHtml(c.label)}</button>
            `).join('')}
          </div>
          <div class="search search--compact sftp-filter-box">
            ${icon('search', 13)}
            <input type="search" id="sftp-local-filter" value="${escapeHtml(sftpState.localFilter)}" placeholder="Filtern …" />
          </div>
        </div>

        <div class="sftp-table-wrap">
          <table class="sftp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th class="sftp-col-size">Größe</th>
                <th class="sftp-col-actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              ${sftpState.localParent ? `
                <tr class="sftp-row sftp-row--parent" data-local-open="${escapeHtml(sftpState.localParent)}">
                  <td colspan="3">
                    <span class="sftp-entry-name">
                      ${icon('folder-open', 15)}
                      <strong>.. (Übergeordneter Ordner)</strong>
                    </span>
                  </td>
                </tr>
              ` : ''}
              ${filteredLocal.map((entry) => `
                <tr class="sftp-row" data-local-entry="${escapeHtml(entry.path)}" data-is-dir="${entry.isDirectory ? '1' : '0'}">
                  <td>
                    <button type="button" class="sftp-entry-link" data-local-click="${escapeHtml(entry.path)}" data-is-dir="${entry.isDirectory ? '1' : '0'}">
                      <span class="sftp-entry-icon ${entry.isDirectory ? 'is-dir' : 'is-file'}">
                        ${icon(entry.isDirectory ? 'folder' : 'file-text', 15)}
                      </span>
                      <span class="sftp-entry-label">${escapeHtml(entry.name)}</span>
                    </button>
                  </td>
                  <td class="sftp-col-size">${entry.isDirectory ? 'ORDNER' : formatBytes(entry.size)}</td>
                  <td class="sftp-col-actions">
                    <div class="sftp-row-btns">
                      <button type="button" class="btn btn--xs btn--primary" data-local-upload="${escapeHtml(entry.path)}" title="Auf aktiven SFTP-Server hochladen" ${!isConnected ? 'disabled' : ''}>
                        ${icon('upload', 12)} <span>Hochladen</span>
                      </button>
                      ${!entry.isDirectory ? `
                        <button type="button" class="btn btn--xs btn--ghost" data-local-edit="${escapeHtml(entry.path)}" title="Datei im Editor bearbeiten">
                          ${icon('file-text', 12)}
                        </button>
                      ` : ''}
                      <button type="button" class="btn btn--xs btn--ghost" data-local-rename="${escapeHtml(entry.path)}" data-entry-name="${escapeHtml(entry.name)}" title="Umbenennen">
                        ${icon('pencil', 12)}
                      </button>
                      <button type="button" class="btn btn--xs btn--ghost" data-local-delete="${escapeHtml(entry.path)}" data-entry-name="${escapeHtml(entry.name)}" title="Löschen">
                        ${icon('trash-2', 12)}
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
              ${filteredLocal.length === 0 ? `
                <tr>
                  <td colspan="3" class="sftp-empty-cell">Keine passenden Dateien in diesem Ordner.</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Rechtes Panel: Remote SFTP Server -->
      <section class="sftp-pane sftp-pane--remote" aria-label="Remote SFTP-Server">
        <div class="sftp-pane__header">
          <div class="sftp-pane__badge">
            <span class="sftp-pane__icon sftp-pane__icon--remote">${icon('terminal', 15)}</span>
            <div>
              <div class="sftp-pane__title">
                ${activeHost ? `REMOTE · ${escapeHtml(activeHost.name.toUpperCase())}` : 'REMOTE · KEIN SERVER VERBUNDEN'}
              </div>
              <div class="sftp-pane__sub">
                ${activeHost
                  ? `${escapeHtml(activeHost.username)}@${escapeHtml(activeHost.host)}:${activeHost.port} · ${isConnected ? `${filteredRemote.length} Einträge` : 'Nicht verbunden'}`
                  : 'Wähle oben einen SFTP-Host aus oder lege einen neuen an'}
              </div>
            </div>
          </div>
          <div class="sftp-pane__quick">
            ${activeHost ? `
              <span class="sftp-conn-pill ${isConnected ? 'is-online' : (sftpState.remoteLoading ? 'is-loading' : 'is-offline')}">
                ${sftpState.remoteLoading ? 'Verbinde …' : (isConnected ? 'Verbunden' : 'Getrennt')}
              </span>
              ${isConnected ? `
                <button type="button" class="btn btn--xs btn--ghost" id="sftp-remote-disconnect" title="Verbindung trennen">Trennen</button>
              ` : `
                <button type="button" class="btn btn--xs btn--primary" id="sftp-remote-reconnect">Verbinden</button>
              `}
            ` : ''}
          </div>
        </div>

        <div class="sftp-pane__toolbar">
          <button type="button" class="btn btn--sm btn--icon" id="sftp-remote-up" title="Übergeordneter Remote-Ordner" ${!isConnected || !sftpState.remoteParent ? 'disabled' : ''}>
            ${icon('arrow-up', 14)}
          </button>
          <input type="text" class="input sftp-path-input" id="sftp-remote-path" value="${escapeHtml(sftpState.remotePath)}" placeholder="/var/www/html" spellcheck="false" aria-label="Remote-Pfad" ${!activeHost ? 'disabled' : ''} />
          <button type="button" class="btn btn--sm btn--icon" id="sftp-remote-newfile" title="Neue Remote-Datei anlegen" ${!isConnected ? 'disabled' : ''}>
            ${icon('file-text', 14)}
          </button>
          <button type="button" class="btn btn--sm btn--icon" id="sftp-remote-mkdir" title="Neuer Remote-Ordner" ${!isConnected ? 'disabled' : ''}>
            ${icon('folder-plus', 14)}
          </button>
          <button type="button" class="btn btn--sm btn--icon" id="sftp-remote-refresh" title="Remote-Ordner neu laden" ${!activeHost ? 'disabled' : ''}>
            ${icon('refresh-cw', 14)}
          </button>
        </div>

        <div class="sftp-pane__subbar">
          <div class="sftp-breadcrumbs" aria-label="Remote-Pfadverlauf">
            ${isConnected ? remoteCrumbs.map((c, idx) => `
              ${idx > 0 ? `<span class="sftp-breadcrumbs__sep">/</span>` : ''}
              <button type="button" class="sftp-breadcrumbs__item" data-remote-open="${escapeHtml(c.path)}" title="${escapeHtml(c.path)}">${escapeHtml(c.label)}</button>
            `).join('') : `<span class="sftp-breadcrumbs__placeholder">Kein Remote-Pfad aktiv</span>`}
          </div>
          <div class="search search--compact sftp-filter-box">
            ${icon('search', 13)}
            <input type="search" id="sftp-remote-filter" value="${escapeHtml(sftpState.remoteFilter)}" placeholder="Filtern …" ${!isConnected ? 'disabled' : ''} />
          </div>
        </div>

        <div class="sftp-table-wrap">
          ${!activeHost ? `
            <div class="sftp-remote-placeholder">
              <div class="sftp-remote-placeholder__icon">${icon('server', 28)}</div>
              <h3>KEINE AKTIVE SFTP-SITZUNG</h3>
              <p>Wähle oben einen gespeicherten SFTP-Host und klicke auf <strong>Verbinden</strong>, um das Remote-Dateisystem im Dual-Pane-Modus zu öffnen.</p>
              <button type="button" class="btn btn--primary btn--sm" id="sftp-placeholder-add">
                ${icon('plus', 14)} SFTP-Host hinzufügen
              </button>
            </div>
          ` : sftpState.remoteLoading ? `
            <div class="sftp-remote-placeholder">
              <span class="spinner"></span>
              <h3>VERBINDUNG ZU ${escapeHtml(activeHost.host.toUpperCase())} WIRD AUFGEBAUT …</h3>
              <p>SSH/SFTP-Handshake &amp; Verzeichnisliste werden geladen …</p>
            </div>
          ` : sftpState.remoteError ? `
            <div class="sftp-remote-placeholder is-error">
              <div class="sftp-remote-placeholder__icon">${icon('triangle-alert', 26)}</div>
              <h3>SFTP-VERBINDUNG FEHLGESCHLAGEN</h3>
              <p>${escapeHtml(sftpState.remoteError)}</p>
              <div class="sftp-remote-placeholder__actions">
                <button type="button" class="btn btn--primary btn--sm" id="sftp-error-retry">
                  ${icon('refresh-cw', 13)} Erneut versuchen
                </button>
                <button type="button" class="btn btn--ghost btn--sm" id="sftp-error-edit">
                  ${icon('pencil', 13)} Zugangsdaten prüfen
                </button>
              </div>
            </div>
          ` : `
            <table class="sftp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th class="sftp-col-perms">Rechte</th>
                  <th class="sftp-col-size">Größe</th>
                  <th class="sftp-col-actions">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                ${sftpState.remoteParent ? `
                  <tr class="sftp-row sftp-row--parent" data-remote-open="${escapeHtml(sftpState.remoteParent)}">
                    <td colspan="4">
                      <span class="sftp-entry-name">
                        ${icon('folder-open', 15)}
                        <strong>.. (Übergeordneter Ordner)</strong>
                      </span>
                    </td>
                  </tr>
                ` : ''}
                ${filteredRemote.map((entry) => `
                  <tr class="sftp-row">
                    <td>
                      <button type="button" class="sftp-entry-link" data-remote-click="${escapeHtml(entry.path)}" data-is-dir="${entry.isDirectory ? '1' : '0'}">
                        <span class="sftp-entry-icon ${entry.isDirectory ? 'is-dir' : 'is-file'}">
                          ${icon(entry.isDirectory ? 'folder' : 'file-text', 15)}
                        </span>
                        <span class="sftp-entry-label">${escapeHtml(entry.name)}</span>
                      </button>
                    </td>
                    <td class="sftp-col-perms"><code>${escapeHtml(entry.permissions || '')}</code></td>
                    <td class="sftp-col-size">${entry.isDirectory ? 'ORDNER' : formatBytes(entry.size)}</td>
                    <td class="sftp-col-actions">
                      <div class="sftp-row-btns">
                        <button type="button" class="btn btn--xs btn--primary" data-remote-download="${escapeHtml(entry.path)}" data-is-dir="${entry.isDirectory ? '1' : '0'}" title="In aktuellen lokalen Ordner herunterladen">
                          ${icon('download', 12)} <span>Lokal</span>
                        </button>
                        ${!entry.isDirectory ? `
                          <button type="button" class="btn btn--xs btn--ghost" data-remote-edit="${escapeHtml(entry.path)}" title="Remote-Datei im Editor bearbeiten">
                            ${icon('file-text', 12)}
                          </button>
                        ` : ''}
                        <button type="button" class="btn btn--xs btn--ghost" data-remote-rename="${escapeHtml(entry.path)}" data-entry-name="${escapeHtml(entry.name)}" title="Auf Server umbenennen">
                          ${icon('pencil', 12)}
                        </button>
                        <button type="button" class="btn btn--xs btn--ghost" data-remote-delete="${escapeHtml(entry.path)}" data-is-dir="${entry.isDirectory ? '1' : '0'}" data-entry-name="${escapeHtml(entry.name)}" title="Auf Server löschen">
                          ${icon('trash-2', 12)}
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
                ${filteredRemote.length === 0 ? `
                  <tr>
                    <td colspan="4" class="sftp-empty-cell">Dieser Remote-Ordner ist leer.</td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          `}
        </div>
      </section>
    </div>
  `;

  bindEvents(root);
}

function renderHostCard(host, activeHost) {
  const isSelected = activeHost && activeHost.id === host.id;
  const isConnected = sftpState.connectedHostId === host.id && !sftpState.remoteError;
  const probe = sftpState.probes.get(host.id);

  let statusHtml = `<span class="sftp-host-card__ping" data-host-probe="${escapeHtml(host.id)}" title="Klicken für SSH-Port-Check">Port ${host.port}</span>`;
  if (probe) {
    if (probe.checking) {
      statusHtml = `<span class="sftp-host-card__ping is-checking">Prüfe …</span>`;
    } else if (probe.online) {
      statusHtml = `<span class="sftp-host-card__ping is-online" title="${escapeHtml(probe.banner || 'SSH erreichbar')}">● ${probe.latencyMs} ms</span>`;
    } else {
      statusHtml = `<span class="sftp-host-card__ping is-offline" title="${escapeHtml(probe.error || 'Nicht erreichbar')}">○ Offline</span>`;
    }
  }

  return `
    <div class="sftp-host-card ${isSelected ? 'is-selected' : ''} ${isConnected ? 'is-connected' : ''}" data-host-id="${escapeHtml(host.id)}" style="--host-accent:${escapeHtml(host.accentColor || '#e11d48')}">
      <div class="sftp-host-card__top">
        <span class="sftp-host-card__icon" style="color:${escapeHtml(host.accentColor || '#e11d48')}">
          ${icon('terminal', 15)}
        </span>
        <div class="sftp-host-card__meta">
          <div class="sftp-host-card__name">
            <span>${escapeHtml(host.name)}</span>
            ${host.category ? `<span class="sftp-host-card__cat">${escapeHtml(host.category)}</span>` : ''}
          </div>
          <div class="sftp-host-card__addr">${escapeHtml(host.username)}@${escapeHtml(host.host)}:${host.port}</div>
        </div>
        ${statusHtml}
      </div>
      <div class="sftp-host-card__foot">
        <button type="button" class="btn btn--xs ${isConnected ? 'btn--ghost' : 'btn--primary'}" data-host-connect="${escapeHtml(host.id)}">
          ${icon('plug', 12)}
          <span>${isConnected ? 'Neu laden' : 'Verbinden'}</span>
        </button>
        <div class="sftp-host-card__tools">
          <button type="button" class="btn btn--xs btn--icon btn--ghost" data-host-probe="${escapeHtml(host.id)}" title="SSH-Banner &amp; Ping prüfen">
            ${icon('wifi', 12)}
          </button>
          <button type="button" class="btn btn--xs btn--icon btn--ghost" data-host-duplicate="${escapeHtml(host.id)}" title="Host duplizieren">
            ${icon('copy', 12)}
          </button>
          <button type="button" class="btn btn--xs btn--icon btn--ghost" data-host-edit="${escapeHtml(host.id)}" title="Host bearbeiten">
            ${icon('pencil', 12)}
          </button>
          <button type="button" class="btn btn--xs btn--icon btn--ghost" data-host-delete="${escapeHtml(host.id)}" title="Host löschen">
            ${icon('trash-2', 12)}
          </button>
        </div>
      </div>
    </div>
  `;
}

function bindEvents(root) {
  root.querySelector('#sftp-btn-add-host')?.addEventListener('click', () => openHostModal({ mode: 'create' }));
  root.querySelector('#sftp-btn-add-host-empty')?.addEventListener('click', () => openHostModal({ mode: 'create' }));
  root.querySelector('#sftp-placeholder-add')?.addEventListener('click', () => openHostModal({ mode: 'create' }));
  root.querySelector('#sftp-btn-probe-all')?.addEventListener('click', () => probeAllHosts(root));

  // Host-Karten
  root.querySelectorAll('.sftp-host-card[data-host-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('[data-host-probe]')) return;
      connectToHost(card.getAttribute('data-host-id'));
    });
  });

  root.querySelectorAll('[data-host-connect]').forEach((btn) => {
    btn.addEventListener('click', () => connectToHost(btn.getAttribute('data-host-connect')));
  });

  root.querySelectorAll('[data-host-probe]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-host-probe');
      const host = sftpState.hosts.find((h) => h.id === id);
      if (!host) return;
      sftpState.probes.set(id, { checking: true });
      paint(root);
      const res = await api.sftp.probe(host.host, host.port);
      sftpState.probes.set(id, {
        checking: false,
        online: Boolean(res && res.online),
        latencyMs: res ? res.latencyMs : null,
        banner: res && res.banner ? res.banner : '',
        error: res && res.error ? res.error : ''
      });
      paint(root);
      if (res && res.online) {
        showToast({ type: 'success', title: `${host.name} erreichbar`, message: `${res.banner || 'SSH-Port offen'} (${res.latencyMs} ms)` });
      } else {
        showToast({ type: 'warning', title: `${host.name} nicht erreichbar`, message: (res && res.error) || 'Port antwortet nicht.' });
      }
    });
  });

  root.querySelectorAll('[data-host-duplicate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-host-duplicate');
      const res = await api.sftp.duplicateHost(id);
      if (res && res.ok) {
        await loadHosts();
        paint(root);
        showToast({ type: 'success', message: 'SFTP-Host wurde dupliziert.' });
      }
    });
  });

  root.querySelectorAll('[data-host-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-host-edit');
      const host = sftpState.hosts.find((h) => h.id === id);
      if (host) openHostModal({ mode: 'edit', host });
    });
  });

  root.querySelectorAll('[data-host-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-host-delete');
      const host = sftpState.hosts.find((h) => h.id === id);
      if (!host) return;
      const ok = await confirmDialog({
        title: 'SFTP-Host löschen?',
        message: `Soll der SFTP-Host „${host.name}“ (${host.host}) inklusive gespeicherter Zugangsdaten gelöscht werden?`,
        confirmLabel: 'Host löschen',
        danger: true
      });
      if (!ok) return;
      await api.sftp.deleteHost(id);
      if (sftpState.activeHostId === id) {
        sftpState.activeHostId = null;
        sftpState.connectedHostId = null;
        sftpState.remoteEntries = [];
      }
      await loadHosts();
      paint(root);
      showToast({ type: 'success', message: 'SFTP-Host wurde gelöscht.' });
    });
  });

  // Lokale Steuerung
  root.querySelectorAll('[data-local-jump]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-local-jump');
      if (sftpState.localQuickPaths && sftpState.localQuickPaths[key]) {
        await loadLocalDirectory(sftpState.localQuickPaths[key]);
        paint(root);
      }
    });
  });

  root.querySelector('#sftp-local-up')?.addEventListener('click', async () => {
    if (sftpState.localParent) {
      await loadLocalDirectory(sftpState.localParent);
      paint(root);
    }
  });

  root.querySelector('#sftp-local-refresh')?.addEventListener('click', async () => {
    await loadLocalDirectory(sftpState.localPath);
    paint(root);
  });

  const localPathInput = root.querySelector('#sftp-local-path');
  localPathInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      await loadLocalDirectory(localPathInput.value.trim());
      paint(root);
    }
  });

  const localFilterInput = root.querySelector('#sftp-local-filter');
  localFilterInput?.addEventListener('input', () => {
    sftpState.localFilter = localFilterInput.value;
    const pos = localFilterInput.selectionStart;
    paint(root);
    const next = root.querySelector('#sftp-local-filter');
    if (next) {
      next.focus();
      try { next.setSelectionRange(pos, pos); } catch { /* ignore */ }
    }
  });

  root.querySelector('#sftp-local-newfile')?.addEventListener('click', () => {
    openPromptModal({
      title: 'Neue lokale Datei anlegen',
      label: 'Dateiname',
      placeholder: 'z. B. config.json oder query.sql',
      confirmLabel: 'Datei anlegen & öffnen',
      onSubmit: async (fileName) => {
        const sep = sftpState.localPath.includes('\\') ? '\\' : '/';
        const fullPath = sftpState.localPath.endsWith(sep)
          ? sftpState.localPath + fileName
          : sftpState.localPath + sep + fileName;
        const res = await api.sftp.localWrite(fullPath, '');
        if (!res || !res.ok) {
          showToast({ type: 'error', message: (res && res.errors && res.errors[0]) || 'Datei konnte nicht angelegt werden.' });
          return false;
        }
        await loadLocalDirectory(sftpState.localPath);
        paint(root);
        openFileEditor({ side: 'local', filePath: fullPath });
        return true;
      }
    });
  });

  root.querySelector('#sftp-local-mkdir')?.addEventListener('click', () => {
    openPromptModal({
      title: 'Neuer lokaler Ordner',
      label: 'Ordnername',
      placeholder: 'z. B. backup-sql',
      confirmLabel: 'Ordner erstellen',
      onSubmit: async (folderName) => {
        const res = await api.sftp.localMkdir(sftpState.localPath, folderName);
        if (!res || !res.ok) {
          showToast({ type: 'error', message: (res && res.errors && res.errors[0]) || 'Ordner konnte nicht erstellt werden.' });
          return false;
        }
        await loadLocalDirectory(sftpState.localPath);
        paint(root);
        showToast({ type: 'success', message: `Ordner „${folderName}“ erstellt.` });
        return true;
      }
    });
  });

  root.querySelectorAll('[data-local-open]').forEach((row) => {
    row.addEventListener('click', async () => {
      await loadLocalDirectory(row.getAttribute('data-local-open'));
      paint(root);
    });
  });

  root.querySelectorAll('[data-local-click]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = btn.getAttribute('data-local-click');
      const isDir = btn.getAttribute('data-is-dir') === '1';
      if (isDir) {
        await loadLocalDirectory(target);
        paint(root);
      } else {
        openFileEditor({ side: 'local', filePath: target });
      }
    });
  });

  root.querySelectorAll('[data-local-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openFileEditor({ side: 'local', filePath: btn.getAttribute('data-local-edit') });
    });
  });

  root.querySelectorAll('[data-local-rename]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-local-rename');
      const oldName = btn.getAttribute('data-entry-name') || '';
      openPromptModal({
        title: 'Lokalen Eintrag umbenennen',
        label: 'Neuer Name',
        initialValue: oldName,
        placeholder: oldName,
        confirmLabel: 'Umbenennen',
        onSubmit: async (newName) => {
          if (newName === oldName) return true;
          const res = await api.sftp.localRename(target, newName);
          if (!res || !res.ok) {
            showToast({ type: 'error', message: (res && res.errors && res.errors[0]) || 'Umbenennen fehlgeschlagen.' });
            return false;
          }
          await loadLocalDirectory(sftpState.localPath);
          paint(root);
          showToast({ type: 'success', message: `Umbenannt in „${newName}“.` });
          return true;
        }
      });
    });
  });

  root.querySelectorAll('[data-local-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = btn.getAttribute('data-local-delete');
      const name = btn.getAttribute('data-entry-name');
      const ok = await confirmDialog({
        title: 'Lokalen Eintrag löschen?',
        message: `Soll „${name}“ wirklich von deiner lokalen Festplatte gelöscht werden?`,
        confirmLabel: 'Endgültig löschen',
        danger: true
      });
      if (!ok) return;
      const res = await api.sftp.localDelete(target);
      if (res && res.ok) {
        await loadLocalDirectory(sftpState.localPath);
        paint(root);
        showToast({ type: 'success', message: `„${name}“ wurde gelöscht.` });
      } else {
        showToast({ type: 'error', message: (res && res.errors && res.errors[0]) || 'Löschen fehlgeschlagen.' });
      }
    });
  });

  root.querySelectorAll('[data-local-upload]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!sftpState.connectedHostId) return;
      const localFile = btn.getAttribute('data-local-upload');
      showToast({ type: 'info', message: 'Datei wird per SFTP hochgeladen …' });
      const res = await api.sftp.upload(sftpState.connectedHostId, localFile, sftpState.remotePath);
      if (res && res.ok) {
        await connectToHost(sftpState.connectedHostId, sftpState.remotePath);
        showToast({ type: 'success', title: 'Upload abgeschlossen', message: `Übertragen nach ${res.remotePath}` });
      } else {
        showToast({ type: 'error', title: 'Upload fehlgeschlagen', message: (res && res.errors && res.errors[0]) || 'SFTP-Fehler' });
      }
    });
  });

  // Remote Steuerung
  root.querySelector('#sftp-remote-disconnect')?.addEventListener('click', () => {
    sftpState.connectedHostId = null;
    sftpState.remoteEntries = [];
    sftpState.remoteError = '';
    paint(root);
  });

  root.querySelector('#sftp-remote-reconnect')?.addEventListener('click', () => {
    if (sftpState.activeHostId) connectToHost(sftpState.activeHostId, sftpState.remotePath);
  });

  root.querySelector('#sftp-error-retry')?.addEventListener('click', () => {
    if (sftpState.activeHostId) connectToHost(sftpState.activeHostId, sftpState.remotePath);
  });

  root.querySelector('#sftp-error-edit')?.addEventListener('click', () => {
    const host = sftpState.hosts.find((h) => h.id === sftpState.activeHostId);
    if (host) openHostModal({ mode: 'edit', host });
  });

  root.querySelector('#sftp-remote-up')?.addEventListener('click', () => {
    if (sftpState.connectedHostId && sftpState.remoteParent) {
      connectToHost(sftpState.connectedHostId, sftpState.remoteParent);
    }
  });

  root.querySelector('#sftp-remote-refresh')?.addEventListener('click', () => {
    if (sftpState.activeHostId) {
      connectToHost(sftpState.activeHostId, sftpState.remotePath);
    }
  });

  const remotePathInput = root.querySelector('#sftp-remote-path');
  remotePathInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && sftpState.activeHostId) {
      connectToHost(sftpState.activeHostId, remotePathInput.value.trim() || '/');
    }
  });

  const remoteFilterInput = root.querySelector('#sftp-remote-filter');
  remoteFilterInput?.addEventListener('input', () => {
    sftpState.remoteFilter = remoteFilterInput.value;
    const pos = remoteFilterInput.selectionStart;
    paint(root);
    const next = root.querySelector('#sftp-remote-filter');
    if (next) {
      next.focus();
      try { next.setSelectionRange(pos, pos); } catch { /* ignore */ }
    }
  });

  root.querySelector('#sftp-remote-newfile')?.addEventListener('click', () => {
    if (!sftpState.connectedHostId) return;
    openPromptModal({
      title: 'Neue Remote-Datei anlegen',
      label: 'Dateiname auf dem Server',
      placeholder: 'z. B. .env oder index.php',
      confirmLabel: 'Auf Server anlegen',
      onSubmit: async (fileName) => {
        const clean = fileName.replace(/^\/+/, '');
        const base = sftpState.remotePath.endsWith('/') ? sftpState.remotePath : sftpState.remotePath + '/';
        const fullRemote = base + clean;
        const res = await api.sftp.remoteWrite(sftpState.connectedHostId, fullRemote, '');
        if (!res || !res.ok) {
          showToast({ type: 'error', message: (res && res.errors && res.errors[0]) || 'Remote-Datei konnte nicht angelegt werden.' });
          return false;
        }
        await connectToHost(sftpState.connectedHostId, sftpState.remotePath);
        openFileEditor({ side: 'remote', hostId: sftpState.connectedHostId, filePath: fullRemote });
        return true;
      }
    });
  });

  root.querySelector('#sftp-remote-mkdir')?.addEventListener('click', () => {
    if (!sftpState.connectedHostId) return;
    openPromptModal({
      title: 'Neuer Remote-Ordner',
      label: 'Ordnername auf dem Server',
      placeholder: 'z. B. releases',
      confirmLabel: 'Auf Server anlegen',
      onSubmit: async (folderName) => {
        const res = await api.sftp.remoteMkdir(sftpState.connectedHostId, sftpState.remotePath, folderName);
        if (!res || !res.ok) {
          showToast({ type: 'error', message: (res && res.errors && res.errors[0]) || 'Remote-Ordner konnte nicht angelegt werden.' });
          return false;
        }
        await connectToHost(sftpState.connectedHostId, sftpState.remotePath);
        showToast({ type: 'success', message: `Remote-Ordner „${folderName}“ erstellt.` });
        return true;
      }
    });
  });

  root.querySelectorAll('[data-remote-open]').forEach((row) => {
    row.addEventListener('click', () => {
      if (sftpState.connectedHostId) {
        connectToHost(sftpState.connectedHostId, row.getAttribute('data-remote-open'));
      }
    });
  });

  root.querySelectorAll('[data-remote-click]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-remote-click');
      const isDir = btn.getAttribute('data-is-dir') === '1';
      if (isDir) {
        connectToHost(sftpState.connectedHostId, target);
      } else {
        openFileEditor({ side: 'remote', hostId: sftpState.connectedHostId, filePath: target });
      }
    });
  });

  root.querySelectorAll('[data-remote-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openFileEditor({
        side: 'remote',
        hostId: sftpState.connectedHostId,
        filePath: btn.getAttribute('data-remote-edit')
      });
    });
  });

  root.querySelectorAll('[data-remote-rename]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!sftpState.connectedHostId) return;
      const target = btn.getAttribute('data-remote-rename');
      const oldName = btn.getAttribute('data-entry-name') || '';
      openPromptModal({
        title: 'Remote-Eintrag umbenennen',
        label: 'Neuer Name auf dem Server',
        initialValue: oldName,
        placeholder: oldName,
        confirmLabel: 'Auf Server umbenennen',
        onSubmit: async (newName) => {
          if (newName === oldName) return true;
          const res = await api.sftp.remoteRename(sftpState.connectedHostId, target, newName);
          if (!res || !res.ok) {
            showToast({ type: 'error', message: (res && res.errors && res.errors[0]) || 'Umbenennen auf Server fehlgeschlagen.' });
            return false;
          }
          await connectToHost(sftpState.connectedHostId, sftpState.remotePath);
          showToast({ type: 'success', message: `Umbenannt in „${newName}“.` });
          return true;
        }
      });
    });
  });

  root.querySelectorAll('[data-remote-download]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!sftpState.connectedHostId) return;
      const remoteFile = btn.getAttribute('data-remote-download');
      const isDir = btn.getAttribute('data-is-dir') === '1';
      showToast({ type: 'info', message: 'Datei wird vom SFTP-Server heruntergeladen …' });
      const res = await api.sftp.download(sftpState.connectedHostId, remoteFile, sftpState.localPath, isDir);
      if (res && res.ok) {
        await loadLocalDirectory(sftpState.localPath);
        paint(root);
        showToast({ type: 'success', title: 'Download abgeschlossen', message: `Gespeichert unter ${res.localPath}` });
      } else {
        showToast({ type: 'error', title: 'Download fehlgeschlagen', message: (res && res.errors && res.errors[0]) || 'SFTP-Fehler' });
      }
    });
  });

  root.querySelectorAll('[data-remote-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!sftpState.connectedHostId) return;
      const remoteFile = btn.getAttribute('data-remote-delete');
      const isDir = btn.getAttribute('data-is-dir') === '1';
      const name = btn.getAttribute('data-entry-name');
      const ok = await confirmDialog({
        title: 'Remote-Eintrag löschen?',
        message: `Soll „${name}“ auf dem SFTP-Server wirklich gelöscht werden?`,
        confirmLabel: 'Auf Server löschen',
        danger: true
      });
      if (!ok) return;
      const res = await api.sftp.remoteDelete(sftpState.connectedHostId, remoteFile, isDir);
      if (res && res.ok) {
        await connectToHost(sftpState.connectedHostId, sftpState.remotePath);
        showToast({ type: 'success', message: `„${name}“ wurde vom Server gelöscht.` });
      } else {
        showToast({ type: 'error', message: (res && res.errors && res.errors[0]) || 'Löschen auf Server fehlgeschlagen.' });
      }
    });
  });
}

/* ------------------------ Host-Dialog (Anlegen / Bearbeiten) ------------------------ */

function openHostModal({ mode = 'create', host = null }) {
  const isEdit = mode === 'edit' && host;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const currentAuth = (host && host.authType) || 'password';
  let selectedColor = (host && host.accentColor) || SFTP_COLORS[0];

  overlay.innerHTML = `
    <form class="modal modal--wide" id="sftp-host-form" role="dialog" aria-modal="true" aria-labelledby="sftp-modal-title" novalidate>
      <div class="modal__header">
        <div>
          <div class="modal__eyebrow">${isEdit ? 'SFTP-Host bearbeiten' : 'Neuer SFTP-Server'}</div>
          <h2 class="modal__title" id="sftp-modal-title">${isEdit ? escapeHtml(host.name) : 'Neuen SFTP-Host anlegen'}</h2>
        </div>
        <button type="button" class="modal__close" id="sftp-modal-close" title="Schließen (ESC)" aria-label="Dialog schließen">
          ${icon('x', 16)}
        </button>
      </div>

      <div class="modal__body">
        <div class="row">
          <div class="field">
            <label for="sftp-name">Bezeichnung *</label>
            <input class="input" id="sftp-name" type="text" required placeholder="z. B. Prod Webserver #1" value="${escapeHtml(host ? host.name : '')}" />
          </div>
          <div class="field">
            <label for="sftp-category">Kategorie / Gruppe</label>
            <input class="input" id="sftp-category" type="text" placeholder="z. B. Produktion, Backup" value="${escapeHtml(host ? host.category || '' : '')}" />
          </div>
        </div>

        <div class="row">
          <div class="field" style="flex:2.2">
            <label for="sftp-host">Host / IP-Adresse *</label>
            <input class="input" id="sftp-host" type="text" required placeholder="z. B. sftp.example.com oder 10.0.0.12" value="${escapeHtml(host ? host.host : '')}" />
          </div>
          <div class="field" style="flex:0.8">
            <label for="sftp-port">SSH / SFTP Port *</label>
            <input class="input" id="sftp-port" type="number" min="1" max="65535" required value="${host ? host.port : 22}" />
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label for="sftp-user">Benutzername *</label>
            <input class="input" id="sftp-user" type="text" required placeholder="z. B. root oder deploy" value="${escapeHtml(host ? host.username : '')}" />
          </div>
          <div class="field">
            <label for="sftp-auth-type">Authentifizierung</label>
            <select class="input" id="sftp-auth-type">
              <option value="password" ${currentAuth === 'password' ? 'selected' : ''}>Passwort (Verschlüsselter Tresor)</option>
              <option value="key" ${currentAuth === 'key' ? 'selected' : ''}>SSH Private Key (.pem / id_ed25519 / id_rsa)</option>
            </select>
          </div>
        </div>

        <div class="field" id="sftp-key-field" ${currentAuth === 'key' ? '' : 'hidden'}>
          <label for="sftp-key-path">Pfad zum SSH Private Key</label>
          <div style="display:flex;gap:8px;">
            <input class="input" id="sftp-key-path" type="text" placeholder="~/.ssh/id_ed25519" value="${escapeHtml(host ? host.privateKeyPath || '' : '')}" />
            <button type="button" class="btn btn--ghost" id="sftp-pick-key">Durchsuchen …</button>
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label for="sftp-password" id="sftp-password-label">
              ${currentAuth === 'key' ? 'Key-Passphrase (optional)' : (isEdit && host.hasPassword ? 'Neues Passwort (leer = behalten)' : 'SSH / SFTP Passwort')}
            </label>
            <div class="pw-wrap">
              <input class="input" id="sftp-password" type="password" autocomplete="new-password" placeholder="${isEdit && host.hasPassword ? '•••••••• (gespeichert)' : 'Passwort eingeben …'}" />
              <button type="button" class="pw-toggle" id="sftp-pw-toggle" title="Passwort ein-/ausblenden" aria-label="Passwort ein-/ausblenden">
                ${icon('eye', 15)}
              </button>
            </div>
          </div>
          <div class="field">
            <label for="sftp-remote-dir">Standard Remote-Startordner</label>
            <input class="input" id="sftp-remote-dir" type="text" placeholder="/var/www/html" value="${escapeHtml(host ? host.remotePath || '/' : '/var/www')}" />
          </div>
        </div>

        <div class="field">
          <label>Akzentfarbe</label>
          <div class="color-field" id="sftp-color-swatches">
            ${SFTP_COLORS.map((c) => `
              <button type="button" class="color-swatch ${c.toLowerCase() === selectedColor.toLowerCase() ? 'is-selected' : ''}" data-sftp-color="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>
            `).join('')}
          </div>
        </div>

        <div class="sftp-test-banner" id="sftp-test-banner" hidden></div>
      </div>

      <div class="modal__footer modal__footer--split">
        <button type="button" class="btn btn--ghost" id="sftp-modal-test">
          ${icon('wifi', 14)}
          <span>SSH-Port testen</span>
        </button>
        <div class="modal__footer-right">
          <button type="button" class="btn btn--ghost" id="sftp-modal-cancel">Abbrechen</button>
          <button type="submit" class="btn btn--primary">
            ${icon('check', 14)}
            <span>${isEdit ? 'Änderungen speichern' : 'SFTP-Host anlegen'}</span>
          </button>
        </div>
      </div>
    </form>
  `;

  document.getElementById('modal-root').appendChild(overlay);

  const authSelect = overlay.querySelector('#sftp-auth-type');
  if (authSelect) enhanceSelect(authSelect);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) {
      const closeBtn = overlay.querySelector('#sftp-modal-close');
      if (closeBtn) {
        closeBtn.classList.remove('is-attention');
        void closeBtn.offsetWidth;
        closeBtn.classList.add('is-attention');
      }
    }
  });

  overlay.querySelector('#sftp-modal-close')?.addEventListener('click', close);
  overlay.querySelector('#sftp-modal-cancel')?.addEventListener('click', close);

  const keyField = overlay.querySelector('#sftp-key-field');
  const pwLabel = overlay.querySelector('#sftp-password-label');
  authSelect?.addEventListener('change', () => {
    const isKey = authSelect.value === 'key';
    if (keyField) keyField.hidden = !isKey;
    if (pwLabel) {
      pwLabel.textContent = isKey
        ? 'Key-Passphrase (optional)'
        : (isEdit && host.hasPassword ? 'Neues Passwort (leer = behalten)' : 'SSH / SFTP Passwort');
    }
  });

  const pwInput = overlay.querySelector('#sftp-password');
  const pwToggle = overlay.querySelector('#sftp-pw-toggle');
  pwToggle?.addEventListener('click', () => {
    const show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    pwToggle.innerHTML = icon(show ? 'eye-off' : 'eye', 15);
  });

  overlay.querySelectorAll('[data-sftp-color]').forEach((sw) => {
    sw.addEventListener('click', () => {
      selectedColor = sw.getAttribute('data-sftp-color');
      overlay.querySelectorAll('[data-sftp-color]').forEach((el) => {
        el.classList.toggle('is-selected', el === sw);
      });
    });
  });

  overlay.querySelector('#sftp-pick-key')?.addEventListener('click', async () => {
    const res = await api.sftp.pickKey();
    if (res && res.ok && res.path) {
      const inp = overlay.querySelector('#sftp-key-path');
      if (inp) inp.value = res.path;
    }
  });

  const testBanner = overlay.querySelector('#sftp-test-banner');
  overlay.querySelector('#sftp-modal-test')?.addEventListener('click', async () => {
    const h = overlay.querySelector('#sftp-host').value.trim();
    const p = Number(overlay.querySelector('#sftp-port').value) || 22;
    if (!h) {
      showToast({ type: 'warning', message: 'Bitte zuerst eine Host-Adresse eingeben.' });
      overlay.querySelector('#sftp-host')?.focus();
      return;
    }
    if (testBanner) {
      testBanner.hidden = false;
      testBanner.className = 'sftp-test-banner is-checking';
      testBanner.textContent = `Prüfe SSH/SFTP-Port ${h}:${p} …`;
    }
    const res = await api.sftp.probe(h, p);
    if (res && res.online) {
      if (testBanner) {
        testBanner.className = 'sftp-test-banner is-online';
        testBanner.textContent = `✓ Erreichbar (${res.latencyMs} ms) · ${res.banner || 'SSH-Port offen'}`;
      }
      showToast({
        type: 'success',
        title: 'SSH/SFTP-Server erreichbar',
        message: `${res.banner || 'Port offen'} · Antwortzeit: ${res.latencyMs} ms`
      });
    } else {
      if (testBanner) {
        testBanner.className = 'sftp-test-banner is-offline';
        testBanner.textContent = `✕ Nicht erreichbar: ${(res && res.error) || 'Keine Antwort auf diesem Port.'}`;
      }
      showToast({
        type: 'error',
        title: 'Nicht erreichbar',
        message: (res && res.error) || 'Keine Antwort auf diesem Port.'
      });
    }
  });

  overlay.querySelector('#sftp-host-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: overlay.querySelector('#sftp-name').value.trim(),
      category: overlay.querySelector('#sftp-category').value.trim(),
      host: overlay.querySelector('#sftp-host').value.trim(),
      port: Number(overlay.querySelector('#sftp-port').value) || 22,
      username: overlay.querySelector('#sftp-user').value.trim(),
      authType: overlay.querySelector('#sftp-auth-type').value,
      privateKeyPath: overlay.querySelector('#sftp-key-path').value.trim(),
      password: overlay.querySelector('#sftp-password').value,
      remotePath: overlay.querySelector('#sftp-remote-dir').value.trim() || '/',
      accentColor: selectedColor
    };

    const res = isEdit
      ? await api.sftp.updateHost(host.id, payload)
      : await api.sftp.createHost(payload);

    if (!res || !res.ok) {
      showToast({
        type: 'error',
        message: (res && res.errors && res.errors.join(' ')) || 'Host konnte nicht gespeichert werden.'
      });
      return;
    }

    close();
    await loadHosts();
    const root = document.getElementById('view-sftp');
    if (res.host) {
      sftpState.activeHostId = res.host.id;
    }
    if (root) paint(root);
    showToast({
      type: 'success',
      message: isEdit ? 'SFTP-Host aktualisiert.' : 'SFTP-Host angelegt.'
    });
  });

  setTimeout(() => overlay.querySelector('#sftp-name')?.focus(), 20);
}

/* ------------------------ Kleiner Eingabe-Dialog (Neuer Ordner / Umbenennen) ------------------------ */

function openPromptModal({ title, label, initialValue = '', placeholder = '', confirmLabel = 'Speichern', onSubmit }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <form class="modal" id="sftp-prompt-form" style="max-width:440px" role="dialog" aria-modal="true">
      <div class="modal__header">
        <div>
          <div class="modal__eyebrow">SFTP Dateisystem</div>
          <h2 class="modal__title">${escapeHtml(title)}</h2>
        </div>
        <button type="button" class="modal__close" data-close title="Schließen (ESC)">${icon('x', 16)}</button>
      </div>
      <div class="modal__body">
        <div class="field">
          <label for="sftp-prompt-input">${escapeHtml(label)}</label>
          <input class="input" id="sftp-prompt-input" type="text" required value="${escapeHtml(initialValue)}" placeholder="${escapeHtml(placeholder)}" />
        </div>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn btn--ghost" data-close>Abbrechen</button>
        <button type="submit" class="btn btn--primary">${icon('check', 14)} <span>${escapeHtml(confirmLabel)}</span></button>
      </div>
    </form>
  `;
  document.getElementById('modal-root').appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKey);
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  const input = overlay.querySelector('#sftp-prompt-input');
  setTimeout(() => {
    if (input) {
      input.focus();
      input.select();
    }
  }, 20);
  overlay.querySelector('#sftp-prompt-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (!val) return;
    const ok = await onSubmit(val);
    if (ok !== false) close();
  });
}

/* ------------------------ Integrierter Datei-Editor (Lokal & Remote) ------------------------ */

async function openFileEditor({ side, hostId, filePath }) {
  const res = side === 'remote'
    ? await api.sftp.remoteRead(hostId, filePath)
    : await api.sftp.localRead(filePath);

  if (!res || !res.ok) {
    showToast({
      type: 'error',
      title: 'Datei konnte nicht geöffnet werden',
      message: (res && res.errors && res.errors[0]) || 'Lesefehler'
    });
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--wide" style="max-width:860px" role="dialog" aria-modal="true">
      <div class="modal__header">
        <div>
          <div class="modal__eyebrow">${side === 'remote' ? 'REMOTE SFTP-DATEI' : 'LOKALE DATEI'} · ${escapeHtml(filePath)}</div>
          <h2 class="modal__title">${icon('file-text', 16)} ${escapeHtml(res.name || filePath)}</h2>
        </div>
        <button type="button" class="modal__close" data-close title="Schließen (ESC)">${icon('x', 16)}</button>
      </div>
      <div class="modal__body">
        <textarea class="input sftp-editor-textarea" id="sftp-editor-content" spellcheck="false">${escapeHtml(res.content || '')}</textarea>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn btn--ghost" data-close>Schließen</button>
        <button type="button" class="btn btn--primary" id="sftp-editor-save">
          ${icon('save', 14)}
          <span>Datei speichern</span>
        </button>
      </div>
    </div>
  `;

  document.getElementById('modal-root').appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKey);
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

  overlay.querySelector('#sftp-editor-save')?.addEventListener('click', async () => {
    const content = overlay.querySelector('#sftp-editor-content').value;
    const writeRes = side === 'remote'
      ? await api.sftp.remoteWrite(hostId, filePath, content)
      : await api.sftp.localWrite(filePath, content);

    if (writeRes && writeRes.ok) {
      close();
      showToast({ type: 'success', message: `Datei „${res.name || filePath}“ wurde gespeichert.` });
      const root = document.getElementById('view-sftp');
      if (side === 'remote' && sftpState.connectedHostId) {
        await connectToHost(sftpState.connectedHostId, sftpState.remotePath);
      } else {
        await loadLocalDirectory(sftpState.localPath);
        if (root) paint(root);
      }
    } else {
      showToast({
        type: 'error',
        message: (writeRes && writeRes.errors && writeRes.errors[0]) || 'Speichern fehlgeschlagen.'
      });
    }
  });
}
