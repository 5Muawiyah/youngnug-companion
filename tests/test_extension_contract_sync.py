"""MESSAGE_CONTRACT.md used to name four fan-out hosts and two SERP
readers while the code already held nine of each. Hand-updating the document
every time a change adds a host or a reader is exactly the kind of promise
that quietly rots; this parses the
CODE (background.js's `YN_FANOUT_HOSTS`, capture.js's `ynSerpJobs()`) and the
DOCUMENT's own generated blocks, and fails the moment they disagree — never
a hard-coded count, so a later change can add a site without
ever touching this file.

The two document blocks are delimited by HTML-comment markers
(`<!-- BEGIN_FANOUT_HOSTS -->` / `<!-- BEGIN_SERP_READERS -->` and their
`END_` counterparts) precisely so the parse does not depend on Markdown
table formatting staying byte-identical — only on the markers themselves,
which the doc's own text tells a future editor never to remove.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"
BACKGROUND = EXT / "background.js"
CAPTURE = EXT / "content" / "capture.js"
CONTRACT = EXT / "MESSAGE_CONTRACT.md"


def _fanout_hosts_from_code() -> dict[str, str]:
    src = BACKGROUND.read_text(encoding="utf-8")
    m = re.search(r"const YN_FANOUT_HOSTS\s*=\s*\{(.*?)\n\s*\};", src, re.S)
    assert m, "YN_FANOUT_HOSTS not found in background.js — has it moved or been renamed?"
    # key: "value" pairs only — a `//` comment line inside the object never
    # matches this shape, so it is skipped without any special-casing.
    pairs = re.findall(r'^\s*(\w+):\s*"([^"]+)"\s*,?\s*$', m.group(1), re.M)
    assert len(pairs) >= 5, f"suspiciously few fan-out hosts parsed: {pairs}"
    return dict(pairs)


def _serp_readers_from_code() -> set[str]:
    src = CAPTURE.read_text(encoding="utf-8")
    m = re.search(r"function ynSerpJobs\(\)\s*\{(.*?)\n\}", src, re.S)
    assert m, "ynSerpJobs() not found in capture.js — has it moved or been renamed?"
    readers = set(re.findall(r"\b(yn[A-Za-z]+SerpJobs)\b", m.group(1)))
    readers.discard("ynSerpJobs")
    assert len(readers) >= 5, f"suspiciously few SERP readers parsed: {readers}"
    return readers


def _block(doc: str, begin: str, end: str) -> str:
    m = re.search(re.escape(begin) + r"(.*?)" + re.escape(end), doc, re.S)
    assert m, f"{begin} ... {end} block missing from MESSAGE_CONTRACT.md"
    return m.group(1)


def _fanout_hosts_from_doc() -> dict[str, str]:
    block = _block(
        CONTRACT.read_text(encoding="utf-8"),
        "<!-- BEGIN_FANOUT_HOSTS -->",
        "<!-- END_FANOUT_HOSTS -->",
    )
    rows = re.findall(r"\|\s*`([a-z_]+)`\s*\|\s*([^|\n]+?)\s*\|", block)
    out = {}
    for key, host in rows:
        # A row may carry a trailing note in parens (civil_service_jobs has
        # no reader) — strip it before comparing the host string itself.
        out[key] = re.sub(r"\s*\([^)]*\)\s*$", "", host).strip()
    assert len(out) >= 5, f"suspiciously few fan-out hosts parsed from the doc: {out}"
    return out


def _serp_readers_from_doc() -> set[str]:
    block = _block(
        CONTRACT.read_text(encoding="utf-8"),
        "<!-- BEGIN_SERP_READERS -->",
        "<!-- END_SERP_READERS -->",
    )
    fns = set(re.findall(r"`(yn[A-Za-z]+SerpJobs)`", block))
    assert len(fns) >= 5, f"suspiciously few SERP readers parsed from the doc: {fns}"
    return fns


def test_fanout_hosts_document_matches_code():
    code = _fanout_hosts_from_code()
    doc = _fanout_hosts_from_doc()
    assert set(code) == set(doc), (
        "MESSAGE_CONTRACT.md's fan-out host table has drifted from "
        f"background.js's YN_FANOUT_HOSTS.\n  code only: {set(code) - set(doc)}\n"
        f"  doc only:  {set(doc) - set(code)}"
    )
    mismatched = {k: (code[k], doc[k]) for k in code if code[k] != doc[k]}
    assert not mismatched, f"host string mismatch for: {mismatched}"


def test_serp_readers_document_matches_code():
    code = _serp_readers_from_code()
    doc = _serp_readers_from_doc()
    assert code == doc, (
        "MESSAGE_CONTRACT.md's SERP reader table has drifted from "
        f"capture.js's ynSerpJobs().\n  code only: {code - doc}\n"
        f"  doc only:  {doc - code}"
    )


def test_fanout_and_serp_reader_counts_are_read_from_code_not_hardcoded():
    """Pin the PARSE mechanics, not a count: this must keep passing however
    many hosts or readers the code ends up with (a later change may add
    either), so nothing here names a literal count."""
    code_hosts = _fanout_hosts_from_code()
    code_readers = _serp_readers_from_code()
    assert len(code_hosts) == len(_fanout_hosts_from_doc())
    assert len(code_readers) == len(_serp_readers_from_doc())
