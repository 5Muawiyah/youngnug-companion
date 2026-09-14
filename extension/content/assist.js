(() => {
  // extension/src/ui/assist/detect.js
  function ynAssistTheme() {
    return typeof YN_THEME !== "undefined" ? YN_THEME : {
      primary: "#0b8160",
      // --primary
      primaryDeep: "#0a4c3a",
      // --primary-deep
      accent: "#ff7a59",
      // --accent
      ink: "#12211b"
      // --text
    };
  }
  function ynAssistFindAll(doc, sel) {
    try {
      if (typeof ynQueryDeep === "function") return ynQueryDeep(doc, sel);
      if (typeof ynAdaFindAll === "function") return ynAdaFindAll(doc, sel);
      return [...doc.querySelectorAll(sel)];
    } catch {
      return [];
    }
  }
  function ynAssistPolicyText(doc) {
    const document_ = doc || document;
    try {
      const bodyText = document_.body && document_.body.innerText || "";
      const idx = bodyText.search(/password\s+requirements\s*:/i);
      if (idx >= 0) {
        const slice = bodyText.slice(idx, idx + 800);
        const cut = slice.search(
          /\n\s*(Email Address|Password\s*$|Verify|Create Account\s*$)/i
        );
        return (cut > 0 ? slice.slice(0, cut) : slice).trim();
      }
      const headings = ynAssistFindAll(
        document_,
        "h1, h2, h3, h4, p, legend, label, div, span"
      );
      for (const h of headings) {
        const t = String(h.textContent || "").replace(/\s+/g, " ").trim();
        if (!/^password\s+requirements\s*:?\s*$/i.test(t) && !/password\s+requirements\s*:/i.test(t)) {
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
    }
    return null;
  }
  function ynAssistDetectPasskey(doc) {
    const document_ = doc || document;
    try {
      const webauthn = ynAssistFindAll(
        document_,
        'input[autocomplete="webauthn"], input[autocomplete*="webauthn"]'
      );
      if (webauthn.length) return { present: true, el: webauthn[0] };
      const clickables = ynAssistFindAll(
        document_,
        'button, a, [role="button"], input[type="button"]'
      );
      for (const el of clickables) {
        if (!el) continue;
        const t = [
          el.textContent,
          el.value,
          el.getAttribute && el.getAttribute("aria-label"),
          el.getAttribute && el.getAttribute("title")
        ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        if (/passkey|security\s*key|webauthn|use\s+a\s+passkey/i.test(t)) {
          return { present: true, el };
        }
      }
    } catch {
    }
    return { present: false, el: null };
  }
  function ynAssistDetectOauth(doc) {
    const document_ = doc || document;
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const push = (provider, el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      out.push({ provider, el });
    };
    try {
      const sr = ynAssistFindAll(
        document_,
        "button.external-apply-button, button.external-apply-button--indeed"
      );
      for (const el of sr) {
        const label = (el.getAttribute && el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
        if (/indeed/i.test(label) || /indeed/i.test(el.className || "")) {
          push("Indeed", el);
        }
      }
      const clickables = ynAssistFindAll(
        document_,
        'button, a, [role="button"], input[type="button"]'
      );
      for (const el of clickables) {
        if (!el) continue;
        const t = [
          el.textContent,
          el.value,
          el.getAttribute && el.getAttribute("aria-label"),
          el.getAttribute && el.getAttribute("title")
        ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        if (!t) continue;
        let provider = null;
        if (/continue with google|sign in with google|apply with google/i.test(t)) {
          provider = "Google";
        } else if (/continue with linkedin|sign in with linkedin|apply with linkedin/i.test(
          t
        )) {
          provider = "LinkedIn";
        } else if (/continue with apple|sign in with apple|apply with apple/i.test(t)) {
          provider = "Apple";
        } else if (/continue with microsoft|sign in with microsoft|apply with microsoft/i.test(
          t
        )) {
          provider = "Microsoft";
        } else if (/apply with indeed/i.test(t)) {
          provider = "Indeed";
        }
        if (provider) push(provider, el);
      }
    } catch {
    }
    return out;
  }
  function ynAssistPasswordForm(doc) {
    const document_ = doc || document;
    try {
      let passwordEl = ynAssistFindAll(
        document_,
        'input[type="password"][data-automation-id="password"], input[data-automation-id="password"][type="password"]'
      )[0] || null;
      let verifyEl = ynAssistFindAll(
        document_,
        'input[type="password"][data-automation-id="verifyPassword"], input[data-automation-id="verifyPassword"]'
      )[0] || null;
      let emailEl = ynAssistFindAll(
        document_,
        'input[data-automation-id="email"], input[type="email"], input[autocomplete="email"]'
      )[0] || null;
      if (!passwordEl) {
        const passwords = ynAssistFindAll(document_, 'input[type="password"]');
        for (const p of passwords) {
          if (!p) continue;
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
            p.getAttribute && p.getAttribute("autocomplete")
          ].filter(Boolean).join(" ").toLowerCase();
          if (/verify|confirm|new-password|password2|password_confirmation/.test(
            name
          )) {
            verifyEl = p;
            break;
          }
        }
      }
      return {
        passwordEl,
        verifyEl: verifyEl || null,
        emailEl: emailEl || null,
        formEl: passwordEl.form || passwordEl
      };
    } catch {
      return null;
    }
  }

  // extension/src/ui/assist/panel.js
  function ynWallAssistState(doc) {
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
      policyText
    };
  }
  function ynAssistEnsureOverlayBox() {
    return ynOverlayBox();
  }
  function ynAssistMk(tag, styles, text) {
    const el = document.createElement(tag);
    if (styles) el.style.cssText = styles;
    if (text != null) el.textContent = text;
    return el;
  }
  function ynAssistBtnStyles(primary) {
    const theme = ynAssistTheme();
    return "display:inline-block;margin:4px 6px 4px 0;padding:6px 10px;border-radius:6px;border:0;cursor:pointer;font:12px/1.3 system-ui;" + (primary ? `background:${theme.accent};color:${theme.ink};font-weight:600;` : `background:${theme.primary};color:#fff;`);
  }
  function ynWallAssistPanel(state) {
    const box = ynAssistEnsureOverlayBox();
    if (!box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    const st = state || ynWallAssistState(document);
    const title = ynAssistMk(
      "div",
      "font-weight:600;margin-bottom:6px;",
      "This site needs an account. Here is the fastest safe way:"
    );
    box.appendChild(title);
    const note = ynAssistMk(
      "div",
      "opacity:.9;margin-bottom:8px;font-size:12px;",
      "YoungNug will not create the account or click for you. You stay in control."
    );
    box.appendChild(note);
    let rungN = 0;
    if (st.passkey && st.passkeyEl) {
      rungN += 1;
      const row = ynAssistMk(
        "div",
        "margin:8px 0;padding:6px 0;border-top:1px solid rgba(255,255,255,.15);"
      );
      row.appendChild(
        ynAssistMk(
          "div",
          "font-weight:600;",
          rungN + ". Use a passkey (strongest option this site offers)"
        )
      );
      row.appendChild(
        ynAssistMk(
          "div",
          "font-size:12px;opacity:.95;margin-top:2px;",
          "A passkey proves it is you without inventing a password. Use the site's own passkey button (highlighted). YoungNug will not click it."
        )
      );
      box.appendChild(row);
      if (typeof ynHighlight === "function") {
        ynHighlight(st.passkeyEl, "check");
      }
    }
    if (st.oauth && st.oauth.length) {
      for (const item of st.oauth) {
        if (!item || !item.el) continue;
        rungN += 1;
        const row = ynAssistMk(
          "div",
          "margin:8px 0;padding:6px 0;border-top:1px solid rgba(255,255,255,.15);"
        );
        row.appendChild(
          ynAssistMk(
            "div",
            "font-weight:600;",
            rungN + ". Continue with " + (item.provider || "your account")
          )
        );
        row.appendChild(
          ynAssistMk(
            "div",
            "font-size:12px;opacity:.95;margin-top:2px;",
            "Use the site's own button (highlighted). YoungNug will not click it or handle that login for you."
          )
        );
        box.appendChild(row);
        if (typeof ynHighlight === "function") {
          ynHighlight(item.el, "check");
        }
      }
    }
    if (st.passwordForm && st.passwordForm.passwordEl) {
      rungN += 1;
      const pf = st.passwordForm;
      const policy = ynParsePasswordPolicy(st.policyText, pf.passwordEl);
      const row = ynAssistMk(
        "div",
        "margin:8px 0;padding:6px 0;border-top:1px solid rgba(255,255,255,.15);"
      );
      row.appendChild(
        ynAssistMk(
          "div",
          "font-weight:600;",
          rungN + ". Or create a strong password for this site"
        )
      );
      if (!policy.parsed || policy.source === "default") {
        row.appendChild(
          ynAssistMk(
            "div",
            "font-size:12px;opacity:.95;margin-top:2px;",
            "We could not read this site's password rules, so this one satisfies the common requirements."
          )
        );
      } else if (policy.minLength) {
        row.appendChild(
          ynAssistMk(
            "div",
            "font-size:12px;opacity:.9;margin-top:2px;",
            "Matched this site's stated rules (minimum " + policy.minLength + " characters" + (policy.requireSymbol ? ", special character" : "") + ")."
          )
        );
      }
      if (typeof ynHighlight === "function") {
        ynHighlight(pf.passwordEl, "check");
        if (pf.verifyEl) ynHighlight(pf.verifyEl, "check");
      }
      const genBtn = ynAssistMk(
        "button",
        ynAssistBtnStyles(true),
        "Generate a strong password for this site"
      );
      genBtn.type = "button";
      row.appendChild(genBtn);
      const resultWrap = ynAssistMk("div", "margin-top:8px;display:none;");
      const pwDisplay = ynAssistMk(
        "code",
        "display:block;word-break:break-all;background:rgba(0,0,0,.25);padding:6px 8px;border-radius:4px;font:12px/1.4 ui-monospace,monospace;user-select:all;",
        ""
      );
      resultWrap.appendChild(pwDisplay);
      const vaultNudge = ynAssistMk(
        "div",
        "font-size:12px;margin-top:6px;opacity:.95;",
        "Save this in your password manager before you continue."
      );
      resultWrap.appendChild(vaultNudge);
      const copyBtn = ynAssistMk("button", ynAssistBtnStyles(false), "Copy");
      copyBtn.type = "button";
      const insertBtn = ynAssistMk(
        "button",
        ynAssistBtnStyles(false),
        "Insert into the password field"
      );
      insertBtn.type = "button";
      resultWrap.appendChild(copyBtn);
      resultWrap.appendChild(insertBtn);
      const statusLine = ynAssistMk(
        "div",
        "font-size:11px;margin-top:4px;opacity:.85;",
        ""
      );
      resultWrap.appendChild(statusLine);
      row.appendChild(resultWrap);
      box.appendChild(row);
      let generated = "";
      genBtn.addEventListener("click", function(event) {
        if (!event || !event.isTrusted) return;
        try {
          generated = ynGeneratePassword(policy);
        } catch {
          statusLine.textContent = "Could not generate a password in this browser (crypto unavailable).";
          return;
        }
        pwDisplay.textContent = generated;
        resultWrap.style.display = "block";
        statusLine.textContent = "";
      });
      copyBtn.addEventListener("click", function(event) {
        if (!event || !event.isTrusted) return;
        if (!generated) return;
        const done = () => {
          statusLine.textContent = "Copied. Paste only into this site's form.";
        };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(generated).then(done).catch(function() {
              try {
                const range = document.createRange();
                range.selectNodeContents(pwDisplay);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                statusLine.textContent = "Select the password above, then copy it.";
              } catch {
                statusLine.textContent = "Copy failed - select the password above.";
              }
            });
          } else {
            done();
          }
        } catch {
          statusLine.textContent = "Copy failed - select the password above.";
        }
      });
      insertBtn.addEventListener("click", function(event) {
        if (!event || !event.isTrusted) return;
        if (!generated) return;
        const target = pf.passwordEl;
        if (!target || !target.isConnected) {
          statusLine.textContent = "Password field is gone - refresh and try again.";
          return;
        }
        if (typeof ynHighlight === "function") {
          ynHighlight(target, "check");
          if (pf.verifyEl && pf.verifyEl.isConnected) {
            ynHighlight(pf.verifyEl, "check");
          }
        }
        try {
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
          statusLine.textContent = "Inserted. Save it in your password manager, then create the account yourself.";
        } catch {
          statusLine.textContent = "Could not insert. Copy the password and paste it yourself.";
        }
      });
    }
    if (rungN === 0) {
      box.appendChild(
        ynAssistMk(
          "div",
          "margin-top:6px;font-size:12px;",
          "No passkey, sign-in option, or password field was found on this page. Finish signup using the site's own controls. YoungNug did not fill or submit anything."
        )
      );
    }
    box.appendChild(
      ynAssistMk(
        "div",
        "margin-top:10px;padding-top:6px;border-top:1px solid rgba(255,255,255,.15);font-size:11px;opacity:.85;",
        "Nothing was submitted. Review and submit yourself."
      )
    );
  }

  // extension/src/ui/assist/index.js
  globalThis.ynAssistTheme = ynAssistTheme;
  globalThis.ynAssistFindAll = ynAssistFindAll;
  globalThis.ynAssistPolicyText = ynAssistPolicyText;
  globalThis.ynAssistDetectPasskey = ynAssistDetectPasskey;
  globalThis.ynAssistDetectOauth = ynAssistDetectOauth;
  globalThis.ynAssistPasswordForm = ynAssistPasswordForm;
  globalThis.ynWallAssistState = ynWallAssistState;
  globalThis.ynAssistEnsureOverlayBox = ynAssistEnsureOverlayBox;
  globalThis.ynAssistMk = ynAssistMk;
  globalThis.ynAssistBtnStyles = ynAssistBtnStyles;
  globalThis.ynWallAssistPanel = ynWallAssistPanel;
})();
