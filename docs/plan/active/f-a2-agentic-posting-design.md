# F-A2 — the agentic posting lane: design

> **Design doc of record for Wave-F Track A item F-A2** (`docs/plan/active/wave-f-contract.md`
> §F-A2, lines 47-64), carrying **F-A10's retirement clause**. **v4, 2026-08-20** —
> APPROVED-AS-DESIGN by the final verify subject to R-1..R-3, all folded, plus the **OQ-4 and OQ-6
> owner rulings**. v3 folded the delta review (which **reversed C-3** and **refuted P5**); v2 folded
> the R1 review. **Change log: Annex G.** Binds under ADR-0071 G1.2/G1.3/G1.4; digest **laws 71-76**,
> **27**, **68**, **69**, **28**, **29**. Every build PR takes the uniform ADR-061 ladder; **every
> rung of §3.2 is judgement logic** (review law 1).
>
> **Annexes**, split three ways to stay under the 500-line file limit:
> `f-a2-annexes-1-estate.md` (**A** findings at the bytes · **B** retirement) ·
> `f-a2-annexes-2-mechanics.md` (**C** battery · **D** the tier, wake-kind and C-3 censuses, T3's
> mechanism) · `f-a2-annexes-3-record.md` (**E** refusal vocabulary, receipt shape and columns ·
> **F** the `posted` chain · **G** change log · **H** decision register · **I** B4's formulas).
>
> **Two method lessons, each of which cost a finding** (Annex G): where a claim cannot be settled
> from source, **the design carries it as a PREDICTION the PR-1 rig replay must confirm**; and
> **line numbers come from the instrument that prints them**, never from arithmetic on a window.

## 1 · The ruled shape (fixed, not designable)

- **ONE unattended coder replaces the draft-only `autoDraft`** — reads (raw OCR + witness facts +
  context pack incl. wiki/history per law 73), decides, and **posts** when the walls pass; what
  cannot lawfully post lands as a draft or a typed open question.
- **Every document class, `journal_entry` generic included** — **superseding 7A-R7 / ADR-063**
  (`registry.ts:196-197`), said in those words because a live ruling is overturned, not drifted
  past. **It widens DOCUMENT CLASS and nothing else.**
- **Three owner rulings fix the authority shape.** **OQ-1:** unattended posting at **ANY amount**,
  no human checker, no hardcoded threshold — the walls validate format and numbers, they do not
  route by size (*the agent's contrary recommendation is on file as **dissent***; §3.3.1).
  **OQ-6:** **no category gate either** — `is_year_end` and `tax_affecting` post unattended (§4).
  **OQ-4:** the **three-exits shape** — unattended posting is the agent's **own untouched derivation
  only** (§3.3.3).
- **A wake-wrapped post/approve path** recording the agent as acting identity with model+version +
  rationale on the receipt (law 71). **No amount routing, ramp, sampling or dark launch.**
- **Walls re-proven here:** invariants (a)(b)(c), balance, evidence/region, currency,
  direction/type polarity, **the witness-pair corroboration gate**, CLR19. **N1 lands here.**
- **Retires:** `execute_rule_post` + the `rule_post` consumer, the coding/autopost rule verbs, the
  sighting-breeding inserts, the expiry belt. **History rows stay as knowledge fuel.**

## 2 · The estate as-found — the seven findings that bind §3

Bytes in **Annex A**, which every §3 reference resolves against:

1. **The corroboration gate does not block anything today** — `corroborated=false` *removes* walls;
   the only `not_corroborated` refusal is `0046:1141-1146`, **on the executor F-A2 retires.**
2. **Breeding is not a retirable verb** — inside `_approve_entry_core` (`0037:2046-2100`), the
   `rule_decisions` limb inside `_draft_entry_core` (`0016:4170-4195`); both are CoRs on deployed
   audited writers → **D1 write-quiesce**.
3. **N1's body chain, CORRECTED** — the trigger calls a **1-arity** delegate whose NULL pin is one
   level down (`0016:3957-3961`); **the identical chain exists for sales, untouched by v1**.
4. **The generic kind** — a NULL `coding_kind` **skips** `0016:4020-4034`'s coded-kind preconditions.
5. **`check-binding-post-control.mjs` goes FALSE-GREEN** — it parses only `CREATE [OR REPLACE]`, so
   **a drop is invisible to every failure path**.
6. **Settlement kinds are unwalled on the agent post path** — the refusal (`0037:1826-1830`) and its
   durable half (`0037:519-522`) both key on a rule id **the agent never passes**. WCA-R6: *"Which of
   three open bills a RM5,000 payment settles is a JUDGEMENT, not a document fact."*
7. **The wake director is NULL by construction on the unattended lane** — `mint_wake_credential`
   (`0011:1178-1186`) forbids `on_behalf_of` on `autodraft`, and a client binding on every other kind.

## 3 · The design
### 3.1 The verb: one wake wrapper, one ungranted core, one shared approve core

**`clara.wake_post_entry(p_entry, p_expected_revision, p_client, p_books_version, p_rationale,
p_model, p_op_key) returns jsonb`** — the `0078:96-107` idiom:

```
wrapper  clara.wake_post_entry         granted to clara_wake_interactive and nothing else;
                                       allowlist rows per posting wake kind; raises only; NO DML.
core     clara._agent_post_entry_core  ungranted; the ladder + the receipt + the delegation.
delegate clara._approve_entry_core     the SHARED approve core (8th body, §3.5) — ONE approve
                                       semantic, two callers.
```

**Why S1, not S2 or S3.** The decisive argument is *where the walls live*: under S1 the ladder sits
in the post verb's own core, so **no sequence of tool calls can post a draft that should not post**.
**S2 is refused** — it must compose two lock orders and pulls finding 3's divergence inside one
transaction. **S3 is refused** — its second call is the human `approve_entry`, carrying no admission
gate. **One S1 property the Tier-D critique makes load-bearing:** the draft was written in an
**earlier transaction**, so a commit-time abort rolls back *only the post attempt* — the net book
state equals a Tier-B refusal and the difference is purely **evidentiary**.

**Acting identity rides the existing ctx bag.** `_approve_entry_core(p_ctx jsonb, …)` (**signature
`0037:1750`**; keys at `0037:1763-1769`) already carries `actor`, `firm`, `checked_via_rule_id`,
`bound_extraction`, `receipt_preheld`; the agent lane adds `on_behalf_of`, `wake_kind`, `is_agent`,
`post_receipt_id` — **no arity change on a deployed audited writer.** **Op-key discipline
(`0078:150-152`):** the caller's key is deterministic, a blank one refuses with the typed CLR10
detail, and the inner key is **derived, never minted**. **The agent never picks an authoritative
input** (`0078:135-146`): blank `p_rationale`, incomplete `p_model` or null `p_books_version` refuse.

### 3.2 The gate ladder — four tiers, re-derived

**Tier membership is a fact about `pg_trigger.tgdeferrable`, not a list anyone should write from
memory. PR-1 derives it by RIG REPLAY and the design cites the replayed census** (Annex D holds the
prediction and a per-trigger disposition). v1 got two members wrong in each direction; the review's
own positive list was short by five.

**Tier A — authority and shape. RAISE (CLR\*).** `_reserve_op` · entry in your firm → CLR11 ·
`for update` · status is `draft` · `revision_token` → CLR06 · filing unmoved → CLR02 ·
`assert_books_current` → CLR12 · **A8 (§3.3.2)** · `closing_transfer` → CLR03.

**Tier B — the admission gates. TYPED NON-POST RECEIPT, no raise.** The transaction **commits**, so
the reason is durable. **All fourteen rungs are EVALUATED, always; the receipt carries the full
failing-rung vector; posting requires an empty vector.**

| # | rung | source | token |
|---|---|---|---|
| B1 | **coding_kind ∉ {customer_receipt, supplier_payment}** | finding 6; WCA-R6 | `settlement_kind_human` |
| B2 | corroboration is TRUE | relocated `0046:1141-1146` | `not_corroborated` |
| B3 | `_corroboration_bound(entry, total_cents)` | `0016:4133`, `0037:1930` | `anchor_unbound` |
| B4 | the entry's amount ties (per kind — **Annex I**) | `0016:4139-4147` + **two new formulas** | `anchor_untied` |
| B5 | no `amount_exception` without `amount_override` | `0037:1934-1937` | `amount_conflict` |
| B6 | no human override flag present | new | `human_override_present` |
| B7 | amount-bearing evidence is `provenance_tier='verified'` | `0009:460-466` | `unverified_evidence` |
| B8 | cited evidence is the generation the fact state names | opener ⑥ §2.3 | `facts_moved` |
| B9 | `_open_question_blocks` returns nothing | `0012:87-108` | `open_question_blocks` |
| B10 | `_assert_supplier_bill_shape_at(entry, v_bound)` | `0037:1989` | `supplier_leg_shape` |
| B11 | **`_assert_sales_invoice_shape_at(entry, v_bound)`** | `0037:1990` | `sales_leg_shape` |
| B12 | **the FA movement belt predicate** | `0041:2665-2739` | 3 tokens, Annex E |
| B13 | **the advance movement belt predicate, split by axis** | `0043:3146-3155` / `:3168-3172` | 3 tokens, Annex E |
| B14 | **a NULL-`coding_kind` entry carries no AR/AP control leg** | `0037:1441-1443` | `generic_control_leg` |

**B1 and B14 are interlocks, not new restrictions**, both stated so nobody later "restores" a
missing rung. B1: WCA-R6 stands until **F-A3** opens settlements under their own walls, and it makes
two deferred shape floors (`0037:674`, `0037:680`) unreachable. B14: `t_je_subledger_belt`
(`0037:1447-1451`) requires an approved entry to tie to its open items **on its own control legs**,
which `_subledger_on_approve` materialises for coded kinds but **not for a NULL `coding_kind`** — so
**B14 refuses the shape** rather than extracting a third predicate. **It narrows the generic lane
and OQ-5 says so.**

**B10-B13 pre-check genuinely deferred belts a lawful agent draft can trip.** B10/B11 cost nothing
(`_assert_*_shape_at(uuid,uuid)` are already callable). **B12/B13 have no callable predicate**, so
PR-1 **extracts each into a callable `_at` form and makes the trigger a thin delegate** — the
`0016:3957-3961` pattern, which the advance belt's own header demands (`0043:3149-3152`: the test
*"lives in exactly one body"*). **Fallback:** they drop to Tier D with the commit error's
`(errcode, reason)` recorded in `last_refusal`.

**B8 is deliberately redundant with A5 and must be forced non-vacuously (law 31)** — A5 covers the
common case only because `0096:45-60` rotates an open draft's token when facts settle, **one
migration old**, so cited as a dependency rather than assumed. **The vector is three-valued (law
68):** an absent-input rung is **`not_evaluable` — it fails admission but is REPORTED DISTINCTLY**,
since `pass` there is the ARM-0 defect.

**Tier C — the delegated walls. RECEIPT BY CONVERSION, on `(errcode, reason)` PAIRS ONLY — no
wildcards, no errcode-only members; unknown re-raises.** v1's classifier could not have worked: most
named raises carry **no `detail` at all**, so `(CLR25, currency)` would have swallowed the
corroboration-bound contradiction, *a money wall*.

| pair | site | today |
|---|---|---|
| `(CLR25, currency_unsupported)` | `0037:1925-1927` | bare — **PR-1 adds the detail** |
| `(CLR25, corroboration_contradicted)` | `0037:1930-1933` | bare — **PR-1 adds it**; split from the row above because **this one is the money wall** |
| `(CLR10, already_reversed)` ×2 | `0037:1836`, `:1841` | bare — **PR-1 adds it**; shares its errcode with `0037:1778` (op_key), which is why errcode-only matching would swallow three unrelated walls |
| `(CLR23, counterparty_landscape_moved)` | `0037:1852-1857` | bare — **PR-1 adds it** |
| `(CLR23, counterparty_birth_race)` ×2 | `0037:1858-1879` | bare — **PR-1 adds it** |
| `(CLR21, duplicate_bill)` | `0037:1939-1959` | already typed |
| `(CLR21, duplicate_sales)` | `0037:1961-1987` | already typed |
| `(CLR19, write_into_closed_period)` | `0056:692-700`, `t_period_wall` (**not deferred**) | already typed |

**`(CLR10, settlement_not_autopostable)` is NOT a member** — typed (`0037:1829`) but **dead on this
lane**; B1 is the live wall, and listing the dead one would be a wall that can never be asked
(law 31). Exclusions in full: Annex E.

**Tier D — the genuinely deferred belts. ABORT, and it cannot be converted**, because an exception
block opens a subtransaction and deferred constraint triggers fire at **COMMIT**, outside it. **Every
Tier-D abort settles the task `failed`, never a refusal** — with the commit error's
`(errcode, reason)` in `last_refusal`. **`t_je_bank_pending_orphan_belt` is dispositioned, not
deferred:** unreachable in F-A2 (no `bank_matches` row on this path) and a **named forward obligation
on F-A3**. **The runtime read stays advisory** — a hint; the DB wins.

**The refusal receipt** carries the tier, the reason, the **full rung vector** and a `verdict` block
recording **what the DB saw** — shape in **Annex E**, with the argument that the all-rungs vector is
a **deliberate semantic improvement over `0046`'s placed-LAST ordering, not byte-equivalence**. Two
new event kinds join the taxonomy with their pairs — **`entry.posted`** and **`entry.post_refused`**,
both carrying `on_behalf_of` and `via_wake_kind`. **The vector has TWO durable homes and §6 reads
both:** refusals into `clara.op_receipts` (§6's source for every non-posting document), successful
posts into `entry_post_receipts.gate_verdicts`.

**The consumer contract, as a design law: no consumer may test `vector[r] = 'fail'`** — every
consumer tests for `'pass'` and treats everything else, including an unknown future value or a
missing key, as non-admitting, since testing for `fail` lets a rung added later silently admit
(law 68 at the consumer). Bound: **`classifySettleReceipt`**, the dashboard, §6's aggregation.

### 3.3 Acting identity, the receipt, and the walls that make it structural

**`clara.entry_post_receipts`** — a new append-only table keyed `unique (entry_id)`, carrying the
acting actor, `on_behalf_of` (**nullable — §3.3.1**), `via_wake_kind`, the model snapshot, the
rationale, `gate_verdicts`, `approval_arm`, `maker_active_at_approval` and the op key. Columns and
CHECKs in **Annex E**; append-only triggers, zero DML grant to any role.

**`gate_verdicts` stores `{verdict, rung_vector}` PLUS `extraction_id` FLATTENED to the top level**,
because `t_je_assert_*_shape`'s pin (§3.4) reads it from inside a trigger and a nested accessor there
is a silent-NULL hazard: the wrong level yields NULL, which **is** the unpinned behaviour T3 exists
to remove, and it does so **without failing anything**. A CHECK requires the key non-blank, and
**C.7's agent-side cell MUST FAIL on a wrong accessor.** **The write contract is an invariant** —
written **only on a successful post, after the delegate returns, in the same transaction, inside the
Tier-C-protected region**, so a conversion rolls it back; **no refusal at any tier writes a row**,
and the deferred receipt trigger fires at COMMIT after the insert by construction.

**Why not a jsonb column on `journal_entries`:** `_tf_entry_immutable`'s draft→approved allow-set is
**exactly eight columns** (`0016:4958-4960`) checked as a whole-row diff — a new column needs a 9th
member, i.e. a CoR on a guard plus a true-up of its diff test. **Why not
`journal_entry_revisions`:** `uq_journal_entry_revisions_token unique(entry_id, revision_token)`
(`0011:903`) versus a token that cannot rotate at approval — a `revision_no=1` row would collide, and
a fresh uuid would make the column lie (`0016:4913-4921`).

#### 3.3.1 Acting identity per lane, and what OQ-1's ruling changes in the core

Per finding 7, `autodraft` is client-bound and **director-less by construction**, so on the
unattended lane **there is no directing human and the receipt says so rather than inferring one**
(law 68): `maker_active_at_approval` is NULL there, never `false`.

The maker/checker family at `0037:1992-2010` has three CLR05 arms; every agent draft has
`last_human_editor = NULL` (`0016:4087`), so arm 1 fires and demands a non-blank attestation the DB
does not validate, while `eligible_checker_count`'s `u.is_agent = false` (`0004:81-86`) makes
`distinct_checker` unreachable. Under the ruling the honest shape is **not** the agent writing
herself a sentence: **the 8th body gains an agent arm that does not participate in maker/checker at
all**, recording **`approval_arm='agent_unattended'`** — dressing an unattended post as a
self-attestation would make `self_approval_attestation` assert a judgement nobody made. **The human
lane's three arms are byte-untouched.**

#### 3.3.2 The walls: A8, the receipt wall, the override wall

- **A8 — the verb posts only entries the agent drafted AND NOBODY HAS TOUCHED:
  `maker_actor = clara.agent_user_id() AND last_human_editor is null`.** The second conjunct is not
  decoration: `revise_entry` lets a human rewrite an agent draft's **numbers**, setting
  `last_human_editor` and rotating the token (`0016:4909-4913`) while writing only
  `duplicate_override` into `flags`, so **B6 does not see it**. Without it the agent posts a human's
  numbers unattended — a maker/checker inversion **no ruling authorised**. *"Her own work"* means
  **untouched**. **OQ-4 confirms A8 and names the lawful exits (§3.3.3).**
- **`t_je_agent_post_receipt`** — a deferred constraint trigger for the draft→approved transition
  (the `0009:533-537` shape). **ARM-0 first (law 68):** an unresolvable `checker_actor` refuses
  (CLR08) — an arm that is **unreachable** (FK-bound at `0003:117`; `0016:4950-4952` already refuses
  NULL), **which the design declares rather than banking** (law 31). Then `is_agent` → require
  exactly one receipt row. *Verified inert on all 20 existing call sites.*
- **B6** — the agent lane passes `'{}'` flags, and **an entry carrying either override
  (`amount_override`, `duplicate_override`) is a human judgement about a number, so she does not
  post it.**

**The three dropped channels, closed.** `_approve_entry_core` hard-codes `null` for `on_behalf_of`
and `via_wake_kind` in `_audit` (`0037:2102-2106`) and `_append_event` (`0037:2111-2112`, empty
payload), while `_draft_entry_core` passes both through (`0016:4237-4239`). The 8th body reads them
from `p_ctx`; the event names the `post_receipt_id`.

#### 3.3.3 OQ-4's three exits — what happens to a human-edited agent draft

**RULED.** A8 stands. The **forbidden middle** is pass-through of human numbers under agent identity
with nobody's approval on record; the two lawful exits are **(1) the human posts it, under human
identity** — the ordinary `approve_entry` path — and **(2) the agent RE-DERIVES and posts her own
conclusion, under agent identity**, treating the human's edit as lawful **context input** (law 73),
not an instruction, with a rationale citing the suggestion she weighed. **The trigger is designed,
not implied** — `revise_entry` emits `entry.revised`, re-admitting the document for a fresh read —
and its load-bearing constraint is that the **double-coding wall** (`0016:4011-4017`, `CLR21
double_coded`) makes **exit 2 available only once the human's draft is withdrawn**: while a human's
numbers are live on a document, the only person who can approve them is a human. Mechanism and the
agree/disagree branches: **Annex D §D.3**.

### 3.4 N1 — the check moves earlier, and T3 is re-cut to cost nothing

**At draft: agent-lane-only, keyed on `not p_is_human`.** The live draft core never calls
`_assert_*_shape*`; the copies land there pinned to the draft's own resolved extraction. **Not
applied to the human lane** — a human draft is a work-in-progress `revise_entry` exists to finish;
an agent draft is a proposal-to-post. The precedent for lane-asymmetric strictness is in the same
core (`assert_books_current`, `0016:4241`).

**T3, and why BL-5's implied remedy is declined.** Recutting the 1-arity delegate would reach the
draft floor, human approve and the D-P4 probe — the expensive fix. **Recut the two TRIGGER FUNCTIONS
instead, resolving the pin from the entry's own post receipt**: a human approval writes no receipt,
so the pin is NULL, so the null-pin behaviour is reproduced **byte-for-byte**. Human-lane blast
radius is **zero by construction**; the delegates stay untouched and leave the D1 list; the
divergence closes on **both** arms. Mechanism, SQL and the three attack surfaces: **Annex D**.
**T1 (leave unpinned) is the fallback; T2 (a txn-local GUC) is refused.**

**Lane discrimination — the narrow claim only.** v1's estate-wide law ("`p_is_human`, never
`p_wake_kind`") **is not true of the estate** and the phrasing is withdrawn. Verified verbatim:
`0046:2687-2696`'s direction-family arm is gated `not p_is_human and p_wake_kind='autodraft'` while
the counterparty-kind arm above is gated `not p_is_human` alone, and **that arm is re-cut**; every
other wake-kind-keyed wall carries a disposition in **Annex D**.

### 3.5 Breeding excision — the 8th body

**`_approve_entry_core`, 8th body** (lineage in Annex B). Delete `0037:2046-2100` whole — both
`rule_sightings` inserts and the ≥3 `vendor_account` loop — which also removes `0040:7115`'s
`bank_rule_suggested` conjunct spliced into the block's gate. Same body: the ctx identity
pass-through, the agent arm (§3.3.1), the `bound_extraction` pin, the Tier-C `detail` reasons.
**PR-1's prestate must state, per marker, RETIRE or CARRY** — a copy-the-0040-idiom prestate
otherwise refuses at apply. The `0040:7148-7159` anti-revert list pins **11 markers**; F-A2 retires
**3 names / 5 occurrences** and carries **8** (Annex B, which also records that
**`bank_rule_suggested` is not on that list and its own count goes 2 → 0**).

**`_draft_entry_core`, next body.** Delete the `coding_rules … FOR SHARE` read (`0016:4170-4182`) and
the `rule_decisions` insert (`0016:4184-4195`) — **subject to OQ-2**; add N1's draft copies; re-cut
the direction-family arm; widen for the generic kind. **Sequencing, fixed now:** opener ⑥ also CoRs
this body, and prestate is pinned by prosrc SHA not by marker (`0093:62-63`), so **F-A2's file is
authored against opener ⑥'s output**.

**The D1 write-quiesce surface is eight bodies and one ALTER TABLE** — enumerated in **Annex B**,
spanned by **one continuous window**, prestate pinned by prosrc SHA **measured by rig replay** with a
**pre-quiesce sha tripwire**; **the 1-arity shape delegates are NOT on the list.**
**KEEP-AS-HISTORY:** `clara.coding_lane` is reached by the **frozen** toolfaces and
`journal_entry_revisions.rule_decision_id` is a live FK (`0011:898`) — so **drop the WRITES and the
VERBS; keep the TABLES.**

### 3.6 The pack gains an approved-coding-patterns block — recomputed, never accrued

**The contract, in one line:** a fifth dynamic splice on `clara.get_context_pack(uuid,text)` adds a
client-scoped, budget-capped **`approved_coding_patterns`** block over approved, unreversed entries —
**recomputed on read, never accrued**, so it removes a write from the approve core and cannot drift
from the books. Columns, splice mechanics and the marker discipline: **Annex D §D.4**.

**Law-73 boundary — the rule, not the mechanism.** The pack **does** read wiki (`0017:5017-5060`),
and **on this lane the knowledge layer lawfully informs the judgement that IS the posting
authority**. Forbidden is any gate/bound/floor reading wiki or patterns; `WB_AUTHORITY_FNS`
(`wb-helpers.mjs:212-226`) proves it, **F-A2 extends** it with the new post-path verbs, and
`get_context_pack` stays off it. **Corollary, so nobody builds it:** a patterns block in the pack and
a DB-side "have we posted this shape before?" check are two different things, **and only the first is
lawful**.

### 3.7 Chat parity, the generic kind, and the fail-closed path that does not exist yet

#### 3.7.1 What parity is, what it is not, and B4's two NEW walls

One allowlist row per posting wake kind, both mapping to `clara_wake_interactive`
(`0011:4293-4294`); `'proactive'` never, `clara_agent_ro` never. The **posting authority** is
identical and law 71 does not distinguish the lanes. What parity is *not*: a widening of the
settlement judgement (B1 applies to both) or of client attribution.

**B4: "no wall is re-implemented" was false for three kinds of four, and the claim is withdrawn.**
`0016:4139-4147` and `0037:1928-1938` are **supplier_bill-only**, so **B4-sales and B4-generic are
NEW WALLS WITH NEW FORMULAS**. **The three formulas and their derivations are Annex I, and PR-0's
review emphasis points there** (law 1: each new formula gets its own pass). **The named cost:** a
generic JV whose amount is *not* the document total **cannot tie and lands as a draft**; the
alternative is no anchor at all, which is what `0046:1128-1140` wrote against itself. **OQ-5.**

#### 3.7.2 The chat fail-closed path — designed, not assumed

The contract requires that what cannot post lands as a draft **or a typed open question**. Today a
chat-lane post **cannot** do the second: `wake_open_question` (`0011:1990-1995`) raises CLR03 unless
the credential is `autodraft` **and** client-pinned, while `mint_wake_credential` refuses a client
binding on any non-autodraft kind — **the authority is granted (`0011:3909`) and the body refuses.**

**The fix is a NEW WAKE KIND, not a weakened CHECK — v2's decision is REVERSED.** The delta review's
census killed the widening (Annex D holds all four findings with their bytes); two decide it.
`clara._agent_read_admitted` refuses **any** client-pinned credential on a `p_client => null` call
(`0011:3934-3936`), so `list_unassigned_documents` **regresses** — and `coding_lane` (`0011:1570`),
the one reader with **no is-not-null guard**, would suddenly return rows, so **frozen
`chatTurn_v12`'s answers would change with no byte change anywhere**.

**So F-A2 mints `interactive_client`**, joining `ck_wake_credentials_kind_0011` (`0011:623-624`) —
its mint requires a firm-congruent active client as `autodraft` does while **keeping
`on_behalf_of`**; the durable client CHECK (`0011:625-628`) is **untouched**. **R-1, the narrowing
that makes this safe: the pinned kind is minted for exactly ONE call path — the fail-closed
`wake_open_question` call. Every other chat scoped read and write, including the post itself, keeps
plain `interactive` with its NULL-client guarantee**, so the census findings never arise; if chat
ever goes client-scoped throughout, that is a **future decision which must re-open the census** and
accept them as deliberate changes. The new kind **satisfies the PIN BLOCKER's own stated exit
condition** (`0011:1980-1983`) rather than deleting the blocker, and `wake_open_question` re-keys
onto **the client pin, not the kind name** (law 27(3)). Scope caveat and the four roster surfaces:
**Annex D §D.2**. **A fourth change lands in PR-2:**
`mintWakeCredential`/`mintWakeCredentialObo` (`pools.mjs:304-312`, `:326-334`) **hardcode
`"interactive"` with no client parameter**, declared and called in `chatTurn.v10.infra.ts`
(**`// @frozen` line 1**), so parity needs a **new frozen `_vN` of the infra file**. **If that is out
of scope, chat parity does not ship.**

**The generic kind.** `autoDraft_v9`'s enum gains it; the DB writer already accepts NULL
`coding_kind`. Its honest problem is that NULL **skips** `0016:4020-4034` and is **outside** the
direction-family arm's kind list (`0046:2687-2689`) — it reaches post with fewer walls than any
other shape. B4-generic plus B12/B13/B14 are what stand between it and an unanchored unattended
post; its cells are gating.

### 3.8 The `posted` outcome, and retirement

**The `posted` outcome is a four-layer chain plus six further sites** (all in **Annex F**), and a fix
at any one layer alone either lies or raises. The two that lie: **`0036:979-980`'s mapping silently
buckets `posted` → `skipped_lane`**, and **`0011:2754-2762`'s finalize counts a posted row in none of
its three counters** — plus `0036:987`, which would write a **fabricated `CLR29` refusal token** onto
a posted row. **§6's POSTED count therefore reads a surface that cannot silently bucket:**
`clara.entry_post_receipts`, cross-checked against `sweep_run_items.outcome='posted'` — **a
disagreement between the two is itself a finding.**

**Retirement's four decisions.** **(1)** The **false-green CI gate retires in the drop PR**, with its
selftest, the `ci.yml` step and both `package.json` entries. **(2)** Two helpers **fail SOFT and are
deleted, not left** (`x1-helpers.mjs:368-370`; `x37-wave-c-a-subledger.test.mjs:1684-1693`).
**(3)** The post-Window-A re-extraction is **TWENTY documents (ADR-0072 ①.2)**, not the full 64 —
too few to satisfy the fallback arms' *full-population* retirement trigger (`0101:465-467`), so by
its own **"whichever lands first"** clause the arms retire at **the Wave-G reset**, where F-A10
closes. **(4)** The **WB-R2 assertion
sites are re-pointed or re-worded, never silently deleted** — six sites in Annex B, **two of which
go VACUOUS rather than red** three lines apart in one test — **and the census follows the retired
VERBS across every fixture surface, never the law's NAME**, since a name-keyed sweep missed the
sixth site, the second head, and an entire test file.

## 4 · Owner questions

**RULED.** **OQ-1** — any amount, no human checker, no thresholds; the agent's contrary
recommendation is on file as dissent. **OQ-4 — the three-exits shape** (§3.3.3). **OQ-6 — option A,
the category gate is NOT inherited ON THE AGENT LANE:** `is_year_end` and `tax_affecting` post
unattended, because **both carry mandatory downstream human checkpoints** — year-end meets close keys
②③, tax-affecting meets F-T3's human-reviews-and-e-files-always — unlike the amount case, which has
none, so **gating the gated-later while freeing the never-gated would be backwards**. The honest cost
stands, and §7 keeps it. **Supplementary ruling: the HUMAN lane's distinct-checker gate on the same
categories STANDS unchanged** — three asymmetries (an automatic vs a manufactured second party · a
segregation-of-duties threat model that does not apply to the agent · one click in an attended flow
vs a broken unattended one), in **Annex G's F33**, which also registers it as a possible future
per-firm **governance dial**. **The charter's "human lane unchanged" scoping is re-confirmed.**

**OPEN**, each with its recommendation:

- **OQ-2 · The `rule_decisions` limb — in or out?** **Stop the write, keep the table** — a live FK
  (`0011:898`) forbids dropping it — and **remove `list_review_queue.rule_backed` from the
  dashboard** rather than render a permanently-false column (law 27(2)).
- **OQ-3 · `preview_ocr_sales_evidence` and the seeding batch's output format.** The former
  (`0046:2010`) has no purpose after F-A2 — **retire it with the floor**. `tick_seeding_proposal`
  (`0017:4525`) **writes a signed `coding_rules` row as its output**; **re-point it to a
  KB/open-question artifact inside F-A2**, on F-A10 grounds — leaving it minting signed rules nothing
  executes makes "the rules machine is retired" untrue *in the data*.
- **OQ-5 · The generic-kind anchor. Adopt B4-generic.** **Two costs:** multi-entry document shapes
  land as drafts, **and B14 means a generic entry may carry no AR/AP control leg at all**. Both
  populations are **measured** by §6, not assumed.

## 5 · Build sequence

**Hard prerequisite the contract's sequencing line does not state.** Openers **①②⑥** are inside the
F-A1→F-A2 chain and are a hard **acceptance** prerequisite (§6): at 0/33 corroboration this ladder
posts nothing — safe, and indistinguishable from a broken build. **All six openers are MERGED
(2026-08-20); PR-1 is authored against opener ⑥'s output (`0101`).** The train:

1. **PR-0 (gate).** Independent judgement-logic review (law 1) **plus** a cross-model adversarial
   pass (law 28). **Named emphases: B4-sales and B4-generic (Annex I), the Tier-C pair set, the
   `interactive_client` kind and its R-1 narrowing, and T3's receipt-keyed pin** (Annex D names its
   three attack surfaces).
2. **PR-1 (DB, two files, ONE D1 window)**, the `0077`/`0078` split — part 1 ungranted machinery
   granting nothing, part 2 the wrapper, its single grant, the allowlist rows, the zero-grant re-pin
   and the census tail. **Per-file contents and the D1 list in Annex B.** `UNNUMBERED_*`, numbered
   at merge.
3. **PR-1b (DB, no ceremony).** The `get_context_pack` fifth splice — a read body, **no D1**.
4. **PR-2 (runtime).** **autoDraft_v9** (post tool · generic kind · the `posted` settle ·
   `classifySettleReceipt` incl. the consumer contract · Tier-D `last_refusal` capture · **OQ-4's
   re-derivation trigger**) · **chatTurn_v13** · **and a new frozen `_vN` of
   `chatTurn.v10.infra.ts`, which mints `interactive_client` for the `wake_open_question` path ALONE
   and plain `interactive` everywhere else** (R-1). New frozen exports + registry repoints, never
   edits; prompts inside the freeze so tuning runs pre-freeze; bundle-grep after build.
5. **PR-3 (cutover + retirement), only after PR-2's image is verified live.** The drops, the consumer
   file, the roster edits, the `apps/dashboard/app/rules/` retirement (**relocate
   `AdjustmentTemplatePanel.tsx`**), the parts catalog, the CI gate, the WB-R2 re-pointings. **D1.**
6. **PR-4 (acceptance, zero code).** The re-measure as-run, `PROGRESS.md`, and **F-A10's terminal
   check — which now closes at the Wave-G reset (ADR-0072 ①.2), not on a backfill.**

**Two ceremony windows**, both from merged `main`. Standing runbook hazards: the DSN bridge + a
**110s** quiesce, `fly.exe`'s non-zero exit after a successful non-tty `ssh -C`, the post-restart
zombie pooler sweep, `PG*` vars for rig runs, the reconciler herd against two lane slots.

## 6 · Test battery (Annex C) and acceptance

**Every blocker gets a cell:** the Tier-D replay census · a CLR25 conversion naming the *right* wall
· a settlement post refusing at B1 · the FA, advance and generic-control-leg rungs · A8's
revised-draft cell **and OQ-4's two exits** · the write contract's three per-tier zero-row cells · a
chat `wake_open_question` round trip **plus the extend-only regression cells** · the `posted` chain ·
T3's human-lane byte-identity **and its must-fail accessor cell** · **C.8's breeding cells fixtured
as AGENT posts**, since a human fixture proves only the human case.

**Law 29 governs.** (1) **Openers ①②⑥ live** are a hard prerequisite — without them B2's positive
cell has no corroborated document. (2) **The forced order: ceremony → re-extract FIRST → then
evaluate** (`f-a1-corpus-measurement.md`'s obligation) — a `witnessFacts.v1` row holds no SST answer
and no coverage receipt, so it can never satisfy the successor nil-tax arm, and evaluating first
re-scores on the wrong population. (3) **Publish FOUR numbers — opener ①'s three plus POSTED — over
the TWENTY re-extracted documents** (ADR-0072 ①.2), with **the full failing-rung vector** per
non-posting document, from `op_receipts` for those and `entry_post_receipts` for posts. **State the
denominator every time:** twenty is a *sample* of the measured 33 carrying all four predicted
refusals plus the passing classes, so a rate off it is not comparable to 0/33 unless it says so.
(4) **A live post on real books** with its receipt read back and its `entry.posted` event carrying
obo + wake kind — **ROME PUBLIC ADVISORY** first, then a BELCORT client; constraints 12 and 13 stand
throughout (**ROME SECRETARY's customers are NAME-ONLY**). (5) **F-A10's terminal check** — one
architecture, executor gone *(by rig replay)*, no writer breeds, the CI gate retired, frozen bodies
reachable, history rows present. **It closes at the Wave-G reset**, since twenty documents cannot
trip the fallback arms' full-population trigger. (6) **OQ-5's populations are reported.**

## 7 · Registered risks and named non-goals

- **G-11 — MEASURED, 2026-08-20** (rolled-back read-only live read, frontier 92/`0097`). Blocking
  scopes: `client` **or** same `document` **or** same canonical `vendor` (`0012:87-108`). Live:
  **client-scoped = 0 open, 0 all-status — none has ever existed**; vendor-scoped open = **2**, both
  `origin='rule_proposal'`, which `_open_question_blocks` **EXCLUDES** (`0012:100`); the mass is
  **document-scoped: 8 open, all BEE** — self-blocking by design. **Honest pricing: real machinery
  with a zero population today; the cost arrives with scale, and the receipt names the blocker.**
- **The generic lane is the thinnest-walled shape in the estate** — B4-generic, B12, B13 and B14 are its only unshared walls.
- **OQ-6's residue, as a risk rather than buried in the ruling:** a wrong `is_year_end` or
  `tax_affecting` entry is caught **downstream** — the correction is a **reversal**, not a click.
- **Two architectures exist between PR-1 and PR-3**, and the legacy fallback arms now live to the
  **Wave-G reset** (ADR-0072 ①.2), where F-A10 judges them.
- **PR-1 is large** — eight D1 bodies, an ACCESS EXCLUSIVE `ALTER TABLE`, two new B4 formulas, two belt extractions, a new wake kind across four rosters, plus PR-2's frozen `_vN` infra file. If PR-0 judges it too wide, sever **chat parity**, then **B12/B13**.
- **C-3's census is a standing warning, not just a fixed finding.** `coding_lane` (`0011:1570`) has
  **no is-not-null guard** on `w.client_id`, so any future change to what a credential's client
  binding means changes a **frozen** workflow's answers with no byte change anywhere.
- **Non-goals:** no bank matching (F-A3), **no settlement judgement** (B1 defers it there), no close
  keys (F-A4), reporting (F-A5), freeform read (F-A6) or filing verb (F-A7); no `except_bank_line`
  widening; no change to the witness predicate or prompts (openers ①②) or to `clara.bank_rules` /
  `_bank_rule_sightings`; and **no amount routing, ramp, sampling or dark launch — ever**.
