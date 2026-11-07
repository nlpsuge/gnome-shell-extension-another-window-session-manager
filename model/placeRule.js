'use strict';

// Hand-edited on a session file. Not a GSetting.
export const PLACE_DELAY_FIELD = 'place_delay_ms';

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
