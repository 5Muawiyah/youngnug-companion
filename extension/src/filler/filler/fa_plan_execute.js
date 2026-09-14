// content/filler.js, part 8 of 11 — ynFillApplication, phase 2 of 4: the
// multi-step resume scaffold, the whole planning ladder (ynPlanRungs), the
// sensitive/needs-you/generated-free-text split, the generated-answer
// round trip (capped at four per page), the review gate, and the engine
// execute call — everything up to and including the merged report, before
// the after-write hold-check. Reads plan/ats/origin/employer off the
// shared state object S (phase 1's output) and writes prior, executedKeys,
// adapter, claimedEls, allIntents, executeIntents and report onto it for
// the phases after this one. See index.js for the file's full history.
import { ynEmptyReport, ynMergeReport, ynLoadFillState } from "./report_state.js";
import { ynCredentialSkips } from "./overlay_lines.js";
import { ynPlanRungs, ynSplitIntents, ynReviewGate } from "./plan_rungs.js";
import { ynSendWorker } from "./worker_cache.js";

export async function ynFillApplicationPlanAndExecute(jobId, S) {
  const { plan, ats, origin, employer } = S;
  // Multi-step resume scaffold
  const prior = await ynLoadFillState(jobId, ats.id, origin);
  const executedKeys = new Set((prior && prior.executedFieldKeys) || []);
  let reportSoFar = (prior && prior.report) || ynEmptyReport();

  // 4-6b. Plan: adapter → cache → heuristics → local resolver
  const adapters = typeof YN_ADAPTERS !== "undefined" ? YN_ADAPTERS : [];
  const adapter = adapters.find((a) => a && a.id === ats.id) || null;
  const planned = await ynPlanRungs(plan, ats, adapter, {
    employer,
    executedKeys,
  });
  const claimedEls = planned.claimedEls;
  reportSoFar.errors.push(...planned.errors);
  const allIntents = planned.intents;

  // 7a. Split sensitive (never execute) + generated free-text
  // (worker GENERATE_ANSWER round-trip; always confidence "guessed"/amber).
  // Cap 4 generated answers per page; failures → needs_you, never block fill.
  const {
    sensitiveIntents,
    needsYouIntents,
    generatedIntents,
    baseIntents,
  } = ynSplitIntents(allIntents);

  const needsYou = [];
  for (const ni of needsYouIntents) {
    needsYou.push({
      fieldKey: ni.fieldKey,
      label: ni.label || ni.fieldKey,
    });
  }
  // a generated answer is NEVER written to the DOM here — it surfaces
  // ONLY as a draft in the report, approved or refused, and the review
  // screen (a separate rung) is the one place a draft's text ever reaches
  // the page. drafts carries {fieldKey, text, source, verdict, refs} for
  // BOTH an accepted draft and a refused one, so a refusal is explained,
  // not silent.
  const drafts = [];
  const genCap = generatedIntents.slice(0, 4);
  for (const rest of generatedIntents.slice(4)) {
    needsYou.push({
      fieldKey: rest.fieldKey,
      label: rest.questionLabel || rest.label || rest.fieldKey,
    });
  }
  for (const gi of genCap) {
    const question = String(gi.questionLabel || gi.label || "").slice(0, 300);
    try {
      const resp = await ynSendWorker({
        type: "GENERATE_ANSWER",
        jobId,
        question,
        maxChars: gi.maxLength || null,
      });
      if (resp && resp.ok && typeof resp.text === "string" && resp.text) {
        drafts.push({
          fieldKey: gi.fieldKey,
          text: resp.text,
          source: "generated",
          verdict: resp.verdict || "clean",
          refs: Array.isArray(resp.refs) ? resp.refs : [],
          label: gi.label || gi.questionLabel || gi.fieldKey,
        });
      } else {
        drafts.push({
          fieldKey: gi.fieldKey,
          text: "",
          source: "generated",
          verdict: (resp && resp.verdict) || ["unavailable"],
          refs: (resp && Array.isArray(resp.refs) && resp.refs) || [],
          label: gi.label || gi.questionLabel || gi.fieldKey,
        });
        needsYou.push({ fieldKey: gi.fieldKey, label: question || gi.fieldKey });
      }
    } catch (e) {
      drafts.push({
        fieldKey: gi.fieldKey,
        text: "",
        source: "generated",
        verdict: ["error"],
        refs: [],
        label: gi.label || gi.questionLabel || gi.fieldKey,
      });
      needsYou.push({ fieldKey: gi.fieldKey, label: question || gi.fieldKey });
    }
  }

  // 7b. Review gate — the seam between planning and writing.
  // Exact-confidence intents wait for the same Approve but are never
  // listed; every guessed intent and every draft gets one row.
  const draftElByKey = new Map(genCap.map((gi) => [gi.fieldKey, gi]));
  const exactIntents = baseIntents.filter((i) => i && i.confidence === "exact");
  const guessedIntents = baseIntents.filter((i) => i && i.confidence !== "exact");
  const gate = await ynReviewGate(exactIntents, guessedIntents, drafts, draftElByKey, ats);
  // A draft the drafter cleared but the student did not use is still a
  // question with no answer on the page — surface it, never drop it.
  for (const d of drafts) {
    if (d.verdict === "clean" && !d.written) {
      needsYou.push({ fieldKey: d.fieldKey, label: d.label || d.fieldKey });
    }
  }
  const executeIntents = gate.executeIntents;

  // 7. Execute
  let report = ynEmptyReport();
  try {
    if (typeof ynExecuteIntents === "function") {
      report = await ynExecuteIntents(executeIntents, { plan, ats, jobId });
    } else {
      report.errors.push({
        fieldKey: "engine",
        label: "ynExecuteIntents missing: engine.js not loaded?",
      });
    }
  } catch (e) {
    report.errors.push({
      fieldKey: "execute",
      label: String(e && e.message ? e.message : e),
    });
  }

  // Sensitive skips never enter the engine (engine only knows skip:"eeo").
  // Use ynReportEntry so the overlay shows a CLEAN question label (the fieldset
  // legend for grouped radios), not the matcher's concatenated identity signal.
  const sensitiveReport = () =>
    sensitiveIntents.map((i) =>
      ynReportEntry(i, i.el ? "" : i.label || "Sensitive field"),
    );
  report.skipped_sensitive = sensitiveReport();
  report.needs_you = needsYou;
  report.drafts = drafts;
  if (gate.errors && gate.errors.length) report.errors.push(...gate.errors);

  report = ynMergeReport(reportSoFar, report);
  // Not one of ynEmptyReport's array keys, so it sits outside the generic
  // concat above: true the moment ANY step of a multi-step fill was
  // cancelled, so a resumed later step cannot quietly clear it.
  report.cancelled = !!gate.cancelled || !!reportSoFar.cancelled;
  // Credential refusals are a READ of the LIVE page (ynCredentialSkips), not
  // an intent, so they are assigned AFTER the merge: ynMergeReport
  // concatenates, and on a resumed multi-step fill that would restate the
  // previous step's credential fields alongside this step's.
  report.skipped_password = ynCredentialSkips(document);
  // ynMergeReport concatenates known keys; re-attach arrays it may have blanked
  if (!report.skipped_sensitive) report.skipped_sensitive = [];
  if (!report.needs_you) report.needs_you = [];
  if (!report.drafts) report.drafts = [];
  if (!report.drafts.length && drafts.length) report.drafts = drafts;
  // Prefer the post-execute assembly when merge wiped them from empty soFar
  if (!report.skipped_sensitive.length && sensitiveIntents.length) {
    report.skipped_sensitive = sensitiveReport();
  }
  if (!report.needs_you.length && needsYou.length) {
    report.needs_you = needsYou;
  }

  S.prior = prior;
  S.executedKeys = executedKeys;
  S.adapter = adapter;
  S.claimedEls = claimedEls;
  S.allIntents = allIntents;
  S.executeIntents = executeIntents;
  S.report = report;
}
