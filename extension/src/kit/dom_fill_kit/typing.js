// content/dom_fill_kit.js, part 3 of 6 - per-character typed input
// and contenteditable writing for rich-text-styled boxes. See index.js
// for the file's full header and history.
import { ynMakeEvent } from "./core.js";

// ─── Per-character second-pass writer (narrow; readback-failure only) ──────
// lifted from https://github.com/kitswas/job-autofill/blob/7f19ae4feaeff7037f536507a9c8c80ea698cb0c/apps/extension/src/content/applier.ts#L60-L118 (BSD-2-Clause), adapted
// lifted from https://github.com/superfill-ai/superfill.ai/blob/8f2f45117245092164406063ef033374f2b2236d/src/entrypoints/content/lib/dom-fill-strategies.ts#L24-L77 (MIT, Phase 1 self-hosted path), adapted
// Changes made: merged the two sources' per-character loops into one
// function; a real keydown/keyup pair is dispatched for every character
// EXCEPT a literal space (typed values can legitimately contain one — "New
// York" — and this codebase's own forbidden-key rule reads a dispatched
// KeyboardEvent whose key is a control name, so a space char is instead
// applied through the native setter + InputEvent alone, never through a
// KeyboardEvent at all); control characters (newline, tab, escape) in a
// value are skipped outright rather than dispatched as Enter/Tab/Escape;
// removed the sources' own artificial per-keystroke delay's randomness
// (superfill.ai's `30 + random*20`) for deterministic tests, keeping a
// short fixed pacing instead; never runs on a password-kind field.
export const YN_TYPE_PACE_MS = 4;

export async function ynTypeValuePerChar(el, value) {
  if (!el) return false;
  const type = (el.type || "").toLowerCase();
  if (type === "password") return false; // never on password kinds
  const tag = (el.tagName || "").toUpperCase();
  if (tag !== "INPUT" && tag !== "TEXTAREA") return false;

  try {
    el.focus({ preventScroll: true });
  } catch {
    /* ignore */
  }

  const proto =
    tag === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  const setVal = (v) => {
    if (desc && desc.set) desc.set.call(el, v);
    else el.value = v;
  };

  setVal("");
  const target = value == null ? "" : String(value);
  let acc = "";
  for (const ch of target) {
    if (ch === "\n" || ch === "\t" || ch === "\x1b") continue; // never Enter/Tab/Escape
    acc += ch;
    const isSpace = ch === " ";
    if (!isSpace) {
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: ch, bubbles: true, cancelable: true }),
      );
    }
    setVal(acc);
    el.dispatchEvent(
      ynMakeEvent("InputEvent", "input", { bubbles: true, inputType: "insertText", data: ch }),
    );
    if (!isSpace) {
      el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
    }
    // eslint-disable-next-line no-await-in-loop -- deliberate per-char pacing
    await new Promise((r) => setTimeout(r, YN_TYPE_PACE_MS));
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(ynMakeEvent("FocusEvent", "blur", { bubbles: true }));
  return String(el.value || "") === target;
}

// ─── Plain-text contenteditable writer (scoped) ─────────────────────────────
// idea only (no code copied) from
// https://github.com/Br1an67/OpenJobAutofill/blob/005eda98841b3671ead615ebfde5922f0dfd7c36/src/content.js#L6416-L6421
// (setContentEditableValue) — MIT, but this function is a fresh
// implementation, not a port: the source is four lines with no scoping
// check at all, and the whole point of this function is the refusal it lacks.
export const YN_RICH_TEXT_MARKERS = [
  "ql-editor", // Quill
  "ProseMirror",
  "public-DraftEditor-content", // Draft.js
  "tox-edit-area", // TinyMCE
  "mce-content-body",
];

export function ynIsPlainContentEditable(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable !== true) return false;
  let node = el;
  let depth = 0;
  while (node && depth < 6) {
    const cls = String(node.className || "");
    if (YN_RICH_TEXT_MARKERS.some((m) => cls.includes(m))) return false;
    node = node.parentElement;
    depth += 1;
  }
  // No child BLOCK elements — a framework editor represents its content as
  // a tree of <p>/<div>/<li> nodes; a plain editable field's content is text
  // (and maybe inline <br> from a soft return), never block structure.
  const blockTags = new Set([
    "DIV",
    "P",
    "UL",
    "OL",
    "LI",
    "H1",
    "H2",
    "H3",
    "BLOCKQUOTE",
    "TABLE",
  ]);
  for (const child of el.children || []) {
    if (blockTags.has((child.tagName || "").toUpperCase())) return false;
  }
  return true;
}

export function ynWriteContentEditablePlain(el, value) {
  if (!ynIsPlainContentEditable(el)) return false;
  try {
    el.focus();
    const strValue = value == null ? "" : String(value);
    el.textContent = strValue;
    el.dispatchEvent(
      ynMakeEvent("InputEvent", "input", {
        bubbles: true,
        inputType: "insertText",
        data: strValue,
      }),
    );
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(ynMakeEvent("FocusEvent", "blur", { bubbles: true }));
    return String(el.textContent || "") === strValue;
  } catch {
    return false;
  }
}
