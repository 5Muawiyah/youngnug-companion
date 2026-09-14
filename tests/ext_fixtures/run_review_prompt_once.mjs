/**
 * The applied-tracking review prompt ("Did you review and send this
 * application yourself?") asks ONCE per fill and is dismissable — it used
 * to reappear on every popup open until the student clicked one of its two
 * buttons, which reads as nagging when they just close the popup instead
 * closes the popup instead of answering. This proves the fix against the REAL popup.html and
 * popup.js, opening the popup twice over one shared, persistent storage
 * backing (a real browser session across two opens) rather than describing
 * the intended behaviour in prose.
 *
 * Run: node tests/ext_fixtures/run_review_prompt_once.mjs   (exit 0 = all pass)
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

/** One popup "open" against a shared `store` object — the same shape a real
 * browser session gives chrome.storage.local across two separate popup
 * opens: the SAME persisted values, a FRESH page/script evaluation. */
function openPopup(store) {
  const html = readFileSync(POPUP_HTML, "utf8");
  const dom = new JSDOM(html, {
    url: "chrome-extension://abcdefgh/popup.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  win.EventTarget.prototype.addEventListener = function () {};
  win.chrome = {
    tabs: { query: async () => [{ id: 7, url: "https://example.com" }] },
    scripting: { executeScript: async () => [{}] },
    runtime: {
      lastError: null,
      sendMessage: async () => ({ ok: true, email: "student@example.com" }),
      onMessage: { addListener: () => {} },
      openOptionsPage: () => {},
    },
    storage: {
      local: {
        get: async (keys) => {
          if (typeof keys === "string") return { [keys]: store[keys] };
          if (Array.isArray(keys)) {
            const out = {};
            for (const k of keys) out[k] = store[k];
            return out;
          }
          const out = { ...(keys || {}) };
          for (const k of Object.keys(out)) if (k in store) out[k] = store[k];
          return out;
        },
        set: async (obj) => {
          Object.assign(store, obj);
        },
        remove: async (keys) => {
          for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
        },
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
  return win;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// A fill just completed — the same write background.js's APPLY_RESULT
// handler makes on a "filled" status.
const store = { pendingConfirm: { jobId: 42, ts: Date.now() } };

// ── Open 1: the question shows ───────────────────────────────────────────
const win1 = openPopup(store);
await tick();
await tick();
check("first open: the confirm-applied box is shown", () => {
  const box = win1.document.getElementById("confirm-applied");
  assert(!box.hidden, "box.hidden is true on the first open");
  assert(
    /Did you review and send this application yourself\?/.test(box.textContent),
    "box.textContent: " + box.textContent,
  );
});
check("an 'asked' marker was written, keyed by jobId and the fill's ts", () => {
  assert(store.confirmAsked, "no confirmAsked marker in storage");
  assert(store.confirmAsked.jobId === 42, "wrong jobId: " + store.confirmAsked.jobId);
  assert(
    store.confirmAsked.ts === store.pendingConfirm.ts,
    "marker ts does not match the fill's own ts",
  );
});
check("pendingConfirm itself is untouched by merely being shown", () => {
  // Only an explicit answer (CONFIRM_APPLIED) clears pendingConfirm — being
  // shown once is not the same as being answered.
  assert(store.pendingConfirm, "pendingConfirm was removed just by rendering");
});

// ── Open 2: the SAME fill, un-answered — must NOT show again ────────────
const win2 = openPopup(store);
await tick();
await tick();
check("second open, same fill, no answer given: box stays hidden", () => {
  const box = win2.document.getElementById("confirm-applied");
  assert(box.hidden, "the prompt reappeared on the second, un-answered open");
});

// ── A NEW fill for the SAME job asks again (a fresh ts) ─────────────────
store.pendingConfirm = { jobId: 42, ts: Date.now() + 10_000 };
const win3 = openPopup(store);
await tick();
await tick();
check("a new fill for the same job asks again", () => {
  const box = win3.document.getElementById("confirm-applied");
  assert(!box.hidden, "a new fill's question did not show");
});

if (failures) {
  console.error(failures + " failure(s)");
  process.exit(1);
}
console.log(
  "review prompt PASS: asks once per fill, stays quiet on a second un-answered open, asks again for a new fill",
);
