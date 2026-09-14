// content/heuristics.js, part 2 of 8 - label/identity text SOURCES:
// aria-labelledby/describedby, id-convention and ancestor label
// attributes, shadow-host signal text, data-* identity attributes,
// combined into the MATCHING signal (ynLabelText, deliberately
// permissive) and the human-facing report label (ynHumanFieldLabel,
// quality-gated). See index.js for the file's full header and
// history. ynGroupLegend also lives here (not in labels_b.js, where the
// rest of the group-question/identity helpers sit) because
// ynHumanFieldLabel below calls it and labels_b.js's own helpers call
// ynHumanFieldLabel/ynAriaLabelledByText back — putting ynGroupLegend where
// its only other caller (ynFieldIdentityRaw et al) lives would close that
// loop into a cycle the build refuses.

/**
 * The GROUP question for a radio/checkbox: the nearest <fieldset>'s <legend>,
 * or an aria-labelledby/role=group container's label. For grouped Yes/No
 * radios the question ("Are you eligible to work in the UK?") lives here, not
 * in the per-option label ("Yes"/"No") — so detection MUST see it.
 */
export function ynGroupLegend(el, doc) {
  if (!el || !el.closest) return "";
  try {
    const fs = el.closest("fieldset");
    if (fs) {
      const legend = fs.querySelector("legend");
      if (legend && legend.textContent) {
        return legend.textContent.replace(/\s+/g, " ").trim();
      }
    }
    const grp = el.closest('[role="group"],[role="radiogroup"]');
    if (grp) {
      const lbl = grp.getAttribute("aria-label");
      if (lbl) return lbl.trim();
      const by = grp.getAttribute("aria-labelledby");
      if (by && doc && doc.getElementById) {
        const t = by
          .split(/\s+/)
          .map((id) => (doc.getElementById(id) || {}).textContent || "")
          .join(" ")
          .trim();
        if (t) return t.replace(/\s+/g, " ").trim();
      }
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function ynAriaLabelledByText(el, doc) {
  const ids = (el.getAttribute("aria-labelledby") || "").trim().split(/\s+/);
  if (!ids[0]) return "";
  return ids
    .map((id) => {
      try {
        const n = doc.getElementById(id);
        return n ? (n.textContent || "").trim() : "";
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join(" ");
}

// ─── extra label sources, each gated by the label
// quality filter before it is trusted to feed matching or a report label ──

/** aria-describedby target text — a screen-reader-only description often
 * carries the real question when there is no separate visible <label>. */
export function ynAriaDescribedByText(el, doc) {
  const ids = (el.getAttribute("aria-describedby") || "").trim().split(/\s+/);
  if (!ids[0]) return "";
  const document_ = doc || document;
  return ids
    .map((id) => {
      try {
        const n = document_.getElementById(id);
        return n ? (n.textContent || "").trim() : "";
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join(" ");
}

/**
 * A visible element whose OWN id matches this field's id by naming
 * convention (`crc-label-fname`, `label-fname`, `fname-label`, …) with no
 * `for=` pointing at it — a component library rendering a label sibling
 * without wiring the real for/id pair. Bounded to ids that both name
 * "label" AND contain the field's own id as a token (surrounded by a
 * non-alphanumeric character or a string edge), so a coincidental substring
 * can never fire.
 */
export function ynIdConventionLabel(el, doc) {
  if (!el.id || (el.labels && el.labels.length)) return "";
  const document_ = doc || document;
  try {
    const escFid = el.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("(^|[^a-z0-9])" + escFid + "($|[^a-z0-9])", "i");
    const all = document_.querySelectorAll("[id]");
    for (const node of all) {
      if (node === el) continue;
      const nid = node.id || "";
      if (!nid || !/label/i.test(nid) || !re.test(nid)) continue;
      const t = (node.textContent || "").trim();
      if (t) return t;
    }
  } catch {
    /* ignore */
  }
  return "";
}

/** A "…label…"-named attribute on the element itself — `data-label`,
 * `cx-prop-label`, `lt-prop-label` — held to a stricter bar than a visible
 * label: must contain a letter and none of the punctuation that means it is
 * markup, a template expression or JSON, and never `aria-label` (already
 * read by ynLabelText/ynHumanFieldLabel). */
export function ynLabelAttrOwnText(el) {
  if (!el || !el.attributes) return "";
  for (const attr of el.attributes) {
    const n = (attr.name || "").toLowerCase();
    if (n === "aria-label" || !/label/.test(n)) continue;
    const v = (attr.value || "").trim();
    if (!v || v.length > 140) continue;
    if (!/[a-z]/i.test(v)) continue;
    if (/[{}<>$`|]/.test(v)) continue;
    return v;
  }
  return "";
}

/** ynLabelAttrOwnText walked up a bounded ancestor chain. */
export function ynAncestorLabelAttrText(el, hops) {
  let cur = el;
  for (let i = 0; i < (hops || 3) && cur; i++) {
    const t = ynLabelAttrOwnText(cur);
    if (t) return t;
    cur = cur.parentElement;
  }
  return "";
}

/**
 * Shadow-host attribute fallback: when a field sits inside an OPEN shadow
 * root and carries no other signal, its host element (SmartRecruiters'
 * `spl-input`, `spl-phone-field`, …) often carries the real label as ITS
 * OWN attribute. Walks outward through nested shadow roots (bounded).
 */
export function ynShadowHostSignalText(el, doc) {
  try {
    let cur = el;
    for (let hops = 0; hops < 4 && cur; hops++) {
      const root =
        typeof cur.getRootNode === "function" ? cur.getRootNode() : null;
      // 11 = Node.DOCUMENT_FRAGMENT_NODE — a shadow root is one of these
      // with a non-null .host; a plain document (nodeType 9) stops the walk.
      if (!root || root.nodeType !== 11) break;
      const host = root.host;
      if (!host || typeof host.getAttribute !== "function") break;
      const bits = [
        host.getAttribute("aria-label"),
        host.getAttribute("label"),
        host.getAttribute("placeholder"),
        host.getAttribute("autocomplete"),
        host.getAttribute("name"),
        host.id,
      ]
        .filter(Boolean)
        .join(" ");
      if (bits) return bits;
      cur = host;
    }
  } catch {
    /* ignore */
  }
  return "";
}

/** `data-automation-id` / `data-testid` / `data-qa` — generic cross-site
 * identity tokens (Workday's own convention, adopted informally by many
 * other ATSs) usable on ANY site, not only inside a Workday-specific
 * adapter. */
export function ynDataIdentityText(el) {
  if (!el || typeof el.getAttribute !== "function") return "";
  return [
    el.getAttribute("data-automation-id"),
    el.getAttribute("data-testid"),
    el.getAttribute("data-qa"),
  ]
    .filter(Boolean)
    .join(" ");
}

export function ynLabelText(el, doc) {
  const bits = [];
  if (el.labels && el.labels.length) {
    for (const lab of el.labels) bits.push(lab.textContent || "");
  } else if (el.id) {
    try {
      const lab = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) bits.push(lab.textContent || "");
    } catch {
      /* ignore */
    }
  }
  bits.push(el.getAttribute("aria-label") || "");
  bits.push(ynAriaLabelledByText(el, doc));
  bits.push(el.getAttribute("placeholder") || "");
  bits.push(el.name || "");
  bits.push(el.id || "");
  bits.push(el.getAttribute("autocomplete") || "");
  // the five extra sources, each gated by ynIsUsableLabel
  // (common/label_quality.js, loaded earlier in the click-time
  // stack) so a cryptic attribute value can widen matching no more than a
  // cryptic id already could.
  const usable = (s) =>
    typeof ynIsUsableLabel === "function" ? ynIsUsableLabel(s) : Boolean(s);
  const extra = [
    ynAriaDescribedByText(el, doc),
    ynIdConventionLabel(el, doc),
    ynAncestorLabelAttrText(el),
    ynShadowHostSignalText(el, doc),
    ynDataIdentityText(el),
  ];
  for (const s of extra) {
    if (s && usable(s)) bits.push(s);
  }
  return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The HUMAN-FACING label for reports (needs_you / eeo / sensitive / filled
 * rows) — the label quality gate applied to every candidate. Unlike ynLabelText
 * (the MATCHING signal, deliberately permissive: id/name/autocomplete/
 * data-* still feed the pattern ladder even when they read like an
 * identifier) this never surfaces a raw id, a bare attribute token or a
 * widget's own transient text; "" means the caller should show "unlabelled
 * field" instead of guessing.
 */
export function ynHumanFieldLabel(el, doc) {
  const document_ = doc || document;
  const candidates = [];
  if (el.labels && el.labels.length) {
    for (const lab of el.labels) candidates.push(lab.textContent || "");
  } else if (el.id) {
    try {
      const lab = document_.querySelector(
        `label[for="${CSS.escape(el.id)}"]`,
      );
      if (lab) candidates.push(lab.textContent || "");
    } catch {
      /* ignore */
    }
  }
  candidates.push(el.getAttribute("aria-label") || "");
  candidates.push(ynAriaLabelledByText(el, document_));
  candidates.push(ynAriaDescribedByText(el, document_));
  candidates.push(ynIdConventionLabel(el, document_));
  candidates.push(ynAncestorLabelAttrText(el));
  candidates.push(ynShadowHostSignalText(el, document_));
  candidates.push(el.getAttribute("placeholder") || "");
  const t = (el.type || "").toLowerCase();
  if (t === "radio" || t === "checkbox") {
    candidates.push(ynGroupLegend(el, document_));
  }
  if (typeof ynFirstUsableLabel === "function") {
    return ynFirstUsableLabel(candidates);
  }
  for (const c of candidates) {
    if (c && String(c).trim()) return String(c).replace(/\s+/g, " ").trim();
  }
  return "";
}
