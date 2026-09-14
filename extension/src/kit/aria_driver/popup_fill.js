// content/aria_driver.js, part 2 of 3 — opening an ARIA popup and answering
// it. See index.js for the file's full history and what changed from the
// source it was lifted from.
//
// ynKitGuards and ynBestOptionMatch are content/dom_fill_kit.js globals,
// referenced here exactly as the original file referenced them: as bare
// names resolved at runtime, unchanged by this split.
import {
  YN_ARIA_OPEN_KEYS,
  YN_ARIA_OPEN_TIMEOUT_MS,
  YN_ARIA_COMMIT_TIMEOUT_MS,
  YN_ARIA_POLL_MS,
  ynAriaSleep,
  ynAriaPressPointer,
  ynAriaPressKey,
  ynAriaTextOf,
  ynAriaControlValue,
  ynAriaOptionsIn,
  ynAriaFindPopup,
  ynAriaTypeableWithin,
  ynAriaSetTyped,
  ynAriaTypeAsText,
  ynAriaSquash,
} from "./primitives.js";

/**
 * Get the list open, escalating only as far as it has to: a pointer press
 * first (what a user would do — and the ONE the popup-opening code uses is a
 * full pointerdown/mousedown/pointerup/mouseup/click sequence, since widgets
 * that listen on mousedown rather than click are common enough that a bare
 * click misses them), then the two keyboard openers. Each gesture is
 * followed by a wait; the first one that produces a popup wins.
 *
 * Virtualised lists render nothing until filtered, so if a typeable box is
 * nested inside the control, the target label is typed into it FIRST — this
 * is the codebase's own addition (see file header): the source only types
 * when no popup ever opens, but a virtualised list opens an EMPTY popup that
 * a filter, not a key, has to populate.
 */
export async function ynAriaOpenPopup(el, beforeSet, targetLabel) {
  const typeable = ynAriaTypeableWithin(el);
  if (typeable && targetLabel) {
    if (typeable instanceof HTMLInputElement) typeable.focus();
    ynAriaSetTyped(typeable, targetLabel);
  }

  const gestures = [
    () => {
      if (typeof el.focus === "function") el.focus();
      ynAriaPressPointer(el);
    },
    () => ynAriaPressKey(el, YN_ARIA_OPEN_KEYS[0].key, YN_ARIA_OPEN_KEYS[0].altKey),
    () => ynAriaPressKey(el, YN_ARIA_OPEN_KEYS[1].key, YN_ARIA_OPEN_KEYS[1].altKey),
  ];

  const perGesture = Math.max(
    1,
    Math.floor(YN_ARIA_OPEN_TIMEOUT_MS / gestures.length / YN_ARIA_POLL_MS),
  );
  for (const gesture of gestures) {
    gesture();
    for (let i = 0; i < perGesture; i += 1) {
      await ynAriaSleep(YN_ARIA_POLL_MS);
      const popup = ynAriaFindPopup(el, beforeSet);
      if (popup) return popup;
    }
  }
  return undefined;
}

/**
 * Options matched with THIS codebase's own exact/unique-substring refusal
 * rule (ynBestOptionMatch, from dom_fill_kit.js) rather than the source's
 * "first match wins" — see the file-header note.
 */
export function ynAriaMatchOptions(optionEls, targetLabel) {
  if (typeof ynBestOptionMatch !== "function") return null;
  return ynBestOptionMatch(optionEls, targetLabel);
}

/**
 * Answer an ARIA popup control: open it, match an option (or fall back to
 * typing when nothing opens), click it with a full pointer sequence, and
 * make the page prove the choice took before ever reporting a fill.
 *
 * @returns {{ok: boolean, matched?: Element, reason?: string, typed?: boolean}}
 */
export async function ynAriaFillPopup(el, targetLabel) {
  const current = ynAriaControlValue(el);
  if (current !== "" && ynAriaSquash(current) === ynAriaSquash(targetLabel)) {
    return { ok: true, alreadySet: true };
  }

  const doc = el.ownerDocument || document;
  const before = new Set(
    typeof ynQueryDeep === "function"
      ? ynQueryDeep(doc, '[role="listbox"], [role="menu"]')
      : doc.querySelectorAll('[role="listbox"], [role="menu"]'),
  );
  const popup = await ynAriaOpenPopup(el, before, targetLabel);
  if (!popup) {
    if (await ynAriaTypeAsText(el, targetLabel)) {
      return { ok: true, typed: true };
    }
    return { ok: false, reason: "no_popup" };
  }

  // Virtualised list: options may still be rendering right after the popup
  // appears (the fixture's own JS debounces on the typed filter). Poll a
  // short window before giving up rather than judging on the first frame.
  let opts = ynAriaOptionsIn(popup);
  const optionsDeadline = Date.now() + 1200;
  while (opts.length === 0 && Date.now() < optionsDeadline) {
    await ynAriaSleep(YN_ARIA_POLL_MS);
    opts = ynAriaOptionsIn(popup);
  }

  const hit = ynAriaMatchOptions(opts, targetLabel);
  if (!hit) {
    // ynSubmitGuard gate — re-closing the SAME control this function's own
    // ynAriaOpenPopup already passed the guard to open; refuse the same way.
    const closeGuard = ynKitGuards.clickGuard;
    if (el.getAttribute("aria-expanded") === "true" && closeGuard && !closeGuard(el)) {
      el.click(); // leave as found
    }
    return { ok: false, reason: opts.length ? "ambiguous_or_no_match" : "empty_popup" };
  }

  // ynSubmitGuard — the injected never-submit guard; fail closed with none injected.
  const guard = ynKitGuards.clickGuard;
  if (!guard || guard(hit)) return { ok: false, reason: "guard_refused" };

  hit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  hit.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
  hit.click(); // ynSubmitGuard already refused above if this option were submit-shaped

  const want = ynAriaTextOf(hit);
  for (let i = 0; i < YN_ARIA_COMMIT_TIMEOUT_MS / YN_ARIA_POLL_MS; i += 1) {
    if (hit.getAttribute("aria-selected") === "true") return { ok: true, matched: hit };
    if (hit.getAttribute("aria-checked") === "true") return { ok: true, matched: hit };
    const now = ynAriaControlValue(el);
    if (now !== "" && ynAriaSquash(now) === ynAriaSquash(want)) {
      return { ok: true, matched: hit };
    }
    await ynAriaSleep(YN_ARIA_POLL_MS);
  }
  return { ok: false, reason: "unconfirmed" };
}
