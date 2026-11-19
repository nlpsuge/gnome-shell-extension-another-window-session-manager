// Loads the REAL MoveSession class from an installed AWSM tree and drives its two
// window-matchers with the user's real saved Brave sessions. Nothing here
// reimplements the matching logic - the method bodies come from the file on disk.
//
//   node test-window-matching.mjs <path-to-moveSession.js>
//
// Scenario: 8 Brave windows saved with page-title titles, then restored while every
// window is showing a different page and every window is sitting where mutter first
// put it (workspace 0, monitor 1) rather than where it was saved. A browser's title
// is its content, so it is the one thing guaranteed to differ after a restart.

import fs from "node:fs";
import path from "node:path";

const TARGET = process.argv[2];
if (!TARGET) {
  console.error("usage: node test-window-matching.mjs <path-to-moveSession.js>");
  process.exit(2);
}

// --- load the real module -----------------------------------------------------
let src = fs.readFileSync(TARGET, "utf8");
src = src
  .split("\n")
  .filter((l) => !/^import\s/.test(l))
  .filter((l) => !/^\}\s*from\s+["'].+["'];?\s*$/.test(l))
  .join("\n");
src = src.replace(/^export\s+/gm, "");
if (/^import\s/m.test(src) || /^\}\s*from\b/m.test(src)) {
  console.error("harness: leftover import syntax - the stripper needs updating");
  process.exit(2);
}

const Meta = {
  is_wayland_compositor: () => true,
  MaximizeFlags: { BOTH: 3, VERTICAL: 2 },
};
const noop = () => {};
const factory = new Function(
  "Gio",
  "GLib",
  "Shell",
  "Meta",
  "Main",
  "UiHelper",
  "FileUtils",
  "Log",
  "DateUtils",
  "shellVersion",
  "WindowTilingSupport",
  `${src}\nreturn MoveSession;`,
);
const MoveSession = factory(
  {},
  {},
  {},
  Meta,
  {},
  { ignoreWindows: () => false },
  {},
  { Log: class {} },
  { get_current_time: () => 0 },
  46,
  class {},
);

// --- the saved sessions -------------------------------------------------------
// Real data when available (it is the most convincing fixture), otherwise an
// equivalent synthetic one so the test runs anywhere.
const SESSION_DIR =
  process.env.AWSM_BRAVE_DIR ||
  `${process.env.HOME}/.config/another-window-session-manager/currentSession/brave-browser`;

const FIXTURE = [
  "Ministry tour dates - Brave",
  "Turbo Vado 3 Evo - Brave",
  "Hermes radio scan - Brave",
  "The strangest letter of the alphabet - Brave",
  "Personal internet radio - Brave",
  "Lemon64 game entry - Brave",
  "Amiga games of all time - Brave",
  "Peek-A-Boo Poker - Brave",
].map((t, i) => ({
  window_id: 1848306650 + i,
  window_title: t,
  wm_class: "brave-browser",
  wm_class_instance: "brave-browser",
  windows_count: 8,
  monitor_number: 1,
  desktop_number: 0,
}));

let saved;
if (fs.existsSync(SESSION_DIR)) {
  console.log(`fixture: real saved sessions from ${SESSION_DIR}`);
  saved = fs
    .readdirSync(SESSION_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf8")));
} else {
  console.log(`fixture: built-in (no session data at ${SESSION_DIR})`);
  saved = FIXTURE;
}

saved = saved
  .map((d, i) => ({
    ...d,
    window_state: {
      is_sticky: false,
      is_above: false,
      meta_maximized: 0,
      ...(d.window_state || {}),
    },
    // Spread them over workspaces and monitors so the restore actually has somewhere
    // to move them. Real Brave data is all on one monitor/workspace, which would let
    // a matcher pass by doing nothing.
    desktop_number: i >= 4 ? 1 : 0,
    monitor_number: i >= 6 ? 0 : 1,
    moved: false,
  }));

if (saved.length < 2) {
  console.error(`need >=2 saved brave sessions, found ${saved.length}`);
  process.exit(2);
}

// Live windows: same wm_class, every title now different (the user browsed on), and
// all parked on workspace 0 / monitor 1, which is where mutter puts them.
const live = saved.map((s, i) => ({
  id: `live-${i}`,
  get_title: () =>
    `${s.window_title.replace(/ - Brave$/, "")} (now on a different page ${i}) - Brave`,
  get_wm_class: () => s.wm_class,
  get_monitor: () => 1,
  get_workspace: () => ({ index: () => 0 }),
}));

const shellApp = {
  get_name: () => "Brave Web Browser",
  get_windows: () => live,
};

// fake `this`: a real MoveSession prototype so the production helpers are reachable,
// with the side-effecting methods stubbed out and recorded.
function fakeThis() {
  const stubs = {
    _log: { isDebug: () => false, debug: noop, error: noop, warn: noop },
    _restoreWindowStates: (w, s) => stubs.applied.push([w.id, s.window_id]),
    _changeWorkspace: noop,
    _createEnoughWorkspace: noop,
    _restoreWindowState: noop,
    _restoreMonitor: async () => {},
    _windowTracker: { get_window_app: () => shellApp },
    applied: [],
  };
  return Object.assign(Object.create(MoveSession.prototype), stubs);
}

const freshSaved = () => saved.map((s) => ({ ...s, moved: false }));
const failures = [];

const wantMoved = saved.filter((s) => s.desktop_number !== 0).length;

// --- matcher 1: the automatic path -------------------------------------------
{
  const self = fakeThis();
  const pool = freshSaved();
  const pairs = MoveSession.prototype._getAutoMoveInterestingWindows.call(self, shellApp, pool);

  const movedIds = pairs.map((p) => p.open_window.id);
  const appliedIds = self.applied.map(([w]) => w);
  const covered = new Set([...movedIds, ...appliedIds]);
  const sessionsUsed = [...pairs.map((p) => p.saved_window_session.window_id), ...self.applied.map(([, s]) => s)];

  console.log(
    `auto-move: ${pairs.length} to move, ${self.applied.length} already in place ` +
      `-> ${covered.size}/${live.length} windows accounted for, ${new Set(sessionsUsed).size}/${sessionsUsed.length} sessions used once`,
  );

  if (covered.size !== live.length) {
    failures.push(
      `auto-move accounted for ${covered.size}/${live.length} Brave windows - the rest get no position, monitor or workspace restored`,
    );
  }
  if (new Set(sessionsUsed).size !== sessionsUsed.length) {
    failures.push("auto-move paired one saved session to more than one live window");
  }
  if (pairs.length !== wantMoved) {
    failures.push(
      `auto-move queued ${pairs.length} window(s) for a workspace move, expected ${wantMoved}`,
    );
  }
}

// --- matcher 2: the explicit restore path ------------------------------------
{
  const self = fakeThis();
  const pool = freshSaved();
  const hits = [];
  for (const w of live) {
    const hit = MoveSession.prototype._getOneMatchedSavedWindow.call(self, w, pool);
    if (hit) hits.push([w.id, hit.window_id]);
  }
  const sessionIds = hits.map(([, s]) => s);
  console.log(
    `restore-by-metaWindow: ${hits.length}/${live.length} matched, ${new Set(sessionIds).size}/${sessionIds.length} distinct sessions`,
  );
  if (hits.length !== live.length) {
    failures.push(
      `restore path matched ${hits.length}/${live.length} Brave windows - unmatched windows return early and are never moved`,
    );
  }
  if (new Set(sessionIds).size !== sessionIds.length) {
    failures.push("restore path assigned the same saved session to two live windows");
  }
}

// --- regressions: cases that already work must keep working ------------------
const S = (o) => ({
  window_id: o.id,
  window_title: o.title,
  wm_class: o.wm_class || "brave-browser",
  windows_count: o.n ?? 1,
  desktop_number: o.ws ?? 0,
  monitor_number: o.mon ?? 1,
  window_state: { is_sticky: false, is_above: false, meta_maximized: 0 },
  window_position: { provider: "Meta", x_offset: 0, y_offset: 0, width: 800, height: 600 },
  moved: false,
});
const W = (o) => ({
  id: o.id,
  get_title: () => o.title,
  get_wm_class: () => o.wm_class || "brave-browser",
  get_monitor: () => o.mon ?? 1,
  get_workspace: () => ({ index: () => o.ws ?? 0 }),
});

function autoCover(windows, sessions) {
  const self = fakeThis();
  const app = { get_name: () => "app", get_windows: () => windows };
  const pairs = MoveSession.prototype._getAutoMoveInterestingWindows.call(self, app, sessions);
  const covered = new Set([
    ...pairs.map((p) => p.open_window.id),
    ...self.applied.map(([w]) => w),
  ]);
  const sessionsUsed = [
    ...pairs.map((p) => p.saved_window_session.window_id),
    ...self.applied.map(([, s]) => s),
  ];
  return { covered, sessionsUsed };
}

const cases = [
  {
    name: "single window, unchanged title (kitty, PWAs)",
    windows: [W({ id: "a", title: "Pi-Bolt - matlab-fastr" })],
    sessions: [S({ id: 1, title: "Pi-Bolt - matlab-fastr", n: 1 })],
    wantCovered: 1,
  },
  {
    name: "single window, changed title",
    windows: [W({ id: "a", title: "something else entirely" })],
    sessions: [S({ id: 1, title: "Pi-Bolt - matlab-fastr", n: 1 })],
    wantCovered: 1,
  },
  {
    name: "two windows, only one saved session (upstream #102)",
    windows: [W({ id: "a", title: "tab one" }), W({ id: "b", title: "tab two" })],
    sessions: [S({ id: 1, title: "old page", n: 1 })],
    wantCovered: 1,
  },
  {
    name: "PWA window must not steal the browser's saved geometry",
    windows: [
      W({ id: "br", title: "some page" }),
      W({ id: "pwa", title: "Gmail", wm_class: "brave-fmgjjmmmlfnkbppncabfkddbjimcfncm-Default" }),
    ],
    sessions: [S({ id: 1, title: "old page", wm_class: "brave-browser" })],
    wantCovered: 1,
    wantNotCovered: "pwa",
  },
  {
    name: "a window with no same-class saved session is left alone",
    windows: [W({ id: "br", title: "some page" })],
    sessions: [S({ id: 1, title: "Downloads", wm_class: "org.gnome.Nautilus" })],
    wantCovered: 0,
  },
  {
    name: "empty titles still pair by order",
    windows: [W({ id: "a", title: "" }), W({ id: "b", title: "" })],
    sessions: [S({ id: 1, title: "" }), S({ id: 2, title: "" })],
    wantCovered: 2,
  },
];

for (const c of cases) {
  const { covered, sessionsUsed } = autoCover(
    c.windows,
    c.sessions.map((s) => ({ ...s, moved: false })),
  );
  let ok = covered.size === c.wantCovered;
  if (c.wantNotCovered && covered.has(c.wantNotCovered)) ok = false;
  if (new Set(sessionsUsed).size !== sessionsUsed.length) ok = false;
  console.log(`${ok ? "ok  " : "FAIL"}  regression: ${c.name} (covered ${covered.size}/${c.wantCovered})`);
  if (!ok) failures.push(`regression: ${c.name}`);
}

console.log();
if (failures.length) {
  console.log(`FAIL (${failures.length})`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("PASS: Brave pairs 1:1 and the single-window / PWA paths still work");
