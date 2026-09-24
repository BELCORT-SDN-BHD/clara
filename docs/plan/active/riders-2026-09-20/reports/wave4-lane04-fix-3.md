# Wave 4 · lane 04 · fix round 3 — the single fix worker's report

**Branch** `riders/w4-lane04` · **worktree** `C:\Users\zhant\Desktop\clara-wt\651` · **base**
`cd2925391` · **database** `127.0.0.1:55744/clara_l04`.

**Head before this round** `604416912` · **head after** `c8a7911aa`. Tree clean.

Ten commits, one per green slice:

| commit | subject |
|---|---|
| `6bd7e1016` | `feat(db): #939 AC4 the correction path exists -- clara.replace_prepayment_schedule` |
| `7a68aeaeb` | `feat(db): #939 AC4 the boundary is the admitted period, and the gap before it is not lost` |
| `00dec6e62` | `test(db): #939 AC4 every way a correction is refused, and the door's own posture` |
| `75464ea94` | `feat(db): #941 AC3 the deferred-revenue mirror -- clara.replace_revenue_recognition_schedule` |
| `cdcdfa2e1` | `test(db): #939 AC4 / #941 AC3 the 0317 frontier, its gate module and its cohort` |
| `36f1dc6c5` | `test(db): #939 AC4 the OBO lane's grant census learns the correction door` |
| `537f20344` | `fix(web): #939 AC4 / #941 AC3 both registers stop denying a correction path that now exists` |
| `b2739881f` | `docs: #939 AC4 / #941 AC3 the correction path is documented as existing, in 0317's own section` |
| `e3a255619` | `docs(db): #939 AC4 / #941 AC3 three test comments stop describing the retired uniqueness rule` |
| `c8a7911aa` | `test(web): #939 AC4 a ticket reference in an assertion message is spelled out` |

---

## 1 · The decision: the door is IN SCOPE, and the tickets settle the accounting question too

The recheck was right twice and the two earlier fix rounds were wrong. The door is built.

**The scope sentence.** #939's acceptance criterion 4, verbatim:

> Superseding a stated term never alters a running schedule; **a new schedule from the next period
> is the only correction path**; a cell proves posted occurrences and their receipts are unchanged.

and #941's acceptance criterion 3, verbatim:

> …the same 120-month cap; superseding a term never alters a running schedule and **a new schedule
> from the next period is the only correction**.

"X is the only correction path" names an ACT and says no other act may perform it. It is not a
statement that no act exists. Both rounds read the clause as a prohibition alone, discharged it, and
reported the ticket satisfied while the capability it names was absent. #941's acceptance row 7 asks
for a cell covering "a term correction" among the cells that prove the feature, which only makes
sense if the correction is something the estate performs.

**The accounting question the two rounds held for an owner ruling is already ruled — by the
tickets.** #939's owner-accepted decision 3 (2026-09-18), verbatim:

> A mis-stated term is corrected by superseding it and opening a new schedule from the next period;
> **already-posted periods are never touched**.

and #941's "What to build" paragraph: "the schedule is append-only and **a correction is a new
schedule from the next period**."

That is a prospective treatment: a change in accounting estimate under MPERS section 10 / MFRS 108,
applied forward, with no restatement. The alternative the fix-2 report put to the owner — treat the
first amortisation as an error, reverse it, re-derive — is a prior-period correction, and it
requires touching already-posted periods, which the same sentence forbids. There was no open
professional judgement here. The judgement is the TERM, and a named person had already made it
through `clara.record_prepayment_stated_term` or `clara.record_document_service_period`; the door
re-derives arithmetic from it, which is what the frozen evaluator exists for.

**The migration-number objection is answered by this round's own prompt.** Fix 2's third reason was
that the lane's reserved numbers were spent. This round is given `0317`, the wave's overflow block.

**I checked for a later ruling that could change this.** `gh issue view 939` has zero comments, so
its Agent Brief in the body is the newest. `gh issue view 941 --comments` has two: the shared
`1180 Accrued Income` chart-row coordination note, and the 2026-09-23 pre-step ruling on the
standard-chart template version. Neither touches AC3, AC4 or decision 3.

---

## 2 · Seams (written down before the first test, WORK-ORDER rule 4)

1. `clara.replace_prepayment_schedule(p_client uuid, p_schedule uuid, p_reason text,
   p_authority_ref jsonb, p_op_key text) -> jsonb` — the human door #939 AC4 names.
2. `clara.replace_revenue_recognition_schedule(...)` — the same five arguments, #941 AC3's mirror.
3. The catalog posture of both (owner / definer / `search_path` / ACL / absence of a machine lane),
   which is this repo's documented structural standard for a governed act.
4. The rendered behaviour of the two registers' detail surfaces, which had been made to assert that
   no correction path existed.

No seam was taken that the briefs do not give. **No web CONTROL was built**: #939 AC5 and #941 AC6
each enumerate the surfaces their ticket buys (list, filter, marker, attention arms, detail, form,
empty state, copy, walk) and neither names a correction control, so building one would widen the
ticket under WORK-ORDER rule 5. The successor contract for it is in §7.

---

## 3 · The slices

### Slice 1 · `6bd7e1016` — the prepayment door and its clean case

Migration **0317_schedule_term_correction.sql** (new; the wave's overflow number, per the prompt).
Cell `p939.replace.clean`: nothing posted, the term corrected from three months to two, the
replacement carries the whole 90000 sen over the corrected term (45000 + 45000, a worked example),
the predecessor's plan ended through its own door, the predecessor stamped but byte-identical, one
LIVE schedule left, and the create door still refusing a third configuration while now naming the
schedule that STANDS rather than an arbitrary member of the chain.

**RED first:** `function clara.replace_prepayment_schedule(...) does not exist` (SQLSTATE 42883).

### Slice 2 · `7a68aeaeb` — the prospective boundary, and the gap before it

The first cut of `clara._schedule_open_remainder` treated every line at or before the latest
admitted occurrence as taken up. Driven on the rig, that is wrong in the ordinary case: the plan
scanner admits the latest due event per run, so a four-month schedule whose scan ran once has ONE
admitted month and a GAP before it, and counting the gap as taken up leaves that month's share in
the prepaid account with the plan ended and nothing to clear it. The helper now answers two
questions separately — WHERE the replacement may start (the day after the latest ADMITTED
occurrence, never a committed receipt, because an admitted Work is a month the estate has taken
responsibility for and re-opening it could post it twice) and WHAT it re-spreads (the total less the
periods actually admitted, matched to their own due date).

Cell `p939.replace.posted` drives one month to a COMMITTED receipt through the real wake/claim/post/
settle chain, corrects the term, and reads the replacement: it starts the month after the one taken
up, re-spreads 67500 over three months at 22500 each, and `admitted_cents + total_cents === 90000`
so nothing is lost and nothing is charged twice. The admitted occurrence and its committed receipt
are byte-identical afterwards — AC4's own sentence, driven through the CORRECTION rather than only
through a restatement that did nothing.

**RED first:** `admitted_periods` was 2 against the first rule, expected 1. (A second red after that
was my own month arithmetic, corrected in the same slice: `monthStartBack(1)` for a boundary that is
`monthStartBack(0)`.)

### Slice 3 · `00dec6e62` — the refusals and the posture

- `p939.replace.refuses` — a term nobody corrected (axis `term_live`, remedy naming the stating
  door), a re-statement that moved neither date (axis `term_unmoved`, which is ADV-02's own rule
  asked by the door exactly as `clara.get_prepayment_schedule` asks it), a blank reason, a viewer, a
  schedule that names nothing, and a schedule already replaced (naming its successor). None writes a
  row.
- `p939.replace.boundary` — the two ends of the prospective rule: a corrected term that ends inside
  the month the plan already took up (`prepayment_correction_no_open_period`), and a one-month
  schedule whose month has been taken up (`prepayment_correction_nothing_remaining`, carrying
  `admitted_periods: 1` and `admitted_cents: 90000`).
- `p939.replace.posture` — `clara_fn_owner`, SECURITY DEFINER, `search_path=clara, pg_temp`,
  `clara_authenticated` and no machine principal, exactly two functions matching the correction
  shape catalog-wide (so a later lane that mints a `_for` twin or a wake wrapper reds here), and a
  lost response replayed under the same op key rather than answered "already replaced".

**VACUITY CONTROL.** The door existed before these cells, so all three were green on first run and a
control was owed. The three guards they exercise (`moved`, no-open-period, nothing-remaining) were
each replaced with `if false` and the migration redone under `CLARA_MIGRATION_REDO`; both behaviour
cells went red (`# fail 2`). The file was then restored byte for byte — `sha256`
`613c6486b65e9f80c5ef67a6caca3ed8e5476440f7276822968c96a4b3f4e904` before and after — and redone,
green again.

### Slice 4 · `75464ea94` — the deferred-revenue mirror

`clara.replace_revenue_recognition_schedule`, its own body with 0308's own reason for two bodies
(the tokens are `deferred_revenue_*`, because a bookkeeper recognising a customer's advance reads
the refusal on a Deferred revenue surface). Every RULE has one spelling shared with the prepayment
lane; the one argument that differs is the released side, `debit`, because a deferred-revenue
LIABILITY is released by debit — asserted on every period of the replacement.

`p941.replace.posted` and `p941.replace.refuses` mirror slices 2 and 3. The lane's own grant census
(`p941.obo.configures`) gains the fifth human name.

**VACUITY CONTROL.** The released side was flipped to `credit` and the `moved` guard replaced with
`if false`; the migration was redone and both cells went red. Restored byte for byte (same sha) and
redone, green.

### Slice 5 · `cdcdfa2e1` — the frontier, the gate module, the cohort

The correction cells live in two batteries gated on 0305's and 0308's stems, which are true long
before 0317 exists, so each new cell asks the 0317 frontier itself in
`prepayment-wake-reroute.test.mjs`'s idiom: a FOCUSED run against a pre-0317 chain fails loudly, a
package-wide sweep that preloads the new gate module skips loudly.
`tests/schedule-term-correction-preintegration-gate.mjs` (env
`CLARA_ALLOW_MISSING_SCHEDULE_TERM_CORRECTION`) is wired into `packages/db/package.json`'s chain in
MIGRATION ORDER, after 0315's — the chain is now 112 entries. `rig-meta.mjs` gains
`SCHEDULE_TERM_CORRECTION_0317_COHORT` (two human doors, two ungranted predicates), its bimodal
check, and the two door names on the `clara_authenticated` roster.

### Slice 6 · `36f1dc6c5` — the OBO lane's own census

`p915.grants.census` enumerates every `clara_authenticated` name in the whole
prepayment/amortisation lane. The new door joins it, asked at the 0317 frontier rather than assumed.
Everything #915 cares about is untouched.

### Slice 7 · `537f20344` — the registers stop denying a path that now exists

Fix round 2 rewrote five sentences to say the estate had no way to replace a schedule whose term was
mis-stated. 0317 makes that false. Three more say the same thing and the round missed them (the two
`stateTermBody` notes and, in a different form, the corrected-term banner), so **eight** value
strings moved, at their existing sorted positions in the shared `apps/web/messages/en.json`, no key
added and no key moved. Each now separates two facts the old copy ran together:

| fact | true? | where it is said |
|---|---|---|
| THIS schedule's allocation is a derived record and is never edited | yes | both `termSupersededBody` |
| a plain reconfiguration is refused, running or ended | yes | both `endedNoControls`, `explainAuthority` |
| the balance not yet charged is taken over by a replacement derived from the corrected term | yes, since 0317 | all eight |

**RED first:** four cells were rewritten to assert the new truth and run against the old copy —
`941.detail: L04-SPEC-04`, `prepayments.detail — ticket 919`, `prepayments.detail — L04-SPEC-04`
(all three of its arms) and `prepayments.detail.correction_path` — `# fail 4`. The copy then moved
and all four went green. The stale comment beside the banner in `prepayment-detail.tsx` says the
same thing.

### Slices 8–10 · `b2739881f`, `e3a255619`, `c8a7911aa` — docs and one lint reword

`CONTEXT.md` gains **Replacement schedule** (house term / `_Avoid_` shape: the act, its prospective
treatment, and the four traps — reading it as a revision, reading "the plan ended" as grounds,
expecting it to re-open an admitted month, expecting it where nothing is left) and corrects the two
clauses fix 2 wrote against the old estate. `packages/db/README.md` replaces the "owner-blocked"
subsection with a pointer and adds 0317's own section with the full prestate table.
`apps/web/README.md` separates the two facts and records that no correction control exists and why.
Three db test comments stop describing the retired constraint. One assertion message spelled a
ticket number with a hash, which `CI=true pnpm lint` refuses because its selector cannot tell a
ticket reference from a colour literal (ticket 994's own note recommends rewording); reworded, the
rule untouched.

---

## 4 · The door's contract

Both doors, identical shape:

```
clara.replace_prepayment_schedule(
  p_client uuid, p_schedule uuid, p_reason text, p_authority_ref jsonb, p_op_key text) -> jsonb
clara.replace_revenue_recognition_schedule(<the same five>) -> jsonb
```

SECURITY DEFINER, `search_path=clara, pg_temp`, owned by `clara_fn_owner`, EXECUTE revoked from
PUBLIC and granted to `clara_authenticated` ONLY. Bookkeeper floor in the body via
`clara._human_ctx(clara.role_rank('bookkeeper'))` — the same floor that states the term and
configures the first schedule. Op-key idempotency through `clara._reserve_op` / `clara._finish_op`,
the reservation taken before every other question so a lost response replays. One audit row per
call. No OBO twin, no wake wrapper, no agent core; the tail asserts the absence by `pg_proc` count.

**What it does, in order:** resolve actor and firm → check the client → reserve → load the schedule
(absent and foreign answer alike) → refuse if already superseded → take plan lock rung 1 → ask
whether the term MOVED → re-ask the recognition's fitness → compute the open remainder → derive the
new term → re-ask the fiscal year → run `clara.prepayment_schedule_v2` with the remaining amount and
the open term → re-ask the roster and both eligibility walls → assert the journal basis → end the
predecessor's plan with the correction's stated reason → create a NEW plan under a FRESH instruction
→ stamp the predecessor → insert the replacement naming what it replaced → audit → finish.

**Refusals**

| token | code | when |
|---|---|---|
| `prepayment_schedule_not_found` / `revenue_recognition_schedule_not_found` | CLR11 | absent or another client's |
| `prepayment_schedule_superseded` / `deferred_revenue_schedule_superseded` | CLR13 | already replaced; names the successor |
| `prepayment_term_not_corrected` / `deferred_revenue_term_not_corrected` | CLR10 | axis `term_live` (nothing corrected; names the stating door as remedy) or `term_unmoved` (a re-statement that moved neither date) |
| `prepayment_correction_no_open_period` / `deferred_revenue_…` | CLR10 | the corrected term ends before the first month not taken up |
| `prepayment_correction_nothing_remaining` / `deferred_revenue_…` | CLR10 | every month has been taken up; carries `admitted_periods` and `admitted_cents` |
| `prepayment_source_unfit` / `deferred_revenue_source_unfit` | CLR10 | the recognition is not posted, has been reversed, or its account has left the roster or the eligibility wall |
| `prepayment_target_ineligible` / `revenue_target_ineligible` | CLR10 | the carried-forward charge account is no longer an expense/income account, or no longer eligible |
| `prepayment_term_underivable` / `deferred_revenue_term_underivable` | CLR10 | the evaluator's own refusals, and the fiscal-year arm |
| `invalid_op_key`, `invalid_request`, `client_not_found`, `client_inactive`, `operation_in_flight` | CLR10/11/13 | the house preamble |

**Answer** (both): `schedule_id`, `replaces_schedule_id`, `replaced_plan_id`, `plan_id`,
`revision_id`, `revision`, `status`, `kind`, `client_id`, `source_entry_id`, `document_id`,
`service_period_id`, `term_source`, `stated_term_id`, `basis_kind`, `term_start`, `term_end`, the
lane's two account codes and the carried-forward basis, `total_cents`, `period_count`,
**`admitted_periods`**, **`admitted_cents`**, **`first_open_period_start`**, `remainder_placement`,
`schedule_version`, `period_lines`, the derived cadence, `effective_from`/`effective_to`,
`next_occurrences`, `overlap_warning`, `configuration_only: true`. The revenue door also returns
`recognition_pattern`. The three bold fields are the prospective half said out loud: a surface that
could not see them could not tell a firm why the replacement charges less than the payment.

**Judgements carried forward, never re-picked.** The charge account and the grounds a person wrote
for it move to the replacement unchanged — a term correction corrects the TERM, and re-asking would
let it reclassify a client's expense silently while defaulting would be a judgement with no basis.
Their ELIGIBILITY is re-asked, because an account deactivated since then cannot take the charge.

---

## 5 · Migration 0317, its pins, and the redo record

`packages/db/migrations/0317_schedule_term_correction.sql` — new file at the number this round's
prompt reserved (the wave's overflow block), not the next free number. 2691 lines. On-disk
`sha256 = 613c6486b65e9f80c5ef67a6caca3ed8e5476440f7276822968c96a4b3f4e904`, which is also the
checksum recorded in `clara.schema_migrations` on `clara_l04`.

**What it changes.** Both schedule relations gain `superseded_by` (deferred FK), `superseded_at`,
`replaces_schedule_id`, a paired CHECK and a no-self-reference CHECK; the unconditional
`unique (source_entry_id)` constraints are replaced by partial unique indexes over
`superseded_at is null`; both append-only triggers are recut to admit exactly one update — the stamp
— by comparing the whole row with the stamp removed, so a column added later is covered by
construction; two ungranted predicates and two human doors are created; four bodies are recut.

**STAMP FIRST, INSERT SECOND** is load-bearing rather than stylistic: the partial index admits one
live schedule per recognition, so the predecessor must leave that index before the successor enters
it. That is what the deferred FK is for — `clara.record_prepayment_stated_term`'s own idiom.

**Prestate pins, MEASURED on `clara_l04` after 0315 and before the first apply.** RECUT (bimodal:
their measured pre-image, or a body already carrying `0317`):

| signature | sha256(prosrc) |
|---|---|
| `clara._tf_prepayment_schedules_append_only()` | `21d1fe05f5c9cc837a6f80bd8ec36954c46a395054b2c8278b938140202aa18c` |
| `clara._tf_revenue_recognition_schedules_append_only()` | `aaaa4202ad8c5b7adb40accf897290753763d26257c0903dcf5d743804437d5e` |
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `78bbfce7ae46b3445a93689700958f727a1b795cdf483c7c522beef4f7b46ee2` |
| `clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)` | `03417b7903a6bf04ea49199bb6af27375537d49707874025b9ec62507705bf24` |
| `clara.read_prepayment_source_for(uuid,uuid,uuid)` | `6475458ed34d9b9ef357f8fb6e4eb9766042e30e1252c30d607fabd1a120495b` |
| `clara.read_revenue_recognition_source_for(uuid,uuid,uuid)` | `00501a388ada95f1a7db9fccf9ad1d94f04c0067083fd3c457ee9a06ecbe06ab` |

KEPT (nested neighbours; the file refuses if any moved), and re-measured again in the tail:

| signature | sha256(prosrc) |
|---|---|
| `clara.prepayment_schedule_v2(bigint,text,text,date,date)` | `9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194` |
| `clara.prepayment_schedule_v1(uuid,uuid)` (tail only) | `ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2` |
| `clara._prepayment_account_enrolled(uuid,text,text)` | `0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db` |
| `clara._adj_line_eligibility_breach(uuid,jsonb)` | `727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021` |
| `clara._assert_journal_basis(jsonb)` | `2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684` |
| `clara.end_accounting_plan(uuid,text,text)` | `b3d6f214b2fa8e875ad3bce966bf51557f235b3b0d046a06cdb0e208b58f870c` |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)` | `c8e990986a06b132e3dad40e47225968562336b48ad6c01a4a09104784c09188` |

**The four recut bodies are byte-exact copies with ONE predicate added at each site.** They were not
retyped: each was taken from `pg_proc.prosrc` on the live catalog and had the literal
`and s.firm_id = p_firm;` replaced by `and s.firm_id = p_firm and s.superseded_at is null;` with the
occurrence count asserted (2, 2, 1, 1 — all six sites verified by eye to be the schedule lookup, and
no other). Nothing else in any of the four moved. The reason each one needed it: they read
`where source_entry_id = … and firm_id = …` and take ONE row, which was one row by construction
before this file; afterwards a corrected recognition carries a chain, and an unqualified read hands
a surface an arbitrary member of it — the schedule a refusal names, and the schedule claraWork is
told about.

**No pin this round moved that another lane also pins.** The six recut signatures are all this
lane's own work (0305/0307/0308/0315); 0317 re-pins them at the values 0315 left.

**Redo record (#957).** Applied first with `pnpm migrate` (notice: `0317 prestate OK — 7 FIRST,
0 REDO`), then re-applied **six** times with `CLARA_MIGRATION_REDO=0317_schedule_term_correction`:
once for the remainder-rule fix (slice 2), once for the prestate shape check, once for the tail's
chain-integrity check, and twice for each vacuity control (break, then restore). Each redo reported
all seven pins in REDO mode, which is what the wave-3 rule warns about.

**So the FIRST-APPLY branch was proved separately, against the CURRENT file** (wave-3 rule): inside
one transaction that was rolled back, the four recut bodies were restored from the pre-apply
`prosrc` dump, the two triggers from 0223's/0308's own text, both partial indexes dropped and the
unconditional constraints rebuilt, and the two new doors dropped. Every restored body's
`sha256(prosrc)` was checked against the pinned value BEFORE the prestate ran, so a transcription
slip would have failed loudly rather than making the proof vacuous. The §0 block was then cut
verbatim out of the migration file and executed. Result:

```
0317 prestate OK — 7 FIRST, 0 REDO — chain=FIRST
  clara._tf_prepayment_schedules_append_only()=FIRST
  clara._tf_revenue_recognition_schedules_append_only()=FIRST
  clara._prepayment_schedule_core(…)=FIRST
  clara._revenue_recognition_core(…)=FIRST
  clara.read_prepayment_source_for(uuid,uuid,uuid)=FIRST
  clara.read_revenue_recognition_source_for(uuid,uuid,uuid)=FIRST
```

The transaction was rolled back; the rig was re-verified afterwards (2 doors, 2 live indexes, 51
chain rows, and both batteries 31/31). **A data-dependent branch was entered for real** in the same
spirit: the unwind could not rebuild the unconditional index until the chains this round's own cells
created were removed, which is direct evidence that the new rule admits an estate the old one
refused.

**No web census keyed on a migration's content sha needed re-taking.**
`apps/web/tests/firm-scope-db-pins.corpus.ts` keys only on migrations with a REVIEWED dynamic-SQL
barrier; 0317 constructs no SQL string and executes none, so it takes no entry, and
`firm-scope-db-pins.test.ts` is green inside the whole-suite pass below.

---

## 6 · Gates, with counts

Run on `clara_l04` (127.0.0.1:55744) from the lane worktree, Node 22, at head `c8a7911aa`.

| gate | result |
|---|---|
| `prepayment-stated-term` + `revenue-recognition` (full 112-entry gate chain) | **31 tests, 31 pass, 0 fail, 0 skip** |
| the lane's wider db set, same chain: `prepayment-stated-term`, `revenue-recognition`, `prepayment-schedule`, `prepayment-schedule-obo`, `prepayment-account-roster`, `prepayment-wake-reroute`, `plan-overlap-template-arm-retired`, `f-a4-pr2a-books`, `f-a4-pr2a-wrapper`, `f-a4-pr2a-census`, `f-a4-pr2a-schedule`, `operation-census`, `rig-isolation` | **142 tests, 141 pass, 0 fail, 1 skip** |
| `operation-census` + `rig-isolation` alone (never with the reset flags) | **33 tests, 32 pass, 0 fail, 1 skip** (the known destructive-reset skip) |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **5035 tests, 5033 pass, 0 fail, 2 skipped** — the same baseline the round-2 recheck measured |
| `pnpm typecheck` (root) | clean, exit 0 — `apps/web` and `packages/runtime` both Done |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (root) | **exit 0** (exit code captured directly) |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files verified, 0 diff |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `pnpm --filter @clara/web e2e prepayments-walk` on the lane triple (3530/3531/3532) | **8 passed** (26.7s) |
| `pnpm --filter @clara/web e2e deferred-revenue-walk` on the lane triple | **3 passed** (11.9s) |
| `git status --short` | empty — tree clean |

`packages/runtime` was not touched this round (`git diff cd2925391..HEAD -- packages/runtime` is the
single 15-line test-file addition round 1 made); the two runtime checks were run anyway and both
pass.

---

## 7 · Successor contracts

Two, both for work outside this lane. Nothing frozen was edited.

### 7.1 · The web correction control (the surface neither ticket bought)

The doors are reachable from the database seam and from no button. A surface would need, per lane:

- **API seam** in `apps/web/lib/prepayments/api.ts` (and `lib/deferred-revenue/api.ts`), the
  `callDoor` shape the create writes already use:
  `callDoor<PrepaymentReplaced>("replace_prepayment_schedule", { p_client, p_schedule, p_reason,
  p_authority_ref, p_op_key })`, with a fresh op key per decision and a hydrate-never-trust re-read
  after success AND failure.
- **Where.** The corrected-term banner on the detail page (`term_moved === true`) is the only place
  a person meets the fact, so the control belongs there, not on the list.
- **What it needs from the person.** A reason (the door refuses a blank one) and an instruction — the
  configuration form's existing `accounting_work` picker over again, which is why this is a surface
  decision rather than a wording one.
- **What to render from the answer.** `admitted_periods`, `admitted_cents` and
  `first_open_period_start`, so a firm can see why the replacement charges less than the payment.
- **Refusal mapping.** `prepayment_term_not_corrected` axis `term_live` → send to the term door;
  axis `term_unmoved` → "the corrected term states the same two dates"; `…_no_open_period` and
  `…_nothing_remaining` → state the boundary with the admitted count;
  `prepayment_schedule_superseded` → link to `detail.superseded_by`.
- **One read gap.** `clara.get_prepayment_schedule` and `clara.list_prepayment_schedules` do NOT yet
  project `superseded_by` / `replaces_schedule_id`, so a surface cannot today tell a live schedule
  from a superseded one except by its plan status. Projecting the two columns is a read recut with
  its own prestate pins, deliberately not taken here.

### 7.2 · The chat / Work lane (`chatTurn_v22` / `claraWork_v6`)

Nothing frozen needs to change for this round, and nothing was changed. If the shared end-of-wave
cut wants the correction on the conversation lane, it needs an **on-behalf twin** in #915's shape
(`clara.replace_prepayment_schedule_for(p_client, p_author, p_schedule, p_reason, p_authority_ref,
p_op_key)`, `clara_runtime` only, nesting the same body through a lane argument) — which does not
exist today and is deliberately absent, because re-deriving a client's books is a judgement with a
named person behind it. The model must never supply the corrected TERM; the fixed two-date question
and `clara.record_prepayment_stated_term` remain the only way a term reaches the estate, exactly as
#939 decision 6 rules.

---

## 8 · Docs updated, in the same commits

`CONTEXT.md` (new **Replacement schedule** entry; two corrected clauses in **Corrected term** and
**Revenue recognition schedule**), `packages/db/README.md` (the retired "owner-blocked" subsection
replaced by a pointer, plus 0317's own full section), `apps/web/README.md` (the #919 section's
second-schedule paragraph rewritten, and the absent control recorded with its reason), and the stale
banner comment in `apps/web/components/prepayments/prepayment-detail.tsx`.

---

## 9 · Anything unverified

- **The frontier gate's skip branch is verified by construction, not by execution.** Proving it
  needs a database at a pre-0317 frontier, which this lane does not have. The probe, the env
  variable and the fail-loudly branch are byte-for-byte #1036's idiom
  (`prepayment-wake-reroute.test.mjs`), which the integrator's `db-slice-frontiers` matrix
  exercises. The fail-loudly branch is the one that protects a focused run and is the default.
- **The e2e walks ran on this host (Windows).** The integrator's Linux re-run is the check that
  matters for the runner. No new runtime test file was added, so there is nothing for the WSL
  `runner` re-run to cover this round.
- **The from-scratch chain was not run here** (the rig forbids a second from-scratch chain on a
  cluster that already ran one, and the integrator runs it on a disposable cluster). What was run is
  the first apply, six redos, and the transactional FIRST-branch proof in §5.
- **`clara.prepayment_schedule_v1` is not used by the correction path at all**, on either carrier,
  and that is deliberate rather than an oversight: v1 derives the amount from the entry's own
  debited asset leg, and the amount a correction re-spreads is the REMAINING balance, which no entry
  carries. Every replacement therefore records `schedule_version: 'v2'` and the v2 evaluator version
  row, including on the document-carrier lane where the first schedule rode v1. A reviewer comparing
  a chain will see the version change at the correction; that is the honest record of what each
  schedule was derived from.
- **A month whose admitted Work later FAILED is not re-spread by the correction.** It stays with the
  plan's own catch-up window, which `clara.list_prepayment_attention`'s arm A offers by name. Ending
  the predecessor's plan closes that window for it, so a firm with both a failed month and a
  corrected term must recover the month before correcting. That is stated in 0317's header and in
  the README, and it is NOT covered by a cell: building one needs a Work driven to `failed` through
  the real belt, which is the plan lane's battery rather than this one's. Worth a follow-up.
- **Everything else in `wave4-lane04-recheck-2.json` was already accepted as fixed** by the
  independent recheck and was not re-driven here, except where the gates above re-ran the files that
  carry it (the wider db set in §6 covers all ten of round 1's findings).
