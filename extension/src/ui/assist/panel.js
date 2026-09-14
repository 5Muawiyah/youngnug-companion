// content/assist.js, part 2 of 2 - the on-page assist panel itself:
// state derivation (ynWallAssistState, reading part 1's detectors),
// the small DOM-builder helpers, and ynWallAssistPanel, which renders
// the panel and wires its buttons. See index.js for the file's full
// header and history.
import { ynAssistTheme, ynAssistPolicyText, ynAssistDetectPasskey, ynAssistDetectOauth, ynAssistPasswordForm } from "./detect.js";
// ynOverlayBox is common/overlay_box.js's bare global — see filler/filler/
// fa_setup.js's own note on why this is not an ES import.

/**
 * What THIS wall offers - based strictly on DOM presence, research whitelist only.
 * @returns {{ passkey: boolean, passkeyEl: Element|null, oauth: Array, passwordForm: object|null, policyText: string|null }}
 */
export function ynWallAssistState(doc) {
  const document_ = doc || document;
  const pk = ynAssistDetectPasskey(document_);
  const oauth = ynAssistDetectOauth(document_);
  const passwordForm = ynAssistPasswordForm(document_);
  const policyText = ynAssistPolicyText(document_);
  return {
    passkey: Boolean(pk.present),
    passkeyEl: pk.el || null,
    oauth,
    passwordForm,
    policyText,
  };
}

/**
 * The wall-assist panel's content container — the shared box (common/
 * overlay_box.js's ynOverlayBox), same as report_state.js's ynOverlay and
 * the employer posting overlay (one painter, not three). Returns null
 * when the student has closed the box for this page and no fresh fill
 * attempt has cleared that dismissal yet (fa_setup.js / fill_any_page.js);
 * callers must treat that as "paint nothing".
 */
export function ynAssistEnsureOverlayBox() {
  return ynOverlayBox();
}

export function ynAssistMk(tag, styles, text) {
  const el = document.createElement(tag);
  if (styles) el.style.cssText = styles;
  if (text != null) el.textContent = text;
  return el;
}

export function ynAssistBtnStyles(primary) {
  const theme = ynAssistTheme();
  return (
    "display:inline-block;margin:4px 6px 4px 0;padding:6px 10px;border-radius:6px;" +
    "border:0;cursor:pointer;font:12px/1.3 system-ui;" +
    (primary
      ? `background:${theme.accent};color:${theme.ink};font-weight:600;`
      : `background:${theme.primary};color:#fff;`)
  );
}

/**
 * Render the wall-assist panel INTO the existing yn-overlay box.
 * Never auto-clicks site buttons - only highlights them.
 * Password insert is a closure over `generated` - not a global export.
 *
 * Copy rules: no em-dashes, no AI-tell phrasing in any user-visible string.
 *
 * @param {ReturnType<typeof ynWallAssistState>} state
 */
export function ynWallAssistPanel(state) {
  const box = ynAssistEnsureOverlayBox();
  if (!box) return; // student closed the box for this page; paint nothing
  // Clear prior text-only overlay content.
  while (box.firstChild) box.removeChild(box.firstChild);

  const st = state || ynWallAssistState(document);

  const title = ynAssistMk(
    "div",
    "font-weight:600;margin-bottom:6px;",
    "This site needs an account. Here is the fastest safe way:",
  );
  box.appendChild(title);

  const note = ynAssistMk(
    "div",
    "opacity:.9;margin-bottom:8px;font-size:12px;",
    "YoungNug will not create the account or click for you. You stay in control.",
  );
  box.appendChild(note);

  let rungN = 0;

  // ── Rung 1a: passkey (only if the wall offers it) ───────────────────────
  if (st.passkey && st.passkeyEl) {
    rungN += 1;
    const row = ynAssistMk(
      "div",
      "margin:8px 0;padding:6px 0;border-top:1px solid rgba(255,255,255,.15);",
    );
    row.appendChild(
      ynAssistMk(
        "div",
        "font-weight:600;",
        rungN + ". Use a passkey (strongest option this site offers)",
      ),
    );
    row.appendChild(
      ynAssistMk(
        "div",
        "font-size:12px;opacity:.95;margin-top:2px;",
        "A passkey proves it is you without inventing a password. Use the site's own passkey button (highlighted). YoungNug will not click it.",
      ),
    );
    box.appendChild(row);
    if (typeof ynHighlight === "function") {
      ynHighlight(st.passkeyEl, "check");
    }
  }

  // ── Rung 1b: OAuth (only providers actually present) ────────────────────
  if (st.oauth && st.oauth.length) {
    for (const item of st.oauth) {
      if (!item || !item.el) continue;
      rungN += 1;
      const row = ynAssistMk(
        "div",
        "margin:8px 0;padding:6px 0;border-top:1px solid rgba(255,255,255,.15);",
      );
      row.appendChild(
        ynAssistMk(
          "div",
          "font-weight:600;",
          rungN + ". Continue with " + (item.provider || "your account"),
        ),
      );
      row.appendChild(
        ynAssistMk(
          "div",
          "font-size:12px;opacity:.95;margin-top:2px;",
          "Use the site's own button (highlighted). YoungNug will not click it or handle that login for you.",
        ),
      );
      box.appendChild(row);
      if (typeof ynHighlight === "function") {
        ynHighlight(item.el, "check");
      }
    }
  }

  // ── Rung 2: password generator (only if a password field exists) ────────
  if (st.passwordForm && st.passwordForm.passwordEl) {
    rungN += 1;
    const pf = st.passwordForm;
    const policy = ynParsePasswordPolicy(st.policyText, pf.passwordEl);
    const row = ynAssistMk(
      "div",
      "margin:8px 0;padding:6px 0;border-top:1px solid rgba(255,255,255,.15);",
    );
    row.appendChild(
      ynAssistMk(
        "div",
        "font-weight:600;",
        rungN + ". Or create a strong password for this site",
      ),
    );

    if (!policy.parsed || policy.source === "default") {
      row.appendChild(
        ynAssistMk(
          "div",
          "font-size:12px;opacity:.95;margin-top:2px;",
          "We could not read this site's password rules, so this one satisfies the common requirements.",
        ),
      );
    } else if (policy.minLength) {
      row.appendChild(
        ynAssistMk(
          "div",
          "font-size:12px;opacity:.9;margin-top:2px;",
          "Matched this site's stated rules (minimum " +
            policy.minLength +
            " characters" +
            (policy.requireSymbol ? ", special character" : "") +
            ").",
        ),
      );
    }

    // Highlight the password field the user would type into.
    if (typeof ynHighlight === "function") {
      ynHighlight(pf.passwordEl, "check");
      if (pf.verifyEl) ynHighlight(pf.verifyEl, "check");
    }

    const genBtn = ynAssistMk(
      "button",
      ynAssistBtnStyles(true),
      "Generate a strong password for this site",
    );
    genBtn.type = "button";
    row.appendChild(genBtn);

    const resultWrap = ynAssistMk("div", "margin-top:8px;display:none;");
    const pwDisplay = ynAssistMk(
      "code",
      "display:block;word-break:break-all;background:rgba(0,0,0,.25);padding:6px 8px;" +
        "border-radius:4px;font:12px/1.4 ui-monospace,monospace;user-select:all;",
      "",
    );
    resultWrap.appendChild(pwDisplay);

    const vaultNudge = ynAssistMk(
      "div",
      "font-size:12px;margin-top:6px;opacity:.95;",
      "Save this in your password manager before you continue.",
    );
    resultWrap.appendChild(vaultNudge);

    const copyBtn = ynAssistMk("button", ynAssistBtnStyles(false), "Copy");
    copyBtn.type = "button";
    const insertBtn = ynAssistMk(
      "button",
      ynAssistBtnStyles(false),
      "Insert into the password field",
    );
    insertBtn.type = "button";
    resultWrap.appendChild(copyBtn);
    resultWrap.appendChild(insertBtn);

    const statusLine = ynAssistMk(
      "div",
      "font-size:11px;margin-top:4px;opacity:.85;",
      "",
    );
    resultWrap.appendChild(statusLine);
    row.appendChild(resultWrap);
    box.appendChild(row);

    // Closure state - never assigned to a global, never sent anywhere.
    let generated = "";

    genBtn.addEventListener("click", function (event) {
      if (!event || !event.isTrusted) return;
      try {
        generated = ynGeneratePassword(policy);
      } catch {
        statusLine.textContent =
          "Could not generate a password in this browser (crypto unavailable).";
        return;
      }
      pwDisplay.textContent = generated;
      resultWrap.style.display = "block";
      statusLine.textContent = "";
      // Do not console.log, store, or transmit `generated`.
    });

    copyBtn.addEventListener("click", function (event) {
      if (!event || !event.isTrusted) return;
      if (!generated) return;
      const done = () => {
        statusLine.textContent = "Copied. Paste only into this site's form.";
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(generated)
            .then(done)
            .catch(function () {
              // Fallback: select the visible code node for manual Ctrl+C.
              try {
                const range = document.createRange();
                range.selectNodeContents(pwDisplay);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                statusLine.textContent =
                  "Select the password above, then copy it.";
              } catch {
                statusLine.textContent =
                  "Copy failed - select the password above.";
              }
            });
        } else {
          done();
        }
      } catch {
        statusLine.textContent = "Copy failed - select the password above.";
      }
    });

    // THE only password write path. Requires a fresh trusted user gesture.
    // Not exported - plan/execute/heuristics cannot call this function.
    insertBtn.addEventListener("click", function (event) {
      if (!event || !event.isTrusted) return;
      if (!generated) return;
      const target = pf.passwordEl;
      if (!target || !target.isConnected) {
        statusLine.textContent =
          "Password field is gone - refresh and try again.";
        return;
      }
      if (typeof ynHighlight === "function") {
        ynHighlight(target, "check");
        if (pf.verifyEl && pf.verifyEl.isConnected) {
          ynHighlight(pf.verifyEl, "check");
        }
      }
      try {
        // Prefer the shared React-proof native setter when present.
        if (typeof ynSetNativeValue === "function") {
          ynSetNativeValue(target, generated);
          if (pf.verifyEl && pf.verifyEl.isConnected) {
            ynSetNativeValue(pf.verifyEl, generated);
          }
        } else {
          const proto = window.HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, "value");
          if (desc && desc.set) {
            desc.set.call(target, generated);
            if (pf.verifyEl && pf.verifyEl.isConnected) {
              desc.set.call(pf.verifyEl, generated);
            }
          } else {
            target.value = generated;
            if (pf.verifyEl && pf.verifyEl.isConnected) {
              pf.verifyEl.value = generated;
            }
          }
          target.dispatchEvent(new Event("input", { bubbles: true }));
          target.dispatchEvent(new Event("change", { bubbles: true }));
          if (pf.verifyEl && pf.verifyEl.isConnected) {
            pf.verifyEl.dispatchEvent(new Event("input", { bubbles: true }));
            pf.verifyEl.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
        statusLine.textContent =
          "Inserted. Save it in your password manager, then create the account yourself.";
      } catch {
        statusLine.textContent =
          "Could not insert. Copy the password and paste it yourself.";
      }
      // generated stays only in this closure until the panel is re-rendered.
    });
  }

  if (rungN === 0) {
    box.appendChild(
      ynAssistMk(
        "div",
        "margin-top:6px;font-size:12px;",
        "No passkey, sign-in option, or password field was found on this page. Finish signup using the site's own controls. YoungNug did not fill or submit anything.",
      ),
    );
  }

  box.appendChild(
    ynAssistMk(
      "div",
      "margin-top:10px;padding-top:6px;border-top:1px solid rgba(255,255,255,.15);font-size:11px;opacity:.85;",
      "Nothing was submitted. Review and submit yourself.",
    ),
  );
}
