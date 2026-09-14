"""Pins on what the packed extension ZIPS actually contain.

tests/test_extension_builds.py pins the manifests the build script writes;
these pins open the produced .zip files themselves, because the store pack
is what a reviewer unpacks — an adapter missing from the archive, or a
safety guard stripped by a build step, would not show in the manifest.
"""

from __future__ import annotations

import importlib.util
import json
import re
import zipfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent

# scripts/ is a plain directory, not a package — load the module from its path.
_spec = importlib.util.spec_from_file_location(
    "build_extension_pack", REPO / "scripts" / "build_extension.py"
)
build_extension = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build_extension)

# The three apply-surface adapters plus the employer/workable ones that ship
# beside them; a pack without these is the pre-adapter build resurfacing.
REQUIRED_ADAPTERS = (
    "content/adapters/linkedin_easy_apply.js",
    "content/adapters/indeed_apply.js",
    "content/adapters/reed.js",
    "content/adapters/indeed_employer.js",
    "content/adapters/workable.js",
)


@pytest.fixture(scope="module")
def zips(tmp_path_factory):
    out = tmp_path_factory.mktemp("ext-pack")
    orig = build_extension.DIST
    build_extension.DIST = out
    try:
        build_extension.main()
    finally:
        build_extension.DIST = orig
    produced = {}
    for build in ("store", "full"):
        matches = sorted(out.glob(f"youngnug-companion-{build}-*.zip"))
        assert len(matches) == 1, matches
        produced[build] = matches[0]
    return produced


def test_both_zips_ship_the_apply_adapters(zips):
    for build, zip_path in zips.items():
        with zipfile.ZipFile(zip_path) as zf:
            names = set(zf.namelist())
        for adapter in REQUIRED_ADAPTERS:
            assert adapter in names, f"{build}: {adapter} missing from pack"


def test_packaged_engine_carries_the_submit_tripwire(zips):
    """Fill-and-stop: the guard must be IN the archive a reviewer unpacks,
    wired into the click path — not merely present in the source tree."""
    for build, zip_path in zips.items():
        with zipfile.ZipFile(zip_path) as zf:
            engine = zf.read("content/engine.js").decode("utf-8")
        assert "function ynSubmitGuard" in engine, build
        assert 'if (type === "submit") return true;' in engine, build
        assert "submit|send application|apply now|finish|complete application" in (
            engine
        ), build
        # the guard is handed to the generic kit so every click passes it
        assert "ynKitInit({ clickGuard: ynSubmitGuard })" in engine, build


def test_packed_version_is_ahead_of_every_prior_pack(zips):
    """A rebuild must never re-use or fall behind a version already packed
    into dist/ — the store rejects a non-incremented upload, and a stale
    version number would mislabel which code a pack carries."""
    source = json.loads(
        (REPO / "extension" / "manifest.json").read_text("utf-8")
    )["version"]

    def key(v: str):
        return tuple(int(p) for p in v.split("."))

    for zip_path in (REPO / "dist" / "extension").glob("youngnug-companion-*.zip"):
        m = re.search(r"-(\d+(?:\.\d+)+)\.zip$", zip_path.name)
        if not m:
            continue
        v = m.group(1)
        if v == source:
            # same version number ⇒ must be the same (adapter-bearing) code,
            # not an old pack's number re-used for different contents
            with zipfile.ZipFile(zip_path) as zf:
                names = set(zf.namelist())
            for adapter in REQUIRED_ADAPTERS:
                assert adapter in names, f"{zip_path.name} re-uses {source}"
        else:
            assert key(source) > key(v), f"source {source} not ahead of packed {v}"
    for build, zip_path in zips.items():
        with zipfile.ZipFile(zip_path) as zf:
            packed = json.loads(zf.read("manifest.json"))["version"]
        assert packed == source, build


def test_packaged_pack_carries_the_generic_filler_and_its_refusals(zips):
    """The generic filler and the stop, verified where they actually ship. A guard that is
    green in the source tree and absent from the archive is not a guard: the
    zip is what a reviewer unpacks and what a tester installs.

    Both builds are checked, because the FULL build is the one that carries
    <all_urls> — the build on which "fill any field on any site" is not a
    figure of speech."""
    for build, zip_path in zips.items():
        with zipfile.ZipFile(zip_path) as zf:
            filler = zf.read("content/filler.js").decode("utf-8")
            api = zf.read("common/api.js").decode("utf-8")
            background = zf.read("background.js").decode("utf-8")
            popup_html = zf.read("popup.html").decode("utf-8")
            options_html = zf.read("options.html").decode("utf-8")
            ext_css = zf.read("ext.css").decode("utf-8")
            engine = zf.read("content/engine.js").decode("utf-8")

        # the generic rung, and the single planning ladder both paths share
        assert "async function ynFillAnyPage" in filler, build
        assert "async function ynPlanRungs" in filler, build

        # its refusals, IN THE ARCHIVE
        assert "function ynSubmitGuard" in engine, build
        assert "function ynCredentialSkips" in filler, build
        assert "skipped_password" in filler, build
        assert "ynChallengePage" in filler, build

        # the stop: checked before fetch, and the local switch answered first
        assert "async function ynStopReason" in api, build
        assert api.index("ynStopReason") < api.index("await fetch("), build
        assert "allowWhileServerStopped === true && !s.killSwitch" in api, build
        assert "companion_stop" in background, build

        # the stop as a control, and the warnings surface
        for name, html in (("popup", popup_html), ("options", options_html)):
            assert 'class="killswitch"' in html, f"{build}/{name}"
            assert 'id="warn"' in html, f"{build}/{name}"
        assert ".killswitch {" in ext_css, build
