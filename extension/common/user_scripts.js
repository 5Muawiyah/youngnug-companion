(() => {
  // extension/src/common/user_scripts/index.js
  var YN_USER_SCRIPTS_KEY = "userScripts";
  var YN_USER_SCRIPTS_MAX = 10;
  var YN_USER_SCRIPT_CODE_MAX_CHARS = 2e4;
  function ynParseUserScriptMatches(text) {
    return String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l) => !/^javascript:/i.test(l));
  }
  function ynValidateUserScript(entry) {
    const name = String(entry && entry.name || "").trim();
    const matches = Array.isArray(entry && entry.matches) ? entry.matches : [];
    const code = String(entry && entry.code || "");
    if (!name) return { ok: false, error: "Name this script." };
    if (name.length > 80) return { ok: false, error: "Name is too long." };
    if (!matches.length) return { ok: false, error: "Add at least one site pattern." };
    if (!code.trim()) return { ok: false, error: "The script is empty." };
    if (code.length > YN_USER_SCRIPT_CODE_MAX_CHARS) {
      return { ok: false, error: "The script is too long." };
    }
    return { ok: true };
  }
  function ynUserScriptsToRegistrations(entries) {
    return (Array.isArray(entries) ? entries : []).filter((e) => ynValidateUserScript(e).ok).map((e) => ({
      id: e.id,
      matches: e.matches,
      js: [{ code: e.code }],
      world: "USER_SCRIPT",
      runAt: "document_idle"
    }));
  }
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
          ids: existing.map((s) => s.id)
        });
      }
      const registrations = ynUserScriptsToRegistrations(entries);
      if (registrations.length) {
        await chrome.userScripts.register(registrations);
      }
      return { ok: true, count: registrations.length };
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e) };
    }
  }
  globalThis.YN_USER_SCRIPTS_KEY = YN_USER_SCRIPTS_KEY;
  globalThis.YN_USER_SCRIPTS_MAX = YN_USER_SCRIPTS_MAX;
  globalThis.YN_USER_SCRIPT_CODE_MAX_CHARS = YN_USER_SCRIPT_CODE_MAX_CHARS;
  globalThis.ynParseUserScriptMatches = ynParseUserScriptMatches;
  globalThis.ynValidateUserScript = ynValidateUserScript;
  globalThis.ynUserScriptsToRegistrations = ynUserScriptsToRegistrations;
  globalThis.ynRegisterAllUserScripts = ynRegisterAllUserScripts;
})();
