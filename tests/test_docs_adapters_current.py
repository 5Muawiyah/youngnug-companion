"""docs/ADAPTERS.md is generated from the adapter headers and the detection
rules; this fails the moment either changes without the table being
regenerated, so the published table cannot drift from the code."""

from __future__ import annotations

import importlib.util
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("gen_adapters_doc", REPO / "scripts" / "gen_adapters_doc.py")
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)


def test_adapters_doc_matches_a_fresh_render():
    text, systems = gen.render()
    assert systems >= 1
    assert (REPO / "docs" / "ADAPTERS.md").read_text(encoding="utf-8") == text, (
        "docs/ADAPTERS.md is stale: run python scripts/gen_adapters_doc.py"
    )


def test_every_adapter_folder_is_in_the_table():
    text, _ = gen.render()
    for d in (REPO / "extension" / "src" / "adapters").iterdir():
        if d.is_dir():
            assert f"`{d.name}`" in text, f"{d.name} missing from the generated table"
