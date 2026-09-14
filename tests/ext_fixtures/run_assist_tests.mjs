/**
 * Node property + structural tests for assist.js
 * (policy parser, generator 200× per fixture, no global insert, egress surface).
 *
 * Run: node tests/ext_fixtures/run_assist_tests.mjs
 * Exit 0 = all pass. No browser required for parser/generator; panel structure
 * is checked via a minimal document mock.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ASSIST_PATH = path.join(ROOT, "extension", "content", "assist.js");
// The generic password kit loads before assist.js, exactly as
// the manifest orders the content scripts.
const PW_KIT_PATH = path.join(
  ROOT,
  "extension",
  "content",
  "password_kit.js",
);

// Verbatim policy strings copied from real signup-wall password requirement lists.
const POLICY_FIXTURES = {
  lloyds: `Password Requirements:
An alphabetic character
A special character
A numeric character
A lowercase character
An uppercase character
A minimum of 8 characters`,
  gsk: `Note: Create account using the email address used for your job application.

Password Requirements:
A lowercase character
A special character
An uppercase character
An alphabetic character
A numeric character
A minimum of 12 characters`,
  astrazeneca: `Welcome to your candidate home account. Please fill in the details below to create your account and
access your candidate dashboard. A verification email will be sent once you create your account.

Password Requirements:
A special character
A lowercase character
A numeric character
An uppercase character
An alphabetic character
A minimum of 8 characters`,
};

function loadAssist() {
  const src =
    readFileSync(PW_KIT_PATH, "utf8") + "\n" + readFileSync(ASSIST_PATH, "utf8");
  const sandbox = {
    console,
    crypto: {
      getRandomValues: (arr) => crypto.webcrypto.getRandomValues(arr),
    },
    // Minimal stubs so assist.js does not throw at load
    document: {
      getElementById: () => null,
      createElement: () => ({
        style: {},
        classList: { add() {}, remove() {} },
        appendChild() {},
        addEventListener() {},
        textContent: "",
      }),
      documentElement: { appendChild() {} },
      querySelectorAll: () => [],
      body: { innerText: "" },
    },
    window: {},
    navigator: {},
    Event: class Event {
      constructor(type) {
        this.type = type;
        this.bubbles = true;
      }
    },
    HTMLInputElement: { prototype: {} },
    globalThis: {},
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "assist.js" });
  return sandbox;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function main() {
  const fails = [];
  const g = loadAssist();

  // --- exports present, insert NOT global ---------------------------------
  try {
    assert(typeof g.ynParsePasswordPolicy === "function", "ynParsePasswordPolicy missing");
    assert(typeof g.ynGeneratePassword === "function", "ynGeneratePassword missing");
    assert(typeof g.ynPasswordSatisfiesPolicy === "function", "ynPasswordSatisfiesPolicy missing");
    assert(typeof g.ynWallAssistState === "function", "ynWallAssistState missing");
    assert(typeof g.ynWallAssistPanel === "function", "ynWallAssistPanel missing");
    // No global insert / fill-password helper plan/execute could call
    const banned = [
      "ynAssistInsertPassword",
      "ynInsertPassword",
      "ynAssistWritePassword",
      "ynFillPassword",
      "insertPassword",
    ];
    for (const name of banned) {
      assert(typeof g[name] === "undefined", `global ${name} must not exist`);
    }
  } catch (e) {
    fails.push("exports: " + e.message);
  }

  // --- parse each research fixture ----------------------------------------
  const expected = {
    lloyds: { min: 8 },
    gsk: { min: 12 },
    astrazeneca: { min: 8 },
  };
  for (const [name, text] of Object.entries(POLICY_FIXTURES)) {
    try {
      const p = g.ynParsePasswordPolicy(text, null);
      assert(p.parsed === true, `${name}: expected parsed=true`);
      assert(p.minLength === expected[name].min, `${name}: minLength want ${expected[name].min} got ${p.minLength}`);
      assert(p.requireUpper === true, `${name}: requireUpper`);
      assert(p.requireLower === true, `${name}: requireLower`);
      assert(p.requireDigit === true, `${name}: requireDigit`);
      assert(p.requireSymbol === true, `${name}: requireSymbol`);
      assert(p.requireAlpha === true, `${name}: requireAlpha`);
    } catch (e) {
      fails.push(`parse ${name}: ${e.message}`);
    }
  }

  // Unparseable → safe default, parsed flag set to false
  try {
    const p = g.ynParsePasswordPolicy("Welcome to our careers site.", null);
    assert(p.parsed === false, "unparseable should be parsed=false");
    assert(p.minLength >= 16, "default minLength >= 16");
    assert(p.requireUpper && p.requireLower && p.requireDigit && p.requireSymbol);
  } catch (e) {
    fails.push("default policy: " + e.message);
  }

  // minlength attribute
  try {
    const fakeField = {
      getAttribute(name) {
        if (name === "minlength") return "14";
        if (name === "maxlength") return "32";
        return null;
      },
    };
    const p = g.ynParsePasswordPolicy("", fakeField);
    assert(p.parsed === true, "attrs should parse");
    assert(p.minLength === 14, "minlength attr");
    assert(p.maxLength === 32, "maxlength attr");
  } catch (e) {
    fails.push("attrs: " + e.message);
  }

  // --- property test: 200 generations per policy fixture ------------------
  for (const [name, text] of Object.entries(POLICY_FIXTURES)) {
    try {
      const p = g.ynParsePasswordPolicy(text, null);
      for (let i = 0; i < 200; i++) {
        const pw = g.ynGeneratePassword(p);
        if (!g.ynPasswordSatisfiesPolicy(pw, p)) {
          throw new Error(
            `gen #${i} failed policy (len=${pw.length})`,
          );
        }
        // Never log the password value into the fail message beyond length.
        if (pw.length < p.minLength) {
          throw new Error(`gen #${i} shorter than min`);
        }
      }
    } catch (e) {
      fails.push(`property ${name}: ${e.message}`);
    }
  }

  // Default policy 200 gens
  try {
    const p = g.ynParsePasswordPolicy("", null);
    for (let i = 0; i < 200; i++) {
      const pw = g.ynGeneratePassword(p);
      if (!g.ynPasswordSatisfiesPolicy(pw, p)) {
        throw new Error(`default gen #${i} failed`);
      }
    }
  } catch (e) {
    fails.push("property default: " + e.message);
  }

  // --- source-level insert path (assist.js text) --------------------------
  try {
    const src = readFileSync(ASSIST_PATH, "utf8");
    // Insert only via the panel button handler; no function ynXInsert exported
    assert(
      !/function\s+yn\w*Insert\w*\s*\(/.test(src),
      "must not define a global yn*Insert* function",
    );
    assert(
      src.includes("event.isTrusted") || src.includes("!event.isTrusted"),
      "insert path must check event.isTrusted",
    );
    assert(
      src.includes("Insert into the password field"),
      "panel must offer the insert button",
    );
    assert(
      src.includes("Save this in your password manager before you continue."),
      "vault-decision nudge line required",
    );
    assert(
      src.includes("This site needs an account. Here is the fastest safe way:"),
      "headline copy required",
    );
    // No em-dashes in user-visible strings (product standing rule)
    // Allow em-dash only in comments — check string literals roughly
    const stringLits = src.match(/"[^"\\]*(?:\\.[^"\\]*)*"/g) || [];
    const bad = stringLits.filter((s) => s.includes("\u2014") || s.includes("—"));
    assert(bad.length === 0, "user-visible strings must not contain em-dashes: " + bad.slice(0, 3));
  } catch (e) {
    fails.push("source insert: " + e.message);
  }

  // --- egress surface in assist.js ----------------------------------------
  try {
    const src = readFileSync(ASSIST_PATH, "utf8");
    // Must not call ynApi / fetch / chrome.storage for the generated value path.
    // Comments mentioning them for documentation are OK; executable calls are not.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    assert(!/\bynApi\b/.test(stripped), "assist.js must not reference ynApi");
    assert(!/\bfetch\s*\(/.test(stripped), "assist.js must not call fetch(");
    assert(
      !/chrome\.storage/.test(stripped),
      "assist.js must not use chrome.storage",
    );
    // console.log of the generated value: ban any console.log in assist.js
    assert(
      !/console\.(log|debug|info|warn|error)\s*\(/.test(stripped),
      "assist.js must not console.log (password egress risk)",
    );
  } catch (e) {
    fails.push("egress: " + e.message);
  }

  if (fails.length) {
    console.error("assist tests FAILED:");
    for (const f of fails) console.error("  -", f);
    process.exit(1);
  }
  console.log(
    "assist tests PASS: parse×3, property 200×4 policies, exports, egress, insert-not-global",
  );
}

main();
