"""Produce the two extension builds from the ONE source tree.

  python scripts/build_extension.py            -> dist/extension/store  + .zip
                                                  dist/extension/full   + .zip

The checked-in extension/manifest.json IS the store build: activeTab
only, no third-party host access, nothing runs until the user clicks. That
stays the source of truth because the safest manifest should be the default
one a reader sees.

The FULL build (for people who install it themselves) derives from
it at build time:
  * host_permissions gains "<all_urls>" — generic filling without a fresh
    per-click grant, which is what multi-step forms need (an activeTab grant
    dies on navigation);
  * permissions gains "notifications" (fill-finished and needs-you alerts)
    and "downloads" (fetch your CV/letter beside a file-upload field);
  * name and version are suffixed so the two installs are distinguishable.

Neither build may EVER carry "debugger" or "nativeMessaging": neither is
needed to fill a form, and debugger shows users a scary banner and is a
common store-rejection trigger. ("tabGroups" was forbidden too and was
deliberately admitted for the Search-all-sites tab group; the full record
sits on FORBIDDEN_PERMISSIONS below.) That rule is enforced here and pinned
in tests/test_extension_builds.py, and no build weakens a frozen safety
rule — the never-submit/never-password/honeypot guards live in the shared
engine code, which is copied verbatim into both builds.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "extension"
DIST = ROOT / "dist" / "extension"
ESBUILD = ROOT / "node_modules" / ".bin" / ("esbuild.cmd" if sys.platform == "win32" else "esbuild")
ENTRIES_FILE = SRC / "src" / "entries.json"

# Permissions no build may ship. `debugger` and `nativeMessaging` are here
# because each is an escalation: one can drive any page and read any network
# traffic, the other can execute a local binary. Neither has any business in a
# job-search companion, in any build.
#
# `tabGroups` WAS in this set and has been removed deliberately, so the reason
# is recorded where the decision lives rather than in a commit message.
#
#   WHY IT WAS FORBIDDEN: the store build keeps its permission set as small as
#   it can, because every permission is something a reviewer asks about and a
#   student is asked to accept.
#
#   WHY IT NO LONGER IS: "Search all sites" opens up to four tabs at once, and
#   without grouping they arrive as four indistinguishable favicons in a strip
#   that already has the student's own work in it. tabGroups is what collects
#   the tabs THE EXTENSION ITSELF OPENED into one named group the student can
#   collapse or close in one action.
#
#   WHAT IT IS NOT, which is the part that made this acceptable: tabGroups can
#   create, name, colour and collapse groups and can read NOTHING about any
#   page. It is not `tabs` - it grants no access to the URL or title of any tab
#   the extension has no activeTab grant for - and Chrome shows no install
#   warning for it. `tabs` remains forbidden.
#
# To ship without it, put it back: the grouping code
# is guarded on `chrome.tabs.group` existing, so a build without the permission
# still opens the tabs and simply does not tidy them.
#
# `userScripts` was NEVER forbidden and is a deliberate later addition:
# it lets the extension register a
# student-PASTED script into the USER_SCRIPT world on named sites, through
# chrome.userScripts.register (Chrome 138+ per-extension "Allow user
# scripts" toggle, off by default). It is admitted for the SAME reason
# tabGroups was: what it is NOT is what makes it acceptable — it grants no
# new HOST access on its own (a registered script still runs only where
# its own match patterns say, no wider than any content script already
# could), and the Companion's OWN fill path never calls, awaits or reads a
# user script (no import from the engine/adapters/filler/review modules
# INTO the user-script module, and none the other way — a dedicated test
# proves both directions by scanning the source). A script the student
# wrote can do anything a script can do on a page it matches, including
# submit a form, which is exactly why the options page states, in one
# line, that the extension's own "never auto-submits" promise is true of
# the Companion, never of a script the student pasted here themselves.
FORBIDDEN_PERMISSIONS = {"debugger", "nativeMessaging"}
FULL_EXTRA_PERMISSIONS = ["notifications", "downloads"]
FULL_EXTRA_HOSTS = ["<all_urls>"]


def _build_src_bundles() -> None:
    """Bundle every migrated shipped file from its extension/src/ source
    (see extension/src/index.js) and overwrite the committed shipped
    file with the result, so the tree a developer loads unpacked and the
    server zips is always the current source's build output, never a stale
    copy someone forgot to rebuild.

    A shipped file's original `window.X = X` / `module.exports = {...}`
    footer (for the Node fixtures that `require()` a shipped file directly)
    is appended here, OUTSIDE the esbuild bundle, reading the names off
    globalThis the bundle itself set. It cannot be written as literal
    `module.exports = ...` source inside the bundled ES modules: esbuild
    reads that as a signal to wrap the whole bundle as a lazy CommonJS
    module, which stops its top-level globalThis assignments — the whole
    point of the bundle — from running eagerly when the shipped file is
    later injected as a classic script.
    """
    if not ENTRIES_FILE.is_file():
        return
    entries = load_entries()
    for shipped, cfg in entries.items():
        built = build_one(cfg["entry"], cfg.get("node_exports", []))
        (SRC / shipped).write_text(built, encoding="utf-8", newline="\n")
        print(f"src: built {shipped} from {cfg['entry']}")


def load_entries() -> dict:
    """extension/src/entries.json, minus its leading `_comment` key —
    shared by this script and tests/test_extension_build_no_drift.py so the
    two can never disagree about what a shipped file is built from."""
    data = json.loads(ENTRIES_FILE.read_text(encoding="utf-8"))
    out = {}
    for shipped, cfg in data.items():
        if shipped.startswith("_"):
            continue
        out[shipped] = cfg if isinstance(cfg, dict) else {"entry": cfg}
    return out


def build_one(entry_rel: str, node_exports: list[str]) -> str:
    """esbuild's bundle of one extension/src/ entry, plus its Node
    compatibility footer if it has one — the exact text scripts/
    build_extension.py writes into the shipped file, and the exact text
    tests/test_extension_build_no_drift.py checks the committed file
    against, from one function so the two can never drift from each other."""
    proc = subprocess.run(
        [
            str(ESBUILD),
            str(SRC / entry_rel),
            "--bundle",
            "--format=iife",
            "--platform=browser",
            "--charset=utf8",  # keep a literal glyph (e.g. the review screen's own
            # icon characters) as the real character in the output, not esbuild's
            # default \uXXXX escape — several pins scan the shipped file's text for
            # the exact glyph.
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if proc.returncode != 0:
        raise SystemExit(f"esbuild failed for {entry_rel}:\n{proc.stderr}")
    built = proc.stdout
    if not built.endswith("\n"):
        built += "\n"
    if node_exports:
        lines = ['if (typeof window !== "undefined") {']
        lines += [f"  window.{name} = globalThis.{name};" for name in node_exports]
        lines.append("}")
        lines.append('if (typeof module !== "undefined" && module.exports) {')
        lines.append("  module.exports = {")
        lines += [f"    {name}: globalThis.{name}," for name in node_exports]
        lines.append("  };")
        lines.append("}")
        built += "\n".join(lines) + "\n"
    return built


def _load_manifest() -> dict:
    return json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))


def _check(manifest: dict, build: str) -> None:
    perms = set(manifest.get("permissions", [])) | set(
        manifest.get("optional_permissions", [])
    )
    banned = perms & FORBIDDEN_PERMISSIONS
    if banned:
        raise SystemExit(f"{build}: forbidden permissions {sorted(banned)}")
    if build == "store" and "<all_urls>" in set(manifest.get("host_permissions", [])):
        raise SystemExit("store build must not request <all_urls>")


def _write_build(build: str, manifest: dict) -> Path:
    out = DIST / build
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(SRC, out, ignore=shutil.ignore_patterns("*.md"))
    (out / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    zip_path = DIST / f"youngnug-companion-{build}-{manifest['version']}.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(out.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(out))
    return zip_path


def main() -> int:
    _build_src_bundles()
    store = _load_manifest()
    _check(store, "store")

    full = _load_manifest()
    full["name"] = f"{full['name']} (Full)"
    full["version_name"] = f"{full['version']}-full"
    full["permissions"] = list(full.get("permissions", [])) + [
        p for p in FULL_EXTRA_PERMISSIONS if p not in full.get("permissions", [])
    ]
    full["host_permissions"] = list(full.get("host_permissions", [])) + [
        h for h in FULL_EXTRA_HOSTS if h not in full.get("host_permissions", [])
    ]
    _check(full, "full")

    for build, manifest in (("store", store), ("full", full)):
        zip_path = _write_build(build, manifest)
        try:
            shown = zip_path.relative_to(ROOT)
        except ValueError:  # DIST redirected outside the repo (tests do this)
            shown = zip_path
        print(f"{build}: {shown}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
