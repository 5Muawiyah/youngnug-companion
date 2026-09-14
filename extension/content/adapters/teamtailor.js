(() => {
  // extension/src/adapters/teamtailor/index.js
  async function ynTtWaitForForm(doc) {
    const document_ = doc || document;
    const ready = () => ynAdaFind(
      document_,
      "#candidate_first_name, #job-application-form, #upload_resume_field"
    );
    const already = ready();
    if (already) return already;
    if (typeof ynWaitFor !== "function") return null;
    try {
      return await ynWaitFor(() => ready() || null, {
        timeoutMs: 4e3,
        root: document_,
        debounceMs: 80
      });
    } catch {
      return null;
    }
  }
  async function ynTeamtailorPlan(plan, doc) {
    const document_ = doc || document;
    const intents = [];
    const c = plan && plan.contact || {};
    const claimed = /* @__PURE__ */ new Set();
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
        label: label || ynAdaLabelOf(el, document_) || fieldKey
      });
    };
    if (ynAdaUsable(c.first_name)) {
      push(
        "contact.first_name",
        ynAdaFind(document_, "#candidate_first_name"),
        c.first_name,
        "text",
        "First name"
      );
    }
    if (ynAdaUsable(c.last_name)) {
      push(
        "contact.last_name",
        ynAdaFind(document_, "#candidate_last_name"),
        c.last_name,
        "text",
        "Last name"
      );
    }
    if (ynAdaUsable(c.email)) {
      push(
        "contact.email",
        ynAdaFind(document_, "#candidate_email"),
        c.email,
        "text",
        "Email"
      );
    }
    if (ynAdaUsable(c.phone)) {
      push(
        "contact.phone",
        ynAdaFind(document_, "#candidate_phone"),
        c.phone,
        "text",
        "Phone"
      );
    }
    if (plan && ynAdaUsable(plan.letter_text)) {
      push(
        "letter_text",
        ynAdaFind(
          document_,
          "#candidate_job_applications_attributes_0_cover_letter"
        ),
        plan.letter_text,
        "textarea",
        "Cover letter"
      );
    }
    if (plan && plan.cv_url) {
      const dropHost = ynAdaFind(document_, "#upload_resume_field");
      if (dropHost) {
        let fileInner = null;
        try {
          fileInner = dropHost.querySelector && dropHost.querySelector('input[type="file"]') || null;
          if (!fileInner && typeof ynQueryDeep === "function") {
            fileInner = ynQueryDeep(dropHost, 'input[type="file"]')[0] || null;
          }
        } catch {
          fileInner = null;
        }
        if (!fileInner) {
          const form = ynAdaFind(document_, "#job-application-form") || document_;
          const near = ynAdaFindAll(form, 'input[type="file"]').find((el) => {
            const sig = (el.id || "") + " " + (el.name || "") + " " + (el.accept || "");
            return /resume|cv|upload/i.test(sig) || el.closest("#upload_resume_field");
          });
          if (near) fileInner = near;
        }
        const resumeEl = fileInner || dropHost;
        push("cv_file", resumeEl, { file: "cv" }, "file", "Upload CV");
        const last = intents[intents.length - 1];
        if (last && last.fieldKey === "cv_file") {
          last.uploadMode = fileInner ? "drop_then_input" : "drop";
          last.dropTarget = dropHost;
          last.confirmRoot = dropHost;
          last.confirmSelector = ".dz-filename, [data-dz-name], .dz-success .dz-filename, [class*='filename'], [class*='file-name']";
          last.confirmTimeoutMs = 3e3;
        }
      }
    }
    const consentFields = ynAdaFindAll(
      document_,
      '#candidate_consent_given, input[name="candidate[consent_given]"][type="checkbox"], input[name="candidate[consent_given_future_jobs]"][type="checkbox"]'
    );
    const consentSeen = /* @__PURE__ */ new Set();
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
        label: ynAdaLabelOf(el, document_) || "Consent"
      });
    }
    return intents;
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "teamtailor",
    plan: ynTeamtailorPlan,
    // Turbo (Hotwire) hydrates AFTER server render and can wipe field values
    // later than a single settle check — the filler watches the full re-assert
    // window (no early break) for this adapter.
    hydrationWatch: true
  });
  globalThis.ynTtWaitForForm = ynTtWaitForForm;
  globalThis.ynTeamtailorPlan = ynTeamtailorPlan;
})();
