// content/adapters/workday.js, part 1 of 3 — data-automation-id lookup,
// account-wall detection, resume target and EEO-skip helpers. See
// index.js for the file's full banner.
//
// ynAdaFind, ynAdaIsPassword and ynAdaFindAll are NOT declared in this
// bundle — they are content/dom_fill_kit.js globals, injected before every
// adapter and referenced here exactly as the original file referenced
// them: bare names resolved at runtime, unchanged by this split.

/**
 * Convention lookup: try data-automation-id, resolve to a fillable control.
 * Returns null if nothing usable is on the page (heuristics may still run).
 * // convention, re-verify on live
 */
export function ynWdByAutomation(doc, automationId) {
  if (!automationId) return null;
  let el = null;
  try {
    el = ynAdaFind(doc, `[data-automation-id="${CSS.escape(automationId)}"]`);
  } catch {
    el = ynAdaFind(doc, `[data-automation-id="${automationId}"]`);
  }
  if (!el) return null;
  return ynWdResolveControl(el);
}

/**
 * If automation-id is on a wrapper, drill to input/textarea/select or
 * a combobox-like control. Password fields never returned.
 */
export function ynWdResolveControl(el) {
  if (!el) return null;
  if (ynAdaIsPassword(el)) return null;
  const tag = (el.tagName || "").toUpperCase();
  const type = (el.type || "").toLowerCase();
  if (
    (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") &&
    !["hidden", "submit", "button", "image", "reset"].includes(type)
  ) {
    return el;
  }
  // combobox button / role=button dropdown host — keep host for ynDriveCombobox
  const role = (el.getAttribute("role") || "").toLowerCase();
  if (role === "combobox" || role === "button" || role === "listbox") {
    // prefer nested input if present
    const nested =
      el.querySelector &&
      el.querySelector(
        'input:not([type="hidden"]):not([type="password"]), textarea, [role="combobox"]',
      );
    if (nested && !ynAdaIsPassword(nested)) return nested;
    return el;
  }
  const inner =
    (el.querySelector &&
      el.querySelector(
        'input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="button"]), textarea, select, [role="combobox"]',
      )) ||
    null;
  if (inner && !ynAdaIsPassword(inner)) return inner;
  // file input may be nested under upload host
  const file = el.querySelector && el.querySelector('input[type="file"]');
  if (file) return file;
  return null;
}

/**
 * Account-creation / sign-in wall = assist mode. Detect convention hooks only;
 * never fill credentials (email/password/name on this step). // convention,
 * re-verify on live.
 *
 * Live defect 2026-07-18: Lloyd's Workday ".../apply/applyManually" Create
 * Account step was missed → heuristics filled account email + honeypot.
 * Extended signals below; engine/heuristics also refuse fills when
 * ynPageIsAccountCreation is true.
 */
export function ynWdIsAccountWall(doc) {
  const document_ = doc || document;
  const href =
    (typeof location !== "undefined" && location.href) ||
    (document_ && document_.URL) ||
    "";

  // Shared engine detector (URL applyManually+password, createaccount, Create
  // Account heading+verify password, Create Account button).
  if (
    typeof ynPageIsAccountCreation === "function" &&
    ynPageIsAccountCreation(document_, href)
  ) {
    return true;
  }

  // URL signals (Workday apply entry / create-account routes) — case-insensitive
  if (/\/apply\/applymanually/i.test(href) || /createaccount/i.test(href)) {
    return true;
  }

  // createAccountCheckbox — the standard Workday automation-id convention
  if (ynAdaFind(document_, '[data-automation-id="createAccountCheckbox"]')) {
    return true;
  }
  // signIn form host or password on a sign-in surface
  if (
    ynAdaFind(
      document_,
      '[data-automation-id="signInForm"], [data-automation-id="signIn"]',
    )
  ) {
    return true;
  }
  // loose form automation-id containing "signIn" / "createAccount"
  const forms = ynAdaFindAll(document_, "form[data-automation-id]");
  for (const f of forms) {
    const aid = f.getAttribute("data-automation-id") || "";
    if (/signin|createaccount/i.test(aid)) return true;
  }
  // "Create Account" submit / button chrome
  const clickables = ynAdaFindAll(
    document_,
    'button, input[type="submit"], input[type="button"], [role="button"]',
  );
  for (const el of clickables) {
    const t = [
      el.textContent,
      el.value,
      el.getAttribute && el.getAttribute("aria-label"),
      el.getAttribute && el.getAttribute("data-automation-id"),
    ]
      .filter(Boolean)
      .join(" ");
    if (/create\s+account/i.test(t)) return true;
  }
  // heading/text "Create Account" + password + verify/confirm password
  const passwords = ynAdaFindAll(document_, 'input[type="password"]');
  if (passwords.length >= 1) {
    let pageText = "";
    try {
      pageText = ((document_.body && document_.body.innerText) || "").slice(
        0,
        6000,
      );
    } catch {
      pageText = "";
    }
    if (/create\s+account/i.test(pageText)) {
      if (passwords.length >= 2) return true;
      for (const p of passwords) {
        const sig = [
          typeof ynAdaLabelOf === "function" ? ynAdaLabelOf(p, document_) : "",
          p.name || "",
          p.id || "",
          p.getAttribute("autocomplete") || "",
          p.getAttribute("aria-label") || "",
        ]
          .join(" ")
          .toLowerCase();
        if (
          /verify|confirm|re-?enter|re-?type|repeat|new.?password/i.test(sig)
        ) {
          return true;
        }
      }
    }
  }
  // defensive: password field + "create account" / "sign in" chrome without
  // the My Information name fields — treat as wall
  const pwd = passwords[0] || ynAdaFind(document_, 'input[type="password"]');
  if (pwd) {
    const hasLegalName =
      ynWdByAutomation(document_, "legalNameSection_firstName") ||
      ynWdByAutomation(document_, "legalNameSection_lastName");
    if (!hasLegalName) return true;
  }
  return false;
}

/**
 * Resume target: file-upload-input-ref, else a "select files" control.
 * // convention, re-verify on live
 */
export function ynWdResumeTarget(doc) {
  const byId = ynWdByAutomation(doc, "file-upload-input-ref");
  if (byId) return byId;
  // file input near automation upload chrome
  const fileInputs = ynAdaFindAll(doc, 'input[type="file"]');
  for (const f of fileInputs) {
    const aid = (f.getAttribute("data-automation-id") || "").toLowerCase();
    const near =
      (f.closest &&
        f.closest("[data-automation-id]") &&
        f.closest("[data-automation-id]").getAttribute("data-automation-id")) ||
      "";
    if (/file|upload|resume|cv/i.test(aid + " " + near)) return f;
  }
  if (fileInputs[0]) return fileInputs[0];
  // "Select files" button / drop host — engine drop path
  const selectFiles = ynAdaFindAll(doc, "button, [role='button'], a").find(
    (el) =>
      /select\s*files|upload\s*(resume|cv|file)/i.test(
        (el.textContent || "") + " " + (el.getAttribute("aria-label") || ""),
      ),
  );
  return selectFiles || null;
}

/**
 * Emit skip:"eeo" for Voluntary Disclosures / Self Identify convention hosts.
 * Workday groups these under data-automation-id containing Disclosure /
 * selfIdentification / veteran / disability. // convention, re-verify on live
 */
export function ynWdEeoSkipIntents(doc, claimed) {
  const intents = [];
  const all = ynAdaFindAll(doc, "[data-automation-id]");
  const roots = [];
  for (const el of all) {
    const aid = el.getAttribute("data-automation-id") || "";
    if (
      /disclosure|selfidentification|self.?identif|veteran|disability|eeo|gender|ethnicity|race|hispanic/i.test(
        aid,
      )
    ) {
      roots.push(el);
    }
  }
  const eeoSeen = new Set();
  for (const root of roots) {
    const fields =
      root.matches &&
      root.matches(
        "input, select, textarea, [role='combobox'], [role='listbox']",
      )
        ? [root]
        : [
            ...ynAdaFindAll(
              root,
              "input, select, textarea, [role='combobox'], [role='listbox'], [role='radio'], [role='checkbox']",
            ),
          ];
    // also claim the root if it is itself a control host
    if (
      root.matches &&
      !root.matches("input, select, textarea") &&
      fields.length === 0
    ) {
      // section container only — skip container, still scan children above
    }
    for (const el of fields) {
      if (!el || eeoSeen.has(el) || claimed.has(el) || ynAdaIsPassword(el))
        continue;
      const type = (el.type || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(type))
        continue;
      eeoSeen.add(el);
      claimed.add(el);
      const tag = (el.tagName || "").toUpperCase();
      intents.push({
        fieldKey: "eeo",
        el,
        value: null,
        kind:
          tag === "SELECT"
            ? "select"
            : tag === "TEXTAREA"
              ? "textarea"
              : el.getAttribute("role") === "combobox"
                ? "combobox"
                : "text",
        confidence: "exact",
        source: "adapter",
        skip: "eeo",
        label: ynAdaLabelOf(el, doc) || "EEO / disclosure field",
      });
    }
  }
  return intents;
}

/**
 * Kind for a control: combobox widgets use ynDriveCombobox.
 */
export function ynWdKindOf(el) {
  if (!el) return "text";
  const tag = (el.tagName || "").toUpperCase();
  const type = (el.type || "").toLowerCase();
  if (type === "file") return "file";
  if (tag === "TEXTAREA") return "textarea";
  if (tag === "SELECT") return "select";
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  const role = (el.getAttribute("role") || "").toLowerCase();
  if (
    role === "combobox" ||
    el.getAttribute("aria-haspopup") === "listbox" ||
    el.getAttribute("aria-autocomplete") === "list"
  ) {
    return "combobox";
  }
  // Workday prompt / button-dropdown convention
  if (
    role === "button" &&
    /prompt|dropdown|select/i.test(el.getAttribute("data-automation-id") || "")
  ) {
    return "combobox";
  }
  return "text";
}
