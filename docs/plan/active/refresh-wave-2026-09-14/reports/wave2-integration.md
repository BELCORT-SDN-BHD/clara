# Wave-2 integration — final report

Branch `integration/wave-2` @ **a29bc145**, worktree `C:\Users\zhant\Desktop\clara-wt\integration2`,
base `integration/wave-1`. Clean. Nothing pushed, no PR, no other worktree touched.

## Merges, in order

| # | sha | branch (tip merged) |
|---|---|---|
| 1 | `d3a6c291` | `impl/624-document-capability` (b5673a01) |
| 2 | `aa128233` | `integration/wave-1` (fb30848e — #615's money-store roster fix) |
| 3 | `f2fff853` | `impl/644-knowledge-records` (e60fd3ad; 041b5362 is an ancestor) |
| 4 | `db98b083` | `impl/637-two-build-cutover` (b9f698b5) — **no conflicts** |
| 5 | `9614e3c4` | `impl/643-periodic-adjustments` (46440525) |
| 6 | `8c8e4230` | `impl/640-accounting-plans` (9fc18935) |

Integration commits: `31544e74` (#624 AC4 Work half), `33b6c056` (#624 SHOULD 2 cell),
`bc3c3898` + `190045f9` (parts-parity), `a29bc145` (e2e body reader).

## Conflict resolutions — what was kept from each side

**#624 (`d3a6c291`).** `documents-workbench.tsx` → #620's whole selection model
(`parse/applyDocumentParam`, push-then-replace `select`, back-aware `close`, focus restore);
#624's duplicate `DOCUMENT_PARAM` + inline `router.push` deleted (no other consumer).
`documents-workbench-refresh.test.tsx` → #620's stateful `documents-test-fixtures` harness,
#624's inline `Harness` dropped, its `get_document_state` fixture case kept.
`documents-viewer-mock.mjs` → union (#624's `DOCUMENT_STATES` + #620's `recoveringReads`).
`ARCHITECTURE` §11 文件 row, `manifest.txt`, `rig-meta.mjs` → union. `CONTEXT.md`, `en.json`,
`document-detail.tsx`, `serve-built.mjs` auto-merged (no key collision; `DocumentStatePanel` wired).
TWO semantic conflicts the text merge could not see, both fixed in the same commit:
`documents-test-fixtures.ts`'s stub answered the new RPC with `[]` (red six of #620's cells — it
now answers SQL NULL, the door's own answer for another client's document), and #624's deep-link
walk cell assumed its own push-every-hop model where #620's replaces (one Back now restores the list).

**#644 (`f2fff853`).** `serve-built.mjs` → both hooks, #644's knowledge lane in its own position
and wave-1's rewritten journal-work comment. `packages/db/package.json` → both gates.
`e2e-fixture-ownership.test.ts`, `rig-meta.mjs` → union (the blind union closed over
`DOCUMENT_CAPABILITY_0191_COHORT`'s `];`; caught by lint, repaired). §11 → ours' 文件 row + theirs'
Knowledge row.

**#637 (`db98b083`).** No conflicts at all.

**#643 (`9614e3c4`).** `action.yml` → union in a deliberate order. `CONTEXT.md` → both term groups.
`tree.ts` + `en.json` → all leaves. `serve-built.mjs` → #643's lane kept, and the narrower duplicate
journal-work import the union produced dropped. `rig-meta.mjs` → union + `];` repair again.
§11 → row by row (会计能力 ← #643; 文件 ← #620/#624; Knowledge ← #644; 财务界面与输出 ← BOTH, #643's
clause spliced at the anchor the two sides share; 准入 ← #615/#622). The fixture census then caught a
REAL collision: `list_spoken_for_documents` is answered by journal-work-mock and
periodic-adjustment-mock (#643's AC3 mounts the composer's own evidence chooser) — now a declared
share; #643 could not have declared it, `SHARED_RPC_VERBS` arrived with wave 1 after that branch cut.

**#640 (`8c8e4230`).** `action.yml` → the five-step order: work-cancel → **#643** → **#637 two-build**
→ **#640** → **#637 world guard LAST** (each side's own stated requirement; the note in the file says
why). `work-detail.tsx` → #643's `purposeLabel` dd **and** #640's `<WorkPlanOriginRow>` beneath it,
with #624 AC4's Sources panel untouched. `packages/db/package.json` → all 27 gates. `rig-meta.mjs` →
union + `];` repair. §11 → the blind union duplicated six rows; de-duplicated by hand, only
自动计划与 close is #640's. **A real cross-branch break:** #640's authority picker called
`lib/work/reads.ts`'s `listAccountingWork`, which #641 deleted in the same wave. Restoring it would
contradict a committed decision and the replacement door carries no `basis`/`intent_key` (0189: "a
list of operations is not a ledger") — which is what the picker renders. The read moved to
`lib/plans/api.ts` as `listAuthorityCandidates`, same cap, same uuid guard. **Convergence is a
product decision, not mine — flagged below.**

## The two #624 integration commits

**`31544e74` — AC4's Work half.** Each `kind:"document"` source ref in #641's Sources tab renders
#624's `DocumentStatePanel` over the same `clara.get_document_state`; the id is uuid-shape-checked
first and a ref naming nothing usable says so and fires no read. `DocumentStatePanel` gained an
injectable `session` (default unchanged); `WorkSourceRef.document_id` typed.
Cells, **red first** (all three timed out waiting for the states with the panel reverted: 38/41 →
41/41 with it): four `role="group"` names + the registry basis sentence over exactly one POST and no
other door; the door's SQL NULL renders "not available" and invents nothing; a malformed id fires no
read; a tab press is neither a write nor a second read. Walk cell in `work-list-walk.spec.ts` +
`work-list-mock.mjs` (a facts-supported document whose arithmetic check FAILED) and a declared
`get_document_state` share in the census. ARCHITECTURE §7 records it.

**`33b6c056` — SHOULD 2.** Cell 6 of `document-fact-validation-belt.test.mjs`: firm A's own human
and agent sessions each read the row (positive control first), a firm-B human and a firm-B agent
each read **0**, and firm A's live wake secret set inside a firm-B HUMAN session still reads 0.
Discrimination measured on rig624b inside a rolled-back transaction: widening the human predicate to
`true` leaves 0191's tail policy COUNT at three (green) while the cell reads 1 where it asserts 0.
rig624b queried only; the probe's DDL rolled back and the predicate re-read afterwards.

## Three CI blockers found and fixed at integration

1. `bc3c3898` — #644's `lib/knowledge.mjs` carries an unreviewed object spread; `check-parts-parity`
   is a CI step. Byte-identical to its branch, so a missed gate on #644, not a merge artefact.
2. `190045f9` — #643's `periodic-adjustment-basis.ts` has five (two Zod shape spreads, a refusal
   details bag, two `adjustment_basis` builders), and #640's `...plans` moved the statement sha of
   all fourteen `runReconcilerSweep` spreads, staling their tuples. Re-pinned, not widened.
3. `a29bc145` — `work-list-mock.mjs`'s private draining `readJson` starved the documents lane once
   my AC4 handler made `get_document_state` a two-lane verb (documents walk 18/4 → **22/22**).

## Counts (all local; hosted evidence pending)

**db — rigw2 (127.0.0.1:55453/clara_w2, chain 0001…0194 contiguous, 189 migrations, re-provisioned
after #640 so 0193 precedes 0194), exact 27 gate flags from `packages/db/package.json`:**

| battery | pass | fail | skip |
|---|---|---|---|
| document-capability-registry | 16 | 0 | 0 |
| field-path-grammar | 7 | 0 | 0 |
| document-fact-validation-belt | 6 | 0 | 0 |
| document-filing-conflict | 5 | 0 | 0 |
| knowledge-records | 27 | 0 | 0 |
| knowledge-onboarding-promotion | 13 | 0 | 0 |
| periodic-adjustment | 19 | 0 | 0 |
| close-closing-stock-producer | 4 | 0 | 0 |
| accounting-plans | 20 | 0 | 0 |
| accounting-plan-occurrences | 15 | 0 | 0 |
| operation-census | 10 | 0 | 0 |
| rig-isolation | 20 | 0 | **1** (T19's destructive cell; no reset flag set) |
| checkout-gate-c3 | 69 | 0 | 0 |
| work-journal-post | 32 | 0 | 0 |
| work-journal-admission | 20 | 0 | 0 |
| work-cancel | 42 | 0 | 0 |

**web unit, whole suite at the tip** (`node scripts/run-tests.mjs`): **3643 tests, 3640 pass, 1 fail,
2 skip.** The fail is `thread-live-clarify`'s "two clarify rounds live" — a real-timer load flake in
an untouched file, **2/2 in isolation**; named, not fixed. The 2 skips are the env-gated
`live-provider-auth` cells. `pnpm typecheck` green, `pnpm lint` exit 0.

**Browser walks** (ports 3220/3221/3222, one at a time): documents-viewer **22/22**, knowledge-walk
**13/13**, periodic-adjustment **12/12**, plans-walk **9/9**, work-list-walk **18/18**.

**CI `build`-job gates, after `pnpm build`, in CI's own order:** `check-worker-paths` OK (2 spawn
sites, built layout verified) · `check-workflow-bundle` OK (12 pinned classes, 40 checks) ·
`check-parts-parity` OK · `check-frozen-workflows` OK (264 frozen files, 49 "use workflow" modules).
`packages/runtime`: rollback-preflight + ready + built-bundle-gate + work-bundle + l9-build-info +
registry-view **88/88** on rig637; `periodic-adjustment-unit` **13/13**.

## Unverified / open

- **Everything hosted.** 0191 still owes `packages/db/deploy/0191-field-path-census.sql` in the
  writer-quiescence window; 0191/0193/0194 recut live bodies.
- The **runtime suite on rigw2 is the orchestrator's** — not run here.
- **The `listAuthorityCandidates` split is a stopgap.** Two readers of `clara.accounting_work` now
  exist (the door for both Work lists, this one for #640's authority picker). Converging them —
  widening 0189's projection with `intent_key`, or accepting a weaker label — is a product decision.
  Worth a follow-up issue.
- `work-list-mock.mjs` was the last lane mock with a private draining body reader; the others already
  use `mock-dispatch.mjs`. No survey was done of whether any remaining lane has the same latent shape.
- #644's parity exemption and #643's five were reviewed by me at integration, not by that ticket's
  own reviewers.
