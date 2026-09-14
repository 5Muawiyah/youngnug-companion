// src/common/liveness_markers/index.js — source for the shipped
// common/liveness_markers.js (the EXACT phrases a job-board
// page itself displays when an advert has closed).
//
// Migrated verbatim from the original file, plus the closing-set change
// (see YN_CLOSED_MARKERS_CONFIRMED_HOSTS below) — no other behaviour
// change. One shipped file, one entry, no split (under 400 lines): see
// extension/src/index.js for the migration's design and
// extension/src/entries.json for the build mapping. Bundled by
// scripts/build_extension.py back into common/liveness_markers.js, injected
// ahead of content/liveness_check.js on every page it checks.
//
// Every entry below names the ONE site that shows it and its provenance
// (verified against a live page, or carried on strong public
// corroboration alone) — each phrase's own comment carries that record.
//
// THE CLOSING SET: a phrase existing in YN_CLOSED_MARKERS_BY_HOST is
// necessary but NOT sufficient to produce a "closed" verdict. It must ALSO
// be in YN_CLOSED_MARKERS_CONFIRMED_HOSTS — the explicit, separate list of
// host families whose phrase has been confirmed against a REAL live expired
// posting, recorded by a live check this module cannot perform itself. A
// phrase match on a host NOT in the confirmed set answers "could_not_tell"
// — never a guess —
// naming the candidate phrase so the reason is still inspectable. Today
// neither Indeed's phrase nor LinkedIn's has been confirmed live (each
// phrase's own comment below says so), so YN_CLOSED_MARKERS_CONFIRMED_HOSTS
// starts EMPTY: this reader currently never answers "closed" on either
// site, by construction, until a live check adds a host here. The iron rule
// this extends is the same one the server enforces
// server-side: a false "expired" hides a real job from a student, the
// worse of the two possible mistakes, so an UNPROVEN phrase is treated
// exactly like no phrase at all.
"use strict";

// Per-site closed-state phrases. uk.indeed.com/www.indeed.com /viewjob —
// the advert's own status line, shown in place of the Apply button.
// PROVENANCE: well documented across Indeed's own help content and
// independent third-party write-ups quoting this exact string; NOT
// confirmed against a live expired posting (no expired Indeed
// URL was reachable on demand — expired postings are pulled from search and
// their old links 404 rather than rendering the banner for a crawler to
// find). NOT in the confirmed set below — see the module docstring.
const YN_CLOSED_MARKERS_INDEED = ["This job has expired"];

// www.linkedin.com/jobs/view — LinkedIn's own closed-state line.
// PROVENANCE: corroborated by multiple independent LinkedIn posts (job
// seekers and recruiters) quoting this exact string as what the site shows;
// NOT confirmed against a live closed posting (a closed
// LinkedIn advert drops out of search entirely, so none was reachable on
// demand). NOT in the confirmed set below — see the module
// docstring.
const YN_CLOSED_MARKERS_LINKEDIN = ["No longer accepting applications"];

const YN_CLOSED_MARKERS_BY_HOST = {
  "indeed.": YN_CLOSED_MARKERS_INDEED,
  "linkedin.": YN_CLOSED_MARKERS_LINKEDIN,
};

// The closing set: host-family keys (matching
// YN_CLOSED_MARKERS_BY_HOST's own keys) whose phrase a live check has
// confirmed against a real expired posting. `let`, not `const`: a live
// check (or a test proving the gate) adds to it; production code never
// removes from it once a site is confirmed. Empty at this release — see the
// module docstring for why.
let YN_CLOSED_MARKERS_CONFIRMED_HOSTS = new Set();

/** Which family (if any) this hostname belongs to — same startswith/suffix
 * shape background.js's ynHostIsAggregator already uses, so the two never
 * quietly disagree about what counts as "an Indeed page" or "a LinkedIn
 * page". */
function ynLivenessHostFamily(hostname) {
  const h = String(hostname || "").toLowerCase();
  for (const prefix of Object.keys(YN_CLOSED_MARKERS_BY_HOST)) {
    if (h.startsWith(prefix) || ("." + h).includes("." + prefix)) return prefix;
  }
  return null;
}

/** The page's own text — the only thing a phrase match reads, never markup
 * or an attribute. `textContent`, not `innerText`: every other reader in
 * this extension already reads `textContent` (common/api.js's `ynText()`),
 * and unlike `innerText` it needs no CSS layout, which is what a jsdom test
 * harness cannot provide. `<script>`/`<style>`/`<noscript>` are excluded
 * from the clone first so a JSON-LD payload or CSS block can never
 * accidentally contain a closed phrase. */
function ynVisibleText() {
  if (!document.body) return "";
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  return clone.textContent || "";
}

/**
 * The whole read: {verdict, evidence}.
 *   verdict   "live" | "closed" | "could_not_tell"
 *   evidence  the EXACT matched phrase for a CONFIRMED "closed"; the named
 *             sentinel/reason (or the unconfirmed phrase itself) for
 *             "could_not_tell"; "" for "live" (nothing to say)
 * Never throws — an unreadable page answers could_not_tell, not an
 * exception the caller has to guard against.
 */
function ynDetectLiveness() {
  try {
    // Captcha / bot-gate / login wall — the SAME named sentinels
    // content/capture.js's hard stop already uses (common/
    // challenge_detect.js). Checked FIRST: a login wall's own title can
    // otherwise coincide with page text a looser reader might misparse.
    const blocked = ynBlockedReason();
    if (blocked) {
      return { verdict: "could_not_tell", evidence: blocked };
    }
    const text = ynVisibleText();
    if (!text.trim()) {
      return { verdict: "could_not_tell", evidence: "empty page" };
    }
    const family = ynLivenessHostFamily(location.hostname);
    if (!family) {
      // No marker list exists for this host at all — never guess "live"
      // for a page this reader was never taught, exactly like the
      // server-side "unsupported" answer for a source liveness_service.py
      // has no family for.
      return { verdict: "could_not_tell", evidence: "unrecognised page layout" };
    }
    for (const phrase of YN_CLOSED_MARKERS_BY_HOST[family]) {
      if (text.includes(phrase)) {
        if (YN_CLOSED_MARKERS_CONFIRMED_HOSTS.has(family)) {
          return { verdict: "closed", evidence: phrase };
        }
        // a phrase this reader knows about, on a host a live check has
        // not yet confirmed — never "closed" on an unproven phrase, however
        // well corroborated the text itself is. The evidence still names
        // the candidate phrase so a future live check (or a person reading a
        // could_not_tell report) can see exactly what nearly fired.
        return {
          verdict: "could_not_tell",
          evidence: "candidate closed phrase not yet confirmed: " + phrase,
        };
      }
    }
    return { verdict: "live", evidence: "" };
  } catch {
    return { verdict: "could_not_tell", evidence: "reader error" };
  }
}

globalThis.YN_CLOSED_MARKERS_INDEED = YN_CLOSED_MARKERS_INDEED;
globalThis.YN_CLOSED_MARKERS_LINKEDIN = YN_CLOSED_MARKERS_LINKEDIN;
globalThis.YN_CLOSED_MARKERS_BY_HOST = YN_CLOSED_MARKERS_BY_HOST;
globalThis.YN_CLOSED_MARKERS_CONFIRMED_HOSTS = YN_CLOSED_MARKERS_CONFIRMED_HOSTS;
globalThis.ynLivenessHostFamily = ynLivenessHostFamily;
globalThis.ynVisibleText = ynVisibleText;
globalThis.ynDetectLiveness = ynDetectLiveness;
