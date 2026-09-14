// content/filler.js, part 3 of 11 — the question fingerprint (a stable
// hash of question text + control type + options, mirroring the server's
// question fingerprint) and the live-DOM read of every answer the
// student has already given, keyed by that fingerprint so a repeated
// question on a later page can reuse it. Self-contained: no cross-module
// import within this shipped file's own tree. See index.js for the file's
// full history.
export function ynUtf8Bytes(str) {
  const out = [];
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    let code = s.codePointAt(i);
    if (code > 0xffff) i += 1; // consumed the low surrogate too
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

export const YN_FNV64_PRIME = 0x100000001b3n;
export const YN_FNV64_OFFSET = 0xcbf29ce484222325n;
export const YN_FNV64_MASK = 0xffffffffffffffffn;

export function ynFnv1a64Hex(str) {
  let h = YN_FNV64_OFFSET;
  for (const byte of ynUtf8Bytes(str)) {
    h ^= BigInt(byte);
    h = (h * YN_FNV64_PRIME) & YN_FNV64_MASK;
  }
  return h.toString(16).padStart(16, "0");
}

export function ynQuestionFingerprint(questionText, controlType, options) {
  const normQ = ynNormaliseQuestionText(questionText);
  const normOpts = (Array.isArray(options) ? options : [])
    .map((o) => ynNormaliseQuestionText(o))
    .filter(Boolean)
    .sort();
  const key = [normQ, String(controlType || "").trim().toLowerCase(), normOpts.join(",")].join("|");
  return ynFnv1a64Hex(key);
}

// Ordered, first match wins — the SAME family names and worked example
// ("Hispanic or Latino?" / "Hispanic/Latino?" -> one family) as
// the server's question fingerprint; the regex bodies are written to agree
// with that module's own 20-pair table, not copied from it.

// --- "Save to YoungNug" (answers half, content side) ------------------------
// Read the FACTUAL answers the user typed/picked on THIS form so the popup
// can offer them back to the profile answer bank. READ-ONLY: this function
// touches no network and no storage; nothing is saved without the user's
// explicit confirm in the popup. Mapping reuses the heuristics scan with an
// EMPTY profile — recognised factual questions surface as needs_you intents
// carrying their el + fieldKey.
export const YN_SAVABLE_ANSWER_KEYS = {
  "answers.notice_period": {
    section: "answers",
    key: "notice_period",
    label: "Notice period",
  },
  "answers.salary_expectation": {
    section: "answers",
    key: "salary_expectation",
    label: "Salary expectation",
  },
  "answers.earliest_start": {
    section: "answers",
    key: "earliest_start",
    label: "Earliest start",
  },
  "right_to_work.uk_rtw": {
    section: "eligibility",
    key: "uk_right_to_work",
    label: "Right to work in the UK",
    boolean: true,
  },
  "right_to_work.needs_sponsorship": {
    section: "eligibility",
    key: "needs_sponsorship",
    label: "Needs visa sponsorship",
    boolean: true,
  },
  "eligibility_extra.uk_driving_licence": {
    section: "eligibility",
    key: "uk_driving_licence",
    label: "UK driving licence",
    boolean: true,
  },
  "eligibility_extra.willing_to_relocate": {
    section: "eligibility",
    key: "willing_to_relocate",
    label: "Willing to relocate",
    boolean: true,
  },
};

/** The CHECKED member of el's radio group, classified Yes/No by its visible
 * option label. null = nothing checked or an unclassifiable label. */
export function ynReadBooleanGroupAnswer(radioEl) {
  const doc = document;
  const name = radioEl.name || "";
  let group = [radioEl];
  if (name) {
    try {
      const root = radioEl.form || doc;
      group = [
        ...root.querySelectorAll(
          `input[type="radio"][name="${CSS.escape(name)}"]`,
        ),
      ];
    } catch {
      group = [radioEl];
    }
  }
  const checked = group.find((r) => r.checked);
  if (!checked) return null;
  const label =
    typeof ynRadioOptionLabel === "function"
      ? ynRadioOptionLabel(checked, doc)
      : String(checked.value || "");
  const t = String(label || "").trim();
  if (/^(yes|true)\b/i.test(t) || /\b(yes|true)\s*$/i.test(t)) return true;
  if (/^(no|false)\b/i.test(t) || /\b(no|false)\s*$/i.test(t)) return false;
  return null;
}

export function ynCollectUserAnswers() {
  const out = [];
  if (typeof ynHeuristicIntents !== "function") return out;
  let intents = [];
  try {
    intents = ynHeuristicIntents({}, document, new Set()) || [];
  } catch {
    return out;
  }
  const seen = new Set();
  for (const i of intents) {
    if (!i || i.skip !== "needs_you" || !i.el) continue;
    const spec = YN_SAVABLE_ANSWER_KEYS[i.fieldKey];
    if (!spec || seen.has(i.fieldKey)) continue;
    const type = (i.el.type || "").toLowerCase();
    const kind = i.kind || "text";
    let value = null;
    if (spec.boolean) {
      if (type === "radio") value = ynReadBooleanGroupAnswer(i.el);
      else if (type === "checkbox") value = i.el.checked === true ? true : null;
      else if (kind === "select") {
        const t =
          ((i.el.selectedOptions && i.el.selectedOptions[0]) || {})
            .textContent || "";
        value = /^\s*yes\b/i.test(t)
          ? true
          : /^\s*no\b/i.test(t)
            ? false
            : null;
      }
    } else if (
      typeof ynDatePartRole === "function" &&
      ynDatePartRole(i.el, document)
    ) {
      // a split D/M/Y group: compose dd/mm/yyyy from the parts, all required
      const g =
        typeof ynDateGroup === "function" ? ynDateGroup(i.el, document) : null;
      if (g) {
        const d = String(g.day.value || "").trim();
        const m = String(g.month.value || "").trim();
        const y = String(g.year.value || "").trim();
        value = d && m && y ? `${d}/${m}/${y}` : null;
      }
    } else {
      // An untouched <select> still reports its first option, so a
      // placeholder ("-- Please select --") would be saved to the profile as
      // though the user had chosen it. Only treat a select as answered when
      // a real option past the placeholder is selected.
      let raw = "";
      if (kind === "select") {
        const idx =
          typeof i.el.selectedIndex === "number" ? i.el.selectedIndex : -1;
        const opt = (i.el.selectedOptions && i.el.selectedOptions[0]) || null;
        const optValue = opt ? String(opt.value || "").trim() : "";
        if (idx > 0 && optValue) raw = opt.textContent || "";
      } else {
        raw = String(i.el.value || "");
      }
      const trimmed = raw.trim();
      value = trimmed ? trimmed.slice(0, 100) : null;
    }
    if (value === null || value === "") continue;
    out.push({
      fieldKey: i.fieldKey,
      section: spec.section,
      key: spec.key,
      label: spec.label,
      value,
    });
    seen.add(i.fieldKey);
  }

  // free-text screening answers. The allowlisted FACT keys above are
  // profile fields; a "generated_text" intent is a screening QUESTION with
  // no profile home at all — heuristics.js flags the field but never
  // writes it (there is no value to write), so whatever is here is
  // entirely what the student typed themselves. Read-only, same as the
  // loop above: nothing leaves this function without the popup's own Save
  // confirm and a later explicit "Save my answers" POST.
  const seenFingerprints = new Set();
  for (const i of intents) {
    if (!i || i.kind !== "generated_text" || !i.el) continue;
    const question = String(i.questionLabel || i.label || "").trim();
    if (!question) continue;
    const raw = String(i.el.value || "").trim();
    if (!raw) continue;
    const controlType =
      (i.el.tagName || "").toLowerCase() === "textarea" ? "textarea" : "text";
    const fp = ynQuestionFingerprint(question, controlType, null);
    if (seenFingerprints.has(fp)) continue;
    seenFingerprints.add(fp);
    out.push({
      fieldKey: i.fieldKey,
      freeText: true,
      question: question.slice(0, 300),
      controlType,
      value: raw.slice(0, 2000),
      fingerprint: fp,
      family: ynQuestionFamily(question),
    });
  }
  return out;
}

