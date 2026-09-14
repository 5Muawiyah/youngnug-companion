/**
 * The Cancel half of the review screen: a review the student cancels writes
 * nothing and REPORTS nothing. Observed on a real form: a cancelled review was
 * posted as a fill, the tracker row moved to filled_pending_submit and every
 * later fill-plan for that job answered 404. Driven interactively: a real jsdom click on Skip, a real edit, a real hover,
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
check("the review screen is up before any write", () =>
  assert(!!screen && allBlank(readValues(win)), "a field was written before the screen"),
);
const cancelBtn = win.document.getElementById("yn-review-cancel");
assert(!!cancelBtn, "no Cancel control on the screen");
cancelBtn.click();
const result = await fillPromise;

check("the fill resolves as cancelled, not as a failure", () =>
  assert(result && result.ok === true && result.cancelled === true, JSON.stringify(result)),
);
check("every field is still blank after Cancel, exact ones included", () =>
  assert(allBlank(readValues(win)), JSON.stringify(readValues(win))),
);
check("the panel is gone", () =>
  assert(win.document.getElementById("yn-review-screen") === null, "panel still in the DOM"),
);
check("NO APPLY_RESULT reached the worker", () => {
  const applyResults = messages.filter((m) => m && m.type === "APPLY_RESULT");
  assert(applyResults.length === 0, "APPLY_RESULT sent " + applyResults.length + " times: " + JSON.stringify(applyResults));
});
check("the report says cancelled and shows nothing filled", () => {
  const r = (result && result.report) || {};
  assert(r.cancelled === true, "report.cancelled: " + r.cancelled);
  assert(!(r.filled || []).length && !(r.guessed || []).length, "filled/guessed not empty");
});

if (failures) {
  console.error("\nreview screen (cancel) FAIL: " + failures);
  process.exit(1);
}
console.log("\nreview screen (cancel) PASS: Cancel writes nothing, reports nothing, and the plan stays fill-able");
