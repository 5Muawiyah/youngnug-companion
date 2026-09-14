// popup.js — the Options-page link, the direct-link resolver ping, and the
// live-listing re-check ping, both fired on popup-open (the user's own
// click, which is what grants activeTab for that read).
import { el, activeTab } from "./status.js";

el("opts").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Opening the popup IS the user's click (activeTab is granted), so the
// direct-link resolver ping runs here — the old passive ATS content scripts
// are gone, and without this the aggregator-URL → ATS-URL pairing could
// never fire. resolver_ping.js is observe-only (no DOM read, no fetch, no
// bindings — safe to re-run) and the worker's ynResolveDecision guards do
// all the filtering. Best-effort: chrome:// pages refuse injection.
// The resolver ping used to be restricted to the ATS hosts by the manifest's
// per-host content-script entries. Click-time injection has no such gate, so
// the host check is re-established here: without it, opening the popup on
// ANY unrelated tab inside the 3-minute pairing window would post that
// tab's URL as the job's canonical direct-apply link.
const YN_RESOLVER_HOSTS =
  /^https:\/\/([a-z0-9-]+\.)*(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|icims\.com|taleo\.net|myworkdayjobs\.com|teamtailor\.com|recruitee\.com|apply\.workable\.com)\//i;

async function pingResolver() {
  try {
    const tab = await activeTab();
    if (!tab?.id) return;
    if (!YN_RESOLVER_HOSTS.test(tab.url || "")) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/resolver_ping.js"],
    });
  } catch {
    /* non-injectable page — the resolver simply doesn't fire here */
  }
}

// The live re-check fires the SAME way the resolver ping
// above does: opening the popup IS the user's click (activeTab is
// granted). ynPingLiveness (common/inject_once.js) is the shared
// inject-and-run helper the Capture keyboard shortcut also calls
// (background.js) — the two triggers cannot drift on which hosts or which
// files.
async function pingLiveness() {
  try {
    const tab = await activeTab();
    if (!tab?.id) return;
    await ynPingLiveness(tab.id, tab.url || "");
  } catch {
    /* non-injectable page — the check simply doesn't fire here */
  }
}

export { YN_RESOLVER_HOSTS, pingResolver, pingLiveness };
