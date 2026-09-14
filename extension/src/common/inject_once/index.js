// common/inject_once.js — the one injection helper, shared by the popup and
// the service worker.
//
// It used to live only in popup.js, which was fine while the popup was the
// only thing that ever injected. The keyboard shortcut changed that: a
// command fires in the WORKER, with no popup open, and the worker has to run
// exactly the same injection the Capture button runs. Two copies of this
// function would be two things to keep in step, and the failure mode of them
// drifting is a capture that works from the button and not from the shortcut,
// which is the shape of bug nobody notices for a month.
//
// Loaded by popup.html and options.html as a plain script, and by the worker
// through importScripts, the same way common/api.js is.

/** Inject files once per page: several stack files carry top-level const
 * bindings, and re-evaluating those in the same isolated world throws
 * ("already declared"). The sentinel is a global the stack defines; when it
 * is already present the injection is skipped, so a second click can never
 * break the first click's stack. */
async function ynInjectOnce(tabId, files, sentinel, allFrames) {
  // The probe MUST cover the same frames as the injection. Probing only the
  // top frame let one already-injected shell suppress injection into an
  // iframe that had since navigated (embedded ATS step 2), so the fill
  // silently reached no frame at all.
  const target = { tabId, allFrames: allFrames === true };
  // The sentinel is per-STACK, but the stacks SHARE files (every one starts
  // with common/api.js, which has top-level `const` bindings). Keying only on
  // the stack sentinel meant Capture-then-Fill re-evaluated api.js in the
  // same isolated world -> "Identifier 'ynJitter' has already been declared".
  // So track what has actually been injected per world and send only the
  // files that world is missing.
  const [probe] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (name, wanted) => {
      globalThis.__ynInjected = globalThis.__ynInjected || [];
      return {
        hasSentinel: typeof globalThis[name] === "function",
        missing: wanted.filter((f) => !globalThis.__ynInjected.includes(f)),
      };
    },
    args: [sentinel, files],
  });
  const result = probe && probe.result;
  if (result && result.hasSentinel && !(result.missing || []).length) return;
  const todo = result && result.missing ? result.missing : files;
  if (!todo.length) return;
  await chrome.scripting.executeScript({ target, files: todo });
  await chrome.scripting.executeScript({
    target,
    func: (done) => {
      globalThis.__ynInjected = globalThis.__ynInjected || [];
      for (const f of done) {
        if (!globalThis.__ynInjected.includes(f))
          globalThis.__ynInjected.push(f);
      }
    },
    args: [todo],
  });
}

/** The three files a capture read needs, in order. Named here so the popup
 * and the worker cannot disagree about them. */
const YN_CAPTURE_FILES = [
  "common/api.js",
  "common/challenge_detect.js",
  "content/capture.js",
];

/** The live-check stack + the two hosts it is allowlisted
 * for (the only two `common/liveness_markers.js` has a phrase list for).
 * Named here so `popup.js` (popup-open) and `background.js` (the Capture
 * keyboard shortcut) inject and gate identically. */
const YN_LIVENESS_HOSTS =
  /^https:\/\/(uk\.indeed\.com|www\.indeed\.com|www\.linkedin\.com)\//i;
const YN_LIVENESS_FILES = [
  "common/api.js",
  "common/challenge_detect.js",
  "common/liveness_markers.js",
  "content/liveness_check.js",
];

/** Inject (deduped) and RUN the live-check on `tabId` if its URL is on an
 * allowlisted host — shared by the popup-open and keyboard-shortcut
 * triggers so the two can never drift. Best-effort: a non-injectable page
 * or any thrown error is swallowed, since this must never break whatever
 * gesture triggered it (a capture, or simply opening the popup). */
async function ynPingLiveness(tabId, url) {
  try {
    if (!tabId || !YN_LIVENESS_HOSTS.test(url || "")) return;
    await ynInjectOnce(tabId, YN_LIVENESS_FILES, "ynLivenessCheck");
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ynLivenessCheck(),
    });
  } catch {
    /* non-injectable page, or the check itself failed — never propagate */
  }
}

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynInjectOnce = ynInjectOnce;
globalThis.YN_CAPTURE_FILES = YN_CAPTURE_FILES;
globalThis.YN_LIVENESS_HOSTS = YN_LIVENESS_HOSTS;
globalThis.YN_LIVENESS_FILES = YN_LIVENESS_FILES;
globalThis.ynPingLiveness = ynPingLiveness;
