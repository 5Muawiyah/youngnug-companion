"""A passive reCAPTCHA badge (v3, size=invisible, inside .grecaptcha-badge) is not a
blocked page for capture; a challenge frame and an interstitial title still are.

Measured live on a Greenhouse job-boards posting: the page renders normally, carries
no ld+json and a v3 badge, and the Companion posted nothing because the blocked-page
sentinel counted the badge as a captcha widget. The fill path already treats that
badge as solve-at-submit; capture reads text and touches nothing.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIXTURES = REPO / "tests" / "ext_fixtures"


def test_passive_badge_does_not_block_capture_but_challenges_and_interstitials_do():
    proc = subprocess.run(
        ["node", str(FIXTURES / "run_capture_badge.mjs")],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=300,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "capture badge PASS" in proc.stdout
