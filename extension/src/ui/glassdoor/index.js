// content/glassdoor.js — read the company sentiment the USER'S OWN session sees
// on Glassdoor and post it to /api/sentiment/ingest. Server-side Glassdoor is
// ToS/robots-blocked, so reading through the user's own logged-in session is
// the only compliant path. Polite, capped, captcha = hard stop. Injected by
// the popup on the same Capture click as content/capture.js, Glassdoor tabs
// only.
//
// Selector set (2026-08 markup): the overall rating hangs off
// [data-test="rating-headline"] and is the page's is-there-data signal — a
// not-found page has none, and NOTHING is sent for it (honest no-data, never
// a guess). The employer is the h1 minus its trailing " Reviews" (the
// dedicated data-test hook the old selector leaned on no longer exists on
// the site). Reviews are the readable
// [data-test="review-detail"] blocks' PROS/CONS pairs — blurred/gated reviews
// simply have no readable text and are never bypassed. The recommend-to-a-
// friend, business-outlook and CEO-approval percentage lines ride the
// sentiment summary (the CEO line is the percentage only, never the person).

function ynReadGlassdoorSentiment() {
  const rating = ynText(document.querySelector("[data-test='rating-headline']"));
  if (!rating) return { ok: false, reason: "no_data" };
  const employer = ynText(document.querySelector("h1")).replace(/\s+Reviews$/i, "");
  if (!employer) return { ok: false, reason: "no_data" };
  const quotes = [];
  for (const review of document.querySelectorAll("[data-test='review-detail']")) {
    const pros = ynText(review.querySelector("[data-test='review-text-PROS']"));
    const cons = ynText(review.querySelector("[data-test='review-text-CONS']"));
    // 500 is the server's per-quote cap; longer text would 422 the whole post
    if (pros) quotes.push(("Pros: " + pros).slice(0, 500));
    if (cons) quotes.push(("Cons: " + cons).slice(0, 500));
    if (quotes.length >= 10) break;
  }
  const ceo = ynText(document.querySelector("[data-test='ceo-overview']"));
  const summary = [
    ynText(document.querySelector("[data-test='recommendToFriend']")),
    ynText(document.querySelector("[data-test='business-outlook']")),
    (ceo.match(/\d+%\s*approve of CEO/i) || [""])[0],
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 2000);
  return {
    ok: true,
    employer,
    sentiment: { source: "glassdoor", rating, quotes: quotes.slice(0, 10), summary },
  };
}

(async function glassdoorReader() {
  await ynJitter(1200);
  if (ynBlocked()) return; // login/captcha -> do nothing (never bypass)
  if (!(await ynUnderCap("glassdoor"))) return;
  const read = ynReadGlassdoorSentiment();
  if (!read.ok) return; // no rating on the page -> nothing is sent
  try {
    chrome.runtime.sendMessage({
      type: "INGEST_SENTIMENT",
      employer: read.employer,
      sentiment: read.sentiment,
    });
  } catch (e) {
    /* app offline — reading must never break the user's browsing */
  }
})();

// Migrated by the Companion's modular build (see extension/src/index.js): every one of this file's original top-level names is
// restored onto globalThis exactly as the single-file version exposed it, so any other injected file can still call it as a
// bare global, unchanged.
globalThis.ynReadGlassdoorSentiment = ynReadGlassdoorSentiment;
