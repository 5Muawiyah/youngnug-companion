// content/engine.js, part 3 of 9 — the account-creation / sign-in wall's
// FIELD-CLASSIFICATION half: which fields count as account-typed (for the
// tier-3 naked-password neighbourhood wall) and the page-level
// Create-Account signal. ynAdaFindAll / ynQueryDeep are content/
// dom_fill_kit.js globals, referenced here as bare names exactly as the
// single-file version did. See index.js for the file's full history.
import { ynIsHoneypot } from "./honeypot.js";
import { ynAdaLabelOf } from "./honeypot.js";
import {
  ynNearestForm,
  ynNearestAccountContainer,
  ynBoundedPasswordNeighbourhood,
  ynVisiblePasswordsIn,
} from "./password_scope.js";
// autocomplete tokens that mark identity/credential (account-typed) fields.
export const YN_ACCOUNT_TYPED_AC = new Set([
  "email",
  "username",
  "name",
  "given-name",
  "family-name",
  "tel",
  "new-password",
  "current-password",
]);

// name/id/placeholder/label signals for account identity fields.
export const YN_ACCOUNT_TYPED_SIGNAL_RE =
  /email|e-mail|user-?name|full-?name|first-?name|last-?name|phone|mobile/i;

/**
 * Fillable control (input/textarea) that is not submit/button/hidden/honeypot.
 * Used only by the tier-3 neighbourhood account-typed wall.
 */
export function ynIsFillableNonHoneypotField(el, doc) {
  if (!el) return false;
  try {
    const tag = el.tagName && String(el.tagName).toLowerCase();
    if (tag !== "input" && tag !== "textarea") return false;
    const type = String(el.type || "text").toLowerCase();
    if (
      type === "submit" ||
      type === "button" ||
      type === "hidden" ||
      type === "image" ||
      type === "reset" ||
      type === "file" ||
      type === "checkbox" ||
      type === "radio"
    ) {
      return false;
    }
    if (typeof ynIsHoneypot === "function" && ynIsHoneypot(el, doc)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * True when a fillable field signals identity/credential (account-typed):
 * autocomplete in {email, username, name, given-name, family-name, tel,
 * new-password, current-password} OR type=email|tel OR name/id/placeholder/
 * label matching the account-typed signal regex.
 */
export function ynIsAccountTypedField(el, doc) {
  if (!ynIsFillableNonHoneypotField(el, doc)) return false;
  try {
    const type = String(el.type || "text").toLowerCase();
    if (type === "email" || type === "tel") return true;

    let ac = "";
    try {
      ac = String(el.getAttribute("autocomplete") || "")
        .toLowerCase()
        .trim();
    } catch {
      ac = "";
    }
    if (ac) {
      // "section-billing email" / "username" — match any token.
      const tokens = ac.split(/\s+/);
      for (const t of tokens) {
        if (YN_ACCOUNT_TYPED_AC.has(t)) return true;
      }
    }

    const label =
      typeof ynAdaLabelOf === "function" ? ynAdaLabelOf(el, doc) : "";
    let placeholder = "";
    try {
      placeholder = String(el.getAttribute("placeholder") || "");
    } catch {
      placeholder = "";
    }
    const signal = [el.name || "", el.id || "", placeholder, label]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (signal && YN_ACCOUNT_TYPED_SIGNAL_RE.test(signal)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Tier-3 only: field is a member of P's immediate neighbourhood set —
 *   P.parentElement's direct children
 *   + direct children of P's tier-3 scope node
 *   + direct siblings of that scope node
 * Membership is DIRECT (field === node), not deep descendants — keeps the
 * blast radius bounded so a distant guest form is never walled by a naked
 * password elsewhere.
 */
export function ynFieldInNakedPasswordNeighbourhood(field, passwordEl, scopeEl) {
  if (!field || !passwordEl) return false;
  try {
    const parent = passwordEl.parentElement;
    if (parent && parent.children) {
      for (let i = 0; i < parent.children.length; i++) {
        if (parent.children[i] === field) return true;
      }
    }
    if (scopeEl) {
      if (scopeEl.children) {
        for (let i = 0; i < scopeEl.children.length; i++) {
          if (scopeEl.children[i] === field) return true;
        }
      }
      const scopeParent = scopeEl.parentElement;
      if (scopeParent && scopeParent.children) {
        for (let i = 0; i < scopeParent.children.length; i++) {
          const sib = scopeParent.children[i];
          if (sib === scopeEl) continue;
          if (sib === field) return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * True when field is the same node as or a descendant of ANY password scope,
 * OR (tier-3 naked password only) an account-typed field in that password's
 * immediate neighbourhood (sibling email/name of a formless password).
 * Fail-closed on probe error (safe direction = wall).
 */
export function ynFieldInAnyPasswordScope(field, doc) {
  if (!field) return true;
  try {
    const document_ = doc || document;
    const passwords = ynVisiblePasswordsIn(document_, document_);
    for (const p of passwords) {
      let form = null;
      let auth = null;
      let scope = null;
      try {
        form = ynNearestForm(p);
        if (form) {
          scope = form;
        } else {
          auth = ynNearestAccountContainer(p, document_);
          if (auth) {
            scope = auth;
          } else {
            // TIER 3 — naked password (no form, no named auth container)
            scope = ynBoundedPasswordNeighbourhood(p, document_);
          }
        }
      } catch {
        form = null;
        auth = null;
        scope = null;
      }

      if (scope) {
        if (field === scope) return true;
        try {
          if (scope.contains && scope.contains(field)) return true;
        } catch {
          /* contains can throw on detached nodes */
        }
      }

      // Tier-3 ONLY: wall account-typed fields in P's immediate neighbourhood
      // (sibling of naked password / sibling of its outermost wrapper). Do
      // NOT fire for tier-1 form or tier-2 named-container passwords — that
      // would re-open broad-wrapper / separate-login over-block.
      if (!form && !auth) {
        try {
          if (
            ynIsAccountTypedField(field, document_) &&
            ynFieldInNakedPasswordNeighbourhood(field, p, scope || p)
          ) {
            return true;
          }
        } catch {
          /* ignore neighbourhood probe; scope-contains already applied */
        }
      }
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Stable alias for ynFieldInAnyPasswordScope. Kept as the diagnostic entry
 * point an end-to-end harness calls to read the
 * per-field wall state; production callers use ynFieldInAnyPasswordScope.
 */
export function ynFieldInAccountWall(el, doc) {
  return ynFieldInAnyPasswordScope(el, doc);
}

/**
 * PAGE-level account-creation signal only (URL / Create Account heading /
 * Create Account button). Does NOT scan for passwords on the document —
 * passwords are scoped via ynPasswordScopes / ynFieldInAnyPasswordScope.
 *
 * applyManually alone is NOT a wall (post-login Workday wizard steps may keep
 * that path); the Workday adapter still has its own applyManually URL check.
 */
export function ynPageIsAccountCreation(doc, href) {
  try {
    const document_ = doc || document;
    const url = String(
      href || (typeof location !== "undefined" ? location.href : "") || "",
    );
    if (/createaccount/i.test(url)) return true;

    const findAll = (sel) => {
      try {
        if (typeof ynAdaFindAll === "function")
          return ynAdaFindAll(document_, sel);
        if (typeof ynQueryDeep === "function")
          return ynQueryDeep(document_, sel);
        return [...document_.querySelectorAll(sel)];
      } catch {
        return [];
      }
    };

    // Full-page Create Account heading (Workday apply entry, etc.)
    const headings = findAll('h1, h2, h3, [role="heading"]');
    for (const h of headings) {
      if (!h) continue;
      const t = String(h.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (/create\s+account/i.test(t)) return true;
    }

    // "Create Account" submit / button (password-less chrome)
    const clickables = findAll(
      'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]',
    );
    for (const el of clickables) {
      if (!el) continue;
      const t = [
        el.textContent,
        el.value,
        el.getAttribute && el.getAttribute("aria-label"),
        el.getAttribute && el.getAttribute("name"),
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (/create\s+account/i.test(t)) return true;
    }

    // Workday create-account chrome — the four ids have two different origins:
    //   createAccountSection — live-observed on a real posting;
    //   createAccountForm / createAccountCheckbox / createAccountSubmitButton —
    //     from the existing wall fixture + the pre-existing
    //     ynWdIsAccountWall adapter (tests/ext_fixtures/workday_account_wall
    //     .html; adapters/workday.js), not independently live-observed.
    // All four are belt-and-braces beneath the heading match, and the failure
    // direction is safe: a broader wall signal only zeroes more fills.
    // Does not add iCIMS "Login | GDPR" — that wall is caught by
    // ynChallengePage/ynBlocked (observed on the live iCIMS gate); no password field at that gate.
    const wdCreate = findAll(
      '[data-automation-id="createAccountSection"],' +
        '[data-automation-id="createAccountForm"],' +
        '[data-automation-id="createAccountCheckbox"],' +
        '[data-automation-id="createAccountSubmitButton"]',
    );
    if (wdCreate.length) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Stable alias for ynPageIsAccountCreation. Kept as the diagnostic entry point
 * an end-to-end harness calls to read the
 * page-level wall state; production callers use ynPageIsAccountCreation.
 */
export function ynIsAccountCreationWall(doc, href) {
  return ynPageIsAccountCreation(doc, href);
}
