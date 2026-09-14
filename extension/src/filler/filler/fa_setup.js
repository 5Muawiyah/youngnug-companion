// content/filler.js, part 7 of 11 — ynFillApplication, phase 1 of 4: every
// hard stop before a single field is written (a real challenge/login wall,
// a fill-plan not yet Approved, the login-wall handoff for a listing that
// is not an apply form until sign-in, and an empty-frame skip), plus ATS
// detection and the three values every later phase needs (plan, ats,
// origin, employer) and the passive-captcha-widget read taken before any
// write. Split from the single-file version's one long ynFillApplication
// into four phase functions (this being the first) sharing one plain
// state object S instead of closure variables — a phase that hits a hard
// stop sets S.earlyReturn and returns; the entry in index.js checks that
// after calling it and returns the same value the single-file version
// would have returned at that exact point. See index.js for the file's
// full history and the other three phases.
import { ynEmptyReport, ynOverlay } from "./report_state.js";
import { ynAtsDisplayLine, ynAssistOnlyHandoff } from "./overlay_lines.js";
import { ynSendWorker } from "./worker_cache.js";
// ynOverlayClearDismissal is common/overlay_box.js's bare global (loaded as
// its own injected file — see fill_report.js's YN_FILL_SCRIPTS — since a
// shipped file's source may never import into another shipped file's
// folder, per tests/test_extension_module_graph.py).

export async function ynFillApplicationSetup(jobId, S) {
  // A fresh Approve/Fill click is a new report, not the one the student may
  // have closed on a PRIOR attempt at this same URL — the "stays closed"
  // scope is a re-render of that same report, never the next one.
  ynOverlayClearDismissal();
  // 1. Real challenge / login wall = HARD STOP. A passive captcha widget on
  //    an otherwise-normal form (Lever hCaptcha, Ashby reCAPTCHA) is NOT a
  //    stop — we fill and flag it so the user solves it at submit.
  //    Capture and other flows still use strict ynBlocked().
  // No fill was attempted on either hard-stop-before-fill branch below —
  // an empty report's coverage is exactly "nothing to report" (0 fields),
  // not a false 0%, so ynCoverage's value comes back null there.
  const ynNoFillCoverage = () =>
    typeof ynCoverage === "function" ? ynCoverage(ynEmptyReport()) : null;
  if (typeof ynChallengePage === "function" && ynChallengePage()) {
    const cov0 = ynNoFillCoverage();
    await ynSendWorker({
      type: "APPLY_RESULT",
      jobId,
      status: "captcha_stop",
      evidence: "challenge before fill",
      causes: cov0 && cov0.causes,
      coverage: cov0 && cov0.coverage,
    });
    ynOverlay([
      "YoungNug stopped: this page shows a challenge/login.",
      "Finish manually. Nothing was bypassed.",
    ]);
    S.earlyReturn = {
      ok: false,
      error: "captcha_stop",
      ats: { id: "unknown", name: "an unknown system" },
      report: ynEmptyReport(),
    };
    return;
  }
  // Fallback if api.js split helpers are missing: keep legacy hard stop.
  if (
    typeof ynChallengePage !== "function" &&
    typeof ynBlocked === "function" &&
    ynBlocked()
  ) {
    const cov0 = ynNoFillCoverage();
    await ynSendWorker({
      type: "APPLY_RESULT",
      jobId,
      status: "captcha_stop",
      evidence: "challenge before fill",
      causes: cov0 && cov0.causes,
      coverage: cov0 && cov0.coverage,
    });
    ynOverlay([
      "YoungNug stopped: this page shows a challenge/login.",
      "Finish manually. Nothing was bypassed.",
    ]);
    S.earlyReturn = {
      ok: false,
      error: "captcha_stop",
      ats: { id: "unknown", name: "an unknown system" },
      report: ynEmptyReport(),
    };
    return;
  }
  const passiveCaptchaBefore =
    typeof ynPassiveCaptchaPresent === "function" && ynPassiveCaptchaPresent();

  // 2. Fill-plan — 404 without the user's Approve (THE gate)
  const plan = await ynSendWorker({ type: "GET_FILL_PLAN", jobId });
  if (!plan || !plan.ok) {
    ynOverlay([
      "No fill-plan: Approve this job in YoungNug first (that is the gate).",
    ]);
    S.earlyReturn = {
      ok: false,
      error: "no_fill_plan",
      ats: null,
      report: ynEmptyReport(),
    };
    return;
  }

  // 3. Detect ATS
  const ats =
    typeof ynDetectAts === "function"
      ? ynDetectAts(document, location.href)
      : { id: "unknown", name: "an unknown system", confidence: "unknown" };

  const origin = location.origin || "";
  const employer =
    (plan.job && plan.job.employer) || plan.employer || origin || "unknown";

  // 3b. Login WALL handoff — a listing page that is NOT an apply form until
  // the student signs in (Reed: "Apply now" redirects to Reed's own login
  // when signed out; signed in it opens the modal the adapter fills). The
  // adapter decides from the live page (adapter.loginWall); a detect rule
  // may still declare a whole site assistOnly. Show the plain handoff and
  // STOP before any field-fill rung, including the no-form frame skip.
  // Status is login_required (a captcha_stop-class non-fill, reported
  // accurately). Never "filled". Never click the apply button.
  const wallAdapter =
    (typeof YN_ADAPTERS !== "undefined" ? YN_ADAPTERS : []).find(
      (a) => a && a.id === ats.id,
    ) || null;
  const atWall =
    !!(ats && ats.assistOnly) ||
    !!(
      wallAdapter &&
      typeof wallAdapter.loginWall === "function" &&
      wallAdapter.loginWall(document)
    );
  if (atWall) {
    const evidence = `ats=${ats.id || "unknown"}; assist_only=true; login_wall_handoff`;
    const cov0 = ynNoFillCoverage();
    await ynSendWorker({
      type: "APPLY_RESULT",
      jobId,
      status: "login_required",
      evidence,
      causes: cov0 && cov0.causes,
      coverage: cov0 && cov0.coverage,
    });
    ynAssistOnlyHandoff(ats);
    S.earlyReturn = {
      ok: true,
      ats,
      report: ynEmptyReport(),
      evidence,
      displayLine: ynAtsDisplayLine(ats, true),
      status: "login_required",
      login_wall_handoff: true,
    };
    return;
  }

  // allFrames injection: skip empty parent frames (e.g. employer careers shell
  // around a Greenhouse iframe) so we don't spam APPLY_RESULT from shells.
  const fillable =
    typeof ynQueryDeep === "function"
      ? ynQueryDeep(document, "input, textarea, select")
      : [...document.querySelectorAll("input, textarea, select")];
  const hasForm = fillable.some((el) => {
    const t = (el.type || "").toLowerCase();
    return !["hidden", "submit", "button", "image", "reset"].includes(t);
  });
  if (!hasForm) {
    S.earlyReturn = {
      ok: true,
      skipped_frame: true,
      ats,
      report: ynEmptyReport(),
      displayLine: ynAtsDisplayLine(ats),
    };
    return;
  }
  S.plan = plan;
  S.ats = ats;
  S.origin = origin;
  S.employer = employer;
  S.passiveCaptchaBefore = passiveCaptchaBefore;
}
