// common/own_rules.js — the student's OWN per-site rules, adblock-filter
// style. One rule per line, four shapes:
//
//   site##selector       capture rule — a CSS selector this site's advert
//                        title/body lives at (the first ## line for a site
//                        is the title selector, the second is the body
//                        selector; give one line to use it for both).
//   site label=key       map a field whose VISIBLE LABEL reads exactly
//                        "label" to the profile path "key" (contact.email,
//                        answers.notice_period, …) — a space separates the
//                        site from the label text, which may itself contain
//                        spaces.
//   site!!label          never fill the field labelled "label" on this
//                        site, whatever any other rung would have guessed.
//   site$$               never act on this site at all: no capture, no
//                        fill, from any rule or any other rung.
//
// Parsing and validation live here so the SAME rules mean the SAME thing
// wherever they are read: the options page (validates on save), capture.js
// (## rules, converted to the shape ynDevSelectorJob already reads), and
// the fill ladder (label=key / !! rules, content/filler.js's ynPlanRungs).
// Every shipped file that reads storage re-validates for itself — a stored
// blob is writable by anything in the profile, so the read side never
// trusts it blindly (the same rule content/capture.js's existing per-site
// dev selectors already follow).
//
// SAFETY: a rule is a MAPPING, never a bypass. An own-rule intent is built
// with exactly the shape every other rung's intent has (fieldKey, el,
// value, kind, confidence, source) and is executed through the SAME
// ynExecuteIntents every other intent goes through — the password-scope,
// payment, and sensitive/truth/policy guards there run at WRITE TIME, on
// the live element, regardless of which rung produced the intent. A rule
// cannot make a password field, an EEO field, a payment field or a submit
// control fillable; it can only tell the engine what a field the guards
// already allow SHOULD receive. See MESSAGE_CONTRACT.md's Own rules table.

const YN_OWN_RULES_KEY = "ownRules";
const YN_OWN_RULES_MAX_LINES = 300;
const YN_OWN_RULES_MAX_CHARS = 20000;

// The same bare-hostname shape the existing dev-selector feature validates
// against (content/capture.js's ynDevRuleMatches / popup.js's
// YN_DEV_HOST_RE), duplicated by value for the same reason every other
// re-validation in this codebase is: two independent worlds, one storage
// blob neither fully trusts.
const YN_OWN_RULE_HOST_RE =
  /^(\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const YN_OWN_RULE_SELECTOR_RE = /^[a-zA-Z0-9\s.#:_\-,>~+*()="'[\]]{1,200}$/;

// Every profile path the engine can actually resolve (ynProfileGet) or
// treat as a document key — the exact set a "label=key" rule may target.
// Kept as ONE list here rather than re-derived from YN_LABEL_PATTERNS at
// runtime, so a rule's validity does not depend on load order or on a
// heuristics-layer global being defined yet when a rule is merely being
// SAVED on the options page (no fill is running there).
const YN_OWN_RULE_KNOWN_KEYS = new Set([
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
  "letter_text",
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

/** Whitespace-collapsed, trimmed, lowercased — the SAME normalisation on
 * both the rule's stored label and a live field's resolved label, so
 * "Notice period" and "notice   period" (a page's own odd markup
 * whitespace) still match, and neither side has to guess the other's
 * exact casing. */
function ynOwnRuleNormLabel(s) {
  return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * One line -> {rule} | {error}. Never throws; a line this cannot make
 * sense of is always an error with a human reason, never a silent skip
 * (a silent skip is a rule the student believes is active and is not).
 */
function ynParseOwnRuleLine(rawLine) {
  const line = String(rawLine || "").trim();
  if (!line) return null; // blank line: not a rule, not an error
  // Comments: a line starting with "!" alone (no site before it) — the
  // one concession to adblock-filter convention, since "!!" already means
  // something else here and a bare "!" cannot collide with any valid site.
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
    const site = line.slice(0, spaceIndex).toLowerCase();
    if (!ynOwnRuleValidSite(site)) {
      return { error: `unknown site shape: "${site}"` };
    }
    const rest = line.slice(spaceIndex + 1);
    const eq = rest.lastIndexOf("=");
    if (eq === -1) {
      return { error: "bad operator: expected ##, !!, $$ or <label>=<profile.key>" };
    }
    const label = rest.slice(0, eq).trim();
    const key = rest.slice(eq + 1).trim();
    if (!label) return { error: "empty selector" };
    if (!key || !YN_OWN_RULE_KNOWN_KEYS.has(key)) {
      return { error: `unknown profile key: "${key}"` };
    }
    return { rule: { op: "map", site, label, key } };
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
  // "$$" — the site-block rule takes NOTHING after it.
  if (rest.trim()) {
    return { error: "bad operator: $$ blocks the whole site and takes no text after it" };
  }
  return { rule: { op: "block", site } };
}

/**
 * The whole text box -> {rules, errors}. `errors` is one entry per bad
 * line, `{line, message}`, 1-indexed exactly as the student sees it in
 * the textarea — never a silent drop.
 */
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

/** The inverse of parsing — round-trips a rule list back to the same text
 * shape a student would have typed, for export and for re-rendering the
 * textarea after a delete. */
function ynSerializeOwnRules(rules) {
  return (Array.isArray(rules) ? rules : [])
    .map((r) => {
      if (!r) return "";
      if (r.op === "selector") return `${r.site}##${r.selector}`;
      if (r.op === "never") return `${r.site}!!${r.label}`;
      if (r.op === "block") return `${r.site}$$`;
      if (r.op === "map") return `${r.site} ${r.label}=${r.key}`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Every rule matching `host`, split by kind, with the site-block checked
 * FIRST: a blocked site returns everything empty, so a caller never has to
 * remember to check `blocked` before using the other three arrays. */
function ynOwnRulesForHost(rules, host) {
  const list = (Array.isArray(rules) ? rules : []).filter(
    (r) => r && ynOwnRuleHostMatches(r.site, host),
  );
  if (list.some((r) => r.op === "block")) {
    return { blocked: true, maps: [], selectors: [], never: [] };
  }
  return {
    blocked: false,
    maps: list.filter((r) => r.op === "map"),
    selectors: list.filter((r) => r.op === "selector"),
    never: list.filter((r) => r.op === "never").map((r) => ynOwnRuleNormLabel(r.label)),
  };
}

/**
 * `##` rules -> the {pattern, titleSelector, bodySelector} shape
 * content/capture.js's existing ynDevSelectorJob already reads (the
 * dev-selector feature) — reuses that function's own site-match,
 * selector-validation and read logic verbatim rather than duplicating it.
 * The first `##` line for a site is the title selector, the second is the
 * body; a site with only one line uses it for both, since a single-field
 * advert page (an internal ATS listing with just a heading, say) still
 * wants SOMETHING captured rather than nothing.
 */
function ynOwnRuleCaptureRules(rules) {
  const bySite = new Map();
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
      bodySelector: sels[1] || sels[0] || "",
    });
  }
  return out;
}

/**
 * `label=key` rules -> fill intents, for the CURRENT page. Exactly the
 * intent shape every other rung produces (fieldKey/el/value/kind/
 * confidence/source), so ynExecuteIntents' write-time guards (password
 * scope, payment, sensitive/truth/policy) apply to these exactly as they
 * do to a heuristics guess — this function claims NOTHING past that; it
 * only says which element a rule's label matched and what value the
 * profile holds for the key it named.
 *
 * `profile` is whatever shape the caller already has (the fill-plan for an
 * Approved job, or the whole-profile bundle the generic any-page path
 * builds) — both use the SAME dotted paths this module's known-key list
 * carries, and ynProfileGet (content/heuristics.js) is shape-agnostic dot
 * traversal, so one function serves both fill paths.
 *
 * A `## `-blocked site (`ynOwnRulesForHost.blocked`) is checked by the
 * CALLER, which must not call this at all for a blocked host — kept as the
 * caller's job so the one "never act on this site" decision is made once,
 * not re-derived per rung.
 */
function ynOwnRuleFillIntents(rules, host, doc, profile) {
  const document_ = doc || document;
  const { maps, never } = ynOwnRulesForHost(rules, host);
  const intents = [];
  if (maps.length) {
    const claimed = new Set();
    const fields = document_.querySelectorAll("input, textarea, select");
    for (const rule of maps) {
      const wantLabel = ynOwnRuleNormLabel(rule.label);
      let target = null;
      for (const field of fields) {
        if (claimed.has(field)) continue;
        const own =
          typeof ynHumanFieldLabel === "function"
            ? ynHumanFieldLabel(field, document_)
            : "";
        if (own && ynOwnRuleNormLabel(own) === wantLabel) {
          target = field;
          break;
        }
      }
      if (!target) continue;
      const value =
        typeof ynProfileGet === "function"
          ? ynProfileGet(profile, rule.key)
          : undefined;
      if (value === undefined || value === null || value === "") continue;
      claimed.add(target);
      const tag = (target.tagName || "").toUpperCase();
      const inputType = (target.type || "").toLowerCase();
      intents.push({
        fieldKey: rule.key,
        el: target,
        value,
        kind:
          tag === "SELECT"
            ? "select"
            : tag === "TEXTAREA"
              ? "textarea"
              : inputType === "checkbox"
                ? "checkbox"
                : "text",
        confidence: "guessed",
        source: "own_rule",
      });
    }
  }
  return { intents, neverLabels: never };
}

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
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
