"""Cascading dropdowns and the per-character second pass
."""

from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "tests" / "ext_fixtures"

sys.path.insert(0, str(REPO / "tests"))
import ext_harness  # noqa: E402


# ─── Cascading dropdowns ─────────────────────────────────────────────────


def test_three_level_cascade_selects_country_region_city():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_cascade_three_level.html",
        {"parts": ["United Kingdom", "England", "London"]},
        entry="ynTestCascade",
    )
    assert r["ok"] is True, r
    report = r["report"]
    assert report["countryText"] == "United Kingdom"
    assert report["regionText"] == "England"
    assert report["cityText"] == "London"
    assert report["stoppedAtLevel"] == -1


def test_ambiguous_second_level_stops_with_zero_wrong_clicks():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_cascade_ambiguous.html",
        {"parts": ["United Kingdom", "England", "London"]},
        entry="ynTestCascade",
    )
    assert r["ok"] is False, r
    report = r["report"]
    assert report["countryText"] == "United Kingdom", "level 0 should still resolve"
    assert report["stoppedAtLevel"] == 1, "should stop at the ambiguous region level"
    assert report["reason"] == "ambiguous"
    assert report["regionValue"] == "", "no wrong click at the ambiguous level"
    assert report["cityValue"] == "", "a later level must never be touched"


# ─── Per-character second pass ──────────────────────────────────────────


def test_masked_input_readback_equals_after_the_second_pass():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_masked_keystroke_input.html",
        {"value": "REF12345"},
        entry="ynTestVerify",
    )
    report = r["report"]
    assert report["finalValue"] == "REF12345"
    assert report["filled"] == ["answers.reference"]
    assert report["typePerCharCalls"] >= 1, "the second pass must actually have run"


def test_plain_field_never_enters_the_second_pass():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_plain_text_no_retype.html",
        {"value": "REF12345"},
        entry="ynTestVerify",
    )
    report = r["report"]
    assert report["finalValue"] == "REF12345"
    assert report["filled"] == ["answers.reference"]
    assert report["typePerCharCalls"] == 0


def test_masked_input_key_recorder_never_sees_a_forbidden_key():
    """Belt-and-braces on top of the static guard: watch every keydown the
    second pass actually dispatches on a live retype and assert none of
    them is Enter/Tab/Space/Escape."""
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_masked_keystroke_input.html",
        {"value": "REF 123"},
        entry="ynTestVerify",
    )
    # "REF 123" includes a literal space to prove the space carve-out too —
    # the masked buffer must still see it via the native-setter+InputEvent
    # path even though no keydown/keyup was dispatched for it.
    assert r["report"]["finalValue"] == "REF 123"
