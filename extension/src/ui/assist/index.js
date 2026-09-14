// content/assist.js - signup-wall assist.
// Detects what THIS wall offers (DOM-presence only), renders a panel into
// the existing yn-overlay box, and inserts a policy-aware password
// generated client-side by the GENERIC content/password_kit.js (loaded
// before this file). The ONLY password write in the product is the panel's
// own "Insert into the password field" button handler - a fresh user
// gesture (event.isTrusted) each time. That insert is a CLOSURE inside the
// panel; it is NOT a global and plan/execute/heuristics cannot call it.
//
// Hard rules: no network, no chrome.storage of the value, no console.log of
// the value, no ynApi. ynAdaIsPassword / ynSubmitGuard / honeypot stay
// untouched in engine.js. A credential vault is not built here: the
// generated password lives only in the panel's closure and the password
// field, never in persistent storage.
// DELIBERATE value-bearing sink, stated not hidden: the Copy button writes
// the generated value to the SYSTEM CLIPBOARD on a trusted user click -
// that is the button's labelled purpose, and the OS clipboard is readable
// by other local processes. The status copy tells the user to paste only
// into this site's form; the panel DOM and the password input are the
// only other places the value ever exists.
import {
  ynAssistTheme,
  ynAssistFindAll,
  ynAssistPolicyText,
  ynAssistDetectPasskey,
  ynAssistDetectOauth,
  ynAssistPasswordForm,
} from "./detect.js";
import {
  ynWallAssistState,
  ynAssistEnsureOverlayBox,
  ynAssistMk,
  ynAssistBtnStyles,
  ynWallAssistPanel,
} from "./panel.js";

// Every name top-level in the original single-file version, restored on
// globalThis exactly as before the split — chrome.scripting still injects
// the built file into the same isolated world as its neighbours, so a
// bare name another shipped file already called is still there to call.
globalThis.ynAssistTheme = ynAssistTheme;
globalThis.ynAssistFindAll = ynAssistFindAll;
globalThis.ynAssistPolicyText = ynAssistPolicyText;
globalThis.ynAssistDetectPasskey = ynAssistDetectPasskey;
globalThis.ynAssistDetectOauth = ynAssistDetectOauth;
globalThis.ynAssistPasswordForm = ynAssistPasswordForm;
globalThis.ynWallAssistState = ynWallAssistState;
globalThis.ynAssistEnsureOverlayBox = ynAssistEnsureOverlayBox;
globalThis.ynAssistMk = ynAssistMk;
globalThis.ynAssistBtnStyles = ynAssistBtnStyles;
globalThis.ynWallAssistPanel = ynWallAssistPanel;
