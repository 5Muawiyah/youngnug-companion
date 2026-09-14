// content/resolver_ping.js — click-time direct-link resolver.
// Top-frame only: pings the worker once with the landing URL. No DOM, no
// fetch, no storage, no listeners. The user's own click did the navigation;
// this script only OBSERVES where it landed.

(() => {
  try {
    if (window.top !== window) return;
    // 4096 headroom on purpose: the worker REJECTS >2000 (never truncates),
    // so an over-long href is detectably dropped, not stored wrong.
    chrome.runtime.sendMessage({
      type: "ATS_PAGE_SEEN",
      url: String(location.href).slice(0, 4096),
    });
  } catch {
    /* swallow — never break the page */
  }
})();
