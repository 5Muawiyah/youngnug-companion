# Third-party notices

The Companion is published under the Apache License 2.0 (see `LICENSE` and `NOTICE`). This file
records the third-party material it contains, each part of which stays under its own licence.
Nothing here is overridden by `LICENSE`.

Every lifted block in `extension/src/` carries a first-line marker naming its source file and line
numbers; each marker resolves to a section below. Where a project contributed an idea and no code,
that is said too, because guessing in the generous direction overclaims someone else's ownership of
the code in this tree and guessing in the other direction is a licence breach.

## offeros (Apache-2.0)

```
Copyright 2026 averatec0773

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

Repo: https://github.com/averatec0773/offeros (clone `c52984f5bcfd24f35de39c6f9bdfafc5b9ab9e94`)

Lifted into: `extension/src/common/label_quality/index.js` and
`extension/src/common/challenge_detect/index.js` (from `packages/autofill/src/label-quality.ts`),
`extension/src/common/placeholder/index.js` (from `placeholder.ts`),
`extension/src/engine/engine/guards.js` (from `guards.ts`),
`extension/src/engine/repeater/index.js` (from `apps/extension/src/lib/autofill/repeater.ts` and
`packages/autofill/src/history-rows.ts`), `extension/src/engine/skills_fill/index.js` (from
`skills-fill.ts` and `skill-match.ts`), `extension/src/filler/filler/ollama_intents.js` (from
`packages/llm/src/untrusted.ts`), `extension/src/kit/aria_driver/index.js` (from `aria-driver.ts`),
and, as an idea only, `extension/src/engine/settle_observer/classify.js` (the settle-classification
approach in `dom-fill.ts`).

Changes made (Apache-2.0 §4(b)): every port is from TypeScript to plain JavaScript. The repeater
port drops the row-to-profile-entry mapping (`classifyField`/`matchHistoryField`), which lives in
this project's own heuristics; re-checks the never-submit guard on the Add control on every click
iteration, not only at discovery; adds a hard `maxAttempts` ceiling (default 50) independent of the
page's stated cap; and replaces the fixed poll loop with a caller-tunable settle window. The
label-quality port keeps the examples in its comments and rewrites the matching as inline regexes;
the captcha-pattern list is rewritten for a single plain string. The guards port keeps the
policy-class idea and rewrites the category words for this codebase. The aria-driver port is
documented function by function in the file's own header.

## resume_jobs_quick_apply (MIT)

```
MIT License

Copyright (c) 2026 Resume Jobs contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
```

Repo: https://github.com/Kerrylala/resume_jobs_quick_apply (clone
`22d0ee7d8391dc297346c3ed9f810082b5daf353`)

Lifted into `extension/src/adapters/url_scope/index.js`: `safeUrl`, `comparableExecutionUrl`,
`routeLikeFragment`, `routeSegments`, `applicationIdentityTokens` and `withinApplicationScope` from
`extensions/application_assistant/executor_core.js`, ported with `var` to `const`/`let` and renamed
with a `ynUrlScope`/`ynWithinApplicationScope` prefix; no behavioural change. Also into
`extension/src/engine/heuristics/questions.js`: the question-classification approach from the same
file (lines 845 to 904), adapted to this project's own question families.

## superfill.ai (MIT, Phase 1 self-hosted path only)

```
Copyright (c) 2025 mikr13
```

Repo: https://github.com/superfill-ai/superfill.ai (clone
`8f2f45117245092164406063ef033374f2b2236d`)

The LICENSE in that repository narrows MIT to "the self-hosted and Bring Your Own Key (BYOK) features
of this project (Phase 1)". Both files taken here sit in that Phase 1 path: a local content-script DOM
read with no auth or cloud-sync import.

Lifted into `extension/src/engine/engine/honeypot.js` (`isTopElement`, from
`src/entrypoints/content/lib/field-analyzer.ts` lines 106 to 161). Changes: this port samples three
points on the field's rectangle rather than one, is shadow-root aware via `getRootNode()`, and fails
open (never reports occlusion) in any environment without a real `elementFromPoint`, so it can only
add refusals a real browser earns.

Lifted into `extension/src/kit/dom_fill_kit/typing.js` (`ynTypeValuePerChar`, merged with the
kitswas/job-autofill source below into one function, from `dom-fill-strategies.ts`'s
`fillWithHumanTyping`, lines 24 to 77). Change: the random per-character delay is replaced by a fixed
one so the tests are deterministic.

## job-buddy (MIT)

Copyright (c) 2026 Myo Win Thein (Martin)

https://github.com/myowinthein/job-buddy (clone `d8c0a699acc6e2ee785379e9a7638fbbad70e850`)

Lifted into `extension/src/kit/dom_fill_kit/core.js` (the native-setter write's event-dispatch
block: `InputEvent('input', {inputType:'insertText', data})` then `change` then `FocusEvent('blur')`,
adapted from `src/autofill/filler.ts` `dispatchEvents`/`fillField`, lines 42 to 66 and 264 to 287)
and into `extension/src/kit/dom_fill_kit/undo.js` (`ynStashForUndo`/`ynUndoFill`, adapted from
`filler.ts`'s `setEmpty`/`clearFieldValue` double-clear pattern, lines 214 to 262, and
`src/autofill/index.ts`'s `sessionElements`/`undoAutofill`, lines 51 to 68 and 293 to 308).

Its normaliser and mapper dictionary also informed the synonym alternations in
`extension/src/engine/heuristics/patterns.js` as a word list; no function from it is reproduced.

## job-autofill (BSD-2-Clause)

Copyright (c) 2026, kitswas

https://github.com/kitswas/job-autofill (clone `7f19ae4feaeff7037f536507a9c8c80ea698cb0c`)

Lifted into `extension/src/kit/dom_fill_kit/typing.js` (`ynTypeValuePerChar`, the narrow
per-character second-pass writer, adapted from `apps/extension/src/content/applier.ts`, lines 60 to
118).

## Ideas only, no code lifted

- **harsimarsingh23/Autofill-Profile**: its synonyms table informed the label-pattern alternations in
  `extension/src/engine/heuristics/patterns.js` as words only. The repository carries no licence
  file; no code was read for lifting or lifted.
- **Br1an67/OpenJobAutofill** (`src/content.js` lines 5942 to 5977) and **Azoo92i/AutoApplyMax**: the
  re-scan-after-each-level mechanism for hierarchical choice controls in
  `extension/src/kit/dom_fill_kit/combobox.js` follows their approach; no lines were copied.
- The collapsed-section reopen in `extension/src/adapters/reopen/index.js` read an MIT-licensed
  adapter's `isActionControl` for the idea; the code there is original.

An idea or an algorithm is not something copyright reaches, so nothing is owed for these; saying
where an idea came from is the right thing to do regardless.

## Vendored test files

Two files under `tests/ext_fixtures/vendor/` are hand-copied production builds of React, used as a
static DOM fixture for the content-script tests (`tests/ext_fixtures/react_controlled.html`). They
are test scaffolding, not part of the extension:

- `react.production.min.js`
- `react-dom.production.min.js`

Both carry Facebook, Inc.'s MIT licence header. Their in-file header originally pointed at "the
LICENSE file in the root directory of this source tree", which in React's own repository is MIT; in
this repository the root `LICENSE` is Apache-2.0, so both headers were edited to point at this file
instead, with the original copyright line left untouched. `react-dom.production.min.js` also carries
one stray `Modernizr 3.0.0pre (Custom Build) | MIT` comment with no Modernizr code following it; it
is MIT-licensed either way and is recorded rather than deleted.

## Build and test dependencies

Installed by a package manager, never copied into this repository; each ships its own licence file
in `node_modules/` or `site-packages/`.

| Package | Used for | Licence |
|---|---|---|
| esbuild | bundling `extension/src/` into the shipped files | MIT |
| jsdom | the browser-free Node test runners | MIT |
| pytest | the Python test suite | MIT |
| playwright | the headless-Chromium fixtures in `tests/ext_harness.py` | Apache-2.0 |

The extension itself has no runtime dependency.
