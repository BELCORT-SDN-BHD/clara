# Billing — the design

> **The design doc of record for the billing model 裁-42 ruled** (2026-08-30). Companion survey:
> [`billing-survey.md`](billing-survey.md) — every estate claim below resolves there. Annexes
> (DDL sketch · the evaluator's rung table · the Stripe object map · the acceptance battery · the
> PR ladder · D1): [`billing-annexes.md`](billing-annexes.md). Gate:
> [`billing-gate-record.md`](billing-gate-record.md). Design input:
> [`billing-model-brief-2026-08-30.md`](billing-model-brief-2026-08-30.md) (裁-42 verbatim).
>
> **Binds under:** law **1** (the DB owns every authoritative number — *a billing figure is an
> authoritative number*), **6** (reverse-not-delete), **16** (effective-dated policy tables),
> **18** (multi-currency OUT), **22** (a visible record must not lie), **76/78/81** (meter never
> cap; no capability gating by tier; one ledger). PRD **§6 invariants 1, 6, 8, 10**.
>
> **Review posture.** The capacity walls (§3.4, §3.5), the lifecycle doors (§3.3) and the
> evaluator (§3.6) are all **judgement logic** — each decides whether an act is allowed or what
> a number is — so every PR here takes an independent review pass before merge (review law 1),
> on top of the uniform ADR-061 ladder. **Nothing in this set charges anyone**: 裁-28's amounts
> are open, and §3.2 makes that structural rather than a promise.

## 1 · The ruled shape (fixed, not designable)

裁-42's own ten sections, kept in his numbering because renumbering them would quietly renumber
what he decided. Each row names where §3 implements it.

| 裁-42 | the rule | §3 |
|---|---|---|
| ① | one base subscription per firm, including N paid seats, N Active Client slots and an AI allowance; everything above an included quantity is **its own invoice line**, never folded into the base | 3.1, 3.7 |
| ② | **owner/admin/bookkeeper are paid; viewer and payments-only are free.** A seat is **capacity, not a person** | 3.4 |
| ③ | each paid seat **adds to ONE firm-wide shared pool**; no seat carries a private quota; nobody is throttled because a colleague was busy | 3.6 R7 |
| ④ | Active Client slots beyond the base are billed; a slot is **capacity, not identity** — unbound to any particular client | 3.5 |
| ⑤ | archived clients carry a lower **retention** fee; archiving **frees the slot**; the **archive month keeps the active fee**, retention starts **next cycle**; reactivation **needs a free slot**; **never both fees at once** | 3.3, 3.6 R6 |
| ⑥ | **scheduled-for-deletion keeps the retention fee until PURGED** — billing stops when the *holding* stops | 3.3, 3.6 R6 |
| ⑦ | **overage = usage − allowance, floored at 0**; the allowance **expires monthly** (no rollover, no transfer, no refund); **the service NEVER auto-stops** | 3.6 R9, 3.12 |
| ⑧ | mid-cycle additions are **prorated — and their allowance with them**; removals take effect **next cycle**; the system **never auto-archives or auto-deletes to cut capacity** | 3.5, 3.6, 3.12 |
| ⑨ | the invoice shows **every** line — base · seats · extra active clients · archived clients · allowance · usage · overage · tax · total — reconstructable by a firm owner unaided | 3.7 |
| ⑩ | **draft clients are FREE and slot-less — and capped**: no bulk documents, no AI, no posting | 3.9 |
| **LAW** | **every price, included quantity, allowance and ratio is CONFIGURABLE. Nothing hard-coded.** The numbers are DATA and change without a migration | 3.1 |

**The acceptance criterion the configurability law implies, stated as a test rather than an
aspiration:** a reviewer must be able to point at the **column** where each configurable value
lives. §3.1's table is that pointing; Annex D's cell **T.1** proves it mechanically by
asserting the column set, so a value that quietly migrates into a function body reddens.

## 2 · The estate findings that bind §3 (survey §B, in full)

1. **`payments_only` does not exist** and `role_rank` returns NULL outside four labels — a new
   label is an RBAC change with a live hazard, not a billing one. · 2. **裁-42⑤/⑥'s transitions
   have no implementation at all**: the live graph is two edges out of `onboarding`, and `active`
   / `archived` are dead ends. · 3. **裁-42⑩'s three draft caps already stand**, measured, on a
   `status='active'` predicate. · 4. **An allowance may never be an enforcement input** — P4
   closed the seam in words and `0105` is the scar. · 5. **`llm_price_table` is the vendor's USD
   COST**, not Clara's MYR price, and no MYR rate relation exists anywhere. · 6. **The capacity
   walls recut live bodies** → PR-1 carries a D1 window. · 7. **Nothing to adapt, nothing to
   retire** — the catalog scan is closed-world and empty. · 8. **The tier tranche is unbuilt**,
   so nothing may key on `tier_code`. · 9. **`is_operator` is measured unset on every firm**, so
   an exemption keyed on it is inert until 裁-43's ceremony runs. · 10. **"Zero" and "not yet
   ruled" must not be the same value.** · 11. **Role gating is DB-only**; no TS mirror.

## 3 · The design

### 3.1 · Two configuration relations, both PLATFORM data — and why they are two

**`clara.billing_plans`** — the configuration relation the law demands. Effective-dated on the
`llm_price_table` idiom in full (survey §A.8): PK `(plan_code, effective_from)`, an
`effective_to >= effective_from` CHECK, a partial unique on `(plan_code) where effective_to is
null`, a statement-level no-overlap trigger, and a `BEFORE TRUNCATE` guard. **A price change is
a new row, never an UPDATE that rewrites history.** Every one of 裁-42's configurables is a
column, and **`0` is a legal value for every amount**:

| column | 裁-42 | note |
|---|---|---|
| `base_price_cents` | ① | |
| `included_paid_seats` | ① ② | |
| `included_active_client_slots` | ① ④ | |
| `base_ai_allowance_cents` | ① | the base subscription's own share of the pool |
| `per_seat_price_cents` | ② | |
| `per_seat_ai_allowance_cents` | ③ | **the adder to the ONE shared pool** — never a private quota |
| `per_active_client_slot_price_cents` | ④ | |
| `archived_client_retention_price_cents` | ⑤ ⑥ | per client per cycle |
| `overage_multiplier_bp` | ⑦ | the ninth configurable, in basis points; `10000` = bill overage at list, `0` = overage free. A **ratio**, so the law puts it in a column |
| `paid_roles text[]` | ② | which roles consume a seat. Default `{owner,admin,bookkeeper}`, CHECKed element-wise against the live role labels. **Data, not a function body** — see §3.4 |
| `currency` | — | `not null default 'MYR' check (currency = 'MYR')` — a deliberate, named, single-value floor, the same shape `llm_price_table` uses for USD (`0110:497`) |
| `amounts_ruled boolean` | — | §3.2 |
| `is_exempt boolean` | — | §3.2 / gate OQ-4 |

**`clara.billing_usage_rates`** — Clara's **own MYR list price** for model usage, effective-dated
on the identical idiom, keyed `(engine_id, effective_from)`, columns
`input_price_cents_per_million_tokens` / `output_price_cents_per_million_tokens`,
`currency = 'MYR'`.

**Why this is a second relation and not a reuse of `llm_price_table`** (Annex A, D2 — the
sharpest decision in this set). `llm_price_table` is USD-only **by CHECK** and its own header
calls it vendor cost; MYR conversion is a **named non-goal** under law 18, and no FX relation
exists anywhere in the estate (survey §A.5, §A.8). Reusing it would do two wrong things at once:
**bill the firm at Clara's cost** — putting every margin decision outside the database, which is
the configurability law's exact failure mode — and **require an FX rate law 18 forecloses**. So:
`llm_price_table` stays the **cost floor** input to 裁-28's amounts sitting and is read by
nothing in this design; `billing_usage_rates` is what an invoice is computed from. *Its
`engine_id` must use the ledger's own namespacing (`llm-openai:<model>:<snapshot>`, survey §A.5)
— a rate keyed on a bare model name silently fails to match and the call rolls up **unpriced**,
which the invoice publishes rather than hides.*

**Posture for both:** PLATFORM data — **no `firm_id` column**, so a firm-scoped policy is not
even expressible. FORCE RLS, **exactly one policy (`clara_fn_owner` ALL)**, **grants to
`clara_fn_owner` only**, reads through a SECURITY DEFINER function. This is `llm_price_table`'s
measured posture verbatim. **Never a `security_invoker` view or function over them** — the
base-table GRANT check precedes RLS, so `clara_authenticated` (the only role a human session
holds) raises `42501` and the read path is dead; F-A9's gate 1 paid for this lesson once
(`metering-gate-record.md`, GB-3).

### 3.2 · "Unruled" is a FLAG, never a zero — how 裁-42's *"nothing charges"* becomes structural

Two rules point in opposite directions unless a flag separates them. The configurability law
requires `0` to be a **legal configured price**. P4's rendering law requires that a
not-yet-ruled amount render as *"one named placeholder … never a number, and never RM0 or an
em-dash, both of which read as 'free'"* (`p4-design-2026-08-27.md` §4 F, §9). A zero that means
"the owner chose free" and a zero that means "裁-28 has not sat" are **different facts**, and
one column holding both is the "one string, three meanings" defect this estate keeps catching.

- **`billing_plans.amounts_ruled boolean not null default false`.** While false, the plan's
  numbers are placeholders. The **evaluator still computes** — so the machinery is provable, and
  a dry-run invoice can be inspected long before a price exists — but **`issue_invoice` REFUSES**
  (`CLR10`, `reason='amounts_not_ruled'`) and the read surface renders the placeholder, never the
  numeral. This is 裁-42's *"until the amounts land, nothing charges"* as a **wall**, not a
  discipline, and it is what lets PR-1..PR-3 merge against an unpriced configuration exactly as
  the brief §4 says they may.
- **`billing_plans.is_exempt boolean not null default false`** — an exempt firm's cycle produces
  **no invoice at all**, which is a different fact from an invoice reading zero. BELCORT sits on
  an exempt plan (gate OQ-4). **The default is `false` on the plan but the exemption's
  fail-closed side is "do not charge"**: a firm with no `firm_subscriptions` row is not billed
  and is not silently defaulted onto a priced plan.

### 3.3 · The client lifecycle — the state machine, and its four new doors

**The vocabulary.** 裁-42 names five states; three exist. The design **keeps the live spelling**:

- **`onboarding` IS 裁-42's "draft".** It is not renamed. Every granted client-minting surface
  already births it (`0017:2505`, `:2542`), the three caps already key on it, and the word is
  written into two live doors, a CHECK, a constraint name and nine test files. Minting a
  synonymous `draft` would put two spellings on one state — the defect, not the fix. **The UI
  may display "Draft"**; the database says `onboarding`. *(Annex A, D4; the owner used his own
  word and is owed the sentence — gate OQ-3.)*
- **`scheduled_for_deletion` and `purged` are NEW values**, added by extending
  `clients_status_check_0017` (drop-and-add under a **named** successor constraint, never a
  system-generated name — `0017:5249` asserts the current one *by name*, survey §C).

**The graph, after this design.** Live edges are marked ▲; everything else is new:

```
onboarding ──▲commit_client_onboarding──> active
onboarding ──▲cancel_client_onboarding──> archived
active     ────archive_client──────────> archived          (frees the slot immediately)
archived   ────reactivate_client───────> active            (REFUSES without a free slot)
archived   ────schedule_client_deletion─> scheduled_for_deletion
scheduled_for_deletion ──purge_client──> purged            (DESIGNED HERE, BUILT LATER)
```

Every door: `_human_ctx(role_rank('admin'))` floor, `_reserve_op` idempotency on `p_op_key`,
`_audit`, `_append_event`, `_finish_op` — the estate's standard audited-door shape. **No door
is reachable by the agent**: reducing capacity or destroying data is a human act (裁-42⑧,
§3.10).

**`purge_client` is designed now and built later, deliberately.** Reverse-not-delete is
structural (law 6 / PRD invariant 8) — *"there is no delete verb anywhere in the schema"* — so a
purge is the one deliberate exception in the whole estate and it needs its own design pass, its
own owner sentence and its own D1 window. Designing the **state** now costs nothing and buys
everything: `scheduled_for_deletion` is billable-until-purged (裁-42⑥), so the meter is correct
from day one and the door that stops it can arrive later without a data migration. **Until it
exists, `purged` is unreachable** — which is honest: nothing has been purged, so nothing is in
that state. *(Annex A, D6.)*

**`clara.client_lifecycle_events`** — append-only, narrow, `(id, firm_id, client_id,
from_status, to_status, occurred_at, actor, reason, op_key)`, written **only** by the doors
above plus the two live ones. The evaluator reads **this**, never `clients.status`, because
裁-42⑤'s rules are about *when* a transition happened and a status column only carries the
present. **Not derived from the event spine** (`clara.events`): the spine is open-world — any
lane may append — and a money number must read a closed one. Both are written; only the narrow
one is authoritative. *(Annex A, D5.)*

### 3.4 · Seats as CAPACITY — the wall, and the rank it must NOT read

`firm_subscriptions.paid_seat_capacity` is a **count**, not a per-user flag. The wall:

> the number of `firm_memberships` rows with `status='active'` whose `role` is in the effective
> plan's `paid_roles` must be **≤ `paid_seat_capacity`**.

It is enforced **at role assignment and at membership creation** — `_add_member_core`
(`0141:294`), `invite_member` (`0141:348`), `accept_invite` (`0141:407`), and `set_member_role`
(`0005:706`) — refusing `CLR10` with `reason='paid_seat_capacity_exceeded'` and a receipt naming
the count and the capacity, so the firm can act on it. **A move from a free role to a paid one is
a capacity question**, exactly as 裁-42② says; a move the other way always succeeds.

**THE WALL THIS DESIGN NAMES LOUDEST: the paid/free boundary must NOT be `role_rank`.**
`clara.role_rank(role) >= clara.role_rank('bookkeeper')` selects exactly `{bookkeeper, admin,
owner}` today, so it *looks* equivalent to `paid_roles` and it is one line shorter. It is wrong,
and the reason is review law 3 applied to a rank: **`role_rank` is a PERMISSION ladder, not a
price list.** The day a role is inserted into the ladder — the very `payments_only` question
OQ-2 carries — its **price changes silently**, in a function body no reviewer is reading for
money. `paid_roles` is a column, in the effective plan row, and the law that put it there is
裁-42's own. *(Annex A, D3.)*

**One membership per user, estate-wide** (`uq_membership_active_user`, `0002:221-222`), so the seat
count is an unambiguous per-firm count with no cross-firm double-counting to reason about.

### 3.5 · Active-client slots as CAPACITY, and what "prorated" resolves to

`firm_subscriptions.active_client_capacity` is likewise a count. The wall — refusing
`CLR10 / reason='active_client_capacity_exceeded'` — sits on the two doors that INCREASE the
active count: `commit_client_onboarding` (`0017:2777-2841`) and the new `reactivate_client`
(裁-42⑤: *"reactivation needs a free slot"*). `archive_client` **frees the slot immediately**
and is never refused for capacity.

**Capacities are stored as TOTALS, not as extras.** The invoice bills
`max(0, capacity − included_at_that_date)`. Storing the extra instead would make the wall read a
*sum across two relations resolved by date* — so the number a refusal quotes could differ from
the number the firm bought the day a plan's included count moved. One relation, one number, one
wall. *(Annex A, D7.)*

**`firm_subscriptions` is itself effective-dated and append-only**, one row per
`(firm_id, effective_from)` with the same two walls (partial unique on the open row per firm, and
a no-overlap trigger). This is what makes 裁-42⑧ fall out rather than be implemented: an
**addition** writes a row `effective_from = today`; a **removal** writes a row
`effective_from = the next cycle's start`. The evaluator prorates by reading every row that
overlaps the cycle. No separate change-log relation, no "pending change" state machine.
*(Annex A, D8.)*

**The cycle.** `cycle_anchor_day smallint not null check (between 1 and 28)`. A cycle is
`[anchor in month M, anchor in month M+1)`. The 28 ceiling is deliberate and named: days 29-31
would need a clamp rule for February, and a clamp is a rule a firm owner cannot see on the
invoice — which 裁-42⑨ forbids. *(Annex A, D9.)*

### 3.6 · The monthly rollup — `clara.evaluate_firm_billing_v1`

**A billing figure is an authoritative number** (law 1 / PRD §6 invariant 1), so the rollup is a
**versioned deterministic evaluator** and joins the freeze family exactly as survey §A.9
describes: `SECURITY DEFINER` owned by `clara_fn_owner`, a `clara.evaluator_versions` row
**with `firm_id = NULL`** (platform-scoped — measured expressible, and all 8 existing rows are
already that shape) in the **same migration file**, plus a `frozen-evaluators.json` entry. A
later behavioural change ships as `_v2`; a `create or replace` of a frozen evaluator is refused
by the lint outright.

```
clara.evaluate_firm_billing_v1(p_firm uuid, p_cycle_start date) returns table(...)
```

**Determinism, three walls, each earned by a defect this estate already paid for:**

1. **The cycle is a PARAMETER, never a clock read.** No `now()`, no `current_date`, no
   `clock_timestamp()` anywhere in the body — both because a money number that moves with the
   caller's clock is not deterministic, and because `S5_25_BARE_TOKEN_ROSTER`
   (`x42-s5-helpers.mjs:146-177`) is an **exact set equality in both directions** that would
   redden on the weekly frontier leg (survey §C).
2. **Every date comparison is explicitly UTC** — `(created_at at time zone 'utc')::date`, the
   idiom `llm_usage_events_priced` already uses (`0110:676-678`). F-A9's gate 1 caught a spend
   join whose money number moved with the caller's session `TimeZone` GUC; this evaluator does
   not repeat it.
3. **Rounding happens at the LINE, never at the total.** Money is `bigint` cents (PRD invariant
   6). Each line rounds once; the total is the **sum of the rounded lines**. This is what makes
   裁-42⑨ true — *a firm owner can reconstruct the bill* — because the invoice reconciles by
   addition, which is the only arithmetic a reader will actually perform.

**Inputs, all DB-owned:** the `billing_plans` row(s) effective across the cycle · every
`firm_subscriptions` row overlapping it · every `client_lifecycle_events` row up to cycle end ·
`llm_usage_events` where `scope='firm' and firm_id = p_firm` in the cycle, **grouped by
`engine_id`** (`get_llm_usage_summary` groups by `(scope, call_kind)` and cannot serve a
per-engine rate — survey §A.5) · the `billing_usage_rates` rows effective at each usage date.

**The eleven rungs** are Annex B's table in full. The shape, in one paragraph: **R1** base
(prorated if the subscription began mid-cycle) · **R2/R4** the included quantities as
zero-amount *informational* lines, because 裁-42⑨ says the invoice shows the allowance and the
included quantities, not just what was charged · **R3/R5** extra seats and extra slots, summed
over capacity segments at `segment_days / cycle_days` · **R6** archived-client retention ·
**R7** the allowance = `base_ai_allowance + Σ(seat-segment allowance, prorated with its seat)`
— 裁-42③'s ONE shared pool, and 裁-42⑧'s *"its AI allowance is prorated with it"* · **R8**
usage in MYR cents · **R9** `overage = max(0, R8 − R7) × overage_multiplier_bp / 10000` ·
**R10** tax (OQ-5) · **R11** total.

**R6 is where 裁-42⑤'s three sentences reconcile, so it is stated exactly.** A client accrues
**retention days** only from the **first cycle that begins after** its archive — that is
*"retention starts from the next cycle"*. It accrues **none** in its archive cycle — that is
*"the month in which a client is archived keeps the active fee"*, and it is automatically true
because the active fee is a **capacity** fee billed for the whole cycle regardless (removals
take effect next cycle, 裁-42⑧). Accrual **stops** at reactivation — that is *"never billed both
fees at once"* — and **stops at purge**, prorated to the day, because *"billing stops when the
holding stops"* (裁-42⑥). `scheduled_for_deletion` accrues exactly as `archived` does.

**Unpriced usage is PUBLISHED, never guessed.** A call whose engine has no effective
`billing_usage_rates` row for its day contributes to an `unpriced_calls` count on the invoice
rather than to R8 — the same tripwire R-L19 keeps on the metering side. A gap in the rate table
is visible, not silently free and not silently estimated.

### 3.7 · `invoice_lines` — the row set the UI renders and Stripe mirrors

Two tenant relations. **`clara.invoices`** (firm_id, cycle_start, cycle_end, plan_code, status,
evaluator_version_id, issued_at, stripe_invoice_id) and **`clara.invoice_lines`** (invoice_id,
firm_id, rung, line_kind, description, quantity, unit_price_cents, amount_cents, plus
`input_tokens`/`output_tokens` on the usage line). Both tenant-scoped: FORCE RLS with a
firm-scoped SELECT policy for `clara_authenticated`, the `llm_usage_events` posture
(`0094:83-85`); **writes only through the evaluator's own DEFINER path**, never DML.

**Every rung produces a row, including the zero ones.** 裁-42⑨ lists nine things the invoice
shows; a line suppressed for being zero is a line the owner cannot reconstruct. `invoice_lines`
is therefore the *complete* rung set, and the UI decides emphasis, never existence.

**The usage line carries BOTH denominations** — the token counts *and* the derived MYR — which
is the brief's own fail-closed instruction (§3 item 2): whichever way OQ-1's denomination
ruling goes, **no historical month has to be recomputed from data that was not kept.**

### 3.8 · The read surface, and its own floor

`clara.get_firm_invoice(p_firm uuid, p_cycle_start date)` — SECURITY DEFINER, owned by
`clara_fn_owner`, EXECUTE to `clara_authenticated`, with the firm wall as its **first
statement** (`p_firm is distinct from clara.jwt_firm()` → `CLR11`), copying
`get_llm_usage_summary`'s measured shape (`0110:706+`).

**It carries its own rank floor — `_human_ctx(role_rank('admin'))` — rather than inheriting
one.** Measured: `get_llm_usage_summary` has **no floor today** and P4's ask 11 (admin+) is
unbuilt (survey §C). A surface that assumes a floor another unbuilt item will add is a surface
with no floor. `admin` is the recommendation because 裁-42⑨'s reader is the firm owner, and
`owner` alone would lock a firm's own admin out of a bill they may be the one to pay.

### 3.9 · Draft caps — nothing to build, one decision to make

裁-42⑩'s three caps are **measured already standing** (survey §A.3): `file_document` (CLR11),
`mint_wake_credential` + `_tf_agent_task_insert` (CLR10, two independent walls), and
`_assert_client_operational` inside `_draft_entry_core` (CLR10, WB-R1). **This design builds no
new draft wall.**

What it decides is where the two NEW statuses fall. Every wall is a positive
`status='active'` test, so a new status is **outside** it by construction. **Decision:
`scheduled_for_deletion` and `purged` are both outside** — a client whose data is being held for
deletion must not take documents, be swept, or be posted to, and `_assert_client_operational`'s
own message already says the rule in words (*"operational consumers exclude onboarding/archived
clients"*). **No wall is edited.** Annex D's cell **T.9** carries the *positive* proof that each
of the five statuses lands where this paragraph says — because "the wall already excludes it" is
a derivation, and law 2 says a derivation is not evidence.

### 3.10 · What is a HUMAN act, and what is automatic

| act | who | why |
|---|---|---|
| change plan · add/remove seats or slots · archive · reactivate · schedule deletion · **purge** | **HUMAN**, admin+, audited door | 裁-42⑧: *reducing capacity is always a human act*. The agent has no path to any of them |
| the monthly rollup + the invoice line set | **AUTOMATIC**, the frozen evaluator | law 1 |
| pushing the computed invoice to Stripe | **AUTOMATIC**, a mirror of a DB-owned number | §3.11 |
| **issuing** an invoice (charging) | **HUMAN**, and additionally REFUSED while `amounts_ruled=false` | 裁-42 / 裁-28 |
| auto-archive · auto-delete · auto-stop on overage | **NOBODY. These do not exist** | 裁-42⑦⑧, laws 76/81 |

### 3.11 · Stripe — the DB is the source, Stripe is the projection

Direction is the whole design (裁-42's consequences clause): **products and prices are generated
FROM `billing_plans`, never authored in the Stripe dashboard.** A price that exists only in
Stripe is a hard-coded price with extra steps, outside the repo where no gate can see it. The
object map, the current API shapes and the webhook→door table are **Annex C** (verified against
the live official Stripe docs, 2026-08-30); three decisions
belong here because they are design, not mechanics:

1. **The overage is pushed as a one-off invoice item carrying OUR computed amount — never as
   Stripe metered usage.** Stripe's meters would aggregate and price the usage themselves, which
   makes **Stripe the originator of an authoritative number**. Law 1 forbids exactly that. Clara
   reports the evaluator's figure; Stripe collects it. *(Annex A, D12.)*
2. **Webhooks land in ONE audited, idempotent door** — `record_stripe_event(event_id, type,
   payload)`, idempotent on `event_id`, appending to an append-only `clara.stripe_events`; a
   separate applier reads it. **No webhook ever writes a book, a capacity or a status directly.**
   Signature verification happens at the edge before the door is called.
3. **`clara.stripe_object_map`** (object_kind, local_key, stripe_id, synced_at) makes the mirror
   auditable and re-runnable, and makes "which Stripe price is this plan row" a DB question.

### 3.12 · The anti-cap wall — what this design must never become

裁-42⑦ (*the service never auto-stops*), laws 76/78/81, and P4's own closed seam all say the same
thing, and `0105` exists because a cap was built once and had to be deleted. **No gate, bound,
floor, refusal or runtime path may read `billing_plans`, `billing_usage_rates`,
`firm_subscriptions`, `invoices` or `invoice_lines`.** An allowance is an invoice figure.

This is asserted **positively and mechanically**: Annex D's cell **T.2** enumerates every function
whose body references a billing relation and asserts the set equals exactly `{the evaluator, the
read surface, the issuance door, the Stripe mirror}`. An absence is not evidence (law 2), so the
proof is a measured set equality, not a grep that found nothing.

## 4 · Owner questions not settled here

Carried to the gate with recommendation, cost and fail-closed default —
**[`billing-gate-record.md`](billing-gate-record.md) §2 is the full card set.** In brief:
**OQ-1** the AI-usage denomination · **OQ-2** whether `payments_only` is minted ·
**OQ-3** the `draft`/`onboarding` spelling · **OQ-4** whether tier-1/tier-2 and the operator firm
are billed · **OQ-5** SST on the invoice · **OQ-6** grace/dunning on an unpaid invoice ·
**OQ-7** retention denominated per client or per GB · **OQ-8** the amounts (裁-28, still open).

## 5 · Build sequence

Full contents, D1 list and sequencing: **Annex D**. The shape:

| PR | contents | D1 |
|---|---|---|
| **PR-1** | `billing_plans` + `billing_usage_rates` + `firm_subscriptions` + `client_lifecycle_events` + the status widening + the four lifecycle doors + the two capacity walls | **YES — the one window.** The walls recut `_add_member_core`/`invite_member`/`accept_invite` (`0141`) and `commit_client_onboarding` (`0017`) |
| **PR-2** | `evaluate_firm_billing_v1` (+ its `evaluator_versions` row and manifest entry in the same file) + `invoices`/`invoice_lines` + `get_firm_invoice` + the issuance door | no — all new objects |
| **PR-3** | the Stripe mirror, `stripe_object_map`, `stripe_events` + the webhook door | no |
| **PR-4** | the UI — **this is P4's checkout tranche**, and it lands with 裁-36's DPA e-sign + rate wall and 裁-26's email-bound token | no |

**Migration numbers are claimed at MERGE, never at authoring** (hard constraint 10); the frontier
at writing is `0147`. **Every PR takes an independent review pass** — PR-1 and PR-2 are
judgement logic on their face, PR-3 handles an external writer, and PR-4 renders money.

## 6 · Annex map

**[`billing-annexes.md`](billing-annexes.md)**: **A** the decision register (D1-D12) · **B** the
DDL sketch and the evaluator's eleven-rung table with worked proration · **C** the Stripe object
map, the current API shapes and the webhook→door table · **D** the acceptance battery outline and
the PR ladder with its D1 body list · **E** risks and named non-goals.
