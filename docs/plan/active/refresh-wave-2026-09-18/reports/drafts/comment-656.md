Landed on `impl/656-opening-ledger`, merged into `integration/wave-2026-09-18` at `a01d6693`, then into `main` via PR #954, merge commit `ede1df83` (2026-09-19T13:59Z); migration `0228_opening_ledger_source.sql`. **All evidence below is LOCAL; hosted evidence pending — stays open until the hosted release.**

The `opening_tb.line` producer now has a caller: wired in-line at the OCR pass, the create dialog binds a filed document, "Read this document" calls the runtime route, and a tied basis renders provenance (document, sha-12, region) per figure. Fix round 1 closed a computed-and-discarded refusal (a REFUSED trial balance no longer looks like one that was never a trial balance) and finished the browser walk (1/7 → 7/7: four app/fixture defects plus one spec defect). Three brief instructions were reported measurably wrong rather than forced: `prior_gl`'s registry level, the period-wall recut, and "unmapped"'s shape.

**AC / historical rows**

| Row | State | Evidence |
|---|---|---|
| AC1 discover producer, preserve ambiguity | Done, narrowed | `0228`; `p656.registry.prior_gl_operation`; `prior_gl` held at `stored_only` (ratified §6.2.1) |
| AC2 ingest source, exact-cent, zero rejection | Done | `opening-tb-produce.test.mjs` 17/17; `p656.tie.fact_must_match`; World leg reads a 5-line TB |
| AC3 commit once under current rules | Verify-only | `p656.seed.duplicate_and_cancelled`, `.replay`, `p656.period.closed_fy` |
| AC4 unsupported rows stay explicit Work children | Partial (D13.2) | Refusal end to end (`opening_tb_refusal`→422 verbatim); `p656.tie.fact_must_match`=0 rows; **no `accounting_work` row** |
| AC5 provenance/totals/discrepancy/Work+receipt | Partial + descoped | Provenance/totals/discrepancy done; **Work+receipt descoped** — residual R1 |
| AC6 full state ladder, 320px/200%/kbd/SR | Done (fix round) | walk 7 passed (21.7s), 0 fixme; 32/32 web batteries |
| AC7 production read/command, real roles | Done | `opening-ledger-source-e2e.mjs` PASS, 5/5/5 |
| CB-AE2E-004 | Verify-only | `0171` re-read in 0228; dialog carries standing refusal |
| C-25 empty green-light gate | Verify-only | `opening-dryrun-unchanged.test.tsx`; coverage ≠ tie asserted |
| C-30 opening TB producer | Done — spine | producer has a caller; frozen-checks OK |
| C-39 five capability gaps | Partial, deliberately | document flow = this slice; "plus Clara" = contract + F3 |
| COA before cancelled onboarding | Verify-only, no repair | `0173:8-16` unchanged; affected-row count hosted pending |
| C08.4 mixed batch + provenance | Done (fix round) | 1 unreadable row ⇒ 0 targets + refusal; every target renders provenance |
| C08.7 successor discovery | Verify-only + follow-up | `SeedingBatchesPanel.tsx`; gap named in registry `limits`, filed F1 |
| C33.9 aggregate discovery | Verify-only, not reproduced | `opening_items`=0 rows; historical figure only |
| C88.1 opening-position ambiguity | Verify-only | 3 branches untouched; leg reaches `?tab=opening`; #649 link read-only |

**Rulings.** D13 (§0): read program lands at the OCR pass, whole-document refusal names every line, registry → v2, no dialog entrance this wave. §6.1: whole-registry republication to v2 approved (UPDATE, never delete-then-insert). §6.2.1: `prior_gl.business_operation` stays `stored_only`, truth in `limits` — **ratified, D13 amended**, follow-up F6. §6.2.2: fix-round A3 defect count corrected (four app/fixture + one spec), Fix round 2, text-only.

**Integration and successor cut.** Integration re-ran the `opening-ledger-source` DB battery clean (12/0/0) and `opening-ledger-source-e2e` PASS end to end; the walk was not among integration's 3 browser failures. `serve-built.mjs` dispatch stayed semantic (#656's arm above the home-board catch-all, §6.1). **No successor cut landed**: `read_opening_source` stays contract-only — no row in DECISIONS §1.2, `successors-final.md` asserts its absence by name; not in `chatTurn_v21` or `claraWork_v5`.

**Residuals — follow-ups to be filed.** F1 a browser entrance to `POST /api/seeding/prepare`; F2 decide what a Work-shaped opening record is, or rule none; F4 make a re-read document re-parsable; F5 give the closed-period refusal the opening basis's own words; F6 reconcile the registry's `business_operation` levels.

**Blueprint drift (for #683's sync).** `PRD.md:108` — 客户建立与期初导入 listed under delivered; the import half was unreachable from a browser before this merge — now true, needs a qualifier not deletion. `ARCHITECTURE.md:207-211` — calls `opening-tb-cells.mjs` the real producer, marked hosted-evidence-pending; nothing called it before, now true. `ARCHITECTURE.md:535` — one §7 row carries two subjects under `<!-- #764 -->`, contradicting §5.A's `<!-- #821 -->` at `:276-283`; needs a doc-sync ticket.

**Verify locally.**
```sh
node --test --test-concurrency=1 <41 gate imports> packages/db/tests/opening-ledger-source.test.mjs packages/db/tests/document-capability-registry.test.mjs   # 31/31
node --test packages/runtime/tests/opening-tb-produce.test.mjs packages/runtime/tests/wave-b-opening-parse.test.mjs   # 34/34 (17+17)
node packages/runtime/tests/opening-ledger-source-e2e.mjs   # PASS, real Postgres roles
pnpm --filter @clara/web e2e opening-ledger-source --reporter=line --workers=1   # 7 passed
```
