// content/heuristics.js, part 5 of 8 - question-family
// classification (a DOM-free mirror of the server's question fingerprint)
// and the row-aware grouping helpers a repeated work/education block
// needs. See index.js for the file's full header and history.

// ─── question families ──────────────────────────────────
// A pure, DOM-free classifier from a raw question STRING to a family id, so
// the same question asked in different words on two employers or two ATSs
// is recognised as one question (the server-side answer bank
// mirrors this exact function so the two can never quietly disagree about
// what counts as the same question). NOT wired into the matching/fill
// pipeline in this file — a family is a classification only, never a
// value, and the existing "how did you hear about us" field stays
// deliberately unfilled by ynHeuristicIntents (pinned by
// run_generic_fill.mjs's "'how did you hear' not guessed at" check).
// Idea (no code copied) from
// https://github.com/Kerrylala/resume_jobs_quick_apply/blob/22d0ee7d8391dc297346c3ed9f810082b5daf353/extensions/application_assistant/executor_core.js#L845-L904
// (MIT): the QUESTION_FAMILIES / stopword-stripped whole-word-containment
// idea; the stopword list and the three families below are a fresh rewrite
// for this profile's own field set (that file's own family list is far
// larger and US-market-shaped; British-forms coverage is the synonym-
// alternations row's job, not this one's).
export const YN_QUESTION_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "do",
  "does",
  "did",
  "you",
  "your",
  "yours",
  "i",
  "we",
  "us",
  "our",
  "this",
  "that",
  "these",
  "those",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "and",
  "or",
  "please",
  "kindly",
  "may",
  "can",
  "will",
  "would",
  "could",
  "should",
  "have",
  "has",
  "had",
  "be",
  "it",
  "its",
  "if",
]);

// lifted from https://github.com/Kerrylala/resume_jobs_quick_apply/blob/22d0ee7d8391dc297346c3ed9f810082b5daf353/extensions/application_assistant/executor_core.js#L845-L904 (MIT), adapted
// (three family patterns and the category-name vocabulary only — see
// the server's question fingerprint's own docstring for exactly which; the
// eleven other families are this project's own extension)
//
// The SAME rule as the server's question fingerprint, mirrored here so the
// content script can identify a question the same way the answer bank does
// before it ever reaches the server. FNV-1a 64-bit over normalised question
// text + control type + sorted options — never a DOM id, never option
// order — so the same question on two employers (or two ATSs) fingerprints
// identically. See the server's question fingerprint's own file-ownership note
// for why this mirror exists and what it must be checked against.
export const YN_FINGERPRINT_STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "is", "are", "do", "does",
  "you", "your", "this", "that", "us", "we", "our", "did", "will", "would",
  "or",
]);

export function ynNormaliseQuestionText(text) {
  const words = String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.filter((w) => !YN_FINGERPRINT_STOPWORDS.has(w)).join(" ");
}
export const YN_QUESTION_FAMILIES = [
  ["q_hear_about_us", /\b(hear about (us|this (role|job|position|vacancy))|find (this|the) (role|job|position|vacancy)|find (us|this vacancy)|source of (this )?(application|vacancy))\b/i],
  ["q_notice_period", /\bnotice period\b|\b(how (much|long)|what) notice\b|\bnotice (must|do) you (give|need)\b/i],
  ["q_why_company", /\bwhy (this company|work (for|at|here)|(do you want to )?join us|do you want to work (for|at|here))\b|what attracts you/i],
  ["q_why_interested", /\bwhy (do you want|you want|are you interested|this role|apply)\b/i],
  ["q_salary_expectation", /\bsalary expectation|expected salary|desired salary\b/i],
  ["q_start_date", /\b(earliest|available) start date|when (can|could) you start\b/i],
  ["q_work_authorisation", /\b(right to work|authoris|authoriz|eligible to work)\b/i],
  ["q_sponsorship", /\bsponsorship|\bvisa\b/i],
  ["q_relocation", /\brelocat/i],
  ["q_background_check", /\bbackground check|criminal (record|conviction|offence|offense)|\bconvicted\b/i],
  ["q_eeo_ethnicity", /\b(hispanic|latino|latina|ethnicit|\brace\b)/i],
  ["q_eeo_gender", /\b(gender identity|self[- ]identify.*gender)\b/i],
  ["q_eeo_disability", /\bdisab/i],
  ["q_eeo_veteran", /\bveteran\b/i],
];

export const YN_CATEGORY_OF_FAMILY = {
  q_salary_expectation: "salary",
  q_start_date: "start_date",
  q_work_authorisation: "authorisation",
  q_sponsorship: "sponsorship",
  q_relocation: "relocation",
  q_background_check: "background_check",
  q_eeo_ethnicity: "eeo",
  q_eeo_gender: "eeo",
  q_eeo_disability: "eeo",
  q_eeo_veteran: "eeo",
};

export const YN_NEVER_REUSE_CATEGORIES = new Set([
  "eeo", "sponsorship", "authorisation", "salary", "relocation",
  "start_date", "background_check",
]);

export function ynQuestionFamily(text) {
  const q = String(text || "");
  // An empty question is not a question: no family, so nothing can be reused
  // against it (the server mirror returns None for the same input).
  if (!ynNormaliseQuestionText(q)) return null;
  for (const [name, pattern] of YN_QUESTION_FAMILIES) {
    if (pattern.test(q)) return name;
  }
  return "q_general";
}

export function ynQuestionCategory(family) {
  return YN_CATEGORY_OF_FAMILY[family] || "general";
}

// ─── row-aware grouping ─────────────────────────────────
// One intent per profile key per page (usedKeys, below) is right for a
// FLAT form — a second "First name" input is a mistake, not a second
// person. It is wrong for a REPEATED block: a second "Company" input two
// rows down in an already-rendered experience table is work.1.employer,
// not a duplicate of work.0.employer. This tells the two cases apart by
// asking whether the field sits in a recognisably repeated ROW.

/**
 * The nearest ancestor that looks like ONE ROW of a repeated block: a
 * table row, a list item, or an element carrying a class token naming it
 * as such (row/entry/item — case-insensitive, so "ExperienceRow",
 * "entry-2" and "repeater__item" all match). Bounded to a single
 * `closest()` walk; null when no such ancestor exists, which keeps a flat
 * form's fields on today's EXACT dedup behaviour — this only widens what a
 * genuinely repeated block can do, it never narrows the flat-form case.
 */
export function ynRowContainerOf(el) {
  if (!el || !el.closest) return null;
  try {
    return (
      el.closest(
        'tr, li, [class*="row" i], [class*="entry" i], [class*="item" i]',
      ) || null
    );
  } catch {
    return null;
  }
}

/** The 0-based index of `container` among the row containers seen so far
 * for one array (work/education), assigning the next index the first time
 * a given container is seen. Two different profile keys (employer, title)
 * whose fields sit in the SAME row container get the SAME index. */
export function ynRowIndexFor(containers, container) {
  let idx = containers.indexOf(container);
  if (idx === -1) {
    containers.push(container);
    idx = containers.length - 1;
  }
  return idx;
}
