# 裁-160 — OD-11: the parked S4-V2 canary's clara-side rows die with the schema — ACCEPTED, written as an as-run line at FS-11 step 4 (the reset), not later

**Ruled 2026-09-03 ≈20:4x MYT (owner, AskUserQuestion): 「照建議」.**

- `clara.agent_interruptions` `daba7f2e%` and `clara.agent_tasks` `032767e6%` go with
  `DROP SCHEMA clara CASCADE`; the `workflow.workflow_runs` row survives under constraint 15 (an
  orphaned durable run, recorded as such).
- Constraint 11 (never ANSWER the canary / never APPROVE the witness) is untouched — deleting test
  rows is neither; constraint 14 makes the estate resettable. No preserve attempt (an un-drilled
  write path designed around `scripts/hooks/pinned-ids-guard.mjs`).
- The DR STRICT `4.9` parity probe loses its subject → OD-22 names the replacement at the close.
- The "preserve first" alternative was offered with its cost and not taken.

**Record.** Ledger `-09-03` + digest row at the final truing; FS-11 prep D-2 carries it.
