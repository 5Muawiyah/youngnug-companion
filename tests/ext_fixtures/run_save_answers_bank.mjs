/**
 * SAVE_ANSWERS routes free-text screening answers to the answer bank
 * (POST /api/answers) and keeps the 7 allowlisted FACT keys on the
 * existing profile PUT path — never conflated, a mixed batch does both.
 *
 * Run: node tests/ext_fixtures/run_save_answers_bank.mjs
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

function loadBackground(requests) {
  const store = new Map([
    ["apiBase", "https://youngnug.com"],
    ["token", "test-token"],
  ]);
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          if (typeof keys === "object" && keys !== null && !Array.isArray(keys)) {
            const out = {};
            for (const [k, def] of Object.entries(keys)) {
              out[k] = store.has(k) ? store.get(k) : def;
            }
            return out;
          }
          return {};
        },
        async set(obj) {
          for (const [k, v] of Object.entries(obj)) store.set(k, v);
        },
        async remove() {},
      },
    },
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
    },
    action: { setBadgeText() {} },
  };

  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith("/api/profile")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ sections: {} }),
      };
    }
    if (String(url).includes("/api/profile/")) {
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (String(url).endsWith("/api/answers")) {
      return { ok: true, status: 200, json: async () => ({ id: 1, fingerprint: "abc" }) };
    }
    return { ok: false, status: 404, json: async () => ({ detail: "not found" }) };
  };

  const sandbox = {
    chrome,
    console: { log() {}, warn() {}, error() {} },
    fetch: fetchImpl,
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
    importScripts() {},
    FileReader: class {},
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(API_PATH, "utf8"), sandbox, { filename: "api.js" });
  vm.runInContext(readFileSync(BG_PATH, "utf8"), sandbox, { filename: "background.js" });
  return sandbox;
}

async function main() {
  const fails = [];

  // 1. pure free-text item -> POST /api/answers only, PUT never called
  {
    const requests = [];
    const g = loadBackground(requests);
    const resp = await g.handle(
      {
        type: "SAVE_ANSWERS",
        items: [
          {
            freeText: true,
            fieldKey: "generated:why_fit",
            question: "Why do you want this role?",
            controlType: "textarea",
            value: "Because I care about the mission and the team.",
            fingerprint: "deadbeef",
          },
        ],
      },
      {},
    );
    try {
      assert(resp.ok === true, "expected ok:true, got " + JSON.stringify(resp));
      assert(resp.savedBank.length === 1, "expected one bank save");
      const posts = requests.filter((r) => r.url.endsWith("/api/answers") && r.init.method === "POST");
      assert(posts.length === 1, "expected exactly one POST /api/answers, got " + posts.length);
      const body = JSON.parse(posts[0].init.body);
      assert(body.question === "Why do you want this role?", "question mismatch");
      assert(body.text === "Because I care about the mission and the team.", "text mismatch");
      const profilePuts = requests.filter((r) => r.url.includes("/api/profile/") && r.init && r.init.method === "PUT");
      assert(profilePuts.length === 0, "a free-text item must never PUT the profile");
    } catch (e) {
      fails.push("free-text only: " + e.message);
    }
  }

  // 2. pure fact-key item -> PUT /api/profile/answers only, bank never called
  {
    const requests = [];
    const g = loadBackground(requests);
    const resp = await g.handle(
      {
        type: "SAVE_ANSWERS",
        items: [{ section: "answers", key: "notice_period", value: "2 weeks" }],
      },
      {},
    );
    try {
      assert(resp.ok === true, "expected ok:true");
      assert(resp.saved.includes("notice_period"), "expected notice_period saved");
      assert((resp.savedBank || []).length === 0, "a fact item must never reach the bank");
      const bankPosts = requests.filter((r) => r.url.endsWith("/api/answers"));
      assert(bankPosts.length === 0, "a fact-only save must never POST /api/answers");
    } catch (e) {
      fails.push("fact-key only: " + e.message);
    }
  }

  // 3. mixed batch: both destinations hit, once each
  {
    const requests = [];
    const g = loadBackground(requests);
    const resp = await g.handle(
      {
        type: "SAVE_ANSWERS",
        items: [
          { section: "answers", key: "salary_expectation", value: "GBP 25,000" },
          {
            freeText: true,
            fieldKey: "generated:why_company",
            question: "Why this company?",
            controlType: "textarea",
            value: "I admire the graduate scheme's structure.",
            fingerprint: "cafef00d",
          },
        ],
      },
      {},
    );
    try {
      assert(resp.ok === true, "expected ok:true");
      assert(resp.saved.includes("salary_expectation"), "fact save missing");
      assert(resp.savedBank.length === 1, "bank save missing");
      const bankPosts = requests.filter((r) => r.url.endsWith("/api/answers") && r.init.method === "POST");
      const profilePuts = requests.filter((r) => r.url.includes("/api/profile/") && r.init.method === "PUT");
      assert(bankPosts.length === 1, "expected exactly one bank POST");
      assert(profilePuts.length === 1, "expected exactly one profile PUT");
    } catch (e) {
      fails.push("mixed batch: " + e.message);
    }
  }

  if (fails.length) {
    console.error("FAIL (" + fails.length + "):");
    for (const f of fails) console.error("  - " + f);
    process.exit(1);
  }
  console.log("run_save_answers_bank: all pass");
}

main();
