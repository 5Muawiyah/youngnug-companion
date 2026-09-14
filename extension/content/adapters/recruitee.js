(() => {
  // extension/src/adapters/recruitee/index.js
  function ynRcFullName(plan) {
    const c = plan && plan.contact || {};
    const joined = [c.first_name, c.last_name].filter(Boolean).join(" ");
    return joined || c.full_name || c.name || "";
  }
  function ynRecruiteePlan(plan, doc) {
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
    const fullName = ynRcFullName(plan);
    if (ynAdaUsable(fullName)) {
      push(
        "contact.full_name",
        ynAdaFind(
          document_,
          'input[name="candidate.name"], #input-candidate\\.name-undefined'
        ),
        fullName,
        "text",
        "Full name"
      );
    }
    if (ynAdaUsable(c.email)) {
      push(
        "contact.email",
        ynAdaFind(
          document_,
          'input[name="candidate.email"], #input-candidate\\.email-undefined'
        ),
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
          'input[name="candidate.phone"], #input-candidate\\.phone-undefined'
        ),
        c.phone,
        "text",
        "Phone"
      );
    }
    if (plan && plan.cv_url) {
      const cv = ynAdaFind(
        document_,
        'input[name="candidate.cv"][type="file"], input[name="candidate.cv"], #input-candidate\\.cv-undefined'
      );
      if (cv && (cv.type || "").toLowerCase() === "file") {
        const wrap = cv.closest && cv.closest(
          "form, fieldset, [class*='upload'], [class*='file'], label, div"
        ) || null;
        push("cv_file", cv, { file: "cv" }, "file", "CV");
        const last = intents[intents.length - 1];
        if (last && last.fieldKey === "cv_file") {
          last.uploadMode = "input";
          last.dropTarget = wrap;
          last.confirmRoot = wrap;
          last.confirmSelector = "[class*='filename'], [class*='file-name'], [class*='uploaded']";
          last.confirmTimeoutMs = 3e3;
        }
      }
    }
    if (plan && plan.letter_url) {
      const cl = ynAdaFind(
        document_,
        'input[name="candidate.coverLetterFile"][type="file"], input[name="candidate.coverLetterFile"], #input-candidate\\.coverLetterFile-undefined'
      );
      if (cl && (cl.type || "").toLowerCase() === "file") {
        const wrap = cl.closest && cl.closest(
          "form, fieldset, [class*='upload'], [class*='file'], label, div"
        ) || null;
        push("letter_file", cl, { file: "letter" }, "file", "Cover letter");
        const last = intents[intents.length - 1];
        if (last && last.fieldKey === "letter_file") {
          last.uploadMode = "input";
          last.dropTarget = wrap;
          last.confirmRoot = wrap;
          last.confirmSelector = "[class*='filename'], [class*='file-name'], [class*='uploaded']";
          last.confirmTimeoutMs = 3e3;
        }
      }
    }
    const consentSel = 'input[name^="candidate.agreements."][name$=".consent"][type="checkbox"], input[name="candidate.textingConsent"][type="checkbox"], input[name*="agreements"][name*="consent"][type="checkbox"]';
    const consentFields = ynAdaFindAll(document_, consentSel);
    const consentSeen = /* @__PURE__ */ new Set();
    for (const el of consentFields) {
      if (!el || consentSeen.has(el) || claimed.has(el) || ynAdaIsPassword(el))
        continue;
      if ((el.type || "").toLowerCase() !== "checkbox") continue;
      consentSeen.add(el);
      claimed.add(el);
      intents.push({
        fieldKey: "consent",
        el,
        value: null,
        kind: "checkbox",
        confidence: "exact",
        source: "adapter",
        skip: "eeo",
        label: ynAdaLabelOf(el, document_) || el.name || "Consent"
      });
    }
    return intents;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "recruitee",
    plan: ynRecruiteePlan,
    // React SSR hydration can replace/clear the inputs after the initial write —
    // the filler watches the full re-assert window (no early break).
    hydrationWatch: true
  });
  globalThis.ynRcFullName = ynRcFullName;
  globalThis.ynRecruiteePlan = ynRecruiteePlan;
})();
