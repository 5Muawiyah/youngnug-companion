// content/adapters/workday.js — Workday recruiting fill intents (CONVENTION).
// Most of this file is well-established public data-automation-id
// convention, NOT live-confirmed. Each lookup is DEFENSIVE: missing/wrong
// selector → no intent (heuristics may still match); a wrong Workday fill is
// worse than an unfilled field.
//
// CHECKED on a live page 2026-09-03, headless, no sign-in: Capital One's
// capitalone.wd12.myworkdayjobs.com "Technology Graduate" posting, through
// Apply -> Apply Manually -> /apply/applyManually. CONFIRMED, exactly as the
// public convention describes: an <ol data-automation-id="progressBar"> of
// <li> steps, the current one data-automation-id="progressBarActiveStep"
// with text "current step 1 of 7Create Account/Sign In", the rest
// data-automation-id="progressBarInactiveStep" reading "step N of
// M<Name>" — ynWdStepKey below now reads this FIRST. That step is itself
// the account-creation wall (data-automation-id="signInFormo",
// "createAccountSubmitButton", password + verifyPassword fields) that
// ynWdIsAccountWall already detects; the check stopped there, never created
// an account, so My Information / My Experience / Voluntary Disclosures /
// Review (steps 2-7) remain UNVERIFIED — the automation-ids seeded below for
// those stay convention, not confirmed. (Also observed, informational only:
// a honeypot input data-automation-id="beecatcher" name="website" on the
// sign-in form — generic honeypot detection is heuristics'/engine's guard,
// not changed here.)
//
// plan() returns FillIntents only. Never password, never credentials, never
// submit. Account wall = assist (empty plan that step). Voluntary
// Disclosures / Self Identify = skip:"eeo". Multi-step relies on engine
// fillstate. wizard.advance may return Next only — never Submit.
//
// Split into field_helpers.js / plan.js / wizard.js plus this entry, which
// re-exposes every one of the original file's top-level names onto
// globalThis exactly as the single-file version did — see
// extension/src/index.js for why that is safe.
import {
  ynWdByAutomation,
  ynWdResolveControl,
  ynWdIsAccountWall,
  ynWdResumeTarget,
  ynWdEeoSkipIntents,
  ynWdKindOf,
} from "./field_helpers.js";
import {
  ynWorkdayPlan,
  YN_WD_HISTORY_ROW_SEL,
  ynWdHistoryIntents,
} from "./plan.js";
import {
  YN_WD_PROGRESS_RE,
  ynWdProgressStep,
  ynWdStepKey,
  ynWdAdvance,
} from "./wizard.js";

globalThis.ynWdByAutomation = ynWdByAutomation;
globalThis.ynWdResolveControl = ynWdResolveControl;
globalThis.ynWdIsAccountWall = ynWdIsAccountWall;
globalThis.ynWdResumeTarget = ynWdResumeTarget;
globalThis.ynWdEeoSkipIntents = ynWdEeoSkipIntents;
globalThis.ynWdKindOf = ynWdKindOf;
globalThis.ynWorkdayPlan = ynWorkdayPlan;
globalThis.YN_WD_HISTORY_ROW_SEL = YN_WD_HISTORY_ROW_SEL;
globalThis.ynWdHistoryIntents = ynWdHistoryIntents;
globalThis.YN_WD_PROGRESS_RE = YN_WD_PROGRESS_RE;
globalThis.ynWdProgressStep = ynWdProgressStep;
globalThis.ynWdStepKey = ynWdStepKey;
globalThis.ynWdAdvance = ynWdAdvance;

// The original file's own registration tail, unchanged in effect (see
// extension/src/adapters/indeed_employer/index.js for the implicit-
// global trap this rewrite avoids).
globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
globalThis.YN_ADAPTERS.push({
  id: "workday",
  plan: ynWorkdayPlan,
  wizard: {
    stepKey: ynWdStepKey,
    advance: ynWdAdvance,
  },
});
