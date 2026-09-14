// content/posting_filler.js — EMPLOYER posting orchestrator for
// employers.indeed.com: detect → posting-plan → adapter plan → execute →
// report. The board's final button is NEVER pressed — the employer reviews
// and presses Post themselves, the exact mirror of the candidate-side
// never-submit guarantee. A sponsorship budget question HALTS the whole
// flow (a spend decision is never automated), payment fields are never
// written, terms boxes are never ticked, and no status this file sends can
// ever claim a posting happened (the posted status comes only from the
// popup's confirmation strip, refused by the worker from any page sender —
// and the literal status string itself is pinned OUT of content/ entirely).

// ynOverlayBox / ynOverlayClearDismissal are common/overlay_box.js's bare
// globals (loaded before this file — see popup.js's YN_POSTING_SCRIPTS — a
// shipped file's source may never import into another shipped file's
// folder, per tests/test_extension_module_graph.py). The box itself (shadow
// root, brand chrome, close button) is the ONE shared painter —
// report_state.js's ynOverlay and the assist wall panel use the exact same
// definition.
function ynPostingOverlay(lines) {
  const body = ynOverlayBox();
  if (!body) return; // employer closed the box for this page
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
    errors: [],
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
  let s =
    `surface=indeed_employer; filled=${f}; guessed=${g}; unresolved=${u}; ` +
    `payment_skipped=${pay}; terms_skipped=${terms}`;
  if (extra) s += "; " + extra;
  return s;
}

function ynPostingOverlayLines(report, info) {
  const guessedN = (report.guessed || []).length;
  const done = (report.filled || []).length + guessedN;
  const lines = [
    "YoungNug",
    "Preparing your Indeed posting from the approved listing.",
    `Filled ${done} field(s)` +
      (guessedN ? ` (${guessedN} to double-check)` : "") +
      ".",
  ];
  if (guessedN) {
    const labels = (report.guessed || [])
      .map((e) => ynReportFieldLabel(e))
      .filter(Boolean)
      .slice(0, 6);
    if (labels.length) lines.push("Check these: " + labels.join("; "));
  }
  if ((report.unresolved || []).length) {
    const labels = (report.unresolved || [])
      .map((e) => ynReportFieldLabel(e))
      .filter(Boolean)
      .slice(0, 6);
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
      "The description editor is rich text. Paste the description from " +
        "YoungNug yourself.",
    );
  }
  if (info && info.moreSteps) {
    lines.push(
      `Step filled (${info.stepKey || "this step"}). Click Continue yourself ` +
        "to move on.",
    );
  }
  lines.push("Nothing was posted - review and post it yourself.");
  return lines;
}

async function ynPrepareIndeedPosting(listingId) {
  // A fresh posting-prep click is a new report, not one the employer may
  // have closed on a prior attempt at this same URL (see fa_setup.js).
  ynOverlayClearDismissal();
  // 0. This flow runs ONLY on the Indeed employer surface. Refuse anywhere
  // else, even if injected — URL-keyed, distinct from every candidate rule.
  const surface =
    typeof ynDetectEmployerPosting === "function"
      ? ynDetectEmployerPosting(document, location.href)
      : null;
  if (!surface || surface.id !== "indeed_employer") {
    return {
      ok: false,
      error: "not_employer_surface",
      report: ynPostingEmptyReport(),
    };
  }

  // 1. Challenge/login wall = HARD STOP, reported honestly as aborted.
  if (typeof ynChallengePage === "function" && ynChallengePage()) {
    await ynPostingSendWorker({
      type: "POSTING_RESULT",
      listingId,
      status: "aborted",
      detail: "challenge or login wall before fill",
    });
    ynPostingOverlay([
      "YoungNug stopped: this page shows a challenge or login.",
      "Sign in yourself, then try again. Nothing was bypassed.",
    ]);
    return {
      ok: false,
      error: "captcha_stop",
      report: ynPostingEmptyReport(),
    };
  }

  // 2. The posting plan — 404 unless this employer owns the listing AND a
  // moderator approved it (the same single publish gate as everything else).
  const plan = await ynPostingSendWorker({
    type: "GET_POSTING_PLAN",
    listingId,
  });
  if (!plan || !plan.ok) {
    ynPostingOverlay([
      "No posting plan: the listing must be yours and approved in YoungNug.",
    ]);
    return {
      ok: false,
      error: "no_posting_plan",
      report: ynPostingEmptyReport(),
    };
  }

  // 3. Sponsorship budget on this page → the flow HALTS before any fill.
  // The budget is the employer's spend decision; surfacing it and stopping
  // is the whole point (mirrors captcha_stop's shape).
  const budgetEl =
    typeof ynIeSponsorshipField === "function"
      ? ynIeSponsorshipField(document)
      : null;
  if (budgetEl) {
    const label =
      (typeof ynReportLabel === "function"
        ? ynReportLabel(budgetEl, document)
        : "") || "Sponsorship budget";
    await ynPostingSendWorker({
      type: "POSTING_RESULT",
      listingId,
      status: "sponsorship_stop",
      detail: `budget field on page: ${label.slice(0, 120)}`,
    });
    ynPostingOverlay([
      "YoungNug stopped: this step asks for a sponsorship budget.",
      `Found: ${label.slice(0, 80)}`,
      "Spending money is your decision. Nothing was entered.",
      "Nothing was posted - review and post it yourself.",
    ]);
    return {
      ok: true,
      sponsorship_stop: true,
      status: "sponsorship_stop",
      report: ynPostingEmptyReport(),
      sponsorship_label: label.slice(0, 120),
    };
  }

  // 4. Adapter plan (registered in YN_ADAPTERS as "indeed_employer").
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
      label: String(e && e.message ? e.message : e),
    });
  }

  // 5. Execute through the ONE writer — every engine guard applies
  // (honeypot, password scope, payment hard-skip, terms refusal).
  let report = ynPostingEmptyReport();
  try {
    if (typeof ynExecuteIntents === "function") {
      report = await ynExecuteIntents(intents, { plan, jobId: null });
    } else {
      report.errors.push({
        fieldKey: "engine",
        label: "ynExecuteIntents missing - engine.js not loaded?",
      });
    }
  } catch (e) {
    report.errors.push({
      fieldKey: "execute",
      label: String(e && e.message ? e.message : e),
    });
  }
  report.errors = [...report0.errors, ...(report.errors || [])];
  if (!report.skipped_payment) report.skipped_payment = [];
  if (!report.skipped_terms) report.skipped_terms = [];

  // Description honesty: when no textarea existed, the adapter planned no
  // description intent — say so instead of silently under-filling.
  const descriptionLeft =
    Boolean(plan.description) &&
    !intents.some((i) => i && i.fieldKey === "posting.description");

  // 6. Wizard: DETECT the next step only; never click (human-paced).
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
    /* detect-only, best-effort */
  }

  // 7. Report the outcome — ALWAYS "prepared"; no status this file sends
  // can claim a posting happened.
  const evidence = ynPostingEvidence(
    report,
    info.moreSteps ? "more_steps=true" : "",
  );
  await ynPostingSendWorker({
    type: "POSTING_RESULT",
    listingId,
    status: "prepared",
    detail: evidence,
  });

  ynPostingOverlay(ynPostingOverlayLines(report, info));

  return {
    ok: true,
    status: "prepared",
    report,
    evidence,
    descriptionLeft,
    moreSteps: info.moreSteps || undefined,
    stepKey: info.stepKey || undefined,
  };
}
// Every name top-level in the original single-file version, exposed on
// globalThis exactly as before the move — chrome.scripting still injects
// the built file into the same isolated world as its neighbours, so a
// bare name another shipped file already called is still there to call.
globalThis.ynPostingOverlay = ynPostingOverlay;
globalThis.ynPostingEmptyReport = ynPostingEmptyReport;
globalThis.ynPostingSendWorker = ynPostingSendWorker;
globalThis.ynPostingEvidence = ynPostingEvidence;
globalThis.ynPostingOverlayLines = ynPostingOverlayLines;
globalThis.ynPrepareIndeedPosting = ynPrepareIndeedPosting;
