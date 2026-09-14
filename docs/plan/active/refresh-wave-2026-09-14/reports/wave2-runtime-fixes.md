# Wave-2 fixes — 0191's belt law, #640's FA due gate, and the three CI-only reds

Branch `integration/wave-2`, worktree `C:\Users\zhant\Desktop\clara-wt\integration2`.
Four commits on `193bddf2`; worktree CLEAN; nothing pushed, no PR.

```
9f01e8b4 docs(runtime): the PR-3a testkit says why one transaction still matters after the belt changed
d296fdc7 fix(db):      #624 — 0191's region belt APPENDS a revision instead of refusing a late region
6664a6c6 fix(runtime): #640 — the plan belt's probe no longer trips the FA due gate
eab88531 test(runtime): #624 — the legacy invoice-facts testkit seeds through the supported writer path
```

Rig **rigw2b** `127.0.0.1:55456/clara_w2`, dropped and rebuilt from scratch on the FINAL 0191
(`migrate: 189 new migration(s) applied · 189 total`, 170 s). rigw2 never reset; no reset/role-sweep
flag set.

## Regression 1 — the belt (scope changed by the orchestrator's ruling)

**What I found first (correct, but not the whole picture).** `f-a1-pr3a-testkit.mjs` seeded through
three separate `fx.rootQuery` autocommits (`relay-fixtures.mjs:41-68` — one pool checkout each), so
the `invoice.total` region landed in a LATER transaction than the header whose commit recorded the
verdict. I censused every writer of `clara.document_regions`: outside `packages/db/migrations` the
only INSERT sites in the repo are test fixtures, and each production door inserts header **and**
regions in one function body — `persist_invoice_facts` (`0026_lane_widen.sql:709` / `:769`),
`persist_witness_facts` (`0095_f_a1_writer.sql:469`/`486` / `:572`/`612`),
`persist_document_extraction`. **No production path writes a late region.**

**Why that was not enough.** CI 34793833626 shows the refusal's real blast radius: **291 db cells**
red, **289** of them carrying `not a supported writer path` (binding-proposal-pr-1 94,
f-a1-predicate 32, f-a1-dispatch 9, the f-a2-* family ~150), plus the 7 runtime cells. Among them
are cells whose **re-derived verdict was identical** to the recorded one (`unmeasured -> unmeasured`)
— refused because the trigger asked "did this arrive late?" before "did anything change?". A writer
census is the wrong thing to build a wall from: it turns a sequencing convention of the writers into
a law for the whole estate.

**Fix, per the ruling (0191 is absent from main — `git cat-file -e main:…` fails — so this edits an
unmerged file of this wave, not a merged migration).**
`clara._tf_document_region_fact_validate` re-derives at COMMIT and: verdict **unchanged** → writes
nothing, raises nothing; verdict **changed** → **appends the next `revision`** for that
(extraction, check_name). Nothing updated, nothing deleted. `clara.document_fact_validations` gains
`revision int not null default 1 check (revision >= 1)`, which **joins** both unique indexes (a
replayed persist still collides at revision 1), and `clara.get_document_state` takes the highest
revision per (subject, check) — **projected shape unchanged**, so no door reader and no web type
changed. The `when` clause is untouched. The statement side keeps 0038's stricter CLR10 refusal
(merged migration; a declared `line_count` is part of the document as filed, not a derived verdict).
0191's tail now pins the law on the trigger's **own body** (no `raise exception`; must carry the
append) and on `revision`'s place in both unique indexes. ARCHITECTURE §7 + the §11 文件 row
restate it; `firm-scope-db-pins.corpus.ts`'s 0191 sha256 recut to `a370f6cf…`.

**Battery rewritten to the new law — 8 cells, all green:** revision 1 on the supported path; an
unchanged later verdict (`invoice.delivery` = "FREE", no normalisable cents) writes nothing; a
changed one (`invoice.discount` 50.00) appends exactly one revision with the earlier row identical
and the **door** showing only the new one; a non-identity path is not queued; three identity regions
in ONE transaction collapse to ONE revision; the statement refusal; an estate sweep over the
**current** revision plus a 1..n contiguity sweep; firm scope on both lanes. Two fixture premises
were wrong and are now measured, not assumed: `delivery = 0` *does* move `detail` (`delivery_cents:
0` joins it, so it correctly appends), and the discount residual is **−5000** (computed − total).

**Evidence, rigw2b, exact 27 gate flags from `packages/db/package.json`:**
`document-fact-validation-belt` **8/8** · `binding-proposal-pr-1` **111/111** · `f-a1-predicate`
**33/33** · `f-a1-dispatch` **11/11** · all 18 `f-a2-*` **241: 238 pass / 0 fail / 3 skip** ·
`document-capability-registry` + `field-path-grammar` + `document-filing-conflict` +
`accounting-plans` + `accounting-plan-occurrences` + `operation-census` + `knowledge-records` +
`periodic-adjustment` **119/119**. Runtime (PG env): `f-a1-pr3a-consumers` **9/9**, and with
`document-facts-validation-db` + `document-capability-drift-db` + the three `f-a1-witness-*`
**52: 51 pass / 1 pre-existing skip**; `structured-worker-cell-ref` **8/8**. Web
`firm-scope-db-pins` **22/22**.

**Production impact:** none for existing writers — the belt stays a silent no-op when header and
regions share a transaction. What changes is that an unknown or future writer landing a late
identity region now gets a new measurement instead of a failed write, and the door shows the current
one.

**The testkit change stands** (eab88531 + 9f01e8b4): it is now about fidelity, not permission. The
old seeding would no longer fail, but it would leave the rig a two-revision history (revision 1
`unmeasured/no_total_persisted`, revision 2 once the first region lands) that no production persist
can produce.

## Regression 2 — `reconcile-fa-unit.test.mjs:264` (unchanged by the ruling)

**Cause: the cell's spy, not the wiring.** It matched a bare `/to_regprocedure/`. #640 registered
`reconcilePlanOccurrences` unconditionally (`reconciler.mjs:721`) and its feature-detect
(`plan-occurrences.mjs:79-84`) is also a `to_regprocedure` read. Measured on the not-due sweep with
the cell's own mock: `faOk: undefined`, `beltErrors: []`, and the only `to_regprocedure` query names
`clara.wake_due_plan_occurrences(integer,text)`. The due gate (`reconciler.mjs:717`) is intact.

**Fix:** the cell matches `run_depreciation_period` — the FA belt's own door, in both its probe and
its run verb, so the negative is stronger than before. Identical to the repair
`reconcile-adjustments-unit.test.mjs:349` already carried for the D-b twin. **No production code
changed.** `reconcile-fa-unit` **17/17**; #640's four neighbours **74/74** (its own branch count);
with `ready` **115/115**.

## The three CI-only runtime reds — NOT the belt

`c5cv.12` CLR09 "the required legal agreements are not accepted" · `c5cv.13` CLR09 "that terms
version is no longer the published one" · `c5db.5` 23505 on `uq_legal_documents_published`. The db
suite's `cc.10` (`checkout-convergence.test.mjs`) carries the same CLR09 — 3 × CLR09 in the log.

**Diagnosis: a cross-package concurrency race on global legal state — not Linux, not network.**
`clara.legal_documents` has **no firm_id**, and `uq_legal_documents_published`
(`0185_legal_acceptance.sql:259`) is a partial unique index on `(kind) where status='published'` —
one published Terms/DPA per **database**. Six test files across two packages publish into it
(`checkout-gate-c1`, `checkout-gate-c3`, `legal-acceptance`, `web-reads-and-doors`,
`c5-stripe-convergence-db`, `c5-stripe-webhook-db`), each doing `update … set status='superseded'`
then `insert … 'published'` in **separate autocommits** (e.g. `c5-stripe-webhook-db.test.mjs:325-345`).
`.github/actions/db-estate-suite/action.yml:57` runs `pnpm -r --if-present test` against one
`clara_ci`, and the log shows `packages/db test:`, `packages/runtime test:` and `apps/web test:`
output interleaved within the same second (log lines 7255-7262). Two publishers racing give exactly
the three shapes: 23505 between the supersede and the insert; CLR09 when another suite supersedes
the version this fixture just accepted. The action's own comment ("pollution-proof by construction
— they stage their own fixtures") is true of firm-scoped fixtures and **false** of this table.

**Not fixed, and why it is not bounded.** An advisory lock around supersede+publish would close the
23505 but not the CLR09s — there the accepted version genuinely stops being current. The real fixes
are CI-shaped: serialise the packages (`--workspace-concurrency=1`) or give each package its own
database. Both change every package's CI runtime and touch CI wiring another worker is working in,
so I left them. Worth its own issue.

## Gates

`pnpm typecheck` Done (apps/web + packages/runtime) · `pnpm lint` **exit 0** · worktree clean.
apps/web suite not run (no web source change; only the corpus sha pin, covered by
`firm-scope-db-pins` 22/22).

**Unverified:** anything hosted. Every count is local against rigw2b.
