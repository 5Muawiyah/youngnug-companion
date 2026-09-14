// content/dom_fill_kit.js, part 6 of 6 - the on-page fill highlight
// (colour-by-confidence) and its badge, plus the selector-path builder
// used to describe a field for a report row. See index.js for the
// file's full header and history.

// ─── Per-field highlight ────────────────────────────────────────────────────
// Rules live in ext.css for the popup; on ATS pages we inject the same
// yn-fill-* / .yn-badge block once (content scripts cannot load the full
// popup stylesheet without restyling the employer form).
// Light-DOM class rules alone are NOT enough: fields inside OPEN shadow roots
// (Ashby, SmartRecruiters) do not inherit document.head stylesheets, so
// ynHighlight also paints outline/background as element.style (inline styles
// pierce shadow encapsulation; classes stay for tests / query selectors).
// Brand colours: common/yn_theme.js (generated from the site's tokens.css)
// loads earlier in every injection stack; the literal fallback keeps this
// file self-contained for the node harnesses that evaluate it alone, and
// tests/test_extension_theme.py pins the fallback to the same tokens.
export const YN_HIGHLIGHT_COLORS =
  typeof YN_THEME !== "undefined"
    ? YN_THEME
    : {
        primary: "#0b8160", // --primary
        warning: "#8a5a12", // --warning
        borderStrong: "#cbd8d0", // --border-strong
      };

/** "#rrggbb" + alpha -> "rgba(r, g, b, a)" for the soft highlight fills. */
export function ynHexAlpha(hex, alpha) {
  const n = Number.parseInt(String(hex).replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const YN_HIGHLIGHT = {
  filled: {
    cls: "yn-fill-ok",
    outline: `2px solid ${YN_HIGHLIGHT_COLORS.primary}`,
    outlineOffset: "1px",
    backgroundColor: ynHexAlpha(YN_HIGHLIGHT_COLORS.primary, 0.08),
  },
  check: {
    cls: "yn-fill-check",
    outline: `2px solid ${YN_HIGHLIGHT_COLORS.warning}`,
    outlineOffset: "1px",
    backgroundColor: ynHexAlpha(YN_HIGHLIGHT_COLORS.warning, 0.1),
  },
  missed: {
    cls: "yn-fill-missed",
    outline: `2px solid ${YN_HIGHLIGHT_COLORS.borderStrong}`,
    outlineOffset: "1px",
    backgroundColor: ynHexAlpha(YN_HIGHLIGHT_COLORS.borderStrong, 0.2),
  },
};

export function ynEnsureHighlightStyles() {
  if (document.getElementById("yn-fill-styles")) return;
  const style = document.createElement("style");
  style.id = "yn-fill-styles";
  const paint = (state) =>
    `outline:${YN_HIGHLIGHT[state].outline}!important;outline-offset:1px;` +
    `background-color:${YN_HIGHLIGHT[state].backgroundColor}!important`;
  style.textContent =
    `.yn-fill-ok{${paint("filled")}}` +
    `.yn-fill-check{${paint("check")}}` +
    `.yn-fill-missed{${paint("missed")}}` +
    ".yn-badge{position:fixed;top:12px;right:12px;z-index:2147483646;" +
    "min-width:2.5rem;padding:4px 10px;border-radius:999px;background:" +
    YN_HIGHLIGHT_COLORS.primary +
    ";color:#fff;font:600 12px/1.4 system-ui,sans-serif;text-align:center;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:none}";
  (document.head || document.documentElement).appendChild(style);
}

export function ynHighlight(el, state) {
  if (!el || !el.classList) return;
  ynEnsureHighlightStyles();
  el.classList.remove("yn-fill-ok", "yn-fill-check", "yn-fill-missed");
  const paint = YN_HIGHLIGHT[state];
  if (!paint) return;
  el.classList.add(paint.cls);
  // Inline outline/bg so shadow-encapsulated fields still paint (class CSS
  // from document.head cannot reach them). Only set outline/background —
  // never touch border/padding or wipe unrelated inline styles.
  try {
    el.style.outline = paint.outline;
    el.style.outlineOffset = paint.outlineOffset;
    el.style.backgroundColor = paint.backgroundColor;
  } catch {
    /* some hosts reject style writes; class still applied for light DOM */
  }
}

// Minimal floating count badge (one per page).
export function ynUpdateFillBadge(filled, total) {
  ynEnsureHighlightStyles();
  let badge = document.getElementById("yn-fill-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "yn-fill-badge";
    badge.className = "yn-badge";
    badge.setAttribute("aria-live", "polite");
    document.documentElement.appendChild(badge);
  }
  badge.textContent = `${filled}/${total}`;
}

// ─── Selector path for field-map cache ──────────────────────────────────────
export function ynSelectorPath(el) {
  if (!el || el.nodeType !== 1) return "";
  if (el.id) return `#${CSS.escape(el.id)}`;
  const parts = [];
  let cur = el;
  while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
    let part = cur.tagName.toLowerCase();
    if (cur.name) part += `[name="${CSS.escape(cur.name)}"]`;
    else {
      const parent = cur.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter(
          (c) => c.tagName === cur.tagName,
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
    }
    parts.unshift(part);
    if (cur.id) {
      parts[0] = `#${CSS.escape(cur.id)}`;
      break;
    }
    cur = cur.parentElement;
    if (parts.length > 8) break;
  }
  return parts.join(" > ");
}
