// content/capture.js — rung 3 (the generic heuristic for every other site),
// the unclaimed-results-page refusal it depends on, the student's own
// per-site dev selectors, and ynMergeJob,
// the field-by-field merge every rung above feeds through.

// Rung 3: the generic heuristic for every other site. Best-effort; the user
// confirms the result in YoungNug.
// A signed-in job site greets you by name, and on some pages that greeting is
// the only <h1>. "Welcome, Sam" reached production as a job TITLE on a
// real captured advert. A student's own name is never a job, and putting it on
// a card is a small lie the card cannot back up — so the guesser declines the
// heading and lets the tab title (which names the role) win instead.
const YN_GREETING =
  /^\s*(welcome|welcome back|hi|hello|hey|good (morning|afternoon|evening))\b/i;

// Two adjacent fields with no separator read as one string, because ynText is
// built on textContent, which concatenates straight across element boundaries:
// "Enterprise Mobility" + "Reading RG1 7DS" -> "Enterprise MobilityReading RG1
// 7DS", which reached production on a real captured advert.
//
// The first attempt at this split on the lowercase->uppercase seam, and was
// WRONG in a way that is worse than the bug: measured against production,
// 215 of 3,830 distinct employers (5.6%) contain that seam legitimately, so
// "AstraZeneca" became "Astra", "BlackRock" became "Black", "PwC" became "Pw"
// and "eBay" became "e". Truncation feeds norm_employer, so it would have
// corrupted the dedupe key AND the employer-hide key — a silent data fault
// traded for a cosmetic one.
//
// The browser already knows where the boundary is. innerText is
// layout-aware: it inserts a line break at a block boundary and leaves an
// inline one alone, so the first LINE is the first field and a CamelCase name
// is never touched. textContent is the fallback for a detached node, where
// innerText is empty and no boundary information exists anyway.
function ynFirstField(el) {
  if (!el) return "";
  const tidy = (s) => String(s || "").trim().replace(/\s+/g, " ");
  // A real browser knows where the boundary is: innerText is layout-aware and
  // breaks a line at a block edge while leaving an inline one alone.
  const rendered = typeof el.innerText === "string" ? el.innerText : "";
  if (rendered.trim()) {
    return tidy(rendered.split(/\r?\n/).find((line) => line.trim()));
  }
  // jsdom performs no layout and does not implement innerText, and it is this
  // repo's capture harness — so the boundary is read from the DOM instead:
  // an element with element children carries one field per child, and the
  // first one is the field wanted. Never a character heuristic on the joined
  // string, which is what truncated AstraZeneca to Astra.
  const child = el.firstElementChild;
  if (child && tidy(child.textContent)) return tidy(child.textContent);
  return tidy(el.textContent);
}

// A search-RESULTS page's own <title>/h1 reads as "<query terms> jobs in
// <place>" on SimplyHired and most other UK boards — confirmed live on the
// exact page that produced the production defect this guards against
// (h1 "retail assistant jobs in croydon", verbatim). A real advert title
// can still contain the word "jobs" ("Head of Jobs in Retail, Croydon",
// "The Jobs in Croydon Coordinator") — there it reads as English, with a
// function word ("of"/"the"/"a"/...) immediately before "jobs" because
// "jobs" is the object of a real sentence fragment, never the site's own
// concatenated query text. That exclusion mirrors the server's own
// results-page check exactly, which is this reader's backstop should this
// heuristic ever miss.
const YN_SERP_TITLE_RE = /^.{2,60}?\bjobs?\b\s+(?:in|near)\s+.{2,40}$/i;
const YN_SERP_TITLE_EXCLUDE = /\b(?:of|the|a|an|for|our|any|no|your|all)\s+jobs?\s+(?:in|near)\b/i;

// A page this SERP-shaped, with no per-site handler above already having
// claimed it as a single advert, is the shape of the defect: many repeated
// result-card links (every SERP reader above keys its cards off a heading
// that wraps its own link — h2/h3 > a is the shape they share, not any one
// site's class name) AND a heading that reads as a search query rather
// than a job title. Either alone is ordinary on a real advert page (a
// "similar jobs" rail carries a few links; a title can merely contain the
// word "jobs") — both together, unclaimed by every reader above, is not.
function ynLooksLikeUnclaimedSerp() {
  const heading = ynText(document.querySelector("h1")) || document.title || "";
  if (!YN_SERP_TITLE_RE.test(heading) || YN_SERP_TITLE_EXCLUDE.test(heading)) {
    return false;
  }
  return document.querySelectorAll("h2 a[href], h3 a[href]").length >= 3;
}

function ynGuessJob() {
  const heading = ynText(document.querySelector("h1"));
  const title = (heading && !YN_GREETING.test(heading) ? heading : "") ||
    document.title;
  const employer = ynFirstField(
    document.querySelector(
      "[class*='company' i], [data-company], [itemprop='hiringOrganization']",
    ),
  );
  const desc = ynText(
    document.querySelector(
      "[class*='description' i], [id*='description' i], main, article",
    ),
  );
  return {
    title,
    employer,
    url: location.href.split("?")[0],
    description: desc,
  };
}

// The student's own per-site capture selectors, WIRED. popup.js stores and validates them under its namespaced key;
// the CALLER reads storage and passes them into ynCaptureCurrent, so this
// file stays storage-free and the injected read needs no async round trip.
// An explicit instruction outranks every built-in reader for its own site:
// the student added a rule precisely because the readers below cannot read
// this page. Selectors only, re-checked here (defence in depth against a
// hand-edited storage blob): match this host, look like a CSS selector,
// read visible text. Nothing in this rung can submit, navigate or script,
// and the hard stops above it (the blocked-page sentinels) run first.
function ynDevRuleMatches(pattern, host) {
  const p = String(pattern || "").toLowerCase().trim();
  const h = String(host || "").toLowerCase();
  if (!p) return false;
  if (p.startsWith("*.")) {
    const base = p.slice(2);
    return h === base || h.endsWith("." + base);
  }
  return h === p;
}

function ynDevSelectorJob(rules) {
  if (!Array.isArray(rules)) return null;
  // popup.js's YN_DEV_SELECTOR_RE, duplicated by value on purpose: the two
  // files ship as separate content worlds, and a storage blob is writable
  // by anything in the profile, so the read side re-validates for itself.
  const SEL_RE = /^[a-zA-Z0-9\s.#:_\-,>~+*()="'[\]]{1,200}$/;
  for (const rule of rules) {
    if (!rule || !ynDevRuleMatches(rule.pattern, location.hostname)) continue;
    const tSel = String(rule.titleSelector || "").trim();
    const bSel = String(rule.bodySelector || "").trim();
    if (!SEL_RE.test(tSel) || !SEL_RE.test(bSel)) continue;
    let title = "";
    let description = "";
    try {
      title = ynText(document.querySelector(tSel));
    } catch {
      /* an invalid selector reads nothing; the built-ins still run */
    }
    try {
      description = ynText(document.querySelector(bSel));
    } catch {
      /* same */
    }
    if (title || description) {
      return { title, description, url: location.href.split("?")[0] };
    }
  }
  return null;
}

// First non-empty field wins, in rung order — an ld+json title beats a DOM
// read beats a guess, per field, so one rung's gap never blanks another's hit.
function ynMergeJob(rungs) {
  const out = {};
  for (const rung of rungs) {
    if (!rung) continue;
    for (const k of ["title", "employer", "description", "location", "salary", "url"]) {
      if (!out[k] && rung[k]) out[k] = rung[k];
    }
  }
  return out;
}

export {
  YN_GREETING,
  ynFirstField,
  YN_SERP_TITLE_RE,
  YN_SERP_TITLE_EXCLUDE,
  ynLooksLikeUnclaimedSerp,
  ynGuessJob,
  ynDevRuleMatches,
  ynDevSelectorJob,
  ynMergeJob,
};
