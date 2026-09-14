// content/settle_observer.js, part 2 of 2 - hold classification
// (ynClassifyHold) and the read-back verification pass (ynVerifyWrites)
// run after a batch of writes. See index.js for the file's full header
// and history.
import { ynSettleWrite } from "./write.js";

// ─── Verify-only, kind-aware hold-check ───────────────────────
// A fresh, additive function rather than a new mode on ynSettleWrite above:
// ynSettleWrite's job is re-WRITING through hydration, with its own callers
// and its own pinned test suite; this one only ever OBSERVES a value that
// engine.js already wrote, deciding whether the page kept it, reformatted it
// (a phone mask), or silently reverted it. Keeping them separate means this
// row cannot regress ynSettleWrite's existing behaviour by construction.
//
// idea only (no code copied) from
// https://github.com/averatec0773/offeros/blob/c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94/apps/extension/src/lib/autofill/dom-fill.ts#L1091-L1276
// (textWriteLanded's per-branch verification approach) and from
// https://github.com/Azoo92i/AutoApplyMax/blob/f7121414b6d0437515b6bd73bbb6cbaaa4149380/content-simple.js#L1436-L1477
// (AGPL — idea only, no lines copied: the observation "scan for a
// role=alert/known error class near a touched field" is engine.js's own
// site_flagged scan, not this function; that source's discard-and-continue
// response to a validation error is explicitly NOT taken — this function
// never retries or navigates, only classifies).

/** What the live element says now, against what engine.js expected. */
export function ynClassifyHold(el, kind, expected) {
  if (!el || el.isConnected === false) return "cleared_after_fill";
  const k = String(kind || "text").toLowerCase();

  if (k === "checkbox" || k === "radio") {
    const got = Boolean(el.checked);
    const want = Boolean(expected);
    if (got === want) return "held";
    return got ? "rejected" : "cleared_after_fill";
  }
  if (k === "file") {
    return el.files && el.files.length > 0 ? "held" : "cleared_after_fill";
  }
  if (k === "select") {
    const opt = el.selectedOptions && el.selectedOptions[0];
    const got = opt ? String(opt.value || "") : "";
    const want = String(expected == null ? "" : expected);
    if (got === want) return "held";
    return got === "" ? "cleared_after_fill" : "rejected";
  }

  const squash = (s) =>
    String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  if (k === "combobox") {
    const got = "value" in el ? el.value : el.textContent || "";
    const gotTrim = String(got || "").trim();
    if (!gotTrim) return "cleared_after_fill";
    return squash(got) === squash(expected) ? "held" : "rejected";
  }

  // text / textarea
  const got = String(el.value == null ? "" : el.value);
  const want = String(expected == null ? "" : expected);
  if (got === want) return "held";
  if (got.trim() === "") return "cleared_after_fill";
  return squash(got) === squash(want) ? "equivalent_after_mask" : "rejected";
}

/**
 * Watch a batch of already-written fields for a short, bounded window and
 * classify each: "held" (unchanged), "equivalent_after_mask" (a page
 * reformat, still the same answer), "cleared_after_fill" (now empty),
 * "rejected" (holds something else). No writeFn, no rewriting — purely an
 * observation, so a field the page reverts is reported honestly instead of
 * staying a false "filled".
 *
 * @param {Array<{el:Element, kind:string, value:*, fieldKey?:string}>} items
 * @param {{quietMs?:number, totalMs?:number}} [opts]
 * @returns {Promise<Array<{fieldKey:string, status:string}>>} same order as items
 */
export function ynVerifyWrites(items, opts) {
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
          /* already gone */
        }
      }
      resolve(
        list.map((it) => ({
          fieldKey: it.fieldKey || "",
          status: ynClassifyHold(it.el, it.kind, it.value),
        })),
      );
    }

    function armQuiet() {
      if (settled) return;
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quietMs);
    }

    try {
      const roots = new Set();
      for (const it of list) {
        if (!it || !it.el) continue;
        const root =
          typeof it.el.getRootNode === "function" ? it.el.getRootNode() : document;
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
              characterData: true,
            });
          } catch {
            /* invalid observe target — skip it, hard cap still applies */
          }
        }
      }
    } catch {
      /* no MutationObserver in this environment — hard cap still resolves */
    }

    hardTimer = setTimeout(finish, totalMs);
    armQuiet();
  });
}
