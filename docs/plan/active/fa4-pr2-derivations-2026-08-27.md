# F-A4 PR-2a — annexes D-H, the derivations

*The design of record is `docs/plan/active/fa4-pr2-design-2026-08-27.md` (§§0-5) and
`docs/plan/active/fa4-pr2-design-part2-2026-08-27.md` (§§6-14). **Annex A** (the battery) is
`docs/plan/active/fa4-pr2-battery-2026-08-27.md`; **annexes B-C** (measurements, debt-batch
mechanics, the OCR follow-up) are `docs/plan/active/fa4-pr2-annexes-2026-08-27.md`. This file holds
**D-H** and they are cited by letter from all of them. Split at the 2026-08-27 N-fold round against
the repo's 500-line gate; nothing moved in substance.*

---

## Annex D · MED-8 — why the narrower guard (design §8)

**The reading, at the bytes.** `_agent_close_proposal_core` collects `v_keys` as the distinct
`check_key`s the agent put in `p_drafted` (0138:2251-2252), then builds `v_bound` as
`{check_key → recorded_digest}` over exactly those keys (0138:2258-2277). B11 fires only when a
live proposal exists **and** `v_live_bound is not distinct from v_bound` — full jsonb equality
(0138:2292-2297). A live proposal binding `{A:d1, B:d2}` and an incoming one binding `{A:d1}` are
therefore *not* equal, B11 stays silent, and the act at 0138:2308-2312 stamps the live proposal
`superseded` with a fixed literal reason.

**Nothing moved.** The measurement is identical on the one shared key; the request simply
shrank. The migration's own comment at 0138:2266-2271 shows the author reasoning carefully about
the *opposite* direction (building the vector only from fresh keys would make a stale two-key
request collapse onto a one-key vector, *"a false sentence on a durable record"*) — this is the
same hazard from the other side, and it reaches the record rather than the rung.

**Why B11b rather than canonical coverage.** Requiring the proposal to bind every outstanding
`check_key` would make the key set derived rather than chosen, which is structurally cleaner and
would close the churn as a side effect. It would also **refuse an honest partial offer.** The
carrier's content is *drafted attestation texts per outstanding item* (0138:463-464); an agent
that has defensible language for three of five items and offers three is doing the right thing,
and a professional adopting three of five is an ordinary act. B11b closes the churn without taking
that latitude away.

### D.1 · Arm (2) as RULED: strict superset over the PAIR set

The first cut of this annex argued a **non-empty-new-pairs** arm (2). **That reading is dead**, and
this section records why rather than leaving the killed argument standing. Under it, an incoming
set that adds one pair *and drops three* still supersedes — so a rotation across overlapping
subsets burns live proposals one after another whenever the complement is non-empty. That is the
same churn B11b exists to stop, wearing a different shape, which is a guard defeating itself.

**The ruled arm is strict superset (incoming ⊋ live): it admits growth and refuses trade.** And it
is over the **`(check_key, item_key)` pair set**, never the check_key set.

#### D.1a · The justifying example was MIS-DERIVED — RULED 2026-08-27 after a rig measurement

*An earlier cut of this section justified arm (2) with: live `{(A, i1)}` versus incoming
`{(A, i1), (A, i2)}` share the key set `{A}`, so "a check_key reading would refuse a proposal
adding a genuinely new item under an existing check". **The build lane's battery found that case is
never reached, and the measurement showed why the example — not the guard — was wrong.***

**Measured on the rig** (two worlds identical but for the number of outstanding drafts under the
same check): `draft_count = 1` digests `ebc4ae27…`, `draft_count = 2` digests `7b75a76d…`, and the
stored `measured` payload carries the item list and the count outright. **A new outstanding item
under an already-covered check IS a change in that check's measured state, and the digest moves
with it.**

So legitimate same-key growth **arrives through arm (1)**: the world moved, the digest moved, and
B11 — whose predicate is exact equality of the `check_key → digest` MAP — does not fire.
**B11 therefore binds only when NOTHING MEASURED MOVED**, and refusing there is the honest answer:
a second item appearing with no measured change would be measurement incoherence, and fail-closed
is correct. **Arm (2)'s real province is NEW-KEY coverage**, which the map inequality already lets
through to the superset test. **B11 stays exactly as 0138 shipped it; no body changes.**

**Battery ceiling, stated rather than papered over:** the unchanged-world same-key retry (→ B11)
and the new-key case (→ arm (2)) are both drivable. A *real* new item arriving mid-run is **not**
drivable for `unapproved_drafts_in_period`, because `begin_close` FREEZES the year and no new draft
can appear in the period after the run starts — the same wall `fa4c.B1b`/`G1b` pin. The digest
mechanism is proven by the measurement above; the same-run transition is carried by name.

### D.2 · What `settle_reason` must say under each arm

`settle_reason` stops being a fixed literal, and the two arms owe different sentences:

- **arm (1), a moved digest** — name the moved `check_key`s **and every `(check_key, item_key)`
  pair the successor drops.** Arm (1) does not require the successor to cover as much as its
  predecessor, so coverage CAN be lost here; the guard permits it (the measurement really moved)
  and the record therefore has to carry it. A reviewer must not have to diff two proposals to
  discover what a supersession took away.
- **arm (2), strict superset** — name the newly-covered pairs. Nothing is lost by construction, so
  the sentence is simply what was added.

A supersession that cannot truthfully say why it happened should not be written; after B11b every
supersession has a true sentence available to it, which is the whole point of the recut.

---

## Annex E · The receipt subject and the op key (design §6.3)

**The collision, derived.** `uq_aar` is `(firm_id, act_kind, subject_kind, subject_id, op_key,
verdict, rung_digest)` (0138:396). `_close_wake_ctx` requires the caller's op key to equal
`_close_expected_op_key(task, verb, subject)` (0138:1311-1314), and that helper hashes
`task ‖ verb ‖ subject` (0138:1266-1269). Wrapper 12 pins its ctx subject to the **client** — the
`wake_mint_month_snapshot` precedent (0138:2473) — so every call of this verb inside one wake
task carries the **same** op key.

Now take two prepaid entries A and B in one clocked pass, both refusing for the same reason (no
service period recorded). Same firm, same `act_kind`, same `op_key`, same `verdict`, same
`rung_digest`. If the refusal receipt named the *client* as its subject, the two rows would
collide on `uq_aar`; `_agent_close_receipt`'s `on conflict do nothing` read-back would find the
standing row, its identity guard would find every compared field equal (same task, same actor,
same client, same wake kind, same vector — 0138:1336-1344), and it would return **entry A's
receipt id for entry B's refusal.** That is FIX-1's defect exactly, re-opened not by a missing
comparison but by a subject too coarse to tell two acts apart.

**The fix is the subject.** Refused → `('journal_entry', p_source_entry)`; acted →
`('adjustment_template', v_template_id)`. Both discriminate per entry, and the split across
verdicts is the shipped idiom — the fix order records `begin_close` / `open_fy` /
`mint_snapshot` as *"safe by differing subject"* (§Native, F1). `journal_entry` is already in
the closed `subject_kind` set (0138:349-350); `adjustment_template` is the one value PR-2a adds.

**The null-subject edge.** `subject_id` is `not null`, so a call with `p_source_entry = null`
has no subject to name and no receipt it could honestly write. That case therefore raises
CLR10 `prepayment_source_required` in Tier A, before anything durable — the tier whose contract
is *"RAISES, writes nothing"* (0138:1272-1273).

**The delegate's sub-key.** `propose_adjustment_template` takes its own `_reserve_op` slot
(0045:3864), so two entries in one task need two keys there. The depreciation catch-up already
solves this: it passes `p_op_key || ':' || (v_due ->> 'period_end')` down to `_fa_run_period_core`
while handing the receipt the wrapper's own key (0138:2399 against :2379-2381). Wrapper 12 uses
`p_op_key || ':' || p_source_entry::text`, same shape, same reason.

**The recut not taken.** Pinning the ctx to `('journal_entry', p_source_entry)` would make the
*derived* key discriminate, removing the need for a sub-key — but `clara._close_subject_client`
(0138:1236-1256) is a closed CASE over five subject kinds with an ARM-0 `return null` default,
so it would need a `journal_entry` arm and therefore a `create or replace` on a body 0138 just
installed. Its failure mode on the old body is a refusal (null subject → CLR03 client-pin
mismatch), so the D1 risk is fail-closed rather than wrong — but it is still a second body in
the inventory, bought for a discrimination the receipt subject already provides. Not taken, and
recorded so the review lane sees a decision rather than an omission.

**The collision needs identical rung VECTORS, not merely two refusals** (review's correction to
this annex's first cut). `rung_digest` is in `uq_aar`, so two refusals differing in any rung
already occupy separate rows. The reason that narrowness buys nothing: the vector is a property of
the *task and the client*, not of the entry — a live hold or an incomplete model triple produces
byte-identical vectors for every entry in the pass, which is precisely the common case.

---

## Annex F · The five pre-rungs, derived (design §6.2a — review finding F3)

**Why this annex exists.** `clara.propose_adjustment_template` is untouched by PR-2a, so its
raise paths stay live under the agent core. A raise inside an agent core aborts the transaction
and takes the receipt with it, so each one is a judgement act that leaves no trace. Every path
below was read at the live body, and each is reachable on input the clocked lane will really
produce.

### F.1 · Pre-rung (a) — the fork is ANSWERED; this records the dissolution

*An earlier cut of this annex left a build-lane STOP instruction here, pending F1. **F1 is ruled
and the stop is withdrawn.** A builder must never meet a stop sign on an answered question, so the
fork is not preserved for interest — it is resolved, and this section says how.*

The delegate refuses unless `clara._adj_period_start(p_client, p_cadence, p_start_date)` equals the
supplied start, and likewise `_adj_period_end` for a supplied end (0045:3888-3902).

**Under F1's ruled convention the predicate is satisfied by construction.** The chain is two hops
and both are at the bytes: `_adj_period_start(client, 'monthly', d)` is `clara._fa_month_start(d)`
(0045:1881-1884), and `_fa_month_start` is `date_trunc('month', p_d)::date` (0041:1016-1018) — a
**calendar** month, with no dependence on the client's financial year. F1 rules that the schedule
starts at the **service-start month**, so the template's `start_date` is the first day of that
month, which IS `date_trunc('month', …)` of itself. The two candidate predicates that the earlier
cut weighed — snap-and-assert versus carry-the-remainder — were different answers to a question the
ruling removed; on every input they now agree.

**The rung is not deleted; it is RECLASSIFIED.** It can no longer fire on ordinary caller input, so
it leaves class (a) — an ordinary-input refusal — and joins class (e): **a self-check on the agent
core's own output.** It is kept because a silent misalignment would post a schedule against the
wrong periods, and because it costs one comparison. Its cell changes accordingly, from "a mid-month
term refuses" to a construction invariant over a service period starting on any day of a month
(**W38**), with a mutant that hand-builds a misaligned start so the rung is provably live code
rather than a comment.

### F.2 · Pre-rungs (b)-(e)

- **(b) `template_duplicate_pending`** (delegate 0045:3948-3952; durable half
  `uq_adjustment_templates_content`, 0045:1257-1258). The rung recomputes `_adj_template_hash`
  over the same canonicalised lines and probes the same `status in ('proposed','live')`
  population, returning the twin's id in its payload. This is the rung a **re-wake** hits: the
  lane drafted a schedule yesterday, nobody signed it, and today's pass would otherwise abort.
- **(c) `template_line_ineligible`** (delegate 0045:3938-3943). The same
  `_adj_line_eligibility_breach` call, the same payload merge.
- **(d) `template_date_unsupported`** (delegate 0045:3929-3937). The DERIVED first period end is
  domain-checked, not the supplied dates — the distinction 0045's own round-9 comment draws.
- **(e) `template_lines_unbalanced`** (delegate 0045:3842-3847). A self-check on the evaluator's
  own output. A red here is a fault in `prepayment_schedule_v1`, not in the caller, and it must
  still land as a receipt rather than an abort — a broken evaluator that leaves no evidence is
  strictly worse than one that refuses loudly.

### F.3 · The honest ceiling — these are courtesies, not walls

Pre-rung (c) reads the eligibility helper WITHOUT the `client:fa-roles` leaf the delegate takes at
0045:3936 immediately before its own check, and (b)'s durable half is a partial unique index.
Between rung and delegate a concurrent writer can change either answer. **The delegate's raise
therefore remains the structural wall**, Tier D captures the abort as `last_refusal` for the next
wake, and **no cell may assert that the pre-rungs make the raise unreachable** — the cells assert
only that the ordinary path now produces a receipt. Stating this is the point: a courtesy sold as
a wall is how a guard quietly stops being one.

---

## Annex G · The mint-snapshot collision, derived (design §6.3a — review finding F4)

**The shipped body.** `clara._agent_mint_month_snapshot_core(p_ctx, p_client, p_month_start,
p_rationale, p_model, p_op_key)` (0138:2437-2465) writes its refused receipt as
`_agent_close_receipt(v_firm, p_client, 'mint_snapshot', 'client', p_client, …, 'refused',
v_rungs, p_op_key)` at 0138:2446-2448. Its wrapper pins the ctx subject to the client
(0138:2473), so `_close_expected_op_key` hashes `task ‖ 'wake_mint_month_snapshot' ‖ client`
(0138:1266-1269) — **one op key for every month the task touches.**

**The collision.** `uq_aar` is `(firm_id, act_kind, subject_kind, subject_id, op_key, verdict,
rung_digest)` (0138:396). For two refusals of two different months inside one wake task, every one
of those seven is equal — **the month appears in none of them.** `_agent_close_receipt`'s
`on conflict do nothing` read-back then finds the standing row, its identity guard compares task,
actor, client, wake kind and vector and finds them all equal (0138:1336-1344), and it returns
**the first month's receipt id for the second month's refusal.**

**It requires identical rung vectors, and that does not save it.** The ordinary way to reach this
is a live hold or an incomplete model triple — conditions of the *task*, which produce exactly the
same vector for every month in the pass.

**Why wrapper 12's fix does not transfer.** There the subject could carry the grain
(`journal_entry` / `adjustment_template`, both uuids). A month start is a **date** and
`subject_id` is `uuid not null` — there is nothing to name. So the discriminator moves to the
`op_key` column, which is already in the key: both receipt calls in the core take
`p_op_key || ':' || p_month_start::text`. The acted path is already safe by its minted
`snapshot_id`, but it takes the month-scoped key too, so every receipt row for this verb says
which month it was about whichever way the act went.

**Blast radius, stated.** This changes no wall, no floor and no grant; it changes what a receipt
is keyed and labelled by, on a verb no live credential can currently reach. The ACTED path's
behaviour is unchanged in every observable except the recorded key. Cell **W32**; its mutant
reverts to the bare key and reproduces the shipped defect.

---

## Annex H · F1's carrier surgery, derived (design §5.2 — owner ruling 2026-08-27)

### H.1 · Why the present carrier cannot express the ruled convention

`clara.adjustment_templates.lines` is ONE canonical line array, and `_adj_run_occurrence_core`
materialises it verbatim for every period it runs (0045:5181-5191 — a loop over
`jsonb_array_elements(t.lines)` straight into `clara.journal_lines`). Nothing in the row varies by
period. So a straight-line schedule whose final period absorbs the rounding remainder has two
available spellings and **both post wrong books**: put the base in `lines` and the remainder is
never charged; put `total_cents` in `lines` and `n` occurrences charge `n × total`. This is why
the finding was CRITICAL and why it was an owner question rather than a builder's call.

### H.2 · Per-occurrence lines vs a final-occurrence override — the choice, with its reasoning

The ruled convention needs exactly **two** distinct amounts. A final-occurrence override is
therefore sufficient for v1 and is genuinely the smaller diff, so it deserves a real answer rather
than a dismissal.

**It loses on the extension path, which is already ruled rather than speculative.** Pro-rata is
the named second policy, and under day-count pro-rata **every** period can differ. An override
carrier would then have to be removed and replaced — a second surgery on
`_adj_run_occurrence_core` and `_adj_on_approve`, the two bodies on the unattended daily posting
path, and a **second D1 window**, paid at a later date under whatever conditions then apply.

Per-occurrence lines subsume both conventions: straight-line is a schedule whose entries happen to
be equal-but-one; pro-rata is a schedule whose entries are not. Under this shape the ruled
extension is an evaluator `_v2` — a NEW frozen closure, which is what law 9 already requires of a
changed formula — and **the carrier, the CoR set and the window do not move again.** One surgery
instead of two, taken at the moment we are already holding the window open.

### H.3 · Sibling column, not a widened `lines`

`lines` is read outside this train, and a sibling `schedule jsonb` —
`[{period_start, period_end, lines:[…]}]` — leaves every one of those readers reading exactly what
it reads today. **`_adj_canon_lines` is untouched**, which is the single biggest reason this stays
a four-body recut rather than an estate-wide one.

**But "untouched" is not the same as "still correct", and the second review was right to press
it.** Each of these bodies takes `t.lines` as a stand-in for *what an occurrence posts*. Under a
schedule that is no longer trivially true — unless §5.2a's congruence constraint holds. It does,
and each row below states WHICH clause covers it:

| reader | site | what it asks of `t.lines` | covered by |
|---|---|---|---|
| `_adj_oldest_unmet_period` → `_wdb_rerun_breach` | 0045:5445-5446 | `_wdb_line_shape` — the `(account, direction)` SET, **amount-blind** (0045:2054-2062 emits `code:D`/`code:C` on `debit_cents > 0` and discards magnitudes) | **(a)** shape congruence |
| `_adj_oldest_unmet_period` → eligibility | 0045:5495 | `_adj_line_eligibility_breach` — account eligibility, amount-blind by nature | **(a)** |
| `_adj_on_approve` axis 2g | 0045:5797 | the same eligibility breach at approve time | **(a)** |
| `sign_adjustment_template` → overlap advisory | 0045:4339 | `_wdb_line_shape` again — amount-blind | **(a)** |
| `_adj_run_occurrence_core` shape read | 0045:4629 | `_wdb_line_shape` | **(a)** |
| `_adj_run_occurrence_core` eligibility | 0045:5109 | the eligibility breach | **(a)** |

**Two of these matter more than the others.** `_adj_oldest_unmet_period` is reached by the
**close-agent wake lane** — the very lane wrapper 12 runs in — so an incongruent schedule would
have corrupted the due-oracle answer the clocked close depends on. And `_adj_on_approve` axis 2g
fires at the moment a human approves, which is the last place anyone would want to discover that
`t.lines` no longer describes the entry in front of them.

**`_adj_template_json` (0045:6550) is the ONE reader congruence does not cover**, because it is a
projection rather than a predicate: it hands `lines` to a surface verbatim. It is therefore
**in PR-2a's scope** under F2 wall 3 (design §5.3) — it gains `schedule` and the target-account
projection, which is what makes "visible at the sign door" implementable at all.

**The dependency, stated so the claim's ground is visible:** without clause (a), those six reads
would each need their own recut and **the D1 inventory would be SIX bodies, not four.** The
constraint is not a nicety; it is what buys the smaller window.

### H.4 · The resolver, and null-stability as the safety property

`clara._adj_period_lines(p_schedule jsonb, p_lines jsonb, p_period_start date, p_period_end date)`
— **RECUT 2026-08-27** from the `p_template_row` form, which no live call site can invoke; the
grounds and the evidence live in the migration's DEVIATIONS REGISTER, deviation (1), and are
deliberately not restated here:

- `p_schedule is null` → `clara._adj_canon_lines(p_lines)`, i.e. **exactly today's answer**;
- otherwise → the matching entry's lines, canonicalised through the same helper.

Two call sites change, and only two: `_adj_run_occurrence_core` at 0045:5186 (the materialisation
loop) and `_adj_on_approve`'s axis (2d) at 0045:5733-5744, whose `v_want :=
clara._adj_canon_lines(t.lines)` becomes the resolver call for **the entry's own period** — which
the entry already carries on its flags (`period_start` / `period_end`, written at 0045:5178).

**Null-stability is STRUCTURAL, not incidental, and that distinction is the whole argument (N9).**
It does not rest on a survey of existing rows finding them all null — it rests on the migration's
own prestate, which pins the **absence of every object this file creates**, `schedule` among them.
A column that does not exist until this file runs cannot hold a non-null value in any row when it
does. So on the day this applies, every template is `schedule is null` **by construction**, and
each of the four recut bodies is observably unchanged **by construction**.

**This sentence belongs in the migration header's D1 section, not only here**, because the person
who has to believe it is the ceremony conductor reading the file at the window — design §9 carries
it there. W36/W37 remain as rig proof of a fact the prestate already guarantees; they are the
belt, not the argument.

### H.5 · The hash, extended without breaking a single stored value

`_adj_template_hash` (0045:1952-1958) hashes a seven-key object. Adding a `schedule` key
unconditionally would change **every** recomputed hash, and the duplicate guard at 0045:3948-3952
compares a recomputed hash against stored ones — so every pre-existing template would silently
stop being recognised as its own twin. The extension therefore folds the schedule in **only when
non-null**, leaving the null case byte-identical to today. Cell **W37** asserts exactly that
against a template created before the migration; its mutant folds unconditionally and watches the
stored hashes mismatch.

The function has **one caller** (0045:3850), so the eight-argument recut is a two-line blast
radius. `propose_adjustment_template` takes `p_schedule jsonb default null` **last**, per
0045:6707-6711's own house rule that new arguments go last with a default so the grant string is
the only other line that moves.

### H.6 · What F2 does NOT touch, and why that matters for §5.1

The target account is a **classification**, applied by the agent core when it assembles `lines`.
It never enters `clara.prepayment_schedule_v1`, whose signature and amounts-only output are
unchanged. That is deliberate: the evaluator's single-member frozen closure (§5.1) survives, and
hard constraint 2 is satisfied exactly — **no model-generated numeral reaches a durable artifact;
a model-generated classification does, receipted under wall 2 and signed under wall 3.** The maxim
§5.0 records is the compressed form: *facts get anchored, judgements get receipted.*
