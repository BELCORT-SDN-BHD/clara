# F-A3 — bank agency: ANNEXES 2 · the record

> Companion to `bank-agency-design.md` **v2**, `bank-agency-annexes-1-mechanics.md` (A-D),
> `bank-agency-annexes-4-surfaces.md` (E-G) and `bank-agency-annexes-3-build.md` (O build · J the
> D1 list · L the predictions · P owner questions · Q risks).
> **H** the battery · **I** the retirement checklist · **K** the decision register · **M** the human
> acts and the doors · **N** dependencies, sequencing and the change log.
>
> **v2, 2026-08-22 — gate 1 folded (record: `bank-agency-gate-record.md`).** **Annex J** (the D1
> write-quiesce list) and **Annex L** (the predictions) moved to `bank-agency-annexes-3-build.md` at
> v2: J is now three per-PR lists and belongs beside the build sequence that severs them, and L is
> the same file's rig-replay obligation. Same authority, new home.

---

## Annex H · The battery (contract-blind cells ▣)

**Contract-blind means the cell is written from the CONTRACT and the RULING, by a lane that has not
read the implementation** (law 33's filesystem isolation, the F-A2 Annex C convention). Every rung,
every wall, every retirement and every census gets a cell; the ones that would go RED against a
plausible wrong build are marked as such, because a cell that cannot fail proves nothing (law 31).

### H.0 · The gating cells and acceptance (the design's §4 points here)

**The gating cells** — a same-amount ambiguity refuses and lands a question ▣ · an agent match WITH
an adjustment posts with the F-A2 receipt present ▣ *(RED against a non-ctx-aware adjustment
writer)* · **an agent SETTLEMENT posts with `last_human_editor IS NULL`, exactly one
`entry_post_receipts` row and `bank_matches.origin='agent'`** ▣ *(the B1 cell — RED against today's
allocate cores)* · **an agent settlement of a `tax_affecting` or ≥RM100,000 entry posts LIVE with no
pending reservation** ▣ · **she unmatches a HUMAN-authored match and voids a statement she did not
file — both succeed** ▣ *(M5's widening — RED against v1's provenance gate)* · a stale item with a
duplicate-payment twin refuses at M11 ▣ · an unexplained inflow refuses at M6 ▣ · a bank-born entry
does NOT evaluate B3/B4/B7/B8 and DOES evaluate B14/B15 ▣ · **the repaired gate turns a
zero-registered-account client RED via arm (4)** ▣ · **a second refusal on the SAME subject commits a
second receipt row** ▣ · **the extracted public bodies hold NO advisory rung and the cores DO** ▣ ·
the retired verbs are absent and the kept helpers are present ▣ · `clara_agent_ro`, every wake role
**and `clara_wake_bank`** hold zero privilege on every bank relation ▣.

**Acceptance (law 29).** On **real books**: ROME PUBLIC ADVISORY (synthetic, labelled per ADR-048)
first, then a BELCORT client (constraints 12 and 13 throughout — RS stays name-only, and its lower
automation rate is an expected observation, not a defect). **v2 TRUES the prerequisite.** v1 said
"the owner must supply and verify the account data before the live run"; the owner's **2026-08-22
directive** (the orchestrator's session-local PR-1 ledger, "Bank accounts") rules the opposite:
**registration is NOT an owner
item** — it happens in **F-A7b's onboarding interview** on the real run **after the Wave-G reset**
(TA-P1 C gives Clara the verb; TA-P3's firm-level purpose covers the interview moment), and the
zero-registered-account / RM39,252.03 drawer-2 vacuous green is **a test-era artefact the reset
discharges**. So F-A3 forces the zero-registry gate arm against RPA and a seeded BELCORT fixture, and
the live BELCORT round is **RECORDED as sequenced behind the reset** (TA-P14 clause 4), not omitted.
**Four numbers published in PR-4**, each with its denominator: matched unattended / refused with the
rung named / questions raised / stale items challenged (the 60-day stop frequency, OQ-5). **The
gate's before/after verdict per client** (P-4′). **F-A10's bank half**: the rules machine gone, one
architecture, recorded.

### H.1 · The extraction is behaviour-preserving (the whole safety argument, §A.2)

- **The differential cell**: for each of the **nine** extracted verbs, run the SAME human fixture
  against the pre-PR-1a rig and the post-PR-1a rig and require **byte-identical** receipts, audit
  payloads and refusal details ▣. *(It must FAIL if the extraction changes any message, key or
  order.)* **This is PR-1a's whole claim, and PR-1a contains nothing else.**
- The public verb's `pg_proc` row keeps its **name, arity, owner, ACL and volatility** ▣.
- The extracted core holds **zero grants** to any role (`0040` tail-7(3)'s shape) ▣.
- A human caller with no wake credential still succeeds; a wake caller cannot reach the public verb ▣.
- **NEW at v2 (material M2) — the lock-order pins MOVED, not deleted.** For each of the five pinned
  sites (Annex C): the **extracted core's** prosrc carries the ordered rungs ▣, and the **public
  body** carries **no advisory rung at all** ▣ *(the `x38-match:1496-1538` precedent's shape)*. RED
  against a build that re-points the pins by deleting them — which would leave Annex C's "the order
  is the DELEGATE'S OWN order" unmeasured and the ABBA deadlock silently re-introducible.
- **NEW at v2 — the overload count stays EXACT.** `settleOverloads.rows.length` is `2` after PR-1a
  and `1` after PR-3's `/13` drop ▣ — never relaxed to `>=`.
- **NEW at v2 (material M3) — a human `add_bank_account` with NO proposal still succeeds** ▣ *(RED
  against a build that puts the proposal wall in the shared delegate instead of the agent core).*

### H.2 · Tier A

No credential → CLR03 ▣ · a credential of a kind without the allowlist row → CLR03 ▣ · **a
`bank_agent` credential attempting a verb it does not hold a row for is REFUSED** (the call is made,
not the roster read — the F-A2 C.1 correction) ▣ · blank op key / rationale / model → typed CLR10 ▣ ·
`purpose_unconsented` with the consent revoked mid-run ▣ · `bank_agency_held` while the hold is on
(reading `clara.bank_agency_holds`) ▣ · cross-firm client → CLR11 ▣ · **replay of the same op key
returns the stored receipt byte-identically** ▣ *(and `uq_bank_agent_receipts_op_key` is what makes
it deterministic).* · **NEW at v2 (material M4) — a connection holding `clara_wake_interactive`
CANNOT EXECUTE any bank wrapper** ▣; only `clara_wake_bank` can.

### H.3 · Tier B — all fifteen rungs, each forced non-vacuously

M1 an open exception on one member line refuses ▣ · M2 a group off by one sen refuses (and the
receipt names the three sums) ▣ · **M3 two candidate groups tie equally → refuses AND lands a
`bank_line`-scoped question** ▣ · M4 a printed identifier mapping to a different counterparty
refuses ▣ · **M4 negative: with no identifier at all the rung reports `not_evaluable`, never
`pass`** ▣ *(the ARM-0 shape)* · M5 two ROME-family candidates refuse ▣ · **M6 an unexplained inflow
refuses and does not post to income** ▣, and its twin — the same inflow WITH an open item — settles ▣ ·
M7 an adjustment to a control account refuses ▣ · M8 a reversed entry and a reversal mirror each
refuse under their own token ▣ · M9 capacity exhaustion refuses ▣ · **M10 an entry anchoring a
cancelled reservation refuses at the rung, and the deferred belt (`0038:7704`) still aborts if the
rung is removed** ▣ *(the belt is the backstop, the rung is the evidence)* · **M11 a stale item with a
same-counterparty same-cents twin inside the window cannot be waived** ▣, and **M11 negative: a
genuine stale item with no twin IS waived and the reconciliation completes** ▣ · M12 a superseded
statement generation refuses ▣ · M13 a post-period member without the ack refuses; with the ack it
matches and the exception rides the member row ▣ · **M14 (v2) an unmatch/void that a LATER
reconciliation depends on refuses — and the same act on an independent subject SUCCEEDS even when a
human made it** ▣ · **M15 (v2) voiding a statement carrying a live or pending match refuses; voiding
a clean statement she did not file SUCCEEDS** ▣.
**Vector cells:** every rung is evaluated after the first failure ▣ · an empty vector is the only
thing that proceeds ▣ · **a doctored vector carrying an UNKNOWN value does not admit** ▣ *(it fails
against any consumer written to test for `'fail'`)* · the vector is durable and readable from
`bank_agent_receipts` **for both outcomes** ▣ · **NEW at v2 (material M6) — the SAME candidate
refused on two successive wake cycles commits TWO `outcome='refused'` rows, and a third cycle that
admits commits the one `admitted` row without violating anything** ▣ *(RED against v1's flat
`unique(act_kind, subject_id)`, which aborted the second visit the clock's own `retry_later` reason
exists to create)* · **a refusal's `subject_id` is the anchor LINE, and the refusal stamps
`retry_after`** ▣.

### H.4 · The F-A2 seam (findings F2 + F13 — the cells that would go RED against the obvious build)

- **An agent match WITH an adjustment posts**: the adjustment entry carries `last_human_editor IS
  NULL`, an `entry_post_receipts` row exists, and the commit succeeds ▣. *(RED against today's
  `_bank_match_adjustment_entry`, which stamps `last_human_editor` and writes no receipt — F2.)*
- **NEW at v2 (blocker B1) — an agent SETTLEMENT through `wake_settle_from_bank_line`**: the
  customer-receipt entry carries `last_human_editor IS NULL`, exactly one `entry_post_receipts` row
  exists, `bank_matches.origin='agent'` and `status='live'` ▣. *(RED against today's
  `_allocate_receipt_core`/`_settle_from_bank_line_core`, which stamp the actor as human editor,
  write no receipt and hardcode `origin='human'`.)* **The AP twin** through
  `_allocate_payment_core` ▣.
- **NEW at v2 — the negative twin for the settle path**: with the receipt write removed, the SAME
  settlement **aborts at COMMIT** under `t_je_agent_post_receipt` ▣.
- **NEW at v2 — the ctx survives BOTH hops**: a probe ctx carrying `is_agent`/`on_behalf_of`/
  `wake_kind` is readable inside `_allocate_receipt_core` ▣ *(RED against the `:1051`/`:1367`
  re-derivation and the `:1927`/`:1946` rebuild).*
- **The negative twin**: with the receipt write removed, the SAME match **aborts at COMMIT** under
  `t_je_agent_post_receipt` ▣ — proof the trigger is the wall and the receipt is not decoration.
- **A HUMAN match with an adjustment is byte-unchanged** (`last_human_editor` = the human) ▣, **and
  a HUMAN settlement is byte-unchanged, including the ≥RM100,000 draft** ▣.
- **A bank-born entry evaluates B14/B15 and does NOT evaluate B3/B4/B7/B8** ▣ *(Annex B.5's closed
  list, forced; RED against a build that imports F-A2's ladder whole — the GB-2 shape.)*
- **B1's narrowing is origin-scoped**: a bank-born settlement posts ▣; a chat-lane settlement with no
  bank line still refuses `settlement_kind_human` ▣.
- **The two settlement shape floors are ASKED for the first time**: a malformed bank-born
  customer_receipt aborts at `t_je_customer_receipt_shape`, a malformed supplier_payment at its twin
  ▣ *(law 31 — the first non-zero population these floors have ever had; and per nit N2 the reason
  B10/B11 stay inert is that the bank lane sets `customer_receipt`/`supplier_payment`/NULL, never
  `supplier_bill`/`sales_invoice` — a DIFFERENT trigger pair from these two.)*

### H.5 · Identity, receipts, two-person walls

`on_behalf_of` is **NULL** on a clocked run and the receipt says `agent_unattended` — never
`two_person`, never a self-attestation ▣ · the model snapshot's three keys are each refused when
blank (**the R-3 four-apostrophe regression cell**) ▣ · a human settlement ≥RM100,000 still routes to
a distinct checker ▣ · an **agent** settlement ≥RM100,000 **or `tax_affecting` or year-end** posts
live with no pending reservation ▣ *(the D28-shaped asymmetry, forced so nobody "restores" a
threshold later — and v2 widens the cell past the amount arm because `is_high_stakes` is not an
amount test, `0009:1513-1518`)* · the receipt's `inputs_digest` equals the pack digest the run read ▣ ·
a Tier-C conversion **rolls the receipt back** ▣ · **the two deferred receipt walls read the ADMITTED
index: a subject carrying only refusal rows still ABORTS the wall** ▣.

### H.6 · The carriers, the clock, the egress

An M3 refusal writes exactly one `bank_line`-scoped question ▣ · **a `bank_line` question does NOT
block entry approval** (`_open_question_blocks` returns nothing for it) ▣ *(the freeze cell — RED
against a client-scoped carrier)* · a `line_exception` proposal is written; **the owner's one click
calls `except_bank_line` verbatim and `t_bank_agent_proposal_accept` flips the proposal to
`accepted` with the inserting actor as `decided_by`** ▣ *(v2, blocker B4 — RED against v1, where no
writer existed and `ck_bap_terminal` could not be satisfied)* · **an exception inserted on a line
with NO proposal is a no-op, and a proposal for a DIFFERENT line does not flip** ▣ · **`except_bank_line`'s
own `pg_proc` row and prosrc are byte-unchanged after every PR in this train** ▣ · **no `accept_*`
verb exists in the catalog** ▣ · **NEW at v2 (blocker B5) — `wake_propose_identifier_promotion`
writes an `identifier_promotion` proposal with an `identifier_promotion_propose` receipt; the human
confirm door writes the `client_identifiers` key and flips the proposal, recording the confirmer ▣;
and where the payer is NOT a client of the firm the door reports `promotion_target_unavailable` and
the proposal stays OPEN** ▣ · the due predicate returns `chase_statement` and the belt writes a
NOTIFICATION and **no event** ▣ *(the fabrication cell)* · twelve statements filed at once reconcile
in chain order and the out-of-order attempt refuses `chain_broken` ▣ · the hold stops the lane at the
predicate ▣ · a client with no `bank_matching` consent produces no event and no dispatch ▣ · **the
`bank_agent` kind holds EXACTLY its enumerated allowlist rows** ▣ *(the closed-world cell)* ·
minting a `bank_agent` credential without a client is refused, and with `on_behalf_of` is refused ▣ ·
**NEW at v2 (blocker B2) — a `bank.agent_due` event ends in a run that COMPLETES and leaves a
`bank_agent_receipts` row** ▣ *(P-8′; this cell CANNOT PASS until G1's mechanism lands, which is the
point: v1's "watch the intent + task appear" could not fail)*.

### H.7 · The gate repair, retirement, and the standing censuses

The repaired gate turns a **zero-registered-account** client (bank-class COA movement, no
`bank_accounts` row) RED **via arm 4** ▣ *(v2, material M1 — RED against the v1 three-count repair,
which returns `pass` on that client)* · an account with statements but unmatched, unexcepted lines
turns RED ▣ · the basis literal reads `registry_lines_and_gaps_v2` ▣ · drawer-1's
`bank_recon_close_state` is **untouched** ▣ · every retired verb is absent from the catalog ▣ ·
**`_bank_desc_word_match`, `_bank_rule_regex_escape` and `_bank_line_class_hint` are PRESENT and
`list_unmatched_lines` still returns class hints** ▣ *(survey F6/P-9 — RED against a name-following
drop)* · `clara.bank_rules` and every historical row survive ▣ · `bank_matches.origin` still admits
`'rule'` for history and now admits `'agent'`; **a HUMAN match still writes `'human'` and an AGENT
match writes `'agent'`** ▣ *(the parameterised-literal differential, nit N3)*; an agent group with a
`matched_via_rule_id` refuses at the congruence trigger ▣ · **`clara_agent_ro`, every wake role AND
`clara_wake_bank` hold ZERO privilege on every bank relation, including the three new tables** ▣
*(v2, material M4 — the role list EXTENDS; C5/C6 stay true verbatim AND grow)* · the human bank verbs
still hold **zero** allowlist rows ▣ · the new wake wrappers carry **no DML** (catalog cell) ▣.

### H.8 · Concurrency

Two clocked runs on one client **queue** on `203005004` (no deadlock, no double match) ▣ · a clocked
match and a concurrent human match of the same line: one wins, the loser gets `already_matched` ▣ ·
a clocked reconciliation against a concurrent void: the void wins or the reconciliation does, never
both ▣ · **the ABBA cell**: a human `unmatch` holding the draft-entry lock against an agent match —
neither deadlocks ▣ *(the R-L2/D40 lesson, re-forced for this lane.)*

---

## Annex I · Retirement checklist (TA-P11 A)

**DROP (verbs and functions).** `propose_bank_rule` (`0040:3624`) · `sign_bank_rule` (`0040:3751`) ·
`retire_bank_rule` (`0040:3795`) · `accept_bank_rule_suggestion` (`0044:4710`) ·
`_bank_rule_sightings` (`0040:3144`) · `_bank_rule_pattern_norm` (`0040:3053`) ·
`list_bank_rule_candidates` (`0040:4698`) · `list_bank_rules` (`0040:4758`) ·
`list_bank_line_suggestions` (`0040:4649`) · `_wdb_suggestion_rule_hit`, `_wdb_suggestion_lines`
(`0044`) · `clara.match_bank_line/7` (`0040:5401` + splice) · `clara.settle_from_bank_line/13`
(`0044:2226`).

**KEEP — and this is the easiest thing here to get wrong.** `clara.bank_rules` and every historical
row (knowledge fuel; the KEEP-AS-HISTORY treatment D35/D36 set) · **`_bank_desc_word_match`
(`0040:3030`) and `_bank_rule_regex_escape` (`0040:3002`)**, because `_bank_line_class_hint`
(`0040:3177`) — an advisory, explicitly non-authoritative read the human's unmatched-lines list uses
(`0040:4110`) — calls them (survey F6, **P-9 confirms the caller census before the drop file is
authored**) · `bank_matches.origin`'s `'rule'` value and every `matched_via_rule_id` row.

**DASHBOARD (four surfaces).** `apps/dashboard/app/bank/RuleCandidatesCard.tsx` + its test, and the
mount at `BankWorkbench.tsx:23,125` · `apps/dashboard/app/shared/cards/BankRuleProposalCard.tsx` ·
the coding chip in `StatementDetail.tsx:209` (rationale `:331-337`) — **its slot becomes the
exception-proposal door** (M.2) · the chat part type `bank_rule_proposal`
(`chat/partCatalog.ts:129-131`, `shared/parts.ts:98-99,164`) — and the part **catalog** entry, which
is the surface F-A2's GM-11 found by census, not by memory.

**API/CENSUS.** `apps/dashboard/app/shared/reconApi.ts`'s rule functions and
`apps/dashboard/app/shared/bankApi.ts`'s
`matched_via_rule_id` commentary (`:242`) · `dbSeamCensus.bindings.ts:136,273,274` rows ·
`rig-meta.mjs`'s three cohorts (survey C1-C3) — **each disappearance dispositioned in the PR, never
silently deleted** (the B.7 discipline). *The gate re-derived the eight names leaving the 0040/0044
cohorts and found this checklist and the survey's retirement table already name every one
individually — C2/C3's disposition column needs no widening (nit N1's fourth item, REFUTED).*

**RECORDED, not silently dropped.** **E-R13's mechanical settlement door** dissolves with the machine
(its corroboration intent rides the witness pair) and **7A-R3** was already recorded as dissolved at
TA-P11 clause 2. Both are named in the PR body and in PROGRESS.md's ledger, because an undeclared
lapse is exactly what ADR-0072① forbids.

**TEST BREAKAGE, split by CLAIM** (the R-L1/D39 discipline): tests whose claim is *rule behaviour*
(sighting counts, suggestion chips, signed-rule arities) retire **with the drop PR**; tests whose
claim is *verb existence* retire in the same PR because the drop IS the cutover here — F-A3 has no
intermediate state where the verbs exist unused. Every retired test is replaced by its **inverted
twin** (the verb is absent / the agent lane does the same work) — nothing is deleted without a
successor claim. **A SECOND breakage source exists and v1 missed it (material M2):** the
core-extraction breaks five prosrc/overload pins in `x38.aa`, `x38.aj`, `x40.ao` and `x38-bank`.
Those tests' CLAIM (the house lock order, the live overload set) is still TRUE — they are **RE-POINTED
in PR-1a**, per Annex C, never retired.

---

## Annex K · Decision register

| id | decision | status |
|---|---|---|
| **A1** | **Wake sibling verbs + extracted cores + thin human delegates** (the `0044:2209` / F-A2 D41 idiom). The human lane keeps name, arity, ACL, floor and semantics. | ruled here (TA-P1 rider) |
| **A2** | **Duplication is refused** — TA-P11's own test forbids a second copy of the matching arithmetic. **The price, re-derived at v2: TWENTY-FOUR CoR'd live bodies, eleven DDL groups, three new tables, severed across three windowed PRs** (Annex J / Annex O). | derived; **recounted at v2 (B3)** |
| **A3** | **The bank lane's anchor is the group tie + the statement's corroboration verdict**, not `entry_evidence`. F-A2's B3/B4/B7/B8 are declared NON-MEMBERS with grounds (Annex B.5). | derived (survey F3) |
| **A4** | **`_bank_match_adjustment_entry` becomes ctx-aware and writes F-A2's `entry_post_receipts` row inside the match transaction.** | derived (survey F2) |
| **A4b** | **NEW at v2 — the SETTLE limb needs the same treatment in THREE more bodies**: `_settle_from_bank_line_core` threads `p_ctx` through and derives `origin` from it; both allocate cores NULL `last_human_editor` on the agent arm, thread the identity into `_approve_entry_core`, write the F-A2 receipt, and take an explicit LIVE arm past `is_high_stakes`. **P-2 is retracted.** | **blocker B1** |
| **A5** | **B1 is narrowed for BANK-BORN settlements only**, discriminated structurally (the settle core's own path), never by a caller flag. | contract + A3-M-WCA-R6 |
| **A6** | **No pending/high-stakes reservation on the agent lane**; the human lane's RM100,000 distinct-checker gate is untouched. **v2: this is WORK in both allocate cores, not an absence, and `is_high_stakes` is not an amount test.** | derived from OQ-1/law 71 |
| **A7** | **No amount threshold anywhere on the agent lane** — any such gate is amount routing (G1.2). M6 and M11 are evidence-class walls, not amount walls. | law 71 |
| **A8** | **M11, the duplicate-payment wall on the 60-day waiver**, with ARM-0 on a NULL counterparty and a named ±35-day window constant. | TA-P1 rider |
| **A9** | **M6, the unexplained-inflow wall** — the loan-vs-settlement structural backstop. | derived (contract F-A3) |
| **A10** | **A new wake CREDENTIAL kind `bank_agent`** (client NOT NULL, `on_behalf_of` forbidden), both CHECKs and both mint gates extended, allowlist rows enumerated exactly. **Independent of A11's question.** | TA-P5 rider + GB-3's lesson |
| **A11** | ~~The clock's only new act is emitting an event; the estate's spine does the rest, so no new `agent_tasks.kind` and no new relay path.~~ **RETRACTED AT v2.** A `kind='wake'` task is a HELD PROJECTION with no consumer and no legal transition but held→cancelled; the lane as designed strands a row per tick. **The mechanism is GATE G1** and it is cross-item with F-A4/F-A5. **Nothing in this train bakes a kind until it is ruled.** | **RETRACTED — blocker B2** |
| **A12** | **One shared time-triggered SOURCE, one kind per authority scope.** F-A4/F-A5 reuse the belt idiom and the due-predicate shape. **v2: this is precisely why G1 is cross-item — one item lands the execution mechanism, the others extend it.** | derived (TA-P5) |
| **A13** | **`bank_matching` is a new named purpose with a NULL doc-sha conjunct**; an unconsented client's lane does not run. **v2: its five live bodies and four CHECK swaps are PR-1c, their own PR, blocked on C6.** | TA-P3 A; **B3** |
| **A14** | **ONE typed, receipted read (`wake_get_bank_pack`), zero table grants.** | TA-P9 + survey F1 |
| **A15** | **Learned payer accounts are context; the promotion door proposes and a human click writes the key.** **v2: the PROPOSING verb now exists** (`wake_propose_identifier_promotion` + its core + the `identifier_promotion_propose` act_kind); **the CONFIRM target is scoped to client-payers and escalated (OQ-8).** | TA-P8 B; **blocker B5** |
| **A16** | **`bank_line` scope + `bank_ambiguity` origin extend `open_questions`, and `_open_question_blocks` gets an EXPLICIT disposition.** | derived (TA-P14 clause 3) |
| **A17** | **`bank_agent_proposals` is the proposal carrier; no `accept_*` verb is minted.** **v2: the `accepted` flip is written by `t_bank_agent_proposal_accept`, an AFTER-INSERT trigger on `bank_line_exceptions` — declared judgement logic, on the D1 list — so `except_bank_line` stays byte-untouched; `declined`/`stale` are dropped from the CHECK for want of a writer (law 31).** | A3-M-propose; **blocker B4** |
| **A18** | **The drawer-2 bank gate is repaired on FOUR counts at v2** (registry origin · unmatched lines enumerated · a new basis literal · **a `no_registered_account` fail arm**); drawer-1's P-3 stays F-T4's **by ownership, not absence** — one predicate, two call sites. | TA-P14 / A3-OQ-12 / R-F 1; **material M1** |
| **A19** | **The rules machine retires whole; `_bank_desc_word_match` / `_bank_rule_regex_escape` / `_bank_line_class_hint` survive.** | TA-P11 A + survey F6 |
| **A20** | **E-R13 and 7A-R3 are RECORDED as dissolved with the machine.** | TA-P11 clause 2 |
| **A21** | **The build waits for the owner's digest re-sign** (gate G0). | the sitting's own pending note |
| **A22** | **Tier membership is derived by RIG REPLAY** from `pg_trigger.tgdeferrable`, never a hand list. | F-A2 D5, inherited |
| **A23** | **Chat parity rides PR-3**, not PR-1b — sequencing, not narrowing (OQ-6). **v2: D34 is named and DISTINGUISHED in OQ-6 itself** — D34 reversed a severance that left a granted authority unmintable; OQ-6 grants nothing that then fails, and parity stays IN the train. | orchestrator, standing delegation |
| **A24** | ~~unmatch is limited to her own matches; void is limited to what she filed/completed.~~ **REWRITTEN AT v2.** Both were provenance gates keyed on WHO acted — verbatim the option the sitting REJECTED (A3-OQ-6 column A), against TA-P1 C, the recorded dissent and the contract's "unmatching any pair, not only her own". **She unmatches any pair and voids any statement or reconciliation**, walled only by DB-owned facts: **M8** (reversal/mirror), **M14** (a later reconciliation depends on it), **M15** (live/pending matches on the statement). `wake_enter_bank_statement` is still not built (OQ-1) and the remap/deactivate/reactivate siblings are still not built (OQ-2) — **those two remain fail-closed design defaults, not walls.** | **REWRITTEN — material M5** |
| **A25** | **NEW at v2 — the extraction parameterises exactly TWO literals** (`origin` in `_match_bank_line_core` and `_settle_from_bank_line_core`), each defaulting to today's live value when `p_ctx->>'is_agent'` is absent, each proved by a differential cell. "Byte-identical by construction" is a claim about the HUMAN caller's output, and now says so. | nit N3 |
| **A26** | **NEW at v2 — `bank_agent_receipts` carries `outcome` and an outcome-SCOPED uniqueness** (`unique(op_key)` + a partial unique index on `(act_kind, subject_id) where outcome='admitted'`), a refusal's `subject_id` is the anchor LINE, and `retry_after` on the refusal row is the clock's `retry_later` carrier. ONE home, not F-A2's two — with the reason named. | material M6 |
| **A27** | **NEW at v2 — `clara.bank_agency_holds` is specified** (client PK, FORCE RLS, human SELECT-only, zero machine grants, its own census row): the THIRD new table, and the relation the Tier-A rung and the due predicate read. | blocker B3 |
| **A28** | **NEW at v2 — the registration wall reads `bank_account_proposals.header`, not a filed statement**, and `wake_add_bank_account` takes `p_proposal_id`. The wall lives in the AGENT core only. | material M3 |
| **A29** | **NEW at v2 — `clara_wake_bank` KEEPS its dedicated group role, and PR-2 carries the wiring that makes it reachable**: a new login `clara_wake_bank_login` (member of `clara_wake_bank` alone — the two-login law N10's one-group shape, `pools.mjs:50-58`), its own max-2 write pool, DSN and Fly secret, and a `setupSql('clara_wake_bank', false)` checkout path. **Rejected alternative, recorded:** grant the wrappers to `clara_wake_interactive` and let the allowlist scope them (D34's path for `interactive_client`) — cheaper, but it makes every unattended bank verb EXECUTE-reachable from the chat pool. | material M4 |
| **A30** | **NEW at v2 — every role-keyed closed world EXTENDS with `clara_wake_bank`** (census C17/C18): the four bank role lists, `rig-helpers.mjs`'s `ROLES` map, and the inverse wiki scan's grantee list. C5/C6 are re-worded from "stays true verbatim" to "stays true verbatim **AND** the role list extends". | material M4 |
| **A31** | **NEW at v2 — PR-1 is SEVERED four ways** (pure extraction · the agent limb · the egress purpose · the clock, gated), applying in ONE combined ceremony window at train-merge. **Rejected: removing OQ-6/OQ-7 from the train** (both are contract scope, both already ride PR-3, and D34 is on point). | width ruling, Annex O.3 |
| **A32** | **NEW at v2 — `_approve_entry_core` is the TENTH generation, not the ninth** (`0053`'s splice B makes the live tip the 8th; F-A2 ships the 9th). Whether a tenth body is needed at all is **P-14**; it is on PR-1b's list conditionally. | truing from F-A2's PR-1 design trues |

---

## Annex M · Human acts and the doors

### M.1 · Human acts this item requires (R-C, made executable)

**Before any DB PR merges:** the owner's **digest re-sign** for the two pending constitutional
amendments (gate **G0**). **Before PR-2 opens:** the **wake-execution mechanism ruling** (gate
**G1**, Annex P.2 item 1).

**Before the live run:**

1. ~~Register the real bank accounts.~~ **SUPERSEDED at v2 by the owner's 2026-08-22 directive:
   bank-account registration is NOT an owner item.** It happens in **F-A7b's onboarding interview**
   on the real run after the **Wave-G reset**; the RM39,252.03 drawer-2 vacuous green is a test-era
   artefact the reset discharges. F-A3 accepts against RPA and a seeded fixture and RECORDS the live
   BELCORT round as sequenced behind the reset (TA-P14 clause 4).
2. **Sign and activate the `bank_matching` egress purpose** per client (two owner-level acts,
   `grant_client_egress_purpose` + `activate_client_egress_purpose`) — and the **C6 checklist** (DPA
   · client disclosure · PDPA cross-border basis) is critical path for it. **The agent drafts the C6
   pack; the signature acts stay the owner's; the real-data egress flag stays OFF until signed**
   (owner directive, 2026-08-22) — which blocks PR-1c's live use, not the build on test data.
3. **Grant the new agent authority** — the `clara_wake_bank` role, its single EXECUTE grant, the
   allowlist rows, **and (v2, A29) the `clara_wake_bank_login` role, its password and its Fly
   secret**. A grant is a human act (law 71); it lands with the ceremony, and any password-bearing
   step stays the owner's.
4. **The ceremony itself** — run from merged `main`, ONE combined D1 write-quiesce window over
   PR-1a + PR-1b (+ PR-1c if C6 has landed).

**Standing, unchanged by this item:** every `except_bank_line` is an owner-level human act ·
lifting ROME SECRETARY's name-only policy is OWNER-only through 0063's audited door · opening-seed
approval, close keys ②③, statutory wording, `canonical` definitions, capability grants and e-filing
stay human (law 71's enumeration).

### M.2 · The human doors F-A3 must build (TA-P14 clause 2)

| human act this item manufactures | door | where |
|---|---|---|
| approve a proposed line exception | one click that calls `except_bank_line` with the proposal's payload; `t_bank_agent_proposal_accept` stamps the flip | `/bank` StatementDetail — replaces the retiring coding chip's slot |
| answer a bank ambiguity question | the existing questions surface, extended with the `bank_line` scope | `/queue` |
| hold / release the bank lane | the HOLD switch over `bank_agency_holds` + the "Clara will reconcile X tonight" notice | `/bank` header |
| confirm an identifier promotion | one click → the audited `client_identifiers` path; `promotion_target_unavailable` when the payer is not a client (OQ-8) | `/bank` + `/clients` |
| register a bank account Clara proposed | the existing `AddBankAccountPanel` pre-filled from the `bank_account_proposals` row | `/bank` |

---

## Annex N · Dependencies, sequencing, and the change log

### N.1 · Dependencies

| on | what F-A3 needs from it | if it slips |
|---|---|---|
| **F-A2 PR-1..PR-3** | the `_approve_entry_core` agent arm + `entry_post_receipts` + `t_je_agent_post_receipt`. **F-A2 ships the NINTH generation; F-A3's would be the TENTH** (A32, P-14) | F-A3 cannot post an adjustment OR a settlement — the whole lane stalls at F2/F13 |
| **F-A2 D34** | `wake_open_question` re-keyed onto the CLIENT PIN (`0011:1984-2007`) | F-A3 carries the re-key itself (survey F10) — one extra D1 body |
| **The G1 mechanism ruling** | a runnable task kind (or a consumer for the held wake projection) | **PR-2 does not open**; PR-1a…PR-1d proceed |
| **F-A1 / opener ②⑥ / `0102`** | witness-paired statement facts + the chain | already merged; F-A3 re-opens none of it |
| **TA-P1 / TA-P7 digest re-sign** | the constitutional gate G0 | PR-0 proceeds; every DB PR waits |
| **C6 (DPA · disclosure · PDPA basis)** | the `bank_matching` purpose | **PR-1c waits**; the rest of the train does not |
| **F-A4 / F-A5** | *nothing* — but they share A12's clock source and G1's mechanism | whichever lands the mechanism owns it; the others extend |
| **F-T4** | drawer-1's P-3 census stays there; the registry-vs-ledger predicate is shared, one owner two call sites | the drawer-2 arm still ships (A18) |

### N.2 · Shared bodies with other items (the collision map)

- **`_approve_entry_core`** — F-A2 ships the 9th generation, F-A3 would ship the 10th. **Strict
  ordering, not a merge**: F-A3 authors against F-A2's merged prosrc and pins its sha.
- **`mint_wake_credential` + both `wake_credentials` CHECKs** — F-A2's D34 touches them for
  `interactive_client`; F-A3 for `bank_agent`; **F-A4/F-A5 will follow.** Each is extend-only, and
  each PR must re-read the LIVE CHECK text rather than the file.
- **`open_questions`' CHECK family** — F-A7 also extends it (a firm-scoped unattributed carrier,
  TA-P7 rider 4). **Whoever lands second re-reads and extends**, and the PR says so.
- **`chatTurn_v13` is ALREADY CLAIMED by F-A2's PR-2** (`f-a2-agentic-posting-design.md:438`). F-A3's
  chat parity (OQ-6, PR-3) reads the LIVE registry at authoring time and takes the next free
  version — never a version named in a design doc (constraint 9).
- **`agent_tasks`' kind CHECK and both `_tf_agent_task_*` bodies** — if G1 rules mechanism (a), these
  are D1 bodies shared by F-A3, F-A4 and F-A5. **One item lands them.**
- **`finalize_close`** — **not F-A3's**; named here only so the record shows this item does not join
  the TA-P4/TA-P6/task-#17 window.

### N.3 · Change log

**v1 (2026-08-22)** — first issue. Written against `main@cfa0710` from: the Wave-F contract §F-A3 +
the F-A10 clause; the 2026-08-22 Track-A sitting rulings **TA-P1 C, TA-P3 A, TA-P4 A, TA-P5 A,
TA-P6 A, TA-P7 C, TA-P8 B, TA-P11 A, TA-P14 A** and their member tables (A3-OQ-1..12, A3-M-WCA-R6,
A3-M-advance, A3-M-propose, A3-M-60day); the standing-laws digest; and a byte-level estate survey.
**Carried forward from F-A2 as method, not as content:** the tiered ladder with typed tokens and a
three-valued vector · the wrapper/core/delegate idiom · acting-identity receipts with a structural
trigger · the contract-blind battery · the derived D1 list · the decision register · predictions
instead of assertions.

### v1 → v2 (design gate 1: 5 blockers, 6 materials — record: `bank-agency-gate-record.md`)

**The gate ran 2026-08-22 on two lenses** — a BYTES lens that re-derived every estate claim at the
cited file:line, re-walked the CoR lineage of every body the design plans to cut and forced each
battery cell against the live bytes (11 findings), and a RULINGS lens that measured every act against
TA-P1..TA-P14 and the contract (5 findings). Every finding was adversarially verified by an
independent lane; the verifier's re-graded severity governs. **Verdict: the seam idiom, the ladder's
shape, the receipt discipline and the retirement inventory HOLD; five blockers and six materials bind
the build; PR-1 is severed four ways.** What HELD is recorded in the gate record so it is not
re-argued.

**F1 (B1) — the SETTLE limb is three more live money bodies, and P-2 is RETRACTED.** v1 declared the
settlement half CoR-free because `_settle_from_bank_line_core` is "already ctx-shaped". It unpacks
`actor`/`firm` only (`0044:1722`) and rebuilds shallow sub-ctxs at `:1908`/`:1927`/`:1946`; both
allocate cores re-derive the same two keys again (`:1051`/`:1367`), stamp `last_human_editor`
(`:1296-1299`, `:1580-1583`), self-approve with a 3-key ctx (`:1324-1335`, `:1608`) and branch to a
DRAFT on `is_high_stakes`; and the settle core hardcodes `origin` from `p_via_rule` (`:2091-2094`).
As written, every agent settlement either ABORTS at COMMIT with no refusal receipt or posts
attributed to a human editor who does not exist. **Fold:** Annex A.2b (the four-body table), §3.4,
§3.2's high-stakes bullet, register **A4b**, H.4's four new cells, D1 list PR-1b, prediction
**P-2′**. **Method lesson minted:** *a body is only ctx-shaped for the keys it actually UNPACKS.*

**F2 (B2) — the clock's execution path does not exist; A11 is RETRACTED and gate G1 is minted.** A
`kind='wake'` `agent_task` is a HELD PROJECTION (`0011:1230`, `:1271`, `0006:214`, `:443`,
`:570-581`); `drain.mjs:77-90` is its only writer; nothing consumes it; `reconciler.mjs:184-189` says
so in a comment; and §3.3's Tier-D `failed` settlement raises CLR13 under the same matrix. **Fold:**
Annex D.0, §3.6, register **A11 retracted** / **A12** annotated, C11 re-cut, **P-8′** re-cut into a
prediction that can fail, gate **G1** in Annex O.1, H.6's run-completes cell. **ESCALATED** — the
mechanism is an owner/architecture decision and is CROSS-ITEM with F-A4/F-A5 (Annex P.2 item 1).

**F3 (B3) — Annex J was under-derived and its own counts disagreed four ways.** "Eleven CoRs" vs a
twelve-row table vs "ten extracted verbs" vs A.2's nine; "three new tables" naming two; the entire
egress limb (5 live bodies + 4 ACCESS EXCLUSIVE CHECK swaps) absent; the promised 9th
`_approve_entry_core` body absent; the hold relation named in three places and specified nowhere.
**Fold:** Annex J re-derived per PR and published ONCE — **24 CoR'd live bodies, 11 DDL groups, three
new tables**; `clara.bank_agency_holds` specified (**A27**); the egress limb becomes **PR-1c**
(**A13**); `_approve_entry_core` listed conditionally as the TENTH generation (**A32**, **P-14**);
**P-11′** predicts the corrected number. *(The finding's sub-claim that the settle/allocate cores
were "missing from Annex J" was struck by its verifier as an argument — they were out of the
design's scope text entirely — but the requirement lands via B1 regardless.)*

**F4 (B4) — `except_bank_line` cannot stay untouched, and the proposal's `accepted` flip had no
writer.** A.4 made the human owner-floor verb write `bank_agent_proposals.accepted` and
`ck_bap_terminal` forced `decided_by`/`decided_at` with it, while Annex J said the verb is "never
touched by this item, in any PR" and §Q's non-goal says "no `except_bank_line` widening, ever".
**Fold:** `t_bank_agent_proposal_accept`, an AFTER-INSERT trigger on `bank_line_exceptions`,
declared judgement logic and on the D1 list (**A17**); `declined`/`stale` dropped from the CHECK for
want of a writer (law 31); Annex J's exclusion line corrected; H.6's three cells; the read-side
eligibility filter in Annex G property 5.

**F5 (B5) — TA-P8's granted promotion door had a schema, a human door and NO writer.** `kind`
admitted `identifier_promotion`, §3.9 narrated raising one and §3.13 built the door — and no verb in
Annex A could ever write the row. **Fold:** `wake_propose_identifier_promotion` + its core + the
`identifier_promotion_propose` act_kind + H.6's end-to-end cell (**A15**). **PARTIALLY ESCALATED**
(OQ-8 / owner item 2): the estate has no counterparty-bank-account identifier relation, so the
CONFIRM half is scoped to client-payers and reports `promotion_target_unavailable` otherwise —
inventing an identity relation next door to constraint 12 is not a design-lane act.

**F6 (M1) — the drawer-2 repair could not reach its own headline cell.** Repairs 1 and 2 both iterate
a registry that is EMPTY on a zero-account client (`0056:989-993`; `0040:4113`'s INNER JOIN), so the
gate still returned `pass` on exactly the acceptance shape H.0 names. **Fold:** a fourth arm,
`no_registered_account` (**A18**); R-F 1 restated as OWNERSHIP not absence, with the shared predicate
as a sequencing obligation; **P-4′** re-worded to name its population; owner item 3 confirms the
boundary reading.

**F7 (M2) — the extraction breaks the estate's only instrument for the house lock order.** Five
prosrc/overload pins read the PUBLIC body, and `fnSource` concatenates same-named overloads only.
**Fold:** census **C17**, Annex C's disposition table (MOVE each pin to the core, ADD the
"wrapper acquires nothing" pin, never delete), H.1's two new cells, the exact overload count through
PR-3, and Annex I's second-breakage-source paragraph.

**F8 (M3) — the registration wall read a surface that cannot exist.** Wall (2) wanted two-channel
agreement "on a filed statement" for an account that by definition has none
(`0038:401`'s NOT NULL FK). **Fold:** re-anchored on `bank_account_proposals.header`;
`wake_add_bank_account` takes `p_proposal_id`; the wall is AGENT-core-only with a RED-first human
cell (**A28**).

**F9 (M4) — a new SQL role entered five role-keyed closed worlds unnamed, and no pool could assume
it.** **Fold:** censuses **C17/C18** and the C5/C6 re-wording (**A30**); the dedicated role KEPT with
its own login, pool, DSN and Fly secret in PR-2 and Annex M.1 (**A29**), with the
`clara_wake_interactive` alternative recorded as rejected. *(The `wave-a-grants.test.mjs` citation
was corrected — it is a Wave-A grant matrix, not a bank census.)*

**F10 (M5) — OQ-3 and OQ-4 re-imposed a human gate the owner had just removed.** "Her OWN matches"
and "only what she filed" key on WHO acted, not on a DB-owned fact; the sitting rejected exactly that
option (A3-OQ-6 column A) and the contract says "unmatching any pair, **not only her own**". **Fold:
WIDENED to the ruling** — the gates are gone, replaced by **M14** and **M15**, two rungs over facts;
§1, §3.2, §3.3, Annex P's OQ-3/OQ-4 (now CLOSED), register **A24** rewritten, H.3's two new cells,
and Annex Q's honest restatement of the cost the owner accepted.

**F11 (M6) — the receipt table's uniqueness contradicted the clock it serves.** `unique(act_kind,
subject_id)` aborts the second visit to a candidate that `retry_later` exists to re-offer. **Fold:**
`outcome` + `unique(op_key)` + a partial unique index on the admitted rows; the refusal's
`subject_id` named; `retry_after` as the parking carrier (**A26**); H.3's retry cells; Annex D's
`retry_later` row re-derived.

**Nits, folded without argument.** **N1** three cite drifts trued (`0038:8021`→`:8025` in the survey
and Annex G; `0011:634-635`→`:637-639` in C11 — v1 pointed at a `firm_limits` CHECK on a different
table; `0011:1155`→`:1156`); the fourth item (C2/C3's disposition column) was REFUTED — Annex I and
the survey's retirement table already name all eight individually, so C2/C3 are NOT widened.
**N2** Annex B.5's ground for B10/B11 restated (the bank lane DOES set `coding_kind`; the reason they
are inert is that it is never `supplier_bill`/`sales_invoice`). **N3** register **A25** names the two
parameterised `origin` literals explicitly. **N4** OQ-6 now names and distinguishes D34 in its own
bullet. **N5** `_approve_entry_core`'s generation trued to the TENTH (**A32**).

**Structural.** The design doc reached its 500-line ceiling under the fold. v1's **§4** (owner
questions), **§5** (build sequence) and **§7** (risks) moved to the new
`bank-agency-annexes-3-build.md` as **Annexes O/P/Q**, which also absorbed **Annex J** (now three
per-PR lists) and **Annex L**; v1's **§6** (battery gating cells + acceptance) moved to **H.0**
above; v1's **§3.12** retirement inventory folded into **Annex I** and its **§3.13** doors table into
**M.2**; and **Annexes E/F/G** moved to the new `bank-agency-annexes-4-surfaces.md`. The design's new
**§4** is the pointer that names all of it, and the annex map in every file's header is current.

**Open at v2:** OQ-1, OQ-2, OQ-5, OQ-6, OQ-7 and the new OQ-8 (Annex P), all proceeding under the
standing delegation; gates **G0** and **G1**; the four owner items (Annex P.2); and the predictions
P-1…P-17 (Annex L).
