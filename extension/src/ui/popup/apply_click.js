// popup.js — the Apply button: match the open tab to an approved job (or
// fall back to the generic filler), inject the click-time fill stack, run
// it in every frame, and report.
import { el, activeTab, connectionHint } from "./status.js";
import { ynMatchJobToTab, ynMatchJobByIndeedKey, ynPickFrameResult, ynRenderConfirmStrip } from "./match_and_confirm.js";
import { ynGenericFill } from "./generic_fill.js";
import { YN_FILL_SCRIPTS, ynRenderFillReport } from "./fill_report.js";

el("apply").addEventListener("click", async () => {
  const status = el("status");
  const reportBox = el("fill-report");
  if (reportBox) {
    reportBox.hidden = true;
    reportBox.textContent = "";
  }
  status.textContent = "Matching this page to your YoungNug jobs…";
  const tab = await activeTab();
  if (!tab?.id) {
    status.textContent = "No active tab.";
    return;
  }
  const jobs = await chrome.runtime.sendMessage({ type: "LIST_JOBS" });
  if (!jobs?.ok) {
    // Say what actually failed — a rotated token, a server error and a dead
    // network are different problems; "open the app" was wrong advice for
    // two of the three and made the failure look permanent.
    status.textContent = connectionHint(jobs);
    return;
  }
  let match = ynMatchJobToTab(tab.url || "", jobs.jobs || []);
  if (!match && /^https:\/\/smartapply\.indeed\.com\//i.test(tab.url || "")) {
    // Indeed Apply runs on its own origin and its URL carries no job key;
    // the key is in the page. activeTab lets this one read happen on the
    // click (a read of the page text for the key, nothing else).
    try {
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const m = (document.documentElement.innerHTML || "").match(
            /[?&](?:jk|vjk)=([0-9a-f]{16})/i,
          );
          return m ? m[1] : "";
        },
      });
      if (result) match = ynMatchJobByIndeedKey(result, jobs.jobs || []);
    } catch (e) {
      console.warn("[YoungNug] could not read the Indeed job key:", e);
    }
  }
  if (!match) {
    // Not one of the student's jobs — and that used to be the end of it.
    // The Companion now falls back to the GENERIC filler: the profile, this
    // page, and whatever can be answered honestly. The Approve gate is
    // untouched; it gates the fill PLAN (CV, letter, tailored answers), and
    // this path never asks for one.
    await ynGenericFill(tab, status);
    return;
  }

  // Inject the fill stack. This is the only way the FILL reaches a page --
  // there are no static ATS content scripts, so nothing below runs until
  // Chrome grants activeTab on this click. (It is not the extension's only
  // executeScript call; capture, the generic filler, the resolver, posting
  // and undo have their own, and every one of them is behind the same grant
  // for the same reason. What holds that is the manifest, not this comment:
  // tests/test_companion_sites_generated.py fails if the manifest ever names
  // a covered job site in host_permissions or a content script.)
  // allFrames covers same-origin frames; a cross-origin embedded board is
  // outside the activeTab grant and reports as unreachable rather than
  // silently failing.
  try {
    await ynInjectOnce(tab.id, YN_FILL_SCRIPTS, "ynFillApplication", true);
  } catch (e) {
    console.warn("[YoungNug] fill injection refused:", e);
    status.textContent =
      "Fill failed: Chrome will not let extensions script this page.";
    return;
  }

  // guessed fields and drafted answers now wait behind the on-page
  // review screen (content/review_screen.js) — this status line used to say
  // "Filling fields…", which read as already done while the student still
  // had a screen to look at and approve.
  status.textContent = "Check the page and Approve to fill.";
  // Run in every frame: ATS boards are often iframe-embedded on employer
  // careers pages; tabs.sendMessage only hits the top frame.
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: async (jobId) => {
        if (typeof ynFillApplication !== "function") return null;
        return ynFillApplication(jobId);
      },
      args: [match.id],
    });
  } catch (e) {
    console.warn("[YoungNug] fill execute refused:", e);
    status.textContent =
      "Fill failed. Open the application form, Approve the job, try again.";
    return;
  }
  const r = ynPickFrameResult(results);
  if (!r) {
    status.textContent =
      "Fill failed. Open the application form, Approve the job, try again.";
    return;
  }
  if (!r.ok) {
    if (r.error === "no_fill_plan") {
      // A matched job with no tailored plan (not yet Approved, or its
      // documents blocked by a quality gate) used to end here with nothing
      // filled, while an UNMATCHED job fell through to the generic profile
      // fill. The two paths now agree: the profile fill runs and the line
      // says why the tailored plan is missing (observed on real forms:
      // Workable stopped while Ashby filled, for the same student).
      status.textContent = "No tailored plan yet (Approve the job, or fix its documents in Studio). Filling from your profile.";
      await ynGenericFill(tab, status, { keepStatus: true });
      return;
    }
    status.textContent =
      r.error === "captcha_stop"
        ? "Stopped: captcha or login wall on the page."
        : `Fill failed: ${r.error || "no response"}`;
    if (r.report) ynRenderFillReport(r);
    return;
  }
  status.textContent = (r.report && r.report.cancelled)
    ? "Cancelled: nothing was filled."
    : r.displayLine || "Fill finished.";
  ynRenderFillReport(r);
  ynRenderConfirmStrip(match.id);
});
