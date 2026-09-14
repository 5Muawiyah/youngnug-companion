(() => {
  // extension/src/common/challenge_detect/index.js
  var YN_BLOCK_SENTINELS = [
    ["recaptcha widget", "iframe[src*='recaptcha']"],
    ["hcaptcha widget", "iframe[src*='hcaptcha']"],
    ["turnstile widget", "iframe[src*='turnstile']"],
    // A challenge frame served from a first-party captcha CDN carries none of
    // the vendor names in its src (Recruitee: captcha-assets.recruiteecdn.com)
    // but names itself in its title ("Widget containing checkbox for hCaptcha
    // security challenge").
    ["captcha widget frame", "iframe[title*=captcha i]"],
    // Deliberately loose, and therefore the most likely false positive of the
    // five: it matches ANY element whose id merely CONTAINS "captcha",
    // including a hidden placeholder a site mounts before any challenge exists.
    ["an element with 'captcha' in its id", "[id*='captcha']"],
    ["a challenge form", "#challenge-form"]
  ];
  function ynIsPassiveRecaptchaFrame(el) {
    try {
      const src = String(el && el.getAttribute && el.getAttribute("src") || "");
      if (/\/bframe/i.test(src)) return false;
      if (/size=invisible/i.test(src)) return true;
      return Boolean(el.closest && el.closest(".grecaptcha-badge"));
    } catch {
      return false;
    }
  }
  function ynIsUnrenderedFrame(el) {
    try {
      let e = el;
      for (let i = 0; i < 12 && e && e.nodeType === 1; i++) {
        const view = e.ownerDocument && e.ownerDocument.defaultView;
        const cs = view && view.getComputedStyle ? view.getComputedStyle(e) : null;
        if (cs && cs.display === "none") return true;
        if (e.hidden) return true;
        e = e.parentElement;
      }
    } catch {
      return false;
    }
    return false;
  }
  function ynIsPassiveCaptchaFrame(el) {
    if (ynIsPassiveRecaptchaFrame(el)) return true;
    return ynIsUnrenderedFrame(el);
  }
  function ynBlockedReason() {
    for (const [name, selector] of YN_BLOCK_SENTINELS) {
      let el = null;
      if (/widget|frame/.test(name)) {
        for (const f of document.querySelectorAll(selector)) {
          if (!ynIsPassiveCaptchaFrame(f)) {
            el = f;
            break;
          }
        }
      } else if (name === "an element with 'captcha' in its id") {
        for (const c of document.querySelectorAll(selector)) {
          const id = String(c.id || "");
          const tag = String(c.tagName || "").toUpperCase();
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK" || tag === "NOSCRIPT" || tag === "TEMPLATE") continue;
          if (tag === "TEXTAREA" && /^g-recaptcha-response/.test(id)) continue;
          if (/captcha[-_]?token/i.test(id)) continue;
          el = c;
          break;
        }
      } else {
        el = document.querySelector(selector);
      }
      if (el) {
        const id = el.id ? ` (#${String(el.id).slice(0, 40)})` : "";
        return `${name}${id}`;
      }
    }
    const title = document.title || "";
    if (/verif|security check|just a moment|are you a robot/i.test(title))
      return `an interstitial page title ("${title.slice(0, 60)}")`;
    if (/^\s*(sign in|log in|login)\b/i.test(title))
      return `a sign-in page title ("${title.slice(0, 60)}")`;
    if (document.querySelector("form[action*='login'] input[type='password']"))
      return "a live password form on a login action";
    return "";
  }
  function ynBlocked() {
    return ynBlockedReason() !== "";
  }
  function ynChallengePage() {
    const title = document.title || "";
    if (/verif|security check|just a moment|are you a robot/i.test(title))
      return true;
    if (/^\s*(sign in|log in|login)\b/i.test(title)) return true;
    if (typeof ynPageHasCaptchaField === "function" && ynPageHasCaptchaField(document)) {
      return true;
    }
    return Boolean(
      document.querySelector("form[action*='login'] input[type='password']")
    );
  }
  function ynPassiveCaptchaPresent() {
    const sel = [
      "iframe[src*='recaptcha']",
      "iframe[src*='hcaptcha']",
      "iframe[src*='turnstile']",
      "[id*='captcha']",
      "#challenge-form"
    ];
    return Boolean(document.querySelector(sel.join(",")));
  }
  var YN_CAPTCHA_TEXT_RE = /(?:are you|you are)\s+(?:a\s+)?human\b(?!\s*resources?)|type\s+(?:the\s+)?(?:below\s+)?image\s+text(?:\s+below)?|enter\s+the\s+(?:characters|text|code)\s+(?:you see|shown|above|below)|security check|i'?m not a robot/i;
  function ynIsCaptchaLabelText(text) {
    return YN_CAPTCHA_TEXT_RE.test(String(text || ""));
  }
  function ynChallengeFieldSignalText(el, doc) {
    const document_ = doc || (typeof document !== "undefined" ? document : null);
    const bits = [];
    try {
      if (el.labels && el.labels.length) {
        for (const lab of el.labels) bits.push(lab.textContent || "");
      } else if (el.id && document_ && document_.querySelector) {
        const lab = document_.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab) bits.push(lab.textContent || "");
      }
      bits.push(el.getAttribute("aria-label") || "");
      bits.push(el.getAttribute("placeholder") || "");
      bits.push(el.name || "");
      bits.push(el.id || "");
      const wrap = el.closest && el.closest("label");
      if (wrap) bits.push(wrap.textContent || "");
      const prev = el.previousElementSibling;
      if (prev) bits.push((prev.textContent || "").slice(0, 200));
    } catch {
    }
    return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  function ynPageHasCaptchaField(doc) {
    const document_ = doc || (typeof document !== "undefined" ? document : null);
    if (!document_) return false;
    let fields = [];
    try {
      fields = [...document_.querySelectorAll("input, textarea")];
    } catch {
      return false;
    }
    for (const el of fields) {
      const type = (el.type || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset", "password"].includes(
        type
      )) {
        continue;
      }
      const signal = ynChallengeFieldSignalText(el, document_);
      if (signal && ynIsCaptchaLabelText(signal)) return true;
    }
    return false;
  }
  globalThis.YN_BLOCK_SENTINELS = YN_BLOCK_SENTINELS;
  globalThis.ynIsPassiveRecaptchaFrame = ynIsPassiveRecaptchaFrame;
  globalThis.ynIsUnrenderedFrame = ynIsUnrenderedFrame;
  globalThis.ynIsPassiveCaptchaFrame = ynIsPassiveCaptchaFrame;
  globalThis.ynBlockedReason = ynBlockedReason;
  globalThis.ynBlocked = ynBlocked;
  globalThis.ynChallengePage = ynChallengePage;
  globalThis.ynPassiveCaptchaPresent = ynPassiveCaptchaPresent;
  globalThis.YN_CAPTCHA_TEXT_RE = YN_CAPTCHA_TEXT_RE;
  globalThis.ynIsCaptchaLabelText = ynIsCaptchaLabelText;
  globalThis.ynChallengeFieldSignalText = ynChallengeFieldSignalText;
  globalThis.ynPageHasCaptchaField = ynPageHasCaptchaField;
})();
