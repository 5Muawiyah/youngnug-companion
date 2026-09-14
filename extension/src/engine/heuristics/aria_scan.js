// content/heuristics.js, part 8 of 8 - ARIA choice widgets (Google-Forms-
// style div[role=radio|checkbox] inside role=radiogroup/group/list
// containers; no native <input> exists, so the native field scan in
// native_scan_map.js and native_scan_emit.js cannot see them). Same guard order
// as the native scan: EEO/sensitive surfaced never answered;
// recognised-but-unstored factual -> needs_you; ambiguous option match
// fails outright. State is driven/verified via aria-checked in the engine.
// This was the second half of ynHeuristicIntents's own body before the
// split; it is unchanged, just lifted into its own function since the whole
// original function no longer fits the module size limit in one piece. See
// index.js for the file's full header and history.
import { ynGroupLegend } from "./labels_a.js";
import {
  ynNearbyText,
  ynInEeoSection,
  ynReportableFieldLabel,
  ynReportableGroupLabel,
} from "./labels_b.js";
import {
  YN_EEO_HEADING_RE,
  YN_SENSITIVE_RE,
  ynProfileGet,
  ynIsUnconfirmed,
} from "./patterns.js";
import {
  ynRefinePatternHit,
  ynMatchLabelPatterns,
  ynIsBooleanFieldKey,
  ynIsFactualQuestionKey,
} from "./matching.js";

/**
 * Scan every ARIA radiogroup/group/list container on the page for a
 * choice-widget question the native field scan could not see, and push a
 * matching fill / skip intent for each one it can resolve unambiguously.
 * Mutates ctx.intents, ctx.claimed and ctx.usedKeys in place — same
 * contract as the native scan halves.
 *
 * @param {{profile: object, document_: Document, claimed: Set, intents: object[], usedKeys: Set}} ctx
 */
export function ynHeuristicAriaChoiceIntents(ctx) {
  const { profile, document_, claimed, intents, usedKeys } = ctx;

  const containers =
    typeof ynQueryDeep === "function"
      ? ynQueryDeep(
          document_,
          '[role="radiogroup"], [role="group"], [role="list"]',
        )
      : [
          ...document_.querySelectorAll(
            '[role="radiogroup"], [role="group"], [role="list"]',
          ),
        ];
  const optLabel = (o) =>
    (o.getAttribute("aria-label") || o.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  const CHOICE_CONTAINER_SEL =
    '[role="radiogroup"], [role="group"], [role="list"]';
  for (const c of containers) {
    let options = [];
    try {
      options = [
        ...c.querySelectorAll('[role="radio"], [role="checkbox"]'),
      ].filter((o) => (o.tagName || "").toUpperCase() !== "INPUT");
    } catch {
      continue;
    }
    // Containers NEST: real Google Forms is role=list > role=listitem >
    // role=radiogroup, so the outer list matches too and would swallow the
    // options of EVERY question inside it — labelling them all with the
    // first question and claiming the rest into silence. Keep only the
    // options whose OWN nearest choice container is this one, so each
    // question is handled by the container that actually owns it.
    options = options.filter((o) => {
      try {
        return o.closest(CHOICE_CONTAINER_SEL) === c;
      } catch {
        return true;
      }
    });
    if (options.length < 2) continue;
    if (options.some((o) => claimed.has(o))) continue;
    // The SAME guards the native field loop runs. Without them the ARIA path
    // could click a hidden honeypot widget, a choice inside a login/password
    // scope, or an EEO question whose own text is neutral but which sits
    // under an "Equal Opportunities" heading — ynInEeoSection walks the
    // ancestors, which a regex on the question text alone cannot do.
    const claimAllOptions = () => {
      for (const o of options) claimed.add(o);
    };
    if (
      typeof ynIsHoneypot === "function" &&
      options.some((o) => ynIsHoneypot(o, document_))
    ) {
      claimAllOptions();
      continue;
    }
    if (
      typeof ynFieldInAnyPasswordScope === "function" &&
      options.some((o) => ynFieldInAnyPasswordScope(o, document_))
    ) {
      claimAllOptions();
      continue;
    }
    const question =
      ynGroupLegend(options[0], document_) || ynNearbyText(c, document_);
    if (!question) continue;
    // Every intent below reports on the WHOLE group (`el: options[0]` only
    // stands in for it), so the label is the group's own question
    // (ynReportableGroupLabel over `question`, already the fieldset
    // legend/nearby text) — never options[0]'s own per-option label, which
    // would name whichever option happened to sort first, not the ask.
    if (ynInEeoSection(options[0])) {
      intents.push({
        fieldKey: "eeo",
        el: options[0],
        value: null,
        kind: "aria_choice",
        confidence: "guessed",
        source: "heuristic",
        skip: "eeo",
        label: ynReportableGroupLabel(question, "EEO field"),
      });
      claimAllOptions();
      continue;
    }
    const claimAll = () => {
      for (const o of options) claimed.add(o);
    };
    if (YN_EEO_HEADING_RE.test(question)) {
      intents.push({
        fieldKey: "eeo",
        el: options[0],
        value: null,
        kind: "aria_choice",
        confidence: "guessed",
        source: "heuristic",
        skip: "eeo",
        label: ynReportableGroupLabel(question, "EEO field"),
      });
      claimAll();
      continue;
    }
    if (YN_SENSITIVE_RE.test(question)) {
      intents.push({
        fieldKey: "sensitive",
        el: options[0],
        value: null,
        kind: "aria_choice",
        confidence: "guessed",
        source: "heuristic",
        skip: "sensitive",
        label: ynReportableGroupLabel(question, "Sensitive field"),
      });
      claimAll();
      continue;
    }
    const normalised = question
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");
    const hit = ynRefinePatternHit(
      ynMatchLabelPatterns(normalised),
      normalised,
    );
    if (!hit || usedKeys.has(hit.key)) continue;
    // Same reachability rule as the native loop: an unconfirmed factual
    // answer must SURFACE (amber) rather than vanish.
    const ariaUnconfirmed = ynIsUnconfirmed(profile, hit.key);
    let value = ynProfileGet(profile, hit.key);
    const isBool = ynIsBooleanFieldKey(hit.key);
    if (isBool && typeof value === "string") {
      value = /^(true|yes|1)$/i.test(value.trim());
    }
    const unset =
      ariaUnconfirmed ||
      value === null ||
      value === undefined ||
      value === "" ||
      (isBool && typeof value !== "boolean");
    if (unset) {
      if (ynIsFactualQuestionKey(hit.key)) {
        intents.push({
          fieldKey: hit.key,
          el: options[0],
          value: null,
          kind: "aria_choice",
          confidence: "guessed",
          source: "heuristic",
          skip: "needs_you",
          label: ynReportableFieldLabel(options[0], document_, question),
        });
        claimAll();
        usedKeys.add(hit.key);
      }
      continue;
    }
    let target = null;
    if (isBool) {
      const want = Boolean(value);
      const yesRe = /^(yes|true)\b/i;
      const noRe = /^(no|false)\b/i;
      const matches = options.filter((o) => {
        const l = optLabel(o);
        return (want ? yesRe : noRe).test(l) && !(want ? noRe : yesRe).test(l);
      });
      target = matches.length === 1 ? matches[0] : null;
    } else if (typeof value === "string") {
      const wantS = value.trim().toLowerCase();
      const labelled = options
        .map((o) => ({ o, l: optLabel(o).toLowerCase() }))
        .filter((x) => x.l);
      const uniq = (arr) => (arr.length === 1 ? arr[0].o : null);
      target =
        uniq(labelled.filter((x) => x.l === wantS)) ||
        uniq(labelled.filter((x) => x.l.startsWith(wantS))) ||
        uniq(labelled.filter((x) => x.l.includes(wantS)));
    }
    claimAll();
    if (!target) continue; // ambiguous / no unique option — fails outright
    intents.push({
      fieldKey: hit.key,
      el: target,
      value: true,
      kind: "aria_choice",
      confidence: "guessed",
      source: "heuristic",
      label: ynReportableFieldLabel(target, document_, question),
    });
    usedKeys.add(hit.key);
  }
}
