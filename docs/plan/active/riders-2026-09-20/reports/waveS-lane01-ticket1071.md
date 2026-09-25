# riders sweep wave · lane 01 · ticket #1071 — the accrual register's Amount column names its own kind

**Status: DONE.**
Branch `riders/wS-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\651`, base `7bc5a710f`.
Database `clara_l04` at `127.0.0.1:55744` (untouched by this ticket — no migration, no database
read of any kind was needed to build or verify it). Playwright triple
`https://127.0.0.1:3530 / 3531 / 3532` (no e2e spec touched — see the gates section for the browser
walk I read against, but did not re-run, and why).

Start state, as the work order requires: `git status` clean; `git log --oneline 7bc5a710f..HEAD`
showed #1051 (2 commits), #1080 (5), #1074 (4), #1073 (4), #1075 (2) and #1070 (1) already landed, top
commit `ccb1352dc` (`feat(web): #1070 the accrual detail view renders the per-period schedule`). I
read `reports/waveS-lane01-ticket1070.md` before building (the continuation note's own instruction),
since #1070 and #1071 both touch the accrual-register surface family and #1070's report records the
exact base-drift lint finding this ticket also hits.

Commit added by this ticket:

| sha | message |
|---|---|
| `f782b48a0` | `feat(web): #1071 the accrual register's Amount column names its own kind` |

Working tree clean after the commit. Nothing pushed, no PR, no GitHub write of any kind. **No
message arrived mid-task** (sweep rule (f) did not fire).

---

## The seam I tested at (written before the first test, work order rule 4)

**`components/accruals/accruals-list.tsx`'s `AccrualsList` component's rendered Amount column** —
the ticket's own "Key interfaces" line names it directly ("the accrual register's row rendering
(whatever component reads `clara.list_accrual_adjustments`'s answer and renders the Amount
column)"). Driven through its real public entry point (`clientId` prop, mounted under
`NextIntlClientProvider`), with `fetch` mocked at the transport boundary exactly the way the rest of
`accruals-list.test.tsx` already does (`rpcRouter`) — never an internal collaborator, never the
unexported `AccrualRow`, never a DOM query into implementation structure, never the new
`amountKindLabel` helper called directly (it is proven only through what the mounted component
renders).

What I deliberately did **not** add a seam at: `clara.list_accrual_adjustments` itself (unchanged —
the ticket's own "Out of scope" line says "Changing `clara.list_accrual_adjustments`'s return
shape"), and `components/accruals/accrual-detail.tsx` (the ticket's "Out of scope" line also excludes
"Rendering the individual per-period figures in the register itself (that is the accrual detail
view's job, tracked separately)" — that job is #1070's, already landed; this ticket touches the
register's own Amount column and nothing else).

---

## The ticket, verified live on this branch before building

`gh issue view 1071 --json number,title,body,comments` (`gh issue view 1071 --comments` produced no
output in this shell, the same quirk #1070's report recorded — the JSON form worked cleanly): the
issue carries the only Agent Brief, filed as part of the triage pass, **zero comments**, so there is
no owner ruling comment on this ticket and none dated 2026-09-20 either.

`SWEEP-PLAN.md`'s own lane table lists #1071 last in L1 with no migration needed, and its census
does not list #1071 among the narrowed, re-briefed or needs-info tickets — so the Agent Brief as
filed is what I built to, unmodified.

| the brief's claim | measured on `accruals-list.tsx` before a line was written | verdict |
|---|---|---|
| "`clara.list_accrual_adjustments` … prints `amount_cents` under an 'Amount' column for every accrual, regardless of method" | confirmed: `AccrualRow`'s Amount `<TableCell>` (pre-change) read `{formatCents(row.amount_cents)}` and nothing else | **live** |
| "For a `stated_period_amount` accrual, the same field is the TOTAL across the whole window, and the actual per-period figures live in a separate `period_amounts` array the register does not surface at all" | confirmed: `AccrualListRow` (`lib/accruals/api.ts`) carries no `period_amounts` field at all — that key exists only on `AccrualDetail`, the detail door's answer, never on the list row. The register genuinely cannot surface the per-period breakdown even if it wanted to; it can only say which KIND the total is. | **live, and explains why the fix is a label, not a breakdown** |
| "A reader scanning the register cannot tell, from the Amount column alone, whether they are looking at a recurring per-period figure or a window total" | confirmed: the Term column's `methodLabel(t, row.method?.rule)` (line 139, pre-change) already states the same fact in a full sentence, but in a DIFFERENT column, so a reader reading the Amount column in isolation had nothing beside the money | **live** |
| Out of scope: "Changing `clara.list_accrual_adjustments`'s return shape" | not touched — `lib/accruals/api.ts` carries zero diff from this ticket | **respected** |
| Out of scope: "Rendering the individual per-period figures in the register itself" | not built — the register still shows only `amount_cents` plus its new kind label, never a `period_amounts` breakdown | **respected** |

---

## Acceptance criteria, each with its evidence

### AC1 — "A `stated_amount` accrual's Amount column is unambiguously a per-period figure (unchanged from today, but now explicitly labelled…)." ✅ built

* **`1071.list.amount-kind`** (`accruals-list.test.tsx`) — `ROW` (`method: { rule: "stated_amount" }`,
  `amount_cents: 120000`) renders `1,200.00Per period` as one contiguous text run inside its Amount
  cell (`assert.match(text, /1,200\.00Per period/)`). **PASS.**
* The figure itself is unchanged: `formatCents(row.amount_cents)` is still the first thing the cell
  renders, byte-identical to before this ticket; only the new label is appended.

### AC2 — "A `stated_period_amount` accrual's Amount column makes clear it is a window total, not a per-period figure." ✅ built

* Same test, second row: `PERIOD_TOTAL_ROW` (`method: { rule: "stated_period_amount" }`,
  `amount_cents: 200000`, deliberately not a round multiple of `ROW`'s amount so a cell that matched
  the wrong row's figure could not pass by accident) renders `2,000.00Window total`
  (`assert.match(text, /2,000\.00Window total/)`). **PASS.**
* Negative half, proving the label is tied to the RIGHT row and not just present somewhere on the
  page: `assert.doesNotMatch(text, /1,200\.00Window total/)` and
  `assert.doesNotMatch(text, /2,000\.00Per period/)` — both pass, so neither label leaked onto the
  other row's amount.

### AC3 — "A test covers both cases rendering distinguishably." ✅

`1071.list.amount-kind` is that test: one render, two rows, two distinguishable Amount cells, plus
the two negative assertions above proving the distinction is genuine and not coincidental.

**Seen red for the right reason first** (work order rule 4's vertical-slice discipline): before the
implementation, the same cell failed on its very first assertion —

```
error: "ROW's Amount cell names its own figure as the per-period one, right beside the money"
actual: "...1,200.002026-07-01 to 2026-07-31Configured...2,000.002026-07-01 to 2026-07-31Configured..."
```

— the pre-change Amount cells held only the bare figure, no label at all. One slice: one red test,
the minimal code (the `amountKindLabel` helper plus one new `<span>`) turned it green, no further
cycles were needed because the whole ticket is one small, coherent rendering change.

---

## No migration

**None was needed, and none was added.** The ticket's own "Out of scope" line rules one out
explicitly ("Changing `clara.list_accrual_adjustments`'s return shape"), and the fix reads a field
(`method.rule`) the door already returns on every `AccrualListRow`. `git diff --stat` for the one
commit touches `apps/web/README.md`, `apps/web/components/accruals/accruals-list.test.tsx`,
`apps/web/components/accruals/accruals-list.tsx`, `apps/web/messages/en.json` — nothing under
`packages/db/migrations/`. The prompt's own instruction ("This ticket is expected to need NO
migration. If you find it needs one, stop this ticket") did not fire.

---

## The change

`components/accruals/accruals-list.tsx`'s `AccrualRow` gains a `<span className="block text-xs
text-muted-foreground">` inside the existing Amount `<TableCell>`, immediately after the money
figure, holding the new `amountKindLabel(t, row.method?.rule ?? "")` — the same `block text-xs
text-muted-foreground` shape `occurrenceCount` already uses under the State badge two columns over,
so the new label reads as a house-standard sub-line rather than a one-off treatment.

`amountKindLabel` sits beside `sideLabel` and `methodLabel` in the same file, with the identical
"honest raw-value fallback" shape those two already establish: `stated_amount` maps to
`amountKindPerPeriod` ("Per period"), `stated_period_amount` maps to `amountKindWindowTotal`
("Window total"), and a rule this build has not enumerated prints as itself rather than a false claim
about which kind the figure is — the same closed-set-with-an-honest-escape-hatch reasoning
`methodLabel`'s own comment states for the CHECK constraint `ACCRUAL_METHODS` mirrors.

**Both cases are labelled**, not only the `stated_period_amount` one. The brief's own AC1 phrasing
allows leaving `stated_amount` unlabelled ("unchanged from today, but now explicitly labelled IF the
register adds a distinguishing label to the other case"), but labelling only one case would ask a
reader to infer "no label means per period" — a silent convention rather than a stated fact, and the
opposite of how `sideLabel` already treats its own two-member set (both `expense` and `revenue` are
always labelled, never one left to silence). Labelling both keeps the register consistent with its
own existing house pattern and removes the inference step entirely.

**The Term column is untouched.** `methodLabel` (used by the Term column, line ~139) already states
the same underlying fact in a full sentence — the new `amountKindLabel` is a SHORT, DIFFERENT
message deliberately, not a duplicate string, because the ticket's own "Desired behavior" line gives
"per period" / "total" as the example wording, and a full sentence repeated verbatim under the money
figure would be redundant clutter beside a column that already carries `methodLabel`'s sentence two
columns to the left.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| the touched test file, direct run | `node --import ./test/bootstrap.mjs --import tsx --test components/accruals/accruals-list.test.tsx` (from `apps/web`) | **6 tests, 6 pass, 0 fail, 0 skipped** (5 pre-existing + the 1 new `1071.list.amount-kind` cell) |
| typecheck | `pnpm typecheck` (repo root) | **exit 0** (`apps/web typecheck: Done`, `packages/runtime typecheck: Done`) |
| root lint chain, as the runner sees it, base-corrected | `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` (repo root) | **exit 0**, including `[check-message-keys]` reporting "4688 static `t("…")` key(s) in apps/web all resolve to a string in messages/en.json" (both new keys, `amountKindPerPeriod` and `amountKindWindowTotal`, are counted and resolve) and `[check-test-manifest]` reporting all 541 files present exactly once (no manifest change was owed — I added tests to an EXISTING, already-registered file) |
| whole `apps/web` unit suite once (I touched `apps/web`) | `node scripts/run-tests.mjs` from `apps/web` | **5179 tests, 5177 pass, 0 fail, 2 skipped, 0 cancelled** (one more test than #1070's own run of 5178, exactly the one cell this ticket added; the 2 skips are the same pre-existing `test.skip` cells #1070's report already named — neither known Windows flake fired this run) |
| browser walk | none re-run; read instead | I touched no e2e spec file, so rule 8's literal text ("each browser walk you touched") does not own one — the same reading #1070's report applied. I went further than that reading here because `apps/web/e2e/accrual-walk.spec.ts` exercises the EXACT surface I changed (the accrual list page): its list-page assertions (`accrual.walk.evidenced`, lines 95-107) use `expect(row).toContainText("1,200.00")` and `toContainText("4,500.00")` against the WHOLE `<tr>` via `page.getByRole("row").filter(...)`, which is a substring check — my change appends `"Per period"`/`"Window total"` immediately after the figure inside the same cell, so the row's full text still CONTAINS the pinned substring unchanged. I did not execute the walk (no server was started for this ticket), so this is a read-based check, not a run, and is recorded as such rather than as a claim that the walk was driven and seen green |
| `packages/db` gates (operation-census, rig-isolation, per-file full chain) | not run | I touched no file under `packages/db` and added no SQL function |
| `packages/runtime` gates (`check-frozen-workflows.mjs`, `check-parts-parity.mjs`) | not run as a standalone rule-8 requirement (I touched no `packages/runtime` file); `check-frozen-workflows.mjs` DID run as part of the root lint chain above (with the same `FREEZE_BASE_REF` override #1070's/#1073's/#1075's reports already documented) and is clean against the lane's own base |

### The lint base-drift, inherited from earlier tickets in this lane, not caused by this one

`CI=true GITHUB_ACTIONS=true pnpm lint` **without** `FREEZE_BASE_REF` fails at `check-frozen-workflows.mjs`
because `origin/main` in this worktree has advanced past the lane's own base (`7bc5a710f`) via the
concurrent cut-phase merge (`3bf6aa94d`, PR #1142). This is the exact condition #1070's, #1073's and
#1075's own reports already recorded for this lane, not something this ticket's diff introduces — my
diff touches no `packages/runtime` file and no frozen workflow body at all. Run with the supported
override (`FREEZE_BASE_REF=7bc5a710f`), the whole root lint chain is exit 0, as recorded above.

---

## Docs, in the same commit

* **`apps/web/README.md`** — a new `## #1071` section (after the existing `## #1070` section, before
  `## #940`; no existing section edited), naming the two meanings of `amount_cents`, the new
  `amountKindLabel` helper and its fallback shape, the choice to label both cases rather than leave
  one silent, and the new test cell.
* **`apps/web/messages/en.json`** — two new keys, `amountKindPerPeriod` ("Per period") and
  `amountKindWindowTotal` ("Window total"), inserted immediately after the existing
  `methodStatedAmount` key (the nearest existing key belonging to the same row-rendering group) and
  before `createHeading`, per the shared-file rule to keep the hunk minimal and at a sorted,
  logically-grouped position rather than re-serializing the file.
* **`apps/web/test/manifest.txt`** — no hunk owed. I added tests to an existing, already-registered
  file (`components/accruals/accruals-list.test.tsx`, already listed at its sorted position); I added
  no new test FILE.
* **`CONTEXT.md`** — no hunk owed. "Per-period figure" is already established domain vocabulary
  (`CONTEXT.md:936`, in the Prepayment-schedule family's own "_Avoid_" line), and this ticket changes
  how an already-documented distinction is DISPLAYED in one more place, not what it means or adds a
  new concept.
* **`apps/web/tests/firm-scope-db-pins.corpus.ts`** — no hunk owed (sweep rule (d): only in scope
  when a migration file changed; none did).

---

## Successor contract

**None is owed.** This ticket touches no frozen workflow body and no module in a frozen closure
(`git diff --stat` for the one commit: `apps/web/README.md`,
`apps/web/components/accruals/accruals-list.test.tsx`,
`apps/web/components/accruals/accruals-list.tsx`, `apps/web/messages/en.json` — nothing under
`packages/runtime`). No door's name, signature, argument order, grant, part kind or refusal
vocabulary changes; `clara.list_accrual_adjustments` is read exactly as before, unmodified, by
exactly the same caller (`lib/accruals/api.ts`'s `loadAccruals`). No frozen chat or Work tool reads
this component (it is a rendering surface, not a door), so there is nothing for a successor contract
to name.

---

## Follow-ups worth filing (I filed nothing — no GitHub write)

None identified specific to this ticket. One observation for the record, not a defect: the register
still cannot show the actual PER-PERIOD figures (only that the total is a total) because
`AccrualListRow` carries no `period_amounts` field — a reader who wants the breakdown still has to
open the accrual's own detail page (#1070). The brief's own "Out of scope" line places that
deliberately outside this ticket, so this is confirmation the scope line was followed, not a gap.

---

## Anything unverified

* **The browser walk was read, not run** (see the gates table) — I am confident in the substring-
  match reasoning but did not start a server and drive `accrual-walk.spec.ts` against my change on
  my triple, since rule 8 does not own it for a spec file I did not touch. If the integrator wants a
  driven proof rather than a read-based one, `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3530
  CLARA_E2E_NEXT_PORT=3531 CLARA_E2E_RUNTIME_PORT=3532 pnpm --filter @clara/web e2e accrual-walk`
  from the worktree root is the command.
* **`gh issue view 1071 --comments` produced empty output** in this shell (exit 0, zero bytes), the
  same quirk #1070's report recorded for #1070. `gh issue view 1071 --json number,title,body,comments`
  worked normally and is the source the table above is built from.
* Nothing else. No database was touched, no migration was needed, and every gate rule 8 requires for
  an `apps/web`-only, no-`packages/db`, no-`packages/runtime` ticket ran to completion with the
  counts above.
