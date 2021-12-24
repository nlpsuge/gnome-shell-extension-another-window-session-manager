# gnome-shell-extension-another-window-session-manager
Close and save open windows. And restore saved windows sessions.

Most importantly, It supports both X.org and Wayland!

This project is in early development, I'm planing to add some other features, but it basicly works now.

# Screenshot

## Overview
![image](https://user-images.githubusercontent.com/2271720/147340739-0bdfb598-048f-41cd-b711-e1692556cc73.png)

## Close open windows
Click to close open windows:

![image](https://user-images.githubusercontent.com/2271720/147340779-acccb8c7-142d-4250-a511-d55ccdc153aa.png)

After confirm to close:

![image](https://user-images.githubusercontent.com/2271720/147340835-853e1672-9b99-4411-a62b-df22a8450b3d.png)

## Save open windows
![image](https://user-images.githubusercontent.com/2271720/147341045-0110b01d-495f-417b-9dd0-2c9e35f3d0b0.png)


# Features
1. Save open windows
2. Restore saved open windows and move open windows automatically in the progress
3. Move windows using a saved session
4. ...

# Panel menu items

## Icon descpription
Front left to right:
| Icon                                                         | Description                                                             |
|--------------------------------------------------------------|--------------------------------------------------------------|
| <img src=icons/save-symbolic.svg width="14" height="14">     | Save open windows as a sesson, which name is the item's name |
| <img src=icons/restore-symbolic.svg width="14" height="14">  | Restore the saved sesson using the item's name               |
| <img src=icons/move-symbolic.svg width="14" height="14">     | Move the open windows using the item's name                  |
| ~~<img src=icons/close-symbolic.svg width="14" height="14">~~    | ~~Close the current open windows~~                               |


# limitation
- It denpends on St(Shell Toolkits) and Shell APIs so heavily
- ...

# TODO
1. - Save open windows
     - [] Save open windows 
3. - Restore saved open windows
      - [] Restore saved open windows
      - [x] Move to belonging workspace automatically
      - [ ] Restore window's geometry
4. - Saved open windows list
      - [ ] Saved open windows list
      - [x] Restore button
      - [x] Rename button
      - [x] Delete button
5. - [x] Move windows using a saved session.
6. - [ ] Settings
7. - [ ] All TODO tags in the projects
