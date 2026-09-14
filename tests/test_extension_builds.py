"""Pins on the two extension builds and their permission rules.

The build script is imported and run for real into a tmp dist dir; the pins
read the manifests it produced. A manifest edit that slipped a forbidden
permission in, or widened the store build to <all_urls>, fails here before
it reaches a reviewer or a user.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent

# scripts/ is a plain directory, not a package — load the module from its path.
_spec = importlib.util.spec_from_file_location(
    "build_extension", REPO / "scripts" / "build_extension.py"
)
build_extension = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build_extension)


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("ext-dist")
    orig = build_extension.DIST
    build_extension.DIST = out
    try:
        build_extension.main()
    finally:
        build_extension.DIST = orig
    return out


def _manifest(built: Path, build: str) -> dict:
    return json.loads((built / build / "manifest.json").read_text(encoding="utf-8"))


def test_store_build_is_the_source_manifest(built):
    src = json.loads((REPO / "extension" / "manifest.json").read_text("utf-8"))
    assert _manifest(built, "store") == src


def test_store_build_never_requests_all_urls(built):
    m = _manifest(built, "store")
    assert "<all_urls>" not in m.get("host_permissions", [])
    assert "activeTab" in m["permissions"]


def test_full_build_gains_exactly_the_decided_permissions(built):
    store = _manifest(built, "store")
    full = _manifest(built, "full")
    assert set(full["permissions"]) - set(store["permissions"]) == {
        "notifications",
        "downloads",
    }
    assert set(full["host_permissions"]) - set(store["host_permissions"]) == {
        "<all_urls>"
    }


def test_neither_build_carries_a_forbidden_permission(built):
    for build in ("store", "full"):
        m = _manifest(built, build)
        perms = set(m.get("permissions", [])) | set(m.get("optional_permissions", []))
        # tabGroups left this set deliberately - the why lives on
        # FORBIDDEN_PERMISSIONS in scripts/build_extension.py, beside the
        # decision, not here.
        assert not perms & {"debugger", "nativeMessaging"}, build


def test_both_builds_ship_the_same_engine_bytes(built):
    """The frozen safety rules live in the shared engine; a build may change
    the MANIFEST only. Byte-identical code is what 'neither build may weaken
    a frozen safety rule' means in practice."""
    for name in ("background.js", "popup.js"):
        a = (built / "store" / name).read_bytes()
        b = (built / "full" / name).read_bytes()
        assert a == b, name
    store_content = sorted(p.name for p in (built / "store" / "content").glob("*.js"))
    full_content = sorted(p.name for p in (built / "full" / "content").glob("*.js"))
    assert store_content == full_content
    for name in store_content:
        assert (built / "store" / "content" / name).read_bytes() == (
            built / "full" / "content" / name
        ).read_bytes(), name
