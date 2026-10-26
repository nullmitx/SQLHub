'use strict';

/**
 * Preload-Skript.
 *
 * Stellt dem Renderer eine BEGRENZTE, explizit aufgezählte API über den
 * contextBridge bereit. Es gibt keinen Zugriff auf Node, `require` oder
 * beliebige IPC-Kanäle – nur die hier definierten Funktionen.
 */
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = {
  profilesList: 'profiles:list',
  profilesGet: 'profiles:get',
  profilesCreate: 'profiles:create',
  profilesUpdate: 'profiles:update',
  profilesDelete: 'profiles:delete',
  profilesDuplicate: 'profiles:duplicate',
  profilesPickIcon: 'profiles:pick-icon',
  credentialsHas: 'credentials:has',
  credentialsReveal: 'credentials:reveal',
  credentialsListManager: 'credentials:list-manager',
  credentialsSave: 'credentials:save',
  credentialsDelete: 'credentials:delete',
  credentialsAvailable: 'credentials:available',
  profileSetLock: 'profile:set-lock',
  profileChangeLock: 'profile:change-lock',
  profileDisableLock: 'profile:disable-lock',
  profileUnlock: 'profile:unlock',
  profileLock: 'profile:lock',
  adminUnlock: 'admin:unlock',
  adminForceUnlockProfile: 'admin:force-unlock-profile',
  adminForceUnlockAllProfiles: 'admin:force-unlock-all-profiles',
  adminResetAllPasswords: 'admin:reset-all-passwords',
  adminResetVault: 'admin:reset-vault',
  vaultStatus: 'vault:status',
  vaultCreate: 'vault:create',
  vaultUnlock: 'vault:unlock',
  vaultLock: 'vault:lock',
  vaultChangePassword: 'vault:change-password',
  biometricsStatus: 'biometrics:status',
  biometricsEnrollVault: 'biometrics:enroll-vault',
  biometricsDisableVault: 'biometrics:disable-vault',
  biometricsUnlockVault: 'biometrics:unlock-vault',
  biometricsRevealCredentials: 'biometrics:reveal-credentials',
  biometricsListManager: 'biometrics:list-manager',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  sessionReset: 'session:reset',
  sessionResetAll: 'session:reset-all',
  statusCheck: 'status:check',
  browserOpen: 'browser:open',
  browserClose: 'browser:close',
  browserCloseAll: 'browser:close-all',
  browserSwitch: 'browser:switch',
  browserNavigate: 'browser:navigate',
  browserBack: 'browser:back',
  browserForward: 'browser:forward',
  browserReload: 'browser:reload',
  browserHome: 'browser:home',
  browserSetBounds: 'browser:set-bounds',
  browserSetVisible: 'browser:set-visible',
  browserRetryAutoLogin: 'browser:retry-autologin',
  browserAllowCertificate: 'browser:allow-certificate',
  appVersion: 'app:version',
  appCopyClipboard: 'app:copy-clipboard',
  appReadClipboard: 'app:read-clipboard',
  appInstallUpdate: 'app:install-update',
  appUninstall: 'app:uninstall',
  appExport: 'app:export-profiles',
  appImport: 'app:import-profiles',
  appLogError: 'app:log-error',
  appFileUrl: 'app:file-url',
  appPickBackground: 'app:pick-background',
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  sftpHostsList: 'sftp:hosts-list',
  sftpHostCreate: 'sftp:host-create',
  sftpHostUpdate: 'sftp:host-update',
  sftpHostDelete: 'sftp:host-delete',
  sftpHostDuplicate: 'sftp:host-duplicate',
  sftpProbe: 'sftp:probe',
  sftpPickKey: 'sftp:pick-key',
  sftpLocalQuickPaths: 'sftp:local-quickpaths',
  sftpLocalList: 'sftp:local-list',
  sftpLocalMkdir: 'sftp:local-mkdir',
  sftpLocalDelete: 'sftp:local-delete',
  sftpLocalRename: 'sftp:local-rename',
  sftpLocalRead: 'sftp:local-read',
  sftpLocalWrite: 'sftp:local-write',
  sftpRemoteList: 'sftp:remote-list',
  sftpRemoteMkdir: 'sftp:remote-mkdir',
  sftpRemoteDelete: 'sftp:remote-delete',
  sftpRemoteRename: 'sftp:remote-rename',
  sftpUpload: 'sftp:upload',
  sftpDownload: 'sftp:download',
  sftpRemoteRead: 'sftp:remote-read',
  sftpRemoteWrite: 'sftp:remote-write',
  addonsList: 'addons:list',
  addonsSetEnabled: 'addons:set-enabled',
  addonsCreate: 'addons:create',
  addonsInstallDialog: 'addons:install-dialog',
  addonsInspectDialog: 'addons:inspect-dialog',
  addonsInspectPath: 'addons:inspect-path',
  addonsInstallPath: 'addons:install-path',
  addonsDelete: 'addons:delete',
  addonsOpenFolder: 'addons:open-folder',
  addonsGetStorage: 'addons:get-storage',
  addonsSetStorage: 'addons:set-storage',
  addonsPickMediaFiles: 'addons:pick-media-files',
  addonsPickMediaFolder: 'addons:pick-media-folder'
};

/** Whitelist der Events, die vom Main-Prozess an den Renderer gehen dürfen. */
const EVENTS = new Set([
  'browser:state',
  'browser:tabs',
  'browser:cert-error',
  'profiles:changed',
  'sftp:changed',
  'addons:changed',
  'settings:changed',
  'vault:state',
  'vault:locked',
  'app:toast'
]);

function invoke(channel) {
  return (...args) => ipcRenderer.invoke(channel, ...args);
}

function on(channel, handler) {
  if (!EVENTS.has(channel)) {
    throw new Error('Unbekannter Event-Kanal.');
  }
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('sqlhub', {
  profiles: {
    list: invoke(INVOKE.profilesList),
    get: invoke(INVOKE.profilesGet),
    create: invoke(INVOKE.profilesCreate),
    update: invoke(INVOKE.profilesUpdate),
    remove: invoke(INVOKE.profilesDelete),
    duplicate: invoke(INVOKE.profilesDuplicate),
    pickIcon: invoke(INVOKE.profilesPickIcon)
  },
  credentials: {
    has: invoke(INVOKE.credentialsHas),
    reveal: invoke(INVOKE.credentialsReveal),
    listForManager: invoke(INVOKE.credentialsListManager),
    save: invoke(INVOKE.credentialsSave),
    remove: invoke(INVOKE.credentialsDelete),
    isAvailable: invoke(INVOKE.credentialsAvailable)
  },
  profileLock: {
    enable: invoke(INVOKE.profileSetLock),
    change: invoke(INVOKE.profileChangeLock),
    disable: invoke(INVOKE.profileDisableLock),
    unlock: invoke(INVOKE.profileUnlock),
    lock: invoke(INVOKE.profileLock)
  },
  admin: {
    unlock: invoke(INVOKE.adminUnlock),
    forceUnlockProfile: invoke(INVOKE.adminForceUnlockProfile),
    forceUnlockAllProfiles: invoke(INVOKE.adminForceUnlockAllProfiles),
    resetAllPasswords: invoke(INVOKE.adminResetAllPasswords),
    resetVault: invoke(INVOKE.adminResetVault)
  },
  vault: {
    status: invoke(INVOKE.vaultStatus),
    create: invoke(INVOKE.vaultCreate),
    unlock: invoke(INVOKE.vaultUnlock),
    lock: invoke(INVOKE.vaultLock),
    changePassword: invoke(INVOKE.vaultChangePassword)
  },
  biometrics: {
    status: invoke(INVOKE.biometricsStatus),
    enrollVault: invoke(INVOKE.biometricsEnrollVault),
    disableVault: invoke(INVOKE.biometricsDisableVault),
    unlockVault: invoke(INVOKE.biometricsUnlockVault),
    revealCredentials: invoke(INVOKE.biometricsRevealCredentials),
    listForManager: invoke(INVOKE.biometricsListManager)
  },
  settings: {
    get: invoke(INVOKE.settingsGet),
    set: invoke(INVOKE.settingsSet)
  },
  sessions: {
    reset: invoke(INVOKE.sessionReset),
    resetAll: invoke(INVOKE.sessionResetAll)
  },
  status: {
    check: invoke(INVOKE.statusCheck)
  },
  browser: {
    open: invoke(INVOKE.browserOpen),
    close: invoke(INVOKE.browserClose),
    closeAll: invoke(INVOKE.browserCloseAll),
    switchTo: invoke(INVOKE.browserSwitch),
    navigate: invoke(INVOKE.browserNavigate),
    back: invoke(INVOKE.browserBack),
    forward: invoke(INVOKE.browserForward),
    reload: invoke(INVOKE.browserReload),
    home: invoke(INVOKE.browserHome),
    setBounds: invoke(INVOKE.browserSetBounds),
    setVisible: invoke(INVOKE.browserSetVisible),
    retryAutoLogin: invoke(INVOKE.browserRetryAutoLogin),
    allowCertificateOnce: invoke(INVOKE.browserAllowCertificate)
  },
  app: {
    version: invoke(INVOKE.appVersion),
    copyClipboard: invoke(INVOKE.appCopyClipboard),
    readClipboard: invoke(INVOKE.appReadClipboard),
    installUpdate: invoke(INVOKE.appInstallUpdate),
    uninstall: invoke(INVOKE.appUninstall),
    exportProfiles: invoke(INVOKE.appExport),
    importProfiles: invoke(INVOKE.appImport),
    logError: invoke(INVOKE.appLogError),
    fileUrl: invoke(INVOKE.appFileUrl),
    pickBackground: invoke(INVOKE.appPickBackground)
  },
  window: {
    minimize: invoke(INVOKE.windowMinimize),
    maximize: invoke(INVOKE.windowMaximize),
    close: invoke(INVOKE.windowClose)
  },
  sftp: {
    listHosts: invoke(INVOKE.sftpHostsList),
    createHost: invoke(INVOKE.sftpHostCreate),
    updateHost: invoke(INVOKE.sftpHostUpdate),
    deleteHost: invoke(INVOKE.sftpHostDelete),
    duplicateHost: invoke(INVOKE.sftpHostDuplicate),
    probe: invoke(INVOKE.sftpProbe),
    pickKey: invoke(INVOKE.sftpPickKey),
    localQuickPaths: invoke(INVOKE.sftpLocalQuickPaths),
    localList: invoke(INVOKE.sftpLocalList),
    localMkdir: invoke(INVOKE.sftpLocalMkdir),
    localDelete: invoke(INVOKE.sftpLocalDelete),
    localRename: invoke(INVOKE.sftpLocalRename),
    localRead: invoke(INVOKE.sftpLocalRead),
    localWrite: invoke(INVOKE.sftpLocalWrite),
    remoteList: invoke(INVOKE.sftpRemoteList),
    remoteMkdir: invoke(INVOKE.sftpRemoteMkdir),
    remoteDelete: invoke(INVOKE.sftpRemoteDelete),
    remoteRename: invoke(INVOKE.sftpRemoteRename),
    upload: invoke(INVOKE.sftpUpload),
    download: invoke(INVOKE.sftpDownload),
    remoteRead: invoke(INVOKE.sftpRemoteRead),
    remoteWrite: invoke(INVOKE.sftpRemoteWrite)
  },
  addons: {
    list: invoke(INVOKE.addonsList),
    setEnabled: invoke(INVOKE.addonsSetEnabled),
    create: invoke(INVOKE.addonsCreate),
    installFromDialog: invoke(INVOKE.addonsInstallDialog),
    inspectFromDialog: invoke(INVOKE.addonsInspectDialog),
    inspectPath: invoke(INVOKE.addonsInspectPath),
    installPath: invoke(INVOKE.addonsInstallPath),
    remove: invoke(INVOKE.addonsDelete),
    openFolder: invoke(INVOKE.addonsOpenFolder),
    getStorage: invoke(INVOKE.addonsGetStorage),
    setStorage: invoke(INVOKE.addonsSetStorage),
    pickMediaFiles: invoke(INVOKE.addonsPickMediaFiles),
    pickMediaFolder: invoke(INVOKE.addonsPickMediaFolder)
  },
  events: {
    on
  }
});
