(() => {
  // extension/src/adapters/smartrecruiters/index.js
  function ynSrResolveInput(el) {
    if (!el) return null;
    const tag = (el.tagName || "").toUpperCase();
    const type = (el.type || "").toLowerCase();
    if ((tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") && !["hidden", "submit", "button", "image", "reset"].includes(type)) {
      return el;
    }
    if (el.shadowRoot) {
      const inner = el.shadowRoot.querySelector(
        "input:not([type='hidden']):not([type='submit']):not([type='button']), textarea, select"
      );
      if (inner && !ynAdaIsPassword(inner)) return inner;
    }
    const nested = typeof ynQueryDeep === "function" ? ynQueryDeep(
      el,
      "input:not([type='hidden']):not([type='submit']):not([type='button']), textarea, select"
    ) : el.querySelectorAll ? [...el.querySelectorAll("input, textarea, select")] : [];
    for (const n of nested) {
      if (ynAdaIsPassword(n)) continue;
      const t = (n.type || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(t)) continue;
      return n;
    }
    return el;
  }
  function ynSmartRecruitersPlan(plan, doc) {
    const document_ = doc || document;
    const intents = [];
    const c = plan && plan.contact || {};
    const links = plan && plan.links || {};
    const claimed = /* @__PURE__ */ new Set();
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
        label: label || ynAdaLabelOf(el, document_) || fieldKey
      });
    };
    if (ynAdaUsable(c.first_name)) {
      push(
        "contact.first_name",
        ynSrResolveInput(ynAdaFind(document_, "#first-name-input")),
        c.first_name,
        "text",
        "First name"
      );
    }
    if (ynAdaUsable(c.last_name)) {
      push(
        "contact.last_name",
        ynSrResolveInput(ynAdaFind(document_, "#last-name-input")),
        c.last_name,
        "text",
        "Last name"
      );
    }
    if (ynAdaUsable(c.email)) {
      push(
        "contact.email",
        ynSrResolveInput(ynAdaFind(document_, "#email-input")),
        c.email,
        "text",
        "Email"
      );
      push(
        "contact.email_confirm",
        ynSrResolveInput(ynAdaFind(document_, "#confirm-email-input")),
        c.email,
        "text",
        "Confirm email"
      );
    }
    if (ynAdaUsable(links.linkedin)) {
      push(
        "links.linkedin",
        ynSrResolveInput(ynAdaFind(document_, "#linkedin-input")),
        links.linkedin,
        "text",
        "LinkedIn"
      );
    }
    if (ynAdaUsable(links.portfolio)) {
      push(
        "links.portfolio",
        ynSrResolveInput(ynAdaFind(document_, "#website-input")),
        links.portfolio,
        "text",
        "Website"
      );
    }
    if (plan && ynAdaUsable(plan.letter_text)) {
      const msgEl = ynSrResolveInput(
        ynAdaFind(document_, "#hiring-manager-message-input")
      );
      if (msgEl) {
        const tag = (msgEl.tagName || "").toUpperCase();
        push(
          "letter_text",
          msgEl,
          plan.letter_text,
          tag === "TEXTAREA" ? "textarea" : "text",
          "Message to the Hiring Team"
        );
      }
    }
    if (plan && plan.cv_url) {
      const dropHost = ynAdaFind(document_, "spl-dropzone") || ynAdaFind(document_, "spl-file-upload");
      if (dropHost) {
        const fileInner = typeof ynQueryDeep === "function" ? ynQueryDeep(dropHost, 'input[type="file"]')[0] : dropHost.querySelector && dropHost.querySelector('input[type="file"]') || null;
        let dropSurface = dropHost;
        if (dropHost.shadowRoot) {
          dropSurface = dropHost.shadowRoot.querySelector(
            "[class*='drop'], [part*='drop'], [class*='upload'], [role='button'], label, .spl-dropzone__area"
          ) || dropHost.shadowRoot.querySelector("div, section") || dropHost;
        }
        const resumeEl = fileInner || dropHost;
        push("cv_file", resumeEl, { file: "cv" }, "file", "Resume");
        const last = intents[intents.length - 1];
        if (last && last.fieldKey === "cv_file") {
          last.uploadMode = "drop_then_input";
          last.dropTarget = dropSurface;
          last.confirmRoot = dropHost;
          last.confirmSelector = ".spl-file-upload__filename, .spl-dropzone__filename, [class*='file-name'], [class*='filename'], button[aria-label='Remove'], button[aria-label='Remove file']";
          last.confirmTimeoutMs = 3e3;
        }
      }
    }
    return intents;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "smartrecruiters",
    plan: ynSmartRecruitersPlan
  });
  globalThis.ynSrResolveInput = ynSrResolveInput;
  globalThis.ynSmartRecruitersPlan = ynSmartRecruitersPlan;
})();
