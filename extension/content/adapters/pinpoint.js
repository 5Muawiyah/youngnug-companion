(() => {
  // extension/src/adapters/pinpoint/index.js
  var YN_PP_EQUALITY_SEL = "#application_form_equality_monitoring_gender_identity, #application_form_equality_monitoring_race_ethnicity, [id^='application_form_equality_monitoring_'], select[id^='application_form_equality_monitoring_']";
  function ynPinpointPlan(plan, doc) {
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
        ynAdaFind(document_, "#application_form_application_first_name"),
        c.first_name,
        "text",
        "First name"
      );
    }
    if (ynAdaUsable(c.last_name)) {
      push(
        "contact.last_name",
        ynAdaFind(document_, "#application_form_application_last_name"),
        c.last_name,
        "text",
        "Last name"
      );
    }
    if (ynAdaUsable(c.email)) {
      push(
        "contact.email",
        ynAdaFind(document_, "#application_form_application_email"),
        c.email,
        "text",
        "Email"
      );
    }
    if (ynAdaUsable(c.phone)) {
      push(
        "contact.phone",
        ynAdaFind(document_, "#application_form_application_phone"),
        c.phone,
        "text",
        "Phone"
      );
    }
    if (ynAdaUsable(links.linkedin)) {
      push(
        "links.linkedin",
        ynAdaFind(document_, "#application_form_application_linkedin_url"),
        links.linkedin,
        "text",
        "LinkedIn"
      );
    }
    if (plan && plan.cv_url) {
      const cv = ynAdaFind(
        document_,
        'input[name="application_form[application][cv]"][type="file"]'
      );
      if (cv) {
        push("cv_file", cv, { file: "cv" }, "file", "CV");
        const last = intents[intents.length - 1];
        if (last && last.fieldKey === "cv_file") {
          last.uploadMode = "input";
          last.confirmSelector = "[class*='filename'], [class*='file-name']";
          last.confirmTimeoutMs = 3e3;
        }
      }
    }
    if (plan && ynAdaUsable(plan.letter_text)) {
      push(
        "letter_text",
        ynAdaFind(document_, "#personal-summary"),
        plan.letter_text,
        "textarea",
        "Summary"
      );
    }
    const eqFields = ynAdaFindAll(document_, YN_PP_EQUALITY_SEL);
    const eqSeen = /* @__PURE__ */ new Set();
    for (const el of eqFields) {
      if (!el || eqSeen.has(el) || claimed.has(el) || ynAdaIsPassword(el)) {
        continue;
      }
      const tag = (el.tagName || "").toUpperCase();
      if (!/^(SELECT|INPUT|TEXTAREA)$/.test(tag)) continue;
      const type = (el.type || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(type)) {
        continue;
      }
      eqSeen.add(el);
      claimed.add(el);
      intents.push({
        fieldKey: "eeo",
        el,
        value: null,
        kind: tag === "SELECT" ? "select" : tag === "TEXTAREA" ? "textarea" : "text",
        confidence: "exact",
        source: "adapter",
        skip: "sensitive",
        label: ynAdaLabelOf(el, document_) || "Equality monitoring"
      });
    }
    return intents;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "pinpoint",
    plan: ynPinpointPlan
  });
  globalThis.YN_PP_EQUALITY_SEL = YN_PP_EQUALITY_SEL;
  globalThis.ynPinpointPlan = ynPinpointPlan;
})();
