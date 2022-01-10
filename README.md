# gnome-shell-extension-another-window-session-manager
Close and save open windows. And restore from a saved windows session.

Most importantly, it supports both X11 and Wayland!

This project is in early development, but it's basically working now. More features will be added in the future.

This extension is based on several [Gnome technologies](https://www.gnome.org/technologies/) and APIs including [Meta](https://gjs-docs.gnome.org/meta9~9_api), [Shell](https://gjs-docs.gnome.org/shell01~0.1_api/) and [St(Shell Toolkit)](https://gjs-docs.gnome.org/st10~1.0_api/).


<p align="left">
  <a href="https://extensions.gnome.org/extension/4709/another-window-session-manager/">
    <img alt="Get it on GNOME Extensions" width="228" src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true"/>
  </a>
</p>

# Screenshot

## Overview
![image](https://user-images.githubusercontent.com/2271720/147721596-0e84626c-8c10-4331-99ac-f0eb3b2db7d3.png)

## Close open windows
Click item to close open windows:

![image](https://user-images.githubusercontent.com/2271720/147727060-c5b64c45-7b00-4343-a28d-28d88003be87.png)


After confirm to close:

![image](https://user-images.githubusercontent.com/2271720/147727104-436ea99b-3539-4eae-b1c4-a3fa83f8734d.png)

## Save open windows
Click item to save open windows as a session:

![image](https://user-images.githubusercontent.com/2271720/147727121-82cb063f-339d-481c-bccb-07e91e0fe5d4.png)


After confirm to save:

![image](https://user-images.githubusercontent.com/2271720/147727180-633fa9e0-4b66-4763-8cf1-f365ef77f7b3.png)


# Main features
1. Close open windows
2. Save open windows
3. Restore saved open windows and move windows to their own workspace automatically in the progress
4. Restore window state, including `Always on Top`, `Always on Visible Workspace` and maximization
5. Restore window size and position
6. Move windows to their own workspace according to a saved session
7. Trash saved session
8. Search saved session by the session name fuzzily
9. ...

# Panel menu items

## Icons description

| Icon                                                         | Description                                                  |
|--------------------------------------------------------------|--------------------------------------------------------------|
| <img src=icons/save-symbolic.svg width="14" height="14">     | Save open windows as a session, which name is the item's name |
| <img src=icons/restore-symbolic.svg width="14" height="14">  | Restore the saved session using the item's name               |
| <img src=icons/move-symbolic.svg width="14" height="14">     | Move the open windows using the item's name                  |
| <img src=icons/close-symbolic.svg width="14" height="14">    | Close the current open windows                               |

# Dependencies
This project uses `ps` to get some information from a process, install it via `dnf install procps-ng` if you don't have.

# Known issues

1. On both X11 and Wayland, if click restore button (<img src=icons/restore-symbolic.svg width="14" height="14">) continually during the process of restoring, the window size and position may can't be restored, and it may restore many instances of an application. **As a workaround, click the restore button (<img src=icons/restore-symbolic.svg width="14" height="14">) only once until all apps are restored.**
2. On Wayland, if [a window is maximized along the left or right sides of the screen](https://help.gnome.org/users/gnome-help/stable/shell-windows-maximize.html.en) before closed, its size and position can't be restored. **As a workaround, click the move button (<img src=icons/move-symbolic.svg width="14" height="14">) to restore their size and position.**
3. On both X11 and Wayland, due to [this bug](https://gitlab.gnome.org/GNOME/mutter/-/merge_requests/2134) within mutter, in Overview, if click restore button (<img src=icons/restore-symbolic.svg width="14" height="14">) then immediately click the newly created workspace, the Gnome Shell can crash. To fix this issue, the Overview will be toggled hidden after clicking the restore button (<img src=icons/restore-symbolic.svg width="14" height="14">) when in Overview. I will remove this behavior once I find a better solution or it's fixed in a new version of Gnome Shell.
4. ...

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
They are all in `~/.config/another-window-session-manager/sessions`. When use an existing name to save the current open windows, the previous file will be copied to `~/.config/another-window-session-manager/sessions/backups` as a new name, which is the-old-session-name**.backup-current-timestamp**.

Note that I've marked `backups` as a reserved word, so you can't use it as a session name when saving a session. But you do have the freedom to manually create a file named `backups` in `~/.config/another-window-session-manager/sessions`. But this extension will only backup the session file that you are clicking the save button and you will receive an error log in the `journalctl` and an error notification every time you save an existing session.

# TODO
1. - Save open windows
     - [x] Save open windows 
3. - Restore saved open windows
      - [x] Restore saved open windows
      - [x] Move to belonging workspace automatically
      - [x] Restore window size and position ([issue 17](https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/issues/17))
      - [ ] Restore window workspace, size and position of applications launched via a command line and don't have a recognizable `.desktop` file by `Shell.AppSystem.get_default().get_running()`.
      - [ ] Support dual-monitors ([issue 21](https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/issues/21))
4. - Saved open windows list
      - [x] Save open windows button
      - [x] Restore button
      - [ ] Rename button (double click text to rename?)
      - [x] Move button
      - [x] Delete button
5. - [x] Move windows according to a saved session.
6. - [ ] Settings
      - [x] Debugging mode
      - [ ] whitelist using for closing application with multiple windows
7. - [ ] Support restoring a saved session when startup ([issue 9](https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/issues/9))
8. - [ ] Support saving and closing windows when Log Out, Power off, Reboot ([issue 9](https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/issues/9))
9. - [ ] All TODO tags in the projects
