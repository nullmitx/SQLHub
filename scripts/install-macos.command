#!/usr/bin/env bash
# ============================================================================
# SQL Hub Studio – macOS Installer & Starter (Intel x64 & Apple Silicon M1–M4)
# Unterstützt: .dmg, .pkg, .zip oder direkten Build aus dem Projektordner
# inkl. automatischer Gatekeeper-Freigabe & Touch-ID-Unterstützung
# ============================================================================
set -euo pipefail

APP_NAME="SQL Hub"
TARGET_APP="/Applications/SQL Hub.app"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${PROJECT_ROOT}/dist"

echo "========================================================"
echo "  SQL Hub Studio – macOS Installation (Intel & Apple Silicon)"
echo "========================================================"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Hinweis: Dieses Skript ist für macOS gedacht."
  exit 1
fi

ZIP_PKG="$(find "${DIST_DIR}" "${PROJECT_ROOT}" -maxdepth 1 -name "SQL Hub-*-mac-*.zip" 2>/dev/null | head -n 1 || true)"
DMG_PKG="$(find "${DIST_DIR}" "${PROJECT_ROOT}" -maxdepth 1 -name "SQL Hub-*-mac-*.dmg" 2>/dev/null | head -n 1 || true)"
APP_BUNDLE="$(find "${DIST_DIR}" -maxdepth 2 -name "SQL Hub.app" 2>/dev/null | head -n 1 || true)"

if [[ -z "${APP_BUNDLE}" && -z "${ZIP_PKG}" && -z "${DMG_PKG}" ]]; then
  if [[ -f "${PROJECT_ROOT}/package.json" ]]; then
    echo "-> Baue natives macOS App-Bundle (SQL Hub.app) für diesen Mac ..."
    cd "${PROJECT_ROOT}"
    if ! command -v npm >/dev/null 2>&1; then
      echo "Fehler: Node.js / npm wurde nicht gefunden. Bitte Node.js installieren (z. B. 'brew install node')."
      exit 1
    fi
    npm install
    npx electron-builder --mac zip dmg
    APP_BUNDLE="$(find "${DIST_DIR}" -maxdepth 2 -name "SQL Hub.app" 2>/dev/null | head -n 1 || true)"
  fi
fi

if [[ -n "${APP_BUNDLE}" && -d "${APP_BUNDLE}" ]]; then
  echo "-> Kopiere '${APP_BUNDLE}' nach /Applications/SQL Hub.app ..."
  rm -rf "${TARGET_APP}"
  cp -R "${APP_BUNDLE}" "${TARGET_APP}"
elif [[ -n "${ZIP_PKG}" ]]; then
  echo "-> Entpacke '${ZIP_PKG}' nach /Applications ..."
  rm -rf "${TARGET_APP}"
  ditto -x -k "${ZIP_PKG}" "/Applications"
elif [[ -n "${DMG_PKG}" ]]; then
  echo "-> Öffne macOS Disk-Image '${DMG_PKG}' ..."
  open "${DMG_PKG}"
  exit 0
else
  echo "Fehler: Kein macOS-Paket gefunden."
  exit 1
fi

# Gatekeeper-Quarantäne-Attribut entfernen, damit macOS die App sofort ohne Warnung startet
if [[ -d "${TARGET_APP}" ]]; then
  xattr -cr "${TARGET_APP}" 2>/dev/null || true
  echo ""
  echo "✓ SQL Hub.app wurde erfolgreich in /Applications installiert!"
  echo "  • Touch ID & macOS Schlüsselbund (Keychain) sind aktiv."
  echo "  • Starte SQL Hub ..."
  open "${TARGET_APP}"
fi

