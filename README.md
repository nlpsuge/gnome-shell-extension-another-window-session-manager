# gnome-shell-extension-another-window-session-manager
Close and save open windows. And restore saved windows sessions.

Most importantly, It supports both X.org and Wayland!

This project is in early development, I'm planing to add some other features, but it basicly works now.

# Screenshot

## Overview
![image](https://user-images.githubusercontent.com/2271720/147405199-56f33fea-fa85-4bbb-a91b-ea0dcccc837b.png)

## Close open windows
Click button or item to close open windows:

![image](https://user-images.githubusercontent.com/2271720/147405215-6854d881-1a9b-4352-9c42-9a2b8b22e8a3.png)


After confirm to close:

![image](https://user-images.githubusercontent.com/2271720/147340835-853e1672-9b99-4411-a62b-df22a8450b3d.png)

## Save open windows
Click button or item to save open windows as a session:

![image](https://user-images.githubusercontent.com/2271720/147405226-f580018c-e098-47e7-82f3-cdd1a86bd080.png)

After confirm to save:

![image](https://user-images.githubusercontent.com/2271720/147405241-cd6fd8ac-bc86-4d8e-87fb-6ce6abfa7eef.png)


# Features
1. Save open windows
2. Restore saved open windows and move open windows automatically in the progress
3. Move windows using a saved session
4. ...

# Panel menu items

## Icons descpription

| Icon                                                         | Description                                                  |
|--------------------------------------------------------------|--------------------------------------------------------------|
| <img src=icons/save-symbolic.svg width="14" height="14">     | Save open windows as a sesson, which name is the item's name |
| <img src=icons/restore-symbolic.svg width="14" height="14">  | Restore the saved sesson using the item's name               |
| <img src=icons/move-symbolic.svg width="14" height="14">     | Move the open windows using the item's name                  |
| <img src=icons/close-symbolic.svg width="14" height="14">    | Close the current open windows                               |

# limitation
- It denpends on St(Shell Toolkits) and Shell APIs so heavily
- ...

# TODO
1. - Save open windows
     - [x] Save open windows 
3. - Restore saved open windows
      - [x] Restore saved open windows
      - [x] Move to belonging workspace automatically
      - [ ] Restore window's geometry
4. - Saved open windows list
      - [x] Saved open windows list
      - [x] Restore button
      - [x] Rename button
      - [x] Delete button
5. - [x] Move windows using a saved session.
6. - [ ] Settings
7. - [ ] All TODO tags in the projects
