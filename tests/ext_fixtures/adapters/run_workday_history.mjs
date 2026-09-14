// tests/ext_fixtures/adapters/run_workday_history.mjs — Workday's progress-bar step
// key and the repeater-driven My Experience rows, against fixtures beside this file
// reconstructed from progress-bar markup read on a live page (see
// workday.js's own header comment). jsdom, production files verbatim, no network.
//
// Run: node tests/ext_fixtures/adapters/run_workday_history.mjs   (exit 0 = all pass)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const require = createRequire(path.join(root, "package.json"));
const { JSDOM } = require("jsdom");

const STACK = [
  "common/challenge_detect.js",
  "content/dom_fill_kit.js",
  "content/engine.js",
  "content/repeater.js",
  "content/adapters/workday.js",
];

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log("  ok   " + msg);
  } else {
    failures += 1;
    console.log("  FAIL " + msg);
  }
}

function loadPage(file) {
  const html = readFileSync(path.join(here, file), "utf8");
  const dom = new JSDOM(html, {
    url: "file://" + path.join(here, file),
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  for (const s of [...window.document.querySelectorAll("script")]) {
    window.eval(s.textContent);
  }
  const ctx = vm.createContext(window);
  for (const f of STACK) {
    const src = readFileSync(path.join(root, "extension", f), "utf8");
    vm.runInContext(src, ctx, { filename: f });
  }
  return { window, ctx };
}

function keys(intents) {
  return intents.filter((i) => i && !i.skip).map((i) => i.fieldKey).sort();
}

async function run() {
  // --------------------------------------------------------- step key
  {
    console.log("ynWdStepKey from the progress bar — My Information");
    const { window, ctx } = loadPage("workday_progress_my_information.html");
    const stepKey = vm.runInContext("ynWdStepKey", ctx)(window.document);
    check(stepKey === "My Information@2of7", "stepKey: " + stepKey);
  }
  {
    console.log("ynWdStepKey from the progress bar — Voluntary Disclosures, step 4 of 6");
    const { window, ctx } = loadPage("workday_progress_voluntary_disclosures.html");
    const stepKey = vm.runInContext("ynWdStepKey", ctx)(window.document);
    check(stepKey === "Voluntary Disclosures@4of6", "stepKey: " + stepKey);
    const plan = vm.runInContext("ynWorkdayPlan", ctx);
    const intents = await plan({}, window.document);
    check(
      intents.length === 2 && intents.every((i) => i.skip === "eeo"),
      "both disclosure fields are skip:eeo, never filled: " + JSON.stringify(intents.map((i) => i.fieldKey)),
    );
  }
  {
    console.log("ynWdStepKey from the progress bar — Review (final step)");
    const { window, ctx } = loadPage("workday_progress_review.html");
    const stepKey = vm.runInContext("ynWdStepKey", ctx)(window.document);
    check(stepKey === "Review@7of7", "stepKey: " + stepKey);
    const plan = vm.runInContext("ynWorkdayPlan", ctx);
    const intents = await plan(
      { contact: { first_name: "Ada", email: "ada@example.com" } },
      window.document,
    );
    check(intents.length === 0, "0 fields written on Review: " + intents.length);
    const advance = vm.runInContext("ynWdAdvance", ctx)(window.document);
    check(advance === null, "0 buttons pressed on Review (Submit refused): " + advance);
  }

  // ------------------------------------------------- My Experience rows
  {
    console.log("My Experience: repeater-driven rows, 3-entry profile");
    const { window, ctx } = loadPage("workday_my_experience.html");
    const plan = {
      work: [
        { employer: "Acme Corp", title: "Intern", description: "Built a thing", current: false },
        { employer: "Beta Ltd", title: "Analyst", description: "Shipped a feature", current: false },
        { employer: "Current Co", title: "Engineer", description: "Runs things", current: true },
      ],
    };
    const planFn = vm.runInContext("ynWorkdayPlan", ctx);
    const intents = await planFn(plan, window.document);
    check(window.__decoyClicked === false, "the 'Add and Submit' decoy was never clicked");

    const employer1 = intents.find((i) => i.fieldKey === "work.1.employer");
    check(!!employer1 && employer1.value === "Beta Ltd", "row 2 (index 1) is work[1], not the most recent job: " + JSON.stringify(employer1));
    const employer0 = intents.find((i) => i.fieldKey === "work.0.employer");
    check(!!employer0 && employer0.value === "Acme Corp", "row 1 is work[0]: " + JSON.stringify(employer0));
    const current2 = intents.find((i) => i.fieldKey === "work.2.current");
    check(!!current2 && current2.value === true, "the current-role checkbox is ticked for the entry marked current");
    check(
      intents.every((i) => i.confidence === "guessed" || i.skip),
      "every history-row intent is confidence guessed (unverified row markup)",
    );

    const rows = window.document.querySelectorAll('[data-automation-id="Job-History-Panel-Set-Item"]');
    check(rows.length === 3, "exactly 3 rows created for a 3-entry profile: " + rows.length);
  }

  {
    console.log("My Experience: capped at the page's stated 10, 12-entry profile");
    const { window, ctx } = loadPage("workday_my_experience.html");
    const work = [];
    for (let i = 0; i < 12; i += 1) {
      work.push({ employer: "Employer " + i, title: "Role " + i });
    }
    const planFn = vm.runInContext("ynWorkdayPlan", ctx);
    await planFn({ work }, window.document);
    const rows = window.document.querySelectorAll('[data-automation-id="Job-History-Panel-Set-Item"]');
    check(rows.length === 10, "capped at 10 rows for a 12-entry profile: " + rows.length);
  }

  if (failures) {
    console.log(failures + " FAILURE(S)");
    process.exit(1);
  }
  console.log("workday history/progress-bar PASS");
}

run();
