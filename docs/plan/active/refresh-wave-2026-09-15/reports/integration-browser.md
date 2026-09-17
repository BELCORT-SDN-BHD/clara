# Wave 2026-09-15 integration — the browser suite on the merged tree

Branch `integration/wave-2026-09-15-browser` (from `integration/wave-2026-09-15` @ `017440fd`),
worktree `clara-wt\intb`, Playwright triple `3360/3361/3362`. **Nothing pushed, no migration or
frozen file touched, no other worktree read or written.** All evidence LOCAL; hosted: none.

## 1 · The sweep — 41 specs, 3 red, all three now fixed

Detached sweep on ports 3350–3352 (integration worktree), one log per spec. Three non-zero exits,
no others, so no contention flake to re-run.

| spec | exit | counts | verdict |
|---|---|---|---|
| a11y-finish-walk | 0 | 6 passed | green |
| accrual-walk | 0 | 14 passed | green (re-run as a control after fix 1: 14/14) |
| activity-feed-walk | 0 | 17 passed | green |
| agentic-finish-walk | 0 | 9 passed | green |
| bank-close-registers-walk | 0 | 3 passed | green |
| chat-parity-walk | 0 | 7 passed | green |
| checkout-gate-walk | 0 | 16 passed | green |
| client-create-walk | 0 | 4 passed | green |
| counterparty-identity-walk | 0 | 17 passed | green |
| document-correction-walk | 0 | 15 passed | green |
| documents-intake-walk | 0 | 12 passed | green |
| documents-viewer-walk | 0 | 22 passed | green |
| entry-faces-walk | 0 | 14 passed | green |
| **firm-navigation-walk** | **1** | 1 failed / 9 passed | **pre-existing → fixed `a5d04ee6`** (10/10) |
| firm-setup-walk | 0 | 5 passed | green |
| fixed-asset-acquisition-walk | 0 | 8 passed | green |
| home-board-walk | 0 | 9 passed | green |
| identity-finish | 0 | 13 passed | green |
| interview-walk | 0 | 4 skipped | env-gated |
| journal-work-walk | 0 | 20 passed | green |
| journals-table-walk | 0 | 15 passed | green |
| knowledge-firm-walk | 0 | 14 passed | green |
| knowledge-walk | 0 | 13 passed | green |
| manual-journal-walk | 0 | 9 passed | green |
| members-invite-walk | 0 | 5 passed | green |
| money-input | 0 | 1 passed | green |
| operator-support-walk | 0 | 13 passed | green |
| parity-holes | 0 | 6 passed | green |
| periodic-adjustment-walk | 0 | 13 passed | green |
| personal-settings-walk | 0 | 13 passed | green |
| plans-walk | 0 | 9 passed | green (control after fix 1: 9/9) |
| **prepayments-walk** | **1** | 1 failed / 5 passed | **merge collision → fixed `23135011`** (6/6) |
| reports-download-walk | 0 | 2 skipped | env-gated |
| responsive-shell-walk | 0 | 25 passed | green |
| **shell-migration-walk** | **1** | 1 failed / 30 passed | **pre-existing → fixed `5a93b33b`** (31/31) |
| signup-confirm-pending | 0 | 3 passed | green |
| staff-expense-claim-walk | 0 | 13 passed | green |
| tax-boundary-walk | 0 | 10 passed | green |
| work-cancel-walk | 0 | 10 passed | green |
| work-list-walk | 0 | 18 passed | green (control after fix 3: 18/18) |
| work-question-walk | 0 | 14 passed | green |

## 2 · The three fixes, each red first

**1 · `23135011` — `prepayments-walk.spec.ts:115` "prepayments.walk.refusal". A REAL merge defect.**
`selectOption(PREPAY.workId)` timed out: the `<select>` rendered, the option never did.
`accrual-mock.mjs` (#652) and `prepayments-mock.mjs` (#653) were built on parallel branches, both
derived their id space from `plans-mock.mjs`'s `64c0c0c0-…`, and both landed on the SAME client id
`65c0c0c0-6500-4650-8650-650650650650` plus twelve more shared literals. `handleAccrualSupabase`
(`serve-built.mjs:708`) precedes `handlePrepaymentsSupabase` (`:713`), so the accrual lane answered
`/rest/v1/accounting_work` and `/rest/v1/coa_accounts` for the prepayments client. Neither branch
could fail alone. **Every existing gate was blind to it**: N5 passes any handler that guards
`clientFilter !== eq.${OURS}` whatever `OURS` is, and the verb census passes two lanes with disjoint
verbs — two lanes at one address behave exactly like the unscoped claim N4 bans. A new
`client-id census` in `e2e-fixture-ownership.test.ts` measures it: **RED first** (17/1, naming both
files), with a synthetic positive control passing in the same run. #653's space re-minted onto the
house convention (`-6536-4653-8653-653653653653`, address `65365365-…`, the shape #623/#638/#639/#643
use); #652 untouched. AFTER: ownership **18/18**, prepayments **6/6**, accrual **14/14**, plans **9/9**.

**2 · `a5d04ee6` — `firm-navigation-walk.spec.ts:370`, the client-register population. PRE-EXISTING.**
`toHaveCount(4)` against the shared unfiltered register, which grows: #632 +2, #641 +3, #633 +1.
8 rows here, **7 at `origin/main`** — recorded by `625-final.md:59` and
`625-review-adversarial-round1.json:57-60`, both correctly out of that ticket's scope. The count is
now DERIVED from `serve-built.mjs`'s own `clients` block (literal `name:` rows plus each `...SPREAD`
resolved through the lane export it names), so an appending lane is absorbed while a lane that
ANSWERED the unfiltered read still fails; an unresolvable spread throws with the fix in the message,
and a non-vacuity guard catches a derivation that reads nothing. 9/1 → **10/10**.

**3 · `5a93b33b` — `shell-migration-walk.spec.ts:728`, plain `/work`. PRE-EXISTING, not a regression.**
`getByText('No work yet')` absent because the list is populated with #641's roster (snapshot: five
"Work List Fixture" rows). `/work` is firm-wide and sends `p_client: null`; `answerWorkListPage`
answers that call from its nine rows by design. `git diff --stat origin/main HEAD` is **empty** for
`e2e/work-list-mock.mjs`, `lib/work/work-list.ts` and `app/(firm)/work/page.tsx`, and
`serve-built.mjs`'s `list_accounting_work` block is untouched by all twelve merges — so the answer
is byte-identical to main. The two cells have contradicted each other since #641 wrote both in one
commit (`554b2da9`); `work-list-walk.spec.ts:34` asserts those rows on this address and is green
(18/18). The cell now routes its own `list_accounting_work` empty page, the idiom its own header
names and already uses for three other reads. 30/1 → **31/31**.

## 3 · Gates (worktree root unless stated)

| gate | exit |
|---|---|
| `node --import ./test/bootstrap.mjs --import tsx --test e2e/e2e-fixture-ownership.test.ts` | **0** — 18/18 (was 16/16; +2 cells) |
| `pnpm typecheck` | **0** — apps/web Done, packages/runtime Done |
| `pnpm lint` | **0** — eslint + every checker, both selftests green |

No app code changed: the diff is four files, all under `apps/web/e2e/`. No migration, no frozen
file, no `serve-built.mjs` edit.

## 4 · Open, not done here

1. **#652's stem is still `65…650…`**, which reads as #650 rather than its own ticket. Cosmetic,
   left alone (re-minting a second lane buys nothing now); the census makes a repeat impossible.
2. **The census watches CLIENT ids only.** Eight cross-file uuid literals remain, all firm, subject,
   actor or record ids (e.g. `dddddddd-…` in chat-parity and home-board). None is a dispatch
   address today. Widening the gate needs each argued, which is a sweep of its own.
3. **It reads source text**, like every gate in that file, so a comment spelling `<key>: "<uuid>"`
   censuses as a declaration. Named in the cell's header rather than met with a comment stripper.
4. **`answerWorkListPage` owns the firm-wide read.** Any future walk wanting an empty `/work` must
   route its own, as this one now does. Worth an issue only if a third cell trips on it.
5. `integration/wave-2026-09-15` advanced by two db-test commits (`1fbdca1d`, `2b30ddf2`) while this
   ran; neither touches `apps/web/e2e`, so this branch merges clean.
