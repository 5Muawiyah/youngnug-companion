// content/heuristics.js, part 3 of 8 - the report-safe label
// (ynReportableFieldLabel), the field-identity haystack, the group
// legend (fieldset/radiogroup question text), the EEO-section walk
// and the last-resort nearby-text failsafe. See index.js for the
// file's full header and history.
import { YN_EEO_HEADING_RE, YN_SENSITIVE_RE } from "./patterns.js";
import {
  ynAriaLabelledByText,
  ynHumanFieldLabel,
  ynGroupLegend,
} from "./labels_a.js";

/**
 * The label shown to a human in the overlay/report: the quality-gated human
 * label first (ynHumanFieldLabel), then a raw fallback the caller supplies
 * IF it also passes the quality gate, then a domain-specific fallback
 * ("EEO field", "Sensitive field", …), then the generic "unlabelled field".
 * NEVER a raw id or a widget's transient text.
 */
export function ynReportableFieldLabel(el, doc, rawFallback, domainFallback) {
  const human = ynHumanFieldLabel(el, doc);
  if (human) return human.slice(0, 80);
  const fb = String(rawFallback || "").trim();
  if (fb && (typeof ynIsUsableLabel !== "function" || ynIsUsableLabel(fb))) {
    return fb.slice(0, 80);
  }
  return domainFallback || "unlabelled field";
}

/**
 * The label for a whole radio/checkbox GROUP reported as one row (EEO,
 * sensitive): the group's own question text ONLY, quality-gated — it never
 * consults any individual option's own per-widget label the way
 * ynReportableFieldLabel does. That distinction is the whole point here: a
 * Lever-style demographic group wraps each option in its own real
 * `<label>` ("Other ethnic background", "No known disability"), which is a
 * perfectly usable, quality-passing string for THAT option and the wrong
 * text entirely for a row describing what the GROUP as a whole is asking.
 * Callers that scan one option (often `options[0]`) to stand in for a
 * whole fieldset use this, not ynReportableFieldLabel, for exactly that
 * reason — passing the group's own legend/nearby-text question, already
 * computed by the caller, as `question`.
 */
export function ynReportableGroupLabel(question, domainFallback) {
  const q = String(question || "").trim();
  if (q && (typeof ynIsUsableLabel !== "function" || ynIsUsableLabel(q))) {
    return q.slice(0, 80);
  }
  return domainFallback || "unlabelled field";
}

/**
 * Field-identity haystack (additive fallback): name + id + className +
 * placeholder + label text + aria-label + aria-labelledby. Sanitized form
 * strips non-alphanumerics and lowercases (underscore-separated ids match).
 */
export function ynSanitizeIdentity(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function ynFieldIdentityRaw(el, doc, includeClassName) {
  const bits = [];
  bits.push(el.name || "");
  bits.push(el.id || "");
  if (includeClassName !== false) {
    const cls = el.className;
    if (typeof cls === "string") bits.push(cls);
    else if (cls && typeof cls.baseVal === "string") bits.push(cls.baseVal);
  }
  bits.push(el.getAttribute("placeholder") || "");
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
  // The group question (fieldset legend) — load-bearing for Yes/No radios.
  const t = (el.type || "").toLowerCase();
  if (t === "radio" || t === "checkbox") {
    bits.push(ynGroupLegend(el, doc));
  }
  return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Identity signal with _/- normalised to spaces so regex patterns still fire. */
export function ynFieldIdentitySignal(el, doc) {
  return ynFieldIdentityRaw(el, doc)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The field's QUESTION text — everything a human reads as the ask, with CSS
 * class names deliberately excluded.
 *
 * A class name is a styling token, never a question, and letting it reach the
 * EEO/sensitive classifiers is a live-proven false-positive engine: Teamtailor
 * styles every input with Tailwind's `disabled:` variants
 * (`disabled:cursor-not-allowed disabled:opacity-50`), and YN_SENSITIVE_RE's
 * bare `disab` alternative matched that, so First name / Last name / EMAIL were
 * all reported skip:"sensitive" and never filled. Phone escaped only because
 * intl-tel-input rewrites its class list — which is exactly why the platform
 * looked like "name landed, email did not".
 *
 * Mapping still reads className via ynFieldIdentityRaw (that is where
 * name="driving_licence"-style tokens legitimately live). Only the
 * never-fill classifiers are narrowed, so the guards keep firing on real
 * question text — including the group legend, which is where a Yes/No radio's
 * "Do you have an unspent conviction?" actually sits.
 */
export function ynFieldQuestionText(el, doc) {
  const bits = [ynFieldIdentityRaw(el, doc, false)];
  const t = (el.type || "").toLowerCase();
  if (t !== "radio" && t !== "checkbox") {
    // Non-choice controls do not get the legend from ynFieldIdentityRaw, but a
    // sensitive question can still be asked via a fieldset legend above a text
    // input — keep the guard's reach wider than the mapper's.
    bits.push(ynGroupLegend(el, doc));
  }
  return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function ynInEeoSection(el) {
  // The field's OWN label/identity — a standalone demographic question
  // (no EEO fieldset around it) must still be caught. Without this, "How
  // would you describe your ethnicity?" can escape the ancestor-only scan,
  // and a free-text ethnicity input would then take the stored city.
  try {
    const own = (
      el.labels && el.labels.length ? el.labels[0].textContent : ""
    ).concat(
      " ",
      el.getAttribute("aria-label") || "",
      " ",
      el.getAttribute("name") || "",
      " ",
      el.getAttribute("id") || "",
    );
    if (YN_EEO_HEADING_RE.test(own)) return true;
  } catch {
    /* ignore */
  }
  let cur = el;
  for (let i = 0; i < 12 && cur; i++) {
    if (cur.matches && (cur.matches("fieldset") || cur.matches("section"))) {
      const legend =
        cur.querySelector("legend, h1, h2, h3, h4, [role='heading']") || cur;
      const text = (legend.textContent || "").slice(0, 400);
      if (YN_EEO_HEADING_RE.test(text)) return true;
    }
    // also scan a nearby heading sibling / previous heading
    if (cur.previousElementSibling) {
      const prev = cur.previousElementSibling;
      if (
        /^(H[1-6]|LEGEND)$/i.test(prev.tagName) &&
        YN_EEO_HEADING_RE.test(prev.textContent || "")
      ) {
        return true;
      }
    }
    cur = cur.parentElement;
  }
  return false;
}

/**
 * The last-resort failsafe: when NO structured signal (label /
 * aria / autocomplete / name / id / placeholder / input type) identified the
 * field, read the VISIBLE page text nearest it — the fieldset legend (any
 * control kind, not just radio/checkbox), the preceding table cell, previous
 * siblings' short text, the wrapper's own text nodes, then the nearest
 * preceding heading. Bounded walks, read-only, first short hit wins. Long
 * text (>200 chars raw) is prose, not a question label — skipped so a
 * marketing paragraph containing "phone" can never claim a field.
 */
export function ynNearbyText(el, doc) {
  const document_ = doc || document;
  const clip = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  const shortText = (node) => {
    if (!node || !node.textContent) return "";
    if (/^(SCRIPT|STYLE|TEMPLATE)$/i.test(node.tagName || "")) return "";
    const raw = node.textContent.replace(/\s+/g, " ").trim();
    if (!raw || raw.length > 200) return "";
    return clip(raw);
  };
  try {
    // 1. legend / labelled group — extend beyond radio/checkbox.
    const legend = ynGroupLegend(el, document_);
    if (legend && legend.length <= 200) return clip(legend);
    // 2. table layout: the cell before this field's cell in the same row.
    const td = el.closest ? el.closest("td, th") : null;
    if (td && td.previousElementSibling) {
      const t = shortText(td.previousElementSibling);
      if (t) return t;
    }
    // 3. previous siblings of the field, then of its wrappers (2 hops up).
    // A sibling that itself contains a form control belongs to ANOTHER
    // field — stop there rather than steal its question text.
    let scope = el;
    for (let hop = 0; hop < 3 && scope; hop++) {
      let sib = scope.previousElementSibling;
      let steps = 0;
      while (sib && steps < 4) {
        if (
          sib.querySelector &&
          sib.querySelector("input, textarea, select, button")
        ) {
          break;
        }
        const t = shortText(sib);
        if (t) return t;
        sib = sib.previousElementSibling;
        steps += 1;
      }
      const parent = scope.parentElement;
      if (parent) {
        // 4. the wrapper's own direct text nodes (inline question text).
        let own = "";
        for (const n of parent.childNodes || []) {
          if (n.nodeType === 3) own += n.textContent + " ";
        }
        own = own.replace(/\s+/g, " ").trim();
        if (own && own.length <= 200) return clip(own);
      }
      scope = parent;
    }
    // 5. nearest preceding heading within a bounded ancestor walk.
    let cur = el;
    for (let i = 0; i < 6 && cur; i++) {
      let sib = cur.previousElementSibling;
      let steps = 0;
      while (sib && steps < 6) {
        const role = sib.getAttribute ? sib.getAttribute("role") : "";
        if (/^H[1-6]$/i.test(sib.tagName || "") || role === "heading") {
          const t = shortText(sib);
          if (t) return t;
        }
        sib = sib.previousElementSibling;
        steps += 1;
      }
      cur = cur.parentElement;
    }
  } catch {
    /* read-only failsafe — never break the scan */
  }
  return "";
}

export function ynFieldKind(el) {
  const tag = (el.tagName || "").toUpperCase();
  const type = (el.type || "text").toLowerCase();
  if (tag === "TEXTAREA") return "textarea";
  if (tag === "SELECT") return "select";
  if (type === "file") return "file";
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  // type=date accepts ONLY yyyy-mm-dd — the engine normalises
  // or fails outright instead of writing a string the browser rejects.
  if (type === "date") return "date";
  // combobox-ish: role or aria-autocomplete
  if (
    el.getAttribute("role") === "combobox" ||
    el.getAttribute("aria-autocomplete") === "list" ||
    el.getAttribute("aria-haspopup") === "listbox"
  ) {
    return "combobox";
  }
  return "text";
}
