# F-A3 — bank agency: DESIGN v2

> **Design doc of record for Wave-F Track-A item F-A3** (`docs/plan/active/wave-f-contract.md`
> §F-A3), carrying its share of **F-A10's retirement clause** (the BANK rules machine) and of
> **TA-P14's definition of done** (the drawer-2 bank gate's measurement origin).
> **v2, 2026-08-22 — gate 1 folded (record: `bank-agency-gate-record.md`).**
> Binds under **ADR-0071** (digest laws **71-76**) and the **2026-08-22 Track-A sitting rulings**
> **TA-P1 C · TA-P3 A · TA-P4 A · TA-P5 A · TA-P6 A · TA-P7 C · TA-P8 B · TA-P11 A · TA-P14 A**,
> plus digest laws **1, 2, 3, 6, 9, 10, 13, 14, 15, 19, 27, 28, 29, 31, 34, 68, 69**. Every build PR
> takes the uniform ADR-061 ladder; **every rung of §3.3 is judgement logic** (review law 1).
>
> **TWO GATES STAND BEFORE THE BUILD.** **G0** — the owner's digest re-sign for TA-P1's open
> register and TA-P7's invariant-(a) rewrite; no DB PR opens without it. **G1 (NEW at v2)** — the
> **wake-execution mechanism ruling**: at the bytes a `kind='wake'` `agent_task` is a HELD
> PROJECTION with no consumer and no legal transition but held→cancelled, so **the clock's stated
> spine cannot execute** (gate blocker **B2**). G1 blocks PR-2 and the clock belt; it does not block
> PR-1a…PR-1d. Both gates and the revised build sequence: **Annex O**.
>
> **Companions.** `bank-agency-survey.md` (the estate as-found: **13 findings, 18 closed-world
> censuses, the CoR lineage**) · `bank-agency-annexes-1-mechanics.md` (**A** verbs and columns ·
> **B** the ladder · **C** locks · **D** the clock) · `bank-agency-annexes-2-record.md`
> (**H** battery · **I** retirement · **K** decision register · **M** human acts and doors ·
> **N** change log) · `bank-agency-annexes-3-build.md` (**O** build sequence, the two gates and the
> width ruling · **J** the D1 list · **L** predictions · **P** owner questions · **Q** risks and
> non-goals) · `bank-agency-annexes-4-surfaces.md` (**E** egress · **F** the gate repair ·
> **G** the read surface) · `bank-agency-gate-record.md` (the PR-0 gate).
>
> **Four method lessons, each of which cost a finding:** an unsettleable claim is carried as a
> **PREDICTION for rig replay** · **line numbers come from the instrument that prints them** · **a
> body's live tip is found by CoR lineage** (two live bodies here have no file text at all, survey
> §4) · **NEW, minted by this gate: a body declared "already ctx-shaped" is only ctx-shaped for the
> keys it actually UNPACKS** — read the unpack, not the signature (B1).

---

## 1 · The ruled shape (fixed, not designable)

- **Unattended bank matching and adjustment, under F-A2's posting regime.** The agent proposes,
  decides and WRITES the match; adjustments are booked through the same `_approve_entry_core` the
  human lane uses, with the agent arm F-A2 minted (`approval_arm='agent_unattended'`). No amount
  routing, no ramp, no sampling, no dark launch — **permanently** (law 71 / G1.2 / G1.3).
- **Clara's, per TA-P1 C** (the OPEN REGISTER: every act law 71 does not reserve is hers):
  `complete_bank_reconciliation` · `void_bank_reconciliation` · `match_bank_line` ·
  `unmatch_bank_match` — **any pair, not only her own** (contract §F-A3) · `settle_from_bank_line` ·
  `resolve_bank_line_exception` · `resolve_and_book_bank_line` · `void_bank_statement` —
  **any statement, not only the ones she filed** · `add_bank_account` · `upsert_account` ·
  **both ack switches** — the cross-period exception (`p_ack_period_exceptions`) and the 60-day
  stale waiver (`p_ack_outstanding`) — the latter **with TA-P1's mechanical duplicate-payment wall
  rider**. **`except_bank_line` stays HUMAN at owner floor** (law 71's enumeration); the agent may
  PROPOSE one with her reason, and **no `accept_*` verb is minted** — the owner's one-click IS
  `except_bank_line` (A3-M-propose), and the proposal's acceptance is stamped by a trigger on
  `bank_line_exceptions`, **not** by widening the verb (gate blocker **B4**, §3.5).
- **TA-P1's riders are design law here:** new authority arrives as **wake SIBLING verbs**; **no live
  human verb changes its floor, its arity, its ACL or its semantics**; capabilities are **default-on,
  no per-firm dial**. **The riders bind the walls too:** a wall that keys on WHO performed a prior
  act is a narrowed grant wearing a wall's clothes. The only walls this item builds key on
  **DB-owned safety facts** (gate material **M5**, Annex P).
- **TA-P3 A — a `bank_matching` named purpose per client**, signed and activated by the owner. An
  unsigned client's **bank agency does not run at all** (fail-closed, never a silent downgrade).
- **TA-P5 A — the clock.** The bank lane is **event- AND clock-driven**, under law 71 (no ramp, no
  first-run draft, no sampling), **data-gated**: a missing statement yields a CHASE NOTICE, never a
  fabricated reconciliation; a client who dumps twelve statements at FY end is reconciled in chain
  order on the event. A visible notice and a human **hold** switch ship with it. **The EXECUTION
  path this ruling presumes does not exist at the bytes** — gate G1, §3.6.
- **TA-P8 B — learned payer accounts are CONTEXT, never keys.** A bank account number Clara learns
  by judgement enters the knowledge layer as context for her next judgement; it becomes an
  exact-match key only through (i) human confirmation or (ii) a printed identifier both witness
  channels read identically. The **promotion door** is a typed proposal + one human click — and at
  v2 the PROPOSING half is built and the CONFIRMING half is scoped to the one case the estate can
  key today (gate blocker **B5**, §3.9). The name-only wall is untouched and unextended.
  **[ADR-0075 2026-08-23]** Was "Constraint 12 (ROME SECRETARY name-only)" — retired as a *named* constraint; the GENERIC wall (`0062`/`0063`) is unchanged, so this clause binds as written.
- **TA-P7 C — attribution is her judgement**, with the walls-validate riders: a printed identifier
  that maps to a DIFFERENT counterparty **refuses and asks**; a name-family collision (the ROME
  family) **must clarify**; a wrong call has a correction path.
- **TA-P11 A — the bank rules machine RETIRES WHOLE**: the three verbs, the acceptance verb, the
  sighting predicate, the two rule arities and the four dashboard surfaces. **Writes stop; history
  stays as knowledge fuel.** **E-R13's mechanical settlement door is ABSORBED here and RECORDED as
  dissolved**, not silently dropped (contract F-A3, TA-P11's clause-2 shape).
- **TA-P14 A — done means the loop is walkable**: F-A3 repairs the gate its own output feeds (the
  drawer-2 bank gate's **measurement origin**), builds the minimal human door for every human act it
  manufactures, gives every proposal a durable carrier, and accepts on real books where they exist.

---

## 2 · The estate in one paragraph (the survey is the authority)

The agent today **cannot read a single bank row** — zero machine grants on every bank relation, every
verb `_human_ctx`-floored (survey F1). Ingest is already witness-paired (`0102`). The matching
arithmetic, the exclusivity index, the per-side capacity belt and the exact-zero group tie are live
and stay untouched. Four findings shape everything below: **F2** — the adjustment writer stamps a
human editor and self-approves, so it aborts under F-A2's receipt trigger the moment an agent runs
it; **F3** — F-A2's amount-anchor rungs are invoice-shaped and can never pass for a bank-born entry,
so the bank lane's anchor is the **group tie** plus the statement's own corroboration ladder; **F5** —
the drawer-2 bank gate measures from statements and its stated boundary is false at the bytes; and
**F13 (NEW at v2, gate blocker B1)** — **F2 is not one body but four**: `_allocate_receipt_core`
(`0044:1296-1299`) and `_allocate_payment_core` (`0044:1580-1583`) stamp the same
`last_human_editor` lie and branch to a DRAFT on `is_high_stakes`; `_settle_from_bank_line_core`
(`0044:1706`) unpacks **only** `actor`/`firm` from `p_ctx` (`:1722`) and rebuilds shallow three-key
sub-ctxs at `:1908`/`:1927`/`:1946`, so every agent identity marker is discarded one frame down; and
it hardcodes `origin` from `p_via_rule` at `:2091-2094`, so an agent settlement writes
`origin='human'`. **P-2 is RETRACTED.**

---

## 3 · The design

### 3.1 The verb set — wake wrapper, ungranted core, shared delegate

The `0077`/`0078` idiom exactly (`0078:88-107`): a **granted wrapper** that resolves the credential,
refuses without one, asserts the per-kind allowlist row, refuses a blank op key / rationale / model,
and **carries no DML**; an **ungranted core** that holds the ladder, the receipt and the delegation;
and a **shared delegate** — the estate's own body, extracted once, called by both lanes.

```
wrapper   clara.wake_match_bank_line             granted to clara_wake_bank and nothing else
core      clara._agent_match_bank_line_core      ungranted: ladder + receipt + delegation
delegate  clara._match_bank_line_core(p_ctx,…)   THE ESTATE'S OWN BODY, extracted (D41 idiom)
public    clara.match_bank_line(…6 args)         unchanged name/arity/ACL — a thin delegate
                                                 passing the human ctx from _human_ctx
```

**Ten wake siblings ship** (signatures in Annex A.1): `wake_match_bank_line` ·
`wake_unmatch_bank_match` · `wake_settle_from_bank_line` · `wake_complete_bank_reconciliation` ·
`wake_void_bank_reconciliation` · `wake_resolve_bank_line_exception` ·
`wake_resolve_and_book_bank_line` · `wake_propose_bank_line_exception` ·
**`wake_propose_bank_identifier_promotion`** (TA-P8's promotion carrier, renamed bank-scoped by
conductor arbitration 2026-08-24 — NEW at v2, blocker B5) ·
`wake_add_bank_account` — plus **two structural siblings** (`wake_upsert_account`,
`wake_void_bank_statement`) and **one read** `wake_get_bank_pack` (§3.8). **Thirteen verbs.**

**Why cores are EXTRACTED and not duplicated.** TA-P11's own test — *shared deterministic core +
one entrance per surface = ONE architecture; two mutually-unaware computations for one fact = two* —
forbids a second copy of the matching arithmetic. TA-P1's rider forbids **rewriting a live human
body into a dual-channel body** (the A4-M1 option C the owner did not take). A **body move** that
leaves the public name a thin delegate satisfies both: the human path's floor, arity, ACL and
semantics are byte-identical by construction, and the estate has done exactly this before (F-A2
**D41**, `_assert_supplier_bill_shape_at` → `_projected`).

**The price, re-derived at v2 and published ONCE (gate blocker B3).** **NINE** bodies are pure
extractions; **TEN** more are re-cut for the agent limb (one, `_approve_entry_core`, conditional on
P-14); **FIVE** more for the egress purpose. **Twenty-four CoR'd live bodies, eleven DDL groups,
three new tables** — severed across three windowed PRs, one combined ceremony window. Every other
sentence in this set quotes that number. List: **Annex J**; severance: **Annex O**.

**The agent never picks an authoritative input** (`0078:135-152`): a blank `p_rationale`, an
incomplete `p_model`, a null op key or a caller-invented amount refuses by name. The op key is
**derived and deterministic**; the inner keys (`:adj:N`, `:settle`) are **derived, never minted**
(`0038:3954-3976`).

### 3.2 What F-A3 deliberately does NOT build (each with its reason)

- **`wake_enter_bank_statement` is NOT built.** The hand-key door presents the payload as
  `reader1.engine_id='human'` with `corroboration.verdict='human_keyed'` (`0038:2143-2148`); an agent
  using it would **assert a corroboration channel that did not happen** (law 72; law 1 / constraint
  2). Clara already enters statements unattended through the witness pipeline (`0102` +
  `persist_statement_facts_v2`) — a second entrance is TA-P11's second architecture. **The ruled act
  is exercised; the human door stays for documents no machine can read.** *(OQ-1, Annex P.)*
- **`remap_bank_account_coa`, `deactivate_bank_account`, `reactivate_bank_account`** get no siblings
  in v1. Not built ≠ narrowed: the human verbs keep working. Re-binding a live account's GL code is
  the "silent wrong-COA" hazard the TA-P1 dissent named, and it has **no mechanical wall available**
  (unlike registration, §3.10). *(OQ-2.)*
- **No pending/high-stakes reservation on the agent lane** — and at v2 this is WORK, not an absence.
  The composite's high-stakes branch mints a DRAFT for a human checker
  (`_allocate_receipt_core` `0044:1324-1335`, the AP twin `:1608`), and `is_high_stakes` is **not an
  amount test alone** (`0009:1513-1518` — opening balance, year end, tax-affecting, an
  `amount_override` flag, OR Σdebits ≥ the firm threshold). Both allocate cores therefore gain an
  **explicit agent arm that posts LIVE** (D28's asymmetry), and `_settle_from_bank_line_core`'s
  `v_match_status` (`0044:~1975`) can no longer land `'pending'` on the agent lane. **The human
  lane's RM100,000 distinct-checker gate stands byte-untouched.**
- **No amount threshold anywhere on the agent lane** — not for adjustments, not for settlements, not
  for waivers. Any such threshold is amount routing, which G1.2 forbids permanently.
- **No provenance gate.** She unmatches any pair and voids any statement or reconciliation. The
  rungs that stop her are DB-owned facts (§3.3 M8, M14, M15), never *who acted before her* — the
  contract's own words, and gate material **M5**.

### 3.3 The gate ladder — four tiers, three-valued, receipt-bearing

Same shape as F-A2 §3.2, **with the bank's own rungs**. **Tier membership is a fact about
`pg_trigger.tgdeferrable`, derived by RIG REPLAY, never a hand list** (F-A2 **D5**); the table in
Annex B is a PREDICTION until PR-1b replays it.

**Tier A — authority and shape. RAISE (CLR\*).** No credential → CLR03 · kind not allowlisted →
CLR03 · blank op key / rationale / model → CLR10 typed · client not in firm → CLR11 · **the
`bank_matching` purpose is signed AND active** → CLR10 `purpose_unconsented` · **the client's bank
hold is off** (`clara.bank_agency_holds`, §3.6) → CLR10 `bank_agency_held` · the locks, **in the
delegate's own order** (Annex C; the R-L2/D40 lesson — taking any other order deadlocks ABBA against
a concurrent human act) · statement live · line/entry tenancy.

**Tier B — the admission rungs. TYPED NON-POST RECEIPT, no raise; the transaction COMMITS so the
reason is durable. ALL rungs are evaluated always; the receipt carries the full three-valued vector;
admission requires an empty vector** (F-A2 **D7**; `not_evaluable` is never `pass` — law 68).

| # | rung | source | token |
|---|---|---|---|
| M1 | no member line is under an OPEN exception | `0040` S4.4a splice (`0040:5369-5375`) | `line_excepted` |
| M2 | the group ties to the sen: `Σ line = Σ entry + Σ adjustment` | `0038:4058-4066` | `tie_nonzero` |
| M3 | **no second candidate group ties equally well** (the same-amount ambiguity) | NEW — contract F-A3 | `same_amount_ambiguous` |
| M4 | **no printed/registered identifier contradicts the counterparty she chose** | TA-P7 rider 1 | `payer_identifier_contradiction` |
| M5 | **exactly one counterparty candidate survives the name-family guard** | TA-P7 rider 2 | `counterparty_collision` |
| M6 | **an inflow that no open item absorbs and that has no document anchor is not booked to income unattended** | NEW — the loan-vs-settlement backstop | `unexplained_inflow` |
| M7 | every adjustment names an active, non-control expense/income account that is not the bank account | `0038:3724-3735` (pre-checked here) | `adjustment_account_invalid` |
| M8 | no member entry is reversed or a reversal mirror | `0038:4103-4118` | `reversed_entry` / `reversal_mirror` |
| M9 | per-side capacity is not exhausted | `0038:4130-4152` | `capacity_exhausted` |
| M10 | **no member entry anchors a CANCELLED reservation** (the orphan belt, pre-checked) | `0038:7704-7727` | `orphaned_reservation_draft` |
| M11 | **the 60-day waiver's duplicate-payment wall** (below) | TA-P1 rider | `stale_waiver_duplicate_risk` |
| M12 | the statement's own corroboration verdict is live and unsuperseded | `0098:853-855` | `statement_not_corroborated` |
| M13 | **the cross-period ack is stated when a member posts after period end** | `0038:4155-4166` | `period_exception_unacknowledged` |
| M14 | **NEW at v2 (M5 fold) — no LATER reconciliation depends on the statement or match being voided/unmatched** | `0040:2452` (the settled-authority belt, pre-checked) | `later_reconciliation_depends` |
| M15 | **NEW at v2 (M5 fold) — a statement being voided carries no live or pending match** | `0038:3588` (the void belt, pre-checked) | `statement_has_live_matches` |

**M14/M15 replace the withdrawn provenance gates.** v1's OQ-3/OQ-4 refused a human-authored match
and a statement she did not file — both key on **who acted**, which TA-P1 C and the contract's
"unmatching any pair, not only her own" forbid. Their *safety* content is a DB-owned fact and is now
two rungs pre-checking belts the estate already runs. Gate material **M5**; register **A24** rewritten.

**M11, the duplicate-payment wall, in full** — this is the rider that made TA-P1's 60-day grant
safe. Before the agent may acknowledge a stale outstanding item by id, the DB asks, mechanically:
does another **posted, unreversed** entry exist for the **same counterparty**, the **same absolute
cents**, within a **±N-day window** of the stale item, that is itself unmatched or outstanding? If
yes, the item **cannot be waived unattended** — the reconciliation refuses with the item named and
raises the question (§3.5). *This is a duplicate-PAYMENT test, not an amount threshold: it fires at
RM10 and at RM100,000 alike.* Formula, window and the near-miss arm: **Annex B.3**.

**M6, the loan-vs-settlement backstop.** The wrong-direction settlement is already structurally
refused (domain from the counterparty's KIND, never the cash sign — `0044`'s S4.5 header). What is
NOT walled is **recognising an unexplained inflow as INCOME**: M6 refuses that class unattended (no
open item, no document anchor, no counterparty resolution ⇒ a typed question). **Evidence-class
routing, not amount routing** — F-A2's B15 move.

**Tier C — the delegated walls. RECEIPT BY CONVERSION on `(errcode, reason)` PAIRS ONLY** — no
wildcards, no errcode-only members, unknown re-raises (F-A2 **D6**; most bank raises already carry a
typed `detail.reason` — Annex B.4 lists the pairs and the three that need one added).

**Tier D — the genuinely deferred belts. ABORT, and it cannot be converted** (a deferred constraint
trigger fires at COMMIT, outside any exception block). Members: the group-tie belt (`0038:3249`),
the exhaustion belt (`0038:3362`), the congruence belt (`0038:3438`), the recon belt (`0040:2177`),
the settled-authority belt (`0040:2452`), the orphan belt (`0038:7704`), and F-A2's own
`t_je_agent_post_receipt`. **Every Tier-D abort settles the task `failed` with the commit error's
`(errcode, reason)` in `last_refusal`** — never a refusal receipt. **This clause is unexecutable for
a `kind='wake'` task** (`0011:1271` admits held→cancelled and nothing else) and is one of the two
reasons gate G1 exists; the settlement verb it needs is named with the mechanism, §3.6.

### 3.4 Acting identity and receipts (TA-P4, TA-P6)

**`clara.bank_agent_receipts`** — one append-only row per agent bank act, carrying `outcome`
(`admitted` | `refused`), the acting actor (`clara.agent_user_id()`), `on_behalf_of` (**NULL by
construction on the clocked lane — recorded, never inferred**, law 68), `via_wake_kind`,
`model_snapshot` (provider/model/version, each CHECKed non-blank — the F-A2 R-3 four-apostrophe
lesson), `rationale` (non-blank, ≤4000), `gate_verdicts` (`{verdict, rung_vector}`), the wake task
id, the op key, `retry_after`, and the **inputs digest** (the pack sha the judgement was made on).

**The uniqueness key is outcome-scoped** (gate material **M6**): `unique (op_key)` for replay
idempotency, and a PARTIAL unique index `(act_kind, subject_id) WHERE outcome='admitted'` — at most
one admitted act per subject, and **as many refusal rows as the clock legitimately produces**. v1's
flat `unique(act_kind, subject_id)` would have aborted the second visit to a candidate the clock's
own `retry_later` reason exists to re-offer. **A refusal's `subject_id` is the candidate group's
ANCHOR LINE id** (no `bank_matches` row exists to name), stated because the schema comment implied
otherwise. *Why one home and not F-A2's two:* `entry_post_receipts` binds a POST to an entry (one
entry, one post); `bank_agent_receipts` binds a JUDGEMENT ACT to a subject, and a judgement act
legitimately recurs. Columns and CHECKs: **Annex A.3**. **Zero DML grant to any role**; written
only inside the acting core, in the same transaction, so a Tier-C conversion rolls it back.

**Two structural walls make the receipt un-skippable** (F-A2's `t_je_agent_post_receipt` shape):
`t_bank_match_agent_receipt` (deferred: an agent-origin `bank_matches` row requires exactly one
**admitted** receipt) and `t_bank_recon_agent_receipt` (the same for an agent-completed
reconciliation). **ARM-0 first** (law 68) — declared, not assumed unreachable (law 31).

**TA-P6, at this lane.** The agent identity never occupies either end of a two-person wall. On the
clocked lane there IS no directing human, so `requested_by` is **NULL** and the receipt says
`agent_unattended` — never `two_person`, never a self-attestation asserting a judgement nobody made.
The human lane's maker/checker on settlements ≥RM100,000 is **byte-untouched**.

**Adjustments AND settlements ride F-A2's regime, and F13 is why that is four bodies, not one.**
`_bank_match_adjustment_entry` (`0038:3713`), `_allocate_receipt_core` (`0044:1034`) and
`_allocate_payment_core` (`0044:1353`) all become ctx-aware: on the agent arm `last_human_editor` is
**NULL** (it is not a human edit), the ctx carries `is_agent`, `on_behalf_of`, `wake_kind` and the
post-receipt id, and each body writes F-A2's `entry_post_receipts` row **before** returning —
otherwise F-A2's deferred trigger aborts the whole act at COMMIT. `_settle_from_bank_line_core`
**threads `p_ctx` through** to both allocate cores (replacing the fresh `jsonb_build_object` at
`0044:1927`/`:1946`) and derives `origin` from the ctx at `:2093-2094` instead of from `p_via_rule`,
so an agent settlement writes `origin='agent'` and the deferred receipt wall can see it.
**Which rungs of F-A2's ladder bind a bank-born entry is settled by finding F3 and stated as a closed
list in Annex B.5**, with each non-member's ground written down (law 31): B3/B4/B7/B8 are
invoice-anchor rungs and are **NOT members**; B5/B6/B9/B14/B15 **are**.

### 3.5 The two carriers: questions and proposals (TA-P14 clauses 2-3)

**Ambiguity → a typed open question.** `open_questions` gains **one scope kind** (`bank_line`) and
**one origin** (`bank_ambiguity`), each an extend-only CHECK swap with the existing disjuncts
byte-identical (the D34 shape). `ck_open_questions_scope` gains the congruent arm (scope_id = the
line, document_id = the statement's document, counterparty_id null). **`_open_question_blocks`
(`0012:87-108`) gains an explicit disposition and it is load-bearing: a `bank_line`-scoped question
must NOT block entry approval** — a client-scoped question blocks the client's entire posting lane,
which is precisely the freeze this design must not cause. It blocks **bank matching on that line**,
in the bank ladder (rung M1's sibling), and nothing else. The answer, when the human gives it, lands
in the client knowledge layer as context (law 73) — **not** as a signed rule and **not** as a
`client_identifiers` key (TA-P8).

**A proposed exception → `clara.bank_agent_proposals`** (append-only; kinds `line_exception` and
`identifier_promotion`). A proposal carries the structured payload the human door needs to act in
one click — for `line_exception`: `line_id`, the proposed `kind` (`bank_error`/`disputed`), the
reason text, the evidence document — and the dashboard's owner-floor button calls
**`except_bank_line` itself** with those arguments pre-filled. **No `accept_*` verb is minted**
(A3-M-propose): a lower-floor acceptance verb would be the owner floor quietly demoted.

**Who writes `accepted` — the gap blocker B4 found and how it closes.** v1 said the acceptance was
"a side effect of the owner's own act", but `except_bank_line` (`0040:3222-3294`) writes
`bank_line_exceptions` and knows nothing of any proposal, and Annex J forbids touching it in any PR
(§Q's non-goal repeats it). The flip is therefore written by **`t_bank_agent_proposal_accept`, an
AFTER-INSERT trigger on `clara.bank_line_exceptions`**: it resolves the OPEN `line_exception`
proposal for that `line_id`, stamps `status='accepted'`, `decided_by = the inserting actor`,
`decided_at = now()`. It is a **new trigger on a live table** — ACCESS EXCLUSIVE, on the D1 list
(DDL 5), and **declared judgement logic** (review law 1), because it decides whether a proposal was
accepted. `except_bank_line` stays byte-untouched, which is what TA-P1's rider and §Q's non-goal
both require. **v1's `declined`/`stale` statuses are DROPPED from the CHECK** — no verb writes them
and law 31 forbids listing a state nothing can produce; the queue simply does not offer an open
proposal whose line is no longer eligible (a read-side filter). The CHECK is extend-only later.

### 3.6 The clock (TA-P5 A) — and the execution path that does not exist

**The clock's only new act is emitting an event.** The runtime gains one leader-guarded cadence gate
beside the six that already exist (`leader.mjs:152-210`), calling a new DB-side due predicate
`clara.bank_agent_run_due(p_client)` built to the `depreciation_run_due` idiom
(`reconciler-fa.mjs:51-135`). When the predicate says there is **data** to work on — a live statement
with unmatched lines, a completable reconciliation, a line parked "retry later", a missing statement
past its expected date — the belt appends a client-scoped `bank.agent_due` domain event.

**What v1 got wrong, and gate G1.** v1 said "the estate's own spine does the rest (taxonomy decision
→ `wake_intents` → `agent_tasks(kind='wake')` → the workflow mints the credential and runs). **No
new `agent_tasks.kind`, no new relay path.**" **A11 is RETRACTED.** At the bytes a `kind='wake'`
task is a **HELD PROJECTION**: it must be created `'held'` (`0011:1230` raises *"a wake task is
created held"*), the live transition matrix `_tf_agent_task_update` admits **held→cancelled and
nothing else** (`0011:1271`; the prose at `0006:443`), `wakes_outbox` carries the same one-way guard
(`0006:214`, `:570-581`), `drain.mjs:77-90` is its only writer, and `reconciler.mjs:184-189` says
outright in a comment that a wake task can never leave `held`. **Nothing consumes it.** Autodraft
needed its own kind, its own insert arm (`0011:1231-1240`), its own transition arms (`0011:1272-
1276`) and the kind CHECK swap (`0011:637-639`) for exactly this reason.

**The mechanism is an owner/architecture ruling, not a design default (gate G1, cross-item).** Two
paths, both priced in Annex O: **(a)** mint `agent_tasks.kind='bank_agent'` on the autodraft
precedent — the kind CHECK swap plus D1 recuts of **both** `_tf_agent_task_insert` and
`_tf_agent_task_update` (two more live judgement-logic bodies) and an admission/enqueue path on the
`autodraft.mjs` model; or **(b)** keep `kind='wake'` and build the missing consumer explicitly
(what reads the held outbox, what starts `bankAgent.v1`, how the Tier-D `failed` settlement is
expressed given the matrix). **F-A4 and F-A5 ride the same TA-P5 source (A12), so whichever way it
is ruled, ONE item lands the mechanism and the others extend it** — Annex O states this as a
sequencing obligation, not an assumption. **The fail-closed default the design proceeds on:** no PR
in this train bakes a `kind`; PR-2 (which needs one) does not open until G1 is ruled; PR-1a…PR-1d
carry nothing that presumes it. C11's census row now says *conditional on G1*, and **P-8 is re-cut
into a prediction that can FAIL**: not "a task appears" but *"a `bank.agent_due` event ends in a
COMPLETED run with a `bank_agent_receipts` row"*.

**Data gating is structural, not prompt-level.** The due predicate answers with a NAMED reason; a
missing statement yields `chase_statement`, which produces a **notification**, never a
reconciliation. Twelve statements dumped at FY end are processed **in chain order** (the estate
refuses out-of-order continuity, `0098:853-855`). **`retry_later` now has a real carrier**: the
parking rungs stamp `bank_agent_receipts.retry_after`, and the predicate reads the newest refusal for
a live line with `retry_after <= now()` and no later admitted receipt (M6's fold, §3.4).

**A new wake CREDENTIAL kind, `bank_agent`** (client NOT NULL; both `wake_credentials` CHECKs and
**both** `mint_wake_credential` gates extended — the GB-3 lesson — with the allowlist enumerated
exactly and every roster trued by census). **It is independent of G1's `agent_tasks.kind`
question.** Full mechanics: **Annex D**.

**The visible notice and the HOLD, now with a relation** (gate blocker B3 — v1 named the verb and
never the table). **`clara.bank_agency_holds`** (`client_id` PK, `firm_id`, `on boolean not null`,
`reason text not null`, `set_by`, `set_at`; FORCE RLS, human SELECT-only, **zero machine grants** —
the `0040` tail-7(1) posture, and its own census row) is written by
`clara.set_bank_agency_hold(client, on|off, reason, op_key)`, a bookkeeper-floor HUMAN verb, and read
by the Tier-A rung `bank_agency_held` and by the due predicate. A firm-visible notice ("Clara will
reconcile MAY for ROME PROPERTIES tonight") ships beside it. The hold is per client, is audited, and
**is not a per-firm capability dial** (ADR-0072② / TA-P1's default-on rider) — it is a brake on a
running lane, which the ruling explicitly allows.

### 3.7 Egress: the `bank_matching` purpose (TA-P3 A)

Bank matching sends a client's **whole ledger slice and counterparty names** to the model — a new
processing class, therefore a new NAMED purpose, signed and activated **per client** by the owner.
Extension points, all extend-only: the three purpose CHECKs and the four purpose verbs
(`0090:691-704`, `:758`, `:818`, `:890`, `:952`), `prepare_egress_dispatch` (`0090:1007-1058`), the
doc-sha CHECK (`0090:730-735`) — which gains **its own conjunct requiring NULL**, the
`wiki_synthesis` arm's shape, because a matching read is not document-tied (`0090`'s own comment
already anticipates a fourth purpose inheriting nothing by accident) — and the runtime registry
`GOVERNED_EGRESS_PURPOSES` (`egress.mjs:232-300`). **These five live bodies and four ACCESS
EXCLUSIVE CHECK swaps were missing from v1's D1 list entirely** (gate blocker B3); at v2 they are
**PR-1c**, their own PR, independently rollback-able, blocked on C6 (Annex O). **An unsigned or
deactivated client's bank agency does not run**: the due predicate returns `purpose_unconsented`,
the belt emits no event, and the Tier-A rung refuses if anything reaches the verb anyway.
**C6 (DPA · client disclosure · PDPA cross-border basis) is critical path** for this purpose exactly
as TA-P3 records.

### 3.8 The read surface (TA-P9, TA-P4)

**ONE new read verb, `clara.wake_get_bank_pack(p_client, p_bank_account, p_op_key)`** — a SECURITY
DEFINER read returning, in one transaction: the unmatched lines (sharing `list_unmatched_lines`' own
predicate, `0040:4099-4123`), the candidate entries with their remaining per-side capacity (sharing
`list_bank_match_candidates`', `0038:8010-8054`), the open items by counterparty, the reconciliation
preview terms (`_bank_recon_terms`, `0040:1039`), and the **learned-payer CONTEXT block** (§3.9).
**Read and receipt in ONE transaction** — no receipt, no read (TA-P4). **No table grant to any
machine role**, which keeps the zero-agent-grant assertions true *verbatim* rather than re-cut
(survey F1, C5). The pack is **budget-capped** and its sha is the inputs digest on every receipt.

### 3.9 Learned payer accounts (TA-P8 B) and attribution (TA-P7 C)

The pack's learned-payer block is **context**: "payments described `PAYMENT ACME` have settled ACME
SDN BHD's invoices 9 times". It is never a key, never fed to an exact-match resolver, and never
written to `client_identifiers` unpromoted.

**The promotion door, with its writer (gate blocker B5).** v1 narrated the door and minted no verb
that could ever write its proposal row: Annex A.1 had no promotion sibling, Annex A.2's only new
proposal writer was `_agent_propose_line_exception_core`, and `bank_agent_receipts.act_kind`
enumerated ten values with no promotion act. At v2 the PROPOSING half is built —
**`wake_propose_bank_identifier_promotion`** (renamed bank-scoped, conductor arbitration
2026-08-24 — collided with F-A7's own promotion door, wave-f-contract.md:315-320) +
`_agent_propose_bank_identifier_promotion_core` + `act_kind='identifier_promotion_propose'` +
the per-kind payload CHECK + an end-to-end battery cell.
**The CONFIRMING half is scoped to the case the estate can key today and the rest is escalated**
(Annex P, OQ-8): the promotion writes a `client_identifiers(kind='bank_account')` row through the
audited path `add_bank_account` already uses (`0038:2743-2751`), which exists **only when the payer
is itself a client of the same firm**; for every other payer the proposal is raised and shown and the
door reports `promotion_target_unavailable` with the proposal left OPEN. The estate has no
counterparty-bank-account identifier relation, and inventing one on a design lane would put a new
identity surface next to the name-only wall. **[ADR-0075 2026-08-23]** Throughout this design set (and its annexes and gate record), a reference to "constraint 12" now means the GENERIC name-only wall — `0062`/`0063`, untouched; the harness clause that named ROME SECRETARY is retired, the mechanism is not. `record_client_fact` **stays un-allowlisted**
(`0055:895-897`) — the promotion is a human act through the human door, and the receipt records the
confirmer.

**Constraint 12 is untouched and unextended**: RS customers stay name-only; the general principle
(*a name-only counterparty is never enriched by inference*) is what the promotion door enforces for
everyone. **The named cost, stated:** RS's bank matching loses its strongest signal and will ask more
questions than other clients (TA-P8's own priced cost).

**TA-P7's riders are M4 and M5** (§3.3); the correction path is `unmatch → re-match` while unposted
and `reverse → re-post` once posted, both receipted, with a **misrouted-egress event** if a read
crossed a client boundary.

### 3.10 `add_bank_account` — the wall that makes registration safe

TA-P1's dissent named the hazard exactly: a wrong account↔COA binding makes a month tie to the wrong
GL account and still show green. Three mechanical walls: (1) the estate's own
`_assert_bank_coa_candidate` (`0038:2563`) — the account code must be a legitimate bank COA
candidate; (2) **TA-P8's own rule as a wall, re-anchored at v2** (gate material **M3**) — the account
NUMBER must be a printed identifier read **identically by both witness channels**, read from
**`clara.bank_account_proposals.header`** (`0038:849-856`, `:877-917`), the machine-written
corroborated-header carrier the estate already mints on an `account_unregistered` refusal. v1
required the agreement "on a FILED statement", which is **structurally impossible for a new account**
— `bank_statements.bank_account_id` is NOT NULL with an FK (`0038:401`), so a statement for an
unregistered account never becomes a statement; it becomes a proposal. `wake_add_bank_account`
therefore takes **`p_proposal_id`**, mirroring `add_bank_account`'s own seventh argument
(`0038:2595-2603`, which already locks the proposal and fills every blank from it); (3) the
registered account's first statement must **chain-tie** before any match on it may post unattended.
**The wall lives in the AGENT core (`_agent_add_bank_account_core`) ONLY** — `_add_bank_account_core`
stays semantically identical for the human ctx, and the battery forces it: a human `add_bank_account`
with no proposal still succeeds after PR-1a. A registration that fails any wall becomes a proposal,
not a row.

### 3.11 The drawer-2 bank gate — the measurement-origin repair (TA-P14, A3-OQ-12)

`_close_gate_bank_items` (`0056:1335-1380`) is re-cut on **four** counts at v2 (Annex F): (1) the
statement-gap census enumerates **from the account REGISTRY**, the way its sibling
`bank_recon_close_state` already does and says why (`0056:970-975`); (2) **unmatched-but-unexcepted
LINES are enumerated**, because the linkage IS line-keyed and `list_unmatched_lines` already computes
the set (survey F5) — the stated v1 boundary was false at the bytes; (3) the basis literal moves
`exceptions_and_gaps_v1` → `registry_lines_and_gaps_v2`; **(4) NEW at v2 (gate material M1) — a
client whose chart carries a bank-class COA account with movement but NO registered `bank_accounts`
row is a `fail` with reason `no_registered_account`.** Without (4) the repair cannot do the thing
this item's own headline cell claims: repairs (1) and (2) both iterate a registry that is EMPTY on a
zero-account client (`0056:989-993`'s loop; `list_unmatched_lines` INNER JOINs `bank_accounts` at
`0040:4113`), so the gate would still return `pass` on exactly the acceptance client §5 names.
**R-F 1 holds by ownership, not by absence:** drawer-1's `bank_recon_close_state` and its P-3
registry-vs-ledger census stay **F-T4's**; arm (4) is drawer-2's own. **One predicate, one owner** —
whichever item lands the registry-vs-ledger predicate first owns it and the other CALLS it
(TA-P11's one-architecture test); Annex O carries the sequencing obligation and Annex P the boundary
question. **The priced cost, accepted at the sitting: clients that show green today will flip red,
and a human will sign more drawer-2 exceptions.**

### 3.12 Retirement (TA-P11 A), E-R13, and the human doors

**Stop the writes, keep the tables** — the full DROP/KEEP inventory, the four dashboard surfaces and
the test-breakage split are **Annex I**; the five human doors TA-P14 clause 2 obliges are **Annex
M.2**. Two clauses stay here because §3 depends on them. **`bank_matches.origin`'s `'rule'` value is
NOT dropped** — historical rows carry it; the CHECK gains `'agent'` and the congruence trigger gains
the arm *agent ⇒ `matched_via_rule_id` is null*, **and the `'agent'` value has a NAMED writer** (v1
left it implied — nit **N3**): `_match_bank_line_core` and `_settle_from_bank_line_core` derive
`origin` from `p_ctx->>'is_agent'`, defaulting to the live literal when the key is absent, and the
differential cell proves a human match still writes `'human'`. **E-R13 and 7A-R3 are absorbed and
RECORDED as dissolved with the machine** — E-R13's corroboration intent now rides the witness pair
(contract F-A3); a recorded dissolution, not an inherited silence (ADR-0072①).

---

## 4 · Gates, build, battery, questions and risks — where they live

**Annex O** carries gate **G0** (the constitutional re-sign), gate **G1** (the wake-execution
mechanism), the **revised build sequence** (PR-0 · PR-1a pure extraction · PR-1b the agent limb ·
PR-1c the egress purpose · PR-1d reads and the gate repair · PR-2 runtime · PR-3 retirement, parity
and the doors · PR-4 acceptance), the **width ruling** and the **cross-item sequencing obligations**.
**Annex H.0** carries the gating battery cells and acceptance (law 29) — including the v2 truing
that registration is **NOT an owner item**: it happens in F-A7b's onboarding interview after the
**Wave-G reset**, which discharges the RM39,252.03 vacuous green as a test-era artefact (owner
directive, 2026-08-22). **Annex P** carries the owner questions **OQ-1…OQ-8** and the four **owner
items** this gate escalated. **Annex Q** carries the registered risks and the named non-goals. Each
decision is registered in **Annex K**.
