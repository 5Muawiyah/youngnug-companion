// background.js — the save/click-tracking message group: SAVE_ANSWERS (the
// confirmed profile-facts + answer-bank save), APPLY_CLICK (the single
// pending slot for the user's own apply click), ATS_PAGE_SEEN (the
// direct-link resolver's pairing decision). See dispatch.js for how
// handle() tries each message group in turn.
import { ynMergeSaveAnswers } from "./profile_fill_shape.js";
import { ynResolveDecision } from "./resolve.js";

async function ynHandleSaveMessages(msg, sender) {
  switch (msg.type) {
    case "SAVE_ANSWERS": {
      // The user CONFIRMED (popup confirm dialog) saving these answers.
      // Two destinations, never conflated: the 7 allowlisted FACT keys go
      // to the profile (unchanged, ADD-only PUT /api/profile/{section});
      // Free-text screening answers go to the per-student answer bank
      // (POST /api/answers), a student-typed row (source=user_typed,
      // approved immediately — the Save gesture itself IS the approval).
      const allItems = Array.isArray(msg.items) ? msg.items : [];
      const freeTextItems = allItems.filter((it) => it && it.freeText === true);
      const factItems = allItems.filter((it) => !it || it.freeText !== true);

      let sections = {};
      try {
        const prof = await (await ynApi("/api/profile")).json();
        sections = (prof && prof.sections) || {};
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
      const puts = ynMergeSaveAnswers(factItems, sections);

      // Each section is its own PUT, and ynApi THROWS on any non-2xx. Without
      // per-item handling a failure on the second section discarded the fact
      // that the first had already been committed, and the popup told the
      // user nothing was saved while half of it durably was.
      const saved = [];
      const failed = [];
      for (const p of puts) {
        try {
          await ynApi(`/api/profile/${p.section}`, {
            method: "PUT",
            body: JSON.stringify({ data: p.data }),
          });
          saved.push(...p.savedKeys);
        } catch (e) {
          failed.push({
            section: p.section,
            error: String(e && e.message ? e.message : e),
          });
        }
      }

      const savedBank = [];
      for (const item of freeTextItems) {
        const question = String((item && item.question) || "").trim();
        const text = String((item && item.value) || "").trim();
        if (!question || !text) continue;
        try {
          await ynApi("/api/answers", {
            method: "POST",
            body: JSON.stringify({
              question,
              control_type: item.controlType || "text",
              text,
            }),
          });
          savedBank.push(item.fieldKey || item.fingerprint || question);
        } catch (e) {
          failed.push({
            section: "answers_bank",
            error: String(e && e.message ? e.message : e),
          });
        }
      }

      if (!saved.length && !savedBank.length) {
        return {
          ok: false,
          error: failed.length ? failed[0].error : "nothing to save",
        };
      }
      return { ok: true, saved, savedBank, failed };
    }
    case "APPLY_CLICK": {
      // Single pending slot for the user's own apply click.
      // Last click wins. No navigation, no fetch of any job-board endpoint.
      const jobId = Number(msg.jobId);
      const url = typeof msg.url === "string" ? msg.url : "";
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return { ok: false, error: "bad jobId" };
      }
      if (!(url.startsWith("http://") || url.startsWith("https://"))) {
        return { ok: false, error: "bad url" };
      }
      // Record the APP tab that made this click (the relayed sender is the
      // app-origin content script). The ATS tab the click opens carries this
      // as its openerTabId, so ATS_PAGE_SEEN can require the lineage to match.
      const appTabId =
        sender && sender.tab && Number.isFinite(sender.tab.id)
          ? sender.tab.id
          : null;
      await chrome.storage.local.set({
        pending_resolve: { jobId, url, ts: Date.now(), appTabId },
      });
      return { ok: true };
    }
    case "ATS_PAGE_SEEN": {
      // Content script on an ATS host saw a load. Pair with
      // pending_resolve only when fresh + unambiguous; never invent a link.
      // The ATS tab's openerTabId (the tab that opened it) must match the app
      // tab that recorded the pending click — the two-tab guard.
      const openerTabId =
        sender && sender.tab ? sender.tab.openerTabId : undefined;
      const bag = await chrome.storage.local.get({ pending_resolve: null });
      const pending = bag.pending_resolve;
      const decision = ynResolveDecision(
        pending,
        msg.url,
        Date.now(),
        openerTabId,
      );
      if (decision.action === "drop") {
        await chrome.storage.local.remove("pending_resolve");
        return { ok: true, action: "drop" };
      }
      if (decision.action !== "post") {
        return { ok: true, action: "ignore" };
      }
      const resolvedKey = "resolved:" + decision.jobId;
      const cached = await chrome.storage.local.get({ [resolvedKey]: null });
      const prev = cached[resolvedKey];
      if (prev && prev.url === decision.url) {
        // same url already cached — skip the POST, clear pending
        await chrome.storage.local.remove("pending_resolve");
        return { ok: true, action: "dedupe" };
      }
      try {
        await ynApi("/api/jobs/" + decision.jobId + "/direct-link", {
          method: "POST",
          body: JSON.stringify({ url: decision.url }),
        });
        await chrome.storage.local.set({
          [resolvedKey]: { url: decision.url, savedAt: Date.now() },
        });
        await chrome.storage.local.remove("pending_resolve");
        return { ok: true, action: "post" };
      } catch (e) {
        const errStr = String(e);
        const m = /HTTP (\d+)/.exec(errStr);
        if (m) {
          const status = Number(m[1]);
          if (status >= 400 && status < 500) {
            // server rejected — do not retry
            await chrome.storage.local.remove("pending_resolve");
            return { ok: false, action: "rejected", error: errStr };
          }
        }
        // network / 5xx — keep pending, cache nothing
        return { ok: false, action: "retry", error: errStr };
      }
    }
    default:
      return undefined;
  }
}

export { ynHandleSaveMessages };
