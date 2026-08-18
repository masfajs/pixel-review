## Push workflow

When the user has finished "vibe coding" (an implementation/iteration session) and signals they want to
push the branch to remote, ask first whether the change needs a design review, offering exactly these 3
options:

1. **Review + generate HTML report** — run `/pixel-review` in full and produce the HTML report as usual.
2. **Review + summary in this chat** — run the same review (Playwright exploration + CHOICE+NNG-weighted
   audit) but report the findings as a summary in this chat session only; skip generating the HTML
   report file.
3. **I'll review later** — skip the review now; proceed straight to pushing the branch to remote (still
   following the standard git safety protocol, e.g. confirming the push itself unless already
   pre-authorized).

Don't ask this when the user explicitly requests a plain `git push` with no vibe-coding context (e.g.
they're just syncing an already-reviewed branch).

`/pixel-review` is provided by the `pixel-review` devDependency (`.claude/commands/pixel-review.md`,
scaffolded via `npx pixel-review init`) — a live browser UX audit of the running prototype, distinct
from any diff/compliance-checklist review the repo may already have.
