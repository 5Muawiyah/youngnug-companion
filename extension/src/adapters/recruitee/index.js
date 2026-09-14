// content/adapters/recruitee.js — deterministic Recruitee fill intents.
// Selectors verified live across 4 tenants.
// Single-page form on /o/<slug>; native file input for CV. Full name is ONE
// field (name="candidate.name") — Lever-shaped. plan() returns FillIntents only.
// Invisible platform captcha (#input-captchaToken-undefined) = PASSIVE: fill
// proceeds; filler's ynPassiveCaptchaPresent flags "solve when you submit".
// NEVER trigger/solve/token-stuff captcha. Never consent checkbox, never password,
// never submit. Custom openQuestionAnswers → heuristics.

/**
 * Build a single full-name string (Recruitee has no first/last split).
 */
function ynRcFullName(plan) {
  const c = (plan && plan.contact) || {};
  const joined = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return joined || c.full_name || c.name || "";
}

/**
 * Recruitee plan() — claims research-verified name= fields only.
 * Cover-letter file / photo are per-posting: claim only when the verified
 * name is present on THIS form. Consent agreements[] never auto-checked.
 */
function ynRecruiteePlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const c = (plan && plan.contact) || {};
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

  // Full name — single field (verified all 4; Lever pattern).
  const fullName = ynRcFullName(plan);
  if (ynAdaUsable(fullName)) {
    push(
      "contact.full_name",
      ynAdaFind(
        document_,
        'input[name="candidate.name"], #input-candidate\\.name-undefined',
      ),
      fullName,
      "text",
      "Full name",
    );
  }

  if (ynAdaUsable(c.email)) {
    push(
      "contact.email",
      ynAdaFind(
        document_,
        'input[name="candidate.email"], #input-candidate\\.email-undefined',
      ),
      c.email,
      "text",
      "Email",
    );
  }

  if (ynAdaUsable(c.phone)) {
    push(
      "contact.phone",
      ynAdaFind(
        document_,
        'input[name="candidate.phone"], #input-candidate\\.phone-undefined',
      ),
      c.phone,
      "text",
      "Phone",
    );
  }

  // CV — native required <input type=file> (verified all 4). DataTransfer attach
  // + confirm-before-green (filename on FileList / nearby chrome).
  if (plan && plan.cv_url) {
    const cv = ynAdaFind(
      document_,
      'input[name="candidate.cv"][type="file"], ' +
        'input[name="candidate.cv"], #input-candidate\\.cv-undefined',
    );
    if (cv && (cv.type || "").toLowerCase() === "file") {
      const wrap =
        (cv.closest &&
          cv.closest(
            "form, fieldset, [class*='upload'], [class*='file'], label, div",
          )) ||
        null;
      push("cv_file", cv, { file: "cv" }, "file", "CV");
      const last = intents[intents.length - 1];
      if (last && last.fieldKey === "cv_file") {
        last.uploadMode = "input";
        last.dropTarget = wrap;
        last.confirmRoot = wrap;
        last.confirmSelector =
          "[class*='filename'], [class*='file-name'], [class*='uploaded']";
        last.confirmTimeoutMs = 3000;
      }
    }
  }

  // Cover letter as FILE upload when present (3/4 postings; not a textarea).
  if (plan && plan.letter_url) {
    const cl = ynAdaFind(
      document_,
      'input[name="candidate.coverLetterFile"][type="file"], ' +
        'input[name="candidate.coverLetterFile"], ' +
        "#input-candidate\\.coverLetterFile-undefined",
    );
    if (cl && (cl.type || "").toLowerCase() === "file") {
      const wrap =
        (cl.closest &&
          cl.closest(
            "form, fieldset, [class*='upload'], [class*='file'], label, div",
          )) ||
        null;
      push("letter_file", cl, { file: "letter" }, "file", "Cover letter");
      const last = intents[intents.length - 1];
      if (last && last.fieldKey === "letter_file") {
        last.uploadMode = "input";
        last.dropTarget = wrap;
        last.confirmRoot = wrap;
        last.confirmSelector =
          "[class*='filename'], [class*='file-name'], [class*='uploaded']";
        last.confirmTimeoutMs = 3000;
      }
    }
  }

  // candidate.photo — verified on one tenant only; no fill-plan photo key →
  // leave unclaimed (heuristics / user). Do not map CV onto photo.

  // Consent / agreements array (0–2+ per tenant) + textingConsent — NEVER check.
  const consentSel =
    'input[name^="candidate.agreements."][name$=".consent"][type="checkbox"], ' +
    'input[name="candidate.textingConsent"][type="checkbox"], ' +
    'input[name*="agreements"][name*="consent"][type="checkbox"]';
  const consentFields = ynAdaFindAll(document_, consentSel);
  const consentSeen = new Set();
  for (const el of consentFields) {
    if (!el || consentSeen.has(el) || claimed.has(el) || ynAdaIsPassword(el))
      continue;
    if ((el.type || "").toLowerCase() !== "checkbox") continue;
    consentSeen.add(el);
    claimed.add(el);
    intents.push({
      fieldKey: "consent",
      el,
      value: null,
      kind: "checkbox",
      confidence: "exact",
      source: "adapter",
      skip: "eeo",
      label: ynAdaLabelOf(el, document_) || el.name || "Consent",
    });
  }

  // Captcha: #input-captchaToken-undefined + captcha-base.recruiteecdn.com is
  // platform-wide invisible. Filler detects via ynPassiveCaptchaPresent
  // ([id*='captcha']). Adapter does NOT touch the mount, does NOT set tokens.
  //
  // CHECKED on a live page 2026-09-03, headless, no sign-in: KP Snacks' "HR Advisor
  // (Maternity FTC)" posting (kpsnacks.recruitee.com/o/hr-advisor-maternity-ftc-1) —
  // confirmed the WHOLE field shape exactly as claimed above:
  // candidate.name, candidate.email, candidate.phone,
  // candidate.textingConsent (checkbox, never ticked), candidate.cv,
  // candidate.coverLetterFile, and candidate.openQuestionAnswers.<id>.content
  // / .flag for the per-posting custom questions (33+ on this posting).
  // Submit-time challenge behaviour is STILL UNVERIFIED, by design: proving
  // it one way or the other means submitting the application, which this
  // extension never does. That gap cannot be closed without
  // breaking the never-submit guarantee.

  return intents;
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "recruitee",
  plan: ynRecruiteePlan,
  // React SSR hydration can replace/clear the inputs after the initial write —
  // the filler watches the full re-assert window (no early break).
  hydrationWatch: true,
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynRcFullName = ynRcFullName;
globalThis.ynRecruiteePlan = ynRecruiteePlan;
