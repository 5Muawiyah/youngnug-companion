"""Drives the jsdom harness for the CLIENT-side reader,
common/liveness_markers.js::ynDetectLiveness() (content/liveness_check.js
calls it verbatim on the injected page). The fixture
tests/ext_fixtures/run_liveness_check.mjs already existed and already pins
the closed/live/could_not_tell behaviour end to end in jsdom, but nothing
in the Python suite ever ran it -- an orphaned proof is not a proof anyone
would notice going stale. This file is the missing driver, mirroring
tests/test_extension_dev_selectors.py's own node-subprocess pattern for the
analogous run_dev_selectors.mjs fixture.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def test_liveness_check_reader_behaviour_in_the_jsdom_harness():
    """A closed marker on a host not yet in the closing set
    (Indeed/LinkedIn both start unconfirmed) -> could_not_tell naming the
    candidate phrase, never closed; the same marker on a host a live check HAS
    confirmed -> closed+phrase, proving the gate itself; a bot-gate
    sentinel -> could_not_tell, named, and checked BEFORE any phrase match;
    an unrecognised host or an empty page -> could_not_tell, never a
    guessed "live". See run_liveness_check.mjs for the individual
    scenarios this drives."""
    proc = subprocess.run(
        ["node", str(REPO / "tests" / "ext_fixtures" / "run_liveness_check.mjs")],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
