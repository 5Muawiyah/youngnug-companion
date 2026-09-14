// popup.js — Employer: prepare an Indeed posting (fill and STOP before
// Post). Visible ONLY when the signed-in account is an employer AND the
// active tab is employers.indeed.com. The stack fills the posting wizard
// from the chosen approved listing and stops before the board's final
// button; the employer presses Post themselves. "posted" is recorded only
// through the confirmation strip below - the employer's own click, never a
// page signal.
import { el, activeTab, connectionHint } from "./status.js";
import { escapeHtml } from "./fill_report.js";

const YN_POSTING_SCRIPTS = [
  "common/api.js",
  "common/yn_theme.js",
  "common/challenge_detect.js",
  "common/label_quality.js",
  "common/overlay_box.js",
  "content/dom_fill_kit.js",
  "content/engine.js",
  "content/detect.js",
  "content/adapters/indeed_employer.js",
  "content/posting_filler.js",
];

function ynRenderPostingReport(result) {
  const box = el("posting-report");
  if (!box) return;
  if (!result) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  const report = result.report || {};
  const guessedN = (report.guessed || []).length;
  const done = (report.filled || []).length + guessedN;
  const parts = [];
  if (result.sponsorship_stop) {
    parts.push(
      `<p class="fill-ats">Stopped at the sponsorship budget step.</p>`,
      `<p>${escapeHtml(result.sponsorship_label || "A budget field")} needs your decision. Nothing was entered.</p>`,
    );
  } else {
    parts.push(
      `<p><strong>Filled ${done} field(s)</strong>` +
        (guessedN ? ` · ${guessedN} to check` : "") +
        `</p>`,
    );
    if (guessedN) {
      const labels = (report.guessed || [])
        .map((e) => ynReportFieldLabel(e))
        .filter(Boolean)
        .slice(0, 5);
      if (labels.length) {
        parts.push(
          `<p class="fill-check">Check these: ${escapeHtml(labels.join("; "))}</p>`,
        );
      }
    }
    if ((report.unresolved || []).length) {
      const labels = (report.unresolved || [])
        .map((e) => ynReportFieldLabel(e))
        .filter(Boolean)
        .slice(0, 5);
      if (labels.length) {
        parts.push(
          `<p class="fill-miss">I could not fill these: ${escapeHtml(labels.join("; "))}</p>`,
        );
      }
    }
    if ((report.skipped_payment || []).length) {
      parts.push(`<p class="muted">Payment fields are never filled.</p>`);
    }
    if ((report.skipped_terms || []).length) {
      parts.push(
        `<p class="muted">Terms boxes are left for you to read and tick.</p>`,
      );
    }
    if (result.descriptionLeft) {
      parts.push(
        `<p class="fill-check">The description editor is rich text. Paste the description from YoungNug yourself.</p>`,
      );
    }
  }
  parts.push(
    `<p class="fill-never">Nothing was posted - review and post it yourself.</p>`,
  );
  box.innerHTML = parts.join("");
  box.hidden = false;
}

// Posted-tracking mirror of ynRenderConfirmStrip: the ONLY signal a posting
// happened is the employer saying so here. Either answer clears the question.
function ynRenderPostConfirmStrip(listingId) {
  const box = el("confirm-posted");
  if (!box) return;
  box.innerHTML =
    `<p>Did you review and post this listing on Indeed yourself?</p>` +
    `<button id="posted-yes" class="primary">I posted it - record it</button>` +
    `<button id="posted-no" class="quiet">Not yet</button>`;
  box.hidden = false;
  el("posted-yes").addEventListener("click", async () => {
    const r = await chrome.runtime.sendMessage({
      type: "CONFIRM_POSTED",
      listingId,
      posted: true,
    });
    box.innerHTML = r?.ok
      ? `<p>Recorded against the listing.</p>`
      : `<p>Could not record it: ${escapeHtml(r?.reason || r?.error || "no response")}</p>`;
  });
  el("posted-no").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({
      type: "CONFIRM_POSTED",
      listingId,
      posted: false,
    });
    box.hidden = true;
  });
}

// A prepared posting from a previous popup session may still be unanswered -
// surface it while fresh enough to answer honestly (mirror pendingConfirm,
// same once-per-fill/dismissable fix: see match_and_confirm.js).
(async () => {
  try {
    const { pendingPostConfirm, postConfirmAsked } =
      await chrome.storage.local.get(["pendingPostConfirm", "postConfirmAsked"]);
    if (!pendingPostConfirm) return;
    const ageMs = Date.now() - (pendingPostConfirm.ts || 0);
    if (ageMs > 48 * 3600 * 1000) {
      await chrome.storage.local.remove("pendingPostConfirm");
      return;
    }
    const alreadyAsked =
      postConfirmAsked &&
      postConfirmAsked.listingId === pendingPostConfirm.listingId &&
      postConfirmAsked.ts === pendingPostConfirm.ts;
    if (alreadyAsked) return;
    await chrome.storage.local.set({
      postConfirmAsked: {
        listingId: pendingPostConfirm.listingId,
        ts: pendingPostConfirm.ts,
      },
    });
    ynRenderPostConfirmStrip(pendingPostConfirm.listingId);
  } catch {
    /* storage unavailable: nothing to surface */
  }
})();

async function setupIndeedPosting() {
  const card = el("posting-card");
  if (!card) return;
  const tab = await activeTab();
  if (!/^https:\/\/employers\.indeed\.com\//.test(tab?.url || "")) return;
  let status;
  try {
    status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  } catch {
    return;
  }
  if (!status?.ok || status.role !== "employer") return;

  const listings = await chrome.runtime.sendMessage({ type: "LIST_LISTINGS" });
  const pStatus = el("posting-status");
  card.hidden = false;
  if (!listings?.ok) {
    pStatus.textContent = connectionHint(listings);
    el("posting-prepare").disabled = true;
    return;
  }
  const approved = (listings.listings || []).filter(
    (l) => l && l.status === "approved",
  );
  const select = el("posting-listing");
  select.innerHTML = "";
  if (!approved.length) {
    pStatus.textContent =
      "No approved listings yet. A listing must pass moderation before it " +
      "can be posted to a board.";
    el("posting-prepare").disabled = true;
    return;
  }
  for (const l of approved) {
    const opt = document.createElement("option");
    opt.value = String(l.id);
    opt.textContent = `${l.role} (${l.company})`.slice(0, 80);
    select.appendChild(opt);
  }

  el("posting-prepare").addEventListener("click", async () => {
    const listingId = Number(select.value);
    if (!Number.isFinite(listingId) || listingId <= 0) {
      pStatus.textContent = "Pick a listing first.";
      return;
    }
    const reportBox = el("posting-report");
    if (reportBox) {
      reportBox.hidden = true;
      reportBox.textContent = "";
    }
    pStatus.textContent = "Filling the posting form from your listing…";
    try {
      await ynInjectOnce(tab.id, YN_POSTING_SCRIPTS, "ynPrepareIndeedPosting");
    } catch (e) {
      console.warn("[YoungNug] posting injection refused:", e);
      pStatus.textContent = "Chrome will not let extensions script this page.";
      return;
    }
    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (id) => {
          if (typeof ynPrepareIndeedPosting !== "function") return null;
          return ynPrepareIndeedPosting(id);
        },
        args: [listingId],
      });
    } catch (e) {
      console.warn("[YoungNug] posting execute refused:", e);
      pStatus.textContent = "Could not run on this page. Try again.";
      return;
    }
    const r = results && results[0] && results[0].result;
    if (!r) {
      pStatus.textContent = "Could not run on this page. Try again.";
      return;
    }
    if (!r.ok) {
      pStatus.textContent =
        r.error === "no_posting_plan"
          ? "No posting plan: is this listing yours and approved?"
          : r.error === "captcha_stop"
            ? "Stopped: challenge or login wall on the page."
            : r.error === "not_employer_surface"
              ? "This is not the Indeed employer posting page."
              : `Stopped: ${r.error || "no response"}`;
      return;
    }
    pStatus.textContent = r.sponsorship_stop
      ? "Stopped at the sponsorship budget step."
      : "Posting form prepared.";
    ynRenderPostingReport(r);
    if (!r.sponsorship_stop) ynRenderPostConfirmStrip(listingId);
  });
}

export { YN_POSTING_SCRIPTS, ynRenderPostingReport, ynRenderPostConfirmStrip, setupIndeedPosting };
