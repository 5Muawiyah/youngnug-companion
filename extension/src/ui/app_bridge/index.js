// content/app_bridge.js — runs ONLY on the YoungNug app's own origin.
// Auto-connect: no manual token paste. The logged-in app page issues a
// scoped account token and hands it here via window.postMessage; this script relays it to the service worker
// which stores it. Origin-checked both ways; nothing is ever read from any
// page that is not the YoungNug app itself.

(() => {
  // At most this many tabs from ONE gesture. A safety property, not a capacity
  // to raise when more sites are registered: "no autonomous multi-tab crawling,
  // one gesture, bounded tabs, all visible" is the standing rule, and eight
  // registered sites do not make eight tabs acceptable. The worker enforces the
  // same bound independently; this copy exists so the bridge can tell the page
  // WHICH sites it had to leave out, which the worker cannot know it dropped.
  //
  // The bound is ANNOUNCED to the page (YN_EXT_READY.maxTabs) so the page can
  // ask the server for exactly the sites this gesture will open.
  const YN_FANOUT_MAX_TABS = 4;

  // announce presence + LIVE connection state so the app only issues a fresh
  // token when one is actually needed (avoids rotating on every page load)
  const announce = async () => {
    let connected = false;
    let email = "";
    try {
      const s = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
      connected = !!s?.ok;
      email = s?.email || "";
    } catch {
      // service worker asleep/unreachable: report not connected
    }
    // Report the real installed version rather than a hardcoded string —
    // a stale install is the actual cause of most "won't connect" reports
    let version = "unknown";
    try {
      version = chrome.runtime.getManifest().version;
    } catch {
      /* context invalidated — version stays "unknown" */
    }
    window.postMessage(
      {
        type: "YN_EXT_READY",
        version,
        connected,
        email,
        maxTabs: YN_FANOUT_MAX_TABS,
      },
      window.location.origin,
    );
  };

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "YN_APP_HELLO") {
      void announce();
      return;
    }
    if (
      msg.type === "YN_EXT_CONNECT" &&
      typeof msg.token === "string" &&
      msg.token
    ) {
      const reply = await chrome.runtime.sendMessage({
        type: "SET_TOKEN",
        token: msg.token,
        apiBase: typeof msg.apiBase === "string" ? msg.apiBase : "",
      });
      // Relay the failure detail too — otherwise a rejected apiBase or a
      // failed verify vanishes here, leaving "Not connected" with no
      // diagnosable cause anywhere.
      window.postMessage(
        {
          type: "YN_EXT_CONNECTED",
          ok: !!reply?.ok,
          email: reply?.email || "",
          apiBaseRejected: !!reply?.apiBaseRejected,
          error: typeof reply?.error === "string" ? reply.error : "",
        },
        window.location.origin,
      );
      return;
    }
    // The web app posts YN_FANOUT_OPEN from the student's own Search all
    // sites click: at most four https search URLs the SERVER's budget just
    // permitted. The worker only ever opens them as ordinary VISIBLE tabs
    // (chrome.tabs.create) against a fixed per-site host allowlist — it
    // never injects into them, never fetches them, and reading a tab stays
    // behind the student's own Companion click on that tab (activeTab).
    // The reply is posted back so the page can say honestly whether tabs
    // opened or the Companion refused.
    if (msg.type === "YN_FANOUT_OPEN") {
      const all = (Array.isArray(msg.tabs) ? msg.tabs : [])
        .filter((t) => t && typeof t === "object")
        .map((t) => ({
          site: String(t.site || "").slice(0, 40),
          url: String(t.url || "").slice(0, 2000),
        }))
        .filter((t) => t.url.startsWith("https://"));
      // At most four tabs from one gesture. That bound is a safety property,
      // not a limit to raise when more sites are added: one click must never
      // become an unbounded burst of tabs.
      //
      // What happens to the rest: this used to be a bare slice(0, 4), so
      // with more than four eligible sites the extras were dropped SILENTLY
      // and their groups sat reading "Open" for tabs never asked for. They
      // are reported back as refusals with their own reason instead.
      //
      // A page that plans within the announced bound never sends more than
      // this, so the overflow below is a backstop for a stale page bundle.
      // Its sentence says only what the bridge KNOWS: the tab was not opened.
      // It must not promise a retry - the bridge cannot tell what the
      // server will permit next time.
      const clean = all.slice(0, YN_FANOUT_MAX_TABS);
      const overflow = all.slice(YN_FANOUT_MAX_TABS);
      let reply = null;
      try {
        reply = await chrome.runtime.sendMessage({
          type: "FANOUT_OPEN",
          tabs: clean,
        });
      } catch {
        /* worker asleep/unreachable — reported below, never thrown here */
      }
      const refused = (
        Array.isArray(reply?.refused) ? reply.refused : []
      ).map((r) => ({
        site: String(r?.site || "").slice(0, 40),
        reason: String(r?.reason || "").slice(0, 200),
      }));
      for (const t of overflow) {
        refused.push({
          site: t.site,
          reason:
            `Only ${YN_FANOUT_MAX_TABS} sites open per search, so this one ` +
            "was not opened.",
        });
      }
      window.postMessage(
        {
          type: "YN_FANOUT_OPENED",
          ok: !!reply?.ok,
          opened: Number(reply?.opened) || 0,
          // Bounded by the number of sites that can exist in one plan, not by
          // the tab bound: a refusal list clamped to four hid the overflow
          // entries this block exists to report.
          refused: refused.slice(0, 16),
          error: typeof reply?.error === "string" ? reply.error.slice(0, 200) : "",
        },
        window.location.origin,
      );
      return;
    }
    // The web app posts YN_APPLY_CLICK when the user clicks Apply.
    // Fire-and-forget — the worker stores a single pending_resolve slot;
    // the extension never navigates or fetches any job-board endpoint.
    if (msg.type === "YN_APPLY_CLICK") {
      const jobId = Number(msg.jobId);
      const href = msg.href;
      if (!Number.isFinite(jobId) || jobId <= 0) return;
      if (
        typeof href !== "string" ||
        !(href.startsWith("http://") || href.startsWith("https://"))
      ) {
        return;
      }
      try {
        chrome.runtime.sendMessage({
          type: "APPLY_CLICK",
          jobId,
          url: href,
        });
      } catch {
        /* fire-and-forget */
      }
    }
  });

  // Worker → app: live profile-import state (YN_IMPORT_STATUS) and the
  // last-capture record (YN_CAPTURE_STATUS). Relayed to the page so the app
  // can reflect the REAL state — the import flow gates its Continue on it,
  // and a capture failure is visible in the product instead of dying with
  // the popup. Only worker-internal messages reach this listener; every
  // field is whitelisted and clamped before it touches the page.
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "YN_IMPORT_STATUS") {
      window.postMessage(
        {
          type: "YN_IMPORT_STATUS",
          source: msg.source === "github" ? "github" : "linkedin",
          phase: ["started", "done", "failed"].includes(msg.phase)
            ? msg.phase
            : "failed",
          error: typeof msg.error === "string" ? msg.error.slice(0, 300) : "",
          imported:
            msg.imported && typeof msg.imported === "object"
              ? msg.imported
              : {},
          total_imported: Number(msg.total_imported) || 0,
          total_skipped: Number(msg.total_skipped) || 0,
        },
        window.location.origin,
      );
      return;
    }
    if (msg.type === "YN_CAPTURE_STATUS") {
      window.postMessage(
        {
          type: "YN_CAPTURE_STATUS",
          ok: msg.ok === true,
          mode: ["jobview", "serp"].includes(msg.mode) ? msg.mode : "",
          host: typeof msg.host === "string" ? msg.host.slice(0, 120) : "",
          error: typeof msg.error === "string" ? msg.error.slice(0, 300) : "",
          duplicate: msg.duplicate === true,
          enriched: msg.enriched === true,
          // null means "not a batch" and must stay null (Number(null) is 0)
          saved:
            msg.saved == null || !Number.isFinite(Number(msg.saved))
              ? null
              : Number(msg.saved),
          dupes:
            msg.dupes == null || !Number.isFinite(Number(msg.dupes))
              ? null
              : Number(msg.dupes),
          failed:
            msg.failed == null || !Number.isFinite(Number(msg.failed))
              ? null
              : Number(msg.failed),
          ts: Number(msg.ts) || 0,
        },
        window.location.origin,
      );
    }
  });

  void announce();
})();
