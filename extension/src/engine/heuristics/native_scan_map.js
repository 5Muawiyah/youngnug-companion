// content/heuristics.js, part 6 of 8 - the per-field classification half of
// the native <input>/<textarea>/<select> scan: every skip guard (claimed,
// disabled, password, honeypot, password-scope, EEO, sensitive, payment)
// and the mapping ladder (autocomplete exact -> label/identity patterns ->
// input-type fallback -> last-resort nearby-text failsafe). This is the
// FIRST half of what was one function (ynHeuristicIntents); the original
// function's per-element loop body ran this logic and, only when it found a
// profile-key mapping, fell through into the second half (native_scan_emit.js's
// ynHeuristicResolveAndEmit) to resolve a value and push the fill intent.
// Split at that exact seam: every original `continue` in this half meant
// "nothing more to do for this element", so it becomes `return null` here;
// the one path that used to fall through instead returns the mapping bundle
// the second half needs. See index.js for the file's full header and
// history, and native_scan_emit.js for the half this hands off to.
import {
  ynFieldKind,
  ynFieldQuestionText,
  ynNearbyText,
  ynInEeoSection,
  ynReportableFieldLabel,
  ynReportableGroupLabel,
} from "./labels_b.js";
import { ynLabelText } from "./labels_a.js";
import {
  YN_AUTOCOMPLETE_MAP,
  YN_EEO_HEADING_RE,
  YN_SENSITIVE_RE,
} from "./patterns.js";
import { ynClaimRadioGroup, ynMatchFieldIdentity, ynMatchLabelPatterns, ynRefinePatternHit } from "./matching.js";

/**
 * Classify one field: run every never-fill guard (claimed/disabled/password/
 * honeypot/password-scope/EEO/sensitive/payment — each already pushes its
 * own report intent and claims the field before returning), then the
 * mapping ladder. Returns null when the field is fully handled already (a
 * guard fired, or nothing in the ladder matched); returns
 * { mapped, confidence, nearby, mappedViaNearby, signal, type } when a
 * profile-key mapping was found, for ynHeuristicResolveAndEmit to resolve
 * into a value and an intent.
 *
 * @param {Element} el
 * @param {{document_: Document, claimed: Set, intents: object[], usedKeys: Set}} ctx
 */
export function ynHeuristicMapOneField(el, ctx) {
  const { document_, claimed, intents } = ctx;

  if (claimed.has(el)) return null;
  if (el.disabled || el.readOnly) return null;
  const type = (el.type || "").toLowerCase();
  if (["hidden", "submit", "button", "image", "reset"].includes(type))
    return null;
  // Never claim passwords (credentials stay human-only).
  if (type === "password") return null;
  // Honeypot / visually-hidden bot traps — never claim (engine re-checks).
  if (typeof ynIsHoneypot === "function" && ynIsHoneypot(el, document_)) {
    claimed.add(el);
    return null;
  }
  // Inside ANY password's tight scope (form / auth-widget / 3-hop) — never
  // claim. Guest fields outside every password scope still map.
  const inPasswordScope =
    typeof ynFieldInAnyPasswordScope === "function" &&
    ynFieldInAnyPasswordScope(el, document_);
  if (inPasswordScope) {
    claimed.add(el);
    return null;
  }

  // EEO — report, never fill. For a radio/checkbox the row names the
  // GROUP's own question (ynReportableGroupLabel over ynNearbyText, which
  // tries the fieldset/legend first, then the nearest preceding text) —
  // never the element's own per-option label ("Other ethnic background"),
  // which names the option a Lever-style group offers, not the question
  // the group as a whole is asking. A non-choice EEO field (a free-text
  // "describe your ethnicity" input, say) still gets its own real label.
  if (ynInEeoSection(el)) {
    const eeoType = String(el.type || "").toLowerCase();
    const isChoiceField = eeoType === "radio" || eeoType === "checkbox";
    intents.push({
      fieldKey: "eeo",
      el,
      value: null,
      kind: ynFieldKind(el),
      confidence: "guessed",
      source: "heuristic",
      skip: "eeo",
      label: isChoiceField
        ? ynReportableGroupLabel(ynNearbyText(el, document_), "EEO field")
        : ynReportableFieldLabel(el, document_, ynNearbyText(el, document_), "EEO field"),
    });
    claimed.add(el);
    return null;
  }

  const signal = ynLabelText(el, document_);
  // Question text only — CSS classes are not questions (see
  // ynFieldQuestionText: Tailwind's `disabled:` variants used to trip
  // YN_SENSITIVE_RE's `disab` and silently swallow name/email).
  const sensitiveHay = (
    signal +
    " " +
    ynFieldQuestionText(el, document_)
  ).trim();

  // Sensitive — report, never fill (mirror EEO skip shape). `signal` (used
  // above to DETECT the question) leads with the element's own per-option
  // label for a radio/checkbox — fine for detection, but the REPORT must
  // name the group's question, same reasoning as the EEO block above.
  if (sensitiveHay && YN_SENSITIVE_RE.test(sensitiveHay)) {
    const sensitiveIsChoice = type === "radio" || type === "checkbox";
    intents.push({
      fieldKey: "sensitive",
      el,
      value: null,
      kind: ynFieldKind(el),
      confidence: "guessed",
      source: "heuristic",
      skip: "sensitive",
      label: sensitiveIsChoice
        ? ynReportableGroupLabel(ynNearbyText(el, document_), "Sensitive field")
        : ynReportableFieldLabel(el, document_, signal, "Sensitive field"),
    });
    if (type === "radio") ynClaimRadioGroup(el, claimed, document_);
    else claimed.add(el);
    return null;
  }

  // Payment — report, never fill (engine.js ynIsPaymentField is the
  // classifier AND the hard write-time floor; this emission only makes
  // the refusal visible in the report, mirroring the sensitive shape)
  if (
    typeof ynIsPaymentField === "function" &&
    ynIsPaymentField(el, document_)
  ) {
    intents.push({
      fieldKey: "payment",
      el,
      value: null,
      kind: ynFieldKind(el),
      confidence: "guessed",
      source: "heuristic",
      skip: "payment",
      label: ynReportableFieldLabel(el, document_, signal, "Payment field"),
    });
    claimed.add(el);
    return null;
  }

  let mapped = null;
  let confidence = "guessed";

  // 0. Cover-letter FILE inputs — map to letter_file, not the textarea path
  //    and not the generic cv_file type-fallback.
  if (type === "file" && /cover\s*letter|motivation/i.test(signal)) {
    mapped = { key: "letter_file", kind: "file" };
    confidence = "guessed";
  }

  // 1. exact autocomplete tokens (spec-defined → emerald)
  const ac = (el.getAttribute("autocomplete") || "").trim().toLowerCase();
  // autocomplete can be "section-billing shipping given-name" — take last token
  if (!mapped && ac && ac !== "on" && ac !== "off") {
    const tokens = ac.split(/\s+/);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const hit = YN_AUTOCOMPLETE_MAP[tokens[i]];
      if (hit) {
        mapped = hit;
        confidence = "exact";
        break;
      }
    }
  }

  // 2. label / aria / name / id / placeholder patterns
  //    (+ className / sanitized identity as additive fallback)
  //    (cover-letter *textarea* still maps to letter_text via YN_LABEL_PATTERNS)
  if (!mapped) {
    const hit = ynMatchFieldIdentity(el, document_, signal);
    if (hit) {
      // File inputs that matched the cover-letter label pattern as letter_text
      // are already handled in step 0; if a file somehow hits resume→cv_file
      // or cover→letter_text here, force the file keys.
      if (type === "file" && hit.key === "letter_text") {
        mapped = { key: "letter_file", kind: "file" };
      } else if (type === "file" && hit.kind === "file") {
        mapped = { key: hit.key, kind: "file" };
      } else if (type !== "file" || hit.kind !== "textarea") {
        mapped = { key: hit.key, kind: hit.kind };
      }
      confidence = "guessed";
    }
  }

  // 3. input type fallback
  if (!mapped) {
    if (type === "email") {
      mapped = { key: "contact.email", kind: "text" };
      confidence = "guessed";
    } else if (type === "tel") {
      mapped = { key: "contact.phone", kind: "text" };
      confidence = "guessed";
    } else if (type === "url") {
      mapped = { key: "links.portfolio", kind: "text" };
      confidence = "guessed";
    } else if (type === "file") {
      // cover letter already handled in step 0; remaining files → cv
      mapped = { key: "cv_file", kind: "file" };
      confidence = "guessed";
    }
  }

  // 4. Last-resort failsafe — nothing structured matched: read the actual
  // page around the field. The nearby text goes through the SAME guards
  // first (EEO / sensitive → report, never fill), then the same pattern
  // ladder. Always amber ("guessed") — the user double-checks these.
  let nearby = "";
  let mappedViaNearby = false;
  if (!mapped) {
    nearby = ynNearbyText(el, document_);
    if (nearby) {
      if (YN_EEO_HEADING_RE.test(nearby)) {
        intents.push({
          fieldKey: "eeo",
          el,
          value: null,
          kind: ynFieldKind(el),
          confidence: "guessed",
          source: "heuristic",
          skip: "eeo",
          label: ynReportableFieldLabel(el, document_, nearby, "EEO field"),
        });
        if (type === "radio") ynClaimRadioGroup(el, claimed, document_);
        else claimed.add(el);
        return null;
      }
      if (YN_SENSITIVE_RE.test(nearby)) {
        intents.push({
          fieldKey: "sensitive",
          el,
          value: null,
          kind: ynFieldKind(el),
          confidence: "guessed",
          source: "heuristic",
          skip: "sensitive",
          label: ynReportableFieldLabel(
            el,
            document_,
            nearby,
            "Sensitive field",
          ),
        });
        if (type === "radio") ynClaimRadioGroup(el, claimed, document_);
        else claimed.add(el);
        return null;
      }
      const normalised = nearby
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");
      const hit = ynRefinePatternHit(
        ynMatchLabelPatterns(normalised),
        normalised,
      );
      if (hit) {
        if (type === "file" && hit.key === "letter_text") {
          mapped = { key: "letter_file", kind: "file" };
        } else if (type === "file" && hit.kind === "file") {
          mapped = { key: hit.key, kind: "file" };
        } else if (type !== "file" || hit.kind !== "textarea") {
          mapped = { key: hit.key, kind: hit.kind };
        }
        mappedViaNearby = mapped != null;
        confidence = "guessed";
      }
    }
  }

  if (!mapped) return null;
  return { mapped, confidence, nearby, mappedViaNearby, signal, type };
}
