// run_capture_extractors.mjs — the capture reader
// (content/capture.js) and the Glassdoor sentiment reader
// (content/glassdoor.js) run against the pages those sites actually served
// (sanitized captures in the yn_fixture_*.json files beside this file), with
// jsdom standing in for the browser. No network, no extension runtime — the
// production files are evaluated verbatim, exactly like run_live_adapters.mjs.
//
// The fixture JSON holds real DOM fragments (scripts/styles stripped, ids and
// third-party names scrubbed in-page at capture time); each block below
// reassembles one page shape the reader must handle:
//   - Indeed results page (/jobs): .job_seen_beacon cards, a[data-jk]
//   - Indeed job page (/viewjob): header/salary/description, ld+json variant
//   - LinkedIn job view (/jobs/view/): no h1, obfuscated classes — title from
//     document.title, employer from the /company/ link, body via the
//     "About the job" heading climb
//   - LinkedIn results page (/jobs/search/): [data-job-id] cards
//   - Glassdoor reviews: rating-headline + review-detail PROS/CONS, and the
//     not-found page as the honest no-data case
//
// Run: node run_capture_extractors.mjs   (any cwd; exit 0 = all pass)
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

function fixture(name) {
  return JSON.parse(readFileSync(path.join(here, name), "utf8"));
}

// chrome stub: the readers must never crash outside the extension runtime,
// and the glassdoor reader's send is captured for inspection.
function makePage(html, url, files) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  const { window } = dom;
  const sent = [];
  window.chrome = {
    storage: {
      local: {
        get: async (d) => ({ ...d }),
        set: async () => {},
      },
    },
    runtime: { sendMessage: (m) => sent.push(m) },
  };
  const ctx = vm.createContext(window);
  for (const f of files) {
    const src = readFileSync(path.join(root, "extension", f), "utf8");
    vm.runInContext(src, ctx, { filename: f });
  }
  return { window, ctx, sent };
}

function capture(ctx) {
  return vm.runInContext("ynCaptureCurrent()", ctx);
}











// -------------------------------------------------- Glassdoor honest no-data
{
  console.log("Glassdoor not-found page — honest no-data, never a guess");
  const html =
    "<main><h1>We searched the galaxy</h1><p>but this page is lost in space</p></main>";
  const { ctx } = makePage(
    html,
    "https://www.glassdoor.co.uk/Reviews/Nowhere-Reviews-E999999.htm",
    [...CAPTURE_STACK, "content/glassdoor.js"],
  );
  const r = vm.runInContext("ynReadGlassdoorSentiment()", ctx);
  check(
    r && r.ok === false && r.reason === "no_data",
    "no rating-headline -> {ok:false, reason:'no_data'}: " + JSON.stringify(r),
  );
}



// ------ Indeed's advert pane on a NON-/viewjob path (the production defect) --
// Real row 136626, production, 2026-08-27: a capture from uk.indeed.com/ filed
// title "Welcome, Sam" (the signed-in greeting — the only <h1> on the
// page), employer "Enterprise MobilityReading RG1 7DS" (two fields with no
// separator) and url "https://uk.indeed.com/" (no job identity at all, so the
// row could never dedupe or be reopened). The body was correct: 4,306
// characters of the right advert. Only the reader missed, because it keyed on
// pathname and Indeed opens the same advert in a pane on "/" and on "/jobs".
{
  console.log("Indeed advert pane on '/' — reads the job, not the greeting");
  const html = `
    <header><h1>Welcome, Sam</h1></header>
    <main>
      <h1 class="jobsearch-JobInfoHeader-title">Management Trainee</h1>
      <div data-testid="inlineHeader-companyName">Enterprise Mobility</div>
      <div data-testid="inlineHeader-companyLocation">Reading RG1 7DS</div>
      <div id="salaryInfoAndJobType">GBP28,000 a year</div>
      <div id="jobDescriptionText">
        <p>Overview. We are Enterprise Mobility and we are hiring a Management
        Trainee to join our graduate programme in Reading. You will learn every
        part of the business over twelve months.</p>
      </div>
    </main>`;
  const { ctx } = makePage(
    html,
    "https://uk.indeed.com/?vjk=abc123def456",
    CAPTURE_STACK,
  );
  const r = capture(ctx);
  const job = (r && r.job) || {};
  check(
    r && r.ok === true && job.title === "Management Trainee",
    "title is the ROLE, never the greeting: " + JSON.stringify(job.title),
  );
  check(
    job.employer === "Enterprise Mobility",
    "employer is the company alone, not company+location: " +
      JSON.stringify(job.employer),
  );
  check(
    /vjk=abc123def456|jk=abc123def456/.test(job.url || ""),
    "url carries the job identity so the row can dedupe: " +
      JSON.stringify(job.url),
  );
  check(
    /Management Trainee/.test(job.description || "") ||
      /Enterprise Mobility/.test(job.description || ""),
    "body is the advert: " + JSON.stringify((job.description || "").slice(0, 60)),
  );
}

// ---- a signed-in greeting must never become a job title, on any site --------
{
  console.log("A greeting <h1> is declined even with no other reader");
  const html =
    "<h1>Welcome back, Priya</h1>" +
    "<main><div class='job-description'>Trainee Quantity Surveyor. " +
    "We are looking for someone to join our Bristol office.</div></main>";
  const { ctx } = makePage(html, "https://careers.example.com/x", CAPTURE_STACK);
  const r = capture(ctx);
  const job = (r && r.job) || {};
  check(
    !/^Welcome back, Priya$/.test(job.title || ""),
    "a student's own name is not a job title: " + JSON.stringify(job.title),
  );
}

// ---- a CamelCase employer is never truncated (the fix's own regression) ----
// The first attempt at un-jamming "Enterprise MobilityReading RG1 7DS" split on
// the lowercase->uppercase seam. Measured against production, 215 of 3,830
// distinct employers (5.6%) carry that seam legitimately, so it turned
// AstraZeneca into Astra and eBay into "e" — and employer feeds norm_employer,
// so it would have corrupted the dedupe key and the employer-hide key both.
// A cosmetic fault traded for a silent data one. These are the real names.
{
  console.log("CamelCase employers survive the field split");
  for (const name of [
    "AstraZeneca", "BlackRock", "GlaxoSmithKline", "BaxterStorey", "PwC", "eBay",
  ]) {
    const html =
      `<h1>Data Apprentice</h1><main>` +
      `<div class="company-name">${name}</div>` +
      `<div class="job-description">We are hiring a data apprentice in Leeds.</div>` +
      `</main>`;
    const { ctx } = makePage(html, "https://careers.example.com/x", CAPTURE_STACK);
    const r = capture(ctx);
    const got = ((r && r.job) || {}).employer;
    check(got === name, `employer kept whole: ${JSON.stringify(name)} -> ${JSON.stringify(got)}`);
  }
}

// ---- and the jam it was built for still splits, on the layout boundary ------
{
  console.log("Two block fields still separate into one employer");
  const html =
    `<h1>Management Trainee</h1><main>` +
    `<div class="company-info">` +
    `<div>Enterprise Mobility</div><div>Reading RG1 7DS</div>` +
    `</div>` +
    `<div class="job-description">A twelve month graduate programme.</div>` +
    `</main>`;
  const { ctx } = makePage(html, "https://careers.example.com/y", CAPTURE_STACK);
  const r = capture(ctx);
  const got = ((r && r.job) || {}).employer;
  check(
    got === "Enterprise Mobility" || got === "",
    `the location does not ride along on the employer: ${JSON.stringify(got)}`,
  );
}








// --------------------------- Civil Service Jobs: blocked, no reader written
{
  console.log("Civil Service Jobs — bot-check interstitial, no reader written");
  const { ctx } = makePage(
    "<title>Quick Check Needed</title><main><h1>Quick check needed</h1>" +
      "<p>We just need to confirm you're a real person.</p></main>",
    "https://www.civilservicejobs.service.gov.uk/csr/index.cgi?SID=csearch",
    CAPTURE_STACK,
  );
  const r = capture(ctx);
  // Tried live (2026-08-31): every attempt answered this same "Quick Check
  // Needed" / "I'm not a robot" interstitial, never real listing markup, so
  // no reader was written for this site and none is guessed. The generic
  // guesser is free to answer here (its title doesn't match any of the
  // five HARD STOP sentinels), which is why this fixture proves absence of
  // a fabricated jobs ARRAY rather than an {ok:false} refusal.
  check(
    !(r && r.jobs),
    "no fabricated SERP card list for a page this reader was never taught: " +
      JSON.stringify(r && !!r.jobs),
  );
}


// ---- the same unclaimed-SERP check never catches a real single advert ----
{
  console.log("A real single advert on an unmapped host is still captured");
  const html =
    "<h1>Retail Assistant</h1><main><div class='job-description'>" +
    "We are looking for a Retail Assistant to join our Croydon store. " +
    "Right to work in the UK required.</div></main>";
  const { ctx } = makePage(
    html,
    "https://www.some-unmapped-job-board.example/jobs/12345",
    CAPTURE_STACK,
  );
  const r = capture(ctx);
  check(
    r && r.ok === true && r.job && r.job.title === "Retail Assistant",
    "an ordinary advert title is never mistaken for a search query: " +
      JSON.stringify(r && r.job && r.job.title),
  );
}

// -- and never catches a genuine title merely shaped like "jobs in <place>" -
// This page ALSO carries >=3 repeated h2>a links (a "related roles" rail),
// so the only reason it must not be refused is the title's function-word
// exclusion doing its job — the repeated-links half of the check alone
// would otherwise have caught it.
{
  console.log('A genuine "jobs in <place>" title behind a function word is still captured');
  const html =
    "<h1>The Jobs in Croydon Coordinator</h1><main>" +
    "<div class='job-description'>Croydon Council is recruiting a Jobs " +
    "Coordinator to run our local employment support programme.</div>" +
    "<aside><h2><a href='/jobs/1'>Community Officer</a></h2>" +
    "<h2><a href='/jobs/2'>Youth Worker</a></h2>" +
    "<h2><a href='/jobs/3'>Housing Officer</a></h2></aside></main>";
  const { ctx } = makePage(
    html,
    "https://www.some-unmapped-job-board.example/jobs/99999",
    CAPTURE_STACK,
  );
  const r = capture(ctx);
  check(
    r && r.ok === true && r.job && r.job.title === "The Jobs in Croydon Coordinator",
    "the function-word exclusion (mirrors capture_serp_verdict server-side) lets a real title through even with a repeated-link rail present: " +
      JSON.stringify(r && r.job && r.job.title),
  );
}

// ------------------------------------------------------- Trackr results page
// The fixture is a CONSTRUCTED page, not a live capture —
// see yn_fixture_the_trackr_serp.json's own note: app.the-trackr.com was
// never fetched by this code. Every markup shape is transcribed from
// documented observations of the site's table (a signed-in read, 3 Sep
// 2026), so what this proves is "the reader correctly parses the DOCUMENTED
// shape", not "the reader was proven against a live page".
//
// The reader captures ONE row per invocation (Trackr's terms of use, sections 11.2 and 12.1(a):
// terms-of-use decision — see capture.js's own comment above
// ynTrackrSerpJobs). jsdom has no real mouse, so :hover never matches here;
// the test drives the OTHER real signal instead — document.activeElement,
// set by a genuine el.focus() call, exactly as a browser sets it the moment
// a student clicks or tabs to a link — to name which row is "under the
// caret" for each case below.
{
  console.log("Trackr results page, row under focus (constructed fixture, not a live capture)");
  const t = fixture("yn_fixture_the_trackr_serp.json");
  const html =
    "<table><thead><tr><th>My Status</th><th id=\"company-col-header\">Company Name</th>" +
    "<th>Programme Name</th><th>Opening Date</th><th>Closing Date</th>" +
    "<th>Last Year Opening</th><th>Materials</th><th>Sponsors Visa</th><th>Notes</th></tr></thead>" +
    "<tbody>" +
    t.sectionRow +
    t.rows[0] +
    t.secondSectionRow +
    t.rows[1] +
    "</tbody></table>";
  const { ctx, window } = makePage(
    html,
    "https://app.the-trackr.com/uk-tech/summer-internships",
    [...CAPTURE_STACK],
  );
  // Focus the FIRST row's programme link — the browser-native signal for
  // "the row the student just clicked or tabbed to".
  const firstProgrammeLink = window.document.querySelectorAll(
    'table tbody tr a[href^="https://"]',
  )[0];
  check(!!firstProgrammeLink, "fixture has a focusable first-row programme link");
  if (firstProgrammeLink) firstProgrammeLink.focus();
  check(
    window.document.activeElement === firstProgrammeLink,
    "jsdom sets document.activeElement on focus(), the same native signal a real browser sets on click",
  );

  // ynTrackrSerpJobs is declared in content/capture.js alongside the other
  // per-site readers; call it directly (ynSerpJobs dispatches to it too,
  // proven by the ok/jobs shape from ynCaptureCurrent below).
  const direct = vm.runInContext("ynTrackrSerpJobs()", ctx);
  check(
    Array.isArray(direct) && direct.length === 1,
    "ToS-restricted reader captures exactly ONE row (the focused one), never the whole table: " +
      (direct || []).length,
  );
  const j0 = direct[0] || {};
  check(
    j0.title === "Software engineer, summer intern UK",
    "title from the FOCUSED row's programme link text: " + JSON.stringify(j0.title),
  );
  check(
    j0.employer === "Bending Spoons",
    "employer from a[href^=\"/company/\"]: " + JSON.stringify(j0.employer),
  );
  check(
    j0.url === "https://jobs.bendingspoons.com/positions/abc123",
    "utm_* and source params stripped, employer's own apply URL kept: " + j0.url,
  );
  check(j0.location === "UK", "uk-tech tracker maps to location UK: " + j0.location);
  check(
    (j0.description || "").includes("Opens: 25 Aug 26") &&
      (j0.description || "").includes("Promoted"),
    "opening date and section category fold into the description: " +
      JSON.stringify(j0.description),
  );
  check(
    !(j0.description || "").includes("Deadline:"),
    "a blank Closing Date cell never invents a deadline: " + JSON.stringify(j0.description),
  );
  check(j0.source === "capture:app.the-trackr.com", "personal source label: " + j0.source);
  check(j0.mode === "serp", "mode is serp: " + j0.mode);

  // Full ynCaptureCurrent() dispatch also reaches Trackr via ynSerpJobs(),
  // and still returns only the one focused row.
  const r = capture(ctx);
  check(
    r && r.ok === true && Array.isArray(r.jobs) && r.jobs.length === 1,
    "ynCaptureCurrent dispatches to ynTrackrSerpJobs via ynSerpJobs, one row only: " +
      JSON.stringify(r && { ok: r.ok, len: (r.jobs || []).length }),
  );
}

// ------------------------------------- Trackr: focus on the SECOND row's link
{
  console.log("Trackr results page, row under focus is the SECOND row");
  const t = fixture("yn_fixture_the_trackr_serp.json");
  const html =
    "<table><tbody>" +
    t.sectionRow +
    t.rows[0] +
    t.secondSectionRow +
    t.rows[1] +
    "</tbody></table>";
  const { ctx, window } = makePage(
    html,
    "https://app.the-trackr.com/uk-tech/summer-internships",
    [...CAPTURE_STACK],
  );
  const links = window.document.querySelectorAll('table tbody tr a[href^="https://"]');
  check(links.length === 2, "fixture carries two programme links: " + links.length);
  if (links.length === 2) links[1].focus();
  const direct = vm.runInContext("ynTrackrSerpJobs()", ctx);
  check(
    Array.isArray(direct) && direct.length === 1,
    "still exactly one row when the SECOND row is focused: " + (direct || []).length,
  );
  const j1 = direct[0] || {};
  check(
    j1.title === "Data Science Summer Intern" && j1.employer === "Monzo",
    "the captured row is the FOCUSED (second) row, not the first: " +
      JSON.stringify([j1.title, j1.employer]),
  );
  check(
    (j1.description || "").includes("Deadline: 15 Oct 26") &&
      (j1.description || "").includes("Data Science"),
    "a real Closing Date and the SECOND section's own category: " +
      JSON.stringify(j1.description),
  );
}

// ------------------------------- Trackr: no focus and no hover names nothing
{
  console.log("Trackr results page, no row named by focus or hover — captures nothing");
  const t = fixture("yn_fixture_the_trackr_serp.json");
  const html = "<table><tbody>" + t.sectionRow + t.rows[0] + "</tbody></table>";
  const { ctx } = makePage(
    html,
    "https://app.the-trackr.com/uk-tech/summer-internships",
    [...CAPTURE_STACK],
  );
  // No .focus() call — document.activeElement is document.body, and jsdom
  // has no real pointer so tr:hover never matches. The reader must refuse
  // to guess, never falling back to "the first row" or "every row".
  const direct = vm.runInContext("ynTrackrSerpJobs()", ctx);
  check(
    Array.isArray(direct) && direct.length === 0,
    "no focused or hovered row: zero rows captured, never a silent whole-table fallback: " +
      JSON.stringify(direct),
  );
}

// ---------------------------------------- Trackr: a non-UK tracker is skipped
{
  console.log("Trackr non-UK tracker path — out of scope, no jobs read");
  const t = fixture("yn_fixture_the_trackr_serp.json");
  const html =
    "<table><tbody>" + t.sectionRow + t.rows[0] + "</tbody></table>";
  const { ctx } = makePage(
    html,
    "https://app.the-trackr.com/us-tech/summer-internships",
    CAPTURE_STACK,
  );
  const direct = vm.runInContext("ynTrackrSerpJobs()", ctx);
  check(direct === null, "us-tech (non-UK) tracker returns null, never guessed rows: " + JSON.stringify(direct));
}


// ================================================ ATS fallback =====
// Per-ATS job-detail fallback: five posting pages with no JobPosting ld+json
// and no "class*=company" text anywhere (most bare ATS postings never label
// the employer at all). Idea from two open-source autofill projects, never copied — see
// ynAtsPostingJob's own header comment in capture.js.
{
  console.log("per-ATS job-detail fallback — 5 postings, title+employer 5 of 5, where the generic guesser gets 0 of 5 employers");
  const data = fixture("ats_fallback/yn_fixture_ats_posting_no_ldjson.json");
  let guessEmployerHits = 0;
  let atsHits = 0;
  for (const p of data.postings) {
    const { ctx } = makePage(p.html, p.url, CAPTURE_STACK);
    const guess = vm.runInContext("ynGuessJob()", ctx);
    if (guess && guess.employer) guessEmployerHits += 1;
    const r = capture(ctx);
    const j = (r && r.job) || {};
    const hit = j.title === p.expectedTitle && j.employer === p.expectedEmployer;
    if (hit) atsHits += 1;
    check(
      hit,
      `${p.ats}: title+employer via the tenant-slug fallback: ` +
        JSON.stringify([j.title, j.employer]) + " expected " +
        JSON.stringify([p.expectedTitle, p.expectedEmployer]),
    );
    if (p.descriptionMustInclude) {
      check(
        (j.description || "").includes(p.descriptionMustInclude),
        `${p.ats}: description carries the employer's own words: ` + JSON.stringify(j.description),
      );
    }
    for (const banned of p.descriptionMustExclude || []) {
      check(
        !(j.description || "").includes(banned),
        `${p.ats}: description never carries the form's own chrome (${JSON.stringify(banned)}): ` +
          JSON.stringify(j.description),
      );
    }
  }
  check(guessEmployerHits === 0, "TODAY: the generic guesser finds an employer on 0 of 5 (no company-shaped text exists on any of these pages): " + guessEmployerHits);
  check(atsHits === 5, "the per-ATS fallback yields title+employer on 5 of 5: " + atsHits);
}

// ============================================== load-time side effects ====
// content/capture.js is injected click-time and must declare functions
// only — a second click re-declares harmlessly, and nothing reads or acts
// on the page until the caller explicitly invokes ynCaptureCurrent(). The
// old pin for this checked literal source text (the unbundled file carried
// no wrapping IIFE anywhere, so "no `})();` in the text" proved it). A
// migrated, esbuilt shipped file always carries the bundler's OWN outermost
// `(() => { ... })();` wrapper (see content/capture.js's own top comment),
// so that text check no longer means anything — this proves the real
// property instead: instrument the page's read surface BEFORE the file
// loads, and require zero reads happened until this harness's own explicit
// call below. Every extraction function in capture.js reads through
// document.querySelector/querySelectorAll or document.title, so any
// top-level statement that itself invoked one of them (self-running on
// load, as opposed to merely declaring it) would show up here.
{
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://example.com/",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const reads = [];
  const realQsa = window.document.querySelectorAll.bind(window.document);
  const realQs = window.document.querySelector.bind(window.document);
  window.document.querySelectorAll = (sel) => {
    reads.push("querySelectorAll(" + sel + ")");
    return realQsa(sel);
  };
  window.document.querySelector = (sel) => {
    reads.push("querySelector(" + sel + ")");
    return realQs(sel);
  };
  window.chrome = {
    storage: { local: { get: async (d) => ({ ...d }), set: async () => {} } },
    runtime: { sendMessage: () => {} },
  };
  const ctx = vm.createContext(window);
  for (const f of CAPTURE_STACK) {
    const src = readFileSync(path.join(root, "extension", f), "utf8");
    vm.runInContext(src, ctx, { filename: f });
  }
  check(
    reads.length === 0,
    "content/capture.js reads nothing while loading — declares only, until called (saw: " +
      (reads.join(", ") || "none") + ")",
  );
  check(
    vm.runInContext("typeof ynCaptureCurrent", ctx) === "function",
    "ynCaptureCurrent is declared and callable after load",
  );
  // The instrumented load must not have silently broken the read path
  // itself: an explicit call afterwards still reads the page normally.
  const readsBeforeCall = reads.length;
  vm.runInContext("ynCaptureCurrent()", ctx);
  check(
    reads.length > readsBeforeCall,
    "an explicit ynCaptureCurrent() call, after load, does read the page",
  );
}

console.log(failures ? `\n${failures} FAILED` : "\nall capture-extractor checks passed");
process.exit(failures ? 1 : 0);
