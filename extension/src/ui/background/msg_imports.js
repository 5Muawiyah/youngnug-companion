// background.js — the profile-import message group: LINKEDIN_IMPORT (the
// staged server-side import), IMPORT_ANNOUNCE (the popup's consent/read
// phase relay), GITHUB_IMPORT (public, keyless). See dispatch.js for how
// handle() tries each message group in turn.
import { ynAnnounceImportStatus } from "./capture_record.js";

async function ynHandleImportMessages(msg, sender) {
  switch (msg.type) {
    case "LINKEDIN_IMPORT": {
      // consent-gated (popup click), staged server-side for user review.
      // The outcome is broadcast to any open YoungNug app tab (via
      // app_bridge) so the app's import flow reflects the SERVER's real
      // answer — "done" here means the merge actually landed.
      try {
        const r = await ynApi("/api/profile/import/linkedin", {
          method: "POST",
          body: JSON.stringify(msg.data),
        });
        const report = await r.json();
        void ynAnnounceImportStatus("linkedin", "done", {
          imported: report.imported || {},
          total_imported: report.total_imported || 0,
          total_skipped: report.total_skipped || 0,
        });
        return { ok: true, ...report };
      } catch (e) {
        void ynAnnounceImportStatus("linkedin", "failed", {
          error: String(e).slice(0, 300),
        });
        throw e;
      }
    }
    case "IMPORT_ANNOUNCE": {
      // popup → app tabs: "started" when the user consents, "failed" when
      // the read stops before any POST. Relay only — no fabricated phases.
      const phase = ["started", "failed"].includes(msg.phase) ? msg.phase : "";
      if (!phase) return { ok: false, error: "bad phase" };
      await ynAnnounceImportStatus(
        msg.source === "github" ? "github" : "linkedin",
        phase,
        { error: typeof msg.error === "string" ? msg.error.slice(0, 300) : "" },
      );
      return { ok: true };
    }
    case "GITHUB_IMPORT": {
      // PUBLIC GitHub only, keyless API, consent-gated (popup
      // click), staged server-side (gh_import) for user review.
      // The stop check is HERE and not left to ynApi below: this fetch goes
      // to a third-party host and used to run BEFORE any ynApi call, so with
      // the kill switch on a request still left the machine. "Stop
      // everything" has to mean every egress point, not most of them.
      const ghStop = await ynStopReason();
      if (ghStop) return { ok: false, error: ghStop };
      const u = encodeURIComponent(msg.username);
      const gh = await fetch(
        `https://api.github.com/users/${u}/repos?sort=pushed&per_page=30`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!gh.ok) return { ok: false, error: `GitHub API ${gh.status}` };
      const repos = (await gh.json())
        .filter((repo) => !repo.fork)
        .map((repo) => ({
          name: repo.name || "",
          description: repo.description || "",
          language: repo.language || "",
          stars: repo.stargazers_count || 0,
          url: repo.html_url || "",
          pushed_at: repo.pushed_at || "",
        }));
      try {
        const r = await ynApi("/api/profile/import/github", {
          method: "POST",
          body: JSON.stringify({
            username: msg.username,
            repos,
            source_url: `https://github.com/${msg.username}`,
          }),
        });
        const report = await r.json();
        void ynAnnounceImportStatus("github", "done", {
          imported: report.imported || {},
          total_imported: report.total_imported || 0,
          total_skipped: report.total_skipped || 0,
        });
        return { ok: true, ...report };
      } catch (e) {
        void ynAnnounceImportStatus("github", "failed", {
          error: String(e).slice(0, 300),
        });
        throw e;
      }
    }
    default:
      return undefined;
  }
}

export { ynHandleImportMessages };
