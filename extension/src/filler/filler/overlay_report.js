// content/filler.js — the end-of-fill report's collapsed/expanded painting:
// one summary line plus the never-submitted guarantee by default, every
// other line behind one disclosure. Split out of overlay_lines.js to stay
// under the 400-line module cap (extension_module_size_guard.py /
// tests/test_extension_module_graph.py); ynReportOverlayLines itself, the
// pure function this builds on, is unchanged and still lives there.
import { ynReportOverlayLines, ynAtsDisplayLine } from "./overlay_lines.js";
// ynOverlayBox is common/overlay_box.js's bare global — see fa_setup.js's
// own note on why this is not an ES import.

/**
 * The ONE coverage percentage this build shows (for example 30%, of the
 * controls the fill system was allowed to attempt — a guard
 * refusal or a field the student had already filled is removed from the
 * denominator, never counted against the score; see engine.js's ynCoverage,
 * whose own comment explains why). Never invents a figure: with no
 * computable coverage (a hard stop before any field was even read) this
 * falls back to the plain ATS line and no percentage at all.
 *
 * `title` is the OTHER reading (of every control on the page, unfiltered)
 * plus the shipped one's own denominator, spelled out — "never an
 * unlabelled percentage", surfaced as the summary row's tooltip and repeated
 * in the expanded detail so it is not tooltip-only.
 */
export function ynOverlaySummary(ats, report) {
  const cov = report && report.coverage;
  if (!cov || typeof cov.value !== "number") {
    return { text: ynAtsDisplayLine(ats), title: "", detail: "" };
  }
  const shipPercent = Math.round(cov.value * 100);
  const pagePercent = cov.fields > 0 ? Math.round((cov.filled / cov.fields) * 100) : shipPercent;
  const denominator = cov.fields - cov.skipped - cov.guard_refusals - cov.manual_uploads;
  const atsName = ats && ats.id && ats.id !== "unknown" ? ats.name : "this page";
  const text = `${atsName}: ${shipPercent}% filled`;
  const detail =
    `${shipPercent}% = ${cov.filled} of ${denominator} field(s) the fill system could attempt ` +
    `(excludes ${cov.guard_refusals} guard refusal(s), ${cov.skipped} you had already filled). ` +
    `${pagePercent}% of the ${cov.fields} field(s) on the whole page.`;
  return { text, title: detail, detail };
}

/**
 * Paint the end-of-fill report: one summary line (ATS +
 * the one coverage percentage, always labelled with its
 * denominator), the never-submitted guarantee kept visible even collapsed,
 * and every other line ynReportOverlayLines produced behind one disclosure
 * — as labelled rows, not the same sentences repeated. This changes ONLY
 * how much of that already-tested output shows by default; it computes
 * nothing ynReportOverlayLines/ynCoverage did not already compute.
 */
export function ynOverlayReport(ats, report, notAttempted, extra) {
  const lines = ynReportOverlayLines(ats, report, notAttempted, extra);
  const body = ynOverlayBox();
  if (!body) return; // student closed the box for this page; paint nothing
  body.textContent = "";

  const neverSubmittedLine = lines[lines.length - 1];
  // lines[0] is always the bare "YoungNug" brand row (report_state.js's
  // shared chrome already shows the brand in its header) and the last line
  // is always the never-submitted sentence handled separately below —
  // everything between is the detail this function puts behind a toggle.
  const detailLines = lines.slice(1, -1);
  const summary = ynOverlaySummary(ats, report);

  const summaryBtn = document.createElement("button");
  summaryBtn.type = "button";
  summaryBtn.className = "yn-summary";
  summaryBtn.setAttribute("aria-expanded", "false");
  if (summary.title) summaryBtn.title = summary.title;
  const summaryText = document.createElement("span");
  summaryText.textContent = summary.text;
  const caret = document.createElement("span");
  caret.className = "yn-caret";
  caret.setAttribute("aria-hidden", "true");
  caret.textContent = "▾";
  summaryBtn.appendChild(summaryText);
  summaryBtn.appendChild(caret);
  body.appendChild(summaryBtn);

  const neverRow = document.createElement("div");
  neverRow.className = "yn-never";
  neverRow.textContent = "ⓘ Not submitted";
  neverRow.title = neverSubmittedLine;
  body.appendChild(neverRow);

  const detail = document.createElement("div");
  detail.className = "yn-detail";
  detail.hidden = true;
  for (const line of detailLines) {
    const row = document.createElement("div");
    row.className = "yn-row";
    const idx = line.indexOf(":");
    if (idx > 0 && idx < 40) {
      const label = document.createElement("span");
      label.className = "yn-row-label";
      label.textContent = line.slice(0, idx);
      const value = document.createElement("span");
      value.className = "yn-row-value";
      value.textContent = line.slice(idx + 1).trim();
      row.appendChild(label);
      row.appendChild(value);
    } else {
      row.textContent = line;
    }
    detail.appendChild(row);
  }
  if (summary.detail) {
    const bothRow = document.createElement("div");
    bothRow.className = "yn-row yn-percent-detail";
    bothRow.textContent = summary.detail;
    detail.appendChild(bothRow);
  }
  const neverDetailRow = document.createElement("div");
  neverDetailRow.className = "yn-row yn-never-detail";
  neverDetailRow.textContent = neverSubmittedLine;
  detail.appendChild(neverDetailRow);
  body.appendChild(detail);

  summaryBtn.addEventListener("click", () => {
    const expanded = summaryBtn.getAttribute("aria-expanded") === "true";
    summaryBtn.setAttribute("aria-expanded", String(!expanded));
    detail.hidden = expanded;
    caret.textContent = expanded ? "▾" : "▴";
  });
}
