// content/detect.js — ATS detection: URL signature first, DOM fingerprint tiebreak.
// unknown is a first-class honest answer (heuristics rung runs alone).


// URL signatures (the known applicant-tracking platforms and their hosts). Checked in order.
const YN_ATS_URL_RULES = [
  {
    id: "greenhouse",
    name: "Greenhouse",
    urls: [
      /^https:\/\/boards\.greenhouse\.io\//i,
      // job-boards ships regional hosts too (job-boards.eu.greenhouse.io is
      // where the corpus's freshest Greenhouse advert lives) — one optional
      // region label, not a free-for-all subdomain match.
      /^https:\/\/job-boards(?:\.[a-z]{2})?\.greenhouse\.io\//i,
    ],
    // Greenhouse-SPECIFIC markers only. #application-form was too generic —
    // Lever's form carries the same id (confirmed on a live Lever posting), and random employer
    // sites use it too, so it would misdetect a non-Greenhouse page as
    // Greenhouse (caught by the fill test lane). Key on the Greenhouse embed
    // container / a greenhouse action instead. This fingerprint is only a
    // tiebreak when the URL signature did not already match greenhouse.io.
    fingerprint: (doc) =>
      !!doc.querySelector(
        "#grnhse_app, [id*='greenhouse'], form[action*='greenhouse'], form[action*='grnhse']",
      ),
  },
  {
    id: "lever",
    name: "Lever",
    urls: [/^https:\/\/jobs\.lever\.co\//i],
    // Lever-SPECIFIC markers only — the same lesson the Greenhouse comment
    // above records, learned again live. A bare `.application-form` is not a
    // Lever marker: Personio's apply page carries one too, so every Personio
    // fill was detected as Lever and the overlay told the student "Filling a
    // Lever application" on a Personio form. Naming the wrong system is a
    // small lie in the one place the user is deciding whether to trust us.
    fingerprint: (doc) =>
      !!doc.querySelector(
        ".postings-btn, form[action*='lever'], [class*='lever-'], " +
          "input[name='urls[LinkedIn]'], .application-question[data-qa]",
      ),
  },
  {
    // Personio hosted apply pages ({tenant}.jobs.personio.com/job/{id}?apply);
    // fields are #field-<name>. No adapter — the generic heuristics map it
    // correctly — but it must still be NAMED correctly.
    id: "personio",
    name: "Personio",
    urls: [/^https:\/\/[^/]*\.jobs\.personio\.(com|de)\//i],
    fingerprint: (doc) =>
      !!doc.querySelector(
        "#field-first_name, [id^='field-'][name^='job_application'], " +
          "form[action*='personio']",
      ),
  },
  {
    // Pinpoint hosted postings ({tenant}.pinpointhq.com/.../applications/new);
    // fields are #application_form_application_<name>.
    id: "pinpoint",
    name: "Pinpoint",
    urls: [/^https:\/\/[^/]*\.pinpointhq\.com\//i],
    fingerprint: (doc) =>
      !!doc.querySelector(
        "#application_form_application_first_name, " +
          "form[action*='pinpointhq'], [id^='application_form_application_']",
      ),
  },
  {
    id: "ashby",
    name: "Ashby",
    urls: [/^https:\/\/jobs\.ashbyhq\.com\//i],
    fingerprint: (doc) =>
      !!doc.querySelector(
        "form[class*='ashby'], [class*='ashby'], #ashby_embed",
      ),
  },
  {
    id: "smartrecruiters",
    name: "SmartRecruiters",
    urls: [
      /^https:\/\/jobs\.smartrecruiters\.com\//i,
      /^https:\/\/careers\.smartrecruiters\.com\//i,
    ],
    fingerprint: (doc) =>
      !!doc.querySelector(
        "[class*='smartrecruiters'], form[action*='smartrecruiters']",
      ),
  },
  {
    id: "icims",
    name: "iCIMS",
    urls: [/^https:\/\/[^/]*\.icims\.com\//i],
    fingerprint: (doc) =>
      !!doc.querySelector(
        "[class*='iCIMS'], [id*='icims'], form[action*='icims']",
      ),
  },
  {
    id: "taleo",
    name: "Taleo",
    urls: [/^https:\/\/[^/]*\.taleo\.net\//i],
    fingerprint: (doc) =>
      !!doc.querySelector(
        "[id*='taleo'], [class*='taleo'], form[action*='taleo']",
      ),
  },
  {
    id: "workday",
    name: "Workday",
    urls: [/^https:\/\/[^/]*\.myworkdayjobs\.com\//i],
    fingerprint: (doc) =>
      !!doc.querySelector("[data-automation-id], [data-automation-id] *"),
  },
  {
    // Custom Teamtailor career domains (non-*.teamtailor.com) are OUT OF SCOPE
    // this wave — only the platform host is in the manifest matches.
    id: "teamtailor",
    name: "Teamtailor",
    urls: [/^https:\/\/[^/]*\.teamtailor\.com\//i],
    fingerprint: (doc) =>
      !!doc.querySelector(
        "turbo-frame#application_form, #job-application-form, #candidate_first_name, #upload_resume_field",
      ),
  },
  {
    // Custom Recruitee career domains (non-*.recruitee.com) are OUT OF SCOPE
    // this wave for URL injection; DOM fingerprint still helps when the form
    // is embedded and the host is not recruitee.com (ambiguity refusal holds).
    id: "recruitee",
    name: "Recruitee",
    urls: [/^https:\/\/[^/]*\.recruitee\.com\//i],
    fingerprint: (doc) => !!doc.querySelector("#offer-application-form"),
  },
  {
    // Hosted apply pages only (apply.workable.com/{account}/j/{shortcode}).
    // Custom Workable career domains (hasCustomDomain tenants) are OUT OF
    // SCOPE for now — same stance as Teamtailor/Recruitee. Fingerprint keys
    // on Workable's own data-ui conventions + the platform meta tag, not on
    // generic form markers (the Greenhouse #application-form lesson).
    id: "workable",
    name: "Workable",
    urls: [/^https:\/\/apply\.workable\.com\//i],
    fingerprint: (doc) =>
      !!doc.querySelector(
        'form[data-ui="application-form"], [data-ui="apply-button"], ' +
          'meta[name="domain"][content="workable.com"]',
      ),
  },
  {
    // Reed job pages. Signed out, "Apply now" redirects to Reed's own login
    // and the filler keeps the login-wall handoff (adapter.loginWall);
    // signed in, the same button opens an in-page modal the adapter fills
    // (cover letter text, and the About-you profile fields when empty).
    // Both states were read live in a signed-in session; no selector here
    // is guessed.
    id: "reed",
    name: "Reed",
    urls: [/^https:\/\/(?:www\.)?reed\.co\.uk\/jobs\//i],
    fingerprint: (doc) =>
      !!doc.querySelector(
        "button.redirectApply, button[data-qa='apply-btn'], [data-qa='apply-job-modal'], [data-qa='about-you-modal']",
      ),
  },
  {
    // LinkedIn jobs pages: Easy Apply is a modal on the listing, not a page.
    // The URL match covers the search and the job view; the adapter fills
    // only when the modal is open and otherwise asks for the click.
    id: "linkedin",
    name: "LinkedIn Easy Apply",
    urls: [/^https:\/\/(?:www\.)?linkedin\.com\/jobs\//i],
    fingerprint: (doc) =>
      !!doc.querySelector(
        ".jobs-easy-apply-modal[role='dialog'], [data-easy-apply-next-button]",
      ),
  },
  {
    // Indeed Apply runs on its own origin, one page per wizard step.
    id: "indeed",
    name: "Indeed Apply",
    urls: [/^https:\/\/smartapply\.indeed\.com\//i],
    fingerprint: (doc) =>
      !!doc.querySelector(
        "[data-testid='contact-info-page'], #mosaic-contactInfoModule, .ia-BasePage",
      ),
  },
];

/**
 * ynDetectAts() → { id, name, confidence, assistOnly? }
 * confidence: "url" | "dom" | "unknown"
 * assistOnly: true when the match is a WALL / login handoff (no fill adapter).
 * No shipped rule sets it today (Reed's wall moved into its adapter as
 * loginWall, because the signed-in form turned out to be fillable); the
 * flag stays honoured so a future wall-only site can still declare one.
 */
function ynDetectAts(doc, href) {
  const document_ = doc || document;
  const url = href || (typeof location !== "undefined" ? location.href : "");

  // 1. URL signature
  for (const rule of YN_ATS_URL_RULES) {
    if (rule.urls.some((re) => re.test(url))) {
      const out = {
        id: rule.id,
        name: rule.name,
        confidence: "url",
      };
      if (rule.assistOnly) out.assistOnly = true;
      return out;
    }
  }

  // 2. DOM-fingerprint tiebreak (when the URL is an employer host embedding
  //    an ATS, or a redirect left us without a signature match)
  let domHit = null;
  for (const rule of YN_ATS_URL_RULES) {
    try {
      if (rule.fingerprint && rule.fingerprint(document_)) {
        if (domHit) {
          // two fingerprints match — refuse to guess
          return {
            id: "unknown",
            name: "an unknown system",
            confidence: "unknown",
          };
        }
        domHit = rule;
      }
    } catch {
      /* probe threw — treat as no match for this rule */
    }
  }
  if (domHit) {
    const out = {
      id: domHit.id,
      name: domHit.name,
      confidence: "dom",
    };
    if (domHit.assistOnly) out.assistOnly = true;
    return out;
  }

  // 3. Honest unknown
  return {
    id: "unknown",
    name: "an unknown system",
    confidence: "unknown",
  };
}

// ─── Employer-side posting detection (employers.indeed.com) ─────────────────
// DELIBERATELY separate from YN_ATS_URL_RULES: those rules feed the CANDIDATE
// fill flow (ynDetectAts → filler.js), and the employer posting flow must
// never be mistaken for a job application — different payload, different
// guard vocabulary, different report. URL-keyed only: the posting wizard
// lives behind the employer login, so there is no reliable public DOM
// fingerprint to cite, and a URL signature cannot mis-fire on a candidate
// page (candidate Indeed is uk.indeed.com / www.indeed.com, never
// employers.indeed.com).
const YN_EMPLOYER_POSTING_URL_RULES = [
  {
    id: "indeed_employer",
    name: "Indeed employer posting",
    urls: [/^https:\/\/employers\.indeed\.com\//i],
  },
];

/**
 * ynDetectEmployerPosting() → { id, name, confidence: "url" } or null.
 * null = not an employer posting surface; the posting flow refuses to run.
 */
function ynDetectEmployerPosting(doc, href) {
  const url = href || (typeof location !== "undefined" ? location.href : "");
  for (const rule of YN_EMPLOYER_POSTING_URL_RULES) {
    if (rule.urls.some((re) => re.test(url))) {
      return { id: rule.id, name: rule.name, confidence: "url" };
    }
  }
  return null;
}
// Every name top-level in the original single-file version, exposed on
// globalThis exactly as before the move — chrome.scripting still injects
// the built file into the same isolated world as its neighbours, so a
// bare name another shipped file already called is still there to call.
globalThis.YN_ATS_URL_RULES = YN_ATS_URL_RULES;
globalThis.ynDetectAts = ynDetectAts;
globalThis.YN_EMPLOYER_POSTING_URL_RULES = YN_EMPLOYER_POSTING_URL_RULES;
globalThis.ynDetectEmployerPosting = ynDetectEmployerPosting;
