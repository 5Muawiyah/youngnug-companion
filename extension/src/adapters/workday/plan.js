// content/adapters/workday.js, part 2 of 3 — ynWorkdayPlan (contact /
// address / resume / EEO-skip intents) and the repeated work-experience
// row filler it calls. See index.js for the file's full banner.

import {
  ynWdByAutomation,
  ynWdIsAccountWall,
  ynWdResumeTarget,
  ynWdEeoSkipIntents,
  ynWdKindOf,
} from "./field_helpers.js";

/**
 * Workday plan() — convention-based contact/address/resume + EEO skips.
 * Account wall → []. Missing automation-ids → nothing (heuristics fallback).
 */
export async function ynWorkdayPlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const c = (plan && plan.contact) || {};
  const addr = (plan && plan.address) || {};
  const claimed = new Set();

  // Assist mode: user creates account / signs in; we fill nothing on that step.
  if (ynWdIsAccountWall(document_)) {
    return [];
  }

  const push = (fieldKey, el, value, kind, label) => {
    if (!el || claimed.has(el) || ynAdaIsPassword(el)) return;
    if (value == null || value === "") return;
    if (typeof value === "string" && /\[CONFIRM/i.test(value)) return;
    claimed.add(el);
    intents.push({
      fieldKey,
      el,
      value,
      kind: kind || ynWdKindOf(el) || "text",
      confidence: "exact",
      source: "adapter",
      label: label || ynAdaLabelOf(el, document_) || fieldKey,
    });
  };

  // ── Contact / name (convention, re-verify on live) ───────────────────────
  if (ynAdaUsable(c.first_name)) {
    push(
      "contact.first_name",
      ynWdByAutomation(document_, "legalNameSection_firstName"),
      c.first_name,
      "text",
      "First name",
    );
  }
  if (ynAdaUsable(c.last_name)) {
    push(
      "contact.last_name",
      ynWdByAutomation(document_, "legalNameSection_lastName"),
      c.last_name,
      "text",
      "Last name",
    );
  }
  if (ynAdaUsable(c.email)) {
    push(
      "contact.email",
      ynWdByAutomation(document_, "email"),
      c.email,
      "text",
      "Email",
    );
  }
  // phone-number OR phoneNumber (convention variants, re-verify on live)
  if (ynAdaUsable(c.phone)) {
    const phoneEl =
      ynWdByAutomation(document_, "phone-number") ||
      ynWdByAutomation(document_, "phoneNumber");
    push("contact.phone", phoneEl, c.phone, "text", "Phone");
  }

  // ── Address (convention, re-verify on live) ──────────────────────────────
  if (ynAdaUsable(addr.line1)) {
    push(
      "address.line1",
      ynWdByAutomation(document_, "addressSection_addressLine1"),
      addr.line1,
      "text",
      "Address line 1",
    );
  }
  if (ynAdaUsable(addr.city)) {
    push(
      "address.city",
      ynWdByAutomation(document_, "addressSection_city"),
      addr.city,
      "text",
      "City",
    );
  }
  if (ynAdaUsable(addr.postcode)) {
    push(
      "address.postcode",
      ynWdByAutomation(document_, "addressSection_postalCode"),
      addr.postcode,
      "text",
      "Postal code",
    );
  }

  // ── Country / source comboboxes (convention, re-verify on live) ──────────
  // Workday uses promptOption / role=button dropdowns, not native <select>.
  // Tenants vary these automation-ids, so only the bare conventional ones
  // ("country", "source") are tried and nothing is claimed when they are
  // absent; heuristics may still match by label on a tenant that renames them.
  if (ynAdaUsable(addr.country)) {
    const countryEl = ynWdByAutomation(document_, "country");
    if (countryEl) {
      push("address.country", countryEl, addr.country, "combobox", "Country");
    }
  }
  // Source / "how did you hear" — only when payload has an answer AND the
  // automation-id is present. Do not invent option labels.
  const sourceAnswer =
    (plan && plan.answers && (plan.answers.source || plan.answers.how_heard)) ||
    null;
  if (ynAdaUsable(sourceAnswer)) {
    const sourceEl = ynWdByAutomation(document_, "source");
    if (sourceEl) {
      push("answers.source", sourceEl, sourceAnswer, "combobox", "Source");
    }
  }

  // ── Resume file (convention, re-verify on live) ──────────────────────────
  if (plan && plan.cv_url) {
    const resumeEl = ynWdResumeTarget(document_);
    push("cv_file", resumeEl, { file: "cv" }, "file", "Resume");
  }

  // ── EEO / Voluntary Disclosures / Self Identify — never fill ─────────────
  const eeoIntents = ynWdEeoSkipIntents(document_, claimed);
  for (const intent of eeoIntents) intents.push(intent);

  // ── My Experience: repeated work-history rows ──────────────
  // Only runs when the page HAS a history section to expand; on every other
  // step ynWdFindHistorySection returns null and this is a no-op.
  if (typeof ynRepeaterExpand === "function") {
    const history = await ynWdHistoryIntents(plan, document_, claimed);
    for (const intent of history.intents) intents.push(intent);
  }

  return intents;
}

// ── Repeated work-experience rows (convention, UNVERIFIED — see header: the
// live check stopped at the account wall, one step before My Experience
// renders). Field names are the public convention's seed list
// (jobTitle/companyName/currentlyWorkHere/roleDescription/startDate-.../
// endDate-...); the row-container automation-id below
// ("Job-History-Panel-Set-Item") is a convention guess, never
// checked live, and MUST be re-verified against a live My Experience step before
// being trusted as exact — every intent below is confidence "guessed" for
// that reason, never "exact".
export const YN_WD_HISTORY_ROW_SEL = '[data-automation-id="Job-History-Panel-Set-Item"]';

/**
 * Expand the My Experience table to plan.work.length rows (bounded by the
 * page's own stated cap, never guessed past it) and assign each row to its
 * profile entry by DOM order — row 0 is work[0], row 1 is work[1], never
 * "the most recent job" repeated. A row beyond the profile's own entries
 * (the page already had more blank rows than the student has jobs) is left
 * unclaimed here, which the engine reports needs_you same as any other
 * unresolved field.
 */
export async function ynWdHistoryIntents(plan, doc, claimed) {
  const document_ = doc || document;
  const work = (plan && Array.isArray(plan.work) && plan.work) || [];
  const intents = [];
  if (!work.length) return { intents, report: null };

  const section =
    ynAdaFind(document_, '[data-automation-id="Work-experience-section"]') ||
    ynAdaFind(document_, '[data-automation-id*="workExperience" i]') ||
    null;
  if (!section) return { intents, report: null };

  const result = await ynRepeaterExpand({
    root: section,
    doc: document_,
    rowSelector: YN_WD_HISTORY_ROW_SEL,
    needed: work.length,
  });

  const push = (fieldKey, el, value, kind, label) => {
    if (!el || claimed.has(el) || ynAdaIsPassword(el)) return;
    if (value == null || value === "") return;
    claimed.add(el);
    intents.push({
      fieldKey,
      el,
      value,
      kind: kind || "text",
      confidence: "guessed",
      source: "adapter",
      label: label || fieldKey,
    });
  };

  result.rows.forEach((rowEl, index) => {
    const entry = work[index];
    if (!entry) return; // a pre-existing row with no matching profile entry
    push(
      `work.${index}.employer`,
      ynWdByAutomation(rowEl, "companyName"),
      entry.employer,
      "text",
      "Employer",
    );
    push(
      `work.${index}.title`,
      ynWdByAutomation(rowEl, "jobTitle"),
      entry.title,
      "text",
      "Job title",
    );
    push(
      `work.${index}.description`,
      ynWdByAutomation(rowEl, "roleDescription"),
      entry.description,
      "textarea",
      "Role description",
    );
    if (entry.current) {
      const cur = ynWdByAutomation(rowEl, "currentlyWorkHere");
      if (cur && !claimed.has(cur) && (cur.type || "").toLowerCase() === "checkbox") {
        claimed.add(cur);
        intents.push({
          fieldKey: `work.${index}.current`,
          el: cur,
          value: true,
          kind: "checkbox",
          confidence: "guessed",
          source: "adapter",
          label: "Currently work here",
        });
      }
    }
  });

  return {
    intents,
    report: {
      rows: result.rows.length,
      clicked: result.clicked,
      couldNotAdd: result.couldNotAdd,
      capped: result.capped,
    },
  };
}
