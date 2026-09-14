// content/engine.js, part 1 of 9 — pause/timer helpers, adapter-safety
// label/usable helpers, and the honeypot (hidden/bot-trap field) guard.
// ynAdaFindAll and window.getComputedStyle are used exactly as the
// single-file version used them: ynAdaFindAll is a content/dom_fill_kit.js
// global, referenced here as a bare name resolved at runtime, unchanged by
// this split. See index.js for the file's full history.
export function ynEnginePause(ms) {
  return new Promise((resolve) => {
    if (typeof setTimeout === "function") setTimeout(resolve, ms);
    else resolve();
  });
}
export function ynEngineTimer(fn, ms) {
  return typeof setTimeout === "function" ? setTimeout(fn, ms) : null;
}

export function ynAdaIsPassword(el) {
  return el && (el.type || "").toLowerCase() === "password";
}

/**
 * Human label for report lists only (not matching). Superset of every adapter's
 * local LabelOf: labels[] → label[for] (deep) → aria-label → data-qa →
 * data-automation-id → name → id, sliced to 80.
 */
export function ynAdaLabelOf(el, doc) {
  if (!el) return "";
  if (el.labels && el.labels.length) {
    return (el.labels[0].textContent || "").trim().slice(0, 80);
  }
  if (el.id) {
    try {
      // deep query so shadow-hosted labels (SmartRecruiters) resolve
      const labs = ynAdaFindAll(doc, `label[for="${CSS.escape(el.id)}"]`);
      if (labs[0]) return (labs[0].textContent || "").trim().slice(0, 80);
    } catch {
      /* ignore */
    }
  }
  return (
    el.getAttribute("aria-label") ||
    el.getAttribute("data-qa") ||
    el.getAttribute("data-automation-id") ||
    el.name ||
    el.id ||
    ""
  )
    .toString()
    .slice(0, 80);
}

/** Profile values that are empty or still marked [CONFIRM …] must not fill. */
export function ynAdaUsable(val) {
  if (val == null || val === "") return false;
  if (typeof val === "string" && /\[CONFIRM/i.test(val)) return false;
  return true;
}

// ─── Honeypot / hidden-field guard (safety-critical) ─────────────────────────
// Filling a bot-trap flags the applicant. Never write into these. autocomplete=
// "off" is NOT a signal (too common). type=file is exempt from pure visibility
// checks — ATS dropzones routinely use opacity:0 / 1×1 absolute file inputs.

/** Bot-trap label phrases (Workday "for robots only", classic hp_* fields, …). */
export const YN_HONEYPOT_PHRASE_RE =
  /do not (fill|enter|use|complete)|for robots? only|leave (this )?(field |it )?blank|if you\W*re (a )?human|bot[\s-]?field|honeypot|hp[_-]/i;

/**
 * Accessible + nearby text used only for honeypot phrase matching.
 * label[for] / labels[] / aria-label / aria-labelledby / placeholder /
 * wrapping label / adjacent sibling / short parent text / name / id.
 */
export function ynHoneypotSignalText(el, doc) {
  if (!el) return "";
  const document_ = doc || document;
  const bits = [];
  try {
    if (el.labels && el.labels.length) {
      for (const lab of el.labels) bits.push(lab.textContent || "");
    }
    if (el.id) {
      try {
        const deep =
          typeof ynAdaFindAll === "function"
            ? ynAdaFindAll(document_, `label[for="${CSS.escape(el.id)}"]`)
            : null;
        if (deep && deep[0]) bits.push(deep[0].textContent || "");
        else {
          const lab = document_.querySelector(
            `label[for="${CSS.escape(el.id)}"]`,
          );
          if (lab) bits.push(lab.textContent || "");
        }
      } catch {
        /* ignore bad id */
      }
    }
    bits.push(el.getAttribute("aria-label") || "");
    const labelledBy = (el.getAttribute("aria-labelledby") || "")
      .trim()
      .split(/\s+/);
    for (const id of labelledBy) {
      if (!id) continue;
      try {
        const n = document_.getElementById(id);
        if (n) bits.push(n.textContent || "");
      } catch {
        /* ignore */
      }
    }
    bits.push(el.getAttribute("placeholder") || "");
    bits.push(el.name || "");
    bits.push(el.id || "");
    try {
      const wrap = el.closest && el.closest("label");
      if (wrap) bits.push(wrap.textContent || "");
    } catch {
      /* ignore */
    }
    // Immediate previous sibling only (e.g. a bare <label> or <span> next to
    // the input). Do NOT walk the form and concatenate sibling fields — that
    // would mark every control as a honeypot when one trap label exists.
    const prev = el.previousElementSibling;
    if (prev) bits.push((prev.textContent || "").slice(0, 240));
    // Direct text nodes on the parent only (not other element children).
    try {
      const parent = el.parentElement;
      if (parent) {
        const own = [];
        for (const child of parent.childNodes) {
          if (child.nodeType === 3) own.push(child.textContent || "");
        }
        bits.push(own.join(" "));
      }
    } catch {
      /* ignore */
    }
  } catch {
    return "";
  }
  return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function ynAriaHiddenSelfOrAncestor(el) {
  let cur = el;
  for (let i = 0; i < 8 && cur; i++) {
    try {
      if (cur.getAttribute && cur.getAttribute("aria-hidden") === "true") {
        return true;
      }
    } catch {
      return true;
    }
    cur = cur.parentElement;
  }
  return false;
}

/**
 * Visibility / off-screen trap. type=file exempt (dropzone opacity:0 / 1px).
 * Walks a few ancestors so a hidden container hides its inputs.
 *
 * Opacity: parse as float and treat < 0.1 as effectively invisible. Attackers
 * use near-zero (e.g. 0.02) precisely because a strict `=== "0"` check misses
 * them. Legitimate fields are opaque (1) or clearly visible (e.g. 0.5);
 * only a real numeric opacity < 0.1 is a trap (NaN/unset/"" → not a trap).
 */
export function ynIsVisuallyHiddenTrap(el) {
  if (!el) return true;
  const type = (el.type || "").toLowerCase();
  if (type === "file") return false;

  let cur = el;
  for (let i = 0; i < 4 && cur; i++) {
    try {
      const st = window.getComputedStyle(cur);
      if (st) {
        if (st.display === "none" || st.visibility === "hidden") return true;
        // Near-zero opacity honeypots (0, 0.02, …) — not a strict string "0"
        const op = parseFloat(st.opacity);
        if (Number.isFinite(op) && op < 0.1) return true;
        if (
          st.clip &&
          st.clip !== "auto" &&
          /rect\s*\(\s*0(px)?\s*,?\s*0/i.test(st.clip)
        ) {
          return true;
        }
        if (
          st.clipPath &&
          st.clipPath !== "none" &&
          /inset\s*\(\s*50%|circle\s*\(\s*0/i.test(st.clipPath)
        ) {
          return true;
        }
      }
    } catch {
      return true; // detached / cross-origin style → skip
    }
    cur = cur.parentElement;
  }

  try {
    // NOTE: do NOT use offsetParent===null as a hidden signal — it returns null
    // for VISIBLE elements inside a shadow root (Ashby/SmartRecruiters fields),
    // which false-flagged real fields as honeypots and dropped live fills
    // (Ashby 5->2). display:none/visibility:hidden/opacity:0 are already caught
    // by the getComputedStyle ancestor walk above, and a truly-hidden element
    // has a 0x0 box below — so offsetParent adds nothing but the shadow hazard.
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return true;
    if (rect.right < 0 || rect.bottom < 0) return true;
    // large negative left/top (classic off-screen honeypots)
    if (rect.left < -500 || rect.top < -500) return true;
  } catch {
    return true;
  }
  return false;
}

// ─── occlusion check via elementFromPoint ────────────────────
// A field can be CSS-visible (non-zero rect, opacity 1, no display:none) and
// still sit under a cookie banner, a modal or an off-canvas drawer — none of
// ynIsVisuallyHiddenTrap's checks catch that, because the field's OWN box is
// fine; something else is simply drawn on top of it. Sampling a few points
// on the field's rect and asking the page what is actually ON TOP catches
// this class directly.
//
// lifted from https://github.com/superfill-ai/superfill.ai/blob/8f2f45117245092164406063ef033374f2b2236d/src/entrypoints/content/lib/field-analyzer.ts#L106-L161 (MIT, Phase 1 self-hosted path — see NOTICES.md), adapted
// — the "sample points on the rect, compare the top hit to the field itself"
// technique (isTopElement) is superfill.ai's; this rewrite samples three
// points instead of one, is shadow-root aware via getRootNode(), and FAILS
// OPEN (never occluded) whenever the environment has no elementFromPoint at
// all — jsdom, this codebase's own test harness, does not implement it — so
// every existing fixture is completely unaffected and this check can only
// ADD refusals where a real browser's elementFromPoint says something else
// is on top.
/**
 * The element actually on top of el at up to three sampled points on its
 * own rect (centre + two corners), or null when the check cannot be
 * performed in this environment (no elementFromPoint, or a zero-size rect
 * already caught elsewhere) — null means "cannot verify", never "occluded".
 */
export function ynFieldTopHitElements(el, doc) {
  const document_ = doc || document;
  if (typeof document_.elementFromPoint !== "function") return null;
  let rect;
  try {
    rect = el.getBoundingClientRect();
  } catch {
    return null;
  }
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  const points = [
    [rect.left + rect.width / 2, rect.top + rect.height / 2],
    [rect.left + Math.min(2, rect.width / 4), rect.top + Math.min(2, rect.height / 4)],
    [rect.right - Math.min(2, rect.width / 4), rect.bottom - Math.min(2, rect.height / 4)],
  ];
  const hits = [];
  for (const [x, y] of points) {
    try {
      // Shadow-root aware: ask the field's OWN root first (a shadow root's
      // elementFromPoint sees only its own composed content), falling back
      // to the document when el is not inside one.
      const root =
        (typeof el.getRootNode === "function" && el.getRootNode()) ||
        document_;
      const finder =
        root && typeof root.elementFromPoint === "function"
          ? root
          : document_;
      hits.push(finder.elementFromPoint(x, y) || null);
    } catch {
      hits.push(null);
    }
  }
  return hits;
}

/**
 * True when some OTHER element (not el, not an ancestor or descendant of
 * el) sits on top of el at every sampled point that returned a hit. A point
 * with no hit at all (null) is not evidence of occlusion — only a REAL
 * different element counts.
 */
export function ynIsOccludedField(el, doc) {
  const hits = ynFieldTopHitElements(el, doc);
  if (!hits) return false; // cannot verify in this environment — fail open
  let sawHit = false;
  for (const hit of hits) {
    if (!hit) continue;
    sawHit = true;
    if (hit === el) continue;
    try {
      if (el.contains && el.contains(hit)) continue; // an inner decoration
      if (hit.contains && hit.contains(el)) continue; // a wrapping label etc.
    } catch {
      continue;
    }
    return true; // a genuinely different element sits on top
  }
  return sawHit ? false : false;
}

/**
 * True when the field must NEVER be filled (hidden, off-screen, occluded,
 * bot-trap label). Defensive: any throw / detached node → treat as skip.
 */
export function ynIsHoneypot(el, doc) {
  if (!el) return true;
  try {
    if (el.isConnected === false) return true;
    const type = (el.type || "").toLowerCase();
    if (type === "hidden") return true;
    if (ynAriaHiddenSelfOrAncestor(el)) return true;
    if (ynIsVisuallyHiddenTrap(el)) return true;
    if (ynIsOccludedField(el, doc)) return true;
    const signal = ynHoneypotSignalText(el, doc);
    if (signal && YN_HONEYPOT_PHRASE_RE.test(signal)) return true;
    return false;
  } catch {
    return true;
  }
}

/** Alias used by callers that want a single "do not write" predicate. */
export function ynShouldSkipField(el, doc) {
  return ynIsHoneypot(el, doc);
}
