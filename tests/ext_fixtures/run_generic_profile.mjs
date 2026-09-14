/**
 * Node tests for ynProfileFillShape — the worker's pure mapping from the
 * user's raw GET /api/profile sections into the fill-plan shape the fillers
 * already speak.
 *
 * There is no new backend route for the generic any-page fill: the fill-plan
 * endpoint is gated on an Approved job by design (that gate IS the product's
 * one human gate) and on an arbitrary web form there is no job to approve.
 * So the worker reads the profile the student already owns and reshapes it
 * here, in a pure function that can be checked without a browser.
 *
 * The rules below are the SERVER's rules, mirrored on purpose (the server's fill
 * plan): a [CONFIRM…] placeholder is never handed to a
 * form filler, right-to-work is stored-only and never derived, and nothing
 * absent is invented.
 *
 * Run: node tests/ext_fixtures/run_generic_profile.mjs   (exit 0 = all pass)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BG_PATH = path.join(ROOT, "extension", "background.js");
const API_PATH = path.join(ROOT, "extension", "common", "api.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadBackground() {
  const sandbox = {
    chrome: {
      storage: {
        local: {
          async get(keys) {
            if (typeof keys === "object" && keys !== null) return { ...keys };
            return {};
          },
          async set() {},
          async remove() {},
        },
      },
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener() {} },
      },
      action: { setBadgeText() {} },
    },
    console: { log() {}, warn() {}, error() {} },
    fetch: async () => {
      throw new Error("network blocked in unit test");
    },
    URL,
    Date,
    String,
    Number,
    Boolean,
    Object,
    JSON,
    Promise,
    Array,
    Math,
    Error,
    RegExp,
    parseFloat,
    parseInt,
    isNaN,
    Infinity,
    undefined,
    setTimeout,
    clearTimeout,
    importScripts() {
      vm.runInContext(readFileSync(API_PATH, "utf-8"), ctx, {
        filename: "api.js",
      });
    },
    FileReader: class {},
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(readFileSync(BG_PATH, "utf-8"), ctx, {
    filename: "background.js",
  });
  return ctx;
}

const ctx = loadBackground();
const shape = (sections) =>
  vm.runInContext("ynProfileFillShape", ctx)(sections);

const fails = [];

// A whole student profile in the raw section shape the API returns.
const SECTIONS = {
  contact: {
    first_name: "Sam",
    last_name: "Example",
    email: "student@example.com",
    phone: "07700 900123",
    address_line1: "1 Example Street",
    city: "London",
    postcode: "SW1A 1AA",
    linkedin: "[CONFIRM - add your LinkedIn]",
  },
  links: {
    linkedin: "https://www.linkedin.com/in/example-student",
    github: "https://github.com/example-student",
    portfolio: "",
  },
  education: [
    {
      name: "Example Sixth Form College",
      degree: "A-levels",
      field_of_study: "Maths, Economics, Computer Science",
      grade_predicted: "AAB",
      start_month: 9,
      start_year: 2024,
      end_month: 6,
      end_year: 2026,
      current: true,
    },
    { name: "", degree: "ignored — no institution" },
  ],
  experience: [
    {
      company: "Example Retail Ltd",
      role: "Weekend Sales Assistant",
      start: "2025-04",
      current: true,
      bullets: ["Served customers", "Handled stock counts"],
    },
  ],
  volunteering: [
    { company: "Example Community Trust", role: "Reading Helper", start: "2024-10" },
  ],
  eligibility: {
    uk_right_to_work: true,
    needs_sponsorship: false,
    willing_to_relocate: null,
  },
  answers: { notice_period: "None", salary_expectation: "[CONFIRM - ask]" },
};

// 1. Identity, address and links land where the fillers look for them
try {
  const p = shape(SECTIONS);
  assert(p.contact.first_name === "Sam", "first_name lost");
  assert(p.contact.email === "student@example.com", "email lost");
  assert(p.address.line1 === "1 Example Street", "address line1 lost");
  assert(p.address.city === "London", "city lost");
  assert(p.address.postcode === "SW1A 1AA", "postcode lost");
  assert(
    p.address.country === "United Kingdom",
    "country must be attached once there IS an address",
  );
  assert(
    p.links.linkedin === "https://www.linkedin.com/in/example-student",
    "the links section must win over the contact fallback",
  );
  assert(p.links.github === "https://github.com/example-student", "github lost");
  assert(!("portfolio" in p.links), "an empty link must be absent, not blank");
} catch (e) {
  fails.push("identity: " + e.message);
}

// 2. A [CONFIRM…] placeholder is NEVER handed to a form filler
try {
  const p = shape(SECTIONS);
  const flat = JSON.stringify(p);
  assert(
    !/\[CONFIRM/i.test(flat),
    "a [CONFIRM…] placeholder reached the fill shape: " +
      flat.slice(0, 300),
  );
  assert(
    p.answers.salary_expectation === null,
    "a [CONFIRM…] answer must become null, not the placeholder string",
  );
  assert(
    (p.unconfirmed_answers || []).includes("salary_expectation"),
    "a nulled answer must be listed as unconfirmed",
  );
} catch (e) {
  fails.push("confirm-placeholders: " + e.message);
}

// 3. Education and work history, in the filler's field names
try {
  const p = shape(SECTIONS);
  assert(p.education.length === 1, "the nameless education row must be dropped");
  assert(
    p.education[0].institution === "Example Sixth Form College",
    "institution lost",
  );
  assert(p.education[0].qualification === "A-levels", "qualification lost");
  assert(p.education[0].grade === "AAB", "predicted grade must be used when achieved is absent");
  assert(p.work.length === 2, "experience AND volunteering both feed work history");
  assert(p.work[0].employer === "Example Retail Ltd", "employer lost");
  assert(p.work[0].title === "Weekend Sales Assistant", "job title lost");
  assert(
    p.work[0].description === "Served customers; Handled stock counts",
    "bullets must join into one description: " + p.work[0].description,
  );
} catch (e) {
  fails.push("education-work: " + e.message);
}

// 4. Right to work is STORED-ONLY — never derived, never defaulted
try {
  const p = shape(SECTIONS);
  assert(p.right_to_work.uk_rtw === true, "stored RTW lost");
  assert(p.right_to_work.needs_sponsorship === false, "stored sponsorship lost");
  const empty = shape({});
  assert(
    empty.right_to_work.uk_rtw === null,
    "an ABSENT right to work must stay null — never guessed either way",
  );
  assert(
    empty.right_to_work.needs_sponsorship === null,
    "an ABSENT sponsorship answer must stay null",
  );
  assert(
    (empty.unconfirmed_answers || []).includes("uk_rtw"),
    "an absent RTW must be listed as unconfirmed",
  );
} catch (e) {
  fails.push("right-to-work: " + e.message);
}

// 5. No application context — so no CV, no letter, and no auto_submit key
try {
  const p = shape(SECTIONS);
  assert(!p.cv_url, "there is no application here, so there is no CV url");
  assert(!p.letter_url, "there is no application here, so there is no letter");
  assert(!("auto_submit" in p), "auto_submit must not exist, ever");
  assert(p.generic === true, "the shape must declare itself generic");
} catch (e) {
  fails.push("no-application-context: " + e.message);
}

// 6. Garbage in, empty out — never a throw, never an invention
try {
  for (const junk of [null, undefined, "", 7, [], { contact: "not an object" }]) {
    const p = shape(junk);
    assert(p && typeof p === "object", "shape() must always return an object");
    assert(Array.isArray(p.education), "education must always be an array");
    assert(Array.isArray(p.work), "work must always be an array");
    assert(
      !JSON.stringify(p.contact || {}).includes("not an object"),
      "a malformed section must not leak through",
    );
  }
} catch (e) {
  fails.push("degrades-cleanly: " + e.message);
}

if (fails.length) {
  for (const f of fails) console.error("FAIL: " + f);
  process.exit(1);
}
console.log(
  "generic profile shape PASS: identity/address/links/education/work mapped, " +
    "[CONFIRM] placeholders never handed to a filler, right to work stored-only, " +
    "no application context invented, malformed input degrades",
);
