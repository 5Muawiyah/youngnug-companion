// content/heuristics.js, part 1 of 8 - the pattern/regex tables (EEO,
// sensitive, autocomplete-token map, label-pattern ladder) and the
// small profile-value helpers everything else in this file reads
// through. See index.js for the file's full header and history.

// EEO / protected-characteristic section headings — never auto-answer.
export const YN_EEO_HEADING_RE =
  /equal opportunit|diversity|demographic|gender|ethnic|race|disability|veteran|sexual orientation/i;

// Sensitive questions — reported, never filled (outside EEO section too).
export const YN_SENSITIVE_RE =
  /criminal (record|conviction)|unspent conviction|rehabilitation of offenders|disab|health condition|adjustment|referee|reference contact/i;

// Spec-defined autocomplete tokens → profile path + confidence exact
export const YN_AUTOCOMPLETE_MAP = {
  "given-name": { key: "contact.first_name", kind: "text" },
  "family-name": { key: "contact.last_name", kind: "text" },
  "additional-name": { key: "contact.middle_name", kind: "text" },
  name: { key: "contact.full_name", kind: "text" },
  email: { key: "contact.email", kind: "text" },
  "tel-national": { key: "contact.phone", kind: "text" },
  "tel-local": { key: "contact.phone", kind: "text" },
  tel: { key: "contact.phone", kind: "text" },
  "street-address": { key: "address.line1", kind: "text" },
  "address-line1": { key: "address.line1", kind: "text" },
  "address-line2": { key: "address.line2", kind: "text" },
  "address-level2": { key: "address.city", kind: "text" },
  "address-level1": { key: "address.region", kind: "text" },
  "postal-code": { key: "address.postcode", kind: "text" },
  country: { key: "address.country", kind: "text" },
  "country-name": { key: "address.country", kind: "text" },
  url: { key: "links.portfolio", kind: "text" },
  "organization-title": { key: "work.0.title", kind: "text" },
  organization: { key: "work.0.employer", kind: "text" },
};

// Label / name / id / placeholder token patterns → guessed mapping
// Order matters: first match wins for a given signal string (most-specific-first).
// Synonym ALTERNATIONS ONLY, added to the
// EXISTING regexes below — no scoring, no distance, no new matching tier.
// heuristics.js:1-6's deterministic-first stance stands; this only widens
// what a deterministic rung already recognises. Vocabulary taken as an IDEA
// (no code copied) from harsimarsingh23/Autofill-Profile's SYNONYMS
// table (no licence — words only, never that project's matching code) and
// myowinthein/job-buddy's normalizer/mapper dictionary (MIT — same: the
// word list informed these additions, no function of it is reproduced here).
export const YN_LABEL_PATTERNS = [
  [
    /first\s*name|given\s*name|forename|christian\s*name/i,
    "contact.first_name",
    "text",
  ],
  [/last\s*name|family\s*name|surname|sur\s*name/i, "contact.last_name", "text"],
  // "^name$" alone missed the commonest plain-English label there is —
  // a bare "Your name". Anchored to the WHOLE signal so it still cannot
  // swallow "Username", "Company name" or "Employer's name".
  [/full\s*name|^\s*(your\s+)?name\s*$/i, "contact.full_name", "text"],
  [/e-?mail/i, "contact.email", "text"],
  // "contact number" is deliberately NOT added here: an "Emergency contact
  // number" field contains that exact phrase and must never receive the
  // student's OWN number (emergency-contact gating is a separate technique
  // not implemented here — this pattern must not make that gap
  // wider). "landline" carries no risk of that kind.
  [/phone|mobile|tel\b|cell|landline/i, "contact.phone", "text"],
  [
    /address\s*line\s*1|street\s*address|address\s*1|^address$|first\s*line\s*of\s*(your\s*)?address/i,
    "address.line1",
    "text",
  ],
  [
    /address\s*line\s*2|address\s*2|apt|suite|flat|second\s*line/i,
    "address.line2",
    "text",
  ],
  // \b so "ethnicity" / "electricity" never substring-match to city (an
  // ethnicity field previously matched on address.city here)
  [/\bcity\b|\btown\b|address.?level.?2/i, "address.city", "text"],
  [/post\s*code|postal|zip/i, "address.postcode", "text"],
  [/country|nation/i, "address.country", "text"],
  [/linked\s*in/i, "links.linkedin", "text"],
  [/github/i, "links.github", "text"],
  [/portfolio|personal\s*site|website|homepage/i, "links.portfolio", "text"],
  // Factual patterns (most-specific, above generic RTW/salary etc.)
  [
    /driving licen[cs]e|driver'?s?\s*licen[cs]e/i,
    "eligibility_extra.uk_driving_licence",
    "checkbox",
  ],
  [
    /willing to relocate|relocat/i,
    "eligibility_extra.willing_to_relocate",
    "checkbox",
  ],
  [
    /earliest .{0,20}start|available to start|start date/i,
    "answers.earliest_start",
    "text",
  ],
  [
    /years of experience|how many years|how much experience|level of .{0,20}experience/i,
    "derived.years_of_experience",
    "text",
  ],
  [
    /highest (level of )?(qualification|education)/i,
    "derived.highest_qualification",
    "text",
  ],
  [
    /right\s*to\s*work|eligible\s*to\s*work|work\s*authori[sz]/i,
    "right_to_work.uk_rtw",
    "checkbox",
  ],
  [
    /sponsor|visa\s*sponsor|require.{0,12}visa|need.{0,12}sponsor/i,
    "right_to_work.needs_sponsorship",
    "checkbox",
  ],
  [/notice\s*period|period\s*of\s*notice/i, "answers.notice_period", "text"],
  [
    /salary|compensation|expected\s*pay|pay\s*expect/i,
    "answers.salary_expectation",
    "text",
  ],
  // Education + work history. The profile has carried these for a long time
  // and only an ATS adapter ever reached them; the generic any-page rung
  // (ynFillAnyPage) is where they earn their keep, because a volunteering
  // form, a college application or a bursary form asks for exactly these and
  // has no adapter. Deliberately BELOW the factual block so
  // "highest level of qualification" keeps its derived answer, and
  // deliberately TIGHT: a bare /company/ or /role/ would claim "the company
  // you are applying to" and "the role you are applying for", which are the
  // same words meaning the opposite thing. A wrong answer there is worse
  // than a blank, so the employer/title patterns demand their own word.
  [
    /school|college|university|institution|place of (study|education)/i,
    "education.0.institution",
    "text",
  ],
  [
    /^\s*qualifications?\s*$|qualification (name|title|type)|^\s*degree\s*$|a-?levels?\b|btec/i,
    "education.0.qualification",
    "text",
  ],
  [
    /(current|most recent|previous|last|present)\s+employer|employer'?s?\s*name|^\s*employer\s*$|name\s*of\s*(your\s*|current\s*|last\s*|previous\s*)?employer/i,
    "work.0.employer",
    "text",
  ],
  [
    /job\s*title|position\s*title|role\s*title|(current|most recent|previous|last|present)\s+(job|role|position)\b/i,
    "work.0.title",
    "text",
  ],
  // Cover letter BEFORE free-text archetypes so letter fields stay letter_text
  [/cover\s*letter|motivation/i, "letter_text", "textarea"],
  // Free-text question archetypes (textarea/text only at emit time)
  [
    /why .{0,30}(fit|suit|good match|hire)/i,
    "generated:why_fit",
    "generated_text",
  ],
  [
    /why .{0,30}(join|work (for|at|here)|this (company|role)|us\b)|what attracts/i,
    "generated:why_company",
    "generated_text",
  ],
  [
    /(describe|tell us about) .{0,30}experience|experience (with|of|in)/i,
    "generated:experience_with",
    "generated_text",
  ],
  [/resume|curriculum|c\.?v\.?|upload.*(cv|resume)/i, "cv_file", "file"],
];

// DOB / employment-history dates must not map to earliest_start
export const YN_EARLIEST_START_EXCLUDE_RE = /birth|dob|history|previous|from|to$/i;
// Dial-code ADJUNCTS that sit beside a phone number and match /phone|tel/ but
// hold a country, not a number. Because one intent is emitted per profile key,
// an adjunct claiming contact.phone ORPHANS the real number field — live on
// Pinpoint, where <select name="…[phone_iso2]"> ("Phone country code") took
// contact.phone and the actual phone input was left blank.
export const YN_PHONE_ADJUNCT_RE =
  /iso2|country.?code|countryprefix|dial(l?ing)?.?code|area.?code/i;
// Skill-specific experience → free-text archetype, not years_of_experience
export const YN_SKILL_EXPERIENCE_RE = /experience (with|of|in) [a-z]/i;

export function ynProfileGet(profile, path) {
  if (!profile || !path) return undefined;
  // synthetic keys handled by the caller
  if (path === "contact.full_name") {
    const c = profile.contact || {};
    const joined = [c.first_name, c.last_name].filter(Boolean).join(" ");
    return joined || c.full_name || c.name || undefined;
  }
  if (path === "cv_file") {
    return profile.cv_url ? { file: "cv" } : undefined;
  }
  if (path === "letter_file") {
    return profile.letter_url ? { file: "letter" } : undefined;
  }
  if (path === "letter_text") {
    return profile.letter_text || undefined;
  }
  const parts = path.split(".");
  let cur = profile;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function ynIsUnconfirmed(profile, path) {
  const list = profile && profile.unconfirmed_answers;
  if (!Array.isArray(list)) return false;
  const bare = path.split(".").pop();
  return list.some((u) => u === path || u === bare || String(u).includes(bare));
}

export function ynValueUsable(val) {
  if (val == null || val === "") return false;
  if (typeof val === "string" && /\[CONFIRM/i.test(val)) return false;
  return true;
}
