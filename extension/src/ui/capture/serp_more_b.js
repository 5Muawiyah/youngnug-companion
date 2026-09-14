// content/capture.js — SERP readers, part 3: TARGETjobs, Bright Network,
// Higherin (the RateMyPlacement rebrand), Prospects — plus ynSerpJobs, the
// dispatcher every SERP reader across the three serp_*.js files answers to,
// in the order a results page is checked. See serp_uk_boards.js's header
// for the shared per-reader contract.
import { ynStripHiddenText } from "./text.js";
import { ynIndeedSerpJobs, ynLinkedInSerpJobs, ynNhsJobsSerpJobs, ynGradcrackerSerpJobs, ynTrackrSerpJobs } from "./serp_uk_boards.js";
import { ynCvLibrarySerpJobs, ynGuardianJobsSerpJobs, ynTotalJobsSerpJobs, ynSimplyHiredSerpJobs } from "./serp_more_a.js";

// Results page, TARGETjobs (targetjobs.co.uk/search/jobs): 25 cards mounted
// with NO keyword URL shape at all — typing a term into the search box and
// pressing Return leaves the page at the same bare /search/jobs path with
// zero query parameters, confirmed on a live page 2026-09-03 in a
// signed-out browser. The site's own fan-out clause therefore has nothing to
// key a host entry on: this reader is a capture-on-gesture surface only, and
// TARGETjobs carries no entry in background.js's YN_FANOUT_HOSTS. Card anchor
// a[data-cy="card:view-opportunity"] is the site's own analytics hook,
// never a Tailwind utility class. Employer is read two ways because the
// organisation-verified-badge span only renders for VERIFIED employers: the
// span immediately beside the badge wins when the badge exists, and the
// aria-label's own "Link to <title> - <employer>" tail is the fallback every
// card carries regardless.
function ynTargetJobsEmployer(card, ariaLabel) {
  const badge = card.querySelector('[data-cy="organisation-verified-badge"]');
  const beside = badge && badge.parentElement ? badge.parentElement.previousElementSibling : null;
  const bySpan = beside ? ynText(beside) : "";
  if (bySpan) return bySpan;
  const idx = ariaLabel.lastIndexOf(" - ");
  return idx >= 0 ? ariaLabel.slice(idx + 3).trim() : "";
}

function ynTargetJobsSerpJobs() {
  if (!/(^|\.)targetjobs\.co\.uk$/i.test(location.hostname)) return null;
  if (!/^\/search\/jobs/.test(location.pathname)) return null;
  const jobs = [];
  for (const link of document.querySelectorAll('a[data-cy="card:view-opportunity"]')) {
    const title = ynText(link.querySelector("h3"));
    if (!title) continue;
    const aria = link.getAttribute("aria-label") || "";
    const employer = ynTargetJobsEmployer(link, aria);
    const ps = link.querySelectorAll("p");
    const jobLocation = ynText(ps[0]);
    const salary = ynText(ps[1]);
    let deadline = "";
    for (const span of link.querySelectorAll("span")) {
      const t = ynText(span);
      if (/\d+\s+days?\s+to\s+apply/i.test(t)) {
        deadline = t;
        break;
      }
    }
    let url = "";
    try {
      url = new URL(link.getAttribute("href") || "", location.origin).toString();
    } catch {
      continue; // an unresolvable href is not an advert we can store
    }
    const descParts = [];
    if (/^£/.test(salary)) descParts.push("Salary: " + salary);
    if (deadline) descParts.push(deadline);
    jobs.push({
      title,
      employer,
      location: jobLocation,
      url,
      source: "capture:" + location.hostname,
      description: descParts.join(" · "),
      mode: "serp",
    });
  }
  return jobs;
}

// Results page, Bright Network (brightnetwork.co.uk/graduate-jobs/,
// /internships/, /industrial-placements/ — all three share this card shape,
// confirmed on a live page 2026-09-03 in a signed-out browser), so
// this matches on the card container rather than one pathname. Container:
// div.search-result-card[data-href]; the "Add to tracker" bookmark link and
// the plain logo-image link both carry no readable text, so "the first
// plain <a> in the card that is not the title link and has text" is,
// unambiguously, the employer link. The site's own ?search_id=/&search_position=
// tracking params ride every card's href identically and are stripped,
// matching the "never the site's own tracking wrapper" rule every reader
// here follows. Bright Network's own terms permit a page a student reads for
// "your own research purposes" but forbid a page the WORKER opens, and the
// results page has no keyword URL shape anyway — no fan-out entry.
function ynBrightNetworkSerpJobs() {
  if (!/(^|\.)brightnetwork\.co\.uk$/i.test(location.hostname)) return null;
  const cards = document.querySelectorAll("div.search-result-card");
  if (!cards.length) return null;
  const jobs = [];
  for (const card of cards) {
    const titleAnchor = card.querySelector("a.result-link-text");
    if (!titleAnchor) continue;
    const title = ynText(titleAnchor.querySelector("h6")) || ynText(titleAnchor);
    if (!title) continue;
    let employer = "";
    for (const a of card.querySelectorAll("a")) {
      if (a === titleAnchor) continue;
      const t = ynText(a);
      if (t) {
        employer = t;
        break;
      }
    }
    let url = "";
    try {
      const u = new URL(card.getAttribute("data-href") || "", location.origin);
      u.search = "";
      url = u.toString();
    } catch {
      continue; // an unresolvable href is not an advert we can store
    }
    let deadline = "";
    const calImg = card.querySelector('img[alt="Calendar"]');
    if (calImg) {
      const row = calImg.closest("div");
      deadline = ynText(row ? row.querySelector("span") : null);
    }
    let jobLocation = "";
    const locImg = card.querySelector('img[alt="Available locations"]');
    if (locImg) {
      jobLocation = ynText(locImg.closest("div"));
    }
    jobs.push({
      title,
      employer,
      location: jobLocation,
      url,
      source: "capture:" + location.hostname,
      description: deadline,
      mode: "serp",
    });
  }
  return jobs;
}

// Results page, RateMyPlacement / Higherin (the site rebranded 2026: every
// ratemyplacement.co.uk/search-jobs URL now redirects to higherin.com,
// confirmed on a live page 2026-09-03). This reader keys on both hostnames so an old
// ratemyplacement.co.uk link still reads if ever landed on directly, but the
// SOURCE stamp below always takes the page's OWN hostname, so a rebranded
// page never mislabels itself under the old host. Card: an
// a[href*="higherin.com/jobs/"] CONTAINING an h2 — the site renders the
// same href twice per card (a bare logo-image link, then the text link with
// the h2/employer/meta rows inside it), so "containing an h2" and
// de-duplication on the href both matter. Deadline/salary/location come from
// the icon-keyed meta rows (fa-alarm-clock / fa-rmp-custom-money-bag /
// fa-location-dot — Font Awesome classes the site puts on real nodes, never
// a Tailwind utility alone); ":scope > span" keeps the read to the ONE row
// each icon is a direct child of, so the big wrapper div around all five
// meta rows (which also matches "contains an fa- icon" once you search its
// descendants) is never mistaken for a single field's own row.
function ynHigherinSerpJobs() {
  if (!/(^|\.)(higherin\.com|ratemyplacement\.co\.uk)$/i.test(location.hostname)) return null;
  const anchors = document.querySelectorAll('a[href*="higherin.com/jobs/"]');
  if (!anchors.length) return null;
  const jobs = [];
  const seen = new Set();
  for (const a of anchors) {
    const h2 = a.querySelector("h2");
    if (!h2) continue;
    const title = ynText(h2);
    if (!title) continue;
    const url = a.getAttribute("href") || a.href;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const employer = ynText(a.querySelector("p"));
    let deadline = "";
    let salary = "";
    let jobLocation = "";
    for (const row of a.querySelectorAll("div")) {
      const icon = row.querySelector(':scope > span[class*="fa-"]');
      if (!icon) continue;
      const cls = icon.className || "";
      if (cls.includes("fa-alarm-clock") && !deadline) deadline = ynText(row);
      else if (cls.includes("fa-rmp-custom-money-bag") && !salary) salary = ynText(row);
      else if (cls.includes("fa-location-dot") && !jobLocation) jobLocation = ynText(row);
    }
    const descParts = [];
    if (salary) descParts.push(salary);
    if (deadline) descParts.push(deadline);
    jobs.push({
      title,
      employer,
      location: jobLocation,
      url,
      source: "capture:" + location.hostname,
      description: descParts.join(" · "),
      mode: "serp",
    });
  }
  return jobs;
}

// Results page, Prospects (prospects.ac.uk/graduate-jobs-results): 20 cards
// per page inside li.result-item (confirmed on a live page 2026-09-03). The page's
// own keyword/sortBy/size/page query state rides every card's href
// identically — it is the PAGE's search state, not the job's own identity,
// and the job id already lives in the path, so it is stripped from the
// stored URL the same way every other reader here strips a tracking
// wrapper. The site's own terms permit a personal copy and the results
// page has a plain keyword URL shape, so this site DOES carry a fan-out
// host entry (the server's prospects search, background.js YN_FANOUT_HOSTS).
function ynProspectsSerpJobs() {
  if (!/(^|\.)prospects\.ac\.uk$/i.test(location.hostname)) return null;
  const cards = document.querySelectorAll("li.result-item");
  if (!cards.length) return null;
  const jobs = [];
  for (const card of cards) {
    const link = card.querySelector("h3.result-item-title a");
    if (!link) continue;
    const title = ynText(link);
    if (!title) continue;
    const employer = ynStripHiddenText(card.querySelector("p.employer-name"), [".sr-only", ".zeta"]);
    const jobLocation = ynStripHiddenText(card.querySelector("li.job-location"), [".sr-only"]);
    const metaItems = card.querySelectorAll(".result-item-meta > li");
    const salary = ynStripHiddenText(metaItems[1], [".sr-only"]);
    let url = "";
    try {
      const u = new URL(link.getAttribute("href") || "", location.origin);
      for (const key of ["keyword", "sortBy", "size", "page"]) u.searchParams.delete(key);
      url = u.toString();
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

function ynSerpJobs() {
  return (
    ynIndeedSerpJobs() ||
    ynLinkedInSerpJobs() ||
    ynNhsJobsSerpJobs() ||
    ynGradcrackerSerpJobs() ||
    ynTrackrSerpJobs() ||
    ynCvLibrarySerpJobs() ||
    ynGuardianJobsSerpJobs() ||
    ynTotalJobsSerpJobs() ||
    ynSimplyHiredSerpJobs() ||
    ynTargetJobsSerpJobs() ||
    ynBrightNetworkSerpJobs() ||
    ynHigherinSerpJobs() ||
    ynProspectsSerpJobs()
  );
}

export {
  ynTargetJobsEmployer,
  ynTargetJobsSerpJobs,
  ynBrightNetworkSerpJobs,
  ynHigherinSerpJobs,
  ynProspectsSerpJobs,
  ynSerpJobs,
};
