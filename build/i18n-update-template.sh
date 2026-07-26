#!/usr/bin/env bash
# Regenerate po/*.pot from JS/UI sources.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="yet-another-window-session-manager@github.com"
POT="${ROOT}/po/${DOMAIN}.pot"
METADATA="${ROOT}/metadata.json"

VERSION="$(grep -o '"version"[[:space:]]*:[[:space:]]*[0-9]*' "$METADATA" | grep -o '[0-9]*$')"

cd "$ROOT"

xgettext --from-code=UTF-8 \
  --no-wrap \
  --output="$POT" \
  --package-name="Yet Another Window Session Manager" \
  --package-version="$VERSION" \
  --msgid-bugs-address="https://github.com/mendres82/gnome-shell-extension-yet-another-window-session-manager/issues" \
  --copyright-holder="mendres82" \
  --keyword=_ --keyword=ngettext:1,2 --keyword=pgettext:1c,2 \
  --add-location=file \
  $(find . -name '*.js' -not -path './.git/*' -not -path './build/*') \
  ui/prefs-gtk4.ui

echo "Updated ${POT}"
echo "Next: ./build/i18n-sync-po.sh, then edit po/*.po, then ./build/i18n-compile-locales.sh"
