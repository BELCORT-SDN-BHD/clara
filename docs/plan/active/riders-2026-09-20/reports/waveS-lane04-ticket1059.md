# Riders sweep wave · lane 04 · ticket #1059 — a reopen path for a wrongly accepted payroll settlement

**Branch** `riders/wS-lane04` in `C:\Users\zhant\Desktop\clara-wt\657`, base `7bc5a710f`.
**Database** `clara_l07` on `127.0.0.1:55747` (untouched by this ticket — no migration; still 310
files / `0342`, exactly where #1061 left it).
**Status: DONE.** The ticket was live on this branch and is now built, tested and documented, with
NO migration (as the prompt expected).

| commit | what |
|---|---|
| `02921c2a7` | `feat(web): #1059 payroll settlements panel gains a reverse-settlement ceremony` — `payroll-settlements-section.tsx`, its test, `en.json` |
| `175244502` | `test(db): #1059 prove unmatch then reverse reopens a wrongly accepted payroll settlement` — `payroll-settlement.test.mjs` (S8, two cells), `packages/db/README.md` |

Working tree clean. Nothing pushed, no PR, no GitHub write, no other worktree touched apart from
this report file. No status-report request arrived mid-task.

---

## 1 · The seams I tested at

Written down before the first cell, from the brief's own "Key interfaces" plus what reading the
code showed those interfaces actually are:

- **The payroll settlements panel** — `apps/web/components/bank/payroll-settlements-section.tsx`
  (`PayrollSettlementsSection`), mounted for real via `test/hookHarness.ts`'s `renderComponent`
  (the house idiom this file's own three pre-existing #947 tests already use).
- **`clara.unmatch_bank_match(p_client, p_match, p_reason, p_op_key)`** and
  **`clara.reverse_entry(p_entry, p_reason, p_op_key)`** — both general-purpose, both pre-existing,
  neither touched. Driven directly at the DB layer (`packages/db/tests/payroll-settlement.test.mjs`,
  new section S8) and, at the web layer, through the panel's own composed action
  (`unmatchBankMatch` in `lib/bank/match-doors.ts`, `reverseEntry` in `lib/journals/api.ts`).
- **`clara._payroll_net_pay_unsettled(p_client)`** and **`clara.get_payroll_settlement_candidates
  (p_client)`** — the two reads whose agreement, after both doors have run, IS the "run is
  unsettled again" claim (AC2). Read directly, never re-derived.
- **Not a seam, and not touched**: `clara._settle_payroll_net_pay_core` / `clara.settle_payroll_
  net_pay` (0298) — the accept door AC2's brief calls "already correct for this case" — and
  `clara.document_capabilities` / `clara.get_document_state` (0191), investigated as the brief's
  named alternative surface ("the payroll settlements panel, **or** the document page") and found
  NOT to work for this entry today (§3, AC1, "what I found and did not fix").

## 2 · Was the ticket still live? Yes, confirmed independently

`gh issue view 1059 --comments`: **zero comments**, so the body's Agent Brief is the whole
contract; no later brief and no 2026-09-20 owner ruling to override it.

Measured on `clara_l07` before writing anything:
- `clara.get_payroll_settlement_candidates` (0298:299-348) filters `where u.unsettled_cents > 0` —
  a settled run is not merely hidden, there is no row for it at all. No later migration (0299–0342)
  touches this function or `clara._payroll_net_pay_unsettled`.
- `clara._settle_payroll_net_pay_core`'s `insert into clara.journal_entries(...)`
  (0298:460-467) does not list `document_id` among its columns — the settlement entry's
  `document_id` is NULL; the value is carried only inside `flags->'payroll_settlement'->>
  'document_id'`, for reference, never on the column `clara.get_document_state`'s `operation.
  entries` query reads (0191:1303-1304, `where je.document_id = d.id`).
- `apps/web/components/journals/posted-panel.tsx` and `journal-entry-row.tsx` already carry a
  general "Reverse" ceremony for any approved, non-reversed, non-reversal entry; `apps/web/
  components/bank/matching-section.tsx` already carries a general "Unmatch" ceremony. Both are
  exactly the "two general-purpose doors" the brief names, and both are genuinely
  correct-but-undiscoverable from the payroll surface, exactly as described.

This matches the lane scan's own finding in `SWEEP-PLAN.md` line 87 (`#1059 (no)` migration) and
the lane-notes narrative — no correction owed to the scan.

## 3 · Acceptance criteria, each with its evidence

**AC1 — "A settled payroll run's entry is discoverable from the payroll settlements panel (or the
document page) with a clear route to reverse it."**

- **The document page does NOT discover it today**, verified by reading the code, not assumed: the
  settlement entry's `document_id` column is NULL (§2 above), so `get_document_state`'s
  `operation.entries` (the ONLY place `document-state-panel.tsx:306-317` renders a posted-entry
  link) never includes it. Fixing that would mean editing the settlement entry's INSERT, which
  lives in the ALREADY-APPLIED migration 0298 — out of scope for a "no migration" ticket, and
  recorded as a follow-up (§10.1) rather than built here.
- **Built: the payroll settlements panel discovers it.** There is no read that lists a *settled*
  run (0298's own filter, §2), so this is not "add a read and show a row" — the panel keeps its
  own accept receipt (`entry_id`, `match_id` from `settlePayrollNetPay`'s response) in a
  `justSettled` array (`payroll-settlements-section.tsx`, new `JustSettled` type) for as long as
  the panel stays mounted, and renders a card with a `data-testid="payroll-settled-<id>"` block and
  a "Reverse settlement" button for each entry in it — right where the Accept happened.
- Test `p1059.web.reverse` (below) drives this: after Accept, the "Reverse settlement" button is
  found and clicked with `findButtonByText` — **PASS**.
- **What was deliberately left**: this is session/mount memory, not a durable, reload-survivable
  catalogue of every settled run ever accepted — building that would need a new SQL read (a
  migration), which this ticket is expressly told not to add. A person who reloads the page after
  accepting loses the in-panel affordance and falls back to the two general-purpose doors this
  ticket describes (Journals `?entry=<id>` for Reverse, the Matching tab's unmatch-by-id form for
  Unmatch) — genuinely undiscoverable from THIS panel once the session state is gone, exactly the
  gap #1070/#1096-style "materially narrowed" tickets flag when a full fix needs a migration this
  wave withholds. Recorded honestly rather than papered over.

**AC2 — "Reversing restores the run to 'unsettled' (its net pay again offered against bank
candidates) with the reversed entry and reversed match both correctly reflected in the ledger."**

- **DB proof (the ledger claim itself), `packages/db/tests/payroll-settlement.test.mjs`, new
  section S8**:
  - `S8 · reversing the settlement entry BEFORE unmatching its bank line is refused — order
    matters`: settles a run for real, then calls `reverse_entry` directly on the settlement entry
    with NO prior unmatch. **Refused**, `code === "CLR10"`, `detail.reason ===
    "live_bank_match_present"` — proving the order the brief and the ticket narrative describe is
    real, structural DB behaviour, not a UI convention. **PASS.**
  - `S8 · unmatch THEN reverse reopens the run — the ledger, the candidate list and the bank line
    all agree`: settles the same shape, then calls `clara.unmatch_bank_match` (status →
    `"unmatched"`) THEN `clara.reverse_entry` (mirror `status === "approved"`, self-approves).
    Asserts, independently: `_payroll_net_pay_unsettled`'s `unsettled_cents` for the run is back to
    `NET_PAY_CENTS` (425570, the independent worked-example literal this file already uses, never
    re-derived); `get_payroll_settlement_candidates` offers the run again with the SAME
    `line_id` among its candidates; `clara.bank_matches.status = 'unmatched'` for the match id.
    **PASS**, all four assertions.
  - **Vacuity control, run and it bites** (WORK-ORDER rule 4): the `unmatchBankMatch` call in the
    second cell was commented out and the cell re-run alone
    (`--test-name-pattern "unmatch THEN reverse"`) — it failed for the right reason, `CLR10`
    `"this entry is matched to a bank statement line; unmatch the bank match first"` (a second,
    earlier-in-body check with the same `live_bank_match_present` posture as the structural belt
    the first S8 cell pins). The file was then restored verbatim (`git diff --stat` showed the
    original `+100/-1` again, byte-identical to before the probe).
- **Web proof (the composition itself calls both doors, in order, with the right ids/reason)**:
  test `p1059.web.reverse` asserts `unmatch_bank_match` is called exactly once with
  `p_match === "m1"` and the typed reason, THEN `reverse_entry` exactly once with
  `p_entry === "e2"` (the SETTLEMENT entry id, not the original payroll entry id — the receipt's
  own `entry_id`, never re-derived) and the SAME reason, and that the run's own candidate
  (`SALARY GIRO`) is back on screen afterward. **PASS.**

**AC3 — "The reversal path is covered by a test that starts from an accepted settlement and ends
with the run unsettled again."**

- Satisfied at BOTH layers: the DB cell above (`S8 · unmatch THEN reverse…`) starts from a real
  `settle()` call and ends asserting the run's `unsettled_cents` back at its full net pay; the web
  cell (`p1059.web.reverse`) starts from clicking Accept and ends asserting the run's own candidate
  line is rendered again. Neither test recomputes what the code computes (`NET_PAY_CENTS` and
  `"SALARY GIRO"`/`"RM 4,255.70"` are literals from the file's own pre-existing worked example and
  fixture, never derived from the subject under test).

**Out of scope, respected.** `settle_payroll_net_pay` / `_settle_payroll_net_pay_core`,
`unmatch_bank_match` and `reverse_entry` are byte-untouched (no migration in this wave; `git diff
--stat` against `packages/db/migrations/` is empty). No rent-settlement reopen path (#949) was
built — the brief's own "not this ticket's scope" — and the lane notes' own reading ("a composite
door is optional, not required") was taken literally: no new SQL door was minted; the composition
lives entirely in the web client.

## 4 · The change

**`apps/web/components/bank/payroll-settlements-section.tsx`** (component):
- New `JustSettled` type (`settlementEntryId`, `matchId`, `periodMonth`, `unsettledCents`) and a
  `justSettled` array in component state, appended to on a successful Accept whose receipt carries
  a non-null `match_id` (the ordinary-stakes arm; the `awaiting_checker` arm has no live match yet
  and is left exactly as it was before this ticket — a pre-existing gap in the ORIGINAL #947 build
  that this ticket does not touch, noted in §10.2).
- `startReverse` / `cancelReverse` / `confirmReverse` callbacks, the same two-step ceremony shape
  `journal-entry-row.tsx`'s own Reverse button already uses (open a reason box, confirm disabled
  until non-blank, cancel). `confirmReverse` runs both doors inside one `part.act(...)`, in the
  required order, and on success drops the entry from `justSettled` — the panel's own unconditional
  reload (the `useHydratedPart` contract every other act on this file already relies on) is what
  actually re-derives "the run is unsettled again"; nothing here paints an optimistic state.
- New render block, a sibling of the existing unsettled-runs list, one card per `justSettled`
  entry, `data-testid="payroll-settled-<id>"`.
- Two new imports: `unmatchBankMatch` (`lib/bank/match-doors.ts`) and `reverseEntry`
  (`lib/journals/api.ts`) — both pre-existing, both already covered by their own door-level tests.

**`apps/web/messages/en.json`** — six new keys under `ClientBank.payrollSettlements`:
`justSettled`, `reverseSettlement`, `reverseAria`, `reverseReasonLabel`,
`reverseReasonPlaceholder`, `confirmReverseSettlement`. `check-message-keys` (part of `pnpm lint`)
confirms every `t("…")` call in the file resolves.

**`apps/web/components/bank/payroll-settlements-section.test.tsx`** — two new tests (below).

**`packages/db/tests/payroll-settlement.test.mjs`** — new S8 section, two tests (§3), plus
`unmatchBankMatch` added to the existing `x38-match-fixtures.mjs` import (the fixture already
existed; only the import line changed).

**`packages/db/README.md`** — a short addendum to the existing `## #947` section (§9).

No SQL file changed. No `apps/web/lib/navigation/tree.ts` or `apps/web/lib/firm/needs-you.ts`
touch (those are #1060/#1048, later in this lane).

## 5 · Migration

**None.** Confirmed empty: `git diff --stat 8a9bf689f..HEAD -- packages/db/migrations/`. The
ticket's own premise ("expected to need NO migration") held — nothing here needed a new function,
column or grant; the whole fix composes two already-general-purpose, already-granted doors from
the client, and the missing DB-level PROOF that composing them is correct is a test-only addition
(S8), never a body change.

## 6 · TDD: red before green

1. **Web slice.** Wrote `p1059.web.reverse` and `p1059.web.refusal` first (mocked
   `get_payroll_settlement_candidates` to return the run, then `[]` post-accept, then the run again
   post-reversal; mocked `settle_payroll_net_pay` / `unmatch_bank_match` / `reverse_entry`). Ran
   against the UNCHANGED component: **3 pass (the pre-existing #947 tests), 2 fail** —
   `findButtonByText(h, "Reverse settlement")` → `expected exactly one button containing "Reverse
   settlement", found 0`. Red for the right reason (the affordance genuinely does not exist yet),
   not a crash or a typo. Implemented the component change (§4). Re-ran: **5 pass, 0 fail.**
2. **DB slice.** Wrote the two S8 cells against the ALREADY-CORRECT, unchanged doors (no DB code
   to write — the whole deliverable here is the test). Ran once: both passed immediately, because
   `unmatch_bank_match` and `reverse_entry` already do the right thing (0298's own ADV-01 note
   argues this in prose; nothing had driven it end to end before). Per WORK-ORDER rule 4's own
   carve-out for a test-only deliverable, the vacuity control (§3, AC2) stands in for "red before
   green" here: the cell was shown failing against a deliberately incomplete sequence (unmatch
   skipped), then the sequence was restored byte-for-byte and the cell passed again.

## 7 · Gates, with counts

Web, from `C:\Users\zhant\Desktop\clara-wt\657\apps\web`, Node 22:

| gate | command | result |
|---|---|---|
| the test file I touched | `node --import ./test/bootstrap.mjs --import tsx --test components/bank/payroll-settlements-section.test.tsx` | **5 tests, 5 pass, 0 fail, 0 skipped** |
| whole web unit suite (touched `apps/web`) | `node scripts/run-tests.mjs` | **5175 tests, 5173 pass, 0 fail, 2 skipped** (the 2 skips are pre-existing, env-gated live-Supabase-auth cells, `components/entry/live-auth-verification.test.ts`-style, unrelated to this ticket) |
| the one browser walk this component drives | `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3560 CLARA_E2E_NEXT_PORT=3561 CLARA_E2E_RUNTIME_PORT=3562 pnpm --filter @clara/web e2e payroll-settlement-walk` | **2 passed** (unchanged pre-existing spec; run defensively since the underlying component changed, even though I added no new `.spec.ts`) |
| typecheck | `pnpm typecheck` | apps/web Done, packages/runtime Done |
| lint | `pnpm lint` | exit 0 |
| lint as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 |

DB, from `C:\Users\zhant\Desktop\clara-wt\657\packages\db`, `PGPORT=55747 PGDATABASE=clara_l07`:

| gate | command | result |
|---|---|---|
| the test file I touched, FULL gate chain (135 `--import`) | `node --test --test-concurrency=1 $GATES tests/payroll-settlement.test.mjs` | **21 tests, 21 pass, 0 fail, 0 skipped** (19 pre-existing S1–S7 cells + 2 new S8 cells) |
| operation-census (safety margin — no SQL function added, so not strictly owed) | `node --test --test-concurrency=1 tests/operation-census.test.mjs` | **10 pass, 0 fail** |
| rig-isolation (safety margin, no reset flags) | `node --test --test-concurrency=1 tests/rig-isolation.test.mjs` | **22 pass, 0 fail, 1 skipped** (T19 `poison-role`, the known destructive-and-forbidden skip RIG.md names) |
| frozen-workflows manifest (defensive; `packages/runtime` untouched) | `node scripts/check-frozen-workflows.mjs` | `freeze-lint: OK` — 322 frozen files, no manifest diff |

**Not run, and why**: `apps/web/tests/firm-scope-db-pins.corpus.ts` / `firm-scope-db-pins.test.ts`
— sweep rule (d) puts it in scope "whenever a migration file changed, even a comment"; no migration
file changed here (§5), so it does not apply. No `packages/runtime` unit file was added or touched,
so `check-parts-parity.mjs` and the WSL-as-`runner` re-run (wave-3 addendum) do not apply either.

## 8 · Successor contract

**None is owed.** No frozen chat tool, Work tool or closure module needs a change:
- `unmatch_bank_match` and `reverse_entry` are unchanged, general-purpose doors already reachable
  by any surface that names them correctly — a chat or Work tool that already composes reversal
  ceremonies (there is none doing so for payroll today, by the ticket's own premise) needs no new
  contract to reach either.
- No new SQL door was minted (the lane notes' own reading, "a composite door is optional, not
  required," was taken at face value): there is nothing here shaped like a door, a zod input, an
  argument order or a refusal mapping that a frozen surface would need described.
- If a future ticket DOES want a single `reverse_payroll_settlement(p_client, p_entry, p_match,
  p_reason, p_op_key)` composite door (folding both existing doors server-side, the shape #949's
  rent lane could then reuse too), that is new work this ticket deliberately did not do — recorded
  as a follow-up (§10.3), not as a successor contract, since nothing here is frozen or blocked on
  one.

## 9 · Docs

- `packages/db/README.md`, `## #947` section — a new paragraph ("S7 … and S8 (#1059) …") stating
  plainly that neither fix-round section changed any body in the table above, and naming exactly
  what S8 proves (CLR10 ordering, the ADV-01 exclusion, the candidate read, `bank_matches.status`).
- `payroll-settlements-section.tsx`'s own file header — a new comment block explaining the
  `justSettled` design (why there is no read to fall back on, why order matters, why this is
  session memory and not a cache of server truth).
- `en.json` — six new keys, all under the existing `ClientBank.payrollSettlements` namespace (no
  new namespace).
- No `CONTEXT.md` change: no new domain noun is introduced — "Settlement candidate row" is
  untouched (this ticket adds a REVERSAL of an already-accepted one, not a new candidate shape),
  and `unmatch_bank_match` / `reverse_entry` are pre-existing, already-documented doors.
- `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched, as the work order requires.

## 10 · Follow-ups worth filing

1. **The settlement entry's `document_id` column is NULL** (`_settle_payroll_net_pay_core`'s
   INSERT, `packages/db/migrations/0298_payroll_net_pay_settlement.sql:460-467`, carries it only
   inside `flags->'payroll_settlement'->>'document_id'`), so `clara.get_document_state`'s
   `operation.entries` (0191:1303-1304) never lists it and the "or the document page" half of
   AC1 is not actually true today for either an unsettled OR a settled run's settlement entry —
   this predates #1059 and is not something this ticket could fix without a new migration (0298 is
   applied). Worth a small, cheap follow-up: a migration that backfills `document_id` on existing
   `payroll_settlement`-flagged entries and adds the column to future inserts (a one-line
   `_settle_payroll_net_pay_core` recut). Same defect will exist for #949's rent settlements once
   built, by the identical pattern (`_settle_rent_payable_core`, unread for this ticket but worth
   checking then).
2. **The `awaiting_checker` (high-stakes) settlement arm has no reversal story on this panel at
   all**, before or after this ticket — `PayrollSettlementReceipt`'s TS type does not even carry
   `status`/`reason`/`eligible_checker_count` (unlike `RentSettlementReceipt`, which does), so a
   high-stakes accept silently drops that information on the floor and the person sees the run
   still "unsettled" (correctly, since the draft doesn't count as a debit yet) with no explanation
   of why nothing looked accepted. Out of scope for #1059 (this ticket's own `justSettled` guard,
   `if (receipt.match_id)`, deliberately does not surface a reverse ceremony for a draft with no
   live match), but the underlying #947 gap is real and worth its own ticket.
3. **A server-side composite door** (`reverse_payroll_settlement`, folding `unmatch_bank_match` +
   `reverse_entry` behind one op_key/one transaction) was considered and NOT built — the lane notes
   read "optional, not required," and a client-side composition already gives an atomic-FEELING
   single action without adding a door. If a future ticket wants the rent lane (#949) to reuse the
   SAME reopen pattern, doing it as a real composite door at that point (rather than copying the
   client-side composition a second time) would be the more deep-module shape; flagged, not built.
4. Minor, cosmetic: a reversal attempt that fails PARTWAY (unmatch succeeds, then reverse_entry
   refuses for an unrelated reason — a CLR31 opening-boundary preflight, say) leaves the ceremony
   open for a retry, and a retry would call `unmatch_bank_match` a second time on an
   already-unmatched match, itself refused by name (`already_unmatched`) rather than silently
   no-op'd. This is visible, not silent (`ActionRefusal` renders it), but a person retrying would
   see a confusing SECOND refusal about a step that already succeeded. Not driven by a test here
   (would need a THIRD scripted refusal in the web mock harness) — noted rather than built, since
   the ticket's three acceptance criteria do not ask for it and the underlying doors' own refusal
   behaviour is correct and unowned by this ticket.

## 11 · Anything unverified

- **Cross-browser/visual review of the new "Reverse settlement" ceremony** was not done beyond the
  existing axe-core accessibility scan the e2e walk runs on the ORIGINAL accept flow (unchanged by
  this ticket) — no new Playwright spec was added for the reversal UI itself (the unit-level proof,
  `p1059.web.reverse`/`p1059.web.refusal`, mounts the REAL component via `hookHarness.ts`, per this
  file's own existing #947 coverage bar; I judged that consistent with the file's established
  proof shape rather than a gap, but a reviewer could reasonably ask for a browser-level walk too).
- **The partial-failure retry behaviour** (§10.4) is reasoned from reading `unmatch_bank_match`'s
  own `already_unmatched` refusal, not driven by a test.
- **A mid-task status request**: none arrived.
