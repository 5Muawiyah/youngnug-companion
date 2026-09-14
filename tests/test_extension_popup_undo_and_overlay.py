"""The popup's Undo button, errors/causes/drafts reaching the fill overlay,
two stale strings, and the dead chrome-notifications block that never fires
because the manifest never requests the permission it needs.

The review screen and a codebase-wide em-dash sweep are deliberately not
covered here: at the time this file was written the review screen sat
between two other pieces of work not yet landed (it has since landed — see
tests/test_extension_review_screen.py and content/review_screen.js), and an em-dash
sweep touches files this change does not own.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"
FIXTURES = REPO / "tests" / "ext_fixtures"
POPUP_JS = EXT / "popup.js"
POPUP_HTML = EXT / "popup.html"
OPTIONS_JS = EXT / "options.js"
BACKGROUND = EXT / "background.js"
MANIFEST = EXT / "manifest.json"
FILLER = EXT / "content" / "filler.js"


def _run_node(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", str(FIXTURES / script)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=300,
    )


# ── report.errors / report.causes / report.drafts reach the overlay ──


def test_overlay_renders_errors_causes_and_drafts_as_compact_rows():
    proc = _run_node("run_overlay_lines.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "overlay lines PASS" in proc.stdout


def test_overlay_lines_function_still_owned_by_filler_654_757_area():
    """ynReportOverlayLines is the overlay's one function inside filler.js — a
    sanity check that it still exists and still returns the field the
    overlay renders (an array), not a rewrite into something else."""
    src = FILLER.read_text(encoding="utf-8")
    assert "function ynReportOverlayLines(ats, report, notAttempted, extra)" in src
    body = src.split("function ynReportOverlayLines(ats, report, notAttempted, extra)")[1]
    body = body.split("\nfunction ", 1)[0]
    assert "report.errors" in body
    assert "report.causes" in body
    assert "report.drafts" in body
    assert "return lines;" in body


# ── the Undo button, wired to window.ynUndoFill ──────────────────────


def test_popup_undo_button_via_node():
    proc = _run_node("run_popup_undo.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "popup undo PASS" in proc.stdout


def test_undo_button_is_icon_only_in_the_markup():
    html = POPUP_HTML.read_text(encoding="utf-8")
    assert 'id="undo"' in html
    assert 'aria-label="Undo fill"' in html


def test_undo_never_dispatches_a_forbidden_key():
    """The Undo button wires to window.ynUndoFill by CALLING it —
    popup.js itself never constructs a KeyboardEvent, here or anywhere in
    its click handlers."""
    src = POPUP_JS.read_text(encoding="utf-8")
    assert "KeyboardEvent" not in src


# ── stale copy ────────────────────────────────────────────────────────


def test_kill_switch_hint_names_the_actual_control():
    """popup.js:19 used to say 'Untick it below', describing a checkbox that
    was replaced by a button (ynPaintKill/#kill is role=switch). The hint
    must describe what the student actually sees."""
    src = POPUP_JS.read_text(encoding="utf-8")
    assert "Untick it below" not in src
    assert "kill switch" in src.lower()


def test_options_assist_label_does_not_claim_a_passive_reader():
    """options.js:14 used to say Glassdoor sentiment is read 'on pages you
    visit' — the passive reader was removed when Glassdoor reading became
    click-time only (popup.js's Capture handler, glassdoor.js injected on
    the click). The options copy must say the same thing."""
    src = OPTIONS_JS.read_text(encoding="utf-8")
    assert "on pages you visit" not in src


# ── the review prompt asks once per fill, and is dismissable ─────────


def test_review_prompt_asks_once_per_fill_via_node():
    proc = _run_node("run_review_prompt_once.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "review prompt PASS" in proc.stdout


# ── dead chrome.notifications code, no permission added ──────────────


def test_chrome_notifications_dead_code_is_gone():
    src = BACKGROUND.read_text(encoding="utf-8")
    assert "chrome.notifications" not in src


def test_manifest_permissions_are_the_shipped_set():
    """Pinned to the shipped set. "userScripts" was
    added later, deliberately (see
    scripts/build_extension.py's FORBIDDEN_PERMISSIONS comment for the
    reasoning and the isolation guard elsewhere in this suite) — updated
    here rather than left to quietly rot into a false pin."""
    import json

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert manifest["permissions"] == [
        "storage",
        "activeTab",
        "scripting",
        "tabGroups",
        "userScripts",
    ]
    assert "notifications" not in manifest["permissions"]
    assert "notifications" not in manifest.get("optional_permissions", [])


# ── Frozen guarantees these files must not weaken ──────────────────────────


def test_no_new_keyboardevent_in_content_or_common():
    """The project's own frozen-guarantees line: KeyboardEvent stays at zero
    outside a couple of named, narrow exceptions elsewhere in the write
    loop, so the count for the popup, the options page and the overlay
    is simply: still 0."""
    for rel in ("popup.js", "options.js"):
        src = (EXT / rel).read_text(encoding="utf-8")
        assert "KeyboardEvent" not in src, f"{rel} constructs a KeyboardEvent"
    filler = FILLER.read_text(encoding="utf-8")
    # ynReportOverlayLines itself (the overlay's one function in filler.js)
    # never dispatches anything — it only builds and returns strings.
    body = filler.split("function ynReportOverlayLines(ats, report, notAttempted, extra)")[1]
    body = body.split("\nfunction ", 1)[0]
    assert "KeyboardEvent" not in body
    assert ".click(" not in body
    assert "dispatchEvent" not in body
