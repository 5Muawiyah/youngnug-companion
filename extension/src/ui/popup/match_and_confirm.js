// popup.js — the applied-tracking confirm strip, matching the open tab to
// one of the student's approved jobs, and picking the frame worth reporting
// from a multi-frame fill result.
import { el } from "./status.js";
import { escapeHtml } from "./fill_report.js";

// Applied-tracking: after a fill, the ONLY signal that an application was
// actually sent is the user saying so. This strip asks; nothing on the page
// is watched, and either answer clears the question.
function ynRenderConfirmStrip(jobId) {
  const box = el("confirm-applied");
  if (!box) return;
  box.innerHTML =
    `<p>Did you review and send this application yourself?</p>` +
    `<button id="confirm-yes" class="primary">I sent it - record it</button>` +
    `<button id="confirm-no" class="quiet">Not yet</button>`;
  box.hidden = false;
  el("confirm-yes").addEventListener("click", async () => {
    const r = await chrome.runtime.sendMessage({
      type: "CONFIRM_APPLIED",
      jobId,
      applied: true,
    });
    box.innerHTML = r?.ok
      ? `<p>Recorded. The tracker shows it as Applied.</p>`
      : `<p>Could not record it: ${escapeHtml(r?.reason || "no response")}</p>`;
  });
  el("confirm-no").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({
      type: "CONFIRM_APPLIED",
      jobId,
      applied: false,
    });
    box.hidden = true;
  });
}

// A fill from a previous popup session may still be unanswered — surface it
// when the popup opens, and only while it is fresh enough to answer honestly.
//
// Asks ONCE per fill, dismissable: it used to reappear on every popup open
// until the student clicked one of the two buttons, which reads as nagging
// when they simply close the popup without answering.
// `confirmAsked` is a per-job marker keyed by the SAME {jobId, ts} pair
// pendingConfirm carries — a NEW fill for the same job writes a fresh ts,
// which will not match the old marker, so it asks again for that fill; the
// same fill's marker, once written, is never written again, so a second
// popup open shows nothing rather than the same question a second time.
(async () => {
  try {
    const { pendingConfirm, confirmAsked } = await chrome.storage.local.get([
      "pendingConfirm",
      "confirmAsked",
    ]);
    if (!pendingConfirm) return;
    const ageMs = Date.now() - (pendingConfirm.ts || 0);
    if (ageMs > 48 * 3600 * 1000) {
      await chrome.storage.local.remove("pendingConfirm");
      return;
    }
    const alreadyAsked =
      confirmAsked &&
      confirmAsked.jobId === pendingConfirm.jobId &&
      confirmAsked.ts === pendingConfirm.ts;
    if (alreadyAsked) return;
    await chrome.storage.local.set({
      confirmAsked: { jobId: pendingConfirm.jobId, ts: pendingConfirm.ts },
    });
    ynRenderConfirmStrip(pendingConfirm.jobId);
  } catch {
    /* storage unavailable: nothing to surface */
  }
})();

/** The Indeed job key in a stored job URL (viewjob?jk=, /jobs?...&vjk=). */
function ynIndeedKeyOf(url) {
  const m = String(url || "").match(/[?&](?:jk|vjk)=([0-9a-f]{16})/i);
  return m ? m[1].toLowerCase() : "";
}

function ynMatchJobByIndeedKey(key, jobs) {
  const want = String(key || "").toLowerCase();
  if (!want) return null;
  return jobs.find((j) => ynIndeedKeyOf(j.url) === want) || null;
}

/**
 * Match the open tab to one of the student's approved jobs. The stored URL
 * prefix is the first rule (unchanged). Three sites needed more, read from
 * their live pages: LinkedIn opens a job as /jobs/view/<id>/ OR as
 * /jobs/search/?currentJobId=<id>, Reed's apply modal sits on the listing
 * /jobs/<slug>/<id>, and Indeed's stored URL carries jk=/vjk= while the
 * apply wizard lives on smartapply.indeed.com (handled by the caller with a
 * page read). Never a fuzzy title match: a wrong job means a wrong letter.
 */
function ynMatchJobToTab(tabUrl, jobs) {
  const url = String(tabUrl || "");
  const page = url.split("?")[0];
  let match = jobs.find((j) => j.url && page.startsWith(j.url.split("?")[0]));
  if (match) return match;
  const li = url.match(/linkedin\.com\/jobs\/(?:view\/(\d+)|search\/?\?(?:.*&)?currentJobId=(\d+))/i);
  const liId = li && (li[1] || li[2]);
  if (liId) {
    match = jobs.find((j) => {
      const m = String(j.url || "").match(
        /linkedin\.com\/jobs\/(?:view\/(\d+)|search\/?\?(?:.*&)?currentJobId=(\d+))/i,
      );
      return m && (m[1] || m[2]) === liId;
    });
    if (match) return match;
  }
  const reed = url.match(/reed\.co\.uk\/jobs\/[^/?#]+\/(\d+)/i);
  if (reed) {
    match = jobs.find((j) => {
      const m = String(j.url || "").match(/reed\.co\.uk\/jobs\/[^/?#]+\/(\d+)/i);
      return m && m[1] === reed[1];
    });
    if (match) return match;
  }
  const jk = ynIndeedKeyOf(url);
  if (jk) return ynMatchJobByIndeedKey(jk, jobs);
  return null;
}

/** Pick the frame worth reporting: an ATS board is often iframe-embedded, so
 * several frames answer and most have nothing to say. Prefer the one that
 * actually wrote something, then any ok one, then the first. */
function ynPickFrameResult(results) {
  const frameResults = (results || [])
    .map((r) => r && r.result)
    .filter((r) => r && !r.skipped_frame);
  const scored = (r) => {
    if (!r) return -1;
    const rep = r.report || {};
    return (
      (rep.filled || []).length + (rep.guessed || []).length + (r.ok ? 0.5 : 0)
    );
  };
  frameResults.sort((a, b) => scored(b) - scored(a));
  return frameResults[0] || null;
}

export { ynRenderConfirmStrip, ynIndeedKeyOf, ynMatchJobByIndeedKey, ynMatchJobToTab, ynPickFrameResult };
