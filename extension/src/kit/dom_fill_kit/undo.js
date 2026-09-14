// content/dom_fill_kit.js, part 4 of 6 - the undo-a-fill session:
// stash-before-write, clearing a field's highlight, and reverting a
// whole run. See index.js for the file's full header and history.
import { ynSetNativeValue } from "./core.js";

// ─── Undo stash (this fill only; the engine half of Undo) ───────────────
// lifted from https://github.com/myowinthein/job-buddy/blob/d8c0a699acc6e2ee785379e9a7638fbbad70e850/src/autofill/filler.ts#L214-L262 (MIT), adapted
// lifted from https://github.com/myowinthein/job-buddy/blob/d8c0a699acc6e2ee785379e9a7638fbbad70e850/src/autofill/index.ts#L51-L68,293-308 (MIT), adapted
// Changes made: ported to plain JS; the source stashes ELEMENTS ONLY (it
// always clears to empty, since every tracked field started empty) — this
// stashes each element's ACTUAL prior value/checked/state, so a field that
// held partial text before the write restores to that text, not to empty;
// kind-aware (checkbox/radio/select/file/text all restore differently,
// where the source's setEmpty() only had DOM-instance branches); the popup
// Undo button and its message wiring live in the popup's own files —
// this is the stash-and-restore half only.
export let ynUndoSession = [];

export function ynResetUndoSession() {
  ynUndoSession = [];
}

export function ynStashForUndo(entry) {
  if (!entry || !entry.el) return;
  ynUndoSession.push(entry);
}

export function ynClearElementHighlight(el) {
  if (!el) return;
  try {
    el.classList.remove("yn-fill-ok", "yn-fill-check", "yn-fill-missed");
    el.style.outline = "";
    el.style.outlineOffset = "";
    el.style.backgroundColor = "";
  } catch {
    /* some hosts reject style writes */
  }
}

/**
 * Revert every field THIS fill run wrote, to its pre-write state. Never
 * touches an element outside the stash (a value the student typed is never
 * in it). Clears twice — once synchronously here, once in a queued
 * microtask — because a controlled framework input can reconcile inside the
 * dispatched input event and restore the just-cleared value before control
 * returns; the microtask runs after that re-render and applies the same
 * clear again.
 *
 * @returns {{reverted:number, total:number}}
 */
export function ynUndoFill() {
  const stash = ynUndoSession;
  ynUndoSession = [];
  let reverted = 0;

  const restoreOnce = (entry) => {
    const el = entry.el;
    if (!el || !el.isConnected) return;
    try {
      if (entry.kind === "checkbox" || entry.kind === "radio") {
        if (el.checked !== Boolean(entry.prior)) {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "checked",
          ).set;
          if (setter) setter.call(el, Boolean(entry.prior));
          else el.checked = Boolean(entry.prior);
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } else if (entry.kind === "file") {
        try {
          el.files = new DataTransfer().files;
        } catch {
          /* some browsers refuse an assigned empty FileList; best-effort */
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (entry.kind === "contenteditable") {
        el.textContent = entry.prior || "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        // text, textarea, select, combobox, date, aria_choice-as-text: the
        // native setter covers select/text/textarea; a custom ARIA control
        // with no .value falls through to textContent as a best effort —
        // full-fidelity undo of an exotic widget's internal state is not
        // guaranteed, only that it never keeps a value it should not.
        if ("value" in el) {
          ynSetNativeValue(el, entry.prior || "");
        } else {
          el.textContent = entry.prior || "";
        }
      }
    } catch {
      /* best-effort revert; never throw out of Undo */
    }
  };

  for (const entry of stash) {
    restoreOnce(entry);
    ynClearElementHighlight(entry.el);
    reverted += 1;
    queueMicrotask(() => restoreOnce(entry));
  }

  try {
    const badge = document.getElementById("yn-fill-badge");
    if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
  } catch {
    /* badge is optional */
  }

  return { reverted, total: stash.length };
}
