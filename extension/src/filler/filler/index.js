// content/filler.js — the highest-level fill orchestrator: ynFillApplication
// (the job path: fill-plan, planning ladder, review gate, execute, hold-
// check, cache, wizard/multi-step, outcome report) and ynFillAnyPage (the
// generic fallback: the Companion on any page from the profile alone, no
// job required), plus the shared report/overlay/cache machinery both rungs
// use.
//
// Split into eleven parts (each under the 400-line module limit). The one
// piece too large to carry whole — ynFillApplication itself, 776 lines in
// the single-file version — is four phase functions (fa_setup.js,
// fa_plan_execute.js, fa_hold_check.js, fa_finish.js) sharing one plain
// state object instead of closure variables, wired together by
// fill_application.js in the exact order the single-file version's own
// numbered steps ran in; every other part is a straight house-move. See
// each part's own header for exactly what moved and why.
//
// This entry re-exposes every one of the original file's top-level names
// onto globalThis exactly as the single-file version did — see
// extension/src/index.js for why that is safe: chrome.scripting still
// injects the BUILT content/filler.js as one classic script into the same
// isolated world as content/engine.js and every other content/*.js file,
// so every name assigned onto globalThis here is the same bare name those
// files could already call.
import {
  ynOverlay,
  ynEmptyReport,
  ynMergeReport,
  ynFillStateKey,
  ynLoadFillState,
  ynSaveFillState,
} from "./report_state.js";
import {
  YN_OLLAMA_ALLOWED_KEYS,
  YN_FENCE_TOKEN_RE,
  ynNeutralizeFenceTokens,
  ynFenceUntrusted,
  ynOllamaIntents,
} from "./ollama_intents.js";
import {
  ynUtf8Bytes,
  YN_FNV64_PRIME,
  YN_FNV64_OFFSET,
  YN_FNV64_MASK,
  ynFnv1a64Hex,
  ynQuestionFingerprint,
  YN_SAVABLE_ANSWER_KEYS,
  ynReadBooleanGroupAnswer,
  ynCollectUserAnswers,
} from "./answer_cache.js";
import {
  ynSendWorker,
  ynResolveCachedSelector,
  ynProfileValueForKey,
  ynIntentsFromCache,
  ynCacheHeuristicWins,
} from "./worker_cache.js";
import {
  ynAtsDisplayLine,
  ynAssistOnlyHandoff,
  ynIsCredentialField,
  ynCredentialSkips,
  ynCountNotAttempted,
  ynReportOverlayLines,
} from "./overlay_lines.js";
import {
  ynWizardStepInfo,
  ynEvidenceString,
  ynPlanRungs,
  ynSplitIntents,
  ynReviewGate,
} from "./plan_rungs.js";
import { ynFillApplication } from "./fill_application.js";
import { ynFillAnyPage, ynGenericDisplayLine } from "./fill_any_page.js";
import { ynOverlayReport, ynOverlaySummary } from "./overlay_report.js";

// Every name that was top-level in the single-file version, assigned onto
// globalThis so a later-injected file can still call it as a bare name —
// the full set, matching the single-file version's own top-to-bottom order.
globalThis.ynOverlay = ynOverlay;
globalThis.ynEmptyReport = ynEmptyReport;
globalThis.ynMergeReport = ynMergeReport;
globalThis.ynFillStateKey = ynFillStateKey;
globalThis.ynLoadFillState = ynLoadFillState;
globalThis.ynSaveFillState = ynSaveFillState;
globalThis.YN_OLLAMA_ALLOWED_KEYS = YN_OLLAMA_ALLOWED_KEYS;
globalThis.YN_FENCE_TOKEN_RE = YN_FENCE_TOKEN_RE;
globalThis.ynNeutralizeFenceTokens = ynNeutralizeFenceTokens;
globalThis.ynFenceUntrusted = ynFenceUntrusted;
globalThis.ynOllamaIntents = ynOllamaIntents;
globalThis.ynUtf8Bytes = ynUtf8Bytes;
globalThis.YN_FNV64_PRIME = YN_FNV64_PRIME;
globalThis.YN_FNV64_OFFSET = YN_FNV64_OFFSET;
globalThis.YN_FNV64_MASK = YN_FNV64_MASK;
globalThis.ynFnv1a64Hex = ynFnv1a64Hex;
globalThis.ynQuestionFingerprint = ynQuestionFingerprint;
globalThis.YN_SAVABLE_ANSWER_KEYS = YN_SAVABLE_ANSWER_KEYS;
globalThis.ynReadBooleanGroupAnswer = ynReadBooleanGroupAnswer;
globalThis.ynCollectUserAnswers = ynCollectUserAnswers;
globalThis.ynSendWorker = ynSendWorker;
globalThis.ynResolveCachedSelector = ynResolveCachedSelector;
globalThis.ynProfileValueForKey = ynProfileValueForKey;
globalThis.ynIntentsFromCache = ynIntentsFromCache;
globalThis.ynCacheHeuristicWins = ynCacheHeuristicWins;
globalThis.ynAtsDisplayLine = ynAtsDisplayLine;
globalThis.ynAssistOnlyHandoff = ynAssistOnlyHandoff;
globalThis.ynIsCredentialField = ynIsCredentialField;
globalThis.ynCredentialSkips = ynCredentialSkips;
globalThis.ynCountNotAttempted = ynCountNotAttempted;
globalThis.ynReportOverlayLines = ynReportOverlayLines;
globalThis.ynWizardStepInfo = ynWizardStepInfo;
globalThis.ynEvidenceString = ynEvidenceString;
globalThis.ynPlanRungs = ynPlanRungs;
globalThis.ynSplitIntents = ynSplitIntents;
globalThis.ynReviewGate = ynReviewGate;
globalThis.ynFillApplication = ynFillApplication;
globalThis.ynFillAnyPage = ynFillAnyPage;
globalThis.ynGenericDisplayLine = ynGenericDisplayLine;
globalThis.ynOverlayReport = ynOverlayReport;
globalThis.ynOverlaySummary = ynOverlaySummary;

// Guard against double registration when popup re-injects the fill stack
// on unknown-ATS pages (activeTab injection). Same guard, same listener,
// same position (the single-file version's very last statement) — the
// only change is calling the imported ynFillApplication binding directly
// rather than the bare global this file itself just finished assigning.
if (!globalThis.__ynFillerReady) {
  globalThis.__ynFillerReady = true;
  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (msg.type === "FILL_APPLICATION") {
      ynFillApplication(msg.jobId)
        .then((result) => send(result || { ok: true }))
        .catch((e) =>
          send({ ok: false, error: String(e && e.message ? e.message : e) }),
        );
      return true;
    }
  });
}
