/**
 * Client side: ynQuestionFingerprint / ynQuestionFamily
 * (content/filler.js) mirror the server's question fingerprint exactly.
 *
 * Cross-language agreement is pinned two ways:
 *   1. FIVE known-answer vectors: the exact hex fingerprint the Python
 *      module produced for the same (question, control_type, options),
 *      captured once and hardcoded here — a byte-identical FNV-1a 64-bit
 *      implementation reproduces them; any drift in either side's
 *      tokenizer/normaliser changes the hex and this test catches it.
 *   2. The SAME 20 family pairs pytest's test_answer_bank.py checks
 *      against, checked here against the identical expected-family table —
 *      both sides are pinned to one ground truth, so they cannot silently
 *      diverge from each other without this test or that one failing.
 *
 * Run: node tests/ext_fixtures/run_question_family.mjs   (exit 0 = all pass)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const HEURISTICS = path.join(root, "extension", "content", "heuristics.js");
const FILLER = path.join(root, "extension", "content", "filler.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadFiller() {
  const sandbox = {
    console,
    document: { getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
    chrome: {
      runtime: {
        sendMessage() {},
        lastError: null,
        onMessage: { addListener() {} },
      },
      storage: { local: { get: async () => ({}), set: async () => {} } },
    },
    Set,
    Map,
    Array,
    String,
    Number,
    Boolean,
    Object,
    RegExp,
    BigInt,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    Infinity,
    undefined,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(HEURISTICS, "utf8"), sandbox, { filename: "heuristics.js" });
  vm.runInContext(readFileSync(FILLER, "utf8"), sandbox, { filename: "filler.js" });
  return sandbox;
}

const g = loadFiller();
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

check("exports present", () => {
  assert(typeof g.ynQuestionFingerprint === "function", "ynQuestionFingerprint missing");
  assert(typeof g.ynQuestionFamily === "function", "ynQuestionFamily missing");
  assert(typeof g.ynQuestionCategory === "function", "ynQuestionCategory missing");
});

// --- 1. known-answer vectors, captured from the server's question fingerprint ---
const KNOWN_VECTORS = [
  ["How did you hear about us?", "text", null, "1c69cf860e7d4e3f"],
  ["How did you hear about us?", "select", ["LinkedIn", "Indeed", "Other"], "82f17066d2ae23a9"],
  ["How did you hear about us?", "select", ["Other", "Indeed", "LinkedIn"], "82f17066d2ae23a9"],
  ["Why do you want this role?", "textarea", null, "49e673d8fb5ab7a5"],
  ["Notice period", "text", null, "f53bac2110eb70bf"],
];

check("5 known-answer fingerprint vectors match the Python module byte-for-byte", () => {
  for (const [q, ct, opts, expected] of KNOWN_VECTORS) {
    const got = g.ynQuestionFingerprint(q, ct, opts);
    assert(got === expected, `${q} | ${ct} | ${opts}: expected ${expected}, got ${got}`);
  }
});

check("option order does not change the fingerprint", () => {
  const a = g.ynQuestionFingerprint("How did you hear about us?", "select", ["LinkedIn", "Indeed", "Other"]);
  const b = g.ynQuestionFingerprint("How did you hear about us?", "select", ["Other", "Indeed", "LinkedIn"]);
  assert(a === b, "option order must not affect the fingerprint");
});

// --- 2. the SAME 20 family pairs the server's answer bank checks ---
const FAMILY_PAIRS = [
  ["How did you hear about us?", "How did you find this role?", "q_hear_about_us"],
  ["How did you hear about us?", "Where did you find this vacancy?", "q_hear_about_us"],
  ["Hispanic or Latino?", "Hispanic/Latino?", "q_eeo_ethnicity"],
  ["What is your notice period?", "Notice period (weeks)", "q_notice_period"],
  ["What is your notice period?", "How much notice must you give?", "q_notice_period"],
  ["Why do you want this role?", "Why are you interested in this position?", "q_why_interested"],
  ["Why do you want to work here?", "Why do you want to join us?", "q_why_company"],
  ["What is your salary expectation?", "What is your expected salary?", "q_salary_expectation"],
  ["What is your salary expectation?", "Desired salary", "q_salary_expectation"],
  ["What is your earliest start date?", "When could you start?", "q_start_date"],
  ["Are you eligible to work in the UK?", "Do you have the right to work in the UK?", "q_work_authorisation"],
  ["Will you require visa sponsorship?", "Do you need sponsorship?", "q_sponsorship"],
  ["Are you willing to relocate?", "Would you consider relocation?", "q_relocation"],
  ["Have you ever been convicted of a criminal offence?", "Will you pass a background check?", "q_background_check"],
  ["What is your gender identity?", "Please self-identify your gender", "q_eeo_gender"],
  ["Do you have a disability?", "Please describe any disability", "q_eeo_disability"],
  ["Are you a veteran?", "Veteran status", "q_eeo_veteran"],
  ["What attracts you to this company?", "Why this company?", "q_why_company"],
  ["Tell us why you want this job", "Why do you want this role?", "q_why_interested"],
  ["How did you find this vacancy?", "How did you hear about this position?", "q_hear_about_us"],
];

check("20 family pairs agree with the pytest table (same ground truth both sides)", () => {
  assert(FAMILY_PAIRS.length === 20, "expected 20 pairs");
  for (const [left, right, expected] of FAMILY_PAIRS) {
    const leftFamily = g.ynQuestionFamily(left);
    const rightFamily = g.ynQuestionFamily(right);
    assert(leftFamily === expected, `${left}: expected ${expected}, got ${leftFamily}`);
    assert(rightFamily === expected, `${right}: expected ${expected}, got ${rightFamily}`);
  }
});

// NEVER_REUSE_CATEGORIES is a file-scope const in filler.js, not a VM
// global (same reason background.js's YN_AGGREGATOR_HOSTS isn't one) — the
// FUNCTION it feeds is what's under test, so this list is this test's own
// mirror of the server's question fingerprint's NEVER_REUSE_CATEGORIES.
const NEVER_REUSE_CATEGORIES = new Set([
  "eeo", "sponsorship", "authorisation", "salary", "relocation",
  "start_date", "background_check",
]);

check("NEVER_REUSE categories match on both sides", () => {
  for (const family of ["q_eeo_ethnicity", "q_eeo_gender", "q_eeo_disability", "q_eeo_veteran", "q_sponsorship", "q_work_authorisation", "q_salary_expectation", "q_relocation", "q_start_date", "q_background_check"]) {
    assert(NEVER_REUSE_CATEGORIES.has(g.ynQuestionCategory(family)), `${family} must be a never-reuse category`);
  }
  assert(!NEVER_REUSE_CATEGORIES.has(g.ynQuestionCategory("q_hear_about_us")), "q_hear_about_us must NOT be never-reuse");
});

if (failures) {
  console.error("run_question_family: " + failures + " failure(s)");
  process.exit(1);
}
console.log("run_question_family: all pass");
