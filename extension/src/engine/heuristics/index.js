// content/heuristics.js — ladder rung 2: generic field resolver for unclaimed
// fields and unknown ATSes. autocomplete tokens = exact; everything else = guessed.
// Never claims alreadyClaimedEls. EEO/demographic sections → skip:"eeo".
// Sensitive (criminal/health/referee) → skip:"sensitive". Free-text archetypes
// → kind:"generated_text" (filler round-trips GENERATE_ANSWER; always amber).
// Includes a field-identity haystack fallback and boolean radio Yes/No semantics.
import {
  YN_EEO_HEADING_RE,
  YN_SENSITIVE_RE,
  YN_AUTOCOMPLETE_MAP,
  YN_LABEL_PATTERNS,
  YN_EARLIEST_START_EXCLUDE_RE,
  YN_PHONE_ADJUNCT_RE,
  YN_SKILL_EXPERIENCE_RE,
  ynProfileGet,
  ynIsUnconfirmed,
  ynValueUsable,
} from "./patterns.js";
import {
  ynGroupLegend,
  ynAriaLabelledByText,
  ynAriaDescribedByText,
  ynIdConventionLabel,
  ynLabelAttrOwnText,
  ynAncestorLabelAttrText,
  ynShadowHostSignalText,
  ynDataIdentityText,
  ynLabelText,
  ynHumanFieldLabel,
} from "./labels_a.js";
import {
  ynReportableFieldLabel,
  ynReportableGroupLabel,
  ynSanitizeIdentity,
  ynFieldIdentityRaw,
  ynFieldIdentitySignal,
  ynFieldQuestionText,
  ynInEeoSection,
  ynNearbyText,
  ynFieldKind,
} from "./labels_b.js";
import {
  ynMatchLabelPatterns,
  ynRefinePatternHit,
  ynMatchFieldIdentity,
  YN_DATE_FIELD_KEYS,
  ynDatePartRole,
  ynDateGroup,
  ynIsFactualQuestionKey,
  ynIsBooleanFieldKey,
  ynRadioOptionLabel,
  ynResolveBooleanRadio,
  ynResolveOptionRadio,
  ynClaimRadioGroup,
} from "./matching.js";
import {
  YN_QUESTION_STOPWORDS,
  YN_FINGERPRINT_STOPWORDS,
  ynNormaliseQuestionText,
  YN_QUESTION_FAMILIES,
  YN_CATEGORY_OF_FAMILY,
  YN_NEVER_REUSE_CATEGORIES,
  ynQuestionFamily,
  ynQuestionCategory,
  ynRowContainerOf,
  ynRowIndexFor,
} from "./questions.js";
import { ynHeuristicMapOneField } from "./native_scan_map.js";
import { ynHeuristicResolveAndEmit } from "./native_scan_emit.js";
import { ynHeuristicAriaChoiceIntents } from "./aria_scan.js";

/**
 * ynHeuristicIntents(profile, doc, alreadyClaimedEls:Set) → FillIntent[]
 *
 * The original single-file version ran this whole scan as one 700-line
 * function; it is unchanged in substance, only lifted into three pieces
 * (native_scan_map.js's per-field classifier, native_scan_emit.js's
 * per-field value resolver, aria_scan.js's ARIA choice-widget pass) because
 * the whole thing no longer fits the module size limit in one piece. This
 * orchestrator runs the native field loop exactly as before — classify,
 * then (only when classification found a mapping) resolve and emit — and
 * then the ARIA choice pass, sharing one context object across all three so
 * every read of profile/document_/claimed/intents/usedKeys/the row
 * containers sees the SAME state the single-file version's closures did.
 */
function ynHeuristicIntents(profile, doc, alreadyClaimedEls) {
  const document_ = doc || document;
  const claimed = alreadyClaimedEls || new Set();
  const intents = [];
  const usedKeys = new Set(); // one intent per profile key (best signal wins)
  // per-page row containers seen so far for each
  // repeatable array — see ynRowContainerOf/ynRowIndexFor.
  const workRowContainers = [];
  const eduRowContainers = [];

  // Full-page account step (URL / Create Account heading|button) → claim
  // nothing. Password walls are per-scope below — a login widget beside
  // guest-apply is NOT a page wall.
  const pageAccountWall =
    typeof ynPageIsAccountCreation === "function" &&
    ynPageIsAccountCreation(document_);
  if (pageAccountWall) {
    return [];
  }

  // Prefer deep query so open-shadow inputs are not missed.
  const fields =
    typeof ynQueryDeep === "function"
      ? ynQueryDeep(document_, "input, textarea, select")
      : [...document_.querySelectorAll("input, textarea, select")];

  const ctx = {
    profile,
    document_,
    claimed,
    intents,
    usedKeys,
    workRowContainers,
    eduRowContainers,
  };

  for (const el of fields) {
    const mapResult = ynHeuristicMapOneField(el, ctx);
    if (!mapResult) continue;
    ynHeuristicResolveAndEmit(el, mapResult, ctx);
  }

  ynHeuristicAriaChoiceIntents(ctx);

  return intents;
}

// Every name top-level in the original single-file version, restored on
// globalThis exactly as before the split — chrome.scripting still injects
// the built file into the same isolated world as its neighbours, so a
// bare name another shipped file already called is still there to call.
globalThis.YN_EEO_HEADING_RE = YN_EEO_HEADING_RE;
globalThis.YN_SENSITIVE_RE = YN_SENSITIVE_RE;
globalThis.YN_AUTOCOMPLETE_MAP = YN_AUTOCOMPLETE_MAP;
globalThis.YN_LABEL_PATTERNS = YN_LABEL_PATTERNS;
globalThis.YN_EARLIEST_START_EXCLUDE_RE = YN_EARLIEST_START_EXCLUDE_RE;
globalThis.YN_PHONE_ADJUNCT_RE = YN_PHONE_ADJUNCT_RE;
globalThis.YN_SKILL_EXPERIENCE_RE = YN_SKILL_EXPERIENCE_RE;
globalThis.ynProfileGet = ynProfileGet;
globalThis.ynIsUnconfirmed = ynIsUnconfirmed;
globalThis.ynValueUsable = ynValueUsable;
globalThis.ynAriaLabelledByText = ynAriaLabelledByText;
globalThis.ynAriaDescribedByText = ynAriaDescribedByText;
globalThis.ynIdConventionLabel = ynIdConventionLabel;
globalThis.ynLabelAttrOwnText = ynLabelAttrOwnText;
globalThis.ynAncestorLabelAttrText = ynAncestorLabelAttrText;
globalThis.ynShadowHostSignalText = ynShadowHostSignalText;
globalThis.ynDataIdentityText = ynDataIdentityText;
globalThis.ynLabelText = ynLabelText;
globalThis.ynHumanFieldLabel = ynHumanFieldLabel;
globalThis.ynReportableFieldLabel = ynReportableFieldLabel;
globalThis.ynReportableGroupLabel = ynReportableGroupLabel;
globalThis.ynSanitizeIdentity = ynSanitizeIdentity;
globalThis.ynGroupLegend = ynGroupLegend;
globalThis.ynFieldIdentityRaw = ynFieldIdentityRaw;
globalThis.ynFieldIdentitySignal = ynFieldIdentitySignal;
globalThis.ynFieldQuestionText = ynFieldQuestionText;
globalThis.ynInEeoSection = ynInEeoSection;
globalThis.ynNearbyText = ynNearbyText;
globalThis.ynFieldKind = ynFieldKind;
globalThis.ynMatchLabelPatterns = ynMatchLabelPatterns;
globalThis.ynRefinePatternHit = ynRefinePatternHit;
globalThis.ynMatchFieldIdentity = ynMatchFieldIdentity;
globalThis.YN_DATE_FIELD_KEYS = YN_DATE_FIELD_KEYS;
globalThis.ynDatePartRole = ynDatePartRole;
globalThis.ynDateGroup = ynDateGroup;
globalThis.ynIsFactualQuestionKey = ynIsFactualQuestionKey;
globalThis.ynIsBooleanFieldKey = ynIsBooleanFieldKey;
globalThis.ynRadioOptionLabel = ynRadioOptionLabel;
globalThis.ynResolveBooleanRadio = ynResolveBooleanRadio;
globalThis.ynResolveOptionRadio = ynResolveOptionRadio;
globalThis.ynClaimRadioGroup = ynClaimRadioGroup;
globalThis.YN_QUESTION_STOPWORDS = YN_QUESTION_STOPWORDS;
globalThis.YN_FINGERPRINT_STOPWORDS = YN_FINGERPRINT_STOPWORDS;
globalThis.ynNormaliseQuestionText = ynNormaliseQuestionText;
globalThis.YN_QUESTION_FAMILIES = YN_QUESTION_FAMILIES;
globalThis.YN_CATEGORY_OF_FAMILY = YN_CATEGORY_OF_FAMILY;
globalThis.YN_NEVER_REUSE_CATEGORIES = YN_NEVER_REUSE_CATEGORIES;
globalThis.ynQuestionFamily = ynQuestionFamily;
globalThis.ynQuestionCategory = ynQuestionCategory;
globalThis.ynRowContainerOf = ynRowContainerOf;
globalThis.ynRowIndexFor = ynRowIndexFor;
globalThis.ynHeuristicIntents = ynHeuristicIntents;
