# Wave 4 · lane 01 · ticket #947 — Find the net-pay payment on the bank statement and propose its settlement

**Status: DONE.** Worktree `C:\Users\zhant\Desktop\clara-wt\635`, branch `riders/w4-lane01`,
database `127.0.0.1:55741/clara_l01`. Base `cd2925391`.

```
git status (at start)                          →  clean
git log --oneline cd2925391..HEAD (at start)   →  20 commits: #944 stopped, #945 done, #946 done
git status (at end)                            →  clean
```

Three commits, all naming #947:

```
6d33e2abf test(web): #947 the bank walk finds a payroll run's net-pay payment and accepts it
95b5bdcca feat(web): #947 a payroll run finds its bank payment on the Matching tab, and Needs you says when it has not
43d1489e1 feat(db): #947 payroll net-pay finds its bank payment and settles through the existing match door
```

## The ticket is the contract

`gh issue view 947 --comments`, re-read live on this branch 2026-09-24. The BODY is the only
Agent Brief. Both comments (belcorttao, 2026-09-18 and 2026-09-19) are AI-triage coordination
notes, not owner rulings, and neither is dated 2026-09-20 — so the body stands and both comments
are followed as guidance, each discharged where it lands:

1. *"Whichever of the three [#938/#947/#949] lands first defines the shape, and the other two
   reuse it rather than inventing a second."* — #657 landed first (PR #954, closed before this
   wave), so its **Settlement candidate row** is the shape this file reuses (CONTEXT.md, migration
   header, packages/db/README.md's `## #947` section).
2. *"AC2's Needs-you arm must render through the typed row-kind vocabulary in
   `apps/web/lib/firm/needs-you.ts`, never a loose string literal."* — `payroll_net_pay_unsettled`
   is the thirteenth member of `REVIEW_QUEUE_ROW_KINDS`, registered in all four places that file's
   own extension-point note lists.

**Verified live, not already satisfied.** Before building, on this branch and this database:
`clara._payroll_net_pay_unsettled`, `clara._payroll_settlement_bank_candidates`,
`clara.get_payroll_settlement_candidates`, `clara._settle_payroll_net_pay_core` and
`clara.settle_payroll_net_pay` did not exist; `clara.list_review_queue` projected ELEVEN row kinds
(twelve after #946 landed) and no `payroll_net_pay_unsettled`; `apps/web/lib/firm/needs-you.ts`'s
`REVIEW_QUEUE_ROW_KINDS` ended at `payroll_posting_blocked`. Blocked-by (#946) was DONE on this
branch (`e91e35d11`), so a real posted payroll entry (2040 Salaries Payable credited) was available
to build and test against.

## The seams I tested at (written before the first test, WORK-ORDER rule 4)

| | Seam | Where |
|---|---|---|
| S1 | `clara._payroll_net_pay_unsettled(uuid)` — THE LEDGER READ (the FIFO arithmetic) | `packages/db/tests/payroll-settlement.test.mjs` |
| S2 | `clara.get_payroll_settlement_candidates(uuid)` — AC1 | same |
| S3 | `clara.settle_payroll_net_pay(uuid,uuid,uuid,text)` — AC2, reusing `clara._match_bank_line_core` | same |
| S4 | the three routes clearing the row (AC3) | same |
| S5 | ambiguity, never resolved (AC4) | same |
| S6 | `clara.list_review_queue(jsonb,jsonb,integer)` — the Needs-you arm (AC2's arm) | same |
| W1 | `REVIEW_QUEUE_ROW_KINDS` / `isKnownReviewQueueRowKind`, `needsYouRowHref` / `hasOwningTab`, `getNeedsYouAffordance` | `apps/web/lib/firm/needs-you-payroll-settlement.test.ts` |
| W2 | `getPayrollSettlementCandidates`, `settlePayrollNetPay` — wire shape | `apps/web/lib/bank/payroll-settlement-{reads,doors}.test.ts` |
| W3 | `PayrollSettlementsSection` — the rendered surface | `apps/web/components/bank/payroll-settlements-section.test.tsx` |
| E | the real built app, real client code, mocked PostgREST — AC5's bank walk | `apps/web/e2e/payroll-settlement-walk.spec.ts` |

No cell sits anywhere else. Every DB slice was one test → red for the right reason → the minimal
code → green → commit (recorded below, including the bugs the tests actually found); the web/e2e
layer landed as two further green slices on top. The migration was re-applied via
`CLARA_MIGRATION_REDO` four times while it was built (recorded below).

## Acceptance criteria, each with its evidence

### AC1 — a read returns, per client, each posted payroll run whose net pay is not yet settled, with candidate bank lines matching its amount within the agreed window; derived entirely from live state, stores nothing

**DONE.** `clara.get_payroll_settlement_candidates(p_client uuid) returns jsonb` — bookkeeper+,
`clara_authenticated` only, SECURITY DEFINER. Built from two ungranted internals:

- `clara._payroll_net_pay_unsettled(p_client uuid)` — a per-client **FIFO allocation**: every
  approved, non-reversed 2040 debit (however it was booked) against every approved, non-reversed
  `payroll_run`-flagged 2040 credit, oldest run first. Both sides explicitly exclude anything
  flagged `payroll_obligation` (0194/#643's own lane, MEASURED live on this database to also
  credit 2040 — see "What the prestate found," below).
- `clara._payroll_settlement_bank_candidates(p_client, p_target_cents, p_around, p_window_days=10)`
  — live, unspent, unexcepted bank lines whose signed amount is the EXACT negative of the target,
  within ten calendar days either side of the run's own posting date.

Cells (`packages/db/tests/payroll-settlement.test.mjs`), driven against real doors and a real
posted #946 payroll entry (net pay RM 4,255.70 = 425570 cents, #946's own worked example, reused
as an independent source of truth):

| Cell | Result |
|---|---|
| S1 · a posted run's own credit is fully unsettled with no debit against it | `unsettled_cents = 425570`, `period_month = 2026-08-01` |
| S1 · a hand-booked debit to 2040 reduces the run's own unsettled cents, to the cent | a plain `draftEntry`/`approveEntry` debit of 100000 cents → `unsettled_cents = 325570` |
| S1 · a `payroll_obligation`-flagged 2040 credit and its own debit never mix into a payroll run's own balance | a labelled 0194-shaped fixture (credit 50000, then its own flagged payoff debit 50000) leaves the real run's `unsettled_cents` at 425570, unchanged |
| S1 · two runs, oldest charged first (FIFO) | a partial debit (half of 425570) posted between two runs' month-ends: the OLDER run absorbs it whole; the newer run stays fully unsettled |
| S2 · a run with no candidate bank line offers an empty candidate list | `candidates: []`, never a guess |
| S2 · an exact-amount bank line within the window is offered; a wrong amount and a far date are not | one candidate, `amount_cents=-425570`, `date_delta_days=5`, `class_hint='payroll'` (the estate's own classifier, 0040:3177, unchanged) |
| S2 · a candidate already riding a live match, or under an open exception, is never offered | driven through the REAL `except_bank_line` door (owner floor) → `candidates: []` |

### AC2 — a new Needs-you arm renders month/amount/candidates; accepting posts the settlement through an existing bank-side door with a receipt; declining leaves the row untouched

**DONE**, in two halves.

**The door.** `clara.settle_payroll_net_pay(p_client, p_entry, p_line, p_op_key)` →
`clara._settle_payroll_net_pay_core`: books **Dr 2040 / Cr the bank's own COA** for the run's own
unsettled cents, approves it directly (`via_wake_kind='interactive'`, an ALREADY-admitted value —
no CHECK widening owed), writes the `entry_post_receipts` row, then calls
`clara._match_bank_line_core` **directly** — the ctx-threading idiom #655/#657 established, never
re-derived from a JWT — to bind the new entry to the chosen line. This is "through an existing
bank-side door" LITERALLY: no `bank_matches`/`bank_match_line_members`/`bank_match_entry_members`
write happens anywhere in this file's own code; every one of those rows is written by the REUSED
core. See "Why not `settle_from_bank_line`" below for why #655/#657's own settlement composite is
not that door.

Cell `S3 · accepting the candidate books Dr 2040 / Cr bank, approves it, writes a receipt, and
matches the line through the existing bank-side door` drives the whole chain and asserts, off the
real catalog: the two journal_lines (`2040` debit / bank-COA credit, exact cents), `maker_actor =
checker_actor` (one human's own accept act), the `entry_post_receipts` row
(`via_wake_kind='interactive'`, `approval_arm='payroll_settlement_interactive'`), a REAL
`bank_matches` row (`status='live'`) with one `bank_match_line_members` row
(`amount_cents=-425570`) and one `bank_match_entry_members` row pointing at the **settlement**
entry (never the original payroll entry) at the same negative amount — `clara._match_bank_line_core`'s own shape, unmodified. A replayed `op_key` returns the byte-identical
receipt and writes no second entry (`S3`'s own final assertion).

Refusals, each driven for real: `S3 · a bank line whose amount does not match the unsettled cents`
→ `CLR10`/`amount_mismatch`, nothing written; `S3 · an already-settled run refuses a second
acceptance` → `CLR10`/`already_settled`; the same cell drives a non-payroll entry →
`CLR10`/`not_a_payroll_entry`.

**The Needs-you arm.** `clara.list_review_queue` gains `row_kind='payroll_net_pay_unsettled'`
(section `needs_you`, lane `needs_you`), spliced additively beside #946's own `payroll_rows` CTE —
the 0146/0168/0180/0260/0288/0297 splice family. Cell `S6 · the queue carries the row with the
month and the amount, and clears it once the run is settled` drives the real queue read
(`clara.list_review_queue`) before and after a real `settle_payroll_net_pay` call: the row carries
`section='needs_you'`, `lane='needs_you'`, `amount_cents=425570`, `period='2026-08-01'`, a sentence
matching `/Payroll for August 2026 is posted/`, `auto=false`, `high_stakes=false`, and is GONE
after settlement. **Declining leaves the row untouched**: `S6 · declining leaves the row untouched`
reads the queue twice with no act in between and asserts byte-identical rows — there is no
dismissal call to make, by design (see AC3).

The web side: `PayrollSettlementsSection` (mounted on `/bank?tab=matching`, above the ordinary
matcher) renders every unsettled run with its month, amount and candidate table, each candidate
with its own Accept button. `apps/web/lib/firm/needs-you.ts`/`-links.ts`/
`components/firm/needs-you-affordances.tsx`/`messages/en.json` register the kind in the four
places #946's own extension-point note names; `getNeedsYouAffordance` is `null` (the row is a
POINTER — accepting names a SPECIFIC candidate line among however many a run offers, which the
row's own fixed shape cannot carry), so the link is the whole affordance.

### AC3 — a cell proves the row disappears once the settlement exists, by each of the three routes, with no dismissal record written anywhere

**DONE.** Because AC1's read is a pure LEDGER FACT (the account's own FIFO balance), never a
settlement-specific marker, all three routes clear it through the SAME code path, with no
per-route special-casing:

| Cell | Result |
|---|---|
| S4 · route (a): Clara's own door clears the row | `settle_payroll_net_pay` called; the row is gone from `get_payroll_settlement_candidates` afterward |
| S4 · route (b): a person's own hand-booked entry clears the row, with no involvement of `clara.settle_payroll_net_pay` | a plain `draftEntry`/`approveEntry` Dr 2040/Cr bank, NO special door, NO flag — the row is already gone |
| S4 · route (c): a hand-booked entry, then reconciled through the ordinary `match_bank_line` door, clears (and stays clear of) the row | the SAME hand-booked entry as (b), then matched to a real bank line through the ORDINARY `/bank` matcher door (`clara.match_bank_line`) — still gone, both before and after the reconciliation |
| S4 · no dismissal record is written by any route | counts `journal_entries`/`bank_matches` rows for the client before/after route (a): exactly ONE new entry (the settlement itself) and ONE new match (the reused core's own) — nothing else |

### AC4 — ambiguity is shown, never resolved: two equally matching bank lines offer both and settle neither

**DONE.** `S5 · two bank lines matching the same run's unsettled cents are BOTH offered, and settle
neither` — two lines at the exact unsettled amount, both within the window: `candidates.length ===
2`, both descriptions present, the run's `unsettled_cents` is UNCHANGED, and neither line rides a
`bank_match_line_members` row. Nothing in `_payroll_settlement_bank_candidates` ranks, scores or
auto-selects (Q3/SYNTHESIS J2's own law from #657, restated here: no percentage, no tie-break).

### AC5 — the bank walk covers finding and accepting a payroll payment; en and zh copy

**DONE**, with one recorded reading. `apps/web/e2e/payroll-settlement-walk.spec.ts` (2 Playwright
tests, against `payroll-settlement-mock.mjs` on the REAL built app, dispatched beside
`bank-match-mock.mjs` and reusing its client id — a real client sees both panels on one screen):

1. *"finds a posted payroll run's net-pay payment and accepts it, with the right ids and a fresh
   op_key on the wire"* — signs in, lands on `/bank?tab=matching`, reads the run's month/amount/
   candidate off the REAL rendered panel, clicks Accept, and asserts the REQUEST BODY reaching
   `settle_payroll_net_pay` carries the right `p_client`/`p_entry`/`p_line` and a non-empty
   `p_op_key` — plus an axe scan (WCAG 2.1 AA) of the settled page.
2. *"a settlement refusal renders VISIBLY with its code and reason, never silently"* — a second
   fixture run whose candidate always refuses (`amount_mismatch`): the DB's own sentence and
   `CLR10 · amount_mismatch` render in the panel.

**"en and zh copy" reading.** This checkout ships ONE static locale for UI chrome (P1 foundation,
`apps/web/i18n/request.ts`: *"UI chrome is English-first for beta... adding en-GB/ms/zh later is a
routing.ts + middleware change"* — no `zh` locale exists to author copy INTO). The house convention
this ticket instead follows is the migration header's own bilingual title line (0226's own
precedent: `-- 0226_bank_match_evidence — #657 (把银行证据匹配到已有入账...)`) — `0298`'s own header
carries one. If the owner instead meant a real `zh` locale for this surface, that is a scoped
product decision (adding a locale) outside a lane ticket's own reach; flagged under
"Anything unverified."

### AC6 — from-scratch apply; the bank and queue batteries stay green

**Partially claimed, honestly.** *"From-scratch apply"* is the one I could not run as such: this
lane's database is migrated, not disposable, and the work order forbids a second from-scratch chain
on a lane cluster (0154 pins the cluster-wide role count) — the integrator runs the from-scratch
proof on a disposable cluster. What I ran in its place is the redo-safety proof the wave-2 addendum
asks for: every one of the five new bodies is `create or replace` (a first cut used bare `create
function` and a redo against the already-applied file hit `already installed` — fixed and
re-verified, recorded below), and the queue splice detects its own marker and no-ops on a second
apply (also verified by redo).

**The bank and queue batteries stay green** — driven, not assumed:

- The new battery: **17/17** (`payroll-settlement.test.mjs`, full gate chain).
- The wider bank family: `bank-line-existing-booking` (#657's own), `x38-wave-c-b-match`,
  `x40-wave-c-c-tieout`, `x42-af2`, `f-a2-receipt`, `f-a2-receipt-2` — **119/119**.
- Every queue-reading battery: `payroll-summary-posting`, `payroll-summary-facts`,
  `ninth-rowkind-seeding-proposal`, `work-question-reads`, `depreciation-authority-pending-rowkind`,
  `a21-read-surfaces`, `client-work-pack`, `dba-close-gate-codeability`, `wave4-chart-rows` —
  **107/107**.

## The migration

`packages/db/migrations/0298_payroll_net_pay_settlement.sql`, applied checksum
`012f01664c276cbbebd1f39581db2a39315a786a8b7f6c582300e12bda0bb90b`. Ledger after: **292 files,
frontier `0298_payroll_net_pay_settlement`.**

Structure: header (spec of record, why not `settle_from_bank_line`, the MPERS/MFRS derecognition
basis checked against the standard, why "unsettled" is a ledger fact not a marker, what the
prestate found about 2040 not being payroll-exclusive, the window, what this file does not add) ·
§A prestate · §A the ledger read · §B the match-basis read · §C the granted candidate read · §D the
settlement core and door · §E the queue splice · §Z tail.

### Prestate pins — MEASURED on this lane database, every one listed (wave-3 addendum)

| Signature | sha (the pin) | Why pinned |
|---|---|---|
| `clara._post_payroll_run(uuid)` | `482d3cebb2c80629b9785ee6fef76dd2b8dd3121a7268d6c31dbfa95e4afb05b` | this file's whole read depends on the `flags->'payroll_run'->>'period_month'` marker THAT body writes |
| `clara._match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)` | `42094d4b8ea1b4e3a027d1122000308e3a5b4514cd63d9a2cda2dec0e4eadcf2` | this file's settlement door calls it DIRECTLY (ctx threaded, #655/#657 idiom) |

**Recut, BIMODAL** (its pre-image sha OR a body already carrying this file's own marker):

| Signature | PRE-image sha (the pin) | POST-image sha |
|---|---|---|
| `clara.list_review_queue(jsonb,jsonb,integer)` | `c26d520df3b0b29d127707a6969b924db4964d31884098e6897ff49454959b49` (measured as `sha256(pg_get_functiondef(...))`, the 0297/§H idiom — NOT the same basis as a `prosrc`-only pin) | `6ccde6790b5e377ccadc9127076dd0a2f5fb45805b59e4de6c48d96017d89a74` |

**Non-sha prestate claims:** the CURRENT published `my_sme_starter` template carries `2040 Salaries
Payable` as an ordinary liability (re-derived by state/version, never a pinned id — matches #946's
own AC1 check); `entry_post_receipts_via_wake_kind_check` already admits `'interactive'`
(no widening needed); every existing 2040 leg belongs to one of `payroll_run` /
`payroll_obligation` / `payroll_settlement` (a `raise notice`, informational only after the redo
lesson below — see "What the prestate found").

**New bodies this file mints** (all `create or replace` — see "Redo," below):
`clara._payroll_net_pay_unsettled(uuid)`, `clara._payroll_settlement_bank_candidates(uuid,bigint,date,int)`,
`clara.get_payroll_settlement_candidates(uuid)`, `clara._settle_payroll_net_pay_core(jsonb,uuid,uuid,uuid,text)`,
`clara.settle_payroll_net_pay(uuid,uuid,uuid,text)`.

### What the prestate found — two real defects, fixed in the file, recorded rather than hidden

1. **2040 is NOT payroll-run-exclusive.** A first cut's header claimed it was (grepping the
   migration ladder for the literal `'2040'` finds only 0295/0297); the prestate, RUN against this
   lane database, refused with `11 journal_lines row(s) touch account 2040 without the
   payroll_run marker`. The real writer is `0194_periodic_adjustments.sql`'s (#643) own
   recurring-obligation lane, whose template lets a bookkeeper name ANY liability account
   (invisible to a migration-text grep — it's a per-instance data choice), flagged
   `payroll_obligation` (proven live via #946's OWN S2 duplicate-guard fixture, which drafts
   exactly such a row). Fixed by excluding `payroll_obligation`-flagged entries from BOTH the
   credit and the debit side of the FIFO read, and by rewriting the header's claim to what was
   actually measured.
2. **A hard "every 2040 leg is known" gate refuses its own battery's own route (b)/(c) fixtures.**
   Even after excluding `payroll_obligation`, the SAME check (as a hard `raise exception`) then
   refused the migration's own REDO once the test battery had booked hand-entered, unflagged
   settlement debits — which is AC3's own second and third routes, `NORMAL` operation, not a
   defect. Converted to an informational `raise notice` in both the prestate and the tail.

### Redo (#957) — used, and recorded, including a genuine "first cut got it wrong" fix

`CLARA_MIGRATION_REDO=0298_payroll_net_pay_settlement` was used **four times**:

1. First real redo attempt failed: `#947 prestate: a first apply finds one of this file's new
   names already installed`. Root cause: the file's five NEW functions were written as bare
   `create function` (redo-UNSAFE), not `create or replace function` — a genuine authoring defect,
   not an environment issue. Fixed by converting all five, and by removing the now-redundant "new
   names must not exist" prestate check (redo-safety is `create or replace`'s own job).
2. A second redo, after fixing a real bug in the §E splice (`pnu.client_id` — a column
   `_payroll_net_pay_unsettled`'s own RETURNS TABLE does not carry — corrected to
   `active_settlement_client.id`). **This redo could NOT simply re-run the file**: the splice's
   own marker-detection had already seen `payroll_net_pay_unsettled` in the (buggy) installed body
   from the first botched apply and would have no-op'd forever. `list_review_queue` was manually
   restored to its pinned pre-image first — by reconstructing it programmatically (reversing this
   file's own two substitutions against the then-current catalog body) and asserting the
   reconstruction's sha matched the pin BEFORE installing it — the wave-3 addendum's "prove the
   first-apply branch yourself" discipline, applied to a live bug rather than to a rehearsal.
3. A third redo, after the wiki dynamic-SQL lint's own false positive (below) was fixed by
   rewriting the tail's grant checks off `has_function_privilege(...,'execute')` (the literal word
   collides with the lint's own "definition-wrapper read + the word EXECUTE" heuristic — the EXACT
   #946/0297 lesson, hit a second time against the SAME spliced function) onto `aclexplode`-based
   checks.
4. A fourth redo, after the two "every 2040 leg is known" checks were downgraded from
   `raise exception` to `raise notice` (see above).

The file is written to be safe over its own old effects going forward: every body is `create or
replace`; the splice detects its own marker and no-ops with a notice, and its postcheck re-reads
the COMMITTED catalog in both branches.

### No rig-meta cohort omission (unlike #946)

This file DOES mint newly-granted, callable objects — `get_payroll_settlement_candidates` and
`settle_payroll_net_pay`, both `clara_authenticated` only, bookkeeper+ body-enforced. Both are in
`packages/db/tests/rig-meta.mjs`'s `ALLOWED[clara_authenticated]` roster and in their own
`PAYROLL_SETTLEMENT_0298_COHORT`, checked by `operation-census.test.mjs`'s grant-correctness sweep
(that file's own T17 cell, driven below). The three internals stay ungranted to every role, covered
by that same sweep's default "no role may execute anything unlisted" posture — the #946/0260
posture, restated, no cohort entry owed for them.

## Gates, with counts

| Gate | Command | Result |
|---|---|---|
| the new db battery, full gate chain | `node --test --test-concurrency=1 $GATES tests/payroll-settlement.test.mjs` (109 gate modules) | **17 pass, 0 fail, 0 skip** |
| vacuity control | a mutant `_payroll_net_pay_unsettled` (always reports fully unsettled) installed, battery re-run, `CLARA_MIGRATION_REDO` restored the real body | **8 of 17 cells failed against the mutant** (S1's arithmetic, S3's already-settled/replay, S4's three clearing cells, S6's clearing cell), then **17/17 again** after restore |
| operation-census (SQL functions added; never with reset flags) | `node --test --test-concurrency=1 $GATES tests/operation-census.test.mjs` | **10 pass, 0 fail** |
| rig-isolation (never with reset flags) | `node --test --test-concurrency=1 $GATES tests/rig-isolation.test.mjs` | **32 pass, 0 fail, 1 skip** (pre-existing, destructive-gated per RIG.md) |
| the wider bank family | `bank-line-existing-booking`, `x38-wave-c-b-match`, `x40-wave-c-c-tieout`, `x42-af2`, `f-a2-receipt`, `f-a2-receipt-2` | **119 pass, 0 fail** |
| every queue-reading battery | `payroll-summary-posting`, `payroll-summary-facts`, `ninth-rowkind-seeding-proposal`, `work-question-reads`, `depreciation-authority-pending-rowkind`, `a21-read-surfaces`, `client-work-pack`, `dba-close-gate-codeability`, `wave4-chart-rows` | **107 pass, 0 fail** |
| `packages/db` lint | `CI=true GITHUB_ACTIONS=true pnpm --filter @clara/db lint` | **clean** |
| repo typecheck | `pnpm typecheck` | **Done** (both projects) |
| `apps/web` lint (incl. message-keys, test-manifest, ui-add-guard self-tests) | `CI=true GITHUB_ACTIONS=true pnpm --filter @clara/web lint` | **clean** |
| the WHOLE web unit suite | `node scripts/run-tests.mjs` from `apps/web` | **5004 pass, 0 fail, 2 skip** (pre-existing) |
| browser walk (this ticket's own) | `… e2e payroll-settlement-walk` on 3500/3501/3502 | **2 passed** |
| browser walk (bank matching, regression check on `bank-workbench.tsx`) | `… e2e bank-match-walk` | **6 passed** |
| browser walk (Needs-you inbox, regression check on `needs-you.ts`) | `… e2e home-board-walk` | **28 passed** |
| browser walk (firm navigation) | `… e2e firm-navigation-walk` | **11 passed** |
| e2e fixture-ownership + spec-discovery census | `node --import ./test/bootstrap.mjs --import tsx --test e2e/e2e-fixture-ownership.test.ts e2e/spec-discovery.test.ts` | **48 pass, 0 fail** |
| `firm-scope-db-pins.corpus.ts`'s own consumer | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` | **22 pass, 0 fail** |
| wiki dynamic-SQL lint | `node scripts/check-wiki-dynamic-sql.mjs` | **OK — 1464 definitions, 235 CoR patches, no new waiver** |
| frozen workflows / evaluators / parts parity (not touched; sanity only) | `FREEZE_BASE_REF=cd2925391 node scripts/check-frozen-{workflows,evaluators}.mjs`, `node packages/runtime/scripts/check-parts-parity.mjs` | **OK, no manifest diff, all three** |

## Neighbouring files that moved, and why

| File | What moved |
|---|---|
| `apps/web/lib/firm/needs-you.ts` | `REVIEW_QUEUE_ROW_KINDS` gains `payroll_net_pay_unsettled` at the END; the header's row-kind census note updated to THIRTEEN |
| `apps/web/lib/firm/needs-you-links.ts` | `OWNING_TAB` gains `payroll_net_pay_unsettled: "/bank"` — bare, not `?tab=matching` (see Follow-ups) |
| `apps/web/components/firm/needs-you-affordances.tsx` | `payroll_net_pay_unsettled: null` — accepting names a specific candidate line the row itself cannot carry |
| `apps/web/messages/en.json` | `NeedsYou.rowKind.payroll_net_pay_unsettled`, `NeedsYou.openTab.payroll_net_pay_unsettled`, and a new `ClientBank.payrollSettlements` namespace |
| `apps/web/test/manifest.txt` | four new web test files, at their sorted positions |
| `apps/web/components/bank/bank-workbench.tsx` | the "matching" tab composes `<PayrollSettlementsSection>` above `<MatchingSection>` |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | the reviewed dynamic-SQL barrier entry for `0298`'s own `list_review_queue` splice |
| `apps/web/e2e/serve-built.mjs` | the new lane hook, dispatched beside `handleP657Supabase` |
| `apps/web/e2e/e2e-fixture-ownership.test.ts` | `LANE_MOCKS` and `LANE_DECLARATIONS` gain the new mock file |
| `apps/web/e2e/README.md` | spec counts (51→52, 24→25) and the new spec's residual-list entry |
| `packages/db/package.json` | the gate-chain entry `--import ./tests/payroll-settlement-preintegration-gate.mjs`, in migration order |
| `packages/db/tests/rig-meta.mjs` | `PAYROLL_SETTLEMENT_0298_HUMAN_FNS`/`_COHORT`, the `ALLOWED[authenticated]` addition, the `cohortFailures` call |
| `CONTEXT.md` | **Settlement candidate row**'s own line updated to name #947 as the second instance |

## Docs, in the same commits

- `packages/db/README.md` — a `## #947` section: why not `settle_from_bank_line`, the MPERS/MFRS
  basis, why "unsettled" is a ledger fact, what the prestate found (both defects, and the redo
  lessons), the five bodies, the Needs-you arm, ambiguity, the rig-meta posture, the redo posture,
  the cell census, the vacuity control.
- `CONTEXT.md` — **Settlement candidate row**'s existing entry extended, not a new term (this
  ticket deliberately reuses #657's shape rather than minting a sibling concept).
- `apps/web/lib/firm/needs-you.ts` — the row-kind history note, that file's own documentation of
  the queue (matching #946's own precedent).
- `apps/web/e2e/README.md` — the spec-count and residual-list update.

## Successor contract

**#947 needs nothing from a frozen chat or Work tool to WORK.** The lane is entirely human-driven
(a bookkeeper's own accept click, `via_wake_kind='interactive'`) — no task lane, no reconciler arm,
no runtime call of any kind. `FREEZE_BASE_REF=cd2925391 node scripts/check-frozen-workflows.mjs`
shows no manifest diff from this ticket.

What a frozen tool WILL need is a way to tell a person, in conversation, whether a payroll run's net
pay has left the bank yet and what candidates exist if not — composing with #946's own
`read_payroll_posting_state` (which reports whether the run POSTED) the way that contract composed
with #945's `read_payroll_fact_state`. Delivered here as a contract for the `chatTurn_v22` /
`claraWork_v6` cut, **not built**.

**Tool name:** `read_payroll_settlement_state`

**Zod input** (`.strict()` throughout, the `trade-invoice-basis.ts` discipline):

```ts
export const readPayrollSettlementStateInputSchema = z.object({
  client_id: z.string().uuid().describe("the client whose payroll runs these are"),
  document_id: z.string().uuid().optional()
    .describe("narrow to the one payroll summary's own posted entry, if named; omitted reports every unsettled run for this client"),
}).strict();
```

**Door call, with argument order.** No new door is needed — the granted read this file ships
already carries everything a chat report needs:

```ts
// clara.get_payroll_settlement_candidates(p_client uuid) — argument order as written.
const runs = await callDoor("clara.get_payroll_settlement_candidates", [input.client_id]);
// runs: [{entry_id, document_id, filing_id, posting_date, period_month, net_pay_cents,
//         unsettled_cents, candidates: [{line_id, bank_account_display, entry_date, description,
//         amount_cents, date_delta_days, class_hint}]}]
const scoped = input.document_id
  ? runs.filter((r) => r.document_id === input.document_id)
  : runs;
// scoped.length === 0 means EVERY run for this scope is settled (or none has posted) —
// clara.get_document_state / #946's read_payroll_posting_state distinguishes those two, this
// tool does not need to.
```

**Refusal mapping** (the estate's typed codes → what the tool says):

| SQLSTATE / shape | Tool refusal | What the person is told |
|---|---|---|
| `CLR03` | `not_permitted` | "You are not a member of the firm that holds this client." |
| `CLR11` (`client not in your firm`) | `client_not_found` | "I cannot find that client under your firm." |
| `document_id` named, no matching run in `runs` | NOT a refusal | Report that this run's net pay is either already settled or not yet posted — never guess which; point at `read_payroll_posting_state` (#946) for the posting half. |
| `runs` (scoped or not) is `[]` | NOT a refusal | "No payroll run is waiting on its bank payment." (the panel's own empty-state sentence, reused verbatim) |
| one or more runs returned | NOT a refusal | For each: the month (`period_month`), the amount (`unsettled_cents`), and EVERY candidate's own date/description/amount — never picking one, even when exactly one is offered (AC4's own law, carried into conversation). |

**Part kind:** `freeform_result` — already declared and already emittable
(`chatTurn.v16.prompt.ts:187`), so this contract adds NO part kind and `check-parts-parity.mjs`
needs no new entry. Reporting a settlement state is a READING, not an admitted Work: it mints no
`work_accepted` and asks no `work_question`. **No accept-via-chat tool is proposed here** — the
brief names "the bank surface or Needs you" as the two accept points, never chat, and minting one
would be widening scope this ticket's own body does not ask for (see Follow-ups if the owner wants
one).

**Prompt stanza** (for the successor chat body, verbatim):

```
WHETHER A PAYROLL RUN'S NET PAY HAS LEFT THE BANK. A payroll run that has POSTED (see
read_payroll_posting_state for that half) still owes its net pay until the bank shows the payment
left. Call read_payroll_settlement_state and report EXACTLY what it returns: the month, the amount
still owed, and every candidate bank line offered for it — never picking one for the person, even
when only one candidate exists. The database never chooses; neither do you. If no run is waiting,
say so in the tool's own words. You never accept a candidate through this conversation — there is
no such door, by design: acceptance happens on the bank surface or in Needs you, where a person can
see every candidate side by side before deciding. If asked to accept one, say plainly where that
decision is made and point at it; you do not make it for them.
```

## Follow-ups worth filing

1. **The Needs-you link lands on the bank tab's default view (Accounts), not the Matching view.**
   `ACCOUNTING_ITEMS` (`lib/navigation/tree.ts`) names no `tab` for the `bank` entry the way
   `assets`/`receivables` name `?tab=fixedAssets`/`?tab=aging` — adding the symmetric entry is a
   shared-navigation-registry change four other lanes touch this wave, scoped OUT of this ticket
   deliberately (`needs-you-links.ts`'s own new comment records the reasoning). A follow-up ticket
   that adds `{ id: "bankMatching", segment: "bank", tab: "matching", ... }` (or similar) would let
   `payroll_net_pay_unsettled`'s link become `?tab=matching` in one more line.
2. **Whether the owner wants a real `zh` locale for this surface** (AC5's "en and zh copy") is a
   product question this file did not answer unverified — this checkout ships ONE static locale
   today (`apps/web/i18n/request.ts`'s own P1-foundation ruling), so no `zh` string was authored
   anywhere in the product; the bilingual reading this report took is the migration header's own
   house convention (a Chinese gloss in the SQL comment), not a shipped UI string. If the owner
   meant a real locale, that is routing.ts + middleware scope, well beyond one ticket.
3. **The ten-day window (`c_window_days`) is a judgement, not a measurement**, the same honest
   admission #657's own `SEARCHABLE_FROM` constant carries for its file. If a real firm's payroll
   runs routinely clear later than ten days (a public-holiday-heavy month, say), this is the one
   number to revisit; it is a function default, not a wall, so widening it is a one-line change
   with no migration.
4. **A cleared run has no way to re-open if the acceptance turns out to be wrong.** `unmatch_bank_match` (the ORDINARY, EXISTING bank door) already reverses the match half of a
   settlement; reversing the JOURNAL ENTRY it created is the estate's own ordinary `reverse_entry`
   door. Neither is wired into `PayrollSettlementsSection` specifically, because the ticket's own
   scope is "find and propose," not "undo" — and both doors already exist and already work on any
   entry/match, settlement or not. Worth an explicit owner look once this row kind has been live a
   while, not a gap this ticket leaves silently.

## Anything unverified

- **No real firm has driven this lane end to end.** Every DB cell drives real doors on a real
  database (`draftEntry`/`approveEntry`/`except_bank_line`/`match_bank_line`, all real,
  house-standard fixtures), and the E2E walk drives the real built app against a mocked
  PostgREST — but no real bank statement CSV/OCR ingest, and no real payroll run reaching this lane
  through the actual #945/#946 machine pipeline followed by a real accept click, has been observed
  outside this rig.
- **The from-scratch chain** (0001 → 0298 on a fresh cluster) was not run here — the work order
  assigns it to the integrator on a disposable cluster, and a second chain on a lane cluster is
  forbidden (0154). Redo-safety (every new body `create or replace`) was proven instead, four
  times, including a genuine bug the FIRST redo attempt caught (see "Redo," above).
- **Whether a real firm ever has TWO unsettled payroll runs open on one client at once** (S1's own
  FIFO cell exercises this synthetically) is plausible but not observed against hosted data — the
  FIFO ordering is the accounting-standard "oldest open item first" reading, the same one an
  AR/AP subledger would apply if one existed here (it deliberately does not — AC1/#946's own
  ruling), but it is a reading, not a rule the ticket states explicitly.
- **The "en and zh copy" AC5 reading** (see Follow-up 2) is the one line of this report where the
  evidence available (one static locale, shipped) and the ticket's own words ("en and zh copy")
  point in different directions; flagged rather than resolved by guessing.
