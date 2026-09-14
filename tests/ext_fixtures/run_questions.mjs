/**
 * Node tests for heuristics question detection + boolean radio
 * semantics (ynResolveBooleanRadio, new patterns, sensitive skip, generated
 * free-text intents always confidence "guessed").
 *
 * Run: node tests/ext_fixtures/run_questions.mjs
 * Exit 0 = all pass. Minimal DOM mock (no browser / no jsdom).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const HEUR_PATH = path.join(ROOT, "extension", "content", "heuristics.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Minimal element / document mock good enough for heuristics helpers. */
function makeEl(tag, attrs = {}) {
  const el = {
    tagName: String(tag).toUpperCase(),
    type: attrs.type || (tag === "textarea" ? "textarea" : "text"),
    name: attrs.name || "",
    id: attrs.id || "",
    className: attrs.className || "",
    value: attrs.value != null ? attrs.value : "",
    checked: !!attrs.checked,
    disabled: false,
    readOnly: false,
    maxLength: attrs.maxLength != null ? attrs.maxLength : -1,
    labels: attrs.labels || [],
    form: null,
    parentElement: attrs.parentElement || null,
    previousElementSibling: null,
    isConnected: true,
    _attrs: { ...(attrs.attrs || {}) },
    getAttribute(k) {
      if (k === "aria-label") return this._attrs["aria-label"] || "";
      if (k === "aria-labelledby") return this._attrs["aria-labelledby"] || "";
      if (k === "placeholder") return this._attrs.placeholder || "";
      if (k === "autocomplete") return this._attrs.autocomplete || "";
      if (k === "role") return this._attrs.role || "";
      if (k === "aria-autocomplete") return this._attrs["aria-autocomplete"] || "";
      if (k === "aria-haspopup") return this._attrs["aria-haspopup"] || "";
      return this._attrs[k] || null;
    },
    setAttribute(k, v) {
      this._attrs[k] = v;
    },
    matches(sel) {
      if (sel === "fieldset" || sel === "section") {
        return this.tagName === "FIELDSET" || this.tagName === "SECTION";
      }
      return false;
    },
    closest(sel) {
      if (sel === "label" && this._parentLabel) return this._parentLabel;
      let cur = this.parentElement;
      while (cur) {
        if (sel === "fieldset" && cur.tagName === "FIELDSET") return cur;
        if (sel === "label" && cur.tagName === "LABEL") return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  return el;
}

function makeLabel(text, input) {
  const lab = {
    tagName: "LABEL",
    textContent: text,
    parentElement: null,
  };
  if (input) {
    input.labels = [lab];
    input._parentLabel = lab;
  }
  return lab;
}

function loadHeuristics() {
  const src = readFileSync(HEUR_PATH, "utf8");
  const sandbox = {
    console,
    document: {
      getElementById() {
        return null;
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
    CSS: {
      escape(s) {
        return String(s).replace(/"/g, '\\"');
      },
    },
    Set,
    Map,
    Array,
    String,
    Number,
    Boolean,
    Object,
    RegExp,
    Math, // present but question path must not call Math.random
    Error,
    parseInt,
    parseFloat,
    isNaN,
    Infinity,
    undefined,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "heuristics.js" });
  return sandbox;
}

function main() {
  const fails = [];
  const g = loadHeuristics();

  // --- exports present ----------------------------------------------------
  try {
    assert(typeof g.ynResolveBooleanRadio === "function", "ynResolveBooleanRadio missing");
    assert(typeof g.ynMatchLabelPatterns === "function", "ynMatchLabelPatterns missing");
    assert(typeof g.ynHeuristicIntents === "function", "ynHeuristicIntents missing");
    assert(typeof g.ynSanitizeIdentity === "function", "ynSanitizeIdentity missing");
    assert(typeof g.ynRefinePatternHit === "function", "ynRefinePatternHit missing");
  } catch (e) {
    fails.push("exports: " + e.message);
  }

  // --- no Math.random in heuristics source --------------------------------
  try {
    const src = readFileSync(HEUR_PATH, "utf8");
    assert(!/Math\.random/.test(src), "heuristics.js must not use Math.random");
  } catch (e) {
    fails.push("no-random: " + e.message);
  }

  // --- ynResolveBooleanRadio: true → Yes even when listed second ----------
  try {
    const no = makeEl("input", { type: "radio", name: "rtw", value: "no", id: "rtw_no" });
    const yes = makeEl("input", { type: "radio", name: "rtw", value: "yes", id: "rtw_yes" });
    makeLabel(" No", no);
    makeLabel(" Yes", yes);
    const form = {
      tagName: "FORM",
      querySelectorAll(sel) {
        if (String(sel).includes('name="rtw"') || String(sel).includes("radio")) {
          return [no, yes];
        }
        return [];
      },
    };
    no.form = form;
    yes.form = form;
    const doc = {
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [no, yes];
      },
      getElementById() {
        return null;
      },
    };

    // Start from the FIRST radio (No) with value true — must pick Yes
    const resolved = g.ynResolveBooleanRadio(no, true, doc);
    assert(resolved && resolved.el === yes, "true must pick Yes radio (listed second)");
    assert(resolved.value === true, "resolved value true");

    const resolvedNo = g.ynResolveBooleanRadio(no, false, doc);
    assert(resolvedNo && resolvedNo.el === no, "false must pick No radio");

    // null → skip
    const skipNull = g.ynResolveBooleanRadio(no, null, doc);
    assert(skipNull === null, "null value → no intent (null return)");

    // no-match labels → no intent
    const weird = makeEl("input", { type: "radio", name: "x", value: "maybe" });
    makeLabel("Prefer not to say", weird);
    weird.form = {
      querySelectorAll() {
        return [weird];
      },
    };
    const noMatch = g.ynResolveBooleanRadio(weird, true, doc);
    assert(noMatch === null, "unmatched option labels → no intent");
  } catch (e) {
    fails.push("boolean-radio: " + e.message);
  }

  // --- new patterns map (and exclusions) ----------------------------------
  try {
    const m = (s) => g.ynRefinePatternHit(g.ynMatchLabelPatterns(s), s);

    assert(m("UK driving licence")?.key === "eligibility_extra.uk_driving_licence", "driving licence");
    assert(m("Are you willing to relocate?")?.key === "eligibility_extra.willing_to_relocate", "relocate");
    assert(m("Earliest available start date")?.key === "answers.earliest_start", "earliest start");
    // DOB "start date" exclusion
    assert(m("Date of birth / start date") === null, "DOB start date must not map to earliest_start");
    assert(m("Years of experience")?.key === "derived.years_of_experience", "years of experience");
    // Skill-specific experience → free-text, not years
    const skill = m("Describe your experience with Python");
    assert(
      skill && skill.key === "generated:experience_with",
      "skill experience → generated:experience_with, got " + JSON.stringify(skill),
    );
    assert(m("Highest level of qualification")?.key === "derived.highest_qualification", "highest qual");
    // "ethnicity" must NOT substring-match city
    assert(
      (m("How would you describe your ethnicity?") || {}).key !== "address.city",
      "ethnicity must not map to address.city",
    );
    assert(m("City")?.key === "address.city", "plain City still maps");
    assert(m("Town or city")?.key === "address.city", "town/city still maps");
    assert(m("Why do you want to work at Acme?")?.key === "generated:why_company", "why company");
    assert(m("Why are you a good fit for this role?")?.key === "generated:why_fit", "why fit");
    // Cover letter still letter_text (ordered before free-text is irrelevant —
    // cover pattern is distinct; ensure it still maps)
    assert(m("Cover letter")?.key === "letter_text", "cover letter stays letter_text");
    // Existing RTW / salary still map
    assert(m("Right to work in the UK")?.key === "right_to_work.uk_rtw", "rtw");
    assert(m("Salary expectation")?.key === "answers.salary_expectation", "salary");
  } catch (e) {
    fails.push("patterns: " + e.message);
  }

  // --- sensitive skip detection -------------------------------------------
  try {
    const criminal = makeEl("input", { type: "radio", name: "criminal", value: "no" });
    makeLabel("Do you have any unspent criminal convictions? No", criminal);
    const form = {
      querySelectorAll(sel) {
        if (String(sel).includes("criminal") || String(sel).includes("radio")) {
          return [criminal];
        }
        return [];
      },
    };
    criminal.form = form;
    const doc = {
      querySelectorAll(sel) {
        if (String(sel).includes("input") || String(sel).includes("select") || String(sel).includes("textarea")) {
          return [criminal];
        }
        return [];
      },
      querySelector() {
        return null;
      },
      getElementById() {
        return null;
      },
    };
    const intents = g.ynHeuristicIntents({}, doc, new Set());
    const sens = intents.filter((i) => i.skip === "sensitive");
    assert(sens.length >= 1, "criminal record must produce skip:sensitive");
    assert(sens.every((i) => i.value === null), "sensitive value null");
  } catch (e) {
    fails.push("sensitive: " + e.message);
  }

  // --- generated intents carry confidence guessed -------------------------
  try {
    const ta = makeEl("textarea", {
      name: "why",
      id: "why",
      maxLength: 300,
    });
    makeLabel("Why do you want to work at Acme?", ta);
    const doc = {
      querySelectorAll(sel) {
        if (String(sel).includes("input") || String(sel).includes("select") || String(sel).includes("textarea")) {
          return [ta];
        }
        return [];
      },
      querySelector() {
        return null;
      },
      getElementById() {
        return null;
      },
    };
    const intents = g.ynHeuristicIntents({}, doc, new Set());
    const gen = intents.filter((i) => i.kind === "generated_text");
    assert(gen.length === 1, "expected one generated_text intent, got " + gen.length);
    assert(gen[0].confidence === "guessed", "generated confidence must be guessed");
    assert(gen[0].fieldKey === "generated:why_company", "archetype why_company");
    assert(gen[0].maxLength === 300, "maxLength from textarea");
    // Must never be exact
    assert(gen[0].confidence !== "exact", "generated never exact");
  } catch (e) {
    fails.push("generated: " + e.message);
  }

  // --- RTW null skips (no intent, no invent) ------------------------------
  try {
    const no = makeEl("input", { type: "radio", name: "rtw", value: "no" });
    const yes = makeEl("input", { type: "radio", name: "rtw", value: "yes" });
    makeLabel("No", no);
    makeLabel("Yes", yes);
    // Fieldset legend is not on the radio label; put RTW phrase on aria-label
    no._attrs["aria-label"] = "Right to work in the UK - No";
    yes._attrs["aria-label"] = "Right to work in the UK - Yes";
    const form = {
      querySelectorAll() {
        return [no, yes];
      },
    };
    no.form = form;
    yes.form = form;
    const doc = {
      querySelectorAll(sel) {
        if (String(sel).includes("input") || String(sel).includes("select") || String(sel).includes("textarea")) {
          return [no, yes];
        }
        return [];
      },
      querySelector() {
        return null;
      },
      getElementById() {
        return null;
      },
    };
    const intents = g.ynHeuristicIntents(
      { right_to_work: { uk_rtw: null } },
      doc,
      new Set(),
    );
    const rtw = intents.filter((i) => i.fieldKey === "right_to_work.uk_rtw");
    // An UNSET factual answer SURFACES as an amber
    // "answer this yourself" entry (skip:"needs_you", value null — the
    // filler never executes it). The safety intent of this pin is
    // unchanged: no FILLABLE intent may exist for a null RTW, and nothing
    // may carry a guessed value.
    const fillable = rtw.filter((i) => !i.skip);
    assert(fillable.length === 0, "null RTW must not produce a fill intent");
    for (const i of rtw) {
      assert(
        i.skip === "needs_you" && i.value === null,
        "null RTW may only surface as needs_you with a null value",
      );
    }
  } catch (e) {
    fails.push("rtw-null: " + e.message);
  }

  // --- RTW true picks Yes (second radio) via full heuristic ---------------
  try {
    const no = makeEl("input", { type: "radio", name: "rtw", value: "no" });
    const yes = makeEl("input", { type: "radio", name: "rtw", value: "yes" });
    makeLabel("No", no);
    makeLabel("Yes", yes);
    no._attrs["aria-label"] = "Right to work in the UK - No";
    yes._attrs["aria-label"] = "Right to work in the UK - Yes";
    const form = {
      querySelectorAll() {
        return [no, yes];
      },
    };
    no.form = form;
    yes.form = form;
    const doc = {
      querySelectorAll(sel) {
        if (String(sel).includes("input") || String(sel).includes("select") || String(sel).includes("textarea")) {
          return [no, yes];
        }
        return [];
      },
      querySelector() {
        return null;
      },
      getElementById() {
        return null;
      },
    };
    const intents = g.ynHeuristicIntents(
      { right_to_work: { uk_rtw: true } },
      doc,
      new Set(),
    );
    const rtw = intents.filter((i) => i.fieldKey === "right_to_work.uk_rtw");
    assert(rtw.length === 1, "true RTW → one intent");
    assert(rtw[0].el === yes, "true RTW must target the Yes radio (second)");
    assert(rtw[0].value === true, "value true");
  } catch (e) {
    fails.push("rtw-true: " + e.message);
  }

  if (fails.length) {
    console.error("FAIL (" + fails.length + "):");
    for (const f of fails) console.error("  - " + f);
    process.exit(1);
  }
  console.log("run_questions: all pass");
  process.exit(0);
}

main();
