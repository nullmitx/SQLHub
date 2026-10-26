'use strict';

/**
 * SFTP-Host-Verwaltung & Dual-Pane SFTP-Dateitransfer (Termius-Stil).
 *
 * Arbeitet komplett ohne native C++-Abhängigkeiten (damit Cross-Plattform-Builds
 * auf Windows, macOS und Linux zuverlässig funktionieren):
 * - Speichert SFTP-Verbindungsprofile lokal (optional Tresor-verschlüsselt)
 *   und Passwörter im CredentialStore (`sftp:<id>`).
 * - Prüft SSH/SFTP-Server-Erreichbarkeit, Antwortzeit (ms) und Server-Banner
 *   direkt per TCP-Socket (`net.Socket`).
 * - Führt SFTP-Operationen (`ls -la`, `get`, `put`, `mkdir`, `rm`, `rmdir`, `rename`)
 *   über den systemweiten OpenSSH-`sftp`-Client inkl. automatischem `SSH_ASKPASS`-Helfer
 *   für Passwort- und Private-Key-Authentifizierung aus.
 */
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

function generateId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
}

function sanitizeHostInput(input = {}, existing = null) {
  const errors = [];
  const name = String(input.name ?? existing?.name ?? '').trim();
  const host = String(input.host ?? existing?.host ?? '').trim();
  const portRaw = input.port ?? existing?.port ?? 22;
  const port = Number(portRaw) || 22;
  const username = String(input.username ?? existing?.username ?? '').trim();
  const authType = ['password', 'key'].includes(input.authType || existing?.authType)
    ? (input.authType || existing?.authType)
    : 'password';
  const privateKeyPath = String(input.privateKeyPath ?? existing?.privateKeyPath ?? '').trim();
  const remotePath = String(input.remotePath ?? existing?.remotePath ?? '/').trim() || '/';
  const category = String(input.category ?? existing?.category ?? '').trim().slice(0, 60);
  const accentColor = String(input.accentColor ?? existing?.accentColor ?? '#e11d48').trim();
  const notes = String(input.notes ?? existing?.notes ?? '').trim().slice(0, 400);
  const favorite = Boolean(input.favorite ?? existing?.favorite ?? false);

  if (!name) errors.push('Bitte einen Namen für den SFTP-Host angeben.');
  if (!host) errors.push('Bitte eine Host-Adresse (IP oder Domain) angeben.');
  if (/[\s;&|`$<>]/.test(host)) errors.push('Die Host-Adresse enthält ungültige Sonderzeichen.');
  if (port < 1 || port > 65535) errors.push('Der Port muss zwischen 1 und 65535 liegen.');
  if (!username) errors.push('Bitte einen SSH/SFTP-Benutzernamen angeben.');
  if (/[\s;&|`$<>]/.test(username)) errors.push('Der Benutzername enthält ungültige Zeichen.');

  if (errors.length > 0) return { ok: false, errors };

  const now = new Date().toISOString();
  return {
    ok: true,
    record: {
      id: existing ? existing.id : generateId(),
      name: name.slice(0, 100),
      host: host.slice(0, 255),
      port,
      username: username.slice(0, 100),
      authType,
      privateKeyPath: privateKeyPath.slice(0, 500),
      remotePath: remotePath.startsWith('/') ? remotePath : '/' + remotePath,
      category,
      accentColor,
      notes,
      favorite,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      lastConnectedAt: existing ? existing.lastConnectedAt || null : null
    }
  };
}

/** Quotet einen Pfad für das OpenSSH sftp-Batch-Protokoll. */
function quoteSftpArg(p) {
  const clean = String(p || '').replace(/\\/g, '/');
  return `"${clean.replace(/"/g, '\\"')}"`;
}

/** Parst die Ausgabe von `ls -la` im SFTP-Batchmodus in strukturierte Einträge. */
function parseSftpLsOutput(stdout) {
  const lines = String(stdout || '').split(/\r?\n/);
  const entries = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('sftp>') || line.startsWith('total ')) continue;
    // Typisches Format: drwxr-xr-x    5 root     root         4096 Oct 25 18:20 var
    const match = line.match(/^([bcdlsp-][rwxstST-]{9}[+@.]?)\s+\d+\s+(\S+)\s+(\S+)\s+(\d+)\s+([A-Za-z]{3}\s+\d+\s+[\d:]+|\d{4}-\d{2}-\d{2}\s+[\d:]+)\s+(.+)$/);
    if (!match) continue;
    const [, perms, owner, group, sizeStr, dateStr, rawName] = match;
    let name = rawName.trim();
    let linkTarget = null;
    if (perms.startsWith('l') && name.includes(' -> ')) {
      const parts = name.split(' -> ');
      name = parts[0].trim();
      linkTarget = parts.slice(1).join(' -> ').trim();
    }
    // Falls sftp den Pfad voranstellt (z.B. /var/www/index.php), nur den Basisnamen nehmen
    const baseName = path.posix.basename(name);
    if (!baseName || baseName === '.' || baseName === '..') continue;
    const isDirectory = perms.startsWith('d');
    const isSymlink = perms.startsWith('l');
    entries.push({
      name: baseName,
      isDirectory,
      isSymlink,
      linkTarget,
      size: Number(sizeStr) || 0,
      permissions: perms,
      owner,
      group,
      modified: dateStr.trim()
    });
  }
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });
  });
  return entries;
}

class SftpManager {
  constructor({ file, credentialStore, codec, logger }) {
    this.file = file;
    this.credentialStore = credentialStore;
    this.codec = codec;
    this.logger = logger;
    this._hosts = [];
    this._load();
  }

  _load() {
    try {
      if (!this.file || !fs.existsSync(this.file)) {
        this._hosts = [];
        return;
      }
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = this.codec && this.codec.read ? this.codec.read(raw) : JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this._hosts = parsed;
      } else if (parsed && Array.isArray(parsed.hosts)) {
        this._hosts = parsed.hosts;
      } else {
        this._hosts = [];
      }
    } catch (err) {
      if (this.logger) this.logger.warn('SFTP-Hosts konnten nicht geladen werden.', { error: err.message });
      this._hosts = [];
    }
  }

  _save() {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const payload = { version: 1, hosts: this._hosts };
      const serialized = this.codec && this.codec.write
        ? this.codec.write(payload)
        : JSON.stringify(payload, null, 2);
      fs.writeFileSync(this.file, serialized, 'utf8');
    } catch (err) {
      if (this.logger) this.logger.error('SFTP-Hosts konnten nicht gespeichert werden.', { error: err.message });
    }
  }

  reload() {
    this._load();
  }

  resave() {
    this._save();
  }

  _credKey(id) {
    return `sftp:${id}`;
  }

  _decorate(host) {
    if (!host) return null;
    return {
      ...host,
      hasPassword: Boolean(this.credentialStore && this.credentialStore.has(this._credKey(host.id)))
    };
  }

  list() {
    return this._hosts.map((h) => this._decorate(h));
  }

  get(id) {
    const found = this._hosts.find((h) => h.id === id);
    return this._decorate(found || null);
  }

  create(input = {}) {
    const check = sanitizeHostInput(input, null);
    if (!check.ok) return check;
    this._hosts.push(check.record);
    this._save();
    if (input.password && this.credentialStore) {
      this.credentialStore.set(this._credKey(check.record.id), {
        username: check.record.username,
        password: String(input.password)
      });
    }
    return { ok: true, host: this._decorate(check.record) };
  }

  update(id, input = {}) {
    const idx = this._hosts.findIndex((h) => h.id === id);
    if (idx < 0) return { ok: false, errors: ['SFTP-Host wurde nicht gefunden.'] };
    const existing = this._hosts[idx];
    const check = sanitizeHostInput(input, existing);
    if (!check.ok) return check;
    this._hosts[idx] = check.record;
    this._save();
    if (typeof input.password === 'string' && input.password.length > 0 && this.credentialStore) {
      this.credentialStore.set(this._credKey(id), {
        username: check.record.username,
        password: input.password
      });
    } else if (input.clearPassword === true && this.credentialStore) {
      this.credentialStore.delete(this._credKey(id));
    }
    return { ok: true, host: this._decorate(check.record) };
  }

  delete(id) {
    const idx = this._hosts.findIndex((h) => h.id === id);
    if (idx < 0) return { ok: false, errors: ['SFTP-Host wurde nicht gefunden.'] };
    this._hosts.splice(idx, 1);
    this._save();
    if (this.credentialStore) {
      this.credentialStore.delete(this._credKey(id));
    }
    return { ok: true };
  }

  duplicate(id) {
    const existing = this._hosts.find((h) => h.id === id);
    if (!existing) return { ok: false, errors: ['SFTP-Host wurde nicht gefunden.'] };
    const copyInput = {
      ...existing,
      name: `${existing.name} (Kopie)`
    };
    const res = this.create(copyInput);
    if (res.ok && this.credentialStore && this.credentialStore.has(this._credKey(id))) {
      const creds = this.credentialStore.get(this._credKey(id));
      if (creds.ok && creds.credentials) {
        this.credentialStore.set(this._credKey(res.host.id), creds.credentials);
      }
    }
    return { ok: true, host: this.get(res.host.id) };
  }

  touchConnected(id) {
    const host = this._hosts.find((h) => h.id === id);
    if (!host) return;
    host.lastConnectedAt = new Date().toISOString();
    this._save();
  }

  /**
   * Prüft per TCP-Verbindung, ob der SSH/SFTP-Port erreichbar ist und liest das SSH-Server-Banner.
   */
  probeHost(hostAddress, port = 22, timeoutMs = 4500) {
    return new Promise((resolve) => {
      const start = Date.now();
      let settled = false;
      let banner = '';
      const socket = new net.Socket();

      const finish = (result) => {
        if (settled) return;
        settled = true;
        try { socket.destroy(); } catch { /* ignore */ }
        resolve(result);
      };

      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        const latencyMs = Date.now() - start;
        // Kurz auf SSH-2.0-Banner warten
        setTimeout(() => {
          finish({
            ok: true,
            online: true,
            latencyMs,
            banner: banner.trim() || 'SSH/SFTP Port offen'
          });
        }, 220);
      });

      socket.on('data', (chunk) => {
        banner += chunk.toString('utf8');
        if (banner.includes('\n')) {
          finish({
            ok: true,
            online: true,
            latencyMs: Date.now() - start,
            banner: banner.split(/\r?\n/)[0].trim().slice(0, 120)
          });
        }
      });

      socket.on('timeout', () => {
        finish({
          ok: true,
          online: false,
          latencyMs: Date.now() - start,
          error: 'Zeitüberschreitung (Timeout)'
        });
      });

      socket.on('error', (err) => {
        finish({
          ok: true,
          online: false,
          latencyMs: Date.now() - start,
          error: err.code || err.message || 'Verbindung fehlgeschlagen'
        });
      });

      try {
        socket.connect(Number(port) || 22, String(hostAddress).trim());
      } catch (err) {
        finish({
          ok: true,
          online: false,
          latencyMs: 0,
          error: err.message
        });
      }
    });
  }

  /* ------------------------ Lokales Dateisystem ------------------------ */

  getLocalQuickPaths() {
    const home = os.homedir();
    return {
      ok: true,
      home,
      desktop: path.join(home, 'Desktop'),
      downloads: path.join(home, 'Downloads'),
      documents: path.join(home, 'Documents')
    };
  }

  localList(targetDir) {
    const resolved = path.resolve(targetDir || os.homedir());
    if (!fs.existsSync(resolved)) {
      return { ok: false, errors: [`Lokaler Ordner existiert nicht: ${resolved}`] };
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { ok: false, errors: ['Der angegebene Pfad ist kein Ordner.'] };
    }
    const dirents = fs.readdirSync(resolved, { withFileTypes: true });
    const entries = [];
    for (const d of dirents) {
      if (d.name === '.' || d.name === '..') continue;
      const fullPath = path.join(resolved, d.name);
      let fstat = null;
      try {
        fstat = fs.statSync(fullPath);
      } catch {
        // Ignoriere gesperrte Systemdateien
        continue;
      }
      entries.push({
        name: d.name,
        path: fullPath,
        isDirectory: d.isDirectory(),
        isSymlink: d.isSymbolicLink(),
        size: fstat ? fstat.size : 0,
        modified: fstat ? fstat.mtime.toISOString() : null
      });
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });
    });
    return {
      ok: true,
      path: resolved,
      parentPath: path.dirname(resolved) !== resolved ? path.dirname(resolved) : null,
      entries
    };
  }

  localMkdir(parentDir, folderName) {
    const clean = String(folderName || '').trim();
    if (!clean || /[<>:"/\\|?*]/.test(clean)) {
      return { ok: false, errors: ['Ungültiger Ordnername.'] };
    }
    const target = path.join(path.resolve(parentDir || os.homedir()), clean);
    fs.mkdirSync(target, { recursive: true });
    return { ok: true, path: target };
  }

  localDelete(targetPath) {
    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) return { ok: false, errors: ['Datei oder Ordner nicht gefunden.'] };
    fs.rmSync(resolved, { recursive: true, force: false });
    return { ok: true };
  }

  localRename(oldPath, newName) {
    const clean = String(newName || '').trim();
    if (!clean || /[<>:"/\\|?*]/.test(clean)) {
      return { ok: false, errors: ['Ungültiger Dateiname.'] };
    }
    const resolvedOld = path.resolve(oldPath);
    const resolvedNew = path.join(path.dirname(resolvedOld), clean);
    fs.renameSync(resolvedOld, resolvedNew);
    return { ok: true, path: resolvedNew };
  }

  localReadFile(filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return { ok: false, errors: ['Datei nicht gefunden.'] };
    const stat = fs.statSync(resolved);
    if (stat.size > 2 * 1024 * 1024) {
      return { ok: false, errors: ['Datei ist zu groß für den integrierten Editor (max. 2 MB).'] };
    }
    const content = fs.readFileSync(resolved, 'utf8');
    return { ok: true, path: resolved, name: path.basename(resolved), size: stat.size, content };
  }

  localWriteFile(filePath, content) {
    const resolved = path.resolve(filePath);
    fs.writeFileSync(resolved, String(content ?? ''), 'utf8');
    return { ok: true, path: resolved };
  }

  /* ----------------------- Remote SFTP-Befehle ------------------------- */

  /**
   * Führt eine Liste von SFTP-Befehlen über den OpenSSH `sftp`-Client aus.
   * Falls für den Host ein Passwort gespeichert ist, wird ein temporäres
   * `SSH_ASKPASS`-Skript bereitgestellt, damit OpenSSH das Passwort ohne TTY akzeptiert.
   */
  _runSftpCommands(hostId, commands, timeoutMs = 20000) {
    return new Promise((resolve) => {
      const host = this._hosts.find((h) => h.id === hostId);
      if (!host) {
        resolve({ ok: false, errors: ['SFTP-Host wurde nicht gefunden.'] });
        return;
      }

      let password = '';
      if (this.credentialStore && this.credentialStore.has(this._credKey(hostId))) {
        const got = this.credentialStore.get(this._credKey(hostId));
        if (got.ok && got.credentials && got.credentials.password) {
          password = got.credentials.password;
        }
      }

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlhub-sftp-'));
      const batchFile = path.join(tmpDir, 'batch.sftp');
      fs.writeFileSync(batchFile, commands.join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });

      const env = { ...process.env };
      if (password) {
        env.SQLHUB_SSH_PASS = password;
        env.SSH_ASKPASS_REQUIRE = 'force';
        if (!env.DISPLAY) env.DISPLAY = 'sqlhub:0';

        if (process.platform === 'win32') {
          const askpassBat = path.join(tmpDir, 'askpass.bat');
          fs.writeFileSync(askpassBat, '@echo off\r\necho %SQLHUB_SSH_PASS%\r\n', { encoding: 'utf8' });
          env.SSH_ASKPASS = askpassBat;
        } else {
          const askpassSh = path.join(tmpDir, 'askpass.sh');
          fs.writeFileSync(askpassSh, '#!/bin/sh\nprintf "%s\\n" "$SQLHUB_SSH_PASS"\n', { encoding: 'utf8', mode: 0o700 });
          try { fs.chmodSync(askpassSh, 0o700); } catch { /* ignore */ }
          env.SSH_ASKPASS = askpassSh;
        }
      }

      const args = [
        '-P', String(host.port || 22),
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'ConnectTimeout=10',
        '-b', batchFile
      ];

      if (!password) {
        args.push('-o', 'BatchMode=yes');
      } else {
        args.push('-o', 'BatchMode=no');
        args.push('-o', 'PreferredAuthentications=publickey,keyboard-interactive,password');
      }

      if (host.authType === 'key' && host.privateKeyPath) {
        args.push('-i', host.privateKeyPath);
      }

      args.push(`${host.username}@${host.host}`);

      let stdout = '';
      let stderr = '';
      let finished = false;

      const cleanup = () => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      };

      const finish = (result) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(result);
      };

      let child;
      try {
        child = spawn('sftp', args, {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        });
      } catch (err) {
        finish({
          ok: false,
          errors: [`OpenSSH sftp-Client konnte nicht gestartet werden: ${err.message}`]
        });
        return;
      }

      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        finish({
          ok: false,
          errors: ['Zeitüberschreitung bei der SFTP-Verbindung (Server antwortet nicht).']
        });
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        finish({
          ok: false,
          errors: [`OpenSSH sftp-Fehler: ${err.message}`]
        });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          const cleanErr = stderr
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('Warning: Permanently added'))
            .join(' ');
          finish({
            ok: false,
            errors: [cleanErr || `SFTP-Vorgang fehlgeschlagen (Code ${code}).`]
          });
          return;
        }
        this.touchConnected(hostId);
        finish({ ok: true, stdout, stderr });
      });
    });
  }

  async remoteList(hostId, remoteDir) {
    const host = this._hosts.find((h) => h.id === hostId);
    if (!host) return { ok: false, errors: ['SFTP-Host wurde nicht gefunden.'] };
    const targetPath = String(remoteDir || host.remotePath || '/').replace(/\\/g, '/') || '/';
    const normalized = path.posix.normalize(targetPath.startsWith('/') ? targetPath : '/' + targetPath);

    const res = await this._runSftpCommands(hostId, [
      `cd ${quoteSftpArg(normalized)}`,
      'ls -la'
    ]);
    if (!res.ok) return res;

    const entries = parseSftpLsOutput(res.stdout).map((item) => ({
      ...item,
      path: path.posix.join(normalized, item.name)
    }));

    const parentPath = normalized !== '/' ? path.posix.dirname(normalized) : null;
    return {
      ok: true,
      path: normalized,
      parentPath,
      entries
    };
  }

  async remoteMkdir(hostId, parentRemoteDir, folderName) {
    const clean = String(folderName || '').trim();
    if (!clean || clean.includes('/')) {
      return { ok: false, errors: ['Ungültiger Remote-Ordnername.'] };
    }
    const target = path.posix.join(String(parentRemoteDir || '/'), clean);
    const res = await this._runSftpCommands(hostId, [`mkdir ${quoteSftpArg(target)}`]);
    if (!res.ok) return res;
    return { ok: true, path: target };
  }

  async remoteDelete(hostId, remotePath, isDirectory = false) {
    const cmd = isDirectory ? `rmdir ${quoteSftpArg(remotePath)}` : `rm ${quoteSftpArg(remotePath)}`;
    const res = await this._runSftpCommands(hostId, [cmd]);
    if (!res.ok) return res;
    return { ok: true };
  }

  async remoteRename(hostId, oldRemotePath, newName) {
    const clean = String(newName || '').trim();
    if (!clean || clean.includes('/')) {
      return { ok: false, errors: ['Ungültiger Dateiname.'] };
    }
    const parentDir = path.posix.dirname(String(oldRemotePath));
    const newRemotePath = path.posix.join(parentDir, clean);
    const res = await this._runSftpCommands(hostId, [
      `rename ${quoteSftpArg(oldRemotePath)} ${quoteSftpArg(newRemotePath)}`
    ]);
    if (!res.ok) return res;
    return { ok: true, path: newRemotePath };
  }

  async upload(hostId, localFilePath, remoteDir) {
    const resolvedLocal = path.resolve(localFilePath);
    if (!fs.existsSync(resolvedLocal)) {
      return { ok: false, errors: ['Lokale Datei wurde nicht gefunden.'] };
    }
    const stat = fs.statSync(resolvedLocal);
    const baseName = path.basename(resolvedLocal);
    const targetRemote = path.posix.join(String(remoteDir || '/'), baseName);
    const cmd = stat.isDirectory()
      ? `put -r ${quoteSftpArg(resolvedLocal)} ${quoteSftpArg(targetRemote)}`
      : `put ${quoteSftpArg(resolvedLocal)} ${quoteSftpArg(targetRemote)}`;
    const res = await this._runSftpCommands(hostId, [cmd], 60000);
    if (!res.ok) return res;
    return { ok: true, remotePath: targetRemote };
  }

  async download(hostId, remoteFilePath, localDir, isDirectory = false) {
    const resolvedLocalDir = path.resolve(localDir || os.homedir());
    fs.mkdirSync(resolvedLocalDir, { recursive: true });
    const baseName = path.posix.basename(String(remoteFilePath));
    const targetLocal = path.join(resolvedLocalDir, baseName);
    const cmd = isDirectory
      ? `get -r ${quoteSftpArg(remoteFilePath)} ${quoteSftpArg(targetLocal)}`
      : `get ${quoteSftpArg(remoteFilePath)} ${quoteSftpArg(targetLocal)}`;
    const res = await this._runSftpCommands(hostId, [cmd], 60000);
    if (!res.ok) return res;
    return { ok: true, localPath: targetLocal };
  }

  async remoteReadFile(hostId, remoteFilePath) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlhub-sftp-edit-'));
    const baseName = path.posix.basename(String(remoteFilePath));
    const tmpFile = path.join(tmpDir, baseName);
    try {
      const res = await this._runSftpCommands(hostId, [
        `get ${quoteSftpArg(remoteFilePath)} ${quoteSftpArg(tmpFile)}`
      ], 30000);
      if (!res.ok) return res;
      if (!fs.existsSync(tmpFile)) {
        return { ok: false, errors: ['Remote-Datei konnte nicht geladen werden.'] };
      }
      const stat = fs.statSync(tmpFile);
      if (stat.size > 2 * 1024 * 1024) {
        return { ok: false, errors: ['Remote-Datei ist zu groß für den Text-Editor (max. 2 MB).'] };
      }
      const content = fs.readFileSync(tmpFile, 'utf8');
      return { ok: true, path: remoteFilePath, name: baseName, size: stat.size, content };
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  async remoteWriteFile(hostId, remoteFilePath, content) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlhub-sftp-save-'));
    const baseName = path.posix.basename(String(remoteFilePath));
    const tmpFile = path.join(tmpDir, baseName);
    try {
      fs.writeFileSync(tmpFile, String(content ?? ''), 'utf8');
      const res = await this._runSftpCommands(hostId, [
        `put ${quoteSftpArg(tmpFile)} ${quoteSftpArg(remoteFilePath)}`
      ], 30000);
      if (!res.ok) return res;
      return { ok: true, path: remoteFilePath };
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

module.exports = { SftpManager, parseSftpLsOutput };

