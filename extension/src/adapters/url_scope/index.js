// content/adapters/url_scope.js — client-side URL identity-token scope
// check for multi-step wizards. A fill approved for one job must
// never continue writing after the page redirects to a different job or a
// different tenant on the same ATS host — this is the pure decision function
// for that rule; nothing here reads or writes fillstate itself.
//
// Two call sites want this, in other files: filler.js's
// fillstate load (compare the current URL to the plan's approved URL before
// applying executed keys, ~filler.js:58-73) and popup.js's ynMatchJobToTab
// (popup.js:659-761). Both are a one-line call into ynWithinApplicationScope
// below; wiring them in is a separate change to those two files.

// lifted from https://github.com/Kerrylala/resume_jobs_quick_apply/blob/22d0ee7d8391dc297346c3ed9f810082b5daf353/extensions/application_assistant/executor_core.js#L149-L155 (MIT), adapted
function ynUrlScopeSafeUrl(value) {
  try {
    return new URL(String(value || ""));
  } catch {
    return null;
  }
}

// lifted from https://github.com/Kerrylala/resume_jobs_quick_apply/blob/22d0ee7d8391dc297346c3ed9f810082b5daf353/extensions/application_assistant/executor_core.js#L182-L189 (MIT), adapted
function ynUrlScopeComparable(value) {
  const url = ynUrlScopeSafeUrl(value);
  if (!url) return "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  url.searchParams.sort();
  return url.href;
}

// A fragment that IS the SPA route ("#/job/123", "#!/apply/456") carries
// application identity; a plain anchor ("#cv-fields") is cosmetic.
// lifted from https://github.com/Kerrylala/resume_jobs_quick_apply/blob/22d0ee7d8391dc297346c3ed9f810082b5daf353/extensions/application_assistant/executor_core.js#L191-L198 (MIT), adapted
function ynUrlScopeRouteFragment(url) {
  const hash = String(url.hash || "");
  if (hash.startsWith("#/")) return hash.slice(1);
  if (hash.startsWith("#!")) return hash.slice(2);
  return "";
}

// lifted from https://github.com/Kerrylala/resume_jobs_quick_apply/blob/22d0ee7d8391dc297346c3ed9f810082b5daf353/extensions/application_assistant/executor_core.js#L200-L209 (MIT), adapted
function ynUrlScopeRouteSegments(url) {
  return `${url.pathname} ${url.search} ${ynUrlScopeRouteFragment(url)}`
    .toLowerCase()
    .split(/[/?&=#\s]+/)
    .filter(Boolean);
}

// The tokens that identify THIS application, extracted from the approved
// URL's route. Only identifier-shaped segments qualify: a digit run of 5+
// (job ids), a mixed segment containing digits (uuids, "7958409-role"), or a
// long multi-hyphen role slug. Plain dictionary words ("marketing",
// "engineer") and the tenant segment never count.
// lifted from https://github.com/Kerrylala/resume_jobs_quick_apply/blob/22d0ee7d8391dc297346c3ed9f810082b5daf353/extensions/application_assistant/executor_core.js#L211-L229 (MIT), adapted
function ynUrlScopeIdentityTokens(url) {
  const segments = ynUrlScopeRouteSegments(url);
  const pathSegments = url.pathname.toLowerCase().split("/").filter(Boolean);
  const tenantSegment = pathSegments[0] || "";
  const tokens = new Set();
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

/**
 * True when `currentUrl` is still within the application the student
 * approved at `approvedUrl`: same URL (ignoring a cosmetic hash), or same
 * host AND same first path segment (tenant pinning on shared ATS hosts like
 * jobs.lever.co/<company>) AND — when the approved URL carries an identity
 * token — that token present as a WHOLE segment of the current route.
 * A token-less approved URL falls back to a segment-boundary path prefix,
 * never empty, so a root URL never widens scope to the whole site.
 *
 * lifted from https://github.com/Kerrylala/resume_jobs_quick_apply/blob/22d0ee7d8391dc297346c3ed9f810082b5daf353/extensions/application_assistant/executor_core.js#L241-L268 (MIT), adapted
 */
function ynWithinApplicationScope(currentUrl, approvedUrl) {
  if (!currentUrl || !approvedUrl) return false;
  const current = ynUrlScopeSafeUrl(currentUrl);
  const approved = ynUrlScopeSafeUrl(approvedUrl);
  if (!current || !approved) return false;
  if (
    ynUrlScopeComparable(currentUrl) === ynUrlScopeComparable(approvedUrl) &&
    ynUrlScopeRouteFragment(current) === ynUrlScopeRouteFragment(approved)
  ) {
    return true;
  }
  if (current.hostname.toLowerCase() !== approved.hostname.toLowerCase()) {
    return false;
  }
  const currentPathSegments = current.pathname
    .toLowerCase()
    .split("/")
    .filter(Boolean);
  const approvedPathSegments = approved.pathname
    .toLowerCase()
    .split("/")
    .filter(Boolean);
  // Tenant pinning: the first path segment scopes the tenant on shared ATS
  // hosts; on single-tenant sites it is the section, equally worth pinning.
  if (
    approvedPathSegments.length > 0 &&
    currentPathSegments[0] !== approvedPathSegments[0]
  ) {
    return false;
  }
  const tokens = ynUrlScopeIdentityTokens(approved);
  if (tokens.length) {
    const currentSegments = new Set(ynUrlScopeRouteSegments(current));
    return tokens.some((token) => currentSegments.has(token));
  }
  // Token-less approved URL: segment-boundary prefix, never empty.
  if (approvedPathSegments.length === 0) return false;
  if (currentPathSegments.length < approvedPathSegments.length) return false;
  for (let index = 0; index < approvedPathSegments.length; index += 1) {
    if (currentPathSegments[index] !== approvedPathSegments[index]) {
      return false;
    }
  }
  return true;
}

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynUrlScopeSafeUrl = ynUrlScopeSafeUrl;
globalThis.ynUrlScopeComparable = ynUrlScopeComparable;
globalThis.ynUrlScopeRouteFragment = ynUrlScopeRouteFragment;
globalThis.ynUrlScopeRouteSegments = ynUrlScopeRouteSegments;
globalThis.ynUrlScopeIdentityTokens = ynUrlScopeIdentityTokens;
globalThis.ynWithinApplicationScope = ynWithinApplicationScope;
