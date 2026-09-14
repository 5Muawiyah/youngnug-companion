// background.js — the auth/status message group: SET_TOKEN (the app's
// auto-connect handoff), GET_STATUS (the popup's live connection check).
// See dispatch.js for how handle() tries each message group in turn.
import { ynSyncServerSettings } from "./settings_sync.js";

async function ynHandleAuthMessages(msg, sender) {
  switch (msg.type) {
    case "SET_TOKEN": {
      // Auto-connect: the logged-in app page hands over a fresh scoped
      // token via content/app_bridge.js — no manual paste. Verify it works
      // before storing so a bad handoff never looks "connected".
      // msg.apiBase arrives RELAYED from
      // window.postMessage and was stored unvalidated — any page the bridge
      // matches could poison it and redirect ALL API traffic (bearer token +
      // PII) to an attacker host, and a FAILED verify still left the poisoned
      // base behind (rollback restored only the token). Now: (1) apiBase must
      // match a hard allowlist — the production origin or the repo's own
      // loopback dev ports — else it is IGNORED (the old base stays);
      // (2) rollback restores BOTH token and apiBase.
      const YN_API_BASE_ALLOW =
        /^(https:\/\/youngnug\.com|http:\/\/(localhost|127\.0\.0\.1):(8000|8010))\/?$/;
      const update = { token: msg.token };
      let apiBaseRejected = false;
      if (msg.apiBase) {
        if (YN_API_BASE_ALLOW.test(String(msg.apiBase))) {
          update.apiBase = String(msg.apiBase).replace(/\/$/, "");
        } else {
          apiBaseRejected = true;
        }
      }
      const previous = await chrome.storage.local.get({
        token: "",
        apiBase: "",
      });
      await chrome.storage.local.set(update);
      try {
        const r = await ynApi("/api/me");
        const me = await r.json();
        // A fresh connection is the moment the user's server-held Companion
        // settings become fetchable — refresh the cache (best-effort).
        void ynSyncServerSettings();
        return { ok: true, email: me.email, apiBaseRejected };
      } catch (e) {
        // a failed verify must not leave the bad token OR base persisted
        const rollback = { token: previous.token };
        if (update.apiBase !== undefined) rollback.apiBase = previous.apiBase;
        await chrome.storage.local.set(rollback);
        return { ok: false, error: String(e), apiBaseRejected };
      }
    }
    case "GET_STATUS": {
      // live connection check — token presence alone is NOT "connected".
      // Every branch carries killSwitch + apiBase — the failure
      // branch used to omit killSwitch, so the popup's checkbox looked OFF
      // in exactly the state where the kill switch WAS the cause. The same
      // reasoning now covers the account-level stop and its
      // warning: the popup cannot show a state it is never told about, and
      // the branch that omits one is always the branch where it mattered.
      // The three stop/warning keys are spelled out in EVERY branch rather
      // than spread from one object: a pin reads this handler as text and
      // requires each branch to name killSwitch, because the branch that
      // dropped it was the failure branch — the one state where the switch
      // was the cause.
      const s = await ynSettings();
      if (!s.token) {
        return {
          ok: false,
          error: "no token",
          apiBase: s.apiBase,
          killSwitch: s.killSwitch,
          serverStop: s.serverStop,
          warning: s.serverWarning,
        };
      }
      try {
        const r = await ynApi("/api/me");
        const me = await r.json();
        // Every live status check also refreshes the cached server-held
        // Companion settings (best-effort — a failure keeps the cache and
        // never delays or breaks the status answer).
        void ynSyncServerSettings();
        return {
          ok: true,
          email: me.email,
          // Greeting name — None/undefined when the account has none yet;
          // the popup falls back to email, same posture as the site.
          first_name: me.first_name,
          // role gates employer-only popup surfaces (the Indeed posting
          // section); students never see them.
          role: me.role,
          apiBase: s.apiBase,
          killSwitch: s.killSwitch,
          serverStop: s.serverStop,
          warning: s.serverWarning,
        };
      } catch (e) {
        return {
          ok: false,
          error: String(e),
          apiBase: s.apiBase,
          killSwitch: s.killSwitch,
          serverStop: s.serverStop,
          warning: s.serverWarning,
        };
      }
    }
    default:
      return undefined;
  }
}

export { ynHandleAuthMessages };
