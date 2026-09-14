(() => {
  // extension/src/ui/posting_filler/index.js
  function ynPostingOverlay(lines) {
    const body = ynOverlayBox();
    if (!body) return;
    body.textContent = "";
    for (const line of lines) {
      const row = document.createElement("div");
      row.textContent = line;
      body.appendChild(row);
    }
  }
  function ynPostingEmptyReport() {
    return {
      filled: [],
      guessed: [],
      unresolved: [],
      skipped_eeo: [],
      skipped_payment: [],
      skipped_terms: [],
      user_kept: [],
      errors: []
    };
  }
  function ynPostingSendWorker(msg) {
    return new Promise((res) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          if (chrome.runtime.lastError) {
            res({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          res(r);
        });
      } catch (e) {
        res({ ok: false, error: String(e) });
      }
    });
  }
  function ynPostingEvidence(report, extra) {
    const f = (report.filled || []).length;
    const g = (report.guessed || []).length;
    const u = (report.unresolved || []).length;
    const pay = (report.skipped_payment || []).length;
    const terms = (report.skipped_terms || []).length;
    let s = `surface=indeed_employer; filled=${f}; guessed=${g}; unresolved=${u}; payment_skipped=${pay}; terms_skipped=${terms}`;
    if (extra) s += "; " + extra;
    return s;
  }
  function ynPostingOverlayLines(report, info) {
    const guessedN = (report.guessed || []).length;
    const done = (report.filled || []).length + guessedN;
    const lines = [
      "YoungNug",
      "Preparing your Indeed posting from the approved listing.",
      `Filled ${done} field(s)` + (guessedN ? ` (${guessedN} to double-check)` : "") + "."
    ];
    if (guessedN) {
      const labels = (report.guessed || []).map((e) => ynReportFieldLabel(e)).filter(Boolean).slice(0, 6);
      if (labels.length) lines.push("Check these: " + labels.join("; "));
    }
    if ((report.unresolved || []).length) {
      const labels = (report.unresolved || []).map((e) => ynReportFieldLabel(e)).filter(Boolean).slice(0, 6);
      if (labels.length)
        lines.push("I could not fill these: " + labels.join("; "));
    }
    if ((report.skipped_payment || []).length) {
      lines.push("Payment fields are never filled. Enter those yourself.");
    }
    if ((report.skipped_terms || []).length) {
      lines.push("Terms boxes are left for you to read and tick.");
    }
    if (info && info.descriptionLeft) {
      lines.push(
        "The description editor is rich text. Paste the description from YoungNug yourself."
      );
    }
    if (info && info.moreSteps) {
      lines.push(
        `Step filled (${info.stepKey || "this step"}). Click Continue yourself to move on.`
      );
    }
    lines.push("Nothing was posted - review and post it yourself.");
    return lines;
  }
  async function ynPrepareIndeedPosting(listingId) {
    ynOverlayClearDismissal();
    const surface = typeof ynDetectEmployerPosting === "function" ? ynDetectEmployerPosting(document, location.href) : null;
    if (!surface || surface.id !== "indeed_employer") {
      return {
        ok: false,
        error: "not_employer_surface",
        report: ynPostingEmptyReport()
      };
    }
    if (typeof ynChallengePage === "function" && ynChallengePage()) {
      await ynPostingSendWorker({
        type: "POSTING_RESULT",
        listingId,
        status: "aborted",
        detail: "challenge or login wall before fill"
      });
      ynPostingOverlay([
        "YoungNug stopped: this page shows a challenge or login.",
        "Sign in yourself, then try again. Nothing was bypassed."
      ]);
      return {
        ok: false,
        error: "captcha_stop",
        report: ynPostingEmptyReport()
      };
    }
    const plan = await ynPostingSendWorker({
      type: "GET_POSTING_PLAN",
      listingId
    });
    if (!plan || !plan.ok) {
      ynPostingOverlay([
        "No posting plan: the listing must be yours and approved in YoungNug."
      ]);
      return {
        ok: false,
        error: "no_posting_plan",
        report: ynPostingEmptyReport()
      };
    }
    const budgetEl = typeof ynIeSponsorshipField === "function" ? ynIeSponsorshipField(document) : null;
    if (budgetEl) {
      const label = (typeof ynReportLabel === "function" ? ynReportLabel(budgetEl, document) : "") || "Sponsorship budget";
      await ynPostingSendWorker({
        type: "POSTING_RESULT",
        listingId,
        status: "sponsorship_stop",
        detail: `budget field on page: ${label.slice(0, 120)}`
      });
      ynPostingOverlay([
        "YoungNug stopped: this step asks for a sponsorship budget.",
        `Found: ${label.slice(0, 80)}`,
        "Spending money is your decision. Nothing was entered.",
        "Nothing was posted - review and post it yourself."
      ]);
      return {
        ok: true,
        sponsorship_stop: true,
        status: "sponsorship_stop",
        report: ynPostingEmptyReport(),
        sponsorship_label: label.slice(0, 120)
      };
    }
    const adapters = typeof YN_ADAPTERS !== "undefined" ? YN_ADAPTERS : [];
    const adapter = adapters.find((a) => a && a.id === "indeed_employer") || null;
    let intents = [];
    const report0 = ynPostingEmptyReport();
    try {
      if (adapter && typeof adapter.plan === "function") {
        intents = adapter.plan(plan, document) || [];
      }
    } catch (e) {
      report0.errors.push({
        fieldKey: "adapter",
        label: String(e && e.message ? e.message : e)
      });
    }
    let report = ynPostingEmptyReport();
    try {
      if (typeof ynExecuteIntents === "function") {
        report = await ynExecuteIntents(intents, { plan, jobId: null });
      } else {
        report.errors.push({
          fieldKey: "engine",
          label: "ynExecuteIntents missing - engine.js not loaded?"
        });
      }
    } catch (e) {
      report.errors.push({
        fieldKey: "execute",
        label: String(e && e.message ? e.message : e)
      });
    }
    report.errors = [...report0.errors, ...report.errors || []];
    if (!report.skipped_payment) report.skipped_payment = [];
    if (!report.skipped_terms) report.skipped_terms = [];
    const descriptionLeft = Boolean(plan.description) && !intents.some((i) => i && i.fieldKey === "posting.description");
    const info = { moreSteps: false, stepKey: "", descriptionLeft };
    try {
      if (adapter && adapter.wizard) {
        if (typeof adapter.wizard.stepKey === "function") {
          info.stepKey = String(adapter.wizard.stepKey(document) || "");
        }
        if (typeof adapter.wizard.advance === "function") {
          const el = adapter.wizard.advance(document);
          if (el && !(typeof ynSubmitGuard === "function" && ynSubmitGuard(el))) {
            info.moreSteps = true;
          }
        }
      }
    } catch {
    }
    const evidence = ynPostingEvidence(
      report,
      info.moreSteps ? "more_steps=true" : ""
    );
    await ynPostingSendWorker({
      type: "POSTING_RESULT",
      listingId,
      status: "prepared",
      detail: evidence
    });
    ynPostingOverlay(ynPostingOverlayLines(report, info));
    return {
      ok: true,
      status: "prepared",
      report,
      evidence,
      descriptionLeft,
      moreSteps: info.moreSteps || void 0,
      stepKey: info.stepKey || void 0
    };
  }
  globalThis.ynPostingOverlay = ynPostingOverlay;
  globalThis.ynPostingEmptyReport = ynPostingEmptyReport;
  globalThis.ynPostingSendWorker = ynPostingSendWorker;
  globalThis.ynPostingEvidence = ynPostingEvidence;
  globalThis.ynPostingOverlayLines = ynPostingOverlayLines;
  globalThis.ynPrepareIndeedPosting = ynPrepareIndeedPosting;
})();
