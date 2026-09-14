/**
 * The review screen's second fixture: a draft the validator
 * REFUSED. The review screen must show a refusal row (an icon and one
 * short line, no approve/edit/skip controls, because it can never be
 * written) and Approve must still release the other fields while leaving
 * that one blank — a refusal is explained, never silently dropped.
 *
 * Same fixture as run_review_review_screen.mjs (tests/ext_fixtures/review_screen/
 * review_mixed_form.html); the only difference is the worker's canned
 * GENERATE_ANSWER answer.
 *
 * Run: node tests/ext_fixtures/run_review_refused_draft.mjs   (exit 0 = pass)
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
  // window.__ynReviewScript deliberately unset: driven by a real click below.
  win.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        let resp = { ok: false, error: "no worker in the harness" };
        if (msg && msg.type === "GET_FILL_PLAN") {
          resp = Object.assign({ ok: true }, PLAN);
        } else if (msg && msg.type === "GENERATE_ANSWER") {
          // The server-side validator REFUSED this draft.
          resp = {
            ok: false,
            error: "grounding failed",
            verdict: ["number_not_in_facts:47", "unknown_proper_noun:deloitte"],
            refs: [],
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
  return win;
}

const win = loadPage();
const fillPromise = win.ynFillApplication(1);
const screen = await waitFor(() => win.document.getElementById("yn-review-screen"));
assert(!!screen, "review screen never rendered");

const draftRow = win.document.querySelector('[data-field-key="generated:why_company"]');
check("the refused draft still gets its own row", () => assert(!!draftRow, "no row for the refused draft"));

check("the refusal row carries the icon-and-line, not a value box", () => {
  assert(!draftRow.querySelector("[data-yn-review-value]"), "a refused row must not show a value line");
  assert(/Refused, write it yourself\./.test(draftRow.textContent), "no refusal line: " + draftRow.textContent);
});

check("a refused row has no approve/edit/skip controls", () => {
  assert(!draftRow.querySelector('[data-action="approve"]'), "refused row must not offer Approve");
  assert(!draftRow.querySelector('[data-action="edit"]'), "refused row must not offer Edit");
  assert(!draftRow.querySelector('[data-action="skip"]'), "refused row must not offer Skip");
});

const approveBtn = win.document.getElementById("yn-review-approve");
approveBtn.click();
const result = await fillPromise;

const dom = {};
for (const id of ["first_name", "email", "phone", "city", "linkedin", "why_join"]) {
  dom[id] = win.document.getElementById(id).value;
}
check("the other five fields still fill", () => {
  assert(dom.first_name === "Sam", dom.first_name);
  assert(dom.email === "student@example.com", dom.email);
  assert(dom.phone === "07700 900123", dom.phone);
  assert(dom.city === "London", dom.city);
  assert(dom.linkedin === "https://www.linkedin.com/in/example-student", dom.linkedin);
});
check("0 writes for the refused field", () => assert(dom.why_join === "", dom.why_join));

const drafts = ((result && result.report) || {}).drafts || [];
check("the refusal verdict travels in report.drafts", () => {
  assert(drafts.length === 1, JSON.stringify(drafts));
  assert(drafts[0].written === false, JSON.stringify(drafts[0]));
  assert(
    Array.isArray(drafts[0].verdict) && drafts[0].verdict.includes("number_not_in_facts:47"),
    JSON.stringify(drafts[0].verdict),
  );
});

if (failures) {
  console.error("\nreview screen (refused draft) FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\nreview screen (refused draft) PASS: refusal row shown with no controls, " +
    "0 writes for that field, the other five still filled on Approve",
);
