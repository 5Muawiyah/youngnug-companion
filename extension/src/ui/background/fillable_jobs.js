// background.js — the LIST_JOBS matcher's merge: the feed page's own jobs
// plus every tracker row whose status a fill-plan would still serve.

// Statuses whose job a fill-plan will serve (the server answers
// 404 for anything else), so only these rows are worth matching a tab to.
const YN_FILLABLE_STATUSES = new Set([
  "queued_extension",
  "prepared",
  "prepared_email",
  "filled_pending_submit",
  "approved",
  "manual",
  "queued_email",
  "filled",
]);

// The matcher's list: the feed page first (unchanged), then every tracker
// row with a fill-able status whose job is not already on the page, in the
// same {id, title, employer, url} shape the matcher reads. Pure, so the
// harness can prove it.
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
      application_status: a.status,
    });
  }
  return out;
}

export { YN_FILLABLE_STATUSES, ynMergeFillableJobs };
