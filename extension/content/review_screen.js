(() => {
  // extension/src/ui/review_screen/rows.js
  var YN_REVIEW_ROW_LIMIT = 40;
  function ynReviewTheme() {
    return typeof YN_THEME !== "undefined" ? YN_THEME : {
      primary: "#0b8160",
      primaryDeep: "#0a4c3a",
      primaryContrast: "#ffffff",
      accent: "#ff7a59",
      ink: "#12211b",
      warning: "#8a5a12",
      borderStrong: "#cbd8d0"
    };
  }
  function ynReviewSourceKind(intent) {
    if (intent && intent.source === "cache") return "memory";
    return "profile";
  }
  function ynReviewSourceLabel(kind) {
    if (kind === "memory") return "Remembered answer";
    if (kind === "draft") return "Drafted answer";
    return "Profile fact";
  }
  function ynReviewDotLabel(row) {
    if (row.refused) return "Refused";
    if (row.kind === "draft") return "Drafted";
    return "Guessed";
  }
  function ynReviewDisplayValue(intent) {
    if (!intent) return "";
    const v = intent.value;
    if (typeof v === "string") return v;
    if (v === true) return "Yes";
    if (v === false) return "No";
    if (intent.kind === "file") return "File attached";
    return "";
  }
  function ynReviewLooksLikeKey(text) {
    const t = String(text || "").trim();
    return /^[A-Za-z0-9][A-Za-z0-9._\-\[\]]*$/.test(t) && /[._\[]/.test(t);
  }
  function ynReviewRowLabel(intent) {
    const given = String(intent.label || intent.questionLabel || "").trim();
    const gate = typeof ynIsUsableLabel === "function" ? ynIsUsableLabel : (s) => !!s;
    if (given && gate(given) && !ynReviewLooksLikeKey(given)) return given;
    if (intent.el && typeof ynReportableFieldLabel === "function") {
      try {
        const human = ynReportableFieldLabel(intent.el, document, given, "");
        if (human && human !== "unlabelled field") return human;
      } catch {
      }
    }
    return given || intent.fieldKey;
  }
  function ynReviewBuildRows(guessed, drafts, draftElByKey) {
    const rows = [];
    for (const intent of guessed || []) {
      if (!intent || !intent.fieldKey) continue;
      rows.push({
        kind: "guessed",
        fieldKey: intent.fieldKey,
        label: ynReviewRowLabel(intent),
        value: ynReviewDisplayValue(intent),
        source: ynReviewSourceKind(intent),
        el: intent.el || null,
        refused: false
      });
      if (rows.length >= YN_REVIEW_ROW_LIMIT) return rows;
    }
    const elByKey = draftElByKey && draftElByKey.get ? draftElByKey : /* @__PURE__ */ new Map();
    for (const d of drafts || []) {
      if (!d || !d.fieldKey) continue;
      const gi = elByKey.get(d.fieldKey);
      rows.push({
        kind: "draft",
        fieldKey: d.fieldKey,
        label: ynReviewRowLabel({ label: d.label, el: draftElByKey && draftElByKey.get ? (draftElByKey.get(d.fieldKey) || {}).el : null, fieldKey: d.fieldKey }),
        value: d.text || "",
        source: "draft",
        el: gi && gi.el || null,
        refused: d.verdict !== "clean"
      });
      if (rows.length >= YN_REVIEW_ROW_LIMIT) return rows;
    }
    return rows;
  }
  function ynReviewMk(tag, attrs) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === "style") node.style.cssText = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    return node;
  }
  function ynReviewIconBtnStyle(theme) {
    const style = "display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;margin-left:4px;border-radius:6px;border:1px solid " + theme.borderStrong + ";background:#fff;color:" + theme.ink + ";cursor:pointer;font:13px/1 system-ui,sans-serif;padding:0";
    return style;
  }
  function ynReviewDotStyle(theme, kind) {
    const color = kind === "draft" ? theme.accent : theme.warning;
    return "display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;flex:0 0 auto;background:" + color;
  }
  function ynReviewIconBtn(theme, action, ariaLabel, glyph) {
    const btn = ynReviewMk("button", {
      type: "button",
      "data-action": action,
      style: ynReviewIconBtnStyle(theme)
    });
    btn.setAttribute("aria-label", ariaLabel);
    btn.textContent = glyph;
    return btn;
  }
  function ynReviewBuildRow(row, draftState, theme) {
    const wrap = ynReviewMk("div", {
      "data-yn-review-row": "1",
      "data-field-key": row.fieldKey,
      style: "display:flex;align-items:flex-start;padding:6px 0;border-top:1px solid " + theme.borderStrong
    });
    if (row.el) {
      wrap.addEventListener("mouseenter", () => {
        if (typeof ynHighlight === "function") ynHighlight(row.el, "check");
      });
      wrap.addEventListener("mouseleave", () => {
        if (typeof ynClearElementHighlight === "function") {
          ynClearElementHighlight(row.el);
        }
      });
    }
    const dot = ynReviewMk("span", { style: ynReviewDotStyle(theme, row.kind) });
    dot.setAttribute("aria-label", ynReviewDotLabel(row));
    wrap.appendChild(dot);
    const body = ynReviewMk("div", { style: "flex:1 1 auto;min-width:0" });
    const labelLine = ynReviewMk("div", {
      style: "font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
    });
    const sourceTag = ynReviewMk("span", { style: "opacity:.6;margin-right:4px;font-weight:400" });
    sourceTag.setAttribute("aria-label", ynReviewSourceLabel(row.source));
    labelLine.appendChild(sourceTag);
    labelLine.appendChild(document.createTextNode(row.label));
    body.appendChild(labelLine);
    if (row.refused) {
      const refusalLine = ynReviewMk("div", { style: "color:" + theme.warning + ";" });
      const refusalIcon = ynReviewMk("span", { "aria-hidden": "true" });
      refusalIcon.textContent = "✕";
      refusalLine.appendChild(refusalIcon);
      const refusalText = ynReviewMk("span", {});
      refusalText.textContent = " Refused, write it yourself.";
      refusalLine.appendChild(refusalText);
      body.appendChild(refusalLine);
      wrap.appendChild(body);
      return wrap;
    }
    const valueLine = ynReviewMk("div", {
      style: "color:" + theme.ink + ";opacity:.85;overflow:hidden;text-overflow:ellipsis",
      "data-yn-review-value": "1"
    });
    valueLine.textContent = row.value;
    body.appendChild(valueLine);
    if (row.kind === "draft") {
      const editBox = ynReviewMk("textarea", {
        rows: "3",
        style: "display:none;width:100%;margin-top:4px;font:inherit;padding:4px;border-radius:6px;border:1px solid " + theme.borderStrong
      });
      editBox.value = row.value;
      body.appendChild(editBox);
      const setState = (approved) => {
        const st = draftState.get(row.fieldKey);
        if (!st) return;
        st.approved = approved;
        wrap.style.opacity = approved === false ? "0.55" : "1";
        valueLine.style.textDecoration = approved === false ? "line-through" : "none";
      };
      const approveBtn = ynReviewIconBtn(theme, "approve", "Keep this answer", "✓");
      approveBtn.addEventListener("click", () => setState(true));
      const editBtn = ynReviewIconBtn(theme, "edit", "Edit this answer", "✎");
      editBtn.addEventListener("click", () => {
        editBox.style.display = editBox.style.display === "none" ? "block" : "none";
        if (editBox.style.display === "block") editBox.focus();
      });
      editBox.addEventListener("input", () => {
        const st = draftState.get(row.fieldKey);
        if (st) st.text = editBox.value;
        setState(true);
      });
      const skipBtn = ynReviewIconBtn(theme, "skip", "Skip this answer", "✕");
      skipBtn.addEventListener("click", () => setState(false));
      const controls = ynReviewMk("div", { style: "margin-top:4px" });
      controls.appendChild(approveBtn);
      controls.appendChild(editBtn);
      controls.appendChild(skipBtn);
      body.appendChild(controls);
    }
    wrap.appendChild(body);
    return wrap;
  }

  // extension/src/ui/review_screen/screen.js
  function ynReviewAutoDecision(rows) {
    if (typeof window === "undefined" || !Array.isArray(window.__ynReviewScript)) {
      return null;
    }
    const script = window.__ynReviewScript;
    if (script.some((a) => a && a.type === "cancel")) {
      return { approved: false };
    }
    const skipped = /* @__PURE__ */ new Set();
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
  function ynShowReviewScreen(opts) {
    const guessed = opts && opts.guessed || [];
    const drafts = opts && opts.drafts || [];
    const draftElByKey = opts && opts.draftElByKey || /* @__PURE__ */ new Map();
    const rows = ynReviewBuildRows(guessed, drafts, draftElByKey);
    if (typeof window !== "undefined") {
      window.__ynReviewScreenCalls = (window.__ynReviewScreenCalls || 0) + 1;
    }
    const theme = ynReviewTheme();
    const draftState = /* @__PURE__ */ new Map();
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
      style: "position:fixed;top:16px;right:16px;z-index:2147483647;width:320px;max-height:80vh;overflow:auto;background:#fff;color:" + theme.ink + ";border:1px solid " + theme.borderStrong + ";border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.28);font:13px/1.45 system-ui,sans-serif;padding:12px"
    });
    const heading = ynReviewMk("h2", {
      id: "yn-review-heading",
      style: "font-size:14px;margin:0 0 4px;font-weight:700"
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
      style: "display:flex;justify-content:flex-end;gap:8px;margin-top:10px"
    });
    const cancelBtn = ynReviewIconBtn(theme, "cancel", "Cancel, write nothing", "✕");
    cancelBtn.id = "yn-review-cancel";
    const approveBtn = ynReviewIconBtn(theme, "approve-all", "Approve and fill", "✓");
    approveBtn.id = "yn-review-approve";
    approveBtn.style.cssText += ";background:" + theme.primary + ";color:" + theme.primaryContrast + ";border-color:" + theme.primaryDeep;
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
        }
      }
    });
  }

  // extension/src/ui/review_screen/index.js
  globalThis.YN_REVIEW_ROW_LIMIT = YN_REVIEW_ROW_LIMIT;
  globalThis.ynReviewTheme = ynReviewTheme;
  globalThis.ynReviewSourceKind = ynReviewSourceKind;
  globalThis.ynReviewSourceLabel = ynReviewSourceLabel;
  globalThis.ynReviewDotLabel = ynReviewDotLabel;
  globalThis.ynReviewDisplayValue = ynReviewDisplayValue;
  globalThis.ynReviewLooksLikeKey = ynReviewLooksLikeKey;
  globalThis.ynReviewRowLabel = ynReviewRowLabel;
  globalThis.ynReviewBuildRows = ynReviewBuildRows;
  globalThis.ynReviewMk = ynReviewMk;
  globalThis.ynReviewIconBtnStyle = ynReviewIconBtnStyle;
  globalThis.ynReviewDotStyle = ynReviewDotStyle;
  globalThis.ynReviewIconBtn = ynReviewIconBtn;
  globalThis.ynReviewBuildRow = ynReviewBuildRow;
  globalThis.ynReviewAutoDecision = ynReviewAutoDecision;
  globalThis.ynShowReviewScreen = ynShowReviewScreen;
})();
