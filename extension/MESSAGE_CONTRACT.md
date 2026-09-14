# Extension ↔ backend message contract

The companion extension runs in the user's OWN browser and talks to the user's
YoungNug backend over HTTPS with a scoped **account token** (Bearer). It is the
universal fallback: whatever the server-side/API path can't do because of ToS,
bot-detection, or a login wall, the extension does in-session.

## Auth — AUTO-CONNECT (no manual token paste)
- When a logged-in YoungNug tab is open, `content/app_bridge.js` (which runs
  ONLY on the app's own origin) announces `YN_EXT_READY {connected}` via
  `window.postMessage`. If not connected, the signed-in app page issues a fresh scoped token and
  replies `YN_EXT_CONNECT {token, apiBase}`; the worker verifies it against
  `GET /api/me` before storing (`SET_TOKEN`). Both directions are
  origin-checked (`event.source === window`, `event.origin === location.origin`).
- Every request sends `Authorization: Bearer <token>`. The backend scopes the
  token to ONE user → the extension can only touch that user's data
  (multi-user isolation extends to the extension).
- The popup shows LIVE status (`GET_STATUS` → `/api/me` ping) — token
  presence alone never displays as "connected". A manual token paste remains
  in Options → Advanced as the fallback.

## Endpoints the extension calls
| Purpose | Method + path | Payload | Notes |
|---|---|---|---|
| Capture a job from any page | `POST /api/jobs/capture` | `{title, employer, url, source, description, location, mode}` | The user clicks Capture; nothing is read before that. `mode` is telemetry only (`jobview` = an open advert, `serp` = a results-page card). Deduped server-side; answers `{id, duplicate, enriched}` — `enriched` means the capture's real body landed ON the user's existing bodiless copy of the same advert (true key collision, or the same employer+title with a location asymmetry) and the row was re-scored, instead of the body being discarded or the advert forking into a bodiless twin. A posting the server has marked dead answers an honest 409. The server keeps its own durable record of every attempt, including a validation rejection; the newest rides `GET /api/me` as `last_capture`, beside `served_extension_version` (the version of the pack this deployment serves, for the app's out-of-date banner). On a recognised results page (Indeed `/jobs`, LinkedIn `/jobs/search`) the reader returns the MOUNTED cards and the popup posts each one through this same endpoint sequentially, jittered — never a scroll, never a next page, never a fetch of the linked adverts. When that results page has an OPEN advert (`currentJobId` with a readable About-the-job pane), the open advert is captured as ONE full job instead — the popup says which mode ran ("Saved this advert" vs "Saved N job cards"). |
| Ingest company sentiment | `POST /api/sentiment/ingest` | `{employer, sentiment:{source, rating, summary, quotes[]}}` | Glassdoor read in the user's session (server-side blocked). `summary` carries the recommend-to-a-friend / business-outlook / CEO-approval percentage lines; `quotes[]` are per-review Pros/Cons pairs. A page with no rating block sends NOTHING (honest no-data). |
| Read the profile for a generic fill | `GET /api/profile` | — | The input to `ynFillAnyPage` on a page that is NOT one of the user's jobs. Read-only, user-scoped by auth, no new route. Reshaped worker-side into the fill-plan shape MINUS cv/letter/job — see `GET_GENERIC_PROFILE` below. |
| Get an apply fill-plan | `GET /api/apply/fill-plan/:jobId` | — | 404 unless the user Approved this job. Returns contact/address/links/answers/cv_url/letter_*/dry_run (fill-plan v2). **No `auto_submit` key** — v1 never submits. |
| Compose a free-text form answer | `POST /api/apply/answer` | `{job_id, question, max_chars?}` | Same Approve gate as fill-plan. 200 `{text, generated, archetype}` when gates pass; 422 when not ready. Extension never marks the write `"exact"` — always amber `"guessed"`. |
| Report an apply outcome | `POST /api/apply/result` | `{jobId, status, evidence}` | status ∈ `filled` / `captcha_stop` / `login_required` / `failed`, plus `submitted` — which may originate ONLY from the popup's confirmation strip (the user's own click after they sent the application themselves). The worker refuses `submitted` from any sender with a tab, so no page-side script can claim a submission. captcha/login → prepare-and-notify. |
| Match a landed URL to a saved advert | `POST /api/jobs/match-url` | `{url}` | Per-user scoped; `{job_id}` on a match, `{}` otherwise — never an error, and another user's advert answers `{}` too (indistinguishable from no-match). Checks both the job's `url` and its `direct_apply_url`. |
| Report the Companion's own live-check verdict | `POST /api/jobs/:jobId/live-report` | `{verdict, evidence}` | `verdict` ∈ `live`/`closed`/`could_not_tell`. Owner-scoped like `/recheck` (404, not 403, for another user's job). A `closed` verdict with an empty `evidence` is refused 422 — never silently written. Never files a `JobReport`. A row the server checked inside its own cooldown answers `{status, checked_at, evidence, method:"cached"}` with no write — see the cooldown note below. |
| One-click LinkedIn grab | `POST /api/profile/import/linkedin` | `{name, headline, about, location, experience[], education[], skills[], certifications[], volunteering[], projects[], languages[], source_url}` | Validated through profile_schema and MERGED into the real sections — existing rows kept, duplicates by name+dates skipped, every imported row carries a `[CONFIRM]` review marker so it renders in the wizard/Profile editors but reaches NO document until the user saves the section. Experience rows carry `work_mode` + per-role `skills[]`; education rows carry `grade` + `activities`; certifications carry `expires`, `credential_url` + `skills[]`; `languages[]` merge as language-category skill drafts; `location` fills a BLANK contact city only (city part only, never a bare country); `source_url` fills a blank LinkedIn link. Response reports accurate per-section `{imported, skipped}` counts. Rate-limited and size-capped server-side. |

## Capture — injected on the click, never pre-loaded
`content/capture.js` is **not** a manifest content script and matches no site.
When the user clicks **Capture**, the popup injects `common/api.js` +
`content/capture.js` into the ACTIVE tab (`activeTab` + `scripting`) and calls
the injected `ynCaptureCurrent()`, which returns `{ok, job}`, or `{ok, jobs}`
on a recognised results page (the cards already mounted in the DOM, nothing
more), or `{ok:false, error}` (captcha/login wall = HARD STOP; nothing
readable = no empty job filed). Single adverts read ld+json JobPosting first,
then the per-host extractor (Indeed `/viewjob`; LinkedIn `/jobs/view`, which
ships no h1 and no ld+json, so the title comes from `document.title` and the
body from the visible "About the job" heading), then the generic heuristic.
On LinkedIn's default browsing surface (`/jobs/search?currentJobId=NNN`, and
`/jobs/collections`) the reader captures the advert the student is READING:
when a readable About-the-job pane is open, the jobview rungs run against it
first (title/employer/location from the open advert's `[data-job-id]` card,
canonical `/jobs/view/<id>/` URL) and the SERP-card multi-capture is only
the fallback. The LinkedIn location is read from the top card's rendered
tertiary line ("<place> · 1 week ago · N applicants") — rendered text, never
a rotating class name.
The popup hands each job to the worker as `CAPTURE_JOB` — a results page is
posted one card at a time with the standard jitter, and the popup sums the
server's `{duplicate}` answers into "Saved N job cards, M already in your
list". A single advert answers "Saved this advert" (or says enriched /
already-in-your-list out loud).

**Durable last-capture record:** the worker writes every capture attempt —
the successful POST, the failed POST, and (via `CAPTURE_ANNOUNCE` from the
popup) the read-stage failure that never produced a POST — to the single
clamped `chrome.storage.local` key `lastCapture`
`{ts, ok, mode, host, error, duplicate, enriched, saved, dupes, failed}`.
The popup's default view no longer re-shows it on open (the capture-history
line was dropped to keep that view to the greeting, one line on what it can
do here, and the primary actions); the worker still broadcasts the same
entry to app tabs as `YN_CAPTURE_STATUS` (the `YN_IMPORT_STATUS` relay
pattern), which is where a failed capture — no longer a one-frame text line
— is now seen. The server
holds its own durable record too (surfaced on `/api/me`), so client and
server can disagree detectably.
There is no `CAPTURE_CURRENT` message any more: the injected file only declares
functions, so a second click cannot double-register a listener. `activeTab`
grants that one tab for that one gesture — the extension can read no page the
user has not explicitly asked it to read. (Before this, an `<all_urls>` content
script put the capture code on every page the user visited: a Chrome Web Store
review blocker and a real privacy problem.) Pages Chrome refuses to script
(`chrome://`, the Web Store, PDFs, other extensions) get a clear error, not a
hang or a raw exception.

**SERP readers.** This table used to name two sites (Indeed, LinkedIn) while
`ynSerpJobs()` already covered nine — `tests/test_extension_contract_sync.py`
parses `capture.js` and fails the build if this list falls out of step again;
update the table, never the test, when a new reader lands.
<!-- BEGIN_SERP_READERS -->
| Reader function | Site |
|---|---|
| `ynIndeedSerpJobs` | Indeed |
| `ynLinkedInSerpJobs` | LinkedIn |
| `ynNhsJobsSerpJobs` | NHS Jobs |
| `ynGradcrackerSerpJobs` | Gradcracker |
| `ynTrackrSerpJobs` | The Trackr |
| `ynCvLibrarySerpJobs` | CV-Library |
| `ynGuardianJobsSerpJobs` | Guardian Jobs |
| `ynTotalJobsSerpJobs` | Totaljobs |
| `ynSimplyHiredSerpJobs` | SimplyHired |
| `ynTargetJobsSerpJobs` | TARGETjobs |
| `ynBrightNetworkSerpJobs` | Bright Network |
| `ynHigherinSerpJobs` | Higherin (formerly RateMyPlacement) |
| `ynProspectsSerpJobs` | Prospects |
<!-- END_SERP_READERS -->

## Messages inside the extension (runtime.sendMessage)

### Core
`CAPTURE_JOB` (popup/content→worker→/capture) ·
`INGEST_SENTIMENT` (content→worker→/sentiment) · `GET_FILL_PLAN` /
`FILL_APPLICATION` / `APPLY_RESULT` (popup/content↔worker↔apply endpoints) ·
`SET_TOKEN` (app_bridge→worker, verified before store) · `GET_STATUS`
(popup/app_bridge→worker→/api/me) · `LINKEDIN_READ_PROFILE` (popup→content,
consent-gated, the viewer's OWN profile only — enforced by identity, not URL
shape: `ynIsViewerOwnProfile()` requires owner-only page affordances (the
per-section `/edit/forms/` links, the "Add section" / "Enhance profile"
control text, or the private analytics card scoped to a section headed
"Analytics"), so a third party's `/in/` page is refused; captcha/login-wall = stop. The read is
ASYNC — the listener returns `true` and responds later: the profile DOM
mounts sections lazily, so the reader scrolls through the page harvesting
sections by their VISIBLE heading text (never class names or id anchors,
which LinkedIn obfuscated/removed), walks TEXT NODES per logo-anchored entry
block, then restores the scroll position. For the full skills list it may
follow the Skills card's own "Show all" link to `/in/<slug>/details/skills/`
— a same-tab SPA soft-navigation, the user's own profile only, restored with
`history.back()`; on any timeout the inline preview is kept. Response is
`{ok:true, data, read}` where `read` reports counts for experience,
education, skills, certifications, volunteering, projects and languages,
plus `skills_source`
(`details` | `profile` | `none`) and `sections_seen` — the popup relays it, and
read failures name the sections that were found but unreadable instead of a
blanket "could not read anything") ·
`LINKEDIN_IMPORT` (popup→worker→/api/profile/import/linkedin — carries
skills[], certifications[], volunteering[], projects[], languages[],
employment_type, work_mode, per-role skills and description bullets, plus
name/headline/about/location and the merge-with-review contract above; the
worker broadcasts `YN_IMPORT_STATUS done|failed` to app tabs after the POST,
so "done" reflects the server's real answer) ·
`IMPORT_ANNOUNCE {source, phase: started|failed, error?}` (popup→worker —
relayed to app tabs as `YN_IMPORT_STATUS` when the user consents to an
import or the read stops before any POST; the worker refuses any other
phase, so a page script can never fabricate a "done") ·
`CAPTURE_ANNOUNCE {ok, mode?, host?, error?, saved?, dupes?, failed?}`
(popup→worker — the two things only the popup knows: the results-page batch
summary, and a READ-stage failure that never produced a POST. Stored as
`lastCapture` and relayed to app tabs as `YN_CAPTURE_STATUS`; senders with a
tab — page scripts — are refused, mirroring `CONFIRM_APPLIED`, so a page can
never rewrite the capture record) ·
`GITHUB_IMPORT {username}` (popup→worker: worker fetches the
PUBLIC api.github.com repos keyless →/api/profile/import/github — consent
click required, public data only; uses the same merge-with-review contract
as LinkedIn: repos become `[CONFIRM]`-flagged project rows, languages become
flagged skill drafts, the GitHub link fills `links` when blank, and nothing
flagged reaches a document until the user saves the section) ·
`FETCH_FILE` (content→worker: authed blob → dataURL for CV/letter upload) ·
`GENERATE_ANSWER` (content→worker→`POST /api/apply/answer` — free-text
form answers; see below) ·
`LIST_JOBS` (popup→worker→/api/jobs for URL→job matching) ·
`CONFIRM_APPLIED {jobId, applied}` (popup→worker: refused from any sender
with a tab, mirroring `CAPTURE_ANNOUNCE` — a page can never claim a
submission. `applied:true` → `POST /api/apply/result` with `status:
"submitted"`; either answer clears `pendingConfirm` AND `confirmAsked`
below). The confirm strip it answers ("Did you review and send this
application yourself?") asks ONCE per fill and is dismissable:
`confirmAsked {jobId, ts}` (local only) is written the first time the strip
renders for a given `pendingConfirm`, keyed by the SAME `{jobId, ts}` pair —
a second popup open with no answer given finds the marker already matches
and stays quiet, while a NEW `APPLY_RESULT status:"filled"` writes a fresh
`ts` that does not match the old marker, so it asks again for that fill ·
`GET_GENERIC_PROFILE` (popup→worker→`GET /api/profile`) — the input to the
GENERIC any-page fill. The worker reshapes the user's own profile sections
into the fill-plan shape locally (`ynProfileFillShape`, mirroring the
server's `fill_plan` rules: `[CONFIRM…]` placeholders stripped, right to work
stored-only and never derived, nothing absent invented) and returns
`{ok, profile}`. It carries NO `cv_url` / `letter_url` / `job_id`, because
there is no application: this path never asks for a fill plan, so **the
per-job Approve gate is neither used nor weakened by it**.

### GENERATE_ANSWER (free-text form questions)
| Type | Direction | Payload | Response |
|---|---|---|---|
| `GENERATE_ANSWER` | content→worker | `{jobId: number, question: string (<=300), maxChars?: number\|null}` | `{ok:true, text}` or `{ok:false, error}` |

Worker validates `jobId` (finite positive) and `question` (non-empty, ≤300), then
`POST /api/apply/answer` with `{job_id, question, max_chars?}`. **No storage, no
cache** — answers are per-fill. 4xx/network → `{ok:false}` with no retry.
Filler converts a successful text into a normal text/textarea intent with
`confidence: "guessed"` (always amber; never `"exact"`) and runs it through
`ynExecuteIntents` (full safety chain). Cap 4 generated answers per page;
failures surface under the overlay line *"Answer this one yourself"*.

**Question-path safety (hard):**
- No `Math.random` anywhere in the question path (heuristics/filler).
- Right-to-work / visa / driving-licence / relocate: fill ONLY an explicitly
  stored boolean; `null` → skip (unconfirmed_answers flow). Never derived,
  never defaulted, never random.
- Boolean radios pick Yes/No by option label (not first radio in the group).
- Sensitive (criminal / disability-health / referee) → `skip:"sensitive"`,
  overlay *"Sensitive questions left for you"* — never filled.
- Strings `auto_submit` and `"submitted"` remain forbidden in `content/*.js`.

### Field-map cache (local only — chrome.storage.local)
| Type | Direction | Payload | Response |
|---|---|---|---|
| `FIELD_MAP_CACHE_GET` | content→worker | `{employer, ats}` | `{ok, entry}` where `entry` is `{version:1, fields:{fieldKey:selectorPath}}` or `null` |
| `FIELD_MAP_CACHE_SET` | content→worker | `{employer, ats, fields}` | `{ok, entry}` |

Storage key: `fieldmap:<ats>:<employer>` (lowercased). Holds **heuristic/LLM**
resolutions only; adapters are deterministic and are not cached. Cache hits
re-verify the selector still matches the live DOM before use.

### Ollama (developer-configured last-resort mapping — default OFF)
| Type | Direction | Payload | Response |
|---|---|---|---|
| `OLLAMA_RESOLVE` | content→worker | `{prompt?, fields?}` | `{ok:true, mapping}` or `{ok:false, error}` |

Hard no-op `{ok:false, error:"ollama disabled"}` unless
`(await ynSettings()).ollamaEnabled === true`. When enabled, POSTs
`http://127.0.0.1:11434/api/generate` with `model` from
`settings.ollamaModel` (default `qwen2.5:7b`), `stream:false`,
`temperature:0`, and parses a single JSON object from the response text.
`ollamaEnabled`/`ollamaModel` are **storage-only settings with no shipped
UI** — a developer setting, set via the service worker's DevTools
console (`chrome.storage.local.set({ollamaEnabled:true})`). The manifest
declares `optional_host_permissions` for `http://127.0.0.1:11434/*` but the
handler never calls `chrome.permissions.request()`; the permission must be
granted manually (extension details → site access, or a console
`chrome.permissions.request`), otherwise the fetch fails and the handler
returns the error honestly. Any failure returns `ok:false` — no silent
success. Resolutions are always `confidence: "guessed"`.

### FILL_APPLICATION result shape (content → popup)
```js
{
  ok: true,
  ats: { id, name, confidence },   // id "unknown" is first-class
  displayLine: "Filling a Greenhouse application.",
  evidence: "ats=greenhouse; filled=4; guessed=2; unresolved=1; ...",
  report: {
    filled:      [{ fieldKey, label }, ...],  // confidence exact → emerald
    guessed:     [{ fieldKey, label }, ...],  // amber — user should check
    unresolved:  [{ fieldKey, label }, ...],  // could not read / write failed
    skipped_eeo: [{ fieldKey, label }, ...],  // left for the user
    skipped_sensitive: [{ fieldKey, label }, ...], // criminal/health/referee
    skipped_password:  [{ fieldKey, label, reason }, ...], // credentials —
                                              // reason "password" (the field
                                              // itself) or "sign-in scope"
                                              // (a field inside a password's
                                              // scope). A READ of the page,
                                              // never an intent: the planner
                                              // still produces NO intent for
                                              // a password element.
    skipped_honeypot:  [{ fieldKey, label }, ...], // bot traps, never written
    needs_you:   [{ fieldKey, label }, ...],  // free-text gen failed/capped
    user_kept:   [{ fieldKey, label }, ...],  // non-empty; never overwritten
    errors:      [{ fieldKey, label }, ...],  // reported failures, not silent
    drafts: [{ fieldKey, text, source, verdict, refs, label, written }, ...],
                                              // a drafted/reused answer — see
                                              // "Review screen" below. `written`
                                              // is true only if the student's
                                              // Approve released THIS one.
  },
  cancelled: false,   // true only if the review screen's Cancel was pressed
}
```

### Review screen (`content/review_screen.js`, `ynShowReviewScreen`)

The seam between planning and writing, inside BOTH `ynFillApplication` and
`ynFillAnyPage`. Every planned intent that is not confidence `"exact"`, and
every entry in `report.drafts`, is one row; exact-confidence intents wait
for the same Approve but are never listed. Nothing reaches
`ynExecuteIntents` until the screen resolves:

```js
// filler.js's call, same shape from both fill paths:
ynShowReviewScreen({ guessed: FillIntent[], drafts: DraftEntry[],
                      draftElByKey: Map, ats }) ->
Promise<{ approved: true,  skippedFieldKeys: string[], edits: {fieldKey: text} }
       | { approved: false }>          // Cancel — nothing is written
```

A guessed field has no row-level control; it is bundled into the one
screen Approve. A draft defaults to excluded — its own Approve/Edit/Skip
icons are the only way it joins the write, so a student who presses the
screen's Approve without touching a draft row gets every guessed field
filled and every untouched draft left as `needs_you`, never silently
written. Hovering a row outlines the live element
(`content/dom_fill_kit.js`'s `ynHighlight`/`ynClearElementHighlight`); a
refused draft (`verdict !== "clean"`) renders as an icon and one line, with
no controls, because it can never be written. If `review_screen.js` fails
to load, the gate fails OPEN (everything writes, nothing skipped) and logs
one `report.errors` row — a missing file is a bug to fix, not a silent
block.

`window.__ynReviewScript` (test-only; a real content-script world never
defines it — a host page cannot reach an isolated world's globals) lets a
fixture script a decision instead of a real click: an array of
`{type: "skip"|"approve_draft"|"edit"|"cancel", fieldKey, text}` actions,
applied against a default of "every guessed field included, every draft
excluded". `tests/ext_harness.py`'s `run_fill_fixture(..., review_script=)`
sets this the same way it already fakes `chrome.runtime.sendMessage`.

### ynFillAnyPage — the GENERIC any-page fill (popup → page)

Same result shape as `FILL_APPLICATION`, plus `generic: true` and no
`evidence` (there is no application to attach evidence to).

Where a site has a dedicated adapter, **the adapter wins**: both paths plan
through the same `ynPlanRungs`, so the adapter claims its fields first and
the generic rungs only see what is left. What differs, and why:

| | approved-job path | generic path |
|---|---|---|
| input | `GET /api/apply/fill-plan/:jobId` (Approve-gated) | `GET_GENERIC_PROFILE` |
| outcome reported | `POST /api/apply/result` | nothing — a form is not an application |
| multi-step resume | `fillstate:*` | none |
| free-text answers | `GENERATE_ANSWER`, always amber | never generated → `needs_you` |
| CV / letter attach | yes | no urls, so honestly unresolved |

Identical, because none of it may weaken on a page nobody vetted: the
challenge hard stop, the login-wall handoff, the sensitive / EEO / payment /
terms refusals, the never-overwrite rule, the password refusals, and never a
submit.

### Undo (`window.ynUndoFill`, page-injected — popup → page)

The popup's Undo button injects the same click-time stack the Fill buttons
use (a no-op when it is already present, so a prior fill's own write
history survives the re-injection) and, on every frame, calls
`ynUndoFill()` if it is a function. **Contract the function must meet:**
takes no arguments, reverts only elements the Companion wrote or ticked in
this page session (never a value the student typed themselves), and
returns `{ reverted: <number> }` — the count is the ONLY field the popup
reads. Absent (not yet loaded, or the page never held anything to revert)
and a `{ reverted: 0 }` answer read identically to the student: "Nothing to
undo."

## v1 NEVER-SUBMIT contract (pinned)
- **No auto-submit anywhere client-side.** The strings `auto_submit` and
  `"submitted"` must not appear in `extension/content/`. There is no flag,
  no Pro bypass, no code path that clicks Submit.
- `APPLY_RESULT.status` from a successful fill is always `"filled"`.
  Captcha/login walls report `"captcha_stop"` / `"login_required"`.
- The engine's `ynSubmitGuard(el)` refuses any programmatic click on
  `type=submit` or an accessible name matching
  `/submit|send application|apply now|finish|complete application/i`.
  Wizard "Next"/"Continue"/"Save and Continue" is only reachable via an
  adapter's explicit `wizard.advance`, and the guard still re-checks the
  element.
- **Multi-step wizards (Workday) are human-paced by design:** after a
  fill pass, `filler.js` calls `adapter.wizard.advance(doc)` **only to
  DETECT** whether more steps remain (and `wizard.stepKey` for fillstate).
  It does **not** auto-click Next/Save and Continue. Rationale: auto-advance
  races server-side validation and sits closer to a submit path than the
  never-submit spirit allows. Overlay tells the user:
  *"Step filled (… ) — click Next/Save and Continue yourself to continue."*
  When the user advances and the next step renders, a re-trigger resumes via
  `chrome.storage` fillstate (skip already-executed fieldKeys). Auto-click
  advance is intentionally not implemented in v1.
- EEO / demographic / protected-characteristic sections are never auto-answered
  (`skip: "eeo"` → `report.skipped_eeo`).
- The popup always shows: **"Nothing was submitted — review and submit yourself."**
- **Captcha split (fill path only):** a real challenge / login interstitial
  (`ynChallengePage` — title patterns, sign-in title, password form on a login
  action) is still a hard stop → `captcha_stop`. An embedded captcha *widget*
  on an otherwise-normal apply form (`ynPassiveCaptchaPresent` — reCAPTCHA /
  hCaptcha / Turnstile iframe) does **not** abort the fill: Lever and Ashby
  embed captchas statically on every apply page, so treating them as a stop
  would block the original ATS adapters entirely. Fill proceeds, the overlay warns
  *"A captcha sits on this form — you will solve it when you submit"*, and
  evidence carries `captcha_widget=true`. Capture and every other flow keep
  the strict `ynBlocked()` check. **Never solve, never bypass, never submit.**

## Page ↔ extension messages (window.postMessage, app origin only)
`YN_APP_HELLO` (app asks the bridge to announce) · `YN_EXT_READY
{version, connected, email}` (bridge→app; `version` is the REAL installed
manifest version — it was a hardcoded string before, which hid stale
installs) · `YN_EXT_CONNECT {token, apiBase}` (app→bridge, token handoff;
the app sends an apiBase the worker's allowlist accepts — production-family
pages canonicalize to `https://youngnug.com`) ·
`YN_EXT_CONNECTED {ok, email, apiBaseRejected, error}` (bridge→app; the
failure detail is relayed so a rejected base or failed verify is
diagnosable instead of silent) ·
`YN_APPLY_CLICK {jobId, href}` (app→bridge — fire-and-forget when
the user clicks Apply; bridge relays `APPLY_CLICK` to the worker after
validating `jobId` is a finite positive number and `href` is http(s)) ·
`YN_IMPORT_STATUS {source: linkedin|github, phase: started|done|failed,
error, imported, total_imported, total_skipped}` (worker→bridge→app — live
profile-import state, so the app's import flow gates its Continue on the
REAL state: "started" on the popup consent click, "done" only after the
server accepted the merge, "failed" with the reason otherwise. The bridge
whitelists and clamps every field before it reaches the page) ·
`YN_CAPTURE_STATUS {ok, mode, host, error, duplicate, enriched, saved,
dupes, failed, ts}` (worker→bridge→app — the last capture attempt, success
or failure, broadcast the moment it happens; same whitelist-and-clamp rule,
and null batch counters stay null so a single-advert capture is tellable
from an empty batch) ·
`YN_FANOUT_OPEN {tabs: [{site, url}]}` (app→bridge, ONLY from the student's
own Search all sites click after the server permitted those sites; the page commits and sends at most `maxTabs` sites, the bound
the bridge announced in `YN_EXT_READY`, and the bridge clamps to that many
https entries as a backstop before relaying `FANOUT_OPEN` to the worker) ·
`YN_FANOUT_OPENED {ok, opened, refused: [{site, reason}], error}`
(bridge→app — what actually opened, so the page never claims a tab it does
not have; a backstop-overflow refusal says only that the tab was not
opened, never that a retry will reach it, because the bridge cannot know
what the server will permit next time).

### Search all sites (fan-out) — the bounds, pinned
The worker's `FANOUT_OPEN` opens at most FOUR ordinary, visible
`chrome.tabs.create` tabs per user gesture, first one fronted, all on the
tab strip — never a background window, never headless. Each URL must be
https and its hostname must equal the one known host for its site key — the
full table below, generated from `background.js`'s `YN_FANOUT_HOSTS`. This
table used to name four sites while the code held nine;
`tests/test_extension_contract_sync.py` parses `YN_FANOUT_HOSTS` and fails
the build if the table drifts again — update the table, never the test,
when a new host lands.
<!-- BEGIN_FANOUT_HOSTS -->
| Site key | Host |
|---|---|
| `indeed` | uk.indeed.com |
| `linkedin` | www.linkedin.com |
| `gradcracker` | www.gradcracker.com |
| `the_trackr` | app.the-trackr.com |
| `nhs_jobs` | www.jobs.nhs.uk |
| `totaljobs` | www.totaljobs.com |
| `cv_library` | www.cv-library.co.uk |
| `guardian_jobs` | jobs.theguardian.com |
| `civil_service_jobs` | www.civilservicejobs.service.gov.uk (no results-page reader) |
| `prospects` | www.prospects.ac.uk |
| `milkround` | www.milkround.com |
<!-- END_FANOUT_HOSTS -->
anything else is refused per-tab with a reason. The worker NEVER injects
scripts into these tabs and NEVER fetches these origins itself: reading a
results page stays behind the student's own Companion click on that tab
(activeTab), through the same Capture path as ever, and every captured row
lands `capture:<host>` — the personal source class that never crosses
accounts. No autonomous crawling: no pagination, no scrolling, no next
page, no second gesture invented. The web app asks the server's permission before any tab opens, and the
server's refusals are final on the client; the page commits only the sites
this gesture will open (the allowed sites cut to the announced `maxTabs`),
and the rest are offered as a later search.

## Click-time direct-link resolver (observe only)

**Rules (verbatim):** the extension never navigates or fetches any
job-board endpoint; aggregator-landed = no result reported; only the user's
own click travels.

Flow:
1. App posts `YN_APPLY_CLICK {jobId, href}` (app origin only; same origin
   checks as the other app_bridge handlers).
2. Bridge → worker `APPLY_CLICK {jobId, url}` → stores ONE
   `pending_resolve` slot `{jobId, url, ts}` in `chrome.storage.local`
   (last click wins; pairing window 180s).
3. `content/resolver_ping.js` (top-frame only) sends `ATS_PAGE_SEEN {url}`
   once when injected. No DOM reads, no fetch, no storage. It is not a
   static content script — the popup injects it CLICK-TIME, on popup open
   (the icon click is the activeTab gesture) and again inside the fill
   stack, so pairing fires when the user clicks the extension on the ATS
   tab within the 180s window. Passive no-click resolution does not exist
   by design.
4. Worker pure decision `ynResolveDecision(pending, seenUrl, nowMs)`:
   - no pending / bad url → `ignore` (keep slot if any)
   - stale (`now - ts > 180000`) → `drop` (clear slot)
   - seen host ∈ `YN_AGGREGATOR_HOSTS` (a copy of the server's own
     aggregator list, which is authoritative) → `ignore`, **keep** pending
   - seen host equals the pending click's host → `ignore`, keep pending
   - else → `post` with sanitized url (http(s) only, userinfo stripped,
     capped 2000 chars, non-empty host)
5. On `post`: dedupe if `resolved:<jobId>` already holds the same url;
   else `POST /api/jobs/<jobId>/direct-link` body `{url}` via `ynApi`
   (mirror of `CAPTURE_JOB`). 2xx → set `resolved:<jobId> =
   {url, savedAt}` and remove `pending_resolve`. 4xx → remove pending,
   cache nothing. Network/5xx → keep pending, cache nothing.

| Type | Direction | Payload | Response |
|---|---|---|---|
| `APPLY_CLICK` | bridge→worker | `{jobId, url}` | `{ok}` |
| `ATS_PAGE_SEEN` | resolver_ping→worker | `{url}` | `{ok, action}` |

Storage keys + GC bounds (in `ynStorageGc`, every worker startup):
- `pending_resolve` — single slot; swept if `ts` older than 1 hour.
- `resolved:<jobId>` — `{url, savedAt}`; TTL 30 days (`YN_RESOLVED_TTL_MS`)
  AND newest-500 cap (`YN_RESOLVED_MAX`), mirroring the fieldmap branch.

**Not in this feature:** tab APIs, new permissions, navigation, clicks,
fills, or any fetch of Reed/Adzuna/Indeed redirect endpoints. A ping from an
aggregator page is harmless by decision logic (aggregator hosts → `ignore`),
and `resolver_ping.js` itself is not a static content-script entry — it is
injected click-time (see above), which is also true of `content/
liveness_check.js` below: this extension has no static content-script entry
on any third-party host, full stop: the manifest's `content_scripts`
match only the app's own origin and the local development ports.

## Live re-check on the tab the student is already looking at

**Rules (verbatim):** a page the user opened themselves; no new tabs, no
fetches of other pages, no periodic loop; a blocked/ambiguous read is
`could_not_tell`, never `closed`; `closed` always carries the page's own
phrase as evidence.

Click-time injected — exactly like `resolver_ping.js`, and for the same
reason: this extension does not carry a static content-script entry on any
third-party host. Two gestures fire it, both shared through
`common/inject_once.js::ynPingLiveness(tabId, url)` so they cannot drift:

- **Opening the popup** on an Indeed/LinkedIn tab (`popup.js::
  pingLiveness`, called alongside `pingResolver` on every popup open —
  activeTab is granted by the click that opened the popup).
- **The Capture keyboard shortcut** (`background.js::ynCaptureActiveTab`),
  fired on the same tab the shortcut's own capture reads, best-effort and
  never allowed to delay or break that capture.

`ynPingLiveness` no-ops off `uk.indeed.com` / `www.indeed.com` /
`www.linkedin.com` (`YN_LIVENESS_HOSTS`, `common/inject_once.js`) — the only
two hosts `common/liveness_markers.js` has a phrase list for. Every call is
gated by the SAME `ynUnderCap(site)` per-site daily cap every other capped
reader in this extension spends — no separate budget invented for this
feature, and no per-site on/off switch either: assist mode (a per-site
toggle beside the cap) is deleted as a concept, so this runs whenever a
student opens one of these pages, with no toggle to check first.

Flow:
1. `ynPingLiveness` injects the stack (deduped by `ynInjectOnce`, since
   `common/api.js`'s top-level `const` bindings cannot be redeclared into
   the same isolated world) and calls `ynLivenessCheck()`
   (`content/liveness_check.js`) explicitly, every time — so a second
   popup-open on the same tab re-checks rather than silently doing nothing.
   If the kill switch/account stop is on, or the day's cap for that site is
   spent, it returns without reading anything.
2. `common/liveness_markers.js::ynDetectLiveness()` reads the page's own
   text (never markup, `<script>`/`<style>` excluded): the six
   `ynBlockedReason()` sentinels first (captcha/login wall →
   `could_not_tell`, named), then the site's own exact closed-phrase list →
   `closed` with that phrase as evidence, else `live`. An unrecognised host
   or empty page → `could_not_tell`.
3. `LIVENESS_CHECK {url, verdict, evidence}` → worker. The worker asks
   `POST /api/jobs/match-url {url}` (per-user scoped; `{}` for no match) —
   what the page said travels no further than the worker for a URL that
   does not match one of the student's own saved adverts.
4. On a match: `POST /api/jobs/<jobId>/live-report {verdict, evidence}`
   (the server records it against the same live-status fields its own
   re-check writes, never a parallel table; a `closed` verdict with no
   evidence is refused server-side with a 422, never silently accepted).
   **Once per cooldown:** the server applies its own cooldown to this write,
   no matter how many times the student's gestures land on the tab inside
   it; a row already fresher than that is served back as-is, method
   `"cached"`, with no write and no extra spend against the per-site daily
   cap. The client-side read in step 2 still runs every gesture (the page
   text costs nothing to re-read locally) — the cooldown lives at the
   write, server-side, so it applies the same way whichever gesture
   triggered it.

| Type | Direction | Payload | Response |
|---|---|---|---|
| `LIVENESS_CHECK` | liveness_check→worker | `{url, verdict, evidence}` | `{ok, matched, jobId?, status?, evidence?}` |

**Not in this feature:** a static content-script entry, a new tab, a fetch
of any page other than the one already loaded, a fan-out, a loop, or a
background poll — one call checks the ONE advert the active tab shows and
nothing else. No popup surface: the jobs list already renders `live_status`
(and now `live_evidence`) sparsely, exactly as it does for a server-side
re-check.

## Employer posting (employers.indeed.com — fill and STOP before Post)

The extension fills Indeed's employer posting wizard from the employer's own
approved YoungNug listing, inside the employer's own logged-in browser, and
**stops before the final button**. The employer presses Post themselves —
the exact mirror of the candidate-side never-submit guarantee.

### Endpoints (employer-authed, owner-scoped — foreign id = 404)
| Purpose | Method + path | Notes |
|---|---|---|
| Fill payload for a listing | `GET /api/employer/listings/:id/posting-plan` | 404 unless the caller owns the listing; 409 unless a moderator approved it (the same single publish gate as everything else). Returns `{listing_id, company, title, description, location, salary_min, salary_max, level, closing_date, application_url, application_email, company_website}`. Never a budget or payment figure. |
| Record an outcome | `POST /api/employer/listings/:id/posting-event` | `{status, detail}`, status ∈ `prepared` / `sponsorship_stop` / `aborted`. Status `"posted"` is REFUSED at the validator — the preparing flow can never claim a posting happened. Append-only trail (`posting_events`). |
| The employer's own confirmation | `POST /api/employer/listings/:id/posting-confirmed` | The ONLY path that records status `posted`. Reached exclusively through the popup's confirmation strip (`CONFIRM_POSTED`), mirroring the student `CONFIRM_APPLIED` contract. |

### Messages (runtime.sendMessage)
| Type | Direction | Payload | Response |
|---|---|---|---|
| `LIST_LISTINGS` | popup→worker | — | `{ok, listings}` (the caller's own submissions; popup shows approved only) |
| `GET_POSTING_PLAN` | content→worker | `{listingId}` | `{ok, …plan}` or `{ok:false}` (404 = not yours / not approved) |
| `POSTING_RESULT` | content→worker | `{listingId, status, detail}` | status ∈ `prepared`/`sponsorship_stop`/`aborted` only; `"posted"` refused outright, from anyone. `prepared` arms the popup's confirm strip (`pendingPostConfirm`). |
| `CONFIRM_POSTED` | popup→worker | `{listingId, posted}` | Refused from any sender with a tab (a page can never claim a posting). `posted:true` → the confirmation endpoint; either answer clears the pending question AND `postConfirmAsked` (below). |

The confirm strip asks ONCE per posting and is dismissable: `postConfirmAsked
{listingId, ts}` (local only) is written the first time the strip renders
for a given `pendingPostConfirm`, keyed by the SAME `{listingId, ts}` pair —
a second popup open with no answer given finds the marker already matches
and stays quiet, while a NEW `POSTING_RESULT status:"prepared"` writes a
fresh `ts` that does not match the old marker, so it asks again for that
posting.

### Flow (content/posting_filler.js — `ynPrepareIndeedPosting`)
1. Refuse anywhere that is not `employers.indeed.com`
   (`ynDetectEmployerPosting`, URL-keyed, deliberately separate from the
   candidate ATS rules).
2. Challenge/login wall → `POSTING_RESULT status:"aborted"`, hard stop,
   nothing bypassed.
3. **Sponsorship budget field on the page → the whole flow HALTS before any
   fill** (`sponsorship_stop`). A spend decision is never automated; the
   overlay names the field and stops.
4. Adapter plan (`content/adapters/indeed_employer.js`) — best-effort,
   login-walled selectors are unverified convention so EVERY intent is
   amber `"guessed"`; execution goes through `ynExecuteIntents`, the one
   writer, so every engine guard applies.
5. Report `prepared` + overlay ending **"Nothing was posted - review and
   post it yourself."**; the wizard's Continue is DETECTED, never clicked.

### Posting-specific guards (engine.js, shared with every flow)
- `ynSubmitGuard` also refuses posting terminals: `post job` (and a/the/
  this/your/my variants), `publish`, `confirm`, `sponsor`, `checkout`,
  `pay`. Mid-wizard `Continue` / `Save and continue` stays permitted for
  detect-only advance.
- `ynIsPaymentField` (cc-* autocomplete family; card/expiry/CVV/CVC/IBAN/
  sort-code/account-number/billing signals) → `skip:"payment"`, enforced at
  write time — a mis-planned intent cannot reach a card field. Reported as
  `report.skipped_payment`.
- `ynIsTermsCheckbox` (label matching `agree|terms|consent|authori[sz]e`) →
  never ticked, reported as `report.skipped_terms`. Agreement is the user's
  act alone, on both sides of the product.
- The strings `auto_submit`, `"submitted"` and `"posted"` remain forbidden
  in `extension/content/` (pinned).

## Own rules — adblock-filter-style, per-site, `common/own_rules.js`

The student's own text rules, one per line, edited on the options page
(`#own-rules-text`), parsed and validated by `ynParseOwnRules`. A bad line
never breaks the others — it is reported by its exact 1-indexed line number
and dropped; every other valid line still applies.

| Shape | Meaning | Example | Error(s) it can raise |
|---|---|---|---|
| `site##selector` | A CSS selector for CAPTURE. The first `##` line for a site is the title selector, the second is the body selector (one line uses it for both). Converted to the existing dev-selector shape (`ynDevSelectorJob`, `content/capture.js`) — capture's own read-only guarantee is unchanged, this only adds another source of selectors. | `jobs.acme.com##.job-title` | `unknown site shape`, `empty selector` |
| `site label=profile.key` | Map a field whose VISIBLE LABEL reads exactly `label` (whitespace-collapsed, case-insensitive) to the profile path `key`. A space separates `site` from `label`, which may itself contain spaces; `key` must be one of `YN_OWN_RULE_KNOWN_KEYS` (the same dotted paths `ynProfileGet` resolves — `contact.*`, `address.*`, `links.*`, `answers.*`, `eligibility_extra.*`, `right_to_work.*`, `education.0.*`, `work.0.*`, `cv_file`, `letter_file`, `letter_text`). | `jobs.acme.com Preferred name for badge=contact.first_name` | `unknown site shape`, `empty selector` (blank label), `unknown profile key` |
| `site!!label` | Never fill the field labelled `label` on this site — wins over EVERY other rung's guess for that same field, not only over another own rule. | `jobs.acme.com!!Referee contact details` | `unknown site shape`, `empty selector` (blank label) |
| `site$$` | Never act on this site at all: no capture, no fill, from any rule or any other rung. Takes no text after it. | `blocked.example.com$$` | `unknown site shape`, `bad operator` (trailing text) |

`site` is a bare hostname, optionally `*.`-wildcarded (`*.example.com`
matches every subdomain) — the same shape `content/capture.js`'s existing
per-site dev selectors already validate against.

**Storage and sync**: local `chrome.storage.local` key `ownRules` (raw
text) is the working copy every read (capture, fill) uses — no async
round trip mid-fill. `GET`/`PUT /api/extension/settings`'s `own_rules`
field (optional on PUT; omitted means "leave the stored value unchanged")
mirrors it to the account, so a second browser signing in for the first
time (local copy still empty) adopts the account's rules once; an install
with its own rules already keeps them rather than being overwritten by a
two-way merge this design does not attempt.

**Import/export**: the options page's two icon-only controls (`#own-rules-
import`, `#own-rules-export`) read/write a plain `.txt` file of exactly the
valid, re-serialised rules (`ynSerializeOwnRules`) — an exported file is
always something Import can read back clean, even if the textarea it was
exported from also held an invalid line at the time.

**Safety — a rule is a MAPPING, never a bypass**: an own-rule fill intent
carries the exact same shape every other rung's intent does (`fieldKey`,
`el`, `value`, `kind`, `confidence: "guessed"`, `source: "own_rule"`) and
is executed through the SAME `ynExecuteIntents` every other intent goes
through. The write-time guards there (password-scope, payment,
sensitive/truth/policy) check the LIVE ELEMENT, not which rung produced
the intent — so a rule that names a password field, an EEO field, a
payment field or a submit control is refused exactly as a mis-guess from
any other rung would be, never written. `ynOwnRuleFillIntents` is a rung
ABOVE heuristics (`content/filler.js`'s `ynPlanRungs`): its intents claim
their elements before `ynHeuristicIntents` runs, so a field an own rule
already named is never also guessed by the generic ladder.

## User scripts — `common/user_scripts.js`, `chrome.userScripts`

A student's OWN pasted script (name, one match pattern per line, code),
registered through `chrome.userScripts.register` into the `USER_SCRIPT`
world on the named sites, on page load, re-registered on the background
worker's `onInstalled`/`onStartup` and again immediately after Add on the
options page. Storage key `userScripts` (local only — never mirrored to
the server; a script is far more sensitive than a text rule, so the own-rules
server mirror does not extend to it).

**Manifest**: the `userScripts` permission, gated behind the browser's own
per-extension "Allow user scripts" toggle (Chrome 138+, off by default).
`chrome.userScripts` reads `undefined` in this extension's own JS until
BOTH the manifest permission and that toggle are on.

**Options page, two mutually exclusive surfaces** (`#user-scripts-
unavailable` + `#us-copy-enable-url`, or `#user-scripts-available`):
when `chrome.userScripts` is unavailable, ONE line naming where to enable
it plus ONE icon (copies `chrome://extensions/?id=<this extension>` to the
clipboard — a script cannot navigate to a `chrome://` URL, so this is
copy-to-clipboard, not a link) — nothing else renders. When available: the
list of stored scripts (name + site count, delete icon each), and the
add form (name / site patterns / code / an icon-only add button).

**Isolation (the reason this permission's reach is acceptable)**: the
Companion's own fill path (`content/engine.js`, every `content/adapters/
*.js`, `content/review_screen.js`, `content/filler.js`) never calls,
awaits, imports or references `common/user_scripts.js`, and that module
references nothing of theirs — proved by `tests/
test_extension_user_scripts.py` scanning the source in both directions.
Registration only ever runs from an extension page (the background worker,
the options page), never from a script injected into a web page, and
`common/user_scripts.js` is named in neither `YN_FILL_SCRIPTS` nor
`YN_POSTING_SCRIPTS`.

**The listing consequence**: the Companion's own "never auto-submits"
promise describes the code this repository ships. A script the student
registers here is theirs, not the Companion's, and can do anything a
script on that page can do, submit included — the options page's own copy
says this in one line ("Your own code. It can submit forms. The Companion
never does.") rather than leaving a reader to infer the boundary.

## Safety rules (hard — see manifest + api.js)
- **Per-job Approve/Skip is the one runtime gate.** No fill-plan without the
  user's Approve on that job.
- **v1 never submits** — user reviews and clicks submit on the employer form.
- **Captcha / bot-gate / login-wall = HARD STOP** → report `captcha_stop`/
  `login_required`, never bypass, never solve, never retry through it.
- **User's own session only** — never a second account, never headless-credential.
- **Least-privilege host permissions** (manifest lists exactly the sites served +
  the YoungNug API origin). NO `<all_urls>`. Politeness: jitter + per-site daily
  caps + a global kill switch (popup and Options).
- **Two stops, and they are not equal.** `killSwitch` is LOCAL: set, read and
  obeyed entirely inside `chrome.storage.local`, checked by `ynStopReason()`
  before any `fetch`, and it works with the API unreachable — which is the
  only state in which a stop control really has to work. No server payload
  can clear it. `serverStop` (cached from `GET /api/extension/settings` as
  `companion_stop`, with `companion_warning` beside it) is the platform's
  stop for one account; it is honestly a SOFT stop, because it can only ever
  arrive over the network, degrades to the last cached value and is unknown
  to a device that has not synced. The settings sync is the ONE call allowed
  through `serverStop` — it is the call that LIFTS one — and that exemption
  re-checks `killSwitch`, so it can never become "nothing runs except this
  one call". EVERY egress point obeys the stop, including the two raw
  `fetch`es outside `ynApi` (the keyless GitHub read and the loopback local
  model); loopback is still egress.
- **The greeting never falls back to the email address.** `GET_STATUS`
  (from `/api/me`) and `GET /api/extension/settings` both carry
  `first_name` — the same field, computed by the same server-side helper
  (the account's `full_name`, else the profile contact's own first name,
  else `null`) — so the popup and options page agree, and neither ever
  prints the account's email as a stand-in for a name it does not have.
- The extension NEVER stores the user's YoungNug password — only the scoped token.
