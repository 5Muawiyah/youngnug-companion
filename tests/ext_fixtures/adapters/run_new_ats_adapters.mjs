// tests/ext_fixtures/adapters/run_new_ats_adapters.mjs — the Personio, Pinpoint and
// Dover adapters against fixtures reconstructed from a live, no-sign-in
// read of one public posting per ATS (see each adapter's own
// header comment for the URL and date), plus Greenhouse's cross-checked
// education fields. jsdom, production files verbatim, no network.
//
// Run: node tests/ext_fixtures/adapters/run_new_ats_adapters.mjs   (exit 0 = all pass)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const require = createRequire(path.join(root, "package.json"));
const { JSDOM } = require("jsdom");

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log("  ok   " + msg);
  } else {
    failures += 1;
    console.log("  FAIL " + msg);
  }
}

function loadPage(file, stack) {
  const html = readFileSync(path.join(here, file), "utf8");
  const dom = new JSDOM(html, { url: "file://" + path.join(here, file), runScripts: "outside-only" });
  const { window } = dom;
  const ctx = vm.createContext(window);
  for (const f of stack) {
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

const BASE_STACK = ["common/challenge_detect.js", "content/dom_fill_kit.js", "content/engine.js"];

const PLAN = {
  contact: {
    first_name: "Sam",
    last_name: "Example",
    email: "student@example.com",
    phone: "07700 900123",
  },
  links: { linkedin: "https://www.linkedin.com/in/sam-example" },
  answers: { earliest_start: "Immediately", salary_expectation: "GBP 30000" },
  letter_text: "Dear Hiring Manager,\n\nI am writing to apply.\n",
  cv_url: "/api/documents/cv/1/file?fmt=pdf",
  letter_url: "/api/documents/letter/1/file?fmt=pdf",
};

// --------------------------------------------------------------- Personio
{
  console.log("Personio: confirmed field-<key> convention");
  const { window, ctx } = loadPage("personio_apply_form.html", [
    ...BASE_STACK,
    "content/adapters/personio.js",
  ]);
  const ad = adapterFor(ctx, "personio");
  const intents = ad.plan(PLAN, window.document);
  check(
    JSON.stringify(keys(intents)) ===
      JSON.stringify([
        "answers.earliest_start",
        "answers.salary_expectation",
        "contact.email",
        "contact.first_name",
        "contact.last_name",
        "contact.phone",
        "cv_file",
        "letter_file",
      ]),
    "plans contact + amber answers + both file uploads: " + JSON.stringify(keys(intents)),
  );
  const cv = intents.find((i) => i.fieldKey === "cv_file");
  check(cv && cv.el.id === "doc-input-cv", "CV targets doc-input-cv");
  const other = intents.find((i) => i.fieldKey === "letter_file");
  check(other && other.el.id === "doc-input-other", "cover letter targets doc-input-other");
  check(intents.every((i) => i.confidence === "exact"), "every claimed field is exact (platform-wide convention, confirmed live)");
}

// --------------------------------------------------------------- Pinpoint
{
  console.log("Pinpoint: confirmed application_form[application][...] convention, EEO refused");
  const { window, ctx } = loadPage("pinpoint_apply_form.html", [
    ...BASE_STACK,
    "content/adapters/pinpoint.js",
  ]);
  const ad = adapterFor(ctx, "pinpoint");
  const intents = ad.plan(PLAN, window.document);
  check(
    JSON.stringify(keys(intents)) ===
      JSON.stringify([
        "contact.email",
        "contact.first_name",
        "contact.last_name",
        "contact.phone",
        "cv_file",
        "letter_text",
        "links.linkedin",
      ]),
    "plans contact + linkedin + cv + summary, never middle name (not in the profile): " +
      JSON.stringify(keys(intents)),
  );
  const eeo = intents.filter((i) => i.skip === "eeo" || i.skip === "sensitive");
  check(eeo.length === 2, "both equality-monitoring selects are refused, never filled: " + eeo.length);
  check(
    eeo.every((i) => i.skip === "sensitive"),
    "equality monitoring is the 'sensitive' guard class",
  );
  check(
    eeo.every((i) => i.value === null),
    "sensitive intents carry no value — report-only",
  );
}

// ------------------------------------------------------------------ Dover
{
  console.log("Dover: name=-only selectors (React ids are unstable)");
  const { window, ctx } = loadPage("dover_apply_form.html", [...BASE_STACK, "content/adapters/dover.js"]);
  const ad = adapterFor(ctx, "dover");
  const intents = ad.plan(PLAN, window.document);
  check(
    JSON.stringify(keys(intents)) ===
      JSON.stringify(["contact.email", "contact.first_name", "contact.last_name", "contact.phone", "links.linkedin"]),
    "plans contact + linkedin by name= only: " + JSON.stringify(keys(intents)),
  );
  const first = intents.find((i) => i.fieldKey === "contact.first_name");
  check(first.el.getAttribute("name") === "firstName", "selected by name=, not the unstable React id");
}

// --------------------------------------------------- Greenhouse education
{
  console.log("Greenhouse: R10-cross-checked education ids, guessed confidence");
  const { window, ctx } = loadPage("greenhouse_education_fields.html", [
    ...BASE_STACK,
    "content/adapters/greenhouse.js",
  ]);
  const ad = adapterFor(ctx, "greenhouse");
  const plan = {
    ...PLAN,
    education: [{ institution: "Ashcombe University", qualification: "BSc", subject: "Computer Science" }],
  };
  const intents = ad.plan(plan, window.document);
  const edu = intents.filter((i) => i.fieldKey.startsWith("education."));
  check(edu.length === 3, "school/degree/discipline all claimed: " + edu.length);
  check(
    edu.every((i) => i.confidence === "guessed"),
    "every education intent is guessed, not exact (never confirmed live)",
  );
  const eeo = intents.filter((i) => i.skip === "eeo");
  check(eeo.length === 0, "no EEO fields on this fixture — the guard class stays intact for the ones that do exist elsewhere");
}

if (failures) {
  console.log(failures + " FAILURE(S)");
  process.exit(1);
}
console.log("new ATS adapters + greenhouse education PASS");
