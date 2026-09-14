// content/capture.js — capture the job(s) the user is looking at into their
// YoungNug account. NOT a manifest content script: nothing is auto-injected
// anywhere. The popup injects this file into the ACTIVE tab only when the
// user clicks "Capture" (activeTab + scripting) — the extension acts only in
// the user's own session, only when the user asks. This file DECLARES
// functions and runs nothing on load, so a second click simply re-declares
// them and can never double-register a listener. It stays the single source
// of truth for the capture heuristics; the popup owns no guessing of its own.
//
// Reads, in order of trust:
//   1. an ld+json JobPosting when the page carries a parseable one (the most
//      complete read where it exists);
//   2. a per-host reader for the single-advert hosts whose markup is known
//      (Indeed /viewjob, LinkedIn /jobs/view, Gradcracker /hub/, Prospects
//      /employer-profiles/);
//   3. the generic heuristic that has always been here.
// Recognised results pages return the cards ALREADY MOUNTED in the DOM
// instead — never a scroll, never a next page, never a fetch of the linked
// adverts; the body lives on the detail page the student opens themselves.
// The full per-site reader catalogue and its terms-of-use reasoning lives on
// each reader's own file (see the layer table below) rather than repeated
// here.
//
// Split across this folder (extension/src/ui/capture/) along the file's
// own seams: text.js (shared text-reading helpers), single_advert_core.js
// (the ld+json/Indeed/LinkedIn single-advert rungs), serp_uk_boards.js +
// serp_more_a.js + serp_more_b.js (the thirteen SERP readers, in three
// files under the 400-line limit, plus the ynSerpJobs dispatcher),
// single_advert_fallback.js (Gradcracker/Prospects advert pages and the
// per-ATS fallback), generic_and_dev.js (rung 3, the unclaimed-SERP
// refusal, the student's dev selectors, and ynMergeJob) — plus this entry,
// which re-exposes every one of the original file's top-level names onto
// globalThis exactly as the single-file version did. See
// extension/src/index.js for why that is safe: chrome.scripting still
// injects the BUILT content/capture.js as one classic script, and every
// name assigned onto globalThis here is the same bare name a later-injected
// file (or the popup's own chrome.scripting.executeScript func, which runs
// in this same isolated world) could already call.
//
// Civil Service Jobs was tried live and answered a bot-check interstitial
// ("Quick Check Needed" / "I'm not a robot") on every attempt — no reader
// exists for it, and none is guessed.
import { ynVisibleText, ynTidyBlock, ynHtmlToText, ynLdLocationText, ynLdSalaryText, ynStripHiddenText } from "./text.js";
import {
  ynLdJobPosting,
  ynIndeedViewJob,
  ynAboutTheJobBody,
  ynLinkedInTertiaryLocation,
  ynLinkedInJobView,
  ynLinkedInOpenPaneJob,
} from "./single_advert_core.js";
import { ynIndeedSerpJobs, ynLinkedInSerpJobs, ynNhsJobsSerpJobs, ynGradcrackerSerpJobs, ynTrackrSerpJobs } from "./serp_uk_boards.js";
import { ynCvLibrarySerpJobs, ynGuardianJobsSerpJobs, ynTotalJobsSerpJobs, ynSimplyHiredSerpJobs } from "./serp_more_a.js";
import {
  ynTargetJobsEmployer,
  ynTargetJobsSerpJobs,
  ynBrightNetworkSerpJobs,
  ynHigherinSerpJobs,
  ynProspectsSerpJobs,
  ynSerpJobs,
} from "./serp_more_b.js";
import {
  ynGradcrackerJob,
  ynProspectsJob,
  YN_ATS_JOB_TABLE,
  ynFirstMatch,
  ynAtsDescriptionText,
  ynFirstShown,
  ynAtsPostingJob,
} from "./single_advert_fallback.js";
import {
  YN_GREETING,
  ynFirstField,
  YN_SERP_TITLE_RE,
  YN_SERP_TITLE_EXCLUDE,
  ynLooksLikeUnclaimedSerp,
  ynGuessJob,
  ynDevRuleMatches,
  ynDevSelectorJob,
  ynMergeJob,
} from "./generic_and_dev.js";

// The whole read, in one call the popup injects and awaits. Single adverts
// answer {ok, job}; recognised results pages answer {ok, jobs} for the popup
// to save one by one. devRules: the student's validated per-site selector
// rules, read from storage by the caller and passed in (see ynDevSelectorJob).
function ynCaptureCurrent(devRules) {
  // Captcha / bot-gate / login wall = HARD STOP. Never bypassed, never solved.
  // The stop is unchanged; only the sentence changed. It now names which of
  // the six sentinels fired, because "page blocked (captcha/login)" is true of
  // all six and actionable for none of them.
  const blocked = ynBlockedReason();
  if (blocked) {
    return {
      ok: false,
      error: `page blocked, nothing captured (${blocked})`,
    };
  }
  // The OPEN advert on a results page wins over its thin cards: capturing
  // what the student is reading is the click's meaning there.
  const pane = ynLinkedInOpenPaneJob();
  const serp = pane ? null : ynSerpJobs();
  if (serp) {
    if (!serp.length) {
      return {
        ok: false,
        error: "no job cards are loaded on this results page, nothing captured",
      };
    }
    return { ok: true, jobs: serp };
  }
  // A results page no per-site SERP handler above claimed must not fall
  // through to the generic guesser below as if it were one advert — the
  // production defect this whole file changed for. Only checked once none
  // of the four rungs that read a KNOWN single-advert page have anything
  // (each is a pure, side-effect-free DOM read, so calling it again here
  // costs nothing and leaves the pinned rung order in the merge below
  // untouched).
  // A matching dev rule that READ something is an explicit claim by the
  // student that this page is one advert with these fields — so it also
  // counts as "known" for the unclaimed-SERP refusal below.
  const devJob = ynDevSelectorJob(devRules);
  const knownSingleAdvert =
    devJob ||
    ynLdJobPosting() ||
    ynIndeedViewJob() ||
    ynLinkedInJobView() ||
    ynGradcrackerJob() ||
    ynProspectsJob() ||
    ynAtsPostingJob();
  if (!knownSingleAdvert && ynLooksLikeUnclaimedSerp()) {
    return {
      ok: false,
      error: "this looks like a search results page, not one job, nothing captured",
    };
  }
  const merged =
    pane ||
    ynMergeJob([
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
      ynGuessJob(),
    ]);
  let description = (merged.description || "").slice(0, 8000);
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
    mode: "jobview",
  };
  // e.g. the built-in PDF viewer, or a blank tab: injection succeeds but there
  // is no readable page. Say so rather than filing an empty job.
  if (!job.title && !job.description) {
    return {
      ok: false,
      error: "nothing readable on this page, nothing captured",
    };
  }
  return { ok: true, job };
}

// Every name that was top-level in the single-file version, assigned onto
// globalThis so a later-injected file (or the popup's own executeScript
// func closure, which runs in this same isolated world) can still call it
// as a bare name — the full set, restored regardless of whether this file
// itself still calls each one, exactly as the aria_driver migration did.
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
