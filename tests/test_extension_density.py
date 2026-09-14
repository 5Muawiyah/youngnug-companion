"""The density policy — a chrome string stays under 25 words, and a
screen's chrome prose stays under 80 — had never been enforced on the
extension's own chrome: popup.html and options.html, and the
status/hint/consent strings in popup.js and options.js. A re-measurement of
the four strings first flagged for this cleanup found the citation wrong
twice (two of the four were already under 25; the real offenders were the
two confirm() dialogs) and the numbers here are re-derived rather than
taken on trust.

TAG-STRIP METHOD (matching the web app's own density check, adapted for
plain HTML/JS rather than JSX): strip <script>/<style>/comment blocks, strip every remaining tag,
decode the handful of named entities this codebase actually uses, collapse
whitespace, then count whitespace-separated tokens that contain at least
one letter or digit (a bare "-" or "." is not a word a reader counts).

TWO checks:
  A — 25 words per STRING. Applies to every HTML text run and every
      aria-label/title attribute in popup.html and options.html, AND every
      "chrome string" in popup.js and options.js — a string literal, or a
      chain of literals joined by `+` on adjacent lines (this codebase's
      own line-wrapping convention for a long message), that appears as a
      confirm()/alert() argument, a .textContent assignment, or a bare
      `return "..."` — the three shapes every status/hint/consent string in
      these two files actually takes.
  B — 80 words per PAGE. Applies to popup.html's and options.html's own
      BODY text (the tag-strip count over <body>...</body> only — a
      <title> is never painted on the page a student is looking at, so it
      is excluded here; an earlier whole-file count of 108/57 included it,
      recorded as such wherever this cleanup's word counts are written up).
      JS files carry no single "page" total: only one status message is
      ever on screen at a time, so summing every possible one across every
      code path is not a real on-screen word count (the frontend's own
      density guard makes the same call for its scoped screens, for the
      same reason).
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"
POPUP_HTML = EXT / "popup.html"
OPTIONS_HTML = EXT / "options.html"
POPUP_JS = EXT / "popup.js"
OPTIONS_JS = EXT / "options.js"

MAX_STRING_WORDS = 25
MAX_PAGE_WORDS = 80

_ENTITIES = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&mdash;": " ", "&hellip;": "…"}


def word_count(text: str) -> int:
    for ent, rep in _ENTITIES.items():
        text = text.replace(ent, rep)
    text = re.sub(r"&[a-zA-Z]+;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return 0
    return sum(1 for tok in text.split(" ") if re.search(r"[A-Za-z0-9]", tok))


# ---------------------------------------------------------------------- #
# HTML: page budget (body only) + per-string budget (text runs + labels)
# ---------------------------------------------------------------------- #


def html_body(path: Path) -> str:
    html = path.read_text(encoding="utf-8")
    m = re.search(r"<body[^>]*>(.*)</body>", html, re.S | re.I)
    body = m.group(1) if m else html
    body = re.sub(r"<script\b[^>]*>.*?</script>", " ", body, flags=re.S | re.I)
    body = re.sub(r"<style\b[^>]*>.*?</style>", " ", body, flags=re.S | re.I)
    body = re.sub(r"<!--.*?-->", " ", body, flags=re.S)
    return body


def html_text_runs(body: str) -> list[str]:
    """Every run of text BETWEEN tags — the tag-strip method's unit of a
    'string' for HTML: each is what a reader would see as one phrase."""
    return [p for p in re.split(r"<[^>]+>", body) if word_count(p) > 0]


def html_label_attrs(body: str) -> list[str]:
    """aria-label and title attribute values: read by assistive tech and on
    hover, so they carry the same 25-word budget as visible text."""
    return re.findall(r'(?:aria-label|title)\s*=\s*"([^"]*)"', body)


def html_page_word_count(path: Path) -> int:
    return sum(word_count(r) for r in html_text_runs(html_body(path)))


def test_html_body_word_count_scanner_finds_real_text():
    """A regex that silently matches nothing must fail loudly,
    not pass green having scanned an empty page."""
    runs = html_text_runs(html_body(POPUP_HTML))
    assert len(runs) >= 10, f"suspiciously few text runs found: {runs}"
    assert any("Save job" in r for r in runs) or any(
        "Options" in r for r in html_text_runs(html_body(OPTIONS_HTML))
    )


def test_popup_html_page_budget():
    n = html_page_word_count(POPUP_HTML)
    assert n <= MAX_PAGE_WORDS, f"popup.html body text is {n} words, budget is {MAX_PAGE_WORDS}"


def test_options_html_page_budget():
    """This page measured 108 words (105 body-only, this file's own
    method) before it was cut; this test only enforces the ceiling going
    forward."""
    n = html_page_word_count(OPTIONS_HTML)
    assert n <= MAX_PAGE_WORDS, f"options.html body text is {n} words, budget is {MAX_PAGE_WORDS}"


def test_every_html_text_run_and_label_stays_under_25_words():
    for path in (POPUP_HTML, OPTIONS_HTML):
        body = html_body(path)
        for run in html_text_runs(body):
            n = word_count(run)
            assert n <= MAX_STRING_WORDS, (
                f"{path.name}: a text run is {n} words (over {MAX_STRING_WORDS}): {run!r}"
            )
        for label in html_label_attrs(body):
            n = word_count(label)
            assert n <= MAX_STRING_WORDS, (
                f"{path.name}: an aria-label/title is {n} words (over {MAX_STRING_WORDS}): {label!r}"
            )


# ---------------------------------------------------------------------- #
# JS: chrome strings — confirm()/alert() arguments, .textContent
# assignments, and bare `return "..."` statements, each possibly a chain
# of "..."+"..." literals across adjacent lines (this codebase's own
# line-wrap convention for a long message).
# ---------------------------------------------------------------------- #

_STR = r'"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'|`(?:[^`\\]|\\.)*`'
_CHAIN_RE = re.compile(rf"({_STR})(?:\s*\+\s*({_STR}))*")
_TRIGGER_RE = re.compile(
    r"(?:\.textContent\s*=\s*|confirm\(\s*|alert\(\s*|return\s*\(?\s*)(" + _STR + r")",
)


def _decode_js_string(lit: str) -> str:
    quote = lit[0]
    inner = lit[1:-1]
    inner = inner.replace(r"\n", " ").replace(r"\t", " ").replace(r"\"", '"').replace(r"\'", "'")
    if quote == "`":
        # ${...} interpolation contributes no literal words — replace with a
        # single space so surrounding text does not glue together, mirroring
        # the frontend guard's own treatment of a JSX `{...}` expression.
        inner = re.sub(r"\$\{[^}]*\}", " ", inner)
    return inner


def js_chrome_strings(src: str) -> list[str]:
    """Every chain of concatenated literals that starts right after a
    confirm(/alert(/`.textContent =`/`return`. Extraction is intentionally
    literal-only: a `+ someVariable +` in the middle breaks the regex chain
    (it only matches STR (+ STR)*), so a chain split by an interpolated
    value under-counts rather than over-counts — safe for a MAXIMUM-words
    check, never hides a real 25+-word violation made of literals alone.

    Known gap, left as a documented scope choice rather than a silent one:
    a ternary's two branches (`cond ? "a" : "b"`) are not matched, because
    the trigger requires the literal to sit directly after the assignment,
    not after `?`/`:` — options.js's assist-coverage line is one such
    string (12 words; verified under budget by hand, not by this scanner).
    Widening the trigger to `?`/`:` would also match every `type: "..."`
    message-shape key in both files, which is harmless for a MAXIMUM check
    (those are always short) but was left out to keep false positives out
    of the "how many chrome strings did this find" sanity count below."""
    out = []
    for m in _TRIGGER_RE.finditer(src):
        start = m.start(1)
        chain_m = _CHAIN_RE.match(src, start)
        if not chain_m:
            continue
        literals = re.findall(_STR, chain_m.group(0))
        text = "".join(_decode_js_string(lit) for lit in literals)
        if word_count(text) > 0:
            out.append(text)
    return out


def test_js_chrome_string_scanner_finds_real_strings():
    strings = js_chrome_strings(POPUP_JS.read_text(encoding="utf-8"))
    assert len(strings) >= 15, f"suspiciously few chrome strings found: {len(strings)}"
    assert any("YoungNug" in s for s in strings)


def test_every_popup_js_chrome_string_stays_under_25_words():
    src = POPUP_JS.read_text(encoding="utf-8")
    offenders = [(word_count(s), s) for s in js_chrome_strings(src) if word_count(s) > MAX_STRING_WORDS]
    assert not offenders, "over-budget popup.js strings:\n" + "\n".join(
        f"  {n} words: {s!r}" for n, s in offenders
    )


def test_every_options_js_chrome_string_stays_under_25_words():
    src = OPTIONS_JS.read_text(encoding="utf-8")
    offenders = [(word_count(s), s) for s in js_chrome_strings(src) if word_count(s) > MAX_STRING_WORDS]
    assert not offenders, "over-budget options.js strings:\n" + "\n".join(
        f"  {n} words: {s!r}" for n, s in offenders
    )


def test_the_four_previously_cited_strings_are_now_in_budget():
    """Pins the FOUR strings first flagged as too long — two already under
    25 (that flag was wrong about them; left unchanged here) and two real
    offenders (401 hint, capture-refused message) that are now cut. Plus
    the two confirm() dialogs, the real 47- and 39-word offenders a fresh
    measurement found."""
    src = POPUP_JS.read_text(encoding="utf-8")
    assert "Your saved connection expired or was replaced" in src
    assert "Chrome blocks extensions on its own pages" in src
    assert "Read locally, staged for review" in src
    assert "Flagged for review; nothing appears" in src
    for s in js_chrome_strings(src):
        if "saved connection" in s or "Chrome blocks extensions" in s:
            assert word_count(s) <= MAX_STRING_WORDS, s


# ---------------------------------------------------------------------- #
# content/review_screen.js — the on-page review surface. Its
# static chrome arrives in a DIFFERENT shape from popup.js and options.js
# (which almost always assign to .textContent or return a template): every
# literal there is a direct `return "...";`, a direct `X.textContent =
# "...";`, or a direct `X.setAttribute("aria-label", "...")` — see the
# file's own banner comment for why it is written that way. A row's own
# label/value (a profile fact, a drafted answer) is always assigned from a
# VARIABLE at those same call shapes, never a literal, so it can never be
# swept up here — it is the student's own content, not chrome.
# ---------------------------------------------------------------------- #

REVIEW_SCREEN_JS = EXT / "content" / "review_screen.js"

_REVIEW_TRIGGER_RE = re.compile(
    r"(?:\.textContent\s*=\s*|return\s+"
    r"|setAttribute\(\s*[\"']aria-label[\"']\s*,\s*"
    # ynReviewIconBtn(theme, "action", "aria label text", "glyph") — the
    # one helper that builds every icon-only control, so its 3rd argument
    # (the aria-label) is a chrome string by the same rule as a direct
    # setAttribute call would be. _STR must stay wrapped in its OWN
    # non-capturing group here: it carries top-level `|` alternatives of
    # its own (double/single/backtick-quoted), and splicing it in
    # unwrapped mid-pattern (unlike appending it once at the very end, as
    # the trigger regex above this one does) would leak those into this
    # group's own alternation.
    r"|ynReviewIconBtn\(\s*\w+\s*,\s*(?:" + _STR + r")\s*,\s*)(" + _STR + r")",
)


def js_review_screen_strings(src: str) -> list[str]:
    out = []
    for m in _REVIEW_TRIGGER_RE.finditer(src):
        start = m.start(1)
        chain_m = _CHAIN_RE.match(src, start)
        if not chain_m:
            continue
        literals = re.findall(_STR, chain_m.group(0))
        text = "".join(_decode_js_string(lit) for lit in literals)
        if word_count(text) > 0:
            out.append(text)
    return out


def test_review_screen_string_scanner_finds_real_strings():
    """Again: a scanner that silently matches nothing must
    fail loudly, not pass green having scanned an empty file."""
    strings = js_review_screen_strings(REVIEW_SCREEN_JS.read_text(encoding="utf-8"))
    assert len(strings) >= 8, f"suspiciously few chrome strings found: {len(strings)}"
    assert any("Approve" in s for s in strings)


def test_every_review_screen_string_stays_under_25_words():
    src = REVIEW_SCREEN_JS.read_text(encoding="utf-8")
    offenders = [
        (word_count(s), s)
        for s in js_review_screen_strings(src)
        if word_count(s) > MAX_STRING_WORDS
    ]
    assert not offenders, "over-budget review_screen.js strings:\n" + "\n".join(
        f"  {n} words: {s!r}" for n, s in offenders
    )


def test_review_screen_total_chrome_stays_under_80_words():
    """review_screen.js is ONE dedicated screen (unlike popup.js and
    options.js, which carry many alternative status lines only one of
    which is ever on screen at once) — summing every DISTINCT chrome
    string in the file is the screen's real total, the same call the
    frontend's own density guard makes for a single-purpose screen.
    `set()` avoids double-counting a label written once in source but used
    as both an aria-label and, on a hover title, a duplicate — a reader
    only ever meets one at a time."""
    src = REVIEW_SCREEN_JS.read_text(encoding="utf-8")
    n = sum(word_count(s) for s in set(js_review_screen_strings(src)))
    assert n <= MAX_PAGE_WORDS, (
        f"review_screen.js chrome is {n} words, budget is {MAX_PAGE_WORDS}"
    )


def test_review_screen_controls_are_icon_only_with_aria_labels():
    """Icon-only for approve/edit/skip/cancel, per the project's UI-copy
    rule (label moves to aria-label): every control's VISIBLE glyph is a single
    symbol carrying no letters/digits (word_count treats it as zero chrome
    words), and the descriptive text lives only in its aria-label."""
    src = REVIEW_SCREEN_JS.read_text(encoding="utf-8")
    for label in ("Approve and fill", "Cancel, write nothing", "Keep this answer",
                  "Edit this answer", "Skip this answer"):
        assert f'"{label}"' in src, f"expected aria-label {label!r} in review_screen.js"
    for glyph in ("✓", "✎", "✕"):
        assert glyph in src, f"expected the icon glyph {glyph!r} in review_screen.js"
        assert word_count(glyph) == 0, f"{glyph!r} should carry no chrome words"
