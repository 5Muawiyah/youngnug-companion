/**
 * Own rules, adblock-filter style. Three levels, all against the REAL
 * parser/matcher (common/own_rules.js) and the REAL planning ladder
 * (content/filler.js's ynPlanRungs), never a description of intended
 * behaviour:
 *
 *   1. Parser: 4 valid line shapes + 4 invalid lines, refused BY LINE
 *      NUMBER with a human reason (unknown site shape / unknown profile
 *      key / empty selector / bad operator — the four error categories).
 *   2. Fill ladder: 6 valid "label=key" lines, 2 each on 3 different
 *      fixture pages, resolve to the right element with the right value,
 *      as an own_rule-sourced intent claimed ABOVE heuristics.
 *   3. Safety: a deliberately hostile "label=key" rule pointing straight at a password
 *      field is never executed as a write — ynExecuteIntents' write-time
 *      guard refuses it exactly as it would refuse any other rung's
 *      mis-guess, proving the rule is a MAPPING, never a bypass. A
 *      site$$ rule refuses the whole plan before any rung runs.
 *
 * Run: node tests/ext_fixtures/run_own_rules.mjs
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

// ── 1. Parser: valid shapes + the four invalid-line categories ──────────
{
  const src = readFileSync(path.join(EXT, "common", "own_rules.js"), "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "common/own_rules.js" });

  const text = [
    "jobs.example.com##.job-title", // 1 valid: selector
    "jobs.example.com##.job-body", // 2 valid: selector
    "jobs.example.com Notice period=answers.notice_period", // 3 valid: map
    "jobs.example.com!!Referee contact details", // 4 valid: never
    "blocked.example.com$$", // 5 valid: block
    "not a site##.x", // 6 invalid: unknown site shape
    "jobs.example.com Weird field=not.a.real.key", // 7 invalid: unknown profile key
    "jobs.example.com##", // 8 invalid: empty selector
    "jobs.example.com$$extra text", // 9 invalid: bad operator
  ].join("\n");

  const { rules, errors } = ctx.ynParseOwnRules(text);
  check("5 valid lines parse to 5 rules", () => assert(rules.length === 5, "got " + rules.length));
  check("4 invalid lines refused, one per line", () => assert(errors.length === 4, JSON.stringify(errors)));
  check("line 6: unknown site shape", () =>
    assert(
      errors.find((e) => e.line === 6 && /unknown site shape/.test(e.message)),
      JSON.stringify(errors),
    ));
  check("line 7: unknown profile key", () =>
    assert(
      errors.find((e) => e.line === 7 && /unknown profile key/.test(e.message)),
      JSON.stringify(errors),
    ));
  check("line 8: empty selector", () =>
    assert(
      errors.find((e) => e.line === 8 && /empty selector/.test(e.message)),
      JSON.stringify(errors),
    ));
  check("line 9: bad operator", () =>
    assert(
      errors.find((e) => e.line === 9 && /bad operator/.test(e.message)),
      JSON.stringify(errors),
    ));

  check("export/import round-trips the 5 valid rules byte-identically", () => {
    const exported = ctx.ynSerializeOwnRules(rules);
    const reimported = ctx.ynParseOwnRules(exported);
    assert(reimported.errors.length === 0, "re-import produced errors: " + JSON.stringify(reimported.errors));
    assert(reimported.rules.length === 5, "re-import lost a rule: " + exported);
  });

  check("## capture rules convert to the existing dev-selector shape", () => {
    const capRules = ctx.ynOwnRuleCaptureRules(rules);
    const forSite = capRules.find((r) => r.pattern === "jobs.example.com");
    assert(forSite, "no capture rule produced for jobs.example.com");
    assert(forSite.titleSelector === ".job-title", JSON.stringify(forSite));
    assert(forSite.bodySelector === ".job-body", JSON.stringify(forSite));
  });
}

// ── 2 & 3: the fill ladder, against the REAL stack ───────────────────────
const STACK = [
  "common/api.js",
  "common/yn_theme.js",
  "common/challenge_detect.js",
  "common/label_quality.js",
  "common/own_rules.js",
  "content/dom_fill_kit.js",
  "content/engine.js",
  "content/detect.js",
  "content/heuristics.js",
  "content/settle_observer.js",
  "content/review_screen.js",
  "content/filler.js",
];

function loadPage(fixtureFile, storage) {
  const html = readFileSync(path.join(here, fixtureFile), "utf8");
  const dom = new JSDOM(html, {
    url: `https://${storage.__host}/apply`,
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  // jsdom computes no real layout — every element reads a zero-size rect by
  // default, which this codebase's own honeypot detector (hidden = trap)
  // reads as "invisible, refuse it". A fixed, non-zero rect on every
  // element makes the guard see ordinary visible fields, exactly as the
  // existing raw-id fixture (run_report_label_never_raw_id.mjs) already does.
  const rect = { width: 180, height: 28, top: 40, left: 40, right: 220, bottom: 68 };
  for (const proto of [win.HTMLInputElement, win.HTMLElement]) {
    Object.defineProperty(proto.prototype, "offsetWidth", { get: () => rect.width });
    Object.defineProperty(proto.prototype, "offsetHeight", { get: () => rect.height });
    proto.prototype.getClientRects = () => [rect];
    proto.prototype.getBoundingClientRect = () => rect;
  }
  win.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        if (typeof cb === "function") cb({ ok: false, error: "no worker in the harness" });
        return Promise.resolve({ ok: false });
      },
      onMessage: { addListener: () => {} },
    },
    storage: {
      local: {
        get: async (keys) => {
          if (typeof keys === "string") return { [keys]: storage[keys] };
          const out = { ...(keys || {}) };
          for (const k of Object.keys(out)) if (k in storage) out[k] = storage[k];
          return out;
        },
        set: async (obj) => Object.assign(storage, obj),
        remove: async () => {},
      },
    },
  };
  for (const rel of STACK) {
    const src = readFileSync(path.join(EXT, ...rel.split("/")), "utf8");
    vm.runInContext(src, dom.getInternalVMContext(), { filename: rel });
  }
  return win;
}

const PROFILE = {
  contact: { first_name: "Amara", last_name: "Okoye", email: "amara@example.com", phone: "07700 900123" },
  address: { line1: "1 Example Street", city: "Manchester", postcode: "M1 4BT", country: "United Kingdom" },
  links: { linkedin: "https://linkedin.com/in/amara-example", github: "https://github.com/amara-example", portfolio: "" },
  education: [],
  work: [],
  right_to_work: { uk_rtw: true, needs_sponsorship: false },
  eligibility_extra: { willing_to_relocate: null, uk_driving_licence: null },
  answers: { notice_period: "One month", salary_expectation: null, earliest_start: "1 September" },
  unconfirmed_answers: [],
  derived: {},
};

async function planFor(fixtureFile, host, rulesText) {
  const win = loadPage(fixtureFile, { __host: host, ownRules: rulesText });
  const result = await win.ynPlanRungs(PROFILE, { id: "unknown" }, null, {
    employer: "",
    executedKeys: new Set(),
  });
  return { win, result };
}

// Page A: two own-rule mappings the generic ladder has no pattern for.
{
  const rulesText = [
    "jobs.example.com Preferred name for badge=contact.first_name",
    "jobs.example.com Where should we write to you?=contact.email",
  ].join("\n");
  const { win, result } = await planFor("own_rules_page_a.html", "jobs.example.com", rulesText);
  const own = result.intents.filter((i) => i.source === "own_rule");
  check("page A: 2 own-rule intents produced", () => assert(own.length === 2, "got " + own.length));
  check("page A: name field resolves to the right element and value", () => {
    const i = own.find((x) => x.fieldKey === "contact.first_name");
    assert(i, "no intent for contact.first_name");
    assert(i.el === win.document.getElementById("pref-name"), "wrong element");
    assert(i.value === "Amara", "wrong value: " + i.value);
  });
  check("page A: email field resolves to the right element and value", () => {
    const i = own.find((x) => x.fieldKey === "contact.email");
    assert(i, "no intent for contact.email");
    assert(i.el === win.document.getElementById("contact-email-2"), "wrong element");
    assert(i.value === "amara@example.com", "wrong value: " + i.value);
  });
}

// Page B: two more mappings, a different site and shape.
{
  const rulesText = [
    "jobs.example.org When could you join us?=answers.earliest_start",
    "jobs.example.org Your code samples online=links.github",
  ].join("\n");
  const { win, result } = await planFor("own_rules_page_b.html", "jobs.example.org", rulesText);
  const own = result.intents.filter((i) => i.source === "own_rule");
  check("page B: 2 own-rule intents produced", () => assert(own.length === 2, "got " + own.length));
  check("page B: start-date field resolves correctly", () => {
    const i = own.find((x) => x.fieldKey === "answers.earliest_start");
    assert(i && i.el === win.document.getElementById("join-date"), "wrong/missing element");
    assert(i.value === "1 September", "wrong value: " + i.value);
  });
  check("page B: github field resolves correctly", () => {
    const i = own.find((x) => x.fieldKey === "links.github");
    assert(i && i.el === win.document.getElementById("code-profile"), "wrong/missing element");
    assert(i.value === "https://github.com/amara-example", "wrong value: " + i.value);
  });
}

// Page C: 2 more valid mappings, PLUS the hostile password, EEO and
// submit-control safety cases and a "never fill" rule.
{
  const rulesText = [
    "jobs.example.net Where do you live day to day?=address.city",
    "jobs.example.net Your professional profile link=links.linkedin",
    // The hostile cases: rules pointing straight at a password field, an
    // EEO field, and a submit control — none of these can know from the
    // rule's own text what kind of live element it will resolve to.
    "jobs.example.net Create a password to track your application=contact.phone",
    "jobs.example.net What is your ethnic group?=contact.first_name",
    "jobs.example.net Send this application now=contact.first_name",
  ].join("\n");
  const { win, result } = await planFor("own_rules_page_c.html", "jobs.example.net", rulesText);
  const own = result.intents.filter((i) => i.source === "own_rule");
  check("page C: 2 legitimate own-rule intents produced", () => {
    // Every hostile rule DOES resolve to an intent (own_rules cannot know
    // a field is a password/EEO/submit field just from its label) — the
    // safety property is that ynExecuteIntents refuses to WRITE any of
    // them, checked below.
    assert(own.length === 5, "got " + own.length);
  });
  check("page C: town field resolves correctly", () => {
    const i = own.find((x) => x.fieldKey === "address.city");
    assert(i && i.el === win.document.getElementById("home-town"), "wrong/missing element");
    assert(i.value === "Manchester", "wrong value: " + i.value);
  });
  check("page C: linkedin field resolves correctly", () => {
    const i = own.find((x) => x.fieldKey === "links.linkedin");
    assert(i && i.el === win.document.getElementById("li-url"), "wrong/missing element");
  });

  // ── 3. THE SAFETY PROOF: execute the planned intents for real ─────────
  const pwIntent = own.find((x) => x.el === win.document.getElementById("account-password"));
  check("the password-field intent exists (own_rules found it, exactly as claimed)", () =>
    assert(pwIntent, "own_rules did not even attempt the password field — test would prove nothing"));
  const eeoIntent = own.find((x) => x.el === win.document.getElementById("ethnic-group"));
  check("the EEO-field intent exists (own_rules found it, exactly as claimed)", () =>
    assert(eeoIntent, "own_rules did not even attempt the EEO field — test would prove nothing"));
  const submitIntent = own.find((x) => x.el === win.document.getElementById("send-btn"));
  check("the submit-control intent exists (own_rules found it, exactly as claimed)", () =>
    assert(submitIntent, "own_rules did not even attempt the submit control — test would prove nothing"));

  const report = await win.ynExecuteIntents(result.intents, {});
  check("the password field was NEVER written", () => {
    assert(
      win.document.getElementById("account-password").value === "",
      "the password field received a value: " + win.document.getElementById("account-password").value,
    );
  });
  check("the EEO field was NEVER written", () => {
    assert(
      win.document.getElementById("ethnic-group").value === "",
      "the EEO field received a value: " + win.document.getElementById("ethnic-group").value,
    );
  });
  check("the submit control's own value was NEVER overwritten", () => {
    assert(
      win.document.getElementById("send-btn").value === "Send",
      "the submit control's value changed: " + win.document.getElementById("send-btn").value,
    );
  });
  check("none of the three hostile fields count as filled or guessed", () => {
    const all = [...(report.filled || []), ...(report.guessed || [])];
    assert(
      !all.some((e) => e.fieldKey === "contact.phone"),
      "the password-mapped intent ended up in filled/guessed: " + JSON.stringify(all),
    );
    // Both the EEO and the submit-control rules were mapped to the SAME
    // fieldKey (contact.first_name) deliberately — this asserts NEITHER
    // of their two intents (matched by element, not by key, since the key
    // is shared) reached filled/guessed, while the two legitimate fields
    // below (different keys) still did.
    assert(
      !all.some((e) => e.fieldKey === "contact.first_name"),
      "an EEO or submit-control intent ended up in filled/guessed: " + JSON.stringify(all),
    );
  });
  check("the EEO field was reported skipped_eeo, not silently dropped", () => {
    assert(
      (report.skipped_eeo || []).some((e) => true) &&
        report.skipped_eeo.length >= 1,
      "expected at least one skipped_eeo entry: " + JSON.stringify(report.skipped_eeo),
    );
  });
  check("the two legitimate fields WERE written", () => {
    assert(win.document.getElementById("home-town").value === "Manchester", "town not filled");
    assert(
      win.document.getElementById("li-url").value === "https://linkedin.com/in/amara-example",
      "linkedin not filled",
    );
  });

  // A "##" capture-selector rule pointing at the SAME password field is a
  // different mechanism entirely (title/body capture, never a fill write)
  // — proved benign here rather than merely asserted: ynText reads
  // .textContent, which is always empty on an <input>, so a capture rule
  // this careless still captures nothing, never the live value.
  check("a ##-rule pointing at the password field captures nothing (ynText reads textContent, never .value)", () => {
    const { rules } = win.ynParseOwnRules("jobs.example.net##input[type=password]");
    const capRules = win.ynOwnRuleCaptureRules(rules);
    const forSite = capRules.find((r) => r.pattern === "jobs.example.net");
    assert(forSite && forSite.titleSelector === "input[type=password]", "capture rule not produced");
    const pwEl = win.document.getElementById("account-password");
    pwEl.value = "hunter2";
    const captured = win.ynText(win.document.querySelector(forSite.titleSelector));
    assert(captured === "", "capture leaked the password value: " + JSON.stringify(captured));
    pwEl.value = ""; // restore, in case a later check in this block re-reads it
  });
}

// ── site!! never-fill: a rule refuses a field REGARDLESS of what any
//    other rung (including own_rules itself, or heuristics) would guess ──
{
  const rulesText = [
    "jobs.example.com Preferred name for badge=contact.first_name",
    "jobs.example.com!!Preferred name for badge",
  ].join("\n");
  const { result } = await planFor("own_rules_page_a.html", "jobs.example.com", rulesText);
  check("a site!! rule removes the field even though a site map rule also named it", () => {
    const claimed = result.intents.some((i) => i.fieldKey === "contact.first_name");
    assert(!claimed, "the never-fill rule did not remove the field");
  });
}

// ── site$$ refuses the WHOLE plan before any rung runs ───────────────────
{
  const rulesText = "jobs.example.com$$";
  const { result } = await planFor("own_rules_page_a.html", "jobs.example.com", rulesText);
  check("a site$$ rule returns zero intents, from every rung", () =>
    assert(result.intents.length === 0, "got " + result.intents.length));
}

if (failures) {
  console.error(failures + " failure(s)");
  process.exit(1);
}
console.log(
  "own rules PASS: 4 line shapes parse, 4 invalid-line categories are refused by line number, " +
    "6 valid mappings resolve across 3 fixture pages, a hostile password-field rule is refused at write time, " +
    "a never-fill rule wins over a map rule, and a site-block rule refuses the whole plan",
);
