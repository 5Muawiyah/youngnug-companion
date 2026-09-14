// content/adapters/personio.js — deterministic Personio (jobs.personio.com)
// fill intents. Personio postings were previously handled by generic
// heuristics only (detect.js already names the platform via #field-first_name
// / [id^='field-'] — no dedicated adapter existed). This adds one so the
// stable field convention is claimed exactly, and so the two amber-only
// server-derived answers (available_from, salary_expectations) have a home.
//
// CONFIRMED on a live page 2026-09-03, headless, no sign-in: xpate's Personio posting
// (https://xpate.jobs.personio.com/job/2731576, "Senior Due Diligence
// Officer"), after clicking "Apply for this job": #field-first_name,
// #field-last_name, #field-email, #field-phone, #field-available_from,
// #field-salary_expectations, #doc-input-cv (name="documents.cv",
// type=file), #doc-input-other (name="documents.other", type=file). No EEO
// section was present on this posting; Personio's own docs describe custom
// per-posting questions as free-form fields with the same #field-<key>
// convention, left to heuristics as before (numeric/opaque keys per
// posting, no platform-wide selector to verify). plan() returns FillIntents
// only. Never password, never submit.

function ynPersonioPlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const c = (plan && plan.contact) || {};
  const answers = (plan && plan.answers) || {};
  const claimed = new Set();

  const push = (fieldKey, el, value, kind, label) => {
    if (!el || claimed.has(el) || ynAdaIsPassword(el)) return;
    if (value == null || value === "") return;
    if (typeof value === "string" && /\[CONFIRM/i.test(value)) return;
    claimed.add(el);
    intents.push({
      fieldKey,
      el,
      value,
      kind: kind || "text",
      confidence: "exact",
      source: "adapter",
      label: label || ynAdaLabelOf(el, document_) || fieldKey,
    });
  };

  if (ynAdaUsable(c.first_name)) {
    push(
      "contact.first_name",
      ynAdaFind(document_, "#field-first_name"),
      c.first_name,
      "text",
      "First name",
    );
  }
  if (ynAdaUsable(c.last_name)) {
    push(
      "contact.last_name",
      ynAdaFind(document_, "#field-last_name"),
      c.last_name,
      "text",
      "Last name",
    );
  }
  if (ynAdaUsable(c.email)) {
    push(
      "contact.email",
      ynAdaFind(document_, "#field-email"),
      c.email,
      "text",
      "Email",
    );
  }
  if (ynAdaUsable(c.phone)) {
    push(
      "contact.phone",
      ynAdaFind(document_, "#field-phone"),
      c.phone,
      "text",
      "Phone",
    );
  }

  // Amber: server-derived/stored answers only, never guessed — same rule as
  // every other adapter's optional fields.
  if (ynAdaUsable(answers.earliest_start)) {
    push(
      "answers.earliest_start",
      ynAdaFind(document_, "#field-available_from"),
      answers.earliest_start,
      "text",
      "Available from",
    );
  }
  if (ynAdaUsable(answers.salary_expectation)) {
    push(
      "answers.salary_expectation",
      ynAdaFind(document_, "#field-salary_expectations"),
      answers.salary_expectation,
      "text",
      "Salary expectations",
    );
  }

  if (plan && plan.cv_url) {
    const cv = ynAdaFind(document_, "#doc-input-cv");
    if (cv) {
      push("cv_file", cv, { file: "cv" }, "file", "CV");
      const last = intents[intents.length - 1];
      if (last && last.fieldKey === "cv_file") {
        last.uploadMode = "input";
        const wrap = cv.closest && cv.closest("div");
        last.dropTarget = wrap || null;
        last.confirmRoot = wrap || null;
        last.confirmSelector = "[class*='filename'], [class*='file-name']";
        last.confirmTimeoutMs = 3000;
      }
    }
  }
  if (plan && plan.letter_url) {
    const other = ynAdaFind(document_, "#doc-input-other");
    if (other) {
      push("letter_file", other, { file: "letter" }, "file", "Other document");
      const last = intents[intents.length - 1];
      if (last && last.fieldKey === "letter_file") {
        last.uploadMode = "input";
        const wrap = other.closest && other.closest("div");
        last.dropTarget = wrap || null;
        last.confirmRoot = wrap || null;
        last.confirmSelector = "[class*='filename'], [class*='file-name']";
        last.confirmTimeoutMs = 3000;
      }
    }
  }

  // Custom per-posting screening questions render as more #field-<key>
  // controls with opaque, per-tenant keys (not verified live as a stable
  // set) — left to heuristics/label matching, as the platform-wide fields
  // above are the only ones this walk could confirm hold across postings.

  return intents;
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "personio",
  plan: ynPersonioPlan,
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynPersonioPlan = ynPersonioPlan;
