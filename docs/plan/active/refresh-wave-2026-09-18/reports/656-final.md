# #656 — 导入并核对有来源的期初总账 · final report

**Branch** `impl/656-opening-ledger` · worktree `C:\Users\zhant\Desktop\clara-wt\656` · HEAD `d94e6580` · 7 commits

```
d94e6580 test(web): #656 the opening walk is a PARTIAL, and says so in its own header
8da7bdcb fix(db): #656 0228 writes its thirteen pins longhand — dynamic SQL is refused by this estate
e34fa88b test(runtime,web): #656 the real-Postgres leg AC7 owes, and the first walk ever to reach ?tab=opening
1e2022ec feat(web): #656 the opening basis gets a source, an entrance and a provenance a person can trace
3e6d7d86 fix(runtime): #656 two refusals the in-line producer makes reachable stop being a 500 and a lie
60cb6004 feat(db): #656 migration 0228 republishes the capability registry at version 2, with the battery it forces
4deb9f07 feat(runtime): #656 wire the opening trial-balance producer in-line at the OCR pass
```

Local evidence only, on rig `clara_656` (220 migrations). **Hosted evidence pending.**

## The headline, in one paragraph

The `opening_tb.line` producer had no caller and the consumer had no browser. Both halves now
join: `lib/opening-tb-produce.mjs` is wired **in line** at the OCR pass (D13.1), the create dialog
binds a filed document, "Read this document" calls the runtime route, and a tied basis renders its
targets with the document, the sha-12 and the region each figure came from. Three things I was told
to do turned out to be measurably wrong on the rig and are reported as such rather than forced:
`prior_gl`'s level, the period-wall recut, and the shape of "unmapped".

## Per acceptance criterion

| Row | Result | Evidence |
|---|---|---|
| **AC1** census → registry | **done, narrowed** | `0228` + `p656.registry.prior_gl_operation` / `.no_app_write`. `opening_balance_doc` × 6 azure-di formats → `typed_facts`+`business_operation` = `supported`. `prior_gl` × 7 → basis corrected + `limits {"browser_entrance":"absent"}`, **level HELD** (see Assumptions 1). Follow-ups filed below. |
| **AC2** ingest a representative source | **done** | `opening-tb-produce.test.mjs` 10/10; `p656.tie.parsed_writer_only` / `.fact_must_match`; World leg reads a 5-line TB end to end. Exact-cent balance and zero rejection were already law (`opening-tb-cells.mjs:405-432`) — **no refusal law was relaxed**. |
| **AC3** commit once under current rules | **verify-only, re-measured** | `p656.seed.duplicate_and_cancelled` (CLR31 `duplicate_seed`; cancel frees the slot), `p656.seed.replay` (byte-identical, no second target), `p656.period.closed_fy` (the period answer — see Assumptions 2). |
| **AC4** unsupported rows stay explicit | **partial, per D13.2 — corrected in the fix round** | All-or-nothing now proved END TO END, not three disconnected ways: the producer's refusal rides the extraction envelope (`opening_tb_refusal`), `readOpeningRefusal` reads it back, and a REFUSED trial balance answers 422 with the reader's sentence VERBATIM instead of the keyed-fallback token — measured over the real writer in `wave-b-opening-parse.test.mjs`'s A1 cell (A/B/C are three different outcomes) and rendered as a warning by `opening-parse-action.test.tsx`. Before the fix round the refusal was computed and discarded, so a trial balance that does not balance was offered as one to hand-key (review finding A1). `p656.tie.fact_must_match` still counts **zero** rows after each refusal. **No `accounting_work` row, no new needs-you kind.** |
| **AC5** provenance, totals, discrepancy, Work+receipt | **partial + 1 descoped (authority)** | Provenance: `OpeningTargetDocumentPanel` + `provenanceOf` (8 cells). Coverage totals: counts **and** cents, both sides, **no percentage**, in the panel footer — never in `OpeningDryrunStrip`. Exact discrepancy: `get_opening_dryrun`, unchanged. **Work and receipt: descoped (authority)** — residual R1. The read action is **plain**, not gated. |
| **AC6** full state ladder, 320px, 200%, keyboard, SR | **done in the fix round — the browser proves it** | `pnpm --filter @clara/web e2e opening-ledger-source --reporter=line --workers=1` → **7 passed (21.7s)**, every leg live, none `fixme`. The six legs that were `test.fixme` in the first cut hid FOUR defects, three of them in the app: the workbench's combined read 404'd on a seed-scoped relation the mock guarded by client (fixture); the settled read outcome was UNMOUNTED by the reload that follows a successful read (AC5's persistence law); the panel was mounted with `documentName={null}` so provenance read the sha twice; and the dry-run strip rendered its refusal token at `opacity-70` — 3.33:1, below WCAG AA, caught by axe on three legs. Plus 5 web batteries (31 cells) at node level. |
| **AC7** production-facing read/command, real roles | **done — the named hole is closed** | `packages/runtime/tests/opening-ledger-source-e2e.mjs` PASSES: real Azure payload → real `normalizeAzureLayout` (producer inside) → real `persist_document_extraction` → real authority trigger → real `parseOpeningTargets` on a `clara_runtime` connection → real `record_opening_targets_parsed` → real `approve_opening_seed` → finalized basis, 5 approval rows, and `clara.trial_balance_as_of` answering cent-for-cent. **No Workflow leg owed**, measured: `grep -l "opening_seed\|opening_tb" packages/runtime/workflows/*` is empty. |
| **CB-AE2E-004** | **verify-only, re-measured** | `0171`'s proconfig pin re-read in 0228's prestate/tail; the create dialog now carries the register's standing refusal (it was the last opening dialog without one), so a refusal renders beside the picked document rather than behind the backdrop. |
| **C-25** empty green-light gate | **verify-only, re-measured** | `opening-dryrun-unchanged.test.tsx`: the four gates keep the DB's order and tokens (OBE keeps its **distinct** token), an empty basis is not ready, a dry-run read FAILURE renders through the error branch and paints no `✓`, and **coverage ≠ tie** is asserted directly (a fully-mapped source still failing the tie). The browser re-measure of it is in the RED walk (F7). |
| **C-30** opening TB producer | **done — the ticket's spine** | The producer has a caller. `check-frozen-workflows.mjs` and `check-parts-parity.mjs` both OK. |
| **C-39** five capability gaps | **partial, deliberately** | Document-supported opening flow = this slice's direct UI. "plus Clara" = the successor contract below + follow-up F3. Remap/schedule history = unchanged (verify-only; no assets authored). |
| **COA seeded before cancelled onboarding** | **verify-only, no repair** | Structural closure unchanged (`0173:8-16`); the affected-row COUNT is **hosted evidence pending**; no repair migration shipped. |
| **C08.4** mixed batch + provenance | **done, reading fixed by D13.2** | One unreadable row ⇒ **zero** targets + a refusal naming it (`p656.tie.fact_must_match`, producer cells); every recorded target renders its provenance. |
| **C08.7** SeedingProposalRow successor | **verify-only + follow-up F1** | Successor is `apps/web/components/reports/SeedingBatchesPanel.tsx`; nothing rebuilt, nothing restored by name. The ownerless gap (no browser entrance to `POST /api/seeding/prepare`) is now **named in the registry** and filed. |
| **C33.9** +7,850,406 cents aggregate | **verify-only (discovery), recomputed** | On `clara_656`: `opening_items` = **0 rows, net 0, 0 `obe_plug`**. The historical figure is **not** reproduced locally and is carried as a historical claim only; the hosted recompute is release-time work. |
| **C88.1** opening-position ambiguity | **verify-only, re-measured** | The gate's three branches are untouched; the walk's live leg reaches `?tab=opening`; the client-Home link (#649) is followed **read-only** — `components/firm/client-home/*` not opened. |

## Measurements that changed what was built

- **`p656.m1`** — 240 rows, `count(distinct registry_version)=1`, `min=max=1`. Behaves exactly as DECISIONS §6.1 reads it, so the whole-registry republication stands. No STOP.
- **`p656.m2`** — `_tf_set_authoritative_extraction_0017`'s pointer is document-wide `(extracted_at,id)`-max, **kind-blind** (live body read). A later run of ANY kind takes it. Proved behaviourally by `p656.tie.stale_extraction` and by the runtime's re-read cell.
- **`p656.m3`** — **the brief's reading was wrong in the safe direction.** Drafting an opening item into a CLOSED fiscal year is refused `CLR19 write_into_closed_period` by **`clara._tf_period_wall_lines()` on `clara.journal_lines`, at the DRAFT** — not by `t_period_wall` at the approval. `approve_opening_seed` has no period guard of its own and never needs one. **So 0228 writes NO recut** (§2 row 0228's conditional arm is not taken). Residual R2.
- **`p656.m4`** — thirteen live pins measured off `pg_proc`; `_draft_opening_item_core`'s live signature is `(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)`, not the brief's elided one.
- **`p656.m5`** — `clara.list_activity`'s live body **never mentions the opening lane at all** (`/opening/i` no match). `opening_seed.batch_approved` is filed nowhere by it. Ladder not recut (#861). Residual R3.
- **`p656.m6`** — `opening_tb.line` regions on the rig: 12 before this slice's own runs; `prior_gl.line`: **0**. `opening_items`: 0. Hosted counts pending.

## Tests and commands

- `packages/db/tests/opening-ledger-source.test.mjs` — **12/12 pass**, 0 skipped, with the **41** `--import …-preintegration-gate.mjs` flags (40 copied verbatim + mine, appended in migration order after `preview-invite`). Fix round: `p656.tie.obe_not_nil` now genuinely reaches the OBE arm (its old fixture asserted `tie_mismatch` under a name promising the opposite), and the two staleness cells assert `extraction_not_accepted` exactly instead of a two-token disjunction — the supersession wall is what fires, measured.
- **The gate pairing, both directions, proved by exercise**: with the premise deliberately falsified, a FOCUSED run (gate unset) **fails loudly** on the premise error in every cell; the same run with `opening-ledger-source-preintegration-gate.mjs` preloaded **loud-skips 12/12**.
- `packages/db/tests/document-capability-registry.test.mjs` — **19/19 before** the migration and **19/19 after**, with two cells re-based (`:445` raise → `PUBLISHED_REGISTRY_VERSION + 1`; `:466`/`:471` published minimum → `PUBLISHED_REGISTRY_VERSION`), the reason written beside the number and the literal in one place. Cells 17 (the 5→3 downgrade) and 3 are untouched.
- `operation-census.test.mjs` + `rig-isolation.test.mjs`, no reset flags — **31 tests, 30 pass, 0 fail, 1 skipped** (the destructive cell). T10b green: no World was bootstrapped on this database.
- `packages/runtime`: `opening-tb-produce` **17/17** (10 + 7 fix-round cells: the envelope refusal, the key pin, the emission guard, the element-shape pin), `wave-b-opening-parse` **17/17** (14 + the A1 three-way cell, the stored-envelope cell and the A6 whole-persist-abort cell), `kdoc-opening-tb-cells` + `-adversarial` — 63/63 unchanged.
- **World leg**: `PGHOST=127.0.0.1 PGPORT=55706 … node tests/opening-ledger-source-e2e.mjs` → **PASS**, all seven stages logged.
- Whole `apps/web` unit suite (`node scripts/run-tests.mjs`), re-run after the fix round: **4168 tests · 4165 pass · 1 fail · 2 skipped** (the three extra cells are this round's). The one failure is `lib/clara/use-clara-thread-stop.test.ts` cell 1845, which passes **25/25 in isolation** — a whole-suite load flake in the Clara chat lane, a file this ticket never touches, same class as the known `thread-live-clarify` one, and the same cell the first run hit.
- New web batteries — `opening-create-tie-picker` 6/6, `opening-target-document-panel` 10/10, `opening-parse-action` 10/10, `opening-dryrun-unchanged` 3/3, `lib/journals/opening-badge` 3/3 = **32/32** (29 + this round's three).
- `e2e/e2e-fixture-ownership.test.ts` — **18/18**, including the N5 scoping census with the new lane declaring neither `unscopeable` nor `debt`.
- `tests/sql-oracle.test.ts` + `do-action-floors` + `firm/capabilities` — **41/41** (these are what caught the dynamic-SQL defect; see below).
- `pnpm typecheck` **green**; `pnpm lint` **green** (worktree root).
- `check-frozen-workflows.mjs` **OK** (296 frozen files); `check-parts-parity.mjs` **OK**. Both no-ops — which is the evidence for "no successor".
- `pnpm --filter @clara/web e2e opening-ledger-source --reporter=line --workers=1` on the triple
`https://127.0.0.1:3350 / 3351 / 3352`: **7 passed (21.7s)** after the fix round. The first cut
measured 1 of 7 and marked six `test.fixme`; reading the assertions one at a time found three app
defects and one fixture defect (see AC6) plus one self-contradicting assertion in the spec itself
(`not.toMatch(/Ready to approve/i)` fails on "Not ready to approve"). The lane now resets its mock
state per cell through `reset_opening_ledger_source_fixture`, the house pattern from
`document-correction-walk.spec.ts`.

**A defect my own migration caused, and how it was caught.** The first cut of 0228 read its pins
through `execute format(...)` in a loop. `apps/web/test/sqlFunctionCensus.ts` fails closed on
dynamic SQL it cannot reconstruct, and the whole-suite run went red with
`sql_function_census_unresolved_execute` across **eight** cells in four suites. The file now writes
its thirteen pins longhand, the way `0195:390-409` — the idiom I was told to copy — does. The rig
was rolled back to the pre-0228 registry and the corrected file re-applied rather than edited under
an applied checksum. Same procedure was used once earlier, for the `prior_gl` level finding.

## Docs

- `CONTEXT.md` — the four ratified terms in the house shape: ***Opening basis***, ***Opening source***, ***Opening target***, ***Provenance (document / keyed)***. No fifth, no edit to #658's knowledge terms.
- `packages/db/README.md` — the second publication of the registry, why every row moves, the asymmetry, why `prior_gl`'s level was held, the two-writer split and its floors, and the two walls that carry no CLR code.
- `packages/db/tests/README.md` — the battery, its gate pairing by env-var STRING, the `persist_document_extraction`-only fixture rule, and the three cells whose names do not say what they measure.
- `packages/runtime/README.md` — the producer's caller, the freeze-by-closure warning, the in-line integration point and why kind-blind is safe, the never-throws rule, the two newly-reachable refusals.
- `apps/web/README.md` — the three places that made the lane unreachable, the persistent-outcome law, coverage ≠ tie, and C3's seam.

**Blueprint drift (recorded, NOT edited):**
- `ARCHITECTURE.md:207-211` calls `opening-tb-cells.mjs` the 真实 producer of `opening_tb.line` and marks the block *[已实现，hosted evidence pending]* while nothing called it. **This merge makes the sentence true.**
- `ARCHITECTURE.md:535` — one §7 row, two subjects, one `<!-- #764 -->` tag; contradicts §5.A's `<!-- #821 -->` block at `:276-283`. A doc-sync ticket must confirm with the owner.
- `ARCHITECTURE.md:293` says `chatTurn_v19`; the registry pins `chatTurn_v20` (`registry.ts:173`).
- `PRD.md:108` lists 客户建立与期初导入 under 当前版本已交付 while the 导入 half was unreachable from a browser. **This merge changes that; the line needs a qualifier rather than a deletion.**

## Successor contract (written, NOT cut this wave)

- **Class**: `chatTurn` → a future `chatTurn_vN`. **Not this wave's v21** — #656 appears in no row of DECISIONS §1.2.
- **Tool** `read_opening_source`, `.strict()` zod input `{ client_id: uuid, seed_id: uuid }` — **no amounts, no account codes, no document id from the model**: the seed already binds its tie document, and letting a model name either would put a figure in the model's hands.
- **Door call**: the tool calls the existing route core `parseOpeningTargets(client, { seedId, firmId, reassert })` on a `clara_runtime` connection, **in that argument order**. It must **not** call `clara.record_opening_targets_parsed` directly.
- **Refusal mapping**: 404 → `not_found`; 409 `registry_not_open` → "this opening basis is not open"; 409 `refused` + the CLR31 reason **verbatim**; 409 `source_reread_since_parse` → "this document has been read again since the basis was parsed" (**new since the brief** — see residual R4); 422 → the named unparseable reason **verbatim with its counts and failing region ids**, including the chart-gap reason and its `unmapped_accounts` array.
- **Part kind**: reuse the existing typed receipt part; **no new wire kind.**
- **Prompt stanza**: Clara may ask to read an opening source a human has already attached to an opening basis; she may never state an opening figure that did not come back from the door; she surfaces a refusal rather than a partial reading.

## Assumptions made (each one narrows, none widens)

1. **`prior_gl`'s `business_operation` stays `stored_only`.** D13.3 rules it to `supported`. I wrote it that way, applied it, and `document-capability-registry.test.mjs:278-284` ("business_operation never claims 'supported' where typed_facts is not supported") went red across 240 rows; `0191:229-230`'s column contract says the same in words. `prior_gl` has no typed-facts producer and its operation yields human-ticked PROPOSALS. Raising it needs a false `typed_facts` claim or the relaxation of a 240-row honesty law for one row. **What DID ship**: the false sentence is gone, the basis names `create_seeding_batch`, `seeding-parse.mjs`, the proposal shape and the missing entrance, and `limits` carries the named gap — so AC1's actual deliverable (the registry stops lying) is done and only the LEVEL is held. **Orchestrator decision needed.**
2. **Only 6 of 12 `opening_balance_doc` formats and 7 of 12 `prior_gl` formats move.** The brief says "every format" for `prior_gl`. Applying the brief's **own rule** (`0191:25`'s per-row bar) row by row: `ofx` is store-only, and `csv`/`tsv`/`docx` emit `rows.*`/`sheets.*`/`paragraphs.*`, never `tables.*`, so no reader exists. Marking them would print an operation that cannot run.
3. **`openingRoutes.ts` untouched; `opening-parse.mjs` gained two classification arms.** The brief says both need no edit. Two refusals the wiring makes reachable answered **500** and `malformed_lines` respectively — neither names anything, which is the opposite of D13.2. Both arms are narrow, pure and cell-covered. No door, no grant, no DB change.
4. **`components/journals/journal-entry-row.tsx` carries the badge** (the brief names only the `ENTRY_SELECT` hunk). It is not owned by another ticket; `lib/journals/types.ts`'s new field is **optional** so eight fixtures in #636/#655/#658 files did not have to move.
5. **No `pnpm ui:add`.** `Field`/`FieldGroup` are installed with 16 production consumers (appendix D row 28 "Field — None" is a stale 2026-09-08 snapshot). No new primitive, no `apps/web/package.json` or lockfile change.

## Named residuals

- **R1 — AC5's Work/receipt, `descoped (authority)`.** The opening lane writes `op_receipts` (0002) and never `operation_receipts`; `accounting_work.purpose` is a closed three-value IN-list pinned by `0194:2180`. **Owner question: does an opening basis need a Work-shaped record, and what would a receipt mean for a lane with no Work row?**
- **R2 — the period wall names the fiscal year, not the opening basis.** `_tf_period_wall_lines` refuses at the DRAFT with a message naming the FY label and the entry id. A professional sees "fiscal year FY2026 is closed", not "this opening basis is dated into a closed year". Pinned by `p656.period.closed_fy`.
- **R3 — the activity ladder is silent about the opening lane.** `list_activity` never mentions it. #861 owns the ladder; not recut.
- **R4 — re-parsing a re-read document is a dead end** (fix round: re-measured over the REAL writer, not raw INSERTs — a genuine second OCR pass does refuse CLR10 `source_reread_since_parse`, so the arm is live on the real path and the successor contract's mapping stands). The op key is stable per (seed, document) so a retry cannot double a basis, while the payload is keyed by region id — so a second parse after a re-read is a replay conflict. It is now an honest typed 409, but there is no way forward except reopening the basis. Needs either an op key carrying the extraction or a door that re-points targets.
- **R5 — on a document-sourced basis, "unmapped" is unreachable.** Two walls (`_assert_opening_target_fact` + `fk_opening_tb_targets_account`) make every parsed target both source-exact and chart-present; `unmapped_labels` is a KEYED-lane state only. A surface reading an empty `unmapped_labels` on a document basis as "everything is mapped" would be C-25's quiet pass again — pinned in `p656.tie.unmapped_blocks` and in the panel's own header. **Fix round**: the rendered footer no longer prints "Not yet mapped: 0 line(s), Dr 0.00 / Cr 0.00" on a wholly document-sourced basis; it states the structural fact and keeps the numeric count for a basis carrying a keyed row (review finding A10).
- **R6 — #854's two-session race is unmeasured and this slice enlarges its surface.** A real tie document is a genuinely live document with filings and extractions. **No concurrency claim is made and no cell contradicts #854's framing.**
- **R7 — the opening dialogs other than Create keep their pre-`Field` composition.** A whole-lane retrofit is #900's shape.

## Follow-ups worth filing as issues

- **F1 — Build a browser entrance to `POST /api/seeding/prepare`.** `seeding-parse.mjs` drives `clara.create_seeding_batch` off a filed prior GL today and nothing in `apps/web` calls it, so the capability is real and unreachable. `prior_gl`'s registry `limits` now says `{"browser_entrance":"absent"}` and its basis names this ticket. Nobody owns it (measured in the gap pass).
- **F2 — Decide what a Work-shaped opening record is, or rule that there is none.** R1's owner question. Widening `accounting_work.purpose` is a governance change, not an implementation one.
- **F3 — Cut `read_opening_source` into a future `chatTurn_vN`.** The contract above is written; the follow-up starts from text rather than from scratch.
- **F4 — Make a re-read document re-parsable.** R4. Either the op key carries the extraction, or a door re-points existing targets; today the honest answer is a dead end.
- **F5 — Give the closed-period refusal the opening basis's own words.** R2: the refusal is correct and its message is about a journal entry.
- **F7 — CLOSED in the fix round.** The `?tab=opening` walk is whole: 7/7 live. Original text kept for the record: finish the walk. Six of seven legs are `test.fixme` with the measurement in the file header. The mock, the `serve-built.mjs` wiring (dispatched above `home-board-mock.mjs`, with the reason at both sites) and the ownership-census row are all correct and green; one fixture defect was found and fixed while diagnosing (the keyed-resolution read is scoped by `bound_scope_id`, not by client) and is NOT yet re-measured in a browser. Next pass: run the legs one at a time with `--reporter=line` and read the assertion.
- **F6 — Reconcile the registry's four levels with "read deterministically into human-ticked proposals".** `prior_gl` fits neither `supported` nor `stored_only` cleanly; that vocabulary gap is what held assumption 1.

## Unverified

- **Everything hosted.** No hosted counts, no hosted release, no hosted recompute of C33.9's aggregate. **Hosted evidence pending.**
- **The browser proof of this slice's surfaces.** Six of seven walk legs fail and the failing assertion was never captured. Everything those legs assert is covered by node cells against the real components and by the real-Postgres leg, but that is not the same evidence and is not claimed as such.
- **The producer against a REAL Malaysian trial balance.** Every fixture is synthetic on measured geometry (ADR-048's ruling). The reader's refusal laws are proved; its behaviour on an unseen real document is not.
- **Concurrency on the opening lane** (R6) — unmeasured before this slice and unmeasured after it.
- **`prior_gl`'s printed-ledger source (c) end to end.** Its reader is proved pure (`wave-b-prior-gl-cells.test.mjs`) and wired (`seeding-parse.mjs:376-378`); no DB-backed cell drives a PDF ledger through to a batch. The xlsx byte path IS DB-backed (`wave-b-seeding-prepare.test.mjs:382`).
