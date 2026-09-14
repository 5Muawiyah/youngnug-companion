// content/adapters/indeed_apply.js — deterministic fill intents for Indeed
// Apply (smartapply.indeed.com), read from the live wizard in a signed-in
// session. The wizard runs contact information → location → CV → (employer
// questions, when the employer asked any) → review, one page per step on the
// same origin.
//
// Indeed labels its fields properly (`<label for>`, `autocomplete` tokens:
// given-name, family-name, tel, postal-code, address-level2, street-address),
// so discovery is by those names and tokens, never by the hashed class names.
// Three things the page ships that this adapter must respect: the ten
// "Continue" buttons of which nine have no layout (decoys - only the visible
// one is ever reported as the way on, and it is never clicked), the hidden
// `age` field whose placeholder says "If you're a human, leave this blank"
// (a honeypot; the engine refuses it and the adapter never claims it), and a
// passive reCAPTCHA on every step (flagged, never solved).
//
// Fill the step on screen, then STOP. The review step's "Submit your
// application" is type=submit and is refused by ynSubmitGuard.

function ynIaRoot(doc) {
  const document_ = doc || document;
  return document_.querySelector("main") || document_.body || null;
}

function ynIaHeading(doc) {
  const document_ = doc || document;
  const h = document_.querySelector("main h2, h2");
  return ((h && h.textContent) || "").replace(/\s+/g, " ").trim();
}

function ynIaProgress(doc) {
  const document_ = doc || document;
  const p = document_.querySelector("[role='progressbar']");
  return p ? String(p.getAttribute("aria-valuenow") || "") : "";
}

/** Visible = has layout. Indeed renders hidden decoy buttons. */
function ynIaVisible(el) {
  return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
}

/** "+44 7700 900123" / "07700 900123" → "7700900123" (national significant number). */
function ynIaNationalSignificant(raw) {
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+44")) return digits.slice(3);
  if (digits.startsWith("0044")) return digits.slice(4);
  if (digits.startsWith("+")) return ""; // another country: never guess
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

function ynIndeedApplyPlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const c = (plan && plan.contact) || {};
  const addr = (plan && plan.address) || {};
  const root = ynIaRoot(document_);
  if (!root) return intents;

  const claimed = new Set();
  const push = (fieldKey, el, value, kind, label, confidence) => {
    if (!el || claimed.has(el) || ynAdaIsPassword(el)) return;
    if (value == null || value === "") return;
    if (typeof value === "string" && /\[CONFIRM/i.test(value)) return;
    if (typeof ynIsHoneypot === "function" && ynIsHoneypot(el, document_)) return;
    claimed.add(el);
    intents.push({
      fieldKey,
      el,
      value,
      kind: kind || "text",
      confidence: confidence || "exact",
      source: "adapter",
      label: label || ynAdaLabelOf(el, document_) || fieldKey,
    });
  };

  const byToken = (token) =>
    root.querySelector(`input[autocomplete="${token}"]`) || null;

  // Step "Add your contact information"
  if (ynAdaUsable(c.first_name)) {
    push("contact.first_name", byToken("given-name"), c.first_name, "text", "First name");
  }
  if (ynAdaUsable(c.last_name)) {
    push("contact.last_name", byToken("family-name"), c.last_name, "text", "Last name");
  }
  const nsn = ynIaNationalSignificant(c.phone);
  if (ynAdaUsable(nsn)) {
    const tel =
      root.querySelector('input[type="tel"][name="phone"]') || byToken("tel");
    push("contact.phone", tel, nsn, "text", "Phone number");
  }

  // Step "Add your location" (saved to the student's Indeed profile on
  // Continue - their click)
  if (ynAdaUsable(addr.postcode)) {
    push("address.postcode", byToken("postal-code"), addr.postcode, "text", "Postcode");
  }
  if (ynAdaUsable(addr.city)) {
    push("address.city", byToken("address-level2"), addr.city, "text", "City, county");
  }
  if (ynAdaUsable(addr.line1)) {
    push("address.line1", byToken("street-address"), addr.line1, "text", "Street address");
  }

  // Step "Add a CV": a new upload only when the plan carries a CV. The
  // account's saved CV stays selected if the student prefers it.
  if (plan && plan.cv_url) {
    const fileEl = [...root.querySelectorAll('input[type="file"]')].find((el) => {
      const accept = (el.getAttribute("accept") || "").toLowerCase();
      return !accept || /pdf|msword|wordprocessingml/.test(accept);
    });
    if (fileEl) {
      push("cv_file", fileEl, { file: "cv" }, "file", "CV upload");
      const last = intents[intents.length - 1];
      if (last && last.fieldKey === "cv_file") last.uploadMode = "input";
    }
  }

  // Employer questions, when present, go to the generic rung (Yes/No,
  // years, free text via the composer; right-to-work stored-or-nothing).
  return intents;
}

function ynIaStepKey(doc) {
  return `${ynIaHeading(doc)}@${ynIaProgress(doc)}`;
}

/** The one visible "Continue" - for detection only, never clicked. */
function ynIaAdvance(doc) {
  const document_ = doc || document;
  const buttons = [...document_.querySelectorAll("button")];
  for (const el of buttons) {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!/^continue$/i.test(text)) continue;
    if (!ynIaVisible(el)) continue; // the decoys
    if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) continue;
    return el;
  }
  return null;
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "indeed",
  plan: ynIndeedApplyPlan,
  scope: (doc) => ynIaRoot(doc),
  wizard: { stepKey: ynIaStepKey, advance: ynIaAdvance },
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynIaRoot = ynIaRoot;
globalThis.ynIaHeading = ynIaHeading;
globalThis.ynIaProgress = ynIaProgress;
globalThis.ynIaVisible = ynIaVisible;
globalThis.ynIaNationalSignificant = ynIaNationalSignificant;
globalThis.ynIndeedApplyPlan = ynIndeedApplyPlan;
globalThis.ynIaStepKey = ynIaStepKey;
globalThis.ynIaAdvance = ynIaAdvance;
