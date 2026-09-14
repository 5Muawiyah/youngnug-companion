/**
 * Five extra label sources, each gated by the
 * label quality filter. Fixture: tests/ext_fixtures/labels/
 * extra_label_sources_form.html — one field per source, each with no OTHER
 * signal that could resolve it, plus one decoy that must not mis-map.
 *
 * Run: node tests/ext_fixtures/run_extra_label_sources.mjs   (exit 0 = pass)
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
  address: { line1: "1 Example Street", city: "London", postcode: "SW1A 1AA", country: "United Kingdom" },
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

function loadPage() {
  const html = readFileSync(
    path.join(here, "labels", "extra_label_sources_form.html"),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: "https://example.org/extra-labels",
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

const win = loadPage();
const val = (sel) => win.document.querySelector(sel).value;
const out = await win.ynFillAnyPage(PROFILE);
const rep = out.report || {};
const amberKeys = [...(rep.guessed || []), ...(rep.filled || [])].map((r) => r.fieldKey);

check("(a) aria-describedby resolves email", () =>
  assert(val("#f-a") === "student@example.com", "got " + JSON.stringify(val("#f-a"))));
check("(b) id-naming-convention label resolves first name", () =>
  assert(val("#fname") === "Sam", "got " + JSON.stringify(val("#fname"))));
check("(c) label-attr on a bounded ancestor resolves postcode", () =>
  assert(val("#f-c") === "SW1A 1AA", "got " + JSON.stringify(val("#f-c"))));
check("(d) shadow-host attribute fallback resolves last name", () => {
  const host = win.document.getElementById("host-d");
  const inner = host.shadowRoot.getElementById("f-d");
  assert(inner.value === "Example", "got " + JSON.stringify(inner.value));
});
check("(e) data-testid=phone-number resolves phone", () =>
  assert(val("#f-e") === "07700 900123", "got " + JSON.stringify(val("#f-e"))));
check("4 of 4 resolve at confidence guessed (none exact)", () => {
  const exactKeys = (rep.filled || []).map((r) => r.fieldKey);
  for (const k of ["contact.email", "contact.first_name", "address.postcode", "contact.phone"]) {
    assert(amberKeys.includes(k), k + " never resolved: " + JSON.stringify(amberKeys));
    assert(!exactKeys.includes(k), k + " came back exact, expected guessed");
  }
});
check("(decoy) data-testid=company-name does NOT map to first name", () =>
  assert(val("#f-decoy") === "", "wrongly wrote: " + JSON.stringify(val("#f-decoy"))));

if (failures) {
  console.error("\nextra label sources FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\nextra label sources PASS: 4 of 4 new sources resolve; the data-testid " +
    "decoy never mis-maps",
);
