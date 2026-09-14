// content/repeater.js — bounded "Add another" row expansion for repeated
// profile sections (work experience, education) rendered as an empty table
// with an Add control: the row does not exist until a click creates it, so a
// plain field scan finds the button and nothing else, and the application
// goes in with the history missing entirely.
//
// This file only ever clicks the section's OWN Add control and counts what
// grew. It never guesses a row into existence and never assigns a profile
// entry to a row — that mapping is the caller's (an adapter's) job, scoped to
// the ATS's own field names, because repeater.js has no ATS-specific
// knowledge. Every click passes ynSubmitGuard first (frozen guarantee): a
// control whose wording is submit-shaped, however "add"-like the rest of its
// name reads (a decoy "Add and submit"), is never a candidate.


// lifted from https://github.com/averatec0773/offeros/blob/c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94/apps/extension/src/lib/autofill/repeater.ts#L28-L39 (Apache-2.0), adapted
const YN_REPEATER_ADD_PATTERNS = [
  /\badd\b.*\b(entry|entries|row|another|more|item|record)\b/i,
  /\b(add|new)\s+(another|more)\b/i,
  // `add` as a whole word, not the start of "Add-ons" — a hyphen counts as a
  // word boundary, so `\badd\b` alone matches far too much.
  /^\s*\+?\s*add(?:\s|$)/i,
  /(?:^|\s)add\s*\+?\s*$/i,
];

const YN_REPEATER_ROW_WORDS =
  /\b(entry|entries|row|rows|another|more|item|record|history|education|experience|employment|reference)\b/i;

// lifted from https://github.com/averatec0773/offeros/blob/c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94/apps/extension/src/lib/autofill/repeater.ts#L41-L42 (Apache-2.0), adapted
const YN_REPEATER_COUNT_PATTERN = /(\d+)\s+of\s+(\d+)\s+entr/i;

/** The accessible name of a control: what a screen reader would announce. */
function ynRepeaterAccessibleName(el) {
  if (!el) return "";
  const aria = el.getAttribute && el.getAttribute("aria-label");
  if (aria && aria.trim() !== "") return aria.trim();
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (text !== "") return text;
  const title = el.getAttribute && el.getAttribute("title");
  return (title || "").trim();
}

// lifted from https://github.com/averatec0773/offeros/blob/c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94/apps/extension/src/lib/autofill/repeater.ts#L68-L76 (Apache-2.0), adapted
function ynRepeaterLooksLikeAddControl(el) {
  const name = ynRepeaterAccessibleName(el);
  if (!name) return false;
  if (!YN_REPEATER_ADD_PATTERNS.some((re) => re.test(name))) return false;
  // "Add to favorites", "Add to calendar" — page furniture that starts with
  // the right word and does the wrong thing.
  if (/\badd\s+to\b/i.test(name) && !YN_REPEATER_ROW_WORDS.test(name)) {
    return false;
  }
  // Every Add click passes ynSubmitGuard first — a control whose own wording
  // is submit-shaped ("Add and submit") is never a candidate here, however
  // "add"-like the rest of its name reads.
  if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) return false;
  return true;
}

/** "0 of 10 entries added" — the page's own statement of its limit, if any. */
function ynRepeaterCountsFrom(text) {
  const m = YN_REPEATER_COUNT_PATTERN.exec(text || "");
  if (!m) return {};
  return { current: Number(m[1]), max: Number(m[2]) };
}

/**
 * Find the section's own Add control inside `root`, by accessible name.
 * Returns null when nothing add-shaped is present (nothing to expand).
 */
function ynRepeaterFindAddControl(root, doc) {
  const document_ = doc || document;
  const scope = root || document_;
  const candidates = ynAdaFindAll(
    scope,
    'button, [role="button"], a[href="#"], input[type="button"]',
  );
  for (const el of candidates) {
    if (ynRepeaterLooksLikeAddControl(el)) return el;
  }
  return null;
}

/**
 * Grow a repeated section to `needed` rows by clicking its own Add control.
 *
 * lifted from https://github.com/averatec0773/offeros/blob/c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94/packages/autofill/src/history-rows.ts#L221-L237 (Apache-2.0), adapted (the row-count-by-DOM-order idea; the click loop itself is adapted from repeater.ts#L182-L215)
 *
 * Verifies row growth after every click (`rowSelector` both counts CURRENT
 * rows and, at the end, is read back as the DOM-ordered row elements — the
 * row-to-profile-entry assignment is the caller's job) and stops the moment
 * a click produces no new row: a defensive floor independent of any stated
 * cap, because a button that has quietly stopped working looks exactly like
 * one about to work, until you count. Never clicks past `needed`, the page's
 * own stated cap (parsed from the Add control's own accessible name or, if
 * the control frames it differently, the whole region's text), or the hard
 * ceiling `maxAttempts` (default 50).
 */
async function ynRepeaterExpand(opts) {
  const doc = (opts && opts.doc) || document;
  const root = (opts && opts.root) || doc;
  const rowSelector = opts && opts.rowSelector;
  const needed = Math.max(0, (opts && opts.needed) || 0);
  const maxAttempts = (opts && opts.maxAttempts) || 50;
  const settleMs = (opts && opts.settleMs) || 30;
  const settleTimeoutMs = (opts && opts.settleTimeoutMs) || 600;

  const countRows = () =>
    rowSelector ? ynAdaFindAll(root, rowSelector).length : 0;
  const rowsNow = () => (rowSelector ? ynAdaFindAll(root, rowSelector) : []);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let present = countRows();
  const addControl = ynRepeaterFindAddControl(root, doc);

  if (!addControl) {
    return {
      clicked: 0,
      rows: rowsNow(),
      present,
      couldNotAdd: Math.max(0, needed - present),
      capped: false,
      reason: present < needed ? "no Add control found" : undefined,
    };
  }

  // The page's stated cap ("0 of 10 entries added") is sometimes the Add
  // control's own accessible name, sometimes a sibling live-region the
  // control has no name relationship to (a "count-text" span next to
  // "Add", say) — try the control first, then the whole section's text,
  // rather than trusting whichever happens to be non-empty first.
  const statedFromControl = ynRepeaterCountsFrom(ynRepeaterAccessibleName(addControl));
  const stated =
    typeof statedFromControl.max === "number"
      ? statedFromControl
      : ynRepeaterCountsFrom((root.textContent || "").slice(0, 4000));
  const cap = typeof stated.max === "number" ? stated.max : Infinity;
  const target = Math.min(needed, cap);

  let clicked = 0;
  let stoppedEarly = false;
  while (present < target && clicked < maxAttempts) {
    // Re-checked on every iteration, defensively, in case the page swapped
    // the control after a click.
    if (typeof ynSubmitGuard === "function" && ynSubmitGuard(addControl)) {
      stoppedEarly = true;
      break;
    }
    const before = present;
    try {
      addControl.click();
    } catch {
      stoppedEarly = true;
      break;
    }
    // Most fixtures/pages grow synchronously; poll briefly for the ones that
    // do not (a re-render deferred a tick).
    let waited = 0;
    present = countRows();
    while (present <= before && waited < settleTimeoutMs) {
      await sleep(settleMs);
      waited += settleMs;
      present = countRows();
    }
    clicked += 1;
    if (present <= before) {
      stoppedEarly = true;
      break; // a click that grew nothing — never ask again
    }
  }

  return {
    clicked,
    rows: rowsNow(),
    present,
    couldNotAdd: Math.max(0, needed - present),
    capped: isFinite(cap) && needed > cap,
    reason:
      stoppedEarly && present < needed
        ? "the Add control stopped producing rows"
        : undefined,
  };
}
// Every name top-level in the original single-file version, exposed on
// globalThis exactly as before the move — chrome.scripting still injects
// the built file into the same isolated world as its neighbours, so a
// bare name another shipped file already called is still there to call.
globalThis.YN_REPEATER_ADD_PATTERNS = YN_REPEATER_ADD_PATTERNS;
globalThis.YN_REPEATER_ROW_WORDS = YN_REPEATER_ROW_WORDS;
globalThis.YN_REPEATER_COUNT_PATTERN = YN_REPEATER_COUNT_PATTERN;
globalThis.ynRepeaterAccessibleName = ynRepeaterAccessibleName;
globalThis.ynRepeaterLooksLikeAddControl = ynRepeaterLooksLikeAddControl;
globalThis.ynRepeaterCountsFrom = ynRepeaterCountsFrom;
globalThis.ynRepeaterFindAddControl = ynRepeaterFindAddControl;
globalThis.ynRepeaterExpand = ynRepeaterExpand;
