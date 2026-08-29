# Billing — annexes

> Companion to [`billing-design.md`](billing-design.md) and [`billing-survey.md`](billing-survey.md).
> **A** the decision register · **B** the DDL sketch and the evaluator's eleven-rung table with a
> worked proration · **C** the Stripe object map, the current API shapes and the webhook→door
> table · **D** the acceptance battery outline and the PR ladder with its D1 body list ·
> **E** risks and named non-goals.
>
> **Nothing here is a claimed migration number or a claimed price.** Numbers are claimed at merge
> (hard constraint 10; frontier at writing `0147`); amounts are 裁-28's and are open.

---

## Annex A · Decision register

| # | question | chosen | why | refused |
|---|---|---|---|---|
| **D1** | One configuration relation, or one per concern? | **Two: `billing_plans` (the price list) + `billing_usage_rates` (per-engine MYR rates)** | A plan row is per plan-code; a usage rate is per engine and changes on a different clock (a vendor's model roster moves without any pricing decision). One relation would force a plan row per engine — a cross product that guarantees drift | One wide `billing_config` relation · a `jsonb` config blob (a blob puts prices where no CHECK, no column comment and no reviewer's eye reaches them) |
| **D2** | Denominate usage against `llm_price_table`? | **NO — a separate MYR `billing_usage_rates`; `llm_price_table` is read by nothing in this design** | `llm_price_table` is USD-only **by CHECK** (`0110:497`, measured) and its own header calls it vendor cost. Reusing it would bill the firm **at Clara's cost** (every margin decision then lives outside the DB — the configurability law's exact failure mode) and would need a USD→MYR FX rate that **law 18 forecloses** and that no relation in the estate provides (`fx_rates` measured absent) | Reuse `llm_price_table` × an FX rate · add a `currency='MYR'` value to `llm_price_table` (breaks its named single-value floor and conflates cost with price in one table) |
| **D3** | Which roles consume a paid seat — a `role_rank` floor, or data? | **`billing_plans.paid_roles text[]`, element-CHECKed against the live labels** | `role_rank(role) >= role_rank('bookkeeper')` selects the same three roles today and is one line shorter — and is a **permission ladder, not a price list**. Inserting a role into the ladder (OQ-2's own question) would change a **price** silently, inside a body nobody reads for money. Review law 3, applied to a rank | A `role_rank` floor in the evaluator body · a `is_paid_seat` boolean column on `firm_memberships` (a per-person flag, which 裁-42② rules out: a seat is capacity) |
| **D4** | Mint a `draft` status, or map 裁-42's word onto the live `onboarding`? | **Keep `onboarding`; the UI may display "Draft"** | Every granted client-minting surface already births it (`0017:2505`, `:2542`), the three caps already key on it, and the word is written into two live doors, a CHECK, a constraint name and nine test files. A synonymous second value is two spellings for one state — the defect, not the fix | Rename `onboarding`→`draft` (a live-body recut plus nine test files for a word) · add `draft` alongside (two spellings, one state) |
| **D5** | Read the lifecycle from `clients.status`, the event spine, or a dedicated relation? | **A dedicated append-only `client_lifecycle_events`, written only by the doors; the spine is ALSO appended, but is not authoritative** | 裁-42⑤ is written on *when* a transition happened; a status column carries only the present. And `clara.events` is **open-world** — any lane may append — while a money number must read a closed one | Derive from `clara.events` · derive from `clients.status` + `created_at` (cannot express an archive date at all) |
| **D6** | Build `purge_client` in this set? | **NO — design the STATE now, build the door later, in its own pass with its own owner sentence and D1 window** | Reverse-not-delete is structural (law 6 / PRD invariant 8: *"there is no delete verb anywhere in the schema"*), so a purge is the estate's one deliberate exception. Designing the state costs nothing and makes the meter correct from day one (裁-42⑥); the door can arrive later with no data migration. Until then `purged` is unreachable — honest, because nothing has been purged | Build it in PR-1 (a destructive verb inside a capacity PR) · leave `purged` out of the CHECK (then 裁-42⑥'s "until PURGED" has no terminus and retention bills forever) |
| **D7** | Store capacities as TOTALS or as extras-beyond-included? | **TOTALS; the invoice derives `max(0, capacity − included)`** | The wall must read ONE number. Storing the extra makes the wall a sum across two relations resolved by date, so the number a refusal quotes can differ from the number the firm bought the day a plan's included count moves | Store `extra_seats`/`extra_slots` |
| **D8** | A separate change-log for capacity changes, or an effective-dated subscription? | **Effective-dated, append-only `firm_subscriptions`, one row per `(firm_id, effective_from)`, same two walls as the config tables** | 裁-42⑧ then falls out rather than being implemented: an addition writes `effective_from = today`, a removal writes `effective_from = next cycle start`, and the evaluator prorates by reading every row overlapping the cycle. No "pending change" state machine to get wrong | A current row + a `firm_subscription_changes` log (two places to keep in step) · a current row + a `pending_change` column (a state machine with no reader until the cycle turns) |
| **D9** | Cycle anchor — a day 1-31, or 1-28? | **`cycle_anchor_day smallint check (between 1 and 28)`** | Days 29-31 need a February clamp rule, and a clamp is a rule a firm owner cannot see on the invoice — which 裁-42⑨ forbids. 28 is also Stripe's own guidance for exactly this reason | 1-31 with a documented clamp · a `cycle_anchor_at timestamptz` (same clamp, hidden in arithmetic) |
| **D10** | How is "the amounts are not ruled" represented? | **`billing_plans.amounts_ruled boolean`, separate from the amounts; the evaluator still COMPUTES, `issue_invoice` REFUSES** | `0` must be a legal configured price (裁-42's law) **and** an unruled amount must never render as RM0 (P4 §4 F: *"never RM0 or an em-dash, both of which read as 'free'"*). One column holding both facts is the one-string-three-meanings defect. Separating them makes 裁-42's *"until the amounts land, nothing charges"* a **wall**, and lets PR-1..PR-3 merge unpriced exactly as the brief §4 permits | NULL amounts (then every arithmetic site needs a NULL branch, and a missed one silently bills zero) · a sentinel like `-1` (a negative price is a worse lie than a zero) |
| **D11** | Exemption — a firm flag or a plan flag? | **A plan flag (`is_exempt`), with BELCORT on an exempt plan; an exempt cycle produces NO invoice, not a zero invoice** | The estate's operator marker (`firms.is_operator`) is **measured unset on every firm** and its marking is an owner-timed Wave-G ceremony (裁-43) — a wall keyed on it is inert until that runs. A plan flag works from PR-1 and is auditable as configuration | Key the exemption on `is_operator` directly (inert until the ceremony; and it conflates "runs the platform" with "is not billed", which are separable) |
| **D12** | Report the overage to Stripe as metered usage, or as our own amount? | **A one-off invoice item carrying the evaluator's computed amount** | Stripe's meters aggregate **and price** usage themselves, which makes **Stripe the originator of an authoritative number** — precisely what law 1 forbids. Clara computes; Stripe collects | `billing.meter_events` + a metered price (Stripe owns the number) · a usage-based rate card (same defect, more surface) |

---

## Annex B · The DDL sketch and the evaluator's rungs

### B.1 · DDL sketch — shape only, not a migration

**Platform relations** (no `firm_id`; FORCE RLS, one `clara_fn_owner` ALL policy, grants to
`clara_fn_owner` only; reads via a DEFINER function — `llm_price_table`'s measured posture):

```
clara.billing_plans(
  plan_code text not null check (btrim(plan_code) <> ''),
  effective_from date not null, effective_to date,
  base_price_cents bigint not null check (>= 0),
  included_paid_seats int not null check (>= 0),
  included_active_client_slots int not null check (>= 0),
  base_ai_allowance_cents bigint not null check (>= 0),
  per_seat_price_cents bigint not null check (>= 0),
  per_seat_ai_allowance_cents bigint not null check (>= 0),
  per_active_client_slot_price_cents bigint not null check (>= 0),
  archived_client_retention_price_cents bigint not null check (>= 0),
  overage_multiplier_bp int not null default 10000 check (>= 0),
  paid_roles text[] not null default '{owner,admin,bookkeeper}'
    check (paid_roles <@ array['viewer','bookkeeper','admin','owner']),
  currency text not null default 'MYR' check (currency = 'MYR'),
  amounts_ruled boolean not null default false,
  is_exempt boolean not null default false,
  source_note text not null check (btrim(source_note) <> ''),
  recorded_at timestamptz not null default now(),
  primary key (plan_code, effective_from),
  constraint ck_billing_plan_range check (effective_to is null or effective_to >= effective_from))
+ unique index on (plan_code) where effective_to is null
+ statement-level no-overlap trigger        -- btree_gist is installed NOWHERE (0056:266-269)
+ BEFORE TRUNCATE guard

clara.billing_usage_rates(engine_id, effective_from, effective_to,
  input_price_cents_per_million_tokens, output_price_cents_per_million_tokens,
  currency check (= 'MYR'), source_note, recorded_at,
  primary key (engine_id, effective_from), + the same three walls)
```

**Tenant relations** (FORCE RLS, firm-scoped SELECT for `clara_authenticated`, writes via DEFINER
verbs only — `llm_usage_events`' posture, `0094:83-85`):

```
clara.firm_subscriptions(id, firm_id, plan_code, effective_from, effective_to,
  paid_seat_capacity int not null check (>= 0),
  active_client_capacity int not null check (>= 0),
  cycle_anchor_day smallint not null check (between 1 and 28),
  stripe_customer_id text, stripe_subscription_id text,
  created_by, created_at,
  + unique index on (firm_id) where effective_to is null
  + statement-level no-overlap trigger per firm)

clara.client_lifecycle_events(id, firm_id, client_id, from_status, to_status,
  occurred_at timestamptz not null, actor uuid not null, reason text, op_key text,
  foreign key (client_id, firm_id) references clara.clients(id, firm_id),   -- uq_clients_id_firm, 0007:59
  + append-only triggers)

clara.invoices(id, firm_id, cycle_start, cycle_end, plan_code, status,
  evaluator_version_id references clara.evaluator_versions(id),
  computed_at, issued_at, stripe_invoice_id, unpriced_calls bigint not null default 0,
  unique (firm_id, cycle_start))

clara.invoice_lines(id, invoice_id, firm_id, rung int not null, line_kind text not null,
  description text not null, quantity numeric, unit_price_cents bigint,
  amount_cents bigint not null, input_tokens bigint, output_tokens bigint,
  unique (invoice_id, rung))

clara.stripe_object_map(object_kind, local_key, stripe_id, synced_at, unique (object_kind, local_key))
clara.stripe_events(event_id text primary key, type, payload jsonb, received_at, applied_at)
```

**Status widening** — drop `clients_status_check_0017`, add a **named** successor admitting
`active | archived | onboarding | scheduled_for_deletion | purged`. Named deliberately: `0017:5249`
asserts the current constraint **by name**, and a system-generated name would leave the next
reader with nothing to pin.

### B.2 · The eleven rungs

`cycle_days` = the cycle's own day count. `seg_days` = days a segment (a `firm_subscriptions`
row's overlap with the cycle) covers. **Each line rounds ONCE, half-up, to `bigint` cents; the
total is the sum of the rounded lines** — never a rounded sum, so the invoice reconciles by
addition (裁-42⑨).

| R | line_kind | formula | 裁-42 |
|---|---|---|---|
| 1 | `base` | `Σ_segments round(base_price_cents × seg_days / cycle_days)` | ① |
| 2 | `included_seats` | amount `0`; quantity = `included_paid_seats` — **informational, always emitted** | ① ⑨ |
| 3 | `extra_seats` | `Σ_segments round(max(0, paid_seat_capacity − included_paid_seats) × per_seat_price_cents × seg_days / cycle_days)` | ① ② ⑧ |
| 4 | `included_slots` | amount `0`; quantity = `included_active_client_slots` — informational | ① ⑨ |
| 5 | `extra_slots` | `Σ_segments round(max(0, active_client_capacity − included_active_client_slots) × per_active_client_slot_price_cents × seg_days / cycle_days)` | ① ④ ⑧ |
| 6 | `archived_retention` | `Σ_clients round(archived_client_retention_price_cents × retention_days(client) / cycle_days)` — see B.3 | ⑤ ⑥ |
| 7 | `ai_allowance` | `round(base_ai_allowance_cents × base_seg_days/cycle_days) + Σ_segments round(max(0, capacity − included) × per_seat_ai_allowance_cents × seg_days/cycle_days)` — **ONE firm-wide pool**, each seat's share prorated with the seat | ① ③ ⑧ |
| 8 | `ai_usage` | `Σ_engines round((in_tok × in_rate + out_tok × out_rate) / 1e6)` over `llm_usage_events` where `scope='firm' and firm_id = p_firm` and `(created_at at time zone 'utc')::date` in the cycle, joined to the `billing_usage_rates` row effective on that date. Carries the token counts on the line | ⑦ |
| 9 | `ai_overage` | `round(max(0, R8 − R7) × overage_multiplier_bp / 10000)` | ⑦ |
| 10 | `tax` | OQ-5 — either Stripe Tax's returned amount mirrored onto the line, or a DB computation off the SST schedule. **Not decided here** | ⑨ |
| 11 | `total` | `R1 + R3 + R5 + R6 + R9 + R10` (R2/R4/R7/R8 are informational) | ⑨ |

**`unpriced_calls`** — calls whose engine had no effective rate on their day contribute here and
**not** to R8. Published on the invoice, never guessed (the R-L19 tripwire).

### B.3 · `retention_days`, stated exactly, because 裁-42⑤ has four clauses

For each client, over the cycle `[cycle_start, cycle_end]`:

- accrual **begins** at the start of the **first cycle that begins AFTER** the client's archive
  transition → *"retention starts from the next cycle"*, and **zero days accrue in the archive
  cycle** → *"the month in which a client is archived keeps the active fee"* (automatically true:
  the active fee is a **capacity** fee billed for the whole cycle, since removals take effect
  next cycle, ⑧);
- accrual **continues** through `archived` and `scheduled_for_deletion` alike → ⑥;
- accrual **stops** at a `reactivate_client` transition → *"never billed both fees at once"*;
- accrual **stops** at a `purge_client` transition, prorated to the day → *"billing stops when
  the holding stops"* (⑥).

**Worked cell (Annex D's T.4, with distinct amounts so a transposition cannot pass).** A
**30-day** cycle. The plan includes **2** seats at **RM40** each and **5** slots at **RM25**
each, and prices archived retention at **RM7**. The firm holds **4** seats and **8** slots from
day 1, **adds a 5th seat on day 21** (10 days remaining), and holds **3** clients archived in a
*prior* cycle, one of which is **reactivated on day 16**.

- **R3** — two capacity segments: days 1-20 at 4 seats (extra 2), days 21-30 at 5 (extra 3).
  Equivalently 2 extra seats for all 30 days plus 1 more for 10:
  `round(2 × 4000 × 30/30) + round(1 × 4000 × 10/30)` = `8000 + 1333` = **9333c = RM93.33**.
- **R5** — one segment, extra `8 − 5 = 3` for the whole cycle:
  `round(3 × 2500 × 30/30)` = **7500c = RM75.00**.
- **R6** — two clients accrue all 30 days, the reactivated one accrues days 1-15 only:
  `2 × round(700 × 30/30) + round(700 × 15/30)` = `1400 + 350` = **1750c = RM17.50**.

Every quantity, price and day-count differs from every other, so no cell passes by coincidence —
a transposed multiplicand cannot land on the right answer.

---

## Annex C · Stripe — the object map, the current API, the webhook table

**Verified against the live official Stripe documentation, 2026-08-30** (the standing
query-the-newest-docs instruction). Shapes here are current-API, not remembered.

### C.1 · The object map — generated FROM `billing_plans`, never authored in the dashboard

| local | Stripe object | key |
|---|---|---|
| a firm | `Customer` | `firm_subscriptions.stripe_customer_id` |
| a `billing_plans` line kind (`base`, `extra_seats`, `extra_slots`, `archived_retention`) | `Product`, one per line kind | `stripe_object_map(object_kind='product', local_key=<line_kind>)` |
| a `billing_plans` **effective row** × line kind | `Price` (recurring, **licensed**, MYR) | `stripe_object_map(object_kind='price', local_key='<plan_code>@<effective_from>#<line_kind>')` — a new effective row mints a NEW price; prices are immutable in Stripe, which matches the append-only config exactly |
| the firm's live subscription | `Subscription` with one item per licensed line, `quantity` = the capacity | `stripe_subscription_id`; `billing_cycle_anchor` from `cycle_anchor_day` |
| the AI overage (R9) | a one-off **`InvoiceItem`** carrying the evaluator's amount (`invoiceItems.create({customer, pricing:{price}, ...})` or an explicit `amount`), added before the cycle's invoice finalises | `invoice_lines.rung = 9` |
| tax | `automatic_tax: {enabled: true}` on the Subscription/Invoice, **if OQ-5 rules Stripe Tax** | mirrored back onto rung 10 |

**Never `billing.meter_events` / metered prices** (Annex A, D12) — Stripe would then originate a
money number, which law 1 forbids. Licensed prices with a `quantity` are the correct shape here
and Stripe prorates quantity changes itself; **Clara's own R3/R5 remain authoritative** and any
divergence between the two is a reconciliation alarm, never a silent adoption of Stripe's figure.

### C.2 · Webhooks → which DB door

Every event: signature-verified at the edge (`Webhook.constructEvent` with the raw body and the
endpoint secret; a verification failure is a 400 and **no door is called**), then handed to the
**one** door.

| event | door | effect |
|---|---|---|
| `checkout.session.completed` | `record_stripe_event` → applier | binds `stripe_customer_id` / `stripe_subscription_id` onto the firm's open `firm_subscriptions` row |
| `invoice.paid` | `record_stripe_event` → applier | stamps `clara.invoices.status='paid'` |
| `invoice.payment_failed` | `record_stripe_event` → applier | records the failure. **What happens next is OQ-6 and is NOT built until it is ruled** |
| `invoice.upcoming` · `invoice.updated` · `customer.subscription.updated` | `record_stripe_event` | recorded; no automatic book effect |

`record_stripe_event(p_event_id text, p_type text, p_payload jsonb)` is **idempotent on
`p_event_id`** (Stripe redelivers) and appends to `clara.stripe_events`. **No webhook writes a
book, a capacity, a client status or an invoice line.** The applier is a separate, audited,
re-runnable read of that append-only table.

---

## Annex D · The acceptance battery and the PR ladder

### D.1 · Battery outline — the cells that must exist

**T.1 · the configurability proof.** Assert `billing_plans`' column set contains a column for
each of 裁-42's configurables, **by name**, so a value that migrates into a function body
reddens. *(The design's own acceptance criterion, made mechanical.)*

**T.2 · the anti-cap census — a POSITIVE set equality, not an absence.** Enumerate every
`clara` function whose body references any billing relation and assert the set equals exactly
`{evaluate_firm_billing_v1, get_firm_invoice, issue_invoice, the Stripe mirror verbs}`. An
absence is not evidence (law 2), so this is measured as an equality in both directions — the
`S5_25_BARE_TOKEN_ROSTER` discipline applied to a different property.

**T.3 · the state machine, every transition.** One cell per edge, both polarities: each legal
edge succeeds and writes exactly one `client_lifecycle_events` row; each **illegal** edge refuses
with its named reason (`active→purged`, `onboarding→scheduled_for_deletion`,
`purged→anything`, and — the one that matters — `archived→active` **without a free slot**).

**T.4 · proration arithmetic, distinct amounts.** Annex B.3's worked cell plus its siblings:
mid-cycle seat add · mid-cycle slot add · a removal landing next cycle · a full-cycle segment ·
a subscription starting mid-cycle. **Every quantity in every cell differs from every other**, so
a transposed multiplication cannot pass — the "non-discriminating money fixture" lesson.

**T.5 · capacity walls.** Seat wall at each of the four membership sites; slot wall at
`commit_client_onboarding` and `reactivate_client`. Each cell proves the refusal **and** that the
count is unchanged afterwards (a wall that refuses but half-writes is worse than none).

**T.6 · the overage floor.** `usage < allowance` → R9 is exactly `0`, and the line **is still
emitted** (裁-42⑨). `usage > allowance` → R9 is the difference × the multiplier. `multiplier = 0`
→ R9 is `0` on a positive difference.

**T.7 · allowance expiry.** Cycle N's unused allowance contributes **nothing** to cycle N+1 —
proven by computing two consecutive cycles and asserting R7(N+1) is independent of R8(N).

**T.8 · `amounts_ruled` gates ISSUANCE, not computation.** With the flag false: the evaluator
returns a full line set **and** `issue_invoice` refuses `amounts_not_ruled`. With it true: issue
succeeds. This is the cell that proves 裁-42's *"nothing charges"* is a wall.

**T.9 · the draft caps land where §3.9 says.** For each of the five statuses, positively assert
whether `file_document`, the autodraft pair and `_draft_entry_core` admit or refuse — **read, not
derived** (law 2). Five statuses × three walls.

**T.10 · determinism.** The same `(p_firm, p_cycle_start)` evaluated twice, under **two
different session `TimeZone` GUCs**, produces byte-identical lines. F-A9's gate caught exactly
this class once.

**T.11 · the unpriced tripwire.** A usage row whose engine has no effective rate contributes to
`unpriced_calls` and **not** to R8, and the invoice publishes the count.

**T.12 · webhook idempotency.** The same `event_id` delivered twice writes one `stripe_events`
row and applies once.

### D.2 · The PR ladder, and the D1 body list

| PR | contents | D1 | gated on |
|---|---|---|---|
| **PR-1** | `billing_plans` · `billing_usage_rates` · `firm_subscriptions` · `client_lifecycle_events` · the status widening (named successor constraint) · `archive_client` / `reactivate_client` / `schedule_client_deletion` · the seat wall · the slot wall · the placeholder plan rows with `amounts_ruled=false` | **YES — the one window in this item** | — |
| **PR-2** | `evaluate_firm_billing_v1` + its `evaluator_versions` row (`firm_id = NULL`) + its `frozen-evaluators.json` entry, **all in the same file** · `invoices` · `invoice_lines` · `get_firm_invoice` (admin+ floor) · `issue_invoice` (refuses while `amounts_ruled=false`) | no — all new objects | PR-1 |
| **PR-3** | `stripe_object_map` · `stripe_events` · `record_stripe_event` · the mirror verbs · the webhook edge | no | PR-2 |
| **PR-4** | the UI — **P4's checkout tranche**, landing with 裁-36's DPA e-sign + rate wall and 裁-26's email-bound admission token | no | PR-3, and 裁-28's amounts for anything that renders a numeral |

**PR-1's D1 write-quiesce list** — four live bodies are replaced, and all four are on the
identity/onboarding hot path:

1. `clara._add_member_core` (`0141:294`)
2. `clara.invite_member` (`0141:348`)
3. `clara.accept_invite` (`0141:407`)
4. `clara.commit_client_onboarding` (`0017:2751`)

*(`clara.set_member_role`, `0005:706`, joins the list if the seat wall lands there in the same
PR rather than in PR-1b — a severance the gate may take.)*

**Prestate discipline, non-negotiable.** Each of the four is a **prediction** from migration
source, not a measurement of the live body (survey's standing caveat). PR-1 pins each body's
live `prosrc` SHA before it CoRs anything, and reconciles a divergence rather than overwriting
it — the estate has been bitten by a cross-PR `CREATE OR REPLACE` silently reverting a live
splice more than once.

**Roster edits land in the SAME PR as the objects they name** — `rig-meta.mjs`'s function and
table rosters, and any `S5_25_BARE_TOKEN_ROSTER` change (which should be **none**: §3.6 wall 1
forbids a bare clock read in the evaluator, and an unmeasured append reddens the weekly frontier
leg *later*, not on the PR).

---

## Annex E · Risks and named non-goals

**Risks.**

1. **The amounts arrive and the shape does not fit them.** 裁-28 is open, and a model designed
   before its numbers can meet a price the shape cannot express (e.g. a per-client-volume tier,
   which the market survey shows Bukku/Puzzle/Dext all use). *Mitigation:* every amount is a
   column in an effective-dated row, so a **price** change costs an INSERT. A **shape** change
   still costs a migration — that risk is inherent to designing before the sitting, and 裁-42
   ordered it that way deliberately.
2. **The rate table drifts from the ledger's engine namespace.** A `billing_usage_rates` row
   keyed on a bare model name never matches. *Mitigation:* T.11's tripwire makes the miss
   **visible as `unpriced_calls`** rather than silently free.
3. **Stripe and the evaluator disagree** on a licensed line. *Mitigation:* Clara's number is
   authoritative (D12) and a divergence is an alarm; the mirror never adopts Stripe's figure.
4. **`purge_client` is deferred**, so `scheduled_for_deletion` accrues retention with no door to
   stop it. *Mitigation:* correct by 裁-42⑥ (*billing stops when the holding stops* — and the
   holding has not stopped), but it must not be left indefinitely; the deferral is named in
   PROGRESS, not just here.
5. **The operator ceremony (裁-43) has not run**, so no firm carries `is_operator`.
   *Mitigation:* D11 keys the exemption on a **plan flag**, which works from PR-1.

**Named non-goals.**

- **A cap, a brake, a throttle or an auto-stop of any kind** (§3.12) — laws 76/78/81, 裁-42⑦.
- **Capability gating by tier** — P4 §9 forbids it; `tier_code` does not exist and nothing here
  creates a reason for it to.
- **Multi-currency.** Billing is MYR-only by CHECK; the vendor cost table stays USD-only by
  CHECK. FX is law 18's own post-G wave.
- **A cross-firm operator billing console.** The read surface is per firm, with a firm wall as
  its first statement. A platform revenue view is its own item, its own role, its own review.
- **Dunning, suspension or any access consequence of non-payment** — OQ-6, unruled, unbuilt.
- **A trial quota** — 裁-36 declined it explicitly: metering bills after the fact, and a quota
  would be a second, contradictory answer.
- **The amounts.** 裁-28's, and this set does not propose them; the market evidence is
  [`research/pricing-market-survey-2026-08-29.md`](../research/pricing-market-survey-2026-08-29.md)
  and the cost floor is still owed.
