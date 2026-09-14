/**
 * The popup's job matcher must see every fill-able tracker row, not only the
 * newest 200 adverts. Observed on a real feed: an approved Greenhouse job sat
 * behind thousands of newer rows, /api/jobs?limit=200 never listed it,
 * the tab never matched, and the fill took the generic path with no tracker
 * result. ynMergeFillableJobs is the pure merge LIST_JOBS now applies.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
// A checkout on a machine with core.autocrlf on used to hand this file CRLF line
// endings, and the newline-anchored extraction below then found nothing even though
// the function was there. Normalise before matching so the extraction reads the
// same bytes on every checkout.
const src = readFileSync(path.join(root, "extension", "background.js"), "utf8").replace(/\r\n/g, "\n");
// `const` or `var`, `function` at column 0 or a fixed 2-space indent, and
// its closing brace the same: a shipped file esbuild has bundled from
// extension/src/ (see that folder's own index.js) always emits a
// top-level module binding as `var`, and wraps every original top-level
// statement one level deeper.
const m = src.match(/(?:const|var) YN_FILLABLE_STATUSES[\s\S]*?\n {0,2}function ynMergeFillableJobs[\s\S]*?\n(?: {2})?\}\n/);
if (!m) {
  console.log("list jobs merge FAIL: ynMergeFillableJobs not found in background.js");
  process.exit(1);
}
const ctx = vm.createContext({ console });
vm.runInContext(m[0] + "\nglobalThis.ynMergeFillableJobs = ynMergeFillableJobs;", ctx);
const merge = ctx.ynMergeFillableJobs;

let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else {
    failures += 1;
    console.log("  FAIL " + msg);
  }
}

const page = Array.from({ length: 200 }, (_, i) => ({ id: 190000 - i, title: "newer " + i, url: "https://example.org/j/" + (190000 - i) }));
const apps = [
  { id: 25, job_id: 4242, job_title: "Sales Development Representative", employer: "ExamplePay", status: "queued_extension", link: "https://job-boards.greenhouse.io/examplepay/jobs/1000001", job_url: "https://job-boards.greenhouse.io/examplepay/jobs/1000001" },
  { id: 26, job_id: 189990, job_title: "already on the page", status: "approved", job_url: "https://example.org/j/189990" },
  { id: 27, job_id: 9, job_title: "skipped", status: "skipped", job_url: "https://example.org/skipped" },
  { id: 28, job_id: 10, job_title: "no url at all", status: "approved" },
  { id: 29, job_id: 11, job_title: "old row with link only", status: "manual", link: "https://example.org/link-only" },
  { id: 30, job_id: 12, job_title: "prepared for a manual route", status: "prepared", job_url: "https://example.org/prepared" },
  { id: 31, job_id: 13, job_title: "filled, not yet submitted", status: "filled_pending_submit", job_url: "https://example.org/pending" },
];
const out = merge(page, apps);
check(out.length === 204, "200 page rows + 4 tracker rows = " + out.length);
check(out.slice(0, 200).every((j, i) => j.id === page[i].id), "the feed page keeps its order in front");
const g = out.find((j) => j.id === 4242);
check(g && g.url === "https://job-boards.greenhouse.io/examplepay/jobs/1000001" && g.title === "Sales Development Representative", "the approved job behind the page is listed with its own URL");
check(out.filter((j) => j.id === 189990).length === 1, "a tracker row already on the page is not duplicated");
check(!out.some((j) => j.id === 9), "a skipped row is not listed");
check(!out.some((j) => j.id === 10), "a row with no URL is not listed");
check(out.some((j) => j.id === 11 && j.url === "https://example.org/link-only"), "an older tracker row without job_url falls back to its link");
check(out.some((j) => j.id === 12) && out.some((j) => j.id === 13), "prepared and filled-pending rows are listed: the server serves their fill-plan too");
check(merge(undefined, apps).length === 5 && merge(page, undefined).length === 200, "a missing side is tolerated: no page lists the five fill-able rows, no tracker keeps the page");

const tabPage = "https://job-boards.greenhouse.io/examplepay/jobs/1000001#app".split("?")[0];
check(out.some((j) => j.url && tabPage.startsWith(j.url.split("?")[0])), "the popup's prefix rule now matches the open tab");

if (failures) {
  console.log("\nlist jobs merge FAIL: " + failures);
  process.exit(1);
}
console.log("\nlist jobs merge PASS: every fill-able tracker row reaches the matcher, nothing duplicated, nothing unfillable");
