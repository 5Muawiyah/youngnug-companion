// content/engine.js, part 9 of 9 — every fillable control the current
// rungs did not claim, and the fill-success coverage metric computed from
// a report's own bucket lengths. ynQueryDeep, ynLabelText, ynGroupLegend,
// ynNearbyText are dom_fill_kit.js / heuristics.js globals, referenced
// here as bare names exactly as the single-file version did.
// See index.js for the file's full history.
import { ynFieldInAnyPasswordScope } from "./account_wall.js";
import { ynIsHoneypot } from "./honeypot.js";
/**
 * Every fillable control the current rungs did NOT claim: input, select,
 * textarea, contenteditable, and role=combobox|listbox|checkbox|radio.
 * Shared by tools/list_unclaimed_fields.js (a dev-only listing, run after a
 * plan) and ynCoverage's not_recognised cause below, so the dev tool and the
 * metric can never quietly diverge into two different counts for the same
 * idea. Read-only: never sets a value, never clicks, never a keyboard event.
 *
 * Password fields, fields inside ANY password's scope, and honeypots are
 * EXCLUDED here even though heuristics.js never gives them an intent
 * either (a bare `continue`, same as a genuinely unrecognised field) —
 * those three are already accounted for elsewhere (ynCredentialSkips'
 * report.skipped_password is a full, independent DOM read; a honeypot is
 * adversarial trap markup, not a question a coverage number should judge
 * against). Counting them again here would give one field two causes.
 *
 * @param {object[]} planIntents every intent ANY rung produced (claimed and
 *   skipped alike — sensitive/needs_you/eeo intents still count as claimed;
 *   this only reports controls with NO intent at all).
 * @returns {{tag:string, type:string, id:string, name:string,
 *   automationId:string, label:string, visible:boolean, disabled:boolean}[]}
 */
export function ynListUnclaimedFields(planIntents) {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc) return [];
  const claimed = new Set(
    (Array.isArray(planIntents) ? planIntents : [])
      .map((i) => i && i.el)
      .filter(Boolean),
  );
  const selector =
    'input, select, textarea, [contenteditable=""], [contenteditable="true"], ' +
    '[role="combobox"], [role="listbox"], [role="checkbox"], [role="radio"]';
  const nodes =
    typeof ynQueryDeep === "function"
      ? ynQueryDeep(doc, selector)
      : [...doc.querySelectorAll(selector)];
  const out = [];
  for (const el of nodes) {
    if (!el || claimed.has(el)) continue;
    const type = String(
      (el.getAttribute && el.getAttribute("type")) || el.type || "",
    ).toLowerCase();
    if (type === "password") continue;
    if (["hidden", "submit", "button", "image", "reset"].includes(type)) {
      continue;
    }
    if (
      typeof ynFieldInAnyPasswordScope === "function" &&
      ynFieldInAnyPasswordScope(el, doc)
    ) {
      continue;
    }
    if (typeof ynIsHoneypot === "function" && ynIsHoneypot(el, doc)) continue;
    const tag = (el.tagName || "").toLowerCase();
    const disabled = Boolean(
      el.disabled || (el.getAttribute && el.getAttribute("aria-disabled") === "true"),
    );
    let visible = true;
    try {
      const view = doc.defaultView;
      const st = view ? view.getComputedStyle(el) : null;
      if (st && (st.display === "none" || st.visibility === "hidden")) {
        visible = false;
      }
      if (visible && el.getClientRects && el.getClientRects().length === 0) {
        visible = false;
      }
    } catch {
      /* cross-origin or non-DOM node — assume visible rather than hide it */
    }
    const label =
      (typeof ynLabelText === "function" && ynLabelText(el, doc)) ||
      (typeof ynGroupLegend === "function" && ynGroupLegend(el, doc)) ||
      (typeof ynNearbyText === "function" && ynNearbyText(el, doc)) ||
      "";
    out.push({
      tag,
      type,
      id: el.id || "",
      name: (el.getAttribute && el.getAttribute("name")) || "",
      automationId:
        (el.getAttribute &&
          (el.getAttribute("data-automation-id") ||
            el.getAttribute("data-testid") ||
            el.getAttribute("data-qa"))) ||
        "",
      label: String(label || "").replace(/\s+/g, " ").trim().slice(0, 160),
      visible,
      disabled,
    });
  }
  return out;
}

/**
 * The fill-success metric: every unfilled field gets EXACTLY ONE cause from
 * a closed set, and the coverage number cannot be inflated by weakening a
 * guard — a guard refusal is removed from the denominator, never credited
 * as filled. Pure: reads only report's own bucket lengths plus the three
 * scalar counts the caller attaches (unclaimed_controls, manual_upload_count,
 * write_rejected_count) — no DOM access, no side effects, so the same
 * function serves the live fill paths and the offline coverage table alike.
 *
 * @param {object} report any report shape with the usual array buckets.
 * @returns {{causes: object, coverage: object}}
 */
export function ynCoverage(report) {
  const r = report || {};
  const len = (k) => (Array.isArray(r[k]) ? r[k].length : 0);

  const filledExact = len("filled");
  const filledGuessed = len("guessed");
  const skipped = len("user_kept");
  const guardRefusals =
    len("skipped_eeo") +
    len("skipped_sensitive") +
    len("skipped_payment") +
    len("skipped_terms") +
    len("skipped_password") +
    len("skipped_honeypot");
  const needsYourAnswer = len("needs_you");
  const notRecognised =
    typeof r.unclaimed_controls === "number" ? r.unclaimed_controls : 0;
  const manualUpload =
    typeof r.manual_upload_count === "number" ? r.manual_upload_count : 0;
  const writeRejected =
    typeof r.write_rejected_count === "number"
      ? r.write_rejected_count
      : Math.max(0, len("unresolved") - manualUpload);

  const causes = {
    needs_your_answer: needsYourAnswer,
    not_recognised: notRecognised,
    manual_upload: manualUpload,
    only_you_can_answer: guardRefusals,
    write_rejected: writeRejected,
  };

  const filled = filledExact + filledGuessed;
  const fields =
    filled +
    skipped +
    guardRefusals +
    needsYourAnswer +
    notRecognised +
    manualUpload +
    writeRejected;
  const denominator = fields - skipped - guardRefusals - manualUpload;
  const value = denominator > 0 ? filled / denominator : null;

  return {
    causes,
    coverage: {
      filled,
      fields,
      skipped,
      guard_refusals: guardRefusals,
      manual_uploads: manualUpload,
      value,
    },
  };
}
