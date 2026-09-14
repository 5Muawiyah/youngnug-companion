// common/user_scripts.js — scripts the STUDENT pastes (name, match
// patterns, code), registered through chrome.userScripts.register into the
// USER_SCRIPT world on the named sites. This module is DELIBERATELY
// isolated from the Companion's own fill path: content/filler.js,
// content/engine.js, every content/adapters/*.js and content/review_screen.js
// neither import nor reference anything here, and this file references
// nothing of theirs — a dedicated suite proves both directions by scanning
// the source, not by trusting a comment. The
// Companion's own "never auto-submits" promise is about the Companion —
// a script the student wrote and registered here can do anything a script
// on that page can do, submit included, which is exactly why the options
// page states that distinction in one line rather than leaving it implied.
//
// Registration itself (chrome.userScripts.register/unregister) only ever
// runs from an extension page (the background service worker, or the
// options page itself right after Save) — never injected into a web page,
// and never part of any content-script stack this module's isolation test
// checks.

const YN_USER_SCRIPTS_KEY = "userScripts";
const YN_USER_SCRIPTS_MAX = 10;
const YN_USER_SCRIPT_CODE_MAX_CHARS = 20000;

/**
 * A match pattern list from a textarea: one per line, trimmed, blanks
 * dropped. chrome.userScripts re-validates the actual MV3 match-pattern
 * grammar itself at register() time (it is the authority on that grammar,
 * not this module) — this only rejects the shapes that are never a match
 * pattern at all: empty, or carrying a javascript: scheme.
 */
function ynParseUserScriptMatches(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^javascript:/i.test(l));
}

/**
 * Validate one script entry before it is stored. Never executes the code —
 * this is a shape check only (non-empty name/matches/code, sane lengths);
 * chrome.userScripts.register is the one place the code is ever actually
 * run, and only after the browser's own "Allow user scripts" toggle and
 * this extension's own permission are both on.
 */
function ynValidateUserScript(entry) {
  const name = String((entry && entry.name) || "").trim();
  const matches = Array.isArray(entry && entry.matches) ? entry.matches : [];
  const code = String((entry && entry.code) || "");
  if (!name) return { ok: false, error: "Name this script." };
  if (name.length > 80) return { ok: false, error: "Name is too long." };
  if (!matches.length) return { ok: false, error: "Add at least one site pattern." };
  if (!code.trim()) return { ok: false, error: "The script is empty." };
  if (code.length > YN_USER_SCRIPT_CODE_MAX_CHARS) {
    return { ok: false, error: "The script is too long." };
  }
  return { ok: true };
}

/**
 * Every stored entry -> the chrome.userScripts.RegisteredUserScript shape,
 * one per entry, in the USER_SCRIPT world (isolated from the page's own
 * scripts AND from this extension's content scripts — neither can see or
 * touch the other's globals, which is the whole point of that world: a
 * student's script cannot accidentally collide with the Companion's own
 * injected globals, and the Companion cannot accidentally see whatever the
 * student's script defines).
 */
function ynUserScriptsToRegistrations(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => ynValidateUserScript(e).ok)
    .map((e) => ({
      id: e.id,
      matches: e.matches,
      js: [{ code: e.code }],
      world: "USER_SCRIPT",
      runAt: "document_idle",
    }));
}

/**
 * Re-register EVERYTHING from storage: called on extension install/startup
 * (background) and again right after Save (options page), so a change
 * takes effect immediately rather than waiting for the next browser
 * restart. Unregisters every previously-registered id first — Chrome
 * refuses to register a second script under an id already in use, and a
 * deleted entry must actually stop running, not merely disappear from the
 * list. `chrome.userScripts` is undefined when the browser's own "Allow
 * user scripts" toggle is off for this extension (Chrome 138+); that is
 * not an error, it is the expected off state, so this returns quietly.
 */
async function ynRegisterAllUserScripts() {
  if (typeof chrome === "undefined" || !chrome.userScripts) {
    return { ok: false, reason: "unavailable" };
  }
  try {
    const got = await chrome.storage.local.get({ [YN_USER_SCRIPTS_KEY]: [] });
    const entries = got[YN_USER_SCRIPTS_KEY] || [];
    const existing = await chrome.userScripts.getScripts();
    if (existing.length) {
      await chrome.userScripts.unregister({
        ids: existing.map((s) => s.id),
      });
    }
    const registrations = ynUserScriptsToRegistrations(entries);
    if (registrations.length) {
      await chrome.userScripts.register(registrations);
    }
    return { ok: true, count: registrations.length };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.YN_USER_SCRIPTS_KEY = YN_USER_SCRIPTS_KEY;
globalThis.YN_USER_SCRIPTS_MAX = YN_USER_SCRIPTS_MAX;
globalThis.YN_USER_SCRIPT_CODE_MAX_CHARS = YN_USER_SCRIPT_CODE_MAX_CHARS;
globalThis.ynParseUserScriptMatches = ynParseUserScriptMatches;
globalThis.ynValidateUserScript = ynValidateUserScript;
globalThis.ynUserScriptsToRegistrations = ynUserScriptsToRegistrations;
globalThis.ynRegisterAllUserScripts = ynRegisterAllUserScripts;
