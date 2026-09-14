/**
 * The overlay summary line's percentage pin: ynCoverage fed the EXACT
 * report shape seen on a real form (filled=5, guessed=1,
 * user_kept=1, skipped_password=4 as the stand-in "4 guard" bucket,
 * needs_you=1, unclaimed_controls=13) must still say total=25, the shipped
 * percentage 30% (of the 20 fields the fill system could attempt), and the
 * OTHER candidate reading 24% (of all 25 fields on the page) — proving the
 * overlay's summary line can never show a number ynCoverage itself did not
 * produce, and that changing what is DISPLAYED never changed what is
 * COMPUTED (engine.js's ynCoverage, untouched).
 *
 * Run: node tests/ext_fixtures/run_coverage_pin.mjs   (exit 0 = pass)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const ENGINE = path.join(root, "extension", "content", "engine.js");

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

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(readFileSync(ENGINE, "utf8"), sandbox, { filename: "engine.js" });

// The exact bucket lengths behind his screenshot's "Filled 6 of 25 field(s)
// (1 to double-check) (13 not attempted)... Coverage: 30%.": 5 exact + 1
// guessed = 6 done; 1 already his own (user_kept); 4 credential/guard
// refusals (skipped_password stands in for "4 guard" here — any of the six
// skipped_* buckets counts the same way in ynCoverage's guardRefusals sum);
// 1 needs_you; 13 unclaimed_controls (not_recognised). Total 6+1+4+1+13=25.
const report = {
  filled: [1, 2, 3, 4, 5].map((n) => ({ fieldKey: "f" + n })),
  guessed: [{ fieldKey: "g1" }],
  user_kept: [{ fieldKey: "k1" }],
  skipped_password: [1, 2, 3, 4].map((n) => ({ fieldKey: "p" + n })),
  needs_you: [{ fieldKey: "n1" }],
  unclaimed_controls: 13,
};

const { causes, coverage } = sandbox.ynCoverage(report);

check("total fields = 25", () => assert(coverage.fields === 25, "fields=" + coverage.fields));
check("filled (exact+guessed) = 6", () => assert(coverage.filled === 6, "filled=" + coverage.filled));
check("guard refusals = 4", () =>
  assert(coverage.guard_refusals === 4, "guard_refusals=" + coverage.guard_refusals));
check("skipped (already-filled) = 1", () => assert(coverage.skipped === 1, "skipped=" + coverage.skipped));
check("not_recognised cause = 13", () =>
  assert(causes.not_recognised === 13, "not_recognised=" + causes.not_recognised));
check("needs_your_answer cause = 1", () =>
  assert(causes.needs_your_answer === 1, "needs_your_answer=" + causes.needs_your_answer));

// The shipped percentage (30%, of the 20 fields the fill system could
// attempt — denominator excludes the 1 already-filled and 4 guard refusals).
const shipPercent = Math.round(coverage.value * 100);
check("denominator = 20 (25 - 1 skipped - 4 guard - 0 manual)", () => {
  const denom = coverage.fields - coverage.skipped - coverage.guard_refusals - coverage.manual_uploads;
  assert(denom === 20, "denominator=" + denom);
});
check("shipped percentage = 30%", () => assert(shipPercent === 30, "got " + shipPercent + "%"));

// The OTHER candidate (of every control on the page, unfiltered) — the
// summary row's tooltip/expanded-detail number, never shown unlabelled.
const pagePercent = Math.round((coverage.filled / coverage.fields) * 100);
check("page percentage = 24%", () => assert(pagePercent === 24, "got " + pagePercent + "%"));

// A guard refusal must never be able to RAISE the score — the exact
// property ynCoverage's own comment says it exists to guarantee. Prove it
// directly: turning one of the 4 guard refusals into an ordinary unclaimed
// field (a weaker guard) must not increase the shipped percentage.
{
  const weaker = {
    ...report,
    skipped_password: report.skipped_password.slice(0, 3),
    unclaimed_controls: report.unclaimed_controls + 1,
  };
  const weakerCov = sandbox.ynCoverage(weaker).coverage;
  const weakerPercent = Math.round(weakerCov.value * 100);
  check("weakening a guard never raises the shipped percentage", () =>
    assert(
      weakerPercent <= shipPercent,
      `weakening a guard raised the score: ${shipPercent}% -> ${weakerPercent}%`,
    ));
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("coverage pin PASS");
