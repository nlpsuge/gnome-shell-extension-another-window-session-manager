#!/usr/bin/env bash
# Compile po/*.po into locale/*/LC_MESSAGES/*.mo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="yet-another-window-session-manager@github.com"

shopt -s nullglob
po_files=("$ROOT"/po/*.po)
if [ ${#po_files[@]} -eq 0 ]; then
    echo "No po/*.po files found." >&2
    exit 1
fi

for po in "${po_files[@]}"; do
    lang="$(basename "$po" .po)"
    outdir="$ROOT/locale/$lang/LC_MESSAGES"
    mkdir -p "$outdir"
    msgfmt -c -o "$outdir/$DOMAIN.mo" "$po"
    echo "Compiled $po -> $outdir/$DOMAIN.mo"
done
