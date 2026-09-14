(() => {
  // extension/src/adapters/indeed_employer/field_helpers.js
  var YN_IE_SPONSOR_SIGNAL_RE = /budget|sponsor|daily\s*(spend|amount)|per\s*day|per[-\s]?click|cost\s*per/i;
  function ynIeSignal(el, doc) {
    if (!el) return "";
    let placeholder = "";
    try {
      placeholder = String(el.getAttribute("placeholder") || "");
    } catch {
      placeholder = "";
    }
    let aria = "";
    try {
      aria = String(el.getAttribute("aria-label") || "");
    } catch {
      aria = "";
    }
    const label = typeof ynAdaLabelOf === "function" ? ynAdaLabelOf(el, doc) : "";
    return [label, aria, placeholder, el.name || "", el.id || ""].join(" ").replace(/\s+/g, " ").trim();
  }
  function ynIeFillableFields(doc) {
    const document_ = doc || document;
    let fields = [];
    try {
      fields = typeof ynQueryDeep === "function" ? ynQueryDeep(document_, "input, textarea, select") : [...document_.querySelectorAll("input, textarea, select")];
    } catch {
      fields = [];
    }
    return fields.filter((el) => {
      if (!el) return false;
      const type = (el.type || "").toLowerCase();
      if ([
        "hidden",
        "submit",
        "button",
        "image",
        "reset",
        "password",
        "file"
      ].includes(type)) {
        return false;
      }
      if (typeof ynAdaIsPassword === "function" && ynAdaIsPassword(el)) {
        return false;
      }
      return true;
    });
  }
  function ynIeSponsorshipField(doc) {
    const document_ = doc || document;
    for (const el of ynIeFillableFields(document_)) {
      try {
        if (typeof ynIsHoneypot === "function" && ynIsHoneypot(el, document_)) {
          continue;
        }
      } catch {
        continue;
      }
      const signal = ynIeSignal(el, document_);
      if (signal && YN_IE_SPONSOR_SIGNAL_RE.test(signal)) return el;
    }
    return null;
  }
  function ynIeFind(doc, selectors, labelRe, claimed) {
    const document_ = doc || document;
    for (const sel of selectors || []) {
      let el = null;
      try {
        el = typeof ynAdaFind === "function" ? ynAdaFind(document_, sel) : document_.querySelector(sel);
      } catch {
        el = null;
      }
      if (el && !claimed.has(el)) {
        if (typeof ynAdaIsPassword === "function" && ynAdaIsPassword(el)) {
          continue;
        }
        return el;
      }
    }
    if (labelRe) {
      for (const el of ynIeFillableFields(document_)) {
        if (claimed.has(el)) continue;
        const signal = ynIeSignal(el, document_);
        if (signal && labelRe.test(signal)) {
          if (typeof ynIsPaymentField === "function" && ynIsPaymentField(el, document_)) {
            continue;
          }
          if (YN_IE_SPONSOR_SIGNAL_RE.test(signal)) continue;
          return el;
        }
      }
    }
    return null;
  }
  function ynIeKindOf(el) {
    if (!el) return "text";
    const tag = (el.tagName || "").toUpperCase();
    if (tag === "TEXTAREA") return "textarea";
    if (tag === "SELECT") return "select";
    const type = (el.type || "").toLowerCase();
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    let role = "";
    try {
      role = String(
        el.getAttribute && el.getAttribute("role") || ""
      ).toLowerCase();
    } catch {
      role = "";
    }
    if (role === "combobox" || el.getAttribute && el.getAttribute("aria-haspopup") === "listbox" || el.getAttribute && el.getAttribute("aria-autocomplete") === "list") {
      return "combobox";
    }
    return "text";
  }

  // extension/src/adapters/indeed_employer/plan.js
  function ynIndeedEmployerPlan(plan, doc) {
    const document_ = doc || document;
    const intents = [];
    const claimed = /* @__PURE__ */ new Set();
    const p = plan || {};
    const push = (fieldKey, el, value, kind, label) => {
      if (!el || claimed.has(el)) return;
      if (value == null || value === "") return;
      claimed.add(el);
      intents.push({
        fieldKey,
        el,
        value,
        kind: kind || ynIeKindOf(el),
        // NEVER "exact": no selector below is live-verified (login wall).
        confidence: "guessed",
        source: "adapter",
        label: label || fieldKey
      });
    };
    push(
      "posting.title",
      ynIeFind(
        document_,
        [
          'input[name="jobTitle"]',
          "#jobTitle",
          'input[id*="jobTitle" i]',
          'input[name*="job-title" i]'
        ],
        /job\s*title|^title$/i,
        claimed
      ),
      p.title,
      "text",
      "Job title"
    );
    push(
      "posting.location",
      ynIeFind(
        document_,
        [
          'input[name="location"]',
          "#jobLocation",
          'input[id*="location" i]',
          'input[name*="location" i]'
        ],
        /location|where|city|town/i,
        claimed
      ),
      p.location,
      null,
      "Location"
    );
    const descEl = ynIeFind(
      document_,
      [
        'textarea[name="jobDescription"]',
        "#jobDescription",
        'textarea[id*="description" i]',
        'textarea[name*="description" i]'
      ],
      null,
      claimed
    );
    if (descEl && (descEl.tagName || "").toUpperCase() === "TEXTAREA") {
      push(
        "posting.description",
        descEl,
        p.description,
        "textarea",
        "Job description"
      );
    }
    if (p.salary_min != null) {
      push(
        "posting.salary_min",
        ynIeFind(
          document_,
          [
            'input[name="salaryMin"]',
            'input[id*="salaryMin" i]',
            'input[name*="minimum" i]'
          ],
          /minimum\s*(salary|pay)|salary\s*(from|min)/i,
          claimed
        ),
        String(p.salary_min),
        "text",
        "Salary minimum"
      );
    }
    if (p.salary_max != null) {
      push(
        "posting.salary_max",
        ynIeFind(
          document_,
          [
            'input[name="salaryMax"]',
            'input[id*="salaryMax" i]',
            'input[name*="maximum" i]'
          ],
          /maximum\s*(salary|pay)|salary\s*(to|max)/i,
          claimed
        ),
        String(p.salary_max),
        "text",
        "Salary maximum"
      );
    }
    push(
      "posting.application_email",
      ynIeFind(
        document_,
        [
          'input[name="applicationEmail"]',
          'input[type="email"]',
          'input[id*="email" i]'
        ],
        /email/i,
        claimed
      ),
      p.application_email,
      "text",
      "Application email"
    );
    const levelMap = {
      apprenticeship: "Apprenticeship",
      internship: "Internship"
    };
    const jobType = levelMap[String(p.level || "").toLowerCase()];
    if (jobType) {
      push(
        "posting.job_type",
        ynIeFind(
          document_,
          ['select[name="jobType"]', 'select[id*="jobType" i]'],
          /job\s*type|employment\s*type/i,
          claimed
        ),
        jobType,
        null,
        "Job type"
      );
    }
    for (const el of ynIeFillableFields(document_)) {
      if (claimed.has(el)) continue;
      const type = (el.type || "").toLowerCase();
      if (type !== "checkbox") continue;
      if (typeof ynIsTermsCheckbox === "function" && ynIsTermsCheckbox(el, document_)) {
        claimed.add(el);
        intents.push({
          fieldKey: "terms",
          el,
          value: null,
          kind: "checkbox",
          confidence: "guessed",
          source: "adapter",
          skip: "terms",
          label: ynIeSignal(el, document_).slice(0, 80) || "Terms checkbox"
        });
      }
    }
    for (const el of ynIeFillableFields(document_)) {
      if (claimed.has(el)) continue;
      if (typeof ynIsPaymentField === "function" && ynIsPaymentField(el, document_)) {
        claimed.add(el);
        intents.push({
          fieldKey: "payment",
          el,
          value: null,
          kind: ynIeKindOf(el),
          confidence: "guessed",
          source: "adapter",
          skip: "payment",
          label: ynIeSignal(el, document_).slice(0, 80) || "Payment field"
        });
      }
    }
    return intents;
  }

  // extension/src/adapters/indeed_employer/wizard.js
  function ynIeStepKey(doc) {
    const document_ = doc || document;
    try {
      const heading = document_.querySelector("h1, h2, [role='heading']");
      const t = heading ? String(heading.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) : "";
      if (t) return t;
    } catch {
    }
    return "step";
  }
  function ynIeAdvance(doc) {
    const document_ = doc || document;
    let buttons = [];
    try {
      buttons = typeof ynAdaFindAll === "function" ? ynAdaFindAll(document_, 'button, [role="button"], a[role="button"]') : [...document_.querySelectorAll('button, [role="button"]')];
    } catch {
      buttons = [];
    }
    for (const b of buttons) {
      if (!b) continue;
      const text = ((b.textContent || "") + " " + (b.getAttribute && b.getAttribute("aria-label") || "")).trim();
      if (!/save\s*and\s*continue|^\s*next\s*$|continue/i.test(text)) continue;
      if (typeof ynSubmitGuard === "function" && ynSubmitGuard(b)) continue;
      return b;
    }
    return null;
  }

  // extension/src/adapters/indeed_employer/index.js
  globalThis.YN_IE_SPONSOR_SIGNAL_RE = YN_IE_SPONSOR_SIGNAL_RE;
  globalThis.ynIeSignal = ynIeSignal;
  globalThis.ynIeFillableFields = ynIeFillableFields;
  globalThis.ynIeSponsorshipField = ynIeSponsorshipField;
  globalThis.ynIeFind = ynIeFind;
  globalThis.ynIeKindOf = ynIeKindOf;
  globalThis.ynIndeedEmployerPlan = ynIndeedEmployerPlan;
  globalThis.ynIeStepKey = ynIeStepKey;
  globalThis.ynIeAdvance = ynIeAdvance;
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  globalThis.YN_ADAPTERS.push({
    id: "indeed_employer",
    plan: ynIndeedEmployerPlan,
    wizard: {
      stepKey: ynIeStepKey,
      advance: ynIeAdvance
    }
  });
})();
