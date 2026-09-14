// content/capture.js — shared text-reading helpers used by several of the
// per-site readers below (the ld+json rung, the "About the job" climb, the
// generic guesser's employer field, Prospects' hidden-label stripping).
// Nothing here reads the page directly; every function takes a node or a
// string and returns text.

// innerText needs layout, which only a real browser does; textContent is the
// fallback where innerText is not materialised.
function ynVisibleText(el) {
  if (!el) return "";
  const t = el.innerText == null ? el.textContent : el.innerText;
  return (t || "").trim();
}

// Collapse runs of spaces but keep line breaks: a job body is read by a
// student, and one 8,000-char line is not a description.
function ynTidyBlock(text) {
  return (text || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

// ld+json descriptions arrive as HTML. Parsed inertly (DOMParser executes
// nothing), with block/li/br boundaries kept as line breaks.
function ynHtmlToText(html) {
  if (!html) return "";
  const spaced = String(html).replace(/<(br[^>]*|\/p|\/li|\/h[1-6]|\/div|\/tr)>/gi, "$&\n");
  const doc = new DOMParser().parseFromString(spaced, "text/html");
  return ynTidyBlock(doc.body ? doc.body.textContent : "");
}

function ynLdLocationText(jobLocation) {
  const loc = Array.isArray(jobLocation) ? jobLocation[0] : jobLocation;
  const addr = loc && typeof loc === "object" ? loc.address || loc : null;
  if (!addr || typeof addr !== "object") return "";
  return [addr.addressLocality, addr.addressRegion]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(", ");
}

function ynLdSalaryText(baseSalary) {
  if (!baseSalary || typeof baseSalary !== "object") return "";
  const v =
    baseSalary.value && typeof baseSalary.value === "object"
      ? baseSalary.value
      : { value: baseSalary.value };
  const range =
    v.minValue != null && v.maxValue != null
      ? `${v.minValue} to ${v.maxValue}`
      : v.value != null
        ? String(v.value)
        : "";
  if (!range) return "";
  const unit = v.unitText ? ` a ${String(v.unitText).toLowerCase()}` : "";
  return `${range} ${baseSalary.currency || ""}`.trim() + unit;
}

// Text with a hidden accessibility label (a "sr-only" span) and, for
// employer, a trailing "N other jobs" link, both removed before reading —
// Prospects' Angular markup carries no test hook beyond its own semantic
// result-item-* class names, so the visible field text has to be picked out
// of a node that mixes it with screen-reader-only labelling.
function ynStripHiddenText(el, selectors) {
  if (!el) return "";
  const clone = el.cloneNode(true);
  for (const sel of selectors) {
    clone.querySelectorAll(sel).forEach((n) => n.remove());
  }
  return ynText(clone);
}

export {
  ynVisibleText,
  ynTidyBlock,
  ynHtmlToText,
  ynLdLocationText,
  ynLdSalaryText,
  ynStripHiddenText,
};
