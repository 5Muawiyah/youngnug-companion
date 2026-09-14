// extension/src — the Companion's ES module source.
//
// Every shipped file the manifest or an injection list names (background.js,
// popup.js, options.js, common/*.js, content/*.js, content/adapters/*.js) is
// esbuild OUTPUT. The source for a migrated file lives under this folder, in
// a sub-folder named after its layer, and is bundled by
// scripts/build_extension.py (an esbuild --bundle --format=iife step) back
// into the exact shipped path extension/src/entries.json names for it.
// The built file is committed alongside its source; tests/test_extension_
// build_no_drift.py fails if a fresh build differs from what is committed,
// so the tree can never silently drift from its own source.
//
// A shipped file not yet listed in entries.json is still the literal,
// unmigrated original — the refactor moves one file at a time, largest
// first, never as one rewrite.
//
// Why the shipped files stay where they are: the user's Chrome loads the
// extension UNPACKED from extension/ and the server zips that same tree
// — both read the shipped paths, not src/. Keeping the shipped paths as the
// build's output means nothing about loading, reloading or packing the
// extension changes.
//
// Cross-file calling stays on globalThis: before this refactor every shipped
// file was a plain classic script and chrome.scripting.executeScript
// injected a list of them into ONE isolated world in order, so a top-level
// function/const/let/class in one file was a bare name any later file in the
// list could call. That stays true: esbuild bundles each shipped file's
// source into one classic-script IIFE, and at the end of it every name that
// was top-level in the ORIGINAL file is assigned onto globalThis — so the
// set of names a later-injected file can see is unchanged, file by file. No
// real ES import/export crosses two DIFFERENT shipped files' source; an
// import only ever resolves inside one file's own subtree (see below).
// Cross-file calls stay bare-global calls, resolved at runtime, exactly as
// before.
//
// One bundle, one subtree — no cross-entry imports: each migrated shipped
// file's source lives entirely under one folder here (src/<layer>/<name>/),
// and an import inside that folder may only reach another file inside that
// SAME folder. The module graph test walks every import in this tree and
// refuses one that leaves its own folder, and separately refuses a cycle
// among the files that remain. Because no import ever crosses a shipped-file
// boundary, no import can ever run against the layer order below either —
// the two checks are one test.
//
// The layer table: each shipped file is assigned to exactly one layer, and
// the folder holding its source sits directly under that layer's name. The
// order is the direction dependencies are ALLOWED to run in conceptually
// (common code knows nothing above it; a UI screen may use anything below
// it) — enforced in practice by the no-cross-entry rule above, since no
// shipped file's source imports another shipped file's source at all.
//
//   common    src/common/     common/api.js, common/challenge_detect.js,
//                              common/inject_once.js, common/label_quality.js,
//                              common/liveness_markers.js,
//                              common/placeholder.js, common/yn_theme.js
//   kit       src/kit/        content/dom_fill_kit.js, content/aria_driver.js,
//                              content/password_kit.js
//   engine    src/engine/     content/engine.js, content/detect.js,
//                              content/heuristics.js, content/repeater.js,
//                              content/skills_fill.js
//   adapters  src/adapters/   content/adapters/*.js (one folder per file)
//   filler    src/filler/     content/filler.js
//   ui        src/ui/         content/capture.js, content/assist.js,
//                              content/settle_observer.js,
//                              content/review_screen.js,
//                              content/linkedin_profile.js,
//                              content/liveness_check.js, content/glassdoor.js,
//                              content/posting_filler.js,
//                              content/resolver_ping.js, content/app_bridge.js,
//                              popup.js, options.js, background.js
//
// Module size: no file under src/ may exceed 400 lines (blank lines and
// comments count). A guard script outside this repo walks this tree and
// prints every offender.
//
// This file is documentation only — it is not an esbuild entry and builds
// nothing.
