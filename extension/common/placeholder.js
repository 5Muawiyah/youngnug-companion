(() => {
  // extension/src/common/placeholder/index.js
  var YN_PLACEHOLDER_PHRASES = [
    "",
    "-",
    "--",
    "---",
    "none",
    "-none-",
    "no selection",
    "not selected",
    "unknown",
    "n/a",
    "na",
    "select",
    "select one",
    "select an option",
    "select option",
    "select...",
    "please select",
    "please select one",
    "choose",
    "choose one",
    "choose an option",
    "make a selection",
    "pick one",
    "-- select --",
    "select a value",
    "nothing selected"
  ];
  function ynNormalizePlaceholder(value) {
    return String(value == null ? "" : value).toLowerCase().replace(/[…]/g, "...").replace(/[‐-―]/g, "-").replace(/\s+/g, " ").trim().replace(
      /^[-\s*]+|[-\s*:]+$/g,
      (m) => m.includes("-") && m.trim().length > 0 ? m : ""
    ).trim();
  }
  function ynIsPlaceholderText(value) {
    const v = ynNormalizePlaceholder(value);
    if (v === "") return true;
    if (YN_PLACEHOLDER_PHRASES.includes(v)) return true;
    const imperative = /^(?:please\s+)?(?:select|choose)\b(.*)$/.exec(v);
    if (imperative) {
      const rest = (imperative[1] || "").replace(/\.{3}$/, "").trim();
      if (rest === "") return true;
      if (/^(one|an?\s+\w+|your\s+\w+|from\s+(the\s+)?\w+)$/.test(rest)) {
        return true;
      }
    }
    if (/^[-.·]+$/.test(v)) return true;
    return false;
  }
  function ynIsPlaceholderPhone(value) {
    const digits = String(value == null ? "" : value).replace(/\D/g, "");
    if (digits === "") return true;
    const withoutDialCode = /^\+?\d{1,4}$/.test(digits) ? "" : digits;
    return withoutDialCode.length < 4;
  }
  function ynIsPlaceholderValue(kind, value, options) {
    const opts = options || {};
    const k = String(kind || "text").toLowerCase();
    if (k === "phone" || k === "tel" || k === "mobile") {
      return ynIsPlaceholderPhone(value);
    }
    if (k === "select") {
      if (opts.selectedIndex === 0 && (opts.optionDisabled === true || String(value || "").trim() === "")) {
        return true;
      }
      return ynIsPlaceholderText(value);
    }
    return ynIsPlaceholderText(value);
  }
  globalThis.YN_PLACEHOLDER_PHRASES = YN_PLACEHOLDER_PHRASES;
  globalThis.ynNormalizePlaceholder = ynNormalizePlaceholder;
  globalThis.ynIsPlaceholderText = ynIsPlaceholderText;
  globalThis.ynIsPlaceholderPhone = ynIsPlaceholderPhone;
  globalThis.ynIsPlaceholderValue = ynIsPlaceholderValue;
})();
if (typeof window !== "undefined") {
  window.ynIsPlaceholderText = globalThis.ynIsPlaceholderText;
  window.ynIsPlaceholderPhone = globalThis.ynIsPlaceholderPhone;
  window.ynIsPlaceholderValue = globalThis.ynIsPlaceholderValue;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ynIsPlaceholderText: globalThis.ynIsPlaceholderText,
    ynIsPlaceholderPhone: globalThis.ynIsPlaceholderPhone,
    ynIsPlaceholderValue: globalThis.ynIsPlaceholderValue,
  };
}
