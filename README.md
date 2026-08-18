# pixel-review

Playwright-driven design review workflow for [Claude Code](https://claude.com/claude-code). Point it
at a running prototype (and optionally a PRD), and it explores the app headlessly, scores it against a
**CHOICE (60%) + NNG (40%)** weighted UX audit, and produces a single self-contained HTML report with
embedded screenshots, a PRD coverage gap table, and an AI-simulated usability test with 5 personas.

This package ships the **command** (`/pixel-review`, a Claude Code slash command), the **Playwright
driver** that does the actual browsing, the **report template**, and a **default set of design
principles** (Mekari's CHOICE framework + Nielsen Norman's 10 heuristics). Nothing here calls an LLM
directly — the command is a prompt that Claude Code runs; this package supplies its deterministic
parts (browser automation + HTML template) plus the reference material Claude reads while scoring.

**Who does what:** an engineer installs this once per repo (see [Install](#install)). After that,
**designers run the review themselves** — no code knowledge needed, see below.

---

## For designers — running a review

### 1. Check it's set up

Ask an engineer on your team whether `pixel-review` is already installed in the repo — look for
`.claude/commands/pixel-review.md`. If it's not there yet, send them the [Install](#install) section.
This is a one-time setup per repo.

### 2. Run it

Open Claude Code in the project, make sure the prototype is running (e.g. `pnpm dev` at
`http://localhost:3000`), then type:

```
/pixel-review http://localhost:3000
```

Claude will ask a couple of quick questions first:

- **PRD URL** _(optional)_ — paste a Confluence or Coda link if you have written requirements you
  want checked off one by one. Skip it and Claude reviews whatever it finds instead.
- **What to focus on** _(optional)_ — a plain-language flow name like `"create ticket flow"` keeps the
  review scoped to that one feature instead of crawling the whole app.

Then it browses the prototype on its own — clicking through, filling forms, opening drawers,
screenshotting states — and after a few minutes writes an HTML report and opens it in your browser.

### 3. Read the report

The report is one page, top to bottom:

| Section              | What it tells you                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Score strip**       | Overall / CHOICE / NNG, each 0–100. See [Scoring](#scoring) for what the bands mean.                                   |
| **01 · Walkthrough**  | One card per screen state that had an issue — screenshot + finding, tagged Minor/Major/Critical. States with no issues aren't shown here (nothing to fix = nothing to look at). |
| **02 · CHOICE & NNG** | A cross-flow read: how the whole experience holds together, not just one screen at a time.                            |
| **03 · AI UT Simulation** | 5 simulated personas (sales rep, CS agent, supervisor, marketing manager, new employee) each try to use the prototype and report what happened, in their own voice. Informational — doesn't affect the score. |
| **04 · PRD Gap Analysis** | Every requirement from your PRD, checked off as Implemented / Partial / Not found. Only shown if you gave a PRD URL. Also informational. |

### 4. Act on findings

Each finding in the Walkthrough has three buttons:

- **Fix by AI** — queue it for Claude to fix automatically later
- **Diskusi** — flag it as needing a PM/design decision first, not a straightforward fix
- **Abaikan** — dismiss it (won't be forgotten, just marked as intentionally skipped)

Once you've triaged everything, click **Export Markdown** (bottom-right) — it downloads a `.md` file
listing every "Fix by AI" finding with its instruction attached. Hand that file to Claude Code
(drag it into the chat, or give the path) and it works through the list.

---

## Install

```bash
pnpm add -D pixel-review        # or: npm install -D pixel-review / yarn add -D pixel-review
npx pixel-review init
npx playwright install chromium  # once per machine
```

`init` scaffolds `.claude/commands/pixel-review.md` into your repo. It's the only file this package
writes outside `node_modules` — the driver, report template, and principles doc are referenced
directly from `node_modules/pixel-review/` at review time, so upgrading the package (`pnpm update
pixel-review`) upgrades those automatically without touching your repo.

**If you already have a customized `.claude/commands/pixel-review.md`,** `init` will refuse to
overwrite it and tell you to run `npx pixel-review diff` instead. Merge changes by hand.

## What's in the box

| Path                           | What                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `assets/command.md`             | Source of `/pixel-review` — copied into your repo by `init`                                                 |
| `src/driver.js`                 | Headless Playwright explorer — BFS crawl, targeted routes, or a hand-authored `flow.json` trigger script    |
| `assets/report-template.html`   | Self-contained HTML report shell (no build step, screenshots embedded as base64)                             |
| `assets/principles.md`          | Default CHOICE Principles + NNG 10 Usability Heuristics + scoring reference                                  |

## Customizing the design principles

`assets/principles.md` ships Mekari's CHOICE framework as a sane default. If your team uses different
principles, copy that file into your own repo, edit it, and change the two `node_modules/pixel-review/assets/principles.md`
references inside your scaffolded `.claude/commands/pixel-review.md` to point at your copy instead.
Everything else in the command (NNG heuristics, scoring formula, severity scale) is framework-agnostic.

## Scoring

```
Overall = round(CHOICE × 0.6 + NNG × 0.4)
```

PRD Coverage and the AI UT Simulation (5 personas) are still run and shown in the report — gap table
and persona cards — but are informational only and never factor into Overall.

| Score  | Status          | Meaning                                     |
| ------ | --------------- | -------------------------------------------- |
| 85–100 | ✅ Ready        | Good to build / send to real user testing    |
| 70–84  | ⚠️ Needs Polish | Fix the Critical & Major findings, then ship |
| 50–69  | 🔶 Needs Work   | Needs a real revision pass before it's ready |
| 0–49   | 🔴 Not Ready    | Back to the drawing board                    |

## Notes

- The driver's generic BFS/form-fill heuristics work against any web app; a few selector fallbacks
  (`.mp-button`, `.mp-drawer`, `.mp-tabs__item`, …) assume Mekari's Pixel3 design system class prefix
  and will simply no-op (not error) on apps that don't use it.
- Not published to npm yet — install directly from this repo (git dependency or `npm pack` + local
  install) until a release is cut.
