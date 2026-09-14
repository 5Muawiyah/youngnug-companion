(() => {
  // extension/src/adapters/url_scope/index.js
  function ynUrlScopeSafeUrl(value) {
    try {
      return new URL(String(value || ""));
    } catch {
      return null;
    }
  }
  function ynUrlScopeComparable(value) {
    const url = ynUrlScopeSafeUrl(value);
    if (!url) return "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    url.searchParams.sort();
    return url.href;
  }
  function ynUrlScopeRouteFragment(url) {
    const hash = String(url.hash || "");
    if (hash.startsWith("#/")) return hash.slice(1);
    if (hash.startsWith("#!")) return hash.slice(2);
    return "";
  }
  function ynUrlScopeRouteSegments(url) {
    return `${url.pathname} ${url.search} ${ynUrlScopeRouteFragment(url)}`.toLowerCase().split(/[/?&=#\s]+/).filter(Boolean);
  }
  function ynUrlScopeIdentityTokens(url) {
    const segments = ynUrlScopeRouteSegments(url);
    const pathSegments = url.pathname.toLowerCase().split("/").filter(Boolean);
    const tenantSegment = pathSegments[0] || "";
    const tokens = /* @__PURE__ */ new Set();
    for (const segment of segments) {
      if (segment === tenantSegment) continue;
      if (/^\d{5,}$/.test(segment)) {
        tokens.add(segment);
        continue;
      }
      if (/\d/.test(segment) && /[a-z]/.test(segment) && segment.length >= 6) {
        tokens.add(segment);
        continue;
      }
      if ((segment.match(/-/g) || []).length >= 2 && segment.length >= 12) {
        tokens.add(segment);
      }
    }
    return Array.from(tokens);
  }
  function ynWithinApplicationScope(currentUrl, approvedUrl) {
    if (!currentUrl || !approvedUrl) return false;
    const current = ynUrlScopeSafeUrl(currentUrl);
    const approved = ynUrlScopeSafeUrl(approvedUrl);
    if (!current || !approved) return false;
    if (ynUrlScopeComparable(currentUrl) === ynUrlScopeComparable(approvedUrl) && ynUrlScopeRouteFragment(current) === ynUrlScopeRouteFragment(approved)) {
      return true;
    }
    if (current.hostname.toLowerCase() !== approved.hostname.toLowerCase()) {
      return false;
    }
    const currentPathSegments = current.pathname.toLowerCase().split("/").filter(Boolean);
    const approvedPathSegments = approved.pathname.toLowerCase().split("/").filter(Boolean);
    if (approvedPathSegments.length > 0 && currentPathSegments[0] !== approvedPathSegments[0]) {
      return false;
    }
    const tokens = ynUrlScopeIdentityTokens(approved);
    if (tokens.length) {
      const currentSegments = new Set(ynUrlScopeRouteSegments(current));
      return tokens.some((token) => currentSegments.has(token));
    }
    if (approvedPathSegments.length === 0) return false;
    if (currentPathSegments.length < approvedPathSegments.length) return false;
    for (let index = 0; index < approvedPathSegments.length; index += 1) {
      if (currentPathSegments[index] !== approvedPathSegments[index]) {
        return false;
      }
    }
    return true;
  }
  globalThis.ynUrlScopeSafeUrl = ynUrlScopeSafeUrl;
  globalThis.ynUrlScopeComparable = ynUrlScopeComparable;
  globalThis.ynUrlScopeRouteFragment = ynUrlScopeRouteFragment;
  globalThis.ynUrlScopeRouteSegments = ynUrlScopeRouteSegments;
  globalThis.ynUrlScopeIdentityTokens = ynUrlScopeIdentityTokens;
  globalThis.ynWithinApplicationScope = ynWithinApplicationScope;
})();
if (typeof window !== "undefined") {
  window.ynWithinApplicationScope = globalThis.ynWithinApplicationScope;
  window.ynUrlScopeIdentityTokens = globalThis.ynUrlScopeIdentityTokens;
  window.ynUrlScopeRouteSegments = globalThis.ynUrlScopeRouteSegments;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ynWithinApplicationScope: globalThis.ynWithinApplicationScope,
    ynUrlScopeIdentityTokens: globalThis.ynUrlScopeIdentityTokens,
    ynUrlScopeRouteSegments: globalThis.ynUrlScopeRouteSegments,
  };
}
