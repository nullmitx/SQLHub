'use strict';

/**
 * SQL Hub – Single-File Addon-Manager (.js).
 *
 * Jedes Addon besteht aus einer EINZIGEN JavaScript-Datei (z. B. `meinaddon.js`).
 * In dieser einen `.js`-Datei sind Metadaten (id, name, version, type, sidebar),
 * CSS-Design (`styles`), HTML-Oberfläche (`html`) und die JavaScript-Logik
 * (`mount(addonRoot, addonApi)`) komplett vereint.
 *
 * Wichtig:
 * - Alle Addons sind standardmäßig DEAKTIVIERT (`enabled: false`) und müssen vom
 *   Nutzer im Addons-Fenster manuell per Schalter aktiviert werden.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const EXPLICIT_WINDOWS_ADDONS_DIR = 'C:\\Users\\lucsc\\OneDrive\\Desktop\\SQLHubAddons';
const EXPLICIT_WINDOWS_MUSIC_ADDON_DIR = 'C:\\Users\\lucsc\\OneDrive\\Desktop\\MusikAddon';

const MEDIA_EXTENSIONS = new Set([
  '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.webm', '.mp4'
]);

function sanitizeAddonId(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/\.js$/i, '')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'custom-addon';
}

function resolvePrimaryAddonsDir(userDataDir) {
  if (process.platform === 'win32') {
    try {
      const parent = path.dirname(EXPLICIT_WINDOWS_ADDONS_DIR);
      if (fs.existsSync(parent)) {
        fs.mkdirSync(EXPLICIT_WINDOWS_ADDONS_DIR, { recursive: true });
        return EXPLICIT_WINDOWS_ADDONS_DIR;
      }
    } catch {
      /* fallback below */
    }
  }
  const desktopDir = path.join(os.homedir(), 'Desktop');
  if (fs.existsSync(desktopDir)) {
    const candidate = path.join(desktopDir, 'SQLHubAddons');
    try {
      fs.mkdirSync(candidate, { recursive: true });
      return candidate;
    } catch {
      /* fallback below */
    }
  }
  const fallback = path.join(userDataDir || os.tmpdir(), 'SQLHubAddons');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

/* ============================================================================
 * AUSFÜHRLICHE ENTWICKLER-ANLEITUNG (1-DATEI-SYSTEM: meinaddon.js)
 * ========================================================================== */

const GUIDE_MARKDOWN = `# SQL Hub – Offizielles Handbuch zur Addon-Entwicklung (1-Datei-System \`meinaddon.js\`)

Mit dem **SQL Hub Single-File Addon-System (ab v2.4.4)** brauchst du **keine 3 oder 4 einzelnen Dateien** mehr!
Ein komplettes Addon – egal ob **Design-Theme**, **Sidebar-Werkzeug unter SFTP** oder ein ausgewachsener **Musik-, Radio-, YouTube- & Spotify-Player** – besteht aus **einer einzigen JavaScript-Datei**, z. B. **\`meinaddon.js\`**.

---

## 1. Wie erstelle und installiere ich ein Addon? (In 3 Schritten)

1. **Datei in VS Code erstellen**:
   Öffne Visual Studio Code (oder einen beliebigen Texteditor) und erstelle **eine einzige Datei**, z. B. \`meinaddon.js\`.
2. **Code einfügen & speichern**:
   Schreibe dein Addon als \`export default { ... }\` (siehe Vorlagen unten) in \`meinaddon.js\` und speichere die Datei.
3. **In SQL Hub auswählen & aktivieren**:
   - Öffne **SQL Hub** und klicke links unten (über \`Tresor\`) auf **\`Addons\`**.
   - Klicke oben auf **\`+ Addon hinzufügen (.js wählen)\`** und wähle deine Datei \`meinaddon.js\` aus.
   - Das Addon wird sofort installiert. Da alle Addons aus Sicherheitsgründen **standardmäßig deaktiviert** sind, schaltest du es einfach rechts auf der Karte per Schalter ein!

---

## 2. Aufbau einer \`meinaddon.js\` Datei

Alles (Metadaten, CSS-Styles, HTML-Ansicht und JavaScript-Logik) steht übersichtlich in **einer einzigen \`.js\`-Datei**:

\`\`\`javascript
// meinaddon.js – Komplettes SQL Hub Addon in einer einzigen Datei!

export default {
  // 1. PFLICHTFELDER & METADATEN
  id: 'mein-server-tool',
  name: 'Mein Server-Werkzeug',
  version: '1.0.0',
  author: 'Dein Name',
  description: 'Fügt unter SFTP ein eigenes Werkzeug mit Speicher-Funktion hinzu.',
  type: 'tool', // 'tool' (Sidebar-Icon unter SFTP), 'theme' (Design) oder 'hybrid' (beides)

  // 2. SIDEBAR-KONFIGURATION (erscheint bei Aktivierung direkt unter SFTP)
  sidebar: {
    label: 'Mein Tool',                        // Kurzer Text unter dem Sidebar-Icon
    title: 'Mein Server-Werkzeug',             // Große Überschrift im Fenster
    subtitle: 'Geladen aus einer einzigen .js-Datei',
    icon: 'terminal',                          // 'music', 'file-text', 'terminal', 'gamepad-2', 'sparkles', 'wrench', 'bot'
    keepAlive: false                           // true = läuft im Hintergrund weiter (perfekt für Musik/Streams!)
  },

  // 3. EIGENES CSS-DESIGN (optional)
  styles: \`
    .mein-addon-card {
      padding: 18px;
      background: var(--surface);
      border: 1px solid var(--border-strong);
      border-left: 3px solid var(--primary);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  \`,

  // 4. EIGENE HTML-OBERFLÄCHE (für type: 'tool' oder 'hybrid')
  html: \`
    <div class="mein-addon-card">
      <h2>Willkommen in meinem eigenen Addon!</h2>
      <p class="muted">Dieser Bereich kommt komplett aus einer einzigen Datei (meinaddon.js).</p>
      <textarea id="my-note" class="input" rows="6" placeholder="Schreibe hier etwas hinein ..."></textarea>
      <div>
        <button type="button" class="btn btn--primary" id="my-save-btn">Speichern</button>
      </div>
    </div>
  \`,

  // 5. JAVASCRIPT-LOGIK (wird beim Öffnen des Addons ausgeführt)
  async mount(addonRoot, addonApi) {
    const input = addonRoot.querySelector('#my-note');
    const saveBtn = addonRoot.querySelector('#my-save-btn');

    // Gespeicherte Daten beim Start laden
    const saved = await addonApi.getStorage();
    if (input && saved.text) {
      input.value = saved.text;
    }

    // Beim Klick dauerhaft speichern & Toast-Meldung anzeigen
    saveBtn?.addEventListener('click', async () => {
      await addonApi.setStorage({ text: input ? input.value : '' });
      addonApi.toast('Erfolgreich gespeichert!', 'success');
    });
  }
};
\`\`\`

---

## 3. Die \`addonApi\`-Schnittstelle (Alle Befehle in \`mount(addonRoot, addonApi)\`)

In der Funktion \`async mount(addonRoot, addonApi)\` stehen dir folgende Helfer zur Verfügung:

| Methode / Eigenschaft | Beschreibung |
| :--- | :--- |
| \`addonRoot\` | Das DOM-Element deines Addon-Fensters (\`addonRoot.querySelector('#...')\`). |
| \`await addonApi.getStorage()\` | Lädt das dauerhaft gespeicherte JSON-Objekt deines Addons. |
| \`await addonApi.setStorage(obj)\` | Speichert beliebige Daten (Notizen, Playlists, Einstellungen) dauerhaft auf der Festplatte. |
| \`await addonApi.pickMediaFiles()\` | Öffnet den Dateidialog für lokale Audio-/Videodateien (\`.mp3\`, \`.wav\`, \`.flac\`, \`.ogg\`, \`.mp4\`) und liefert \`[{ name, path, fileUrl, size }]\`. |
| \`await addonApi.pickMediaFolder()\` | Öffnet einen Ordnerdialog und liest alle enthaltenen Musik-/Videodateien auf einmal ein. |
| \`addonApi.setMiniPlayer({ active, title, subtitle, playing, onToggle, onNext })\` | Blendet unten rechts den schwebenden **Mini-Player** ein, wenn der Nutzer auf eine andere Seite wechselt. |
| \`await addonApi.copyClipboard(text)\` | Kopiert Text (z. B. ein SQL-Snippet) in die Zwischenablage. |
| \`await addonApi.getProfiles()\` | Gibt die Liste aller gespeicherten Datenbank-Instanzen zurück. |
| \`addonApi.navigate(viewName)\` | Wechselt zu einer anderen Ansicht (\`'dashboard'\`, \`'profiles'\`, \`'sftp'\`, \`'addons'\`). |
| \`addonApi.toast(msg, type, title)\` | Zeigt eine Benachrichtigung an (\`type\`: \`'info'\`, \`'success'\`, \`'warning'\`, \`'error'\`). |

---

## 4. Beispiel 2: Reines Design- / Theme-Addon in einer Datei (\`mein-theme.js\`)

Wenn du nur die Farben, Hintergründe oder Buttons von SQL Hub verändern möchtest, reicht schon eine kurze \`.js\`-Datei:

\`\`\`javascript
// mein-theme.js – Smaragdgrünes Cyber-Theme in einer einzigen Datei
export default {
  id: 'emerald-matrix-theme',
  name: 'Emerald Pixel Theme',
  version: '1.1.0',
  author: 'SQL Hub Studio',
  description: 'Verwandelt SQL Hub in ein smaragdgrünes Matrix-/Cyber-Launcher-Design.',
  type: 'theme',
  styles: \`
    :root {
      --primary: #10b981 !important;
      --primary-hover: #059669 !important;
      --primary-soft: rgba(16, 185, 129, 0.16) !important;
      --accent: #06b6d4 !important;
    }
  \`
};
\`\`\`

---

## 5. Beispiel 3: Musik-, Radio- & YouTube-Player Addon (\`musik-player-addon.js\`)

Im Ordner \`SQLHubAddons\` liegt die Datei **\`musik-player-addon.js\`** als vollständiges Referenz-Beispiel in einer einzigen Datei:
- **Spotify-Stil Audio-Deck** mit Live-Internet-Radio, Offline-WebAudio-Synthesizer und lokalem MP3/WAV/FLAC-Import
- **YouTube & Spotify Player** (inkl. Umschalter zwischen *Kompakt-Embed*, *YouTube Voll-Player für VEVO/Radio-Mixe* und *YouTube Music*)
- **Hintergrund-Wiedergabe (\`keepAlive: true\`)** + schwebender Mini-Player beim Wechseln auf andere SQL Hub Seiten.
`;

/* ============================================================================
 * FERTIGE SINGLE-FILE (.js) BEISPIEL-ADDONS
 * ========================================================================== */

const EMERALD_THEME_SINGLE_JS = `// emerald-pixel-theme.js – Komplettes Design-Theme in einer einzigen .js-Datei!
// In SQL Hub unter „Addons" -> „+ Addon hinzufügen (.js wählen)" auswählen und per Schalter aktivieren.

export default {
  id: 'emerald-matrix-theme',
  name: 'Emerald Pixel Theme',
  version: '1.2.0',
  author: 'SQL Hub Studio',
  description: 'Verwandelt die Oberfläche von SQL Hub in ein smaragdgrünes Matrix-/Cyber-Launcher-Design mit passenden Akzenten, Buttons und Hero-Banner (Single-File .js Addon).',
  type: 'theme',
  permissions: ['theme-css'],
  styles: \`
    :root {
      --primary: #10b981 !important;
      --primary-hover: #059669 !important;
      --primary-soft: rgba(16, 185, 129, 0.16) !important;
      --accent: #06b6d4 !important;
    }

    .launcher-hero {
      background:
        radial-gradient(circle at 50% 25%, rgba(16, 185, 129, 0.28) 0%, rgba(6, 78, 59, 0.22) 48%, rgba(11, 13, 18, 0.96) 100%),
        linear-gradient(180deg, #0b2922 0%, #091318 68%, #0b0d12 100%) !important;
    }
  \`
};
`;

const NOTES_SINGLE_JS = `// notizen-snippets-addon.js – Notizen & SQL-Snippets Werkzeug in einer einzigen .js-Datei!
// In SQL Hub unter „Addons" -> „+ Addon hinzufügen (.js wählen)" auswählen und per Schalter aktivieren.

export default {
  id: 'sqlhub-notes',
  name: 'Notizen & SQL-Snippets',
  version: '1.4.0',
  author: 'SQL Hub Team',
  description: 'Fügt unter SFTP einen eigenen Bereich „Notizen" hinzu, in dem du Server-Notizen, Zugangs-Hinweise, To-Dos und häufig genutzte SQL-Abfragen speichern, durchsuchen und mit einem Klick kopieren kannst.',
  type: 'tool',
  permissions: ['sidebar', 'storage', 'clipboard'],
  sidebar: {
    label: 'Notizen',
    title: 'Notizen & SQL-Snippets',
    subtitle: 'Persönliches Scratchpad für Datenbank-Abfragen, Server-Doku & Aufgaben (Single-File .js Addon)',
    icon: 'file-text',
    template: 'notes'
  },
  styles: \`
    .notes-pin-badge {
      color: var(--primary);
    }
  \`
};
`;

const STARTER_EXAMPLE_SINGLE_JS = `// beispiel-eigenes-addon.js – Vorlage für dein eigenes 1-Datei-Addon in VS Code!
// Bearbeite diese Datei nach Belieben und wähle sie in SQL Hub unter „Addons" -> „+ Addon hinzufügen (.js wählen)" aus.

export default {
  id: 'mein-starter-addon',
  name: 'Server Quick-Check & Ping Tool',
  version: '1.0.0',
  author: 'Dein Name',
  description: 'Beispiel-Addon in einer einzigen .js-Datei: Zeigt deine gespeicherten Datenbank-Instanzen und ein schnelles Server-Scratchpad direkt unter SFTP an.',
  type: 'tool',
  permissions: ['sidebar', 'storage', 'clipboard'],

  sidebar: {
    label: 'QuickTool',
    title: 'Server Quick-Check & Scratchpad',
    subtitle: 'Beispiel-Addon aus einer einzigen Datei (beispiel-eigenes-addon.js)',
    icon: 'terminal',
    keepAlive: false
  },

  styles: \`
    .quicktool-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    @media (max-width: 900px) {
      .quicktool-grid { grid-template-columns: 1fr; }
    }
    .quicktool-box {
      padding: 16px;
      background: var(--surface);
      border: 1px solid var(--border-strong);
      border-top: 2px solid var(--primary);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .quicktool-inst-item {
      padding: 8px 10px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: var(--font-mono);
      font-size: 12px;
    }
  \`,

  html: \`
    <div class="page-head">
      <div class="page-head__titles">
        <div class="page-eyebrow">SINGLE-FILE .JS ADDON VORLAGE</div>
        <h1 class="page-title">Server Quick-Check &amp; Scratchpad</h1>
        <p class="page-sub">Komplett geladen aus einer einzigen Datei: <code>beispiel-eigenes-addon.js</code></p>
      </div>
    </div>

    <div class="quicktool-grid">
      <div class="quicktool-box">
        <h3 style="margin:0;">Gespeicherte Datenbank-Instanzen</h3>
        <p class="muted" style="margin:0;font-size:12px;">Direkt über <code>addonApi.getProfiles()</code> geladen:</p>
        <div id="qt-profiles-list" style="display:flex;flex-direction:column;gap:6px;"></div>
      </div>

      <div class="quicktool-box">
        <h3 style="margin:0;">Schnelle Server-Notiz (Persistent)</h3>
        <textarea id="qt-memo" class="input" rows="6" placeholder="Schreibe hier deine Befehle oder Notizen hinein ..."></textarea>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn--primary" id="qt-save">Notiz speichern</button>
          <button type="button" class="btn btn--ghost" id="qt-copy">In Zwischenablage kopieren</button>
        </div>
      </div>
    </div>
  \`,

  async mount(addonRoot, addonApi) {
    const listEl = addonRoot.querySelector('#qt-profiles-list');
    const memoEl = addonRoot.querySelector('#qt-memo');

    // 1. Gespeicherte Notiz laden
    const stored = await addonApi.getStorage();
    if (memoEl && stored.memo) {
      memoEl.value = stored.memo;
    }

    // 2. Datenbank-Profile laden
    const profiles = await addonApi.getProfiles();
    if (listEl) {
      if (!profiles.length) {
        listEl.innerHTML = '<div class="muted">Noch keine Datenbank-Instanzen angelegt.</div>';
      } else {
        listEl.innerHTML = profiles.map((p) => \`
          <div class="quicktool-inst-item">
            <strong>\${p.name}</strong>
            <span class="muted">\${p.url}</span>
          </div>
        \`).join('');
      }
    }

    // 3. Events
    addonRoot.querySelector('#qt-save')?.addEventListener('click', async () => {
      await addonApi.setStorage({ memo: memoEl ? memoEl.value : '' });
      addonApi.toast('Notiz im Addon-Speicher gesichert!', 'success');
    });

    addonRoot.querySelector('#qt-copy')?.addEventListener('click', async () => {
      await addonApi.copyClipboard(memoEl ? memoEl.value : '');
      addonApi.toast('In die Zwischenablage kopiert!', 'info');
    });
  }
};
`;

const MUSIC_ADDON_SINGLE_JS = `// musik-player-addon.js – Kompletter SQL Hub Musik-, Radio-, Spotify- & YouTube-Player in EINER EINZIGEN .js-Datei!
// Einfach in SQL Hub unter „Addons" -> „+ Addon hinzufügen (.js wählen)" auswählen und per Schalter aktivieren.

export default {
  id: 'sqlhub-music-player',
  name: 'SQL Hub Musik & Stream Player',
  version: '1.6.0',
  author: 'SQL Hub Studio',
  description: 'Vollwertiger Musik-, Radio-, Spotify- & YouTube-Player in einer einzigen .js-Datei! Unterstützt lokale MP3/WAV/FLAC/MP4-Dateien, Live-Coding-Radio, 28-Band Audio-Visualizer, YouTube Voll-Player & Hintergrund-Wiedergabe.',
  type: 'tool',
  permissions: [
    'sidebar',
    'audio-video',
    'local-media',
    'external-embeds',
    'storage',
    'keep-alive'
  ],
  sidebar: {
    label: 'Musik',
    title: 'Musik & Stream Player',
    subtitle: 'Spotify-Deck, Live-Radio, lokale MP3s & YouTube/Video-Streaming im Hintergrund (1-Datei .js Addon)',
    icon: 'music',
    template: 'custom',
    keepAlive: true
  },

  styles: \`
    .music-studio {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .music-mode-tabs {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--surface);
      border: 1px solid var(--border-strong);
      padding: 4px;
      border-radius: 2px;
    }
    .music-mode-tab {
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 11.5px;
      font-weight: 700;
      padding: 6px 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 1px;
    }
    .music-mode-tab.is-active {
      background: var(--primary);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.2);
    }
    .music-deck-grid {
      display: grid;
      grid-template-columns: 370px minmax(0, 1fr);
      gap: 14px;
      align-items: stretch;
    }
    @media (max-width: 980px) {
      .music-deck-grid { grid-template-columns: 1fr; }
    }
    .music-now-card,
    .music-playlist-card,
    .music-yt-stage {
      background: var(--surface);
      border: 1px solid var(--border-strong);
      border-radius: 2px;
      padding: 16px;
      box-shadow: var(--specular);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .music-cover-box {
      position: relative;
      height: 175px;
      background:
        radial-gradient(circle at 50% 35%, rgba(229, 57, 53, 0.35), rgba(15, 19, 28, 0.96) 72%),
        #0a0d13;
      border: 1px solid var(--border-strong);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      overflow: hidden;
    }
    .music-live-pill {
      align-self: flex-start;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      padding: 2px 8px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid var(--border-strong);
      color: var(--success);
    }
    .music-visualizer-canvas {
      width: 100%;
      height: 68px;
      display: block;
    }
    .music-track-info { text-align: center; }
    .music-track-title {
      font-size: 15px;
      font-weight: 800;
      color: var(--text);
      margin: 0 0 3px;
    }
    .music-track-artist {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      margin: 0;
    }
    .music-progress-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .music-time-row {
      display: flex;
      justify-content: space-between;
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-dim);
    }
    .music-controls-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .music-play-circle {
      width: 44px;
      height: 44px;
      background: var(--primary);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #ffffff;
      font-weight: 800;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
    }
    .music-volume-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border);
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
    }
    .music-volume-row input[type="range"] {
      flex: 1;
      accent-color: var(--primary);
    }
    .music-playlist-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }
    .music-add-url-bar {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .music-track-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-height: 290px;
      overflow-y: auto;
    }
    .music-track-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 10px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      cursor: pointer;
    }
    .music-track-row.is-playing {
      border-color: var(--primary);
      background: var(--surface-2);
      box-shadow: inset 3px 0 0 var(--primary);
    }
    .music-track-row__meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .music-track-row__name {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .music-track-row__sub {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .music-yt-presets {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .music-yt-frame-wrap {
      width: 100%;
      height: 430px;
      background: #06080c;
      border: 1px solid var(--border-strong);
      position: relative;
    }
    .music-yt-frame-wrap iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
  \`,

  html: \`
    <div class="music-studio">
      <div class="page-head" style="margin-bottom:4px;">
        <div class="page-head__titles">
          <div class="page-eyebrow">SINGLE-FILE .JS ADDON · MULTIMEDIA &amp; CODING BEATS</div>
          <h1 class="page-title">SQL Hub Musik &amp; Stream Player</h1>
          <p class="page-sub">Höre lokale MP3s/FLACs, Live-Coding-Radio, Synthwave oder YouTube-/Spotify-Streams im Hintergrund</p>
        </div>
        <div class="page-head__actions" style="display:flex;gap:8px;flex-wrap:wrap;">
          <div class="music-mode-tabs">
            <button type="button" class="music-mode-tab is-active" data-music-tab="deck">♫ Audio-Deck &amp; Lokale MP3s</button>
            <button type="button" class="music-mode-tab" data-music-tab="embed">▶ YouTube / Spotify / Video</button>
          </div>
          <button type="button" class="btn btn--primary" id="music-pick-files">+ Lokale Musikdateien</button>
          <button type="button" class="btn btn--ghost" id="music-pick-folder">+ Musik-Ordner</button>
        </div>
      </div>

      <!-- TAB 1: AUDIO DECK -->
      <div id="music-pane-deck" class="music-deck-grid">
        <div class="music-now-card">
          <div class="music-cover-box">
            <span class="music-live-pill" id="music-status-badge">● BEREIT</span>
            <canvas class="music-visualizer-canvas" id="music-visualizer" width="320" height="68"></canvas>
          </div>

          <div class="music-track-info">
            <h3 class="music-track-title" id="music-now-title">Midnight SQL Lofi Synth</h3>
            <p class="music-track-artist" id="music-now-artist">SQL Hub Studio · Synth &amp; Stream Engine</p>
          </div>

          <div class="music-progress-wrap">
            <input type="range" id="music-seek" min="0" max="100" value="0" step="0.1" />
            <div class="music-time-row">
              <span id="music-time-cur">00:00</span>
              <span id="music-time-dur">LIVE / ENDLOS</span>
            </div>
          </div>

          <div class="music-controls-row">
            <button type="button" class="btn btn--sm btn--ghost" id="music-btn-shuffle">Shuffle</button>
            <button type="button" class="btn btn--sm btn--ghost" id="music-btn-prev">⏮</button>
            <button type="button" class="music-play-circle" id="music-btn-play">▶</button>
            <button type="button" class="btn btn--sm btn--ghost" id="music-btn-next">⏭</button>
            <button type="button" class="btn btn--sm btn--ghost" id="music-btn-repeat">Repeat</button>
          </div>

          <div class="music-volume-row">
            <span>LAUTSTÄRKE</span>
            <input type="range" id="music-volume" min="0" max="100" value="75" />
            <span id="music-volume-label">75%</span>
          </div>

          <audio id="music-audio-el" crossorigin="anonymous" preload="none" hidden></audio>
        </div>

        <div class="music-playlist-card">
          <div class="music-playlist-head">
            <div>
              <strong style="font-size:13px;">PLAYLIST, RADIO-STREAMS &amp; LOKALE TRACKS</strong>
              <div style="font-size:11px;color:var(--text-dim);font-family:var(--font-mono);" id="music-playlist-count">0 Titel</div>
            </div>
            <button type="button" class="btn btn--xs btn--ghost" id="music-restore-defaults">Standard-Streams laden</button>
          </div>

          <form class="music-add-url-bar" id="music-add-stream-form">
            <input type="text" class="input" id="music-stream-title" placeholder="Titel (z. B. Mein Lofi Radio)" style="width:175px;" />
            <input type="text" class="input" id="music-stream-url" placeholder="Direkte MP3- / Stream- / Datei-URL (https://... oder file://...)" style="flex:1;min-width:180px;" />
            <button type="submit" class="btn btn--sm btn--primary">+ Hinzufügen</button>
          </form>

          <div class="music-track-list" id="music-track-list"></div>
        </div>
      </div>

      <!-- TAB 2: YOUTUBE / SPOTIFY / VIDEO STREAM -->
      <div id="music-pane-embed" class="music-yt-stage" hidden>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <strong style="font-size:13.5px;">YOUTUBE, SPOTIFY &amp; DIREKT-VIDEO PLAYER</strong>
            <div style="font-size:11.5px;color:var(--text-muted);">Füge einen YouTube-Link (auch Radio-Mixe &amp; VEVO), eine Video-ID oder einen Spotify-Link ein</div>
          </div>
          <div class="music-yt-presets">
            <button type="button" class="btn btn--xs btn--subtle" data-yt-preset="https://www.youtube.com/watch?v=jfKfPfyJRdk">Lofi Girl 24/7</button>
            <button type="button" class="btn btn--xs btn--subtle" data-yt-preset="https://www.youtube.com/watch?v=4xDzrJKXOOY">Synthwave Radio</button>
            <button type="button" class="btn btn--xs btn--subtle" data-yt-preset="https://www.youtube.com/watch?v=5yx6BWlEVcY">Chillhop Beats</button>
            <button type="button" class="btn btn--xs btn--subtle" data-yt-preset="https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn?utm_source=generator&theme=0">Spotify Lofi</button>
          </div>
        </div>

        <form id="music-yt-form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input type="text" class="input" id="music-yt-input" style="flex:1;min-width:240px;" placeholder="https://www.youtube.com/watch?v=... oder https://open.spotify.com/playlist/..." />
          <select class="input" id="music-yt-mode" style="width:225px;font-family:var(--font-mono);font-size:11.5px;">
            <option value="watch">YouTube Voll-Player (Alle Songs &amp; Mixe)</option>
            <option value="embed">Kompakt Embed-Player</option>
            <option value="ytmusic">YouTube Music Player</option>
          </select>
          <button type="submit" class="btn btn--primary">Stream im Player starten</button>
        </form>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--text-dim);">
          <span>Der <strong>YouTube Voll-Player</strong> spielt auch geschützte VEVO-Musikvideos und Radio-Mixe (<code>&amp;list=RD...</code>) ohne Fehler 153 direkt ab.</span>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn--xs btn--ghost" id="music-yt-switch-watch">Voll-Player (VEVO / Mix)</button>
            <button type="button" class="btn btn--xs btn--ghost" id="music-yt-switch-embed">Kompakt-Embed</button>
            <button type="button" class="btn btn--xs btn--ghost" id="music-yt-switch-ytmusic">YouTube Music</button>
          </div>
        </div>

        <div class="music-yt-frame-wrap" id="music-yt-container">
          <iframe
            id="music-yt-iframe"
            src="about:blank"
            data-default-src="https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1&rel=0&playsinline=1"
            referrerpolicy="strict-origin-when-cross-origin"
            title="SQL Hub Stream Player"
            allowfullscreen>
          </iframe>
        </div>
      </div>
    </div>
  \`,

  async mount(addonRoot, addonApi) {
    const DEFAULT_TRACKS = [
      {
        id: 'synth-lofi-1',
        title: 'Midnight SQL Lofi Synth (Offline Engine)',
        artist: 'SQL Hub WebAudio Synth · Endlos-Beat',
        kind: 'synth',
        preset: 'lofi'
      },
      {
        id: 'synth-cyber-2',
        title: 'Neon Database Pulse (Cyberpunk Arpeggio)',
        artist: 'SQL Hub WebAudio Synth · 110 BPM',
        kind: 'synth',
        preset: 'cyber'
      },
      {
        id: 'radio-nightride',
        title: 'Nightride FM – Chillsynth & Coding Stream',
        artist: 'Live Internet Radio (MP3 Stream)',
        kind: 'stream',
        url: 'https://stream.nightride.fm/chillsynth.mp3'
      },
      {
        id: 'radio-soma-groovesalad',
        title: 'SomaFM Groove Salad – Ambient Beats',
        artist: 'Live Internet Radio · 128k MP3',
        kind: 'stream',
        url: 'https://ice2.somafm.com/groovesalad-128-mp3'
      }
    ];

    const audioEl = addonRoot.querySelector('#music-audio-el');
    const playBtn = addonRoot.querySelector('#music-btn-play');
    const prevBtn = addonRoot.querySelector('#music-btn-prev');
    const nextBtn = addonRoot.querySelector('#music-btn-next');
    const shuffleBtn = addonRoot.querySelector('#music-btn-shuffle');
    const repeatBtn = addonRoot.querySelector('#music-btn-repeat');
    const seekEl = addonRoot.querySelector('#music-seek');
    const volEl = addonRoot.querySelector('#music-volume');
    const volLabel = addonRoot.querySelector('#music-volume-label');
    const curTimeEl = addonRoot.querySelector('#music-time-cur');
    const durTimeEl = addonRoot.querySelector('#music-time-dur');
    const titleEl = addonRoot.querySelector('#music-now-title');
    const artistEl = addonRoot.querySelector('#music-now-artist');
    const badgeEl = addonRoot.querySelector('#music-status-badge');
    const listEl = addonRoot.querySelector('#music-track-list');
    const countEl = addonRoot.querySelector('#music-playlist-count');
    const canvas = addonRoot.querySelector('#music-visualizer');
    const ctx = canvas ? canvas.getContext('2d') : null;

    let tracks = [...DEFAULT_TRACKS];
    let currentIndex = 0;
    let isPlaying = false;
    let shuffle = false;
    let repeat = false;
    let synthTimer = null;
    let audioCtx = null;

    try {
      const saved = await addonApi.getStorage();
      if (saved && Array.isArray(saved.tracks) && saved.tracks.length > 0) {
        tracks = saved.tracks;
      }
      if (saved && typeof saved.volume === 'number' && volEl) {
        volEl.value = String(saved.volume);
        if (volLabel) volLabel.textContent = saved.volume + '%';
        if (audioEl) audioEl.volume = saved.volume / 100;
      } else if (audioEl) {
        audioEl.volume = 0.75;
      }
    } catch { /* ignore */ }

    async function persistState() {
      try {
        await addonApi.setStorage({
          tracks,
          volume: volEl ? Number(volEl.value) : 75
        });
      } catch { /* ignore */ }
    }

    function stopSynth() {
      if (synthTimer) {
        clearInterval(synthTimer);
        synthTimer = null;
      }
    }

    function startSynthEngine(preset) {
      stopSynth();
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const scale = preset === 'cyber'
          ? [110, 130.81, 146.83, 164.81, 196, 220, 261.63]
          : [130.81, 164.81, 196.0, 246.94, 261.63, 329.63];
        let step = 0;
        synthTimer = setInterval(() => {
          if (!isPlaying) return;
          const now = audioCtx.currentTime;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = preset === 'cyber' ? 'sawtooth' : 'triangle';
          const freq = scale[step % scale.length];
          step += shuffle ? Math.floor(Math.random() * 3) + 1 : 1;
          osc.frequency.setValueAtTime(freq, now);
          const vol = (volEl ? Number(volEl.value) / 100 : 0.75) * 0.14;
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.exponentialRampToValueAtTime(Math.max(0.005, vol), now + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.44);
        }, preset === 'cyber' ? 260 : 420);
      } catch { /* ignore */ }
    }

    function syncMiniPlayer() {
      const current = tracks[currentIndex];
      if (!current) return;
      addonApi.setMiniPlayer({
        active: isPlaying,
        title: current.title,
        subtitle: current.artist,
        playing: isPlaying,
        onToggle: () => togglePlay(),
        onNext: () => playNext()
      });
    }

    function renderPlaylist() {
      if (!listEl) return;
      if (countEl) countEl.textContent = tracks.length + ' Titel in deiner Bibliothek';
      listEl.innerHTML = tracks.map((t, idx) => \`
        <div class="music-track-row \${idx === currentIndex ? 'is-playing' : ''}" data-track-idx="\${idx}">
          <div class="music-track-row__meta">
            <div class="music-track-row__name">\${idx === currentIndex && isPlaying ? '▶ ' : ''}\${t.title}</div>
            <div class="music-track-row__sub">\${t.artist}</div>
          </div>
          <button type="button" class="btn btn--xs btn--ghost" data-del-idx="\${idx}" title="Aus Playlist entfernen">✕</button>
        </div>
      \`).join('');

      listEl.querySelectorAll('[data-track-idx]').forEach((row) => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('[data-del-idx]')) return;
          const idx = Number(row.getAttribute('data-track-idx'));
          startTrack(idx, true);
        });
      });

      listEl.querySelectorAll('[data-del-idx]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const idx = Number(btn.getAttribute('data-del-idx'));
          tracks.splice(idx, 1);
          if (currentIndex >= tracks.length) currentIndex = Math.max(0, tracks.length - 1);
          await persistState();
          renderPlaylist();
        });
      });
    }

    async function startTrack(index, autoPlay = true) {
      if (!tracks.length) return;
      currentIndex = ((index % tracks.length) + tracks.length) % tracks.length;
      const track = tracks[currentIndex];
      if (titleEl) titleEl.textContent = track.title;
      if (artistEl) artistEl.textContent = track.artist;
      stopSynth();
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
      }

      if (!autoPlay) {
        isPlaying = false;
        if (playBtn) playBtn.textContent = '▶';
        if (badgeEl) badgeEl.textContent = '● BEREIT';
        renderPlaylist();
        syncMiniPlayer();
        return;
      }

      isPlaying = true;
      if (playBtn) playBtn.textContent = '⏸';
      if (badgeEl) badgeEl.textContent = '● SPIELT AB';

      if (track.kind === 'synth') {
        if (durTimeEl) durTimeEl.textContent = 'SYNTH LIVE';
        startSynthEngine(track.preset || 'lofi');
      } else if (audioEl && track.url) {
        audioEl.src = track.url;
        try {
          await audioEl.play();
        } catch {
          addonApi.toast('Stream wird geladen …', 'info');
        }
      }
      renderPlaylist();
      syncMiniPlayer();
    }

    function togglePlay() {
      if (!tracks.length) return;
      if (isPlaying) {
        isPlaying = false;
        stopSynth();
        if (audioEl) audioEl.pause();
        if (playBtn) playBtn.textContent = '▶';
        if (badgeEl) badgeEl.textContent = '● PAUSIERT';
        renderPlaylist();
        syncMiniPlayer();
      } else {
        startTrack(currentIndex, true);
      }
    }

    function playNext() {
      if (!tracks.length) return;
      const nextIdx = shuffle ? Math.floor(Math.random() * tracks.length) : (currentIndex + 1) % tracks.length;
      startTrack(nextIdx, true);
    }

    function playPrev() {
      if (!tracks.length) return;
      startTrack((currentIndex - 1 + tracks.length) % tracks.length, true);
    }

    playBtn?.addEventListener('click', togglePlay);
    nextBtn?.addEventListener('click', playNext);
    prevBtn?.addEventListener('click', playPrev);
    shuffleBtn?.addEventListener('click', () => {
      shuffle = !shuffle;
      shuffleBtn.classList.toggle('btn--primary', shuffle);
    });
    repeatBtn?.addEventListener('click', () => {
      repeat = !repeat;
      repeatBtn.classList.toggle('btn--primary', repeat);
    });

    volEl?.addEventListener('input', () => {
      const v = Number(volEl.value);
      if (volLabel) volLabel.textContent = v + '%';
      if (audioEl) audioEl.volume = v / 100;
      persistState();
    });

    addonRoot.querySelector('#music-pick-files')?.addEventListener('click', async () => {
      const files = await addonApi.pickMediaFiles();
      if (!files || !files.length) return;
      for (const f of files) {
        tracks.push({
          id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          title: f.name.replace(/\\.[^.]+$/, ''),
          artist: f.path,
          kind: 'local',
          url: f.fileUrl
        });
      }
      await persistState();
      renderPlaylist();
      startTrack(tracks.length - files.length, true);
      addonApi.toast(files.length + ' Musikdatei(en) hinzugefügt!', 'success');
    });

    addonRoot.querySelector('#music-pick-folder')?.addEventListener('click', async () => {
      const res = await addonApi.pickMediaFolder();
      if (!res || !res.tracks || !res.tracks.length) return;
      for (const f of res.tracks) {
        tracks.push({
          id: 'folder-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          title: f.name.replace(/\\.[^.]+$/, ''),
          artist: res.folderPath,
          kind: 'local',
          url: f.fileUrl
        });
      }
      await persistState();
      renderPlaylist();
      startTrack(tracks.length - res.tracks.length, true);
      addonApi.toast(res.tracks.length + ' Titel aus Ordner importiert!', 'success');
    });

    addonRoot.querySelector('#music-restore-defaults')?.addEventListener('click', async () => {
      tracks = [...DEFAULT_TRACKS];
      currentIndex = 0;
      await persistState();
      renderPlaylist();
      addonApi.toast('Standard-Streams geladen.', 'info');
    });

    addonRoot.querySelector('#music-add-stream-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tInp = addonRoot.querySelector('#music-stream-title');
      const uInp = addonRoot.querySelector('#music-stream-url');
      const rawUrl = (uInp?.value || '').trim();
      if (!rawUrl) return;
      tracks.push({
        id: 'custom-' + Date.now(),
        title: (tInp?.value || '').trim() || 'Eigener Stream',
        artist: rawUrl,
        kind: 'stream',
        url: rawUrl
      });
      if (tInp) tInp.value = '';
      if (uInp) uInp.value = '';
      await persistState();
      renderPlaylist();
      startTrack(tracks.length - 1, true);
    });

    // Tab-Wechsel
    const tabBtns = addonRoot.querySelectorAll('[data-music-tab]');
    const paneDeck = addonRoot.querySelector('#music-pane-deck');
    const paneEmbed = addonRoot.querySelector('#music-pane-embed');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-music-tab');
        tabBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
        if (paneDeck) paneDeck.hidden = target !== 'deck';
        if (paneEmbed) paneEmbed.hidden = target !== 'embed';
        if (target === 'embed') {
          const frame = addonRoot.querySelector('#music-yt-iframe');
          if (frame && (!frame.src || frame.src === 'about:blank')) {
            frame.src = frame.getAttribute('data-default-src') || 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1&rel=0&playsinline=1';
          }
        }
      });
    });

    // YouTube / Spotify URL Parser (inkl. Voll-Player gegen VEVO/Mix-Sperren & Fehler 153)
    function extractYouTubeInfo(rawInput) {
      const val = String(rawInput || '').trim();
      if (!val) return null;
      if (/^[A-Za-z0-9_-]{11}$/.test(val)) {
        return { videoId: val, listId: '', isRadioMix: false };
      }
      try {
        const u = new URL(val);
        const host = u.hostname.toLowerCase();
        if (host.includes('youtu.be')) {
          const id = u.pathname.replace(/^\\/+/, '').split('/')[0];
          const listId = u.searchParams.get('list') || '';
          if (id) return { videoId: id, listId, isRadioMix: listId.startsWith('RD') || u.searchParams.get('start_radio') === '1' };
        }
        if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
          const vParam = u.searchParams.get('v');
          const listId = u.searchParams.get('list') || '';
          const isRadioMix = listId.startsWith('RD') || u.searchParams.get('start_radio') === '1';
          if (vParam) return { videoId: vParam, listId, isRadioMix };
          const pathMatch = u.pathname.match(/\\/(?:embed|shorts|live|v)\\/([A-Za-z0-9_-]{11})/);
          if (pathMatch) return { videoId: pathMatch[1], listId, isRadioMix };
        }
      } catch { /* ignore */ }
      const ytMatch = val.match(/(?:v=|youtu\\.be\\/|\\/embed\\/|\\/shorts\\/)([A-Za-z0-9_-]{11})/);
      if (ytMatch) {
        return { videoId: ytMatch[1], listId: '', isRadioMix: val.includes('list=RD') || val.includes('start_radio=1') };
      }
      return null;
    }

    function toStreamUrl(rawInput, mode = 'watch') {
      const val = String(rawInput || '').trim();
      if (!val) return '';
      const spMatch = val.match(/open\\.spotify\\.com\\/(?:intl-[a-z]+\\/)?(track|playlist|album|episode)\\/([A-Za-z0-9]+)/);
      if (spMatch) {
        return 'https://open.spotify.com/embed/' + spMatch[1] + '/' + spMatch[2] + '?utm_source=generator&theme=0';
      }
      const yt = extractYouTubeInfo(val);
      if (yt && yt.videoId) {
        if (mode === 'watch') {
          const listQuery = yt.listId ? '&list=' + encodeURIComponent(yt.listId) : '';
          return 'https://www.youtube.com/watch?v=' + encodeURIComponent(yt.videoId) + listQuery;
        }
        if (mode === 'ytmusic') {
          const listQuery = yt.listId ? '&list=' + encodeURIComponent(yt.listId) : '';
          return 'https://music.youtube.com/watch?v=' + encodeURIComponent(yt.videoId) + listQuery;
        }
        const playlistParam = (yt.listId && !yt.isRadioMix) ? '&listType=playlist&list=' + encodeURIComponent(yt.listId) : '';
        return 'https://www.youtube.com/embed/' + encodeURIComponent(yt.videoId) + '?autoplay=1&rel=0&playsinline=1&enablejsapi=1' + playlistParam;
      }
      return val;
    }

    const ytIframe = addonRoot.querySelector('#music-yt-iframe');
    const ytInput = addonRoot.querySelector('#music-yt-input');
    const ytModeSel = addonRoot.querySelector('#music-yt-mode');

    function loadCurrentStream(overrideMode) {
      if (overrideMode && ytModeSel) ytModeSel.value = overrideMode;
      const mode = ytModeSel ? ytModeSel.value : 'watch';
      const raw = (ytInput && ytInput.value.trim()) || 'https://www.youtube.com/watch?v=jfKfPfyJRdk';
      const targetUrl = toStreamUrl(raw, mode);
      if (!targetUrl) return;
      if (ytIframe) ytIframe.src = targetUrl;
    }

    addonRoot.querySelectorAll('[data-yt-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-yt-preset');
        if (ytInput && url) ytInput.value = url;
        loadCurrentStream();
      });
    });

    addonRoot.querySelector('#music-yt-switch-watch')?.addEventListener('click', () => loadCurrentStream('watch'));
    addonRoot.querySelector('#music-yt-switch-embed')?.addEventListener('click', () => loadCurrentStream('embed'));
    addonRoot.querySelector('#music-yt-switch-ytmusic')?.addEventListener('click', () => loadCurrentStream('ytmusic'));
    ytModeSel?.addEventListener('change', () => {
      if (ytInput && ytInput.value.trim()) loadCurrentStream();
    });

    addonRoot.querySelector('#music-yt-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      loadCurrentStream();
      addonApi.toast('Stream im Player gestartet!', 'success');
    });

    // Visualizer
    let phase = 0;
    function drawVisualizer() {
      if (ctx && canvas) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const bars = 28;
        const barW = Math.floor((w - (bars - 1) * 3) / bars);
        phase += isPlaying ? 0.14 : 0.02;
        for (let i = 0; i < bars; i++) {
          const ratio = isPlaying
            ? 0.2 + 0.75 * Math.abs(Math.sin(phase + i * 0.35) * Math.cos(phase * 0.6 - i * 0.2))
            : 0.08;
          const barH = Math.max(4, Math.round(ratio * (h - 6)));
          ctx.fillStyle = isPlaying ? '#e53935' : '#334155';
          ctx.fillRect(i * (barW + 3), h - barH, barW, barH);
        }
      }
      requestAnimationFrame(drawVisualizer);
    }
    requestAnimationFrame(drawVisualizer);

    renderPlaylist();
    startTrack(0, false);
  }
};
`;

function writeMusicAddonFiles(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  // Entferne alte Mehrdateien-Struktur, falls noch vorhanden
  for (const oldFile of ['manifest.json', 'styles.css', 'view.html', 'script.js']) {
    const p = path.join(targetDir, oldFile);
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
  }
  fs.writeFileSync(path.join(targetDir, 'musik-player-addon.js'), MUSIC_ADDON_SINGLE_JS, 'utf8');
}

/**
 * Parst eine einzelne `.js`-Addon-Datei sicher und extrahiert das exportierte Objekt
 * (`id`, `name`, `version`, `author`, `description`, `type`, `sidebar`, `styles`, `html`).
 */
function parseSingleJsAddonFile(jsFilePath) {
  if (!jsFilePath || !fs.existsSync(jsFilePath)) return null;
  const rawCode = fs.readFileSync(jsFilePath, 'utf8');
  const transformed = rawCode
    .replace(/^\s*export\s+default\s+/m, 'module.exports = ')
    .replace(/^\s*export\s+const\s+addon\s*=/m, 'module.exports =');

  const sandbox = {
    module: { exports: {} },
    exports: {},
    window: {},
    registerAddon(def) {
      sandbox.module.exports = def;
      return def;
    },
    console: { log() {}, warn() {}, error() {} }
  };
  sandbox.exports = sandbox.module.exports;

  try {
    vm.runInNewContext(transformed, sandbox, { timeout: 1000, filename: path.basename(jsFilePath) });
  } catch {
    return null;
  }

  const def = sandbox.module.exports;
  if (!def || typeof def !== 'object') return null;
  return { def, rawCode };
}

class AddonManager {
  constructor({ userDataDir = os.tmpdir(), stateFile, logger } = {}) {
    this.userDataDir = userDataDir;
    this.primaryDir = resolvePrimaryAddonsDir(userDataDir);
    this.internalDir = path.join(userDataDir, 'addons');
    this.stateFile = stateFile || path.join(userDataDir, 'addons-state.json');
    this.logger = logger;
    this._state = {
      stateVersion: 2,
      enabled: {},
      storage: {}
    };
    this._loadState();
    this._ensureDefaultAddons();
  }

  _loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          this._state.storage = parsed.storage && typeof parsed.storage === 'object' ? parsed.storage : {};
          if (parsed.stateVersion === 2 && parsed.enabled && typeof parsed.enabled === 'object') {
            this._state.enabled = parsed.enabled;
          } else {
            this._state.enabled = {};
            this._state.stateVersion = 2;
            this._saveState();
          }
        }
      }
    } catch (err) {
      if (this.logger) this.logger.warn('Addon-Status konnte nicht geladen werden.', { error: err.message });
    }
  }

  _saveState() {
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify(this._state, null, 2), 'utf8');
    } catch (err) {
      if (this.logger) this.logger.error('Addon-Status konnte nicht gespeichert werden.', { error: err.message });
    }
  }

  _ensureDefaultAddons() {
    const dirsToSeed = [this.primaryDir];
    if (process.platform === 'win32' && this.primaryDir !== EXPLICIT_WINDOWS_ADDONS_DIR) {
      try {
        if (fs.existsSync(path.dirname(EXPLICIT_WINDOWS_ADDONS_DIR))) {
          dirsToSeed.push(EXPLICIT_WINDOWS_ADDONS_DIR);
        }
      } catch { /* ignore */ }
    }

    if (process.platform === 'win32') {
      try {
        if (fs.existsSync(path.dirname(EXPLICIT_WINDOWS_MUSIC_ADDON_DIR))) {
          writeMusicAddonFiles(EXPLICIT_WINDOWS_MUSIC_ADDON_DIR);
        }
      } catch { /* ignore */ }
    }

    for (const baseDir of dirsToSeed) {
      try {
        fs.mkdirSync(baseDir, { recursive: true });

        // Entferne alte Mehrdateien-Unterordner aus früheren Versionen, damit nur noch 1-Datei-.js-Addons liegen
        for (const legacyDir of ['emerald-matrix-theme', 'sqlhub-notes-addon', 'MusikAddon']) {
          const legacyPath = path.join(baseDir, legacyDir);
          try {
            if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isDirectory()) {
              fs.rmSync(legacyPath, { recursive: true, force: true });
            }
          } catch { /* ignore */ }
        }

        // Schreibe ausführliche Anleitung
        fs.writeFileSync(path.join(baseDir, 'ANLEITUNG_ADDON_ERSTELLEN.md'), GUIDE_MARKDOWN, 'utf8');

        // 1. Single-File Addon: musik-player-addon.js
        fs.writeFileSync(path.join(baseDir, 'musik-player-addon.js'), MUSIC_ADDON_SINGLE_JS, 'utf8');

        // 2. Single-File Addon: notizen-snippets-addon.js
        fs.writeFileSync(path.join(baseDir, 'notizen-snippets-addon.js'), NOTES_SINGLE_JS, 'utf8');

        // 3. Single-File Addon: emerald-pixel-theme.js
        fs.writeFileSync(path.join(baseDir, 'emerald-pixel-theme.js'), EMERALD_THEME_SINGLE_JS, 'utf8');

        // 4. Single-File Starter-Vorlage: beispiel-eigenes-addon.js
        fs.writeFileSync(path.join(baseDir, 'beispiel-eigenes-addon.js'), STARTER_EXAMPLE_SINGLE_JS, 'utf8');

        // Standard-Beispielnotizen beim allerersten Mal anlegen
        if (!this._state.storage['sqlhub-notes']) {
          this._state.storage['sqlhub-notes'] = {
            notes: [
              {
                id: 'welcome-note-1',
                title: 'Willkommen im Notizen- & SQL-Snippet-Addon!',
                category: 'Allgemein',
                pinned: true,
                sql: 'SELECT table_name, table_rows, data_length\nFROM information_schema.tables\nWHERE table_schema = DATABASE()\nORDER BY data_length DESC;',
                content: 'Dieses Werkzeug wird direkt aus einer einzigen Datei (notizen-snippets-addon.js) geladen. Du kannst hier beliebige Server-Notizen und häufige SQL-Abfragen speichern.',
                updatedAt: new Date().toISOString()
              }
            ]
          };
          this._saveState();
        }
      } catch (err) {
        if (this.logger) this.logger.warn('Standard-Addons konnten nicht initialisiert werden.', { error: err.message });
      }
    }
  }

  getAddonsDirectory() {
    return this.primaryDir;
  }

  _readSingleJsAddon(jsFilePath) {
    const parsed = parseSingleJsAddonFile(jsFilePath);
    if (!parsed) return null;
    const { def, rawCode } = parsed;
    const id = sanitizeAddonId(def.id || path.basename(jsFilePath, '.js'));
    const cssContent = String(def.styles || def.css || '');

    let sidebar = null;
    if (def.sidebar && typeof def.sidebar === 'object') {
      sidebar = {
        label: String(def.sidebar.label || def.name || 'Addon').slice(0, 24),
        title: String(def.sidebar.title || def.name || 'Addon').slice(0, 80),
        subtitle: String(def.sidebar.subtitle || def.description || '').slice(0, 140),
        icon: String(def.sidebar.icon || 'file-text'),
        template: def.sidebar.template || 'custom',
        keepAlive: Boolean(def.sidebar.keepAlive),
        htmlContent: String(def.html || def.sidebar.html || ''),
        scriptContent: rawCode
      };
    }

    const enabled = Object.prototype.hasOwnProperty.call(this._state.enabled, id)
      ? Boolean(this._state.enabled[id])
      : false;

    return {
      id,
      name: String(def.name || id).slice(0, 80),
      version: String(def.version || '1.0.0').slice(0, 24),
      author: String(def.author || 'Eigenes Addon').slice(0, 60),
      description: String(def.description || '').slice(0, 350),
      type: ['tool', 'theme', 'hybrid'].includes(def.type)
        ? def.type
        : (sidebar && cssContent ? 'hybrid' : (sidebar ? 'tool' : 'theme')),
      permissions: Array.isArray(def.permissions) ? def.permissions.map(String) : ['single-file-js'],
      files: [path.basename(jsFilePath)],
      enabled,
      folderPath: jsFilePath,
      cssContent,
      sidebar
    };
  }

  _scanDirectory(dirPath, map) {
    if (!dirPath || !fs.existsSync(dirPath)) return;
    const stat = fs.statSync(dirPath);
    if (stat.isFile() && dirPath.toLowerCase().endsWith('.js')) {
      const single = this._readSingleJsAddon(dirPath);
      if (single) map.set(single.id, single);
      return;
    }

    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.js')) {
        try {
          const item = this._readSingleJsAddon(path.join(dirPath, entry.name));
          if (item) map.set(item.id, item);
        } catch { /* ignore */ }
      }
    }
  }

  list() {
    const map = new Map();
    this._scanDirectory(this.internalDir, map);
    if (process.platform === 'win32' && fs.existsSync(EXPLICIT_WINDOWS_MUSIC_ADDON_DIR)) {
      this._scanDirectory(EXPLICIT_WINDOWS_MUSIC_ADDON_DIR, map);
    }
    this._scanDirectory(this.primaryDir, map);
    return Array.from(map.values());
  }

  inspectFromPath(sourcePath) {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { ok: false, errors: ['Die angegebene .js-Datei existiert nicht.'] };
    }
    let targetFile = sourcePath;
    const stat = fs.statSync(sourcePath);
    if (stat.isDirectory()) {
      const jsFiles = fs.readdirSync(sourcePath).filter((f) => f.toLowerCase().endsWith('.js'));
      if (jsFiles.length === 0) {
        return { ok: false, errors: ['Keine .js Addon-Datei gefunden. Bitte wähle eine einzelne .js-Datei (z. B. meinaddon.js) aus.'] };
      }
      targetFile = path.join(sourcePath, jsFiles[0]);
    }
    if (!targetFile.toLowerCase().endsWith('.js')) {
      return { ok: false, errors: ['Bitte wähle eine JavaScript-Datei (.js) wie z. B. meinaddon.js aus.'] };
    }

    const addon = this._readSingleJsAddon(targetFile);
    if (!addon) {
      return { ok: false, errors: ['Die gewählte .js-Datei enthält kein gültiges SQL Hub Addon-Objekt (export default { id, name, ... }).'] };
    }
    const alreadyInstalled = this.list().some((a) => a.id === addon.id);
    return {
      ok: true,
      addon: {
        ...addon,
        sourceDir: targetFile,
        targetDir: path.join(this.primaryDir, `${addon.id}.js`),
        alreadyInstalled
      }
    };
  }

  setEnabled(id, enabled) {
    const cleanId = sanitizeAddonId(id);
    this._state.enabled[cleanId] = Boolean(enabled);
    this._saveState();
    return { ok: true, addons: this.list() };
  }

  getStorage(id) {
    const cleanId = sanitizeAddonId(id);
    return {
      ok: true,
      data: this._state.storage[cleanId] || {}
    };
  }

  setStorage(id, data) {
    const cleanId = sanitizeAddonId(id);
    this._state.storage[cleanId] = data && typeof data === 'object' ? data : {};
    this._saveState();
    return { ok: true, data: this._state.storage[cleanId] };
  }

  createAddon(input = {}) {
    const name = String(input.name || '').trim();
    if (!name) return { ok: false, errors: ['Bitte einen Namen für das Addon eingeben.'] };

    const id = sanitizeAddonId(input.id || name);
    const type = ['tool', 'theme', 'hybrid'].includes(input.type) ? input.type : 'tool';
    const hasSidebar = type === 'tool' || type === 'hybrid';
    const template = ['custom', 'music', 'notes'].includes(input.template) ? input.template : 'custom';

    fs.mkdirSync(this.primaryDir, { recursive: true });
    const targetFile = path.join(this.primaryDir, `${id}.js`);

    if (template === 'music') {
      const customMusicJs = MUSIC_ADDON_SINGLE_JS
        .replace("id: 'sqlhub-music-player'", `id: '${id}'`)
        .replace("name: 'SQL Hub Musik & Stream Player'", `name: ${JSON.stringify(name)}`);
      fs.writeFileSync(targetFile, customMusicJs, 'utf8');
      this._state.enabled[id] = false;
      this._saveState();
      return { ok: true, folderPath: targetFile, addons: this.list() };
    }

    const css = String(input.customCss || (type === 'theme'
      ? `:root {\n  --primary: ${input.accentColor || '#3b82f6'} !important;\n}`
      : `.addon-box-${id} { padding: 16px; }`));

    const singleFileCode = `// ${id}.js – Erstellt mit dem SQL Hub Single-File Addon-Baukasten
// Du kannst diese eine Datei direkt in VS Code bearbeiten!

export default {
  id: ${JSON.stringify(id)},
  name: ${JSON.stringify(name.slice(0, 80))},
  version: ${JSON.stringify(String(input.version || '1.0.0').trim() || '1.0.0')},
  author: ${JSON.stringify(String(input.author || 'Eigener Entwickler').trim() || 'Eigener Entwickler')},
  description: ${JSON.stringify(String(input.description || 'Eigenes Single-File .js Addon').trim())},
  type: ${JSON.stringify(type)},
  ${hasSidebar ? `sidebar: {
    label: ${JSON.stringify(String(input.sidebarLabel || name).slice(0, 20))},
    title: ${JSON.stringify(String(input.sidebarTitle || name).slice(0, 80))},
    subtitle: ${JSON.stringify(String(input.description || 'Geladen aus einer einzigen .js-Datei').slice(0, 140))},
    icon: ${JSON.stringify(String(input.sidebarIcon || 'sparkles'))},
    template: ${JSON.stringify(template === 'notes' ? 'notes' : 'custom')},
    keepAlive: ${Boolean(input.keepAlive)}
  },` : ''}
  styles: ${JSON.stringify(css)},
  ${hasSidebar && template !== 'notes' ? `html: \`
    <div class="panel">
      <h2>${name.replace(/`/g, '')}</h2>
      <p class="panel__desc">Dieses Addon läuft komplett über die einzelne Datei <code>${id}.js</code>.</p>
      <div class="field">
        <label>Eigene Notiz / Eingabe</label>
        <textarea id="addon-custom-text" class="input" rows="8" placeholder="Hier schreiben …"></textarea>
      </div>
      <button type="button" class="btn btn--primary" id="addon-custom-save">Eingabe speichern</button>
    </div>
  \`,
  async mount(addonRoot, addonApi) {
    const ta = addonRoot.querySelector('#addon-custom-text');
    const btn = addonRoot.querySelector('#addon-custom-save');
    const stored = await addonApi.getStorage();
    if (ta && stored && stored.text) ta.value = stored.text;
    btn?.addEventListener('click', async () => {
      await addonApi.setStorage({ text: ta ? ta.value : '' });
      addonApi.toast('In ${id}.js gespeichert!', 'success');
    });
  }` : ''}
};
`;

    fs.writeFileSync(targetFile, singleFileCode, 'utf8');
    this._state.enabled[id] = false;
    this._saveState();

    return {
      ok: true,
      folderPath: targetFile,
      addons: this.list()
    };
  }

  installFromPath(sourcePath) {
    const inspected = this.inspectFromPath(sourcePath);
    if (!inspected.ok || !inspected.addon) {
      return { ok: false, errors: inspected.errors || ['Ungültige .js Addon-Datei.'] };
    }
    const { addon } = inspected;
    fs.mkdirSync(this.primaryDir, { recursive: true });
    const destFile = path.join(this.primaryDir, `${addon.id}.js`);
    if (path.resolve(addon.sourceDir) !== path.resolve(destFile)) {
      fs.copyFileSync(addon.sourceDir, destFile);
    }

    if (!Object.prototype.hasOwnProperty.call(this._state.enabled, addon.id)) {
      this._state.enabled[addon.id] = false;
    }
    this._saveState();

    return {
      ok: true,
      id: addon.id,
      folderPath: destFile,
      addons: this.list()
    };
  }

  deleteAddon(id, options = {}) {
    const cleanId = sanitizeAddonId(id);
    const found = this.list().find((a) => a.id === cleanId);
    if (!found) return { ok: false, errors: ['Addon wurde nicht gefunden.'] };
    try {
      if (options.onlyDisable) {
        this._state.enabled[cleanId] = false;
        this._saveState();
        return { ok: true, addons: this.list() };
      }
      if (found.folderPath && fs.existsSync(found.folderPath)) {
        fs.rmSync(found.folderPath, { recursive: true, force: true });
      }
      delete this._state.enabled[cleanId];
      if (options.wipeStorage) {
        delete this._state.storage[cleanId];
      }
      this._saveState();
      return { ok: true, addons: this.list() };
    } catch (err) {
      return { ok: false, errors: ['Addon konnte nicht deinstalliert werden: ' + err.message] };
    }
  }

  formatMediaFiles(filePaths = []) {
    const tracks = [];
    for (const fp of filePaths) {
      try {
        const resolved = path.resolve(fp);
        if (!fs.existsSync(resolved)) continue;
        const stat = fs.statSync(resolved);
        if (!stat.isFile()) continue;
        const ext = path.extname(resolved).toLowerCase();
        if (!MEDIA_EXTENSIONS.has(ext)) continue;
        tracks.push({
          name: path.basename(resolved),
          path: resolved,
          fileUrl: pathToFileURL(resolved).href,
          size: stat.size
        });
      } catch { /* ignore */ }
    }
    return tracks;
  }

  scanMediaFolder(folderPath) {
    if (!folderPath || !fs.existsSync(folderPath)) return [];
    const resolvedDir = path.resolve(folderPath);
    let entries = [];
    try {
      entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
    } catch {
      return [];
    }
    const filePaths = entries
      .filter((e) => e.isFile() && MEDIA_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
      .map((e) => path.join(resolvedDir, e.name));
    return this.formatMediaFiles(filePaths);
  }
}

module.exports = {
  AddonManager,
  GUIDE_MARKDOWN,
  EXPLICIT_WINDOWS_ADDONS_DIR,
  EXPLICIT_WINDOWS_MUSIC_ADDON_DIR,
  writeMusicAddonFiles
};
