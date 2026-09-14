// tests/ext_fixtures/adapters/run_reopen.mjs — ynAdapterReopenSection: a
// collapsed summary card is reopened via its own declared Edit
// label; a fixture whose only button is "Confirm and continue" is left
// alone. jsdom, production files verbatim, no network.
//
// Run: node tests/ext_fixtures/adapters/run_reopen.mjs   (exit 0 = all pass)
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
  "content/adapters/reopen.js",
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

{
  console.log("Collapsed contact card: reopened via the adapter's own Edit label");
  const { window, ctx } = loadPage("collapsed_contact_card.html");
  const doc = window.document;
  const reopen = vm.runInContext("ynAdapterReopenSection", ctx);
  const field = doc.getElementById("phone-field");
  check(field.disabled === true, "field starts disabled (collapsed)");
  const clicked = reopen(field, [/^edit$/i, /edit\s+(phone|contact)/i], "#contact-card", doc);
  check(!!clicked, "an Edit control was found and clicked");
  check(window.__editClicked === true, "the page's own Edit handler ran");
  check(field.disabled === false, "the field is reopened and fillable (1 of 1)");
}

{
  console.log("Only a 'Confirm and continue' button: never clicked");
  const { window, ctx } = loadPage("confirm_and_continue_only.html");
  const doc = window.document;
  const reopen = vm.runInContext("ynAdapterReopenSection", ctx);
  const field = doc.getElementById("phone-field");
  const clicked = reopen(field, [/^edit$/i, /edit\s+(phone|contact)/i], "#contact-card", doc);
  check(clicked === null, "no matching Edit control — nothing clicked: " + clicked);
  check(window.__confirmClicked === false, "'Confirm and continue' was never clicked (0)");
  check(field.disabled === true, "the field stays exactly as it was");
}

if (failures) {
  console.log(failures + " FAILURE(S)");
  process.exit(1);
}
console.log("reopen PASS");
