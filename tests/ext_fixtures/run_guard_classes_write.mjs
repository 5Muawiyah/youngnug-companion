/**
 * The write-time fix, end to end through the
 * REAL ynExecuteIntents (content/engine.js above the boundary owns the
 * guard; ynExecuteIntents itself, and everything below it, is called here
 * exactly as any planner calls it, never modified).
 *
 * heuristics.js never emits an intent for a policy-shaped checkbox at all
 * (no profile key means "agree to the privacy policy" — the same reason
 * run_generic_fill.mjs's own "terms checkbox never ticked" fixture proves
 * nothing was ATTEMPTED, not that a write was refused); a real ATS adapter
 * is what would plan one on a live posting. This test supplies the five
 * intents an adapter or a future rung could plan — one per checkbox on
 * tests/ext_fixtures/guards/guard_classes_form.html — and checks what
 * ynExecuteIntents actually does with each:
 *
 *   TRUTH   "I am authorised to work in the UK" -> WRITTEN (ticked), not
 *           refused as terms (the exact collision this fixes).
 *   POLICY  "I agree to the privacy policy" and three "subscribe" phrasings
 *           -> REFUSED, 0 of 4 ticked, all four in report.skipped_terms.
 *
 * Run: node tests/ext_fixtures/run_guard_classes_write.mjs   (exit 0 = pass)
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
  "content/dom_fill_kit.js",
  "content/engine.js",
];

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

const html = readFileSync(
  path.join(here, "guards", "guard_classes_form.html"),
  "utf8",
);
const dom = new JSDOM(html, {
  url: "https://example.org/guard-classes",
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
for (const rel of STACK) {
  const src = readFileSync(path.join(root, "extension", ...rel.split("/")), "utf8");
  vm.runInContext(src, dom.getInternalVMContext(), { filename: rel });
}

const doc = win.document;
const el = (id) => doc.getElementById(id);

const intents = [
  { fieldKey: "right_to_work.uk_rtw", el: el("rtw"), value: true, kind: "checkbox", confidence: "exact" },
  { fieldKey: "guessed:privacy", el: el("privacy"), value: true, kind: "checkbox", confidence: "guessed" },
  { fieldKey: "guessed:subscribe1", el: el("subscribe1"), value: true, kind: "checkbox", confidence: "guessed" },
  { fieldKey: "guessed:subscribe2", el: el("subscribe2"), value: true, kind: "checkbox", confidence: "guessed" },
  { fieldKey: "guessed:subscribe3", el: el("subscribe3"), value: true, kind: "checkbox", confidence: "guessed" },
];

const report = await win.ynExecuteIntents(intents, {});

check("the authorised-to-work checkbox is TICKED (truth, not policy)", () =>
  assert(el("rtw").checked === true, "left unticked"));
check("the privacy-policy checkbox is refused and stays unticked", () =>
  assert(el("privacy").checked === false, "was ticked"));
check("all three subscribe phrasings are refused, 0 of 3 ticked", () => {
  assert(el("subscribe1").checked === false, "subscribe1 was ticked");
  assert(el("subscribe2").checked === false, "subscribe2 was ticked");
  assert(el("subscribe3").checked === false, "subscribe3 was ticked");
});
check("report.filled contains the truth checkbox", () => {
  const keys = (report.filled || []).map((r) => r.fieldKey);
  assert(keys.includes("right_to_work.uk_rtw"), "not in report.filled: " + JSON.stringify(keys));
});
check("report.skipped_terms contains all four policy checkboxes, none else", () => {
  const keys = (report.skipped_terms || []).map((r) => r.fieldKey).sort();
  const want = [
    "guessed:privacy",
    "guessed:subscribe1",
    "guessed:subscribe2",
    "guessed:subscribe3",
  ].sort();
  assert(
    JSON.stringify(keys) === JSON.stringify(want),
    "got " + JSON.stringify(keys),
  );
});

if (failures) {
  console.error("\nguard classes write FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\nguard classes write PASS: the truth checkbox is filled, the four " +
    "policy checkboxes are refused and reported, 0 of 4 ticked",
);
