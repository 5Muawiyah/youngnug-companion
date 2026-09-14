// content/adapters/dover.js — deterministic Dover (app.dover.com) fill
// intents. detect.js has no Dover URL rule yet (app.dover.com, path
// /apply/<company>/); until one is added this adapter registers under id
// "dover" and stays inert.
//
// CONFIRMED on a live page 2026-09-03, headless, no sign-in: Dover's own careers
// posting (https://app.dover.com/apply/Dover/<uuid>/, "Software Engineer"),
// reached from https://app.dover.com/jobs/dover. React app: ids are
// useId()-generated (":r3:" etc.) and NOT stable across page loads — every
// selector below is by name= only, which held across a reload. Confirmed:
// input[name=firstName], name=lastName, name=email, name=linkedinUrl,
// name=phoneNumber, a file input (resume) with no stable name attribute
// (React sets it via the Dropzone-style widget's own JS — left unclaimed,
// heuristics may still find it by nearby text), and custom screening
// questions as name=<per-question-uuid> radio/text groups — no stable
// platform-wide key, left to heuristics. No EEO/equality section was
// present on this posting. plan() returns FillIntents only. Never password,
// never submit.

function ynDoverPlan(plan, doc) {
  const document_ = doc || document;
  const intents = [];
  const c = (plan && plan.contact) || {};
  const links = (plan && plan.links) || {};
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

  if (ynAdaUsable(c.first_name)) {
    push(
      "contact.first_name",
      ynAdaFind(document_, 'input[name="firstName"]'),
      c.first_name,
      "text",
      "First name",
    );
  }
  if (ynAdaUsable(c.last_name)) {
    push(
      "contact.last_name",
      ynAdaFind(document_, 'input[name="lastName"]'),
      c.last_name,
      "text",
      "Last name",
    );
  }
  if (ynAdaUsable(c.email)) {
    push(
      "contact.email",
      ynAdaFind(document_, 'input[name="email"]'),
      c.email,
      "text",
      "Email",
    );
  }
  if (ynAdaUsable(c.phone)) {
    push(
      "contact.phone",
      ynAdaFind(document_, 'input[name="phoneNumber"]'),
      c.phone,
      "text",
      "Phone",
    );
  }
  if (ynAdaUsable(links.linkedin)) {
    push(
      "links.linkedin",
      ynAdaFind(document_, 'input[name="linkedinUrl"]'),
      links.linkedin,
      "text",
      "LinkedIn",
    );
  }

  // Resume upload: no stable name= observed on this walk (Dropzone-style
  // widget assigns one only after a file is chosen) — left unclaimed rather
  // than guessed; heuristics/label text still has a chance at it.

  return intents;
}

globalThis.YN_ADAPTERS =
  typeof globalThis.YN_ADAPTERS !== "undefined" ? globalThis.YN_ADAPTERS : [];
YN_ADAPTERS.push({
  id: "dover",
  plan: ynDoverPlan,
});

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynDoverPlan = ynDoverPlan;
