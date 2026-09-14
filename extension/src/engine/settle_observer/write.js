// content/settle_observer.js, part 1 of 2 - the write-and-verify loop
// itself (ynSettleWrite) plus its private per-field result helper. See
// index.js for the file's full header and history.

/**
 * Persist field values until the DOM stops fighting them.
 *
 * @param {object} args
 * @param {ParentNode} args.root - observe this subtree (usually the form/document)
 * @param {Array<{selector:string,value:string,kind?:string}>} args.fields
 * @param {function} args.writeFn - see writeFn CONTRACT above
 * @param {object} [args.opts]
 * @param {number} [args.opts.quietMs=800] - resolve after this many quiet ms
 * @param {number} [args.opts.totalMs=8000] - hard wall-clock cap
 * @param {number} [args.opts.maxRewrites=6] - per-field rewrite cap
 * @param {number} [args.opts.minMs=0] - do not quiet-exit before this elapsed
 *   (hydrationWatch late wipes: value-clear may not fire MutationObserver)
 * @param {number} [args.opts.pollMs=0] - optional backup poll interval (ms);
 *   catches value-clears that are not DOM mutations
 * @returns {Promise<{held:object[],reverted:object[],stats:object}>}
 */
export function ynSettleWrite({ root, fields, writeFn, opts }) {
  opts = opts || {};
  const quietMs = Number(opts.quietMs != null ? opts.quietMs : 800);
  const totalMs = Number(opts.totalMs != null ? opts.totalMs : 8000);
  const maxRewrites = Number(opts.maxRewrites != null ? opts.maxRewrites : 6);
  const minMs = Number(opts.minMs != null ? opts.minMs : 0);
  const pollMs = Number(opts.pollMs != null ? opts.pollMs : 0);

  if (!root) {
    return Promise.resolve({
      held: [],
      reverted: (fields || []).map((f) =>
        ynSettleFieldResult_(f, 0, "no_root"),
      ),
      stats: {
        rewrites: 0,
        quietMs,
        totalMs,
        maxRewrites,
        minMs,
        pollMs,
        disconnected: true,
      },
    });
  }
  if (typeof writeFn !== "function") {
    throw new Error(
      "ynSettleWrite: writeFn is required (see writeFn CONTRACT)",
    );
  }
  const list = Array.isArray(fields) ? fields.slice() : [];
  const startedAt =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();

  function nowMs() {
    return typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  }

  // Never cache element refs — re-query by selector every time.
  function liveEl(selector) {
    try {
      if (root.querySelector) return root.querySelector(selector);
    } catch (_) {
      /* invalid selector */
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

  const rewriteCount = Object.create(null); // selector -> number of writeFn calls
  const revertedReason = Object.create(null); // selector -> reason string
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
      // Would need another rewrite past the cap → report amber, stop fighting.
      markReverted(field, "max_rewrites");
      return;
    }

    const el = liveEl(field.selector);
    if (!el || el.isConnected === false) {
      // Node not present yet (mid-replacement). Wait for the next mutation that
      // inserts the fresh empty input — do NOT burn a rewrite slot on a miss.
      return;
    }

    rewriteCount[field.selector] = n + 1;
    totalRewrites += 1;
    // Chain writes so async writeFn (production re-plan + ynExecuteIntents)
    // completes before quiet/total classify. Sync writeFn still works.
    writeChain = writeChain
      .then(function () {
        return Promise.resolve(
          writeFn({
            el: el,
            value: field.value,
            field: field,
            selector: field.selector,
            kind: field.kind || "text",
          }),
        );
      })
      .catch(function () {
        // A throw from writeFn does not crash the observer; the next mutation
        // or the final classification will record whether the field holds.
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
      if (isForbiddenKind(f.kind)) continue; // excluded from "hold" success
      if (!holds(f)) return false;
    }
    // At least one non-forbidden field required for a held success when list
    // is mixed; empty list → vacuously quiet-hold.
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
        const reason =
          revertedReason[f.selector] ||
          (isForbiddenKind(f.kind) ? "forbidden_kind" : "not_held");
        // Never claim held for a field that does not hold right now.
        reverted.push(ynSettleFieldResult_(f, n, reason));
      }
    }
    return {
      held: held,
      reverted: reverted,
      stats: {
        rewrites: totalRewrites,
        quietMs: quietMs,
        totalMs: totalMs,
        maxRewrites: maxRewrites,
        minMs: minMs,
        pollMs: pollMs,
        disconnected: true,
        perField: Object.assign({}, rewriteCount),
      },
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
        /* already disconnected */
      }
      observer = null;
    }
  }

  return new Promise(function (resolve) {
    // Single exit: classify, disconnect, resolve. Every path must call this
    // (quiet success, maxRewrites, totalMs, no-MO fallback) — never cleanup
    // alone, or the Promise hangs forever while settled timers are cleared.
    function resolveOnce(finalPassReason, skipDrain) {
      if (settled) return;
      settled = true;
      // classify against the live DOM: fields that still do not hold → reverted.
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
              revertedReason[f.selector] ||
                ((rewriteCount[f.selector] || 0) >= maxRewrites
                  ? "max_rewrites"
                  : finalPassReason || "total_ms"),
            );
          }
        }
        cleanup();
        resolve(classify());
      }
      // The total_ms HARD cap is a strict wall-clock ceiling: classify NOW
      // rather than awaiting the write-chain drain (which could push the real
      // stop time well past totalMs — the safety review's caveat). A field
      // whose in-flight write has not landed yet is marked `reverted` (amber);
      // a write completing after disconnect just fills the field, never a false
      // "filled". Every other exit drains first so a just-completed write counts.
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
        // Final sweep in case a replacement landed between last mutation and quiet.
        sweep();
        flushWrites().then(function () {
          if (settled) return;
          if (anyReverted()) {
            // A field hit its cap mid-flight — report amber, disconnect.
            resolveOnce("max_rewrites");
            return;
          }
          if (!allIntendedHold()) {
            // else: still empty / mid-replace with no mutation yet — hard timer ends it
            return;
          }
          // Late-hydration watch: do not quiet-exit before minMs (value-clear
          // wipes may land after an early calm; old fixed loop watched ~6s).
          const elapsed = nowMs() - startedAt;
          if (elapsed < minMs) {
            const remain = Math.max(50, minMs - elapsed);
            quietTimer = setTimeout(function () {
              if (settled) return;
              sweep();
              flushWrites().then(function () {
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
        // Cap hit after sync mark; async write may still be in flight — flush
        // path in resolveOnce / armQuiet handles the rest. Check caps sync now
        // so we don't wait for quietMs after max_rewrites.
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
        characterData: true,
      });
    } catch (err) {
      // No MutationObserver (exotic env) — single write + immediate classify.
      sweep();
      resolveOnce("no_observer");
      return;
    }

    // Optional poll: value-clear (.value="") does not fire MutationObserver.
    // Production hydrationWatch path enables this so late wipes still re-assert.
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

    // Initial write (observe already attached so our own writes still arm quiet).
    sweep();
    armQuiet();

    hardTimer = setTimeout(function onTotal() {
      if (settled) return;
      // strict wall-clock ceiling: classify now, do not await the write-chain
      // drain (skipDrain=true) — see resolveOnce.
      resolveOnce("total_ms", true);
    }, totalMs);

    // If the initial write already holds and the page never mutates, quiet
    // exit still fires via armQuiet above (subject to minMs). Nothing else to do.
  });
}

export function ynSettleFieldResult_(field, rewrites, status) {
  const out = {
    selector: field.selector,
    value: field.value,
    kind: field.kind || "text",
    rewrites: rewrites || 0,
    status: status,
  };
  if (field.fieldKey) out.fieldKey = field.fieldKey;
  return out;
}
