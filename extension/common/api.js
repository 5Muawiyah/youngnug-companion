(() => {
  // extension/src/common/api/index.js
  async function ynSettings() {
    const d = {
      // Local backend by default. Point it at a hosted YoungNug instance from the options page.
      apiBase: "http://127.0.0.1:8000",
      token: "",
      killSwitch: false,
      // Assist mode (a per-site on/off toggle) is deleted as a concept:
      // every capped reader runs wherever it always ran, subject only to
      // this ONE shared daily page cap — no per-site switch anywhere.
      dailyCap: 40,
      // Server-held per-user settings, cached by the worker from
      // GET /api/extension/settings ({..., fetchedAt}). null until the first
      // successful fetch; a failed refresh keeps the last good copy.
      serverSettings: null,
      // Local Ollama field-mapping — default OFF; user/dev Options toggle.
      // Never a paid API. Worker no-ops unless ollamaEnabled === true.
      ollamaEnabled: false,
      ollamaModel: "qwen2.5:7b"
    };
    const s = { ...d, ...await chrome.storage.local.get(d) };
    s.serverStop = false;
    s.serverWarning = "";
    const srv = s.serverSettings;
    if (srv && typeof srv === "object") {
      if (Number.isFinite(Number(srv.dailyCap))) {
        s.dailyCap = Math.min(200, Math.max(1, Number(srv.dailyCap)));
      }
      s.serverStop = srv.stop === true;
      s.serverWarning = typeof srv.warning === "string" ? srv.warning.trim().slice(0, 300) : "";
    }
    delete s.serverSettings;
    return s;
  }
  async function ynStopReason(settings) {
    const s = settings || await ynSettings();
    if (s.killSwitch) return "YoungNug: kill switch on";
    if (s.serverStop) return "YoungNug: stopped from your YoungNug account";
    return "";
  }
  async function ynApi(path, options = {}) {
    const s = await ynSettings();
    const stop = await ynStopReason(s);
    const { allowWhileServerStopped, ...init } = options;
    const bypass = allowWhileServerStopped === true && !s.killSwitch;
    if (stop && !bypass) throw new Error(stop);
    const resp = await fetch(s.apiBase + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${s.token}`,
        ...init.headers || {}
      }
    });
    if (!resp.ok) {
      let detail = "";
      try {
        const body = await resp.json();
        if (body && body.detail)
          detail = typeof body.detail === "string" ? body.detail : (
            // structured details (cap/paywall 402s) carry a human message —
            // show THAT, not raw JSON
            body.detail.message || JSON.stringify(body.detail)
          );
      } catch {
      }
      throw new Error(
        `YoungNug API ${path}: HTTP ${resp.status}` + (detail ? `: ${detail.slice(0, 200)}` : "")
      );
    }
    return resp;
  }
  async function ynUnderCap(site) {
    const s = await ynSettings();
    const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const key = `cap:${site}:${day}`;
    const cur = (await chrome.storage.local.get({ [key]: 0 }))[key];
    if (cur >= s.dailyCap) return false;
    await chrome.storage.local.set({ [key]: cur + 1 });
    return true;
  }
  var ynJitter = (ms = 800) => new Promise((r) => setTimeout(r, ms + Math.random() * ms));
  var ynText = (el) => el ? el.textContent.trim().replace(/\s+/g, " ") : "";
  globalThis.ynSettings = ynSettings;
  globalThis.ynStopReason = ynStopReason;
  globalThis.ynApi = ynApi;
  globalThis.ynUnderCap = ynUnderCap;
  globalThis.ynJitter = ynJitter;
  globalThis.ynText = ynText;
})();
