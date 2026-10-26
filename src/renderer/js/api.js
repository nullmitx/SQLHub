// api.js – dünne Hülle um die über den Preload bereitgestellte API

const bridge = window.sqlhub;

if (!bridge) {
  // Sollte nie passieren (Preload fehlt) – verhindert aber stille Fehler.
  // eslint-disable-next-line no-console
  console.error('SQL Hub: Preload-API nicht verfügbar.');
}

export const api = bridge;
export const events = bridge ? bridge.events : { on: () => () => {} };

/**
 * Wirft bei `{ ok:false }`-Antworten einen Fehler und gibt sonst das Ergebnis
 * zurück. Abbrüche (z. B. Dialog geschlossen) werden an `onCancel` gemeldet.
 */
export function unwrap(result, onCancel) {
  if (!result) return null;
  if (result.canceled) {
    if (typeof onCancel === 'function') onCancel();
    return null;
  }
  if (result.ok === false) {
    const message = Array.isArray(result.errors)
      ? result.errors.join(' ')
      : result.errors || 'Unbekannter Fehler.';
    throw new Error(message);
  }
  return result;
}
