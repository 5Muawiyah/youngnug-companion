// content/engine.js, part 6 of 9 — the intent-level pre-checks every write
// runs through before the kind-specific writer ever touches the DOM: the
// planner-declared eeo/payment/terms skips, the honeypot guard, the
// password-scope wall, the by-element action-control refusal, the
// by-element EEO-section refusal, the payment-field refusal, the
// terms-checkbox refusal, and the never-overwrite-what-the-user-typed
// check. Extracted from the single-file version's inline processOne()
// closure into its own function, called first by process_intent.js's
// ynEngineProcessIntent — every check, every push, every order is
// unchanged; only the "stop processing this intent" signal changed shape,
// from a bare `return;` inside one big function to `return true;` here,
// read by the caller as "already handled, do not run the kind-specific
// writer". A `false` return means none of these checks fired and the
// writer should proceed exactly as before. See index.js for the file's
// full history.
//
// Every check below runs on the intent's LIVE ELEMENT, never on which rung
// produced the intent. This matters because own_rules (a student's own
// adblock-style label=key mapping) claims its elements BEFORE heuristics
// ever runs (see filler/filler/plan_rungs.js), so heuristics never gets a
// chance to set intent.skip="eeo" on a demographic field an own rule
// mapped, and own_rules' own field query (`input, textarea, select`, no
// type filter) never excludes a submit control either. Re-deriving the
// EEO/action-control refusal from the element itself — the same live-DOM
// read ynAdaIsPassword and ynFieldInAnyPasswordScope already do for
// passwords — closes that gap for every present and future rung, not only
// heuristics.
import { ynReportEntry } from "./report_helpers.js";
import { ynIsHoneypot, ynAdaIsPassword } from "./honeypot.js";
import { ynFieldInAnyPasswordScope } from "./account_wall.js";
import { ynIsPaymentField, ynIsTermsCheckbox, ynSubmitGuard } from "./guards.js";

export function ynEngineIntentPrecheck(intent, report) {
  if (intent.skip === "eeo") {
    report.skipped_eeo.push(ynReportEntry(intent));
    if (intent.el) ynHighlight(intent.el, "missed");
    return true;
  }
  // Planner-declared payment / terms skips — reported, never written.
  if (intent.skip === "payment") {
    report.skipped_payment.push(ynReportEntry(intent));
    if (intent.el) ynHighlight(intent.el, "missed");
    return true;
  }
  if (intent.skip === "terms") {
    report.skipped_terms.push(ynReportEntry(intent));
    if (intent.el) ynHighlight(intent.el, "missed");
    return true;
  }

  const el = intent.el;
  if (!el || !el.isConnected) {
    report.unresolved.push(ynReportEntry(intent));
    return true;
  }

  // Action controls (submit/button/reset/image/hidden inputs, <button>,
  // <a>) are NEVER written by any intent, whatever rung produced it and
  // whatever kind the intent claims — a rule or a mis-scan could otherwise
  // map a profile value onto a "Send my application" control by CSS
  // selector or by its own accessible label. ynSubmitGuard's own textual
  // check (submit/send application/apply now/post job/…) also fires here,
  // so a same-styled non-<button> control with a submit-shaped label is
  // caught the same way a click on it already is elsewhere in this file.
  //
  // A custom combobox's own trigger is legitimately a <button> or an
  // input/div with a native "button" type/role in some ATSes — its own
  // combobox kind is driven by ynDriveCombobox, not the writers this check
  // guards, so it is excluded from the TAG/TYPE half of this check by its
  // ARIA combobox shape (the same three signals ynFieldKind already uses to
  // recognise one). ynSubmitGuard's textual check still applies to it —
  // nothing with combobox ARIA should ever also read as "Submit"/"Post
  // job" in its own text, and if it somehow does, refusing it is correct.
  const elType = (el.type || "").toLowerCase();
  const elTag = (el.tagName || "").toUpperCase();
  const elRole = (
    (el.getAttribute && el.getAttribute("role")) || ""
  ).toLowerCase();
  const isComboboxTrigger =
    elRole === "combobox" ||
    (el.getAttribute && el.getAttribute("aria-autocomplete") === "list") ||
    (el.getAttribute && el.getAttribute("aria-haspopup") === "listbox");
  // A native form field (a text input, checkbox, radio, select, textarea or
  // an editable region) cannot submit a form by being WRITTEN, whatever word
  // its own name or label carries: "Would you need us to sponsor a work
  // visa?", "Confirm email", "Finish date" and "Pay expectations" are real
  // fields whose names share words with the submit vocabulary. The textual
  // half of this check therefore applies only to elements that are not
  // such fields; the click guard still refuses every control that can
  // submit, and the tag/type half above still refuses the action controls.
  const isNativeField =
    ((elTag === "INPUT" &&
      !["submit", "button", "reset", "image", "hidden"].includes(elType)) ||
      elTag === "SELECT" ||
      elTag === "TEXTAREA" ||
      el.isContentEditable === true);
  const isActionControl =
    (!isComboboxTrigger &&
      (elTag === "BUTTON" ||
        elTag === "A" ||
        elType === "submit" ||
        elType === "button" ||
        elType === "reset" ||
        elType === "image" ||
        elType === "hidden")) ||
    (!isNativeField &&
      typeof ynSubmitGuard === "function" &&
      ynSubmitGuard(el));
  if (isActionControl) {
    report.unresolved.push(ynReportEntry(intent));
    return true;
  }

  // EEO / protected-characteristic fields are NEVER written, whatever the
  // planner said or left unset — ynInEeoSection (content/heuristics.js,
  // referenced as a bare global exactly as ynHighlight/ynIsPlaceholderValue
  // already are below: every injected file has finished running by the
  // time ynExecuteIntents is actually called, whatever order the fill
  // stack's own script list injects them in) reads the field's OWN label
  // plus its ancestor fieldset/section heading directly off the live
  // element, the same way this file already re-derives password-scope from
  // the element rather than trusting the rung that produced the intent.
  if (
    intent.skip !== "eeo" &&
    typeof ynInEeoSection === "function" &&
    ynInEeoSection(el)
  ) {
    report.skipped_eeo.push(ynReportEntry(intent));
    ynHighlight(el, "missed");
    return true;
  }

  // Honeypot / hidden trap — never write, never report as filled.
  if (typeof ynIsHoneypot === "function" && ynIsHoneypot(el, document)) {
    report.skipped_honeypot.push(ynReportEntry(intent));
    return true;
  }
  // Password fields must never be filled (belt-and-braces).
  if (typeof ynAdaIsPassword === "function" && ynAdaIsPassword(el)) {
    return true;
  }
  // Inside ANY password's tight scope — never write; fields outside every
  // password scope on the same page still fill.
  const inPasswordScope =
    typeof ynFieldInAnyPasswordScope === "function" &&
    ynFieldInAnyPasswordScope(el, document);
  if (inPasswordScope) {
    return true;
  }
  // Payment fields are NEVER written, whatever the planner said —
  // enforced here so a mis-mapped intent cannot reach a card field.
  if (
    typeof ynIsPaymentField === "function" &&
    ynIsPaymentField(el, document)
  ) {
    report.skipped_payment.push(ynReportEntry(intent));
    ynHighlight(el, "missed");
    return true;
  }
  // Terms/consent checkboxes are NEVER ticked — agreement is the
  // user's act alone. Surfaced in the report instead.
  if (
    (intent.kind === "checkbox" ||
      intent.kind === "radio" ||
      intent.kind === "aria_choice") &&
    typeof ynIsTermsCheckbox === "function" &&
    ynIsTermsCheckbox(el, document)
  ) {
    report.skipped_terms.push(ynReportEntry(intent));
    ynHighlight(el, "missed");
    return true;
  }

  // never overwrite what the user already typed — but a control merely
  // showing ITS OWN DEFAULT ("-None-", "Please select", a bare "+44"
  // dial code) has not been answered either, so that is filled too
  // rather than reported user_kept.
  const kind = intent.kind || "text";
  if (kind === "checkbox" || kind === "radio") {
    /* checked state handled below — only skip if user already set and
       intent would flip away; leave it alone if it already matches or
       user has interacted; treat as kept if already checked when value true */
  } else if (kind !== "file" && kind !== "contenteditable_plain") {
    let existingRaw = el.value || "";
    let placeholderProbe = existingRaw;
    let classifyKind = intent.fieldKey === "contact.phone" ? "phone" : kind;
    let selectStructural;
    if (kind === "select") {
      const idx = typeof el.selectedIndex === "number" ? el.selectedIndex : -1;
      const opt = (el.options && el.options[idx]) || null;
      existingRaw = opt ? String(opt.value || "") : "";
      placeholderProbe = opt ? String(opt.textContent || "") : "";
      selectStructural = {
        selectedIndex: idx,
        optionDisabled: Boolean(!opt || opt.disabled),
      };
    }
    const existing = existingRaw.trim();
    const isPlaceholder =
      typeof ynIsPlaceholderValue === "function" &&
      ynIsPlaceholderValue(classifyKind, placeholderProbe, selectStructural);
    if (existing && !isPlaceholder) {
      report.user_kept.push(ynReportEntry(intent));
      return true;
    }
  }
  return false;
}
