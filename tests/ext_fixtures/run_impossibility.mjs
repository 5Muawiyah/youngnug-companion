/**
 * Impossibility pin — the fill engine cannot write passwords even when
 * an assist-shaped intent (kind: "password" or type=password element) is
 * injected into ynExecuteIntents. ynAdaIsPassword is the guard; assist.js is
 * deliberately NOT loaded so this proves the engine alone refuses the write.
 *
 * Run: node tests/ext_fixtures/run_impossibility.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ENGINE_PATH = path.join(ROOT, "extension", "content", "engine.js");
// The generic dom-fill kit loads before the safety core,
// exactly as the manifest orders the content scripts.
const KIT_PATH = path.join(ROOT, "extension", "content", "dom_fill_kit.js");

function makeEl(type, extras = {}) {
  // Mocks must read as VISIBLE, or ynIsHoneypot classifies them hidden and
  // the refusal flows through the honeypot rung instead of the
  // ynAdaIsPassword rung this pin exists to prove.
  const rect = { width: 120, height: 24, top: 100, left: 100, right: 220, bottom: 124 };
  const el = {
    type,
    tagName: type === "textarea" ? "TEXTAREA" : "INPUT",
    value: "",
    checked: false,
    isConnected: true,
    disabled: false,
    name: extras.name || "",
    id: extras.id || "",
    classList: {
      _set: new Set(),
      add(c) {
        this._set.add(c);
      },
      remove(c) {
        this._set.delete(c);
      },
    },
    style: {},
    labels: null,
    options: null,
    form: extras.form || null,
    parentElement: extras.parent || null,
    offsetWidth: rect.width,
    offsetHeight: rect.height,
    getClientRects() {
      return [rect];
    },
    getBoundingClientRect() {
      return rect;
    },
    closest(sel) {
      if (/form/i.test(String(sel)) && extras.form) return extras.form;
      return null;
    },
    getAttribute(n) {
      if (n === "aria-label") return extras.ariaLabel || null;
      if (n === "data-automation-id") return extras.automationId || null;
      if (n === "aria-hidden") return null;
      return extras[n] || null;
    },
    hasAttribute(n) {
      return this.getAttribute(n) != null;
    },
    dispatchEvent() {
      return true;
    },
    click() {},
  };
  return el;
}

function makeContainer(id) {
  return {
    tagName: "FORM",
    id,
    isConnected: true,
    parentElement: null,
    children: [],
    getAttribute() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
  };
}

function loadEngine(passwordEl, emailEl) {
  const src =
    readFileSync(KIT_PATH, "utf8") + "\n" + readFileSync(ENGINE_PATH, "utf8");

  // Minimal document: NOT an account-creation page (no Create Account heading)
  // so the page-level wall does not short-circuit — we want the per-field
  // ynAdaIsPassword path to be the one that refuses.
  const allEls = [emailEl, passwordEl];
  const document = {
    documentElement: { appendChild() {} },
    head: { appendChild() {} },
    body: {
      textContent: "Application form",
      appendChild() {},
    },
    getElementById(id) {
      if (id === "yn-fill-styles") return { id };
      if (id === "yn-fill-badge") return null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel.includes("password")) return [passwordEl];
      if (sel.includes("input")) return allEls;
      if (sel.includes("h1") || sel.includes("heading")) return [];
      if (sel.includes("button")) return [];
      return [];
    },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        id: "",
        style: {},
        className: "",
        textContent: "",
        setAttribute() {},
        appendChild() {},
      };
    },
  };

  const location = { href: "https://example.test/apply/form" };

  // Native value descriptor so ynSetNativeValue works if it reaches a write
  const inputProto = {
    value: {
      get() {
        return this._v || "";
      },
      set(v) {
        this._v = v == null ? "" : String(v);
      },
    },
  };
  Object.defineProperty(passwordEl, "value", {
    get() {
      return this._v || "";
    },
    set(v) {
      this._v = v == null ? "" : String(v);
    },
    configurable: true,
  });
  Object.defineProperty(emailEl, "value", {
    get() {
      return this._v || "";
    },
    set(v) {
      this._v = v == null ? "" : String(v);
    },
    configurable: true,
  });

  const visibleStyle = {
    display: "block",
    visibility: "visible",
    opacity: "1",
    clip: "auto",
    clipPath: "none",
    position: "static",
    left: "auto",
    top: "auto",
  };
  const sandbox = {
    console,
    document,
    location,
    window: {},
    navigator: {},
    // Without getComputedStyle the honeypot check's catch
    // branch marks every mock hidden and the wrong rung refuses.
    getComputedStyle() {
      return visibleStyle;
    },
    chrome: {
      runtime: {
        sendMessage() {},
        lastError: null,
      },
    },
    Event: class Event {
      constructor(type, init) {
        this.type = type;
        this.bubbles = !!(init && init.bubbles);
      }
    },
    HTMLInputElement: { prototype: {} },
    HTMLTextAreaElement: { prototype: {} },
    HTMLSelectElement: { prototype: {} },
    CSS: { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&") },
    Set,
    Map,
    Promise,
    Array,
    String,
    Boolean,
    Object,
    Math,
    JSON,
    parseInt,
    isNaN,
    undefined,
  };
  // Wire value descriptor on the prototype so ynSetNativeValue's
  // getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") works.
  Object.defineProperty(sandbox.HTMLInputElement.prototype, "value", {
    set(v) {
      this._v = v == null ? "" : String(v);
    },
    get() {
      return this._v || "";
    },
    configurable: true,
  });

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  // ynQueryDeep optional — engine falls back to querySelectorAll
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "engine.js" });
  return sandbox;
}

async function main() {
  // Separate parent forms: the email lives OUTSIDE the password's tier-1
  // scope, so the password-scope wall cannot be the thing refusing it and the
  // positive control below is meaningful.
  const formA = makeContainer("login-form");
  const formB = makeContainer("guest-form");
  const passwordEl = makeEl("password", {
    name: "password",
    id: "pw",
    automationId: "password",
    form: formA,
    parent: formA,
  });
  const emailEl = makeEl("text", {
    name: "email",
    id: "em",
    automationId: "email",
    form: formB,
    parent: formB,
  });
  formA.children = [passwordEl];
  formB.children = [emailEl];
  passwordEl._v = "";
  emailEl._v = "";

  const g = loadEngine(passwordEl, emailEl);

  if (typeof g.ynAdaIsPassword !== "function") {
    console.error("FAIL: ynAdaIsPassword missing after load");
    process.exit(1);
  }
  if (!g.ynAdaIsPassword(passwordEl)) {
    console.error("FAIL: ynAdaIsPassword(passwordEl) should be true");
    process.exit(1);
  }
  if (g.ynAdaIsPassword(emailEl)) {
    console.error("FAIL: ynAdaIsPassword(emailEl) should be false");
    process.exit(1);
  }

  if (typeof g.ynExecuteIntents !== "function") {
    console.error("FAIL: ynExecuteIntents missing");
    process.exit(1);
  }

  // Assist-shaped intents an attacker might inject into the fill path
  const intents = [
    {
      fieldKey: "password",
      el: passwordEl,
      value: "SmuggledSecret1!",
      kind: "password", // non-standard kind
      confidence: "exact",
      source: "assist-smuggle",
      label: "Password",
    },
    {
      fieldKey: "password",
      el: passwordEl,
      value: "SmuggledSecret1!",
      kind: "text", // even as text, type=password must refuse
      confidence: "exact",
      source: "assist-smuggle-text",
      label: "Password",
    },
  ];

  const report = await g.ynExecuteIntents(intents, { plan: {}, ats: {}, jobId: 1 });

  if (passwordEl.value !== "" && passwordEl._v !== "" && passwordEl._v != null) {
    // value getter may use _v
    const v = passwordEl.value || passwordEl._v || "";
    if (v !== "") {
      console.error(
        "FAIL: password field was written by ynExecuteIntents (value length " +
          v.length +
          ") — ynAdaIsPassword did not refuse",
      );
      process.exit(1);
    }
  }

  // Also ensure filled/guessed did not claim the password
  const claimed = [...(report.filled || []), ...(report.guessed || [])];
  if (claimed.some((e) => e && e.fieldKey === "password")) {
    console.error("FAIL: report claimed password was filled/guessed");
    process.exit(1);
  }

  // The refusal must NOT have come from the honeypot rung
  // (visible mocks). An entry in skipped_honeypot means the mock read as
  // hidden and this pin proved the wrong guard.
  if ((report.skipped_honeypot || []).length) {
    console.error(
      "FAIL: password refusal flowed through the HONEYPOT rung, not " +
        "ynAdaIsPassword — mock visibility broke; fix the mocks",
    );
    process.exit(1);
  }

  // Positive control, ASSERTED: a normal text field in a
  // DIFFERENT form gets written — proving execute genuinely runs and the
  // password refusal above is the ynAdaIsPassword rung doing its job.
  emailEl._v = "";
  const emailIntents = [
    {
      fieldKey: "contact.email",
      el: emailEl,
      value: "ada@example.com",
      kind: "text",
      confidence: "exact",
      source: "test",
      label: "Email",
    },
  ];
  const emailReport = await g.ynExecuteIntents(emailIntents, {
    plan: {},
    ats: {},
    jobId: 1,
  });
  const emailClaimed = [
    ...(emailReport.filled || []),
    ...(emailReport.guessed || []),
  ].some((e) => e && e.fieldKey === "contact.email");
  if (emailEl.value !== "ada@example.com" || !emailClaimed) {
    console.error(
      "FAIL: positive control did not fill (email value=" +
        JSON.stringify(emailEl.value) +
        ", claimed=" +
        emailClaimed +
        ") — execute is not demonstrably live, the password refusal is unproven",
    );
    process.exit(1);
  }

  console.log(
    "impossibility PASS: password refused via ynAdaIsPassword " +
      "(honeypot rung silent), positive control filled",
  );
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
