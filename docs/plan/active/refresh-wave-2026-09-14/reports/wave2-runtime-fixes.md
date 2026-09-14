# Wave-2 runtime-suite fixes — #624 belt red, #640 sweep red

Branch `integration/wave-2`, worktree `C:\Users\zhant\Desktop\clara-wt\integration2`.
Two commits on top of `193bddf2`; worktree CLEAN; nothing pushed, no PR, no migration edited.

```
6664a6c6 fix(runtime): #640 — the plan belt's probe no longer trips the FA due gate
eab88531 test(runtime): #624 — the legacy invoice-facts testkit seeds through the supported writer path
```

## Regression 1 — cells 312–318, `f-a1-pr3a-consumers.test.mjs`

**Cause.** `packages/runtime/tests/f-a1-pr3a-testkit.mjs` (pre-fix lines 55–72 `seedLegacyInvoiceFacts`,
79–106 `seedWitnessPair`). Each `fx.rootQuery` is its own pool checkout and its own autocommit
(`relay-fixtures.mjs:41-68`), so the extraction header committed alone, its recorder trigger wrote
the invoice-identity verdict against **zero** regions, and the `invoice.total` region then arrived in
a LATER transaction. 0191's region-side belt (`0191_document_capability_registry.sql:964-993`,
`clara._tf_document_region_fact_validate`) refused it: CLR10 `fact_validation_would_go_stale`,
`(unmeasured -> unmeasured)` — outcome equal, `detail` moved (`no_total_persisted` →
`net_or_tax_not_persisted`). All seven DB cells died in the seeders, not in what they assert.

**Is a production path affected? No.** Re-censused every writer of `clara.document_regions`:
`git grep "insert into clara.document_regions" -- packages apps scripts` outside
`packages/db/migrations` returns **only** test fixtures (9 files, all `packages/runtime/tests`).
`packages/runtime/lib` and `packages/runtime/workflows` contain no direct region INSERT at all —
they call the doors, and each door inserts header **and** regions in one function body, so one
transaction: `persist_invoice_facts` (`0026_lane_widen.sql:709` header, `:769` regions),
`persist_witness_facts` (`0095_f_a1_writer.sql:469/486` headers, `:572/612` regions),
`persist_document_extraction`. The belt is right; the testkit was the unsupported writer.

**Fix.** Both seeders now run header + regions in ONE transaction via a local `rootTx` helper —
the shape `packages/db/tests/document-fact-validation-belt.test.mjs:85`'s own positive control uses.
Same rows, same order (vision before text), same NULL `engine_confidence`; `clock_timestamp()` still
advances per statement inside a transaction, so the cross-regime cells keep distinct `extracted_at`.
0191 untouched.

**Sibling sweep.** The other eight runtime fixtures that insert regions cannot trip the belt: they
insert either against an `ocr` extraction (no validation row is ever recorded — the recorder returns
early for kinds outside `invoice_facts`/`llm_text_facts`) or under non-guarded field paths
(`pages.N.lines.M`, `tin`, `body`, `line`, `opening_tb.line`, `prior_gl.line`); the `f-a1-witness-*`
and `document-facts-validation-db` batteries go through the real `persist_witness_facts` door. Ran
them anyway: **77/77, 0 fail** (`classify-consumer`, `facts-gate-consumer`, `matcher-ab3-adjacency`,
`matcher-attribution`, `s6-matcher-readers`, `statement-layout-supersede`,
`document-facts-validation-db`, `wave-b-opening-parse`, `wave-b-seeding-prepare`).

**Evidence.** `node --test tests/f-a1-pr3a-consumers.test.mjs` (PG env, rigw2/clara_w2) → **9 tests,
9 pass, 0 fail, 0 skip** (7 DB cells + 2 source cells). The belt's own battery, exact 27 gate flags
from `packages/db/package.json`: `document-fact-validation-belt` **6/6**, including cell 2's CLR10
refusal of a lone later region and cell 5's estate sweep ("no validation row disagrees with the rows
it cites") — still green after the run seeded new rows.

## Regression 2 — `reconcile-fa-unit.test.mjs:264`

**Cause.** The cell's own spy, not the wiring. It matched a bare `/to_regprocedure/`
(`reconcile-fa-unit.test.mjs:270,274` pre-fix). #640 registered `reconcilePlanOccurrences`
UNCONDITIONALLY in the sweep (`packages/runtime/lib/reconciler.mjs:721`) and its per-cycle
feature-detect (`plan-occurrences.mjs:79-84`) is also a `to_regprocedure` catalog read — so the
keyword match counted a sibling belt's probe as the FA belt's.

**Measured, not assumed.** Driving `runReconcilerSweep` with the cell's own mock and no `faRuns`
flag: `faOk: undefined`, `beltErrors: []`, and the only `to_regprocedure` query issued names
`clara.wake_due_plan_occurrences(integer,text)`. The FA belt genuinely is not invoked; the due gate
(`reconciler.mjs:717`) is intact.

**Fix.** The cell now matches `run_depreciation_period` — the FA belt's own door, present in both its
feature-detect (`reconciler-fa.mjs:56`) and its run verb — so the negative is stronger than before:
not one FA query of any kind. Identical to the repair `reconcile-adjustments-unit.test.mjs:349`
already carries for the D-b twin; the D-a twin was missed. **No production code changed**, no belt
behaviour changed.

**Evidence.** `reconcile-fa-unit` **17/17**. #640's four neighbours
(`reconcile-adjustments-unit`, `reconcile-belt-isolation-unit`, `reconcile-work-unit`, `reconcile`)
**74/74, 0 fail, 0 skip** — the same 74 that were green on `impl/640-accounting-plans`.
db side: `accounting-plans` + `accounting-plan-occurrences` + `document-capability-registry` +
`field-path-grammar` + the belt battery → **64/64**.

## Suite-level

- `node --test` over `tests/reconcile*.test.mjs` + `tests/f-a1-*.test.mjs` + `tests/ready.test.mjs`
  (15 files, PG env): **207 tests, 206 pass, 0 fail, 1 skip**. The skip is pre-existing
  (`f-a1.pr2.e2 B1 fallback` — "post-0097 the absence window this cell guards is closed"), the same
  one in the orchestrator's own suite log.
- `pnpm typecheck` Done (apps/web + packages/runtime). `pnpm lint` **exit 0**.
- apps/web suite not run: no web file changed.

## Observations (not fixed, no cell asserts on them)

1. The pure FA/adjustment mocks answer **any** `to_regprocedure` with `surface: true`, so the
   unconditional plan belt lights up inside them and, getting no rows for its scan, returns
   `planOk:false` (contained — `beltErrors` stays empty, `log` is a no-op). A mock artefact of a
   fixture that predates the sibling; the #640 worker left the same shape in the adjustment twin, and
   I kept them consistent rather than widening the change. Worth a follow-up if a third belt lands.
2. Every `to_regprocedure` spy in a sweep-level unit test is now vulnerable to the next unconditional
   belt in the same way. Both twins are repaired; a house rule ("spy on your belt's own door") would
   close it for the next one.

**Unverified:** anything hosted. All counts above are local, against rigw2
(`127.0.0.1:55453/clara_w2`); the rig was never reset and no reset/role-sweep flag was set.
