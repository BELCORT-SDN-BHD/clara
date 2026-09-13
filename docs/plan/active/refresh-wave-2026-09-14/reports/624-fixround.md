# #624 fix round — final report

Branch `impl/624-document-capability`, worktree `C:\Users\zhant\Desktop\clara-wt\624`. Rig **rig624b** (`127.0.0.1:55442/clara_624`) dropped and re-created from scratch on the FINAL migration (183 files, 266 s); `rig624` only queried, never reset; no reset/role-sweep flag ever set. Worktree clean; nothing pushed, no PR, no other worktree touched.

This round, newest first (`148da420` and below predate it):

```
b5673a01 test(web): repin 0191's dynamic-SQL barrier
6bf14ade fix(db):   prestate names both refusal causes
77922e5a docs:      ARCHITECTURE §7/§11
5d80b023 test(db):  the validation/evidence invariant; census corrections
25879d31 fix(db):   0191's fix round finished
56b10457 fix(runtime): the XLSX `r=` clamp
```

## Finding → what I did → evidence

| # | Finding | What I did | Evidence |
|---|---|---|---|
| **B** | **BLOCKER.** `sheets.<s>.<r=>` fed `A1:B1`/`$A$1`/junk to the grammar → CLR10 → rollback → task stays `running` → lane retries until the attempt cap burns | `normalizeCellRef` admits `^[A-Za-z]{1,3}[0-9]{1,7}$` only, else an ordinal; value kept, raw `r=` kept in `locator.declared_ref` | `runtime/tests/structured-worker-cell-ref.test.mjs`. **Red first** 5/8 fail, BLOCKER cell naming `"A1:B1" -> "sheets.0.A1:B1" (field_path_syntax)`; **8/8** after |
| **S1** | 0177 ceremony half-done: pre-image sha pinned, result left to substring probes | Post-image sha pinned. Both verified: installed body hashes `0230031f…`; reversing the one splice reproduces pre-image `8ba95a52…`, one occurrence | node+pg on rig624; 0191's postcheck then passed on rig624b |
| **S2** | `document_fact_validations` RLS used `actor_firm_id()` = `coalesce(wake_firm(), jwt_firm())`, which 0002:440-443 forbids as authorization | Per-lane split (0007:788-791): `jwt_firm()` human, `wake_firm()` agent; tail expects 3 policies | 0191 tail (5) green |
| **S3** | Identity trigger read the QUEUED snapshot; `max(...) filter` with no cardinality could record `pass` on a shape `evaluate_witness_fact_state_v1` refuses; and no row at all when no total landed, so `validations: []` ≡ "not evaluated" | `clara._invoice_identity_verdict(uuid)`: re-queried by id, 0092's exactly-one/at-most-one mirrored, always one row with a named `unmeasured` reason | belt cell 1 (record ≡ re-derivation, terms included) |
| **S4** | Dead `unmeasured` arm on `statement.chain_closes` over NOT NULL columns (0038:383-384) | Removed; printed-totals keeps its real `not_applicable` arm | runtime validation battery 6/6 |
| **S5** | Tail write sweep asymmetric (all privileges only for `clara_authenticated`, none for `clara_runtime`) | 3 roles × 4 privileges, TRUNCATE included | 0191 tail (5) green |
| **INV** | **Invariant pin.** 0191 cited `document-fact-validation-belt.test.mjs`; it did not exist | Wrote it. Invariant: *a validation row measures the rows it cites and stays one* — a child row landing in a LATER transaction than its header is not a supported writer path, and both sides refuse it | **5/5**: supported path agrees; lone later `invoice.discount` region REFUSED CLR10 `fact_validation_would_go_stale`; lone later `pages.1.lines.0` admitted **and provably cannot move the verdict**; 0038's belt refuses a chain-NEUTRAL pair of later lines; estate sweep clean |
| O1 | `C<n>` fallback collides with the address C3; no unique index on `(extraction_id, field_path)` → two regions claiming one cell | `cell_<n>`: an underscore cannot occur in an A1 ref | cell-ref cells 3, 7, 8 (5,000 cells) |
| O2 | `declared` captured then dropped — the comment's promise to keep the raw `r=` was false | `locator.declared_ref`, only when the clamp rejected it | cell-ref cell 5 |
| O3 | `structured-worker.mjs` throws on import outside a worker, so the exported fix was unreachable by any test | Entry guarded `if (parentPort)`; two helpers exported | battery imports it; worker-path/intake-recovery/ingest-v2 47/47 |
| O4 | Census gaps: `invoice.myinvois_longid` (allowlist 0009:2096) absent; `invoice.grand_total` credited to `TOTALS_FIELD_PATHS`, which lacks it | Added the first, re-attributed the second to its real caller; probe counts derived not hand-kept | db batteries 43/43 |
| O5 | Two literal NUL bytes made an 18 KB test file binary to git — no reviewable diff | Written as `\u0000` | file is text; cells still pass |
| O6 | Belt queued for EVERY region: a 50,000-cell XLSX puts 50,000 entries on the deferred queue at COMMIT for a verdict that pair cannot have | `when` naming the seven identity terms (PG evaluates it at the row operation) | probed on PG17; belt cells 2–3 |
| O7 | Prestate said "widen the roster" — wrong on a rig. After the F-A1 battery, 42 regions are named `ocr_total`, `ocr_net`, …; `db:migrate` applies only pending files, so a rig at 0187 that ran the suites is refused | Message names both causes and each answer; prestate also asserts `clara_runtime` exists | reproduced on rig624b; re-applied clean |
| O8 | `firm-scope-db-pins.corpus.ts` hashes the whole migration; the fix round left it stale (2 web reds) | Repinned `a230a03b…`; reason states the post-image sha | `firm-scope-db-pins.test.ts` **22/22** |
| O9 | Header claimed `r=` is interpolated verbatim (now false) and every namespace has a producer (`statement` has none) | Corrected in 0191, the grammar battery, ARCHITECTURE §7 | — |

Checked, already correct: single-anchor splice (counted, exactly 1); owner/ACL/DEFINER/search_path postcheck; `packages/db/deploy/0191-field-path-census.sql` exists and is read-only (0 write verbs).

## Verification — all local; hosted pending

- **db** rig624b, exact gates from `packages/db/package.json`, the five batteries above — **43/43, 0 fail, 0 skip**.
- **runtime** rig624b, seven files incl. facts-validation-db and cell-ref — **72/72**.
- **web unit touched** 37/37; db-pins 22/22. `pnpm typecheck` green; `pnpm lint` **exit 0**.
- **Whole apps/web suite** (9m26s): **3400 tests, 3396 pass, 4 fail, 0 skip**. Two were O8 (fixed). The others — `onboarding-checklist` CB-AE2E-023, `checkout-faces-a11y` "the bounded wait RE-READS THE SERVER" — are real-timer cells in untouched files, **39/39 in isolation**: load flakes, named not fixed. #707/#693 absent.
- **Walk** `documents-viewer-walk` (3180/3181/3182): 9 passed / 3 failed; the #624 cell passed. The three (two `signIn` waits on `navigation[name=Main]`, one click timeout) re-ran targeted **3/3**. No web source changed this round: flakes, not regressions.

## Assumptions, follow-ups, unverified

- **Assumption**: `statement` stays in the grammar though nothing writes `statement.*` — the brief's seam 2 requires it. Named as an exception, not defended silently.
- **Follow-up (issue)**: test fixtures (`f-a1-witness-fixtures.mjs` `ocr_*`; `seedRegion`'s bare `total`) insert out-of-grammar paths directly, so 0191 cannot apply to a rig that ran the suites first. Harmless in CI/hosted; moving them to `pages.1.lines.N` closes it.
- **Unverified**: anything hosted. The release still owes the census SQL before 0191, in the writer-quiescence window. The previous worker's web commits were re-run, not re-reviewed.
