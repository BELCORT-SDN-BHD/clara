# #624 fix round — final report

Branch `impl/624-document-capability`, worktree `C:\Users\zhant\Desktop\clara-wt\624`. Rig **rig624b** (`127.0.0.1:55442/clara_624`), dropped and re-created from scratch on the FINAL migration (183 files, 266 s). `rig624` was only queried, never reset; no reset/role-sweep flag was ever set. Worktree clean; nothing pushed, no PR, no other worktree touched.

`git log --oneline main..HEAD` — `148da420` and below predate this session:

```
b5673a01 test(web): repin 0191's reviewed dynamic-SQL barrier, and say what the postcheck now pins
6bf14ade fix(db):   0191's prestate names the two causes of a field-path refusal, and checks the role its tail sweeps
77922e5a docs:      ARCHITECTURE §7/§11 record the clamp and the region-side belt
5d80b023 test(db):  pin the validation/evidence invariant on both sides, and correct the field-path census
25879d31 fix(db):   0191's fix round finished: post-image sha pin, per-lane RLS, one identity reader, the region-side belt
56b10457 fix(runtime): the XLSX `r=` attribute is clamped where the field_path is born
```

## Finding → what I did → evidence

| # | Finding | What I did | Evidence |
|---|---|---|---|
| **B** | **BLOCKER.** `sheets.<s>.<r=>` fed `A1:B1`/`$A$1`/junk to the grammar → CLR10 → rollback → task stays `running` → the lane retries until the attempt cap burns | Clamped at the producer: `normalizeCellRef` admits `^[A-Za-z]{1,3}[0-9]{1,7}$` only, else the ordinal. Value kept; raw `r=` kept in `locator.declared_ref` | `runtime/tests/structured-worker-cell-ref.test.mjs`. **Red first**: 5/8 fail, BLOCKER cell naming `"A1:B1" -> "sheets.0.A1:B1" (field_path_syntax)`; **8/8** after |
| **S1** | 0177 ceremony half-done: pre-image sha pinned, result trusted to substring probes | Post-image sha pinned. **Both verified**: installed body hashes `0230031f…`; reversing the one splice out of it reproduces pre-image `8ba95a52…`, one occurrence | node+pg on rig624; the migration's own postcheck then passed on rig624b |
| **S2** | `document_fact_validations` RLS used `clara.actor_firm_id()` = `coalesce(wake_firm(), jwt_firm())`, which 0002:440-443 says must never carry authorization | Split per lane (0007:788-791): `jwt_firm()` human, `wake_firm()` agent; tail expects 3 policies | 0191 tail (5) green on rig624b |
| **S3** | Identity trigger read the QUEUED snapshot and used `max(...) filter` with no cardinality — could record `pass` on a shape `evaluate_witness_fact_state_v1` refuses — and wrote no row at all when no total landed (`validations: []` ≡ "not evaluated") | `clara._invoice_identity_verdict(uuid)`: re-queried by id, 0092's exactly-one/at-most-one mirrored, always one row with a named `unmeasured` reason | belt battery cell 1 (record ≡ re-derivation, terms included) |
| **S4** | Dead `unmeasured` arm on `statement.chain_closes` over NOT NULL columns (0038:383-384) | Removed; printed-totals keeps its genuine `not_applicable` arm | runtime validation battery 6/6 |
| **S5** | Tail write sweep asymmetric (3 privileges for `clara_authenticated`, INSERT only for `clara_agent_ro`, nothing for `clara_runtime`) | 3 roles × 4 privileges, TRUNCATE included | 0191 tail (5) green |
| **INV** | **Invariant pin.** 0191 cited `document-fact-validation-belt.test.mjs`; it did not exist | Wrote it. Invariant: *a validation row measures the rows it cites and stays one*; a child row (region/line) arriving in a LATER transaction than its header is not a supported writer path, and both sides refuse it | **5/5**: supported path agrees; lone later `invoice.discount` region REFUSED CLR10 `fact_validation_would_go_stale`; lone later `pages.1.lines.0`/`sheets.0.A1` admitted **and provably cannot move the verdict**; 0038's belt refuses a chain-NEUTRAL pair of later lines on line_count; estate sweep finds no stale row |
| O1 | `C<n>` fallback collides with the ordinary address C3; no unique index on `(extraction_id, field_path)` (0007) → two regions claiming one cell | Fallback `cell_<n>` — an underscore cannot occur in an A1 ref, so the namespaces are disjoint | cell-ref cells 3, 7, 8 (5,000-cell scale) |
| O2 | `declared` was captured then dropped; the comment's promise that the locator keeps the raw `r=` was false | `locator.declared_ref`, present only when the clamp rejected the claim | cell-ref cell 5 |
| O3 | `structured-worker.mjs` throws on import outside a worker (`workerData` null → catch calls `parentPort.postMessage`), so the exported fix was unreachable by any test | Entry guarded `if (parentPort)`; `valuesFromSheet`/`sheetCellRegion` exported | the battery imports it; `worker-path`/`intake-recovery`/`document-ingest-v2` 47/47 |
| O4 | Census incomplete/mis-attributed: `invoice.myinvois_longid` (live allowlist, 0009:2096) absent; `invoice.grand_total` credited to `TOTALS_FIELD_PATHS`, which lacks it | Added the first; re-attributed the second to its real caller (an f-a1 fixture, deliberately outside the closed set); probe counts derived, not hand-maintained | db batteries 43/43 |
| O5 | `document-capability-registry.test.mjs` held two literal NUL bytes → git called an 18 KB test binary, no reviewable diff | Same behaviour as `\u0000` | file is text; its 16 cells still pass |
| O6 | Region belt queued for EVERY region: one 50,000-cell XLSX puts 50,000 entries on the deferred-trigger queue at COMMIT, on the hot ingest path, for a verdict that pair can never have | `when` naming the seven identity terms (PG evaluates a constraint trigger's `when` at the row operation, not at fire time) | probed on PG17 first; belt cells 2 and 3 walk both sides |
| O7 | Prestate said "widen the roster" — the wrong answer on a rig. Measured: after the F-A1 battery, 42 regions named `ocr_total`, `ocr_net`, … (fixtures insert straight into the table; `seedRegion` defaults to a bare `total`). `pnpm db:migrate` applies only pending files, so a rig at 0187 that ran the suites is refused | Message names both causes and each answer; prestate also asserts `clara_runtime` exists, since the tail sweeps it | reproduced on rig624b; re-applied clean from scratch |
| O8 | `firm-scope-db-pins.corpus.ts` hashes the whole migration; the fix round left the pin stale (2 web reds) | Repinned `a230a03b…`; reason now states the post-image sha | `firm-scope-db-pins.test.ts` **22/22** |
| O9 | Header claimed `r=` is interpolated verbatim (now false) and "ten namespaces, each with a named producer" (`statement` has a reader, no writer) | Corrected in 0191, the grammar battery and ARCHITECTURE §7 | — |

Checked and **already correct**: single-anchor splice (counted, exactly 1); owner/ACL/DEFINER/search_path postcheck; `packages/db/deploy/0191-field-path-census.sql` exists and is provably read-only (0 write verbs).

## Verification — all local; hosted evidence pending

- **db**, rig624b, exact gate flags from `packages/db/package.json`: `field-path-grammar`, `document-capability-registry`, `document-filing-conflict`, `wave-a2-attribution`, `document-fact-validation-belt` — **43/43 pass, 0 fail, 0 skip**.
- **runtime**, rig624b: `document-facts-validation-db`, `document-capability-drift-db`, `structured-worker-cell-ref`, `document-ingest-v2-db`, `document-ingest-v2`, `worker-path`, `intake-recovery-unit` — **72/72**.
- **web unit (touched)**: state panel + workbench-refresh + `document-state` + facts-table 37/37; db-pins 22/22.
- **Whole apps/web suite** (`node scripts/run-tests.mjs`, 9m26s): **3400 tests, 3396 pass, 4 fail, 0 skip**. Two were O8 (fixed, repin verified). The other two — `clara/onboarding-checklist.test.tsx` CB-AE2E-023 and `entry/checkout-faces-a11y.test.tsx` "the bounded wait RE-READS THE SERVER" — are real-timer assertions in files this branch does not touch and **pass in isolation (39/39)**: load flakes, named not fixed. #707/#693 did not appear.
- `pnpm typecheck` green; `pnpm lint` **exit 0** (db, web incl. contrast/manifest/message-key gates, runtime, reporting-render).
- **Browser walk** `documents-viewer-walk` (3180/3181/3182): 9 passed / 3 failed (6.2 m). The #624 cell — four states independent, failed arithmetic named without hiding the fact — **passed**. The three failures are two `signIn` waits on `navigation[name=Main]` and one "Confirm & file" click timeout; re-run targeted, **3/3 pass (3.5 m)**. No web source changed this round, so: load flakes, not regressions.

## Assumptions, follow-ups, unverified

- **Assumption**: `statement` stays in the grammar although no writer emits `statement.*` today — the brief's seam 2 requires `statement.closing_balance` to persist. Recorded as a named exception, not silently defended.
- **Follow-up (file an issue)**: *test fixtures emit out-of-grammar `field_path` values.* `f-a1-witness-fixtures.mjs` (`ocr_*`) and `rig-docs-fixtures.mjs`'s `seedRegion` (bare `total`) insert directly into `clara.document_regions`, so 0191 cannot be applied to a rig that ran the suites first. Harmless in CI and hosted; costs a developer an hour. Moving them onto `pages.1.lines.N` closes it.
- **Follow-up**: the belt re-derives per queued row — at most seven per extraction with the `when`, but a future check over a wider path set should revisit it.
- **Unverified**: anything hosted. The release still owes the census SQL before applying 0191, inside the writer-quiescence window. The previous worker's web commits were re-run, not re-reviewed.
