# Wave 2 · Lane 08 — fix round (single fix worker)

- **Branch**: `riders/w2-lane08`, worktree `C:\Users\zhant\Desktop\clara-wt\658`
- **Base**: `23cfad947b5598214168ba9c43d391b4e16aa745` (every diff below is `<base>..HEAD`)
- **Head before this round**: `04f717324` · **head after**: `f8770aa1a`
- **Database**: `127.0.0.1:55748/clara_l08`, 232 ledger rows, head `0264_activity_kind_ladder`
- **Tickets**: #840, #843, #861 · **Reviews answered**: `wave2-lane08-codereview-spec.json`,
  `wave2-lane08-codereview-standards.json`, `wave2-lane08-review-adversarial.json`

## Commits added by this round

| commit | what |
|---|---|
| `caebbcda4` | `fix(db): #843 the capacity act appends before it takes the admission lock` (ADV-L08-1) |
| `85fc759d7` | `fix(db): #843 0263's tail pins the sentence each new type is registered with` (ADV-L08-2) |
| `f8770aa1a` | `docs: #840/#861 why the two activity-door recuts landed in two migrations` (L08-SPEC-02) |

Working tree clean; nothing pushed, no PR, no GitHub write, no other worktree touched. The only
file written outside the worktree is this report.

## Finding by finding

### ADV-L08-1 — lock order on `clara.set_admission_capacity` · **FIXED**

**Reproduced first**, with three real connections on `clara_l08`, every write inside a transaction
that was rolled back (probe `l08-lockrepro.mjs`, session scratchpad; the target database and port
are re-asserted by `current_database()` / `inet_server_port()` in every probe this round, after the
#861 cross-lane incident):

- S1 held the operator firm's `clara.firm_event_seq` row — exactly what a peer operator act
  (`reject_firm_registration`, `approve_firm_registration`, `resolve_stripe_event_problem`) holds
  for the rest of its transaction, since `clara._append_event` opens with
  `insert into clara.firm_event_seq … on conflict (firm_id) do update`.
- S2 called `clara.set_admission_capacity` as the operator firm's owner: it did **not** settle
  within 1.5 s and `pg_stat_activity` showed it on a `Lock` / `transactionid` wait.
- S3's `pg_try_advisory_xact_lock(hashtextextended('clara.admission-capacity', 0))` returned
  **false** — i.e. `clara.claim_paid_firm`, a paid applicant claiming their firm, would queue
  behind an unrelated support act. That is what `claim_paid_firm`'s own comment refuses ("no
  business queueing behind the estate's admission lock").
- Releasing S1 unblocked S2; the fixture left no operator firm behind (`count(*) where is_operator`
  back to 0).

**Fix, in one vertical slice.** Red first: the new tail assertion (§T 4b) was written and the
edited file run against the live pre-fix body — it refused with
`#843 tail: the append (at 3686) is NOT before the advisory lock (at 2164) …` (CLR10). Then the
minimal body change: 0263 §2 moves the single `clara._append_event` call **above**
`pg_advisory_xact_lock`, still inside the `_reserve_op`/`_finish_op` reservation (so os.21's replay
proof is untouched and §T's existing "between reserve and finish" assertion still holds). The file
then applied clean and §T's part-1 notice now states the new property.

**Re-measured after the fix**: same three sessions, same order — S2 still waits for the peer's seq
row (that peer's own serialisation, unavoidable and correct), but S3 now **takes** the
admission-capacity lock, so a firm claim no longer queues behind an operator act.

**No cycle is introduced by taking the seq row first**, measured rather than assumed: the only two
bodies in the estate that contain the advisory key are `clara.set_admission_capacity` and
`clara.claim_paid_firm` (catalog probe over `pg_proc.prosrc`), and `claim_paid_firm` takes the lock
and then appends `firm.created` / `firm_registration.paid` under `v_firm` — the firm it is creating
in the same transaction — never under the operator firm. Nothing anywhere takes the admission lock
and then waits for the operator firm's sequence row.

The header gains a dedicated "LOCK ORDER" section, the body carries the reason at both statements,
and `comment on function clara.set_admission_capacity` now states it too — the reviewer's second
option ("state the coupling") is delivered *as well as* the first, because the next reader of
`claim_paid_firm`'s "no business queueing" comment is exactly who needs it.

### ADV-L08-2 — `on conflict (name) do nothing` and the unasserted description · **FIXED**

0263 §T now pins the **exact description text** of both new event types beside the name, the
`client_scoped` flag and the taxonomy routing. The description is the operator-visible sentence:
`clara.firm_timeline_visible` projects `clara.event_types.description` as `event_description` and
both activity doors return it, so a colliding registration kept by `on conflict do nothing` would
ship a stranger's sentence onto the operator's own timeline. It now refuses the migration.

**Vacuity control (the subject broken, not the assertion).** `clara.event_types` is append-only —
the first attempt to rewrite a description was refused by `t_event_types_append_only`, which is
itself why a collision is permanent. So inside a rolled-back transaction the guard was suspended,
each description replaced in turn by `Someone else's sentence, from a colliding registration`, and
0263's real §T block run: both refused with CLR10 naming the foreign sentence. After rollback both
rows were re-read byte for byte identical and both triggers were back to `tgenabled = 'O'`.

### How the edited migration was re-applied (and why not by `CLARA_MIGRATION_REDO` alone)

The work order says to re-apply an edited unmerged migration with the #957 redo path. That path
**refused**, verbatim:

```
redo refused: 0263_operator_support_timeline_events is not the highest applied version
(0264_activity_kind_ladder is) — redoing anything below the frontier would silently
invalidate whatever was applied on top of it.
```

The guard protects against invalidating what was applied on top. Here the two files are disjoint:
0263 recuts `clara.set_admission_capacity` / `clara.resolve_stripe_event_problem` and registers two
event types; 0264 recuts `clara.list_activity` / `clara.get_activity_event`. So the frontier was
lowered by exactly one ledger row and then **rebuilt by the runner itself** (`ledger-redo.mjs`):

1. `delete from clara.schema_migrations where version = '0264_activity_kind_ladder'` — the one hand
   step, recorded here;
2. `migrate({ redo: '0263_operator_support_timeline_events' })` — the supported redo, now at the
   frontier: prestate notice on the redo path, both tail notices, `redone … new checksum
   35e1cb9e1d6779823af9eaf11d87bd2ed239970fdfbfb94927808737c1b2f776`;
3. `migrate()` — the ordinary apply path re-lands 0264 (its §0.3/§0.4 admit an already-applied
   body), writing checksum `47eb464c75b99f3836456cb99fcc2152a6fe645d5d52c520c7d7271c4abde7c2` —
   **byte-identical to the row deleted in step 1**, which is the proof that nothing about 0264
   moved. Only its `applied_at` is new.
4. Ledger: 232 rows before, 232 after. A plain `migrate()` afterwards reports
   `{ applied: 0, total: 232 }` with no drift.

**This step is not optional, and the report of the first attempt is worth keeping**: before the
ledger was repaired, `legal-enforcement-mode.test.mjs` went **26/26 red** — not on its subject but
on `rig-helpers.mjs`'s `ensureReady()`, which calls `migrate()` and aborts on
`applied migration 0263… was MODIFIED after being applied (checksum drift)`. Any lane that edits an
unmerged migration must re-apply it *with its ledger row*, or every `ensureReady()` battery on that
rig turns red for a reason that has nothing to do with the change.

**Pins that moved** (for anyone holding the old values):

| thing | before | after |
|---|---|---|
| `0263…` ledger checksum | `9c32fb5779b62758c894bcd22cf9d7583ff054b51e82d4342b9674f20afe36ff` | `35e1cb9e1d6779823af9eaf11d87bd2ed239970fdfbfb94927808737c1b2f776` |
| `sha256(prosrc)` `clara.set_admission_capacity(integer,text,text)` | `a0cb5ac6a03830552f5cf4ed122244ae9b429b1cfb172404199265c4a6eaa49b` | `a5209aca8ce5830769a16eebb0c78a9df4a64b28fbe7208c90b2f56f220228c1` |

Unmoved and re-measured: `clara.resolve_stripe_event_problem` `46bb3d5a1efa389d8ac3ed54ca8782075934a3a40d80bd49fd351cc237500525`,
`clara.list_activity` `02a7f720a936dc434013047835e4cda1661c2576ff0dcbc86636d6a0cbf8f869`,
`clara.get_activity_event` `54dfe97c84d002cc07b6d88b9ca1d46c00f38a7b4200a1f3942d40c7e31911d0`,
0262 and 0264 ledger checksums. 0263's own §0.3 pre-image pin (`190d0fe8…`, 0186 §C's body) is
untouched, and so is 0234's non-regression pin on the same value — 0234 applies **before** 0263 on
a from-scratch chain, so the reordering cannot reach it.

**The web census does not key on these files**: `apps/web/tests/firm-scope-db-pins.corpus.ts` pins
content shas only for *reviewed dynamic-SQL barriers*, and 0262/0263/0264 have no entry (none of
them uses `execute`; the only `execute` tokens in 0263 are `grant execute on function`).
`firm-scope-db-pins.test.ts` re-run: **22 pass / 0 fail**.

### L08-SPEC-01 — the AC naming six tickets, traced · **RECORDED + the cells actually run**

The AC reads "the activity-feed cells owned by #625, #633, #639, #646, #647 and #650 still pass",
and the #861 report answered it against a different set of ticket numbers. Measured on this branch:
grep for those six numbers over `apps/web/components/firm/activity`, `apps/web/lib/firm/activity.ts`,
`apps/web/lib/firm/activity.test.ts`, `packages/db/tests/activity-feed.test.mjs`,
`apps/web/e2e/activity-mock.mjs` and `apps/web/e2e/activity-feed-walk.spec.ts` returns **nothing** —
the review is right that none of the six owns a cell *in* the feed's own files. What they do own is
65 test/spec files, of which these touch something this lane changed:

| ticket | cell that touches this lane's change | why | result |
|---|---|---|---|
| #625 | `packages/db/tests/firm-setup.test.mjs` (`p648.workspace.open …`) | calls `clara.list_activity` — the door 0262/0264 recut | **17 pass / 0 fail** (full 53-module gate chain) |
| #625, #633 | `apps/web/e2e/firm-navigation-walk.spec.ts` | imports `ACTIVITY_CLIENTS` from `apps/web/e2e/activity-mock.mjs`, a file this lane edited | **10 passed (42.9 s)** on the lane triple 3570/3571/3572 |
| #633, #639, #647 | `apps/web/lib/navigation/tree.test.ts`, `apps/web/components/app-shell/app-sidebar.test.tsx` | the `/activity` nav rung and its rank floor | in the **59 pass / 0 fail** unit group below |
| #650 | `apps/web/lib/work/client-work-pack.test.ts` | imports `businessDayStart`/`businessDayEnd` from `@/lib/firm/activity`, edited by #861 | same 59-pass group |
| #650 | `apps/web/e2e/home-board-walk.spec.ts` | Firm Home's "Recent activity" band, whose honest note #861 removed | **27 passed (1.3 m)** |
| all six | `apps/web/e2e/e2e-fixture-ownership.test.ts` | the shared fixture-id census the lane added ACTIVITY ids to | **44 pass / 0 fail** |

The 59-pass group: `lib/work/client-work-pack.test.ts`, `lib/navigation/tree.test.ts`,
`components/app-shell/app-sidebar.test.tsx`, `components/firm/firm-home/firm-home-board.test.tsx`
→ **59 pass / 0 fail / 0 skipped**.

**#639, #646 and #647 own no activity-feed cell on this branch** — their walks
(`fixed-asset-acquisition-walk`, `document-correction-walk`, `counterparty-identity-walk`) contain
no reference to the activity feed at all, and none of their unit cells imports `@/lib/firm/activity`
or reads `clara.list_activity`. Their event families (`asset.*`, `counterparty.*`, `client.*`,
`knowledge.*`) are nevertheless covered by `af.33`–`af.39b`, which drive one event of **every**
registered type through both doors. `apps/web/e2e/responsive-shell-walk.spec.ts` (#625) was not
re-run: its only activity reference is the nav link and the "Firm activity" option, both of which
`tree.test.ts` and `app-sidebar.test.tsx` pin at unit level, and it does not import the edited
`activity-mock.mjs` (the three specs that do are `activity-feed-walk`, `firm-navigation-walk`,
`home-board-walk` — all three now run this wave).

### L08-SPEC-02 — "one migration" vs two · **RECORDED in the repo, not only here**

#840's triage comment (2026-09-17) and #861's owner ruling (2026-09-18) each asked for one
migration if both recuts were in flight. Both were, in this lane. The wave-2 work-order addendum
overrides the line — "One implementer per ticket" and "a ticket that needs a schema or function
change writes EXACTLY ONE new migration file at the number reserved for it in your prompt" — and
neither ticket report said so. Commit `f8770aa1a` puts the supersession, and the reason the two
files compose (0264's prestate pins 0262's **output** shas, its body rebuilt from 0262's committed
text, migration numbers being a total order), into `packages/db/tests/README.md` where the next
reader of those two files will be. No code change; the outcome was already correct.

### L08-SPEC-03 — #861 touching #659's surface and cell · **VERIFIED, no change**

The review asks the integrator to confirm two things; both are now measured:

- **No other wave-2 lane is editing `apps/web/components/firm/firm-home/firm-recent-activity.tsx`
  or the `activityKindResidual` key.** Of the wave-2 ticket reports, only lane 07's
  `wave2-lane07-ticket998.md` names the file at all, and it names it as a *background comment* it
  deliberately left unchanged ("the Agent Brief itself names 'two comments in unrelated modules
  mention it as background' and does not list them for removal, so they were left as historical
  narrative, unchanged"). No other report mentions the en.json key.
- **The removal is complete and the #659 cell is honest**: `grep -rn activityKindResidual apps
  packages` returns nothing, and `firm-home-board.test.tsx` now carries the negative with the
  reason written above it ("the kind-ladder residual was fixed in the door (ticket 861); its
  disclosure must not outlive it"). It passes in the 59-pass group. Whether #659's owner is content
  for its board cell to assert the negative remains a human call — it is stated here so it is not
  discovered at merge.

### L08-SPEC-04 — the `document-kind-dialog.tsx` one-liner · **VERIFIED, left in place**

The defect is real at the base commit: `git show <base>:apps/web/components/documents/document-kind-dialog.tsx`
uses `DOCUMENT_KINDS` at line 95 while importing only `CLASSIFIABLE_DOCUMENT_KINDS` (line 35) — a
`next build` type error, so no browser walk in this lane could run without it. Commit `a60a3f40d`
deliberately carries no ticket number, so the integrator can drop it wherever it lands twice.
Measured across the wave: **33 of the wave-2 ticket reports name the file**, so this is a wave-wide
collision, not a lane-08 quirk. Nothing is owed on this branch; it must land exactly once.

### STD-1 — the duplicated `ready` / `gate` / `assertCohortPresent` triad · **STAYS, with reasons**

Re-measured rather than taken on trust: **81** files under `packages/db/tests` carry the memoised
`schema_migrations where version ~ <stem>` readiness probe, and **16** carry the third,
`assertCohortPresent` leg. `activity-feed.test.mjs` alone declares **five** frontiers, three of
which (`activityFeedReady`, `sweepAttributionReady`, `pWorkReady`, owned by #630/#728/#770) predate
this lane and are written in the same long form.

A local `makeFrontierGate(stem, …)` factory would therefore either (a) cover only this lane's two
frontiers, leaving two shapes inside one file, or (b) rewrite three other tickets' gates — scope
this lane does not own, in cells that are load-bearing for the `db-slice-frontiers` matrix, where a
subtle change (shared memoisation, a skip where a hard failure belongs) buys readability at the
price of turning a real failure into a silent skip. The standards reviewer's own verdict is the
same ("a pre-existing, package-wide convention … worth a small standalone refactor ticket against
the whole package, not a per-ticket fix"). Filed as a follow-up below. STD-2/3/4 were notes outside
this round's brief; STD-3's cross-lane incident is separately re-verified in the spec review
(lane 05's two bodies back at their pre-0262 pins).

## Gates

| gate | result |
|---|---|
| `packages/db` `operator-support.test.mjs` (full 53-module gate chain, `clara_l08`) | **22 pass / 0 fail / 0 skipped** |
| `packages/db` `activity-feed.test.mjs` (same chain) | **41 pass / 0 fail / 0 skipped** |
| `packages/db` `operation-census.test.mjs` | **10 pass / 0 fail** |
| `packages/db` `rig-isolation.test.mjs` (no reset flags) | **22 pass / 0 fail / 1 skipped** (T19 poison-role, needs `CLARA_RIG_ALLOW_RESET`, forbidden by RIG.md) |
| `packages/db` `legal-enforcement-mode.test.mjs` (`ensureReady` → `migrate`) | **26 pass / 0 fail** (26 red before the ledger repair — see above) |
| `packages/db` `checkout-convergence.test.mjs` (the other caller of `set_admission_capacity`) | **36 pass / 0 fail** |
| `packages/db` `firm-setup.test.mjs` (#625's `clara.list_activity` cell) | **17 pass / 0 fail** |
| `apps/web` unit: `client-work-pack` + `tree` + `app-sidebar` + `firm-home-board` | **59 pass / 0 fail** |
| `apps/web` `tests/firm-scope-db-pins.test.ts` (migration corpus census) | **22 pass / 0 fail** |
| `apps/web` `e2e/e2e-fixture-ownership.test.ts` | **44 pass / 0 fail** |
| e2e `firm-navigation-walk` on 3570/3571/3572 | **10 passed (42.9 s)** |
| e2e `home-board-walk` on 3570/3571/3572 | **27 passed (1.3 m)** |
| `pnpm typecheck` (worktree root) | exit 0 — apps/web Done, packages/runtime Done |
| `pnpm lint` (worktree root) | exit 0 |
| `migrate()` on `clara_l08` | `{ applied: 0, total: 232 }`, no drift |

`packages/runtime` is untouched by this round, so `check-frozen-workflows.mjs` and
`check-parts-parity.mjs` govern nothing this diff could move; no `apps/web` source file changed
either, so the whole-suite run is not owed by rule 8 (the web cells above were run for the
traceability this round owes, not because a source file moved).

## Docs updated

- `packages/db/tests/README.md`, `#843` section: the lock-order paragraph (what was measured, what
  moved, why `resolve_stripe_event_problem` keeps its old placement) and the description-pin
  paragraph with its control.
- `packages/db/tests/README.md`, same section: why #840's and #861's recuts landed in two
  migrations and how they compose.
- `packages/db/migrations/0263_…sql`: a new header section "LOCK ORDER", the reason restated at
  both statements in §2, and the door's own `comment on function`.
- `CONTEXT.md` was **not** touched: this round introduces no new vocabulary.

## Follow-ups worth filing

1. **A shared frontier-gate helper for `packages/db/tests`** (STD-1): 81 files repeat the readiness
   probe and 16 repeat the full triad. One `makeFrontierGate(stem, ticket, migration, envVar)` in a
   shared fixtures module, migrated file by file, with the `db-slice-frontiers` matrix as the
   acceptance. Not a per-ticket fix.
2. **`redo` below the frontier** (#957 follow-up): a lane that stacks three migrations cannot use
   the supported path for anything but the top one, and the workaround is the ledger dance recorded
   above. A `redo` that accepts a *set* of versions (re-applying everything above the target in
   order, which is exactly what steps 2–3 did by hand) would remove the hand step. Worth one small
   ticket against `packages/db/scripts/migrate.mjs`.
3. **`operator-support.test.mjs`'s `EXPECTED_CELLS`** still counts the four #776 name cells
   unconditionally (STD-4, pre-existing, already self-flagged by the #843 report).
4. **The row / Sheet disagreement about a successor on a client-less row** (L08-SPEC-06 =
   ADV-L08-5): dead code today because `clara.accounting_work.client_id` is NOT NULL and
   `work.cancelled` is `client_scoped`. Left alone deliberately this round — it is a note, not a
   finding against this branch, and touching it would widen the diff.
5. **Operator handover** (ADV-L08-3): the support acts are fenced by firm identity, not by operator
   status. One sentence in `CONTEXT.md`'s "Operator support act" term would make it a known
   question rather than a surprise. Not this round's brief.

## Unverified / left standing

- **A from-scratch 0001→0264 chain was not run**: RIG.md forbids a second from-scratch chain on a
  reused cluster and gives the integrator a disposable one. The edited 0263 was exercised in full
  on both of its paths on this rig — the redo path (prestate notice `Re-apply over this file's own
  effects (redo #957) — set_admission_capacity already appends: t`) and, before the commit, a
  rolled-back dry run — but its **pre-image** path (a database where the two doors still carry
  0186 §C's and 0205 §1's bodies) is only reachable on a fresh chain, exactly as it was before this
  round.
- The three findings this round did not own (L08-SPEC-05/06/07, STD-2/3/4, ADV-L08-3/4/5/6) are
  unchanged on the branch; where they overlap something I measured, it is recorded above.
- `applied_at` for `0264_activity_kind_ladder` on `clara_l08` is now this round's timestamp rather
  than the original apply's. The checksum is byte-identical; nothing reads `applied_at`.
