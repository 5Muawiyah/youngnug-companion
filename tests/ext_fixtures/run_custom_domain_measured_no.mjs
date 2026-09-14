/**
 * A component-library fingerprint tier between
 * named adapters and raw heuristics, for custom-domain tenants. "Low
 * value; a measured no is acceptable if a real custom-domain tenant
 * already resolves name/email/phone."
 *
 * This IS the measured no: a Workable-shaped tenant on ITS OWN custom
 * domain (no apply.workable.com URL, no data-ui="application-form"
 * fingerprint, so content/detect.js honestly answers "unknown" and no
 * adapter runs) already resolves name/email/phone 3 of 3 through the
 * PLAIN generic heuristics rung — no new detect.js tier was built, and
 * this fixture is the proof of why not.
 *
 * Run: node tests/ext_fixtures/run_custom_domain_measured_no.mjs
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

const html = readFileSync(
  path.join(here, "custom_domain", "workable_custom_domain_form.html"),
  "utf8",
);
const dom = new JSDOM(html, {
  // Deliberately NOT apply.workable.com — the whole point of the fixture.
  url: "https://careers.example.com/jobs/123/candidates/new",
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

check('ynDetectAts honestly answers "unknown" (no URL/DOM signature fires)', () => {
  const ats = win.ynDetectAts(win.document, win.location.href);
  assert(ats.id === "unknown", "got " + JSON.stringify(ats));
});

const out = await win.ynFillAnyPage(PROFILE);
const val = (id) => win.document.getElementById(id).value;

check("name/email/phone resolve 3 of 3 through plain heuristics alone", () => {
  assert(val("firstname") === "Sam", "got " + JSON.stringify(val("firstname")));
  assert(val("lastname") === "Example", "got " + JSON.stringify(val("lastname")));
  assert(val("email") === "s@example.com", "got " + JSON.stringify(val("email")));
});
check("phone also resolves (a 4th field, free)", () =>
  assert(val("phone") === "07700 900123", "got " + JSON.stringify(val("phone"))));

if (failures) {
  console.error("\ncustom domain measured-no FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\ncustom domain measured-no PASS: 3 of 3 (name/email/phone) resolve on " +
    "an unrecognised custom-domain tenant with no library-fingerprint tier " +
    "built — the measured no this fixture records",
);
