(() => {
  // extension/src/ui/glassdoor/index.js
  function ynReadGlassdoorSentiment() {
    const rating = ynText(document.querySelector("[data-test='rating-headline']"));
    if (!rating) return { ok: false, reason: "no_data" };
    const employer = ynText(document.querySelector("h1")).replace(/\s+Reviews$/i, "");
    if (!employer) return { ok: false, reason: "no_data" };
    const quotes = [];
    for (const review of document.querySelectorAll("[data-test='review-detail']")) {
      const pros = ynText(review.querySelector("[data-test='review-text-PROS']"));
      const cons = ynText(review.querySelector("[data-test='review-text-CONS']"));
      if (pros) quotes.push(("Pros: " + pros).slice(0, 500));
      if (cons) quotes.push(("Cons: " + cons).slice(0, 500));
      if (quotes.length >= 10) break;
    }
    const ceo = ynText(document.querySelector("[data-test='ceo-overview']"));
    const summary = [
      ynText(document.querySelector("[data-test='recommendToFriend']")),
      ynText(document.querySelector("[data-test='business-outlook']")),
      (ceo.match(/\d+%\s*approve of CEO/i) || [""])[0]
    ].filter(Boolean).join(" · ").slice(0, 2e3);
    return {
      ok: true,
      employer,
      sentiment: { source: "glassdoor", rating, quotes: quotes.slice(0, 10), summary }
    };
  }
  (async function glassdoorReader() {
    await ynJitter(1200);
    if (ynBlocked()) return;
    if (!await ynUnderCap("glassdoor")) return;
    const read = ynReadGlassdoorSentiment();
    if (!read.ok) return;
    try {
      chrome.runtime.sendMessage({
        type: "INGEST_SENTIMENT",
        employer: read.employer,
        sentiment: read.sentiment
      });
    } catch (e) {
    }
  })();
  globalThis.ynReadGlassdoorSentiment = ynReadGlassdoorSentiment;
})();
