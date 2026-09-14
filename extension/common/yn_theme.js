// common/yn_theme.js — brand constants (hex colours, plus the radius/
// shadow/font-stack shape values) for content scripts that paint
// INLINE styles into host pages (the assist panel, the fill overlay,
// the field highlights): ext.css custom properties cannot reach a
// host page, so the values travel as constants. Consumers guard with
// `typeof YN_THEME !== "undefined"` because the node harnesses
// evaluate single files; their literal fallbacks are pinned to these
// same values by tests/test_extension_theme.py.
/* GENERATED FROM the site's design tokens — do not hand-edit */
"use strict";
const YN_THEME = {
  primary: "#0b8160", // --primary
  primaryDeep: "#0a4c3a", // --primary-deep
  primaryContrast: "#ffffff", // --primary-contrast
  accent: "#ff7a59", // --accent
  ink: "#12211b", // --text
  warning: "#8a5a12", // --warning
  borderStrong: "#cbd8d0", // --border-strong
  surface: "#ffffff", // --surface
  border: "#e4ebe6", // --border
  radiusSm: "12px", // --radius-sm
  shadowPop: "0 2px 4px rgba(18, 33, 27, 0.05), 0 8px 24px rgba(18, 33, 27, 0.1)", // --shadow-pop
  fontUi: "\"Inter\", system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif", // --font-ui
};
/* END GENERATED */
