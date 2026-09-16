# #646 — fix round 1 · finding → what I did → evidence

**Branch** `impl/646-document-correction` · **worktree** `C:\Users\zhant\Desktop\clara-wt\646` · reviewed head `4ac11657` → new head **`255559cb`**. Rig `127.0.0.1:55505`/`clara_646` (PG 17.11). All evidence **LOCAL**; hosted evidence still pending. Three commits, none pushed:

```
255559cb fix(db):  a 'fact' revision records the invoice_facts reading it superseded
4816405e fix(web): the walk scans the OPEN impact Sheet; the orphan cell asserts the honest empty
f2e302a4 fix(web): the lane mock is visible to the ownership census; its five shares are declared
```

## Findings

| # · lens · severity | Finding | What I did | Evidence (red → green) |
|---|---|---|---|
| **STANDARDS F1 · blocker** | `document-correction-mock.mjs` dispatched with a fourth spelling (`rpc === "…"`), invisible to `rpcVerbCensus()`'s three-shape reader, so the verb-ownership cell was structurally blind to the whole lane; four real shares were undeclared while three comments and commit `1d042586`'s message claimed they were declared. | Renamed the dispatch variable to `verb` (the sibling lane's own convention) — a change local to my file, so the shared census's logic is untouched. Declared **five** shares in `SHARED_RPC_VERBS` with their scoping arguments, and corrected all three false comments (mock header, `documents-viewer-mock.mjs:540`, the ownership table's `document-correction-mock.mjs` row). | Blindness reproduced: the census printed "65 distinct RPC verb(s); 5 answered by more than one lane mock", none from this lane, and passed 15/15. **RED after the rename**: `not ok 14 — verb-ownership census` listing all five (`record_client_resolution` undeclared; `get_document_state`'s claimants not matching; `list_source_revisions`, `list_source_dependents`, `get_document_extract` undeclared) → 14 pass / 1 fail. **GREEN after declaring**: "72 distinct RPC verb(s) censused; 9 answered by more than one lane mock", **15/15 pass**. |
| **STANDARDS F1 (extension)** | The review named four collisions. There is a **fifth**: `record_client_resolution`, answered by `chat-parity-mock.mjs` too — and the wrong-client wizard really reaches it (`correction-wizard.tsx:146`). | Declared it, with the asymmetry stated rather than glossed: chat-parity's arm is **unscoped** (already declared debt in that file's own table) and is dispatched **first** (`serve-built.mjs:576` vs `:580`), so that lane is what answers #646's walk today. Harmless only because the wizard treats the id as an opaque handle and no cell asserts on it. Kept my scoped arm, so this lane does not come to depend on another lane's debt. | `chat-parity-mock.mjs:292` answers `path === "/rest/v1/rpc/record_client_resolution"` unconditionally; the census names both files; the declaration and its reasoning are at `e2e-fixture-ownership.test.ts:992-1005`. |
| **SPEC F1 · should** | `correction-impact-sheet.test.tsx:9` and the walk's own header claimed the browser runs axe on the open Sheet. No cell did — the two scans were on the three tabs and on the revision dialog. | Added the scan inside the `C2 · AC6: the impact radius opens in a Sheet` cell, `.include`-scoped to `[data-testid="correction-impact-sheet"]` so it cannot pass vacuously. Corrected the unit test's sentence to say exactly what is scanned. | **RED** with the identical block placed before the Sheet opens: `Error: frame.evaluate: Error: No elements found for include in page Context`. **GREEN** in place: cell 10 `ok` in all three subsequent runs. |
| **SPEC F2 · should** | The ORPHAN-QUESTION cell's comment claimed the panel "says the honest empty"; its only assertion checked that the stale text was GONE, which a panel rendering nothing also satisfies. | Added `await expect(dependents).toContainText("Nothing recorded stands on this document's reading.")` after the existing absence assertion. | **RED** with `SourceDependentsPanel`'s `dependentsEmpty` sentence blanked: the absence assertion at line 280 still passed and the new one failed — `Received string: "Standing on this documentClara does not re-assess these automatically. …"`. Panel restored; **GREEN**: cell 9 `ok` in all three subsequent runs. |
| **ADVERSARIAL 646-A1 · should** | For a `'fact'` revision the ledger row, audit payload and receipt recorded `obs.authoritative_extraction_id` — the document-wide pointer — so after the ordinary classify-then-revise sequence the audit answer to "which reading was this decision made against" named a `doc_classify` row. | `clara.revise_document_fact` now writes `obs.facts_extraction_id` in all three places (the door already used it for the envelope's `revises_extraction_id` and for `source_superseded`). The `'kind'` writer is unchanged — the document-wide pointer is the right answer for a classification. Column comment, file header and `packages/db/README.md` restated per-kind. New cell **`p646.fact.observes_facts_reading`** re-kinds FIRST, asserts the two pointers have separated, then pins the ledger row, the receipt, the **committed** op receipt, the audit payload, the appended extraction's envelope and `list_source_revisions`' projection all on the `invoice_facts` row. `EXPECTED_CELLS` 15 → 16. | **RED on the rig**: `a 'fact' row's observed reading is a reading of the FIGURES, never a classification row — actual 'doc_classify', expected 'invoice_facts'` (16 tests, 15 pass, 1 fail). **GREEN after the fix**: **16/16, 0 fail, 0 skip**, cell 7 `ok`. |
| **ADVERSARIAL · note** (dependents firm term) | `list_source_dependents`' `work_questions` arm joined `clara.accounting_work` with no firm term; `agent_interruptions.work_id`'s FK is single-column. | Added `and w.firm_id = c.firm` to the join, with the reasoning in the body. Applied because it is one predicate, strictly narrowing, and every sibling arm already states its own term. **Not** applied: the suggested foreign-firm Work row in `p646.reads.scope` — that fixture reaches into another firm's Work lane and is a bigger change than the note; recorded here instead. | Battery **16/16** after the change; `p646.reads.scope` and `p646.dependents.projection` both green; neighbours 138/138. |
| **ADVERSARIAL · note** (event invisible in client activity) | `document.fact_revised` is `client_scoped` but carries `_document_sole_live_client`, NULL for a multi-filed or unfiled document, so `list_activity` shows it only firm-wide. | **Documented, not changed** — the reviewer's own first option (one event per live filing) is a behaviour change the brief does not ask for and whose consumer is #676. Added to `packages/db/README.md`'s 0202 section and to the final report's named residuals. | `packages/db/README.md` 0202 section, new paragraph; `646-final.md` Follow-ups item 6. |
| **ADVERSARIAL · note** (band claims pending impact) | The "Accounting impact pending" Alert renders for a document that never backed a posted entry. | **Not applied — contradicts the brief.** `brief-646.md:64` specifies the band as "two persistent rows, 'source revision accepted' and 'accounting impact pending (#676)' with the link", and AC4's own words are "show source revision accepted and accounting impact pending **separately**". Making one conditional changes what the brief specifies rather than refining it; the body text is already accurate and `document-no-claim` states the no-claim case in the same view. **Ratification requested.** | Recorded in `646-final.md` Follow-ups item 7. |
| **SPEC F3 · note** (host contention) | The reviewer could not get a clean Playwright run. | No code change, as the finding asks. Re-measured; both runs below. | See the Playwright table. |
| **ADVERSARIAL · note** (fresh cluster left running) | `rig646r` @ 55605 left up for the fix round. | No action; I did not touch it. My rig is 55505/`clara_646`. | — |

## Re-runs (all at head `255559cb`, on the re-applied chain)

| Command | Result |
|---|---|
| `pnpm typecheck` (worktree root) | **exit 0** (apps/web + packages/runtime) |
| `pnpm lint` (worktree root) | **exit 0** — check-token-contrast, check-test-manifest, check-message-keys (2974 keys), eslint across db/runtime/reporting-render |
| DB battery, exact 29-gate chain | **16 tests, 16 pass, 0 fail, 0 skip** |
| Neighbours (9 files, same chain) | **138 tests, 138 pass, 0 fail, 0 skip** |
| `operation-census` · `rig-isolation` (no reset flags) | **10/10** · **21: 20 pass, 1 skip** |
| Touched web batteries (`correction-impact-sheet`, `document-revision-dialog`, `documents-url-state`, `document-facts-table`, `documents-a11y`, `focus-ring-contract`, `e2e-fixture-ownership`) | **57 tests, 57 pass, 0 fail** — focus-ring count unmoved; census 72 verbs / 9 declared shares |
| Whole `apps/web` unit suite (`node scripts/run-tests.mjs`) | **3729 tests, 3727 pass, 0 fail, 2 skipped** (10m18s) — byte-identical to first delivery |
| `node scripts/check-frozen-workflows.mjs` | **exit 0** — 281 frozen files, 51 registered modules |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **exit 0** (`git diff origin/main...HEAD -- packages/runtime` is empty; run anyway) |

## Migration rollback and true-prestate re-apply (recorded, as required)

The 0202 file changed, so it was rolled back and re-applied. **A schema-only reset is not a prestate in this repo**: `pnpm --filter @clara/db reset` drops `clara`, but PostgreSQL roles are cluster-level, so the chain then died at `0154_binding_proposal_pr_1` — *"the clara role count moved from 14 to 18 — this file mints no role and owes no roles-bootstrap twin"*. The true prestate is schema **and** roles:

1. Prestate recorded: `clara_646` = 194 migrations, max `0202_document_source_revision`, 5/5 of 0202's routines present.
2. `pnpm --filter @clara/db reset` → `dropped schema "clara"`; then all **18** `clara%` roles dropped (`drop owned by` in both databases, then `drop role`) → the cluster carries no clara role and no clara schema, i.e. what `mkrig.sh` produces.
3. `pnpm db:migrate` → **"194 new migration(s) applied · 194 total · target 127.0.0.1:55505/clara_646"**. 0202's prestate pins (the measured `set_document_kind` pre-image sha, 0197's `_document_posting_entry`, 0191's `persist_document_extraction`) and its tail assertions therefore held on a chain built only from `origin/main` + this branch's one file, with the amended body.
4. `pnpm db:migrate` again → **"0 new migration(s) applied · 194 total"** (idempotent). `pnpm db:seed` → **2 seed file(s) applied**.
5. Every battery above ran on that chain.

**Host note on the re-apply:** `0057_wave_e_registry_snapshots` pins its own `set local statement_timeout = '5min'` and carries a recursive `pg_proc` reachability census; it was cancelled by that timeout on three attempts while the host sat at 80–99 % CPU with ~50 node processes from the other eleven lanes, and passed on the fourth. The merged migration was not edited; the backend was reniced inside WSL and the run retried.

## Playwright — both runs, as the contention protocol requires

Ports 3270/3271/3272 throughout. Host measured at **99 % CPU, ~52 node processes, 11.5 GB free** during these runs.

| Run | Result |
|---|---|
| Combined `document-correction-walk` + `documents-viewer-walk` | **34 passed, 3 failed (19.1m)** — all three are 30 s test timeouts, and **two are in `documents-viewer-walk`, a file this branch does not touch** |
| `documents-viewer-walk.spec.ts` **alone** | **22 passed, 0 failed (5.4m)** — green verbatim, #624's contract intact |
| `document-correction-walk.spec.ts` **alone** | **12 passed, 3 failed (8.4m)** — cells 1–3, the cold-start window: `Protocol error (Runtime.callFunctionOn): Internal server error, session closed`, `page.goto: net::ERR_ABORTED`, and the sign-in nav not visible within 20 s |

The failing **set moves between runs** — cells 2 and 3 passed in the combined run, cell 1 passed at first delivery — which is the contention signature, not a defect, and nothing was "fixed" in response. **The two cells this round changed (9 ORPHAN-QUESTION, 10 the Sheet) passed in every run.**

## Deliberately left

1. **The band's pending-impact Alert** (see the table) — contradicts `brief-646.md:64` and AC4's wording; **ratification requested**.
2. **The census's own blind spot.** Renaming my variable makes the gate see this lane, but a *future* lane with a fourth spelling is still invisible. Widening `RPC_VERB_OPENER`, or asserting that every `LANE_MOCKS` entry contributes at least one verb, is logic in a shared file that eleven other lanes are editing this wave (rule 6: one-line registrations only). Worth a follow-up issue; not taken here. (Measured while fixing this: the N5 scanner reads comments too — a comment quoting the literal `path === "/rest/v1/rpc/…"` made N5 red until reworded.)
3. **A foreign-firm Work row in `p646.reads.scope`**, suggested alongside the firm-term fix. The predicate is in; the cross-firm Work fixture is not.
4. **Commit `1d042586`'s message** claimed the shares were declared and the census green. History is not rewritten; the claim became true at `f2e302a4`, and this report is the record of when.

## Files changed this round

`packages/db/migrations/0202_document_source_revision.sql` · `packages/db/tests/rig-docs-source-revision.test.mjs` · `packages/db/README.md` · `packages/db/tests/README.md` · `apps/web/e2e/document-correction-mock.mjs` · `apps/web/e2e/documents-viewer-mock.mjs` · `apps/web/e2e/e2e-fixture-ownership.test.ts` · `apps/web/e2e/document-correction-walk.spec.ts` · `apps/web/components/documents/correction-impact-sheet.test.tsx`.

Outside the worktree and uncommitted, as instructed: `reports/646-final.md` (updated in place: AC1 and AC7 evidence, battery 15 → 16 cells, the Playwright two-run record, the amended assumption 1, assumption 6 now true, and two new residuals) and this file.
