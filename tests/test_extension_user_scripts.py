"""User scripts (chrome.userScripts), and the isolation from the
Companion's own fill path that makes the risk acceptable.

A script the student pastes here runs in the USER_SCRIPT world on the
sites they named, and can do anything a script on that page can do —
including submit a form. The Companion's own "never auto-submits" promise
is a promise about the CODE THIS REPOSITORY SHIPS, so it must hold whether
or not this feature exists at all: nothing in the fill path (the engine,
the adapters, the review screen, the filler orchestration) may call,
await, import or even NAME anything from the user-script module, and the
user-script module must not import or reference anything from them either
— proved here by scanning the SOURCE, not by trusting a comment.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "extension" / "src"

FILL_PATH_DIRS = [
    SRC / "engine",
    SRC / "adapters",
    SRC / "filler",
    SRC / "ui" / "review_screen",
]

USER_SCRIPTS_DIR = SRC / "common" / "user_scripts"
USER_SCRIPTS_NAMES = re.compile(
    r"\b(YN_USER_SCRIPTS_KEY|YN_USER_SCRIPTS_MAX|YN_USER_SCRIPT_CODE_MAX_CHARS|"
    r"ynParseUserScriptMatches|ynValidateUserScript|ynUserScriptsToRegistrations|"
    r"ynRegisterAllUserScripts|userScripts\.register|userScripts\.unregister|"
    r"userScripts\.getScripts)\b"
)

# Names the fill-path modules are full of — if the user-script module ever
# references one of these, the "nothing of theirs" half of the isolation
# claim is false. A representative set, not exhaustive: these are the
# functions/classes an accidental import or bare-global call would most
# plausibly reach for.
FILL_PATH_NAMES = re.compile(
    r"\b(ynExecuteIntents|ynEngineProcessIntent|ynHeuristicIntents|"
    r"ynPlanRungs|ynShowReviewScreen|ynFillApplication|ynFillAnyPage|"
    r"YN_ADAPTERS|ynSubmitGuard|ynIsPaymentField)\b"
)


def _all_js_files(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*.js") if p.is_file())


def test_fill_path_never_references_the_user_scripts_module():
    offenders = []
    for d in FILL_PATH_DIRS:
        assert d.is_dir(), f"expected directory missing: {d}"
        for f in _all_js_files(d):
            src = f.read_text(encoding="utf-8")
            if "own_rules" in str(f):  # not a fill-path dir in practice, guard anyway
                continue
            m = USER_SCRIPTS_NAMES.search(src)
            if m:
                offenders.append(f"{f.relative_to(REPO)}: {m.group(0)}")
    assert not offenders, (
        "the fill path references the user-scripts module: " + "; ".join(offenders)
    )


def test_fill_path_never_imports_the_user_scripts_module():
    offenders = []
    for d in FILL_PATH_DIRS:
        for f in _all_js_files(d):
            src = f.read_text(encoding="utf-8")
            if re.search(r'import\s+.*from\s+["\'].*user_scripts', src):
                offenders.append(str(f.relative_to(REPO)))
    assert not offenders, "an import path names user_scripts: " + "; ".join(offenders)


def test_user_scripts_module_never_references_the_fill_path():
    assert USER_SCRIPTS_DIR.is_dir()
    offenders = []
    for f in _all_js_files(USER_SCRIPTS_DIR):
        src = f.read_text(encoding="utf-8")
        m = FILL_PATH_NAMES.search(src)
        if m:
            offenders.append(f"{f.relative_to(REPO)}: {m.group(0)}")
        if re.search(
            r'import\s+.*from\s+["\'].*(engine|adapters|filler|review_screen)',
            src,
        ):
            offenders.append(f"{f.relative_to(REPO)}: import of a fill-path module")
    assert not offenders, "the user-scripts module references the fill path: " + "; ".join(
        offenders
    )


def test_content_fill_scripts_list_never_injects_the_user_scripts_module():
    """The click-time fill stack (YN_FILL_SCRIPTS, popup.js) and the
    employer-posting stack (YN_POSTING_SCRIPTS) are what the fill path
    actually loads at runtime — neither may name common/user_scripts.js,
    or a bare-global call to it would silently work despite the source
    scan above finding no explicit reference."""
    popup_src = (REPO / "extension" / "popup.js").read_text(encoding="utf-8")
    assert '"common/user_scripts.js"' not in popup_src


def test_user_scripts_registration_is_shipped_and_isolated_by_layer():
    """The registration module sits in common/ (the layer every other
    module can be a bare global for) and is loaded ONLY by the background
    worker and the options page — both UI-layer, extension-page contexts,
    never a content script injected into a web page."""
    shipped = REPO / "extension" / "common" / "user_scripts.js"
    assert shipped.is_file()
    src = shipped.read_text(encoding="utf-8")
    for fn in (
        "ynValidateUserScript",
        "ynUserScriptsToRegistrations",
        "ynRegisterAllUserScripts",
    ):
        assert f"function {fn}(" in src

    background_src = (REPO / "extension" / "background.js").read_text(encoding="utf-8")
    assert '"common/user_scripts.js"' in background_src
    assert "ynRegisterAllUserScripts" in background_src


def test_user_scripts_ui_and_validation_via_node():
    proc = subprocess.run(
        ["node", str(REPO / "tests" / "ext_fixtures" / "run_user_scripts.mjs")],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=300,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "user scripts PASS" in proc.stdout


def test_manifest_requests_userscripts_permission():
    import json

    manifest = json.loads(
        (REPO / "extension" / "manifest.json").read_text(encoding="utf-8")
    )
    assert "userScripts" in manifest["permissions"]
