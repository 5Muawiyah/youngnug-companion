// content/capture.js — SERP (results-page) readers, part 1: Indeed,
// LinkedIn, NHS Jobs, Gradcracker, Trackr. Each returns an array of cards
// ALREADY MOUNTED in the DOM (never a scroll, never a next page, never a
// fetch of the linked adverts) or null when the page does not match its
// host/path shape. See ynSerpJobs (serp_more_b.js) for the dispatch order.

// Results page, Indeed: one job per mounted .job_seen_beacon card. Cards
// carry no body — only the attribute pills — so the description is at most
// the card's salary line.
function ynIndeedSerpJobs() {
  if (!/(^|\.)indeed\./.test(location.hostname)) return null;
  if (!/^\/jobs\b/.test(location.pathname)) return null;
  const jobs = [];
  for (const card of document.querySelectorAll(".job_seen_beacon")) {
    const link = card.querySelector("a[data-jk]");
    const jk = link && link.getAttribute("data-jk");
    if (!jk) continue;
    const title =
      ynText(card.querySelector('span[id^="jobTitle-"]')) ||
      (link.getAttribute("aria-label") || "").replace(/^full details of\s*/i, "").trim();
    if (!title) continue;
    const salary = ynText(
      card.querySelector('.salary-snippet-container, [data-testid*="salary-snippet"]'),
    );
    jobs.push({
      title,
      employer: ynText(card.querySelector('[data-testid="company-name"]')),
      location: ynText(card.querySelector('[data-testid="text-location"]')),
      url: location.origin + "/viewjob?jk=" + jk,
      source: "capture:" + location.hostname,
      description: salary ? "Salary: " + salary : "",
      mode: "serp",
    });
  }
  return jobs;
}

// Results page, LinkedIn: one job per mounted [data-job-id] card. The list
// virtualises (~7 cards in the DOM at once) — what is mounted is what the
// user asked to save, so that is all that is read.
function ynLinkedInSerpJobs() {
  if (!/(^|\.)linkedin\.com$/.test(location.hostname)) return null;
  if (!location.pathname.startsWith("/jobs/search")) return null;
  const jobs = [];
  for (const card of document.querySelectorAll("[data-job-id]")) {
    const id = card.getAttribute("data-job-id");
    const link = card.querySelector('a[href*="/jobs/view/"]');
    if (!id || !link) continue;
    const title =
      (link.getAttribute("aria-label") || "").replace(/\s+with verification$/i, "").trim() ||
      ynText(link.querySelector("strong"));
    if (!title) continue;
    jobs.push({
      title,
      employer: ynText(card.querySelector(".artdeco-entity-lockup__subtitle")),
      location: ynText(card.querySelector(".artdeco-entity-lockup__caption li")),
      url: location.origin + "/jobs/view/" + id + "/",
      source: "capture:" + location.hostname,
      description: "",
      mode: "serp",
    });
  }
  return jobs;
}

// Results page, NHS Jobs: one job per rendered search-result panel. The
// markup is the NHS design system's server-rendered list, so every card is
// really in the DOM (no virtualisation) and the reads are off the site's own
// data-test attributes rather than its utility classes, which are the stable
// signal in a design-system page. The employer is the location block's h3
// OWN text and the place is a nested div inside that same h3 - they are not
// siblings, so the place is subtracted from the h3's full text rather than
// read from a sibling that does not exist. The distance row only renders
// when the search carried a location, so nothing here depends on it.
function ynNhsJobsSerpJobs() {
  if (!/(^|\.)jobs\.nhs\.uk$/i.test(location.hostname)) return null;
  if (!/^\/candidate\/search\/results/.test(location.pathname)) return null;
  const jobs = [];
  for (const card of document.querySelectorAll('[data-test="search-result"]')) {
    const link = card.querySelector('[data-test="search-result-job-title"]');
    if (!link) continue;
    const title = ynText(link);
    if (!title) continue;
    const locBlock = card.querySelector(
      '[data-test="search-result-location"] h3',
    );
    let employer = "";
    let place = "";
    if (locBlock) {
      const placeEl = locBlock.querySelector("div");
      place = ynText(placeEl);
      const whole = ynText(locBlock);
      employer = place ? whole.replace(place, "").trim() : whole;
    }
    const salary = ynText(
      card.querySelector('[data-test="search-result-salary"] strong'),
    );
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

// Results page, Gradcracker: one job per rendered <article> card, keyed off
// the site's OWN analytics attributes (data-mk-section / data-mk-label —
// present on the title link and the employer-logo link of every real card)
// rather than its tw- utility classes. Those tw- classes are real Tailwind
// utility classes on this site (not obfuscated or rotating), but a utility
// class says how a node looks, never what it IS, so it is not trusted here.
// Confirmed live 2026-08-31 on
// https://www.gradcracker.com/search/computing-technology/jobs: 81
// <article wire:key="..."> nodes, one of which
// (wire:key="hp", visually clipped, aria-hidden="true") is a screen-reader
// placeholder card carrying NO data-mk-label at all — e.g.
//   <article wire:key="hp" aria-hidden="true" ...><h2><a href="...">
//   Graduate Software Engineer</a></h2></article>
// It is excluded for free by keying off data-mk-label="Job Title" rather
// than the article tag alone, never by an aria-hidden check of its own. A
// real card looked like (trimmed):
//   <article wire:key="82207" ...>
//     <a href="https://www.gradcracker.com/hub/759/cern" data-mk-label="Employer Logo">
//       <img alt="CERN" ...></a>
//     <h2><a href="https://www.gradcracker.com/hub/759/cern/graduate-job/82207/..."
//        data-mk-label="Job Title">Computing Engineer S3 Storage &amp; Backup</a></h2>
//     <dl><div><dt>Deadline</dt><dd>September 10th, 2026</dd></div>
//         <div><dt>Salary</dt><dd>5,266 - 5,793 Swiss Francs per month (net of tax)</dd></div>
//         <div><dt>Location</dt><dd>Geneva (Switzerland)</dd></div> ...</dl>
//   </article>
// Employer comes from the logo link's own img alt (its accessible name, the
// display case a person reads — never the URL's employer-id slug, which is
// only the fallback in the single-advert reader below for when og:title is
// absent). Location and salary come from the visible <dt> LABEL text inside
// the card's own <dl>, exactly like the single-advert reader (ynGradcrackerJob)
// already reads its own fact rows — never a class name, only the label
// text a student reads. Rows land as capture:<host>, the personal-source
// class the server already scopes to the account that made the capture —
// the same class every other reader here uses, matching the in-session
// personal-use carve-out in Gradcracker's terms quoted below.
function ynGradcrackerSerpJobs() {
  if (!/(^|\.)gradcracker\.com$/i.test(location.hostname)) return null;
  if (!/^\/search\//.test(location.pathname)) return null;
  const jobs = [];
  for (const link of document.querySelectorAll('a[data-mk-label="Job Title"]')) {
    const card = link.closest("article");
    if (!card) continue;
    const title = ynText(link);
    if (!title) continue;
    const logo = card.querySelector('a[data-mk-label="Employer Logo"] img[alt]');
    const employer = logo ? (logo.getAttribute("alt") || "").trim() : "";
    let jobLocation = "";
    let salary = "";
    for (const row of card.querySelectorAll("dl > div")) {
      const label = ynText(row.querySelector("dt"));
      const value = ynText(row.querySelector("dd"));
      if (!label || !value) continue;
      if (/^location/i.test(label)) jobLocation = value;
      if (/^salary/i.test(label)) salary = value;
    }
    jobs.push({
      title,
      employer,
      location: jobLocation,
      url: link.href,
      source: "capture:" + location.hostname,
      description: salary ? "Salary: " + salary : "",
      mode: "serp",
    });
  }
  return jobs;
}

// Results page, Trackr (app.the-trackr.com): ONE job — the single row the
// student is pointing at — read off the site's OWN attributes:
// a[href^="/company/"] for the employer link, the custom
// <trackr-status-dropdown> element the first column always carries, and the
// nearest preceding colspan="100" section row for the category — never a
// Tailwind utility class. Built from the markup documented
// from a signed-in browser (3 Sep 2026,
// app.the-trackr.com/uk-tech/summer-internships): one <table> per
// tracker/programme-type, rows grouped under
// <tr><td colspan="100">...category text...</td></tr> section headers:
//   <table class="... table w-full table-auto ...">
//     <thead ...><tr><th>My Status</th><th id="company-col-header">Company Name</th>
//       <th>Programme Name</th><th>Opening Date</th><th>Closing Date</th>
//       <th>Last Year Opening</th><th>Materials</th><th>Sponsors Visa</th><th>Notes</th></tr></thead>
//     <tbody>
//       <tr><td colspan="100"><i class="fa fa-handshake"></i> Promoted</td></tr>
//       <tr class="bg-white border ...">
//         <td><trackr-status-dropdown>...</trackr-status-dropdown></td>
//         <td><a href="/company/bending-spoons">Bending Spoons</a></td>
//         <td><a href="https://jobs.bendingspoons.com/positions/...?utm_source=Trackr&...">
//              Software engineer, summer intern UK</a></td>
//         <td class="bg-trackr-green">25 Aug 26</td>
//         <td></td>
//         <td>02 May 25</td>
//         <td>CV / CL / WA badges</td><td>Yes|No</td><td>notes</td>
//       </tr>
//
// TERMS OF USE (the-trackr.com/terms-of-use/, read
// 2026-09-03 in a real browser): section 12.1(a) bans extracting
// "Platform content or data by automated or systematic means"; section 11.2
// permits "individual links to opportunities and reasonable isolated
// extracts for personal, non-commercial purposes". A whole-table read (327
// rows on uk-tech/summer-internships) is the former; ONE row,
// picked by the student's own pointer or keyboard focus at the moment they
// invoke the Companion, is the latter. This reader therefore never iterates
// document.querySelectorAll("table tbody tr") — it resolves exactly one
// target row and reads only that row:
//   1. document.activeElement's own <tr> — set natively by the browser the
//      moment the student clicks or tabs to a link, no listener needed (this
//      file is injected fresh on every capture and registers nothing ahead
//      of time — see the file-header comment);
//   2. failing that, the row currently under the mouse, read live via
//      "tr:hover" (a real browser tracks :hover continuously; this needs no
//      prior mousemove listener either — it only fails in jsdom, which is
//      why the fixture test below drives it through activeElement).
// No third fallback: if neither names a row, nothing is captured — never
// "the first row" or "every row", because that would silently become the
// whole-table walk the terms forbid.
//
// A row's title is the programme link's own text (an <a> that is NOT the
// company link, i.e. not href^="/company/"); its url is the EMPLOYER'S own
// apply page, Trackr's own utm_* parameters stripped so a dedupe against
// the same advert collected elsewhere (an employer feed, a direct capture)
// still matches on the employer's own URL rather than Trackr's tracking
// copy of it. Location is "UK" for every uk-* tracker path — Trackr has no
// per-row location, only a per-TRACKER country scope;
// non-UK trackers (us-*, france-*, germany-*, italy-*, hong-kong-*) are
// out of scope for this reader and return no jobs (YoungNug is UK-only).
// The row lands as capture:<host>, the same personal-source class every
// other SERP reader here uses, matching the in-session personal-use
// carve-out this file's own terms-of-use read establishes above.
function ynTrackrSerpJobs() {
  if (!/(^|\.)the-trackr\.com$/i.test(location.hostname)) return null;
  const seg = location.pathname.split("/").filter(Boolean);
  const tracker = seg[0] || "";
  if (!/^uk-/.test(tracker)) return null; // non-UK trackers: out of scope

  // Resolve the ONE row the student is pointing at (see the terms-of-use
  // note above) — never a walk of every row in the table.
  let row = document.activeElement && document.activeElement.closest
    ? document.activeElement.closest("table tbody tr")
    : null;
  if (!row) {
    const hovered = document.querySelectorAll("table tbody tr:hover");
    row = hovered.length ? hovered[hovered.length - 1] : null;
  }
  if (!row) return []; // no row named by focus or hover: capture nothing

  const sectionCell = row.querySelector('td[colspan="100"]');
  if (sectionCell) return []; // the caret is on a section header, not a job

  let category = "";
  for (let sib = row.previousElementSibling; sib; sib = sib.previousElementSibling) {
    const cell = sib.querySelector('td[colspan="100"]');
    if (cell) {
      category = ynText(cell);
      break;
    }
  }
  const employerLink = row.querySelector('a[href^="/company/"]');
  const employer = employerLink ? ynText(employerLink) : "";
  let programmeLink = null;
  for (const a of row.querySelectorAll("a[href]")) {
    if (a === employerLink) continue;
    const href = a.getAttribute("href") || "";
    if (/^https?:\/\//.test(href)) {
      programmeLink = a;
      break;
    }
  }
  if (!programmeLink) return [];
  const title = ynText(programmeLink);
  if (!title) return [];
  let url = programmeLink.href;
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || key === "source") u.searchParams.delete(key);
    }
    url = u.toString();
  } catch {
    /* keep the raw href if it fails to parse */
  }
  const cells = row.querySelectorAll("td");
  const opening = ynText(cells[3]);
  const closing = ynText(cells[4]);
  const descParts = [];
  if (closing) descParts.push("Deadline: " + closing);
  if (opening) descParts.push("Opens: " + opening);
  if (category) descParts.push(category);
  return [
    {
      title,
      employer,
      location: "UK",
      url,
      source: "capture:" + location.hostname,
      description: descParts.join(" · "),
      mode: "serp",
    },
  ];
}

export {
  ynIndeedSerpJobs,
  ynLinkedInSerpJobs,
  ynNhsJobsSerpJobs,
  ynGradcrackerSerpJobs,
  ynTrackrSerpJobs,
};
