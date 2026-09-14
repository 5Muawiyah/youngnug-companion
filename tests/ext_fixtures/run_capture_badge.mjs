/**
 * A passive reCAPTCHA badge is not a blocked page for CAPTURE.
 *
 * Measured live on a Greenhouse job-boards posting: the page carries a
 * reCAPTCHA v3 badge iframe (size=invisible, inside .grecaptcha-badge) and
 * no ld+json, and the capture posted nothing because the blocked-page
 * sentinel counted the badge as a captcha widget. The fill path already
 * treats that badge as "you will solve it when you submit"; capture reads
 * the advert's text and touches nothing, so the badge alone must not stop it.
 *
 * Three pages, the production capture stack under jsdom:
 *   1. an advert with ONLY a v3 badge iframe          -> captured
 *   2. an advert with a reCAPTCHA CHALLENGE (bframe)   -> blocked, nothing captured
 *   3. an interstitial page title                      -> blocked, nothing captured
 * Nothing is solved anywhere; the badge is left where it is.
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
const STACK = ["common/api.js", "common/challenge_detect.js", "content/capture.js"];

let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures += 1;
    console.log("  FAIL " + msg);
  }
}

function page(html, url, title) {
  const dom = new JSDOM(`<!doctype html><html><head><title>${title}</title></head><body>${html}</body></html>`, {
    url,
    runScripts: "outside-only",
  });
  const { window } = dom;
  window.chrome = {
    storage: { local: { get: async (d) => ({ ...d }), set: async () => {} } },
    runtime: { sendMessage: () => {} },
  };
  const ctx = vm.createContext(window);
  for (const f of STACK) {
    vm.runInContext(readFileSync(path.join(root, "extension", f), "utf8"), ctx, { filename: f });
  }
  return ctx;
}

const ADVERT = `
  <h1 class="section-header">Sales Development Representative</h1>
  <div class="location">Leeds, UK</div>
  <div class="job__description body">
    <p>GoCardless is a global bank payment company. As an SDR your main goal will be to prospect
    and qualify new business opportunities with senior decision-makers across the UK and Ireland.
    You will work with experienced Sales Account Executives to win new business and grow the
    pipeline through email outreach, LinkedIn messaging, video and phone calls.</p>
  </div>
  <div id="application-form"><form><input name="first_name"><input type="file" name="resume"></form></div>`;

// reCAPTCHA v3 also injects its hidden token textarea, whose id contains "captcha".
const BADGE = `<textarea id="g-recaptcha-response-100000" name="g-recaptcha-response" class="g-recaptcha-response" style="display:none"></textarea>
<div class="grecaptcha-badge" style="width:256px;height:60px;position:fixed;bottom:14px;right:-186px">
  <div class="grecaptcha-logo"><iframe title="reCAPTCHA" src="https://www.recaptcha.net/recaptcha/enterprise/anchor?ar=1&k=6Le&co=aHR0&hl=en&v=abc&size=invisible&cb=xyz" width="256" height="60"></iframe></div>
</div>`;

const CHALLENGE = `<div class="g-recaptcha"><iframe title="reCAPTCHA" src="https://www.google.com/recaptcha/api2/anchor?ar=1&k=6Le&size=normal" width="304" height="78"></iframe></div>
<div style="position:fixed"><iframe title="recaptcha challenge" src="https://www.google.com/recaptcha/api2/bframe?hl=en&v=abc&k=6Le" width="400" height="580"></iframe></div>`;

{
  console.log("1. advert with only a v3 badge (Greenhouse job-boards shape)");
  const ctx = page(ADVERT + BADGE, "https://job-boards.greenhouse.io/examplepay/jobs/1000001", "Job Application for Sales Development Representative at ExamplePay");
  const r = vm.runInContext("ynCaptureCurrent()", ctx);
  check(r && r.ok === true, "capture proceeds past the badge: " + JSON.stringify(r && (r.error || r.ok)));
  check(r && r.job && /Sales Development Representative/.test(r.job.title || ""), "the title was read: " + JSON.stringify(r && r.job && r.job.title));
  check(vm.runInContext("ynBlockedReason()", ctx) === "", "ynBlockedReason is empty for a badge and its hidden token field: " + vm.runInContext("ynBlockedReason()", ctx));
  check(vm.runInContext("ynPassiveCaptchaPresent()", ctx) === true, "the badge is still reported as a passive captcha (the fill path's note)");
}
{
  console.log("2. advert with a reCAPTCHA challenge frame (bframe)");
  const ctx = page(ADVERT + CHALLENGE, "https://example.com/apply/123", "Apply");
  const r = vm.runInContext("ynCaptureCurrent()", ctx);
  check(r && r.ok === false && /recaptcha/.test(r.error || ""), "blocked with the reCAPTCHA reason: " + JSON.stringify(r && r.error));
  check(!(r && r.job), "nothing captured");
}
{
  console.log("3. interstitial title");
  const ctx = page(ADVERT, "https://example.com/jobs/1", "Just a moment...");
  const r = vm.runInContext("ynCaptureCurrent()", ctx);
  check(r && r.ok === false && /interstitial/.test(r.error || ""), "blocked with the interstitial reason: " + JSON.stringify(r && r.error));
}

// Recruitee: the hCaptcha widget is mounted on the POSTING page too, inside a hidden
// block, with the loader script and empty token holders whose ids contain "captcha".
const RECRUITEE_HIDDEN = `<script id="hcaptcha-api-script-id"></script>
<div style="display:none"><form><div><iframe title="Widget containing checkbox for hCaptcha security challenge" src="https://captcha-assets.recruiteecdn.com/captcha/v1/3115eb7fb"></iframe></div>
<div id="input-captchaToken-undefined"></div><div id="input-captchaToken-28-error"></div></form></div>`;
const RECRUITEE_SHOWN = `<form><div><iframe title="Widget containing checkbox for hCaptcha security challenge" src="https://captcha-assets.recruiteecdn.com/captcha/v1/3115eb7fb" width="300" height="80"></iframe></div>
<div id="input-captchaToken-undefined"></div></form>`;
{
  console.log("4. Recruitee posting page: hidden hCaptcha machinery only");
  const ctx = page(ADVERT + RECRUITEE_HIDDEN, "https://examplestudio.recruitee.com/o/social-media-editor-creator", "Example Studio - Social Media Editor / Creator");
  const r = vm.runInContext("ynCaptureCurrent()", ctx);
  check(vm.runInContext("ynBlockedReason()", ctx) === "", "no sentinel fires: " + vm.runInContext("ynBlockedReason()", ctx));
  check(r && r.ok === true, "capture proceeds: " + JSON.stringify(r && (r.error || r.ok)));
}
{
  console.log("5. Recruitee apply page: the same widget rendered");
  const ctx = page(ADVERT + RECRUITEE_SHOWN, "https://examplestudio.recruitee.com/o/social-media-editor-creator/c/new", "Example Studio - Application");
  const reason = vm.runInContext("ynBlockedReason()", ctx);
  check(/captcha widget frame/.test(reason), "blocked by the frame's title: " + reason);
  const r = vm.runInContext("ynCaptureCurrent()", ctx);
  check(r && r.ok === false, "nothing captured");
}
{
  console.log("6. SmartRecruiters posting: a hidden Internet Explorer h1 before the job title");
  const SR = `<div class="isn-overlay-dialog" style="display:none"><h1 class="isn-overlay-dialog-header">Sorry, Internet Explorer 11 is no longer supported</h1></div>
  <h1 class="job-title spl-text-h3" itemprop="title">Artworker, Example Books</h1>
  <p class="job-location">London, United Kingdom</p>
  <div itemprop="hiringOrganization"><span itemprop="name">Example Publishing</span></div>
  <div class="job-sections"><p>Example Books is looking for an Artworker to join its design team in London. You will prepare print-ready files, retouch images and keep every cover to brand across a busy list of fiction and non-fiction titles.</p></div>`;
  const ctx = page(SR, "https://jobs.smartrecruiters.com/Example-Publishing/744000000000001", "Example-Publishing Artworker, Example Books | SmartRecruiters");
  const r = vm.runInContext("ynCaptureCurrent()", ctx);
  check(r && r.job && r.job.title === "Artworker, Example Books", "the visible job title wins: " + JSON.stringify(r && r.job && r.job.title));
}

if (failures) {
  console.log("\ncapture badge FAIL: " + failures);
  process.exit(1);
}
console.log("\ncapture badge PASS: passive captcha machinery does not block a capture; a rendered challenge frame and an interstitial still do; a hidden heading never wins");
