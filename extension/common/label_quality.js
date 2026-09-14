(() => {
  // extension/src/common/label_quality/index.js
  var YN_LABEL_MAX_LEN = 140;
  var YN_LABEL_TRANSIENT_RE = /^(loading|please wait|processing|submitting|saving|searching|refreshing|no results?( found)?|no (matches|options)( found)?|please hold on|select( (one|an option))?|choose( one)?|search)[.…]{0,3}$/i;
  var YN_LABEL_GENERIC_RE = /^(value|field|input|name|label|text|option|item|untitled)([_-]?\d+)?s?$/i;
  function ynLooksLikeIdentifierText(s) {
    const t = String(s || "").trim();
    if (!t) return false;
    if (/^\d+$/.test(t)) return true;
    if (/^[a-z][\w-]*[_-][\w-]*\d{4,}[\w-]*$/i.test(t)) return true;
    if (/^[a-z]{1,4}[_-][a-z0-9]{2,}$/i.test(t) && /\d/.test(t)) return true;
    if (/^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(t)) return true;
    return false;
  }
  function ynIsUsableLabel(s) {
    const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    if (!t) return false;
    if (t.length > YN_LABEL_MAX_LEN) return false;
    if (YN_LABEL_TRANSIENT_RE.test(t)) return false;
    if (YN_LABEL_GENERIC_RE.test(t)) return false;
    if (ynLooksLikeIdentifierText(t)) return false;
    return true;
  }
  function ynFirstUsableLabel(candidates) {
    const list = Array.isArray(candidates) ? candidates : [candidates];
    for (const c of list) {
      if (ynIsUsableLabel(c)) {
        return String(c).replace(/\s+/g, " ").trim();
      }
    }
    return "";
  }
  function ynReportFieldLabel(entry) {
    if (!entry) return "";
    return ynFirstUsableLabel(entry.label);
  }
  globalThis.YN_LABEL_MAX_LEN = YN_LABEL_MAX_LEN;
  globalThis.YN_LABEL_TRANSIENT_RE = YN_LABEL_TRANSIENT_RE;
  globalThis.YN_LABEL_GENERIC_RE = YN_LABEL_GENERIC_RE;
  globalThis.ynLooksLikeIdentifierText = ynLooksLikeIdentifierText;
  globalThis.ynIsUsableLabel = ynIsUsableLabel;
  globalThis.ynFirstUsableLabel = ynFirstUsableLabel;
  globalThis.ynReportFieldLabel = ynReportFieldLabel;
})();
