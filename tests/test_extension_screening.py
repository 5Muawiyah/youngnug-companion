"""Screening questions — drafting, prompt safety, answer memory.

Server-side drafting, the fingerprint/family bank and the
route-level cross-user isolation are tested on the server. This file holds the extension-side
node/jsdom pins: the local-model prompt fence and, as they land, the
free-text answer capture and the draft-not-silent-write behaviour.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "tests" / "ext_fixtures"

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
    "links": {},
    "education": [],
    "work": [],
    "right_to_work": {"uk_rtw": True, "needs_sponsorship": False},
    "eligibility_extra": {},
    "answers": {},
    "unconfirmed_answers": [],
    "derived": {},
}


def _run_node(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", str(FIXTURES / script)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=300,
    )


def test_ollama_prompt_fences_untrusted_labels_and_carries_no_profile_values():
    """A label carrying a prompt-injection attempt (including a
    forged fence close tag) is neutralised and wrapped before it reaches the
    local model, and the request never carries a profile VALUE — only
    labels, ever — see tests/ext_fixtures/run_prompt_fence.mjs."""
    proc = _run_node("run_prompt_fence.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "run_prompt_fence: all pass" in proc.stdout


def test_question_fingerprint_and_family_mirror_the_python_answer_bank():
    """content/filler.js's ynQuestionFingerprint/ynQuestionFamily
    agree with the server's question fingerprint — 5 known-answer FNV-1a
    vectors byte-for-byte, and the same 20 family pairs
    the server's answer bank checks, against one shared ground truth."""
    proc = _run_node("run_question_family.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "run_question_family: all pass" in proc.stdout


def test_collect_user_answers_grows_to_free_text():
    """ynCollectUserAnswers reads back a screening question the student
    has already typed an answer into, carrying its fingerprint/family,
    alongside the unchanged 7-key fact capture — an untouched field is
    never reported as answered."""
    proc = _run_node("run_collect_freetext_answers.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "run_collect_freetext_answers: all pass" in proc.stdout


def test_save_answers_routes_free_text_to_the_bank_and_facts_to_the_profile():
    """SAVE_ANSWERS never conflates the two destinations — a free-text
    item POSTs to the answer bank, a fact-key item PUTs the profile, and a
    mixed batch does exactly one of each."""
    proc = _run_node("run_save_answers_bank.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "run_save_answers_bank: all pass" in proc.stdout


def test_accepted_draft_never_touches_the_dom_and_carries_its_refs():
    """A clean, accepted draft from GENERATE_ANSWER is never written to
    the DOM by the fill path — it surfaces ONLY in report.drafts, with its
    verdict and refs, for a later review screen to render and approve."""
    result = ext_harness.run_fill_fixture(
        FIXTURES / "screening_draft_review_form.html",
        _PLAN,
        entry="ynFillApplication",
        responses={
            "GENERATE_ANSWER": {
                "ok": True,
                "text": "I want to build real products that help students.",
                "verdict": "clean",
                "refs": ["experience-0"],
            }
        },
    )
    assert result["ok"] is True, result

    by_name = {row["name"]: row for row in result["dom"] if row["name"]}
    assert by_name["first_name"]["value"] == "Sam", "an ordinary exact field must still fill"
    assert by_name["why_join"]["value"] == "", (
        "a draft must NEVER be written to the DOM — got "
        f"{by_name['why_join']['value']!r}"
    )

    drafts = (result["report"] or {}).get("drafts") or []
    assert len(drafts) == 1, f"expected exactly one draft, got {drafts}"
    draft = drafts[0]
    assert draft["text"] == "I want to build real products that help students."
    assert draft["verdict"] == "clean"
    assert draft["refs"] == ["experience-0"]
    assert draft["source"] == "generated"


def test_refused_draft_shows_its_verdict_with_zero_dom_writes():
    """A REFUSED draft (the server's validator rejected it) is reported
    with its verdict — never silently dropped, and never written."""
    result = ext_harness.run_fill_fixture(
        FIXTURES / "screening_draft_review_form.html",
        _PLAN,
        entry="ynFillApplication",
        responses={
            "GENERATE_ANSWER": {
                "ok": False,
                "error": "grounding failed",
                "verdict": ["number_not_in_facts:47", "unknown_proper_noun:deloitte"],
                "refs": [],
            }
        },
    )
    assert result["ok"] is True, result
    by_name = {row["name"]: row for row in result["dom"] if row["name"]}
    assert by_name["why_join"]["value"] == "", "a refused draft must never be written"

    drafts = (result["report"] or {}).get("drafts") or []
    assert len(drafts) == 1, drafts
    assert drafts[0]["verdict"] == [
        "number_not_in_facts:47",
        "unknown_proper_noun:deloitte",
    ]
    assert drafts[0]["text"] == ""
    # a refused draft is ALSO named in needs_you, so the student still sees
    # something to do about that field, not silence
    needs_you = (result["report"] or {}).get("needs_you") or []
    assert len(needs_you) == 1, needs_you
    assert needs_you[0]["fieldKey"].startswith("generated:")
