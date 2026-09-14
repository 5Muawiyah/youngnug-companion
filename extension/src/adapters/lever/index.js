// content/adapters/lever.js — deterministic Lever (jobs.lever.co) fill intents.
// Selectors verified against the SSR /apply form (name= attrs).
// Full-name is a SINGLE field (name="name") — that is why this adapter exists.
// plan() returns FillIntents only. Never EEO, never password, never submit.

function ynLvFullName(plan) {
  const c = (plan && plan.contact) || {};
  const joined = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return joined || c.full_name || c.name || "";
}

/**
 * Lever plan() — claims research-verified name= / data-qa fields on /apply.
 * Custom cards[<uuid>] screening questions left unclaimed (no guess).
 * Cover-letter/comments textarea is NOT in the verified inventory for the
 * researched Palantir form — heuristics may still match a label if present.
 */
function ynLeverPlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const c = (plan && plan.contact) || {};
  const links = (plan && plan.links) || {};
  const work0 = (plan && plan.work && plan.work[0]) || {};
  const addr = (plan && plan.address) || {};
  const claimed = new Set();

  const push = (fieldKey, el, value, kind, label) => {
    if (!el || claimed.has(el) || ynAdaIsPassword(el)) return;
    if (value == null || value === "") return;
    if (typeof value === "string" && /\[CONFIRM/i.test(value)) return;
    claimed.add(el);
    intents.push({
      fieldKey,
      el,
      value,
      kind: kind || "text",
      confidence: "exact",
      source: "adapter",
      label: label || ynAdaLabelOf(el, document_) || fieldKey,
    });
  };

  // Full name — single field name="name" / data-qa="name-input" (verified).
  const fullName = ynLvFullName(plan);
  if (ynAdaUsable(fullName)) {
    push(
      "contact.full_name",
      ynAdaFind(document_, 'input[name="name"], input[data-qa="name-input"]'),
      fullName,
      "text",
      "Full name",
    );
  }

  if (ynAdaUsable(c.email)) {
    push(
      "contact.email",
      ynAdaFind(document_, 'input[name="email"], input[data-qa="email-input"]'),
      c.email,
      "text",
      "Email",
    );
  }

  if (ynAdaUsable(c.phone)) {
    push(
      "contact.phone",
      ynAdaFind(document_, 'input[name="phone"], input[data-qa="phone-input"]'),
      c.phone,
      "text",
      "Phone",
    );
  }

  // Location is a plain text input (verified) + hidden selectedLocation.
  const locVal =
    [addr.city, addr.country].filter(Boolean).join(", ") ||
    addr.city ||
    addr.line1 ||
    "";
  if (ynAdaUsable(locVal)) {
    push(
      "address.city",
      ynAdaFind(
        document_,
        'input[name="location"], #location-input, input[data-qa="location-input"]',
      ),
      locVal,
      "text",
      "Location",
    );
  }

  // Current company — name="org" (verified).
  if (ynAdaUsable(work0.employer)) {
    push(
      "work.0.employer",
      ynAdaFind(document_, 'input[name="org"], input[data-qa="org-input"]'),
      work0.employer,
      "text",
      "Current company",
    );
  }

  // Links — bracket notation urls[LinkedIn] / urls[GitHub] / urls[Portfolio].
  if (ynAdaUsable(links.linkedin)) {
    push(
      "links.linkedin",
      ynAdaFind(document_, 'input[name="urls[LinkedIn]"]'),
      links.linkedin,
      "text",
      "LinkedIn",
    );
  }
  if (ynAdaUsable(links.github)) {
    push(
      "links.github",
      ynAdaFind(document_, 'input[name="urls[GitHub]"]'),
      links.github,
      "text",
      "GitHub",
    );
  }
  if (ynAdaUsable(links.portfolio)) {
    push(
      "links.portfolio",
      ynAdaFind(document_, 'input[name="urls[Portfolio]"]'),
      links.portfolio,
      "text",
      "Portfolio",
    );
  }

  // Resume — id="resume-upload-input" name="resume" (verified).
  if (plan && plan.cv_url) {
    push(
      "cv_file",
      ynAdaFind(
        document_,
        '#resume-upload-input, input[name="resume"][type="file"], input[data-qa="input-resume"]',
      ),
      { file: "cv" },
      "file",
      "Resume",
    );
  }

  // EEO section — data-qa="eeo-section" + name="eeo[...]" (verified). Never fill.
  const eeoFields = ynAdaFindAll(
    document_,
    '[data-qa="eeo-section"] input, [data-qa="eeo-section"] select, [data-qa="eeo-section"] textarea, [name^="eeo["]',
  );
  const eeoSeen = new Set();
  for (const el of eeoFields) {
    if (!el || eeoSeen.has(el) || claimed.has(el) || ynAdaIsPassword(el))
      continue;
    const type = (el.type || "").toLowerCase();
    if (["hidden", "submit", "button", "image", "reset"].includes(type))
      continue;
    // h-captcha-response is not EEO — skip non-eeo names that might leak in
    if (
      el.name &&
      !/^eeo\[/i.test(el.name) &&
      !el.closest('[data-qa="eeo-section"]')
    )
      continue;
    eeoSeen.add(el);
    claimed.add(el);
    const tag = (el.tagName || "").toUpperCase();
    intents.push({
      fieldKey: "eeo",
      el,
      value: null,
      kind:
        tag === "SELECT" ? "select" : tag === "TEXTAREA" ? "textarea" : "text",
      confidence: "exact",
      source: "adapter",
      skip: "eeo",
      label: ynAdaLabelOf(el, document_) || el.name || "EEO field",
    });
  }

  return intents;
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "lever",
  plan: ynLeverPlan,
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynLvFullName = ynLvFullName;
globalThis.ynLeverPlan = ynLeverPlan;
