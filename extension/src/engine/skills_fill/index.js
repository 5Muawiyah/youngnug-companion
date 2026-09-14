// content/skills_fill.js — the skills/multi-value typeahead (tag) fill loop,
// and a mapper for multi-select checkbox groups (skills, languages).
//
// For each profile skill, type it into the tag input (piercing open shadow
// roots), poll for the async suggestion list rather than sleeping a fixed
// time, and click a suggestion only when its normalised text matches the
// skill or a known alias exactly ("C" never becomes "C++"). An unmatched
// skill is reported skipped, never guessed.
//
// lifted from https://github.com/averatec0773/offeros/blob/c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94/apps/extension/src/lib/autofill/skills-fill.ts#L1-L77 (Apache-2.0), adapted
// lifted from https://github.com/averatec0773/offeros/blob/c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94/packages/autofill/src/skill-match.ts#L1-L54 (Apache-2.0), adapted
// Changes made: ported TypeScript to plain JS with yn-prefixed names; option
// discovery goes through this codebase's ynQueryDeep (same shadow-piercing
// helper dom_fill_kit.js already uses) rather than a separate deep-query
// module; every click is gated on the injected ynKitGuards.clickGuard (fail
// closed with none injected) — the source has no such gate; added
// ynFillCheckboxGroup, a new function (not in the source) for the second
// half of this module: multi-select checkbox groups (skills, languages) mapped
// by normalised label text against a wanted-values list, same never-guess
// rule.


/** Keep +, #, . so "C++", "C#", ".NET" stay distinct from their bare form;
 * drop everything else so casing/spacing differences never cause a miss. */
function ynSkillNorm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]/g, "");
}

/** Strip a trailing parenthetical qualifier: "JavaScript (Programming
 * Language)" reads as "JavaScript" for matching purposes. */
function ynSkillStripQualifier(s) {
  return String(s || "").replace(/\s*\([^)]*\)\s*$/, "");
}

function ynSkillTextMatches(candidate, option) {
  const c = ynSkillNorm(candidate);
  if (c === "") return false;
  return (
    c === ynSkillNorm(option) || c === ynSkillNorm(ynSkillStripQualifier(option))
  );
}

/** The first option matching any candidate (skill, then its aliases in
 * order) — never the first option that merely LOOKS close. */
function ynPickSkillMatch(candidates, optionTexts) {
  for (const candidate of candidates) {
    const index = optionTexts.findIndex((opt) => ynSkillTextMatches(candidate, opt));
    if (index !== -1) return { index, text: optionTexts[index] };
  }
  return null;
}

// Small, extensible alias table for abbreviations a strict-taxonomy ATS
// would otherwise drop. The original skill always comes first, so an ATS
// that DOES offer the bare abbreviation still matches on the first try.
const YN_SKILL_ALIASES = {
  js: ["JavaScript"],
  ts: ["TypeScript"],
  py: ["Python"],
  golang: ["Go"],
  "k8s": ["Kubernetes"],
  ml: ["Machine Learning"],
  nlp: ["Natural Language Processing"],
};

function ynSkillCandidates(skill) {
  const alias = YN_SKILL_ALIASES[String(skill || "").trim().toLowerCase()];
  return alias ? [skill, ...alias] : [skill];
}

function ynSkillOptionText(el) {
  return String((el && el.textContent) || "").trim();
}

function ynSkillSetInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
  );
}

/**
 * Type each profile skill into `host`'s tag input, one at a time, and click
 * the one matching suggestion when the async list offers one. Never clicks
 * an ambiguous or absent match — those are reported skipped.
 *
 * @param {Element} host - the widget's root (its own input, or a wrapper
 *   whose input lives in light or shadow DOM)
 * @param {string[]} skills
 * @returns {Promise<{filled:string[], skipped:string[]}>}
 */
async function ynFillSkills(host, skills) {
  const settleMs = 800;
  const pollMs = 25;
  const filled = [];
  const skipped = [];
  const list = Array.isArray(skills) ? skills : [];

  const input =
    host instanceof HTMLInputElement
      ? host
      : typeof ynQueryDeep === "function"
        ? ynQueryDeep(host, "input")[0]
        : host.querySelector && host.querySelector("input");
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
      options =
        typeof ynQueryDeep === "function"
          ? ynQueryDeep(host, '[role="option"]')
          : Array.from(host.querySelectorAll('[role="option"]'));
    } while (options.length === 0 && Date.now() - start < settleMs);

    const match = ynPickSkillMatch(
      ynSkillCandidates(skill),
      options.map(ynSkillOptionText),
    );
    if (!match) {
      skipped.push(skill);
      ynSkillSetInputValue(input, "");
      continue;
    }
    const hit = options[match.index];
    // ynSubmitGuard — the injected never-submit guard; fail closed with none
    // injected. Re-read right before the click (rather than once above the
    // loop) so the built bundle keeps the guard reference within the
    // never-submit pin's window once esbuild strips this very comment.
    const guard = ynKitGuards.clickGuard;
    if (!guard || guard(hit)) {
      skipped.push(skill);
      ynSkillSetInputValue(input, "");
      continue;
    }
    hit.click(); // ynSubmitGuard already refused above if this suggestion were submit-shaped
    filled.push(skill);
    await new Promise((r) => setTimeout(r, pollMs));
  }

  return { filled, skipped };
}

/**
 * Multi-select checkbox group (skills, languages): tick exactly the boxes
 * whose label normalises to one of `wantedValues`, using the same
 * normalise-and-match rule as the tag fill above. Never touches a box
 * already in the wanted state; never unticks anything the page or the
 * student set.
 *
 * @param {Element[]} checkboxEls
 * @param {string[]} wantedValues
 * @param {{labelOf?: (el: Element) => string}} [opts]
 * @returns {{ticked:string[], skipped:string[]}}
 */
function ynFillCheckboxGroup(checkboxEls, wantedValues, opts) {
  const options = opts || {};
  const guard = ynKitGuards.clickGuard;
  const wanted = (Array.isArray(wantedValues) ? wantedValues : []).map((v) => ({
    raw: v,
    norm: ynSkillNorm(v),
  }));
  const ticked = [];
  const usedWanted = new Set();

  for (const cb of Array.isArray(checkboxEls) ? checkboxEls : []) {
    const label = options.labelOf
      ? options.labelOf(cb)
      : (cb.closest("label") && cb.closest("label").textContent) ||
        cb.getAttribute("aria-label") ||
        "";
    const norm = ynSkillNorm(label);
    const hit = wanted.find((w) => w.norm === norm && !usedWanted.has(w.raw));
    if (!hit) continue;
    usedWanted.add(hit.raw);
    if (cb.checked) {
      ticked.push(hit.raw);
      continue;
    }
    // ynSubmitGuard — the injected never-submit guard; fail closed, same rule
    // as every other click in this file.
    if (!guard || guard(cb)) continue;
    cb.click(); // a checkbox toggle only, and ynSubmitGuard already cleared it above
    if (cb.checked) ticked.push(hit.raw);
  }
  const skipped = wanted
    .filter((w) => !usedWanted.has(w.raw))
    .map((w) => w.raw);
  return { ticked, skipped };
}
// Every name top-level in the original single-file version, exposed on
// globalThis exactly as before the move — chrome.scripting still injects
// the built file into the same isolated world as its neighbours, so a
// bare name another shipped file already called is still there to call.
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
