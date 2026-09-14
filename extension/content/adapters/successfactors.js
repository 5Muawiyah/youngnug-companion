(() => {
  // extension/src/adapters/successfactors/index.js
  function ynSuccessFactorsPlan() {
    return [];
  }
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  YN_ADAPTERS.push({
    id: "successfactors",
    plan: ynSuccessFactorsPlan
  });
  globalThis.ynSuccessFactorsPlan = ynSuccessFactorsPlan;
})();
