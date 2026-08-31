# The checkout / signup gate — design of record, part 2

*Part 1 — the shape, the transport rule, the state machine, the CSRF binding, the rate wall, the partial-failure analysis, the build sequence: [`checkout-gate-design.md`](checkout-gate-design.md).
Part 3 — the webhook contract, the surfaces, the environment, the acceptance battery: [`checkout-gate-design-part3.md`](checkout-gate-design-part3.md).
Measurement: [`checkout-gate-survey.md`](checkout-gate-survey.md) · owner questions: [`checkout-gate-gate-record.md`](checkout-gate-gate-record.md).*

**v3** — §1.3's door is 裁-89's single transaction and §1.3.0 answers what that does to the admission row; §1.2's store is 裁-91's redacted projection. *(v2 repaired the v1 door that stranded the paying customer; that repair's account is kept in §1.3.2.)*

## 1 · The new database objects

Four migrations, each `UNNUMBERED_*` at authoring (constraint 10 — numbers are claimed at MERGE).
**Every new table: RLS enabled AND forced, owner `clara_fn_owner`, one `USING (true)` owner
policy, and zero application-role table grants** — the estate's measured idiom for
`firm_admissions` and `firm_registration_requests` (survey §3), reached only through
`SECURITY DEFINER` doors.

**Every new door is `SECURITY DEFINER`, `plpgsql`, `SET search_path = clara, pg_temp`, owned by
`clara_fn_owner`, with PUBLIC EXECUTE revoked** — the posture measured on all six existing
identity doors (survey §2).

### 1.1 · `UNNUMBERED_checkout_gate_a` — the two walls that precede money

```
clara.dpa_documents(
  version        text primary key,          -- e.g. 'pdpa-2026-09-a'
  body_sha256    bytea not null,            -- of the exact text served to a signer
  source_path    text not null,             -- docs/ops/legal/<file>.md
  effective_from timestamptz not null,
  effective_to   timestamptz,               -- null = current
  created_at     timestamptz not null default now())
-- append-only + supersede-only triggers: the estate's reference-table idiom
-- (clara.sst_rate_schedule, 0153) applied to a consent document.

clara.dpa_signatures(
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references clara.users(id),
  dpa_version text not null references clara.dpa_documents(version),
  signed_at   timestamptz not null default now(),
  body_sha256 bytea not null,               -- what the signer was SHOWN, re-asserted
  unique (user_id, dpa_version))
-- append-only. A signature is never updated and never deleted: it is evidence.

clara.registration_rate_events(
  id            uuid primary key default gen_random_uuid(),
  origin_digest bytea not null,             -- part 1 §4 option B: NOT an address
  applicant     uuid not null references clara.users(id),
  observed_at   timestamptz not null default now())
-- append-only; index (origin_digest, observed_at desc).
```

**`clara.sign_dpa(p_version text, p_body_sha256 bytea, p_op_key text) → jsonb`** ·
grant `clara_authenticated` only.

| refusal | errcode |
|---|---|
| `no authenticated actor` | `CLR04` |
| `unknown actor` | `CLR04` |
| `the agent identity cannot sign a data processing agreement` | `CLR04` |
| `op_key is required` | `CLR10` |
| `unknown dpa version` | `CLR10` |
| `that dpa version is not current` | `CLR09` — `effective_to` is not null |
| `the signed text does not match the current agreement` | `CLR10` — `p_body_sha256 <> dpa_documents.body_sha256` |

That last wall is the one that matters: **it stops a UI that displayed one text and recorded a
signature against another.** Idempotency is structural (survey F6): a second call for the same
`(user_id, dpa_version)` returns the existing `{signature_id, signed_at, replay:true}`.

### 1.2 · `UNNUMBERED_checkout_gate_b` — the event store and the object map

```
clara.stripe_events(                        -- 裁-91: a REDACTED PROJECTION, never the raw event
  event_id      text primary key,           -- Stripe's own evt_… id
  type          text not null,
  livemode      boolean not null,           -- G13: a TEST-mode beta must be able to SEE that
  session_id    text,                       -- the reconciliation keys...
  intent_id     uuid,
  registration_id uuid,
  applicant     uuid,
  amount_total  bigint,                     -- cents, as Stripe reports them
  currency      text,
  payment_status text,
  mode          text,
  session_status text,
  customer_id   text,                       -- Stripe's OPAQUE ids: not names, not addresses
  subscription_id text,
  projection    jsonb not null default '{}',-- the allow-listed remainder, for future event types
  received_at   timestamptz not null default now(),
  constraint ck_stripe_events_no_pii check (
    not (projection ?| array['customer_details','customer_email','billing_details',
                             'shipping_details','payment_method_details'])))
-- STRICTLY append-only: BEFORE UPDATE/DELETE raises, BEFORE TRUNCATE raises.
-- There is deliberately NO applied_at column and no update path (see below).

clara.stripe_event_problems(
  id           uuid primary key default gen_random_uuid(),
  event_id     text not null references clara.stripe_events(event_id),
  problem      text not null,               -- a fixed vocabulary, CHECKed
  detail       jsonb not null default '{}',
  noticed_at   timestamptz not null default now(),
  resolved_at  timestamptz,                 -- M4: a problem must be RESOLVABLE...
  resolved_by  uuid references clara.users(id),
  resolution   text)
-- Append-only except the resolution stamp (a BEFORE UPDATE trigger permits the NULL->value
-- transition on those three columns alone, and no re-resolution).
-- M4: WITHOUT a resolution column a single problem row excludes its event from the applier
-- FOREVER, with nobody watching -- a fourth path to a stranded paying customer. The applier
-- skips only UNRESOLVED problems, and the two verbs below are how a human sees and clears them.

clara.stripe_object_map(
  object_kind text not null,                -- 'product' | 'price' | 'webhook_endpoint'
  local_key   text not null,
  stripe_id   text not null,
  synced_at   timestamptz not null default now(),
  primary key (object_kind, local_key),
  unique (stripe_id))
-- billing-annexes.md Annex C.1's shape: objects are generated FROM DB rows, never authored in
-- the dashboard (裁-42, billing design §3.11), and "which Stripe price is this plan row" stays
-- a DB question.
```

**裁-91 · what the webhook does with the raw body: verify → project → discard.** The route verifies
the signature over the raw bytes, **builds the projection by copying an ALLOW-LISTED set of
fields**, and calls the door with that. **The raw event is never persisted, never logged, and goes
out of scope with the request**; Stripe stays the system of record for what Stripe saw, answerable
by `event_id`. So **no `customer_details` — no email, name, address, phone or tax id — ever reaches
this database**, which dissolves G11's PDPA problem *structurally*: a store holding no personal data
needs no erasure door, and the table stays strictly append-only. That is the better answer, because
an erasure path in an append-only table is a hole in a wall.

**The allow-list is the wall; the CHECK is the mistake-net.** `ck_stripe_events_no_pii` refuses the
named keys at the projection's top level, but a CHECK cannot cheaply see arbitrary nesting. **The
containment is that the projector copies named fields rather than deleting unwanted ones** — the
difference between an allow-list and a deny-list, and why a new Stripe field cannot arrive here by
default; the CHECK catches the projector being edited wrongly later. *(The posture the estate states
for the pinned-ids guard: a mistake-net for a write shape, not containment.)* **The applier is
unaffected** — everything it reads was already a reconciliation field, columns now instead of
`payload` lookups, so W-T and the problem-row shape work on the projection unchanged.

**Why `stripe_events` has no `applied_at`.** Deriving "applied" from the existence of a
`firm_registration_payments` row carrying that `stripe_event_id` means the applier needs no
update path at all, so the append-only trigger can be **unconditional** — where a table that is
append-only *except for one column* has an append-only claim that must be read carefully.

**`clara.record_stripe_event(p_event_id text, p_type text, p_projection jsonb) → jsonb`** ·
**the third argument is the REDACTED projection, not the event** (裁-91). The door extracts the
typed columns from it, so **the edge cannot forget to fill one** — extraction lives in exactly one
place, and that place is the database. ·
**granted to `clara_stripe_webhook` and to nothing else** — in particular **not** to
`clara_authenticated`, so no browser can inject a Stripe event.

```
insert into clara.stripe_events(event_id, type, livemode, session_id, intent_id,
                                registration_id, applicant, amount_total, currency,
                                payment_status, mode, session_status, customer_id,
                                subscription_id, projection)
  select p_event_id, p_type, (p_projection->>'livemode')::boolean, …, p_projection
  on conflict (event_id) do nothing;
return jsonb_build_object('event_id', p_event_id, 'recorded', found);
```

Refusals: `event id and type are required` (`CLR10`), `projection must be a json object`
(`CLR10`), **`projection carries a denied field`** (`CLR10`, from the CHECK — the mistake-net
firing).
**It writes nothing else — no book, no capacity, no status, no firm** (billing design §3.11
rule 2). A redelivery writes zero rows and returns `recorded:false`: the idempotency is the
primary key, not a procedure.

**`clara.apply_stripe_events(p_limit integer default 100) → jsonb`** — the separate audited
applier, granted to `clara_stripe_webhook` only, re-runnable and idempotent. For each
`stripe_events` row of type `checkout.session.completed` with no `firm_registration_payments`
row and no unresolved `stripe_event_problems` row:

1. read the **projected columns** (裁-91 — there is no raw payload to walk); require
   `payment_status = 'paid'` **or** (`mode = 'subscription'` and `session_status = 'complete'`) —
   the zero-amount subscription case (裁-58), where `payment_status` reads `no_payment_required`;
2. read `registration_id`, `applicant`, `intent_id`, projected from the session's metadata at the
   edge;
3. require all three to resolve, **and** require the intent's `session_id` to equal the event's
   session id **and** the intent's `(registration_id, applicant)` to equal the metadata's;
4. `insert into clara.firm_registration_payments(…) … on conflict (stripe_event_id) do nothing`,
   **inside a per-row subtransaction** (`begin … exception when unique_violation then …`).

**The applier is per-row transactional, and that is load-bearing.** Each event is processed in
its own subtransaction (a plpgsql `begin … exception` block), so one bad event can neither abort
the sweep nor roll back the events already applied in it. That is the same mechanism that lets a
step-1–3 failure write its problem row and carry on. Any failure of 1–3 writes a
`stripe_event_problems` row with a named `problem` and applies nothing; an event carrying an
**unresolved** problem row is skipped on later sweeps. Returns `{examined, applied, problems}`.

> **BLOCKER-4 — the poison pill this repairs.** Step 4's `on conflict (stripe_event_id)` names one
> index, but `uq_frp_registration` is a **different** one. A second completed session for the same
> registration therefore raises `23505`, which — without the subtransaction — aborts the entire
> sweep, writes **no** problem row (the step-1–3 handler does not cover step 4), and leaves the
> poison event to be re-selected every minute forever. **No payment would apply for any customer,
> indefinitely.** The `unique_violation` handler writes the `duplicate_payment` problem row and
> continues.
>
> **The tempting narrow repair is forbidden, and the design says so here so nobody re-proposes
> it:** widening the `on conflict` clause to swallow *both* indexes makes the second payment
> disappear silently. That destroys G12's whole property — a double payment must be **visible**,
> not silently accepted — and after 裁-28's amounts are ruled it would be a real double charge
> with no record that it happened.

**The problems must be watched by someone, so they have a surface (M4).**
`clara.list_stripe_event_problems(p_include_resolved boolean default false) → setof` and
`clara.resolve_stripe_event_problem(p_problem uuid, p_resolution text, p_op_key text)` are both
walled to an **owner of the operator firm** — the same `firms.is_operator` predicate
`approve_firm_registration` uses (survey §2.5), byte-copied so the two cannot drift. Resolving a
row lets the next sweep re-attempt the event, which is the recovery path for a payment whose
metadata was momentarily unresolvable. **Where it is watched:** the operator firm's own review
surface, and an open unresolved row is a beta-checklist item — named here rather than left to a
runbook nobody opens.

**The applier's step-1 disjunct is an RM0-scoped relaxation, and it is marked as one (M10).**
`payment_status = 'paid'` OR (`mode='subscription'` AND `status='complete'`) — **the second
disjunct is true whether or not money moved.** That is correct today and only today: 裁-58 makes
every plan a zero-amount subscription, where `payment_status` reads `no_payment_required` and no
other signal exists. **The day 裁-28's amounts are ruled, the second disjunct must be tightened to
require a settled payment** (`payment_status='paid'`, or the subscription's first invoice paid),
or the applier will admit an unpaid session as a paid one. This sentence is the tightening's
tripwire and belongs in the pricing sitting's own act list.

> **Metadata is attacker-influenced only if the webhook secret leaks.** The signature check is
> what makes it trustworthy; step 3's cross-check against `checkout_intents` is a second,
> independent one — that intent row was written by *our* door, from *our* session, before
> Stripe was ever called.

### 1.3 · `UNNUMBERED_checkout_gate_c` — the money → firm path, **as one transaction** (裁-89)

**裁-89 ruled G1 option (B): the claim and the creation are ONE door in ONE transaction.** The
两步 shape 裁-73 wrote is amended by the same ruling; the standard-SaaS journey is unchanged, only
the door collapses. What follows is that door and the objects it needs — and the first thing to
say is what it *stops* needing.

#### 1.3.0 · The open question the fold forced: does the admission row survive? **No.**

Under the two-door shape the admission row existed for exactly one reason: it was the credential
one door minted and the *other* door redeemed. **A single transaction has no gap to carry a
credential across, so there is nothing for the credential to be.** The folded door calls
`clara._create_firm_core(applicant, firm_name)` directly.

**That is not a new mechanism — it is the estate's existing one.** `approve_firm_registration`
already creates a firm this way: its body calls `_create_firm_core(req.applicant, req.firm_name)`
and **never touches `clara.firm_admissions` at all** (measured in the live body; survey §2.5).
The operator road and the self-serve road now differ only in what authorises them — an operator's
decision there, a completed payment here.

**Why not keep writing an admission row anyway, as an audit artifact?** Because it would be a
**fake receipt**, and the schema says so: `firm_admissions.token_hash` is **NOT NULL and UNIQUE**
(`0147:323-324`). A row for a credential that never existed would have to carry a hash of
nothing — a manufactured value whose only purpose is to satisfy a column. The estate's own rule
against exactly that shape is why `apps/web` was forbidden a checkbox that "recorded" a DPA it did
not record. **And nothing is lost:** the chain "this firm came from this registration, bought by
this payment, under this signature" is carried by `firm_registration_requests.firm_id`, by
`firm_registration_payments.consumed_firm_id`, and by the two domain events — a complete,
append-only record with no invented values in it.

**What retires with the row, and what replaces each guarantee:**

| the two-door shape needed | why it is gone | what holds the property now |
|---|---|---|
| a plaintext token | no gap to carry it across | — |
| `token_hash`, `expires_at` | nothing to expire | — |
| `superseded_at`, rotation | nothing to rotate | the transaction either happened or it did not |
| `uq_firm_admissions_registration_live` / `_consumed` | no admission rows on this path | **`firm_registration_requests.firm_id`, set in the same transaction that reads it `FOR UPDATE`** |
| `ck_firm_admissions_not_both` | both columns retire | — |
| **裁-26's email-bound token** | **there is no bearer credential to bind** | the door's own `req.applicant = clara.jwt_sub()` wall — identity, not a spelling of it. 裁-26's purpose (a token holder who is not the applicant cannot become the owner) is served by deleting the credential rather than binding it. **Recorded for the owner as an INFORM under G7** |
| `ck_firm_admissions_selfserve_dpa` (M14) | no row to carry it | **stronger:** the door that verifies the DPA *is* the door that creates the firm, in one transaction. There is no separate minter left to forget |
| `reconcile_paid_registrations` | *"firm exists but registration open"* is unreachable | nothing — **it retires unbuilt** (§1.3.4) |

**`clara.firm_admissions` is therefore untouched by this train.** It keeps serving the seed and
fixture bootstrap exactly as today, and — see §1.4 — **`create_firm` is not re-cut at all.**

#### 1.3.1 · The objects

```
alter table clara.firm_registration_requests
  add constraint uq_frr_id_applicant unique (id, applicant);   -- enables the composite FKs below

clara.checkout_intents(
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  applicant       uuid not null,
  price_local_key text not null,            -- resolves through stripe_object_map
  dpa_version     text not null references clara.dpa_documents(version),  -- M8: PINNED at open
  session_id      text unique,              -- stamped once by record_checkout_session
  opened_at       timestamptz not null default now(),
  foreign key (registration_id, applicant)
    references clara.firm_registration_requests(id, applicant))
-- append-only except the ONE session_id stamp: a BEFORE UPDATE trigger permits a NULL->value
-- transition on session_id alone and refuses every other column change and every re-stamp.

clara.firm_registration_payments(
  id                     uuid primary key default gen_random_uuid(),
  registration_id        uuid not null,
  applicant              uuid not null,
  stripe_event_id        text not null unique references clara.stripe_events(event_id),
  stripe_session_id      text not null,
  stripe_customer_id     text,
  stripe_subscription_id text,
  recorded_at            timestamptz not null default now(),
  consumed_at            timestamptz,
  consumed_firm_id       uuid references clara.firms(id),          -- the firm this payment bought
  consumed_dpa_signature uuid references clara.dpa_signatures(id), -- the signature it was sold under
  foreign key (registration_id, applicant)
    references clara.firm_registration_requests(id, applicant))
-- Append-only except the consumption stamp, CHECKed the way ck_firm_admissions_consumed_receipt_0017
-- guards its own: the three consumed_* columns are all null or all not null, and a consumed row is
-- never un-consumed or re-pointed.
-- `consumed_firm_id` REPLACES the two-door shape's `consumed_admission`: it names the thing the
-- payment actually bought rather than the credential that used to stand for it.
create unique index uq_frp_registration on clara.firm_registration_payments(registration_id);
-- M7: ONE payment row per registration. A second completed Checkout Session for the same
-- registration cannot be applied; the applier records it as a `duplicate_payment` problem row
-- instead, so a double charge is VISIBLE and refundable rather than silently accepted.
-- UNAFFECTED by the fold: two sessions completing is settled at step ⑦, before ⑧ runs at all.
```

**Why the composite foreign keys.** `(registration_id, applicant)` referencing `(id, applicant)`
makes "this payment belongs to this applicant's registration" a **database** fact: a row naming
registration A and applicant B cannot be written, so the door's cross-caller wall compares a value
the schema already guarantees congruent.

#### 1.3.2 · The door

**`clara.claim_paid_firm(p_registration uuid, p_op_key text) → jsonb`** · `SECURITY DEFINER`,
grant `clara_authenticated` only. **This is the whole of 裁-89's ruled shape: claim, create and
close in one transaction.**

| # | wall | refusal | errcode |
|---|---|---|---|
| W1 | authenticated | `no authenticated actor` | `CLR04` |
| W2 | known | `unknown actor` | `CLR04` |
| W3 | not the agent | `the agent identity cannot claim a firm` | `CLR04` |
| W4 | op_key | `op_key is required` | `CLR10` |
| W5 | the registration exists | `unknown registration request` | `CLR10` |
| W6 | **it is MINE** — `req.applicant = clara.jwt_sub()` | `not your registration request` | `CLR04` |
| W7 | **not already a firm** — `req.firm_id is null` and `req.status='open'` | `this registration is no longer open (status: %)` | `CLR09` |
| W8 | a DPA signature at the version pinned on **the intent this payment came through** — the exact join `firm_registration_payments.stripe_session_id` → `checkout_intents.session_id` (UNIQUE) → that row's `dpa_version`, **never "the newest intent"** (M8) | `the data processing agreement is not signed` | `CLR09` |
| W9 | **a payment row exists for this registration, unconsumed** | `no completed payment for this registration` | `CLR09` |
| W10 | the caller carries an email claim | `a verified email claim is required` | `CLR04` |

Then, in **one** transaction, taking `select … from clara.firm_registration_requests where id =
p_registration for update` **first** — which is what serializes concurrent callers:

```
v_result := clara._create_firm_core(v_actor, req.firm_name);        -- the operator road's own call
update clara.firm_registration_requests
   set status = 'approved', decided_at = now(), firm_id = (v_result->>'firm_id')::uuid
 where id = p_registration;
update clara.firm_registration_payments
   set consumed_at = now(),
       consumed_firm_id = (v_result->>'firm_id')::uuid,
       consumed_dpa_signature = v_signature
 where registration_id = p_registration and consumed_at is null;
perform clara._audit(…, 'claim_paid_firm', …);
perform clara._append_event(…, 'firm.self_serve_created', …);
perform clara._append_event(…, 'firm_registration.paid', …);
return jsonb_build_object('firm_id', …, 'plan_id', …, 'registration_id', p_registration);
```

**The firm name is `req.firm_name`, read from the registration** — never re-submitted by the success
page (NIT-6). `decided_by` stays **NULL**: writing the applicant there would read as self-approval,
which `approve_firm_registration` refuses by name, and on the self-serve road *nobody decided* —
**payment is the approval** (裁-73), and the `firm_registration.paid` event carries the payment's
identity as the honest record of what authorised it.

**Idempotency.** A second call finds `firm_id` already set and returns the same
`{firm_id, plan_id, registration_id}` with `replay: true` — read from the registration row, not
from a stored receipt, because the registration *is* the receipt. **There is no window in which a
retry can do harm**, which is the property the two-door shape spent three indexes and a rotation
rule failing to buy.

#### 1.3.3 · What the fold removes, and what it does not

**Removed:** the stranding class in full (the transaction committed or it did not; if it did not,
W7 still passes and the next call runs the whole thing), and M5's unreachable closer, because
closure is no longer a separate act by a separate principal. **NOT removed: the double payment
(M7 / G12)** — two sessions completing is settled at ⑦, *before this door runs at all*, so
`uq_frp_registration` and the duplicate-payment problem row handle it under either shape.

#### 1.3.4 · `reconcile_paid_registrations` retires **unbuilt**

It existed to close a registration whose firm already existed — a state only reachable when
creation and closure were separate transactions. Under 裁-89 that state cannot occur, so the verb
is removed from this design rather than built and left dormant. Its grant retires with it (§1.6),
and its acceptance cell (W-P2) retires with it (part 3 §4).

**Two new `clara.event_types` rows** are registered in the same migration that emits them (survey
F8 — `domain_events.event_type` is FK'd to that registry and a trigger raises `CLR10 unknown
event_type %`): `firm.self_serve_created` and `firm_registration.paid`, both `client_scoped =
false`. Both are emitted **inside the folded transaction**, after `_create_firm_core` returns —
which is the earliest moment `_append_event` can be called at all, because
`domain_events.firm_id` is NOT NULL.

**`clara.open_checkout_intent(p_registration uuid, p_origin_digest bytea, p_op_key text)
→ jsonb`** · grant `clara_authenticated`. Part 1 §4 is the rate-wall reasoning.

| # | wall | refusal | errcode |
|---|---|---|---|
| X1–X6 | as W1–W7 (authenticated · known · not the agent · op_key · exists · **mine** · still open) | *as above* | |
| X7 | the DPA is signed at the current version | `the data processing agreement is not signed` | `CLR09` |
| X8 | `p_origin_digest` is exactly 32 bytes | `an origin digest is required` | `CLR10` |
| X9 | **the rate wall** — no *other* applicant's registration from this digest in 24 h | `too many firm registrations from this location today` | `CLR09` |
| X10 | not already paid | `this registration is already paid` | `CLR09` |

On success it appends the `registration_rate_events` row **and** the `checkout_intents` row in one
transaction and returns `{intent_id, price_local_key, stripe_price_id}` — the price id read from
`stripe_object_map`, **so the route never names a price** and hard constraint 2 holds: the browser
computes no cents and Stripe renders its own Price.

**`clara.record_checkout_session(p_intent uuid, p_session_id text, p_op_key text) → jsonb`** —
stamps the one `session_id`; refuses `checkout session already recorded` (`CLR09`) on a re-stamp
with a different value; replays on the same value. **It carries the same ownership wall as every
other door here — `intent.applicant = clara.jwt_sub()`, else `CLR04 not your checkout intent`
(M2)** — because without it any caller who guessed an unstamped intent's uuid could stamp it with an
arbitrary session id and brick it (`session_id` is UNIQUE, so the real stamp then refuses). A
guessed uuid is a high bar, which is why it is worth naming: *"the id is unguessable"* is the
bearer-credential pattern 裁-16b removed in `0147`, and it is not a wall.

### 1.4 · There is no D1 item — and that is 裁-73's own prediction restored

**The `create_firm` recut is CANCELLED by the fold.** It existed to carry 裁-26's email wall into
the body that redeemed the admission token. The folded door redeems no token and calls
`_create_firm_core` directly, so **`clara.create_firm` is not touched by this train at all** — its
live body stays at `0147:497`, `prosrc` sha12 `59fa533d9c03`, unrecut.

**Consequences worth stating plainly, because they reverse things this design previously owed:**

- **The D1 write-quiesce window disappears.** There is no longer any live body being replaced, so
  the train's D1 inventory is **EMPTY**.
- **裁-73's text is restored, not diverged from.** The ruling said *"the existing `create_firm`
  unchanged"* and priced it *"no D1 window"*; v2 had to report both as divergences (G7 item 2).
  **Under 裁-89 both are simply true again**, and G7 retires that item.
- The three conjuncts (M-A), `ck_firm_admissions_selfserve_bound`, `ck_firm_admissions_selfserve_dpa`
  and the two partial indexes all retire with the recut — none of them has a subject any more.
- `firm_admissions` gains **no columns**. The seed's two rows and the fixtures' rows stay exactly
  as lawful as they are today, because nothing about that table changes.

*(裁-92's confirmation-attempt wall is **part 3 §2.1**, beside the surface it walls: its doors are
reached by the runtime on `apps/web`'s behalf, not by a firm-scoped caller.)*

### 1.5 · `op_receipts` is not used, deliberately

Survey F6: `op_receipts.firm_id` is NOT NULL with **no** FK onto `clara.firms`, so a sentinel
firm id would technically insert. **No door here may do that.** Every new pre-firm door takes
structural idempotency from its own table, as the three existing ones do. `claim_paid_firm`
*could* use `_reserve_op` for the part of its work that runs after the firm exists, and does not:
its idempotency is the registration row's own `firm_id`, read `FOR UPDATE`. So every door here
shares one idempotency story.

### 1.6 · The webhook's principal

A new NOLOGIN role `clara_stripe_webhook` plus a login member `clara_stripe_webhook_login` — the
estate's measured idiom (survey F11). Its **entire** grant surface:

| object | privilege |
|---|---|
| `clara.record_stripe_event(text,text,jsonb)` | EXECUTE |
| `clara.apply_stripe_events(integer)` | EXECUTE |
| **everything else** | **none** — no table grants, no other function, **no `BYPASSRLS`** |

**Two functions, not three** — the v2 draft granted `reconcile_paid_registrations`, which 裁-89
retires unbuilt (§1.3.4); cell W-O asserts the count. The connection executes
`set role clara_stripe_webhook` on checkout, as the runtime's pools already do
(`docs/ops/DR-render.md:204-205`).

**What a compromised webhook DSN can actually do, stated honestly (M11).** An earlier draft claimed
such a credential could only "run an applier that will refuse to resolve its metadata". **That was
wrong:** `record_stripe_event` performs no authenticity check of its own — the signature check is in
the route, not the door — so anyone holding the DSN who knows a real
`(registration_id, applicant, intent_id, session_id)` tuple can append an event the applier **will**
apply, and **every customer knows their own tuple.**

**So: the webhook DSN is equivalent in power to the Stripe signing secret.** Both let their holder
assert "this registration is paid". Neither can create a firm, close a registration or read a book —
the grant is two functions and no tables — so the blast radius is *a free firm at RM0, a free
subscription once priced*, not tenant compromise. It is rotated with the same care as
`STRIPE_WEBHOOK_SECRET`, and cell W-O2 pins it as a MUST-NOT-RED control.

### 1.7 · The audit gap, named rather than papered over

Survey F7: `clara.audit_log.firm_id` and `clara.domain_events.firm_id` are both NOT NULL, and
`domain_events` is `PRIMARY KEY (firm_id, seq)` sequenced per firm — so **no pre-firm act in this
journey can be audited through the existing spine**, and none is today (`claim_identity` and
`request_firm_registration` write neither an audit row nor an event, measured positively).

This design does **not** widen those tables: a nullable `firm_id` would break the primary key and
the per-firm sequence. Instead **every pre-firm table above is append-only and timestamped and
is itself the record** — `dpa_signatures`, `registration_rate_events`, `checkout_intents`,
`stripe_events`, `stripe_event_problems`, `firm_registration_payments`. From `create_firm` onward
the ordinary spine takes over. **Gate question G6** puts the residual to the owner: whether a
first-class pre-firm audit relation is owed before beta.

---

