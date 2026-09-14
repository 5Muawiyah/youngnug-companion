// content/filler.js, part 5 of 11 — the human-readable display line for
// an ATS, the assist-only (login-wall) handoff panel, the credential-field
// refusal scan, the not-attempted field count, and the full report-to-
// overlay-lines renderer. ynOverlay comes from this same shipped file's
// report_state.js. ynAssistEnsureOverlayBox / ynAssistMk / ynSubmitGuard /
// ynIsHoneypot / ynFieldInAnyPasswordScope / ynQueryDeep / ynCoverage /
// ynReportEntry are other shipped files' globals, referenced here as bare
// names exactly as the single-file version did. See index.js for the
// file's full history.
import { ynOverlay } from "./report_state.js";
export function ynAtsDisplayLine(ats, atWall) {
  if (!ats || ats.id === "unknown") {
    return "I don't know this system, so generic field matching is used.";
  }
  // login walls: never claim we are filling the listing page.
  if (ats.assistOnly || atWall) {
    return `${ats.name} requires sign-in before you can apply.`;
  }
  return `Filling a ${ats.name} application.`;
}

/**
 * A clear login-wall handoff for assistOnly ATSes (Reed). Never fills, never
 * clicks the apply button, never navigates. Prefer the assist overlay box
 * when assist.js is loaded; fall back to the text-only ynOverlay.
 */
export function ynAssistOnlyHandoff(ats) {
  const lines =
    ats && ats.id === "reed"
      ? [
          "This is a Reed job. Reed asks you to sign in before you apply. Sign in on Reed, then the extension can help fill your application. Nothing is submitted for you.",
        ]
      : [
          (ats && ats.name ? ats.name : "This site") +
            " asks you to sign in before you apply. Sign in first, then the extension can help fill your application. Nothing is submitted for you.",
        ];
  if (
    typeof ynAssistEnsureOverlayBox === "function" &&
    typeof ynAssistMk === "function"
  ) {
    try {
      const box = ynAssistEnsureOverlayBox();
      if (!box) return; // student closed the box for this page
      while (box.firstChild) box.removeChild(box.firstChild);
      box.appendChild(
        ynAssistMk("div", "font-weight:600;margin-bottom:6px;", lines[0]),
      );
      return;
    } catch {
      /* fall through to text overlay */
    }
  }
  ynOverlay(lines);
}

/**
 * True for a control the Companion refuses on CREDENTIAL grounds: a password
 * input, or any field inside a password's tight scope (engine.js's
 * ynFieldInAnyPasswordScope — the nearest form, else a named auth widget,
 * else the bounded neighbourhood of a naked password).
 *
 * A pure READ. It produces no intent and touches nothing, so the guarantee
 * that a password element never reaches the planner at all — pinned by
 * run_ats_identity_mapping.mjs — is untouched by making the refusal visible.
 * Making a refusal legible must never make it reachable.
 */
export function ynIsCredentialField(el, doc) {
  if (!el) return false;
  const document_ = doc || document;
  if ((el.type || "").toLowerCase() === "password") return true;
  return (
    typeof ynFieldInAnyPasswordScope === "function" &&
    ynFieldInAnyPasswordScope(el, document_)
  );
}

/**
 * The credential refusals, AS REPORT ROWS.
 *
 * heuristics.js, the local-resolver rung, engine.js and settle_observer.js
 * each refuse these independently, and every one of those refusals was a
 * bare `continue` — the student saw fields left blank and a report that
 * named none of them, which reads as "it did not notice" rather than "it
 * refused". This is the read that turns the silence into a sentence.
 *
 * `reason` distinguishes the field that IS the password from the fields
 * merely standing inside its scope, because the second class is the one a
 * student is most likely to think is a bug ("why did it skip my email?").
 */
export function ynCredentialSkips(doc) {
  const document_ = doc || document;
  const fields =
    typeof ynQueryDeep === "function"
      ? ynQueryDeep(document_, "input, textarea, select")
      : [...document_.querySelectorAll("input, textarea, select")];
  const rows = [];
  for (const el of fields) {
    if (!el || el.disabled) continue;
    const type = (el.type || "").toLowerCase();
    if (["hidden", "submit", "button", "image", "reset"].includes(type))
      continue;
    const isPassword = type === "password";
    if (!isPassword && !ynIsCredentialField(el, document_)) continue;
    // A honeypot is a trap, not a refusal worth naming to the user — the
    // page hid it deliberately and mentioning it teaches nothing.
    if (
      !isPassword &&
      typeof ynIsHoneypot === "function" &&
      ynIsHoneypot(el, document_)
    ) {
      continue;
    }
    const entry =
      typeof ynReportEntry === "function"
        ? ynReportEntry({
            fieldKey: isPassword ? "password" : "password_scope",
            el,
          })
        : { fieldKey: isPassword ? "password" : "password_scope", label: "" };
    entry.reason = isPassword ? "password" : "sign-in scope";
    rows.push(entry);
    if (rows.length >= 20) break; // a report, not a page dump
  }
  return rows;
}

/**
 * Count visible, enabled fillable controls not claimed by any intent.
 * Used only for accurate "Filled N of M" overlay totals: without this, M
 * counted only the fields the extension recognised, so a page where it matched
 * 3 of 20 could still read "Filled 3 of 3". Deliberately a display-only
 * integer, not a new report array. Excludes hidden/submit/button/reset/image.
 */
export function ynCountNotAttempted(doc, claimedEls) {
  const document_ = doc || document;
  const claimed = claimedEls || new Set();
  const fields =
    typeof ynQueryDeep === "function"
      ? ynQueryDeep(document_, "input, textarea, select")
      : [...document_.querySelectorAll("input, textarea, select")];
  let n = 0;
  for (const el of fields) {
    if (!el || claimed.has(el)) continue;
    if (el.disabled) continue;
    const type = (el.type || "").toLowerCase();
    if (["hidden", "submit", "button", "image", "reset"].includes(type))
      continue;
    // Credential fields now have their OWN reported bucket
    // (report.skipped_password, via ynCredentialSkips). Counting them here
    // as well would double them into the "of M" denominator and read as
    // twice as many untouched fields as the page actually has.
    if (ynIsCredentialField(el, document_)) continue;
    // rough visibility: skip display:none / zero-box (keep offsetParent-less
    // fixed elements that still have a client rect)
    try {
      const st = window.getComputedStyle(el);
      if (st && (st.display === "none" || st.visibility === "hidden")) continue;
      if (el.getClientRects && el.getClientRects().length === 0) continue;
    } catch {
      /* non-DOM or cross-origin style — count it */
    }
    n += 1;
  }
  return n;
}

/**
 * @param {object} ats
 * @param {object} report
 * @param {number} [notAttempted] fillable fields we never produced an intent for
 * @param {{passiveCaptcha?: boolean, moreSteps?: boolean, stepKey?: string}} [extra]
 */
export function ynReportOverlayLines(ats, report, notAttempted, extra) {
  const filledN = (report.filled || []).length;
  const guessedN = (report.guessed || []).length;
  const done = filledN + guessedN;
  const unresolvedN = (report.unresolved || []).length;
  const notN = typeof notAttempted === "number" ? notAttempted : 0;
  // Coverage (engine.js's ynCoverage): both fill paths call this function,
  // so it is computed here exactly once. The job path already knows its
  // unclaimed-control count from the SAME walker the dev lister uses
  // (tools/list_unclaimed_fields.js) by the time it gets here — see the
  // APPLY_RESULT sends above it — and this only fills in notAttempted as a
  // fallback for a caller (the generic any-page path) that never had reason
  // to compute that count itself.
  if (typeof ynCoverage === "function") {
    if (typeof report.unclaimed_controls !== "number") {
      report.unclaimed_controls = notN;
    }
    Object.assign(report, ynCoverage(report));
  }
  const total =
    done +
    unresolvedN +
    (report.reverted || []).length +
    (report.skipped_eeo || []).length +
    (report.skipped_sensitive || []).length + // included in the count (previously omitted)
    (report.skipped_payment || []).length + // never filled, still counted
    (report.skipped_terms || []).length + // never ticked, still counted
    (report.skipped_password || []).length + // credentials, named not hidden
    (report.needs_you || []).length + // generated fields left for the user
    (report.user_kept || []).length +
    notN;
  const lines = [
    "YoungNug",
    ynAtsDisplayLine(ats),
    `Filled ${done} of ${total || done} field(s)` +
      (guessedN ? ` (${guessedN} to double-check)` : "") +
      (notN ? ` (${notN} not attempted)` : "") +
      ".",
  ];
  if (guessedN) {
    const labels = (report.guessed || [])
      .map((e) => ynReportFieldLabel(e))
      .filter(Boolean)
      .slice(0, 6);
    if (labels.length) lines.push("Check these: " + labels.join("; "));
  }
  if (unresolvedN) {
    const labels = (report.unresolved || [])
      .map((e) => ynReportFieldLabel(e))
      .filter(Boolean)
      .slice(0, 6);
    if (labels.length)
      lines.push("I could not read these: " + labels.join("; "));
  }
  if ((report.skipped_eeo || []).length) {
    lines.push("Equal-opportunity questions left for you.");
  }
  // Criminal / health / referee questions — reported, never filled
  if ((report.skipped_sensitive || []).length) {
    lines.push("Sensitive questions left for you.");
  }
  // Card/billing fields — never filled, whatever the page asked
  if ((report.skipped_payment || []).length) {
    lines.push("Payment fields are never filled.");
  }
  // Terms/consent boxes — agreement is the user's act alone
  if ((report.skipped_terms || []).length) {
    lines.push("Terms boxes are left for you to read and tick.");
  }
  // Credentials — the refusal used to be invisible (see ynEmptyReport)
  if ((report.skipped_password || []).length) {
    lines.push(
      `Passwords and sign-in fields are never filled (${report.skipped_password.length} left alone).`,
    );
  }
  // Free-text generation failed or capped — user types these
  if ((report.needs_you || []).length) {
    const labels = (report.needs_you || [])
      .map((e) => ynReportFieldLabel(e))
      .filter(Boolean)
      .slice(0, 6);
    lines.push(
      "Answer this one yourself: " +
        (labels.join("; ") || `${report.needs_you.length} field(s)`),
    );
  }
  // Hold-check: values the site re-rendered back to empty after we
  // wrote them. Downgraded to reflect that — never reported as filled.
  if ((report.reverted || []).length) {
    const labels = (report.reverted || [])
      .map((e) => ynReportFieldLabel(e))
      .filter(Boolean)
      .slice(0, 6);
    lines.push(
      "The site cleared these after filling. Type them yourself: " +
        (labels.join("; ") || `${report.reverted.length} field(s)`),
    );
  }
  if ((report.user_kept || []).length) {
    lines.push(`Left ${report.user_kept.length} field(s) you already filled.`);
  }
  // Multi-step (Workday): human-paced — we DETECT next via wizard.advance but
  // never auto-click it (never-submit spirit + server validation races).
  if (extra && extra.moreSteps) {
    const stepLabel = extra.stepKey ? String(extra.stepKey) : "this step";
    lines.push(
      `Step filled (${stepLabel}). Click Next or Save and Continue yourself.`,
    );
  }
  if (extra && extra.passiveCaptcha) {
    lines.push(
      "A captcha sits on this form. You will solve it when you submit",
    );
  }
  if (report.coverage && typeof report.coverage.value === "number") {
    lines.push(`Coverage: ${Math.round(report.coverage.value * 100)}%.`);
  }
  // Errors used to reach only the API as a bare count (report.errors),
  // invisible on the page — a site-rendered validation error next to a
  // filled field (the hold-check's site_flagged reason) looked like a
  // silent success. One compact icon row, not a sentence per error.
  const errN = (report.errors || []).length;
  if (errN) {
    const errLabels = (report.errors || [])
      .map((e) => ynReportFieldLabel(e))
      .filter(Boolean)
      .slice(0, 6);
    lines.push("✕ " + (errLabels.join("; ") || `${errN} error(s)`));
  }
  // Coverage causes (ynCoverage always computes this object once P has
  // landed, so it is present on every fill; a row is added only when a
  // cause is actually non-zero, or a clean fill would gain a new, silent
  // "0 of everything" line it never had before).
  if (report.causes && typeof report.causes === "object") {
    const causeLabel = {
      needs_your_answer: "needs you",
      not_recognised: "not recognised",
      manual_upload: "manual upload",
      only_you_can_answer: "guard",
      write_rejected: "rejected",
    };
    const causeParts = Object.keys(causeLabel)
      .map((k) => [report.causes[k], causeLabel[k]])
      .filter(([n]) => typeof n === "number" && n > 0)
      .map(([n, label]) => `${n} ${label}`);
    if (causeParts.length) lines.push("• " + causeParts.join(", "));
  }
  // Drafted screening answers: never written silently, only
  // counted here — the review screen is where each is approved or skipped.
  const draftsN = (report.drafts || []).length;
  if (draftsN) {
    lines.push(
      `✎ ${draftsN} drafted answer${draftsN === 1 ? "" : "s"} to review`,
    );
  }
  lines.push("Nothing was submitted. Review and submit yourself.");
  return lines;
}

/**
 * Use adapter.wizard.advance ONLY to detect whether more steps remain.
 * NEVER clicks the control (human-paced default — MESSAGE_CONTRACT.md).
 * Every candidate still passes ynSubmitGuard; submit-shaped returns are ignored.
 * @returns {{ moreSteps: boolean, advanceEl: Element|null, stepKey: string }}
 */
