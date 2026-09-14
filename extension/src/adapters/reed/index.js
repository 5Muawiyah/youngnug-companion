// content/adapters/reed.js — deterministic fill intents for Reed's in-page
// application modal, read live in a signed-in session.
//
// Signed out, "Apply now" redirects to Reed's own login and there is nothing
// to fill: that case stays the login-wall handoff it always was (the filler
// reports login_required and never clicks the button). Signed in, the same
// button opens a modal (`[data-qa="apply-job-modal"]`) with the profile's
// details, the saved CV, an optional cover letter whose "Add" reveals
// `textarea[name="coverLetterText"]`, and "Submit application" - refused by
// name here and by ynSubmitGuard in the filler. "Edit" opens an "About you"
// sub-modal (`[data-qa="about-you-modal"]`) whose Save is type=submit and
// writes the Reed PROFILE, so those fields are filled only when empty and
// Save stays the student's click.

function ynReedSignedIn(doc) {
  const document_ = doc || document;
  // The account menu's logout link names the state directly, but Reed does
  // not render it on every signed-in page variant (observed live), and the
  // live href carries a returnTo query (observed 2026-08-25) so only a
  // prefix match sees it. The truth that holds everywhere: only a signed-in
  // account ever sees the application or About-you modal - anonymous Apply
  // clicks navigate to /authentication/login instead of opening one.
  if (document_.querySelector('a[href^="/authentication/logout"]')) return true;
  return !!(ynReedApplyModal(document_) || ynReedAboutYouModal(document_));
}

function ynReedApplyModal(doc) {
  const document_ = doc || document;
  const m = document_.querySelector('[data-qa="apply-job-modal"]');
  return m && (m.offsetWidth || m.offsetHeight) ? m : null;
}

function ynReedAboutYouModal(doc) {
  const document_ = doc || document;
  const m = document_.querySelector('[data-qa="about-you-modal"]');
  return m && (m.offsetWidth || m.offsetHeight) ? m : null;
}

/** True when the page is a signed-out Reed listing: the old wall handoff. */
function ynReedLoginWall(doc) {
  return !ynReedSignedIn(doc);
}

/** "07700 900123" → "+447700900123" (Reed stores E.164). */
function ynReedE164(raw) {
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0044")) return "+" + digits.slice(2);
  if (digits.startsWith("0")) return "+44" + digits.slice(1);
  return "";
}

function ynReedPlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const c = (plan && plan.contact) || {};

  if (!ynReedSignedIn(document_)) {
    // handled by the filler's login-wall path; nothing to plan
    return intents;
  }

  const claimed = new Set();
  const push = (fieldKey, el, value, kind, label, confidence) => {
    if (!el || claimed.has(el) || ynAdaIsPassword(el)) return;
    // Every selector above is a named contact/letter field, never the
    // Submit application control, but the same defensive consult the other
    // live adapters make before a push is repeated here rather than relied
    // on by construction: if a future field selector ever widens to match a
    // submit-shaped control, the guard refuses it here too.
    if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) return;
    if (value == null || value === "") return;
    if (typeof value === "string" && /\[CONFIRM/i.test(value)) return;
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

  const about = ynReedAboutYouModal(document_);
  if (about) {
    // Profile fields: filled only when empty (the engine keeps what the
    // student already has); Save is the student's click.
    if (ynAdaUsable(c.first_name)) {
      push("contact.first_name", about.querySelector("#forename"), c.first_name, "text", "First name");
    }
    if (ynAdaUsable(c.last_name)) {
      push("contact.last_name", about.querySelector("#surname"), c.last_name, "text", "Surname");
    }
    const e164 = ynReedE164(c.phone);
    if (ynAdaUsable(e164)) {
      push("contact.phone", about.querySelector("#phone"), e164, "text", "Phone number");
    }
    // Current/previous job title is not a fact the plan carries exactly:
    // left for the student (the generic rung may offer it amber).
    return intents;
  }

  const modal = ynReedApplyModal(document_);
  if (!modal) {
    intents.push({
      fieldKey: "reed.open_application",
      el: null,
      value: null,
      skip: "needs_you",
      label: "Click Apply now on this job to open the application, then run the fill again",
    });
    return intents;
  }

  const letterText = String((plan && plan.letter_text) || "").trim();
  const ta = modal.querySelector('textarea[name="coverLetterText"]');
  if (ta) {
    if (letterText) {
      push("cover_letter_text", ta, letterText, "textarea", "Cover letter");
    }
  } else if (letterText) {
    intents.push({
      fieldKey: "cover_letter_text",
      el: null,
      value: null,
      skip: "needs_you",
      label: "Click Add next to Cover letter (optional), then run the fill again to paste your letter",
    });
  }
  // The CV card shows the CV saved on the Reed profile; Update opens the
  // browser's own file picker, which no script can drive. Reported as kept.
  return intents;
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "reed",
  plan: ynReedPlan,
  loginWall: ynReedLoginWall,
  scope: (doc) => ynReedAboutYouModal(doc) || ynReedApplyModal(doc),
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynReedSignedIn = ynReedSignedIn;
globalThis.ynReedApplyModal = ynReedApplyModal;
globalThis.ynReedAboutYouModal = ynReedAboutYouModal;
globalThis.ynReedLoginWall = ynReedLoginWall;
globalThis.ynReedE164 = ynReedE164;
globalThis.ynReedPlan = ynReedPlan;
