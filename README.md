# gnome-shell-extension-yet-another-window-session-manager
Close open windows gracefully and save them as a session. And you can restore them when necessary manually or automatically at startup.

Most importantly, it supports both X11 and Wayland!

This extension is based on several [Gnome technologies](https://www.gnome.org/technologies/) and APIs including [Meta](https://gjs-docs.gnome.org/meta9~9_api), [Shell](https://gjs-docs.gnome.org/shell01~0.1_api/) and [St(Shell Toolkit)](https://gjs-docs.gnome.org/st10~1.0_api/).

Based on [Another Window Session Manager](https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager) by [@nlpsuge](https://github.com/nlpsuge).


<p align="left">
  <a href="https://extensions.gnome.org/extension/10276/yet-another-window-session-manager/">
    <img alt="Get it on GNOME Extensions" width="228" src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true"/>
  </a>
</p>

# Screenshot

## Overview

<img width="601" height="292" src="https://github.com/user-attachments/assets/31338791-f528-41a2-9e1a-09518bccda57" />


## Close open windows
Click item to close open windows:

<img width="601" height="292" src="https://github.com/user-attachments/assets/f84d86fe-6995-402c-ad3d-d637d55f9b5b" />

After confirm to close:

<img width="601" height="292" src="https://github.com/user-attachments/assets/8c091809-eea2-488e-9acd-6b3f1910922d" />


## Save open windows
Click item to save open windows as a session:

<img width="601" height="292" src="https://github.com/user-attachments/assets/dc2581a4-dd37-4d6b-9448-46e73f12f2f0" />


## Set the default session

<img width="601" height="292" src="https://github.com/user-attachments/assets/c68d1628-5aeb-4de3-8959-843305c78266" />


## Preferences

### General
<img width="1250" height="850" src="https://github.com/user-attachments/assets/35749741-057f-4abe-b434-aeda85ea5223" />

### Close windows
<img width="1250" height="850" src="https://github.com/user-attachments/assets/d5e982e9-9458-4051-8c24-275e8dd9b956" />

### Restore sessions
<img width="1250" height="850" src="https://github.com/user-attachments/assets/44984dc1-80a2-4e9a-8802-edc4d7614424" />

### Advanced
<img width="1250" height="850" src="https://github.com/user-attachments/assets/7f411617-540e-4a47-9906-2eaf267cafe2" />


# Main features
1. Restore the previous session at startup. **disabled by default**, to enable it please activate `Restore previous apps and windows at startup` under `Restore sessions`. (See also: [Restore previous apps and windows at startup](https://github.com/mendres82/gnome-shell-extension-yet-another-window-session-manager#restore-previous-apps-and-windows-at-startup)).
1. Save running apps and windows automatically when necessary, this will be used to restore the previous session at startup.
1. Close running apps and windows automatically before `Log Out`, `Restart`, `Power Off`. **disabled by default**, to enable it please activate `Auto close session` under `Close windows`. (See also: [Auto close session](https://github.com/mendres82/gnome-shell-extension-yet-another-window-session-manager#auto-close-session)).
1. Close running windows gracefully
1. Close apps with multiple windows gracefully via `ydotool` so you don't lose sessions of this app (See also: [How to make Close by rules work](https://github.com/mendres82/gnome-shell-extension-yet-another-window-session-manager#how-to-make-close-by-rules-work))
1. Save running apps and windows manually
1. Restore a selected session at startup (See also: [#9](https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/issues/9#issuecomment-1097012874)). **disabled by default**.
1. Restore a saved session manually
1. Restore window state, including `Always on Top`, `Always on Visible Workspace` and maximization
1. Restore window workspace, size and position
1. Restore 2 column window tiling
1. Stash all supported window states so that those states will be restored after gnome shell restarts via `Alt+F2 -> r` or `killall -3 gnome-shell`.
1. Move windows to their own workspace according to a saved session
1. Support multi-monitor
1. Remove saved session to trash
1. Search saved session by the session name fuzzily
1. Keyboard shortcuts to save, restore, and move windows using the default session (See also: [Keyboard shortcuts](https://github.com/mendres82/gnome-shell-extension-yet-another-window-session-manager#keyboard-shortcuts))
1. ...

## Close windows

### Auto close session
Enable this feature through `Auto close session` under `Close windows`:

<img width="1236" height="286" src="https://github.com/user-attachments/assets/6e8d6896-aa87-43ea-9d27-80812a355054" />

After you click the `Log Out/Restart/Power Off` button and confirm GNOME's session dialog, YAWSM closes running apps and windows automatically. If everything closes successfully, logout, reboot, or shutdown continues without an extra prompt.

If one or more apps cannot be closed automatically, YAWSM shows a dialog listing them so you can close them manually:

![image](https://user-images.githubusercontent.com/2271720/214394659-651e6259-842c-49ca-9c97-6df62c9485d1.png)

This feature hooks into GNOME Shell's `endSessionDialog`, so it also runs when you log out via `gnome-session-quit --logout`. It does not run when `org.gnome.SessionManager` `logout-prompt` is `false`.

### How to make `Close by rules` work

To make this feature work, you need to install [ydotool](https://github.com/ReimuNotMoe/ydotool):

```bash
# 1. Install `ydotool` using the package manager and make sure the version is greater than v1.0.0
sudo dnf install ydotool
#Or install it from the source code: https://github.com/ReimuNotMoe/ydotool

#Check the permission of `/dev/uinput`, if it's `crw-rw----+`, you can skip step 2
# 2. Get permission to access to `/dev/uinput` as the normal user
sudo touch /etc/udev/rules.d/60-yawsm-ydotool-uinput.rules
# Here we use `tee`, not redirect(>), to avoid `warning: An error occurred while redirecting file '/etc/udev/rules.d/60-yawsm-ydotool-uinput.rules' open: Permission denied`
# See: https://www.shellhacks.com/sudo-echo-to-file-permission-denied/
echo '# See:
  # https://github.com/ValveSoftware/steam-devices/blob/master/60-steam-input.rules 
  # https://github.com/ReimuNotMoe/ydotool/issues/25

  # ydotool udev write access
  KERNEL=="uinput", SUBSYSTEM=="misc", TAG+="uaccess", OPTIONS+="static_node=uinput"' | sudo tee --append /etc/udev/rules.d/60-yawsm-ydotool-uinput.rules

cat /etc/udev/rules.d/60-yawsm-ydotool-uinput.rules
#Remove executable permission (a.k.a. x)
sudo chmod 644 /etc/udev/rules.d/60-yawsm-ydotool-uinput.rules

# 3. Copy ydotool.service to /usr/lib/systemd/user, so `systemctl --user enable ydotool.service` can work
sudo cp /usr/lib/systemd/system/ydotool.service /usr/lib/systemd/user
# 4. Start ydotool.service at startup automatically for the current normal user
systemctl --user enable ydotool.service
# 5. Note that you may have to restart the system if the following commands are not working
# 6. Start the ydotoold service for the current normal user
systemctl --user start ydotool.service
# 7. Check if ydotoold service is working. The word `hello` should print on the terminal, if not you might need to reboot the system or try to relogin your account. 
ydotool type 'hello'

## misc. ##

# Check if the ydotoold service is running, if not you may have to restart the system or start ydotool.service
systemctl --user status ydotool.service

```

Note that it's no necessary to run `systemctl --user enable ydotool.service`, because this extension starts `ydotool.service` every time while you use it to close windows.

Feel free to fill an issue if `ydotool` does not work under normal user, you may also want to do that in [its git issue area](https://github.com/ReimuNotMoe/ydotool/issues)

## Restore sessions

### Restore previous apps and windows at startup
<img width="1250" height="850" src="https://github.com/user-attachments/assets/827aa9dd-647c-4d28-9db8-766bcb3e0893" />

Activate `Restore previous apps and windows at startup` to enable this feature. This option and `Restore selected session at startup` are exclusive. And this option works for shutting down the system normally (via Log Out/Restart/Power Off buttons) and other ways (like pressing the physical power-off button).

Then while startup, YAWSM will launch and restore apps and states from the previous saved session configs.

The session configs are saved in the path `~/.config/yet-another-window-session-manager/sessions/currentSession`.

You can use the below command to test it. 
```bash
gdbus call --session --dest org.gnome.Shell.Extensions.yawsm --object-path /org/gnome/Shell/Extensions/yawsm --method org.gnome.Shell.Extensions.yawsm.Autostart.RestorePreviousSession "{'removeAfterRestore': <false>}"
```

### How to `Restore a session at startup`?

To make it work, you must enable it through `Restore sessions -> Restore selected session at startup` in the Preferences AND set a session as the default by clicking <img src=https://user-images.githubusercontent.com/2271720/162792222-0fc7e6ca-1382-49cf-975a-f53d878d0479.png width="24" height="13"> in the popup menu.

While you enable it through `Restore sessions -> Restore selected session at startup`, it creates a `_gnome-shell-extension-yet-another-window-session-manager.desktop` under the folder `~/.config/autostart/`. 

Test the settings in command line via:
```Bash
gdbus call --session --dest org.gnome.Shell.Extensions.yawsm --object-path /org/gnome/Shell/Extensions/yawsm --method org.gnome.Shell.Extensions.yawsm.Autostart.RestoreSession
```

Please do not modify `_gnome-shell-extension-yet-another-window-session-manager.desktop`, all changes by yourself could be overidden or deleted.

## Keyboard shortcuts

Configure keyboard shortcuts under `General -> Keyboard shortcuts` in the Preferences:

<img width="1250" height="850" src="https://github.com/user-attachments/assets/35749741-057f-4abe-b434-aeda85ea5223" />

YAWSM provides three global shortcuts that work with the **default session**. Set a default session in the panel menu first (See also: [Set the default session](#set-the-default-session)).

| Shortcut | Default | Action |
|----------|---------|--------|
| Save Session | `Ctrl`+`Alt`+`S` | Save open windows to the default session |
| Restore Session | `Ctrl`+`Alt`+`R` | Restore windows from the default session |
| Move Windows | `Ctrl`+`Alt`+`M` | Move open windows to the workspace and position defined by the default session |

Click a shortcut button to record a new key combination. Press `Backspace` to disable a shortcut, or `Escape` to cancel while recording.

The configured shortcuts are also shown as tooltips on the save, restore, and move buttons in the panel menu.

# Panel menu items

## Icons description

| Icon                                                         | Description                                                  |
|--------------------------------------------------------------|--------------------------------------------------------------|
| <img src=icons/save-symbolic.svg width="14" height="14">     | Save open windows as a session, which name is the item's name |
| <img src=icons/restore-symbolic.svg width="14" height="14">  | Restore the saved session using the item's name               |
| <img src=icons/move-symbolic.svg width="14" height="14">     | Move the open windows using the item's name                  |
| <img src=icons/close-symbolic.svg width="14" height="14">    | Close the current open windows                               |


# Dependencies
* procps-ng

Use `ps` and `pwdx` to get some information from a process, install it via `dnf install procps-ng` if you don't have.

* glib2

Use `gdbus` to call the remote method, which is provided by this exension, to implement the `restore at start` feature. `gdbus` is part of `glib2`.

* ydotool

Send keys to close the application gracefully with multiple windows.

# Known issues

1. On both X11 and Wayland, if click restore button (<img src=icons/restore-symbolic.svg width="14" height="14">) continually during the process of restoring, the window size and position may can't be restored, and it may restore many instances of an application. **As a workaround, click the restore button (<img src=icons/restore-symbolic.svg width="14" height="14">) only once until all apps are restored.**

# Support applications launched via a command line or applications that don't have a proper .desktop file
If the .desktop is missing from a session file, restoring an application relies on the command line completely.

In this case this extension will generate a .desktop in the `journalctl` when you click the save button (<img src=icons/save-symbolic.svg width="14" height="14">). Search `Generated a .desktop file` in `journalctl /usr/bin/gnome-shell -r` to find it: `journalctl /usr/bin/gnome-shell -b -o cat --no-pager | grep 'Generated a .desktop file'`. To make it work, You need to copy it to `~/.local/share/applications`, and relaunch the app and save the session again. This extension should be able to restore the workspace, state, size and position of this application.

**The generated .desktop might not work sometimes, it's better to check whether the value of `Exec` is correct or not.** If you restore an app using a bad .desktop, this extension will give you a notification and log error level logs in the `journalctl`.

I tested on Anki, VirtualBox machine and two .AppImage apps, they all have no .desktop and are launched in the terminal. By using the generated .desktop, Anki, VirtualBox machine works. One .AppImage app works. Another .AppImage app is `Wire_x86_64.AppImage` and doesn't work, because the command line returned is something like `/tmp/.mount_Wire-3xxxxx/wire-desktop`, you can use it to launch Wire but files in the `/tmp` will be deleted during the OS shutdown and start.

It's impossible / hard to query the command line from a process, the pid of a window might not be right too and I don't find a standard way for this.

## How can I know whether a .desktop of an application is proper or not?

One of the following should be enough to prove the .desktop is not proper:
1. Right click on the icon in the panel or dash, if there is no `Add to Favorites` in the menu
2. This extension can launch an application, but can't move the window to its workspace. (But it might suggest there is a bug in this extension, LOL :))

Most existing applications should have a proper .desktop. I'm just handling the special case. Someone like myself might want this feature.

# Where are the saved sessions?
They are all in `~/.config/yet-another-window-session-manager/sessions`. When use an existing name to save the current open windows, the previous file will be copied to `~/.config/yet-another-window-session-manager/sessions/backups` as a new name, which is the-old-session-name**.backup-current-timestamp**.

Note that I've marked `backups` as a reserved word, so you can't use it as a session name when saving a session. But you do have the freedom to manually create a file named `backups` in `~/.config/yet-another-window-session-manager/sessions`. But this extension will only backup the session file that you are clicking the save button and you will receive an error log in the `journalctl` and an error notification every time you save an existing session.

# Translations

Contributions for new languages and improvements to existing translations are welcome. Translation files are in the `po/` directory using the [gettext](https://gjs.guide/extensions/development/translations.html) format.

## Translate an existing language

1. Open the `.po` file for your language in `po/` (for example `po/de.po`).
2. Fill in or update the `msgstr` entries. Each `msgid` is the English source string; `msgstr` is your translation.
3. Submit a pull request with the updated `po/*.po` file.

## Add a new language

If there is no `.po` file for your language yet, create one from the template:

```bash
msginit --locale=fr \
  --input=po/yet-another-window-session-manager@github.com.pot \
  --output=po/fr.po
```

Replace `fr` with your language code. Translate the strings in the new file and open a pull request that adds `po/fr.po`.

## Pull requests

Please submit **only** the updated or new `po/*.po` files. Do not include the compiled `locale/` directory.

If the template has changed on the main branch since you started, sync your `.po` file before submitting:

```bash
msgmerge --update --no-wrap po/de.po po/yet-another-window-session-manager@github.com.pot
```

Or use `make -C build i18n-sync-po`, which passes `--no-wrap` so existing translations are not re-wrapped to match the template line breaks.

Resolve any new or fuzzy entries, then commit the updated `.po` file.

## Test locally (optional)

To try your translation before opening a pull request, install [gettext-tools](https://www.gnu.org/software/gettext/) and compile the locales:

```bash
make -C build i18n-compile-locales
```

Install the extension (including the generated `locale/` directory), restart GNOME Shell, and open the preferences or panel menu in your locale.

# TODO
1. - Close open windows
     - [ ] Close all windows on the current workspace. (WIP, see https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/pull/71)
1. - Save open windows
     - [x] Save open windows 
1. - Restore saved open windows
      - [x] Restore saved open windows
      - [x] Move to belonging workspace automatically
      - [x] Restore window size and position ([issue 17](https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/issues/17))
      - [x] Restore window workspace, size and position of applications launched via a command line and don't have a recognizable `.desktop` file by `Shell.AppSystem.get_default().get_running()`.
      - [x] Support multi-monitor ([issue 21](https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/issues/21))
1. - Saved open windows list
      - [x] Save open windows button
      - [x] Restore button
      - [ ] Rename button (double click text to rename?)
      - [x] Move button
      - [x] Delete button
1. - [x] Move windows according to a saved session.
1. - [ ] Settings
      - [x] Debugging mode
      - [ ] whitelist using for closing application with multiple windows
1. - [x] Support restoring a saved session at startup ([issue 9](https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/issues/9))
1. - [x] Support saving and closing windows when Log Out, Power off, Reboot ([issue 9](https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/issues/9))
1. - [ ] All TODO tags in the projects
1. - [x] Translation (See [Translations](https://github.com/mendres82/gnome-shell-extension-yet-another-window-session-manager#translations))
1. - [ ] A client tool called `yawsm-client` (See: [issue 34](https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/issues/34))
1. - [ ] Fix any typo or grammar errors.
1. - [x] Open the Preferences on the popup menu 
1. - [x] Open the session file from the popup menu

