// content/filler.js, part 11 of 11 — GENERIC FILL: the Companion on any
// page, from the profile alone, with no job, no fill-plan and no tracker
// row to report against. Shares the whole planning ladder, every guard and
// the challenge/login-wall hard stops with ynFillApplication; deliberately
// skips APPLY_RESULT, fillstate resume, generated free-text and document
// attach — see the doc comment on ynFillAnyPage below for why. Also
// carries ynGenericDisplayLine, the small one-line status the popup shows
// for this rung. See index.js for the file's full history.
import { ynEmptyReport, ynMergeReport, ynOverlay } from "./report_state.js";
import {
  ynAssistOnlyHandoff,
  ynAtsDisplayLine,
  ynCountNotAttempted,
  ynCredentialSkips,
} from "./overlay_lines.js";
import { ynOverlayReport } from "./overlay_report.js";
import { ynPlanRungs, ynReviewGate, ynSplitIntents } from "./plan_rungs.js";
import { ynCacheHeuristicWins } from "./worker_cache.js";
// ynOverlayClearDismissal is common/overlay_box.js's bare global — see
// fa_setup.js's own note on why this is not an ES import.
export async function ynFillAnyPage(profile) {
  // A fresh Companion-on-this-page click is a new report; see fa_setup.js.
  ynOverlayClearDismissal();
  // 1. Real challenge / login wall = HARD STOP, exactly as the job path.
  const challenged =
    typeof ynChallengePage === "function"
      ? ynChallengePage()
      : typeof ynBlocked === "function" && ynBlocked();
  if (challenged) {
    ynOverlay([
      "YoungNug stopped: this page shows a challenge/login.",
      "Finish manually. Nothing was bypassed.",
    ]);
    return {
      ok: false,
      generic: true,
      error: "captcha_stop",
      ats: { id: "unknown", name: "an unknown system" },
      report: ynEmptyReport(),
    };
  }
  const passiveCaptchaBefore =
    typeof ynPassiveCaptchaPresent === "function" && ynPassiveCaptchaPresent();

  if (!profile || typeof profile !== "object") {
    return {
      ok: false,
      generic: true,
      error: "no_profile",
      ats: null,
      report: ynEmptyReport(),
    };
  }

  // 2. Detect. An unknown system is the EXPECTED answer here, not a failure.
  const ats =
    typeof ynDetectAts === "function"
      ? ynDetectAts(document, location.href)
      : { id: "unknown", name: "an unknown system", confidence: "unknown" };

  // 2b. THE ADAPTER WINS. If this page happens to be a system we have an
  // adapter for, the adapter plans it and the generic rung is only the
  // fallback underneath — identical to the job path's precedence.
  const adapters = typeof YN_ADAPTERS !== "undefined" ? YN_ADAPTERS : [];
  const adapter = adapters.find((a) => a && a.id === ats.id) || null;

  // 2c. Login wall — never fill behind one, never click the apply button.
  const atWall =
    !!(ats && ats.assistOnly) ||
    !!(
      adapter &&
      typeof adapter.loginWall === "function" &&
      adapter.loginWall(document)
    );
  if (atWall) {
    ynAssistOnlyHandoff(ats);
    return {
      ok: true,
      generic: true,
      ats,
      report: ynEmptyReport(),
      displayLine: ynAtsDisplayLine(ats, true),
      status: "login_required",
      login_wall_handoff: true,
    };
  }

  // 3. allFrames injection: a frame with no form has nothing to say.
  const fillable =
    typeof ynQueryDeep === "function"
      ? ynQueryDeep(document, "input, textarea, select")
      : [...document.querySelectorAll("input, textarea, select")];
  const hasForm = fillable.some((el) => {
    const t = (el.type || "").toLowerCase();
    return !["hidden", "submit", "button", "image", "reset"].includes(t);
  });
  if (!hasForm) {
    return {
      ok: true,
      generic: true,
      skipped_frame: true,
      ats,
      report: ynEmptyReport(),
      displayLine: ynAtsDisplayLine(ats),
    };
  }

  // 4. Plan — the SAME ladder the job path runs. The field-map cache is
  // keyed on the page's own host here (there is no employer to key on) so a
  // second visit to the same site replays what worked.
  const host = (location.hostname || "").toLowerCase();
  const planned = await ynPlanRungs(profile, ats, adapter, {
    employer: host,
    executedKeys: new Set(),
  });
  const { sensitiveIntents, needsYouIntents, generatedIntents, baseIntents } =
    ynSplitIntents(planned.intents);

  // 5. Free-text archetypes ("why do you want this role") have no job to be
  // grounded in on an arbitrary page, so they are handed straight back to
  // the student rather than generated. Never invent an answer.
  const needsYou = [
    ...needsYouIntents,
    ...generatedIntents,
  ].map((i) => ({
    fieldKey: i.fieldKey,
    label: i.questionLabel || i.label || i.fieldKey,
  }));

  // 5b. Review gate — same seam, same screen, as the approved-job
  // path. This rung never generates a draft (see step 5), so it only ever
  // has guessed fields to list.
  const exactIntents = baseIntents.filter((i) => i && i.confidence === "exact");
  const guessedIntents = baseIntents.filter((i) => i && i.confidence !== "exact");
  const gate = await ynReviewGate(exactIntents, guessedIntents, [], new Map(), ats);

  // 6. Execute. Every write-time floor in the engine applies unchanged.
  let report = ynEmptyReport();
  try {
    if (typeof ynExecuteIntents === "function") {
      report = await ynExecuteIntents(gate.executeIntents, { plan: profile, ats });
    } else {
      report.errors.push({
        fieldKey: "engine",
        label: "ynExecuteIntents missing: engine.js not loaded?",
      });
    }
  } catch (e) {
    report.errors.push({
      fieldKey: "execute",
      label: String(e && e.message ? e.message : e),
    });
  }
  report = ynMergeReport(ynEmptyReport(), report);
  report.errors.push(...planned.errors, ...gate.errors);
  report.cancelled = !!gate.cancelled;
  report.skipped_sensitive = sensitiveIntents.map((i) =>
    ynReportEntry(i, i.el ? "" : i.label || "Sensitive field"),
  );
  report.needs_you = needsYou;
  report.skipped_password = ynCredentialSkips(document);

  // Remember what worked on this host, keyed the same way the job path keys
  // it on an employer. Without this the cache read above would be a read of
  // something nothing ever writes, and the second visit to the same portal
  // would re-derive every field from scratch.
  try {
    await ynCacheHeuristicWins(host, ats.id, planned.intents, report);
  } catch {
    /* the cache is an optimisation — never let it fail a fill */
  }

  await (typeof ynJitter === "function" ? ynJitter(400) : Promise.resolve());

  const notAttempted = ynCountNotAttempted(document, planned.claimedEls);

  // 7. Post-fill challenge check — a challenge that appeared while we typed.
  const challengedAfter =
    typeof ynChallengePage === "function"
      ? ynChallengePage()
      : typeof ynBlocked === "function" && ynBlocked();
  if (challengedAfter) {
    ynOverlay([
      "YoungNug stopped after filling: challenge appeared.",
      "Review + submit manually.",
    ]);
    return {
      ok: true,
      generic: true,
      captcha_stop: true,
      ats,
      report,
      notAttempted,
    };
  }

  const passiveCaptcha =
    passiveCaptchaBefore ||
    (typeof ynPassiveCaptchaPresent === "function" &&
      ynPassiveCaptchaPresent());

  // 8. An account-creation wall gets the assist panel, not a "Filled 0 of N"
  // that reads like a failure. The panel never types a password: assist.js
  // does that only inside its own isTrusted click closure.
  const onAccountWall =
    typeof ynPageIsAccountCreation === "function" &&
    ynPageIsAccountCreation(document);
  if (
    onAccountWall &&
    typeof ynWallAssistPanel === "function" &&
    typeof ynWallAssistState === "function"
  ) {
    try {
      ynWallAssistPanel(ynWallAssistState(document));
    } catch {
      ynOverlayReport(ats, report, notAttempted, {});
    }
  } else {
    ynOverlayReport(ats, report, notAttempted, { passiveCaptcha });
  }

  return {
    ok: true,
    generic: true,
    ats,
    report,
    displayLine: ynGenericDisplayLine(ats),
    notAttempted,
    captcha_widget: passiveCaptcha || undefined,
    account_wall_assist: onAccountWall || undefined,
  };
}

/** The one line the popup shows for a generic fill. Says plainly that this
 * is not one of the student's jobs, so a wrong-page fill is obvious. */
export function ynGenericDisplayLine(ats) {
  if (!ats || ats.id === "unknown") {
    return "Filled from your profile. Not one of your saved jobs.";
  }
  return `Filled a ${ats.name} form from your profile.`;
}
