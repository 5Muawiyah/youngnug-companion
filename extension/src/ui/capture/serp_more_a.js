// content/capture.js — SERP readers, part 2: CV-Library, Guardian Jobs,
// TotalJobs/Milkround, SimplyHired. See serp_uk_boards.js's header for the
// shared contract (an array of cards already mounted in the DOM, or null).

// Results page, CV-Library: one job per rendered job-card panel, keyed off
// the site's own data-qa attributes — confirmed on a live page 2026-08-31 that data-qa
// (not data-testid, which the site uses only on its header chrome) is what
// CV-Library puts on every card and every field inside it. A real search
// (the server's cv_library search's own ?q=&geo= entry point) redirects to
// a "pretty" slug the mapper never builds itself (e.g.
// /apprentice-jobs-in-manchester), so this reader does NOT match on
// pathname — a slug this module cannot predict would silently miss every
// real search. It matches on the page's own [data-testid="job-search-page"]
// marker instead, which was confirmed present on that results page
// regardless of the slug. A real card (trimmed):
//   <div data-qa="job-card-1" itemscope itemtype="https://schema.org/ListItem">
//     <h2 data-qa="external-type-job-title-1">
//       <a href="/job/225517306/laboratory-apprentice" data-qa="job-title-link">
//         Laboratory <mark>Apprentice</mark></a></h2>
//     <p>Posted <time>20/08/2026</time> by
//       <span data-qa="job-card-company-link-1">Saint Gobain</span></p>
//     <div data-qa="job-card-location-1">Dukinfield, Greater Manchester (6 miles away)</div>
//   </div>
// The title link's own data-qa value carries a per-card suffix that also
// varies by APPLY TYPE ("external-type-job-title-1" vs
// "email-type-job-title-5" on two real cards) — never matched directly.
// Only the constant data-qa="job-title-link" on the anchor itself, and
// attribute-PREFIX lookups (job-card-company-link-, job-card-location-,
// job-card-salary-) scoped inside the one card being read, are trusted; the
// numeric suffix on those is never hard-coded to a single card's number.
// Salary only exists as its own data-qa on some cards (confirmed live on
// card 5, "£60 - £75 per day" — absent on card 1), so it folds into the
// description exactly like every other SERP reader here: present when
// found, never invented when it is not.
function ynCvLibrarySerpJobs() {
  if (!/(^|\.)cv-library\.co\.uk$/i.test(location.hostname)) return null;
  if (!document.querySelector('[data-testid="job-search-page"]')) return null;
  const jobs = [];
  for (const card of document.querySelectorAll('[data-qa^="job-card-"]')) {
    if (!/^job-card-\d+$/.test(card.getAttribute("data-qa") || "")) continue;
    const link = card.querySelector('[data-qa="job-title-link"]');
    if (!link) continue;
    const title = ynText(link);
    if (!title) continue;
    const employer = ynText(card.querySelector('[data-qa^="job-card-company-link-"]'));
    const place = ynText(card.querySelector('[data-qa^="job-card-location-"]'));
    const salary = ynText(card.querySelector('[data-qa^="job-card-salary-"]'));
    let url = link.getAttribute("href") || "";
    try {
      url = new URL(url, location.origin).toString();
    } catch {
      continue; // an unresolvable href is not an advert we can store
    }
    jobs.push({
      title,
      employer,
      location: place,
      url,
      source: "capture:" + location.hostname,
      description: salary ? "Salary: " + salary : "",
      mode: "serp",
    });
  }
  return jobs;
}

// Results page, Guardian Jobs: one job per <li class="lister__item">.
// Confirmed live 2026-08-31: this site carries ZERO data-testid/data-test/
// data-qa attributes anywhere on the page (checked directly) — no
// design-system test hooks exist to key off at all, unlike every other
// reader in this file. What it has instead is its own readable BEM class
// naming for the results list (lister__item, lister__meta-item--location,
// lister__meta-item--salary, lister__meta-item--recruiter) — plain,
// semantic, and confirmed identical across two different result sets (a
// /searchjobs/?Keywords= search and the /jobs/graduate/ section page the
// mapper's `level` filter also builds), never an auto-generated/hashed
// class. A real card (trimmed):
//   <li class="lister__item ..." id="item-10172012">
//     <h3 class="lister__header"><a href="/job/10172012/finance-assistant/"
//        class="js-clickable-area-link"><span>Finance Assistant</span></a></h3>
//     <ul class="lister__meta">
//       <li class="lister__meta-item lister__meta-item--location">London, UK (Wallace Collection)</li>
//       <li class="lister__meta-item lister__meta-item--salary">The salary for this post is between £30,800 to £31,400 per annum...</li>
//       <li class="lister__meta-item lister__meta-item--recruiter">WALLACE COLLECTION</li>
//     </ul>
//   </li>
// The title link's href renders with leading/trailing whitespace and line
// breaks around it on the live page (seen verbatim: `href=" \n\t/job/...\n\n\n\n"`),
// so it is always resolved through `new URL(...)` rather than concatenated,
// exactly like every other reader's URL here.
function ynGuardianJobsSerpJobs() {
  if (!/(^|\.)jobs\.theguardian\.com$/i.test(location.hostname)) return null;
  if (
    !/^\/searchjobs\//.test(location.pathname) &&
    !/^\/jobs\/(apprenticeships|graduate|entry-level)\//.test(location.pathname)
  ) {
    return null;
  }
  const jobs = [];
  for (const card of document.querySelectorAll("li.lister__item")) {
    const link = card.querySelector(".lister__header a");
    if (!link) continue;
    const title = ynText(link);
    if (!title) continue;
    const employer = ynText(card.querySelector(".lister__meta-item--recruiter"));
    const place = ynText(card.querySelector(".lister__meta-item--location"));
    const salary = ynText(card.querySelector(".lister__meta-item--salary"));
    let url = link.getAttribute("href") || "";
    try {
      url = new URL(url.trim(), location.origin).toString();
    } catch {
      continue; // an unresolvable href is not an advert we can store
    }
    jobs.push({
      title,
      employer,
      location: place,
      url,
      source: "capture:" + location.hostname,
      description: salary ? "Salary: " + salary : "",
      mode: "serp",
    });
  }
  return jobs;
}

// Results page, TotalJobs: one job per [data-testid="job-item"] <article>.
// Tried live 2026-08-31 expecting the Akamai Bot Manager challenge
// (?bm-verify=, blank page) a dev-side fetch hit earlier the same day — a
// real browser tab loading https://www.totaljobs.com/jobs/apprentice
// rendered the actual results page instead, no challenge, no interstitial.
// The card and every field on it carry the site's own test hooks: job cards
// use data-testid (job-item, job-item-title), the fields inside a card use
// a second, sibling attribute the site also puts on real nodes only
// (data-at="job-item-company-name" / "job-item-location" /
// "job-item-salary-info") - never the res-xxxxxx classes alongside them,
// which are build-hashed CSS module classes and change on every deploy. A
// real card (trimmed, SVG icons removed):
//   <article data-testid="job-item" id="job-item-107910623">
//     <a href="/job/production-apprentice/stada-thornton-ross-job107910623"
//        data-testid="job-item-title">Production Apprentice</a>
//     <span data-at="job-item-company-name">STADA Thornton &amp; Ross</span>
//     <span data-at="job-item-location">Linthwaite, Huddersfield (HD7), HD7 5QH</span>
//     <span data-at="job-item-salary-info">To define</span>
//   </article>
// "To define" above is TotalJobs' own placeholder text for an unstated
// salary, captured verbatim rather than treated as empty - it is what the
// card actually says, not a guess. As with CV-Library, the results page
// lives at an unpredictable slug (/jobs/apprentice, /jobs/in-london, ...),
// so this matches on the [data-testid="job-item"] marker itself rather than
// a pathname this module cannot enumerate.
//
// Confirmed on a live page 2026-09-03: Milkround
// (www.milkround.com/jobs) is the Stepstone group's own re-badging of this
// exact board — same [data-testid]/[data-at] markers, confirmed live —
// whose title link points AT totaljobs.com rather than milkround.com. A
// Milkround capture therefore stores a totaljobs.com advert URL and dedupes
// correctly against a Totaljobs capture of the same advert; only the
// hostname test below is extended, never the field reading, and the row
// still stamps capture:www.milkround.com (its own host, read at the top of
// ynCaptureCurrent) — the SOURCE of the capture, not the advert's own URL.
function ynTotalJobsSerpJobs() {
  if (!/(^|\.)(totaljobs\.com|milkround\.com)$/i.test(location.hostname)) return null;
  if (!document.querySelector('[data-testid="job-item"]')) return null;
  const jobs = [];
  for (const card of document.querySelectorAll('[data-testid="job-item"]')) {
    const link = card.querySelector('[data-testid="job-item-title"]');
    if (!link) continue;
    const title = ynText(link);
    if (!title) continue;
    const employer = ynText(card.querySelector('[data-at="job-item-company-name"]'));
    const place = ynText(card.querySelector('[data-at="job-item-location"]'));
    const salary = ynText(card.querySelector('[data-at="job-item-salary-info"]'));
    let url = link.getAttribute("href") || "";
    try {
      url = new URL(url, location.origin).toString();
    } catch {
      continue; // an unresolvable href is not an advert we can store
    }
    jobs.push({
      title,
      employer,
      location: place,
      url,
      source: "capture:" + location.hostname,
      description: salary ? "Salary: " + salary : "",
      mode: "serp",
    });
  }
  return jobs;
}

// Results page, SimplyHired: one job per mounted [data-testid="searchSerpJob"]
// card. This is the reader that closes a real production defect: with NO
// SimplyHired handler at all, a results page fell through to the generic
// single-advert guesser (ynGuessJob below), which stored the page's own h1
// — "retail assistant jobs in croydon", the SEARCH QUERY, not a job title
// — as the job title, and the filter rail ("Sort
// byRelevanceDateDistance25 milesJob TypeAll Job TypesMinimum SalaryAll
// salaries...") as the job body. Verified live 2026-09-01 on
// https://www.simplyhired.co.uk/search?q=retail+assistant&l=croydon — the
// exact query/location from a screenshot of that defect, which
// reproduced it. A real card (trimmed; the tracking-heavy
// data-mdref attribute, the star-rating SVG and the requirement/benefit
// chips removed):
//   <div data-jobkey="<opaque site-issued id>"
//        data-testid="searchSerpJob">
//     <h2 data-testid="searchSerpJobTitle">
//       <a href="/job/<same opaque id>"
//          data-mdref="/job/<same id>?isp=1&jobCardTrackingKey=...">
//         Sales / Yard Assistant</a></h2>
//     <p><span data-testid="companyName">Alsford Timber</span>&nbsp;—
//        <span data-testid="searchSerpJobLocation">London</span>...</p>
//     <div data-testid="variant3-allChips"><div><ul>
//       <li><span data-testid="salaryChip-0">£27,760 - £30,000 a year</span></li>
//       ...</ul></div></div>
//   </div>
// The anchor's OWN href attribute is already the clean canonical path with
// no tracking params (confirmed identical across every card checked live);
// data-jobkey duplicates the same id and data-mdref is the tracking-heavy
// analytics wrapper link — never read here, the same rule every other
// reader in this file follows of trusting the site's plain link over its
// own tracking wrapper. Sponsored ("Ad") cards share this exact markup
// with organic ones and are not excluded — they are still real postings,
// same as Indeed's "Urgently needed" cards above.
function ynSimplyHiredSerpJobs() {
  if (!/(^|\.)simplyhired\.(co\.uk|com)$/i.test(location.hostname)) return null;
  if (!/^\/search\b/.test(location.pathname)) return null;
  const jobs = [];
  for (const card of document.querySelectorAll('[data-testid="searchSerpJob"]')) {
    const link = card.querySelector('[data-testid="searchSerpJobTitle"] a');
    if (!link) continue;
    const title = ynText(link);
    if (!title) continue;
    const employer = ynText(card.querySelector('[data-testid="companyName"]'));
    const jobLocation = ynText(
      card.querySelector('[data-testid="searchSerpJobLocation"]'),
    );
    const salary = ynText(card.querySelector('[data-testid^="salaryChip-"]'));
    let url = link.getAttribute("href") || "";
    try {
      url = new URL(url, location.origin).toString();
    } catch {
      continue; // an unresolvable href is not an advert we can store
    }
    jobs.push({
      title,
      employer,
      location: jobLocation,
      url,
      source: "capture:" + location.hostname,
      description: salary ? "Salary: " + salary : "",
      mode: "serp",
    });
  }
  return jobs;
}

export {
  ynCvLibrarySerpJobs,
  ynGuardianJobsSerpJobs,
  ynTotalJobsSerpJobs,
  ynSimplyHiredSerpJobs,
};
