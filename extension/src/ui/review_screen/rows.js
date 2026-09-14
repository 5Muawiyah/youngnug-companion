// content/review_screen.js, part 1 of 2 — building the row list and each
// row's DOM. See index.js for the file's full banner (the on-page/chrome
// distinction the density scanner reads, and why).
//
// ynIsUsableLabel and ynReportableFieldLabel are NOT declared in this
// bundle — they are common/label_quality.js globals, injected into the
// page before this file and referenced here exactly as the original file
// referenced them: bare names resolved at runtime, unchanged by this split.

export const YN_REVIEW_ROW_LIMIT = 40; // a review, not a page dump

export function ynReviewTheme() {
  return typeof YN_THEME !== "undefined"
    ? YN_THEME
    : {
        primary: "#0b8160",
        primaryDeep: "#0a4c3a",
        primaryContrast: "#ffffff",
        accent: "#ff7a59",
        ink: "#12211b",
        warning: "#8a5a12",
        borderStrong: "#cbd8d0",
      };
}

// The three source icons a row can carry. Not shown to the reader as text —
// only via the returned label below — so these two-letter tags carry no
// separate chrome budget of their own.
export function ynReviewSourceKind(intent) {
  if (intent && intent.source === "cache") return "memory";
  return "profile";
}

export function ynReviewSourceLabel(kind) {
  if (kind === "memory") return "Remembered answer";
  if (kind === "draft") return "Drafted answer";
  return "Profile fact";
}

export function ynReviewDotLabel(row) {
  if (row.refused) return "Refused";
  if (row.kind === "draft") return "Drafted";
  return "Guessed";
}

// A row's proposed value — the student's own data, never chrome. Booleans
// and files render as a short, honest stand-in rather than "true"/"[object
// File]"; every branch here still reads as the field's OWN state, not
// interface prose about the screen.
export function ynReviewDisplayValue(intent) {
  if (!intent) return "";
  const v = intent.value;
  if (typeof v === "string") return v;
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (intent.kind === "file") return "File attached";
  return "";
}

/**
 * One row per guessed intent, one row per draft (accepted or refused).
 * Exact-confidence intents never reach this function — the caller has
 * already filtered them out.
 */
// The label a student reads on a row. An adapter intent can arrive carrying
// its own field key as the label ("contact.first_name" on Greenhouse, seen
// live 4 September) because the adapter's DOM lookup found nothing at plan
// time; the on-page report never shows that key (ynReportableFieldLabel),
// and neither may the row. Quality-gated given label first, then the
// element's own human label, then the given text, then the key as the last
// resort when there is no element to read.
// A field key masquerading as a label: one token, no spaces, joined with
// dots or underscores ("contact.first_name", "eeo_gender"). The shared
// quality gate lets such a token through, so the row checks it here.
export function ynReviewLooksLikeKey(text) {
  const t = String(text || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._\-\[\]]*$/.test(t) && /[._\[]/.test(t);
}

export function ynReviewRowLabel(intent) {
  const given = String(intent.label || intent.questionLabel || "").trim();
  const gate = typeof ynIsUsableLabel === "function" ? ynIsUsableLabel : (s) => !!s;
  if (given && gate(given) && !ynReviewLooksLikeKey(given)) return given;
  if (intent.el && typeof ynReportableFieldLabel === "function") {
    try {
      const human = ynReportableFieldLabel(intent.el, document, given, "");
      if (human && human !== "unlabelled field") return human;
    } catch {
      /* fall through */
    }
  }
  return given || intent.fieldKey;
}

export function ynReviewBuildRows(guessed, drafts, draftElByKey) {
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
      refused: false,
    });
    if (rows.length >= YN_REVIEW_ROW_LIMIT) return rows;
  }
  const elByKey = draftElByKey && draftElByKey.get ? draftElByKey : new Map();
  for (const d of drafts || []) {
    if (!d || !d.fieldKey) continue;
    const gi = elByKey.get(d.fieldKey);
    rows.push({
      kind: "draft",
      fieldKey: d.fieldKey,
      label: ynReviewRowLabel({ label: d.label, el: draftElByKey && draftElByKey.get ? (draftElByKey.get(d.fieldKey) || {}).el : null, fieldKey: d.fieldKey }),
      value: d.text || "",
      source: "draft",
      el: (gi && gi.el) || null,
      refused: d.verdict !== "clean",
    });
    if (rows.length >= YN_REVIEW_ROW_LIMIT) return rows;
  }
  return rows;
}

// Plain element factory: tag plus non-text attributes only (id, role,
// style, data-*, aria-modal, aria-labelledby, none of them reader-facing
// prose). Every chrome string a caller needs is set separately, right
// after, as a direct textContent assignment or setAttribute call naming
// aria-label. See the file banner above for why.
export function ynReviewMk(tag, attrs) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      if (k === "style") node.style.cssText = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
  }
  return node;
}

export function ynReviewIconBtnStyle(theme) {
  // A 26x26 glyph-only control's inline style: centred in both axes.
  const style = "display:inline-flex;align-items:center;justify-content:center;" +
    "width:26px;height:26px;margin-left:4px;border-radius:6px;border:1px solid " +
    theme.borderStrong +
    ";background:#fff;color:" +
    theme.ink +
    ";cursor:pointer;font:13px/1 system-ui,sans-serif;padding:0";
  return style;
}

export function ynReviewDotStyle(theme, kind) {
  const color = kind === "draft" ? theme.accent : theme.warning;
  return (
    "display:inline-block;width:8px;height:8px;border-radius:50%;" +
    "margin-right:6px;flex:0 0 auto;background:" +
    color
  );
}

export function ynReviewIconBtn(theme, action, ariaLabel, glyph) {
  const btn = ynReviewMk("button", {
    type: "button",
    "data-action": action,
    style: ynReviewIconBtnStyle(theme),
  });
  btn.setAttribute("aria-label", ariaLabel);
  btn.textContent = glyph;
  return btn;
}

/**
 * Build one row's DOM and wire its draft-only controls. `draftState` is the
 * shared per-draft decision map ({approved, text}); a guessed row never
 * touches it — it is folded into the single screen Approve with no control
 * of its own.
 */
export function ynReviewBuildRow(row, draftState, theme) {
  const wrap = ynReviewMk("div", {
    "data-yn-review-row": "1",
    "data-field-key": row.fieldKey,
    style:
      "display:flex;align-items:flex-start;padding:6px 0;border-top:1px solid " +
      theme.borderStrong,
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
    style: "font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap",
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
    "data-yn-review-value": "1",
  });
  valueLine.textContent = row.value;
  body.appendChild(valueLine);

  if (row.kind === "draft") {
    const editBox = ynReviewMk("textarea", {
      rows: "3",
      style:
        "display:none;width:100%;margin-top:4px;font:inherit;padding:4px;" +
        "border-radius:6px;border:1px solid " +
        theme.borderStrong,
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
