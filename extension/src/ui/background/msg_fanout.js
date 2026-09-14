// background.js — the fan-out message group: FANOUT_OPEN, "Search all
// sites" — opens the budget-permitted search pages as ordinary VISIBLE tabs
// in the student's own window, then collects them into one named Chrome tab
// group. See dispatch.js for how handle() tries each message group in turn.
async function ynHandleFanoutMessages(msg, sender) {
  switch (msg.type) {
    case "FANOUT_OPEN": {
      // Search all sites: open the budget-permitted search pages as ordinary
      // VISIBLE tabs in the student's own window. Bounds, all enforced here
      // regardless of what the page sent: at most four tabs, https only,
      // and the hostname must be the ONE known host for its site key. The
      // worker never injects into these tabs and never fetches these
      // origins — reading a results page stays behind the student's own
      // Companion click on that tab (activeTab), exactly like any capture.
      // Bridge-only: a content script carries sender.tab; the popup and
      // other extension surfaces have no business opening a fan-out.
      if (!sender || !sender.tab) {
        return { ok: false, error: "only the app page can open a fan-out" };
      }
      // ONE known host per site key. Not a pattern, not a suffix match: the
      // hostname the worker is asked to open must be exactly this string, so
      // a page that got a site key past the server cannot redirect the open
      // to somewhere else on the same domain. The server holds the matching
      // base URL and its own tests keep the two in step.
      const YN_FANOUT_HOSTS = {
        indeed: "uk.indeed.com",
        linkedin: "www.linkedin.com",
        gradcracker: "www.gradcracker.com",
        // Ninth site. the server's the_trackr search holds
        // the matching base URL (app.the-trackr.com), same one-known-host
        // rule as every other entry here.
        the_trackr: "app.the-trackr.com",
        nhs_jobs: "www.jobs.nhs.uk",
        totaljobs: "www.totaljobs.com",
        cv_library: "www.cv-library.co.uk",
        guardian_jobs: "jobs.theguardian.com",
        civil_service_jobs: "www.civilservicejobs.service.gov.uk",
        // Prospects and Milkround (2026-09-03): both sites' own terms permit
        // a single page open. the server's prospects search and
        // the server's milkround search hold the matching base URLs, same
        // one-known-host rule as every other entry here. TARGETjobs, Bright
        // Network and Higherin (the rebranded RateMyPlacement) carry NO
        // entry: the first two have no searchable URL shape at all, and
        // Higherin's fan-out question is left open,
        // since its own published terms say nothing that would settle it.
        prospects: "www.prospects.ac.uk",
        milkround: "www.milkround.com",
      };
      const asked = Array.isArray(msg.tabs) ? msg.tabs.slice(0, 4) : [];
      let opened = 0;
      const refused = [];
      // THE LOG THIS HANDLER DID NOT HAVE. A run of four sites once opened
      // three tabs and could not be diagnosed, because this loop had exactly
      // two outcomes per site - increment `opened`, or push to `refused` on
      // a thrown error - and NOTHING ELSE was written down. A tab whose
      // create() resolved and which then did not exist was indistinguishable
      // in the answer from one that did.
      //
      // `steps` records every site's own outcome as it happens, and is
      // persisted per iteration rather than at the end, so if the MV3 worker
      // is torn down mid-loop the record stops where the worker stopped -
      // which is itself the diagnosis for that cause, and is invisible to any
      // count taken afterwards.
      const steps = [];
      const persist = async () => {
        try {
          await chrome.storage.local.set({
            lastFanout: { ts: Date.now(), asked: asked.length, steps },
          });
        } catch {
          /* the record must never break the fan-out it describes */
        }
      };
      for (const t of asked) {
        const site = String(t?.site || "");
        const url = String(t?.url || "");
        let host = "";
        try {
          host = new URL(url).hostname;
        } catch {
          refused.push({ site, reason: "unreadable URL" });
          steps.push({ site, outcome: "unreadable_url" });
          await persist();
          continue;
        }
        if (!url.startsWith("https://") || YN_FANOUT_HOSTS[site] !== host) {
          refused.push({
            site,
            reason: `not the known ${site || "site"} search host`,
          });
          steps.push({ site, outcome: "wrong_host", host });
          await persist();
          continue;
        }
        try {
          // First tab fronted so the student SEES the fan-out start; the
          // rest open behind it, all in the current window, all visible on
          // the tab strip. Never a background window, never headless.
          const created = await chrome.tabs.create({ url, active: opened === 0 });
          // ASK THE BROWSER whether the tab it just said it made is really
          // there. create() resolving is the extension's belief; tabs.get is
          // the browser's answer, and the gap between those two was the
          // undiagnosed part of the 4-vs-3 run. A tab that vanished between
          // the two calls is now a NAMED refusal instead of a silent
          // increment.
          let confirmed = null;
          try {
            confirmed = await chrome.tabs.get(created.id);
          } catch (e) {
            confirmed = null;
          }
          if (!confirmed) {
            refused.push({ site, reason: "the tab did not stay open" });
            steps.push({
              site,
              outcome: "created_then_gone",
              tabId: created.id ?? null,
            });
            await persist();
            continue;
          }
          opened += 1;
          steps.push({
            site,
            outcome: "opened",
            tabId: confirmed.id,
            wanted: url.slice(0, 200),
            // The URL the browser holds, beside the one we asked for. Without
            // the broad "tabs" permission this is usually empty, which is the
            // honest state and not a failure - the extension deliberately
            // cannot read the URL of a tab it has no grant for. When it IS
            // present, a tab that opened and immediately redirected reads
            // differently here, which is the third candidate cause made
            // visible rather than argued about.
            seen: String(confirmed.url || confirmed.pendingUrl || "").slice(0, 200),
            status: confirmed.status || "",
          });
          await persist();
        } catch (e) {
          refused.push({
            site,
            reason: String(e && e.message ? e.message : e).slice(0, 120),
          });
          steps.push({
            site,
            outcome: "create_threw",
            error: String(e && e.message ? e.message : e).slice(0, 200),
          });
          await persist();
        }
      }
      // COLLECT THE TABS INTO YOUNGNUG'S OWN CHROME GROUP.
      //
      // A fan-out drops up to four tabs into a strip that already has the
      // student's own work in it, and without a group they are four
      // indistinguishable favicons the student has to pick apart by hand. A
      // named, coloured group says which tabs YoungNug opened, keeps them
      // together, and can be collapsed or closed in one action.
      //
      // Best effort by contract: grouping is cosmetic and must never break the
      // fan-out it tidies. Every failure is RECORDED rather than swallowed,
      // because a group that silently did not form is the kind of thing nobody
      // notices until they are looking for it.
      let group = { grouped: 0, groupId: null, error: "" };
      const openedTabIds = steps
        .filter((s) => s.outcome === "opened" && Number.isFinite(s.tabId))
        .map((s) => s.tabId);
      if (openedTabIds.length && chrome.tabs.group) {
        try {
          const groupId = await chrome.tabs.group({ tabIds: openedTabIds });
          group.groupId = groupId;
          group.grouped = openedTabIds.length;
          if (chrome.tabGroups && chrome.tabGroups.update) {
            // The colour is not decoration: it is how the student finds the
            // group again on a busy tab strip.
            await chrome.tabGroups.update(groupId, {
              title: "YoungNug",
              color: "green",
            });
          } else {
            group.error = "tabGroups unavailable; tabs grouped but unnamed";
          }
        } catch (e) {
          group.error = String(e && e.message ? e.message : e).slice(0, 200);
        }
      }
      // Recorded BESIDE the per-site steps, not inside them: `steps` is one
      // entry per site and every reader of it counts on that. A grouping
      // outcome is about the set, not about any site.
      try {
        await chrome.storage.local.set({
          lastFanout: { ts: Date.now(), asked: asked.length, steps, group },
        });
      } catch {
        /* the record must never break the fan-out it describes */
      }

      return {
        ok: opened > 0 || asked.length === 0,
        opened,
        refused,
        // What was planned against what the browser reported, in the answer
        // itself so a harness never has to reconstruct it from tab counts.
        asked: asked.length,
        steps,
        group,
      };
    }
    default:
      return undefined;
  }
}

export { ynHandleFanoutMessages };
