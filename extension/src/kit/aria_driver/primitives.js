// content/aria_driver.js, part 1 of 3 — pointer/keyboard primitives, popup
// and choice-widget recognition, and the typed-fallback helpers every other
// part of this driver shares. See index.js for the file's full history and
// what changed from the source it was lifted from.
//
// ynQueryDeep, ynKitGuards and ynBestOptionMatch are NOT declared in this
// bundle — they are content/dom_fill_kit.js globals, injected into the page
// before this file and referenced here exactly as the original file
// referenced them: as bare names resolved at runtime, unchanged by this
// split.

// ─── Pointer / keyboard primitives ──────────────────────────────────────────
// ArrowDown and Alt+ArrowDown ONLY — the two keyboard openers the ARIA
// combobox pattern specifies that are never activation keys. Enter and Space
// are deliberately never sent: either can mean "submit" to a page, and this
// file is not the place to decide that a submit was meant.
export const YN_ARIA_OPEN_KEYS = [
  { key: "ArrowDown", altKey: false },
  { key: "ArrowDown", altKey: true },
];

export function ynAriaSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function ynAriaPressPointer(el) {
  // Opening a widget is still a click on a real page element, so it passes
  // through the SAME injected never-submit guard (ynSubmitGuard at runtime,
  // wired via ynKitInit) every other click in this file goes through —
  // fail closed with none injected, exactly like dom_fill_kit.js's own
  // combobox click.
  const guard = ynKitGuards.clickGuard;
  if (!guard || guard(el)) return;
  const view = (el.ownerDocument && el.ownerDocument.defaultView) || window;
  const init = { bubbles: true, cancelable: true, button: 0, view };
  const Pointer = view.PointerEvent;
  if (Pointer) {
    el.dispatchEvent(
      new Pointer("pointerdown", { ...init, pointerId: 1, isPrimary: true }),
    );
  }
  el.dispatchEvent(new MouseEvent("mousedown", init));
  if (Pointer) {
    el.dispatchEvent(
      new Pointer("pointerup", { ...init, pointerId: 1, isPrimary: true }),
    );
  }
  el.dispatchEvent(new MouseEvent("mouseup", init));
  el.click(); // ynSubmitGuard already checked above (guard(el)) before any of this ran
}

export function ynAriaPressKey(el, key, altKey) {
  const init = { bubbles: true, cancelable: true, key, altKey: !!altKey };
  el.dispatchEvent(new KeyboardEvent("keydown", init));
  el.dispatchEvent(new KeyboardEvent("keyup", init));
}

// ─── Control / popup recognition ────────────────────────────────────────────
/** A control that opens a list, as the page itself declares. Native form
 * controls are excluded — they have their own, more precise paths. */
export function ynAriaIsPopupControl(el) {
  if (!el || el.nodeType !== 1) return false;
  if (
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement &&
      !el.getAttribute("role") &&
      !el.getAttribute("aria-haspopup"))
  ) {
    return false;
  }
  const role = el.getAttribute("role");
  const popup = el.getAttribute("aria-haspopup");
  return (
    role === "combobox" ||
    role === "listbox" ||
    popup === "listbox" ||
    popup === "menu" ||
    popup === "true"
  );
}

export const YN_ARIA_OPTION_ROLES = ["radio", "checkbox", "switch"];
export const YN_ARIA_OPTION_SELECTOR = YN_ARIA_OPTION_ROLES.map(
  (r) => `[role="${r}"]`,
).join(", ");

export function ynAriaIsChoice(el) {
  if (!el || el instanceof HTMLInputElement) return false;
  const role = el.getAttribute && el.getAttribute("role");
  if (role === "radiogroup") {
    return Boolean(el.querySelector && el.querySelector(YN_ARIA_OPTION_SELECTOR));
  }
  return YN_ARIA_OPTION_ROLES.includes(role || "");
}

export function ynAriaTextOf(el) {
  return String((el && (el.textContent || el.innerText)) || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function ynAriaControlValue(el) {
  const activeId = el.getAttribute && el.getAttribute("aria-activedescendant");
  if (activeId) {
    const doc = el.ownerDocument || document;
    const active = doc.getElementById(activeId);
    if (active) return ynAriaTextOf(active);
  }
  const text = ynAriaTextOf(el);
  return /^(select|select one|select\.\.\.|select…|choose|choose one|-+)$/i.test(
    text,
  )
    ? ""
    : text;
}

/** Every [role=option] a popup offers, in DOM order, shadow roots included. */
export function ynAriaOptionsIn(root) {
  const deep =
    typeof ynQueryDeep === "function"
      ? ynQueryDeep(root, '[role="option"]')
      : Array.from(root.querySelectorAll('[role="option"]'));
  return deep;
}

/** The popup this control owns: aria-controls/aria-owns names it outright;
 * otherwise a listbox/menu that was NOT present before the open gesture is
 * the one the gesture opened. Searched document-wide (deep, shadow-piercing)
 * because a popup is as likely portalled to <body> as to be a child, and one
 * of the seven fixtures hosts its listbox inside an open shadow root. */
export function ynAriaFindPopup(el, beforeSet) {
  const doc = el.ownerDocument || document;
  const named = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
  if (named) {
    for (const id of named.split(/\s+/).filter(Boolean)) {
      const node = doc.getElementById(id);
      if (node && ynAriaOptionsIn(node).length > 0) return node;
    }
  }
  const lists =
    typeof ynQueryDeep === "function"
      ? ynQueryDeep(doc, '[role="listbox"], [role="menu"]')
      : Array.from(doc.querySelectorAll('[role="listbox"], [role="menu"]'));
  for (const lb of lists) {
    if (!beforeSet.has(lb) && ynAriaOptionsIn(lb).length > 0) return lb;
  }
  return undefined;
}

export const YN_ARIA_TYPEABLE_TYPES = new Set([
  "",
  "text",
  "search",
  "tel",
  "email",
  "url",
  "number",
]);

/** A box inside this control a person could actually type into — never the
 * control itself when that control is a <select> (typing into one is
 * meaningless; an honest failure there is the right answer). Deep query so
 * a wrapper's typeable input living in shadow DOM is still found. */
export function ynAriaTypeableWithin(el) {
  if (el.isContentEditable) return el;
  // The control itself may BE the typeable box (a react-select-style input
  // carrying role="combobox" directly, rather than a wrapper around one).
  if (
    el instanceof HTMLInputElement &&
    !el.readOnly &&
    !el.disabled &&
    YN_ARIA_TYPEABLE_TYPES.has((el.type || "").toLowerCase())
  ) {
    return el;
  }
  const nodes =
    typeof ynQueryDeep === "function"
      ? ynQueryDeep(el, "input")
      : Array.from(el.querySelectorAll("input"));
  for (const node of nodes) {
    if (!(node instanceof HTMLInputElement)) continue;
    if (node.readOnly || node.disabled) continue;
    if (!YN_ARIA_TYPEABLE_TYPES.has((node.type || "").toLowerCase())) continue;
    return node;
  }
  return null;
}

export function ynAriaSetTyped(target, value) {
  if (target instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    if (setter) setter.call(target, value);
    else target.value = value;
  } else {
    target.textContent = value;
  }
  target.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
  );
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

export function ynAriaReadTyped(target) {
  return target instanceof HTMLInputElement
    ? target.value
    : target.textContent || "";
}

export function ynAriaSquash(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Type the value in and let the page have the last word — a controlled
 * widget that means to own its value will wipe what was typed a tick later,
 * and reporting that as filled is the one thing this function must not do. */
export async function ynAriaTypeAsText(el, value) {
  const target = ynAriaTypeableWithin(el);
  if (!target) return false;
  if (target instanceof HTMLInputElement) target.focus();
  ynAriaSetTyped(target, value);
  await ynAriaSleep(100);
  const got = String(ynAriaReadTyped(target) || "").trim();
  return got !== "" && ynAriaSquash(got) === ynAriaSquash(value);
}

export const YN_ARIA_OPEN_TIMEOUT_MS = 2000;
export const YN_ARIA_COMMIT_TIMEOUT_MS = 1200;
export const YN_ARIA_POLL_MS = 100;
