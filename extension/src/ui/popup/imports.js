// popup.js — the consent-gated LinkedIn and GitHub profile imports: shown
// only on the matching page, one click, staged server-side for review.
import { el, activeTab } from "./status.js";

// The one-click LinkedIn grab: shown ONLY on linkedin.com/in/* — explicit
// consent click, an accurate per-section result (never a fabricated one).

// What the READER got off the page, per section — distinct from what the
// server then imported (importSummary below covers that). Read failures per
// section are named, so a half-loaded page is tellable from a layout change.
function readSummary(read) {
  if (!read) return "";
  const parts = [
    [read.experience, "roles"],
    [read.education, "education entries"],
    [read.skills, "skills"],
    [read.certifications, "certifications"],
    [read.volunteering, "volunteering"],
    [read.projects, "projects"],
    [read.languages, "languages"],
  ]
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`);
  if (!parts.length) return "";
  const missing = [
    ["experience", "Experience"],
    ["education", "Education"],
    ["certifications", "Certifications"],
    ["skills", "Skills"],
  ]
    .filter(([key]) => !read[key])
    .map(([, label]) => label);
  const missingNote = missing.length
    ? ` Nothing readable in: ${missing.join(", ")}.`
    : "";
  const skillsNote =
    read.skills > 0 && read.skills_source === "profile"
      ? " Skills are the profile page's preview. The full list did not load this time."
      : "";
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
    [imp.projects, "projects"],
  ]
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`);
  const skipped = up.total_skipped
    ? ` ${up.total_skipped} item${up.total_skipped === 1 ? "" : "s"} skipped (duplicates or not importable).`
    : "";
  if (!parts.length)
    return `Nothing new to add. Your profile already has all of it.${skipped}`;
  return (
    `Filled in ${parts.join(", ")}. Marked for your review. ` +
    `Check them in the setup wizard or on your Profile page, then save.${skipped}`
  );
}

/** Tell the worker (which relays to any open YoungNug app tab) where the
 * import stands, so the app's Continue can reflect the REAL state instead of
 * proceeding blind. Fire-and-forget — a sleeping worker never blocks the
 * import itself. */
function announceImport(phase, error) {
  try {
    chrome.runtime
      .sendMessage({
        type: "IMPORT_ANNOUNCE",
        source: "linkedin",
        phase,
        error: error || "",
      })
      .catch(() => {});
  } catch {
    /* worker unreachable — the app falls back to its manual check */
  }
}

async function setupLinkedInImport() {
  const tab = await activeTab();
  if (!/https:\/\/[^/]*linkedin\.com\/in\//.test(tab.url || "")) return;
  const btn = el("li-import");
  btn.hidden = false;
  btn.addEventListener("click", async () => {
    // 47 words, over the 25-word budget. Trimmed to the three facts a
    // consent dialog actually needs: where it reads from, that nothing is
    // used until reviewed, and that existing data is safe.
    const consent = confirm(
      "Fill your profile from this LinkedIn page?\n\n" +
        "Read locally, staged for review. Nothing appears until you save " +
        "it; existing entries stay untouched.",
    );
    if (!consent) return;
    announceImport("started");
    el("status").textContent =
      "Reading your profile… the page scrolls itself while its sections " +
      "load (about 10-20 seconds). Keep this tab open.";
    // The profile reader is click-time injected now (no static LinkedIn
    // content script remains). ynInjectOnce's sentinel skips re-injection,
    // so the reader's message listener registers exactly once.
    try {
      await ynInjectOnce(
        tab.id,
        [
          "common/api.js",
          "common/challenge_detect.js",
          "content/linkedin_profile.js",
        ],
        "ynReadProfile",
      );
    } catch (e) {
      console.warn("[YoungNug] profile-reader injection refused:", e);
      el("status").textContent =
        "Import stopped: Chrome will not let extensions read this page.";
      announceImport("failed", "Chrome refused to read this page");
      return;
    }
    chrome.tabs.sendMessage(
      tab.id,
      { type: "LINKEDIN_READ_PROFILE" },
      async (r) => {
        if (!r?.ok) {
          el("status").textContent =
            `Import stopped: ${r?.error || "no response"}`;
          announceImport("failed", r?.error || "could not read the page");
          return;
        }
        // "done"/"failed" for the POST itself is announced by the worker
        // (LINKEDIN_IMPORT), which sees the server's real answer.
        const up = await chrome.runtime.sendMessage({
          type: "LINKEDIN_IMPORT",
          data: r.data,
        });
        el("status").textContent = up?.ok
          ? `${readSummary(r.read)} ${importSummary(up)}`.trim()
          : `Could not import: ${up?.error || "unknown error"}`;
      },
    );
  });
}

// GitHub import: public API, keyless. Shown on github.com/<user> pages —
// explicit consent click; staged for review exactly like LinkedIn.
async function setupGitHubImport() {
  const tab = await activeTab();
  const m = /https:\/\/github\.com\/([A-Za-z0-9-]+)\/?$/.exec(
    (tab.url || "").split("?")[0],
  );
  if (!m) return;
  const username = m[1];
  const btn = el("gh-import");
  btn.hidden = false;
  btn.textContent = `Import GitHub (${username})`;
  btn.addEventListener("click", async () => {
    // 39 words, over the 25-word budget. Trimmed to what is imported,
    // that it is public, and that nothing is used until confirmed.
    const consent = confirm(
      `Import ${username}'s public GitHub repos and languages as ` +
        "projects and skills?\n\nFlagged for review; nothing appears " +
        "until you confirm it.",
    );
    if (!consent) return;
    el("status").textContent = "Reading public GitHub profile…";
    const up = await chrome.runtime.sendMessage({
      type: "GITHUB_IMPORT",
      username,
    });
    el("status").textContent = up?.ok
      ? `Imported ${up.repos} repos + ${up.languages} languages for review. Check them on your Profile page.`
      : /422/.test(up?.error || "")
        ? "That GitHub account has no public repositories. Nothing to import."
        : `Could not import: ${up?.error || "unknown error"}`;
  });
}

export { readSummary, importSummary, announceImport, setupLinkedInImport, setupGitHubImport };
