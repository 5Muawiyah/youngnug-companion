(() => {
  // extension/src/adapters/reopen/index.js
  function ynAdapterReopenSection(fieldEl, editLabelPatterns, sectionSelector, doc) {
    const document_ = doc || document;
    if (!fieldEl || !Array.isArray(editLabelPatterns) || !editLabelPatterns.length) {
      return null;
    }
    const section = sectionSelector && fieldEl.closest && fieldEl.closest(sectionSelector) || fieldEl.closest && fieldEl.closest("section, fieldset, [role='region']") || null;
    if (!section) return null;
    const candidates = ynAdaFindAll(
      section,
      'button, [role="button"], a[href="#"]'
    );
    for (const el of candidates) {
      const name = [
        el.textContent,
        el.getAttribute && el.getAttribute("aria-label"),
        el.value
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (!name) continue;
      if (!editLabelPatterns.some((re) => re.test(name))) continue;
      if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) continue;
      try {
        el.click();
      } catch {
        continue;
      }
      return el;
    }
    return null;
  }
  globalThis.ynAdapterReopenSection = ynAdapterReopenSection;
})();
if (typeof window !== "undefined") {
  window.ynAdapterReopenSection = globalThis.ynAdapterReopenSection;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ynAdapterReopenSection: globalThis.ynAdapterReopenSection,
  };
}
