// content/filler.js, part 9 of 11 — ynFillApplication, phase 3 of 4: the
// after-write hold-check. Turbo/React ATSes can replace form nodes AFTER
// the write, silently reverting a value while the report still says
// "filled" — this phase lets hydration settle, re-reads the live DOM, and
// re-plans + re-executes once for any text field that came back empty (the
// full safety chain re-runs inside ynExecuteIntents), then downgrades
// anything still empty from filled/guessed into an accurate `reverted`
// entry. Reads report/executeIntents/adapter/plan/ats off the shared state
// object S; report is mutated in place (its arrays are reassigned, never
// the object itself), so this phase writes nothing back onto S — the same
// object phase 2 put there already carries every change. See index.js for
// the file's full history.
export async function ynFillApplicationHoldCheck(jobId, S) {
  const { report, executeIntents, adapter, plan, ats } = S;
  // 7b. HOLD-CHECK. Turbo/React ATSes (Teamtailor, Recruitee — and
  // Greenhouse, which has a similar hydration race) can replace form nodes
  // AFTER the write, silently reverting values while the report says
  // "filled" — live testing caught exactly that false-green. So: let
  // hydration settle, re-read the LIVE DOM, re-plan + re-execute ONCE for
  // reverted text fields (the full safety chain re-runs inside
  // ynExecuteIntents — honeypot/password/scope/user-kept all apply again),
  // and downgrade anything still empty to an accurate `reverted` entry. A
  // wrong "filled" is misleading to the user; amber reflects reality.
  try {
    const ynHoldable = (i) =>
      i &&
      i.el &&
      !i.skip &&
      (i.kind || "text") === "text" &&
      typeof i.value === "string" &&
      i.value !== "";
    const wroteKeys = new Set(
      [...(report.filled || []), ...(report.guessed || [])]
        .map((e) => e && e.fieldKey)
        .filter(Boolean),
    );
    const wrote = executeIntents.filter(
      (i) => ynHoldable(i) && wroteKeys.has(i.fieldKey),
    );
    if (wrote.length) {
      const ynEmptyNow = (el) =>
        !el || !el.isConnected || String(el.value ?? "").trim() === "";
      // HOLD-CHECK timing:
      // - hydrationWatch adapters (Teamtailor/Recruitee): mutation-quiet
      //   ynSettleWrite (settle_observer.js) — re-query by selector, re-plan +
      //   ynExecuteIntents on empty/replaced nodes. Adapters that don't set
      //   hydrationWatch never take this path.
      // - everyone else: fixed [1400, 900] checkpoints, break when holding.
      // Whatever still will not hold → an accurate `reverted` (amber), never a false "filled".
      const watchAll = !!(adapter && adapter.hydrationWatch);
      const liveEl = new Map(); // fieldKey -> current live element
      for (const i of wrote) liveEl.set(i.fieldKey, i.el);

      // Derive a stable CSS selector for the observer (never cache el refs).
      const ynHoldSelector = (intent) => {
        if (!intent || !intent.el) return "";
        if (typeof ynSelectorPath === "function") {
          try {
            const s = ynSelectorPath(intent.el);
            if (s) return s;
          } catch {
            /* fall through */
          }
        }
        const el = intent.el;
        if (el.id) {
          try {
            return (
              "#" +
              (typeof CSS !== "undefined" && CSS.escape
                ? CSS.escape(el.id)
                : el.id)
            );
          } catch {
            return "#" + el.id;
          }
        }
        return "";
      };

      // Shared re-plan + re-execute for still-empty keys (full safety chain).
      // Heuristic-only pages (unknown ATS — no adapter) used to
      // get NO re-plan here, so a field the site re-rendered after our pass
      // was lost until a manual re-click. Re-running ynHeuristicIntents is
      // safe: it walks the full guard chain again (honeypot/password/EEO/
      // sensitive) and we retry ONLY the keys that went empty.
      const ynReplanEmpty = async (emptyKeys) => {
        if (!emptyKeys || !emptyKeys.size) return;
        let fresh = [];
        try {
          if (adapter && typeof adapter.plan === "function") {
            let p = adapter.plan(plan, document);
            if (p && typeof p.then === "function") p = await p;
            fresh = p || [];
          } else if (typeof ynHeuristicIntents === "function") {
            fresh = ynHeuristicIntents(plan, document, new Set()) || [];
          }
        } catch {
          fresh = [];
        }
        const retry = fresh.filter(
          (i) => ynHoldable(i) && emptyKeys.has(i.fieldKey),
        );
        for (const i of retry) liveEl.set(i.fieldKey, i.el); // refresh pointers
        if (retry.length && typeof ynExecuteIntents === "function") {
          try {
            await ynExecuteIntents(retry, { plan, ats, jobId });
          } catch {
            /* the final truth pass decides */
          }
        }
      };

      if (watchAll && typeof ynSettleWrite === "function") {
        // hydrationWatch path ONLY — mutation-quiet settle.
        // The fast path below is the original fixed-checkpoint loop, left
        // textually unchanged, so adapters that never set hydrationWatch
        // cannot regress through this change.
        const settleFields = [];
        for (const i of wrote) {
          const selector = ynHoldSelector(i);
          if (!selector) continue;
          settleFields.push({
            selector,
            value: i.value,
            kind: i.kind || "text",
            fieldKey: i.fieldKey,
            intent: i,
          });
        }
        let root = document.body || document.documentElement;
        for (const i of wrote) {
          if (i.el && i.el.closest) {
            const form =
              i.el.closest("form") ||
              i.el.closest("#job-application-form") ||
              i.el.closest("[id*='application']");
            if (form) {
              root = form;
              break;
            }
          }
        }
        if (settleFields.length) {
          try {
            await ynSettleWrite({
              root,
              fields: settleFields,
              // writeFn: REUSE re-plan + ynExecuteIntents (safety chain intact).
              // Observer only swaps timing (fixed checkpoints → mutation-quiet).
              writeFn: async ({ field }) => {
                const key = field && field.fieldKey;
                if (!key) return;
                await ynReplanEmpty(new Set([key]));
              },
              opts: {
                quietMs: 800,
                totalMs: 8000,
                maxRewrites: 6,
                // Match/beat old ~6s watch window: late value-clears (and
                // cold-start hydration) can land after an early calm.
                minMs: 5500,
                // .value="" does not fire MutationObserver — poll catches it.
                pollMs: 400,
              },
            });
          } catch (settleErr) {
            report.errors.push({
              fieldKey: "hold_check_settle",
              label: String(
                settleErr && settleErr.message ? settleErr.message : settleErr,
              ),
            });
          }
        }
        // Refresh liveEl from selectors after observer (nodes may be new).
        for (const f of settleFields) {
          try {
            const el =
              (root && root.querySelector && root.querySelector(f.selector)) ||
              (document.querySelector && document.querySelector(f.selector));
            if (el) liveEl.set(f.fieldKey, el);
          } catch {
            /* keep prior pointer */
          }
        }
      } else {
        // FAST PATH (and hydrationWatch fallback if settle_observer missing):
        // fixed checkpoints. Adapters that don't set hydrationWatch always
        // take this path. Do NOT change these timings — existing adapters on
        // this path depend on this exact behaviour.
        const CHECKPOINTS_MS = watchAll
          ? [1500, 1500, 1500, 1500] // legacy ~6s if ynSettleWrite absent
          : [1400, 900]; // fast path: settle, re-write once, confirm

        for (const waitMs of CHECKPOINTS_MS) {
          await new Promise((r) => setTimeout(r, waitMs));
          const emptyKeys = new Set();
          for (const [key, el] of liveEl) {
            if (ynEmptyNow(el)) emptyKeys.add(key);
          }
          // Fast path breaks the instant everything holds; the watch path keeps
          // looking because a late hydration wipe can still be coming.
          if (!emptyKeys.size) {
            if (!watchAll) break;
            continue;
          }
          await ynReplanEmpty(emptyKeys);
        }
      }

      // Final truth pass: any wrote-field that still does not hold moves out of
      // filled/guessed into report.reverted (surfaced amber in the overlay).
      const stillEmpty = new Set();
      if (watchAll) {
        // hydrationWatch adapters ONLY (Teamtailor/Recruitee): nodes may have
        // been REPLACED, so the cached el is stale — re-query by selector to
        // read the LIVE node. Scoped to watchAll so the truth check below for
        // other adapters stays byte-identical to the pre-observer behaviour
        // (those pages have no node-replacement, and an unscoped re-query
        // could read a duplicate).
        for (const i of wrote) {
          let el = liveEl.get(i.fieldKey);
          const sel = ynHoldSelector(i);
          if (sel) {
            try {
              const live =
                (document.querySelector && document.querySelector(sel)) || null;
              if (live) {
                el = live;
                liveEl.set(i.fieldKey, live);
              }
            } catch {
              /* keep el */
            }
          }
          if (ynEmptyNow(el)) stillEmpty.add(i.fieldKey);
        }
      } else {
        // Non-hydration-watch adapters (Greenhouse/Lever/Ashby + everyone
        // else): the original liveEl-only check, unchanged.
        for (const [key, el] of liveEl) {
          if (ynEmptyNow(el)) stillEmpty.add(key);
        }
      }
      if (stillEmpty.size) {
        report.reverted = report.reverted || [];
        for (const bucket of ["filled", "guessed"]) {
          report[bucket] = (report[bucket] || []).filter((e) => {
            if (e && stillEmpty.has(e.fieldKey)) {
              report.reverted.push(e);
              return false;
            }
            return true;
          });
        }
        for (const [key, el] of liveEl) {
          if (
            stillEmpty.has(key) &&
            el &&
            el.isConnected &&
            typeof ynHighlight === "function"
          ) {
            ynHighlight(el, "missed");
          }
        }
      }
    }
  } catch (e) {
    report.errors.push({
      fieldKey: "hold_check",
      label: String(e && e.message ? e.message : e),
    });
  }
}
