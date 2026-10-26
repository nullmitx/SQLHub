'use strict';

/**
 * Minimaler, sicherer Logger.
 * Schreibt niemals Passwörter oder andere Geheimnisse.
 * Ohne Electron-Abhängigkeit – in Tests mit eigenem Sink nutzbar.
 */
const fs = require('fs');
const path = require('path');
const { redactSecrets } = require('./validators');

class SecureLogger {
  /**
   * @param {{ logFile?: string|null, echo?: boolean }} [options]
   */
  constructor(options = {}) {
    this.logFile = options.logFile || null;
    this.echo = options.echo === true;
  }

  setLogFile(filePath) {
    this.logFile = filePath;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    } catch {
      /* egal */
    }
  }

  _write(level, message, meta) {
    const time = new Date().toISOString();
    let line = `[${time}] [${level}] ${message}`;
    if (meta && typeof meta === 'object') {
      try {
        line += ` ${JSON.stringify(redactSecrets(meta))}`;
      } catch {
        line += ' [meta nicht serialisierbar]';
      }
    }
    if (this.echo) {
      // eslint-disable-next-line no-console
      console[level === 'error' ? 'error' : 'log'](line);
    }
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, line + '\n', 'utf8');
      } catch {
        /* Logging darf nie crashen */
      }
    }
  }

  info(message, meta) {
    this._write('info', message, meta);
  }

  warn(message, meta) {
    this._write('warn', message, meta);
  }

  error(message, meta) {
    this._write('error', message, meta);
  }
}

module.exports = { SecureLogger };
