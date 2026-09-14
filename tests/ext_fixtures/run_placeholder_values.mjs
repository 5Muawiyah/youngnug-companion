/**
 * Placeholder-vs-answered unit proof: common/placeholder.js is pure string
 * logic with no DOM dependency at all, so it is evaluated directly in a
 * bare vm context rather than the jsdom stack the fill fixtures need.
 *
 * 30 values: 12 placeholders (unanswered), 18 real answers (answered).
 * Prints one JSON line {pass, total, mismatches} — exit 0 iff pass===total.
 *
 * Run: node tests/ext_fixtures/run_placeholder_values.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const src = readFileSync(
  path.join(root, "extension", "common", "placeholder.js"),
  "utf8",
);

const ctx = vm.createContext({});
vm.runInContext(src, ctx, { filename: "placeholder.js" });

// {kind, value, options, wantPlaceholder}
const CASES = [
  // 12 placeholders — unanswered
  ["select", "", { selectedIndex: 0, optionDisabled: true }, true],
  ["select", "-None-", undefined, true],
  ["select", "Select...", undefined, true],
  ["select", "Please select", undefined, true],
  ["select", "please select one", undefined, true],
  ["select", "Choose an option", undefined, true],
  ["select", "-- Select --", undefined, true],
  ["select", "N/A", undefined, true],
  ["select", "---", undefined, true],
  ["text", "Select a country", undefined, true],
  ["phone", "+44", undefined, true],
  ["phone", "United Kingdom+44", undefined, true],
  // 18 real answers — answered
  ["select", "None of the above", undefined, false],
  ["select", "Select Board Member", undefined, false],
  ["select", "Unknown", undefined, false],
  ["text", "London", undefined, false],
  ["text", "Manchester", undefined, false],
  ["text", "N/Awesome Ltd", undefined, false],
  ["text", "Selection Committee", undefined, false],
  ["text", "Choose Life Trust", undefined, false],
  ["phone", "07700 900123", undefined, false],
  ["phone", "+44 7700 900123", undefined, false],
  ["phone", "020 7946 0958", undefined, false],
  ["text", "N/A - see attached CV", undefined, false],
  ["text", "Full Stack Developer", undefined, false],
  ["text", "-something-with-dashes-", undefined, false],
  ["text", "Choose one of my three degrees", undefined, false],
  ["select", "Not Selected For Interview (previous role)", undefined, false],
  ["text", "Selection Chair", undefined, false],
  ["text", "Pick one card only", undefined, false],
];

let pass = 0;
const mismatches = [];
for (const [kind, value, options, want] of CASES) {
  const got = ctx.ynIsPlaceholderValue(kind, value, options);
  if (Boolean(got) === Boolean(want)) {
    pass += 1;
  } else {
    mismatches.push({ kind, value, want, got });
  }
}

console.log(JSON.stringify({ pass, total: CASES.length, mismatches }));
process.exit(pass === CASES.length ? 0 : 1);
