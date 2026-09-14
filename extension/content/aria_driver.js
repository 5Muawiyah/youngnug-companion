(() => {
  // extension/src/kit/aria_driver/primitives.js
  var YN_ARIA_OPEN_KEYS = [
    { key: "ArrowDown", altKey: false },
    { key: "ArrowDown", altKey: true }
  ];
  function ynAriaSleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function ynAriaPressPointer(el) {
    const guard = ynKitGuards.clickGuard;
    if (!guard || guard(el)) return;
    const view = el.ownerDocument && el.ownerDocument.defaultView || window;
    const init = { bubbles: true, cancelable: true, button: 0, view };
    const Pointer = view.PointerEvent;
    if (Pointer) {
      el.dispatchEvent(
        new Pointer("pointerdown", { ...init, pointerId: 1, isPrimary: true })
      );
    }
    el.dispatchEvent(new MouseEvent("mousedown", init));
    if (Pointer) {
      el.dispatchEvent(
        new Pointer("pointerup", { ...init, pointerId: 1, isPrimary: true })
      );
    }
    el.dispatchEvent(new MouseEvent("mouseup", init));
    el.click();
  }
  function ynAriaPressKey(el, key, altKey) {
    const init = { bubbles: true, cancelable: true, key, altKey: !!altKey };
    el.dispatchEvent(new KeyboardEvent("keydown", init));
    el.dispatchEvent(new KeyboardEvent("keyup", init));
  }
  function ynAriaIsPopupControl(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement && !el.getAttribute("role") && !el.getAttribute("aria-haspopup")) {
      return false;
    }
    const role = el.getAttribute("role");
    const popup = el.getAttribute("aria-haspopup");
    return role === "combobox" || role === "listbox" || popup === "listbox" || popup === "menu" || popup === "true";
  }
  var YN_ARIA_OPTION_ROLES = ["radio", "checkbox", "switch"];
  var YN_ARIA_OPTION_SELECTOR = YN_ARIA_OPTION_ROLES.map(
    (r) => `[role="${r}"]`
  ).join(", ");
  function ynAriaIsChoice(el) {
    if (!el || el instanceof HTMLInputElement) return false;
    const role = el.getAttribute && el.getAttribute("role");
    if (role === "radiogroup") {
      return Boolean(el.querySelector && el.querySelector(YN_ARIA_OPTION_SELECTOR));
    }
    return YN_ARIA_OPTION_ROLES.includes(role || "");
  }
  function ynAriaTextOf(el) {
    return String(el && (el.textContent || el.innerText) || "").replace(/\s+/g, " ").trim();
  }
  function ynAriaControlValue(el) {
    const activeId = el.getAttribute && el.getAttribute("aria-activedescendant");
    if (activeId) {
      const doc = el.ownerDocument || document;
      const active = doc.getElementById(activeId);
      if (active) return ynAriaTextOf(active);
    }
    const text = ynAriaTextOf(el);
    return /^(select|select one|select\.\.\.|select…|choose|choose one|-+)$/i.test(
      text
    ) ? "" : text;
  }
  function ynAriaOptionsIn(root) {
    const deep = typeof ynQueryDeep === "function" ? ynQueryDeep(root, '[role="option"]') : Array.from(root.querySelectorAll('[role="option"]'));
    return deep;
  }
  function ynAriaFindPopup(el, beforeSet) {
    const doc = el.ownerDocument || document;
    const named = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    if (named) {
      for (const id of named.split(/\s+/).filter(Boolean)) {
        const node = doc.getElementById(id);
        if (node && ynAriaOptionsIn(node).length > 0) return node;
      }
    }
    const lists = typeof ynQueryDeep === "function" ? ynQueryDeep(doc, '[role="listbox"], [role="menu"]') : Array.from(doc.querySelectorAll('[role="listbox"], [role="menu"]'));
    for (const lb of lists) {
      if (!beforeSet.has(lb) && ynAriaOptionsIn(lb).length > 0) return lb;
    }
    return void 0;
  }
  var YN_ARIA_TYPEABLE_TYPES = /* @__PURE__ */ new Set([
    "",
    "text",
    "search",
    "tel",
    "email",
    "url",
    "number"
  ]);
  function ynAriaTypeableWithin(el) {
    if (el.isContentEditable) return el;
    if (el instanceof HTMLInputElement && !el.readOnly && !el.disabled && YN_ARIA_TYPEABLE_TYPES.has((el.type || "").toLowerCase())) {
      return el;
    }
    const nodes = typeof ynQueryDeep === "function" ? ynQueryDeep(el, "input") : Array.from(el.querySelectorAll("input"));
    for (const node of nodes) {
      if (!(node instanceof HTMLInputElement)) continue;
      if (node.readOnly || node.disabled) continue;
      if (!YN_ARIA_TYPEABLE_TYPES.has((node.type || "").toLowerCase())) continue;
      return node;
    }
    return null;
  }
  function ynAriaSetTyped(target, value) {
    if (target instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set;
      if (setter) setter.call(target, value);
      else target.value = value;
    } else {
      target.textContent = value;
    }
    target.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: value })
    );
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function ynAriaReadTyped(target) {
    return target instanceof HTMLInputElement ? target.value : target.textContent || "";
  }
  function ynAriaSquash(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  async function ynAriaTypeAsText(el, value) {
    const target = ynAriaTypeableWithin(el);
    if (!target) return false;
    if (target instanceof HTMLInputElement) target.focus();
    ynAriaSetTyped(target, value);
    await ynAriaSleep(100);
    const got = String(ynAriaReadTyped(target) || "").trim();
    return got !== "" && ynAriaSquash(got) === ynAriaSquash(value);
  }
  var YN_ARIA_OPEN_TIMEOUT_MS = 2e3;
  var YN_ARIA_COMMIT_TIMEOUT_MS = 1200;
  var YN_ARIA_POLL_MS = 100;

  // extension/src/kit/aria_driver/popup_fill.js
  async function ynAriaOpenPopup(el, beforeSet, targetLabel) {
    const typeable = ynAriaTypeableWithin(el);
    if (typeable && targetLabel) {
      if (typeable instanceof HTMLInputElement) typeable.focus();
      ynAriaSetTyped(typeable, targetLabel);
    }
    const gestures = [
      () => {
        if (typeof el.focus === "function") el.focus();
        ynAriaPressPointer(el);
      },
      () => ynAriaPressKey(el, YN_ARIA_OPEN_KEYS[0].key, YN_ARIA_OPEN_KEYS[0].altKey),
      () => ynAriaPressKey(el, YN_ARIA_OPEN_KEYS[1].key, YN_ARIA_OPEN_KEYS[1].altKey)
    ];
    const perGesture = Math.max(
      1,
      Math.floor(YN_ARIA_OPEN_TIMEOUT_MS / gestures.length / YN_ARIA_POLL_MS)
    );
    for (const gesture of gestures) {
      gesture();
      for (let i = 0; i < perGesture; i += 1) {
        await ynAriaSleep(YN_ARIA_POLL_MS);
        const popup = ynAriaFindPopup(el, beforeSet);
        if (popup) return popup;
      }
    }
    return void 0;
  }
  function ynAriaMatchOptions(optionEls, targetLabel) {
    if (typeof ynBestOptionMatch !== "function") return null;
    return ynBestOptionMatch(optionEls, targetLabel);
  }
  async function ynAriaFillPopup(el, targetLabel) {
    const current = ynAriaControlValue(el);
    if (current !== "" && ynAriaSquash(current) === ynAriaSquash(targetLabel)) {
      return { ok: true, alreadySet: true };
    }
    const doc = el.ownerDocument || document;
    const before = new Set(
      typeof ynQueryDeep === "function" ? ynQueryDeep(doc, '[role="listbox"], [role="menu"]') : doc.querySelectorAll('[role="listbox"], [role="menu"]')
    );
    const popup = await ynAriaOpenPopup(el, before, targetLabel);
    if (!popup) {
      if (await ynAriaTypeAsText(el, targetLabel)) {
        return { ok: true, typed: true };
      }
      return { ok: false, reason: "no_popup" };
    }
    let opts = ynAriaOptionsIn(popup);
    const optionsDeadline = Date.now() + 1200;
    while (opts.length === 0 && Date.now() < optionsDeadline) {
      await ynAriaSleep(YN_ARIA_POLL_MS);
      opts = ynAriaOptionsIn(popup);
    }
    const hit = ynAriaMatchOptions(opts, targetLabel);
    if (!hit) {
      const closeGuard = ynKitGuards.clickGuard;
      if (el.getAttribute("aria-expanded") === "true" && closeGuard && !closeGuard(el)) {
        el.click();
      }
      return { ok: false, reason: opts.length ? "ambiguous_or_no_match" : "empty_popup" };
    }
    const guard = ynKitGuards.clickGuard;
    if (!guard || guard(hit)) return { ok: false, reason: "guard_refused" };
    hit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    hit.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
    hit.click();
    const want = ynAriaTextOf(hit);
    for (let i = 0; i < YN_ARIA_COMMIT_TIMEOUT_MS / YN_ARIA_POLL_MS; i += 1) {
      if (hit.getAttribute("aria-selected") === "true") return { ok: true, matched: hit };
      if (hit.getAttribute("aria-checked") === "true") return { ok: true, matched: hit };
      const now = ynAriaControlValue(el);
      if (now !== "" && ynAriaSquash(now) === ynAriaSquash(want)) {
        return { ok: true, matched: hit };
      }
      await ynAriaSleep(YN_ARIA_POLL_MS);
    }
    return { ok: false, reason: "unconfirmed" };
  }

  // extension/src/kit/aria_driver/choice_fill.js
  function ynAriaGroupMembers(el) {
    const role = el.getAttribute("role");
    if (role === "radiogroup") {
      return Array.from(el.querySelectorAll(YN_ARIA_OPTION_SELECTOR));
    }
    const selector = `[role="${role}"]`;
    const group = el.closest(
      '[role="radiogroup"], [role="group"], fieldset'
    );
    if (group) return Array.from(group.querySelectorAll(selector));
    let scope = el.parentElement;
    while (scope && scope.querySelectorAll(selector).length < 2) {
      scope = scope.parentElement;
    }
    return Array.from((scope || el).querySelectorAll(selector));
  }
  function ynAriaOptionLabel(el) {
    return el.getAttribute("aria-label") || ynAriaTextOf(el);
  }
  async function ynAriaFillChoice(el, targetLabel) {
    const members = ynAriaGroupMembers(el);
    const hit = ynAriaMatchOptions(members, targetLabel);
    if (!hit) return { ok: false, reason: "ambiguous_or_no_match" };
    if (hit.getAttribute("aria-checked") === "true") return { ok: true, alreadySet: true };
    const guard = ynKitGuards.clickGuard;
    if (!guard || guard(hit)) return { ok: false, reason: "guard_refused" };
    hit.click();
    for (let i = 0; i < YN_ARIA_COMMIT_TIMEOUT_MS / YN_ARIA_POLL_MS; i += 1) {
      if (hit.getAttribute("aria-checked") === "true") return { ok: true, matched: hit };
      await ynAriaSleep(YN_ARIA_POLL_MS);
    }
    return { ok: false, reason: "unconfirmed" };
  }

  // extension/src/kit/aria_driver/index.js
  globalThis.YN_ARIA_OPEN_KEYS = YN_ARIA_OPEN_KEYS;
  globalThis.ynAriaSleep = ynAriaSleep;
  globalThis.ynAriaPressPointer = ynAriaPressPointer;
  globalThis.ynAriaPressKey = ynAriaPressKey;
  globalThis.ynAriaIsPopupControl = ynAriaIsPopupControl;
  globalThis.YN_ARIA_OPTION_ROLES = YN_ARIA_OPTION_ROLES;
  globalThis.YN_ARIA_OPTION_SELECTOR = YN_ARIA_OPTION_SELECTOR;
  globalThis.ynAriaIsChoice = ynAriaIsChoice;
  globalThis.ynAriaTextOf = ynAriaTextOf;
  globalThis.ynAriaControlValue = ynAriaControlValue;
  globalThis.ynAriaOptionsIn = ynAriaOptionsIn;
  globalThis.ynAriaFindPopup = ynAriaFindPopup;
  globalThis.YN_ARIA_TYPEABLE_TYPES = YN_ARIA_TYPEABLE_TYPES;
  globalThis.ynAriaTypeableWithin = ynAriaTypeableWithin;
  globalThis.ynAriaSetTyped = ynAriaSetTyped;
  globalThis.ynAriaReadTyped = ynAriaReadTyped;
  globalThis.ynAriaSquash = ynAriaSquash;
  globalThis.ynAriaTypeAsText = ynAriaTypeAsText;
  globalThis.YN_ARIA_OPEN_TIMEOUT_MS = YN_ARIA_OPEN_TIMEOUT_MS;
  globalThis.YN_ARIA_COMMIT_TIMEOUT_MS = YN_ARIA_COMMIT_TIMEOUT_MS;
  globalThis.YN_ARIA_POLL_MS = YN_ARIA_POLL_MS;
  globalThis.ynAriaOpenPopup = ynAriaOpenPopup;
  globalThis.ynAriaMatchOptions = ynAriaMatchOptions;
  globalThis.ynAriaFillPopup = ynAriaFillPopup;
  globalThis.ynAriaGroupMembers = ynAriaGroupMembers;
  globalThis.ynAriaOptionLabel = ynAriaOptionLabel;
  globalThis.ynAriaFillChoice = ynAriaFillChoice;
})();
if (typeof window !== "undefined") {
  window.ynAriaIsPopupControl = globalThis.ynAriaIsPopupControl;
  window.ynAriaIsChoice = globalThis.ynAriaIsChoice;
  window.ynAriaControlValue = globalThis.ynAriaControlValue;
  window.ynAriaFillPopup = globalThis.ynAriaFillPopup;
  window.ynAriaFillChoice = globalThis.ynAriaFillChoice;
  window.ynAriaGroupMembers = globalThis.ynAriaGroupMembers;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ynAriaIsPopupControl: globalThis.ynAriaIsPopupControl,
    ynAriaIsChoice: globalThis.ynAriaIsChoice,
    ynAriaControlValue: globalThis.ynAriaControlValue,
    ynAriaFillPopup: globalThis.ynAriaFillPopup,
    ynAriaFillChoice: globalThis.ynAriaFillChoice,
    ynAriaGroupMembers: globalThis.ynAriaGroupMembers,
  };
}
