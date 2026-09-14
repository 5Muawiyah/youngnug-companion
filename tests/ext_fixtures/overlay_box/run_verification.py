"""Verify the fill overlay's shadow-root isolation, close/dismiss behaviour,
and bottom-bar collision avoidance across three ATS-style fixtures (Oracle,
Greenhouse, Workday) at 1440 and 390, collapsed / expanded / closed.

These are REPRESENTATIVE fixtures, not captures of the live authenticated
pages (no credentialed access to Oracle HCM, Greenhouse or Workday from
wherever this runs). The Oracle-style fixture's aggressive
`div,span,button{...!important}` rule is a representative reconstruction of
the class of global, unscoped rule Oracle Cloud/JET is known to ship, not a
literal copy of Oracle's own stylesheet — the diagnosis it demonstrates
(a closed shadow root is immune to ANY such rule) does not depend on the
exact selector list a real page happens to use.

Run: python tests/ext_fixtures/overlay_box/run_verification.py
Screenshots and the raw results JSON are written to the output directory
below (override with the OVERLAY_VERIFY_OUT_DIR environment variable to
send them somewhere outside the repo).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[3]
EXT = REPO / "extension"
FIXTURES_DIR = REPO / "tests" / "ext_fixtures" / "overlay_box"
SHOTS = Path(os.environ.get("OVERLAY_VERIFY_OUT_DIR", FIXTURES_DIR / "verification_output"))
SHOTS.mkdir(parents=True, exist_ok=True)

THEME_JS = (EXT / "common" / "yn_theme.js").read_text(encoding="utf-8")
LABEL_QUALITY_JS = (EXT / "common" / "label_quality.js").read_text(encoding="utf-8")
ENGINE_JS = (EXT / "content" / "engine.js").read_text(encoding="utf-8")
FILLER_JS = (EXT / "content" / "filler.js").read_text(encoding="utf-8")

# A report shape seen on a real form: filled=5,
# guessed=1, user_kept=1, 4 guard refusals (skipped_password stands in),
# needs_you=1, unclaimed_controls=13. Total 25.
REPORT = {
    "filled": [{"fieldKey": "f" + str(n)} for n in range(1, 6)],
    "guessed": [{"fieldKey": "g1"}],
    "unresolved": [],
    "skipped_eeo": [],
    "skipped_sensitive": [],
    "skipped_payment": [],
    "skipped_terms": [],
    "skipped_password": [{"fieldKey": "p" + str(n)} for n in range(1, 5)],
    "skipped_honeypot": [],
    "needs_you": [{"fieldKey": "n1"}],
    "user_kept": [{"fieldKey": "k1"}],
    "errors": [],
}
ATS = {"id": "unknown", "name": "an unknown system"}
NOT_ATTEMPTED = 13

VIEWPORTS = [(1440, 900, "1440"), (390, 844, "390")]
PAGES = [
    ("oracle_style_page.html", "oracle", ".oracle-submit"),
    ("greenhouse_style_page.html", "greenhouse", ".submit-btn"),
    ("workday_style_page.html", "workday", ".wd-next button"),
]


CHROME_STUB = """
window.chrome = window.chrome || {
  runtime: { onMessage: { addListener: () => {} }, sendMessage: (m, cb) => { if (cb) cb({ok:false}); } },
  storage: { local: { get: async () => ({}), set: async () => {} } },
};
"""


def inject_and_paint(page):
    # A plain page has no `chrome` global; filler.js's own last statement
    # (chrome.runtime.onMessage.addListener, registered once per world) is
    # exactly what wires FILL_APPLICATION in a real content-script world —
    # stubbed here only so the bundle's TOP LEVEL can load in a bare page;
    # ynOverlayReport itself is called directly below, never through it.
    if not page.evaluate("() => !!window.chrome"):
        page.add_script_tag(content=CHROME_STUB)
    # YN_THEME is a bare top-level `const` (yn_theme.js is loaded as a
    # classic script in the real extension) — re-injecting it into the SAME
    # page's global scope throws "already declared", exactly the trap
    # common/inject_once.js's own comments describe. Guard on it, same as
    # the filler.js guard below.
    if not page.evaluate("() => typeof window.YN_THEME !== 'undefined'"):
        page.add_script_tag(content=THEME_JS)
    if not page.evaluate("() => typeof window.ynReportFieldLabel === 'function'"):
        page.add_script_tag(content=LABEL_QUALITY_JS)
    # ynCoverage lives in engine.js — without it ynReportOverlayLines never
    # attaches report.coverage, and the summary silently falls back to the
    # no-coverage path (this was missing on the first run of this script:
    # every collapsed summary read the generic "I don't know this system..."
    # line, 11 words, instead of the real percentage line).
    if not page.evaluate("() => typeof window.ynCoverage === 'function'"):
        page.add_script_tag(content=ENGINE_JS)
    if not page.evaluate("() => typeof window.ynOverlayReport === 'function'"):
        page.add_script_tag(content=FILLER_JS)
    page.evaluate(
        """([ats, report, notAttempted]) => {
            window.ynOverlayReport(ats, report, notAttempted, {});
        }""",
        [ATS, REPORT, NOT_ATTEMPTED],
    )


def click_summary(page):
    return page.evaluate(
        """() => {
            const host = document.getElementById('yn-overlay');
            const shadow = host && host.__ynShadow;
            const btn = shadow && shadow.querySelector('.yn-summary');
            if (!btn) return false;
            btn.click();
            return true;
        }"""
    )


def click_close(page):
    return page.evaluate(
        """() => {
            const host = document.getElementById('yn-overlay');
            const shadow = host && host.__ynShadow;
            const btn = shadow && shadow.querySelector('.yn-close');
            if (!btn) return false;
            btn.click();
            return true;
        }"""
    )


def overlay_still_present(page):
    return page.evaluate("() => !!document.getElementById('yn-overlay')")


def summary_text(page):
    return page.evaluate(
        """() => {
            const host = document.getElementById('yn-overlay');
            const shadow = host && host.__ynShadow;
            const el = shadow && shadow.querySelector('.yn-summary');
            return el ? el.textContent : null;
        }"""
    )


def word_count(text):
    return len([w for w in text.split() if any(c.isalnum() for c in w)])


def run_diagnosis(browser):
    """Measure the computed style of (a) a PLAIN inline-styled div, the
    shape the box used before, and (b) the CURRENT shadow-root box,
    both against the Oracle-style fixture's aggressive global rule — proving
    the diagnosis and the fix in one measurement."""
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto((FIXTURES_DIR / "oracle_style_page.html").as_uri())

    # (a) the OLD approach: a plain div, inline-styled exactly as
    # report_state.js's ynOverlay used to paint it, appended to the page.
    old_box_style = page.evaluate(
        """() => {
            const box = document.createElement('div');
            box.id = 'yn-overlay-old-repro';
            box.style.cssText =
              'position:fixed;bottom:16px;right:220px;z-index:2147483647;background:#0a4c3a;' +
              'color:#fff;padding:12px 16px;border-radius:8px;font:13px/1.5 system-ui;' +
              'max-width:360px;box-shadow:0 4px 16px rgba(0,0,0,.35);white-space:pre-wrap';
            box.textContent = 'YoungNug (old inline-styled box)';
            document.documentElement.appendChild(box);
            const cs = getComputedStyle(box);
            return {
                background: cs.backgroundColor,
                color: cs.color,
                fontFamily: cs.fontFamily,
            };
        }"""
    )

    # (b) the CURRENT approach: the real shared box, via ynOverlayReport.
    inject_and_paint(page)
    new_box_style = page.evaluate(
        """() => {
            const host = document.getElementById('yn-overlay');
            const shadow = host && host.__ynShadow;
            const card = shadow && shadow.querySelector('.yn-card');
            const cs = getComputedStyle(card);
            return {
                background: cs.backgroundColor,
                color: cs.color,
                fontFamily: cs.fontFamily,
            };
        }"""
    )
    page.screenshot(path=str(SHOTS / "diagnosis_oracle_old_vs_new.png"), full_page=False)
    page.close()
    return old_box_style, new_box_style


def run_pages(browser):
    results = {}
    for filename, label, submit_selector in PAGES:
        for width, height, wname in VIEWPORTS:
            page = browser.new_page(viewport={"width": width, "height": height})
            page.goto((FIXTURES_DIR / filename).as_uri())
            inject_and_paint(page)
            page.wait_for_timeout(50)

            collapsed_words = word_count(summary_text(page) or "")
            overlap = page.evaluate(
                """(sel) => {
                    const btn = document.querySelector(sel);
                    const host = document.getElementById('yn-overlay');
                    if (!btn || !host) return null;
                    const a = btn.getBoundingClientRect();
                    const b = host.getBoundingClientRect();
                    const overlap = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
                    return overlap;
                }""",
                submit_selector,
            )
            page.screenshot(path=str(SHOTS / f"{label}_{wname}_collapsed.png"))

            click_summary(page)
            page.wait_for_timeout(50)
            page.screenshot(path=str(SHOTS / f"{label}_{wname}_expanded.png"))

            click_close(page)
            page.wait_for_timeout(50)
            still_there = overlay_still_present(page)
            page.screenshot(path=str(SHOTS / f"{label}_{wname}_closed.png"))

            # reload the SAME page (simulating a DOM-settle re-render by
            # re-running the exact same paint call) and confirm it stays
            # closed for this URL, in this tab.
            inject_and_paint(page)
            page.wait_for_timeout(50)
            reappeared = overlay_still_present(page)

            results[f"{label}_{wname}"] = {
                "collapsed_summary_words": collapsed_words,
                "overlaps_submit_button": overlap,
                "closed_removes_box": not still_there,
                "stays_closed_after_rerender": not reappeared,
            }
            page.close()
    return results


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        old_style, new_style = run_diagnosis(browser)
        results = run_pages(browser)
        browser.close()

    out = {
        "diagnosis": {"old_inline_box_computed": old_style, "new_shadow_box_computed": new_style},
        "pages": results,
    }
    out_path = SHOTS / "VERIFICATION_RESULTS.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
