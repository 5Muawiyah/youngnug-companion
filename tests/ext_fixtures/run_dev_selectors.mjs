// run_dev_selectors.mjs — the student's per-site capture selectors, WIRED.
// content/capture.js evaluated verbatim in jsdom (same loader as
// run_capture_extractors.mjs); ynCaptureCurrent is called WITH a rules
// array, exactly the shape popup.js stores and the callers pass in.
//
// Proves:
//   1. a matching rule reads title/body from the page and LEADS the merge
//      (its title beats the page's own h1);
//   2. a rule for another host changes nothing;
//   3. an invalid selector in the blob (hand-edited storage) is refused by
//      the read side's own re-validation and the built-ins still answer;
//   4. a wildcard *.host pattern matches a subdomain;
//   5. a dev-rule hit counts as a claimed single advert, so the
//      unclaimed-SERP refusal stands down for it — and still fires with no
//      matching rule on the same page.
//
// Run: node run_dev_selectors.mjs   (any cwd; exit 0 = all pass)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const require = createRequire(path.join(root, "package.json"));
const { JSDOM } = require("jsdom");

const CAPTURE_STACK = [
  "common/api.js",
  "common/challenge_detect.js",
  "content/capture.js",
];

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log("  ok   " + msg);
  } else {
    failures += 1;
    console.log("  FAIL " + msg);
  }
}

function makePage(html, url) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  const { window } = dom;
  window.chrome = {
    storage: { local: { get: async (d) => ({ ...d }), set: async () => {} } },
    runtime: { sendMessage: () => {} },
  };
  const ctx = vm.createContext(window);
  for (const f of CAPTURE_STACK) {
    const src = readFileSync(path.join(root, "extension", f), "utf8");
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx;
}

function capture(ctx, rules) {
  ctx.__ynDevRules = rules;
  return vm.runInContext("ynCaptureCurrent(__ynDevRules)", ctx);
}

const OBSCURE_ADVERT =
  "<h1>CareersHub vacancy 17</h1>" +
  '<div class="rzx-t9">Junior Data Technician</div>' +
  "<main>" +
  '<div class="rzx-b4">Read gauges, log results, report faults. ' +
  "Full training given. Leeds depot, Mon to Fri.</div>" +
  "</main>";

// ---------------------------------------------- 1. matching rule leads
{
  console.log("matching rule reads the page and LEADS the merge");
  const ctx = makePage(OBSCURE_ADVERT, "https://jobs.example.co.uk/vacancy/17");
  const r = capture(ctx, [
    {
      id: "r1",
      pattern: "jobs.example.co.uk",
      titleSelector: ".rzx-t9",
      bodySelector: ".rzx-b4",
    },
  ]);
  check(r && r.ok === true && r.job, "returns {ok, job}");
  const j = (r && r.job) || {};
  check(
    j.title === "Junior Data Technician",
    "rule title beats the page h1: " + JSON.stringify(j.title),
  );
  check(
    (j.description || "").includes("Read gauges, log results"),
    "rule body read: " + JSON.stringify((j.description || "").slice(0, 40)),
  );
}

// ---------------------------------------------- 2. other-host rule inert
{
  console.log("a rule for another host changes nothing");
  const ctx = makePage(OBSCURE_ADVERT, "https://jobs.example.co.uk/vacancy/17");
  const r = capture(ctx, [
    {
      id: "r1",
      pattern: "other.example.com",
      titleSelector: ".rzx-t9",
      bodySelector: ".rzx-b4",
    },
  ]);
  const j = (r && r.job) || {};
  check(
    j.title === "CareersHub vacancy 17",
    "without a matching rule the h1 guess answers: " + JSON.stringify(j.title),
  );
}

// ---------------------------------------------- 3. invalid selector refused
{
  console.log("an invalid selector in the blob is refused by the read side");
  const ctx = makePage(OBSCURE_ADVERT, "https://jobs.example.co.uk/vacancy/17");
  const r = capture(ctx, [
    {
      id: "r1",
      pattern: "jobs.example.co.uk",
      titleSelector: "<img onerror=x>",
      bodySelector: ".rzx-b4",
    },
  ]);
  const j = (r && r.job) || {};
  check(
    j.title === "CareersHub vacancy 17",
    "markup-shaped selector ignored, built-ins answer: " +
      JSON.stringify(j.title),
  );
}

// ---------------------------------------------- 4. wildcard host
{
  console.log("a *.host pattern matches the subdomain");
  const ctx = makePage(OBSCURE_ADVERT, "https://jobs.example.co.uk/vacancy/17");
  const r = capture(ctx, [
    {
      id: "r1",
      pattern: "*.example.co.uk",
      titleSelector: ".rzx-t9",
      bodySelector: ".rzx-b4",
    },
  ]);
  check(
    ((r && r.job) || {}).title === "Junior Data Technician",
    "wildcard rule read the page",
  );
}

// ---------------------------------------------- 5. SERP refusal interplay
{
  const SERP_LIKE =
    "<h1>warehouse jobs in Leeds</h1>" +
    '<div class="rzx-t9">Warehouse Operative (Nights)</div>' +
    '<div class="rzx-b4">Pick, pack and load. Immediate start.</div>' +
    Array.from(
      { length: 12 },
      (_, i) => `<h3><a href="/job/${i}">Job ${i}</a></h3>`,
    ).join("");
  console.log("unclaimed-SERP refusal stands down ONLY for a rule hit");
  const noRule = capture(
    makePage(SERP_LIKE, "https://jobs.example.co.uk/search?q=warehouse"),
    [],
  );
  check(
    noRule && noRule.ok === false && /results page/.test(noRule.error || ""),
    "no rule: the SERP-shaped page is refused: " + JSON.stringify(noRule && noRule.error),
  );
  const withRule = capture(
    makePage(SERP_LIKE, "https://jobs.example.co.uk/search?q=warehouse"),
    [
      {
        id: "r1",
        pattern: "jobs.example.co.uk",
        titleSelector: ".rzx-t9",
        bodySelector: ".rzx-b4",
      },
    ],
  );
  check(
    withRule && withRule.ok === true &&
      ((withRule.job || {}).title === "Warehouse Operative (Nights)"),
    "a rule hit is the student's explicit single-advert claim and captures",
  );
}

console.log(failures === 0 ? "ALL PASS" : failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
