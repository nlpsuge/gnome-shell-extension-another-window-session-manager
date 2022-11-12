'use strict';

const PopupMenu = imports.ui.popupMenu;

const { Clutter, GObject, St, GLib, Shell } = imports.gi;

const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();


var Notebook = class Notebook extends PopupMenu.PopupMenuSection {

    constructor() {
        super();

        this._notebookBoxLayout = new St.BoxLayout({
            vertical: false,
            // TODO Need this? If the width of the window is 100%, 
            // user might feel too hard to reach the tabs if the cursor is 
            // on the far right side
            // x_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._notebookBoxLayout);

        this._tabs = new PopupMenu.PopupBaseMenuItem({
            hover: false,
        });
        this._notebookBoxLayout.add(this._tabs);

        this.connect('open-state-changed', this._onOpenStateChanged.bind(this));

        // Not work TODO
        // this.actor.connect('key-press-event', (_, event) => {
        //     const currentPage = this._tabPageMap.get(this._selectedNotebookButton);
        //     if (currentPage) {
        //         global.stage.set_key_focus(currentPage.searchItem._entry);
        //     }
        // });

        this._tabPageMap = new Map();

        // milliseconds
        this._hover_timeout = 100;
        this._mouseTimeOutId = 0;

        this._selectedNotebookButton = null;

        this._pageIndex = 0;

    }

    appendPage(name, page, buildPageCallback) {
        const notebookButton = this._createNotebookButton(name);
        this._tabs.add_child(notebookButton);
        this._tabPageMap.set(notebookButton, page);

        this._addPage(notebookButton, page);

        if (this._tabPageMap.size === 1) {
            const firstTabAndPagePair = this._tabPageMap.entries().next().value;
            this._selectedNotebookButton = firstTabAndPagePair[0];
            const firstPage = firstTabAndPagePair[1]

            this._showIndicatorToTab(this._selectedNotebookButton);
            // this.addMenuItem(firstPage);
            firstPage.actor.show();
        }

        notebookButton.connect('notify::hover', (widget) => {
            this._onHoverTab(widget, buildPageCallback);   
        });
    }

    getPages() {
        return [...this._tabPageMap.values()];
    }

    getPageNumber() {
        return this._tabPageMap().size;
    }

    _onOpenStateChanged(width, state) {
        if (state) {
            const currentPage = this._tabPageMap.get(this._selectedNotebookButton);
            if (currentPage) {
                currentPage.initSearchEntry();
                this.setKeyFocusToSearchEntry();
            }

            this._tabPageMap.forEach((page, notebookButton) => {
                if (!notebookButton._originalHeight) {
                    notebookButton._originalHeight = notebookButton.height;
                }
                // Make the tab button more easier to be found and clicked
                notebookButton.height = notebookButton._originalHeight * 1.45;
            });
        }
    }
    
    setKeyFocusToSearchEntry() {
        const currentPage = this._tabPageMap.get(this._selectedNotebookButton);
        if (currentPage) {
            // Note that to make the search bar to be focused forever, so that the focus
            // is not stolen from it and we can type letter into that search bar even 
            // we move the cursor over the other menu items, we also have to set the 
            // `hover: false` to the `PopupMenu.PopupMenuItem` or `PopupMenu.PopupBaseMenuItem`
            // See: https://github.com/SUPERCILEX/gnome-clipboard-history/issues/73
            global.stage.set_key_focus(currentPage.searchItem._entry);
        }
    }

    _onHoverTab(widget, buildPageCallback) {
        if (widget.get_hover()) {
            if (this._selectedNotebookButton == widget) {
                return;
            }

            widget.set_style('box-shadow: inset 0 -4px rgba(255, 255, 255, 0.1);');
            this._mouseTimeOutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                this._hover_timeout,
                () => {
                    this._switchPage(widget);
                    if (buildPageCallback) {
                        const currentPage = this._tabPageMap.get(widget);
                        if (currentPage && !currentPage._pageBuilded) {
                            currentPage._pageBuilded = true;
                            buildPageCallback(currentPage);
                        }
                    }
                    this._mouseTimeOutId = 0;
                    return GLib.SOURCE_REMOVE;
                });
        } else {
            if (this._selectedNotebookButton !== widget) {
                widget.set_style('box-shadow: none;');
            }

            if (this._mouseTimeOutId !== 0) {
                GLib.source_remove(this._mouseTimeOutId);
                this._mouseTimeOutId = 0;
            }
        }
    }

    _addPage(widget, page) {
        this.addMenuItem(page, this._pageIndex++);
        page.actor.hide();
    }

    _switchPage(widget) {
        this._selectedNotebookButton = widget;

        const tabs = this._tabs.get_children();
        for (const tab of tabs) {
            if (tab !== widget) {
                tab.set_style('box-shadow: none');

                const otherPage = this._tabPageMap.get(tab);
                if (otherPage) {
                    otherPage.actor.hide();
                }
            }
        }
        
        this._showIndicatorToTab(widget);

        const currentPage = this._tabPageMap.get(widget);
        if (currentPage) {
            currentPage.actor.show();
            this.setKeyFocusToSearchEntry();
        }
    }

    _showIndicatorToTab(widget) {
        // https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow
        // https://developer.mozilla.org/en-US/docs/Web/CSS/border-radius
        widget.set_style('box-shadow: inset 0 -4px purple;');
    }

    _createNotebookButton(label) {
        return new St.Button({
            label: label,
            style_class: 'notebook tabs',
            reactive: true,
            track_hover: true,
            can_focus: true,
        });
    }

    destroy() {
        if (this._mouseTimeOutId !== 0) {
            GLib.source_remove(this._mouseTimeOutId);
            this._mouseTimeOutId = 0;
        }
    }

}
