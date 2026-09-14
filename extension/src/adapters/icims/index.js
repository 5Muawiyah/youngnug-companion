// content/adapters/icims.js — fill-the-gate intents only for iCIMS.
// Selectors verified live against the gate.
//
// SCOPE LIMIT — gate screen only. Every iCIMS application sits behind an
// hCaptcha-protected email/phone identity step, so the downstream My
// Information / Experience / EEO screens have no verified selector inventory.
// This adapter therefore claims ONLY the verified gate fields, cutting the
// typing the user does before they solve the captcha themselves; downstream
// fields are left entirely to heuristics. Extending it requires a selector
// inventory captured from those screens — never guessed ones.
//
// Captcha handling lives in filler/engine (ynChallengePage / passive hCaptcha
// present) — this adapter adds NO captcha logic. Content runs in the same-origin
// iframe (?in_iframe=1); the popup's click-time injection passes
// allFrames:true, since there are no static content scripts.
// Never password, never submit, never invent downstream selectors.

/**
 * iCIMS plan() — gate only (verified inventory):
 *   #email name=css_loginName → contact.email
 *   #phoneNumber name=css_phoneNumber → contact.phone
 * Country-code widgets and hCaptcha textarea are NOT claimed.
 * Downstream application forms: return nothing (unverified).
 */
function ynIcimsPlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const c = (plan && plan.contact) || {};
  const claimed = new Set();

  const push = (fieldKey, el, value, kind, label) => {
    if (!el || claimed.has(el) || ynAdaIsPassword(el)) return;
    if (value == null || value === "") return;
    if (typeof value === "string" && /\[CONFIRM/i.test(value)) return;
    claimed.add(el);
    intents.push({
      fieldKey,
      el,
      value,
      kind: kind || "text",
      confidence: "exact",
      source: "adapter",
      label: label || ynAdaLabelOf(el, document_) || fieldKey,
    });
  };

  // Verified gate fields (live DOM on Login | GDPR page).
  if (ynAdaUsable(c.email)) {
    push(
      "contact.email",
      ynAdaFind(
        document_,
        '#email, input[name="css_loginName"][type="email"], input[name="css_loginName"]',
      ),
      c.email,
      "text",
      "Email",
    );
  }
  if (ynAdaUsable(c.phone)) {
    push(
      "contact.phone",
      ynAdaFind(document_, '#phoneNumber, input[name="css_phoneNumber"]'),
      c.phone,
      "text",
      "Phone",
    );
  }

  // selectedCountryCode / countryCode / h-captcha-response / enterEmailSubmitButton:
  // present on the gate but not filled here (submit never; captcha = user).

  return intents;
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "icims",
  plan: ynIcimsPlan,
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynIcimsPlan = ynIcimsPlan;
