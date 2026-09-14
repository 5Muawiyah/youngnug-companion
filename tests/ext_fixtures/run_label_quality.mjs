/**
 * The label quality gate, common/label_quality.js,
 * as a pure-string test with no DOM at all. 40 strings, 20 good and 20 bad,
 * including the original request's own named examples: "Are you loading
 * experience?" (good — the widget-state check is whole-string anchored, so a
 * real sentence containing "loading" is untouched) and "rec-form_682152000000063542",
 * "firstNameInput", "12345" (bad — identifier-shaped, never a question).
 *
 * Run: node tests/ext_fixtures/run_label_quality.mjs   (exit 0 = all pass)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const src = readFileSync(
  path.join(root, "extension", "common", "label_quality.js"),
  "utf8",
);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: "common/label_quality.js" });
const { ynIsUsableLabel, ynFirstUsableLabel } = ctx;

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

// 20 good — real questions a UK application form actually asks, including
// ones that would be wrongly caught by a looser "contains a bad word" rule.
const GOOD = [
  "First name",
  "Last name",
  "Email address",
  "Phone number",
  "Are you loading experience?",
  "What is your notice period?",
  "Cover letter",
  "Upload your CV",
  "Postcode",
  "Town/City",
  "Mobile number",
  "Right to work in the UK",
  "Salary expectation",
  "How did you hear about us?",
  "LinkedIn profile URL",
  "GitHub profile",
  "Are you willing to relocate?",
  "Do you have a UK driving licence?",
  "Please describe your relevant experience",
  "Notice period (in weeks)",
];

// 20 bad — widget states, machine identifiers, bare generics, empties.
const BAD = [
  "Loading...",
  "Loading…",
  "Please wait",
  "No results found",
  "rec-form_682152000000063542",
  "firstNameInput",
  "12345",
  "",
  "   ",
  "value",
  "field",
  "input",
  "name",
  "q_8f3a2c",
  "field_1234567",
  "companyNameField",
  "input_1",
  "select one",
  "processing…",
  "a".repeat(150),
];

check("20 good strings all classed usable", () => {
  const bad = GOOD.filter((s) => !ynIsUsableLabel(s));
  assert(bad.length === 0, "rejected good strings: " + JSON.stringify(bad));
});
check("20 bad strings all classed unusable", () => {
  const good = BAD.filter((s) => ynIsUsableLabel(s));
  assert(good.length === 0, "accepted bad strings: " + JSON.stringify(good));
});
check("40 of 40 classified correctly (acceptance count)", () => {
  const total = GOOD.length + BAD.length;
  assert(total === 40, "fixture size drifted: " + total);
  const wrong =
    GOOD.filter((s) => !ynIsUsableLabel(s)).length +
    BAD.filter((s) => ynIsUsableLabel(s)).length;
  assert(wrong === 0, wrong + " of 40 misclassified");
});
check("ynFirstUsableLabel skips a cryptic id and returns the real label", () => {
  const got = ynFirstUsableLabel(["", "q_8f3a2c", "How did you hear about us?"]);
  assert(
    got === "How did you hear about us?",
    "got " + JSON.stringify(got),
  );
});
check("ynFirstUsableLabel returns empty when nothing is usable", () => {
  const got = ynFirstUsableLabel(["", "12345", "value"]);
  assert(got === "", "got " + JSON.stringify(got));
});

if (failures) {
  console.error("\nlabel quality FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\nlabel quality PASS: 40 of 40 label strings classified correctly; " +
    "ynFirstUsableLabel never surfaces a cryptic id",
);
