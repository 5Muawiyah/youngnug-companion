// content/engine.js — the PRIVATE safety core + fill orchestrator. Generic
// DOM operations live in content/dom_fill_kit.js, loaded FIRST; this module
// keeps the never-submit guard, honeypot + account-wall detection, reporting
// and intent execution, and INJECTS the guard into the kit via ynKitInit —
// the kit never references this module's globals.
// The extension NEVER submits — ynSubmitGuard refuses every submit-shaped
// click. This is the single most important guarantee in the file.
//
// Split into nine parts (each under the 400-line module limit), largest
// function first as the single-file version's own inline processOne()
// closure (683 lines) was the one piece that would not fit in any module on
// its own even alone — it is now process_intent_precheck.js (the checks
// that decide whether to write at all) plus process_intent.js (the
// kind-specific writer), called by execute_intents.js in place of the old
// closure, with the state it used to close over (report, context,
// pendingVerify, the verify-batch kind Set) passed as explicit parameters
// instead. Every other part is a straight house-move: same functions, same
// order, same guards, wrapped as ES modules within this shipped file's own
// subtree. See each part's own header for exactly what moved and why.
//
// This entry re-exposes every one of the original file's top-level names
// onto globalThis exactly as the single-file version did — see
// extension/src/index.js for why that is safe: chrome.scripting still
// injects the BUILT content/engine.js as one classic script into the same
// isolated world as content/dom_fill_kit.js and every content/adapters/*.js
// file, so every name assigned onto globalThis here is the same bare name
// those files could already call.
import {
  ynEnginePause,
  ynEngineTimer,
  ynAdaIsPassword,
  ynAdaLabelOf,
  ynAdaUsable,
  YN_HONEYPOT_PHRASE_RE,
  ynHoneypotSignalText,
  ynAriaHiddenSelfOrAncestor,
  ynIsVisuallyHiddenTrap,
  ynFieldTopHitElements,
  ynIsOccludedField,
  ynIsHoneypot,
  ynShouldSkipField,
} from "./honeypot.js";
import {
  ynVisiblePasswordsIn,
  ynHasVisiblePassword,
  ynNearestForm,
  YN_AUTH_WIDGET_SEL,
  YN_AUTH_HEADING_RE,
  YN_ACCOUNT_CONTAINER_SEL,
  ynNearestAccountContainer,
  ynBoundedPasswordNeighbourhood,
  ynPasswordScope,
  ynPasswordScopes,
} from "./password_scope.js";
import {
  YN_ACCOUNT_TYPED_AC,
  YN_ACCOUNT_TYPED_SIGNAL_RE,
  ynIsFillableNonHoneypotField,
  ynIsAccountTypedField,
  ynFieldInNakedPasswordNeighbourhood,
  ynFieldInAnyPasswordScope,
  ynFieldInAccountWall,
  ynPageIsAccountCreation,
  ynIsAccountCreationWall,
} from "./account_wall.js";
import {
  ynSubmitGuard,
  YN_PAYMENT_AC_RE,
  YN_PAYMENT_SIGNAL_RE,
  ynIsPaymentField,
  YN_GUARD_SENSITIVE_RE,
  YN_GUARD_TRUTH_RE,
  YN_GUARD_POLICY_RE,
  ynGuardClassOf,
  ynGuardGroupLegendText,
  ynGuardGroupOptionTexts,
  YN_TERMS_SIGNAL_RE_HISTORIC,
  ynIsTermsCheckbox,
} from "./guards.js";
import {
  ynReportLabel,
  YN_MONTH_NAMES,
  ynToIsoDate,
  ynReportEntry,
} from "./report_helpers.js";
import { ynExecuteIntents } from "./execute_intents.js";
import { ynListUnclaimedFields, ynCoverage } from "./unclaimed_and_coverage.js";

// Adapters (other lane) self-register: YN_ADAPTERS.push({ id, match, plan, ... }).
// The single-file version wrote a bare `var YN_ADAPTERS = YN_ADAPTERS || [];`
// — an implicit global, legal only in a classic, non-strict script. ES
// module source is always strict, so the same bare assignment throws here;
// `globalThis.YN_ADAPTERS` is the explicit spelling of the same shared
// array (the same fix content/adapters/indeed_employer.js's own migrated
// entry documents).
globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];

// Every name that was top-level in the single-file version, assigned onto
// globalThis so a later-injected file can still call it as a bare name —
// the full set, matching the single-file version's own top-to-bottom order.
globalThis.ynEnginePause = ynEnginePause;
globalThis.ynEngineTimer = ynEngineTimer;
globalThis.ynAdaIsPassword = ynAdaIsPassword;
globalThis.ynAdaLabelOf = ynAdaLabelOf;
globalThis.ynAdaUsable = ynAdaUsable;
globalThis.YN_HONEYPOT_PHRASE_RE = YN_HONEYPOT_PHRASE_RE;
globalThis.ynHoneypotSignalText = ynHoneypotSignalText;
globalThis.ynAriaHiddenSelfOrAncestor = ynAriaHiddenSelfOrAncestor;
globalThis.ynIsVisuallyHiddenTrap = ynIsVisuallyHiddenTrap;
globalThis.ynFieldTopHitElements = ynFieldTopHitElements;
globalThis.ynIsOccludedField = ynIsOccludedField;
globalThis.ynIsHoneypot = ynIsHoneypot;
globalThis.ynShouldSkipField = ynShouldSkipField;
globalThis.ynVisiblePasswordsIn = ynVisiblePasswordsIn;
globalThis.ynHasVisiblePassword = ynHasVisiblePassword;
globalThis.ynNearestForm = ynNearestForm;
globalThis.YN_AUTH_WIDGET_SEL = YN_AUTH_WIDGET_SEL;
globalThis.YN_AUTH_HEADING_RE = YN_AUTH_HEADING_RE;
globalThis.YN_ACCOUNT_CONTAINER_SEL = YN_ACCOUNT_CONTAINER_SEL;
globalThis.ynNearestAccountContainer = ynNearestAccountContainer;
globalThis.ynBoundedPasswordNeighbourhood = ynBoundedPasswordNeighbourhood;
globalThis.ynPasswordScope = ynPasswordScope;
globalThis.ynPasswordScopes = ynPasswordScopes;
globalThis.YN_ACCOUNT_TYPED_AC = YN_ACCOUNT_TYPED_AC;
globalThis.YN_ACCOUNT_TYPED_SIGNAL_RE = YN_ACCOUNT_TYPED_SIGNAL_RE;
globalThis.ynIsFillableNonHoneypotField = ynIsFillableNonHoneypotField;
globalThis.ynIsAccountTypedField = ynIsAccountTypedField;
globalThis.ynFieldInNakedPasswordNeighbourhood = ynFieldInNakedPasswordNeighbourhood;
globalThis.ynFieldInAnyPasswordScope = ynFieldInAnyPasswordScope;
globalThis.ynFieldInAccountWall = ynFieldInAccountWall;
globalThis.ynPageIsAccountCreation = ynPageIsAccountCreation;
globalThis.ynIsAccountCreationWall = ynIsAccountCreationWall;
globalThis.ynSubmitGuard = ynSubmitGuard;
globalThis.YN_PAYMENT_AC_RE = YN_PAYMENT_AC_RE;
globalThis.YN_PAYMENT_SIGNAL_RE = YN_PAYMENT_SIGNAL_RE;
globalThis.ynIsPaymentField = ynIsPaymentField;
globalThis.YN_GUARD_SENSITIVE_RE = YN_GUARD_SENSITIVE_RE;
globalThis.YN_GUARD_TRUTH_RE = YN_GUARD_TRUTH_RE;
globalThis.YN_GUARD_POLICY_RE = YN_GUARD_POLICY_RE;
globalThis.ynGuardClassOf = ynGuardClassOf;
globalThis.ynGuardGroupLegendText = ynGuardGroupLegendText;
globalThis.ynGuardGroupOptionTexts = ynGuardGroupOptionTexts;
globalThis.YN_TERMS_SIGNAL_RE_HISTORIC = YN_TERMS_SIGNAL_RE_HISTORIC;
globalThis.ynIsTermsCheckbox = ynIsTermsCheckbox;
globalThis.ynReportLabel = ynReportLabel;
globalThis.YN_MONTH_NAMES = YN_MONTH_NAMES;
globalThis.ynToIsoDate = ynToIsoDate;
globalThis.ynReportEntry = ynReportEntry;
globalThis.ynExecuteIntents = ynExecuteIntents;
globalThis.ynListUnclaimedFields = ynListUnclaimedFields;
globalThis.ynCoverage = ynCoverage;

// Hand the never-submit guard to the generic dom-fill kit (dependency
// injection: the kit is generic-shareable and must never reference this
// module) — same call, same position relative to every other side effect
// in this file (the last one), as the single-file version's own line.
if (typeof ynKitInit === "function") ynKitInit({ clickGuard: ynSubmitGuard });
