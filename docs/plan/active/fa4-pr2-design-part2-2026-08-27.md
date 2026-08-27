# F-A4 PR-2a — design part 2 (build envelope · rulings · acceptance)

*Part 2 of the design of record. Part 1 — `docs/plan/active/fa4-pr2-design-2026-08-27.md` —
carries the ruling, the scope, the verb census, the carrier and the evaluator with both owner
rulings (§§0-5); this file carries wrapper 12 itself, the debt batch and the build envelope from §6
on. Split at the estate's design + part-2 convention (`close-key-1`, `sandbox-export` and
`tax-computation` all run it) after the 2026-08-27 review folds pushed part 1 past the 500-line
gate. **Section numbers are CONTINUOUS across the two files**, and **§12 is VACANT** — its
one-line pointer folded into §10 at the 2026-08-27 tidy, the number retired **in place** the way
AGENTS.md retires constraint 12: the other numbers did NOT shift, so every §13/§14 cite written
before or after that date still resolves.*

**Annex A** is `docs/plan/active/fa4-pr2-battery-2026-08-27.md`; **B-C**
`docs/plan/active/fa4-pr2-annexes-2026-08-27.md`; **D-H** `docs/plan/active/fa4-pr2-derivations-2026-08-27.md`.

---

## 6 · Items 3-5 — the extraction, the receipt CHECK, and wrapper 12

### 6.1 `clara._propose_adjustment_template_core`

Signature: `(p_ctx jsonb, p_client uuid, p_name text, p_cadence text, p_start_date date,
p_end_date date, p_auto_reverse boolean, p_lines jsonb, p_memo_template text, p_op_key text,
p_replaces uuid default null)`. Ungranted, SECURITY DEFINER, `search_path` pinned,
`clara_fn_owner`-owned.

**Built by harvest, never by re-typing.** `pg_get_functiondef` on the live catalog → the two
substitutions → one `create function` for the core and one `create or replace` for the door as
a thin delegate. This is the 0046 S7.1 / 0048 S1 law that 0052 restates at its own §SECTION 1,
and it is the direct remedy for the F-A3/PR-1b class where a CoR built from a migration's
*file text* silently erased a later migration's dynamic patch. `propose_adjustment_template`
carries no known later patch (§2) — the harvest is what *proves* that rather than assuming it.

**Prestate pins** (each of the four §5.2 bodies, not just this one): the live prosrc sha256 read
by rig replay and never from memory (the 0124:38-41 tripwire shape), `prosecdef`, `proconfig`,
`proacl`, exactly one overload at the pinned `regprocedure`, and the absence of every object the
file creates. **Tail proof:** a normalized-prosrc differential showing the moved text is unchanged
modulo the ctx substitution and the ruled edits, plus the ACL/ownership/`search_path` triple
byte-identical to the stash.

### 6.2 Wrapper 12 and its agent core

**`clara._agent_prepayment_schedule_core(p_ctx jsonb, p_client uuid, p_source_entry uuid,
p_rationale text, p_model jsonb, p_op_key text)`** — the H.7 shape verbatim (0138:2437-2465).

**`clara.wake_establish_prepayment_schedule(p_client uuid, p_source_entry uuid, p_rationale
text, p_model jsonb, p_op_key text)`** — the signature close-key-1's own Annex E.1 already
recorded (`docs/plan/active/close-key-1-annexes-2-record.md`:33), **plus F2's two new arguments
(§5.3) and `p_schedule`'s pass-through (§5.2)**. *Ordinal, settled (N6):* **this verb is wrapper
12.** The earlier cut of this design said 13; that was wrong. `close-key-1-annexes-2-record.md`:33
says 12, and 0138 says 12 **twice** (:1790, :2435) while numbering `wake_mint_month_snapshot` 13 —
design §3.1 carries no ordinal column at all, so there was never a source saying 13 to weigh
against them. Nothing keys on the ordinal (the allowlist and every census key on the NAME), which
is exactly why a wrong one can sit unnoticed; it is corrected doc-wide rather than reconciled.
**Counts are a different quantity and do not move:** twelve wrappers exist, this is the
thirteenth. It calls
`clara._close_wake_ctx('wake_establish_prepayment_schedule', 'client', p_client, p_op_key)` and
delegates. No DML text in the wrapper body.

| rung | condition | token |
|---|---|---|
| Tier A | credential · allowlist · client pin · bound task · op key derived · subject in firm — all inside `_close_wake_ctx` | CLR03 / CLR10 / CLR11 |
| Tier A (new) | `p_source_entry` is not null — a receipt row needs a non-null subject, so this raises **before** anything durable | CLR10 `prepayment_source_required` |
| B1, B2 | `_close_tier_b_common` (0138:1418) | `close_prep_held`, `receipt_incomplete` |
| **B10** | the evaluator derives a term and a start from DB-owned inputs (close-key-1-design.md:162) | `prepayment_term_underivable` |
| B10′ | the source entry is fit | `prepayment_source_unfit` |
| **B10a-e** | **the five PRE-RUNGS of §6.2a** — the delegate's own raise paths, asked as rungs *before* the delegate is called | `template_alignment_unmet` · `template_duplicate_pending` · `template_line_ineligible` · `template_date_unsupported` · `template_lines_unbalanced` |

#### 6.2a The five pre-rungs (review finding F3, HIGH)

**The defect they close.** The propose core keeps all five `raise exception` paths, and a raise
inside an agent core **aborts the transaction and takes the receipt with it** (0138's Tier-C
contract) — a judgement act leaving no trace, the silent-daily-log failure F-A4 exists to end.

| # | the delegate's raise | where | the pre-rung, asked in the agent core |
|---|---|---|---|
| a | `template_fy_stale` — `_adj_period_start(client, cadence, start)` must equal the start; likewise the end | 0045:3888-3902 | **`template_alignment_unmet`** — **RECUT under F1's ruled convention; see below** |
| b | `template_duplicate` — a `proposed`/`live` twin at the same `content_hash` | 0045:3948-3952, durable half `uq_adjustment_templates_content` 0045:1257-1258 | **`template_duplicate_pending`.** The rung computes the same hash and probes the same partial-unique population, so a re-wake over an already-drafted schedule REFUSES with the twin's id instead of aborting |
| c | `template_line_ineligible` — `_adj_line_eligibility_breach` on a line account | 0045:3938-3943 | **`template_line_ineligible`.** Same helper, same payload, asked before the delegate |
| d | `template_date_unsupported` — the DERIVED first period end outside the ISO domain | 0045:3929-3937 | **`template_date_unsupported`.** Same predicate on the same derived date |
| e | `template_lines_invalid` — the lines must balance to the sen | 0045:3842-3847 | **`template_lines_unbalanced`.** This one is a self-check on OUR OWN evaluator output, so a red here is a *design* fault, not a caller fault — and it must still be a receipt, not an abort |

**They are courtesies, not walls, and the design says so.** Pre-rung (c) reads the eligibility
helper without the `client:fa-roles` leaf the delegate takes at 0045:3936, and (b)'s durable half
is a partial unique index — both race a concurrent writer. **The delegate's raise remains the
structural wall**, Tier D captures it, and no cell may assert otherwise (Annex F.3).

**Pre-rung (a) — DE-PARAMETERIZED, and the P-align/P-carry fork DISSOLVES.** F1's ruling settles
it: whole-calendar-month straight-line, the schedule starting at the service-start month. And
`clara._adj_period_start(client, 'monthly', d)` is `clara._fa_month_start(d)` — **monthly is
calendar-month** (0045:1881-1884, and 0045:1878-1880 says so in prose). So the template's
`start_date` is the first day of the service-start month, which **IS** a period start by
construction: the two candidate predicates were only ever different answers to a question the
ruling removed, and they now agree on every input.

**The rung stays, reclassified.** It can no longer fire on ordinary caller input — it can only
fire if our own construction is wrong, which puts it in class (e) rather than class (a): a
**self-check on the agent core's own output**, cheap, fail-closed, and worth keeping precisely
because a silent misalignment would post a schedule against the wrong periods. Its cell changes
accordingly, from "a mid-month term refuses" to a construction invariant (Annex F.1, cell W38).

**The refusal names the missing field.** B10's rung object carries
`{rung:'B10', token:'prepayment_term_underivable', missing:'document_service_periods',
document_id:…}` — the receipt says *which* fact to record and *on which document*, and the human's
next act is one call to §4.2's door: fail-closed as a durable typed refusal, not a guess.

**The acted path:** evaluator → `_propose_adjustment_template_core` with
`p_ctx = {firm, actor: clara.agent_user_id()}` and the §5.2 schedule → the template lands
`status='proposed'`. Result: `{template_id, status:'proposed', schedule_version:'v1', total_cents,
period_count, target_account, content_hash}`.

**It can never reach `live`** — structurally, not by promise. The core calls only the propose
core, and `adjustment_templates.status` moves to `live` in exactly one body,
`clara.sign_adjustment_template` (0045:4341-4343), which opens the ADMIN floor and holds no
grant to any wake role. The census cell reads that as a closed-world fact rather than trusting
the wrapper's shape.

**No new event type.** The human twin emits none (`_audit` at 0045:4136 plus `_finish_op`);
minting one for the agent path alone would be a second architecture for one lane's convenience.
`_audit` fires from inside the shared core as it does for a human — agent user as actor,
`via_wake_kind` NULL on `audit_log` (the shipped GR-2 decision, 0138:334-336), asserted by a cell.

**No new human door is owed** — the proposed template surfaces through
`clara.list_adjustment_templates(uuid)` (viewer floor, 0045:6721) and the signing door exists.
**F2 wall 3 adds an obligation to that door, not a new door:** the schedule and target account must
be VISIBLE there (§D4's projection), with correction by decline-and-re-propose — a PR-3 dashboard
item named here so it is not discovered late.

### 6.3 The receipt subject, the op key, and one recut NOT taken

Full derivation in **Annex E**; the three decisions it reaches:

1. **`agent_act_receipts.subject_kind` gains `'adjustment_template'`** — `act_kind` already
   admits `'prepayment_schedule'` (0138:346-348) but `subject_kind` admits no template
   (0138:349-350). Drop constraint, add with the existing six plus one. Extend, never rewrite.
2. **The receipt's subject differs by verdict** — refused → `('journal_entry', p_source_entry)`,
   acted → `('adjustment_template', v_template_id)`. This is not cosmetic: the derived op key is
   per **(task, verb, client)** (0138:1266-1270, :1311-1314), so two source entries in one wake
   task share an op key, and a client-subject refusal on entry B would wear entry A's receipt —
   **FIX-1's exact defect, re-opened by multiplicity.** Differing subjects across verdicts is
   the shipped idiom (fix order §Native F1's *"safe by differing subject"*).
3. **The delegate gets a sub-key**, `p_op_key || ':' || p_source_entry::text`, the depreciation
   catch-up's own idiom (0138:2399 against :2379-2381) — and
   **`clara._close_subject_client` is NOT recut** to add a `journal_entry` arm, because that
   buys a discrimination the receipt subject already provides at the price of a second body in
   the D1 inventory.

**The collision is NARROWER than a loose reading suggests, and that is why it survived review.**
`rung_digest` is in `uq_aar` (0138:396), so two refusals collide only when their **rung vectors
are byte-identical**, not merely when both refused. That is not a corner: the common case
produces exactly that — two prepaid entries on one client, neither carrying a service period,
both refusing with the same single-element `B10` vector. A narrow window that the ordinary path
walks straight into is the worst kind.

### 6.3a Item 10 — the SAME collision is LIVE in `_agent_mint_month_snapshot_core` (F4)

**Conductor decision, 2026-08-27: fixed in PR-2a.** The derivation above is not specific to
wrapper 12. `clara._agent_mint_month_snapshot_core` (0138:2437-2465) takes `p_month_start` — the
act is **month-grain** — but pins its REFUSED receipt to `('mint_snapshot', 'client', p_client)`
(0138:2446-2448) while `_close_wake_ctx` derives the op key per (task, verb, **client**). Two
different months minted in one wake task, both refusing on the same vector (a live hold, say),
therefore collide on `uq_aar`, and the second month's refusal is answered with the first month's
receipt id. Same defect class as FIX-1, shipped and undetected.

**The fix, and why the shape differs from wrapper 12's.** `subject_id` is `uuid not null`, and a
month start is a date — there is no uuid to name, so the subject cannot carry the grain. The
discriminator is therefore the **op_key column**: both receipt calls in that core take
`p_op_key || ':' || p_month_start::text`, the same sub-key idiom the depreciation catch-up
already uses for its delegate (0138:2399). The acted path is already safe by subject (the minted
`snapshot_id`), but it takes the month-scoped key too — a receipt row for this verb should say
which month it was about whichever way it went. Cell: **W32**, two months in one task.

**Window economics.** `_agent_mint_month_snapshot_core` is the same class of body as §H's — created
by 0138, undeployed, reachable only behind the `close_prep` `wake_engine_sources` row at
`enabled = false`. It rides §H's declared-but-idle slot at no additional ceremony cost, which is
what makes fixing it here cheaper than carrying it. Full derivation: **Annex G**.

### 6.4 The park's positive-absence cell flips

0138's T.9 (:2944-2951) reads `pg_proc` **positively** to prove the parked half absent, and the
fold-seam law says a gate pinning a defect must flip when the defect is fixed. PR-2a's tail
carries its converse — both parked objects resolving at their **exact signatures** via
`to_regprocedure` (never a bare name — law 3) — and every twelve/thirteen count moves together:
the allowlist gains a thirteenth `close_prep` row (0138:2521-2533), the wake roster in
`packages/db/tests/rig-meta.mjs`:1035-1040 its thirteenth name, and rig-meta's parked-absence note
(:1029-1034) is rewritten as a presence note. Cell W29 and its real mutant.

---

## 7 · Item 6 — residual 1, the bookkeeper conjunct mirrored

**The measured defect** (fix order, Post-re-verification follow-up 1): a firm *viewer* reads
`model_name` / `model_version` / `rationale` / `narrative` straight off `clara.close_proposals` —
the data class FIX-6 walled off on `agent_act_receipts`. `p_cp_human` (0138:558-559) and
`p_cph_human` (0138:625-626) check `firm_id = clara.jwt_firm()` and nothing else.

**The consumer census was run before choosing the wall — Annex B.0b carries it row by row.** Its
result: the two definer doors read under the owner policy and are unaffected; the `apps/web` close
panel deliberately reads **nothing**; every rig read bypasses RLS as superuser or owner.

**No legitimate consumer breaks.** Both policies gain
`and clara.actor_role_rank() >= clara.role_rank('bookkeeper')`, spelled identically to 0138:427
so the close-limb tables read as one rule.

`close_prep_holds` carries a weaker data class (a hold reason, not a model's rationale) but is
walled anyway, stated in-migration: its doors are bookkeeper-floored (0138:1573, :1608), so a
record readable below the floor of the act that wrote it is an inconsistency waiting to be found.

---

## 8 · Item 7 — MED-8, the supersede churn

*(Residuals 2/3/4/5/6 — census strengthening and the catalog-comment truings — are Annex B. The
bytes-level reading behind the finding below is **Annex D**.)*

**The defect.** `_agent_close_proposal_core` builds `v_bound` over the keys the *agent chose*
(0138:2251-2277), and B11 refuses only on an exact jsonb match (0138:2292-2297) — so a fresh task
drafting a strict **subset** of a live proposal's keys skips B11 and stamps that proposal
`superseded` with the fixed literal *"superseded by a fresh proposal on a moved gate vector"*
(0138:2308-2312). **A false sentence on a durable record**: nothing moved. A reviewer about to
adopt a proposal finds it superseded for a reason that did not happen.

**The guard** — a new rung evaluated where B11 is, in the form the conductor ruled on 2026-08-27
after the review supplied the missing churn fact:

> **B11b — `close_proposal_no_state_change`.** An incoming proposal may supersede a live one only
> if at least one holds: **(1) a moved digest** — some `check_key` present in both binds a
> different digest; or **(2) STRICT SUPERSET OF THE PAIR SET** — the incoming
> `(check_key, item_key)` **pairs** are a proper superset of the live proposal's pairs
> (incoming pairs ⊋ live pairs). Neither ⇒ typed refusal naming the live proposal's id, and the
> live proposal stays `open`.

**Arm (2) is over PAIRS, not check_keys, and the distinction is load-bearing (N5).** At check_key
granularity a live `{(A, i1)}` and an incoming `{(A, i1), (A, i2)}` share the key set `{A}`, so a
check_key reading would refuse a proposal adding a genuinely new item under an existing check —
legitimate growth, which is exactly what arm (2) exists to admit. W24's positive control is that
case.

**Arm (1) can drop coverage, and its `settle_reason` must SAY SO (N7).** A moved digest rightly
supersedes, but nothing forces the successor to cover as much as its predecessor, so an honest
re-measurement can quietly carry fewer pairs. The guard permits it (the measurement really moved),
so the **record** carries it: arm (1)'s reason names the moved `check_key`s **and every dropped
`(check_key, item_key)` pair**. A reviewer then sees what was lost instead of diffing two
documents — the same principle as the literal-reason fix: a durable record that cannot state what
happened should not be written.

**Arm (2) was "at least one new pair"; the review killed that reading.** Under a
merely-non-empty-new-pairs test, an incoming set that adds one pair *and drops three* still
supersedes — so a rotation across overlapping subsets burns live proposals one after another
whenever the complement is non-empty, which is the same churn B11b exists to stop, wearing a
different shape. **Strict superset is the only arm that cannot lose coverage**: it admits growth
and refuses trade.

**That leaves one legitimate act with no door: the correction that DROPS a pair** — a silent
supersede is the wrong way to perform a retraction. **My judgement, as the design asks: it does
NOT ship in PR-2a**, carried by this sketch so PR-2b or PR-3 inherits a shape rather than a gap:

> **`clara.withdraw_close_proposal_item(p_proposal uuid, p_check_key text, p_item_key text,
> p_reason text, p_op_key text)`** — a NAMED act, not a side effect of proposing: a wake verb with
> its own receipt (`act_kind` extends by one), refusing on a settled proposal, recording the
> dropped pair and the reason rather than letting a successor's silence imply it. Why not PR-2a:
> it is a fourteenth wrapper with its own allowlist row, grant, ladder and battery — a second
> verb's worth of surface in a PR whose window is already sized for one body, which D-24 names as
> how a train stops being reviewable.

Until it ships the retraction path is the human one that exists:
`clara.settle_close_proposal(..., 'withdrawn')` (0138:1671ff), after which the next wake proposes
cleanly against no live row — the reviewer-facing door Annex I.1 designed, at one human click.

**Annex D** carries the full derivation and what each arm owes `settle_reason`.

---

## 9 · The migration's section plan and the D1 ceremony note

Authored **UNNUMBERED**; the number is claimed at merge (`.claude/rules/db-migrations.md`). One
file, sections in apply order:

| § | contents | D1? |
|---|---|---|
| §0 | prestate — the live prosrc sha for `propose_adjustment_template`, its ACL/secdef/config triple, the absence of every object this file creates, and the `close_prep` `wake_engine_sources` row read **positively** as `enabled = false` | — |
| §A | `clara.document_service_periods` + trigger + indexes + RLS/policies + comments | no |
| §A2 | **F1** — `adjustment_templates.schedule` + `clara._adj_canon_schedule` + `clara._adj_period_lines` (§5.2), all additive | no |
| §B | the door and its core (§4.2) | no |
| §C | `clara.prepayment_schedule_v1` + the single-member `evaluator_versions` registration | no |
| §D | **the extraction** — the core, then the door as a thin delegate, now also carrying `p_schedule` | **YES** |
| §D2 | **F1** — `clara._adj_template_hash` at eight arguments, null-stable (§5.2) | **YES** |
| §D3 | **F1** — `clara._adj_run_occurrence_core` and `clara._adj_on_approve` resolve per-period lines (§5.2) | **YES** |
| §D4 | **F2 wall 3, visible half** — `clara._adj_template_json` projects `schedule` + the target account (§5.3). A live body, so it takes the prosrc pin and the CoR — but a READ PROJECTION, so an in-flight call is stale, never wrong (§5.2) | live-body CoR, not a correctness hazard |
| §E | `agent_act_receipts.subject_kind` CHECK swap (extend) | no |
| §F | wrapper 12's agent core + the wrapper + allowlist row 13 + the one grant | no |
| §G | the two policy mirrors (§7) | no |
| §H | `_agent_close_proposal_core` CoR — B11b + the truthful `settle_reason` | declared |
| §H2 | **F4** — `_agent_mint_month_snapshot_core` CoR, the month-scoped receipt op key (§6.3a) | rides §H's slot |
| §I | the catalog-comment truings (Annex B.4, B.5) | no |
| §TAIL | the strengthened index/policy assertions, the closed ungranted set, the thirteen-count flips, the frozen-schema check (constraint 15) | — |

`set local statement_timeout` near the top, precautionary (no backfill, no bulk scan).

### The D1 window

**FOUR bodies are genuinely live, re-derived after F1's ruling (§5.2)** — up from one, and stated
rather than left for the ceremony to discover: `clara.propose_adjustment_template` (hot) ·
`clara._adj_template_hash` (one caller) · **`clara._adj_run_occurrence_core` (the daily unattended
adjustment belt)** · **`clara._adj_on_approve` (every approve of an occurrence)**. PostgreSQL runs
an in-flight PL/pgSQL call to completion on the body it *started* with, so a call spanning the
migration runs the old body — the whole reason for the window. Standard quiesce from `docs/ops/`,
the CA-pinned bridge of `docs/ops/dsn-bridge.md`, **from merged `main`, never a branch.**

**What bounds the widened radius is STRUCTURAL null-stability, and this is the sentence the
ceremony conductor reads (N9).** §0's prestate pins the **absence of every object this file
creates**, `adjustment_templates.schedule` included — a column that does not exist until the file
runs cannot be non-null when it does. Every template is therefore `schedule is null` **by
construction**, and each of the four recut bodies observably unchanged by construction, not by a
survey that happened to find no counterexample (review law 2, applied to our own claim). W36/W37
stay as rig proof of what the prestate already guarantees — the belt, not the argument. **It is still ONE window:** these four are one
layer, the adjustment carrier and its readers, which is what D-24's severance law asks a window
to be.

**And the four-body count is EARNED (N1):** it holds only because §5.2a's congruence constraint
makes six other live `t.lines` readers correct by construction — without clause (a) the inventory
is **six** (Annex H.3 censuses them with sites). The number rests on a validation the propose door
performs, not on those readers being incurious.

**Four is the count of D1 CORRECTNESS hazards; the CoR set is FIVE (M1).** §D4 recuts
`clara._adj_template_json` — live (reached by `list_adjustment_templates`, 0045:6647, granted at
:6721) so it takes its own prosrc pin, but a **read projection**: a call spanning the migration
returns the old shape, **stale not wrong**. It cannot post a number against the wrong body, which
is what the quiesce exists to prevent, so it does not join the four. Stated rather than blurred,
because a conductor counting bodies and one counting hazards should both get a true answer.

**The other two bodies are declared and provably idle.** `_agent_close_proposal_core` (§H) and
`_agent_mint_month_snapshot_core` (§H2) are each reachable only through their own wrapper under a
`close_prep` credential, and the `close_prep` `wake_engine_sources` row ships `enabled = false` —
F-A4's outstanding INSERT-and-flip follow-up, recorded in `PROGRESS.md`'s F-A4 and G1 lane rows.
The prestate reads that flag **positively** and refuses to apply if it is true: absence of traffic
is not evidence (review law 2), a read of the disabled flag is. **One idle-slot argument covers
both**, which is the whole reason F4 is cheaper to fix here than to carry.

**The live frontier makes this cheaper than it looks.** Live is 131/`0136`; `0137` (D1 inventory
empty, by its own §SS0) and `0138` (additive, by its own header line 2) are merged but **not yet
ceremonied**. If PR-2a merges before that deploy, the chain 0137→0138→PR-2a lands in one combined
window — the W4 precedent, nine migrations through one D1 window
(`docs/plan/completed/wave-f-w4-ceremony-asrun.md`) — and §H's body is created and replaced inside
a single deploy, with no moment at which an old one could be in flight. **Whichever order the
deploy takes, the prestate proves the posture rather than assuming it.**

---

## 10 · Pointers — **Annex A** is the battery: forty-four walls, each with its own cell AND mutant, plus fixtures and the armed-skip statement. **Annex C** is the named OCR follow-up: its four steps, and the three reasons it is not in PR-2a.

## 11 · NON-GOALS — stated so a builder does not helpfully widen

1. **`clara.finalize_close`, `clara.reopen_fiscal_year`, `clara.attest_close_exception` and
   `clara.settle_close_proposal` are UNTOUCHED.** They are law 71's four reserved human acts, and
   the HIGH-1 ruling turns on exactly that list.
2. **`clara.sign_adjustment_template` is UNTOUCHED** — no core, no wrapper, no grant, no argument.
   R6: signing stays a human act at its ADMIN floor.
3. **No floor moves anywhere.** The only new privilege is EXECUTE on wrapper 12 to
   `clara_wake_interactive`. Nothing is revoked to make a test pass.
4. **F-A4 writes no journal line** (D-11). The template is `proposed`; posting stays with the
   existing `run_adjustment_occurrence` belt (0045:5301) after a human signature.
5. **No new posting machinery, no prepayment subledger.**
6. **`persist_invoice_facts`' closed field-path taxonomy is NOT extended here**, and no runtime
   extraction adapter changes (Annex C).
7. **No `close_attestations.from_proposal_id` column** — Annex B.5's recommendation, carried to
   PR-3 with its attack written out.
8. **`clara._close_subject_client` is not recut** (§6.3); **no new event type and no new human
   door** (§6.2).
9. **The runtime half is not in this PR** — `close_prep_due` as a seventh leader belt,
   `closePrep.v1` as a new WDK export, the task-bound mint in `pools.mjs`. See §13 item 1.
10. **`clara.withdraw_close_proposal_item` does NOT ship here** — the named retraction act §8
    sketches, carried to PR-2b/PR-3 with its shape written out. Until it lands, a proposal that
    must lose a drafted pair is withdrawn by a human through `clara.settle_close_proposal`.
11. **B13 arm 1 stays parked by name**, carried forward from 0138:104-111; it needs a real FA
    register with a period stranded in an earlier fiscal year, and it fails closed.
12. **No day-count pro-rata in v1** — F1's ruled convention is whole-calendar-month straight-line.
    Pro-rata is a SECOND ruled policy, per-client-selectable and still deterministic; §5.2's shape
    is chosen so it lands as an evaluator `_v2` with no carrier change, no CoR and no window.
13. **`clara._adj_canon_lines` is NOT touched** (§5.2) — the schedule is a sibling structure, so
    `lines` keeps its present meaning for every body outside this train that reads it.

---

## 13 · The five collisions — surfaced, and RESOLVED by the conductor (2026-08-27)

Each was surfaced rather than guessed; each carries its resolution here so the build lane finds
the ruling and not the question.

1. **NAMING — RESOLVED.** *"PR-2" named two trains:* close-key-1-design.md:477 defined PR-2 as the
   **runtime** PR (`close_prep_due` as a leader belt · `closePrep.v1` · the `pools.mjs` mint),
   while the dispatch brief called this DB work PR-2. A later citation of "F-A4 PR-2" would
   quietly mean different work — the failure `.claude/rules/handoffs.md` was minted for.
   **Ruling: PR-2a is this DB train, PR-2b is the runtime train.** close-key-1-design.md:477 is
   trued in this same PR (a design doc's own forward pointer, in scope). **This file keeps its
   `fa4-pr2-*` filenames** under the index's path-stability convention; the *train* is PR-2a
   everywhere in the prose.
2. **`PROGRESS.md`:102/:113 — RESOLVED, NOT MINE.** The F-A4 lane row calls PR-1c the
   `statutory_deadlines` DDL while 0138 shipped as the close agent limb, no such relation exists
   in `packages/db/migrations/`, F-T2 is recorded blocked on it, and the row's status cell still
   omits 0138. **The conductor owns this**: the re-label and the stale status cell land in the
   PROGRESS-truing PR. **This branch does not touch `PROGRESS.md`.**
3. **THE SERVICE-PERIOD DOOR IS HUMAN-ONLY — CONFIRMED AS LAW.** On hard-constraint-2 grounds: a
   model-derived period is not an anchored fact, and OCR's `financial_date` precedent (0026:916)
   does **not** transfer, because that value anchors to a stored region with a locator and a
   confidence. **Annex C's OCR-anchored route is the sanctioned automation path** — its own train,
   its own ladder. The interim cost is accepted and will be stated to the owner: **a human keys
   the period through the bookkeeper door before Clara can draft.**
4. **THE FY-CROSSING RULE — CONFIRMED.** Annex B.2's *"a term crossing more than one FY without a
   stated end"* can never fire once the carrier makes `period_end` mandatory. The reading used in
   §5 stands: **refuse when the term runs past the entry's FY and the client has no OPENED
   successor year.** Conductor's added note: under the R6/HIGH-1 frame **the clocked lane may
   lawfully clear this blocker itself** through `wake_open_fiscal_year` — so the refusal is a
   **self-healable state**, not a dead end, and Annex A carries the two-phase cell (**W31**) that
   proves the integration rather than assuming it.
5. **MED-8's latitude — NOW RULED (2026-08-27), superseding the "carried" disposition.** The
   review supplied the fact that settled it: under a merely-non-empty-new-pairs arm (2), a
   rotation across overlapping subsets burns live proposals whenever the complement is non-empty
   — the same churn in a different shape. **Arm (2) is STRICT SUPERSET (incoming ⊋ live).** The
   legitimate correction-that-drops-a-pair gets a separate NAMED act rather than a silent
   supersede; my judgement, stated in §8, is that it does not ship in PR-2a, and it is carried by
   name with its shape sketched. The canonical-coverage alternative is not taken.

**And the scope cut is ratified, not merely proposed.** §0's subtraction — **one core extraction,
not two**, because an extracted `sign_adjustment_template` core has no agent consumer under R6 and
would be a permanent dead member — is **CONDUCTOR-RATIFIED (2026-08-27)**. A build lane reading
the dispatch brief's original §1a must not "restore" the sign extraction.

### 13.1 · The two CRITICAL findings — OWNER-RULED (Tao, 2026-08-27, in-session)

The design review raised two CRITICAL input-contract findings and both went to the owner rather
than being designed around. Both are now ruled, and the design is built on the rulings (§5.0,
§5.2, §5.3); this section is the record with attribution.

**F1 — the carrier could not carry unequal per-period amounts.** Both readings posted wrong books:
the remainder never charged, or `n × total`. **RULED — OPTION A: extend the CARRIER**, chosen for
the one-signature experience (the human signs once, and the whole schedule is what they signed).
**Convention ruled with it: whole-CALENDAR-month straight-line** — schedule starts at the
service-start month, `n` = the term's months, equal amounts with the remainder in the FINAL period,
**no day-count pro-rata in v1**; pro-rata is a **second ruled policy, per-client-selectable and
still deterministic**. The design's own choice under it — **per-occurrence schedule lines in a
sibling column, not a final-occurrence override** — is made in §5.2, and its whole point is that
the ruled extension lands as an evaluator `_v2` with no second window. **Consequence for F3:**
pre-rung (a)'s P-align/P-carry fork **DISSOLVES** — monthly is calendar-month at the bytes
(0045:1881-1884), so alignment is true by construction and the rung becomes a self-check (§6.2a).

**F2 — no DB-owned source for the amortisation TARGET account. RULED: Clara JUDGES it.** The owner
overruled the conductor's human-keys recommendation, correctly: this is the agent-codes /
human-approves pattern the estate already runs in `autoDraft` coding, not OQ-4's fact class. Three
walls, all in §5.3: deterministic validation · the judgement receipted with its basis through the
law-79 machinery · **visible and CHANGEABLE at the admin sign door**, `content_hash` freezing at
signature. `prepayment_target_underivable` is the no-plausible-account arm, never the default path.
**The service-period TERM is unchanged** — human-keyed interim, OQ-4 stands, Annex C is the
automation train.

**F2 wall 3 is CONDUCTOR-IMPLEMENTED, pending the owner's eyes — flagged, not folded silently.**
The owner ruled the account "visible and CHANGEABLE at the admin sign door". The design implements
*changeable* as **decline-and-re-propose**, never edit-at-signature, because what the admin signs
must be byte-identical to what was proposed and receipted — a sign-time edit would let a signature
attest to content no receipt describes, and it would require touching the sign door that R6 keeps
shut. *Visible* is implemented literally, and needs `_adj_template_json` to gain the schedule and
the account projection, which is why that body is explicitly in PR-2a scope. **The conductor is
surfacing this form to the owner in the next batch as the implementation of his ruling**, so he
should see the full price of the alternative rather than a partial one. If he reads "changeable"
as **edit-at-signature**, FIVE things move, not three:

1-3. §5.3 wall 3 and W39's third sub-cell are rewritten, and NON-GOAL 2
   (`sign_adjustment_template` untouched) comes back into question.
4. **`clara.sign_adjustment_template` becomes a FIFTH D1 body — and a HOT one**, run at every
   signature on the estate; §9's window note and its correctness headline move with it.
5. **`clara._tf_adjustment_template_transition` (0045:1323-1350) must be recut FIRST.** It freezes
   every column outside the eight lifecycle stamps and raises CLR38
   `adjustment_template_immutable` on any other change — so today a sign-time edit is not merely
   forbidden by policy, **the storage layer refuses it**, and enabling it means widening the
   immutability guarantee the whole propose→sign→post chain rests on.

Item 5 is why §5.3 argues the storage layer first and R6 second: decline-and-re-propose is not a
policy preference laid over a permissive schema, it is what the schema already enforces.

**The maxim both rulings turn on, recorded where a builder will meet it (§5.0): *facts get
anchored, judgements get receipted.*** It is the line that explains why §4's carrier and §5.3's
account — superficially both "something Clara needs that the DB does not have" — are designed as
opposites.

## 14 · Acceptance

1. Full estate suite green on an **instance-unique** throwaway rig (torn down after) with a
   differential-control baseline, plus `pnpm lint`, `pnpm typecheck`, `pnpm build`.
2. **Deploy-onto-existing at the TRUE merge frontier** — the on-disk chain including 0137 and 0138,
   then this file at its claimed number; prestate holds, tail passes. Every prestate pin re-derived
   by **rig replay** against `pg_get_functiondef` — never from this document's line cites, never
   from a migration's file text.
3. Every cell in Annex A green, and **every mutant re-run after the fix**. W36/W37 (F1
   null-stability) and W41-W43 (the congruence constraint) are green **before the ceremony window
   opens**, not after — they are what the four-body correctness claim rests on.
4. The three flip-counts move together: allowlist 12→13, rig-meta's wake roster 12→13, the
   parked-absence census inverted to presence. A positive read of the `close_prep`
   `wake_engine_sources` row at `enabled = false` is recorded in the tail notice.
5. The fix diff goes back to the **same** reviewers for the targeted verification rung — the fix
   round is judgement logic (review law 1).
