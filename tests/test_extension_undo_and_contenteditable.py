"""The plain-text contenteditable writer and undo
(the engine half of Undo)."""

from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "tests" / "ext_fixtures"

sys.path.insert(0, str(REPO / "tests"))
import ext_harness  # noqa: E402


# ─── Plain-text contenteditable writer ──────────────────────────────────


def test_plain_contenteditable_is_written_and_read_back():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_contenteditable_plain.html",
        {"id": "plain", "value": "Looking forward to this role."},
        entry="ynTestContentEditable",
    )
    report = r["report"]
    assert report["filled"] == ["answers.cover_note"]
    assert report["finalText"] == "Looking forward to this role."


def test_quill_style_editor_stays_refused_with_zero_writes():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_contenteditable_quill.html",
        {"id": "quill", "value": "Looking forward to this role."},
        entry="ynTestContentEditable",
    )
    report = r["report"]
    assert report["filled"] == []
    assert report["unresolved"] == ["answers.cover_note"]
    assert "Looking forward" not in report["finalText"]


# ─── Undo, engine half ───────────────────────────────────────────────────


def test_undo_restores_every_written_field_leaves_typed_fields_alone():
    r = ext_harness.run_fill_fixture(
        FIXTURES / "write_undo_eight_fields.html", {}, entry="ynTestUndo"
    )
    report = r["report"]

    # 6 fields written by the fill (text, textarea, select, checkbox, a
    # React-controlled input, and a file attach) — the fixture's own name
    # notwithstanding, this repo's "eight-field fixture" also counts the two
    # student-typed fields the intents list never even attempts to write.
    # The checkbox is a truth-class one (authorised to work in the UK): a
    # consent or newsletter box would be refused by the policy class, never
    # written, and so could not be undone either.
    assert report["filledCount"] == 6
    assert set(report["filledKeys"]) == {
        "contact.email",
        "answers.notes",
        "address.country",
        "right_to_work.uk_rtw",
        "contact.phone",
        "documents.cv",
    }

    before = report["before"]
    after_fill = report["afterFill"]
    after_undo = report["afterUndo"]

    # the 2 student-typed fields: unchanged at every step
    assert after_fill["typed1"] == before["typed1"] == "Sam"
    assert after_fill["typed2"] == before["typed2"] == "Example"
    assert after_undo["typed1"] == "Sam"
    assert after_undo["typed2"] == "Example"

    # the write actually landed before Undo ran
    assert after_fill["email"] == "student@example.com"
    assert after_fill["notes"] == "Some notes"
    assert after_fill["country"] == "uk"
    assert after_fill["agree"] is True
    assert after_fill["react_controlled"] == "07700 900123"
    assert after_fill["cvFiles"] == 1

    # every written field is back to its pre-write value after Undo
    assert after_undo["email"] == before["email"] == ""
    assert after_undo["notes"] == before["notes"] == ""
    assert after_undo["country"] == before["country"] == ""
    assert after_undo["agree"] == before["agree"] is False
    assert after_undo["react_controlled"] == before["react_controlled"] == ""
    assert after_undo["cvFiles"] == 0

    assert report["undo1"] == {"reverted": 6, "total": 6}
    # idempotent: a second Undo changes nothing (the session is already empty)
    assert report["undo2"] == {"reverted": 0, "total": 0}
