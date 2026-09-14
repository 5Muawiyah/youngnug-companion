// content/filler.js, part 1 of 11 — the on-page status overlay, the empty
// report shape and its merge for a resumed multi-step fill, and the
// per-job fill-state persisted between wizard steps. The box itself (shadow
// root, brand chrome, close button) now lives in the ONE shared painter,
// common/overlay_box.js (a bare global, ynOverlayBox — see that file for
// why it is not an ES import). See index.js for the file's full history.

/**
 * Plain status text: one row per line, no collapse. For the full end-of-fill
 * report (with its own percentage + disclosure), see ynOverlayReport in
 * overlay_lines.js — this function stays deliberately simple for the short
 * interim messages (challenge stop, no fill-plan, cancelled) that were never
 * the problem and do not need a summary/detail split.
 */
export function ynOverlay(lines) {
  const body = ynOverlayBox();
  if (!body) return; // student closed the box for this page; paint nothing
  body.textContent = "";
  for (const line of lines) {
    const row = document.createElement("div");
    row.textContent = line;
    body.appendChild(row);
  }
}

export function ynEmptyReport() {
  return {
    filled: [],
    guessed: [],
    unresolved: [],
    skipped_eeo: [],
    skipped_sensitive: [],
    skipped_payment: [],
    skipped_terms: [],
    // Credentials. Every password refusal in the extension used to be a bare
    // `continue`: the field was never written (four independent layers see to
    // that) and the student was told NOTHING, so a form where six fields were
    // deliberately left alone produced a report that mentioned none of them.
    // Silence reads as "it did not notice". A named skip reads as "it
    // refused, on purpose", which is the truth.
    skipped_password: [],
    // The engine has always produced this key (a honeypot lands here) and
    // ynMergeReport dropped it on the floor, because the key was absent from
    // this shape and the merge only carries keys it knows.
    skipped_honeypot: [],
    needs_you: [],
    user_kept: [],
    errors: [],
    // {fieldKey, text, source, verdict, refs, label} — a drafted or
    // reused answer, approved or refused. NEVER written to the DOM by this
    // file; the review screen is the only place a draft's text lands on
    // the page, after the student's own Approve.
    drafts: [],
    // causes/coverage (see engine.js's ynCoverage) deliberately do NOT live
    // here. ynMergeReport below rebuilds every key of this shape as
    // [...(a[k]||[]), ...(b[k]||[])] — an array-concat that would throw the
    // moment either side held the real object ynCoverage returns (a resumed
    // multi-step fill loads a PRIOR step's report from storage, so that is
    // not a hypothetical). causes/coverage are computed fresh, by
    // Object.assign, strictly AFTER the one ynMergeReport call each fill
    // makes — see ynReportOverlayLines and the APPLY_RESULT sends below.
  };
}

export function ynMergeReport(a, b) {
  const out = ynEmptyReport();
  for (const k of Object.keys(out)) {
    out[k] = [...(a[k] || []), ...(b[k] || [])];
  }
  return out;
}

export function ynFillStateKey(jobId, ats, origin) {
  return `fillstate:${jobId}:${ats}:${origin || ""}`;
}

export async function ynLoadFillState(jobId, ats, origin) {
  const key = ynFillStateKey(jobId, ats, origin);
  const bag = await chrome.storage.local.get({ [key]: null });
  return bag[key] || null;
}

export async function ynSaveFillState(state) {
  if (!state || !state.jobId) return;
  const key = ynFillStateKey(state.jobId, state.ats, state.origin);
  // savedAt feeds the storage GC's 14-day TTL.
  await chrome.storage.local.set({ [key]: { ...state, savedAt: Date.now() } });
}

// The ONLY profile keys the local model may map to. A key the
// model invents ("hack.exfil") is dropped by membership check, never filled.
// Text-valued keys only: the LLM rung never touches files, radios,
// checkboxes, EEO, sensitive, passwords or honeypots — those are governed by
// the deterministic guards that run before it.
