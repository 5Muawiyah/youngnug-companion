// content/engine.js, part 7 of 9 — the kind-specific field writer: text,
// select, date, split date-parts, ARIA choice, combobox, checkbox/radio,
// file, plain contenteditable, and skills, plus the shared tail (queue for
// batched after-write verification, or push straight to the report) and the
// per-intent error catch. Extracted from the single-file version's inline
// processOne() closure, called by execute_intents.js's stall-detector loop
// once per intent — the kind switch, the verify-batch queueing and the
// catch are unchanged, only re-homed into a function that takes what used
// to be closure variables (report, context, pendingVerify,
// YN_VERIFY_BATCH_KINDS) as explicit parameters. ynSetNativeValue,
// ynTypeValuePerChar, ynStashForUndo, ynDriveCombobox,
// ynAttachFileWithConfirm, ynWriteContentEditablePlain, ynFillSkills and
// ynHighlight are content/dom_fill_kit.js / content/heuristics.js /
// content/skills_fill.js globals, referenced here as bare names exactly as
// the single-file version did. See index.js for the file's full history.
import { ynEngineIntentPrecheck } from "./process_intent_precheck.js";
import { ynReportEntry, ynToIsoDate } from "./report_helpers.js";
import { ynAdaIsPassword, ynEnginePause } from "./honeypot.js";
import { ynSubmitGuard } from "./guards.js";

export async function ynEngineProcessIntent(
  intent,
  report,
  context,
  pendingVerify,
  YN_VERIFY_BATCH_KINDS,
) {
  try {
    if (ynEngineIntentPrecheck(intent, report)) return;
    const el = intent.el;
    const kind = intent.kind || "text";
  let ok = false;
  // may be forced to "guessed" for unconfirmed file attaches — avoids
  // falsely reporting "exact"
  let reportConfidence = intent.confidence || "guessed";
  let verifyExpected; // set only for kinds in YN_VERIFY_BATCH_KINDS

  if (kind === "text" || kind === "textarea") {
    const priorVal = el.value;
    ynSetNativeValue(el, intent.value);
    const want = String(intent.value ?? "");
    ok = String(el.value || "") === want;
    if (!ok) {
      // Second pass: only after this immediate readback
      // failed, never as the default path, never on a password kind —
      // ynTypeValuePerChar itself also refuses password inputs.
      const isPassword =
        typeof ynAdaIsPassword === "function" && ynAdaIsPassword(el);
      if (!isPassword && typeof ynTypeValuePerChar === "function") {
        await ynTypeValuePerChar(el, want);
        ok = String(el.value || "") === want;
      }
    }
    if (!ok) {
      // Equivalent-after-reformat: a phone mask turning
      // "07700900123" into "07700 900123" is the SAME answer, not a
      // miss — squash both sides to the characters that carry meaning.
      const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (squash(el.value) && squash(el.value) === squash(want)) ok = true;
    }
    if (ok && typeof ynStashForUndo === "function") {
      ynStashForUndo({ el, kind: "text", prior: priorVal });
    }
  } else if (kind === "select") {
    // try matching option by value or visible text
    const want = String(intent.value ?? "");
    const opts = [...(el.options || [])];
    let matched = opts.find((o) => o.value === want);
    if (!matched) {
      matched = opts.find(
        (o) =>
          (o.textContent || "").trim().toLowerCase() ===
          want.trim().toLowerCase(),
      );
    }
    if (!matched && want.trim()) {
      // The substring tier must refuse ambiguity — several
      // options containing the value is a coin-flip, and a wrong pick is
      // worse than a clear miss (mirrors ynBestOptionMatch's combobox
      // refusal). Exactly one partial hit fills; more report and fail.
      const partial = opts.filter((o) =>
        (o.textContent || "")
          .trim()
          .toLowerCase()
          .includes(want.trim().toLowerCase()),
      );
      if (partial.length === 1) {
        matched = partial[0];
      } else if (partial.length > 1) {
        report.errors.push({
          fieldKey: intent.fieldKey,
          label: `ambiguous select: ${partial.length} options match "${want.slice(0, 40)}"`,
        });
      }
    }
    if (matched) {
      const priorVal = el.value;
      ynSetNativeValue(el, matched.value);
      ok = el.value === matched.value;
      if (ok && typeof ynStashForUndo === "function") {
        ynStashForUndo({ el, kind: "select", prior: priorVal });
      }
      verifyExpected = matched.value;
    } else {
      ok = false;
    }
  } else if (kind === "date") {
    // input[type=date] accepts ONLY yyyy-mm-dd; anything else
    // is silently rejected by the browser. Normalise, or fail outright
    // ("Immediately" is not a date and must not pretend to fill).
    const iso = ynToIsoDate(intent.value);
    if (iso) {
      const priorVal = el.value;
      ynSetNativeValue(el, iso);
      ok = String(el.value || "") === iso;
      if (ok && typeof ynStashForUndo === "function") {
        ynStashForUndo({ el, kind: "text", prior: priorVal });
      }
    } else {
      ok = false;
    }
  } else if (kind === "date_parts") {
    // Split Day/Month/Year text inputs filled as ONE intent,
    // zero-padded. All three readbacks must stick or the fill is a miss.
    const iso = ynToIsoDate(intent.value);
    const parts = intent.els || {};
    if (iso && parts.day && parts.month && parts.year) {
      const [yr, mon, day] = iso.split("-");
      const priorDay = parts.day.value;
      const priorMonth = parts.month.value;
      const priorYear = parts.year.value;
      ynSetNativeValue(parts.day, day);
      ynSetNativeValue(parts.month, mon);
      ynSetNativeValue(parts.year, yr);
      ok =
        String(parts.day.value || "") === day &&
        String(parts.month.value || "") === mon &&
        String(parts.year.value || "") === yr;
      if (ok && typeof ynStashForUndo === "function") {
        ynStashForUndo({ el: parts.day, kind: "text", prior: priorDay });
        ynStashForUndo({ el: parts.month, kind: "text", prior: priorMonth });
        ynStashForUndo({ el: parts.year, kind: "text", prior: priorYear });
      }
    } else {
      ok = false;
    }
  } else if (kind === "aria_choice") {
    // Google-Forms-style div[role=radio|checkbox] — state lives
    // ONLY in aria-checked (never .checked). Idempotent: already-checked
    // → user_kept, never re-clicked. The click below is safe by element
    // ROLE — a radio/checkbox can only toggle a choice, exactly like the
    // native checkbox/radio branch — and ynSubmitGuard still vetoes any
    // submit-shaped node before it. Drive-and-verify: aria-checked must
    // flip to "true" or the fill counts as a miss.
    const checkedNow =
      el.getAttribute && el.getAttribute("aria-checked") === "true";
    if (checkedNow) {
      report.user_kept.push(ynReportEntry(intent));
      return;
    }
    if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) {
      ok = false;
    } else {
      el.click();
      await ynEnginePause(120);
      ok = el.getAttribute("aria-checked") === "true";
      if (ok && typeof ynStashForUndo === "function") {
        ynStashForUndo({ el, kind: "aria_choice", prior: false });
      }
    }
  } else if (kind === "combobox") {
    const r = await ynDriveCombobox(el, intent.value);
    ok = Boolean(r && r.ok);
    if (r && r.error) {
      report.errors.push({
        fieldKey: intent.fieldKey,
        label: String(r.error),
      });
    }
    if (ok) {
      verifyExpected = intent.value;
      if (typeof ynStashForUndo === "function") {
        const prior = "value" in el ? el.value : el.textContent || "";
        ynStashForUndo({ el, kind: "combobox", prior });
      }
    }
  } else if (kind === "checkbox" || kind === "radio") {
    const want = Boolean(intent.value);
    if (el.checked === want) {
      report.user_kept.push(ynReportEntry(intent));
      return;
    }
    const priorChecked = el.checked;
    ynSetNativeValue(el, want);
    ok = el.checked === want;
    if (ok) {
      verifyExpected = want;
      if (typeof ynStashForUndo === "function") {
        ynStashForUndo({ el, kind: "checkbox", prior: priorChecked });
      }
    }
  } else if (kind === "file") {
    let fileSpec = intent.value;
    // File-ref from plan: {file:"cv"|"letter"} → FETCH_FILE via worker
    if (
      fileSpec &&
      typeof fileSpec === "object" &&
      (fileSpec.file === "cv" || fileSpec.file === "letter")
    ) {
      const plan = context.plan || {};
      const path = fileSpec.file === "cv" ? plan.cv_url : plan.letter_url;
      if (!path) {
        report.unresolved.push(ynReportEntry(intent, "no file url"));
        ynHighlight(el, "missed");
        return;
      }
      const r = await new Promise((res) =>
        chrome.runtime.sendMessage({ type: "FETCH_FILE", path }, res),
      );
      if (!r?.ok) {
        report.errors.push({
          fieldKey: intent.fieldKey,
          label: r?.error || "FETCH_FILE failed",
        });
        report.unresolved.push(ynReportEntry(intent));
        ynHighlight(el, "missed");
        return;
      }
      fileSpec = {
        name: fileSpec.file === "cv" ? "cv.pdf" : "cover-letter.pdf",
        dataUrl: r.dataUrl,
        type: r.contentType || "application/pdf",
      };
    }
    // File path: adapter may set uploadMode / dropTarget / confirmSelector
    // (Greenhouse). Never mark emerald "filled" without visible confirm.
    const attach = await ynAttachFileWithConfirm(el, fileSpec, intent);
    if (attach.confirmed) {
      ok = true;
    } else if (attach.attached) {
      // Avoid a false-green attach — mark it amber "check this" instead
      ok = true;
      reportConfidence = "guessed";
    } else {
      ok = false;
    }
    if (ok) {
      verifyExpected = true;
      if (typeof ynStashForUndo === "function") {
        ynStashForUndo({ el, kind: "file", prior: null });
      }
    }
  } else if (kind === "contenteditable_plain") {
    // Plain-text contenteditable — a framework rich-text
    // editor (Quill/Draft/ProseMirror/TinyMCE) is refused by
    // ynIsPlainContentEditable itself and reported as a miss here, same
    // as any other write ynExecuteIntents could not make.
    const prior = el.textContent || "";
    if (typeof ynWriteContentEditablePlain === "function") {
      ok = ynWriteContentEditablePlain(el, intent.value);
      if (ok && typeof ynStashForUndo === "function") {
        ynStashForUndo({ el, kind: "contenteditable", prior });
      }
    } else {
      ok = false;
    }
  } else if (kind === "skills") {
    // Skills / multi-value tag fill. Consumes plan.skills
    // when the caller's plan carries it; absence is "no skills to fill",
    // never an error — the fill-plan field is supplied by the server.
    const skills =
      context.plan && Array.isArray(context.plan.skills)
        ? context.plan.skills
        : [];
    if (!skills.length) {
      report.unresolved.push(ynReportEntry(intent, "no skills in profile"));
      return;
    }
    if (typeof ynFillSkills !== "function") {
      ok = false;
    } else {
      const r = await ynFillSkills(el, skills);
      for (const skipped of r.skipped) {
        report.unresolved.push(
          ynReportEntry(intent, `skill not offered: ${skipped}`),
        );
      }
      if (r.filled.length) {
        ynHighlight(el, "filled");
        report.filled.push(
          ynReportEntry(intent, `${r.filled.length} skill(s) tagged`),
        );
      }
    }
    return;
  } else {
    report.errors.push({
      fieldKey: intent.fieldKey,
      label: `unknown kind: ${kind}`,
    });
    report.unresolved.push(ynReportEntry(intent));
    return;
  }

  if (ok && YN_VERIFY_BATCH_KINDS.has(kind)) {
    pendingVerify.push({ el, kind, expected: verifyExpected, intent, reportConfidence });
    return;
  }

  if (ok) {
    if (reportConfidence === "exact") {
      ynHighlight(el, "filled");
      report.filled.push(ynReportEntry(intent));
    } else {
      ynHighlight(el, "check");
      report.guessed.push(ynReportEntry(intent));
    }
  } else {
    ynHighlight(el, "missed");
    report.unresolved.push(ynReportEntry(intent));
  }
  } catch (e) {
  report.errors.push({
    fieldKey: intent.fieldKey || "",
    label: String(e && e.message ? e.message : e),
  });
  report.unresolved.push(ynReportEntry(intent));
  if (intent.el) ynHighlight(intent.el, "missed");
  }
}
