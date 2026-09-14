// content/password_kit.js — generic policy-aware password generator.
// Parses visible password-policy text + form field attributes, generates a
// compliant password with a CSPRNG, and
// verifies it against the parsed policy. No DOM writes, no network, no
// storage, no logging — the value exists only in the caller's memory. The
// YoungNug wall-detection and panel stay private in content/assist.js.


/** Default generated length when the site policy allows it. */
var YN_ASSIST_DEFAULT_LEN = 20;

/** Safe fallback when policy text/attrs are unparseable (16+ mixed classes). */
var YN_ASSIST_SAFE_DEFAULT = {
  minLength: 16,
  maxLength: 64,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSymbol: true,
  requireAlpha: true,
  forbidden: "",
  parsed: false,
  source: "default",
};

// Symbols Workday-style walls accept; no quotes/backslash/space (form-hostile).
var YN_ASSIST_SYMBOLS = "!@#$%^&*()-_=+[]{}|;:,.<>?";
var YN_ASSIST_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
var YN_ASSIST_LOWER = "abcdefghijkmnopqrstuvwxyz";
var YN_ASSIST_DIGIT = "23456789";

/**
 * Parse visible password-policy text + optional form field attributes.
 * Research fixtures (verbatim list):
 *   "A minimum of N characters", "An? uppercase|lowercase|numeric|special|
 *   alphabetic character" - order is NOT stable across Workday tenants.
 * Unparseable → safe default + parsed:false (panel shows this in its note).
 *
 * @param {string|null} text
 * @param {Element|null} formEl password input or its form (minlength/maxlength/pattern)
 * @returns {object} policy
 */
function ynParsePasswordPolicy(text, formEl) {
  const policy = {
    minLength: null,
    maxLength: null,
    requireUpper: false,
    requireLower: false,
    requireDigit: false,
    requireSymbol: false,
    requireAlpha: false,
    forbidden: "",
    pattern: null,
    parsed: false,
    source: "none",
  };

  const raw = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (raw) {
    // Workday boilerplate lines - match independently, never by position.
    // Confirmed against real Workday tenants (Lloyd's, GSK, AstraZeneca),
    // where the wording order is not stable between them.
    const minM = raw.match(/a\s+minimum\s+of\s+(\d+)\s+characters?/i);
    if (minM) policy.minLength = Math.max(1, parseInt(minM[1], 10) || 0);

    if (/\ban?\s+uppercase\s+character\b/i.test(raw))
      policy.requireUpper = true;
    if (/\ban?\s+lowercase\s+character\b/i.test(raw))
      policy.requireLower = true;
    if (/\ban?\s+numeric\s+character\b/i.test(raw)) policy.requireDigit = true;
    if (/\ban?\s+special\s+character\b/i.test(raw)) policy.requireSymbol = true;
    if (/\ban?\s+alphabetic\s+character\b/i.test(raw))
      policy.requireAlpha = true;

    // Generic English variants (not Workday-only).
    if (/\bat\s+least\s+(\d+)\s+characters?\b/i.test(raw)) {
      const m = raw.match(/\bat\s+least\s+(\d+)\s+characters?\b/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!policy.minLength || n > policy.minLength) policy.minLength = n;
      }
    }
    if (/\bupper\b/i.test(raw) && !policy.requireUpper) {
      if (/upper\s*case|uppercase|capital/i.test(raw))
        policy.requireUpper = true;
    }
    if (/\blower\b/i.test(raw) && !policy.requireLower) {
      if (/lower\s*case|lowercase/i.test(raw)) policy.requireLower = true;
    }
    if (/\b(digit|number|numeric)\b/i.test(raw) && !policy.requireDigit) {
      policy.requireDigit = true;
    }
    if (
      /\b(special|symbol|non[- ]?alphanumeric)\b/i.test(raw) &&
      !policy.requireSymbol
    ) {
      policy.requireSymbol = true;
    }
    if (/\bno\s+spaces?\b/i.test(raw)) {
      policy.forbidden += " ";
    }

    const anyReq =
      policy.minLength != null ||
      policy.requireUpper ||
      policy.requireLower ||
      policy.requireDigit ||
      policy.requireSymbol ||
      policy.requireAlpha;
    if (anyReq) {
      policy.parsed = true;
      policy.source = "text";
    }
  }

  // Field attributes: standard HTML5 constraint attributes (minlength/
  // maxlength/pattern) — a platform-neutral floor; no password wall seen so
  // far surfaces these in its visible policy text.
  const field = formEl || null;
  if (field && field.getAttribute) {
    const minA = field.getAttribute("minlength");
    const maxA = field.getAttribute("maxlength");
    const pat = field.getAttribute("pattern");
    if (minA != null && minA !== "") {
      const n = parseInt(minA, 10);
      if (!isNaN(n)) {
        if (policy.minLength == null || n > policy.minLength) {
          policy.minLength = n;
        }
        policy.parsed = true;
        if (policy.source === "none") policy.source = "attrs";
        else if (policy.source === "text") policy.source = "text+attrs";
      }
    }
    if (maxA != null && maxA !== "") {
      const n = parseInt(maxA, 10);
      if (!isNaN(n) && n > 0) {
        policy.maxLength = n;
        policy.parsed = true;
        if (policy.source === "none") policy.source = "attrs";
        else if (policy.source === "text") policy.source = "text+attrs";
      }
    }
    if (pat) {
      policy.pattern = pat;
      policy.parsed = true;
      if (policy.source === "none") policy.source = "attrs";
      else if (policy.source === "text") policy.source = "text+attrs";
    }
  }

  if (!policy.parsed) {
    return Object.assign({}, YN_ASSIST_SAFE_DEFAULT);
  }

  // Floor: if they stated classes but no length, use a safe 8 (Workday floor).
  if (policy.minLength == null) policy.minLength = 8;
  if (policy.maxLength == null) policy.maxLength = 128;

  // "Alphabetic" without case detail → require at least one letter class.
  if (policy.requireAlpha && !policy.requireUpper && !policy.requireLower) {
    policy.requireLower = true;
  }

  return policy;
}

/**
 * True when `pw` satisfies the parsed policy (used by generator + tests).
 * Does not log or store the value.
 */
function ynPasswordSatisfiesPolicy(pw, policy) {
  const p = policy || YN_ASSIST_SAFE_DEFAULT;
  const s = String(pw || "");
  if (p.minLength != null && s.length < p.minLength) return false;
  if (p.maxLength != null && s.length > p.maxLength) return false;
  if (p.requireUpper && !/[A-Z]/.test(s)) return false;
  if (p.requireLower && !/[a-z]/.test(s)) return false;
  if (p.requireDigit && !/[0-9]/.test(s)) return false;
  if (p.requireSymbol) {
    // Any non-alphanumeric counts as special (Workday "special character").
    if (!/[^A-Za-z0-9]/.test(s)) return false;
  }
  if (p.requireAlpha && !/[A-Za-z]/.test(s)) return false;
  if (p.forbidden) {
    for (let i = 0; i < p.forbidden.length; i++) {
      if (s.indexOf(p.forbidden.charAt(i)) !== -1) return false;
    }
  }
  if (p.pattern) {
    try {
      const re = new RegExp("^(?:" + p.pattern + ")$");
      if (!re.test(s)) return false;
    } catch {
      /* bad pattern attribute - ignore */
    }
  }
  return true;
}

function ynAssistRandomInt(maxExclusive) {
  if (maxExclusive <= 0) return 0;
  const buf = new Uint32Array(1);
  // crypto.getRandomValues - browser WebCrypto / Node 19+ global crypto.
  const c =
    (typeof crypto !== "undefined" && crypto) ||
    (typeof globalThis !== "undefined" && globalThis.crypto) ||
    null;
  if (!c || typeof c.getRandomValues !== "function") {
    // Fail closed: never fall back to Math.random for credentials.
    throw new Error("crypto.getRandomValues unavailable");
  }
  c.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

function ynAssistPick(chars) {
  return chars.charAt(ynAssistRandomInt(chars.length));
}

function ynAssistShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = ynAssistRandomInt(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/**
 * Client-side password generator. Satisfies `policy`; default length 20 when
 * the policy allows. Retries a bounded number of times; never logs the value.
 *
 * @param {object} policy from ynParsePasswordPolicy
 * @returns {string}
 */
function ynGeneratePassword(policy) {
  const p =
    policy && typeof policy === "object" ? policy : YN_ASSIST_SAFE_DEFAULT;
  const minL = p.minLength != null ? p.minLength : 16;
  const maxL = p.maxLength != null ? p.maxLength : 128;
  let len = YN_ASSIST_DEFAULT_LEN;
  if (len < minL) len = minL;
  if (len > maxL) len = maxL;
  if (len < 1) len = minL;

  let pool = "";
  const must = [];
  if (p.requireUpper || p.requireAlpha) {
    pool += YN_ASSIST_UPPER;
    if (p.requireUpper) must.push(ynAssistPick(YN_ASSIST_UPPER));
  }
  if (p.requireLower || p.requireAlpha) {
    pool += YN_ASSIST_LOWER;
    if (p.requireLower) must.push(ynAssistPick(YN_ASSIST_LOWER));
  }
  if (p.requireDigit) {
    pool += YN_ASSIST_DIGIT;
    must.push(ynAssistPick(YN_ASSIST_DIGIT));
  }
  if (p.requireSymbol) {
    pool += YN_ASSIST_SYMBOLS;
    must.push(ynAssistPick(YN_ASSIST_SYMBOLS));
  }
  if (!pool) {
    pool =
      YN_ASSIST_UPPER + YN_ASSIST_LOWER + YN_ASSIST_DIGIT + YN_ASSIST_SYMBOLS;
    must.push(
      ynAssistPick(YN_ASSIST_UPPER),
      ynAssistPick(YN_ASSIST_LOWER),
      ynAssistPick(YN_ASSIST_DIGIT),
      ynAssistPick(YN_ASSIST_SYMBOLS),
    );
  }

  // Strip forbidden chars from pool.
  if (p.forbidden) {
    let filtered = "";
    for (let i = 0; i < pool.length; i++) {
      if (p.forbidden.indexOf(pool.charAt(i)) === -1)
        filtered += pool.charAt(i);
    }
    pool = filtered || pool;
  }

  for (let attempt = 0; attempt < 48; attempt++) {
    const chars = must.slice();
    while (chars.length < len) chars.push(ynAssistPick(pool));
    // Trim if must-classes exceeded len (rare).
    while (chars.length > len) chars.pop();
    ynAssistShuffle(chars);
    const pw = chars.join("");
    if (ynPasswordSatisfiesPolicy(pw, p)) return pw;
  }
  // Last resort: still try to return something that passes the common checks.
  const fallback = must.concat(
    Array.from({ length: Math.max(0, len - must.length) }, () =>
      ynAssistPick(pool),
    ),
  );
  ynAssistShuffle(fallback);
  return fallback.slice(0, len).join("");
}
// Every name top-level in the original single-file version, exposed on
// globalThis exactly as before the move — chrome.scripting still injects
// the built file into the same isolated world as its neighbours, so a
// bare name another shipped file already called is still there to call.
globalThis.YN_ASSIST_DEFAULT_LEN = YN_ASSIST_DEFAULT_LEN;
globalThis.YN_ASSIST_SAFE_DEFAULT = YN_ASSIST_SAFE_DEFAULT;
globalThis.YN_ASSIST_SYMBOLS = YN_ASSIST_SYMBOLS;
globalThis.YN_ASSIST_UPPER = YN_ASSIST_UPPER;
globalThis.YN_ASSIST_LOWER = YN_ASSIST_LOWER;
globalThis.YN_ASSIST_DIGIT = YN_ASSIST_DIGIT;
globalThis.ynParsePasswordPolicy = ynParsePasswordPolicy;
globalThis.ynPasswordSatisfiesPolicy = ynPasswordSatisfiesPolicy;
globalThis.ynAssistRandomInt = ynAssistRandomInt;
globalThis.ynAssistPick = ynAssistPick;
globalThis.ynAssistShuffle = ynAssistShuffle;
globalThis.ynGeneratePassword = ynGeneratePassword;
