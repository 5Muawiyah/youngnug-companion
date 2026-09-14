// common/challenge_detect.js — GENERIC captcha / bot-gate / login-wall
// detectors, kept separate from common/api.js. Pure DOM/title reads,
// no network, no storage. Presence of a challenge = HARD STOP for the
// caller — never solve, never bypass, never submit. Endpoints, tokens and
// caps stay private in common/api.js.

// Captcha / bot-gate / login-wall sentinel — presence = HARD STOP, never bypass.
// Capture + every non-fill flow keep this STRICT check (widget OR challenge).
// Fill orchestration uses ynChallengePage / ynPassiveCaptchaPresent instead
// (Lever embeds hCaptcha on an otherwise-normal apply form — see MESSAGE_CONTRACT).
// The five sentinels, each named. They were an anonymous OR until a real
// capture on a real signed-in LinkedIn advert failed with
// "page blocked (captcha/login)" and nothing — not the popup, not the durable
// `lastCapture` record, not the server, which never saw a request — could say
// which of the five had fired. It is the same shape as the admin door's
// `enrolment_not_available`: one sentence for five different causes, on the
// one path where a person is most likely to be stuck. Naming them costs
// nothing and is the difference between a diagnosis and a guess.
const YN_BLOCK_SENTINELS = [
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
  ["a challenge form", "#challenge-form"],
];

/**
 * WHICH sentinel fired, in the words a person can act on, or "" for none.
 * `ynBlocked()` is this function's boolean, so the two can never disagree.
 */
// A reCAPTCHA v3 badge (the invisible anchor frame a site mounts on every page,
// inside .grecaptcha-badge, size=invisible) is not a challenge: nothing asks
// the student anything, and reading the page touches it not at all. Measured
// on a Greenhouse job-boards posting, where the badge alone stopped a capture
// that should have read the advert. A challenge frame (bframe, or a visible
// size=normal anchor) is still a block, as is every other sentinel.
function ynIsPassiveRecaptchaFrame(el) {
  try {
    const src = String((el && el.getAttribute && el.getAttribute("src")) || "");
    if (/\/bframe/i.test(src)) return false;
    if (/size=invisible/i.test(src)) return true;
    return Boolean(el.closest && el.closest(".grecaptcha-badge"));
  } catch {
    return false;
  }
}

// A captcha frame that is not rendered is not a challenge either: Recruitee
// mounts its hCaptcha widget on the POSTING page inside a display:none block
// (0x0, no client rects) and only shows it on the apply page. Computed
// display is read up the ancestor chain, which jsdom honours for inline and
// stylesheet rules, so the same rule holds in the harness and in a real tab.
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
      // The captcha vendors' own plumbing carries "captcha" in an id on every
      // page that loads their script, challenge or not: reCAPTCHA's hidden
      // token textarea, the loader <script>, Recruitee's empty token holders
      // (div#input-captchaToken-...). None of those asks the student anything.
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
  // a title MENTIONING sign-in is not a login wall (LinkedIn suffixes titles
  // with "| Sign in" variants, which would otherwise false-positive): only a
  // title that STARTS as the sign-in page, or a live password form, blocks
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

// Interstitial / login-wall half of ynBlocked — real challenge pages only.
// Title patterns + title-starts-with sign-in + live password form on a login
// action + a text-phrase CAPTCHA field ANYWHERE on the page.
// Does NOT fire for an embedded captcha widget on a normal form page.
function ynChallengePage() {
  const title = document.title || "";
  if (/verif|security check|just a moment|are you a robot/i.test(title))
    return true;
  if (/^\s*(sign in|log in|login)\b/i.test(title)) return true;
  if (
    typeof ynPageHasCaptchaField === "function" &&
    ynPageHasCaptchaField(document)
  ) {
    return true;
  }
  return Boolean(
    document.querySelector("form[action*='login'] input[type='password']"),
  );
}

// Embedded captcha widget (recaptcha / hcaptcha / turnstile) on an otherwise
// normal form page. Presence alone is NOT a fill hard-stop — the user solves
// it at submit. Never solve, never bypass, never submit.
function ynPassiveCaptchaPresent() {
  const sel = [
    "iframe[src*='recaptcha']",
    "iframe[src*='hcaptcha']",
    "iframe[src*='turnstile']",
    "[id*='captcha']",
    "#challenge-form",
  ];
  return Boolean(document.querySelector(sel.join(",")));
}

// ─── text-phrase CAPTCHA detection ─────────────
// Alongside the widget/id sentinels above: a bespoke inline anti-bot FIELD,
// recognised by its own wording rather than a known widget or id shape.
// Hard stop, exactly like the sentinels — never solved, never bypassed.
//
// lifted from https://github.com/averatec0773/offeros/blob/c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94/packages/autofill/src/label-quality.ts#L203-L225 (Apache-2.0), adapted
// — the phrase set (both "are you/you are ... human" word orders, the
// "human resources" exclusion, the image-text/characters-shown/security-
// check/"I'm not a robot" alternatives) is offeros's CAPTCHA_PATTERNS; the
// regex itself is rewritten for a single plain string rather than offeros's
// `subject` object, and the "image text" alternative also accepts the
// "below"-after-the-noun-phrase word order the original example
// uses ("type the image text below").
const YN_CAPTCHA_TEXT_RE =
  /(?:are you|you are)\s+(?:a\s+)?human\b(?!\s*resources?)|type\s+(?:the\s+)?(?:below\s+)?image\s+text(?:\s+below)?|enter\s+the\s+(?:characters|text|code)\s+(?:you see|shown|above|below)|security check|i'?m not a robot/i;

/** True when a single string reads as a text-phrase CAPTCHA prompt. */
function ynIsCaptchaLabelText(text) {
  return YN_CAPTCHA_TEXT_RE.test(String(text || ""));
}

/**
 * A minimal, self-contained label reader for this file's own field scan —
 * deliberately independent of content/heuristics.js's richer ynLabelText
 * (loaded LATER in the click-time stack), so this detector works wherever
 * challenge_detect.js alone has loaded, including the very first checks a
 * fill entry point makes.
 */
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
    /* ignore — read-only probe */
  }
  return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * ynPageHasCaptchaField(doc) → true when ANY input/textarea on the page
 * reads as a text-phrase CAPTCHA prompt. A page-level hard-stop signal
 * distinct from the widget/interstitial sentinels above: this one has no
 * iframe and no telltale id, only its own wording.
 */
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
    if (
      ["hidden", "submit", "button", "image", "reset", "password"].includes(
        type,
      )
    ) {
      continue;
    }
    const signal = ynChallengeFieldSignalText(el, document_);
    if (signal && ynIsCaptchaLabelText(signal)) return true;
  }
  return false;
}

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
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
