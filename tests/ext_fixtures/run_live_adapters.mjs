// tests/ext_fixtures/run_live_adapters.mjs — the three live-read apply
// adapters (LinkedIn Easy Apply, Indeed Apply, Reed) planned against the
// pages those sites actually served (captured fixtures beside this file),
// with jsdom standing in for the browser. No network, no extension runtime.
//
// jsdom does no layout, so `offsetWidth`/`offsetHeight` are 0 everywhere;
// the adapters use them to tell a visible control from a hidden decoy. The
// shim below answers from the markup instead (the `hidden` attribute and the
// sites' own `hidden` class), which is exactly what the captured pages
// declare. Everything else is the production code, evaluated verbatim.
//
// Run: node tests/ext_fixtures/run_live_adapters.mjs   (exit 0 = all pass)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const require = createRequire(path.join(root, "package.json"));
const { JSDOM } = require("jsdom");

const STACK = [
  "common/challenge_detect.js",
  "common/label_quality.js",
  "common/placeholder.js",
  "content/dom_fill_kit.js",
  "content/aria_driver.js",
  "content/skills_fill.js",
  "content/engine.js",
  "content/detect.js",
  "content/heuristics.js",
  "content/adapters/linkedin_easy_apply.js",
  "content/adapters/indeed_apply.js",
  "content/adapters/reed.js",
];

const PLAN = {
  job_id: 1,
  job: { title: "Trainee Accounts Assistant", employer: "Example Ltd" },
  contact: {
    first_name: "Sam",
    last_name: "Example",
    email: "student@example.com",
    phone: "07700 900123",
  },
  address: {
    line1: "1 Example Street",
    city: "London",
    postcode: "SW1A 1AA",
    country: "United Kingdom",
  },
  links: {},
  right_to_work: { uk_rtw: true, needs_sponsorship: false },
  answers: {},
  unconfirmed_answers: [],
  cv_url: "/api/documents/cv/1/file?fmt=pdf",
  letter_url: "/api/documents/letter/1/file?fmt=pdf",
  letter_text: "Dear Hiring Manager,\n\nI am writing to apply.\n\nYours faithfully,\nSam Example",
  dry_run: true,
};

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log("  ok   " + msg);
  } else {
    failures += 1;
    console.log("  FAIL " + msg);
  }
}

function loadPage(file, url) {
  const html = readFileSync(path.join(here, file), "utf8");
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  // layout shim: visible unless hidden by attribute or the site's class
  const hiddenBy = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.hasAttribute("hidden")) return true;
      if (/(^|\s)hidden(\s|$)/.test(n.getAttribute("class") || "")) return true;
    }
    return false;
  };
  Object.defineProperty(window.HTMLElement.prototype, "offsetWidth", {
    get() {
      return hiddenBy(this) ? 0 : 100;
    },
    configurable: true,
  });
  Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", {
    get() {
      return hiddenBy(this) ? 0 : 20;
    },
    configurable: true,
  });
  window.HTMLElement.prototype.getClientRects = function () {
    return hiddenBy(this) ? [] : [{ width: 100, height: 20 }];
  };
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return hiddenBy(this)
      ? { width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 }
      : { width: 100, height: 20, left: 10, top: 10, right: 110, bottom: 30 };
  };
  // the fixture's own tripwires run in the page
  for (const s of [...window.document.querySelectorAll("script")]) {
    window.eval(s.textContent);
  }
  const ctx = vm.createContext(window);
  for (const f of STACK) {
    const src = readFileSync(path.join(root, "extension", f), "utf8");
    vm.runInContext(src, ctx, { filename: f });
  }
  return { window, ctx };
}

function adapterFor(ctx, id) {
  return vm.runInContext("YN_ADAPTERS", ctx).find((a) => a.id === id);
}

function keys(intents) {
  return intents.filter((i) => i && !i.skip).map((i) => i.fieldKey).sort();
}

// ---------------------------------------------------------------- LinkedIn
{
  console.log("LinkedIn Easy Apply, step 1 (Contact info)");
  const { window, ctx } = loadPage(
    "linkedin_easy_apply_step1.html",
    "https://www.linkedin.com/jobs/view/4454011550/",
  );
  const doc = window.document;
  const ats = vm.runInContext("ynDetectAts", ctx)(doc, "https://www.linkedin.com/jobs/view/4454011550/");
  check(ats.id === "linkedin" && ats.confidence === "url", "detects linkedin by URL");
  const byDom = vm.runInContext("ynDetectAts", ctx)(doc, "http://127.0.0.1:8099/linkedin_easy_apply_step1.html");
  check(byDom.id === "linkedin" && byDom.confidence === "dom", "detects the open modal by fingerprint");
  const ad = adapterFor(ctx, "linkedin");
  const intents = ad.plan(PLAN, doc);
  check(
    JSON.stringify(keys(intents)) === JSON.stringify(["contact.email", "contact.phone", "contact.phone_country"]),
    "plans exactly email, phone and dial code: " + JSON.stringify(keys(intents)),
  );
  const phone = intents.find((i) => i.fieldKey === "contact.phone");
  check(phone && phone.value === "07700900123" && phone.confidence === "exact", "phone is the national number, exact");
  const email = intents.find((i) => i.fieldKey === "contact.email");
  check(email && email.kind === "select" && email.value === "student@example.com", "email picks the verified option that IS the student's address");
  const dial = intents.find((i) => i.fieldKey === "contact.phone_country");
  check(dial && dial.kind === "select" && /United Kingdom \(\+44\)/.test(dial.value) && dial.confidence === "guessed", "dial code chosen from the number's prefix, amber");
  check(intents.every((i) => !i.el || i.el.tagName !== "BUTTON"), "never targets a button");
  const other = { ...PLAN, contact: { ...PLAN.contact, email: "someone.else@example.com" } };
  const i2 = ad.plan(other, doc);
  const e2 = i2.find((i) => i.fieldKey === "contact.email");
  check(e2 && e2.skip === "needs_you", "a mailbox LinkedIn has not verified is left to the student, not guessed");
  const stepKey = ad.wizard.stepKey(doc);
  check(stepKey === "Contact info@0", "step key is heading@progress: " + stepKey);
  const adv = ad.wizard.advance(doc);
  check(adv && /Continue to next step/.test(adv.getAttribute("aria-label")), "advance detects the Next button (detection only)");
  check(vm.runInContext("ynSubmitGuard", ctx)(adv) === false, "Next is not submit-shaped");
  check(window.__advanced === false && window.__submitted === false, "planning clicked nothing");
  check(ad.scope(doc) && ad.scope(doc).classList.contains("jobs-easy-apply-modal"), "scope is the modal");
}
{
  console.log("LinkedIn Easy Apply, step 2 (Resume)");
  const { window, ctx } = loadPage(
    "linkedin_easy_apply_step2.html",
    "https://www.linkedin.com/jobs/view/4454011550/",
  );
  const doc = window.document;
  const ad = adapterFor(ctx, "linkedin");
  const intents = ad.plan(PLAN, doc);
  check(JSON.stringify(keys(intents)) === JSON.stringify(["cv_file"]), "plans exactly the CV upload: " + JSON.stringify(keys(intents)));
  const cv = intents.find((i) => i.fieldKey === "cv_file");
  check(cv && cv.kind === "file" && cv.value && cv.value.file === "cv" && cv.uploadMode === "input", "CV intent is a file ref for the engine to fetch");
  check(!cv.confirmSelector, "no unverified confirm selector is claimed (the attach reports amber)");
  const noCv = ad.plan({ ...PLAN, cv_url: null }, doc);
  check(keys(noCv).length === 0, "without a CV in the plan nothing is attached");
  check(ad.wizard.stepKey(doc) === "Resume@33", "step key Resume@33");
  check(window.__advanced === false && window.__submitted === false, "planning clicked nothing");
}
{
  console.log("LinkedIn listing without the modal");
  const { window, ctx } = loadPage(
    "linkedin_easy_apply_step1.html",
    "https://www.linkedin.com/jobs/search/?currentJobId=4454011550",
  );
  const doc = window.document;
  doc.querySelector(".jobs-easy-apply-modal").remove();
  const ad = adapterFor(ctx, "linkedin");
  const intents = ad.plan(PLAN, doc);
  check(intents.length === 1 && intents[0].skip === "needs_you" && /Easy Apply/.test(intents[0].label), "asks the student to open Easy Apply, fills nothing");
  check(ad.scope(doc) === null, "scope is null when the modal is closed (no generic rung runs)");
  check(ad.wizard.advance(doc) === null, "no advance control without the modal");
  check(window.__advanced === false && window.__submitted === false, "nothing clicked");
}

// ------------------------------------------------------------------ Indeed
{
  console.log("Indeed Apply, contact information");
  const { window, ctx } = loadPage(
    "indeed_apply_contact.html",
    "https://smartapply.indeed.com/beta/indeedapply/form/contact-info-module",
  );
  const doc = window.document;
  const ats = vm.runInContext("ynDetectAts", ctx)(doc, "https://smartapply.indeed.com/beta/indeedapply/form/contact-info-module");
  check(ats.id === "indeed" && ats.confidence === "url", "detects indeed by URL");
  const byDom = vm.runInContext("ynDetectAts", ctx)(doc, "http://127.0.0.1:8099/indeed_apply_contact.html");
  check(byDom.id === "indeed" && byDom.confidence === "dom", "detects the wizard page by fingerprint");
  const ad = adapterFor(ctx, "indeed");
  const intents = ad.plan(PLAN, doc);
  check(
    JSON.stringify(keys(intents)) === JSON.stringify(["contact.first_name", "contact.last_name", "contact.phone"]),
    "plans exactly first name, last name and phone on this step: " + JSON.stringify(keys(intents)),
  );
  const phone = intents.find((i) => i.fieldKey === "contact.phone");
  check(phone && phone.value === "7700900123" && phone.el.name === "phone", "phone is the national significant number into input[name=phone]");
  const first = intents.find((i) => i.fieldKey === "contact.first_name");
  check(first && first.el.getAttribute("autocomplete") === "given-name" && first.confidence === "exact", "first name found by its autocomplete token, exact");
  check(!intents.some((i) => i.el && i.el.name === "age"), "the hidden age honeypot is never claimed");
  const honeypot = vm.runInContext("ynIsHoneypot", ctx)(doc.querySelector('input[name="age"]'), doc);
  check(honeypot === true, "the engine recognises the age field as a honeypot");
  const adv = ad.wizard.advance(doc);
  check(adv && /^Continue$/.test(adv.textContent.trim()), "advance detects a Continue button");
  const visibleContinues = [...doc.querySelectorAll("button")].filter((b) => /^Continue$/.test(b.textContent.trim()) && b.offsetWidth > 0);
  check(doc.querySelectorAll("button").length >= 10 && adv === visibleContinues[0], "…and it is a visible one, not a decoy (the page ships " + [...doc.querySelectorAll("button")].filter((b) => /^Continue$/.test(b.textContent.trim())).length + " Continue buttons)");
  check(ad.wizard.stepKey(doc) === "Add your contact information@11", "step key: " + ad.wizard.stepKey(doc));
  check(window.__advanced === false && window.__submitted === false, "planning clicked nothing");
  const passive = vm.runInContext("typeof ynPassiveCaptchaPresent === 'function' ? ynPassiveCaptchaPresent() : null", ctx);
  console.log("  note passive captcha detector says: " + passive);
}

// -------------------------------------------------------------------- Reed
{
  console.log("Reed application modal (signed in, cover letter open)");
  const { window, ctx } = loadPage(
    "reed_apply_modal.html",
    "https://www.reed.co.uk/jobs/trainee-accounts-assistant/57130702",
  );
  const doc = window.document;
  // the signed-in signal the live page carries (the header's Sign out link).
  // The live href carries a returnTo query (observed in a real
  // signed-in session, 2026-08-25): an exact attribute match misses it and
  // would hand a signed-in student to the login wall.
  const a = doc.createElement("a");
  a.setAttribute(
    "href",
    "/authentication/logout?returnTo=%2Fjobs%2Ftrainee-accounts-assistant%2F57130702",
  );
  a.textContent = "Sign out";
  doc.body.prepend(a);
  const ats = vm.runInContext("ynDetectAts", ctx)(doc, "https://www.reed.co.uk/jobs/trainee-accounts-assistant/57130702");
  check(ats.id === "reed" && !ats.assistOnly, "detects reed without the wall flag");
  const ad = adapterFor(ctx, "reed");
  check(ad.loginWall(doc) === false, "signed in: no login wall");
  const intents = ad.plan(PLAN, doc);
  check(JSON.stringify(keys(intents)) === JSON.stringify(["cover_letter_text"]), "plans exactly the cover letter: " + JSON.stringify(keys(intents)));
  const cl = intents.find((i) => i.fieldKey === "cover_letter_text");
  check(cl && cl.kind === "textarea" && cl.el.name === "coverLetterText" && cl.value === PLAN.letter_text, "the student's ready letter goes into textarea[name=coverLetterText]");
  check(!intents.some((i) => i.el && /submit/i.test(i.el.textContent || "")), "never targets Submit application");
  const submit = doc.querySelector('[data-qa="submit-application-btn"]');
  check(vm.runInContext("ynSubmitGuard", ctx)(submit) === true, "Submit application is refused by shape");
  check(window.__submitted === false, "nothing submitted");
  // The live page does not always render the header's logout link (observed
  // in a real signed-in session): an open application modal is itself
  // signed-in evidence, because anonymous Apply clicks navigate to
  // /authentication/login and never open the modal.
  a.remove();
  check(ad.loginWall(doc) === false, "modal open without the logout link: still no wall (live-observed state)");
  check(JSON.stringify(keys(ad.plan(PLAN, doc))) === JSON.stringify(["cover_letter_text"]), "the letter still plans in that state");
  // Truly signed out: no logout link and no modal - the wall handoff.
  doc.querySelector('[data-qa="apply-job-modal"]').remove();
  check(ad.loginWall(doc) === true, "signed out (no modal anywhere): the login wall handoff");
  check(ad.plan(PLAN, doc).length === 0, "signed out: nothing is planned");
  // The pre-click state the live session actually shows: header logout link
  // (with its returnTo query) present, NO modal open yet. This must read as
  // signed in, or the filler hands a signed-in student to the login wall
  // before the modal ever opens.
  doc.body.prepend(a);
  check(
    ad.loginWall(doc) === false,
    "job page before the Apply click (returnTo logout link, no modal): no wall",
  );
  a.remove();
}
{
  console.log("Reed 'About you' sub-modal");
  const { window, ctx } = loadPage(
    "reed_about_you_modal.html",
    "https://www.reed.co.uk/jobs/trainee-accounts-assistant/57130702",
  );
  const doc = window.document;
  const a = doc.createElement("a");
  a.setAttribute("href", "/authentication/logout");
  doc.body.prepend(a);
  const ats = vm.runInContext("ynDetectAts", ctx)(doc, "http://127.0.0.1:8099/reed_about_you_modal.html");
  check(ats.id === "reed" && ats.confidence === "dom", "detects the sub-modal by fingerprint");
  const ad = adapterFor(ctx, "reed");
  const intents = ad.plan(PLAN, doc);
  check(
    JSON.stringify(keys(intents)) === JSON.stringify(["contact.first_name", "contact.last_name", "contact.phone"]),
    "plans exactly forename, surname and phone: " + JSON.stringify(keys(intents)),
  );
  const phone = intents.find((i) => i.fieldKey === "contact.phone");
  check(phone && phone.value === "+447700900123" && phone.el.id === "phone", "phone in E.164 into #phone");
  check(!intents.some((i) => i.el && i.el.id === "jobTitle"), "job title is not claimed (no exact fact for it)");
  const save = doc.querySelector('[data-qa="about-you-save-btn"]');
  check(vm.runInContext("ynSubmitGuard", ctx)(save) === true, "Save is type=submit and refused by shape");
  check(window.__saved === false && window.__submitted === false, "nothing saved or submitted");
}

console.log(failures ? `\n${failures} FAILED` : "\nall live-adapter checks passed");
process.exit(failures ? 1 : 0);
