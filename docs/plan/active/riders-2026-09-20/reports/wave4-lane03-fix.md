# Riders wave 4 — lane 03 fix round (#938, #937, #942)

**Branch** `riders/w4-lane03` · **base** `cd2925391` · **head `b88ff916d`** · worktree
`C:\Users\zhant\Desktop\clara-wt\642` · database `clara_l03` (127.0.0.1:55743) · Playwright triple
3520 / 3521 / 3522.

Single fix worker for all three reviews (`/implement-spec`). The round's four commits, on top of the
lane's nine build commits:

| commit | what |
|---|---|
| `34cf64056` | `fix(db): #938 the queue splice composes with its own wave, and the two remedies get their cells` |
| `220849d46` | `fix(db): #942 the conflict row shows the period's own amount, the plan's status, and sees an issued invoice` |
| `3d11d3e0a` | `fix(web): #937 the sentence beside the method control states the rule that is selected` |
| `b88ff916d` | `fix(web): #938 the two conflict surfaces become one component, which names the document, the side and what each remedy settles` |

`git status` clean; nothing uncommitted. No push, no PR, no GitHub write, no other worktree touched.

## Verdict per finding

| id | sev | verdict |
|---|---|---|
| ADV-01 | blocker | **fixed** — re-driven from scratch this session, both branches, rolled back |
| L03-SPEC-01 | major | **fixed** |
| L03-SPEC-02 | major | **fixed** (AC3's widened wording is now implemented, not narrated) |
| L03-SPEC-03 | major | **fixed for the remedy the AC can hold; the other half is a measured re-reading** |
| ADV-02 | major | **fixed by the reviewer's own option (b)**, celled on both sides |
| ADV-03 | major | **fixed** |
| ADV-04 | major | **fixed** |
| ADV-05 | major | **fixed** |
| L03-SPEC-04 | minor | **fixed** |
| L03-SPEC-05 | minor | **fixed** |
| L03-SPEC-06 | minor | **fixed** |
| L03-SPEC-07 | minor | **fixed** |
| ADV-06 | minor | **fixed** |
| STD-942-01 | minor | **fixed** |
| L03-SPEC-08 | minor | **stays open, correctly** — no zh locale exists in this repo at all |
| L03-SPEC-09 | minor | **stays as built** — the reviewer asks for an owner reading, not a code change |
| standards smell (duplicated remedy state machine) | note | **fixed** — it was the cause of SPEC-01/06 |

---

## ADV-01 (blocker) — 0302's hard pin on `clara.list_review_queue` killed the integrated chain

**What was wrong.** `0302` pinned the splice target at one exact `sha256(prosrc)` and spliced at a
literal anchor naming every union arm that existed when the file was written. Several wave-4 lanes
splice their own `row_kind` onto that one function; whichever carries the LOWER migration number
applies first. Lane 01's `0297` recuts the same body (`f4a34c72…` → `a315367f…`), after which 0302's
pin can never be satisfied and its anchor matches zero times.

**The fix** (`34cf64056`, `packages/db/migrations/0302_accrual_bill_conflict.sql`):

- the prestate is **bimodal**: the recognised pre-image `f4a34c72…`, OR a body admitted on its
  STRUCTURE — this file's own row kind absent, and the two CTE seams (`  ), all_rows as (` and
  `  ), keyed as (`) each unique in the comment-stripped code AND in raw text (the 0146/0180/0260
  HIGH-1 guard);
- the insertion is **derived from those two seams**, never from a literal block naming sibling arms:
  the CTE goes immediately before the `all_rows` opener, the union arm immediately before the
  `keyed` opener, and the seam order is asserted;
- the shared column vector (`null::int open_proposal_count`) is asserted as a **measured +1 delta**
  with a floor of ten, never the absolute 10/11 the old file pinned. `0304`'s own postcheck was
  moved to the same measured shape (it had an absolute 11).

**Re-driven by me this session**, in ONE transaction that was rolled back
(`scratchpad/l03fix/adv01.mjs`; output quoted verbatim):

```
reconstructed pre  : f4a34c72e567bf825d4376d043ea23cc3d8bcd2d4f0caaee3a5d052bf8a25d69
0302 own pin       : f4a34c72e567bf825d4376d043ea23cc3d8bcd2d4f0caaee3a5d052bf8a25d69
RECONSTRUCTION == PIN: true
### BRANCH 1 - the recognised pre-image
  . #938 prestate: clara.list_review_queue is at this file's own measured pre-image (f4a34c72…).
  . #938: … the shared column vector went 10 -> 11 (+1, measured); owner (clara_fn_owner) and ACL byte-unchanged.
P + 0302 + 0304 == the LIVE body byte for byte: true
### BRANCH 2 - a sibling arm at a LOWER migration number applied first
  . #938 prestate: clara.list_review_queue is NOT at this file's pinned pre-image (measured 62c7f21a…)
    -- a sibling lane of the same wave spliced its own arm first. Admitted on STRUCTURE: …
  . #938: … the shared column vector went 11 -> 12 (+1, measured) …
both arms survive: payroll=true accrual=true union-arm=true  vector 11 -> 12
0304 composes on top of the sibling too: true
### after ROLLBACK: live body unchanged: true
clara.skip_plan_occurrence is back: true
```

Method, so the integrator can repeat it: the pre-image was **reconstructed from the live body** by
removing exactly what 0302 and 0304 add (the `bill_rows` CTE, its union arm, and 0304's two
keyed-section keys) — and it hashes to 0302's own pin, which is what makes the reconstruction
provably genuine rather than plausible. Branch 1 then replays `0302` + `0304` verbatim onto it and
reproduces the body this rig carries **byte for byte**, so the edited migrations still produce
exactly what the pre-fix ones produced. Branch 2 installs the same pre-image carrying a
payroll-shaped sibling arm (an eleventh row kind with the same trailing column, lane 01's shape) and
sees the structure branch admit it, both arms survive, and `0304` compose on top. Two pins were
re-pointed for the probe alone and for the stated reason: `clara._plan_admit_occurrence`, which this
lane's own later `0303` recuts (on the integrated chain `0302` runs first), and the door drop needed
to satisfy "`skip_plan_occurrence` is absent". Nothing was left behind: the live body re-measured
unchanged and the door is back.

## ADV-02 / ADV-03 / ADV-04 / SPEC-02 / SPEC-03 / SPEC-05 / STD-942-01 — the database half

`0302` and `0304` (both unmerged and therefore editable; re-applied as recorded under **Rig state**):

- **ADV-04** — the row showed the accrual's WINDOW TOTAL as "Accrual amount". `#937` (0303) changed
  what `accrual_adjustments.amount_cents` means under the `stated_period_amount` rule AFTER `#938`
  had written that column onto the row. The arm now resolves
  `coalesce((clara._plan_accrual_period_line(o.plan_id,o.due_date)->>'amount_cents')::bigint,
  aa.amount_cents)` — 0303's own "what does THIS due date accrue" body, falling back to the column
  only where it answers null (the `stated_amount` rule it is still true for).
  Cell `p938.read.per_period_amount` (300,000 / 350,000 two-period accrual, second period flagged →
  350,000, never 650,000).
- **ADV-03** — both remedies are plan-lane doors that refuse a plan which is not active, while the
  double count is still on the books. The row now carries `accrual_plan_status`, derived from the
  shared `id` the same way `accrual_side` is. Dropping the row would hide a live double count, so
  the row stays and the surface removes the controls with the reason.
  Cell `p938.read.plan_not_active` (ended and paused, beside the two doors' typed refusals).
- **SPEC-02 / #942 AC3** — an ISSUED invoice could never surface: a sales invoice admitted through
  the trade-invoice lane posts through `clara._record_journal_entry_core` with `origin='agent'` and
  a NULL `document_id`. The REVENUE side now also admits an entry that IS a `sales_invoice` trade
  invoice's own posting, joined the one way the estate links them (`trade_invoices.work_id` → the
  committed `operation_receipts` row whose `effects` names the entry). The EXPENSE side is
  deliberately unwidened: `#938` AC1 says "document-sourced journal entries" and a supplier bill
  reaches this estate AS a filed document. Cell `p942.conflict.issued_invoice` drives a real
  `admit_trade_invoice` + wake-posted sales invoice.
- **SPEC-03** — `p938.remedy.reverse_now_leaves_one_expense` sums `clara.journal_lines` on the
  accrual's own P&L account for the flagged period after the act and sees the document's amount
  alone.
- **ADV-02** — the skip remedy is pinned for what it MEASURABLY is by
  `p938.remedy.skip_is_about_the_NEXT_period`: it names the NEXT due date, so the flagged period
  keeps both amounts and keeps its row until its own reversal is admitted. This is the reviewer's
  option (b), taken deliberately: an accrual that has already posted cannot be un-posted
  (`clara.accounting_plan_occurrences` is append-only under 0193, and 0302's own header said so from
  the first commit), so the honest fix is to say it on screen and cell it, not to invent a
  retro-active skip. See **An acceptance criterion that cannot be literal** below.
- **SPEC-05** — `p938.read.service_period`: a bill posted OUTSIDE the accrued period whose recorded
  service period overlaps it surfaces; superseding that term with one outside the period clears it.
- **ADV-08** (a note, fixed with SPEC-04) — `p938.read.two_flagged_periods`: one plan with two
  flagged periods surfaces ONE row naming the EARLIEST, which is what `distinct on (plan_id) … order
  by plan_id, due_date` does.
- **STD-942-01** — 0304's tail `6 · THE DOORS' GRANTS ARE UNMOVED` now re-checks
  `clara.list_accrual_adjustments(uuid,date,date)` too (`clara_authenticated` granted; `public` and
  `clara_runtime` not), so all THREE externally-granted doors it recuts are covered, matching the
  claim its own corpus entry makes.
- **Redo shape** (found while fixing the above): 0304's splice tested ONE marker for the whole
  block, which made it un-redoable the moment a second edit arrived — under `CLARA_MIGRATION_REDO`
  the body already carried `accrual_side` and the new edits would have been skipped with it. **Each
  edit now guards itself on its own marker**, so a redo converges on exactly the body an apply
  produces. Driven twice on `clara_l03`.

## SPEC-01 / SPEC-06 / SPEC-07 / ADV-05 / ADV-06 — the web half

- The Accruals page carried its **own copy** of the skip/reverse state machine, byte-for-byte the
  inbox affordance's; the standards review named it as Duplicated Code and let it stand at two call
  sites. That duplication is exactly why three things were present in one copy and missing from the
  other (the document link AC2 asks for, the side `#942` put on the row, the period). The page now
  mounts **the same component the Needs-you inbox mounts**
  (`apps/web/components/firm/accrual-bill-conflict-affordance.tsx`) and keeps only its own chrome —
  the section, the sentence and the accrued amount to compare the document against. Three
  `Accruals.*` keys moved to their `NeedsYou.*` twins with it; nothing renders twice.
  `apps/web/components/accruals/accrual-bill-conflicts.tsx` is 64 lines now, down from 153.
- **SPEC-01 / SPEC-06** — the inbox item names the document (a `journalEntryHref` link from
  `row.entry_id`), the flagged period and the side.
- **SPEC-07 / ADV-06** — `NeedsYou.rowKinds.accrual_bill_conflict` is "A document arrived for an
  accrued period"; `Accruals.billConflictsHeading` / `…Body` name the **profit-and-loss account**
  and both documents ("a bill on an expense accrual, an invoice or receipt on an accrued fee").
- **ADV-02 / ADV-03 on screen** — `accrualBillConflictRemedyHint` says what each remedy settles, and
  a plan that is ended or paused renders the reason and what a bookkeeper can still do INSTEAD of
  two controls whose only possible outcome is a refusal (ended and paused read differently, because
  a paused plan can be resumed).
- **ADV-05** — `Accruals.methodHint` denied, beside the control, that the control had a second
  option. It is rule-dependent now (the shape `fieldAmount`/`amountTotalHint` already take on the
  same form), with `methodHintStatedPeriodAmount` beside it.
- **SPEC-04** — `apps/web/lib/firm/needs-you.ts`'s grounding comment said "MOST RECENT posted …
  occurrence", the opposite of what the read does. Corrected to EARLIEST (additive edit inside the
  existing block, per the lane's shared-file rule), widened to "profit-and-loss account" for the
  revenue side, and pinned by `p938.read.two_flagged_periods`. The new optional row key
  `accrual_plan_status` is documented beside `accrual_side`.

New cells: `apps/web/components/firm/accrual-bill-conflict-affordance.test.tsx` (five — the three
facts and the link target, the revenue side, the remedy hint, ended, paused; the affordance had no
unit file at all before), one in `accrual-form.test.tsx` (the hint under EACH rule), and three
assertions added to the browser walk (`apps/web/e2e/accrual-walk.spec.ts`: the two-sided section
copy, the side on the item, the remedy hint).

## What deliberately stays

- **SPEC-08 (#942 AC2, zh).** Not built and not claimed. `apps/web/messages/` holds `en.json` alone;
  adding a locale is a `routing.ts` + middleware change on top of a translation pass over 23+
  namespaces. It is an i18n lane's work, and AC2 should be marked partial on the ticket.
- **SPEC-09 (#937 AC3, the final-period remainder).** The reviewer asks for an owner reading, not a
  code change ("None mandatory"). The two cells that pin the boundary in both directions are kept
  (`p937.walls.uneven`, `937.periods: the final-period remainder governs an EVEN split and nothing
  else`). The ticket's two halves cannot both be literal — an exact-sum rule and a "remainder in the
  final period" rule only coincide for an even split — and the grill should settle which wins.
- **ADV-07 (note, not on this round's list).** `skip_plan_occurrence`'s dedupe hash omits
  `p_reason`, so a replay with a changed reason answers the first receipt. Left as the reviewer
  found it: the cheapest honest fix is one comment line in `0302`, but `0302` is no longer the
  frontier on this rig (`0303`, `0304` sit on top), `CLARA_MIGRATION_REDO` takes the highest applied
  version only, and any content edit also moves the `firm-scope-db-pins.corpus.ts` content sha. It
  is a note, both web callers mint a fresh `crypto.randomUUID()` per click, and it belongs in the
  same commit as the next legitimate `0302` edit or in its own follow-up.
- **An acceptance criterion that cannot be literal.** `#938` AC3 says "each remedy leaves exactly
  one live expense for the period afterwards". That is true of "reverse now" and provably false of
  "skip this period's next occurrence" for any implementation, because the flagged period's accrual
  has already posted and plan occurrences are append-only: skipping only ever targets a FUTURE due
  date. Rather than widen a frozen law or pretend, the round celled what each remedy really does and
  said it on screen. The owner may prefer a third remedy ("reverse this period with a journal entry
  of its own") — that is a new ticket, not this one.

## Rig state and migrations

| file | content sha256 | ledger |
|---|---|---|
| `0302_accrual_bill_conflict.sql` | `db1cbb124f339cc0d2bebd8236139981ef1629ef68106f575332a7a4568224a7` | applied |
| `0303_accrual_period_amounts.sql` | `13cc21dc82ce25f785072dd4cf5b5b826166e99c52e465687e8b72bb6752828d` | applied |
| `0304_accrual_revenue_side.sql` | `95c8bdd5507710f59fc6d7219be50320c813cc094cf92e980b36a30a745a5857` | applied |

`node scripts/migrate.mjs` on `clara_l03`: **0 new applied · 292 total**, no checksum drift — the
ledger and the files agree. `0304` was re-applied through the supported redo path
(`CLARA_MIGRATION_REDO=0304_accrual_revenue_side`, destructive guard set), as the addendum requires.

**One thing the integrator should know, stated plainly.** `0302` was edited in this round while it
was no longer the frontier (`0303`/`0304` sit on top), so `CLARA_MIGRATION_REDO` could not target
it; the lane database's ledger row for `0302` carries the post-fix file sha with its ORIGINAL
`applied_at` (`2026-09-23T19:25:35Z`), i.e. it was repaired in place rather than re-applied. What
makes that safe is not the ledger row but the replay above: the edited `0302`, run onto its own
reconstructed pre-image, produces the body this rig carries **byte for byte** (`P + 0302 + 0304 ==
the LIVE body: true`). The authority is still the integrator's from-scratch chain, and ADV-01's
whole point is that that chain must be run with lane 01's `0297` in it.

**Prestate pins as they now stand** (`0302`): `clara.list_review_queue(jsonb,jsonb,integer)`
`f4a34c72e567bf825d4376d043ea23cc3d8bcd2d4f0caaee3a5d052bf8a25d69` — **now bimodal**, so a lane that
recuts this body no longer collides with it; plus the nine unchanged dependency pins
(`_plan_door_ctx`, `_plan_due_index_on_or_before`, `_plan_due_nth`, `_plan_occurrence_period_key`,
`_human_ctx`, `_reserve_op`, `_finish_op`, `_hash`, `_audit`, `role_rank`) and the three
non-regression pins (`_plan_admit_occurrence a34744199379…`, `_plan_admissible_event 3b569e338f1c…`,
`_tf_plan_occurrences_append_only ace3fedbb60c…`). `0304`'s ten pre/post pin pairs are **unchanged by
this round** (no sha in that table moved; verified on the diff).

## Gates

| gate | result |
|---|---|
| `packages/db` `accrual-bill-conflict.test.mjs` (full 109-gate chain, `--test-concurrency=1`) | **15 / 15** (9 before, +6 this round) |
| `packages/db` `accrual-revenue-side.test.mjs` | **9 / 9** (+1) |
| `packages/db` `accrual-period-amounts.test.mjs` | **12 / 12** |
| `packages/db` `accrual-adjustments.test.mjs` | **21 / 21** |
| `packages/db` `operation-census.test.mjs` | **10 / 10** |
| `packages/db` `rig-isolation.test.mjs` (no reset flags) | **23 tests · 22 pass · 0 fail · 1 skip** |
| `node scripts/migrate.mjs` | 0 new · 292 total · no drift |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **5025 tests · 5023 pass · 0 fail · 2 known skips** |
| `pnpm typecheck` | **exit 0** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| `pnpm --filter @clara/web e2e accrual-walk` on 3520/3521/3522 | **20 / 20 passed (30.6s)** |
| `node scripts/check-frozen-workflows.mjs` | **OK — 312 frozen files, no manifest diff** |
| ADV-01 replay probe (one transaction, rolled back) | both branches pass; live body re-measured unchanged |

No known Windows-only red was hit in this round.

## Docs updated in the same commits

- `CONTEXT.md` — the "Settlement candidate row" entry gains the sentence `#947`/`#949` will read
  next: a derived row outlives its own REMEDIES; when the plan they act on is ended or paused the
  row stays and the surface renders them unavailable with the reason, rather than the row vanishing
  or offering a control whose only outcome is a refusal.
- `packages/db/README.md` — the composability rule for `0302` (bimodal pin, seam-derived insertion,
  measured vector delta) and `0304`'s per-edit redo guard and third door-grant check.
- `apps/web/README.md` — the one component behind both conflict surfaces and what it says.
- `apps/web/tests/firm-scope-db-pins.corpus.ts` — both migrations' content shas re-measured
  (`0302 db1cbb12…`, `0304 95c8bdd5…`) and both reason strings rewritten to describe what the files
  now actually do (five edits, self-guarding, three door grants).

## Successor contracts (unchanged by this round)

`#937` AC4 and `#942` AC5 remain successor contracts for the ONE shared `chatTurn_v22` /
`claraWork_v6` cut at the end of wave 4 — the full contracts (name, zod delta, door call with
argument order, refusal mapping, part kind, prompt stanza, the World e2e leg) are in
`wave4-lane03-ticket937.md` and `wave4-lane03-ticket942.md`. The cut must consume **both together**:
`#937`'s `period_amounts` key and `#942`'s `side` key land on the same `p_accrual` jsonb of
`clara.create_accrual_adjustment_for`. Nothing in this round changed either contract's shape;
`check-frozen-workflows.mjs` is clean.

## Follow-ups worth filing

1. **ADV-01 is a wave-wide shape, not a lane-03 bug.** Any lane that pinned `clara.list_review_queue`
   at an exact sha, or anchored on a literal union block, or asserted the shared column vector as an
   absolute, dies the same way. Worth a one-line check across the wave before integration.
2. `#942` follow-up 1 (unchanged): rename `expense_account_code` / `liability_account_code` to
   `pl_account_code` / `bs_account_code` at the `chatTurn_v22` cut — under `side:'revenue'` they hold
   an income account and an asset account, and CONTEXT.md has to say so in prose.
3. `#942` follow-up 2 (unchanged, pre-existing, measured in this lane): a correction landing between
   a posted accrual and its reversal strands the difference on the balance-sheet leg. It belongs to
   whichever lane owns 0193's reversal basis.
4. An i18n lane for `zh` (SPEC-08), and `ADV-07`'s one comment line whenever `0302` is next edited.
5. A third remedy for `#938` — "reverse this period with a journal entry of its own" — if the owner
   wants the flagged period settleable without waiting for the scheduled reversal.

## Anything unverified

- The zh half of `#942` AC2 (not built; measured, not claimed).
- `#937` AC3's "narrow-width usable": still structural (`flex flex-wrap`, `min-w-40 flex-1`), never
  measured at a viewport. Unchanged by this round.
- The true from-scratch chain WITH lane 01's `0297` in it: only the integrator can run it. What this
  lane proves is the replay above, on one database, in a rolled-back transaction.
