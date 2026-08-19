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
internal, verified against the live doc 2026-08-18). Used as-is, no live fetch at review time.

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

## Scoring Reference

Scores are **computed entirely client-side by the report's own JavaScript** from the findings tagged
during review (severity + principle/heuristic) — never authored by the LLM, and not baked into any
static placeholder. Runs identically on page load and again every time a finding is marked "Abaikan"
in the browser.

Each of the 6 CHOICE principles starts at 100 points; each of the 10 NNG heuristics starts at 10
points. Every active (not dismissed) finding tagged to a principle/heuristic deducts from it:

| Severity | CHOICE (per principle, starts 100) | NNG (per heuristic, starts 10) |
| -------- | ----------------------------------- | -------------------------------- |
| Critical | −40                                  | −10                               |
| Major    | −20                                  | −5                                |
| Minor    | −8                                   | −2                                |

Multiple findings on the same principle/heuristic sum their deductions, floored at 0. The CHOICE
column is exactly 4× the NNG column — deliberate: NNG sums its 10 heuristics directly into
`Overall × 0.4`, while CHOICE averages its 6 principles into `Overall × 0.6`, so 1 NNG point is worth
4× the Overall impact of 1 CHOICE point; the 4× deduction equalizes a Critical/Major/Minor finding's
real impact on Overall regardless of which framework it's in.

**CHOICE = average of the 6 principle scores. NNG = sum of the 10 heuristic scores** (already 0–100,
no averaging). **Overall = round(CHOICE × 0.6 + NNG × 0.4)** — CHOICE and NNG are the only two
frameworks that factor into Overall. PRD Coverage (gap table) and AI UT Simulation (persona section)
are still computed and shown in the report, but are informational only and never factor into Overall.

| Score  | Status          | Meaning                                |
| ------ | --------------- | -------------------------------------- |
| 85–100 | ✅ Ready        | Lanjut ke development / real UT        |
| 70–84  | ⚠️ Needs Polish | Fix critical & major dulu, baru lanjut |
| 50–69  | 🔶 Needs Work   | Revisi signifikan sebelum lanjut       |
| 0–49   | 🔴 Not Ready    | Back to design, jangan lanjut dulu     |

**Severity scale:**

- **Critical** — blocking user dari complete task
- **Major** — significantly impact usability
- **Minor** — polish issue, tidak block user
- **Passed** — no issue
