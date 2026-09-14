// popup.js — the Undo button (reverts only what the Companion itself wrote,
// on this tab) and "Save to YoungNug" (reads factual answers off
// the page, shows exactly what would be saved, stores only on explicit OK).
import { el, activeTab } from "./status.js";
import { YN_FILL_SCRIPTS } from "./fill_report.js";

// Undo: reverts only what the Companion itself wrote on THIS
// tab — never a value the student typed. window.ynUndoFill
// lives in the click-time stack (content/dom_fill_kit.js);
// this button injects the SAME stack the Fill buttons use (a no-op when it
// is already present, so a prior fill's write history survives) and calls
// it if it exists. Nothing to revert and the function not yet loaded read
// the same to the student: nothing to undo.
el("undo").addEventListener("click", async () => {
  const status = el("status");
  const tab = await activeTab();
  if (!tab?.id) {
    status.textContent = "No active tab.";
    return;
  }
  try {
    await ynInjectOnce(tab.id, YN_FILL_SCRIPTS, "ynFillApplication", true);
  } catch (e) {
    console.warn("[YoungNug] undo injection refused:", e);
    status.textContent = "Chrome will not let extensions script this page.";
    return;
  }
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => (typeof ynUndoFill === "function" ? ynUndoFill() : null),
    });
  } catch (e) {
    console.warn("[YoungNug] undo execute refused:", e);
    status.textContent = "Could not run on this page. Try again.";
    return;
  }
  const out = (results || [])
    .map((r) => r && r.result)
    .find((r) => r && typeof r === "object");
  const n = out && typeof out.reverted === "number" ? out.reverted : 0;
  status.textContent = n
    ? `Undid ${n} field${n === 1 ? "" : "s"}.`
    : "Nothing to undo.";
});

// "Save to YoungNug" (answers half). Reads the factual answers the user
// typed/picked on this form (content-side, read-only), shows EXACTLY what
// would be saved, and stores only on the explicit OK.
el("save-answers").addEventListener("click", async () => {
  const status = el("status");
  const tab = await activeTab();
  if (!tab?.id) {
    status.textContent = "No active tab.";
    return;
  }
  status.textContent = "Reading your answers on this page…";
  let read;
  try {
    await ynInjectOnce(tab.id, YN_FILL_SCRIPTS, "ynFillApplication", true);
    // allFrames, matching the Apply path: on an iframe-embedded board the
    // top frame holds no form, so a top-only read reported "no answers to
    // save" on exactly the pages the user had just filled.
    const reads = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => ynCollectUserAnswers(),
    });
    read = (reads || [])
      .map((r) => r && r.result)
      .filter((r) => Array.isArray(r) && r.length)
      .sort((a, b) => b.length - a.length)[0];
    read = { result: read || [] };
  } catch (e) {
    console.warn("[YoungNug] answers read refused:", e);
    status.textContent =
      "Chrome will not let extensions read this page. Its own pages, the " +
      "Web Store and PDFs are off limits.";
    return;
  }
  const items = (read && read.result) || [];
  if (!items.length) {
    status.textContent =
      "No recognised answers on this page to save (only factual questions " +
      "like notice period, salary, right to work are reusable).";
    return;
  }
  const lines = items
    .map(
      (i) =>
        `• ${i.label}: ${i.value === true ? "Yes" : i.value === false ? "No" : i.value}`,
    )
    .join("\n");
  const consentOk = confirm(
    "Save these answers to your YoungNug profile so future forms can reuse " +
      "them?\n\n" +
      lines +
      "\n\nOnly the items above are updated. Nothing else changes.",
  );
  if (!consentOk) return;
  const r = await chrome.runtime.sendMessage({ type: "SAVE_ANSWERS", items });
  if (r?.ok) {
    const n = r.saved.length;
    const part = (r.failed || []).length
      ? ` ${r.failed.length} section(s) did not save. Try again.`
      : "";
    status.textContent =
      `Saved ${n} answer${n === 1 ? "" : "s"} to your profile.` + part;
  } else {
    status.textContent = `Could not save: ${r?.error || "no response"}`;
  }
});
