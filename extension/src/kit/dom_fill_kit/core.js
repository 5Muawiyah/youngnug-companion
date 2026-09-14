// content/dom_fill_kit.js, part 1 of 6 - the shared guard slot
// (ynKitGuards/ynKitInit), the native-setter value write and the
// shadow-piercing query helpers every other part uses. See index.js
// for the file's full header and history.

// ─── Injected safety dependencies (never imported) ──────────────────────────
// The single-file original read `var ynKitGuards = ynKitGuards || {...}` so a
// re-injected classic script would not stomp a guard an earlier injection had
// already wired via ynKitInit. That self-reference has no equivalent inside a
// bundled ES module (a fresh module instance's own binding is always
// undefined the first time it is read), and it is not load-bearing here
// anyway: engine.js — always injected immediately after this file, in both
// YN_FILL_SCRIPTS and YN_POSTING_SCRIPTS — unconditionally calls
// ynKitInit({ clickGuard: ynSubmitGuard }) at its own top level on every
// single injection, so the guard is always re-wired correctly regardless.
// Failing closed (no guard = every click refused) is the one behaviour this
// default must keep, and it does.
export let ynKitGuards = { clickGuard: null };
// Event constructors, tolerant of a context that lacks the richer ones (a
// minimal harness DOM): a real page always has InputEvent / FocusEvent /
// PointerEvent, and where one is missing a plain Event of the same type
// still reaches every listener.
export function ynMakeEvent(ctorName, type, init) {
  const Ctor = typeof globalThis[ctorName] === "function" ? globalThis[ctorName] : null;
  try {
    if (Ctor) return new Ctor(type, init);
  } catch {
    /* fall through to the plain event */
  }
  return new Event(type, { bubbles: !!(init && init.bubbles), cancelable: !!(init && init.cancelable) });
}

export function ynKitInit(guards) {
  // Mutate the SAME object in place rather than reassigning to a new one.
  // index.js copies the object reference onto globalThis.ynKitGuards once,
  // at bundle load, so every OTHER shipped file's bare `ynKitGuards.
  // clickGuard` read (aria_driver.js, skills_fill.js, …) resolves against
  // globalThis, not this module's own binding — reassigning this binding to
  // a fresh object (the single-file original's `ynKitGuards = {...}`, safe
  // there because the classic-script global WAS this same variable) would
  // leave those other files reading the stale object the reassignment left
  // behind. Object.assign onto the existing object keeps every reference —
  // this module's own and globalThis's — pointed at the one guard state.
  Object.assign(ynKitGuards, guards || {});
}

// ─── React-proof native value write ─────────────────────────────────────────
// el.value = x is patched by React and silently reverts. Write through the
// real HTML*Element.prototype setter so _valueTracker sees a discrepancy,
// then fire bubbling input+change so framework listeners run.
export function ynSetNativeValue(el, value) {
  if (!el) return;
  const tag = (el.tagName || "").toUpperCase();
  const type = (el.type || "").toLowerCase();

  if (type === "checkbox" || type === "radio") {
    const desired = Boolean(value);
    // A real .click() BOTH toggles .checked AND notifies React/Angular through
    // their synthetic-event system, landing on the right controlled state.
    // Pre-setting .checked via the native setter and THEN clicking toggles a
    // second time (click flips checked), so it lands on the WRONG state — the
    // exact bug the react_controlled fixture caught. So click only when a
    // change is actually needed; native .click() already fires click+change.
    //
    // NEVER-SUBMIT NOTE: this click is deliberately NOT routed through
    // ynSubmitGuard, and that is safe BY ELEMENT TYPE — we are inside the
    // checkbox/radio branch, and clicking a checkbox/radio can only toggle the
    // control; it can never submit a form (a submit control is type=submit/
    // button, which never reaches here). The name-based guard would instead
    // wrongly refuse a legitimate consent checkbox whose label contains the
    // word "submit". Pinned by test_every_click_in_content_is_guarded_or_a_checkbox_toggle.
    if (el.checked !== desired) {
      el.click();
    }
    // Belt-and-braces for frameworks that only listen on change (harmless when
    // the click above already fired one — a boolean setter is idempotent).
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  let proto;
  if (tag === "TEXTAREA") proto = window.HTMLTextAreaElement.prototype;
  else if (tag === "SELECT") proto = window.HTMLSelectElement.prototype;
  else proto = window.HTMLInputElement.prototype;

  const strValue = value == null ? "" : String(value);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");

  if (tag !== "SELECT") {
    // Focus before the write (matches a real keystroke's order) so the
    // blur below is a genuine focus-then-blur transition, not a blur event
    // fired at an element that was never focused.
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* some elements refuse focus; the events below still bubble */
    }
  }

  if (desc && desc.set) desc.set.call(el, strValue);
  else el.value = strValue;

  if (tag === "SELECT") {
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    // lifted from https://github.com/myowinthein/job-buddy/blob/d8c0a699acc6e2ee785379e9a7638fbbad70e850/src/autofill/filler.ts#L42-L66 (MIT), adapted
    // Changes made: ported to plain JS; folded the source's separate
    // dispatchEvents(element, inputType, data) helper directly into the
    // native-setter write path rather than keeping it a standalone export,
    // since this file's ynSetNativeValue is the one place every write goes
    // through. A plain Event('input') is silently ignored by validators that
    // check `event instanceof InputEvent` or read `inputType` (React Hook
    // Form + Zod among them); the FocusEvent('blur') gives libraries keying
    // "touched" state off `instanceof FocusEvent` a genuine touched flag.
    el.dispatchEvent(
      ynMakeEvent("InputEvent", "input", {
        bubbles: true,
        inputType: "insertText",
        data: strValue,
      }),
    );
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(ynMakeEvent("FocusEvent", "blur", { bubbles: true }));
  }
}

// ─── Open-shadow-root deep query ────────────────────────────────────────────
export function ynQueryDeep(root, selector) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    try {
      if (node.querySelectorAll) {
        out.push(...node.querySelectorAll(selector));
      }
    } catch {
      /* bad selector against this root — skip */
    }
    // Open shadow on THIS node — required when root is a custom-element host
    // (e.g. spl-dropzone): querySelectorAll on the host does not pierce, and
    // a host with no light children would otherwise never enter its shadow.
    if (node.shadowRoot) walk(node.shadowRoot);
    const all = node.querySelectorAll ? node.querySelectorAll("*") : [];
    for (const el of all) {
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(root || document);
  return out;
}

// ─── Shared adapter helpers (ynAda*) ────────────────────────────────────────
// Dedup of the identical helpers that every ATS adapter re-defined with only a
// name prefix (Gh/Lv/As/Sr/Ic/Wd). Label-string only for reporting — never used
// to choose which element or value an intent targets.

/** Deep-then-light first match for a CSS selector (null if none / bad selector). */
export function ynAdaFind(doc, selector) {
  if (typeof ynQueryDeep === "function") {
    const hits = ynQueryDeep(doc || document, selector);
    return hits[0] || null;
  }
  try {
    return (doc || document).querySelector(selector);
  } catch {
    return null;
  }
}

/** Deep-then-light all matches for a CSS selector (array; empty on bad selector). */
export function ynAdaFindAll(doc, selector) {
  if (typeof ynQueryDeep === "function") {
    return ynQueryDeep(doc || document, selector);
  }
  try {
    return [...(doc || document).querySelectorAll(selector)];
  } catch {
    return [];
  }
}
