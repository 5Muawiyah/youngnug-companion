(() => {
  // extension/src/engine/skills_fill/index.js
  function ynSkillNorm(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9+#.]/g, "");
  }
  function ynSkillStripQualifier(s) {
    return String(s || "").replace(/\s*\([^)]*\)\s*$/, "");
  }
  function ynSkillTextMatches(candidate, option) {
    const c = ynSkillNorm(candidate);
    if (c === "") return false;
    return c === ynSkillNorm(option) || c === ynSkillNorm(ynSkillStripQualifier(option));
  }
  function ynPickSkillMatch(candidates, optionTexts) {
    for (const candidate of candidates) {
      const index = optionTexts.findIndex((opt) => ynSkillTextMatches(candidate, opt));
      if (index !== -1) return { index, text: optionTexts[index] };
    }
    return null;
  }
  var YN_SKILL_ALIASES = {
    js: ["JavaScript"],
    ts: ["TypeScript"],
    py: ["Python"],
    golang: ["Go"],
    "k8s": ["Kubernetes"],
    ml: ["Machine Learning"],
    nlp: ["Natural Language Processing"]
  };
  function ynSkillCandidates(skill) {
    const alias = YN_SKILL_ALIASES[String(skill || "").trim().toLowerCase()];
    return alias ? [skill, ...alias] : [skill];
  }
  function ynSkillOptionText(el) {
    return String(el && el.textContent || "").trim();
  }
  function ynSkillSetInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: value })
    );
  }
  async function ynFillSkills(host, skills) {
    const settleMs = 800;
    const pollMs = 25;
    const filled = [];
    const skipped = [];
    const list = Array.isArray(skills) ? skills : [];
    const input = host instanceof HTMLInputElement ? host : typeof ynQueryDeep === "function" ? ynQueryDeep(host, "input")[0] : host.querySelector && host.querySelector("input");
    if (!(input instanceof HTMLInputElement)) {
      return { filled, skipped: list.slice() };
    }
    for (const skill of list) {
      input.focus();
      ynSkillSetInputValue(input, skill);
      let options = [];
      const start = Date.now();
      do {
        await new Promise((r) => setTimeout(r, pollMs));
        options = typeof ynQueryDeep === "function" ? ynQueryDeep(host, '[role="option"]') : Array.from(host.querySelectorAll('[role="option"]'));
      } while (options.length === 0 && Date.now() - start < settleMs);
      const match = ynPickSkillMatch(
        ynSkillCandidates(skill),
        options.map(ynSkillOptionText)
      );
      if (!match) {
        skipped.push(skill);
        ynSkillSetInputValue(input, "");
        continue;
      }
      const hit = options[match.index];
      const guard = ynKitGuards.clickGuard;
      if (!guard || guard(hit)) {
        skipped.push(skill);
        ynSkillSetInputValue(input, "");
        continue;
      }
      hit.click();
      filled.push(skill);
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return { filled, skipped };
  }
  function ynFillCheckboxGroup(checkboxEls, wantedValues, opts) {
    const options = opts || {};
    const guard = ynKitGuards.clickGuard;
    const wanted = (Array.isArray(wantedValues) ? wantedValues : []).map((v) => ({
      raw: v,
      norm: ynSkillNorm(v)
    }));
    const ticked = [];
    const usedWanted = /* @__PURE__ */ new Set();
    for (const cb of Array.isArray(checkboxEls) ? checkboxEls : []) {
      const label = options.labelOf ? options.labelOf(cb) : cb.closest("label") && cb.closest("label").textContent || cb.getAttribute("aria-label") || "";
      const norm = ynSkillNorm(label);
      const hit = wanted.find((w) => w.norm === norm && !usedWanted.has(w.raw));
      if (!hit) continue;
      usedWanted.add(hit.raw);
      if (cb.checked) {
        ticked.push(hit.raw);
        continue;
      }
      if (!guard || guard(cb)) continue;
      cb.click();
      if (cb.checked) ticked.push(hit.raw);
    }
    const skipped = wanted.filter((w) => !usedWanted.has(w.raw)).map((w) => w.raw);
    return { ticked, skipped };
  }
  globalThis.ynSkillNorm = ynSkillNorm;
  globalThis.ynSkillStripQualifier = ynSkillStripQualifier;
  globalThis.ynSkillTextMatches = ynSkillTextMatches;
  globalThis.ynPickSkillMatch = ynPickSkillMatch;
  globalThis.YN_SKILL_ALIASES = YN_SKILL_ALIASES;
  globalThis.ynSkillCandidates = ynSkillCandidates;
  globalThis.ynSkillOptionText = ynSkillOptionText;
  globalThis.ynSkillSetInputValue = ynSkillSetInputValue;
  globalThis.ynFillSkills = ynFillSkills;
  globalThis.ynFillCheckboxGroup = ynFillCheckboxGroup;
})();
if (typeof window !== "undefined") {
  window.ynFillSkills = globalThis.ynFillSkills;
  window.ynFillCheckboxGroup = globalThis.ynFillCheckboxGroup;
  window.ynSkillCandidates = globalThis.ynSkillCandidates;
  window.ynPickSkillMatch = globalThis.ynPickSkillMatch;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ynFillSkills: globalThis.ynFillSkills,
    ynFillCheckboxGroup: globalThis.ynFillCheckboxGroup,
    ynSkillCandidates: globalThis.ynSkillCandidates,
    ynPickSkillMatch: globalThis.ynPickSkillMatch,
  };
}
