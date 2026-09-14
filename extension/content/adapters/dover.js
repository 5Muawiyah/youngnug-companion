(() => {
  // extension/src/adapters/dover/index.js
  function ynDoverPlan(plan, doc) {
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
        ynAdaFind(document_, 'input[name="firstName"]'),
        c.first_name,
        "text",
        "First name"
      );
    }
    if (ynAdaUsable(c.last_name)) {
      push(
        "contact.last_name",
        ynAdaFind(document_, 'input[name="lastName"]'),
        c.last_name,
        "text",
        "Last name"
      );
    }
    if (ynAdaUsable(c.email)) {
      push(
        "contact.email",
        ynAdaFind(document_, 'input[name="email"]'),
        c.email,
        "text",
        "Email"
      );
    }
    if (ynAdaUsable(c.phone)) {
      push(
        "contact.phone",
        ynAdaFind(document_, 'input[name="phoneNumber"]'),
        c.phone,
        "text",
        "Phone"
      );
    }
    if (ynAdaUsable(links.linkedin)) {
      push(
        "links.linkedin",
        ynAdaFind(document_, 'input[name="linkedinUrl"]'),
        links.linkedin,
        "text",
        "LinkedIn"
      );
    }
    return intents;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "dover",
    plan: ynDoverPlan
  });
  globalThis.ynDoverPlan = ynDoverPlan;
})();
