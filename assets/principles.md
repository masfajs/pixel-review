# Design Review Knowledge

Used by the `/pixel-review` command. Never guess from memory — always read this file first.

This is a **default** principle set (Mekari's CHOICE framework), shipped so `pixel-review` works
out of the box. If your team uses different design principles, replace the `## CHOICE Principles`
section below with your own — everything else (NNG, scoring reference, severity scale) is
framework-agnostic and can be reused as-is regardless of which company/product you're reviewing for.

To customize: copy this file into your own repo (e.g. `docs/pixel-review-principles.md`) and point
`.claude/commands/pixel-review.md` at your copy instead of `node_modules/pixel-review/assets/principles.md`.

## CHOICE Principles

Default source: Mekari's design principles doc
(https://docs.superhuman.com/d/Mekari-UI-UX_dP1GCpeftMT/Objective-and-Principles_suTDCYRt — Mekari
internal, verified against the live doc 2026-08-18). Used as-is, no live fetch at review time;
update this list by hand if the source doc changes materially.

- **Clear:** User tahu apa yang harus dilakukan dalam 5 detik pertama
- **Holistic:** Konsisten dengan produk lain di ekosistem yang sama
- **Open:** User selalu tahu status, progress, dan next step — tidak ada black box
- **Individual:** Works untuk berbagai role, goal, dan background user
- **Contextual:** Info & action yang tepat ditampilkan di waktu yang tepat
- **Emotional:** User merasa positif dan confident, tidak frustrasi atau bingung

Inline reference format in reports: `CHOICE · Clear` — use the name (not a letter; `C` collides
between Clear and Contextual), this exact string is what the report's scoring JS keys off.

## NNG 10 Usability Heuristics

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

Inline reference format in reports: `NNG · H4`

## Copy Categories

Applies only to findings about on-screen text — a label, button, heading, blank slate, error message,
toast, tooltip, or any other string the reader actually reads. Findings about layout, spacing, flow, or
state handling never get one.

A copy finding is still tagged to a CHOICE principle or an NNG heuristic exactly as before. The category
is appended as a third segment:

| Finding                                                                                                                      | Tag                         |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Delete team modal confirms with "Yes, delete it!" while every other destructive modal in the product confirms with "Delete"  | `NNG · H4 · consistent`     |
| Empty list state reads "You have no items yet, create one to get started" — the description restates the title              | `CHOICE · Clear · concise`  |
| Inline error on an empty required field reads "Please fill the field" — missing the article, and never names which field     | `NNG · H9 · grammar & typo` |
| Balance warning reads "Your top-up is insufficient" — "top-up" is the action, not the thing that ran out                     | `CHOICE · Clear · clarity`  |
| Filter drawer offers no way to clear all applied filters at once — nothing to do with wording                                | `NNG · H3` (no category)    |

| Category         | Covers                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `clarity`        | Ambiguous wording, jargon, accusatory phrasing, "user" where it should be "customer"      |
| `consistent`     | Term choice, verb choice, and component copy patterns that drift from what already exists |
| `concise`        | Padding, title and description repeating each other, running past a length limit          |
| `grammar & typo` | Sentence case, per-component period rules, articles, `!`, em dash, contractions           |

Rules:

- Exactly one category per finding. Pick the dominant issue; never chain two.
- Only these four. Do not invent a fifth — fold anything else into the closest of the four.
- The category carries no weight. It adds no deduction and no score of its own — the report's scoring
  JS destructures only the first two segments (`const [fw, key] = f.fw.split('·')`), so a third segment
  is inert by construction. It exists to label the finding in the card and the Markdown export, nothing
  more. See "Scoring Reference" below.
- A category is never a `fw` string on its own. `consistent` alone is invalid; it must always follow a
  CHOICE principle or an NNG heuristic.

## Scoring Reference

Scores are **computed entirely client-side by the report's own JavaScript** from the findings tagged
during review (severity + principle/heuristic + affected personas) and the AI UT task outcomes — never
authored by the LLM, and not baked into any static placeholder. Runs identically on page load and again
every time a finding is marked "Dismiss" in the browser.

Each of the 6 CHOICE principles starts at 100 points; each of the 10 NNG heuristics starts at 10
points. Every active (not dismissed) finding tagged to a principle/heuristic deducts from it:

| Severity (Nielsen) | CHOICE (per principle, starts 100) | NNG (per heuristic, starts 10) |
| ------------------- | ----------------------------------- | ------------------------------- |
| Critical (4)        | −40                                  | −10                              |
| Major (3)           | −20                                  | −5                               |
| Minor (2)           | −8                                   | −2                               |
| Cosmetic (1)        | −2                                   | −0.5                             |

**Frequency multiplier.** Each deduction is multiplied by `0.5 + 0.5 × f`, where `f` = personas in the
finding's `p` array ÷ personas who **can reach the screen the finding is on** (the finding's `el`
array — see "Role access" below), or ÷ the whole roster when `el` is omitted. A finding every persona hits costs its full deduction; one
hit by 1 of 3 eligible personas costs ~67%. With no roster, `f = 1`. A persona's own tab sub-score always uses
`f = 1`. This mirrors the "none / most / all participants" read of a moderated UT. Severity itself
judges impact and persistence only — never fold frequency into the severity you record.

Multiple findings on the same principle/heuristic sum their deductions, floored at 0. The CHOICE column stays 4×
the NNG column because a heuristic starts at 10 and a principle at 100 (the NNG average is scaled ×10, so both end
up on the same 0–100 scale: a Minor costs 8 points on a principle's scale and 20 on a heuristic's).

**Only touched principles / heuristics are averaged.** A principle or heuristic is _touched_ when at least one
active finding is tagged to it. **CHOICE = average of the touched principles' scores** and **NNG = average of the
touched heuristics' scores × 10** (so it stays 0–100). A framework with no active finding is 100. An untouched
principle never dilutes a real finding — one Minor on Clear gives CHOICE 92, not 99. **Overall = round(CHOICE × 0.6
+ NNG × 0.4)** — CHOICE and NNG are the only two frameworks that factor into Overall.

There are **no caps**: Overall is exactly CHOICE × 0.6 + NNG × 0.4, so the three numbers on the page always
agree. Persona task outcomes (Succeeded / Succeeded with difficulty / Failed) are shown in the report but never change
a score. Because the score is sensitive to _which_ principle or heuristic a finding is tagged to, tag the one that
names the actual failure, never a convenient neighbour.

PRD Coverage (gap table) and the AI UT task-success percentage are still shown as informational numbers
and never add to Overall.

| Score  | Status          | Meaning                                |
| ------ | --------------- | --------------------------------------- |
| 85–100 | ✅ Ready        | Lanjut ke development / real UT        |
| 70–84  | ⚠️ Needs Polish | Fix critical & major dulu, baru lanjut |
| 50–69  | 🔶 Needs Work   | Revisi signifikan sebelum lanjut       |
| 0–49   | 🔴 Not Ready    | Back to design, jangan lanjut dulu     |

**Severity scale** (Nielsen 1–4, impact + persistence only):

- **Critical (4)** — blocking user dari complete task; wajib diperbaiki sebelum rilis
- **Major (3)** — significantly impact usability; prioritas tinggi. **Rule of thumb — primary-task friction is Major:** the persona must hunt for a control to do their main task (e.g. the edit action is hidden in a menu), or information they need to decide at that moment is hidden or ambiguous (e.g. a boundary value that could belong to two tiers). A secondary aid that is merely inconvenient (scroll back, re-read) stays Minor. Judge against the persona's _main task_, not the page.
- **Minor (2)** — polish issue, tidak block user; prioritas rendah. Ada workaround ringan.
- **Cosmetic (1)** — hanya tampilan, perbaiki bila ada waktu
- **Passed** — no issue

## Issue Types (informational — no weight)

Tag each finding with exactly one type in `ty`. It groups findings in the report and never changes a score:

- `Wayfinding` — user cannot find a screen, entry point, tab, or control
- `Functionality` — the feature behaves in a way users misread or that blocks the task
- `Design & Labeling` — visual hierarchy, placement, labels, terminology
- `Context understanding` — user lacks the mental model (logic, terms, consequences)

**Needs are not issues.** A new need or idea a persona expresses ("wants customer profiling") is recorded
in the report's "New needs (not scored)" list, never as a finding, and never scored.

## Role access

Personas have limits. A staff-level role often cannot open Settings, and a review that treats every
persona as able to reach every screen skews the score. Each persona carries an **access scope** — the
surfaces its role can reach:

- Read it from the PRD/research plan (an "Access" column or per-role note) or from the user. If it is
  not stated, assume **full access** and say so in the persona card's Access line ("full access —
  assumed, not stated in the document"); never leave it silently implied.
- A persona only attempts tasks on surfaces its role can reach, and its task outcome (Succeeded /
  Succeeded with difficulty / Failed) is judged on those tasks alone.
- Each finding's `el` lists the personas whose role can reach that screen. `p` (who hit it) is always a
  subset of `el`. The frequency denominator is `el`, not the roster.
- A persona never appears in `p` for a screen outside its access, even if the screen exists in the
  prototype.
