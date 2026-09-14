// content/linkedin_profile.js, part 2 of 4 — per-section parsers
// (dates, experience, volunteering, projects, languages, education,
// certifications, skills). See index.js for the file's full banner.

import {
  ynSettle,
  ynScroller,
  ynSectionHeading,
  ynTextNodeLines,
  YN_NOISE_LINE,
  YN_META_LINE,
  ynEntryLines,
  ynMetaValue,
  ynSplitSkillList,
  ynSectionEntries,
} from "./dom_helpers.js";

// ------------------------------------------------------------------- dates

// Live pages mix hyphen, en dash and em dash in date ranges
// ("Mar 2021 - May 2023 · 2 yrs 3 mos", "2023 – 2026").
export const YN_DATE_RANGE_RE =
  /(?<start>[A-Za-z]{3,9}\.?\s*\d{4}|\d{4})\s*(?:[-–—]|to)\s*(?<end>Present|[A-Za-z]{3,9}\.?\s*\d{4}|\d{4})/i;

// The date line is short ("Jun 2024 - Present · 1 yr") — the length guard
// keeps a year range inside a long description bullet from being taken for
// the entry's dates.
export function ynDateLineIndex(lines) {
  return lines.findIndex((t) => t.length <= 60 && YN_DATE_RANGE_RE.test(t));
}

export function ynParseDates(line) {
  const m = (line || "").match(YN_DATE_RANGE_RE);
  if (!m) return { start: "", end: "", current: false };
  const current = /present/i.test(m.groups.end);
  return { start: m.groups.start, end: current ? "" : m.groups.end, current };
}

export function ynBullets(lines) {
  // The description under a role becomes CV bullets — long text lines split
  // on newlines and bullet dots. Only the user's own words, never invented.
  // Labelled meta lines (Skills/Grade/Activities) are parsed into their own
  // fields elsewhere, never into bullets.
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

// "London, England · Hybrid" / "Remote" — the work mode rides the location
// line on the current DOM. Split them so each lands in its own field.
export const YN_WORK_MODE_RE = /^(remote|hybrid|on-?site)$/i;

export function ynSplitLocationLine(raw) {
  const parts = (raw || "")
    .split("·")
    .map((p) => p.trim())
    .filter(Boolean);
  const mode = parts.find((p) => YN_WORK_MODE_RE.test(p)) || "";
  const location = parts.find((p) => !YN_WORK_MODE_RE.test(p)) || "";
  return {
    location,
    work_mode: mode ? mode.toLowerCase().replace("onsite", "on-site") : "",
  };
}

// ------------------------------------------------------------ per section

export function ynParseExperience(section) {
  return ynSectionEntries(section)
    .slice(0, 15)
    .map((block) => {
      const lines = ynEntryLines(block);
      const dateIdx = ynDateLineIndex(lines);
      const dates = ynParseDates(dateIdx >= 0 ? lines[dateIdx] : "");
      const role = lines[0] || "";
      // the company line sits between the role and the dates ("Company" or
      // "Company · Part-time"); a grouped multi-role block parses roughly —
      // every imported row is [CONFIRM]-reviewed by the user before use
      const companyLine = dateIdx !== 1 ? lines[1] || "" : "";
      const company = companyLine.split("·")[0].trim();
      const employmentType = (companyLine.split("·")[1] || "").trim();
      const after = dateIdx >= 0 ? lines.slice(dateIdx + 1) : lines.slice(2);
      const locationLine =
        after.find(
          (t) =>
            t.length <= 70 &&
            !/\d{4}/.test(t) &&
            !YN_META_LINE.test(t) &&
            (/,/.test(t) || /remote|hybrid|on-site|united kingdom/i.test(t)),
        ) || "";
      const { location, work_mode } = ynSplitLocationLine(locationLine);
      return {
        role,
        company,
        employment_type: employmentType,
        location: location === company ? "" : location,
        work_mode,
        ...dates,
        // the location line never doubles as a bullet, whatever its length
        bullets: ynBullets(after.filter((t) => t !== locationLine)),
        // the per-role "Skills: Excel · Python" line the page shows
        skills: ynSplitSkillList(ynMetaValue(after, "Skills")),
      };
    })
    .filter((e) => e.role || e.company);
}

// The Volunteering card: role / organisation / dates / (cause) /
// description. Same block shapes as Experience; organisation is its own
// key so the server maps it to the volunteering section, never employment.
export function ynParseVolunteering(section) {
  return ynSectionEntries(section)
    .slice(0, 10)
    .map((block) => {
      const lines = ynEntryLines(block);
      const dateIdx = ynDateLineIndex(lines);
      const dates = ynParseDates(dateIdx >= 0 ? lines[dateIdx] : "");
      const after = dateIdx >= 0 ? lines.slice(dateIdx + 1) : lines.slice(2);
      return {
        role: lines[0] || "",
        organisation: dateIdx !== 1 ? lines[1] || "" : "",
        ...dates,
        bullets: ynBullets(after),
      };
    })
    .filter((e) => e.role || e.organisation);
}

// The Projects card: name / dates / description / (Skills: …). Entries often
// carry no logo figure — ynSectionEntries falls back to <hr> splitting.
export function ynParseProjects(section) {
  return ynSectionEntries(section)
    .slice(0, 10)
    .map((block) => {
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
        skills: ynSplitSkillList(ynMetaValue(after, "Skills")),
      };
    })
    .filter((e) => e.name);
}

// The Languages card: name + proficiency line pairs, no logos, no dates.
export const YN_PROFICIENCY_RE = /proficiency|native|bilingual|fluent|beginner/i;

export function ynParseLanguages(section) {
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

export function ynParseEducation(section) {
  return ynSectionEntries(section)
    .slice(0, 8)
    .map((block) => {
      const lines = ynEntryLines(block);
      const dateIdx = ynDateLineIndex(lines);
      const dates = ynParseDates(dateIdx >= 0 ? lines[dateIdx] : "");
      // the course line can sit before OR after the dates ("Institution /
      // dates / course" is what the live page renders today)
      const course =
        lines
          .slice(1)
          .find(
            (t, i) =>
              i + 1 !== dateIdx &&
              !YN_META_LINE.test(t) &&
              t.length <= 120 &&
              !YN_DATE_RANGE_RE.test(t),
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
          300,
        ),
      };
    })
    .filter((e) => e.institution);
}

export function ynParseCertifications(section) {
  return ynSectionEntries(section)
    .slice(0, 15)
    .map((block) => {
      const lines = ynEntryLines(block);
      const issued = lines.find((t) => /^Issued\s/i.test(t)) || "";
      const credential = lines.find((t) => /credential id/i.test(t)) || "";
      // "Expires Aug 2027" — its own line, or riding the Issued line
      // ("Issued Aug 2025 · Expires Aug 2027")
      let expires = "";
      for (const t of lines) {
        const m = /\bExpire[sd]\s+([A-Za-z]{3,9}\.?\s*\d{4}|\d{4})/i.exec(t);
        if (m) {
          expires = m[1];
          break;
        }
      }
      // the "Show credential" link's real destination (never invented)
      let credentialUrl = "";
      const roots = Array.isArray(block) ? block : [block];
      for (const root of roots) {
        for (const a of root.querySelectorAll("a[href]")) {
          if (!/show credential/i.test(a.textContent || "")) continue;
          // the RAW attribute: a same-page "#" placeholder must not resolve
          // to the profile URL and masquerade as a credential link
          const raw = a.getAttribute("href") || "";
          if (/^https?:\/\//.test(raw)) credentialUrl = raw.slice(0, 300);
          break;
        }
        if (credentialUrl) break;
      }
      return {
        name: lines[0] || "",
        issuing_org: lines[1] && !/^Issued\s/i.test(lines[1]) ? lines[1] : "",
        issued: issued
          .replace(/^Issued\s*/i, "")
          .split("·")[0]
          .trim(),
        expires,
        credential_id: credential.replace(/^Credential ID\s*/i, "").trim(),
        credential_url: credentialUrl,
        skills: ynSplitSkillList(ynMetaValue(lines, "Skills")),
      };
    })
    .filter((c) => c.name);
}

// The Skills card on the profile page previews only a couple of skills; the
// full list lives on /details/skills/ (ynReadSkillsDetails below).
export function ynParseSkillsInline(section) {
  const heading = ynSectionHeading(section);
  return ynTextNodeLines(section)
    .filter(
      (t) =>
        !YN_NOISE_LINE.test(t) &&
        t.replace(/\s*\(\d+\)\s*$/, "") !== heading &&
        t.length <= 60 &&
        !/endorse/i.test(t) &&
        !YN_DATE_RANGE_RE.test(t),
    )
    .filter((t, i, arr) => arr.indexOf(t) === i);
}

// The full skills list on the /details/skills/ card. Details pages carry no
// h2 — the card titles itself with a plain "Skills" text node; the filter
// pills live in a <nav>, so nothing inside one is a skill name.
export function ynParseSkillsDetails() {
  const main = document.querySelector("main");
  if (!main) return null;
  const title = [...main.querySelectorAll("h1, h2, p, span, div")].find(
    (el) =>
      el.children.length === 0 && (el.textContent || "").trim() === "Skills",
  );
  const card = title ? title.closest("section") : null;
  if (!card) return null;
  const out = [];
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement && node.parentElement.closest("nav")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  let node;
  while ((node = walker.nextNode())) {
    const t = node.textContent.replace(/\s+/g, " ").trim();
    if (!t || t === "Skills" || t.length > 60) continue;
    if (YN_NOISE_LINE.test(t) || /endorse/i.test(t) || YN_DATE_RANGE_RE.test(t))
      continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

// Visit /in/<slug>/details/skills/ IN THE SAME TAB via the Skills card's own
// "Show all" link — a real SPA soft-navigation, exactly the click the user
// would make, so this content script (and the popup's open message channel)
// survives. history.back() restores the profile page afterwards.
// Best-effort with a hard time budget: on any timeout the inline preview is
// kept and the read report says which source the skills came from.
export async function ynReadSkillsDetails(section) {
  const link = [...section.querySelectorAll("a[href*='/details/skills']")].find(
    (a) => !/\/edit/.test(a.getAttribute("href") || ""),
  );
  if (!link) return null;
  const before = location.href;
  const clickName = [
    link.textContent,
    link.getAttribute("aria-label"),
    link.getAttribute("name"),
  ]
    .filter(Boolean)
    .join(" ");
  if (
    /submit|send application|apply now|finish|complete application/i.test(
      clickName,
    )
  ) {
    return null;
  }
  // The ONE programmatic click this reader performs: the Skills card's own
  // "Show all" NAVIGATION link, refused above under ynSubmitGuard's rule
  // (engine.js is not loaded here, so the same regex is applied inline —
  // anything submit-shaped is never clicked).
  link.click();
  const found = await ynSettle(() => {
    if (!/\/details\/skills/.test(location.pathname)) return null;
    const scroller = ynScroller();
    scroller.scrollTop = scroller.scrollHeight; // lazy lists mount on scroll
    const skills = ynParseSkillsDetails();
    return skills && skills.length ? skills : null;
  }, 8000);
  if (location.href !== before) {
    history.back();
    await ynSettle(() => (location.href === before ? true : null), 4000);
  }
  return found;
}
