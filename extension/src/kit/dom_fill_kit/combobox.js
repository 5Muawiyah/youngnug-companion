// content/dom_fill_kit.js, part 2 of 6 - waiting for a condition
// (ynWaitFor), option matching (ynBestOptionMatch) and the native
// <select>/cascading-select drivers built on them. See index.js for
// the file's full header and history.
import { ynKitGuards, ynMakeEvent, ynKitInit, ynSetNativeValue, ynQueryDeep } from "./core.js";

// ─── Debounced MutationObserver wait (never throws) ─────────────────────────
// Survives pushState SPA transitions: one observer per call, lives until
// resolve/timeout; do not assume a fresh content-script injection per step.
export function ynWaitFor(predicateOrSelector, opts) {
  const options = opts || {};
  const timeoutMs = options.timeoutMs != null ? options.timeoutMs : 8000;
  const root = options.root || document;
  const debounceMs = options.debounceMs != null ? options.debounceMs : 80;

  const check = () => {
    try {
      if (typeof predicateOrSelector === "function") {
        return predicateOrSelector(root) || null;
      }
      // selector: prefer deep query so shadow widgets are visible
      const hits = ynQueryDeep(root, predicateOrSelector);
      return hits[0] || null;
    } catch {
      return null;
    }
  };

  return new Promise((resolve) => {
    const existing = check();
    if (existing) {
      resolve(existing);
      return;
    }

    let debounceTimer = null;
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      try {
        observer.disconnect();
      } catch {
        /* already gone */
      }
      clearTimeout(timer);
      clearTimeout(debounceTimer);
      resolve(val);
    };

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const found = check();
        if (found) finish(found);
      }, debounceMs);
    });

    const observeTarget =
      root === document || root === document.documentElement
        ? document.documentElement
        : root;
    try {
      observer.observe(observeTarget, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    } catch {
      finish(null);
      return;
    }

    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

// ─── Combobox / typeahead drive ─────────────────────────────────────────────
// exact > startsWith > includes; ambiguous multi-match at best tier = fail
// (never pick a wrong option on a weak/ambiguous match).
export function ynBestOptionMatch(options, targetLabel) {
  const target = String(targetLabel || "")
    .trim()
    .toLowerCase();
  if (!target || !options.length) return null;

  const texts = options.map((o) => ({
    el: o,
    t: (o.textContent || o.innerText || "").trim().toLowerCase(),
  }));

  const exact = texts.filter((x) => x.t === target);
  if (exact.length === 1) return exact[0].el;
  if (exact.length > 1) return null; // ambiguous

  const starts = texts.filter(
    (x) => x.t.startsWith(target) || target.startsWith(x.t),
  );
  if (starts.length === 1) return starts[0].el;
  if (starts.length > 1) {
    // prefer the longest option text that starts with target (or vice versa)
    const strict = texts.filter((x) => x.t.startsWith(target));
    if (strict.length === 1) return strict[0].el;
    return null;
  }

  const includes = texts.filter(
    (x) => x.t.includes(target) || target.includes(x.t),
  );
  if (includes.length === 1) return includes[0].el;
  return null; // zero or ambiguous — refuse rather than guess
}

/**
 * Drive a combobox/typeahead to a target label.
 *
 * Two rungs, tried in order:
 *  1. A generic ARIA popup control (role=combobox/listbox, aria-haspopup) —
 *     the widget declares its own contract, so content/aria_driver.js's
 *     ynAriaFillPopup drives it: real gesture, popup discovery by
 *     aria-controls/aria-owns or by diffing open listboxes (shadow-piercing),
 *     exact/unique-substring match, full pointer sequence, and a fill is
 *     reported ONLY when aria-selected/aria-checked or the control's own
 *     rendered text confirms it.
 *  2. A plain text input backing a light-DOM popup (the shape most existing
 *     ATS typeaheads use, with no ARIA role on the input itself): type,
 *     wait for a document-wide options scan, match, click.
 *
 * Neither rung EVER reports filled on "the input holds SOME text" alone —
 * that was the bug (`after` counted alone in the old acceptance check): a
 * combobox whose popup never confirmed a selection is a miss, whatever text
 * is left sitting in the box.
 */
export async function ynDriveCombobox(inputEl, targetLabel) {
  if (!inputEl) return { ok: false, matched: null };
  try {
    if (
      typeof ynAriaIsPopupControl === "function" &&
      ynAriaIsPopupControl(inputEl)
    ) {
      const r = await ynAriaFillPopup(inputEl, targetLabel);
      return {
        ok: Boolean(r && r.ok),
        matched: (r && r.matched) || null,
        error: r && !r.ok ? r.reason : undefined,
      };
    }

    inputEl.focus();
    ynSetNativeValue(inputEl, targetLabel);

    const found = await ynWaitFor(
      () => {
        const opts = [
          ...document.querySelectorAll('[role="option"]'),
          ...document.querySelectorAll("[class*='option']"),
          ...document.querySelectorAll("li[data-value], li[role='option']"),
        ];
        // de-dupe
        return [...new Set(opts)].length ? true : null;
      },
      { timeoutMs: 3000, root: document },
    );
    if (!found) return { ok: false, matched: null };

    const options = [
      ...new Set([
        ...document.querySelectorAll('[role="option"]'),
        ...document.querySelectorAll("[class*='option']"),
        ...document.querySelectorAll("li[data-value], li[role='option']"),
      ]),
    ].filter((o) => (o.textContent || "").trim());

    const match = ynBestOptionMatch(options, targetLabel);
    if (!match) return { ok: false, matched: null };

    // clickGuard is the INJECTED never-submit guard (ynSubmitGuard at
    // runtime, wired by the private safety core via ynKitInit). The kit never
    // references the guard by name; with none injected we FAIL CLOSED.
    const ynClickGuard = ynKitGuards.clickGuard;
    if (!ynClickGuard || ynClickGuard(match))
      return { ok: false, matched: null };

    match.dispatchEvent(ynMakeEvent("PointerEvent", "pointerdown", { bubbles: true }));
    match.dispatchEvent(ynMakeEvent("MouseEvent", "mouseup", { bubbles: true }));
    match.click();

    // verify input or a sibling hidden field changed toward the label —
    // NEVER on "the input holds any text at all" (that accepted a
    // combobox whose popup never actually confirmed anything).
    const after = (inputEl.value || "").trim().toLowerCase();
    const want = String(targetLabel).trim().toLowerCase();
    const hidden = inputEl
      .closest("form, [role='group'], div")
      ?.querySelector?.('input[type="hidden"]');
    const hiddenOk =
      hidden &&
      String(hidden.value || "")
        .toLowerCase()
        .includes(want.slice(0, 12));
    const ok =
      after === want ||
      after.includes(want) ||
      want.includes(after) ||
      Boolean(hiddenOk) ||
      match.getAttribute("aria-selected") === "true";

    return { ok: Boolean(ok), matched: match };
  } catch (e) {
    return { ok: false, matched: null, error: String(e) };
  }
}

/**
 * Cascading dropdowns (country -> region -> city, or any N-level chain of
 * native <select>s the page repopulates on 'change'): match each level
 * exact-or-unique against ITS CURRENT options, wait for the next level to
 * refresh, re-scan. An ambiguous level stops the whole chain there — no
 * later level is ever touched on a level it could not resolve honestly.
 *
 * lifted as an idea only (no code copied) from
 * https://github.com/Br1an67/OpenJobAutofill/blob/005eda98841b3671ead615ebfde5922f0dfd7c36/src/content.js#L5942-L5977
 * (tryFillHierarchicalChoiceOptions's re-scan-after-each-level mechanism;
 * its value SPLITTER is Chinese-geography specific and is not used here —
 * this function takes an already-split parts[] array) and from
 * atharvakarval-dev/Form-Flow-AI's conditional_handler.py CASCADE_PATTERNS
 * table (no licence in that repo; idea only, no lines copied).
 *
 * @param {HTMLSelectElement[]} levelEls - one <select> per level, in order
 * @param {string[]} parts - one target label per level
 * @returns {Promise<{ok:boolean, stoppedAtLevel:number, reason?:string}>}
 */
export async function ynDriveCascade(levelEls, parts) {
  const levels = Array.isArray(levelEls) ? levelEls : [];
  const values = Array.isArray(parts) ? parts : [];
  for (let i = 0; i < levels.length && i < values.length; i++) {
    const el = levels[i];
    const part = values[i];
    if (!el || (el.tagName || "").toUpperCase() !== "SELECT") {
      return { ok: false, stoppedAtLevel: i, reason: "missing_level" };
    }
    const opts = [...el.options];
    const target = String(part || "")
      .trim()
      .toLowerCase();
    const texts = opts.map((o) => ({
      o,
      t: (o.textContent || "").trim().toLowerCase(),
    }));
    const exact = texts.filter((x) => x.t === target);
    let hit = null;
    if (exact.length === 1) {
      hit = exact[0].o;
    } else if (exact.length > 1) {
      return { ok: false, stoppedAtLevel: i, reason: "ambiguous" };
    } else {
      const sub = target ? texts.filter((x) => x.t.includes(target)) : [];
      if (sub.length === 1) hit = sub[0].o;
      else if (sub.length > 1) {
        return { ok: false, stoppedAtLevel: i, reason: "ambiguous" };
      }
    }
    if (!hit) return { ok: false, stoppedAtLevel: i, reason: "no_match" };

    ynSetNativeValue(el, hit.value);

    const next = levels[i + 1];
    if (next) {
      const before = [...next.options].map((o) => o.value + "|" + o.textContent).join(",");
      await ynWaitFor(
        () => {
          const now = [...next.options]
            .map((o) => o.value + "|" + o.textContent)
            .join(",");
          return now !== before ? true : null;
        },
        { timeoutMs: 1500, root: next },
      );
    }
  }
  return { ok: true, stoppedAtLevel: -1 };
}
