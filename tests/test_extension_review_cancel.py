"""A cancelled review writes nothing and reports nothing.

Observed on a real form: the filler posted APPLY_RESULT "filled" after a Cancel,
the tracker row moved to filled_pending_submit, the popup asked whether a form nobody
touched had been sent, and every later fill-plan for the job answered 404.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "tests" / "ext_fixtures"


def test_cancel_writes_nothing_and_reports_nothing():
    proc = subprocess.run(
        ["node", str(FIXTURES / "run_review_cancel.mjs")],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=300,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "review screen (cancel) PASS" in proc.stdout
