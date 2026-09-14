(() => {
  // extension/src/ui/background/settings_sync.js
  async function ynSyncServerSettings() {
    try {
      const r = await ynApi("/api/extension/settings", {
        // The one call allowed through an ACCOUNT-level stop (never through
        // the local kill switch) — it is the call that lifts one.
        allowWhileServerStopped: true
      });
      const s = await r.json();
      const cached = { fetchedAt: Date.now() };
      if (Number.isFinite(Number(s.daily_cap))) {
        cached.dailyCap = Number(s.daily_cap);
      }
      cached.stop = s.companion_stop === true;
      cached.warning = typeof s.companion_warning === "string" ? s.companion_warning.trim().slice(0, 300) : "";
      await chrome.storage.local.set({ serverSettings: cached });
    } catch {
    }
  }

  // extension/src/ui/background/resolve.js
  var YN_AGGREGATOR_HOSTS = [
    "indeed.",
    "linkedin.",
    "reed.co.uk",
    "adzuna.",
    "totaljobs.",
    "cv-library.",
    "ziprecruiter.",
    "glassdoor.",
    "monster.",
    "jobsite.co.uk",
    "s1jobs.",
    "jobserve.",
    "talent.com",
    "jooble.",
    "studentjob.",
    "milkround.",
    "e4s.co.uk"
  ];
  var YN_PENDING_RESOLVE_TTL_MS = 18e4;
  var YN_PENDING_RESOLVE_GC_MS = 60 * 60 * 1e3;
  var YN_RESOLVED_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
  var YN_RESOLVED_MAX = 500;
  function ynSanitizeResolveUrl(raw) {
    if (typeof raw !== "string" || !raw) return null;
    if (raw.length > 2e3) return null;
    let u;
    try {
      u = new URL(raw);
    } catch {
      return null;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    u.username = "";
    u.password = "";
    const out = u.toString();
    if (out.length > 2e3) return null;
    return out;
  }
  function ynHostIsAggregator(host) {
    const h = String(host || "").toLowerCase();
    if (!h) return false;
    for (const d of YN_AGGREGATOR_HOSTS) {
      const dl = String(d).toLowerCase();
      if (h.startsWith(dl) || ("." + h).includes("." + dl)) return true;
    }
    return false;
  }
  function ynResolveDecision(pending, seenUrl, nowMs, senderOpenerTabId) {
    if (!pending || typeof pending !== "object") {
      return { action: "ignore" };
    }
    const ts = Number(pending.ts) || 0;
    if (nowMs - ts > YN_PENDING_RESOLVE_TTL_MS) {
      return { action: "drop" };
    }
    const sanitized = ynSanitizeResolveUrl(seenUrl);
    if (!sanitized) {
      return { action: "ignore" };
    }
    let seenHost = "";
    try {
      seenHost = new URL(sanitized).hostname.toLowerCase();
    } catch {
      return { action: "ignore" };
    }
    if (!seenHost) return { action: "ignore" };
    if (ynHostIsAggregator(seenHost)) {
      return { action: "ignore" };
    }
    let pendingHost = "";
    try {
      pendingHost = new URL(String(pending.url || "")).hostname.toLowerCase();
    } catch {
      pendingHost = "";
    }
    if (pendingHost && seenHost === pendingHost) {
      return { action: "ignore" };
    }
    const appTabId = Number(pending.appTabId);
    const openerTabId = Number(senderOpenerTabId);
    if (Number.isFinite(appTabId) && Number.isFinite(openerTabId) && openerTabId !== appTabId) {
      return { action: "ignore" };
    }
    const jobId = Number(pending.jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return { action: "drop" };
    }
    return { action: "post", jobId, url: sanitized };
  }

  // extension/src/ui/background/profile_fill_shape.js
  var YN_SAVABLE_SECTIONS = {
    answers: ["notice_period", "salary_expectation", "earliest_start"],
    eligibility: [
      "uk_right_to_work",
      "needs_sponsorship",
      "willing_to_relocate",
      "uk_driving_licence"
    ]
  };
  function ynUsableText(value) {
    if (typeof value !== "string") return "";
    const s = value.trim();
    if (!s || /\[CONFIRM/i.test(s)) return "";
    return s;
  }
  function ynRowHasConfirm(row) {
    for (const v of Object.values(row || {})) {
      if (typeof v === "string" && /\[CONFIRM/i.test(v)) return true;
    }
    return false;
  }
  function ynIsoMonth(month, year) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || y < 1900 || y > 2200) return "";
    if (!Number.isInteger(m) || m < 1 || m > 12) return "";
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  function ynSection(sections, name) {
    const v = sections && typeof sections === "object" ? sections[name] : null;
    return v && typeof v === "object" ? v : null;
  }
  function ynProfileFillShape(sections) {
    const src = sections && typeof sections === "object" ? sections : {};
    const contactRaw = ynSection(src, "contact") || {};
    const linksRaw = ynSection(src, "links") || {};
    const eligibility = ynSection(src, "eligibility") || {};
    const answersRaw = ynSection(src, "answers") || {};
    const contact = {};
    for (const key of [
      "first_name",
      "last_name",
      "middle_name",
      "email",
      "phone"
    ]) {
      const v = ynUsableText(contactRaw[key]);
      if (v) contact[key] = v;
    }
    const links = {};
    for (const key of ["linkedin", "github", "portfolio"]) {
      const v = ynUsableText(linksRaw[key]) || ynUsableText(contactRaw[key]);
      if (v) links[key] = v;
    }
    const address = {};
    const line1 = ynUsableText(contactRaw.address_line1);
    const city = ynUsableText(contactRaw.city);
    const postcode = ynUsableText(contactRaw.postcode);
    if (line1) address.line1 = line1;
    if (city) address.city = city;
    if (postcode) address.postcode = postcode;
    if (Object.keys(address).length) address.country = "United Kingdom";
    const education = [];
    for (const row of Array.isArray(src.education) ? src.education : []) {
      if (!row || typeof row !== "object" || ynRowHasConfirm(row)) continue;
      const institution = ynUsableText(row.name);
      if (!institution) continue;
      education.push({
        institution,
        qualification: ynUsableText(row.degree) || null,
        subject: ynUsableText(row.field_of_study) || null,
        grade: ynUsableText(row.grade_achieved) || ynUsableText(row.grade_predicted) || null,
        start: ynIsoMonth(row.start_month, row.start_year) || null,
        end: ynIsoMonth(row.end_month, row.end_year) || null,
        current: row.current === true
      });
    }
    const work = [];
    for (const name of ["experience", "volunteering"]) {
      for (const row of Array.isArray(src[name]) ? src[name] : []) {
        if (!row || typeof row !== "object" || ynRowHasConfirm(row)) continue;
        const employer = ynUsableText(row.company);
        const title = ynUsableText(row.role);
        if (!employer && !title) continue;
        const bullets = (Array.isArray(row.bullets) ? row.bullets : []).map((b) => ynUsableText(b)).filter(Boolean);
        work.push({
          employer: employer || null,
          title: title || null,
          start: ynUsableText(row.start) || ynIsoMonth(row.start_month, row.start_year) || null,
          end: ynUsableText(row.end) || ynIsoMonth(row.end_month, row.end_year) || null,
          current: row.current === true,
          description: bullets.join("; ") || null
        });
      }
    }
    const bool = (v) => v === true || v === false ? v : null;
    const right_to_work = {
      uk_rtw: bool(eligibility.uk_right_to_work),
      needs_sponsorship: bool(eligibility.needs_sponsorship)
    };
    const eligibility_extra = {
      willing_to_relocate: bool(eligibility.willing_to_relocate),
      uk_driving_licence: bool(eligibility.uk_driving_licence)
    };
    const answers = {
      notice_period: ynUsableText(answersRaw.notice_period) || null,
      salary_expectation: ynUsableText(answersRaw.salary_expectation) || null,
      earliest_start: ynUsableText(answersRaw.earliest_start) || null
    };
    const unconfirmed_answers = Object.entries({
      ...right_to_work,
      ...answers,
      ...eligibility_extra
    }).filter(([, v]) => v === null).map(([k]) => k);
    return {
      // This is NOT an application: there is no job, no CV version and no
      // letter, so the shape carries none of them and the filler reports a CV
      // upload field as one it could not fill rather than attaching something
      // that does not exist. `auto_submit` is absent here for the same reason
      // it is absent from the server's plan: there is no such code path.
      generic: true,
      contact,
      address,
      links,
      education,
      work,
      right_to_work,
      eligibility_extra,
      answers,
      unconfirmed_answers,
      dry_run: true
    };
  }
  function ynMergeSaveAnswers(items, sections) {
    const bySection = {};
    for (const it of Array.isArray(items) ? items : []) {
      if (!it || typeof it !== "object") continue;
      const section = String(it.section || "");
      const key = String(it.key || "");
      const allowed = YN_SAVABLE_SECTIONS[section];
      if (!allowed || !allowed.includes(key)) continue;
      let value;
      if (section === "eligibility") {
        if (it.value !== true && it.value !== false) continue;
        value = it.value;
      } else {
        if (typeof it.value !== "string" || !it.value.trim()) continue;
        value = it.value.trim().slice(0, 100);
      }
      (bySection[section] = bySection[section] || {})[key] = value;
    }
    const puts = [];
    for (const [section, patch] of Object.entries(bySection)) {
      const current = sections && sections[section] && typeof sections[section] === "object" ? sections[section] : {};
      puts.push({
        section,
        data: { ...current, ...patch },
        savedKeys: Object.keys(patch)
      });
    }
    return puts;
  }

  // extension/src/ui/background/capture_record.js
  async function ynAnnounceToAppTabs(message) {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({});
    } catch {
      return;
    }
    await Promise.all(
      tabs.map(
        (t) => t.id == null ? Promise.resolve() : chrome.tabs.sendMessage(t.id, message).catch(() => {
        })
      )
    );
  }
  async function ynAnnounceImportStatus(source, phase, detail) {
    await ynAnnounceToAppTabs({
      type: "YN_IMPORT_STATUS",
      source,
      phase,
      ...detail || {}
    });
  }
  function ynCaptureHostOf(job) {
    const src = String(job && job.source || "");
    if (src.startsWith("capture:")) {
      return src.slice("capture:".length).slice(0, 120);
    }
    try {
      return new URL(String(job && job.url || "")).hostname.slice(0, 120);
    } catch {
      return "";
    }
  }
  async function ynRecordLastCapture(entry) {
    const e = entry && typeof entry === "object" ? entry : {};
    const clamped = {
      ts: Date.now(),
      ok: e.ok === true,
      mode: ["jobview", "serp"].includes(e.mode) ? e.mode : "",
      host: String(e.host || "").slice(0, 120),
      error: String(e.error || "").slice(0, 300),
      duplicate: e.duplicate === true,
      enriched: e.enriched === true,
      // null means "not a batch" — and must stay null (Number(null) is 0)
      saved: e.saved == null || !Number.isFinite(Number(e.saved)) ? null : Math.max(0, Number(e.saved)),
      dupes: e.dupes == null || !Number.isFinite(Number(e.dupes)) ? null : Math.max(0, Number(e.dupes)),
      failed: e.failed == null || !Number.isFinite(Number(e.failed)) ? null : Math.max(0, Number(e.failed))
    };
    try {
      await chrome.storage.local.set({ lastCapture: clamped });
    } catch {
    }
    await ynAnnounceToAppTabs({ type: "YN_CAPTURE_STATUS", ...clamped });
    return clamped;
  }

  // extension/src/ui/background/msg_capture.js
  async function ynHandleCaptureMessages(msg, sender) {
    switch (msg.type) {
      case "CAPTURE_JOB": {
        const mode = msg.job.mode === "serp" ? "serp" : "jobview";
        const host = ynCaptureHostOf(msg.job);
        let r;
        try {
          r = await ynApi("/api/jobs/capture", {
            method: "POST",
            body: JSON.stringify({
              title: msg.job.title || "",
              employer: msg.job.employer || "",
              url: msg.job.url || "",
              source: msg.job.source || "extension-capture",
              description: msg.job.description || "",
              location: msg.job.location || "",
              mode
            })
          });
        } catch (e) {
          await ynRecordLastCapture({
            ok: false,
            mode,
            host,
            error: String(e && e.message ? e.message : e)
          });
          throw e;
        }
        const data = await r.json();
        await ynRecordLastCapture({
          ok: true,
          mode,
          host,
          duplicate: data.duplicate === true,
          enriched: data.enriched === true
        });
        return { ok: true, ...data };
      }
      case "CAPTURE_ANNOUNCE": {
        if (sender && sender.tab) {
          return { ok: false, reason: "only the popup can announce a capture" };
        }
        const entry = await ynRecordLastCapture({
          ok: msg.ok === true,
          mode: msg.mode,
          host: msg.host,
          error: msg.error,
          saved: msg.saved,
          dupes: msg.dupes,
          failed: msg.failed
        });
        return { ok: true, entry };
      }
      case "INGEST_SENTIMENT": {
        const rating = parseFloat(msg.sentiment?.rating);
        const r = await ynApi("/api/sentiment/ingest", {
          method: "POST",
          body: JSON.stringify({
            employer: msg.employer,
            sentiment: {
              source: msg.sentiment?.source || "glassdoor-extension",
              rating: Number.isFinite(rating) ? rating : null,
              summary: msg.sentiment?.summary || "",
              quotes: msg.sentiment?.quotes || []
            }
          })
        });
        return { ok: true, ...await r.json() };
      }
      case "LIVENESS_CHECK": {
        const url = typeof msg.url === "string" ? msg.url : "";
        if (!url) return { ok: false, error: "no url" };
        let matchResp;
        try {
          matchResp = await ynApi("/api/jobs/match-url", {
            method: "POST",
            body: JSON.stringify({ url })
          });
        } catch (e) {
          return { ok: false, error: String(e && e.message ? e.message : e) };
        }
        const matched = await matchResp.json();
        const jobId = Number(matched && matched.job_id);
        if (!Number.isFinite(jobId) || jobId <= 0) {
          return { ok: true, matched: false };
        }
        const verdict = ["live", "closed", "could_not_tell"].includes(msg.verdict) ? msg.verdict : "could_not_tell";
        try {
          const r = await ynApi(`/api/jobs/${jobId}/live-report`, {
            method: "POST",
            body: JSON.stringify({
              verdict,
              evidence: String(msg.evidence || "").slice(0, 300)
            })
          });
          return { ok: true, matched: true, jobId, ...await r.json() };
        } catch (e) {
          return {
            ok: false,
            matched: true,
            jobId,
            error: String(e && e.message ? e.message : e)
          };
        }
      }
      default:
        return void 0;
    }
  }

  // extension/src/ui/background/msg_fanout.js
  async function ynHandleFanoutMessages(msg, sender) {
    switch (msg.type) {
      case "FANOUT_OPEN": {
        if (!sender || !sender.tab) {
          return { ok: false, error: "only the app page can open a fan-out" };
        }
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
          milkround: "www.milkround.com"
        };
        const asked = Array.isArray(msg.tabs) ? msg.tabs.slice(0, 4) : [];
        let opened = 0;
        const refused = [];
        const steps = [];
        const persist = async () => {
          try {
            await chrome.storage.local.set({
              lastFanout: { ts: Date.now(), asked: asked.length, steps }
            });
          } catch {
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
              reason: `not the known ${site || "site"} search host`
            });
            steps.push({ site, outcome: "wrong_host", host });
            await persist();
            continue;
          }
          try {
            const created = await chrome.tabs.create({ url, active: opened === 0 });
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
                tabId: created.id ?? null
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
              status: confirmed.status || ""
            });
            await persist();
          } catch (e) {
            refused.push({
              site,
              reason: String(e && e.message ? e.message : e).slice(0, 120)
            });
            steps.push({
              site,
              outcome: "create_threw",
              error: String(e && e.message ? e.message : e).slice(0, 200)
            });
            await persist();
          }
        }
        let group = { grouped: 0, groupId: null, error: "" };
        const openedTabIds = steps.filter((s) => s.outcome === "opened" && Number.isFinite(s.tabId)).map((s) => s.tabId);
        if (openedTabIds.length && chrome.tabs.group) {
          try {
            const groupId = await chrome.tabs.group({ tabIds: openedTabIds });
            group.groupId = groupId;
            group.grouped = openedTabIds.length;
            if (chrome.tabGroups && chrome.tabGroups.update) {
              await chrome.tabGroups.update(groupId, {
                title: "YoungNug",
                color: "green"
              });
            } else {
              group.error = "tabGroups unavailable; tabs grouped but unnamed";
            }
          } catch (e) {
            group.error = String(e && e.message ? e.message : e).slice(0, 200);
          }
        }
        try {
          await chrome.storage.local.set({
            lastFanout: { ts: Date.now(), asked: asked.length, steps, group }
          });
        } catch {
        }
        return {
          ok: opened > 0 || asked.length === 0,
          opened,
          refused,
          // What was planned against what the browser reported, in the answer
          // itself so a harness never has to reconstruct it from tab counts.
          asked: asked.length,
          steps,
          group
        };
      }
      default:
        return void 0;
    }
  }

  // extension/src/ui/background/msg_apply.js
  async function ynHandleApplyMessages(msg, sender) {
    switch (msg.type) {
      case "GET_FILL_PLAN": {
        const r = await ynApi(`/api/apply/fill-plan/${msg.jobId}`);
        return { ok: true, ...await r.json() };
      }
      case "GET_GENERIC_PROFILE": {
        const prof = await (await ynApi("/api/profile")).json();
        return {
          ok: true,
          profile: ynProfileFillShape(prof && prof.sections || {})
        };
      }
      case "APPLY_RESULT": {
        if (msg.status === "submitted" && sender && sender.tab) {
          return { ok: false, reason: "only the user can report a submission" };
        }
        const r = await ynApi("/api/apply/result", {
          method: "POST",
          body: JSON.stringify({
            jobId: msg.jobId,
            status: msg.status,
            evidence: msg.evidence || "",
            // Coverage metric (engine.js's ynCoverage) — the fill-success
            // number, carried through so it lands on the tracker row.
            // Undefined on any sender that predates this and on the
            // never-computed hard-stop-before-fill paths; the server treats
            // an absent field as "not reported", never as zero.
            causes: msg.causes || null,
            coverage: msg.coverage || null
          })
        });
        if (msg.status === "filled") {
          await chrome.storage.local.set({
            pendingConfirm: { jobId: msg.jobId, ts: Date.now() }
          });
        }
        return { ok: true, ...await r.json() };
      }
      case "CONFIRM_APPLIED": {
        if (sender && sender.tab) {
          return { ok: false, reason: "only the user can report a submission" };
        }
        let out = { ok: true };
        if (msg.applied) {
          const r = await ynApi("/api/apply/result", {
            method: "POST",
            body: JSON.stringify({
              jobId: msg.jobId,
              status: "submitted",
              evidence: "confirmed by the user in the extension popup"
            })
          });
          out = { ok: true, ...await r.json() };
        }
        await chrome.storage.local.remove(["pendingConfirm", "confirmAsked"]);
        return out;
      }
      default:
        return void 0;
    }
  }

  // extension/src/ui/background/fillable_jobs.js
  var YN_FILLABLE_STATUSES = /* @__PURE__ */ new Set([
    "queued_extension",
    "prepared",
    "prepared_email",
    "filled_pending_submit",
    "approved",
    "manual",
    "queued_email",
    "filled"
  ]);
  function ynMergeFillableJobs(pageJobs, applications) {
    const out = Array.isArray(pageJobs) ? pageJobs.slice() : [];
    const seen = new Set(out.map((j) => j && j.id));
    for (const a of applications || []) {
      if (!a || !YN_FILLABLE_STATUSES.has(String(a.status || ""))) continue;
      const url = a.job_url || a.link;
      if (!a.job_id || !url || seen.has(a.job_id)) continue;
      seen.add(a.job_id);
      out.push({
        id: a.job_id,
        title: a.job_title || "",
        employer: a.employer || "",
        url,
        application_status: a.status
      });
    }
    return out;
  }

  // extension/src/ui/background/msg_jobs.js
  async function ynHandleJobsMessages(msg, sender) {
    switch (msg.type) {
      case "LIST_JOBS": {
        const r = await ynApi("/api/jobs?limit=200");
        const page = await r.json();
        let apps = [];
        try {
          const a = await ynApi("/api/applications");
          apps = (await a.json() || {}).applications || [];
        } catch (e) {
          console.warn("[YoungNug] tracker rows unavailable for matching:", e);
        }
        return { ok: true, ...page, jobs: ynMergeFillableJobs(page.jobs, apps) };
      }
      case "LIST_LISTINGS": {
        const r = await ynApi("/api/employer/listings");
        return { ok: true, listings: await r.json() };
      }
      case "GET_POSTING_PLAN": {
        const listingId = Number(msg.listingId);
        if (!Number.isFinite(listingId) || listingId <= 0) {
          return { ok: false, error: "bad listingId" };
        }
        const r = await ynApi(`/api/employer/listings/${listingId}/posting-plan`);
        return { ok: true, ...await r.json() };
      }
      case "POSTING_RESULT": {
        if (msg.status === "posted") {
          return { ok: false, reason: "only the employer can report a posting" };
        }
        const allowed = ["prepared", "sponsorship_stop", "aborted"];
        if (!allowed.includes(msg.status)) {
          return { ok: false, error: "bad status" };
        }
        const listingId = Number(msg.listingId);
        if (!Number.isFinite(listingId) || listingId <= 0) {
          return { ok: false, error: "bad listingId" };
        }
        const r = await ynApi(
          `/api/employer/listings/${listingId}/posting-event`,
          {
            method: "POST",
            body: JSON.stringify({
              status: msg.status,
              detail: String(msg.detail || "").slice(0, 2e3)
            })
          }
        );
        if (msg.status === "prepared") {
          await chrome.storage.local.set({
            pendingPostConfirm: { listingId, ts: Date.now() }
          });
        }
        return { ok: true, ...await r.json() };
      }
      case "CONFIRM_POSTED": {
        if (sender && sender.tab) {
          return { ok: false, reason: "only the employer can report a posting" };
        }
        const listingId = Number(msg.listingId);
        if (!Number.isFinite(listingId) || listingId <= 0) {
          return { ok: false, error: "bad listingId" };
        }
        let out = { ok: true };
        if (msg.posted) {
          const r = await ynApi(
            `/api/employer/listings/${listingId}/posting-confirmed`,
            { method: "POST", body: "{}" }
          );
          out = { ok: true, ...await r.json() };
        }
        await chrome.storage.local.remove(["pendingPostConfirm", "postConfirmAsked"]);
        return out;
      }
      default:
        return void 0;
    }
  }

  // extension/src/ui/background/msg_auth.js
  async function ynHandleAuthMessages(msg, sender) {
    switch (msg.type) {
      case "SET_TOKEN": {
        const YN_API_BASE_ALLOW = /^(https:\/\/youngnug\.com|http:\/\/(localhost|127\.0\.0\.1):(8000|8010))\/?$/;
        const update = { token: msg.token };
        let apiBaseRejected = false;
        if (msg.apiBase) {
          if (YN_API_BASE_ALLOW.test(String(msg.apiBase))) {
            update.apiBase = String(msg.apiBase).replace(/\/$/, "");
          } else {
            apiBaseRejected = true;
          }
        }
        const previous = await chrome.storage.local.get({
          token: "",
          apiBase: ""
        });
        await chrome.storage.local.set(update);
        try {
          const r = await ynApi("/api/me");
          const me = await r.json();
          void ynSyncServerSettings();
          return { ok: true, email: me.email, apiBaseRejected };
        } catch (e) {
          const rollback = { token: previous.token };
          if (update.apiBase !== void 0) rollback.apiBase = previous.apiBase;
          await chrome.storage.local.set(rollback);
          return { ok: false, error: String(e), apiBaseRejected };
        }
      }
      case "GET_STATUS": {
        const s = await ynSettings();
        if (!s.token) {
          return {
            ok: false,
            error: "no token",
            apiBase: s.apiBase,
            killSwitch: s.killSwitch,
            serverStop: s.serverStop,
            warning: s.serverWarning
          };
        }
        try {
          const r = await ynApi("/api/me");
          const me = await r.json();
          void ynSyncServerSettings();
          return {
            ok: true,
            email: me.email,
            // Greeting name — None/undefined when the account has none yet;
            // the popup falls back to email, same posture as the site.
            first_name: me.first_name,
            // role gates employer-only popup surfaces (the Indeed posting
            // section); students never see them.
            role: me.role,
            apiBase: s.apiBase,
            killSwitch: s.killSwitch,
            serverStop: s.serverStop,
            warning: s.serverWarning
          };
        } catch (e) {
          return {
            ok: false,
            error: String(e),
            apiBase: s.apiBase,
            killSwitch: s.killSwitch,
            serverStop: s.serverStop,
            warning: s.serverWarning
          };
        }
      }
      default:
        return void 0;
    }
  }

  // extension/src/ui/background/msg_imports.js
  async function ynHandleImportMessages(msg, sender) {
    switch (msg.type) {
      case "LINKEDIN_IMPORT": {
        try {
          const r = await ynApi("/api/profile/import/linkedin", {
            method: "POST",
            body: JSON.stringify(msg.data)
          });
          const report = await r.json();
          void ynAnnounceImportStatus("linkedin", "done", {
            imported: report.imported || {},
            total_imported: report.total_imported || 0,
            total_skipped: report.total_skipped || 0
          });
          return { ok: true, ...report };
        } catch (e) {
          void ynAnnounceImportStatus("linkedin", "failed", {
            error: String(e).slice(0, 300)
          });
          throw e;
        }
      }
      case "IMPORT_ANNOUNCE": {
        const phase = ["started", "failed"].includes(msg.phase) ? msg.phase : "";
        if (!phase) return { ok: false, error: "bad phase" };
        await ynAnnounceImportStatus(
          msg.source === "github" ? "github" : "linkedin",
          phase,
          { error: typeof msg.error === "string" ? msg.error.slice(0, 300) : "" }
        );
        return { ok: true };
      }
      case "GITHUB_IMPORT": {
        const ghStop = await ynStopReason();
        if (ghStop) return { ok: false, error: ghStop };
        const u = encodeURIComponent(msg.username);
        const gh = await fetch(
          `https://api.github.com/users/${u}/repos?sort=pushed&per_page=30`,
          { headers: { Accept: "application/vnd.github+json" } }
        );
        if (!gh.ok) return { ok: false, error: `GitHub API ${gh.status}` };
        const repos = (await gh.json()).filter((repo) => !repo.fork).map((repo) => ({
          name: repo.name || "",
          description: repo.description || "",
          language: repo.language || "",
          stars: repo.stargazers_count || 0,
          url: repo.html_url || "",
          pushed_at: repo.pushed_at || ""
        }));
        try {
          const r = await ynApi("/api/profile/import/github", {
            method: "POST",
            body: JSON.stringify({
              username: msg.username,
              repos,
              source_url: `https://github.com/${msg.username}`
            })
          });
          const report = await r.json();
          void ynAnnounceImportStatus("github", "done", {
            imported: report.imported || {},
            total_imported: report.total_imported || 0,
            total_skipped: report.total_skipped || 0
          });
          return { ok: true, ...report };
        } catch (e) {
          void ynAnnounceImportStatus("github", "failed", {
            error: String(e).slice(0, 300)
          });
          throw e;
        }
      }
      default:
        return void 0;
    }
  }

  // extension/src/ui/background/msg_answer.js
  async function ynHandleAnswerMessages(msg, sender) {
    switch (msg.type) {
      case "FETCH_FILE": {
        const r = await ynApi(msg.path);
        const blob = await r.blob();
        const dataUrl = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
        return { ok: true, dataUrl, contentType: blob.type };
      }
      case "GENERATE_ANSWER": {
        const jobId = Number(msg.jobId);
        const question = typeof msg.question === "string" ? msg.question : "";
        if (!Number.isFinite(jobId) || jobId <= 0) {
          return { ok: false, error: "bad jobId" };
        }
        if (!question || question.length > 300) {
          return { ok: false, error: "bad question" };
        }
        const body = { job_id: jobId, question };
        if (msg.maxChars != null && msg.maxChars !== "") {
          const mc = Number(msg.maxChars);
          if (Number.isFinite(mc) && mc > 0) body.max_chars = mc;
        }
        if (Array.isArray(msg.options) && msg.options.length) {
          body.options = msg.options.slice(0, 20).map((o) => String(o).slice(0, 200));
        }
        const s = await ynSettings();
        const stop = await ynStopReason(s);
        if (stop) return { ok: false, error: stop };
        let resp;
        try {
          resp = await fetch(s.apiBase + "/api/apply/answer", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${s.token}`
            },
            body: JSON.stringify(body)
          });
        } catch (e) {
          return { ok: false, error: String(e && e.message ? e.message : e) };
        }
        let data = null;
        try {
          data = await resp.json();
        } catch {
          data = null;
        }
        if (resp.ok && data && typeof data.text === "string" && data.text) {
          return {
            ok: true,
            text: data.text,
            verdict: data.verdict || "clean",
            refs: Array.isArray(data.refs) ? data.refs : []
          };
        }
        const detail = data && data.detail || "";
        return {
          ok: false,
          error: typeof detail === "string" && detail || `HTTP ${resp.status}`,
          verdict: data && data.verdict || ["unknown"],
          refs: data && Array.isArray(data.refs) && data.refs || []
        };
      }
      case "FIELD_MAP_CACHE_GET": {
        const employer = String(msg.employer || "").trim().toLowerCase();
        const ats = String(msg.ats || "unknown").trim().toLowerCase();
        if (!employer || !ats) {
          return { ok: false, error: "employer and ats required" };
        }
        const key = `fieldmap:${ats}:${employer}`;
        const bag = await chrome.storage.local.get({ [key]: null });
        const entry = bag[key];
        if (!entry || !entry.fields) return { ok: true, entry: null };
        return { ok: true, entry };
      }
      case "FIELD_MAP_CACHE_SET": {
        const employer = String(msg.employer || "").trim().toLowerCase();
        const ats = String(msg.ats || "unknown").trim().toLowerCase();
        if (!employer || !ats) {
          return { ok: false, error: "employer and ats required" };
        }
        const key = `fieldmap:${ats}:${employer}`;
        const fields = msg.fields && typeof msg.fields === "object" ? msg.fields : {};
        const entry = { version: 1, fields, touchedAt: Date.now() };
        await chrome.storage.local.set({ [key]: entry });
        return { ok: true, entry };
      }
      case "OLLAMA_RESOLVE": {
        const s = await ynSettings();
        const ollamaStop = await ynStopReason(s);
        if (ollamaStop) return { ok: false, error: ollamaStop };
        if (s.ollamaEnabled !== true) {
          return { ok: false, error: "ollama disabled" };
        }
        const model = s.ollamaModel || "qwen2.5:7b";
        const prompt = msg.prompt || "Map form field labels to profile keys. Reply with one JSON object only.";
        try {
          const resp = await fetch("http://127.0.0.1:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              prompt,
              stream: false,
              options: { temperature: 0 }
            })
          });
          if (!resp.ok) {
            return {
              ok: false,
              error: `ollama HTTP ${resp.status}`
            };
          }
          const body = await resp.json();
          const text = body && body.response || "";
          const m = /\{[\s\S]*\}/.exec(text);
          if (!m) {
            return { ok: false, error: "no JSON object in ollama response" };
          }
          try {
            const parsed = JSON.parse(m[0]);
            return { ok: true, mapping: parsed, raw: text.slice(0, 500) };
          } catch (e) {
            return {
              ok: false,
              error: "ollama JSON parse failed: " + String(e)
            };
          }
        } catch (e) {
          return { ok: false, error: "ollama request failed: " + String(e) };
        }
      }
      default:
        return void 0;
    }
  }

  // extension/src/ui/background/msg_save.js
  async function ynHandleSaveMessages(msg, sender) {
    switch (msg.type) {
      case "SAVE_ANSWERS": {
        const allItems = Array.isArray(msg.items) ? msg.items : [];
        const freeTextItems = allItems.filter((it) => it && it.freeText === true);
        const factItems = allItems.filter((it) => !it || it.freeText !== true);
        let sections = {};
        try {
          const prof = await (await ynApi("/api/profile")).json();
          sections = prof && prof.sections || {};
        } catch (e) {
          return { ok: false, error: String(e && e.message ? e.message : e) };
        }
        const puts = ynMergeSaveAnswers(factItems, sections);
        const saved = [];
        const failed = [];
        for (const p of puts) {
          try {
            await ynApi(`/api/profile/${p.section}`, {
              method: "PUT",
              body: JSON.stringify({ data: p.data })
            });
            saved.push(...p.savedKeys);
          } catch (e) {
            failed.push({
              section: p.section,
              error: String(e && e.message ? e.message : e)
            });
          }
        }
        const savedBank = [];
        for (const item of freeTextItems) {
          const question = String(item && item.question || "").trim();
          const text = String(item && item.value || "").trim();
          if (!question || !text) continue;
          try {
            await ynApi("/api/answers", {
              method: "POST",
              body: JSON.stringify({
                question,
                control_type: item.controlType || "text",
                text
              })
            });
            savedBank.push(item.fieldKey || item.fingerprint || question);
          } catch (e) {
            failed.push({
              section: "answers_bank",
              error: String(e && e.message ? e.message : e)
            });
          }
        }
        if (!saved.length && !savedBank.length) {
          return {
            ok: false,
            error: failed.length ? failed[0].error : "nothing to save"
          };
        }
        return { ok: true, saved, savedBank, failed };
      }
      case "APPLY_CLICK": {
        const jobId = Number(msg.jobId);
        const url = typeof msg.url === "string" ? msg.url : "";
        if (!Number.isFinite(jobId) || jobId <= 0) {
          return { ok: false, error: "bad jobId" };
        }
        if (!(url.startsWith("http://") || url.startsWith("https://"))) {
          return { ok: false, error: "bad url" };
        }
        const appTabId = sender && sender.tab && Number.isFinite(sender.tab.id) ? sender.tab.id : null;
        await chrome.storage.local.set({
          pending_resolve: { jobId, url, ts: Date.now(), appTabId }
        });
        return { ok: true };
      }
      case "ATS_PAGE_SEEN": {
        const openerTabId = sender && sender.tab ? sender.tab.openerTabId : void 0;
        const bag = await chrome.storage.local.get({ pending_resolve: null });
        const pending = bag.pending_resolve;
        const decision = ynResolveDecision(
          pending,
          msg.url,
          Date.now(),
          openerTabId
        );
        if (decision.action === "drop") {
          await chrome.storage.local.remove("pending_resolve");
          return { ok: true, action: "drop" };
        }
        if (decision.action !== "post") {
          return { ok: true, action: "ignore" };
        }
        const resolvedKey = "resolved:" + decision.jobId;
        const cached = await chrome.storage.local.get({ [resolvedKey]: null });
        const prev = cached[resolvedKey];
        if (prev && prev.url === decision.url) {
          await chrome.storage.local.remove("pending_resolve");
          return { ok: true, action: "dedupe" };
        }
        try {
          await ynApi("/api/jobs/" + decision.jobId + "/direct-link", {
            method: "POST",
            body: JSON.stringify({ url: decision.url })
          });
          await chrome.storage.local.set({
            [resolvedKey]: { url: decision.url, savedAt: Date.now() }
          });
          await chrome.storage.local.remove("pending_resolve");
          return { ok: true, action: "post" };
        } catch (e) {
          const errStr = String(e);
          const m = /HTTP (\d+)/.exec(errStr);
          if (m) {
            const status = Number(m[1]);
            if (status >= 400 && status < 500) {
              await chrome.storage.local.remove("pending_resolve");
              return { ok: false, action: "rejected", error: errStr };
            }
          }
          return { ok: false, action: "retry", error: errStr };
        }
      }
      default:
        return void 0;
    }
  }

  // extension/src/ui/background/dispatch.js
  var YN_MESSAGE_GROUPS = [
    ynHandleCaptureMessages,
    ynHandleFanoutMessages,
    ynHandleApplyMessages,
    ynHandleJobsMessages,
    ynHandleAuthMessages,
    ynHandleImportMessages,
    ynHandleAnswerMessages,
    ynHandleSaveMessages
  ];
  async function handle(msg, sender) {
    for (const group of YN_MESSAGE_GROUPS) {
      const r = await group(msg, sender);
      if (r !== void 0) return r;
    }
    return { ok: false, error: "unknown message type" };
  }

  // extension/src/ui/background/worker_entry.js
  chrome.runtime.onInstalled.addListener(() => {
    console.log(
      "[YoungNug] companion installed. Set API base + account token in options"
    );
    chrome.action?.setBadgeText?.({ text: "YN" });
    void ynRegisterAllUserScripts();
  });
  chrome.runtime.onStartup?.addListener(() => {
    void ynRegisterAllUserScripts();
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handle(msg, sender).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  });
  async function ynCaptureActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null) {
      return { ok: false, error: "no active tab" };
    }
    const host = (() => {
      try {
        return new URL(tab.url || "").hostname;
      } catch {
        return "";
      }
    })();
    void ynPingLiveness(tab.id, tab.url || "");
    let read;
    try {
      await ynInjectOnce(tab.id, YN_CAPTURE_FILES, "ynCaptureCurrent");
      const devGot = await chrome.storage.local.get("ynCaptureOverlaySelectors");
      [read] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (rules) => ynCaptureCurrent(rules),
        args: [devGot["ynCaptureOverlaySelectors"] || []]
      });
    } catch (e) {
      const error = "Chrome will not let extensions read this page";
      await ynRecordLastCapture({ ok: false, host, error });
      return { ok: false, error, detail: String(e).slice(0, 300) };
    }
    const r = read && read.result;
    if (!r || !r.ok) {
      const error = r && r.error || "could not read this page";
      await ynRecordLastCapture({ ok: false, host, error });
      return { ok: false, error };
    }
    if (Array.isArray(r.jobs)) {
      let saved = 0;
      let dupes = 0;
      let failed = 0;
      for (let i = 0; i < r.jobs.length; i++) {
        if (i) await ynJitter();
        try {
          const res = await handle({ type: "CAPTURE_JOB", job: r.jobs[i] }, {});
          if (!res || !res.ok) failed += 1;
          else if (res.duplicate) dupes += 1;
          else saved += 1;
        } catch {
          failed += 1;
        }
      }
      await ynRecordLastCapture({
        ok: true,
        mode: "serp",
        host,
        saved,
        dupes,
        failed
      });
      return { ok: true, mode: "serp", saved, dupes, failed };
    }
    try {
      const res = await handle({ type: "CAPTURE_JOB", job: r.job }, {});
      return res;
    } catch (e) {
      return { ok: false, error: String(e).slice(0, 300) };
    }
  }
  chrome.commands?.onCommand.addListener((command) => {
    if (command !== "capture-current-tab") return;
    void ynCaptureActiveTab().catch(
      (e) => console.warn("[YoungNug] shortcut capture failed:", e)
    );
  });

  // extension/src/ui/background/storage_gc.js
  var YN_FILLSTATE_TTL_MS = 14 * 24 * 60 * 60 * 1e3;
  var YN_FIELDMAP_MAX = 200;
  async function ynStorageGc() {
    try {
      const all = await chrome.storage.local.get(null);
      const toRemove = [];
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
      const fieldmaps = [];
      const resolveds = [];
      for (const [key, val] of Object.entries(all)) {
        if (key.startsWith("cap:")) {
          const day = key.slice(key.lastIndexOf(":") + 1);
          if (day !== today && day !== yesterday) toRemove.push(key);
        } else if (key.startsWith("fillstate:")) {
          const savedAt = val && typeof val === "object" ? val.savedAt : null;
          if (!savedAt || Date.now() - savedAt > YN_FILLSTATE_TTL_MS) {
            toRemove.push(key);
          }
        } else if (key.startsWith("fieldmap:")) {
          fieldmaps.push([key, val && val.touchedAt || 0]);
        } else if (key.startsWith("resolved:")) {
          const savedAt = val && typeof val === "object" ? val.savedAt : null;
          if (!savedAt || Date.now() - savedAt > YN_RESOLVED_TTL_MS) {
            toRemove.push(key);
          } else {
            resolveds.push([key, savedAt]);
          }
        } else if (key === "pending_resolve") {
          const ts = val && typeof val === "object" ? val.ts : null;
          if (!ts || Date.now() - ts > YN_PENDING_RESOLVE_GC_MS) {
            toRemove.push(key);
          }
        }
      }
      if (fieldmaps.length > YN_FIELDMAP_MAX) {
        fieldmaps.sort((a, b) => b[1] - a[1]);
        for (const [key] of fieldmaps.slice(YN_FIELDMAP_MAX)) toRemove.push(key);
      }
      if (resolveds.length > YN_RESOLVED_MAX) {
        resolveds.sort((a, b) => b[1] - a[1]);
        for (const [key] of resolveds.slice(YN_RESOLVED_MAX)) toRemove.push(key);
      }
      if (toRemove.length) await chrome.storage.local.remove(toRemove);
    } catch {
    }
  }
  ynStorageGc();

  // extension/src/ui/background/index.js
  importScripts("common/api.js", "common/inject_once.js", "common/user_scripts.js");
  globalThis.ynSyncServerSettings = ynSyncServerSettings;
  globalThis.YN_AGGREGATOR_HOSTS = YN_AGGREGATOR_HOSTS;
  globalThis.YN_PENDING_RESOLVE_TTL_MS = YN_PENDING_RESOLVE_TTL_MS;
  globalThis.YN_PENDING_RESOLVE_GC_MS = YN_PENDING_RESOLVE_GC_MS;
  globalThis.YN_RESOLVED_TTL_MS = YN_RESOLVED_TTL_MS;
  globalThis.YN_RESOLVED_MAX = YN_RESOLVED_MAX;
  globalThis.ynSanitizeResolveUrl = ynSanitizeResolveUrl;
  globalThis.ynHostIsAggregator = ynHostIsAggregator;
  globalThis.ynResolveDecision = ynResolveDecision;
  globalThis.YN_SAVABLE_SECTIONS = YN_SAVABLE_SECTIONS;
  globalThis.ynUsableText = ynUsableText;
  globalThis.ynRowHasConfirm = ynRowHasConfirm;
  globalThis.ynIsoMonth = ynIsoMonth;
  globalThis.ynSection = ynSection;
  globalThis.ynProfileFillShape = ynProfileFillShape;
  globalThis.ynMergeSaveAnswers = ynMergeSaveAnswers;
  globalThis.ynAnnounceToAppTabs = ynAnnounceToAppTabs;
  globalThis.ynAnnounceImportStatus = ynAnnounceImportStatus;
  globalThis.ynCaptureHostOf = ynCaptureHostOf;
  globalThis.ynRecordLastCapture = ynRecordLastCapture;
  globalThis.handle = handle;
  globalThis.ynCaptureActiveTab = ynCaptureActiveTab;
  globalThis.YN_FILLSTATE_TTL_MS = YN_FILLSTATE_TTL_MS;
  globalThis.YN_FIELDMAP_MAX = YN_FIELDMAP_MAX;
  globalThis.ynStorageGc = ynStorageGc;
  globalThis.YN_FILLABLE_STATUSES = YN_FILLABLE_STATUSES;
  globalThis.ynMergeFillableJobs = ynMergeFillableJobs;
})();
