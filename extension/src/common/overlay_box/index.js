// common/overlay_box.js — the ONE definition of the on-page report/status
// box (#yn-overlay). Three call sites used to paint their own copy of this
// box (report_state.js's ynOverlay, the assist wall panel, the employer
// posting overlay) with near-identical, quietly diverging inline style
// strings. This is the single definition all three call instead — a
// separate shipped file, not an ES import, because extension/src's own
// module-graph rule (tests/test_extension_module_graph.py) never lets a
// shipped file's source reach into another shipped file's folder; cross-file
// calls stay bare-global calls at runtime, resolved after esbuild has run,
// exactly like YN_THEME below.
//
// A closed attachShadow means a host page's own CSS — including an
// `!important` rule aggressive enough to repaint any element on the page —
// cannot reach a single node inside the box, cascade OR inheritance (the
// `all: initial` below resets what the shadow tree would otherwise inherit
// from the host page, such as its font or line-height). YN_THEME is a
// common/yn_theme.js global (generated from tokens.css), referenced here as
// a bare name exactly as every other content script does; the fallback
// literals are pinned to the same values by tests/test_extension_theme.py.
//
// The close button only ever hides this box — it cancels no fill, reverts
// no field, sends no message. Dismissal is scoped to the current tab's
// current URL and survives a re-render of the SAME report, but a fresh
// user-initiated fill or posting attempt calls ynOverlayClearDismissal so
// the next report gets its own fresh box — see fa_setup.js,
// fill_any_page.js and posting_filler/index.js for the three call sites.
//
// Dismissal is tracked in memory (a Set on globalThis), deliberately NOT in
// sessionStorage/localStorage: assist.js generates a student's password
// locally and test_assist_pins.py's egress guard refuses ANY storage-API
// call anywhere in that bundle on principle, dismissal included, since a
// storage sink is exactly the shape of surface a leak would use. globalThis
// is also what makes this shared correctly across filler.js and assist.js
// (they run in the same isolated world, both loaded before either needs the
// box — see the Escape-listener guard below for the same reasoning) — a
// plain module-local variable would not be shared, and this file is only
// ever injected once per world regardless (unlike an ES-imported module,
// which each importing bundle would otherwise inline its own copy of). It
// resets on navigation, same as the "for that tab and that URL" scope
// needs: a real reload gets a fresh isolated world and a fresh globalThis.

const YN_OVERLAY_ID = "yn-overlay";

function ynOverlayTheme() {
  const t = typeof YN_THEME !== "undefined" ? YN_THEME : null;
  return {
    primaryDeep: (t && t.primaryDeep) || "#0a4c3a",
    primaryContrast: (t && t.primaryContrast) || "#ffffff",
    surface: (t && t.surface) || "#ffffff",
    ink: (t && t.ink) || "#12211b",
    border: (t && t.border) || "#e4ebe6",
    radiusSm: (t && t.radiusSm) || "12px",
    shadowPop:
      (t && t.shadowPop) ||
      "0 2px 4px rgba(18, 33, 27, 0.05), 0 8px 24px rgba(18, 33, 27, 0.1)",
    fontUi:
      (t && t.fontUi) ||
      '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  };
}

function ynOverlayDismissedSet() {
  if (!globalThis.__ynOverlayDismissed) globalThis.__ynOverlayDismissed = new Set();
  return globalThis.__ynOverlayDismissed;
}

function ynOverlayIsDismissed() {
  return ynOverlayDismissedSet().has(location.href || "");
}

/**
 * Reset the per-page dismissal. Call at the START of a fresh, user-initiated
 * fill or posting attempt — a new Approve/Fill click means a new report, not
 * the one the student already closed. The "stays closed" scope is about a
 * re-render of THAT SAME report on the next DOM settle, never about the
 * student's next distinct action.
 */
function ynOverlayClearDismissal() {
  ynOverlayDismissedSet().delete(location.href || "");
}

function ynOverlayDismiss() {
  ynOverlayDismissedSet().add(location.href || "");
  const host = document.getElementById(YN_OVERLAY_ID);
  if (host) host.remove();
}

// One document-level Escape listener — this file is injected once per
// world, so the guard below is belt-and-braces against a double-injection
// re-running this file's top level, not against two separate bundles each
// carrying their own copy (there is only one copy now). Document-level, not
// scoped to the shadow root: focus is normally on the host page's own form
// fields, and a listener attached inside the shadow root would never see
// that keydown. Guarded on `document.addEventListener` existing, not just
// `document`: the node harnesses (e.g. tests/ext_fixtures/run_overlay_lines.mjs,
// run_assist_tests.mjs) evaluate a shipped file's whole bundle under vm with
// no DOM, or with a minimal document stub built for an older file's own
// needs — module load must never throw in either case.
if (
  typeof document !== "undefined" &&
  typeof document.addEventListener === "function" &&
  !globalThis.__ynOverlayEscBound
) {
  globalThis.__ynOverlayEscBound = true;
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && document.getElementById(YN_OVERLAY_ID)) {
        ynOverlayDismiss();
      }
    },
    true,
  );
}

/**
 * the box must not cover the form it is reporting on. A fixed
 * bottom-right corner is fine on most pages, but several ATSes (Greenhouse,
 * Workday) anchor their own Submit/Continue bar to that exact same corner
 * with `position: fixed` or `sticky`, so a flat 16px offset sits the box
 * directly on top of the button it must never auto-click. Measured on
 * representative fixtures (tests/ext_fixtures/overlay_box/): a plain 16px
 * offset overlapped the submit button on 2 of 3.
 *
 * A one-time, best-effort layout probe (never a MutationObserver — the box
 * only needs to clear the page's STATIC bottom bar at the moment it
 * appears): the tallest fixed/sticky element anchored to the viewport's
 * bottom edge and spanning a meaningful width is treated as a bottom action
 * bar, and the box sits above it. Capped at 2000 elements checked so this
 * can never be the slow part of a page with a huge DOM.
 */
function ynOverlayBottomOffset() {
  const BASE = 16;
  const MARGIN = 12;
  let tallest = 0;
  try {
    const vh = window.innerHeight || 0;
    const vw = window.innerWidth || 0;
    const nodes = document.querySelectorAll("body *");
    let checked = 0;
    for (const el of nodes) {
      if (checked++ > 2000) break;
      const rect = el.getBoundingClientRect();
      if (rect.height < 8 || rect.height > vh * 0.6) continue;
      if (rect.width < vw * 0.4) continue;
      if (Math.abs(rect.bottom - vh) > 4) continue; // anchored to the bottom edge
      const position = getComputedStyle(el).position;
      if (position !== "fixed" && position !== "sticky") continue;
      if (rect.height > tallest) tallest = rect.height;
    }
  } catch {
    /* best-effort layout probe — never block the box on a failed scan */
  }
  return tallest > 0 ? Math.round(tallest + MARGIN) : BASE;
}

function ynOverlayBuildHost() {
  const theme = ynOverlayTheme();
  const host = document.createElement("div");
  host.id = YN_OVERLAY_ID;
  host.style.cssText =
    "all:initial;position:fixed;right:16px;z-index:2147483647;bottom:" +
    ynOverlayBottomOffset() +
    "px;";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML =
    "<style>" /* style */ +
    ":host{all:initial;}" +
    "*{box-sizing:border-box;}" +
    ".yn-card{font-family:" +
    theme.fontUi +
    ";font-size:13px;line-height:1.5;background:" +
    theme.surface +
    ";color:" +
    theme.ink +
    ";border:1px solid " +
    theme.border +
    ";border-radius:" +
    theme.radiusSm +
    ";box-shadow:" +
    theme.shadowPop +
    ";width:320px;max-width:calc(100vw - 32px);overflow:hidden;}" +
    ".yn-head{display:flex;align-items:center;gap:8px;padding:10px 8px 10px 14px;" /* style */ +
    "background:" +
    theme.primaryDeep +
    ";color:" +
    theme.primaryContrast +
    ";}" +
    ".yn-brand{font-weight:700;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    ".yn-close{appearance:none;border:0;background:transparent;color:inherit;" +
    "cursor:pointer;padding:4px 6px;border-radius:6px;line-height:1;font-size:15px;flex:none;}" +
    ".yn-close:hover,.yn-close:focus-visible{background:rgba(255,255,255,.18);}" +
    ".yn-close:focus-visible{outline:2px solid " +
    theme.primaryContrast +
    ";outline-offset:1px;}" +
    ".yn-body{padding:10px 14px 12px;}" +
    ".yn-body:empty{padding:0;}" +
    // Content rows shared by the fill-report's collapsed/expanded disclosure
    // (overlay_report.js) — kept here rather than repeated per caller, same
    // reasoning as the chrome above.
    ".yn-summary{display:flex;align-items:center;justify-content:space-between;gap:8px;" /* style */ +
    "width:100%;background:transparent;border:0;padding:0;margin:0;font:inherit;" +
    "color:inherit;cursor:pointer;text-align:left;}" +
    ".yn-summary:hover,.yn-summary:focus-visible{opacity:.82;}" +
    ".yn-caret{font-size:11px;opacity:.65;flex:none;}" +
    ".yn-never{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;opacity:.85;}" /* style */ +
    ".yn-detail{margin-top:8px;padding-top:8px;border-top:1px solid " +
    theme.border +
    ";display:flex;flex-direction:column;gap:6px;}" +
    // A plain class selector ties the UA stylesheet's `[hidden]{display:
    // none}` on specificity, and an author rule wins a tie — so `.yn-detail`
    // above silently defeated `detail.hidden = true` and the box rendered
    // BOTH states at once (measured: 339px tall while "collapsed", covering
    // a submit button the acceptance criterion says it must clear). This
    // rule outranks it.
    ".yn-detail[hidden]{display:none;}" +
    ".yn-row{font-size:12px;display:flex;gap:6px;flex-wrap:wrap;}" +
    ".yn-row-label{font-weight:600;flex:none;}" +
    ".yn-row-value{opacity:.9;}" +
    ".yn-never-detail,.yn-percent-detail{font-style:italic;opacity:.85;}" +
    "</style>" +
    '<div class="yn-card" role="status">' +
    '<div class="yn-head">' +
    '<span class="yn-brand">YoungNug</span>' +
    '<button type="button" class="yn-close" aria-label="Close">✕</button>' +
    "</div>" +
    '<div class="yn-body"></div>' +
    "</div>";
  shadow.querySelector(".yn-close").addEventListener("click", () => ynOverlayDismiss());
  host.__ynShadow = shadow;
  return host;
}

/**
 * The box's content container, creating the shared chrome (shadow root,
 * brand header, close button) on first call in this page. Returns null
 * while the student has closed THIS page's box and no fresh fill/posting
 * attempt has cleared that dismissal yet — callers must treat null as
 * "paint nothing" and must not fall back to any other element.
 *
 * `mode: "closed"` means the shadow root is not reachable through the
 * standard `host.shadowRoot` accessor from outside this module, so the live
 * reference is stashed on the host node itself (`host.__ynShadow`) the one
 * time this module creates it — safe because it is still this SAME file's
 * own code reading that property back.
 */
function ynOverlayBox() {
  if (ynOverlayIsDismissed()) return null;
  let host = document.getElementById(YN_OVERLAY_ID);
  if (!host || !host.__ynShadow) {
    if (host) host.remove(); // a same-id node with no shadow ref is not ours
    host = ynOverlayBuildHost();
  }
  return host.__ynShadow.querySelector(".yn-body");
}

// Exposed as bare globals for every other injected file to call — the same
// pattern common/challenge_detect.js and common/yn_theme.js already use.
globalThis.ynOverlayBox = ynOverlayBox;
globalThis.ynOverlayClearDismissal = ynOverlayClearDismissal;
