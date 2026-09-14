// content/engine.js, part 5 of 9 — the clean human-readable report label,
// UK-first date normalisation (input[type=date] and split D/M/Y groups),
// and the one report-entry builder every fill path shares. ynAdaLabelOf
// comes from this same shipped file's honeypot.js. See index.js for the
// file's full history.
import { ynAdaLabelOf } from "./honeypot.js";
// ─── Entry for report lists ─────────────────────────────────────────────────
/**
 * A CLEAN, human-readable label for a reported field — for the overlay only,
 * never for matching. Prefers the field's own visible <label>/aria-label
 * (ynAdaLabelOf); for a grouped radio/checkbox the QUESTION lives in the
 * fieldset <legend> ("Are you eligible to work in the UK?"), not the per-option
 * label ("Yes"), so use the legend there. This replaces the raw concatenated
 * identity signal the matcher builds (e.g. "Yes rtw rtw_yes"), which is unfit
 * to show a user.
 */
export function ynReportLabel(el, doc) {
  if (!el) return "";
  const t = (el.type || "").toLowerCase();
  if (t === "radio" || t === "checkbox") {
    try {
      const fs = el.closest && el.closest("fieldset");
      const legend = fs && fs.querySelector && fs.querySelector("legend");
      const lt =
        legend && legend.textContent
          ? legend.textContent.replace(/\s+/g, " ").trim()
          : "";
      if (lt) return lt.slice(0, 80);
    } catch {
      /* ignore — fall through to the element label */
    }
  }
  return ynAdaLabelOf(el, doc);
}

// Date normalisation for input[type=date] and split D/M/Y groups. This
// targets UK users: ambiguous numeric dates are read as dd/mm/yyyy. A string
// that is not a real date ("Immediately", "2 weeks") returns null, so the
// field is left unfilled rather than receiving garbage the browser rejects.
export const YN_MONTH_NAMES = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export function ynToIsoDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const build = (y, mo, d) => {
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100)) {
      return null;
    }
    // Range checks alone accept 31 February. input[type=date] rejects such a
    // string silently, which is fine, but the split day/month/year path
    // writes into PLAIN TEXT boxes that accept anything — so an impossible
    // date would land on the form and read back as a successful fill.
    // Round-trip through Date to confirm the day exists in that month.
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (
      probe.getUTCFullYear() !== y ||
      probe.getUTCMonth() !== mo - 1 ||
      probe.getUTCDate() !== d
    ) {
      return null;
    }
    return `${y}-${pad(mo)}-${pad(d)}`;
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (m) return build(+m[3], +m[2], +m[1]); // dd/mm/yyyy (UK)
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+),?\s+(\d{4})$/i.exec(s);
  if (m) {
    const mo = YN_MONTH_NAMES[m[2].toLowerCase()];
    return mo ? build(+m[3], mo, +m[1]) : null;
  }
  m = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(s);
  if (m) {
    const mo = YN_MONTH_NAMES[m[1].toLowerCase()];
    return mo ? build(+m[3], mo, +m[2]) : null;
  }
  return null;
}

export function ynReportEntry(intent, extraLabel) {
  // Prefer a clean element-derived label over the matcher's concatenated
  // signal (intent.label); extraLabel is an explicit override (e.g. "no file
  // url"). questionLabel (generated free-text) is already the clean question.
  let clean = "";
  try {
    if (intent && intent.el) {
      const doc =
        intent.el.ownerDocument ||
        (typeof document !== "undefined" ? document : null);
      clean = ynReportLabel(intent.el, doc);
    }
  } catch {
    /* ignore — fall back below */
  }
  return {
    fieldKey: intent.fieldKey || "",
    label:
      extraLabel ||
      clean ||
      (intent && intent.questionLabel) ||
      (intent && intent.label) ||
      (intent && intent.fieldKey) ||
      "",
  };
}
