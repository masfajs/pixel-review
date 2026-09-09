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
node -e "const {chromium}=require('@playwright/test');const fs=require('fs');process.exit(fs.existsSync(chromium.executablePath())?0:1)" && echo "OK" || echo "MISSING"
```

`test -d node_modules/@playwright/test` alone is not enough — the npm package can be present while the
actual browser binary was never downloaded, and this check would pass either way. The check above
verifies the binary itself is on disk (it fails the same way, with a non-zero exit, if `@playwright/test`
isn't even installed — same MISSING branch covers both).

If MISSING: stop and tell the user:

> Playwright's Chromium browser binary isn't installed yet (or `@playwright/test` itself is missing).
> Run these once per machine, then run `/pixel-review` again:
>
> ```
> pnpm add -D @playwright/test   # only if the package itself is missing
> npx playwright install chromium
> ```

---

## Collect inputs

Resolve prototype URL, PRD URL, and flow/feature scope from these sources, in priority order — stop
at the first source that supplies a given input, and never ask for something an earlier source
already gave you:

1. **`$ARGUMENTS`** — any URL found is the prototype URL (or the PRD/doc URL, if it looks like
   Confluence/Coda/Superhuman); non-URL text is the flow/feature instruction, e.g. `"create ticket
   flow"` in `"create ticket flow https://prototype.example.com/tickets/all-tickets"`.
2. **The current conversation**, if `/pixel-review` is running in the same session as the "vibe
   coding" (implementing/iterating) work that came right before it — don't make the user restate
   context you already have from watching them build it:
   - **Flow/feature scope** — infer from what was just implemented: which routes/pages, which
     feature or user story.
   - **PRD URL** — reuse a Confluence/Coda/doc link already shared earlier in this conversation.
   - **Prototype URL** — reuse a URL already established this session (e.g. from a `pnpm dev` run,
     or a route already navigated to together).
3. **Ask the user** — only for whatever steps 1–2 didn't supply:
   - **Prototype URL** — default `http://localhost:3000` (accept a subpath like `/customers`).
   - **PRD URL** _(optional)_ — Confluence, Coda/Superhuman, or any web URL with feature requirements.
     Tell the user: "PRD URL is optional — skip it and PRD Coverage will be excluded from the score."
   - **Flow/feature to focus on** _(optional, only ask if PRD URL was skipped)_ — tell the user: "You
     can name a specific flow or feature (e.g. 'create ticket flow') to keep the review focused, or
     leave this blank to let me explore the whole app."

If steps 1–2 already cover everything, **state what you inferred in one line** instead of opening with
a question — e.g. "Review scope: create ticket flow at `/tickets/all-tickets`, no PRD." The user
corrects you if it's wrong; they shouldn't have to answer from a blank slate when you already watched
them build the thing. Only fall through to asking (step 3) when the scope is genuinely ambiguous — a
fresh session with no prior context, or a vibe-coding session that touched several unrelated features.

If the user skips PRD URL, set `prd_skipped = true`.

4. **Resolve the persona roster** — determines who drives exploration below AND who Framework 4
   narrates. Resolve in order, stop at the first source that supplies a roster, but always still check
   for supplementing (e) if the roster is short of the target participant count:

   a. **PRD's own persona table** — if PRD mode is active and the fetched PRD has a persona/target-users
      section (heading wording varies — "Target Users", "Persona", "Target Audience", etc. — match
      loosely on a table naming a Persona/Role + Goal/Pain, don't require exact wording). Rows are
      often labeled Primary/Secondary: Primary is mandatory and runs first; Secondary is included by
      default but is the first candidate to trim under time/participant constraints.
   b. **User explicit override** — anything the user names in `$ARGUMENTS` or conversation overrides or
      adds to (a).
   c. **MCP curated persona library** (only if `mcp__claude_ai_User_syntethics__*` tools are available
      in this session) — before casting anything new, check for an existing match:
      `search_research(domain="personas", query=<feature/module name>)` or
      `list_research_docs(domain="personas")`, specifically:
      - `personas/qontak-module-personas/desk-2026-07-29/findings.md` (feature-level archetypes)
      - `personas/qontak-user-personas/desk-2026-07-28/findings.md` (product-wide tiered set)
      If the module under review already has an archetype here, `get_research_doc` it and use directly
      — reuse for consistency across repeated reviews of the same module, don't recast.
   d. **Prior UT/concept-test research on the SAME feature (enrichment only, never a roster source)** —
      if the MCP is available, `search_research(domain=<matching PRD domain>, method="ut"|"concept")`.
      If found, `get_research_doc` it and use it to ground persona behavior/wording and which states to
      specifically re-probe (known friction points) — applies to whichever roster (a)/(b)/(c)/(e)
      supplied, never adds/removes roster members on its own.
   e. **Cast new via MCP `synthetic_get_evidence`** — only when (a)-(c) produced nothing, or the roster
      is short of the target participant count and needs ADDITIONAL distinct personas (never replacing
      a/b/c). Mandatory: call `synthetic_start_study` first — it returns a protocol requiring an
      explicit STUDY BRIEF approval before `synthetic_get_evidence` can run; this is a hard tool-side
      gate, never skip or paraphrase around it. If the roster's shortfall is already known at the
      "Confirm before proceeding" step below, fold the STUDY BRIEF preview into that same confirmation
      instead of stopping twice; if the shortfall only becomes apparent later, let this stand as a
      second, separate stop. Ground the cast with `list_modules` once, then `get_module_records` on
      `nps` / `feature-requests` / `won-deals` / `loss-deals` / `pms` for real role/industry/tenure/
      pain/adoption numbers. Use `synthetic_read_source` before grounding claims on any `lib:`-cited
      source in the evidence pack (previews only by default).
   f. **Fallback — the 5 generic personas** (see Framework 4) — only when (a)-(e) all produced nothing
      (no PRD table, no user input, MCP unavailable or declined).

   If no MCP tools are available at all in this session, silently skip (c)/(d)/(e) — don't nag the user
   about a tool they don't have.

   **Dossier personas (sources c and e) keep their full User Synthetic dossier — never compressed.**
   A persona resolved from (c) the MCP persona library or (e) a freshly cast panel comes with a full
   dossier (role & work, behavior patterns, cited requests/pain points, a 120–250 word day-in-the-life,
   and citations — per `pack.prompts.cast`/`pack.render.dossier`). Mark this persona `hasDossier: true`
   and carry the **entire** dossier through to the report tab in "Generate HTML report" below verbatim
   — the MCP protocol itself is explicit that "a name-plus-two-lines summary is a violation." Personas
   from (a) the PRD table or (b) your own input have no dossier and use the plain persona-card format
   instead — don't invent a fake dossier for them.

   **Target participant count** (relevant only if (e) may trigger): look for an explicit count in the
   fetched PRD/research-plan text (e.g. "test with 5 users"). If absent, propose **3** as part of the
   mode-confirmation step below — adjustable by the user before proceeding.

   **Persona slugs**: every resolved persona gets a slug for file paths — lowercase, non-alphanumeric
   runs collapsed to a single hyphen, trimmed (e.g. "Sales/CS Team Lead" → `sales-cs-team-lead`). Use
   this slug consistently across discovery, the real run, and FD_JSON persona tags later.

**Determine review mode:**

| Condition                                           | Mode                  |
| --------------------------------------------------- | ---------------------- |
| PRD URL given                                       | **PRD mode**           |
| No PRD URL, but a flow/feature instruction is given | **Instruction mode**   |
| Neither PRD URL nor flow/feature instruction given  | **BFS fallback mode**  |

BFS fallback mode crawls the entire app's top-level navigation and produces a broad, shallow report —
only use it when the user has given no scope at all. Prefer instruction mode whenever any flow or
feature intent can be read from the request; don't default to BFS just because a PRD wasn't provided.

Confirm before proceeding, stating which mode was selected AND the resolved persona roster, e.g.:

> Review scope: create-segment flow. Personas: Sales/CS Team Lead (Primary, from PRD), Marketing/
> Campaign Manager (Secondary, from PRD). Proceeding with 2 personas — say so now to add/remove any.

If step 4e is already known to be needed at this point (roster short of the target participant count),
append the STUDY BRIEF preview to this same message instead of stopping twice later.

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

If the persona roster has more than one persona, branching per persona here is optional — PRD mode's
requirement-to-state mapping already gives broad coverage. Only author persona-specific entries when
the PRD itself implies role-specific entry points (e.g. Primary and Secondary personas reach the same
feature through different menus).

### Instruction mode

From the user's flow/feature instruction (e.g. `"create ticket flow"`), work out what to test. If the
persona roster has one or more personas, **repeat steps 1–4 once per persona** — each persona's goal
and familiarity level shapes both the discovery pass and which triggers get authored (e.g. a "new
employee" persona may open a help tooltip or misclick before finding the right control; a power-user
persona jumps straight to the fastest path). **Enforce divergence**: if two personas would otherwise
produce an identical `flow.json`, add at least one persona-specific state/step for one of them rather
than letting the files end up byte-identical — the point of running multiple personas is that they
genuinely differ.

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

Both modes write the completed JSON using the same format, trigger table, and mapping rules below —
to `reports/.tmp-review/flow.json` when the roster has 0 or 1 persona, or to
`reports/.tmp-review/<persona-slug>/flow.json` (one file per persona, using the slug from "Collect
inputs" step 4) when the roster has more than 1.

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
| `click-nth:<css-selector>\|<index>` | Click the `<index>`-th (0-based) match of a selector — for forms with several identical custom controls that share no unique id                                                                                 |
| `click-text:<label>`      | Click a `button`/`a`/`[role=button]`/`.mp-button` by exact text content                                                                                                                                                     |
| `select-text:<label>`     | Click a dropdown/autocomplete option row by exact text — broader match than `click-text` (also matches `li`, `[role=option]`, popover/list items), use for autocomplete/popover-list options that aren't real buttons; also matches multi-line rows (label + secondary text) by prefix |
| `click-in:<container-selector>\|<label>` | Click by exact text, scoped to a container — use when the same label appears in more than one place (e.g. a closed popover that stays mounted off-screen) |
| `check:<input-selector>`  | Check/toggle a radio or checkbox whose native input is visually hidden behind a styled span — clicks the associated `<label>`, falling back to a forced click on the input itself |
| `type:<selector>\|<text>` | Click `<selector>` to focus it, then type `<text>` via real keystrokes (fires input/autocomplete listeners). Omit `<selector>\|` to type into whatever already has focus (chain right after a `click:`/`select-text:` step) |
| `wait:<ms>`               | Wait N milliseconds                                                                                                                                                                                                         |
| `scroll`                  | Scroll to page bottom — also scrolls the tallest inner scroll container, for app shells that pin the header/footer and leave the window itself nothing to scroll                                                          |
| `scroll-top`              | Scroll back to top — also resets any scrolled inner containers                                                                                                                                                              |
| `scroll-in:<css-selector>`| Scroll one named container to its bottom, for pages with several independent scroll panes where the generic `scroll` picks the wrong one                                                                                   |
| `scroll-to-text:<label>`  | Scroll a section into view by its exact heading/text — use when a pixel offset or a selector would break across layout changes                                                                                             |
| `key:<key>`               | Press keyboard key (e.g. `key:Escape`)                                                                                                                                                                                      |
| `hover:<css-selector>`    | Hover over element                                                                                                                                                                                                          |
| `hover-text:<label>`      | Hover a row by its exact visible text — use for cascading menus/submenus that open on `mouseenter` and have no stable selector                                                                                             |
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

Write the completed JSON per the persona-path rule above (flat `reports/.tmp-review/flow.json` for a
0-or-1-persona roster, `reports/.tmp-review/<persona-slug>/flow.json` per persona otherwise).

---

## Run Playwright

**PRD mode or instruction mode, roster of 0 or 1 persona** (flow config exists), run in flow config
mode:

```bash
node node_modules/pixel-review/src/driver.js --url <prototype-url> --flow-config reports/.tmp-review/flow.json --out-dir reports/.tmp-review/
```

**PRD mode or instruction mode, roster of more than 1 persona** — run once per persona, each into its
own subdirectory so screenshots/results never collide:

```bash
node node_modules/pixel-review/src/driver.js --url <prototype-url> --flow-config reports/.tmp-review/<persona-slug>/flow.json --out-dir reports/.tmp-review/<persona-slug>/
```

**BFS fallback mode only** (no PRD, no flow instruction given), run in BFS discovery mode:

```bash
node node_modules/pixel-review/src/driver.js --url <prototype-url> --out-dir reports/.tmp-review/
```

The script uses Chrome with your existing session (copies profile to temp dir if Chrome is running).
After completion, read the output — `reports/.tmp-review/result.json` for a single run, or each
persona's `reports/.tmp-review/<persona-slug>/result.json` for a multi-persona roster:

```bash
cat reports/.tmp-review/result.json
```

**Dedupe before scoring, when the roster has more than 1 persona**: compare every persona's
`result.json` entries by exact `route + "::" + state` string match. If two or more personas produced
the same key, read and score that screenshot only **once** — never re-spend vision tokens re-reading an
identical image — and record which personas visited it (this becomes the `p` array on that finding's
FD_JSON entry, see "Apply review frameworks" below).

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

`principle` must be exactly one of the 6 CHOICE principle names or 10 NNG heuristic codes — no other
spelling, since the report's JS keys its scoring off this exact string:

- CHOICE: `Clear`, `Holistic`, `Open`, `Individual`, `Contextual`, `Emotional`
- NNG: `H1`, `H2`, `H3`, `H4`, `H5`, `H6`, `H7`, `H8`, `H9`, `H10`

You do **not** compute a numeric CHOICE, NNG, Overall, or verdict score anywhere — the report's
JavaScript computes all of them from the findings you tag (severity + principle), both on page load
and live whenever a finding is marked "Abaikan" in the browser. See "Scoring" below for the exact
mechanism, and never state a specific score number in `{{HEADLINE}}`/`{{SUBTITLE_HTML}}` or any other
prose — you don't know what the client-side computation will render; describe findings qualitatively
instead.

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

Evaluate each of the 6 principles (Clear, Holistic, Open, Individual, Contextual, Emotional) across
all screens, using `node_modules/pixel-review/assets/principles.md` `## CHOICE Principles`.

For each principle, note screens where it is satisfied and screens where it falls short — every
finding recorded here needs a severity, since the score comes entirely from the findings you tag
(see "Scoring" below).

Use inline reference format: `CHOICE · Clear`

---

### Framework 3 — NNG Heuristics

Evaluate all 10 heuristics from `node_modules/pixel-review/assets/principles.md`
`## NNG 10 Usability Heuristics`. For each heuristic, check every screen — every finding recorded
here needs a severity, since the score comes entirely from the findings you tag (see "Scoring"
below).

Use inline reference format: `NNG · H4`

---

### Framework 4 — AI UT Simulation (informational — never factors into Overall)

Simulate each persona in the roster resolved in "Collect inputs" step 4, each narrating **their own**
walkthrough/trace — not one shared walkthrough narrated N ways. Base each persona's narrative strictly
on their own `result.json` (or their share of the deduped multi-persona run). This framework produces
two distinct kinds of content, which land in two different report sections (see "Generate HTML report"
below) — don't blend them:

**Identity** (who this persona is — goes in Section 01 "Persona", independent of this run):

- If `hasDossier: true` (Collect inputs step 4, sources c/e): their **full User Synthetic dossier**
  verbatim — role & work, behavior patterns, cited requests/pain points, day-in-the-life, citations.
  Do not compress this into a shorter summary; render it in the report exactly as `pack.render.dossier`
  produced it.
- Otherwise (sources a/b, or the fallback list): background, role, and goal (from the PRD's persona
  table, or from user input).

**Simulation output** (what happened when this persona used the prototype — goes in Section 02
"Walkthrough & AI UT Simulation", specific to this run):

- Primary task they'd attempt, informed by their goal and — if prior UT/concept-test research on this
  feature was found (Collect inputs step 4d) — specifically re-probing any known friction points
  rather than only a generic happy path
- Findings from their perspective, drawn from their own flow.json run
- A simulated quote (first-person, realistic)
- Task completion: **Berhasil** / **Berhasil dengan kesulitan** / **Gagal**

If the roster fell all the way through to the fallback (Collect inputs step 4f — no PRD table, no user
input, no MCP available, or MCP declined), use this literal generic starting set instead (adjust
wording to fit the feature being reviewed):

1. **Sales Rep** — B2B account executive, high call volume, driven by daily targets
2. **Customer Service Agent** — handles incoming tickets under SLA pressure, context-switching often
3. **Supervisor / Team Lead** — monitors team performance, pulls reports, rarely does direct tasks
4. **Marketing Manager** — manages broadcast campaigns and contact lists, not highly technical
5. **New employee** — first week, no formal training, navigating the product cold

Score: (tasks completed or completed with difficulty) / N × 100, where N = number of personas actually
simulated (not always 5).

---

### Scoring — computed entirely client-side, never by you

CHOICE, NNG, Overall, and the verdict badge/legend are **computed by the report's own JavaScript**
from the findings you tagged with severity + principle — not authored by you, and not baked into any
`{{SCORE_*}}` / `{{VERDICT_*}}` placeholder (those placeholders don't exist in the template). This
runs identically on page load and again every time a viewer marks a finding "Abaikan" in the browser
— there is no separate "baseline" number for you to compute.

The exact mechanism, so you understand what the report will show even though you don't compute it:

- Each of the 6 CHOICE principles starts at 100 points; each of the 10 NNG heuristics starts at 10
  points. Every **active** (not dismissed) finding tagged to a principle/heuristic deducts from it:

  | Severity | CHOICE (per principle, starts 100) | NNG (per heuristic, starts 10) |
  | -------- | ----------------------------------- | -------------------------------- |
  | Critical | −40                                  | −10                               |
  | Major    | −20                                  | −5                                |
  | Minor    | −8                                   | −2                                |

  (Multiple findings on the same principle/heuristic sum their deductions, floored at 0. The CHOICE
  column is exactly 4× the NNG column — deliberate: NNG sums its 10 heuristics directly into
  `Overall × 0.4`, while CHOICE averages its 6 principles into `Overall × 0.6`, so 1 NNG point is
  worth 4× the Overall impact of 1 CHOICE point; the 4× deduction equalizes a Critical/Major/Minor
  finding's real impact on Overall regardless of which framework it's in.)

- `CHOICE = average of the 6 principle scores`. `NNG = sum of the 10 heuristic scores` (already
  0–100, no averaging). `Overall = round(CHOICE × 0.6 + NNG × 0.4)`.
- PRD Coverage and AI UT Simulation scores are never part of Overall, even when both are computed and
  shown in the report.

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
| `{{HEADLINE}}`                | One punchy sentence summarising the overall finding — **no score number**, describe qualitatively   |
| `{{SUBTITLE_HTML}}`           | 2–3 sentence executive summary; wrap key terms in `<strong>` — **no score number** either            |
| `{{PROTOTYPE_URL}}`           | Full URL including path                                                                                                                                                           |
| `{{REVIEW_DATE}}`             | ISO date e.g. `2026-08-12`                                                                                                                                                        |
| `{{META_STATS}}`              | e.g. `3 rute · 7 states · 19 US dikaji`                                                                                                                                           |
| `{{PRD_GAP_ROWS_HTML}}`       | Only the `<tr>` rows for each US; if PRD skipped, inject one row: `<tr><td colspan="4" style="text-align:center;color:var(--mp-text-placeholder)">PRD tidak disertakan</td></tr>` |
| `{{CROSSFLOW_TITLE}}`         | Section 03 heading e.g. `CHOICE & NNG — Keseluruhan Halaman`                                                                                                                      |
| `{{CROSSFLOW_ANALYSIS_HTML}}` | Cross-flow prose paragraph                                                                                                                                                        |
| `{{AI_UT_INSIGHT}}`           | 1–2 sentence aggregate insight across ALL personas — sits above the persona tab bar, not inside a tab |
| `{{PERSONA_TAB_BAR_HTML}}`    | ONE `.persona-tabs` bar (one `.tab-btn` per persona), rendered once above Section 01 — not repeated inside either section. `switchPersonaTab()` toggles the matching pane in both Section 01 and Section 02 by `data-persona`, so one bar controls both |
| `{{PERSONA_TABS_HTML}}`       | Section 01 "Persona" — one tab pane per persona in the resolved roster, IDENTITY only, no tab bar (that's `{{PERSONA_TAB_BAR_HTML}}` above). Each pane = that persona's header (name/role, mini CHOICE/NNG score line) + either `.persona-dossier` (full User Synthetic dossier, verbatim, for `hasDossier: true` personas) or `.persona-identity` (Goal/Pain, for PRD-table/user-input personas) — see HTML comments in template |
| `{{WALKTHROUGH_TABS_HTML}}`   | Section 02 "Walkthrough & AI UT Simulation" — one tab pane per persona (same `data-persona` slugs/order as Section 01, no tab bar here either) with their task/quote/completion narrative (`.persona-body`) plus their own walkthrough state cards (Minor+ findings only, same rule as before) — see HTML comments in template |
| `{{FD_JSON}}`                 | JS object: `{ fN: { d:'title', sc:'Screen/State', fw:'FW · Principle', sv:'Critical\|Major\|Minor', p:['persona-slug', ...] } }` — `p` lists every persona-slug who encountered this finding's state (single entry normally, multiple when deduped across personas). The report's JS computes CHOICE/NNG/Overall/verdict (and, per persona, a filtered sub-score) from this, see "Scoring" above |
| `{{PRD_SCORE}}`               | Score integer or `N/A`                                                                                                                                                            |
| `{{EXPORT_FILENAME}}`         | `<branch-slug>-<YYYYMMDD>[-N]-pixel-review.md`                                                                                                                                    |

`{{SCORE_OVERALL}}`, `{{SCORE_CHOICE}}`, `{{SCORE_NNG}}`, `{{VERDICT_BADGE}}`, `{{VERDICT_TEXT}}`, and
`{{SCORE_LEGEND_HTML}}` **do not exist as placeholders** — the template computes and fills all of them
client-side from `{{FD_JSON}}` (see "Scoring" above). Do not try to fill them in.

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
