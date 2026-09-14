// content/capture.js — the three highest-trust single-advert readers: the
// ld+json JobPosting rung, Indeed's /viewjob (and its open-pane variant),
// and LinkedIn's /jobs/view (plus its own open-pane variant on /jobs/search
// and /jobs/collections). These read in the order ynMergeJob (see
// generic_and_dev.js) tries them: an ld+json hit beats a DOM read beats a
// guess, per field.
import { ynHtmlToText, ynLdLocationText, ynLdSalaryText, ynVisibleText, ynTidyBlock } from "./text.js";

// Rung 1: a JobPosting in ld+json. Unparseable JSON or a block of some other
// @type is simply not a hit — the next rung answers instead.
function ynLdJobPosting() {
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try {
      data = JSON.parse(s.textContent);
    } catch (e) {
      continue;
    }
    const nodes = Array.isArray(data) ? data : [data, ...(data && data["@graph"] ? data["@graph"] : [])];
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const type = n["@type"];
      if (type !== "JobPosting" && !(Array.isArray(type) && type.includes("JobPosting"))) continue;
      return {
        title: typeof n.title === "string" ? n.title.trim() : "",
        // hiringOrganization is USUALLY an Organization object ({name: "..."})
        // but Prospects.ac.uk ships it as a BARE STRING ("Sinara ") on its own
        // live ld+json, confirmed 2026-09-03 in a signed-out
        // browser — both forms are real schema.org JobPosting, and a schema-valid page
        // silently losing its employer to a shape this reader never expected
        // is exactly the kind of gap this rung exists to close.
        employer:
          typeof n.hiringOrganization === "string"
            ? n.hiringOrganization.trim()
            : n.hiringOrganization && typeof n.hiringOrganization.name === "string"
              ? n.hiringOrganization.name.trim()
              : "",
        description: ynHtmlToText(n.description),
        location: ynLdLocationText(n.jobLocation),
        salary: ynLdSalaryText(n.baseSalary),
      };
    }
  }
  return null;
}

// Rung 2a: Indeed /viewjob. The canonical URL is rebuilt from the jk key so
// two routes to the same advert dedupe server-side.
function ynIndeedViewJob() {
  if (!/(^|\.)indeed\./.test(location.hostname)) return null;
  // The advert Indeed is SHOWING, wherever it is showing it. Keying on
  // pathname alone meant this reader only fired on /viewjob, and Indeed opens
  // the same advert in a right-hand pane on /jobs and on the signed-in HOME
  // page — where the query carries vjk (or jk) and the path is bare "/".
  //
  // Found on production 2026-08-27. A real capture from uk.indeed.com/ filed
  // title "Welcome, Sam" (the site's greeting, taken from the only <h1>
  // on the page) and employer "Enterprise MobilityReading RG1 7DS" (two
  // fields with no separator), with url "https://uk.indeed.com/" — no job
  // identity at all, so the row could never dedupe or be reopened. The body
  // was right: 4,306 characters of the correct advert. Only the reader missed.
  //
  // This is the same shape as the LinkedIn open-pane reader below, which keys
  // off currentJobId rather than a path, and works.
  const q = new URLSearchParams(location.search);
  const jk = q.get("jk") || q.get("vjk");
  if (!location.pathname.startsWith("/viewjob") && !jk) return null;
  return {
    title: ynText(
      document.querySelector(
        'h1.jobsearch-JobInfoHeader-title, [data-testid="jobsearch-JobInfoHeader-title"]',
      ),
    ),
    employer: ynText(
      document.querySelector('[data-testid="inlineHeader-companyName"], [data-company-name]'),
    ),
    location: ynText(document.querySelector('[data-testid="inlineHeader-companyLocation"]')),
    description: ynTidyBlock(ynVisibleText(document.querySelector("#jobDescriptionText"))),
    salary: ynText(document.querySelector("#salaryInfoAndJobType")),
    url: jk ? location.origin + "/viewjob?jk=" + jk : "",
  };
}

// The advert body on LinkedIn: the visible "About the job" heading climbed
// to the first ancestor with a body's worth of text. Class names are
// obfuscated and rotating, so the visible heading is the only stable anchor.
// Shared by the /jobs/view reader and the /jobs/search open-pane reader —
// SERP cards carry no such heading, so finding one means an advert is open.
function ynAboutTheJobBody() {
  for (const h of document.querySelectorAll("h2")) {
    if (ynText(h) !== "About the job") continue;
    let el = h;
    while (el && el !== document.body && ynVisibleText(el).length <= 600) {
      el = el.parentElement;
    }
    return el ? ynTidyBlock(ynVisibleText(el)) : "";
  }
  return "";
}

// The top card's tertiary line, read from the page's RENDERED TEXT — the
// DOM around it is obfuscated-class only, but the line itself renders as
//   "<place> · 1 week ago · 49 applicants"
// (measured on the real signed-in /jobs/view page, pinned in
// yn_fixture_linkedin_jobview.json topText). First matching line wins; no
// match answers "" — never a guess.
function ynLinkedInTertiaryLocation() {
  const text = document.body ? ynVisibleText(document.body) : "";
  for (const rawLine of text.split("\n")) {
    const m = rawLine
      .trim()
      .match(/^(.{2,80}?)\s+·\s+(?:reposted\s+)?\d+\s+\w+\s+ago(?:\s+·|$)/i);
    if (m) return m[1].trim();
  }
  return "";
}

// Rung 2b: LinkedIn /jobs/view. No h1 exists and every class name is
// obfuscated and rotating, so only stable reads are used: the tab title
// ("Title | Company | LinkedIn"), the first company-page link, the
// About-the-job climb, and the rendered tertiary line for the location.
function ynLinkedInJobView() {
  if (!/(^|\.)linkedin\.com$/.test(location.hostname)) return null;
  if (!location.pathname.startsWith("/jobs/view/")) return null;
  const parts = (document.title || "").split(" | ");
  return {
    title: (parts[0] || "").trim(),
    employer:
      ynText(document.querySelector('a[href*="/company/"]')) ||
      (parts.length >= 3 ? parts[parts.length - 2].trim() : ""),
    description: ynAboutTheJobBody(),
    location: ynLinkedInTertiaryLocation(),
    url: location.origin + location.pathname,
  };
}

// The advert the student is READING on LinkedIn's default browsing surface:
// /jobs/search?currentJobId=NNN (and /jobs/collections) render the open
// advert in a right pane beside the cards. Before this read existed the SERP
// branch captured thin cards (description "") while a full body sat open on
// screen. Fields come from the reads each real fixture already proves:
// title/employer/location from the card whose data-job-id is the open
// advert (aria-label link, lockup subtitle, caption — the SERP card shapes),
// the body from the About-the-job climb (the /jobs/view shape), the URL
// rebuilt canonically from currentJobId. No open readable advert -> null,
// and the SERP fallback captures the cards exactly as before.
function ynLinkedInOpenPaneJob() {
  if (!/(^|\.)linkedin\.com$/.test(location.hostname)) return null;
  if (
    !location.pathname.startsWith("/jobs/search") &&
    !location.pathname.startsWith("/jobs/collections")
  ) {
    return null;
  }
  const id = new URLSearchParams(location.search).get("currentJobId");
  if (!id || !/^\d+$/.test(id)) return null;
  const body = ynAboutTheJobBody();
  if (!body) return null;
  let title = "";
  let employer = "";
  let loc = "";
  const card = document.querySelector('[data-job-id="' + id + '"]');
  if (card) {
    const link = card.querySelector('a[href*="/jobs/view/"]');
    title = link
      ? (link.getAttribute("aria-label") || "")
          .replace(/\s+with verification$/i, "")
          .trim() || ynText(link.querySelector("strong"))
      : "";
    employer = ynText(card.querySelector(".artdeco-entity-lockup__subtitle"));
    loc = ynText(card.querySelector(".artdeco-entity-lockup__caption li"));
  }
  if (!title) {
    // The card may have virtualised away; any mounted link to this advert
    // (the pane's own title link included) still names it.
    for (const a of document.querySelectorAll(
      'a[href*="/jobs/view/' + id + '"]',
    )) {
      const t =
        (a.getAttribute("aria-label") || "")
          .replace(/\s+with verification$/i, "")
          .trim() || ynText(a);
      if (t) {
        title = t;
        break;
      }
    }
  }
  if (!title) return null; // nothing honest to head the row — SERP fallback
  return {
    title,
    employer,
    location: loc || ynLinkedInTertiaryLocation(),
    description: body,
    url: location.origin + "/jobs/view/" + id + "/",
  };
}

export {
  ynLdJobPosting,
  ynIndeedViewJob,
  ynAboutTheJobBody,
  ynLinkedInTertiaryLocation,
  ynLinkedInJobView,
  ynLinkedInOpenPaneJob,
};
