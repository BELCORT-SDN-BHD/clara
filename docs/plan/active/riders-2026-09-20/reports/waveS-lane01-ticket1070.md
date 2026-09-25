# riders sweep wave · lane 01 · ticket #1070 — the accrual detail view renders the per-period schedule

**Status: DONE.**
Branch `riders/wS-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\651`, base `7bc5a710f`.
Database `clara_l04` at `127.0.0.1:55744` (untouched by this ticket). Playwright triple
`https://127.0.0.1:3530 / 3531 / 3532` (unused by this ticket — no e2e spec touched).

Start state, as the work order requires: `git status` clean; `git log --oneline 7bc5a710f..HEAD`
showed #1051 (2 commits), #1080 (5), #1074 (4), #1073 (4) and #1075 (2) already landed, top commit
`c6355d4ef` (`test(db): #1075 the optional filter, its composition with the window, and the closed
set`). This ticket needed no database read at all (pure `apps/web` component + test change), so the
lane database's file count was not re-measured for it.

Commit added by this ticket:

| sha | message |
|---|---|
| `ccb1352dc` | `feat(web): #1070 the accrual detail view renders the per-period schedule` |

Working tree clean after the commit. Nothing pushed, no PR, no GitHub write of any kind. **No
message arrived mid-task** (sweep rule (f) did not fire).

---

## The seams I tested at (written before the first test, work order rule 4)

1. **`components/accruals/accrual-detail.tsx`'s `AccrualDetail` component** — the ticket's own
   "Key interfaces" line names it directly ("the accrual detail rendering component"). Driven
   through its real public entry point (`clientId`/`accrualId` props, mounted under
   `NextIntlClientProvider`), with `fetch` mocked at the transport boundary exactly the way
   `accruals-list.test.tsx` already does for the sibling register component — never an internal
   collaborator, never `Body` (the unexported inner function), never a DOM query into implementation
   structure.
2. **`clara.get_accrual_adjustment`'s own answer shape** (`lib/accruals/api.ts`'s `AccrualDetail`
   type) — the seam's INPUT: `side` and `period_amounts`, both already returned by the door per the
   ticket's own "Current behavior" line, which this ticket does not touch.

What I deliberately did **not** add a seam at: the door itself (`clara.get_accrual_adjustment`,
unchanged — the ticket's own "Out of scope" line says so), and
`components/accruals/accrual-period-amounts.tsx` (the two FORMS' own editable block — the detail
view needed a read-only rendering, not that component, and the ticket does not ask the form's block
to be reused verbatim, only "the same shape").

---

## The ticket, verified live on this branch before building

`gh api repos/BELCORT-SDN-BHD/clara/issues/1070` (`gh issue view` produced no output in this shell
for reasons unrelated to the ticket — the REST call above returned the issue directly): the issue
body carries the only Agent Brief, filed 2026-09-24, and **zero comments**, so there is no owner
ruling comment on this ticket, and none dated 2026-09-20 either.

The Agent Brief's own words: "the accrual detail component only renders the window-total amount; it
shows neither the per-period schedule … nor a labelled 'which way it accrues' fact … Both the create
form and the correction form already render a per-period block and a side control; only the
read-only detail view was left out."

| the brief's claim | measured on `accrual-detail.tsx` before a line was written | verdict |
|---|---|---|
| "shows neither the per-period schedule … nor a labelled 'which way it accrues' fact" | **half stale**: `accrual-detail.tsx:94` already renders `factSide` / `sideExpense` / `sideRevenue` (added under #942) — the side WAS already rendered. The per-period half was live: the component read only `row.amount_cents` (the window total) and never `row.period_amounts`. | **narrowed, matching `SWEEP-PLAN.md`'s own scan** (census line 47-50: "#1070 asks the accrual detail view to render two facts. The side is already rendered … The per-period schedule is not … Build the per-period half and the missing test file only.") |
| "There is currently no dedicated unit test file for the accrual detail component in this codebase" | confirmed: `find apps/web -iname "*accrual*test*"` listed `accrual-correction-form.test.tsx`, `accrual-form.test.tsx`, `accruals-list.test.tsx`, `accrual-bill-conflict-affordance.test.tsx`, `accrual-draft.test.ts` — no `accrual-detail.test.tsx` | **live** |
| Out of scope: "Any change to the underlying detail read's data shape (already correct)" / "Changing the form or register rendering" | neither touched: `lib/accruals/api.ts` and `accrual-period-amounts.tsx`/`accrual-form.tsx`/`accrual-correction-form.tsx`/`accruals-list.tsx` carry zero diff from this ticket (`git diff --stat` below lists 4 files, all under `accruals/accrual-detail.*`, `README.md`, `test/manifest.txt`) | **respected** |

**The re-brief `SWEEP-PLAN.md` already gives (census line 47-50) is the one I built to**: render the
per-period schedule, and add the dedicated test file (which incidentally also proves the
already-built side fact, since the ticket's own AC3 asks the new file to cover "both facts" and its
AC2 is otherwise untested by any existing file).

---

## Acceptance criteria, each with its evidence

### AC1 — "Viewing a per-period accrual's detail shows each due date's stated amount, not only the window total." ✅ built

* **`1070.detail.periods`** (`accrual-detail.test.tsx`) — a `stated_period_amount` row with two
  period amounts (`2026-07-31` / 45000 cents, `2026-08-31` / 75000 cents, deliberately NOT an even
  split of the 120000-cent window total, so the assertion cannot pass by the component
  re-deriving a total the way `periodAmountsBalanced` would — the tautology trap the house TDD
  rule names). Renders `2026-07-31`, `450.00`, `2026-08-31`, `750.00`. **PASS.**
* **Seen red for the right reason first**: before the implementation, the same cell failed with
  `"the first period's own stated amount is on screen"` — `assert.match` against the rendered text,
  which at that point held only `factAmount`'s window total (`1,200.00`) and no per-period rows
  (captured actual-text diff below). This is the vertical slice's own red.

```
error: "the first period's own stated amount is on screen"
actual: "...AmountAccrued 1,200.00Currency...(no per-period section anywhere)..."
```

* **`1070.detail.no-periods`** — a `stated_amount` row (`period_amounts: []`) shows no per-period
  heading (`doesNotMatch(text, /Amount for each period/)`) — the negative half of AC1: the array is
  ALWAYS present per `lib/accruals/api.ts`'s own doc comment (`[]` under `stated_amount`, never
  absent), so "the schedule is absent" and "the schedule is empty" must render identically (nothing),
  never a stray empty table. This cell was already green before the implementation (there was
  nothing to render either way) and stayed green after — recorded honestly as a companion assertion,
  not a second red/green cycle.

### AC2 — "Viewing any accrual's detail shows which side it runs (expense or revenue), labelled consistently with the list and forms." ✅ already built, now proven

* **`1070.detail.side`** — a revenue-side row renders `Which way it accrues` (the SAME
  `factSide` label key `accruals-list.tsx` and both forms use) and `Income earned, not yet invoiced`
  (the revenue value, not the expense default) — `accrual-detail.tsx:94`, unmodified by this ticket,
  under test for the first time. **PASS**, and it was green on the first run: this line of the
  brief was already satisfied on `main` (#942), so there was no red/green cycle for it — only the
  gap of a test file proving it, which AC3 also asks for.

### AC3 — "A dedicated unit test file for the accrual detail component is added (none currently exists), covering both facts." ✅

`apps/web/components/accruals/accrual-detail.test.tsx` — new file, 3 tests, covering AC1 (twice:
positive and negative) and AC2. Registered in `apps/web/test/manifest.txt` at the sorted position.

---

## No migration

**None was needed, and none was added.** The ticket's own "Key interfaces" line names the read
(`clara.get_accrual_adjustment`) as ALREADY answering with both `side` and `period_amounts`; this
ticket is a rendering fix in `apps/web` only. `git diff --stat 7bc5a710f..HEAD` for this commit
touches `apps/web/README.md`, `apps/web/components/accruals/accrual-detail.test.tsx`,
`apps/web/components/accruals/accrual-detail.tsx`, `apps/web/test/manifest.txt` — nothing under
`packages/db/migrations/`. The prompt's own instruction ("This ticket is expected to need NO
migration. If you find it needs one, stop this ticket") did not fire.

---

## The change

`components/accruals/accrual-detail.tsx`'s `Body` function gains one new `<section>`, inserted
between the existing facts `<dl>` and the correction-lineage section, gated on
`row.period_amounts.length === 0` (render nothing) vs `> 0` (render the schedule) — never a
third "empty schedule" state. The section reuses the message key the two forms' own block already
carries (`t("periodAmountsHeading")`, "Amount for each period") so the label matches what a reader
of either form already saw, and reuses the two column-header keys already live on this same page
(`colDue`, already used by the occurrence table two sections down; `colAmount`, already used by the
register) inside the existing `DataTableCard`/`Table` primitives — the same read-only table shape
the rest of the page already uses, rather than mounting `AccrualPeriodAmountsBlock` (the FORMS' own
block), which is a `<select>`/`<input>`/remove-button editor with no read-only mode: a detail view
does not offer a control whose only outcome is editing a row the door has already admitted. Each row
prints the due date verbatim and `formatCents(amount_cents)` — the same formatter
`accruals-list.tsx` and both forms already use for money, so `120000` cents reads `1,200.00`
identically everywhere on this page.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| the new test file, direct run | `node --import ./test/bootstrap.mjs --import tsx --test components/accruals/accrual-detail.test.tsx` (from `apps/web`) | **3 tests, 3 pass, 0 fail, 0 skipped** |
| typecheck | `pnpm typecheck` (repo root) | **exit 0** (`apps/web typecheck: Done`, `packages/runtime typecheck: Done`) |
| `apps/web`'s own lint chain (eslint, token-contrast, test-manifest, message-keys, ui-add-guard) | `CI=true GITHUB_ACTIONS=true pnpm lint` from `apps/web` | **exit 0** |
| root lint chain, as the runner sees it, base-corrected | `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` (repo root) | **exit 0** — see the base-drift note below for why the override is needed and why it is NOT a ticket-caused red |
| whole `apps/web` unit suite once (I touched `apps/web`) | `node scripts/run-tests.mjs` from `apps/web` | **5178 tests, 5176 pass, 0 fail, 2 skipped, 0 cancelled** (the 2 skips are pre-existing `test.skip` cells unrelated to this ticket — `polygonPoints`/settlement fixtures, not `thread-live-clarify` or `use-clara-thread-stop`; neither known Windows flake fired this run) |
| browser walk | none run | I touched no e2e spec file (`apps/web/e2e/accrual-walk.spec.ts` exists and exercises this page, but rule 8 asks for "each browser walk you touched", i.e. a spec file edited — I edited none, so none is owed) |
| `packages/db` gates (operation-census, rig-isolation, per-file full chain) | not run | I touched no file under `packages/db` and added no SQL function |
| `packages/runtime` gates (`check-frozen-workflows.mjs`, `check-parts-parity.mjs`) | not run as a rule-8 requirement (I touched no `packages/runtime` file); `check-frozen-workflows.mjs` DID run as part of the root lint chain above and is clean against the lane's own base |

### The lint base-drift, which is NOT this ticket's and must not be read as a green without the note

`CI=true GITHUB_ACTIONS=true pnpm lint` **without** `FREEZE_BASE_REF` fails at its very first step
(`check-frozen-workflows.mjs`) with 38 `frozen-workflows.json` violations — the exact shape #1073's
and #1075's own reports already recorded for this lane. Reproduced with my changes fully **stashed**
(`git stash` / re-run / `git stash pop`): the same 38 violations, byte-identical list, appear on the
pre-ticket commit too, so this is not something my diff introduced. Cause, confirmed:
`git log -1 origin/main` resolves to `3bf6aa94d` (PR #1142, `docs/riders-cut-as-run`, merged
2026-09-25 14:29:53), while `git merge-base origin/main HEAD` = `7bc5a710f` = this lane's own base —
`origin/main` in this worktree has advanced past the lane's base via the concurrent cut-phase merge,
and the frozen-workflow checker compares against literal `origin/main` unless told otherwise. Run
with the script's own supported override (`FREEZE_BASE_REF=7bc5a710f`,
`scripts/check-frozen-workflows.mjs:153`), the WHOLE root lint chain (every package's own lint,
including `apps/web`'s and `packages/reporting-render`'s) is exit 0. My diff touches no
`packages/runtime` file and no frozen workflow body at all.

---

## Docs, in the same commit

* **`apps/web/README.md`** — a new `## #1070` section (after the existing `## #942` section, before
  `## #940`; no existing section edited), naming the gap in the brief's own words, the read-only
  vs. editable distinction, the reused message keys, and the new test file.
* **`apps/web/test/manifest.txt`** — one line, `components/accruals/accrual-detail.test.tsx`, at the
  sorted position (between `accrual-correction-form.test.tsx` and `accrual-form.test.tsx`).
* **`CONTEXT.md`** — no hunk owed. No new domain vocabulary: "per-period accrual amount" and
  "accrual side" are both already documented (lines 881-934) and this ticket changes how an
  already-documented fact is DISPLAYED, not what it means.
* **`apps/web/messages/en.json`** — no hunk owed. Every string the new section uses
  (`periodAmountsHeading`, `colDue`, `colAmount`) already existed, reused verbatim rather than
  duplicated, per the brief's own instruction to label "consistently with the list and forms".
* **`apps/web/tests/firm-scope-db-pins.corpus.ts`** — no hunk owed (sweep rule (d): only in scope
  when a migration file changed; none did).

---

## Successor contract

**None is owed.** This ticket touches no frozen workflow body and no module in a frozen closure
(`git diff --stat` for the one commit: `apps/web/README.md`,
`apps/web/components/accruals/accrual-detail.test.tsx`,
`apps/web/components/accruals/accrual-detail.tsx`, `apps/web/test/manifest.txt` — nothing under
`packages/runtime`). No door's name, signature, argument order, grant, part kind or refusal
vocabulary changes; `clara.get_accrual_adjustment` is read exactly as before, unmodified, by exactly
the same caller (`lib/accruals/api.ts`'s `loadAccrual`). No frozen chat or Work tool reads this
component (it is a rendering surface, not a door), so there is nothing for a successor contract to
name.

---

## Follow-ups worth filing (I filed nothing — no GitHub write)

None identified specific to this ticket. The two things the brief explicitly places out of scope
(the read's data shape, the form/register rendering) are both already correct and this ticket does
not touch either.

---

## Anything unverified

* **`gh issue view 1070 --comments` produced empty output** in this shell (exit 0, zero bytes) for
  reasons I did not chase further, since `gh api repos/BELCORT-SDN-BHD/clara/issues/1070` and
  `.../issues/1070/comments` both worked normally and returned the same information `gh issue view`
  would have rendered (body, zero comments). Noted in case it recurs for a later ticket in this
  lane — it is a `gh` CLI/output-pager quirk on this host, not a ticket-content gap: the REST calls
  are the authoritative source and both returned cleanly.
* Nothing else. No database was touched, no migration was needed, and every gate rule 8 requires for
  an `apps/web`-only, no-`packages/db`, no-`packages/runtime` ticket ran to completion with the
  counts above.
