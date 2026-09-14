"""The Companion as a GENERAL filler — the any-page rung and its refusals.

Until now the fill path started only on a page matching a job the student had
already Approved, so on every other site the popup dead-ended with "No
YoungNug job matches this page". `ynFillAnyPage` is the fallback rung: on a
click, on any page, fill what the profile can honestly answer and report the
rest.

The pins here hold three things closed:

  * the ADAPTER STILL WINS. The generic rung is the fallback underneath a
    dedicated adapter, never a replacement for one — both paths plan through
    the same `ynPlanRungs`, so the scope rule and the rung order cannot come
    apart.
  * THE APPROVE GATE IS UNTOUCHED. The generic path never asks for a fill
    plan and never reports an application outcome, so the one human gate is
    neither used nor weakened by making the extension useful elsewhere.
  * A REFUSAL IS REPORTED, NOT SILENT. Password fields, everything inside a
    password's scope, and equal-opportunities questions are never filled AND
    are named in the report. The password refusal used to be four bare
    `continue`s with nothing said, which reads as "it did not notice".

The behaviour itself is proved in the node/jsdom harnesses run below, against
three non-job forms with different markup conventions.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"
FIXTURES = REPO / "tests" / "ext_fixtures"
FILLER = EXT / "content" / "filler.js"
POPUP = EXT / "popup.js"
POPUP_HTML = EXT / "popup.html"
BACKGROUND = EXT / "background.js"
HEURISTICS = EXT / "content" / "heuristics.js"


def _js_function_body(source: str, needle: str) -> str:
    """The body of the first function whose declaration text is `needle`
    (e.g. "function ynCredentialSkips"), from its opening `{` to the
    matching closing `}`, found by counting braces rather than by looking
    for a bare "\\n}" — a shipped file built by esbuild nests every
    top-level function one level deeper inside the bundle's own wrapping
    IIFE, so a function's real closing brace is indented and a column-0
    "\\n}" search overshoots into unrelated code after it."""
    start = source.index(needle)
    open_at = source.index("{", start)
    depth = 0
    for i in range(open_at, len(source)):
        if source[i] == "{":
            depth += 1
        elif source[i] == "}":
            depth -= 1
            if depth == 0:
                return source[open_at + 1 : i]
    raise AssertionError(f"no matching closing brace found for {needle!r}")


def _run_node(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", str(FIXTURES / script)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=300,
    )


def test_generic_fill_against_three_non_job_forms():
    """jsdom, production files verbatim, no network. A standards-clean
    registration form, a volunteering form carrying BOTH a scoped password
    widget and an equal-opportunities section, and a table-layout enquiry
    form with nothing but placeholders and adjacent cells."""
    proc = _run_node("run_generic_fill.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "generic fill PASS" in proc.stdout


def test_generic_profile_shape_mirrors_the_servers_own_rules():
    proc = _run_node("run_generic_profile.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "generic profile shape PASS" in proc.stdout


def test_generic_path_exists_and_the_popup_falls_back_to_it():
    filler = FILLER.read_text(encoding="utf-8")
    popup = POPUP.read_text(encoding="utf-8")
    assert "async function ynFillAnyPage" in filler
    assert "function ynGenericFill" in popup, (
        "the popup must have a generic fallback, not a dead end"
    )
    assert 'type: "GET_GENERIC_PROFILE"' in popup
    assert "ynFillAnyPage !== \"function\"" in popup, (
        "the popup must inject and call ynFillAnyPage in the page"
    )
    # The old dead end is gone, as a STRING the user could still be shown
    # (the phrase survives in the comment explaining why it went).
    assert (
        '"No YoungNug job matches this page. Capture it first, then Approve it."'
        not in popup
    ), "an unmatched page must fall back to the generic filler, not stop"


def test_both_fill_paths_plan_through_one_ladder():
    """A safety rule with two homes is a rule that will one day be weakened
    in one of them. The adapter-scope narrowing, the executed-keys filter and
    the 'a declared scope that is absent means no generic rung runs at all'
    decision live in ynPlanRungs, and both paths call it."""
    filler = FILLER.read_text(encoding="utf-8")
    assert "async function ynPlanRungs" in filler
    assert filler.count("ynPlanRungs(") >= 3, (
        "ynPlanRungs must be DEFINED and called by BOTH fill paths — found "
        f"{filler.count('ynPlanRungs(')} mentions"
    )
    assert "function ynSplitIntents" in filler
    assert filler.count("ynSplitIntents(") >= 3, (
        "both paths must split sensitive/needs-you/generated the same way"
    )


def test_the_generic_path_keeps_every_hard_stop():
    """Same refusals as the approved-job path, on a page nobody vetted."""
    filler = FILLER.read_text(encoding="utf-8")
    body = filler.split("async function ynFillAnyPage")[1].split(
        "\n/** The one line the popup shows"
    )[0]
    for guard, why in (
        ("ynChallengePage", "a captcha / bot gate / login interstitial"),
        ("loginWall", "a site that walls the form behind sign-in"),
        ("ynPageIsAccountCreation", "an account-creation wall"),
        ("ynExecuteIntents", "the engine's write-time floors"),
        ("ynCredentialSkips", "the credential refusal, reported"),
    ):
        assert guard in body, f"the generic path dropped {guard} — {why}"
    assert ".click(" not in body, (
        "the generic path must never click anything: it fills and stops"
    )
    assert "captcha_stop" in body, "the challenge stop must be reported as one"


def test_the_generic_path_never_touches_the_approve_gate():
    """The fill plan (CV, letter, tailored answers) stays behind Approve. The
    generic path reads the PROFILE instead and reports no application
    outcome — inventing one would put a tracker row against a form that is
    not a job."""
    filler = FILLER.read_text(encoding="utf-8")
    body = filler.split("async function ynFillAnyPage")[1].split(
        "\n/** The one line the popup shows"
    )[0]
    assert "GET_FILL_PLAN" not in body, (
        "the generic path must not request a fill plan"
    )
    assert "APPLY_RESULT" not in body, (
        "the generic path must not report an application outcome"
    )
    bg = BACKGROUND.read_text(encoding="utf-8")
    assert 'case "GET_GENERIC_PROFILE"' in bg
    generic = bg.split('case "GET_GENERIC_PROFILE": {')[1].split("\n    }")[0]
    assert '"/api/profile"' in generic
    assert "fill-plan" not in generic
    # and the Approve gate itself is still where it was
    assert "/api/apply/fill-plan/" in bg, "the Approve-gated endpoint is gone"


def test_a_password_field_still_produces_no_intent_at_all():
    """Making the refusal legible must not make the field reachable. The
    planner's rule is unchanged — a password is refused before any intent
    exists — and the report is built from a separate READ of the page.
    heuristics.js's per-field classifier moved from a loop body (where the
    refusal was a bare `continue`) into its own function called once per
    field (extension/src/engine/heuristics/native_scan_map.js), so the
    same early-refusal shape is now a `return null` — still before any
    intent object is built, still nothing else runs for that field."""
    heur = HEURISTICS.read_text(encoding="utf-8")
    assert 'if (type === "password") return null;' in heur, (
        "the planner's password refusal was rewritten"
    )
    filler = FILLER.read_text(encoding="utf-8")
    assert "function ynCredentialSkips" in filler
    skips = _js_function_body(filler, "function ynCredentialSkips")
    assert "ynReportEntry" in skips and "el.value" not in skips, (
        "ynCredentialSkips must READ labels only — it may never touch a value"
    )


def test_credential_and_honeypot_skips_survive_the_report_merge():
    """report.skipped_honeypot existed in the engine and was dropped on the
    floor by ynMergeReport, because the key was missing from the empty shape
    and the merge only carries keys it knows."""
    filler = FILLER.read_text(encoding="utf-8")
    empty = filler.split("function ynEmptyReport")[1].split("\n}")[0]
    for key in ("skipped_password", "skipped_honeypot", "skipped_eeo"):
        assert key in empty, f"{key} is missing from ynEmptyReport"
    popup_html = POPUP_HTML.read_text(encoding="utf-8")
    popup = POPUP.read_text(encoding="utf-8")
    assert "skipped_password" in popup, (
        "the popup report must name the credential refusal, not hide it"
    )
    assert 'id="fill-report"' in popup_html


def test_education_and_work_patterns_stay_tight():
    """A bare /company/ or /role/ would claim 'the company you are applying
    to' and 'the role you are applying for' — the same words meaning the
    opposite thing. The employer and title patterns must demand their own
    word, and the education patterns must sit BELOW the derived
    highest-qualification rule so that answer is not stolen."""
    heur = HEURISTICS.read_text(encoding="utf-8")
    assert '"work.0.employer"' in heur and '"work.0.title"' in heur
    assert '"education.0.institution"' in heur
    assert heur.index("highest (level of )?(qualification|education)") < heur.index(
        '"education.0.qualification"'
    ), "the education patterns must not outrank the derived qualification answer"
    for forbidden in ("[/company/i", "[/role/i", "[/position/i"):
        assert forbidden not in heur, (
            f"{forbidden} is too loose to sit in the shared label ladder"
        )


def test_the_new_fixtures_carry_no_real_personal_data():
    """Fixture hygiene: example.com/example.org addresses, the Ofcom drama
    phone range, and no real street address."""
    import re

    for name in (
        "generic_conference_registration.html",
        "generic_volunteer_application.html",
        "generic_support_enquiry.html",
    ):
        text = (FIXTURES / name).read_text(encoding="utf-8")
        emails = re.findall(r"[\w.+-]+@[\w.-]+", text)
        for addr in emails:
            assert addr.endswith("example.com") or addr.endswith("example.org"), (
                f"{name} carries a non-example email: {addr}"
            )
        for phone in re.findall(r"\b0\d[\d ]{8,}\b", text):
            assert phone.replace(" ", "").startswith("07700900"), (
                f"{name} carries a phone outside the drama range: {phone}"
            )


if __name__ == "__main__":  # pragma: no cover - manual run
    sys.exit(subprocess.call([sys.executable, "-m", "pytest", __file__, "-q"]))
