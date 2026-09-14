// content/adapters/successfactors.js — intentionally empty adapter for SAP
// SuccessFactors Recruiting career sites. detect.js has no URL
// rule for it yet (*.successfactors.com|*.successfactors.eu|career*.sap.com);
// until one is added this adapter registers under id "successfactors" and
// stays inert.
//
// CHECKED on a live page 2026-09-03, headless, no sign-in:
// career5.successfactors.eu/careers?company=SAP. Confirmed the platform's
// own hidden-field convention on the search page (career_company, site,
// career_job_req_id, clientId, jobPipeline, referral_key — 85 hidden
// inputs total, all session/routing plumbing, none of them candidate
// fields). No job-detail link this walk tried matched a stable
// platform-wide URL pattern within the search-results DOM, and SAP's own
// help pages state candidates must sign in / create an account to apply —
// so no application form was reached. Fabricating field names for a form
// never seen would risk a wrong fill, so plan() returns [] and heuristics
// carries SuccessFactors entirely.

/**
 * SuccessFactors plan() — intentionally empty. See header: no application
 * form reached, so no selector inventory exists to claim from.
 */
function ynSuccessFactorsPlan(/* plan, doc */) {
  return [];
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "successfactors",
  plan: ynSuccessFactorsPlan,
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynSuccessFactorsPlan = ynSuccessFactorsPlan;
