# #658 — fix round 1

Branch `impl/658-knowledge-retrieval` · worktree `C:\Users\zhant\Desktop\clara-wt\658` · rig PG 55708 / `clara_658`.
Round opened at **`33b99b83`**; three new commits.

```
141103cb fix(web): one fact, one read — the drift reader coalesces the Work detail's duplicate calls
bd09e79b fix(runtime): the relay stops claiming a core-only failure the atomic door cannot produce
a6553036 fix(db): the drift scan applies the read's own shadow, and tiers / as_of / a replay stop being unwalled
```

Verdicts in: spec **accept** (1 finding), standards **accept** (1), adversarial **fix_then_accept** (8).
Ten findings, and A1 = F1 = S1 (three lenses on one defect), so **eight distinct defects**.
**Applied: 8. Deliberately left: 0. Ratification requested: 1** (an enhancement the fixes surface, not
a finding).

`0230_knowledge_retrieval.sql` is **not merged**, so it is edited rather than superseded (RIG.md's
append-only rule binds merged migrations). Editing it drifts the ledger checksum, so the rig was
brought to the new file by dropping 0230's own nine objects and its `schema_migrations` row and
re-running `pnpm db:migrate`: **`applied 0230_knowledge_retrieval · 220 total`**, prestate notice
`clean`, tail notice `OK`, `clara%` roles still **18** (0154's cluster pin untouched). No
from-scratch chain, no reset flags.

---

## Finding → what I did → evidence

### A1 / F1 / S1 — `core_unreadable` was a dead contract (major + 2 minors) · **APPLIED**

`retrieveKnowledge` branched on `answer.core_readable !== false` and minted a sixth reason for D16's
required read. `clara.retrieve_knowledge` never emits that key: it decides all three tiers in ONE CTE
chain in ONE statement and catches nothing, so the branch was unreachable from the real door and the
only cell that touched it hand-built the field against a stub.

I took the reviewers' option **(b)** — remove the dead contract and state the truth — rather than
**(a)** (teach the door to signal a core-only failure). The reason is the brief: D16 is satisfied
either way (`F1`: "the atomic door already yields the D16-correct outcome through the ordinary
failure paths"), so (b) is the conservative reading, while (a) would mint a NEW durable envelope
field and a new per-tier failure semantics the brief does not specify — WORK-ORDER rule 6. (a) is
filed below as **ratification requested**, not silently dropped.

- `packages/runtime/lib/knowledge-retrieval.mjs` — the branch, `core_ok` on both the ok-result and
  the `unavailable()` shape, and `faceStatusOf`'s unreachable `core_ok === false` arm are gone; the
  header now states the atomicity and says a caller must not be written as though a core-only
  failure had its own signal.
- `packages/db/migrations/0230_knowledge_retrieval.sql` §A header — the same statement in the
  **durable** place, with the instruction that a later revision adds the field here, not in the relay.
- **kr.07 re-cut**: it now proves what is true (a governed refusal → `denied`; a transport failure →
  `unknown`; a half-shaped envelope → `malformed`) and asserts the dead contract is absent from the
  module source. **New db cell `p658.retrieve.envelope_is_atomic`** pins the envelope's exact key set
  and reads `pg_proc.prosrc` to assert there is no `exception when` arm and no `core_readable`.
- Evidence: `packages/runtime` `knowledge-retrieval.test.mjs` **19/19**; db battery **28/28**;
  `grep -rn "core_readable|core_unreadable|core_ok"` over `packages/` and `apps/` now returns only the
  two cells that assert the absence and the comment explaining it.

### A2 — the drift scan ignored the shadow the read applied (major) · **APPLIED**

`clara._work_knowledge_drift_core`'s moved-key scan applied neither the per-applicability shadow nor
any state filter, while `retrieve_knowledge` (:361) and the seventh door (:861, :881) both apply it.
A firm default shadowed for this client — a record the run provably did not read — intersected the
read-set on the key NAME and produced `relevant: true`.

- Fix: the `scope_kind='firm'` arm carries the same `not exists` shadow, copied from the two shipped
  reads. **Cell `p658.drift.shadow`** was written first and went red on exactly the reviewer's claim
  (`a key whose only mover is a record SHADOWED for this client must not be named as moved`); it now
  passes, and it asserts BOTH directions — a client with no exception still gets the firm default's
  movement as its own news — so the fix cannot over-correct.
- **I did not take one half of the proposed fix**: the reviewer also suggested `and r.state='live'`.
  That would silence a WITHDRAWAL, which is a revision at a higher version and is the single most
  relevant thing that can happen to a run's basis — and the same report's own `held` list #4 records
  the withdrawal case as working and required. Left out deliberately, with the reason written into
  the migration beside the scan. **Re-measured by me on clara_658 AFTER the fix**, so the
  claim in that comment is mine and not a transcription: a client record is captured and read, then
  withdrawn; the revisions are `[{state:superseded, superseded_at not null, v1}, {state:withdrawn,
  superseded_at NULL, v2}]`, `retrieve_knowledge` returns 0 rows for the key, and `work_knowledge_drift_for`
  answers `{drifted:true, relevant:true, moved:["sst_regime"]}` — which a `state='live'` filter would
  have turned into silence.
- The watermark is deliberately left unshadowed too (it is the shipped `0192:1333-1335` expression
  that `retrieve_knowledge` itself records; a shadowed watermark compared against an unshadowed
  observation would compare two different numbers). So `drifted` keeps meaning "something in your
  scope moved" and `relevant` means "and it was yours" — which is the existing semantic for an
  unrelated key.

### A3 — `tiers` was an unvalidated jsonb on an append-only relation (major) · **APPLIED**

- `clara.record_work_knowledge_read` now rejects any key outside `{core, requested, remainder}` and
  any value that is not a non-negative integer (CLR10, `constraint: "tiers_shape"`), and the COLUMN
  CHECK enforces the same, so the wall is not only the writer's diagnosis. §Z gained a rolled-back
  probe per bad shape (`{"smuggled":"payload"}`, a string count, `-1`, `1.5`, `null`), in the shape
  §Z already used for the `unavailable` status probe.
- Cell **`p658.reads.tiers_shape`** — four good shapes admitted, six bad ones refused, the constraint
  definition read back from `pg_constraint`, and a direct insert as `clara_fn_owner` (below the
  writer) refused `23514`. Red first on the reviewer's own payload.

### A4 — the GIN index could never be used (minor) · **APPLIED**

- Both predicates in the seventh door are now `k.keys @> array[rec.knowledge_key]`. Identical in
  meaning for a scalar on a non-null array; only this form is matchable to `ix_work_knowledge_reads_keys`.
- **`p658.record_reads.bounded`** extended: it asserts the scalar-`any` form is absent from the
  catalogued body, that the containment form appears exactly twice, that the containment query plans
  onto `ix_work_knowledge_reads_keys` (`explain (format json)` with `enable_seqscan` off, inside a
  rolled-forward `begin … commit`), and that the rewrite is row-for-row equivalent on the door's own
  data. Measured plan before the fix: `Index Scan using ix_work_knowledge_reads_firm … Filter: (… =
  ANY (keys))`.

### A5 — a replay carrying different facts was answered with a silent `ok` (minor) · **APPLIED**

- New column `payload_digest` (`^[0-9a-f]{64}$`), hashed over the nine facts a row records via
  normalising `jsonb`. The receipt now carries `replayed`, `payload_digest`, `stored_digest` and
  `payload_match`.
- **It reports rather than refuses**, which departs from `clara._reserve_op`'s CLR10 on the same
  mismatch, and the reason is written into the migration: an op-key governs a WRITE, this governs a
  RECORD OF A READ, and a diagnostic write that could settle a Work would be worse than the
  divergence it reports. Replay-idempotence is unchanged — the WDK re-execution still lands on the
  original row.
- Cells: **`p658.reads.replay_is_named`** (db, red first) and **`kr.13b`** (runtime relay).
  `packages/runtime/tests/work-knowledge-e2e.mjs` still exits 0: the SIGKILL replay lands on its own id.

### A6 — two components read the same fact on one page (minor) · **APPLIED, by a different route**

The reviewer's remedy — lift the read to `work-detail.tsx` and pass it down — **cannot work**, and
this is the one place I diverge from a finding's prescription on a matter of fact rather than
judgement: `work-detail.tsx` mounts `WorkKnowledgeBlock` (:641) and `WorkQuestionPanel` (:1251), but
the same form is also mounted by `components/parts/WorkCards.tsx:320` (the Clara chat lane) and
`components/firm/work-question-affordance.tsx:174` (Needs-you), where no Sources block exists and
there is no owner to drill from. The finding's *concern* is right and is fixed.

- `apps/web/lib/work/knowledge.ts` holds an **in-flight coalescer** keyed by `(work id, RESOLVED
  session accessor)` — resolved the way `lib/doors.ts:120` resolves it, so the page's two consumers
  share the blessed singleton, share one request and cannot disagree. It fixes all three mount sites
  at once, and the `1 + N` calls of a Work with several pending question cards collapse to one.
- It is a coalescer, **not a cache**: the entry lives only while the request is in flight.
- `apps/web/lib/work/knowledge.test.ts` (7 cells, registered in `test/manifest.txt`): wk.01 and wk.06
  are RED against the pre-fix reader (measured by stashing the lib change and re-running: `5 pass, 2
  fail`); the four "must NOT coalesce" cells — a settled request, a different Work, a caller-owned
  `AbortSignal`, a different accessor — are green on both sides, so the fix cannot over-correct.

### A7 — `p_as_of` was unbounded (note) · **APPLIED (the cheap wall, not the decade bound)**

`clara.retrieve_knowledge` and `clara.record_work_knowledge_read` both refuse a non-finite date
(CLR10). I did **not** take the suggested "within a decade of `now()`" wall: a firm may legitimately
work a very old period, and refusing that would be a rule nobody asked for — the reason is in the
migration. Cell **`p658.retrieve.as_of_is_a_date`**: `infinity`/`-infinity` refused on both doors,
`1900-01-01` still readable and correctly `in_effect:false`.

### A8 — the writer's key grammar is stricter than the catalog's (note) · **APPLIED as documentation**

No code owed, and none written. The grammar, the catalog's weaker `btrim(...) <> ''`, the
retrievable-but-unrecordable failure mode and the "widening it is a decision, not a bug fix" line are
now in 0230's §D header, where the next key-minting migration will look, and in `packages/db/README.md`.

---

## Deliberately left

None. Every finding is applied. Two *parts* of two prescriptions were deliberately not taken, and
both are argued above rather than dropped: **A2's `state='live'` filter** (it would silence a
withdrawal, which the same review's `held` list requires to keep working) and **A7's decade bound**
(it would refuse legitimate old-period work).

## Ratification requested

1. **Should `clara.retrieve_knowledge` be taught to signal a core-only failure?** — A1's option (a).
   Today the door is atomic and D16's terminal fires on any unavailable answer, which is correct and
   is now stated in both places. Option (a) would assemble the core tier (including the pinned legacy
   union) in its own `begin … exception` arm and return `core_readable boolean`, which would make
   D16's layering real, give `partial` its third case, and let `kr.07` be a db cell against a real
   door with fault injection. It is **out of scope for this brief**: it mints a new durable envelope
   field and new per-tier failure semantics the brief does not specify, and a blanket `when others`
   in a read door is a posture decision. Cost if deferred: none today; the v5 integrator reads an
   honest contract either way. Cost if adopted later: one migration and two cells, both named in the
   code.

---

## Re-run after the fixes (all local; hosted evidence pending)

| Command | Result |
|---|---|
| `pnpm typecheck` (root) | **exit 0** at `141103cb` (apps/web + packages/runtime) |
| `pnpm lint` (root) | **exit 0** at `141103cb` — RED once mid-round on `prefer-const` in the new coalescer (`lib/work/knowledge.ts:105`); the request-identity token replaced the reassignable binding and the fix is folded into that commit |
| db battery, 41 gate flags, `clara_658` | `knowledge-retrieval.test.mjs` **28/28 pass, 0 skip** (23 existing + 5 new) |
| db siblings, one run | `knowledge-retrieval` + `knowledge-records` + `knowledge-firm-defaults` + `knowledge-legacy-readers-converge` + `operation-census` + `rig-isolation` = **115 tests · 114 pass · 1 skip · 0 fail** (the skip is the destructive T19 cell, gated on the unset reset flag; **T10b green**) |
| `pnpm db:migrate` after the 0230 edit | `1 new migration(s) applied · 220 total`; prestate `clean`, tail `OK`; `clara%` roles **18** |
| runtime units | `knowledge-retrieval` **19/19** (was 18, +`kr.13b`), `work-trace-bounds` **9/9**, `knowledge-lib` **16/16**, `clara-work-v4` **25/25** → **69/69** |
| World leg `work-knowledge-e2e.mjs` | **exit 0** — the SIGKILL replay still lands on its own id |
| `check-frozen-workflows.mjs` | OK — 296 frozen files, 53 `"use workflow"` modules |
| `check-parts-parity.mjs` | OK — reader ⊇ emittable, no kind added |
| new web unit file | `lib/work/knowledge.test.ts` **7/7** |
| whole `apps/web` suite | re-run at `141103cb`: **4171 tests · 4169 pass · 0 fail · 2 skipped**, exit 0 — the `use-clara-thread-stop` flake the first report carried did NOT recur |
| Playwright `knowledge` triple 3370/3371/3372 | re-run at `141103cb`: **40 passed · 1 failed (2.3m)** of 41. The one failure is `knowledge-firm-walk.spec.ts:198` with `Error: locator.fill: Target crashed` — a BROWSER crash under host contention, not an assertion, and in a spec this round did not touch. **Re-run alone: 14/14 passed (57.6s), exit 0.** Both runs reported. |

## Sources of truth updated

`packages/db/README.md` (the drift shadow and its two deliberate non-symmetries; the read-set's four
walls; the replay receipt), `packages/db/tests/README.md` (28 cells; the new cells named per family),
`packages/runtime/README.md` (five reasons not six, with D16's terminal restated; the replay relay;
19 cells), `apps/web/README.md` (the coalescer, why it is not a prop and not a cache).
`CONTEXT.md` is unchanged — no new vocabulary. No `docs/PRD.md`, no `docs/ARCHITECTURE.md`.

## Held from the review, unchanged

Every item in the adversarial report's `held` list still holds at `141103cb` and is re-measured by the
28-cell battery: #783's negative grant, the seventh door's firm-scope shadow, the byte-for-byte
shadow parity with the shipped reads, D16's withdrawal case, concurrency on the sole writer,
append-only, the eight non-regression pins, the 7-key core, and the drift banner's non-destruction of
a typed answer.
