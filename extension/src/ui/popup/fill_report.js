// popup.js — the click-time fill stack's file list (YN_FILL_SCRIPTS), the
// fill-report renderer, and the shared HTML-escaping helper every popup
// report in this codebase uses.

// Fill-stack files for activeTab injection. This is now the ONLY
// path — no static ATS content scripts remain, so the click-time stack must
// be the FULL ladder (generic modules before their private consumers, every
// adapter — they self-register into YN_ADAPTERS and detect.js picks — then
// settle/filler, then the resolver ping). Dependency order matters
// and is pinned (test_popup_click_stack_orders_generic_before_private /
// test_assist_js_exists_and_is_loaded).
const YN_FILL_SCRIPTS = [
  "common/api.js",
  "common/yn_theme.js",
  "common/challenge_detect.js",
  "common/label_quality.js",
  "common/own_rules.js",
  "common/placeholder.js",
  "common/overlay_box.js",
  "content/dom_fill_kit.js",
  "content/aria_driver.js",
  "content/skills_fill.js",
  "content/engine.js",
  "content/detect.js",
  "content/heuristics.js",
  // Shared adapter utilities — loaded before any adapter that uses them
  // (repeater.js: workday.js's history rows; url_scope.js, reopen.js: pure
  // functions, each documenting its own not-yet-wired call site in a
  // comment at the top of the file).
  "content/repeater.js",
  "content/adapters/url_scope.js",
  "content/adapters/reopen.js",
  "content/adapters/greenhouse.js",
  "content/adapters/lever.js",
  "content/adapters/ashby.js",
  "content/adapters/smartrecruiters.js",
  "content/adapters/icims.js",
  "content/adapters/taleo.js",
  "content/adapters/successfactors.js",
  "content/adapters/workday.js",
  "content/adapters/teamtailor.js",
  "content/adapters/recruitee.js",
  "content/adapters/workable.js",
  "content/adapters/personio.js",
  "content/adapters/pinpoint.js",
  "content/adapters/dover.js",
  "content/adapters/linkedin_easy_apply.js",
  "content/adapters/indeed_apply.js",
  "content/adapters/reed.js",
  "content/password_kit.js",
  "content/assist.js",
  "content/settle_observer.js",
  "content/review_screen.js",
  "content/filler.js",
  "content/resolver_ping.js",
];

// ynInjectOnce now lives in common/inject_once.js, loaded by popup.html
// before this file and by the worker through importScripts, so the Capture
// button and the Capture keyboard shortcut cannot inject differently.

function ynRenderFillReport(result) {
  const box = document.getElementById("fill-report");
  if (!box) return;
  if (!result) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  const ats = result.ats;
  const report = result.report || {};
  const filledN = (report.filled || []).length;
  const guessedN = (report.guessed || []).length;
  const unresolvedN = (report.unresolved || []).length;
  const eeoN = (report.skipped_eeo || []).length;
  const needsYouN = (report.needs_you || []).length;
  const done = filledN + guessedN;
  const total =
    done +
    unresolvedN +
    eeoN +
    needsYouN +
    (report.skipped_password || []).length +
    (report.user_kept || []).length;

  const parts = [];
  if (result.displayLine) {
    parts.push(`<p class="fill-ats">${escapeHtml(result.displayLine)}</p>`);
  } else if (ats && ats.id === "unknown") {
    parts.push(
      `<p class="fill-ats">I don't know this system. Using generic field matching.</p>`,
    );
  } else if (ats && ats.name) {
    parts.push(
      `<p class="fill-ats">Filling a ${escapeHtml(ats.name)} application</p>`,
    );
  }
  parts.push(
    `<p><strong>Filled ${done} of ${total || done}</strong>` +
      (guessedN ? ` · ${guessedN} to check` : "") +
      `</p>`,
  );
  if (guessedN) {
    const labels = (report.guessed || [])
      .map((e) => ynReportFieldLabel(e))
      .filter(Boolean)
      .slice(0, 5);
    if (labels.length) {
      parts.push(
        `<p class="fill-check">Check these: ${escapeHtml(labels.join("; "))}</p>`,
      );
    }
  }
  if (unresolvedN) {
    const labels = (report.unresolved || [])
      .map((e) => ynReportFieldLabel(e))
      .filter(Boolean)
      .slice(0, 5);
    if (labels.length) {
      parts.push(
        `<p class="fill-miss">I could not read these: ${escapeHtml(labels.join("; "))}</p>`,
      );
    }
  }
  if (needsYouN) {
    // Recognised questions with no stored answer are handed to the user as
    // an amber prompt, never guessed.
    const labels = (report.needs_you || [])
      .map((e) => ynReportFieldLabel(e))
      .filter(Boolean)
      .slice(0, 5);
    parts.push(
      `<p class="fill-check">Answer these yourself: ${escapeHtml(labels.join("; "))}</p>`,
    );
  }
  if (eeoN) {
    parts.push(
      `<p class="muted">Equal-opportunity questions left for you.</p>`,
    );
  }
  if ((report.skipped_payment || []).length) {
    parts.push(`<p class="muted">Payment fields are never filled.</p>`);
  }
  if ((report.skipped_terms || []).length) {
    parts.push(
      `<p class="muted">Terms boxes are left for you to read and tick.</p>`,
    );
  }
  if ((report.skipped_password || []).length) {
    // The credential refusal used to be invisible: the fields were left
    // alone (four independent layers see to that) and nothing said so, which
    // reads as a miss rather than a refusal. Named, with the count.
    parts.push(
      `<p class="muted">Passwords and sign-in fields never filled · ${
        report.skipped_password.length
      }</p>`,
    );
  }
  // the review screen decides which drafts actually reached the page —
  // `written` names the ones that did, so the count here is the outcome of
  // that Approve, not just how many were drafted.
  const draftsList = report.drafts || [];
  if (draftsList.length) {
    const usedN = draftsList.filter((d) => d.written).length;
    parts.push(
      `<p class="muted">Drafted answers used: ${usedN} of ${draftsList.length}</p>`,
    );
  }
  parts.push(
    `<p class="fill-never">Nothing was submitted - review and submit yourself.</p>`,
  );
  box.innerHTML = parts.join("");
  box.hidden = false;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { YN_FILL_SCRIPTS, ynRenderFillReport, escapeHtml };
