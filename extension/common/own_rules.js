(() => {
  // extension/src/common/own_rules/index.js
  var YN_OWN_RULES_KEY = "ownRules";
  var YN_OWN_RULES_MAX_LINES = 300;
  var YN_OWN_RULES_MAX_CHARS = 2e4;
  var YN_OWN_RULE_HOST_RE = /^(\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  var YN_OWN_RULE_SELECTOR_RE = /^[a-zA-Z0-9\s.#:_\-,>~+*()="'[\]]{1,200}$/;
  var YN_OWN_RULE_KNOWN_KEYS = /* @__PURE__ */ new Set([
    "contact.first_name",
    "contact.last_name",
    "contact.middle_name",
    "contact.full_name",
    "contact.email",
    "contact.phone",
    "address.line1",
    "address.line2",
    "address.city",
    "address.region",
    "address.postcode",
    "address.country",
    "links.linkedin",
    "links.github",
    "links.portfolio",
    "eligibility_extra.uk_driving_licence",
    "eligibility_extra.willing_to_relocate",
    "right_to_work.uk_rtw",
    "right_to_work.needs_sponsorship",
    "answers.earliest_start",
    "answers.notice_period",
    "answers.salary_expectation",
    "education.0.institution",
    "education.0.qualification",
    "work.0.employer",
    "work.0.title",
    "cv_file",
    "letter_file",
    "letter_text"
  ]);
  function ynOwnRuleHostMatches(pattern, host) {
    const p = String(pattern || "").toLowerCase().trim();
    const h = String(host || "").toLowerCase();
    if (!p) return false;
    if (p.startsWith("*.")) {
      const base = p.slice(2);
      return h === base || h.endsWith("." + base);
    }
    return h === p;
  }
  function ynOwnRuleValidSite(site) {
    return YN_OWN_RULE_HOST_RE.test(String(site || "").trim());
  }
  function ynOwnRuleValidSelector(sel) {
    const s = String(sel || "").trim();
    if (!s || !YN_OWN_RULE_SELECTOR_RE.test(s)) return false;
    if (/javascript:|expression\(|url\(/i.test(s)) return false;
    return true;
  }
  function ynOwnRuleNormLabel(s) {
    return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function ynParseOwnRuleLine(rawLine) {
    const line = String(rawLine || "").trim();
    if (!line) return null;
    if (line.startsWith("!") && !line.startsWith("!!")) return null;
    const markers = ["##", "!!", "$$"];
    let opIndex = -1;
    let opMarker = "";
    for (const m of markers) {
      const i = line.indexOf(m);
      if (i !== -1 && (opIndex === -1 || i < opIndex)) {
        opIndex = i;
        opMarker = m;
      }
    }
    const spaceIndex = line.indexOf(" ");
    const useSpaceShape = spaceIndex !== -1 && (opIndex === -1 || spaceIndex < opIndex);
    if (useSpaceShape) {
      const site2 = line.slice(0, spaceIndex).toLowerCase();
      if (!ynOwnRuleValidSite(site2)) {
        return { error: `unknown site shape: "${site2}"` };
      }
      const rest2 = line.slice(spaceIndex + 1);
      const eq = rest2.lastIndexOf("=");
      if (eq === -1) {
        return { error: "bad operator: expected ##, !!, $$ or <label>=<profile.key>" };
      }
      const label = rest2.slice(0, eq).trim();
      const key = rest2.slice(eq + 1).trim();
      if (!label) return { error: "empty selector" };
      if (!key || !YN_OWN_RULE_KNOWN_KEYS.has(key)) {
        return { error: `unknown profile key: "${key}"` };
      }
      return { rule: { op: "map", site: site2, label, key } };
    }
    if (opIndex === -1) {
      return { error: "bad operator: expected ##, !!, $$ or <label>=<profile.key>" };
    }
    const site = line.slice(0, opIndex).toLowerCase();
    if (!ynOwnRuleValidSite(site)) {
      return { error: `unknown site shape: "${site}"` };
    }
    const rest = line.slice(opIndex + 2);
    if (opMarker === "##") {
      if (!ynOwnRuleValidSelector(rest)) return { error: "empty selector" };
      return { rule: { op: "selector", site, selector: rest.trim() } };
    }
    if (opMarker === "!!") {
      if (!rest.trim()) return { error: "empty selector" };
      return { rule: { op: "never", site, label: rest.trim() } };
    }
    if (rest.trim()) {
      return { error: "bad operator: $$ blocks the whole site and takes no text after it" };
    }
    return { rule: { op: "block", site } };
  }
  function ynParseOwnRules(text) {
    const src = String(text || "").slice(0, YN_OWN_RULES_MAX_CHARS);
    const lines = src.split(/\r?\n/).slice(0, YN_OWN_RULES_MAX_LINES);
    const rules = [];
    const errors = [];
    lines.forEach((raw, idx) => {
      const parsed = ynParseOwnRuleLine(raw);
      if (!parsed) return;
      if (parsed.error) {
        errors.push({ line: idx + 1, message: parsed.error });
      } else {
        rules.push({ ...parsed.rule, line: idx + 1 });
      }
    });
    return { rules, errors };
  }
  function ynSerializeOwnRules(rules) {
    return (Array.isArray(rules) ? rules : []).map((r) => {
      if (!r) return "";
      if (r.op === "selector") return `${r.site}##${r.selector}`;
      if (r.op === "never") return `${r.site}!!${r.label}`;
      if (r.op === "block") return `${r.site}$$`;
      if (r.op === "map") return `${r.site} ${r.label}=${r.key}`;
      return "";
    }).filter(Boolean).join("\n");
  }
  function ynOwnRulesForHost(rules, host) {
    const list = (Array.isArray(rules) ? rules : []).filter(
      (r) => r && ynOwnRuleHostMatches(r.site, host)
    );
    if (list.some((r) => r.op === "block")) {
      return { blocked: true, maps: [], selectors: [], never: [] };
    }
    return {
      blocked: false,
      maps: list.filter((r) => r.op === "map"),
      selectors: list.filter((r) => r.op === "selector"),
      never: list.filter((r) => r.op === "never").map((r) => ynOwnRuleNormLabel(r.label))
    };
  }
  function ynOwnRuleCaptureRules(rules) {
    const bySite = /* @__PURE__ */ new Map();
    for (const r of Array.isArray(rules) ? rules : []) {
      if (!r || r.op !== "selector") continue;
      const arr = bySite.get(r.site) || [];
      arr.push(r.selector);
      bySite.set(r.site, arr);
    }
    const out = [];
    for (const [site, sels] of bySite) {
      out.push({
        pattern: site,
        titleSelector: sels[0] || "",
        bodySelector: sels[1] || sels[0] || ""
      });
    }
    return out;
  }
  function ynOwnRuleFillIntents(rules, host, doc, profile) {
    const document_ = doc || document;
    const { maps, never } = ynOwnRulesForHost(rules, host);
    const intents = [];
    if (maps.length) {
      const claimed = /* @__PURE__ */ new Set();
      const fields = document_.querySelectorAll("input, textarea, select");
      for (const rule of maps) {
        const wantLabel = ynOwnRuleNormLabel(rule.label);
        let target = null;
        for (const field of fields) {
          if (claimed.has(field)) continue;
          const own = typeof ynHumanFieldLabel === "function" ? ynHumanFieldLabel(field, document_) : "";
          if (own && ynOwnRuleNormLabel(own) === wantLabel) {
            target = field;
            break;
          }
        }
        if (!target) continue;
        const value = typeof ynProfileGet === "function" ? ynProfileGet(profile, rule.key) : void 0;
        if (value === void 0 || value === null || value === "") continue;
        claimed.add(target);
        const tag = (target.tagName || "").toUpperCase();
        const inputType = (target.type || "").toLowerCase();
        intents.push({
          fieldKey: rule.key,
          el: target,
          value,
          kind: tag === "SELECT" ? "select" : tag === "TEXTAREA" ? "textarea" : inputType === "checkbox" ? "checkbox" : "text",
          confidence: "guessed",
          source: "own_rule"
        });
      }
    }
    return { intents, neverLabels: never };
  }
  globalThis.YN_OWN_RULES_KEY = YN_OWN_RULES_KEY;
  globalThis.YN_OWN_RULES_MAX_LINES = YN_OWN_RULES_MAX_LINES;
  globalThis.YN_OWN_RULES_MAX_CHARS = YN_OWN_RULES_MAX_CHARS;
  globalThis.YN_OWN_RULE_HOST_RE = YN_OWN_RULE_HOST_RE;
  globalThis.YN_OWN_RULE_SELECTOR_RE = YN_OWN_RULE_SELECTOR_RE;
  globalThis.YN_OWN_RULE_KNOWN_KEYS = YN_OWN_RULE_KNOWN_KEYS;
  globalThis.ynOwnRuleHostMatches = ynOwnRuleHostMatches;
  globalThis.ynOwnRuleValidSite = ynOwnRuleValidSite;
  globalThis.ynOwnRuleValidSelector = ynOwnRuleValidSelector;
  globalThis.ynOwnRuleNormLabel = ynOwnRuleNormLabel;
  globalThis.ynParseOwnRuleLine = ynParseOwnRuleLine;
  globalThis.ynParseOwnRules = ynParseOwnRules;
  globalThis.ynSerializeOwnRules = ynSerializeOwnRules;
  globalThis.ynOwnRulesForHost = ynOwnRulesForHost;
  globalThis.ynOwnRuleCaptureRules = ynOwnRuleCaptureRules;
  globalThis.ynOwnRuleFillIntents = ynOwnRuleFillIntents;
})();
