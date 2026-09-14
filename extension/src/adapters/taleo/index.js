// content/adapters/taleo.js — intentionally empty adapter for Oracle Taleo.
// Architecture (confirmed live):
// legacy .ftl multi-page-POST, heavy hidden session state, tenant-customized
// field names, NO stable platform field scheme.
//
// CHECKED on a live page 2026-09-03, headless, no sign-in: BAE Systems'
// baesystems.taleo.net/careersection/baes_sa_uk — the earlier claim that
// "cold GETs redirect to unavailablerequisition" did NOT reproduce here: a
// plain search from a fresh, cookie-less session reached a real
// jobdetail.ftl page (job 00110645) with the full description rendered.
// What stopped this walk was the following step: the page shows "Welcome.
// You are not signed in." with Sign In / My Job Cart as the only
// account-shaped actions, and no in-page "Apply" control was found in the
// rendered viewport — Taleo's apply flow appears to require Sign In / an
// account before any application form is reached, which this extension
// deliberately refuses to automate.
//
// No field selectors have been verified against a live Taleo APPLICATION
// FORM. Fabricating .ftl field names would risk filling the wrong data into
// the wrong field, so plan() returns [] and heuristics carries Taleo
// entirely until a real signed-in session records the real
// application-form field inventory.
//
// Detection still names this ATS correctly in the popup (detect.js + this id).
// Never password, never submit, never invent selectors.

/**
 * Taleo plan() — intentionally empty.
 * Research status: architecture verified; application field names UNVERIFIED.
 * Re-verify after a live session with cookies preserved; then claim fields.
 */
function ynTaleoPlan(/* plan, doc */) {
  return [];
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "taleo",
  plan: ynTaleoPlan,
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynTaleoPlan = ynTaleoPlan;
