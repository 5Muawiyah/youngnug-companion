/**
 * Detection-naming pin — the overlay must never tell a student it is filling
 * a system it is not on.
 *
 * Live evidence: Personio's apply page carries a `.application-form`, which
 * was the whole of Lever's DOM fingerprint, so every Personio fill was
 * detected as Lever and the student-facing overlay read "Filling a Lever
 * application" on a Personio form. The same over-generic-marker mistake the
 * Greenhouse rule already documents (`#application-form`), made twice.
 *
 * "unknown" is a first-class honest answer here — a page we cannot name must
 * be reported as unknown, never as the nearest guess.
 *
 * Run: node tests/ext_fixtures/run_detect_naming.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DETECT = path.join(ROOT, "extension", "content", "detect.js");

const sandbox = {
  console,
  document: { querySelector: () => null },
  location: { href: "" },
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(DETECT, "utf8"), sandbox, { filename: DETECT });

/** A document that answers only for the markers the real page carries. */
const docWith = (markers) => ({
  querySelector: (sel) =>
    markers.some((m) => String(sel).includes(m)) ? {} : null,
});

const cases = [
  // [url, markers present on the page, the name the student must be told]
  [
    "https://tenant.jobs.personio.com/job/1?apply",
    ["#field-first_name"],
    "personio",
    "Personio hosted apply page",
  ],
  [
    "https://exampletv.pinpointhq.com/en/postings/a/applications/new",
    ["#application_form_application_first_name"],
    "pinpoint",
    "Pinpoint hosted posting",
  ],
  [
    "https://jobs.lever.co/acme/xyz/apply",
    [".postings-btn"],
    "lever",
    "a real Lever page still detects as Lever",
  ],
  [
    "https://apply.workable.com/acme/j/ABC/apply/",
    ['[data-ui="apply-button"]'],
    "workable",
    "Workable still detects by its own conventions",
  ],
  [
    // THE BUG: employer-hosted page, no URL signature, and the only marker is
    // the generic form class that used to be enough to claim Lever.
    "https://careers.example.com/job/9",
    [".application-form"],
    "unknown",
    "a bare .application-form is not evidence of any particular system",
  ],
  [
    // Greenhouse adverts are also served from a
    // REGIONAL host (job-boards.eu.greenhouse.io). The URL signature must
    // cover the region prefix, or a real Greenhouse page reads as unknown.
    "https://job-boards.eu.greenhouse.io/examplegroup/jobs/4700000001",
    [],
    "greenhouse",
    "regional job-boards.<region>.greenhouse.io is still Greenhouse",
  ],
];

let failed = 0;
for (const [url, markers, want, why] of cases) {
  const got = sandbox.ynDetectAts(docWith(markers), url);
  if (!got || got.id !== want) {
    console.error(
      `FAIL: ${url} -> ${JSON.stringify(got && got.id)}, expected ${want} — ${why}`,
    );
    failed++;
  }
}

if (failed) process.exit(1);
console.log(
  `detect-naming PASS: ${cases.length} pages named honestly (a generic form ` +
    "class claims nothing)",
);
