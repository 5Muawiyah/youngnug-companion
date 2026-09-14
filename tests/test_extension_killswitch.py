"""The stop controls: one large, obvious, LOCAL switch, plus a warnings
surface the platform can drive from the site.

The rule this file exists to hold: **a stop control that needs the network is
not a stop control.** The local kill switch is set, read and obeyed entirely
inside chrome.storage.local, and `ynApi` refuses before `fetch` is reached —
proved at runtime in run_killswitch.mjs with every fetch rejecting and the
calls counted.

Two stops, deliberately unequal, and the inequality is stated in the code
rather than glossed over:

  killSwitch  LOCAL and absolute. No server payload can clear it, and even
              the settings-sync exemption below re-checks it.
  serverStop  the platform's, cached from the per-user settings endpoint. A
              SOFT stop by construction — it can only arrive over the
              network. It is honest about that; a soft stop sold as a hard
              one is worse than no stop.

The presentation pins matter as much as the wiring: this was a checkbox in a
row of settings, which is the one thing the most important control in the
extension must not look like.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"
FIXTURES = REPO / "tests" / "ext_fixtures"
API = EXT / "common" / "api.js"
BACKGROUND = EXT / "background.js"
EXT_CSS = EXT / "ext.css"
POPUP_HTML = EXT / "popup.html"
OPTIONS_HTML = EXT / "options.html"
POPUP_JS = EXT / "popup.js"
OPTIONS_JS = EXT / "options.js"


def _function_body(text: str, after_marker: str) -> str:
    """The text of the function whose declaration text immediately follows
    `after_marker`, from its opening `{` to the matching closing `}` —
    found by counting brace depth rather than by a literal `\\n}` search, so
    this stays correct however the function is indented. A plain top-level
    file has its function's closing brace at column 0 (`\\n}`); a file
    esbuild has bundled from extension/src/ (see that folder's own
    index.js) wraps every function inside the bundle's own IIFE, so the SAME
    function's closing brace is indented instead — a literal `\\n}` search
    then runs past it and keeps going until the next accidental column-0
    brace (or the end of the file), silently capturing far more than the one
    function this test means to inspect."""
    rest = text.split(after_marker, 1)[1]
    # Skip the parameter list first (paren-balanced) — a default value like
    # `options = {}` puts a brace pair BEFORE the function's real body, which
    # a plain "first { after the marker" search would mistake for it.
    paren_start = rest.index("(")
    paren_depth = 0
    params_end = None
    for i in range(paren_start, len(rest)):
        if rest[i] == "(":
            paren_depth += 1
        elif rest[i] == ")":
            paren_depth -= 1
            if paren_depth == 0:
                params_end = i
                break
    assert params_end is not None, f"unbalanced parameter list after {after_marker!r}"
    start = rest.index("{", params_end)
    depth = 0
    for i in range(start, len(rest)):
        if rest[i] == "{":
            depth += 1
        elif rest[i] == "}":
            depth -= 1
            if depth == 0:
                return rest[start : i + 1]
    raise AssertionError(f"no matching closing brace found after {after_marker!r}")


def _own_closing_brace(text: str) -> str:
    """`text` up to (not including) the FIRST line that is only a closing
    brace at the SAME nesting depth text started at — i.e. the same thing
    `text.split("\n}")[0]` finds for a plain top-level function. A shipped
    file esbuild has bundled from extension/src/ (see that folder's own
    index.js) wraps every original top-level statement in one more level of
    nesting, shifting that brace from column 0 to a fixed 2-space indent, so
    both are accepted — whichever comes first closes the real function; the
    other level never occurs earlier, since a function's own body is never
    LESS indented than its declaration."""
    end = None
    for closer in ("\n}", "\n  }"):
        idx = text.find(closer)
        if idx != -1 and (end is None or idx < end):
            end = idx
    return text if end is None else text[:end]


def test_popup_kill_switch_states_render_in_jsdom():
    """Both rendered states of the ONE stop control (running, stopped, and
    back), against the real popup.html and popup.js under jsdom — not a
    text-scan of the source, an actual render and two real clicks."""
    proc = subprocess.run(
        ["node", str(FIXTURES / "run_killswitch_popup_states.mjs")],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=120,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "popup kill-switch states PASS" in proc.stdout


def test_stop_controls_behave_with_the_api_unreachable():
    """Every assertion in the harness runs with fetch rejecting on sight and
    the outbound calls counted, so a pass cannot be a network failure wearing
    a stop control's clothes."""
    proc = subprocess.run(
        ["node", str(FIXTURES / "run_killswitch.mjs")],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=300,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "stop controls PASS" in proc.stdout


def test_the_local_switch_is_checked_before_fetch_and_wins():
    api = API.read_text(encoding="utf-8")
    assert "async function ynStopReason" in api
    reason = _function_body(api, "async function ynStopReason")
    assert reason.index("s.killSwitch") < reason.index("s.serverStop"), (
        "the LOCAL switch must be answered first — nothing the server says "
        "may be consulted before it"
    )
    body = _function_body(api, "async function ynApi")
    assert body.index("ynStopReason") < body.index("await fetch("), (
        "the stop check must run BEFORE fetch, not depend on it failing"
    )
    assert "allowWhileServerStopped === true && !s.killSwitch" in api, (
        "the settings-sync exemption must re-check the local switch — "
        "otherwise 'nothing runs' quietly becomes 'nothing except this call'"
    )


def test_the_server_can_never_set_the_local_switch():
    """killSwitch is never part of what the worker caches from the server."""
    bg = BACKGROUND.read_text(encoding="utf-8")
    sync = _own_closing_brace(bg.split("async function ynSyncServerSettings")[1])
    assert "killSwitch" not in sync, (
        "the settings sync must never write killSwitch — the local switch is "
        "the student's, not the platform's"
    )
    api = API.read_text(encoding="utf-8")
    settings = _function_body(api, "async function ynSettings")
    srv = settings.split("const srv = s.serverSettings;")[1]
    assert "killSwitch" not in srv, (
        "the server-settings merge must not be able to touch killSwitch"
    )


def test_every_egress_point_obeys_the_stop():
    """Two raw fetches used to sit outside ynApi entirely (the GitHub import
    and the local model), so with the kill switch ON requests still left the
    machine. Each `fetch(` in the worker must have a stop check above it —
    the same tripwire shape as the never-submit click sweep, so a third
    ungated egress point cannot be added quietly."""
    lines = BACKGROUND.read_text(encoding="utf-8").splitlines()
    offenders = []
    for i, line in enumerate(lines):
        if not re.search(r"(?<![\w.])fetch\(", line):
            continue
        window = "\n".join(lines[max(0, i - 14) : i])
        if "ynStopReason" in window or "ynApi(" in window:
            continue
        offenders.append(f"background.js:{i + 1}: {line.strip()}")
    assert not offenders, (
        "ungated egress point(s) — a stop that stops most things is not a "
        "stop: " + "; ".join(offenders)
    )


def test_the_stop_is_a_large_control_not_a_checkbox_in_a_list():
    for path in (POPUP_HTML, OPTIONS_HTML):
        html = path.read_text(encoding="utf-8")
        assert 'id="kill"' in html, f"{path.name} lost the stop control"
        assert 'class="killswitch"' in html, (
            f"{path.name}: the stop must be the dedicated large control, not "
            "a row in a settings list"
        )
        assert 'role="switch"' in html and "aria-checked" in html, (
            f"{path.name}: the stop must still read as a toggle to assistive "
            "tech now that it is not a checkbox"
        )
        assert re.search(r'<input[^>]*id="kill"', html) is None, (
            f"{path.name}: the stop went back to being a bare checkbox"
        )
        assert "killswitch-ico" in html, f"{path.name}: the stop has no icon"


def test_the_stop_is_styled_from_tokens_only():
    css = EXT_CSS.read_text(encoding="utf-8")
    block = css.split(".killswitch {")[1].split("\n}")[0]
    assert "#" not in block, "the stop control must reference var(--*) only"
    assert "var(--" in block
    on = css.split('.killswitch[aria-checked="true"] {')[1].split("\n}")[0]
    assert "var(--danger)" in on, (
        "the ON state must be unmistakable — this is the control people look "
        "for when something is going wrong"
    )
    warn = css.split(".warn {")[1].split("\n}")[0]
    assert "#" not in warn and "var(--warning" in warn, (
        "the warnings surface must be amber, from tokens — red belongs to "
        "the stop alone"
    )


def test_the_warnings_surface_exists_and_is_driven_from_the_account():
    for path in (POPUP_HTML, OPTIONS_HTML):
        html = path.read_text(encoding="utf-8")
        assert 'id="warn"' in html, f"{path.name} has no warnings surface"
        assert 'role="status"' in html, (
            f"{path.name}: a warning that appears must be announced"
        )
        assert re.search(r'id="warn"[^>]*hidden', html), (
            f"{path.name}: the warnings surface must start hidden — a banner "
            "that is usually empty is a banner people stop reading"
        )
    popup = POPUP_JS.read_text(encoding="utf-8")
    assert "function ynPaintWarning" in popup
    assert "serverStop" in popup and "r.warning" in popup
    options = OPTIONS_JS.read_text(encoding="utf-8")
    assert "function paintWarning" in options
    assert "serverWarning" in options
    bg = BACKGROUND.read_text(encoding="utf-8")
    sync = _own_closing_brace(bg.split("async function ynSyncServerSettings")[1])
    assert "companion_stop" in sync and "companion_warning" in sync, (
        "the worker must read the account-level stop and warning off the "
        "existing per-user settings payload"
    )


def test_the_popup_stop_is_one_toggle_not_two_controls():
    """A later design change: one toggle switch, both directions, no
    separate 'Start again' button and no second 'Stopped' line — the same
    control the options page already used (paintKill there flips
    aria-checked and the one state word, nothing else). popup.js now reads
    the switch's own current aria-checked and flips it, exactly like
    options.js's handler, so the two pages behave identically."""
    for path in (POPUP_HTML, OPTIONS_HTML):
        html = path.read_text(encoding="utf-8")
        assert "kill-restart" not in html, (
            f"{path.name}: no separate restart control — the stop switch "
            "itself starts things again"
        )
        assert "Start again" not in html, (
            f"{path.name}: 'Start again' text is gone with the button"
        )
        assert html.count('class="killswitch"') == 1, (
            f"{path.name}: exactly one stop control"
        )

    popup = POPUP_JS.read_text(encoding="utf-8")
    assert "kill-restart" not in popup, "no restart handler left in popup.js"
    marker = '("kill").addEventListener("click"'
    assert marker in popup
    handler = popup[popup.index(marker) :]
    # See _own_closing_brace's note: a migrated shipped file shifts a
    # callback's closing "});" from column 0 to a fixed 2-space indent.
    closer = next(m for m in ("\n});", "\n  });") if m in handler)
    handler = handler[: handler.index(closer) + len(closer)]
    assert "getAttribute" in handler and "aria-checked" in handler, (
        "the toggle reads its own current state to decide which way to flip"
    )
    assert "killSwitch: true" not in handler and "killSwitch: false" not in handler, (
        "the handler writes whichever way the switch just moved, not a "
        "hardcoded direction"
    )


def test_setting_the_stop_touches_storage_only():
    """No worker message, no network — that is what makes it work offline."""
    for path in (POPUP_JS, OPTIONS_JS):
        src = path.read_text(encoding="utf-8")
        marker = '("kill").addEventListener("click"'
        assert marker in src, f"{path.name}: no click handler on the stop"
        handler = src[src.index(marker) :]
        # A migrated shipped file (see extension/src/index.js) wraps
        # every original top-level statement in esbuild's own IIFE, shifting
        # the callback's closing "});" from column 0 to a fixed 2-space
        # indent — both close the SAME callback, so either is accepted.
        end = None
        for closer in ("\n});", "\n  });"):
            idx = handler.find(closer)
            if idx != -1 and (end is None or idx < end):
                end = idx + len(closer)
        assert end is not None, f"{path.name}: the stop's click handler never closes"
        handler = handler[:end]
        assert "chrome.storage.local.set" in handler, (
            f"{path.name}: the stop must write straight to local storage"
        )
        assert "sendMessage" not in handler and "fetch(" not in handler, (
            f"{path.name}: the stop must not need the worker or the network"
        )
