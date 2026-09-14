// content/review_screen.js, part 2 of 2 — the auto-decision test hook and
// ynShowReviewScreen itself, the one entry point content/filler.js calls.
// See index.js for the file's full banner.
import { ynReviewBuildRows, ynReviewMk, ynReviewIconBtn, ynReviewTheme, ynReviewBuildRow } from "./rows.js";

/**
 * Real content-script world never defines window.__ynReviewScript — a host
 * page cannot reach an isolated world's globals, so a real fill always
 * waits for a genuine click below. Only the test harnesses (jsdom's vm
 * context, Playwright's page.add_init_script) set this, exactly the way
 * they already fake chrome.runtime.sendMessage for a fixture with no real
 * worker behind it.
 *
 * Drafts default to EXCLUDED unless a script action names them — the same
 * caution the interactive panel applies (a draft needs its own tick before
 * the screen Approve will write it); guessed fields default to INCLUDED,
 * matching every fill before the review screen existed.
 */
export function ynReviewAutoDecision(rows) {
  if (typeof window === "undefined" || !Array.isArray(window.__ynReviewScript)) {
    return null;
  }
  const script = window.__ynReviewScript;
  if (script.some((a) => a && a.type === "cancel")) {
    return { approved: false };
  }
  const skipped = new Set();
  const edits = {};
  for (const row of rows) {
    if (row.kind === "draft" && !row.refused) skipped.add(row.fieldKey);
  }
  for (const action of script) {
    if (!action || !action.fieldKey) continue;
    if (action.type === "skip") skipped.add(action.fieldKey);
    else if (action.type === "approve_draft") skipped.delete(action.fieldKey);
    else if (action.type === "edit") {
      skipped.delete(action.fieldKey);
      edits[action.fieldKey] = action.text;
    }
  }
  return { approved: true, skippedFieldKeys: [...skipped], edits };
}

/**
 * @param {{guessed: object[], drafts: object[], draftElByKey: Map, ats: object}} opts
 * @returns {Promise<{approved:boolean, skippedFieldKeys?:string[], edits?:object}>}
 */
export function ynShowReviewScreen(opts) {
  const guessed = (opts && opts.guessed) || [];
  const drafts = (opts && opts.drafts) || [];
  const draftElByKey = (opts && opts.draftElByKey) || new Map();
  const rows = ynReviewBuildRows(guessed, drafts, draftElByKey);
  if (typeof window !== "undefined") {
    window.__ynReviewScreenCalls = (window.__ynReviewScreenCalls || 0) + 1;
  }

  const theme = ynReviewTheme();
  const draftState = new Map();
  for (const row of rows) {
    if (row.kind === "draft" && !row.refused) {
      draftState.set(row.fieldKey, { approved: false, text: row.value });
    }
  }

  const existing = document.getElementById("yn-review-screen");
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  const root = ynReviewMk("div", {
    id: "yn-review-screen",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "yn-review-heading",
    style:
      "position:fixed;top:16px;right:16px;z-index:2147483647;width:320px;" +
      "max-height:80vh;overflow:auto;background:#fff;color:" +
      theme.ink +
      ";border:1px solid " +
      theme.borderStrong +
      ";border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.28);" +
      "font:13px/1.45 system-ui,sans-serif;padding:12px",
  });

  const heading = ynReviewMk("h2", {
    id: "yn-review-heading",
    style: "font-size:14px;margin:0 0 4px;font-weight:700",
  });
  heading.textContent = "Check before filling";
  root.appendChild(heading);

  const hint = ynReviewMk("p", { style: "margin:0 0 10px;opacity:.7" });
  hint.textContent = "Nothing is written until you approve.";
  root.appendChild(hint);

  const list = ynReviewMk("div", { id: "yn-review-rows" });
  for (const row of rows) list.appendChild(ynReviewBuildRow(row, draftState, theme));
  root.appendChild(list);

  const actions = ynReviewMk("div", {
    style: "display:flex;justify-content:flex-end;gap:8px;margin-top:10px",
  });
  const cancelBtn = ynReviewIconBtn(theme, "cancel", "Cancel, write nothing", "✕");
  cancelBtn.id = "yn-review-cancel";
  const approveBtn = ynReviewIconBtn(theme, "approve-all", "Approve and fill", "✓");
  approveBtn.id = "yn-review-approve";
  approveBtn.style.cssText += ";background:" + theme.primary + ";color:" + theme.primaryContrast +
    ";border-color:" + theme.primaryDeep;
  actions.appendChild(cancelBtn);
  actions.appendChild(approveBtn);
  root.appendChild(actions);

  (document.body || document.documentElement).appendChild(root);

  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      for (const row of rows) {
        if (row.el && typeof ynClearElementHighlight === "function") {
          ynClearElementHighlight(row.el);
        }
      }
      if (root.parentNode) root.parentNode.removeChild(root);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const auto = ynReviewAutoDecision(rows);
    if (auto) {
      finish(auto);
      return;
    }

    approveBtn.addEventListener("click", () => {
      const skippedFieldKeys = [];
      const edits = {};
      for (const [fieldKey, st] of draftState) {
        if (!st.approved) skippedFieldKeys.push(fieldKey);
        else edits[fieldKey] = st.text;
      }
      finish({ approved: true, skippedFieldKeys, edits });
    });
    cancelBtn.addEventListener("click", () => finish({ approved: false }));
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") finish({ approved: false });
    });
    if (typeof approveBtn.focus === "function") {
      try {
        approveBtn.focus();
      } catch {
        /* focus is best-effort in a headless harness */
      }
    }
  });
}
