// common/api.js — YoungNug API client for the companion extension.
// Authenticates to the user's OWN YoungNug account with a scoped token stored in
// options. Politeness: jitter + per-site daily caps. Never sends anything to a
// host other than the configured YoungNug API.

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
    ollamaModel: "qwen2.5:7b",
  };
  const s = { ...d, ...(await chrome.storage.local.get(d)) };
  // The account-level stop and warning, read back from the worker's cache of
  // the per-user settings. Derived here rather than stored on their own so
  // there is exactly one place a stop can come from, and so a stale copy is
  // impossible: they live and die with serverSettings.
  s.serverStop = false;
  s.serverWarning = "";
  // The user's server-held settings override the local defaults, so
  // ynUnderCap / dailyCap consumers pick them up with no call-site changes.
  // killSwitch is NEVER part of serverSettings: the kill switch stays a
  // purely local stop (ynStopReason below throws before any fetch while it
  // is on, and no server payload can clear it).
  const srv = s.serverSettings;
  if (srv && typeof srv === "object") {
    if (Number.isFinite(Number(srv.dailyCap))) {
      s.dailyCap = Math.min(200, Math.max(1, Number(srv.dailyCap)));
    }
    s.serverStop = srv.stop === true;
    s.serverWarning =
      typeof srv.warning === "string" ? srv.warning.trim().slice(0, 300) : "";
  }
  delete s.serverSettings;
  return s;
}

/**
 * "Is the Companion stopped, and why?" — the ONE answer, returned as the
 * message the caller throws, or "" for not stopped.
 *
 * Two stops, deliberately not equivalent:
 *
 *   killSwitch  LOCAL. The student's own switch, held in chrome.storage.local,
 *               checked before any fetch. It needs no network to set, to read
 *               or to obey, which is the whole point: a stop control that
 *               depends on reaching a server is not a stop control. Nothing
 *               the server says can clear it — it is checked FIRST and
 *               returns before the account stop is even looked at.
 *
 *   serverStop  the account-level stop for this account, cached from
 *               GET /api/extension/settings. Honestly a SOFT stop: it can
 *               only ever arrive over the network, so a device that has not
 *               synced since it was raised will not have it, and it degrades
 *               to the last cached value. It is here so one Companion
 *               misbehaving on a live site can be halted from the site;
 *               it is not, and is not sold as, an equal of the local switch.
 */
async function ynStopReason(settings) {
  const s = settings || (await ynSettings());
  if (s.killSwitch) return "YoungNug: kill switch on";
  if (s.serverStop) return "YoungNug: stopped from your YoungNug account";
  return "";
}

async function ynApi(path, options = {}) {
  const s = await ynSettings();
  const stop = await ynStopReason(s);
  // THE ONE EXCEPTION, and only to the account-level stop: the settings
  // sync is the call that LIFTS one. Without this a stop would be a one-way
  // door — the platform could halt every Companion and then have no way to
  // let them go again, because the request that clears the flag is itself
  // blocked by the flag. The LOCAL kill switch is never bypassed: `bypass`
  // requires killSwitch to be off, so a student who stopped the Companion
  // on their own device stays stopped, settings sync included.
  const { allowWhileServerStopped, ...init } = options;
  const bypass = allowWhileServerStopped === true && !s.killSwitch;
  if (stop && !bypass) throw new Error(stop);
  const resp = await fetch(s.apiBase + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s.token}`,
      ...(init.headers || {}),
    },
  });
  if (!resp.ok) {
    // LOUD failures: surface the server's own detail message, never a bare
    // status code and never a silent or blank error
    let detail = "";
    try {
      const body = await resp.json();
      if (body && body.detail)
        detail =
          typeof body.detail === "string"
            ? body.detail
            : // structured details (cap/paywall 402s) carry a human message —
              // show THAT, not raw JSON
              body.detail.message || JSON.stringify(body.detail);
    } catch {
      /* non-JSON body — the status alone will have to do */
    }
    throw new Error(
      `YoungNug API ${path}: HTTP ${resp.status}` +
        (detail ? `: ${detail.slice(0, 200)}` : ""),
    );
  }
  return resp;
}

// No per-site on/off switch any more (assist mode is deleted as a
// concept) — every capped reader runs wherever it always ran, gated only
// by this ONE shared daily page cap, kept per-site so one site's reading
// cannot eat another's budget.
async function ynUnderCap(site) {
  const s = await ynSettings();
  const day = new Date().toISOString().slice(0, 10);
  const key = `cap:${site}:${day}`;
  const cur = (await chrome.storage.local.get({ [key]: 0 }))[key];
  if (cur >= s.dailyCap) return false;
  await chrome.storage.local.set({ [key]: cur + 1 });
  return true;
}

const ynJitter = (ms = 800) =>
  new Promise((r) => setTimeout(r, ms + Math.random() * ms));
const ynText = (el) => (el ? el.textContent.trim().replace(/\s+/g, " ") : "");

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynSettings = ynSettings;
globalThis.ynStopReason = ynStopReason;
globalThis.ynApi = ynApi;
globalThis.ynUnderCap = ynUnderCap;
globalThis.ynJitter = ynJitter;
globalThis.ynText = ynText;
