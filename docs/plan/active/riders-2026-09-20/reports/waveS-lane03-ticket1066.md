# Riders sweep wave · lane 03 · ticket #1066 — the chooser reaches a second enrolled account, on the wire too

**Branch** `riders/wS-lane03` in `C:\Users\zhant\Desktop\clara-wt\656`, base `7bc5a710f`.
**Database** `clara_l06` on `127.0.0.1:55746` — **no migration** (see §5: this ticket touches no
PostgreSQL object at all, exactly as the plan's migration table says). **Playwright triple**
3550 / 3551 / 3552.
**Status: DONE.** The ticket was live on this branch and is now built, tested and documented.

| commit | what |
|---|---|
| `546a62953` | `fix(web): #1066 the advance chooser offers a second enrolled account too` — `advanceCandidates` widened, `claimantEnrolmentId` moved above it, new `claimantLabel` memo, one red-first cell |
| `5c1dccc94` | `test(web): #1066 pin the second-account match's edges: case, retirement, unread` — three more cells, no production change, non-vacuity proved by hand (see §4) |
| `51b7de74f` | `docs(web): #1066 the claim form's own advance-chooser widening` — first `apps/web/README.md` pass |
| `9832a527f` | `fix(web): #1066 the wire carries a cross-account allocation's own account` — `toClaimWire`'s 4th argument, three cells |
| `2ecc0947c` | `fix(web): #1066 the preview groups by real account, and the form wires both` — `derivedLines`'s 2nd argument, the form's `advanceAccountCodes` lookup, a mounted end-to-end cell, `README.md` corrected |

Working tree clean. Nothing pushed, no PR, no GitHub write, no other worktree touched apart from
this report file. No mid-task status request arrived.

---

## 1 · The seams I tested at

Written down before the first cell, from the ticket's own "Key interfaces" ("The claim form's
advance-candidate filter (the predicate currently scoped to `draft.claimantAccountCode`)") and from
what building it against the real door actually required:

- **`StaffExpenseClaimFormView`** (`apps/web/components/accounting/staff-expense-claim-form.tsx`),
  mounted — the ticket's own named seam. Its rendered `advanceId` `<select>` (the chooser) and its
  submitted claim body (through the harness's `submit` stub) are both driven.
- **`toClaimWire`** and **`derivedLines`** (`apps/web/lib/work/staff-expense-claim.ts`) — pure
  functions with their own extensive existing test file. Not named by the ticket's own "Key
  interfaces" list, but required once the chooser widening was built (see §3, "what the brief did
  not name").
- **Not a seam and not touched**: the database (`clara._assert_claim_basis`, 0340) — read only, to
  discover its two-armed match, its head-consistency check and its allocation-account default,
  never edited; the runtime's wire schema (`packages/runtime/src/workRoutes.ts`) — read only, to
  confirm `WireClaimAllocation.accountCode` is already an accepted, optional field (its own doc
  comment: "stated only when this advance sits on a DIFFERENT enrolled account" — this ticket is
  what makes that sentence true); the chat lane's own successor contract (`chatTurn_v22`) — out of
  scope per the ticket.

## 2 · Was the ticket still live? Yes, unbuilt

`gh issue view 1066 --repo BELCORT-SDN-BHD/clara --json title,body,comments` — 0 comments, no owner
ruling dated 2026-09-20 on this issue itself; the newest and only Agent Brief is the issue body.
Read against the branch at `9832a527f`'s parent (i.e. before this ticket's own commits):
`staff-expense-claim-form.tsx:296` (`advanceCandidates`) still filtered to
`a.account_code === code` alone — the exact predicate the brief names as stale — and
`toClaimWire`/`derivedLines` carried no account-lookup parameter at all. Fully unbuilt.

The lane's own scan note ("#1066 rides #1052's web half") and `apps/web/README.md`'s #1052 section
("What is deliberately NOT here… That filter… [is] #1066's") both independently confirmed the same
reading before I wrote a line.

## 3 · Each acceptance criterion, with its evidence

**AC1 — "A claimant with two dedicated advance accounts can select and confirm advances from both
accounts through the form, not only through the door or a future chat tool."**

Built in two parts, because building only the first satisfies the chooser's own display but not
"confirm… through the form" — a claim confirmed that way would be **refused at the door**:

- **The chooser's own filter.** `advanceCandidates` now also admits a `staff_advance_summary` row
  whose `account_code` differs from `draft.claimantAccountCode` when its own `enrolment_active` is
  true (mirroring 0340's `sa2.active`) and its `person_label`, normalised
  `.trim().toLowerCase()`, equals the claimant's own resolved label, normalised the same way.
  - Test: `ticket 1066 the chooser also offers an outstanding advance on a DIFFERENT live enrolled
    account with the same claimant label` — PASS.
    `apps/web/components/accounting/staff-expense-claim-form.test.tsx`.
- **What the brief did not name, and had to be built for AC1 to mean "confirm… through the form"
  rather than only "see it in the dropdown".** `toClaimWire` always sent
  `claim.advance_account_code` as the raw typed field, and `clara._claim_allocations` (0301)
  defaults any allocation missing its own `account_code` to that same field. A confirmed
  second-account row would therefore have crossed the wire silently mis-tagged as living on the
  claimant's own account — refused `not_this_client` at the door, or (for a lone second-account
  advance, no explicit list) refused by 0340's own head-consistency check
  (`claim.advance_account_code names an account that is not the first allocation's`). This is
  exactly the gap `apps/web/README.md`'s #1052 section flagged in advance: "the per-allocation
  account code and derived-preview legs a cross-account allocation would need on the wire, are
  #1066's." `toClaimWire` took a 4th argument (`advanceAccountCodes`, an advance_id→account lookup)
  and now sets `claim.advance_account_code` to the confirmed list's HEAD allocation's REAL account,
  and states a non-head row's own `accountCode` only when it differs from the head's.
  - Cells (pure, `staff-expense-claim.test.ts`, expected values read off
    `packages/db/tests/staff-expense-claim-allocations.test.mjs`'s own `p931.accounts` worked
    example and its `allocClaim` helper — an independent, already-door-proved source, not invented
    here):
    - `wire.allocations.accounts: a NON-HEAD row on a different enrolled account states its OWN
      accountCode` — PASS.
    - `wire.allocations.accounts: a HEAD advance on a SECOND account becomes the claim's own
      advanceAccountCode` — PASS.
    - `wire.allocations.accounts: with no lookup given, behaviour is byte-identical to before this
      ticket` — PASS.
  - End-to-end cell, the real mounted form, the real suggest-by-date button, the real submitted
    body: `ticket 1066 the SUGGESTED split across two accounts is confirmed and sent with each
    row's own account` — PASS. `staff-expense-claim-form.test.tsx`. Asserts
    `claim.advanceAccountCode === "1190"` (the head, the claimant's own) and
    `claim.advanceAllocations === [{advanceId: FARAH_ADVANCE, amountCents: 30000},
    {advanceId: SECOND_ACCOUNT_ADVANCE, amountCents: 18000, accountCode: "1191"}]`.
  - Also confirmed live against the actual door's OWN test suite reading (not re-run by me — no
    migration means no db gate chain to run for this ticket — but read in full at
    `packages/db/tests/staff-expense-claim-allocations.test.mjs:298-361`, `p931.accounts`, which
    proves this exact wire shape posts two credit legs through
    `clara.admit_staff_expense_claim_work`).
  - Browser confirmation: the pre-existing `t931 the advance arm suggests a date-ordered split, and
    sends the split the person confirmed` e2e walk (single-account, unaffected) still PASSES on my
    triple (§6) — proving the wire change is backward-compatible in the one browser-level case that
    already existed.

**AC2 — "A lawful second-account allocation that fails only on label spelling is either accepted
(case/whitespace-tolerant) or refused naming the mismatch as a labeling issue."**

Already satisfied by #1052 (landed earlier in this lane, `681c26081`): the wall's arm (b) now
matches on `lower(btrim(person_label))`, so a spelling/case/whitespace difference is **accepted**,
never refused. This ticket's own chooser filter uses the identical normalisation
(`.trim().toLowerCase()`) for the same reason 0340 does, so the chooser and the wall can never
disagree about which second-account rows are "the claimant's" — evidence:
`ticket 1066 the second-account match is case- and whitespace-tolerant, exactly as the wall's own
lower(btrim(...))` — PASS.

**AC3 — "Existing single-account claim behavior is unchanged."**

- Every pre-existing cell in both touched files still passes (§6 gate counts) — including the
  pre-#1066 chooser test that explicitly proves "a DIFFERENT claimant's advance — never offered
  here" (a different person's second account, label mismatch) stays excluded.
- Three new cells pin the boundary directly: `ticket 1066 a second account's advance under a
  RETIRED enrolment is not offered, even with the claimant's own label` (mirrors the wall's
  `sa2.active`) — PASS; `ticket 1066 with the enrolment register unread, no second-account
  candidate is offered` (the conservative default `advanceSourceEnrolment` already takes) — PASS;
  `wire.allocations.accounts: with no lookup given, behaviour is byte-identical to before this
  ticket` — PASS.
- Non-vacuity, proved by hand rather than only asserted (work order rule 4's vacuity control,
  applied here even though this ticket is not a test-only ticket): I temporarily reverted
  `advanceCandidates`'s filter to drop the `enrolment_active` guard and separately to drop the
  `.trim().toLowerCase()` normalisation, re-ran the file each time, watched the corresponding new
  cell (and, for the normalisation drop, the exact-match cell too) go red for exactly the reason
  expected, then restored the file byte-for-byte (`diff` confirmed identical) before committing.
  Full transcript in this session; not re-pasted here for length.

## 4 · What was deliberately left

- **No staff master** — out of scope per the ticket, tracked separately (#1049, re-parented to the
  mainline per the 2026-09-25 ruling this lane's own prompt carries).
- **No widening of `chatTurn_v22`'s own successor contract** — out of scope per the ticket. Nothing
  in this ticket touches a frozen chat or Work tool body; no successor contract is owed.
- **No touch to `StaffAdvanceAllocationsEditor`** (the shared editor #1052 already widened with
  `sourceEnrolment`) — its candidate-naming logic already generalises to any candidate whose
  `enrolment_id` differs from the claimant's own, so a second-account candidate is named "for free"
  with no change to that component. Verified in the end-to-end cell's own data (the second-account
  row in the mounted test carries a distinct `enrolment_id`).
- **No change to `suggestAllocationsByDate`** — already account-agnostic (oldest `issue_date`
  first, across whatever candidates it is given), proved by using it unmodified in the end-to-end
  cell.

## 5 · Migration

**None.** Confirmed against the plan of record before building
(`docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md` line 86: `#1066 (no)`) and confirmed again by
what the ticket actually needed: every change is in `apps/web` (TypeScript only). No new migration
file, no recut of an applied one, no gate-chain entry, no prestate pin.

## 6 · Gates, with counts

- **Touched test files**, each run alone first:
  - `apps/web/lib/work/staff-expense-claim.test.ts` — 23 tests, 23 pass, 0 fail.
  - `apps/web/components/accounting/staff-expense-claim-form.test.tsx` — 22 tests, 22 pass, 0 fail.
  - Both together: 45 pass, 0 fail.
- **`pnpm typecheck`** (repo root) — `apps/web` and `packages/runtime` both `Done`, no errors.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (repo root, the runner's own env) — exit 0, every
  `apps/web` lint selftest battery PASS (`check-test-manifest`, `check-message-keys`,
  `check-ui-add-guard`), no eslint errors anywhere in the workspace.
- **Whole `apps/web` unit suite once**, `node scripts/run-tests.mjs`: **5187 tests, 5185 pass, 0
  fail, 2 skipped** (the pre-existing Windows-only skips RIG.md names; unrelated to this ticket —
  the skip count matches an earlier baseline run taken before this ticket's later commits).
- **Browser walk**: `apps/web` was touched, so the whole-suite gate applied; I did not edit an e2e
  spec file, so the letter of work-order rule 8 ("each browser walk you touched") named none. Given
  the wire-format change, I ran the one existing spec that already exercises this exact form anyway,
  for extra assurance: `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3550 CLARA_E2E_NEXT_PORT=3551
  CLARA_E2E_RUNTIME_PORT=3552 pnpm --filter @clara/web e2e staff-expense-claim-walk` — **14
  passed**, 0 failed, including `t931 the advance arm suggests a date-ordered split, and sends the
  split the person confirmed` (the single-account multi-advance walk, proving the wire change is
  backward-compatible at the browser level).
- **No SQL functions added** — `operation-census.test.mjs` / `rig-isolation.test.mjs` do not apply.
- **No `packages/runtime` touch** — `check-frozen-workflows.mjs` / `check-parts-parity.mjs` do not
  apply.

## 7 · Docs

`apps/web/README.md`: a new `## #1066 —` section (commit `51b7de74f`), corrected in the following
commit (`2ecc0947c`) once the wire/preview widening turned out to be necessary — the section now
states the actual final shape rather than the first, narrower pass. It explicitly flags that
#1052's own "What is deliberately NOT here" paragraph is no longer current and names what
superseded it, per this repo's convention of layering ticket sections rather than silently editing
an earlier one's prose.

No `CONTEXT.md` change: no new domain vocabulary. "Second enrolled account", "confirmed allocation
list" and "staff-advance enrolment" are all already-defined terms this ticket uses, not new ones it
introduces.

No `apps/web/messages/en.json` change: no new copy. The second-account naming reuses #1052's
existing `StaffExpenseClaim.advanceSourceEnrolment` key verbatim.

## 8 · Successor contracts

None. This ticket touches no frozen chat or Work tool body, and the ticket's own "Out of scope"
explicitly excludes widening the chat lane's `chatTurn_v22` successor contract.

## 9 · Follow-ups worth filing

- **None new.** The one real risk I found while building this — the wire's `advance_account_code` /
  `_claim_allocations` default-fill interaction that would have silently mis-tagged a cross-account
  allocation — is fixed by this ticket itself (§3, AC1), not deferred.
- The staff master (#1049) remains the eventual, correct fix for label-based claimant matching; this
  ticket (like #1052 before it) is confirmed to meet the interim ruling, not to replace that ticket.

## 10 · Anything unverified

- I did not run a live probe against the actual PostgreSQL door (`clara.admit_staff_expense_claim_work`)
  with a hand-built cross-account payload on this lane's own database — this ticket needed no
  migration and touches no database object, so no db-gate chain applies, and I relied instead on
  (a) reading migration 0340's live body directly to derive the exact wire contract, and (b) the
  existing, already-door-proved `p931.accounts` test in
  `packages/db/tests/staff-expense-claim-allocations.test.mjs` as the independent source of truth
  for both the wire shape and the derived-preview grouping. I consider this sufficient rather than
  unverified in the risk sense, but flag it because it is a database behaviour I read rather than
  drove myself in this session.
- I did not confirm whether any other in-flight lane's ticket also touches
  `apps/web/lib/work/staff-expense-claim.ts` or `staff-expense-claim-form.tsx` this wave — the
  work order's shared-file list does not name either file, and the SWEEP-PLAN's lane table places
  every ticket touching this claim-form family inside lane 03 alone, so I take this as settled
  rather than genuinely open, but the integrator should still diff against the lane's own base
  before merging, as usual.
