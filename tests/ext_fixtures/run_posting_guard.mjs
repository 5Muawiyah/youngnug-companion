/**
 * Node tests for the EMPLOYER posting path's guards and plan→execute drive:
 *   - ynSubmitGuard refuses every posting-terminal term (Post job / Publish /
 *     Confirm / Sponsor / Checkout / Pay) while mid-wizard Continue / Save
 *     and continue stays permitted;
 *   - ynIsPaymentField classifies card/expiry/CVV/IBAN/sort-code/billing and
 *     cc-* autocomplete fields, and ynExecuteIntents refuses to write them
 *     even when a mis-planned content intent points at one;
 *   - ynIsTermsCheckbox refuses terms/consent checkboxes (never ticked);
 *   - ynDetectEmployerPosting is URL-keyed to employers.indeed.com and the
 *     candidate detector never claims that surface;
 *   - the indeed_employer adapter's plan() maps a synthetic posting form,
 *     everything amber, and advance() is detect-only (never a terminal).
 *
 * Run: node tests/ext_fixtures/run_posting_guard.mjs
 * Exit 0 = all pass. Minimal DOM mock (no browser / no jsdom), in the style
 * of run_questions.mjs / run_impossibility.mjs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ENGINE_PATH = path.join(ROOT, "extension", "content", "engine.js");
const DETECT_PATH = path.join(ROOT, "extension", "content", "detect.js");
const ADAPTER_PATH = path.join(
  ROOT,
  "extension",
  "content",
  "adapters",
  "indeed_employer.js",
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const RECT = { width: 120, height: 24, top: 100, left: 100, right: 220, bottom: 124 };

/** Visible, guard-friendly element mock. */
function makeEl(tag, attrs = {}) {
  const el = {
    tagName: String(tag).toUpperCase(),
    type: attrs.type || (tag === "textarea" ? "textarea" : "text"),
    name: attrs.name || "",
    id: attrs.id || "",
    className: "",
    value: attrs.value != null ? attrs.value : "",
    checked: !!attrs.checked,
    disabled: false,
    readOnly: false,
    isConnected: true,
    labels: attrs.labels || null,
    options: null,
    form: null,
    parentElement: null,
    previousElementSibling: null,
    ownerDocument: null,
    textContent: attrs.textContent || "",
    _attrs: { ...(attrs.attrs || {}) },
    getAttribute(k) {
      return this._attrs[k] != null ? this._attrs[k] : null;
    },
    setAttribute(k, v) {
      this._attrs[k] = String(v);
    },
    getBoundingClientRect() {
      return RECT;
    },
    getClientRects() {
      return [RECT];
    },
    closest(sel) {
      if (String(sel) === "label" && this._parentLabel) return this._parentLabel;
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    dispatchEvent() {
      return true;
    },
    click() {},
  };
  return el;
}

function makeLabel(text, input) {
  const lab = { tagName: "LABEL", textContent: text, parentElement: null };
  if (input) input.labels = [lab];
  return lab;
}

function makeBtn(text, attrs = {}) {
  const b = makeEl("button", attrs);
  b.type = attrs.type || "button";
  b.textContent = text;
  return b;
}

/** Mock document: password query → [], field lists → fields, buttons →
 * buttons. querySelector serves ONLY the description convention selector so
 * the adapter's convention rung is exercised alongside the label fallback. */
function makeDoc(fields, buttons, byQuerySelector = {}) {
  return {
    body: { innerText: "", textContent: "" },
    documentElement: {},
    getElementById() {
      return null;
    },
    querySelector(sel) {
      const s = String(sel);
      for (const key of Object.keys(byQuerySelector)) {
        if (s.includes(key)) return byQuerySelector[key];
      }
      return null;
    },
    querySelectorAll(sel) {
      const s = String(sel);
      if (s.includes('type="password"')) return [];
      if (s.includes("button")) return buttons.slice();
      if (s.includes("input") || s.includes("textarea") || s.includes("select")) {
        return fields.slice();
      }
      return [];
    },
    createElement() {
      return { style: {}, setAttribute() {}, appendChild() {} };
    },
  };
}

function loadStack(doc, href) {
  const src =
    readFileSync(ENGINE_PATH, "utf8") +
    "\n" +
    readFileSync(DETECT_PATH, "utf8") +
    "\n" +
    readFileSync(ADAPTER_PATH, "utf8");
  const visibleStyle = {
    display: "block",
    visibility: "visible",
    opacity: "1",
    clip: "auto",
    clipPath: "none",
  };
  const sandbox = {
    console,
    document: doc,
    location: { href: href || "https://employers.indeed.com/jobs/create" },
    navigator: {},
    getComputedStyle() {
      return visibleStyle;
    },
    setTimeout,
    CSS: {
      escape(s) {
        return String(s).replace(/"/g, '\\"');
      },
    },
    // engine calls these bare at write time; they live in dom_fill_kit.js
    // in the browser — stubbed here so the drive stays a pure engine test.
    ynSetNativeValue(el, v) {
      const t = (el.type || "").toLowerCase();
      if (t === "checkbox" || t === "radio") el.checked = Boolean(v);
      else el.value = v == null ? "" : String(v);
    },
    ynHighlight() {},
    ynUpdateFillBadge() {},
    chrome: { runtime: { sendMessage() {}, lastError: null } },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "posting_stack.js" });
  return sandbox;
}

async function main() {
  const fails = [];

  // ── a bare context just for the guards/classifiers ──────────────────────
  const g = loadStack(makeDoc([], []));

  // --- 1. ynSubmitGuard: every posting terminal refused --------------------
  const refused = [
    "Post job",
    "Post Job",
    "Post the job",
    "Post this job",
    "Post your job",
    "Post a job",
    "Post my job",
    "Publish",
    "Publish listing",
    "Confirm",
    "Confirm and post",
    "Sponsor this job",
    "Sponsor",
    "Checkout",
    "Proceed to checkout",
    "Pay now",
    "Pay",
    // the original candidate terminals must survive
    "Submit",
    "Send application",
    "Apply now",
    "Finish",
    "Complete application",
  ];
  for (const text of refused) {
    try {
      assert(
        g.ynSubmitGuard(makeBtn(text)) === true,
        `guard must REFUSE "${text}"`,
      );
    } catch (e) {
      fails.push("guard-refuse: " + e.message);
    }
  }
  const permitted = ["Save and continue", "Continue", "Next", "Back"];
  for (const text of permitted) {
    try {
      assert(
        g.ynSubmitGuard(makeBtn(text)) === false,
        `guard must PERMIT mid-wizard "${text}"`,
      );
    } catch (e) {
      fails.push("guard-permit: " + e.message);
    }
  }
  try {
    const submitTyped = makeBtn("Continue", { type: "submit" });
    assert(
      g.ynSubmitGuard(submitTyped) === true,
      "type=submit refused whatever the text",
    );
  } catch (e) {
    fails.push("guard-type: " + e.message);
  }

  // --- 2. ynIsPaymentField classifier --------------------------------------
  const payYes = [
    makeEl("input", { attrs: { autocomplete: "cc-number" } }),
    makeEl("input", { attrs: { autocomplete: "cc-exp" } }),
    makeEl("input", { attrs: { autocomplete: "section-pay cc-csc" } }),
  ];
  for (const label of [
    "Card number",
    "Cardholder name",
    "Expiry date",
    "Expiration month",
    "CVV",
    "CVC",
    "Security code",
    "IBAN",
    "Sort code",
    "Account number",
    "Billing address",
    "Payment method",
  ]) {
    const el = makeEl("input");
    makeLabel(label, el);
    payYes.push(el);
  }
  payYes.push(makeEl("input", { name: "billing_postcode" }));
  for (const el of payYes) {
    try {
      assert(
        g.ynIsPaymentField(el, makeDoc([], [])) === true,
        `payment classifier must catch "${(el.labels && el.labels[0].textContent) || el.name || el._attrs.autocomplete}"`,
      );
    } catch (e) {
      fails.push("payment-yes: " + e.message);
    }
  }
  for (const label of ["Job title", "Location", "Application email", "Company name"]) {
    const el = makeEl("input");
    makeLabel(label, el);
    try {
      assert(
        g.ynIsPaymentField(el, makeDoc([], [])) === false,
        `payment classifier must NOT catch "${label}"`,
      );
    } catch (e) {
      fails.push("payment-no: " + e.message);
    }
  }

  // --- 3. ynIsTermsCheckbox -------------------------------------------------
  try {
    const terms = makeEl("input", { type: "checkbox" });
    makeLabel("I agree to the Indeed terms of service", terms);
    assert(g.ynIsTermsCheckbox(terms, makeDoc([], [])) === true, "terms checkbox caught");
    const authorise = makeEl("input", { type: "checkbox" });
    makeLabel("I authorise Indeed to contact applicants", authorise);
    assert(
      g.ynIsTermsCheckbox(authorise, makeDoc([], [])) === true,
      "authorise checkbox caught",
    );
    const plain = makeEl("input", { type: "checkbox" });
    makeLabel("This role can be remote", plain);
    assert(
      g.ynIsTermsCheckbox(plain, makeDoc([], [])) === false,
      "ordinary checkbox not a terms box",
    );
    const textField = makeEl("input");
    makeLabel("terms of employment", textField);
    assert(
      g.ynIsTermsCheckbox(textField, makeDoc([], [])) === false,
      "a text input is never a terms CHECKBOX",
    );
  } catch (e) {
    fails.push("terms: " + e.message);
  }

  // --- 4. detection: employer surface vs candidate detector ---------------
  try {
    const hit = g.ynDetectEmployerPosting(
      makeDoc([], []),
      "https://employers.indeed.com/jobs/create",
    );
    assert(hit && hit.id === "indeed_employer", "employers.indeed.com detected");
    assert(
      g.ynDetectEmployerPosting(makeDoc([], []), "https://uk.indeed.com/viewjob?jk=1") ===
        null,
      "candidate indeed page must NOT detect as employer posting",
    );
    const ats = g.ynDetectAts(makeDoc([], []), "https://employers.indeed.com/jobs/create");
    assert(
      ats && ats.id === "unknown",
      "the CANDIDATE detector must never claim the employer surface",
    );
  } catch (e) {
    fails.push("detect: " + e.message);
  }

  // --- 5. the synthetic posting form: plan → intents → engine --------------
  const title = makeEl("input", { name: "title_field" });
  makeLabel("Job title", title);
  const location = makeEl("input", { name: "loc_field" });
  makeLabel("Location", location);
  const desc = makeEl("textarea", { name: "jobDescription" });
  makeLabel("Job description", desc);
  const salaryMin = makeEl("input", { name: "sal_lo" });
  makeLabel("Minimum salary", salaryMin);
  const salaryMax = makeEl("input", { name: "sal_hi" });
  makeLabel("Maximum salary", salaryMax);
  const email = makeEl("input", { type: "email", name: "notify" });
  makeLabel("Application email", email);
  const card = makeEl("input", { name: "card_field" });
  makeLabel("Card number", card);
  const terms = makeEl("input", { type: "checkbox", name: "tos" });
  makeLabel("I agree to the Indeed terms of service", terms);
  const fields = [title, location, desc, salaryMin, salaryMax, email, card, terms];
  const postBtn = makeBtn("Post job");
  const contBtn = makeBtn("Save and continue");
  const doc = makeDoc(fields, [postBtn, contBtn], { jobDescription: desc });
  const s = loadStack(doc);

  const plan = {
    listing_id: 7,
    title: "Graduate Data Analyst",
    description: "A graduate analyst role.",
    location: "Leeds",
    salary_min: 28000,
    salary_max: 32000,
    level: "internship",
    application_email: "careers@northwind.example",
  };

  let intents = [];
  try {
    const adapter = s.YN_ADAPTERS.find((a) => a && a.id === "indeed_employer");
    assert(adapter, "indeed_employer adapter registered");
    intents = adapter.plan(plan, doc) || [];
    assert(
      intents.every((i) => i.confidence === "guessed"),
      "EVERY posting intent must be amber (selectors are unverified convention)",
    );
    assert(
      intents.some((i) => i.fieldKey === "posting.title" && i.el === title),
      "title planned via label fallback",
    );
    assert(
      intents.some((i) => i.fieldKey === "posting.description" && i.el === desc),
      "description planned via convention selector (textarea only)",
    );
    assert(
      intents.some((i) => i.fieldKey === "terms" && i.skip === "terms" && i.el === terms),
      "terms checkbox surfaced as skip:terms",
    );
    assert(
      intents.some(
        (i) => i.fieldKey === "payment" && i.skip === "payment" && i.el === card,
      ),
      "card field surfaced as skip:payment",
    );
    assert(
      !intents.some((i) => i.el === card && !i.skip),
      "the card field must never be planned as a content field",
    );
  } catch (e) {
    fails.push("plan: " + e.message);
  }

  try {
    const report = await s.ynExecuteIntents(intents, { plan });
    assert(title.value === "Graduate Data Analyst", "title written");
    assert(desc.value === "A graduate analyst role.", "description written");
    assert(location.value === "Leeds", "location written");
    assert(email.value === "careers@northwind.example", "email written");
    assert(card.value === "", "card field NEVER written");
    assert(terms.checked === false, "terms checkbox NEVER ticked");
    assert(
      (report.skipped_payment || []).length >= 1,
      "payment skip reported",
    );
    assert((report.skipped_terms || []).length >= 1, "terms skip reported");
    assert(
      (report.filled || []).length === 0,
      "nothing may report emerald 'filled' (all amber)",
    );
    assert(
      (report.guessed || []).some((e) => e.fieldKey === "posting.title"),
      "title lands in guessed (amber)",
    );
  } catch (e) {
    fails.push("execute: " + e.message);
  }

  // 5b. A MIS-PLANNED content intent aimed at the card field: the engine's
  // write-time classifier must refuse it (the belt under the adapter).
  try {
    card.value = "";
    const report = await s.ynExecuteIntents(
      [
        {
          fieldKey: "posting.title",
          el: card,
          value: "4111111111111111",
          kind: "text",
          confidence: "guessed",
          source: "test-misplan",
          label: "smuggled",
        },
      ],
      { plan },
    );
    assert(card.value === "", "mis-planned card write refused at the engine");
    assert(
      (report.skipped_payment || []).length === 1,
      "mis-plan surfaced as skipped_payment",
    );
  } catch (e) {
    fails.push("misplan: " + e.message);
  }

  // 5c. A crafted tick on the terms box without skip: refused by
  // ynIsTermsCheckbox at write time.
  try {
    const report = await s.ynExecuteIntents(
      [
        {
          fieldKey: "eligibility.tos",
          el: terms,
          value: true,
          kind: "checkbox",
          confidence: "guessed",
          source: "test-misplan",
          label: "smuggled tick",
        },
      ],
      { plan },
    );
    assert(terms.checked === false, "crafted terms tick refused at the engine");
    assert(
      (report.skipped_terms || []).length === 1,
      "crafted tick surfaced as skipped_terms",
    );
  } catch (e) {
    fails.push("terms-misplan: " + e.message);
  }

  // --- 6. advance is detect-only and never returns a terminal --------------
  try {
    const advance = s.ynIeAdvance(doc);
    assert(advance === contBtn, "advance returns the mid-wizard Continue");
    const onlyPost = makeDoc(fields, [postBtn]);
    assert(
      s.ynIeAdvance(onlyPost) === null,
      "with only 'Post job' present, advance must return null",
    );
    assert(s.ynSubmitGuard(postBtn) === true, "'Post job' is guard-refused");
  } catch (e) {
    fails.push("advance: " + e.message);
  }

  // --- 7. sponsorship budget field halts (detector) ------------------------
  try {
    const budget = makeEl("input", { name: "budget_daily" });
    makeLabel("Daily budget", budget);
    const budgetDoc = makeDoc([...fields, budget], [contBtn]);
    const found = s.ynIeSponsorshipField(budgetDoc);
    assert(found === budget, "sponsorship/budget field detected");
    assert(
      s.ynIeSponsorshipField(doc) === null,
      "no budget field on the plain posting form",
    );
  } catch (e) {
    fails.push("sponsorship: " + e.message);
  }

  if (fails.length) {
    for (const f of fails) console.error("FAIL: " + f);
    process.exit(1);
  }
  console.log(
    "posting guard PASS: terminals refused, payment/terms never written, " +
      "amber-only plan, detect-only advance, budget halt detector live",
  );
}

main().catch((e) => {
  console.error("FAIL (crash): " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
