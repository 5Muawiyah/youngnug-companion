// content/adapters/linkedin_easy_apply.js — deterministic fill intents for the
// LinkedIn Easy Apply wizard, read from the live modal in a signed-in session.
//
// The modal is `div[role="dialog"].jobs-easy-apply-modal`; every step is one
// `<form>` inside it with an `<h3>` step heading and a `<progress>` bar. The
// fields are found by their LABEL TEXT and role, never by the generated
// ember ids or the hashed class names: LinkedIn has shipped a whole new DOM
// once already and only the headings and labels survived it.
//
// Fill the step that is on screen, then STOP. `wizard.advance` only tells the
// filler whether a "Next" exists so the overlay can say "click Next yourself";
// it is never clicked by the extension, and the "Submit application" button
// is refused by shape (ynSubmitGuard) as well as by name here. Never a
// password, never the Follow-company checkbox, never EEO.

function ynLiModal(doc) {
  const document_ = doc || document;
  return (
    document_.querySelector('div[role="dialog"].jobs-easy-apply-modal') ||
    document_.querySelector(".jobs-easy-apply-modal[role='dialog']") ||
    null
  );
}

/** The visible step heading ("Contact info", "Resume", …) or "". */
function ynLiStepHeading(modal) {
  if (!modal) return "";
  const h3 = modal.querySelector("form h3, h3");
  return ((h3 && h3.textContent) || "").replace(/\s+/g, " ").trim();
}

/** Progress value 0-100 as text, for a stable step key. */
function ynLiProgress(modal) {
  const p = modal && modal.querySelector("progress");
  return p ? String(p.getAttribute("value") || p.value || "") : "";
}

/** Label text for a control: <label for>, labels[], aria-label. */
function ynLiLabelText(el, modal) {
  if (!el) return "";
  let text = "";
  if (el.labels && el.labels.length) {
    text = [...el.labels].map((l) => l.textContent || "").join(" ");
  } else if (el.id && modal) {
    try {
      const lab = modal.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) text = lab.textContent || "";
    } catch {
      /* ignore a bad id */
    }
  }
  if (!text) text = el.getAttribute("aria-label") || "";
  return text.replace(/\s+/g, " ").trim();
}

/** UK mobile numbers as the form wants them: national, digits and spaces. */
function ynLiNationalPhone(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const digits = s.replace(/[^\d+]/g, "");
  if (digits.startsWith("+44")) return "0" + digits.slice(3);
  if (digits.startsWith("0044")) return "0" + digits.slice(4);
  if (digits.startsWith("+")) return ""; // another country: never guess
  return digits;
}

/** Pick the dial-code option that matches the student's phone or country. */
function ynLiDialCodeOption(select, contact, address) {
  const opts = [...(select.options || [])];
  const phone = String((contact && contact.phone) || "").trim();
  const country = String((address && address.country) || "").toLowerCase();
  const wantsUk =
    /^(\+44|0044|0[1-9])/.test(phone.replace(/[\s()-]/g, "")) ||
    /united kingdom|\buk\b|england|scotland|wales|northern ireland/.test(
      country,
    );
  if (!wantsUk) return null;
  return (
    opts.find((o) => /united kingdom \(\+44\)/i.test(o.textContent || "")) ||
    null
  );
}

function ynLinkedInEasyApplyPlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const modal = ynLiModal(document_);
  const c = (plan && plan.contact) || {};
  const addr = (plan && plan.address) || {};

  if (!modal) {
    // The listing page: nothing to fill until the student opens the wizard.
    // Surfaced as "answer this yourself" so the overlay says what to click.
    intents.push({
      fieldKey: "linkedin.open_easy_apply",
      el: null,
      value: null,
      skip: "needs_you",
      label:
        "Click the blue Easy Apply button on this job first, then run the fill again",
    });
    return intents;
  }

  const claimed = new Set();
  const push = (fieldKey, el, value, kind, label, confidence) => {
    if (!el || claimed.has(el) || ynAdaIsPassword(el)) return;
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

  const controls = [...modal.querySelectorAll("input, select, textarea")];
  for (const el of controls) {
    const type = (el.type || "").toLowerCase();
    if (type === "password" || type === "hidden" || type === "submit") continue;
    const label = ynLiLabelText(el, modal).toLowerCase();

    // Step "Contact info"
    if (el.tagName === "SELECT" && /email address/.test(label)) {
      // LinkedIn only offers the account's verified addresses. Choose the one
      // that IS the student's address; never pick a different mailbox.
      const want = String(c.email || "").trim().toLowerCase();
      const match = [...el.options].find(
        (o) => (o.value || o.textContent || "").trim().toLowerCase() === want,
      );
      if (want && match) {
        push("contact.email", el, match.value, "select", "Email address");
      } else if (want) {
        intents.push({
          fieldKey: "contact.email",
          el,
          value: null,
          skip: "needs_you",
          label:
            "Email address: LinkedIn only lists the addresses verified on your LinkedIn account; pick one yourself",
        });
      }
      continue;
    }
    if (el.tagName === "SELECT" && /phone country code/.test(label)) {
      const opt = ynLiDialCodeOption(el, c, addr);
      if (opt) {
        // the dial code is inferred from the number's prefix: amber, not green
        push(
          "contact.phone_country",
          el,
          opt.value,
          "select",
          "Phone country code",
          "guessed",
        );
      }
      continue;
    }
    if (/mobile phone number|phone number/.test(label) && type !== "file") {
      const national = ynLiNationalPhone(c.phone);
      if (ynAdaUsable(national)) {
        push("contact.phone", el, national, "text", "Mobile phone number");
      }
      continue;
    }

    // Step "Resume": hidden file input behind the "Upload resume" label.
    if (type === "file") {
      const accept = (el.getAttribute("accept") || "").toLowerCase();
      const wantsDoc = !accept || /pdf|msword|wordprocessingml/.test(accept);
      if (wantsDoc && plan && plan.cv_url) {
        push("cv_file", el, { file: "cv" }, "file", "Resume (CV)");
        const last = intents[intents.length - 1];
        if (last && last.fieldKey === "cv_file") {
          last.uploadMode = "input";
          // No confirm selector is claimed: the engine then reports the
          // attach as amber "check this" rather than green, which is the
          // honest colour until the student sees the filename on screen.
        }
      }
      continue;
    }
    // Everything else (the Additional Questions step: Yes/No selects, years,
    // free text) is left to the generic rung, which handles right-to-work as
    // stored-or-nothing, EEO as never, and free text via the composer.
  }
  return intents;
}

/** A stable key per step: heading + progress, e.g. "Contact info@0". */
function ynLiStepKey(doc) {
  const modal = ynLiModal(doc || document);
  if (!modal) return "";
  return `${ynLiStepHeading(modal)}@${ynLiProgress(modal)}`;
}

/**
 * The control that would move the wizard on — returned for DETECTION only
 * (the filler says "click Next yourself"). "Submit application" is never
 * returned: refused by name here and by ynSubmitGuard in the filler.
 */
function ynLiAdvance(doc) {
  const modal = ynLiModal(doc || document);
  if (!modal) return null;
  const candidates = [
    ...modal.querySelectorAll(
      "button[data-easy-apply-next-button], button[aria-label='Continue to next step'], button[aria-label='Review your application']",
    ),
  ];
  for (const el of candidates) {
    const sig = [el.textContent, el.getAttribute("aria-label"), el.type]
      .filter(Boolean)
      .join(" ");
    if (/submit|send application|apply now|finish|complete application/i.test(sig)) {
      continue;
    }
    if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) continue;
    return el;
  }
  return null;
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "linkedin",
  plan: ynLinkedInEasyApplyPlan,
  // heuristics run inside the modal only: the page behind it carries the
  // site's own search boxes, which are not application fields
  scope: (doc) => ynLiModal(doc),
  wizard: { stepKey: ynLiStepKey, advance: ynLiAdvance },
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynLiModal = ynLiModal;
globalThis.ynLiStepHeading = ynLiStepHeading;
globalThis.ynLiProgress = ynLiProgress;
globalThis.ynLiLabelText = ynLiLabelText;
globalThis.ynLiNationalPhone = ynLiNationalPhone;
globalThis.ynLiDialCodeOption = ynLiDialCodeOption;
globalThis.ynLinkedInEasyApplyPlan = ynLinkedInEasyApplyPlan;
globalThis.ynLiStepKey = ynLiStepKey;
globalThis.ynLiAdvance = ynLiAdvance;
