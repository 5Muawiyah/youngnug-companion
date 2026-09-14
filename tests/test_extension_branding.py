"""The Companion wears the site's brand, and every pair it paints clears AA.

The site's own generator guarantees PROVENANCE: every hex in the
extension's generated block is a design-token value. What that does not
prove is that the pairs those values are combined into are READABLE — a
palette can be perfectly sourced and still put 3:1 text on a card.

So this file computes WCAG 2.1 contrast for every foreground/background pair
ext.css actually declares, from the live tokens.css. The rule when one fails
is fixed and one-directional: **the extension changes, not the token.** The
site's palette is shared with every other surface and is guarded by its own
contrast suite; a Companion rule is not allowed to force a change there.

The table below is maintained by hand because it encodes intent — which
colour sits on which surface — and that is exactly the thing a scraper would
get wrong. Add a rule to ext.css, add its pair here.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"

# The token generator and the design tokens it reads belong to the site,
# so the values are parsed straight out of ext.css's own
# GENERATED block instead — it already carries the fully-resolved literal
# value for every token this file's PAIRS table needs.
START = "/* GENERATED FROM the site's design tokens — do not hand-edit */"
END = "/* END GENERATED */"


def parse_tokens() -> dict[str, str]:
    """Every --token: value; declaration inside ext.css's own GENERATED
    block, already resolved to a literal value (no var() aliases survive
    into the generated output)."""
    css = (EXT / "ext.css").read_text(encoding="utf-8")
    start, end = css.find(START), css.find(END)
    assert start != -1 and end != -1 and end > start, "ext.css generated-block markers missing"
    block = css[start:end]
    decls: dict[str, str] = {}
    for name, value in re.findall(r"(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);", block):
        decls[name] = " ".join(value.split())
    return decls


# (what it is, foreground token, background token, bar)
#   4.5 = normal text            (WCAG 1.4.3 AA)
#   3.0 = >=18.66px bold text    (AA large) and non-text UI (1.4.11)
PAIRS = (
    ("brand wordmark 'Young' (19px/700)", "--primary", "--surface", 3.0),
    ("brand wordmark 'Nug' (19px/700)", "--accent-hover", "--surface", 3.0),
    ("brand sub-label", "--muted", "--surface", 4.5),
    ("connection dot, unconnected", "--warning", "--surface", 3.0),
    ("connection dot, connected", "--primary", "--surface", 3.0),
    ("body text", "--text", "--bg", 4.5),
    ("card text", "--text", "--surface", 4.5),
    ("muted text on a card", "--muted", "--surface", 4.5),
    ("muted text on the page", "--muted", "--bg", 4.5),
    ("connected status line", "--success", "--surface", 4.5),
    ("failed status line", "--danger", "--surface", 4.5),
    ("primary button label", "--primary-contrast", "--primary", 4.5),
    ("primary button, hovered", "--primary-contrast", "--primary-hover", 4.5),
    ("quiet button label", "--primary-hover", "--surface", 4.5),
    ("link", "--primary", "--surface", 4.5),
    ("fill report text", "--text", "--surface-sunken", 4.5),
    ("fill report system line", "--primary-hover", "--surface-sunken", 4.5),
    ("fill report 'check these'", "--warning", "--surface-sunken", 4.5),
    ("fill report 'could not read'", "--muted", "--surface-sunken", 4.5),
    ("fill report honesty line", "--primary-deep", "--surface-sunken", 4.5),
    ("advanced note text", "--text", "--warning-bg", 4.5),
    ("filled/total badge", "--primary-contrast", "--primary", 4.5),
    # The stop control and the warnings surface
    ("stop control, running", "--text", "--surface", 4.5),
    ("stop control state word, running", "--muted", "--surface", 4.5),
    ("stop control, STOPPED", "--primary-contrast", "--danger", 4.5),
    ("stop control border, running", "--muted", "--surface", 3.0),
    ("quiet button border", "--muted", "--surface", 3.0),
    ("text input border", "--muted", "--surface", 3.0),
    ("warnings surface text", "--text", "--warning-bg", 4.5),
    ("warnings surface heading", "--warning", "--warning-bg", 4.5),
    ("warnings surface border", "--warning", "--warning-bg", 3.0),
    ("options fact list", "--muted", "--surface", 4.5),
)


def _relative_luminance(hex_value: str) -> float:
    h = hex_value.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    parts = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in parts]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def _ratio(fg: str, bg: str) -> float:
    a, b = _relative_luminance(fg), _relative_luminance(bg)
    lighter, darker = (a, b) if a >= b else (b, a)
    return (lighter + 0.05) / (darker + 0.05)


def test_every_pair_the_companion_paints_clears_aa():
    decls = parse_tokens()
    failures = []
    for name, fg, bg, bar in PAIRS:
        assert fg in decls, f"{fg} is no longer a token — fix the pair table"
        assert bg in decls, f"{bg} is no longer a token — fix the pair table"
        ratio = _ratio(decls[fg], decls[bg])
        if ratio < bar:
            failures.append(
                f"{name}: {fg} {decls[fg]} on {bg} {decls[bg]} = "
                f"{ratio:.2f}:1 (needs {bar}:1)"
            )
    assert not failures, (
        "the Companion paints a pair that fails AA. The fix is in "
        "extension, NEVER in tokens.css — the site's palette is shared "
        "and has its own contrast suite:\n  " + "\n  ".join(failures)
    )


def test_the_refused_muted_grey_is_nowhere_in_the_extension():
    """#8a9a93 measures 2.95:1 on white. It was proposed as small muted text
    and refused; this keeps it from arriving through the Companion instead."""
    offenders = []
    for path in sorted(EXT.rglob("*")):
        if path.is_file() and path.suffix in (".js", ".css", ".html", ".json"):
            if "8a9a93" in path.read_text(encoding="utf-8").lower():
                offenders.append(str(path.relative_to(EXT)))
    assert not offenders, "the refused grey resurfaced in: " + "; ".join(offenders)


def test_the_mark_is_on_the_popup_and_the_options_page():
    """The lockup is the site's own: the icon file plus the wordmark as ONE
    text run, so the accessible name is exactly 'YoungNug' and never
    'Young Nug'."""
    for name in ("popup.html", "options.html"):
        html = (EXT / name).read_text(encoding="utf-8")
        assert 'class="brand"' in html, f"{name} lost the brand lockup"
        assert "icons/icon-48.png" in html, f"{name} lost the mark"
        assert 'Young<span class="brand-nug">Nug</span>' in html, (
            f"{name}: the wordmark must stay one text run"
        )
        assert 'alt=""' in html, (
            f"{name}: the icon is decorative beside the wordmark — an alt "
            "would make screen readers say the name twice"
        )
    # extension/icons/*.png is this repository's own source of truth for
    # the mark.


def test_the_extension_declares_no_font_or_colour_of_its_own():
    """Every hand-written rule references var(--*). A literal here is the
    start of a second palette, which is exactly how the extension ended up
    wearing the pre-rebrand teal."""
    css = (EXT / "ext.css").read_text(encoding="utf-8")
    hand_written = css.split(END, 1)[1]
    for pattern, what in (
        (r"#[0-9a-fA-F]{3,8}\b", "a hex colour"),
        (r"\brgb\(", "an rgb() colour"),
        (r"font-family:(?!\s*var\()", "a font stack"),
    ):
        found = re.findall(pattern, hand_written)
        assert not found, (
            f"hand-written ext.css declares {what}: {found[:5]} — use a token"
        )
