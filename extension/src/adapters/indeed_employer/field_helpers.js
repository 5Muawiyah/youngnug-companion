// content/adapters/indeed_employer.js, part 1 of 3 — field lookup and
// classification helpers ynIndeedEmployerPlan (part 2) builds on. See
// index.js for the file's full banner.
//
// ynAdaLabelOf, ynQueryDeep, ynAdaIsPassword, ynIsHoneypot, ynAdaFind and
// ynIsPaymentField are NOT declared in this bundle — they are
// content/dom_fill_kit.js / content/heuristics.js globals, injected before
// every adapter and referenced here exactly as the original file
// referenced them: bare names resolved at runtime, unchanged by this split.

/** Sponsorship/budget field signal — a spend decision is never automated.
 * The posting filler halts the whole flow when one of these is visible. */
export const YN_IE_SPONSOR_SIGNAL_RE =
  /budget|sponsor|daily\s*(spend|amount)|per\s*day|per[-\s]?click|cost\s*per/i;

/** Visible label/name/id/placeholder identity for matching (adapter-local;
 * report labels still come from ynAdaLabelOf via ynReportEntry). */
export function ynIeSignal(el, doc) {
  if (!el) return "";
  let placeholder = "";
  try {
    placeholder = String(el.getAttribute("placeholder") || "");
  } catch {
    placeholder = "";
  }
  let aria = "";
  try {
    aria = String(el.getAttribute("aria-label") || "");
  } catch {
    aria = "";
  }
  const label = typeof ynAdaLabelOf === "function" ? ynAdaLabelOf(el, doc) : "";
  return [label, aria, placeholder, el.name || "", el.id || ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fillable text-ish controls on the posting page (never password/hidden/
 * submit; honeypots are re-refused by the engine at write time). */
export function ynIeFillableFields(doc) {
  const document_ = doc || document;
  let fields = [];
  try {
    fields =
      typeof ynQueryDeep === "function"
        ? ynQueryDeep(document_, "input, textarea, select")
        : [...document_.querySelectorAll("input, textarea, select")];
  } catch {
    fields = [];
  }
  return fields.filter((el) => {
    if (!el) return false;
    const type = (el.type || "").toLowerCase();
    if (
      [
        "hidden",
        "submit",
        "button",
        "image",
        "reset",
        "password",
        "file",
      ].includes(type)
    ) {
      return false;
    }
    if (typeof ynAdaIsPassword === "function" && ynAdaIsPassword(el)) {
      return false;
    }
    return true;
  });
}

/** Any visible sponsorship/budget field on this page (label or name/id
 * signal), for the posting filler's hard stop. Returns the first matching
 * element or null. Payment-shaped fields are the engine's job, not this. */
export function ynIeSponsorshipField(doc) {
  const document_ = doc || document;
  for (const el of ynIeFillableFields(document_)) {
    try {
      if (typeof ynIsHoneypot === "function" && ynIsHoneypot(el, document_)) {
        continue;
      }
    } catch {
      continue;
    }
    const signal = ynIeSignal(el, document_);
    if (signal && YN_IE_SPONSOR_SIGNAL_RE.test(signal)) return el;
  }
  return null;
}

/** Best-effort lookup: try the documented convention selectors first, then
 * fall back to the first unclaimed field whose visible identity matches
 * labelRe. Returns null honestly when nothing matches. */
export function ynIeFind(doc, selectors, labelRe, claimed) {
  const document_ = doc || document;
  for (const sel of selectors || []) {
    let el = null;
    try {
      el =
        typeof ynAdaFind === "function"
          ? ynAdaFind(document_, sel)
          : document_.querySelector(sel);
    } catch {
      el = null;
    }
    if (el && !claimed.has(el)) {
      if (typeof ynAdaIsPassword === "function" && ynAdaIsPassword(el)) {
        continue;
      }
      return el;
    }
  }
  if (labelRe) {
    for (const el of ynIeFillableFields(document_)) {
      if (claimed.has(el)) continue;
      const signal = ynIeSignal(el, document_);
      if (signal && labelRe.test(signal)) {
        // never adopt a payment/budget/terms-shaped field as a content field
        if (
          typeof ynIsPaymentField === "function" &&
          ynIsPaymentField(el, document_)
        ) {
          continue;
        }
        if (YN_IE_SPONSOR_SIGNAL_RE.test(signal)) continue;
        return el;
      }
    }
  }
  return null;
}

export function ynIeKindOf(el) {
  if (!el) return "text";
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "TEXTAREA") return "textarea";
  if (tag === "SELECT") return "select";
  const type = (el.type || "").toLowerCase();
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  let role = "";
  try {
    role = String(
      (el.getAttribute && el.getAttribute("role")) || "",
    ).toLowerCase();
  } catch {
    role = "";
  }
  if (
    role === "combobox" ||
    (el.getAttribute && el.getAttribute("aria-haspopup") === "listbox") ||
    (el.getAttribute && el.getAttribute("aria-autocomplete") === "list")
  ) {
    return "combobox";
  }
  return "text";
}
