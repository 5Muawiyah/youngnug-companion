/**
 * The label gate's worked example: "a fixture
 * page whose only signal for one input is id='q_8f3a2c' [shows] a needs_you
 * line with a human label or 'unlabelled field', never the raw id".
 *
 * Two levels:
 *   1. Direct unit proof: an element whose ONLY attribute anywhere is a
 *      cryptic id gets "" from ynHumanFieldLabel and "unlabelled field"
 *      from ynReportableFieldLabel — never the id string itself, however
 *      it is called.
 *   2. End to end: a real factual question (a right-to-work checkbox)
 *      whose ELEMENT id is a Salesforce-style cryptic token
 *      (rec-form_682152000000063542, the exact example offeros's own docstring
 *      uses) — the needs_you report line shows the
 *      REAL question text, and the raw id string appears NOWHERE in the
 *      report (grep-style: 0 hits).
 *
 * Run: node tests/ext_fixtures/run_report_label_never_raw_id.mjs
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

// ── 1. Direct unit proof ────────────────────────────────────────────────
{
  const dom = new JSDOM(
    '<input id="q_8f3a2c" name="q_8f3a2c" type="text">',
    { url: "https://example.org/", runScripts: "dangerously" },
  );
  const win = dom.window;
  for (const rel of [
    "common/label_quality.js",
    "content/heuristics.js",
  ]) {
    const src = readFileSync(
      path.join(root, "extension", ...rel.split("/")),
      "utf8",
    );
    vm.runInContext(src, dom.getInternalVMContext(), { filename: rel });
  }
  const el = win.document.getElementById("q_8f3a2c");
  check("ynHumanFieldLabel returns empty for a cryptic-id-only element", () =>
    assert(
      win.ynHumanFieldLabel(el, win.document) === "",
      "got " + JSON.stringify(win.ynHumanFieldLabel(el, win.document)),
    ));
  check(
    'ynReportableFieldLabel falls back to "unlabelled field", never the id',
    () => {
      const got = win.ynReportableFieldLabel(el, win.document, "q_8f3a2c");
      assert(got === "unlabelled field", "got " + JSON.stringify(got));
      assert(!got.includes("q_8f3a2c"), "leaked the raw id: " + got);
    },
  );
}

// ── 2. End to end ────────────────────────────────────────────────────────
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
  work: [],
  right_to_work: { uk_rtw: null, needs_sponsorship: null },
  eligibility_extra: { willing_to_relocate: null, uk_driving_licence: null },
  answers: { notice_period: null, salary_expectation: null, earliest_start: null },
  unconfirmed_answers: ["uk_rtw"],
  derived: {},
};

{
  const html = readFileSync(
    path.join(here, "labels", "cryptic_id_needs_you_form.html"),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: "https://example.org/cryptic-id",
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
  const out = await win.ynFillAnyPage(PROFILE);
  const rep = out.report || {};
  const needsYou = rep.needs_you || [];
  check("a needs_you line exists for the right-to-work question", () =>
    assert(needsYou.length >= 1, JSON.stringify(rep)));
  check("its label is the REAL question text", () =>
    assert(
      needsYou.some((r) => /right to work in the uk/i.test(r.label || "")),
      "got " + JSON.stringify(needsYou),
    ));
  check("the raw cryptic id never appears anywhere in the report", () => {
    const dump = JSON.stringify(rep);
    assert(
      !dump.includes("rec-form_682152000000063542"),
      "the raw id leaked into the report: " + dump,
    );
  });
}

if (failures) {
  console.error("\nreport label FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\nreport label PASS: a cryptic id never surfaces as a label; the " +
    "needs_you line shows the real question instead",
);
