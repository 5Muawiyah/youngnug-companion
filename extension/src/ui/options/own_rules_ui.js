// options.js, part 2 — the student's OWN per-site rules (adblock-filter
// style), edited in one textarea. Parsing/validation/matching live in
// common/own_rules.js (loaded before this file — see options.html and
// popup.html's own script order); this module is only the TEXTAREA <-> storage <-> server
// wiring and the line-numbered error display. See MESSAGE_CONTRACT.md's Own
// rules table for the syntax itself.

/** Render the parse errors as one line per bad line, "line N: message" —
 * never a bare count, so the student can find the exact line to fix. Empty
 * (no errors) hides the whole surface, matching the page's own warnings
 * convention: a box that is usually empty is a box people stop reading. */
function ynRenderOwnRuleErrors(errors) {
  const box = document.getElementById("own-rules-errors");
  if (!box) return;
  const list = Array.isArray(errors) ? errors : [];
  if (!list.length) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.textContent = list.map((e) => `Line ${e.line}: ${e.message}`).join(" · ");
  box.hidden = false;
}

/** Validate the textarea's CURRENT text without saving — called on every
 * keystroke's debounce point (blur, and before Save) so an error is caught
 * before it is stored, not after. Returns the parsed, VALID rules only;
 * an invalid line is reported and dropped, never silently kept. */
function ynValidateOwnRulesField() {
  const field = document.getElementById("own-rules-text");
  if (!field || typeof ynParseOwnRules !== "function") return [];
  const { rules, errors } = ynParseOwnRules(field.value);
  ynRenderOwnRuleErrors(errors);
  return rules;
}

/** Load the LOCAL copy into the textarea. When local storage has never
 * been written (a fresh install, or a second browser signing in for the
 * first time) and the account has server-held rules, adopt them once —
 * "a second browser gets them on sync" without a two-way merge this file
 * has no way to arbitrate. An install with its own rules already keeps
 * them: the local copy is always what the student sees and edits. */
async function ynLoadOwnRules() {
  const field = document.getElementById("own-rules-text");
  if (!field || typeof YN_OWN_RULES_KEY === "undefined") return;
  const got = await chrome.storage.local.get({ [YN_OWN_RULES_KEY]: "" });
  let text = got[YN_OWN_RULES_KEY] || "";
  if (!text) {
    try {
      const server = await ynApi("/api/extension/settings");
      const body = await server.json();
      if (typeof body.own_rules === "string" && body.own_rules.trim()) {
        text = body.own_rules;
        await chrome.storage.local.set({ [YN_OWN_RULES_KEY]: text });
      }
    } catch {
      /* offline, or no server copy yet — the field simply starts empty */
    }
  }
  field.value = text;
  ynValidateOwnRulesField();
}

/** Save: local storage first (works offline, exactly like every other
 * setting on this page), THEN best-effort mirror to the account so a
 * second browser can adopt it. A mirror failure never blocks the local
 * save — the rules still work in THIS browser, which is what "own rules"
 * promises even offline. */
async function ynSaveOwnRules() {
  const field = document.getElementById("own-rules-text");
  if (!field || typeof YN_OWN_RULES_KEY === "undefined") return;
  const rules = ynValidateOwnRulesField();
  const text =
    typeof ynSerializeOwnRules === "function"
      ? ynSerializeOwnRules(rules)
      : field.value;
  await chrome.storage.local.set({ [YN_OWN_RULES_KEY]: text });
  try {
    // daily_cap is required on this route and lives entirely in Settings
    // now — this page has no field for it, so a read-modify-write
    // carries the account's CURRENT cap through unchanged rather than
    // guessing or overwriting it.
    const current = await (await ynApi("/api/extension/settings")).json();
    await ynApi("/api/extension/settings", {
      method: "PUT",
      body: JSON.stringify({
        daily_cap: current.daily_cap,
        own_rules: text,
      }),
    });
  } catch {
    /* server mirror failed — the local copy still saved and still works */
  }
}

/** Export: a plain-text download of exactly what Save would store — the
 * VALID, re-serialised rules, not the raw (possibly still-broken) textarea
 * content, so an exported file is always something Import can read back
 * clean. */
function ynExportOwnRules() {
  const rules = ynValidateOwnRulesField();
  const text =
    typeof ynSerializeOwnRules === "function"
      ? ynSerializeOwnRules(rules)
      : "";
  const blob = new Blob([text + "\n"], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "youngnug-own-rules.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Import: read a chosen .txt file's content into the textarea and
 * validate it immediately — replaces the textarea, never appends (an
 * append could silently duplicate or shadow an existing rule for the same
 * site, and the student can always paste alongside instead if that is
 * what they want). Nothing is saved until Save is pressed. */
function ynImportOwnRules(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const field = document.getElementById("own-rules-text");
    if (field) {
      field.value = String(reader.result || "");
      ynValidateOwnRulesField();
    }
  };
  reader.readAsText(file);
}

function setupOwnRulesSection() {
  const field = document.getElementById("own-rules-text");
  if (!field) return;
  field.addEventListener("blur", ynValidateOwnRulesField);
  const importBtn = document.getElementById("own-rules-import");
  const fileInput = document.getElementById("own-rules-file");
  if (importBtn && fileInput) {
    importBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      ynImportOwnRules(fileInput.files && fileInput.files[0]);
      fileInput.value = "";
    });
  }
  const exportBtn = document.getElementById("own-rules-export");
  if (exportBtn) exportBtn.addEventListener("click", ynExportOwnRules);
  void ynLoadOwnRules();
}

export {
  ynRenderOwnRuleErrors,
  ynValidateOwnRulesField,
  ynLoadOwnRules,
  ynSaveOwnRules,
  ynExportOwnRules,
  ynImportOwnRules,
  setupOwnRulesSection,
};
