// background.js — the capture message group: CAPTURE_JOB (the popup/
// keyboard-shortcut capture POST), CAPTURE_ANNOUNCE (the popup's own
// read-stage report), INGEST_SENTIMENT (content/glassdoor.js's employer
// rating/quotes read), LIVENESS_CHECK (the live re-check).
//
// handle() (dispatch.js) tries each message group's own switch in turn;
// a group that does not own msg.type falls through its `default` to
// `undefined`, which tells handle() to try the next group. Every case body
// below is unchanged from the single-file version — only the switch it
// lives in is smaller, so the whole file stays under the 400-line cap.
import { ynCaptureHostOf, ynRecordLastCapture } from "./capture_record.js";

async function ynHandleCaptureMessages(msg, sender) {
  switch (msg.type) {
    case "CAPTURE_JOB": {
      const mode = msg.job.mode === "serp" ? "serp" : "jobview";
      const host = ynCaptureHostOf(msg.job);
      let r;
      try {
        r = await ynApi("/api/jobs/capture", {
          method: "POST",
          body: JSON.stringify({
            title: msg.job.title || "",
            employer: msg.job.employer || "",
            url: msg.job.url || "",
            source: msg.job.source || "extension-capture",
            description: msg.job.description || "",
            location: msg.job.location || "",
            mode,
          }),
        });
      } catch (e) {
        // The durable trace of the FAILED attempt — recorded before the
        // rethrow, so the popup keeps its loud line but the failure now
        // also survives the popup closing.
        await ynRecordLastCapture({
          ok: false,
          mode,
          host,
          error: String(e && e.message ? e.message : e),
        });
        throw e;
      }
      const data = await r.json();
      await ynRecordLastCapture({
        ok: true,
        mode,
        host,
        duplicate: data.duplicate === true,
        enriched: data.enriched === true,
      });
      return { ok: true, ...data };
    }
    case "CAPTURE_ANNOUNCE": {
      // The popup's own capture story: a batch summary after a results-page
      // run, or a READ-stage failure that never produced a POST (injection
      // refused, blocked page, nothing readable) — exactly the class of
      // failure that used to vanish. Popup only: a content script runs
      // inside a web page and carries sender.tab, so page-side senders are
      // refused (mirrors CONFIRM_APPLIED) and can never rewrite the record.
      if (sender && sender.tab) {
        return { ok: false, reason: "only the popup can announce a capture" };
      }
      const entry = await ynRecordLastCapture({
        ok: msg.ok === true,
        mode: msg.mode,
        host: msg.host,
        error: msg.error,
        saved: msg.saved,
        dupes: msg.dupes,
        failed: msg.failed,
      });
      return { ok: true, entry };
    }
    case "INGEST_SENTIMENT": {
      const rating = parseFloat(msg.sentiment?.rating);
      const r = await ynApi("/api/sentiment/ingest", {
        method: "POST",
        body: JSON.stringify({
          employer: msg.employer,
          sentiment: {
            source: msg.sentiment?.source || "glassdoor-extension",
            rating: Number.isFinite(rating) ? rating : null,
            summary: msg.sentiment?.summary || "",
            quotes: msg.sentiment?.quotes || [],
          },
        }),
      });
      return { ok: true, ...(await r.json()) };
    }
    case "LIVENESS_CHECK": {
      // content/liveness_check.js just read the page the
      // student is looking at, click-time injected (never a static
      // third-party content-script entry — see common/inject_once.js::
      // ynPingLiveness, called from popup-open and the Capture keyboard
      // shortcut) on one of the two allowlisted job-board hosts — never a
      // background crawl, never a second tab. What it read travels no
      // further than here until the URL is confirmed to be one of the
      // student's OWN saved adverts: an unmatched page's verdict/evidence is
      // simply dropped below, never posted anywhere.
      const url = typeof msg.url === "string" ? msg.url : "";
      if (!url) return { ok: false, error: "no url" };
      let matchResp;
      try {
        matchResp = await ynApi("/api/jobs/match-url", {
          method: "POST",
          body: JSON.stringify({ url }),
        });
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
      const matched = await matchResp.json();
      const jobId = Number(matched && matched.job_id);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return { ok: true, matched: false };
      }
      const verdict = ["live", "closed", "could_not_tell"].includes(msg.verdict)
        ? msg.verdict
        : "could_not_tell";
      try {
        const r = await ynApi(`/api/jobs/${jobId}/live-report`, {
          method: "POST",
          body: JSON.stringify({
            verdict,
            evidence: String(msg.evidence || "").slice(0, 300),
          }),
        });
        return { ok: true, matched: true, jobId, ...(await r.json()) };
      } catch (e) {
        return {
          ok: false,
          matched: true,
          jobId,
          error: String(e && e.message ? e.message : e),
        };
      }
    }
    default:
      return undefined;
  }
}

export { ynHandleCaptureMessages };
