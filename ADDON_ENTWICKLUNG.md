# SQL Hub – Offizielles Handbuch zur Addon-Entwicklung (1-Datei-System `meinaddon.js`)

Mit dem **SQL Hub Single-File Addon-System (ab v2.4.4)** brauchst du **keine 3 oder 4 einzelnen Dateien** mehr!
Ein komplettes Addon – egal ob **Design-Theme**, **Sidebar-Werkzeug unter SFTP** oder ein ausgewachsener **Musik-, Radio-, YouTube- & Spotify-Player** – besteht aus **einer einzigen JavaScript-Datei**, z. B. **`meinaddon.js`**.

---

## 1. Wie erstelle und installiere ich ein Addon? (In 3 Schritten)

1. **Datei in VS Code erstellen**:
   Öffne Visual Studio Code (oder einen beliebigen Texteditor) und erstelle **eine einzige Datei**, z. B. `meinaddon.js`.
2. **Code einfügen & speichern**:
   Schreibe dein Addon als `export default { ... }` (siehe Vorlagen unten) in `meinaddon.js` und speichere die Datei.
3. **In SQL Hub auswählen & aktivieren**:
   - Öffne **SQL Hub** und klicke links unten (über `Tresor`) auf **`Addons`**.
   - Klicke oben auf **`+ Addon hinzufügen (.js wählen)`** und wähle deine Datei `meinaddon.js` aus.
   - Das Addon wird sofort installiert. Da alle Addons aus Sicherheitsgründen **standardmäßig deaktiviert** sind, schaltest du es einfach rechts auf der Karte per Schalter ein!

---

## 2. Aufbau einer `meinaddon.js` Datei

Alles (Metadaten, CSS-Styles, HTML-Ansicht und JavaScript-Logik) steht übersichtlich in **einer einzigen `.js`-Datei**:

```javascript
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
  styles: `
    .mein-addon-card {
      padding: 18px;
      background: var(--surface);
      border: 1px solid var(--border-strong);
      border-left: 3px solid var(--primary);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  `,

  // 4. EIGENE HTML-OBERFLÄCHE (für type: 'tool' oder 'hybrid')
  html: `
    <div class="mein-addon-card">
      <h2>Willkommen in meinem eigenen Addon!</h2>
      <p class="muted">Dieser Bereich kommt komplett aus einer einzigen Datei (meinaddon.js).</p>
      <textarea id="my-note" class="input" rows="6" placeholder="Schreibe hier etwas hinein ..."></textarea>
      <div>
        <button type="button" class="btn btn--primary" id="my-save-btn">Speichern</button>
      </div>
    </div>
  `,

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
```

---

## 3. Die `addonApi`-Schnittstelle (Alle Befehle in `mount(addonRoot, addonApi)`)

In der Funktion `async mount(addonRoot, addonApi)` stehen dir folgende Helfer zur Verfügung:

| Methode / Eigenschaft | Beschreibung |
| :--- | :--- |
| `addonRoot` | Das DOM-Element deines Addon-Fensters (`addonRoot.querySelector('#...')`). |
| `await addonApi.getStorage()` | Lädt das dauerhaft gespeicherte JSON-Objekt deines Addons. |
| `await addonApi.setStorage(obj)` | Speichert beliebige Daten (Notizen, Playlists, Einstellungen) dauerhaft auf der Festplatte. |
| `await addonApi.pickMediaFiles()` | Öffnet den Dateidialog für lokale Audio-/Videodateien (`.mp3`, `.wav`, `.flac`, `.ogg`, `.mp4`) und liefert `[{ name, path, fileUrl, size }]`. |
| `await addonApi.pickMediaFolder()` | Öffnet einen Ordnerdialog und liest alle enthaltenen Musik-/Videodateien auf einmal ein. |
| `addonApi.setMiniPlayer({ active, title, subtitle, playing, onToggle, onNext })` | Blendet unten rechts den schwebenden **Mini-Player** ein, wenn der Nutzer auf eine andere Seite wechselt. |
| `await addonApi.copyClipboard(text)` | Kopiert Text (z. B. ein SQL-Snippet) in die Zwischenablage. |
| `await addonApi.getProfiles()` | Gibt die Liste aller gespeicherten Datenbank-Instanzen zurück. |
| `addonApi.navigate(viewName)` | Wechselt zu einer anderen Ansicht (`'dashboard'`, `'profiles'`, `'sftp'`, `'addons'`). |
| `addonApi.toast(msg, type, title)` | Zeigt eine Benachrichtigung an (`type`: `'info'`, `'success'`, `'warning'`, `'error'`). |

---

## 4. Beispiel 2: Reines Design- / Theme-Addon in einer Datei (`mein-theme.js`)

Wenn du nur die Farben, Hintergründe oder Buttons von SQL Hub verändern möchtest, reicht schon eine kurze `.js`-Datei:

```javascript
// mein-theme.js – Smaragdgrünes Cyber-Theme in einer einzigen Datei
export default {
  id: 'emerald-matrix-theme',
  name: 'Emerald Pixel Theme',
  version: '1.1.0',
  author: 'SQL Hub Studio',
  description: 'Verwandelt SQL Hub in ein smaragdgrünes Matrix-/Cyber-Launcher-Design.',
  type: 'theme',
  styles: `
    :root {
      --primary: #10b981 !important;
      --primary-hover: #059669 !important;
      --primary-soft: rgba(16, 185, 129, 0.16) !important;
      --accent: #06b6d4 !important;
    }
  `
};
```

---

## 5. Beispiel 3: Musik-, Radio- & YouTube-Player Addon (`musik-player-addon.js`)

Im Ordner `SQLHubAddons` liegt die Datei **`musik-player-addon.js`** als vollständiges Referenz-Beispiel in einer einzigen Datei:
- **Spotify-Stil Audio-Deck** mit Live-Internet-Radio, Offline-WebAudio-Synthesizer und lokalem MP3/WAV/FLAC-Import
- **YouTube & Spotify Player** (inkl. Umschalter zwischen *Kompakt-Embed*, *YouTube Voll-Player für VEVO/Radio-Mixe* und *YouTube Music*)
- **Hintergrund-Wiedergabe (`keepAlive: true`)** + schwebender Mini-Player beim Wechseln auf andere SQL Hub Seiten.
