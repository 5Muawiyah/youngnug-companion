(() => {
  // extension/src/adapters/indeed_apply/index.js
  function ynIaRoot(doc) {
    const document_ = doc || document;
    return document_.querySelector("main") || document_.body || null;
  }
  function ynIaHeading(doc) {
    const document_ = doc || document;
    const h = document_.querySelector("main h2, h2");
    return (h && h.textContent || "").replace(/\s+/g, " ").trim();
  }
  function ynIaProgress(doc) {
    const document_ = doc || document;
    const p = document_.querySelector("[role='progressbar']");
    return p ? String(p.getAttribute("aria-valuenow") || "") : "";
  }
  function ynIaVisible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }
  function ynIaNationalSignificant(raw) {
    const digits = String(raw || "").replace(/[^\d+]/g, "");
    if (!digits) return "";
    if (digits.startsWith("+44")) return digits.slice(3);
    if (digits.startsWith("0044")) return digits.slice(4);
    if (digits.startsWith("+")) return "";
    if (digits.startsWith("0")) return digits.slice(1);
    return digits;
  }
  function ynIndeedApplyPlan(plan, doc) {
    const document_ = doc || document;
    const intents = [];
    const c = plan && plan.contact || {};
    const addr = plan && plan.address || {};
    const root = ynIaRoot(document_);
    if (!root) return intents;
    const claimed = /* @__PURE__ */ new Set();
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
        label: label || ynAdaLabelOf(el, document_) || fieldKey
      });
    };
    const byToken = (token) => root.querySelector(`input[autocomplete="${token}"]`) || null;
    if (ynAdaUsable(c.first_name)) {
      push("contact.first_name", byToken("given-name"), c.first_name, "text", "First name");
    }
    if (ynAdaUsable(c.last_name)) {
      push("contact.last_name", byToken("family-name"), c.last_name, "text", "Last name");
    }
    const nsn = ynIaNationalSignificant(c.phone);
    if (ynAdaUsable(nsn)) {
      const tel = root.querySelector('input[type="tel"][name="phone"]') || byToken("tel");
      push("contact.phone", tel, nsn, "text", "Phone number");
    }
    if (ynAdaUsable(addr.postcode)) {
      push("address.postcode", byToken("postal-code"), addr.postcode, "text", "Postcode");
    }
    if (ynAdaUsable(addr.city)) {
      push("address.city", byToken("address-level2"), addr.city, "text", "City, county");
    }
    if (ynAdaUsable(addr.line1)) {
      push("address.line1", byToken("street-address"), addr.line1, "text", "Street address");
    }
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
    return intents;
  }
  function ynIaStepKey(doc) {
    return `${ynIaHeading(doc)}@${ynIaProgress(doc)}`;
  }
  function ynIaAdvance(doc) {
    const document_ = doc || document;
    const buttons = [...document_.querySelectorAll("button")];
    for (const el of buttons) {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!/^continue$/i.test(text)) continue;
      if (!ynIaVisible(el)) continue;
      if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) continue;
      return el;
    }
    return null;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "indeed",
    plan: ynIndeedApplyPlan,
    scope: (doc) => ynIaRoot(doc),
    wizard: { stepKey: ynIaStepKey, advance: ynIaAdvance }
  });
  globalThis.ynIaRoot = ynIaRoot;
  globalThis.ynIaHeading = ynIaHeading;
  globalThis.ynIaProgress = ynIaProgress;
  globalThis.ynIaVisible = ynIaVisible;
  globalThis.ynIaNationalSignificant = ynIaNationalSignificant;
  globalThis.ynIndeedApplyPlan = ynIndeedApplyPlan;
  globalThis.ynIaStepKey = ynIaStepKey;
  globalThis.ynIaAdvance = ynIaAdvance;
})();
