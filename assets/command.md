---
description: Design review — Playwright exploration + CHOICE+NNG-weighted UX audit → HTML report
---

Run a full design review on the prototype. $ARGUMENTS

**Never use `mcp__claude-in-chrome__*` tools to explore or interact with the PROTOTYPE.** All
exploration and interaction there must go through `node_modules/pixel-review/src/driver.js` (Playwright, headless) via
`flow.json` triggers — including `type:` and `select-text:` for text fields and custom dropdowns. If a
state seems impossible to reach with the trigger DSL, extend the DSL in `node_modules/pixel-review/src/driver.js`
rather than falling back to manual browser control; manual browser screenshots are far more expensive
in context than the script's `result.json` output. This restriction is about the prototype only —
reading a PRD doc is a separate concern with its own fallback in "Fetch PRD requirements" below.

## Pre-flight checks

**Step 1 — verify the script exists:**

```bash
test -f node_modules/pixel-review/src/driver.js && echo "OK" || echo "MISSING"
```

If MISSING: tell the user the file should be committed to the repo. If they just cloned, ask them to
check their git pull. Do not proceed.

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

## Determine output mode

If this run was already triggered by the **Push workflow** gate in the repo's `AGENTS.md`/`CLAUDE.md`
(the user already picked "Review + generate HTML report" or "Review + summary in this chat" there),
skip this — it's already answered, asking again is redundant.

Otherwise (the user typed `/pixel-review` directly), ask once, offering exactly these 2 options:

1. **Generate full HTML report** _(default)_ — the usual self-contained report, opened in the browser
   at the end.
2. **Summary in this chat only** — run the exact same review (Playwright exploration + CHOICE+NNG-
   weighted audit) but report findings as a chat summary instead; skip generating the HTML report file.

Set `html_output = false` for option 2. Everything downstream (frameworks, scoring, persona roster) is
identical either way — only the final "Generate HTML report" step differs, see there.

---

## Collect inputs

Resolve prototype URL, PRD URL, and flow/feature scope from these sources, in priority order — stop
at the first source that supplies a given input, and never ask for something an earlier source
already gave you:

1. **`$ARGUMENTS`** — classify every URL found by concrete pattern, don't guess from vibes:
   - **PRD/doc URL** if it matches: `*.atlassian.net/wiki/*` (Confluence), `coda.io/d/*` (Coda),
     `docs.superhuman.com/d/*` (Superhuman Docs), `docs.google.com/document/*` or `drive.google.com/*`
     (Google Docs), or any other URL whose host is clearly a document/wiki platform rather than the
     project's own prototype domain.
   - **Prototype URL** — any URL that doesn't match the above, e.g. `localhost:*`, a Vercel/Netlify
     preview domain, or the product's own domain.
   - **If more than one URL is given**, classify each independently by the rules above — don't assume
     "first URL = prototype, second = PRD" or vice versa. It's common to get both in one message,
     e.g. `"create ticket flow https://prototype.example.com/tickets https://docs.google.com/document/d/xyz"`.
   - Non-URL text is the flow/feature instruction, e.g. `"create ticket flow"` in the example above.
   - **If a URL doesn't clearly match any pattern above**, don't silently drop it or silently guess —
     state your best-guess classification in the scope statement (step "Determine review mode"
     below), then continue with it, rather than it quietly becoming
     neither a PRD nor a prototype URL and quietly dropping out of the review scope.
2. **The current conversation**, if `/pixel-review` is running in the same session as the "vibe
   coding" (implementing/iterating) work that came right before it — don't make the user restate
   context you already have from watching them build it:
   - **Flow/feature scope** — infer from what was just implemented: which routes/pages, which
     feature or user story.
   - **PRD URL** — reuse a Confluence/Coda/Google Docs/doc link already shared earlier in this
     conversation (same classification rules as step 1 above).
   - **Prototype URL** — reuse a URL already established this session (e.g. from a `pnpm dev` run,
     or a route already navigated to together).
3. **The branch's own work**, when the conversation has no vibe-coding context (a fresh session, or
   `/pixel-review` run later) — summarize the goal from what the branch changed instead of asking
   from a blank slate:

   ```bash
   git rev-parse --abbrev-ref HEAD
   git log --oneline main..HEAD
   git diff --stat main...HEAD
   ```

   - Read the branch name (`feat/PXL-1234-create-automation` → "create automation"), the commit
     subjects, and which routes/pages/screens the diff touches (adjust the paths above to your
     framework's routing convention, e.g. `app/pages`, `src/routes`, `pages/`). Map touched pages to
     routes, and the feature to one user goal phrased as a task a persona would attempt (e.g. "create
     a new automation and check the existing ones").
   - If the diff touches several unrelated features, or a doc file exists under the touched feature's
     own directory, read it for the intended behavior and pick the main goal from it; if it is still
     ambiguous, pick the goal covering the most changed files and say which one you picked and which
     you left out — do not stop to ask.
   - Never invent a route you cannot map to a changed page. State the derived goal in the scope
     statement (see below) so it is visible, never silently assumed — but do not wait on it.

4. **Ask the user** — only for whatever steps 1–3 didn't supply:
   - **Prototype URL** — default `http://localhost:3000` (accept a subpath like `/customers`).
   - **PRD URL** _(optional)_ — Confluence, Coda/Superhuman, or any web URL with feature requirements.
     Tell the user: "PRD URL is optional — skip it and PRD Coverage will be excluded from the score."
   - **Flow/feature goal** _(required when PRD URL was skipped)_ — ask: "What flow or goal should I
     review (e.g. 'create ticket flow', 'a supervisor checks which automations are active')?" A
     review needs a goal: personas can only succeed or struggle at a task, so without a goal there is
     nothing to simulate. There is no whole-app crawl mode — do not proceed until the user gives a flow/goal or a PRD.

If steps 1–3 already cover everything, **state what you inferred in one line** instead of opening with
a question — e.g. "Review scope: create ticket flow at `/tickets/all-tickets`, no PRD." Don't make the
user answer from a blank slate when you already watched them build the thing. Only fall through to
asking (step 4) when no goal can be derived at all — no PRD/doc, no usable conversation, and no branch
diff — because then there is nothing to run.

If the user skips PRD URL, set `prd_skipped = true`.

5. **Resolve the persona roster** — determines who drives exploration below AND who Framework 4
   narrates. Resolve in order, stop at the first source that supplies a roster. **A roster that comes
   from a shared PRD/research-plan document (a) or from the user (b) is used as-is — never validated,
   replaced, or re-cast against the MCP User Synthetic library (c)/(d)/(e) just because the tool is
   available.** The document is the source of truth for the personas it names. Next to a document
   roster, the MCP's only role is to **fill the shortfall** when the roster has fewer personas than the
   target count (see "Target participant count" below) — it never touches the doc's own personas. When
   no document or user input supplies a roster at all, the MCP is the fallback for the whole roster:

   a. **PRD's or research plan's own persona / target-user section** — if PRD mode is active and the
   fetched doc has a persona/target-users section (heading wording varies — "Target Users", "Persona",
   "Target Audience", "Respondent Criteria", etc. — match loosely on a table or list naming a
   Persona/Role, with or without Goal/Pain, don't require exact wording or a formal persona table). A
   research plan that only lists respondent roles/teams counts: each listed role is a persona, with
   Goal/Pain taken only from what the doc actually says (e.g. its Background) — never invented. Rows are
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
     if the MCP is available **and the roster did not come from a shared doc or the user (a/b)** —
     skipped otherwise, same rule as above — `search_research(domain=<matching PRD domain>, method="ut"|"concept")`.
     If found, `get_research_doc` it and use it to ground persona behavior/wording and which states to
     specifically re-probe (known friction points) — applies to whichever roster (a)/(b)/(c)/(e)
     supplied, never adds/removes roster members on its own.
     e. **Cast new via MCP `synthetic_get_evidence`** — the last resort: only when (a)-(c) produced
     nothing, or the roster is still short of the target participant count **after the library (c) was
     searched for the shortfall and could not cover it** (see "Target participant count" below), and
     then only for the personas still missing (never replacing a/b/c). Mandatory: call `synthetic_start_study` first — it returns a protocol requiring an
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

   **Target participant count: at least 5.** Use the explicit count in the fetched PRD/research-plan
   text (e.g. "test with 8 users") when it is higher than 5; otherwise the target is **5** (3 was too
   few — the frequency multiplier needs a roster big enough to tell "one persona
   struggled" from "most did"). If the roster is short of the target:
   **Fill only the shortfall, library first, casting last** — whether the roster came from a shared
   doc/user (a/b), from the MCP library (c), or not at all:
   1. **From the curated library (c) — read-only, no approval gate.** `search_research(domain="personas",
query=<feature/module and the missing role>)` / `list_research_docs(domain="personas")`, then
      `get_research_doc` on each match. Take only archetypes **distinct from the roster already in hand**
      (a role, team, industry, or seniority the doc's personas do not already cover) and plausible for
      this study. Library personas keep their full dossier (`hasDossier: true`).
   2. **Only if the library cannot cover the shortfall — cast via (e).** `synthetic_start_study` and an
      approved STUDY BRIEF come first, a hard tool-side gate you never skip or paraphrase around. Cast
      only the personas still missing after step 1, grounded in the doc's own dimensions (e.g. its
      respondent industries). Fold the brief into the scope statement so it is one stop, not two.
   - The doc's/user's own personas stay exactly as written (no dossier, `hasDossier: false`) — never
     replaced, re-cast, or re-scored against the library.
   - Say which personas came from the doc, which from the library, and which were cast, in the
     scope statement and in each persona card, so the report never presents a library or synthetic
     persona as the doc's.
     State the final count in the scope statement.

   **Role access (every persona has limits).** Give each persona an access scope — the surfaces its role
   can reach — from the doc (an "Access" column or per-role note) or from the user. A staff-level role
   often cannot open Settings; the prototype does not enforce that, so you must. If access is not stated,
   assume **full access** and mark the Access line in the persona card as an assumption ("full access —
   assumed, not stated in the document"). Show the access scope in each persona card. Personas only attempt tasks on surfaces they can reach, and
   a persona is never tagged to a finding on a screen outside its access.

   **Persona slugs**: every resolved persona gets a slug for file paths — lowercase, non-alphanumeric
   runs collapsed to a single hyphen, trimmed (e.g. "Sales/CS Team Lead" → `sales-cs-team-lead`). Use
   this slug consistently across discovery, the real run, and FD_JSON persona tags later.

**Determine review mode:**

| Condition                                           | Mode                 |
| --------------------------------------------------- | -------------------- |
| PRD URL given                                       | **PRD mode**         |
| No PRD URL, but a flow/feature instruction is given | **Instruction mode** |

There is no third mode. If neither a PRD URL nor a flow/feature goal can be resolved (from the
message, then the conversation), stop and ask for the goal — never fall back to crawling the whole
app. Read the goal from the request whenever you can; only ask when it is genuinely absent.

**State the scope in one line, then continue immediately — this is a statement, not a checkpoint. Do
not wait for a reply.** Give the mode selected (PRD or instruction), the goal, the resolved persona
roster (marking which came from the doc, the library, or a cast), AND whether exploration is shared or
escalated per-persona (see "Generate flow config" below), e.g.:

> Review scope: create-segment flow. Personas: Sales/CS Team Lead (Primary, from PRD), Marketing/
> Campaign Manager (Secondary, from PRD). Exploration: shared (1 Playwright pass).

If the user interjects while the run is going, adapt; otherwise do not pause.

Search the library for any shortfall **before** writing this line (read-only, no approval needed), so
the line already names the library personas it will use. Only if the library cannot cover the shortfall
is step 5e needed — then append the STUDY BRIEF preview to this same message instead of stopping twice
later. **That STUDY BRIEF approval is the only planned stop in the whole run**; when the library
covers the shortfall there is no stop at all.

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

**PRD mode only.** Skip this step for instruction mode.

**Do this BEFORE running Playwright.** The PRD determines what Playwright visits.

Use the Atlassian MCP (`getConfluencePage`) for a Confluence URL, or WebFetch for any other public,
fetchable doc URL.

**If the PRD URL is a Google Doc, or WebFetch fails/comes back as a login wall or access-denied page**:
WebFetch has no user identity — it can't see anything shared only with the user's own account. Fall
back to `mcp__claude-in-chrome__*` (`navigate` to the URL, then `get_page_text` or `read_page`) to read
it through the user's own logged-in Chrome session instead — "Viewer" access shared with their account
is enough for this, since the browser carries their real session. This is the one exception to the
"never use claude-in-chrome" rule above: it's reading a document, not touching the prototype. Never use
it to fill in a form, accept a share request, or take any action on the doc — read-only.

**If the fetched PRD is an anchor/index doc, follow the links — don't stop here.** Some PRDs
explicitly frame themselves as an index (look for language like "This is an ANCHOR PRD," "indexes the
child PRDs," or a Phase Index/table of linked documents) and say outright that execution detail —
constraints, user stories, acceptance criteria, screens — lives in separate **child PRDs**, not in the
anchor itself. An anchor typically only has the initiative-level problem, personas, and metrics — not
enough to write an accurate `flow.json`. If you stop at the anchor, you'll end up guessing at the flow
via trial-and-error discovery instead of following documented requirements, which is exactly the
expensive, unfocused exploration this mode exists to avoid. Fetch every linked child PRD relevant to
the flow/feature in scope before extracting requirements below.

Extract every user story, acceptance criteria, or feature requirement (from the anchor AND any child
PRDs fetched above). Keep a numbered list — you'll use this to:

1. Generate the flow config for Playwright
2. Produce the gap analysis in Framework 1

---

## Generate flow config

Both PRD mode and instruction mode produce a `flow.json` and run Playwright via `--flow-config` —
never `--url` alone.

```bash
mkdir -p reports/.tmp-review/
```

**Default: ONE shared `flow.json`, regardless of roster size.** A separate exploration per persona
multiplies wall-clock time (N personas = N full Playwright passes) for little benefit when their flows
would overlap anyway — most personas doing "create a segment" hit the same screens. Persona
perspective still comes through later (Framework 2/3 finding tags, Framework 4 narrative), just without
re-running the browser per persona.

**Escalate to a separate `flow.json` per persona** only when one of these is true:

- The user explicitly asks for divergent flows per persona (e.g. "coba lihat power user pakai jalur
  yang beda").
- The PRD/roster itself implies genuinely different entry points per role (e.g. Primary reaches a
  feature through a main menu, Secondary through a completely different screen) — not just "might
  behave differently," an actual different route/starting point.

State which case applies (shared or escalated) in the scope statement back in "Determine review
mode". When escalated, **enforce
divergence**: if two personas would otherwise produce an identical `flow.json`, add at least one
persona-specific state/step for one of them — the whole point of paying for N runs is that they
genuinely differ.

### PRD mode

From the PRD requirements, produce a JSON array that maps every user story to a specific route +
state + interaction trigger. This is naturally shared across personas (one map covering every user
story) unless escalated per the rule above.

### Instruction mode

From the user's flow/feature instruction (e.g. `"create ticket flow"`), work out what to test:

1. Identify the most likely starting route from the given prototype URL (e.g. `/tickets/all-tickets`
   for a "create ticket flow").
2. Run one lightweight discovery pass via `node_modules/pixel-review/src/driver.js` (never `claude-in-chrome`) against
   that route before writing any triggers, so you know what's actually on the page:
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

If escalated per the rule above, repeat steps 1–4 once per persona instead of once overall — each
persona's goal and familiarity level shapes both the discovery pass and which triggers get authored
(e.g. a "new employee" persona may open a help tooltip or misclick before finding the right control; a
power-user persona jumps straight to the fastest path).

Both modes write the completed JSON using the same format, trigger table, and mapping rules below —
to `reports/.tmp-review/flow.json` when shared (the default), or to
`reports/.tmp-review/<persona-slug>/flow.json` (one file per persona, using the slug from "Collect
inputs" step 5) when escalated.

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

| Step                                     | Action                                                                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `null`                                   | No interaction — just screenshot                                                                                                                                                                                            |
| `click:<css-selector>`                   | Click element by CSS selector                                                                                                                                                                                               |
| `click-nth:<css-selector>\|<index>`      | Click the `<index>`-th (0-based) match of a selector — for forms with several identical custom controls that share no unique id                                                                                             |
| `click-text:<label>`                     | Click a `button`/`a`/`[role=button]`/`.mp-button` by exact text content                                                                                                                                                     |
| `select-text:<label>`                    | Click a dropdown/autocomplete option row by exact text — broader match than `click-text` (also matches `li`, `[role=option]`, popover/list items), use for MpAutocomplete/MpPopoverList options that aren't real buttons    |
| `click-contains:<text>`                  | Click any element _containing_ the text — chat-list rows, table rows, cards. Broadest of the three; scrolls the match into view first, so a row below the fold screenshots correctly instead of looking like a no-op        |
| `click-in:<container-selector>\|<label>` | Click by exact text, scoped to a container — use when the same label appears in more than one place (e.g. a closed popover that stays mounted off-screen)                                                                   |
| `check:<input-selector>`                 | Check/toggle a custom radio/checkbox control whose native input is visually hidden behind a styled span — clicks the associated `<label>`, falling back to a forced click on the input itself                              |
| `type:<selector>\|<text>`                | Click `<selector>` to focus it, then type `<text>` via real keystrokes (fires input/autocomplete listeners). Omit `<selector>\|` to type into whatever already has focus (chain right after a `click:`/`select-text:` step) |
| `wait:<ms>`                              | Wait N milliseconds                                                                                                                                                                                                         |
| `scroll`                                 | Scroll to page bottom — also scrolls the tallest inner scroll container, for app shells that pin the header/footer and leave the window itself nothing to scroll                                                            |
| `scroll-top`                             | Scroll back to top — also resets any scrolled inner containers                                                                                                                                                              |
| `scroll-in:<css-selector>`               | Scroll one named container to its bottom, for pages with several independent scroll panes where the generic `scroll` picks the wrong one                                                                                    |
| `scroll-to-text:<label>`                 | Scroll a section into view by its exact heading/text — use when a pixel offset or a selector would break across layout changes                                                                                              |
| `key:<key>`                              | Press keyboard key (e.g. `key:Escape`)                                                                                                                                                                                      |
| `hover:<css-selector>`                   | Hover over element                                                                                                                                                                                                          |
| `hover-text:<label>`                     | Hover a row by its exact visible text — use for cascading menus/submenus that open on `mouseenter` and have no stable selector                                                                                              |
| `navigate:<path>`                        | Navigate to a different path                                                                                                                                                                                                |

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

Write the completed JSON per the rule above: flat `reports/.tmp-review/flow.json` when shared (the
default), `reports/.tmp-review/<persona-slug>/flow.json` per persona when escalated.

---

## Run Playwright

**PRD mode or instruction mode, shared flow.json** (the default — flow config exists), run once in flow
config mode:

```bash
node node_modules/pixel-review/src/driver.js --url <prototype-url> --flow-config reports/.tmp-review/flow.json --out-dir reports/.tmp-review/
```

**PRD mode or instruction mode, escalated to per-persona flow.json** — run once per persona, each into
its own subdirectory so screenshots/results never collide:

```bash
node node_modules/pixel-review/src/driver.js --url <prototype-url> --flow-config reports/.tmp-review/<persona-slug>/flow.json --out-dir reports/.tmp-review/<persona-slug>/
```

The script reuses a dedicated Playwright profile (`~/.cache/pixel-review/profile`, outside the repo), never
your Chrome profile — that folder is blocked in sandboxed shells and holds cookies for every site you use.
This repo's dev server skips Auth0 when `NUXT_PUBLIC_SKIP_AUTH_LOCAL=true` is in `.env`, so no sign-in is
normally needed. If the script exits with "Not signed in", ask the user to run
`node node_modules/pixel-review/src/driver.js --login --url <prototype-url>` once in their own terminal (a window opens;
they sign in and close it) — never enter credentials for them. `--no-profile` gives a signed-out profile,
and `--chrome-profile` restores the legacy copy-your-Chrome-profile behavior.
After completion, read the output — `reports/.tmp-review/result.json` for the shared run, or each
persona's `reports/.tmp-review/<persona-slug>/result.json` when escalated:

```bash
cat reports/.tmp-review/result.json
```

**Dedupe before scoring, only if escalated**: compare every persona's `result.json` entries by exact
`route + "::" + state` string match. If two or more personas produced the same key, read and score that
screenshot only **once** — never re-spend vision tokens re-reading an identical image — and record
which personas visited it (this becomes the `p` array on that finding's FD_JSON entry, see "Apply
review frameworks" below). This doesn't apply to the shared/default run — there's only one `result.json`
to begin with; `p` there comes from persona-lens tagging instead (see Framework 2/3 below).

---

## Apply review frameworks

**Run all frameworks to completion before generating the report.** Do not output partial findings as
you go — hold everything until all 4 are done. Only **CHOICE** and **NNG** factor into Overall; **PRD
Coverage** and **AI UT Simulation** are still run and shown in the report, but informational only.

For each framework, produce a structured findings list internally:

```
{ screen, state, principle, severity, type, description, has_screenshot: true/false }
```

Severity (Nielsen 1–4, impact + persistence only — never fold how many personas hit it into severity,
the report applies a frequency multiplier from the `p` array): Critical (4, blocks the task) | Major (3) |
Minor (2) | Cosmetic (1, visual only) | Passed

**Primary-task friction is Major.** If a persona must hunt for a control to do their _main_ task (e.g. the
edit action is hidden in a menu), or information they need to decide at that moment is hidden or ambiguous
(e.g. a boundary value that could belong to two tiers), rate it Major, not Minor. A secondary aid that is
merely inconvenient (scroll back, re-read) stays Minor. Judge against the persona's main task, not the page.

`type` is exactly one of `Wayfinding`, `Functionality`, `Design & Labeling`, `Context understanding`
(see `node_modules/pixel-review/assets/principles.md` `## Issue Types`). It groups findings in the report and carries
no weight. A new need or idea a persona voices is **not a finding** — collect it for the "New needs (not scored)"
list instead, never tagged or scored.

`principle` must be exactly one of the 6 CHOICE principle names or 10 NNG heuristic codes — no other
spelling, since the report's JS keys its scoring off this exact string:

- CHOICE: `Clear`, `Holistic`, `Open`, `Individual`, `Contextual`, `Emotional`
- NNG: `H1`, `H2`, `H3`, `H4`, `H5`, `H6`, `H7`, `H8`, `H9`, `H10`

**Copy findings take one extra segment.** If the finding is about on-screen text — a label, button,
heading, blank slate, error message, toast, or tooltip — append exactly one copy category after the
principle, using `node_modules/pixel-review/assets/principles.md` `## Copy Categories`:

`NNG · H4 · consistent`

Only these four exist: `clarity`, `consistent`, `concise`, `grammar & typo`. Never invent a fifth, never
chain two, and never write a category without a CHOICE/NNG segment in front of it. The category adds no
weight and no deduction — the report's scoring JS destructures only the first two segments, so the third
is inert and Overall is identical with or without it. Non-copy findings (layout, spacing, flow, state
handling) get no category at all.

You do **not** compute a numeric CHOICE, NNG, Overall, or verdict score anywhere — the report's
JavaScript computes all of them from the findings you tag (severity + principle), both on page load
and live whenever a finding is marked "Dismiss" in the browser. See "Scoring" below for the exact
mechanism, and never state a specific score number in `{{HEADLINE}}`/`{{SUBTITLE_HTML}}` or any other
prose — you don't know what the client-side computation will render; describe findings qualitatively
instead.

Screenshot a state only when a finding of Minor severity or above is identified (a state whose only findings are Cosmetic still gets a state card so the finding can be decided on, but with no screenshot-row). Passed states → no
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

The gap table rows (only `<tr>` elements, no wrappers) go into `{{PRD_GAP_ROWS_HTML}}`. Section 04 structure is already in the template. If PRD is skipped, inject a single colspan row with "PRD not provided".

---

### Framework 2 — CHOICE Principles

Evaluate each of the 6 principles (Clear, Holistic, Open, Individual, Contextual, Emotional) across
all screens, using `node_modules/pixel-review/assets/principles.md` `## CHOICE Principles`.

For each principle, note screens where it is satisfied and screens where it falls short — every
finding recorded here needs a severity, since the score comes entirely from the findings you tag
(see "Scoring" below).

**Persona tagging (`p` array on each finding, if there's a roster):**

- **Shared run (default)** — one exploration, judged through each persona's own lens. A finding isn't
  automatically relevant to everyone: an unclear label might be Major for a new employee and simply
  not register for a power user. Tag only the persona(s) who would actually notice/care at the
  severity you record. One finding = one `fN` entry = one severity — never author two entries for the
  same underlying issue just to give it different severities per persona (that double-counts the same
  problem against the global Overall score, which sums every entry regardless of `p`). If perceived
  severity genuinely varies, record the **worst-case severity** and tag `p` only to the persona(s) who
  actually experience it at that level; a persona who'd barely notice it simply isn't tagged, per the
  rule above — mention the milder read for other personas in the finding's description text instead.
- **Escalated (per-persona flow.json)** — `p` instead reflects which persona(s)' own run actually
  produced the finding, per the dedupe rule in "Run Playwright" above.

Use inline reference format: `CHOICE · Clear`

---

### Framework 3 — NNG Heuristics

Evaluate all 10 heuristics from `node_modules/pixel-review/assets/principles.md` `## NNG 10 Usability Heuristics`.
For each heuristic, check every screen — every finding recorded here needs a severity, since the
score comes entirely from the findings you tag (see "Scoring" below).

Tag `p` the same way as Framework 2 above — persona-lens judgment on the shared run by default, or
per-run attribution when escalated.

Use inline reference format: `NNG · H4`

---

### Framework 4 — AI UT Simulation (informational — never factors into Overall)

Simulate each persona in the roster resolved in "Collect inputs" step 5, each narrating the walkthrough
through **their own lens**. Base the narrative on their own `result.json` when escalated to per-persona
flow.json, or on the one shared `result.json` interpreted through their goal/familiarity when running
the shared/default flow — same screens, different read on what happened. This framework produces two
distinct kinds of content, which land in two different report sections (see "Generate HTML report"
below) — don't blend them:

**Identity** (who this persona is — goes in Section 01 "Persona", independent of this run):

- If `hasDossier: true` (Collect inputs step 5, sources c/e): their **full User Synthetic dossier**
  verbatim — role & work, behavior patterns, cited requests/pain points, day-in-the-life, citations.
  Do not compress this into a shorter summary; render it in the report exactly as `pack.render.dossier`
  produced it.
- Otherwise (sources a/b, or the fallback list): background, role, and goal (from the PRD's persona
  table, or from user input).

**Simulation output** (what happened when this persona used the prototype — goes in Section 02
"Walkthrough & AI UT Simulation", specific to this run):

- Primary task they'd attempt, informed by their goal and — if prior UT/concept-test research on this
  feature was found (Collect inputs step 5d) — specifically re-probing any known friction points
  rather than only a generic happy path
- Findings from their perspective — the ones tagged to them in `p` (Framework 2/3), from the shared run
  or their own escalated run
- A simulated quote (first-person, realistic)
- Task completion: **Succeeded** / **Succeeded with difficulty** / **Failed** — this is no longer purely
  shown in the report and used as the roster size for the frequency denominator, but it never changes a score.
  Be honest and consistent: a persona whose tagged findings made them stop, search, or backtrack is
  **Succeeded with difficulty**, not **Succeeded**. Also list any **new needs** the persona voices
  (separate from issues) for the report's "New needs (not scored)" block.

If the roster fell all the way through to the fallback (Collect inputs step 5f — no PRD table, no user
input, no MCP available, or MCP declined), use this literal generic starting set instead (adjust
wording to fit the feature being reviewed):

1. **Sales Rep** — B2B account executive, high call volume, driven by daily targets
2. **Customer Service Agent** — handles incoming tickets under SLA pressure, context-switching often
3. **Supervisor / Team Lead** — monitors team performance, pulls reports, rarely does direct tasks
4. **Marketing Manager** — manages broadcast campaigns and contact lists, not highly technical
5. **New employee** — first week, no formal training, navigating the product cold

Score: (tasks completed or completed with difficulty) / N × 100, where N = number of personas actually
simulated (not always 5).

**Write-back to User Synthetic: not implemented (PXL-9719 discovery).** A mechanism exists —
`mcp__claude_ai_User_syntethics__synthetic_submit_study` accepts a `utReport` shaped
`{scoreStrip, choiceScores[6], nngScores[10], walkthrough[], utSimulation[]}` plus `packId`,
`dossiers`, `dossiersRenderedInChat`, and the server checks the 60/40 arithmetic. But this run
deliberately never computes CHOICE/NNG/Overall itself — the report's own client-side JS does (see
"Scoring" below) — so wiring a real submission would require duplicating that scoring logic here just
to produce the numbers the server expects, and the submission path has not been validated end-to-end
against a live run. Documented as a known gap rather than implemented speculatively; revisit if/when a
real run is used to validate the submission shape.

---

### Scoring — computed entirely client-side, never by you

CHOICE, NNG, Overall, and the verdict badge/legend are **computed by the report's own JavaScript**
from the findings you tagged with severity + principle — not authored by you, and not baked into any
`{{SCORE_*}}` / `{{VERDICT_*}}` placeholder (those placeholders don't exist in the template). This
runs identically on page load and again every time a viewer marks a finding "Dismiss" in the browser
— there is no separate "baseline" number for you to compute.

The exact mechanism, so you understand what the report will show even though you don't compute it:

- Each of the 6 CHOICE principles starts at 100 points; each of the 10 NNG heuristics starts at 10
  points. Every **active** (not dismissed) finding tagged to a principle/heuristic deducts from it:

  | Severity     | CHOICE (per principle, starts 100) | NNG (per heuristic, starts 10) |
  | ------------ | ---------------------------------- | ------------------------------ |
  | Critical (4) | −40                                | −10                            |
  | Major (3)    | −20                                | −5                             |
  | Minor (2)    | −8                                 | −2                             |
  | Cosmetic (1) | −2                                 | −0.5                           |

  (Multiple findings on the same principle/heuristic sum their deductions, floored at 0. The CHOICE column stays 4×
  the NNG column because a heuristic starts at 10 and a principle at 100; the NNG average is scaled ×10 so both
  frameworks end on the same 0–100 scale.)

- **Frequency multiplier:** each deduction is × `0.5 + 0.5 × (personas in the finding's p ÷ personas in
the finding's el)`, where `el` = the personas whose role can reach that screen (omit `el` and the whole
  roster is the denominator). So `p` must list **every** eligible persona who would hit the issue —
  under-tagging quietly discounts a finding — and `el` must be set for any screen some personas cannot
  reach, or the finding is under-weighted. No roster → multiplier 1.
- **Only touched principles / heuristics are averaged.** A principle or heuristic is _touched_ when at least one
  active finding is tagged to it. `CHOICE` = average of the touched principles' scores; `NNG` = average of the
  touched heuristics' scores × 10 (stays 0–100); a framework with no active finding is 100. So an untouched
  principle never dilutes a real finding. `Overall = round(CHOICE × 0.6 + NNG × 0.4)`.
- **No caps.** Overall is exactly CHOICE × 0.6 + NNG × 0.4. Persona task outcomes are shown but never change a
  score. Because the score depends on _which_ principle or heuristic a finding is tagged to, tag the one that
  names the actual failure, never a convenient neighbour.
- PRD Coverage and the AI UT success percentage never add to Overall.

---

## Generate HTML report

**Skip this entire section if `html_output = false`** ("Determine output mode" above) and write the chat
summary below instead. Everything in "Apply review frameworks" still applies as-is (severity, type,
`p`, `el`, task outcomes); only this HTML-generation step is replaced.

### Chat summary format (`html_output = false`)

**No score number anywhere** — CHOICE, NNG, Overall, and the raw score are computed only by the
report's JavaScript, so a chat number could contradict the HTML version of the same review. The chat
summary carries the same data in the same order, never more and never less than the HTML would:

1. **Scope** — one line: mode (PRD or instruction), goal, persona roster with origin (doc / library /
   cast), shared or escalated exploration.
2. **Verdict** — one or two qualitative sentences on what the findings add up to (which task hit friction, for whom,
   and how badly). No band name and no number: both come only from the report's JavaScript.
3. **Findings** — one table, ordered Critical → Major → Minor → Cosmetic, columns: severity, issue type,
   principle (`CHOICE · Clear`, `NNG · H4`), finding, and **"affects n of N personas who can reach it"** (from
   `p` and `el`, so frequency stays visible without a score).
4. **Per persona** — one subsection each: task, what they hit, quote, and the outcome (**Succeeded** /
   **Succeeded with difficulty** / **Failed**). Mark each persona's origin.
5. **Key takeaways**, **What went well**, **New needs (not scored)** — same three blocks as Section 03 of
   the HTML report, plain bullets, English headings.
6. **PRD gaps** — only if PRD mode was used.
7. **Next step** — end with one question: which findings to fix. There are no Fix by AI / Dismiss / Discuss
   buttons in chat, so ask directly instead of assuming.

### HTML report (`html_output = true`)

**Language: English.** Write all report content in English: headline, subtitle, finding titles and
descriptions, persona narratives and simulated quotes, takeaways, PRD gap notes, Access lines, button and
section labels. Text quoted from a source stays as sourced — User Synthetic dossiers, and quotes taken from the
PRD or research plan, are never translated or compressed. The chat summary (`html_output = false`) follows the
user's language.

After all 4 frameworks are complete, generate the report by filling in `node_modules/pixel-review/assets/report-template.html`.

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

| Placeholder                   | What to put                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{{TITLE}}`                   | `Pixel Review — <page-name> — branch: <branch>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `{{HEADLINE}}`                | One punchy sentence summarising the overall finding — **no score number**, describe qualitatively                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `{{SUBTITLE_HTML}}`           | 2–3 sentence executive summary; wrap key terms in `<strong>` — **no score number** either                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `{{PROTOTYPE_URL}}`           | Full URL including path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `{{REVIEW_DATE}}`             | ISO date e.g. `2026-08-12`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `{{PRD_GAP_ROWS_HTML}}`       | Only the `<tr>` rows for each US; if PRD skipped, inject one row: `<tr><td colspan="4" style="text-align:center;color:var(--mp-text-placeholder)">PRD not provided</td></tr>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `{{CROSSFLOW_TITLE}}`         | Section 03 heading e.g. `CHOICE & NNG — Whole Flow`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `{{CROSSFLOW_ANALYSIS_HTML}}` | Cross-flow prose paragraph                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `{{AI_UT_INSIGHT}}`           | 1–2 sentence aggregate insight across ALL personas — sits above the persona tab bar, not inside a tab                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `{{PERSONA_TAB_BAR_HTML}}`    | ONE `.persona-tabs` bar (one `.tab-btn` per persona), rendered once above Section 01 — not repeated inside either section. `switchPersonaTab()` toggles the matching pane in both Section 01 and Section 02 by `data-persona`, so one bar controls both                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `{{PERSONA_TABS_HTML}}`       | Section 01 "Persona" — one tab pane per persona in the resolved roster, IDENTITY only, no tab bar (that's `{{PERSONA_TAB_BAR_HTML}}` above). Each pane = that persona's header (name/role, mini CHOICE/NNG score line) + either `.persona-dossier` (full User Synthetic dossier, verbatim, for `hasDossier: true` personas) or `.persona-identity` (Goal/Pain, for PRD-table/user-input personas) — see HTML comments in template                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `{{AI_UT_TABS_HTML}}`         | Section 02 "Walkthrough & AI UT Simulation" — one tab pane per persona (same `data-persona` slugs/order as Section 01, no tab bar here either), NARRATIVE ONLY: task/quote/completion (`.persona-body`). No state-cards here — see `{{WALKTHROUGH_STATES_HTML}}` below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `{{WALKTHROUGH_STATES_HTML}}` | Section 02, the actual screenshots + findings. **Shared run (default)**: ONE flat sequence of state cards, not tabbed — every finding-item gets a `.finding-personas` row of small `.persona-chip` badges (from its `p` array) instead of duplicating screenshots per persona. **Escalated run**: one tab pane per persona (same slugs as above), each with their own full set of state cards, no badges needed since the tab already scopes it. **Every `.state-card` on a screen not all personas can reach carries `data-el="slug1,slug2"` (the personas whose role can reach it); the page hides that card for every other persona's tab. Omit `data-el` on screens everyone can reach.** Minor+ findings get a screenshot; Cosmetic-only states get a card without one; Passed states get none, either way — see HTML comments in template for both shapes |
| `{{FD_JSON}}`                 | JS object: `{ fN: { d:'title', sc:'Screen/State', fw:'FW · Principle', sv:'Critical\|Major\|Minor\|Cosmetic', ty:'Wayfinding\|Functionality\|Design & Labeling\|Context understanding', p:['persona-slug', ...], el:['persona-slug', ...] } }` — for a copy finding `fw` becomes `'FW · Principle · category'`. `p` lists every persona-slug who would encounter this finding; `el` lists the persona-slugs whose role can reach that screen — omit it only when every persona can (the report weights deductions by `p` ÷ `el`). The report's JS computes CHOICE/NNG/Overall/verdict (and, per persona, a filtered sub-score) from the first two `fw` segments; `ty` only groups findings, see "Scoring" above                                                                                                                                                 |
| `{{TASKS_JSON}}`              | JS object of AI UT task outcome per persona: `{ 'persona-slug': 'ok' \| 'difficulty' \| 'fail' }` (Succeeded / Succeeded with difficulty / Failed). `{}` when there is no roster. Used as the roster size (frequency denominator) and shown in the persona tabs; never changes a score — must match the status badges you wrote in `{{AI_UT_TABS_HTML}}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `{{TAKEAWAYS_HTML}}`          | 3–4 themes as one `<ul><li>` (plain bullets, never numbered): `<li><strong>Theme</strong> — what users struggled with. <strong>Expected outcome:</strong> …</li>`. A theme groups several findings; write them after the findings as a synthesis, not one per finding. Block heading in the report is "Key takeaways"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `{{POSITIVES_HTML}}`          | `<ul><li>` of what worked well (Passed states and strong patterns), at least one item when anything passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `{{NEEDS_HTML}}`              | `<ul><li>` of new needs/ideas personas voiced — not usability issues, never scored. If none: `<p>No new needs surfaced.</p>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `{{PRD_SCORE}}`               | Score integer or `N/A`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `{{EXPORT_FILENAME}}`         | `<branch-slug>-<YYYYMMDD>[-N]-pixel-review.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

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

**Skip this section if `html_output = false`** — the chat summary from "Generate HTML report" above is
the deliverable; there's no file to open.

```bash
open reports/<branch-slug>-<YYYYMMDD>[-N].html
```

Tell the user the report is ready and note the filename.
