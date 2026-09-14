/**
 * ynReportOverlayLines pin — errors, coverage causes and drafted
 * answers reaching the overlay as compact icon rows, and NOT reaching it
 * (no new row, no word-count regression) when a fill has nothing of that
 * kind to say.
 *
 * report.errors used to be printed nowhere in ynReportOverlayLines — it
 * reached the API only as a bare count, invisible on the page. This proves
 * the fix directly against the production function, no DOM required: the
 * function only builds and returns an array of strings.
 *
 * Loaded verbatim under Node's vm module (no jsdom needed — the function
 * under test never touches `document`), engine.js then filler.js, in the
 * SAME order the click-time stack loads them (popup.js's YN_FILL_SCRIPTS).
 *
 * Run: node tests/ext_fixtures/run_overlay_lines.mjs   (exit 0 = all pass)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const ENGINE = path.join(root, "extension", "content", "engine.js");
const LABEL_QUALITY = path.join(root, "extension", "common", "label_quality.js");
const FILLER = path.join(root, "extension", "content", "filler.js");

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (e) {
    failures += 1;
    console.error("  FAIL " + name + " — " + e.message);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadSandbox() {
  const sandbox = {
    console,
    // A stand-in worker: never actually reached by ynReportOverlayLines,
    // which is a pure function of its arguments, but engine.js and
    // filler.js both reference `chrome` at load time.
    chrome: {
      runtime: {
        lastError: null,
        sendMessage: () => Promise.resolve({ ok: false }),
        onMessage: { addListener: () => {} },
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {},
          remove: async () => {},
        },
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(ENGINE, "utf8"), sandbox, {
    filename: "engine.js",
  });
  vm.runInContext(readFileSync(LABEL_QUALITY, "utf8"), sandbox, {
    filename: "label_quality.js",
  });
  vm.runInContext(readFileSync(FILLER, "utf8"), sandbox, {
    filename: "filler.js",
  });
  return sandbox;
}

/** A report shape with every ynEmptyReport() key present. */
function emptyReport(overrides) {
  return Object.assign(
    {
      filled: [],
      guessed: [],
      unresolved: [],
      skipped_eeo: [],
      skipped_sensitive: [],
      skipped_payment: [],
      skipped_terms: [],
      skipped_password: [],
      skipped_honeypot: [],
      needs_you: [],
      user_kept: [],
      errors: [],
    },
    overrides || {},
  );
}

function wordCount(lines) {
  return lines
    .join(" ")
    .split(/\s+/)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

const sandbox = loadSandbox();
const ATS = { id: "greenhouse", name: "Greenhouse" };

// ── 1. A clean fill (nothing unusual to report) gains NO new row and NO
//      word-count regression: ynCoverage's causes object is present on
//      EVERY fill, so the guard here is that an
//      all-zero causes object must not itself become visible noise. ──────
{
  const rep = emptyReport({ filled: [{ fieldKey: "contact.email" }] });
  const before = sandbox.ynReportOverlayLines(ATS, { ...rep }, 0, {});
  // Re-run through the SAME function a second time on a fresh copy so the
  // in-place Object.assign(report, ynCoverage(report)) mutation from the
  // first call cannot leak into what "before" means.
  const after = sandbox.ynReportOverlayLines(ATS, { ...rep }, 0, {});
  check("clean fill: identical lines on repeat", () =>
    assert(
      JSON.stringify(before) === JSON.stringify(after),
      "same report produced different overlay lines:\n" +
        before.join("\n") +
        "\n---\n" +
        after.join("\n"),
    ));
  check("clean fill: no error row", () =>
    assert(
      !before.some((l) => l.startsWith("✕")),
      "an error row appeared with report.errors empty: " + before.join(" | "),
    ));
  check("clean fill: no causes row (all-zero causes stay invisible)", () =>
    assert(
      !before.some((l) => l.startsWith("•")),
      "a causes row appeared though nothing was unusual: " + before.join(" | "),
    ));
  check("clean fill: no drafts row", () =>
    assert(
      !before.some((l) => l.includes("drafted answer")),
      "a drafts row appeared with report.drafts absent: " + before.join(" | "),
    ));
}

// ── 2. report.errors reaches the overlay as one compact icon row ────────
{
  const rep = emptyReport({
    filled: [{ fieldKey: "contact.email" }],
    errors: [
      { fieldKey: "contact.email", label: "site flagged this answer" },
    ],
  });
  const lines = sandbox.ynReportOverlayLines(ATS, rep, 0, {});
  const row = lines.find((l) => l.startsWith("✕"));
  check("error row present", () => assert(row, "no ✕ row: " + lines.join(" | ")));
  check("error row names the error", () =>
    assert(
      row.includes("site flagged this answer"),
      "error row lost the label: " + row,
    ));
  check("error row is one line, not one per error", () =>
    assert(
      lines.filter((l) => l.startsWith("✕")).length === 1,
      "expected exactly one ✕ row, got " +
        lines.filter((l) => l.startsWith("✕")).length,
    ));
  check("error row stays compact (<= 12 words)", () =>
    assert(
      wordCount([row]) <= 12,
      `error row too long (${wordCount([row])} words): ${row}`,
    ));
}

// ── 3. Several errors: still one row, capped, never a sentence per item ─
{
  const rep = emptyReport({
    errors: [
      { fieldKey: "a", label: "first error" },
      { fieldKey: "b", label: "second error" },
      { fieldKey: "c", label: "third error" },
    ],
  });
  const lines = sandbox.ynReportOverlayLines(ATS, rep, 0, {});
  const errorRows = lines.filter((l) => l.startsWith("✕"));
  check("three errors still collapse to one row", () =>
    assert(errorRows.length === 1, "got " + errorRows.length + " rows"));
  check("all three labels present in the one row", () => {
    for (const label of ["first error", "second error", "third error"]) {
      assert(errorRows[0].includes(label), `missing "${label}" in: ${errorRows[0]}`);
    }
  });
}

// ── 4. report.causes: a non-zero cause becomes a compact "•" row ────────
{
  const rep = emptyReport({ needs_you: [{ fieldKey: "answers.notice_period" }] });
  // ynReportOverlayLines computes causes itself via ynCoverage when it is
  // absent — this proves the row appears from that computed object, not
  // only from a hand-supplied one.
  const lines = sandbox.ynReportOverlayLines(ATS, rep, 0, {});
  const row = lines.find((l) => l.startsWith("•"));
  check("causes row appears when a cause is non-zero", () =>
    assert(row, "no • row for a report with a needs_you entry: " + lines.join(" | ")));
  check("causes row names the non-zero cause", () =>
    assert(row.includes("needs you"), "causes row: " + row));
}

// ── 5. report.drafts (read defensively): a count, never
//      the draft text itself — the review screen is where a draft is seen
//      and approved, never the overlay. ──────────────────────────────────
{
  const rep = emptyReport({
    drafts: [
      { fieldKey: "q1", value: "invented text that must never leak here" },
      { fieldKey: "q2", value: "a second draft" },
    ],
  });
  const lines = sandbox.ynReportOverlayLines(ATS, rep, 0, {});
  const row = lines.find((l) => l.includes("drafted answer"));
  check("drafts row present", () => assert(row, "no drafts row: " + lines.join(" | ")));
  check("drafts row carries the count", () =>
    assert(row.includes("2"), "drafts row: " + row));
  check("drafts row never leaks the draft text", () =>
    assert(
      !lines.join(" ").includes("invented text"),
      "a draft's own text reached the overlay unapproved",
    ));
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("overlay lines PASS");
