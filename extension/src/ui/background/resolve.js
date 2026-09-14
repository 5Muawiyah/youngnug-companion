// background.js — the click-time direct-link resolver: pairs an aggregator
// URL the student clicked with the non-aggregator ATS URL it lands on, so
// the job's canonical apply link can be posted server-side. Server-side
// list on the server is authoritative;
// this copy only saves a doomed POST (the API re-checks). 17 entries,
// verbatim.
const YN_AGGREGATOR_HOSTS = [
  "indeed.",
  "linkedin.",
  "reed.co.uk",
  "adzuna.",
  "totaljobs.",
  "cv-library.",
  "ziprecruiter.",
  "glassdoor.",
  "monster.",
  "jobsite.co.uk",
  "s1jobs.",
  "jobserve.",
  "talent.com",
  "jooble.",
  "studentjob.",
  "milkround.",
  "e4s.co.uk",
];

const YN_PENDING_RESOLVE_TTL_MS = 180000; // 3 min pairing window
const YN_PENDING_RESOLVE_GC_MS = 60 * 60 * 1000; // 1 h sweep for orphaned slot
const YN_RESOLVED_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const YN_RESOLVED_MAX = 500;

/** Strip userinfo, enforce http(s), require non-empty host. A URL over 2000
 * chars is REJECTED, never truncated — a truncated URL parses fine but points
 * somewhere else, the exact wrong-link class this feature must never store. */
function ynSanitizeResolveUrl(raw) {
  if (typeof raw !== "string" || !raw) return null;
  if (raw.length > 2000) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname) return null;
  u.username = "";
  u.password = "";
  const out = u.toString();
  if (out.length > 2000) return null;
  return out;
}

function ynHostIsAggregator(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return false;
  for (const d of YN_AGGREGATOR_HOSTS) {
    const dl = String(d).toLowerCase();
    // Mirror the server's matching rule: startswith OR ".{d}" in ".{host}"
    if (h.startsWith(dl) || ("." + h).includes("." + dl)) return true;
  }
  return false;
}

/**
 * PURE pairing decision for ATS_PAGE_SEEN. Test-driven from node.
 * @param {object} pending  the stored pending_resolve {jobId, url, ts, appTabId?}
 * @param {string} seenUrl  the ATS page URL the content script reported
 * @param {number} nowMs
 * @param {number} [senderOpenerTabId]  the ATS tab's chrome.tabs openerTabId —
 *   the tab that OPENED it. Empirically survives target=_blank rel=noreferrer
 *   (scripts/probe_openertabid.py). Used to reject an ATS landing whose tab was
 *   NOT opened by the app tab that recorded this pending click.
 * @returns {{action: "post"|"ignore"|"drop", jobId?: number, url?: string}}
 *   post   — land on a non-aggregator host distinct from the click host
 *   ignore — keep pending (no pending / bad url / aggregator / same host /
 *            opened by a different app tab than the pending click)
 *   drop   — clear pending (stale window)
 */
function ynResolveDecision(pending, seenUrl, nowMs, senderOpenerTabId) {
  if (!pending || typeof pending !== "object") {
    return { action: "ignore" };
  }
  const ts = Number(pending.ts) || 0;
  if (nowMs - ts > YN_PENDING_RESOLVE_TTL_MS) {
    return { action: "drop" };
  }
  const sanitized = ynSanitizeResolveUrl(seenUrl);
  if (!sanitized) {
    return { action: "ignore" };
  }
  let seenHost = "";
  try {
    seenHost = new URL(sanitized).hostname.toLowerCase();
  } catch {
    return { action: "ignore" };
  }
  if (!seenHost) return { action: "ignore" };

  if (ynHostIsAggregator(seenHost)) {
    return { action: "ignore" };
  }

  let pendingHost = "";
  try {
    pendingHost = new URL(String(pending.url || "")).hostname.toLowerCase();
  } catch {
    pendingHost = "";
  }
  if (pendingHost && seenHost === pendingHost) {
    return { action: "ignore" };
  }

  // Two-tab guard: when we know BOTH the app tab that recorded the
  // click (pending.appTabId) AND the tab that opened this ATS page
  // (senderOpenerTabId), require them to match — an ATS landing opened by a
  // DIFFERENT app tab (a different job's click, or an unrelated/organic tab)
  // must not pair with this pending. openerTabId is empirically reliable
  // across target=_blank rel=noreferrer, so this holds for the real click flow;
  // when either is unknown (a legacy pending, or no lineage) we fall back to the
  // time+host guards above rather than break a genuine resolution.
  const appTabId = Number(pending.appTabId);
  const openerTabId = Number(senderOpenerTabId);
  if (
    Number.isFinite(appTabId) &&
    Number.isFinite(openerTabId) &&
    openerTabId !== appTabId
  ) {
    return { action: "ignore" };
  }

  const jobId = Number(pending.jobId);
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return { action: "drop" };
  }
  return { action: "post", jobId, url: sanitized };
}

export {
  YN_AGGREGATOR_HOSTS,
  YN_PENDING_RESOLVE_TTL_MS,
  YN_PENDING_RESOLVE_GC_MS,
  YN_RESOLVED_TTL_MS,
  YN_RESOLVED_MAX,
  ynSanitizeResolveUrl,
  ynHostIsAggregator,
  ynResolveDecision,
};
