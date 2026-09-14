"use strict";
(() => {
  // extension/src/common/liveness_markers/index.js
  var YN_CLOSED_MARKERS_INDEED = ["This job has expired"];
  var YN_CLOSED_MARKERS_LINKEDIN = ["No longer accepting applications"];
  var YN_CLOSED_MARKERS_BY_HOST = {
    "indeed.": YN_CLOSED_MARKERS_INDEED,
    "linkedin.": YN_CLOSED_MARKERS_LINKEDIN
  };
  var YN_CLOSED_MARKERS_CONFIRMED_HOSTS = /* @__PURE__ */ new Set();
  function ynLivenessHostFamily(hostname) {
    const h = String(hostname || "").toLowerCase();
    for (const prefix of Object.keys(YN_CLOSED_MARKERS_BY_HOST)) {
      if (h.startsWith(prefix) || ("." + h).includes("." + prefix)) return prefix;
    }
    return null;
  }
  function ynVisibleText() {
    if (!document.body) return "";
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
    return clone.textContent || "";
  }
  function ynDetectLiveness() {
    try {
      const blocked = ynBlockedReason();
      if (blocked) {
        return { verdict: "could_not_tell", evidence: blocked };
      }
      const text = ynVisibleText();
      if (!text.trim()) {
        return { verdict: "could_not_tell", evidence: "empty page" };
      }
      const family = ynLivenessHostFamily(location.hostname);
      if (!family) {
        return { verdict: "could_not_tell", evidence: "unrecognised page layout" };
      }
      for (const phrase of YN_CLOSED_MARKERS_BY_HOST[family]) {
        if (text.includes(phrase)) {
          if (YN_CLOSED_MARKERS_CONFIRMED_HOSTS.has(family)) {
            return { verdict: "closed", evidence: phrase };
          }
          return {
            verdict: "could_not_tell",
            evidence: "candidate closed phrase not yet confirmed: " + phrase
          };
        }
      }
      return { verdict: "live", evidence: "" };
    } catch {
      return { verdict: "could_not_tell", evidence: "reader error" };
    }
  }
  globalThis.YN_CLOSED_MARKERS_INDEED = YN_CLOSED_MARKERS_INDEED;
  globalThis.YN_CLOSED_MARKERS_LINKEDIN = YN_CLOSED_MARKERS_LINKEDIN;
  globalThis.YN_CLOSED_MARKERS_BY_HOST = YN_CLOSED_MARKERS_BY_HOST;
  globalThis.YN_CLOSED_MARKERS_CONFIRMED_HOSTS = YN_CLOSED_MARKERS_CONFIRMED_HOSTS;
  globalThis.ynLivenessHostFamily = ynLivenessHostFamily;
  globalThis.ynVisibleText = ynVisibleText;
  globalThis.ynDetectLiveness = ynDetectLiveness;
})();
