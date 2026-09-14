// popup.js — Developer: custom capture selectors. Per-site CSS selectors
// (title/body) an advanced user can add here, collapsed under the Advanced
// <details> by default. Validated and stored under a namespaced key in
// chrome.storage.local, and WIRED into capture: both capture callers read
// the rules here and pass them into the injected ynCaptureCurrent as an
// argument, where the matching site's rule leads the read (capture.js
// re-validates for itself and stays storage-free). Selectors only: never a
// script, never a URL. The extension's hard safety stops (never-submit,
// the captcha/login-wall sentinels, personal-use stamping, the fan-out
// budget) are not editable from this section, and its own note says so.
import { el } from "./status.js";

const YN_DEV_RULES_KEY = "ynCaptureOverlaySelectors";
const YN_DEV_RULES_MAX = 20;

// A bare hostname, optionally with a leading "*." wildcard subdomain — no
// scheme, no path, no query. Keeps the field to "which site", not somewhere
// to paste a URL.
const YN_DEV_HOST_RE =
  /^(\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

// CSS selector syntax only: letters, digits and the punctuation selectors
// actually use. No angle brackets, so no markup can ride in this field.
const YN_DEV_SELECTOR_RE = /^[a-zA-Z0-9\s.#:_\-,>~+*()="'[\]]{1,200}$/;

function ynValidHost(v) {
  return YN_DEV_HOST_RE.test(String(v || "").trim());
}

function ynValidSelector(v) {
  const s = String(v || "").trim();
  if (!s || !YN_DEV_SELECTOR_RE.test(s)) return false;
  // Belt and braces beyond the allowlist: these substrings have no place in
  // a CSS selector and every one of them is a sign the field is being used
  // for something other than a selector.
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
    del.innerHTML =
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round"/></svg>';
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
      msg.textContent =
        "Selectors only: CSS selector syntax, never a script or a URL.";
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
      { id: `${pattern}-${Date.now()}`, pattern, titleSelector, bodySelector },
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

export {
  YN_DEV_RULES_KEY,
  YN_DEV_RULES_MAX,
  YN_DEV_HOST_RE,
  YN_DEV_SELECTOR_RE,
  ynValidHost,
  ynValidSelector,
  ynRenderDevRules,
  ynLoadDevRules,
  setupDevSection,
};
