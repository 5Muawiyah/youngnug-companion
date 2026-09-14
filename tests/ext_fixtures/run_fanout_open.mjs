/**
 * Node tests for FANOUT_OPEN's instrumentation.
 *
 * A run of four sites once opened three tabs and could not be diagnosed.
 * The reason was in the handler: it had exactly TWO outcomes per
 * site - increment `opened`, or push to `refused` on a thrown error - and
 * nothing else was written down. A tab whose create() RESOLVED and which then
 * did not exist was indistinguishable in the answer from one that did, and
 * "one of four is missing" was all anyone could say afterwards.
 *
 * These tests pin the instrument, not a retry:
 *
 *   - a tab that create() resolves for and tabs.get cannot find is a NAMED
 *     refusal ("the tab did not stay open"), not a silent increment. That is
 *     the exact 4-vs-3 shape, reproduced deterministically.
 *   - every site's outcome is in `steps`, in order, in the answer.
 *   - `steps` is persisted to chrome.storage.local AFTER EACH SITE, so a
 *     worker torn down mid-loop leaves a record that stops where it stopped.
 *     A count taken afterwards cannot see that; this can.
 *   - the host allowlist and the https requirement still refuse, by name.
 *   - a page-side sender is still the only permitted caller.
 *
 * Run: node tests/ext_fixtures/run_fanout_open.mjs   (exit 0 = all pass)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BG_PATH = path.join(ROOT, "extension", "background.js");
const API_PATH = path.join(ROOT, "extension", "common", "api.js");
const INJECT_PATH = path.join(ROOT, "extension", "common", "inject_once.js");
const require = createRequire(path.join(ROOT, "package.json"));

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log("  ok   " + msg);
  } else {
    failures += 1;
    console.log("  FAIL " + msg);
  }
}

/**
 * @param plan  per-tab behaviour, keyed by the url passed to tabs.create:
 *              "ok"        create resolves and the tab exists
 *              "vanishes"  create resolves and tabs.get throws (the 4-vs-3 shape)
 *              "throws"    create itself throws
 */
function loadBackground(plan, store, created) {
  let nextId = 100;
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          const out = {};
          if (keys && typeof keys === "object" && !Array.isArray(keys)) {
            for (const [k, def] of Object.entries(keys)) {
              out[k] = store.has(k) ? store.get(k) : def;
            }
            return out;
          }
          return out;
        },
        async set(obj) {
          for (const [k, v] of Object.entries(obj)) {
            // Deep copy: the handler mutates `steps` as it goes, and a stored
            // reference would make every snapshot look like the final one -
            // which would hide the very property these tests exist to check.
            store.set(k, JSON.parse(JSON.stringify(v)));
          }
        },
        async remove() {},
      },
    },
    tabs: {
      async create({ url, active }) {
        const how = plan[url] || "ok";
        if (how === "throws") throw new Error("Tab creation refused");
        const id = nextId++;
        created.push({ id, url, active, how });
        return { id, url, active };
      },
      async get(id) {
        const row = created.find((c) => c.id === id);
        if (!row || row.how === "vanishes") {
          throw new Error("No tab with id: " + id);
        }
        // No "tabs" permission, so the browser strips the URL. That is the
        // honest state and the handler must cope with it.
        return { id: row.id, url: "", status: "loading" };
      },
      async query() {
        return [];
      },
      async sendMessage() {},
    },
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } },
    action: { setBadgeText() {} },
    commands: { onCommand: { addListener() {} } },
  };
  const sandbox = {
    chrome,
    console: { log() {}, warn() {}, error() {} },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
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
  vm.runInContext(readFileSync(INJECT_PATH, "utf8"), sandbox, {
    filename: "inject_once.js",
  });
  vm.runInContext(readFileSync(BG_PATH, "utf8"), sandbox, {
    filename: "background.js",
  });
  return sandbox;
}

const FOUR = [
  { site: "indeed", url: "https://uk.indeed.com/jobs?q=chemistry" },
  { site: "linkedin", url: "https://www.linkedin.com/jobs/search?keywords=chemistry" },
  { site: "gradcracker", url: "https://www.gradcracker.com/search/all-disciplines" },
  { site: "nhs_jobs", url: "https://www.jobs.nhs.uk/candidate/search/results?keyword=lab" },
];
const PAGE_SENDER = { tab: { id: 9 } };

// ------------------------------------------------- all four open cleanly
{
  console.log("four sites, four tabs: every step recorded as opened");
  const store = new Map();
  const created = [];
  const g = loadBackground({}, store, created);
  const r = await g.handle({ type: "FANOUT_OPEN", tabs: FOUR }, PAGE_SENDER);
  check(r.ok === true, "ok");
  check(r.opened === 4, "opened === 4, got " + r.opened);
  check(r.asked === 4, "asked === 4, got " + r.asked);
  check(r.refused.length === 0, "nothing refused");
  check(r.steps.length === 4, "four steps recorded, got " + r.steps.length);
  check(
    r.steps.every((s) => s.outcome === "opened"),
    "every step's outcome is opened",
  );
  check(
    r.steps.map((s) => s.site).join(",") === "indeed,linkedin,gradcracker,nhs_jobs",
    "steps are in plan order",
  );
  check(
    r.steps.every((s) => s.wanted && typeof s.seen === "string"),
    "each opened step records the url we asked for and what the browser held",
  );
  const stored = store.get("lastFanout");
  check(!!stored && stored.steps.length === 4, "lastFanout persisted with 4 steps");
}

// --------------------------------- THE 4-vs-3 SHAPE, reproduced exactly
{
  console.log("NHS's tab resolves then does not exist: named, not silently lost");
  const store = new Map();
  const created = [];
  const g = loadBackground({ [FOUR[3].url]: "vanishes" }, store, created);
  const r = await g.handle({ type: "FANOUT_OPEN", tabs: FOUR }, PAGE_SENDER);
  check(r.opened === 3, "opened === 3, got " + r.opened);
  check(r.asked === 4, "asked still 4, got " + r.asked);
  check(r.refused.length === 1, "one refusal, got " + r.refused.length);
  check(
    r.refused[0] && r.refused[0].site === "nhs_jobs",
    "the refusal names the site that went missing",
  );
  check(
    r.refused[0] && r.refused[0].reason === "the tab did not stay open",
    "the refusal says what happened: " + (r.refused[0] || {}).reason,
  );
  const nhs = r.steps.find((s) => s.site === "nhs_jobs");
  check(
    nhs && nhs.outcome === "created_then_gone",
    "the step distinguishes created-then-gone from create-threw: " +
      (nhs || {}).outcome,
  );
  check(
    nhs && typeof nhs.tabId === "number",
    "the vanished tab's id is recorded, so it can be looked for",
  );
  check(
    r.ok === true,
    "three of four is still ok: the student gets the three that worked",
  );
}

// --------------------------------- a create that throws is a DIFFERENT step
{
  console.log("a create that throws is recorded as create_threw, not created_then_gone");
  const store = new Map();
  const created = [];
  const g = loadBackground({ [FOUR[0].url]: "throws" }, store, created);
  const r = await g.handle({ type: "FANOUT_OPEN", tabs: FOUR }, PAGE_SENDER);
  const ind = r.steps.find((s) => s.site === "indeed");
  check(ind && ind.outcome === "create_threw", "outcome: " + (ind || {}).outcome);
  check(
    ind && /Tab creation refused/.test(ind.error || ""),
    "the thrown message is kept verbatim: " + (ind || {}).error,
  );
  check(r.opened === 3, "the other three still opened, got " + r.opened);
}

// ------------------- the record survives a worker torn down mid-loop
{
  console.log("steps are persisted PER SITE, so a torn-down worker leaves a trail");
  const store = new Map();
  const created = [];
  const snapshots = [];
  const g = loadBackground({}, store, created);
  // Wrap the store so every write is captured in order: this is what proves
  // the record is written as the loop runs rather than once at the end, which
  // is the only version of it that can diagnose a worker that never reached
  // the end.
  const realSet = g.chrome.storage.local.set;
  g.chrome.storage.local.set = async (obj) => {
    if (obj.lastFanout) snapshots.push(obj.lastFanout.steps.length);
    return realSet.call(g.chrome.storage.local, obj);
  };
  await g.handle({ type: "FANOUT_OPEN", tabs: FOUR }, PAGE_SENDER);
  // 1,2,3,4 is the per-site growth; the trailing 4 is the FINAL write that
  // adds the tab-group outcome beside the finished step list. Asserting the
  // prefix rather than the whole string keeps this test about the property it
  // exists for - the record is written as the loop runs, not once at the end.
  check(
    snapshots.slice(0, 4).join(",") === "1,2,3,4",
    "the record grew one site at a time: " + snapshots.join(","),
  );
  check(
    snapshots.length === 5 && snapshots[4] === 4,
    "and one final write carries the grouping outcome: " + snapshots.join(","),
  );
}

// ------------------------------------------- the existing bounds still hold
{
  console.log("the host allowlist, the https rule and the sender rule are unchanged");
  const store = new Map();
  const created = [];
  const g = loadBackground({}, store, created);

  const wrongHost = await g.handle(
    {
      type: "FANOUT_OPEN",
      tabs: [{ site: "indeed", url: "https://evil.example.com/jobs" }],
    },
    PAGE_SENDER,
  );
  check(wrongHost.opened === 0, "a wrong host opens nothing");
  check(
    wrongHost.steps[0] && wrongHost.steps[0].outcome === "wrong_host",
    "and says so by name: " + (wrongHost.steps[0] || {}).outcome,
  );

  const insecure = await g.handle(
    {
      type: "FANOUT_OPEN",
      tabs: [{ site: "indeed", url: "http://uk.indeed.com/jobs" }],
    },
    PAGE_SENDER,
  );
  check(insecure.opened === 0, "http is refused");

  const fromPopup = await g.handle({ type: "FANOUT_OPEN", tabs: FOUR }, {});
  check(
    fromPopup.ok === false && /only the app page/.test(fromPopup.error || ""),
    "a sender with no tab (the popup) is still refused",
  );

  const tooMany = await g.handle(
    { type: "FANOUT_OPEN", tabs: [...FOUR, ...FOUR] },
    PAGE_SENDER,
  );
  check(tooMany.asked === 4, "the four-tab bound still clamps, got " + tooMany.asked);
}


// ------------- the bridge's four-tab bound must SAY what it left out --------
//
// The page draws a group per site from the PLAN, which now answers for eight
// sites. The bridge may only ask for four tabs from one gesture - that bound
// is a safety property and is not being raised. But it used to enforce it with
// a bare slice(0, 4), so the other four groups sat reading "Open" for tabs
// nobody ever asked for. A screen saying a search is running when it is not is
// worse than a screen saying it was skipped.
{
  console.log("the bridge reports the sites its four-tab bound left out");
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://youngnug.com/jobs",
    runScripts: "outside-only",
  });
  const win = dom.window;
  const posted = [];
  const origPost = win.postMessage.bind(win);
  win.postMessage = (data, origin) => {
    posted.push(data);
    return origPost(data, origin);
  };
  let askedFor = null;
  win.chrome = {
    runtime: {
      async sendMessage(msg) {
        if (msg.type === "FANOUT_OPEN") {
          askedFor = msg.tabs;
          return {
            ok: true,
            asked: msg.tabs.length,
            opened: msg.tabs.length,
            refused: [],
            steps: msg.tabs.map((t) => ({ site: t.site, outcome: "opened" })),
          };
        }
        return { ok: true };
      },
      onMessage: { addListener() {} },
      getManifest: () => ({ version: "0.11.0" }),
    },
  };
  const bridgeSrc = readFileSync(
    path.join(ROOT, "extension", "content", "app_bridge.js"),
    "utf8",
  );
  win.eval(bridgeSrc);

  const EIGHT = [
    "indeed", "linkedin", "gradcracker", "nhs_jobs",
    "totaljobs", "cv_library", "guardian_jobs", "civil_service_jobs",
  ].map((site) => ({ site, url: "https://example.invalid/" + site }));

  // Dispatched as a real MessageEvent with source === window and the app's
  // own origin, because the bridge refuses anything else - and that refusal is
  // load-bearing (no other page may ever drive it), so the test must satisfy
  // it rather than route around it. jsdom's own postMessage arrives with a
  // null source, which the bridge correctly ignores.
  const ev = new win.MessageEvent("message", {
    data: { type: "YN_FANOUT_OPEN", tabs: EIGHT },
    origin: "https://youngnug.com",
  });
  Object.defineProperty(ev, "source", { value: win });
  win.dispatchEvent(ev);
  await new Promise((r) => setTimeout(r, 80));

  const reply = posted.find((m) => m && m.type === "YN_FANOUT_OPENED");
  check(!!reply, "the bridge answered the page");
  check(
    Array.isArray(askedFor) && askedFor.length === 4,
    "only four tabs were asked for: " + ((askedFor || []).length),
  );
  check(reply && reply.opened === 4, "opened === 4, got " + (reply || {}).opened);
  check(
    reply && reply.refused.length === 4,
    "the OTHER four are reported as refused, got " +
      (((reply || {}).refused) || []).length,
  );
  const names = ((((reply || {}).refused) || []).map((r) => r.site)).sort().join(",");
  check(
    names === "civil_service_jobs,cv_library,guardian_jobs,totaljobs",
    "and they are the four the bound left out: " + names,
  );
  check(
    (((reply || {}).refused) || []).every((r) =>
      /Only 4 sites open per search/.test(r.reason),
    ),
    "each says why, in words a student can act on",
  );
  // The bridge cannot know what the server will permit next time, so its
  // sentence must not promise a retry.
  check(
    (((reply || {}).refused) || []).every((r) => !/again/i.test(r.reason)),
    "and promises no retry it cannot know will work",
  );
  // The page plans its commit within the bound the Companion will enforce,
  // so the announce must carry it.
  const ready = posted.find((m) => m && m.type === "YN_EXT_READY");
  check(
    !!ready && ready.maxTabs === 4,
    "YN_EXT_READY announces the tab bound: " + JSON.stringify(ready),
  );
}


// ------------- the opened tabs land in YoungNug's own Chrome group ---------
{
  console.log("the opened tabs are collected into a named YoungNug group");
  const store = new Map();
  const created = [];
  const g = loadBackground({}, store, created);
  const calls = [];
  g.chrome.tabs.group = async ({ tabIds }) => { calls.push({ fn: "group", tabIds }); return 77; };
  g.chrome.tabGroups = {
    update: async (id, props) => { calls.push({ fn: "update", id, props }); return { id, ...props }; },
  };
  const r = await g.handle({ type: "FANOUT_OPEN", tabs: FOUR }, PAGE_SENDER);

  check(r.group && r.group.grouped === 4, "all four opened tabs grouped: " + (r.group||{}).grouped);
  check(r.group && r.group.groupId === 77, "the group id is reported back: " + (r.group||{}).groupId);
  const grp = calls.find((c) => c.fn === "group");
  check(
    grp && grp.tabIds.length === 4 && grp.tabIds.every((n) => typeof n === "number"),
    "grouped the real tab ids the browser returned",
  );
  const upd = calls.find((c) => c.fn === "update");
  check(upd && upd.props.title === "YoungNug", "the group is NAMED YoungNug: " + JSON.stringify((upd||{}).props));
  check(upd && !!upd.props.color, "and coloured, so it is findable on a busy tab strip");
  check(
    (r.steps || []).length === 4,
    "steps stays ONE PER SITE - the group is not a site: " + (r.steps||[]).length,
  );
  const stored = store.get("lastFanout");
  check(
    stored && stored.group && stored.group.grouped === 4,
    "the grouping is persisted beside the steps, so a failure is not invisible: "
      + JSON.stringify((stored||{}).group),
  );
}

// ------------- a tab that never opened is never grouped --------------------
{
  console.log("a site whose tab vanished is not put in the group");
  const store = new Map();
  const created = [];
  const g = loadBackground({ [FOUR[3].url]: "vanishes" }, store, created);
  let groupedIds = null;
  g.chrome.tabs.group = async ({ tabIds }) => { groupedIds = tabIds; return 88; };
  g.chrome.tabGroups = { update: async () => ({}) };
  const r = await g.handle({ type: "FANOUT_OPEN", tabs: FOUR }, PAGE_SENDER);
  check(r.opened === 3, "three opened, got " + r.opened);
  check(groupedIds && groupedIds.length === 3, "only the three real tabs were grouped: " + (groupedIds||[]).length);
  check(r.group.grouped === 3, "and the answer says three, not four: " + r.group.grouped);
}

// ------------- grouping failing must not break the fan-out -----------------
{
  console.log("a browser that refuses to group still opens the tabs");
  const store = new Map();
  const created = [];
  const g = loadBackground({}, store, created);
  g.chrome.tabs.group = async () => { throw new Error("Tabs cannot be edited right now"); };
  const r = await g.handle({ type: "FANOUT_OPEN", tabs: FOUR }, PAGE_SENDER);
  check(r.opened === 4, "the four tabs still opened: " + r.opened);
  check(r.ok === true, "and the fan-out still reports ok");
  check(
    /cannot be edited/.test((r.group || {}).error || ""),
    "the grouping failure is RECORDED, not swallowed: " + JSON.stringify(r.group),
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
