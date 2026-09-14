"""Every script the popup injects shares one global scope in the page, so two files
declaring the same top-level `const`, `let`, `class` or `function` throw a
SyntaxError at injection and nothing after the first file loads.

This happened once: two changes shipped the same question-family rule from two sides
of one contract, one in heuristics.js and one in filler.js, and the merged tree
loaded neither. The suite only saw it after the merge. This test sees it in the
tree: it parses YN_FILL_SCRIPTS from popup.js (the injection list itself, so a
new file cannot be forgotten) and refuses any identifier declared at top level in
more than one of those files. Function declarations are counted too, because a
duplicate `function` silently replaces the earlier one rather than throwing, which
is the quieter failure of the same shape.

A file esbuild has bundled from extension/src/ (see that folder's own
index.js) no longer has its names at column 0 — they are declared inside the
bundle's wrapping IIFE and only reach the shared scope via an explicit
`globalThis.NAME = ...` assignment the bundle's own entry writes. This test
reads the BUILT file either way: a plain top-level declaration for a file
esbuild has not touched, or a `globalThis.NAME =` assignment (at any
indentation) for one it has — the same duplicate-name check, over the same
shared scope, regardless of which shape produced a name.

One shape of repeat is deliberately NOT a collision: `var X = X || [];` (the
YN_ADAPTERS pattern in content/engine.js, present since before this module
tree existed) and its migrated-module equivalent `globalThis.X = typeof
globalThis.X !== "undefined" ? globalThis.X : [];` (every migrated adapter's
own entry — see extension/src/adapters/*/index.js) both mean "reuse the
array every earlier file already built, or start one if this is the first" —
the RHS reads the same name the LHS assigns. Unlike a real duplicate
declaration, this is safe to repeat in every file that shares the array on
purpose (every adapter self-registers into ONE shared YN_ADAPTERS this way,
by design — see extension/src/index.js), because a `var` redeclaration
never throws and a plain property assignment is never a "declared twice"
SyntaxError either way. A name is only flagged here when at least one of its
occurrences is NOT this self-referential guard shape — a plain `const X = 1`
in two files, or a `function X(){}` silently overriding another, still trips
it exactly as before.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"
POPUP = EXT / "popup.js"
TOP_LEVEL = re.compile(r"^(?:const|let|var|class|function|async function)\s+([A-Za-z_$][\w$]*)", re.M)
GLOBALTHIS_ASSIGN = re.compile(r"globalThis\.([A-Za-z_$][\w$]*)\s*=(?!=)")
# "reuse-or-init" guards: the RHS names the SAME identifier the LHS assigns,
# so declaring/assigning it again elsewhere can never clobber or duplicate-
# declare anything — see the module docstring.
GUARD_VAR = re.compile(
    r"^var\s+([A-Za-z_$][\w$]*)\s*=\s*(?:typeof\s+\1\s*!==\s*[\"']undefined[\"']\s*\?\s*\1\s*:|\1\s*\|\|)",
    re.M,
)
GUARD_GLOBALTHIS = re.compile(
    r"globalThis\.([A-Za-z_$][\w$]*)\s*=\s*typeof\s+globalThis\.\1\s*!==\s*[\"']undefined[\"']\s*\?\s*globalThis\.\1\s*:"
)


def injected_scripts() -> list[str]:
    src = POPUP.read_text(encoding="utf-8")
    # `const` or `var`: a shipped file esbuild has bundled from
    # extension/src/ always emits a top-level module binding as `var`,
    # whatever it was declared as in the source.
    m = re.search(r"(?:const|var)\s+YN_FILL_SCRIPTS\s*=\s*\[(.*?)\]", src, re.S)
    assert m, "YN_FILL_SCRIPTS not found in popup.js"
    files = re.findall(r'"([^"]+\.js)"', m.group(1))
    assert len(files) >= 20, f"suspiciously short injection list: {files}"
    return files


def _declared_names(text: str) -> set[str]:
    return set(TOP_LEVEL.findall(text)) | set(GLOBALTHIS_ASSIGN.findall(text))


def _guard_only_names(text: str) -> set[str]:
    """Names whose EVERY top-level/globalThis occurrence in this text is the
    safe reuse-or-init guard shape — never the real thing this test exists
    to catch, so a name declared this way in several files is not a dupe."""
    guarded = set(GUARD_VAR.findall(text)) | set(GUARD_GLOBALTHIS.findall(text))
    real = _declared_names(text) - guarded
    # A name occurring both guarded and un-guarded in the SAME file still
    # counts as a real declaration in that file (the un-guarded one is not a
    # reuse-or-init).
    return guarded - real


def test_no_top_level_identifier_is_declared_in_two_injected_scripts():
    seen: dict[str, list[str]] = {}
    guard_only: dict[str, list[str]] = {}
    for rel in injected_scripts():
        text = (EXT / rel).read_text(encoding="utf-8")
        for name in _declared_names(text):
            seen.setdefault(name, []).append(rel)
        for name in _guard_only_names(text):
            guard_only.setdefault(name, []).append(rel)
    dupes = {
        k: v
        for k, v in seen.items()
        if len(v) > 1 and set(v) != set(guard_only.get(k, []))
    }
    assert not dupes, "declared at top level in more than one injected script: " + "; ".join(
        f"{k} <- {', '.join(v)}" for k, v in sorted(dupes.items())
    )


def test_every_injected_script_exists_and_parses_alone():
    """A missing file in the list is the other quiet failure: chrome.scripting
    injects nothing and the popup reports a fill that never ran."""
    import subprocess

    for rel in injected_scripts():
        path = EXT / rel
        assert path.is_file(), f"{rel} is in YN_FILL_SCRIPTS but not in the tree"
        proc = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
        assert proc.returncode == 0, f"{rel} does not parse: {proc.stderr[:300]}"
