// background.js — the jobs/listings message group: LIST_JOBS (the popup's
// job matcher, merged with the tracker's own fill-able rows),
// LIST_LISTINGS (the employer's own submissions), GET_POSTING_PLAN,
// POSTING_RESULT, CONFIRM_POSTED (the employer posting-tracking answer).
// See dispatch.js for how handle() tries each message group in turn.
import { ynMergeFillableJobs } from "./fillable_jobs.js";

async function ynHandleJobsMessages(msg, sender) {
  switch (msg.type) {
    case "LIST_JOBS": {
      // The feed page alone is not enough: it is the newest 200 adverts, and
      // an approved job older than those never matched the open tab, so the
      // popup fell to the generic filler and the tracker never heard the
      // result. The tracker's
      // own fill-able rows are merged in, so every job a fill-plan would
      // serve is in the list the matcher reads.
      const r = await ynApi("/api/jobs?limit=200");
      const page = await r.json();
      let apps = [];
      try {
        const a = await ynApi("/api/applications");
        apps = ((await a.json()) || {}).applications || [];
      } catch (e) {
        console.warn("[YoungNug] tracker rows unavailable for matching:", e);
      }
      return { ok: true, ...page, jobs: ynMergeFillableJobs(page.jobs, apps) };
    }
    case "LIST_LISTINGS": {
      // Employer-side: the caller's own listing submissions (owner-scoped
      // server-side; the server checks the caller's role).
      const r = await ynApi("/api/employer/listings");
      return { ok: true, listings: await r.json() };
    }
    case "GET_POSTING_PLAN": {
      // 404 = not this employer's listing, or not approved — that is the
      // moderation gate speaking, reported honestly.
      const listingId = Number(msg.listingId);
      if (!Number.isFinite(listingId) || listingId <= 0) {
        return { ok: false, error: "bad listingId" };
      }
      const r = await ynApi(`/api/employer/listings/${listingId}/posting-plan`);
      return { ok: true, ...(await r.json()) };
    }
    case "POSTING_RESULT": {
      // The preparing flow may report prepared / sponsorship_stop / aborted.
      // "posted" is the employer's own claim and can NEVER travel this
      // message — page-side senders are refused outright (mirrors
      // APPLY_RESULT's refusal of "submitted"), and the API refuses it too.
      if (msg.status === "posted") {
        return { ok: false, reason: "only the employer can report a posting" };
      }
      const allowed = ["prepared", "sponsorship_stop", "aborted"];
      if (!allowed.includes(msg.status)) {
        return { ok: false, error: "bad status" };
      }
      const listingId = Number(msg.listingId);
      if (!Number.isFinite(listingId) || listingId <= 0) {
        return { ok: false, error: "bad listingId" };
      }
      const r = await ynApi(
        `/api/employer/listings/${listingId}/posting-event`,
        {
          method: "POST",
          body: JSON.stringify({
            status: msg.status,
            detail: String(msg.detail || "").slice(0, 2000),
          }),
        },
      );
      if (msg.status === "prepared") {
        // Remember the prepared posting so the popup can ask "did you post
        // it yourself?" next time it opens — the employer's answer, not any
        // page observation, is the only posted signal.
        await chrome.storage.local.set({
          pendingPostConfirm: { listingId, ts: Date.now() },
        });
      }
      return { ok: true, ...(await r.json()) };
    }
    case "CONFIRM_POSTED": {
      // The employer answered the popup's question. A content script runs
      // inside a web page and carries sender.tab; the popup does not. No
      // page-side path may record a posting, whatever the page did.
      if (sender && sender.tab) {
        return { ok: false, reason: "only the employer can report a posting" };
      }
      const listingId = Number(msg.listingId);
      if (!Number.isFinite(listingId) || listingId <= 0) {
        return { ok: false, error: "bad listingId" };
      }
      let out = { ok: true };
      if (msg.posted) {
        const r = await ynApi(
          `/api/employer/listings/${listingId}/posting-confirmed`,
          { method: "POST", body: "{}" },
        );
        out = { ok: true, ...(await r.json()) };
      }
      await chrome.storage.local.remove(["pendingPostConfirm", "postConfirmAsked"]);
      return out;
    }
    default:
      return undefined;
  }
}

export { ynHandleJobsMessages };
