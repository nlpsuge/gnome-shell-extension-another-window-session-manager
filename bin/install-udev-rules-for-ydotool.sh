#!/usr/bin/env bash
# $1: FileUtils.desktop_template_path_ydotool_uinput_rules
# $2: FileUtils.system_udev_rules_path_ydotool_uinput_rules

cp "$1" "$2" && chmod 644 "$2"

