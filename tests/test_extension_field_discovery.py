"""FIND THE RIGHT FIELDS, REFUSE THE RIGHT ONES.

Wires the node/jsdom fixture runners for field discovery and the guards
into pytest, the same pattern test_extension_generic_fill.py already
uses for the existing suite: each script evaluates the production files
verbatim under jsdom (no network, no extension runtime) and prints its own
"<name> PASS: ..." line on success, exiting non-zero on any failure.

One test per behaviour (the custom-domain one is a documented measured no,
not a failure: a real custom-domain tenant already resolves name/email/phone through
heuristics alone without a new library-fingerprint tier, and
run_custom_domain_measured_no.mjs's own PASS line records exactly that).

The live counterpart (SmartRecruiters phone/country no longer needs_you on
a real posting) is out of scope here — it needs a real, signed-in browser
session against a live posting, which this static-fixture suite cannot
provide.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "tests" / "ext_fixtures"


def _run_node(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", str(FIXTURES / script)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=300,
    )


def test_label_quality_gate():
    """40-string fixture (20 good / 20 bad) classified 40 of 40; a cryptic
    id never surfaces as a label to ynFirstUsableLabel."""
    proc = _run_node("run_label_quality.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "label quality PASS" in proc.stdout


def test_report_never_shows_the_raw_id():
    """A fixture whose only signal for a field is a cryptic auto-id shows a
    human needs_you line, never the raw id, anywhere in the report."""
    proc = _run_node("run_report_label_never_raw_id.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "report label PASS" in proc.stdout


def test_extra_label_sources():
    """aria-describedby, id-naming convention, a label-named attribute on a
    bounded ancestor, and data-testid identity all resolve at confidence
    guessed; the data-testid=company-name decoy never maps to first name."""
    proc = _run_node("run_extra_label_sources.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "extra label sources PASS" in proc.stdout


def test_guard_classes_classification():
    """24-group fixture (8 sensitive / 8 truth / 8 policy): 24 of 24 classed
    correctly, including the work-authorisation/policy collision fix."""
    proc = _run_node("run_guard_classes.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "guard classes PASS" in proc.stdout


def test_guard_classes_write_behaviour():
    """End to end through the real ynExecuteIntents: the truth checkbox is
    written, the four policy checkboxes (agree/subscribe x3) are refused
    and flagged, 0 of 4 ticked."""
    proc = _run_node("run_guard_classes_write.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "guard classes write PASS" in proc.stdout


def test_text_phrase_captcha_hard_stop():
    """6 phrase fixtures stop with captcha_stop and 0 writes; 3 decoys
    (including 'Human Resources contact name') fill normally."""
    proc = _run_node("run_captcha_text_fields.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "captcha text fields PASS" in proc.stdout


def test_occlusion_check():
    """A field under a full-screen cookie/modal overlay: 0 writes, reported
    hidden; the same fixture with the overlay dismissed: filled."""
    proc = _run_node("run_occlusion_check.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "occlusion check PASS" in proc.stdout


def test_british_forms_fixture():
    """20-label British-forms fixture (Forename, Surname, Post code, Mobile,
    Town/City, ...) resolves 20 of 20; the three decoys gain no new false
    claim from the widened alternations."""
    proc = _run_node("run_british_forms_fixture.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "british forms PASS" in proc.stdout


def test_custom_domain_measured_no():
    """Component-library fingerprint tier: a measured no, recorded with the
    counts. A Workable-shaped custom-domain fixture (no URL/DOM signature
    fires, ynDetectAts honestly answers 'unknown') already resolves
    name/email/phone 3 of 3 through the existing heuristics rungs alone, so
    the 'low value; a measured no is acceptable' bar is met
    without building a new library-fingerprint tier."""
    proc = _run_node("run_custom_domain_measured_no.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "custom domain measured-no PASS" in proc.stdout


def test_row_aware_dedup_and_wizard_reask():
    """A repeated-block fixture: a second 'Company' field two rows down
    claims its OWN row's profile entry, not a duplicate of row 0. A
    two-step wizard fixture re-asking email on step 2 (a fresh page, fresh
    per-page dedup) fills it there too."""
    proc = _run_node("run_row_aware_dedup.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "row-aware dedup PASS" in proc.stdout


def test_question_families():
    """Family pairs from the answer bank's spec: differently-worded phrasings of the
    same underlying question share a family id; an EEO-shaped question is
    never a family (never a reuse candidate), whatever it overlaps."""
    proc = _run_node("run_question_families.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "question families PASS" in proc.stdout


def test_question_family_is_pure_and_exported():
    """ynQuestionFamily is a pure string-in/id-out classifier with no DOM
    dependency, so the server-side fingerprint code can mirror it
    exactly without ever loading a browser-only file."""
    src = (REPO / "extension" / "content" / "heuristics.js").read_text(
        encoding="utf-8"
    )
    assert "function ynQuestionFamily(text)" in src
    assert "YN_QUESTION_FAMILIES" in src


def test_captcha_detector_wired_into_challenge_page():
    """ynChallengePage (common/challenge_detect.js) — the page-level hard
    stop every fill entry point checks first — now also fires on a
    text-phrase captcha field, not only the widget/id sentinels."""
    src = (
        REPO / "extension" / "common" / "challenge_detect.js"
    ).read_text(encoding="utf-8")
    assert "YN_CAPTCHA_TEXT_RE" in src
    assert "ynPageHasCaptchaField" in src
    assert "function ynChallengePage" in src


def test_terms_regex_no_longer_alone_governs_the_checkbox_guard():
    """The single YN_TERMS_SIGNAL_RE collision
    is replaced by the three-way ynGuardClassOf; the old name survives only
    as a named historic constant, never consulted by ynIsTermsCheckbox."""
    src = (REPO / "extension" / "content" / "engine.js").read_text(
        encoding="utf-8"
    )
    assert "function ynGuardClassOf(" in src
    assert "YN_GUARD_TRUTH_RE" in src
    assert "YN_GUARD_POLICY_RE" in src
    assert "YN_GUARD_SENSITIVE_RE" in src
    # ynIsTermsCheckbox must decide from ynGuardClassOf, not the old regex.
    body_start = src.index("function ynIsTermsCheckbox")
    body = src[body_start : body_start + 1200]
    assert "ynGuardClassOf" in body
    assert "YN_TERMS_SIGNAL_RE_HISTORIC" not in body


def test_occlusion_guard_wired_into_honeypot():
    """ynIsHoneypot (the single write-time gate every fill path calls) now
    refuses an occluded field, alongside its existing hidden/off-screen/
    bot-trap checks."""
    src = (REPO / "extension" / "content" / "engine.js").read_text(
        encoding="utf-8"
    )
    assert "function ynIsOccludedField(" in src
    honeypot_start = src.index("function ynIsHoneypot")
    honeypot_body = src[honeypot_start : honeypot_start + 800]
    assert "ynIsOccludedField" in honeypot_body


def test_label_quality_module_shipped_and_loaded():
    """common/label_quality.js exists, exports the label quality gate, and is injected
    in EVERY click-time stack that reports a field label back to the
    student: popup.js bundles two such stacks now (YN_FILL_SCRIPTS for the
    apply fill, YN_POSTING_SCRIPTS for the Indeed employer posting fill,
    both of which build a report through ynReportFieldLabel), so the
    string appears twice — once per list — each ahead of the files that
    consume it."""
    module_path = REPO / "extension" / "common" / "label_quality.js"
    assert module_path.is_file()
    src = module_path.read_text(encoding="utf-8")
    assert "function ynIsUsableLabel(" in src
    assert "function ynFirstUsableLabel(" in src

    popup = (REPO / "extension" / "popup.js").read_text(encoding="utf-8")
    assert popup.count('"common/label_quality.js"') == 2
    # Loaded before heuristics.js and before posting_filler.js, both of
    # which consume it (directly or via a report-line builder).
    assert popup.index('"common/label_quality.js"') < popup.index(
        '"content/heuristics.js"'
    )
    assert popup.rindex('"common/label_quality.js"') < popup.index(
        '"content/posting_filler.js"'
    )
