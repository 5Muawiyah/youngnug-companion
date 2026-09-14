(() => {
  // extension/src/adapters/greenhouse/index.js
  function ynGhContact(plan) {
    return plan && plan.contact || {};
  }
  function ynGreenhousePlan(plan, doc) {
    const document_ = doc || document;
    const intents = [];
    const c = ynGhContact(plan);
    const addr = plan && plan.address || {};
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
        ynAdaFind(document_, "#first_name"),
        c.first_name,
        "text",
        "First name"
      );
    }
    if (ynAdaUsable(c.last_name)) {
      push(
        "contact.last_name",
        ynAdaFind(document_, "#last_name"),
        c.last_name,
        "text",
        "Last name"
      );
    }
    if (ynAdaUsable(c.email)) {
      push(
        "contact.email",
        ynAdaFind(document_, "#email"),
        c.email,
        "text",
        "Email"
      );
    }
    if (ynAdaUsable(c.phone)) {
      push(
        "contact.phone",
        ynAdaFind(document_, "#phone"),
        c.phone,
        "text",
        "Phone"
      );
    }
    const locVal = [addr.city, addr.country].filter(Boolean).join(", ") || addr.city || addr.line1 || "";
    if (ynAdaUsable(locVal)) {
      const locEl = ynAdaFind(document_, "#candidate-location");
      if (locEl && (locEl.getAttribute("role") === "combobox" || locEl.tagName)) {
        push(
          "address.city",
          locEl,
          locVal,
          locEl.getAttribute("role") === "combobox" ? "combobox" : "text",
          "Location (City)"
        );
      }
    }
    const edu0 = plan && Array.isArray(plan.education) && plan.education[0] || {};
    const pushGuessed = (fieldKey, el, value, kind, label) => {
      if (!el || claimed.has(el) || ynAdaIsPassword(el)) return;
      if (value == null || value === "") return;
      if (typeof value === "string" && /\[CONFIRM/i.test(value)) return;
      claimed.add(el);
      intents.push({
        fieldKey,
        el,
        value,
        kind: kind || "text",
        confidence: "guessed",
        source: "adapter",
        label: label || ynAdaLabelOf(el, document_) || fieldKey
      });
    };
    if (ynAdaUsable(edu0.institution)) {
      pushGuessed(
        "education.0.institution",
        ynAdaFind(document_, "#school"),
        edu0.institution,
        "text",
        "School"
      );
    }
    if (ynAdaUsable(edu0.qualification)) {
      pushGuessed(
        "education.0.qualification",
        ynAdaFind(document_, "#degree"),
        edu0.qualification,
        "text",
        "Degree"
      );
    }
    if (ynAdaUsable(edu0.subject)) {
      pushGuessed(
        "education.0.subject",
        ynAdaFind(document_, "#discipline"),
        edu0.subject,
        "text",
        "Discipline"
      );
    }
    if (plan && plan.cv_url) {
      const resume = ynAdaFind(document_, "#resume, input[type='file']#resume");
      if (resume) {
        const wrap = resume.closest && resume.closest(".file-upload") || null;
        push("cv_file", resume, { file: "cv" }, "file", "Resume");
        const last = intents[intents.length - 1];
        if (last && last.fieldKey === "cv_file") {
          last.uploadMode = "input";
          last.dropTarget = wrap;
          last.confirmRoot = wrap;
          last.confirmSelector = ".file-upload__filename";
          last.confirmTimeoutMs = 3e3;
        }
      }
    }
    if (plan && plan.letter_url) {
      const clFile = ynAdaFind(
        document_,
        "#cover_letter, input[type='file']#cover_letter"
      );
      if (clFile && (clFile.type || "").toLowerCase() === "file") {
        const wrap = clFile.closest && clFile.closest(".file-upload") || null;
        push("letter_file", clFile, { file: "letter" }, "file", "Cover letter");
        const last = intents[intents.length - 1];
        if (last && last.fieldKey === "letter_file") {
          last.uploadMode = "input";
          last.dropTarget = wrap;
          last.confirmRoot = wrap;
          last.confirmSelector = ".file-upload__filename";
          last.confirmTimeoutMs = 3e3;
        }
      }
    }
    if (plan && ynAdaUsable(plan.letter_text)) {
      const clText = ynAdaFind(document_, "textarea#cover_letter") || ynAdaFind(document_, "textarea[id*='cover_letter']") || ynAdaFind(document_, "textarea[name*='cover_letter']");
      if (clText && (clText.tagName || "").toUpperCase() === "TEXTAREA") {
        push("letter_text", clText, plan.letter_text, "textarea", "Cover letter");
      }
    }
    const eeoRoots = ynAdaFindAll(
      document_,
      ".eeoc__question__wrapper, #gender, #hispanic_ethnicity"
    );
    const eeoSeen = /* @__PURE__ */ new Set();
    for (const node of eeoRoots) {
      const fields = node.matches && (node.matches("input, select, textarea") || /^(INPUT|SELECT|TEXTAREA)$/i.test(node.tagName)) ? [node] : ynAdaFindAll(node, "input, select, textarea");
      for (const el of fields) {
        if (!el || eeoSeen.has(el) || claimed.has(el) || ynAdaIsPassword(el))
          continue;
        const type = (el.type || "").toLowerCase();
        if (["hidden", "submit", "button", "image", "reset"].includes(type))
          continue;
        eeoSeen.add(el);
        claimed.add(el);
        intents.push({
          fieldKey: "eeo",
          el,
          value: null,
          kind: (el.tagName || "").toUpperCase() === "SELECT" ? "select" : (el.tagName || "").toUpperCase() === "TEXTAREA" ? "textarea" : "text",
          confidence: "exact",
          source: "adapter",
          skip: "eeo",
          label: ynAdaLabelOf(el, document_) || "EEO field"
        });
      }
    }
    return intents;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "greenhouse",
    plan: ynGreenhousePlan
  });
  globalThis.ynGhContact = ynGhContact;
  globalThis.ynGreenhousePlan = ynGreenhousePlan;
})();
