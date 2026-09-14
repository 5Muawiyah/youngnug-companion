// src/ui/liveness_check/index.js — source for the shipped
// content/liveness_check.js (re-checks the ONE advert a
// student is looking at, on a page they opened themselves).
//
// Migrated verbatim, no behaviour change (the closing-set change lives
// entirely in common/liveness_markers.js's own source, which this file
// calls as a bare global — see extension/src/index.js for why a
// cross-shipped-file call stays a bare global rather than a real import
// under design (a)). One shipped file, one entry, no split (under 400
// lines).
//
// CLICK-TIME injected, exactly like every other reader in this extension
// (content/capture.js, content/glassdoor.js, content/resolver_ping.js) —
// this extension deliberately never regrows a STATIC third-party content-
// script entry (the manifest's content_scripts match only the app's own
// origin; a static-entry version of this file was tried and reverted). The gestures that fire it — opening the
// popup (`popup.js::pingLiveness`) or the Capture keyboard shortcut
// (`background.js::ynCaptureActiveTab`) on an Indeed/LinkedIn tab — are
// both the student's own action on the tab they are already looking at,
// which is "a page they opened" without a permission this extension has
// deliberately never carried.
//
// A plain FUNCTION, not a self-running IIFE: the caller injects the file
// (deduped by `ynInjectOnce`, since `common/api.js`'s top-level `const`
// bindings cannot be redeclared into the same isolated world) and then
// calls `ynLivenessCheck()` explicitly every time, so re-opening the popup
// on the same tab re-checks rather than silently doing nothing the second
// time.
//
// Read-only: no DOM write, no fetch of any other page, no listener left
// behind. Every call still respects the SAME per-site daily cap
// (ynUnderCap) every other capped reader in this extension already
// spends — no separate budget invented for this feature, and no per-site
// on/off switch either (assist mode is deleted as a concept: this runs
// whenever a student opens a job, with no toggle). What it reads never
// leaves the browser unless the URL is confirmed — by the worker, asking
// the server — to be one of the student's OWN saved adverts.

async function ynLivenessCheck() {
  try {
    if (window.top !== window) return { ok: false, reason: "not top frame" };
    const host = location.hostname.toLowerCase();
    const site = host.includes("linkedin")
      ? "linkedin"
      : host.includes("indeed")
        ? "indeed"
        : "";
    if (!site) return { ok: false, reason: "not an allowlisted host" };
    if (await ynStopReason()) return { ok: false, reason: "stopped" };
    if (!(await ynUnderCap(site))) {
      return { ok: false, reason: "site toggle off, or the day's cap is spent" };
    }
    const { verdict, evidence } = ynDetectLiveness();
    chrome.runtime.sendMessage({
      type: "LIVENESS_CHECK",
      url: String(location.href).slice(0, 4096),
      verdict,
      evidence: String(evidence || "").slice(0, 300),
    });
    return { ok: true, verdict };
  } catch (e) {
    return { ok: false, reason: String(e).slice(0, 200) };
  }
}

globalThis.ynLivenessCheck = ynLivenessCheck;
