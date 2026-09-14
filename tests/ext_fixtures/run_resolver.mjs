/**
 * Node tests for the click-time direct-link resolver pure functions
 * (ynResolveDecision + ynStorageGc resolved:/pending_resolve branches).
 *
 * Run: node tests/ext_fixtures/run_resolver.mjs
 * Exit 0 = all pass. Loads background.js under chrome storage stubs (same
 * VM pattern as run_assist_tests.mjs).
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

function makeChromeStub(store) {
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
            for (const k of keys) out[k] = store.has(k) ? store.get(k) : undefined;
            return out;
          }
          // object of defaults
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
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
    },
    action: { setBadgeText() {} },
  };
}

function loadBackground(store) {
  const chrome = makeChromeStub(store);
  const sandbox = {
    chrome,
    console: { log() {}, warn() {}, error() {} },
    fetch: async () => {
      throw new Error("network blocked in resolver unit test");
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
      /* api.js loaded explicitly below */
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  // load api.js first (importScripts target), then background.js
  vm.runInContext(readFileSync(API_PATH, "utf8"), sandbox, {
    filename: "api.js",
  });
  vm.runInContext(readFileSync(BG_PATH, "utf8"), sandbox, {
    filename: "background.js",
  });
  return sandbox;
}

async function main() {
  const fails = [];
  const store = new Map();
  let g;
  try {
    g = loadBackground(store);
  } catch (e) {
    console.error("FAIL load background.js: " + e.message);
    process.exit(1);
  }

  try {
    assert(typeof g.ynResolveDecision === "function", "ynResolveDecision missing");
    assert(typeof g.ynSanitizeResolveUrl === "function", "ynSanitizeResolveUrl missing");
    assert(typeof g.ynStorageGc === "function", "ynStorageGc missing");
    // YN_AGGREGATOR_HOSTS is a file-scope const (not a VM global). Hosts are
    // behaviour-tested below; the pin suite greps the source for the 17 entries.
    const bgSrc = readFileSync(BG_PATH, "utf8");
    assert(bgSrc.includes("YN_AGGREGATOR_HOSTS"), "YN_AGGREGATOR_HOSTS in source");
    assert(bgSrc.includes("reed.co.uk"), "reed.co.uk in source");
    assert(bgSrc.includes("adzuna."), "adzuna. in source");
    assert(bgSrc.includes("cv-library."), "cv-library. in source");
  } catch (e) {
    fails.push("exports: " + e.message);
  }

  const now = Date.now();
  const pending = {
    jobId: 42,
    url: "https://www.reed.co.uk/jobs/software-engineer/123",
    ts: now,
  };

  // fresh pending + greenhouse url → post
  try {
    const d = g.ynResolveDecision(
      pending,
      "https://boards.greenhouse.io/acme/jobs/99",
      now,
    );
    assert(d.action === "post", "fresh+greenhouse want post got " + d.action);
    assert(d.jobId === 42, "jobId");
    assert(
      d.url === "https://boards.greenhouse.io/acme/jobs/99",
      "url preserved got " + d.url,
    );
  } catch (e) {
    fails.push("fresh post: " + e.message);
  }

  // stale → drop (clear)
  try {
    const d = g.ynResolveDecision(
      { ...pending, ts: now - 180001 },
      "https://boards.greenhouse.io/acme/jobs/99",
      now,
    );
    assert(d.action === "drop", "stale want drop got " + d.action);
  } catch (e) {
    fails.push("stale: " + e.message);
  }

  // no pending → ignore
  try {
    const d = g.ynResolveDecision(null, "https://boards.greenhouse.io/x", now);
    assert(d.action === "ignore", "no pending want ignore got " + d.action);
  } catch (e) {
    fails.push("no pending: " + e.message);
  }

  // aggregator hosts → ignore, keep pending (decision does not clear)
  for (const host of [
    "https://www.reed.co.uk/jobs/foo/1",
    "https://www.cv-library.co.uk/job/1",
    "https://www.adzuna.co.uk/details/1",
  ]) {
    try {
      const d = g.ynResolveDecision(pending, host, now);
      assert(
        d.action === "ignore",
        "aggregator " + host + " want ignore got " + d.action,
      );
    } catch (e) {
      fails.push("aggregator " + host + ": " + e.message);
    }
  }

  // same-host as click → ignore
  try {
    const d = g.ynResolveDecision(
      pending,
      "https://www.reed.co.uk/jobs/other/999",
      now,
    );
    // reed is also aggregator — still ignore; use a non-agg pending for same-host
    const p2 = {
      jobId: 7,
      url: "https://jobs.lever.co/acme/abc",
      ts: now,
    };
    const d2 = g.ynResolveDecision(
      p2,
      "https://jobs.lever.co/acme/def",
      now,
    );
    assert(d2.action === "ignore", "same-host want ignore got " + d2.action);
    // and the reed self-land is ignore too
    assert(d.action === "ignore", "reed same-host/agg want ignore");
  } catch (e) {
    fails.push("same-host: " + e.message);
  }

  // userinfo stripped
  try {
    const d = g.ynResolveDecision(
      pending,
      "https://user:pass@boards.greenhouse.io/acme/jobs/1",
      now,
    );
    assert(d.action === "post", "userinfo url should still post");
    assert(
      !d.url.includes("user:") && !d.url.includes("pass"),
      "userinfo must be stripped got " + d.url,
    );
    assert(
      d.url.startsWith("https://boards.greenhouse.io/"),
      "host preserved got " + d.url,
    );
  } catch (e) {
    fails.push("userinfo: " + e.message);
  }

  // http-only enforced (javascript: / ftp: ignored)
  try {
    const d1 = g.ynResolveDecision(pending, "javascript:alert(1)", now);
    assert(d1.action === "ignore", "javascript: want ignore");
    const d2 = g.ynResolveDecision(pending, "ftp://boards.greenhouse.io/x", now);
    assert(d2.action === "ignore", "ftp: want ignore");
    const d3 = g.ynResolveDecision(pending, "http://jobs.ashbyhq.com/acme/1", now);
    assert(d3.action === "post", "http: allowed");
  } catch (e) {
    fails.push("http-only: " + e.message);
  }

  // >2000 REJECTED, never truncated — a truncated URL parses fine but points
  // somewhere else, the exact wrong-link class this feature must never store
  try {
    const longPath = "https://boards.greenhouse.io/acme/" + "a".repeat(2500);
    const san = g.ynSanitizeResolveUrl(longPath);
    assert(san === null, "long url must be rejected, got " + san);
    const d = g.ynResolveDecision(pending, longPath, now);
    assert(d.action === "ignore", ">2000 decision want ignore got " + d.action);
    const ok = g.ynSanitizeResolveUrl("https://boards.greenhouse.io/acme/1");
    assert(ok !== null && ok.length <= 2000, "normal url still sanitizes");
  } catch (e) {
    fails.push("cap 2000: " + e.message);
  }

  // Two-tab guard against a genuine race: the ATS
  // tab's openerTabId must match the app tab that recorded the pending click.
  try {
    // pending recorded by app tab 100; its own ATS tab (opened by 100) lands
    const pApp = {
      jobId: 42,
      url: "https://www.reed.co.uk/jobs/job-b/2",
      ts: now,
      appTabId: 100,
    };
    // (a) THE RACE: job A's greenhouse tab was opened by a DIFFERENT app tab
    // (openerTabId 200) while pending is job B (appTabId 100). Must NOT pair —
    // openerTabId mismatch → ignore (A's url is not stored on B).
    const race = g.ynResolveDecision(
      pApp,
      "https://boards.greenhouse.io/acme/jobs/A",
      now,
      200,
    );
    assert(
      race.action === "ignore",
      "two-tab race: opener 200 != appTab 100 must ignore, got " + race.action,
    );
    // (b) LEGITIMATE: the ATS tab opened by THIS app tab (opener 100) pairs.
    const legit = g.ynResolveDecision(
      pApp,
      "https://boards.greenhouse.io/acme/jobs/B",
      now,
      100,
    );
    assert(legit.action === "post", "matching opener must post, got " + legit.action);
    assert(legit.jobId === 42, "matching opener jobId");
    // (c) ORGANIC visit: an ATS tab with NO opener lineage (undefined) while a
    // pending exists — falls back to the time+host guard (best-effort), still
    // posts (no lineage to reject on) — a known residual limitation.
    const organic = g.ynResolveDecision(
      pApp,
      "https://boards.greenhouse.io/acme/jobs/C",
      now,
      undefined,
    );
    assert(
      organic.action === "post",
      "no-opener falls back to host/time guard, got " + organic.action,
    );
    // (d) LEGACY pending (no appTabId) + an opener present → fall back, post.
    const legacy = g.ynResolveDecision(
      { jobId: 5, url: "https://www.reed.co.uk/jobs/x/1", ts: now },
      "https://boards.greenhouse.io/acme/jobs/D",
      now,
      777,
    );
    assert(legacy.action === "post", "legacy pending falls back, got " + legacy.action);
  } catch (e) {
    fails.push("two-tab opener: " + e.message);
  }

  // GC: prune expired resolved:, keep fresh
  try {
    store.clear();
    const oldMs = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const freshMs = Date.now() - 1000;
    store.set("resolved:1", { url: "https://boards.greenhouse.io/old", savedAt: oldMs });
    store.set("resolved:2", {
      url: "https://boards.greenhouse.io/fresh",
      savedAt: freshMs,
    });
    store.set("pending_resolve", {
      jobId: 9,
      url: "https://www.reed.co.uk/jobs/x/1",
      ts: Date.now() - 2 * 60 * 60 * 1000, // 2h → GC
    });
    store.set("token", "keep-me");
    await g.ynStorageGc();
    assert(!store.has("resolved:1"), "expired resolved:1 must be pruned");
    assert(store.has("resolved:2"), "fresh resolved:2 must be kept");
    assert(!store.has("pending_resolve"), "stale pending_resolve must be swept");
    assert(store.get("token") === "keep-me", "unrelated keys kept");
  } catch (e) {
    fails.push("gc: " + e.message);
  }

  if (fails.length) {
    console.error("FAIL (" + fails.length + ")");
    for (const f of fails) console.error("  - " + f);
    process.exit(1);
  }
  console.log("PASS resolver (" + [
    "exports",
    "fresh post",
    "stale drop",
    "no pending",
    "aggregator ignore",
    "same-host",
    "userinfo strip",
    "http-only",
    "cap 2000",
    "two-tab opener guard",
    "gc resolved+pending",
  ].length + " checks)");
}

main().catch((e) => {
  console.error("FAIL uncaught: " + e.stack || e);
  process.exit(1);
});
