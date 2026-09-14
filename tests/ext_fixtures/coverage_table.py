"""tests/ext_fixtures/coverage_table.py — runs every ATS-shaped fixture
through the real fill pipeline (tests/ext_harness.py's headless-Chromium
path, so layout-dependent ATS widgets behave as they would live) with one
fixed, synthetic profile, and prints/saves the coverage table.

Coverage = filled / (fields - skipped - guard_refusals - manual_uploads),
where filled = filled + guessed, skipped = user_kept, and guard_refusals =
only_you_can_answer — see extension/content/engine.js's ynCoverage, the
one function that computes this number for every fill path.

Usage: python tests/ext_fixtures/coverage_table.py [output.md]
Prints the table to stdout; writes it (under the required heading) to
output.md when given.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "tests"))
import ext_harness  # noqa: E402

FIXTURES = REPO / "tests" / "ext_fixtures"

# Every application-form-shaped fixture in this suite, plus the ones
# found alongside them that are clearly the same kind of thing (a page with
# an actual apply form on it, not a narrow unit-test fixture for one
# behaviour like a date-part widget or a hydration race).
FIXTURE_NAMES = [
    "workable_form.html",
    "wizard_form.html",
    "reed_apply_modal.html",
    "reed_about_you_modal.html",
    "indeed_apply_contact.html",
    "linkedin_easy_apply_step1.html",
    "linkedin_easy_apply_step2.html",
    "eeo_form.html",
    "plain_form.html",
    "react_controlled.html",
    "shadow_form.html",
]

# A fixed synthetic profile — "Test Student" style, nothing that resembles a
# real person. Fixture-safe values throughout (example.com/.org email, the
# Ofcom drama phone range 07700 900xxx, no real address).
PROFILE = {
    "generic": True,
    "job": {"title": "Trainee Analyst", "employer": "Example Ltd"},
    "contact": {
        "first_name": "Test",
        "last_name": "Student",
        "email": "test.student@example.com",
        "phone": "07700 900123",
    },
    "address": {
        "line1": "1 Example Street",
        "city": "London",
        "postcode": "SW1A 1AA",
        "country": "United Kingdom",
    },
    "links": {
        "linkedin": "https://www.linkedin.com/in/test-student",
        "github": "https://github.com/test-student",
        "portfolio": "https://example.com/test-student",
    },
    "education": [
        {
            "institution": "Example Sixth Form College",
            "qualification": "A-levels",
            "subject": "Maths, Economics, Computer Science",
            "grade": "AAB",
            "start": "2024-09",
            "end": "2026-06",
            "current": True,
        }
    ],
    "work": [
        {
            "employer": "Example Retail Ltd",
            "title": "Weekend Sales Assistant",
            "start": "2025-04",
            "end": None,
            "current": True,
            "description": "Served customers; handled stock counts",
        }
    ],
    "right_to_work": {"uk_rtw": True, "needs_sponsorship": False},
    "eligibility_extra": {"willing_to_relocate": None, "uk_driving_licence": None},
    "answers": {
        "notice_period": None,
        "salary_expectation": None,
        "earliest_start": None,
    },
    "unconfirmed_answers": [
        "willing_to_relocate",
        "uk_driving_licence",
        "notice_period",
        "salary_expectation",
        "earliest_start",
    ],
    "derived": {"years_of_experience": 1, "highest_qualification": "A-levels"},
}

_EMPTY_ROW = {
    "fields": 0,
    "filled": 0,
    "skipped": 0,
    "guard_refusals": 0,
    "manual_uploads": 0,
    "causes": {
        "needs_your_answer": 0,
        "not_recognised": 0,
        "manual_upload": 0,
        "only_you_can_answer": 0,
        "write_rejected": 0,
    },
    "value": None,
}


def run_one(fixture_path: Path, profile: dict | None = None) -> dict:
    """Fill `fixture_path` with `profile` (defaults to the module PROFILE)
    and return its coverage row. Never raises for a fixture-side hard stop
    (captcha_stop / login_required / no form) — those are honest zero rows,
    not script failures; a real harness error still raises."""
    out = ext_harness.run_fill_fixture(fixture_path, profile or PROFILE)
    report = out.get("report") or {}
    coverage = report.get("coverage") or dict(_EMPTY_ROW)
    causes = report.get("causes") or dict(_EMPTY_ROW["causes"])
    return {
        "fields": coverage.get("fields", 0),
        "filled": coverage.get("filled", 0),
        "skipped": coverage.get("skipped", 0),
        "guard_refusals": coverage.get("guard_refusals", 0),
        "manual_uploads": coverage.get("manual_uploads", 0),
        "causes": causes,
        "value": coverage.get("value"),
    }


def _fmt_pct(value) -> str:
    if isinstance(value, (int, float)):
        return f"{value * 100:.0f}%"
    return "n/a"


def render_markdown(rows: list[tuple[str, dict]]) -> str:
    header = (
        "| fixture | fields | filled | skipped | guard_refusals | "
        "manual_uploads | needs_your_answer | not_recognised | "
        "manual_upload | only_you_can_answer | write_rejected | coverage |\n"
    )
    sep = "|---" * 12 + "|\n"
    out = [header, sep]
    for name, row in rows:
        c = row["causes"]
        out.append(
            "| {name} | {fields} | {filled} | {skipped} | {guard} | {manual} | "
            "{nya} | {nr} | {mu} | {oyca} | {wr} | {cov} |\n".format(
                name=name,
                fields=row["fields"],
                filled=row["filled"],
                skipped=row["skipped"],
                guard=row["guard_refusals"],
                manual=row["manual_uploads"],
                nya=c.get("needs_your_answer", 0),
                nr=c.get("not_recognised", 0),
                mu=c.get("manual_upload", 0),
                oyca=c.get("only_you_can_answer", 0),
                wr=c.get("write_rejected", 0),
                cov=_fmt_pct(row["value"]),
            )
        )
    return "".join(out)


def run_all(names: list[str] | None = None) -> list[tuple[str, dict]]:
    rows: list[tuple[str, dict]] = []
    for name in names or FIXTURE_NAMES:
        path = FIXTURES / name
        if not path.is_file():
            continue
        try:
            rows.append((name, run_one(path)))
        except Exception as exc:  # noqa: BLE001 — one bad fixture must not sink the table
            row = dict(_EMPTY_ROW)
            row["causes"] = dict(_EMPTY_ROW["causes"])
            row["error"] = str(exc)[:200]
            rows.append((name + " (ERROR)", row))
    return rows


PREAMBLE = """# Companion fill coverage

A fill-success number across the suite's application-form fixtures, rather
than a per-fixture pass/fail. Coverage = filled / (fields - skipped -
guard_refusals - manual_uploads); a guard refusal (password, EEO, sensitive,
payment, terms, honeypot, captcha) is removed from BOTH sides, so the number
cannot be inflated by weakening a guard, and cannot be deflated by a guarded
section's mere presence either (see eeo_form's parity test).

"""


def main() -> int:
    rows = run_all()
    table = render_markdown(rows)
    print(table)
    if len(sys.argv) > 1:
        out_path = Path(sys.argv[1])
        out_path.parent.mkdir(parents=True, exist_ok=True)
        heading = "## Coverage by fixture\n\n"
        out_path.write_text(PREAMBLE + heading + table, encoding="utf-8")
        print(f"\nwritten to {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
