// content/settle_observer.js — mutation-quiet settle detection.
//
// Wired into filler.js step-7b ONLY for adapters with hydrationWatch:true
// (Teamtailor/Recruitee). Other adapters never set that flag, so they keep
// the fixed fast-path hold-check and never reach this observer.
//
// Problem it solves: SSR forms write into nodes that Turbo/React later
// REPLACE (not just value-clear). Cached element refs
// go stale; a fixed hold-check window is a guess. Correct shape: re-query by
// SELECTOR, re-write when the live node is missing or wrong, exit only when
// the subtree has been quiet for quietMs (and all fields hold) — bounded by
// totalMs + per-field maxRewrites so it can never loop forever.
//
// writeFn CONTRACT (caller-enforced; production injects ynExecuteIntents path):
//   - MUST refuse password fields and honeypots (never write them).
//   - MUST re-run the full safety chain (scope / user-kept / never-submit).
//   - Receives { el, value, field, selector, kind } where el is the LIVE node
//     just re-queried by selector (never a cached ref).
//   - MAY be sync or async (Promise); the observer awaits it before classify.
// ynSettleWrite itself never writes a password/honeypot kind either (defence
// in depth): those fields are skipped and never appear in held.
import {
  ynSettleWrite,
  ynSettleFieldResult_,
} from "./write.js";
import {
  ynClassifyHold,
  ynVerifyWrites,
} from "./classify.js";

// Every name top-level in the original single-file version, restored on
// globalThis exactly as before the split — chrome.scripting still injects
// the built file into the same isolated world as its neighbours, so a
// bare name another shipped file already called is still there to call.
globalThis.ynSettleWrite = ynSettleWrite;
globalThis.ynSettleFieldResult_ = ynSettleFieldResult_;
globalThis.ynClassifyHold = ynClassifyHold;
globalThis.ynVerifyWrites = ynVerifyWrites;
