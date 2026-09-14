(() => {
  // extension/src/adapters/icims/index.js
  function ynIcimsPlan(plan, doc) {
    const document_ = doc || document;
    const intents = [];
    const c = plan && plan.contact || {};
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
    if (ynAdaUsable(c.email)) {
      push(
        "contact.email",
        ynAdaFind(
          document_,
          '#email, input[name="css_loginName"][type="email"], input[name="css_loginName"]'
        ),
        c.email,
        "text",
        "Email"
      );
    }
    if (ynAdaUsable(c.phone)) {
      push(
        "contact.phone",
        ynAdaFind(document_, '#phoneNumber, input[name="css_phoneNumber"]'),
        c.phone,
        "text",
        "Phone"
      );
    }
    return intents;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "icims",
    plan: ynIcimsPlan
  });
  globalThis.ynIcimsPlan = ynIcimsPlan;
})();
