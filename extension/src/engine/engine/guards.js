// content/engine.js, part 4 of 9 — the never-submit click guard, the
// payment-field refusal, and the sensitive/truth/policy three-way
// checkbox-and-radio classification. ynAdaLabelOf comes from this same
// shipped file's honeypot.js; ynGroupLegend is a content/heuristics.js
// global, referenced here as a bare name exactly as the single-file
// version did. See index.js for the file's full history.
import { ynAdaLabelOf } from "./honeypot.js";
// ─── Submit refusal (the extension NEVER submits, NEVER posts) ──────────────
// true = REFUSE. Every programmatic click the engine performs must pass here.
// Two term families, one guard:
//   * candidate-side terminals (submit / send application / apply now /
//     finish / complete application) — the original never-submit set;
//   * employer-posting terminals (post job / publish / confirm / sponsor /
//     checkout / pay) — Indeed's employer wizard ends in "Post job" /
//     "Confirm" / "Publish", none of which the candidate set matched, and
//     its sponsored path ends at a checkout. Refusing these here means the
//     posting flow inherits the same floor the fill flow has: mid-wizard
//     "Continue" / "Save and continue" stays permitted (detect-only), every
//     terminal is refused. The refusal direction is safe on candidate forms
//     too — a refused click is an unfilled field, never a submission.
export function ynSubmitGuard(el) {
  if (!el) return true;
  const type = (el.type || "").toLowerCase();
  if (type === "submit") return true;
  const name = [
    el.textContent,
    el.value,
    el.getAttribute && el.getAttribute("aria-label"),
    el.getAttribute && el.getAttribute("name"),
  ]
    .filter(Boolean)
    .join(" ");
  return /submit|send application|apply now|finish|complete application|post( a| the| this| your| my)? job|publish|sponsor|checkout|confirm|pay\b/i.test(
    name,
  );
}

// ─── Payment refusal (fields that are NEVER filled, any flow) ───────────────
// The employer posting flow ends in a sponsored-budget/billing step; nothing
// anywhere in the extension may ever write into a payment field. Two signals:
// the WHATWG autocomplete credit-card family (cc-*), and the visible identity
// of the field (label / name / id / placeholder). Enforced HARD inside
// ynExecuteIntents — even a mis-planned intent cannot reach a card field.

// any autocomplete token in the cc-* family (cc-number, cc-exp, cc-csc, …)
export const YN_PAYMENT_AC_RE = /(^|\s)cc-[a-z-]+/i;

export const YN_PAYMENT_SIGNAL_RE =
  /card\s*number|card\s*holder|credit\s*card|debit\s*card|expir(y|ation)|\bcvv\b|\bcvc\b|\bcsc\b|security\s*code|\biban\b|sort\s*code|account\s*number|routing\s*number|billing|payment\s*(method|details|card|info)/i;

/** True when the field is payment-shaped and must NEVER be written. */
export function ynIsPaymentField(el, doc) {
  if (!el) return false;
  try {
    let ac = "";
    try {
      ac = String(el.getAttribute("autocomplete") || "").toLowerCase();
    } catch {
      ac = "";
    }
    if (ac && YN_PAYMENT_AC_RE.test(ac)) return true;
    const label =
      typeof ynAdaLabelOf === "function" ? ynAdaLabelOf(el, doc) : "";
    let placeholder = "";
    try {
      placeholder = String(el.getAttribute("placeholder") || "");
    } catch {
      placeholder = "";
    }
    const signal = [el.name || "", el.id || "", placeholder, label]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return Boolean(signal && YN_PAYMENT_SIGNAL_RE.test(signal));
  } catch {
    // probe failure → treat as payment (safe direction = never write)
    return true;
  }
}

// ─── three-way guard classes — sensitive / truth / policy ────
// A single consent-flavoured regex (the old YN_TERMS_SIGNAL_RE, kept as
// history below) conflated "Are you authorised to work in the UK?" — a
// factual, fillable TRUTH question — with "I agree to the privacy policy" —
// a POLICY consent this extension never ticks — because both contain an
// "authori[sz]e"-adjacent or agreement-shaped word. A checkbox/radio's OWN
// label AND its group's sibling option text now decide which of three
// classes it belongs to:
//   sensitive — voluntary self-identification (gender, race/ethnicity,
//     disability, veteran status, sexual orientation): report only, never
//     filled, whatever the option text says. (Mirrors content/heuristics.js's
//     own YN_SENSITIVE_RE/YN_EEO_HEADING_RE, which classify from an EEO
//     SECTION ancestor; this file classifies from label/option text alone,
//     at write time, with no ancestor to lean on.)
//   truth — a legal fact only the applicant can assert (work authorisation,
//     sponsorship, citizenship, permanent residency): never guessed, filled
//     only from the student's own stored fact (right_to_work.uk_rtw,
//     right_to_work.needs_sponsorship) or left needs_you by heuristics.js.
//   policy — an acknowledgement or opt-in only the student's own click may
//     make (agree/terms/privacy/gdpr/consent/marketing/newsletter/
//     subscribe/sms): refused and flagged, exactly as before. Another
//     project's auto-tick of this class was deliberately NOT taken.
//
// lifted from https://github.com/averatec0773/offeros/blob/c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94/packages/autofill/src/guards.ts#L31-L87 (Apache-2.0), adapted
// — the sensitive/truth/policy three-way split (GuardClass/guardClassOf) is
// offeros's; the regexes are a fresh rewrite for this codebase's own
// category words (offeros's own list differs) and offeros's policy-class
// AUTO-TICK behaviour (isAutoAnswerForbidden) is deliberately NOT carried —
// this file's policy class stays refuse-and-flag only.
export const YN_GUARD_SENSITIVE_RE =
  /gender|\bsex\b|\brace\b|racial|ethnic|disab|veteran|sexual orientation|transgender|non-binary/i;
export const YN_GUARD_TRUTH_RE =
  /work\s*authori[sz]|authori[sz]ed?\s*to\s*work|eligible\s*to\s*work|right\s*to\s*work|sponsor(ship)?|citizen(ship)?|permanent\s*residen|indefinite\s*leave|visa\s*status/i;
export const YN_GUARD_POLICY_RE =
  /\bagree\b|\bterms\b|privacy|\bgdpr\b|\bconsent\b|marketing|newsletter|subscribe|\bsms\b|opt.?in|\bauthori[sz]e\b/i;

/**
 * ynGuardClassOf(label, optionTexts) → "sensitive" | "truth" | "policy" |
 * null. `optionTexts` is the visible text of every option in the same
 * group (radio siblings, or a lone checkbox's own label) — a neutral
 * "Please select one" question with options like "I require sponsorship" /
 * "I do not require sponsorship" classifies as TRUTH from the OPTIONS, not
 * the (empty-of-signal) question text. Checked in sensitive → truth →
 * policy order so a self-ID question is never reclassified by a
 * coincidental policy-ish word in its own text.
 */
export function ynGuardClassOf(label, optionTexts) {
  const hay = [label, ...(Array.isArray(optionTexts) ? optionTexts : [])]
    .filter(Boolean)
    .join(" ");
  if (!hay) return null;
  if (YN_GUARD_SENSITIVE_RE.test(hay)) return "sensitive";
  if (YN_GUARD_TRUTH_RE.test(hay)) return "truth";
  if (YN_GUARD_POLICY_RE.test(hay)) return "policy";
  return null;
}

/** The group's own question text (fieldset legend / aria-labelledby
 * container) — reuses content/heuristics.js's ynGroupLegend when it has
 * loaded (it always has by real fill time; this file loads first in the
 * click-time stack, so the reference is resolved lazily, at CALL time, the
 * same pattern this file already uses for ynQueryDeep et al), with a small
 * self-sufficient fallback so this function never hard-depends on load
 * order. */
export function ynGuardGroupLegendText(el, doc) {
  if (typeof ynGroupLegend === "function") {
    try {
      return ynGroupLegend(el, doc) || "";
    } catch {
      return "";
    }
  }
  try {
    const fs = el.closest && el.closest("fieldset");
    const legend = fs && fs.querySelector && fs.querySelector("legend");
    if (legend && legend.textContent) return legend.textContent.trim();
  } catch {
    /* ignore */
  }
  return "";
}

/** Visible option text for every member of el's checkbox/radio GROUP (name
 * group for radios; a shared fieldset/role=group for checkboxes), or just
 * el's own text when there is no group. */
export function ynGuardGroupOptionTexts(el, doc) {
  const document_ = doc || document;
  const texts = [];
  try {
    const type = (el.type || "").toLowerCase();
    let role = "";
    try {
      role = String(
        (el.getAttribute && el.getAttribute("role")) || "",
      ).toLowerCase();
    } catch {
      role = "";
    }
    const isChoice =
      type === "checkbox" ||
      type === "radio" ||
      role === "checkbox" ||
      role === "radio";
    if (!isChoice) return texts;
    let group = [el];
    const name = el.name || "";
    if (type === "radio" && name) {
      const root = el.form || document_;
      try {
        const sel = `input[type="radio"][name="${CSS.escape(name)}"]`;
        const found = root.querySelectorAll
          ? [...root.querySelectorAll(sel)]
          : [];
        if (found.length) group = found;
      } catch {
        /* ignore */
      }
    } else if (el.closest) {
      const box = el.closest('fieldset,[role="radiogroup"],[role="group"]');
      if (box && box.querySelectorAll) {
        try {
          const found = [
            ...box.querySelectorAll(
              'input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"]',
            ),
          ];
          if (found.length > 1) group = found;
        } catch {
          /* ignore */
        }
      }
    }
    for (const member of group) {
      let t = "";
      try {
        if (member.labels && member.labels.length) {
          t = (member.labels[0].textContent || "").trim();
        } else if (member.id) {
          const lab = document_.querySelector(
            `label[for="${CSS.escape(member.id)}"]`,
          );
          if (lab) t = (lab.textContent || "").trim();
        }
        if (!t) {
          const wrap = member.closest && member.closest("label");
          if (wrap) t = (wrap.textContent || "").trim();
        }
        if (!t) {
          t = String(
            (member.getAttribute && member.getAttribute("aria-label")) || "",
          ).trim();
        }
        if (!t) t = String(member.value || "").trim();
      } catch {
        t = "";
      }
      if (t) texts.push(t);
    }
  } catch {
    /* ignore */
  }
  return texts;
}

// History: the single regex the three-way classifier replaces. Kept named (not deleted) so a
// reader who remembers the old collision can find exactly what changed.
export const YN_TERMS_SIGNAL_RE_HISTORIC = /agree|terms|consent|authori[sz]e/i;

/** True when el is a checkbox/radio (native or ARIA) whose GUARD CLASS
 * (ynGuardClassOf, above) is "policy" — the only class this extension ever
 * refuses to tick. A "truth" question (work authorisation, sponsorship,
 * …) is no longer caught here — heuristics.js fills it from the student's
 * own stored fact, or leaves it needs_you; this function's only job is to
 * keep POLICY consent as the student's own click. */
export function ynIsTermsCheckbox(el, doc) {
  if (!el) return false;
  try {
    const type = (el.type || "").toLowerCase();
    let role = "";
    try {
      role = String(
        (el.getAttribute && el.getAttribute("role")) || "",
      ).toLowerCase();
    } catch {
      role = "";
    }
    const isChoice =
      type === "checkbox" ||
      type === "radio" ||
      role === "checkbox" ||
      role === "radio";
    if (!isChoice) return false;
    const label =
      typeof ynAdaLabelOf === "function" ? ynAdaLabelOf(el, doc) : "";
    let wrapText = "";
    try {
      const wrap = el.closest && el.closest("label");
      if (wrap) wrapText = String(wrap.textContent || "");
    } catch {
      wrapText = "";
    }
    const legend = ynGuardGroupLegendText(el, doc);
    const signal = [label, wrapText, legend, el.name || "", el.id || ""]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const optionTexts = ynGuardGroupOptionTexts(el, doc);
    return ynGuardClassOf(signal, optionTexts) === "policy";
  } catch {
    // probe failure → treat as policy (safe direction = never tick)
    return true;
  }
}
