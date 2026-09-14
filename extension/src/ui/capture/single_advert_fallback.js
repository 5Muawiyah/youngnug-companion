// content/capture.js — the second-tier single-advert readers: Gradcracker
// and Prospects' own advert pages (neither serves usable ld+json every
// time), plus the per-ATS job-detail fallback for a posting page carrying
// no JobPosting ld+json at all.

// Rung 2c: Gradcracker advert pages (/hub/<id>/<employer>/<type>/<id>/<slug>).
// The site serves no ld+json and its utility classes rotate, so every read is
// off stable signals: the h1, the RENDERED label text of the overview fact
// rows ("Location", "Salary" — never a class name), the og:title's middle
// segment for the employer's display case, and the semantic
// .job-description/.body-content container. Rows from here land as
// capture:<host> — the personal source class — so a Gradcracker capture can
// only ever serve the account that made it (their terms allow personal-use
// copies and ban distribution; the server enforces the scoping).
function ynGradcrackerJob() {
  if (!/(^|\.)gradcracker\.com$/i.test(location.hostname)) return null;
  if (!/\/hub\//.test(location.pathname)) return null;
  const title = ynText(document.querySelector("h1"));
  let employer = "";
  const og = document.querySelector('meta[property="og:title"]');
  const parts = (og && og.content ? og.content.split("|") : []).map((s) =>
    s.trim(),
  );
  if (parts.length >= 3) employer = parts[1];
  if (!employer) {
    // /hub/<hub-id>/<employer-slug>/... — the slug is the THIRD segment.
    const seg = location.pathname.split("/").filter(Boolean);
    if (seg[0] === "hub" && seg.length >= 3) {
      employer = (seg[2] || "").replace(/-/g, " ");
    }
  }
  let jobLocation = "";
  let salary = "";
  const factRows = document.querySelectorAll(
    '[data-type="overview"] li, li',
  );
  for (const li of factRows) {
    const labelEl = li.querySelector("div");
    const label = ynText(labelEl);
    if (!label) continue;
    const value = ynText(li).replace(label, "").trim();
    if (!value) continue;
    if (/^location/i.test(label) && !jobLocation) jobLocation = value;
    if (/^salary/i.test(label) && !salary) salary = value;
    if (jobLocation && salary) break;
  }
  const description = ynText(
    document.querySelector(".job-description .body-content, .job-description"),
  );
  if (!title && !description) return null;
  return {
    title,
    employer,
    url: location.href.split("?")[0],
    location: jobLocation,
    salary,
    description,
  };
}

// Rung 2d: Prospects advert pages
// (/employer-profiles/<employer-slug>/jobs/<slug>). The live block
// frequently fails JSON.parse — an unescaped control character deep in a
// 6 KB description, confirmed on a live page 2026-09-03 in a real browser
// — so ynLdJobPosting() answers null on the exact page this DOM rung
// exists for, and the two never fight
// over the same field: whichever one parses wins, per field, in the merge
// below. Facts come from the visible <dl> — Workplace / Location / Salary —
// never "Registered office" / "Registered number", which the SAME dl shape
// also carries for the employer's own registered company details a little
// further down the page; the employer name comes from the page's own
// <title> ("<Job Title> - <Employer> - <Location> | Prospects.ac.uk"),
// because the only <a href="/employer-profiles/..."> anchors ON the page
// are the employer's OTHER jobs, never this job's own employer field.
function ynProspectsJob() {
  if (!/(^|\.)prospects\.ac\.uk$/i.test(location.hostname)) return null;
  if (!/^\/employer-profiles\//.test(location.pathname)) return null;
  const title = ynText(document.querySelector("h1"));
  const titleParts = (document.title || "")
    .split(" - ")
    .map((s) => s.trim())
    .filter(Boolean);
  const employer = titleParts.length >= 2 ? titleParts[1] : "";
  let jobLocation = "";
  let workplace = "";
  let salary = "";
  for (const dt of document.querySelectorAll("dl dt")) {
    const label = ynText(dt);
    const dd = dt.nextElementSibling;
    const value = dd && dd.tagName === "DD" ? ynText(dd) : "";
    if (!label || !value) continue;
    if (/^location$/i.test(label) && !jobLocation) jobLocation = value;
    else if (/^workplace$/i.test(label) && !workplace) workplace = value;
    else if (/^salary$/i.test(label) && !salary) salary = value;
  }
  let closing = "";
  for (const p of document.querySelectorAll("p")) {
    const t = ynText(p);
    if (/^closing date:/i.test(t)) {
      closing = t;
      break;
    }
  }
  if (!title && !employer) return null;
  const descParts = [];
  if (workplace) descParts.push(workplace);
  if (closing) descParts.push(closing);
  return {
    title,
    employer,
    location: jobLocation,
    salary,
    description: descParts.join(" · "),
  };
}

// Rung 2e: a per-ATS job-detail fallback for CAPTURE ONLY, on
// a posting page carrying no JobPosting ld+json — idea taken from two
// surveyed open-source autofill projects (one a hostname -> per-field
// selector table), never copied: neither repo's own selector VALUES are used below. This
// table leans on the one fact every multi-tenant ATS platform here
// shares — the posting URL's own FIRST path segment is the hiring
// company's tenant slug (jobs.lever.co/<company>/<id>,
// job-boards.greenhouse.io/<company>/jobs/<id>,
// jobs.ashbyhq.com/<company>/<id>, careers.smartrecruiters.com/<Company>/...,
// apply.workable.com/<company>/j/<id>/) — never a page's own
// "class*='company'" text, which most bare ATS posting pages never render
// at all (the employer is the board's own branding, not a labelled field).
// Capture only: this reads title/employer/location/description off a page
// the student is looking at; it discovers no FORM field and fills nothing.
// descSel is an ORDERED LIST tried most-specific first, never one combined
// selector string: document.querySelector on a comma-joined selector
// returns the first match in DOCUMENT ORDER, not selector-list order, so a
// broad "main" fallback (which always contains the specific container too,
// and sits earlier in the tree) would silently win every time and the
// specific selector would never be reached. "main" is listed last on
// purpose, tried only when nothing narrower exists on the page.
const YN_ATS_JOB_TABLE = {
  "greenhouse.io": { titleSel: "h1", locationSel: "[class*='location' i]", descSels: ["#content", "main"] },
  "lever.co": {
    titleSel: ".posting-headline h2, h2",
    locationSel: ".posting-categories [class*='location' i], [class*='location' i]",
    descSels: [".posting-page", "[class*='content' i]", "main"],
  },
  "ashbyhq.com": { titleSel: "h1", locationSel: "[class*='location' i]", descSels: ["[class*='description' i]", "main"] },
  "smartrecruiters.com": { titleSel: "h1.job-title, h1[itemprop=title], h1", locationSel: "[class*='location' i]", descSels: ["[class*='sections' i]", "[class*='description' i]", "main"] },
  "workable.com": { titleSel: "h1", locationSel: "[class*='location' i]", descSels: ["[class*='description' i]", "main"] },
};

function ynFirstMatch(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// The description container this fallback reads can be the SAME element
// that also holds the page's own application form (several of these ATS
// platforms render posting and form on one page) — a control's own chrome
// ("Drag and drop or browse", a two-hundred-country <select>) is not the
// employer's own words. Idea from another project's form-chrome list,
// never copied: this reads the description off a CLONE with every actual form
// CONTROL element removed
// by tag, never a text-pattern match against words a real posting might
// also use.
function ynAtsDescriptionText(el) {
  if (!el) return "";
  const clone = el.cloneNode(true);
  clone.querySelectorAll("button, select, input, textarea, option, form").forEach((n) => n.remove());
  return ynText(clone);
}

// The first match of a selector list that is actually rendered: a posting page
// can carry a hidden heading first in the DOM (SmartRecruiters mounts an
// Internet Explorer notice as an h1 inside a hidden overlay) and the role's
// own heading second. A candidate under a display:none ancestor is skipped;
// with no rendered candidate the first match stands, so the harness (no
// layout) reads the same element it always did.
function ynFirstShown(selectorList) {
  const all = Array.from(document.querySelectorAll(selectorList));
  for (const el of all) {
    let hidden = false;
    let e = el;
    for (let i = 0; i < 12 && e && e.nodeType === 1; i++) {
      try {
        const cs = window.getComputedStyle(e);
        if (cs && cs.display === "none") {
          hidden = true;
          break;
        }
      } catch {
        break;
      }
      e = e.parentElement;
    }
    if (!hidden) return el;
  }
  return all[0] || null;
}

function ynAtsPostingJob() {
  const host = location.hostname.toLowerCase();
  let cfg = null;
  for (const suffix of Object.keys(YN_ATS_JOB_TABLE)) {
    if (host === suffix || host.endsWith("." + suffix)) {
      cfg = YN_ATS_JOB_TABLE[suffix];
      break;
    }
  }
  if (!cfg) return null;
  const title = ynText(ynFirstShown(cfg.titleSel));
  const seg = location.pathname.split("/").filter(Boolean);
  const employer = (seg[0] || "").replace(/[-_]/g, " ").trim();
  if (!title && !employer) return null;
  return {
    title,
    employer,
    url: location.href.split("?")[0],
    location: ynText(document.querySelector(cfg.locationSel)),
    description: ynAtsDescriptionText(ynFirstMatch(cfg.descSels)),
  };
}

export {
  ynGradcrackerJob,
  ynProspectsJob,
  YN_ATS_JOB_TABLE,
  ynFirstMatch,
  ynAtsDescriptionText,
  ynFirstShown,
  ynAtsPostingJob,
};
