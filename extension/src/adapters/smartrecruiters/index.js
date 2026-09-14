// content/adapters/smartrecruiters.js — deterministic SmartRecruiters fill intents.
// Selectors target the oneclick-ui SPL Web Components.
// Real <input>s sit several open-shadow-roots deep — EVERY lookup uses ynQueryDeep
// (plain querySelector returns []). plan() returns FillIntents only. Never password,
// never submit. Phone/country use auto-incremented spl-form-element_N ids (NOT
// stable) → left to heuristics. No wizard.advance: "Next" is user-clicked.
// EEO: not separately verified for SR — heuristics heading scan covers it.

/**
 * Prefer a real fillable control inside an SPL custom element when the id
 * lands on a host wrapper (research: spl-input nests the native input).
 */
function ynSrResolveInput(el) {
  if (!el) return null;
  const tag = (el.tagName || "").toUpperCase();
  const type = (el.type || "").toLowerCase();
  if (
    (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") &&
    !["hidden", "submit", "button", "image", "reset"].includes(type)
  ) {
    return el;
  }
  // pierce open shadow on this host if present
  if (el.shadowRoot) {
    const inner = el.shadowRoot.querySelector(
      "input:not([type='hidden']):not([type='submit']):not([type='button']), textarea, select",
    );
    if (inner && !ynAdaIsPassword(inner)) return inner;
  }
  // deep descendants (ynQueryDeep already walked to find el; check children)
  const nested =
    typeof ynQueryDeep === "function"
      ? ynQueryDeep(
          el,
          "input:not([type='hidden']):not([type='submit']):not([type='button']), textarea, select",
        )
      : el.querySelectorAll
        ? [...el.querySelectorAll("input, textarea, select")]
        : [];
  for (const n of nested) {
    if (ynAdaIsPassword(n)) continue;
    const t = (n.type || "").toLowerCase();
    if (["hidden", "submit", "button", "image", "reset"].includes(t)) continue;
    return n;
  }
  return el;
}

/**
 * SmartRecruiters plan() — claims only research-verified stable semantic ids.
 * Multi-step wizard (Personal → Experience → Education → Profiles → Resume →
 * Message → Next): missing fields this step simply resolve null; fillstate
 * resumes on the next step. Do NOT hard-code spl-form-element_N.
 */
function ynSmartRecruitersPlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const c = (plan && plan.contact) || {};
  const links = (plan && plan.links) || {};
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

  // Stable semantic ids (observed on the live SmartRecruiters one-click UI DOM) — MUST use deep query.
  if (ynAdaUsable(c.first_name)) {
    push(
      "contact.first_name",
      ynSrResolveInput(ynAdaFind(document_, "#first-name-input")),
      c.first_name,
      "text",
      "First name",
    );
  }
  if (ynAdaUsable(c.last_name)) {
    push(
      "contact.last_name",
      ynSrResolveInput(ynAdaFind(document_, "#last-name-input")),
      c.last_name,
      "text",
      "Last name",
    );
  }
  // Email twice: email-input + confirm-email-input both get contact.email.
  if (ynAdaUsable(c.email)) {
    push(
      "contact.email",
      ynSrResolveInput(ynAdaFind(document_, "#email-input")),
      c.email,
      "text",
      "Email",
    );
    push(
      "contact.email_confirm",
      ynSrResolveInput(ynAdaFind(document_, "#confirm-email-input")),
      c.email,
      "text",
      "Confirm email",
    );
  }
  if (ynAdaUsable(links.linkedin)) {
    push(
      "links.linkedin",
      ynSrResolveInput(ynAdaFind(document_, "#linkedin-input")),
      links.linkedin,
      "text",
      "LinkedIn",
    );
  }
  // website-input under "Your Profiles" → portfolio (research).
  if (ynAdaUsable(links.portfolio)) {
    push(
      "links.portfolio",
      ynSrResolveInput(ynAdaFind(document_, "#website-input")),
      links.portfolio,
      "text",
      "Website",
    );
  }
  // Cover-letter equivalent: free-text message to hiring team.
  if (plan && ynAdaUsable(plan.letter_text)) {
    const msgEl = ynSrResolveInput(
      ynAdaFind(document_, "#hiring-manager-message-input"),
    );
    if (msgEl) {
      const tag = (msgEl.tagName || "").toUpperCase();
      push(
        "letter_text",
        msgEl,
        plan.letter_text,
        tag === "TEXTAREA" ? "textarea" : "text",
        "Message to the Hiring Team",
      );
    }
  }

  // Resume: <spl-dropzone> / <spl-file-upload> (no stable id — observed on
  // the live SmartRecruiters one-click UI + a live Endava posting). OPEN shadow holds a hidden <input type=file>; the
  // component is DROP-driven ("Choose a file or drop it here / 10MB size
  // limit"). Setting FileList + change alone does NOT show the attached
  // chip (live: amber "Check these: Resume"). Same class as Greenhouse —
  // adapter supplies hints; engine ynAttachFileWithConfirm / ynDropFile stay
  // generic. Emerald ONLY when the filename chip / Remove control appears.
  if (plan && plan.cv_url) {
    const dropHost =
      ynAdaFind(document_, "spl-dropzone") ||
      ynAdaFind(document_, "spl-file-upload");
    if (dropHost) {
      const fileInner =
        typeof ynQueryDeep === "function"
          ? ynQueryDeep(dropHost, 'input[type="file"]')[0]
          : (dropHost.querySelector &&
              dropHost.querySelector('input[type="file"]')) ||
            null;
      // Drop listeners live inside the open shadow (not on the host alone).
      // Prefer the inner surface so synthetic DragEvents hit the handler.
      let dropSurface = dropHost;
      if (dropHost.shadowRoot) {
        dropSurface =
          dropHost.shadowRoot.querySelector(
            "[class*='drop'], [part*='drop'], [class*='upload'], " +
              "[role='button'], label, .spl-dropzone__area",
          ) ||
          dropHost.shadowRoot.querySelector("div, section") ||
          dropHost;
      }
      const resumeEl = fileInner || dropHost;
      push("cv_file", resumeEl, { file: "cv" }, "file", "Resume");
      const last = intents[intents.length - 1];
      if (last && last.fieldKey === "cv_file") {
        last.uploadMode = "drop_then_input";
        last.dropTarget = dropSurface;
        last.confirmRoot = dropHost;
        // Success chrome (fixture + best-effort live): filename chip or Remove.
        // NOT the empty-state prompt ("Choose a file or drop it here").
        last.confirmSelector =
          ".spl-file-upload__filename, .spl-dropzone__filename, " +
          "[class*='file-name'], [class*='filename'], " +
          "button[aria-label='Remove'], button[aria-label='Remove file']";
        last.confirmTimeoutMs = 3000;
      }
    }
  }

  // Phone / country / screening: spl-form-element_N — NOT claimed (unstable).
  // facebook-input / twitter-input verified in research but no profile keys → leave.
  // EEO: not SR-verified — do not invent; heuristics handles heading scan.
  //
  // ATTEMPTED 2026-09-03, headless, no sign-in: Wise's public posting
  // (jobs.smartrecruiters.com/Wise/744000142897224-...) loaded fine and its
  // "I'm interested" control navigates to SmartRecruiters' own
  // oneclick-ui SPA (jobs.smartrecruiters.com/oneclick-ui/company/...),
  // which never rendered any content for this walk (0 fields, empty body,
  // no console error) — a session/referrer handshake this headless probe
  // could not establish, not an account wall. Nothing new confirmed or
  // refuted here; the notes above stand exactly as before.

  return intents;
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "smartrecruiters",
  plan: ynSmartRecruitersPlan,
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynSrResolveInput = ynSrResolveInput;
globalThis.ynSmartRecruitersPlan = ynSmartRecruitersPlan;
