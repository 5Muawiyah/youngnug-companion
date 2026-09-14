// tests/ext_fixtures/adapters/run_url_scope.mjs — ynWithinApplicationScope: a
// 12-pair table of (approvedUrl, currentUrl, expected) plus a
// mid-wizard-redirect fixture. jsdom not needed (pure URL logic); Node's
// global URL is used by the module itself, so a bare vm context suffices.
//
// Run: node tests/ext_fixtures/adapters/run_url_scope.mjs   (exit 0 = all pass)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log("  ok   " + msg);
  } else {
    failures += 1;
    console.log("  FAIL " + msg);
  }
}

const src = readFileSync(
  path.join(root, "extension", "content", "adapters", "url_scope.js"),
  "utf8",
);
const ctx = vm.createContext({ URL, console, module: { exports: {} } });
vm.runInContext(src, ctx, { filename: "url_scope.js" });
const within = vm.runInContext("ynWithinApplicationScope", ctx);

const TABLE = [
  // [approved, current, expected, label]
  [
    "https://jobs.lever.co/acme/1234abcd-5678-efgh/apply",
    "https://jobs.lever.co/acme/1234abcd-5678-efgh/apply?step=2",
    true,
    "same job, later step (query-string only change)",
  ],
  [
    "https://jobs.lever.co/acme/1234abcd-5678-efgh",
    "https://jobs.lever.co/acme/1234abcd-5678-efgh/apply",
    true,
    "identity token present as a whole segment further down the route",
  ],
  [
    "https://jobs.lever.co/acme/1234abcd-5678-efgh",
    "https://jobs.lever.co/acme/9999zzzz-0000wxyz",
    false,
    "same company, a DIFFERENT job's identity token",
  ],
  [
    "https://jobs.lever.co/acme/1234abcd-5678-efgh",
    "https://jobs.lever.co/other-tenant/1234abcd-5678-efgh",
    false,
    "same identity token, but a different tenant (first path segment)",
  ],
  [
    "https://boards.greenhouse.io/acme/jobs/00000123456",
    "https://boards.greenhouse.io/acme/jobs/00000123456?gh_src=abc",
    true,
    "Greenhouse 5+ digit job id, query-string change only",
  ],
  [
    "https://boards.greenhouse.io/acme/jobs/00000123456",
    "https://boards.greenhouse.io/acme/jobs/00000999999",
    false,
    "Greenhouse different 5+ digit job id",
  ],
  [
    "https://example.com/careers/software-engineer",
    "https://example.com/careers/software-engineer-apply-now",
    false,
    "dictionary-word slug is never an identity token (substring is not a match)",
  ],
  [
    "https://example.com/careers/marketing",
    "https://example.com/careers/marketing/thanks",
    true,
    "token-less approved URL: segment-boundary prefix still counts",
  ],
  [
    "https://example.com/careers/marketing",
    "https://example.com/careers/engineering",
    false,
    "token-less approved URL: a DIFFERENT token-less path is out of scope",
  ],
  [
    "https://example.com/apply/company-x",
    "https://another.example.com/apply/company-x",
    false,
    "different host entirely",
  ],
  [
    "https://app.example.com/wizard/job-role-with-many-hyphens-here",
    "https://app.example.com/wizard/job-role-with-many-hyphens-here/step-3",
    true,
    "long multi-hyphen slug (2+ hyphens, 12+ chars) counts as identity",
  ],
  [
    "https://app.example.com/#/job/778899/apply",
    "https://app.example.com/#/job/778899/review",
    true,
    "SPA hash-route identity token carried through a step change",
  ],
];

console.log("12-pair URL scope table");
let i = 0;
for (const [approved, current, expected, label] of TABLE) {
  i += 1;
  const got = within(current, approved);
  check(got === expected, `${i}. ${label}: expected ${expected}, got ${got}`);
}

console.log("mid-wizard redirect stops the fill");
{
  const approved = "https://jobs.lever.co/acme/1234abcd-5678-efgh/apply";
  const redirectedTo = "https://jobs.lever.co/acme/9999zzzz-0000wxyz/apply";
  check(within(redirectedTo, approved) === false, "redirect to a different job id is out of scope");
}

if (failures) {
  console.log(failures + " FAILURE(S)");
  process.exit(1);
}
console.log("url_scope PASS");
