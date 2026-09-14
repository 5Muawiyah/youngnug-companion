(() => {
  // extension/src/adapters/workday/field_helpers.js
  function ynWdByAutomation(doc, automationId) {
    if (!automationId) return null;
    let el = null;
    try {
      el = ynAdaFind(doc, `[data-automation-id="${CSS.escape(automationId)}"]`);
    } catch {
      el = ynAdaFind(doc, `[data-automation-id="${automationId}"]`);
    }
    if (!el) return null;
    return ynWdResolveControl(el);
  }
  function ynWdResolveControl(el) {
    if (!el) return null;
    if (ynAdaIsPassword(el)) return null;
    const tag = (el.tagName || "").toUpperCase();
    const type = (el.type || "").toLowerCase();
    if ((tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") && !["hidden", "submit", "button", "image", "reset"].includes(type)) {
      return el;
    }
    const role = (el.getAttribute("role") || "").toLowerCase();
    if (role === "combobox" || role === "button" || role === "listbox") {
      const nested = el.querySelector && el.querySelector(
        'input:not([type="hidden"]):not([type="password"]), textarea, [role="combobox"]'
      );
      if (nested && !ynAdaIsPassword(nested)) return nested;
      return el;
    }
    const inner = el.querySelector && el.querySelector(
      'input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="button"]), textarea, select, [role="combobox"]'
    ) || null;
    if (inner && !ynAdaIsPassword(inner)) return inner;
    const file = el.querySelector && el.querySelector('input[type="file"]');
    if (file) return file;
    return null;
  }
  function ynWdIsAccountWall(doc) {
    const document_ = doc || document;
    const href = typeof location !== "undefined" && location.href || document_ && document_.URL || "";
    if (typeof ynPageIsAccountCreation === "function" && ynPageIsAccountCreation(document_, href)) {
      return true;
    }
    if (/\/apply\/applymanually/i.test(href) || /createaccount/i.test(href)) {
      return true;
    }
    if (ynAdaFind(document_, '[data-automation-id="createAccountCheckbox"]')) {
      return true;
    }
    if (ynAdaFind(
      document_,
      '[data-automation-id="signInForm"], [data-automation-id="signIn"]'
    )) {
      return true;
    }
    const forms = ynAdaFindAll(document_, "form[data-automation-id]");
    for (const f of forms) {
      const aid = f.getAttribute("data-automation-id") || "";
      if (/signin|createaccount/i.test(aid)) return true;
    }
    const clickables = ynAdaFindAll(
      document_,
      'button, input[type="submit"], input[type="button"], [role="button"]'
    );
    for (const el of clickables) {
      const t = [
        el.textContent,
        el.value,
        el.getAttribute && el.getAttribute("aria-label"),
        el.getAttribute && el.getAttribute("data-automation-id")
      ].filter(Boolean).join(" ");
      if (/create\s+account/i.test(t)) return true;
    }
    const passwords = ynAdaFindAll(document_, 'input[type="password"]');
    if (passwords.length >= 1) {
      let pageText = "";
      try {
        pageText = (document_.body && document_.body.innerText || "").slice(
          0,
          6e3
        );
      } catch {
        pageText = "";
      }
      if (/create\s+account/i.test(pageText)) {
        if (passwords.length >= 2) return true;
        for (const p of passwords) {
          const sig = [
            typeof ynAdaLabelOf === "function" ? ynAdaLabelOf(p, document_) : "",
            p.name || "",
            p.id || "",
            p.getAttribute("autocomplete") || "",
            p.getAttribute("aria-label") || ""
          ].join(" ").toLowerCase();
          if (/verify|confirm|re-?enter|re-?type|repeat|new.?password/i.test(sig)) {
            return true;
          }
        }
      }
    }
    const pwd = passwords[0] || ynAdaFind(document_, 'input[type="password"]');
    if (pwd) {
      const hasLegalName = ynWdByAutomation(document_, "legalNameSection_firstName") || ynWdByAutomation(document_, "legalNameSection_lastName");
      if (!hasLegalName) return true;
    }
    return false;
  }
  function ynWdResumeTarget(doc) {
    const byId = ynWdByAutomation(doc, "file-upload-input-ref");
    if (byId) return byId;
    const fileInputs = ynAdaFindAll(doc, 'input[type="file"]');
    for (const f of fileInputs) {
      const aid = (f.getAttribute("data-automation-id") || "").toLowerCase();
      const near = f.closest && f.closest("[data-automation-id]") && f.closest("[data-automation-id]").getAttribute("data-automation-id") || "";
      if (/file|upload|resume|cv/i.test(aid + " " + near)) return f;
    }
    if (fileInputs[0]) return fileInputs[0];
    const selectFiles = ynAdaFindAll(doc, "button, [role='button'], a").find(
      (el) => /select\s*files|upload\s*(resume|cv|file)/i.test(
        (el.textContent || "") + " " + (el.getAttribute("aria-label") || "")
      )
    );
    return selectFiles || null;
  }
  function ynWdEeoSkipIntents(doc, claimed) {
    const intents = [];
    const all = ynAdaFindAll(doc, "[data-automation-id]");
    const roots = [];
    for (const el of all) {
      const aid = el.getAttribute("data-automation-id") || "";
      if (/disclosure|selfidentification|self.?identif|veteran|disability|eeo|gender|ethnicity|race|hispanic/i.test(
        aid
      )) {
        roots.push(el);
      }
    }
    const eeoSeen = /* @__PURE__ */ new Set();
    for (const root of roots) {
      const fields = root.matches && root.matches(
        "input, select, textarea, [role='combobox'], [role='listbox']"
      ) ? [root] : [
        ...ynAdaFindAll(
          root,
          "input, select, textarea, [role='combobox'], [role='listbox'], [role='radio'], [role='checkbox']"
        )
      ];
      if (root.matches && !root.matches("input, select, textarea") && fields.length === 0) {
      }
      for (const el of fields) {
        if (!el || eeoSeen.has(el) || claimed.has(el) || ynAdaIsPassword(el))
          continue;
        const type = (el.type || "").toLowerCase();
        if (["hidden", "submit", "button", "image", "reset"].includes(type))
          continue;
        eeoSeen.add(el);
        claimed.add(el);
        const tag = (el.tagName || "").toUpperCase();
        intents.push({
          fieldKey: "eeo",
          el,
          value: null,
          kind: tag === "SELECT" ? "select" : tag === "TEXTAREA" ? "textarea" : el.getAttribute("role") === "combobox" ? "combobox" : "text",
          confidence: "exact",
          source: "adapter",
          skip: "eeo",
          label: ynAdaLabelOf(el, doc) || "EEO / disclosure field"
        });
      }
    }
    return intents;
  }
  function ynWdKindOf(el) {
    if (!el) return "text";
    const tag = (el.tagName || "").toUpperCase();
    const type = (el.type || "").toLowerCase();
    if (type === "file") return "file";
    if (tag === "TEXTAREA") return "textarea";
    if (tag === "SELECT") return "select";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    const role = (el.getAttribute("role") || "").toLowerCase();
    if (role === "combobox" || el.getAttribute("aria-haspopup") === "listbox" || el.getAttribute("aria-autocomplete") === "list") {
      return "combobox";
    }
    if (role === "button" && /prompt|dropdown|select/i.test(el.getAttribute("data-automation-id") || "")) {
      return "combobox";
    }
    return "text";
  }

  // extension/src/adapters/workday/plan.js
  async function ynWorkdayPlan(plan, doc) {
    const document_ = doc || document;
    const intents = [];
    const c = plan && plan.contact || {};
    const addr = plan && plan.address || {};
    const claimed = /* @__PURE__ */ new Set();
    if (ynWdIsAccountWall(document_)) {
      return [];
    }
    const push = (fieldKey, el, value, kind, label) => {
      if (!el || claimed.has(el) || ynAdaIsPassword(el)) return;
      if (value == null || value === "") return;
      if (typeof value === "string" && /\[CONFIRM/i.test(value)) return;
      claimed.add(el);
      intents.push({
        fieldKey,
        el,
        value,
        kind: kind || ynWdKindOf(el) || "text",
        confidence: "exact",
        source: "adapter",
        label: label || ynAdaLabelOf(el, document_) || fieldKey
      });
    };
    if (ynAdaUsable(c.first_name)) {
      push(
        "contact.first_name",
        ynWdByAutomation(document_, "legalNameSection_firstName"),
        c.first_name,
        "text",
        "First name"
      );
    }
    if (ynAdaUsable(c.last_name)) {
      push(
        "contact.last_name",
        ynWdByAutomation(document_, "legalNameSection_lastName"),
        c.last_name,
        "text",
        "Last name"
      );
    }
    if (ynAdaUsable(c.email)) {
      push(
        "contact.email",
        ynWdByAutomation(document_, "email"),
        c.email,
        "text",
        "Email"
      );
    }
    if (ynAdaUsable(c.phone)) {
      const phoneEl = ynWdByAutomation(document_, "phone-number") || ynWdByAutomation(document_, "phoneNumber");
      push("contact.phone", phoneEl, c.phone, "text", "Phone");
    }
    if (ynAdaUsable(addr.line1)) {
      push(
        "address.line1",
        ynWdByAutomation(document_, "addressSection_addressLine1"),
        addr.line1,
        "text",
        "Address line 1"
      );
    }
    if (ynAdaUsable(addr.city)) {
      push(
        "address.city",
        ynWdByAutomation(document_, "addressSection_city"),
        addr.city,
        "text",
        "City"
      );
    }
    if (ynAdaUsable(addr.postcode)) {
      push(
        "address.postcode",
        ynWdByAutomation(document_, "addressSection_postalCode"),
        addr.postcode,
        "text",
        "Postal code"
      );
    }
    if (ynAdaUsable(addr.country)) {
      const countryEl = ynWdByAutomation(document_, "country");
      if (countryEl) {
        push("address.country", countryEl, addr.country, "combobox", "Country");
      }
    }
    const sourceAnswer = plan && plan.answers && (plan.answers.source || plan.answers.how_heard) || null;
    if (ynAdaUsable(sourceAnswer)) {
      const sourceEl = ynWdByAutomation(document_, "source");
      if (sourceEl) {
        push("answers.source", sourceEl, sourceAnswer, "combobox", "Source");
      }
    }
    if (plan && plan.cv_url) {
      const resumeEl = ynWdResumeTarget(document_);
      push("cv_file", resumeEl, { file: "cv" }, "file", "Resume");
    }
    const eeoIntents = ynWdEeoSkipIntents(document_, claimed);
    for (const intent of eeoIntents) intents.push(intent);
    if (typeof ynRepeaterExpand === "function") {
      const history = await ynWdHistoryIntents(plan, document_, claimed);
      for (const intent of history.intents) intents.push(intent);
    }
    return intents;
  }
  var YN_WD_HISTORY_ROW_SEL = '[data-automation-id="Job-History-Panel-Set-Item"]';
  async function ynWdHistoryIntents(plan, doc, claimed) {
    const document_ = doc || document;
    const work = plan && Array.isArray(plan.work) && plan.work || [];
    const intents = [];
    if (!work.length) return { intents, report: null };
    const section = ynAdaFind(document_, '[data-automation-id="Work-experience-section"]') || ynAdaFind(document_, '[data-automation-id*="workExperience" i]') || null;
    if (!section) return { intents, report: null };
    const result = await ynRepeaterExpand({
      root: section,
      doc: document_,
      rowSelector: YN_WD_HISTORY_ROW_SEL,
      needed: work.length
    });
    const push = (fieldKey, el, value, kind, label) => {
      if (!el || claimed.has(el) || ynAdaIsPassword(el)) return;
      if (value == null || value === "") return;
      claimed.add(el);
      intents.push({
        fieldKey,
        el,
        value,
        kind: kind || "text",
        confidence: "guessed",
        source: "adapter",
        label: label || fieldKey
      });
    };
    result.rows.forEach((rowEl, index) => {
      const entry = work[index];
      if (!entry) return;
      push(
        `work.${index}.employer`,
        ynWdByAutomation(rowEl, "companyName"),
        entry.employer,
        "text",
        "Employer"
      );
      push(
        `work.${index}.title`,
        ynWdByAutomation(rowEl, "jobTitle"),
        entry.title,
        "text",
        "Job title"
      );
      push(
        `work.${index}.description`,
        ynWdByAutomation(rowEl, "roleDescription"),
        entry.description,
        "textarea",
        "Role description"
      );
      if (entry.current) {
        const cur = ynWdByAutomation(rowEl, "currentlyWorkHere");
        if (cur && !claimed.has(cur) && (cur.type || "").toLowerCase() === "checkbox") {
          claimed.add(cur);
          intents.push({
            fieldKey: `work.${index}.current`,
            el: cur,
            value: true,
            kind: "checkbox",
            confidence: "guessed",
            source: "adapter",
            label: "Currently work here"
          });
        }
      }
    });
    return {
      intents,
      report: {
        rows: result.rows.length,
        clicked: result.clicked,
        couldNotAdd: result.couldNotAdd,
        capped: result.capped
      }
    };
  }

  // extension/src/adapters/workday/wizard.js
  var YN_WD_PROGRESS_RE = /(?:current\s+)?step\s+(\d+)\s+of\s+(\d+)\s*(.*)$/i;
  function ynWdProgressStep(doc) {
    const document_ = doc || document;
    const bar = ynAdaFind(document_, '[data-automation-id="progressBar"]');
    const active = ynAdaFind(
      document_,
      '[data-automation-id="progressBarActiveStep"]'
    );
    if (!bar && !active) return null;
    const text = (active && active.textContent || "").trim();
    const m = YN_WD_PROGRESS_RE.exec(text);
    if (!m) return null;
    return {
      index: parseInt(m[1], 10),
      total: parseInt(m[2], 10),
      name: (m[3] || "").trim()
    };
  }
  function ynWdStepKey(doc) {
    const document_ = doc || document;
    if (ynWdIsAccountWall(document_)) return "account_wall";
    const progress = ynWdProgressStep(document_);
    if (progress && progress.name) {
      return `${progress.name}@${progress.index}of${progress.total}`;
    }
    const heading = ynAdaFind(
      document_,
      '[data-automation-id="pageHeaderTitleText"], h2[data-automation-id], h1[data-automation-id]'
    );
    if (heading) {
      const t = (heading.textContent || "").trim().slice(0, 60);
      if (t) return t;
    }
    if (ynWdByAutomation(document_, "legalNameSection_firstName"))
      return "my_information";
    if (ynAdaFind(
      document_,
      '[data-automation-id*="Disclosure"], [data-automation-id*="selfIdentification"]'
    )) {
      return "disclosures";
    }
    const body = document_.body && document_.body.innerText || "";
    if (/my experience/i.test(body)) return "my_experience";
    if (/application questions/i.test(body)) return "application_questions";
    if (/review/i.test(body) && /submit/i.test(body)) return "review";
    return "step";
  }
  function ynWdAdvance(doc) {
    const document_ = doc || document;
    const candidates = [];
    const byIds = ["bottom-navigation-next-button", "pageFooterNextButton"];
    for (const id of byIds) {
      const el = ynWdByAutomation(document_, id) || ynAdaFind(document_, `[data-automation-id="${id}"]`);
      if (el) candidates.push(el);
    }
    if (!candidates.length) {
      const buttons = ynAdaFindAll(
        document_,
        'button, [role="button"], a[role="button"]'
      );
      for (const b of buttons) {
        const text = ((b.textContent || "") + " " + (b.getAttribute("aria-label") || "") + " " + (b.getAttribute("data-automation-id") || "")).trim();
        if (/save\s*and\s*continue|^\s*next\s*$|continue/i.test(text)) {
          candidates.push(b);
        }
      }
    }
    for (const el of candidates) {
      if (!el) continue;
      const sig = [
        el.getAttribute && el.getAttribute("data-automation-id"),
        el.textContent,
        el.value,
        el.getAttribute && el.getAttribute("aria-label"),
        el.getAttribute && el.getAttribute("name")
      ].filter(Boolean).join(" ");
      if (/submit|send application|apply now|finish|complete application/i.test(sig)) {
        continue;
      }
      if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) {
        continue;
      }
      return el;
    }
    return null;
  }

  // extension/src/adapters/workday/index.js
  globalThis.ynWdByAutomation = ynWdByAutomation;
  globalThis.ynWdResolveControl = ynWdResolveControl;
  globalThis.ynWdIsAccountWall = ynWdIsAccountWall;
  globalThis.ynWdResumeTarget = ynWdResumeTarget;
  globalThis.ynWdEeoSkipIntents = ynWdEeoSkipIntents;
  globalThis.ynWdKindOf = ynWdKindOf;
  globalThis.ynWorkdayPlan = ynWorkdayPlan;
  globalThis.YN_WD_HISTORY_ROW_SEL = YN_WD_HISTORY_ROW_SEL;
  globalThis.ynWdHistoryIntents = ynWdHistoryIntents;
  globalThis.YN_WD_PROGRESS_RE = YN_WD_PROGRESS_RE;
  globalThis.ynWdProgressStep = ynWdProgressStep;
  globalThis.ynWdStepKey = ynWdStepKey;
  globalThis.ynWdAdvance = ynWdAdvance;
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  globalThis.YN_ADAPTERS.push({
    id: "workday",
    plan: ynWorkdayPlan,
    wizard: {
      stepKey: ynWdStepKey,
      advance: ynWdAdvance
    }
  });
})();
