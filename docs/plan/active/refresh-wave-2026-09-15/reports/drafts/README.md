# Wave 2026-09-15 — posting drafts

This folder holds drafts only. Nothing here has been posted to GitHub; no `gh issue`/`gh pr` command
has been run against these tickets, and no git operation has touched the repo.

`comment-<n>.md` (twelve files, one per delivered ticket: #625, #633, #638, #639, #646, #647, #648,
#649, #650, #652, #653, #654) is the delivery comment to post on that ticket once its branch merges
into `integration/wave-2026-09-15`. Each is built from that ticket's `<n>-final.md`, its
`<n>-fixround-*.md` round(s), and its `<n>-recheck-*.json` — the re-check JSON is the authoritative
state for any finding it covers, overriding an earlier fix-round claim where the two differ. Every
comment ends with a fixed placeholder line, `**Integration evidence:** <INTEGRATION_PLACEHOLDER>`,
that the orchestrator fills in with the actual merge/CI evidence after the integration branch lands
— do not post a comment with that placeholder still in it. `issues.md` is the wave's follow-up
backlog: 54 issues (10 cross-cutting infrastructure findings, 44 ticket-specific), each with a title,
a `labels:` line, and a Context/What-is-wrong/Done-when/Evidence body, in the order they should be
filed. Every issue carries `needs-triage` plus exactly one of `ready-for-agent`/`ready-for-human`
(27 of each); none use `idea` — these are engineering follow-ups, not product ideas. It merges six
sets of near-duplicate rows from `reports/WAVE-DIGEST.md` §3 into single issues (declared explicitly
inside each merged issue's Evidence line — one of the six, the needs-you/review-queue pair, bundles
two independently-fixable polish items as an editorial call rather than a true duplicate; split it
back into two if that reads as overreach) and adds one follow-up
(`clara.approve_wrong_client_correction`'s lock ordering) that DECISIONS.md §3.1 named but the
digest did not carry as its own row.

To post, run these from the repo root once each ticket's PR has actually merged:

```sh
# one delivery comment per ticket, after its PR merges into integration/wave-2026-09-15
gh issue comment 625 --body-file docs/plan/active/refresh-wave-2026-09-15/reports/drafts/comment-625.md
# ...repeat for 633, 638, 639, 646, 647, 648, 649, 650, 652, 653, 654

# one issue per section in issues.md, in file order — split each section into its own
# --title/--label/--body-file before running; gh has no "create many from one file" mode
gh issue create \
  --title "<the ### heading, without the ###>" \
  --label needs-triage --label <ready-for-agent|ready-for-human, per that section's labels: line> \
  --body-file <a temp file holding that section's body>
```

Before running either command, replace every `<INTEGRATION_PLACEHOLDER>` with the real evidence, and
confirm the labels exist in the target repo with `gh label list` (the three used here —
`needs-triage`, `ready-for-agent`, `ready-for-human` — already exist as of this wave, so no
`gh label create` step is needed).

> Migration numbers in these drafts were re-mapped on 2026-09-17 after origin/main took 0199–0213 (DECISIONS §3.4): the wave's files are 0214–0224. Reports under `reports/` written before that keep the old numbers.
