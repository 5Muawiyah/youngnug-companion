(() => {
  // extension/src/ui/options/own_rules_ui.js
  function ynRenderOwnRuleErrors(errors) {
    const box = document.getElementById("own-rules-errors");
    if (!box) return;
    const list = Array.isArray(errors) ? errors : [];
    if (!list.length) {
      box.hidden = true;
      box.textContent = "";
      return;
    }
    box.textContent = list.map((e) => `Line ${e.line}: ${e.message}`).join(" · ");
    box.hidden = false;
  }
  function ynValidateOwnRulesField() {
    const field = document.getElementById("own-rules-text");
    if (!field || typeof ynParseOwnRules !== "function") return [];
    const { rules, errors } = ynParseOwnRules(field.value);
    ynRenderOwnRuleErrors(errors);
    return rules;
  }
  async function ynLoadOwnRules() {
    const field = document.getElementById("own-rules-text");
    if (!field || typeof YN_OWN_RULES_KEY === "undefined") return;
    const got = await chrome.storage.local.get({ [YN_OWN_RULES_KEY]: "" });
    let text = got[YN_OWN_RULES_KEY] || "";
    if (!text) {
      try {
        const server = await ynApi("/api/extension/settings");
        const body = await server.json();
        if (typeof body.own_rules === "string" && body.own_rules.trim()) {
          text = body.own_rules;
          await chrome.storage.local.set({ [YN_OWN_RULES_KEY]: text });
        }
      } catch {
      }
    }
    field.value = text;
    ynValidateOwnRulesField();
  }
  async function ynSaveOwnRules() {
    const field = document.getElementById("own-rules-text");
    if (!field || typeof YN_OWN_RULES_KEY === "undefined") return;
    const rules = ynValidateOwnRulesField();
    const text = typeof ynSerializeOwnRules === "function" ? ynSerializeOwnRules(rules) : field.value;
    await chrome.storage.local.set({ [YN_OWN_RULES_KEY]: text });
    try {
      const current = await (await ynApi("/api/extension/settings")).json();
      await ynApi("/api/extension/settings", {
        method: "PUT",
        body: JSON.stringify({
          daily_cap: current.daily_cap,
          own_rules: text
        })
      });
    } catch {
    }
  }
  function ynExportOwnRules() {
    const rules = ynValidateOwnRulesField();
    const text = typeof ynSerializeOwnRules === "function" ? ynSerializeOwnRules(rules) : "";
    const blob = new Blob([text + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "youngnug-own-rules.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function ynImportOwnRules(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const field = document.getElementById("own-rules-text");
      if (field) {
        field.value = String(reader.result || "");
        ynValidateOwnRulesField();
      }
    };
    reader.readAsText(file);
  }
  function setupOwnRulesSection() {
    const field = document.getElementById("own-rules-text");
    if (!field) return;
    field.addEventListener("blur", ynValidateOwnRulesField);
    const importBtn = document.getElementById("own-rules-import");
    const fileInput = document.getElementById("own-rules-file");
    if (importBtn && fileInput) {
      importBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        ynImportOwnRules(fileInput.files && fileInput.files[0]);
        fileInput.value = "";
      });
    }
    const exportBtn = document.getElementById("own-rules-export");
    if (exportBtn) exportBtn.addEventListener("click", ynExportOwnRules);
    void ynLoadOwnRules();
  }

  // extension/src/ui/options/user_scripts_ui.js
  var YN_ENABLE_URL = "chrome://extensions/?id=" + (chrome.runtime && chrome.runtime.id);
  function ynRenderUserScriptsList(entries) {
    const list = document.getElementById("user-scripts-list");
    if (!list) return;
    list.textContent = "";
    for (const entry of Array.isArray(entries) ? entries : []) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${entry.name} (${(entry.matches || []).length} site${(entry.matches || []).length === 1 ? "" : "s"})`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "quiet";
      del.setAttribute("aria-label", `Delete ${entry.name}`);
      del.title = `Delete ${entry.name}`;
      del.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
  async function ynAddUserScript() {
    const nameEl = document.getElementById("us-name");
    const matchesEl = document.getElementById("us-matches");
    const codeEl = document.getElementById("us-code");
    const msg = document.getElementById("us-msg");
    const entry = {
      id: `us-${Date.now()}`,
      name: nameEl.value.trim(),
      matches: ynParseUserScriptMatches(matchesEl.value),
      code: codeEl.value
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
    msg.textContent = result.ok ? `Saved. ${entries.length} script${entries.length === 1 ? "" : "s"} registered.` : "Saved, but could not register it yet.";
    ynRenderUserScriptsList(entries);
  }
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
        }
      });
    }
    void ynLoadUserScripts();
  }

  // extension/src/ui/options/index.js
  function paintKill(on) {
    const btn = document.getElementById("kill");
    btn.setAttribute("aria-checked", on ? "true" : "false");
    document.getElementById("kill-state").textContent = on ? "Stopped" : "Running";
  }
  function paintWarning(settings) {
    const box = document.getElementById("warn");
    const parts = [];
    if (settings.serverStop) {
      parts.push(
        "<strong>Stopped from your YoungNug account</strong>Nothing runs until it is lifted on the site."
      );
    }
    if (settings.serverWarning) {
      const safe = settings.serverWarning.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    }
    if (settings) paintWarning(settings);
  }
  document.getElementById("kill").addEventListener("click", async () => {
    const btn = document.getElementById("kill");
    const next = btn.getAttribute("aria-checked") !== "true";
    paintKill(next);
    try {
      await chrome.storage.local.set({ killSwitch: next });
    } catch {
      paintKill(!next);
      document.getElementById("msg").textContent = "Could not save. Still running.";
    }
  });
  document.getElementById("save").addEventListener("click", async () => {
    await chrome.storage.local.set({ token: token.value.trim() });
    await ynSaveOwnRules();
    document.getElementById("msg").textContent = "Saved.";
    setTimeout(() => document.getElementById("msg").textContent = "", 1500);
  });
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
      li.append(
        c.name === "_execute_action" ? "Open the Companion" : c.description || c.name
      );
      list.append(li);
    }
    card.hidden = false;
  }
  load();
  void loadShortcuts();
  setupOwnRulesSection();
  setupUserScriptsSection();
  globalThis.paintKill = paintKill;
  globalThis.paintWarning = paintWarning;
  globalThis.load = load;
  globalThis.loadShortcuts = loadShortcuts;
})();
