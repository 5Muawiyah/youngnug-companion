// content/filler.js, part 10 of 11 — ynFillApplication, phase 4 of 4: cache
// persistence for a heuristic win, the multi-step wizard-step read and
// fillstate save, the accurate not-attempted count and coverage metric,
// the post-fill challenge hard stop, and the final report — always
// "filled", never a submit status, with the cancelled-and-nothing-written
// short circuit and the account-creation-wall assist panel. Reads
// employer/ats/allIntents/report/adapter/prior/executedKeys/origin/
// claimedEls/passiveCaptchaBefore off the shared state object S; its
// return value is what ynFillApplication itself returns. See index.js for
// the file's full history.
import { ynAtsDisplayLine, ynCountNotAttempted } from "./overlay_lines.js";
import { ynOverlayReport } from "./overlay_report.js";
import { ynEvidenceString, ynWizardStepInfo } from "./plan_rungs.js";
import { ynSaveFillState, ynOverlay } from "./report_state.js";
import { ynCacheHeuristicWins, ynSendWorker } from "./worker_cache.js";

export async function ynFillApplicationFinish(jobId, S) {
  const {
    employer,
    ats,
    allIntents,
    report,
    adapter,
    prior,
    executedKeys,
    origin,
    claimedEls,
    passiveCaptchaBefore,
  } = S;
  // 8. Persist successful heuristic resolutions; drop cache entries that failed
  try {
    await ynCacheHeuristicWins(employer, ats.id, allIntents, report);
    const failedKeys = new Set(
      (report.unresolved || []).map((e) => e.fieldKey).filter(Boolean),
    );
    const cacheFailed = allIntents.filter(
      (i) => i.source === "cache" && failedKeys.has(i.fieldKey),
    );
    if (cacheFailed.length) {
      const existing = await ynSendWorker({
        type: "FIELD_MAP_CACHE_GET",
        employer,
        ats: ats.id,
      });
      if (existing?.entry?.fields) {
        const next = { ...existing.entry.fields };
        for (const i of cacheFailed) delete next[i.fieldKey];
        await ynSendWorker({
          type: "FIELD_MAP_CACHE_SET",
          employer,
          ats: ats.id,
          fields: next,
        });
      }
    }
  } catch (e) {
    report.errors.push({
      fieldKey: "cache_set",
      label: String(e && e.message ? e.message : e),
    });
  }

  // 9. Multi-step: detect remaining steps via wizard.advance (NO auto-click).
  // Human-paced: fill this step, highlight, tell the user to click Next
  // themselves. fillstate resume re-fills when the next step renders.
  const wizardInfo = ynWizardStepInfo(adapter, document);
  const stepKey =
    wizardInfo.stepKey ||
    (prior && prior.stepKey) ||
    (adapter && adapter.wizard ? "step" : "");

  // 9b. Multi-step state (resume scaffold — executed keys survive re-trigger)
  const newExecuted = [
    ...executedKeys,
    ...(report.filled || []).map((e) => e.fieldKey),
    ...(report.guessed || []).map((e) => e.fieldKey),
  ];
  try {
    await ynSaveFillState({
      jobId,
      ats: ats.id,
      origin,
      stepKey: stepKey || undefined,
      moreSteps: wizardInfo.moreSteps || undefined,
      executedFieldKeys: [...new Set(newExecuted.filter(Boolean))],
      report,
    });
  } catch {
    /* storage full / private mode — non-fatal */
  }

  await (typeof ynJitter === "function" ? ynJitter(400) : Promise.resolve());

  // Accurate N-of-M: fillable page fields we never claimed
  const notAttempted = ynCountNotAttempted(document, claimedEls);

  // Coverage (engine.js's ynCoverage): the same walker the dev lister uses
  // (tools/list_unclaimed_fields.js), scoped here to allIntents — every
  // intent ANY rung produced this fill, claimed or skipped alike — so
  // not_recognised counts only controls no rung ever saw at all.
  const ynAttachCoverage = () => {
    report.unclaimed_controls =
      typeof ynListUnclaimedFields === "function"
        ? ynListUnclaimedFields(allIntents).filter(
            (f) => f && f.visible && !f.disabled,
          ).length
        : notAttempted;
    if (typeof ynCoverage === "function") {
      Object.assign(report, ynCoverage(report));
    }
  };

  // 10. Post-fill challenge check (a challenge page, not a passive widget)
  if (typeof ynChallengePage === "function" && ynChallengePage()) {
    ynAttachCoverage();
    await ynSendWorker({
      type: "APPLY_RESULT",
      jobId,
      status: "captcha_stop",
      evidence: "challenge after fill; " + ynEvidenceString(ats, report),
      causes: report.causes,
      coverage: report.coverage,
    });
    ynOverlay([
      "YoungNug stopped after filling: challenge appeared.",
      "Review + submit manually.",
    ]);
    return {
      ok: true,
      captcha_stop: true,
      ats,
      report,
      evidence: ynEvidenceString(ats, report),
      notAttempted,
    };
  }
  if (
    typeof ynChallengePage !== "function" &&
    typeof ynBlocked === "function" &&
    ynBlocked()
  ) {
    ynAttachCoverage();
    await ynSendWorker({
      type: "APPLY_RESULT",
      jobId,
      status: "captcha_stop",
      evidence: "challenge after fill; " + ynEvidenceString(ats, report),
      causes: report.causes,
      coverage: report.coverage,
    });
    ynOverlay([
      "YoungNug stopped after filling: challenge appeared.",
      "Review + submit manually.",
    ]);
    return {
      ok: true,
      captcha_stop: true,
      ats,
      report,
      evidence: ynEvidenceString(ats, report),
      notAttempted,
    };
  }

  const passiveCaptchaAfter =
    typeof ynPassiveCaptchaPresent === "function" && ynPassiveCaptchaPresent();
  const passiveCaptcha = passiveCaptchaBefore || passiveCaptchaAfter;
  const evidenceExtra = passiveCaptcha ? { captcha_widget: true } : null;

  // 11. Report outcome — ALWAYS "filled"; never a submit status.
  // A review the student cancelled with nothing written is not a fill:
  // reporting it as one moved the tracker row to filled_pending_submit and
  // the popup then asked "did you send it?" about a form nobody touched
  // (observed on a real form). Nothing happened, so nothing is reported;
  // the overlay says so and the plan stays where it was.
  const nothingWritten =
    !(report.filled || []).length && !(report.guessed || []).length;
  if (report.cancelled && nothingWritten) {
    ynOverlay(["YoungNug: cancelled, nothing written."]);
    return { ok: true, cancelled: true, ats, report };
  }
  let evidence = ynEvidenceString(ats, report, evidenceExtra);
  if (wizardInfo.moreSteps) {
    evidence +=
      "; more_steps=true" +
      (stepKey ? "; step=" + String(stepKey).slice(0, 40) : "");
  }
  ynAttachCoverage();
  await ynSendWorker({
    type: "APPLY_RESULT",
    jobId,
    status: "filled",
    evidence,
    causes: report.causes,
    coverage: report.coverage,
  });

  // Account-creation wall → signup-assist panel instead of the
  // generic "Filled 0 of N" overlay. Engine already zeroed the fill plan;
  // the panel only HELPS the user (point+highlight, password on their click).
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
      ynOverlay([
        "YoungNug",
        "This site needs an account. Here is the fastest safe way:",
        "Finish signup using the site's own controls. Nothing was submitted.",
      ]);
    }
  } else {
    ynOverlayReport(ats, report, notAttempted, {
      passiveCaptcha,
      moreSteps: wizardInfo.moreSteps,
      stepKey: stepKey || undefined,
    });
  }

  return {
    ok: true,
    ats,
    report,
    evidence,
    displayLine: ynAtsDisplayLine(ats),
    notAttempted,
    captcha_widget: passiveCaptcha || undefined,
    moreSteps: wizardInfo.moreSteps || undefined,
    stepKey: stepKey || undefined,
    account_wall_assist: onAccountWall || undefined,
  };
}
