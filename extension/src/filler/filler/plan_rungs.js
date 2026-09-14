// content/filler.js, part 6 of 11 — the wizard-step detector, the
// evidence string, the whole planning ladder (adapter, then cache, then
// heuristics, then the local model, each rung claiming only what the one
// before it left unclaimed), the sensitive/needs-you/generated split, and
// the review gate. ynSendWorker and ynIntentsFromCache come from this same
// shipped file's worker_cache.js; ynOllamaIntents from ollama_intents.js.
// YN_ADAPTERS, ynDetectAts, ynExecuteIntents, ynHeuristicIntents,
// ynShowReviewScreen, ynSubmitGuard, ynWaitFor are other shipped files'
// globals, referenced here as bare names exactly as the single-file
// version did. See index.js for the file's full history.
import { ynSendWorker, ynIntentsFromCache } from "./worker_cache.js";
import { ynOllamaIntents } from "./ollama_intents.js";
export function ynWizardStepInfo(adapter, doc) {
  const document_ = doc || document;
  const out = { moreSteps: false, advanceEl: null, stepKey: "" };
  if (!adapter || !adapter.wizard) return out;
  try {
    if (typeof adapter.wizard.stepKey === "function") {
      out.stepKey = String(adapter.wizard.stepKey(document_) || "") || "";
    }
  } catch {
    /* stepKey is best-effort */
  }
  try {
    if (typeof adapter.wizard.advance === "function") {
      const el = adapter.wizard.advance(document_);
      if (el && typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) {
        // Adapter returned a submit-shaped control — refuse to treat as advance
        out.advanceEl = null;
        out.moreSteps = false;
      } else if (el) {
        out.advanceEl = el;
        out.moreSteps = true;
      }
    }
  } catch {
    /* advance detect is best-effort */
  }
  return out;
}

export function ynEvidenceString(ats, report, extra) {
  const f = (report.filled || []).length;
  const g = (report.guessed || []).length;
  const u = (report.unresolved || []).length;
  const e = (report.skipped_eeo || []).length;
  const k = (report.user_kept || []).length;
  const err = (report.errors || []).length;
  let s =
    `ats=${ats?.id || "unknown"}; filled=${f}; guessed=${g}; ` +
    `unresolved=${u}; eeo=${e}; user_kept=${k}; errors=${err}`;
  if (extra && extra.captcha_widget) s += "; captcha_widget=true";
  return s;
}

/**
 * The planning ladder BOTH fill paths share: adapter plan → field-map cache
 * → generic heuristics → the local resolver, with the adapter's declared
 * scope narrowing every generic rung.
 *
 * Extracted when the generic any-page path arrived, because the alternative
 * was a second copy of the scope rule, the executed-keys filter and the
 * "a declared scope that is absent means no generic rung runs at all"
 * decision. A safety rule with two homes is a safety rule that will one day
 * be weakened in one of them.
 *
 * @param {object} profile fill-plan-shaped profile (the Approved-job plan,
 *   or the whole-profile bundle the worker builds for an arbitrary page)
 * @param {object} ats ynDetectAts result
 * @param {object|null} adapter the registered adapter for this ATS, if any
 * @returns {{intents: object[], claimedEls: Set, errors: object[]}}
 */
export async function ynPlanRungs(plan, ats, adapter, opts) {
  const employer = (opts && opts.employer) || "";
  const executedKeys = (opts && opts.executedKeys) || new Set();
  const errors = [];
  const claimedEls = new Set();

  // the student's OWN rules — read once, up front, so a `site$$`
  // (never act on this site at all) can refuse the WHOLE plan before any
  // adapter, cache, heuristic or resolver rung ever runs, exactly as its
  // name promises. A read/parse failure degrades to "no own rules", never
  // to a refusal — a broken storage blob must not silently stop every fill.
  let ownRules = [];
  try {
    if (typeof YN_OWN_RULES_KEY !== "undefined") {
      const got = await chrome.storage.local.get({ [YN_OWN_RULES_KEY]: "" });
      const text = got[YN_OWN_RULES_KEY] || "";
      if (text && typeof ynParseOwnRules === "function") {
        ownRules = ynParseOwnRules(text).rules;
      }
    }
  } catch {
    ownRules = [];
  }
  const ownForHost =
    typeof ynOwnRulesForHost === "function"
      ? ynOwnRulesForHost(ownRules, location.hostname)
      : { blocked: false, never: [] };
  if (ownForHost.blocked) {
    return { intents: [], claimedEls, errors: [] };
  }

  // Adapter plan (adapters register into YN_ADAPTERS). THE ADAPTER WINS:
  // its intents claim their elements first, so every generic rung below
  // sees them as taken.
  let adapterIntents = [];
  try {
    if (adapter && typeof adapter.plan === "function") {
      // plan() is usually sync; Teamtailor may return a Promise while it waits
      // for a lazy turbo-frame to hydrate (ynWaitFor).
      let intents = adapter.plan(plan, document);
      if (intents && typeof intents.then === "function") {
        intents = await intents;
      }
      adapterIntents = intents || [];
      for (const intent of adapterIntents) {
        if (intent && intent.el) claimedEls.add(intent.el);
        if (intent && intent.fieldKey && executedKeys.has(intent.fieldKey)) {
          intent._skipExecuted = true;
        }
      }
      adapterIntents = adapterIntents.filter((i) => i && !i._skipExecuted);
    }
  } catch (e) {
    errors.push({
      fieldKey: "adapter",
      label: String(e && e.message ? e.message : e),
    });
  }

  // Field-map cache (heuristic/LLM rungs only) — re-verify selectors
  let cacheIntents = [];
  try {
    if (employer) {
      const cacheResp = await ynSendWorker({
        type: "FIELD_MAP_CACHE_GET",
        employer,
        ats: ats.id,
      });
      if (cacheResp?.ok && cacheResp.entry) {
        cacheIntents = ynIntentsFromCache(
          cacheResp.entry,
          plan,
          claimedEls,
          executedKeys,
        );
      }
    }
  } catch (e) {
    errors.push({
      fieldKey: "cache",
      label: String(e && e.message ? e.message : e),
    });
  }

  // Scope: an adapter may name the ONE region that is the application
  // (LinkedIn's Easy Apply modal, Indeed's wizard main, Reed's modal). The
  // page behind that region carries the site's own search boxes and filters,
  // which look like fields and are not application fields. Generic intents
  // (cache, heuristics, the local resolver) outside the region are dropped;
  // a declared region that is absent (the modal is not open yet) means no
  // generic rung runs at all - the adapter has already said what to click.
  let scopeRoot = null;
  let scopeDeclared = false;
  if (adapter && typeof adapter.scope === "function") {
    scopeDeclared = true;
    try {
      scopeRoot = adapter.scope(document) || null;
    } catch {
      scopeRoot = null;
    }
  }
  const inScope = (i) => {
    if (!scopeDeclared) return true;
    if (!scopeRoot) return false;
    return !i || !i.el || scopeRoot.contains(i.el);
  };
  cacheIntents = cacheIntents.filter(inScope);

  // Own-rule "label=key" mappings: a rung ABOVE heuristics (it claims
  // its elements into claimedEls below, before ynHeuristicIntents ever
  // runs, so a field an own rule already named is never ALSO guessed by
  // the generic ladder) and below every write-time guard — ynExecuteIntents
  // re-checks password-scope/payment/sensitive-truth-policy on every intent
  // by its LIVE ELEMENT regardless of which rung produced it, so an own
  // rule can name a field, never claim one the guards would otherwise
  // refuse.
  let ownRuleIntents = [];
  try {
    if (typeof ynOwnRuleFillIntents === "function") {
      const { intents } = ynOwnRuleFillIntents(
        ownRules,
        location.hostname,
        document,
        plan,
      );
      ownRuleIntents = intents.filter(
        (i) => i && !executedKeys.has(i.fieldKey) && inScope(i),
      );
      for (const i of ownRuleIntents) if (i.el) claimedEls.add(i.el);
    }
  } catch (e) {
    errors.push({
      fieldKey: "own_rules",
      label: String(e && e.message ? e.message : e),
    });
  }

  // Heuristics for unclaimed fields
  let heuristicIntents = [];
  try {
    if (
      typeof ynHeuristicIntents === "function" &&
      (!scopeDeclared || scopeRoot)
    ) {
      heuristicIntents = ynHeuristicIntents(plan, document, claimedEls) || [];
      heuristicIntents = heuristicIntents.filter(
        (i) => i && !executedKeys.has(i.fieldKey) && inScope(i),
      );
    }
  } catch (e) {
    errors.push({
      fieldKey: "heuristics",
      label: String(e && e.message ? e.message : e),
    });
  }

  // Rung 3: the LOCAL Ollama resolver. Runs ONLY for fields every
  // deterministic rung left unresolved; the worker hard-no-ops unless the
  // user has enabled ollamaEnabled (loopback-only, £0). Results are
  // membership-validated and always amber.
  let ollamaIntents = [];
  try {
    for (const i of [...cacheIntents, ...ownRuleIntents, ...heuristicIntents]) {
      if (i && i.el) claimedEls.add(i.el);
    }
    ollamaIntents =
      !scopeDeclared || scopeRoot
        ? await ynOllamaIntents(plan, document, claimedEls)
        : [];
    ollamaIntents = ollamaIntents.filter(
      (i) => i && !executedKeys.has(i.fieldKey) && inScope(i),
    );
  } catch (e) {
    errors.push({
      fieldKey: "ollama",
      label: String(e && e.message ? e.message : e),
    });
  }

  // Own-rule "site!!label" never-fill rules, applied LAST and across every
  // rung's intents alike — an own rule that says "never fill this field"
  // must win over an adapter's or heuristics' own guess for the SAME
  // field, not only over another own rule.
  const neverLabels = ownForHost.never || [];
  const passesNeverFill = (i) => {
    if (!neverLabels.length || !i || !i.el) return true;
    if (typeof ynHumanFieldLabel !== "function" || typeof ynOwnRuleNormLabel !== "function") {
      return true;
    }
    const lbl = ynOwnRuleNormLabel(ynHumanFieldLabel(i.el, document));
    return !lbl || !neverLabels.includes(lbl);
  };

  return {
    intents: [
      ...adapterIntents,
      ...cacheIntents,
      ...ownRuleIntents,
      ...heuristicIntents,
      ...ollamaIntents,
    ].filter(passesNeverFill),
    claimedEls,
    errors,
  };
}

/**
 * Split a planned set into the four groups the executor treats differently.
 * Shared by both fill paths so "sensitive never reaches the engine" cannot
 * be true in one path and forgotten in the other.
 */
export function ynSplitIntents(allIntents) {
  const list = Array.isArray(allIntents) ? allIntents : [];
  return {
    // Criminal record / health / referee questions — reported, NEVER executed
    sensitiveIntents: list.filter((i) => i && i.skip === "sensitive"),
    // Recognised factual questions with NO stored answer — surfaced amber
    // "answer this yourself", never executed, never guessed.
    needsYouIntents: list.filter((i) => i && i.skip === "needs_you"),
    generatedIntents: list.filter((i) => i && i.kind === "generated_text"),
    baseIntents: list.filter(
      (i) =>
        i &&
        i.skip !== "sensitive" &&
        i.skip !== "needs_you" &&
        i.kind !== "generated_text",
    ),
  };
}

/**
 * Rank 5's seam — the one place either fill path decides what actually
 * gets written, after ynPlanRungs and before ynExecuteIntents ever runs.
 * Exact intents wait for the same Approve as everyone else but are never
 * listed; a guessed field or a draft with nothing to review (both empty)
 * skips the screen entirely rather than asking for an empty click.
 *
 * `drafts` entries are mutated in place with a `written` boolean so a
 * caller building report.drafts afterward can say which ones actually
 * reached the page. `draftElByKey` (fieldKey -> the generated_text intent,
 * carrying its live .el) stays OUT of `drafts` itself: `drafts` ends up on
 * `report`, which crosses back to the popup and to APPLY_RESULT, and a
 * live DOM element cannot survive that trip.
 *
 * @returns {{executeIntents: object[], cancelled: boolean, errors: object[]}}
 */
export async function ynReviewGate(exactIntents, guessedIntents, drafts, draftElByKey, ats) {
  const errors = [];
  const hasRows = (guessedIntents && guessedIntents.length) || (drafts && drafts.length);
  if (!hasRows) {
    return { executeIntents: [...(exactIntents || [])], cancelled: false, errors };
  }
  let decision = null;
  if (typeof ynShowReviewScreen === "function") {
    try {
      decision = await ynShowReviewScreen({
        guessed: guessedIntents || [],
        drafts: drafts || [],
        draftElByKey: draftElByKey || new Map(),
        ats: ats || null,
      });
    } catch (e) {
      errors.push({
        fieldKey: "review",
        label: String(e && e.message ? e.message : e),
      });
      decision = null;
    }
  } else {
    errors.push({
      fieldKey: "review",
      label: "ynShowReviewScreen missing: review_screen.js not loaded?",
    });
  }
  // Fail open to the pre-rank-5 behaviour (everything written, nothing
  // skipped) only when the screen itself could not run at all — a missing
  // file is a bug to fix, not a reason to block every fill silently.
  if (!decision) decision = { approved: true, skippedFieldKeys: [], edits: {} };

  if (decision.approved !== true) {
    for (const d of drafts || []) d.written = false;
    return { executeIntents: [], cancelled: true, errors };
  }

  const skipped = new Set(decision.skippedFieldKeys || []);
  const edits = decision.edits || {};
  const approvedGuessed = (guessedIntents || []).filter(
    (i) => i && !skipped.has(i.fieldKey),
  );
  const approvedDrafts = [];
  for (const d of drafts || []) {
    const gi = draftElByKey && draftElByKey.get ? draftElByKey.get(d.fieldKey) : null;
    const include = !!(gi && gi.el && d.verdict === "clean" && !skipped.has(d.fieldKey));
    d.written = include;
    if (include) {
      const text = Object.prototype.hasOwnProperty.call(edits, d.fieldKey)
        ? String(edits[d.fieldKey])
        : d.text;
      approvedDrafts.push({
        ...gi,
        value: text,
        kind: "text",
        confidence: "guessed",
        source: "generated",
      });
    }
  }
  return {
    executeIntents: [...(exactIntents || []), ...approvedGuessed, ...approvedDrafts],
    cancelled: false,
    errors,
  };
}

