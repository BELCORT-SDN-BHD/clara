Merged to `main` at **`ede1df83`** (PR #954, "Wave 2026-09-18"), tip
`impl/636-work-batch@879125fd` (base + fix rounds 1–2). Migration
**`packages/db/migrations/0229_intake_batches.sql`** — the durable intake-batch relation family
(parent, member child, append-only ledger) and six granted doors. **All evidence below is LOCAL;
hosted evidence pending — this ticket stays open until the hosted release.**

## AC / historical rows

| Row | Disposition | Evidence |
|---|---|---|
| AC1 group + dependency, no batch tx | done | `p636.batch.attach_idempotent`/`.no_transaction`/`.dependency_lifecycle`/`.member_rls_child` |
| AC2 N−5 finish, 5 wait, poison isolation | done — fix round: "failed 35" was 31 posted members | World leg re-run; `p636.batch.failed_excludes_settled`; `p636.poison.cross_firm` |
| AC3 derived progress, distinct ids, no % | done — envelope gained `cancel_blocked`/`pending_members`, neither a denominator | `.distinct_work_ids`/`.settled_is_a_receipt`/`.facets_overlap`/`.no_percentage`/`.preview_bound` |
| AC4 answer/retry/cancel keeping receipts | done — fix round closed ADV-636-01 (stop-before-admission stopped nothing) | `.cancel_keeps_receipts`/`.one_receipt_through_retry`/`.cancel_before_admission`; World legs 2–3 |
| AC5 Documents + Work-detail addresses | done — fix round closed V636R-2 (row was posted-only, now any state) | walk (deep link/reload/facet); `p636.work_detail.batch_row` ×2 |
| AC6 states/a11y/zoom/keyboard/SR | done | card 20, a11y 4, keyboard 5, url-state 7; walk's axe/320px/200%/reduced-motion |
| AC7 least-privileged, durable, recovery | done | `humanQuery`/`roleQuery` battery; post-kill belt `{batchCancelChildren:3, batchCancelFailed:0}` |
| UI-30/UI-31 (REDESIGN) | verify-only — firm-leaf `readOnly` hid its only control (inverted), removed | `p636.card.child_addresses`; "FIRM-LEAF mount keeps Cancel" |
| C51.1 one business receipt | done | `.one_receipt_through_retry` — one receipt per `logical_op_id` |
| C51.4 authority through reclaim | done — fix round closed ADV-636-03 (revoked canceller never finished) | `.authority_revoked_midbatch` (CLR04); `.cancel_blocked_after_revocation` |
| C51.7 reservation atomicity | verify-only, findings carried, neither fixed (D4) | `.reservation_atomicity`/`.capacity_refusal`/`.capacity_window_utc` |
| C77.1 poll helpers | verify-only | card reuses `useSettlePoll`/own `resetKey`; no new poll primitive |
| C83.X2 re-derived inventory | done (discovery) | ladder 1/10/50; 100 (≤1MB PDF), 100 (image), 20 (≤5MB PDF) |

**10 done · 4 verify-only · 0 partial · 0 descoped.**

## Rulings that shaped it

- **D4** — daily ceiling stays UTC-day, not MYT; named residual, not fixed here.
- **D5** — batch lives on the Documents side; no `list_accounting_work` recut; chat entrance contract-only.
- **§6.1** — sixth granted name `sweep_intake_batch_cancellations(int)` approved (`clara_runtime`, AC7's fan-out).
- **§6.2.0 R-B** — a second stop on an already-cancelling batch stays refused; re-key after canceller loses authority is a follow-up.
- **§6.2.0 R-C** — EN-only copy ("Stopping"); the brief's Chinese was planning shorthand.
- **§6.2.1** — ratified as shipped: terminal rule ("no live children AND no pending members"), both envelope keys, EN copy, all four deliberately-left items.
- **§6.3 row 2** — the belt's probe error escaped uncontained; ruled to contain it like FA/ADJ (fixed, below).
- **§6.4** — clock census classed all six #636 names `stamp`/`computed_at`, none a MONEY as-of; no re-pointing (unlike #660).

## What integration and the successor cut added

Integration (`e9a30794`) fixed a real lane defect: the belt's probe threw uncaught into the assembly
wrapper instead of `batchOk:false` like FA/ADJ — cloned their guard, added
`p636.runtime.belt_probe_unreadable`; belt-isolation 22/22, `intake-batch-unit` 14/14 (was 13).
`work-detail.tsx`'s merge grafted #636's own mount effect after #655's (a union would have merged two
effect bodies into one). Two more fixes (`2c73431e`, `2f60ff29`) taught `journal-work-mock.mjs` the
`intake_batch_members` read, honest-empty `[]`. The successor cut (`chatTurn_v21`/`claraWork_v5`)
left `open_intake_batch` **contract-only** — nothing registered, absence asserted by name
(`successors-final.md`).

## Named residuals — follow-up (to be filed)

Move the daily-quota window to Asia/Kuala_Lumpur (today UTC) · a refused-before-intake-exists file has
no durable refusal record · recovery belt opens every spool sidecar every sweep (Windows EPERM race)
· `sweep_intake_batch_cancellations` rides the leader's nudge, no cadence of its own · CI World leg
shares one un-drained database across three legs · a different bookkeeper re-issuing a stop (R-B).

## Blueprint drift (for #683's sync)

- `docs/PRD.md:120` — assumed no durable batch construct; now stale (parent, six doors, surface exist).
- `docs/ARCHITECTURE.md:134-135` — "organise batch work" at firm altitude still doesn't exist; the
  batch lives at client/Documents altitude, the firm leaf mounts it read-only.

## Verify locally

```
cd packages/db && node --test --import ./tests/intake-batches-preintegration-gate.mjs tests/intake-batch.test.mjs   # 31/31
cd packages/runtime && node --test tests/intake-batch-unit.test.mjs tests/reconcile-belt-isolation-unit.test.mjs     # 14/14, 22/22
cd apps/web && node scripts/run-tests.mjs                                                                            # 0 fail
cd packages/runtime && node tests/intake-batch-e2e.mjs                                                               # World leg, N=100
```
