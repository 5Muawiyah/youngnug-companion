// content/dom_fill_kit.js — generic DOM form-fill toolkit.
// Reusable, product-agnostic DOM operations: React-proof native value write,
// open-shadow-root deep query, debounced waitFor, combobox driver, file
// attach, field highlight/badge, selector paths. This file must stay free of
// YoungNug-specific logic AND free of references to the private safety core:
// the never-submit guard arrives as an INJECTED dependency via ynKitInit(...)
// (wired by the safety core after it defines the guard). With no guard
// injected the kit FAILS CLOSED: the combobox driver refuses every click.
import {
  ynKitGuards,
  ynMakeEvent,
  ynKitInit,
  ynSetNativeValue,
  ynQueryDeep,
  ynAdaFind,
  ynAdaFindAll,
} from "./core.js";
import {
  ynWaitFor,
  ynBestOptionMatch,
  ynDriveCombobox,
  ynDriveCascade,
} from "./combobox.js";
import {
  YN_TYPE_PACE_MS,
  ynTypeValuePerChar,
  YN_RICH_TEXT_MARKERS,
  ynIsPlainContentEditable,
  ynWriteContentEditablePlain,
} from "./typing.js";
import {
  ynUndoSession,
  ynResetUndoSession,
  ynStashForUndo,
  ynClearElementHighlight,
  ynUndoFill,
} from "./undo.js";
import {
  ynDataUrlToFile,
  ynFileInputAccepts,
  ynAttachFile,
  ynDropFile,
  ynResolveDropTarget,
  ynFileAttachVisibleOk,
  ynAttachFileWithConfirm,
} from "./file_attach.js";
import {
  YN_HIGHLIGHT_COLORS,
  ynHexAlpha,
  YN_HIGHLIGHT,
  ynEnsureHighlightStyles,
  ynHighlight,
  ynUpdateFillBadge,
  ynSelectorPath,
} from "./highlight.js";

// Every name top-level in the original single-file version, restored on
// globalThis exactly as before the split — chrome.scripting still injects
// the built file into the same isolated world as its neighbours, so a
// bare name another shipped file already called is still there to call.
globalThis.ynKitGuards = ynKitGuards;
globalThis.ynMakeEvent = ynMakeEvent;
globalThis.ynKitInit = ynKitInit;
globalThis.ynSetNativeValue = ynSetNativeValue;
globalThis.ynQueryDeep = ynQueryDeep;
globalThis.ynAdaFind = ynAdaFind;
globalThis.ynAdaFindAll = ynAdaFindAll;
globalThis.ynWaitFor = ynWaitFor;
globalThis.ynBestOptionMatch = ynBestOptionMatch;
globalThis.ynDriveCombobox = ynDriveCombobox;
globalThis.ynDriveCascade = ynDriveCascade;
globalThis.YN_TYPE_PACE_MS = YN_TYPE_PACE_MS;
globalThis.ynTypeValuePerChar = ynTypeValuePerChar;
globalThis.YN_RICH_TEXT_MARKERS = YN_RICH_TEXT_MARKERS;
globalThis.ynIsPlainContentEditable = ynIsPlainContentEditable;
globalThis.ynWriteContentEditablePlain = ynWriteContentEditablePlain;
globalThis.ynUndoSession = ynUndoSession;
globalThis.ynResetUndoSession = ynResetUndoSession;
globalThis.ynStashForUndo = ynStashForUndo;
globalThis.ynClearElementHighlight = ynClearElementHighlight;
globalThis.ynUndoFill = ynUndoFill;
globalThis.ynDataUrlToFile = ynDataUrlToFile;
globalThis.ynFileInputAccepts = ynFileInputAccepts;
globalThis.ynAttachFile = ynAttachFile;
globalThis.ynDropFile = ynDropFile;
globalThis.ynResolveDropTarget = ynResolveDropTarget;
globalThis.ynFileAttachVisibleOk = ynFileAttachVisibleOk;
globalThis.ynAttachFileWithConfirm = ynAttachFileWithConfirm;
globalThis.YN_HIGHLIGHT_COLORS = YN_HIGHLIGHT_COLORS;
globalThis.ynHexAlpha = ynHexAlpha;
globalThis.YN_HIGHLIGHT = YN_HIGHLIGHT;
globalThis.ynEnsureHighlightStyles = ynEnsureHighlightStyles;
globalThis.ynHighlight = ynHighlight;
globalThis.ynUpdateFillBadge = ynUpdateFillBadge;
globalThis.ynSelectorPath = ynSelectorPath;
