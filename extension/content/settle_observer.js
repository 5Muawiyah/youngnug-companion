(() => {
  // extension/src/engine/settle_observer/write.js
  function ynSettleWrite({ root, fields, writeFn, opts }) {
    opts = opts || {};
    const quietMs = Number(opts.quietMs != null ? opts.quietMs : 800);
    const totalMs = Number(opts.totalMs != null ? opts.totalMs : 8e3);
    const maxRewrites = Number(opts.maxRewrites != null ? opts.maxRewrites : 6);
    const minMs = Number(opts.minMs != null ? opts.minMs : 0);
    const pollMs = Number(opts.pollMs != null ? opts.pollMs : 0);
    if (!root) {
      return Promise.resolve({
        held: [],
        reverted: (fields || []).map(
          (f) => ynSettleFieldResult_(f, 0, "no_root")
        ),
        stats: {
          rewrites: 0,
          quietMs,
          totalMs,
          maxRewrites,
          minMs,
          pollMs,
          disconnected: true
        }
      });
    }
    if (typeof writeFn !== "function") {
      throw new Error(
        "ynSettleWrite: writeFn is required (see writeFn CONTRACT)"
      );
    }
    const list = Array.isArray(fields) ? fields.slice() : [];
    const startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    function nowMs() {
      return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    }
    function liveEl(selector) {
      try {
        if (root.querySelector) return root.querySelector(selector);
      } catch (_) {
      }
      return null;
    }
    function isForbiddenKind(kind) {
      const k = String(kind || "text").toLowerCase();
      return k === "password" || k === "honeypot";
    }
    function holds(field) {
      if (isForbiddenKind(field.kind)) return false;
      const el = liveEl(field.selector);
      if (!el || el.isConnected === false) return false;
      return String(el.value == null ? "" : el.value) === String(field.value);
    }
    const rewriteCount = /* @__PURE__ */ Object.create(null);
    const revertedReason = /* @__PURE__ */ Object.create(null);
    let totalRewrites = 0;
    let observer = null;
    let quietTimer = null;
    let hardTimer = null;
    let pollTimer = null;
    let settled = false;
    let writeChain = Promise.resolve();
    function markReverted(field, reason) {
      if (!revertedReason[field.selector]) {
        revertedReason[field.selector] = reason || "reverted";
      }
    }
    function maybeRewrite(field) {
      if (isForbiddenKind(field.kind)) {
        markReverted(field, "forbidden_kind");
        return;
      }
      if (revertedReason[field.selector]) return;
      if (holds(field)) return;
      const n = rewriteCount[field.selector] || 0;
      if (n >= maxRewrites) {
        markReverted(field, "max_rewrites");
        return;
      }
      const el = liveEl(field.selector);
      if (!el || el.isConnected === false) {
        return;
      }
      rewriteCount[field.selector] = n + 1;
      totalRewrites += 1;
      writeChain = writeChain.then(function() {
        return Promise.resolve(
          writeFn({
            el,
            value: field.value,
            field,
            selector: field.selector,
            kind: field.kind || "text"
          })
        );
      }).catch(function() {
      });
    }
    function sweep() {
      for (let i = 0; i < list.length; i++) {
        maybeRewrite(list[i]);
      }
    }
    function flushWrites() {
      return writeChain;
    }
    function allIntendedHold() {
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (isForbiddenKind(f.kind)) continue;
        if (!holds(f)) return false;
      }
      return true;
    }
    function anyReverted() {
      for (const k in revertedReason) {
        if (Object.prototype.hasOwnProperty.call(revertedReason, k)) return true;
      }
      return false;
    }
    function classify() {
      const held = [];
      const reverted = [];
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        const n = rewriteCount[f.selector] || 0;
        if (!isForbiddenKind(f.kind) && holds(f) && !revertedReason[f.selector]) {
          held.push(ynSettleFieldResult_(f, n, "held"));
        } else {
          const reason = revertedReason[f.selector] || (isForbiddenKind(f.kind) ? "forbidden_kind" : "not_held");
          reverted.push(ynSettleFieldResult_(f, n, reason));
        }
      }
      return {
        held,
        reverted,
        stats: {
          rewrites: totalRewrites,
          quietMs,
          totalMs,
          maxRewrites,
          minMs,
          pollMs,
          disconnected: true,
          perField: Object.assign({}, rewriteCount)
        }
      };
    }
    function cleanup() {
      if (quietTimer) {
        clearTimeout(quietTimer);
        quietTimer = null;
      }
      if (hardTimer) {
        clearTimeout(hardTimer);
        hardTimer = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (observer) {
        try {
          observer.disconnect();
        } catch (_) {
        }
        observer = null;
      }
    }
    return new Promise(function(resolve) {
      function resolveOnce(finalPassReason, skipDrain) {
        if (settled) return;
        settled = true;
        function finalClassify() {
          for (let i = 0; i < list.length; i++) {
            const f = list[i];
            if (isForbiddenKind(f.kind)) {
              markReverted(f, "forbidden_kind");
              continue;
            }
            if (!holds(f)) {
              markReverted(
                f,
                revertedReason[f.selector] || ((rewriteCount[f.selector] || 0) >= maxRewrites ? "max_rewrites" : finalPassReason || "total_ms")
              );
            }
          }
          cleanup();
          resolve(classify());
        }
        if (skipDrain) {
          finalClassify();
          return;
        }
        flushWrites().then(finalClassify);
      }
      function armQuiet() {
        if (settled) return;
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(function onQuiet() {
          if (settled) return;
          sweep();
          flushWrites().then(function() {
            if (settled) return;
            if (anyReverted()) {
              resolveOnce("max_rewrites");
              return;
            }
            if (!allIntendedHold()) {
              return;
            }
            const elapsed = nowMs() - startedAt;
            if (elapsed < minMs) {
              const remain = Math.max(50, minMs - elapsed);
              quietTimer = setTimeout(function() {
                if (settled) return;
                sweep();
                flushWrites().then(function() {
                  if (settled) return;
                  if (anyReverted()) {
                    resolveOnce("max_rewrites");
                    return;
                  }
                  if (allIntendedHold()) resolveOnce("held");
                });
              }, remain);
              return;
            }
            resolveOnce("held");
          });
        }, quietMs);
      }
      try {
        observer = new MutationObserver(function onMut() {
          if (settled) return;
          sweep();
          if (anyReverted()) {
            resolveOnce("max_rewrites");
            return;
          }
          armQuiet();
        });
        observer.observe(root, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true
        });
      } catch (err) {
        sweep();
        resolveOnce("no_observer");
        return;
      }
      if (pollMs > 0) {
        pollTimer = setInterval(function onPoll() {
          if (settled) return;
          sweep();
          if (anyReverted()) {
            resolveOnce("max_rewrites");
            return;
          }
          armQuiet();
        }, pollMs);
      }
      sweep();
      armQuiet();
      hardTimer = setTimeout(function onTotal() {
        if (settled) return;
        resolveOnce("total_ms", true);
      }, totalMs);
    });
  }
  function ynSettleFieldResult_(field, rewrites, status) {
    const out = {
      selector: field.selector,
      value: field.value,
      kind: field.kind || "text",
      rewrites: rewrites || 0,
      status
    };
    if (field.fieldKey) out.fieldKey = field.fieldKey;
    return out;
  }

  // extension/src/engine/settle_observer/classify.js
  function ynClassifyHold(el, kind, expected) {
    if (!el || el.isConnected === false) return "cleared_after_fill";
    const k = String(kind || "text").toLowerCase();
    if (k === "checkbox" || k === "radio") {
      const got2 = Boolean(el.checked);
      const want2 = Boolean(expected);
      if (got2 === want2) return "held";
      return got2 ? "rejected" : "cleared_after_fill";
    }
    if (k === "file") {
      return el.files && el.files.length > 0 ? "held" : "cleared_after_fill";
    }
    if (k === "select") {
      const opt = el.selectedOptions && el.selectedOptions[0];
      const got2 = opt ? String(opt.value || "") : "";
      const want2 = String(expected == null ? "" : expected);
      if (got2 === want2) return "held";
      return got2 === "" ? "cleared_after_fill" : "rejected";
    }
    const squash = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (k === "combobox") {
      const got2 = "value" in el ? el.value : el.textContent || "";
      const gotTrim = String(got2 || "").trim();
      if (!gotTrim) return "cleared_after_fill";
      return squash(got2) === squash(expected) ? "held" : "rejected";
    }
    const got = String(el.value == null ? "" : el.value);
    const want = String(expected == null ? "" : expected);
    if (got === want) return "held";
    if (got.trim() === "") return "cleared_after_fill";
    return squash(got) === squash(want) ? "equivalent_after_mask" : "rejected";
  }
  function ynVerifyWrites(items, opts) {
    const options = opts || {};
    const quietMs = options.quietMs != null ? options.quietMs : 150;
    const totalMs = options.totalMs != null ? options.totalMs : 900;
    const list = Array.isArray(items) ? items.slice() : [];
    return new Promise((resolve) => {
      let settled = false;
      let observer = null;
      let quietTimer = null;
      let hardTimer = null;
      function finish() {
        if (settled) return;
        settled = true;
        if (quietTimer) clearTimeout(quietTimer);
        if (hardTimer) clearTimeout(hardTimer);
        if (observer) {
          try {
            observer.disconnect();
          } catch {
          }
        }
        resolve(
          list.map((it) => ({
            fieldKey: it.fieldKey || "",
            status: ynClassifyHold(it.el, it.kind, it.value)
          }))
        );
      }
      function armQuiet() {
        if (settled) return;
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      }
      try {
        const roots = /* @__PURE__ */ new Set();
        for (const it of list) {
          if (!it || !it.el) continue;
          const root = typeof it.el.getRootNode === "function" ? it.el.getRootNode() : document;
          roots.add(root === document ? document.documentElement : root);
        }
        if (roots.size) {
          observer = new MutationObserver(armQuiet);
          for (const root of roots) {
            try {
              observer.observe(root, {
                subtree: true,
                childList: true,
                attributes: true,
                characterData: true
              });
            } catch {
            }
          }
        }
      } catch {
      }
      hardTimer = setTimeout(finish, totalMs);
      armQuiet();
    });
  }

  // extension/src/engine/settle_observer/index.js
  globalThis.ynSettleWrite = ynSettleWrite;
  globalThis.ynSettleFieldResult_ = ynSettleFieldResult_;
  globalThis.ynClassifyHold = ynClassifyHold;
  globalThis.ynVerifyWrites = ynVerifyWrites;
})();
if (typeof window !== "undefined") {
  window.ynSettleWrite = globalThis.ynSettleWrite;
  window.ynClassifyHold = globalThis.ynClassifyHold;
  window.ynVerifyWrites = globalThis.ynVerifyWrites;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ynSettleWrite: globalThis.ynSettleWrite,
    ynClassifyHold: globalThis.ynClassifyHold,
    ynVerifyWrites: globalThis.ynVerifyWrites,
  };
}
