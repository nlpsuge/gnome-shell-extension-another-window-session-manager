#!/usr/bin/env bash
# Sync po/*.po with the current .pot template (msgmerge).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="yet-another-window-session-manager@github.com"
POT="${ROOT}/po/${DOMAIN}.pot"

if [ ! -f "$POT" ]; then
    echo "Template not found: ${POT}" >&2
    echo "Run ./build/i18n-update-template.sh first." >&2
    exit 1
fi

shopt -s nullglob
po_files=("$ROOT"/po/*.po)
if [ ${#po_files[@]} -eq 0 ]; then
    echo "No po/*.po files found." >&2
    exit 1
fi

for po in "${po_files[@]}"; do
    msgmerge --update --backup=none --no-wrap "$po" "$POT"
    echo "Synced $po with ${POT}"
done

echo "Next: edit po/*.po, then ./build/i18n-compile-locales.sh"
