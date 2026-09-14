(() => {
  // extension/src/ui/popup/fill_report.js
  var YN_FILL_SCRIPTS = [
    "common/api.js",
    "common/yn_theme.js",
    "common/challenge_detect.js",
    "common/label_quality.js",
    "common/own_rules.js",
    "common/placeholder.js",
    "common/overlay_box.js",
    "content/dom_fill_kit.js",
    "content/aria_driver.js",
    "content/skills_fill.js",
    "content/engine.js",
    "content/detect.js",
    "content/heuristics.js",
    // Shared adapter utilities — loaded before any adapter that uses them
    // (repeater.js: workday.js's history rows; url_scope.js, reopen.js: pure
    // functions, each documenting its own not-yet-wired call site in a
    // comment at the top of the file).
    "content/repeater.js",
    "content/adapters/url_scope.js",
    "content/adapters/reopen.js",
    "content/adapters/greenhouse.js",
    "content/adapters/lever.js",
    "content/adapters/ashby.js",
    "content/adapters/smartrecruiters.js",
    "content/adapters/icims.js",
    "content/adapters/taleo.js",
    "content/adapters/successfactors.js",
    "content/adapters/workday.js",
    "content/adapters/teamtailor.js",
    "content/adapters/recruitee.js",
    "content/adapters/workable.js",
    "content/adapters/personio.js",
    "content/adapters/pinpoint.js",
    "content/adapters/dover.js",
    "content/adapters/linkedin_easy_apply.js",
    "content/adapters/indeed_apply.js",
    "content/adapters/reed.js",
    "content/password_kit.js",
    "content/assist.js",
    "content/settle_observer.js",
    "content/review_screen.js",
    "content/filler.js",
    "content/resolver_ping.js"
  ];
  function ynRenderFillReport(result) {
    const box = document.getElementById("fill-report");
    if (!box) return;
    if (!result) {
      box.hidden = true;
      box.textContent = "";
      return;
    }
    const ats = result.ats;
    const report = result.report || {};
    const filledN = (report.filled || []).length;
    const guessedN = (report.guessed || []).length;
    const unresolvedN = (report.unresolved || []).length;
    const eeoN = (report.skipped_eeo || []).length;
    const needsYouN = (report.needs_you || []).length;
    const done = filledN + guessedN;
    const total = done + unresolvedN + eeoN + needsYouN + (report.skipped_password || []).length + (report.user_kept || []).length;
    const parts = [];
    if (result.displayLine) {
      parts.push(`<p class="fill-ats">${escapeHtml(result.displayLine)}</p>`);
    } else if (ats && ats.id === "unknown") {
      parts.push(
        `<p class="fill-ats">I don't know this system. Using generic field matching.</p>`
      );
    } else if (ats && ats.name) {
      parts.push(
        `<p class="fill-ats">Filling a ${escapeHtml(ats.name)} application</p>`
      );
    }
    parts.push(
      `<p><strong>Filled ${done} of ${total || done}</strong>` + (guessedN ? ` · ${guessedN} to check` : "") + `</p>`
    );
    if (guessedN) {
      const labels = (report.guessed || []).map((e) => ynReportFieldLabel(e)).filter(Boolean).slice(0, 5);
      if (labels.length) {
        parts.push(
          `<p class="fill-check">Check these: ${escapeHtml(labels.join("; "))}</p>`
        );
      }
    }
    if (unresolvedN) {
      const labels = (report.unresolved || []).map((e) => ynReportFieldLabel(e)).filter(Boolean).slice(0, 5);
      if (labels.length) {
        parts.push(
          `<p class="fill-miss">I could not read these: ${escapeHtml(labels.join("; "))}</p>`
        );
      }
    }
    if (needsYouN) {
      const labels = (report.needs_you || []).map((e) => ynReportFieldLabel(e)).filter(Boolean).slice(0, 5);
      parts.push(
        `<p class="fill-check">Answer these yourself: ${escapeHtml(labels.join("; "))}</p>`
      );
    }
    if (eeoN) {
      parts.push(
        `<p class="muted">Equal-opportunity questions left for you.</p>`
      );
    }
    if ((report.skipped_payment || []).length) {
      parts.push(`<p class="muted">Payment fields are never filled.</p>`);
    }
    if ((report.skipped_terms || []).length) {
      parts.push(
        `<p class="muted">Terms boxes are left for you to read and tick.</p>`
      );
    }
    if ((report.skipped_password || []).length) {
      parts.push(
        `<p class="muted">Passwords and sign-in fields never filled · ${report.skipped_password.length}</p>`
      );
    }
    const draftsList = report.drafts || [];
    if (draftsList.length) {
      const usedN = draftsList.filter((d) => d.written).length;
      parts.push(
        `<p class="muted">Drafted answers used: ${usedN} of ${draftsList.length}</p>`
      );
    }
    parts.push(
      `<p class="fill-never">Nothing was submitted - review and submit yourself.</p>`
    );
    box.innerHTML = parts.join("");
    box.hidden = false;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // extension/src/ui/popup/status.js
  var el = (id) => document.getElementById(id);
  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }
  function connectionHint(r) {
    const err = String(r?.error || "");
    if (r?.killSwitch || /kill switch/i.test(err)) {
      return "Kill switch is on. Press it again, then open YoungNug again.";
    }
    if (/HTTP 401/.test(err)) {
      return "Your saved connection expired or was replaced (from another browser). Open YoungNug in a tab, logged in: it reconnects automatically.";
    }
    if (/HTTP \d{3}/.test(err)) {
      return `YoungNug answered with an error: ${err.slice(0, 140)}`;
    }
    if (err && !/no token/.test(err)) {
      return `Could not reach ${r?.apiBase || "YoungNug"}. Is it running? Open YoungNug in a tab while logged in to reconnect.`;
    }
    return "Open YoungNug in a tab while logged in: the extension connects itself.";
  }
  function ynPaintKill(on) {
    const btn = el("kill");
    if (!btn) return;
    btn.setAttribute("aria-checked", on ? "true" : "false");
    const state = el("kill-state");
    if (state) state.textContent = on ? "Stopped" : "Running";
  }
  function ynPaintContext(r) {
    const line = el("context-line");
    if (!line) return;
    if (!r?.ok || r?.killSwitch) {
      line.hidden = true;
      line.textContent = "";
      return;
    }
    line.textContent = "Save this job, or fill this form.";
    line.hidden = false;
  }
  function ynPaintWarning(r) {
    const box = el("warn");
    if (!box) return;
    const parts = [];
    if (r && r.serverStop) {
      parts.push(
        "<strong>Stopped from your YoungNug account</strong>Nothing runs until it is lifted on the site."
      );
    }
    const text = String(r && r.warning || "").slice(0, 300);
    if (text) {
      parts.push(`<strong>Notice</strong>${escapeHtml(text)}`);
    }
    box.innerHTML = parts.join("<hr />");
    box.hidden = parts.length === 0;
  }
  async function refreshStatus() {
    const conn = el("conn");
    const dot = el("dot");
    let r = null;
    try {
      r = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
    } catch (e) {
      conn.textContent = "Extension error";
      conn.className = "status-line status-bad";
      dot.classList.remove("ok");
      el("conn-detail").textContent = `The extension's background worker is not responding (${String(
        e?.message || e
      ).slice(0, 120)}). Reload the extension from chrome://extensions.`;
      return;
    }
    if (r?.ok) {
      conn.textContent = r.first_name ? `Hello ${r.first_name}` : "Connected";
      conn.className = "status-line status-ok";
      dot.classList.add("ok");
      el("conn-detail").textContent = /^http:\/\/(127\.0\.0\.1|localhost)\b/i.test(
        r.apiBase || ""
      ) ? "Connected to a development server" : "";
    } else {
      conn.textContent = "Not connected";
      conn.className = "status-line status-bad";
      dot.classList.remove("ok");
      el("conn-detail").textContent = connectionHint(r);
    }
    if (r?.killSwitch !== void 0) ynPaintKill(!!r.killSwitch);
    ynPaintWarning(r);
    ynPaintContext(r);
  }
  el("kill").addEventListener("click", async () => {
    const btn = el("kill");
    const next = btn.getAttribute("aria-checked") !== "true";
    ynPaintKill(next);
    try {
      await chrome.storage.local.set({ killSwitch: next });
    } catch (e) {
      ynPaintKill(!next);
      el("status").textContent = "Could not save. Still " + (next ? "running." : "stopped.");
    }
  });

  // extension/src/ui/popup/dev_selectors.js
  var YN_DEV_RULES_KEY = "ynCaptureOverlaySelectors";
  var YN_DEV_RULES_MAX = 20;
  var YN_DEV_HOST_RE = /^(\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  var YN_DEV_SELECTOR_RE = /^[a-zA-Z0-9\s.#:_\-,>~+*()="'[\]]{1,200}$/;
  function ynValidHost(v) {
    return YN_DEV_HOST_RE.test(String(v || "").trim());
  }
  function ynValidSelector(v) {
    const s = String(v || "").trim();
    if (!s || !YN_DEV_SELECTOR_RE.test(s)) return false;
    if (/javascript:|expression\(|url\(/i.test(s)) return false;
    return true;
  }
  function ynRenderDevRules(rules) {
    const list = el("dev-rules");
    if (!list) return;
    list.innerHTML = "";
    for (const rule of rules) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${rule.pattern}: ${rule.titleSelector} / ${rule.bodySelector}`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "quiet";
      del.setAttribute("aria-label", `Delete rule for ${rule.pattern}`);
      del.title = `Delete rule for ${rule.pattern}`;
      del.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      del.addEventListener("click", async () => {
        const got = await chrome.storage.local.get(YN_DEV_RULES_KEY);
        const current = got[YN_DEV_RULES_KEY] || [];
        const next = current.filter((r) => r.id !== rule.id);
        await chrome.storage.local.set({ [YN_DEV_RULES_KEY]: next });
        ynRenderDevRules(next);
      });
      li.appendChild(label);
      li.appendChild(del);
      list.appendChild(li);
    }
  }
  async function ynLoadDevRules() {
    const got = await chrome.storage.local.get(YN_DEV_RULES_KEY);
    ynRenderDevRules(got[YN_DEV_RULES_KEY] || []);
  }
  function setupDevSection() {
    const addBtn = el("dev-add");
    if (!addBtn) return;
    addBtn.addEventListener("click", async () => {
      const msg = el("dev-msg");
      const pattern = el("dev-pattern").value.trim().toLowerCase();
      const titleSelector = el("dev-title").value.trim();
      const bodySelector = el("dev-body").value.trim();
      if (!ynValidHost(pattern)) {
        msg.textContent = "Enter a plain site hostname, e.g. jobs.example.com.";
        return;
      }
      if (!ynValidSelector(titleSelector) || !ynValidSelector(bodySelector)) {
        msg.textContent = "Selectors only: CSS selector syntax, never a script or a URL.";
        return;
      }
      const got = await chrome.storage.local.get(YN_DEV_RULES_KEY);
      const current = got[YN_DEV_RULES_KEY] || [];
      if (current.length >= YN_DEV_RULES_MAX) {
        msg.textContent = `Limit of ${YN_DEV_RULES_MAX} rules reached. Delete one first.`;
        return;
      }
      const next = [
        ...current.filter((r) => r.pattern !== pattern),
        { id: `${pattern}-${Date.now()}`, pattern, titleSelector, bodySelector }
      ];
      await chrome.storage.local.set({ [YN_DEV_RULES_KEY]: next });
      el("dev-pattern").value = "";
      el("dev-title").value = "";
      el("dev-body").value = "";
      msg.textContent = `Saved. ${next.length} rule${next.length === 1 ? "" : "s"} stored.`;
      ynRenderDevRules(next);
    });
    void ynLoadDevRules();
  }

  // extension/src/ui/popup/capture_click.js
  async function ynOwnRuleCaptureRulesFromStorage() {
    try {
      const got = await chrome.storage.local.get({ [YN_OWN_RULES_KEY]: "" });
      const text = got[YN_OWN_RULES_KEY] || "";
      if (!text || typeof ynParseOwnRules !== "function") return [];
      const { rules } = ynParseOwnRules(text);
      return typeof ynOwnRuleCaptureRules === "function" ? ynOwnRuleCaptureRules(rules) : [];
    } catch {
      return [];
    }
  }
  function announceCapture(detail) {
    try {
      chrome.runtime.sendMessage({ type: "CAPTURE_ANNOUNCE", ...detail }).catch(() => {
      });
    } catch {
    }
  }
  function ynHostOfTab(tab) {
    try {
      return new URL(tab?.url || "").hostname;
    } catch {
      return "";
    }
  }
  el("capture").addEventListener("click", async () => {
    const status = el("status");
    const tab = await activeTab();
    const host = ynHostOfTab(tab);
    status.textContent = "Reading this page…";
    let read;
    try {
      await ynInjectOnce(tab.id, YN_CAPTURE_FILES, "ynCaptureCurrent");
      if (/https:\/\/[^/]*glassdoor\.(com|co\.uk)\//.test(tab.url || "")) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content/glassdoor.js"]
        }).catch(() => {
        });
      }
      const devGot = await chrome.storage.local.get(YN_DEV_RULES_KEY);
      const ownCaptureRules = await ynOwnRuleCaptureRulesFromStorage();
      const combinedRules = [...ownCaptureRules, ...devGot[YN_DEV_RULES_KEY] || []];
      [read] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (rules) => ynCaptureCurrent(rules),
        args: [combinedRules]
      });
    } catch (e) {
      console.warn("[YoungNug] capture injection refused:", e);
      status.textContent = "Capture failed: Chrome blocks extensions on its own pages, the Web Store and PDF files. Open the advert in a normal tab and try again.";
      announceCapture({
        ok: false,
        host,
        error: "Chrome will not let extensions read this page"
      });
      return;
    }
    const r = read?.result;
    if (!r?.ok) {
      status.textContent = `Capture failed: ${r?.error || "could not read this page"}`;
      announceCapture({
        ok: false,
        host,
        error: r?.error || "could not read this page"
      });
      return;
    }
    if (Array.isArray(r.jobs)) {
      let saved2 = 0;
      let dupes = 0;
      let failed = 0;
      for (let i = 0; i < r.jobs.length; i++) {
        status.textContent = `Saving job ${i + 1} of ${r.jobs.length}…`;
        if (i) await ynJitter();
        const res = await chrome.runtime.sendMessage({ type: "CAPTURE_JOB", job: r.jobs[i] }).catch(() => null);
        if (!res?.ok) failed += 1;
        else if (res.duplicate) dupes += 1;
        else saved2 += 1;
      }
      status.textContent = `Saved ${saved2} job cards, ${dupes} already in your list` + (failed ? `, ${failed} failed` : "") + ". Review them in YoungNug.";
      announceCapture({ ok: true, mode: "serp", host, saved: saved2, dupes, failed });
      return;
    }
    const saved = await chrome.runtime.sendMessage({
      type: "CAPTURE_JOB",
      job: r.job
    });
    status.textContent = saved?.ok ? saved.enriched ? "Saved this advert. Your saved copy now carries the full advert." : saved.duplicate ? "This advert is already in your list." : "Saved this advert. Review it in YoungNug." : `Capture failed: ${saved?.error || "no response"}`;
  });

  // extension/src/ui/popup/match_and_confirm.js
  function ynRenderConfirmStrip(jobId) {
    const box = el("confirm-applied");
    if (!box) return;
    box.innerHTML = `<p>Did you review and send this application yourself?</p><button id="confirm-yes" class="primary">I sent it - record it</button><button id="confirm-no" class="quiet">Not yet</button>`;
    box.hidden = false;
    el("confirm-yes").addEventListener("click", async () => {
      const r = await chrome.runtime.sendMessage({
        type: "CONFIRM_APPLIED",
        jobId,
        applied: true
      });
      box.innerHTML = r?.ok ? `<p>Recorded. The tracker shows it as Applied.</p>` : `<p>Could not record it: ${escapeHtml(r?.reason || "no response")}</p>`;
    });
    el("confirm-no").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({
        type: "CONFIRM_APPLIED",
        jobId,
        applied: false
      });
      box.hidden = true;
    });
  }
  (async () => {
    try {
      const { pendingConfirm, confirmAsked } = await chrome.storage.local.get([
        "pendingConfirm",
        "confirmAsked"
      ]);
      if (!pendingConfirm) return;
      const ageMs = Date.now() - (pendingConfirm.ts || 0);
      if (ageMs > 48 * 3600 * 1e3) {
        await chrome.storage.local.remove("pendingConfirm");
        return;
      }
      const alreadyAsked = confirmAsked && confirmAsked.jobId === pendingConfirm.jobId && confirmAsked.ts === pendingConfirm.ts;
      if (alreadyAsked) return;
      await chrome.storage.local.set({
        confirmAsked: { jobId: pendingConfirm.jobId, ts: pendingConfirm.ts }
      });
      ynRenderConfirmStrip(pendingConfirm.jobId);
    } catch {
    }
  })();
  function ynIndeedKeyOf(url) {
    const m = String(url || "").match(/[?&](?:jk|vjk)=([0-9a-f]{16})/i);
    return m ? m[1].toLowerCase() : "";
  }
  function ynMatchJobByIndeedKey(key, jobs) {
    const want = String(key || "").toLowerCase();
    if (!want) return null;
    return jobs.find((j) => ynIndeedKeyOf(j.url) === want) || null;
  }
  function ynMatchJobToTab(tabUrl, jobs) {
    const url = String(tabUrl || "");
    const page = url.split("?")[0];
    let match = jobs.find((j) => j.url && page.startsWith(j.url.split("?")[0]));
    if (match) return match;
    const li = url.match(/linkedin\.com\/jobs\/(?:view\/(\d+)|search\/?\?(?:.*&)?currentJobId=(\d+))/i);
    const liId = li && (li[1] || li[2]);
    if (liId) {
      match = jobs.find((j) => {
        const m = String(j.url || "").match(
          /linkedin\.com\/jobs\/(?:view\/(\d+)|search\/?\?(?:.*&)?currentJobId=(\d+))/i
        );
        return m && (m[1] || m[2]) === liId;
      });
      if (match) return match;
    }
    const reed = url.match(/reed\.co\.uk\/jobs\/[^/?#]+\/(\d+)/i);
    if (reed) {
      match = jobs.find((j) => {
        const m = String(j.url || "").match(/reed\.co\.uk\/jobs\/[^/?#]+\/(\d+)/i);
        return m && m[1] === reed[1];
      });
      if (match) return match;
    }
    const jk = ynIndeedKeyOf(url);
    if (jk) return ynMatchJobByIndeedKey(jk, jobs);
    return null;
  }
  function ynPickFrameResult(results) {
    const frameResults = (results || []).map((r) => r && r.result).filter((r) => r && !r.skipped_frame);
    const scored = (r) => {
      if (!r) return -1;
      const rep = r.report || {};
      return (rep.filled || []).length + (rep.guessed || []).length + (r.ok ? 0.5 : 0);
    };
    frameResults.sort((a, b) => scored(b) - scored(a));
    return frameResults[0] || null;
  }

  // extension/src/ui/popup/generic_fill.js
  async function ynGenericFill(tab, status, opts) {
    const keepStatus = !!(opts && opts.keepStatus);
    const prefix = keepStatus ? String(status.textContent || "") + " " : "";
    status.textContent = "Reading your profile…";
    let prof;
    try {
      prof = await chrome.runtime.sendMessage({ type: "GET_GENERIC_PROFILE" });
    } catch (e) {
      status.textContent = `Could not reach the extension's worker (${String(
        e?.message || e
      ).slice(0, 80)}).`;
      return;
    }
    if (!prof?.ok || !prof.profile) {
      status.textContent = connectionHint(prof);
      return;
    }
    try {
      await ynInjectOnce(tab.id, YN_FILL_SCRIPTS, "ynFillApplication", true);
    } catch (e) {
      console.warn("[YoungNug] generic fill injection refused:", e);
      status.textContent = "Fill failed: Chrome will not let extensions script this page.";
      return;
    }
    status.textContent = "Check the page and Approve to fill.";
    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: async (profile) => {
          if (typeof ynFillAnyPage !== "function") return null;
          return ynFillAnyPage(profile);
        },
        args: [prof.profile]
      });
    } catch (e) {
      console.warn("[YoungNug] generic fill execute refused:", e);
      status.textContent = "Fill failed. Open the form and try again.";
      return;
    }
    const r = ynPickFrameResult(results);
    if (!r) {
      status.textContent = "No form found on this page.";
      return;
    }
    if (!r.ok) {
      status.textContent = r.error === "captcha_stop" ? "Stopped: captcha or login wall on the page." : r.error === "no_profile" ? "Your profile is empty. Fill it in on YoungNug first." : `Fill failed: ${r.error || "no response"}`;
      if (r.report) ynRenderFillReport(r);
      return;
    }
    status.textContent = prefix + (r.report && r.report.cancelled ? "Cancelled: nothing was filled." : r.displayLine || "Fill finished.");
    ynRenderFillReport(r);
  }

  // extension/src/ui/popup/apply_click.js
  el("apply").addEventListener("click", async () => {
    const status = el("status");
    const reportBox = el("fill-report");
    if (reportBox) {
      reportBox.hidden = true;
      reportBox.textContent = "";
    }
    status.textContent = "Matching this page to your YoungNug jobs…";
    const tab = await activeTab();
    if (!tab?.id) {
      status.textContent = "No active tab.";
      return;
    }
    const jobs = await chrome.runtime.sendMessage({ type: "LIST_JOBS" });
    if (!jobs?.ok) {
      status.textContent = connectionHint(jobs);
      return;
    }
    let match = ynMatchJobToTab(tab.url || "", jobs.jobs || []);
    if (!match && /^https:\/\/smartapply\.indeed\.com\//i.test(tab.url || "")) {
      try {
        const [{ result } = {}] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const m = (document.documentElement.innerHTML || "").match(
              /[?&](?:jk|vjk)=([0-9a-f]{16})/i
            );
            return m ? m[1] : "";
          }
        });
        if (result) match = ynMatchJobByIndeedKey(result, jobs.jobs || []);
      } catch (e) {
        console.warn("[YoungNug] could not read the Indeed job key:", e);
      }
    }
    if (!match) {
      await ynGenericFill(tab, status);
      return;
    }
    try {
      await ynInjectOnce(tab.id, YN_FILL_SCRIPTS, "ynFillApplication", true);
    } catch (e) {
      console.warn("[YoungNug] fill injection refused:", e);
      status.textContent = "Fill failed: Chrome will not let extensions script this page.";
      return;
    }
    status.textContent = "Check the page and Approve to fill.";
    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: async (jobId) => {
          if (typeof ynFillApplication !== "function") return null;
          return ynFillApplication(jobId);
        },
        args: [match.id]
      });
    } catch (e) {
      console.warn("[YoungNug] fill execute refused:", e);
      status.textContent = "Fill failed. Open the application form, Approve the job, try again.";
      return;
    }
    const r = ynPickFrameResult(results);
    if (!r) {
      status.textContent = "Fill failed. Open the application form, Approve the job, try again.";
      return;
    }
    if (!r.ok) {
      if (r.error === "no_fill_plan") {
        status.textContent = "No tailored plan yet (Approve the job, or fix its documents in Studio). Filling from your profile.";
        await ynGenericFill(tab, status, { keepStatus: true });
        return;
      }
      status.textContent = r.error === "captcha_stop" ? "Stopped: captcha or login wall on the page." : `Fill failed: ${r.error || "no response"}`;
      if (r.report) ynRenderFillReport(r);
      return;
    }
    status.textContent = r.report && r.report.cancelled ? "Cancelled: nothing was filled." : r.displayLine || "Fill finished.";
    ynRenderFillReport(r);
    ynRenderConfirmStrip(match.id);
  });

  // extension/src/ui/popup/undo_and_save.js
  el("undo").addEventListener("click", async () => {
    const status = el("status");
    const tab = await activeTab();
    if (!tab?.id) {
      status.textContent = "No active tab.";
      return;
    }
    try {
      await ynInjectOnce(tab.id, YN_FILL_SCRIPTS, "ynFillApplication", true);
    } catch (e) {
      console.warn("[YoungNug] undo injection refused:", e);
      status.textContent = "Chrome will not let extensions script this page.";
      return;
    }
    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => typeof ynUndoFill === "function" ? ynUndoFill() : null
      });
    } catch (e) {
      console.warn("[YoungNug] undo execute refused:", e);
      status.textContent = "Could not run on this page. Try again.";
      return;
    }
    const out = (results || []).map((r) => r && r.result).find((r) => r && typeof r === "object");
    const n = out && typeof out.reverted === "number" ? out.reverted : 0;
    status.textContent = n ? `Undid ${n} field${n === 1 ? "" : "s"}.` : "Nothing to undo.";
  });
  el("save-answers").addEventListener("click", async () => {
    const status = el("status");
    const tab = await activeTab();
    if (!tab?.id) {
      status.textContent = "No active tab.";
      return;
    }
    status.textContent = "Reading your answers on this page…";
    let read;
    try {
      await ynInjectOnce(tab.id, YN_FILL_SCRIPTS, "ynFillApplication", true);
      const reads = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => ynCollectUserAnswers()
      });
      read = (reads || []).map((r2) => r2 && r2.result).filter((r2) => Array.isArray(r2) && r2.length).sort((a, b) => b.length - a.length)[0];
      read = { result: read || [] };
    } catch (e) {
      console.warn("[YoungNug] answers read refused:", e);
      status.textContent = "Chrome will not let extensions read this page. Its own pages, the Web Store and PDFs are off limits.";
      return;
    }
    const items = read && read.result || [];
    if (!items.length) {
      status.textContent = "No recognised answers on this page to save (only factual questions like notice period, salary, right to work are reusable).";
      return;
    }
    const lines = items.map(
      (i) => `• ${i.label}: ${i.value === true ? "Yes" : i.value === false ? "No" : i.value}`
    ).join("\n");
    const consentOk = confirm(
      "Save these answers to your YoungNug profile so future forms can reuse them?\n\n" + lines + "\n\nOnly the items above are updated. Nothing else changes."
    );
    if (!consentOk) return;
    const r = await chrome.runtime.sendMessage({ type: "SAVE_ANSWERS", items });
    if (r?.ok) {
      const n = r.saved.length;
      const part = (r.failed || []).length ? ` ${r.failed.length} section(s) did not save. Try again.` : "";
      status.textContent = `Saved ${n} answer${n === 1 ? "" : "s"} to your profile.` + part;
    } else {
      status.textContent = `Could not save: ${r?.error || "no response"}`;
    }
  });

  // extension/src/ui/popup/imports.js
  function readSummary(read) {
    if (!read) return "";
    const parts = [
      [read.experience, "roles"],
      [read.education, "education entries"],
      [read.skills, "skills"],
      [read.certifications, "certifications"],
      [read.volunteering, "volunteering"],
      [read.projects, "projects"],
      [read.languages, "languages"]
    ].filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
    if (!parts.length) return "";
    const missing = [
      ["experience", "Experience"],
      ["education", "Education"],
      ["certifications", "Certifications"],
      ["skills", "Skills"]
    ].filter(([key]) => !read[key]).map(([, label]) => label);
    const missingNote = missing.length ? ` Nothing readable in: ${missing.join(", ")}.` : "";
    const skillsNote = read.skills > 0 && read.skills_source === "profile" ? " Skills are the profile page's preview. The full list did not load this time." : "";
    return `Read ${parts.join(", ")} from your page.${missingNote}${skillsNote}`;
  }
  function importSummary(up) {
    const imp = up.imported || {};
    const parts = [
      [imp.experience, "roles"],
      [imp.education, "education"],
      [imp.skills, "skills"],
      [imp.certifications, "certifications"],
      [imp.volunteering, "volunteering"],
      [imp.projects, "projects"]
    ].filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
    const skipped = up.total_skipped ? ` ${up.total_skipped} item${up.total_skipped === 1 ? "" : "s"} skipped (duplicates or not importable).` : "";
    if (!parts.length)
      return `Nothing new to add. Your profile already has all of it.${skipped}`;
    return `Filled in ${parts.join(", ")}. Marked for your review. Check them in the setup wizard or on your Profile page, then save.${skipped}`;
  }
  function announceImport(phase, error) {
    try {
      chrome.runtime.sendMessage({
        type: "IMPORT_ANNOUNCE",
        source: "linkedin",
        phase,
        error: error || ""
      }).catch(() => {
      });
    } catch {
    }
  }
  async function setupLinkedInImport() {
    const tab = await activeTab();
    if (!/https:\/\/[^/]*linkedin\.com\/in\//.test(tab.url || "")) return;
    const btn = el("li-import");
    btn.hidden = false;
    btn.addEventListener("click", async () => {
      const consent = confirm(
        "Fill your profile from this LinkedIn page?\n\nRead locally, staged for review. Nothing appears until you save it; existing entries stay untouched."
      );
      if (!consent) return;
      announceImport("started");
      el("status").textContent = "Reading your profile… the page scrolls itself while its sections load (about 10-20 seconds). Keep this tab open.";
      try {
        await ynInjectOnce(
          tab.id,
          [
            "common/api.js",
            "common/challenge_detect.js",
            "content/linkedin_profile.js"
          ],
          "ynReadProfile"
        );
      } catch (e) {
        console.warn("[YoungNug] profile-reader injection refused:", e);
        el("status").textContent = "Import stopped: Chrome will not let extensions read this page.";
        announceImport("failed", "Chrome refused to read this page");
        return;
      }
      chrome.tabs.sendMessage(
        tab.id,
        { type: "LINKEDIN_READ_PROFILE" },
        async (r) => {
          if (!r?.ok) {
            el("status").textContent = `Import stopped: ${r?.error || "no response"}`;
            announceImport("failed", r?.error || "could not read the page");
            return;
          }
          const up = await chrome.runtime.sendMessage({
            type: "LINKEDIN_IMPORT",
            data: r.data
          });
          el("status").textContent = up?.ok ? `${readSummary(r.read)} ${importSummary(up)}`.trim() : `Could not import: ${up?.error || "unknown error"}`;
        }
      );
    });
  }
  async function setupGitHubImport() {
    const tab = await activeTab();
    const m = /https:\/\/github\.com\/([A-Za-z0-9-]+)\/?$/.exec(
      (tab.url || "").split("?")[0]
    );
    if (!m) return;
    const username = m[1];
    const btn = el("gh-import");
    btn.hidden = false;
    btn.textContent = `Import GitHub (${username})`;
    btn.addEventListener("click", async () => {
      const consent = confirm(
        `Import ${username}'s public GitHub repos and languages as projects and skills?

Flagged for review; nothing appears until you confirm it.`
      );
      if (!consent) return;
      el("status").textContent = "Reading public GitHub profile…";
      const up = await chrome.runtime.sendMessage({
        type: "GITHUB_IMPORT",
        username
      });
      el("status").textContent = up?.ok ? `Imported ${up.repos} repos + ${up.languages} languages for review. Check them on your Profile page.` : /422/.test(up?.error || "") ? "That GitHub account has no public repositories. Nothing to import." : `Could not import: ${up?.error || "unknown error"}`;
    });
  }

  // extension/src/ui/popup/posting.js
  var YN_POSTING_SCRIPTS = [
    "common/api.js",
    "common/yn_theme.js",
    "common/challenge_detect.js",
    "common/label_quality.js",
    "common/overlay_box.js",
    "content/dom_fill_kit.js",
    "content/engine.js",
    "content/detect.js",
    "content/adapters/indeed_employer.js",
    "content/posting_filler.js"
  ];
  function ynRenderPostingReport(result) {
    const box = el("posting-report");
    if (!box) return;
    if (!result) {
      box.hidden = true;
      box.textContent = "";
      return;
    }
    const report = result.report || {};
    const guessedN = (report.guessed || []).length;
    const done = (report.filled || []).length + guessedN;
    const parts = [];
    if (result.sponsorship_stop) {
      parts.push(
        `<p class="fill-ats">Stopped at the sponsorship budget step.</p>`,
        `<p>${escapeHtml(result.sponsorship_label || "A budget field")} needs your decision. Nothing was entered.</p>`
      );
    } else {
      parts.push(
        `<p><strong>Filled ${done} field(s)</strong>` + (guessedN ? ` · ${guessedN} to check` : "") + `</p>`
      );
      if (guessedN) {
        const labels = (report.guessed || []).map((e) => ynReportFieldLabel(e)).filter(Boolean).slice(0, 5);
        if (labels.length) {
          parts.push(
            `<p class="fill-check">Check these: ${escapeHtml(labels.join("; "))}</p>`
          );
        }
      }
      if ((report.unresolved || []).length) {
        const labels = (report.unresolved || []).map((e) => ynReportFieldLabel(e)).filter(Boolean).slice(0, 5);
        if (labels.length) {
          parts.push(
            `<p class="fill-miss">I could not fill these: ${escapeHtml(labels.join("; "))}</p>`
          );
        }
      }
      if ((report.skipped_payment || []).length) {
        parts.push(`<p class="muted">Payment fields are never filled.</p>`);
      }
      if ((report.skipped_terms || []).length) {
        parts.push(
          `<p class="muted">Terms boxes are left for you to read and tick.</p>`
        );
      }
      if (result.descriptionLeft) {
        parts.push(
          `<p class="fill-check">The description editor is rich text. Paste the description from YoungNug yourself.</p>`
        );
      }
    }
    parts.push(
      `<p class="fill-never">Nothing was posted - review and post it yourself.</p>`
    );
    box.innerHTML = parts.join("");
    box.hidden = false;
  }
  function ynRenderPostConfirmStrip(listingId) {
    const box = el("confirm-posted");
    if (!box) return;
    box.innerHTML = `<p>Did you review and post this listing on Indeed yourself?</p><button id="posted-yes" class="primary">I posted it - record it</button><button id="posted-no" class="quiet">Not yet</button>`;
    box.hidden = false;
    el("posted-yes").addEventListener("click", async () => {
      const r = await chrome.runtime.sendMessage({
        type: "CONFIRM_POSTED",
        listingId,
        posted: true
      });
      box.innerHTML = r?.ok ? `<p>Recorded against the listing.</p>` : `<p>Could not record it: ${escapeHtml(r?.reason || r?.error || "no response")}</p>`;
    });
    el("posted-no").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({
        type: "CONFIRM_POSTED",
        listingId,
        posted: false
      });
      box.hidden = true;
    });
  }
  (async () => {
    try {
      const { pendingPostConfirm, postConfirmAsked } = await chrome.storage.local.get(["pendingPostConfirm", "postConfirmAsked"]);
      if (!pendingPostConfirm) return;
      const ageMs = Date.now() - (pendingPostConfirm.ts || 0);
      if (ageMs > 48 * 3600 * 1e3) {
        await chrome.storage.local.remove("pendingPostConfirm");
        return;
      }
      const alreadyAsked = postConfirmAsked && postConfirmAsked.listingId === pendingPostConfirm.listingId && postConfirmAsked.ts === pendingPostConfirm.ts;
      if (alreadyAsked) return;
      await chrome.storage.local.set({
        postConfirmAsked: {
          listingId: pendingPostConfirm.listingId,
          ts: pendingPostConfirm.ts
        }
      });
      ynRenderPostConfirmStrip(pendingPostConfirm.listingId);
    } catch {
    }
  })();
  async function setupIndeedPosting() {
    const card = el("posting-card");
    if (!card) return;
    const tab = await activeTab();
    if (!/^https:\/\/employers\.indeed\.com\//.test(tab?.url || "")) return;
    let status;
    try {
      status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
    } catch {
      return;
    }
    if (!status?.ok || status.role !== "employer") return;
    const listings = await chrome.runtime.sendMessage({ type: "LIST_LISTINGS" });
    const pStatus = el("posting-status");
    card.hidden = false;
    if (!listings?.ok) {
      pStatus.textContent = connectionHint(listings);
      el("posting-prepare").disabled = true;
      return;
    }
    const approved = (listings.listings || []).filter(
      (l) => l && l.status === "approved"
    );
    const select = el("posting-listing");
    select.innerHTML = "";
    if (!approved.length) {
      pStatus.textContent = "No approved listings yet. A listing must pass moderation before it can be posted to a board.";
      el("posting-prepare").disabled = true;
      return;
    }
    for (const l of approved) {
      const opt = document.createElement("option");
      opt.value = String(l.id);
      opt.textContent = `${l.role} (${l.company})`.slice(0, 80);
      select.appendChild(opt);
    }
    el("posting-prepare").addEventListener("click", async () => {
      const listingId = Number(select.value);
      if (!Number.isFinite(listingId) || listingId <= 0) {
        pStatus.textContent = "Pick a listing first.";
        return;
      }
      const reportBox = el("posting-report");
      if (reportBox) {
        reportBox.hidden = true;
        reportBox.textContent = "";
      }
      pStatus.textContent = "Filling the posting form from your listing…";
      try {
        await ynInjectOnce(tab.id, YN_POSTING_SCRIPTS, "ynPrepareIndeedPosting");
      } catch (e) {
        console.warn("[YoungNug] posting injection refused:", e);
        pStatus.textContent = "Chrome will not let extensions script this page.";
        return;
      }
      let results;
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async (id) => {
            if (typeof ynPrepareIndeedPosting !== "function") return null;
            return ynPrepareIndeedPosting(id);
          },
          args: [listingId]
        });
      } catch (e) {
        console.warn("[YoungNug] posting execute refused:", e);
        pStatus.textContent = "Could not run on this page. Try again.";
        return;
      }
      const r = results && results[0] && results[0].result;
      if (!r) {
        pStatus.textContent = "Could not run on this page. Try again.";
        return;
      }
      if (!r.ok) {
        pStatus.textContent = r.error === "no_posting_plan" ? "No posting plan: is this listing yours and approved?" : r.error === "captcha_stop" ? "Stopped: challenge or login wall on the page." : r.error === "not_employer_surface" ? "This is not the Indeed employer posting page." : `Stopped: ${r.error || "no response"}`;
        return;
      }
      pStatus.textContent = r.sponsorship_stop ? "Stopped at the sponsorship budget step." : "Posting form prepared.";
      ynRenderPostingReport(r);
      if (!r.sponsorship_stop) ynRenderPostConfirmStrip(listingId);
    });
  }

  // extension/src/ui/popup/opts_and_resolver.js
  el("opts").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  var YN_RESOLVER_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|icims\.com|taleo\.net|myworkdayjobs\.com|teamtailor\.com|recruitee\.com|apply\.workable\.com)\//i;
  async function pingResolver() {
    try {
      const tab = await activeTab();
      if (!tab?.id) return;
      if (!YN_RESOLVER_HOSTS.test(tab.url || "")) return;
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/resolver_ping.js"]
      });
    } catch {
    }
  }
  async function pingLiveness() {
    try {
      const tab = await activeTab();
      if (!tab?.id) return;
      await ynPingLiveness(tab.id, tab.url || "");
    } catch {
    }
  }

  // extension/src/ui/popup/index.js
  void refreshStatus();
  void setupDevSection();
  void setupLinkedInImport();
  void setupGitHubImport();
  void setupIndeedPosting();
  void pingResolver();
  void pingLiveness();
  globalThis.el = el;
  globalThis.activeTab = activeTab;
  globalThis.connectionHint = connectionHint;
  globalThis.ynPaintKill = ynPaintKill;
  globalThis.ynPaintContext = ynPaintContext;
  globalThis.ynPaintWarning = ynPaintWarning;
  globalThis.refreshStatus = refreshStatus;
  globalThis.announceCapture = announceCapture;
  globalThis.ynHostOfTab = ynHostOfTab;
  globalThis.YN_FILL_SCRIPTS = YN_FILL_SCRIPTS;
  globalThis.ynRenderFillReport = ynRenderFillReport;
  globalThis.escapeHtml = escapeHtml;
  globalThis.ynRenderConfirmStrip = ynRenderConfirmStrip;
  globalThis.ynIndeedKeyOf = ynIndeedKeyOf;
  globalThis.ynMatchJobByIndeedKey = ynMatchJobByIndeedKey;
  globalThis.ynMatchJobToTab = ynMatchJobToTab;
  globalThis.ynPickFrameResult = ynPickFrameResult;
  globalThis.ynGenericFill = ynGenericFill;
  globalThis.readSummary = readSummary;
  globalThis.importSummary = importSummary;
  globalThis.announceImport = announceImport;
  globalThis.setupLinkedInImport = setupLinkedInImport;
  globalThis.setupGitHubImport = setupGitHubImport;
  globalThis.YN_POSTING_SCRIPTS = YN_POSTING_SCRIPTS;
  globalThis.ynRenderPostingReport = ynRenderPostingReport;
  globalThis.ynRenderPostConfirmStrip = ynRenderPostConfirmStrip;
  globalThis.setupIndeedPosting = setupIndeedPosting;
  globalThis.YN_RESOLVER_HOSTS = YN_RESOLVER_HOSTS;
  globalThis.pingResolver = pingResolver;
  globalThis.pingLiveness = pingLiveness;
  globalThis.YN_DEV_RULES_KEY = YN_DEV_RULES_KEY;
  globalThis.YN_DEV_RULES_MAX = YN_DEV_RULES_MAX;
  globalThis.YN_DEV_HOST_RE = YN_DEV_HOST_RE;
  globalThis.YN_DEV_SELECTOR_RE = YN_DEV_SELECTOR_RE;
  globalThis.ynValidHost = ynValidHost;
  globalThis.ynValidSelector = ynValidSelector;
  globalThis.ynRenderDevRules = ynRenderDevRules;
  globalThis.ynLoadDevRules = ynLoadDevRules;
  globalThis.setupDevSection = setupDevSection;
})();
