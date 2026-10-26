# SQL Hub – Offizielles Handbuch zur Addon-Entwicklung (v2.4.3)

Willkommen im **SQL Hub Addon-System**!  
Mit Addons hast du in **SQL Hub** volle Freiheit: Du kannst eigene **Design-Themes** gestalten, neue **Werkzeuge unter `SFTP`** in die linke Seitenleiste einfügen oder sogar komplexe Multimedia-Apps wie einen **Musik-Player (Spotify-/YouTube-Stil)**, **Video-Player**, **Server-Monitor** oder **Notiz-Manager** bauen.

---

## Inhaltsverzeichnis

1. [Wo liegen die Addons?](#1-wo-liegen-die-addons)
2. [Aufbau eines Addon-Ordners](#2-aufbau-eines-addon-ordners)
3. [Die `manifest.json` im Detail (Alle Optionen)](#3-die-manifestjson-im-detail-alle-optionen)
4. [Die JavaScript-Schnittstelle `addonApi` (Volle Freiheit)](#4-die-javascript-schnittstelle-addonapi-volle-freiheit)
5. [Hintergrund-Wiedergabe (`keepAlive: true`) für Musik & Streams](#5-hintergrund-wiedergabe-keepalive-true-für-musik--streams)
6. [Tutorial 1: Eigenes Design- / Theme-Addon erstellen](#6-tutorial-1-eigenes-design---theme-addon-erstellen)
7. [Tutorial 2: Eigenes Sidebar-Werkzeug (z. B. Server-Checkliste) erstellen](#7-tutorial-2-eigenes-sidebar-werkzeug-z-b-server-checkliste-erstellen)
8. [Tutorial 3: Eigenen Musik-, Radio- & YouTube/Spotify-Player bauen](#8-tutorial-3-eigenen-musik--radio---youtube-spotify-player-bauen)
9. [Installation & Deinstallation über den Custom-Assistenten](#9-installation--deinstallation-über-den-custom-assistenten)

---

## 1. Wo liegen die Addons?

SQL Hub lädt alle Addons automatisch aus diesem Hauptordner:
```text
C:\Users\lucsc\OneDrive\Desktop\SQLHubAddons
```
Zusätzlich kannst du jeden beliebigen Ordner auf deinem PC (z. B. `C:\Users\lucsc\OneDrive\Desktop\MusikAddon`) direkt in SQL Hub über **Addons (über Tresor) → Addon installieren** mit dem **Custom-Installations-Assistenten** prüfen und installieren.

---

## 2. Aufbau eines Addon-Ordners

Jedes Addon ist ein eigener Unterordner und besteht aus bis zu **4 einfachen Dateien**:

```text
MeinEigenesAddon/
├── manifest.json     (Pflicht: Name, Version, Icon, Typ & Einstellungen)
├── styles.css        (Optional: Eigene CSS-Styles für deine Ansicht oder das gesamte App-Design)
├── view.html         (Optional: Dein eigenes HTML-Layout für die Seite unter SFTP)
└── script.js         (Optional: Dein eigener JavaScript-Code für Musik, Buttons, API, Speicher usw.)
```

---

## 3. Die `manifest.json` im Detail (Alle Optionen)

```json
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
```

### Erklärung der wichtigsten Felder:
- **`type`**:
  - `"tool"`: Fügt ein neues Icon direkt **unter `SFTP`** in der linken Seitenleiste hinzu.
  - `"theme"`: Verändert das Design / die Farben der gesamten App über `styles.css`.
  - `"hybrid"`: Kombiniert ein eigenes Sidebar-Icon unter `SFTP` mit globalem App-Design.
- **`sidebar.icon`**: Name des Icons in der Seitenleiste. Verfügbare Icons:
  - `"music"` (Musiknote), `"file-text"` (Notiz), `"terminal"` (Konsole), `"clipboard"` (Klemmbrett), `"gamepad-2"` (Controller), `"rocket"` (Rakete), `"bot"` (Bot), `"sparkles"` (Sterne), `"layers"` (Ebenen), `"wrench"` (Werkzeug), `"globe"` (Weltkugel), `"database"` (Datenbank), `"server"` (Server), `"cloud"` (Cloud).
- **`sidebar.template`**:
  - `"custom"`: Lädt deine eigene `view.html` und führt deine `script.js` aus (volle Freiheit für Musik-Player, Videos, Iframes, Canvas, eigene Formulare!).
  - `"notes"`: Nutzt das fertige Notizen- & SQL-Snippet-System von SQL Hub.
- **`sidebar.keepAlive`** (`true` / `false`):
  - Wenn `true` gesetzt ist, bleibt deine Addon-Seite im Hintergrund aktiv, wenn du zu `Start`, `Instanzen`, `Sitzungen` oder `SFTP` wechselst. **Perfekt für Musik-Player, Radio-Streams oder Timer, damit die Musik ohne Unterbrechung weiterläuft!**

---

## 4. Die JavaScript-Schnittstelle `addonApi` (Volle Freiheit)

Wenn du `"template": "custom"` nutzt, bekommt deine `script.js` automatisch zwei Objekte übergeben:
1. **`addonRoot`**: Das DOM-Element (`HTMLElement`) deiner Addon-Seite (`addonRoot.querySelector(...)`).
2. **`addonApi`**: Das mächtige SQL Hub Addon-SDK mit folgenden Funktionen:

| Methode | Beschreibung |
| :--- | :--- |
| `await addonApi.getStorage()` | Lädt dein dauerhaft gespeichertes JSON-Objekt (z. B. Playlists, Notizen, Lautstärke). |
| `await addonApi.setStorage(obj)` | Speichert beliebige JSON-Daten dauerhaft für dein Addon. |
| `await addonApi.pickMediaFiles()` | Öffnet den Dateidialog für Audio-/Videodateien (`.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, `.mp4`, `.webm`) und gibt `[{ name, path, fileUrl, size }]` zurück. |
| `await addonApi.pickMediaFolder()` | Öffnet einen Ordnerdialog, durchsucht ihn nach Musik-/Videodateien und gibt `{ folderPath, tracks: [...] }` zurück. |
| `addonApi.setMiniPlayer(config)` | Zeigt unten rechts in SQL Hub eine schwebende Mini-Player-Leiste an, während man in anderen Ansichten arbeitet (`{ active: true, title, subtitle, playing, onToggle, onNext, onOpen }`). |
| `addonApi.toast(msg, type, title)` | Zeigt eine Benachrichtigung an (`type`: `'info'`, `'success'`, `'warning'`, `'error'`). |
| `await addonApi.copyClipboard(text)` | Kopiert Text direkt in die Zwischenablage. |
| `await addonApi.getProfiles()` | Liefert die Liste aller gespeicherten Datenbank-Instanzen. |
| `addonApi.navigate(viewName)` | Wechselt zu einer anderen Ansicht (`'dashboard'`, `'profiles'`, `'sftp'`, `'addons'`). |

---

## 5. Hintergrund-Wiedergabe (`keepAlive: true`) für Musik & Streams

Dank `"keepAlive": true` in der `manifest.json` wird der DOM-Container deines Addons beim Wechsel auf `Start` oder `SFTP` **nicht zerstört**, sondern nur unsichtbar geschaltet. Dadurch laufen:
- HTML5 `<audio>` und `<video>` Elemente,
- Web-Audio-API Visualizer & Synthesizer,
- sowie eingebettete `<iframe>`-Player (YouTube / Spotify / SoundCloud)
**unterbrechungsfrei im Hintergrund weiter!**

---

## 6. Tutorial 1: Eigenes Design- / Theme-Addon erstellen

Erstelle einen Ordner `SQLHubAddons/mein-cyber-theme/` mit:

### `manifest.json`
```json
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
```

### `styles.css`
```css
:root {
  --primary: #8b5cf6 !important;
  --primary-hover: #7c3aed !important;
  --accent: #06b6d4 !important;
  --bg-app: #090812 !important;
  --surface: #121024 !important;
}
```

---

## 7. Tutorial 2: Eigenes Sidebar-Werkzeug (z. B. Server-Checkliste) erstellen

Erstelle einen Ordner `SQLHubAddons/server-checkliste/` mit `manifest.json`, `view.html` und `script.js`:

### `view.html`
```html
<div class="panel">
  <h2>Meine Server-Checkliste</h2>
  <p class="panel__desc">Wichtige Schritte vor jedem Datenbank-Update:</p>
  <textarea id="cl-input" class="input" rows="8" placeholder="Aufgaben eintragen …"></textarea>
  <div style="margin-top:12px;">
    <button type="button" class="btn btn--primary" id="cl-save">Speichern</button>
  </div>
</div>
```

### `script.js`
```js
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
```

---

## 8. Tutorial 3: Eigenen Musik-, Radio- & YouTube/Spotify-Player bauen

Ein vollständiges, sofort einsatzbereites Referenz-Projekt findest du direkt auf deinem Desktop unter:
- `C:\Users\lucsc\OneDrive\Desktop\MusikAddon`
- sowie installiert unter `C:\Users\lucsc\OneDrive\Desktop\SQLHubAddons\MusikAddon`

Dort siehst du im echten Code (`manifest.json`, `styles.css`, `view.html`, `script.js`), wie man:
1. Lokale Audiodateien (`.mp3`, `.wav`, `.flac`, `.mp4`) und ganze Musik-Ordner lädt,
2. Live-Radio-Streams und einen Web-Audio-Synthesizer mit **28-Band-Canvas-Equalizer** abspielt,
3. **YouTube-Videos/Playlists** und **Spotify-Links** direkt einbettet,
4. und über `addonApi.setMiniPlayer(...)` eine schwebende Mini-Player-Steuerung in SQL Hub einblendet!

---

## 9. Installation & Deinstallation über den Custom-Assistenten

1. Öffne in SQL Hub links unten **`Addons`** (direkt über `Tresor`).
2. Klicke oben rechts auf **`Addon installieren`**, um das **Custom-Installations-Fenster** zu öffnen.
3. Wähle deinen Addon-Ordner (z. B. `C:\Users\lucsc\OneDrive\Desktop\MusikAddon`), prüfe die Berechtigungen & Dateien in der Vorschau und klicke auf **Jetzt installieren**.
4. Zum Entfernen klickst du bei einem Addon auf **`Deinstallieren`** – im **Custom-Deinstallations-Fenster** kannst du auswählen, ob auch die gespeicherten Addon-Daten bereinigt werden sollen.
