(() => {
  // extension/src/adapters/ashby/index.js
  function ynAsFullName(plan) {
    const c = plan && plan.contact || {};
    const joined = [c.first_name, c.last_name].filter(Boolean).join(" ");
    return joined || c.full_name || c.name || "";
  }
  function ynAsFieldLabel(el, doc) {
    const bits = [];
    bits.push(ynAdaLabelOf(el, doc));
    let cur = el && el.parentElement;
    for (let i = 0; i < 6 && cur; i++) {
      const lab = cur.querySelector && cur.querySelector("label");
      if (lab) bits.push(lab.textContent || "");
      cur = cur.parentElement;
    }
    return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  function ynAsLocationInput(doc) {
    const byId = ynAdaFind(doc, "#_systemfield_location");
    if (byId) {
      const tag = (byId.tagName || "").toUpperCase();
      const type = (byId.type || "").toLowerCase();
      if ((tag === "INPUT" || tag === "TEXTAREA") && !["hidden", "submit", "button"].includes(type)) {
        return byId;
      }
      const inner = byId.querySelector && byId.querySelector('input[role="combobox"], input[aria-autocomplete]');
      if (inner) return inner;
    }
    try {
      const lab = (doc || document).querySelector(
        'label[for="_systemfield_location"]'
      );
      if (lab) {
        const root = lab.closest("div, fieldset, section, form") || lab.parentElement;
        if (root) {
          const cb = root.querySelector(
            'input[role="combobox"], input[aria-autocomplete="list"], input[aria-haspopup="listbox"]'
          ) || root.querySelector('input:not([type="hidden"])');
          if (cb && !ynAdaIsPassword(cb)) return cb;
        }
      }
    } catch {
    }
    return null;
  }
  function ynAsResumeTarget(doc) {
    const file = ynAdaFind(
      doc,
      '#_systemfield_resume, input[type="file"]#_systemfield_resume'
    );
    if (file && (file.type || "").toLowerCase() === "file") return file;
    const anyResumeFile = ynAdaFindAll(doc, 'input[type="file"]').find((el) => {
      const sig = ynAsFieldLabel(el, doc) + " " + (el.id || "") + " " + (el.name || "");
      return /resume|curriculum|c\.?v\.?/i.test(sig);
    });
    if (anyResumeFile) return anyResumeFile;
    const drop = ynAdaFind(
      doc,
      "[class*='dropzone'], [class*='Dropzone'], [data-testid*='resume'], [class*='upload']"
    );
    return drop || null;
  }
  function ynAsByLabel(doc, re) {
    const fields = ynAdaFindAll(doc, "input, textarea, select");
    for (const el of fields) {
      if (ynAdaIsPassword(el)) continue;
      const type = (el.type || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset", "file"].includes(type))
        continue;
      if (el.id && /^_systemfield_/i.test(el.id)) continue;
      const signal = ynAsFieldLabel(el, doc);
      if (re.test(signal)) return el;
    }
    return null;
  }
  function ynAshbyPlan(plan, doc) {
    const document_ = doc || document;
    const intents = [];
    const c = plan && plan.contact || {};
    const links = plan && plan.links || {};
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
    const fullName = ynAsFullName(plan);
    if (ynAdaUsable(fullName)) {
      push(
        "contact.full_name",
        ynAdaFind(document_, "#_systemfield_name"),
        fullName,
        "text",
        "Full Name"
      );
    }
    if (ynAdaUsable(c.email)) {
      push(
        "contact.email",
        ynAdaFind(document_, "#_systemfield_email"),
        c.email,
        "text",
        "Email"
      );
    }
    const locVal = [addr.city, addr.country].filter(Boolean).join(", ") || addr.city || addr.line1 || "";
    if (ynAdaUsable(locVal)) {
      const locEl = ynAsLocationInput(document_);
      if (locEl) {
        const isCombo = locEl.getAttribute("role") === "combobox" || locEl.getAttribute("aria-autocomplete") === "list" || locEl.getAttribute("aria-haspopup") === "listbox";
        push(
          "address.city",
          locEl,
          locVal,
          isCombo ? "combobox" : "text",
          "Location"
        );
      }
    }
    if (plan && plan.cv_url) {
      const resumeEl = ynAsResumeTarget(document_);
      push("cv_file", resumeEl, { file: "cv" }, "file", "Resume");
    }
    if (ynAdaUsable(c.phone)) {
      const phoneEl = ynAsByLabel(
        document_,
        /^phone$|phone\s*number|mobile|tel\b/i
      );
      if (phoneEl) {
        const sig = ynAsFieldLabel(phoneEl, document_);
        if (/phone|mobile|tel/i.test(sig) && !/sponsor|authori/i.test(sig)) {
          push("contact.phone", phoneEl, c.phone, "text", "Phone");
        }
      }
    }
    if (ynAdaUsable(links.linkedin)) {
      const liEl = ynAsByLabel(document_, /linked\s*in/i);
      if (liEl) {
        push("links.linkedin", liEl, links.linkedin, "text", "LinkedIn Profile");
      }
    }
    if (plan && ynAdaUsable(plan.letter_text)) {
      const letterTa = ynAsByLabel(document_, /cover\s*letter|motivation/i);
      if (letterTa && (letterTa.tagName || "").toUpperCase() === "TEXTAREA") {
        push(
          "letter_text",
          letterTa,
          plan.letter_text,
          "textarea",
          "Cover letter"
        );
      }
    }
    if (plan && plan.letter_url) {
      const letterFile = ynAdaFindAll(document_, 'input[type="file"]').find(
        (el) => {
          if (claimed.has(el)) return false;
          const sig = ynAsFieldLabel(el, document_) + " " + (el.id || "");
          return /cover\s*letter|motivation/i.test(sig);
        }
      );
      if (letterFile) {
        push(
          "letter_file",
          letterFile,
          { file: "letter" },
          "file",
          "Cover letter"
        );
      }
    }
    return intents;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "ashby",
    plan: ynAshbyPlan
  });
  globalThis.ynAsFullName = ynAsFullName;
  globalThis.ynAsFieldLabel = ynAsFieldLabel;
  globalThis.ynAsLocationInput = ynAsLocationInput;
  globalThis.ynAsResumeTarget = ynAsResumeTarget;
  globalThis.ynAsByLabel = ynAsByLabel;
  globalThis.ynAshbyPlan = ynAshbyPlan;
})();
