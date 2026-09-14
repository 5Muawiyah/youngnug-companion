/**
 * The occlusion check in ynIsHoneypot via
 * elementFromPoint. jsdom implements no layout and no elementFromPoint at
 * all (confirmed: `typeof document.elementFromPoint === "undefined"` on a
 * bare jsdom window), so ynFieldTopHitElements fails open (returns null,
 * "cannot verify") on every OTHER fixture in this suite with no shim at
 * all — this is the one test that supplies a real elementFromPoint so the
 * new check has something to see.
 *
 * Fixture: tests/ext_fixtures/guards/occlusion_form.html — two CSS-visible
 * fields (no display:none, no zero rect, no near-zero opacity — nothing
 * ynIsVisuallyHiddenTrap already catches) sitting under a full-screen
 * cookie banner. elementFromPoint is stubbed to return the banner for every
 * point while it is "up", and the real field once it is "dismissed".
 *
 * Run: node tests/ext_fixtures/run_occlusion_check.mjs   (exit 0 = pass)
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

const STACK = [
  "common/api.js",
  "common/yn_theme.js",
  "common/challenge_detect.js",
  "common/label_quality.js",
  "common/overlay_box.js",
  "content/dom_fill_kit.js",
  "content/engine.js",
  "content/detect.js",
  "content/heuristics.js",
  "content/settle_observer.js",
  "content/review_screen.js",
  "content/filler.js",
];

const PROFILE = {
  generic: true,
  contact: {
    first_name: "Sam",
    last_name: "Example",
    email: "student@example.com",
    phone: "07700 900123",
  },
  address: {},
  links: {},
  education: [],
  work: [],
  right_to_work: { uk_rtw: null, needs_sponsorship: null },
  eligibility_extra: { willing_to_relocate: null, uk_driving_licence: null },
  answers: { notice_period: null, salary_expectation: null, earliest_start: null },
  unconfirmed_answers: [],
  derived: {},
};

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

function loadPage(overlayUp) {
  const html = readFileSync(
    path.join(here, "guards", "occlusion_form.html"),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: "https://example.org/occlusion",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const rect = { width: 180, height: 28, top: 40, left: 40, right: 220, bottom: 68 };
  for (const proto of [win.HTMLInputElement, win.HTMLElement]) {
    Object.defineProperty(proto.prototype, "offsetWidth", { get: () => rect.width });
    Object.defineProperty(proto.prototype, "offsetHeight", { get: () => rect.height });
    proto.prototype.getClientRects = () => [rect];
    proto.prototype.getBoundingClientRect = () => rect;
  }
  // no real user is present in this harness — default to the
  // same outcome every fixture here already assumed before the review
  // screen existed (guessed fields still write; there are no drafts on
  // these fixtures to skip).
  win.__ynReviewScript = [];
  win.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        if (typeof cb === "function") cb({ ok: false, error: "no worker in the harness" });
      },
      onMessage: { addListener: () => {} },
    },
    storage: {
      local: {
        get: async (d) => ({ ...(d || {}) }),
        set: async () => {},
        remove: async () => {},
      },
    },
  };
  for (const rel of STACK) {
    const src = readFileSync(path.join(root, "extension", ...rel.split("/")), "utf8");
    vm.runInContext(src, dom.getInternalVMContext(), { filename: rel });
  }
  // Distinct per-element rects (the prototype-wide shim above gives every
  // element the SAME box) so the elementFromPoint stub below can actually
  // tell the two fields apart by coordinate, the way real stacked form
  // fields sit at different vertical positions.
  const boxes = {
    first: { width: 180, height: 28, top: 40, left: 40, right: 220, bottom: 68 },
    email: { width: 180, height: 28, top: 100, left: 40, right: 220, bottom: 128 },
  };
  for (const [id, box] of Object.entries(boxes)) {
    const el = win.document.getElementById(id);
    el.getBoundingClientRect = () => box;
    el.getClientRects = () => [box];
  }
  // The stub the check needs: the banner covers everything
  // while it is up; once dismissed, every point resolves to the element
  // that would ACTUALLY be there (the field itself for a point inside it).
  const overlay = win.document.getElementById("cookie-overlay");
  win.document.elementFromPoint = (x, y) => {
    if (overlayUp) return overlay;
    for (const id of ["first", "email"]) {
      const r = boxes[id];
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return win.document.getElementById(id);
      }
    }
    return win.document.body;
  };
  return win;
}

const val = (win, sel) => win.document.querySelector(sel).value;

// ── 1. Direct check on ynIsHoneypot / ynIsOccludedField ─────────────────
{
  const win = loadPage(true);
  const first = win.document.getElementById("first");
  check("ynIsOccludedField true while the overlay covers the field", () =>
    assert(win.ynIsOccludedField(first, win.document) === true));
  check("ynIsHoneypot true for the same reason", () =>
    assert(win.ynIsHoneypot(first, win.document) === true));
}
{
  const win = loadPage(false);
  const first = win.document.getElementById("first");
  check("ynIsOccludedField false once the overlay is dismissed", () =>
    assert(win.ynIsOccludedField(first, win.document) === false));
  check("ynIsHoneypot false for the same field, same reason", () =>
    assert(win.ynIsHoneypot(first, win.document) === false));
}

// ── 2. End to end through ynFillAnyPage ─────────────────────────────────
{
  console.log("overlay up");
  const win = loadPage(true);
  const out = await win.ynFillAnyPage(PROFILE);
  check("0 writes while the overlay covers the fields", () => {
    assert(val(win, "#first") === "", "wrote: " + val(win, "#first"));
    assert(val(win, "#email") === "", "wrote: " + val(win, "#email"));
  });
  check("nothing landed in report.filled or report.guessed", () => {
    const rep = out.report || {};
    assert((rep.filled || []).length === 0, JSON.stringify(rep.filled));
    assert((rep.guessed || []).length === 0, JSON.stringify(rep.guessed));
  });
}
{
  console.log("overlay dismissed");
  const win = loadPage(false);
  const out = await win.ynFillAnyPage(PROFILE);
  check("both fields fill once the overlay is gone", () => {
    assert(val(win, "#first") === "Sam", "got " + val(win, "#first"));
    assert(val(win, "#email") === "student@example.com", "got " + val(win, "#email"));
  });
  check("both keys landed in report.filled or report.guessed", () => {
    const rep = out.report || {};
    const keys = [...(rep.filled || []), ...(rep.guessed || [])].map(
      (r) => r.fieldKey,
    );
    assert(keys.includes("contact.first_name"), JSON.stringify(keys));
    assert(keys.includes("contact.email"), JSON.stringify(keys));
  });
}

if (failures) {
  console.error("\nocclusion check FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\nocclusion check PASS: fields under a full-screen overlay are refused " +
    "and unwritten; the same fields fill once the overlay is dismissed",
);
