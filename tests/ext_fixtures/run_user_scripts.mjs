/**
 * chrome.userScripts wiring: validation, the registration shape, and
 * the options page's two mutually exclusive surfaces (the "off" line +
 * icon when chrome.userScripts is unavailable, the editable list + form
 * when it is available) — proved against the REAL options.html and
 * options.js, not a description of the intended behaviour.
 *
 * Run: node tests/ext_fixtures/run_user_scripts.mjs
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
const EXT = path.join(root, "extension");

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
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── 1. Validation, against the real module ───────────────────────────────
{
  const src = readFileSync(path.join(EXT, "common", "user_scripts.js"), "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "common/user_scripts.js" });

  check("a well-formed script validates", () =>
    assert(
      ctx.ynValidateUserScript({
        name: "Hello world",
        matches: ["https://example.com/*"],
        code: "console.log('hi')",
      }).ok,
    ));
  check("no name is refused", () =>
    assert(!ctx.ynValidateUserScript({ matches: ["https://example.com/*"], code: "x" }).ok));
  check("no match pattern is refused", () =>
    assert(!ctx.ynValidateUserScript({ name: "x", matches: [], code: "x" }).ok));
  check("empty code is refused", () =>
    assert(!ctx.ynValidateUserScript({ name: "x", matches: ["https://a/*"], code: "  " }).ok));
  check("matches parses one pattern per line, blanks dropped", () => {
    const got = ctx.ynParseUserScriptMatches("https://a.com/*\n\nhttps://b.com/*\n");
    assert(got.length === 2 && got[0] === "https://a.com/*", JSON.stringify(got));
  });
  check("a javascript: line is dropped, never treated as a match pattern", () => {
    const got = ctx.ynParseUserScriptMatches("javascript:alert(1)\nhttps://a.com/*");
    assert(got.length === 1 && got[0] === "https://a.com/*", JSON.stringify(got));
  });
  check("registrations carry the USER_SCRIPT world, never the page's own", () => {
    const regs = ctx.ynUserScriptsToRegistrations([
      { id: "u1", name: "n", matches: ["https://a.com/*"], code: "1" },
    ]);
    assert(regs.length === 1 && regs[0].world === "USER_SCRIPT", JSON.stringify(regs));
  });
  check("an invalid entry never reaches the registration list", () => {
    const regs = ctx.ynUserScriptsToRegistrations([
      { id: "bad", name: "", matches: [], code: "" },
      { id: "good", name: "n", matches: ["https://a.com/*"], code: "1" },
    ]);
    assert(regs.length === 1 && regs[0].id === "good", JSON.stringify(regs));
  });
}

// ── 2. The options page's two surfaces ───────────────────────────────────
function loadOptions(storage, userScriptsApi) {
  const html = readFileSync(path.join(EXT, "options.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "chrome-extension://abcdefgh/options.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const listeners = {};
  win.EventTarget.prototype.addEventListener = function (type, fn) {
    const id = this.id || "";
    listeners[id] = listeners[id] || {};
    listeners[id][type] = fn;
  };
  win.chrome = {
    runtime: { id: "abcdefgh", lastError: null, sendMessage: async () => ({ok:false}), onMessage: { addListener: () => {} } },
    storage: {
      local: {
        get: async (d) => {
          const out = { ...(d || {}) };
          for (const k of Object.keys(out)) if (k in storage) out[k] = storage[k];
          return out;
        },
        set: async (o) => Object.assign(storage, o),
        remove: async () => {},
      },
    },
    commands: { getAll: async () => [] },
    userScripts: userScriptsApi,
  };
  win.navigator.clipboard = { writeText: async () => {} };
  for (const rel of ["common/api.js", "common/own_rules.js", "common/user_scripts.js", "options.js"]) {
    vm.runInContext(readFileSync(path.join(EXT, ...rel.split("/")), "utf8"), dom.getInternalVMContext(), {
      filename: rel,
    });
  }
  return { win, listeners };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// Off state: chrome.userScripts is undefined.
{
  const { win } = loadOptions({}, undefined);
  await tick();
  await tick();
  check("off: the ONE fallback line is shown", () =>
    assert(!win.document.getElementById("user-scripts-unavailable").hidden, "fallback line stayed hidden"));
  check("off: the fallback line names where to enable it", () =>
    assert(
      /chrome:\/\/extensions/.test(win.document.getElementById("user-scripts-unavailable").textContent),
      win.document.getElementById("user-scripts-unavailable").textContent,
    ));
  check("off: the ONE copy icon is shown", () =>
    assert(!win.document.getElementById("us-copy-enable-url").hidden, "copy icon stayed hidden"));
  check("off: the editable list/form stays hidden", () =>
    assert(win.document.getElementById("user-scripts-available").hidden, "available section shown while off"));
  check("off: nothing else rendered in the list", () =>
    assert(win.document.getElementById("user-scripts-list").children.length === 0));
}

// On state: chrome.userScripts is present, one script already stored.
{
  const storage = {
    userScripts: [
      { id: "u1", name: "Hello world", matches: ["https://example.com/*"], code: "console.log(1)" },
    ],
  };
  const registerCalls = [];
  const userScriptsApi = {
    getScripts: async () => [],
    register: async (regs) => registerCalls.push(regs),
    unregister: async () => {},
  };
  const { win, listeners } = loadOptions(storage, userScriptsApi);
  await tick();
  await tick();
  check("on: the fallback line is hidden", () =>
    assert(win.document.getElementById("user-scripts-unavailable").hidden, "fallback shown while on"));
  check("on: the copy icon is hidden", () =>
    assert(win.document.getElementById("us-copy-enable-url").hidden, "copy icon shown while on"));
  check("on: the editable list/form is shown", () =>
    assert(!win.document.getElementById("user-scripts-available").hidden, "available section stayed hidden"));
  check("on: the stored script is listed by name", () =>
    assert(/Hello world/.test(win.document.getElementById("user-scripts-list").textContent)));

  // Add a second script.
  win.document.getElementById("us-name").value = "Second script";
  win.document.getElementById("us-matches").value = "https://jobs.example.com/*";
  win.document.getElementById("us-code").value = "console.log(2)";
  await listeners["us-add"].click();
  check("add: a new script is stored", () => {
    assert(storage.userScripts.length === 2, JSON.stringify(storage.userScripts));
    assert(storage.userScripts[1].name === "Second script");
  });
  check("add: registration ran with both scripts", () => {
    const last = registerCalls[registerCalls.length - 1];
    assert(last.length === 2, JSON.stringify(last));
  });
  check("add: the form clears after a successful save", () =>
    assert(win.document.getElementById("us-name").value === ""));

  // Reject an invalid add (no match pattern) — nothing new stored.
  win.document.getElementById("us-name").value = "Bad script";
  win.document.getElementById("us-matches").value = "";
  win.document.getElementById("us-code").value = "console.log(3)";
  await listeners["us-add"].click();
  check("add: an invalid script is refused, not stored", () =>
    assert(storage.userScripts.length === 2, JSON.stringify(storage.userScripts)));
  check("add: the refusal is shown", () =>
    assert(win.document.getElementById("us-msg").textContent, "no message shown for the refusal"));
}

if (failures) {
  console.error(failures + " failure(s)");
  process.exit(1);
}
console.log(
  "user scripts PASS: validation refuses the right shapes, registrations carry the USER_SCRIPT world, " +
    "and the options page shows exactly one of its two surfaces depending on chrome.userScripts availability",
);
