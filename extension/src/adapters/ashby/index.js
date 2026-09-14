// content/adapters/ashby.js — deterministic Ashby (jobs.ashbyhq.com) fill intents.
// Ashby is a React SPA with four stable _systemfield_* ids; everything else is
// a per-org UUID, so those fields are matched by label text only.
// plan() returns FillIntents only. Never password, never invent UUIDs, never submit.

function ynAsFullName(plan) {
  const c = (plan && plan.contact) || {};
  const joined = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return joined || c.full_name || c.name || "";
}

/** Label text for a field — walks for= and parent labels. */
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

/**
 * Resolve Ashby location combobox: research says label for="_systemfield_location"
 * but the visible combobox input has no id of its own (react-select style).
 */
function ynAsLocationInput(doc) {
  const byId = ynAdaFind(doc, "#_systemfield_location");
  if (byId) {
    const tag = (byId.tagName || "").toUpperCase();
    const type = (byId.type || "").toLowerCase();
    if (
      (tag === "INPUT" || tag === "TEXTAREA") &&
      !["hidden", "submit", "button"].includes(type)
    ) {
      return byId;
    }
    // container/wrapper: look for combobox inside
    const inner =
      byId.querySelector &&
      byId.querySelector('input[role="combobox"], input[aria-autocomplete]');
    if (inner) return inner;
  }
  // label[for] → nearby combobox (verified label target exists)
  try {
    const lab = (doc || document).querySelector(
      'label[for="_systemfield_location"]',
    );
    if (lab) {
      const root =
        lab.closest("div, fieldset, section, form") || lab.parentElement;
      if (root) {
        const cb =
          root.querySelector(
            'input[role="combobox"], input[aria-autocomplete="list"], input[aria-haspopup="listbox"]',
          ) || root.querySelector('input:not([type="hidden"])');
        if (cb && !ynAdaIsPassword(cb)) return cb;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Resume target: prefer #_systemfield_resume file input; else dropzone for
 * ynDropFile fallback (research: 16MB resume dropzone + systemfield file).
 */
function ynAsResumeTarget(doc) {
  const file = ynAdaFind(
    doc,
    '#_systemfield_resume, input[type="file"]#_systemfield_resume',
  );
  if (file && (file.type || "").toLowerCase() === "file") return file;
  // hidden file input near a dropzone
  const anyResumeFile = ynAdaFindAll(doc, 'input[type="file"]').find((el) => {
    const sig =
      ynAsFieldLabel(el, doc) + " " + (el.id || "") + " " + (el.name || "");
    return /resume|curriculum|c\.?v\.?/i.test(sig);
  });
  if (anyResumeFile) return anyResumeFile;
  // last resort: dropzone-ish element (engine ynDropFile path)
  const drop = ynAdaFind(
    doc,
    "[class*='dropzone'], [class*='Dropzone'], [data-testid*='resume'], [class*='upload']",
  );
  return drop || null;
}

/**
 * Label-matched non-system fields. Research: Phone / LinkedIn use random UUIDs
 * per org — match by associated label text only, never hard-code a UUID.
 * Custom screening questions without a payload answer stay unclaimed.
 */
function ynAsByLabel(doc, re) {
  const fields = ynAdaFindAll(doc, "input, textarea, select");
  for (const el of fields) {
    if (ynAdaIsPassword(el)) continue;
    const type = (el.type || "").toLowerCase();
    if (["hidden", "submit", "button", "image", "reset", "file"].includes(type))
      continue;
    // skip the four systemfields (handled by id)
    if (el.id && /^_systemfield_/i.test(el.id)) continue;
    const signal = ynAsFieldLabel(el, doc);
    if (re.test(signal)) return el;
  }
  return null;
}

function ynAshbyPlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const c = (plan && plan.contact) || {};
  const links = (plan && plan.links) || {};
  const addr = (plan && plan.address) || {};
  const claimed = new Set();

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
      label: label || ynAdaLabelOf(el, document_) || fieldKey,
    });
  };

  // Stable systemfields (research: same on every Ashby org).
  const fullName = ynAsFullName(plan);
  if (ynAdaUsable(fullName)) {
    push(
      "contact.full_name",
      ynAdaFind(document_, "#_systemfield_name"),
      fullName,
      "text",
      "Full Name",
    );
  }
  if (ynAdaUsable(c.email)) {
    push(
      "contact.email",
      ynAdaFind(document_, "#_systemfield_email"),
      c.email,
      "text",
      "Email",
    );
  }

  // Location combobox (react-select; no id on the input — research).
  const locVal =
    [addr.city, addr.country].filter(Boolean).join(", ") ||
    addr.city ||
    addr.line1 ||
    "";
  if (ynAdaUsable(locVal)) {
    const locEl = ynAsLocationInput(document_);
    if (locEl) {
      const isCombo =
        locEl.getAttribute("role") === "combobox" ||
        locEl.getAttribute("aria-autocomplete") === "list" ||
        locEl.getAttribute("aria-haspopup") === "listbox";
      push(
        "address.city",
        locEl,
        locVal,
        isCombo ? "combobox" : "text",
        "Location",
      );
    }
  }

  // Resume file / dropzone.
  if (plan && plan.cv_url) {
    const resumeEl = ynAsResumeTarget(document_);
    push("cv_file", resumeEl, { file: "cv" }, "file", "Resume");
  }

  // Label-matched Phone / LinkedIn (UUID ids — research mandates label match).
  if (ynAdaUsable(c.phone)) {
    const phoneEl = ynAsByLabel(
      document_,
      /^phone$|phone\s*number|mobile|tel\b/i,
    );
    // tighten: label should look like a phone field, not a longer custom Q
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

  // Cover letter: no stable systemfield in research — only claim a clear
  // cover-letter textarea/file if labelled (adapter knowledge of the label).
  if (plan && ynAdaUsable(plan.letter_text)) {
    const letterTa = ynAsByLabel(document_, /cover\s*letter|motivation/i);
    if (letterTa && (letterTa.tagName || "").toUpperCase() === "TEXTAREA") {
      push(
        "letter_text",
        letterTa,
        plan.letter_text,
        "textarea",
        "Cover letter",
      );
    }
  }
  if (plan && plan.letter_url) {
    const letterFile = ynAdaFindAll(document_, 'input[type="file"]').find(
      (el) => {
        if (claimed.has(el)) return false;
        const sig = ynAsFieldLabel(el, document_) + " " + (el.id || "");
        return /cover\s*letter|motivation/i.test(sig);
      },
    );
    if (letterFile) {
      push(
        "letter_file",
        letterFile,
        { file: "letter" },
        "file",
        "Cover letter",
      );
    }
  }

  // EEO: research did not verify an Ashby EEO block on the Notion fixture.
  // CHECKED on a live page 2026-09-03, headless, no sign-in (Ramp's "Software Engineer,
  // Credit" posting, jobs.ashbyhq.com/ramp/5598f7b8-...): confirmed the four
  // _systemfield_* ids (_systemfield_name, _systemfield_email,
  // _systemfield_resume, plus a per-org UUID for phone) exactly as this
  // file already claims them — and this posting ALSO carried no EEO block,
  // only a communicationConsent yes/no radio pair (SMS opt-in, already
  // outside this adapter's scope; heuristics' policy class handles
  // consent-shaped radios). Two real postings with no EEO block is evidence
  // Ashby's EEO section is a per-org opt-in feature, not evidence it never
  // exists — still not proven either way, so this stays "do not invent".
  // Heuristics rung still tags heading-based EEO sections when one appears.

  return intents;
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "ashby",
  plan: ynAshbyPlan,
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynAsFullName = ynAsFullName;
globalThis.ynAsFieldLabel = ynAsFieldLabel;
globalThis.ynAsLocationInput = ynAsLocationInput;
globalThis.ynAsResumeTarget = ynAsResumeTarget;
globalThis.ynAsByLabel = ynAsByLabel;
globalThis.ynAshbyPlan = ynAshbyPlan;
