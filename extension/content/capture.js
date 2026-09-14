(() => {
  // extension/src/ui/capture/text.js
  function ynVisibleText(el) {
    if (!el) return "";
    const t = el.innerText == null ? el.textContent : el.innerText;
    return (t || "").trim();
  }
  function ynTidyBlock(text) {
    return (text || "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  }
  function ynHtmlToText(html) {
    if (!html) return "";
    const spaced = String(html).replace(/<(br[^>]*|\/p|\/li|\/h[1-6]|\/div|\/tr)>/gi, "$&\n");
    const doc = new DOMParser().parseFromString(spaced, "text/html");
    return ynTidyBlock(doc.body ? doc.body.textContent : "");
  }
  function ynLdLocationText(jobLocation) {
    const loc = Array.isArray(jobLocation) ? jobLocation[0] : jobLocation;
    const addr = loc && typeof loc === "object" ? loc.address || loc : null;
    if (!addr || typeof addr !== "object") return "";
    return [addr.addressLocality, addr.addressRegion].map((p) => typeof p === "string" ? p.trim() : "").filter(Boolean).join(", ");
  }
  function ynLdSalaryText(baseSalary) {
    if (!baseSalary || typeof baseSalary !== "object") return "";
    const v = baseSalary.value && typeof baseSalary.value === "object" ? baseSalary.value : { value: baseSalary.value };
    const range = v.minValue != null && v.maxValue != null ? `${v.minValue} to ${v.maxValue}` : v.value != null ? String(v.value) : "";
    if (!range) return "";
    const unit = v.unitText ? ` a ${String(v.unitText).toLowerCase()}` : "";
    return `${range} ${baseSalary.currency || ""}`.trim() + unit;
  }
  function ynStripHiddenText(el, selectors) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    for (const sel of selectors) {
      clone.querySelectorAll(sel).forEach((n) => n.remove());
    }
    return ynText(clone);
  }

  // extension/src/ui/capture/single_advert_core.js
  function ynLdJobPosting() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try {
        data = JSON.parse(s.textContent);
      } catch (e) {
        continue;
      }
      const nodes = Array.isArray(data) ? data : [data, ...data && data["@graph"] ? data["@graph"] : []];
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
          employer: typeof n.hiringOrganization === "string" ? n.hiringOrganization.trim() : n.hiringOrganization && typeof n.hiringOrganization.name === "string" ? n.hiringOrganization.name.trim() : "",
          description: ynHtmlToText(n.description),
          location: ynLdLocationText(n.jobLocation),
          salary: ynLdSalaryText(n.baseSalary)
        };
      }
    }
    return null;
  }
  function ynIndeedViewJob() {
    if (!/(^|\.)indeed\./.test(location.hostname)) return null;
    const q = new URLSearchParams(location.search);
    const jk = q.get("jk") || q.get("vjk");
    if (!location.pathname.startsWith("/viewjob") && !jk) return null;
    return {
      title: ynText(
        document.querySelector(
          'h1.jobsearch-JobInfoHeader-title, [data-testid="jobsearch-JobInfoHeader-title"]'
        )
      ),
      employer: ynText(
        document.querySelector('[data-testid="inlineHeader-companyName"], [data-company-name]')
      ),
      location: ynText(document.querySelector('[data-testid="inlineHeader-companyLocation"]')),
      description: ynTidyBlock(ynVisibleText(document.querySelector("#jobDescriptionText"))),
      salary: ynText(document.querySelector("#salaryInfoAndJobType")),
      url: jk ? location.origin + "/viewjob?jk=" + jk : ""
    };
  }
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
  function ynLinkedInTertiaryLocation() {
    const text = document.body ? ynVisibleText(document.body) : "";
    for (const rawLine of text.split("\n")) {
      const m = rawLine.trim().match(/^(.{2,80}?)\s+·\s+(?:reposted\s+)?\d+\s+\w+\s+ago(?:\s+·|$)/i);
      if (m) return m[1].trim();
    }
    return "";
  }
  function ynLinkedInJobView() {
    if (!/(^|\.)linkedin\.com$/.test(location.hostname)) return null;
    if (!location.pathname.startsWith("/jobs/view/")) return null;
    const parts = (document.title || "").split(" | ");
    return {
      title: (parts[0] || "").trim(),
      employer: ynText(document.querySelector('a[href*="/company/"]')) || (parts.length >= 3 ? parts[parts.length - 2].trim() : ""),
      description: ynAboutTheJobBody(),
      location: ynLinkedInTertiaryLocation(),
      url: location.origin + location.pathname
    };
  }
  function ynLinkedInOpenPaneJob() {
    if (!/(^|\.)linkedin\.com$/.test(location.hostname)) return null;
    if (!location.pathname.startsWith("/jobs/search") && !location.pathname.startsWith("/jobs/collections")) {
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
      title = link ? (link.getAttribute("aria-label") || "").replace(/\s+with verification$/i, "").trim() || ynText(link.querySelector("strong")) : "";
      employer = ynText(card.querySelector(".artdeco-entity-lockup__subtitle"));
      loc = ynText(card.querySelector(".artdeco-entity-lockup__caption li"));
    }
    if (!title) {
      for (const a of document.querySelectorAll(
        'a[href*="/jobs/view/' + id + '"]'
      )) {
        const t = (a.getAttribute("aria-label") || "").replace(/\s+with verification$/i, "").trim() || ynText(a);
        if (t) {
          title = t;
          break;
        }
      }
    }
    if (!title) return null;
    return {
      title,
      employer,
      location: loc || ynLinkedInTertiaryLocation(),
      description: body,
      url: location.origin + "/jobs/view/" + id + "/"
    };
  }

  // extension/src/ui/capture/serp_uk_boards.js
  function ynIndeedSerpJobs() {
    if (!/(^|\.)indeed\./.test(location.hostname)) return null;
    if (!/^\/jobs\b/.test(location.pathname)) return null;
    const jobs = [];
    for (const card of document.querySelectorAll(".job_seen_beacon")) {
      const link = card.querySelector("a[data-jk]");
      const jk = link && link.getAttribute("data-jk");
      if (!jk) continue;
      const title = ynText(card.querySelector('span[id^="jobTitle-"]')) || (link.getAttribute("aria-label") || "").replace(/^full details of\s*/i, "").trim();
      if (!title) continue;
      const salary = ynText(
        card.querySelector('.salary-snippet-container, [data-testid*="salary-snippet"]')
      );
      jobs.push({
        title,
        employer: ynText(card.querySelector('[data-testid="company-name"]')),
        location: ynText(card.querySelector('[data-testid="text-location"]')),
        url: location.origin + "/viewjob?jk=" + jk,
        source: "capture:" + location.hostname,
        description: salary ? "Salary: " + salary : "",
        mode: "serp"
      });
    }
    return jobs;
  }
  function ynLinkedInSerpJobs() {
    if (!/(^|\.)linkedin\.com$/.test(location.hostname)) return null;
    if (!location.pathname.startsWith("/jobs/search")) return null;
    const jobs = [];
    for (const card of document.querySelectorAll("[data-job-id]")) {
      const id = card.getAttribute("data-job-id");
      const link = card.querySelector('a[href*="/jobs/view/"]');
      if (!id || !link) continue;
      const title = (link.getAttribute("aria-label") || "").replace(/\s+with verification$/i, "").trim() || ynText(link.querySelector("strong"));
      if (!title) continue;
      jobs.push({
        title,
        employer: ynText(card.querySelector(".artdeco-entity-lockup__subtitle")),
        location: ynText(card.querySelector(".artdeco-entity-lockup__caption li")),
        url: location.origin + "/jobs/view/" + id + "/",
        source: "capture:" + location.hostname,
        description: "",
        mode: "serp"
      });
    }
    return jobs;
  }
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
        '[data-test="search-result-location"] h3'
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
        card.querySelector('[data-test="search-result-salary"] strong')
      );
      let url = link.getAttribute("href") || "";
      try {
        url = new URL(url, location.origin).toString();
      } catch {
        continue;
      }
      jobs.push({
        title,
        employer,
        location: place,
        url,
        source: "capture:" + location.hostname,
        description: salary ? "Salary: " + salary : "",
        mode: "serp"
      });
    }
    return jobs;
  }
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
        mode: "serp"
      });
    }
    return jobs;
  }
  function ynTrackrSerpJobs() {
    if (!/(^|\.)the-trackr\.com$/i.test(location.hostname)) return null;
    const seg = location.pathname.split("/").filter(Boolean);
    const tracker = seg[0] || "";
    if (!/^uk-/.test(tracker)) return null;
    let row = document.activeElement && document.activeElement.closest ? document.activeElement.closest("table tbody tr") : null;
    if (!row) {
      const hovered = document.querySelectorAll("table tbody tr:hover");
      row = hovered.length ? hovered[hovered.length - 1] : null;
    }
    if (!row) return [];
    const sectionCell = row.querySelector('td[colspan="100"]');
    if (sectionCell) return [];
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
        mode: "serp"
      }
    ];
  }

  // extension/src/ui/capture/serp_more_a.js
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
        continue;
      }
      jobs.push({
        title,
        employer,
        location: place,
        url,
        source: "capture:" + location.hostname,
        description: salary ? "Salary: " + salary : "",
        mode: "serp"
      });
    }
    return jobs;
  }
  function ynGuardianJobsSerpJobs() {
    if (!/(^|\.)jobs\.theguardian\.com$/i.test(location.hostname)) return null;
    if (!/^\/searchjobs\//.test(location.pathname) && !/^\/jobs\/(apprenticeships|graduate|entry-level)\//.test(location.pathname)) {
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
        continue;
      }
      jobs.push({
        title,
        employer,
        location: place,
        url,
        source: "capture:" + location.hostname,
        description: salary ? "Salary: " + salary : "",
        mode: "serp"
      });
    }
    return jobs;
  }
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
        continue;
      }
      jobs.push({
        title,
        employer,
        location: place,
        url,
        source: "capture:" + location.hostname,
        description: salary ? "Salary: " + salary : "",
        mode: "serp"
      });
    }
    return jobs;
  }
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
        card.querySelector('[data-testid="searchSerpJobLocation"]')
      );
      const salary = ynText(card.querySelector('[data-testid^="salaryChip-"]'));
      let url = link.getAttribute("href") || "";
      try {
        url = new URL(url, location.origin).toString();
      } catch {
        continue;
      }
      jobs.push({
        title,
        employer,
        location: jobLocation,
        url,
        source: "capture:" + location.hostname,
        description: salary ? "Salary: " + salary : "",
        mode: "serp"
      });
    }
    return jobs;
  }

  // extension/src/ui/capture/serp_more_b.js
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
        continue;
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
        mode: "serp"
      });
    }
    return jobs;
  }
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
        continue;
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
        mode: "serp"
      });
    }
    return jobs;
  }
  function ynHigherinSerpJobs() {
    if (!/(^|\.)(higherin\.com|ratemyplacement\.co\.uk)$/i.test(location.hostname)) return null;
    const anchors = document.querySelectorAll('a[href*="higherin.com/jobs/"]');
    if (!anchors.length) return null;
    const jobs = [];
    const seen = /* @__PURE__ */ new Set();
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
        mode: "serp"
      });
    }
    return jobs;
  }
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
        continue;
      }
      jobs.push({
        title,
        employer,
        location: jobLocation,
        url,
        source: "capture:" + location.hostname,
        description: salary ? "Salary: " + salary : "",
        mode: "serp"
      });
    }
    return jobs;
  }
  function ynSerpJobs() {
    return ynIndeedSerpJobs() || ynLinkedInSerpJobs() || ynNhsJobsSerpJobs() || ynGradcrackerSerpJobs() || ynTrackrSerpJobs() || ynCvLibrarySerpJobs() || ynGuardianJobsSerpJobs() || ynTotalJobsSerpJobs() || ynSimplyHiredSerpJobs() || ynTargetJobsSerpJobs() || ynBrightNetworkSerpJobs() || ynHigherinSerpJobs() || ynProspectsSerpJobs();
  }

  // extension/src/ui/capture/single_advert_fallback.js
  function ynGradcrackerJob() {
    if (!/(^|\.)gradcracker\.com$/i.test(location.hostname)) return null;
    if (!/\/hub\//.test(location.pathname)) return null;
    const title = ynText(document.querySelector("h1"));
    let employer = "";
    const og = document.querySelector('meta[property="og:title"]');
    const parts = (og && og.content ? og.content.split("|") : []).map(
      (s) => s.trim()
    );
    if (parts.length >= 3) employer = parts[1];
    if (!employer) {
      const seg = location.pathname.split("/").filter(Boolean);
      if (seg[0] === "hub" && seg.length >= 3) {
        employer = (seg[2] || "").replace(/-/g, " ");
      }
    }
    let jobLocation = "";
    let salary = "";
    const factRows = document.querySelectorAll(
      '[data-type="overview"] li, li'
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
      document.querySelector(".job-description .body-content, .job-description")
    );
    if (!title && !description) return null;
    return {
      title,
      employer,
      url: location.href.split("?")[0],
      location: jobLocation,
      salary,
      description
    };
  }
  function ynProspectsJob() {
    if (!/(^|\.)prospects\.ac\.uk$/i.test(location.hostname)) return null;
    if (!/^\/employer-profiles\//.test(location.pathname)) return null;
    const title = ynText(document.querySelector("h1"));
    const titleParts = (document.title || "").split(" - ").map((s) => s.trim()).filter(Boolean);
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
      description: descParts.join(" · ")
    };
  }
  var YN_ATS_JOB_TABLE = {
    "greenhouse.io": { titleSel: "h1", locationSel: "[class*='location' i]", descSels: ["#content", "main"] },
    "lever.co": {
      titleSel: ".posting-headline h2, h2",
      locationSel: ".posting-categories [class*='location' i], [class*='location' i]",
      descSels: [".posting-page", "[class*='content' i]", "main"]
    },
    "ashbyhq.com": { titleSel: "h1", locationSel: "[class*='location' i]", descSels: ["[class*='description' i]", "main"] },
    "smartrecruiters.com": { titleSel: "h1.job-title, h1[itemprop=title], h1", locationSel: "[class*='location' i]", descSels: ["[class*='sections' i]", "[class*='description' i]", "main"] },
    "workable.com": { titleSel: "h1", locationSel: "[class*='location' i]", descSels: ["[class*='description' i]", "main"] }
  };
  function ynFirstMatch(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  function ynAtsDescriptionText(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll("button, select, input, textarea, option, form").forEach((n) => n.remove());
    return ynText(clone);
  }
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
      description: ynAtsDescriptionText(ynFirstMatch(cfg.descSels))
    };
  }

  // extension/src/ui/capture/generic_and_dev.js
  var YN_GREETING = /^\s*(welcome|welcome back|hi|hello|hey|good (morning|afternoon|evening))\b/i;
  function ynFirstField(el) {
    if (!el) return "";
    const tidy = (s) => String(s || "").trim().replace(/\s+/g, " ");
    const rendered = typeof el.innerText === "string" ? el.innerText : "";
    if (rendered.trim()) {
      return tidy(rendered.split(/\r?\n/).find((line) => line.trim()));
    }
    const child = el.firstElementChild;
    if (child && tidy(child.textContent)) return tidy(child.textContent);
    return tidy(el.textContent);
  }
  var YN_SERP_TITLE_RE = /^.{2,60}?\bjobs?\b\s+(?:in|near)\s+.{2,40}$/i;
  var YN_SERP_TITLE_EXCLUDE = /\b(?:of|the|a|an|for|our|any|no|your|all)\s+jobs?\s+(?:in|near)\b/i;
  function ynLooksLikeUnclaimedSerp() {
    const heading = ynText(document.querySelector("h1")) || document.title || "";
    if (!YN_SERP_TITLE_RE.test(heading) || YN_SERP_TITLE_EXCLUDE.test(heading)) {
      return false;
    }
    return document.querySelectorAll("h2 a[href], h3 a[href]").length >= 3;
  }
  function ynGuessJob() {
    const heading = ynText(document.querySelector("h1"));
    const title = (heading && !YN_GREETING.test(heading) ? heading : "") || document.title;
    const employer = ynFirstField(
      document.querySelector(
        "[class*='company' i], [data-company], [itemprop='hiringOrganization']"
      )
    );
    const desc = ynText(
      document.querySelector(
        "[class*='description' i], [id*='description' i], main, article"
      )
    );
    return {
      title,
      employer,
      url: location.href.split("?")[0],
      description: desc
    };
  }
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
      }
      try {
        description = ynText(document.querySelector(bSel));
      } catch {
      }
      if (title || description) {
        return { title, description, url: location.href.split("?")[0] };
      }
    }
    return null;
  }
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

  // extension/src/ui/capture/index.js
  function ynCaptureCurrent(devRules) {
    const blocked = ynBlockedReason();
    if (blocked) {
      return {
        ok: false,
        error: `page blocked, nothing captured (${blocked})`
      };
    }
    const pane = ynLinkedInOpenPaneJob();
    const serp = pane ? null : ynSerpJobs();
    if (serp) {
      if (!serp.length) {
        return {
          ok: false,
          error: "no job cards are loaded on this results page, nothing captured"
        };
      }
      return { ok: true, jobs: serp };
    }
    const devJob = ynDevSelectorJob(devRules);
    const knownSingleAdvert = devJob || ynLdJobPosting() || ynIndeedViewJob() || ynLinkedInJobView() || ynGradcrackerJob() || ynProspectsJob() || ynAtsPostingJob();
    if (!knownSingleAdvert && ynLooksLikeUnclaimedSerp()) {
      return {
        ok: false,
        error: "this looks like a search results page, not one job, nothing captured"
      };
    }
    const merged = pane || ynMergeJob([
      // The student's own rule leads: they wrote it because the readers
      // below cannot read this site, and the merge still fills any field
      // it leaves empty from the built-in rungs.
      devJob,
      ynLdJobPosting(),
      ynIndeedViewJob(),
      ynLinkedInJobView(),
      ynGradcrackerJob(),
      ynProspectsJob(),
      ynAtsPostingJob(),
      ynGuessJob()
    ]);
    let description = (merged.description || "").slice(0, 8e3);
    if (merged.salary && !description.includes(merged.salary)) {
      description = (description ? description + "\n" : "") + "Salary: " + merged.salary;
    }
    const job = {
      title: merged.title || "",
      employer: merged.employer || "",
      url: merged.url || location.href.split("?")[0],
      source: "capture:" + location.hostname,
      location: merged.location || "",
      description,
      mode: "jobview"
    };
    if (!job.title && !job.description) {
      return {
        ok: false,
        error: "nothing readable on this page, nothing captured"
      };
    }
    return { ok: true, job };
  }
  globalThis.ynVisibleText = ynVisibleText;
  globalThis.ynTidyBlock = ynTidyBlock;
  globalThis.ynHtmlToText = ynHtmlToText;
  globalThis.ynLdLocationText = ynLdLocationText;
  globalThis.ynLdSalaryText = ynLdSalaryText;
  globalThis.ynStripHiddenText = ynStripHiddenText;
  globalThis.ynLdJobPosting = ynLdJobPosting;
  globalThis.ynIndeedViewJob = ynIndeedViewJob;
  globalThis.ynAboutTheJobBody = ynAboutTheJobBody;
  globalThis.ynLinkedInTertiaryLocation = ynLinkedInTertiaryLocation;
  globalThis.ynLinkedInJobView = ynLinkedInJobView;
  globalThis.ynLinkedInOpenPaneJob = ynLinkedInOpenPaneJob;
  globalThis.ynIndeedSerpJobs = ynIndeedSerpJobs;
  globalThis.ynLinkedInSerpJobs = ynLinkedInSerpJobs;
  globalThis.ynNhsJobsSerpJobs = ynNhsJobsSerpJobs;
  globalThis.ynGradcrackerSerpJobs = ynGradcrackerSerpJobs;
  globalThis.ynTrackrSerpJobs = ynTrackrSerpJobs;
  globalThis.ynCvLibrarySerpJobs = ynCvLibrarySerpJobs;
  globalThis.ynGuardianJobsSerpJobs = ynGuardianJobsSerpJobs;
  globalThis.ynTotalJobsSerpJobs = ynTotalJobsSerpJobs;
  globalThis.ynSimplyHiredSerpJobs = ynSimplyHiredSerpJobs;
  globalThis.ynTargetJobsEmployer = ynTargetJobsEmployer;
  globalThis.ynTargetJobsSerpJobs = ynTargetJobsSerpJobs;
  globalThis.ynBrightNetworkSerpJobs = ynBrightNetworkSerpJobs;
  globalThis.ynHigherinSerpJobs = ynHigherinSerpJobs;
  globalThis.ynProspectsSerpJobs = ynProspectsSerpJobs;
  globalThis.ynSerpJobs = ynSerpJobs;
  globalThis.ynGradcrackerJob = ynGradcrackerJob;
  globalThis.ynProspectsJob = ynProspectsJob;
  globalThis.YN_ATS_JOB_TABLE = YN_ATS_JOB_TABLE;
  globalThis.ynFirstMatch = ynFirstMatch;
  globalThis.ynAtsDescriptionText = ynAtsDescriptionText;
  globalThis.ynFirstShown = ynFirstShown;
  globalThis.ynAtsPostingJob = ynAtsPostingJob;
  globalThis.YN_GREETING = YN_GREETING;
  globalThis.ynFirstField = ynFirstField;
  globalThis.YN_SERP_TITLE_RE = YN_SERP_TITLE_RE;
  globalThis.YN_SERP_TITLE_EXCLUDE = YN_SERP_TITLE_EXCLUDE;
  globalThis.ynLooksLikeUnclaimedSerp = ynLooksLikeUnclaimedSerp;
  globalThis.ynGuessJob = ynGuessJob;
  globalThis.ynDevRuleMatches = ynDevRuleMatches;
  globalThis.ynDevSelectorJob = ynDevSelectorJob;
  globalThis.ynMergeJob = ynMergeJob;
  globalThis.ynCaptureCurrent = ynCaptureCurrent;
})();
