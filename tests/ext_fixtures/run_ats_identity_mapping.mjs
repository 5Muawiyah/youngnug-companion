/**
 * Identity-field mapping pin for the generic heuristics rung.
 *
 * Three live ATS platforms (Teamtailor, Pinpoint, Recruitee) lost their
 * name/email/phone fields to generic-matcher defects. This pin holds the two
 * causes closed and, just as importantly, holds the never-fill guards OPEN —
 * a "fix" that mapped these fields by weakening the sensitive/EEO/password
 * refusals would be worse than the bug.
 *
 * Attribute strings below are copied verbatim from a live read-only DOM
 * capture (2026-08-03), not invented — the Teamtailor class list in
 * particular is the real Tailwind output that caused the miss.
 *
 * Run: node tests/ext_fixtures/run_ats_identity_mapping.mjs
 * Exit 0 = all pass. Minimal DOM mock (no browser / no jsdom).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const HEUR_PATH = path.join(ROOT, "extension", "content", "heuristics.js");

// Verbatim from live Teamtailor (careers.cazoo.co.uk, .../applications/new).
// The `disabled:` variants are the whole point of this fixture.
const TT_CLASS =
  "rounded-md px-4 w-full sm:px-6 border-2 border-white placeholder-gray-500 " +
  "placeholder-opacity-60 text-gray-700 text-md shadow-form transform " +
  "resize-none hover:shadow-form-strong hover:-translate-y-px " +
  "disabled:shadow-form disabled:translate-y-0 disabled:cursor-not-allowed " +
  "disabled:text-gray-600 disabled:opacity-50 connect-input element-to-focus h-70";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeEl(tag, attrs = {}) {
  const el = {
    tagName: String(tag).toUpperCase(),
    type:
      attrs.type ||
      (tag === "textarea" ? "textarea" : tag === "select" ? "select-one" : "text"),
    name: attrs.name || "",
    id: attrs.id || "",
    className: attrs.className || "",
    value: attrs.value != null ? attrs.value : "",
    checked: !!attrs.checked,
    disabled: false,
    readOnly: false,
    maxLength: -1,
    labels: [],
    form: null,
    parentElement: null,
    previousElementSibling: null,
    isConnected: true,
    _attrs: { ...(attrs.attrs || {}) },
    getAttribute(k) {
      return this._attrs[k] != null ? this._attrs[k] : null;
    },
    matches() {
      return false;
    },
    closest() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  if (attrs.label) {
    el.labels = [{ tagName: "LABEL", textContent: attrs.label, parentElement: null }];
  }
  return el;
}

function loadHeuristics() {
  const src = readFileSync(HEUR_PATH, "utf8");
  const sandbox = {
    console,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    CSS: { escape: (s) => String(s).replace(/"/g, '\\"') },
    Set,
    Map,
    Array,
    String,
    Number,
    Boolean,
    Object,
    RegExp,
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

/** Document whose field scan returns exactly `fields`. */
function makeDoc(fields) {
  return {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll(sel) {
      const s = String(sel);
      // The ARIA choice-widget sweep must find nothing; only the field scan
      // returns the fixture's controls.
      if (s.includes("role=")) return [];
      if (s.includes("input")) return fields;
      return [];
    },
  };
}

const PROFILE = {
  contact: {
    first_name: "Test",
    last_name: "Candidate",
    email: "test.candidate@example.com",
    phone: "07700900123",
  },
};

/** fieldKey -> intent, for the intents that are real fills (not skips). */
function fillsByKey(intents) {
  const out = new Map();
  for (const i of intents) if (!i.skip) out.set(i.fieldKey, i);
  return out;
}

function skipsByEl(intents) {
  const out = new Map();
  for (const i of intents) if (i.skip) out.set(i.el, i.skip);
  return out;
}

function main() {
  const fails = [];
  const g = loadHeuristics();

  // --- 1. Teamtailor: Tailwind `disabled:` classes must not read as sensitive
  try {
    const first = makeEl("input", {
      id: "candidate_first_name",
      name: "candidate[first_name]",
      className: TT_CLASS,
      label: "First name*\nRequired",
      attrs: { autocomplete: "given-name" },
    });
    const last = makeEl("input", {
      id: "candidate_last_name",
      name: "candidate[last_name]",
      className: TT_CLASS,
      label: "Last name*\nRequired",
      attrs: { autocomplete: "family-name" },
    });
    const email = makeEl("input", {
      type: "email",
      id: "candidate_email",
      name: "candidate[email]",
      className: TT_CLASS,
      label: "Email*\nRequired",
      attrs: { autocomplete: "email" },
    });
    const fields = [first, last, email];
    const intents = g.ynHeuristicIntents(PROFILE, makeDoc(fields), new Set());
    const fills = fillsByKey(intents);
    const skips = skipsByEl(intents);

    for (const [el, key] of [
      [first, "contact.first_name"],
      [last, "contact.last_name"],
      [email, "contact.email"],
    ]) {
      assert(
        skips.get(el) !== "sensitive",
        `${el.id} was classified skip:"sensitive" — a CSS class ` +
          `(Tailwind "disabled:*") is reaching YN_SENSITIVE_RE again`,
      );
      assert(fills.has(key), `${el.id} did not map to ${key}`);
      assert(fills.get(key).el === el, `${key} landed on the wrong element`);
    }
    assert(
      fills.get("contact.email").value === PROFILE.contact.email,
      "email intent carries the wrong value",
    );
  } catch (e) {
    fails.push("teamtailor-identity: " + e.message);
  }

  // --- 2. The sensitive guard still fires on a real QUESTION -----------------
  // Same class string as above: the difference must come from the label text,
  // never from the styling.
  try {
    const adjustments = makeEl("input", {
      id: "q_adjustments",
      name: "candidate[answers_attributes][0][text]",
      className: TT_CLASS,
      label: "Do you require any reasonable adjustments during the interview?",
    });
    const conviction = makeEl("input", {
      id: "q_conviction",
      name: "candidate[answers_attributes][1][text]",
      className: TT_CLASS,
      label: "Do you have any unspent criminal convictions?",
    });
    // "disability" is a protected characteristic, so this one is caught by the
    // EEO rung before the sensitive rung. Which rung refuses it does not
    // matter; that it is never FILLED does.
    const disability = makeEl("input", {
      id: "q_disability",
      name: "candidate[answers_attributes][2][text]",
      className: TT_CLASS,
      label: "Do you consider yourself to have a disability?",
    });
    const fields = [adjustments, conviction, disability];
    const intents = g.ynHeuristicIntents(PROFILE, makeDoc(fields), new Set());
    const skips = skipsByEl(intents);
    assert(
      skips.get(adjustments) === "sensitive",
      'a reasonable-adjustments QUESTION must still be skip:"sensitive"',
    );
    assert(
      skips.get(conviction) === "sensitive",
      'a criminal-conviction QUESTION must still be skip:"sensitive"',
    );
    assert(
      skips.get(disability) === "eeo" || skips.get(disability) === "sensitive",
      "a disability QUESTION must still be refused by one of the never-fill rungs",
    );
    assert(
      !fillsByKey(intents).size,
      "a sensitive/EEO question was mapped to a fillable profile key",
    );
  } catch (e) {
    fails.push("sensitive-guard-intact: " + e.message);
  }

  // --- 3. Pinpoint: the dial-code adjunct must not orphan the phone field ----
  try {
    // Declared FIRST, exactly as it appears in the live Pinpoint DOM — the
    // bug was order-dependent (one intent per profile key, first match wins).
    const iso2 = makeEl("select", {
      id: "application_form_application_phone_iso2",
      name: "application_form[application][phone_iso2]",
      label: "Phone country code",
    });
    const phone = makeEl("input", {
      type: "tel",
      id: "application_form_application_phone",
      name: "application_form[application][phone]",
      label: "Phone",
      attrs: { placeholder: "Phone", autocomplete: "off" },
    });
    const fields = [iso2, phone];
    const intents = g.ynHeuristicIntents(PROFILE, makeDoc(fields), new Set());
    const fills = fillsByKey(intents);
    assert(fills.has("contact.phone"), "phone did not map at all");
    assert(
      fills.get("contact.phone").el === phone,
      "contact.phone landed on the dialling-code control, orphaning the " +
        "real phone input",
    );
  } catch (e) {
    fails.push("pinpoint-phone-adjunct: " + e.message);
  }

  // --- 4. Recruitee: single full-name field, keyed on name= not id= ----------
  // The live ids carry a per-posting positional suffix (input-candidate.name-3),
  // so nothing may depend on the number.
  try {
    const name = makeEl("input", {
      id: "input-candidate.name-3",
      name: "candidate.name",
      label: "Full name *",
      attrs: { placeholder: "Full name", autocomplete: "name" },
    });
    const email = makeEl("input", {
      type: "email",
      id: "input-candidate.email-4",
      name: "candidate.email",
      label: "Email address *",
      attrs: { placeholder: "Your email address", autocomplete: "email" },
    });
    const fields = [name, email];
    const intents = g.ynHeuristicIntents(PROFILE, makeDoc(fields), new Set());
    const fills = fillsByKey(intents);
    assert(fills.has("contact.full_name"), "recruitee full name did not map");
    assert(
      fills.get("contact.full_name").el === name,
      "contact.full_name landed on the wrong element",
    );
    assert(
      fills.get("contact.full_name").value === "Test Candidate",
      "full_name must be the joined first+last, not a raw profile miss",
    );
    assert(fills.has("contact.email"), "recruitee email did not map");
  } catch (e) {
    fails.push("recruitee-fullname: " + e.message);
  }

  // --- 5. Guards not weakened: password + EEO stay refused -------------------
  try {
    const pw = makeEl("input", {
      type: "password",
      id: "password",
      name: "password",
      className: TT_CLASS,
      label: "Password",
    });
    const eeo = makeEl("input", {
      id: "eeo_ethnicity",
      name: "candidate[ethnicity]",
      className: TT_CLASS,
      label: "What is your ethnicity?",
    });
    const fields = [pw, eeo];
    const intents = g.ynHeuristicIntents(PROFILE, makeDoc(fields), new Set());
    assert(
      !intents.some((i) => i.el === pw),
      "a password field produced an intent — the credential refusal is gone",
    );
    const skips = skipsByEl(intents);
    assert(
      skips.get(eeo) === "eeo",
      "an ethnicity question must still be skip:\"eeo\"",
    );
  } catch (e) {
    fails.push("guards-intact: " + e.message);
  }

  if (fails.length) {
    for (const f of fails) console.error("FAIL: " + f);
    process.exit(1);
  }
  console.log(
    "ats identity mapping PASS: teamtailor name/email map (Tailwind " +
      "disabled:* no longer reads as sensitive), sensitive/EEO/password " +
      "guards intact, pinpoint dial-code adjunct refused, recruitee " +
      "full-name keyed on name=",
  );
}

main();
