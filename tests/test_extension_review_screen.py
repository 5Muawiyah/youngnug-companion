"""The review screen.

Between ynPlanRungs and ynExecuteIntents, in BOTH ynFillApplication and
ynFillAnyPage: exact-confidence intents wait for the same Approve but are
never listed; every guessed intent and every drafted answer gets one row;
nothing reaches the DOM until the student presses Approve; Cancel writes
nothing. content/review_screen.js is the on-page surface; ynReviewGate
(content/filler.js) is the seam that calls it.

Interactive assertions (DOM diff 0 before Approve, hover/edit/skip write
nothing, exactly one Approve releases the write, a refused draft shows its
refusal row and 0 writes) live in the jsdom fixtures under
tests/ext_fixtures/, driven with REAL DOM clicks/events because that is the
only way to observe the screen's state mid-fill, before it resolves. The
Playwright-backed tests here (tests/ext_harness.py's run_fill_fixture) use
its `review_script` hook to script a decision instead, which is enough to
prove the CONTRACT (skip/approve_draft/edit/cancel) without needing a real
click for every case, and to prove the generic path (ynFillAnyPage) gates
on the SAME screen.

Word-count / icon-only-control coverage for review_screen.js lives in
tests/test_extension_density.py, not duplicated here.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"
FIXTURES = REPO / "tests" / "ext_fixtures"
REVIEW_SCREEN_JS = EXT / "content" / "review_screen.js"
POPUP_JS = EXT / "popup.js"
POPUP_HTML = EXT / "popup.html"
FILLER = EXT / "content" / "filler.js"
CONTRACT = EXT / "MESSAGE_CONTRACT.md"

sys.path.insert(0, str(REPO / "tests"))
import ext_harness  # noqa: E402

_PLAN = {
    "job_id": 1,
    "contact": {
        "first_name": "Sam",
        "last_name": "Example",
        "email": "student@example.com",
        "phone": "07700 900123",
    },
    "address": {"line1": "1 Example Street", "city": "London", "postcode": "SW1A 1AA"},
    "links": {"linkedin": "https://www.linkedin.com/in/example-student"},
    "education": [],
    "work": [],
    "right_to_work": {"uk_rtw": True, "needs_sponsorship": False},
    "eligibility_extra": {},
    "answers": {},
    "unconfirmed_answers": [],
    "derived": {},
}

_PROFILE = {
    "generic": True,
    "contact": dict(_PLAN["contact"]),
    "address": dict(_PLAN["address"], country="United Kingdom"),
    "links": dict(_PLAN["links"]),
    "education": [],
    "work": [],
    "right_to_work": {"uk_rtw": True, "needs_sponsorship": False},
    "eligibility_extra": {"willing_to_relocate": None, "uk_driving_licence": None},
    "answers": {"notice_period": None, "salary_expectation": None, "earliest_start": None},
    "unconfirmed_answers": [
        "willing_to_relocate",
        "uk_driving_licence",
        "notice_period",
        "salary_expectation",
        "earliest_start",
    ],
    "derived": {},
}

MIXED_FIXTURE = FIXTURES / "review_screen" / "review_mixed_form.html"
CLEAN_DRAFT_RESPONSE = {
    "GENERATE_ANSWER": {
        "ok": True,
        "text": "I want to build products that help students.",
        "verdict": "clean",
        "refs": ["experience-0"],
    }
}
REFUSED_DRAFT_RESPONSE = {
    "GENERATE_ANSWER": {
        "ok": False,
        "error": "grounding failed",
        "verdict": ["number_not_in_facts:47", "unknown_proper_noun:deloitte"],
        "refs": [],
    }
}


def _js_function_body(source: str, needle: str) -> str:
    """The body of the first function whose declaration text is `needle`,
    from its opening `{` to the matching closing `}`, found by counting
    braces — a shipped file built by esbuild nests every top-level
    function one level deeper inside the bundle's own wrapping IIFE, so a
    plain textual slice up to the next sibling declaration can land inside
    the wrong function once the file is bundled."""
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


def _dom_values(result: dict) -> dict[str, str]:
    return {row["id"]: row["value"] for row in result["dom"] if row.get("id")}


# ── Fixture referenced by this file exists and is not empty ──────────────


def test_mixed_fixture_has_three_exact_two_guessed_one_draft_shape():
    html = MIXED_FIXTURE.read_text(encoding="utf-8")
    for field_id in ("first_name", "email", "phone", "city", "linkedin", "why_join"):
        assert f'id="{field_id}"' in html, f"fixture missing #{field_id}"
    assert 'autocomplete="given-name"' in html
    assert 'autocomplete="email"' in html
    assert 'autocomplete="tel"' in html
    assert "autocomplete" not in html.split('id="city"')[1].split(">")[0]
    assert "autocomplete" not in html.split('id="linkedin"')[1].split(">")[0]


# ── Interactive acceptance: DOM diff 0 before Approve, hover/edit/skip ───
# write nothing, exactly one Approve (even under a double-click) releases
# 3 exact + 2 guessed, the skipped draft never reaches the DOM ───────────


def test_review_screen_interactive_before_after_and_single_approve():
    proc = _run_node("run_review_review_screen.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "review screen (interactive) PASS" in proc.stdout


# ── A refused draft: refusal row, no controls, 0 writes for that field ───


def test_refused_draft_shows_refusal_row_and_zero_writes():
    proc = _run_node("run_review_refused_draft.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "review screen (refused draft) PASS" in proc.stdout


# ── Fail open: a missing review_screen.js never silently blocks a fill ───


def test_missing_review_screen_fails_open_with_one_error_row():
    proc = _run_node("run_review_fail_open.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "review screen (fail-open) PASS" in proc.stdout


# ── Playwright path: script an explicit draft approval ───────────────────


def test_explicit_approve_draft_writes_the_edited_or_original_text():
    result = ext_harness.run_fill_fixture(
        MIXED_FIXTURE,
        _PLAN,
        entry="ynFillApplication",
        responses=CLEAN_DRAFT_RESPONSE,
        review_script=[{"type": "approve_draft", "fieldKey": "generated:why_company"}],
    )
    assert result["ok"] is True, result
    values = _dom_values(result)
    assert values["why_join"] == "I want to build products that help students."
    draft = result["report"]["drafts"][0]
    assert draft["written"] is True


def test_edit_action_writes_the_edited_text_not_the_original_draft():
    result = ext_harness.run_fill_fixture(
        MIXED_FIXTURE,
        _PLAN,
        entry="ynFillApplication",
        responses=CLEAN_DRAFT_RESPONSE,
        review_script=[
            {
                "type": "edit",
                "fieldKey": "generated:why_company",
                "text": "I care about helping students find real jobs.",
            }
        ],
    )
    assert result["ok"] is True, result
    values = _dom_values(result)
    assert values["why_join"] == "I care about helping students find real jobs."


# ── Cancel: nothing at all, not even the exact fields ────────────────────


def test_cancel_writes_nothing_not_even_exact_fields():
    result = ext_harness.run_fill_fixture(
        MIXED_FIXTURE,
        _PLAN,
        entry="ynFillApplication",
        responses=CLEAN_DRAFT_RESPONSE,
        review_script=[{"type": "cancel"}],
    )
    assert result["ok"] is True, result
    values = _dom_values(result)
    assert all(v == "" for v in values.values()), values
    assert result["report"]["cancelled"] is True
    assert result["report"]["filled"] == []
    assert result["report"]["guessed"] == []


# ── The generic path (ynFillAnyPage) gates on the SAME screen ────────────


def test_generic_path_review_screen_cancel_blocks_every_write():
    result = ext_harness.run_fill_fixture(
        MIXED_FIXTURE,
        _PROFILE,
        entry="ynFillAnyPage",
        review_script=[{"type": "cancel"}],
    )
    assert result["ok"] is True, result
    values = _dom_values(result)
    assert all(v == "" for v in values.values()), values
    assert result["review_screen_calls"] == 1
    assert result["report"]["cancelled"] is True


def test_generic_path_review_screen_approve_fills_guessed_and_exact():
    result = ext_harness.run_fill_fixture(MIXED_FIXTURE, _PROFILE, entry="ynFillAnyPage")
    assert result["ok"] is True, result
    values = _dom_values(result)
    assert values["first_name"] == "Sam"
    assert values["city"] == "London"
    assert values["linkedin"] == "https://www.linkedin.com/in/example-student"
    # ynFillAnyPage never generates a draft (no job to ground an answer in);
    # the free-text archetype goes straight to needs_you, per MESSAGE_CONTRACT.md.
    assert values["why_join"] == ""
    assert result["report"]["drafts"] == []
    assert result["review_screen_calls"] == 1


def test_all_exact_fixture_never_shows_the_screen():
    """Rank 5: 'exact-confidence profile facts need not be listed... to keep
    the screen inside the 80-word chrome budget' — carried one step
    further, a fill with NOTHING to review skips the screen outright rather
    than asking for an empty-handed click."""
    profile = dict(_PROFILE)
    result = ext_harness.run_fill_fixture(
        FIXTURES / "generic_conference_registration.html",
        profile,
        entry="ynFillAnyPage",
    )
    assert result["ok"] is True, result
    assert result["review_screen_calls"] == 0, (
        "the screen rendered even though every intent here is exact-confidence"
    )


# ── Wiring: review_screen.js is in the click-time stack, in the right slot ──


def test_review_screen_registered_in_yn_fill_scripts_before_filler():
    src = POPUP_JS.read_text(encoding="utf-8")
    # `const` or `var`: a shipped file esbuild has bundled from
    # extension/src/ always emits a top-level module binding as `var`.
    m = ext_harness.re.search(r"(?:const|var)\s+YN_FILL_SCRIPTS\s*=\s*\[(.*?)\];", src, ext_harness.re.S)
    assert m, "YN_FILL_SCRIPTS gone from popup.js"
    files = ext_harness.re.findall(r'"([^"]+)"', m.group(1))
    assert "content/review_screen.js" in files
    assert files.index("content/review_screen.js") < files.index("content/filler.js")
    assert files.index("content/dom_fill_kit.js") < files.index("content/review_screen.js")


def test_review_screen_js_is_syntactically_valid():
    proc = subprocess.run(
        ["node", "--check", str(REVIEW_SCREEN_JS)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr


def test_filler_owns_the_seam_and_calls_it_from_both_fill_paths():
    src = FILLER.read_text(encoding="utf-8")
    assert "async function ynReviewGate(" in src
    assert src.count("ynReviewGate(") >= 3  # the definition + a call from each fill path
    assert "async function ynFillApplication(jobId)" in src
    assert "async function ynFillAnyPage(profile)" in src
    # ynFillApplication's own body is a thin four-phase orchestrator (see
    # extension/src/filler/filler/fill_application.js); the phase that
    # actually calls the review gate and then executes the gated intents,
    # in that order, is ynFillApplicationPlanAndExecute — the same seam,
    # one call removed from ynFillApplication itself rather than inline in
    # it, which is what the split changed and all it changed.
    assert "async function ynFillApplicationPlanAndExecute(" in src
    plan_execute_body = _js_function_body(
        src, "async function ynFillApplicationPlanAndExecute("
    )
    assert "ynReviewGate(" in plan_execute_body
    assert "ynExecuteIntents(executeIntents" in plan_execute_body
    assert plan_execute_body.index("ynReviewGate(") < plan_execute_body.index(
        "ynExecuteIntents(executeIntents"
    ), "the review gate must run before the gated intents are executed"
    fill_any_body = src.split("async function ynFillAnyPage(profile)")[1]
    assert "ynReviewGate(" in fill_any_body


# ── MESSAGE_CONTRACT.md carries the review screen's short section ──────


def test_message_contract_documents_the_review_screen():
    src = CONTRACT.read_text(encoding="utf-8")
    assert "### Review screen" in src
    assert "ynShowReviewScreen" in src
    assert "skippedFieldKeys" in src
    assert "__ynReviewScript" in src
    assert "written" in src


# ── Frozen guarantees the review screen must not weaken ───────────────────


def test_no_keyboardevent_or_raw_click_in_review_screen_js():
    src = REVIEW_SCREEN_JS.read_text(encoding="utf-8")
    assert "KeyboardEvent" not in src
    assert ".click()" not in src, "review_screen.js must never call .click() itself"


def test_review_screen_never_touches_submit_guard_targets():
    """The review screen shows and gates fields; it never presses anything the
    student did not press. No 'submit' literal, no click() call at all."""
    src = REVIEW_SCREEN_JS.read_text(encoding="utf-8")
    assert "auto_submit" not in src
    assert '"submitted"' not in src


def test_exact_confidence_intents_are_not_listed_as_rows():
    src = REVIEW_SCREEN_JS.read_text(encoding="utf-8")
    assert 'confidence === "exact"' not in src, (
        "review_screen.js should never need to filter exact intents itself — "
        "ynReviewGate (filler.js) already excludes them before calling it"
    )
    gate_src = FILLER.read_text(encoding="utf-8")
    assert 'i.confidence === "exact"' in gate_src
    assert 'i.confidence !== "exact"' in gate_src
