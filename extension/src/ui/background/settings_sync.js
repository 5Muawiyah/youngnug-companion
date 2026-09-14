// background.js — refresh the cached copy of the user's SERVER-held
// Companion settings (the daily page cap, edited at youngnug.com/settings).
// Assist mode (a per-site on/off toggle) is deleted as a concept: every
// reader that used to be gated by it runs wherever it always ran, subject
// only to the shared daily cap.

/**
 * Best-effort by contract: a failed fetch (offline, dead token, kill switch
 * — ynApi throws before any network call while it is on) keeps the last
 * good cache, and ynSettings() in common/api.js merges the cache over the
 * local defaults so every consumer picks the values up unchanged.
 * killSwitch is NEVER part of what is cached: it stays purely local.
 */
async function ynSyncServerSettings() {
  try {
    const r = await ynApi("/api/extension/settings", {
      // The one call allowed through an ACCOUNT-level stop (never through
      // the local kill switch) — it is the call that lifts one.
      allowWhileServerStopped: true,
    });
    const s = await r.json();
    const cached = { fetchedAt: Date.now() };
    if (Number.isFinite(Number(s.daily_cap))) {
      cached.dailyCap = Number(s.daily_cap);
    }
    // The account-level stop and warning for THIS account. Absent from the
    // payload means not stopped and not warned — which is how a stop is
    // lifted, so it can never become a one-way door. A server that does
    // not send these keys reads as "no stop, no warning" and nothing
    // changes. The whole cache is replaced on every
    // successful sync and KEPT on a failed one, so a Companion that goes
    // offline neither forgets a stop nor invents one.
    cached.stop = s.companion_stop === true;
    cached.warning =
      typeof s.companion_warning === "string"
        ? s.companion_warning.trim().slice(0, 300)
        : "";
    await chrome.storage.local.set({ serverSettings: cached });
  } catch {
    /* keep the cached copy — a sync failure must never break anything */
  }
}

export { ynSyncServerSettings };
