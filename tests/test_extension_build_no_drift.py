"""For every shipped file listed in extension/src/entries.json, the
committed shipped file must be BYTE-IDENTICAL to what scripts/build_extension
.py's own build_one() produces from the committed source right now. The
source is the truth; the shipped file is its build output, committed so an
unpacked install and the server's on-demand zip both keep working
without a build step of their own — this test is what stops that committed
copy from silently drifting away from the source that is supposed to have
produced it. It imports the real build script rather than re-implementing
the build, so this test and a real `python scripts/build_extension.py` can
never disagree about what "built" means.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"

_spec = importlib.util.spec_from_file_location(
    "build_extension", REPO / "scripts" / "build_extension.py"
)
build_extension = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build_extension)


def _entries() -> dict:
    if not build_extension.ENTRIES_FILE.is_file():
        return {}
    return build_extension.load_entries()


@pytest.mark.parametrize("shipped", sorted(_entries().keys()) or ["__none__"])
def test_shipped_file_matches_a_fresh_build_of_its_source(shipped):
    # A missing esbuild is a failure, never a skip: this is the only check that the
    # committed shipped files equal their source, and a check that quietly stands
    # aside when its tool is absent is not a check. The build tests beside this one
    # already fail without the binary, so the suite's requirement is unchanged.
    assert build_extension.ESBUILD.exists(), (
        f"esbuild binary not installed at {build_extension.ESBUILD} "
        "(run npm install); the drift check cannot run without it"
    )
    if shipped == "__none__":
        pytest.skip("no entries migrated yet")
    cfg = _entries()[shipped]
    fresh = build_extension.build_one(cfg["entry"], cfg.get("node_exports", []))
    committed = (EXT / shipped).read_text(encoding="utf-8")
    assert fresh == committed, (
        f"{shipped} does not match a fresh build of {cfg['entry']} — "
        f"run `python scripts/build_extension.py` and commit the result"
    )
