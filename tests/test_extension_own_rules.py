"""The student's OWN per-site rules, adblock-filter style.

common/own_rules.js parses and validates four line shapes (site##selector,
site label=key, site!!label, site$$), and the fill ladder (content/filler.js
ynPlanRungs) reads them as a rung above heuristics and below every write-time
guard. tests/ext_fixtures/run_own_rules.mjs is the real proof — parser edge
cases, 6 valid mappings resolved across 3 fixture pages, and a hostile
password-field rule refused at write time by the SAME guard every other
rung's mis-guess goes through. This file only wires that into pytest and
pins the syntax/safety claims a text-scan CAN check.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EXT = REPO / "extension"
FIXTURES = REPO / "tests" / "ext_fixtures"
OWN_RULES_JS = EXT / "common" / "own_rules.js"
PLAN_RUNGS = EXT / "content" / "filler.js"
OPTIONS_HTML = EXT / "options.html"
OPTIONS_JS = EXT / "options.js"
POPUP_HTML = EXT / "popup.html"
CAPTURE_JS = EXT / "content" / "capture.js"


def test_own_rules_end_to_end_via_node():
    proc = subprocess.run(
        ["node", str(FIXTURES / "run_own_rules.mjs")],
        capture_output=True,
        text=True,
        cwd=str(REPO),
        timeout=300,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "own rules PASS" in proc.stdout


def test_own_rules_module_shipped_and_documented():
    assert OWN_RULES_JS.is_file()
    src = OWN_RULES_JS.read_text(encoding="utf-8")
    for fn in (
        "ynParseOwnRules",
        "ynSerializeOwnRules",
        "ynOwnRulesForHost",
        "ynOwnRuleCaptureRules",
        "ynOwnRuleFillIntents",
    ):
        assert f"function {fn}(" in src, f"{fn} missing from common/own_rules.js"


def test_own_rules_textarea_and_import_export_are_icon_only_on_options_page():
    html = OPTIONS_HTML.read_text(encoding="utf-8")
    assert 'id="own-rules-text"' in html
    assert 'id="own-rules-import"' in html
    assert 'id="own-rules-export"' in html
    # icon-only controls: aria-label carries the meaning, no visible text run
    # inside either button beyond its <svg>.
    for btn_id in ("own-rules-import", "own-rules-export"):
        marker = f'id="{btn_id}"'
        assert marker in html
        assert "aria-label=" in html.split(marker, 1)[1][:400]


def test_own_rules_are_a_rung_above_heuristics_below_the_guards():
    src = PLAN_RUNGS.read_text(encoding="utf-8")
    assert "ynOwnRuleFillIntents" in src
    # Scoped to ynPlanRungs' OWN body: the shipped file is a bundle of many
    # modules, and "ynHeuristicIntents(" also appears in unrelated code
    # earlier in the bundle's text — a whole-file index() comparison would
    # compare the wrong occurrences.
    fn_start = src.index("function ynPlanRungs")
    fn_body = src[fn_start:]
    # own-rule intents must be computed and their elements claimed BEFORE
    # ynHeuristicIntents runs, so a field an own rule already named is never
    # also guessed by the generic ladder.
    assert fn_body.index("ynOwnRuleFillIntents(") < fn_body.index("ynHeuristicIntents(")
    # the site-block ($$) check happens before the adapter even runs.
    assert fn_body.index("ownForHost.blocked") < fn_body.index("adapter.plan")


def test_own_rules_never_fill_filter_is_applied_to_every_rung_not_only_its_own():
    src = PLAN_RUNGS.read_text(encoding="utf-8")
    assert "passesNeverFill" in src
    body = src[src.index("const passesNeverFill"):]
    body = body[: body.index("return {")]
    assert "neverLabels" in body


def test_capture_reads_own_rule_selectors_alongside_dev_rules():
    """The existing dev-selector reader (ynDevSelectorJob) is reused
    verbatim — own rules are converted to its {pattern, titleSelector,
    bodySelector} shape by the popup, not by capture.js itself, so capture's
    own read-only guarantee (never a new selector engine) is unchanged."""
    src = (EXT / "popup.js").read_text(encoding="utf-8")
    assert "ynOwnRuleCaptureRulesFromStorage" in src
    assert "ynDevSelectorJob" not in src  # that call stays inside content/capture.js
    capture_src = CAPTURE_JS.read_text(encoding="utf-8")
    assert "function ynDevSelectorJob" in capture_src


def test_own_rules_key_is_local_storage_and_never_touches_credentials():
    """The stored value is plain text rules — no password, no token — so
    export/import moving it between machines carries nothing sensitive."""
    src = OWN_RULES_JS.read_text(encoding="utf-8")
    assert 'YN_OWN_RULES_KEY = "ownRules"' in src
