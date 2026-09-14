(() => {
  // extension/src/engine/repeater/index.js
  var YN_REPEATER_ADD_PATTERNS = [
    /\badd\b.*\b(entry|entries|row|another|more|item|record)\b/i,
    /\b(add|new)\s+(another|more)\b/i,
    // `add` as a whole word, not the start of "Add-ons" — a hyphen counts as a
    // word boundary, so `\badd\b` alone matches far too much.
    /^\s*\+?\s*add(?:\s|$)/i,
    /(?:^|\s)add\s*\+?\s*$/i
  ];
  var YN_REPEATER_ROW_WORDS = /\b(entry|entries|row|rows|another|more|item|record|history|education|experience|employment|reference)\b/i;
  var YN_REPEATER_COUNT_PATTERN = /(\d+)\s+of\s+(\d+)\s+entr/i;
  function ynRepeaterAccessibleName(el) {
    if (!el) return "";
    const aria = el.getAttribute && el.getAttribute("aria-label");
    if (aria && aria.trim() !== "") return aria.trim();
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (text !== "") return text;
    const title = el.getAttribute && el.getAttribute("title");
    return (title || "").trim();
  }
  function ynRepeaterLooksLikeAddControl(el) {
    const name = ynRepeaterAccessibleName(el);
    if (!name) return false;
    if (!YN_REPEATER_ADD_PATTERNS.some((re) => re.test(name))) return false;
    if (/\badd\s+to\b/i.test(name) && !YN_REPEATER_ROW_WORDS.test(name)) {
      return false;
    }
    if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) return false;
    return true;
  }
  function ynRepeaterCountsFrom(text) {
    const m = YN_REPEATER_COUNT_PATTERN.exec(text || "");
    if (!m) return {};
    return { current: Number(m[1]), max: Number(m[2]) };
  }
  function ynRepeaterFindAddControl(root, doc) {
    const document_ = doc || document;
    const scope = root || document_;
    const candidates = ynAdaFindAll(
      scope,
      'button, [role="button"], a[href="#"], input[type="button"]'
    );
    for (const el of candidates) {
      if (ynRepeaterLooksLikeAddControl(el)) return el;
    }
    return null;
  }
  async function ynRepeaterExpand(opts) {
    const doc = opts && opts.doc || document;
    const root = opts && opts.root || doc;
    const rowSelector = opts && opts.rowSelector;
    const needed = Math.max(0, opts && opts.needed || 0);
    const maxAttempts = opts && opts.maxAttempts || 50;
    const settleMs = opts && opts.settleMs || 30;
    const settleTimeoutMs = opts && opts.settleTimeoutMs || 600;
    const countRows = () => rowSelector ? ynAdaFindAll(root, rowSelector).length : 0;
    const rowsNow = () => rowSelector ? ynAdaFindAll(root, rowSelector) : [];
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let present = countRows();
    const addControl = ynRepeaterFindAddControl(root, doc);
    if (!addControl) {
      return {
        clicked: 0,
        rows: rowsNow(),
        present,
        couldNotAdd: Math.max(0, needed - present),
        capped: false,
        reason: present < needed ? "no Add control found" : void 0
      };
    }
    const statedFromControl = ynRepeaterCountsFrom(ynRepeaterAccessibleName(addControl));
    const stated = typeof statedFromControl.max === "number" ? statedFromControl : ynRepeaterCountsFrom((root.textContent || "").slice(0, 4e3));
    const cap = typeof stated.max === "number" ? stated.max : Infinity;
    const target = Math.min(needed, cap);
    let clicked = 0;
    let stoppedEarly = false;
    while (present < target && clicked < maxAttempts) {
      if (typeof ynSubmitGuard === "function" && ynSubmitGuard(addControl)) {
        stoppedEarly = true;
        break;
      }
      const before = present;
      try {
        addControl.click();
      } catch {
        stoppedEarly = true;
        break;
      }
      let waited = 0;
      present = countRows();
      while (present <= before && waited < settleTimeoutMs) {
        await sleep(settleMs);
        waited += settleMs;
        present = countRows();
      }
      clicked += 1;
      if (present <= before) {
        stoppedEarly = true;
        break;
      }
    }
    return {
      clicked,
      rows: rowsNow(),
      present,
      couldNotAdd: Math.max(0, needed - present),
      capped: isFinite(cap) && needed > cap,
      reason: stoppedEarly && present < needed ? "the Add control stopped producing rows" : void 0
    };
  }
  globalThis.YN_REPEATER_ADD_PATTERNS = YN_REPEATER_ADD_PATTERNS;
  globalThis.YN_REPEATER_ROW_WORDS = YN_REPEATER_ROW_WORDS;
  globalThis.YN_REPEATER_COUNT_PATTERN = YN_REPEATER_COUNT_PATTERN;
  globalThis.ynRepeaterAccessibleName = ynRepeaterAccessibleName;
  globalThis.ynRepeaterLooksLikeAddControl = ynRepeaterLooksLikeAddControl;
  globalThis.ynRepeaterCountsFrom = ynRepeaterCountsFrom;
  globalThis.ynRepeaterFindAddControl = ynRepeaterFindAddControl;
  globalThis.ynRepeaterExpand = ynRepeaterExpand;
})();
if (typeof window !== "undefined") {
  window.ynRepeaterAccessibleName = globalThis.ynRepeaterAccessibleName;
  window.ynRepeaterLooksLikeAddControl = globalThis.ynRepeaterLooksLikeAddControl;
  window.ynRepeaterCountsFrom = globalThis.ynRepeaterCountsFrom;
  window.ynRepeaterFindAddControl = globalThis.ynRepeaterFindAddControl;
  window.ynRepeaterExpand = globalThis.ynRepeaterExpand;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ynRepeaterAccessibleName: globalThis.ynRepeaterAccessibleName,
    ynRepeaterLooksLikeAddControl: globalThis.ynRepeaterLooksLikeAddControl,
    ynRepeaterCountsFrom: globalThis.ynRepeaterCountsFrom,
    ynRepeaterFindAddControl: globalThis.ynRepeaterFindAddControl,
    ynRepeaterExpand: globalThis.ynRepeaterExpand,
  };
}
