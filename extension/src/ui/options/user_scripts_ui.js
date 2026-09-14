// options.js, part 3 — chrome.userScripts wiring for the options page.
// Parsing/validation/registration live in common/user_scripts.js (loaded
// before this file); this module is only the textarea/list <-> storage
// <-> chrome.userScripts.register wiring, and the "off" fallback (ONE
// line, ONE icon, nothing else) when the browser's own per-extension
// "Allow user scripts" toggle is not on.

const YN_ENABLE_URL = "chrome://extensions/?id=" + (chrome.runtime && chrome.runtime.id);

/** One <li> per stored script: its name, and an icon-only delete. Never
 * renders the code itself here — a pasted script can be long, and this
 * list is for recognising WHICH scripts exist, not re-reading them. */
function ynRenderUserScriptsList(entries) {
  const list = document.getElementById("user-scripts-list");
  if (!list) return;
  list.textContent = "";
  for (const entry of Array.isArray(entries) ? entries : []) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${entry.name} (${(entry.matches || []).length} site${
      (entry.matches || []).length === 1 ? "" : "s"
    })`;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "quiet";
    del.setAttribute("aria-label", `Delete ${entry.name}`);
    del.title = `Delete ${entry.name}`;
    del.innerHTML =
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round"/></svg>';
    del.addEventListener("click", () => ynDeleteUserScript(entry.id));
    li.append(label, del);
    list.append(li);
  }
}

async function ynStoredUserScripts() {
  const got = await chrome.storage.local.get({ [YN_USER_SCRIPTS_KEY]: [] });
  return got[YN_USER_SCRIPTS_KEY] || [];
}

async function ynDeleteUserScript(id) {
  const entries = (await ynStoredUserScripts()).filter((e) => e.id !== id);
  await chrome.storage.local.set({ [YN_USER_SCRIPTS_KEY]: entries });
  await ynRegisterAllUserScripts();
  ynRenderUserScriptsList(entries);
}

/** Add: validated (common/user_scripts.js's own gate), saved, and
 * registered IMMEDIATELY — this section has its own action rather than
 * waiting for the page's shared Save button, since a script only starts
 * working once chrome.userScripts.register has actually run. */
async function ynAddUserScript() {
  const nameEl = document.getElementById("us-name");
  const matchesEl = document.getElementById("us-matches");
  const codeEl = document.getElementById("us-code");
  const msg = document.getElementById("us-msg");
  const entry = {
    id: `us-${Date.now()}`,
    name: nameEl.value.trim(),
    matches: ynParseUserScriptMatches(matchesEl.value),
    code: codeEl.value,
  };
  const check = ynValidateUserScript(entry);
  if (!check.ok) {
    msg.textContent = check.error;
    return;
  }
  const entries = await ynStoredUserScripts();
  if (entries.length >= YN_USER_SCRIPTS_MAX) {
    msg.textContent = `Limit of ${YN_USER_SCRIPTS_MAX} scripts reached. Delete one first.`;
    return;
  }
  entries.push(entry);
  await chrome.storage.local.set({ [YN_USER_SCRIPTS_KEY]: entries });
  const result = await ynRegisterAllUserScripts();
  nameEl.value = "";
  matchesEl.value = "";
  codeEl.value = "";
  msg.textContent = result.ok
    ? `Saved. ${entries.length} script${entries.length === 1 ? "" : "s"} registered.`
    : "Saved, but could not register it yet.";
  ynRenderUserScriptsList(entries);
}

/** Feature-detect chrome.userScripts and show exactly one of the two
 * surfaces: the "off" line + copy icon, or the editable list + form.
 * Re-checked on every options-page open, since the browser's own toggle
 * can change between opens without the extension ever hearing about it. */
async function ynLoadUserScripts() {
  const unavailable = document.getElementById("user-scripts-unavailable");
  const copyBtn = document.getElementById("us-copy-enable-url");
  const available = document.getElementById("user-scripts-available");
  if (!unavailable || !available) return;
  const on = typeof chrome !== "undefined" && !!chrome.userScripts;
  unavailable.hidden = on;
  if (copyBtn) copyBtn.hidden = on;
  available.hidden = !on;
  if (!on) {
    unavailable.textContent = "Enable in chrome://extensions.";
    return;
  }
  ynRenderUserScriptsList(await ynStoredUserScripts());
}

function setupUserScriptsSection() {
  const addBtn = document.getElementById("us-add");
  if (addBtn) addBtn.addEventListener("click", ynAddUserScript);
  const copyBtn = document.getElementById("us-copy-enable-url");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(YN_ENABLE_URL);
      } catch {
        /* clipboard denied — the text line still names where to go */
      }
    });
  }
  void ynLoadUserScripts();
}

export {
  YN_ENABLE_URL,
  ynRenderUserScriptsList,
  ynStoredUserScripts,
  ynDeleteUserScript,
  ynAddUserScript,
  ynLoadUserScripts,
  setupUserScriptsSection,
};
