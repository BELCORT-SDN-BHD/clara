# Riders sweep wave · lane 03 · ticket #1068 — the empty allocation list still focuses something real

**Branch** `riders/wS-lane03` in `C:\Users\zhant\Desktop\clara-wt\656`, base `7bc5a710f`.
**Database** `clara_l06` on `127.0.0.1:55746` — **no migration** (see §5: this ticket touches no
PostgreSQL object at all, exactly as the plan's migration table says and the prompt's own
instruction confirms). **Playwright triple** 3550 / 3551 / 3552.
**Status: DONE.** The ticket was live on this branch and is now built, tested and documented.

| commit | what |
|---|---|
| `a4bea1f53` | `fix(web): #1068 the empty allocation list wires row 0's field id onto the add-row button` — the one-conditional-spread fix on the shared editor, three new cells at the editor's own seam, red-then-green |
| `2862b66d9` | `test(web): #1068 a mounted claim form proves the empty allocation list still focuses a real node` — two end-to-end cells on the mounted form, vacuity proved by a temporary byte-for-byte revert |
| `d7033d804` | `docs(web): #1068 the shared allocation editor's empty-state fix` — `apps/web/README.md`'s `## #1068` section |

Working tree clean. Nothing pushed, no PR, no GitHub write, no other worktree touched apart from
this report file. No mid-task status request arrived.

---

## 1 · The seams I tested at

Written down before the first cell, from the ticket's own "Key interfaces" and from what the code
actually turned out to need:

- **`StaffAdvanceAllocationsEditor`** (`apps/web/components/registers/staff-advance-allocations-editor.tsx`)
  — the ticket's own second "Key interface" ("The allocation-list editor's empty-state markup …
  whose rendered field ids must match whatever `validateClaimDraft` addresses in the empty case").
  This turned out to be the WHOLE seam: the shared component's own rendered output, driven with and
  without a `rowProps` callback, at empty and non-empty list lengths.
- **`StaffExpenseClaimFormView`, mounted** (`apps/web/components/accounting/staff-expense-claim-form.tsx`)
  — the end-to-end path the ticket's three acceptance criteria are actually about: a real "×" click
  down to zero rows, a real submit attempt, and `document.activeElement` read back.
- **Read, not touched**: `validateClaimDraft` and `allocationFieldId`
  (`apps/web/lib/work/staff-expense-claim.ts`) — the ticket's own first "Key interface". Read in
  full before building (see §2); the addressing scheme they compute (`allocationFieldId(0,
  "advanceId")` → the literal id `"advanceId"`, via `claimAllocations`'s single synthesised phantom
  row) was already correct and is unchanged by this ticket — the defect was entirely on the DOM
  side, not in what field id gets addressed. No line in this file changed.
- **Not a seam**: `BookApplicationDialog.tsx` (the staff-advance register's own dialog). It has no
  `gh issue`/`validateClaimDraft`-shaped field-id-addressed validation at all — it disables its
  Confirm button (`confirmDisabled={!canSubmit}`) and never calls `rowProps`. "The same behaviour…
  for the register too" (AC2) is proved at the EDITOR's own seam instead (§3, AC2), exactly as
  #1052's own report and `staff-advance-allocations-editor.test.tsx`'s own header established for
  the same reason: two callers mount this component, and a cell that only drove the claim form
  would leave the register's caller free to drift.

## 2 · Was the ticket still live? Yes, unbuilt — and the SWEEP-PLAN's diagnosis, not the ticket's own, was the accurate one

`gh issue view 1068 --repo BELCORT-SDN-BHD/clara --json title,body,comments,labels,url` — 0
comments, no owner ruling comment dated 2026-09-20 on this issue itself; the Agent Brief in the
issue body is the only one, and labels are `bug` + `ready-for-agent`.

Read against the branch as I found it (after #1067/#1052/#1066's own commits, before mine):
- `StaffAdvanceAllocationsEditor`'s `TableBody` rendered `allocations.map(...)` with no fallback row
  and no id on its "Add allocation" button (`staff-advance-allocations-editor.tsx:139-212`, pre-fix)
  — confirmed the empty state truly had nothing addressable.
- `claimAllocations` (`lib/work/staff-expense-claim.ts:267-280`) and `allocationFieldId`
  (`:283-286`) were exactly as `docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md:159` describes:
  the empty case synthesises one phantom row and addresses it via the literal `"advanceId"`.
  Unbuilt, and — as the plan's own "Key interfaces" framing anticipated — this reading, not the
  ticket's naive "the addressing scheme is the bug" framing, is the one that survives contact with
  the code: the addressing is correct FOR a state where row 0 exists; the gap is that nothing
  renders in the DOM once it does not.
- `removeAllocation` (`staff-advance-allocations-editor.tsx:119-121`) has no floor at one row —
  confirmed a preparer really can reach the empty state through the editor's own "×", the same one
  `ticket 931 deleting a line of a CONFIRMED split…` already exercises down to one row.

## 3 · Each acceptance criterion, with its evidence

**AC1 — "Emptying the allocation list and attempting to submit shows the 'advance required' error
focused/scrolled to a real, visible control, not a stale field id."**

- `ticket 1068 emptying the whole allocation list and submitting focuses a REAL, visible control`
  — PASS. `apps/web/components/accounting/staff-expense-claim-form.test.tsx`. Restores a draft with
  one open advance and one confirmed row, clicks that row's own "×" (`aria-label` =
  `StaffAdvances.allocationsEditor.removeAllocation`), confirms the row-0 `<select>` is gone,
  submits, asserts nothing is sent, asserts the `advanceRequired` copy is still on screen (the
  `<Field>` wrapper's error paragraph renders unconditionally — never was the missing half), then
  reads `document.activeElement` back: it names `F("advanceId")`, that id now resolves to a REAL
  rendered `<BUTTON>` (the "Add allocation" affordance), and that button is not `disabled`.
- `ticket 1068 the SAME empty-list focus holds when the claim never had an open advance to begin
  with` — PASS. Same file. The OTHER way to reach zero rows: no candidates at all (the sibling
  pre-existing test, "a claimant with NO open advance…", proves the placeholder-only ONE-row case
  already worked; this proves the row removed on TOP of that also still focuses something real).

**AC2 — "The same behavior is verified for both the advance-application claim form and the
staff-advances register's own allocation editor, since they share the component."**

Proved at the editor's own seam, three cells, `apps/web/components/registers/staff-advance-allocations-editor.test.tsx`:
- `ticket 1068 an EMPTY list wires row zero's own field props onto the add-a-row button` — PASS.
  Given a `rowProps` shaped the way the claim form's own is, an empty list's "Add allocation"
  button carries the id, `aria-invalid` and `aria-describedby` row 0 would have carried.
- `ticket 1068 a NON-EMPTY list never steals row zero's field id for the add-a-row button` — PASS.
  The boundary the fix must not cross: with one real row present, the id names the `<SELECT>`,
  never the button, and only ONE node in the tree carries it.
- `ticket 1068 a caller that passes NO rowProps (the register's own dialog) renders the empty
  add-a-row button exactly as before` — PASS. This IS the register's own shape
  (`BookApplicationDialog.tsx` never passes `rowProps`): the button renders with no `id`, no
  `aria-invalid`, byte-identical to before this ticket.

Given AC2's own clause ("since they share the component") and that the register's dialog has no
field-id-addressed submit-validation to begin with (§1), "the same behaviour" for the register
means "correctly unaffected", which the third cell proves directly, and "the mechanism generalises
to any caller shaped like the claim form" is what the first two cells prove. I did not invent a
register-side submit/focus test the register's own architecture has no place for; `grep -rn` found
no existing test file for `BookApplicationDialog.tsx` at all, and the register's browser walk
(`apps/web/e2e/staff-advances-register-walk.spec.ts:124`, which clicks "Add allocation") still
passes unchanged (§6).

**AC3 — "A test drives the empty-list submit attempt and asserts focus lands on a real DOM node."**

Both AC1 cells do exactly this: `submitForm(h)` is the real submit attempt, and
`h.find((n) => attrOf(n, "id") === focused)` resolving to a non-null node — rather than merely
asserting `focusedId() !== null` — is the "real DOM node" half; `enableDomInspection()`'s own
`.focus()` stub (`test/domInspect.ts:279-282`) only ever sets `document.activeElement`, so reading
the node back out of the live tree, not just the id string, is what proves it is not a ghost
reference to an unmounted control.

**Non-vacuity (work order rule 4).** Reverted `staff-advance-allocations-editor.tsx` to its
pre-fix content (`git show a4bea1f53~1:…` into place), re-ran
`staff-expense-claim-form.test.tsx`: both new AC1 cells failed for the expected reason
(`focusedId()` named `"staff-expense-claim-advanceId"` but no node in the tree carried that id —
`AssertionError`), all 22 pre-existing cells in the same file stayed green. Restored the file from
the saved post-fix copy; `git diff` on it was empty (byte-for-byte). The editor's own three new
cells were driven red-then-green the ordinary way during the TDD loop itself (§ commits, `a4bea1f53`
in the session transcript: `not ok 4` before the fix, all six `ok` after).

## 4 · What was deliberately left

- **No change to `validateClaimDraft`, `claimAllocations` or `allocationFieldId`**
  (`lib/work/staff-expense-claim.ts`) — the addressing scheme was already correct; see §2. The
  ticket's own "Key interfaces" names this file as a seam to READ, not necessarily to change, and
  building it out would have meant inventing a second field id with no defect to justify it.
- **No new empty-state paragraph or dedicated placeholder element** — the ticket's brief offers two
  options ("the list's own 'add a row' affordance, or a dedicated empty-state element"); the add-row
  button already exists in every empty state (with or without candidates) and needed no new markup,
  only the missing wiring.
- **No change to the allocation editor's non-empty behaviour or to the validation rule itself** —
  both explicitly out of scope per the ticket, and AC2's second cell (§3) pins the non-empty
  boundary directly.
- **No register-side submit-validation test invented** — the register's dialog has none today; see
  §1 and §3, AC2.

## 5 · Migration

**None.** Confirmed against the plan of record before building
(`docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md` line 86: `#1068 (no)`) and against the prompt's
own instruction ("This ticket is expected to need NO migration. If you find it needs one, stop this
ticket and say why"). Nothing in this ticket touches `packages/db` at all — every change is
TypeScript/TSX in `apps/web`. No new migration file, no recut of an applied one, no gate-chain
entry, no prestate pin, and `apps/web/tests/firm-scope-db-pins.corpus.ts` is out of scope (SWEEP
rule (d): only in scope when a migration file changed).

## 6 · Gates, with counts

- **Touched test files**, each run alone first, then together:
  - `apps/web/components/registers/staff-advance-allocations-editor.test.tsx` — 6 tests, 6 pass, 0
    fail (3 pre-existing #1052 cells + 3 new #1068 cells).
  - `apps/web/components/accounting/staff-expense-claim-form.test.tsx` — 24 tests, 24 pass, 0 fail
    (22 pre-existing + 2 new #1068 cells).
  - Both together: 30 pass, 0 fail.
- **`pnpm typecheck`** (repo root) — `apps/web` and `packages/runtime` both `Done`, no errors.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (repo root, the runner's own env) — exit 0, every
  `apps/web` lint selftest battery PASS (`check-test-manifest`, `check-message-keys`,
  `check-ui-add-guard`, contrast checks), no eslint errors anywhere in the workspace.
- **Whole `apps/web` unit suite once**, `node scripts/run-tests.mjs`: **5192 tests, 5190 pass, 0
  fail, 2 skipped** (both skips are the pre-existing "live Supabase auth not configured"
  environment skips in the auth test files — unrelated to this ticket, not the Windows-only skips
  RIG.md names).
- **Browser walks touched**: `apps/web` was touched, and the change lives in a component two
  walks exercise. On my triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3550 CLARA_E2E_NEXT_PORT=3551
  CLARA_E2E_RUNTIME_PORT=3552`):
  - `pnpm --filter @clara/web e2e staff-expense-claim-walk` — **14 passed**, 0 failed.
  - `pnpm --filter @clara/web e2e staff-advances-register-walk` — **4 passed**, 0 failed (including
    the spec at line 124 that clicks "Add allocation", the exact button this ticket's fix
    conditionally extends).
- **No SQL functions added** — `operation-census.test.mjs` / `rig-isolation.test.mjs` do not apply.
- **No `packages/runtime` touch** — `check-frozen-workflows.mjs` / `check-parts-parity.mjs` do not
  apply.

## 7 · Docs

`apps/web/README.md`: a new `## #1068 —` section (commit `d7033d804`), following the same house
convention #930/#931/#1052/#1066 already used in this file — what the empty state used to render,
why the addressing scheme itself was not the bug, the one-conditional-spread shape of the fix, and
why the editor is the seam rather than only the claim form.

No `CONTEXT.md` change: no new domain vocabulary. "Confirmed allocation list", "advance
application" and "staff-advance enrolment" are all already-defined terms; this ticket fixes a
DOM-focus defect in an existing UI, not a domain concept.

No `apps/web/messages/en.json` change: no new copy. The fix reuses the existing `advanceRequired`
and `addAllocation` strings verbatim.

## 8 · Successor contracts

None. This ticket touches no frozen chat or Work tool body (`node scripts/check-frozen-workflows.mjs`
was not run because `packages/runtime` was not touched at all — see §6), and nothing a frozen chat
or Work tool would need changes here: the claim form's own client-side focus/scroll behaviour has
no chat-lane equivalent to begin with.

## 9 · Follow-ups worth filing

- **None new.** The one thing worth naming for whoever reads this lane's history: the register's
  own `BookApplicationDialog.tsx` has NO test file today (confirmed by `find`, §1) and no
  field-id-addressed validation at all — if a future ticket ever gives it one (mirroring the claim
  form's `validateClaimDraft`/`controlProps` shape), this ticket's `rowProps`-spread mechanism on
  the shared editor already generalises to that caller with zero further change, proved by
  `ticket 1068 an EMPTY list wires row zero's own field props onto the add-a-row button` accepting
  an arbitrary `rowProps` shape, not one hard-coded to the claim form's own field ids.

## 10 · Anything unverified

- I did not drive this through a real browser's own accessibility tree (a screen reader or an
  axe-core-equivalent scan) to confirm `aria-invalid`/`aria-describedby` on a `<button>` (rather
  than an `<input>`/`<select>`) reads sensibly to assistive technology — `test/domInspect.ts`'s own
  header explains why this repo's harness cannot make that specific claim reliably (a documented,
  named limitation, not one I introduced). What IS verified: the attributes are present with the
  correct values (component-level cells, §3) and a real browser (Playwright, §6) renders and clicks
  the button without incident.
- I relied on `enableDomInspection()`'s `.focus()` stub (`document.activeElement = node`) as the
  house definition of "took focus" for the unit-level cells, the same definition every other focus
  assertion in `staff-expense-claim-form.test.tsx` already uses (e.g. line 229's own
  `assert.equal(focusedId(), F("claimantAccountCode"))`) — consistent with existing practice, not a
  new assumption for this ticket.
