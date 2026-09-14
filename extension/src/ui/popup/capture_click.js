// popup.js — the Capture button: reads the active tab (click-time injected,
// activeTab-gated), saves what it found, and tells the worker what THIS
// popup knows so a read-stage failure is never invisible.
import { el, activeTab } from "./status.js";
import { YN_DEV_RULES_KEY } from "./dev_selectors.js";

/** Own-rule `site##selector` capture rules, in the SAME {pattern,
 * titleSelector, bodySelector} shape the existing dev-selector feature
 * already reads (ynDevSelectorJob) — own rules are read here, alongside
 * the dev rules, and passed in FIRST so a site with both an own rule and
 * an old dev rule uses the own rule (ynDevSelectorJob returns on the
 * first match). Never blocks capture on a parse problem: an unreadable
 * or absent ownRules value degrades to "no extra rules", the same as an
 * absent dev-rules value always has. */
async function ynOwnRuleCaptureRulesFromStorage() {
  try {
    const got = await chrome.storage.local.get({ [YN_OWN_RULES_KEY]: "" });
    const text = got[YN_OWN_RULES_KEY] || "";
    if (!text || typeof ynParseOwnRules !== "function") return [];
    const { rules } = ynParseOwnRules(text);
    return typeof ynOwnRuleCaptureRules === "function"
      ? ynOwnRuleCaptureRules(rules)
      : [];
  } catch {
    return [];
  }
}

/** Tell the worker what THIS popup knows and the worker cannot see: a batch
 * summary, or a read-stage failure that never produced a POST — exactly the
 * class of failure the capture-chain diagnosis could not reconstruct. The worker
 * stores it durably (lastCapture) and relays it to app tabs. Fire-and-forget:
 * a sleeping worker never blocks the capture flow itself. */
function announceCapture(detail) {
  try {
    chrome.runtime
      .sendMessage({ type: "CAPTURE_ANNOUNCE", ...detail })
      .catch(() => {});
  } catch {
    /* worker unreachable — the popup line still showed the outcome */
  }
}

function ynHostOfTab(tab) {
  try {
    return new URL(tab?.url || "").hostname;
  } catch {
    return "";
  }
}

// Capture is injected ON THE CLICK, not shipped on every page. activeTab
// grants this one tab for this one gesture; content/capture.js only
// declares functions, so re-injecting on a second click is harmless.
el("capture").addEventListener("click", async () => {
  const status = el("status");
  const tab = await activeTab();
  const host = ynHostOfTab(tab);
  status.textContent = "Reading this page…";
  let read;
  try {
    await ynInjectOnce(tab.id, YN_CAPTURE_FILES, "ynCaptureCurrent");
    // Glassdoor sentiment reading is click-time now (the passive reader was
    // removed from the manifest when this moved to activeTab). On a
    // Glassdoor tab the same Capture click also runs the sentiment reader —
    // its own caps/captcha guards apply, and a failure must never break the
    // capture itself.
    if (/https:\/\/[^/]*glassdoor\.(com|co\.uk)\//.test(tab.url || "")) {
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          files: ["content/glassdoor.js"],
        })
        .catch(() => {});
    }
    // The student's per-site selector rules ride into the injected read as
    // an ARGUMENT: capture.js stays storage-free, and the read is still one
    // synchronous call in the page. Own rules come first in the list —
    // ynDevSelectorJob returns on the first site match, so an own rule wins
    // over an old dev rule for the same site.
    const devGot = await chrome.storage.local.get(YN_DEV_RULES_KEY);
    const ownCaptureRules = await ynOwnRuleCaptureRulesFromStorage();
    const combinedRules = [...ownCaptureRules, ...(devGot[YN_DEV_RULES_KEY] || [])];
    [read] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (rules) => ynCaptureCurrent(rules),
      args: [combinedRules],
    });
  } catch (e) {
    // chrome:// pages, the Web Store, PDFs, other extensions: Chrome refuses
    // the injection and throws. Checking tab.url up front does NOT catch these
    // — without the broad "tabs" permission the popup only sees the url of a
    // tab it can already touch, so the check silently passes on exactly the
    // pages it was meant to stop. Handle the refusal where it actually
    // surfaces, and say what happened instead of leaking a raw internal error.
    console.warn("[YoungNug] capture injection refused:", e);
    // 32 words, over the 25-word budget. Trimmed to the same three
    // facts: what refused it, which pages, what to do instead.
    status.textContent =
      "Capture failed: Chrome blocks extensions on its own pages, the Web " +
      "Store and PDF files. Open the advert in a normal tab and try again.";
    announceCapture({
      ok: false,
      host,
      error: "Chrome will not let extensions read this page",
    });
    return;
  }
  const r = read?.result;
  if (!r?.ok) {
    status.textContent = `Capture failed: ${r?.error || "could not read this page"}`;
    announceCapture({
      ok: false,
      host,
      error: r?.error || "could not read this page",
    });
    return;
  }
  if (Array.isArray(r.jobs)) {
    // A recognised results page: the reader returned the cards already on
    // screen (it never scrolls, paginates or fetches the linked adverts).
    // Each goes through the SAME CAPTURE_JOB path one at a time, jittered
    // like every other repeated call, and the server's {duplicate} answers
    // add up to an honest count. Keep the popup open while it runs.
    let saved = 0;
    let dupes = 0;
    let failed = 0;
    for (let i = 0; i < r.jobs.length; i++) {
      status.textContent = `Saving job ${i + 1} of ${r.jobs.length}…`;
      if (i) await ynJitter();
      const res = await chrome.runtime
        .sendMessage({ type: "CAPTURE_JOB", job: r.jobs[i] })
        .catch(() => null);
      if (!res?.ok) failed += 1;
      else if (res.duplicate) dupes += 1;
      else saved += 1;
    }
    status.textContent =
      `Saved ${saved} job cards, ${dupes} already in your list` +
      (failed ? `, ${failed} failed` : "") +
      ". Review them in YoungNug.";
    announceCapture({ ok: true, mode: "serp", host, saved, dupes, failed });
    return;
  }
  const saved = await chrome.runtime.sendMessage({
    type: "CAPTURE_JOB",
    job: r.job,
  });
  // The worker already recorded this attempt (success or failure) — the
  // popup's job is to say which of the three things actually happened.
  status.textContent = saved?.ok
    ? saved.enriched
      ? "Saved this advert. Your saved copy now carries the full advert."
      : saved.duplicate
        ? "This advert is already in your list."
        : "Saved this advert. Review it in YoungNug."
    : `Capture failed: ${saved?.error || "no response"}`;
});

// The popup no longer re-shows the last capture on open: the default
// surface dropped the capture-history line (who you are, what this does
// here, and the primary actions is the budget now). The record itself is
// unaffected — background.js still writes every attempt to the durable
// `lastCapture` key and broadcasts it to app tabs as `YN_CAPTURE_STATUS`
// (see MESSAGE_CONTRACT.md); the site's own Applications page is where a
// student checks what was captured, including a failure that never reached
// the server.

export { announceCapture, ynHostOfTab };
