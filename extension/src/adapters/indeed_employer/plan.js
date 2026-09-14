// content/adapters/indeed_employer.js, part 2 of 3 — ynIndeedEmployerPlan,
// the adapter's one plan() entry point. See index.js for the file's full
// banner.
//
// ynIsTermsCheckbox and ynIsPaymentField are NOT declared in this bundle —
// they are content/heuristics.js globals, referenced here exactly as the
// original file referenced them: bare names resolved at runtime, unchanged
// by this split.
import { ynIeFind, ynIeFillableFields, ynIeKindOf, ynIeSignal } from "./field_helpers.js";

/**
 * Indeed employer posting plan(): maps the posting-plan payload (title,
 * description, location, salary, application email) onto the wizard's
 * fields. EVERYTHING is confidence "guessed" — selectors are unverified
 * convention, and amber is the honest colour for "review this before you
 * press Post". Payment fields are never planned; terms checkboxes are
 * surfaced as skip:"terms"; the description's rich-text editor (a
 * contenteditable div, not a form control) is NOT driven — a plain textarea
 * fills, anything else is left for the employer and reported honestly.
 */
export function ynIndeedEmployerPlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const claimed = new Set();
  const p = plan || {};

  const push = (fieldKey, el, value, kind, label) => {
    if (!el || claimed.has(el)) return;
    if (value == null || value === "") return;
    claimed.add(el);
    intents.push({
      fieldKey,
      el,
      value,
      kind: kind || ynIeKindOf(el),
      // NEVER "exact": no selector below is live-verified (login wall).
      confidence: "guessed",
      source: "adapter",
      label: label || fieldKey,
    });
  };

  // ── Job title (convention: jobTitle / job-title; re-verify on live) ──────
  push(
    "posting.title",
    ynIeFind(
      document_,
      [
        'input[name="jobTitle"]',
        "#jobTitle",
        'input[id*="jobTitle" i]',
        'input[name*="job-title" i]',
      ],
      /job\s*title|^title$/i,
      claimed,
    ),
    p.title,
    "text",
    "Job title",
  );

  // ── Location (convention: location / jobLocation; re-verify on live) ─────
  push(
    "posting.location",
    ynIeFind(
      document_,
      [
        'input[name="location"]',
        "#jobLocation",
        'input[id*="location" i]',
        'input[name*="location" i]',
      ],
      /location|where|city|town/i,
      claimed,
    ),
    p.location,
    null,
    "Location",
  );

  // ── Description — ONLY a real textarea. Indeed's editor is usually a
  // contenteditable rich-text div, which is not a form control; the engine's
  // single writer targets native controls only, so a missing textarea means
  // the description is left for the employer (surfaced by the filler as
  // "paste it yourself", with the text ready in YoungNug). ─────────────────
  const descEl = ynIeFind(
    document_,
    [
      'textarea[name="jobDescription"]',
      "#jobDescription",
      'textarea[id*="description" i]',
      'textarea[name*="description" i]',
    ],
    null,
    claimed,
  );
  if (descEl && (descEl.tagName || "").toUpperCase() === "TEXTAREA") {
    push(
      "posting.description",
      descEl,
      p.description,
      "textarea",
      "Job description",
    );
  }

  // ── Salary range (convention: salaryMin/salaryMax; re-verify on live) ────
  if (p.salary_min != null) {
    push(
      "posting.salary_min",
      ynIeFind(
        document_,
        [
          'input[name="salaryMin"]',
          'input[id*="salaryMin" i]',
          'input[name*="minimum" i]',
        ],
        /minimum\s*(salary|pay)|salary\s*(from|min)/i,
        claimed,
      ),
      String(p.salary_min),
      "text",
      "Salary minimum",
    );
  }
  if (p.salary_max != null) {
    push(
      "posting.salary_max",
      ynIeFind(
        document_,
        [
          'input[name="salaryMax"]',
          'input[id*="salaryMax" i]',
          'input[name*="maximum" i]',
        ],
        /maximum\s*(salary|pay)|salary\s*(to|max)/i,
        claimed,
      ),
      String(p.salary_max),
      "text",
      "Salary maximum",
    );
  }

  // ── Application email (the "how you hear about applicants" step) ─────────
  push(
    "posting.application_email",
    ynIeFind(
      document_,
      [
        'input[name="applicationEmail"]',
        'input[type="email"]',
        'input[id*="email" i]',
      ],
      /email/i,
      claimed,
    ),
    p.application_email,
    "text",
    "Application email",
  );

  // ── Job type — ONLY the two honest mappings from the listing's level.
  // Everything else (grad-scheme, entry, placement…) has no faithful Indeed
  // job-type equivalent, so nothing is guessed. ────────────────────────────
  const levelMap = {
    apprenticeship: "Apprenticeship",
    internship: "Internship",
  };
  const jobType = levelMap[String(p.level || "").toLowerCase()];
  if (jobType) {
    push(
      "posting.job_type",
      ynIeFind(
        document_,
        ['select[name="jobType"]', 'select[id*="jobType" i]'],
        /job\s*type|employment\s*type/i,
        claimed,
      ),
      jobType,
      null,
      "Job type",
    );
  }

  // ── Terms/consent checkboxes — surfaced, NEVER ticked (skip:"terms";
  // the engine re-refuses via ynIsTermsCheckbox even without this) ─────────
  for (const el of ynIeFillableFields(document_)) {
    if (claimed.has(el)) continue;
    const type = (el.type || "").toLowerCase();
    if (type !== "checkbox") continue;
    if (
      typeof ynIsTermsCheckbox === "function" &&
      ynIsTermsCheckbox(el, document_)
    ) {
      claimed.add(el);
      intents.push({
        fieldKey: "terms",
        el,
        value: null,
        kind: "checkbox",
        confidence: "guessed",
        source: "adapter",
        skip: "terms",
        label: ynIeSignal(el, document_).slice(0, 80) || "Terms checkbox",
      });
    }
  }

  // ── Payment fields — surfaced as skip:"payment" so the report names them;
  // the engine's ynIsPaymentField hard-refuses any write regardless ────────
  for (const el of ynIeFillableFields(document_)) {
    if (claimed.has(el)) continue;
    if (
      typeof ynIsPaymentField === "function" &&
      ynIsPaymentField(el, document_)
    ) {
      claimed.add(el);
      intents.push({
        fieldKey: "payment",
        el,
        value: null,
        kind: ynIeKindOf(el),
        confidence: "guessed",
        source: "adapter",
        skip: "payment",
        label: ynIeSignal(el, document_).slice(0, 80) || "Payment field",
      });
    }
  }

  return intents;
}
