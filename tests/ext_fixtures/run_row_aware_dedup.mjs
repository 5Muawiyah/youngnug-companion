/**
 * Row-aware grouping BEFORE the
 * one-key-per-page dedup, and confirmation that a later wizard step
 * re-asking a question still fills.
 *
 * This covers content/heuristics.js only; repeater.js (clicking an
 * Add control the stated number of times) and the executed-key-by-element-
 * path storage in content/filler.js are out of scope here:
 * only the rows already rendered on a static page are grouped and
 * assigned by DOM order below, never a click that grows new rows. What IS
 * proven:
 *
 *   1. Two Employer inputs ALREADY rendered in two separate row containers:
 *      both claimed, row 2's company equals profile.work[1].employer, not
 *      a repeat of row 1 — the fixture's own literal acceptance wording.
 *   2. A two-step wizard re-asking email on step 2: filled on step 2,
 *      exactly as on step 1 (each page is a fresh ynHeuristicIntents call;
 *      the dedup never persists ACROSS pages).
 *
 * Run: node tests/ext_fixtures/run_row_aware_dedup.mjs
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
  contact: { first_name: "Sam", last_name: "Example", email: "s@example.com", phone: "07700 900123" },
  address: {},
  links: {},
  education: [],
  work: [
    { employer: "Example Retail Ltd", title: "Weekend Sales Assistant" },
    { employer: "Second Employer Ltd", title: "Intern" },
  ],
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

function loadPage(fixtureRelPath, url) {
  const html = readFileSync(path.join(here, fixtureRelPath), "utf8");
  const dom = new JSDOM(html, {
    url: url || "https://example.org/fixture",
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
  return win;
}

// ── 1. Two Employer inputs in a repeated block ────────────────────────────
{
  console.log("repeated_experience_rows_form.html");
  const win = loadPage("rows/repeated_experience_rows_form.html");
  const val = (id) => win.document.getElementById(id).value;
  await win.ynFillAnyPage(PROFILE);

  check("row 0's company equals profile.work[0].employer", () =>
    assert(val("emp0") === "Example Retail Ltd", "got " + JSON.stringify(val("emp0"))));
  check("row 0's title equals profile.work[0].title", () =>
    assert(val("title0") === "Weekend Sales Assistant", "got " + JSON.stringify(val("title0"))));
  check("row 1's company equals profile.work[1].employer, NOT a repeat of row 0", () =>
    assert(val("emp1") === "Second Employer Ltd", "got " + JSON.stringify(val("emp1"))));
  check("row 1's title equals profile.work[1].title", () =>
    assert(val("title1") === "Intern", "got " + JSON.stringify(val("title1"))));
  check("row 1 was genuinely claimed, not silently dropped by the dedup", () =>
    assert(val("emp1") !== val("emp0"), "row 1 collapsed onto row 0"));
}

// ── 2. A later wizard step re-asking email fills, same as step 1 ────────
{
  console.log("wizard_step1_email_form.html + wizard_step2_email_form.html");
  const step1 = loadPage("rows/wizard_step1_email_form.html", "https://example.org/step1");
  await step1.ynFillAnyPage(PROFILE);
  check("step 1's email fills", () =>
    assert(
      step1.document.getElementById("email").value === "s@example.com",
      "got " + JSON.stringify(step1.document.getElementById("email").value),
    ));

  const step2 = loadPage("rows/wizard_step2_email_form.html", "https://example.org/step2");
  await step2.ynFillAnyPage(PROFILE);
  check("step 2 re-asking email ALSO fills (fresh page, fresh dedup)", () =>
    assert(
      step2.document.getElementById("email2").value === "s@example.com",
      "got " + JSON.stringify(step2.document.getElementById("email2").value),
    ));
}

if (failures) {
  console.error("\nrow-aware dedup FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\nrow-aware dedup PASS: two rendered rows fill from their OWN profile " +
    "entry; a later wizard step re-asking a question still fills",
);
