/**
 * The stop control's two rendered popup states, under jsdom against the
 * REAL popup.html and popup.js — not a description of what the code should do,
 * a render of what a student actually sees. A later design change
 * collapsed the stop into ONE toggle switch, both directions, no
 * separate "Start again" button and no second "Stopped" line: this harness
 * presses the real control twice and checks the real DOM after each press,
 * which a text-scan of the source cannot do.
 *
 * Run: node tests/ext_fixtures/run_killswitch_popup_states.mjs   (exit 0 = all pass)
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const require = createRequire(path.join(root, "package.json"));
const { JSDOM } = require("jsdom");

const POPUP_HTML = path.join(root, "extension", "popup.html");
const POPUP_JS = path.join(root, "extension", "popup.js");

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (e) {
    failures += 1;
    console.error("  FAIL " + name + " — " + e.message);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadPopup() {
  const html = readFileSync(POPUP_HTML, "utf8");
  const dom = new JSDOM(html, {
    url: "chrome-extension://abcdefgh/popup.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const listeners = {};
  win.EventTarget.prototype.addEventListener = function (type, fn) {
    const id = this.id || "";
    listeners[id] = listeners[id] || {};
    listeners[id][type] = fn;
  };
  const storageSets = [];
  win.chrome = {
    tabs: { query: async () => [{ id: 7, url: "https://example.com" }] },
    scripting: { executeScript: async () => [{}] },
    runtime: {
      lastError: null,
      // GET_STATUS: a connected, running account — the popup's own click
      // handler never consults this again, only the switch's own painted
      // aria-checked, so the click assertions below are independent of it.
      sendMessage: async () => ({
        ok: true,
        email: "student@example.com",
        first_name: null,
        killSwitch: false,
      }),
      onMessage: { addListener: () => {} },
      openOptionsPage: () => {},
    },
    storage: {
      local: {
        get: async (d) => (typeof d === "string" ? {} : { ...(d || {}) }),
        set: async (obj) => {
          storageSets.push(obj);
        },
        remove: async () => {},
      },
    },
    commands: { getAll: async () => [] },
  };
  win.ynInjectOnce = async () => {};
  win.ynPingLiveness = async () => {};

  const ctx = vm.createContext(win);
  vm.runInContext(readFileSync(POPUP_JS, "utf8"), ctx, {
    filename: "popup.js",
  });
  return { win, listeners, storageSets };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

const { win, listeners, storageSets } = loadPopup();
await tick();
await tick();

// ── State 1: RUNNING (the popup's default render) ───────────────────────
check("exactly one stop control in the rendered popup", () => {
  assert(
    win.document.querySelectorAll(".killswitch").length === 1,
    "found " + win.document.querySelectorAll(".killswitch").length,
  );
  assert(
    !win.document.getElementById("kill-restart"),
    "a separate restart control is still in the rendered popup",
  );
});
check('running: aria-checked="false"', () =>
  assert(
    win.document.getElementById("kill").getAttribute("aria-checked") === "false",
    win.document.getElementById("kill").getAttribute("aria-checked"),
  ));
check('running: the state word reads "Running"', () =>
  assert(
    win.document.getElementById("kill-state").textContent === "Running",
    win.document.getElementById("kill-state").textContent,
  ));
check('the title never changes: "Stop everything"', () =>
  assert(
    win.document.querySelector(".killswitch-title").textContent === "Stop everything",
    win.document.querySelector(".killswitch-title").textContent,
  ));

// ── Press it: RUNNING → STOPPED ──────────────────────────────────────────
check("click handler registered on #kill", () =>
  assert(listeners.kill && listeners.kill.click, "no click listener on #kill"));
await listeners.kill.click();

check('stopped: aria-checked="true"', () =>
  assert(
    win.document.getElementById("kill").getAttribute("aria-checked") === "true",
    win.document.getElementById("kill").getAttribute("aria-checked"),
  ));
check('stopped: the state word reads "Stopped" (and only once)', () => {
  assert(
    win.document.getElementById("kill-state").textContent === "Stopped",
    win.document.getElementById("kill-state").textContent,
  );
  const bodyText = win.document.body.textContent;
  assert(
    (bodyText.match(/Stopped/g) || []).length === 1,
    "the word 'Stopped' appears more than once in the popup",
  );
});
check("the title still reads the same static label", () =>
  assert(
    win.document.querySelector(".killswitch-title").textContent === "Stop everything",
    win.document.querySelector(".killswitch-title").textContent,
  ));
check("storage was written with killSwitch: true", () =>
  assert(
    storageSets.some((s) => s.killSwitch === true),
    JSON.stringify(storageSets),
  ));

// ── Press it again: STOPPED → RUNNING, the SAME control ─────────────────
await listeners.kill.click();
check('pressed again: back to aria-checked="false"', () =>
  assert(
    win.document.getElementById("kill").getAttribute("aria-checked") === "false",
    win.document.getElementById("kill").getAttribute("aria-checked"),
  ));
check('pressed again: the state word reads "Running"', () =>
  assert(
    win.document.getElementById("kill-state").textContent === "Running",
    win.document.getElementById("kill-state").textContent,
  ));
check("storage was written with killSwitch: false", () =>
  assert(
    storageSets.some((s) => s.killSwitch === false),
    JSON.stringify(storageSets),
  ));

if (failures) {
  console.error(failures + " failure(s)");
  process.exit(1);
}
console.log("popup kill-switch states PASS: one toggle, both directions, rendered");
