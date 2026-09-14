"""extension/src holds the Companion's ES module SOURCE for whichever
shipped files have been migrated off one big classic script (see
extension/src/index.js for the full story and the layer table). Each
migrated shipped file gets its own folder here, one layer down from src/,
and esbuild bundles that folder alone into the shipped output — a shipped
file's source is never split across a boundary, and never reaches into
another shipped file's folder.

The layer table (top of extension/src/index.js):

    common < kit < engine < adapters < filler < ui

is the direction a real dependency is allowed to run in conceptually. In
practice this codebase enforces something stronger and easier to check: NO
import ever crosses from one shipped file's folder into another's, at all
(cross-file calls stay bare-global calls at runtime, resolved after esbuild
has run, exactly as they were before this refactor). Since every import that
exists is therefore inside one folder, and one folder is one layer, no
import can ever run backwards against the table above either — refusing a
cross-folder import IS refusing anything against the direction. This test
also refuses an import cycle among the files that remain in one folder,
which the "no cross-folder" rule alone would not catch.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "extension" / "src"

# The layer table, restated as data so the test can check a folder is
# actually inside a known layer (a typo'd or forgotten layer folder should
# fail loudly, not be silently ignored).
LAYERS = ["common", "kit", "engine", "adapters", "filler", "ui"]

IMPORT_RE = re.compile(
    r"""(?:import\s+(?:[\w${},\s*]+\s+from\s+)?|export\s+[\w${},\s*]+\s+from\s+|import\s*\()\s*['"](\.[^'"]+)['"]"""
)


def _source_files() -> list[Path]:
    if not SRC.is_dir():
        return []
    return sorted(p for p in SRC.rglob("*.js") if p.is_file())


def _folder_of(path: Path) -> Path | None:
    """The shipped-file folder a source file belongs to: src/<layer>/<name>/...
    Files directly under src/ (like index.js) belong to no bundle folder."""
    rel = path.relative_to(SRC)
    parts = rel.parts
    if len(parts) < 3:
        return None
    layer = parts[0]
    if layer not in LAYERS:
        raise AssertionError(
            f"{rel.as_posix()} sits under an unlisted layer '{layer}' — "
            f"add it to LAYERS in this test and to the table in "
            f"extension/src/index.js, in the same commit"
        )
    return SRC / parts[0] / parts[1]


def _imports_of(path: Path) -> list[Path]:
    text = path.read_text(encoding="utf-8")
    targets = []
    for rel in IMPORT_RE.findall(text):
        resolved = (path.parent / rel).resolve()
        for candidate in (resolved, resolved.with_suffix(".js")):
            if candidate.is_file():
                targets.append(candidate)
                break
        else:
            raise AssertionError(f"{path}: import target '{rel}' does not resolve to a file")
    return targets


def test_no_import_crosses_a_shipped_files_own_folder():
    files = _source_files()
    if not files:
        return  # nothing migrated yet
    violations = []
    for f in files:
        home = _folder_of(f)
        if home is None:
            continue
        for target in _imports_of(f):
            target_home = _folder_of(target)
            if target_home != home:
                violations.append(f"{f.relative_to(SRC)} -> {target.relative_to(SRC)}")
    assert not violations, "import crosses a shipped file's own source folder: " + "; ".join(violations)


def test_no_import_cycle_within_one_folder():
    files = _source_files()
    graph: dict[Path, list[Path]] = {}
    for f in files:
        if _folder_of(f) is None:
            continue
        graph[f] = [t for t in _imports_of(f) if _folder_of(t) == _folder_of(f)]

    WHITE, GREY, BLACK = 0, 1, 2
    color = {f: WHITE for f in graph}
    stack: list[Path] = []

    def visit(node: Path):
        color[node] = GREY
        stack.append(node)
        for nxt in graph.get(node, []):
            if color.get(nxt) == GREY:
                cycle = " -> ".join(p.relative_to(SRC).as_posix() for p in stack + [nxt])
                raise AssertionError(f"import cycle: {cycle}")
            if color.get(nxt, WHITE) == WHITE:
                visit(nxt)
        stack.pop()
        color[node] = BLACK

    for node in graph:
        if color[node] == WHITE:
            visit(node)


def test_every_module_is_at_most_400_lines():
    offenders = []
    for f in _source_files():
        n = len(f.read_text(encoding="utf-8").splitlines())
        if n > 400:
            offenders.append(f"{f.relative_to(SRC)} ({n} lines)")
    assert not offenders, "module(s) over the 400-line limit: " + "; ".join(offenders)
