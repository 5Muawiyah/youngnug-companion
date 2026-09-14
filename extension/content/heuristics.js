(() => {
  // extension/src/engine/heuristics/patterns.js
  var YN_EEO_HEADING_RE = /equal opportunit|diversity|demographic|gender|ethnic|race|disability|veteran|sexual orientation/i;
  var YN_SENSITIVE_RE = /criminal (record|conviction)|unspent conviction|rehabilitation of offenders|disab|health condition|adjustment|referee|reference contact/i;
  var YN_AUTOCOMPLETE_MAP = {
    "given-name": { key: "contact.first_name", kind: "text" },
    "family-name": { key: "contact.last_name", kind: "text" },
    "additional-name": { key: "contact.middle_name", kind: "text" },
    name: { key: "contact.full_name", kind: "text" },
    email: { key: "contact.email", kind: "text" },
    "tel-national": { key: "contact.phone", kind: "text" },
    "tel-local": { key: "contact.phone", kind: "text" },
    tel: { key: "contact.phone", kind: "text" },
    "street-address": { key: "address.line1", kind: "text" },
    "address-line1": { key: "address.line1", kind: "text" },
    "address-line2": { key: "address.line2", kind: "text" },
    "address-level2": { key: "address.city", kind: "text" },
    "address-level1": { key: "address.region", kind: "text" },
    "postal-code": { key: "address.postcode", kind: "text" },
    country: { key: "address.country", kind: "text" },
    "country-name": { key: "address.country", kind: "text" },
    url: { key: "links.portfolio", kind: "text" },
    "organization-title": { key: "work.0.title", kind: "text" },
    organization: { key: "work.0.employer", kind: "text" }
  };
  var YN_LABEL_PATTERNS = [
    [
      /first\s*name|given\s*name|forename|christian\s*name/i,
      "contact.first_name",
      "text"
    ],
    [/last\s*name|family\s*name|surname|sur\s*name/i, "contact.last_name", "text"],
    // "^name$" alone missed the commonest plain-English label there is —
    // a bare "Your name". Anchored to the WHOLE signal so it still cannot
    // swallow "Username", "Company name" or "Employer's name".
    [/full\s*name|^\s*(your\s+)?name\s*$/i, "contact.full_name", "text"],
    [/e-?mail/i, "contact.email", "text"],
    // "contact number" is deliberately NOT added here: an "Emergency contact
    // number" field contains that exact phrase and must never receive the
    // student's OWN number (emergency-contact gating is a separate technique
    // not implemented here — this pattern must not make that gap
    // wider). "landline" carries no risk of that kind.
    [/phone|mobile|tel\b|cell|landline/i, "contact.phone", "text"],
    [
      /address\s*line\s*1|street\s*address|address\s*1|^address$|first\s*line\s*of\s*(your\s*)?address/i,
      "address.line1",
      "text"
    ],
    [
      /address\s*line\s*2|address\s*2|apt|suite|flat|second\s*line/i,
      "address.line2",
      "text"
    ],
    // \b so "ethnicity" / "electricity" never substring-match to city (an
    // ethnicity field previously matched on address.city here)
    [/\bcity\b|\btown\b|address.?level.?2/i, "address.city", "text"],
    [/post\s*code|postal|zip/i, "address.postcode", "text"],
    [/country|nation/i, "address.country", "text"],
    [/linked\s*in/i, "links.linkedin", "text"],
    [/github/i, "links.github", "text"],
    [/portfolio|personal\s*site|website|homepage/i, "links.portfolio", "text"],
    // Factual patterns (most-specific, above generic RTW/salary etc.)
    [
      /driving licen[cs]e|driver'?s?\s*licen[cs]e/i,
      "eligibility_extra.uk_driving_licence",
      "checkbox"
    ],
    [
      /willing to relocate|relocat/i,
      "eligibility_extra.willing_to_relocate",
      "checkbox"
    ],
    [
      /earliest .{0,20}start|available to start|start date/i,
      "answers.earliest_start",
      "text"
    ],
    [
      /years of experience|how many years|how much experience|level of .{0,20}experience/i,
      "derived.years_of_experience",
      "text"
    ],
    [
      /highest (level of )?(qualification|education)/i,
      "derived.highest_qualification",
      "text"
    ],
    [
      /right\s*to\s*work|eligible\s*to\s*work|work\s*authori[sz]/i,
      "right_to_work.uk_rtw",
      "checkbox"
    ],
    [
      /sponsor|visa\s*sponsor|require.{0,12}visa|need.{0,12}sponsor/i,
      "right_to_work.needs_sponsorship",
      "checkbox"
    ],
    [/notice\s*period|period\s*of\s*notice/i, "answers.notice_period", "text"],
    [
      /salary|compensation|expected\s*pay|pay\s*expect/i,
      "answers.salary_expectation",
      "text"
    ],
    // Education + work history. The profile has carried these for a long time
    // and only an ATS adapter ever reached them; the generic any-page rung
    // (ynFillAnyPage) is where they earn their keep, because a volunteering
    // form, a college application or a bursary form asks for exactly these and
    // has no adapter. Deliberately BELOW the factual block so
    // "highest level of qualification" keeps its derived answer, and
    // deliberately TIGHT: a bare /company/ or /role/ would claim "the company
    // you are applying to" and "the role you are applying for", which are the
    // same words meaning the opposite thing. A wrong answer there is worse
    // than a blank, so the employer/title patterns demand their own word.
    [
      /school|college|university|institution|place of (study|education)/i,
      "education.0.institution",
      "text"
    ],
    [
      /^\s*qualifications?\s*$|qualification (name|title|type)|^\s*degree\s*$|a-?levels?\b|btec/i,
      "education.0.qualification",
      "text"
    ],
    [
      /(current|most recent|previous|last|present)\s+employer|employer'?s?\s*name|^\s*employer\s*$|name\s*of\s*(your\s*|current\s*|last\s*|previous\s*)?employer/i,
      "work.0.employer",
      "text"
    ],
    [
      /job\s*title|position\s*title|role\s*title|(current|most recent|previous|last|present)\s+(job|role|position)\b/i,
      "work.0.title",
      "text"
    ],
    // Cover letter BEFORE free-text archetypes so letter fields stay letter_text
    [/cover\s*letter|motivation/i, "letter_text", "textarea"],
    // Free-text question archetypes (textarea/text only at emit time)
    [
      /why .{0,30}(fit|suit|good match|hire)/i,
      "generated:why_fit",
      "generated_text"
    ],
    [
      /why .{0,30}(join|work (for|at|here)|this (company|role)|us\b)|what attracts/i,
      "generated:why_company",
      "generated_text"
    ],
    [
      /(describe|tell us about) .{0,30}experience|experience (with|of|in)/i,
      "generated:experience_with",
      "generated_text"
    ],
    [/resume|curriculum|c\.?v\.?|upload.*(cv|resume)/i, "cv_file", "file"]
  ];
  var YN_EARLIEST_START_EXCLUDE_RE = /birth|dob|history|previous|from|to$/i;
  var YN_PHONE_ADJUNCT_RE = /iso2|country.?code|countryprefix|dial(l?ing)?.?code|area.?code/i;
  var YN_SKILL_EXPERIENCE_RE = /experience (with|of|in) [a-z]/i;
  function ynProfileGet(profile, path) {
    if (!profile || !path) return void 0;
    if (path === "contact.full_name") {
      const c = profile.contact || {};
      const joined = [c.first_name, c.last_name].filter(Boolean).join(" ");
      return joined || c.full_name || c.name || void 0;
    }
    if (path === "cv_file") {
      return profile.cv_url ? { file: "cv" } : void 0;
    }
    if (path === "letter_file") {
      return profile.letter_url ? { file: "letter" } : void 0;
    }
    if (path === "letter_text") {
      return profile.letter_text || void 0;
    }
    const parts = path.split(".");
    let cur = profile;
    for (const p of parts) {
      if (cur == null) return void 0;
      cur = cur[p];
    }
    return cur;
  }
  function ynIsUnconfirmed(profile, path) {
    const list = profile && profile.unconfirmed_answers;
    if (!Array.isArray(list)) return false;
    const bare = path.split(".").pop();
    return list.some((u) => u === path || u === bare || String(u).includes(bare));
  }
  function ynValueUsable(val) {
    if (val == null || val === "") return false;
    if (typeof val === "string" && /\[CONFIRM/i.test(val)) return false;
    return true;
  }

  // extension/src/engine/heuristics/labels_a.js
  function ynGroupLegend(el, doc) {
    if (!el || !el.closest) return "";
    try {
      const fs = el.closest("fieldset");
      if (fs) {
        const legend = fs.querySelector("legend");
        if (legend && legend.textContent) {
          return legend.textContent.replace(/\s+/g, " ").trim();
        }
      }
      const grp = el.closest('[role="group"],[role="radiogroup"]');
      if (grp) {
        const lbl = grp.getAttribute("aria-label");
        if (lbl) return lbl.trim();
        const by = grp.getAttribute("aria-labelledby");
        if (by && doc && doc.getElementById) {
          const t = by.split(/\s+/).map((id) => (doc.getElementById(id) || {}).textContent || "").join(" ").trim();
          if (t) return t.replace(/\s+/g, " ").trim();
        }
      }
    } catch {
    }
    return "";
  }
  function ynAriaLabelledByText(el, doc) {
    const ids = (el.getAttribute("aria-labelledby") || "").trim().split(/\s+/);
    if (!ids[0]) return "";
    return ids.map((id) => {
      try {
        const n = doc.getElementById(id);
        return n ? (n.textContent || "").trim() : "";
      } catch {
        return "";
      }
    }).filter(Boolean).join(" ");
  }
  function ynAriaDescribedByText(el, doc) {
    const ids = (el.getAttribute("aria-describedby") || "").trim().split(/\s+/);
    if (!ids[0]) return "";
    const document_ = doc || document;
    return ids.map((id) => {
      try {
        const n = document_.getElementById(id);
        return n ? (n.textContent || "").trim() : "";
      } catch {
        return "";
      }
    }).filter(Boolean).join(" ");
  }
  function ynIdConventionLabel(el, doc) {
    if (!el.id || el.labels && el.labels.length) return "";
    const document_ = doc || document;
    try {
      const escFid = el.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("(^|[^a-z0-9])" + escFid + "($|[^a-z0-9])", "i");
      const all = document_.querySelectorAll("[id]");
      for (const node of all) {
        if (node === el) continue;
        const nid = node.id || "";
        if (!nid || !/label/i.test(nid) || !re.test(nid)) continue;
        const t = (node.textContent || "").trim();
        if (t) return t;
      }
    } catch {
    }
    return "";
  }
  function ynLabelAttrOwnText(el) {
    if (!el || !el.attributes) return "";
    for (const attr of el.attributes) {
      const n = (attr.name || "").toLowerCase();
      if (n === "aria-label" || !/label/.test(n)) continue;
      const v = (attr.value || "").trim();
      if (!v || v.length > 140) continue;
      if (!/[a-z]/i.test(v)) continue;
      if (/[{}<>$`|]/.test(v)) continue;
      return v;
    }
    return "";
  }
  function ynAncestorLabelAttrText(el, hops) {
    let cur = el;
    for (let i = 0; i < (hops || 3) && cur; i++) {
      const t = ynLabelAttrOwnText(cur);
      if (t) return t;
      cur = cur.parentElement;
    }
    return "";
  }
  function ynShadowHostSignalText(el, doc) {
    try {
      let cur = el;
      for (let hops = 0; hops < 4 && cur; hops++) {
        const root = typeof cur.getRootNode === "function" ? cur.getRootNode() : null;
        if (!root || root.nodeType !== 11) break;
        const host = root.host;
        if (!host || typeof host.getAttribute !== "function") break;
        const bits = [
          host.getAttribute("aria-label"),
          host.getAttribute("label"),
          host.getAttribute("placeholder"),
          host.getAttribute("autocomplete"),
          host.getAttribute("name"),
          host.id
        ].filter(Boolean).join(" ");
        if (bits) return bits;
        cur = host;
      }
    } catch {
    }
    return "";
  }
  function ynDataIdentityText(el) {
    if (!el || typeof el.getAttribute !== "function") return "";
    return [
      el.getAttribute("data-automation-id"),
      el.getAttribute("data-testid"),
      el.getAttribute("data-qa")
    ].filter(Boolean).join(" ");
  }
  function ynLabelText(el, doc) {
    const bits = [];
    if (el.labels && el.labels.length) {
      for (const lab of el.labels) bits.push(lab.textContent || "");
    } else if (el.id) {
      try {
        const lab = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab) bits.push(lab.textContent || "");
      } catch {
      }
    }
    bits.push(el.getAttribute("aria-label") || "");
    bits.push(ynAriaLabelledByText(el, doc));
    bits.push(el.getAttribute("placeholder") || "");
    bits.push(el.name || "");
    bits.push(el.id || "");
    bits.push(el.getAttribute("autocomplete") || "");
    const usable = (s) => typeof ynIsUsableLabel === "function" ? ynIsUsableLabel(s) : Boolean(s);
    const extra = [
      ynAriaDescribedByText(el, doc),
      ynIdConventionLabel(el, doc),
      ynAncestorLabelAttrText(el),
      ynShadowHostSignalText(el, doc),
      ynDataIdentityText(el)
    ];
    for (const s of extra) {
      if (s && usable(s)) bits.push(s);
    }
    return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  function ynHumanFieldLabel(el, doc) {
    const document_ = doc || document;
    const candidates = [];
    if (el.labels && el.labels.length) {
      for (const lab of el.labels) candidates.push(lab.textContent || "");
    } else if (el.id) {
      try {
        const lab = document_.querySelector(
          `label[for="${CSS.escape(el.id)}"]`
        );
        if (lab) candidates.push(lab.textContent || "");
      } catch {
      }
    }
    candidates.push(el.getAttribute("aria-label") || "");
    candidates.push(ynAriaLabelledByText(el, document_));
    candidates.push(ynAriaDescribedByText(el, document_));
    candidates.push(ynIdConventionLabel(el, document_));
    candidates.push(ynAncestorLabelAttrText(el));
    candidates.push(ynShadowHostSignalText(el, document_));
    candidates.push(el.getAttribute("placeholder") || "");
    const t = (el.type || "").toLowerCase();
    if (t === "radio" || t === "checkbox") {
      candidates.push(ynGroupLegend(el, document_));
    }
    if (typeof ynFirstUsableLabel === "function") {
      return ynFirstUsableLabel(candidates);
    }
    for (const c of candidates) {
      if (c && String(c).trim()) return String(c).replace(/\s+/g, " ").trim();
    }
    return "";
  }

  // extension/src/engine/heuristics/labels_b.js
  function ynReportableFieldLabel(el, doc, rawFallback, domainFallback) {
    const human = ynHumanFieldLabel(el, doc);
    if (human) return human.slice(0, 80);
    const fb = String(rawFallback || "").trim();
    if (fb && (typeof ynIsUsableLabel !== "function" || ynIsUsableLabel(fb))) {
      return fb.slice(0, 80);
    }
    return domainFallback || "unlabelled field";
  }
  function ynReportableGroupLabel(question, domainFallback) {
    const q = String(question || "").trim();
    if (q && (typeof ynIsUsableLabel !== "function" || ynIsUsableLabel(q))) {
      return q.slice(0, 80);
    }
    return domainFallback || "unlabelled field";
  }
  function ynSanitizeIdentity(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function ynFieldIdentityRaw(el, doc, includeClassName) {
    const bits = [];
    bits.push(el.name || "");
    bits.push(el.id || "");
    if (includeClassName !== false) {
      const cls = el.className;
      if (typeof cls === "string") bits.push(cls);
      else if (cls && typeof cls.baseVal === "string") bits.push(cls.baseVal);
    }
    bits.push(el.getAttribute("placeholder") || "");
    if (el.labels && el.labels.length) {
      for (const lab of el.labels) bits.push(lab.textContent || "");
    } else if (el.id) {
      try {
        const lab = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab) bits.push(lab.textContent || "");
      } catch {
      }
    }
    bits.push(el.getAttribute("aria-label") || "");
    bits.push(ynAriaLabelledByText(el, doc));
    const t = (el.type || "").toLowerCase();
    if (t === "radio" || t === "checkbox") {
      bits.push(ynGroupLegend(el, doc));
    }
    return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  function ynFieldIdentitySignal(el, doc) {
    return ynFieldIdentityRaw(el, doc).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function ynFieldQuestionText(el, doc) {
    const bits = [ynFieldIdentityRaw(el, doc, false)];
    const t = (el.type || "").toLowerCase();
    if (t !== "radio" && t !== "checkbox") {
      bits.push(ynGroupLegend(el, doc));
    }
    return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  function ynInEeoSection(el) {
    try {
      const own = (el.labels && el.labels.length ? el.labels[0].textContent : "").concat(
        " ",
        el.getAttribute("aria-label") || "",
        " ",
        el.getAttribute("name") || "",
        " ",
        el.getAttribute("id") || ""
      );
      if (YN_EEO_HEADING_RE.test(own)) return true;
    } catch {
    }
    let cur = el;
    for (let i = 0; i < 12 && cur; i++) {
      if (cur.matches && (cur.matches("fieldset") || cur.matches("section"))) {
        const legend = cur.querySelector("legend, h1, h2, h3, h4, [role='heading']") || cur;
        const text = (legend.textContent || "").slice(0, 400);
        if (YN_EEO_HEADING_RE.test(text)) return true;
      }
      if (cur.previousElementSibling) {
        const prev = cur.previousElementSibling;
        if (/^(H[1-6]|LEGEND)$/i.test(prev.tagName) && YN_EEO_HEADING_RE.test(prev.textContent || "")) {
          return true;
        }
      }
      cur = cur.parentElement;
    }
    return false;
  }
  function ynNearbyText(el, doc) {
    const document_ = doc || document;
    const clip = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 160);
    const shortText = (node) => {
      if (!node || !node.textContent) return "";
      if (/^(SCRIPT|STYLE|TEMPLATE)$/i.test(node.tagName || "")) return "";
      const raw = node.textContent.replace(/\s+/g, " ").trim();
      if (!raw || raw.length > 200) return "";
      return clip(raw);
    };
    try {
      const legend = ynGroupLegend(el, document_);
      if (legend && legend.length <= 200) return clip(legend);
      const td = el.closest ? el.closest("td, th") : null;
      if (td && td.previousElementSibling) {
        const t = shortText(td.previousElementSibling);
        if (t) return t;
      }
      let scope = el;
      for (let hop = 0; hop < 3 && scope; hop++) {
        let sib = scope.previousElementSibling;
        let steps = 0;
        while (sib && steps < 4) {
          if (sib.querySelector && sib.querySelector("input, textarea, select, button")) {
            break;
          }
          const t = shortText(sib);
          if (t) return t;
          sib = sib.previousElementSibling;
          steps += 1;
        }
        const parent = scope.parentElement;
        if (parent) {
          let own = "";
          for (const n of parent.childNodes || []) {
            if (n.nodeType === 3) own += n.textContent + " ";
          }
          own = own.replace(/\s+/g, " ").trim();
          if (own && own.length <= 200) return clip(own);
        }
        scope = parent;
      }
      let cur = el;
      for (let i = 0; i < 6 && cur; i++) {
        let sib = cur.previousElementSibling;
        let steps = 0;
        while (sib && steps < 6) {
          const role = sib.getAttribute ? sib.getAttribute("role") : "";
          if (/^H[1-6]$/i.test(sib.tagName || "") || role === "heading") {
            const t = shortText(sib);
            if (t) return t;
          }
          sib = sib.previousElementSibling;
          steps += 1;
        }
        cur = cur.parentElement;
      }
    } catch {
    }
    return "";
  }
  function ynFieldKind(el) {
    const tag = (el.tagName || "").toUpperCase();
    const type = (el.type || "text").toLowerCase();
    if (tag === "TEXTAREA") return "textarea";
    if (tag === "SELECT") return "select";
    if (type === "file") return "file";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "date") return "date";
    if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list" || el.getAttribute("aria-haspopup") === "listbox") {
      return "combobox";
    }
    return "text";
  }

  // extension/src/engine/heuristics/matching.js
  function ynMatchLabelPatterns(signal) {
    if (!signal) return null;
    for (const [re, key, kind] of YN_LABEL_PATTERNS) {
      if (re.test(signal)) return { key, kind };
    }
    return null;
  }
  function ynRefinePatternHit(hit, signal) {
    if (!hit) return null;
    if (hit.key === "answers.earliest_start") {
      if (YN_EARLIEST_START_EXCLUDE_RE.test(signal)) return null;
    }
    if (hit.key === "contact.phone") {
      if (YN_PHONE_ADJUNCT_RE.test(signal)) return null;
    }
    if (hit.key === "derived.years_of_experience") {
      if (YN_SKILL_EXPERIENCE_RE.test(signal)) {
        return {
          key: "generated:experience_with",
          kind: "generated_text"
        };
      }
    }
    return hit;
  }
  function ynMatchFieldIdentity(el, doc, primarySignal) {
    let hit = ynRefinePatternHit(
      ynMatchLabelPatterns(primarySignal),
      primarySignal
    );
    if (hit) return hit;
    const identity = ynFieldIdentitySignal(el, doc);
    if (identity && identity !== (primarySignal || "").toLowerCase()) {
      hit = ynRefinePatternHit(ynMatchLabelPatterns(identity), identity);
      if (hit) return hit;
    }
    const san = ynSanitizeIdentity(ynFieldIdentityRaw(el, doc));
    if (!san) return null;
    if (/drivinglicen[cs]e/.test(san)) {
      return {
        key: "eligibility_extra.uk_driving_licence",
        kind: "checkbox"
      };
    }
    if (/willingtorelocate|relocat/.test(san)) {
      return {
        key: "eligibility_extra.willing_to_relocate",
        kind: "checkbox"
      };
    }
    return null;
  }
  var YN_DATE_FIELD_KEYS = /* @__PURE__ */ new Set(["answers.earliest_start"]);
  function ynDatePartRole(el, doc) {
    const sig = ynFieldIdentitySignal(el, doc);
    if (!sig) return null;
    if (/\b(day|dd)\b/.test(sig)) return "day";
    if (/\b(month|mm)\b/.test(sig)) return "month";
    if (/\b(year|yyyy|yy)\b/.test(sig)) return "year";
    return null;
  }
  function ynDateGroup(el, doc) {
    const document_ = doc || document;
    let cur = el.parentElement;
    for (let hop = 0; hop < 3 && cur; hop++) {
      try {
        const sel = cur.querySelector ? cur.querySelector("select") : null;
        if (sel && ynDatePartRole(sel, document_)) return null;
        const inputs = cur.querySelectorAll ? [...cur.querySelectorAll("input")] : [];
        if (inputs.length >= 3 && inputs.length <= 6) {
          const roles = {};
          for (const inp of inputs) {
            const role = ynDatePartRole(inp, document_);
            if (!role) continue;
            const t = (inp.type || "text").toLowerCase();
            if (!["text", "number", "tel"].includes(t)) return null;
            if (roles[role]) return null;
            roles[role] = inp;
          }
          if (roles.day && roles.month && roles.year) return roles;
        }
      } catch {
        return null;
      }
      cur = cur.parentElement;
    }
    return null;
  }
  function ynIsFactualQuestionKey(key) {
    return typeof key === "string" && (key.startsWith("right_to_work.") || key.startsWith("eligibility_extra.") || key.startsWith("answers.") || key.startsWith("derived."));
  }
  function ynIsBooleanFieldKey(key) {
    return key === "right_to_work.uk_rtw" || key === "right_to_work.needs_sponsorship" || key === "eligibility_extra.uk_driving_licence" || key === "eligibility_extra.willing_to_relocate";
  }
  function ynRadioOptionLabel(radio, doc) {
    if (!radio) return "";
    if (radio.labels && radio.labels.length) {
      return (radio.labels[0].textContent || "").replace(/\s+/g, " ").trim();
    }
    if (radio.id && doc && doc.querySelector) {
      try {
        const lab = doc.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
        if (lab) return (lab.textContent || "").replace(/\s+/g, " ").trim();
      } catch {
      }
    }
    if (radio.closest) {
      const parentLab = radio.closest("label");
      if (parentLab) {
        return (parentLab.textContent || "").replace(/\s+/g, " ").trim();
      }
    }
    return String(radio.value || "").trim();
  }
  function ynResolveBooleanRadio(radioEl, value, doc) {
    if (!radioEl || (radioEl.type || "").toLowerCase() !== "radio") return null;
    if (value === null || value === void 0) return null;
    const want = Boolean(value);
    const document_ = doc || (typeof document !== "undefined" ? document : null);
    if (!document_) return null;
    const name = radioEl.name || "";
    let group = [radioEl];
    if (name) {
      const root = radioEl.form || document_;
      try {
        const sel = `input[type="radio"][name="${CSS.escape(name)}"]`;
        const found = root.querySelectorAll ? [...root.querySelectorAll(sel)] : [];
        if (found.length) group = found;
      } catch {
        group = [radioEl];
      }
    }
    const yesRe = /^(yes|i (am|do|have)|true)\b/i;
    const noRe = /^(no|i (do not|don't|am not)|false)\b/i;
    const yesTailRe = /\b(yes|true)\s*$/i;
    const noTailRe = /\b(no|false)\s*$/i;
    let match = null;
    for (const r of group) {
      const optLabel = ynRadioOptionLabel(r, document_);
      const val = String(r.value || "").trim();
      const candidates = [optLabel, val];
      let isYes = false;
      let isNo = false;
      for (const c of candidates) {
        const t = String(c || "").trim();
        if (!t) continue;
        if (yesRe.test(t) || yesTailRe.test(t)) isYes = true;
        if (noRe.test(t) || noTailRe.test(t)) isNo = true;
      }
      if (want && isYes && !isNo) {
        match = r;
        break;
      }
      if (!want && isNo && !isYes) {
        match = r;
        break;
      }
    }
    if (!match) return null;
    return { el: match, value: want };
  }
  function ynResolveOptionRadio(radioEl, value, doc) {
    if (!radioEl || (radioEl.type || "").toLowerCase() !== "radio") return null;
    const want = String(value || "").trim().toLowerCase();
    if (!want) return null;
    const document_ = doc || (typeof document !== "undefined" ? document : null);
    if (!document_) return null;
    const name = radioEl.name || "";
    let group = [radioEl];
    try {
      if (name) {
        const root = radioEl.form || document_;
        const found = root.querySelectorAll ? [
          ...root.querySelectorAll(
            `input[type="radio"][name="${CSS.escape(name)}"]`
          )
        ] : [];
        if (found.length) group = found;
      } else if (radioEl.closest) {
        const box = radioEl.closest('fieldset,[role="radiogroup"]');
        if (box && box.querySelectorAll) {
          const found = [...box.querySelectorAll('input[type="radio"]')];
          if (found.length) group = found;
        }
      }
    } catch {
      group = [radioEl];
    }
    const labelled = group.map((r) => ({
      el: r,
      label: ynRadioOptionLabel(r, document_).trim().toLowerCase()
    })).filter((o) => o.label);
    const uniq = (arr) => arr.length === 1 ? arr[0] : null;
    const hit = uniq(labelled.filter((o) => o.label === want)) || uniq(labelled.filter((o) => o.label.startsWith(want))) || uniq(labelled.filter((o) => o.label.includes(want)));
    return hit ? { el: hit.el } : null;
  }
  function ynClaimRadioGroup(radioEl, claimed, doc) {
    if (!radioEl || !claimed) return;
    claimed.add(radioEl);
    const name = radioEl.name || "";
    if (!name) return;
    const document_ = doc || document;
    const root = radioEl.form || document_;
    try {
      const sel = `input[type="radio"][name="${CSS.escape(name)}"]`;
      const found = root.querySelectorAll ? root.querySelectorAll(sel) : [];
      for (const r of found) claimed.add(r);
    } catch {
    }
  }

  // extension/src/engine/heuristics/questions.js
  var YN_QUESTION_STOPWORDS = /* @__PURE__ */ new Set([
    "a",
    "an",
    "the",
    "is",
    "are",
    "was",
    "were",
    "do",
    "does",
    "did",
    "you",
    "your",
    "yours",
    "i",
    "we",
    "us",
    "our",
    "this",
    "that",
    "these",
    "those",
    "of",
    "in",
    "on",
    "at",
    "to",
    "for",
    "and",
    "or",
    "please",
    "kindly",
    "may",
    "can",
    "will",
    "would",
    "could",
    "should",
    "have",
    "has",
    "had",
    "be",
    "it",
    "its",
    "if"
  ]);
  var YN_FINGERPRINT_STOPWORDS = /* @__PURE__ */ new Set([
    "a",
    "an",
    "the",
    "of",
    "in",
    "on",
    "at",
    "to",
    "is",
    "are",
    "do",
    "does",
    "you",
    "your",
    "this",
    "that",
    "us",
    "we",
    "our",
    "did",
    "will",
    "would",
    "or"
  ]);
  function ynNormaliseQuestionText(text) {
    const words = String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
    return words.filter((w) => !YN_FINGERPRINT_STOPWORDS.has(w)).join(" ");
  }
  var YN_QUESTION_FAMILIES = [
    ["q_hear_about_us", /\b(hear about (us|this (role|job|position|vacancy))|find (this|the) (role|job|position|vacancy)|find (us|this vacancy)|source of (this )?(application|vacancy))\b/i],
    ["q_notice_period", /\bnotice period\b|\b(how (much|long)|what) notice\b|\bnotice (must|do) you (give|need)\b/i],
    ["q_why_company", /\bwhy (this company|work (for|at|here)|(do you want to )?join us|do you want to work (for|at|here))\b|what attracts you/i],
    ["q_why_interested", /\bwhy (do you want|you want|are you interested|this role|apply)\b/i],
    ["q_salary_expectation", /\bsalary expectation|expected salary|desired salary\b/i],
    ["q_start_date", /\b(earliest|available) start date|when (can|could) you start\b/i],
    ["q_work_authorisation", /\b(right to work|authoris|authoriz|eligible to work)\b/i],
    ["q_sponsorship", /\bsponsorship|\bvisa\b/i],
    ["q_relocation", /\brelocat/i],
    ["q_background_check", /\bbackground check|criminal (record|conviction|offence|offense)|\bconvicted\b/i],
    ["q_eeo_ethnicity", /\b(hispanic|latino|latina|ethnicit|\brace\b)/i],
    ["q_eeo_gender", /\b(gender identity|self[- ]identify.*gender)\b/i],
    ["q_eeo_disability", /\bdisab/i],
    ["q_eeo_veteran", /\bveteran\b/i]
  ];
  var YN_CATEGORY_OF_FAMILY = {
    q_salary_expectation: "salary",
    q_start_date: "start_date",
    q_work_authorisation: "authorisation",
    q_sponsorship: "sponsorship",
    q_relocation: "relocation",
    q_background_check: "background_check",
    q_eeo_ethnicity: "eeo",
    q_eeo_gender: "eeo",
    q_eeo_disability: "eeo",
    q_eeo_veteran: "eeo"
  };
  var YN_NEVER_REUSE_CATEGORIES = /* @__PURE__ */ new Set([
    "eeo",
    "sponsorship",
    "authorisation",
    "salary",
    "relocation",
    "start_date",
    "background_check"
  ]);
  function ynQuestionFamily(text) {
    const q = String(text || "");
    if (!ynNormaliseQuestionText(q)) return null;
    for (const [name, pattern] of YN_QUESTION_FAMILIES) {
      if (pattern.test(q)) return name;
    }
    return "q_general";
  }
  function ynQuestionCategory(family) {
    return YN_CATEGORY_OF_FAMILY[family] || "general";
  }
  function ynRowContainerOf(el) {
    if (!el || !el.closest) return null;
    try {
      return el.closest(
        'tr, li, [class*="row" i], [class*="entry" i], [class*="item" i]'
      ) || null;
    } catch {
      return null;
    }
  }
  function ynRowIndexFor(containers, container) {
    let idx = containers.indexOf(container);
    if (idx === -1) {
      containers.push(container);
      idx = containers.length - 1;
    }
    return idx;
  }

  // extension/src/engine/heuristics/native_scan_map.js
  function ynHeuristicMapOneField(el, ctx) {
    const { document_, claimed, intents } = ctx;
    if (claimed.has(el)) return null;
    if (el.disabled || el.readOnly) return null;
    const type = (el.type || "").toLowerCase();
    if (["hidden", "submit", "button", "image", "reset"].includes(type))
      return null;
    if (type === "password") return null;
    if (typeof ynIsHoneypot === "function" && ynIsHoneypot(el, document_)) {
      claimed.add(el);
      return null;
    }
    const inPasswordScope = typeof ynFieldInAnyPasswordScope === "function" && ynFieldInAnyPasswordScope(el, document_);
    if (inPasswordScope) {
      claimed.add(el);
      return null;
    }
    if (ynInEeoSection(el)) {
      const eeoType = String(el.type || "").toLowerCase();
      const isChoiceField = eeoType === "radio" || eeoType === "checkbox";
      intents.push({
        fieldKey: "eeo",
        el,
        value: null,
        kind: ynFieldKind(el),
        confidence: "guessed",
        source: "heuristic",
        skip: "eeo",
        label: isChoiceField ? ynReportableGroupLabel(ynNearbyText(el, document_), "EEO field") : ynReportableFieldLabel(el, document_, ynNearbyText(el, document_), "EEO field")
      });
      claimed.add(el);
      return null;
    }
    const signal = ynLabelText(el, document_);
    const sensitiveHay = (signal + " " + ynFieldQuestionText(el, document_)).trim();
    if (sensitiveHay && YN_SENSITIVE_RE.test(sensitiveHay)) {
      const sensitiveIsChoice = type === "radio" || type === "checkbox";
      intents.push({
        fieldKey: "sensitive",
        el,
        value: null,
        kind: ynFieldKind(el),
        confidence: "guessed",
        source: "heuristic",
        skip: "sensitive",
        label: sensitiveIsChoice ? ynReportableGroupLabel(ynNearbyText(el, document_), "Sensitive field") : ynReportableFieldLabel(el, document_, signal, "Sensitive field")
      });
      if (type === "radio") ynClaimRadioGroup(el, claimed, document_);
      else claimed.add(el);
      return null;
    }
    if (typeof ynIsPaymentField === "function" && ynIsPaymentField(el, document_)) {
      intents.push({
        fieldKey: "payment",
        el,
        value: null,
        kind: ynFieldKind(el),
        confidence: "guessed",
        source: "heuristic",
        skip: "payment",
        label: ynReportableFieldLabel(el, document_, signal, "Payment field")
      });
      claimed.add(el);
      return null;
    }
    let mapped = null;
    let confidence = "guessed";
    if (type === "file" && /cover\s*letter|motivation/i.test(signal)) {
      mapped = { key: "letter_file", kind: "file" };
      confidence = "guessed";
    }
    const ac = (el.getAttribute("autocomplete") || "").trim().toLowerCase();
    if (!mapped && ac && ac !== "on" && ac !== "off") {
      const tokens = ac.split(/\s+/);
      for (let i = tokens.length - 1; i >= 0; i--) {
        const hit = YN_AUTOCOMPLETE_MAP[tokens[i]];
        if (hit) {
          mapped = hit;
          confidence = "exact";
          break;
        }
      }
    }
    if (!mapped) {
      const hit = ynMatchFieldIdentity(el, document_, signal);
      if (hit) {
        if (type === "file" && hit.key === "letter_text") {
          mapped = { key: "letter_file", kind: "file" };
        } else if (type === "file" && hit.kind === "file") {
          mapped = { key: hit.key, kind: "file" };
        } else if (type !== "file" || hit.kind !== "textarea") {
          mapped = { key: hit.key, kind: hit.kind };
        }
        confidence = "guessed";
      }
    }
    if (!mapped) {
      if (type === "email") {
        mapped = { key: "contact.email", kind: "text" };
        confidence = "guessed";
      } else if (type === "tel") {
        mapped = { key: "contact.phone", kind: "text" };
        confidence = "guessed";
      } else if (type === "url") {
        mapped = { key: "links.portfolio", kind: "text" };
        confidence = "guessed";
      } else if (type === "file") {
        mapped = { key: "cv_file", kind: "file" };
        confidence = "guessed";
      }
    }
    let nearby = "";
    let mappedViaNearby = false;
    if (!mapped) {
      nearby = ynNearbyText(el, document_);
      if (nearby) {
        if (YN_EEO_HEADING_RE.test(nearby)) {
          intents.push({
            fieldKey: "eeo",
            el,
            value: null,
            kind: ynFieldKind(el),
            confidence: "guessed",
            source: "heuristic",
            skip: "eeo",
            label: ynReportableFieldLabel(el, document_, nearby, "EEO field")
          });
          if (type === "radio") ynClaimRadioGroup(el, claimed, document_);
          else claimed.add(el);
          return null;
        }
        if (YN_SENSITIVE_RE.test(nearby)) {
          intents.push({
            fieldKey: "sensitive",
            el,
            value: null,
            kind: ynFieldKind(el),
            confidence: "guessed",
            source: "heuristic",
            skip: "sensitive",
            label: ynReportableFieldLabel(
              el,
              document_,
              nearby,
              "Sensitive field"
            )
          });
          if (type === "radio") ynClaimRadioGroup(el, claimed, document_);
          else claimed.add(el);
          return null;
        }
        const normalised = nearby.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
        const hit = ynRefinePatternHit(
          ynMatchLabelPatterns(normalised),
          normalised
        );
        if (hit) {
          if (type === "file" && hit.key === "letter_text") {
            mapped = { key: "letter_file", kind: "file" };
          } else if (type === "file" && hit.kind === "file") {
            mapped = { key: hit.key, kind: "file" };
          } else if (type !== "file" || hit.kind !== "textarea") {
            mapped = { key: hit.key, kind: hit.kind };
          }
          mappedViaNearby = mapped != null;
          confidence = "guessed";
        }
      }
    }
    if (!mapped) return null;
    return { mapped, confidence, nearby, mappedViaNearby, signal, type };
  }

  // extension/src/engine/heuristics/native_scan_emit.js
  function ynHeuristicResolveAndEmit(el, mapResult, ctx) {
    const { profile, document_, claimed, intents, usedKeys, workRowContainers, eduRowContainers } = ctx;
    let mapped = mapResult.mapped;
    let confidence = mapResult.confidence;
    const { nearby, mappedViaNearby, signal, type } = mapResult;
    if (mapped.kind === "generated_text" || mapped.key && String(mapped.key).startsWith("generated:")) {
      const fk = mapped.key.startsWith("generated:") ? mapped.key : "generated:" + mapped.key;
      const liveKind = ynFieldKind(el);
      if (liveKind !== "textarea" && liveKind !== "text") return;
      if (usedKeys.has(fk)) return;
      const maxLen = typeof el.maxLength === "number" && el.maxLength > 0 ? el.maxLength : null;
      intents.push({
        fieldKey: fk,
        el,
        value: null,
        kind: "generated_text",
        confidence: "guessed",
        source: "heuristic",
        // When the NEARBY rung identified this field, the nearby
        // text IS the question the composer must answer — the structured
        // signal is just ids/names that matched nothing.
        questionLabel: ((mappedViaNearby ? nearby : signal) || signal || nearby).slice(
          0,
          300
        ) || fk,
        maxLength: maxLen,
        label: ynReportableFieldLabel(
          el,
          document_,
          (mappedViaNearby ? nearby : signal) || signal || nearby
        )
      });
      claimed.add(el);
      usedKeys.add(fk);
      return;
    }
    const rowMatch = /^(work|education)\.0\.(.+)$/.exec(mapped.key);
    if (rowMatch) {
      const rowContainer = ynRowContainerOf(el);
      if (rowContainer) {
        const containers = rowMatch[1] === "work" ? workRowContainers : eduRowContainers;
        const rowIndex = ynRowIndexFor(containers, rowContainer);
        mapped = { key: `${rowMatch[1]}.${rowIndex}.${rowMatch[2]}`, kind: mapped.kind };
      }
    }
    if (usedKeys.has(mapped.key) && mapped.key !== "eeo") return;
    const emitNeedsYou = () => {
      intents.push({
        fieldKey: mapped.key,
        el,
        value: null,
        kind: ynFieldKind(el),
        confidence: "guessed",
        source: "heuristic",
        skip: "needs_you",
        label: ynReportableFieldLabel(
          el,
          document_,
          (mappedViaNearby ? nearby : signal) || signal || nearby
        )
      });
      if (type === "radio") ynClaimRadioGroup(el, claimed, document_);
      else claimed.add(el);
      usedKeys.add(mapped.key);
    };
    const isFactualKey = ynIsFactualQuestionKey(mapped.key);
    if (ynIsUnconfirmed(profile, mapped.key)) {
      if (isFactualKey) emitNeedsYou();
      return;
    }
    let value = ynProfileGet(profile, mapped.key);
    if ((mapped.key.startsWith("right_to_work.") || mapped.key.startsWith("eligibility_extra.")) && (value === null || value === void 0)) {
      emitNeedsYou();
      return;
    }
    if (mapped.key === "derived.years_of_experience") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        emitNeedsYou();
        return;
      }
      value = String(value);
      confidence = "guessed";
    }
    if (mapped.key === "derived.highest_qualification") {
      if (!ynValueUsable(value)) {
        emitNeedsYou();
        return;
      }
      confidence = "guessed";
    }
    if (mapped.kind === "checkbox" || mapped.kind === "radio") {
      if (typeof value === "string")
        value = /^(true|yes|1)$/i.test(value.trim());
      if (typeof value !== "boolean") {
        if (isFactualKey) emitNeedsYou();
        return;
      }
    } else if (ynIsBooleanFieldKey(mapped.key)) {
      if (typeof value === "string")
        value = /^(true|yes|1)$/i.test(value.trim());
      if (typeof value !== "boolean") {
        if (isFactualKey) emitNeedsYou();
        return;
      }
    } else if (!ynValueUsable(value)) {
      if (isFactualKey) emitNeedsYou();
      return;
    }
    let targetEl = el;
    let kind = mapped.kind === "file" ? "file" : mapped.kind === "checkbox" ? "checkbox" : ynFieldKind(el) === "select" ? "select" : ynFieldKind(el) === "combobox" ? "combobox" : ynFieldKind(el) === "textarea" ? "textarea" : ynFieldKind(el) === "radio" ? "radio" : ynFieldKind(el) === "date" ? "date" : mapped.kind || "text";
    if (YN_DATE_FIELD_KEYS.has(mapped.key) && ["text", "number", "tel"].includes(type) && ynDatePartRole(el, document_)) {
      const group = ynDateGroup(el, document_);
      if (group) {
        intents.push({
          fieldKey: mapped.key,
          el: group.day,
          els: group,
          value,
          kind: "date_parts",
          confidence: "guessed",
          source: "heuristic",
          label: ynReportableFieldLabel(el, document_, nearby || signal)
        });
        claimed.add(group.day);
        claimed.add(group.month);
        claimed.add(group.year);
        usedKeys.add(mapped.key);
      }
      return;
    }
    if (ynIsBooleanFieldKey(mapped.key) && type === "radio") {
      const resolved = ynResolveBooleanRadio(el, value, document_);
      if (!resolved) {
        ynClaimRadioGroup(el, claimed, document_);
        return;
      }
      targetEl = resolved.el;
      value = resolved.value;
      kind = "radio";
      ynClaimRadioGroup(el, claimed, document_);
    } else if (ynIsBooleanFieldKey(mapped.key) && ynFieldKind(el) === "select") {
      value = value ? "Yes" : "No";
      kind = "select";
    } else if (ynIsBooleanFieldKey(mapped.key) && type === "checkbox") {
      kind = "checkbox";
    } else if (!ynIsBooleanFieldKey(mapped.key) && type === "radio" && typeof value === "string") {
      const resolved = ynResolveOptionRadio(el, value, document_);
      ynClaimRadioGroup(el, claimed, document_);
      if (!resolved) return;
      targetEl = resolved.el;
      value = true;
      kind = "radio";
    }
    intents.push({
      fieldKey: mapped.key,
      el: targetEl,
      value: kind === "file" ? value : value,
      kind,
      confidence,
      source: "heuristic",
      label: mappedViaNearby ? ynReportableFieldLabel(targetEl, document_, nearby) : ynReportableFieldLabel(targetEl, document_, nearby || signal)
    });
    if (type !== "radio") claimed.add(targetEl);
    usedKeys.add(mapped.key);
  }

  // extension/src/engine/heuristics/aria_scan.js
  function ynHeuristicAriaChoiceIntents(ctx) {
    const { profile, document_, claimed, intents, usedKeys } = ctx;
    const containers = typeof ynQueryDeep === "function" ? ynQueryDeep(
      document_,
      '[role="radiogroup"], [role="group"], [role="list"]'
    ) : [
      ...document_.querySelectorAll(
        '[role="radiogroup"], [role="group"], [role="list"]'
      )
    ];
    const optLabel = (o) => (o.getAttribute("aria-label") || o.textContent || "").replace(/\s+/g, " ").trim();
    const CHOICE_CONTAINER_SEL = '[role="radiogroup"], [role="group"], [role="list"]';
    for (const c of containers) {
      let options = [];
      try {
        options = [
          ...c.querySelectorAll('[role="radio"], [role="checkbox"]')
        ].filter((o) => (o.tagName || "").toUpperCase() !== "INPUT");
      } catch {
        continue;
      }
      options = options.filter((o) => {
        try {
          return o.closest(CHOICE_CONTAINER_SEL) === c;
        } catch {
          return true;
        }
      });
      if (options.length < 2) continue;
      if (options.some((o) => claimed.has(o))) continue;
      const claimAllOptions = () => {
        for (const o of options) claimed.add(o);
      };
      if (typeof ynIsHoneypot === "function" && options.some((o) => ynIsHoneypot(o, document_))) {
        claimAllOptions();
        continue;
      }
      if (typeof ynFieldInAnyPasswordScope === "function" && options.some((o) => ynFieldInAnyPasswordScope(o, document_))) {
        claimAllOptions();
        continue;
      }
      const question = ynGroupLegend(options[0], document_) || ynNearbyText(c, document_);
      if (!question) continue;
      if (ynInEeoSection(options[0])) {
        intents.push({
          fieldKey: "eeo",
          el: options[0],
          value: null,
          kind: "aria_choice",
          confidence: "guessed",
          source: "heuristic",
          skip: "eeo",
          label: ynReportableGroupLabel(question, "EEO field")
        });
        claimAllOptions();
        continue;
      }
      const claimAll = () => {
        for (const o of options) claimed.add(o);
      };
      if (YN_EEO_HEADING_RE.test(question)) {
        intents.push({
          fieldKey: "eeo",
          el: options[0],
          value: null,
          kind: "aria_choice",
          confidence: "guessed",
          source: "heuristic",
          skip: "eeo",
          label: ynReportableGroupLabel(question, "EEO field")
        });
        claimAll();
        continue;
      }
      if (YN_SENSITIVE_RE.test(question)) {
        intents.push({
          fieldKey: "sensitive",
          el: options[0],
          value: null,
          kind: "aria_choice",
          confidence: "guessed",
          source: "heuristic",
          skip: "sensitive",
          label: ynReportableGroupLabel(question, "Sensitive field")
        });
        claimAll();
        continue;
      }
      const normalised = question.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
      const hit = ynRefinePatternHit(
        ynMatchLabelPatterns(normalised),
        normalised
      );
      if (!hit || usedKeys.has(hit.key)) continue;
      const ariaUnconfirmed = ynIsUnconfirmed(profile, hit.key);
      let value = ynProfileGet(profile, hit.key);
      const isBool = ynIsBooleanFieldKey(hit.key);
      if (isBool && typeof value === "string") {
        value = /^(true|yes|1)$/i.test(value.trim());
      }
      const unset = ariaUnconfirmed || value === null || value === void 0 || value === "" || isBool && typeof value !== "boolean";
      if (unset) {
        if (ynIsFactualQuestionKey(hit.key)) {
          intents.push({
            fieldKey: hit.key,
            el: options[0],
            value: null,
            kind: "aria_choice",
            confidence: "guessed",
            source: "heuristic",
            skip: "needs_you",
            label: ynReportableFieldLabel(options[0], document_, question)
          });
          claimAll();
          usedKeys.add(hit.key);
        }
        continue;
      }
      let target = null;
      if (isBool) {
        const want = Boolean(value);
        const yesRe = /^(yes|true)\b/i;
        const noRe = /^(no|false)\b/i;
        const matches = options.filter((o) => {
          const l = optLabel(o);
          return (want ? yesRe : noRe).test(l) && !(want ? noRe : yesRe).test(l);
        });
        target = matches.length === 1 ? matches[0] : null;
      } else if (typeof value === "string") {
        const wantS = value.trim().toLowerCase();
        const labelled = options.map((o) => ({ o, l: optLabel(o).toLowerCase() })).filter((x) => x.l);
        const uniq = (arr) => arr.length === 1 ? arr[0].o : null;
        target = uniq(labelled.filter((x) => x.l === wantS)) || uniq(labelled.filter((x) => x.l.startsWith(wantS))) || uniq(labelled.filter((x) => x.l.includes(wantS)));
      }
      claimAll();
      if (!target) continue;
      intents.push({
        fieldKey: hit.key,
        el: target,
        value: true,
        kind: "aria_choice",
        confidence: "guessed",
        source: "heuristic",
        label: ynReportableFieldLabel(target, document_, question)
      });
      usedKeys.add(hit.key);
    }
  }

  // extension/src/engine/heuristics/index.js
  function ynHeuristicIntents(profile, doc, alreadyClaimedEls) {
    const document_ = doc || document;
    const claimed = alreadyClaimedEls || /* @__PURE__ */ new Set();
    const intents = [];
    const usedKeys = /* @__PURE__ */ new Set();
    const workRowContainers = [];
    const eduRowContainers = [];
    const pageAccountWall = typeof ynPageIsAccountCreation === "function" && ynPageIsAccountCreation(document_);
    if (pageAccountWall) {
      return [];
    }
    const fields = typeof ynQueryDeep === "function" ? ynQueryDeep(document_, "input, textarea, select") : [...document_.querySelectorAll("input, textarea, select")];
    const ctx = {
      profile,
      document_,
      claimed,
      intents,
      usedKeys,
      workRowContainers,
      eduRowContainers
    };
    for (const el of fields) {
      const mapResult = ynHeuristicMapOneField(el, ctx);
      if (!mapResult) continue;
      ynHeuristicResolveAndEmit(el, mapResult, ctx);
    }
    ynHeuristicAriaChoiceIntents(ctx);
    return intents;
  }
  globalThis.YN_EEO_HEADING_RE = YN_EEO_HEADING_RE;
  globalThis.YN_SENSITIVE_RE = YN_SENSITIVE_RE;
  globalThis.YN_AUTOCOMPLETE_MAP = YN_AUTOCOMPLETE_MAP;
  globalThis.YN_LABEL_PATTERNS = YN_LABEL_PATTERNS;
  globalThis.YN_EARLIEST_START_EXCLUDE_RE = YN_EARLIEST_START_EXCLUDE_RE;
  globalThis.YN_PHONE_ADJUNCT_RE = YN_PHONE_ADJUNCT_RE;
  globalThis.YN_SKILL_EXPERIENCE_RE = YN_SKILL_EXPERIENCE_RE;
  globalThis.ynProfileGet = ynProfileGet;
  globalThis.ynIsUnconfirmed = ynIsUnconfirmed;
  globalThis.ynValueUsable = ynValueUsable;
  globalThis.ynAriaLabelledByText = ynAriaLabelledByText;
  globalThis.ynAriaDescribedByText = ynAriaDescribedByText;
  globalThis.ynIdConventionLabel = ynIdConventionLabel;
  globalThis.ynLabelAttrOwnText = ynLabelAttrOwnText;
  globalThis.ynAncestorLabelAttrText = ynAncestorLabelAttrText;
  globalThis.ynShadowHostSignalText = ynShadowHostSignalText;
  globalThis.ynDataIdentityText = ynDataIdentityText;
  globalThis.ynLabelText = ynLabelText;
  globalThis.ynHumanFieldLabel = ynHumanFieldLabel;
  globalThis.ynReportableFieldLabel = ynReportableFieldLabel;
  globalThis.ynReportableGroupLabel = ynReportableGroupLabel;
  globalThis.ynSanitizeIdentity = ynSanitizeIdentity;
  globalThis.ynGroupLegend = ynGroupLegend;
  globalThis.ynFieldIdentityRaw = ynFieldIdentityRaw;
  globalThis.ynFieldIdentitySignal = ynFieldIdentitySignal;
  globalThis.ynFieldQuestionText = ynFieldQuestionText;
  globalThis.ynInEeoSection = ynInEeoSection;
  globalThis.ynNearbyText = ynNearbyText;
  globalThis.ynFieldKind = ynFieldKind;
  globalThis.ynMatchLabelPatterns = ynMatchLabelPatterns;
  globalThis.ynRefinePatternHit = ynRefinePatternHit;
  globalThis.ynMatchFieldIdentity = ynMatchFieldIdentity;
  globalThis.YN_DATE_FIELD_KEYS = YN_DATE_FIELD_KEYS;
  globalThis.ynDatePartRole = ynDatePartRole;
  globalThis.ynDateGroup = ynDateGroup;
  globalThis.ynIsFactualQuestionKey = ynIsFactualQuestionKey;
  globalThis.ynIsBooleanFieldKey = ynIsBooleanFieldKey;
  globalThis.ynRadioOptionLabel = ynRadioOptionLabel;
  globalThis.ynResolveBooleanRadio = ynResolveBooleanRadio;
  globalThis.ynResolveOptionRadio = ynResolveOptionRadio;
  globalThis.ynClaimRadioGroup = ynClaimRadioGroup;
  globalThis.YN_QUESTION_STOPWORDS = YN_QUESTION_STOPWORDS;
  globalThis.YN_FINGERPRINT_STOPWORDS = YN_FINGERPRINT_STOPWORDS;
  globalThis.ynNormaliseQuestionText = ynNormaliseQuestionText;
  globalThis.YN_QUESTION_FAMILIES = YN_QUESTION_FAMILIES;
  globalThis.YN_CATEGORY_OF_FAMILY = YN_CATEGORY_OF_FAMILY;
  globalThis.YN_NEVER_REUSE_CATEGORIES = YN_NEVER_REUSE_CATEGORIES;
  globalThis.ynQuestionFamily = ynQuestionFamily;
  globalThis.ynQuestionCategory = ynQuestionCategory;
  globalThis.ynRowContainerOf = ynRowContainerOf;
  globalThis.ynRowIndexFor = ynRowIndexFor;
  globalThis.ynHeuristicIntents = ynHeuristicIntents;
})();
