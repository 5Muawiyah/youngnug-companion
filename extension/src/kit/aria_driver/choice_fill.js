// content/aria_driver.js, part 3 of 3 — non-native radio/checkbox/switch
// choice groups. See index.js for the file's full history and what changed
// from the source it was lifted from.
//
// ynKitGuards is a content/dom_fill_kit.js global, referenced here exactly
// as the original file referenced it: a bare name resolved at runtime,
// unchanged by this split.
import { YN_ARIA_OPTION_SELECTOR, YN_ARIA_COMMIT_TIMEOUT_MS, YN_ARIA_POLL_MS, ynAriaSleep, ynAriaTextOf } from "./primitives.js";
import { ynAriaMatchOptions } from "./popup_fill.js";

/** The group a non-native choice option belongs to: role=radiogroup's own
 * children, or the nearest ancestor holding more than one option of the
 * same role when the page did not label a group at all. */
export function ynAriaGroupMembers(el) {
  const role = el.getAttribute("role");
  if (role === "radiogroup") {
    return Array.from(el.querySelectorAll(YN_ARIA_OPTION_SELECTOR));
  }
  const selector = `[role="${role}"]`;
  const group = el.closest(
    '[role="radiogroup"], [role="group"], fieldset',
  );
  if (group) return Array.from(group.querySelectorAll(selector));
  let scope = el.parentElement;
  while (scope && scope.querySelectorAll(selector).length < 2) {
    scope = scope.parentElement;
  }
  return Array.from((scope || el).querySelectorAll(selector));
}

export function ynAriaOptionLabel(el) {
  return el.getAttribute("aria-label") || ynAriaTextOf(el);
}

/** Answer a non-native radio/checkbox/switch by clicking the matching
 * option and asking the page whether it took. */
export async function ynAriaFillChoice(el, targetLabel) {
  const members = ynAriaGroupMembers(el);
  const hit = ynAriaMatchOptions(members, targetLabel);
  if (!hit) return { ok: false, reason: "ambiguous_or_no_match" };
  if (hit.getAttribute("aria-checked") === "true") return { ok: true, alreadySet: true };

  // ynSubmitGuard — the injected never-submit guard; fail closed with none injected.
  const guard = ynKitGuards.clickGuard;
  if (!guard || guard(hit)) return { ok: false, reason: "guard_refused" };

  hit.click(); // ynSubmitGuard already refused above if this option were submit-shaped
  for (let i = 0; i < YN_ARIA_COMMIT_TIMEOUT_MS / YN_ARIA_POLL_MS; i += 1) {
    if (hit.getAttribute("aria-checked") === "true") return { ok: true, matched: hit };
    await ynAriaSleep(YN_ARIA_POLL_MS);
  }
  return { ok: false, reason: "unconfirmed" };
}
