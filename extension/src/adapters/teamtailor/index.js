// content/adapters/teamtailor.js — deterministic Teamtailor fill intents.
// Selectors verified live across 4 tenants.
// Form may be lazy via <turbo-frame id="application_form" src=".../applications/new">.
// plan() waits briefly for the frame to hydrate; if fields are still absent it
// returns [] (fields not yet present). NEVER fetches the frame URL itself —
// content-script fills only what the PAGE renders. Never password, never consent
// checkbox, never submit. Custom answers_attributes → heuristics. Disability
// Confident Scheme is a custom question (label-filter like EEO) — skip consent.

/**
 * Wait for the Teamtailor apply form controls (turbo-frame may still be empty).
 * Uses engine ynWaitFor; short timeout so a cold job page does not hang.
 * Returns the first identity field found, or null if still absent.
 */
async function ynTtWaitForForm(doc) {
  const document_ = doc || document;
  const ready = () =>
    ynAdaFind(
      document_,
      "#candidate_first_name, #job-application-form, #upload_resume_field",
    );
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
 * Teamtailor plan() — claims research-verified stable ids only.
 * Custom candidate[answers_attributes][N] and location combobox left unclaimed.
 * Consent checkboxes reported as skip:"eeo" (never auto-check).
 * Resume: Dropzone mount #upload_resume_field (no native file input on first
 * paint) → engine drop path + confirm-before-green. The attach POINT
 * (#upload_resume_field's nested input[type=file]) is CONFIRMED live
 * 2026-09-03 (Moto, see the comment beside confirmSelector below); the
 * post-attach CONFIRM chrome stays UNVERIFIED by design (never attaching a
 * real file during a read-only check); emerald only on visible filename
 * chrome.
 */
async function ynTeamtailorPlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const c = (plan && plan.contact) || {};
  const claimed = new Set();

  // Lazy turbo-frame: wait briefly, then proceed with whatever is present.
  await ynTtWaitForForm(document_);

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

  // Stable platform-wide ids (verified all 4 tenants).
  if (ynAdaUsable(c.first_name)) {
    push(
      "contact.first_name",
      ynAdaFind(document_, "#candidate_first_name"),
      c.first_name,
      "text",
      "First name",
    );
  }
  if (ynAdaUsable(c.last_name)) {
    push(
      "contact.last_name",
      ynAdaFind(document_, "#candidate_last_name"),
      c.last_name,
      "text",
      "Last name",
    );
  }
  if (ynAdaUsable(c.email)) {
    push(
      "contact.email",
      ynAdaFind(document_, "#candidate_email"),
      c.email,
      "text",
      "Email",
    );
  }
  if (ynAdaUsable(c.phone)) {
    push(
      "contact.phone",
      ynAdaFind(document_, "#candidate_phone"),
      c.phone,
      "text",
      "Phone",
    );
  }

  // Cover letter — native textarea (verified all 4).
  if (plan && ynAdaUsable(plan.letter_text)) {
    push(
      "letter_text",
      ynAdaFind(
        document_,
        "#candidate_job_applications_attributes_0_cover_letter",
      ),
      plan.letter_text,
      "textarea",
      "Cover letter",
    );
  }

  // Resume: Dropzone.js mount — raw HTML has NO <input type=file>.
  // Prefer an injected file input if Dropzone already mounted it; else drop
  // on #upload_resume_field (engine ynDropFile / confirm-before-green).
  if (plan && plan.cv_url) {
    const dropHost = ynAdaFind(document_, "#upload_resume_field");
    if (dropHost) {
      let fileInner = null;
      try {
        fileInner =
          (dropHost.querySelector &&
            dropHost.querySelector('input[type="file"]')) ||
          null;
        if (!fileInner && typeof ynQueryDeep === "function") {
          fileInner = ynQueryDeep(dropHost, 'input[type="file"]')[0] || null;
        }
      } catch {
        fileInner = null;
      }
      // Also accept a Dropzone-injected input under the form (same paint).
      if (!fileInner) {
        const form = ynAdaFind(document_, "#job-application-form") || document_;
        const near = ynAdaFindAll(form, 'input[type="file"]').find((el) => {
          const sig =
            (el.id || "") + " " + (el.name || "") + " " + (el.accept || "");
          return (
            /resume|cv|upload/i.test(sig) || el.closest("#upload_resume_field")
          );
        });
        if (near) fileInner = near;
      }
      const resumeEl = fileInner || dropHost;
      push("cv_file", resumeEl, { file: "cv" }, "file", "Upload CV");
      const last = intents[intents.length - 1];
      if (last && last.fieldKey === "cv_file") {
        // Drop primary: mount is Dropzone; seed input when present (GH/SR pattern).
        last.uploadMode = fileInner ? "drop_then_input" : "drop";
        last.dropTarget = dropHost;
        last.confirmRoot = dropHost;
        // Dropzone.js default chrome (library convention) + generic filename.
        // CHECKED on a live page 2026-09-03, headless, no sign-in: Moto's "Barista - Costa"
        // posting (moto.teamtailor.com/jobs/8318918-...) confirmed the
        // ATTACH POINT exactly — #upload_resume_field IS a
        // data-controller="forms--inputs--upload" wrapper div, and it does
        // contain a nested input#candidate_resume_remote_url.dz-hidden-input
        // (found by dropHost.querySelector('input[type=file]') above,
        // exactly as this code already assumed). What stays UNVERIFIED is
        // only the CONFIRM-AFTER-ATTACH chrome below: that check never
        // attached a real file (the extension never writes during a
        // read-only observation), so ynFileAttachVisibleOk seeing a real
        // filename / remove control is still an assumption, not a
        // confirmed one — emerald only when it does.
        last.confirmSelector =
          ".dz-filename, [data-dz-name], .dz-success .dz-filename, " +
          "[class*='filename'], [class*='file-name']";
        last.confirmTimeoutMs = 3000;
      }
    }
  }

  // Consent opt-ins — platform-stable ids (verified). NEVER auto-check.
  // Report as skip:"eeo" so the engine leaves them under "left for you"
  // (same path as Greenhouse/Lever demographic blocks).
  const consentFields = ynAdaFindAll(
    document_,
    "#candidate_consent_given, " +
      'input[name="candidate[consent_given]"][type="checkbox"], ' +
      'input[name="candidate[consent_given_future_jobs]"][type="checkbox"]',
  );
  const consentSeen = new Set();
  for (const el of consentFields) {
    if (!el || consentSeen.has(el) || claimed.has(el) || ynAdaIsPassword(el))
      continue;
    const type = (el.type || "").toLowerCase();
    if (type !== "checkbox") continue;
    consentSeen.add(el);
    claimed.add(el);
    intents.push({
      fieldKey: "consent",
      el,
      value: null,
      kind: "checkbox",
      confidence: "exact",
      source: "adapter",
      skip: "eeo",
      label: ynAdaLabelOf(el, document_) || "Consent",
    });
  }

  // No platform EEO wizard (research). Disability Confident / custom questions
  // use answers_attributes — left to heuristics + EEO heading scan.
  // No captcha found on any of 4 tenants — filler still runs passive/challenge checks.

  return intents;
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "teamtailor",
  plan: ynTeamtailorPlan,
  // Turbo (Hotwire) hydrates AFTER server render and can wipe field values
  // later than a single settle check — the filler watches the full re-assert
  // window (no early break) for this adapter.
  hydrationWatch: true,
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynTtWaitForForm = ynTtWaitForForm;
globalThis.ynTeamtailorPlan = ynTeamtailorPlan;
