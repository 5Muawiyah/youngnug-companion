// background.js — the apply message group: GET_FILL_PLAN (the Approve gate
// itself), GET_GENERIC_PROFILE (the any-page fallback's input),
// APPLY_RESULT, CONFIRM_APPLIED (the applied-tracking answer). See
// dispatch.js for how handle() tries each message group in turn.
import { ynProfileFillShape } from "./profile_fill_shape.js";

async function ynHandleApplyMessages(msg, sender) {
  switch (msg.type) {
    case "GET_FILL_PLAN": {
      // 404 = the user has not Approved this job — that is THE gate.
      const r = await ynApi(`/api/apply/fill-plan/${msg.jobId}`);
      return { ok: true, ...(await r.json()) };
    }
    case "GET_GENERIC_PROFILE": {
      // The generic any-page filler's input. Reads the profile the student
      // already owns (the same authed GET the answer-bank save makes) and
      // reshapes it locally — no new backend surface, and the Approve gate
      // on GET_FILL_PLAN above is untouched, because this path never touches
      // an application. ynApi throws while the kill switch is on, before any
      // fetch, so a stopped Companion cannot even read the profile.
      const prof = await (await ynApi("/api/profile")).json();
      return {
        ok: true,
        profile: ynProfileFillShape((prof && prof.sections) || {}),
      };
    }
    case "APPLY_RESULT": {
      // "submitted" may ONLY originate from the popup — the user's own
      // click on "I submitted it". A content script runs inside a web page
      // and carries sender.tab; the popup does not. Any page-side path that
      // tried to claim a submission is refused here, whatever the page did.
      if (msg.status === "submitted" && sender && sender.tab) {
        return { ok: false, reason: "only the user can report a submission" };
      }
      const r = await ynApi("/api/apply/result", {
        method: "POST",
        body: JSON.stringify({
          jobId: msg.jobId,
          status: msg.status,
          evidence: msg.evidence || "",
          // Coverage metric (engine.js's ynCoverage) — the fill-success
          // number, carried through so it lands on the tracker row.
          // Undefined on any sender that predates this and on the
          // never-computed hard-stop-before-fill paths; the server treats
          // an absent field as "not reported", never as zero.
          causes: msg.causes || null,
          coverage: msg.coverage || null,
        }),
      });
      if (msg.status === "filled") {
        // Remember the fill so the popup can ask "did you submit?" next
        // time it opens — the answer, not any page observation, is the
        // applied-tracking signal.
        // this used to also fire a desktop toast through the browser's
        // notifications API, guarded behind a check for that API's presence
        // because the manifest never requests the permission it needs — so
        // the guard always failed and the toast never fired. Dead code,
        // deleted; no permission added. The popup's own "did you
        // submit it?" strip (pendingConfirm above) is the real surface.
        await chrome.storage.local.set({
          pendingConfirm: { jobId: msg.jobId, ts: Date.now() },
        });
      }
      return { ok: true, ...(await r.json()) };
    }
    case "CONFIRM_APPLIED": {
      // The user answered the popup's question. Yes -> the server moves the
      // tracker to Applied and stamps submitted_at; either answer clears
      // the pending question.
      if (sender && sender.tab) {
        return { ok: false, reason: "only the user can report a submission" };
      }
      let out = { ok: true };
      if (msg.applied) {
        const r = await ynApi("/api/apply/result", {
          method: "POST",
          body: JSON.stringify({
            jobId: msg.jobId,
            status: "submitted",
            evidence: "confirmed by the user in the extension popup",
          }),
        });
        out = { ok: true, ...(await r.json()) };
      }
      await chrome.storage.local.remove(["pendingConfirm", "confirmAsked"]);
      return out;
    }
    default:
      return undefined;
  }
}

export { ynHandleApplyMessages };
