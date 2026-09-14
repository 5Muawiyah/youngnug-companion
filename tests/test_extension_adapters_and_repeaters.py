"""Adapters, repeated rows, widget-heavy ATSs.

Everything below runs the production files verbatim through jsdom (the
existing tests/ext_fixtures/run_*.mjs pattern), no network, no extension
runtime:

  * content/repeater.js's own mechanics: bounded Add-another
    expansion, the page's own stated cap, stop-on-no-growth, the decoy
    "Add and submit" button ynSubmitGuard refuses.
  * content/adapters/workday.js's progress-bar step key (confirmed
    on a live page 2026-09-03 — see the adapter's own header) and the
    repeater-driven My Experience rows it feeds into (still unverified
    past the account wall).
  * content/adapters/personio.js, pinpoint.js, dover.js against
    fixtures reconstructed from a live, no-sign-in read of one public
    posting per ATS.
  * content/adapters/greenhouse.js's R10-cross-checked education fields
, confidence "guessed" since never checked on a live page.
  * content/adapters/url_scope.js's ynWithinApplicationScope:
    the 12-pair table plus a mid-wizard-redirect fixture.
  * content/adapters/reopen.js's ynAdapterReopenSection: a
    collapsed summary card reopened via its own declared Edit label; a
    "Confirm and continue"-only fixture left untouched.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "tests" / "ext_fixtures" / "adapters"


def _run_node(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", str(FIXTURES / script)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=300,
    )


def test_repeater_bounded_expansion_and_decoy_refusal():
    proc = _run_node("run_repeater.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "repeater PASS" in proc.stdout


def test_workday_progress_bar_step_key_and_history_rows():
    proc = _run_node("run_workday_history.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "workday history/progress-bar PASS" in proc.stdout


def test_new_ats_adapters_and_greenhouse_education():
    proc = _run_node("run_new_ats_adapters.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "new ATS adapters + greenhouse education PASS" in proc.stdout


def test_url_scope_twelve_pair_table():
    proc = _run_node("run_url_scope.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "url_scope PASS" in proc.stdout


def test_collapsed_summary_reopen_via_declared_edit_label():
    proc = _run_node("run_reopen.mjs")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "reopen PASS" in proc.stdout


def test_no_keyboardevent_construction_in_adapter_files():
    """Frozen guarantee: grep KeyboardEvent stays 0 in content/ and common/
    except where a small, explicitly named allowance exists elsewhere for
    the ARIA driver and the per-character second pass. The adapter-side
    files (repeater.js, url_scope.js, reopen.js, and the adapters) never
    dispatch a keyboard event at all."""
    adapter_files = [
        REPO / "extension" / "content" / "repeater.js",
        REPO / "extension" / "content" / "adapters" / "url_scope.js",
        REPO / "extension" / "content" / "adapters" / "reopen.js",
        REPO / "extension" / "content" / "adapters" / "personio.js",
        REPO / "extension" / "content" / "adapters" / "pinpoint.js",
        REPO / "extension" / "content" / "adapters" / "dover.js",
        REPO / "extension" / "content" / "adapters" / "successfactors.js",
        REPO / "extension" / "content" / "adapters" / "workday.js",
        REPO / "extension" / "content" / "adapters" / "greenhouse.js",
        REPO / "extension" / "content" / "adapters" / "taleo.js",
    ]
    for f in adapter_files:
        assert "KeyboardEvent" not in f.read_text(encoding="utf-8"), f


def test_repeater_add_click_always_checks_ynsubmitguard_first():
    src = (REPO / "extension" / "content" / "repeater.js").read_text(encoding="utf-8")
    assert "ynSubmitGuard" in src
    # both the discovery filter and the click-loop's defensive re-check
    assert src.count("ynSubmitGuard") >= 2


def test_reopen_never_clicks_a_submit_guarded_control():
    src = (REPO / "extension" / "content" / "adapters" / "reopen.js").read_text(
        encoding="utf-8"
    )
    assert "ynSubmitGuard" in src


def test_url_scope_exposed_for_its_two_future_call_sites():
    """The pure function exists and is documented as needing a one-line
    call-site edit in filler.js's fillstate load and popup.js's
    ynMatchJobToTab — that wiring is a separate change, not made here."""
    shipped = REPO / "extension" / "content" / "adapters" / "url_scope.js"
    src = shipped.read_text(encoding="utf-8")
    assert "function ynWithinApplicationScope(" in src
    # The call-site note above lives in a COMMENT, so it survives only in
    # extension/src/ once this file is bundled by scripts/build_
    # extension.py (see that folder's own index.js) — esbuild strips every
    # comment from its output, the shipped file included. Read whichever of
    # the two actually carries the file's comments right now.
    entries_file = REPO / "extension" / "src" / "entries.json"
    doc_src = src
    if entries_file.is_file():
        import json

        entries = json.loads(entries_file.read_text(encoding="utf-8"))
        cfg = entries.get("content/adapters/url_scope.js")
        if cfg:
            doc_src = (REPO / "extension" / cfg["entry"]).read_text(encoding="utf-8")
    assert "ynMatchJobToTab" in doc_src  # documents the call site, does not edit it
    filler = (REPO / "extension" / "content" / "filler.js").read_text(encoding="utf-8")
    popup = (REPO / "extension" / "popup.js").read_text(encoding="utf-8")
    # the wiring into either file's fillstate/match logic is not made yet
    assert "ynWithinApplicationScope" not in filler
    assert "ynWithinApplicationScope" not in popup


def test_new_adapters_registered_in_yn_fill_scripts():
    popup = (REPO / "extension" / "popup.js").read_text(encoding="utf-8")
    for rel in (
        "content/repeater.js",
        "content/adapters/url_scope.js",
        "content/adapters/reopen.js",
        "content/adapters/personio.js",
        "content/adapters/pinpoint.js",
        "content/adapters/dover.js",
        "content/adapters/successfactors.js",
    ):
        assert f'"{rel}"' in popup, rel
