"""Headless-Chromium fixture harness — extends the existing node/jsdom
pattern (tests/ext_fixtures/run_*.mjs, which vm.runInContext the production
extension files verbatim) rather than starting a second harness. jsdom does
no real layout and cannot honour elementFromPoint, real pointer events,
shadow DOM with slots, or virtualised lists; this gives fixtures that need
those a real (headless) browser instead.

run_fill_fixture(html_path, plan, ats_hint=None) launches Playwright's
bundled Chromium headless — no extension is side-loaded here. Loading the
unpacked extension the way a live end-to-end walk does is what reaches a
real activeTab grant; a static fixture page needs none of that, so this
navigates straight to the fixture as a file:// URL and injects the SAME
production files popup.js injects at click-time — its own YN_FILL_SCRIPTS
list, read from popup.js here rather than retyped, so the two cannot
silently drift apart (test_yn_fill_scripts_matches_popup pins this).

Static HTML, no network: any request the fixture (or the injected
production code) makes for anything but a file:// URL is aborted and
recorded; run_fill_fixture raises if that ever happens, rather than letting
a fixture quietly reach the network.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"
POPUP_JS = EXT / "popup.js"


def yn_fill_scripts() -> list[str]:
    """The production click-time stack, read from popup.js's own
    YN_FILL_SCRIPTS array. A hand-typed second copy is exactly the kind of
    drift this harness exists to catch, so this parses the real file.
    `const` or `var`: a shipped file esbuild has bundled from
    extension/src/ (see that folder's own index.js) always emits a
    top-level module binding as `var`, whatever it was declared as in the
    source — a build-format detail, not a behaviour change."""
    src = POPUP_JS.read_text(encoding="utf-8")
    m = re.search(r"(?:const|var)\s+YN_FILL_SCRIPTS\s*=\s*\[(.*?)\];", src, re.S)
    if not m:
        raise RuntimeError("YN_FILL_SCRIPTS not found in popup.js")
    return re.findall(r'"([^"]+)"', m.group(1))


_STUB_TEMPLATE = """
window.__YN_PLAN__ = %(plan_json)s;
window.__YN_ATS_HINT__ = %(ats_hint_json)s;
// A caller-supplied canned response per message TYPE (see run_fill_fixture's
// `responses` param) — checked before the built-in GET_FILL_PLAN /
// GET_GENERIC_PROFILE defaults, so a test can script e.g. GENERATE_ANSWER
// without a real worker. Never used to fake GET_FILL_PLAN itself (the
// approved-job gate stays real to this stub's own plan object).
window.__YN_RESPONSES__ = %(responses_json)s;
// The review screen (content/review_screen.js): no real user is present
// in this harness, so this test-only hook stands in for one. An empty
// array means "auto-approve, same outcome as before the review screen
// existed" (guessed fields still write; a draft still defaults to
// skipped) — see review_screen.js's ynReviewAutoDecision for the actions
// a caller may script here ({type:"skip"|"approve_draft"|"edit"|"cancel",
// fieldKey, text}). A real content-script world never defines this global.
window.__ynReviewScript = %(review_script_json)s;
window.__ynMessages = [];
window.__submitted = false;
window.chrome = {
  runtime: {
    lastError: null,
    sendMessage: function (msg, cb) {
      window.__ynMessages.push(msg);
      var resp = { ok: false, error: "no worker in the harness" };
      var scripted = msg && window.__YN_RESPONSES__ && window.__YN_RESPONSES__[msg.type];
      if (scripted) {
        resp = scripted;
      } else if (msg && msg.type === "GET_FILL_PLAN") {
        resp = Object.assign({ ok: true }, window.__YN_PLAN__);
      } else if (msg && msg.type === "GET_GENERIC_PROFILE") {
        resp = { ok: true, profile: window.__YN_PLAN__ };
      }
      if (typeof cb === "function") cb(resp);
      return Promise.resolve(resp);
    },
    onMessage: { addListener: function () {} },
  },
  storage: {
    local: {
      get: function (d) { return Promise.resolve(Object.assign({}, d || {})); },
      set: function () { return Promise.resolve(); },
      remove: function () { return Promise.resolve(); },
    },
  },
};
document.addEventListener(
  "submit",
  function (e) {
    e.preventDefault();
    window.__submitted = true;
  },
  true,
);
"""


def _run_js(entry: str) -> str:
    return """
(async () => {
  const entry = %(entry)s;
  const plan = window.__YN_PLAN__;
  const fn = window[entry];
  if (typeof fn !== "function") {
    throw new Error(entry + " is not defined after injecting YN_FILL_SCRIPTS");
  }
  const jobId = (plan && plan.job_id) || 1;
  const out = entry === "ynFillApplication" ? await fn(jobId) : await fn(plan);
  const dom = [];
  const controls = document.querySelectorAll("input, textarea, select");
  for (const el of controls) {
    let value;
    if (el.type === "checkbox" || el.type === "radio") value = el.checked;
    else value = el.value;
    dom.push({
      id: el.id || null,
      name: el.name || null,
      tag: el.tagName.toLowerCase(),
      type: el.type || "",
      value: value,
    });
  }
  return {
    ok: !!(out && out.ok),
    report: (out && out.report) || null,
    raw_keys: out ? Object.keys(out) : [],
    messages: window.__ynMessages || [],
    submitted: !!window.__submitted,
    review_screen_calls: window.__ynReviewScreenCalls || 0,
    dom: dom,
  };
})()
""" % {"entry": json.dumps(entry)}


def run_fill_fixture(
    html_path: str | Path,
    plan: dict[str, Any],
    ats_hint: str | None = None,
    *,
    entry: str = "ynFillAnyPage",
    responses: dict[str, dict] | None = None,
    review_script: list[dict] | None = None,
) -> dict[str, Any]:
    """Load a fixture in headless Chromium, run one fill, and return
    {ok, report, messages, submitted, review_screen_calls, dom}. `dom` is a
    readback of every input/textarea/select's current value (or checked
    state). `messages` is every chrome.runtime.sendMessage call the page
    made — APPLY_RESULT included, so a caller can assert on what would have
    reached the server without a real worker present. `review_screen_calls`
    is how many times the review screen was shown this fill (0 means every
    intent was exact confidence with no draft — the screen never renders).

    entry selects the fill entry point: "ynFillAnyPage" (default — the
    generic any-page rung, called with `plan` as the whole profile) or
    "ynFillApplication" (the approved-job rung — GET_FILL_PLAN answers
    with `plan`, called with plan.get("job_id", 1) as the jobId).

    `responses` scripts a canned reply per message TYPE (e.g.
    {"GENERATE_ANSWER": {"ok": True, "text": "..."}}) — for message types
    with no real worker in this harness. GET_FILL_PLAN / GET_GENERIC_PROFILE
    keep their built-in behaviour unless explicitly overridden here.

    `review_script` drives the review screen (content/review_screen.js)
    when a fixture has guessed fields or drafts to review — with none
    given, the default is "auto-approve" (guessed fields write, a draft
    defaults to skipped), the same outcome every caller of this harness got
    before the review screen existed. Pass a list of
    {"type": "skip"|"approve_draft"|"edit"|"cancel", "fieldKey": ..., "text": ...}
    actions to script a specific decision instead.
    """
    html_path = Path(html_path).resolve()
    if not html_path.is_file():
        raise FileNotFoundError(html_path)

    from playwright.sync_api import sync_playwright

    scripts = yn_fill_scripts()
    sources = [(rel, (EXT / rel).read_text(encoding="utf-8")) for rel in scripts]

    blocked: list[str] = []

    def _guard(route):
        url = route.request.url
        if url.startswith("file://") or url.startswith("data:") or url == "about:blank":
            route.continue_()
        else:
            blocked.append(url)
            route.abort()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            context = browser.new_context()
            context.route("**/*", _guard)
            page = context.new_page()
            init_src = _STUB_TEMPLATE % {
                "plan_json": json.dumps(plan),
                "ats_hint_json": json.dumps(ats_hint),
                "responses_json": json.dumps(responses or {}),
                "review_script_json": json.dumps(review_script or []),
            }
            page.add_init_script(init_src)
            page.goto(html_path.as_uri())
            for _rel, src in sources:
                page.add_script_tag(content=src)
            result = page.evaluate(_run_js(entry))
        finally:
            browser.close()

    if blocked:
        raise RuntimeError(
            "fixture (or injected code) requested a non-file URL, refused: "
            + ", ".join(blocked[:5])
        )
    return result
