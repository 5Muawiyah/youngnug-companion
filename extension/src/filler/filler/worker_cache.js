// content/filler.js, part 4 of 11 — the one function that talks to the
// service worker (ynSendWorker) and the per-employer field-map cache it
// reads and writes (selector resolution, profile-key lookup, cache-hit
// intent building, and persisting a heuristic win after a successful
// fill). ynQueryDeep and ynSelectorPath are content/dom_fill_kit.js
// globals, referenced here as bare names exactly as the single-file
// version did. See index.js for the file's full history.
export function ynSendWorker(msg) {
  return new Promise((res) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => {
        if (chrome.runtime.lastError) {
          res({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        res(r);
      });
    } catch (e) {
      res({ ok: false, error: String(e) });
    }
  });
}

/** Resolve a cached CSS selector to a live element; re-verify before use. */
export function ynResolveCachedSelector(selector) {
  if (!selector) return null;
  try {
    const deep =
      typeof ynQueryDeep === "function"
        ? ynQueryDeep(document, selector)
        : [...document.querySelectorAll(selector)];
    return deep[0] || document.querySelector(selector);
  } catch {
    return null;
  }
}

export function ynProfileValueForKey(plan, fieldKey) {
  if (!plan || !fieldKey) return undefined;
  if (typeof ynProfileGet === "function") return ynProfileGet(plan, fieldKey);
  const parts = fieldKey.split(".");
  let cur = plan;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Build intents from field-map cache entries that still match the live DOM.
 * Cache holds heuristic/LLM rungs only (adapters are deterministic).
 */
export function ynIntentsFromCache(cache, plan, claimedEls, executedKeys) {
  const intents = [];
  if (!cache || !cache.fields) return intents;
  for (const [fieldKey, selectorPath] of Object.entries(cache.fields)) {
    if (executedKeys && executedKeys.has(fieldKey)) continue;
    const el = ynResolveCachedSelector(selectorPath);
    if (!el || claimedEls.has(el)) continue;
    const value = ynProfileValueForKey(plan, fieldKey);
    if (value == null || value === "") continue;
    if (typeof value === "string" && /\[CONFIRM/i.test(value)) continue;
    const type = (el.type || "").toLowerCase();
    let kind = "text";
    if ((el.tagName || "").toUpperCase() === "TEXTAREA") kind = "textarea";
    else if ((el.tagName || "").toUpperCase() === "SELECT") kind = "select";
    else if (type === "file") kind = "file";
    else if (type === "checkbox") kind = "checkbox";
    else if (type === "radio") kind = "radio";
    intents.push({
      fieldKey,
      el,
      value: fieldKey === "cv_file" ? { file: "cv" } : value,
      kind,
      confidence: "guessed",
      source: "cache",
      label: fieldKey,
    });
    claimedEls.add(el);
  }
  return intents;
}

/** After heuristic fills, persist successful fieldKey → selectorPath.
 * "unknown" is no longer excluded — a bespoke careers form the
 * heuristics conquered caches under fieldmap:unknown:<employer>, so the
 * user's SECOND visit to the same employer's form reuses the win instead of
 * re-deriving from scratch. Bounded by the GC (newest-200). */
export async function ynCacheHeuristicWins(employer, ats, intents, report) {
  if (!employer || !ats) return;
  const won = new Set(
    [...(report.filled || []), ...(report.guessed || [])].map(
      (e) => e.fieldKey,
    ),
  );
  const fields = {};
  for (const intent of intents) {
    if (intent.source !== "heuristic" && intent.source !== "cache") continue;
    if (!won.has(intent.fieldKey)) continue;
    if (!intent.el) continue;
    // Only single-element, natively-replayable intents may be cached. A
    // date_parts intent spans THREE inputs but carries only the day box in
    // `el`, and an aria_choice intent's `el` is a div — the replay path
    // rebuilds `kind` from the DOM, so a cached entry would later write the
    // whole ISO string into the 2-char day box, or call the native value
    // setter on a div. Both are worse than simply re-deriving next visit.
    if (intent.kind === "date_parts" || intent.kind === "aria_choice") continue;
    const path =
      typeof ynSelectorPath === "function"
        ? ynSelectorPath(intent.el)
        : intent.el.id
          ? `#${intent.el.id}`
          : "";
    if (path) fields[intent.fieldKey] = path;
  }
  if (!Object.keys(fields).length) return;
  // merge with existing cache
  const existing = await ynSendWorker({
    type: "FIELD_MAP_CACHE_GET",
    employer,
    ats,
  });
  const merged = {
    ...(existing?.entry?.fields || {}),
    ...fields,
  };
  await ynSendWorker({
    type: "FIELD_MAP_CACHE_SET",
    employer,
    ats,
    fields: merged,
  });
}

