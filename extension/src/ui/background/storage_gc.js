// background.js — Storage GC. Nothing else in the extension removes keys,
// so without this the fillstate:* / fieldmap:* / cap:* / resolved:*
// families grow in chrome.storage.local forever. Runs at every service-
// worker startup — MV3 workers restart constantly, so this is effectively
// continuous. Bounds: cap:* keeps today+yesterday only (they are daily
// counters); fillstate:* keeps 14 days (resume-convenience — losing one
// regenerates on the next fill; entries without savedAt are legacy and
// prunable); fieldmap:* keeps the newest 200 by touchedAt (untouched-stamp
// = oldest). resolved:* TTL 30d by savedAt + newest-500; pending_resolve >1h.
import { YN_PENDING_RESOLVE_GC_MS, YN_RESOLVED_TTL_MS, YN_RESOLVED_MAX } from "./resolve.js";

const YN_FILLSTATE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const YN_FIELDMAP_MAX = 200;

async function ynStorageGc() {
  try {
    const all = await chrome.storage.local.get(null);
    const toRemove = [];
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const fieldmaps = [];
    const resolveds = [];
    for (const [key, val] of Object.entries(all)) {
      if (key.startsWith("cap:")) {
        const day = key.slice(key.lastIndexOf(":") + 1);
        if (day !== today && day !== yesterday) toRemove.push(key);
      } else if (key.startsWith("fillstate:")) {
        const savedAt = val && typeof val === "object" ? val.savedAt : null;
        if (!savedAt || Date.now() - savedAt > YN_FILLSTATE_TTL_MS) {
          toRemove.push(key);
        }
      } else if (key.startsWith("fieldmap:")) {
        fieldmaps.push([key, (val && val.touchedAt) || 0]);
      } else if (key.startsWith("resolved:")) {
        // TTL 30 days by savedAt, then newest-YN_RESOLVED_MAX.
        const savedAt = val && typeof val === "object" ? val.savedAt : null;
        if (!savedAt || Date.now() - savedAt > YN_RESOLVED_TTL_MS) {
          toRemove.push(key);
        } else {
          resolveds.push([key, savedAt]);
        }
      } else if (key === "pending_resolve") {
        const ts = val && typeof val === "object" ? val.ts : null;
        if (!ts || Date.now() - ts > YN_PENDING_RESOLVE_GC_MS) {
          toRemove.push(key);
        }
      }
    }
    if (fieldmaps.length > YN_FIELDMAP_MAX) {
      fieldmaps.sort((a, b) => b[1] - a[1]); // newest first
      for (const [key] of fieldmaps.slice(YN_FIELDMAP_MAX)) toRemove.push(key);
    }
    if (resolveds.length > YN_RESOLVED_MAX) {
      resolveds.sort((a, b) => b[1] - a[1]); // newest first
      for (const [key] of resolveds.slice(YN_RESOLVED_MAX)) toRemove.push(key);
    }
    if (toRemove.length) await chrome.storage.local.remove(toRemove);
  } catch {
    // GC is best-effort; a failed sweep must never break the worker.
  }
}

ynStorageGc();

export { YN_FILLSTATE_TTL_MS, YN_FIELDMAP_MAX, ynStorageGc };
