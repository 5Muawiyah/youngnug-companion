(() => {
  // extension/src/ui/liveness_check/index.js
  async function ynLivenessCheck() {
    try {
      if (window.top !== window) return { ok: false, reason: "not top frame" };
      const host = location.hostname.toLowerCase();
      const site = host.includes("linkedin") ? "linkedin" : host.includes("indeed") ? "indeed" : "";
      if (!site) return { ok: false, reason: "not an allowlisted host" };
      if (await ynStopReason()) return { ok: false, reason: "stopped" };
      if (!await ynUnderCap(site)) {
        return { ok: false, reason: "site toggle off, or the day's cap is spent" };
      }
      const { verdict, evidence } = ynDetectLiveness();
      chrome.runtime.sendMessage({
        type: "LIVENESS_CHECK",
        url: String(location.href).slice(0, 4096),
        verdict,
        evidence: String(evidence || "").slice(0, 300)
      });
      return { ok: true, verdict };
    } catch (e) {
      return { ok: false, reason: String(e).slice(0, 200) };
    }
  }
  globalThis.ynLivenessCheck = ynLivenessCheck;
})();
