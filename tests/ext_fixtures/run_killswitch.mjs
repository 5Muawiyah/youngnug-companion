/**
 * The stop controls, proved against a DEAD network.
 *
 * A stop control that needs the network is not a stop control. Every
 * assertion below runs with `fetch` rejecting on sight, and the harness
 * counts the calls: the local kill switch must refuse BEFORE fetch is
 * reached, not by failing to reach a server.
 *
 * There are two stops and they are deliberately not equivalent:
 *
 *   killSwitch  LOCAL, in chrome.storage.local, set by the student on the
 *               device. Unconditional, checked before any fetch, and no
 *               server payload can clear it. This is the real stop.
 *   serverStop  the account-level stop, cached from the per-user settings
 *               endpoint. It is a SOFT stop by construction: it can only
 *               arrive over the network, so it degrades to the last cached
 *               value and can never be as strong as the local one. Saying
 *               so plainly is the point — a soft stop sold as a hard stop
 *               is worse than no stop.
 *
 * Run: node tests/ext_fixtures/run_killswitch.mjs   (exit 0 = all pass)
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

/**
 * A worker sandbox with REAL persistent storage and a fetch we control.
 * `net.calls` counts every outbound attempt; `net.mode` decides what
 * happens when one is made.
 */
function makeWorker(initialStorage) {
  const store = { ...(initialStorage || {}) };
  const net = { calls: 0, mode: "reject", body: null, lastUrl: "" };
  const sandbox = {
    chrome: {
      storage: {
        local: {
          async get(keys) {
            if (typeof keys === "string") {
              return { [keys]: store[keys] };
            }
            if (Array.isArray(keys)) {
              const out = {};
              for (const k of keys) out[k] = store[k];
              return out;
            }
            const out = { ...(keys || {}) };
            for (const k of Object.keys(out)) {
              if (k in store) out[k] = store[k];
            }
            return out;
          },
          async set(obj) {
            Object.assign(store, obj);
          },
          async remove(k) {
            delete store[k];
          },
        },
      },
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener() {} },
      },
      action: { setBadgeText() {} },
      notifications: { create() {} },
    },
    console: { log() {}, warn() {}, error() {} },
    async fetch(url) {
      net.calls += 1;
      net.lastUrl = String(url);
      if (net.mode === "reject") {
        throw new TypeError("Failed to fetch");
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return net.body || {};
        },
      };
    },
    URL,
    Date,
    String,
    Number,
    Boolean,
    Object,
    JSON,
    Promise,
    Array,
    Math,
    Error,
    TypeError,
    RegExp,
    Set,
    Map,
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
  return { ctx, store, net, call: (name) => vm.runInContext(name, ctx) };
}

const fails = [];
async function threw(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return String((e && e.message) || e);
  }
}

// 1. THE LOCAL SWITCH, WITH THE API UNREACHABLE.
//    Every fetch rejects. The switch must still stop everything, and it must
//    do so without making a single call — that is the difference between a
//    stop control and a network failure.
try {
  const w = makeWorker({ killSwitch: true, token: "t", apiBase: "https://example.invalid" });
  const msg = await threw(() => w.call("ynApi")("/api/me"));
  assert(msg, "ynApi resolved while the kill switch was on");
  assert(
    /kill switch/i.test(msg),
    "the refusal must name the kill switch, got: " + msg,
  );
  assert(
    w.net.calls === 0,
    "the kill switch let " +
      w.net.calls +
      " request(s) out — it must refuse BEFORE fetch, not rely on the network failing",
  );
} catch (e) {
  fails.push("local-switch-offline: " + e.message);
}

// 2. Setting and clearing the switch is pure local storage — no worker
//    round-trip, no network, so it works with the API down.
try {
  const w = makeWorker({ killSwitch: false, token: "t" });
  await w.ctx.chrome.storage.local.set({ killSwitch: true });
  assert(w.store.killSwitch === true, "the switch did not persist locally");
  assert(w.net.calls === 0, "flipping the switch made a network call");
  const s = await w.call("ynSettings")();
  assert(s.killSwitch === true, "ynSettings did not read the switch back");
} catch (e) {
  fails.push("local-switch-storage-only: " + e.message);
}

// 3. With NO stop set and the network alive, ynApi really does call out —
//    otherwise assertion 1 would pass for the wrong reason.
try {
  const w = makeWorker({ killSwitch: false, token: "t", apiBase: "https://example.invalid" });
  w.net.mode = "ok";
  await w.call("ynApi")("/api/me");
  assert(w.net.calls === 1, "expected exactly one call, got " + w.net.calls);
} catch (e) {
  fails.push("control-case-calls-out: " + e.message);
}

// 4. THE ACCOUNT-LEVEL STOP, cached. Also refuses before fetch.
try {
  const w = makeWorker({
    killSwitch: false,
    token: "t",
    serverSettings: { fetchedAt: Date.now(), stop: true },
  });
  const msg = await threw(() => w.call("ynApi")("/api/me"));
  assert(msg, "ynApi resolved while the account-level stop was set");
  assert(w.net.calls === 0, "the account stop let a request out");
} catch (e) {
  fails.push("server-stop: " + e.message);
}

// 5. THE SERVER CAN NEVER CLEAR THE LOCAL SWITCH. A payload saying "not
//    stopped" must not unstop a student who stopped it themselves.
try {
  const w = makeWorker({
    killSwitch: true,
    token: "t",
    serverSettings: { fetchedAt: Date.now(), stop: false, warning: "" },
  });
  const s = await w.call("ynSettings")();
  assert(s.killSwitch === true, "the server payload cleared the local switch");
  const msg = await threw(() => w.call("ynApi")("/api/me"));
  assert(/kill switch/i.test(String(msg)), "the local switch stopped winning");
} catch (e) {
  fails.push("local-wins: " + e.message);
}

// 6. The warning and stop survive a FAILED refresh — a Companion that goes
//    offline must not quietly forget it was stopped or warned.
try {
  const w = makeWorker({ killSwitch: false, token: "t" });
  w.net.mode = "ok";
  w.net.body = {
    daily_cap: 40,
    companion_stop: true,
    companion_warning: "Indeed changed their form — filling is paused there.",
  };
  await w.call("ynSyncServerSettings")();
  let s = await w.call("ynSettings")();
  assert(s.serverStop === true, "a served stop was not cached");
  assert(
    /Indeed changed their form/.test(s.serverWarning),
    "a served warning was not cached: " + s.serverWarning,
  );
  // now the network dies
  w.net.mode = "reject";
  await w.call("ynSyncServerSettings")();
  s = await w.call("ynSettings")();
  assert(
    s.serverStop === true,
    "a FAILED refresh cleared the stop — it must keep the last known value",
  );
  assert(
    /Indeed changed their form/.test(s.serverWarning),
    "a failed refresh cleared the warning",
  );
} catch (e) {
  fails.push("cached-across-failure: " + e.message);
}

// 7. The platform can LIFT the stop: a successful refresh with the flag gone
//    clears it, so a stop is not a one-way door.
try {
  const w = makeWorker({
    killSwitch: false,
    token: "t",
    serverSettings: { fetchedAt: Date.now(), stop: true, warning: "old" },
  });
  w.net.mode = "ok";
  w.net.body = { daily_cap: 40 };
  await w.call("ynSyncServerSettings")();
  const s = await w.call("ynSettings")();
  assert(s.serverStop === false, "the stop could not be lifted");
  assert(s.serverWarning === "", "the warning could not be cleared");
} catch (e) {
  fails.push("stop-is-liftable: " + e.message);
}

// 8. A warning is NOT a stop. Warning the student must not stop them working.
try {
  const w = makeWorker({
    killSwitch: false,
    token: "t",
    serverSettings: { fetchedAt: Date.now(), warning: "Heads up." },
  });
  w.net.mode = "ok";
  await w.call("ynApi")("/api/me");
  assert(w.net.calls === 1, "a warning alone blocked the Companion");
} catch (e) {
  fails.push("warning-is-not-a-stop: " + e.message);
}

// 9. EVERY egress point obeys the switch. Two raw fetches used to sit
//    outside ynApi entirely (the GitHub import and the local model), so
//    "kill switch on" still let requests leave the machine.
try {
  const w = makeWorker({ killSwitch: true, token: "t", ollamaEnabled: true });
  const handle = w.call("handle");
  await handle({ type: "GITHUB_IMPORT", username: "octocat" }, {}).catch(() => {});
  await handle({ type: "OLLAMA_RESOLVE", prompt: "x" }, {}).catch(() => {});
  assert(
    w.net.calls === 0,
    "with the kill switch ON, " +
      w.net.calls +
      " request(s) still left the machine (last: " +
      w.net.lastUrl +
      ")",
  );
} catch (e) {
  fails.push("every-egress-gated: " + e.message);
}

// 10. The settings sync is allowed through an ACCOUNT stop (that is how one
//     is lifted) but NEVER through the local switch. If that exemption ever
//     stopped checking killSwitch, "nothing runs" would quietly become
//     "nothing runs except this one call".
try {
  const w = makeWorker({ killSwitch: true, token: "t" });
  w.net.mode = "ok";
  w.net.body = { daily_cap: 40 };
  await w.call("ynSyncServerSettings")();
  assert(
    w.net.calls === 0,
    "the settings sync escaped the LOCAL kill switch (" +
      w.net.calls +
      " call(s))",
  );
} catch (e) {
  fails.push("sync-exemption-is-server-stop-only: " + e.message);
}

// 11. GET_STATUS must carry the stop and the warning on EVERY branch — the
//     popup cannot show a state it is never told about, and the branch that
//     omits it is always the branch where it mattered.
try {
  for (const [label, storage, mode] of [
    ["no token", { killSwitch: false }, "reject"],
    [
      "connected",
      { killSwitch: false, token: "t", serverSettings: { warning: "Heads up." } },
      "ok",
    ],
    [
      "error",
      { killSwitch: true, token: "t", serverSettings: { warning: "Heads up." } },
      "reject",
    ],
  ]) {
    const w = makeWorker(storage);
    w.net.mode = mode;
    w.net.body = { email: "student@example.com", role: "student" };
    const ret = await w.call("handle")({ type: "GET_STATUS" }, {});
    assert("killSwitch" in ret, label + " branch dropped killSwitch");
    assert("warning" in ret, label + " branch dropped the warning");
    assert("serverStop" in ret, label + " branch dropped the account stop");
  }
} catch (e) {
  fails.push("status-carries-warning: " + e.message);
}

if (fails.length) {
  for (const f of fails) console.error("FAIL: " + f);
  process.exit(1);
}
console.log(
  "stop controls PASS: the local switch refuses before fetch with the API " +
    "unreachable, no server payload can clear it, the account stop and " +
    "warning survive a failed refresh and can be lifted, a warning is not a " +
    "stop, and no egress point escapes the switch",
);
