// content/heuristics.js, part 7 of 8 - the value-resolution half of the
// native field scan: given a profile-key mapping from native_scan_map.js's
// ynHeuristicMapOneField (free-text archetypes, row-aware array indexing,
// the recognised-but-unstored "needs_you" surfacing, boolean/date/radio
// value resolution), decide the final intent and push it. This is the
// SECOND half of what was one function (ynHeuristicIntents) before the
// split; every `continue` in the original loop body here meant "done with
// this element", so each becomes a plain `return` — this half is called
// once per element, never inside a loop of its own. See index.js for the
// file's full header and history, and native_scan_map.js for the half
// this receives its mapping from.
import { ynFieldKind, ynReportableFieldLabel } from "./labels_b.js";
import { ynProfileGet, ynIsUnconfirmed, ynValueUsable } from "./patterns.js";
import { ynRowContainerOf, ynRowIndexFor } from "./questions.js";
import {
  ynIsFactualQuestionKey,
  ynIsBooleanFieldKey,
  ynClaimRadioGroup,
  ynResolveBooleanRadio,
  ynResolveOptionRadio,
  YN_DATE_FIELD_KEYS,
  ynDatePartRole,
  ynDateGroup,
} from "./matching.js";

/**
 * Resolve a mapped field to a value and push its fill intent (or a
 * needs_you / nothing-usable skip). `mapResult` is exactly what
 * ynHeuristicMapOneField returned for this element.
 *
 * @param {Element} el
 * @param {{mapped: {key:string,kind:string}, confidence: string, nearby: string, mappedViaNearby: boolean, signal: string, type: string}} mapResult
 * @param {{profile: object, document_: Document, claimed: Set, intents: object[], usedKeys: Set, workRowContainers: Element[], eduRowContainers: Element[]}} ctx
 */
export function ynHeuristicResolveAndEmit(el, mapResult, ctx) {
  const { profile, document_, claimed, intents, usedKeys, workRowContainers, eduRowContainers } = ctx;
  let mapped = mapResult.mapped;
  let confidence = mapResult.confidence;
  const { nearby, mappedViaNearby, signal, type } = mapResult;

  // Free-text archetypes: only textarea/text; no profile value required
  if (
    mapped.kind === "generated_text" ||
    (mapped.key && String(mapped.key).startsWith("generated:"))
  ) {
    const fk = mapped.key.startsWith("generated:")
      ? mapped.key
      : "generated:" + mapped.key;
    const liveKind = ynFieldKind(el);
    if (liveKind !== "textarea" && liveKind !== "text") return;
    if (usedKeys.has(fk)) return;
    const maxLen =
      typeof el.maxLength === "number" && el.maxLength > 0
        ? el.maxLength
        : null;
    intents.push({
      fieldKey: fk,
      el,
      value: null,
      kind: "generated_text",
      confidence: "guessed",
      source: "heuristic",
      // When the NEARBY rung identified this field, the nearby
      // text IS the question the composer must answer — the structured
      // signal is just ids/names that matched nothing.
      questionLabel:
        ((mappedViaNearby ? nearby : signal) || signal || nearby).slice(
          0,
          300,
        ) || fk,
      maxLength: maxLen,
      label: ynReportableFieldLabel(
        el,
        document_,
        (mappedViaNearby ? nearby : signal) || signal || nearby,
      ),
    });
    claimed.add(el);
    usedKeys.add(fk);
    return;
  }

  // row-aware grouping BEFORE the one-key-per-page
  // dedup below. A second "Company" field is only a genuine duplicate
  // (dedup keeps winning) when it sits in the SAME row as the first one;
  // inside a DIFFERENT row (a repeated experience/education block already
  // rendered on the page) it is row 2, row 3, … of the array, not a
  // repeat of row 1 — assign it that row's own key instead of dropping
  // it. Prerequisite for repeater.js (which drives NEW rows into
  // existence by clicking Add; this only reads rows already on the
  // page). No row-ish ancestor found → unchanged: today's exact dedup.
  const rowMatch = /^(work|education)\.0\.(.+)$/.exec(mapped.key);
  if (rowMatch) {
    const rowContainer = ynRowContainerOf(el);
    if (rowContainer) {
      const containers =
        rowMatch[1] === "work" ? workRowContainers : eduRowContainers;
      const rowIndex = ynRowIndexFor(containers, rowContainer);
      mapped = { key: `${rowMatch[1]}.${rowIndex}.${rowMatch[2]}`, kind: mapped.kind };
    }
  }

  if (usedKeys.has(mapped.key) && mapped.key !== "eeo") return;

  // A RECOGNISED factual question whose answer is not in
  // the profile must not vanish silently — it is surfaced amber "answer
  // this yourself" (skip:"needs_you"; the filler routes it into
  // report.needs_you). Never guessed, never defaulted — the right-to-work
  // rule is: stored profile value or nothing.
  const emitNeedsYou = () => {
    intents.push({
      fieldKey: mapped.key,
      el,
      value: null,
      kind: ynFieldKind(el),
      confidence: "guessed",
      source: "heuristic",
      skip: "needs_you",
      label: ynReportableFieldLabel(
        el,
        document_,
        (mappedViaNearby ? nearby : signal) || signal || nearby,
      ),
    });
    if (type === "radio") ynClaimRadioGroup(el, claimed, document_);
    else claimed.add(el);
    usedKeys.add(mapped.key);
  };
  const isFactualKey = ynIsFactualQuestionKey(mapped.key);

  // An unconfirmed answer must never be FILLED — but a recognised factual
  // question still has to SURFACE rather than vanish. The server marks
  // every unset factual key unconfirmed (apply_service builds
  // unconfirmed_answers from exactly the None-valued keys), so checking
  // this before the needs_you emission silently swallowed the whole
  // feature: the amber "answer this yourself" line could never appear on a
  // real fill-plan, only against a stub that omitted the field.
  if (ynIsUnconfirmed(profile, mapped.key)) {
    if (isFactualKey) emitNeedsYou();
    return;
  }

  let value = ynProfileGet(profile, mapped.key);
  // boolean right-to-work / eligibility: null/undefined = unset → surface
  if (
    (mapped.key.startsWith("right_to_work.") ||
      mapped.key.startsWith("eligibility_extra.")) &&
    (value === null || value === undefined)
  ) {
    emitNeedsYou();
    return;
  }
  // years_of_experience: fill ONLY when derived value is a number
  if (mapped.key === "derived.years_of_experience") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      emitNeedsYou();
      return;
    }
    value = String(value);
    confidence = "guessed";
  }
  // highest_qualification always amber
  if (mapped.key === "derived.highest_qualification") {
    if (!ynValueUsable(value)) {
      emitNeedsYou();
      return;
    }
    confidence = "guessed";
  }

  if (mapped.kind === "checkbox" || mapped.kind === "radio") {
    // keep boolean; coerce strings — NEVER default, NEVER random
    if (typeof value === "string")
      value = /^(true|yes|1)$/i.test(value.trim());
    if (typeof value !== "boolean") {
      if (isFactualKey) emitNeedsYou();
      return;
    }
  } else if (ynIsBooleanFieldKey(mapped.key)) {
    // select/text mapped to a boolean key
    if (typeof value === "string")
      value = /^(true|yes|1)$/i.test(value.trim());
    if (typeof value !== "boolean") {
      if (isFactualKey) emitNeedsYou();
      return;
    }
  } else if (!ynValueUsable(value)) {
    if (isFactualKey) emitNeedsYou();
    return;
  }

  // Boolean → radio: pick Yes/No by option label (fixes first-radio bug)
  let targetEl = el;
  let kind =
    mapped.kind === "file"
      ? "file"
      : mapped.kind === "checkbox"
        ? "checkbox"
        : ynFieldKind(el) === "select"
          ? "select"
          : ynFieldKind(el) === "combobox"
            ? "combobox"
            : ynFieldKind(el) === "textarea"
              ? "textarea"
              : ynFieldKind(el) === "radio"
                ? "radio"
                : ynFieldKind(el) === "date"
                  ? "date"
                  : mapped.kind || "text";

  // A date-valued key landing on one part of a Day/Month/Year
  // group fills the WHOLE group as one date_parts intent; every part is
  // claimed so the siblings don't re-map. Incomplete/unsafe group (month
  // is a <select>, a role repeats) → no-claim, nothing invented.
  if (
    YN_DATE_FIELD_KEYS.has(mapped.key) &&
    ["text", "number", "tel"].includes(type) &&
    ynDatePartRole(el, document_)
  ) {
    const group = ynDateGroup(el, document_);
    if (group) {
      intents.push({
        fieldKey: mapped.key,
        el: group.day,
        els: group,
        value,
        kind: "date_parts",
        confidence: "guessed",
        source: "heuristic",
        label: ynReportableFieldLabel(el, document_, nearby || signal),
      });
      claimed.add(group.day);
      claimed.add(group.month);
      claimed.add(group.year);
      usedKeys.add(mapped.key);
    }
    return;
  }

  if (ynIsBooleanFieldKey(mapped.key) && type === "radio") {
    const resolved = ynResolveBooleanRadio(el, value, document_);
    if (!resolved) {
      ynClaimRadioGroup(el, claimed, document_);
      return;
    }
    targetEl = resolved.el;
    value = resolved.value;
    kind = "radio";
    ynClaimRadioGroup(el, claimed, document_);
  } else if (
    ynIsBooleanFieldKey(mapped.key) &&
    ynFieldKind(el) === "select"
  ) {
    // Engine matches option text/value — emit Yes/No strings (never invent)
    value = value ? "Yes" : "No";
    kind = "select";
  } else if (ynIsBooleanFieldKey(mapped.key) && type === "checkbox") {
    kind = "checkbox";
  } else if (
    !ynIsBooleanFieldKey(mapped.key) &&
    type === "radio" &&
    typeof value === "string"
  ) {
    // Without this, a string answer on a radio fell through to
    // the engine as Boolean("1 month") === true and CHECKED THE FIRST
    // RADIO — exactly the wrong-pick behaviour this code must avoid.
    // Resolve the group member by visible option label, or skip instead.
    const resolved = ynResolveOptionRadio(el, value, document_);
    ynClaimRadioGroup(el, claimed, document_);
    if (!resolved) return;
    targetEl = resolved.el;
    value = true;
    kind = "radio";
  }

  intents.push({
    fieldKey: mapped.key,
    el: targetEl,
    value: kind === "file" ? value : value,
    kind,
    confidence,
    source: "heuristic",
    label: mappedViaNearby
      ? ynReportableFieldLabel(targetEl, document_, nearby)
      : ynReportableFieldLabel(targetEl, document_, nearby || signal),
  });
  if (type !== "radio") claimed.add(targetEl);
  usedKeys.add(mapped.key);
}
