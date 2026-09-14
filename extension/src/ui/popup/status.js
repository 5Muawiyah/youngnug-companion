// popup.js — connection status: a real /api/me ping (never token presence
// alone), the failure-hint copy, the warnings/context lines, and the one
// stop-control's click handler (the same switch starts things again).
import { escapeHtml } from "./fill_report.js";

const el = (id) => document.getElementById(id);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Why the status check failed, in words a student can act on. Every
 * failure used to collapse into one canned "open the app" line, which is
 * wrong advice for a kill switch, a dead token, or a server error. */
function connectionHint(r) {
  const err = String(r?.error || "");
  if (r?.killSwitch || /kill switch/i.test(err)) {
    // The kill switch is one toggle, both directions — pressing it again is
    // what starts things back up, so the hint names the same control.
    return "Kill switch is on. Press it again, then open YoungNug again.";
  }
  if (/HTTP 401/.test(err)) {
    // 27 words, over the 25-word budget. Trimmed without losing the
    // fact that another browser signing in is the usual cause.
    return (
      "Your saved connection expired or was replaced (from another " +
      "browser). Open YoungNug in a tab, logged in: it reconnects " +
      "automatically."
    );
  }
  if (/HTTP \d{3}/.test(err)) {
    return `YoungNug answered with an error: ${err.slice(0, 140)}`;
  }
  if (err && !/no token/.test(err)) {
    return (
      `Could not reach ${r?.apiBase || "YoungNug"}. Is it running? ` +
      "Open YoungNug in a tab while logged in to reconnect."
    );
  }
  return "Open YoungNug in a tab while logged in: the extension connects itself.";
}

/** Paint the stop control from a boolean. #kill is a role="switch" button
 * (aria-checked IS the state, read by both the CSS and assistive tech, and
 * the same source of truth the options page reads with its own paintKill).
 * One control, both directions: the title never changes ("Stop everything"
 * always names what pressing it while running does), and the state word is
 * the only thing that flips, unmissable in the CSS's danger fill when
 * stopped. There is no separate restart control to reveal or hide — the
 * same switch pressed again is exactly how you start it back up. */
function ynPaintKill(on) {
  const btn = el("kill");
  if (!btn) return;
  btn.setAttribute("aria-checked", on ? "true" : "false");
  const state = el("kill-state");
  if (state) state.textContent = on ? "Stopped" : "Running";
}

/**
 * What the Companion can do on THIS page, in one line — shown only while
 * connected and running, where it is true; hidden the moment either stops
 * being true rather than left to say something stale next to a banner that
 * already contradicts it.
 */
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

/**
 * The warnings surface. Shown ONLY when there is something true to say:
 * the platform's own notice for this account, or the fact that this account
 * has been stopped from YoungNug. Never a decorative banner — a surface
 * that is usually populated with nothing in particular is a surface people
 * stop reading, and this one has to still work the day it matters.
 */
function ynPaintWarning(r) {
  const box = el("warn");
  if (!box) return;
  const parts = [];
  if (r && r.serverStop) {
    parts.push(
      "<strong>Stopped from your YoungNug account</strong>" +
        "Nothing runs until it is lifted on the site.",
    );
  }
  const text = String((r && r.warning) || "").slice(0, 300);
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
    // A broken/reloading worker used to leave the popup stuck on
    // "Checking connection…" forever — the third, undesigned state.
    conn.textContent = "Extension error";
    conn.className = "status-line status-bad";
    dot.classList.remove("ok");
    el("conn-detail").textContent =
      `The extension's background worker is not responding (${String(
        e?.message || e,
      ).slice(0, 120)}). Reload the extension from chrome://extensions.`;
    return;
  }
  if (r?.ok) {
    // A first name greets by name ("Hello <first_name>"). No name on the
    // account yet is a plain, neutral "Connected" — never the email
    // address, which is not what anyone is called and was never something
    // a student typed in on purpose to be shown here.
    conn.textContent = r.first_name ? `Hello ${r.first_name}` : "Connected";
    conn.className = "status-line status-ok";
    dot.classList.add("ok");
    // The raw API base is an internal detail, not a student-facing fact —
    // printing it read like a bug. The ONE state worth flagging is a
    // loopback dev server; production says nothing extra.
    el("conn-detail").textContent = /^http:\/\/(127\.0\.0\.1|localhost)\b/i.test(
      r.apiBase || "",
    )
      ? "Connected to a development server"
      : "";
  } else {
    conn.textContent = "Not connected";
    conn.className = "status-line status-bad";
    dot.classList.remove("ok");
    el("conn-detail").textContent = connectionHint(r);
  }
  if (r?.killSwitch !== undefined) ynPaintKill(!!r.killSwitch);
  ynPaintWarning(r);
  ynPaintContext(r);
}

// THE STOP. One toggle, both directions — the same control the options page
// already used: pressed while running it sets killSwitch true, pressed
// while stopped it sets killSwitch false, read from the switch's own current
// aria-checked. Pure chrome.storage.local — no message to the worker, no
// network — which is what lets it work with the API unreachable, the one
// state in which a stop control really has to work.
el("kill").addEventListener("click", async () => {
  const btn = el("kill");
  const next = btn.getAttribute("aria-checked") !== "true";
  ynPaintKill(next);
  try {
    await chrome.storage.local.set({ killSwitch: next });
  } catch (e) {
    // Storage refused (private mode, quota): say so rather than leaving a
    // control that shows the wrong state. On success the switch's own state
    // word is the only place "Stopped"/"Running" is said — no second line.
    ynPaintKill(!next);
    el("status").textContent = "Could not save. Still " + (next ? "running." : "stopped.");
  }
});

export { el, activeTab, connectionHint, ynPaintKill, ynPaintContext, ynPaintWarning, refreshStatus };
