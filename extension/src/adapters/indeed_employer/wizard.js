// content/adapters/indeed_employer.js, part 3 of 3 — the wizard step-key
// and detect-only advance the popup's overlay reads. See index.js for the
// file's full banner.
//
// ynAdaFindAll and ynSubmitGuard are NOT declared in this bundle — they are
// content/dom_fill_kit.js globals, referenced here exactly as the original
// file referenced them: bare names resolved at runtime, unchanged by this
// split.

/** Wizard step key for the overlay (heading text, best-effort). */
export function ynIeStepKey(doc) {
  const document_ = doc || document;
  try {
    const heading = document_.querySelector("h1, h2, [role='heading']");
    const t = heading
      ? String(heading.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 60)
      : "";
    if (t) return t;
  } catch {
    /* fall through */
  }
  return "step";
}

/**
 * DETECT-ONLY advance, exactly workday.js's contract: return a mid-wizard
 * Continue/Save-and-continue button so the overlay can say "click Continue
 * yourself", or null. NEVER clicks. Anything submit/post/confirm/publish-
 * shaped is discarded — ynSubmitGuard's posting-terminal terms make the
 * wizard's final buttons unreturnable by construction.
 */
export function ynIeAdvance(doc) {
  const document_ = doc || document;
  let buttons = [];
  try {
    buttons =
      typeof ynAdaFindAll === "function"
        ? ynAdaFindAll(document_, 'button, [role="button"], a[role="button"]')
        : [...document_.querySelectorAll('button, [role="button"]')];
  } catch {
    buttons = [];
  }
  for (const b of buttons) {
    if (!b) continue;
    const text = (
      (b.textContent || "") +
      " " +
      ((b.getAttribute && b.getAttribute("aria-label")) || "")
    ).trim();
    if (!/save\s*and\s*continue|^\s*next\s*$|continue/i.test(text)) continue;
    if (typeof ynSubmitGuard === "function" && ynSubmitGuard(b)) continue;
    return b;
  }
  return null;
}
