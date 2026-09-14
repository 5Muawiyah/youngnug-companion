// content/heuristics.js, part 4 of 8 - pattern-hit matching and
// refinement, the split Day/Month/Year date-group finder, the
// factual/boolean profile-key classifiers, and the radio-group
// option resolvers (boolean Yes/No, and free-text option match).
// See index.js for the file's full header and history.
import { YN_LABEL_PATTERNS, YN_EARLIEST_START_EXCLUDE_RE, YN_PHONE_ADJUNCT_RE, YN_SKILL_EXPERIENCE_RE } from "./patterns.js";
import { ynSanitizeIdentity, ynFieldIdentityRaw, ynFieldIdentitySignal } from "./labels_b.js";

export function ynMatchLabelPatterns(signal) {
  if (!signal) return null;
  for (const [re, key, kind] of YN_LABEL_PATTERNS) {
    if (re.test(signal)) return { key, kind };
  }
  return null;
}

/**
 * Apply post-match exclusions / free-text reroutes for the patterns above.
 * Returns null to reject the hit; may rewrite years→generated:experience_with.
 */
export function ynRefinePatternHit(hit, signal) {
  if (!hit) return null;
  if (hit.key === "answers.earliest_start") {
    if (YN_EARLIEST_START_EXCLUDE_RE.test(signal)) return null;
  }
  if (hit.key === "contact.phone") {
    // Refusing here leaves the adjunct unclaimed so the real number field can
    // still take the key — filling a dialling-code control with a full number
    // would be wrong anyway.
    if (YN_PHONE_ADJUNCT_RE.test(signal)) return null;
  }
  if (hit.key === "derived.years_of_experience") {
    if (YN_SKILL_EXPERIENCE_RE.test(signal)) {
      return {
        key: "generated:experience_with",
        kind: "generated_text",
      };
    }
  }
  return hit;
}

/** Match on primary label signal first; identity haystack is additive only. */
export function ynMatchFieldIdentity(el, doc, primarySignal) {
  let hit = ynRefinePatternHit(
    ynMatchLabelPatterns(primarySignal),
    primarySignal,
  );
  if (hit) return hit;
  const identity = ynFieldIdentitySignal(el, doc);
  if (identity && identity !== (primarySignal || "").toLowerCase()) {
    hit = ynRefinePatternHit(ynMatchLabelPatterns(identity), identity);
    if (hit) return hit;
  }
  // Sanitized last-resort: strip non-alnum so name="driving_licence" matches
  const san = ynSanitizeIdentity(ynFieldIdentityRaw(el, doc));
  if (!san) return null;
  // Hand-check high-value tokens that survive sanitisation (deterministic only).
  if (/drivinglicen[cs]e/.test(san)) {
    return {
      key: "eligibility_extra.uk_driving_licence",
      kind: "checkbox",
    };
  }
  if (/willingtorelocate|relocat/.test(san)) {
    return {
      key: "eligibility_extra.willing_to_relocate",
      kind: "checkbox",
    };
  }
  return null;
}

// Profile keys whose value is a date (grows with the profile).
export const YN_DATE_FIELD_KEYS = new Set(["answers.earliest_start"]);

/** Which part of a split date this input is, by its own identity signal. */
export function ynDatePartRole(el, doc) {
  const sig = ynFieldIdentitySignal(el, doc);
  if (!sig) return null;
  if (/\b(day|dd)\b/.test(sig)) return "day";
  if (/\b(month|mm)\b/.test(sig)) return "month";
  if (/\b(year|yyyy|yy)\b/.test(sig)) return "year";
  return null;
}

/**
 * Find a COMPLETE Day/Month/Year text-input group around el
 * (bounded ancestor walk). Returns {day, month, year} or null. Deliberate
 * no-claim (null) when any date-part is not a plain text-like input (a
 * month <select> needs option driving, not a raw write) or a role repeats.
 */
export function ynDateGroup(el, doc) {
  const document_ = doc || document;
  let cur = el.parentElement;
  for (let hop = 0; hop < 3 && cur; hop++) {
    try {
      const sel = cur.querySelector ? cur.querySelector("select") : null;
      if (sel && ynDatePartRole(sel, document_)) return null;
      const inputs = cur.querySelectorAll
        ? [...cur.querySelectorAll("input")]
        : [];
      if (inputs.length >= 3 && inputs.length <= 6) {
        const roles = {};
        for (const inp of inputs) {
          const role = ynDatePartRole(inp, document_);
          if (!role) continue;
          const t = (inp.type || "text").toLowerCase();
          if (!["text", "number", "tel"].includes(t)) return null;
          if (roles[role]) return null;
          roles[role] = inp;
        }
        if (roles.day && roles.month && roles.year) return roles;
      }
    } catch {
      return null;
    }
    cur = cur.parentElement;
  }
  return null;
}

/** Keys that are QUESTIONS about the candidate: when
 * recognised but unstored they surface amber "answer this yourself". */
export function ynIsFactualQuestionKey(key) {
  return (
    typeof key === "string" &&
    (key.startsWith("right_to_work.") ||
      key.startsWith("eligibility_extra.") ||
      key.startsWith("answers.") ||
      key.startsWith("derived."))
  );
}

export function ynIsBooleanFieldKey(key) {
  return (
    key === "right_to_work.uk_rtw" ||
    key === "right_to_work.needs_sponsorship" ||
    key === "eligibility_extra.uk_driving_licence" ||
    key === "eligibility_extra.willing_to_relocate"
  );
}

/** Visible option text for a radio (label[for], parent label, or value). */
export function ynRadioOptionLabel(radio, doc) {
  if (!radio) return "";
  if (radio.labels && radio.labels.length) {
    // Prefer the short visible text; full legend text is still ok for ^yes/^no
    // when structure is <label><input/> Yes</label>.
    return (radio.labels[0].textContent || "").replace(/\s+/g, " ").trim();
  }
  if (radio.id && doc && doc.querySelector) {
    try {
      const lab = doc.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
      if (lab) return (lab.textContent || "").replace(/\s+/g, " ").trim();
    } catch {
      /* ignore */
    }
  }
  if (radio.closest) {
    const parentLab = radio.closest("label");
    if (parentLab) {
      return (parentLab.textContent || "").replace(/\s+/g, " ").trim();
    }
  }
  return String(radio.value || "").trim();
}

/**
 * Boolean radio Yes/No semantics. When a boolean fieldKey resolves
 * to a radio, pick the group member whose option label matches the boolean —
 * never the first radio by accident (Yes listed second is the canonical case).
 * @returns {{el: Element, value: boolean}|null} null = deliberate skip / no match
 */
export function ynResolveBooleanRadio(radioEl, value, doc) {
  if (!radioEl || (radioEl.type || "").toLowerCase() !== "radio") return null;
  if (value === null || value === undefined) return null;
  const want = Boolean(value);
  const document_ = doc || (typeof document !== "undefined" ? document : null);
  if (!document_) return null;

  const name = radioEl.name || "";
  let group = [radioEl];
  if (name) {
    const root = radioEl.form || document_;
    try {
      const sel = `input[type="radio"][name="${CSS.escape(name)}"]`;
      const found = root.querySelectorAll
        ? [...root.querySelectorAll(sel)]
        : [];
      if (found.length) group = found;
    } catch {
      group = [radioEl];
    }
  }

  const yesRe = /^(yes|i (am|do|have)|true)\b/i;
  const noRe = /^(no|i (do not|don't|am not)|false)\b/i;
  // Also allow trailing Yes/No after a long aria-label ("… - Yes")
  const yesTailRe = /\b(yes|true)\s*$/i;
  const noTailRe = /\b(no|false)\s*$/i;

  let match = null;
  for (const r of group) {
    const optLabel = ynRadioOptionLabel(r, document_);
    const val = String(r.value || "").trim();
    const candidates = [optLabel, val];
    let isYes = false;
    let isNo = false;
    for (const c of candidates) {
      const t = String(c || "").trim();
      if (!t) continue;
      if (yesRe.test(t) || yesTailRe.test(t)) isYes = true;
      if (noRe.test(t) || noTailRe.test(t)) isNo = true;
    }
    if (want && isYes && !isNo) {
      match = r;
      break;
    }
    if (!want && isNo && !isYes) {
      match = r;
      break;
    }
  }
  if (!match) return null;
  return { el: match, value: want };
}

/**
 * Non-boolean answer landing on a radio GROUP ("Notice period"
 * → "1 month"): pick the option whose visible label uniquely matches the
 * stored answer. Tiers: exact → unique startsWith → unique includes;
 * ambiguous or no match = null (a deliberate skip — never the first radio,
 * never a coin-flip). Option-membership by construction: only real group
 * members with visible labels are candidates.
 */
export function ynResolveOptionRadio(radioEl, value, doc) {
  if (!radioEl || (radioEl.type || "").toLowerCase() !== "radio") return null;
  const want = String(value || "")
    .trim()
    .toLowerCase();
  if (!want) return null;
  const document_ = doc || (typeof document !== "undefined" ? document : null);
  if (!document_) return null;

  const name = radioEl.name || "";
  let group = [radioEl];
  try {
    if (name) {
      const root = radioEl.form || document_;
      const found = root.querySelectorAll
        ? [
            ...root.querySelectorAll(
              `input[type="radio"][name="${CSS.escape(name)}"]`,
            ),
          ]
        : [];
      if (found.length) group = found;
    } else if (radioEl.closest) {
      const box = radioEl.closest('fieldset,[role="radiogroup"]');
      if (box && box.querySelectorAll) {
        const found = [...box.querySelectorAll('input[type="radio"]')];
        if (found.length) group = found;
      }
    }
  } catch {
    group = [radioEl];
  }

  const labelled = group
    .map((r) => ({
      el: r,
      label: ynRadioOptionLabel(r, document_).trim().toLowerCase(),
    }))
    .filter((o) => o.label);
  const uniq = (arr) => (arr.length === 1 ? arr[0] : null);
  const hit =
    uniq(labelled.filter((o) => o.label === want)) ||
    uniq(labelled.filter((o) => o.label.startsWith(want))) ||
    uniq(labelled.filter((o) => o.label.includes(want)));
  return hit ? { el: hit.el } : null;
}

/** Claim every radio in the same name-group so the other option is not remapped. */
export function ynClaimRadioGroup(radioEl, claimed, doc) {
  if (!radioEl || !claimed) return;
  claimed.add(radioEl);
  const name = radioEl.name || "";
  if (!name) return;
  const document_ = doc || document;
  const root = radioEl.form || document_;
  try {
    const sel = `input[type="radio"][name="${CSS.escape(name)}"]`;
    const found = root.querySelectorAll ? root.querySelectorAll(sel) : [];
    for (const r of found) claimed.add(r);
  } catch {
    /* ignore */
  }
}
