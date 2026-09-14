// tests/ext_fixtures/adapters/run_repeater.mjs — content/repeater.js's own mechanics,
// against two fixtures beside this file. jsdom, production
// files verbatim, no network.
//
// Run: node tests/ext_fixtures/adapters/run_repeater.mjs   (exit 0 = all pass)
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
  // the fixture's own tripwires run in the page
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

async function run() {
  // ------------------------------------------------------- stated-cap fixture
  {
    console.log("Repeater: stated cap, decoy present");
    const { window, ctx } = loadPage("repeater_experience_table.html");
    const doc = window.document;
    const expand = vm.runInContext("ynRepeaterExpand", ctx);
    const section = doc.getElementById("exp-section");

    // 3-entry profile: exactly 3 clicks, 3 rows.
    const r1 = await expand({
      root: section,
      doc,
      rowSelector: ".exp-row",
      needed: 3,
    });
    check(r1.clicked === 3, "3 needed -> exactly 3 Add clicks: " + r1.clicked);
    check(r1.rows.length === 3, "3 rows exist: " + r1.rows.length);
    check(r1.couldNotAdd === 0, "nothing left over: " + r1.couldNotAdd);
    check(window.__decoyClicked === false, "the 'Add and Submit' decoy was never clicked");

    // Continue on the SAME page to a 12-total profile: capped at the page's
    // stated 10, "2 could not be added".
    const r2 = await expand({
      root: section,
      doc,
      rowSelector: ".exp-row",
      needed: 12,
    });
    check(r2.rows.length === 10, "capped at the page's stated 10: " + r2.rows.length);
    check(r2.couldNotAdd === 2, "2 could not be added: " + r2.couldNotAdd);
    check(r2.capped === true, "capped flag set");
    check(window.__decoyClicked === false, "decoy still never clicked after the capped run");
  }

  // ------------------------------------------------- silent-stop fixture
  {
    console.log("Repeater: silent stop, no stated cap");
    const { window, ctx } = loadPage("repeater_silent_stop.html");
    const doc = window.document;
    const expand = vm.runInContext("ynRepeaterExpand", ctx);
    const section = doc.getElementById("edu-section");

    const r = await expand({
      root: section,
      doc,
      rowSelector: ".edu-row",
      needed: 5,
      settleTimeoutMs: 80,
      settleMs: 10,
    });
    check(r.rows.length === 2, "the button silently stopped after 2: " + r.rows.length);
    check(r.couldNotAdd === 3, "3 could not be added: " + r.couldNotAdd);
    check(!!r.reason, "a reason is reported: " + r.reason);
    check(r.clicked <= 3, "did not hammer the dead button forever: " + r.clicked);
  }

  if (failures) {
    console.log(failures + " FAILURE(S)");
    process.exit(1);
  }
  console.log("repeater PASS");
}

run();
