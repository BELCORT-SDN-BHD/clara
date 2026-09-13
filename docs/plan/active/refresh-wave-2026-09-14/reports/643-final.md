# #643 — periodic stock adjustment + supplied payroll/statutory obligation — FINAL REPORT

**Branch** `impl/643-periodic-adjustments` · worktree `C:\Users\zhant\Desktop\clara-wt\643` · **clean**, never pushed, no PR. 9 commits (`git log --oneline main..HEAD`); the last four are this session's:

`06637a8b` docs §11 counts · `3e7f5306` test(web) checkout cell · `20111d45` test(web,e2e) walk + fixture · `80a2713f` fix(web) `Field` hoist · `fae608e6` docs · `8a06138a` feat(web) form/history · `576576ed` test(runtime) world e2e · `41b48385` feat(runtime) route + basis module · `67570aad` feat(db) 0194.

## Per acceptance criterion

- **AC1 stock adjustment — done.** `packages/db/migrations/0194_periodic_adjustments.sql`: new purpose, typed particulars on the frozen column `clara.accounting_work.adjustment_basis`, `clara.periodic_adjustments` written inside the posting transaction, `flags ? 'closing_stock'` stamped on the draft INSERT. Evidence: `periodic-adjustment.test.mjs` 18/18.
- **AC2 supplied payroll obligation — done, boundary stated.** `_assert_adjustment_relationships` requires every named leg to be used and the expense leg to carry the supplied amount; `advance_not_enrolled` refuses an advance account with no live `clara.staff_advance_accounts` enrolment. The **allocation** stays with `clara.book_staff_advance_application` (0043 `_adv_on_approve` CLR40); no chart-template change — statutory accounts are supplied particulars with editable form defaults.
- **AC3 three entrances — partial, by the brief's binding decision.** Direct Accounting and upload/reference reach the door; **`chatTurn_v19` is not in this PR** (its non-frozen half ships here — last section). On #721, the honest shape: the form asks **before** admission; no post-admission Work question completes a basis. All-zero / overbroad / stale / lost authority / locked period refuse typed (`pa.refusals`; walk cells 3–5).
- **AC4 named form + history, close readiness, one effect, linked correction — done.** History at `…/accounting/adjustments` with exact fields, sources, Work/JE/receipt links and the two-way correction chain. `_close_gate_closing_stock` recut drops `no_producer_verb` and names the producer; `close-closing-stock-producer.test.mjs` 4/4 (including that `measured_digest` moves and a reversal returns the gate to fail). One-effect proven by World e2e legs 2 and 4.
- **AC5 one real DB/Workflow case per shape + correction/refusal — done locally.** `periodic-adjustment-e2e.mjs`, 5 legs, real Postgres World, real HTTP, SIGKILL between commit and checkpoint. **Hosted evidence pending.**
- **AC6 journey states / responsive / a11y — done.** `apps/web/e2e/periodic-adjustment-walk.spec.ts` 11/11: 320 px, 200 % zoom, keyboard + focus return, SR names, reduced motion, stable URL + Back, preserved draft, successful empty, axe clean on six faces.
- **AC7 least-privileged roles / real Workflow World — done locally** (db cells post under a real `interactive_client` credential OBO the initiator). **Hosted: pending.**

## Tests and exact commands

Local only. Windows 11, Node 22.23.2, rig `rig643` 127.0.0.1:55439 / `clara_643`. `$GATES` = the verbatim `--import …-preintegration-gate.mjs` list from `packages/db/package.json` `"test"`.

| command | result |
|---|---|
| `node --test --test-concurrency=1 $GATES tests/periodic-adjustment.test.mjs` | **18 / 0 fail / 0 skip** |
| same, `tests/close-closing-stock-producer.test.mjs` | **4 / 0 / 0** |
| same, 10 neighbours (`work-journal-admission`, `work-journal-post`, `journal-work-evidence`, `work-cancel`, `work-question`, `work-question-reads`, `x56-rest-h`, `er9-gates-boundaries`, `er9-close-lifecycle`, `operation-census`) | **208 / 0 / 0** — the posting-core recut did not move the journal lane |
| `node --test tests/periodic-adjustment-unit.test.mjs` (runtime) | **13 / 0 / 0** |
| `node --test tests/work-routes-unit.test.mjs` · `tests/work-journal-db.test.mjs` | **21 / 0 / 0** · **23 / 0 / 0** |
| `pnpm --filter @clara/runtime build`, `… exec bootstrap`, then `PGDATABASE=clara_rt_test RELAY_TEST_MODE=1 WORKFLOW_POSTGRES_URL=… node tests/periodic-adjustment-e2e.mjs` | **PERIODIC ADJUSTMENT E2E: PASS**, 5/5 legs |
| `node --import ./test/bootstrap.mjs --import tsx --test components/accounting/periodic-adjustment-form.test.tsx` | **14 / 0 / 0** |
| `… --test e2e/e2e-fixture-ownership.test.ts` | **7 / 0 / 0** |
| `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3190 CLARA_E2E_NEXT_PORT=3191 CLARA_E2E_RUNTIME_PORT=3192 pnpm --filter @clara/web e2e periodic-adjustment` | **11 passed (1.4 m)** |
| `node scripts/run-tests.mjs` (whole apps/web suite) | 3408 / 3407 / **1 fail** → after `3e7f5306`: **3408 / 3408 / 0 fail / 0 skip** |
| `pnpm typecheck` · `pnpm lint` (root; lint runs `check-frozen-workflows.mjs` first) | **exit 0** · **exit 0** |

The World e2e is hard-gated to `PGDATABASE ∈ {clara_rt_test, clara_wave_b_ci}`, so it ran on the same cluster against `clara_rt_test` (template clone of the 0194 chain; verified to carry `clara.periodic_adjustments`). `rig643` was never reset; `CLARA_RIG_ALLOW_RESET`/`…_ROLE_SWEEP` were never set.

**New/changed this session:** `apps/web/e2e/periodic-adjustment-walk.spec.ts` (the journey and the interaction contract) and `apps/web/e2e/periodic-adjustment-mock.mjs` (the lane fixture — intent-key idempotency with two arms: same payload ⇒ 202 `replayed:true`, different payload ⇒ 409 naming the Work); two one-line hooks in `apps/web/e2e/serve-built.mjs` plus the lane's declaration in `apps/web/e2e/e2e-fixture-ownership.test.ts`; `periodic-adjustment-form.tsx`; `components/entry/checkout-faces-a11y.test.tsx`.

## Two reds, fixed at the cause

1. **`Field` was declared inside the form's render body** — a new component type each render, so React remounted its subtree on every keystroke: the focused input was replaced mid-typing and every walk cell typing into two controls saw an empty form. The unit harness cannot see this (it settles between events). Hoisted; the wrapper now takes `errorText`.
2. **#628's `the bounded wait RE-READS THE SERVER…`** went red on this branch. **Bisected, not guessed:** swapping only `messages/en.json` for main's → 25/25; restoring the branch's → 24/25, three runs running. The cell asserted "no notice yet" after two `h.settle()` cycles against a **30 ms** injected budget, i.e. it raced the harness's own mount cost, which grows with the message bundle; #643's +139 lines (~3.5 %) tipped it. Clock widened (20/400/600 ms) with the measurement recorded; the cell pinning the **shipped** constants (5 s/120 s) is untouched.

## Docs

`docs/ARCHITECTURE.md` §4 (three purposes; why typed particulars ride a frozen column; `_admit_accounting_work_core`; the third posting-core recut; refusal vocabulary; the two boundaries not crossed), §8 (`closing_stock_present` has a real producer, `no_producer_verb` retired, the digest moves), §11 rows 会计能力 and 财务界面与输出 — the latter now carries the measured walk counts. `CONTEXT.md`: **Periodic adjustment**, **Supplied obligation particulars**. `docs/PRD.md`: the 工资与存货相关会计 boundary. Hosted claims are written as pending.

## Assumptions

- The brief was read literally: no v19, no claraWork v3, no chart-template row, `clara.periodic_adjustments` (never `adjustment_*`), migration 0194 only.
- The history CTA is a **link**: `<Button render={<Link/>}>` renders the anchor (Base UI injects `role="button"` only for a non-native element) — the honest role for navigation, and what the walk asserts.
- `settled_cents` is a client-side derivation input only on both lanes: 0194 has no such column and the wire omits it, so the split is recoverable from the posted lines, not from the particulars.

## Follow-ups

1. **`start_periodic_adjustment_work` cannot name a staff-advance account** — `payrollObligationInputSchema` is `.strict()` with no `advance_account_code`, so the chat lane cannot record a particular the direct form can and the DB checks. Add it when v19 is authored, or record the asymmetry deliberately.
2. **Store the settlement split as a particular** (`settled_cents` in `_assert_adjustment_basis`) so the history states it rather than leaving it to be re-read off the lines.
3. **Sweep the marginal real-timer cells** — #628's was one budget away from failing for any ticket that adds copy.

## Unverified / not claimed

All **hosted** evidence. The **whole db estate suite** and the **whole browser suite** (orchestrator's/CI's). The `189/189` neighbour figure in `fae608e6`'s §11 text is the previous worker's; mine is the 10 files above at 208/208. `#707`/`#693` appeared in nothing I ran and were neither reproduced nor touched.

## What chatTurn_v19 must wire

All non-frozen pieces are in **`packages/runtime/lib/periodic-adjustment-basis.ts`** (non-frozen; not in `frozen-workflows.json`), tested by `packages/runtime/tests/periodic-adjustment-unit.test.mjs` (13/13); its foot repeats this list.

- **Tool name** `START_PERIODIC_ADJUSTMENT_WORK_TOOL` = `"start_periodic_adjustment_work"`, registered **beside** `start_journal_work` (unchanged).
- **Schema** `startPeriodicAdjustmentWorkInputSchema` — `z.discriminatedUnion("purpose", [stockAdjustmentInputSchema, payrollObligationInputSchema])`, both `.strict()`. Types `StartPeriodicAdjustmentWorkInput`, `StockAdjustmentInput`, `PayrollObligationInput`.
- **Builders** `adjustmentFromInput(input, { particularsSource })` → the `p_adjustment` jsonb in 0194's snake_case; `basisFromAdjustment(input)` → `p_basis` in the shape `chatTurn.v18.tools.ts`'s `basisFromInput` produces; `stockMovementCents(input)`; `localAdjustmentRefusal(input)` → `AdjustmentRefusal`, shaped like v18's `localBasisRefusal`.
- **Admit verb** (grant `clara_runtime`), argument order fixed by 0194:
  `clara.admit_periodic_adjustment_work(p_client uuid, p_author uuid, p_intent_key text, p_purpose text, p_basis jsonb, p_adjustment jsonb, p_basis_origin text, p_source_refs jsonb, p_model text)`.
  Chat lane: `p_basis_origin='clara_interpreted'`, `p_source_refs=[{kind:'chat_task',task_id,session_id}]`, `p_intent_key=stableOpKey(ctx.taskId, START_PERIODIC_ADJUSTMENT_WORK_TOOL, input)`. `clara.admit_journal_work`'s 7-argument signature does **not** move — the frozen v18 tool names it.
- **Result mapping** identical to `runStartJournalWork`; no new error class, so `claraWork.v1.errors.ts` is untouched.
- **Frozen manifest**: v19 is a **new** frozen version, never an edit of v18. Each new `packages/runtime/workflows/chatTurn.v19.*.ts` enters `frozen-workflows.json` via `node scripts/check-frozen-workflows.mjs --update` (refused under CI); `scripts/freeze-lint-checks.mjs` requires the newest version to be the enqueued one.
- **Parts parity**: add `packages/runtime/workflows/chatTurn.v19.parts.ts` to the closure list at `packages/runtime/scripts/check-parts-parity.mjs:35`, and carry v19's rows in `packages/runtime/scripts/parts-parity-exemptions.mjs` (v18's `tool-call`/`tool-result`/`json` rows at lines 288–290 are the template).
- **Must NOT**: mint a new claraWork bundle. A periodic-adjustment Work runs the existing frozen `clara-work/v2` body byte for byte — the particulars live on `adjustment_basis`, which the run never reads or echoes (World e2e leg 1 asserts it).
