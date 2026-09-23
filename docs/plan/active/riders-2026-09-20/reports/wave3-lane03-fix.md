# Wave 3, lane 03 — review fix round

**Branch** `riders/w3-lane03` · **worktree** `C:\Users\zhant\Desktop\clara-wt\642`
**Base** `ffe63a0dd084e99b84c1368119845be273c421ce`
**Head before this round** `cb8040d542c30d841adc5c3552fcc291c7793ec0`
**NEW HEAD** `b9fe230d7` — `refactor(web): #1001 the two composition tables share the cells that are the same cell twice`

Single fix worker for both review axes (`/implement-spec`: all review issues are fixed by one
implementer). Working tree clean at start and at end; the cut-off implementer's #1002 work was
already committed across `86f62fb4c` / `ea9d22aed` / `cb8040d54`, so nothing was redone.

```
b9fe230d7 refactor(web): #1001 the two composition tables share the cells that are the same cell twice
ad7760d38 fix(web): #1002 the editor's face and its draft both rest on the door's facts
64254d6db fix(web): #1001 the cash cap disclosure names the cut the door makes
cb8040d54 feat(web): #1002 the second-pass cash-account-set membership editor          <- pre-existing
ea9d22aed feat(web): #1002 type the membership door and its hydration                  <- pre-existing
86f62fb4c feat(db): #1002 the second-pass cash-account-set membership editor's own read <- pre-existing
529608478 feat(web): #1001 render the client home's cash composition, headlined by the closing balance
c8da2a830 docs(context): #958 name the bank tie-out's GL balance, forbid a cash label
```

The three new commits touch **`apps/web` only** — `git diff --name-only cb8040d54..HEAD | grep -v '^apps/web/'`
is empty. **No migration was edited, added or re-applied**: none of the four findings needed a
schema or function change, so the lane database is untouched, the `0276` prestate pins are
unmoved, and `apps/web/tests/firm-scope-db-pins.corpus.ts`'s content shas did not need
re-measuring. `packages/db`, `packages/runtime`, `docs/PRD.md` and `docs/ARCHITECTURE.md` are
byte-identical to `cb8040d54`.

---

## SPEC-1001-A — major — **FIXED** (`64254d6db`)

> *The cash table's account-level truncation disclosure says "largest first"; the door cuts
> alphabetically by account code.*

**Reproduced.** Migration `0232_client_financial_pack.sql` builds the cash composition as
`jsonb_agg(… order by y.account_code)` over a subquery that ends `order by a.account_code` /
`limit 50` (0232:1152, 1210-1211), so the 50 rows a firm sees are the alphabetically first by
chart code. `apps/web/messages/en.json`'s `ClientFinancial.cashDrilldown.accountsTruncated` said
`"Showing {shown} of {total} accounts, largest first."` — a firm with 63 cash accounts was told
the 13 it cannot see are the small ones, when they may hold the largest balances behind the
headline. A disclosure that exists to stop silent wrongness cannot itself be untrue.

**Slice.** One cell first, red for the right reason, then the copy:

- New cell `ticket 1001 — the account-level cash disclosure names the cut the DOOR makes, never
  'largest first'` in `apps/web/components/firm/client-home/client-financial-charts.test.tsx`.
  It does **not** restate the ordering: `cashCompositionCut()` reads
  `packages/db/migrations/0232_client_financial_pack.sql`, slices the cash-composition block and
  extracts the single `order by … limit 50` above the cap, asserting it is `a.account_code`. Then
  it renders a 63-account truncated fixture and pins the `client-cash-accounts-truncated` node's
  own text exactly. A later reorder of the door moves this cell with it — which is precisely the
  drift that produced the defect.
- **Red seen:** `expected: 'Showing 1 of 63 cash accounts, in account code order.'` /
  `actual: 'Showing 1 of 63 accounts, largest first.'` (and the pre-existing sibling cell red on
  the same string).
- **Green:** the key now reads `"Showing {shown} of {total} cash accounts, in account code
  order."` — `client-financial-charts.test.tsx` **16 tests, 16 pass, 0 fail**.

**Deliberately NOT done — and flagged.** The **profit twin** (`ClientFinancial.drilldown.
accountsTruncated`, en.json:884) carries the identical untrue wording over the identical
`order by a.account_code` / `limit 50` (0232:1352, 1405-1406). It is byte-identical at the lane's
base, it is asserted verbatim by an e2e leg every lane shares
(`apps/web/e2e/home-board-walk.spec.ts:1266`, `"Showing 1 of 61 accounts, largest first."`), and
the review put it outside this lane. **It is a real defect on a live surface and wants its own
ticket** — see "Follow-ups" below. `apps/web/README.md`'s `#1001` section now states both the fix
and the outstanding twin, so a reader cannot take the cash wording as evidence the profit wording
is fine.

## SPEC-1002-A — minor — **FIXED** (`ad7760d38`)

> *Which dialog face opens is decided by the period-windowed `pack.cashSet`, not by the published-
> version fact the new read returns.*

**Reproduced, and the dead end is worse-named than the review said.** `pack.cashSet` comes from
0232's windowed select (`effective_from <= v_as_of and (effective_to is null or effective_to >=
v_as_of)`, 0232:1051-1055). The **publish door has no window at all**: it locks
`where v.client_id = p_client and v.state = 'published' for update` (0232:587-589). So for a human
reading an earlier period than the current version's `effective_from`, `pack.cashSet` is null, the
first-publish face opens — and that face states no date, so the door takes the `v_cur_id is not
null` branch and raises **`effective_from_required`** (0232:637-639), not `cash_set_version_raced`
(that one needs `v_cur_id is null`, which cannot happen here). Either way it is a refusal the
first-publish face has no field to answer. `get_client_cash_account_set_members` (0276:214) asks
the door's own question — the identical `state = 'published'` predicate — and is already loaded on
the same open.

**Slice.** Cell first:

- New cell `ticket 1002.1b the EDIT face opens on the published-version fact, even when the
  period-windowed pack says nothing` — mounts with `hasPublishedSet: false` and a `currentSet`
  carrying `publishedVersionId: "v1"`. **Red seen:** *"the EDIT face must open once the membership
  read names a published version"*.
- **Green:** `client-cash-set-dialog.tsx` now computes
  `const isEdit = hasPublishedSet || currentSet?.publishedVersionId != null;`. `pack.cashSet` stays
  the zero-latency FIRST answer so the face never flickers; the read is the authoritative one; the
  `||` means the face only ever moves first-publish → editor, never back.
- Guard cell `ticket 1002.1c a LOADED membership read with NO published version keeps the
  first-publish face` — against the obvious wrong fix (`currentSet !== null`). It is green on
  arrival, so its **vacuity control was run**: the subject was temporarily changed to
  `hasPublishedSet || currentSet !== null`, 1002.1c went red (*"a read that found NO published
  version must leave the first-publish face alone"*), and the subject was restored byte for byte
  (`const isEdit = hasPublishedSet || currentSet?.publishedVersionId != null;`, line 150) with the
  file green again.
- The comment in `client-financial-summary.tsx` claiming the read "never decides WHICH face the
  dialog shows" was corrected in the same commit — it had become false.

## SPEC-1002-B — minor — **FIXED** (`ad7760d38`)

> *The pre-check holds only on the first open per version; a reopen after closing shows stale dirty
> boxes and a diff built from them.*

**Reproduced.** `seededForRef` was keyed on `currentSet.publishedVersionId` alone and the dialog is
mounted unconditionally (only `open` toggles), so `selection` survived a close. The file's own
footer already asserted the opposite in words — *"cancel restores nothing because it committed
nothing — this dialog holds no draft that outlives it"* — so the face and the code disagreed.

**Slice.** Two cells first, both red:

- `ticket 1002.7 closing the editor discards the draft: a reopen shows the CURRENT version again,
  not the abandoned boxes` — unchecks `1090`, checks `1020`, types a date, proves the draft really
  is dirty, then closes and reopens. **Red seen:** the petty-cash box was still unchecked.
- `ticket 1002.7b a decision abandoned by closing the editor mints a NEW op key on the next
  submit` — **red seen:** the two submits carried the identical key
  `a1604123-2d90-4e5e-9dc6-dda7db80c175`. Nothing is touched after the reopen, deliberately:
  touching the date or a box renews the key on its own and would have made the cell pass for the
  wrong reason (the first draft of this cell did exactly that and was corrected before the fix).
- **Green:** the seeding effect now takes `open` in its dependency list. On a close (edit face
  only, and only once something was actually seeded) it clears `seededForRef`, `selection`, the
  stated `effectiveDate` and the refusal banner, and renews the op key — because the next open is
  reseeded from the current version and is therefore a *different decision*. **A refusal is still
  not a close**: the dialog stays open on a refusal and every dirty choice survives it, which cells
  1002.4 / 1002.4b / 1002.5 continue to prove.
- **The first-publish face is untouched:** the whole effect is behind `isEdit`, so that face keeps
  the draft behaviour #660 shipped; regression cell 1002.6 is unchanged and green.
- `mount` in the test file now builds its tree through `tree(opts, open)` so a cell can close and
  reopen via `rerender` — an update of the same mounted component, never a remount, which is the
  only way to prove what a reopen does with state the component was already holding.

`client-cash-set-dialog.test.tsx` → **12 tests, 12 pass, 0 fail** (was 8).

## STD-1 — minor, duplicated code — **FIXED** (`b9fe230d7`)

> *Cash composition table duplicates the profit drilldown table's JSX shape.*

**Reproduced and fixed, narrowly.** New module
`apps/web/components/firm/client-home/composition-cells.tsx` holds the two cells that really are
the same cell twice — `CompositionAccountCell` and `CompositionEntriesCell` (the `<ul>` of journal
links with `formatDay` / `fmtCents` / memo plus the entry-level cap disclosure) — together with
`entryHref`, **moved** out of `client-income-expense-chart.tsx` (its only two importers were the
two tables; moving it avoids the import cycle a shared cell module would otherwise create). Both
tables now call them.

**What was deliberately NOT extracted:** the table shells and their columns. The review's
`how_to_fix` suggested one `CompositionTable` taking "optional lists of extra leading/trailing cell
renderers"; the two tables genuinely differ in their columns (cash leads with a closing BALANCE
and names why each account is cash; profit has neither), and a component configured by arrays of
renderers would hide that difference behind an indirection harder to read than the two explicit
tables. The judgement is recorded here rather than made silently.

That the duplication really drifts is not a theory in this lane: the "largest first" copy was
carried from the profit table to the cash table unchanged. That is SPEC-1001-A, one commit earlier.

**No behaviour change**, and it is not asserted by fiat: the money-band batch plus the dialog cells
(47 tests) pass unchanged, including the cell that asserts every composition row still carries an
`?entry=<id>` address into the journals page.

---

## Findings left as they are, with the reason

| id | severity | disposition |
|---|---|---|
| **SPEC-1002-C** | note | **Left.** The AC sentence "only for a caller the publish door would admit" is enforced by the door at submit (CLR04), not at the entrance; the board's only evidence of a caller's rank is a refused READ, and `get_client_financial_pack` floors at VIEWER while `publish_client_cash_account_set` floors at ADMIN. The review asks for no change in this lane, and the posture is byte-identical to the pre-existing first-publish one. **Owner decision wanted:** reword the AC, or file a ticket to carry the caller's rank onto the board. Note that 0276 is deliberately floored at viewer (its own header argues the case), so the editor's *read* would stay reachable either way. |
| **SPEC-1002-D** | note | **Not editable from here.** The misattributed count lives in `reports/wave3-lane03-ticket1002.md`, and this worker's only writable file in the main checkout is this report. Correction for the integrator: that file's line "client-financial-charts.test.tsx → 34 tests, 34 pass" is the FIVE-file money-band batch total; the file alone was **15/15** at that time and is **16/16** now (one cell added by this round). The five-file batch is **34/34**, unchanged. The gate was really run and really green; only the attribution was wrong. |
| **SPEC-1001-B** | note | **Left, as the review asks.** `client-home-money-keyboard.test.tsx` was edited additively by #1001 and the ticket report discloses it in plain words. 4/4 green, re-run in this round's batch. |
| **SPEC-1002-E** | note | **Left, out of scope** ("which accounts may be members" is explicitly out of #1002's scope). The edit face still shows neither the petty-cash affordance nor the `pettyCashNote` sentence explaining its absence. Worth a follow-up; see below. |
| **SPEC-958-A** | note | **Left.** The census's AST-walk boundary is stated in the test header and in `apps/web/README.md`'s `#958` section, and no human-facing surface takes the escaping shape today. 7/7 green in the whole-suite run. |
| **STD-2** | note | **Left, deliberately.** `isEdit` is re-tested at four sites (title/description, the DialogBody, `submit()`, the footer label). Fowler's fix is two components or one shared map — but #1002's own AC requires the first-publish branch stay untouched byte for byte, and splitting the file is exactly the restructuring that AC forbids. This round made the smell marginally *smaller* (one `isEdit` definition now carries the whole rule, documented in place) rather than larger. Worth revisiting in the wave-4 shared cut, when the first-publish face is allowed to move. |
| **STD-3** | note | **Overridden by the work order**, as the standards review itself recorded: rule 4 permits "a commit per green slice or per small group of slices". This round's own commits are per slice group with the red quoted above for each. |

## Follow-ups worth filing

1. **The profit drilldown's account-level cap disclosure says "largest first" and 0232 orders that
   composition by `a.account_code` too** (en.json:884; 0232:1352, 1405-1406). Same defect as
   SPEC-1001-A, pre-existing since #660, on a surface every firm sees. Fixing it also touches
   `apps/web/e2e/home-board-walk.spec.ts:1266` and `client-financial-charts.test.tsx`'s
   `"Showing 1 of 51 accounts"` assertion — one small ticket, not a lane rider.
2. **Or reorder both compositions by size** and keep the original copy. That is a recut of 0232's
   function body (a migration) and a product decision about which 50 accounts a firm should see
   when the cap bites; it is the better answer if the cap is ever expected to bite in practice.
3. **The second-pass editor offers no path to change petty-cash membership and does not say so**
   (SPEC-1002-E): `cashSet.pettyCashNote` renders only on the first-publish face.
4. **The caller's rank is not on the board** (SPEC-1002-C), so an authoring entrance cannot be
   withdrawn for a below-admin caller on either face.

## Gates

All run in the lane worktree, after every edit.

| gate | command | result |
|---|---|---|
| `client-financial-charts.test.tsx` | `node --import ./test/bootstrap.mjs --import tsx --test <file>` (apps/web) | **16 tests, 16 pass, 0 fail** (15 before; +1 cell) |
| `client-cash-set-dialog.test.tsx` | same | **12 tests, 12 pass, 0 fail** (8 before; +4 cells) |
| money-band batch + dialog (6 files: charts, cash-summary, money-a11y, money-keyboard, profit-summary, cash-set-dialog) | same, one invocation | **47 tests, 47 pass, 0 fail** |
| whole `apps/web` unit suite | `node scripts/run-tests.mjs` (apps/web) | **4873 tests, 4871 pass, 0 fail, 2 skipped** — exactly +5 on the ticket reports' 4868/4866/2, which is the five cells this round added; both skips are the same pre-existing environment-gated Supabase-auth cells |
| typecheck | `pnpm typecheck` (worktree root) | **exit 0** — `apps/web typecheck: Done`, `packages/runtime typecheck: Done` |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` (worktree root) | **exit 0**, every selftest PASS |
| browser walk | `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3520 CLARA_E2E_NEXT_PORT=3521 CLARA_E2E_RUNTIME_PORT=3522 pnpm --filter @clara/web e2e home-board-walk` | **28 passed, 0 failed** (1.4m), including `p660.money.unpublished` (opens the first-publish dialog and cancels it) and `p660.money.disclosures` (the profit cap sentence, deliberately unchanged) |

Not re-run, with the reason: **`packages/db` gates, `check-frozen-workflows.mjs` and
`check-parts-parity.mjs`** — this round changed no SQL, no migration and nothing under
`packages/runtime` (`git diff --name-only cb8040d54..HEAD` is entirely `apps/web/`), and the
lane's own `packages/db` gates were run green by the ticket-1002 implementer and re-run green by
both reviewers on this same head. **No migration was re-applied**, so no redo path was used and no
pin was re-measured. No known Windows-only red was hit in any gate above.

## Docs updated in the same commits

- `apps/web/README.md` `#1001`: a new paragraph on the account-level cap disclosure — why it now
  names the door's own `order by a.account_code` cut, that the cell reads the ordering out of 0232
  rather than restating it, and that the **profit twin is still untrue and deliberately left**.
- `apps/web/README.md`: a new `#1002` paragraph — which fact decides the face and why `pack.cashSet`
  is not it, and that closing the editor discards the draft while a refusal does not.
- Module headers: `client-cash-set-dialog.tsx` (refusal vs close), `client-cash-trend.tsx` (the
  shared cells, and the account-code cut), `client-income-expense-chart.tsx` (the shared cells),
  `client-financial-summary.tsx` (the corrected claim about the membership read), and the test
  file header of `client-cash-set-dialog.test.tsx` (claims 6 and 7).
- `CONTEXT.md` — **not** touched: this round introduced no new vocabulary.

## Successor contracts

None. No frozen chat or Work tool needs anything from this round: every change is on the client
home's own rendered surface and none of it changes a door's name, input, argument order, refusal
mapping or part kind.

## Unverified

- That `apps/web/messages/en.json`'s cash key will not collide with another lane's hunk at
  integration. One value changed on one line, at its existing sorted position — but ten lanes edit
  that file this wave, so the integrator should expect it.
- The **profit twin's** ordering claim is verified against 0232 (`order by a.account_code`,
  0232:1405-1406) but **nothing was changed there and no cell now pins it**, so a later reorder of
  the profit composition would still leave that sentence behind.
