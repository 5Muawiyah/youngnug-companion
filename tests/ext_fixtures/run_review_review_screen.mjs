/**
 * The review screen between planning and writing, driven
 * interactively: a real jsdom click on Skip, a real edit, a real hover,
 * and exactly one real click on the screen's own Approve button. Unlike
 * every other fixture in this suite, window.__ynReviewScript is left
 * UNDEFINED here on purpose — the whole point of this file is to prove the
 * screen genuinely waits for a real interaction rather than resolving
 * itself, and that hovering, editing or skipping a row writes nothing to
 * the page.
 *
 * Fixture: tests/ext_fixtures/review_screen/review_mixed_form.html — 3 exact fields
 * (spec autocomplete), 2 guessed fields (label only), 1 free-text
 * archetype (why_company) the drafter turns into a draft.
 *
 * Run: node tests/ext_fixtures/run_review_review_screen.mjs   (exit 0 = pass)
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

// The full production click-time stack, read from popup.js's own
// YN_FILL_SCRIPTS array — the same source tests/ext_harness.py reads, so
// this cannot silently drift from what a real fill actually injects.
function ynFillScripts() {
  const src = readFileSync(path.join(root, "extension", "popup.js"), "utf8");
  // `const` or `var`: a shipped file esbuild has bundled from
  // extension/src/ always emits a top-level module binding as `var`.
  const m = src.match(/(?:const|var) YN_FILL_SCRIPTS\s*=\s*\[([\s\S]*?)\];/);
  if (!m) throw new Error("YN_FILL_SCRIPTS not found in popup.js");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((r) => r[1]);
}
const STACK = ynFillScripts();

const PLAN = {
  job_id: 1,
  contact: {
    first_name: "Sam",
    last_name: "Example",
    email: "student@example.com",
    phone: "07700 900123",
  },
  address: { line1: "1 Example Street", city: "London", postcode: "SW1A 1AA" },
  links: { linkedin: "https://www.linkedin.com/in/example-student" },
  education: [],
  work: [],
  right_to_work: { uk_rtw: true, needs_sponsorship: false },
  eligibility_extra: {},
  answers: {},
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
    console.error("  FAIL " + name + " - " + e.message);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function waitFor(predicate, tries = 400, delayMs = 5) {
  for (let i = 0; i < tries; i++) {
    const v = predicate();
    if (v) return v;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("waitFor: condition never became true");
}

function loadPage() {
  const html = readFileSync(
    path.join(root, "tests", "ext_fixtures", "review_screen", "review_mixed_form.html"),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: "https://example.org/apply",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const rect = { width: 180, height: 28, top: 40, left: 40, right: 220, bottom: 68 };
  for (const proto of [win.HTMLInputElement, win.HTMLTextAreaElement, win.HTMLSelectElement]) {
    Object.defineProperty(proto.prototype, "offsetWidth", { get: () => rect.width });
    Object.defineProperty(proto.prototype, "offsetHeight", { get: () => rect.height });
    proto.prototype.getClientRects = () => [rect];
    proto.prototype.getBoundingClientRect = () => rect;
  }
  const messages = [];
  // window.__ynReviewScript is deliberately NOT set here — a real fill
  // waits for a genuine click, and this file exists to prove that.
  win.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        messages.push(msg);
        let resp = { ok: false, error: "no worker in the harness" };
        if (msg && msg.type === "GET_FILL_PLAN") {
          resp = Object.assign({ ok: true }, PLAN);
        } else if (msg && msg.type === "GENERATE_ANSWER") {
          resp = {
            ok: true,
            text: "I want to build products that help students.",
            verdict: "clean",
            refs: ["experience-0"],
          };
        }
        if (typeof cb === "function") cb(resp);
        return Promise.resolve(resp);
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
  return { win, messages };
}

const FIELD_IDS = ["first_name", "email", "phone", "city", "linkedin", "why_join"];
function readValues(win) {
  const out = {};
  for (const id of FIELD_IDS) out[id] = win.document.getElementById(id).value;
  return out;
}
function allBlank(values) {
  return Object.values(values).every((v) => v === "");
}

const { win, messages } = loadPage();

const fillPromise = win.ynFillApplication(1);
const screen = await waitFor(() => win.document.getElementById("yn-review-screen"));
assert(!!screen, "review screen never rendered");

// ── DOM diff 0 before Approve ────────────────────────────────────────────
const before = readValues(win);
check("nothing written before Approve (DOM diff 0)", () =>
  assert(allBlank(before), "a field was already filled: " + JSON.stringify(before)),
);

// ── hover outlines the live element, writes nothing ─────────────────────
const cityRow = win.document.querySelector('[data-field-key="address.city"]');
assert(!!cityRow, "guessed row for address.city missing from the screen");
const cityInput = win.document.getElementById("city");
cityRow.dispatchEvent(new win.MouseEvent("mouseenter", { bubbles: false }));
check("hover highlights the live element", () =>
  assert(cityInput.classList.contains("yn-fill-check"), "hover did not outline #city"),
);
cityRow.dispatchEvent(new win.MouseEvent("mouseleave", { bubbles: false }));
check("leaving clears the highlight", () =>
  assert(!cityInput.classList.contains("yn-fill-check"), "highlight left behind after mouseleave"),
);
check("hover wrote nothing to the page", () =>
  assert(allBlank(readValues(win)), "a field changed value on hover"),
);

// ── draft row: Edit writes nothing to the PAGE (only to the panel's own textarea) ──
const draftRow = win.document.querySelector('[data-field-key="generated:why_company"]');
assert(!!draftRow, "draft row for generated:why_company missing from the screen");
const editBtn = draftRow.querySelector('[data-action="edit"]');
editBtn.click();
const editBox = draftRow.querySelector("textarea");
assert(!!editBox, "draft row has no edit textarea");
editBox.value = "I care about helping students find real jobs.";
editBox.dispatchEvent(new win.Event("input", { bubbles: true }));
check("editing a draft writes nothing to the page", () =>
  assert(allBlank(readValues(win)), "a field changed value while editing the draft"),
);

// ── draft row: Skip writes nothing ───────────────────────────────────────
const skipBtn = draftRow.querySelector('[data-action="skip"]');
skipBtn.click();
check("skipping a draft writes nothing to the page", () =>
  assert(allBlank(readValues(win)), "a field changed value on Skip"),
);

// ── exactly one Approve releases the whole write ─────────────────────────
const approveBtn = win.document.getElementById("yn-review-approve");
assert(!!approveBtn, "no Approve control on the screen");
approveBtn.click();
// A second click on the SAME (now detached) button — proves "one Approve
// per fill" holds even under a double-click, not merely because the panel
// happened to disappear before a second press could land.
approveBtn.click();
const result = await fillPromise;

check("fill resolved ok", () => assert(result && result.ok, JSON.stringify(result)));
const after = readValues(win);
check("5 fields written after Approve", () => {
  assert(after.first_name === "Sam", "first_name: " + after.first_name);
  assert(after.email === "student@example.com", "email: " + after.email);
  assert(after.phone === "07700 900123", "phone: " + after.phone);
  assert(after.city === "London", "city: " + after.city);
  assert(
    after.linkedin === "https://www.linkedin.com/in/example-student",
    "linkedin: " + after.linkedin,
  );
});
check("the SKIPPED edited draft is absent from the DOM", () =>
  assert(after.why_join === "", "why_join should be empty, got: " + after.why_join),
);
check("the panel is removed after Approve (a second click is impossible)", () =>
  assert(win.document.getElementById("yn-review-screen") === null, "panel still in the DOM"),
);

const report = (result && result.report) || {};
check("report shows 3 filled, 2 guessed", () => {
  assert((report.filled || []).length === 3, "filled: " + JSON.stringify(report.filled));
  assert((report.guessed || []).length === 2, "guessed: " + JSON.stringify(report.guessed));
});
check("the skipped draft is reported, not silently dropped", () => {
  const drafts = report.drafts || [];
  assert(drafts.length === 1, "drafts: " + JSON.stringify(drafts));
  assert(drafts[0].written === false, "expected written:false, got " + JSON.stringify(drafts[0]));
  const needsYou = report.needs_you || [];
  assert(
    needsYou.some((n) => n.fieldKey === "generated:why_company"),
    "the skipped draft never reached needs_you: " + JSON.stringify(needsYou),
  );
});
check("APPLY_RESULT reached the worker exactly once for this fill", () => {
  const applyResults = messages.filter((m) => m && m.type === "APPLY_RESULT");
  assert(applyResults.length === 1, "APPLY_RESULT sent " + applyResults.length + " times");
});

// The Undo button stashes and reverts inside ynExecuteIntents itself, so a
// review-approved write needs no separate wiring — this is the check that
// it actually is not separate.
check("Undo reverts the review-approved writes too", () => {
  assert(typeof win.ynUndoFill === "function", "ynUndoFill missing from the click-time stack");
  const undone = win.ynUndoFill();
  const cleared = readValues(win);
  assert(allBlank(cleared), "Undo left a value behind: " + JSON.stringify(cleared));
  assert(undone && undone.reverted === 5, "expected 5 reverted, got " + JSON.stringify(undone));
});

if (failures) {
  console.error("\nreview screen (interactive) FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\nreview screen (interactive) PASS: DOM diff 0 before Approve, hover/edit/skip write " +
    "nothing, one Approve click released 3 exact + 2 guessed, the skipped draft never " +
    "reached the page",
);
