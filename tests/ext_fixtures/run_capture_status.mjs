/**
 * Node tests for the durable last-capture record (a failed capture
 * used to be one transient popup line — nothing durable anywhere).
 *
 *   - worker CAPTURE_JOB records lastCapture in chrome.storage.local on BOTH
 *     the success and the failure path, and broadcasts YN_CAPTURE_STATUS to
 *     app tabs (the YN_IMPORT_STATUS relay pattern);
 *   - worker CAPTURE_ANNOUNCE (popup batch summaries + read-stage failures)
 *     stores + broadcasts, and REFUSES page-side senders;
 *   - app_bridge relays YN_CAPTURE_STATUS to the page, whitelisted+clamped.
 *
 * Run: node tests/ext_fixtures/run_capture_status.mjs   (exit 0 = all pass)
 * background.js under the run_resolver.mjs stubs; app_bridge.js under jsdom.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const require = createRequire(path.join(ROOT, "package.json"));
const { JSDOM } = require("jsdom");
const BG_PATH = path.join(ROOT, "extension", "background.js");
const API_PATH = path.join(ROOT, "extension", "common", "api.js");
const BRIDGE_PATH = path.join(ROOT, "extension", "content", "app_bridge.js");

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log("  ok   " + msg);
  } else {
    failures += 1;
    console.log("  FAIL " + msg);
  }
}

function makeChromeStub(store, broadcasts) {
  return {
    storage: {
      local: {
        async get(keys) {
          if (keys === null || keys === undefined) {
            const out = {};
            for (const [k, v] of store.entries()) out[k] = v;
            return out;
          }
          if (typeof keys === "string") {
            return { [keys]: store.has(keys) ? store.get(keys) : undefined };
          }
          if (Array.isArray(keys)) {
            const out = {};
            for (const k of keys) {
              out[k] = store.has(k) ? store.get(k) : undefined;
            }
            return out;
          }
          const out = {};
          for (const [k, def] of Object.entries(keys)) {
            out[k] = store.has(k) ? store.get(k) : def;
          }
          return out;
        },
        async set(obj) {
          for (const [k, v] of Object.entries(obj)) store.set(k, v);
        },
        async remove(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) store.delete(k);
        },
      },
    },
    tabs: {
      async query() {
        return [{ id: 1 }, { id: 2 }];
      },
      async sendMessage(tabId, msg) {
        broadcasts.push({ tabId, msg });
      },
    },
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
    },
    action: { setBadgeText() {} },
  };
}

function loadBackground(store, broadcasts, fetchImpl) {
  const chrome = makeChromeStub(store, broadcasts);
  const sandbox = {
    chrome,
    console: { log() {}, warn() {}, error() {} },
    fetch: fetchImpl,
    URL,
    URLSearchParams,
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
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(API_PATH, "utf8"), sandbox, { filename: "api.js" });
  vm.runInContext(readFileSync(BG_PATH, "utf8"), sandbox, {
    filename: "background.js",
  });
  return sandbox;
}

const JOB = {
  title: "Advertising & Media Executive, Level 3 Apprentice",
  employer: "Hunterlodge Advertising",
  url: "https://www.linkedin.com/jobs/view/4271649433/",
  source: "capture:www.linkedin.com",
  description: "About the job ...",
  location: "",
  mode: "jobview",
};

// ------------------------------------------- CAPTURE_JOB success -> recorded
{
  console.log("CAPTURE_JOB success records lastCapture + broadcasts");
  const store = new Map();
  const broadcasts = [];
  const g = loadBackground(store, broadcasts, async () => ({
    ok: true,
    json: async () => ({ id: 7, duplicate: false, enriched: true }),
  }));
  const r = await g.handle({ type: "CAPTURE_JOB", job: JOB }, {});
  check(r && r.ok === true && r.enriched === true, "server answer passes through");
  const lc = store.get("lastCapture");
  check(!!lc, "lastCapture stored");
  check(lc && lc.ok === true, "ok recorded");
  check(lc && lc.mode === "jobview", "mode recorded: " + (lc && lc.mode));
  check(
    lc && lc.host === "www.linkedin.com",
    "captured page host recorded: " + (lc && lc.host),
  );
  check(lc && lc.enriched === true, "enriched recorded");
  check(lc && typeof lc.ts === "number" && lc.ts > 0, "timestamp recorded");
  const b = broadcasts.filter((x) => x.msg && x.msg.type === "YN_CAPTURE_STATUS");
  check(b.length === 2, "YN_CAPTURE_STATUS broadcast to app tabs: " + b.length);
  check(b[0] && b[0].msg.ok === true && b[0].msg.mode === "jobview", "broadcast carries the result");
}

// ------------------------------------------- CAPTURE_JOB failure -> recorded
{
  console.log("CAPTURE_JOB failure records lastCapture (the durable trace)");
  const store = new Map();
  const broadcasts = [];
  const g = loadBackground(store, broadcasts, async () => ({
    ok: false,
    status: 401,
    json: async () => ({ detail: "bad token" }),
  }));
  let threw = false;
  try {
    await g.handle({ type: "CAPTURE_JOB", job: JOB }, {});
  } catch {
    threw = true;
  }
  check(threw, "the handler still throws (popup keeps its loud line)");
  const lc = store.get("lastCapture");
  check(!!lc && lc.ok === false, "failed attempt recorded");
  check(
    !!lc && /HTTP 401/.test(lc.error || ""),
    "error detail recorded: " + JSON.stringify(lc && lc.error),
  );
  check(!!lc && lc.host === "www.linkedin.com", "host recorded on failure");
  const b = broadcasts.filter((x) => x.msg && x.msg.type === "YN_CAPTURE_STATUS");
  check(b.length === 2, "failure broadcast too: " + b.length);
}

// ------------------------------- CAPTURE_ANNOUNCE (popup batch + read fails)
{
  console.log("CAPTURE_ANNOUNCE stores a batch summary; page senders refused");
  const store = new Map();
  const broadcasts = [];
  const g = loadBackground(store, broadcasts, async () => {
    throw new Error("no network in this test");
  });
  const r = await g.handle(
    {
      type: "CAPTURE_ANNOUNCE",
      ok: true,
      mode: "serp",
      host: "www.linkedin.com",
      saved: 5,
      dupes: 2,
      failed: 1,
    },
    {},
  );
  check(r && r.ok === true, "popup announce accepted");
  const lc = store.get("lastCapture");
  check(!!lc && lc.saved === 5 && lc.dupes === 2 && lc.failed === 1, "counts stored");
  check(!!lc && lc.mode === "serp", "mode stored");

  const refused = await g.handle(
    { type: "CAPTURE_ANNOUNCE", ok: false, error: "spoofed" },
    { tab: { id: 9 } },
  );
  check(
    refused && refused.ok === false,
    "a sender with a tab (page script) is refused",
  );
  check(
    (store.get("lastCapture") || {}).saved === 5,
    "the refused announce changed nothing",
  );

  const failAnnounce = await g.handle(
    { type: "CAPTURE_ANNOUNCE", ok: false, host: "chrome.google.com", error: "Chrome will not let extensions read this page" },
    {},
  );
  check(failAnnounce && failAnnounce.ok === true, "read-stage failure accepted");
  const lc2 = store.get("lastCapture");
  check(
    !!lc2 && lc2.ok === false && /read this page/.test(lc2.error || ""),
    "read-stage failure recorded (a capture that never POSTed leaves a trace)",
  );
}

// ------------------------------------------ app_bridge relays to the page
{
  console.log("app_bridge relays YN_CAPTURE_STATUS to the app, clamped");
  const dom = new JSDOM("<main></main>", {
    url: "https://youngnug.com/jobs",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const listeners = [];
  window.chrome = {
    runtime: {
      sendMessage: async () => ({ ok: false }),
      onMessage: {
        addListener(fn) {
          listeners.push(fn);
        },
      },
      getManifest: () => ({ version: "0.9.0" }),
    },
  };
  const received = [];
  window.addEventListener("message", (ev) => {
    if (ev.data && ev.data.type === "YN_CAPTURE_STATUS") received.push(ev.data);
  });
  const ctx = vm.createContext(window);
  vm.runInContext(readFileSync(BRIDGE_PATH, "utf8"), ctx, {
    filename: "app_bridge.js",
  });
  check(listeners.length >= 1, "bridge registered a worker-message listener");
  for (const fn of listeners) {
    fn({
      type: "YN_CAPTURE_STATUS",
      ok: true,
      mode: "jobview",
      host: "www.linkedin.com",
      enriched: true,
      duplicate: false,
      ts: 1756100000000,
      error: "",
      extra_field: "must not pass",
    });
  }
  await new Promise((res) => setTimeout(res, 25));
  check(received.length === 1, "one relay reached the page: " + received.length);
  const msg = received[0] || {};
  check(msg.ok === true && msg.mode === "jobview", "fields relayed");
  check(msg.host === "www.linkedin.com", "host relayed");
  check(msg.enriched === true, "enriched relayed");
  check(!("extra_field" in msg), "unknown fields are dropped (whitelist)");
}

console.log(failures ? `\n${failures} FAILED` : "\nall capture-status checks passed");
process.exit(failures ? 1 : 0);
