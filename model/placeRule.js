'use strict';

// Hand-edited on a session file. Not a GSetting.
export const PLACE_DELAY_FIELD = 'place_delay_ms';

// Optional per-window regex (a JS RegExp source string) tested against the
// open window's title. Lets one entry cover titles that embed a URL or other
// variable part, e.g. DevTools: "^DevTools( - .*)?$".
export const PLACE_TITLE_PATTERN_FIELD = 'window_title_pattern';

export const NO_PLACE_DELAY_MS = 0;

// A typo must not leave a timeout pending for hours.
export const MAX_PLACE_DELAY_MS = 60000;

// Saved desktop_number when the window was on all workspaces.
export const ALL_WORKSPACES_DESKTOP_NUMBER = -1;

export function ruleMatchesApp(rule, appId, wmClass) {
    if (!rule) {
        return false;
    }
    if (rule.desktop_file_id && appId && rule.desktop_file_id === appId) {
        return true;
    }
    if (rule.wm_class && wmClass && rule.wm_class === wmClass) {
        return true;
    }
    return false;
}

// Same saved slot: same app and the title captured at save time.
export function samePlaceSlot(left, right) {
    if (!left || !right || left.window_title !== right.window_title) {
        return false;
    }
    return ruleMatchesApp(left, right.desktop_file_id, right.wm_class);
}

// Exact window_title equality keeps working when no pattern is set. A set
// pattern is a JS RegExp source tested against the open title. An invalid
// pattern never matches and never throws: matching runs on window-created,
// where a throw would take the extension to State: ERROR.
export function titleMatchesRule(rule, openTitle) {
    if (!rule) {
        return false;
    }
    if (rule.window_title && rule.window_title === openTitle) {
        return true;
    }
    const pattern = rule[PLACE_TITLE_PATTERN_FIELD];
    if (typeof pattern !== 'string' || !pattern) {
        return false;
    }
    try {
        return new RegExp(pattern).test(openTitle ?? '');
    } catch {
        return false;
    }
}

export function sessionPlaceDelayMs(session) {
    if (session && Number.isFinite(session[PLACE_DELAY_FIELD])) {
        return clampPlaceDelayMs(session[PLACE_DELAY_FIELD]);
    }
    return NO_PLACE_DELAY_MS;
}

// A number on the window entry wins. Otherwise the session default.
export function resolvePlaceDelayMs(sessionDelayMs, rule) {
    if (rule && Number.isFinite(rule[PLACE_DELAY_FIELD])) {
        return clampPlaceDelayMs(rule[PLACE_DELAY_FIELD]);
    }
    return clampPlaceDelayMs(sessionDelayMs);
}

function clampPlaceDelayMs(delay) {
    if (!Number.isFinite(delay) || delay < NO_PLACE_DELAY_MS) {
        return NO_PLACE_DELAY_MS;
    }
    if (delay > MAX_PLACE_DELAY_MS) {
        return MAX_PLACE_DELAY_MS;
    }
    return delay;
}
