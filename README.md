# gnome-shell-extension-another-window-session-manager
Close and save open windows. And restore from a saved windows session.

Most importantly, it supports both X11 and Wayland!

This project is in early development, but it's basically working now. More features will be added in the future.

This extension is based on [St(Shell Toolkit)](https://gjs-docs.gnome.org/st10~1.0_api/) and [Shell](https://gjs-docs.gnome.org/shell01~0.1_api/) APIs.


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
1. Save open windows
2. Restore saved open windows and move windows automatically in the progress
3. Move windows according to a saved session
4. Restore window state, including `Always on Top` and `Always on Visible Workspace`
5. Restore window size and position
6. ...

# Panel menu items

## Icons description

| Icon                                                         | Description                                                  |
|--------------------------------------------------------------|--------------------------------------------------------------|
| <img src=icons/save-symbolic.svg width="14" height="14">     | Save open windows as a session, which name is the item's name |
| <img src=icons/restore-symbolic.svg width="14" height="14">  | Restore the saved session using the item's name               |
| <img src=icons/move-symbolic.svg width="14" height="14">     | Move the open windows using the item's name                  |
| <img src=icons/close-symbolic.svg width="14" height="14">    | Close the current open windows                               |

# Dependencies
This project uses `ps` to get some information from a process, install it via `dnf install procps-ng` if don't have.

# Known issues

1. On both X11 and Wayland, if click restore button (<img src=icons/restore-symbolic.svg width="14" height="14">) continually during the process of restoring, the window size and position may can't be restored, and it may restore many instances of an application. **As a workaround, click restore button (<img src=icons/restore-symbolic.svg width="14" height="14">) only once util all apps restored.**
2. On Wayland, if [a window is maximized along the left or right sides of the screen](https://help.gnome.org/users/gnome-help/stable/shell-windows-maximize.html.en) before closed, its size and position can't be restored. **As a workaround, click move button (<img src=icons/move-symbolic.svg width="14" height="14">) to restore their size and position.**
3. On both X11 and Wayland, due to [this bug](https://gitlab.gnome.org/GNOME/mutter/-/merge_requests/2134) within mutter, in Overview, if click restore button (<img src=icons/restore-symbolic.svg width="14" height="14">) then immediately click the newly created workspace, the Gnome Shell can crash. To fix this issue, the Overview will be toggled hidden after click the restore button (<img src=icons/restore-symbolic.svg width="14" height="14">) when in Overview. I will remove this behaviour once I find a better solution or it's fixed in a new version of Gnome Shell.
4. If an application lunched via a command line, it can't be moved to its own workspace, can't be restored both size and position. **Please click the app icon to launch an application before save it in the session and restore**.
5. ...

# Where are the saved sessions?
They are all in `~/.config/another-window-session-manager/sessions`. When use an exsiting name to save the current open windows, the previous file will be copied to `~/.config/another-window-session-manager/sessions/backups` as a new name, which is the-old-session-name**.backup-current-timestamp**.

# TODO
1. - Save open windows
     - [x] Save open windows 
3. - Restore saved open windows
      - [x] Restore saved open windows
      - [x] Move to belonging workspace automatically
      - [x] Restore window size and position
4. - Saved open windows list
      - [x] Saved open windows list
      - [x] Restore button
      - [x] Rename button
      - [x] Delete button
5. - [x] Move windows according to a saved session.
6. - [ ] Settings
      - [x] Debugging mode
8. - [ ] All TODO tags in the projects
