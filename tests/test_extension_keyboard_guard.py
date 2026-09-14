"""Frozen guarantee: extension/content and extension/common carry
NO KeyboardEvent construction except two deliberately narrow rows —

  * content/aria_driver.js: ArrowDown / Alt+ArrowDown only,
    to escalate opening a popup that a pointer gesture alone did not open.
  * content/dom_fill_kit.js: a narrow per-character second
    pass, printable characters only, used only after a failed immediate
    readback.

Previously `grep -rn KeyboardEvent extension/content
extension/common` was 0. Any THIRD site introducing a KeyboardEvent is
a new, unreviewed keyboard path and must fail here rather than pass
silently — a guard is only real once it can name the violation it exists
to catch, not merely count sites two known files already have.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CONTENT_DIR = REPO / "extension" / "content"
COMMON_DIR = REPO / "extension" / "common"

ALLOWED_FILES = {
    CONTENT_DIR / "aria_driver.js",
    CONTENT_DIR / "dom_fill_kit.js",
}

FORBIDDEN_KEY_LITERALS = ['"Enter"', '"Tab"', '"Escape"']


def _js_files():
    for base in (CONTENT_DIR, COMMON_DIR):
        if base.is_dir():
            yield from sorted(base.rglob("*.js"))


def _keyboard_event_sites():
    sites = []
    for f in _js_files():
        text = f.read_text(encoding="utf-8")
        for i, line in enumerate(text.splitlines(), start=1):
            if "new KeyboardEvent(" in line:
                sites.append((f, i, line.strip()))
    return sites


def test_keyboard_event_construction_is_limited_to_the_two_allowed_files():
    offenders = [
        (str(f.relative_to(REPO)), i, line)
        for f, i, line in _keyboard_event_sites()
        if f not in ALLOWED_FILES
    ]
    assert not offenders, (
        "unreviewed KeyboardEvent construction outside the two rows this "
        "run allows (aria_driver.js, dom_fill_kit.js): " + repr(offenders)
    )
    # And the two allowed files really do each construct at least one —
    # this guard is worthless if it is quietly checking an empty set.
    found = {f for f, _, _ in _keyboard_event_sites()}
    assert CONTENT_DIR / "aria_driver.js" in found
    assert CONTENT_DIR / "dom_fill_kit.js" in found


def test_neither_allowed_file_ever_names_a_forbidden_key_literal():
    for path in ALLOWED_FILES:
        src = path.read_text(encoding="utf-8")
        for forbidden in FORBIDDEN_KEY_LITERALS:
            assert forbidden not in src, (
                f"{path.name} contains the forbidden key literal {forbidden}"
            )


def test_aria_driver_key_dispatch_is_arrowdown_only():
    src = (CONTENT_DIR / "aria_driver.js").read_text(encoding="utf-8")
    # Every keydown/keyup this file constructs goes through ynAriaPressKey,
    # whose only caller passes YN_ARIA_OPEN_KEYS entries — both "ArrowDown".
    open_keys = re.findall(r'key:\s*"([^"]+)"', src)
    assert open_keys, "expected at least one literal key name in aria_driver.js"
    assert set(open_keys) == {"ArrowDown"}, (
        f"aria_driver.js names a key other than ArrowDown: {set(open_keys)}"
    )


def test_dom_fill_kit_type_per_char_never_dispatches_a_literal_space_key():
    src = (CONTENT_DIR / "dom_fill_kit.js").read_text(encoding="utf-8")
    # The per-character writer's own guard: a space character is applied
    # through the native setter + InputEvent alone, with no KeyboardEvent at
    # all for that character — this pins the `isSpace` branch staying in
    # place rather than a future edit dispatching keydown/keyup for every
    # character unconditionally.
    assert "isSpace" in src, "expected the space-character carve-out to still exist"
    assert re.search(r"if\s*\(!isSpace\)\s*\{", src), (
        "expected keydown/keyup to be conditioned on !isSpace"
    )
