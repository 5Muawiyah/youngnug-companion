// content/review_screen.js — the seam between planning and writing: one
// on-page surface, one Approve, before ynExecuteIntents ever runs.
// Exact-confidence profile facts are never listed (they still wait for the
// Approve, they just carry no row); every guessed field and every drafted
// answer gets exactly one row; nothing reaches the DOM until the student
// presses Approve. Cancel writes nothing.
//
// ynShowReviewScreen(opts) is the one entry point filler.js calls, from
// BOTH ynFillApplication and ynFillAnyPage. opts:
//   { guessed: FillIntent[], drafts: DraftEntry[], draftElByKey: Map, ats }
// It resolves to { approved: true, skippedFieldKeys: string[], edits: {} }
// or { approved: false } (Cancel). filler.js is the only caller and the
// only place that turns that decision into a write.
//
// Every static chrome string below is written as a direct return of a
// literal, a direct textContent assignment of a literal, or a direct
// setAttribute call naming aria-label with a literal (via the shared
// ynReviewIconBtn helper for every icon-only control) — the shapes
// tests/test_extension_density.py's review-screen scanner looks for. A
// row's own label/value (a profile fact, a drafted answer) is always
// assigned from a variable, never a literal, at those same call shapes, so
// it can never be mistaken for chrome. It is the student's own content.
//
// Split into rows.js (row model + row DOM) and screen.js (the auto-decision
// test hook and the screen itself) plus this entry, which re-exposes every
// one of the original file's top-level names onto globalThis exactly as
// the single-file version did — see extension/src/index.js for why
// that is safe.
import {
  YN_REVIEW_ROW_LIMIT,
  ynReviewTheme,
  ynReviewSourceKind,
  ynReviewSourceLabel,
  ynReviewDotLabel,
  ynReviewDisplayValue,
  ynReviewLooksLikeKey,
  ynReviewRowLabel,
  ynReviewBuildRows,
  ynReviewMk,
  ynReviewIconBtnStyle,
  ynReviewDotStyle,
  ynReviewIconBtn,
  ynReviewBuildRow,
} from "./rows.js";
import { ynReviewAutoDecision, ynShowReviewScreen } from "./screen.js";

globalThis.YN_REVIEW_ROW_LIMIT = YN_REVIEW_ROW_LIMIT;
globalThis.ynReviewTheme = ynReviewTheme;
globalThis.ynReviewSourceKind = ynReviewSourceKind;
globalThis.ynReviewSourceLabel = ynReviewSourceLabel;
globalThis.ynReviewDotLabel = ynReviewDotLabel;
globalThis.ynReviewDisplayValue = ynReviewDisplayValue;
globalThis.ynReviewLooksLikeKey = ynReviewLooksLikeKey;
globalThis.ynReviewRowLabel = ynReviewRowLabel;
globalThis.ynReviewBuildRows = ynReviewBuildRows;
globalThis.ynReviewMk = ynReviewMk;
globalThis.ynReviewIconBtnStyle = ynReviewIconBtnStyle;
globalThis.ynReviewDotStyle = ynReviewDotStyle;
globalThis.ynReviewIconBtn = ynReviewIconBtn;
globalThis.ynReviewBuildRow = ynReviewBuildRow;
globalThis.ynReviewAutoDecision = ynReviewAutoDecision;
globalThis.ynShowReviewScreen = ynShowReviewScreen;
