// options.js — the thin explainer. Only two things are editable here: the
// stop (purely LOCAL by design — common/api.js throws before any fetch while
// it is on, and it is never part of the server settings) and the advanced
// manual token. The API base input is GONE on purpose: apiBase is settable
// only through the allowlist-gated auto-connect (background.js SET_TOKEN).
// Assist mode (a per-site on/off toggle, shown here as site coverage) is
// deleted as a concept: the daily page cap is still a per-account setting
// (edited at youngnug.com/settings), but this page no longer reflects
// per-site coverage because there is no per-site switch left to reflect.
//
// Under the 400-line module-size limit as a single file, so this is a MOVE
// rather than a split (extension/src/index.js's layer table places it
// under src/ui/, same as every other top-level page script) — every
// top-level name below is still assigned onto globalThis at the end, the
// same restoration every migrated entry does, though nothing else in this
// codebase currently calls into options.js from outside its own page.
import { setupOwnRulesSection, ynSaveOwnRules } from "./own_rules_ui.js";
import { setupUserScriptsSection } from "./user_scripts_ui.js";

/** Paint the stop control. role="switch" + aria-checked IS the state — the
 * CSS reads the same attribute, so there is one source of truth. */
function paintKill(on) {
  const btn = document.getElementById("kill");
  btn.setAttribute("aria-checked", on ? "true" : "false");
  document.getElementById("kill-state").textContent = on
    ? "Stopped"
    : "Running";
}

/** The warnings surface — shown only when there is something true to say.
 * Both values come from the worker's cache of the account settings, so this
 * page still shows a raised warning with the network down. */
function paintWarning(settings) {
  const box = document.getElementById("warn");
  const parts = [];
  if (settings.serverStop) {
    parts.push(
      "<strong>Stopped from your YoungNug account</strong>" +
        "Nothing runs until it is lifted on the site.",
    );
  }
  if (settings.serverWarning) {
    const safe = settings.serverWarning
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    parts.push(`<strong>Notice</strong>${safe}`);
  }
  box.innerHTML = parts.join("<hr />");
  box.hidden = parts.length === 0;
}

async function load() {
  const c = await chrome.storage.local.get({ token: "", killSwitch: false });
  token.value = c.token;
  paintKill(c.killSwitch);
  let settings = null;
  try {
    settings = await ynSettings();
  } catch {
    /* storage unavailable — the stop above is already painted from its own read */
  }
  if (settings) paintWarning(settings);
}

// Local storage only: no worker message, no network, so the stop works with
// the API unreachable.
document.getElementById("kill").addEventListener("click", async () => {
  const btn = document.getElementById("kill");
  const next = btn.getAttribute("aria-checked") !== "true";
  paintKill(next);
  try {
    await chrome.storage.local.set({ killSwitch: next });
  } catch {
    paintKill(!next);
    document.getElementById("msg").textContent =
      "Could not save. Still running.";
  }
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ token: token.value.trim() });
  await ynSaveOwnRules();
  document.getElementById("msg").textContent = "Saved.";
  setTimeout(() => (document.getElementById("msg").textContent = ""), 1500);
});

/** Show the keyboard shortcuts Chrome actually registered.
 *
 * chrome.commands.getAll() is the truth here, not the manifest: Chrome
 * silently declines a suggested key it cannot assign, so a command can exist
 * with an empty shortcut. Printing the manifest's suggestion in that case
 * would tell a student to press a key that does nothing, which is worse than
 * saying nothing at all. Commands with no assigned key are left out, and the
 * whole card stays hidden when none has one.
 */
async function loadShortcuts() {
  const card = document.getElementById("shortcuts-card");
  const list = document.getElementById("shortcuts");
  if (!card || !list || !chrome.commands) return;
  let commands = [];
  try {
    commands = await chrome.commands.getAll();
  } catch {
    return;
  }
  const withKeys = commands.filter((c) => c && c.shortcut);
  if (!withKeys.length) return;
  list.textContent = "";
  for (const c of withKeys) {
    const li = document.createElement("li");
    const kbd = document.createElement("kbd");
    kbd.textContent = c.shortcut;
    li.append(kbd, " ");
    // _execute_action is Chrome's own reserved name and carries no
    // description of its own, so it gets one here.
    li.append(
      c.name === "_execute_action"
        ? "Open the Companion"
        : c.description || c.name,
    );
    list.append(li);
  }
  card.hidden = false;
}

load();
void loadShortcuts();
setupOwnRulesSection();
setupUserScriptsSection();

// Every top-level name, restored onto globalThis exactly as every migrated
// entry does — see extension/src/index.js for why that is safe.
globalThis.paintKill = paintKill;
globalThis.paintWarning = paintWarning;
globalThis.load = load;
globalThis.loadShortcuts = loadShortcuts;
