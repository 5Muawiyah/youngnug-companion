// content/adapters/reopen.js — collapsed-summary section reopen.
// A wizard section that has already been filled sometimes collapses into a
// read-only summary card; a target field inside it then resolves to a
// disabled/readonly control that no write can reach. This finds the ONE
// button an adapter itself has declared as that section's Edit control and
// clicks it — never a bare heuristic guess at "looks like an edit button",
// and never a control that also matches ynSubmitGuard.
//
// Idea only, no code copied: Br1an67/OpenJobAutofill,
// https://github.com/Br1an67/OpenJobAutofill/blob/005eda98841b3671ead615ebfde5922f0dfd7c36/src/content.js#L6515-L6562
// (findEditButtonForField / openEditScopeForField / resolveFieldElement) and
// #L1127-L1145 (isActionControl, adapter-scoped). That project's licence (MIT) would
// permit copying, but the technique here is reimplemented from the idea,
// not lifted — the code below is original.

/**
 * Reopen the section containing `fieldEl` by clicking the first visible
 * control, scoped to that section, whose accessible name matches one of the
 * adapter's own `editLabelPatterns`. Returns the clicked element, or null
 * when the field is not inside a declared section, no matching control is
 * found, or the only match is submit-shaped (ynSubmitGuard refuses it).
 *
 * `sectionSelector` bounds the search to the field's own enclosing section
 * (e.g. a collapsed summary card) — never the whole document, so an Edit
 * button belonging to an unrelated section can never be clicked.
 */
function ynAdapterReopenSection(fieldEl, editLabelPatterns, sectionSelector, doc) {
  const document_ = doc || document;
  if (!fieldEl || !Array.isArray(editLabelPatterns) || !editLabelPatterns.length) {
    return null;
  }
  const section =
    (sectionSelector && fieldEl.closest && fieldEl.closest(sectionSelector)) ||
    (fieldEl.closest && fieldEl.closest("section, fieldset, [role='region']")) ||
    null;
  if (!section) return null;

  const candidates = ynAdaFindAll(
    section,
    'button, [role="button"], a[href="#"]',
  );
  for (const el of candidates) {
    const name = [
      el.textContent,
      el.getAttribute && el.getAttribute("aria-label"),
      el.value,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) continue;
    if (!editLabelPatterns.some((re) => re.test(name))) continue;
    // Never a button matching ynSubmitGuard, however it is labelled ("Edit
    // and submit" is not an edit control).
    if (typeof ynSubmitGuard === "function" && ynSubmitGuard(el)) continue;
    try {
      el.click();
    } catch {
      continue;
    }
    return el;
  }
  return null;
}

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynAdapterReopenSection = ynAdapterReopenSection;
