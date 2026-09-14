// common/label_quality.js — reject text that
// LOOKS like a label but is not one, before any ynLabelText rung is
// trusted as a human question. Every rung today (labels[], aria-label,
// aria-labelledby, placeholder, name, id, autocomplete) accepts whatever
// string it finds; a bare identifier ("firstNameInput"), a widget's own
// transient state ("Loading…") or a content-managed generic ("value") can
// all reach the report as if a person had written them. This module is a
// pure, additive FILTER only — it never invents a label, it only says
// whether one candidate is fit to show a human or feed the matcher's
// "no structured signal at all" fallback.
//
// lifted from https://github.com/averatec0773/offeros/blob/c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94/packages/autofill/src/label-quality.ts#L1-L169 (Apache-2.0), adapted
// — the four-check shape (empty/oversized -> transient -> generic ->
// identifier-shaped, reject-costs-one-more-rung) and the illustrative
// examples in the comments are offeros's isUsableLabel/isTransientText/
// isGenericName/looksLikeIdentifier; every regex is a fresh JS rewrite (this
// module uses inline regexes throughout, not offeros's normalised-list-plus-
// stripDecoration approach) and offeros's looksLikeHumanLabel and CAPTCHA
// check are not carried here (the latter is a separate, narrower rewrite in
// common/challenge_detect.js).

// A label longer than this is prose, not a question a form is asking —
// oversized text is rejected the same way a widget-state phrase is.
const YN_LABEL_MAX_LEN = 140;

// Whole-string widget-state phrases a page shows WHILE it is busy. Anchored
// start-to-end (with up to 3 trailing dots, ASCII or the single ellipsis
// character) so a REAL sentence that merely contains one of these words —
// "Are you loading experience onto your CV?" — is never caught; only the
// widget's own short state text is.
const YN_LABEL_TRANSIENT_RE =
  /^(loading|please wait|processing|submitting|saving|searching|refreshing|no results?( found)?|no (matches|options)( found)?|please hold on|select( (one|an option))?|choose( one)?|search)[.…]{0,3}$/i;

// Bare generic tokens a real label is never actually made of on their own —
// including the same word with a bare index suffix a repeated block often
// adds ("input_1", "field-2"), which is still the control's ROLE, not a
// question.
const YN_LABEL_GENERIC_RE =
  /^(value|field|input|name|label|text|option|item|untitled)([_-]?\d+)?s?$/i;

/**
 * True when the WHOLE string is shaped like a machine identifier rather
 * than a human question: bare digits, a dash/underscore-joined token that
 * carries a long digit run (Salesforce-style `rec-form_682152000000063542`,
 * `field_1234567`), a cryptic short alnum id (`q_8f3a2c`), or a lone
 * camelCase word with no spaces at all (`firstNameInput`). Every rule
 * anchors the FULL string — a real label containing a slash, an ampersand
 * or a parenthetical ("Town/City", "Notice period (in weeks)") never has
 * its whole text consumed by one of these shapes.
 */
function ynLooksLikeIdentifierText(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return true;
  if (/^[a-z][\w-]*[_-][\w-]*\d{4,}[\w-]*$/i.test(t)) return true;
  if (/^[a-z]{1,4}[_-][a-z0-9]{2,}$/i.test(t) && /\d/.test(t)) return true;
  if (/^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(t)) return true;
  return false;
}

/**
 * ynIsUsableLabel(text) → boolean. The single gate every label-producing
 * rung (ynLabelText and its extra label sources) should run a candidate through
 * before it is treated as a human-facing question. Rejecting a candidate
 * costs the caller one more ladder step, never a wrong answer.
 */
function ynIsUsableLabel(s) {
  const t = String(s == null ? "" : s)
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;
  if (t.length > YN_LABEL_MAX_LEN) return false;
  if (YN_LABEL_TRANSIENT_RE.test(t)) return false;
  if (YN_LABEL_GENERIC_RE.test(t)) return false;
  if (ynLooksLikeIdentifierText(t)) return false;
  return true;
}

/**
 * First usable candidate out of an ordered list, normalised (whitespace
 * collapsed, trimmed). Returns "" when nothing in the list passes — callers
 * show "unlabelled field" for that, never a raw id or a widget's own
 * transient text.
 */
function ynFirstUsableLabel(candidates) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  for (const c of list) {
    if (ynIsUsableLabel(c)) {
      return String(c).replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

/**
 * The gate applied to a REPORT ENTRY, not a bare candidate string: every
 * report line in this codebase used to read `e.label || e.fieldKey`, which
 * meant a field whose label came back "" (already rejected by
 * ynIsUsableLabel upstream, correctly) silently fell back to a raw DOM id —
 * `wrapper_G0KLELU4iGZU44OG`, `QA_12155494`, a bracketed array path — shown
 * to the student as if it were the question the page asked. This is the ONE
 * place that fallback happens now: `entry.label` if it is still usable
 * after a second pass (defence in depth — a caller that forgot to gate its
 * own label is still caught here), else "" so the list-builder's own
 * `.filter(Boolean)` drops the entry rather than showing the identifier.
 * Never falls back to `entry.fieldKey` — that field exists for MATCHING,
 * not for display.
 */
function ynReportFieldLabel(entry) {
  if (!entry) return "";
  return ynFirstUsableLabel(entry.label);
}

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.YN_LABEL_MAX_LEN = YN_LABEL_MAX_LEN;
globalThis.YN_LABEL_TRANSIENT_RE = YN_LABEL_TRANSIENT_RE;
globalThis.YN_LABEL_GENERIC_RE = YN_LABEL_GENERIC_RE;
globalThis.ynLooksLikeIdentifierText = ynLooksLikeIdentifierText;
globalThis.ynIsUsableLabel = ynIsUsableLabel;
globalThis.ynFirstUsableLabel = ynFirstUsableLabel;
globalThis.ynReportFieldLabel = ynReportFieldLabel;
