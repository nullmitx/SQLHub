'use strict';

/**
 * Addon-Manager für SQL Hub (v2.4.3).
 *
 * Ermöglicht das Erstellen, Installieren, Aktivieren/Deaktivieren und Deinstallieren
 * von Addons (Design-Themes, Sidebar-Werkzeuge unter SFTP, Musik-/Video-/YouTube-Player u.v.m.).
 *
 * Primärer Addon-Ordner (unter Windows wie gewünscht):
 *   C:\Users\lucsc\OneDrive\Desktop\SQLHubAddons
 * Zusätzlicher Test-/Entwicklungsordner für das Musik-Addon:
 *   C:\Users\lucsc\OneDrive\Desktop\MusikAddon
 * Fallback (macOS / Linux / andere Systeme):
 *   ~/Desktop/SQLHubAddons bzw. <userData>/addons
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const EXPLICIT_WINDOWS_ADDONS_DIR = 'C:\\Users\\lucsc\\OneDrive\\Desktop\\SQLHubAddons';
const EXPLICIT_WINDOWS_MUSIC_ADDON_DIR = 'C:\\Users\\lucsc\\OneDrive\\Desktop\\MusikAddon';

const MEDIA_EXTENSIONS = new Set([
  '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.webm', '.mp4'
]);

function resolvePrimaryAddonsDir(userDataDir) {
  if (process.platform === 'win32') {
    try {
      const parent = path.dirname(EXPLICIT_WINDOWS_ADDONS_DIR);
      if (fs.existsSync(parent)) {
        return EXPLICIT_WINDOWS_ADDONS_DIR;
      }
    } catch {
      /* fallback below */
    }
  }
  const desktopDir = path.join(os.homedir(), 'Desktop');
  if (fs.existsSync(desktopDir)) {
    return path.join(desktopDir, 'SQLHubAddons');
  }
  return path.join(userDataDir || os.homedir(), 'SQLHubAddons');
}

const GUIDE_MARKDOWN = `# SQL Hub – Offizielles Handbuch zur Addon-Entwicklung (v2.4.3)

Willkommen im **SQL Hub Addon-System**!  
Mit Addons hast du in **SQL Hub** volle Freiheit: Du kannst eigene **Design-Themes** gestalten, neue **Werkzeuge unter \`SFTP\`** in die linke Seitenleiste einfügen oder sogar komplexe Multimedia-Apps wie einen **Musik-Player (Spotify-/YouTube-Stil)**, **Video-Player**, **Server-Monitor** oder **Notiz-Manager** bauen.

---

## Inhaltsverzeichnis

1. [Wo liegen die Addons?](#1-wo-liegen-die-addons)
2. [Aufbau eines Addon-Ordners](#2-aufbau-eines-addon-ordners)
3. [Die \`manifest.json\` im Detail (Alle Optionen)](#3-die-manifestjson-im-detail-alle-optionen)
4. [Die JavaScript-Schnittstelle \`addonApi\` (Volle Freiheit)](#4-die-javascript-schnittstelle-addonapi-volle-freiheit)
5. [Hintergrund-Wiedergabe (\`keepAlive: true\`) für Musik & Streams](#5-hintergrund-wiedergabe-keepalive-true-für-musik--streams)
6. [Tutorial 1: Eigenes Design- / Theme-Addon erstellen](#6-tutorial-1-eigenes-design---theme-addon-erstellen)
7. [Tutorial 2: Eigenes Sidebar-Werkzeug (z. B. Server-Checkliste) erstellen](#7-tutorial-2-eigenes-sidebar-werkzeug-z-b-server-checkliste-erstellen)
8. [Tutorial 3: Eigenen Musik-, Radio- & YouTube/Spotify-Player bauen](#8-tutorial-3-eigenen-musik--radio---youtube-spotify-player-bauen)
9. [Installation & Deinstallation über den Custom-Assistenten](#9-installation--deinstallation-über-den-custom-assistenten)

---

## 1. Wo liegen die Addons?

SQL Hub lädt alle Addons automatisch aus diesem Hauptordner:
\`\`\`text
C:\\Users\\lucsc\\OneDrive\\Desktop\\SQLHubAddons
\`\`\`
Zusätzlich kannst du jeden beliebigen Ordner auf deinem PC (z. B. \`C:\\Users\\lucsc\\OneDrive\\Desktop\\MusikAddon\`) direkt in SQL Hub über **Addons (über Tresor) → Addon installieren** mit dem **Custom-Installations-Assistenten** prüfen und installieren.

---

## 2. Aufbau eines Addon-Ordners

Jedes Addon ist ein eigener Unterordner und besteht aus bis zu **4 einfachen Dateien**:

\`\`\`text
MeinEigenesAddon/
├── manifest.json     (Pflicht: Name, Version, Icon, Typ & Einstellungen)
├── styles.css        (Optional: Eigene CSS-Styles für deine Ansicht oder das gesamte App-Design)
├── view.html         (Optional: Dein eigenes HTML-Layout für die Seite unter SFTP)
└── script.js         (Optional: Dein eigener JavaScript-Code für Musik, Buttons, API, Speicher usw.)
\`\`\`

---

## 3. Die \`manifest.json\` im Detail (Alle Optionen)

\`\`\`json
{
  "id": "mein-musik-addon",
  "name": "Mein Musik & Stream Player",
  "version": "1.0.0",
  "author": "Dein Name",
  "description": "Spielt lokale MP3s, Web-Radio, Spotify-Embeds und YouTube-Streams ab.",
  "type": "tool",
  "enabledByDefault": true,
  "styleFile": "styles.css",
  "permissions": [
    "sidebar",
    "audio-video",
    "storage",
    "local-media",
    "external-embeds"
  ],
  "sidebar": {
    "label": "Musik",
    "title": "Musik & Stream Studio",
    "subtitle": "Spotify-Deck, YouTube-Player, Web-Radio & lokale MP3s",
    "icon": "music",
    "template": "custom",
    "keepAlive": true,
    "viewFile": "view.html",
    "scriptFile": "script.js"
  }
}
\`\`\`

### Erklärung der wichtigsten Felder:
- **\`type\`**:
  - \`"tool"\`: Fügt ein neues Icon direkt **unter \`SFTP\`** in der linken Seitenleiste hinzu.
  - \`"theme"\`: Verändert das Design / die Farben der gesamten App über \`styles.css\`.
  - \`"hybrid"\`: Kombiniert ein eigenes Sidebar-Icon unter \`SFTP\` mit globalem App-Design.
- **\`sidebar.icon\`**: Name des Icons in der Seitenleiste. Verfügbare Icons:
  - \`"music"\` (Musiknote), \`"file-text"\` (Notiz), \`"terminal"\` (Konsole), \`"clipboard"\` (Klemmbrett), \`"gamepad-2"\` (Controller), \`"rocket"\` (Rakete), \`"bot"\` (Bot), \`"sparkles"\` (Sterne), \`"layers"\` (Ebenen), \`"wrench"\` (Werkzeug), \`"globe"\` (Weltkugel), \`"database"\` (Datenbank), \`"server"\` (Server), \`"cloud"\` (Cloud).
- **\`sidebar.template\`**:
  - \`"custom"\`: Lädt deine eigene \`view.html\` und führt deine \`script.js\` aus (volle Freiheit für Musik-Player, Videos, Iframes, Canvas, eigene Formulare!).
  - \`"notes"\`: Nutzt das fertige Notizen- & SQL-Snippet-System von SQL Hub.
- **\`sidebar.keepAlive\`** (\`true\` / \`false\`):
  - Wenn \`true\` gesetzt ist, bleibt deine Addon-Seite im Hintergrund aktiv, wenn du zu \`Start\`, \`Instanzen\`, \`Sitzungen\` oder \`SFTP\` wechselst. **Perfekt für Musik-Player, Radio-Streams oder Timer, damit die Musik ohne Unterbrechung weiterläuft!**

---

## 4. Die JavaScript-Schnittstelle \`addonApi\` (Volle Freiheit)

Wenn du \`"template": "custom"\` nutzt, bekommt deine \`script.js\` automatisch zwei Objekte übergeben:
1. **\`addonRoot\`**: Das DOM-Element (\`HTMLElement\`) deiner Addon-Seite (\`addonRoot.querySelector(...)\`).
2. **\`addonApi\`**: Das mächtige SQL Hub Addon-SDK mit folgenden Funktionen:

| Methode | Beschreibung |
| :--- | :--- |
| \`await addonApi.getStorage()\` | Lädt dein dauerhaft gespeichertes JSON-Objekt (z. B. Playlists, Notizen, Lautstärke). |
| \`await addonApi.setStorage(obj)\` | Speichert beliebige JSON-Daten dauerhaft für dein Addon. |
| \`await addonApi.pickMediaFiles()\` | Öffnet den Dateidialog für Audio-/Videodateien (\`.mp3\`, \`.wav\`, \`.ogg\`, \`.flac\`, \`.m4a\`, \`.mp4\`, \`.webm\`) und gibt \`[{ name, path, fileUrl, size }]\` zurück. |
| \`await addonApi.pickMediaFolder()\` | Öffnet einen Ordnerdialog, durchsucht ihn nach Musik-/Videodateien und gibt \`{ folderPath, tracks: [...] }\` zurück. |
| \`addonApi.setMiniPlayer(config)\` | Zeigt unten rechts in SQL Hub eine schwebende Mini-Player-Leiste an, während man in anderen Ansichten arbeitet (\`{ active: true, title, subtitle, playing, onToggle, onNext, onOpen }\`). |
| \`addonApi.toast(msg, type, title)\` | Zeigt eine Benachrichtigung an (\`type\`: \`'info'\`, \`'success'\`, \`'warning'\`, \`'error'\`). |
| \`await addonApi.copyClipboard(text)\` | Kopiert Text direkt in die Zwischenablage. |
| \`await addonApi.getProfiles()\` | Liefert die Liste aller gespeicherten Datenbank-Instanzen. |
| \`addonApi.navigate(viewName)\` | Wechselt zu einer anderen Ansicht (\`'dashboard'\`, \`'profiles'\`, \`'sftp'\`, \`'addons'\`). |

---

## 5. Hintergrund-Wiedergabe (\`keepAlive: true\`) für Musik & Streams

Dank \`"keepAlive": true\` in der \`manifest.json\` wird der DOM-Container deines Addons beim Wechsel auf \`Start\` oder \`SFTP\` **nicht zerstört**, sondern nur unsichtbar geschaltet. Dadurch laufen:
- HTML5 \`<audio>\` und \`<video>\` Elemente,
- Web-Audio-API Visualizer & Synthesizer,
- sowie eingebettete \`<iframe>\`-Player (YouTube / Spotify / SoundCloud)
**unterbrechungsfrei im Hintergrund weiter!**

---

## 6. Tutorial 1: Eigenes Design- / Theme-Addon erstellen

Erstelle einen Ordner \`SQLHubAddons/mein-cyber-theme/\` mit:

### \`manifest.json\`
\`\`\`json
{
  "id": "mein-cyber-theme",
  "name": "Cyber Neon Theme",
  "version": "1.0.0",
  "author": "Luc",
  "description": "Verpasst SQL Hub ein violett-blaues Neon-Design.",
  "type": "theme",
  "enabledByDefault": false,
  "styleFile": "styles.css"
}
\`\`\`

### \`styles.css\`
\`\`\`css
:root {
  --primary: #8b5cf6 !important;
  --primary-hover: #7c3aed !important;
  --accent: #06b6d4 !important;
  --bg-app: #090812 !important;
  --surface: #121024 !important;
}
\`\`\`

---

## 7. Tutorial 2: Eigenes Sidebar-Werkzeug (z. B. Server-Checkliste) erstellen

Erstelle einen Ordner \`SQLHubAddons/server-checkliste/\` mit \`manifest.json\`, \`view.html\` und \`script.js\`:

### \`view.html\`
\`\`\`html
<div class="panel">
  <h2>Meine Server-Checkliste</h2>
  <p class="panel__desc">Wichtige Schritte vor jedem Datenbank-Update:</p>
  <textarea id="cl-input" class="input" rows="8" placeholder="Aufgaben eintragen …"></textarea>
  <div style="margin-top:12px;">
    <button type="button" class="btn btn--primary" id="cl-save">Speichern</button>
  </div>
</div>
\`\`\`

### \`script.js\`
\`\`\`js
(async () => {
  const input = addonRoot.querySelector('#cl-input');
  const btn = addonRoot.querySelector('#cl-save');
  const data = await addonApi.getStorage();
  if (data && data.text) input.value = data.text;

  btn.addEventListener('click', async () => {
    await addonApi.setStorage({ text: input.value });
    addonApi.toast('Checkliste gespeichert!', 'success');
  });
})();
\`\`\`

---

## 8. Tutorial 3: Eigenen Musik-, Radio- & YouTube/Spotify-Player bauen

Ein vollständiges, sofort einsatzbereites Referenz-Projekt findest du direkt auf deinem Desktop unter:
- \`C:\\Users\\lucsc\\OneDrive\\Desktop\\MusikAddon\`
- sowie installiert unter \`C:\\Users\\lucsc\\OneDrive\\Desktop\\SQLHubAddons\\MusikAddon\`

Dort siehst du im echten Code (\`manifest.json\`, \`styles.css\`, \`view.html\`, \`script.js\`), wie man:
1. Lokale Audiodateien (\`.mp3\`, \`.wav\`, \`.flac\`, \`.mp4\`) und ganze Musik-Ordner lädt,
2. Live-Radio-Streams und einen Web-Audio-Synthesizer mit **28-Band-Canvas-Equalizer** abspielt,
3. **YouTube-Videos/Playlists** und **Spotify-Links** direkt einbettet,
4. und über \`addonApi.setMiniPlayer(...)\` eine schwebende Mini-Player-Steuerung in SQL Hub einblendet!

---

## 9. Installation & Deinstallation über den Custom-Assistenten

1. Öffne in SQL Hub links unten **\`Addons\`** (direkt über \`Tresor\`).
2. Klicke oben rechts auf **\`Addon installieren\`**, um das **Custom-Installations-Fenster** zu öffnen.
3. Wähle deinen Addon-Ordner (z. B. \`C:\\Users\\lucsc\\OneDrive\\Desktop\\MusikAddon\`), prüfe die Berechtigungen & Dateien in der Vorschau und klicke auf **Jetzt installieren**.
4. Zum Entfernen klickst du bei einem Addon auf **\`Deinstallieren\`** – im **Custom-Deinstallations-Fenster** kannst du auswählen, ob auch die gespeicherten Addon-Daten bereinigt werden sollen.
`;

const DEFAULT_NOTES_MANIFEST = {
  id: 'sqlhub-notes',
  name: 'Notizen & SQL-Snippets',
  version: '1.3.0',
  author: 'SQL Hub Team',
  description: 'Fügt unter SFTP einen eigenen Bereich „Notizen“ hinzu, in dem du Server-Notizen, Zugangs-Hinweise, To-Dos und häufig genutzte SQL-Abfragen speichern, durchsuchen und mit einem Klick kopieren kannst.',
  type: 'tool',
  enabledByDefault: false,
  styleFile: 'styles.css',
  permissions: ['sidebar', 'storage', 'clipboard'],
  sidebar: {
    label: 'Notizen',
    title: 'Notizen & SQL-Snippets',
    subtitle: 'Persönliches Scratchpad für Datenbank-Abfragen, Server-Doku & Aufgaben',
    icon: 'file-text',
    template: 'notes'
  }
};

const DEFAULT_NOTES_CSS = `/* Zusatz-Styles des Notizen-Addons (sqlhub-notes) */
.notes-pin-badge {
  color: var(--primary);
}
`;

const DEFAULT_THEME_MANIFEST = {
  id: 'emerald-matrix-theme',
  name: 'Emerald Pixel Theme',
  version: '1.1.0',
  author: 'SQL Hub Studio',
  description: 'Verwandelt die Oberfläche von SQL Hub in ein smaragdgrünes Matrix-/Cyber-Launcher-Design mit passenden Akzenten, Buttons und Hero-Banner.',
  type: 'theme',
  enabledByDefault: false,
  styleFile: 'styles.css',
  permissions: ['theme-css']
};

const DEFAULT_THEME_CSS = `/* Emerald Pixel Theme – wird aktiv, sobald das Addon eingeschaltet wird */
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
`;

/* --------------------- Referenz Musik- & Stream-Player Addon (MusikAddon) --------------------- */

const MUSIC_ADDON_MANIFEST = {
  id: 'sqlhub-music-player',
  name: 'SQL Hub Musik & Stream Player',
  version: '1.5.0',
  author: 'SQL Hub Studio',
  description: 'Vollwertiger Musik-, Radio-, Spotify- & YouTube-Player direkt unter SFTP. Unterstützt lokale MP3/WAV/FLAC/MP4-Dateien, Live-Coding-Radio, 28-Band Audio-Visualizer, YouTube-/Spotify-Embeds und Hintergrund-Wiedergabe mit Mini-Player.',
  type: 'tool',
  enabledByDefault: false,
  styleFile: 'styles.css',
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
    subtitle: 'Spotify-Deck, Live-Radio, lokale MP3s & YouTube/Video-Streaming im Hintergrund',
    icon: 'music',
    template: 'custom',
    keepAlive: true,
    viewFile: 'view.html',
    scriptFile: 'script.js'
  }
};

const MUSIC_ADDON_CSS = `/* Styles für SQL Hub Musik & Stream Player (MusikAddon) */
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
  padding: 6px 13px;
  border-radius: 2px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  transition: all 0.14s;
}
.music-mode-tab:hover {
  color: var(--text);
  background: var(--surface-2);
}
.music-mode-tab.is-active {
  background: var(--primary);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.22);
}

.music-deck-grid {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
}
@media (max-width: 980px) {
  .music-deck-grid {
    grid-template-columns: 1fr;
  }
}

.music-now-card {
  background:
    radial-gradient(circle at 50% 0%, rgba(229, 57, 53, 0.18), transparent 65%),
    var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 2px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  box-shadow: var(--specular);
}

.music-cover-stage {
  position: relative;
  height: 175px;
  background: linear-gradient(145deg, #121622 0%, #0b0d12 100%);
  border: 1px solid var(--border-strong);
  border-radius: 2px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px;
}

.music-cover-badge {
  position: absolute;
  top: 9px;
  left: 10px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 2px;
  background: rgba(11, 13, 18, 0.85);
  border: 1px solid var(--border-strong);
  color: var(--primary);
}

.music-cover-status {
  position: absolute;
  top: 9px;
  right: 10px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 2px;
  background: rgba(16, 185, 129, 0.14);
  border: 1px solid rgba(16, 185, 129, 0.45);
  color: #34d399;
}

.music-visualizer-canvas {
  width: 100%;
  height: 110px;
  display: block;
}

.music-track-info {
  text-align: center;
}
.music-track-title {
  font-size: 15.5px;
  font-weight: 800;
  color: var(--text);
  margin: 0 0 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.music-track-artist {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-muted);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.music-progress-wrap {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.music-Seek {
  width: 100%;
  accent-color: var(--primary);
  cursor: pointer;
}
.music-time-row {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-dim);
}

.music-controls-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.music-play-circle {
  width: 46px;
  height: 46px;
  border-radius: 2px;
  background: linear-gradient(180deg, #2d3444 0%, #1f2430 100%);
  border: 1px solid #52607a;
  color: #ffffff;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 4px 10px rgba(0, 0, 0, 0.45);
  transition: all 0.14s;
}
.music-play-circle:hover {
  background: var(--primary);
  border-color: rgba(255, 255, 255, 0.35);
}

.music-ctrl-btn.is-on {
  border-color: var(--primary) !important;
  color: var(--primary) !important;
  background: var(--primary-soft) !important;
}

.music-volume-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
.music-volume-row input[type="range"] {
  flex: 1;
  accent-color: var(--primary);
  cursor: pointer;
}

.music-playlist-card {
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  min-height: 450px;
  max-height: 560px;
  box-shadow: var(--specular);
  overflow: hidden;
}

.music-playlist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 14px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.music-add-url-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-app);
  flex-wrap: wrap;
}

.music-track-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.music-track-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 11px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.12s;
}
.music-track-item:hover {
  background: var(--surface-2);
  border-color: var(--border-strong);
}
.music-track-item.is-active {
  border-color: var(--primary);
  background: var(--surface-2);
  box-shadow: inset 3px 0 0 var(--primary);
}

.music-track-item__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}
.music-track-item__num {
  width: 24px;
  height: 24px;
  border-radius: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.music-track-item.is-active .music-track-item__num {
  background: var(--primary);
  border-color: var(--primary);
  color: #ffffff;
}

.music-track-item__meta {
  min-width: 0;
  flex: 1;
}
.music-track-item__title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.music-track-item__sub {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.music-yt-stage {
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 2px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--specular);
}

.music-yt-presets {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.music-yt-frame-wrap {
  width: 100%;
  height: 410px;
  background: #07090d;
  border: 1px solid var(--border-strong);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}
.music-yt-frame-wrap iframe,
.music-yt-frame-wrap video {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
`;

const MUSIC_ADDON_HTML = `
<div class="music-studio">
  <div class="page-head">
    <div class="page-head__titles">
      <div class="page-eyebrow">ADDON · MULTIMEDIA &amp; CODING BEATS</div>
      <h1 class="page-title">SQL Hub Musik &amp; Stream Player</h1>
      <p class="page-sub">Höre lokale MP3s/FLACs, Live-Coding-Radio, Synthwave oder YouTube-/Spotify-Streams im Hintergrund beim Verwalten deiner Datenbanken</p>
    </div>
    <div class="page-head__actions">
      <div class="music-mode-tabs" role="tablist">
        <button type="button" class="music-mode-tab is-active" data-music-tab="deck">
          <span>♫ Audio-Deck &amp; Lokale MP3s</span>
        </button>
        <button type="button" class="music-mode-tab" data-music-tab="embed">
          <span>▶ YouTube / Spotify / Video</span>
        </button>
      </div>
      <button type="button" class="btn btn--primary" id="music-pick-files">
        <span>+ Lokale Musikdateien</span>
      </button>
      <button type="button" class="btn btn--subtle" id="music-pick-folder">
        <span>+ Musik-Ordner</span>
      </button>
    </div>
  </div>

  <!-- TAB 1: AUDIO-DECK, RADIO, SYNTH-BEATS & LOKALE MP3s -->
  <div id="music-pane-deck" class="music-deck-grid">
    <div class="music-now-card">
      <div class="music-cover-stage">
        <span class="music-cover-badge" id="music-source-badge">CODING RADIO</span>
        <span class="music-cover-status" id="music-live-status">Bereit</span>
        <canvas class="music-visualizer-canvas" id="music-visualizer" width="320" height="110"></canvas>
      </div>

      <div class="music-track-info">
        <h3 class="music-track-title" id="music-now-title">Midnight SQL Lofi Synth</h3>
        <p class="music-track-artist" id="music-now-artist">SQL Hub Studio · Synth &amp; Stream Engine</p>
      </div>

      <div class="music-progress-wrap">
        <input type="range" class="music-Seek" id="music-seek" min="0" max="100" value="0" step="0.1" />
        <div class="music-time-row">
          <span id="music-time-cur">00:00</span>
          <span id="music-time-dur">LIVE / ENDLOS</span>
        </div>
      </div>

      <div class="music-controls-row">
        <button type="button" class="btn btn--sm btn--ghost music-ctrl-btn" id="music-btn-shuffle" title="Zufallswiedergabe">Shuffle</button>
        <button type="button" class="btn btn--sm btn--ghost" id="music-btn-prev" title="Vorheriger Titel">⏮</button>
        <button type="button" class="music-play-circle" id="music-btn-play" title="Abspielen / Pause">▶</button>
        <button type="button" class="btn btn--sm btn--ghost" id="music-btn-next" title="Nächster Titel">⏭</button>
        <button type="button" class="btn btn--sm btn--ghost music-ctrl-btn" id="music-btn-repeat" title="Wiederholen">Repeat</button>
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
          <div style="font-size:11px;color:var(--text-dim);font-family:var(--font-mono);" id="music-playlist-count">0 Titel in deiner Bibliothek</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn btn--xs btn--ghost" id="music-restore-defaults">Standard-Streams laden</button>
        </div>
      </div>

      <form class="music-add-url-bar" id="music-add-stream-form">
        <input type="text" class="input" id="music-stream-title" placeholder="Titel (z. B. Mein Lofi Radio)" style="width:175px;" />
        <input type="text" class="input" id="music-stream-url" placeholder="Direkte MP3- / Stream- / Datei-URL (https://... oder file://...)" style="flex:1;min-width:180px;" />
        <button type="submit" class="btn btn--sm btn--primary">+ Hinzufügen</button>
      </form>

      <div class="music-track-list" id="music-track-list"></div>
    </div>
  </div>

  <!-- TAB 2: YOUTUBE / SPOTIFY / VIDEO STREAM EMBED -->
  <div id="music-pane-embed" class="music-yt-stage" hidden>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <div>
        <strong style="font-size:13.5px;">YOUTUBE, SPOTIFY &amp; DIREKT-VIDEO PLAYER</strong>
        <div style="font-size:11.5px;color:var(--text-muted);">Füge einen YouTube-Link, eine YouTube-Video-ID, einen Spotify-Track/Playlist-Link oder eine MP4-URL ein</div>
      </div>
      <div class="music-yt-presets">
        <button type="button" class="btn btn--xs btn--subtle" data-yt-preset="https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1">Lofi Girl 24/7</button>
        <button type="button" class="btn btn--xs btn--subtle" data-yt-preset="https://www.youtube.com/embed/4xDzrJKXOOY?autoplay=1">Synthwave Radio</button>
        <button type="button" class="btn btn--xs btn--subtle" data-yt-preset="https://www.youtube.com/embed/5yx6BWlEVcY?autoplay=1">Chillhop Beats</button>
        <button type="button" class="btn btn--xs btn--subtle" data-yt-preset="https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn?utm_source=generator&theme=0">Spotify Lofi Playlist</button>
      </div>
    </div>

    <form id="music-yt-form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <input type="text" class="input" id="music-yt-input" style="flex:1;min-width:240px;" placeholder="https://www.youtube.com/watch?v=... oder https://open.spotify.com/playlist/..." />
      <select class="input" id="music-yt-mode" style="width:210px;font-family:var(--font-mono);font-size:11.5px;">
        <option value="embed">Kompakt Embed-Player</option>
        <option value="watch">YouTube Voll-Player (VEVO / Mix)</option>
        <option value="ytmusic">YouTube Music Player</option>
      </select>
      <button type="submit" class="btn btn--primary">Stream im Player starten</button>
    </form>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--text-dim);">
      <span>Tipp: Falls ein Label/VEVO-Song oder Radio-Mix (<code>&amp;list=RD...</code>) im Embed-Modus gesperrt ist, wechsle rechts auf <strong>YouTube Voll-Player</strong> oder <strong>YouTube Music</strong>.</span>
      <div style="display:flex;gap:6px;">
        <button type="button" class="btn btn--xs btn--ghost" id="music-yt-switch-embed">Auf Embed wechseln</button>
        <button type="button" class="btn btn--xs btn--ghost" id="music-yt-switch-watch">Auf Voll-Player (Mix/VEVO) wechseln</button>
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
`;

const MUSIC_ADDON_JS = `(async () => {
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
      id: 'stream-nightride',
      title: 'Nightride FM – Synthwave & Chillsynth Live',
      artist: 'Live Internet Radio Stream (MP3)',
      kind: 'audio',
      url: 'https://stream.nightride.fm/chillsynth.mp3'
    },
    {
      id: 'stream-lofi-box',
      title: 'SomaFM Groove Salad – Ambient & Coding Beats',
      artist: 'Live Internet Radio Stream (MP3)',
      kind: 'audio',
      url: 'https://ice2.somafm.com/groovesalad-128-mp3'
    },
    {
      id: 'stream-defcon',
      title: 'SomaFM DEF CON Radio – Hacker & Tech Music',
      artist: 'Live Internet Radio Stream (MP3)',
      kind: 'audio',
      url: 'https://ice2.somafm.com/defcon-128-mp3'
    }
  ];

  const audioEl = addonRoot.querySelector('#music-audio-el');
  const canvas = addonRoot.querySelector('#music-visualizer');
  const ctx = canvas ? canvas.getContext('2d') : null;

  const titleEl = addonRoot.querySelector('#music-now-title');
  const artistEl = addonRoot.querySelector('#music-now-artist');
  const badgeEl = addonRoot.querySelector('#music-source-badge');
  const statusEl = addonRoot.querySelector('#music-live-status');
  const playBtn = addonRoot.querySelector('#music-btn-play');
  const prevBtn = addonRoot.querySelector('#music-btn-prev');
  const nextBtn = addonRoot.querySelector('#music-btn-next');
  const shuffleBtn = addonRoot.querySelector('#music-btn-shuffle');
  const repeatBtn = addonRoot.querySelector('#music-btn-repeat');
  const seekEl = addonRoot.querySelector('#music-seek');
  const curTimeEl = addonRoot.querySelector('#music-time-cur');
  const durTimeEl = addonRoot.querySelector('#music-time-dur');
  const volEl = addonRoot.querySelector('#music-volume');
  const volLabelEl = addonRoot.querySelector('#music-volume-label');
  const trackListEl = addonRoot.querySelector('#music-track-list');
  const countEl = addonRoot.querySelector('#music-playlist-count');

  const stored = (await addonApi.getStorage()) || {};
  let tracks = Array.isArray(stored.tracks) && stored.tracks.length > 0 ? stored.tracks : [...DEFAULT_TRACKS];
  let currentIndex = Number(stored.currentIndex) || 0;
  if (currentIndex >= tracks.length) currentIndex = 0;
  let isPlaying = false;
  let shuffle = Boolean(stored.shuffle);
  let repeat = Boolean(stored.repeat);
  let volume = stored.volume !== undefined ? Number(stored.volume) : 75;

  if (volEl) volEl.value = String(volume);
  if (volLabelEl) volLabelEl.textContent = volume + '%';
  if (audioEl) audioEl.volume = Math.max(0, Math.min(1, volume / 100));
  shuffleBtn?.classList.toggle('is-on', shuffle);
  repeatBtn?.classList.toggle('is-on', repeat);

  // WebAudio Synthesizer für garantierte Offline-Lofi/Cyber-Beats
  let audioCtx = null;
  let synthTimer = null;
  let synthGain = null;
  let stepCounter = 0;

  function stopSynth() {
    if (synthTimer) {
      clearInterval(synthTimer);
      synthTimer = null;
    }
  }

  function startSynth(preset = 'lofi') {
    stopSynth();
    const AudioContextCls = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCls) return;
    if (!audioCtx) audioCtx = new AudioContextCls();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!synthGain) {
      synthGain = audioCtx.createGain();
      synthGain.connect(audioCtx.destination);
    }
    synthGain.gain.setValueAtTime((volume / 100) * 0.18, audioCtx.currentTime);

    const chords = preset === 'cyber'
      ? [[110, 164.81, 220, 261.63], [98, 146.83, 196, 246.94], [87.31, 130.81, 174.61, 220], [98, 146.83, 196, 293.66]]
      : [[261.63, 329.63, 392.00, 493.88], [220.00, 261.63, 329.63, 392.00], [174.61, 220.00, 261.63, 349.23], [196.00, 246.94, 293.66, 392.00]];

    const playStep = () => {
      if (!isPlaying) return;
      const now = audioCtx.currentTime;
      const chord = chords[Math.floor(stepCounter / 4) % chords.length];
      const note = chord[stepCounter % chord.length];

      const osc = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();
      osc.type = preset === 'cyber' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(note, now);

      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.exponentialRampToValueAtTime(0.28, now + 0.04);
      noteGain.gain.exponentialRampToValueAtTime(0.0008, now + (preset === 'cyber' ? 0.32 : 0.65));

      osc.connect(noteGain);
      noteGain.connect(synthGain);
      osc.start(now);
      osc.stop(now + (preset === 'cyber' ? 0.35 : 0.7));
      stepCounter++;
    };

    playStep();
    synthTimer = setInterval(playStep, preset === 'cyber' ? 260 : 480);
  }

  function formatSec(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  async function persistState() {
    await addonApi.setStorage({
      tracks,
      currentIndex,
      shuffle,
      repeat,
      volume
    });
  }

  function syncMiniPlayer() {
    const current = tracks[currentIndex];
    if (!current) return;
    if (typeof addonApi.setMiniPlayer === 'function') {
      addonApi.setMiniPlayer({
        active: isPlaying,
        title: current.title,
        subtitle: current.artist || 'SQL Hub Musik Player',
        playing: isPlaying,
        onToggle: () => togglePlay(),
        onNext: () => playNext()
      });
    }
  }

  function renderPlaylist() {
    if (!trackListEl) return;
    if (countEl) countEl.textContent = tracks.length + ' Titel in deiner Bibliothek';
    const current = tracks[currentIndex] || tracks[0];
    if (current) {
      if (titleEl) titleEl.textContent = current.title;
      if (artistEl) artistEl.textContent = current.artist || current.url || 'Lokale Audiodatei';
      if (badgeEl) {
        badgeEl.textContent = current.kind === 'synth'
          ? 'OFFLINE SYNTH'
          : (current.kind === 'local' ? 'LOKALE DATEI' : 'LIVE STREAM');
      }
    }

    trackListEl.innerHTML = tracks.map((t, idx) => \`
      <div class="music-track-item \${idx === currentIndex ? 'is-active' : ''}" data-track-idx="\${idx}">
        <div class="music-track-item__left">
          <span class="music-track-item__num">\${idx === currentIndex && isPlaying ? '♫' : (idx + 1)}</span>
          <div class="music-track-item__meta">
            <div class="music-track-item__title">\${t.title}</div>
            <div class="music-track-item__sub">\${t.artist || t.url || ''}</div>
          </div>
        </div>
        <button type="button" class="btn btn--xs btn--ghost" data-track-remove="\${idx}" title="Aus Playlist entfernen">✕</button>
      </div>
    \`).join('');

    trackListEl.querySelectorAll('[data-track-idx]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-track-remove]')) return;
        const idx = Number(row.getAttribute('data-track-idx'));
        startTrack(idx, true);
      });
    });

    trackListEl.querySelectorAll('[data-track-remove]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-track-remove'));
        if (tracks.length <= 1) {
          addonApi.toast('Mindestens ein Titel muss in der Playlist bleiben.', 'warning');
          return;
        }
        tracks.splice(idx, 1);
        if (currentIndex >= tracks.length) currentIndex = 0;
        await persistState();
        renderPlaylist();
      });
    });
  }

  async function startTrack(idx, autoPlay = true) {
    if (idx < 0 || idx >= tracks.length) idx = 0;
    currentIndex = idx;
    const track = tracks[currentIndex];
    stopSynth();
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute('src');
    }

    renderPlaylist();
    await persistState();

    if (!autoPlay) {
      isPlaying = false;
      if (playBtn) playBtn.textContent = '▶';
      if (statusEl) statusEl.textContent = 'Pausiert';
      syncMiniPlayer();
      return;
    }

    isPlaying = true;
    if (playBtn) playBtn.textContent = '⏸';
    if (statusEl) statusEl.textContent = 'Spielt ab';

    if (track.kind === 'synth') {
      if (durTimeEl) durTimeEl.textContent = 'SYNTH LIVE';
      startSynth(track.preset || 'lofi');
      syncMiniPlayer();
      renderPlaylist();
      return;
    }

    if (audioEl && track.url) {
      audioEl.src = track.url;
      audioEl.volume = Math.max(0, Math.min(1, volume / 100));
      try {
        await audioEl.play();
        if (statusEl) statusEl.textContent = 'Spielt ab';
      } catch (err) {
        // Fallback auf Offline-Synth falls kein Internet besteht
        addonApi.toast('Stream nicht erreichbar – wechsle auf Offline-Synth-Beat.', 'warning');
        startSynth('lofi');
      }
    }
    syncMiniPlayer();
    renderPlaylist();
  }

  function togglePlay() {
    if (isPlaying) {
      isPlaying = false;
      stopSynth();
      audioEl?.pause();
      if (playBtn) playBtn.textContent = '▶';
      if (statusEl) statusEl.textContent = 'Pausiert';
      syncMiniPlayer();
      renderPlaylist();
    } else {
      startTrack(currentIndex, true);
    }
  }

  function playNext() {
    if (shuffle && tracks.length > 1) {
      let next = Math.floor(Math.random() * tracks.length);
      if (next === currentIndex) next = (next + 1) % tracks.length;
      startTrack(next, true);
    } else {
      startTrack((currentIndex + 1) % tracks.length, true);
    }
  }

  function playPrev() {
    startTrack((currentIndex - 1 + tracks.length) % tracks.length, true);
  }

  playBtn?.addEventListener('click', togglePlay);
  nextBtn?.addEventListener('click', playNext);
  prevBtn?.addEventListener('click', playPrev);

  shuffleBtn?.addEventListener('click', async () => {
    shuffle = !shuffle;
    shuffleBtn.classList.toggle('is-on', shuffle);
    await persistState();
  });

  repeatBtn?.addEventListener('click', async () => {
    repeat = !repeat;
    repeatBtn.classList.toggle('is-on', repeat);
    await persistState();
  });

  volEl?.addEventListener('input', () => {
    volume = Number(volEl.value) || 0;
    if (volLabelEl) volLabelEl.textContent = volume + '%';
    if (audioEl) audioEl.volume = Math.max(0, Math.min(1, volume / 100));
    if (synthGain && audioCtx) {
      synthGain.gain.setValueAtTime((volume / 100) * 0.18, audioCtx.currentTime);
    }
    persistState();
  });

  audioEl?.addEventListener('timeupdate', () => {
    if (!audioEl.duration || !Number.isFinite(audioEl.duration)) {
      if (curTimeEl) curTimeEl.textContent = formatSec(audioEl.currentTime);
      if (durTimeEl) durTimeEl.textContent = 'LIVE STREAM';
      return;
    }
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    if (seekEl) seekEl.value = String(pct);
    if (curTimeEl) curTimeEl.textContent = formatSec(audioEl.currentTime);
    if (durTimeEl) durTimeEl.textContent = formatSec(audioEl.duration);
  });

  audioEl?.addEventListener('ended', () => {
    if (repeat) {
      startTrack(currentIndex, true);
    } else {
      playNext();
    }
  });

  seekEl?.addEventListener('input', () => {
    if (audioEl && audioEl.duration && Number.isFinite(audioEl.duration)) {
      audioEl.currentTime = (Number(seekEl.value) / 100) * audioEl.duration;
    }
  });

  // Lokale Musikdateien & Ordner importieren
  addonRoot.querySelector('#music-pick-files')?.addEventListener('click', async () => {
    if (typeof addonApi.pickMediaFiles !== 'function') return;
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
    addonApi.toast(files.length + ' Musikdatei(en) zur Playlist hinzugefügt!', 'success');
  });

  addonRoot.querySelector('#music-pick-folder')?.addEventListener('click', async () => {
    if (typeof addonApi.pickMediaFolder !== 'function') return;
    const res = await addonApi.pickMediaFolder();
    if (!res || !res.tracks || !res.tracks.length) {
      if (res && res.folderPath) {
        addonApi.toast('Keine unterstützten Audio-/Videodateien in diesem Ordner gefunden.', 'warning');
      }
      return;
    }
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
    addonApi.toast(res.tracks.length + ' Titel aus Ordner importiert!', 'success');
  });

  addonRoot.querySelector('#music-restore-defaults')?.addEventListener('click', async () => {
    tracks = [...DEFAULT_TRACKS];
    currentIndex = 0;
    await persistState();
    renderPlaylist();
    addonApi.toast('Standard-Radio- & Synth-Streams wiederhergestellt.', 'info');
  });

  addonRoot.querySelector('#music-add-stream-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInp = addonRoot.querySelector('#music-stream-title');
    const urlInp = addonRoot.querySelector('#music-stream-url');
    const url = (urlInp?.value || '').trim();
    if (!url) return;
    const title = (titleInp?.value || '').trim() || url.split('/').pop() || 'Eigener Stream';
    tracks.push({
      id: 'custom-' + Date.now(),
      title,
      artist: url,
      kind: 'audio',
      url
    });
    if (titleInp) titleInp.value = '';
    if (urlInp) urlInp.value = '';
    await persistState();
    renderPlaylist();
    startTrack(tracks.length - 1, true);
  });

  // Tab-Umschaltung (Audio-Deck <-> YouTube/Spotify Embed)
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
          frame.src = frame.getAttribute('data-default-src') || 'https://www.youtube-nocookie.com/embed/jfKfPfyJRdk';
        }
      }
    });
  });

  // YouTube / Spotify / Video URL Parser (unterstützt Watch-Links, Radio-Mixe &list=RD..., Shorts, youtu.be & Spotify)
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
    } catch {
      /* fallback regex below */
    }
    const ytMatch = val.match(/(?:v=|youtu\\.be\\/|\\/embed\\/|\\/shorts\\/)([A-Za-z0-9_-]{11})/);
    if (ytMatch) {
      return { videoId: ytMatch[1], listId: '', isRadioMix: val.includes('list=RD') || val.includes('start_radio=1') };
    }
    return null;
  }

  function toEmbedUrl(rawInput, preferredMode = 'embed') {
    const val = String(rawInput || '').trim();
    if (!val) return '';

    // Spotify Link -> Spotify Embed
    const spMatch = val.match(/open\\.spotify\\.com\\/(?:intl-[a-z]+\\/)?(track|playlist|album|episode)\\/([A-Za-z0-9]+)/);
    if (spMatch) {
      return 'https://open.spotify.com/embed/' + spMatch[1] + '/' + spMatch[2] + '?utm_source=generator&theme=0';
    }

    const yt = extractYouTubeInfo(val);
    if (yt && yt.videoId) {
      if (preferredMode === 'watch') {
        const listQuery = yt.listId ? '&list=' + encodeURIComponent(yt.listId) : '';
        return 'https://www.youtube.com/watch?v=' + encodeURIComponent(yt.videoId) + listQuery;
      }
      if (preferredMode === 'ytmusic') {
        const listQuery = yt.listId ? '&list=' + encodeURIComponent(yt.listId) : '';
        return 'https://music.youtube.com/watch?v=' + encodeURIComponent(yt.videoId) + listQuery;
      }
      // Standard-Embed (mit Origin & Referer Fix gegen Fehler 153)
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
    const mode = ytModeSel ? ytModeSel.value : 'embed';
    const raw = (ytInput && ytInput.value.trim()) || 'https://www.youtube.com/watch?v=jfKfPfyJRdk';
    const embedUrl = toEmbedUrl(raw, mode);
    if (!embedUrl) return;
    if (ytIframe) ytIframe.src = embedUrl;
    addonApi.setMiniPlayer({
      active: true,
      title: 'YouTube / Spotify Stream',
      subtitle: mode === 'watch' ? 'YouTube Voll-Player aktiv' : (mode === 'ytmusic' ? 'YouTube Music aktiv' : 'Stream-Embed aktiv'),
      playing: true,
      onToggle: () => {
        if (ytIframe) {
          const cur = ytIframe.src;
          ytIframe.src = cur === 'about:blank' ? embedUrl : 'about:blank';
        }
      },
      onNext: () => loadCurrentStream()
    });
  }

  addonRoot.querySelectorAll('[data-yt-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-yt-preset');
      if (ytInput && url) ytInput.value = url;
      if (ytIframe && url) ytIframe.src = url;
    });
  });

  addonRoot.querySelector('#music-yt-switch-embed')?.addEventListener('click', () => {
    loadCurrentStream('embed');
    addonApi.toast('Auf Kompakt-Embed gewechselt.', 'info');
  });

  addonRoot.querySelector('#music-yt-switch-watch')?.addEventListener('click', () => {
    loadCurrentStream('watch');
    addonApi.toast('Auf YouTube Voll-Player (für VEVO & Radio-Mixe) gewechselt.', 'info');
  });

  ytModeSel?.addEventListener('change', () => {
    if (ytInput && ytInput.value.trim()) loadCurrentStream();
  });

  addonRoot.querySelector('#music-yt-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    loadCurrentStream();
    addonApi.toast('Stream im Video-/Embed-Player gestartet.', 'success');
  });

  // 28-Band Live Canvas Visualizer
  let animPhase = 0;
  function drawVisualizer() {
    if (ctx && canvas) {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const bars = 28;
      const gap = 3;
      const barW = (w - gap * (bars - 1)) / bars;
      animPhase += isPlaying ? 0.14 : 0.02;

      for (let i = 0; i < bars; i++) {
        const wave = isPlaying
          ? (Math.sin(animPhase + i * 0.45) * 0.42 + Math.cos(animPhase * 1.7 - i * 0.3) * 0.35 + 0.35)
          : 0.08;
        const barH = Math.max(4, Math.min(h - 6, wave * (h - 10)));
        const x = i * (barW + gap);
        const y = h - barH;
        const grad = ctx.createLinearGradient(0, y, 0, h);
        grad.addColorStop(0, '#e53935');
        grad.addColorStop(1, '#3b82f6');
        ctx.fillStyle = isPlaying ? grad : '#2e3646';
        ctx.fillRect(x, y, barW, barH);
      }
    }
    requestAnimationFrame(drawVisualizer);
  }

  renderPlaylist();
  drawVisualizer();
})();
`;

function sanitizeAddonId(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || `addon-${Date.now()}`;
}

function writeMusicAddonFiles(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(MUSIC_ADDON_MANIFEST, null, 2), 'utf8');
  fs.writeFileSync(path.join(targetDir, 'styles.css'), MUSIC_ADDON_CSS, 'utf8');
  fs.writeFileSync(path.join(targetDir, 'view.html'), MUSIC_ADDON_HTML.trim() + '\n', 'utf8');
  fs.writeFileSync(path.join(targetDir, 'script.js'), MUSIC_ADDON_JS.trim() + '\n', 'utf8');
}

class AddonManager {
  constructor({ userDataDir, stateFile, logger }) {
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
            // Ab v2.4.4 sind alle Addons standardmäßig deaktiviert und werden manuell eingeschaltet
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

    // Erstelle das vom Nutzer gewünschte Musik-Addon direkt unter C:\Users\lucsc\OneDrive\Desktop\MusikAddon
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

        const guidePath = path.join(baseDir, 'ANLEITUNG_ADDON_ERSTELLEN.md');
        fs.writeFileSync(guidePath, GUIDE_MARKDOWN, 'utf8');

        // 1. Beispiel-Addon: Notizen & SQL-Snippets (Sidebar-Icon unter SFTP)
        const notesDir = path.join(baseDir, 'sqlhub-notes-addon');
        fs.mkdirSync(notesDir, { recursive: true });
        fs.writeFileSync(path.join(notesDir, 'manifest.json'), JSON.stringify(DEFAULT_NOTES_MANIFEST, null, 2), 'utf8');
        const notesCssFile = path.join(notesDir, 'styles.css');
        if (!fs.existsSync(notesCssFile)) {
          fs.writeFileSync(notesCssFile, DEFAULT_NOTES_CSS, 'utf8');
        }

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
                content: 'Dieses Werkzeug wird direkt über das Addon „sqlhub-notes“ im Ordner SQLHubAddons bereitgestellt. Du kannst hier beliebige Server-Notizen, Wartungs-Checklisten und häufige SQL-Abfragen speichern.',
                updatedAt: new Date().toISOString()
              },
              {
                id: 'welcome-note-2',
                title: 'Benutzer & Rechte in MySQL / MariaDB prüfen',
                category: 'SQL-Snippet',
                pinned: false,
                sql: 'SELECT User, Host, plugin FROM mysql.user;\nSHOW GRANTS FOR CURRENT_USER();',
                content: 'Schnellabfrage zur Kontrolle der Datenbank-Benutzer und aktiven Berechtigungen in phpMyAdmin.',
                updatedAt: new Date().toISOString()
              }
            ]
          };
          this._saveState();
        }

        // 2. Beispiel-Addon: Emerald Pixel Theme (Design-Addon)
        const themeDir = path.join(baseDir, 'emerald-matrix-theme');
        fs.mkdirSync(themeDir, { recursive: true });
        fs.writeFileSync(path.join(themeDir, 'manifest.json'), JSON.stringify(DEFAULT_THEME_MANIFEST, null, 2), 'utf8');
        const themeCssFile = path.join(themeDir, 'styles.css');
        if (!fs.existsSync(themeCssFile)) {
          fs.writeFileSync(themeCssFile, DEFAULT_THEME_CSS, 'utf8');
        }

        // 3. Musik- & Stream-Player Addon (Spotify / YouTube / Lokale MP3s)
        const musicDir = path.join(baseDir, 'MusikAddon');
        writeMusicAddonFiles(musicDir);
      } catch (err) {
        if (this.logger) this.logger.warn('Standard-Addons konnten nicht initialisiert werden.', { error: err.message });
      }
    }
  }

  getAddonsDirectory() {
    return this.primaryDir;
  }

  _readAddonFolder(addonFolder) {
    const manifestPath = path.join(addonFolder, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;

    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const id = sanitizeAddonId(raw.id || path.basename(addonFolder));
    const styleFile = raw.styleFile || 'styles.css';
    const stylePath = path.join(addonFolder, styleFile);
    const cssContent = fs.existsSync(stylePath) ? fs.readFileSync(stylePath, 'utf8') : (raw.css || '');

    let sidebar = null;
    if (raw.sidebar && typeof raw.sidebar === 'object') {
      const viewFile = raw.sidebar.viewFile || 'view.html';
      const scriptFile = raw.sidebar.scriptFile || 'script.js';
      const viewPath = path.join(addonFolder, viewFile);
      const scriptPath = path.join(addonFolder, scriptFile);
      sidebar = {
        label: String(raw.sidebar.label || raw.name || 'Addon').slice(0, 24),
        title: String(raw.sidebar.title || raw.name || 'Addon').slice(0, 80),
        subtitle: String(raw.sidebar.subtitle || raw.description || '').slice(0, 140),
        icon: String(raw.sidebar.icon || 'file-text'),
        template: raw.sidebar.template || (fs.existsSync(viewPath) ? 'custom' : 'notes'),
        keepAlive: Boolean(raw.sidebar.keepAlive),
        htmlContent: fs.existsSync(viewPath) ? fs.readFileSync(viewPath, 'utf8') : (raw.sidebar.html || ''),
        scriptContent: fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf8') : (raw.sidebar.script || '')
      };
    }

    // Wichtig: Addons sind standardmäßig immer deaktiviert (false) und müssen manuell aktiviert werden
    const enabled = Object.prototype.hasOwnProperty.call(this._state.enabled, id)
      ? Boolean(this._state.enabled[id])
      : false;

    const files = fs.readdirSync(addonFolder).filter((f) => {
      try { return fs.statSync(path.join(addonFolder, f)).isFile(); } catch { return false; }
    });

    return {
      id,
      name: String(raw.name || id).slice(0, 80),
      version: String(raw.version || '1.0.0').slice(0, 24),
      author: String(raw.author || 'Unbekannt').slice(0, 60),
      description: String(raw.description || '').slice(0, 350),
      type: ['tool', 'theme', 'hybrid'].includes(raw.type)
        ? raw.type
        : (sidebar && cssContent ? 'hybrid' : (sidebar ? 'tool' : 'theme')),
      permissions: Array.isArray(raw.permissions) ? raw.permissions.map(String) : [],
      files,
      enabled,
      folderPath: addonFolder,
      cssContent,
      sidebar
    };
  }

  _scanDirectory(dirPath, map) {
    if (!dirPath || !fs.existsSync(dirPath)) return;
    // Falls dirPath selbst direkt eine manifest.json besitzt (z. B. C:\Users\lucsc\OneDrive\Desktop\MusikAddon)
    if (fs.existsSync(path.join(dirPath, 'manifest.json'))) {
      try {
        const single = this._readAddonFolder(dirPath);
        if (single) map.set(single.id, single);
      } catch { /* ignore */ }
      return;
    }

    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const addonFolder = path.join(dirPath, entry.name);
      try {
        const item = this._readAddonFolder(addonFolder);
        if (item) map.set(item.id, item);
      } catch (err) {
        if (this.logger) this.logger.warn('Ungültiges Addon-Manifest übersprungen.', { folder: addonFolder, error: err.message });
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

  /**
   * Prüft einen Ordner oder eine manifest.json für das Custom-Installations-Fenster,
   * bevor die eigentliche Installation ausgeführt wird.
   */
  inspectFromPath(sourcePath) {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { ok: false, errors: ['Der angegebene Ordner oder Pfad existiert nicht.'] };
    }
    const stat = fs.statSync(sourcePath);
    const sourceDir = stat.isDirectory() ? sourcePath : path.dirname(sourcePath);
    const manifestFile = path.join(sourceDir, 'manifest.json');
    if (!fs.existsSync(manifestFile)) {
      return { ok: false, errors: ['In diesem Ordner wurde keine „manifest.json“ gefunden.'] };
    }
    try {
      const addon = this._readAddonFolder(sourceDir);
      if (!addon) return { ok: false, errors: ['Manifest konnte nicht gelesen werden.'] };
      const alreadyInstalled = this.list().some((a) => a.id === addon.id);
      return {
        ok: true,
        addon: {
          ...addon,
          sourceDir,
          targetDir: path.join(this.primaryDir, addon.id),
          alreadyInstalled
        }
      };
    } catch (err) {
      return { ok: false, errors: ['Ungültiges Addon-Manifest: ' + err.message] };
    }
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
    const targetFolder = path.join(this.primaryDir, id);
    fs.mkdirSync(targetFolder, { recursive: true });

    const hasSidebar = type === 'tool' || type === 'hybrid';
    const template = ['custom', 'music', 'notes'].includes(input.template) ? input.template : 'notes';

    if (template === 'music') {
      writeMusicAddonFiles(targetFolder);
      const customManifest = {
        ...MUSIC_ADDON_MANIFEST,
        id,
        name: name.slice(0, 80),
        author: String(input.author || 'Eigener Entwickler').trim() || 'Eigener Entwickler',
        description: String(input.description || MUSIC_ADDON_MANIFEST.description).trim(),
        sidebar: {
          ...MUSIC_ADDON_MANIFEST.sidebar,
          label: String(input.sidebarLabel || 'Musik').slice(0, 20),
          title: name.slice(0, 80),
          icon: String(input.sidebarIcon || 'music')
        }
      };
      fs.writeFileSync(path.join(targetFolder, 'manifest.json'), JSON.stringify(customManifest, null, 2), 'utf8');
      this._state.enabled[id] = false;
      this._saveState();
      return { ok: true, folderPath: targetFolder, addons: this.list() };
    }

    const manifest = {
      id,
      name: name.slice(0, 80),
      version: String(input.version || '1.0.0').trim() || '1.0.0',
      author: String(input.author || 'Eigener Entwickler').trim() || 'Eigener Entwickler',
      description: String(input.description || 'Eigenes SQL Hub Addon').trim(),
      type,
      enabledByDefault: false,
      styleFile: 'styles.css',
      permissions: hasSidebar ? ['sidebar', 'storage'] : ['theme-css']
    };

    if (hasSidebar) {
      manifest.sidebar = {
        label: String(input.sidebarLabel || name).slice(0, 20),
        title: String(input.sidebarTitle || name).slice(0, 80),
        subtitle: String(input.description || 'Eigenes Sidebar-Werkzeug unter SFTP').slice(0, 140),
        icon: String(input.sidebarIcon || 'file-text'),
        template: template === 'custom' ? 'custom' : 'notes',
        keepAlive: Boolean(input.keepAlive)
      };
      if (template === 'custom') {
        manifest.sidebar.viewFile = 'view.html';
        manifest.sidebar.scriptFile = 'script.js';
        const defaultHtml = input.customHtml || `<div class="panel">
  <h2>${name}</h2>
  <p class="panel__desc">${manifest.description}</p>
  <div class="field">
    <label>Eigene Notiz / Eingabe</label>
    <textarea id="addon-custom-text" class="input" rows="8" placeholder="Hier schreiben …"></textarea>
  </div>
  <button type="button" class="btn btn--primary" id="addon-custom-save">Eingabe speichern</button>
</div>`;
        const defaultJs = input.customJs || `(async () => {
  const ta = addonRoot.querySelector('#addon-custom-text');
  const btn = addonRoot.querySelector('#addon-custom-save');
  const stored = await addonApi.getStorage();
  if (ta && stored && stored.text) ta.value = stored.text;
  btn?.addEventListener('click', async () => {
    await addonApi.setStorage({ text: ta ? ta.value : '' });
    addonApi.toast('Gespeichert!', 'success');
  });
})();`;
        fs.writeFileSync(path.join(targetFolder, 'view.html'), defaultHtml, 'utf8');
        fs.writeFileSync(path.join(targetFolder, 'script.js'), defaultJs, 'utf8');
      }
    }

    const css = String(input.customCss || (type === 'theme'
      ? `/* Design-Regeln für ${name} */\n:root {\n  --primary: ${input.accentColor || '#3b82f6'} !important;\n}\n`
      : `/* Styles für ${name} */\n`));

    fs.writeFileSync(path.join(targetFolder, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    fs.writeFileSync(path.join(targetFolder, 'styles.css'), css, 'utf8');

    this._state.enabled[id] = false;
    this._saveState();

    return {
      ok: true,
      folderPath: targetFolder,
      addons: this.list()
    };
  }

  installFromPath(sourcePath) {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { ok: false, errors: ['Der ausgewählte Pfad existiert nicht.'] };
    }
    const stat = fs.statSync(sourcePath);
    const sourceDir = stat.isDirectory() ? sourcePath : path.dirname(sourcePath);
    const manifestFile = path.join(sourceDir, 'manifest.json');

    // Falls ein Sammel-Ordner gewählt wurde, der mehrere Addon-Unterordner mit manifest.json enthält
    if (!fs.existsSync(manifestFile)) {
      let subEntries = [];
      try {
        subEntries = fs.readdirSync(sourceDir, { withFileTypes: true });
      } catch { /* ignore */ }
      const subAddons = subEntries
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(sourceDir, e.name, 'manifest.json')))
        .map((e) => path.join(sourceDir, e.name));

      if (subAddons.length > 0) {
        let lastId = '';
        for (const subDir of subAddons) {
          const r = this.installFromPath(subDir);
          if (r && r.ok) lastId = r.id;
        }
        return {
          ok: true,
          id: lastId,
          folderPath: this.primaryDir,
          addons: this.list()
        };
      }

      return {
        ok: false,
        errors: ['Im gewählten Ordner wurde keine „manifest.json“-Datei gefunden.']
      };
    }

    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    } catch (err) {
      return { ok: false, errors: ['Die manifest.json ist ungültig: ' + err.message] };
    }

    const id = sanitizeAddonId(raw.id || path.basename(sourceDir));
    const destDir = path.join(this.primaryDir, id);

    if (path.resolve(sourceDir) !== path.resolve(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
      const files = fs.readdirSync(sourceDir, { withFileTypes: true });
      for (const f of files) {
        if (f.isFile()) {
          fs.copyFileSync(path.join(sourceDir, f.name), path.join(destDir, f.name));
        }
      }
    }

    // Standardmäßig beim Laden deaktiviert (Nutzer aktiviert Addons manuell per Schalter)
    if (!Object.prototype.hasOwnProperty.call(this._state.enabled, id)) {
      this._state.enabled[id] = false;
    }
    this._saveState();

    return {
      ok: true,
      id,
      folderPath: destDir,
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
