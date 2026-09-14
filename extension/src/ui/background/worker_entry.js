// background.js — the worker's own entry points: install, the runtime
// message listener, the Capture keyboard shortcut, and its own command
// listener.
import { handle } from "./dispatch.js";
import { ynRecordLastCapture } from "./capture_record.js";

chrome.runtime.onInstalled.addListener(() => {
  console.log(
    "[YoungNug] companion installed. Set API base + account token in options",
  );
  chrome.action?.setBadgeText?.({ text: "YN" });
  // re-register every stored user script. A fresh install has none
  // stored yet (registers zero, harmlessly); an update or a re-enable
  // re-applies whatever the student already saved, since Chrome does not
  // persist chrome.userScripts registrations across a worker restart on
  // its own.
  void ynRegisterAllUserScripts();
});

// The service worker can be torn down and restarted without a fresh
// install (a browser restart, Chrome reclaiming an idle worker) — onStartup
// is the event that fires for exactly that case, which onInstalled does not.
chrome.runtime.onStartup?.addListener(() => {
  void ynRegisterAllUserScripts();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // async response
});

// --- The keyboard shortcut -------------------------------------------------
// Two commands are declared in the manifest.
//
//   _execute_action     Chrome's reserved name. Chrome itself opens the popup,
//                       exactly as clicking the toolbar icon does, so there is
//                       no handler for it here and nothing to keep in step.
//   capture-current-tab Handled below: saves the advert on the tab the student
//                       is looking at, with no popup at all.
//
// Chrome treats invoking a command as a USER GESTURE and grants activeTab for
// the current tab, the same grant a toolbar click carries. That is what makes
// the shortcut a real feature rather than a way around the permission: it is
// still one deliberate gesture, on one tab, initiated by the student. Nothing
// here reads a tab the student has not asked about, and there is still no
// "tabs" permission, so the worker cannot even see the URL of a tab it has no
// grant for.
//
// The read is the SAME read the Capture button performs, through the same
// shared ynInjectOnce and the same CAPTURE_JOB path, so the durable
// lastCapture record and the app-tab broadcast happen for a shortcut capture
// exactly as they do for a clicked one.

/** Read the active tab and save whatever the reader found. Returns the same
 * shape the popup summarises, so a caller can report it. */
async function ynCaptureActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) {
    return { ok: false, error: "no active tab" };
  }
  const host = (() => {
    try {
      return new URL(tab.url || "").hostname;
    } catch {
      return "";
    }
  })();

  // The SAME "student is on the tab, activeTab is granted"
  // gesture the capture below uses also fires the live re-check, on the
  // same tab, via the shared common/inject_once.js::ynPingLiveness (the
  // same helper popup.js's pingLiveness calls) — no-ops off the two
  // allowlisted hosts. Fire-and-forget: the live check must never delay or
  // break the capture the student actually pressed the shortcut for.
  void ynPingLiveness(tab.id, tab.url || "");

  let read;
  try {
    await ynInjectOnce(tab.id, YN_CAPTURE_FILES, "ynCaptureCurrent");
    // Same contract as the popup's capture click: the student's validated
    // per-site selector rules ride in as an argument (capture.js is
    // storage-free by design; popup.js owns the key and its validation).
    const devGot = await chrome.storage.local.get("ynCaptureOverlaySelectors");
    [read] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (rules) => ynCaptureCurrent(rules),
      args: [devGot["ynCaptureOverlaySelectors"] || []],
    });
  } catch (e) {
    // chrome:// pages, the Web Store, PDFs, other extensions: Chrome refuses
    // the injection and throws. Same refusal the popup handles, recorded the
    // same durable way so a shortcut failure is not the invisible kind.
    const error = "Chrome will not let extensions read this page";
    await ynRecordLastCapture({ ok: false, host, error });
    return { ok: false, error, detail: String(e).slice(0, 300) };
  }

  const r = read && read.result;
  if (!r || !r.ok) {
    const error = (r && r.error) || "could not read this page";
    await ynRecordLastCapture({ ok: false, host, error });
    return { ok: false, error };
  }

  if (Array.isArray(r.jobs)) {
    // A recognised results page. Each card goes through the same one-at-a-time
    // CAPTURE_JOB path the popup uses, jittered like every other repeated
    // call. ynJitter comes from common/api.js.
    let saved = 0;
    let dupes = 0;
    let failed = 0;
    for (let i = 0; i < r.jobs.length; i++) {
      if (i) await ynJitter();
      try {
        const res = await handle({ type: "CAPTURE_JOB", job: r.jobs[i] }, {});
        if (!res || !res.ok) failed += 1;
        else if (res.duplicate) dupes += 1;
        else saved += 1;
      } catch {
        failed += 1;
      }
    }
    await ynRecordLastCapture({
      ok: true,
      mode: "serp",
      host,
      saved,
      dupes,
      failed,
    });
    return { ok: true, mode: "serp", saved, dupes, failed };
  }

  try {
    // CAPTURE_JOB records lastCapture itself for the single-advert path.
    const res = await handle({ type: "CAPTURE_JOB", job: r.job }, {});
    return res;
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300) };
  }
}

chrome.commands?.onCommand.addListener((command) => {
  if (command !== "capture-current-tab") return;
  // Fire and forget: the listener must return synchronously, and the outcome
  // is recorded durably by ynRecordLastCapture and shown next time the popup
  // opens, which is the same place a clicked capture's outcome is re-shown.
  void ynCaptureActiveTab().catch((e) =>
    console.warn("[YoungNug] shortcut capture failed:", e),
  );
});

export { ynCaptureActiveTab };
