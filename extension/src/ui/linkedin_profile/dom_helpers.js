// content/linkedin_profile.js, part 1 of 4 — small DOM-reading
// primitives (settle-and-retry, the scroll-and-collect loop, section
// lookup, text-node walking, noise/meta line filters). See index.js
// for the file's full banner.

export const ynSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Poll until fn() returns a truthy value or the budget runs out.
export async function ynSettle(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await ynSleep(400);
  }
}

// The profile page scrolls inside <main> on the current DOM (the window
// itself never moves); fall back to the document scroller for older layouts
// and the local test fixtures.
export function ynScroller() {
  const main = document.querySelector("main");
  if (main && main.scrollHeight > main.clientHeight + 50) return main;
  return document.scrollingElement || document.documentElement;
}

// ---------------------------------------------------------------- sections

// Visible heading text of a profile section, with the trailing count
// stripped ("Skills (17)" → "Skills"). Headings are the ONLY stable handle
// on the new DOM — ids and class names are gone or obfuscated.
export function ynSectionHeading(section) {
  const h = section.querySelector("h2, [role='heading']");
  if (!h) return "";
  return ynText(h).replace(/\s*\(\d+\)\s*$/, "");
}

export function ynFindSection(re) {
  for (const s of document.querySelectorAll("main section")) {
    if (re.test(ynSectionHeading(s))) return s;
  }
  return null;
}

// Distinct text-node lines under a block, in document order. Consecutive
// duplicates (visually-hidden copies) collapse to one.
export function ynTextNodeLines(root) {
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const t = node.textContent.replace(/\s+/g, " ").trim();
    if (t && out[out.length - 1] !== t) out.push(t);
  }
  return out;
}

// Page chrome that renders inside entries but is never profile data.
export const YN_NOISE_LINE =
  /^(…|·|more|see more|…see more|show credential|show project|show all\b.*|\d+\s+endorsements?|endorsed by\b.*|passed linkedin skill assessment|associated with\b.*)$/i;

// Labelled data lines inside an entry ("Skills: Excel · Python",
// "Grade: First", "Activities and societies: …"). Parsed into their own
// fields — and excluded from bullets, where they would otherwise leak.
export const YN_META_LINE = /^(Skills|Grade|Activities and societies)\s*:/i;

export function ynEntryLines(block) {
  const roots = Array.isArray(block) ? block : [block];
  const out = [];
  for (const root of roots) {
    for (const t of ynTextNodeLines(root)) {
      if (!YN_NOISE_LINE.test(t) && out[out.length - 1] !== t) out.push(t);
    }
  }
  return out;
}

/** The value of a labelled meta line, e.g. ynMetaValue(lines, "Grade") ->
 * "First-class honours". Empty string when the line is absent. */
export function ynMetaValue(lines, label) {
  const re = new RegExp(`^${label}\\s*:\\s*(.+)$`, "i");
  for (const t of lines) {
    const m = re.exec(t);
    if (m) return m[1].trim();
  }
  return "";
}

/** "Excel · Python, SQL" -> ["Excel", "Python", "SQL"] (per-entry skills). */
export function ynSplitSkillList(raw) {
  return (raw || "")
    .split(/\s*[·,]\s*/)
    .map((s) => s.trim())
    .filter((s) => s && s.length <= 60)
    .slice(0, 15);
}

// Entry blocks inside a section. Ascend from each logo <figure> to the child
// of the container whose siblings hold the other entries' figures or the
// <hr> separators — that child IS one entry. A SINGLE-entry section has no
// separators to stop at, so also stop before any level that contains the
// section heading (ascending past it would swallow "Experience" itself as
// the entry's first text line).
export function ynSectionEntries(section) {
  const headingEl = section.querySelector("h2, [role='heading']");
  const blocks = [];
  for (const figure of section.querySelectorAll("figure")) {
    let el = figure;
    while (el.parentElement && el.parentElement !== section) {
      const parent = el.parentElement;
      if (headingEl && parent.contains(headingEl)) break;
      const kids = [...parent.children];
      const marked = kids.filter(
        (k) =>
          k.tagName === "HR" || (k.querySelector && k.querySelector("figure")),
      );
      if (marked.length > 1 || kids.some((k) => k.tagName === "HR")) break;
      el = parent;
    }
    if (!blocks.includes(el)) blocks.push(el);
  }
  if (blocks.length) return blocks;
  // No logo <figure> anchors (the Projects and Languages cards render entries
  // without one): fall back to splitting the content region on the same <hr>
  // separators. Each group of siblings between separators is one entry —
  // returned as an ARRAY, which ynEntryLines accepts.
  const hr = section.querySelector("hr");
  if (!hr) return [];
  const groups = [];
  let current = [];
  for (const child of hr.parentElement.children) {
    if (child.tagName === "HR") {
      if (current.length) groups.push(current);
      current = [];
    } else if (!headingEl || !child.contains(headingEl)) {
      current.push(child);
    }
  }
  if (current.length) groups.push(current);
  return groups;
}
