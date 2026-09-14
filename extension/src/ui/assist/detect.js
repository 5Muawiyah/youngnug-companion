// content/assist.js, part 1 of 2 - the account-wall detectors: theme
// colours, the deep query helper, password-policy text extraction,
// passkey / OAuth-only detection and the password-form recognisers the
// panel below decides its state from. See index.js for the file's full
// header and history.

/**
 * Brand colours for the inline panel. common/yn_theme.js (generated from
 * the site's design tokens) loads earlier in the popup's
 * YN_FILL_SCRIPTS stack; the literal fallback keeps this file working when
 * a node harness evaluates it alone, and tests/test_extension_theme.py pins
 * the fallback to the same tokens — drift fails the suite.
 */
export function ynAssistTheme() {
  return typeof YN_THEME !== "undefined"
    ? YN_THEME
    : {
        primary: "#0b8160", // --primary
        primaryDeep: "#0a4c3a", // --primary-deep
        accent: "#ff7a59", // --accent
        ink: "#12211b", // --text
      };
}

export function ynAssistFindAll(doc, sel) {
  try {
    if (typeof ynQueryDeep === "function") return ynQueryDeep(doc, sel);
    if (typeof ynAdaFindAll === "function") return ynAdaFindAll(doc, sel);
    return [...doc.querySelectorAll(sel)];
  } catch {
    return [];
  }
}

/**
 * Collect password-policy text from the page.
 * Workday: "Password Requirements:" label + following list.
 */
export function ynAssistPolicyText(doc) {
  const document_ = doc || document;
  try {
    const bodyText = (document_.body && document_.body.innerText) || "";
    const idx = bodyText.search(/password\s+requirements\s*:/i);
    if (idx >= 0) {
      // Slice from the label through a modest window of requirement lines.
      const slice = bodyText.slice(idx, idx + 800);
      // Stop before form labels that follow the list on Workday.
      const cut = slice.search(
        /\n\s*(Email Address|Password\s*$|Verify|Create Account\s*$)/i,
      );
      return (cut > 0 ? slice.slice(0, cut) : slice).trim();
    }
    // List items near a requirements heading.
    const headings = ynAssistFindAll(
      document_,
      "h1, h2, h3, h4, p, legend, label, div, span",
    );
    for (const h of headings) {
      const t = String(h.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (
        !/^password\s+requirements\s*:?\s*$/i.test(t) &&
        !/password\s+requirements\s*:/i.test(t)
      ) {
        continue;
      }
      let block = t;
      let sib = h.nextElementSibling;
      let hops = 0;
      while (sib && hops < 6) {
        const tag = (sib.tagName || "").toUpperCase();
        if (tag === "UL" || tag === "OL") {
          block += "\n" + (sib.innerText || sib.textContent || "");
          break;
        }
        if (tag === "P" || tag === "DIV" || tag === "LI") {
          block += "\n" + (sib.innerText || sib.textContent || "");
        }
        sib = sib.nextElementSibling;
        hops += 1;
      }
      if (block.length > t.length) return block.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Passkey affordance - DOM presence only.
 * Research: Workday 3/3 had NONE (no autocomplete=webauthn, no passkey button).
 * We still detect if present so the panel reflects each wall accurately.
 */
export function ynAssistDetectPasskey(doc) {
  const document_ = doc || document;
  try {
    const webauthn = ynAssistFindAll(
      document_,
      'input[autocomplete="webauthn"], input[autocomplete*="webauthn"]',
    );
    if (webauthn.length) return { present: true, el: webauthn[0] };

    const clickables = ynAssistFindAll(
      document_,
      'button, a, [role="button"], input[type="button"]',
    );
    for (const el of clickables) {
      if (!el) continue;
      const t = [
        el.textContent,
        el.value,
        el.getAttribute && el.getAttribute("aria-label"),
        el.getAttribute && el.getAttribute("title"),
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (/passkey|security\s*key|webauthn|use\s+a\s+passkey/i.test(t)) {
        return { present: true, el };
      }
    }
  } catch {
    /* ignore */
  }
  return { present: false, el: null };
}

/**
 * OAuth / federated buttons - DOM presence only.
 * Research whitelist:
 *   - SmartRecruiters: button.external-apply-button / "Apply With Indeed" -
 *     non-wall but real OAuth-shaped affordance.
 *   - Generic "Continue with Google/LinkedIn/Apple/Microsoft" if present.
 * Workday 3/3: confirmed ABSENCE (no OAuth) - do not invent.
 */
export function ynAssistDetectOauth(doc) {
  const document_ = doc || document;
  const out = [];
  const seen = new Set();

  const push = (provider, el) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    out.push({ provider, el });
  };

  try {
    // SmartRecruiters Indeed button - observed on the live SmartRecruiters one-click UI.
    const sr = ynAssistFindAll(
      document_,
      "button.external-apply-button, button.external-apply-button--indeed",
    );
    for (const el of sr) {
      const label = (
        (el.getAttribute && el.getAttribute("aria-label")) ||
        el.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      if (/indeed/i.test(label) || /indeed/i.test(el.className || "")) {
        push("Indeed", el);
      }
    }

    const clickables = ynAssistFindAll(
      document_,
      'button, a, [role="button"], input[type="button"]',
    );
    for (const el of clickables) {
      if (!el) continue;
      const t = [
        el.textContent,
        el.value,
        el.getAttribute && el.getAttribute("aria-label"),
        el.getAttribute && el.getAttribute("title"),
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!t) continue;
      // Only offer providers the wall actually shows (whitelist by text).
      let provider = null;
      if (
        /continue with google|sign in with google|apply with google/i.test(t)
      ) {
        provider = "Google";
      } else if (
        /continue with linkedin|sign in with linkedin|apply with linkedin/i.test(
          t,
        )
      ) {
        provider = "LinkedIn";
      } else if (
        /continue with apple|sign in with apple|apply with apple/i.test(t)
      ) {
        provider = "Apple";
      } else if (
        /continue with microsoft|sign in with microsoft|apply with microsoft/i.test(
          t,
        )
      ) {
        provider = "Microsoft";
      } else if (/apply with indeed/i.test(t)) {
        provider = "Indeed";
      }
      if (provider) push(provider, el);
    }
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * Password form fields on an account wall - observed Workday shape:
 *   input[data-automation-id=email|password|verifyPassword]
 * Falls back to first visible password + its form.
 */
export function ynAssistPasswordForm(doc) {
  const document_ = doc || document;
  try {
    let passwordEl =
      ynAssistFindAll(
        document_,
        'input[type="password"][data-automation-id="password"], input[data-automation-id="password"][type="password"]',
      )[0] || null;
    let verifyEl =
      ynAssistFindAll(
        document_,
        'input[type="password"][data-automation-id="verifyPassword"], input[data-automation-id="verifyPassword"]',
      )[0] || null;
    let emailEl =
      ynAssistFindAll(
        document_,
        'input[data-automation-id="email"], input[type="email"], input[autocomplete="email"]',
      )[0] || null;

    if (!passwordEl) {
      const passwords = ynAssistFindAll(document_, 'input[type="password"]');
      for (const p of passwords) {
        if (!p) continue;
        // Skip honeypots if the shared helper exists.
        if (typeof ynIsHoneypot === "function" && ynIsHoneypot(p, document_)) {
          continue;
        }
        passwordEl = p;
        break;
      }
    }
    if (!passwordEl) return null;

    if (!verifyEl) {
      const passwords = ynAssistFindAll(document_, 'input[type="password"]');
      for (const p of passwords) {
        if (!p || p === passwordEl) continue;
        if (typeof ynIsHoneypot === "function" && ynIsHoneypot(p, document_)) {
          continue;
        }
        const name = [
          p.name,
          p.id,
          p.getAttribute && p.getAttribute("data-automation-id"),
          p.getAttribute && p.getAttribute("autocomplete"),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (
          /verify|confirm|new-password|password2|password_confirmation/.test(
            name,
          )
        ) {
          verifyEl = p;
          break;
        }
      }
    }

    return {
      passwordEl,
      verifyEl: verifyEl || null,
      emailEl: emailEl || null,
      formEl: passwordEl.form || passwordEl,
    };
  } catch {
    return null;
  }
}
