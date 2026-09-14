(() => {
  // extension/src/adapters/personio/index.js
  function ynPersonioPlan(plan, doc) {
    const document_ = doc || document;
    const intents = [];
    const c = plan && plan.contact || {};
    const answers = plan && plan.answers || {};
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
        ynAdaFind(document_, "#field-first_name"),
        c.first_name,
        "text",
        "First name"
      );
    }
    if (ynAdaUsable(c.last_name)) {
      push(
        "contact.last_name",
        ynAdaFind(document_, "#field-last_name"),
        c.last_name,
        "text",
        "Last name"
      );
    }
    if (ynAdaUsable(c.email)) {
      push(
        "contact.email",
        ynAdaFind(document_, "#field-email"),
        c.email,
        "text",
        "Email"
      );
    }
    if (ynAdaUsable(c.phone)) {
      push(
        "contact.phone",
        ynAdaFind(document_, "#field-phone"),
        c.phone,
        "text",
        "Phone"
      );
    }
    if (ynAdaUsable(answers.earliest_start)) {
      push(
        "answers.earliest_start",
        ynAdaFind(document_, "#field-available_from"),
        answers.earliest_start,
        "text",
        "Available from"
      );
    }
    if (ynAdaUsable(answers.salary_expectation)) {
      push(
        "answers.salary_expectation",
        ynAdaFind(document_, "#field-salary_expectations"),
        answers.salary_expectation,
        "text",
        "Salary expectations"
      );
    }
    if (plan && plan.cv_url) {
      const cv = ynAdaFind(document_, "#doc-input-cv");
      if (cv) {
        push("cv_file", cv, { file: "cv" }, "file", "CV");
        const last = intents[intents.length - 1];
        if (last && last.fieldKey === "cv_file") {
          last.uploadMode = "input";
          const wrap = cv.closest && cv.closest("div");
          last.dropTarget = wrap || null;
          last.confirmRoot = wrap || null;
          last.confirmSelector = "[class*='filename'], [class*='file-name']";
          last.confirmTimeoutMs = 3e3;
        }
      }
    }
    if (plan && plan.letter_url) {
      const other = ynAdaFind(document_, "#doc-input-other");
      if (other) {
        push("letter_file", other, { file: "letter" }, "file", "Other document");
        const last = intents[intents.length - 1];
        if (last && last.fieldKey === "letter_file") {
          last.uploadMode = "input";
          const wrap = other.closest && other.closest("div");
          last.dropTarget = wrap || null;
          last.confirmRoot = wrap || null;
          last.confirmSelector = "[class*='filename'], [class*='file-name']";
          last.confirmTimeoutMs = 3e3;
        }
      }
    }
    return intents;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "personio",
    plan: ynPersonioPlan
  });
  globalThis.ynPersonioPlan = ynPersonioPlan;
})();
