# F-A3 PR-0 — the gate record

> **The gate ran 2026-08-22** against design **v1** (`bank-agency-design.md` + the survey and the
> two annexes, ~1,500 lines, 158 distinct migration cites). Two lenses, per the design's own §5
> step 1: a **BYTES lens** — every estate claim re-derived at its cited `file:line`, the CoR lineage
> re-walked for every body the design plans to cut, the D1 list derived independently from the verb
> set, and each battery cell forced against the live bytes (11 findings) — and a **RULINGS lens** —
> every act measured against TA-P1…TA-P14, ADR-0074 and the Wave-F contract (5 findings). **Every
> finding was adversarially verified by an independent lane that did not author it, and the
> verifier's re-graded severity governs**, in both directions.
>
> **Verdict: the seam idiom, the ladder's shape, the receipt discipline, the tier-by-replay rule and
> the retirement inventory HOLD. Five blockers and six materials bind the build. PR-1 is severed
> four ways and a second gate (G1) is minted.** Every finding below names its fold target; **the fold
> is v2, and this file is its spec.**
>
> Standing caveat unchanged: migration-source reads are predictions about the live catalog. Two
> bodies in this estate have no file text at all (survey F7/§4) and PR-1a's rig replay is what
> settles them.

## 1 · What was attacked and HELD (clean bills, recorded so they are not re-argued)

- **The wrapper / ungranted-core / shared-delegate seam** (`0077`/`0078`, F-A2's D41 idiom). Both
  lenses judged it the right shape independently; no call sequence reaches a granted wrapper without
  a credential; the human public verb keeps name, arity, ACL, owner and floor. **Ships as designed.**
- **The citation hygiene**, which the bytes lens called "genuinely high": the twelve v1 findings, the
  sixteen censuses, the trigger cites, the dashboard/binding cites, the rig-meta cohorts, the runtime
  cites (`leader.mjs`'s six gates, the `reconciler-fa` idiom, the `pools.mjs` mint pair,
  `GOVERNED_EGRESS_PURPOSES` 232-300) and the Tier-D deferrability prediction all check out at the
  bytes. `upsert_account`'s live tip really is `0009:1460`; `unmatch_bank_match`'s `0044` reference
  really is an assertion, not a splice; finding **F2 is exactly right** at `0038:3738-3740` /
  `:3766-3769`.
- **TA-P1's open-register translation for 10 of the 12 named acts** —
  `resolve_bank_line_exception`, `void_bank_reconciliation`, `add_bank_account` and the 60-day ack
  all go to Clara unqualified, matching the ledger's own worked examples.
- **TA-P3 · TA-P5 (the ruling, not the mechanism) · TA-P8's general form · TA-P11 · TA-P14** are each
  implemented to the letter with named costs and receipts.
- **The drawer-2 gate repair's SCOPE** matches its ruling precisely, with **no double claim against
  F-T4** (its reachability is a separate finding — M1).
- **The retirement inventory.** The eight names leaving the `0040`/`0044` cohorts are each named and
  cited individually in Annex I and the survey's retirement table; C2/C3 need **no** widening.
- **The two pending constitutional amendments** are correctly treated as a build-blocking gate (G0)
  rather than assumed.

## 2 · Blockers — the build may not start until each is folded

**B1 · The SETTLE half of the lane is three more live money bodies, and P-2 hid them.**
*(BYTES lens, CONFIRMED blocker.)* v1 declared the settlement half CoR-free on P-2
(`annexes-1:61`, `annexes-2:200-201`, `survey:277`) because `_settle_from_bank_line_core` is
"already ctx-shaped". At the bytes it unpacks `actor` and `firm` and nothing else
(`packages/db/migrations/0044_wave_d_b3_af2_composite.sql:1722`) and rebuilds shallow sub-ctxs for
each callee (`:1908`, `:1927`, `:1946`); `_allocate_receipt_core` (`:1034`) and
`_allocate_payment_core` (`:1353`) re-derive the same two keys again (`:1051`, `:1367`), stamp
`maker_actor, last_human_editor` to the acting actor (`:1296-1299`, `:1580-1583`), call
`_approve_entry_core` with a three-key ctx (`:1324-1335`, `:1608`), and branch to a DRAFT on
`clara.is_high_stakes` — which is **not an amount test** (`0009:1513-1518`). The settle core turns
that into `v_match_status='pending'` (`~:1975`) and hardcodes `origin` from `p_via_rule`
(`:2091-2094`). **So an agent settlement either ABORTS at COMMIT with no refusal receipt (F-A2's
`t_je_agent_post_receipt`, no `entry_post_receipts` row) or posts attributed to a human editor who
does not exist — and it mints exactly the pending reservation design §3.2 promises it never mints,
and stamps `origin='human'` so the new deferred receipt wall never fires.** None of the three bodies
is named anywhere in v1's four files.
**Fold (v2):** survey **F13**; annexes-1 **A.2b** (the four-body defect/recut table); design §3.2's
high-stakes bullet and §3.4; register **A4b**; **P-2 → P-2′** (retracted and inverted); the three
bodies join **PR-1b**'s D1 list (Annex J.2 items 11-13); H.4 gains four cells including the
`tax_affecting` LIVE-post cell and the AP twin. **Method lesson minted and written into every
annex header:** *a body is "already ctx-shaped" only for the keys it actually UNPACKS.*

**B2 · The clock's execution path does not exist; A11 is retracted and gate G1 is minted.**
*(BYTES lens, CONFIRMED blocker. CROSS-ITEM.)* v1 §3.6/A11 said the estate's spine does the rest —
"no new `agent_tasks.kind`, no new relay path". At the bytes a `kind='wake'` `agent_task` is a HELD
PROJECTION: `packages/db/migrations/0011_daily_loop.sql:1230` raises *"a wake task is created
held"*; the LIVE matrix `_tf_agent_task_update` at `0011:1271` admits `old.status='held' and
new.status='cancelled'` and nothing else; `0006_runtime_core.sql:443` says the same in prose;
`wakes_outbox` is *"the uniform HELD projection"* (`0006:214`) with the identical guard
(`:570-581`); `packages/runtime/lib/drain.mjs:77-90` is its only writer; nothing in
`packages/runtime` reads `wakes_outbox`; and `packages/runtime/lib/reconciler.mjs:184-189` states in
a comment that a wake task can never leave `held`. **The belt would emit `bank.agent_due` and the
run would stop there forever** — one stranded row per cadence tick per client — and design §3.3's
Tier-D clause ("settles the task `failed`") raises CLR13 under the same matrix. Autodraft needed its
own kind (`0011:637-639`), insert arm (`:1231-1240`) and transition arms (`:1272-1276`) for exactly
this reason. **P-8 as v1 worded it ("watch the intent + task appear") passes while the lane never
runs — a prediction that cannot fail.**
**Fold (v2):** annexes-1 **D.0**; design §3.6; register **A11 RETRACTED**, **A12** annotated; census
**C11** re-cut from "untouched" to "conditional on G1"; **P-8′** re-cut so it can fail; new
prediction **P-15** (the no-consumer census, both directions); **gate G1** in Annex O.1 with both
mechanisms priced. **ESCALATED — owner item 1** (§6): the mechanism is an architecture decision under
TA-P5 and is shared with **F-A4 and F-A5**. *Fail-closed default the design proceeds on: nothing in
this train bakes an `agent_tasks.kind`; PR-2 does not open until G1 is ruled; PR-1a…PR-1d proceed.*

**B3 · Annex J was under-derived and its own counts disagreed four ways.**
*(BYTES lens, reported material, **re-graded BLOCKER** by the verifier: "a self-contradicting body
count in the very annex whose job is to gate a live-write-quiesce ceremony touching audited financial
writers is a wrong number in the blocker sense".)* `annexes-2:176` said "Eleven CoR'd live bodies …
three new tables" over its own **twelve**-row table; `design:117`/`:491` said eleven;
`annexes-2:19` said ten; `annexes-1:57-69` had nine; `P-11` said twelve. "Three new tables" named
**two**. Missing entirely: the **whole egress limb** — five live `0090` bodies (`:758`, `:818`,
`:890`, `:952`, `:1007-1058`) and four ACCESS EXCLUSIVE CHECK swaps (`:691-704`, `:730-735`), one of
them on `egress_dispatch_authorizations`, a table the witness lane writes on every dispatch — the
**9th `_approve_entry_core` body** that `design:455-457` and `annexes-2:294` promise, and the
**hold relation**: `set_bank_agency_hold` and the Tier-A rung `bank_agency_held` both read a
relation no PR creates (no columns, no RLS posture, no census row).
**Fold (v2):** **Annex J re-derived from the verb set and split per PR** (J.1 nine · J.2 ten + seven
DDL · J.3 five + four), **ONE number published — 24 CoR'd live bodies (23 if P-14 clears), 11 DDL
groups, three new tables** — quoted by design §3.1, register **A2** and **P-11′**;
`clara.bank_agency_holds` fully specified in Annex D (**A27**) as the third table; the egress limb
becomes **PR-1c** (**A13**); `_approve_entry_core` listed conditionally and **trued to the TENTH
generation** (**A32**, **P-14**).
*Verifier's strike, recorded:* the finding's sub-claim that the settle/allocate cores were "missing
from Annex J" was struck as an argument — they are absent from the design's scope text altogether,
and `_settle_from_bank_line_core` was explicitly excluded with a stated reason. **The requirement
lands via B1 regardless**; nothing was lost by the strike.

**B4 · `except_bank_line` cannot stay untouched — the proposal's `accepted` flip had no writer.**
*(BYTES lens, reported material, **re-graded BLOCKER**: "PR-1's DDL 4 creates a constraint no
specified writer can satisfy, and H.6's cell cannot go green as designed".)* Three statements
cannot all be true: `annexes-1:136-138` makes `except_bank_line` write
`bank_agent_proposals.accepted` (and `ck_bap_terminal`, `:130-132`, forces `decided_by`/`decided_at`
with it); `annexes-2:203` says the verb is *"never touched by this item, in any PR"*; and
`design:46-48` + `design:497` forbid any change to a live human verb, "no `except_bank_line`
widening, ever". The live verb (`packages/db/migrations/0040_wave_c_c_tieout.sql:3222-3294`, five
args) writes `bank_line_exceptions`, audit and an event and knows nothing of any proposal;
pre-filling its five arguments gives it no proposal id and no path to UPDATE another table.
**Fold (v2):** **`t_bank_agent_proposal_accept`**, an AFTER-INSERT trigger on
`clara.bank_line_exceptions` that resolves the OPEN proposal for that `line_id` and stamps
`decided_by` = the inserting actor — a **new trigger on a live table** (Annex J.2 **DDL 6**, ACCESS
EXCLUSIVE) and **declared judgement logic** (review law 1). `except_bank_line` stays byte-untouched
and H.6 gains a cell asserting exactly that. **`declined` and `stale` are DROPPED from the status
CHECK** for want of a writer (law 31), with the re-offer problem moved to a read-side eligibility
filter (Annex G property 5). Annex J.4's exclusion line now says what is true of the verb *and* names
the mechanism it was covering for. Register **A17**.

**B5 · TA-P8's granted promotion door had a schema, a human door, and no writer anywhere.**
*(RULINGS lens, CONFIRMED blocker.)* `annexes-1:120` admits `identifier_promotion` in the proposal
`kind` CHECK; `design:312-320` narrates Clara raising one; `design:384` builds the human door — and
**Annex A.1's twelve signatures contain no promotion sibling, Annex A.2's only new proposal writer is
`_agent_propose_line_exception_core` (singular, `:69`), and `bank_agent_receipts.act_kind`
(`:82-85`) enumerates ten values with no promotion act**. A builder following Annex A verbatim ships
a permanently inert door and a dead CHECK value — after the D1 window has baked both CHECKs.
**Fold (v2):** **`wake_propose_bank_identifier_promotion`** (renamed bank-scoped, conductor
arbitration 2026-08-24 — F-A7's wave-f-contract.md:315-320 owns the unscoped name) +
`_agent_propose_bank_identifier_promotion_core` + `act_kind='identifier_promotion_propose'` +
H.6's end-to-end cell (register **A15**); design §3.1's verb count goes to thirteen and §3.9
carries the mechanism.
**PARTIALLY ESCALATED — owner item 2 / OQ-8** (§6): the estate keys client-owned bank accounts into
`client_identifiers(kind='bank_account')` (`0007:227`, written at `0038:2743-2751`) and counterparties
by `registration_normalized` (`0009:832-841`); **there is no counterparty-bank-account identifier
relation**, so a promoted PAYER account has no home unless the payer is itself a client of the firm.
*Fail-closed default: build the propose half; scope the confirm half to client-payers; otherwise the
door reports `promotion_target_unavailable` and the proposal stays OPEN. Inventing an identity
relation beside constraint 12 is not a design-lane act.*
*Verifier's two corrections, recorded:* `bank_agent_proposals.receipt_id` needs *some* receipt, not a
matching-`act_kind` one, so the receipts CHECK was not itself the blocker; and "Annex M.13" does not
exist — the door row is in `design:§3.13`. Neither changes the finding.

## 3 · Materials — each folds into v2

**M1 · The drawer-2 repair cannot produce the outcome its own gating cell demands.** Moving the gap
universe to the account REGISTRY makes a registered-but-statement-less account fail — but a client
with **zero** registered accounts still has an EMPTY universe: repair 1's loop is
`from clara.bank_accounts ba where ba.client_id=p_client and (…)` (`0056:989-993`, the sibling's
shape adopted verbatim) and repair 2's reader INNER JOINs `bank_accounts` (`0040:4113`). Both counts
stay `'[]'` and `0056:1373-1375` returns `'pass'` — on exactly the shape H.7 (`annexes-2:98`),
`design:470` and Annex M's acceptance prerequisite name. The sibling answers `'tie'` on the same
input (`0056:962`), so "the way its sibling does it" does not rescue it. **Fold:** a **fourth arm**,
`no_registered_account`, in Annex F (**A18**); **R-F 1 restated as OWNERSHIP, not absence** — one
predicate, one owner, two call sites, with F-T4 as a sequencing obligation (O.4 item 6); **P-4′**
re-worded to name the population it expects to flip. **Boundary reading escalated as owner item 3.**

**M2 · The extraction breaks the estate's only instrument for the house lock order.** Five live
assertions read the rungs off the **public** prosrc — `x38-wave-c-b-match.test.mjs:1483-1487`,
`:1525` (an EXACT overload count), `:1542-1546`; `x38-wave-c-b-bank.test.mjs:2073`, `:2082`;
`x40-wave-c-c-tieout.test.mjs:3053-3072` — and `fnSource` concatenates same-named overloads only
(`a21-helpers.mjs:609-615`), so a thin delegate cannot mask the loss. v1's sixteen-census table had
no row for any of them, and Annex C claimed the order is preserved "by construction" with nothing
left to measure it. **Fold:** census **C17** enumerating the five sites; Annex C's disposition —
**MOVE each pin to the core, ADD the "the public body acquires NOTHING" pin** (the `0042` precedent
at `x38-match:1496-1538`), **never delete**; the overload count stays exact through PR-3's `/13`
drop; H.1's two new cells; Annex I's second-breakage-source paragraph; **P-16** (is the five-site set
complete?).

**M3 · The registration wall reads a surface that cannot exist for the case it governs.** Wall (2)
wanted the account number agreed by both witness channels "on a FILED statement", but
`bank_statements.bank_account_id` is `not null` with an FK (`0038:401`) — a statement for an
unregistered account never becomes a statement; it becomes a `bank_account_proposals` row whose
`header jsonb` carries the full corroborated header (`0038:849-856`, `:877-917`). As written the
rung is `not_evaluable` forever and TA-P1 C's registration grant is dead on arrival. **Fold:** the
wall re-anchors on the proposal's `header`; `wake_add_bank_account` takes **`p_proposal_id`**
(mirroring `add_bank_account`'s own seventh argument, `0038:2595-2603`, which already locks the
proposal and fills every blank from it); the invented `p_witness_pin` is gone; the wall is stated to
live in the **agent core only**, with the RED-first cell "a human `add_bank_account` with no proposal
still succeeds" (**A28**). *Verifier's note: the second attack (the human lane inheriting the wall)
is already architecturally guarded by the three-layer split — the ask to SAY SO is what was worth
taking.*

**M4 · A new SQL group role enters five role-keyed closed worlds unnamed, and no pool can assume
it.** *(Half 1 partially carried, half 2 unmitigated.)* `clara_wake_bank` appears in no role list:
`x38-wave-c-b-bank.test.mjs:2044`/`:2135`, `x40-wave-c-c-tieout.test.mjs:3200`,
`wave-b/wb-w-pack.test.mjs:269-275`, and above all **`rig-helpers.mjs:42-49`'s six-entry `ROLES`
map**, the single site every other census reads from — while C5/C6 declared those censuses "true
verbatim", the weakening direction for a newly minted role. And `pools.mjs:373` hardcodes
`checkout(getWritePool(), setupSql("clara_wake_interactive", false), …)`: **the only write-capable
pool SET ROLEs to a role that cannot execute a function granted only to `clara_wake_bank`**, so PR-2
had no way to call its own wrappers. **Fold:** censuses **C17/C18** and the C5/C6 re-wording to
"verbatim AND the role list extends" (**A30**); **the dedicated role is KEPT** and PR-2 gains
`clara_wake_bank_login` (member of `clara_wake_bank` alone — the two-login law N10's one-group shape,
`pools.mjs:50-58`), its own max-2 write pool, DSN and Fly secret, plus the ceremony grant in Annex
M.1 (**A29**); the `clara_wake_interactive` alternative (D34's path) is recorded as the rejected
option with its cost. New prediction **P-17**. *Verifier's correction folded: `wave-a-grants.test.mjs:24`
is a Wave-A grant matrix, not a bank census — it is NOT one of the closed worlds.*

**M5 · OQ-3 and OQ-4 re-impose a human gate the owner had just removed.** *(RULINGS lens,
CONFIRMED.)* v1 recommended "she unmatches her OWN matches; a human-authored match refuses
`bank_match_human_authored`" and "she voids only what **she** filed/completed", labelling the first
*"a wall that validates rather than a narrowed grant"*. It is not: both key on **who performed the
prior act**, not on any DB-owned safety fact — unlike the one wall-rider the owner actually kept
(the duplicate-payment check, which keys on amount/counterparty/date). `pr1-ledger.md:4-14` records
TA-P1 = C with exactly three riders and none of them a provenance gate, **and records that the owner
was told the "destroyed history" cost and accepted it** when rejecting the orchestrator's dissent;
`track-a-sitting-agenda.md:92`/`:95`/`:96` give the unqualified member answers, and A3-OQ-6's
**column A is verbatim the rejected option** ("只可拆自己配的…"). The contract is blunter still:
**"unmatching any pair, not only her own"** (`wave-f-contract.md` §F-A3). v1 built both as real
gating cells under the standing delegation with no escalation trigger.
**Fold: WIDENED to the ruling.** `bank_match_human_authored` and the "only what she filed" limit are
**gone**; their safety content becomes two rungs over DB-owned facts — **M14** (no later
reconciliation depends on the subject, pre-checking `0040:2452`) and **M15** (no live or pending
match on the statement, pre-checking `0038:3588`) — beside the existing **M8**. Design §1, §3.2,
§3.3; Annex P's OQ-3/OQ-4 now **CLOSED** with the ground written out; register **A24** rewritten;
H.3 gains the two cells that go RED against v1's gate; Annex Q restates the accepted cost honestly
rather than re-mitigating it. *A24's v1 disclosure ("none narrows the ruling in the DB") was a
disclosure, not a resolution — the codebase's own "owner rulings first" lesson asks for the ruling
FIRST, then the implementation.*

**M6 · The receipt table's uniqueness contradicts the clock it serves.**
`uq_bank_agent_receipts_subject unique (act_kind, subject_id)` (`annexes-1:101`) versus Annex B.2's
"a failing vector COMMITS a receipt" (`:167`), Annex D's `retry_later` — *"a line parked by M3/M4/M6
whose retry-after has passed"* (`:276`) — and H.3's "the vector is durable and readable from
`bank_agent_receipts`" for **every** rung outcome. A candidate refused on cycle 1 and re-offered on
cycle 2 violates the constraint at commit; and a Tier-B *match* refusal has no `bank_matches` row to
name as its `subject_id` at all. F-A2 solved the same problem with **two homes**
(`entry_post_receipts` for posts, `op_receipts` for refusals) — v1 conflated both outcomes into one
table with one cross-outcome key and no discriminator. Separately, **nothing anywhere backed
"whose retry-after has passed"** — no column, formula or store.
**Fold:** `outcome ('admitted'|'refused')`; `unique (op_key)` for replay; a **partial** unique index
`(act_kind, subject_id) where outcome='admitted'`; a refusal's `subject_id` named (the candidate
group's anchor LINE); **`retry_after`** as the parking carrier, read by the due predicate; the two
deferred receipt walls read the ADMITTED index. **ONE home, not two — with the reason written down**
(a post binds to an entry once; a judgement act legitimately recurs). Register **A26**; H.3's retry
cells; Annex D's `retry_later` row re-derived.

## 4 · Nits (folded without argument)

**N1 · Three cite drifts trued** — `'high_stakes', false` is at **`0038:8025`**, not `:8021` (which
is the `entry_id`/`posting_date` line): survey F9 and Annex G property 4 · the `agent_tasks.kind`
CHECK re-cut is at **`0011:637-639`**, not `:634-635`, which is
`ck_firm_limits_max_concurrent_sweeps` **on a different table**: census C11 · `mint_wake_credential`'s
`create function` is at **`0011:1156`**, not `:1155`: Annex J. *The finding's fourth item — that
C2/C3's disposition column names only three of the eight names leaving the cohorts — was **REFUTED**:
Annex I and the survey's retirement table already name all eight individually. C2/C3 are NOT widened.*
**N2 · Annex B.5's ground for B10/B11 restated.** The bank lane DOES set `coding_kind`
(`0044:1299` `customer_receipt`, `:1583` `supplier_payment`, `0038:3739` NULL); they are inert
because it is never `supplier_bill`/`sales_invoice` (`_assert_supplier_bill_shape_at` gates every
check behind the kind, `0016:3817`). The conclusion survives; the false reason would have argued away
B1's narrowing and H.4's two-settlement-shape-floors cell, the one cell law 31 says this item owes.
**N3 · The `origin` derivation gets its own register row.** Register **A25** names the exactly two
parameterised literals and scopes "byte-identical by construction" to the HUMAN caller's output.
**N4 · OQ-6 now names and distinguishes D34** in its own bullet.
**N5 · `_approve_entry_core`'s generation trued** (from F-A2's PR-1 design trues, not from this
gate): `0053`'s splice B makes the live tip the **eighth**, F-A2 ships the **ninth**, so F-A3's would
be the **tenth**. Register **A32**, prediction **P-14**.

## 5 · The width ruling and the refuted register

**Width.** The bytes lens: *too wide for one D1 window and far too wide for one PR* — the true PR-1
surface is ~19-20 live bodies plus 8-9 ACCESS EXCLUSIVE DDL objects, and `_approve_entry_core` plus
both allocate cores would be re-cut in the same window as nine mechanical body moves. The rulings
lens: *comparable to F-A2's owner-accepted precedent; not a severance candidate on size, but not
ready to open either.* **Adopted: the bytes lens's severance, on buildability grounds, not size** —
a pure-extraction PR whose claim is one checkable sentence (**PR-1a**), the judgement limb alone
(**PR-1b**), the independently-rollbackable and C6-blocked egress limb (**PR-1c**), and the clock
behind G1. **Three windowed PRs, ONE combined ceremony window at train-merge** (the F-A2 opener-night
lesson) — the file split buys the review isolation; a second night buys little and costs the
reconciler-herd and zombie-pooler hazards again. Full ruling: Annex O.3.
**Declined from the width opinion:** removing **OQ-6 (chat parity)** and **OQ-7 (the staff-advance
sibling)** from the train. Both are contract scope, both already ride PR-3 (so they cost the wide
windows nothing), and **D34 is directly on point** — the owner overruled a width-motivated chat
severance and ruled parity stays in the train.

**REFUTED at the bytes or the rulings, recorded so nobody re-raises them:**

1. **"Nothing in the design writes `bank_matches.origin='agent'`."** REFUTED — the three-layer
   architecture (`design:88-96`, `annexes-1:59`) has two ctx-builders over ONE shared delegate, which
   is definitionally a parameterised literal; §3.12, Annex J item 11 and H.7 all require the output.
   Residual folded as **nit N3** (an explicit register row).
2. **"C2/C3's disposition column is short by five names."** REFUTED — Annex I and the survey's
   retirement table name all eight individually, one section away. No widening.
3. **"The settle/allocate cores are missing from Annex J."** STRUCK as an argument — they are absent
   from the design's scope text entirely, and `_settle_from_bank_line_core` was explicitly excluded
   with a stated reason. **The requirement lands via B1.**
4. **"OQ-6 collides with D34."** REFUTED with a distinction — D34 fixed a *broken invariant on an
   already-granted authority* (an unmintable `interactive_client` credential left a chat-triggered
   post with no valid fallback); OQ-6 grants nothing that then fails, the design cites D34 four times
   in the section cluster immediately preceding OQ-6 and builds the open-question carrier "in the D34
   shape", and human bank matching keeps working unchanged. Residual folded as **nit N4**.
5. **The rulings lens's own count finding** was returned with `verdict: REFUTED` and a reason that
   self-corrects to CONFIRMED ("actually see reason detail: I CONFIRM the underlying claim").
   Recorded as an instrument anomaly, not a disposition: **the claim is B3's and is folded there.**
6. **`bank_agent_proposals.receipt_id` does not require a matching-`act_kind` receipt** (B5's
   overstatement), and **"Annex M.13" does not exist** (the door row is `design:§3.13`). Neither
   changes B5.

## 6 · Owner items (escalated, with the fail-closed default each proceeds on)

1. **The wake-execution mechanism (gate G1) — CROSS-ITEM: F-A3 · F-A4 · F-A5.** *(a)* a new
   `agent_tasks.kind` per authority scope, on the autodraft precedent — the kind CHECK swap plus D1
   recuts of both `_tf_agent_task_insert` and `_tf_agent_task_update`, per item that mints a kind; or
   *(b)* one consumer for the existing held-wake projection, plus a settlement path the current
   matrix does not express. **Default while unruled: nothing bakes a kind; PR-2 does not open;
   PR-1a…PR-1d proceed.** Already on the sitting's owner-facing list.
2. **The identifier-promotion target (OQ-8, from B5).** TA-P8's granted door has no relation for a
   non-client payer. Mint a counterparty-identifier relation (a new identity surface beside
   constraint 12), or keep promotion scoped to client-payers until the Wave-G reset?
   **Default: the narrow scope, `promotion_target_unavailable` otherwise.**
3. **The R-F 1 boundary reading (from M1).** Confirm that "drawer-1's P-3 stays F-T4's" is a claim
   about **ownership** (one predicate, two call sites), not about **absence** — on the absence
   reading the drawer-2 gate cannot be un-greened at all and TA-P14 clause 1 is unmet for this item's
   own acceptance client. **Default: the ownership reading; the arm ships in F-A3, F-T4 calls it.**
4. **G0, unchanged** — the digest re-sign for TA-P1's open register and TA-P7's invariant-(a)
   rewrite, plus the AGENTS.md home question and TA-P7's minuted wording.

*Standing, not escalated:* OQ-5's 60-day number returns to the owner ONCE, on measured data (R-A).

## 7 · What the rig replay must confirm (the gate's own obligations)

The full list is **Annex L (P-1…P-17)**. The ones this gate added or re-cut:

- **P-2′** — which of the three ctx hops in the settle limb is load-bearing (B1). *The old P-2 is
  retracted; the rig is not being asked to confirm it.*
- **P-4′** — the drawer-2 gate's before/after, naming the population arm 4 flips (M1).
- **P-8′** — a `bank.agent_due` event ends in a **completed run with a receipt row**, not in a row
  (B2). *Under today's bytes this prediction is FALSE; that is the point.*
- **P-11′** — the D1 surface is exactly Annex J's 24 bodies (23 if P-14 clears) and 11 DDL groups,
  split 9 / 10+7 / 5+4 (B3).
- **P-13** extended to the SETTLE path — `t_je_agent_post_receipt` fires for an agent settlement's
  `customer_receipt` entry, not only for a match adjustment (B1).
- **P-14** — F-A2's merged ninth `_approve_entry_core` accepts the bank ctx keys as-is, so no tenth
  body is needed (B3/N5).
- **P-15** — the no-consumer census for `agent_tasks(kind='wake')` and `wakes_outbox`, run at the rig
  in both directions (B2).
- **P-16** — the five prosrc/overload pins are the COMPLETE set that reads an extracted public body
  (M2).
- **P-17** — no live login role is a member of more than one group, so `clara_wake_bank_login` is the
  only way to reach `clara_wake_bank` (M4).
- **Unchanged and still owed:** the two spliced bodies at their live tips with a pre-quiesce sha
  tripwire (P-1, survey F7); the `pg_trigger.tgdeferrable` tier census, replayed not read (P-12).
