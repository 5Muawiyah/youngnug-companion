/**
 * Text-phrase CAPTCHA detection alongside the
 * iframe/id sentinels (common/challenge_detect.js).
 *
 * Two levels:
 *   1. Pure string check: 6 phrase examples all trip ynIsCaptchaLabelText,
 *      3 decoys (including "Human Resources contact name", the named
 *      exclusion) never do.
 *   2. End to end through the REAL production wiring: ynChallengePage() is
 *      checked before any write inside ynFillAnyPage (content/filler.js,
 *      nothing here modifies it), so a page
 *      carrying the captcha-phrase field stops with error "captcha_stop"
 *      and 0 writes ANYWHERE on the page, while a page carrying only the
 *      three decoys fills normally.
 *
 * Run: node tests/ext_fixtures/run_captcha_text_fields.mjs   (exit 0 = pass)
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

// ── 1. Pure string check ────────────────────────────────────────────────
{
  const src = readFileSync(
    path.join(root, "extension", "common", "challenge_detect.js"),
    "utf8",
  );
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "common/challenge_detect.js" });
  const { ynIsCaptchaLabelText } = ctx;

  const PHRASES = [
    "Are you a human?",
    "You are a human — prove it below",
    "IF you are a human, type ALAN below",
    "Type the image text below",
    "Enter the characters shown",
    "Security check",
    "I'm not a robot",
  ];
  const DECOYS = [
    "Human Resources contact name",
    "Are you a Human Resources professional?",
    "Do you hold a current security clearance?",
  ];

  check(PHRASES.length + " phrase examples all trip the detector", () => {
    const missed = PHRASES.filter((p) => !ynIsCaptchaLabelText(p));
    assert(missed.length === 0, "missed: " + JSON.stringify(missed));
  });
  check("3 decoys, 0 of 3 trip the detector", () => {
    const tripped = DECOYS.filter((d) => ynIsCaptchaLabelText(d));
    assert(tripped.length === 0, "false positive(s): " + JSON.stringify(tripped));
  });
}

// ── 2. End to end through ynFillAnyPage ─────────────────────────────────
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
  address: {
    line1: "1 Example Street",
    city: "London",
    postcode: "SW1A 1AA",
    country: "United Kingdom",
  },
  links: {},
  education: [],
  work: [],
  right_to_work: { uk_rtw: true, needs_sponsorship: false },
  eligibility_extra: { willing_to_relocate: null, uk_driving_licence: null },
  answers: { notice_period: null, salary_expectation: null, earliest_start: null },
  unconfirmed_answers: [
    "willing_to_relocate",
    "uk_driving_licence",
    "notice_period",
    "salary_expectation",
    "earliest_start",
  ],
  derived: { years_of_experience: null, highest_qualification: null },
};

function loadPage(fixturePath) {
  const html = readFileSync(fixturePath, "utf8");
  const dom = new JSDOM(html, {
    url: "https://example.org/fixture",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const rect = { width: 180, height: 28, top: 40, left: 40, right: 220, bottom: 68 };
  for (const proto of [
    win.HTMLInputElement,
    win.HTMLTextAreaElement,
    win.HTMLSelectElement,
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
    const s = readFileSync(path.join(root, "extension", ...rel.split("/")), "utf8");
    vm.runInContext(s, dom.getInternalVMContext(), { filename: rel });
  }
  return win;
}

const val = (win, sel) => win.document.querySelector(sel).value;

{
  console.log("text_phrase_captcha_form.html");
  const win = loadPage(path.join(here, "captcha", "text_phrase_captcha_form.html"));
  const out = await win.ynFillAnyPage(PROFILE);
  check("stops with error captcha_stop", () =>
    assert(out && out.error === "captcha_stop", "got " + JSON.stringify(out && out.error)));
  check("ok is false", () => assert(out.ok === false, "got ok=" + out.ok));
  check("0 writes anywhere on the page (first name)", () =>
    assert(val(win, "#first") === "", "wrote: " + val(win, "#first")));
  check("0 writes anywhere on the page (email)", () =>
    assert(val(win, "#email") === "", "wrote: " + val(win, "#email")));
  check("the captcha field itself is untouched", () =>
    assert(val(win, "#human-check") === "", "wrote: " + val(win, "#human-check")));
}

{
  console.log("no_captcha_decoy_form.html");
  const win = loadPage(path.join(here, "captcha", "no_captcha_decoy_form.html"));
  const out = await win.ynFillAnyPage(PROFILE);
  check("no false stop (ok true)", () =>
    assert(out && out.ok === true, "got " + JSON.stringify(out && out.error)));
  check("first name fills normally beside the decoys", () =>
    assert(val(win, "#first") === "Sam", "got " + val(win, "#first")));
  check("email fills normally beside the decoys", () =>
    assert(val(win, "#email") === "student@example.com", "got " + val(win, "#email")));
  check("none of the three decoys is invented", () => {
    assert(val(win, "#hr-name") === "", "invented: " + val(win, "#hr-name"));
    assert(val(win, "#hr-role") === "", "invented: " + val(win, "#hr-role"));
    assert(val(win, "#sec-clearance") === "", "invented: " + val(win, "#sec-clearance"));
  });
}

if (failures) {
  console.error("\ncaptcha text fields FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\ncaptcha text fields PASS: 6 of 6 phrases stop, 0 of 3 decoys stop; " +
    "the real fixture halts the whole page with 0 writes and the decoy " +
    "fixture fills normally",
);
