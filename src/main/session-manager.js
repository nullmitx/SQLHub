'use strict';

/**
 * Session-Verwaltung: getrennte, persistente Browser-Sitzungen pro Profil.
 *
 * Jedes Profil erhält eine eigene Electron-Session-Partition
 * (`persist:sqlhub-<id>`). Dadurch bleiben Cookies und Logins der einzelnen
 * phpMyAdmin-Instanzen voneinander getrennt und überleben App-Neustarts.
 */
const { session } = require('electron');
const { partitionForProfile } = require('./config');

class SessionManager {
  /** @param {{ logger?: object }} [options] */
  constructor(options = {}) {
    this.logger = options.logger || { info() {}, warn() {}, error() {} };
  }

  partitionFor(profileId) {
    return partitionForProfile(profileId);
  }

  getSessionFor(profileId) {
    return session.fromPartition(this.partitionFor(profileId));
  }

  /**
   * Setzt die Sitzung eines Profils vollständig zurück
   * (Cookies, localStorage, Cache, IndexedDB …).
   */
  async clearProfile(profileId) {
    const sess = this.getSessionFor(profileId);
    await sess.clearStorageData();
    await sess.clearCache();
    this.logger.info('Sitzung zurückgesetzt.', { profileId });
  }

  /** Setzt alle übergebenen Profil-Sitzungen zurück. */
  async clearAll(profileIds) {
    let count = 0;
    for (const id of profileIds) {
      await this.clearProfile(id);
      count += 1;
    }
    return count;
  }
}

module.exports = { SessionManager };
