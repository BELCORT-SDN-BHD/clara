# F-A4 PR-1c — Codex cross-model adversarial review (2026-08-27)

*Lane: `codex exec --model gpt-5.6-sol --effort xhigh`, read-only sandbox, worktree
`.claude/worktrees/codex-rev-pr1c` at `f-a4/pr-1c` tip `a035c58`. This file is the record;
the native fresh-context opus review runs in parallel and lands separately. Nothing in this
file is a ruling — the HIGH-1 item is an OWNER question (see §Conflict).*

**Verdict: FIX-REQUIRED — 2 HIGH, 6 MED, 2 LOW.**

## §Conflict — HIGH-1 is a LAW-READING COLLISION, not a defect (owner ruling needed)

Codex flags that the allowlisted wake wrappers directly invoke `_begin_close_core`,
`_abandon_close_core`, `_open_fiscal_year_core`, `_fa_run_period_core` and
`_mint_month_snapshot_core` (migration:1815/1901/1967/2180/2234/2307), and that the
walls-census tests **ratify** that access (walls-census:31, :91) — i.e. the build did this
deliberately, and its own law-71 census was written to permit it.

Two self-consistent readings are in play:

- **The gated design's reading** (what the build implemented): the reserved human acts are
  `finalize_close`, `reopen_fiscal_year`, `attest_close_exception` (+ the new
  `settle_close_proposal`). `begin_close`/`abandon_close` are *preparation* — reversible,
  receipted, and the clock is allowed to start and abandon a preparation run. Opening a
  fiscal year, running a depreciation period and minting a month snapshot are likewise
  agent-preparable under F-A4's "open-year / abandon-any / re-freeze / snapshot-mint pass to
  her" scope line.
- **The reviewer's reading** (the brief it was given): "measure, draft, propose only" — any
  core that writes authoritative operational/accounting state is human-only.

**Owner question:** which reading is law for the clocked lane? If the design's, HIGH-1 is
withdrawn and the census tests are correct as written; if the reviewer's, the five wrappers
lose their grants + allowlist rows and the tests invert. Everything else below is
independent of that ruling.

*(Post-record note: the owner RULED on 2026-08-27 — the design's reading stands and HIGH-1
is withdrawn; the ruling is recorded in `fa4-pr1c-fix-order-2026-08-27.md`.)*

## HIGH-2 — a prior REFUSED receipt can be reused as the receipt for a later ACTED mutation

`_agent_close_receipt` (migration:1199, esp. :1224 and :2097) uses `ON CONFLICT DO NOTHING`,
reads the existing row, and does not verify its verdict/vector. A task that first refuses
(e.g. a missing model version) and then retries the same derived task/verb/run key with
valid inputs writes the proposal + event while the ACTED insert collides — the function
returns `status='acted'` paired with the OLD REFUSED receipt. No Tier-C trigger protects
proposals. The main test (close-agent test:103) reuses a dry-run op across refused and
successful attempts without asserting the final verdict.
*Minimal fix:* reserve the operation before rungs/side effects, hashing all semantic inputs;
exact retries replay the stored outcome, changed inputs refuse CLR10; at minimum reject a
conflict whose verdict/vector/task/actor/model/rationale differ.

## MED findings

3. **Tier-C admits non-canonical or agent-authored terminal `close_runs`** (migration:585) —
   INSERT always classifies as `begin_close` without requiring `state='in_progress'` +
   null terminal fields; UPDATE ignores every transition except `abandoned`.
4. **Tier-C receipt binding is weak / pre-plantable** (migration:311, :612) — `subject_id`
   is polymorphic with no FK; the trigger matches act kind + subject + verdict only (not
   firm/client/actor/task/transaction).
5. **The "exactly one receipt" rule is bypassable with `SET CONSTRAINTS`** (migration:342,
   :624) — forcing the trigger immediate then inserting a second matching receipt queues no
   new trigger event. *Fix:* a partial unique index over ACTED close-run transitions and/or
   a mirrored deferred trigger on receipt insert.
6. **Direct receipt SELECT bypasses the bookkeeper floor** (migration:351, :363, :1567) —
   the gated reader enforces rank but `clara_authenticated` holds direct SELECT and the RLS
   policy checks firm only, so a viewer reads model/rationale/task metadata.
7. **A proposal can be marked `adopted` with zero linked attestations** (migration:1497,
   settle-door test:87) — `settle_close_proposal(...,'adopted')` does not prove
   `attest_close_exception(p_from_proposal)` happened. *Fix:* withdrawal-only, or verify the
   required attestations atomically.
8. **Proposal coverage + lifecycle serialization incomplete** (migration:2025, :2072) — the
   agent picks the measured check-key subset (no canonical-coverage or unique
   `(check_key,item_key)` enforcement), so a fresh task can supersede a live proposal by
   changing the subset without a real state change; lifecycle writers take no row/advisory
   lock, so attestation can race a concurrently-terminal proposal.

## LOW

9. Three append-only tests send `SET ROLE; DML` as ONE parameterized query — the extended
   Parse protocol permits one statement, so they can pass on a protocol error without
   reaching the trigger (close-agent:427, settle-door:182, walls-census:319).
10. Several census assertions can false-green: any-constraint-containing `state = ANY`;
    index name/predicate without table+keys; policy counts without arm expressions;
    allowlist functions by bare name rather than exact `regprocedure`; a frozen-schema
    census that only raises a notice.

## Explicitly clean (the reviewer's own negative findings)

- Forced RLS on all three new tables; no cross-firm or NULL-firm-context path
  (`firm_id = jwt_firm()` fails closed).
- The settle door itself enforces bookkeeper + `close_and_attest` and checks tenancy before
  reserving the op key — no foreign-proposal existence leak, no op-key burn.
- The placeholder normalizer is refusal-only; a REFUSED receipt cannot directly satisfy
  Tier-C's ACTED predicate (the replay in HIGH-2 is the exception).
- No data-built dynamic SQL; `_append_event` names are fixed literals; actor checks use UUID
  identity + `users.is_agent`, never display names.
- The partial unique index does prevent two committed live proposals.
- Savepoints alone give no extra Tier-C bypass beyond the `SET CONSTRAINTS` schedule.

## Provenance note (2026-08-27, conductor)

This file was first committed as `9d63f93` on the `docs/mohe-handoff-0827` branch, but PR
#366's auto-merge fired on that branch's EARLIER tip, so the squash landed without it — the
record never reached `main` (verified by positive read of `45500a7`'s file list). It is
re-landed here, on the train it belongs to, byte-faithful to the original with only the
post-record ruling note and this provenance note added. The build lane executed the fix
round from the synthesis alone; the re-verification rung was ordered to sweep this original
against the fixes for anything the synthesis compressed away.
