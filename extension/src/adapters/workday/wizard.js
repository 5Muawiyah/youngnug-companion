// content/adapters/workday.js, part 3 of 3 — progress-bar reading,
// step-key naming and the Next/Save-and-Continue advance detector. See
// index.js for the file's full banner.

import { ynWdByAutomation, ynWdIsAccountWall } from "./field_helpers.js";

// "current step 1 of 7Create Account/Sign In" / "step 4 of 6Voluntary
// Disclosures" — CONFIRMED live (Capital One, 2026-09-03; see header).
export const YN_WD_PROGRESS_RE = /(?:current\s+)?step\s+(\d+)\s+of\s+(\d+)\s*(.*)$/i;

/**
 * Read the page's own progress bar: data-automation-id="progressBar" (an
 * <ol>) containing exactly one "progressBarActiveStep" <li> plus zero or
 * more "progressBarInactiveStep" <li>s. Returns {index, total, name} from
 * the active step's own text, or null when no progress bar is present
 * (a single-page form, or a step that renders one differently).
 */
export function ynWdProgressStep(doc) {
  const document_ = doc || document;
  const bar = ynAdaFind(document_, '[data-automation-id="progressBar"]');
  const active = ynAdaFind(
    document_,
    '[data-automation-id="progressBarActiveStep"]',
  );
  if (!bar && !active) return null;
  const text = ((active && active.textContent) || "").trim();
  const m = YN_WD_PROGRESS_RE.exec(text);
  if (!m) return null;
  return {
    index: parseInt(m[1], 10),
    total: parseInt(m[2], 10),
    name: (m[3] || "").trim(),
  };
}

/**
 * Wizard step key for fillstate resume (multi-step). The progress bar
 * (confirmed live, see header) is the first and most reliable signal: it
 * names the step in the page's own words and says whether it is the last
 * (review/submit) one. Falls back to the older heading/section convention
 * when no progress bar renders — some entry steps (the very first "Apply"
 * choice screen) predate it.
 */
export function ynWdStepKey(doc) {
  const document_ = doc || document;
  if (ynWdIsAccountWall(document_)) return "account_wall";
  const progress = ynWdProgressStep(document_);
  if (progress && progress.name) {
    return `${progress.name}@${progress.index}of${progress.total}`;
  }
  // heading / progress chrome if present
  const heading = ynAdaFind(
    document_,
    '[data-automation-id="pageHeaderTitleText"], h2[data-automation-id], h1[data-automation-id]',
  );
  if (heading) {
    const t = (heading.textContent || "").trim().slice(0, 60);
    if (t) return t;
  }
  // which known sections are visible
  if (ynWdByAutomation(document_, "legalNameSection_firstName"))
    return "my_information";
  if (
    ynAdaFind(
      document_,
      '[data-automation-id*="Disclosure"], [data-automation-id*="selfIdentification"]',
    )
  ) {
    return "disclosures";
  }
  const body = (document_.body && document_.body.innerText) || "";
  if (/my experience/i.test(body)) return "my_experience";
  if (/application questions/i.test(body)) return "application_questions";
  if (/review/i.test(body) && /submit/i.test(body)) return "review";
  return "step";
}

/**
 * Advance ONLY via explicitly-safe Next / Save and Continue buttons.
 * NEVER return a Submit control — engine also re-checks ynSubmitGuard.
 * // convention, re-verify on live
 */
export function ynWdAdvance(doc) {
  const document_ = doc || document;
  const candidates = [];

  const byIds = ["bottom-navigation-next-button", "pageFooterNextButton"];
  for (const id of byIds) {
    const el =
      ynWdByAutomation(document_, id) ||
      ynAdaFind(document_, `[data-automation-id="${id}"]`);
    if (el) candidates.push(el);
  }

  // text-matched next only as last resort among role=button
  if (!candidates.length) {
    const buttons = ynAdaFindAll(
      document_,
      'button, [role="button"], a[role="button"]',
    );
    for (const b of buttons) {
      const text = (
        (b.textContent || "") +
        " " +
        (b.getAttribute("aria-label") || "") +
        " " +
        (b.getAttribute("data-automation-id") || "")
      ).trim();
      if (/save\s*and\s*continue|^\s*next\s*$|continue/i.test(text)) {
        candidates.push(b);
      }
    }
  }

  for (const el of candidates) {
    if (!el) continue;
    const sig = [
      el.getAttribute && el.getAttribute("data-automation-id"),
      el.textContent,
      el.value,
      el.getAttribute && el.getAttribute("aria-label"),
      el.getAttribute && el.getAttribute("name"),
    ]
      .filter(Boolean)
      .join(" ");
    // hard refuse any submit-shaped control (even if Next selector misfired)
    if (
      /submit|send application|apply now|finish|complete application/i.test(sig)
    ) {
      continue;
    }
    if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) {
      continue;
    }
    return el;
  }
  return null;
}
