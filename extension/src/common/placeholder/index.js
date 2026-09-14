// common/placeholder.js — telling "nobody has answered this" apart from
// "somebody has". Pure string logic, no DOM: engine.js's never-overwrite
// check feeds it the control's current displayed text (or, for a phone
// field, the raw value) and gets back whether that text is the widget's
// own default rather than a real answer.
//
// lifted from https://github.com/averatec0773/offeros/blob/c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94/packages/autofill/src/placeholder.ts#L1-L178 (Apache-2.0), adapted
// Changes made: ported TypeScript to plain JS with yn-prefixed names; folded
// isPlaceholderValue's classifiedType switch and the select-structural-
// evidence check into one entry point, ynIsPlaceholderValue(kind, value,
// options), to match how engine.js already carries a field "kind" string
// rather than the original's separate PageValueInput shape; dropped
// pageValueState/valuesAgree (engine.js's own equality check already covers
// "does the page hold what we were about to write").

/**
 * Words a form shows when nothing has been chosen. Matched against the
 * WHOLE value, never a substring: "None of the above" is a real answer to a
 * real question, and "Unknown" as one option among several is a real choice
 * a person can make. Kept short and literal on purpose — a phrase here
 * overrides a real answer that happens to look like it.
 */
const YN_PLACEHOLDER_PHRASES = [
  "",
  "-",
  "--",
  "---",
  "none",
  "-none-",
  "no selection",
  "not selected",
  "unknown",
  "n/a",
  "na",
  "select",
  "select one",
  "select an option",
  "select option",
  "select...",
  "please select",
  "please select one",
  "choose",
  "choose one",
  "choose an option",
  "make a selection",
  "pick one",
  "-- select --",
  "select a value",
  "nothing selected",
];

/** Ellipsis characters and decorative dashes collapse to nothing meaningful. */
function ynNormalizePlaceholder(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[…]/g, "...")
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-\s*]+|[-\s*:]+$/g, (m) =>
      m.includes("-") && m.trim().length > 0 ? m : "",
    )
    .trim();
}

/** True when this text is a form's way of saying "nothing chosen yet". */
function ynIsPlaceholderText(value) {
  const v = ynNormalizePlaceholder(value);
  if (v === "") return true;
  if (YN_PLACEHOLDER_PHRASES.includes(v)) return true;
  // "Select…" / "Select a country" — the imperative form is an instruction,
  // not an answer. What follows the verb has to be generic for this to
  // fire: "Select Board Member" is a job somebody holds, and swallowing it
  // to keep the placeholder list tidy would erase a real answer.
  const imperative = /^(?:please\s+)?(?:select|choose)\b(.*)$/.exec(v);
  if (imperative) {
    const rest = (imperative[1] || "").replace(/\.{3}$/, "").trim();
    if (rest === "") return true;
    if (/^(one|an?\s+\w+|your\s+\w+|from\s+(the\s+)?\w+)$/.test(rest)) {
      return true;
    }
  }
  // A row of dashes or dots, whatever its length.
  if (/^[-.·]+$/.test(v)) return true;
  return false;
}

/**
 * A phone field showing only the country it defaulted to. A real number is a
 * run of digits; a dial code is one to four of them at the front — so
 * stripping a leading 1-4 digit code and finding nothing left (or fewer than
 * four digits left) means nobody has typed a number yet.
 */
function ynIsPlaceholderPhone(value) {
  const digits = String(value == null ? "" : value).replace(/\D/g, "");
  if (digits === "") return true;
  const withoutDialCode = /^\+?\d{1,4}$/.test(digits) ? "" : digits;
  return withoutDialCode.length < 4;
}

/**
 * Is the value this control shows a placeholder rather than an answer?
 *
 * @param {string} kind - "phone"|"tel"|"mobile" for the dial-code rule,
 *   "select" to also weigh structural evidence (options.selectedIndex /
 *   options.optionDisabled), anything else falls through to the text rule.
 * @param {string} value - the control's own displayed text (a select's
 *   SELECTED OPTION TEXT, not its value attribute — "Please select" can sit
 *   behind value="0").
 * @param {{selectedIndex?: number, optionDisabled?: boolean}} [options]
 */
function ynIsPlaceholderValue(kind, value, options) {
  const opts = options || {};
  const k = String(kind || "text").toLowerCase();
  if (k === "phone" || k === "tel" || k === "mobile") {
    return ynIsPlaceholderPhone(value);
  }
  if (k === "select") {
    // Structural evidence from the DOM beats a wordlist in EITHER direction:
    // a select resting on its first option, disabled or valueless, has not
    // been answered even if that option's TEXT is not on the phrase list.
    if (
      opts.selectedIndex === 0 &&
      (opts.optionDisabled === true || String(value || "").trim() === "")
    ) {
      return true;
    }
    return ynIsPlaceholderText(value);
  }
  return ynIsPlaceholderText(value);
}

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.YN_PLACEHOLDER_PHRASES = YN_PLACEHOLDER_PHRASES;
globalThis.ynNormalizePlaceholder = ynNormalizePlaceholder;
globalThis.ynIsPlaceholderText = ynIsPlaceholderText;
globalThis.ynIsPlaceholderPhone = ynIsPlaceholderPhone;
globalThis.ynIsPlaceholderValue = ynIsPlaceholderValue;
