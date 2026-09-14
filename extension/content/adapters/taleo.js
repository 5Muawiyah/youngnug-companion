(() => {
  // extension/src/adapters/taleo/index.js
  function ynTaleoPlan() {
    return [];
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "taleo",
    plan: ynTaleoPlan
  });
  globalThis.ynTaleoPlan = ynTaleoPlan;
})();
