// content/adapters/indeed_employer.js — EMPLOYER-side posting intents for
// employers.indeed.com (NOT a candidate apply adapter). Fills the posting
// wizard from the employer's own approved YoungNug listing and STOPS BEFORE
// the final button — the employer presses Post themselves, mirroring the
// candidate-side never-submit guarantee exactly.
//
// LIVE VERIFICATION BLOCKED by the employer login wall: employers.indeed.com
// shows nothing useful unauthenticated, so every selector below is
// documented best-effort convention (Indeed's public smart-apply/job-post
// field names), NOT live-confirmed — each lookup is DEFENSIVE (missing
// selector → label-matching fallback → no intent), and every intent is
// confidence "guessed" (amber, "check this") because an unverified selector
// must never render as an emerald "exact". Re-verify against a real employer
// account when one exists.
//
// plan() returns FillIntents ONLY and never touches the DOM;
// content/engine.js ynExecuteIntents stays the single writer, so the
// honeypot / payment / terms / password guards all apply unchanged.
// wizard.advance is DETECT-ONLY like workday.js — it returns a mid-wizard
// Continue button for the OVERLAY to point at, never clicks, and discards
// anything submit/post-shaped via ynSubmitGuard.
//
// Split into field_helpers.js / plan.js / wizard.js plus this entry, which
// re-exposes every one of the original file's top-level names onto
// globalThis exactly as the single-file version did (ynIeSponsorshipField
// is called from content/posting_filler.js as a bare name — the reason
// every name is restored, not only the ones this file itself still calls)
// — see extension/src/index.js for why that is safe.
import {
  YN_IE_SPONSOR_SIGNAL_RE,
  ynIeSignal,
  ynIeFillableFields,
  ynIeSponsorshipField,
  ynIeFind,
  ynIeKindOf,
} from "./field_helpers.js";
import { ynIndeedEmployerPlan } from "./plan.js";
import { ynIeStepKey, ynIeAdvance } from "./wizard.js";

globalThis.YN_IE_SPONSOR_SIGNAL_RE = YN_IE_SPONSOR_SIGNAL_RE;
globalThis.ynIeSignal = ynIeSignal;
globalThis.ynIeFillableFields = ynIeFillableFields;
globalThis.ynIeSponsorshipField = ynIeSponsorshipField;
globalThis.ynIeFind = ynIeFind;
globalThis.ynIeKindOf = ynIeKindOf;
globalThis.ynIndeedEmployerPlan = ynIndeedEmployerPlan;
globalThis.ynIeStepKey = ynIeStepKey;
globalThis.ynIeAdvance = ynIeAdvance;

// The original file's own registration tail, unchanged in effect: every
// adapter file appends itself to the one shared YN_ADAPTERS array as it
// loads. The original wrote a bare `YN_ADAPTERS = ...` (an implicit global,
// legal only because the file was NOT "use strict" at the point that line
// ran in a classic script); ES module source is always strict, so the same
// implicit-global assignment throws here — `globalThis.YN_ADAPTERS` is the
// explicit spelling of the exact same shared array.
globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
globalThis.YN_ADAPTERS.push({
  id: "indeed_employer",
  plan: ynIndeedEmployerPlan,
  wizard: {
    stepKey: ynIeStepKey,
    advance: ynIeAdvance,
  },
});
