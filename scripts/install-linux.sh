#!/usr/bin/env bash
# ============================================================================
# SQL Hub Studio – Universal Linux Installer (alle Distributionen)
# Unterstützt: Ubuntu, Debian, Linux Mint, Pop!_OS, Fedora, RHEL, openSUSE,
#              Arch Linux, Manjaro, EndeavourOS, Kali Linux u. v. m.
# ============================================================================
set -euo pipefail

APP_NAME="SQL Hub"
APP_ID="sql-hub"
INSTALL_DIR="${HOME}/.local/share/sql-hub"
BIN_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons/hicolor/256x256/apps"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${PROJECT_ROOT}/dist"

echo "========================================================"
echo "  SQL Hub Studio – Linux Installation"
echo "========================================================"

mkdir -p "${INSTALL_DIR}" "${BIN_DIR}" "${DESKTOP_DIR}" "${ICON_DIR}"

# 1. Prüfen, ob ein fertig gepacktes Linux-Paket im dist/-Ordner oder aktuellen Ordner liegt
DEB_PKG="$(find "${DIST_DIR}" "${PROJECT_ROOT}" -maxdepth 1 -name "SQL Hub-*-linux-*.deb" 2>/dev/null | head -n 1 || true)"
RPM_PKG="$(find "${DIST_DIR}" "${PROJECT_ROOT}" -maxdepth 1 -name "SQL Hub-*-linux-*.rpm" 2>/dev/null | head -n 1 || true)"
APPIMAGE_PKG="$(find "${DIST_DIR}" "${PROJECT_ROOT}" -maxdepth 1 -name "SQL Hub-*-linux-*.AppImage" 2>/dev/null | head -n 1 || true)"
TAR_PKG="$(find "${DIST_DIR}" "${PROJECT_ROOT}" -maxdepth 1 -name "SQL Hub-*-linux-*.tar.gz" 2>/dev/null | head -n 1 || true)"

if [[ -n "${DEB_PKG}" ]] && command -v apt-get >/dev/null 2>&1 && [[ "${SQLHUB_PORTABLE_INSTALL:-0}" != "1" ]]; then
  echo "-> Debian/Ubuntu-Paket gefunden: ${DEB_PKG}"
  echo "   Installiere über sudo apt install ..."
  sudo apt install -y "${DEB_PKG}" && {
    echo "✓ SQL Hub wurde systemweit installiert! Starte mit: sql-hub"
    exit 0
  }
fi

if [[ -n "${RPM_PKG}" ]] && command -v dnf >/dev/null 2>&1 && [[ "${SQLHUB_PORTABLE_INSTALL:-0}" != "1" ]]; then
  echo "-> Fedora/RHEL RPM-Paket gefunden: ${RPM_PKG}"
  echo "   Installiere über sudo dnf install ..."
  sudo dnf install -y "${RPM_PKG}" && {
    echo "✓ SQL Hub wurde systemweit installiert! Starte mit: sql-hub"
    exit 0
  }
fi

if [[ -n "${APPIMAGE_PKG}" ]]; then
  echo "-> AppImage gefunden: ${APPIMAGE_PKG}"
  cp -f "${APPIMAGE_PKG}" "${INSTALL_DIR}/SQL-Hub.AppImage"
  chmod +x "${INSTALL_DIR}/SQL-Hub.AppImage"
  cat > "${BIN_DIR}/sql-hub" <<EOF
#!/usr/bin/env bash
exec "${INSTALL_DIR}/SQL-Hub.AppImage" --no-sandbox "\$@"
EOF
  chmod +x "${BIN_DIR}/sql-hub"
elif [[ -n "${TAR_PKG}" ]]; then
  echo "-> Entpacke Linux-Archiv: ${TAR_PKG} nach ${INSTALL_DIR} ..."
  rm -rf "${INSTALL_DIR:?}"/*
  tar -xzf "${TAR_PKG}" -C "${INSTALL_DIR}" --strip-components=1
  chmod +x "${INSTALL_DIR}/sql-hub" || true
  if [[ -f "${INSTALL_DIR}/chrome-sandbox" ]]; then
    chmod 4755 "${INSTALL_DIR}/chrome-sandbox" 2>/dev/null || true
  fi
  cat > "${BIN_DIR}/sql-hub" <<EOF
#!/usr/bin/env bash
exec "${INSTALL_DIR}/sql-hub" --no-sandbox "\$@"
EOF
  chmod +x "${BIN_DIR}/sql-hub"
elif [[ -d "${DIST_DIR}/linux-unpacked" ]]; then
  echo "-> Kopiere linux-unpacked nach ${INSTALL_DIR} ..."
  rm -rf "${INSTALL_DIR:?}"/*
  cp -a "${DIST_DIR}/linux-unpacked/." "${INSTALL_DIR}/"
  chmod +x "${INSTALL_DIR}/sql-hub" || true
  cat > "${BIN_DIR}/sql-hub" <<EOF
#!/usr/bin/env bash
exec "${INSTALL_DIR}/sql-hub" --no-sandbox "\$@"
EOF
  chmod +x "${BIN_DIR}/sql-hub"
elif [[ -f "${PROJECT_ROOT}/package.json" ]]; then
  echo "-> Baue Linux-Paket direkt aus dem Quellcode ..."
  cd "${PROJECT_ROOT}"
  if ! command -v npm >/dev/null 2>&1; then
    echo "Fehler: Node.js / npm ist nicht installiert. Bitte nutze das fertige .tar.gz / .AppImage Paket aus dist/."
    exit 1
  fi
  npm install
  npx electron-builder --linux tar.gz
  NEW_TAR="$(find "${DIST_DIR}" -maxdepth 1 -name "SQL Hub-*-linux-*.tar.gz" 2>/dev/null | head -n 1 || true)"
  if [[ -n "${NEW_TAR}" ]]; then
    rm -rf "${INSTALL_DIR:?}"/*
    tar -xzf "${NEW_TAR}" -C "${INSTALL_DIR}" --strip-components=1
    chmod +x "${INSTALL_DIR}/sql-hub" || true
    cat > "${BIN_DIR}/sql-hub" <<EOF
#!/usr/bin/env bash
exec "${INSTALL_DIR}/sql-hub" --no-sandbox "\$@"
EOF
    chmod +x "${BIN_DIR}/sql-hub"
  fi
else
  echo "Fehler: Keine SQL Hub Installationsdateien gefunden."
  exit 1
fi

# 2. App-Icon und Desktop-Starter (.desktop) für GNOME, KDE, XFCE, Cinnamon etc. anlegen
if [[ -f "${PROJECT_ROOT}/src/assets/icon.png" ]]; then
  cp -f "${PROJECT_ROOT}/src/assets/icon.png" "${ICON_DIR}/sql-hub.png"
fi

cat > "${DESKTOP_DIR}/sql-hub.desktop" <<EOF
[Desktop Entry]
Name=SQL Hub
Comment=Studio-Verwaltung für phpMyAdmin- und Datenbank-Profile
Exec=${BIN_DIR}/sql-hub %U
Icon=sql-hub
Terminal=false
Type=Application
Categories=Development;Database;
StartupWMClass=SQL Hub
EOF

chmod +x "${DESKTOP_DIR}/sql-hub.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "${DESKTOP_DIR}" 2>/dev/null || true

echo ""
echo "✓ SQL Hub wurde erfolgreich unter Linux installiert!"
echo "  • Programmmenü: Suche nach 'SQL Hub' in deinem Anwendungsmenü"
echo "  • Terminal-Start: ${BIN_DIR}/sql-hub"
echo ""

