# pixel-review

Playwright-driven design review workflow for [Claude Code](https://claude.com/claude-code). Point it
at a running prototype (and ideally a PRD or a short scenario), and it explores the app headlessly,
scores it against a **CHOICE (60%) + NNG (40%)** weighted UX audit, and produces a single
self-contained HTML report with embedded screenshots, a PRD coverage gap table, and an AI-simulated
usability test with a persona roster sourced from your PRD, prior research, or a synthetic panel.

No engineering background required — install and run this yourself, start to finish.

---

## Install

```bash
pnpm add -D pixel-review        # or: npm install -D pixel-review / yarn add -D pixel-review
npx pixel-review init
npx playwright install chromium
```

- `init` scaffolds `.claude/commands/pixel-review.md` and appends a **Push workflow** gate to your
  `AGENTS.md`/`CLAUDE.md`, so Claude also offers a review before every `git push` — not just when you
  remember to run it yourself.
- If `.claude/commands/pixel-review.md` already exists and is customized, `init` won't overwrite it —
  run `npx pixel-review diff` and merge by hand instead.

## Run it

**On demand** — open Claude Code, make sure the prototype is running (e.g. `pnpm dev` at
`http://localhost:3000`), then:

```
/pixel-review request time off revamp http://localhost:3000
```

**Automatically** — thanks to the Push workflow gate from `init`, Claude will also offer a review on
its own right before a `git push`, even if you never type the command.

Claude will ask a couple of quick questions first:

- **PRD URL** _(optional)_ — a Confluence or Coda link, checked off requirement by requirement.
- **What to focus on** _(optional)_ — a plain-language flow name like `"create ticket flow"`.

> **Give it a PRD URL or a focus scenario if you can.** Without either, Claude falls back to **BFS
> mode** — it crawls your whole app's navigation broadly and shallowly instead of following one flow
> end-to-end, which takes longer and produces a less focused report.

Then it browses on its own — clicking through, filling forms, opening drawers, screenshotting states —
and after a few minutes writes an HTML report and opens it in your browser.

## The report

| Section              | What it tells you                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Score strip**       | Overall / CHOICE / NNG, each 0–100. See [Design principles & scoring](#design-principles--scoring).                   |
| **01 · Persona** | One tab per persona in the resolved roster (from your PRD's target-users table, your own input, Mekari's internal persona library, a freshly cast synthetic panel, or — as a last resort — 5 generic role personas), plus their own CHOICE/NNG sub-score. Identity only — role/goal/dossier, not tied to this specific run. See [Persona-driven reviews](#persona-driven-reviews). |
| **02 · Walkthrough & AI UT Simulation** | The same tabs, now showing what happened when each persona used the prototype: their screenshots/findings (tagged Minor/Major/Critical, states with no issues aren't shown) and their simulated task narrative. Switching a tab here also switches Section 01. |
| **03 · CHOICE & NNG** | A cross-flow read across all personas: how the whole experience holds together, not just one screen at a time.        |
| **04 · PRD Gap Analysis** | Every requirement from your PRD, checked off as Implemented / Partial / Not found. Only shown if you gave a PRD URL. Informational. |

## Act on findings

Each finding in the Walkthrough has three buttons:

- **Fix by AI** — queue it for Claude to fix automatically later
- **Diskusi** — flag it as needing a PM/design decision first
- **Abaikan** — dismiss it (marked as intentionally skipped, not forgotten)

Once triaged, click **Export Markdown** (bottom-right) — downloads a `.md` file listing every "Fix by
AI" finding with its instruction attached. Hand that file to Claude Code and it works through the list.

## Design principles & scoring

Every review is scored against two frameworks:

**CHOICE** (Mekari's design principles):

- **C — Clear:** User tahu apa yang harus dilakukan dalam 5 detik pertama
- **H — Holistic:** Konsisten dengan produk lain di ekosistem yang sama
- **O — Open:** User selalu tahu status, progress, dan next step — tidak ada black box
- **I — Individual:** Works untuk berbagai role, goal, dan background user
- **C — Contextual:** Info & action yang tepat ditampilkan di waktu yang tepat
- **E — Emotional:** User merasa positif dan confident, tidak frustrasi atau bingung

**NNG 10 Usability Heuristics:**

| Code | Heuristic                                                                               |
| ---- | --------------------------------------------------------------------------------------- |
| H1   | Visibility of System Status — always keep users informed                                |
| H2   | Match Between System and Real World — speak users' language                             |
| H3   | User Control and Freedom — support undo and exit                                        |
| H4   | Consistency and Standards — follow platform conventions                                 |
| H5   | Error Prevention — prevent problems before they occur                                   |
| H6   | Recognition Rather Than Recall — minimize user's memory load                            |
| H7   | Flexibility and Efficiency — accelerators for expert users                              |
| H8   | Aesthetic and Minimalist Design — remove irrelevant information                         |
| H9   | Help Users Recognize, Diagnose, and Recover from Errors — plain language error messages |
| H10  | Help and Documentation — easy to search, task-focused                                   |

```
Overall = round(CHOICE × 0.6 + NNG × 0.4)
```

PRD Coverage and the AI UT Simulation are still run and shown in the report but are informational only
and never factor into Overall — including each persona's own tab-level CHOICE/NNG sub-score, which is
informational too.

| Score  | Status          | Meaning                                     |
| ------ | --------------- | -------------------------------------------- |
| 85–100 | ✅ Ready        | Good to build / send to real user testing    |
| 70–84  | ⚠️ Needs Polish | Fix the Critical & Major findings, then ship |
| 50–69  | 🔶 Needs Work   | Needs a real revision pass before it's ready |
| 0–49   | 🔴 Not Ready    | Back to the drawing board                    |

If your team uses a different framework than CHOICE, replace `## CHOICE Principles` in
`assets/principles.md` (copy it into your own repo first, then point `.claude/commands/pixel-review.md`
at your copy) — NNG, the scoring formula, and severity scale are framework-agnostic.

## Notes

- The driver's generic BFS/form-fill heuristics work against any web app; a few selector fallbacks
  (`.mp-button`, `.mp-drawer`, `.mp-tabs__item`, …) assume Mekari's Pixel3 design system class prefix
  and will simply no-op (not error) on apps that don't use it.
- Not published to npm yet — install directly from this repo (git dependency or `npm pack` + local
  install) until a release is cut.

## Persona-driven reviews

Instead of narrating one shared walkthrough with 5 fixed generic personas, `/pixel-review` resolves a
**persona roster** as a 4th input (alongside PRD URL / free-form scenario / prototype URL) and gives
each persona in that roster their **own** Playwright exploration and their own tab in the report.

**Roster resolution, in priority order** (stops at the first source that supplies a roster, but always
checks whether the roster needs supplementing to reach the target participant count):

1. **Your PRD's own persona table** — if the PRD has a target-users/persona section, its rows (often
   Primary/Secondary) become the default roster.
2. **Your own explicit input** — name personas directly and they override or extend the PRD's.
3. **Mekari's curated persona research library** _(optional — Mekari-internal MCP)_ — a feature-level
   or product-wide persona set, reused for consistency across repeated reviews of the same module
   instead of re-inventing one each run.
4. **Prior UT/concept-test research on the same feature** _(optional, enrichment only)_ — grounds
   persona behavior and flags known friction points to specifically re-test, without changing who's on
   the roster.
5. **A freshly cast synthetic panel** _(optional — Mekari-internal MCP)_ — used only to fill a roster
   that's short of the target participant count; requires you to approve a study brief first.
6. **The original 5 generic personas** (sales rep, CS agent, supervisor, marketing manager, new
   employee) — the fallback of last resort, only when none of the above produced anything.

**MCP involvement is entirely optional** — steps 3, 4, and 5 only run if you have Mekari's internal
research MCP connected; the whole feature works with zero MCP access, using just your PRD and your own
input.

**Personas from step 3 or 5 carry their full evidence-cited dossier into the report as-is** (role &
work, behavior, cited requests, day-in-the-life) — never compressed into a name-plus-quote summary.
Personas from your PRD or your own input (steps 1–2) use a simpler task/quote/completion card instead,
since they don't have a research dossier behind them.

**Multiple personas means multiple Playwright passes** — each persona gets its own `flow.json` and its
own exploration run, since a new employee and a power user genuinely take different paths. This scales
wall-clock time with roster size, but not meaningfully cost: Playwright execution and HTML generation
are both effectively free token-wise, and screenshots are deduped when two personas land on the exact
same screen/state.

**Dimensions to combine when generating a B2B SaaS persona** (starting reference, not exhaustive —
  the two examples raised so far, New Subscriber and Power User, are really points on the *tenure* axis
  below; a generator should mix axes, not just vary tenure):

  | Axis | Range |
  | --- | --- |
  | **Tenure / lifecycle stage** | Trial/new subscriber (still exploring, needs guidance) → Ramping (weeks in, learning workflows) → Power user (years in, wants shortcuts/advanced features) → Dormant/churn-risk (was active, now disengaged — different needs, e.g. re-engagement) |
  | **Role / seniority** | Front-line (agent doing the daily grind) → Team lead/supervisor (reports, QA, oversight) → Admin/owner (settings, billing, integrations) → IT/technical integrator (API, webhooks, SSO) |
  | **Company size** | SMB/solo operator (one person wears every hat) → Mid-market (small dedicated team) → Enterprise (specialized roles, procurement/compliance involved) |
  | **Industry / vertical** | e.g. for Qontak: retail/e-commerce, F&B, logistics, financial services, education, healthcare, professional services — shifts which features matter most (promo broadcast-heavy vs ticketing-heavy vs compliance-heavy) and which terms are familiar |
  | **Technical literacy** | Non-technical (does everything through the UI) → Technical (has an IT/dev team, expects API access) |
  | **Plan tier** | Free/Starter (feature-gated, price-sensitive) → Professional → Enterprise (expects SSO, advanced permissions, SLAs) |
  | **Channel complexity** | Single-channel (e.g. just WhatsApp) → Omnichannel (WA + IG + email + call managed together) |
  | **Engagement pattern** | Daily power-use (in the product for hours) → Occasional/casual (logs in monthly, forgets the UI between visits — ties to NNG H6 Recognition not recall) |
  | **Language / accessibility** | Non-native speaker (copy clarity matters more — CHOICE Clear, NNG H2) → Screen reader / keyboard-only user (currently uncovered by any existing persona, worth its own archetype) |

  **Archetypes not covered** by the 5 generic fallback personas, worth asking for by name (in your own
  input, step 2 above) or from a synthetic cast (step 5):

  - **Switcher** — migrated from a competitor's tool, has strong existing mental models that may
    conflict with this product's patterns; compares constantly.
  - **Trial evaluator** — hasn't paid yet, deciding whether to upgrade; sensitive to friction, paywalls,
    and anything that looks like a dead end.
  - **Internal champion** — the person who has to justify the tool to their own leadership; cares
    disproportionately about reports/export/proof-of-ROI, not day-to-day usage.
  - **Occasional/casual user** — the opposite of a power user on the *engagement* axis, not the
    *tenure* axis; someone who's been a customer for years but only opens the product once a month.
  - **Accessibility-need user** — screen reader or keyboard-only navigation; no current persona checks
    this at all.
