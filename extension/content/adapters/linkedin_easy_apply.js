(() => {
  // extension/src/adapters/linkedin_easy_apply/index.js
  function ynLiModal(doc) {
    const document_ = doc || document;
    return document_.querySelector('div[role="dialog"].jobs-easy-apply-modal') || document_.querySelector(".jobs-easy-apply-modal[role='dialog']") || null;
  }
  function ynLiStepHeading(modal) {
    if (!modal) return "";
    const h3 = modal.querySelector("form h3, h3");
    return (h3 && h3.textContent || "").replace(/\s+/g, " ").trim();
  }
  function ynLiProgress(modal) {
    const p = modal && modal.querySelector("progress");
    return p ? String(p.getAttribute("value") || p.value || "") : "";
  }
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
      }
    }
    if (!text) text = el.getAttribute("aria-label") || "";
    return text.replace(/\s+/g, " ").trim();
  }
  function ynLiNationalPhone(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const digits = s.replace(/[^\d+]/g, "");
    if (digits.startsWith("+44")) return "0" + digits.slice(3);
    if (digits.startsWith("0044")) return "0" + digits.slice(4);
    if (digits.startsWith("+")) return "";
    return digits;
  }
  function ynLiDialCodeOption(select, contact, address) {
    const opts = [...select.options || []];
    const phone = String(contact && contact.phone || "").trim();
    const country = String(address && address.country || "").toLowerCase();
    const wantsUk = /^(\+44|0044|0[1-9])/.test(phone.replace(/[\s()-]/g, "")) || /united kingdom|\buk\b|england|scotland|wales|northern ireland/.test(
      country
    );
    if (!wantsUk) return null;
    return opts.find((o) => /united kingdom \(\+44\)/i.test(o.textContent || "")) || null;
  }
  function ynLinkedInEasyApplyPlan(plan, doc) {
    const document_ = doc || document;
    const intents = [];
    const modal = ynLiModal(document_);
    const c = plan && plan.contact || {};
    const addr = plan && plan.address || {};
    if (!modal) {
      intents.push({
        fieldKey: "linkedin.open_easy_apply",
        el: null,
        value: null,
        skip: "needs_you",
        label: "Click the blue Easy Apply button on this job first, then run the fill again"
      });
      return intents;
    }
    const claimed = /* @__PURE__ */ new Set();
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
        label: label || ynAdaLabelOf(el, document_) || fieldKey
      });
    };
    const controls = [...modal.querySelectorAll("input, select, textarea")];
    for (const el of controls) {
      const type = (el.type || "").toLowerCase();
      if (type === "password" || type === "hidden" || type === "submit") continue;
      const label = ynLiLabelText(el, modal).toLowerCase();
      if (el.tagName === "SELECT" && /email address/.test(label)) {
        const want = String(c.email || "").trim().toLowerCase();
        const match = [...el.options].find(
          (o) => (o.value || o.textContent || "").trim().toLowerCase() === want
        );
        if (want && match) {
          push("contact.email", el, match.value, "select", "Email address");
        } else if (want) {
          intents.push({
            fieldKey: "contact.email",
            el,
            value: null,
            skip: "needs_you",
            label: "Email address: LinkedIn only lists the addresses verified on your LinkedIn account; pick one yourself"
          });
        }
        continue;
      }
      if (el.tagName === "SELECT" && /phone country code/.test(label)) {
        const opt = ynLiDialCodeOption(el, c, addr);
        if (opt) {
          push(
            "contact.phone_country",
            el,
            opt.value,
            "select",
            "Phone country code",
            "guessed"
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
      if (type === "file") {
        const accept = (el.getAttribute("accept") || "").toLowerCase();
        const wantsDoc = !accept || /pdf|msword|wordprocessingml/.test(accept);
        if (wantsDoc && plan && plan.cv_url) {
          push("cv_file", el, { file: "cv" }, "file", "Resume (CV)");
          const last = intents[intents.length - 1];
          if (last && last.fieldKey === "cv_file") {
            last.uploadMode = "input";
          }
        }
        continue;
      }
    }
    return intents;
  }
  function ynLiStepKey(doc) {
    const modal = ynLiModal(doc || document);
    if (!modal) return "";
    return `${ynLiStepHeading(modal)}@${ynLiProgress(modal)}`;
  }
  function ynLiAdvance(doc) {
    const modal = ynLiModal(doc || document);
    if (!modal) return null;
    const candidates = [
      ...modal.querySelectorAll(
        "button[data-easy-apply-next-button], button[aria-label='Continue to next step'], button[aria-label='Review your application']"
      )
    ];
    for (const el of candidates) {
      const sig = [el.textContent, el.getAttribute("aria-label"), el.type].filter(Boolean).join(" ");
      if (/submit|send application|apply now|finish|complete application/i.test(sig)) {
        continue;
      }
      if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) continue;
      return el;
    }
    return null;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "linkedin",
    plan: ynLinkedInEasyApplyPlan,
    // heuristics run inside the modal only: the page behind it carries the
    // site's own search boxes, which are not application fields
    scope: (doc) => ynLiModal(doc),
    wizard: { stepKey: ynLiStepKey, advance: ynLiAdvance }
  });
  globalThis.ynLiModal = ynLiModal;
  globalThis.ynLiStepHeading = ynLiStepHeading;
  globalThis.ynLiProgress = ynLiProgress;
  globalThis.ynLiLabelText = ynLiLabelText;
  globalThis.ynLiNationalPhone = ynLiNationalPhone;
  globalThis.ynLiDialCodeOption = ynLiDialCodeOption;
  globalThis.ynLinkedInEasyApplyPlan = ynLinkedInEasyApplyPlan;
  globalThis.ynLiStepKey = ynLiStepKey;
  globalThis.ynLiAdvance = ynLiAdvance;
})();
