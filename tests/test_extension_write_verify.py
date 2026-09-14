"""Framework-real events, placeholder-vs-answered,
verify-every-write plus the stall detector, and the per-character second pass.

Each fixture's own inline entry function calls ynExecuteIntents (or
ynSetNativeValue directly for the event-dispatch case) against hand-built intents — the write
layer's own unit, decoupled from heuristics.js field discovery. Headless
Chromium via ext_harness (real InputEvent/FocusEvent/MutationObserver
behaviour; jsdom does not reliably give either).
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "tests" / "ext_fixtures"

sys.path.insert(0, str(REPO / "tests"))
import ext_harness  # noqa: E402


# ─── Framework-real events ─────────────────────────────────────


def test_react_hook_form_required_email_clears_after_a_real_write():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_react_hook_form.html",
        {"value": "student@example.com"},
        entry="ynTestWriteEvents",
    )
    report = r["report"]
    assert report["value"] == "student@example.com"
    assert report["errNodePresent"] is False, "the error node should be gone"
    assert report["touched"] is True, "a real FocusEvent blur should have fired"


# ─── Placeholder-versus-answered ───────────────────────────────


def test_placeholder_select_and_dial_code_phone_are_filled_not_user_kept():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_placeholder_form.html", {}, entry="ynTestPlaceholderFill"
    )
    report = r["report"]
    assert report["selectValue"] == "uk"
    assert report["phoneValue"] == "07700 900123"
    assert sorted(report["filled"]) == ["address.country", "contact.phone"]
    assert report["userKept"] == [], "before this fix both fields were wrongly user_kept"


# ─── Verify every write, not only text ────────────────────────


def test_silent_reset_select_is_reported_cleared_after_fill_not_filled():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_silent_reset_select.html", {}, entry="ynTestVerify"
    )
    report = r["report"]
    assert report["filled"] == [], "a select the page resets must not count as filled"
    assert "address.country" in report["unresolved"]
    assert report["finalValue"] == "", "the page's own reset must be the value we see"
    reasons = {e.get("label") for e in report["reverted"]}
    assert "cleared after fill" in reasons


def test_masked_phone_reformat_is_reported_filled_not_a_miss():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_masked_phone.html", {}, entry="ynTestVerify"
    )
    report = r["report"]
    assert report["filled"] == ["contact.phone"]
    assert report["unresolved"] == []
    assert report["finalValue"] == "07700 900123"


def test_alert_beside_a_filled_email_is_reported_site_flagged():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_alert_beside_email.html", {}, entry="ynTestVerify"
    )
    report = r["report"]
    assert report["filled"] == ["contact.email"]
    flagged = [e for e in report["errors"] if "site_flagged" in (e.get("label") or "")]
    assert flagged, f"expected a site_flagged error entry, got {report['errors']}"


def test_stall_detector_ends_the_attempt_within_the_cap_no_navigation():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_stall_combobox.html",
        {"stallMs": 120},
        entry="ynTestStall",
    )
    report = r["report"]
    assert report["stalled"] is True
    assert any("stalled" in (e.get("label") or "") for e in report["errors"])
    # generous slack for CI/host jitter — the point is "well under the
    # combobox's own ~2-3s internal timeouts", not a tight race
    assert report["elapsedMs"] < 2000, report["elapsedMs"]
    assert report["navigated"] is False
