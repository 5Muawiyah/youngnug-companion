(() => {
  // extension/src/ui/app_bridge/index.js
  (() => {
    const YN_FANOUT_MAX_TABS = 4;
    const announce = async () => {
      let connected = false;
      let email = "";
      try {
        const s = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
        connected = !!s?.ok;
        email = s?.email || "";
      } catch {
      }
      let version = "unknown";
      try {
        version = chrome.runtime.getManifest().version;
      } catch {
      }
      window.postMessage(
        {
          type: "YN_EXT_READY",
          version,
          connected,
          email,
          maxTabs: YN_FANOUT_MAX_TABS
        },
        window.location.origin
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
      if (msg.type === "YN_EXT_CONNECT" && typeof msg.token === "string" && msg.token) {
        const reply = await chrome.runtime.sendMessage({
          type: "SET_TOKEN",
          token: msg.token,
          apiBase: typeof msg.apiBase === "string" ? msg.apiBase : ""
        });
        window.postMessage(
          {
            type: "YN_EXT_CONNECTED",
            ok: !!reply?.ok,
            email: reply?.email || "",
            apiBaseRejected: !!reply?.apiBaseRejected,
            error: typeof reply?.error === "string" ? reply.error : ""
          },
          window.location.origin
        );
        return;
      }
      if (msg.type === "YN_FANOUT_OPEN") {
        const all = (Array.isArray(msg.tabs) ? msg.tabs : []).filter((t) => t && typeof t === "object").map((t) => ({
          site: String(t.site || "").slice(0, 40),
          url: String(t.url || "").slice(0, 2e3)
        })).filter((t) => t.url.startsWith("https://"));
        const clean = all.slice(0, YN_FANOUT_MAX_TABS);
        const overflow = all.slice(YN_FANOUT_MAX_TABS);
        let reply = null;
        try {
          reply = await chrome.runtime.sendMessage({
            type: "FANOUT_OPEN",
            tabs: clean
          });
        } catch {
        }
        const refused = (Array.isArray(reply?.refused) ? reply.refused : []).map((r) => ({
          site: String(r?.site || "").slice(0, 40),
          reason: String(r?.reason || "").slice(0, 200)
        }));
        for (const t of overflow) {
          refused.push({
            site: t.site,
            reason: `Only ${YN_FANOUT_MAX_TABS} sites open per search, so this one was not opened.`
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
            error: typeof reply?.error === "string" ? reply.error.slice(0, 200) : ""
          },
          window.location.origin
        );
        return;
      }
      if (msg.type === "YN_APPLY_CLICK") {
        const jobId = Number(msg.jobId);
        const href = msg.href;
        if (!Number.isFinite(jobId) || jobId <= 0) return;
        if (typeof href !== "string" || !(href.startsWith("http://") || href.startsWith("https://"))) {
          return;
        }
        try {
          chrome.runtime.sendMessage({
            type: "APPLY_CLICK",
            jobId,
            url: href
          });
        } catch {
        }
      }
    });
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "YN_IMPORT_STATUS") {
        window.postMessage(
          {
            type: "YN_IMPORT_STATUS",
            source: msg.source === "github" ? "github" : "linkedin",
            phase: ["started", "done", "failed"].includes(msg.phase) ? msg.phase : "failed",
            error: typeof msg.error === "string" ? msg.error.slice(0, 300) : "",
            imported: msg.imported && typeof msg.imported === "object" ? msg.imported : {},
            total_imported: Number(msg.total_imported) || 0,
            total_skipped: Number(msg.total_skipped) || 0
          },
          window.location.origin
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
            saved: msg.saved == null || !Number.isFinite(Number(msg.saved)) ? null : Number(msg.saved),
            dupes: msg.dupes == null || !Number.isFinite(Number(msg.dupes)) ? null : Number(msg.dupes),
            failed: msg.failed == null || !Number.isFinite(Number(msg.failed)) ? null : Number(msg.failed),
            ts: Number(msg.ts) || 0
          },
          window.location.origin
        );
      }
    });
    void announce();
  })();
})();
