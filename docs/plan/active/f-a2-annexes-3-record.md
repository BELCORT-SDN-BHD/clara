# F-A2 annexes 3 — vocabulary, chains, and the record

> Companion to `f-a2-agentic-posting-design.md` (**v4, 2026-08-20**). **E** the refusal
> vocabulary, receipt shape and columns · **F** the `posted` chain · **G** the change log ·
> **H** the decision register · **I** B4's formulas and derivations. Siblings:
> `f-a2-annexes-1-estate.md` (A, B) and `f-a2-annexes-2-mechanics.md` (C, D).

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

`verdict` and `rung_vector` record **what the DB saw**, not what the model claimed — the
law-27(2) instrument and §6's per-document input. **The all-rungs vector is a deliberate semantic
improvement over `0046`'s ordering, not byte-equivalence, and the design says so.**
`0046:1128-1140` placed `not_corroborated` **LAST**, in its own words: *"Placed LAST so every
specific rule-gate skip … still fires first for a shaped-but-non-corroborated draft."* That
reasoning exists to keep a **single-reason** receipt informative. The vector **subsumes** it: at
0/33 corroboration a first-fail-wins ladder returns one distinct value across the entire corpus
and says nothing about B3..B14, which is exactly the instrument §6 needs. **The fail-closed
direction is unchanged** — an empty vector is still the only thing that posts.

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

**R-3, and why it mattered.** v3 wrote the `model` conjunct as
`btrim(coalesce(model_snapshot->>'model','''')) <> ''` — **four apostrophes**, which is the SQL
literal `''`, so the conjunct read *"the model name, defaulted to the two-character string `''`, is
not empty"* and **always passed**. That is the wall recording **which model posted** — law 71's
core — so a silently-true conjunct there is exactly the class this design keeps refusing elsewhere.
The default is `''` (two apostrophes), as in its two neighbours.

**`via_wake_kind` admits `'autodraft'` and `'interactive'` only** — not `'interactive_client'` —
because per R-1 the pinned kind is minted **solely for `wake_open_question`** and never carries a
post (§D.2). A post arriving under the pinned kind is a contract violation and the CHECK says so.

**`gate_verdicts` requires a non-blank top-level `extraction_id`**, so the T3 trigger's pin can
never read NULL from a well-formed row — the CHECK is the structural half of C.7's must-fail cell.

Append-only via `_tf_append_only` + a no-truncate trigger, the `0011:1084-1086` idiom. **No role
holds DML** — the row is written only by `clara._agent_post_entry_core`, inside the posting
transaction, and the `t_je_agent_post_receipt` deferred trigger makes its absence fatal.

### E.2 · The token sets

**Tier B (explicit, receipt, all rungs evaluated).** `settlement_kind_human` ·
`not_corroborated` · `anchor_unbound` · `anchor_untied` · `amount_conflict` ·
`human_override_present` · `unverified_evidence` · `facts_moved` · `open_question_blocks` ·
`supplier_leg_shape` · `sales_leg_shape` · `fa_belt_unregistered_movement` ·
`fa_cost_adjustment_deferred` · `fa_k_gl_balance_on_enrolled` · **`advance_mirror_unregistered`** ·
`advance_movement_unregistered` · `advance_application_missing` · `generic_control_leg`.

**B13's token is SPLIT by axis (M-5).** `advance_movement_unregistered` is **two walls under one
string** in the belt: the **mirror case** (`0043:3146-3155`, a reversal unwinding a leg the register
never held, carrying `'axis':'unregistered_mirror'` in its own detail) and the **general case**
(`0043:3168-3172`). The rung reports them separately — `advance_mirror_unregistered` for the first —
because a receipt that cannot tell a bad reversal from an unregistered disbursement names a symptom,
not a wall. **The belt's `is_opening_balance` and `reversal_of` arms are declared UNREACHABLE on
this path rather than pre-checked:** opening entries are refused at `0037:1781-1786` (CLR31,
K-family-only) and a reversal is not an agent draft under A8.

Each rung's value is `pass` / `fail` / **`not_evaluable`** — the third exists so an absent input
can never read as a pass (law 68). **No consumer may test for `'fail'`** — design §3.2's consumer
contract.

**Tier C — `(errcode, reason)` PAIRS ONLY. No wildcards. No errcode-only members.** **The per-site
table lives in design §3.2 and STAYS there (M-6)** — moving it to an annex would undo the fold that
put it in the reader's path. This section carries only what it excludes, and why.
**Explicitly NOT members.** `(CLR10, settlement_not_autopostable)` — typed (`0037:1829`) but
**dead on this lane**; B1 is the live wall. `(CLR23, *)` — the wildcard is **deleted**: seven bare
CLR23 raises inside `_assert_supplier_bill_shape_at` (`0036:622,651,655,658,674,689,845`) plus the
sales analog are reachable through the delegate, and converting them would give one defect two
settle outcomes decided by nothing an operator can see. `(CLR08, *)` — the immutability guard
never converts. Every Tier-D abort — an internal-contract violation that settles `failed`.
**The set may only GROW, and an unlisted pair propagates as a task failure.** C.4 has the cell.

---

## Annex F · The `posted` outcome chain (design §3.8)

v1 said two CHECKs. The truth is a **four-layer chain plus six further sites**, and a fix at any one
layer alone either lies or raises.

| # | site | today | what a naive `posted` does |
|---|---|---|---|
| 1 | `sweep_run_items.outcome` CHECK, `0011:734-735` | 5 values, **no `failed`** | CHECK violation — loud, and the only honest failure in the chain |
| 2 | `settle_autodraft_task` guard, `0036:864-868` (**not a CHECK**; an IF/RAISE) | 4 values, **includes `failed`** | CLR10 unless widened |
| 3 | `v_item_outcome` mapping, `0036:979-980` | `case p_outcome when 'drafted' … when 'noop_existing' … else 'skipped_lane' end` | **silently buckets `posted` → `skipped_lane`** |
| 4 | `sweep_runs` finalize bucketing, **`0011:2754-2762`** *(not `0036:2755-2759` — P4; single occurrence, never CoR'd)* | counts `drafted` / `skipped_lane`+`noop_existing` / `refused_budget`+`refused_attempts` | a `posted` row is counted in **none** of the three; the run summary under-totals against `expected_count` |

**Six further `posted`-sensitive sites, four of them found by the v2 re-derivation:**

| site | today | consequence |
|---|---|---|
| `0036:948` | `if p_outcome='drafted' and (p_entry is null or not exists(…))` | a `posted` settle **skips the entry-exists validation entirely** |
| `0036:978` | `last_refusal = case when p_outcome='drafted' then null else p_refusal end` | a posted task **keeps a stale refusal** |
| `0036:986` | `case when v_item_outcome='drafted' then p_entry end` | posted rows get **NULL `entry_id`** |
| `0036:987` | `case when v_item_outcome<>'drafted' then coalesce(p_refusal, jsonb_build_object('clr','CLR29','reason',v_item_outcome)) end` | a posted row carries a **fabricated CLR29 refusal token** — **false data, not merely missing** |
| `0011:2642-2652` | the **5-arity overload's own copy** of the guard (0047 proves both overloads coexist) | CLR10 on the other overload |
| `autoDraft.v8.impl.ts:347-350`, `:382` | `classifySettleReceipt`'s six-shape fail-closed classifier + the settle call | **inside the freeze** → `autoDraft_v9` territory |

**Why §6 does not read this chain for its POSTED count.** It reads `clara.entry_post_receipts` —
one row per posted entry, `unique(entry_id)`, written inside the posting transaction — and
**cross-checks** it against `sweep_run_items.outcome='posted'`. **A disagreement between the two is
itself a finding**; C.9 asserts they agree.

---

## Annex I · B4's three formulas and their derivations (design §3.7.1)

**"No wall is re-implemented" was false for three kinds of four.** `0016:4139-4147` and
`0037:1928-1938` are **supplier_bill-only**, so two of these three are **new walls with new
formulas**, and **PR-0's review emphasis points here** — law 1 gives each new formula its own
independent pass.

| kind | formula | status and derivation |
|---|---|---|
| `supplier_bill` | payable credit = expense debit = `total_cents` | **Faithful relocation.** The tie already exists at `0016:4139-4147` (as a FLAG) and `0036:812-829` (as the verified-total floor); B4 promotes the flag to a refusal and changes nothing else. |
| `sales_invoice` / `sales_credit_note` | receivable debit = income credit + tax credit = `total_cents`; the credit-note arm mirrors sign | **NEW.** Derived against `_assert_sales_invoice_shape_at`'s own tie (`0016:2100-2111`) so the rung and the shape floor cannot disagree — B11 calls that floor, and a B4 formula that computed a different total would make the two rungs contradict on one entry. The sign mirror is what keeps a credit note from tying by absolute value. |
| `journal_entry` generic | `sum(debit_cents) = total_cents` | **NEW, and the weakest honest anchor available.** No coding kind, so no direction arm, no coded-kind preconditions (`0016:4020-4034` is skipped) and no shape floor. The document total is the only DB-owned figure the entry can be held to. **Paired with B14** (no AR/AP control leg), which is what keeps the subledger belt unreachable. |

**The named cost, and OQ-5's question.** A generic JV whose amount is *not* the document total — a
payslip split across several entries, a partial accrual — **cannot tie and lands as a draft**. The
alternative is no anchor at all, which is precisely what `0046:1128-1140` wrote against itself:
*"could … carry an ARBITRARY under-cap balanced amount, and be auto-posted with no verified
anchor."* Together with B14 this narrows the unattended generic lane to **document-anchored,
non-control-leg journals**, and §6 measures how large that residue is rather than assuming it.

---

## Annex G · Change log

### v1 → v2 (the R1 adversarial review: CONDITIONS — 6 blockers, 7 materials)

**Folded (F).** **F1** Tier D re-derived and re-scoped to a `pg_trigger.tgdeferrable` replay.
**F2** the Tier-C classifier keys on `(errcode, reason)` pairs only — no wildcards, no errcode-only
members — and PR-1 adds the missing `detail` reasons. **F3** a new Tier-B rung refuses settlement
kinds unattended (WCA-R6 stands until F-A3). **F4** the chat fail-closed path designed for real;
**D11's estate-wide "law" phrasing dies**, replaced by the narrow verified claim plus §D.5's
per-wall dispositions. **F5** N1/T3 corrected at the bytes (the 1-arity intermediate) and extended
to the sales arm. **F6** the `posted` outcome designed end-to-end (Annex F). **F7** B4-sales and
B4-generic re-worded as new walls with new formulas. **F8** Tier B evaluates **all** rungs; the
receipt carries the full three-valued vector. **F9** 8th body, with the 0040 marker dispositions.
**F10** two missed censuses folded and the roster counts corrected. **F11** G-11 marked
PENDING-LIVE-READ. **F12** a cell per blocker; C.8 re-fixtured as agent posts. **F13** cite-drift
nits. **F14** the WB-R2 assertion sites verified and dispositioned.

**Push-backs (P).** **P1** the review's own deferred list was short by five — the source census
finds **eleven** constraint triggers on `journal_entries`. **P2** T3's remedy is not BL-5's implied
one: the receipt-keyed trigger pin costs **zero** human-lane blast radius. **P3**
`bank_rule_suggested` is not in the 0040 anti-revert list; F-A2 retires **3 names / 5 occurrences**,
not four. **P4** the sweep bucketing is `0011:2754-2762`, and four *more* `posted`-sensitive sites
exist than either document listed, one of which writes **false** data. **P5 — REFUTED by the delta
review**, see below.

**Additions (A).** **A1** `mint_wake_credential` forbids `on_behalf_of` on `autodraft`. **A2**
`x42-s5-helpers.mjs`'s roster is migration-ledger-gated. **A3** the FA and advance belts already
carry typed `detail` reasons. **A4** the chat path needed a durable change too — *superseded by C-3*.

### v2 → v3 (the delta review: CONDITIONS — 3 blocking, 6 material, + M-7..M-10)

**F15 (C-1)** A8 gains `and last_human_editor is null`; **new OQ-6** on the categories that reach
post ungated. **F16 (C-2)** the `gate_verdicts` shape stated with `extraction_id` **flattened**; the
**receipt write contract** as an invariant with its commit ordering; C.7's cell designated
**must-fail** on a wrong accessor. **F17 (C-3)** the durable-CHECK weakening **REVERSED** for the
extend-only `interactive_client` kind; §D.2 becomes the census decision record; the **fourth
change** (the frozen infra file) named in the build sequence. **F18 (M-1)** `t_je_subledger_belt`
gets **B14** as a shape refusal. **F19 (M-2)** the bank-pending belt dispositioned unreachable + a
forward obligation on F-A3. **F20 (M-3)** the vector's **two durable homes**. **F21 (M-4)** the
**consumer contract as a design law**. **F22 (M-5)** B13's token splits by axis. **F23 (M-6)** the
Tier-C pair table **returns to §3.2**. **F24 (M-7..M-10, nits)** `wb-s-seeding.test.mjs:217` moves
to the **unconditional** breakage list; `:205` dispositioned as a **second zero-count head**; §B.6
gains the **verbs-not-names** method header and `x42-producer-role.test.mjs`; `x42.prod-23` gains an
inverted twin; the WB-R2 count trued to **six**.

**Micro-corrections.** `bank_rule_suggested` goes **2 → 0** (both occurrences sit inside the deleted
`if`-gate's `v_to` text). The `x42-s5` cohort gate must use **`appliedStem`** (`:403`), never
`applied("00NN_%")` — migration numbers are claimed at merge.

**P5 REFUTED, and the lesson recorded.** My `relay-redrive-consumers.test.mjs` cites were each off
by one; the reviewer's `:21-27` span was exact. Cause: I counted forward from a `sed` window's start
instead of reading the numbers the instrument prints. **Line numbers come from `cat -n` or
`grep -n`, never from arithmetic on a window.** P1, P3 and P4 were conceded by the review.

### v3 → v4 (final verify: APPROVED-AS-DESIGN subject to R-1..R-3, all mechanical)

**F25 (R-1) — `interactive_client` is NARROWED to one call path.** It is minted **solely for the
fail-closed `wake_open_question` call**; every other chat scoped read and write, **including the
post**, keeps plain `interactive` with its NULL-client guarantee. This is what makes census findings
1-3 genuinely not fire rather than merely be argued around. **Stated in §D.2 and in the PR-2 build
step**, with the forward clause: *if chat ever goes client-scoped throughout, that is a future
decision which must re-open the census table and accept findings 1-3 as deliberate behaviour
changes.* **Honest footnote added:** the mint verifies **firm-congruent and active**, not per-client
human authorisation — matching the estate's existing firm-scoped model, opening nothing new.
**F26 (R-2)** §D.5's client-binding CHECK row corrected to **STANDS — untouched; the KIND CHECK
(`0011:623-624`) is extended instead**. **F27 (R-3)** the `model_snapshot` CHECK's four-apostrophe
default fixed to `''` — as written the model conjunct **always passed**, and it is the wall
recording WHICH MODEL posted. **F28 (M-1 nit)** the "satisfied by construction for the coded kinds"
claim now cites `clara._subledger_on_approve` (`0037:1050-1274`, *"called from ALL FOUR approve
paths"* `0037:1032`, invoked at `0037:2028`) **and gets a C.3 cell**, because "almost certainly" is
not this design's standard. **F29 (pointer nits ×5)** `0040:7117`→`7115` ·
`ck_wake_credentials_client_0011` is `0011:625-628` · the PIN BLOCKER is `0011:1980-1983` · the
`rule_proposal` exclusion is `0012:100` · §B.4's singular cells-floor line now names `x42.prod-23`,
`x42.prod-25` and `x42-producer-role.test.mjs`.

**F30 — OQ-4 RULED (owner, 2026-08-20): the three-exits shape.** A8 **stands**: unattended posting
is the agent's own **untouched** derivation only. The two open exits are designed in §3.3.3, and the
**forbidden middle** is named — pass-through of human numbers under agent identity with nobody's
approval on record. **F31 — OQ-6 RULED: option A, the category gate is NOT inherited.**
`is_year_end` and `tax_affecting` entries post unattended; grounds and the honest cost line in §5.

**F33 — OQ-6's SUPPLEMENTARY NOTE (owner, 2026-08-20, in-session): the HUMAN lane's category gate
STANDS, unchanged.** OQ-6 freed the **agent** lane from the `is_high_stakes` category gate on
`is_year_end` / `tax_affecting`. It did **not** touch the human lane's distinct-checker gate on the
same categories, and the owner's supplementary ruling re-confirms that the two lanes are treated
differently **on purpose**. Three asymmetries carry it:

1. **A second party is automatic on the agent lane and manufactured on the human one.** The
   downstream checkpoints that justify freeing the agent — close keys ②③, F-T3's e-filing review —
   give an agent-posted entry a reviewer who is **never** its maker, by construction. On a staffed
   human lane the per-entry gate produces **per-entry second-party evidence** that a diffuse close
   review does not; removing it would trade specific evidence for general.
2. **The threat models differ.** The human gate's is **segregation of duties** — individual error
   *and* individual dishonesty. Neither applies to the agent, whose every post carries a DB-observed
   verdict, a rung vector and a model stamp (§3.3.1). A control aimed at a risk that is absent is
   not a control, it is friction.
3. **The costs are asymmetric.** On the agent lane the gate **breaks unattended flow** — the whole
   point of the lane. On the human lane it is **one click inside an already-attended flow**, and it
   degrades gracefully in solo firms to a single typed attestation (the CLR05 path at
   `0037:1993-1997`, live-proven at BEE).

**Registered, not built:** this is ultimately a **firm-governance dial** — the close-keys
authorization-list precedent is the shape — and it **MAY become per-firm configurable** later. F-A2
builds no such switch. **The charter's "human lane unchanged" scoping is thereby re-confirmed, not
amended**, which is why this is a note under OQ-6 rather than a new decision.

**F32 — the annexes split three ways** (`-1-estate`, `-2-mechanics`, `-3-record`) and the main doc
brought under **500 lines**, the repo's mechanical file-size limit. Protected from compression, per
the reviewer's named list: the **Tier-C pair table stays in §3.2** · **A8's second conjunct keeps
its REASON**, not just its predicate · the **`gate_verdicts` flattening keeps its WHY** (the
silent-NULL argument) · **C.7b's three per-tier zero-row cells stay three** · **§D.2's census
findings keep their bytes**.

---

## Annex H · Decision register — the register of record

| id | decision | status |
|---|---|---|
| **D1** | Separate wake wrapper (S1) + ungranted core + the SHARED `_approve_entry_core`. | ruled here |
| **D2** | S2 refused (two lock orders; the divergence pulled inside one txn); S3 refused. | ruled here |
| **D3** | **The corroboration gate lives in the DB, in the post core, before the status UPDATE**; the runtime read stays advisory. | binding (orchestrator) |
| **D4** | **Four tiers; the boundary is the failure mode — EXCEPT B4-sales and B4-generic** (Annex I), and B12/B13, new callable extractions of inlined belt predicates. | derived |
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
| **D19** | **The `posted` outcome is designed across all four layers plus six sites**; §6 reads `entry_post_receipts` and cross-checks. | derived |
| **D20** | **Chat parity ships only with its fail-closed path — via a NEW `interactive_client` wake kind, extend-only, minted for the `wake_open_question` call ALONE (R-1).** v2's durable-CHECK weakening is **REVERSED**: the census showed it regresses `list_unassigned_documents`, silently widens `coding_lane` (changing frozen `chatTurn_v12`'s answers with no byte change), flips 8 more readers, and contradicts `0011:1980-1983`'s PIN BLOCKER. A **fourth change** — a new frozen `_vN` of `chatTurn.v10.infra.ts` — lands in PR-2. | **reversed at C-3, narrowed at R-1** |
| **D21** | Retirement rides this item; the WB-R2 sites are re-pointed, never deleted. **AMENDED 2026-08-20 (ADR-0072 ①.2): the post-Window-A re-extraction is TWENTY documents, superseding the full-64 backfill** — too few to satisfy the fallback arms' *full-population* trigger, so by its own "whichever lands first" clause the arms retire, and **F-A10's terminal check closes, at the Wave-G reset**. | contract-ruled + owner |
| **D22** | `autoDraft_v9` keeps sending `pack_consumer='v25'` — a capability token, not a version assertion. | derived |
| **D23** | **A8 is `maker_actor = agent AND last_human_editor is null`** — "her own work, UNTOUCHED". `revise_entry` rewrites numbers without tripping B6, so the second conjunct is what stops the agent posting a human's figures unattended. **OQ-4's ruling confirms it and adds the two lawful exits** (§3.3.3). | derived (C-1); confirmed by OQ-4 |
| **D24** | **`gate_verdicts` flattens `extraction_id` to the top level and CHECKs it non-blank**, because a nested accessor read from inside the shape trigger yields NULL — exactly the unpinned behaviour T3 removes — **without failing anything**. The receipt is written only on a successful post, after the delegate, inside the Tier-C region. | derived (C-2) |
| **D25** | **B14 refuses the shape rather than pre-checking the subledger belt** — a generic entry carries no AR/AP control leg, which makes `t_je_subledger_belt` unreachable on this path and **narrows OQ-5**. | derived (M-1) |
| **D26** | **The vector has two durable homes and no consumer tests for `'fail'`** — refusals in `op_receipts`, posts in `entry_post_receipts`; every consumer tests for `'pass'` and treats everything else as non-admitting. | derived (M-3/M-4) |
| **D27** | **OQ-4's three-exits shape:** the human lane posts human-edited drafts under human identity; the agent may **re-derive** and post her own conclusion under agent identity; the **forbidden middle** is pass-through of human numbers under agent identity. | **owner-ruled 2026-08-20** |
| **D28** | **OQ-6 option A: no category gate ON THE AGENT LANE.** `is_year_end` and `tax_affecting` post unattended, on the grounds that both carry mandatory downstream human checkpoints. **Supplementary ruling: the HUMAN lane's distinct-checker gate on the same categories STANDS unchanged** — three asymmetries (automatic vs manufactured second party · segregation-of-duties threat model · one click vs broken flow) in Annex G's F33, which also registers it as a future per-firm **governance dial**, not built here. | **owner-ruled 2026-08-20** |
