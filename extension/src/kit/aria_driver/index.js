// content/aria_driver.js — the generic ARIA combobox / listbox / choice
// driver: the FINAL rung for any custom widget that carries the right ARIA
// role but that no adapter has written a selector-based driver for.
//
// Loads after content/dom_fill_kit.js (uses ynQueryDeep for shadow-piercing,
// ynKitGuards for the injected never-submit guard, ynBestOptionMatch's
// exact-then-unique-substring refusal rule) and before content/engine.js
// (ynDriveCombobox's final rung; the engine's aria_choice branch may also
// call ynAriaFillChoice). Self-contained otherwise — no adapter-specific
// selectors, no per-site branching.
//
// lifted from https://github.com/averatec0773/offeros/blob/c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94/apps/extension/src/lib/autofill/aria-driver.ts#L1-L412 (Apache-2.0), adapted
// Changes made: ported TypeScript to plain JS with yn-prefixed names; option
// matching now goes through this codebase's own ynBestOptionMatch (exact,
// then UNIQUE substring only — an ambiguous substring match REFUSES rather
// than taking the original's "first match wins", since a wrong click is
// worse than an honest miss) instead of option-match.ts's matchOptionValue;
// dropped geo-synonyms.ts (country/state alias expansion) — out of
// scope, no fixture here depends on it; every click is gated
// on the injected ynKitGuards.clickGuard (fail closed with none injected),
// which the source file has no equivalent of; added shadow-piercing via
// ynQueryDeep so a listbox/option living in an open shadow root (one of the
// seven fixtures) is still found; added a typed-filter pre-pass for
// virtualised lists (type into a nested typeable box, poll rendered rows,
// THEN escalate to keys) — the source's typeAsText path only runs when no
// popup ever opens, this codebase's virtualised-list fixture needs it BEFORE
// opening too, since the list renders nothing until filtered.
//
// Split into primitives.js / popup_fill.js / choice_fill.js (each under the
// 400-line module limit) plus this entry, which re-exposes every one of the
// original file's top-level names exactly as the single-file version did —
// see extension/src/index.js for why that is safe: chrome.scripting
// still injects the BUILT content/aria_driver.js as one classic script
// into the same isolated world as dom_fill_kit.js and engine.js, so every
// name assigned onto globalThis here is the same bare name those files
// could already call.
import {
  YN_ARIA_OPEN_KEYS,
  YN_ARIA_OPTION_ROLES,
  YN_ARIA_OPTION_SELECTOR,
  YN_ARIA_TYPEABLE_TYPES,
  YN_ARIA_OPEN_TIMEOUT_MS,
  YN_ARIA_COMMIT_TIMEOUT_MS,
  YN_ARIA_POLL_MS,
  ynAriaSleep,
  ynAriaPressPointer,
  ynAriaPressKey,
  ynAriaIsPopupControl,
  ynAriaIsChoice,
  ynAriaTextOf,
  ynAriaControlValue,
  ynAriaOptionsIn,
  ynAriaFindPopup,
  ynAriaTypeableWithin,
  ynAriaSetTyped,
  ynAriaReadTyped,
  ynAriaSquash,
  ynAriaTypeAsText,
} from "./primitives.js";
import { ynAriaOpenPopup, ynAriaMatchOptions, ynAriaFillPopup } from "./popup_fill.js";
import { ynAriaGroupMembers, ynAriaOptionLabel, ynAriaFillChoice } from "./choice_fill.js";

// Every name that was top-level in the single-file version, assigned onto
// globalThis so a later-injected file can still call it as a bare name —
// the full set, not only the six the original file also assigned to
// `window` (those six were ALREADY reachable as bare globals before this
// split too, from being top-level `const`/`function` in a classic script;
// this list restores that for all twenty-seven, not just the six the
// original file happened to name twice).
globalThis.YN_ARIA_OPEN_KEYS = YN_ARIA_OPEN_KEYS;
globalThis.ynAriaSleep = ynAriaSleep;
globalThis.ynAriaPressPointer = ynAriaPressPointer;
globalThis.ynAriaPressKey = ynAriaPressKey;
globalThis.ynAriaIsPopupControl = ynAriaIsPopupControl;
globalThis.YN_ARIA_OPTION_ROLES = YN_ARIA_OPTION_ROLES;
globalThis.YN_ARIA_OPTION_SELECTOR = YN_ARIA_OPTION_SELECTOR;
globalThis.ynAriaIsChoice = ynAriaIsChoice;
globalThis.ynAriaTextOf = ynAriaTextOf;
globalThis.ynAriaControlValue = ynAriaControlValue;
globalThis.ynAriaOptionsIn = ynAriaOptionsIn;
globalThis.ynAriaFindPopup = ynAriaFindPopup;
globalThis.YN_ARIA_TYPEABLE_TYPES = YN_ARIA_TYPEABLE_TYPES;
globalThis.ynAriaTypeableWithin = ynAriaTypeableWithin;
globalThis.ynAriaSetTyped = ynAriaSetTyped;
globalThis.ynAriaReadTyped = ynAriaReadTyped;
globalThis.ynAriaSquash = ynAriaSquash;
globalThis.ynAriaTypeAsText = ynAriaTypeAsText;
globalThis.YN_ARIA_OPEN_TIMEOUT_MS = YN_ARIA_OPEN_TIMEOUT_MS;
globalThis.YN_ARIA_COMMIT_TIMEOUT_MS = YN_ARIA_COMMIT_TIMEOUT_MS;
globalThis.YN_ARIA_POLL_MS = YN_ARIA_POLL_MS;
globalThis.ynAriaOpenPopup = ynAriaOpenPopup;
globalThis.ynAriaMatchOptions = ynAriaMatchOptions;
globalThis.ynAriaFillPopup = ynAriaFillPopup;
globalThis.ynAriaGroupMembers = ynAriaGroupMembers;
globalThis.ynAriaOptionLabel = ynAriaOptionLabel;
globalThis.ynAriaFillChoice = ynAriaFillChoice;

// The original file's `window.X = X` / `module.exports = {...}` footer (the
// same six names) is appended by the build script AFTER esbuild runs,
// reading them off globalThis — see scripts/build_extension.py's
// NODE_EXPORTS entry for this file. It is not written as literal source
// here because esbuild treats a genuine `module.exports = ...` assignment
// inside bundled ESM source as a signal to wrap the whole bundle as a lazy
// CommonJS module (its own require/exports interop), which stops the
// bundle's top-level code — including these globalThis assignments — from
// running eagerly when the shipped file is injected as a classic script.
