# Translation / packaging (requires gettext-tools for i18n targets).
#
# Typical release flow (from repo root):
#   make -C build i18n-update-template   # after changing _() strings in code
#   make -C build i18n-sync-po           # merge new strings into po/*.po
#   edit po/de.po
#   make -C build pack-extension         # compile locales and create the zip

.PHONY: help i18n-update-template i18n-sync-po i18n-compile-locales i18n pack-extension

help:
	@echo "Targets:"
	@echo "  make -C build i18n-update-template   Regenerate po/*.pot from JS/UI sources"
	@echo "  make -C build i18n-sync-po           Merge template into po/*.po"
	@echo "  make -C build i18n-compile-locales   Compile po/*.po to locale/*/LC_MESSAGES/*.mo"
	@echo "  make -C build i18n                   i18n-update-template + i18n-sync-po (edit po/*.po, then pack-extension)"
	@echo "  make -C build pack-extension         Compile locales and pack $${uuid}-v$${version}.zip"

i18n-update-template:
	./i18n-update-template.sh

i18n-sync-po:
	./i18n-sync-po.sh

i18n-compile-locales:
	./i18n-compile-locales.sh

i18n: i18n-update-template i18n-sync-po
	@echo "Edit po/*.po, then run: make -C build pack-extension"

pack-extension: i18n-compile-locales
	./pack-extension.sh
