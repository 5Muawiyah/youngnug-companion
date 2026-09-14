"""Skills tag fill and the multi-select checkbox
group mapper."""

from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "tests" / "ext_fixtures"

sys.path.insert(0, str(REPO / "tests"))
import ext_harness  # noqa: E402


def test_eight_skills_six_tagged_one_ambiguous_one_absent():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_skills_tag_input.html",
        {"skills": ["js", "Python", "SQL", "k8s", "ml", "Docker", "C", "Rust"]},
        entry="ynTestSkills",
    )
    report = r["report"]
    assert sorted(report["filled"]) == sorted(
        ["js", "Python", "SQL", "k8s", "ml", "Docker"]
    )
    assert sorted(report["skipped"]) == ["C", "Rust"]
    assert sorted(report["chips"]) == sorted(
        ["JavaScript", "Python", "SQL", "Kubernetes", "Machine Learning", "Docker"]
    )
    # the whole point: "C" must never become the only offered suggestion "C++"
    assert "C++" not in report["chips"]


def test_languages_checkbox_group_ticks_only_the_wanted_three():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_languages_checkbox_group.html",
        {"wanted": ["English", "German", "Urdu"]},
        entry="ynTestLanguages",
    )
    report = r["report"]
    assert sorted(report["ticked"]) == ["English", "German", "Urdu"]
    assert report["skipped"] == []
    assert sorted(report["tickedLabels"]) == ["English", "German", "Urdu"]
    assert "French" not in report["tickedLabels"]
    assert "Spanish" not in report["tickedLabels"]
