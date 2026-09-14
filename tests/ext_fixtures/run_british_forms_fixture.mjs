/**
 * The 20-label British-forms acceptance: "a 20-label fixture of British forms (Forename,
 * Surname, Post code, Mobile, Town/City) resolves 20 of 20; no new false
 * claim on the decoy set."
 *
 * Two levels:
 *   1. Pure pattern match — ynMatchLabelPatterns(signal), the exact
 *      function every field's signal is tested against, called directly
 *      for all 20 labels. This is deliberately NOT run through the full
 *      page fill: heuristics.js's own "one intent per profile key per
 *      page" dedup (the row-aware grouping's job, not this one's) would zero out
 *      several of these 20 on a single shared page purely because they
 *      share a KEY with an earlier field, which would say nothing about
 *      whether the REGEX resolved the label — this test isolates that.
 *   2. The fixture itself (tests/ext_fixtures/synonyms/british_forms_form.html,
 *      referenced here) run through the real ynFillAnyPage, proving the
 *      three decoys ("Company name", "Emergency contact number",
 *      "Username") gain no new false claim from the synonym additions.
 *
 * Run: node tests/ext_fixtures/run_british_forms_fixture.mjs
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

// ── 1. Pure pattern match, all 20 in isolation ──────────────────────────
{
  const src = readFileSync(
    path.join(root, "extension", "content", "heuristics.js"),
    "utf8",
  );
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "content/heuristics.js" });
  const { ynMatchLabelPatterns } = ctx;

  const LABELS = [
    ["Forename", "contact.first_name"],
    ["Surname", "contact.last_name"],
    ["Christian name", "contact.first_name"],
    ["Sur name", "contact.last_name"],
    ["Post code", "address.postcode"],
    ["Mobile", "contact.phone"],
    ["Landline", "contact.phone"],
    ["Town/City", "address.city"],
    ["Second line of address", "address.line2"],
    ["Flat", "address.line2"],
    ["E-mail", "contact.email"],
    ["Driving licence", "eligibility_extra.uk_driving_licence"],
    ["Driver's licence", "eligibility_extra.uk_driving_licence"],
    ["Period of notice", "answers.notice_period"],
    ["Notice period", "answers.notice_period"],
    ["How much experience do you have?", "derived.years_of_experience"],
    ["Years of experience", "derived.years_of_experience"],
    ["Name of employer", "work.0.employer"],
    ["Role title", "work.0.title"],
    ["Job title", "work.0.title"],
  ];

  check(LABELS.length + " British-forms labels resolve 20 of 20", () => {
    assert(LABELS.length === 20, "fixture size drifted: " + LABELS.length);
    const wrong = [];
    for (const [label, wantKey] of LABELS) {
      const hit = ynMatchLabelPatterns(label);
      if (!hit || hit.key !== wantKey) {
        wrong.push({ label, wantKey, got: hit && hit.key });
      }
    }
    assert(
      wrong.length === 0,
      wrong.length + " of 20 unresolved: " + JSON.stringify(wrong),
    );
  });
}

// ── 2. The fixture itself: decoys gain no new false claim ───────────────
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
  address: { line1: "1 Example Street", line2: "Flat 2", city: "London", postcode: "SW1A 1AA", country: "United Kingdom" },
  links: {},
  education: [],
  work: [{ employer: "Example Ltd", title: "Analyst" }],
  right_to_work: { uk_rtw: null, needs_sponsorship: null },
  eligibility_extra: { willing_to_relocate: null, uk_driving_licence: true },
  answers: { notice_period: "1 month", salary_expectation: null, earliest_start: null },
  unconfirmed_answers: [],
  derived: { years_of_experience: 2, highest_qualification: "A-levels" },
};

{
  const html = readFileSync(
    path.join(here, "synonyms", "british_forms_form.html"),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: "https://example.org/british-forms",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const rect = { width: 180, height: 28, top: 40, left: 40, right: 220, bottom: 68 };
  for (const proto of [
    win.HTMLInputElement,
    win.HTMLTextAreaElement,
    win.HTMLSelectElement,
    win.HTMLElement,
  ]) {
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
  await win.ynFillAnyPage(PROFILE);
  const val = (id) => win.document.getElementById(id).value;

  check("decoy: Company name is never invented", () =>
    assert(val("d1") === "", "wrote: " + JSON.stringify(val("d1"))));
  check("decoy: Emergency contact number is never invented", () =>
    assert(val("d2") === "", "wrote: " + JSON.stringify(val("d2"))));
  check("decoy: Username is never invented", () =>
    assert(val("d3") === "", "wrote: " + JSON.stringify(val("d3"))));
}

if (failures) {
  console.error("\nbritish forms FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\nbritish forms PASS: 20 of 20 labels resolve; the three decoys gain " +
    "no new false claim",
);
