# SQL Hub – Ausführliche Installationsanleitung für macOS & Linux

Diese Anleitung beschreibt Schritt für Schritt, wie du **SQL Hub Studio (v2.4.4)** auf **macOS** (Intel & Apple Silicon M1/M2/M3/M4) sowie auf **allen Linux-Distributionen** (Ubuntu, Debian, Linux Mint, Pop!_OS, Fedora, RHEL, openSUSE, Arch Linux, Manjaro u. v. m.) installierst, startest, aktualisierst und wieder deinstallierst.

---

## Inhaltsverzeichnis

1. [Installation auf macOS (Intel & Apple Silicon M1–M4)](#1-installation-auf-macos-intel--apple-silicon-m1m4)
   - [Methode A: Automatischer Ein-Klick-Installer (`install-macos.command`) – Empfohlen](#methode-a-automatischer-ein-klick-installer-install-macoscommand--empfohlen)
   - [Methode B: Installation über `.dmg` / `.pkg` / `.zip` Paket](#methode-b-installation-über-dmg--pkg--zip-paket)
   - [macOS Gatekeeper („App kann nicht geöffnet werden“) freigeben](#macos-gatekeeper-app-kann-nicht-geöffnet-werden-freigeben)
   - [Apple Touch ID (Fingerabdruck) aktivieren](#apple-touch-id-fingerabdruck-aktivieren)
   - [Speicherort der Daten & Deinstallation unter macOS](#speicherort-der-daten--deinstallation-unter-macos)
2. [Installation auf Linux (Alle Distributionen)](#2-installation-auf-linux-alle-distributionen)
   - [Methode A: Universeller Linux-Installer (`install-linux.sh`) – Für alle Distros empfohlen](#methode-a-universeller-linux-installer-install-linuxsh--für-alle-distros-empfohlen)
   - [Methode B: Direktstart über das fertige `.tar.gz`-Paket aus `dist/`](#methode-b-direktstart-über-das-fertige-targz-paket-aus-dist)
   - [Methode C: Native Distributions-Pakete (`.deb`, `.rpm`, `.AppImage`, `.pacman`)](#methode-c-native-distributions-pakete-deb-rpm-appimage-pacman)
   - [Hinweis zur Chromium-Sandbox unter Ubuntu 24.04+ / Debian](#hinweis-zur-chromium-sandbox-unter-ubuntu-2404--debian)
   - [Speicherort der Daten & Deinstallation unter Linux](#speicherort-der-daten--deinstallation-unter-linux)
3. [In-Place-Updates auf macOS & Linux](#3-in-place-updates-auf-macos--linux)

---

## 1. Installation auf macOS (Intel & Apple Silicon M1–M4)

SQL Hub unterstützt sowohl Macs mit **Apple Silicon (`arm64`: M1, M2, M3, M4)** als auch **Intel-Macs (`x64`)** inklusive nativer Integration in den **macOS Schlüsselbund (Keychain)** und **Apple Touch ID**.

### Methode A: Automatischer Ein-Klick-Installer (`install-macos.command`) – Empfohlen

Im Projektordner befindet sich das Skript `scripts/install-macos.command`. Es übernimmt automatisch folgende Schritte:
- Falls bereits ein fertiges `SQL Hub.app`-Bundle im Ordner `dist/` liegt, kopiert es dieses direkt nach `/Applications/SQL Hub.app`.
- Falls noch kein App-Bundle vorliegt, prüft es Node.js/npm, installiert bei Bedarf die Abhängigkeiten und baut `SQL Hub.app` passend für deinen Mac-Prozessor (`arm64` oder `x64`).
- Entfernt automatisch das macOS-Quarantäne-Attribut (`com.apple.quarantine`), damit macOS die App ohne Sicherheitsblockade startet.

**So führst du den Installer im Terminal aus:**

```bash
# 1. In den SQL Hub Ordner wechseln
cd /Pfad/zu/PHPPanel

# 2. Skript ausführbar machen und starten
chmod +x scripts/install-macos.command
bash scripts/install-macos.command
```

> **Alternativ per Doppelklick im Finder:** Öffne im Finder den Ordner `scripts/` und doppelklicke auf `install-macos.command`.

Nach Abschluss findest du **SQL Hub** direkt im **Launchpad**, im Ordner **Programme (`/Applications/SQL Hub.app`)** sowie über die **Spotlight-Suche (`⌘ Cmd + Leertaste`)**.

---

### Methode B: Installation über `.dmg` / `.pkg` / `.zip` Paket

Wenn du auf deinem Mac eigene Release-Installationsdateien (`.dmg`, `.pkg` oder `.zip`) erzeugen möchtest:

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. macOS-Pakete (DMG, PKG, ZIP) bauen
npm run dist:mac
```

Die fertigen Dateien liegen anschließend im Ordner `dist/`:
- `SQL Hub-2.4.4-arm64.dmg` (für Apple Silicon M1–M4) bzw. `SQL Hub-2.4.4-x64.dmg` (für Intel)
- Öffne die `.dmg`-Datei per Doppelklick und ziehe **SQL Hub.app** in den Ordner **Applications (Programme)**.

---

### macOS Gatekeeper („App kann nicht geöffnet werden“) freigeben

Falls macOS beim ersten Öffnen einer lokal gebauten App meldet, dass der Entwickler nicht verifiziert werden kann, führe einmalig diesen Befehl im Terminal aus:

```bash
xattr -cr "/Applications/SQL Hub.app"
```

Danach startet **SQL Hub** jederzeit sofort per Klick.

---

### Apple Touch ID (Fingerabdruck) aktivieren

1. Starte **SQL Hub** auf deinem Mac.
2. Öffne links unten **Einstellungen** → **App-Schutz & Sicherheit**.
3. Richte (falls noch nicht geschehen) ein **Hauptpasswort** ein.
4. Aktiviere den Schalter **Schnell-Entsperrung mit Apple Touch ID**.
5. Ab sofort kannst du den Sperrbildschirm und den **Passwort-Manager** direkt per Fingerabdruck entsperren.

---

### Speicherort der Daten & Deinstallation unter macOS

- **Benutzerdaten & verschlüsselte Profile:**
  `~/Library/Application Support/SQL Hub/`
- **App deinstallieren:**
  ```bash
  rm -rf "/Applications/SQL Hub.app"
  ```

---

## 2. Installation auf Linux (Alle Distributionen)

SQL Hub läuft auf **allen gängigen Linux-Distributionen** (Ubuntu, Debian, Linux Mint, Pop!_OS, Fedora, RHEL, CentOS, openSUSE, Arch Linux, Manjaro, EndeavourOS, Kali Linux u. a.).
Sollte auf deinem System kein grafischer Schlüsselbund (`gnome-keyring` / `kwallet`) aktiv sein, nutzt SQL Hub automatisch einen **hardwaregebundenen AES-256-GCM-Schlüsselbund-Fallback** (`machine-id`), sodass Passwörter auch auf Minimal- oder Server-Desktops sicher verschlüsselt werden.

---

### Methode A: Universeller Linux-Installer (`install-linux.sh`) – Für alle Distros empfohlen

Das mitgelieferte Skript `scripts/install-linux.sh` funktioniert unabhängig vom Paketmanager auf **jeder Linux-Distribution**. Es installiert SQL Hub sauber in dein Benutzerverzeichnis (`~/.local/opt/sql-hub`), legt den Terminal-Befehl `sql-hub` (`~/.local/bin/sql-hub`) an und erstellt einen **Desktop-Starter mit App-Icon** im Anwendungsmenü (GNOME, KDE Plasma, XFCE, Cinnamon usw.).

```bash
# 1. In den SQL Hub Ordner wechseln
cd /Pfad/zu/PHPPanel

# 2. Universal-Installer ausführbar machen und starten
chmod +x scripts/install-linux.sh
bash scripts/install-linux.sh
```

**Was das Skript automatisch erkennt:**
- Wenn im Ordner `dist/` bereits das Archiv `dist/SQL Hub-2.4.4-linux-x64.tar.gz` liegt, entpackt und installiert es dieses **sofort ohne Kompilierung** (keine Node.js-Installation nötig!).
- Falls `dist/` leer ist, nutzt es automatisch deine lokale Node.js/npm-Umgebung, um die App einzurichten.

Nach der Installation kannst du SQL Hub starten:
- Über dein **Anwendungsmenü / App-Starter** (suche nach **SQL Hub**)
- Oder jederzeit im Terminal mit:
  ```bash
  sql-hub
  ```

---

### Methode B: Direktstart über das fertige `.tar.gz`-Paket aus `dist/`

Im Ordner `dist/` liegt bereits das fertig gebaute, universelle Linux-Paket `SQL Hub-2.4.4-linux-x64.tar.gz`. Du kannst es auf jedem 64-Bit-Linux-System direkt entpacken und starten:

```bash
# 1. Archiv entpacken
tar -xzf "dist/SQL Hub-2.4.4-linux-x64.tar.gz"

# 2. Direkt starten (--no-sandbox für Ubuntu 24.04+ / restriktive User-Namespaces)
./SQL\ Hub-2.4.4-linux-x64/sql-hub --no-sandbox
```

---

### Methode C: Native Distributions-Pakete (`.deb`, `.rpm`, `.AppImage`, `.pacman`)

Wenn du auf einem Linux-System eigene Distributionspakete bauen möchtest, führe folgenden Befehl aus:

```bash
npm install
npm run dist:linux
```

Anschließend kannst du das passende Paket für deine Distribution installieren:

#### Ubuntu / Debian / Linux Mint / Pop!_OS (`.deb`)
```bash
sudo apt install ./dist/SQL\ Hub-2.4.4-linux-x86_64.deb
```

#### Fedora / RHEL / openSUSE (`.rpm`)
```bash
sudo dnf install ./dist/SQL\ Hub-2.4.4-linux-x86_64.rpm
# oder unter openSUSE:
sudo zypper install ./dist/SQL\ Hub-2.4.4-linux-x86_64.rpm
```

#### Arch Linux / Manjaro (`.pacman`)
```bash
sudo pacman -U ./dist/SQL\ Hub-2.4.4-linux-x64.pacman
```

#### Universelles AppImage (alle Linux-Systeme ohne Installation)
```bash
chmod +x ./dist/SQL\ Hub-2.4.4-linux-x86_64.AppImage
./dist/SQL\ Hub-2.4.4-linux-x86_64.AppImage --no-sandbox
```

---

### Hinweis zur Chromium-Sandbox unter Ubuntu 24.04+ / Debian

Neuere Linux-Distributionen (insbesondere Ubuntu 24.04 LTS und neuer) beschränken unprivilegierte User-Namespaces durch AppArmor.
- Der Universal-Installer (`bash scripts/install-linux.sh`) prüft dies beim Start automatisch und übergibt bei Bedarf `--no-sandbox`.
- Alternativ kannst du der `chrome-sandbox`-Datei korrekte Root-SUID-Rechte geben:
  ```bash
  sudo chown root:root ~/.local/opt/sql-hub/chrome-sandbox
  sudo chmod 4755 ~/.local/opt/sql-hub/chrome-sandbox
  ```

---

### Speicherort der Daten & Deinstallation unter Linux

- **Benutzerdaten & verschlüsselte Profile:**
  `~/.config/SQL Hub/`
- **Deinstallation (bei Installation über `install-linux.sh`):**
  ```bash
  rm -rf ~/.local/opt/sql-hub \
         ~/.local/bin/sql-hub \
         ~/.local/share/applications/sql-hub.desktop \
         ~/.local/share/icons/hicolor/256x256/apps/sql-hub.png
  ```
  *(Deine gespeicherten Profile unter `~/.config/SQL Hub/` bleiben dabei erhalten, sofern du den Ordner nicht manuell löschst.)*

---

## 3. In-Place-Updates auf macOS & Linux

Wenn du eine neue Version von SQL Hub herunterlädst:
1. Öffne in der laufenden App **Einstellungen** → **Backup, Import & App-Update** (oder **Über SQL Hub**) und klicke auf **App-Update installieren**, **oder**
2. Führe einfach erneut `bash scripts/install-macos.command` (macOS) bzw. `bash scripts/install-linux.sh` (Linux) aus.

Alle deine Datenbankprofile, Passwörter, Browser-Sitzungen und Design-Einstellungen bleiben beim Update zu **100 % erhalten**.

