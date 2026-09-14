/**
 * ynQuestionFamily(text), a pure DOM-free
 * classifier. Two employers' different wording of "how did you hear about
 * us" share a family; a notice-period and a why-interested question each
 * get their own; "Hispanic or Latino?" and "Hispanic/Latino?" normalise
 * identically; an EEO-shaped question is NEVER a family, however many
 * words it shares with one.
 *
 * Loaded standalone (no DOM) — the function is pure text-in, id-out.
 *
 * Run: node tests/ext_fixtures/run_question_families.mjs   (exit 0 = pass)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const src = readFileSync(
  path.join(root, "extension", "content", "heuristics.js"),
  "utf8",
);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: "content/heuristics.js" });
const { ynQuestionFamily, ynNormaliseQuestionText } = ctx;

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

check("two employers' hear-about-us phrasings share a family", () => {
  const a = ynQuestionFamily("How did you hear about us?");
  const b = ynQuestionFamily("How did you find this role?");
  assert(a === "q_hear_about_us", "got " + a);
  assert(b === "q_hear_about_us", "got " + b);
  assert(a === b, "the two phrasings did not share a family");
});
check("notice period phrasings share a family, distinct from hear-about-us", () => {
  const a = ynQuestionFamily("What is your notice period?");
  const b = ynQuestionFamily("What period of notice must you give?");
  assert(a === "q_notice_period", "got " + a);
  assert(b === "q_notice_period", "got " + b);
});
check("why-interested phrasings share a family", () => {
  const a = ynQuestionFamily("Why do you want to work here?");
  const b = ynQuestionFamily("What attracts you to this role?");
  // The merged table splits the why-family two ways (why this company /
  // why this role), the same split the server mirror carries.
  assert(a && a.startsWith("q_why"), "got " + a);
  assert(a === b, "the two phrasings did not share a family: " + a + " vs " + b);
});
check("Hispanic or Latino? / Hispanic/Latino? normalise identically", () => {
  const a = ynNormaliseQuestionText("Hispanic or Latino?");
  const b = ynNormaliseQuestionText("Hispanic/Latino?");
  assert(a === b, "got " + JSON.stringify(a) + " vs " + JSON.stringify(b));
  assert(a === "hispanic latino", "got " + JSON.stringify(a));
});
check("an EEO-shaped question is never a reuse candidate", () => {
  const cases = [
    "What is your ethnicity?",
    "What is your gender identity?",
    "Do you consider yourself to have a disability?",
    "Are you a veteran?",
  ];
  // An EEO question carries a q_eeo_* family whose category sits in the
  // never-reuse set, so the bank can name it and still never offer it back.
  const ynQuestionCategory = vm.runInContext("ynQuestionCategory", ctx);
  const YN_NEVER_REUSE_CATEGORIES = vm.runInContext("YN_NEVER_REUSE_CATEGORIES", ctx);
  for (const c of cases) {
    const fam = ynQuestionFamily(c);
    assert(fam && fam.startsWith("q_eeo_"), c + " -> " + fam);
    assert(YN_NEVER_REUSE_CATEGORIES.has(ynQuestionCategory(fam)), c + " is reusable: " + ynQuestionCategory(fam));
  }
});
check("an unrelated question never lands in a named family", () => {
  // The merged table carries a catch-all q_general for free text the bank
  // reuses only by exact fingerprint, never by family.
  const fam = ynQuestionFamily("What is the capital of France?");
  assert(fam === null || fam === "q_general", "got " + fam);
  assert(ynQuestionFamily("") === null);
  assert(ynQuestionFamily(null) === null);
});

if (failures) {
  console.error("\nquestion families FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\nquestion families PASS: different phrasings of the same question " +
    "share a family; an EEO-shaped question is never offered back",
);
