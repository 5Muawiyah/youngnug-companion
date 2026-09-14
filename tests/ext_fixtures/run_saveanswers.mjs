/**
 * Node tests for ynMergeSaveAnswers (the SAVE_ANSWERS
 * pure merge in background.js): allowlist, coercion, ADD-only merge.
 *
 * Run: node tests/ext_fixtures/run_saveanswers.mjs
 * Exit 0 = all pass. Same VM pattern as run_resolver.mjs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BG_PATH = path.join(ROOT, "extension", "background.js");
const API_PATH = path.join(ROOT, "extension", "common", "api.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadBackground() {
  const sandbox = {
    chrome: {
      storage: {
        local: {
          async get(keys) {
            if (typeof keys === "object" && keys !== null) return { ...keys };
            return {};
          },
          async set() {},
          async remove() {},
        },
      },
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener() {} },
      },
      action: { setBadgeText() {} },
    },
    console: { log() {}, warn() {}, error() {} },
    fetch: async () => {
      throw new Error("network blocked in unit test");
    },
    URL,
    Date,
    String,
    Number,
    Object,
    JSON,
    Promise,
    Array,
    Math,
    Error,
    parseFloat,
    parseInt,
    isNaN,
    Infinity,
    undefined,
    setTimeout,
    clearTimeout,
    importScripts() {
      vm.runInContext(readFileSync(API_PATH, "utf-8"), ctx, {
        filename: "api.js",
      });
    },
    FileReader: class {},
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(readFileSync(BG_PATH, "utf-8"), ctx, {
    filename: "background.js",
  });
  return ctx;
}

const ctx = loadBackground();
const merge = (items, sections) =>
  vm.runInContext("ynMergeSaveAnswers", ctx)(items, sections);

const fails = [];

// 1. allowlist: invented sections/keys are dropped
try {
  const puts = merge(
    [
      { section: "answers", key: "notice_period", value: "1 month" },
      { section: "answers", key: "hack_key", value: "x" },
      { section: "contact", key: "email", value: "evil@example.com" },
      { section: "eligibility", key: "uk_right_to_work", value: true },
    ],
    {},
  );
  const sections = Object.fromEntries(puts.map((p) => [p.section, p]));
  assert(puts.length === 2, "exactly answers+eligibility PUTs expected");
  assert(
    sections.answers.data.notice_period === "1 month" &&
      !("hack_key" in sections.answers.data),
    "invented answers key must be dropped",
  );
  assert(!sections.contact, "contact must never be writable via SAVE_ANSWERS");
  assert(
    sections.eligibility.data.uk_right_to_work === true,
    "boolean eligibility kept",
  );
} catch (e) {
  fails.push("allowlist: " + e.message);
}

// 2. coercion: non-boolean eligibility + empty/long answers dropped/capped
try {
  const puts = merge(
    [
      { section: "eligibility", key: "needs_sponsorship", value: "yes" },
      { section: "answers", key: "salary_expectation", value: "   " },
      { section: "answers", key: "earliest_start", value: "x".repeat(300) },
    ],
    {},
  );
  assert(puts.length === 1, "only the capped answers PUT expected");
  assert(puts[0].section === "answers", "answers section expected");
  assert(
    puts[0].data.earliest_start.length === 100,
    "answers value must cap at 100 chars",
  );
  assert(
    !("salary_expectation" in puts[0].data),
    "blank answer must be dropped",
  );
} catch (e) {
  fails.push("coercion: " + e.message);
}

// 3. ADD-only merge: existing keys carried through, only patch keys change
try {
  const puts = merge(
    [{ section: "answers", key: "notice_period", value: "2 weeks" }],
    {
      answers: { salary_expectation: "£25,000", notice_period: "1 month" },
    },
  );
  assert(puts.length === 1, "one PUT");
  assert(
    puts[0].data.salary_expectation === "£25,000",
    "existing keys must be carried through untouched",
  );
  assert(puts[0].data.notice_period === "2 weeks", "patched key updated");
  assert(
    puts[0].savedKeys.length === 1 && puts[0].savedKeys[0] === "notice_period",
    "savedKeys reports only what changed",
  );
} catch (e) {
  fails.push("add-only: " + e.message);
}

// 4. nothing valid → no PUTs
try {
  const puts = merge(
    [{ section: "answers", key: "hack", value: "x" }, null, "junk"],
    {},
  );
  assert(puts.length === 0, "no valid items → no PUTs");
} catch (e) {
  fails.push("empty: " + e.message);
}

if (fails.length) {
  console.error("FAIL (" + fails.length + "):");
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log("run_saveanswers: all pass");
