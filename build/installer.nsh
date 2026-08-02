; Relay custom NSIS polish
!macro customHeader
  !system "echo Building Relay installer..."
!macroend

!macro customWelcomePage
  ; Keep electron-builder default welcome page (uses installerSidebar.bmp)
!macroend

!macro customInstall
  DetailPrint "Installing Relay — local-first API client"
!macroend

!macro customUnInstall
  DetailPrint "Removing Relay application files"
!macroend
