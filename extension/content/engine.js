(() => {
  // extension/src/engine/engine/honeypot.js
  function ynEnginePause(ms) {
    return new Promise((resolve) => {
      if (typeof setTimeout === "function") setTimeout(resolve, ms);
      else resolve();
    });
  }
  function ynEngineTimer(fn, ms) {
    return typeof setTimeout === "function" ? setTimeout(fn, ms) : null;
  }
  function ynAdaIsPassword(el) {
    return el && (el.type || "").toLowerCase() === "password";
  }
  function ynAdaLabelOf(el, doc) {
    if (!el) return "";
    if (el.labels && el.labels.length) {
      return (el.labels[0].textContent || "").trim().slice(0, 80);
    }
    if (el.id) {
      try {
        const labs = ynAdaFindAll(doc, `label[for="${CSS.escape(el.id)}"]`);
        if (labs[0]) return (labs[0].textContent || "").trim().slice(0, 80);
      } catch {
      }
    }
    return (el.getAttribute("aria-label") || el.getAttribute("data-qa") || el.getAttribute("data-automation-id") || el.name || el.id || "").toString().slice(0, 80);
  }
  function ynAdaUsable(val) {
    if (val == null || val === "") return false;
    if (typeof val === "string" && /\[CONFIRM/i.test(val)) return false;
    return true;
  }
  var YN_HONEYPOT_PHRASE_RE = /do not (fill|enter|use|complete)|for robots? only|leave (this )?(field |it )?blank|if you\W*re (a )?human|bot[\s-]?field|honeypot|hp[_-]/i;
  function ynHoneypotSignalText(el, doc) {
    if (!el) return "";
    const document_ = doc || document;
    const bits = [];
    try {
      if (el.labels && el.labels.length) {
        for (const lab of el.labels) bits.push(lab.textContent || "");
      }
      if (el.id) {
        try {
          const deep = typeof ynAdaFindAll === "function" ? ynAdaFindAll(document_, `label[for="${CSS.escape(el.id)}"]`) : null;
          if (deep && deep[0]) bits.push(deep[0].textContent || "");
          else {
            const lab = document_.querySelector(
              `label[for="${CSS.escape(el.id)}"]`
            );
            if (lab) bits.push(lab.textContent || "");
          }
        } catch {
        }
      }
      bits.push(el.getAttribute("aria-label") || "");
      const labelledBy = (el.getAttribute("aria-labelledby") || "").trim().split(/\s+/);
      for (const id of labelledBy) {
        if (!id) continue;
        try {
          const n = document_.getElementById(id);
          if (n) bits.push(n.textContent || "");
        } catch {
        }
      }
      bits.push(el.getAttribute("placeholder") || "");
      bits.push(el.name || "");
      bits.push(el.id || "");
      try {
        const wrap = el.closest && el.closest("label");
        if (wrap) bits.push(wrap.textContent || "");
      } catch {
      }
      const prev = el.previousElementSibling;
      if (prev) bits.push((prev.textContent || "").slice(0, 240));
      try {
        const parent = el.parentElement;
        if (parent) {
          const own = [];
          for (const child of parent.childNodes) {
            if (child.nodeType === 3) own.push(child.textContent || "");
          }
          bits.push(own.join(" "));
        }
      } catch {
      }
    } catch {
      return "";
    }
    return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  function ynAriaHiddenSelfOrAncestor(el) {
    let cur = el;
    for (let i = 0; i < 8 && cur; i++) {
      try {
        if (cur.getAttribute && cur.getAttribute("aria-hidden") === "true") {
          return true;
        }
      } catch {
        return true;
      }
      cur = cur.parentElement;
    }
    return false;
  }
  function ynIsVisuallyHiddenTrap(el) {
    if (!el) return true;
    const type = (el.type || "").toLowerCase();
    if (type === "file") return false;
    let cur = el;
    for (let i = 0; i < 4 && cur; i++) {
      try {
        const st = window.getComputedStyle(cur);
        if (st) {
          if (st.display === "none" || st.visibility === "hidden") return true;
          const op = parseFloat(st.opacity);
          if (Number.isFinite(op) && op < 0.1) return true;
          if (st.clip && st.clip !== "auto" && /rect\s*\(\s*0(px)?\s*,?\s*0/i.test(st.clip)) {
            return true;
          }
          if (st.clipPath && st.clipPath !== "none" && /inset\s*\(\s*50%|circle\s*\(\s*0/i.test(st.clipPath)) {
            return true;
          }
        }
      } catch {
        return true;
      }
      cur = cur.parentElement;
    }
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return true;
      if (rect.right < 0 || rect.bottom < 0) return true;
      if (rect.left < -500 || rect.top < -500) return true;
    } catch {
      return true;
    }
    return false;
  }
  function ynFieldTopHitElements(el, doc) {
    const document_ = doc || document;
    if (typeof document_.elementFromPoint !== "function") return null;
    let rect;
    try {
      rect = el.getBoundingClientRect();
    } catch {
      return null;
    }
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const points = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + Math.min(2, rect.width / 4), rect.top + Math.min(2, rect.height / 4)],
      [rect.right - Math.min(2, rect.width / 4), rect.bottom - Math.min(2, rect.height / 4)]
    ];
    const hits = [];
    for (const [x, y] of points) {
      try {
        const root = typeof el.getRootNode === "function" && el.getRootNode() || document_;
        const finder = root && typeof root.elementFromPoint === "function" ? root : document_;
        hits.push(finder.elementFromPoint(x, y) || null);
      } catch {
        hits.push(null);
      }
    }
    return hits;
  }
  function ynIsOccludedField(el, doc) {
    const hits = ynFieldTopHitElements(el, doc);
    if (!hits) return false;
    let sawHit = false;
    for (const hit of hits) {
      if (!hit) continue;
      sawHit = true;
      if (hit === el) continue;
      try {
        if (el.contains && el.contains(hit)) continue;
        if (hit.contains && hit.contains(el)) continue;
      } catch {
        continue;
      }
      return true;
    }
    return sawHit ? false : false;
  }
  function ynIsHoneypot(el, doc) {
    if (!el) return true;
    try {
      if (el.isConnected === false) return true;
      const type = (el.type || "").toLowerCase();
      if (type === "hidden") return true;
      if (ynAriaHiddenSelfOrAncestor(el)) return true;
      if (ynIsVisuallyHiddenTrap(el)) return true;
      if (ynIsOccludedField(el, doc)) return true;
      const signal = ynHoneypotSignalText(el, doc);
      if (signal && YN_HONEYPOT_PHRASE_RE.test(signal)) return true;
      return false;
    } catch {
      return true;
    }
  }
  function ynShouldSkipField(el, doc) {
    return ynIsHoneypot(el, doc);
  }

  // extension/src/engine/engine/password_scope.js
  function ynVisiblePasswordsIn(root, doc) {
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
          continue;
        }
      } catch {
      }
      out.push(p);
    }
    return out;
  }
  function ynHasVisiblePassword(root, doc) {
    return ynVisiblePasswordsIn(root, doc).length > 0;
  }
  function ynNearestForm(el) {
    let node = el;
    while (node) {
      try {
        if (node.tagName && String(node.tagName).toLowerCase() === "form") {
          return node;
        }
      } catch {
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
      }
      break;
    }
    return null;
  }
  var YN_AUTH_WIDGET_SEL = '[class*="login" i], [class*="log-in" i], [class*="signin" i], [class*="sign-in" i], [class*="signup" i], [class*="sign-up" i], [class*="register" i], [class*="registration" i], [class*="create-account" i], [class*="createaccount" i], [class*="account" i], [id*="login" i], [id*="log-in" i], [id*="signin" i], [id*="sign-in" i], [id*="signup" i], [id*="sign-up" i], [id*="register" i], [id*="registration" i], [id*="create-account" i], [id*="createaccount" i], [id*="account" i]';
  var YN_AUTH_HEADING_RE = /create\s+account|sign\s*in|log\s*in|register|sign\s*up/i;
  var YN_ACCOUNT_CONTAINER_SEL = YN_AUTH_WIDGET_SEL;
  function ynNearestAccountContainer(el, doc) {
    const document_ = doc || document;
    let node = el && el.parentElement;
    while (node && node !== document_ && node !== document_.documentElement && node !== document_.body) {
      try {
        if (node.matches && node.matches(YN_AUTH_WIDGET_SEL)) {
          return node;
        }
        const tag = node.tagName && String(node.tagName).toLowerCase();
        if (tag === "fieldset" || tag === "section") {
          const heading = node.querySelector(
            "legend, h1, h2, h3, h4, h5, h6, [role='heading']"
          );
          const ht = heading ? String(heading.textContent || "").replace(/\s+/g, " ").trim() : "";
          if (ht && YN_AUTH_HEADING_RE.test(ht)) {
            return node;
          }
        }
      } catch {
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
      }
      break;
    }
    return null;
  }
  function ynBoundedPasswordNeighbourhood(passwordEl, doc) {
    const document_ = doc || document;
    if (!passwordEl) return null;
    let ceiling = document_.body || null;
    try {
      let probe = passwordEl;
      while (probe) {
        if (probe === document_.body || probe === document_.documentElement || probe === document_) {
          break;
        }
        try {
          const tag = probe.tagName && String(probe.tagName).toLowerCase();
          let role = "";
          try {
            role = String(
              probe.getAttribute && probe.getAttribute("role") || ""
            ).toLowerCase();
          } catch {
            role = "";
          }
          if (tag === "main" || role === "main") {
            ceiling = probe;
            break;
          }
        } catch {
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
      if (parent === ceiling || parent === document_.body || parent === document_.documentElement || parent === document_) {
        break;
      }
      outermost = parent;
      node = parent;
    }
    return outermost;
  }
  function ynPasswordScope(passwordEl, doc) {
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
  function ynPasswordScopes(doc) {
    const document_ = doc || document;
    const passwords = ynVisiblePasswordsIn(document_, document_);
    const scopes = [];
    const seen = /* @__PURE__ */ new Set();
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

  // extension/src/engine/engine/account_wall.js
  var YN_ACCOUNT_TYPED_AC = /* @__PURE__ */ new Set([
    "email",
    "username",
    "name",
    "given-name",
    "family-name",
    "tel",
    "new-password",
    "current-password"
  ]);
  var YN_ACCOUNT_TYPED_SIGNAL_RE = /email|e-mail|user-?name|full-?name|first-?name|last-?name|phone|mobile/i;
  function ynIsFillableNonHoneypotField(el, doc) {
    if (!el) return false;
    try {
      const tag = el.tagName && String(el.tagName).toLowerCase();
      if (tag !== "input" && tag !== "textarea") return false;
      const type = String(el.type || "text").toLowerCase();
      if (type === "submit" || type === "button" || type === "hidden" || type === "image" || type === "reset" || type === "file" || type === "checkbox" || type === "radio") {
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
  function ynIsAccountTypedField(el, doc) {
    if (!ynIsFillableNonHoneypotField(el, doc)) return false;
    try {
      const type = String(el.type || "text").toLowerCase();
      if (type === "email" || type === "tel") return true;
      let ac = "";
      try {
        ac = String(el.getAttribute("autocomplete") || "").toLowerCase().trim();
      } catch {
        ac = "";
      }
      if (ac) {
        const tokens = ac.split(/\s+/);
        for (const t of tokens) {
          if (YN_ACCOUNT_TYPED_AC.has(t)) return true;
        }
      }
      const label = typeof ynAdaLabelOf === "function" ? ynAdaLabelOf(el, doc) : "";
      let placeholder = "";
      try {
        placeholder = String(el.getAttribute("placeholder") || "");
      } catch {
        placeholder = "";
      }
      const signal = [el.name || "", el.id || "", placeholder, label].join(" ").replace(/\s+/g, " ").trim();
      if (signal && YN_ACCOUNT_TYPED_SIGNAL_RE.test(signal)) return true;
      return false;
    } catch {
      return false;
    }
  }
  function ynFieldInNakedPasswordNeighbourhood(field, passwordEl, scopeEl) {
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
  function ynFieldInAnyPasswordScope(field, doc) {
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
          }
        }
        if (!form && !auth) {
          try {
            if (ynIsAccountTypedField(field, document_) && ynFieldInNakedPasswordNeighbourhood(field, p, scope || p)) {
              return true;
            }
          } catch {
          }
        }
      }
      return false;
    } catch {
      return true;
    }
  }
  function ynFieldInAccountWall(el, doc) {
    return ynFieldInAnyPasswordScope(el, doc);
  }
  function ynPageIsAccountCreation(doc, href) {
    try {
      const document_ = doc || document;
      const url = String(
        href || (typeof location !== "undefined" ? location.href : "") || ""
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
      const headings = findAll('h1, h2, h3, [role="heading"]');
      for (const h of headings) {
        if (!h) continue;
        const t = String(h.textContent || "").replace(/\s+/g, " ").trim();
        if (/create\s+account/i.test(t)) return true;
      }
      const clickables = findAll(
        'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]'
      );
      for (const el of clickables) {
        if (!el) continue;
        const t = [
          el.textContent,
          el.value,
          el.getAttribute && el.getAttribute("aria-label"),
          el.getAttribute && el.getAttribute("name")
        ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        if (/create\s+account/i.test(t)) return true;
      }
      const wdCreate = findAll(
        '[data-automation-id="createAccountSection"],[data-automation-id="createAccountForm"],[data-automation-id="createAccountCheckbox"],[data-automation-id="createAccountSubmitButton"]'
      );
      if (wdCreate.length) return true;
      return false;
    } catch {
      return false;
    }
  }
  function ynIsAccountCreationWall(doc, href) {
    return ynPageIsAccountCreation(doc, href);
  }

  // extension/src/engine/engine/guards.js
  function ynSubmitGuard(el) {
    if (!el) return true;
    const type = (el.type || "").toLowerCase();
    if (type === "submit") return true;
    const name = [
      el.textContent,
      el.value,
      el.getAttribute && el.getAttribute("aria-label"),
      el.getAttribute && el.getAttribute("name")
    ].filter(Boolean).join(" ");
    return /submit|send application|apply now|finish|complete application|post( a| the| this| your| my)? job|publish|sponsor|checkout|confirm|pay\b/i.test(
      name
    );
  }
  var YN_PAYMENT_AC_RE = /(^|\s)cc-[a-z-]+/i;
  var YN_PAYMENT_SIGNAL_RE = /card\s*number|card\s*holder|credit\s*card|debit\s*card|expir(y|ation)|\bcvv\b|\bcvc\b|\bcsc\b|security\s*code|\biban\b|sort\s*code|account\s*number|routing\s*number|billing|payment\s*(method|details|card|info)/i;
  function ynIsPaymentField(el, doc) {
    if (!el) return false;
    try {
      let ac = "";
      try {
        ac = String(el.getAttribute("autocomplete") || "").toLowerCase();
      } catch {
        ac = "";
      }
      if (ac && YN_PAYMENT_AC_RE.test(ac)) return true;
      const label = typeof ynAdaLabelOf === "function" ? ynAdaLabelOf(el, doc) : "";
      let placeholder = "";
      try {
        placeholder = String(el.getAttribute("placeholder") || "");
      } catch {
        placeholder = "";
      }
      const signal = [el.name || "", el.id || "", placeholder, label].join(" ").replace(/\s+/g, " ").trim();
      return Boolean(signal && YN_PAYMENT_SIGNAL_RE.test(signal));
    } catch {
      return true;
    }
  }
  var YN_GUARD_SENSITIVE_RE = /gender|\bsex\b|\brace\b|racial|ethnic|disab|veteran|sexual orientation|transgender|non-binary/i;
  var YN_GUARD_TRUTH_RE = /work\s*authori[sz]|authori[sz]ed?\s*to\s*work|eligible\s*to\s*work|right\s*to\s*work|sponsor(ship)?|citizen(ship)?|permanent\s*residen|indefinite\s*leave|visa\s*status/i;
  var YN_GUARD_POLICY_RE = /\bagree\b|\bterms\b|privacy|\bgdpr\b|\bconsent\b|marketing|newsletter|subscribe|\bsms\b|opt.?in|\bauthori[sz]e\b/i;
  function ynGuardClassOf(label, optionTexts) {
    const hay = [label, ...Array.isArray(optionTexts) ? optionTexts : []].filter(Boolean).join(" ");
    if (!hay) return null;
    if (YN_GUARD_SENSITIVE_RE.test(hay)) return "sensitive";
    if (YN_GUARD_TRUTH_RE.test(hay)) return "truth";
    if (YN_GUARD_POLICY_RE.test(hay)) return "policy";
    return null;
  }
  function ynGuardGroupLegendText(el, doc) {
    if (typeof ynGroupLegend === "function") {
      try {
        return ynGroupLegend(el, doc) || "";
      } catch {
        return "";
      }
    }
    try {
      const fs = el.closest && el.closest("fieldset");
      const legend = fs && fs.querySelector && fs.querySelector("legend");
      if (legend && legend.textContent) return legend.textContent.trim();
    } catch {
    }
    return "";
  }
  function ynGuardGroupOptionTexts(el, doc) {
    const document_ = doc || document;
    const texts = [];
    try {
      const type = (el.type || "").toLowerCase();
      let role = "";
      try {
        role = String(
          el.getAttribute && el.getAttribute("role") || ""
        ).toLowerCase();
      } catch {
        role = "";
      }
      const isChoice = type === "checkbox" || type === "radio" || role === "checkbox" || role === "radio";
      if (!isChoice) return texts;
      let group = [el];
      const name = el.name || "";
      if (type === "radio" && name) {
        const root = el.form || document_;
        try {
          const sel = `input[type="radio"][name="${CSS.escape(name)}"]`;
          const found = root.querySelectorAll ? [...root.querySelectorAll(sel)] : [];
          if (found.length) group = found;
        } catch {
        }
      } else if (el.closest) {
        const box = el.closest('fieldset,[role="radiogroup"],[role="group"]');
        if (box && box.querySelectorAll) {
          try {
            const found = [
              ...box.querySelectorAll(
                'input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"]'
              )
            ];
            if (found.length > 1) group = found;
          } catch {
          }
        }
      }
      for (const member of group) {
        let t = "";
        try {
          if (member.labels && member.labels.length) {
            t = (member.labels[0].textContent || "").trim();
          } else if (member.id) {
            const lab = document_.querySelector(
              `label[for="${CSS.escape(member.id)}"]`
            );
            if (lab) t = (lab.textContent || "").trim();
          }
          if (!t) {
            const wrap = member.closest && member.closest("label");
            if (wrap) t = (wrap.textContent || "").trim();
          }
          if (!t) {
            t = String(
              member.getAttribute && member.getAttribute("aria-label") || ""
            ).trim();
          }
          if (!t) t = String(member.value || "").trim();
        } catch {
          t = "";
        }
        if (t) texts.push(t);
      }
    } catch {
    }
    return texts;
  }
  var YN_TERMS_SIGNAL_RE_HISTORIC = /agree|terms|consent|authori[sz]e/i;
  function ynIsTermsCheckbox(el, doc) {
    if (!el) return false;
    try {
      const type = (el.type || "").toLowerCase();
      let role = "";
      try {
        role = String(
          el.getAttribute && el.getAttribute("role") || ""
        ).toLowerCase();
      } catch {
        role = "";
      }
      const isChoice = type === "checkbox" || type === "radio" || role === "checkbox" || role === "radio";
      if (!isChoice) return false;
      const label = typeof ynAdaLabelOf === "function" ? ynAdaLabelOf(el, doc) : "";
      let wrapText = "";
      try {
        const wrap = el.closest && el.closest("label");
        if (wrap) wrapText = String(wrap.textContent || "");
      } catch {
        wrapText = "";
      }
      const legend = ynGuardGroupLegendText(el, doc);
      const signal = [label, wrapText, legend, el.name || "", el.id || ""].join(" ").replace(/\s+/g, " ").trim();
      const optionTexts = ynGuardGroupOptionTexts(el, doc);
      return ynGuardClassOf(signal, optionTexts) === "policy";
    } catch {
      return true;
    }
  }

  // extension/src/engine/engine/report_helpers.js
  function ynReportLabel(el, doc) {
    if (!el) return "";
    const t = (el.type || "").toLowerCase();
    if (t === "radio" || t === "checkbox") {
      try {
        const fs = el.closest && el.closest("fieldset");
        const legend = fs && fs.querySelector && fs.querySelector("legend");
        const lt = legend && legend.textContent ? legend.textContent.replace(/\s+/g, " ").trim() : "";
        if (lt) return lt.slice(0, 80);
      } catch {
      }
    }
    return ynAdaLabelOf(el, doc);
  }
  var YN_MONTH_NAMES = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sept: 9,
    sep: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12
  };
  function ynToIsoDate(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    const pad = (n) => String(n).padStart(2, "0");
    const build = (y, mo, d) => {
      if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100)) {
        return null;
      }
      const probe = new Date(Date.UTC(y, mo - 1, d));
      if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
        return null;
      }
      return `${y}-${pad(mo)}-${pad(d)}`;
    };
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return build(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
    if (m) return build(+m[3], +m[2], +m[1]);
    m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+),?\s+(\d{4})$/i.exec(s);
    if (m) {
      const mo = YN_MONTH_NAMES[m[2].toLowerCase()];
      return mo ? build(+m[3], mo, +m[1]) : null;
    }
    m = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(s);
    if (m) {
      const mo = YN_MONTH_NAMES[m[1].toLowerCase()];
      return mo ? build(+m[3], mo, +m[2]) : null;
    }
    return null;
  }
  function ynReportEntry(intent, extraLabel) {
    let clean = "";
    try {
      if (intent && intent.el) {
        const doc = intent.el.ownerDocument || (typeof document !== "undefined" ? document : null);
        clean = ynReportLabel(intent.el, doc);
      }
    } catch {
    }
    return {
      fieldKey: intent.fieldKey || "",
      label: extraLabel || clean || intent && intent.questionLabel || intent && intent.label || intent && intent.fieldKey || ""
    };
  }

  // extension/src/engine/engine/process_intent_precheck.js
  function ynEngineIntentPrecheck(intent, report) {
    if (intent.skip === "eeo") {
      report.skipped_eeo.push(ynReportEntry(intent));
      if (intent.el) ynHighlight(intent.el, "missed");
      return true;
    }
    if (intent.skip === "payment") {
      report.skipped_payment.push(ynReportEntry(intent));
      if (intent.el) ynHighlight(intent.el, "missed");
      return true;
    }
    if (intent.skip === "terms") {
      report.skipped_terms.push(ynReportEntry(intent));
      if (intent.el) ynHighlight(intent.el, "missed");
      return true;
    }
    const el = intent.el;
    if (!el || !el.isConnected) {
      report.unresolved.push(ynReportEntry(intent));
      return true;
    }
    const elType = (el.type || "").toLowerCase();
    const elTag = (el.tagName || "").toUpperCase();
    const elRole = (el.getAttribute && el.getAttribute("role") || "").toLowerCase();
    const isComboboxTrigger = elRole === "combobox" || el.getAttribute && el.getAttribute("aria-autocomplete") === "list" || el.getAttribute && el.getAttribute("aria-haspopup") === "listbox";
    const isNativeField = elTag === "INPUT" && !["submit", "button", "reset", "image", "hidden"].includes(elType) || elTag === "SELECT" || elTag === "TEXTAREA" || el.isContentEditable === true;
    const isActionControl = !isComboboxTrigger && (elTag === "BUTTON" || elTag === "A" || elType === "submit" || elType === "button" || elType === "reset" || elType === "image" || elType === "hidden") || !isNativeField && typeof ynSubmitGuard === "function" && ynSubmitGuard(el);
    if (isActionControl) {
      report.unresolved.push(ynReportEntry(intent));
      return true;
    }
    if (intent.skip !== "eeo" && typeof ynInEeoSection === "function" && ynInEeoSection(el)) {
      report.skipped_eeo.push(ynReportEntry(intent));
      ynHighlight(el, "missed");
      return true;
    }
    if (typeof ynIsHoneypot === "function" && ynIsHoneypot(el, document)) {
      report.skipped_honeypot.push(ynReportEntry(intent));
      return true;
    }
    if (typeof ynAdaIsPassword === "function" && ynAdaIsPassword(el)) {
      return true;
    }
    const inPasswordScope = typeof ynFieldInAnyPasswordScope === "function" && ynFieldInAnyPasswordScope(el, document);
    if (inPasswordScope) {
      return true;
    }
    if (typeof ynIsPaymentField === "function" && ynIsPaymentField(el, document)) {
      report.skipped_payment.push(ynReportEntry(intent));
      ynHighlight(el, "missed");
      return true;
    }
    if ((intent.kind === "checkbox" || intent.kind === "radio" || intent.kind === "aria_choice") && typeof ynIsTermsCheckbox === "function" && ynIsTermsCheckbox(el, document)) {
      report.skipped_terms.push(ynReportEntry(intent));
      ynHighlight(el, "missed");
      return true;
    }
    const kind = intent.kind || "text";
    if (kind === "checkbox" || kind === "radio") {
    } else if (kind !== "file" && kind !== "contenteditable_plain") {
      let existingRaw = el.value || "";
      let placeholderProbe = existingRaw;
      let classifyKind = intent.fieldKey === "contact.phone" ? "phone" : kind;
      let selectStructural;
      if (kind === "select") {
        const idx = typeof el.selectedIndex === "number" ? el.selectedIndex : -1;
        const opt = el.options && el.options[idx] || null;
        existingRaw = opt ? String(opt.value || "") : "";
        placeholderProbe = opt ? String(opt.textContent || "") : "";
        selectStructural = {
          selectedIndex: idx,
          optionDisabled: Boolean(!opt || opt.disabled)
        };
      }
      const existing = existingRaw.trim();
      const isPlaceholder = typeof ynIsPlaceholderValue === "function" && ynIsPlaceholderValue(classifyKind, placeholderProbe, selectStructural);
      if (existing && !isPlaceholder) {
        report.user_kept.push(ynReportEntry(intent));
        return true;
      }
    }
    return false;
  }

  // extension/src/engine/engine/process_intent.js
  async function ynEngineProcessIntent(intent, report, context, pendingVerify, YN_VERIFY_BATCH_KINDS) {
    try {
      if (ynEngineIntentPrecheck(intent, report)) return;
      const el = intent.el;
      const kind = intent.kind || "text";
      let ok = false;
      let reportConfidence = intent.confidence || "guessed";
      let verifyExpected;
      if (kind === "text" || kind === "textarea") {
        const priorVal = el.value;
        ynSetNativeValue(el, intent.value);
        const want = String(intent.value ?? "");
        ok = String(el.value || "") === want;
        if (!ok) {
          const isPassword = typeof ynAdaIsPassword === "function" && ynAdaIsPassword(el);
          if (!isPassword && typeof ynTypeValuePerChar === "function") {
            await ynTypeValuePerChar(el, want);
            ok = String(el.value || "") === want;
          }
        }
        if (!ok) {
          const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (squash(el.value) && squash(el.value) === squash(want)) ok = true;
        }
        if (ok && typeof ynStashForUndo === "function") {
          ynStashForUndo({ el, kind: "text", prior: priorVal });
        }
      } else if (kind === "select") {
        const want = String(intent.value ?? "");
        const opts = [...el.options || []];
        let matched = opts.find((o) => o.value === want);
        if (!matched) {
          matched = opts.find(
            (o) => (o.textContent || "").trim().toLowerCase() === want.trim().toLowerCase()
          );
        }
        if (!matched && want.trim()) {
          const partial = opts.filter(
            (o) => (o.textContent || "").trim().toLowerCase().includes(want.trim().toLowerCase())
          );
          if (partial.length === 1) {
            matched = partial[0];
          } else if (partial.length > 1) {
            report.errors.push({
              fieldKey: intent.fieldKey,
              label: `ambiguous select: ${partial.length} options match "${want.slice(0, 40)}"`
            });
          }
        }
        if (matched) {
          const priorVal = el.value;
          ynSetNativeValue(el, matched.value);
          ok = el.value === matched.value;
          if (ok && typeof ynStashForUndo === "function") {
            ynStashForUndo({ el, kind: "select", prior: priorVal });
          }
          verifyExpected = matched.value;
        } else {
          ok = false;
        }
      } else if (kind === "date") {
        const iso = ynToIsoDate(intent.value);
        if (iso) {
          const priorVal = el.value;
          ynSetNativeValue(el, iso);
          ok = String(el.value || "") === iso;
          if (ok && typeof ynStashForUndo === "function") {
            ynStashForUndo({ el, kind: "text", prior: priorVal });
          }
        } else {
          ok = false;
        }
      } else if (kind === "date_parts") {
        const iso = ynToIsoDate(intent.value);
        const parts = intent.els || {};
        if (iso && parts.day && parts.month && parts.year) {
          const [yr, mon, day] = iso.split("-");
          const priorDay = parts.day.value;
          const priorMonth = parts.month.value;
          const priorYear = parts.year.value;
          ynSetNativeValue(parts.day, day);
          ynSetNativeValue(parts.month, mon);
          ynSetNativeValue(parts.year, yr);
          ok = String(parts.day.value || "") === day && String(parts.month.value || "") === mon && String(parts.year.value || "") === yr;
          if (ok && typeof ynStashForUndo === "function") {
            ynStashForUndo({ el: parts.day, kind: "text", prior: priorDay });
            ynStashForUndo({ el: parts.month, kind: "text", prior: priorMonth });
            ynStashForUndo({ el: parts.year, kind: "text", prior: priorYear });
          }
        } else {
          ok = false;
        }
      } else if (kind === "aria_choice") {
        const checkedNow = el.getAttribute && el.getAttribute("aria-checked") === "true";
        if (checkedNow) {
          report.user_kept.push(ynReportEntry(intent));
          return;
        }
        if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) {
          ok = false;
        } else {
          el.click();
          await ynEnginePause(120);
          ok = el.getAttribute("aria-checked") === "true";
          if (ok && typeof ynStashForUndo === "function") {
            ynStashForUndo({ el, kind: "aria_choice", prior: false });
          }
        }
      } else if (kind === "combobox") {
        const r = await ynDriveCombobox(el, intent.value);
        ok = Boolean(r && r.ok);
        if (r && r.error) {
          report.errors.push({
            fieldKey: intent.fieldKey,
            label: String(r.error)
          });
        }
        if (ok) {
          verifyExpected = intent.value;
          if (typeof ynStashForUndo === "function") {
            const prior = "value" in el ? el.value : el.textContent || "";
            ynStashForUndo({ el, kind: "combobox", prior });
          }
        }
      } else if (kind === "checkbox" || kind === "radio") {
        const want = Boolean(intent.value);
        if (el.checked === want) {
          report.user_kept.push(ynReportEntry(intent));
          return;
        }
        const priorChecked = el.checked;
        ynSetNativeValue(el, want);
        ok = el.checked === want;
        if (ok) {
          verifyExpected = want;
          if (typeof ynStashForUndo === "function") {
            ynStashForUndo({ el, kind: "checkbox", prior: priorChecked });
          }
        }
      } else if (kind === "file") {
        let fileSpec = intent.value;
        if (fileSpec && typeof fileSpec === "object" && (fileSpec.file === "cv" || fileSpec.file === "letter")) {
          const plan = context.plan || {};
          const path = fileSpec.file === "cv" ? plan.cv_url : plan.letter_url;
          if (!path) {
            report.unresolved.push(ynReportEntry(intent, "no file url"));
            ynHighlight(el, "missed");
            return;
          }
          const r = await new Promise(
            (res) => chrome.runtime.sendMessage({ type: "FETCH_FILE", path }, res)
          );
          if (!r?.ok) {
            report.errors.push({
              fieldKey: intent.fieldKey,
              label: r?.error || "FETCH_FILE failed"
            });
            report.unresolved.push(ynReportEntry(intent));
            ynHighlight(el, "missed");
            return;
          }
          fileSpec = {
            name: fileSpec.file === "cv" ? "cv.pdf" : "cover-letter.pdf",
            dataUrl: r.dataUrl,
            type: r.contentType || "application/pdf"
          };
        }
        const attach = await ynAttachFileWithConfirm(el, fileSpec, intent);
        if (attach.confirmed) {
          ok = true;
        } else if (attach.attached) {
          ok = true;
          reportConfidence = "guessed";
        } else {
          ok = false;
        }
        if (ok) {
          verifyExpected = true;
          if (typeof ynStashForUndo === "function") {
            ynStashForUndo({ el, kind: "file", prior: null });
          }
        }
      } else if (kind === "contenteditable_plain") {
        const prior = el.textContent || "";
        if (typeof ynWriteContentEditablePlain === "function") {
          ok = ynWriteContentEditablePlain(el, intent.value);
          if (ok && typeof ynStashForUndo === "function") {
            ynStashForUndo({ el, kind: "contenteditable", prior });
          }
        } else {
          ok = false;
        }
      } else if (kind === "skills") {
        const skills = context.plan && Array.isArray(context.plan.skills) ? context.plan.skills : [];
        if (!skills.length) {
          report.unresolved.push(ynReportEntry(intent, "no skills in profile"));
          return;
        }
        if (typeof ynFillSkills !== "function") {
          ok = false;
        } else {
          const r = await ynFillSkills(el, skills);
          for (const skipped of r.skipped) {
            report.unresolved.push(
              ynReportEntry(intent, `skill not offered: ${skipped}`)
            );
          }
          if (r.filled.length) {
            ynHighlight(el, "filled");
            report.filled.push(
              ynReportEntry(intent, `${r.filled.length} skill(s) tagged`)
            );
          }
        }
        return;
      } else {
        report.errors.push({
          fieldKey: intent.fieldKey,
          label: `unknown kind: ${kind}`
        });
        report.unresolved.push(ynReportEntry(intent));
        return;
      }
      if (ok && YN_VERIFY_BATCH_KINDS.has(kind)) {
        pendingVerify.push({ el, kind, expected: verifyExpected, intent, reportConfidence });
        return;
      }
      if (ok) {
        if (reportConfidence === "exact") {
          ynHighlight(el, "filled");
          report.filled.push(ynReportEntry(intent));
        } else {
          ynHighlight(el, "check");
          report.guessed.push(ynReportEntry(intent));
        }
      } else {
        ynHighlight(el, "missed");
        report.unresolved.push(ynReportEntry(intent));
      }
    } catch (e) {
      report.errors.push({
        fieldKey: intent.fieldKey || "",
        label: String(e && e.message ? e.message : e)
      });
      report.unresolved.push(ynReportEntry(intent));
      if (intent.el) ynHighlight(intent.el, "missed");
    }
  }

  // extension/src/engine/engine/unclaimed_and_coverage.js
  function ynListUnclaimedFields(planIntents) {
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc) return [];
    const claimed = new Set(
      (Array.isArray(planIntents) ? planIntents : []).map((i) => i && i.el).filter(Boolean)
    );
    const selector = 'input, select, textarea, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="listbox"], [role="checkbox"], [role="radio"]';
    const nodes = typeof ynQueryDeep === "function" ? ynQueryDeep(doc, selector) : [...doc.querySelectorAll(selector)];
    const out = [];
    for (const el of nodes) {
      if (!el || claimed.has(el)) continue;
      const type = String(
        el.getAttribute && el.getAttribute("type") || el.type || ""
      ).toLowerCase();
      if (type === "password") continue;
      if (["hidden", "submit", "button", "image", "reset"].includes(type)) {
        continue;
      }
      if (typeof ynFieldInAnyPasswordScope === "function" && ynFieldInAnyPasswordScope(el, doc)) {
        continue;
      }
      if (typeof ynIsHoneypot === "function" && ynIsHoneypot(el, doc)) continue;
      const tag = (el.tagName || "").toLowerCase();
      const disabled = Boolean(
        el.disabled || el.getAttribute && el.getAttribute("aria-disabled") === "true"
      );
      let visible = true;
      try {
        const view = doc.defaultView;
        const st = view ? view.getComputedStyle(el) : null;
        if (st && (st.display === "none" || st.visibility === "hidden")) {
          visible = false;
        }
        if (visible && el.getClientRects && el.getClientRects().length === 0) {
          visible = false;
        }
      } catch {
      }
      const label = typeof ynLabelText === "function" && ynLabelText(el, doc) || typeof ynGroupLegend === "function" && ynGroupLegend(el, doc) || typeof ynNearbyText === "function" && ynNearbyText(el, doc) || "";
      out.push({
        tag,
        type,
        id: el.id || "",
        name: el.getAttribute && el.getAttribute("name") || "",
        automationId: el.getAttribute && (el.getAttribute("data-automation-id") || el.getAttribute("data-testid") || el.getAttribute("data-qa")) || "",
        label: String(label || "").replace(/\s+/g, " ").trim().slice(0, 160),
        visible,
        disabled
      });
    }
    return out;
  }
  function ynCoverage(report) {
    const r = report || {};
    const len = (k) => Array.isArray(r[k]) ? r[k].length : 0;
    const filledExact = len("filled");
    const filledGuessed = len("guessed");
    const skipped = len("user_kept");
    const guardRefusals = len("skipped_eeo") + len("skipped_sensitive") + len("skipped_payment") + len("skipped_terms") + len("skipped_password") + len("skipped_honeypot");
    const needsYourAnswer = len("needs_you");
    const notRecognised = typeof r.unclaimed_controls === "number" ? r.unclaimed_controls : 0;
    const manualUpload = typeof r.manual_upload_count === "number" ? r.manual_upload_count : 0;
    const writeRejected = typeof r.write_rejected_count === "number" ? r.write_rejected_count : Math.max(0, len("unresolved") - manualUpload);
    const causes = {
      needs_your_answer: needsYourAnswer,
      not_recognised: notRecognised,
      manual_upload: manualUpload,
      only_you_can_answer: guardRefusals,
      write_rejected: writeRejected
    };
    const filled = filledExact + filledGuessed;
    const fields = filled + skipped + guardRefusals + needsYourAnswer + notRecognised + manualUpload + writeRejected;
    const denominator = fields - skipped - guardRefusals - manualUpload;
    const value = denominator > 0 ? filled / denominator : null;
    return {
      causes,
      coverage: {
        filled,
        fields,
        skipped,
        guard_refusals: guardRefusals,
        manual_uploads: manualUpload,
        value
      }
    };
  }

  // extension/src/engine/engine/execute_intents.js
  async function ynExecuteIntents(intents, ctx) {
    const report = {
      filled: [],
      guessed: [],
      unresolved: [],
      skipped_eeo: [],
      skipped_honeypot: [],
      skipped_payment: [],
      skipped_terms: [],
      user_kept: [],
      errors: [],
      // Fields an immediate write appeared to accept but a short after-write
      // recheck found the page had silently cleared or rejected
      // — moved OUT of filled/guessed into unresolved so coverage never counts
      // them, and kept here too with the specific reason.
      reverted: [],
      // Set true only by the stall detector below: the whole
      // attempt hit its wall-clock cap and stopped. Diagnostic only — never
      // triggers a retry, a click, or a navigation.
      stalled: false,
      // Coverage metric (see ynCoverage below): this function only ever sees
      // the intents it was asked to execute — never the sensitive/needs_you
      // intents split out earlier, never the credential reads that happen
      // after the caller merges reports. The two real fill paths recompute
      // causes/coverage once that fuller picture exists, and that later
      // computation is the one that counts; these two start as null so a
      // caller reading this report in isolation sees "not computed" rather
      // than a confident, partial number.
      causes: null,
      coverage: null
    };
    const list = Array.isArray(intents) ? intents : [];
    const context = ctx || {};
    if (typeof ynResetUndoSession === "function") ynResetUndoSession();
    const verifyQueue = [];
    const pageAccountWall = typeof ynPageIsAccountCreation === "function" && ynPageIsAccountCreation(document);
    if (pageAccountWall) {
      return report;
    }
    const YN_VERIFY_BATCH_KINDS = /* @__PURE__ */ new Set([
      "select",
      "checkbox",
      "radio",
      "combobox",
      "file"
    ]);
    const pendingVerify = [];
    const stallMs = context.stallMs != null ? context.stallMs : 2e4;
    const startedAt = Date.now();
    for (const intent of list) {
      if (!intent) continue;
      const remaining = stallMs - (Date.now() - startedAt);
      if (remaining <= 0) {
        report.stalled = true;
        report.errors.push({
          fieldKey: "",
          label: "the fill stalled, nothing more was attempted"
        });
        break;
      }
      let timedOut = false;
      await Promise.race([
        ynEngineProcessIntent(intent, report, context, pendingVerify, YN_VERIFY_BATCH_KINDS),
        new Promise((resolve) => {
          ynEngineTimer(() => {
            timedOut = true;
            resolve();
          }, remaining);
        })
      ]);
      if (timedOut) {
        report.stalled = true;
        report.errors.push({
          fieldKey: intent.fieldKey || "",
          label: "the fill stalled, nothing more was attempted"
        });
        break;
      }
    }
    if (pendingVerify.length && typeof ynVerifyWrites === "function") {
      const results = await ynVerifyWrites(
        pendingVerify.map((p) => ({
          el: p.el,
          kind: p.kind,
          value: p.expected,
          fieldKey: p.intent.fieldKey
        }))
      );
      for (let i = 0; i < pendingVerify.length; i++) {
        const p = pendingVerify[i];
        const status = results[i] && results[i].status || "rejected";
        if (status === "held" || status === "equivalent_after_mask") {
          if (p.reportConfidence === "exact") {
            ynHighlight(p.el, "filled");
            report.filled.push(ynReportEntry(p.intent));
          } else {
            ynHighlight(p.el, "check");
            report.guessed.push(ynReportEntry(p.intent));
          }
        } else {
          const reason = status === "cleared_after_fill" ? "cleared after fill" : "rejected";
          ynHighlight(p.el, "missed");
          report.unresolved.push(ynReportEntry(p.intent));
          report.reverted.push({ fieldKey: p.intent.fieldKey || "", label: reason });
        }
      }
    } else if (pendingVerify.length) {
      for (const p of pendingVerify) {
        if (p.reportConfidence === "exact") {
          ynHighlight(p.el, "filled");
          report.filled.push(ynReportEntry(p.intent));
        } else {
          ynHighlight(p.el, "check");
          report.guessed.push(ynReportEntry(p.intent));
        }
      }
    }
    try {
      const touchedKeys = new Set(
        [...report.filled, ...report.guessed].map((e) => e.fieldKey).filter(Boolean)
      );
      if (touchedKeys.size) {
        const touchedEls = [];
        for (const p of pendingVerify) {
          if (touchedKeys.has(p.intent.fieldKey)) touchedEls.push(p.el);
        }
        for (const i of list) {
          if (i && i.el && touchedKeys.has(i.fieldKey)) touchedEls.push(i.el);
        }
        const alertRe = /required|invalid|must\s/i;
        const alertSelector = '[role="alert"], .artdeco-inline-feedback--error, .fb-form-element-label__error';
        const seen = /* @__PURE__ */ new Set();
        for (const el of touchedEls) {
          if (!el || seen.has(el)) continue;
          seen.add(el);
          const scope = el.closest && (el.closest("form") || el.closest("fieldset")) || el.parentElement || el;
          let alerts = [];
          try {
            alerts = typeof ynQueryDeep === "function" ? ynQueryDeep(scope, alertSelector) : Array.from(scope.querySelectorAll(alertSelector));
          } catch {
            alerts = [];
          }
          for (const a of alerts) {
            const text = String(a.textContent || "").trim();
            if (text && alertRe.test(text)) {
              report.errors.push({
                fieldKey: list.find((i) => i && i.el === el && i.fieldKey)?.fieldKey || "",
                label: "site_flagged: " + text.slice(0, 120)
              });
              break;
            }
          }
        }
      }
    } catch {
    }
    const done = report.filled.length + report.guessed.length;
    const total = done + report.unresolved.length + report.skipped_eeo.length + report.user_kept.length;
    try {
      ynUpdateFillBadge(done, total || done);
    } catch {
    }
    try {
      const kindByKey = /* @__PURE__ */ new Map();
      for (const i of list) {
        if (i && i.fieldKey && !kindByKey.has(i.fieldKey)) {
          kindByKey.set(i.fieldKey, i.kind || "text");
        }
      }
      let manualUpload = 0;
      for (const e of report.unresolved) {
        if (kindByKey.get(e && e.fieldKey) === "file") manualUpload += 1;
      }
      report.manual_upload_count = manualUpload;
      report.write_rejected_count = Math.max(
        0,
        report.unresolved.length - manualUpload
      );
    } catch {
      report.manual_upload_count = 0;
      report.write_rejected_count = report.unresolved.length;
    }
    try {
      const unclaimed = typeof ynListUnclaimedFields === "function" ? ynListUnclaimedFields(list).filter((f) => f && f.visible && !f.disabled) : [];
      report.unclaimed_controls = unclaimed.length;
    } catch {
      report.unclaimed_controls = 0;
    }
    if (typeof ynCoverage === "function") {
      Object.assign(report, ynCoverage(report));
    }
    return report;
  }

  // extension/src/engine/engine/index.js
  globalThis.YN_ADAPTERS = typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
  globalThis.ynEnginePause = ynEnginePause;
  globalThis.ynEngineTimer = ynEngineTimer;
  globalThis.ynAdaIsPassword = ynAdaIsPassword;
  globalThis.ynAdaLabelOf = ynAdaLabelOf;
  globalThis.ynAdaUsable = ynAdaUsable;
  globalThis.YN_HONEYPOT_PHRASE_RE = YN_HONEYPOT_PHRASE_RE;
  globalThis.ynHoneypotSignalText = ynHoneypotSignalText;
  globalThis.ynAriaHiddenSelfOrAncestor = ynAriaHiddenSelfOrAncestor;
  globalThis.ynIsVisuallyHiddenTrap = ynIsVisuallyHiddenTrap;
  globalThis.ynFieldTopHitElements = ynFieldTopHitElements;
  globalThis.ynIsOccludedField = ynIsOccludedField;
  globalThis.ynIsHoneypot = ynIsHoneypot;
  globalThis.ynShouldSkipField = ynShouldSkipField;
  globalThis.ynVisiblePasswordsIn = ynVisiblePasswordsIn;
  globalThis.ynHasVisiblePassword = ynHasVisiblePassword;
  globalThis.ynNearestForm = ynNearestForm;
  globalThis.YN_AUTH_WIDGET_SEL = YN_AUTH_WIDGET_SEL;
  globalThis.YN_AUTH_HEADING_RE = YN_AUTH_HEADING_RE;
  globalThis.YN_ACCOUNT_CONTAINER_SEL = YN_ACCOUNT_CONTAINER_SEL;
  globalThis.ynNearestAccountContainer = ynNearestAccountContainer;
  globalThis.ynBoundedPasswordNeighbourhood = ynBoundedPasswordNeighbourhood;
  globalThis.ynPasswordScope = ynPasswordScope;
  globalThis.ynPasswordScopes = ynPasswordScopes;
  globalThis.YN_ACCOUNT_TYPED_AC = YN_ACCOUNT_TYPED_AC;
  globalThis.YN_ACCOUNT_TYPED_SIGNAL_RE = YN_ACCOUNT_TYPED_SIGNAL_RE;
  globalThis.ynIsFillableNonHoneypotField = ynIsFillableNonHoneypotField;
  globalThis.ynIsAccountTypedField = ynIsAccountTypedField;
  globalThis.ynFieldInNakedPasswordNeighbourhood = ynFieldInNakedPasswordNeighbourhood;
  globalThis.ynFieldInAnyPasswordScope = ynFieldInAnyPasswordScope;
  globalThis.ynFieldInAccountWall = ynFieldInAccountWall;
  globalThis.ynPageIsAccountCreation = ynPageIsAccountCreation;
  globalThis.ynIsAccountCreationWall = ynIsAccountCreationWall;
  globalThis.ynSubmitGuard = ynSubmitGuard;
  globalThis.YN_PAYMENT_AC_RE = YN_PAYMENT_AC_RE;
  globalThis.YN_PAYMENT_SIGNAL_RE = YN_PAYMENT_SIGNAL_RE;
  globalThis.ynIsPaymentField = ynIsPaymentField;
  globalThis.YN_GUARD_SENSITIVE_RE = YN_GUARD_SENSITIVE_RE;
  globalThis.YN_GUARD_TRUTH_RE = YN_GUARD_TRUTH_RE;
  globalThis.YN_GUARD_POLICY_RE = YN_GUARD_POLICY_RE;
  globalThis.ynGuardClassOf = ynGuardClassOf;
  globalThis.ynGuardGroupLegendText = ynGuardGroupLegendText;
  globalThis.ynGuardGroupOptionTexts = ynGuardGroupOptionTexts;
  globalThis.YN_TERMS_SIGNAL_RE_HISTORIC = YN_TERMS_SIGNAL_RE_HISTORIC;
  globalThis.ynIsTermsCheckbox = ynIsTermsCheckbox;
  globalThis.ynReportLabel = ynReportLabel;
  globalThis.YN_MONTH_NAMES = YN_MONTH_NAMES;
  globalThis.ynToIsoDate = ynToIsoDate;
  globalThis.ynReportEntry = ynReportEntry;
  globalThis.ynExecuteIntents = ynExecuteIntents;
  globalThis.ynListUnclaimedFields = ynListUnclaimedFields;
  globalThis.ynCoverage = ynCoverage;
  if (typeof ynKitInit === "function") ynKitInit({ clickGuard: ynSubmitGuard });
})();
