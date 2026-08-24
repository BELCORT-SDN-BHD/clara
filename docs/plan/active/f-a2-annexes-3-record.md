# F-A2 annexes 3 — vocabulary, chains, and the record

> Companion to `f-a2-agentic-posting-design.md` (**v6.1, 2026-08-22**). **E** the refusal
> vocabulary, receipt shape and columns · **F** the `posted` chain · **G** the change log ·
> **H** the decision register **and the owner-question closure (H.2)**. **Annex I** (B4's formulas)
> **moved to `f-a2-annexes-1-estate.md` at v6.1** for the 500-line ceiling — its label is unchanged, so
> every "Annex I" citation still resolves. Siblings: `f-a2-annexes-1-estate.md` (A, B, I) and
> `f-a2-annexes-2-mechanics.md` (C, D).

---

## Annex E · The closed refusal vocabulary

### E.0 · The receipt shape, and why the vector replaces the estate's ordering

```json
{ "entry_id": "…", "posted": false, "status": "draft",
  "refusal": { "tier": "B", "reason": "not_corroborated" },
  "rung_vector": { "B1": "pass", "B2": "fail", "B3": "not_evaluable", "…": "…" },
  "post_receipt_id": null,
  "verdict": { "corroborated": false, "extraction_id": "…", "total_cents": null,
               "total_fact_hash": null, "type_code": "…" } }
```

`verdict` and `rung_vector` record **what the DB saw**, not what the model claimed — the law-27(2) instrument and §6's
per-document input. **The all-rungs vector is a deliberate semantic improvement over `0046`'s ordering, not
byte-equivalence, and the design says so.** `0046:1128-1140` placed `not_corroborated` **LAST**, in its own words:
*"Placed LAST so every specific rule-gate skip … still fires first for a shaped-but-non-corroborated draft."* That
reasoning exists to keep a **single-reason** receipt informative. The vector **subsumes** it: at 0/33 corroboration a
first-fail-wins ladder returns one distinct value across the entire corpus and says nothing about B3..B14, which is
exactly the instrument §6 needs. **The fail-closed direction is unchanged** — an empty vector is still the only thing that
posts.

### E.1 · `clara.entry_post_receipts`, the full column list (design §3.3)

```
id                        uuid primary key default gen_random_uuid()
firm_id, client_id        uuid not null
entry_id                  uuid not null
  constraint fk_entry_post_receipts_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id)   -- the 0011:904-905 idiom
acting_actor              uuid not null references clara.users(id)   -- clara.agent_user_id(), 0002:334-335
on_behalf_of              uuid references clara.users(id)            -- NULL on autodraft BY CONSTRUCTION
via_wake_kind             text not null check (via_wake_kind in ('autodraft','interactive'))
model_snapshot            jsonb not null check (jsonb_typeof(model_snapshot)='object'
                            and btrim(coalesce(model_snapshot->>'provider','')) <> ''
                            and btrim(coalesce(model_snapshot->>'model','')) <> ''
                            and btrim(coalesce(model_snapshot->>'version','')) <> '')
rationale                 text not null check (btrim(rationale) <> '' and length(rationale) <= 4000)
gate_verdicts             jsonb not null check (jsonb_typeof(gate_verdicts)='object'
                            and nullif(btrim(coalesce(gate_verdicts->>'extraction_id','')),'') is not null)
approval_arm              text not null      -- 'agent_unattended' on this lane
maker_active_at_approval  boolean            -- NULL where no director exists; never false-by-inference
op_key                    text not null
created_at                timestamptz not null default now()
constraint uq_entry_post_receipts_entry unique (entry_id)
```

**R-3, and why it mattered.** v3 wrote the `model` conjunct as `btrim(coalesce(model_snapshot->>'model','''')) <> ''` —
**four apostrophes**, the SQL literal `''`, so the conjunct read *"the model name, defaulted to the two-character string
`''`, is not empty"* and **always passed**. That is the wall recording **which model posted** — law 71's core. The default
is `''` (two apostrophes), as in its two neighbours.

**`via_wake_kind` admits `'autodraft'` and `'interactive'` only** — not `'interactive_client'` — because per R-1 the
pinned kind is minted **solely for `wake_open_question`** and never carries a post (§D.2). A post arriving under the
pinned kind is a contract violation and the CHECK says so. **This is unchanged by D34:** folding chat parity back into the
train changes *when* the kind is minted, never *what it may do*.

**`gate_verdicts` requires a non-blank top-level `extraction_id`**, so the T3 trigger's pin can never read NULL from a
well-formed row — the CHECK is the structural half of C.7's must-fail cell.

**Why a separate table, and not either of the two obvious homes** *(moved here from design §3.3 at v5, reasoning
unchanged)*. **Not a jsonb column on `journal_entries`:** `_tf_entry_immutable`'s draft→approved allow-set is **exactly
eight columns** (`0016:4958-4960`) checked as a whole-row diff, so a new column needs a 9th member — a CoR on a guard plus
a true-up of its diff test, to store something no guard reads. **Not `journal_entry_revisions`:**
`uq_journal_entry_revisions_token unique(entry_id, revision_token)` (`0011:903`) versus a token that cannot rotate at
approval — a `revision_no=1` row would collide, and a fresh uuid would make the column lie (`0016:4913-4921`).

Append-only via `_tf_append_only` + a no-truncate trigger, the `0011:1084-1086` idiom. **No role holds DML** — the row is
written only by `clara._agent_post_entry_core`, inside the posting transaction, and the `t_je_agent_post_receipt` deferred
trigger makes its absence fatal.

### E.2 · The token sets

**Tier B (explicit, receipt, all THIRTEEN rungs evaluated).** `settlement_kind_human` · `not_corroborated` ·
`anchor_unbound` · `anchor_untied` · `amount_conflict` · `human_override_present` · `unverified_evidence` · `facts_moved`
· `open_question_blocks` · `supplier_leg_shape` · `sales_leg_shape` · `generic_control_leg` ·
**`generic_on_directional_document`** (B15, GB-1).

**`facts_moved` (B8) — the SCOPE, and the two conjuncts it deliberately does NOT carry (R-L6).** Scoped to
**fact-generation citations, named POSITIVELY**: every `entry_evidence` row whose extraction is an `invoice_facts` ·
`llm_text_facts` · `llm_vision_facts` generation must equal `v_state->>'extraction_id'`. **`ocr` and
`structured_parse` are NOT members** (law 72) — an OCR region can never carry `field_path='invoice.total'`
(`egress.mjs:146,163`), so scoping to every citation row is a dead lane, not a wall. **No OCR-lineage conjunct:** a
re-OCR supersedes within its own kind (`0089:267-284`) while the witness `input_pin` still names the old one, so
lineage would refuse lawful posts. **No `superseded_by` read:** governance is the `extracted_at` clock
(`0101:479-489`); two rules for one question drift (`0101:57-64`). **`not_evaluable`** — no `document_id`, a `'{}'`
fact state, or a cited TEXT row resolving to no generation (`0092:210-217`) — never `pass`.

**Tier-D vocabulary — recorded in `last_refusal`, NEVER a receipt (GM-3).** The six belt tokens left Tier B when B12/B13
were cut on correctness grounds: `fa_belt_unregistered_movement` · `fa_cost_adjustment_deferred` ·
`fa_k_gl_balance_on_enrolled` (`0041:2717-2736`) · **`advance_mirror_unregistered`** · `advance_movement_unregistered` ·
`advance_application_missing` (`0043:3146-3172`). They are still a **closed, named set** — a Tier-D abort must land its
`(errcode, reason)` in `last_refusal` verbatim, and an unnamed reason is a finding — but they arrive as a **task
`failed`**, not as an admission verdict, so no rung vector carries them.

**B13's token stays SPLIT by axis (M-5), and the split survives the move to Tier D.** `advance_movement_unregistered` is
**two walls under one string** in the belt: the **mirror case** (`0043:3146-3155`, a reversal unwinding a leg the register
never held, carrying `'axis':'unregistered_mirror'` in its own detail) and the **general case** (`0043:3168-3172`).
`last_refusal` reports them separately, because a record that cannot tell a bad reversal from an unregistered disbursement
names a symptom, not a wall. **`advance_mirror_unregistered` and `advance_application_missing` are UNREACHABLE on this
path and are declared so rather than cell-forced** (law 31): opening entries are refused at `0037:1781-1786` (CLR31,
K-family-only) and a reversal is not an agent draft under A8. C.3 carries them as declared-unreachable rows.

Each rung's value is `pass` / `fail` / **`not_evaluable`** — the third exists so an absent input can never read as a pass
(law 68). **No consumer may test for `'fail'`** — design §3.2's consumer contract.

**Tier C — `(errcode, reason)` PAIRS ONLY. No wildcards. No errcode-only members.** **The per-site table lives in design
§3.2 and STAYS there (M-6)** — moving it to an annex would undo the fold that put it in the reader's path. This section
carries only what it excludes, and why. **Explicitly NOT members, each with its ground.** **`(CLR10,
settlement_not_autopostable)`** — typed (`0037:1829`) but **dead on this lane**; B1 is the live wall, and listing a wall
that can never be asked is what law 31 forbids. **`(CLR10, already_reversed)` ×2 (`0037:1836`, `:1841`) — LEFT THE SET AT
THE GATE**, on that identical reasoning: A8 admits only an untouched agent draft in `draft` status, so the
already-reversed arms are unreachable from this lane. v4 listed them; v5 does not. *(Their errcode is still shared with
`0037:1778`'s op-key raise, which remains the standing illustration of why errcode-only matching would swallow unrelated
walls — that argument is kept in design §3.2's table, on the `customer_identity_name_only` row.)*

**`(CLR26, open_question_race)` — UNREACHABLE BY LOCK ORDER (GM-7).** With Tier A holding the filing `FOR SHARE`, the
vendor advisory `203005003` and the client advisory `203005004` before B9 reads `_open_question_blocks`, the delegate's
CLR26 re-check (`0037:1909-1920`) cannot fire from this lane, so law 31 excludes it. **The disposition is recorded here
rather than left as an absence**, and the named fallback if the vendor-lock extraction is dropped is to **admit `(CLR26,
open_question_race)` as a pair**, which costs a `reason` added at `0037:1918` (§D.7). That is a real behavioural
difference — a race becomes a typed refusal instead of being impossible — so it is a decision, not an implementation
detail, and **C.4 carries the two-session race cell either way**.

**`(CLR23, *)`** — the wildcard is **deleted**: **eight** bare CLR23 raises inside `_assert_supplier_bill_shape_at`
(`0036:625, 654, 657, 660, 675, 692, 710, 845`) plus the sales analog are reachable through the delegate, and converting
them would give one defect two settle outcomes decided by nothing an operator can see. *(Corrected at the gate: v4 counted
seven and its line cites were each off by 1-3; `0036:710` was missed entirely. `0036:625` is the prologue GB-2 extracts.)*
**`(CLR08, *)`** — the immutability guard never converts. **Every Tier-D abort** — an internal-contract violation that
settles `failed`. **The set may only GROW, and an unlisted pair propagates as a task failure.** C.4 has the cell.

### E.3 · The two structural walls, and the three dropped identity channels (design §3.3.2)

**`t_je_agent_post_receipt`** — a deferred constraint trigger on the draft→approved transition, the `0009:533-537` shape.
**ARM-0 first (law 68):** an unresolvable `checker_actor` refuses CLR08. That arm is **unreachable** — `checker_actor` is
FK-bound at `0003:117` and `0016:4950-4952` already refuses NULL — **and the design declares it rather than banking on
it** (law 31), because an ARM-0 that is merely believed unreachable is the shape that admits on absence. Then the live
arm: `is_agent` → require **exactly one** `entry_post_receipts` row. *Verified inert on all 20 existing call sites.*

**A8's bytes.** `maker_actor = clara.agent_user_id() AND last_human_editor is null`. `revise_entry` sets
`last_human_editor` and rotates the token at `0016:4909-4913`; **it strips and re-stamps `amount_exception` and can write
`amount_override`** — the gate's correction — but it need not, and a plain renumbering writes only `duplicate_override`
into `flags`, which B6 does not read as a number judgement. So **B6 catches the override-bearing revisions and A8 catches
all of them**; the correction strengthens the second conjunct rather than weakening it.

**The maker/checker family, at the bytes (design §3.3.1).** `0037:1992-2010` carries three CLR05 arms. Every agent draft
has `last_human_editor = NULL` (`0016:4087`), so **arm 1 fires** and demands a non-blank attestation the DB does not
validate, while `eligible_checker_count`'s `u.is_agent = false` (`0004:81-86`) makes `distinct_checker` **unreachable**
for an agent. Hence the fourth arm: `approval_arm='agent_unattended'`, no attestation written.

**The three dropped identity channels, closed by the 8th body.** `_approve_entry_core` hard-codes `null` for
`on_behalf_of` and `via_wake_kind` in `_audit` (`0037:2102-2106`) and passes an empty payload to `_append_event`
(`0037:2111-2112`), while `_draft_entry_core` passes both through (`0016:4237-4239`). The 8th body reads them from
`p_ctx`, and the event names the `post_receipt_id`. C.6 has the regression cell.

---

## Annex F · The `posted` outcome chain (design §3.8)

v1 said two CHECKs. The truth is a **FIVE-layer chain plus six further sites** — GM-8 added the fifth at the gate — and a
fix at any one layer alone either lies or raises.

| # | site | today | what a naive `posted` does |
|---|---|---|---|
| 1 | `sweep_run_items.outcome` CHECK, `0011:734-735` | 5 values, **no `failed`** | CHECK violation — loud, and the only honest failure in the chain |
| 2 | `settle_autodraft_task` guard, `0036:864-868` (**not a CHECK**; an IF/RAISE) | 4 values, **includes `failed`** | CLR10 unless widened |
| 3 | `v_item_outcome` mapping, `0036:979-980` | `case p_outcome when 'drafted' … when 'noop_existing' … else 'skipped_lane' end` | **silently buckets `posted` → `skipped_lane`** |
| 4 | `sweep_runs` finalize bucketing inside `clara.reconcile_sweep_runs()` (`0011:2709`), at **`0011:2754-2762`** *(not `0036:2755-2759` — P4; single occurrence, never CoR'd)* | counts `drafted` / `skipped_lane`+`noop_existing` / `refused_budget`+`refused_attempts` | a `posted` row is counted in **none** of the three; the run summary under-totals against `expected_count`. **PR-1's fix is a FOURTH counter — `sweep_runs.posted_count`, never a fold into `drafted_count` (R-L5)** — so finalize reads **drafted + skipped + refused + posted = expected** |
| 5 | **`ck_sweep_run_items_shape`** *(GM-8 — the layer v4 missed)* | forbids a non-`'drafted'` outcome from carrying an `entry_id` | **widening only the outcome CHECK and writing `entry_id` for a posted row is a CONSTRAINT VIOLATION.** The row cannot both record its entry and satisfy the shape until this layer moves too — which is why C.9 forces a posted settle *with* its `entry_id` and keeps a must-fail half against the un-widened constraint |

**Six further `posted`-sensitive sites, four of them found by the v2 re-derivation:**

| site | today | consequence |
|---|---|---|
| `0036:948` | `if p_outcome='drafted' and (p_entry is null or not exists(…))` | a `posted` settle **skips the entry-exists validation entirely** |
| `0036:978` | `last_refusal = case when p_outcome='drafted' then null else p_refusal end` | a posted task **keeps a stale refusal** |
| `0036:986` | `case when v_item_outcome='drafted' then p_entry end` | posted rows get **NULL `entry_id`** |
| `0036:987` | `case when v_item_outcome<>'drafted' then coalesce(p_refusal, jsonb_build_object('clr','CLR29','reason',v_item_outcome)) end` | a posted row carries a **fabricated CLR29 refusal token** — **false data, not merely missing** |
| `0011:2642-2652` | the **5-arity overload's own copy** of the guard (0047 proves both overloads coexist) | CLR10 on the other overload |
| `autoDraft.v8.impl.ts:347-350`, `:382` | `classifySettleReceipt`'s six-shape fail-closed classifier + the settle call | **inside the freeze** → `autoDraft_v9` territory |

**Why §6 does not read this chain for its POSTED count.** It reads `clara.entry_post_receipts` — one row per posted entry,
`unique(entry_id)`, written inside the posting transaction — and **cross-checks** it against
`sweep_run_items.outcome='posted'`. **A disagreement between the two is itself a finding**; C.9 asserts they agree.

---

## Annex G · Change log

### v1 → v2 (the R1 adversarial review: CONDITIONS — 6 blockers, 7 materials)

**Folded (F).** **F1** Tier D re-derived and re-scoped to a `pg_trigger.tgdeferrable` replay. **F2** the Tier-C classifier
keys on `(errcode, reason)` pairs only — no wildcards, no errcode-only members — and PR-1 adds the missing `detail`
reasons. **F3** a new Tier-B rung refuses settlement kinds unattended (WCA-R6 stands until F-A3). **F4** the chat
fail-closed path designed for real; **D11's estate-wide "law" phrasing dies**, replaced by the narrow verified claim plus
§D.5's per-wall dispositions. **F5** N1/T3 corrected at the bytes (the 1-arity intermediate) and extended to the sales
arm. **F6** the `posted` outcome designed end-to-end (Annex F). **F7** B4-sales and B4-generic re-worded as new walls with
new formulas. **F8** Tier B evaluates **all** rungs; the receipt carries the full three-valued vector. **F9** 8th body,
with the 0040 marker dispositions. **F10** two missed censuses folded and the roster counts corrected. **F11** G-11 marked
PENDING-LIVE-READ. **F12** a cell per blocker; C.8 re-fixtured as agent posts. **F13** cite-drift nits. **F14** the WB-R2
assertion sites verified and dispositioned.

**Push-backs (P).** **P1** the review's own deferred list was short by five — the source census finds **eleven**
constraint triggers on `journal_entries`. **P2** T3's remedy is not BL-5's implied one: the receipt-keyed trigger pin
costs **zero** human-lane blast radius. **P3** `bank_rule_suggested` is not in the 0040 anti-revert list; F-A2 retires **3
names / 5 occurrences**, not four. **P4** the sweep bucketing is `0011:2754-2762`, and four *more* `posted`-sensitive
sites exist than either document listed, one of which writes **false** data. **P5 — REFUTED by the delta review**, see
below.

**Additions (A).** **A1** `mint_wake_credential` forbids `on_behalf_of` on `autodraft`. **A2** `x42-s5-helpers.mjs`'s
roster is migration-ledger-gated. **A3** the FA and advance belts already carry typed `detail` reasons. **A4** the chat
path needed a durable change too — *superseded by C-3*.

### v2 → v3 (the delta review: CONDITIONS — 3 blocking, 6 material, + M-7..M-10)

**F15 (C-1)** A8 gains `and last_human_editor is null`; **new OQ-6** on the categories that reach post ungated. **F16
(C-2)** the `gate_verdicts` shape stated with `extraction_id` **flattened**; the **receipt write contract** as an
invariant with its commit ordering; C.7's cell designated **must-fail** on a wrong accessor. **F17 (C-3)** the
durable-CHECK weakening **REVERSED** for the extend-only `interactive_client` kind; §D.2 becomes the census decision
record; the **fourth change** (the frozen infra file) named in the build sequence. **F18 (M-1)** `t_je_subledger_belt`
gets **B14** as a shape refusal. **F19 (M-2)** the bank-pending belt dispositioned unreachable + a forward obligation on
F-A3. **F20 (M-3)** the vector's **two durable homes**. **F21 (M-4)** the **consumer contract as a design law**. **F22
(M-5)** B13's token splits by axis. **F23 (M-6)** the Tier-C pair table **returns to §3.2**. **F24 (M-7..M-10, nits)**
`wb-s-seeding.test.mjs:217` moves to the **unconditional** breakage list; `:205` dispositioned as a **second zero-count
head**; §B.6 gains the **verbs-not-names** method header and `x42-producer-role.test.mjs`; `x42.prod-23` gains an inverted
twin; the WB-R2 count trued to **six**.

**Micro-corrections.** `bank_rule_suggested` goes **2 → 0** (both occurrences sit inside the deleted `if`-gate's `v_to`
text). The `x42-s5` cohort gate must use **`appliedStem`** (`:403`), never `applied("00NN_%")` — migration numbers are
claimed at merge.

**P5 REFUTED, and the lesson recorded.** My `relay-redrive-consumers.test.mjs` cites were each off by one; the reviewer's
`:21-27` span was exact. Cause: I counted forward from a `sed` window's start instead of reading the numbers the
instrument prints. **Line numbers come from `cat -n` or `grep -n`, never from arithmetic on a window.** P1, P3 and P4 were
conceded by the review.

### v3 → v4 (final verify: APPROVED-AS-DESIGN subject to R-1..R-3, all mechanical)

**F25 (R-1) — `interactive_client` is NARROWED to one call path.** It is minted **solely for the fail-closed
`wake_open_question` call**; every other chat scoped read and write, **including the post**, keeps plain `interactive`
with its NULL-client guarantee. This is what makes census findings 1-3 genuinely not fire rather than merely be argued
around. **Stated in §D.2 and in the PR-2 build step**, with the forward clause: *if chat ever goes client-scoped
throughout, that is a future decision which must re-open the census table and accept findings 1-3 as deliberate behaviour
changes.* **Honest footnote added:** the mint verifies **firm-congruent and active**, not per-client human authorisation —
matching the estate's existing firm-scoped model, opening nothing new. **F26 (R-2)** §D.5's client-binding CHECK row
corrected to **STANDS — untouched; the KIND CHECK (`0011:623-624`) is extended instead**. **F27 (R-3)** the
`model_snapshot` CHECK's four-apostrophe default fixed to `''` — as written the model conjunct **always passed**, and it
is the wall recording WHICH MODEL posted. **F28 (M-1 nit)** the "satisfied by construction for the coded kinds" claim now
cites `clara._subledger_on_approve` (`0037:1050-1274`, *"called from ALL FOUR approve paths"* `0037:1032`, invoked at
`0037:2028`) **and gets a C.3 cell**, because "almost certainly" is not this design's standard. **F29 (pointer nits ×5)**
`0040:7117`→`7115` · `ck_wake_credentials_client_0011` is `0011:625-628` · the PIN BLOCKER is `0011:1980-1983` · the
`rule_proposal` exclusion is `0012:100` · §B.4's singular cells-floor line now names `x42.prod-23`, `x42.prod-25` and
`x42-producer-role.test.mjs`.

**F30 — OQ-4 RULED (owner, 2026-08-20): the three-exits shape.** A8 **stands**: unattended posting is the agent's own
**untouched** derivation only. The two open exits are designed in §3.3.3, and the **forbidden middle** is named —
pass-through of human numbers under agent identity with nobody's approval on record. **F31 — OQ-6 RULED: option A, the
category gate is NOT inherited.** `is_year_end` and `tax_affecting` entries post unattended; grounds and the honest cost
line in §5.

**F33 — OQ-6's SUPPLEMENTARY NOTE (owner, 2026-08-20, in-session): the HUMAN lane's category gate STANDS, unchanged.**
OQ-6 freed the **agent** lane from the `is_high_stakes` category gate on `is_year_end` / `tax_affecting`. It did **not**
touch the human lane's distinct-checker gate on the same categories, and the owner's supplementary ruling re-confirms that
the two lanes are treated differently **on purpose**. Three asymmetries carry it. **(1) A second party is automatic on the
agent lane and manufactured on the human one:** the downstream checkpoints that justify freeing the agent — close keys ②③,
F-T3's e-filing review — give an agent-posted entry a reviewer who is **never** its maker, by construction, while on a
staffed human lane the per-entry gate produces **per-entry second-party evidence** a diffuse close review does not. **(2)
The threat models differ:** the human gate's is **segregation of duties**, individual error *and* individual dishonesty —
neither applies to the agent, whose every post carries a DB-observed verdict, a rung vector and a model stamp, and a
control aimed at an absent risk is friction, not control. **(3) The costs are asymmetric:** on the agent lane the gate
**breaks unattended flow**, the whole point of the lane; on the human lane it is **one click inside an already-attended
flow**, degrading gracefully in solo firms to a single typed attestation (`0037:1993-1997`, live-proven at BEE).

**Registered, not built:** this is ultimately a **firm-governance dial** — the close-keys authorization-list precedent is
the shape — and it **MAY become per-firm configurable** later. F-A2 builds no such switch. **The charter's "human lane
unchanged" scoping is thereby re-confirmed, not amended.**

**F32 — the annexes split three ways** (`-1-estate`, `-2-mechanics`, `-3-record`) and the main doc brought under **500
lines**, the repo's mechanical file-size limit. Protected from compression, per the reviewer's named list: the **Tier-C
pair table stays in §3.2** · **A8's second conjunct keeps its REASON**, not just its predicate · the **`gate_verdicts`
flattening keeps its WHY** (the silent-NULL argument) · **C.7b's three per-tier zero-row cells stay three** · **§D.2's
census findings keep their bytes**.

### v4 → v5 (the PR-0 gate: 3 blockers, 11 materials — record: `f-a2-pr0-gate-record.md`)

**The gate ran 2026-08-21/22 on two legs** — the independent judgement-logic review (law 1; eight fresh-context lenses,
every finding adversarially verified) and the cross-model adversarial pass (law 28; GPT-5.6-sol read-only, four findings,
each re-verified by an independent Claude lane at the bytes). **Verdict: the SEAMS hold; three blockers and eleven
materials bind the build; PR-1 is severed.** What HELD is recorded too, because it is settled and should not be re-argued:
the **S1 seam**, **T3's receipt-keyed pin (all seven attacks refuted)**, concurrency/rollback/replay, the three owner
rulings' mechanical translation, post-ceremony drift, and the retirement inventory (exact but for two gaps).

**F34 (GB-1) — a NEW Tier-B rung, `generic_on_directional_document`, added as B15.** A NULL `coding_kind` entry may not
anchor to a document whose direction resolves. The hole: `coding_kind` is a model-supplied input, so **the kind selects
which walls bind**, and a corroborated supplier invoice drafted generic as `Dr Expense / Cr Bank` passed **all fourteen**
of v4's rungs — a wrong post with the payable suppressed, priced nowhere. **Added at the end; nothing renumbered.** §3.2 ·
C.14's two cells · PR-2 must widen `allowedCodingKindsForDirection` **deliberately** (§5).

**F35 (GB-2) — B10/B11 re-cut onto the PROJECTED state.** As written they refused **100% of agent sales posts, with the
SUPPLIER token**, because the live supplier floor's prologue raises CLR23 on any NULL-counterparty control leg *before*
its kind gate while the counterparty is stamped inside the delegate. PR-1 extracts
`clara._assert_control_leg_counterparty_at(p_entry, p_projected)`; the floor becomes a thin delegate passing NULL. **New
§D.6**; the floor joins the D1 list; §3.4's draft copies pass the same projection.

**F36 (GB-3) — chat parity SEVERED to its own follow-on PR.** `ck_wake_credentials_client_0011` is itself a closed-world
enumeration and `mint_wake_credential` carries a second kind gate, so `interactive_client` was **unmintable** as designed
and both failure modes push a builder toward the weakening C-3 reversed. **New §D.2c** carries the obligations plus the
frozen-infra change; §3.7.2 compresses to the severance; C.13 is annotated as the follow-on PR's battery. **R-1 itself was
verified sound.** *(The severance half was overridden by the owner at v6 — F51; GB-3's correction stands.)*

**F37 (GM-1) — B4-sales re-derived against `0022:714-930`.** v4's `0016:2100-2111` was superseded seventy migrations ago
and its formula was arithmetically false on any rounding invoice, in both signs. Annex I carries the corrected tie set,
the fact-side `rounding_cents` rule, the credit-note mirror and the supplier asymmetry; C.3's self-referential cell
becomes a **differential trio**.

**F38 (GM-2) — the nil-tax blindness gets a named successor.** B4-sales' component tie evaluates `not_evaluable` where the
nil-tax arm withholds components (law 68), and B.1 gains an `account_mismatch` (`0046:1092`) disposition row naming that
tie as its successor.

**F39 (GM-3) — B12/B13 CUT on correctness grounds.** Their pre-checks refused the two most common LAWFUL shapes on their
belts; Tier D was always their honest home. §D.1 rows re-dispositioned, six tokens moved to E.2's **Tier-D vocabulary**,
C.3's belt cells re-cut as Tier-D cells.

**F40 (GM-4) — D25 re-grounded; B14 stands.** The hook **does** materialise open items for a NULL kind (`0037:995-996`
classifies it `'adjustment'`), so v4's stated reason was false at the bytes. B14's surviving ground: a generic entry's
weak anchor cannot corroborate a subledger consequence, and WCA-R6 keeps settlement judgement human until F-A3. §D.1's
belt row corrected too.

**F41 (GM-5, GM-6) — two Tier-C pairs ADDED.** `(CLR23, registration_conflict)`, which **pre-empts** the listed
`counterparty_landscape_moved` site, and `(CLR10, customer_identity_name_only)` — hard constraint 12's own wall at
`0062:196-243`, **already typed, zero body edits**. C.4 forces both.

**F42 (GM-7) — the B9 check-then-act window closed by LOCK ORDERING, not a pair.** Tier A takes the filing `FOR SHARE`
plus advisories `203005003` / `203005004` before B9; CLR26 becomes provably unreachable and law 31 excludes it, with the
disposition and the fallback pair recorded in E.2. **New §D.7**; C.4 gains the two-session race cell.

**F43 (GM-8) — Annex F is FIVE layers.** `ck_sweep_run_items_shape` forbids a non-`'drafted'` outcome carrying an
`entry_id`; C.9 extended with the must-fail half.

**F44 (GM-9) — B.9 gains the explicit numbered D1 list**, recounted after severance (**eight CoR'd live bodies and one
ALTER TABLE** at v5; ten bodies and three DDL items at v6 — F51), and §3.5 cites the count that list prints instead of a
label enumerated nowhere.

**F45 (GM-10) — OQ-4 exit 2 has no door, and the door becomes PR-2 work.** `entry.revised` re-admits nothing, and a
post-withdrawal sweep is refused `already_done` by `0053`'s gate. §3.3.3 and §D.3 corrected; C.14 gains the paired cell;
§7 registers the gap. **The ruling is untouched.**

**F46 (GM-11) — the `kb_rule_proposal` part type joins the retirement checklist** (B.6), following its three retiring
verbs across catalog, card and tests.

**F47 (the width ruling, record §4) — PR-1 severed into a THREE-file, one-window PR.** Chat parity out, B12/B13 cut, the
`posted` chain its own file; a separate earlier ceremony was weighed and **declined**. §5 rewritten; §7's width risk
re-stated as the single window. *(Chat half overridden at v6 — F51.)*

**F48 (nits, folded without argument).** `(CLR10, already_reversed)` ×2 leaves the pair set into E.2's exclusions (law 31)
· E.2's bare-CLR23 census corrected to **eight** raises at `0036:625,654,657,660,675,692,710,845` · Annex I's supplier
cites → `0016:4137-4151` and `0036:831-847` · B.3's `appliedStem` cites re-trued (declared `:417`, used at `:431`/`:433`,
comparison set `:420`) and B.2's roster span → `:161-203` with `_ocr_sales_floor` at `:169` · `x1-helpers.mjs` fail-soft
cite → `:390-392` · `revise_entry` also strips/re-stamps `amount_exception` and can write `amount_override` (**A8's
reasoning survives, stronger**) · `advance_mirror_unregistered` and `advance_application_missing` become
declared-unreachable rows, not forced cells · C.1's `'proactive'` cell re-cut as a **refusal attempt**, not a roster read
· §3.7.2's allowlist-row cite → **`0011:3910`** (`:3909` is autodraft's) · §D.3's wording per GM-10.

**F49 — a THIRD method lesson.** *A body's live tip is found by CoR lineage, never by the migration that first created
it.* GM-1 cost seventy migrations of drift; the two existing lessons stand.

**F50 — relocations forced by the 500-line limit, and the protected list held.** E.1 absorbs the two rejected receipt
homes, **E.3** the structural walls' bytes and the maker/checker family, **C.17** law 29's six acceptance obligations,
**H.2** the open owner questions — each with a pointer left in the main doc. **F32's protected list was honoured**: the
Tier-C pair table stays in §3.2, A8's second conjunct keeps its reason, the `gate_verdicts` flattening keeps its why,
C.7b's three cells stay three, §D.2's census findings keep their bytes.

### v5 → v6 (owner ruling, 2026-08-22: chat parity returns to the train)

**F51 — 方案二 RULED (owner, 2026-08-22, in-session): chat parity FOLDS BACK into the main train, overriding the chat half of
D29.** The owner was briefed in plain language on GB-3 — why the credential is unmintable as v4 wrote it, and why the fix
*extends* two closed-world enumerations rather than performing the weakening C-3 reversed — and on both options with costs
stated: **(1)** keep the severance, so PR-1 stays narrower but the chat lane cannot raise a typed open question until a
later PR, leaving the contract's *"draft **or** a typed open question"* half-met on that lane throughout; **(2)** fold it
back, meeting the contract at cutover at the price of a wider single D1 window. **The owner ruled (2); the orchestrator's
recommendation was (1) and is on file here as dissent**, per the house dissent-then-execute pattern.

**What moves.** GB-3's three obligations become **PR-1/PR-2 BUILD** content: BOTH `wake_credentials` CHECKs extended (the
kind CHECK gains the name; the client CHECK gains a third disjunct, `interactive_client ⇒ client_id NOT NULL` with
`on_behalf_of` kept, the other three byte-identical), BOTH `mint_wake_credential` gates extended (the early kind gate
**and** the new per-kind arm), `wake_open_question` re-keyed onto the client pin, all SIX roster/census surfaces trued,
and the exactly-one-allowlist-row cell. PR-2 keeps the frozen `chatTurn.v10.infra` `_vN` minting the pinned kind for
`wake_open_question` **alone** — **R-1 unchanged**. Folded in §3.7.2, §5, §D.2, **§D.2c** (retitled), §D.5's three wake
rows, C.13 (back in this battery with new CHECK-swap and both-mint-gate cells), A.1 finding 7, and **B.9**, whose D1 list
gains `mint_wake_credential` and `wake_open_question` as rows 9 and 10 and prints **TEN CoR'd live bodies, one `CREATE
TABLE` and TWO ACCESS EXCLUSIVE constraint swaps**; §3.5 and §7 cite that count.

**What does NOT move, expressly.** **B12/B13 stay CUT** — GM-3 was a correctness finding, not a width one. **The `posted`
chain keeps its own migration file** (D29's other half). **The gate's findings are untouched**: GB-3 remains a confirmed
blocker and its correction is what makes the limb buildable. **D20 is trued** to drop its "severed at PR-0" clause, which
would otherwise contradict D34 in the register.


**F52 — OQ-2, OQ-3 and OQ-5 RULED (owner, 2026-08-22, in-session), each on its standing recommendation. §4 now has no open
questions.** **OQ-2 → D35:** `_draft_entry_core` stops writing `rule_decisions`; the table and its historical rows are
KEPT (a live FK at `0011:898`, and knowledge fuel); and **`list_review_queue.rule_backed` is REMOVED from the dashboard**
rather than rendered permanently false (law 27(2)) — B.6 carries the measured surface, plus two things the ruling
expressly does not reach (the DB projection, a read over KEPT history; and the lane-REASON `rule_backed`, which is
computation and gets a named PR-3 sweep). **OQ-3 → D36:** `preview_ocr_sales_evidence` retires with the floor, and
`tick_seeding_proposal` **re-points its output to a knowledge-layer artifact** — no more signed-`coding_rules` minting,
the admin's tick judgement landing as context-pack food (law 73), seeding UX unchanged. B.6/B.7's "rides OQ-3"
dispositions now resolve against it, and **`wb-s-seeding.test.mjs:217` still breaks unconditionally**: D36 settles what
the right comparator IS, not whether the cell breaks, and its own `:221-222` MUST-FAIL text still forces the N-2
adjudication. **OQ-5 → D37:** B4-generic adopted as the gate reshaped it, **both priced costs accepted knowingly**, **and
the measured size of both refused populations is published by §6/PR-4 — that measurement is part of the ruling**, kept
explicit in §6 and C.17.

### v6 → v6.1 (PR-1 build trues, 2026-08-22 — six orchestrator rulings under the owner's standing delegation, R-L1..R-L6, ledgered as D38-D43 for clock-out review; none reopens a law or an owner ruling)

**F53 (R-L6) — B8 RESOLVED from the sources: *"no citation names a SUPERSEDED fact generation."*** Scope =
fact-generation citations only, named positively, compared to `v_state->>'extraction_id'`; OCR/`structured_parse` out
of scope (law 72). **α scoping over β**, so a mixed-generation draft refuses — stricter, fail-closed — and non-vacuous
against A5, whose input is caller-supplied where B8's is not. §3.2's row + redundancy paragraph · E.2's scope note ·
C.3's five-cell set. *(The builder's 206/206 was the wrong population — lawful `model_read` OCR citations.)* **D38.**

**F54 (R-L1)** the retirement **claim split** — breeding-claim tests retire/re-point **in PR-1 with the excision**
(C.8's twins replace them, B.7's dispositions verbatim), verb-existence tests stay PR-3, and PR-1 owns the ~46 D11
chat-fixture trues and ~8 N1 re-routes (B.6). **F55 (R-L2)** lock order = the **delegate's own** — filing `FOR SHARE`
→ entry row → vendor `203005003` → client `203005004`; v6's order deadlocks ABBA against a concurrent human approve
(§D.7, D33). **F56 (R-L3)** the D1 list stays **TEN**, and the supplier floor's **body moves into
`_assert_supplier_bill_shape_at_projected`**, the public name a NULL-passing delegate (B.9, §D.6, D31). **F57 (R-L4)**
B7's amount-bearing evidence = `field_path='invoice.total'` (`0009:462-466`). **F58 (R-L5)** `posted_count` is a
**FOURTH** counter (§3.8, Annex F). **F59** ceiling relocations: **Annex I moves whole to
`f-a2-annexes-1-estate.md`** (label unchanged) · §D.7's fallback cost detail merges into E.2's CLR26 exclusion ·
§D.1's A3 sentence points at E.2's token list · battery trues in B.6/C.4/C.12 (`c4.bare-clr23` → the projected body ·
catalog-probed signatures · **`coa_accounts`**).

---

## Annex H · Decision register — the register of record

| id | decision | status |
|---|---|---|
| **D1** | Separate wake wrapper (S1) + ungranted core + the SHARED `_approve_entry_core`. | ruled here |
| **D2** | S2 refused (two lock orders; the divergence pulled inside one txn); S3 refused. | ruled here |
| **D3** | **The corroboration gate lives in the DB, in the post core, before the status UPDATE**; the runtime read stays advisory. | binding (orchestrator) |
| **D4** | **Four tiers; the boundary is the failure mode — EXCEPT B4-sales and B4-generic** (Annex I). **AMENDED at PR-0 (GM-3): B12/B13 are CUT to Tier D**, because a pre-hook evaluation of a belt predicate has the wrong inputs by construction and refused the two most common LAWFUL shapes on those belts. Their extraction is a future item that must design projected-state inputs first. | derived; **amended at the gate** |
| **D5** | **Tier membership is derived by rig replay from `pg_trigger.tgdeferrable`**, never a hand list. | derived |
| **D6** | **No wildcards and no errcode-only members in Tier C**; PR-1 adds the missing `detail` reasons. | derived |
| **D7** | **Tier B evaluates all rungs; the receipt carries the full three-valued vector** — a deliberate improvement over `0046`'s placed-LAST ordering, stated as such. | adjudicated |
| **D8** | **B1 refuses settlement kinds unattended.** WCA-R6 stands until F-A3. | adjudicated |
| **D9** | Acting identity rides `p_ctx`; **`on_behalf_of` is NULL by construction on autodraft** and the receipt records that rather than inferring a director. | derived |
| **D10** | **The agent takes its own arm — `approval_arm='agent_unattended'`, no attestation.** Human arms byte-untouched. | derived from OQ-1 |
| **D11** | **The narrow claim only:** `0046:2687-2696` re-cuts. The estate-wide "law" phrasing is **withdrawn**; other wake-kind walls carry dispositions in §D.5. | corrected |
| **D12** | **T3 recuts the two TRIGGER FUNCTIONS with a receipt-keyed pin** — zero human-lane blast radius, both arms fixed, delegates untouched. T1 fallback; T2 refused. | derived |
| **D13** | Receipt = a new append-only `entry_post_receipts` table; not a 9th allow-set column, not `journal_entry_revisions`. | derived |
| **D14** | Two structural walls: `t_je_agent_post_receipt` (ARM-0 first) and A8. | derived |
| **D15** | B6 — an entry carrying a human override flag is never posted unattended. | derived |
| **D16** | The pack's patterns block is **recomputed**, not accrued; historical rows kept, not read. | derived |
| **D17** | `WB_AUTHORITY_FNS` **and** `x42-s5-helpers.mjs`'s roster are EXTENDED — the latter as an **`appliedStem`-gated cohort**, never an unconditional append. | derived |
| **D18** | `journal_entry` generic enters the unattended lane, superseding 7A-R7 / ADR-063. | contract-ruled |
| **D19** | **The `posted` outcome is designed across all FIVE layers plus six sites** (GM-8 added `ck_sweep_run_items_shape`, which forbids a non-`'drafted'` outcome from carrying an `entry_id`); §6 reads `entry_post_receipts` and cross-checks. | derived; **extended at the gate** |
| **D20** | **Chat parity ships only with its fail-closed path — via a NEW `interactive_client` wake kind, extend-only, minted for the `wake_open_question` call ALONE (R-1).** v2's durable-CHECK weakening stays **REVERSED** (the census: `list_unassigned_documents` regresses, `coding_lane` widens silently and changes frozen `chatTurn_v12`'s answers with no byte change, 8 more readers flip, and it contradicts `0011:1980-1983`'s PIN BLOCKER). **AMENDED TWICE.** At PR-0 (GB-3 / record §4) the whole limb was SEVERED, because the client CHECK is itself a closed-world enumeration and `mint_wake_credential` carries a second kind gate — so as written the credential was unmintable and the design pushed a builder toward the weakening C-3 reversed. **PR-1 therefore extends BOTH CHECKs and BOTH mint gates, trues SIX roster surfaces and adds the exactly-one-allowlist-row cell; PR-2 carries the frozen `_vN` infra file** (§D.2c). **R-1's narrowing was verified sound and is unchanged.** **The owner reversed the severance on 2026-08-22 (D34): the limb rides PR-1/PR-2 in GB-3's corrected form.** | **reversed at C-3, narrowed at R-1, severed at PR-0, reinstated by D34** |
| **D21** | Retirement rides this item; the WB-R2 sites are re-pointed, never deleted. **AMENDED 2026-08-20 (ADR-0072 ①.2): the post-Window-A re-extraction is TWENTY documents, superseding the full-64 backfill** — too few to satisfy the fallback arms' *full-population* trigger, so by its own "whichever lands first" clause the arms retire, and **F-A10's terminal check closes, at the Wave-G reset**. | contract-ruled + owner |
| **D22** | `autoDraft_v9` keeps sending `pack_consumer='v25'` — a capability token, not a version assertion. | derived |
| **D23** | **A8 is `maker_actor = agent AND last_human_editor is null`** — "her own work, UNTOUCHED". `revise_entry` rewrites numbers without tripping B6, so the second conjunct is what stops the agent posting a human's figures unattended. **OQ-4's ruling confirms it and adds the two lawful exits** (§3.3.3). | derived (C-1); confirmed by OQ-4 |
| **D24** | **`gate_verdicts` flattens `extraction_id` to the top level and CHECKs it non-blank**, because a nested accessor read from inside the shape trigger yields NULL — exactly the unpinned behaviour T3 removes — **without failing anything**. The receipt is written only on a successful post, after the delegate, inside the Tier-C region. | derived (C-2) |
| **D25** | **B14 refuses the shape rather than pre-checking the subledger belt** — a generic entry carries no AR/AP control leg, which **narrows OQ-5**. **RE-GROUNDED at PR-0 (GM-4): v4's stated reason was false at the bytes** — `_subledger_classify_entry` ladder 5 (`0037:995-996`) classifies a NULL `coding_kind` as `'adjustment'` and the hook **does** materialise open items for its control legs, so the belt is not unreachable. **B14 STANDS on the reason that survives:** an open item is a claim about who owes what, a generic entry's anchor (B4-generic) is the weakest in the estate, **a weak anchor cannot corroborate a subledger consequence**, and WCA-R6 keeps settlement judgement human until F-A3. Over-strict is safe; with D30 it is coherent. | derived (M-1); **re-grounded at the gate** |
| **D26** | **The vector has two durable homes and no consumer tests for `'fail'`** — refusals in `op_receipts`, posts in `entry_post_receipts`; every consumer tests for `'pass'` and treats everything else as non-admitting. | derived (M-3/M-4) |
| **D27** | **OQ-4's three-exits shape:** the human lane posts human-edited drafts under human identity; the agent may **re-derive** and post her own conclusion under agent identity; the **forbidden middle** is pass-through of human numbers under agent identity. | **owner-ruled 2026-08-20** |
| **D28** | **OQ-6 option A: no category gate ON THE AGENT LANE.** `is_year_end` and `tax_affecting` post unattended, on the grounds that both carry mandatory downstream human checkpoints. **Supplementary ruling: the HUMAN lane's distinct-checker gate on the same categories STANDS unchanged** — three asymmetries (automatic vs manufactured second party · segregation-of-duties threat model · one click vs broken flow) in Annex G's F33, which also registers it as a future per-firm **governance dial**, not built here. | **owner-ruled 2026-08-20** |
| **D29** | **The PR-0 width ruling: PR-1 is SEVERED into three files in ONE D1 window.** **The chat half is OVERRIDDEN by D34 (owner, 2026-08-22) — chat parity is back in the train.** The other two halves STAND: **B12/B13 are cut** (D4, a correctness ruling the owner's decision does not reach) and **the `posted`-outcome chain becomes its own migration file** — reviewed and provable in isolation via C.9, inert until PR-2 emits `posted`. **A separate earlier ceremony was weighed and DECLINED:** a third window buys review isolation the file split already buys, at the price of another stop/start night with its reconciler-herd and zombie-pooler hazards. The train is design §5. | **orchestrator-ruled at PR-0; chat half overridden by D34** |
| **D30** | **B15 — a NULL-`coding_kind` entry may not anchor to a DIRECTIONAL document** (token `generic_on_directional_document`). `coding_kind` is a model-supplied input, so the kind SELECTS which walls bind; without B15 a generic-coded supplier invoice posts `Dr Expense / Cr Bank` past all fourteen of v4's rungs with the payable suppressed. **It lives in the ladder so it covers both lanes**, D18 survives, and PR-2's enum widening must extend `allowedCodingKindsForDirection` deliberately. | **derived (GB-1)** |
| **D31** | **B10/B11 evaluate the deferred shape floors on the PROJECTED state**, via a new callable `clara._assert_control_leg_counterparty_at(p_entry, p_projected)` extracted from the supplier floor's prologue — **and (R-L3, D41) the floor's own body moved into `clara._assert_supplier_bill_shape_at_projected(p_entry, p_projected)`, the public `_assert_supplier_bill_shape_at` left a thin delegate passing NULL** (the estate idiom). Without it the pre-checks refuse **100% of agent sales posts, with the SUPPLIER token**. Fallback: drop the pre-checks — the floors still run in the delegate, so the cost is evidentiary, not safety (§D.6). | **derived (GB-2)** |
| **D32** | **B4-sales ties against the LIVE floor `0022:714-930`, not the superseded `0016:2100-2111`:** receivable = `total_cents`; **income + tax = `total_cents` − `coalesce(rounding_cents, 0)`**, `rounding_cents` taken from the FACT side and never from the entry's own leg; the credit-note arm mirrors sign. Where the nil-tax arm withholds components the tie is **`not_evaluable`, never `pass`** (law 68), and it is the named successor to the retiring `account_mismatch` rung. | **corrected (GM-1/GM-2)** |
| **D33** | **The B9 check-then-act window is closed by LOCK ORDERING, not by a typed pair.** Tier A acquires the filing `FOR SHARE` and advisories `203005003`/`203005004` before B9, the three the estate already uses — **in the DELEGATE'S OWN order (R-L2, D40): filing → entry row → vendor `203005003` → client `203005004`, since the filing → client → vendor order v6 wrote inverts it and deadlocks ABBA against a concurrent human approve**; CLR26 then becomes provably unreachable from this lane and **law 31 forbids listing it**, with the disposition recorded in E.2 rather than left an absence. Named fallback if the vendor-lock extraction widens PR-1: admit `(CLR26, open_question_race)` as a pair, at the cost of a `reason` added at `0037:1918` (§D.7). | **derived (GM-7)** |
| **D34** | **Chat parity rides the main train (owner-ruled 2026-08-22, overriding D29's chat half).** PR-1 carries the `interactive_client` limb **CORRECTED per GB-3**: BOTH `wake_credentials` CHECKs extended — the kind CHECK gains the name, and the client-binding CHECK gains a NEW enumeration row *`interactive_client` ⇒ client NOT NULL, `on_behalf_of` kept*, with the three existing rows' semantics **byte-identical** (extend-never-weaken, stated in the PR against C-3's record) — plus **BOTH `mint_wake_credential` gates** (the early kind gate AND the new per-kind arm), `wake_open_question`'s re-key onto the client pin, **all SIX** roster/census surfaces, and the closed-world cell that `interactive_client` holds **EXACTLY ONE** allowlist row. PR-2 carries the new frozen `chatTurn.v10.infra` `_vN` minting the pinned kind for `wake_open_question` **ALONE** (R-1 unchanged). **The orchestrator's severance recommendation is on file as dissent** (Annex G, F51). | **owner-ruled 2026-08-22** |
| **D35** | **OQ-2 RULED (owner, 2026-08-22) — recommendation A.** `_draft_entry_core` **stops writing `rule_decisions`**; the table and its historical rows are **KEPT** (a live FK at `0011:898`, and knowledge fuel per KEEP-AS-HISTORY). **`list_review_queue.rule_backed` is REMOVED from the dashboard** rather than rendered permanently false (law 27(2)) — with the write stopped, no entry F-A2 posts can be rule-backed. The measured removal surface, and the two things the ruling does NOT reach (the DB projection, a read over kept history; the lane-REASON `rule_backed`, which is computation and takes a named PR-3 sweep), are in **B.6**. | **owner-ruled 2026-08-22** |
| **D36** | **OQ-3 RULED (owner, 2026-08-22) — recommendation A.** `preview_ocr_sales_evidence` (`0046:2010`) **retires with the floor**, and `tick_seeding_proposal` (`0017:4525`) **re-points its output to a knowledge-layer artifact**: no more signed-`coding_rules` minting, no `kb_rule.signed`; the admin's tick judgement lands as **context-pack food** (law 73) and the seeding UX is unchanged. Ground: leaving a live writer minting signed rules nothing executes would make *"the rules machine is retired"* **untrue in the data**. B.6/B.7's "rides OQ-3" dispositions resolve against this; **`wb-s-seeding.test.mjs:217` still breaks unconditionally** and its own MUST-FAIL text still forces the N-2 adjudication. | **owner-ruled 2026-08-22** |
| **D37** | **OQ-5 RULED (owner, 2026-08-22) — recommendation A.** **B4-generic is adopted as the gate reshaped it**: `sum(debit_cents)` = the verified `total_cents`, paired with **B14** (no AR/AP control leg) and **B15** (no directional anchor). **Both priced costs are accepted knowingly** — multi-entry / split-amount documents land as drafts, and a generic entry produces no AR/AP consequence. **The measurement is part of the ruling, not an optional extra:** §6 and C.17 bind PR-4 to publish **the measured size of both refused populations**, so the accepted cost is checked against reality instead of left an estimate. | **owner-ruled 2026-08-22** |
| **D38** | **B8 RESOLVED from the sources (R-L6) — *"no citation names a SUPERSEDED fact generation."*** Every `entry_evidence` citation whose extraction is a fact generation (`invoice_facts`·`llm_text_facts`·`llm_vision_facts`) must equal `v_state->>'extraction_id'`; OCR/`structured_parse` are out of scope (law 72). **α scoping is chosen over β** (verified-anchor-only): **every** fact-generation citation must name the current generation, so a **mixed-generation draft refuses**. **The accounting consequence, stated:** a re-extraction that keeps the total but moves the identity, the date or the invoice number can never post behind a stale citation — bought at the price of refusing a draft whose non-amount citations are merely older, which lands as a draft and re-cites. Non-vacuous against A5 because **A5's input is caller-supplied and B8's is not**. §3.2 · E.2's scope note · C.3's five cells. | orchestrator-ruled under the owner's standing delegation, 2026-08-22 — ledgered for clock-out review |
| **D39** | **The retirement CLAIM SPLIT (R-L1).** B.6 scheduled every retirement breakage for PR-3, but the breeding excision lands in PR-1 with the 8th body — so the ~40 tests whose CLAIM is breeding behaviour **retire or re-point IN PR-1, with the excision** (C.8's inverted twins replace them, B.7's per-site dispositions verbatim, nothing silently deleted), while tests whose claim is verb EXISTENCE stay PR-3. PR-1 also owns the ~46 D11 chat-fixture trues and the ~8 N1 fixture re-routes. Fail-closed; no law touched. | orchestrator-ruled under the owner's standing delegation, 2026-08-22 — ledgered for clock-out review |
| **D40** | **Lock order = the DELEGATE'S OWN order (R-L2):** filing `FOR SHARE` → the entry row → vendor advisory `203005003` → client advisory `203005004`. v6's §D.7 wrote filing → client → vendor, which **inverts the delegate's order and opens an ABBA deadlock** against a concurrent human approve holding the vendor lock and waiting on the client one. Taking the estate's own order makes the two lanes queue instead of deadlocking. §D.7 · D33. | orchestrator-ruled under the owner's standing delegation, 2026-08-22 — ledgered for clock-out review |
| **D41** | **The D1 list stays TEN, and the supplier floor's BODY moves (R-L3).** `(CLR23, registration_conflict)` and `(CLR10, customer_identity_name_only)` were **already typed at their raise sites**, so the two pairs GM-5/GM-6 added cost no extra CoR. Separately, the floor's body moves into `clara._assert_supplier_bill_shape_at_projected(p_entry, p_projected)` with the public `_assert_supplier_bill_shape_at` left a **thin delegate passing NULL** (the estate idiom), beside the new `clara._assert_control_leg_counterparty_at`. B.9 · §D.6 · D31. | orchestrator-ruled under the owner's standing delegation, 2026-08-22 — ledgered for clock-out review |
| **D42** | **B7's "amount-bearing evidence" is `field_path='invoice.total'` (R-L4)** — the only field `_write_entry_evidence` grants `provenance_tier='verified'` (`0009:462-466`), so the rung reads that row and no other. Review obligation carried into PR-1: confirm no second amount-bearing path exists on the supplier or sales shapes. §3.2's B7 row. | orchestrator-ruled under the owner's standing delegation, 2026-08-22 — ledgered for clock-out review |
| **D43** | **`sweep_runs.posted_count` is a FOURTH counter, not a fold into `drafted_count` (R-L5).** The finalize identity becomes **drafted + skipped + refused + posted = expected**; folding posts into drafted would make a posted run indistinguishable from a drafted one in the only summary §6 reads. §3.8 · Annex F row 4 · C.9. | orchestrator-ruled under the owner's standing delegation, 2026-08-22 — ledgered for clock-out review |
| **D44** | **B8 reports `not_evaluable` on ZERO in-scope citations (R-L20, amended 2026-08-23)** — the as-built extension beyond D38, RATIFIED. B8 = fail on a moved witness-generation citation · pass on a current-generation one · `not_evaluable` when the entry cites no in-scope generation at all (law 68: absence is never a pass). The v6.1 annex-2 text also claimed an OCR-only draft "posts clean"; that is FALSE at the bytes — such a draft carries no verified amount anchor and is refused upstream at B3 `anchor_unbound` / B7 `unverified_evidence`, so the OCR disjunct is REJECTED as fail-open. Annex 2 §B8 · C.9 · `f-a2-b8.test.mjs`. | orchestrator-ruled under the owner's standing delegation, 2026-08-23 — ledgered for clock-out review |

### H.2 · The owner questions — ALL RULED (closure note for §4)

**Nothing is open.** OQ-1, OQ-4 and OQ-6 were ruled 2026-08-20 (D27, D28, and §4); **OQ-2, OQ-3 and OQ-5 were ruled
2026-08-22, each on its standing recommendation — D35, D36 and D37 carry the rulings, their grounds and their
obligations.** Kept as a section only so a reader arriving from §4 finds the closure rather than a stale "open" heading.
