"""The fill overlay's collapsed summary line, close button, dismissal, and
one shared shadow-root painter across all three call sites. Static/
structural pins for the twelve behaviours below; the functional shadow-root/
close/dismiss check and the cross-ATS screenshots are a manual
Playwright script (tests/ext_fixtures/overlay_box/run_verification.py —
needs a real browser, so it is not wired into this pytest run).
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"
SRC = EXT / "src"
FIXTURES = REPO / "tests" / "ext_fixtures"
BOX = SRC / "common" / "overlay_box" / "index.js"
BOX_BUILT = EXT / "common" / "overlay_box.js"
FILLER = EXT / "content" / "filler.js"
ASSIST = EXT / "content" / "assist.js"
POSTING = EXT / "content" / "posting_filler.js"


def _run_node(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", str(FIXTURES / script)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=300,
    )


# ── the counts stay correct ─────────────────────────────────────────


def test_coverage_pin_via_node():
    proc = _run_node("run_coverage_pin.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "coverage pin PASS" in proc.stdout


# ── one painter, not two (or three) ──────────────────────────────────


def test_box_css_text_defined_exactly_once_in_src():
    """The box's chrome cssText literal used to be defined three times
    (report_state.js, assist/panel.js, ui/posting_filler/index.js), each
    quietly diverging. Now there is exactly one definition, in box.js."""
    needle = "all:initial;position:fixed;right:16px;z-index:2147483647"
    hits = []
    for path in SRC.rglob("*.js"):
        text = path.read_text(encoding="utf-8")
        if needle in text:
            hits.append(str(path.relative_to(REPO)))
    assert hits == [str(BOX.relative_to(REPO))], f"cssText defined in: {hits}"


def test_shadow_root_defined_once_and_called_by_all_three_bundles():
    """common/overlay_box.js is its own shipped file (a shared module may
    never be ES-imported across a shipped file's own folder boundary, per
    tests/test_extension_module_graph.py), so the shadow root itself is
    defined there exactly once, and each of the three consumer bundles
    (filler, assist, posting_filler) calls it as a bare global (ynOverlayBox)
    rather than defining their own — the same "one painter" guarantee,
    expressed across separate built files instead of within one."""
    built_text = BOX_BUILT.read_text(encoding="utf-8")
    assert built_text.count("attachShadow") == 1, (
        f"common/overlay_box.js: expected exactly one attachShadow, got "
        f"{built_text.count('attachShadow')}"
    )
    for bundle in (FILLER, ASSIST, POSTING):
        text = bundle.read_text(encoding="utf-8")
        assert "attachShadow" not in text, (
            f"{bundle.name} defines its own shadow root instead of calling "
            "the shared common/overlay_box.js"
        )
        assert "ynOverlayBox(" in text, f"{bundle.name} never calls ynOverlayBox()"


# ── closed shadow root (immune to host page CSS) ─────────────────────


def test_shadow_root_is_closed_mode():
    src = BOX.read_text(encoding="utf-8")
    assert 'mode: "closed"' in src, "the overlay's shadow root must be closed"


# ── real icon-only close button, no text label ───────────────────────


def test_close_button_is_a_real_button_with_aria_label_and_no_text():
    src = BOX.read_text(encoding="utf-8")
    m = re.search(r'<button[^>]*class="yn-close"[^>]*>([^<]*)</button>', src)
    assert m, "no <button class=\"yn-close\"> found in box.js"
    tag = m.group(0)
    assert 'type="button"' in tag
    assert 'aria-label="Close"' in tag
    # Icon only: the visible text between the tags must not be a word like
    # "Close" — density policy's seven icon-only controls carry no label.
    visible_text = m.group(1).strip()
    assert visible_text and not re.search(r"[A-Za-z]{2,}", visible_text), (
        f"close button carries a text label, not just an icon: {visible_text!r}"
    )


def test_escape_key_closes_the_box():
    src = BOX.read_text(encoding="utf-8")
    assert '"Escape"' in src
    assert "ynOverlayDismiss" in src


def test_close_never_sends_a_message_or_touches_the_dom_it_reports_on():
    """Closing the overlay must be a UI-only act: no chrome.runtime message,
    no field write, no click on anything outside the box itself."""
    src = BOX.read_text(encoding="utf-8")
    dismiss_fn = re.search(r"function ynOverlayDismiss\(\)\s*\{(.*?)\n\}", src, re.S)
    assert dismiss_fn, "ynOverlayDismiss not found"
    body = dismiss_fn.group(1)
    for forbidden in ("sendMessage", "ynSendWorker", ".click(", "fetch("):
        assert forbidden not in body, f"ynOverlayDismiss must not call {forbidden}"


# ── dismissal is in-memory (never a storage egress surface) ─────────


def test_dismissal_uses_no_storage_api():
    """Dismissal must never touch localStorage/sessionStorage/chrome.storage
    — test_assist_pins.py's egress guard refuses ANY storage call anywhere
    in assist.js's bundle (it generates a password locally), and assist.js
    is one of the files common/overlay_box.js is injected alongside. An
    in-memory globalThis registry is the reason this box can even ship in
    that world at all."""
    for bundle in (FILLER, ASSIST, POSTING, BOX_BUILT):
        text = bundle.read_text(encoding="utf-8")
        assert "sessionStorage" not in text and "localStorage" not in text, bundle.name


def test_dismissal_cleared_at_every_fresh_fill_entry_point():
    for path, needle in (
        (SRC / "filler" / "filler" / "fa_setup.js", "ynOverlayClearDismissal"),
        (SRC / "filler" / "filler" / "fill_any_page.js", "ynOverlayClearDismissal"),
        (SRC / "ui" / "posting_filler" / "index.js", "ynOverlayClearDismissal"),
    ):
        assert needle in path.read_text(encoding="utf-8"), f"{path.name} missing {needle}"


# ── disclosure keeps every bucket; never-submitted survives it ────


def test_never_submitted_line_is_not_deleted_by_the_disclosure():
    src = (SRC / "filler" / "filler" / "overlay_report.js").read_text(encoding="utf-8")
    assert "neverSubmittedLine" in src
    assert "yn-never" in src  # collapsed-state indicator
    assert "yn-never-detail" in src  # full sentence, still present when expanded


def test_report_overlay_lines_untouched_by_the_presentation_split():
    """The other half: ynReportOverlayLines (the tested, pinned data
    function) must still compute every bucket — overlay_report.js only
    reshapes its already-tested output, never recomputes it."""
    src = (SRC / "filler" / "filler" / "overlay_report.js").read_text(encoding="utf-8")
    assert "ynReportOverlayLines(ats, report, notAttempted, extra)" in src


# ── credential/guard refusals stay legible (behind the disclosure) ─


def test_credential_skips_still_reach_the_overlay_lines():
    src = (SRC / "filler" / "filler" / "overlay_lines.js").read_text(encoding="utf-8")
    assert "skipped_password" in src
    assert "never filled" in src


# ── brand tokens extended, not hand-picked hexes ─────────────────────


def test_box_uses_theme_tokens_not_hand_hexes():
    src = BOX.read_text(encoding="utf-8")
    # Every colour comes from ynOverlayTheme()'s YN_THEME reads; the only
    # literal hexes allowed are that function's own fallbacks (pinned to
    # tokens.css by test_extension_theme.py).
    theme_fn = re.search(r"function ynOverlayTheme\(\)\s*\{(.*?)\n\}", src, re.S).group(1)
    outside = src.replace(theme_fn, "")
    assert not re.search(r"#[0-9a-fA-F]{6}", outside), (
        "a hex literal exists outside ynOverlayTheme()'s fallbacks"
    )
