// run_liveness_check.mjs — common/liveness_markers.js's
// ynDetectLiveness(), the reader content/liveness_check.js calls on page
// load. jsdom stands in for the browser, exactly like run_capture_
// extractors.mjs and run_live_adapters.mjs; the production files are
// evaluated verbatim.
//
// Pinned here: a closed-marker page on a host the closing set has NOT
// confirmed (Indeed and LinkedIn both start unconfirmed — see
// common/liveness_markers.js's own header) answers "could_not_tell" naming
// the candidate phrase, never "closed"; the SAME page answers "closed" WITH
// the exact phrase once that host is added to
// YN_CLOSED_MARKERS_CONFIRMED_HOSTS (proving the gate itself, not just its
// default-off state); a login-wall/captcha page answers "could_not_tell"
// WITH the named sentinel (never a guess, never "closed") even ahead of a
// closed-shaped phrase; an ordinary advert page on an allowlisted host
// answers "live"; a host outside the marker table answers "could_not_tell"
// rather than ever assuming "live" for a page this reader was never taught.
//
// Run: node run_liveness_check.mjs   (any cwd; exit 0 = all pass)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const require = createRequire(path.join(root, "package.json"));
const { JSDOM } = require("jsdom");

const LIVENESS_STACK = [
  "common/api.js",
  "common/challenge_detect.js",
  "common/liveness_markers.js",
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

function makePage(html, url, files = LIVENESS_STACK) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  const { window } = dom;
  window.chrome = {
    storage: { local: { get: async (d) => ({ ...d }), set: async () => {} } },
    runtime: { sendMessage: () => {} },
  };
  const ctx = vm.createContext(window);
  for (const f of files) {
    const src = readFileSync(path.join(root, "extension", f), "utf8");
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx;
}

function detect(ctx) {
  return vm.runInContext("ynDetectLiveness()", ctx);
}

// ---------------------------------- Indeed closed advert, UNCONFIRMED host
{
  console.log(
    "Indeed /viewjob showing 'This job has expired' — Indeed is not in the " +
      "closing set yet, so could_not_tell naming the candidate phrase, never closed",
  );
  const html =
    "<main><h1>Trainee Analyst</h1>" +
    "<div class='jobsearch-JobInfoHeader-title'>Trainee Analyst</div>" +
    "<div id='jobDescriptionText'>We are hiring a trainee analyst.</div>" +
    "<div class='status-banner'>This job has expired</div></main>";
  const ctx = makePage(html, "https://uk.indeed.com/viewjob?jk=abc123def456");
  const r = detect(ctx);
  check(r.verdict === "could_not_tell", "verdict is could_not_tell: " + JSON.stringify(r));
  check(
    /This job has expired/.test(r.evidence) && /not yet confirmed/.test(r.evidence),
    "evidence names the unconfirmed candidate phrase: " + JSON.stringify(r.evidence),
  );
}

// ------------------------------- LinkedIn closed advert, UNCONFIRMED host
{
  console.log(
    "LinkedIn /jobs/view showing 'No longer accepting applications' — same gate, same result",
  );
  const html =
    "<main><h1>Advertising Executive</h1>" +
    "<div class='jobs-details-top-card'>No longer accepting applications</div>" +
    "<div>About the job: we are hiring.</div></main>";
  const ctx = makePage(html, "https://www.linkedin.com/jobs/view/4271649433/");
  const r = detect(ctx);
  check(r.verdict === "could_not_tell", "verdict is could_not_tell: " + JSON.stringify(r));
  check(
    /No longer accepting applications/.test(r.evidence) && /not yet confirmed/.test(r.evidence),
    "evidence names the unconfirmed candidate phrase: " + JSON.stringify(r.evidence),
  );
}

// --------------------------- the SAME Indeed page, host now CONFIRMED —
// -------------------------------------------- proves the gate itself works
{
  console.log(
    "The gate flips to closed once a live check adds the host to the confirmed set " +
      "(never automatically — production ships with the set empty)",
  );
  const html =
    "<main><h1>Trainee Analyst</h1>" +
    "<div class='status-banner'>This job has expired</div></main>";
  const ctx = makePage(html, "https://uk.indeed.com/viewjob?jk=confirmedcase");
  vm.runInContext('YN_CLOSED_MARKERS_CONFIRMED_HOSTS.add("indeed.")', ctx);
  const r = detect(ctx);
  check(r.verdict === "closed", "verdict is closed once confirmed: " + JSON.stringify(r));
  check(r.evidence === "This job has expired", "evidence is the exact phrase: " + JSON.stringify(r.evidence));
}

// --------------------------------------------- Indeed ordinary open advert
{
  console.log("Indeed /viewjob with no closed marker — live");
  const html =
    "<main><h1 class='jobsearch-JobInfoHeader-title'>Trainee Analyst</h1>" +
    "<div id='jobDescriptionText'>We are hiring a trainee analyst in Leeds.</div></main>";
  const ctx = makePage(html, "https://uk.indeed.com/viewjob?jk=zz9988");
  const r = detect(ctx);
  check(r.verdict === "live", "verdict is live: " + JSON.stringify(r));
  check(r.evidence === "", "no evidence for live: " + JSON.stringify(r.evidence));
}

// ------------------------------------------- LinkedIn ordinary open advert
{
  console.log("LinkedIn /jobs/view with no closed marker — live");
  const html =
    "<main><h1>Sales Associate</h1><div>About the job: join our team.</div></main>";
  const ctx = makePage(html, "https://www.linkedin.com/jobs/view/9999999/");
  const r = detect(ctx);
  check(r.verdict === "live", "verdict is live: " + JSON.stringify(r));
}

// --------------------------------------- login wall — could_not_tell, named
{
  console.log("A sign-in page title — could_not_tell, names the sentinel");
  const html = "<title>Sign in to view this job</title><body></body>";
  const ctx = makePage(html, "https://uk.indeed.com/viewjob?jk=walled");
  const r = detect(ctx);
  check(r.verdict === "could_not_tell", "verdict is could_not_tell: " + JSON.stringify(r));
  check(
    /sign-in page title/.test(r.evidence),
    "evidence names which sentinel fired: " + JSON.stringify(r.evidence),
  );
}

{
  console.log("A live password form on a login action (no sign-in title) — could_not_tell, names the sentinel");
  const html =
    "<title>Account Access</title>" +
    "<form action='/login'><input type='password' name='pw'></form>";
  const ctx = makePage(html, "https://www.linkedin.com/jobs/view/555555/");
  const r = detect(ctx);
  check(r.verdict === "could_not_tell", "verdict is could_not_tell: " + JSON.stringify(r));
  check(
    /password form/.test(r.evidence),
    "evidence names which sentinel fired: " + JSON.stringify(r.evidence),
  );
}

// ----------------------------------------- captcha widget — could_not_tell
{
  console.log("A recaptcha widget on the page — could_not_tell, never closed");
  const html =
    "<iframe src='https://challenge.example/recaptcha/x'></iframe>" +
    "<main><h1>Trainee Analyst</h1></main>";
  const ctx = makePage(html, "https://www.linkedin.com/jobs/view/123456/");
  const r = detect(ctx);
  check(r.verdict === "could_not_tell", "verdict is could_not_tell: " + JSON.stringify(r));
  check(/recaptcha/.test(r.evidence), "evidence names the recaptcha sentinel: " + JSON.stringify(r.evidence));
}

// ----------------------- a closed PHRASE inside a captcha page still never
// -------------------------------------- overrides the sentinel's priority
{
  console.log("Sentinel checked BEFORE any phrase match — never 'closed' behind a wall");
  const html =
    "<iframe src='https://challenge.example/hcaptcha/x'></iframe>" +
    "<main>This job has expired</main>"; // the phrase is present but blocked wins
  const ctx = makePage(html, "https://uk.indeed.com/viewjob?jk=blockedbutclosed");
  const r = detect(ctx);
  check(
    r.verdict === "could_not_tell",
    "a blocked page is could_not_tell even if closed-shaped text is present: " +
      JSON.stringify(r),
  );
}

// --------------------------------------------- unrecognised host — honest
{
  console.log("A host with no marker list at all — could_not_tell, never a guessed 'live'");
  const html = "<main><h1>Trainee Analyst</h1><p>An ordinary advert.</p></main>";
  const ctx = makePage(html, "https://careers.example.com/jobs/1");
  const r = detect(ctx);
  check(r.verdict === "could_not_tell", "verdict is could_not_tell: " + JSON.stringify(r));
  check(
    r.evidence === "unrecognised page layout",
    "evidence says why: " + JSON.stringify(r.evidence),
  );
}

// ------------------------------------------------------------- empty page
{
  console.log("An empty page (nothing readable) — could_not_tell, never a guess");
  const ctx = makePage("<main></main>", "https://uk.indeed.com/viewjob?jk=blank");
  const r = detect(ctx);
  check(r.verdict === "could_not_tell", "verdict is could_not_tell: " + JSON.stringify(r));
  check(r.evidence === "empty page", "evidence says why: " + JSON.stringify(r.evidence));
}

console.log(failures ? `\n${failures} FAILED` : "\nall liveness-check checks passed");
process.exit(failures ? 1 : 0);
