# F-A2 annexes 2 — battery and censuses

> Companion to `f-a2-agentic-posting-design.md` (**v4, 2026-08-20**). **Annex C** the battery ·
> **Annex D** the tier census, the wake-kind sweep, T3's mechanism, and the C-3 decision record.
> Sibling files: `f-a2-annexes-1-estate.md` (A, B) and `f-a2-annexes-3-record.md` (E-I).
>
> **Standing caveat.** Everything read from migration *source* is a **prediction about the live
> catalog**. Three classes defeat source reading: `base + dynamic splice` bodies · uppercase
> `pg_get_functiondef` round-trips (three `execute_rule_post` bodies, including the live one, are
> invisible to a case-sensitive grep) · and **trigger deferrability, which is a `pg_trigger` fact**.

---

## Annex C · The battery (design §6; contract-blind cells ▣)

**C.1 · The wrapper.** No credential → CLR03 ▣ · wake kind without the allowlist row → CLR03 ▣ ·
`'proactive'` never allowlisted ▣ · blank op key → CLR10 with the typed detail ▣ · blank
`rationale` ▣ · `p_model` missing a required key ▣ · null `books_version` ▣ · the wrapper carries
**no DML** (catalog cell) ▣ · replay returns the stored receipt byte-identically ▣ · a new
`taskId` re-attempts after a refusal.

**C.2 · Tier A.** A2/A4/A5/A6/A7 each forced ▣ · **A8: a human's draft refuses** ▣ · **A8's second
conjunct — an AGENT draft a human has REVISED (`revise_entry` sets `last_human_editor` and writes
only `duplicate_override`, so B6 cannot see it) refuses AT A8** ▣ *(C-1's cell; it must fail with
the conjunct removed)* · **the OQ-4 exits: the same revised draft posts through the HUMAN lane under
human identity** ▣, **and an agent RE-DERIVATION of it posts under agent identity with a rationale
citing the human suggestion it weighed** ▣ *(the forbidden middle — human numbers under agent
identity — is what A8 refuses)* · `closing_transfer` refuses ▣ · the row lock precedes every ladder
read (two concurrent posts of one entry, one wins).

**C.3 · Tier B — all fourteen rungs, each forced non-vacuously, each COMMITTING a receipt + an
`entry.post_refused` event, each appearing in the vector.**
**B1: an agent settlement post (`customer_receipt`, `supplier_payment`) refuses with the rung
named** ▣ *(BL-3's cell)* · B2 uncorroborated ▣ · **B2 POSITIVE — a corroborated document DOES
post** (the §6 gating cell; needs openers ①②⑥) ▣ · B2 on a `'{}'`-shaped or absent fact state
refuses (absence is the refusal) ▣ · B3 unbound anchor ▣ · **B4 ×4 by kind**, the sales and
generic formulas exercised against their own derivations (Annex I) ▣ · B5 `amount_exception` without
override ▣ · B6 `amount_override` and `duplicate_override` twins ▣ · B7 `model_read` tier ▣ ·
**B8 forced with `revision_token` rotation suppressed** ▣ · B9 ×3 scope kinds, receipt naming the
`question_id` ▣ · B9 negative: `origin='rule_proposal'` does not block (`0012:100`) ▣ ·
**B10/B11 supplier and sales leg-shape rungs** ▣ · **B12 the FA belt on a generic JV touching an
enrolled cost account — refuses `fa_belt_unregistered_movement` as a RECEIPT, not an abort** ▣ ·
B12 twin on `fa_cost_adjustment_deferred` ▣ · **B13 the advance belt on an enrolled staff-advance
account** ▣.
**B13's two axes reported separately** — a bad reversal mirror gives `advance_mirror_unregistered`,
an unregistered disbursement gives `advance_movement_unregistered` ▣ *(M-5; one token for both would
pass this cell, so it asserts the tokens DIFFER)* · **B14: a generic JV carrying an AR/AP control
leg refuses `generic_control_leg` as a RECEIPT**, and the same entry with the control leg removed
posts ▣ *(M-1; the negative twin proves the belt was the reason)* · **and a CODED-kind entry with a
control leg still posts**, which is the cell that proves `_subledger_on_approve` really does satisfy
the belt for those kinds rather than the claim being assumed ▣.
**The vector cells:** all rungs evaluated even after the first failure ▣ · **a rung whose inputs
are absent reports `not_evaluable`, never `pass`** ▣ *(the ARM-0 shape)* · an empty vector is the
only thing that posts ▣ · at 0/33 corroboration the vector still distinguishes documents ▣ ·
**a doctored vector carrying an UNKNOWN value does not admit** ▣ *(M-4's consumer-contract cell — it
fails against any consumer written to test for `'fail'`)* · **the vector is durable in BOTH homes:
a refusal's vector is readable from `op_receipts`, a post's from `entry_post_receipts`** ▣ (M-3).

**C.4 · Tier C — pairs only.** Each pair forced: `(CLR25, currency_unsupported)` and
**`(CLR25, corroboration_contradicted)` — the cell that proves the conversion names the RIGHT
wall, i.e. that a money-wall failure is never reported as a currency refusal** ▣ ·
`(CLR10, already_reversed)` ×2, distinguished from `0037:1778`'s bare CLR10 ▣ ·
`(CLR23, counterparty_landscape_moved)` ▣ · `(CLR23, counterparty_birth_race)` ▣ ·
`(CLR21, duplicate_bill)` ▣ · `(CLR21, duplicate_sales)` ▣ ·
`(CLR19, write_into_closed_period)` via the **non-deferred** `t_period_wall` ▣ ·
**a bare CLR23 from inside `_assert_supplier_bill_shape_at` does NOT convert — it propagates** ▣
*(the anti-wildcard cell)* · **an unlisted `(errcode, reason)` propagates as a task FAILURE** ▣ ·
the subtransaction rolls back the delegate's partial writes (no orphaned counterparty birth) ▣.

**C.5 · Tier D.** **The replayed census cell: `select tgname, tgdeferrable, tginitdeferred from
pg_trigger where tgrelid='clara.journal_entries'::regclass` matches Annex D's table exactly, in both
directions** ▣ · a Tier-D abort settles the task **`failed`** ▣ · **the commit error's
`(errcode, reason)` reaches `last_refusal`** ▣ · `entry_post_receipts` suppressed →
`t_je_agent_post_receipt` → CLR08 ▣ · a human approval needs no receipt (the trigger is inert) ▣
· ARM-0 declared unreachable-by-FK **with the reason recorded** ▣ · the balance / provenance /
immutable guards still fire on a doctored fixture ▣.

**C.6 · Identity and receipt.** The receipt carries actor + wake kind + model + rationale +
verdict + vector ▣ · **`on_behalf_of` is NULL on an autodraft post and NON-NULL on a chat post**
▣ *(proves the NULL is structural, not a bug)* · `maker_active_at_approval` is NULL on autodraft,
never `false` ▣ · **`approval_arm='agent_unattended'` and NO `self_approval_attestation` is
written** ▣ · the human lane's three CLR05 arms are byte-untouched ▣ · **an `is_year_end` and a
`tax_affecting` entry both post unattended** ▣ *(OQ-6's ruling made behaviour, so it gets a cell
rather than an assumption)* · `_audit` and `entry.posted` both carry obo and wake kind (the
`0037:2102`/`:2111` regression cell) ▣ · unique(entry_id) ▣ · append-only refuses
UPDATE/DELETE/TRUNCATE ▣.

**C.7 · N1 / T3.** Leg-shape refused at **draft** on the agent lane ▣ · the **human** lane's draft
is NOT refused ▣ · **T3: a human approval on a two-generation document behaves byte-identically
before and after the trigger recut** ▣ *(the zero-blast-radius cell)* · **an agent post's trigger and
its pinned caller judge the SAME generation — THE cell that must FAIL on a wrong `gate_verdicts`
accessor** ▣ *(C-2a: written so a nested-vs-flattened mistake, which yields NULL and therefore
today's unpinned behaviour, goes RED instead of silently passing)* · **the sales arm too** ▣ · the
1-arity delegates (`0016:3957-3961`, `0016:2115-2119`) are **byte-unmoved** ▣ · the direction-family
arm now fires on the chat lane ▣.

**C.7b · The receipt write contract (C-2b/c) — three per-tier zero-row cells, and they stay three.**
A successful post writes exactly one `entry_post_receipts` row ▣ · **a Tier-A raise leaves ZERO
rows** ▣ · **a Tier-B refusal leaves ZERO rows** ▣ · **a Tier-C conversion leaves ZERO rows** — the
insert rolls back with the delegate inside the subtransaction ▣ · the row is visible to the deferred
`t_je_agent_post_receipt` at COMMIT (the insert precedes commit and follows the delegate) ▣.

**C.8 · Breeding excision — the inverted twins, fixtured as AGENT posts.** *(A human fixture would
prove only the human case.)* After the 8th body, **an agent post** breeds no `rule_sightings` ▣, no
`coding_rules` ▣, no `open_questions` from the ≥3 loop ▣, no `kb_rule.proposed` ▣ · the
`0040:7115` `bank_rule_suggested` conjunct is gone ▣ · **three employee claims no longer breed a
`vendor_account` proposal** — the inversion of `x37-wave-c-a-subledger.test.mjs:1951` ▣ ·
**an ORDINARY approval on the same counterparty+account no longer moves the sighting counter** —
the inversion of `x42.prod-23`'s control half (`:296-307`), whose carve-out half `:335` already
records as vacuous ▣ *(M-10)* · **the two re-pointed zero-count heads: an agent post AND a human
approve both leave `rule_sightings` unchanged** ▣ *(absorbing `wb-s-seeding.test.mjs:202-203`, and
`:205` re-pointed off the `?? ""` fail-soft `fnSource` read — M-8)* · `_draft_entry_core` writes no
`rule_decisions` (OQ-2) ▣ · **the human approve path is otherwise byte-identical** (rig exact-diff
of receipt, audit row, event and entry) ▣ · **the eight CARRY markers of `0040:7148-7159` survive
and the three RETIRE markers are gone, at the stated counts** ▣ · a parked run against a frozen
toolface still reaches `clara.coding_lane` without `undefined_table` ▣.

**C.9 · The `posted` chain (four layers + six sites).** A posted settle writes
`sweep_run_items.outcome='posted'` — **not `skipped_lane`** ▣ *(the `0036:979-980` cell)* · the
CHECK admits it ▣ · **the `0011:2754-2762` finalize counts it** (drafted+skipped+refused+posted =
expected) ▣ · `entry_id` is recorded ▣ · **no synthetic `CLR29` refusal token is written for a
posted row** ▣ *(the false-data cell)* · `last_refusal` is cleared ▣ · the `p_entry`-exists
validation runs for `posted` as it does for `drafted` ▣ · **both `settle_autodraft_task`
overloads** accept it ▣ · **`entry_post_receipts` count == `sweep_run_items` posted count; a
disagreement fails the battery** ▣.

**C.10 · The pack.** The block appears, client-scoped, budget-capped ▣ · computed from
`status='approved' and reversed_by is null`, and **moves when an entry is reversed** ▣ · reads no
`rule_sightings`/`coding_rules` row ▣ · all five prior markers survive the fifth splice ▣ · the
anchor matched **exactly once** and the result **changed** ▣ · the wiki block still gates on
purpose + `pack_consumer` and v9 still sends `'v25'` ▣.

**C.11 · Law 8 / law 73.** `WB_AUTHORITY_FNS` covers the three new verbs, **and the test fails if
a new post-path verb is added without joining it** ▣ · no §3.2 wall references a wiki table or the
patterns block ▣ · `get_context_pack` is not on the roster ▣.

**C.12 · Grants and census.** `wake_post_entry` executable by `clara_wake_interactive` and nothing
else ▣ · `clara_agent_ro` holds nothing in the lane ▣ · the core is ungranted ▣ ·
`_approve_entry_core`'s zero-grant pin holds (`0015:3592-3596`) ▣ · the app-executable-DML census
against `journal_entries` did not grow ▣ · PUBLIC=0 and one-overload on every touched function ▣.

**C.13 · Chat parity and its fail-closed path (C-3's shape, R-1's narrowing).** A chat post lands
with `via_wake_kind='interactive'` ▣ *(the POST path keeps the plain kind)* · **`interactive_client`
is minted for the `wake_open_question` call and no other** ▣ *(R-1's cell — a fixture proving the
pinned credential is not held across the turn's other reads)* · **every Tier-B rung re-proven on the
chat lane** ▣ · a chat post of a `journal_entry` generic ▣ · **the new kind mints only with a
firm-congruent active client, and KEEPS `on_behalf_of`** ▣ · **`wake_open_question` succeeds from it
and still REFUSES an unpinned credential** ▣ *(the wall is the pin, not the kind name)* · **the
extend-only regression cells: a plain `interactive` credential still cannot carry a client** ▣,
**`list_unassigned_documents` still admits it on a `p_client => null` call** ▣ *(census finding 1)*,
and **`coding_lane` returns exactly what it returns today for a plain `interactive` credential** ▣
*(census finding 2 — the cell that would have caught the frozen-`chatTurn_v12` behaviour change)* ·
`chatTurn_v13` **and the new frozen `_vN` infra file** are new exports with registry repoints ▣.

**C.14 · The generic lane.** A generic JV skips `0016:4020-4034` **and still cannot post untied**
▣ · it is **not** caught by the direction-family arm (recorded; B4-generic is the wall) ▣ · a
generic JV with no document refuses at Tier B ▣ · **a generic JV on an enrolled FA or advance
account refuses at B12/B13 rather than aborting at commit** ▣ *(BL-1's cell)*.

**C.15 · Retirement.** The rosters are exact in both directions, **eleven names removed and the
gated cohort added** ▣ · **a rig replay proves the live `execute_rule_post` body is gone** (never
a grep; any cross-check grep is case-insensitive) ▣ · the two SOFT-failing helpers are deleted ▣ ·
`check-binding-post-control` and its wiring are gone ▣ · **`test-list-d-b2.txt`'s `#!cells-floor:`
is trued against the WHOLE sweep — `x42.prod-23` and `x42.prod-25` in `x42-producer.test.mjs` plus
`x42-producer-role.test.mjs`'s cells** ▣ · the KEEP tables still hold their rows ▣ ·
**`dbSeamCensus.test.ts:473` is trued** ▣.

**C.16 · End-to-end and corpus.** Witness pair → cited region → `verified` → **post succeeds**,
receipt read back ▣ · the negative twin ▣ · **the advisory runtime read says corroborated while
the DB refuses — the DB wins** ▣ · the 33-document corpus re-run publishing the FOUR numbers plus
per-document vectors ▣ · a live post on ROME PUBLIC ADVISORY then a BELCORT client, **constraint
12 held throughout**.

---

## Annex D · The tier census and the wake-kind sweep

### D.1 · How Tier membership is decided (D5)

**Deferrability is a `pg_trigger` fact.** PR-1 derives it on the rig and pins the result:

```sql
select tgname, tgdeferrable, tginitdeferred, pg_get_triggerdef(oid)
  from pg_trigger where tgrelid = 'clara.journal_entries'::regclass and not tgisinternal
  order by tgname;
```

The table below is the **source-read prediction** the replay must confirm or correct. It is
recorded as a prediction because two independent readers already got it wrong from source: v1
placed two non-deferred triggers in Tier D, and the review's corrected list was itself **short by
five** (P1).

| trigger | source | timing | tier (predicted) | disposition |
|---|---|---|---|---|
| `t_je_balance` | `0003:480-481` | **deferred** | D | structurally satisfied — the core builds balanced entries |
| `t_je_provenance` | `0003:486-487` | **deferred** | D | structurally satisfied — provenance bound at draft |
| `t_je_supplier_bill_shape` | `0009:533-537` | **deferred**, draft→approved | D + **B10 pre-check** | callable `_at` exists (`0016:3953`) |
| `t_je_sales_invoice_shape` | `0015:1033-1037` | **deferred**, draft→approved | D + **B11 pre-check** | callable `_at` exists (`0016:2113`) |
| `t_je_customer_receipt_shape` | `0037:674-678` | **deferred**, when approved | D | **unreachable — B1 refuses the kind** |
| `t_je_supplier_payment_shape` | `0037:680-684` | **deferred**, when approved | D | **unreachable — B1 refuses the kind** |
| `t_je_subledger_belt` | `0037:1447-1451` | **deferred**, when approved | D + **B14 shape refusal** | satisfied for the CODED kinds by `clara._subledger_on_approve(p_entry)` (`0037:1050-1274`), *"the hook, called from ALL FOUR approve paths"* (`0037:1032`), invoked at `0037:2028` in the same txn — **and a C.3 cell proves it rather than assuming it**; for a NULL `coding_kind` the hook materialises nothing, which is why B14 refuses the shape |
| `t_je_bank_match_reversal_belt` | `0038:3665-3669` | **deferred**, reversal only | D | **not reachable from draft→approved** (its WHEN is `new.reversed_by is not null and old.reversed_by is null`) |
| `t_je_bank_pending_orphan_belt` | `0038:7719-7724` | **deferred**, draft→approved | D | **unreachable in F-A2** — no `bank_matches` row is created on this path — and a **named forward obligation on F-A3**, which does create them (M-2) |
| `t_je_fa_movement_belt` | `0041:2741-2743` | **deferred**, when approved | D + **B12 pre-check** | **predicate inlined — PR-1 extracts it** |
| `t_je_adv_movement_belt` | `0043:3176-3178` | **deferred**, when approved | D + **B13 pre-check** | **predicate inlined — PR-1 extracts it** |
| `t_period_wall` | `0056:711-712` | **`before insert or update` — NOT deferred** | **C** | catchable; `(CLR19, write_into_closed_period)` |
| `t_je_immutable` | `0003:468-469` | **`before update or delete` — NOT deferred** | **C** | catchable; CLR08 propagates (never converted) |
| `t_je_stamp` · `t_je_no_truncate` · `t_snapshot_staleness` | `0003:458`, `0003:494`, `0057:1302` | plain | — | not refusal-bearing on this path |

**The extraction pattern for B12/B13** is the estate's own: `_tf_assert_supplier_bill_shape()`
(`0009:525-530`) is a two-line delegate onto a callable predicate. The advance belt's own header
(`0043:3149-3152`) states the doctrine — the test *"lives in exactly one body … so the belt, the
hook and the tie cannot drift into two readings of one window"* — which is why the post core
**calls** the predicate rather than re-implementing it. **A3:** both belts already raise `CLR40`
with `detail = jsonb_build_object('reason', …)`, so the pre-checks reuse their vocabulary:
`fa_belt_unregistered_movement` · `fa_cost_adjustment_deferred` · `fa_k_gl_balance_on_enrolled`
(`0041:2717-2736`) · `advance_movement_unregistered` · `advance_application_missing`
(`0043:3146-3172`).

### D.2 · The chat fail-closed path — the C-3 decision record

**v2 proposed weakening `ck_wake_credentials_client_0011` (`0011:625-628`) so an `interactive`
credential could carry a client. v3 REVERSES that.** The delta review ran the reader census v2 only
*promised*, and the result kills the weakening. Recorded here as the decision record, because a
later reader will otherwise re-propose it.

| # | census finding | bytes |
|---|---|---|
| 1 | **`list_unassigned_documents` REGRESSES.** Its admission runs through `clara._agent_read_admitted`, which refuses **any** client-pinned credential on a `p_client => null` call: `if w.client_id is not null and (p_client is null or p_client is distinct from w.client_id) then return false;` | `0011:3934-3936` |
| 2 | **`coding_lane` widens SILENTLY — the decisive one.** It is the reader with **no is-not-null guard**: `if p_client is null or w.client_id is distinct from p_client then return; end if;`. For a client-less interactive credential `NULL is distinct from p_client` is TRUE, so chat gets **empty** today; a pinned credential would suddenly return rows. **Frozen `chatTurn_v12`'s answers change with no byte change** — a frozen-workflow behaviour change nothing would catch. | `0011:1570` |
| 3 | **Eight further readers flip** on the same `w.client_id is not null` shape. | census run |
| 4 | **It contradicts a deliberate, documented decision.** A **PIN BLOCKER** comment: *"interactive credentials deliberately carry client_id=NULL, so the required equality against a chat session client cannot be established in DB … the legacy interactive branch refuses closed until the interface carries a verifiable session-client authority."* | `0011:1980-1983` |
| 5 | **And it still needs the fourth change** (the frozen runtime minting, below), so it buys nothing. | — |

**The adopted shape: a NEW wake kind `interactive_client`**, joining
`ck_wake_credentials_kind_0011` (`0011:623-624`) — an **extension**, not a weakening. Its mint
requires a firm-congruent active client exactly as `autodraft` does, while **keeping
`on_behalf_of`** (which `autodraft` forbids — Annex A finding 7). It **satisfies the PIN BLOCKER's
own stated exit condition** — the mint *is* the verifiable session-client authority — rather than
deleting the blocker.

**R-1, NARROW — the scope that makes findings 1-3 genuinely not fire.** **`interactive_client` is
minted for exactly ONE call path: the fail-closed `wake_open_question` call.** Every other chat
scoped read and write — including the post itself — continues to use plain `interactive` with its
NULL-client guarantee, so `_agent_read_admitted`, `coding_lane` and the eight further readers are
never handed a pinned credential and findings 1-3 do not arise at all. **If chat ever goes
client-scoped throughout, that is a future decision which must re-open this table and accept
findings 1-3 as deliberate behaviour changes** — it is not something the present design licenses.
**Honest footnote:** the mint verifies the client is **firm-congruent and active**, not that this
particular human is authorised for that particular client — which matches the estate's existing
firm-scoped authority model and opens nothing new.

**Its four roster/census surfaces**, all extend-only: the allowlist counts at `0011:4170-4175`
*(a historical tail that runs only at 0011's apply — but its live test mirrors must be trued)* ·
`0078:255-259`'s interactive-only η census · the role map `0011:4293-4294` · `assert_wake_allowed`'s
rows. **`wake_open_question` still re-keys onto the client pin, not the kind name** (law 27(3)), so
it admits `autodraft` and `interactive_client` alike and still refuses anything unpinned.

**The fourth change, which lands in PR-2 and not PR-1.** `mintWakeCredential` (`pools.mjs:304-312`)
and `mintWakeCredentialObo` (`:326-334`) **hardcode `"interactive"` and take no client parameter**;
both are declared in the `Pools` interface at `chatTurn.v10.infra.ts:32-33` and called at `:58`,
`:66` — and that file carries **`// @frozen` on line 1**. So chat parity requires a **new frozen
`_vN` of the infra file**, and per R-1 that file mints the pinned kind **only for the
`wake_open_question` path**.

### D.2b · T3's mechanism, and why BL-5's implied remedy is declined (design §3.4)

BL-5 correctly locates the NULL pin in the **1-arity delegate** (`0016:3957-3961`; sales at
`0016:2115-2119`) and correctly observes that recutting it reaches the draft floor, human approve
and the D-P4 probe — the three callers its own header names (`0016:3954-3955`). **That is the
expensive fix and it is declined.** Recut instead the two **trigger functions**
(`_tf_assert_supplier_bill_shape`, `0009:525-530`, and its sales twin), resolving the pin from the
entry's own post receipt:

```sql
v_pin := (select (gate_verdicts->>'extraction_id')::uuid
            from clara.entry_post_receipts where entry_id = new.id);
perform clara._assert_supplier_bill_shape_at(new.id, v_pin);   -- NULL ⇒ today's exact behaviour
```

**A human approval writes no receipt, so `v_pin` is NULL, so the delegate's null-pin behaviour is
reproduced byte-for-byte.** The human-lane blast radius is **zero by construction**, not by
argument; the 1-arity delegates are byte-untouched and leave the D1 list; the divergence closes on
**both** arms. **T1 (leave unpinned) is the named fallback** if PR-0 rejects the receipt-keyed pin;
**T2 (a txn-local GUC) stays refused** as a bypass-shaped mechanism on a wall. **The three things a
reviewer should attack:** receipt-insert versus deferred-trigger firing order · revised-entry
re-approval · the `gate_verdicts` key's existence in the receipt schema at the moment the trigger
reads it.

### D.3 · OQ-4's re-derivation trigger, in mechanism (design §3.3.3)

**The ruling.** A8 stands — unattended posting is the agent's own **untouched** derivation only. The
**forbidden middle** is pass-through of human numbers under agent identity with nobody's approval on
record. Two exits are open.

**Exit 1 — the human posts it, under human identity.** Their own chat or review-queue approval on
the ordinary `approve_entry` path, byte-untouched by this design. The right exit whenever the human
is confident in their own edit, and the fast one.

**Exit 2 — the agent re-derives and posts her own conclusion, under agent identity.** The human's
edit is lawful **context input** (law 73), not an instruction; her rationale cites the suggestion she
weighed and the numbers are hers.

**The trigger.** A human revision is observable: `revise_entry` sets `last_human_editor`, rotates the
token and emits `entry.revised` (`0016:4909-4913`, `:4937`), so the coding lane re-admits that
document for a fresh agent read.

**The constraint that shapes exit 2, and it is load-bearing.** She cannot post into the human's
draft (A8), **and she cannot draft a competing one either**: the **double-coding wall** refuses a
second coded entry against the same filing (`0016:4011-4017`, with the unique-index catch at
`:4093-4096`, `CLR21 double_coded`). So **exit 2 becomes available only once the human's draft is
withdrawn**. That is the honest shape rather than a limitation to route around — while a human's
numbers are live on a document, the only person who can approve them is a human.

**The branches.** On re-read the agent **agrees** with her original derivation → after the
withdrawal she drafts and posts her own entry, rationale citing the human's suggestion. She
**disagrees** → a typed open question naming the divergence, or the document simply stays in the
human lane. Cells: C.2 carries both exits, and the forbidden middle is what A8's cell refuses.

### D.4 · The context-pack patterns block, in mechanism (design §3.6)

**The splice.** `clara.get_context_pack(uuid,text)` is base (`0016:4262-4350`) + four dynamic
splices; F-A2 adds a **fifth**, contributing one client-scoped, budget-capped block:

```
'approved_coding_patterns' →  (counterparty_id, coding_kind, account_code, side,
                               n, first_seen, last_seen)
   over journal_entries ⋈ journal_lines
   where client_id = … and status = 'approved' and reversed_by is null
```

**Recomputed on read, not accrued — and that is the design decision, not an implementation
detail.** This is precisely the aggregate `clara.rule_sightings` accrued (`0011:843-862`, `side`
added at `0016:57-62`) and precisely what the ≥3-distinct-entry threshold bred rules from
(`0037:2067-2099`). Recomputing it therefore **removes a write from the approve core** — the
sighting insert dies with the breeding block rather than being preserved as a vestigial accrual —
and it **cannot drift from the books**, because there is no second copy to drift. Two consequences
worth stating: the block **moves when an entry is reversed** (C.10 asserts it), and the historical
`rule_sightings` / `coding_rules` rows, though KEPT as data, **are not read by the pack** — they are
a frozen corpus superseded by the recomputed aggregate, and reading both would mean learning twice
from the same events.

**Splice discipline, non-negotiable.** The tail at `0036:1826-1850` asserts that **every** post-0016
surgery marker survived — `sst_registration_watch`, `'wiki'`, the two `bound_scope_*` strips,
`stale_at`, `has_stale_sources`, plus an exact-count check on `'msic'`. F-A2's splice **adds its own
marker to that list and re-asserts the prior five**, under the estate's anchoring rule: **exactly
one match, and a changed result** (`0018:452-461`, `0019:1019-1032`). A splice that matched twice, or
that matched and changed nothing, is the failure mode the anchor discipline exists to catch.

**The law-73 line, restated where the mechanism lives.** `get_context_pack` reads wiki
(`0017:5017-5060`) and now reads approved history; **neither may ever be read by a gate, bound or
floor.** `WB_AUTHORITY_FNS` (`wb-helpers.mjs:212-226`) is the mechanism that proves it, F-A2 extends
it with the three new post-path verbs, and `get_context_pack` stays off it. C.10 and C.11 carry the
cells.

### D.5 · Every wake-kind-keyed wall, with a disposition (replaces v1's D10 "law")

| site | what it keys on | disposition |
|---|---|---|
| `0046:2687-2696` | `not p_is_human and p_wake_kind='autodraft'` — the direction-family arm | **RE-CUT to `not p_is_human`** (the narrow verified claim; its postcheck marker is `0046:3193`) |
| `0011:1178-1186` | `mint_wake_credential`'s autodraft/legacy arms | **EXTEND** — a new `interactive_client` arm requiring a firm-congruent active client; the autodraft arm's "no `on_behalf_of`" clause untouched (§D.2) |
| `0011:1990-1995` | `wake_open_question`'s kind arm | **RE-KEY onto the client pin**, admitting `autodraft` and `interactive_client` (§D.2) |
| `0011:625-628` | `ck_wake_credentials_client_0011`, the durable client-binding CHECK | **STANDS — untouched.** The **KIND** CHECK (`0011:623-624`) is extended instead (§D.2) |
| `0004:673-677` | `wake_record_notification` consumes a **`proactive`** credential single-use | **STANDS** — single-use is the proactive kind's defining property, unrelated to posting |
| `0046:2676-2686` | the counterparty-kind arm, `not p_is_human` alone | **STANDS** — already lane-correct |
| `0011:4170-4175` | a migration tail asserting exactly 6 autodraft allowlist rows | **STANDS** — a historical tail that runs only at 0011's apply; **but any live test mirroring the count must be trued when `wake_post_entry` joins** |
| `0078:255-259` | a census asserting the η wrappers are interactive-only | **STANDS** — its function-name list does not include `wake_post_entry` |
