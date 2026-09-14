(() => {
  // extension/src/adapters/workable/index.js
  async function ynWkWaitForForm(doc) {
    const document_ = doc || document;
    const ready = () => ynAdaFind(document_, 'form[data-ui="application-form"], #firstname');
    const already = ready();
    if (already) return already;
    if (typeof ynWaitFor !== "function") return null;
    try {
      return await ynWaitFor(() => ready() || null, {
        timeoutMs: 4e3,
        root: document_,
        debounceMs: 80
      });
    } catch {
      return null;
    }
  }
  async function ynWorkablePlan(plan, doc) {
    const document_ = doc || document;
    const intents = [];
    const c = plan && plan.contact || {};
    const addr = plan && plan.address || {};
    const claimed = /* @__PURE__ */ new Set();
    await ynWkWaitForForm(document_);
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
        ynAdaFind(document_, '#firstname, input[data-ui="firstname"]'),
        c.first_name,
        "text",
        "First name"
      );
    }
    if (ynAdaUsable(c.last_name)) {
      push(
        "contact.last_name",
        ynAdaFind(document_, '#lastname, input[data-ui="lastname"]'),
        c.last_name,
        "text",
        "Last name"
      );
    }
    if (ynAdaUsable(c.email)) {
      push(
        "contact.email",
        ynAdaFind(document_, '#email, input[data-ui="email"]'),
        c.email,
        "text",
        "Email"
      );
    }
    if (ynAdaUsable(c.phone)) {
      push(
        "contact.phone",
        ynAdaFind(
          document_,
          '[data-ui="phone"] input[name="phone"], form[data-ui="application-form"] input[name="phone"][type="tel"]'
        ),
        c.phone,
        "text",
        "Phone"
      );
    }
    const addrVal = [addr.line1, addr.city, addr.postcode].filter(Boolean).join(", ") || [addr.city, addr.country].filter(Boolean).join(", ") || addr.city || "";
    if (ynAdaUsable(addrVal)) {
      push(
        "address.line1",
        ynAdaFind(document_, '#address, input[data-ui="address"]'),
        addrVal,
        "text",
        "Address"
      );
    }
    if (plan && ynAdaUsable(plan.letter_text)) {
      push(
        "letter_text",
        ynAdaFind(document_, '#cover_letter, textarea[data-ui="cover_letter"]'),
        plan.letter_text,
        "textarea",
        "Cover letter"
      );
    }
    if (plan && plan.cv_url) {
      const fileEl = ynAdaFind(document_, 'input[type="file"][data-ui="resume"]');
      if (fileEl) {
        const dropHost = fileEl.closest && fileEl.closest('[data-role="dropzone"]') || null;
        push("cv_file", fileEl, { file: "cv" }, "file", "Resume");
        const last = intents[intents.length - 1];
        if (last && last.fieldKey === "cv_file") {
          last.uploadMode = "input";
          if (dropHost) {
            last.dropTarget = dropHost;
            last.confirmRoot = dropHost;
          }
          last.confirmTimeoutMs = 3e3;
        }
      }
    }
    const neverFill = [
      ...ynAdaFindAll(
        document_,
        'input[type="checkbox"][name="gdpr"], [data-ui="gdpr"] input[type="checkbox"]'
      ),
      ...ynAdaFindAll(
        document_,
        '[data-ui="eeoc-form"] input, [data-ui="eeoc-form"] select, [data-ui="eeoc-form"] textarea'
      )
    ];
    const skipSeen = /* @__PURE__ */ new Set();
    for (const el of neverFill) {
      if (!el || skipSeen.has(el) || claimed.has(el) || ynAdaIsPassword(el))
        continue;
      const type = (el.type || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(type))
        continue;
      skipSeen.add(el);
      claimed.add(el);
      const tag = (el.tagName || "").toUpperCase();
      intents.push({
        fieldKey: type === "checkbox" ? "consent" : "eeo",
        el,
        value: null,
        kind: tag === "SELECT" ? "select" : tag === "TEXTAREA" ? "textarea" : type === "checkbox" ? "checkbox" : type === "radio" ? "radio" : "text",
        confidence: "exact",
        source: "adapter",
        skip: "eeo",
        label: ynAdaLabelOf(el, document_) || (type === "checkbox" ? "Consent" : "EEO field")
      });
    }
    return intents;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "workable",
    plan: ynWorkablePlan
    // React writes held in live verification (no post-write hydration wipe) —
    // default fast-path hold-check is sufficient; no hydrationWatch.
  });
  globalThis.ynWkWaitForForm = ynWkWaitForForm;
  globalThis.ynWorkablePlan = ynWorkablePlan;
})();
