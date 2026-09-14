// content/engine.js, part 8 of 9 — ynExecuteIntents itself: sets up the
// report shape, refuses to write anything on a full-page account-creation
// wall, runs every intent through ynEngineProcessIntent (part 7) under a
// wall-clock stall cap, batches the after-write verification for kinds a
// framework can silently revert, scans for site-rendered validation errors
// near a touched field, updates the fill badge, and computes the coverage
// metric. Unchanged from the single-file version except that the inline
// processOne() closure is now the imported ynEngineProcessIntent, called
// with the state it used to close over passed explicitly. See index.js for
// the file's full history.
import { ynEngineProcessIntent } from "./process_intent.js";
import { ynListUnclaimedFields, ynCoverage } from "./unclaimed_and_coverage.js";
import { ynReportEntry } from "./report_helpers.js";
import { ynPageIsAccountCreation } from "./account_wall.js";
import { ynEngineTimer } from "./honeypot.js";

// ─── Execute FillIntent[] ───────────────────────────────────────────────────
// skip:"eeo" → skipped_eeo; non-empty user value → user_kept; never overwrite.
// Honeypots / account-creation walls: never write (silent skip — not "filled").
export async function ynExecuteIntents(intents, ctx) {
  const report = {
    filled: [],
    guessed: [],
    unresolved: [],
    skipped_eeo: [],
    skipped_honeypot: [],
    skipped_payment: [],
    skipped_terms: [],
    user_kept: [],
    errors: [],
    // Fields an immediate write appeared to accept but a short after-write
    // recheck found the page had silently cleared or rejected
    // — moved OUT of filled/guessed into unresolved so coverage never counts
    // them, and kept here too with the specific reason.
    reverted: [],
    // Set true only by the stall detector below: the whole
    // attempt hit its wall-clock cap and stopped. Diagnostic only — never
    // triggers a retry, a click, or a navigation.
    stalled: false,
    // Coverage metric (see ynCoverage below): this function only ever sees
    // the intents it was asked to execute — never the sensitive/needs_you
    // intents split out earlier, never the credential reads that happen
    // after the caller merges reports. The two real fill paths recompute
    // causes/coverage once that fuller picture exists, and that later
    // computation is the one that counts; these two start as null so a
    // caller reading this report in isolation sees "not computed" rather
    // than a confident, partial number.
    causes: null,
    coverage: null,
  };
  const list = Array.isArray(intents) ? intents : [];
  const context = ctx || {};
  // Each fill starts its own undo session (the engine half of Undo) —
  // ynUndoFill only ever reverts what THIS fill wrote.
  if (typeof ynResetUndoSession === "function") ynResetUndoSession();
  // Batched, after-write verification queue: entries land here instead
  // of being pushed straight to filled/guessed for kinds whose framework can
  // revert a write asynchronously (select/checkbox/radio/combobox/file).
  // Text/textarea keep their existing immediate-only check — see the
  // pushToReport() comment below for why that split is deliberate.
  const verifyQueue = [];

  // Full-page account step (URL / Create Account heading|button) → fill nothing.
  // Password-anchored scopes are checked per intent below — a login widget
  // beside guest-apply must not zero the guest form.
  const pageAccountWall =
    typeof ynPageIsAccountCreation === "function" &&
    ynPageIsAccountCreation(document);
  if (pageAccountWall) {
    return report;
  }

  // Kinds whose write this function verifies again, in a batch, once the
  // whole run is over — a select/checkbox/radio/combobox can
  // be reverted by the page's own JS shortly after our change event, and
  // only a delayed recheck catches that. Text/textarea are deliberately
  // NOT in this set: their existing immediate check (now with a squash-
  // equivalence fallback for a masking reformat, see the text branch below)
  // already covers the masked-phone case without a delayed observer, so
  // the existing text hold-check fixtures stay exactly as they were.
  const YN_VERIFY_BATCH_KINDS = new Set([
    "select",
    "checkbox",
    "radio",
    "combobox",
    "file",
  ]);
  const pendingVerify = []; // {el, kind, expected, intent, reportConfidence}
  // Stall detector: a hard wall-clock cap on the
  // WHOLE attempt, not on any one field — a field's own driver already
  // bounds itself (ynWaitFor, the ARIA driver's open/commit timeouts), but a
  // page that keeps producing slow-to-fail fields could still add up past
  // any reasonable attempt length. Stop-and-report ONLY: never a retry,
  // never a click, never a navigation.
  const stallMs = context.stallMs != null ? context.stallMs : 20000;
  const startedAt = Date.now();
  for (const intent of list) {
    if (!intent) continue;
    const remaining = stallMs - (Date.now() - startedAt);
    if (remaining <= 0) {
      report.stalled = true;
      report.errors.push({
        fieldKey: "",
        label: "the fill stalled, nothing more was attempted",
      });
      break;
    }
    let timedOut = false;
    await Promise.race([
      ynEngineProcessIntent(intent, report, context, pendingVerify, YN_VERIFY_BATCH_KINDS),
      new Promise((resolve) => {
        ynEngineTimer(() => {
          timedOut = true;
          resolve();
        }, remaining);
      }),
    ]);
    if (timedOut) {
      report.stalled = true;
      report.errors.push({
        fieldKey: intent.fieldKey || "",
        label: "the fill stalled, nothing more was attempted",
      });
      break;
    }
  }

  // Batched after-write verification: one short observation window
  // covering every queued field at once, rather than one delay per field.
  if (pendingVerify.length && typeof ynVerifyWrites === "function") {
    const results = await ynVerifyWrites(
      pendingVerify.map((p) => ({
        el: p.el,
        kind: p.kind,
        value: p.expected,
        fieldKey: p.intent.fieldKey,
      })),
    );
    for (let i = 0; i < pendingVerify.length; i++) {
      const p = pendingVerify[i];
      const status = (results[i] && results[i].status) || "rejected";
      if (status === "held" || status === "equivalent_after_mask") {
        if (p.reportConfidence === "exact") {
          ynHighlight(p.el, "filled");
          report.filled.push(ynReportEntry(p.intent));
        } else {
          ynHighlight(p.el, "check");
          report.guessed.push(ynReportEntry(p.intent));
        }
      } else {
        const reason =
          status === "cleared_after_fill" ? "cleared after fill" : "rejected";
        ynHighlight(p.el, "missed");
        report.unresolved.push(ynReportEntry(p.intent));
        report.reverted.push({ fieldKey: p.intent.fieldKey || "", label: reason });
      }
    }
  } else if (pendingVerify.length) {
    // No verifier in this page (settle_observer.js not loaded): the writes
    // happened and read back at write time, so they are reported on that
    // readback rather than dropped from the report altogether.
    for (const p of pendingVerify) {
      if (p.reportConfidence === "exact") {
        ynHighlight(p.el, "filled");
        report.filled.push(ynReportEntry(p.intent));
      } else {
        ynHighlight(p.el, "check");
        report.guessed.push(ynReportEntry(p.intent));
      }
    }
  }

  // Site-rendered validation errors near a field this fill touched:
  // diagnostic only — never retried, never clicked, never navigated away
  // from. A field is "touched" when it ended up in filled or guessed.
  try {
    const touchedKeys = new Set(
      [...report.filled, ...report.guessed].map((e) => e.fieldKey).filter(Boolean),
    );
    if (touchedKeys.size) {
      const touchedEls = [];
      for (const p of pendingVerify) {
        if (touchedKeys.has(p.intent.fieldKey)) touchedEls.push(p.el);
      }
      for (const i of list) {
        if (i && i.el && touchedKeys.has(i.fieldKey)) touchedEls.push(i.el);
      }
      const alertRe = /required|invalid|must\s/i;
      const alertSelector =
        '[role="alert"], .artdeco-inline-feedback--error, .fb-form-element-label__error';
      const seen = new Set();
      for (const el of touchedEls) {
        if (!el || seen.has(el)) continue;
        seen.add(el);
        const scope =
          (el.closest && (el.closest("form") || el.closest("fieldset"))) ||
          el.parentElement ||
          el;
        let alerts = [];
        try {
          alerts =
            typeof ynQueryDeep === "function"
              ? ynQueryDeep(scope, alertSelector)
              : Array.from(scope.querySelectorAll(alertSelector));
        } catch {
          alerts = [];
        }
        for (const a of alerts) {
          const text = String(a.textContent || "").trim();
          if (text && alertRe.test(text)) {
            report.errors.push({
              fieldKey:
                list.find((i) => i && i.el === el && i.fieldKey)?.fieldKey || "",
              label: "site_flagged: " + text.slice(0, 120),
            });
            break;
          }
        }
      }
    }
  } catch {
    /* diagnostic-only scan; never let it fail the whole report */
  }

  const done = report.filled.length + report.guessed.length;
  const total =
    done +
    report.unresolved.length +
    report.skipped_eeo.length +
    report.user_kept.length;
  try {
    ynUpdateFillBadge(done, total || done);
  } catch {
    /* badge is optional */
  }

  // Coverage metric, best-effort from what THIS function knows. write_rejected
  // vs manual_upload is a split of report.unresolved by the ORIGINAL intent's
  // kind (ynReportEntry keeps only fieldKey+label, not kind, so the split
  // happens here against `list`, not against the report entries themselves).
  // not_recognised walks the live DOM with the SAME function the dev lister
  // uses (tools/list_unclaimed_fields.js) so the two numbers cannot diverge.
  try {
    const kindByKey = new Map();
    for (const i of list) {
      if (i && i.fieldKey && !kindByKey.has(i.fieldKey)) {
        kindByKey.set(i.fieldKey, i.kind || "text");
      }
    }
    let manualUpload = 0;
    for (const e of report.unresolved) {
      if (kindByKey.get(e && e.fieldKey) === "file") manualUpload += 1;
    }
    report.manual_upload_count = manualUpload;
    report.write_rejected_count = Math.max(
      0,
      report.unresolved.length - manualUpload,
    );
  } catch {
    report.manual_upload_count = 0;
    report.write_rejected_count = report.unresolved.length;
  }
  try {
    const unclaimed =
      typeof ynListUnclaimedFields === "function"
        ? ynListUnclaimedFields(list).filter((f) => f && f.visible && !f.disabled)
        : [];
    report.unclaimed_controls = unclaimed.length;
  } catch {
    report.unclaimed_controls = 0;
  }
  if (typeof ynCoverage === "function") {
    Object.assign(report, ynCoverage(report));
  }

  return report;
}
