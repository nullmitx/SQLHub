; SQL Hub – Custom NSIS Installations-, Update- und Deinstallations-Assistent
; Stellt sicher, dass bei einer bereits vorhandenen Installation das laufende Programm
; sauber geschlossen und die vorhandene Installation unter Beibehaltung aller
; Benutzerdaten (%APPDATA%\sql-hub) nahtlos aktualisiert wird.
; Beim Deinstallieren fragt ein eigener Assistent, ob lokale Profile & Tresor-Daten
; behalten oder restlos entfernt werden sollen.

!macro customHeader
  BrandingText "SQL Hub Setup & Paket-Assistent v2.4.4"
!macroend

!macro customInit
  ; Falls bereits eine Installation existiert, übernimm automatisch deren Zielpfad
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation"
  ${If} $R0 != ""
    StrCpy $INSTDIR $R0
  ${EndIf}
!macroend

!macro customInstall
  ; Schreibe den aktuellen Installationspfad für zukünftige Updates
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation" "$INSTDIR"
!macroend

!macro customUnInstall
  ; Custom Deinstallations-Abfrage für Benutzerdaten & Tresor
  MessageBox MB_YESNO|MB_ICONQUESTION "SQL Hub Deinstallations-Assistent:$\r$\n$\r$\nMöchtest du deine gespeicherten Datenbank-Profile, SFTP-Server, den Passwort-Tresor und Einstellungen BEHALTEN (empfohlen für spätere Neuinstallationen)?$\r$\n$\r$\n• Klicke auf [JA], um deine Profile & Tresor-Daten zu behalten.$\r$\n• Klicke auf [NEIN], um alle Benutzerdaten in %APPDATA%\sql-hub restlos zu löschen." IDYES KeepUserData
    RMDir /r "$APPDATA\sql-hub"
    RMDir /r "$LOCALAPPDATA\sql-hub-updater"
  KeepUserData:
!macroend


