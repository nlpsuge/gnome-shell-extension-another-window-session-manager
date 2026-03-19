#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Packing extension..."
gnome-extensions pack --force --out-dir=. \
    --extra-source=closeSession.js \
    --extra-source=constants.js \
    --extra-source=indicator.js \
    --extra-source=moveSession.js \
    --extra-source=openWindowsTracker.js \
    --extra-source=prefsCloseWindow.js \
    --extra-source=prefsColumnView.js \
    --extra-source=prefsWidgets.js \
    --extra-source=prefsWindowPickableEntry.js \
    --extra-source=restoreSession.js \
    --extra-source=saveSession.js \
    --extra-source=windowTilingSupport.js \
    --extra-source=dbus-interfaces \
    --extra-source=icons \
    --extra-source=model \
    --extra-source=template \
    --extra-source=ui \
    --extra-source=utils

echo "Installing..."
gnome-extensions install --force ./another-window-session-manager@gmail.com.shell-extension.zip

echo "Done. Run your nested session with:"
echo "  dbus-run-session bash -c 'gsettings set org.gnome.shell enabled-extensions \"[\\\"another-window-session-manager@gmail.com\\\"]\" && gnome-shell --devkit --wayland'"
