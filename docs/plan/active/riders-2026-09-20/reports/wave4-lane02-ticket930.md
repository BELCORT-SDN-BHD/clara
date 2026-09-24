# Wave 4 · lane 02 · ticket #930 — staff expense claim: choose the advance from the claimant's open advances instead of typing its id

**Status: DONE.** Branch `riders/w4-lane02`, worktree `C:\Users\zhant\Desktop\clara-wt\636`,
database `127.0.0.1:55742/clara_l02` (untouched by this ticket — no migration). Base `cd2925391`.

```
9b60e6803 feat(web): #930 staff-expense-claim advance chooser replaces the typed id
2bc755546 test(web): #930 e2e walk drives the advance chooser through the fixture
bd533dd57 docs(web): #930 README note on the advance chooser and the shared summary verb
3adafcd1d test(web): #930 declare staff_advance_summary a named shared RPC verb
```

Working tree clean at handoff. No commit preceded mine on this lane branch (`git log
cd2925391..HEAD` was empty at start, confirmed by `git status`/`git log` before any change). The
ticket carries no comments (`gh issue view 930 --comments` returns `[]`); its body IS the newest
(and only) Agent Brief. Its parent, #881, carries the owner ruling dated 2026-09-18 that split the
work: *"explicit allocation list with a one-click date-ordered suggestion... Published as two
tickets: #930 (the chooser replaces the typed advance id; rule unchanged) → #931 (the allocation
list...)."* **The ticket was still live**: measured on this branch/database before any change —
`staff-expense-claim-form.tsx`'s advance-application arm still rendered a plain `<Input>` for
`advanceId` (a typed UUID), fed by nothing, with the help text "if the claimant holds two, say
which one" describing a lookup the preparer had to do themselves.

**No migration was needed, and none was made.** The ticket's own brief predicted this ("This
ticket is expected to need NO migration"): the chooser reads `clara.staff_advance_summary`
(migration 0043, live and unchanged) through the door the register's own allocation editor already
uses (`getStaffAdvanceSummary`, `lib/registers/staff-advances-doors.ts`); nothing about the
accounting rule, the door's signature, or any table changed.

## The seams I tested at (written before the first test)

The brief names one seam directly — "a chooser fed by the existing staff-advance summary read" —
and one behavioural contract twice: "Choosing one fills the claim exactly as typing the id does
today" (AC2) and "cannot submit an advance application" with no candidates (AC3). Investigating
`staff-expense-claim-form.tsx` and `lib/work/staff-expense-claim.ts` showed the real seam is the
MOUNTED FORM, not the pure draft module: `validateClaimDraft`/`toClaimWire` already treat
`draft.advanceId` as an opaque string and needed no change at all (a UUID from a `<select>`'s
`onChange` is byte-identical input to a UUID typed into an `<input>`'s `onChange`). The three seams
under test, each a real rendered control or the wire it produces, never an internal collaborator:

1. The `advanceId` control itself, mounted — its `tagName`, its offered `<option>` values, and
   the text each option renders (date + outstanding amount).
2. The submitted `claim.advanceId` on the wire, read from the SAME `submit` stub every other claim
   cell in this file already uses — proving the chooser's choice reaches the door exactly as a
   typed value did.
3. The empty-candidate state: the rendered reason text, the option list narrowed to only the
   placeholder, and the submit-guard (nothing sent, focus lands on the control) — all already
   general form behaviour (`validateClaimDraft`'s existing `advanceRequired` issue), exercised
   here against the NEW control shape rather than reimplemented.

Everything is exercised through `components/accounting/staff-expense-claim-form.test.tsx` (2 new
cells) plus one pre-existing cell's DOM-shape assertion updated to match the new control, and
re-proved end to end through `e2e/staff-expense-claim-walk.spec.ts`'s existing settlement-switch
walk, updated to choose from the rendered list instead of typing.

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 | `the advance-application arm offers a CHOOSER...` — `'INPUT' !== 'SELECT'` (the control was still the old free-text `<Input>`) | `staff-expense-claim-form.tsx`: `loadAdvances` prop + `advancesRead` (`useAsyncRead` over `getStaffAdvanceSummary`), the `advanceCandidates` memo (`account_code` match, `outstanding_cents > 0`, `!voided`), and the `<NativeSelect>` replacing the `<Input>`, each option showing `issue_date` and `fmtCents(outstanding_cents, …)` |
| 2 | `a claimant with NO open advance sees the chooser EMPTY...` — the options list was `[]` (no placeholder rendered yet, since the empty-state branch did not exist) and `h.text()` never matched `/has no open advance/i` | the `advanceIdEmpty` one-line-reason paragraph (`data-testid="advance-no-candidates"`), gated on `!loading && !error && claimant chosen && 0 candidates` |
| — | pre-existing `the SETTLEMENT switch...` cell broke as a direct, predicted consequence: `.value` no longer mirrors onto a `<select>` restored from a props value (the same reason the file's own `advanceAccountCode` control is already asserted only by `tagName`, never `.value`) | updated the ONE assertion + its comment to match `advanceAccountCode`'s own pattern; the WIRE-level assertion two lines below (`claim.advanceId === ADVANCE`) needed no change, proving AC2 by itself |
| — | e2e: `field(page, "advanceId").fill(...)` threw `Element is not an <input>...` against the ALREADY-BUILT app (confirmed the unit-level change alone, run against the real browser bundle, broke exactly one spec and no others — 12/13 passed unmodified) | `staff-expense-claim-mock.mjs` gained its own `staff_advance_summary` handler for `SEC.clientId` (it previously declined the verb outright); the walk now asserts the option's own date/amount text, then `.selectOption(SEC.advanceId)` |
| — | whole unit suite: `verb-ownership census · every RPC verb answered by two or more lane mocks is a NAMED, declared share` — `staff_advance_summary is answered by staff-advances-register-mock.mjs, staff-expense-claim-mock.mjs with no SHARED_RPC_VERBS declaration` | `e2e-fixture-ownership.test.ts`'s `SHARED_RPC_VERBS` gained the declared entry (both mocks gate on their own `p_client` and fall through otherwise — the same "declared share, not a collision" shape every other entry in that map already documents) |

I ran the FULL red-then-green cycle for slices 1 and 2 twice: once naturally (writing the test
before the implementation), and a second time deliberately — after both slices were green, I
`git stash`ed the component and translation files alone (keeping the tests) and reran the suite to
confirm both new cells, and the one edited pre-existing cell, failed for exactly the predicted
reason before popping the stash back. Transcript: 8/11 pass, 3 fail
(`'INPUT' !== 'SELECT'` ×2, an empty-array/placeholder mismatch), all three failures at the exact
lines the finished code addresses.

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| The advance-application section renders a chooser fed by the existing staff-advance summary read (the register's allocation editor's own source), listing only advances with a positive outstanding balance for the chosen claimant, showing date and outstanding | **done** | `staff-expense-claim-form.tsx` imports `getStaffAdvanceSummary` from `@/lib/registers/staff-advances-doors` — the exact function `lib/registers/staff-advances-workbench.ts` (the register's own workbench read) and `staff-advance-allocations-editor.tsx`'s caller both use. `advanceCandidates` filters `a.account_code === draft.claimantAccountCode.trim() && a.outstanding_cents > 0 && !a.voided` — the same predicate, read from `staff-advances-register.tsx:76`'s own `outstandingAdvances` filter, that feeds the register's allocation editor. Unit test `"the advance-application arm offers a CHOOSER fed by the claimant's own outstanding advances"` (PASS): given four candidate rows (the claimant's own outstanding one, another claimant's, the claimant's own VOIDED one, the claimant's own fully-discharged one), the rendered `<option>` values are exactly `["", FARAH_ADVANCE]` — proving the filter excludes the other three for three DIFFERENT reasons in one assertion — and `h.text()` matches both the booking date (`2026-02-01`) and the formatted outstanding amount (`400.00`). |
| The free-text advance-id input is gone; the submitted claim carries the chosen advance's id exactly as before, proved by the existing claim submit cells | **done** | The `<Input>` at the `advanceId` field is replaced by a `<NativeSelect>`; `lib/work/staff-expense-claim.ts` (`validateClaimDraft`, `toClaimWire`, `fieldForClaimPath`) is **byte-untouched** — `git diff cd2925391..HEAD -- apps/web/lib/work/staff-expense-claim.ts` is empty. The pre-existing `"the SETTLEMENT switch keeps every arm's typed value..."` cell's WIRE-level assertions (`claim.advanceAccountCode === "1190"`, `claim.advanceId === ADVANCE`) needed no edit and still pass; only the DOM-shape assertion immediately above them changed from reading `.value` off an `<input>` to reading `.tagName === "SELECT"` (the exact treatment the file already gives the neighbouring `advanceAccountCode` picker, for the documented reason: this stub DOM does not mirror a `<select>`'s value prop onto `.value` when it is restored rather than typed). The NEW chooser test's own submit half proves the forward direction: choosing `FARAH_ADVANCE` from the list and submitting yields `sent.claim.advanceId === FARAH_ADVANCE`. |
| A claimant with no open advance sees the chooser empty with a one-line reason and cannot submit an advance application | **done** | Unit test `"a claimant with NO open advance sees the chooser EMPTY with a one-line reason, and cannot submit"` (PASS): with a `staff_advance_summary` answer containing only ANOTHER claimant's row, the rendered options are `[""]` (placeholder only), `h.text()` matches `/has no open advance/i`, a submit attempt calls the `submit` stub zero times, and focus lands on the `advanceId` control — the pre-existing `advanceId` UUID-shape validation (`UUID_RE.test(draft.advanceId.trim())`, unchanged) already refuses a blank choice, so "cannot submit" needed no new refusal rule, only the new empty-state UI around it. |
| The staff-expense-claim walk covers choosing an advance from the list; the web unit suite stays green | **done** | `e2e/staff-expense-claim-walk.spec.ts`'s `"t638 the SETTLEMENT switch preserves what was typed..."` cell now asserts the rendered option's own date (`2026-02-01`) and amount (`400.00`) BEFORE choosing it with `.selectOption(SEC.advanceId)` — proving the choice is genuinely data-fed, not merely a same-shaped control. Full spec file: **13/13 pass** (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3510 CLARA_E2E_NEXT_PORT=3511 CLARA_E2E_RUNTIME_PORT=3512 pnpm --filter @clara/web e2e staff-expense-claim-walk`), including the register/history/a11y/viewport/keyboard cells this ticket did not touch. Whole unit suite (`node scripts/run-tests.mjs` from `apps/web`): **4986 pass / 0 fail / 2 skipped** (the 2 skips are the pre-existing, environment-gated live-Supabase-auth cells in `lib/entry/live-provider.test.ts`, unrelated to this ticket and unchanged by it). |

### Out of scope, honored

`advanceAccountCode` (the settlement's GL leg — which account is credited) is untouched: still a
full chart-of-accounts picker, unrelated to which SPECIFIC advance is discharged. #931's widened,
multi-advance allocation contract (a list, a suggestion, a per-advance cap, the `chatTurn_v22`
successor cut) was not anticipated beyond leaving `draft.advanceId` exactly where #931 will need to
read a single chosen value from — no allocation-list shape, no chat-side change, nothing in
`packages/runtime`.

## Gates, with counts

- **Test files added/touched**, run individually:
  - `apps/web/components/accounting/staff-expense-claim-form.test.tsx` — **11/11 pass** (2 new
    cells + 9 pre-existing, one edited). `node --import ./test/bootstrap.mjs --import tsx --test
    components/accounting/staff-expense-claim-form.test.tsx`.
  - `apps/web/e2e/e2e-fixture-ownership.test.ts` — **44/44 pass** (same command form), after
    declaring the new shared verb.
  - `apps/web/e2e/staff-expense-claim-walk.spec.ts` — **13/13 pass** (Playwright, this lane's own
    triple — command above).
  - `apps/web/e2e/staff-expense-claim-mock.mjs` is not itself a test file; exercised through the
    walk above.
- **`pnpm typecheck`** (repo root) — **apps/web: Done, packages/runtime: Done.** No errors.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (repo root, the runner's own env) — **exit 0**, whole
  repo (`eslint .` in every workspace, `check-token-contrast`, `check-test-manifest`,
  `check-message-keys`, `check-ui-add-guard`, each package's own lint script). No new findings.
- **`node scripts/run-tests.mjs`** from `apps/web` (the WHOLE unit suite, once, after every other
  fix landed) — **4986 pass / 0 fail / 2 skipped** (pre-existing, unrelated — see above).
- No SQL functions were added (no migration), so `operation-census.test.mjs`/`rig-isolation.test.mjs`
  do not apply to this ticket — not run.
- `packages/runtime` was not touched; `check-frozen-workflows.mjs` and
  `check-parts-parity.mjs` do not apply — not run.
- One genuine environment gap found and fixed along the way, unrelated to this ticket's own diff:
  this worktree's `node_modules` was missing `@shadcn/react` and nine other packages already
  present in `pnpm-lock.yaml` (added to the lockfile by an earlier, already-merged ticket, #970,
  before this lane's base) — `next build` failed with `Module not found:
  Can't resolve '@shadcn/react/message-scroller'` on the FIRST e2e attempt, before any change of
  mine. Fixed with `pnpm install --frozen-lockfile` in this worktree only (own `node_modules`, not
  shared with any sibling worktree — confirmed via `git worktree list` and `readlink -f
  node_modules`); no lockfile or package.json edit was made or needed.

## Docs

- `apps/web/README.md`: new section `## #930 — the staff-expense-claim advance leg gets a chooser,
  not a typed id`, describing the read/filter/UI shape, the e2e fixture split, and the relationship
  to #931. Also fixes the `#879` section's now-stale claim that `staff-expense-claim-mock.mjs`
  "deliberately declines" `staff_advance_summary` — it now owns that verb for its own client.
- `CONTEXT.md`: **no entry added, by design** — checked for precedent first. The existing
  "Advance application" term (line ~706) already states *"The discharge of a recorded staff
  advance by a stated allocation: WHICH advance... The register never infers it"* — this ticket
  changes HOW the advance is named (chosen vs. typed), not the concept; a new term would restate an
  existing one under a different name.
- `docs/PROGRESS.md`: not touched — outside a single ticket's report (addendum rule 10).

## Successor contract

None. This ticket touches no frozen chat or Work-tool body: `advanceId` was, and remains, a plain
string field on `ClaimDraft`/the claim wire, read identically by
`clara.admit_staff_expense_claim_work` and `packages/runtime/lib/staff-expense-claim-basis.ts`
regardless of how the browser filled it in. #931 — already filed, blocked-by nothing, next in this
lane — is where the successor contract for `chatTurn_v22`'s widened allocation-list arm belongs,
per the work order's own routing; this report names it so the orchestrator does not look for it
here by mistake.

## Follow-ups worth filing

- The worktree dependency gap above (`@shadcn/react` et al. missing from `node_modules` despite
  being pinned in `pnpm-lock.yaml` since #970, pre-dating this wave's base) may affect OTHER lanes
  whose rigs were provisioned the same way and have not yet run a full `next build`. Worth a
  one-line note in `RIG.md` or a preflight check, so a future lane does not spend a cycle diagnosing
  the same "Module not found" before reaching for `pnpm install`.

## Anything unverified

- Whether `staff_advance_summary`'s `as_of` default (today, per the door's own signature) ever
  needs to be anything other than "today" for this form — the brief does not ask for a
  backdated/as-of-a-date view of the chooser, and none was built.
- Live-server behaviour of `getStaffAdvanceSummary` against a REAL client with thousands of
  advances (pagination/perf) — the door itself is unchanged by this ticket and out of scope; the
  form reads the whole envelope once per mount, the same shape `enrolmentsRead`/`accountsRead`
  already use in this file.
