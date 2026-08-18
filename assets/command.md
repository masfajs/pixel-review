---
description: Design review — Playwright exploration + CHOICE+NNG-weighted UX audit → HTML report
---

Run a full design review on the prototype. $ARGUMENTS

**Never use `mcp__claude-in-chrome__*` tools for this workflow.** All exploration and interaction must
go through `node_modules/pixel-review/src/driver.js` (Playwright, headless) via `flow.json` triggers —
including `type:` and `select-text:` for text fields and custom dropdowns. If a state seems impossible
to reach with the trigger DSL, extend the DSL in `node_modules/pixel-review/src/driver.js` rather than
falling back to manual browser control; manual browser screenshots are far more expensive in context
than the script's `result.json` output.

## Pre-flight checks

**Step 1 — verify the driver exists:**

```bash
test -f node_modules/pixel-review/src/driver.js && echo "OK" || echo "MISSING"
```

If MISSING: tell the user to install the package (`pnpm add -D pixel-review` / `npm install -D
pixel-review` / `yarn add -D pixel-review`, matching whichever lockfile the repo already uses), then
run `/pixel-review` again. Do not proceed.

**Step 2 — verify the Chromium browser binary is installed:**

```bash
npx playwright install --dry-run chromium 2>&1 | grep -qi "is already installed" && echo "OK" || echo "MISSING"
```

If MISSING: stop and tell the user:

> The Chromium browser binary isn't installed yet. Run this once per machine, then run `/pixel-review`
> again:
>
> ```
> npx playwright install chromium
> ```

---

## Collect inputs

Parse `$ARGUMENTS` (if provided) for:

1. **Prototype URL** — any URL found in `$ARGUMENTS`. If none, ask the user (default
   `http://localhost:3000`, accept a subpath like `/customers`).
2. **PRD URL** _(optional)_ — a Confluence, Coda/Superhuman, or other doc URL among the URLs found.
3. **Flow/feature instruction** _(optional)_ — the non-URL, natural-language part of `$ARGUMENTS`
   describing what to review, e.g. `"create ticket flow"` in
   `"create ticket flow https://prototype.example.com/tickets/all-tickets"`.

If no `$ARGUMENTS` were provided, ask the user for:

1. **Prototype URL** — default `http://localhost:3000` (accept a subpath like `/customers`)
2. **PRD URL** _(optional)_ — Confluence, Coda/Superhuman, or any web URL with feature requirements.
   Tell the user: "PRD URL is optional — skip it and PRD Coverage will be excluded from the score."
3. **Flow/feature to focus on** _(optional, only ask if PRD URL was skipped)_ — tell the user: "You can
   name a specific flow or feature (e.g. 'create ticket flow') to keep the review focused, or leave
   this blank to let me explore the whole app."

If the user skips PRD URL, set `prd_skipped = true`.

**Determine review mode:**

| Condition                                           | Mode                  |
| --------------------------------------------------- | ---------------------- |
| PRD URL given                                       | **PRD mode**           |
| No PRD URL, but a flow/feature instruction is given | **Instruction mode**   |
| Neither PRD URL nor flow/feature instruction given  | **BFS fallback mode**  |

BFS fallback mode crawls the entire app's top-level navigation and produces a broad, shallow report —
only use it when the user has given no scope at all. Prefer instruction mode whenever any flow or
feature intent can be read from the request; don't default to BFS just because a PRD wasn't provided.

Confirm before proceeding, stating which mode was selected.

---

## Determine report filename

Get the current git branch:

```bash
git rev-parse --abbrev-ref HEAD
```

Replace every `/` with `-` to get a safe branch slug. Example: `feat/voc-filter` → `feat-voc-filter`.

**Never overwrite a previous report.** Each run writes a new file — append today's date so successive
reviews on the same branch don't clobber each other and stay comparable side by side:

```bash
date +%Y%m%d
```

Report output: `reports/<branch-slug>-<YYYYMMDD>.html` (e.g. `reports/feat-voc-filter-20260813.html`).
If that file already exists (a second review ran today on the same branch), append `-2`, `-3`, etc.
until the path is free — check with `test -f reports/<branch-slug>-<YYYYMMDD>.html`.
Use this same final stem for `{{EXPORT_FILENAME}}` (`<stem>-pixel-review.md`) later.

---

## Fetch PRD requirements

**PRD mode only.** Skip this step for instruction mode and BFS fallback mode.

**Do this BEFORE running Playwright.** The PRD determines what Playwright visits.

Use the Atlassian MCP (`getConfluencePage`) or WebFetch on the PRD URL. Extract every
user story, acceptance criteria, or feature requirement. Keep a numbered list — you'll use this to:

1. Generate the flow config for Playwright
2. Produce the gap analysis in Framework 1

---

## Generate flow config

Skip this entire section only in **BFS fallback mode**. Both PRD mode and instruction mode produce a
`flow.json` and run Playwright via `--flow-config` — never `--url` alone.

```bash
mkdir -p reports/.tmp-review/
```

### PRD mode

From the PRD requirements, produce a JSON array that maps every user story to a specific route +
state + interaction trigger.

### Instruction mode

From the user's flow/feature instruction (e.g. `"create ticket flow"`), work out what to test:

1. Identify the most likely starting route from the given prototype URL (e.g. `/tickets/all-tickets`
   for a "create ticket flow").
2. Run one lightweight discovery pass via `node_modules/pixel-review/src/driver.js` (never
   `claude-in-chrome`) against that route before writing any triggers, so you know what's actually on
   the page:
   ```bash
   node node_modules/pixel-review/src/driver.js --url <prototype-url> --routes <route> --out-dir reports/.tmp-review/
   ```
   Read `reports/.tmp-review/result.json` and inspect the `elements` (buttons, inputs) captured for
   that route's initial state to find what opens the flow (e.g. a "Create ticket" button).
3. Using what you find, hand-author 4–8 `flow.json` entries that cover the flow end-to-end: the
   initial state, opening the form/drawer/modal, filling key fields, and at least one edge case
   relevant to the instruction (e.g. submitting with required fields empty, cancelling with unsaved
   input). A single happy-path screenshot doesn't earn its keep — probe for gaps.
4. Tag each entry's `us` array with a short slug describing the flow instead of a PRD user story ID,
   e.g. `["create-ticket-flow"]`, since there's no PRD to map against.
5. Discard the discovery-pass `result.json` before running the real flow-config pass in **Run
   Playwright** below — it was only for reconnaissance.

Both modes write the completed JSON to `reports/.tmp-review/flow.json` using the same format, trigger
table, and mapping rules below.

**Format:**

```json
[
  {
    "route": "/path/to/screen",
    "state": "descriptive-state-name",
    "us": ["US-01", "US-02"],
    "trigger": null
  },
  {
    "route": "/path/to/screen",
    "state": "after-action",
    "us": ["US-03"],
    "trigger": "click-text:Button Label,wait:1500"
  }
]
```

**`trigger` format** — comma-separated steps executed in order before the screenshot:

| Step                      | Action                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `null`                    | No interaction — just screenshot                                                                                                                                                                                            |
| `click:<css-selector>`    | Click element by CSS selector                                                                                                                                                                                               |
| `click-text:<label>`      | Click a `button`/`a`/`[role=button]`/`.mp-button` by exact text content                                                                                                                                                     |
| `select-text:<label>`     | Click a dropdown/autocomplete option row by exact text — broader match than `click-text` (also matches `li`, `[role=option]`, popover/list items), use for autocomplete/popover-list options that aren't real buttons     |
| `type:<selector>\|<text>` | Click `<selector>` to focus it, then type `<text>` via real keystrokes (fires input/autocomplete listeners). Omit `<selector>\|` to type into whatever already has focus (chain right after a `click:`/`select-text:` step) |
| `wait:<ms>`               | Wait N milliseconds                                                                                                                                                                                                         |
| `scroll`                  | Scroll to page bottom                                                                                                                                                                                                       |
| `scroll-top`              | Scroll back to top                                                                                                                                                                                                          |
| `key:<key>`               | Press keyboard key (e.g. `key:Escape`)                                                                                                                                                                                      |
| `hover:<css-selector>`    | Hover over element                                                                                                                                                                                                          |
| `navigate:<path>`         | Navigate to a different path                                                                                                                                                                                                |

**Mapping rules:**

- Group states from the same route together — Playwright navigates once per route, then applies
  triggers sequentially. Do not interleave routes.
- Use `null` trigger for the initial/default state of a route.
- If a US requires interacting with an element that reveals another element (drawer, modal, tooltip),
  chain steps: `"trigger": "click-text:Open filter,wait:800"`.
- If a state requires filling a form (e.g. a required text field) before a button becomes clickable,
  chain a `type:` step: `"trigger": "type:input[placeholder='Enter template name']|pixel_review_test,click-text:Continue,wait:800"`.
- If a state requires picking an option from a custom dropdown/autocomplete (not a native `<select>`),
  use `select-text:` instead of `click-text:`: `"trigger": "click:#audience-select,select-text:Most valuable customers,wait:500"`.
- If a US maps to a state that requires backend data to exist (e.g. a results table only shows after
  AI processing completes), mark it with `"us": ["US-XX"]` and `"trigger": null` — Playwright will
  screenshot whatever is visible; you'll assess the gap in Framework 1.
- Every US from the PRD (or flow tag, in instruction mode) must appear in at least one entry's `us`
  array.

Write the completed JSON to `reports/.tmp-review/flow.json`.

---

## Run Playwright

**PRD mode or instruction mode** (flow config exists), run in flow config mode:

```bash
node node_modules/pixel-review/src/driver.js --url <prototype-url> --flow-config reports/.tmp-review/flow.json --out-dir reports/.tmp-review/
```

**BFS fallback mode only** (no PRD, no flow instruction given), run in BFS discovery mode:

```bash
node node_modules/pixel-review/src/driver.js --url <prototype-url> --out-dir reports/.tmp-review/
```

The script uses Chrome with your existing session (copies profile to temp dir if Chrome is running).
After completion, read the output:

```bash
cat reports/.tmp-review/result.json
```

---

## Apply review frameworks

**Run all frameworks to completion before generating the report.** Do not output partial findings as
you go — hold everything until all 4 are done. Only **CHOICE** and **NNG** factor into Overall; **PRD
Coverage** and **AI UT Simulation** are still run and shown in the report, but informational only.

For each framework, produce a structured findings list internally:

```
{ screen, state, principle, severity, description, has_screenshot: true/false }
```

Severity: Critical | Major | Minor | Passed

Screenshot a state only when a finding of Minor severity or above is identified. Passed states → no
screenshot in the report.

---

### Framework 1 — PRD Coverage (informational — never factors into Overall)

If `prd_skipped = true`: mark this framework as **N/A — no PRD provided**. Skip the gap table in the
report and note the omission in the scorecard.

Otherwise, for **every** user story in the PRD, explicitly classify it:

| Status         | Meaning                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| ✅ Implemented | Screen/state captured by Playwright shows this US clearly                   |
| ⚠️ Partial     | UI element exists but incomplete, missing label/state, or differs from spec |
| ❌ Not found   | No corresponding screen, state, or UI element in the prototype              |

Produce a gap table — every US listed, no exceptions. This is the primary deliverable of this framework.

Score: (✅ count + 0.5 × ⚠️ count) / total US × 100, rounded to nearest integer.

The gap table rows (only `<tr>` elements, no wrappers) go into `{{PRD_GAP_ROWS_HTML}}`. Section 04 structure is already in the template. If PRD is skipped, inject a single colspan row with "PRD tidak disertakan".

---

### Framework 2 — CHOICE Principles

Evaluate each of the 6 principles (C, H, O, I, C, E) across all screens, using
`node_modules/pixel-review/assets/principles.md` `## CHOICE Principles`.

For each principle, note screens where it is satisfied and screens where it falls short.

Score: average of 6 principle scores (each 0–100).

---

### Framework 3 — NNG Heuristics

Evaluate all 10 heuristics from `node_modules/pixel-review/assets/principles.md`
`## NNG 10 Usability Heuristics`. For each heuristic, check every screen.

Use inline reference format: `H4 · Consistency`

Score: (heuristics fully satisfied / 10) × 100.

---

### Framework 4 — AI UT Simulation (informational — never factors into Overall)

Simulate 5 personas interacting with the prototype based on the Playwright result. Each persona has:

- Background, role, goals
- Primary task they'd attempt
- Findings from their perspective
- A simulated quote (first-person, realistic)
- Task completion: **Berhasil** / **Berhasil dengan kesulitan** / **Gagal**

Personas (adjust to fit the feature being reviewed — these are a generic starting set, swap in
personas that actually match the product):

1. **Sales Rep** — B2B account executive, high call volume, driven by daily targets
2. **Customer Service Agent** — handles incoming tickets under SLA pressure, context-switching often
3. **Supervisor / Team Lead** — monitors team performance, pulls reports, rarely does direct tasks
4. **Marketing Manager** — manages broadcast campaigns and contact lists, not highly technical
5. **New employee** — first week, no formal training, navigating the product cold

Score: (tasks completed or completed with difficulty) / 5 × 100.

---

### Overall score

`Overall = round(SCORE_CHOICE × 0.6 + SCORE_NNG × 0.4)`. Only CHOICE and NNG feed this number — PRD
Coverage and AI UT Simulation scores are never part of it, even when both are computed and shown.

---

## Generate HTML report

After all 4 frameworks are complete, generate the report by filling in
`node_modules/pixel-review/assets/report-template.html`.

**Read the template first:**

```bash
cat node_modules/pixel-review/assets/report-template.html
```

The template has `{{PLACEHOLDER}}` markers for all dynamic content. Replace every marker with your
analysis results. Do NOT modify the CSS or JavaScript — only replace content placeholders. Write the
completed HTML to `reports/<branch-slug>-<YYYYMMDD>[-N].html` (the stem decided earlier — do not reuse
a filename from a previous run, even for the same branch).

**Write the generation script to a temp file and run it** (never use `node -e` with complex content
containing quotes — it causes SyntaxError):

```bash
node /tmp/gen-pixel-report.mjs
```

### Placeholder reference

| Placeholder                   | What to put                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{{TITLE}}`                   | `Pixel Review — <page-name> — branch: <branch>`                                                                                                                                   |
| `{{VERDICT_BADGE}}`           | e.g. `&#9888; Needs Polish` or `&#10003; Ready`                                                                                                                                   |
| `{{HEADLINE}}`                | One punchy sentence summarising the overall finding                                                                                                                               |
| `{{SUBTITLE_HTML}}`           | 2–3 sentence executive summary; wrap key terms in `<strong>`                                                                                                                      |
| `{{PROTOTYPE_URL}}`           | Full URL including path                                                                                                                                                           |
| `{{REVIEW_DATE}}`             | ISO date e.g. `2026-08-12`                                                                                                                                                        |
| `{{META_STATS}}`              | e.g. `3 rute · 7 states · 19 US dikaji`                                                                                                                                           |
| `{{SCORE_OVERALL}}`           | Integer 0–100 — `round(SCORE_CHOICE × 0.6 + SCORE_NNG × 0.4)`                                                                                                                     |
| `{{SCORE_CHOICE}}`            | Integer 0–100                                                                                                                                                                     |
| `{{SCORE_NNG}}`               | Integer 0–100                                                                                                                                                                     |
| `{{SCORE_LEGEND_HTML}}`       | Four `<span>` tags; add `data-current=""` to the matching band (see below)                                                                                                        |
| `{{PRD_GAP_ROWS_HTML}}`       | Only the `<tr>` rows for each US; if PRD skipped, inject one row: `<tr><td colspan="4" style="text-align:center;color:var(--mp-text-placeholder)">PRD tidak disertakan</td></tr>` |
| `{{WALKTHROUGH_STATES_HTML}}` | All state cards (see HTML comments in template for structure)                                                                                                                     |
| `{{CROSSFLOW_TITLE}}`         | Section 02 heading e.g. `CHOICE & NNG — Keseluruhan Halaman`                                                                                                                      |
| `{{CROSSFLOW_ANALYSIS_HTML}}` | Cross-flow prose paragraph                                                                                                                                                        |
| `{{AI_UT_PERSONAS_HTML}}`     | All persona cards (see HTML comments in template)                                                                                                                                 |
| `{{AI_UT_INSIGHT}}`           | 1–2 sentence aggregate insight across personas                                                                                                                                    |
| `{{FD_JSON}}`                 | JS object: `{ fN: { d:'title', sc:'Screen/State', fw:'FW · Principle', sv:'Major\|Minor' }, ... }`                                                                                |
| `{{VERDICT_TEXT}}`            | e.g. `Needs Polish` (used in export markdown)                                                                                                                                     |
| `{{PRD_SCORE}}`               | Score integer or `N/A`                                                                                                                                                            |
| `{{EXPORT_FILENAME}}`         | `<branch-slug>-<YYYYMMDD>[-N]-pixel-review.md`                                                                                                                                    |

**Score legend HTML pattern** — add `data-current=""` only to the matching band:

```html
<span>0–49 Not Ready</span>
<span>50–69 Needs Work</span>
<span data-current>70–84 Needs Polish</span>
<span>85–100 Ready</span>
```

All screenshots are embedded as `data:image/png;base64,...` from result.json — no external files.

---

## Cleanup

After the HTML is generated:

```bash
rm -rf reports/.tmp-review/
```

---

## Open report

```bash
open reports/<branch-slug>-<YYYYMMDD>[-N].html
```

Tell the user the report is ready and note the filename.
