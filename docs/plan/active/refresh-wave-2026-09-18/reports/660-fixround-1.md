# #660 — fix round 1

**Branch** `impl/660-dashboard-cash-profit` · **worktree** `C:\Users\zhant\Desktop\clara-wt\660` ·
**from** `6bfb0d82` · **HEAD** `e69b0e68`

```
e69b0e68 test(web): #660 re-register 0232's reviewed dynamic-SQL barrier at its new sha
35bd7559 docs: #660 the three READMEs record what the fix round changed
bc1db717 fix(web): #660 chart.tsx uses the repo's own cn, not a second merge engine
59381439 test(web): #660 the two tile cells the brief names, written rather than excused
4da91df2 fix(web): #660 the money band follows the door, in four places it did not
f040238f fix(db): #660 eight review findings in 0232, each red first
```

Verdicts in: spec **accept** (2) · standards **fix_then_accept** (4) · adversarial
**fix_then_accept** (12). Eighteen raw findings, **fourteen distinct** (four are the same issue
raised by two lenses): **twelve applied, two deliberately left** — and four items put up for
ratification. The branch is now 42 files, +8,945 / −4 against `origin/main`;
`components/ui/card.tsx` and `scripts/protected-components.json` are still absent from that diff
(card.tsx sha256 `d8113cbf…`, re-measured). Every claim below is LOCAL; nothing was released;
hosted evidence pending.

## How the door was re-opened

0232 is unmerged, so it was EDITED rather than succeeded. Each iteration dropped only this file's
own objects on my own rig (three doors, the trigger function, the two relations, its event-type and
taxonomy row, its `schema_migrations` row) and re-ran `pnpm db:migrate`, which re-executed the
prestate — five measured pins re-checked, the overload wall re-checked — and the tail. No reset
flag was ever set, no other migration re-ran, and the pins are the same five shas the file was
written against.

## Finding by finding

| # | Lens | What I did | Evidence |
|---|---|---|---|
| **A1 / M1** *blocker* — the elapsed-day cap applied to a complete month | adversarial + standards | **Applied.** `v_prev_stop` branches: `v_as_of >= v_month_end` → the prior month IN FULL; otherwise the elapsed stretch, still capped. `period.ts:priorInterval` mirrors it. | `p660.pack.historic_comparison_full_prior_month` — **red first** (`'2026-01-28'` vs `'2026-01-31'`), now green; it also asserts the response cannot contradict itself (`series[Jan].profit_cents == profit.comparison.value_cents`). `period.test.ts` "a COMPLETE month compares against the WHOLE prior month" — red first, now green. `mtd_comparison_capped` still green (both rules agree on 31 March). |
| **A2** *blocker* — the cash comparison fabricated RM 0.00 for a month-end before the floor | adversarial | **Applied,** and generalised to all four groups: the cash comparison is gated on `v_prev_known` (`v_floor is null or v_prev_end >= v_floor`), the flows on `v_pl_prev_known` (`v_prev_stop >= v_floor`). Amounts null, `available:false`, `reason:'pre_coverage'`. | `p660.pack.pre_coverage_point` extension — **red first** (`0 !== null`), now green. Web: `financial-pack.test.ts` "AN UNAVAILABLE COMPARISON IS NOT A ZERO" (red first) and `client-cash-summary.test.tsx` "A COMPARISON THE DOOR WITHHELD IS SAID, NOT SKIPPED". |
| **A3** *blocker* — `profit_composition` at top level, parser reading `profit.composition` | adversarial | **Applied.** The composition moved INTO the profit group (which is also what brief §3 item 8 spells: `profit.composition[]`), the top-level key is gone, and the e2e mock's invented `profit_composition: []` with it. | `p660.pack.composition_bounded` extension — **red first** (`Cannot read properties of undefined`), now green, and it asserts the wire carries no second spelling. `client-financial-charts.test.tsx` "THE DRILLDOWN RENDERS FROM A REAL DOOR PAYLOAD" hydrates the door's own JSON shape through `hydrateClientFinancialPack`; **proved load-bearing** by re-shaping the payload to the old top-level spelling and watching it fail ("the drilldown row never reached the screen"). |
| **A4** *major* — the 50-account cap disclosed nothing | adversarial | **Applied.** Each composition carries `composition_total` + `composition_truncated` (a `count(*) over ()` inside the capped subquery, so no second pass), hydrated as `compositionTotal`/`compositionTruncated`, rendered as "Showing 50 of 61 accounts, largest first." | `p660.pack.composition_account_cap_disclosed` — 51 expense accounts in one entry; **red first**, now green. `financial-pack.test.ts` "THE ACCOUNT LEVEL CARRIES ITS OWN CAP". Walk `p660.money.disclosures`. |
| **A5** *major* — `cash_set_version_changed_in_series` on a client whose set never changed | adversarial | **Applied.** The reason now depends on whether a second revision exists: >1 → `cash_set_version_changed_in_series`; exactly one → `cash_set_published_after_books_start` (coverage stays `partial`, per the brief). Per-point reasons follow the same rule; the web's closed lookup gains the sentence. | `p660.pack.cash_set_published_after_books_start` — publish on a bookless client, then backdate two months; **red first** ("one revision has never changed"), now green. `p660.pack.cash_set_version_pinned + cash_set_version_changed_in_series` (two real versions) still green. `client-cash-summary.test.tsx` asserts the two sentences are not swapped. |
| **A6** *major* — a superseded read cleared the current read's busy flags | adversarial | **Applied.** `finally` clears `loading`/`refreshing` only when `epoch === epochRef.current`. | `use-financial-pack.test.ts` "A SUPERSEDED READ DOES NOT CLEAR THE NEW READ'S SKELETON" — **red first** ("a superseded read cleared the skeleton over an EMPTY envelope"), now green; two reads genuinely overlap in it. |
| **A7** *major* — the measurement justified one arm, not the read | adversarial | **Applied (optimised + re-measured).** The cash composition was six correlated subqueries per member account; it is now ONE scan per account with three filtered aggregates. **Whole door, same corpus, same rig:** 36.4–40.4 ms / 28,886 shared hits → **18.9–21.7 ms / 12,134**, payload byte-identical (14,558 bytes). One `trial_balance_as_of` on the same client is 3.4–3.8 ms, so the whole pack is ~5× one call, not ~11×. **Named residual:** nothing renders `cash.composition` yet (the brief puts it on the wire; #669/#670 are its consumers). | `explain (analyze, buffers)` through a viewer persona on a 160-entry / 320-line / 19-account client, `clara_660`; recorded in `packages/db/README.md`. Battery 34/34 after the collapse — `composition_bounded`'s opening + movement = closing still holds the numbers. |
| **A8 / N1** *minor* — a second class-merge engine, on the only caret in apps/web | adversarial + standards | **Applied.** `chart.tsx` imports `cn` from `@/lib/utils` like its 25 siblings; `cn@^0.3.0` dropped from `apps/web/package.json`; `pnpm install --lockfile-only` removed exactly that package (10-line lockfile diff, nothing else). Nothing else in the generated file was hand-edited, so D19.c's install still stands as it ran. | `git diff` on `package.json` / `chart.tsx` / `pnpm-lock.yaml`; typecheck + lint green; the whole web suite green. |
| **A9** *minor* — a raced supersede surfaced a raw 23505 | adversarial | **Applied.** The current published row is taken `for update`, and the residual unique violation maps to CLR11 `cash_set_version_raced` with its `detail.reason`. | Two-session probe on `clara_660`: session B **blocked** while A held the row, then — after A committed — `CLR11 | another version of this cash account set was published while this one was being written | detail: {"reason": "cash_set_version_raced"}`, with the final state correct (revision 1 superseded with `effective_to` 2026-12-31, revision 2 published from 2027-01-01 — A's date, not B's). The pre-fix raw 23505 is the reviewer's own measured R12. |
| **A10** *major* — the disclosure covered one of the six drawn months | adversarial | **Applied.** `unmarked_closing_entries_series` + `series_coverage_reason` run the identical detector over the six series months; the chart carries the sentence above itself, separate from the tile that speaks for the selected period. | `p660.pack.unmarked_history_series_disclosed` — an unmarked close in a drawn-but-unselected month; **red first** (`undefined !== 1`), now green, and a clean six months says nothing. Walk `p660.money.disclosures`. |
| **A11** *note* — members sealed against INSERT only | adversarial | **Applied.** `before insert or update or delete`; UPDATE and DELETE raise CLR08 `cash_set_members_sealed` with the attempted verb. | `p660.pack.cash_set_members_sealed` extension — **red first** ("expected SQLSTATE CLR08 but the call SUCCEEDED"), now green, and it re-reads `member_count` against the surviving rows. |
| **A12 / S2** *note* — two named test files missing, undisclosed | adversarial + standards | **Applied by writing them** rather than by disclosing the gap: `client-cash-summary.test.tsx` (6 cells) and `client-profit-summary.test.tsx` (4 cells), both registered in `test/manifest.txt` at their sorted positions. | `node --import ./test/bootstrap.mjs --import tsx --test …` → 6/6 and 4/4; `check-test-manifest` green inside `pnpm lint`. |
| **SP1 / S1** *minor* — `e2e-fixture-ownership.test.ts:361` was to be left untouched | spec + standards | **Deliberately left.** `LANE_DECLARATIONS` is `Record<filename, {unscopeable, debt}>`, so a second entry keyed `"home-board-mock.mjs"` is not legal TS: declaring three new verbs for that mock file and leaving its existing line byte-identical cannot both be true. The branch extends the existing array in place, #902's verb keeps its `debt` status, and the choice is disclosed. **Put up for ratification** (see below). | Both reviewers reached the same conclusion independently ("internally impossible to satisfy literally"); `e2e-fixture-ownership.test.ts` 18/18. |
| **SP2** *note* — "the guard must refuse the card.tsx overwrite" | spec | **Deliberately left, and flagged.** `apps/web/scripts/protected-components.json` allowlists `button.tsx` and `pagination.tsx` only, and `ui-add.mjs` refuses only on an allowlisted file — which is exactly what DECISIONS §6 / brief D19.c say, twice, as a measured correction of an earlier draft. The OUTCOME the ruling wants holds: `card.tsx` is absent from the diff and its sha256 is unchanged. I did not add `card.tsx` to the allowlist, because that file is shared with other lanes and the binding decisions record says the protection is procedural. | `git diff origin/main...HEAD -- apps/web/components/ui/card.tsx` is empty; the allowlist is unchanged on this branch. |

## Deliberately left

1. **SP1 / S1** — as above: the literal instruction is unsatisfiable given the census's one-entry-per-file shape, and the resolution is disclosed in the final report's Assumptions 6.
2. **SP2** — as above: the task text's paraphrase of the guard's behaviour is contradicted by DECISIONS §6's own measurement, and the outcome it protects is achieved procedurally.
3. **A7's second half** — `cash.composition` stays on the wire with no renderer. The brief names `cash.composition[]` in the envelope contract, so dropping it would narrow the brief; wiring a second drilldown table would widen it. It costs 3,826 bytes on this corpus and is now one scan per member account. Named as a residual for #669/#670 rather than silently kept.

## Ratification requested

1. **A new `coverage_reason` token: `cash_set_published_after_books_start`.** The brief names only `cash_set_version_changed_in_series` for a point outside the resolved version's window. Coverage is still `partial` in both cases; only the sentence is more precise. If the orchestrator prefers the single token, the fix collapses to one `case` arm.
2. **`comparison` gained `available` + `reason`.** The brief's shape is `{value_cents, delta_cents, delta_pct, sign_change, period}`. Nulls alone would have made the face render nothing, which reads as "this figure has no history"; the two keys let it say why. #669 inherits them.
3. **The pack gained `unmarked_closing_entries_series` + `series_coverage_reason`.** The brief's disclosure is period-scoped. The series rows' own shape is untouched (adding a per-row key would have contradicted the brief's `series[]` contract), so the disclosure is two top-level keys instead.
4. **The lockfile moved on this branch.** DECISIONS §3.1 gives the integrator one `pnpm install --lockfile-only`; dropping `cn` required one here. The diff is the removal of `cn@0.3.0` and nothing else, and it re-resolves cleanly.

Also for the record, not for ratification: **SP1's brief wording** ("leave `:361` alone") should be corrected for future tickets that share a mock file, and **SP2's task-text paraphrase** of the ui-add guard should be reconciled with DECISIONS §6.

## Re-runs (all local, on the #660 rig)

| Command | Result |
|---|---|
| `pnpm typecheck` (worktree root) | **green** (exit 0) |
| `pnpm lint` (worktree root) | **green** (exit 0) |
| `node --test --test-concurrency=1 tests/client-financial-pack.test.mjs` | **34 tests · 34 pass · 0 fail · 0 skipped** (was 30 cells; 7 of the 34 were red before this round) |
| Same battery + `operation-census` + `rig-isolation`, with the **41** gate flags from `packages/db/package.json` | **65 tests · 64 pass · 0 fail · 1 skipped** — the skip is `rig-isolation` **T19** (destructive, correctly skipped without `CLARA_RIG_ALLOW_RESET`). #866's T10b did not appear: this slice bootstraps no World. |
| `node scripts/run-tests.mjs` (apps/web, whole suite) | **4,195 tests · 4,193 pass · 0 fail · 2 skipped** on THIS run — ~~fully green~~ **corrected in fix round 2 (recheck NF-2): that was one lucky run, not a property of the branch.** `use-clara-thread-stop.test.ts` ("a stop the door says had ALREADY FINISHED does not re-attach") is a **known, pre-existing, non-deterministic flake**: the recheck's independent re-run at the same HEAD got 4,192 / 1 fail, and 1 of 3 isolated re-runs of that one file failed. It is not a #660 regression and #660 does not own it — `git diff origin/main...HEAD` is empty for both `use-clara-thread-stop.ts` and its test. The run BEFORE the sha re-registration was 4,195 / 4,191 / 2 fail, and both fails were that pin. |
| `tests/firm-scope-db-pins.test.ts` | **22/22** after re-registering 0232's file sha (the two reds the whole-suite run found were exactly that pin, by design) |
| `sql-oracle` / `parity-holes` / `firm-scope-surfaces` / `firm-scope-fourth-entrance` / `e2e-fixture-ownership` | **25/25 · 7/7 · 35/35 · 21/21 · 18/18** |
| `pnpm --filter @clara/web e2e home-board-walk` (triple 3390/3391/3392) | **21 passed (54.8s)** — the 20 that existed plus `p660.money.disclosures`. |
| `node scripts/check-frozen-workflows.mjs` · `node packages/runtime/scripts/check-parts-parity.mjs` | **re-run, both OK** — 296 frozen files verified, 53 `use workflow` modules frozen+registered; reader ⊇ emittable with no new part kind. This round writes no runtime file at all, and the checks say so rather than the report claiming it. |

## What changed in `660-final.md`

The AC4 and AC5 rows, the test-count table, the measurement table (the whole-door number beside the
cash arm's), the "two defects" section, Assumption 5 and the follow-up list. The file now points at
this one for the fix round's own evidence.

---

# Fix round 2

**Branch** `impl/660-dashboard-cash-profit` · **worktree** `C:\Users\zhant\Desktop\clara-wt\660` ·
**rig** `127.0.0.1:55710 / clara_660` · **from** `e69b0e68` · **HEAD** `c14bd953`

```
c14bd953 test(web): #660 re-register 0232's reviewed dynamic-SQL barrier at its fix-round-2 sha
35c691c3 fix(db): #660 the race's loser is told it lost, not that its date predates the books
```

DECISIONS §6.2.2's two #660 rows, both done. Everything below is LOCAL; nothing was released;
hosted evidence pending.

## NF-1 — the loser of a concurrent publish was refused the wrong thing

**Finding (recheck-1, `new_findings[0]`).** A9's `select … for update` serialised the race but drew
the wrong conclusion from what the wait returned. Under READ COMMITTED the waiter's statement
snapshot is taken BEFORE it blocks; when the winner commits, EvalPlanQual re-checks the row the
waiter was queued on against its LATEST version — now `superseded` — so `state = 'published'`
fails and the row drops out, while the winner's brand new published row is invisible to that same
pre-block snapshot. `v_cur_id` therefore came back NULL and the loser fell into the first-version
branch, refused CLR10 `first_version_after_books_start` — a true sentence about a different
mistake, naming the loser's own date against a books-start date that had nothing to do with it.

**What I did.** `0232_client_financial_pack.sql:575-601`: a null from the locked select is no
longer treated as proof of absence. The door re-reads `clara.cash_account_set_versions` for this
client in a SEPARATE statement (this function is volatile, so that statement takes a fresh
snapshot and sees whatever the winner committed); any version row at all settles it — every
publish path in this file inserts a `published` row, so a client with rows and no visible current
one is a client whose current one was moved out from under this call, never a client publishing
its first. It is refused **CLR11 `cash_set_version_raced`**, the token the insert's
`unique_violation` arm already raises. The misleading comment above the `for update` ("then
re-reads the row … and sees what the first did with it") is corrected in place.

**Token spelling, stated rather than silently resolved.** DECISIONS §6.2.2 writes
`cash_set_version_race`; the shipped and already-ratified token (§6.2.1, fix round 1's A9) is
`cash_set_version_raced`, and the dialog renders the door's message verbatim rather than mapping
the token, so there is no message key to add. I kept **`cash_set_version_raced`** rather than mint
a second, near-identical token for the same event. Reversible in one `case` arm if the
orchestrator meant the other spelling.

**Evidence — red first, for the WHOLE cell.**

| Step | Command | Result |
|---|---|---|
| red, as first written | `node --test --test-name-pattern="publish_race_loser_code" tests/client-financial-pack.test.mjs` | **1 test · 0 pass · 1 fail** — `AssertionError … expected: 'first_version_after_books_start', actual: 'first_version_after_books_start', operator: 'notStrictEqual'` (exactly the recheck's measurement) |
| red again, for the FINAL cell | pre-fix body re-installed from `git show HEAD:…0232…` as `clara_fn_owner`, prosrc sha256 `6e169684fd63c7fa496db6b7578e81d94d4a0f04508ae32900b935b6c6d2c8f1`, then the same single-cell run | **1 · 0 pass · 1 fail**, same assertion — so the cell is red on the pre-fix body as a whole, not only on the assertion I happened to write first |
| restored | fixed body re-installed the same way | prosrc sha256 `b84c152869c4148339e67b0d26907ccec62564c182008ac3e25adf6feaf8e750` — **byte-identical to what the migration installed**, owner `clara_fn_owner`, ACL `clara_fn_owner=X/clara_fn_owner \| clara_authenticated=X/clara_fn_owner` unchanged |
| green | same single-cell run | **1 · 1 pass · 0 fail** |

**The cell.** `p660.set.publish_race_loser_code` (`packages/db/tests/client-financial-pack.test.mjs:889`)
— the first cell in this battery that needs TWO REAL BACKENDS, because a lock is only a lock when a
second transaction actually waits on it. Session A opens a transaction and mints revision 2
(`effective_from 2026-04-01`) without committing; session B opens its own and calls the door with
`2026-05-01`; B's block is **proved from `pg_blocking_pids` / `pg_stat_activity`**, never slept
through, and the wait event is asserted to be the row (`transactionid` / `tuple`). A commits; B must
come back **CLR11 `cash_set_version_raced`**, explicitly NOT `first_version_after_books_start` and
explicitly not a raw `23505`. Then the state is asserted whole: exactly two revisions, revision 1
`superseded` with `effective_to 2026-03-31`, revision 2 `published` from **the winner's** date, and
the read the client home draws resolves the winner's two-member set in April. The local
`twoSessions` / `asHumanSession` / `waitBlockedByOrThrow` helpers live in
`client-financial-pack-fixtures.mjs` and are copies of `binding-proposal-pr-1-helpers.mjs:22-67` /
`checkout-convergence-fixtures.mjs:364-384` — the house idiom for this helper is a local copy per
lane.

The other half of the branch is unchanged and still proved: `p660.pack.publish_first_version_covers_history`
(a genuine first version dated after the books' start is still refused
`first_version_after_books_start`) is green in the same run, so the re-read did not blunt the trap
it sits beside.

## The route taken to re-apply an already-applied migration

**Route (2), the #635 precedent — degenerate, because 0232 recuts nothing.** The task text offers
route (1) (a second from-scratch chain on a new database of my own cluster) and route (2) (restore
every pre-image body, drop my objects, re-migrate). **Route (1) was refused by its own stated
precondition**: `select count(*) from pg_roles where rolname like 'clara%'` on clara_660 returns
**18**, so 0154's cluster-wide role census would red on a second chain — the task text says STOP
and use route (2) in exactly that case.

Route (2) has nothing to restore here. `0232:17-19` states "THIS FILE RECUTS NOTHING. Five live
bodies are read-only dependencies and are pinned by sha256(prosrc) in the prestate and re-asserted
byte-identical in the tail", and I re-measured all five LIVE on clara_660 before touching anything
— each identical to the value the file pins:

| Body | Measured `sha256(prosrc)` on clara_660 |
|---|---|
| `clara.trial_balance_as_of(uuid,date)` | `51f18cba8b3d1fb4e225b83773803ea340b7b492a7647d50304589a86922c63c` |
| `clara._metric_selector_account_ids(uuid,jsonb)` | `c8f32cd986403f94c0943e147a1ffe207b7e770843b9b6fbb2b9765cec04b1e9` |
| `clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)` | `25f9274792b14c054f1633e4518f689084a8e6548d10e3079cec4e760fd28495` |
| `clara.finalize_close(uuid,text,text)` | `59ebaa4fe7ff49c90ff6f3d5c9a73d7c6b853b042368f0c20b8c2ce2c8173bf4` |
| `clara.reopen_fiscal_year(uuid,text,jsonb,text,text)` | `3c1c24ee1c69c84538fd8ce7254955ee01045a3027b4942c171090b7e4820fd5` |

So the re-open was: drop **exactly this file's own objects** — `cash_account_set_members`,
`cash_account_set_versions` (their indexes, policies and both triggers with them),
`_tf_cash_account_set_integrity()`, the three doors, its `trigger_taxonomy` row and its
`event_types` row (both relations are append-only by trigger, so those two deletes ran under
`set local session_replication_role = replica` inside the same root transaction, labelled) — and
its `clara.schema_migrations` row. One transaction, committed. Then `pnpm migrate` from
`packages/db` re-executed the EDITED file end to end:

```
[notice] #660 prestate: clean -- … all five read-only dependency bodies are at their pinned (measured) bodies.
[notice] #660 tail: OK -- three doors exist exactly once each at exactly their signatures … nothing was recut …
applied 0232_client_financial_pack · backend pid 224811
migrate: 1 new migration(s) applied · 220 total · target 127.0.0.1:55710/clara_660
```

**`CLARA_RIG_ALLOW_RESET` was never set**, no other migration re-ran, and no other worktree or
cluster was touched. The applied checksum moved `289fc682c1625b4273a82b01cbbb8d36e691f6b93e23ae7ad5cd7e33e3281e64`
→ `b0d0c56e60497de4b06d2dcf90dcca24be91032b58ddf6c804d01667abab15e8`, which is also the new pin in
`apps/web/tests/firm-scope-db-pins.corpus.ts` (the barrier re-read: the RLS loop is byte-unchanged
again; the file moved for static PL/pgSQL).

## NF-2 — the "fully green" sentence

**Finding.** The fix-round-1 re-runs table called the whole `apps/web` suite "fully green,
including `use-clara-thread-stop.test.ts`". The recheck could not reproduce it (4,192 pass / 1
fail at the same HEAD; 1 of 3 isolated re-runs of that file failed).

**What I did.** Corrected the row in place, above, rather than leaving the claim standing and
adding a footnote: it now names the cell, says the flake is **pre-existing and non-deterministic**
with the recheck's own counts, and states that #660 neither owns nor introduced it
(`git diff origin/main...HEAD` is empty for `use-clara-thread-stop.ts` and its test). The counts
from my own fix-round-1 run are kept as the counts of that run, not as a property of the branch.
Worth one flake ticket for the wave; not #660's to fix.

## Re-runs (all local, on the #660 rig, at `c14bd953`)

| Command | Result |
|---|---|
| `pnpm typecheck` (worktree root) | **green** (exit 0) — `apps/web` and `packages/runtime` both Done |
| `pnpm lint` (worktree root) | **green** (exit 0) — 4 workspace projects, incl. `check-test-manifest`, `check-message-keys`, `check-ui-add-guard.selftest`, the dispatch-model guard's 43 cases |
| `node --test --test-concurrency=1 tests/client-financial-pack.test.mjs` (focused) | **35 tests · 35 pass · 0 fail · 0 skipped** (34 + the new cell) |
| Same battery + `operation-census` + `rig-isolation`, with the **41** gate flags from `packages/db/package.json` | **66 tests · 65 pass · 0 fail · 1 skipped** — the skip is `rig-isolation` **T19** (destructive, correctly skipped without `CLARA_RIG_ALLOW_RESET`). #866's T10b did not appear: this slice bootstraps no World. |
| `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` (apps/web) | **22 tests · 22 pass · 0 fail** after re-pinning 0232 at `b0d0c56e` |

**Not re-run in this round, and therefore not claimed:** the whole `apps/web` unit suite, the e2e
`home-board-walk` triple, `check-frozen-workflows.mjs` and `check-parts-parity.mjs`. This round
writes no runtime module and no `apps/web` runtime file — the only web file it touches is the
db-pins corpus, whose own test is green above — but "unchanged therefore green" is an inference,
not a measurement, and it is labelled as one.

## Docs updated

- `packages/db/README.md` — the `publish_client_cash_account_set` entry gains the paragraph that
  says why the lock alone is not enough (EvalPlanQual), what the re-read does and which cell proves
  it.
- `packages/db/tests/README.md` — the #660 battery section records the fix-round-2 cell, why it
  needs two real backends, where its helpers were copied from and what it was red for.
