/**
 * Popup Undo button — wired to window.ynUndoFill.
 *
 * popup.js is evaluated verbatim, inside the REAL popup.html (so a missing
 * button id in either file shows up as a thrown error, not a silent no-op),
 * under jsdom. ynInjectOnce (common/inject_once.js) and
 * ynPingLiveness are stubbed here deliberately — this harness's job is
 * popup.js's OWN wiring (does it call the injected ynUndoFill, does it read
 * back {reverted}, does "absent" and "nothing to revert" read the same to
 * the student), not the injection mechanics, which
 * tests/test_ext_harness.py and the click-stack-order tests already pin.
 *
 * addEventListener is overridden to CAPTURE handlers by element id rather
 * than dispatch real events, so a handler can be awaited directly instead
 * of racing a timer against its internal awaits.
 *
 * Run: node tests/ext_fixtures/run_popup_undo.mjs   (exit 0 = all pass)
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
  const calls = { executeScript: [], injectOnce: [] };
  win.chrome = {
    tabs: {
      // A page that is none of the popup's other special surfaces
      // (LinkedIn/GitHub import, Indeed employer posting, the resolver and
      // liveness hosts) — every OTHER setup function bails out on this URL,
      // so this harness only has Undo's own wiring to prove.
      query: async () => [{ id: 7, url: "https://example.com/apply-form" }],
    },
    scripting: {
      executeScript: async (opts) => {
        calls.executeScript.push(opts);
        if (typeof opts.func === "function") {
          return [{ result: opts.func() }];
        }
        return [{}];
      },
    },
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        const resp = { ok: false, error: "no worker in the harness" };
        if (typeof cb === "function") cb(resp);
        return Promise.resolve(resp);
      },
      onMessage: { addListener: () => {} },
      openOptionsPage: () => {},
    },
    storage: {
      local: {
        get: async (d) => (typeof d === "string" ? {} : { ...(d || {}) }),
        set: async () => {},
        remove: async () => {},
      },
    },
    commands: { getAll: async () => [] },
  };
  // Stubs for the two cross-lane helpers popup.js expects on window (lane
  // P's inject_once.js) — see the file header for why this harness replaces
  // rather than loads them.
  win.ynInjectOnce = async (tabId, files, sentinel, allFrames) => {
    calls.injectOnce.push({ tabId, files, sentinel, allFrames });
  };
  win.ynPingLiveness = async () => {};

  const ctx = vm.createContext(win);
  vm.runInContext(readFileSync(POPUP_JS, "utf8"), ctx, {
    filename: "popup.js",
  });
  return { win, listeners, calls };
}

// ── 1. The button itself: icon-only, correctly labelled ─────────────────
{
  const html = readFileSync(POPUP_HTML, "utf8");
  const dom = new JSDOM(html);
  const btn = dom.window.document.getElementById("undo");
  check("undo button exists", () => assert(btn, "no #undo button in popup.html"));
  check('aria-label is exactly "Undo fill"', () =>
    assert(
      btn.getAttribute("aria-label") === "Undo fill",
      "aria-label: " + btn.getAttribute("aria-label"),
    ));
  check("icon-only: no visible text beside the svg", () => {
    const clone = btn.cloneNode(true);
    clone.querySelectorAll("svg").forEach((s) => s.remove());
    assert(
      clone.textContent.trim() === "",
      'visible text remains: "' + clone.textContent.trim() + '"',
    );
  });
  check("carries an svg icon", () =>
    assert(btn.querySelector("svg"), "no <svg> inside #undo"));
}

// ── 2. window.ynUndoFill absent → "Nothing to undo.", never an error ────
{
  const { win, listeners, calls } = loadPopup();
  check("click handler registered", () =>
    assert(listeners.undo && listeners.undo.click, "no click listener on #undo"));
  await listeners.undo.click();
  const status = win.document.getElementById("status").textContent;
  check('status reads "Nothing to undo." when ynUndoFill is not loaded', () =>
    assert(status === "Nothing to undo.", "status: " + status));
  check("the injected stack is the SAME one Fill uses", () => {
    assert(calls.injectOnce.length === 1, "ynInjectOnce not called");
    const call = calls.injectOnce[0];
    assert(call.sentinel === "ynFillApplication", "sentinel: " + call.sentinel);
    assert(call.allFrames === true, "allFrames: " + call.allFrames);
    assert(
      call.files.includes("content/dom_fill_kit.js"),
      "the fill stack (where ynUndoFill lives) was not injected",
    );
  });
  check("executeScript ran on every frame", () => {
    const call = calls.executeScript[0];
    assert(call.target.allFrames === true, "allFrames: " + call.target.allFrames);
    assert(
      /ynUndoFill/.test(call.func.toString()),
      "the injected function does not reference ynUndoFill: " + call.func.toString(),
    );
  });
}

// ── 3. window.ynUndoFill present, several fields reverted ───────────────
{
  const { win, listeners } = loadPopup();
  win.ynUndoFill = () => ({ reverted: 3 });
  await listeners.undo.click();
  const status = win.document.getElementById("status").textContent;
  check("plural count reads naturally", () =>
    assert(status === "Undid 3 fields.", "status: " + status));
}

// ── 4. Exactly one field reverted — no stray "1 fields." ─────────────────
{
  const { win, listeners } = loadPopup();
  win.ynUndoFill = () => ({ reverted: 1 });
  await listeners.undo.click();
  const status = win.document.getElementById("status").textContent;
  check("singular count reads naturally", () =>
    assert(status === "Undid 1 field.", "status: " + status));
}

// ── 5. window.ynUndoFill present but reports nothing reverted — the SAME
//      message as when the function is absent altogether. ────────────────
{
  const { win, listeners } = loadPopup();
  win.ynUndoFill = () => ({ reverted: 0 });
  await listeners.undo.click();
  const status = win.document.getElementById("status").textContent;
  check('an empty undo history reads the same as "not loaded"', () =>
    assert(status === "Nothing to undo.", "status: " + status));
}

// ── 6. Chrome refuses the injection (chrome://, the Web Store, a PDF) ────
{
  const { win, listeners } = loadPopup();
  win.ynInjectOnce = async () => {
    throw new Error("Cannot access contents of the page");
  };
  await listeners.undo.click();
  const status = win.document.getElementById("status").textContent;
  check("a refused injection is reported, not thrown", () =>
    assert(
      /Chrome will not let extensions script this page/.test(status),
      "status: " + status,
    ));
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("popup undo PASS");
