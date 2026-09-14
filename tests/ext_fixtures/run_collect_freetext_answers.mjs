/**
 * ynCollectUserAnswers grows to free text. A student who has already
 * TYPED an answer into a recognised screening question (before ever
 * pressing Save) has it read back with its fingerprint/family, alongside
 * the existing allowlisted FACT-key capture — unchanged. Read-only: no
 * network, no storage; nothing is saved without the popup's own confirm.
 *
 * Run: node tests/ext_fixtures/run_collect_freetext_answers.mjs
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
  "common/label_quality.js",
  "content/dom_fill_kit.js",
  "content/engine.js",
  "content/detect.js",
  "content/heuristics.js",
  "content/settle_observer.js",
  "content/filler.js",
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
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

function loadPage(fixture) {
  const html = readFileSync(path.join(here, fixture), "utf8");
  const dom = new JSDOM(html, {
    url: "https://careers.example.org/apply",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const rect = { width: 180, height: 28, top: 40, left: 40, right: 220, bottom: 68 };
  for (const proto of [win.HTMLInputElement, win.HTMLTextAreaElement, win.HTMLSelectElement]) {
    Object.defineProperty(proto.prototype, "offsetWidth", { get: () => rect.width });
    Object.defineProperty(proto.prototype, "offsetHeight", { get: () => rect.height });
    proto.prototype.getClientRects = () => [rect];
    proto.prototype.getBoundingClientRect = () => rect;
  }
  win.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => { if (typeof cb === "function") cb({ ok: false, error: "no worker in the harness" }); },
      onMessage: { addListener: () => {} },
    },
    storage: { local: { get: async (d) => ({ ...(d || {}) }), set: async () => {}, remove: async () => {} } },
  };
  for (const rel of STACK) {
    const src = readFileSync(path.join(root, "extension", ...rel.split("/")), "utf8");
    vm.runInContext(src, dom.getInternalVMContext(), { filename: rel });
  }
  return win;
}

const win = loadPage("screening_freetext_save_form.html");
const collected = win.ynCollectUserAnswers();

check("the fact-key notice period is still captured (unchanged behaviour)", () => {
  const factRow = collected.find((r) => r.section === "answers" && r.key === "notice_period");
  assert(factRow, "notice_period fact row missing: " + JSON.stringify(collected));
  assert(factRow.value === "2 weeks", "got " + factRow.value);
  assert(factRow.freeText !== true, "a fact row must not be marked freeText");
});

check("the free-text 'why join us' answer is captured with a fingerprint and family", () => {
  const freeRow = collected.find((r) => r.freeText === true);
  assert(freeRow, "no free-text row captured: " + JSON.stringify(collected));
  assert(
    freeRow.value.includes("graduate scheme"),
    "expected the student's own typed text, got " + freeRow.value,
  );
  assert(freeRow.controlType === "textarea", "expected textarea control type");
  assert(typeof freeRow.fingerprint === "string" && freeRow.fingerprint.length === 16, "bad fingerprint");
  assert(freeRow.family === "q_why_company", "expected q_why_company, got " + freeRow.family);
});

check("an EMPTY screening textarea the student never typed into is never captured", () => {
  const rows = collected.filter((r) => (r.question || "").toLowerCase().includes("led a team"));
  assert(rows.length === 0, "an untouched field must not be reported as an answer");
});

check("exactly one fact row and one free-text row — nothing extra invented", () => {
  const factRows = collected.filter((r) => r.freeText !== true);
  const freeRows = collected.filter((r) => r.freeText === true);
  assert(factRows.length === 1, "expected 1 fact row, got " + factRows.length);
  assert(freeRows.length === 1, "expected 1 free-text row, got " + freeRows.length);
});

if (failures) {
  console.error("run_collect_freetext_answers: " + failures + " failure(s)");
  process.exit(1);
}
console.log("run_collect_freetext_answers: all pass");
