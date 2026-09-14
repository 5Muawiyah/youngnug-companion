(() => {
  // extension/src/common/overlay_box/index.js
  var YN_OVERLAY_ID = "yn-overlay";
  function ynOverlayTheme() {
    const t = typeof YN_THEME !== "undefined" ? YN_THEME : null;
    return {
      primaryDeep: t && t.primaryDeep || "#0a4c3a",
      primaryContrast: t && t.primaryContrast || "#ffffff",
      surface: t && t.surface || "#ffffff",
      ink: t && t.ink || "#12211b",
      border: t && t.border || "#e4ebe6",
      radiusSm: t && t.radiusSm || "12px",
      shadowPop: t && t.shadowPop || "0 2px 4px rgba(18, 33, 27, 0.05), 0 8px 24px rgba(18, 33, 27, 0.1)",
      fontUi: t && t.fontUi || '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    };
  }
  function ynOverlayDismissedSet() {
    if (!globalThis.__ynOverlayDismissed) globalThis.__ynOverlayDismissed = /* @__PURE__ */ new Set();
    return globalThis.__ynOverlayDismissed;
  }
  function ynOverlayIsDismissed() {
    return ynOverlayDismissedSet().has(location.href || "");
  }
  function ynOverlayClearDismissal() {
    ynOverlayDismissedSet().delete(location.href || "");
  }
  function ynOverlayDismiss() {
    ynOverlayDismissedSet().add(location.href || "");
    const host = document.getElementById(YN_OVERLAY_ID);
    if (host) host.remove();
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function" && !globalThis.__ynOverlayEscBound) {
    globalThis.__ynOverlayEscBound = true;
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && document.getElementById(YN_OVERLAY_ID)) {
          ynOverlayDismiss();
        }
      },
      true
    );
  }
  function ynOverlayBottomOffset() {
    const BASE = 16;
    const MARGIN = 12;
    let tallest = 0;
    try {
      const vh = window.innerHeight || 0;
      const vw = window.innerWidth || 0;
      const nodes = document.querySelectorAll("body *");
      let checked = 0;
      for (const el of nodes) {
        if (checked++ > 2e3) break;
        const rect = el.getBoundingClientRect();
        if (rect.height < 8 || rect.height > vh * 0.6) continue;
        if (rect.width < vw * 0.4) continue;
        if (Math.abs(rect.bottom - vh) > 4) continue;
        const position = getComputedStyle(el).position;
        if (position !== "fixed" && position !== "sticky") continue;
        if (rect.height > tallest) tallest = rect.height;
      }
    } catch {
    }
    return tallest > 0 ? Math.round(tallest + MARGIN) : BASE;
  }
  function ynOverlayBuildHost() {
    const theme = ynOverlayTheme();
    const host = document.createElement("div");
    host.id = YN_OVERLAY_ID;
    host.style.cssText = "all:initial;position:fixed;right:16px;z-index:2147483647;bottom:" + ynOverlayBottomOffset() + "px;";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = "<style>:host{all:initial;}*{box-sizing:border-box;}.yn-card{font-family:" + theme.fontUi + ";font-size:13px;line-height:1.5;background:" + theme.surface + ";color:" + theme.ink + ";border:1px solid " + theme.border + ";border-radius:" + theme.radiusSm + ";box-shadow:" + theme.shadowPop + ";width:320px;max-width:calc(100vw - 32px);overflow:hidden;}.yn-head{display:flex;align-items:center;gap:8px;padding:10px 8px 10px 14px;background:" + theme.primaryDeep + ";color:" + theme.primaryContrast + ";}.yn-brand{font-weight:700;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.yn-close{appearance:none;border:0;background:transparent;color:inherit;cursor:pointer;padding:4px 6px;border-radius:6px;line-height:1;font-size:15px;flex:none;}.yn-close:hover,.yn-close:focus-visible{background:rgba(255,255,255,.18);}.yn-close:focus-visible{outline:2px solid " + theme.primaryContrast + ";outline-offset:1px;}.yn-body{padding:10px 14px 12px;}.yn-body:empty{padding:0;}.yn-summary{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;background:transparent;border:0;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer;text-align:left;}.yn-summary:hover,.yn-summary:focus-visible{opacity:.82;}.yn-caret{font-size:11px;opacity:.65;flex:none;}.yn-never{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;opacity:.85;}.yn-detail{margin-top:8px;padding-top:8px;border-top:1px solid " + theme.border + ';display:flex;flex-direction:column;gap:6px;}.yn-detail[hidden]{display:none;}.yn-row{font-size:12px;display:flex;gap:6px;flex-wrap:wrap;}.yn-row-label{font-weight:600;flex:none;}.yn-row-value{opacity:.9;}.yn-never-detail,.yn-percent-detail{font-style:italic;opacity:.85;}</style><div class="yn-card" role="status"><div class="yn-head"><span class="yn-brand">YoungNug</span><button type="button" class="yn-close" aria-label="Close">✕</button></div><div class="yn-body"></div></div>';
    shadow.querySelector(".yn-close").addEventListener("click", () => ynOverlayDismiss());
    host.__ynShadow = shadow;
    return host;
  }
  function ynOverlayBox() {
    if (ynOverlayIsDismissed()) return null;
    let host = document.getElementById(YN_OVERLAY_ID);
    if (!host || !host.__ynShadow) {
      if (host) host.remove();
      host = ynOverlayBuildHost();
    }
    return host.__ynShadow.querySelector(".yn-body");
  }
  globalThis.ynOverlayBox = ynOverlayBox;
  globalThis.ynOverlayClearDismissal = ynOverlayClearDismissal;
})();
