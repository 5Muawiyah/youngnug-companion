/**
 * The review screen's documented failure mode: if content/review_screen.js
 * is somehow missing from the injected stack, ynReviewGate must fail OPEN
 * (everything still writes, exactly as before the review screen existed) and log
 * one report.errors row, never block the fill silently. Proves
 * MESSAGE_CONTRACT.md's "Review screen" section is not just a claim.
 *
 * Run: node tests/ext_fixtures/run_review_fail_open.mjs   (exit 0 = pass)
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

// The full click-time stack MINUS content/review_screen.js — the one
// deliberate omission this file exists to test.
function ynFillScripts() {
  const src = readFileSync(path.join(root, "extension", "popup.js"), "utf8");
  // `const` or `var`: a shipped file esbuild has bundled from
  // extension/src/ always emits a top-level module binding as `var`.
  const m = src.match(/(?:const|var) YN_FILL_SCRIPTS\s*=\s*\[([\s\S]*?)\];/);
  if (!m) throw new Error("YN_FILL_SCRIPTS not found in popup.js");
  return [...m[1].matchAll(/"([^"]+)"/g)]
    .map((r) => r[1])
    .filter((rel) => rel !== "content/review_screen.js");
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
win.chrome = {
  runtime: {
    lastError: null,
    sendMessage: (msg, cb) => {
      let resp = { ok: false, error: "no worker in the harness" };
      if (msg && msg.type === "GET_FILL_PLAN") resp = Object.assign({ ok: true }, PLAN);
      else if (msg && msg.type === "GENERATE_ANSWER") {
        resp = { ok: true, text: "I want to build products.", verdict: "clean", refs: [] };
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

check("ynShowReviewScreen is genuinely absent from this stack", () =>
  assert(typeof win.ynShowReviewScreen === "undefined", "review_screen.js leaked in anyway"),
);

const result = await win.ynFillApplication(1);
check("the fill still resolves ok", () => assert(result && result.ok, JSON.stringify(result)));

const val = (id) => win.document.getElementById(id).value;
check("every field still writes (fail OPEN, not fail closed)", () => {
  assert(val("first_name") === "Sam", val("first_name"));
  assert(val("email") === "student@example.com", val("email"));
  assert(val("phone") === "07700 900123", val("phone"));
  assert(val("city") === "London", val("city"));
  assert(
    val("linkedin") === "https://www.linkedin.com/in/example-student",
    val("linkedin"),
  );
});

const errors = (result.report && result.report.errors) || [];
check("exactly one error names the missing review screen", () => {
  assert(
    errors.some((e) => /ynShowReviewScreen missing/.test(e.label || "")),
    "no error row named the missing file: " + JSON.stringify(errors),
  );
});

if (failures) {
  console.error("\nreview screen (fail-open) FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\nreview screen (fail-open) PASS: a missing review_screen.js still fills every field " +
    "and logs one error, never a silent block",
);
