/**
 * The three-way guard classifier,
 * ynGuardClassOf(label, optionTexts), in content/engine.js. Pure string
 * test: 24 labelled groups, 8 sensitive / 8 truth / 8 policy.
 *
 * Includes the two named collisions the row exists to fix:
 *   "I am authorised to work in the UK" -> truth (NOT policy — the old
 *     YN_TERMS_SIGNAL_RE's bare `authori[sz]e` token used to catch this)
 *   "Please select one" with options naming sponsorship -> truth BY THE
 *     OPTION TEXT, not the (neutral) question text.
 *
 * Run: node tests/ext_fixtures/run_guard_classes.mjs   (exit 0 = all pass)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const src = readFileSync(
  path.join(root, "extension", "content", "engine.js"),
  "utf8",
);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: "content/engine.js" });
const { ynGuardClassOf } = ctx;

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

const CASES = [
  // ── 8 sensitive ─────────────────────────────────────────────────────
  ["What is your gender?", [], "sensitive"],
  ["Please select your ethnicity", [], "sensitive"],
  ["Do you have a disability?", [], "sensitive"],
  ["Are you a veteran?", [], "sensitive"],
  ["What is your sexual orientation?", [], "sensitive"],
  [
    "Please select one",
    ["Male", "Female", "Non-binary", "Prefer not to say"],
    "sensitive",
  ],
  ["Gender identity", [], "sensitive"],
  ["Race / ethnicity", [], "sensitive"],

  // ── 8 truth ──────────────────────────────────────────────────────────
  ["I am authorised to work in the UK", [], "truth"],
  ["Do you require visa sponsorship?", [], "truth"],
  ["What is your citizenship status?", [], "truth"],
  ["Do you hold permanent residency?", [], "truth"],
  [
    "Please select one",
    ["I require sponsorship", "I do not require sponsorship"],
    "truth",
  ],
  ["Are you legally eligible to work in this country?", [], "truth"],
  ["What is your right to work status?", [], "truth"],
  ["Do you have indefinite leave to remain?", [], "truth"],

  // ── 8 policy ─────────────────────────────────────────────────────────
  ["I agree to the privacy policy", [], "policy"],
  ["I agree to the terms and conditions", [], "policy"],
  ["I consent to GDPR data processing", [], "policy"],
  ["Subscribe to job alerts", [], "policy"],
  ["Sign up for our marketing newsletter", [], "policy"],
  ["I consent to receive SMS updates", [], "policy"],
  ["Opt in to promotional emails", [], "policy"],
  ["I agree to be contacted", [], "policy"],
];

check("24 groups classed correctly (8 sensitive / 8 truth / 8 policy)", () => {
  assert(CASES.length === 24, "fixture size drifted: " + CASES.length);
  const wrong = [];
  for (const [label, options, expected] of CASES) {
    const got = ynGuardClassOf(label, options);
    if (got !== expected) {
      wrong.push({ label, options, expected, got });
    }
  }
  assert(
    wrong.length === 0,
    wrong.length + " of 24 misclassified: " + JSON.stringify(wrong),
  );
});
check('"I am authorised to work in the UK" is truth, not policy (the fix)', () => {
  assert(ynGuardClassOf("I am authorised to work in the UK", []) === "truth");
});
check('"Please select one" classes as truth from OPTION text alone', () => {
  const got = ynGuardClassOf("Please select one", [
    "I require sponsorship",
    "I do not require sponsorship",
  ]);
  assert(got === "truth", "got " + got);
});
check("an ordinary question is neither class", () => {
  assert(ynGuardClassOf("What is your postcode?", []) === null);
  assert(ynGuardClassOf("", []) === null);
});

if (failures) {
  console.error("\nguard classes FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\nguard classes PASS: 24 of 24 groups classed correctly; the work-" +
    "authorisation/policy collision is fixed",
);
