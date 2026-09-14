// content/engine.js, part 2 of 9 — the account-creation / sign-in wall's
// PASSWORD-SCOPING half: every visible password's tight scope (form, named
// auth widget, or bounded content neighbourhood). ynQueryDeep is a
// content/dom_fill_kit.js global, referenced here as a bare name exactly as
// the single-file version did. ynIsHoneypot comes from this same shipped
// file's honeypot.js. See index.js for the file's full history.
import { ynIsHoneypot } from "./honeypot.js";
export function ynVisiblePasswordsIn(root, doc) {
  const document_ = doc || document;
  if (!root) return [];
  let passwords = [];
  try {
    if (typeof ynQueryDeep === "function") {
      passwords = ynQueryDeep(root, 'input[type="password"]');
    } else if (root.querySelectorAll) {
      passwords = [...root.querySelectorAll('input[type="password"]')];
    }
  } catch {
    passwords = [];
  }
  const out = [];
  for (const p of passwords) {
    if (!p) continue;
    try {
      if (typeof ynIsHoneypot === "function" && ynIsHoneypot(p, document_)) {
        continue; // hidden trap password does not count
      }
    } catch {
      /* probe failed — treat as real (safe direction = wall) */
    }
    out.push(p);
  }
  return out;
}

export function ynHasVisiblePassword(root, doc) {
  return ynVisiblePasswordsIn(root, doc).length > 0;
}

/**
 * Nearest ancestor <form>, walking up through open shadow hosts when needed.
 */
export function ynNearestForm(el) {
  let node = el;
  while (node) {
    try {
      if (node.tagName && String(node.tagName).toLowerCase() === "form") {
        return node;
      }
    } catch {
      /* ignore */
    }
    if (node.parentElement) {
      node = node.parentElement;
      continue;
    }
    // Cross open-shadow boundary: field inside shadow → host → light tree
    try {
      const root = node.getRootNode && node.getRootNode();
      if (root && root.host) {
        node = root.host;
        continue;
      }
    } catch {
      /* ignore */
    }
    break;
  }
  return null;
}

// Auth-widget id/class signal (tight container for formless passwords).
// "account" is intentionally broad — NEAREST match wins, so a .login-widget
// inside #account-application scopes to the widget, not the outer wrapper.
export const YN_AUTH_WIDGET_SEL =
  '[class*="login" i], [class*="log-in" i], [class*="signin" i], ' +
  '[class*="sign-in" i], [class*="signup" i], [class*="sign-up" i], ' +
  '[class*="register" i], [class*="registration" i], ' +
  '[class*="create-account" i], [class*="createaccount" i], ' +
  '[class*="account" i], ' +
  '[id*="login" i], [id*="log-in" i], [id*="signin" i], ' +
  '[id*="sign-in" i], [id*="signup" i], [id*="sign-up" i], ' +
  '[id*="register" i], [id*="registration" i], ' +
  '[id*="create-account" i], [id*="createaccount" i], ' +
  '[id*="account" i]';

export const YN_AUTH_HEADING_RE =
  /create\s+account|sign\s*in|log\s*in|register|sign\s*up/i;

// Compat alias for older selector name (tests/docs may still mention it).
export const YN_ACCOUNT_CONTAINER_SEL = YN_AUTH_WIDGET_SEL;

/**
 * Nearest auth-widget ancestor of el (id/class signal, or fieldset/section
 * whose own nearest heading matches login/signup phrases). Used only as
 * scope(P) when password P has no <form> ancestor.
 */
export function ynNearestAccountContainer(el, doc) {
  const document_ = doc || document;
  let node = el && el.parentElement;
  while (
    node &&
    node !== document_ &&
    node !== document_.documentElement &&
    node !== document_.body
  ) {
    try {
      if (node.matches && node.matches(YN_AUTH_WIDGET_SEL)) {
        return node;
      }
      const tag = node.tagName && String(node.tagName).toLowerCase();
      if (tag === "fieldset" || tag === "section") {
        const heading = node.querySelector(
          "legend, h1, h2, h3, h4, h5, h6, [role='heading']",
        );
        const ht = heading
          ? String(heading.textContent || "")
              .replace(/\s+/g, " ")
              .trim()
          : "";
        if (ht && YN_AUTH_HEADING_RE.test(ht)) {
          return node;
        }
      }
    } catch {
      /* matches() can throw on exotic nodes — keep walking */
    }
    if (node.parentElement) {
      node = node.parentElement;
      continue;
    }
    try {
      const root = node.getRootNode && node.getRootNode();
      if (root && root.host) {
        node = root.host;
        continue;
      }
    } catch {
      /* ignore */
    }
    break;
  }
  return null;
}

/**
 * Tier-3 fallback: outermost content wrapper enclosing a formless,
 * container-less, heading-less password. Nesting-proof (no hop cap).
 *
 * Rationale: a password with NO form, NO named auth container, and NO auth
 * heading gives no reliable local scoping signal; the SAFE assumption is that
 * its whole top-level content region is account/auth-sensitive, so we wall
 * generously there. This is the rare case (real signups almost always have a
 * <form> or a named container caught by tiers 1-2); erring toward under-fill
 * here never leaks a credential and never wrongly submits. It CANNOT reopen
 * the earlier "broad wrapper over-block" bug because that bug's guest field is
 * walled/unwalled by a NAMED login container (tier 2), not by tier-3.
 *
 * Walk up from the password to the HIGHEST ancestor that is still a strict
 * descendant of <body> (or <main>/[role=main] if one encloses the password) —
 * i.e. the top-level content block just below body/main. Never return body /
 * documentElement / document / a <main>/[role=main] itself (stop at its child).
 * If the password is a direct child of body/main, return the password element
 * itself (no content wrapper above it). Cross shadow boundaries via
 * getRootNode().host.
 */
export function ynBoundedPasswordNeighbourhood(passwordEl, doc) {
  const document_ = doc || document;
  if (!passwordEl) return null;

  // Ceiling = main/[role=main] that encloses the password, else body.
  let ceiling = document_.body || null;
  try {
    let probe = passwordEl;
    while (probe) {
      if (
        probe === document_.body ||
        probe === document_.documentElement ||
        probe === document_
      ) {
        break;
      }
      try {
        const tag = probe.tagName && String(probe.tagName).toLowerCase();
        let role = "";
        try {
          role = String(
            (probe.getAttribute && probe.getAttribute("role")) || "",
          ).toLowerCase();
        } catch {
          role = "";
        }
        if (tag === "main" || role === "main") {
          ceiling = probe;
          break;
        }
      } catch {
        /* ignore exotic nodes */
      }
      let next = null;
      try {
        next = probe.parentElement;
        if (!next) {
          const root = probe.getRootNode && probe.getRootNode();
          if (root && root.host) next = root.host;
        }
      } catch {
        next = null;
      }
      if (!next) break;
      probe = next;
    }
  } catch {
    ceiling = document_.body || null;
  }

  // Walk to the highest strict descendant of ceiling (top-level content
  // block under body/main). Never adopt ceiling / body / html / document.
  let node = passwordEl;
  let outermost = passwordEl;
  while (true) {
    let parent = null;
    try {
      parent = node.parentElement;
      if (!parent) {
        const root = node.getRootNode && node.getRootNode();
        if (root && root.host) parent = root.host;
      }
    } catch {
      parent = null;
    }
    if (!parent) break;
    if (
      parent === ceiling ||
      parent === document_.body ||
      parent === document_.documentElement ||
      parent === document_
    ) {
      break;
    }
    // If ceiling is body but we somehow meet a main ancestor we did not set
    // as ceiling, still never return main itself — treat it as a stop shell
    // only when it IS the ceiling (handled above). Continue through non-ceiling
    // ancestors so nesting depth cannot defeat the wall.
    outermost = parent;
    node = parent;
  }
  return outermost;
}

/**
 * scope(P) for one visible non-honeypot password:
 *   1. P's nearest <form> ancestor, else
 *   2. nearest auth-widget ancestor, else
 *   3. outermost content wrapper under body/main (nesting-proof; never body/html/main).
 */
export function ynPasswordScope(passwordEl, doc) {
  if (!passwordEl) return null;
  const document_ = doc || document;
  try {
    const form = ynNearestForm(passwordEl);
    if (form) return form;
    const auth = ynNearestAccountContainer(passwordEl, document_);
    if (auth) return auth;
    return ynBoundedPasswordNeighbourhood(passwordEl, document_);
  } catch {
    return null;
  }
}

/**
 * One scope element per visible non-honeypot password on the page (deduped).
 */
export function ynPasswordScopes(doc) {
  const document_ = doc || document;
  const passwords = ynVisiblePasswordsIn(document_, document_);
  const scopes = [];
  const seen = new Set();
  for (const p of passwords) {
    let scope = null;
    try {
      scope = ynPasswordScope(p, document_);
    } catch {
      scope = null;
    }
    if (!scope || seen.has(scope)) continue;
    seen.add(scope);
    scopes.push(scope);
  }
  return scopes;
}
