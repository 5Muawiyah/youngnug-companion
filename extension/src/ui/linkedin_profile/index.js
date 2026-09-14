// content/linkedin_profile.js — LinkedIn PROFILE import.
// ASSIST MODE ONLY: never runs on page load. It reads the user's OWN profile
// page, in their OWN session, only when they explicitly click "Import" in the
// popup (the consent gate). The read is gated on IDENTITY, not just the /in/
// URL shape — ynIsViewerOwnProfile() requires owner-only page affordances,
// so a third party's public profile is refused even though its URL looks
// identical. Captcha or a login wall = HARD STOP. The data is STAGED
// server-side for the user to review and merge — never auto-written.
//
// Rewritten for the reworked LinkedIn profile DOM: CSS classes are
// build-hashed (never selector on them), the #experience-style id anchors and
// li.artdeco lists are gone, and text is no longer duplicated into
// aria-hidden spans. What holds instead, and what this reader is built on:
//   - sections are <section> blocks in <main>, titled by VISIBLE heading text
//     ("Experience", "Skills (17)" — trailing counts stripped);
//   - each entry (a role, a school, a certificate) renders behind a leading
//     logo <figure>, with <hr> separators between entries;
//   - entry data is read by walking TEXT NODES per entry block — no span or
//     list structure is assumed;
//   - sections mount lazily as the page scrolls, so the read is ASYNC: it
//     scrolls through the page harvesting sections as they appear (they can
//     unmount again — the best parse per section is kept), then restores the
//     scroll position. The message listener returns true and responds
//     asynchronously.
//
// Split into dom_helpers.js / parsers.js / reader.js plus this entry,
// which re-exposes every one of the original file's top-level names
// onto globalThis exactly as the single-file version did, and keeps
// the original file's own message-listener registration (the read is
// only ever triggered by the popup's explicit Import click) — see
// extension/src/index.js for why that is safe.
import {
  ynSleep,
  ynSettle,
  ynScroller,
  ynSectionHeading,
  ynFindSection,
  ynTextNodeLines,
  YN_NOISE_LINE,
  YN_META_LINE,
  ynEntryLines,
  ynMetaValue,
  ynSplitSkillList,
  ynSectionEntries,
} from "./dom_helpers.js";
import {
  YN_DATE_RANGE_RE,
  ynDateLineIndex,
  ynParseDates,
  ynBullets,
  YN_WORK_MODE_RE,
  ynSplitLocationLine,
  ynParseExperience,
  ynParseVolunteering,
  ynParseProjects,
  YN_PROFICIENCY_RE,
  ynParseLanguages,
  ynParseEducation,
  ynParseCertifications,
  ynParseSkillsInline,
  ynParseSkillsDetails,
  ynReadSkillsDetails,
} from "./parsers.js";
import {
  ynReadIdentity,
  ynOwnProfilePage,
  ynIsViewerOwnProfile,
  ynReadProfile,
  ynEmptyReadMessage,
} from "./reader.js";

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
      // a /details/ subpage shares the /in/ URL shape but holds one section;
      // the read needs the main profile page
      return {
        ok: false,
        error:
          "open your profile's MAIN page (linkedin.com/in/your-name) and try again",
      };
    }
    // Identity gate — refuse anyone else's profile, even at /in/.
    if (!ynIsViewerOwnProfile()) {
      return {
        ok: false,
        error:
          "This does not look like your own profile. Open YOUR LinkedIn profile " +
          "(the one with your Edit and 'Add section' controls) and try again.",
      };
    }
    const { data, read } = await ynReadProfile();
    if (
      !data.experience.length &&
      !data.education.length &&
      !data.skills.length &&
      !data.certifications.length &&
      !data.volunteering.length &&
      !data.projects.length &&
      !data.languages.length
    ) {
      return { ok: false, error: ynEmptyReadMessage(read) };
    }
    return { ok: true, data, read };
  })()
    .catch((e) => ({ ok: false, error: String(e) }))
    .then(sendResponse);
  return true; // async sendResponse — keep the message channel open
});
