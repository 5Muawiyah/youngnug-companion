"""Product copy in the Companion: British English, and no em-dash in a RENDERED
string. Comments are exempt under the project copy rule, so the check reads quoted literals only.

This is the guard for the rule, not a sentence about it: a rendered string with an
em-dash fails the build with its file:line. The classifier is deliberately simple
and errs towards reporting: a line whose stripped form starts a comment is skipped;
otherwise any em-dash inside a quoted or template literal on that line counts.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"
EM_DASH = "—"
QUOTED_EM = re.compile(r"[\"'`][^\"'`]*" + EM_DASH)


def rendered_em_dash_lines() -> list[str]:
    hits: list[str] = []
    files = sorted(EXT.rglob("*.js")) + sorted(EXT.glob("*.html"))
    for f in files:
        if "vendor" in f.parts or "node_modules" in f.parts:
            continue
        for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if EM_DASH not in line:
                continue
            s = line.strip()
            if s.startswith("//") or s.startswith("*") or s.startswith("/*"):
                continue
            code = re.sub(r"//.*$", "", line)
            if EM_DASH in code and QUOTED_EM.search(code):
                hits.append(f"{f.relative_to(REPO).as_posix()}:{i}")
    return hits


def test_no_em_dash_in_any_rendered_string():
    hits = rendered_em_dash_lines()
    assert not hits, "em-dash in a rendered string (comments are exempt): " + ", ".join(hits)


AMERICAN = re.compile(
    r"\b(color|favorite|organi[sz]ation|customi[sz]e|analy[sz]e|center|behavior|catalog)\b"
)
BRITISH_FORMS = {
    "color": "colour",
    "favorite": "favourite",
    "organization": "organisation",
    "customize": "customise",
    "analyze": "analyse",
    "center": "centre",
    "behavior": "behaviour",
    "catalog": "catalogue",
}


def test_rendered_strings_use_british_spellings():
    """Only the American forms are refused; CSS property names (color:) sit in
    ext.css and style attributes, which this test does not read."""
    hits: list[str] = []
    # Matching vocabulary is not copy: the label heuristics and the label-quality
    # gate list BOTH spellings on purpose so an American form's label still matches.
    # heuristics.js's autocomplete-token map (the source of the American forms)
    # now lives in extension/src/engine/heuristics/patterns.js, built back
    # into the still-exempt shipped content/heuristics.js below — both need the
    # exemption, the built file because it is the same map, the source file
    # because it is where the map now actually lives.
    vocabulary = {
        EXT / "content" / "heuristics.js",
        EXT / "common" / "label_quality.js",
        EXT / "src" / "engine" / "heuristics" / "patterns.js",
    }
    for f in sorted(EXT.rglob("*.js")) + sorted(EXT.glob("*.html")):
        if "vendor" in f.parts or f in vocabulary:
            continue
        for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            s = line.strip()
            if s.startswith("//") or s.startswith("*") or s.startswith("/*"):
                continue
            code = re.sub(r"//.*$", "", line)
            for m in re.finditer(r"[\"'`]([^\"'`]{4,})[\"'`]", code):
                literal = m.group(1)
                if "style" in code or "color:" in literal or "text-align:" in literal:
                    continue
                for w in AMERICAN.findall(literal):
                    if w.lower() in BRITISH_FORMS:
                        hits.append(f"{f.relative_to(REPO).as_posix()}:{i} {w!r} -> {BRITISH_FORMS[w.lower()]!r}")
    assert not hits, "American spelling in a rendered string: " + "; ".join(hits)
