# Cut phase — the PR #1140 CI reds, reproduced and fixed (COMPLETE)

**Worktree** `C:\Users\zhant\Desktop\clara-wt\660` · **branch** `fix/wC-ci-reds`
**Cut from** `origin/integration/riders-cut` at `34b125e6f` · **head `2b5338938`**
**Three commits**, one per group. Nothing pushed, no PR, no GitHub write, no other worktree and
no main-checkout file but this report touched, no subagent spawned, no port in 55700–55706 or
55741–55749 used, no process killed.

| # | commit | group |
|---|---|---|
| 1 | `749ff80b4` | A — #1030 / #1135 the orphan-overload sweep ratifies the cut's three sibling pairs |
| 2 | `77975202c` | B — #1007 / #1135 the probe posture census orders under `collate "C"` |
| 3 | `2b5338938` | C — #1030 the x42 S5.25 arm (D) clock roster takes 0321's settle door |

Diff vs `origin/integration/riders-cut`: **3 files, +59 / −1**, all three under `packages/db/tests`.
**No migration was edited, no migration was added, no redo was run, no pin moved, no production
module changed.**

---

## The six reds, at a glance

CI run 36089560091 reports exactly **6** reds, all in `db-estate` · `packages/db`
(5822 tests · 5721 pass · 6 fail · 95 skipped). `apps/web` in the same job was 5173 · 5171 · 0 · 2,
and `db-live-gates` and the whole runtime suite were green.

| CI cell | cause | fix |
|---|---|---|
| `207` af.23 | **NOT a branch defect** — a wall-clock budget on an outlier runner | none; evidenced below |
| `3195` §3 orphan overloads | 0321 and 0323 each mint a lawful sibling arity; the ratification roster names neither | the roster, by intent |
| `3308` §6 signature set | the SAME helper as `3195` — one root cause, two cells | the same one line |
| `3626` p1007.probe.is_a_read | a collation-ordered readback against a literal census | `collate "C"` at the order |
| `5384` x42.r7.s5c.5 | 0321's settle door is not on arm (D)'s clock roster | the roster, with the adjudication |
| `5394` x42.s5c.6 | the SAME roster, second cell | the same cohort |

So the six are **four causes**: one host effect, one missing ratification (two cells), one
collation (one cell), one missing clock cohort (two cells).

---

## The rig

One disposable WSL PostgreSQL 17 cluster, `rigfixc`, `127.0.0.1:55707`, locale **C.UTF-8**,
created for this job and **dropped at the end** (`pg_lsclusters` afterwards shows the sixteen
standing clusters and no `rigfixc`). Database `clara_fixc`, built from scratch from this
worktree: **312 new applied · 312 total**, `0001` → `0323_trade_invoice_probe_self_exclusion`.
All three cut migrations took their FIRST APPLY branch and printed their own verdicts:

- `0320` — "prestate: clean — mode FIRST APPLY, 0232's three doors present, 11 neighbour bodies
  byte-identical"; tail OK.
- `0321` — "mode FIRST APPLY, 0268 cohort present, 16 neighbour bodies byte-identical, 0
  source-corrected cancellation receipt(s) on this rig"; §TAIL clean.
- `0323` — "mode FIRST APPLY, 0275 cohort present, 10 neighbour bodies byte-identical"; §TAIL
  clean, its data-dependent arm correctly skipped.

**One rig note worth the next worker's time.** `pg_createcluster` needs root here
(`wsl -u root -- pg_createcluster 17 <name> -p <port> --start`), and a cluster it creates gets
Debian's default `scram-sha-256` for `127.0.0.1`, not the trust auth every standing lane cluster
has. The first `createdb` and every `psql` then hang on an unanswerable password prompt with no
error. `pg_hba.conf` must be switched to `trust` for the two `host all all` lines and the cluster
reloaded before anything else runs.

**A second note.** `wsl -- psql -c '…$$…'` loses dollar-quoting (and `$x$`) to shell expansion
somewhere in the Windows-to-WSL argument path. Write the SQL to a file inside WSL
(`wsl -- bash -c "printf … > /tmp/x.sql && psql -f /tmp/x.sql"`) or use ordinary `'…'` string
bodies.

---

## Red 1 — `not ok 207` · af.23 · NOT a branch defect, and the evidence for that

```
error: 'af.23 clara.list_activity(p_work) call 1 took 1719.9 ms (budget 1500 ms) —
        series 1719.9 / 1656.7 / 1609.4 / 1639.0 / 1665.4 / 1633.1 / 1612.1 / 1652.0 / 1722.7 / 1638.2'
```

`packages/db/tests/activity-feed.test.mjs:1473`, arm (1b): an **absolute wall-clock budget**
(`CALL_BUDGET_MS = 1500`, `:935`) on each of ten `clara.list_activity(…, p_work)` calls over a
30,000-receipt history.

### It is not the plan, and the failing run's own numbers say so

The cell has two kinds of arm. The **step** arm (the plan-cache flip, `FLIP_FACTOR = 4`) is the
one that catches a lost plan pin. Arm (1), the unscoped step, **passed** — it runs before the
budget loop. Arm (1b)'s own step never executed, but its verdict is computable from the series
CI printed: median of calls 1–5 is 1656.7 ms, cheapest of calls 6–10 is 1612.1 ms, a ratio of
**0.97** against a 4.0 threshold. **The series is flat.** A lost plan pin or a plan-cache flip
produces a step; a uniformly slower host produces exactly this shape.

### The cut cannot have changed this measurement's inputs

Each of these is a checkable claim, not an argument:

| claim | how it was checked |
|---|---|
| the cell itself is unchanged | `git diff origin/main...HEAD -- packages/db/tests/activity-feed.test.mjs` is **empty** |
| no cut migration touches the door or its tables | `grep` for `list_activity`, `operation_receipts`, `create index`, `create trigger`, `alter table` across `0320`, `0321`, `0323` — **no hit in any of the three** |
| the three new preintegration gates seed nothing | each is a **14-line** file whose only statement sets one `process.env` flag |
| `rig-meta.mjs`, the shared fixture module the cut edits, changes no seeding | its whole diff is two new cohort name arrays and their export |
| the three new test files cannot run before it | node's runner walks `tests/**/*.test.mjs` in order, and `client-…`, `trade-…`, `work-…` all sort after `activity-feed` |

So the rows, the statistics and the door reaching af.23 are byte-for-byte what they were on
`origin/main`.

### Measured, three ways

| measurement | result |
|---|---|
| three ISOLATED runs, from-scratch 312-file database, full gate chain | **3 / 3 green** (4.27 s, 5.16 s, 5.25 s, 5.45 s) |
| the WHOLE `packages/db` suite in CI's own order, same database | **green at test `207`** — the same index CI reds |
| the p_work series on this host, measured by lowering the budget to 1 ms in a throwaway copy of the file | `133.4 / 141.1 / 149.3 / 116.9 / 138.7 / 121.5 / 132.5 / 139.6 / 104.1 / 101.7` ms — **ten to fifteen times inside the 1500 ms budget** |

### The runner, and the one thing I could not explain

The last green `db-estate` (run 36034074208, job 107749789534, 2026-09-24) ran this cell in
**11802 ms**; the failing run took **24079 ms**, 2.04x. That is *not* a whole-job slowdown: across
the thirteen cells over 3 s that both logs share, the failing run was **9 % FASTER** in total
(274 s green against 250 s red). So the host was not uniformly slow — **this one cell was**, and I
cannot say from the logs why.

What can be said with evidence: this is the most I/O-heavy cell in the suite (1,500 firms, 1,500
clients, 1,500 works, 1,500 tasks and 36,000 receipts written in one transaction, then four
`ANALYZE`s), it is the **only** cell in `packages/db` carrying a wall-clock budget at all
(`grep -rl "BUDGET_MS" packages/db/tests/*.test.mjs` returns `activity-feed.test.mjs` and nothing
else), and its inputs are provably unchanged by this branch. A burst-credit or noisy-neighbour
disk window on that runner would hit exactly this cell and leave CPU-bound cells alone — but that
is a **hypothesis I did not verify**, offered as one, not as the finding.

**Nothing was changed for this red.** Loosening the budget would retire the only cell in the
estate that measures what an Activity read costs a pooled PostgREST connection. Follow-up 1 below
is the honest answer.

---

## Red 2 — `not ok 3195` and `not ok 3308` · the orphan-overload sweep · #1030 / #1135

**Reproduced** on the from-scratch chain before anything was changed:
`rig-docs-isolation-grants.test.mjs` **24 pass / 1 fail**, with CI's exact three-name diff —
`clara._fact_value_changed has 2 overloads; clara._trade_invoice_probe_core has 2 overloads;
clara.probe_trade_invoice_duplicates_for has 2 overloads`.

**One root cause, two cells.** Both `rig-docs-isolation-grants.test.mjs:209` (§3) and
`rig-runtime-catalog.test.mjs:197` (§6) call the same helper,
`overloadFailures()` in `packages/db/tests/rig-runtime-meta.mjs:91`. Neither cell's own roster
(`S5_NEW_FNS`, `S4_NEW_FNS`) names any of the three — verified by grep — so the sweep is the only
failing assertion in both, and one line clears both.

### The brief's first reading, and what the cell actually says

The work order framed this as "the contract roster of function names and signatures must learn
0320's and 0321's new functions". It is not that. The failing assertion is the **closed-world
orphan sweep**: `select proname, count(*) … group by proname having count(*) > 1`, filtered
against a `RATIFIED` map. No new *name* is missing. Three names acquired a **second arity**.

### Is the overload lawful? The roster's own rule, applied

The sweep does not forbid overloads outright. It forbids **unratified** ones, and its three
standing amendments (0038's `prepare`/`consume_egress_dispatch`, 0040's `match_bank_line`/
`settle_from_bank_line`, 0046's `settle_autodraft_task`) each record the same safety proof: *the
arities cannot both match one call*, asserted by the migration's own `pronargdefaults` census.
The question the brief asks — whether 0321 should have replaced rather than overloaded — is
therefore answered by measurement, and the answer is that all three pairs are lawful:

| pair | migration's own position | measured on the live 312-file catalog |
|---|---|---|
| `_fact_value_changed(jsonb,jsonb)` / `(jsonb,jsonb,text)` | 0321:39 "ONE NOTION, STILL… is NOT recut"; §TAIL (T2) pins `sha256(prosrc)` of the two-argument body at `7d4f995c…` and **raises** if it moved | `pronargdefaults` **0** and **0** |
| `_trade_invoice_probe_core(uuid,text,jsonb)` / `(uuid,text,jsonb,text)` | 0323:24 "IT ADDS A SIBLING, NEVER AN EDIT… BYTE-UNTOUCHED" | **0** and **0** |
| `probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)` / `(…,text)` | 0323 §TAIL (T2) asserts "2 overloads … expected 2" **and** raises if either new sibling carries a default | **0** and **0** |

Zero defaults on every arity means a call resolves solely by argument count — the exact ambiguity
the sweep exists to catch, absent. And folding would be the wrong change on its own terms: 0321's
whole design is that a fact row written before the typed guard existed reads the way it was
written, and its §TAIL would refuse a recut of the two-argument body; 0323's keyless callers must
keep the answer they have.

**Fix.** Three `RATIFIED` entries, each pinned at **2**, with the amendment, the reason and the
no-ambiguity proof in the comment — the 0038/0040/0046 shape exactly. Not a loosening: the map's
rule is `n !== (RATIFIED[name] ?? 1)`, so a THIRD overload is still an orphan, and a database
below 0321/0323 never reaches the `having count(*) > 1` filter at all, so the entries are
bimodal-safe without a stem gate.

**Vacuity control, run.** A fourth-arity `clara._fact_value_changed(jsonb,jsonb,text,text)` was
created on the live catalog; `rig-runtime-catalog` went **4 pass / 2 fail** reading
`clara._fact_value_changed has 3 overloads`. The decoy was dropped and the file returned to
**6 / 6**, with the catalog back at two overloads.

---

## Red 3 — `not ok 3626` · p1007.probe.is_a_read · a COLLATION red, not a posture change

The cell's four expected signatures are **exactly** the four bodies the catalog holds. CI's
`actual` and `expected` are the same set in a different order. Nothing about the probe's posture
moved: `provolatile`, `prosecdef` and the ACL all pass.

`packages/db/tests/trade-invoice-duplicate-probe.test.mjs:305` ordered by
`p.oid::regprocedure::text`. That is **`text`**, so the readback takes the database's default
collation, and these four signatures differ exactly where a leading underscore does.

**Reproduced both ways on one database** rather than argued:

| order | result |
|---|---|
| `collate "C"` | `_trade_invoice_duplicate_matches`, `_trade_invoice_probe_core(3)`, `_trade_invoice_probe_core(4)`, `probe_trade_invoice_duplicates` |
| `collate "en_US.utf8"` | `probe_trade_invoice_duplicates`, then the three underscore bodies |

The second is CI's `actual`, word for word. Under `C` the underscore (0x5F) sorts before `p`
(0x70); under glibc `en_US.UTF-8` — which is what CI's `postgres:17` service container initdb's
with — punctuation is ignored at the primary level. Every cluster on this rig is `C.UTF-8`, which
is why no lane, no integration run and no gate saw it. This is wave 4's `knowledge-fye-day` fd.12
class, one file further on, and it is the **third** wave in a row to pay for follow-up 3 of
`wave4-ci-reds.md`.

**Fix at the ORDER, not at the assertion:** `collate "C"` on the ordering term. The literal census
stays exact and now means the same thing on either host. A sweep of every `order by` in the twelve
`packages/db/tests` files the cut touches found **no second ordering of this shape**;
`trade-invoice.test.mjs:108` already carries the same `collate "C"` on `tgname`.

---

## Red 4 — `not ok 5384` and `not ok 5394` · the x42 S5.25 arm (D) clock roster · #1030

**Reproduced**, twice. The two cells (`x42b2-r7-s5-clock.test.mjs:140` and
`x42b2-s5c-clock.test.mjs:369`) ran **2 pass / 2 fail** on the from-scratch chain. Independently,
the live census re-derived outside the suite (the cells' own `S5_25_BARE_TOKEN_RE` and comment-
stripping expression against `s5BareTokenRoster`) returned:

```
live n= 297  roster n= 296
ONLY LIVE (missing from roster): [ 'settle_source_corrected_rederivation' ]
ONLY ROSTER (not live): []
```

which is CI's one-name diff exactly. **0320 and 0323 add NO arm-(D) name** — measured, not
assumed: the census returns exactly one unrostered name, and 0320's sampled instant is already
carried by lane C1's reverse-gated `CLIENT_FINANCIAL_PACK_WAKE_0320_CLOCK_NAMES`. Arm (B), the
`Asia/Kuala_Lumpur` duplication roster, is unchanged and green: the cut spells no zone.

### The adjudication, measured body by body

Wave 4's seven doors needed the expensive proof because five of them wrote relations carrying
DATE columns. This one does not, and that is measured on the live 312-file catalog:

| question | measurement |
|---|---|
| its clock lines | **two**, one idiom: `update clara.accounting_work set superseded_by = p_successor, updated_at = now()` and `… set supersedes = w.id, updated_at = now()` |
| its date-typed locals | **none** — `v_rev uuid; v_work uuid; v_firm uuid; w record; sx record; v_dedupe jsonb; v_result jsonb; v_reason text; v_actor uuid;` |
| date tokens anywhere in the body | **none** — no `::date`, no `current_date`, no `date_trunc`, no `to_date`, no `clara._book_today()` |
| the relations it writes | **`clara.accounting_work` alone**, which carries **no DATE column at all** (`information_schema.columns` where `data_type = 'date'` returns nothing for it) and whose `updated_at` is `timestamp with time zone` |

Both clock reads land on a timestamptz target, no date is derived from either, and the house legal
date is not owed: the body never answers "what is today". Its op receipt is written by
`clara._finish_op`, a separate body already on this roster.

**Fix.** One cohort, `WORK_SOURCE_REDERIVATION_0321_CLOCK_NAMES`, with that adjudication in its
own header, gated on the **FULL** stem `work_source_correction_rederivation$` and never on the
number — doubly load-bearing here, because 0268 is `work_source_correction_supersede` and a
shorter gate would witness the wrong file. Stem uniqueness confirmed on the catalog: the regex
matches exactly one row of `clara.schema_migrations`.

---

## Gates, with counts

Everything below was run at **`2b5338938`** against `clara_fixc`
(`PGHOST=127.0.0.1 PGPORT=55707 PGUSER=postgres CLARA_RIG_DB=1 CLARA_ALLOW_DESTRUCTIVE=1`).

| gate | how | result |
|---|---|---|
| the six touched / failing db files, full **128-token** gate chain | `rig-docs-isolation-grants`, `rig-runtime-catalog`, `trade-invoice-duplicate-probe`, `x42b2-r7-s5-clock`, `x42b2-s5c-clock`, `x42-r7-s5-clock` | **35 pass / 0 fail / 0 skipped** |
| the WHOLE `packages/db` suite, CI's order, from-scratch 312-file database | `pnpm --filter @clara/db test` | **5822 tests · 5727 pass · 0 fail · 95 skipped**, exit 0 (1,542 s) |
| the same, on CI | baseline | 5822 · 5721 · **6 fail** · 95 — my pass count is theirs plus the six |
| `operation-census` + `rig-isolation`, **no reset flags** | full gate chain; `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` both confirmed unset in the environment | **33 tests · 32 pass · 0 fail · 1 skipped** (T19 skips itself, as RIG.md requires) |
| the web pins corpus (wave-4 rule 7) | `apps/web` `tests/firm-scope-db-pins.test.ts` | **22 / 22** — and a no-op by construction: this branch changes **no migration file** |
| `pnpm typecheck` | workspace | **exit 0**, `apps/web` and `packages/runtime` both Done |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | workspace, all four projects | **exit 0**, zero errors or warnings |
| `node scripts/check-frozen-workflows.mjs` | — | **347 frozen / 60 `"use workflow"` / 3 retired — unchanged** |
| `node packages/runtime/scripts/check-parts-parity.mjs` | — | **OK**, emittable set unchanged at six kinds |
| af.23, three isolated runs | `--test-name-pattern="af\.23"`, full gate chain | **3 / 3 green** |
| vacuity control, the widened overload roster | a third `_fact_value_changed` arity on the live catalog | **red as "has 3 overloads"**, then **6 / 6** after the decoy was dropped |

**One rig repair, named rather than hidden.** The first `pnpm typecheck` failed with
`apps/web components/ui/message-scroller.tsx(9,8): error TS2307: Cannot find module
'@shadcn/react/message-scroller'` — this worktree's `node_modules` predated the branch's
`@shadcn/react` dependency. `pnpm install --frozen-lockfile` (2.2 s) fixed it and the lockfile did
not move; the re-run is exit 0. **This is the same rig artifact `wave4-ci-reds.md` recorded**, and
it has now cost two waves an hour each. Note also that piping a gate to `tail` and reading `$?`
reports *tail's* exit code — the first run of both typecheck and lint printed `EXIT=0` while
typecheck had failed. Both were re-run with the exit code captured directly.

---

## Anything unverified

- **Why af.23 was 2.04x slower on that one runner** while the rest of the job was 9 % faster. The
  disk-throttling hypothesis above is labelled as a hypothesis. What IS established is that the
  branch cannot have moved the measurement, that the series was flat, and that the cell is green
  here three times isolated and once in CI's own order.
- **No `en_US.utf8` database was built.** Red 3's cause was proved by running the cell's own
  ordering both ways on one C.UTF-8 database, which reproduces CI's `actual` exactly and is why
  the fix pins `collate "C"` rather than a literal order. A full second chain under the runner's
  locale was not run; wave 4 did run one and its follow-up 3 still stands.
- **The arm-(D) stem gate's pre-0321 branch was not witnessed on a real pre-0321 database.** It
  has the identical `appliedStem` shape as the thirty cohorts beside it, and the stem was
  confirmed to match exactly one migration row, but no database at an earlier frontier was built.
- **`apps/web`'s unit suite and every browser walk were not run**, and the runtime suite was not
  run. No file outside `packages/db/tests` changed on this branch; CI had all three green.
- **Nothing was run under WSL as `runner`.** No runtime test file changed.

---

## Follow-ups worth filing

1. **af.23's budget arm is the estate's only wall-clock assertion and it has no stated tolerance
   for the runner.** It is the right measurement and it should stay, but a red that is a host
   effect is indistinguishable from a red that is a plan regression until someone spends an hour
   on it, as this job did. Worth either a documented retry-once policy for that one cell, or
   splitting the budget arm from the step arm so the step arm — the one that catches a lost plan
   pin — reports separately and the budget arm names the host when it trips.
2. **A migration that mints a sibling arity must join the ratification roster, and nothing tells
   its author so.** 0321 and 0323 both wrote a §TAIL asserting their own overload count and
   neither knew that `rig-runtime-meta.mjs` keeps an estate-wide closed world. One cell deriving
   the ratified set from the migrations' own tail assertions, or simply a line in
   `packages/db/README.md`'s migration shape, would have caught this at the lane's own PR.
3. **`wave4-ci-reds.md` follow-up 3 is now three waves old and has cost a red in each.** The rig's
   clusters are `C.UTF-8` and CI's container is `en_US.utf8`; every collation-ordered readback
   compared against a literal is invisible here until integration. Creating the lane clusters with
   `--locale=en_US.utf8` would surface them where they are written.
4. **`pg_createcluster` on this host produces a cluster no rig command can reach.** It needs root,
   and it defaults to `scram-sha-256` on `127.0.0.1` while every standing lane cluster is trust —
   so the first `createdb` hangs with no error. Worth two lines in `RIG.md` beside the existing
   cluster table.
