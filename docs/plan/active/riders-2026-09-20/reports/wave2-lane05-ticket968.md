# Wave 2, lane 05 — ticket #968

Branch `riders/w2-lane05`, worktree `C:\Users\zhant\Desktop\clara-wt\655`, base
`23cfad947b5598214168ba9c43d391b4e16aa745`.

Commits (`git log 23cfad947b5598214168ba9c43d391b4e16aa745..HEAD`, this ticket's two on top of
#964's four, already landed by the previous implementer):

```
720d8a55c feat(db): #968 let a different active bookkeeper re-issue a blocked batch stop
0e48dacf6 test(db): #968 add the batch-cancellation re-issue cells, red against the unconditional refusal
60752b3fd fix(web): #964 the batch card and its census follow the MYT window off UTC
475e8ce35 fix(db): #964 fix-round — bind v_oid to a literal so wiki-dynamic-sql attributes it
63fa30bd1 test(db): #964 recut the batch-board's UTC-window pin to Asia/Kuala_Lumpur
f049a0d7d feat(db): #964 move the document-ingest reservation window to Asia/Kuala_Lumpur
```

## #968 — Allow a different bookkeeper to re-issue a stop after the original canceller loses authority mid-batch

**Status: done.**

Verified live on this branch via `gh issue view 968 --comments`: one comment, an owner ruling
dated 2026-09-20 ("Confirmed Option B: a different, currently active bookkeeper may re-issue a
stop on an intake batch whose original canceller has lost active membership, under a fresh
operation key … recorded as a genuinely new decision, never a re-key of the original") plus the
Agent Brief in the issue body — the newest and only Agent Brief, so it and the ruling are the same
document. Not already satisfied on `main`/this branch: measured on this lane's own rig (`clara_l05`,
chain 0001→0252, before any change) via a focused, gate-bypassed run of the new
`p968.reissue.blocked_canceller_may_be_replaced` cell, `clara.cancel_intake_batch` still raised
CLR13 `batch_already_cancelling` unconditionally on a second decision, whatever the stored
canceller's standing — the exact gap the ticket names.

### The seams tested

Named in the Agent Brief's "Key interfaces": `clara.cancel_intake_batch` (the door whose
refusal-on-duplicate rule gains the exception) and `clara.get_intake_batch` (the read whose
`cancel_blocked` field must clear once the re-issue lands — with **no code change**, since it
already reads the row live). Both are real public doors, reached through `humanQuery`/`roleQuery`
personas exactly as the rest of `intake-batch.test.mjs` does — no internal-function prosrc reading
was needed this time, unlike #964's ungranted reservation helpers.

### Acceptance criteria, each with its evidence

- [x] **A batch whose stored canceller no longer holds an active bookkeeper+ membership can be
  re-cancelled by a different, currently active bookkeeper, under a key distinct from the
  original.**
  Evidence: `p968.reissue.blocked_canceller_may_be_replaced`
  (`packages/db/tests/intake-batch.test.mjs`) — BOB cancels, is removed from `firm_memberships`,
  ALICE (owner, active) re-issues under a fresh key; asserts `reissued.cancel_requested_by ===
  ALICE()`, `reissued.cancel_op_key === newKey`, `newKey !== originalKey`, and the still-live child
  is handed to the new decision. Confirmed **RED first** (see "Already satisfied" note above).
  Result after the migration: **PASS**.
- [x] **The re-issued stop does not re-key or duplicate-cancel any child already assigned to the
  original decision.**
  Evidence: `p968.reissue.excludes_already_committed_child` — a sibling already carrying a
  committed operation receipt is asserted absent from the re-issue's own `children` list (which
  comes from `clara._intake_batch_live_children`, unmoved by this migration — a committed receipt
  or terminal status excludes a child structurally, not by any new logic), and its receipt id is
  asserted unchanged after the re-issue and a fan-out call. **PASS**. Also covered implicitly by
  `p968.reissue.blocked_canceller_may_be_replaced`'s own live-child assertion.
- [x] **A batch whose stored canceller is still active still refuses a second attempt, with the
  same refusal code and reason as today.**
  Evidence: `p968.reissue.active_canceller_still_refuses` — a second `cancelBatch` call under a
  different actor and key, while the original canceller stays active, raises `CLR13`
  `batch_already_cancelling` naming the still-live decision's own key; the stored row is asserted
  untouched. **PASS**. (`p636.batch.cancel_keeps_receipts`'s own pre-existing CLR13 assertion,
  unrelated to my edits, also still passes — direct regression evidence the ordinary path is
  byte-unchanged.)
- [x] **The re-issue is recorded as its own decision naming the new actor, and the original
  decision stays readable.**
  Evidence: `p968.reissue.blocked_canceller_may_be_replaced` queries `clara.audit_log` directly
  (`fn='cancel_intake_batch'`, filtered by the batch id) and asserts exactly two rows, in order:
  `(actor=BOB, op_key=originalKey)` then `(actor=ALICE, op_key=newKey)` — the append-only table
  `clara.audit_log` (0002:276-288) is never written to by this migration beyond the ONE
  unconditional `perform clara._audit(...)` the function already had at its tail, so the original
  row is structurally never touched. **PASS**.
- [x] **The batch read's block reason clears once a re-issue is accepted, and the sweep proceeds
  under the new key.**
  Evidence: same cell — `getBatch(ALICE(), …).cancel_blocked` is `'canceller_not_active'` before
  the re-issue and `null` immediately after, **with zero lines changed in
  `clara.get_intake_batch`** (proved structurally by migration 0253's own tail assertion T4, which
  re-reads `get_intake_batch`'s live prosrc and asserts its `canceller_not_active` predicate is
  byte-present and unmoved). The "sweep proceeds under the new key" half is proved by
  `p968.reissue.blocked_canceller_may_be_replaced`'s final step: `cancelWork(m.work_id,
  reissued.cancel_requested_by, ${reissued.cancel_op_key}:${m.work_id})` — the exact derivation
  `packages/runtime/lib/intake-batches.mjs`'s `resumeCancel`/`fanOutCancel` use — succeeds (reaches
  a stopping/cancelled state, never CLR04/CLR10). **PASS**.

### Out of scope — confirmed untouched

- **The terminal cancellation rule / the read envelope's existing block and pending-member
  fields.** `p968.reissue.terminal_batch_never_reissued` proves a `cancelled` (terminal) batch
  keeps refusing a second decision unconditionally even with an inactive canceller — the new
  exception is gated on `b.state = 'cancelling'` and nothing else, both by this test and by
  migration 0253's own §T2 (exactly one `batch_already_cancelling` raise site remains, unmoved in
  count) and §T4 (get_intake_batch's own body is untouched, asserted against its live prosrc).
- **A general "reassign authority mid-operation" mechanism for any other door.** The exception
  lives entirely inside `clara.cancel_intake_batch`'s own body; no other function was touched.
- **A cadence for the cancellation sweep.** `clara.sweep_intake_batch_cancellations` is unmoved —
  confirmed by migration 0253 never naming it and by `p968.reissue.*` never needing to call
  `sweep()` to observe the re-issue (the door's own return value already carries the new
  actor/key).
- **Web/runtime changes.** Confirmed by reading `apps/web/components/documents/intake-batch-card.tsx`
  (the Stop button is gated only on `!terminal`, never on `cancel_blocked` — line ~320) and
  `intake-batch-cancel-dialog.tsx` (`useDecisionKey()` mints a fresh UUID per dialog OPEN) — a
  different, currently active bookkeeper opening the same card and pressing Stop again already
  sends exactly the shape this door now admits. Neither file is touched by this PR
  (`git log 23cfad947b5598214168ba9c43d391b4e16aa745..HEAD -- apps/web` shows only #964's own
  commit, none of mine).

## Migration

`packages/db/migrations/0253_batch_cancel_reissue.sql` — one new file, as reserved.

**Prestate pin** (MEASURED on `clara_l05`, chain 0001→0252, PG 17.11, 2026-09-20, via
`encode(sha256(convert_to(prosrc,'UTF8')),'hex')` keyed by `to_regprocedure`, never transcribed
from file text — #964 touched neither this function nor its signature, so the pin is the same body
0229 shipped):

| signature | sha256(prosrc) |
|---|---|
| `clara.cancel_intake_batch(uuid,uuid,text)` | `18f5b8d52209dbd067da1e1d74d0ed66f19c59a236a51ec60fa6f15271501222` |

House shape followed: header, prestate DO block, one splice DO block (§A, TWO non-overlapping
anchors in the one body — the refusal-on-duplicate guard, and the `open`/`cancelling`
state-transition block — each measured to occur exactly once before splicing, reverse-substitution
proved after), a fresh `comment on function`, and a §T tail re-reading the committed catalog (the
exception's own text is present; exactly one `batch_already_cancelling` raise site remains, proving
the terminal rule's raise was moved deeper rather than duplicated; the ACL is byte-identical to
what §0 measured; `clara.get_intake_batch`'s own `canceller_not_active` predicate is present and
unmoved; no new function — in particular no `_intake_batch_canceller_blocked` helper — exists,
which is this migration's own proof it needed no rig-meta cohort). **No rig-meta cohort**: no
function was added, removed or regranted (the one function's signature and ACL are unchanged, §T
re-verifies both), so `operation-census.test.mjs`/`rig-isolation.test.mjs` need no new tracking —
both were still run as required (packages/db/tests was touched) and both pass.

Applied once (`pnpm db:migrate`), then **redone once** for real
(`CLARA_MIGRATION_REDO=0253_batch_cancel_reissue`, no prior edit needed — run purely to exercise
and prove the redo-tolerance the house shape requires): the splice's own "already at the re-issue
target … skipping the splice" branch fired for real, and §T re-verified against the unchanged
result. Recorded here per the work order's instruction to record a redo when one is used.

## Gates, with counts

- **`intake-batch.test.mjs`** (touched: new stem gate + 4 new `p968.reissue.*` cells), full
  51-entry preintegration-gate chain, focused: **36/36 PASS**, 0 skipped. Confirmed RED first: the
  core cell (`p968.reissue.blocked_canceller_may_be_replaced`) and
  `p968.reissue.excludes_already_committed_child` both failed with `CLR13
  batch_already_cancelling` when run against the pre-migration function (gate temporarily
  bypassed via a since-reverted `CLARA_P968_FORCE_RED` escape hatch, never committed); the other
  two new cells (`active_canceller_still_refuses`, `terminal_batch_never_reissued`) were already
  green pre-migration, as expected — they pin behaviour this ticket must NOT change.
- **`operation-census.test.mjs`**: **10/10 PASS** (run because `packages/db/tests` was touched; no
  SQL function was added so this was a sanity check, per the same reasoning #964's own report
  used).
- **`rig-isolation.test.mjs`**: **22/23 PASS, 1 skipped** (T19, the destructive role-reset drill —
  correctly skipped, `CLARA_RIG_ALLOW_RESET`/`CLARA_RIG_ALLOW_ROLE_SWEEP` deliberately unset per
  RIG.md). Never run with reset flags.
- **`pnpm typecheck`** (repo root): `packages/runtime`: **pass**. `apps/web`: **FAILS**, on the
  SAME pre-existing, unrelated defect #964's own report already documented
  (`document-kind-dialog.tsx:95`, undefined `DOCUMENT_KINDS`) — reconfirmed not mine via
  `git log 23cfad947b5598214168ba9c43d391b4e16aa745..HEAD -- apps/web/components/documents/document-kind-dialog.tsx`
  (empty). `packages/db`: no typecheck script. Not touched this ticket (no apps/web change), so no
  new obligation to fix it.
- **`pnpm lint`** (whole monorepo, run three times: once surfacing a new finding, once after
  fixing it, once final): first run **FAILED** — `wiki-dynamic-sql` correctly flagged
  `cancel_intake_batch`'s own `execute v_head || 'AS $tag$' || v_new || '$tag$'` CoR-patch idiom
  (the same unprovable-by-construction shape #964's four splices used) as unwaived dynamic SQL.
  Fixed by adding ONE new `DYNAMIC_SQL_ALLOWLIST` entry (`cancel_intake_batch(uuid,uuid,text)`,
  `scripts/wiki-lint-checks.mjs`) declaring the exact `clara.*` token set the live installed body
  was measured to contain (13 tokens, including `cancel_accounting_work` and `get_intake_batch`,
  which are named only in prose comments, never called — declared anyway per the house rule that a
  byte-level regex cannot tell a comment from code and a waiver must never under-declare), and
  updating the paired ratchet self-test (`scripts/check-wiki-dynamic-sql.selftest.mjs`)'s pinned
  key list from 17 to 18. Final run: **PASS, exit 0**. `wiki-dynamic-sql: OK — 1410 clara function
  definition(s) and 217 change-of-record patch(es) scanned … 18 justified dynamic-SQL waiver(s)`.
  `check-frozen-workflows.mjs` (also run directly, standalone): clean, no manifest diff.
- **apps/web / packages/runtime**: not touched, so no whole-unit-suite run and no browser walk are
  required by the work order's own conditional rule (rule 8), and none was run.

## Docs updated (same commits)

- `CONTEXT.md` — new entry, "Batch cancellation re-issue".
- `packages/db/README.md` — the `#636`/`#964` section gains a `#968` paragraph describing the
  exception, its gating, and why neither the read nor the sweep needed a line changed.
- `packages/db/migrations/0253_batch_cancel_reissue.sql` — its own extensive header.
- `scripts/wiki-lint-checks.mjs` / `scripts/check-wiki-dynamic-sql.selftest.mjs` — the new waiver
  entry and the ratchet's own ledger comment (13→17→18), in the house style.

## Successor contract

None needed. `clara.cancel_intake_batch` is an ordinary `SECURITY DEFINER` SQL door with no
`clara_authenticated` twin, granted to `clara_runtime` only, and is not part of any frozen workflow
closure (`node scripts/check-frozen-workflows.mjs` ran clean, no manifest diff).

## Follow-ups worth filing

1. Not a new finding, but re-confirmed while gating: `apps/web/components/documents/document-kind-dialog.tsx:95`'s
   undefined `DOCUMENT_KINDS` (already flagged in #964's own report, Follow-up #1) still fails
   `pnpm typecheck` for `apps/web` and still blocks every e2e browser walk on this branch. Not
   touched here (out of my ticket's scope; no apps/web file is touched by this PR).
2. The `sweep(20)`-style test starvation #964's own report flagged (repeated re-runs of
   `intake-batch.test.mjs` accumulate `cancelling`-state debris rows, which can push a fixture's
   own batch past a bounded worklist's `limit`) reproduced again during this ticket's own
   development: `p636.batch.sweep_settles` failed once, transiently, after several manual re-runs
   left 42 stale `cancelling` rows on `clara_l05`. Cleaned up the same way #964 documented
   (temporarily disabled the two append-only triggers on `clara.intake_batch_member_events`,
   deleted debris across all three intake-batch relations, re-enabled both triggers, verified 0
   rows and `tgenabled='O'`) — done twice this session (once mid-work after the first full gated
   run, once at the end for ticket #965's benefit). `clara_l05` is clean (`intake_batches` /
   `intake_batch_members` / `intake_batch_member_events` all 0 rows) as of the end of this ticket.
   Worth a real fix (e.g. a higher sweep limit or ordering the test's own assertion by batch id
   rather than assuming the parent is near the front) rather than repeated manual cleanup by every
   ticket that happens to re-run this file several times.

## Anything unverified

- Nothing beyond Follow-up #1 above (a pre-existing, independently-confirmed-absent-from-my-diff
  defect). Every acceptance criterion above has direct evidence from a real door call or a
  migration-tail assertion against the live catalog; nothing here rests on an unverified claim.
