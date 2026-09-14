"""The generic ARIA combobox/listbox driver.

Seven fixtures under tests/ext_fixtures/widgets/ — six real-world popup
shapes a per-site selector never covers (react-select-style input, a
portalled listbox with no aria-controls/owns, a listbox inside an open
shadow root, a virtualised 200-row list, an aria-owns popup detached from
the control's own subtree, a widget that only ever listens on mousedown) —
each fills its target option and the WIDGET'S OWN markup confirms it
(aria-selected / rendered text), never "the input holds some text" alone.
The seventh carries two options that share one substring and match neither
exactly: the shared exact/unique-substring rule refuses rather than guess,
proven by an absent aria-selected anywhere on the page and an unchanged
control.

Every fixture's own inline ynTestDrive calls the PRODUCTION
ynDriveCombobox directly against one element — this is the write/drive
layer, not field discovery, so heuristics.js and the fill-plan pipeline are
deliberately bypassed (Playwright headless Chromium via ext_harness, real
layout/pointer events/shadow DOM — jsdom does none of those reliably).
"""

from __future__ import annotations

from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
WIDGETS = REPO / "tests" / "ext_fixtures" / "widgets"

import sys

sys.path.insert(0, str(REPO / "tests"))
import ext_harness  # noqa: E402


def _drive(fixture: str, selector: str, target: str) -> dict:
    return ext_harness.run_fill_fixture(
        WIDGETS / fixture, {"selector": selector, "target": target}, entry="ynTestDrive"
    )


@pytest.mark.parametrize(
    "fixture,target",
    [
        ("react_select_style.html", "Canada"),
        ("portal_listbox.html", "Canada"),
        ("shadow_listbox.html", "Canada"),
        ("virtualized_200.html", "Country 042"),
        ("aria_owns_detached.html", "Canada"),
        ("mousedown_only.html", "Canada"),
    ],
)
def test_widget_fills_and_page_confirms(fixture, target):
    r = _drive(fixture, "#combo", target)
    assert r["ok"] is True, r
    assert r["report"]["matchedText"] == target, r


def test_widgets_never_dispatch_a_forbidden_key():
    """Across all six confirmable fixtures, whatever keys were dispatched
    must be a subset of {ArrowDown, Alt+ArrowDown} — pointer gestures alone
    resolve every one of them, but the escalation path must stay this
    narrow even when a pointer-only page happens not to need it."""
    forbidden = {"Enter", "Tab", " ", "Escape"}
    allowed = {"ArrowDown", "Alt+ArrowDown"}
    for fixture, target in [
        ("react_select_style.html", "Canada"),
        ("portal_listbox.html", "Canada"),
        ("shadow_listbox.html", "Canada"),
        ("virtualized_200.html", "Country 042"),
        ("aria_owns_detached.html", "Canada"),
        ("mousedown_only.html", "Canada"),
    ]:
        r = _drive(fixture, "#combo", target)
        keys = set(r["report"]["keysSeen"])
        assert not (keys & forbidden), f"{fixture} dispatched a forbidden key: {keys}"
        assert keys <= allowed, f"{fixture} dispatched an unrecognised key: {keys}"


def test_ambiguous_seventh_fixture_is_refused_with_zero_writes():
    r = _drive("ambiguous_substring.html", "#combo", "London")
    assert r["ok"] is False, r
    report = r["report"]
    assert report["matchedText"] is None
    assert report["anySelected"] is False, "an option was clicked despite the ambiguity"
    assert report["controlText"] == "Choose an office", "the control's text changed"
    assert not report["keysSeen"] or set(report["keysSeen"]) <= {
        "ArrowDown",
        "Alt+ArrowDown",
    }
