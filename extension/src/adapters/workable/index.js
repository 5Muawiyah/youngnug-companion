// content/adapters/workable.js — deterministic Workable (apply.workable.com) fill intents.
// Selectors live-verified on 2 tenants (starling-bank, blueground) + the platform
// bundle's own form builder (ids firstname/lastname/email are platform-level).
// The page is an empty React shell on first paint — EVERY field mounts
// client-side, so plan() waits briefly for the form (ynWaitFor), then claims
// stable ids/data-ui only. Custom CA_*/QA_* questions carry per-tenant numeric
// ids → left unclaimed for the heuristics rung (label match), never invented.
// Never password, never GDPR-consent, never EEOC, never submit
// (button[data-ui="apply-button"] is type=submit — ynSubmitGuard territory).

/**
 * Wait for the Workable apply form to mount (React renders it after the
 * bundle loads; server HTML has no fields at all). Short timeout so a
 * non-apply Workable page (job description tab) does not hang the fill.
 * Returns the form element, or null if still absent.
 */
async function ynWkWaitForForm(doc) {
  const document_ = doc || document;
  const ready = () =>
    ynAdaFind(document_, 'form[data-ui="application-form"], #firstname');
  const already = ready();
  if (already) return already;
  if (typeof ynWaitFor !== "function") return null;
  try {
    return await ynWaitFor(() => ready() || null, {
      timeoutMs: 4000,
      root: document_,
      debounceMs: 80,
    });
  } catch {
    return null;
  }
}

/**
 * Workable plan() — claims research-verified platform-stable fields only.
 * - identity: #firstname / #lastname / #email (bundle-hardcoded ids)
 * - phone: [data-ui="phone"] input[name=phone] (intl-tel-input; a native-setter
 *   write of a full +44 number was live-verified to parse + hold)
 * - resume: input[type=file][data-ui="resume"] (id is RANDOM per mount — never
 *   select by id); native-input attach confirmed live (dropzone shows the
 *   filename + "Replace"), engine confirm-before-green decides emerald/amber
 * - cover letter: #cover_letter; address: #address (single-line)
 * - GDPR consent checkbox + any [data-ui="eeoc-form"] field → skip:"eeo"
 * - CA_* and QA_* custom questions, headline/summary (no profile key), and
 *   the education/experience add-row groups are left unclaimed.
 */
async function ynWorkablePlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const c = (plan && plan.contact) || {};
  const addr = (plan && plan.address) || {};
  const claimed = new Set();

  // React shell: wait briefly for the form mount, then claim what is present.
  await ynWkWaitForForm(document_);

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

  // Identity — bundle-hardcoded platform ids (verified both tenants).
  if (ynAdaUsable(c.first_name)) {
    push(
      "contact.first_name",
      ynAdaFind(document_, '#firstname, input[data-ui="firstname"]'),
      c.first_name,
      "text",
      "First name",
    );
  }
  if (ynAdaUsable(c.last_name)) {
    push(
      "contact.last_name",
      ynAdaFind(document_, '#lastname, input[data-ui="lastname"]'),
      c.last_name,
      "text",
      "Last name",
    );
  }
  if (ynAdaUsable(c.email)) {
    push(
      "contact.email",
      ynAdaFind(document_, '#email, input[data-ui="email"]'),
      c.email,
      "text",
      "Email",
    );
  }

  // Phone — the input has NO id/data-ui; its [data-ui="phone"] wrapper does.
  // intl-tel-input widget: live-verified that a native-setter write parses
  // (+44… → national format, dial code held, no validation error).
  if (ynAdaUsable(c.phone)) {
    push(
      "contact.phone",
      ynAdaFind(
        document_,
        '[data-ui="phone"] input[name="phone"], ' +
          'form[data-ui="application-form"] input[name="phone"][type="tel"]',
      ),
      c.phone,
      "text",
      "Phone",
    );
  }

  // Address — single-line input (tenant-optional; verified on blueground).
  const addrVal =
    [addr.line1, addr.city, addr.postcode].filter(Boolean).join(", ") ||
    [addr.city, addr.country].filter(Boolean).join(", ") ||
    addr.city ||
    "";
  if (ynAdaUsable(addrVal)) {
    push(
      "address.line1",
      ynAdaFind(document_, '#address, input[data-ui="address"]'),
      addrVal,
      "text",
      "Address",
    );
  }

  // Cover letter — native textarea (verified both tenants).
  if (plan && ynAdaUsable(plan.letter_text)) {
    push(
      "letter_text",
      ynAdaFind(document_, '#cover_letter, textarea[data-ui="cover_letter"]'),
      plan.letter_text,
      "textarea",
      "Cover letter",
    );
  }

  // Resume — input[type=file][data-ui="resume"]; id is RANDOM per mount
  // (input_files_input_<hash>) so data-ui is the only stable hook. The input
  // sits inside div[data-role="dropzone"]; the native-input attach path was
  // live-verified (filename + "Replace file or drag and drop here" appear in
  // the dropzone chrome — default ynFileAttachVisibleOk confirm; the empty
  // state says "Choose file", so no false-green). Engine confirm-before-green
  // downgrades to amber if the chrome never confirms.
  if (plan && plan.cv_url) {
    const fileEl = ynAdaFind(document_, 'input[type="file"][data-ui="resume"]');
    if (fileEl) {
      const dropHost =
        (fileEl.closest && fileEl.closest('[data-role="dropzone"]')) || null;
      push("cv_file", fileEl, { file: "cv" }, "file", "Resume");
      const last = intents[intents.length - 1];
      if (last && last.fieldKey === "cv_file") {
        last.uploadMode = "input"; // native input verified live
        if (dropHost) {
          last.dropTarget = dropHost; // drop fallback only
          last.confirmRoot = dropHost;
        }
        last.confirmTimeoutMs = 3000;
      }
    }
  }

  // GDPR / privacy consent — NEVER auto-check (user's own legal consent).
  // Reported skip:"eeo" so the overlay says "left for you" (Teamtailor pattern).
  // EEOC demographic step (US tenants; bundle data-ui="eeoc-form"): claim its
  // fields the same way so they can never be auto-answered.
  const neverFill = [
    ...ynAdaFindAll(
      document_,
      'input[type="checkbox"][name="gdpr"], [data-ui="gdpr"] input[type="checkbox"]',
    ),
    ...ynAdaFindAll(
      document_,
      '[data-ui="eeoc-form"] input, [data-ui="eeoc-form"] select, ' +
        '[data-ui="eeoc-form"] textarea',
    ),
  ];
  const skipSeen = new Set();
  for (const el of neverFill) {
    if (!el || skipSeen.has(el) || claimed.has(el) || ynAdaIsPassword(el))
      continue;
    const type = (el.type || "").toLowerCase();
    if (["hidden", "submit", "button", "image", "reset"].includes(type))
      continue;
    skipSeen.add(el);
    claimed.add(el);
    const tag = (el.tagName || "").toUpperCase();
    intents.push({
      fieldKey: type === "checkbox" ? "consent" : "eeo",
      el,
      value: null,
      kind:
        tag === "SELECT"
          ? "select"
          : tag === "TEXTAREA"
            ? "textarea"
            : type === "checkbox"
              ? "checkbox"
              : type === "radio"
                ? "radio"
                : "text",
      confidence: "exact",
      source: "adapter",
      skip: "eeo",
      label:
        ynAdaLabelOf(el, document_) ||
        (type === "checkbox" ? "Consent" : "EEO field"),
    });
  }

  // CA_*/QA_* custom questions: per-tenant numeric ids (radiogroups with
  // random option ids, multi-checkbox groups, comboboxes with a hidden
  // required text input) — deterministically unclaimable, so the heuristics
  // rung matches them by label. headline/summary have no profile key. The
  // education/experience groups render rows only after the user clicks
  // [data-ui="add-section"] — never touched. [data-ui="autofill-button"]
  // ("Import resume from…") and button[data-ui="apply-button"] (submit) are
  // never touched.

  return intents;
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "workable",
  plan: ynWorkablePlan,
  // React writes held in live verification (no post-write hydration wipe) —
  // default fast-path hold-check is sufficient; no hydrationWatch.
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynWkWaitForForm = ynWkWaitForForm;
globalThis.ynWorkablePlan = ynWorkablePlan;
