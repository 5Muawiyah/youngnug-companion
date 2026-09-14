// content/linkedin_profile.js, part 3 of 4 — the identity gate
// (own-profile checks) and ynReadProfile, the top-level scroll-and-
// harvest read every section parser feeds into. See index.js for the
// file's full banner.

import {
  ynSleep,
  ynScroller,
  ynSectionHeading,
  ynFindSection,
  ynTextNodeLines,
  YN_NOISE_LINE,
} from "./dom_helpers.js";
import {
  ynParseExperience,
  ynParseVolunteering,
  ynParseProjects,
  ynParseLanguages,
  ynParseEducation,
  ynParseCertifications,
  ynParseSkillsInline,
  ynReadSkillsDetails,
} from "./parsers.js";

// ---------------------------------------------------------------- identity

export function ynReadIdentity() {
  // The reworked page has no <h1>: the intro card is the FIRST section in
  // <main>, titled with the person's name. Legacy selectors stay as
  // fallbacks for older layouts.
  const top = document.querySelector("main section");
  let name = ynText(document.querySelector("main h1, h1"));
  let headline = ynText(
    document.querySelector(
      "main .text-body-medium, .top-card-layout__headline",
    ),
  );
  if (top) {
    if (!name) name = ynSectionHeading(top);
    if (!headline) {
      // first line after the name that is not a pronoun chip, a badge, the
      // affiliation line ("Employer · School" — the " · " separator marks
      // it) or the connection count
      const lines = ynTextNodeLines(top);
      const from = lines.indexOf(name);
      headline =
        lines
          .slice(from >= 0 ? from + 1 : 0)
          .find(
            (t) =>
              t !== name &&
              t.length >= 5 &&
              t.length <= 220 &&
              !/^\S{1,10}\/\S{1,10}$/.test(t) &&
              !/ · /.test(t) &&
              !/^(Contact info|·|\d+\s+(connections?|followers?))/i.test(t) &&
              !YN_NOISE_LINE.test(t),
          ) || "";
    }
  }
  let about = "";
  const aboutSection = ynFindSection(/^About$/i);
  if (aboutSection) {
    const texts = ynTextNodeLines(aboutSection).filter(
      (t) => t.toLowerCase() !== "about" && !YN_NOISE_LINE.test(t),
    );
    about = texts.sort((a, b) => b.length - a.length)[0] || "";
  }
  // The intro card's location line ("London, England, United Kingdom") sits
  // immediately before "Contact info". Read only what the page shows; when
  // no such line exists, location stays empty — never guessed.
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
    about: about.slice(0, 2000),
    location: profileLocation.slice(0, 80),
  };
}

// --------------------------------------------------------------- the guard

export function ynOwnProfilePage() {
  // URL SHAPE only — necessary, NOT sufficient. Every public LinkedIn profile
  // is linkedin.com/in/<vanity> (and its /details/* subpages share the
  // shape), so this cannot tell your profile from anyone else's;
  // ynIsViewerOwnProfile() below is the identity gate that does.
  // Loopback is allowed for a local FIXTURE page (MV3 cannot inject into
  // file:// tabs, so a test serves a copy of the DOM on 127.0.0.1 — never
  // live LinkedIn).
  if (/https:\/\/[^/]*linkedin\.com\/in\//.test(location.href)) return true;
  return (
    ["127.0.0.1", "localhost"].includes(location.hostname) &&
    location.pathname.startsWith("/in/")
  );
}

// The extension reads ONLY the signed-in user's OWN profile.
// URL shape is not identity — a /in/ page is equally anyone's public profile.
// LinkedIn renders a distinct set of affordances SOLELY for the profile's
// owner; a third party's page shows Connect / Message / Follow and NONE of
// them. We require at least one strong owner-only signal, and bias hard
// toward REFUSING: a false negative just asks the user to open their own
// profile (recoverable); a false positive would read a third party (the
// exact harm this gate removes).
//
// The ?isSelfProfile=true URL param (added when LinkedIn redirects /in/me/)
// is deliberately NOT a signal: anyone can type it onto a third party's URL.
export function ynIsViewerOwnProfile() {
  // 1) owner-only edit affordances with stable attribute shapes — the
  //    per-section edit links on the current DOM, plus older generations'
  //    selectors kept as fallbacks (they cost nothing and cover stragglers)
  const ownSignals = [
    'a[href*="/edit/forms/"]',
    'a[href*="/overlay/edit/"]',
    'button[aria-label*="Add profile section" i]',
    'a[aria-label*="Add profile section" i]',
    'button[aria-label*="Edit intro" i]',
    "#navigation-index-see-all-analytics",
    'a[href$="/detail/analytics/"]',
  ];
  for (const sel of ownSignals) {
    try {
      if (document.querySelector(sel)) return true;
    } catch {
      /* bad selector on this DOM — skip */
    }
  }
  // 2) owner-only CONTROL TEXT in the intro card. The current DOM labels the
  //    owner's controls "Add section" / "Enhance profile"; a visitor gets
  //    Connect / Message / Follow instead. Exact-match on the trimmed text so
  //    incidental page copy cannot satisfy it.
  for (const el of document.querySelectorAll("main button, main a")) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t === "Add section" || t === "Enhance profile") return true;
  }
  // 3) the private analytics card — "who's viewed your profile" / "search
  //    appearances" render only for the owner. Scoped to a section HEADED
  //    "Analytics" so incidental copy elsewhere cannot spoof it.
  for (const s of document.querySelectorAll("main section")) {
    const h = s.querySelector("h2, [role='heading']");
    const heading = h ? (h.textContent || "").replace(/\s+/g, " ").trim() : "";
    if (!/^Analytics\b/i.test(heading)) continue;
    if (
      /who(?:'s| has)?\s+viewed your profile|search appearances/i.test(
        s.textContent || "",
      )
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- the read

// Scroll through the page harvesting the profile sections as they mount.
// Virtualisation can UNMOUNT a section again after it scrolls past, so each
// harvest keeps the best (longest) parse per section rather than an element
// reference. Returns { data, read } where `read` is the honest per-section
// report the popup relays.
export async function ynReadProfile() {
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
    languages: [],
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
  while (
    scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 40 &&
    guard < 50
  ) {
    scroller.scrollBy(0, 650);
    await ynSleep(220);
    harvest();
    guard += 1;
  }
  await ynSleep(1200);
  harvest();

  // the full skills list — same-tab details subpage, restored afterwards
  let detailsSkills = null;
  const skillsSection = ynFindSection(/^Skills$/i);
  if (skillsSection) {
    try {
      detailsSkills = await ynReadSkillsDetails(skillsSection);
    } catch {
      detailsSkills = null; // keep the inline preview — reported below
    }
  }
  const restored = ynScroller();
  restored.scrollTop = originalTop;

  const merged = [...(detailsSkills || []), ...best.skillsInline];
  const skills = merged
    .filter(
      (s, i) =>
        s &&
        s.length <= 60 &&
        merged.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i,
    )
    .slice(0, 40);

  const data = {
    ...identity,
    experience: best.experience,
    education: best.education,
    skills,
    certifications: best.certifications,
    volunteering: best.volunteering,
    projects: best.projects,
    languages: best.languages,
    source_url: location.href.split("?")[0],
  };
  const read = {
    experience: best.experience.length,
    education: best.education.length,
    skills: skills.length,
    certifications: best.certifications.length,
    volunteering: best.volunteering.length,
    projects: best.projects.length,
    languages: best.languages.length,
    skills_source:
      detailsSkills && detailsSkills.length
        ? "details"
        : best.skillsInline.length
          ? "profile"
          : "none",
    sections_seen: sectionsSeen,
  };
  return { data, read };
}

// The blanket "could not read anything" is gone: say WHICH profile sections
// were found and which read empty, so the user (and a bug report) can tell a
// half-loaded page from a LinkedIn layout change.
export function ynEmptyReadMessage(read) {
  const seen = (read && read.sections_seen) || [];
  const wanted = [
    "Experience",
    "Education",
    "Licenses & certifications",
    "Skills",
  ];
  const found = wanted.filter((w) =>
    seen.some((s) => s.toLowerCase().startsWith(w.split(" ")[0].toLowerCase())),
  );
  if (!found.length) {
    return (
      "could not find the Experience, Education or Skills sections on this " +
      "page. Scroll your profile once so they load, then try again"
    );
  }
  const list = found.join(", ");
  return (
    `found the ${list} section${found.length === 1 ? "" : "s"} but could not ` +
    "read any entries. LinkedIn may have changed its page layout again"
  );
}
