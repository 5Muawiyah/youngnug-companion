"""tests/ext_harness.py — the headless-Chromium fixture path — proved
against the existing jsdom path on the same fixture and the same plan, so
the two harnesses cannot silently diverge into different answers for the
same production code.

Also pins: the Chromium harness reads its injection list from popup.js's
own YN_FILL_SCRIPTS (never a hand-typed copy), and refuses any fixture that
reaches for a non-file URL.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "tests" / "ext_fixtures"
CROSS_CHECK_MJS = FIXTURES / "cross_check" / "run_cross_check.mjs"

sys.path.insert(0, str(REPO / "tests"))
import ext_harness  # noqa: E402

# A whole profile, fill-plan shaped — fixture-safe values only. Same shape
# tests/ext_fixtures/run_generic_fill.mjs uses for the identical reason: no
# cv_url/letter_url (there is no application here), so a file field must
# come back unresolved rather than attached to something invented.
_PLAN = {
    "generic": True,
    "contact": {
        "first_name": "Sam",
        "last_name": "Example",
        "email": "student@example.com",
        "phone": "07700 900123",
    },
    "address": {
        "line1": "1 Example Street",
        "city": "London",
        "postcode": "SW1A 1AA",
        "country": "United Kingdom",
    },
    "links": {
        "linkedin": "https://www.linkedin.com/in/example-student",
        "github": "https://github.com/example-student",
        "portfolio": "https://example.com/sam",
    },
    "education": [],
    "work": [],
    "right_to_work": {"uk_rtw": True, "needs_sponsorship": False},
    "eligibility_extra": {},
    "answers": {},
    "unconfirmed_answers": [],
    "derived": {},
}


def _jsdom_filled_and_guessed(fixture_rel: str, plan: dict) -> dict:
    proc = subprocess.run(
        ["node", str(CROSS_CHECK_MJS), fixture_rel, json.dumps(plan)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=60,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    return json.loads(proc.stdout.strip().splitlines()[-1])


def test_chromium_path_matches_jsdom_path_on_plain_form():
    """The required cross-check: one fixture, one plan, both harnesses —
    the SET of filled fieldKeys must agree, or the two paths have quietly
    diverged on what the production code actually does."""
    fixture_rel = "tests/ext_fixtures/plain_form.html"
    jsdom = _jsdom_filled_and_guessed(fixture_rel, _PLAN)
    chromium = ext_harness.run_fill_fixture(FIXTURES / "plain_form.html", _PLAN)

    assert chromium["ok"] is True
    chromium_filled = sorted(
        r["fieldKey"] for r in (chromium["report"] or {}).get("filled", [])
    )
    assert chromium_filled == jsdom["filled"], (
        f"jsdom filled={jsdom['filled']} vs chromium filled={chromium_filled}"
    )


def test_chromium_path_matches_jsdom_path_on_workable_form():
    fixture_rel = "tests/ext_fixtures/workable_form.html"
    jsdom = _jsdom_filled_and_guessed(fixture_rel, _PLAN)
    chromium = ext_harness.run_fill_fixture(FIXTURES / "workable_form.html", _PLAN)

    assert chromium["ok"] is True
    chromium_filled = sorted(
        r["fieldKey"] for r in (chromium["report"] or {}).get("filled", [])
    )
    assert chromium_filled == jsdom["filled"], (
        f"jsdom filled={jsdom['filled']} vs chromium filled={chromium_filled}"
    )


def test_yn_fill_scripts_matches_popup():
    """ext_harness reads popup.js's YN_FILL_SCRIPTS at run time — this just
    confirms the parse actually found the real, non-trivial list, so a
    silent parse failure (falling back to an empty stack) cannot pass
    unnoticed."""
    scripts = ext_harness.yn_fill_scripts()
    assert "content/engine.js" in scripts
    assert "content/filler.js" in scripts
    assert "content/heuristics.js" in scripts
    assert len(scripts) >= 15


def test_non_file_url_is_refused():
    """A fixture that reaches for the network must be refused, not
    silently allowed through."""
    bad = FIXTURES / "cross_check" / "_network_fixture.html"
    bad.write_text(
        '<!doctype html><html><body>'
        '<img src="https://example.com/tracker.png">'
        "</body></html>",
        encoding="utf-8",
    )
    try:
        with pytest.raises(RuntimeError, match="non-file URL"):
            ext_harness.run_fill_fixture(bad, _PLAN)
    finally:
        bad.unlink(missing_ok=True)
