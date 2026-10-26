# Anleitung: SQL Hub auf GitHub hochladen (Schritt für Schritt)

Diese Anleitung erklärt dir Schritt für Schritt, wie du **SQL Hub (v2.4.2)** als Open-Source-Projekt auf **GitHub** veröffentlichst – wahlweise bequem per **GitHub Desktop (ohne Terminal)** oder per **Git-Befehlszeile (PowerShell / Terminal)** – sowie wie du einen fertigen **Download-Release (`.exe` & `.tar.gz`)** erstellst.

---

## Sicherheitscheck vor dem Upload (Bereits vorbereitet!)

Die Datei [`.gitignore`](file:///c:/Users/lucsc/OneDrive/Desktop/PHPPanel/.gitignore) im Projekt ist bereits so eingerichtet, dass **keine privaten Daten, Passwörter, lokalen Profile oder großen `node_modules/`-Ordner** hochgeladen werden:
- `node_modules/` und `dist/` werden automatisch ignoriert.
- Lokale Profile (`profiles.json`, `sftp-hosts.json`, `credentials.json`, `vault.json`) liegen im geschützten Betriebssystem-Ordner (`%APPDATA%\sql-hub`) und **nicht** im Projektordner.

---

## Weg A: Über die Git-Befehlszeile (PowerShell / Terminal – Empfohlen)

### 1. Neues Repository auf GitHub anlegen
1. Öffne [https://github.com/new](https://github.com/new) im Browser und melde dich an.
2. Trage unter **Repository name** z. B. `SQL-Hub` (oder `sql-hub`) ein.
3. Wähle **Public** (für Open Source) oder **Private**.
4. **Wichtig:** Setze **keinen** Haken bei *„Add a README file“*, *„Add .gitignore“* oder *„Choose a license“* (da diese Dateien bereits fertig im Projekt liegen!).
5. Klicke auf **Create repository**.

### 2. Projektordner mit Git verbinden & hochladen
Öffne **PowerShell** im Projektordner `C:\Users\lucsc\OneDrive\Desktop\PHPPanel` und führe diese Befehle nacheinander aus:

```powershell
# 1. In den Projektordner wechseln
cd "C:\Users\lucsc\OneDrive\Desktop\PHPPanel"

# 2. Git-Repository initialisieren
git init

# 3. Haupt-Branch auf "main" setzen
git branch -M main

# 4. Alle Projektdateien vormerken (node_modules & dist werden dank .gitignore übersprungen)
git add .

# 5. Ersten Commit erstellen
git commit -m "Release SQL Hub v2.4.2 (Launcher UI, SFTP-Client, Addon-System & Cross-Platform)"

# 6. Mit deinem GitHub-Repository verknüpfen (ersetze DEIN_NAME durch deinen GitHub-Nutzernamen!)
git remote add origin https://github.com/DEIN_NAME/SQL-Hub.git

# 7. Code zu GitHub hochladen
git push -u origin main
```

---

## Weg B: Ohne Befehle mit GitHub Desktop (Grafische Oberfläche)

Falls du lieber ohne Befehle arbeitest:
1. Lade [GitHub Desktop](https://desktop.github.com/) herunter und melde dich mit deinem GitHub-Konto an.
2. Klicke oben links auf **File → Add local repository…**
3. Wähle den Ordner `C:\Users\lucsc\OneDrive\Desktop\PHPPanel` aus.
   - Falls GitHub Desktop meldet *„This directory does not appear to be a Git repository“*, klicke einfach auf den blauen Link **create a repository** direkt im Dialog.
4. Unten links siehst du das Feld **Summary**: Trage dort z. B. `SQL Hub v2.4.2 Release` ein und klicke auf **Commit to main**.
5. Klicke oben auf **Publish repository**:
   - Name: `SQL-Hub`
   - Nimm den Haken bei *„Keep this code private“* heraus, wenn das Projekt für alle öffentlich (Open Source) sein soll.
   - Klicke auf **Publish Repository**.

---

## Schritt 3: Fertige Installer (`.exe` & Linux `.tar.gz`) als GitHub Release veröffentlichen

Da der Ordner `dist/` nicht in den Quellcode gehört, lädst du ausführbare Installer auf GitHub unter **Releases** hoch, damit Nutzer die App direkt herunterladen können:

1. Öffne dein Repository auf GitHub im Browser.
2. Klicke rechts in der Seitenleiste auf **Releases** → **Create a new release** (oder **Draft a new release**).
3. Klicke auf **Choose a tag**, tippe `v2.4.2` ein und klicke auf **+ Create new tag: v2.4.2 on publish**.
4. Als **Release title** trägst du ein: `SQL Hub v2.4.2 – Pixel-Launcher, Termius SFTP & Addon-System`.
5. Ziehe per Drag & Drop folgende Dateien aus deinem lokalen Ordner `C:\Users\lucsc\OneDrive\Desktop\PHPPanel\dist\` in das Feld **Attach binaries by dropping them here**:
   - `SQL Hub-Setup-2.4.2.exe` (Windows Setup-Installer)
   - `SQL Hub-2.4.2-linux-x64.tar.gz` (Linux Paket)
6. Klicke unten auf den grünen Button **Publish release**.

---

## Spätere Updates hochladen (Wenn du etwas am Code änderst)

Wenn du später Änderungen am Projekt vornimmst und diese zu GitHub schicken möchtest, genügen diese 3 Befehle in PowerShell:

```powershell
git add .
git commit -m "Update: Beschreibung deiner Änderung"
git push
```

