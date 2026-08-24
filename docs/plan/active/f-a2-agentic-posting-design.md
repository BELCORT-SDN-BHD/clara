# F-A2 — the agentic posting lane: design

> **Design doc of record for Wave-F Track A item F-A2** (`docs/plan/active/wave-f-contract.md`
> §F-A2, lines 47-64), carrying **F-A10's retirement clause**. **v6.1, 2026-08-22 — the PR-1 build trues: six
> orchestrator rulings R-L1..R-L6 (Annex H, D38-D43), B8 RESOLVED from the sources.** v6 folded owner ruling D34
> (chat parity back into the train) over the PR-0 gate conditions (record: `f-a2-pr0-gate-record.md`) — three
> blockers, eleven materials, the width ruling as amended, and the nits. v4 folded the final verify
> (R-1..R-3) plus the **OQ-4/OQ-6 owner rulings**; v3 folded the delta review (which **reversed C-3**
> and **refuted P5**); v2 the R1 review. **Change log: Annex G.** Binds under ADR-0071
> G1.2/G1.3/G1.4; digest **laws 71-76**, **27**, **68**, **69**, **28**, **29**, **31**. Every build
> PR takes the uniform ADR-061 ladder; **every rung of §3.2 is judgement logic** (review law 1).
>
> **Annexes**, split three ways to stay under the 500-line file limit: `f-a2-annexes-1-estate.md`
> (**A** findings at the bytes · **B** retirement · **I** B4's formulas, relocated there at v6.1) ·
> `f-a2-annexes-2-mechanics.md` (**C** battery · **D** the tier, wake-kind and C-3 censuses, T3's mechanism,
> **GB-2's predicate**, **GM-7's locks**) · `f-a2-annexes-3-record.md` (**E** refusal vocabulary and receipt
> shape · **F** the `posted` chain · **G** change log · **H** decision register). **Three method
> lessons, each of which cost a finding** (Annex G): an unsettleable claim is carried as a **PREDICTION
> the PR-1 rig replay must confirm** · **line numbers come from the instrument that prints them** · **a
> body's live tip is found by CoR lineage**, never the migration that created it (GM-1's seventy-
> migration miss).

## 1 · The ruled shape (fixed, not designable)

- **ONE unattended coder replaces the draft-only `autoDraft`** — reads (raw OCR + witness facts + context pack
  incl. wiki/history per law 73), decides, and **posts** when the walls pass; what cannot lawfully post lands
  as a draft or a typed open question.
- **Every document class, `journal_entry` generic included** — **superseding 7A-R7 / ADR-063**
  (`registry.ts:196-197`), said in those words because a live ruling is overturned, not drifted past. **It
  widens DOCUMENT CLASS and nothing else.**
- **Three owner rulings fix the authority shape.** **OQ-1:** unattended posting at **ANY amount**, no human
  checker, no hardcoded threshold (*the agent's contrary recommendation is on file as **dissent***; §3.3.1).
  **OQ-6:** **no category gate either** — `is_year_end` and `tax_affecting` post unattended (§4). **OQ-4:**
  the **three-exits shape** — the agent's **own untouched derivation only** (§3.3.3).
- **A wake-wrapped post/approve path** recording the agent as acting identity with model+version + rationale
  on the receipt (law 71). **No amount routing, ramp, sampling or dark launch.**
- **Walls re-proven here:** invariants (a)(b)(c), balance, evidence/region, currency, direction/type polarity,
  **the witness-pair corroboration gate**, CLR19. **N1 lands here.** **Retires:** `execute_rule_post` + the
  `rule_post` consumer, the coding/autopost rule verbs, the sighting-breeding inserts, the expiry belt —
  **history rows stay as knowledge fuel**.

## 2 · The estate as-found — the seven findings that bind §3

1. **The corroboration gate does not block anything today** — `corroborated=false` *removes* walls, and the
   only `not_corroborated` refusal (`0046:1141-1146`) is **on the executor F-A2 retires**. *(All seven at the
   bytes: **Annex A.1**.)*
2. **Breeding is not a retirable verb** — inside `_approve_entry_core` (`0037:2046-2100`) plus the
   `rule_decisions` limb inside `_draft_entry_core` (`0016:4170-4195`); both are CoRs on deployed audited
   writers → **D1 write-quiesce**.
3. **N1's body chain, CORRECTED** — the trigger calls a **1-arity** delegate whose NULL pin is one level down
   (`0016:3957-3961`); **the identical chain exists for sales, untouched by v1**.
4. **The generic kind** — a NULL `coding_kind` **skips** `0016:4020-4034`'s coded-kind preconditions, and the
   kind is a **model-supplied input, so it SELECTS which walls bind** (GB-1 → B15).
5. **check-binding-post-control.mjs (RETIRED with PR-3, docs/plan/active/f-a2-annexes-1-estate.md §B.4) goes FALSE-GREEN** — it parses only `CREATE [OR REPLACE]`, so **a drop
   is invisible to every failure path**.
6. **Settlement kinds are unwalled on the agent post path** — the refusal (`0037:1826-1830`) and its durable
   half (`0037:519-522`) both key on a rule id **the agent never passes**. WCA-R6: *"Which of three open bills
   a RM5,000 payment settles is a JUDGEMENT, not a document fact."*
7. **The wake director is NULL by construction on the unattended lane** — `mint_wake_credential` forbids
   `on_behalf_of` on `autodraft`, and a client binding on every other kind (`0011:1178-1186`).

## 3 · The design
### 3.1 The verb: one wake wrapper, one ungranted core, one shared approve core

**`clara.wake_post_entry(p_entry, p_expected_revision, p_client, p_books_version, p_rationale, p_model, p_op_key)
returns jsonb`** — the `0078:96-107` idiom:

```
wrapper  clara.wake_post_entry         granted to clara_wake_interactive and nothing else;
                                       allowlist rows per posting wake kind; raises only; NO DML.
core     clara._agent_post_entry_core  ungranted; the ladder + the receipt + the delegation.
delegate clara._approve_entry_core     the SHARED approve core (8th body, §3.5) — ONE approve
                                       semantic, two callers.
```

**Why S1, not S2 or S3 — attacked at the gate, CLEAN, ships as designed.** The decisive argument is *where the walls
live*: under S1 the ladder sits in the post verb's own core, so **no sequence of tool calls can post a draft that
should not post**, and the grant split leaves no alternate entry point. **S2 is refused** (two composed lock orders;
finding 3's divergence pulled inside one transaction); **S3 is refused** (its second call is the human
`approve_entry`, carrying no admission gate). **One S1 property the Tier-D critique makes load-bearing:** the draft
was written in an **earlier transaction**, so a commit-time abort rolls back *only the post attempt* — the difference
from a Tier-B refusal is purely **evidentiary**.

**Acting identity rides the existing ctx bag.** `_approve_entry_core(p_ctx jsonb, …)` (**`0037:1750`**; keys at
`:1763-1769`) already carries `actor`, `firm`, `checked_via_rule_id`, `bound_extraction`, `receipt_preheld`; the agent
lane adds `on_behalf_of`, `wake_kind`, `is_agent`, `post_receipt_id` — **no arity change on a deployed audited
writer.** **Op-key discipline (`0078:150-152`):** the caller's key is deterministic, a blank one refuses with the
typed CLR10 detail, the inner key is **derived, never minted**. **The agent never picks an authoritative input**
(`0078:135-146`): blank `p_rationale`, incomplete `p_model` or null `p_books_version` refuse.

### 3.2 The gate ladder — four tiers, re-derived

**Tier membership is a fact about `pg_trigger.tgdeferrable`, not a list anyone should write from memory. PR-1 derives
it by RIG REPLAY and the design cites the replayed census** — §D.1 holds the prediction and a per-trigger disposition,
and the record of two readers getting it wrong from source.

**Tier A — authority and shape. RAISE (CLR\*).** `_reserve_op` · entry in your firm → CLR11 · `for update` · **the
three lock acquisitions** · status is `draft` · `revision_token` → CLR06 · filing unmoved → CLR02 ·
`assert_books_current` → CLR12 · **A8 (§3.3.2)** · `closing_transfer` → CLR03.

**Tier A takes THREE locks before B9, and that IS the B9 fix (GM-7).** The estate already serializes open-question
creation against approval on the filing `FOR SHARE` plus two advisory locks, with the intent in words at
`0011:2988-2995` — *"No check-then-act window."* A B9 reading `_open_question_blocks` before any of them re-opens the
window the estate closed, leaving the delegate's own CLR26 re-check unlisted. **With all three held CLR26 is provably
unreachable and law 31 forbids listing it** (E.2 has the disposition and the fallback pair). Bytes, ids, acquisition
order and the fallback's cost: **§D.7**.

**Tier B — the admission gates. TYPED NON-POST RECEIPT, no raise.** The transaction **commits**, so the reason is
durable. **All thirteen rungs are EVALUATED, always; the receipt carries the full failing-rung vector; posting
requires an empty vector.** *(B12/B13 were cut at the gate — their numbers are retired, not reused.)*

| # | rung | source | token |
|---|---|---|---|
| B1 | **coding_kind ∉ {customer_receipt, supplier_payment}** | finding 6; WCA-R6 | `settlement_kind_human` |
| B2 | corroboration is TRUE | relocated `0046:1141-1146` | `not_corroborated` |
| B3 | `_corroboration_bound(entry, total_cents)` | `0016:4133`, `0037:1930` | `anchor_unbound` |
| B4 | the entry's amount ties (per kind — **Annex I**) | `0016:4137-4151` + **two new formulas** | `anchor_untied` |
| B5 | no `amount_exception` without `amount_override` | `0037:1934-1937` | `amount_conflict` |
| B6 | no human override flag present | new | `human_override_present` |
| B7 | **amount-bearing evidence** — the `entry_evidence` row with `field_path='invoice.total'`, the ONLY field `_write_entry_evidence` grants `verified` (R-L4) — is `provenance_tier='verified'` | `0009:460-466`, the grant at `0009:462-466` | `unverified_evidence` |
| B8 | **no citation names a SUPERSEDED fact generation** — every `entry_evidence` row whose extraction is a fact generation (`invoice_facts`·`llm_text_facts`·`llm_vision_facts`) equals `v_state->>'extraction_id'`; OCR/`structured_parse` citations are out of scope (law 72) | `0009:889` + `0009:191`/`0092:497`; generation `0101:443-491` | `facts_moved` |
| B9 | `_open_question_blocks` returns nothing — **under Tier A's locks** | `0012:87-108` | `open_question_blocks` |
| B10 | `_assert_supplier_bill_shape_at(entry, v_bound)` **on the PROJECTED state** | `0037:1989` + §D.6 | `supplier_leg_shape` |
| B11 | **`_assert_sales_invoice_shape_at(entry, v_bound)`** **on the PROJECTED state** | `0037:1990` + §D.6 | `sales_leg_shape` |
| B14 | **a NULL-`coding_kind` entry carries no AR/AP control leg** | `0037:1441-1443` | `generic_control_leg` |
| B15 | **a NULL-`coding_kind` entry may not anchor to a DIRECTIONAL document** | GB-1; `_autodraft_direction_tri` (`0046:1776`) | `generic_on_directional_document` |

**B15 closes the hole the gate found (GB-1), the sharpest finding of PR-0.** `coding_kind` is a **model-supplied
input, so the kind SELECTS which walls bind**: a corroborated supplier invoice drafted `coding_kind=NULL` as `Dr
Expense / Cr Bank` passed **all fourteen of v4's rungs** — B10/B11's kind gates are inert on NULL (`0036:627`,
`0022:726-731`), B14 refuses only entries that HAVE a control leg, and B5 is vacuous because the `amount_exception`
stamp is itself kind-gated (`0016:4131`). **No wall tied the kind to the document's direction**, so the lane admitted
a **wrong post** — a phantom payment with the payable suppressed — priced nowhere. **B15 lives in the ladder so it
covers both lanes** — chat is direction-blind (`chatTurn.v12.tools.ts:292`) and the `0046:2687-2688` arm is
autodraft-gated, while on autoDraft only generic passed unchecked, exactly where direction is least certain. **D18
stays intact**, and **autoDraft_v9's enum widening must extend `allowedCodingKindsForDirection` DELIBERATELY** (§5's
PR-2 step).

**B10/B11 pre-check the deferred shape floors ON THE PROJECTED STATE — v4's form was 0% functional (GB-2).** The live
supplier floor raises CLR23 on **any** control-class line with a NULL `counterparty_id`, receivable included, *before*
its kind gate, while the counterparty is stamped **inside** the delegate — so a naive pre-check refuses **100% of
agent sales posts, with the SUPPLIER token**, and §3.4's draft copies would regress today's working draft path. **PR-1
extracts that prologue into a callable projected-state predicate, `clara._assert_control_leg_counterparty_at(p_entry,
p_projected uuid)`; the existing floor becomes a thin delegate passing NULL.** Bytes, the draft-copy call and the
fallback: **§D.6**.

**B12/B13 are CUT — on correctness grounds, not severed for width (GM-3), and D34 does not touch them.** As specified
they refused the two most common LAWFUL shapes on their belts, because the belt predicates are only true AFTER the
approve hook runs — a pre-hook evaluation has the wrong inputs **by construction**. **Tier D is their honest home**,
and their tokens, §D.1 rows and C cells are re-cut to match.

**B1, B14 and B15 are interlocks, not new restrictions**, all three stated so nobody later "restores" a missing rung.
**B1:** WCA-R6 stands until **F-A3**, and it makes two deferred shape floors (`0037:674`, `0037:680`) unreachable.
**B14, on its CORRECTED ground (GM-4):** v4 said the subledger hook materialises nothing for a NULL `coding_kind` —
**false at the bytes.** `_subledger_classify_entry`'s ladder 5 (`0037:995-996`) classifies a NULL kind as
`'adjustment'` and the hook **does** materialise open items for its control legs. B14 nevertheless **STANDS** on the
ground that survives: an open item is a claim about who owes what, and **a generic entry's anchor is the weakest in
the estate** (B4-generic) — a weak anchor cannot corroborate a subledger consequence — while **WCA-R6 keeps settlement
judgement human until F-A3**. **B15 makes B14 coherent:** a directional invoice NEEDS a control leg and B14 forbids
generic entries from carrying one, so generic-on-directional was always a contradiction. **Both narrow the generic
lane and OQ-5 says so.**

**B8 is deliberately redundant with A5 and must be forced non-vacuously (law 31)** — and the redundancy is not a
duplicate, because **A5's input is caller-supplied and B8's is not**: `0096:249-278` rotates an open draft's token
when facts settle, but an agent that re-reads the draft simply posts with the rotated token, so A5 is silent on
exactly the case that matters — a re-extraction that keeps the total and moves the identity, the date or the number.
B8 compares `entry_evidence.extraction_id` against the generation the fact state **names** (`0009:191`/`0092:497`),
reads nothing the caller supplies, and depends on no writer side effect — the same 'identity rather than
coincidence' move `0101:29-35` makes for 0049's guard. **The vector is
three-valued (law 68):** an absent-input rung is **`not_evaluable` — it fails admission but is REPORTED DISTINCTLY**,
since `pass` there is the ARM-0 defect. **B4-sales is the sharpest instance:** where the nil-tax witness arm withholds
the components (`0100:553-554`), B4's component tie evaluates **`not_evaluable`, never `pass`** (GM-2; Annex I).

**Tier C — the delegated walls. RECEIPT BY CONVERSION, on `(errcode, reason)` PAIRS ONLY — no wildcards, no
errcode-only members; unknown re-raises.** v1's classifier could not have worked: most named raises carry **no
`detail` at all**, so `(CLR25, currency)` would have swallowed the corroboration-bound contradiction, *a money wall*.

| pair | site | today |
|---|---|---|
| `(CLR25, currency_unsupported)` | `0037:1925-1927` | bare — **PR-1 adds the detail** |
| `(CLR25, corroboration_contradicted)` | `0037:1930-1933` | bare — **PR-1 adds it**; split from the row above because **this one is the money wall** |
| `(CLR23, counterparty_landscape_moved)` | `0037:1852-1857` | bare — **PR-1 adds it** |
| `(CLR23, registration_conflict)` | `_resolve_counterparty`, one call **below** `0037:1853` | bare — **PR-1 adds it**. Unlisted in v4, and it **pre-empts the row above**, so an ordinary business refusal settled as a task failure (GM-5) |
| `(CLR23, counterparty_birth_race)` ×2 | `0037:1858-1879` | bare — **PR-1 adds it** |
| `(CLR10, customer_identity_name_only)` | `0062:196-243` | **already carries `detail.reason` — ZERO body edits** (GM-6). Hard constraint 12's own wall: a BEFORE-row trigger on `counterparties`, reached through the delegate's birth/update path inside the protected region. Live population ≈ 0 (RS invoices print no buyer registration — the constraint's own basis), but a constraint-12 refusal settling `failed` is the wrong evidentiary shape exactly where evidence matters most. It shares its errcode with `0037:1778` (op_key), **which is why errcode-only matching would swallow unrelated walls** |
| `(CLR21, duplicate_bill)` | `0037:1939-1959` | already typed |
| `(CLR21, duplicate_sales)` | `0037:1961-1987` | already typed |
| `(CLR19, write_into_closed_period)` | `0056:692-700`, `t_period_wall` (**not deferred**) | already typed |

**Three non-members, each for the same reason — law 31, a wall that can never be asked.** `(CLR10,
settlement_not_autopostable)` is typed (`0037:1829`) but **dead on this lane** (B1 is the live wall), and **`(CLR10,
already_reversed)` ×2 (`0037:1836`, `:1841`) LEFT the set at the gate** on that identical reasoning; **`(CLR26,
open_question_race)` never joins it** — Tier A's lock ordering makes it unreachable (GM-7), and it is named only as
that fold's fallback. Exclusions in full: **E.2**.

**Tier D — the genuinely deferred belts. ABORT, and it cannot be converted**, because an exception block opens a
subtransaction and deferred constraint triggers fire at **COMMIT**, outside it. **Every Tier-D abort settles the task
`failed`, never a refusal** — with the commit error's `(errcode, reason)` in `last_refusal`. **The FA and advance
belts live here now, per GM-3**, and their six tokens are Tier-D vocabulary; **`t_je_bank_pending_orphan_belt` is
dispositioned, not deferred** — unreachable in F-A2, a **named forward obligation on F-A3** (§D.1). **The runtime read
stays advisory** — a hint; the DB wins.

**The refusal receipt** carries the tier, the reason, the **full rung vector** and a `verdict` block recording **what
the DB saw** — shape and the semantic-improvement argument in **E.0**. Two new event kinds join the taxonomy with
their pairs — **`entry.posted`** and **`entry.post_refused`**, both carrying `on_behalf_of` and `via_wake_kind`. **The
vector has TWO durable homes and §6 reads both:** refusals into `clara.op_receipts`, posts into
`entry_post_receipts.gate_verdicts`.

**The consumer contract, as a design law: no consumer may test `vector[r] = 'fail'`** — every consumer tests for
`'pass'` and treats everything else, including an unknown future value or a missing key, as non-admitting, since
testing for `fail` lets a rung added later silently admit (law 68 at the consumer). Bound:
**`classifySettleReceipt`**, the dashboard, §6's aggregation.

### 3.3 Acting identity, the receipt, and the walls that make it structural

**`clara.entry_post_receipts`** — a new append-only table keyed `unique (entry_id)`, carrying the acting actor,
`on_behalf_of` (**nullable — §3.3.1**), `via_wake_kind`, the model snapshot, the rationale, `gate_verdicts`,
`approval_arm`, `maker_active_at_approval` and the op key; append-only triggers, zero DML grant to any role. Columns,
CHECKs and **why neither a 9th `_tf_entry_immutable` allow-set column nor `journal_entry_revisions` can carry it**:
**Annex E.1**.

**`gate_verdicts` stores `{verdict, rung_vector}` PLUS `extraction_id` FLATTENED to the top level**, because
`t_je_assert_*_shape`'s pin (§3.4) reads it from inside a trigger and a nested accessor there is a silent-NULL hazard:
the wrong level yields NULL, which **is** the unpinned behaviour T3 exists to remove, and it does so **without failing
anything**. A CHECK requires the key non-blank, and **C.7's agent-side cell MUST FAIL on a wrong accessor.** **The
write contract is an invariant** — written **only on a successful post, after the delegate returns, in the same
transaction, inside the Tier-C-protected region**, so a conversion rolls it back; **no refusal at any tier writes a
row**, and the deferred receipt trigger fires at COMMIT after the insert by construction.

#### 3.3.1 Acting identity per lane, and what OQ-1's ruling changes in the core

Per finding 7, `autodraft` is client-bound and **director-less by construction**, so on the unattended lane **there is
no directing human and the receipt says so rather than inferring one** (law 68) — `maker_active_at_approval` is NULL
there, never `false`.

The maker/checker family's three CLR05 arms cannot honestly receive an agent post: arm 1 would demand an attestation
the DB does not validate, and `distinct_checker` is unreachable because an agent is not an eligible checker. **So the
8th body gains an agent arm that does not participate in maker/checker at all**, recording
**`approval_arm='agent_unattended'`** — dressing an unattended post as a self-attestation would make
`self_approval_attestation` assert a judgement nobody made. **The human lane's three arms are byte-untouched** (bytes:
**E.3**).

#### 3.3.2 The walls: A8, the receipt wall, the override wall

- **A8 — the verb posts only entries the agent drafted AND NOBODY HAS TOUCHED: `maker_actor =
  clara.agent_user_id() AND last_human_editor is null`.** The second conjunct is not decoration:
  `revise_entry` lets a human rewrite an agent draft's **numbers**, setting `last_human_editor` and rotating
  the token (`0016:4909-4913`). It strips and re-stamps `amount_exception` and **can** write `amount_override`
  — but it need not, and a plain renumbering writes only `duplicate_override` into `flags`, so **B6 does not
  see it**. *(The gate's correction makes A8's reasoning STRONGER: B6 catches the override-bearing revisions,
  A8 catches all of them.)* Without it the agent posts a human's numbers unattended — a maker/checker
  inversion **no ruling authorised**. *"Her own work"* means **untouched**. **OQ-4 confirms A8 and names the
  lawful exits.**
- **`t_je_agent_post_receipt`** — a deferred constraint trigger for the draft→approved transition, **ARM-0
  first (law 68)**, then `is_agent` → require exactly one receipt row. **B6** — the agent lane passes `'{}'`
  flags, and **an entry carrying either override (`amount_override`, `duplicate_override`) is a human
  judgement about a number, so she does not post it.** Bytes, the unreachable-ARM-0 declaration and **the
  three dropped identity channels** the 8th body re-opens: **Annex E.3**.

#### 3.3.3 OQ-4's three exits — what happens to a human-edited agent draft

**RULED, and the ruling is untouched by the gate.** A8 stands. The **forbidden middle** is pass-through of human
numbers under agent identity with nobody's approval on record; the two lawful exits are **(1) the human posts it,
under human identity** — the ordinary `approve_entry` path — and **(2) the agent RE-DERIVES and posts her own
conclusion, under agent identity**, treating the human's edit as lawful **context input** (law 73), not an
instruction. Its load-bearing constraint is the **double-coding wall** (`0016:4011-4017`), which makes **exit 2
available only once the human's draft is withdrawn**: while a human's numbers are live on a document, the only person
who can approve them is a human.

**The trigger for exit 2 is a PR-2 DESIGN OBLIGATION, not an existing mechanism — v4's claim was false at the bytes
(GM-10).** `revise_entry` does emit `entry.revised`, but **that event re-admits nothing**; and after the human's draft
is withdrawn a post-withdrawal sweep is refused **`already_done`** by the gate `0053` installed on purpose. So exit 2
has **no mechanical door today**. PR-2 must design one — a deliberate, audited re-admission after withdrawal that
**does not weaken `0053`'s duplicate-sweep gate** — and it carries its own cell (C.14). Exit 1 is unaffected.
Branches: **Annex D §D.3**.

### 3.4 N1 — the check moves earlier, and T3 is re-cut to cost nothing

**At draft: agent-lane-only, keyed on `not p_is_human`.** The live draft core never calls `_assert_*_shape*`; the
copies land there pinned to the draft's own resolved extraction **and to the projected counterparty** — they call
GB-2's `_assert_control_leg_counterparty_at` with the projection resolved from `proposed_counterparty`
(`v_fingerprint` is already in hand at `0028:1310-1316`), which is what stops them regressing today's working draft
path. **Not applied to the human lane** — a human draft is a work-in-progress `revise_entry` exists to finish; an
agent draft is a proposal-to-post, and the same core already discriminates that way (`assert_books_current`,
`0016:4241`).

**T3, and why BL-5's implied remedy is declined — all seven gate attacks REFUTED.** Recutting the 1-arity delegate
reaches the draft floor, human approve and the D-P4 probe. **Recut the two TRIGGER FUNCTIONS instead, resolving the
pin from the entry's own post receipt**: a human approval writes no receipt, so the pin is NULL, so the null-pin
behaviour is reproduced **byte-for-byte** — human-lane blast radius **zero by construction**, delegates untouched and
off the D1 list, the divergence closed on **both** arms. Mechanism, SQL and the three attack surfaces: **§D.2b**. **T1
(leave unpinned) is the fallback; T2 (a txn-local GUC) is refused.**

**Lane discrimination — the narrow claim only.** v1's estate-wide law ("`p_is_human`, never `p_wake_kind`") **is not
true of the estate** and the phrasing is withdrawn: `0046:2687-2696`'s direction-family arm **is re-cut**, and every
other wake-kind-keyed wall carries a disposition in **§D.5**.

### 3.5 Breeding excision — the 8th body

**`_approve_entry_core`, 8th body** (lineage in Annex B). Delete `0037:2046-2100` whole — both `rule_sightings`
inserts and the ≥3 `vendor_account` loop — which also removes `0040:7115`'s `bank_rule_suggested` conjunct spliced
into the block's gate. Same body: the ctx identity pass-through, the agent arm (§3.3.1), the `bound_extraction` pin,
the Tier-C `detail` reasons. **PR-1's prestate must state, per marker, RETIRE or CARRY** — a copy-the-0040-idiom
prestate otherwise refuses at apply. The per-marker dispositions (11 pinned; 3 names / 5 occurrences retired, 8
carried, `bank_rule_suggested` 2 → 0) are **B.10**.

**`_draft_entry_core`, next body.** Delete the `coding_rules … FOR SHARE` read (`0016:4170-4182`) and the
`rule_decisions` insert (`0016:4184-4195`) — **OQ-2 RULED (D35): the write stops, the table stays**; add N1's draft
copies; re-cut the direction-family arm; widen for the generic kind. **Sequencing, fixed now:** opener ⑥ also CoRs
this body and prestate is pinned by prosrc SHA not by marker (`0093:62-63`), so **F-A2's file is authored against ⑥'s
output**.

**The D1 write-quiesce surface is the numbered list in Annex B.9, recounted after the gate's severance and again after
D34 folded chat parity back: TEN CoR'd live bodies, one `CREATE TABLE`, and two ACCESS EXCLUSIVE constraint swaps**
(`sweep_run_items`' CHECK pair and `wake_credentials`' CHECK pair) — v4's "eight bodies and one ALTER TABLE" was a
label enumerated nowhere (GM-9). Spanned by **one continuous window**, prestate pinned by prosrc SHA **measured by rig
replay** with a **pre-quiesce sha tripwire**; the 1-arity shape delegates are **NOT** on the list, and the new objects
are not CoRs. **PR-1's replay confirms the count.** **KEEP-AS-HISTORY** (grounds in B.1): **drop the WRITES and the
VERBS; keep the TABLES.**

### 3.6 The pack gains an approved-coding-patterns block — recomputed, never accrued

**The contract, in one line:** a fifth dynamic splice on `clara.get_context_pack(uuid,text)` adds a client-scoped,
budget-capped **`approved_coding_patterns`** block over approved, unreversed entries — **recomputed on read, never
accrued**, so it removes a write from the approve core and cannot drift from the books. **The law-73 line holds:** the
pack lawfully informs the judgement that IS the posting authority, but **no gate, bound or floor may read wiki or
patterns** — `WB_AUTHORITY_FNS` is the mechanism that proves it, and F-A2 extends it with the new post-path verbs.
Columns, splice mechanics, the marker discipline and the corollary nobody should build: **§D.4**.

### 3.7.1 B4's two NEW walls, and GM-1's correction

**"No wall is re-implemented" was false for three kinds of four, and the claim is withdrawn.** `0016:4137-4151` and
`0037:1928-1938` are **supplier_bill-only**, so **B4-sales and B4-generic are NEW WALLS WITH NEW FORMULAS**. **The
three formulas and their derivations are Annex I**, and law 1 gives each new formula its own pass.

**GM-1 corrected B4-sales at the gate — four independent confirmations, the strongest-attested finding of PR-0.** v4
derived the sales tie against `0016:2100-2111`, a body **superseded seventy migrations ago**; the live floor is
**`0022:714-930`**, whose income tie **subtracts the rounding leg**, so v4's `income + tax = total_cents` was
arithmetically false on any rounding invoice **in both signs** and B4 contradicted B11 with no journal satisfying
both. Rounding is sanctioned estate-wide and **tax-independent**, so a nil-tax cash invoice breaks it identically.
**Annex I carries the corrected tie set, the fact-side `rounding_cents` rule, the credit-note mirror and the
supplier-asymmetry sentence**, and C.3's self-referential cell becomes a **differential** one.

**The named cost (OQ-5):** a generic JV whose amount is *not* the document total **cannot tie and lands as a draft**;
the alternative is no anchor at all (`0046:1128-1140`). The generic kind otherwise reaches post with fewer walls than
any other shape, so **B4-generic plus B14 and B15** are all that stand between it and an unanchored unattended post;
its cells are gating.

### 3.7.2 Chat parity — IN THE TRAIN, on the owner's ruling (GB-3 corrected; D34)

The contract requires that what cannot post lands as a draft **or a typed open question**, and a chat-lane post cannot
do the second today: `wake_open_question` (`0011:1990-1995`) raises CLR03 unless the credential is `autodraft` **and**
client-pinned, while `mint_wake_credential` refuses a client binding on any non-autodraft kind — **the authority is
granted (`0011:3910`, the `interactive` row) and the body refuses.** The fix is a **NEW wake kind
`interactive_client`, not a weakened CHECK** (v2's widening stays REVERSED; §D.2 is the census decision record),
narrowed by **R-1 to exactly ONE call path**, which the gate **verified sound**.

**GB-3 found v4's build recipe wrong and PR-0 severed the limb; the owner reversed the severance and kept the
correction (D34, 2026-08-22).** v4 ruled the durable client CHECK permanently untouched — but
`ck_wake_credentials_client_0011` (`0011:625-628`) is **itself a closed-world enumeration over the three existing
kinds**, and `mint_wake_credential` carries an **early kind gate** (`0011:1163-1165`) above the per-kind arms, so the
credential was **unmintable twice over**. **The limb therefore ships inside PR-1/PR-2 with BOTH CHECKs extended, BOTH
mint gates extended, `wake_open_question` re-keyed onto the client pin, all SIX roster/census surfaces trued, and the
closed-world cell that the new kind holds EXACTLY ONE allowlist row** (§D.2c). Extending an enumeration is **not**
C-3's weakening — the three existing kinds keep byte-identical semantics and no plain `interactive` credential gains a
client — and PR-1 says so against C-3's record. *(The orchestrator's recommendation was to keep the severance; it is
on file as dissent.)*

### 3.8 The `posted` outcome, and retirement

**The `posted` outcome is a FIVE-layer chain plus six further sites** (Annex F; GM-8 added the fifth —
`ck_sweep_run_items_shape` forbids a non-`'drafted'` outcome from carrying an `entry_id`, so widening only the outcome
CHECK yields a constraint violation). **A fix at any one layer alone either lies or raises:** two layers silently
mis-bucket a posted row (`0036:979-980`, `0011:2754-2762`) and `0036:987` writes a **fabricated `CLR29` refusal
token** onto it. **The finalize fix is a FOURTH counter, never a fold (R-L5):** `sweep_runs.posted_count` joins
drafted/skipped/refused, so the identity is **drafted + skipped + refused + posted = expected** and a posted run
stays distinguishable in the only summary §6 reads (Annex F row 4). **§6's POSTED count therefore reads a surface that cannot silently bucket** — `entry_post_receipts`,
cross-checked against `sweep_run_items.outcome='posted'`, **a disagreement being itself a finding.** The chain ships
as PR-1's **third migration file**, provable in isolation via C.9 and inert until PR-2 emits `posted`.

**Retirement's four decisions** (executable detail throughout Annex B). **(1)** The **false-green CI gate retires in
the drop PR**, with its selftest, `ci.yml` step and both `package.json` entries. **(2)** Two helpers **fail SOFT and
are deleted, not left** (`x1-helpers.mjs:390-392`; `x37-wave-c-a:1684-1693`). **(3)** The re-extraction is **TWENTY
documents (ADR-0072 ①.2)**, too few for the fallback arms' *full-population* trigger (`0101:465-467`), so they retire
at **the Wave-G reset**, where F-A10 closes. **(4)** The **WB-R2 sites are re-pointed or re-worded, never silently
deleted**, and **the census follows the retired VERBS across every fixture surface, never the law's NAME** — the gate
re-ran it and found it **exact but for two gaps**, both folded (GM-11's `kb_rule_proposal` part type; N-9).

## 4 · Owner questions

**RULED.** **OQ-1** — any amount, no human checker, no thresholds; the agent's contrary recommendation is on file as
dissent. **OQ-4** — the three-exits shape (§3.3.3). **OQ-6** — option A: **no category gate ON THE AGENT LANE**,
because `is_year_end` and `tax_affecting` both carry mandatory downstream human checkpoints while the amount case has
none, so gating the gated-later while freeing the never-gated would be backwards. **Supplementary: the HUMAN lane's
distinct-checker gate on the same categories STANDS unchanged**, and the charter's "human lane unchanged" scoping is
re-confirmed — the three asymmetries and the possible future per-firm **governance dial** are in **Annex G's F33**;
the honest cost is in §7.

**ALSO RULED, 2026-08-22 — the last three open questions close, each on its standing recommendation; nothing in §4 is
open.** **OQ-2 (D35):** `_draft_entry_core` stops writing `rule_decisions`; **the table and its historical rows are
KEPT** (a live FK, and knowledge fuel); **`list_review_queue.rule_backed` is REMOVED from the dashboard** rather than
rendered permanently false (law 27(2)) — the surface is B.6. **OQ-3 (D36):** `preview_ocr_sales_evidence` retires with
the floor, and **`tick_seeding_proposal` re-points its output to a knowledge-layer artifact** — no more
signed-`coding_rules` minting, the admin's tick judgement landing as context-pack food (law 73), the seeding UX
unchanged. **OQ-5 (D37):** B4-generic is adopted as the gate reshaped it (`sum(debit_cents)` = verified `total_cents`,
plus B14 and B15), **both priced costs accepted knowingly** — split-amount documents land as drafts, and a generic
entry carries no AR/AP consequence — **and §6 publishes the measured size of both refused populations, which is part
of the ruling.** Register rows and grounds: **H.2 / D35-D37**.

## 5 · Build sequence — the gate's severance, as amended by D34

**Hard prerequisite the contract's sequencing line does not state.** Openers **①②⑥** are a hard **acceptance**
prerequisite (§6): at 0/33 corroboration this ladder posts nothing — safe, and indistinguishable from a broken build.
**All six are MERGED (2026-08-20); PR-1 is authored against opener ⑥'s output (`0101`).**

**PR-0 severed PR-1 three ways and the owner reinstated one (D34, 2026-08-22): chat parity STAYS IN THE TRAIN** — the
severance is overridden, the GB-3 correction is not (§3.7.2). **B12/B13 stay CUT** (GM-3, a correctness ruling the
owner's decision does not touch), and the `posted`-outcome chain keeps its **own migration file** inside PR-1's single
D1 window. *(An earlier separate ceremony was weighed and DECLINED: a third window buys review isolation the file
split already buys, at the price of another stop/start night with its reconciler-herd and zombie-pooler hazards.)* The
train:

1. **PR-0 (gate) — DONE, 2026-08-21/22.** The independent judgement-logic review (law 1, eight fresh-context
   lenses) **plus** the cross-model adversarial pass (law 28). Verdict, findings and fold targets:
   **`f-a2-pr0-gate-record.md`**, which is this version's specification.
2. **PR-1 (DB, THREE files, ONE D1 window).** The `0077`/`0078` split plus the `posted`-chain file: ungranted
   machinery (the ladder B1–B11/B14/**B15**, B10/B11 in GB-2's projected-state form; A8 + both structural walls;
   the receipt table + deferred trigger; T3's two recuts; the 8th body + draft-core recut; the amended Tier-C set;
   **GM-1's corrected B4 formulas**; **the `interactive_client` limb in GB-3's corrected form — BOTH
   `wake_credentials` CHECKs extended, BOTH `mint_wake_credential` gates extended, `wake_open_question`
   re-keyed**), then the granted wrapper, its single grant, the two allowlist rows, the zero-grant re-pin, the six
   roster/census surfaces and the census tail, then the `posted` chain inert until PR-2. **Contents and the
   numbered D1 list: Annex B.9.** `UNNUMBERED_*`, numbered at merge.
3. **PR-1b (DB, no ceremony).** The `get_context_pack` fifth splice — a read body, **no D1**.
4. **PR-2 (runtime).** **autoDraft_v9** — post tool · generic kind, **whose enum widening must extend
   `allowedCodingKindsForDirection` DELIBERATELY (GB-1)** · the `posted` settle · `classifySettleReceipt` incl.
   the consumer contract · Tier-D `last_refusal` capture, **now carrying the FA and advance belts** · **GM-10's
   re-admit door**, audited and not weakening `0053`'s duplicate-sweep gate. Plus **chatTurn_v13** and **a new
   frozen `_vN` of `chatTurn.v10.infra.ts`, minting `interactive_client` for the `wake_open_question` path ALONE
   and plain `interactive` everywhere else** (R-1). New frozen exports + registry repoints, never edits;
   bundle-grep after build.
5. **PR-3 (cutover + retirement), only after PR-2's image is verified live.** The drops, the consumer file, the
   roster edits, apps/dashboard/app/rules/ (RETIRED whole, see docs/plan/active/f-a2-annexes-1-estate.md §B.6) — relocate `AdjustmentTemplatePanel.tsx` to `apps/dashboard/app/close/adjustments/`, the parts catalog
   **including the `kb_rule_proposal` part type (GM-11)**, the CI gate, WB-R2. **D1.**
   **Amended 2026-08-23 (owner, R1 relaxation, `wave-f-sprint-dag.md` §7):** binds the MERGE and the
   ceremony only now — authoring proceeds in wave 0, unchanged protection, only the serialization removed.
6. **PR-4 (acceptance, zero code).** Re-measure as-run, `PROGRESS.md`, **F-A10's terminal check — closing at the
   Wave-G reset (ADR-0072 ①.2), not on a backfill.**

**B12/B13 extraction is the one thing still outside the train** (GM-3), and only with projected-state inputs designed
first. **Two ceremony windows**, both from merged `main`. Standing runbook hazards: the DSN bridge + a **110s**
quiesce, `fly.exe`'s non-zero exit after a successful non-tty `ssh -C`, the post-restart zombie pooler sweep, `PG*`
vars for rig runs, the reconciler herd against two lane slots.

## 6 · Test battery (Annex C) and acceptance

**Every blocker gets a cell:** the Tier-D replay census · a CLR25 conversion naming the *right* wall · a settlement
post refusing at B1 · **GB-1's two C.14 cells** (a suppressed-payable generic refuses at B15; a direction-unresolved
generic still posts when tied) · **GB-2's cell** (an agent sales draft whose receivable leg has no counterparty POSTS)
· **GB-3's corrected chat cells, back in this battery under D34** — C.13 in full, including the closed-world cell that
`interactive_client` holds exactly one allowlist row and the extend-only regressions · **GM-1's B4-sales trio** (a
printed-rounding invoice admitted by BOTH B4 and B11, a nil-tax twin, an absent-fact twin) · B14's rung · the FA and
advance belts as **Tier-D aborts** · A8's revised-draft cell **and OQ-4's two exits** · the three per-tier zero-row
cells · the `posted` chain incl. GM-8's fifth layer · T3's must-fail accessor cell · **C.8's breeding cells fixtured
as AGENT posts**.

**Law 29 governs, and its six acceptance obligations are written out in C.17** — openers ①②⑥ live as a hard
prerequisite · the forced order (ceremony → re-extract FIRST → then evaluate) · **FOUR numbers over the TWENTY
re-extracted documents** (ADR-0072 ①.2) with the full failing-rung vector per non-posting document and **the
denominator stated every time** · a live post on real books (**ROME PUBLIC ADVISORY** first, then a BELCORT client;
constraints 12 and 13 throughout) · **F-A10's terminal check at the Wave-G reset** · **OQ-5's three populations
MEASURED AND PUBLISHED, which D37 makes part of the ruling rather than an optional extra.**

## 7 · Registered risks and named non-goals

- **G-11 — MEASURED, 2026-08-20** (rolled-back read-only live read, frontier 92/`0097`). Of B9's three
  blocking scopes (`0012:87-108`), **client-scoped = 0 open and 0 all-status — none has ever existed**,
  vendor-scoped = 2 but both `origin='rule_proposal'`, which `_open_question_blocks` **EXCLUDES**, and the
  mass is **document-scoped: 8 open, all BEE** — self-blocking by design. **Honest pricing: real machinery
  with a zero population today; the cost arrives with scale, and the receipt names it.**
- **The generic lane is the thinnest-walled shape in the estate** — B4-generic, B14 and B15 are its only
  unshared walls, and B15 removes its largest wrong-post class rather than pricing it. **OQ-6's residue, said
  as a risk rather than buried in the ruling:** a wrong `is_year_end` or `tax_affecting` entry is caught
  **downstream** — the correction is a **reversal**, not a click.
- **Exit 2 of OQ-4 has no door until PR-2 builds one** (GM-10): until then a withdrawn human draft is not
  re-admitted for a fresh agent read, so the ruled behaviour is designed but not live.
- **Two architectures exist between PR-1 and PR-3**, and the legacy fallback arms now live to the **Wave-G
  reset** (ADR-0072 ①.2), where F-A10 judges them.
- **PR-1 is WIDE, and the owner priced it (D34).** Ten CoR'd D1 bodies, a `CREATE TABLE`, two constraint
  swaps, two new B4 formulas, one predicate extraction **and the `interactive_client` limb**, in one window;
  only B12/B13 stayed out. **The residual risk is that single window.** The sever-if-too-wide escape hatch
  survives as a contingency, but **re-crossing it means re-opening D34 with the owner**, not a builder's call.
- **C-3's census is a standing warning, not just a fixed finding.** `coding_lane` (`0011:1570`) has **no
  is-not-null guard** on `w.client_id`, so any future change to what a credential's client binding means
  changes a **frozen** workflow's answers with no byte change anywhere.
- **Non-goals:** no bank matching (F-A3), **no settlement judgement** (B1 defers it there), no close keys
  (F-A4), reporting (F-A5), freeform read (F-A6) or filing verb (F-A7); no `except_bank_line` widening; no
  change to the witness predicate or prompts (openers ①②) or to `clara.bank_rules` / `_bank_rule_sightings`;
  **the B12/B13 extraction is out of this train** (§5); and **no amount routing, ramp, sampling or dark launch
  — ever**.
