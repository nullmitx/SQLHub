'use strict';

/**
 * Erreichbarkeitsprüfung für phpMyAdmin-Adressen (Statusanzeige auf den Karten).
 * Nutzt das Electron-Netzwerkmodul (Proxy-Einstellungen des Systems).
 */
const { net } = require('electron');
const { BROWSER } = require('./config');

/**
 * @param {string} url
 * @returns {Promise<{ reachable: boolean, status?: number, latencyMs: number, isPhpMyAdmin?: boolean, error?: string }>}
 */
function checkStatus(url, timeoutMs = BROWSER.statusTimeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve({ latencyMs: Date.now() - started, ...result });
    };

    let request;
    try {
      request = net.request({ url, method: 'GET' });
    } catch (err) {
      finish({ reachable: false, error: err.message });
      return;
    }

    const timer = setTimeout(() => {
      request.abort();
      finish({ reachable: false, error: 'Zeitüberschreitung bei der Prüfung.' });
    }, timeoutMs);

    request.on('response', (response) => {
      let looksLikePhpMyAdmin = false;
      let consumed = 0;
      response.on('data', (chunk) => {
        if (looksLikePhpMyAdmin || consumed > 64 * 1024) return;
        consumed += chunk.length;
        const head = chunk.toString('utf8').toLowerCase();
        if (head.includes('phpmyadmin') || head.includes('pma_') ||
            head.includes('pmahomme') || head.includes('gettoken')) {
          looksLikePhpMyAdmin = true;
        }
      });
      const done = () => {
        clearTimeout(timer);
        // 401/403 sind erreichbar – der Server verlangt nur eine Anmeldung.
        const reachable = response.statusCode >= 200 && response.statusCode < 600;
        finish({
          reachable,
          status: response.statusCode,
          isPhpMyAdmin: looksLikePhpMyAdmin || undefined
        });
      };
      response.on('data', () => {});
      response.on('end', done);
      response.on('error', done);
    });

    request.on('error', (err) => {
      clearTimeout(timer);
      finish({ reachable: false, error: err.message });
    });

    request.end();
  });
}

module.exports = { checkStatus };
