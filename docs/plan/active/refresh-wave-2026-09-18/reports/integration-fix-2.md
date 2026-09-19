# Integration fix round 2 — the money as-of is the book day (DECISIONS §6.4 row 1)

Worktree `C:\Users\zhant\Desktop\clara-wt\int`, branch `integration/wave-2026-09-18`, base
`origin/main` = `abcc5030`, head at the start of this round `887b4162` (the successor cut plus its
fix round). One ruling, one migration edit, one new cell, two roster reclassifications, and the
re-run of everything the ruling named.

**Scope.** DECISIONS §6.4 row 1 only, plus §6.4's fourth row (the two-build cutover leg that could
not be verified on a contaminated rig at the cut). Nothing else in the wave was touched: no other
migration, no frozen body, no PRD/ARCHITECTURE edit, no push, no PR.

---

## 1 · The ruling, and what it actually required

`integration-fix-1.md` §4.3 escalated two names out of the S5.25 census pass:
`clara.get_client_financial_pack` and `clara.propose_client_cash_accounts` each derive a MONEY
as-of from the session clock **by their own expression**, and DECISIONS §6.3's rule says such a name
is re-pointed at the house derivation. §6.3's own escape ("if that needs a migration edit STOP and
report") applied, because the re-point is an edit of `0232_client_financial_pack.sql`, already
applied on every rig the wave measured. Fix round 1 stopped and reported.

**§6.4 row 1 ruled it:** re-point both at the house book-day derivation, as an edit of 0232 applied
on a **fresh** cluster (recreate `rigint` with `mkrig.sh`, so 0154's cluster-wide `clara%` role
census is honest), re-run the whole chain 0001→0233 and re-prove the #660 battery, the four S5.25
census cells, `operation-census` and `rig-isolation`. `computed_at = now()` stays a sampling read.
The counter-argument (the authority samples `statement_timestamp()` per statement, so a call
straddling MYT midnight can report an as-of and a `computed_at` from two different days) was
weighed rather than missed: *"a money date must be the book day regardless."*

### 1.1 · Why the fix is not a one-line `clara._book_today()` call — measured, on the red chain

| measurement | command / source | result |
|---|---|---|
| the authority's ACL | `select proacl from pg_proc where proname='_book_today'` | `{clara_fn_owner=X/clara_fn_owner}` — PUBLIC revoked, no application role |
| can the human role call it? | `has_function_privilege('clara_authenticated','clara._book_today()','EXECUTE')` | **false** (and `clara_runtime` false) |
| is that closure a house law or an accident? | `packages/db/tests/x42b0-s5c-clock.test.mjs:234-239` (cell `x42.s5c.1`) | it **asserts** `clara_authenticated` is refused `42501` on the authority — widening the ACL would red a standing cell |
| how the two #660 reads run | `0232`, both reads | `language plpgsql stable security invoker` — they run **as their caller**, so 0003's firm-scoped RLS is the wall, and the tail asserts SECURITY INVOKER |
| does any INVOKER body already reach the authority? | `select proname from pg_proc where prosrc like '%_book_today%' and not prosecdef` | **zero rows** — every caller in the catalog is a SECURITY DEFINER body |

So these two reads are the first SECURITY INVOKER bodies in the estate that need a money date, and
neither the direct call nor an ACL widening was available.

**The fix takes 0042 S5.20's own remedy for its own problem.** S5.20 turned `clara._fa_today()`
into *"a DELEGATE, not a second copy, not a rename"* so that exactly one body computes the house
date. 0232 now installs one more delegate for the INVOKER side:

```sql
create function clara.book_today() returns date
  language sql stable security definer
  set search_path = clara, pg_temp as $$ select clara._book_today() $$;
revoke all on function clara.book_today() from public;
grant execute on function clara.book_today() to clara_authenticated;
```

A SQL `security definer` function is never inlined by the planner, so the definer hop is real.
Measured on the green chain: `prosecdef=true`, `provolatile='s'`, owner `clara_fn_owner`,
`proacl = {clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}`,
`prosrc = " select clara._book_today() "`. **The authority itself was not widened** — 0232's
prestate refuses to apply if `clara_authenticated` already holds EXECUTE on it, and its tail
re-asserts that `clara_authenticated`, `clara_runtime` and `PUBLIC` all still hold nothing.

Both reads now say `v_today := clara.book_today();` and nothing else moved: `computed_at` is still
`now()`, both envelopes still publish `'timezone','Asia/Kuala_Lumpur'`, and
`publish_client_cash_account_set` was left exactly as §4.1 classified it (CLASS 2, configuration
lifetime — the ruling named only the two reads).

**This is the one place the implementation goes beyond the ruling's literal words** ("re-point both
to `clara._book_today()`"), and it is named here rather than buried: the ruling's own parenthesis
allowed "the exact function the S5.25 roster names as the consumer target", and the roster's
standing advice cannot be followed literally from an INVOKER body. The delegate is the smallest
shape that satisfies it without breaking `x42.s5c.1`.

---

## 2 · RED FIRST

The red was taken on a **fresh** `rigint`, on the **unedited** 0232, before any migration change.

```
MSYS_NO_PATHCONV=1 wsl -u root -- bash .../mkrig.sh rigint 55720      # drop + recreate the cluster
wsl -u root -- runuser -u postgres -- createdb -p 55720 clara_int
→ clara% roles BEFORE migrate: 0                                      # a NEW cluster, 0154 honest
pnpm db:migrate  → migrate: 228 new migration(s) applied · 228 total · 127.0.0.1:55720/clara_int
pnpm db:seed     → seed: 2 seed file(s) applied
```

Then the new cell, focused, with the 49 gate flags:

```
node --test --test-concurrency=1 $GATES --test-name-pattern="as_of_is_book_day" \
  tests/client-financial-pack.test.mjs
→ not ok 1 - p660.pack.as_of_is_book_day …
  error: 'function "clara.book_today()" does not exist'   code: '42883'
  # tests 1 # pass 0 # fail 1
```

and the defect itself, read straight off the catalog on that same chain:

| body | `clara.book_today()` in prosrc | `at time zone 'Asia/Kuala_Lumpur')::date` in prosrc | prosrc md5 |
|---|---|---|---|
| `clara.get_client_financial_pack` | **false** | **true** | `1b6e48e508f1a63c30b945998d54b3a8` |
| `clara.propose_client_cash_accounts` | **false** | **true** | `0e90f52dd40851370763fe45bcf21828` |

### 2.1 · What the red actually is, said plainly

The cell has two arms and only one of them was red, and the report says which:

* **arm (1), behaviour** — the pack's default as-of, its month anchor, its future wall and the
  proposal's echoed `as_of` are the MYT book day under a UTC session and under the two zones that
  bracket MYT. This arm **passed on the unedited bodies too**, because
  `(now() at time zone 'Asia/Kuala_Lumpur')::date` yields the right *answer*: `at time zone` on a
  `timestamptz` is session-zone-independent.
* **arm (2), provenance** — both bodies READ that day from the house authority instead of spelling
  the derivation a second time. This is the arm that was red, and it is the defect S5.25 arm (B)
  exists to catch: a second copy of a house fact that has exactly one body.

The cell is written arm (2) first for that reason, and its header block states it, so a later reader
is not told that a behaviour regression was fixed when what was fixed was provenance.

---

## 3 · What changed

| file | change |
|---|---|
| `packages/db/migrations/0232_client_financial_pack.sql` | the `clara.book_today()` delegate + its grant/revoke pair; `v_today := clara.book_today();` in both reads; both doc comments; prestate (name not taken, authority present and still closed); tail (the delegate joins the existence / exactly-once / no-argument / ACL / no-model-lane censuses, plus its own posture and delegation probes, plus a provenance probe over BOTH reads and an "the authority is still closed" probe); the closing notice |
| `packages/db/tests/client-financial-pack.test.mjs` | new cell `p660.pack.as_of_is_book_day` (35 → 36 cells) |
| `packages/db/tests/client-financial-pack-fixtures.mjs` | three additive helpers: `inZoneAsHuman`, `packOn`, `proposeOn` |
| `packages/db/tests/x42-s5-helpers.mjs` | both 0232 roster blocks reclassified — arm (B) `KL_ROSTER_0232_CLIENT_FINANCIAL` and arm (D) `CLIENT_FINANCIAL_PACK_0232_CLOCK_NAMES`. **Comment only: not one name added or removed from either array** |
| `packages/db/tests/rig-meta.mjs` | `book_today` joins the 0232 cohort and `ALLOWED[clara_authenticated]` — required, not cosmetic: `operation-census`'s `unattributed` is a HARD label and a granted routine no cohort claims fails `opcen.1` |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | 0232 re-pinned at `4240e93328d0e9a3174fae476ed99a9fa41da6b2379cafc9d66d2ac2b3a667dd`, with the reason extended to say what moved the sha |

### 3.1 · The census reclassification (DECISIONS §6.4, task step 3)

Both names move from **CLASS 2 / ESCALATED** to **CONSUMER of the house derivation** in both arms'
roster blocks. **Additions only — no name left either roster, and that is correct rather than an
oversight**: arm (B) detects the ZONE STRING, which both bodies still carry as the `timezone` key
their envelopes publish so a face can state the calendar it counted in; arm (D) detects a BARE
CLOCK TOKEN, which both still read for `computed_at`. The delegate adds no name to either arm — it
reads no clock and spells no zone, and `_book_today` is exempt by name on arm (D).

Re-measured on the fresh green chain by each arm's own detector: **0 extra / 0 missing, both arms,
both directions.** `integration-fix-1.md` §4.1's two rows and §4.3 are updated in place with the
ruling and the outcome (§4.3.1).

---

## 4 · GREEN — the evidence

Every db number below is from a **second** fresh cluster: `rigint` was dropped and recreated with
`mkrig.sh` after the red, `clara_int` created, and the chain run once on it. Same for `rigrt`.

### 4.1 · The fresh-cluster proof

| cluster | port | db | `clara%` roles before migrate | chain | seed |
|---|---|---|---|---|---|
| `rigint` (recreated) | 55720 | `clara_int` | **0** | `228 new migration(s) applied · 228 total` | 2 seed files, exit 0 |
| `rigrt` (recreated) | 55721 | `clara_rt` | **0** | `228 new migration(s) applied · 228 total` | 2 seed files, exit 0 |

0232's own prestate and tail both printed clean on the new chain, the tail in its new wording:

> `#660 tail: OK -- three doors plus the book-day delegate exist exactly once each at exactly their
> signatures, owned by clara_fn_owner; clara.book_today() is a STABLE SECURITY DEFINER one-line
> delegate of clara._book_today() that reads no clock and spells no zone of its own,
> clara._book_today() itself is still closed to clara_authenticated / clara_runtime / PUBLIC, and
> BOTH reads take their money as-of from the delegate and carry no second copy of the house
> derivation (DECISIONS 6.4 row 1); …`

Read back off the green catalog:

| body | routes through `clara.book_today()` | second copy of the derivation | prosrc sha256 |
|---|---|---|---|
| `clara.get_client_financial_pack` | **true** | **false** | `c846768d0d114a3bf38d90a437bdd65731f4a3cbc64a7ecd3edc72cb6b788f1e` |
| `clara.propose_client_cash_accounts` | **true** | **false** | `c2d04e73e08bbb33fd591413fa243d4cda58ab6b4da07fd41c4e9de29012d261` |

### 4.2 · The db batteries (cwd `packages/db`, the exact **49** gate flags from `packages/db/package.json`, no reset flags)

| battery | command | result |
|---|---|---|
| `client-financial-pack` (all cells incl. the new one) | `node --test --test-concurrency=1 $GATES tests/client-financial-pack.test.mjs` | **36 / 0 / 0** (was 35 — the new cell is the 36th) |
| the four S5.25 census cells | `… tests/x42b2-r7-s5-census.test.mjs tests/x42b2-s5c-clock.test.mjs tests/x42b2-r7-s5-clock.test.mjs` | **6 / 0 / 0** — `x42.r7.s5.census.4`, `census.4b`, `x42.r7.s5c.4`, `x42.r7.s5c.5`, `x42.s5c.5`, `x42.s5c.6` |
| `operation-census` | `… tests/operation-census.test.mjs` | **10 / 0 / 0** (matches `integration-merge.md` §3.3) |
| `rig-isolation` (no reset flags) | `… tests/rig-isolation.test.mjs` | **20 / 0 / 1** — the one skip is T19, the destructive poison-role cell, by design. **T10b GREEN** (no Workflow World was ever bootstrapped on `clara_int`) |

And all six files together, re-run **at the final head** (`13f2c76e`) in one invocation:
**73 tests · 72 pass · 0 fail · 1 skip** — the skip is T19.

### 4.3 · The whole db estate suite

`pnpm --filter @clara/db test` on `clara_int` (the package script's own **49**-gate chain over
`tests/**/*.test.mjs`, 410 test files, `--test-concurrency=1`, no reset flags):

**5151 tests · 5056 pass · 0 fail · 95 skip · 1012 s · exit 0.**

Against `integration-merge.md` §3.3's **5148 / 5048 / 5 / 95** (which exited **1**):

| | §3.3, at the merge | here, at `13f2c76e` | delta |
|---|---|---|---|
| tests | 5148 | **5151** | **+3** |
| pass | 5048 | **5056** | **+8** |
| fail | 5 | **0** | **−5** |
| skip | 95 | **95** | **0** |
| exit | 1 | **0** | — |

**+1 of the +3 is this round's own cell** (`p660.pack.as_of_is_book_day`); the other +2 are measured,
not assumed — `git diff 2f60ff29..887b4162 -- packages/db/tests | grep -E "^\+(test|await test)\("`
counts **2** added cells and **0** removed between §3.3's head and the head this round started from
(integration fix round 1 and the successor cut are what landed in that window).
**The five failures are gone and none was papered over**, and they are accounted for one by one:
§3.3's five were `integration-merge.md` §5.1's `f-a2.c5.census` (the unpinned
`t_je_open_item_birth` trigger) plus §5.4's four S5.25 census cells — the only two §5 items that
live in the db suite at all (§5.2 is a runtime cell, §5.3 a Playwright walk). DECISIONS §6.3 ruled
both: the trigger's tier is ABORT (with `p655.birth.abort_is_atomic`), and the four rosters take a
measurement pass, additions only. Fix round 1 applied both; this round re-proved them green and
closed the one thing that pass left open — the two escalated names. **The 95 skips are unchanged**, which is the number
that matters most here: no cell went from failing to skipping, and **zero** of them is a
frontier skip.

One honesty note: my combined confirmation run (73 cells, above) overlapped this suite on
`clara_int` for about a minute. Sharing a rig can only ADD failures, never hide them, and the suite
reported none — but the overlap is recorded rather than left for someone to infer from timestamps.

### 4.4 · The World legs on a clean World database (task step 5)

`rigrt` 55721 was recreated, `clara_rt` migrated (228) and seeded, then the WDK world bootstrapped
on it (`pnpm --filter @clara/runtime exec bootstrap`, exit 0). At that pristine moment — chain,
seeds and world schemas present, not one Work run against it — the two sanctioned throwaway names
were cut as **template copies**, which is the CI action's own idiom
(`.github/actions/db-live-gates/action.yml:110-131`) and the only way to get them without a second
from-scratch chain on one cluster (0154):

```
create database clara_wave_b_ci template clara_rt
create database clara_rt_test  template clara_rt
```

The names are not free: all three legs are hard-gated to a loopback host **and**
`PGDATABASE ∈ {clara_rt_test, clara_wave_b_ci}`, so `clara_rt` itself cannot host them by name.

| leg | db | result |
|---|---|---|
| `chat-turn-v21-e2e.mjs` | `clara_wave_b_ci` | **PASS** — `CHAT TURN V21 E2E: PASS (5 legs)`; a real `chatTurn_v21` turn admitted a trade-invoice Work and `claraWork_v5` ran it to a posted entry; the depreciation tool reached its `clara_runtime`-only door; the knowledge block reached both prompts with a read-set row at `status=ok` under registry v2; `read_knowledge_source` answered; two byte-identical admissions in one turn re-reserved the SAME Work |
| `work-journal-e2e.mjs` (`RELAY_TEST_MODE=1`) | `clara_wave_b_ci` | **PASS** — `WORK JOURNAL E2E: PASS`, all 8 legs including the crash-after-commit/before-checkpoint resume |
| `two-build-cutover-e2e.mjs` (#637) | `clara_rt_test` | **PASS** — `TWO-BUILD CUTOVER E2E: ALL PASS` |

**The two-build leg closes DECISIONS §6.4's fourth row** ("Cut recheck NOT-verified — the leg
refused to start on a contaminated shared rig; re-run it on the fresh cluster"). It started, and it
exercised **both** successor pairs this wave cut, one after the other:

| pair | build A | build B | parked run | resume |
|---|---|---|---|---|
| `claraWork_v4` → `claraWork_v5` | 54 bodies, `claraWork=claraWork_v4` | 55 bodies, `claraWork=claraWork_v5` | W1 on `claraWork_v4`, bundle `clara-work/v4` `81e1ffcd5526…` | completed on v4 **inside build B**, run name invariant, 1 receipt @ `81e1ffcd5526…`; W2 completed on v5, 1 receipt @ `fe64198207d5…` |
| `chatTurn_v20` → `chatTurn_v21` | A2: 54 bodies, `chatTurn=chatTurn_v20` | 55 bodies, `pins.chatTurn=chatTurn_v21`, roster still carries v20 | C1, a chat clarification on `chatTurn_v20` | completed on v20 inside build B, run name invariant, clarification delivered |

Both builds report `frontier=0233_firm_commercial_settings(228)`. The drill also re-proved the
preflight refusals that make a cutover safe: a target without the parked body is REFUSED **by name**;
a rollback to A is REFUSED while W2 is live on the successor; a scoped-to-W1 verdict is ALLOWED while
the global verdict REFUSES; with both Works settled the rollback becomes ALLOWED; and the frontier
rule refuses a target missing `claraWork_v3` at this database frontier. The `claraWork_v4` bundle
digest `81e1ffcd5526…` is unchanged from `integration-merge.md` §3.5 — measured, not asserted.

### 4.5 · Static checks (task step 6)

| check | command | result |
|---|---|---|
| typecheck | `pnpm typecheck` | **exit 0** (`apps/web`, `packages/runtime`) |
| lint | `pnpm lint` | **exit 0** |
| the 0232 corpus pin | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` (cwd `apps/web`) | **22 / 0 / 0** at the new sha `4240e933…` |
| frozen workflows | `node scripts/check-frozen-workflows.mjs --compare-base origin/main` | **OK — 296 existing entr(ies) retain the same hash and deployed flag; 16 addition(s); 3 recorded retirement(s)** — additions only, unchanged from the cut |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — reader ⊇ emittable; `claraWork.v5.impl.ts:891` and `chatTurn.v21.tools.ts:359` both accounted for |
| the whole `apps/web` unit suite (the one package this round touched outside `packages/db`) | `pnpm --filter @clara/web test` | **4628 · 4626 pass · 0 fail · 2 skip** — identical to the successor cut's own baseline (`0428c408`'s message) |

### 4.6 · Out of scope, run anyway, and one finding named rather than fixed

The runtime unit suite is not in this round's brief (step 4 asks for the db estate suite, step 5 for
three named legs). I ran it on `clara_rt` regardless, after the World legs:
`node --test --test-force-exit "tests/**/*.test.mjs"` → **2800 · 2780 pass · 4 fail · 16 skip · 65 s.**

| failure | verdict |
|---|---|
| `scanner rejects EICAR, encrypted PDF, XML entity expansion` | **#693**, RIG.md's named Windows/Defender red. Not fixed |
| `(#806) this host's OWN probe: pg_dump/psql are on PATH here` | RIG.md's named environment gap (no `pg_dump` on PATH). Not fixed |
| `a real per-client transition (a wiki-synthesis hold) …` (`wave-b-lint-belt`) | whole-suite artifact — **4 / 4 green alone**, re-measured |
| `637.pf: B3 — two sources sharing one task_kind count the task ONCE …` | **named, not fixed — see below** |

`637.pf: B3` fails because `censusUnboundTasks(query, { taskIds: [taskId] })` returned **19** rows
where the cell asserts 1: the one `clara.agent_tasks` row it planted, plus **18**
`clara.document_processing_tasks` rows left `queued` on the shared database by earlier files in the
same suite. Measured on `clara_rt` immediately afterwards: `document_processing_tasks` by status =
done 31 / failed 26 / **queued 18** / running 16 — the same 18. The cell's `taskIds` scope does not
reach the document table, so the cell is sensitive to any database that carries queued document
work; it fails alone on such a database too.

**That is not a consequence of this round, and the claim is checkable:** `git diff --name-only
887b4162..HEAD` lists six files and **zero** under `packages/runtime`, and 0232 creates only the two
cash-account-set relations and four functions — it touches neither `clara.document_processing_tasks`
nor `clara.wake_engine_sources`. Per RIG.md ("known pre-existing reds you may ignore and must NOT
fix") I left it alone and name it here for the orchestrator; it is a cell-scoping question for
`#637`'s owner, not a wave defect.

---

## 5 · What was deliberately NOT done

* **`publish_client_cash_account_set` was not re-pointed.** §6.4 row 1 names only the two reads, and
  §4.1 resolved the publish door cleanly: its `v_today` is reached only when the caller stated no
  date **and** the client has no books at all, so the clock can only ever date the first
  cash-account-set version of a client with no money — a configuration lifetime, not a posting, a
  due date or an accounting period. It keeps its CLASS 2 reading in both rosters.
* **`computed_at` was not touched** in either body. The ruling says so explicitly: it is a sampling
  read of an instant, not a money date.
* **No name was removed from any roster.** The rule is additions-only and the reclassification is
  comment-only.
* **The authority was not widened.** `clara._book_today()`'s ACL is byte-identical; 0232 now refuses
  to apply if it ever is not, and asserts it again in its tail.
* **No second migration.** §6.4 chose the edit-on-a-fresh-cluster route over a new 0234, so the
  wave's frontier is still 0233 / 228.

## 6 · Residual, named

The midnight-MYT skew the counter-argument describes is **real and accepted, not closed**: a pack
call whose transaction opens before MYT midnight and whose statement runs after it will report an
`as_of` from the new day and a `computed_at` from the old one. That is a one-statement window, it
is the direct consequence of the ruling, and it is written into 0232's own header
(`THE TRADE, STATED`) so the next reader meets it in the file rather than in a report. If the
estate ever wants both, the shape is §4.3's option 3 — an as-of-at-an-instant form of the authority
(`clara._book_today(timestamptz)`) — which would also settle `_close_gate_undated` and
`_bank_enrolled_fy_months`. It is not this round's work.

---

## 7 · Commits

| sha | subject | files |
|---|---|---|
| `26cd7e82` | `fix(db,integration): #660 the money as-of is the book day, not the session clock (DECISIONS §6.4)` | `0232_client_financial_pack.sql`, `client-financial-pack.test.mjs`, `client-financial-pack-fixtures.mjs`, `rig-meta.mjs`, `firm-scope-db-pins.corpus.ts` — 5 files, +337 / −18 |
| `13f2c76e` | `test(db): the two #660 money-date names are CONSUMERS of the house derivation, not CLASS 2 escalations (DECISIONS §6.4)` | `x42-s5-helpers.mjs` — 1 file, +41 / −18, **comment-only** (`git diff` with comment lines stripped is empty) |

Head after this round: **`13f2c76e`** (base `origin/main` `abcc5030`; head at the start of the
round `887b4162`). Nothing pushed, no PR opened, no blueprint edited, no impl worktree or cluster
touched, `CLARA_RIG_ALLOW_RESET` never set.

The two reports (`integration-fix-1.md` §4.1 / §4.3 and this file) live in the untracked plan
directory of the primary working tree, as every other report of this wave does, and are not part of
either commit.
