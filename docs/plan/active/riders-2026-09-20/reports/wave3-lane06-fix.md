# Wave 3 · lane 06 · review fix round (#936, #919, #986)

**Branch** `riders/w3-lane06` · **worktree** `C:\Users\zhant\Desktop\clara-wt\656` ·
**database** `127.0.0.1:55746/clara_l06` (migrations 0001..0286, 270 files)
**Base** `ffe63a0dd084e99b84c1368119845be273c421ce` · **new head** `209bc3cfb`

Single fix worker (`/implement-spec`: every review issue is fixed by one implementer). Inputs:
`wave3-lane06-codereview-spec.json`, `wave3-lane06-codereview-standards.json`,
`wave3-lane06-review-adversarial.json`.

**Verdict: every blocker and every major is FIXED, with a cell that was seen failing first.**
Both minors on the standards axis are fixed. Every adversarial minor and note is fixed except one
note (ADV-08's database half), which is concretely refuted below. Nothing was recorded-and-left.

---

## 1 · The commits

    209bc3cfb test(db): #986 the #656 opening battery stops skipping, and its twelve cells pass
    b50a89716 fix(web): #986 the refresh's refusals in words, and the basis's own refresh record
    2c603a68e fix(runtime): #986 a receipt with no counts is not a successful refresh
    e630890b2 fix(db): #986 the refresh door runs the parse door's OWN caller-echo wall
    db7f220f8 fix(web): #919 the corrected-term flag reaches the list, and only a MOVED term
    ac82fe58f fix(db): #919 a superseded term ROW is not a corrected TERM
    daaed04e6 fix(web): #936 the generic plan revision is not the road to an accrual's figures
    c9d18ea54 fix(db): #936 a correction carries the LIVE revision's authority window
    91b400dfe docs: #936 #919 #986 the fix round's record, the copy it needs, and one new term

`91b400dfe` is deliberately FIRST and deliberately names three tickets. Four files in this round —
`apps/web/messages/en.json`, `apps/web/test/manifest.txt`, `packages/db/README.md` and
`apps/web/README.md` — carry hunks for all three tickets that interleave inside one file, and the
eight code commits after it each need their own copy to render and to pass. Splitting those four
across the eight would have meant three non-green intermediate commits or a per-hunk replay of
each file; naming the three tickets once, up front, is the honest form. The precedent for a
multi-ticket commit is the wave-1 `fix(web): #839 #880 #885 the lane's own three lint errors`.

50 files, +6570/−187 against the base (the whole lane, not only this round).

---

## 2 · Finding by finding

### ADV-01 — blocker — a correction silently rewrote the plan's authority window · FIXED

**Reproduced first.** Two new cells, red against the pre-fix door:

- `p936.window.withdrawn` — a firm withdraws the last month of authority through the generic
  `clara.revise_accounting_plan`, then corrects the accrual's amount. Expected `effective_to`
  `2026-10-31`, **got `2026-11-30`**: the withdrawn month was back, and the plan would accrue it
  again. This is the money-posting direction the adversarial lens named.
- `p936.window.extended` — a lawful revision extends the authority PAST the stated term; the
  correction **succeeded** where it should have refused (`expected SQLSTATE CLR10 but the call
  SUCCEEDED`), silently shrinking the window back to the superseded row's.

**The fix** (`packages/db/migrations/0284_accrual_correction.sql`). Every use of the window now
reads `v_cur` (the live revision) instead of `v_old` (the superseded accrual row): the nested
`clara.revise_accounting_plan` call, `clara._assert_accrual_term_window`,
`clara._accrual_journal_basis`'s posting date, and the successor accrual row's own
`effective_from`/`effective_to`. Because one of the term-window predicate's two operands is now
mutable world state, the wall moved from the payload half into the WORLD half — after the
reservation branch, under the RUNG-1 `accounting_plans` lock that holds the window still between
the read and the nested call. `clara._assert_accrual_particulars`, which reads nothing but the
payload, stays above the reservation.

**The tail census pins both halves.** Three new required tokens
(`clara._assert_accrual_term_window(p_accrual, v_cur.effective_from, v_cur.effective_to)`,
`v_cur.effective_from, v_cur.effective_to, v_basis`, `plan_op_key_conflict`) **and** two required
ABSENCES (`v_old.effective_from`, `v_old.effective_to`). An assertion about what is present cannot
catch a second, forgotten use of the stale pair — which is exactly the shape of the defect: five
schedule arguments read from the live revision and the sixth from `v_old`.

**Green after.** Both cells pass; `clara.revise_accounting_plan` is unmoved at `87c9f1e9…`
(lane 05's pin holds).

### ADV-02 — major — `term_live` went false on a re-record that changed nothing · FIXED

**Reproduced by this battery's own AC1 cell.** `p919.term.superseded` re-records the SAME two
dates — which is what a second verification against the same invoice looks like — and
`clara._record_document_service_period_core` supersedes the live row unconditionally (it compares
no dates). The detail banner then told the firm the term "has since been corrected" and that "a
corrected term needs a new schedule": a false statement of fact and wrong advice about a running
amortisation.

**The fix.** `0285` adds three fields to BOTH reads beside the two it already had:

| field | meaning |
|---|---|
| `term_live` / `term_superseded_by` | the AUDIT pair, unchanged: which row this schedule rode, and whether it is still the live statement |
| `term_moved` | the fact a SURFACE may act on: the row is superseded **and** the term in force today states different dates |
| `term_current_start` / `term_current_end` | the term in force today, so a reader and a cell can check the flag against the dates |

`term_moved` is computed against the document's one `superseded_at is null` row
(`uq_document_service_period_live`), never against `superseded_by`'s, so a twice-corrected term
answers about the term in force rather than an intermediate one.

**Cells.** `p919.term.superseded` and `p919.term.live` now pin `term_moved` false with the live
term naming the same dates; the new `p919.term.moved` drives a re-record that genuinely moves the
end date and pins `term_moved` true on both reads, `term_current_end` naming the corrected end,
and the schedule's own stored term untouched. 3/3 red before the migration fix, 3/3 green after.

**A second defect found while fixing it (not in any review).** 0285's prestate pinned the
pre-images of the two bodies it RECUTS, so it would refuse its own redo — the trap the wave-3
addendum names. It is now bimodal (FIRST = the 0223 sha, REDO = a body already carrying this
file's own `term_live` field beside its `#919` attribution) and refuses half-and-half outright.
The FIRST branch was proved by hand as the addendum requires — see §3.

### ADV-03 — major — the whole #656 opening battery was dark · FIXED (not filed)

**Reproduced:** `tests/opening-ledger-source.test.mjs` under the full 87-flag gate chain on
clara_l06 — **12 tests / 0 pass / 12 skipped**. Root cause confirmed: the premise probe demanded
the document-capability registry publish EXACTLY version 2, and 0245 (#782) raised all 240 rows to
3 (`document-capability-registry.test.mjs` pins that 3).

The adversarial report asked for this to be FILED as a ticket. I fixed it instead, because it is
what makes this lane's own AC3 claim checkable, and because the reviewer's own evidence note
(L06-SPEC-05) turns on it. The probe is now a FLOOR — 0228 guarantees the registry stands at its
publication **or a later one**, as a single version across the table, and 0207's monotonic wall
makes "or later" the only direction — with the reason written beside the constant. The one in-cell
assertion that read the same equality reads the floor too, and its title (which said "at version
2") is corrected.

**Re-run: 12 tests, 12 pass, 0 skipped.** Among the cells that now actually run are
`p656.tie.approve_rebinds` and `p656.seed.replay`, which guard the approval-rebinding and replay
behaviour 0286 builds on.

### L06-SPEC-01 — major — #936 AC2's reversal was never driven · FIXED

`p936.posted.untouched`'s own title asserted that an occurrence "AND ITS OUTSTANDING REVERSAL" are
unmoved by a correction, and the scene never admitted a reversal leg. It now posts the accrual and
then admits the reversal through `clara.request_plan_catch_up` (the same door `p652.reversal.binds`
drives), leaving it OUTSTANDING, which is the state the acceptance line is about. The cell asserts
both occurrence rows byte-for-byte unmoved after the correction, the reversal still naming the
entry it undoes with its attempts ledger unchanged, and the old accrual's own read carrying both
legs with `reversal.reverses_entry_id` intact.

### L06-SPEC-02 — major — the generic "Revise" control stayed reachable · FIXED

`clara.revise_accounting_plan` accepts an accrual's plan happily — it knows nothing about accruals
— so a bookkeeper reaching the plan from the Plans register could still write the contradiction
#936's first sentence names.

**Where the wall went, and why there.** `PlanReviseForm` is the only surface that can START the
generic act. For an accrual-backed plan it renders no form at all, says what would go wrong in the
words of the books, and links to `/clients/:clientId/accruals/:accrualId/correct`.

**Why the discriminator is a second read.** `clara.get_accounting_plan` carries no
"is this plan accrual-backed" field, and `kind` cannot stand in for it: **measured on clara_l06,
115 `reversing_journal` plans carry an accrual and 3 do not.** The honest discriminator is
`clara.accrual_adjustments.plan_id`, which the already-granted `list_accrual_adjustments` returns.
`liveAccrualForPlan` (pure, in `lib/accruals/api.ts`) picks the highest revision, because a
corrected accrual leaves both rows on the relation — that is the whole of #936's lineage.

The read is folded into the SAME `DataState` as the plan read, so the form renders only once both
have succeeded. A surface that fell back to the form when it could not tell would be choosing to
risk the contradiction; the plan's other lifecycle controls all stay on its detail page.

Three cells (accrual-backed / not accrual-backed / accruals read failed) in a new file
`apps/web/components/plans/plan-revise-form.test.tsx`; two of the three were seen failing against
the pre-fix component.

**Left deliberately:** the generic **Revise** LINK still renders on `plan-detail.tsx`. Suppressing
it there would mean a fourth read on every plan detail page and would 404 in each of that file's
existing cells; the act itself is walled, which is what the books need. Follow-up below.

### L06-SPEC-03 / L06-STD-2 — major / minor — the list surface never rendered the flag · FIXED

`term_live` / `term_superseded_by` reached `PrepaymentListRow` and every list fixture while
nothing read them — a type promising a fact the surface discarded. `ScheduleRow` now carries a
**Term corrected** badge beside the term (a WORD, never a colour alone — appendix D, Badge),
keyed on `term_moved === true`. Cell: exactly one of three list rows carries it (one moved, one
merely superseded, one live).

### L06-SPEC-04 — minor — the receipt relation was surfaced nowhere · FIXED

#986 AC2 is "retired and replaced, AND THE BASIS'S STATE SHOWS WHICH". The second half lived only
in the 202 banner, which is component state and gone on reload.

`loadOpeningTargetRefreshes` reads `clara.opening_target_refreshes` newest-first — a plain
firm-scoped SELECT the relation already grants, no door and no new grant — and
`OpeningSourceHeader` names the newest receipt beside the provenance line: how many readings this
basis has stood on, when the last retirement happened, and how many lines replaced how many. The
component still mints nothing; the only arithmetic is `refreshes.length + 1`, because the FIRST
reading leaves no receipt (it retired nothing).

It is a SEPARATE `useAsyncRead` in `OpeningSeedWorkbench`, for the reason that file already states
for the tie document's filename: a failure there — an older database under a newer build, most of
all — must degrade to "no refresh is named" rather than take the targets and the tie gates down
with it. Five cells (four on the header, one on the read's wire shape and its order, which is
load-bearing because the header names the newest).

### L06-SPEC-05 — minor — the report cited a skipping cell · RESOLVED BY ADV-03's FIX

`p656.tie.stale_extraction` now runs and passes, so the "a fresh op key is NOT the fix" citation is
driven evidence rather than a reading of a dark cell. The #656 battery is green evidence for this
wave's release record — 12/12 — rather than a blocker to carry.

### ADV-04 — minor — an absent `term_live` painted the warning on every prepayment · FIXED

The guard is now `row.term_moved === true ? … : null` on the detail surface and the same on the
list row. The field arrives as unvalidated jsonb, and an absent one — a web build ahead of its
database, or a rolled-back migration under a live runtime — is falsy, so the old truthiness test
would have warned on every prepayment in the firm. A cell drives exactly that shape (a row with
`term_live`, `term_superseded_by` and `term_moved` deleted) and asserts no banner.

### ADV-05 — minor — `no_reread_to_refresh` reached the professional as a raw token · FIXED

The three reasons 0286 mints (`no_reread_to_refresh`, `stale_extraction_version`,
`refresh_extraction_mixed`) each have their own branch in `OpeningParseOutcomeBanner` with their
own literal message key — a lookup table over `t()` would compile while a key was missing and fail
in the face. Each says what happened, that nothing was changed, and what to do next. Every other
refusal keeps the verbatim block (the cell re-checks that `registry_not_open` still renders raw).
The new cell checks token ABSENT **and** sentence PRESENT for all three, because a build printing
both would still be leaking the vocabulary.

### ADV-06 — minor — the derived nested key's collision escaped untyped · FIXED

**Reproduced:** `p936.refusal.plan_key_conflict` — a direct `clara.revise_accounting_plan` under
`<key>:plan`, then a correction under `<key>` — got `CLR10` with `detail.reason = null` and the
message "op_key reused with different args". The nested call is now wrapped: an UNTYPED CLR10 out
of it (which is exactly `_reserve_op`'s own detail-less refusal) re-raises with
`{"reason":"plan_op_key_conflict","field":"op_key","nested_op_key":"…"}`, and everything else
re-raises byte-identically through a bare `raise`, so no refusal the plan door already classifies
is masked or renamed.

### ADV-07 — minor — the refresh door dropped the parse door's echo wall · FIXED

**Measured before:** `position('opening_fact' in prosrc)` = 0 for the refresh door, nonzero for the
parse door — while 0286's header claimed "byte for byte the parse door's own per-line validation".
The `[R3-F1]` wall now runs in the refresh loop too, in the same position, with the same two
tokens, pinned by the tail census. It is a wall, never a source of figures.

`p986.reread.fact_echo` drives the PARSE door on the same payload first (so "the two doors agree"
is about a refusal that exists), then the refresh door at four points: a contradicting amount, a
contradicting side, a malformed echo (its own token — nothing was compared), and a truthful echo
that passes with the stored figure still the evidence's. Nothing moved through any refusal.

**Vacuity control:** the PRE-FIX body was installed as `clara_fn_owner`
(`position('opening_fact' …)` back to 0), the cell was seen failing for the right reason
("expected SQLSTATE CLR31 but the call SUCCEEDED"), and the subject was restored byte for byte
with `CLARA_MIGRATION_REDO=0286_opening_source_reread`, whose tail re-verified the whole shape.

### ADV-08 — note — a pending reservation reported as a successful refresh · HALF FIXED, HALF REFUTED

**Fixed at the runtime seam.** `refreshOpeningTargets` answers a typed 409
`{status:'refused', code:'CLR13', reason:'operation_in_flight'}` for a receipt with no
`targets_recorded`, and the counts it reports are the RECEIPT's own, never the payload's length:
a one-line payload whose receipt says 3 recorded / 5 retired now answers 3 and 5, where the
fallback answered 1 and 0 and hid both facts about the document. Two PURE cells drive it (the `pg`
client stubbed at the system boundary, nothing else).

**Refuted for the database half.** The suggested mirror of #936's own `pending` branch inside
`clara.refresh_opening_targets_from_reread` was deliberately not made. `{pending:true}` means the
key is reserved with no stored result, and this door takes `clara.opening_seed_registry FOR UPDATE`
as its FIRST act — before its reservation — so a second caller blocks on that lock and the
reservation and the receipt commit in one transaction. No cell can drive the state through the
door, so a branch there would be untestable defensive code inside a migration whose tail census
cannot reach behaviour, and the wave-3 addendum's own rule ("a door's behaviour is asserted only
after it was driven") would forbid claiming it works. The runtime seam CAN be driven, and is.

### ADV-09 — note — six `en.json` keys indented two spaces short · FIXED

Reindented to the eight spaces their neighbours sit at, in the same commit as the new keys.

### L06-STD-1 — minor (smell) — duplicated validation · FIXED

The fix is small and clearly better, so it was made. `validateAccrualParticulars(draft,
knownAccounts)` now owns the five fields both drafts carry (both account legs, the amount, the
term, the instruction) and takes `AccrualParticularsSource`, the `Pick` both drafts already
satisfy structurally. Each caller appends its own issues around it, and the issue ORDER is
unchanged, which matters because `accrualFieldElementId(issues[0])` decides where focus lands.

A new cell pins the property that made the duplication worth removing: over the same particulars
the correction validator's answer IS the create validator's answer with the create-only issues
removed. The 40 existing accrual cells passed unchanged before and after.

### L06-SPEC-06, L06-SPEC-07, L06-SPEC-08 — notes — acknowledged

- **SPEC-06** (the `readOpeningParseSubject` / `openingTargetHandler` extraction is a refactor of a
  pinned path): named as one here, with its regression evidence — the 17 pre-existing cells in
  `wave-b-opening-parse.test.mjs` plus the `openingOpKey` pin, and
  `clara.record_opening_targets_parsed` unmoved at `f3ffd4b0…` in 0286's prestate AND tail. No code
  change; the integrator should review it as a refactor rather than as incidental diff.
- **SPEC-07** (the correction form's memo heuristic): unchanged. The adversarial lens measured that
  it is NOT lossy — `clara._accrual_journal_basis` defaults the memo to `btrim(p_purpose)`, so a
  blank memo and a memo equal to the purpose land on the same stored basis memo. The follow-up (a
  top-level memo on `clara.get_accrual_adjustment`, so the pre-fill can stop guessing) stands.
- **SPEC-08** (from-scratch apply): still the integrator's, per the wave-3 addendum. All three
  migrations were re-applied this round (§4), which exercises their re-apply branches but is not a
  from-scratch chain.

---

## 3 · Migrations: what was edited, and how it was re-applied

All three of this lane's migrations are unmerged and were edited. `CLARA_MIGRATION_REDO` takes the
**highest applied version only**, and the blocker was in the LOWEST of the three, so the sequence
was:

1. `delete from clara.schema_migrations where version in ('0286_opening_source_reread',
   '0285_prepayment_term_liveness')` — one transaction, returning exactly those two rows. This is
   the one hand step; it exists only to make 0284 the highest applied version so the supported redo
   path can take it. Recorded here in full because it is a deviation from "use the redo path".
2. `CLARA_MIGRATION_REDO=0284_accrual_correction node scripts/migrate.mjs` — prestate clean, tail
   OK, redone.
3. `node scripts/migrate.mjs` — 0285 (prestate `REDO`) and 0286 applied by the ordinary path.
4. Later, for the ADV-07 vacuity control only:
   `CLARA_MIGRATION_REDO=0286_opening_source_reread` to restore the broken subject byte for byte.
5. Final drift check: `node scripts/migrate.mjs` → `0 new migration(s) applied · 270 total`, no
   checksum drift. The committed files and the applied catalog agree.

**Applied checksums**

| migration | checksum |
|---|---|
| `0284_accrual_correction` | `b10539330eea4910b21955f3e0438552814c30dbdc1c625d0c8d612294212d88` |
| `0285_prepayment_term_liveness` | `c4fe7e6410401957d146a036405917255d71d190d553e44461512bbe93236913` |
| `0286_opening_source_reread` | `953071638751757070ed30da2d6d08d0088c6200888ee95bde3784978087dedb` |

### The FIRST-APPLY branch of 0285's bimodal pin, proved by hand

The wave-3 addendum: "`CLARA_MIGRATION_REDO` only ever takes the 'my own body is already live'
branch. Prove the FIRST-APPLY branch yourself." Done, inside one transaction that was ROLLED BACK:
0223's own two `create function` statements were re-run as `create or replace` to restore the
pre-images; both were re-measured equal to the pinned shas
(`clara.get_prepayment_schedule(uuid)` → `40c5913fe3b0e05b489743f4b6e714313708c637609c9aa441b887e0f1932286`,
`clara.list_prepayment_schedules(uuid)` → `e10eee318bf81bc12e987d30e7a580e5d29aa66245d20fa75ddca3b40171c51c`);
0285's prestate block was then executed VERBATIM and reported
`#919 prestate: clean (FIRST)`. After the rollback the live body carries `term_moved` again.

### Every pinned signature, with its sha, measured live after this round

**0284 (12 pins; prestate and tail carry the same list; none moved)**

    clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)  87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f
    clara._human_ctx(integer)                                                        d1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46
    clara._reserve_op(uuid,text,text,bytea)                                          8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4
    clara._finish_op(uuid,text,text,jsonb)                                           c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e
    clara._hash(jsonb)                                                               421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547
    clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)                                000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1
    clara.role_rank(text)                                                            5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f
    clara._assert_accrual_particulars(jsonb)                                         71e7f7f078b840c217b7582b1b78728f8f79b5601d5d8f4f821feca9b15e624b
    clara._assert_accrual_term_window(jsonb,date,date)                               e13e895f126e7cf34bea5bab2dbcb74733384ef0a427f58b84d6b5b07b771a09
    clara._assert_accrual_world(uuid,uuid,jsonb)                                     32b3da54707f011987c8206106342317766021387d03df15d58ebf14c1d35750
    clara._accrual_journal_basis(jsonb,text,date)                                    d1da9cc4fd61d376ce140441a8849d501aafee77a1c81587116901d5fe3c6403
    clara._accrual_canonical(jsonb)                                                  8c9dc78817e6730b6283727f0271c229a5794643c2f90038622504621c2a237e

**0285 (2 pins, now BIMODAL — FIRST sha, or a body carrying `term_live` + `#919`)**

    clara.get_prepayment_schedule(uuid)       FIRST 40c5913fe3b0e05b489743f4b6e714313708c637609c9aa441b887e0f1932286
    clara.list_prepayment_schedules(uuid)     FIRST e10eee318bf81bc12e987d30e7a580e5d29aa66245d20fa75ddca3b40171c51c

**0286 (14 pins; the parse door first, which is the no-regression proof; none moved)**

    clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)               f3ffd4b07b33756f7f04f9a18d22d3092b1f84eca4d061d7609c2c235b0671c1
    clara._assert_opening_target_fact(uuid,uuid,jsonb,text,bigint,bigint)   b4c505b418f8bc676048b0da3cded0f9565a547487a7ce8a5a9ad5b16d3c0305
    clara._assert_opening_extraction_ref(uuid,uuid,jsonb)                   a8b48e14895295e1dcd22d9245d4b96f0f12538daecc22bf0b2cc4332e67fae0
    clara._opening_region_fact(uuid,uuid)                                   c61cc978650fbbf6fbe3b92af90f538daff0aa3e6a9ff91873ad427706853610
    clara._active_document_filing(uuid,text,uuid,boolean)                   8d75cb02cfeaa4b739b598c81f084342b3389a6625f5d0eee76659bfe9bab7d7
    clara._record_onboarding_contributor(uuid,uuid)                         cc9acdf5d07dc9fe528f727d3bae794c3acf6686717a6491e62e73a066676719
    clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)              6735ef453153450286fe7fd2c5a645c164c14b0fcc127c9f16954b16f63fbada
    clara._assert_opening_tie(uuid)                                         afa141b3bf2c5f7dd04a0a73dfe21221405fe18d3d94b72d197f5d8eb07cca30
    clara._opening_seed_deltas(uuid,boolean)                                be1d4c7da3fab86f24fc89884cf679aa4191363279e17b4a78f6cee4fb7edead
    clara.get_opening_dryrun(uuid)                                          328c0eda12c0d1aa42633a04f4df5801f89f2f3db8f36e564f377a2296dd8372
    clara._reserve_op / _finish_op / _hash / _audit                         exactly as in the 0284 list above (this file pins the same four)

**The four bodies this round MOVED (post-images, measured live at the new head)**

    clara.correct_accrual_adjustment(uuid,jsonb,text)                          8cce0629770abe6ea6594c9792b57d16fb8ffd1d2568abb9bd8a85dacdac7ebb
    clara.get_prepayment_schedule(uuid)                                        2d7d8c2a4dfa89cd7c12146ab90b35fd57303668c6b2b73e56b4e139c4f8e686
    clara.list_prepayment_schedules(uuid)                                      faf6e995045457bc14f122cd02abfdfd160147f36bd3b164a8e38497e493511e
    clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text)       da16af3921a41292d869e3ea9f87a8de7fc12facf4df09434fbd629eb408c1d3

`apps/web/tests/firm-scope-db-pins.corpus.ts` was checked: it pins no migration of this lane, so
nothing there needed re-measuring. Its census runs green (22/22).

---

## 4 · Gates, with counts

| gate | result |
|---|---|
| `pnpm typecheck` (worktree root) | **Done** — apps/web and packages/runtime |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| whole web unit suite (`node scripts/run-tests.mjs` from `apps/web`) | **4882 tests · 4880 pass · 0 fail · 2 skipped** |
| db: `accrual-correction` + `prepayment-term-liveness` + `opening-source-reread` + `opening-ledger-source` + `accrual-adjustments` + `accounting-plans` + `prepayment-schedule`, full 87-flag gate chain | **90 tests · 90 pass · 0 fail · 0 skipped** |
| db: `operation-census` + `rig-isolation` (no reset flags) | **33 tests · 32 pass · 0 fail · 1 skipped** |
| `node scripts/check-frozen-workflows.mjs` | **OK** — 312 frozen files, no manifest diff |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — reader ⊇ emittable |
| `packages/runtime`: `tests/wave-b-opening-parse.test.mjs` | **22 tests · 22 pass · 0 skipped** |
| e2e `opening-ledger-source-walk` (triple 3550/3551/3552) | **8 passed** |
| e2e `accrual-walk` | **18 passed** |
| e2e `prepayments-walk` | **6 passed** |
| e2e `plans-walk` | **9 passed** |

Per-file counts for the new and touched cells: `accrual-correction` 10/10,
`prepayment-term-liveness` 3/3, `opening-source-reread` 6/6, `opening-ledger-source` 12/12
(was 0/12 with 12 skipped), `plan-revise-form` 3/3, `prepayments-render-states` 16/16,
`opening-parse-action` 16/16, `opening-source-header` 4/4, `registers/opening` 12/12,
`work/accrual-draft` 29/29, `wave-b-opening-parse` 22/22.

**Vacuity controls.** Four web subjects were reverted to their pre-fix state (`git checkout HEAD --`
on `prepayment-detail.tsx`, `prepayments-list.tsx`, `plan-revise-form.tsx`,
`opening-parse-action.tsx`) and the three test files re-run: **35 tests, 5 fail** — exactly the five
new cells, each for the right reason. The subjects were restored and the same run is **35/35**. The
ADV-07 database cell has its own control (§2). The three new DB cells for ADV-01 and ADV-06, and
the three #919 cells, were written red-first against the pre-fix migrations and are quoted with
their actual failure text above.

**Known Windows-only reds:** none were hit this round. The two skips in the web suite and the one
in `rig-isolation` are the pre-existing ones RIG.md records, not anything this round introduced.

---

## 5 · What was deliberately left, and follow-ups worth filing

1. **The generic Revise LINK on `plan-detail.tsx`** still renders for an accrual-backed plan; the
   ACT behind it is walled at the revise route. Suppressing the link needs the same accruals read
   on the plan detail page, which would 404 in each of that file's existing cells and add a fourth
   read to every plan detail. **Follow-up:** either carry the accruals read to `plan-detail.tsx`
   (with its own cells), or — better — give `clara.get_accounting_plan` an `accrual_id` so no
   surface has to ask a second door what the plan already knows. That is a plan-lane body recut,
   which this ticket may not make (lane 05 pins it).
2. **No browser walk covers the revise route.** `plans-walk.spec.ts` never visits
   `/plans/:planId/revise`, so the new wall has unit coverage only. Adding a leg needs the plans
   e2e mock to answer `list_accrual_adjustments`. **Follow-up.**
3. **#936's memo pre-fill heuristic** (SPEC-07) stands; the follow-up is a top-level memo on
   `clara.get_accrual_adjustment`.
4. **`parseOpeningTargets` keeps its own `?? lines.length` fallback.** Only the refresh arm was
   changed; the parse arm is #656's and its op key is pinned. **Follow-up** worth one line in the
   opening lane's next ticket.
5. **From-scratch chain 0001 → 0286** remains the integrator's, per the wave-3 addendum.

---

## 6 · Two things the integrator should know about the rig

1. **A sibling process writes into this session's scratchpad.** Mid-round, a helper script named
   `q.mjs` in
   `…\Temp\claude\C--Users-zhant-Desktop-clara-rebuild\<session>\scratchpad\` was REPLACED by
   another lane's copy pointed at `127.0.0.1:55745/clara_l05`, and a `types.py` appeared there that
   shadows the Python standard library. No cross-lane write happened here: the ledger delete in §3
   returned exactly this lane's two versions, and the redo of 0284 on clara_l06 could only have
   succeeded if that delete had landed on clara_l06 (redo refuses a version that is not the highest
   applied). Everything afterwards used `lane06-query.mjs`, which hardcodes clara_l06:55746 and
   refuses to answer if `current_database()` and `inet_server_port()` disagree. **Lane scripts in
   that directory should carry the lane number in their name, and any script that writes should
   verify what it is connected to first.**
2. **`clara_l06` after this round** is at 270 files / `0286_opening_source_reread`, seeded, with the
   three lane migrations carrying the checksums listed in §3.

---

**New head: `209bc3cfb`** (`test(db): #986 the #656 opening battery stops skipping, and its twelve
cells pass`). Working tree clean; nothing pushed, no PR, no GitHub write.
