"""The Advanced/Developer capture-selectors section — uBlock Origin Lite's
"Custom filters" pattern applied to per-site capture: a hostname plus a
title/body CSS selector, collapsed by default, validated before it is
stored, and explicit that the extension's hard safety stops are not
editable from here.

The rules are WIRED into capture: both capture callers (the popup's click
and the background shortcut) read them from storage and pass them into the
injected ynCaptureCurrent as an argument, where the matching site's rule
LEADS the merge. capture.js itself stays storage-free (the read side
re-validates the rules it is handed, so a hand-edited storage blob cannot
smuggle anything past the popup's validation), and that storage-freedom is
pinned below. The behaviour itself is proved in the jsdom harness
run_dev_selectors.mjs (run by the test at the bottom).
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"
POPUP_HTML = EXT / "popup.html"
POPUP_JS = EXT / "popup.js"
CAPTURE_JS = EXT / "content" / "capture.js"


def test_the_advanced_section_is_collapsed_and_states_the_hard_stops():
    html = POPUP_HTML.read_text(encoding="utf-8")
    assert '<details id="dev-section">' in html, (
        "the developer section must be a <details> element"
    )
    assert re.search(r'<details id="dev-section">\s*<summary', html), (
        "a <details> with no `open` attribute renders collapsed by default "
        "— this pins that no `open` attribute was added"
    )
    section = html.split('<details id="dev-section">')[1].split("</details>")[0]
    assert "not editable" in section.lower(), (
        "the section must say plainly that the hard stops are not editable"
    )
    for word in ("never-submit", "captcha", "login-wall", "personal-use", "budget"):
        assert word in section.lower(), (
            f"the section must name '{word}' among what it cannot change"
        )


def test_the_selector_fields_are_validated_before_they_are_stored():
    js = POPUP_JS.read_text(encoding="utf-8")
    assert "function ynValidHost" in js
    assert "function ynValidSelector" in js
    # `const` or `var`: a shipped file esbuild has bundled from
    # extension/src/ always emits a top-level module binding as `var`.
    m = re.search(r"(?:const|var) YN_DEV_SELECTOR_RE = (/.*?/);", js)
    assert m, "the selector allowlist regex is gone"
    assert "<" not in m.group(1), (
        "the selector allowlist must not admit '<' — no markup may ride in "
        "a stored selector"
    )
    assert "javascript:" in js and "expression\\(" in js and "url\\(" in js, (
        "javascript:/expression()/url() must be refused even if they slip "
        "past the character allowlist"
    )
    fn = js[js.index("function setupDevSection") :]
    fn_end = next(m for m in ("\n}\n", "\n  }\n") if m in fn)
    fn = fn[: fn.index(fn_end)]
    assert "ynValidHost(pattern)" in fn
    assert "ynValidSelector(titleSelector)" in fn
    assert "ynValidSelector(bodySelector)" in fn
    assert fn.index("ynValidHost(pattern)") < fn.index("chrome.storage.local.set"), (
        "validation must run before anything is stored"
    )


def test_the_rules_are_stored_under_a_namespaced_key_with_a_cap():
    js = POPUP_JS.read_text(encoding="utf-8")
    # `const` or `var`: see the note in the test above.
    assert (
        'const YN_DEV_RULES_KEY = "ynCaptureOverlaySelectors";' in js
        or 'var YN_DEV_RULES_KEY = "ynCaptureOverlaySelectors";' in js
    ), "the storage key must be namespaced, not a bare generic name"
    assert "YN_DEV_RULES_MAX" in js
    assert "current.length >= YN_DEV_RULES_MAX" in js, (
        "the rule list must be capped, not allowed to grow without bound"
    )


def test_delete_is_icon_only_with_an_accessible_name():
    js = POPUP_JS.read_text(encoding="utf-8")
    render = js[js.index("function ynRenderDevRules") :]
    # A shipped file esbuild has bundled from extension/src/ wraps every
    # original top-level statement one level deeper, shifting this marker
    # from column 0 to a fixed 2-space indent — both are accepted.
    marker = next(
        m for m in ("\nasync function ynLoadDevRules", "\n  async function ynLoadDevRules") if m in render
    )
    render = render[: render.index(marker)]
    assert 'del.setAttribute("aria-label"' in render, (
        "the delete control must carry its name in aria-label — Delete is "
        "one of the icon-only actions, so it has no visible text label"
    )
    assert "del.textContent" not in render, (
        "the delete button must not also carry a visible text label"
    )


def test_capture_is_wired_to_the_rules_and_stays_storage_free():
    """The wiring pins, replacing the old absence pin (the rules ARE read
    now). capture.js takes the rules as an ARGUMENT and never touches
    storage itself: the callers own the key, the read side re-validates."""
    src = CAPTURE_JS.read_text(encoding="utf-8")
    # storage-free: the injected read must not grow its own storage access
    assert "chrome.storage" not in src, (
        "capture.js must stay storage-free — the callers read the key and "
        "pass the rules in as an argument"
    )
    assert "ynCaptureOverlaySelectors" not in src, (
        "capture.js must not name the storage key either; only its callers "
        "own it"
    )
    # the rung exists, re-validates, and LEADS the merge
    assert "function ynDevSelectorJob" in src
    assert "function ynCaptureCurrent(devRules)" in src
    merge = src[src.index("ynMergeJob([", src.index("const merged")) :]
    merge = merge[: merge.index("]")]
    assert merge.index("devJob") < merge.index("ynLdJobPosting"), (
        "the student's own rule must lead the merge — they wrote it because "
        "the built-in readers cannot read that site"
    )
    # both callers pass the stored rules in as args
    popup = POPUP_JS.read_text(encoding="utf-8")
    bg = (EXT / "background.js").read_text(encoding="utf-8")
    for name, caller in (("popup.js", popup), ("background.js", bg)):
        assert "func: (rules) => ynCaptureCurrent(rules)" in caller, (
            f"{name} must pass the rules into the injected read"
        )


def test_dev_selector_read_behaviour_in_the_jsdom_harness():
    """The behaviour itself: a matching rule reads title/body from the page
    and leads the merge; a non-matching or invalid rule changes nothing; a
    rule hit also counts as a claimed single advert for the SERP refusal."""
    import subprocess

    proc = subprocess.run(
        ["node", str(REPO / "tests" / "ext_fixtures" / "run_dev_selectors.mjs")],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
