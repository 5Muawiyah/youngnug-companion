(() => {
  // extension/src/ui/linkedin_profile/dom_helpers.js
  var ynSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function ynSettle(fn, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (; ; ) {
      const value = fn();
      if (value) return value;
      if (Date.now() >= deadline) return null;
      await ynSleep(400);
    }
  }
  function ynScroller() {
    const main = document.querySelector("main");
    if (main && main.scrollHeight > main.clientHeight + 50) return main;
    return document.scrollingElement || document.documentElement;
  }
  function ynSectionHeading(section) {
    const h = section.querySelector("h2, [role='heading']");
    if (!h) return "";
    return ynText(h).replace(/\s*\(\d+\)\s*$/, "");
  }
  function ynFindSection(re) {
    for (const s of document.querySelectorAll("main section")) {
      if (re.test(ynSectionHeading(s))) return s;
    }
    return null;
  }
  function ynTextNodeLines(root) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.replace(/\s+/g, " ").trim();
      if (t && out[out.length - 1] !== t) out.push(t);
    }
    return out;
  }
  var YN_NOISE_LINE = /^(…|·|more|see more|…see more|show credential|show project|show all\b.*|\d+\s+endorsements?|endorsed by\b.*|passed linkedin skill assessment|associated with\b.*)$/i;
  var YN_META_LINE = /^(Skills|Grade|Activities and societies)\s*:/i;
  function ynEntryLines(block) {
    const roots = Array.isArray(block) ? block : [block];
    const out = [];
    for (const root of roots) {
      for (const t of ynTextNodeLines(root)) {
        if (!YN_NOISE_LINE.test(t) && out[out.length - 1] !== t) out.push(t);
      }
    }
    return out;
  }
  function ynMetaValue(lines, label) {
    const re = new RegExp(`^${label}\\s*:\\s*(.+)$`, "i");
    for (const t of lines) {
      const m = re.exec(t);
      if (m) return m[1].trim();
    }
    return "";
  }
  function ynSplitSkillList(raw) {
    return (raw || "").split(/\s*[·,]\s*/).map((s) => s.trim()).filter((s) => s && s.length <= 60).slice(0, 15);
  }
  function ynSectionEntries(section) {
    const headingEl = section.querySelector("h2, [role='heading']");
    const blocks = [];
    for (const figure of section.querySelectorAll("figure")) {
      let el = figure;
      while (el.parentElement && el.parentElement !== section) {
        const parent = el.parentElement;
        if (headingEl && parent.contains(headingEl)) break;
        const kids = [...parent.children];
        const marked = kids.filter(
          (k) => k.tagName === "HR" || k.querySelector && k.querySelector("figure")
        );
        if (marked.length > 1 || kids.some((k) => k.tagName === "HR")) break;
        el = parent;
      }
      if (!blocks.includes(el)) blocks.push(el);
    }
    if (blocks.length) return blocks;
    const hr = section.querySelector("hr");
    if (!hr) return [];
    const groups = [];
    let current = [];
    for (const child of hr.parentElement.children) {
      if (child.tagName === "HR") {
        if (current.length) groups.push(current);
        current = [];
      } else if (!headingEl || !child.contains(headingEl)) {
        current.push(child);
      }
    }
    if (current.length) groups.push(current);
    return groups;
  }

  // extension/src/ui/linkedin_profile/parsers.js
  var YN_DATE_RANGE_RE = /(?<start>[A-Za-z]{3,9}\.?\s*\d{4}|\d{4})\s*(?:[-–—]|to)\s*(?<end>Present|[A-Za-z]{3,9}\.?\s*\d{4}|\d{4})/i;
  function ynDateLineIndex(lines) {
    return lines.findIndex((t) => t.length <= 60 && YN_DATE_RANGE_RE.test(t));
  }
  function ynParseDates(line) {
    const m = (line || "").match(YN_DATE_RANGE_RE);
    if (!m) return { start: "", end: "", current: false };
    const current = /present/i.test(m.groups.end);
    return { start: m.groups.start, end: current ? "" : m.groups.end, current };
  }
  function ynBullets(lines) {
    const out = [];
    for (const t of lines) {
      if (t.length < 40 || YN_META_LINE.test(t)) continue;
      for (const piece of t.split(/\n|(?:^|\s)[•·▪]\s*/)) {
        const line = piece.trim();
        if (line.length >= 20 && !out.includes(line))
          out.push(line.slice(0, 300));
      }
    }
    return out.slice(0, 6);
  }
  var YN_WORK_MODE_RE = /^(remote|hybrid|on-?site)$/i;
  function ynSplitLocationLine(raw) {
    const parts = (raw || "").split("·").map((p) => p.trim()).filter(Boolean);
    const mode = parts.find((p) => YN_WORK_MODE_RE.test(p)) || "";
    const location2 = parts.find((p) => !YN_WORK_MODE_RE.test(p)) || "";
    return {
      location: location2,
      work_mode: mode ? mode.toLowerCase().replace("onsite", "on-site") : ""
    };
  }
  function ynParseExperience(section) {
    return ynSectionEntries(section).slice(0, 15).map((block) => {
      const lines = ynEntryLines(block);
      const dateIdx = ynDateLineIndex(lines);
      const dates = ynParseDates(dateIdx >= 0 ? lines[dateIdx] : "");
      const role = lines[0] || "";
      const companyLine = dateIdx !== 1 ? lines[1] || "" : "";
      const company = companyLine.split("·")[0].trim();
      const employmentType = (companyLine.split("·")[1] || "").trim();
      const after = dateIdx >= 0 ? lines.slice(dateIdx + 1) : lines.slice(2);
      const locationLine = after.find(
        (t) => t.length <= 70 && !/\d{4}/.test(t) && !YN_META_LINE.test(t) && (/,/.test(t) || /remote|hybrid|on-site|united kingdom/i.test(t))
      ) || "";
      const { location: location2, work_mode } = ynSplitLocationLine(locationLine);
      return {
        role,
        company,
        employment_type: employmentType,
        location: location2 === company ? "" : location2,
        work_mode,
        ...dates,
        // the location line never doubles as a bullet, whatever its length
        bullets: ynBullets(after.filter((t) => t !== locationLine)),
        // the per-role "Skills: Excel · Python" line the page shows
        skills: ynSplitSkillList(ynMetaValue(after, "Skills"))
      };
    }).filter((e) => e.role || e.company);
  }
  function ynParseVolunteering(section) {
    return ynSectionEntries(section).slice(0, 10).map((block) => {
      const lines = ynEntryLines(block);
      const dateIdx = ynDateLineIndex(lines);
      const dates = ynParseDates(dateIdx >= 0 ? lines[dateIdx] : "");
      const after = dateIdx >= 0 ? lines.slice(dateIdx + 1) : lines.slice(2);
      return {
        role: lines[0] || "",
        organisation: dateIdx !== 1 ? lines[1] || "" : "",
        ...dates,
        bullets: ynBullets(after)
      };
    }).filter((e) => e.role || e.organisation);
  }
  function ynParseProjects(section) {
    return ynSectionEntries(section).slice(0, 10).map((block) => {
      const lines = ynEntryLines(block);
      const dateIdx = ynDateLineIndex(lines);
      const dates = ynParseDates(dateIdx >= 0 ? lines[dateIdx] : "");
      const after = dateIdx >= 0 ? lines.slice(dateIdx + 1) : lines.slice(1);
      return {
        name: lines[0] || "",
        start: dates.start,
        end: dates.end,
        current: dates.current,
        bullets: ynBullets(after),
        skills: ynSplitSkillList(ynMetaValue(after, "Skills"))
      };
    }).filter((e) => e.name);
  }
  var YN_PROFICIENCY_RE = /proficiency|native|bilingual|fluent|beginner/i;
  function ynParseLanguages(section) {
    const heading = ynSectionHeading(section);
    const out = [];
    for (const t of ynTextNodeLines(section)) {
      if (YN_NOISE_LINE.test(t) || t.length > 60) continue;
      if (t.replace(/\s*\(\d+\)\s*$/, "") === heading) continue;
      if (YN_PROFICIENCY_RE.test(t)) {
        const last = out[out.length - 1];
        if (last && !last.proficiency) last.proficiency = t;
        continue;
      }
      if (!out.some((l) => l.name === t)) out.push({ name: t, proficiency: "" });
    }
    return out.slice(0, 12);
  }
  function ynParseEducation(section) {
    return ynSectionEntries(section).slice(0, 8).map((block) => {
      const lines = ynEntryLines(block);
      const dateIdx = ynDateLineIndex(lines);
      const dates = ynParseDates(dateIdx >= 0 ? lines[dateIdx] : "");
      const course = lines.slice(1).find(
        (t, i) => i + 1 !== dateIdx && !YN_META_LINE.test(t) && t.length <= 120 && !YN_DATE_RANGE_RE.test(t)
      ) || "";
      return {
        institution: lines[0] || "",
        course,
        start: dates.start,
        end: dates.end,
        // "Grade: First-class honours" / "Grade: A*AA" — the page's own
        // words, never derived
        grade: ynMetaValue(lines, "Grade").slice(0, 80),
        activities: ynMetaValue(lines, "Activities and societies").slice(
          0,
          300
        )
      };
    }).filter((e) => e.institution);
  }
  function ynParseCertifications(section) {
    return ynSectionEntries(section).slice(0, 15).map((block) => {
      const lines = ynEntryLines(block);
      const issued = lines.find((t) => /^Issued\s/i.test(t)) || "";
      const credential = lines.find((t) => /credential id/i.test(t)) || "";
      let expires = "";
      for (const t of lines) {
        const m = /\bExpire[sd]\s+([A-Za-z]{3,9}\.?\s*\d{4}|\d{4})/i.exec(t);
        if (m) {
          expires = m[1];
          break;
        }
      }
      let credentialUrl = "";
      const roots = Array.isArray(block) ? block : [block];
      for (const root of roots) {
        for (const a of root.querySelectorAll("a[href]")) {
          if (!/show credential/i.test(a.textContent || "")) continue;
          const raw = a.getAttribute("href") || "";
          if (/^https?:\/\//.test(raw)) credentialUrl = raw.slice(0, 300);
          break;
        }
        if (credentialUrl) break;
      }
      return {
        name: lines[0] || "",
        issuing_org: lines[1] && !/^Issued\s/i.test(lines[1]) ? lines[1] : "",
        issued: issued.replace(/^Issued\s*/i, "").split("·")[0].trim(),
        expires,
        credential_id: credential.replace(/^Credential ID\s*/i, "").trim(),
        credential_url: credentialUrl,
        skills: ynSplitSkillList(ynMetaValue(lines, "Skills"))
      };
    }).filter((c) => c.name);
  }
  function ynParseSkillsInline(section) {
    const heading = ynSectionHeading(section);
    return ynTextNodeLines(section).filter(
      (t) => !YN_NOISE_LINE.test(t) && t.replace(/\s*\(\d+\)\s*$/, "") !== heading && t.length <= 60 && !/endorse/i.test(t) && !YN_DATE_RANGE_RE.test(t)
    ).filter((t, i, arr) => arr.indexOf(t) === i);
  }
  function ynParseSkillsDetails() {
    const main = document.querySelector("main");
    if (!main) return null;
    const title = [...main.querySelectorAll("h1, h2, p, span, div")].find(
      (el) => el.children.length === 0 && (el.textContent || "").trim() === "Skills"
    );
    const card = title ? title.closest("section") : null;
    if (!card) return null;
    const out = [];
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, {
      acceptNode(node2) {
        return node2.parentElement && node2.parentElement.closest("nav") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.replace(/\s+/g, " ").trim();
      if (!t || t === "Skills" || t.length > 60) continue;
      if (YN_NOISE_LINE.test(t) || /endorse/i.test(t) || YN_DATE_RANGE_RE.test(t))
        continue;
      if (!out.includes(t)) out.push(t);
    }
    return out;
  }
  async function ynReadSkillsDetails(section) {
    const link = [...section.querySelectorAll("a[href*='/details/skills']")].find(
      (a) => !/\/edit/.test(a.getAttribute("href") || "")
    );
    if (!link) return null;
    const before = location.href;
    const clickName = [
      link.textContent,
      link.getAttribute("aria-label"),
      link.getAttribute("name")
    ].filter(Boolean).join(" ");
    if (/submit|send application|apply now|finish|complete application/i.test(
      clickName
    )) {
      return null;
    }
    link.click();
    const found = await ynSettle(() => {
      if (!/\/details\/skills/.test(location.pathname)) return null;
      const scroller = ynScroller();
      scroller.scrollTop = scroller.scrollHeight;
      const skills = ynParseSkillsDetails();
      return skills && skills.length ? skills : null;
    }, 8e3);
    if (location.href !== before) {
      history.back();
      await ynSettle(() => location.href === before ? true : null, 4e3);
    }
    return found;
  }

  // extension/src/ui/linkedin_profile/reader.js
  function ynReadIdentity() {
    const top = document.querySelector("main section");
    let name = ynText(document.querySelector("main h1, h1"));
    let headline = ynText(
      document.querySelector(
        "main .text-body-medium, .top-card-layout__headline"
      )
    );
    if (top) {
      if (!name) name = ynSectionHeading(top);
      if (!headline) {
        const lines = ynTextNodeLines(top);
        const from = lines.indexOf(name);
        headline = lines.slice(from >= 0 ? from + 1 : 0).find(
          (t) => t !== name && t.length >= 5 && t.length <= 220 && !/^\S{1,10}\/\S{1,10}$/.test(t) && !/ · /.test(t) && !/^(Contact info|·|\d+\s+(connections?|followers?))/i.test(t) && !YN_NOISE_LINE.test(t)
        ) || "";
      }
    }
    let about = "";
    const aboutSection = ynFindSection(/^About$/i);
    if (aboutSection) {
      const texts = ynTextNodeLines(aboutSection).filter(
        (t) => t.toLowerCase() !== "about" && !YN_NOISE_LINE.test(t)
      );
      about = texts.sort((a, b) => b.length - a.length)[0] || "";
    }
    let profileLocation = "";
    if (top) {
      const lines = ynTextNodeLines(top);
      const contactIdx = lines.findIndex((t) => /^Contact info$/i.test(t));
      for (let i = contactIdx - 1; i >= 0; i -= 1) {
        const t = lines[i];
        if (t === "·" || YN_NOISE_LINE.test(t)) continue;
        if (t === name || t === headline) break;
        if (t.length <= 80 && !/\d+\s+(connections?|followers?)/i.test(t)) {
          profileLocation = t;
        }
        break;
      }
    }
    return {
      name: name.slice(0, 120),
      headline: headline.slice(0, 200),
      about: about.slice(0, 2e3),
      location: profileLocation.slice(0, 80)
    };
  }
  function ynOwnProfilePage() {
    if (/https:\/\/[^/]*linkedin\.com\/in\//.test(location.href)) return true;
    return ["127.0.0.1", "localhost"].includes(location.hostname) && location.pathname.startsWith("/in/");
  }
  function ynIsViewerOwnProfile() {
    const ownSignals = [
      'a[href*="/edit/forms/"]',
      'a[href*="/overlay/edit/"]',
      'button[aria-label*="Add profile section" i]',
      'a[aria-label*="Add profile section" i]',
      'button[aria-label*="Edit intro" i]',
      "#navigation-index-see-all-analytics",
      'a[href$="/detail/analytics/"]'
    ];
    for (const sel of ownSignals) {
      try {
        if (document.querySelector(sel)) return true;
      } catch {
      }
    }
    for (const el of document.querySelectorAll("main button, main a")) {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t === "Add section" || t === "Enhance profile") return true;
    }
    for (const s of document.querySelectorAll("main section")) {
      const h = s.querySelector("h2, [role='heading']");
      const heading = h ? (h.textContent || "").replace(/\s+/g, " ").trim() : "";
      if (!/^Analytics\b/i.test(heading)) continue;
      if (/who(?:'s| has)?\s+viewed your profile|search appearances/i.test(
        s.textContent || ""
      )) {
        return true;
      }
    }
    return false;
  }
  async function ynReadProfile() {
    const identity = ynReadIdentity();
    const scroller = ynScroller();
    const originalTop = scroller.scrollTop;
    const best = {
      experience: [],
      education: [],
      certifications: [],
      skillsInline: [],
      volunteering: [],
      projects: [],
      languages: []
    };
    const sectionsSeen = [];
    const harvest = () => {
      for (const s of document.querySelectorAll("main section")) {
        const heading = ynSectionHeading(s);
        if (!heading) continue;
        if (!sectionsSeen.includes(heading)) sectionsSeen.push(heading);
        if (/^Experience$/i.test(heading)) {
          const rows = ynParseExperience(s);
          if (rows.length > best.experience.length) best.experience = rows;
        } else if (/^Education$/i.test(heading)) {
          const rows = ynParseEducation(s);
          if (rows.length > best.education.length) best.education = rows;
        } else if (/^(Licenses|Licences) & certifications$/i.test(heading)) {
          const rows = ynParseCertifications(s);
          if (rows.length > best.certifications.length)
            best.certifications = rows;
        } else if (/^Skills$/i.test(heading)) {
          const rows = ynParseSkillsInline(s);
          if (rows.length > best.skillsInline.length) best.skillsInline = rows;
        } else if (/^Volunteering$/i.test(heading)) {
          const rows = ynParseVolunteering(s);
          if (rows.length > best.volunteering.length) best.volunteering = rows;
        } else if (/^Projects$/i.test(heading)) {
          const rows = ynParseProjects(s);
          if (rows.length > best.projects.length) best.projects = rows;
        } else if (/^Languages$/i.test(heading)) {
          const rows = ynParseLanguages(s);
          if (rows.length > best.languages.length) best.languages = rows;
        }
      }
    };
    harvest();
    let guard = 0;
    while (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 40 && guard < 50) {
      scroller.scrollBy(0, 650);
      await ynSleep(220);
      harvest();
      guard += 1;
    }
    await ynSleep(1200);
    harvest();
    let detailsSkills = null;
    const skillsSection = ynFindSection(/^Skills$/i);
    if (skillsSection) {
      try {
        detailsSkills = await ynReadSkillsDetails(skillsSection);
      } catch {
        detailsSkills = null;
      }
    }
    const restored = ynScroller();
    restored.scrollTop = originalTop;
    const merged = [...detailsSkills || [], ...best.skillsInline];
    const skills = merged.filter(
      (s, i) => s && s.length <= 60 && merged.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i
    ).slice(0, 40);
    const data = {
      ...identity,
      experience: best.experience,
      education: best.education,
      skills,
      certifications: best.certifications,
      volunteering: best.volunteering,
      projects: best.projects,
      languages: best.languages,
      source_url: location.href.split("?")[0]
    };
    const read = {
      experience: best.experience.length,
      education: best.education.length,
      skills: skills.length,
      certifications: best.certifications.length,
      volunteering: best.volunteering.length,
      projects: best.projects.length,
      languages: best.languages.length,
      skills_source: detailsSkills && detailsSkills.length ? "details" : best.skillsInline.length ? "profile" : "none",
      sections_seen: sectionsSeen
    };
    return { data, read };
  }
  function ynEmptyReadMessage(read) {
    const seen = read && read.sections_seen || [];
    const wanted = [
      "Experience",
      "Education",
      "Licenses & certifications",
      "Skills"
    ];
    const found = wanted.filter(
      (w) => seen.some((s) => s.toLowerCase().startsWith(w.split(" ")[0].toLowerCase()))
    );
    if (!found.length) {
      return "could not find the Experience, Education or Skills sections on this page. Scroll your profile once so they load, then try again";
    }
    const list = found.join(", ");
    return `found the ${list} section${found.length === 1 ? "" : "s"} but could not read any entries. LinkedIn may have changed its page layout again`;
  }

  // extension/src/ui/linkedin_profile/index.js
  globalThis.ynSleep = ynSleep;
  globalThis.ynSettle = ynSettle;
  globalThis.ynScroller = ynScroller;
  globalThis.ynSectionHeading = ynSectionHeading;
  globalThis.ynFindSection = ynFindSection;
  globalThis.ynTextNodeLines = ynTextNodeLines;
  globalThis.YN_NOISE_LINE = YN_NOISE_LINE;
  globalThis.YN_META_LINE = YN_META_LINE;
  globalThis.ynEntryLines = ynEntryLines;
  globalThis.ynMetaValue = ynMetaValue;
  globalThis.ynSplitSkillList = ynSplitSkillList;
  globalThis.ynSectionEntries = ynSectionEntries;
  globalThis.YN_DATE_RANGE_RE = YN_DATE_RANGE_RE;
  globalThis.ynDateLineIndex = ynDateLineIndex;
  globalThis.ynParseDates = ynParseDates;
  globalThis.ynBullets = ynBullets;
  globalThis.YN_WORK_MODE_RE = YN_WORK_MODE_RE;
  globalThis.ynSplitLocationLine = ynSplitLocationLine;
  globalThis.ynParseExperience = ynParseExperience;
  globalThis.ynParseVolunteering = ynParseVolunteering;
  globalThis.ynParseProjects = ynParseProjects;
  globalThis.YN_PROFICIENCY_RE = YN_PROFICIENCY_RE;
  globalThis.ynParseLanguages = ynParseLanguages;
  globalThis.ynParseEducation = ynParseEducation;
  globalThis.ynParseCertifications = ynParseCertifications;
  globalThis.ynParseSkillsInline = ynParseSkillsInline;
  globalThis.ynParseSkillsDetails = ynParseSkillsDetails;
  globalThis.ynReadSkillsDetails = ynReadSkillsDetails;
  globalThis.ynReadIdentity = ynReadIdentity;
  globalThis.ynOwnProfilePage = ynOwnProfilePage;
  globalThis.ynIsViewerOwnProfile = ynIsViewerOwnProfile;
  globalThis.ynReadProfile = ynReadProfile;
  globalThis.ynEmptyReadMessage = ynEmptyReadMessage;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "LINKEDIN_READ_PROFILE") return;
    (async () => {
      if (ynBlocked()) {
        return { ok: false, error: "captcha or login wall: stopped" };
      }
      if (!ynOwnProfilePage()) {
        return { ok: false, error: "open your own LinkedIn profile page first" };
      }
      if (/\/details\//.test(location.pathname)) {
        return {
          ok: false,
          error: "open your profile's MAIN page (linkedin.com/in/your-name) and try again"
        };
      }
      if (!ynIsViewerOwnProfile()) {
        return {
          ok: false,
          error: "This does not look like your own profile. Open YOUR LinkedIn profile (the one with your Edit and 'Add section' controls) and try again."
        };
      }
      const { data, read } = await ynReadProfile();
      if (!data.experience.length && !data.education.length && !data.skills.length && !data.certifications.length && !data.volunteering.length && !data.projects.length && !data.languages.length) {
        return { ok: false, error: ynEmptyReadMessage(read) };
      }
      return { ok: true, data, read };
    })().catch((e) => ({ ok: false, error: String(e) })).then(sendResponse);
    return true;
  });
})();
