// tests/ext_fixtures/cross_check/run_cross_check.mjs — the jsdom side of the
// jsdom-vs-Chromium cross-check (tests/test_ext_harness.py). Same pattern
// as tests/ext_fixtures/run_generic_fill.mjs: production files evaluated
// verbatim under jsdom, no network, no extension runtime.
//
// Usage: node run_cross_check.mjs <fixture-path-relative-to-repo-root> <plan-json>
// Prints {"filled": [...], "guessed": [...]} (sorted fieldKeys) as one JSON
// line on stdout.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const require = createRequire(path.join(root, "package.json"));
const { JSDOM } = require("jsdom");

// The full production click-time stack, read from popup.js's own
// YN_FILL_SCRIPTS array (adapters included) — NOT the smaller generic-only
// stack tests/ext_fixtures/run_generic_fill.mjs uses. This script exists
// specifically to compare against the Chromium harness (tests/ext_harness.py),
// which injects that same full list; loading anything narrower here would
// make an ATS-shaped fixture (its adapter absent) diverge from Chromium for
// a reason that has nothing to do with jsdom vs. a real browser.
function ynFillScripts() {
  const src = readFileSync(path.join(root, "extension", "popup.js"), "utf8");
  // `const` or `var`: a shipped file esbuild has bundled from
  // extension/src/ always emits a top-level module binding as `var`.
  const m = src.match(/(?:const|var) YN_FILL_SCRIPTS\s*=\s*\[([\s\S]*?)\];/);
  if (!m) throw new Error("YN_FILL_SCRIPTS not found in popup.js");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((r) => r[1]);
}
const STACK = ynFillScripts();

const [, , fixtureRel, planJson] = process.argv;
if (!fixtureRel || !planJson) {
  console.error("Usage: node run_cross_check.mjs <fixture-rel-path> <plan-json>");
  process.exit(2);
}
const plan = JSON.parse(planJson);

const html = readFileSync(path.join(root, fixtureRel), "utf8");
const dom = new JSDOM(html, {
  url: "https://example.org/fixture",
  runScripts: "dangerously",
  pretendToBeVisual: true,
});
const win = dom.window;
// jsdom does no layout: every box measures 0 by default. Fixed non-zero
// rect, same shim run_generic_fill.mjs uses.
const rect = { width: 180, height: 28, top: 40, left: 40, right: 220, bottom: 68 };
for (const proto of [win.HTMLInputElement, win.HTMLTextAreaElement, win.HTMLSelectElement]) {
  Object.defineProperty(proto.prototype, "offsetWidth", { get: () => rect.width });
  Object.defineProperty(proto.prototype, "offsetHeight", { get: () => rect.height });
  proto.prototype.getClientRects = () => [rect];
  proto.prototype.getBoundingClientRect = () => rect;
}
// no real user is present in this harness — default to the same
// outcome this cross-check already assumed before the review screen
// existed (guessed fields still write; a fixture here carries no drafts
// to skip).
win.__ynReviewScript = [];
win.chrome = {
  runtime: {
    lastError: null,
    sendMessage: (msg, cb) => {
      if (typeof cb === "function") {
        cb({ ok: false, error: "no worker in the harness" });
      }
    },
    onMessage: { addListener: () => {} },
  },
  storage: {
    local: {
      get: async (d) => ({ ...(d || {}) }),
      set: async () => {},
      remove: async () => {},
    },
  },
};
for (const rel of STACK) {
  const src = readFileSync(path.join(root, "extension", ...rel.split("/")), "utf8");
  vm.runInContext(src, dom.getInternalVMContext(), { filename: rel });
}

const out = await win.ynFillAnyPage(plan);
const rep = (out && out.report) || {};
console.log(
  JSON.stringify({
    filled: (rep.filled || []).map((r) => r.fieldKey).sort(),
    guessed: (rep.guessed || []).map((r) => r.fieldKey).sort(),
  }),
);
