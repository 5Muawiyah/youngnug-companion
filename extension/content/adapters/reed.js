(() => {
  // extension/src/adapters/reed/index.js
  function ynReedSignedIn(doc) {
    const document_ = doc || document;
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
  function ynReedLoginWall(doc) {
    return !ynReedSignedIn(doc);
  }
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
    const c = plan && plan.contact || {};
    if (!ynReedSignedIn(document_)) {
      return intents;
    }
    const claimed = /* @__PURE__ */ new Set();
    const push = (fieldKey, el, value, kind, label, confidence) => {
      if (!el || claimed.has(el) || ynAdaIsPassword(el)) return;
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
        label: label || ynAdaLabelOf(el, document_) || fieldKey
      });
    };
    const about = ynReedAboutYouModal(document_);
    if (about) {
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
      return intents;
    }
    const modal = ynReedApplyModal(document_);
    if (!modal) {
      intents.push({
        fieldKey: "reed.open_application",
        el: null,
        value: null,
        skip: "needs_you",
        label: "Click Apply now on this job to open the application, then run the fill again"
      });
      return intents;
    }
    const letterText = String(plan && plan.letter_text || "").trim();
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
        label: "Click Add next to Cover letter (optional), then run the fill again to paste your letter"
      });
    }
    return intents;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "reed",
    plan: ynReedPlan,
    loginWall: ynReedLoginWall,
    scope: (doc) => ynReedAboutYouModal(doc) || ynReedApplyModal(doc)
  });
  globalThis.ynReedSignedIn = ynReedSignedIn;
  globalThis.ynReedApplyModal = ynReedApplyModal;
  globalThis.ynReedAboutYouModal = ynReedAboutYouModal;
  globalThis.ynReedLoginWall = ynReedLoginWall;
  globalThis.ynReedE164 = ynReedE164;
  globalThis.ynReedPlan = ynReedPlan;
})();
