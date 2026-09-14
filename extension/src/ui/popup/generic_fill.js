// popup.js — the GENERIC filler: any page, not only a matched YoungNug job.
import { connectionHint } from "./status.js";
import { ynPickFrameResult } from "./match_and_confirm.js";
import { YN_FILL_SCRIPTS, ynRenderFillReport } from "./fill_report.js";

/**
 * GENERIC FILL — this page is not one of the student's jobs.
 *
 * The Companion used to stop here with "No YoungNug job matches this page",
 * which is true and useless: a student filling a bursary form, a volunteering
 * application or an employer's own careers form got nothing. This runs the
 * same safety ladder against the profile instead. It never asks for a fill
 * plan, so the Approve gate is neither used nor weakened.
 */
async function ynGenericFill(tab, status, opts) {
  const keepStatus = !!(opts && opts.keepStatus);
  const prefix = keepStatus ? String(status.textContent || "") + " " : "";
  status.textContent = "Reading your profile…";
  let prof;
  try {
    prof = await chrome.runtime.sendMessage({ type: "GET_GENERIC_PROFILE" });
  } catch (e) {
    status.textContent = `Could not reach the extension's worker (${String(
      e?.message || e,
    ).slice(0, 80)}).`;
    return;
  }
  if (!prof?.ok || !prof.profile) {
    status.textContent = connectionHint(prof);
    return;
  }
  try {
    await ynInjectOnce(tab.id, YN_FILL_SCRIPTS, "ynFillApplication", true);
  } catch (e) {
    console.warn("[YoungNug] generic fill injection refused:", e);
    status.textContent =
      "Fill failed: Chrome will not let extensions script this page.";
    return;
  }
  status.textContent = "Check the page and Approve to fill.";
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: async (profile) => {
        if (typeof ynFillAnyPage !== "function") return null;
        return ynFillAnyPage(profile);
      },
      args: [prof.profile],
    });
  } catch (e) {
    console.warn("[YoungNug] generic fill execute refused:", e);
    status.textContent = "Fill failed. Open the form and try again.";
    return;
  }
  const r = ynPickFrameResult(results);
  if (!r) {
    status.textContent = "No form found on this page.";
    return;
  }
  if (!r.ok) {
    status.textContent =
      r.error === "captcha_stop"
        ? "Stopped: captcha or login wall on the page."
        : r.error === "no_profile"
          ? "Your profile is empty. Fill it in on YoungNug first."
          : `Fill failed: ${r.error || "no response"}`;
    if (r.report) ynRenderFillReport(r);
    return;
  }
  status.textContent =
    prefix +
    ((r.report && r.report.cancelled)
      ? "Cancelled: nothing was filled."
      : r.displayLine || "Fill finished.");
  ynRenderFillReport(r);
  // Deliberately NO "did you submit it?" strip: there is no application to
  // record against, and asking would invite a tracker row for a form that is
  // not a job.
}

export { ynGenericFill };
