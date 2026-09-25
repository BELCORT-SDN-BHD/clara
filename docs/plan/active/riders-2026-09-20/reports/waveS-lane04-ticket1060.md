# Riders sweep wave · lane 04 · ticket #1060 — the bank nav tab (narrowed half only)

**Branch** `riders/wS-lane04` in `C:\Users\zhant\Desktop\clara-wt\657`, base `7bc5a710f`.
**Database** `clara_l07` on `127.0.0.1:55747` — **untouched by this ticket** (no migration).
**Status: DONE**, for the narrowed scope the lane notes and the ticket's own words both give. The
ticket's second half (a shared FIFO extraction) is confirmed dormant per its own "Out of scope"
line and is not built.

| commit | what |
|---|---|
| `4be8946ab` | `feat(web): #1060 bank nav entry names the Matching tab` — `BankTab` type, `AccountingItem.tab` widened, the registry's `bank` row gains `tab: "matching"`, `tree.test.ts` updated |
| `a4986a2f2` | `feat(web): #1060 payroll and rent settlement rows deep-link to bank Matching` — `needs-you-links.ts`'s two settlement rows repointed to `?tab=matching`, `BANK_MATCHING_TAB` constant, the two owning test files updated, `bank-workbench.tsx` header and `README.md` §657 corrected |

Working tree clean after both commits (`git status --short` empty). Nothing pushed, no PR, no
GitHub write (`gh issue view` only), no other worktree touched, no process killed, no subagent
spawned. **No status-report request arrived mid-task** — noted per SWEEP-WAVE RULE (f), and I kept
working regardless.

---

## 1 · The seams I tested at

Written down before the first edit, from the brief's own "Key interfaces" and the lane scan's own
narrowing:

- **`ACCOUNTING_ITEMS`'s `bank` row and `accountingHref`** (`apps/web/lib/navigation/tree.ts`) —
  the one row every caller (sidebar, accounting hub, ⌘K, Needs-you) reads through. The public
  interface is the built href string, never the array's internal shape.
- **`needsYouRowHref`** (`apps/web/lib/firm/needs-you-links.ts`) — the door a Needs-you row's link
  is built through, for the two row kinds the brief names as the callers this ticket exists to fix:
  `payroll_net_pay_unsettled` (#947) and `rent_payable_unsettled` (#949).
- **Not a seam, and not touched**: the FIFO-settlement-candidate functions themselves
  (`clara.list_unmatched_lines`, `clara._payroll_net_pay_unsettled`,
  `clara._rent_payable_unsettled`) — AC2/AC3 name these only as the future migration target, gated
  on a fourth instance that does not exist yet (§2 below).

## 2 · Was the ticket still live? Yes, and the narrowing holds

`gh issue view 1060 --repo BELCORT-SDN-BHD/clara --comments`: **0 comments**, so the issue body's
own Agent Brief is the whole contract — no later brief, no 2026-09-20 owner ruling comment to
override it.

I independently re-checked the two facts the lane scan's `SWEEP-PLAN.md` narrowing rests on, on
this branch, before writing anything:

- `apps/web/lib/navigation/tree.ts:380` — the `bank` row read `{ id: "bank", segment: "bank",
  labelKey: "accounting.bank", icon: "bank", minimumRole: "viewer" }`, no `tab` key, while its
  siblings at 381 (`receivables`, `tab: "aging"`) and 382 (`assets`, `tab: "fixedAssets"`) both
  carry one. Confirmed live with `grep -n '"bank"\|"receivables"\|"assets"'
  apps/web/lib/navigation/tree.ts`.
- The fourth-instance gate: `grep -rn "list_unmatched_lines\|_payroll_net_pay_unsettled\|_rent_payable_unsettled" packages/db/migrations/*.sql`
  finds exactly three defining sites — `clara.list_unmatched_lines` in
  `0040_bank_reconciliation.sql`, `clara._payroll_net_pay_unsettled` in
  `0298_payroll_net_pay_settlement.sql`, `clara._rent_payable_unsettled` in
  `0300_tenancy_rent_settlement.sql` — and no fourth FIFO-settlement-candidate function exists
  anywhere in `packages/db` or `apps/web`. The extraction's own trigger condition ("once a fourth
  instance appears") is therefore false, and AC2/AC3 stay dormant exactly as the lane notes say.

## 3 · Acceptance criteria, each with its evidence

**AC1 — "The bank navigation entry carries a `tab` pointing at the Matching view, and the payroll
and rent settlement Needs-you rows link there directly instead of to the bank surface's default
view."** BUILT, in full.

- The registry row: `apps/web/lib/navigation/tree.ts` — `{ id: "bank", segment: "bank", tab:
  "matching", labelKey: "accounting.bank", icon: "bank", minimumRole: "viewer" }`. `tab: "matching"`
  is a `BankTab` literal (`"accounts" | "statements" | "matching" | "exceptions" |
  "reconciliation" | "agency"`, the exact six values `components/bank/bank-workbench.tsx`'s own
  `TABS` tuple accepts), so a rename of that view is a compile error here rather than a link that
  silently falls back.
  - Test: `apps/web/lib/navigation/tree.test.ts`, "the four register rows are `?tab=` views of ONE
    workbench, and the object URLs are unchanged" — `assert.equal(href("bank"),
    \`/clients/${A}/bank?tab=matching\`)`. **RED first** (shown below verbatim), **GREEN after**:
    `node --import ./test/bootstrap.mjs --import tsx --test lib/navigation/tree.test.ts` → **27
    tests, 27 pass, 0 fail**.
  - `accountingHref`/`CLIENT_ROUTES` are DERIVED from `ACCOUNTING_ITEMS`
    (`apps/web/lib/command/routes.ts:273-277`), so this one edit is also what makes
    `/clients/:id/bank?tab=matching` a route `CLIENT_ROUTES` itself emits — the same mechanism
    `depreciation_authority_pending`'s `?tab=fixedAssets` already relies on. Confirmed: `node
    --import ./test/bootstrap.mjs --import tsx --test lib/command/routes.test.ts` → **16 tests, 16
    pass, 0 fail** (this file globs the real `app/` tree and both-ways-checks every href, so a
    query the app cannot serve would have reded here).
- The two Needs-you rows: `apps/web/lib/firm/needs-you-links.ts`'s `OWNING_TAB` map —
  `payroll_net_pay_unsettled: \`/bank?tab=${BANK_MATCHING_TAB}\`` and `rent_payable_unsettled:
  \`/bank?tab=${BANK_MATCHING_TAB}\`` (`BANK_MATCHING_TAB: BankTab = "matching"`, the same
  typed-constant defence `FIXED_ASSETS_TAB` already gives the depreciation-authority row).
  - Test: `apps/web/lib/firm/needs-you-payroll-settlement.test.ts`, "#947: it opens the bank tab" —
    `assert.equal(needsYouRowHref(...), \`/clients/${CLIENT}/bank?tab=matching\`)`. **RED first**,
    **GREEN after**: **4 tests, 4 pass, 0 fail**.
  - Test: `apps/web/lib/firm/needs-you-tenancy-rent.test.ts`, "#949: the unpaid month opens the bank
    tab..." — same repoint. **RED first**, **GREEN after**: **4 tests, 4 pass, 0 fail**.
  - The generic both-ways cell in `apps/web/lib/firm/needs-you-links.test.ts` ("every emitted href
    is a path `CLIENT_ROUTES` actually serves") loops every `REVIEW_QUEUE_ROW_KINDS` member and
    every `owningTabSuffixes()` value against `CLIENT_ROUTES`'s served set — it needed no edit and
    stayed green through both slices precisely because AC1's registry half (above) lands first:
    **10 tests, 10 pass, 0 fail**.
- **The act each row names actually lives on the destination now named.** Confirmed by reading
  `components/bank/bank-workbench.tsx:85-96`: `PayrollSettlementsSection` and
  `RentSettlementsSection` both mount ONLY inside `{tab === "matching" && (...)}`, alongside
  `MatchingSection` — so `?tab=matching` is not merely "a" tab, it is the one tab that renders the
  Accept control each row's own affordance comment already promised
  (`components/firm/needs-you-affordances.tsx:132-149`).

**AC2 — "When (and only when) a fourth FIFO-settlement-candidate instance is added ... it is built
on a shared extraction ... and the three existing instances are migrated onto it in the same
change."** NOT BUILT — left dormant, correctly. The condition ("a fourth instance is added") is
false today (§2's grep), and the ticket's own "Out of scope" line says plainly: "Forcing the
extraction to happen before a fourth instance actually exists." No fourth instance was added by
this ticket or any other lane this wave, so nothing triggers this AC. Nothing in
`clara.list_unmatched_lines`, `clara._payroll_net_pay_unsettled`, or `clara._rent_payable_unsettled`
was touched, read for editing, or migrated.

**AC3 — "The shared extraction's tests cover FIFO ordering, exact-amount candidate matching, and
no auto-selection when more than one candidate matches."** NOT BUILT, for the same reason as AC2 —
there is no shared extraction to test yet. The three existing instances keep their own existing
coverage unchanged (not read or touched by either commit).

**Out of scope, respected.** "Changing any of the three existing FIFO reads' current behavior or
window lengths" — none of `0040_bank_reconciliation.sql`, `0298_payroll_net_pay_settlement.sql`,
`0300_tenancy_rent_settlement.sql` was opened for editing; `git diff 175244502..HEAD --stat --
packages/db` (this ticket's two commits, diffed from #1059's last commit) is empty — zero
`packages/db` files touched.

## 4 · The change

Both commits are `apps/web`-only, no SQL, no migration:

```
apps/web/README.md                                  |  9 ++++++
apps/web/components/bank/bank-workbench.tsx         |  6 +++-
apps/web/lib/firm/needs-you-links.ts                | 32 ++++++++++------------
apps/web/lib/firm/needs-you-payroll-settlement.test.ts |  5 +++-
apps/web/lib/firm/needs-you-tenancy-rent.test.ts    |  5 +++-
apps/web/lib/navigation/tree.test.ts                |  6 +++-
apps/web/lib/navigation/tree.ts                     | 20 ++++++++++++--
 7 files changed, 59 insertions(+), 24 deletions(-)
```
(`git diff --stat 175244502..HEAD -- apps/web`, i.e. both this ticket's commits together, diffed
against #1059's last commit — the state I started from.)

`AccountingItem.tab`'s type widened from `RegisterTab` to `RegisterTab | BankTab`; a new `BankTab`
type was added beside `RegisterTab` in `tree.ts`, hand-written as a literal union (mirroring how
`RegisterTab` itself is a hand-written copy of `registers-workbench.tsx`'s own `TABS` tuple, not an
import from it) rather than importing a type from the "use client" `bank-workbench.tsx` module.

## 5 · Migration

**None.** This ticket was expected to need no migration and did not need one — every change is a
navigation-registry field and two link-map string values, no schema or function touched. Per the
work order's rule, if it HAD needed one I would have stopped and asked for a number from the
overflow block (0360+); it did not arise.

## 6 · TDD: red before green (vertical slices, per work order rule 4)

**Slice 1 — the registry.**
1. Edited `tree.test.ts`'s href assertion FIRST, against the unchanged registry. Run: **1 of 27
   fail** — `AssertionError: expected '/clients/.../bank' to equal
   '/clients/.../bank?tab=matching'`. Red for the right reason (the exact string the ticket names),
   not a crash.
2. Added `BankTab`, widened `AccountingItem.tab`, set `tab: "matching"` on the `bank` row.
3. Same file re-run: **27 of 27 pass.**
4. Confirmed no regression one level up: `routes.test.ts` (16/16) and `needs-you-links.test.ts`
   (10/10) — both still green with `needs-you-links.ts` UNCHANGED at this point (the bare `/bank`
   strings for the two settlement kinds were still bare), proving slice 1 alone did not silently
   repoint anything it should not have.

**Slice 2 — the two Needs-you rows.**
1. Edited both owning test files' assertions FIRST (`needs-you-payroll-settlement.test.ts`,
   `needs-you-tenancy-rent.test.ts`), against the unchanged `needs-you-links.ts`. Run: **2 failures**
   across the two files, each `expected '.../bank?tab=matching', actual '.../bank'`. Red for the
   right reason.
2. Added `BANK_MATCHING_TAB`, repointed both `OWNING_TAB` values, updated the three comment blocks
   that had explicitly recorded the old bare links as "scoped OUT of this ticket" (now stale).
3. Both files re-run: **4/4** and **4/4 pass.**
4. Full re-check of the whole affected cluster together: `tree.test.ts` (27), `needs-you-payroll-
   settlement.test.ts` (4), `needs-you-tenancy-rent.test.ts` (4), `needs-you-links.test.ts` (10),
   `routes.test.ts` (16) → **61 tests, 61 pass, 0 fail** in one combined run.

No battery of red tests was written up front; each slice's one test went red, then the minimal
registry/link change turned it green, before the next slice's test was written.

## 7 · Gates, with counts

Run from `C:\Users\zhant\Desktop\clara-wt\657`, Node 22, `export PATH=".../pnpm:$PATH"`.

| gate | command | result |
|---|---|---|
| `tree.test.ts` (touched) | `apps/web$ node --import ./test/bootstrap.mjs --import tsx --test lib/navigation/tree.test.ts` | **27 tests, 27 pass, 0 fail** |
| `needs-you-payroll-settlement.test.ts` (touched) | same runner | **4 tests, 4 pass, 0 fail** |
| `needs-you-tenancy-rent.test.ts` (touched) | same runner | **4 tests, 4 pass, 0 fail** |
| `needs-you-links.test.ts` (dependent, untouched, re-verified) | same runner | **10 tests, 10 pass, 0 fail** |
| `routes.test.ts` (dependent, untouched, re-verified) | same runner | **16 tests, 16 pass, 0 fail** |
| whole `apps/web` unit suite, once | `apps/web$ node scripts/run-tests.mjs` | **5175 tests, 5173 pass, 0 fail, 2 skipped** — both skips are the pre-existing env-gated live-Supabase-auth cell (`CLARA_LIVE_SUPABASE_AUTH_URL` not configured), unrelated to this ticket, not a Windows-only red from `RIG.md`'s known list |
| typecheck | `pnpm typecheck` | `apps/web typecheck: Done`, `packages/runtime typecheck: Done` |
| lint | `pnpm lint` | exit 0 |
| lint as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 |

No SQL function was added, so `operation-census.test.mjs`/`rig-isolation.test.mjs` do not apply
(rule 8's condition — "if you added SQL functions" — is false here; none was touched). No
`packages/runtime` file was touched, so `check-frozen-workflows.mjs` and
`check-parts-parity.mjs` do not apply either. No `packages/db/tests` file was touched.

**No browser walk was run.** I touched no `.spec.ts` e2e file, and I traced every walk that
mentions the two affected row kinds or the bank Matching tab before deciding this: `payroll-
settlement-walk.spec.ts` navigates DIRECTLY to `/clients/${CLIENT}/bank?tab=matching`
(`MATCHING` constant, line 27) rather than through a Needs-you row click, so it exercises neither
the registry href nor `needsYouRowHref`; `bank-match-walk.spec.ts` is the ordinary matcher, unrelated
to either settlement row; no walk in the repo clicks a `payroll_net_pay_unsettled` or
`rent_payable_unsettled` inbox row and asserts where it lands. Per rule 8 ("each browser walk you
touched"), zero were touched, so zero were run.

**The web pins corpus** (`apps/web/tests/firm-scope-db-pins.corpus.ts`, SWEEP-WAVE RULE d) is out of
scope: no migration file changed by this ticket, so the "in scope whenever a migration file
changed" condition never triggers.

## 8 · Successor contract

**None is owed.** No frozen chat tool, Work tool or closure module was read or edited. The change
is a navigation-registry field and two link-map values, read by ordinary React components
(`AppSidebar`, `AccountingHub`, `CommandPalette`, `NeedsYou` rows) — nothing a chat turn or a Work
tool's door schema would need to know about.

## 9 · Docs

- `apps/web/components/bank/bank-workbench.tsx` — its own header comment, which said flatly "No
  `lib/navigation/tree.ts` row is added ... `?tab=` is a query, not a segment," is extended (not
  rewritten) to record that #1060 puts `tab: "matching"` on that SAME row, without touching the
  still-true claim that no second route or segment exists.
- `apps/web/README.md` §"#657 — the /bank Matching tab, and the two laws it changed" — a new
  paragraph appended, same discipline: the original "No new route and no `lib/navigation/tree.ts`
  row" sentence is left standing (still literally true — no NEW row), and #1060's field addition is
  recorded beside it with the four caller classes it now affects.
- `CONTEXT.md` — no change. No new domain vocabulary; `tab`/`RegisterTab`/`BankTab` are all
  navigation-layer plumbing, not accounting vocabulary the house's `term / _Avoid_` shape covers.
- `docs/PRD.md`, `docs/ARCHITECTURE.md` — untouched, as the work order requires.

## 10 · Follow-ups worth filing

1. **The shared FIFO-settlement-candidate extraction itself (AC2/AC3)** is now formally confirmed
   dormant with a live three-instance count and the exact three definition sites (§2). Worth
   leaving a standing marker (a code comment on the third instance, `_rent_payable_unsettled` in
   `0300`) that names #1060 as the ticket to reopen the day a fourth instance is proposed, so the
   next author does not have to re-derive this grep before deciding whether to extract. Not built
   here — it would be a comment-only migration-adjacent edit outside a ticket whose own words scope
   it to "when a fourth instance appears," and this wave's migration numbers are pre-assigned.
2. **`needs-you-affordances.tsx`'s comment for `rent_payable_unsettled`** (line ~149) still says
   "the bank tab" rather than "the bank tab's Matching view" the way its `payroll_net_pay_unsettled`
   sibling comment already does (line ~135) — a cosmetic asymmetry between two comments describing
   the same now-identical destination. Left alone as out of this ticket's own narrow scope (no href,
   no test, no behaviour depends on it), but a one-line tidy-up if a lane touches that file next.

## 11 · Anything unverified

- **The sidebar's own rendered "Bank" link landing on Matching in a real browser** was not driven
  through Playwright (no walk was run — §7's reasoning). It follows deductively from `accountingHref`
  being the one function every caller shares (read, not executed live), and from
  `resolveActive`'s own segment-first match (`tree.ts:894-900`, read, not driven) meaning the
  sidebar's "Bank" row still shows `aria-current` correctly regardless of which tab query is
  present — but neither claim was watched happen in a browser this session.
- **A mid-task status request**: none arrived.
