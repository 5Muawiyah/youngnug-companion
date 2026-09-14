// background.js — the app-tab broadcast helpers and the durable last-capture
// record (a failed capture used to be one transient popup text line and
// NOTHING else, so a failure was impossible to diagnose afterwards).

/** Broadcast a message to any open YoungNug app tab. Sent to every tab id —
 * only app_bridge.js listens for these types, and the manifest loads that
 * script on the app's own origins alone, so no other page ever receives
 * them. No tab URLs are read (there is no "tabs" permission); tabs without
 * a listener reject and are ignored. Best-effort by design: a failure here
 * never affects the operation being announced. */
async function ynAnnounceToAppTabs(message) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }
  await Promise.all(
    tabs.map((t) =>
      t.id == null
        ? Promise.resolve()
        : chrome.tabs.sendMessage(t.id, message).catch(() => {}),
    ),
  );
}

/** The profile-import state relay (started / done / failed) — the app's
 * import flow gates its Continue on the REAL state instead of proceeding
 * blind. */
async function ynAnnounceImportStatus(source, phase, detail) {
  await ynAnnounceToAppTabs({
    type: "YN_IMPORT_STATUS",
    source,
    phase,
    ...(detail || {}),
  });
}

/** The captured page's host out of a capture job: the reader labels source
 * "capture:<hostname>"; the job url is the fallback read. */
function ynCaptureHostOf(job) {
  const src = String((job && job.source) || "");
  if (src.startsWith("capture:")) {
    return src.slice("capture:".length).slice(0, 120);
  }
  try {
    return new URL(String((job && job.url) || "")).hostname.slice(0, 120);
  } catch {
    return "";
  }
}

/** The durable last-capture record. Every attempt overwrites `lastCapture`
 * in chrome.storage.local — the popup re-shows it on open — and the same
 * entry is broadcast to app tabs as YN_CAPTURE_STATUS (the YN_IMPORT_STATUS
 * relay pattern). Clamped here so nothing unbounded ever lands in storage;
 * a single small key, deliberately outside the GC families. Best-effort:
 * the record must never break the capture it describes. */
async function ynRecordLastCapture(entry) {
  const e = entry && typeof entry === "object" ? entry : {};
  const clamped = {
    ts: Date.now(),
    ok: e.ok === true,
    mode: ["jobview", "serp"].includes(e.mode) ? e.mode : "",
    host: String(e.host || "").slice(0, 120),
    error: String(e.error || "").slice(0, 300),
    duplicate: e.duplicate === true,
    enriched: e.enriched === true,
    // null means "not a batch" — and must stay null (Number(null) is 0)
    saved:
      e.saved == null || !Number.isFinite(Number(e.saved))
        ? null
        : Math.max(0, Number(e.saved)),
    dupes:
      e.dupes == null || !Number.isFinite(Number(e.dupes))
        ? null
        : Math.max(0, Number(e.dupes)),
    failed:
      e.failed == null || !Number.isFinite(Number(e.failed))
        ? null
        : Math.max(0, Number(e.failed)),
  };
  try {
    await chrome.storage.local.set({ lastCapture: clamped });
  } catch {
    /* storage unavailable — the broadcast below may still land */
  }
  await ynAnnounceToAppTabs({ type: "YN_CAPTURE_STATUS", ...clamped });
  return clamped;
}

export { ynAnnounceToAppTabs, ynAnnounceImportStatus, ynCaptureHostOf, ynRecordLastCapture };
