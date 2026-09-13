# #624 — closure + adversarial review

`impl/624-document-capability` @ `b5673a01`, wt `clara-wt/624`, rig **rig624b** (55442/clara_624,
183 migrations, tip 0191). Read-only; no rig reset; worktree clean.

## A. Closure — the worker's 15 rows, re-measured

| # | Finding | Verdict | Cell / evidence |
|---|---|---|---|
| **B** | XLSX `r=` → CLR10 → retry loop | **CLOSED** | `structured-worker-cell-ref.test.mjs` cell 4. 17 hostile refs (`A1:B1`, `$A$1`, `AAAA1`, `A12345678`, `a1`, `Sheet1!A1`, `""`, 10 KB, unicode, SQL): every emitted path passes the grammar; 0 collisions in a sheet. |
| **S1** | 0177 ceremony half-done | **CLOSED** | `$dcr_splice_post$` pins the post-image. Installed = `0230031f…`; removing the one inserted line = `8ba95a52…` (prestate pin); anchor unique; assertion first in the loop. |
| **S2** | RLS used `actor_firm_id()` | **CLOSED (code), cell weak** | Catalog: human `jwt_firm()` / agent `wake_firm()`. Cross-firm: firm-B human sees **0** rows. Only cell is tail(5)'s policy **count** — a predicate rewritten to `true` stays green. |
| **S3** | could record `pass` on a shape 0092 refuses | **CLOSED** | belt cell 1. Duplicate total → `unmeasured`/`term_not_single`; empty → `no_total_persisted`; total-only → `net_or_tax_not_persisted`; always exactly one row. |
| **S4** | dead `unmeasured` arm | **CLOSED** | `chain_closes` has none; `printed_totals` keeps `not_applicable`. |
| **S5** | asymmetric write sweep | **CLOSED** | INSERT/UPDATE/DELETE/**TRUNCATE** false for all three app roles; `relacl` is `…=r/`. |
| **INV** | belt file absent | **CLOSED** | `document-fact-validation-belt.test.mjs` 5/5. Lone later `invoice.discount` → CLR10 `fact_validation_would_go_stale`; lone later `pages.1.lines.0` admitted, re-derived `detail` byte-identical. |
| **O1** | `C<n>` collides with C3 | **CLOSED** | cells 3/7/8; residual at NOTE 2. |
| **O2** | raw `r=` dropped | **CLOSED** | `declared_ref` present only when the clamp rejected. |
| **O3** | module unimportable | **CLOSED** | `if (parentPort)` guard; batteries import it. |
| **O4** | census gaps | **CLOSED** | `myinvois_longid` in CENSUS + tail; `grand_total` re-attributed. |
| **O5** | NUL bytes | **CLOSED** | `git diff` renders it as text. |
| **O6** | belt queued per region | **CLOSED, now measured** | 50 000 non-identity regions commit in **6 ms**; 5 000 identity-term regions take **41 247 ms**. The `when` is load-bearing. |
| **O7** | prestate message | **CLOSED** | Names both causes; asserts `clara_runtime`. |
| **O8** | stale corpus pin | **CLOSED** | `a230a03b…`; `firm-scope-db-pins` green. |
| **O9** | false header claims | **CLOSED** | Header states `statement` has no producer, `r=` is clamped. |

## B. Findings

**BLOCKER — none.** The door raises exactly one CLR10 (`{"reason":"field_path_syntax"}`) on
`sheets.0.A1:B1`. The lane then terminates: `processingFailureCode(CLR10)` → `internal`, absent from
`RETRYABLE` (`documentIngest.behavior_v2.mjs:132`), so attempt 1 takes the terminal branch and
`persist_document_extraction(…,'failed','internal')` succeeds — measured `status='failed'`, never
left `running`.

**SHOULD 1 — `documents-workbench.tsx` does not merge trivially with #620** (brief §9 asked for one
param read). #624 moved the whole selection model in and exported a second `DOCUMENT_PARAM`
(`documents-workbench.tsx:30`), duplicating #620's `lib/documents/url-state.ts:34`. Same spelling
(`"document"`); three overlapping hunks — the import line, the `useState(selectedId)` block (#624
inline `router.push`; #620 `parse/applyDocumentParam` + `select`/`close`/focus restore), and the
`FiledDocumentList`/aside call sites. Fix: take #620's file and delete #624's param block (no other
consumer). `document-detail.tsx` collides adjacently; `en.json` has **no** key collision; #624's test
harness drives the real router contexts, so it survives #620's implementation.

**SHOULD 2** — no cell reads `document_fact_validations` cross-firm; S2 rests on a policy count.

**NOTES.** (1) Dead ternary, both arms `"unsupported_format"` (`document-state.ts:206`). (2) Two
`<c r="A1">` in one sheet still emit `sheets.0.A1` twice — no unique index on
`(extraction_id, field_path)`; pre-existing. (3) `registry_version` monotonicity is convention, not a
constraint. (4) `_invoice_identity_verdict` / `_tf_document_region_fact_validate` absent from
rig-meta's 0191 cohort. (5) **Grammar totality**: every in-repo *writer* literal passes (tail runs
40). Out-of-grammar rows are fixtures only, and the set is larger than admitted — measured on rig624:
`ocr_{net,type,svc,tax,round,total,ccy}` ×44 **plus `body`**, plus `party_name`
(`f-a7-beta-filing-verb.test.mjs:606`) and `seedRegion`'s default `total`; all direct inserts, never
producers. **CI is safe**: `db-estate-suite` migrates main-then-HEAD on an empty `clara_ci` before
seed/tests, so the prestate sees zero regions. (6) Keys are `state*`/`capability*`/`checkName*`, not
the brief's `facts*` — no `download*`/`source*` overlap. (7) Line items sit in
`limits.invoice_line_items='planned'`, not a `planned` level (brief §3 deviation, reasoned in the
header). (8) `deploy/0191-field-path-census.sql`: 0 write verbs; probe 1 lists every distinct stored
path with verdict/engine, probe 2 raises under `ON_ERROR_STOP`, probe 3 pre-pins the pre-image — it
would surface every offending hosted row.

## C. Merge order — collision table

| File | Object 0191 recuts/alters? | Verdict |
|---|---|---|
| 0188 #615 | none | no collision |
| 0189 #641 | none | no collision |
| 0190 #620 | pins v1 `get_document_for_human_read` prosrc only; 1 new fn; alters no relation | **none** |
| 0192 #644 | outbound FKs **from** `knowledge_records`; alters neither doc table | **none** |
| 0193 #640 | none | no collision |
| 0194 #643 | none | no collision |
| 0195 #631 | not written yet (631 carries 0194) | unassessable |

No sibling recuts `persist_document_extraction` or moves the 20-kind CHECK 0191 pins; 0191 mints no
role (0154 safe).

## D. Verification (local; hosted pending)

- **db**, exact `package.json` gates + the new preintegration gate, 6 files — **43/43, 0 skip**.
- **runtime**, 7 files — **66/66, 0 skip**.
- **web**: 4 touched files **50/50**; full `run-tests.mjs` sweep **3 400 / 3 399 pass / 1 fail /
  0 skip** — the red is `checkout-faces-a11y`'s "bounded wait RE-READS THE SERVER", a known
  real-timer flake in an untouched file.
- `check-frozen-workflows.mjs` OK (264 files); `migrate.mjs` re-run → **0 new / 183 total**.
- Registry: 240 rows = 12 × 20, **0 missing cells**, one version; `ofx×bank_statement`
  `stored_only`/`unsupported`; `pdf×invoice` carries `invoice_line_items: planned`; no `accept` on
  `upload-panel.tsx`.

## Verdict

**MERGEABLE** — the DB half is order-independent across 0188–0194 and every closure row is backed by
a cell that would go red (S2 the weak link: correct today, untested). The one real cost is SHOULD 1:
a hand resolution of two web files against #620 at wave-2 integration.
