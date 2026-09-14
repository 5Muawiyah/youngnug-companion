(() => {
  // extension/src/ui/resolver_ping/index.js
  (() => {
    try {
      if (window.top !== window) return;
      chrome.runtime.sendMessage({
        type: "ATS_PAGE_SEEN",
        url: String(location.href).slice(0, 4096)
      });
    } catch {
    }
  })();
})();
