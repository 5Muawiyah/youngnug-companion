"""The popup's job matcher sees every fill-able tracker row, not only the feed's
newest 200 adverts.

Observed on a real feed: an approved Greenhouse job sat behind thousands of
newer rows; LIST_JOBS read /api/jobs?limit=200, the open tab
matched nothing, the fill took the generic path, and the tracker row never received
its coverage. The worker now merges the tracker's fill-able rows into the list.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "tests" / "ext_fixtures"
BACKGROUND = REPO / "extension" / "background.js"


def test_merge_keeps_every_fillable_tracker_row():
    proc = subprocess.run(
        ["node", str(FIXTURES / "run_list_jobs_merge.mjs")],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=300,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "list jobs merge PASS" in proc.stdout


def test_list_jobs_reads_the_tracker_and_merges():
    src = BACKGROUND.read_text(encoding="utf-8")
    m = re.search(r'case "LIST_JOBS": \{(.*?)\n    \}', src, re.S)
    assert m, "LIST_JOBS case not found"
    body = m.group(1)
    assert '"/api/jobs?limit=200"' in body, "the feed page still comes first"
    assert '"/api/applications"' in body, "the tracker's rows must be read too"
    assert "ynMergeFillableJobs(" in body, "the pure merge is what the case applies"
    assert "try {" in body and "catch" in body, "a tracker read failure must not break the feed list"
