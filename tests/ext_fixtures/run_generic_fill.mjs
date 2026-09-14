/**
 * Generic any-page fill pin — the Companion as a GENERAL filler.
 *
 * Until now the fill path started only on a page that matched a job the
 * student had already Approved; on every other site the popup dead-ended
 * with "No YoungNug job matches this page". ynFillAnyPage is the fallback:
 * on a click, on ANY page, it fills what it can honestly fill from the
 * profile and reports the rest. Where a site has a dedicated adapter the
 * adapter still wins — this rung is what runs when there is not one.
 *
 * Three fixtures, three markup conventions, none of them a job advert:
 *   1. generic_conference_registration.html — label[for] + spec autocomplete
 *      tokens. Everything identity-shaped must land EXACT, never amber.
 *   2. generic_volunteer_application.html   — fieldset/legend +
 *      aria-labelledby, no autocomplete at all, plus the two things that are
 *      never filled sitting beside fields that are: a scoped password widget
 *      and an equal-opportunities section. Both must come back as REPORTED
 *      skips, and the volunteer fields beside them must still fill.
 *   3. generic_support_enquiry.html         — table layout, placeholders
 *      only. The nearby-text failsafe rung, amber by construction, and the
 *      two fields with no honest answer must come back UNFILLED, not guessed.
 *
 * Nothing is submitted on any of the three, and the terms checkbox is never
 * ticked. Production files are evaluated verbatim under jsdom; no network,
 * no extension runtime.
 *
 * Run: node tests/ext_fixtures/run_generic_fill.mjs   (exit 0 = all pass)
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

// The click-time stack, minus the adapters (none of these pages is an ATS)
// and minus assist.js (no account wall here). Order matches popup.js.
const STACK = [
  "common/api.js",
  "common/yn_theme.js",
  "common/challenge_detect.js",
  "common/label_quality.js",
  "common/placeholder.js",
  "common/overlay_box.js",
  "content/dom_fill_kit.js",
  "content/aria_driver.js",
  "content/skills_fill.js",
  "content/engine.js",
  "content/detect.js",
  "content/heuristics.js",
  "content/settle_observer.js",
  "content/review_screen.js",
  "content/filler.js",
];

// A whole profile, fill-plan shaped — exactly what the worker builds from
// GET /api/profile for a page that is not one of the student's jobs. No
// cv_url / letter_url: there is no application here, so a CV upload field
// must come back unresolved rather than attached to something invented.
const PROFILE = {
  generic: true,
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
  links: {
    linkedin: "https://www.linkedin.com/in/example-student",
    github: "https://github.com/example-student",
    portfolio: "https://example.com/sam",
  },
  education: [
    {
      institution: "Example Sixth Form College",
      qualification: "A-levels",
      subject: "Maths, Economics, Computer Science",
      grade: "AAB",
      start: "2024-09",
      end: "2026-06",
      current: true,
    },
  ],
  work: [
    {
      employer: "Example Retail Ltd",
      title: "Weekend Sales Assistant",
      start: "2025-04",
      end: null,
      current: true,
      description: "Served customers; handled stock counts",
    },
  ],
  right_to_work: { uk_rtw: true, needs_sponsorship: false },
  eligibility_extra: { willing_to_relocate: null, uk_driving_licence: null },
  answers: {
    notice_period: null,
    salary_expectation: null,
    earliest_start: null,
  },
  unconfirmed_answers: [
    "willing_to_relocate",
    "uk_driving_licence",
    "notice_period",
    "salary_expectation",
    "earliest_start",
  ],
  derived: { years_of_experience: 1, highest_qualification: "A-levels" },
};

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

/** Load the stack into a jsdom page and hand back its window. */
function loadPage(fixture) {
  const html = readFileSync(path.join(here, fixture), "utf8");
  const dom = new JSDOM(html, {
    url: "https://example.org/" + fixture.replace(/\.html$/, ""),
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  // jsdom does no layout: every box measures 0, which ynIsVisuallyHiddenTrap
  // reads as a bot trap and ynCountNotAttempted reads as invisible. Answer
  // from the markup instead — the fixtures declare nothing hidden.
  const rect = {
    width: 180,
    height: 28,
    top: 40,
    left: 40,
    right: 220,
    bottom: 68,
  };
  for (const proto of [
    win.HTMLInputElement,
    win.HTMLTextAreaElement,
    win.HTMLSelectElement,
  ]) {
    Object.defineProperty(proto.prototype, "offsetWidth", {
      get: () => rect.width,
    });
    Object.defineProperty(proto.prototype, "offsetHeight", {
      get: () => rect.height,
    });
    proto.prototype.getClientRects = () => [rect];
    proto.prototype.getBoundingClientRect = () => rect;
  }
  // The worker is not running: every message answers "not available", which
  // is exactly what the code must survive on an arbitrary site.
  // no real user is present in this harness — default to the
  // same outcome every fixture here already assumed before the review
  // screen existed (guessed fields still write; there are no drafts on
  // these fixtures to skip).
  win.__ynReviewScript = [];
  win.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        if (typeof cb === "function") {
          cb({ ok: false, error: "no worker in the harness" });
        }
      },
      onMessage: { addListener: () => {} },
    },
    storage: {
      local: {
        get: async (d) => ({ ...(d || {}) }),
        set: async () => {},
        remove: async () => {},
      },
    },
  };
  for (const rel of STACK) {
    const src = readFileSync(
      path.join(root, "extension", ...rel.split("/")),
      "utf8",
    );
    vm.runInContext(src, dom.getInternalVMContext(), { filename: rel });
  }
  return win;
}

const keysOf = (rows) => (rows || []).map((r) => r.fieldKey);
const val = (win, sel) => win.document.querySelector(sel).value;

// ── 1. Standards-clean registration form ────────────────────────────────
{
  console.log("generic_conference_registration.html");
  const win = loadPage("generic_conference_registration.html");
  const out = await win.ynFillAnyPage(PROFILE);
  const rep = (out && out.report) || {};
  check("returns ok", () =>
    assert(
      out && out.ok,
      "ynFillAnyPage did not return ok: " + JSON.stringify(out),
    ));
  check("first name filled", () =>
    assert(val(win, "#reg-first") === "Sam", "got " + val(win, "#reg-first")));
  check("last name filled", () =>
    assert(
      val(win, "#reg-last") === "Example",
      "got " + val(win, "#reg-last"),
    ));
  check("email filled", () =>
    assert(
      val(win, "#reg-email") === "student@example.com",
      "got " + val(win, "#reg-email"),
    ));
  check("phone filled", () =>
    assert(
      val(win, "#reg-tel") === "07700 900123",
      "got " + val(win, "#reg-tel"),
    ));
  check("street filled", () =>
    assert(
      val(win, "#reg-street") === "1 Example Street",
      "got " + val(win, "#reg-street"),
    ));
  check("town filled", () =>
    assert(val(win, "#reg-town") === "London", "got " + val(win, "#reg-town")));
  check("postcode filled", () =>
    assert(
      val(win, "#reg-postcode") === "SW1A 1AA",
      "got " + val(win, "#reg-postcode"),
    ));
  check("website filled", () =>
    assert(
      val(win, "#reg-site") === "https://example.com/sam",
      "got " + val(win, "#reg-site"),
    ));
  check("autocomplete fields are EXACT, not amber", () => {
    const amber = keysOf(rep.guessed);
    for (const k of [
      "contact.first_name",
      "contact.last_name",
      "contact.email",
      "address.line1",
      "address.postcode",
    ]) {
      assert(
        !amber.includes(k),
        k + " came back amber though the field carries a spec autocomplete token",
      );
      assert(keysOf(rep.filled).includes(k), k + " is not in report.filled");
    }
  });
  check("dietary requirements not guessed at", () =>
    assert(
      val(win, "#reg-diet") === "",
      "invented a dietary requirement: " + val(win, "#reg-diet"),
    ));
  check("'how did you hear' not guessed at", () =>
    assert(
      val(win, "#reg-hear") === "",
      "invented an answer: " + val(win, "#reg-hear"),
    ));
  check("terms checkbox never ticked", () =>
    assert(
      win.document.querySelector("#reg-terms").checked === false,
      "the extension agreed to terms on the user's behalf",
    ));
  check("nothing submitted", () =>
    assert(win.__submitted === false, "the form was sent"));
}

// ── 2. Volunteer form: password + EEO must BOTH be reported skips ───────
{
  console.log("generic_volunteer_application.html");
  const win = loadPage("generic_volunteer_application.html");
  const out = await win.ynFillAnyPage(PROFILE);
  const rep = (out && out.report) || {};
  check("returns ok", () =>
    assert(
      out && out.ok,
      "ynFillAnyPage did not return ok: " + JSON.stringify(out),
    ));
  check("password field left empty", () =>
    assert(val(win, "#acct-pass") === "", "A PASSWORD FIELD WAS FILLED"));
  check("password field is REPORTED as a skip", () => {
    const rows = rep.skipped_password || [];
    assert(
      rows.length > 0,
      "report.skipped_password is empty — the refusal is silent again",
    );
    assert(
      rows.some(
        (r) =>
          /password/i.test(r.label || "") || /password/i.test(r.fieldKey || ""),
      ),
      "no skipped_password row names the password field: " + JSON.stringify(rows),
    );
  });
  check("the account email inside the password scope is walled and reported", () => {
    assert(
      val(win, "#acct-email") === "",
      "a field inside the password's own form was filled",
    );
    assert(
      (rep.skipped_password || []).length >= 2,
      "the walled sibling field was not reported: " +
        JSON.stringify(rep.skipped_password),
    );
  });
  check("volunteer name/email/phone still fill beside the password widget", () => {
    assert(
      val(win, "[name=vol_name]") === "Sam Example",
      "name: " + val(win, "[name=vol_name]"),
    );
    assert(
      val(win, "[name=vol_mail]") === "student@example.com",
      "email: " + val(win, "[name=vol_mail]"),
    );
    assert(
      val(win, "[name=vol_phone]") === "07700 900123",
      "phone: " + val(win, "[name=vol_phone]"),
    );
  });
  check("address fills from aria-labelledby alone", () => {
    assert(
      val(win, "[name=vol_addr]") === "1 Example Street",
      "addr: " + val(win, "[name=vol_addr]"),
    );
    assert(
      val(win, "[name=vol_post]") === "SW1A 1AA",
      "postcode: " + val(win, "[name=vol_post]"),
    );
  });
  check("education and work history fill", () => {
    assert(
      val(win, "[name=vol_school]") === "Example Sixth Form College",
      "school: " + val(win, "[name=vol_school]"),
    );
    assert(
      val(win, "[name=vol_employer]") === "Example Retail Ltd",
      "employer: " + val(win, "[name=vol_employer]"),
    );
    assert(
      val(win, "[name=vol_jobtitle]") === "Weekend Sales Assistant",
      "job title: " + val(win, "[name=vol_jobtitle]"),
    );
  });
  check("linkedin fills", () =>
    assert(
      val(win, "[name=vol_linkedin]") === PROFILE.links.linkedin,
      "linkedin: " + val(win, "[name=vol_linkedin]"),
    ));
  check("every equal-opportunities field is empty", () => {
    for (const n of [
      "mon_ethnicity",
      "mon_gender",
      "mon_disability",
      "mon_orientation",
      "mon_religion",
    ]) {
      assert(
        val(win, "[name=" + n + "]") === "",
        n + " was answered: " + val(win, "[name=" + n + "]"),
      );
    }
  });
  check("the equal-opportunities section is REPORTED as skipped", () => {
    const rows = [...(rep.skipped_eeo || []), ...(rep.skipped_sensitive || [])];
    assert(
      rows.length >= 5,
      "expected 5 monitoring fields reported, got " +
        rows.length +
        ": " +
        JSON.stringify(rows),
    );
  });
  check("nothing submitted", () =>
    assert(win.__submitted === false, "the form was sent"));
}

// ── 3. Table-layout enquiry form: the nearby-text rung ──────────────────
{
  console.log("generic_support_enquiry.html");
  const win = loadPage("generic_support_enquiry.html");
  const out = await win.ynFillAnyPage(PROFILE);
  const rep = (out && out.report) || {};
  check("returns ok", () =>
    assert(
      out && out.ok,
      "ynFillAnyPage did not return ok: " + JSON.stringify(out),
    ));
  check("name from the preceding table cell", () =>
    assert(
      val(win, "[name=f1]") === "Sam Example",
      "got " + val(win, "[name=f1]"),
    ));
  check("email from the preceding table cell", () =>
    assert(
      val(win, "[name=f2]") === "student@example.com",
      "got " + val(win, "[name=f2]"),
    ));
  check("phone from the preceding table cell", () =>
    assert(
      val(win, "[name=f3]") === "07700 900123",
      "got " + val(win, "[name=f3]"),
    ));
  check("postcode from the preceding table cell", () =>
    assert(
      val(win, "[name=f4]") === "SW1A 1AA",
      "got " + val(win, "[name=f4]"),
    ));
  check("a reference number is never invented", () =>
    assert(
      val(win, "[name=f5]") === "",
      "invented a reference number: " + val(win, "[name=f5]"),
    ));
  check("the free-text enquiry is never invented", () =>
    assert(
      val(win, "[name=f6]") === "",
      "wrote an enquiry on the student's behalf: " + val(win, "[name=f6]"),
    ));
  check("the two it cannot answer are counted, not hidden", () => {
    const total =
      (rep.filled || []).length +
      (rep.guessed || []).length +
      (out.notAttempted || 0);
    assert(
      total >= 6,
      "the report's denominator hides fields: " +
        JSON.stringify({
          filled: (rep.filled || []).length,
          guessed: (rep.guessed || []).length,
          notAttempted: out.notAttempted,
        }),
    );
  });
  check("nothing submitted", () =>
    assert(win.__submitted === false, "the form was sent"));
}

if (failures) {
  console.error("\ngeneric fill FAIL: " + failures + " assertion(s)");
  process.exit(1);
}
console.log(
  "\ngeneric fill PASS: three non-job forms filled from the profile; " +
    "password and equal-opportunities fields refused AND reported; " +
    "nothing was sent",
);
