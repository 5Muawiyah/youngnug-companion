/**
 * A radio/checkbox GROUP's review-row label must be the GROUP's own
 * question ("What is your ethnic group?"), never one option's own
 * per-widget label ("Other ethnic background", "No known disability") —
 * Lever's real demographic-monitoring markup is exactly this shape: one
 * native radio per option, each wrapped in its own <label>, so the
 * option's OWN label is a perfectly usable, quality-passing string that is
 * nonetheless the WRONG text for a row describing the whole group.
 *
 * Proved against the real fixture (lever_eeo_radio_groups.html) and the
 * real heuristics module, not a description of the intended behaviour.
 *
 * Run: node tests/ext_fixtures/run_group_question_label.mjs
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

const html = readFileSync(path.join(here, "lever_eeo_radio_groups.html"), "utf8");
const dom = new JSDOM(html, {
  url: "https://jobs.lever.co/example-co/apply",
  runScripts: "dangerously",
});
const win = dom.window;
for (const rel of ["common/label_quality.js", "content/heuristics.js"]) {
  const src = readFileSync(path.join(root, "extension", ...rel.split("/")), "utf8");
  vm.runInContext(src, dom.getInternalVMContext(), { filename: rel });
}

const ethWhite = win.document.getElementById("eth-white");
const disNone = win.document.getElementById("dis-none");

// ── Sanity: the option's OWN label is exactly the misleading string ─────
check("the radio's own implicit label is the option text, not the question", () => {
  const own = win.ynLabelText(ethWhite, win.document);
  assert(/White/.test(own), "expected the option's own label to include White: " + own);
});

// ── The fix: ynReportableGroupLabel names the GROUP question ────────────
check("ethnicity group: the report label is the group's question", () => {
  const nearby = win.ynNearbyText(ethWhite, win.document);
  const label = win.ynReportableGroupLabel(nearby, "EEO field");
  assert(
    label === "What is your ethnic group?",
    "got " + JSON.stringify(label),
  );
});
check("ethnicity group: never one option's own label", () => {
  const nearby = win.ynNearbyText(ethWhite, win.document);
  const label = win.ynReportableGroupLabel(nearby, "EEO field");
  for (const optionText of ["White", "Asian or Asian British", "Other ethnic background"]) {
    assert(
      !label.includes(optionText),
      `the group label leaked an option's own text: "${label}" contains "${optionText}"`,
    );
  }
});

check("disability group: the report label is the group's question", () => {
  const nearby = win.ynNearbyText(disNone, win.document);
  const label = win.ynReportableGroupLabel(nearby, "EEO field");
  assert(
    label === "Do you consider yourself to have a disability?",
    "got " + JSON.stringify(label),
  );
});
check('disability group: never "No known disability" (the clicked option, not the question)', () => {
  const nearby = win.ynNearbyText(disNone, win.document);
  const label = win.ynReportableGroupLabel(nearby, "EEO field");
  assert(!label.includes("No known disability"), "leaked the option text: " + label);
  assert(!label.includes("Yes") && !label.includes("No"), "leaked a sibling option text: " + label);
});

// ── A non-choice field is unaffected: the element's own label still wins ─
check("a plain text input still prefers its OWN label over any fallback (unchanged behaviour)", () => {
  const firstName = win.document.getElementById("first_name");
  const label = win.ynReportableFieldLabel(firstName, win.document, "some other fallback text", "text field");
  assert(label === "First name", "got " + JSON.stringify(label));
});

if (failures) {
  console.error(failures + " failure(s)");
  process.exit(1);
}
console.log(
  "group question label PASS: a choice group's report row names the group's question, never one option's own label",
);
