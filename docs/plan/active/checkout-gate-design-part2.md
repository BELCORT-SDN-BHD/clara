# The checkout / signup gate — design of record, part 2

*Part 1 — the shape, the transport rule, the state machine, the CSRF binding, the rate wall, the partial-failure analysis, the build sequence: [`checkout-gate-design.md`](checkout-gate-design.md).
Part 3 — the webhook contract, the surfaces, the environment, the acceptance battery: [`checkout-gate-design-part3.md`](checkout-gate-design-part3.md).
Measurement: [`checkout-gate-survey.md`](checkout-gate-survey.md) · owner questions: [`checkout-gate-gate-record.md`](checkout-gate-gate-record.md).*

**v2** — §1.3's door is rewritten. The version in v1 **stranded the paying customer**; the repair
and what was wrong are stated there rather than quietly corrected.

**This part carries the objects, the webhook route contract, the environment and the acceptance battery.** Section numbering restarts; part 1 cites these as "part 2 §N".

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
clara.stripe_events(
  event_id    text primary key,             -- Stripe's own evt_… id
  type        text not null,
  payload     jsonb not null,
  received_at timestamptz not null default now())
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

**Why `stripe_events` has no `applied_at`.** Deriving "applied" from the existence of a
`firm_registration_payments` row carrying that `stripe_event_id` means the applier needs no
update path at all, so the append-only trigger can be **unconditional** — where a table that is
append-only *except for one column* has an append-only claim that must be read carefully.

**`clara.record_stripe_event(p_event_id text, p_type text, p_payload jsonb) → jsonb`** ·
**granted to `clara_stripe_webhook` and to nothing else** — in particular **not** to
`clara_authenticated`, so no browser can inject a Stripe event.

```
insert into clara.stripe_events(event_id, type, payload)
  values (p_event_id, p_type, p_payload)
  on conflict (event_id) do nothing;
return jsonb_build_object('event_id', p_event_id, 'recorded', found);
```

Refusals: `event id and type are required` (`CLR10`), `payload must be a json object` (`CLR10`).
**It writes nothing else — no book, no capacity, no status, no firm** (billing design §3.11
rule 2). A redelivery writes zero rows and returns `recorded:false`: the idempotency is the
primary key, not a procedure.

**`clara.apply_stripe_events(p_limit integer default 100) → jsonb`** — the separate audited
applier, granted to `clara_stripe_webhook` only, re-runnable and idempotent. For each
`stripe_events` row of type `checkout.session.completed` with no `firm_registration_payments`
row and no unresolved `stripe_event_problems` row:

1. read `payload -> 'data' -> 'object'`; require `payment_status = 'paid'` **or**
   (`mode = 'subscription'` and `status = 'complete'`) — the zero-amount subscription case
   (裁-58), where `payment_status` reads `no_payment_required`;
2. read `metadata ->> 'clara_registration_id'`, `'clara_applicant'`, `'clara_intent_id'`;
3. require all three to resolve, **and** require the intent's `session_id` to equal the event's
   session id **and** the intent's `(registration_id, applicant)` to equal the metadata's;
4. `insert into clara.firm_registration_payments(…) … on conflict (stripe_event_id) do nothing`.

Any failure of 1–3 writes a `stripe_event_problems` row with a named `problem` and applies
nothing; an event carrying an **unresolved** problem row is skipped on later sweeps. Returns
`{examined, applied, problems}`.

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

### 1.3 · `UNNUMBERED_checkout_gate_c` — the money → firm path

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
-- append-only except the ONE session_id stamp: a BEFORE UPDATE trigger permits a NULL→value
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
  consumed_at            timestamptz,       -- stamped by close_paid_registration, NOT by the minter
  consumed_admission     uuid references clara.firm_admissions(id),
  foreign key (registration_id, applicant)
    references clara.firm_registration_requests(id, applicant))
-- append-only except the consumption stamp, CHECKed the way
-- ck_firm_admissions_consumed_receipt_0017 guards its own: (consumed_at, consumed_admission) are
-- both null or both not null, and a consumed row is never un-consumed or re-pointed.
create unique index uq_frp_registration on clara.firm_registration_payments(registration_id);
-- M7: ONE payment row per registration. A second completed Checkout Session for the same
-- registration cannot be applied; the applier records it as a `duplicate_payment` problem row
-- instead, so a double charge is VISIBLE and refundable rather than silently accepted.

alter table clara.firm_admissions
  add column registration_id   uuid references clara.firm_registration_requests(id),
  add column bound_email       text,        -- 裁-26
  add column expires_at        timestamptz,
  add column superseded_at     timestamptz, -- rotation MARKS; nothing is ever deleted (裁-74)
  add column dpa_signature_id  uuid references clara.dpa_signatures(id);   -- M14
-- ONE LIVE token per registration at a time...
create unique index uq_firm_admissions_registration_live
  on clara.firm_admissions(registration_id)
  where registration_id is not null and consumed_at is null and superseded_at is null;
-- ...and only ONE can ever be consumed, which is what makes one firm per registration a
-- database property rather than a procedure.
create unique index uq_firm_admissions_registration_consumed
  on clara.firm_admissions(registration_id)
  where registration_id is not null and consumed_at is not null;
alter table clara.firm_admissions
  add constraint ck_firm_admissions_selfserve_bound
    check (registration_id is null or bound_email is not null),
  add constraint ck_firm_admissions_selfserve_dpa
    check (registration_id is null or dpa_signature_id is not null),
  add constraint ck_firm_admissions_not_both
    check (consumed_at is null or superseded_at is null);
```

The seed's and the fixtures' legacy admission rows carry NULL in all five new columns and stay
exactly as lawful as they are today (survey §3.1 measured 2 rows, 0 unconsumed): every new
constraint is conditioned on `registration_id is not null`.

**Why the composite foreign keys.** `(registration_id, applicant)` referencing `(id, applicant)`
makes "this payment belongs to this applicant's registration" a **database** fact: a row naming
registration A and applicant B cannot be written at all, so `claim_paid_admission`'s cross-caller
wall compares a value the schema already guarantees congruent rather than being a second,
independently-fallible check.

**`clara.claim_paid_admission(p_registration uuid, p_op_key text) → jsonb`** ·
grant `clara_authenticated` only. **This is the governed door 裁-73 names.**

| # | wall | refusal | errcode |
|---|---|---|---|
| W1 | authenticated | `no authenticated actor` | `CLR04` |
| W2 | known | `unknown actor` | `CLR04` |
| W3 | not the agent | `the agent identity cannot claim an admission` | `CLR04` |
| W4 | op_key | `op_key is required` | `CLR10` |
| W5 | the registration exists | `unknown registration request` | `CLR10` |
| W6 | **it is MINE** — `req.applicant = clara.jwt_sub()` | `not your registration request` | `CLR04` |
| W7 | not already completed — `req.firm_id is null` and `req.status='open'` | `this registration is no longer open (status: %)` | `CLR09` |
| W8 | a DPA signature at **the version pinned on this registration's intent** (M8) | `the data processing agreement is not signed` | `CLR09` |
| W9 | **a payment row exists for this registration** *(no consumption requirement — see below)* | `no completed payment for this registration` | `CLR09` |
| W10 | the caller carries an email claim | `a verified email claim is required` | `CLR04` |

Then, in one transaction, taking `select … from clara.firm_registration_requests where id =
p_registration for update` **first** — serializing concurrent callers exactly as
`approve_firm_registration` already does:

```
-- Rotation SUPERSEDES; it never deletes (裁-74, and the payment row may already point here).
update clara.firm_admissions set superseded_at = now()
  where registration_id = p_registration and consumed_at is null and superseded_at is null;
v_token := gen_random_uuid();
insert into clara.firm_admissions(token_hash, note, registration_id, bound_email,
                                  expires_at, dpa_signature_id)
  values (sha256(convert_to(v_token::text,'UTF8')), 'self-serve checkout admission',
          p_registration, clara._jwt_email(), now() + interval '1 hour', v_signature)
  returning id into v_admission;
return jsonb_build_object('admission_token', v_token, 'registration_id', p_registration,
                          'firm_name', req.firm_name, 'expires_at', …);
```

**THE PAYMENT IS NOT CONSUMED HERE.** `consumed_at` / `consumed_admission` are stamped by
`close_paid_registration`, when the firm demonstrably exists. This is the fix for the review's
BLOCKER-1, and it is worth stating what was wrong, because the first version of this document
inverted its own headline guarantee:

> **What was specified before, and why it stranded the customer.** W9 required an *unconsumed*
> payment while the body consumed it on the first call. The second call therefore refused
> `CLR09 no completed payment` — **rotation was unreachable on exactly the state the
> partial-failure table said rotation recovers.** What was written was option (a) wearing option
> (c)'s label. Two further faults rode along: the rotation DELETE would have violated
> `firm_registration_payments.consumed_admission`'s foreign key (NO ACTION — the reviewer probed
> a faithful toy of the DDL on a rig and got the constraint error), and the consumed-row CHECK
> forbids re-pointing, so even a repaired delete left the receipt pointing at a token nobody
> could see. **The stated safety argument was also wrong:** it claimed W7 refuses once
> `create_firm` has run, but between `create_firm` and `close_paid_registration` the registration
> still has `firm_id IS NULL` and `status='open'`, so W7 does *not* refuse in that window. W9
> did, which is the stranding.

**Rotation on replay, as now specified.** 裁-73 says the door "mints exactly one
`firm_admissions` row and returns its plaintext once". **Two live options remain** — the first is
recorded because it is what the previous specification accidentally implemented:

- **(a) refuse after the first call** — **the customer is stranded**: paid, no firm, no path.
- **(b) store the plaintext and return it on replay** — non-stranding, but it puts a live bearer
  credential **at rest**, exactly what 裁-16b removed from `firm_admissions` in `0147`.
- **(c) rotation, repaired** *(specified above)* — each call supersedes the live token and mints a
  fresh one. **"Exactly one"** is `uq_firm_admissions_registration_live` (one live at a time) plus
  `uq_firm_admissions_registration_consumed` (only one may ever be consumed, so only one firm can
  ever be born from a registration). **"Once"** holds: each token is returned by the one call that
  minted it and is never re-readable. **No plaintext is ever at rest, nothing is deleted, and the
  customer can always retry.**

**Why rotation is now genuinely reachable.** W9 no longer reads the consumption stamp, and W7
still refuses once `close_paid_registration` has stamped `firm_id`. In the window between
`create_firm` and the close, W7 and W9 both pass — and rotation there is *harmless*: the
`consumed_at is null` filter cannot touch the already-consumed admission, and
`uq_firm_admissions_registration_consumed` forbids a second consumed row. A caller who retries in
that window gets a fresh token that `create_firm` refuses with
`CLR10 actor already belongs to a firm` — the correct answer, because their firm already exists.

**The fold removes this whole class.** BLOCKER-1's stranding, M5's unreachable closer and M7's
double payment are three failure modes that exist *because* the journey is several doors across
several transactions. One door doing claim → create → close in one transaction has none of them.
**Gate question G1.**

**`clara.close_paid_registration(p_registration uuid, p_firm uuid, p_op_key text) → jsonb`** ·
grant `clara_authenticated`. Walls W1–W6 as above, plus: the firm exists; the caller is its
**owner**, read from `clara.firm_memberships` (never from a claim); and the registration's
consumed admission carries `consumed_result ->> 'firm_id' = p_firm`. It sets `status='approved'`,
`decided_at = now()`, `firm_id = p_firm`, **stamps the payment row's `consumed_at` /
`consumed_admission`**, and emits the two registered event types. Idempotent: a registration
already carrying this `firm_id` returns `{replay:true}`.

`decided_by` is left **NULL** on this path. Writing the applicant there would read as
self-approval — the act `approve_firm_registration` refuses by name — and on the self-serve road
*nobody decided*: **payment is the approval** (裁-73). The `firm_registration.paid` event carries
the payment's identity, which is the honest record of what authorised it. (NIT-5.)

**`clara.reconcile_paid_registrations(p_limit integer default 100) → jsonb`** ·
`SECURITY DEFINER`, granted to `clara_stripe_webhook`, run on the same one-minute sweep as the
applier. **This is the answer to the review's M5**, which measured that the previously-stated
recovery ("the sweep may also close it") could be executed by no principal at all: the sweep runs
as `clara_stripe_webhook`, while `close_paid_registration` is `clara_authenticated`-only and reads
`jwt_sub()`.

It closes any registration that is *demonstrably already a firm*, from facts on disk only: a
consumed admission whose `registration_id` is that registration and whose
`consumed_result ->> 'firm_id'` names a `clara.firms` row in which the registration's applicant
holds an **active owner** membership. It writes exactly what `close_paid_registration` writes.
**It takes no caller identity and grants nothing** — it cannot create a firm, mint an admission,
or close a registration whose firm does not already exist. It is a reconciler, not a second way
in.

> **Why this door exists.** Survey §2.1: `create_firm` does not touch
> `firm_registration_requests`. Without this door a self-serve firm leaves its registration
> `open` forever — the holding page keeps telling a firm owner their firm is not open, and
> `uq_firm_registration_requests_open_applicant` blocks any future registration by a person who
> legitimately leaves their firm. `approve_firm_registration` cannot be reused: it is
> operator-firm-walled and calls `_create_firm_core` itself.

**`clara.open_checkout_intent(p_registration uuid, p_origin_digest bytea, p_op_key text)
→ jsonb`** · grant `clara_authenticated`. Part 1 §4 is the rate-wall reasoning.

| # | wall | refusal | errcode |
|---|---|---|---|
| X1–X6 | as W1–W7 (authenticated · known · not the agent · op_key · exists · **mine** · still open) | *as above* | |
| X7 | the DPA is signed at the current version | `the data processing agreement is not signed` | `CLR09` |
| X8 | `p_origin_digest` is exactly 32 bytes | `an origin digest is required` | `CLR10` |
| X9 | **the rate wall** — no *other* applicant's registration from this digest in 24 h | `too many firm registrations from this location today` | `CLR09` |
| X10 | not already paid | `this registration is already paid` | `CLR09` |

On success it appends the `registration_rate_events` row **and** the `checkout_intents` row in
one transaction and returns `{intent_id, price_local_key, stripe_price_id}` — the price id read
from `stripe_object_map`, **so the route never names a price** and hard constraint 2 holds: the
browser computes no cents and Stripe renders its own Price.

**`clara.record_checkout_session(p_intent uuid, p_session_id text, p_op_key text) → jsonb`** —
stamps the one `session_id`; refuses `checkout session already recorded` (`CLR09`) on a re-stamp
with a different value; replays on the same value. **It carries the same ownership wall as every
other door here — `intent.applicant = clara.jwt_sub()`, else `CLR04 not your checkout intent`
(M2).** Without it any authenticated caller who guessed an unstamped intent's uuid could stamp it
with an arbitrary session id and brick it, since `session_id` is UNIQUE and the real stamp would
then refuse. A guessed uuid is a high bar, which is exactly why it is worth naming: *"the id is
unguessable"* is the bearer-credential pattern 裁-16b removed from this estate in `0147`, and it
is not a wall.

**Two new `clara.event_types` rows**, registered **in the same migration that emits them**
(survey F8 — `domain_events.event_type` is foreign-keyed to that registry and a trigger raises
`CLR10 unknown event_type %`): `firm.self_serve_created` and `firm_registration.paid`, both
`client_scoped = false`. Both are emitted by `close_paid_registration`, which is the earliest
moment `_append_event` can be called at all, because `domain_events.firm_id` is NOT NULL.

### 1.4 · `UNNUMBERED_checkout_gate_d` — the one D1 item

**`clara.create_firm` is re-cut.** Live tip `0147:497`; live `prosrc` sha12 `59fa533d9c03`
(survey §7 prediction 1). Two conjuncts are added immediately after the admission row is
selected `FOR UPDATE`; **nothing else in the body changes**, and the delta is proven by inverse
re-substitution back to the pinned pre-image:

```
-- 裁-26: an admission carrying an email binding is not a bearer credential.
if a.bound_email is not null and a.bound_email is distinct from clara._jwt_email() then
  raise exception 'invalid or consumed admission token' using errcode = 'CLR04';
end if;
if a.expires_at is not null and a.expires_at < now() then
  raise exception 'invalid or consumed admission token' using errcode = 'CLR04';
end if;
```

**The refusal text is deliberately identical to the existing one.** A distinct message would tell
a token holder *why* they failed, which is a bounded oracle on whose email a token belongs to.
The `audit_log` row records the discriminated reason; the caller does not.

`bound_email is not null` is the conditional that keeps every legacy row lawful. And because a
minter that *forgot* the binding would silently produce a bearer token this wall waves through,
the binding is enforced as a CHECK — `ck_firm_admissions_selfserve_bound` (§1.3) — **not as a
convention**.

### 1.5 · `op_receipts` is not used, deliberately

Survey F6: `op_receipts.firm_id` is NOT NULL with **no** FK onto `clara.firms`, so a sentinel
firm id would technically insert. **No door here may do that.** Every new pre-firm door takes
structural idempotency from its own table, as the three existing ones do; `close_paid_registration`
*could* use `_reserve_op` and does not, so all six share one idempotency story.

### 1.6 · The webhook's principal

A new NOLOGIN role `clara_stripe_webhook` plus a login member `clara_stripe_webhook_login` — the
estate's measured idiom (survey F11). Its **entire** grant surface:

| object | privilege |
|---|---|
| `clara.record_stripe_event(text,text,jsonb)` | EXECUTE |
| `clara.apply_stripe_events(integer)` | EXECUTE |
| **everything else** | **none** — no table grants, no other function, **no `BYPASSRLS`** |

The connection executes `set role clara_stripe_webhook` on checkout, as the runtime's pools
already do (`docs/ops/DR-render.md:204-205`).

**What a compromised webhook DSN can actually do, stated honestly (M11).** An earlier draft of
this section claimed such a credential "can append a Stripe event and run an applier that will
refuse to resolve its metadata". **That was wrong.** `record_stripe_event` performs no
authenticity check of its own — the signature check lives in the route, not the door — so anyone
holding the DSN who knows a real `(registration_id, applicant, intent_id, session_id)` tuple can
append an event the applier **will** resolve and apply. **Every customer knows their own tuple.**

**The honest statement is therefore: the webhook DSN is equivalent in power to the Stripe signing
secret.** Both let their holder assert "this registration is paid". Neither can create a firm,
mint an admission, close a registration or read a book — the grant is three functions and no
tables — so the blast radius is *a free firm at RM0, and a free subscription once amounts are
ruled*, not tenant compromise. It is held and rotated with the same care as
`STRIPE_WEBHOOK_SECRET`, and cell W-O2 pins this as a MUST-NOT-RED control so the threat model is
written down rather than assumed away.

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

## 2 · Everything else

The webhook route contract, the `apps/web` surfaces and the environment moved to **part 3**
([`checkout-gate-design-part3.md`](checkout-gate-design-part3.md)) when this file passed the
estate's 500-line document gate; the acceptance battery lives there too, rewritten in the fix
round after the independent review proved four of its mutants non-discriminating on a rig.

