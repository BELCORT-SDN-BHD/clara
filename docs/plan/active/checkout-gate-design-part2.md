# The checkout / signup gate — design of record, part 2

*Part 1 — the shape, the transport rule, the state machine, the CSRF-binding recommendation, the rate wall, the partial-failure analysis, the build sequence: [`checkout-gate-design.md`](checkout-gate-design.md).
Measurement: [`checkout-gate-survey.md`](checkout-gate-survey.md) · owner questions: [`checkout-gate-gate-record.md`](checkout-gate-gate-record.md).*

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
  id         uuid primary key default gen_random_uuid(),
  event_id   text not null references clara.stripe_events(event_id),
  problem    text not null,                 -- a fixed vocabulary, CHECKed
  detail     jsonb not null default '{}',
  noticed_at timestamptz not null default now())
-- append-only. An event the applier cannot apply is VISIBLE, never silently skipped.

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
nothing. Returns `{examined, applied, problems}`.

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
  consumed_at            timestamptz,
  consumed_admission     uuid references clara.firm_admissions(id),
  foreign key (registration_id, applicant)
    references clara.firm_registration_requests(id, applicant))
-- append-only except the consumption stamp, CHECKed exactly the way
-- ck_firm_admissions_consumed_receipt_0017 guards its own: (consumed_at, consumed_admission)
-- are both null or both not null, and a consumed row is never un-consumed or re-pointed.

alter table clara.firm_admissions
  add column registration_id uuid references clara.firm_registration_requests(id),
  add column bound_email     text,          -- 裁-26
  add column expires_at      timestamptz;
create unique index uq_firm_admissions_registration
  on clara.firm_admissions(registration_id) where registration_id is not null;
alter table clara.firm_admissions
  add constraint ck_firm_admissions_selfserve_bound
  check (registration_id is null or bound_email is not null);
```

The seed's and the fixtures' legacy admission rows carry NULL in all three columns and stay
exactly as lawful as they are today (survey §3.1 measured 2 rows, 0 unconsumed).

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
| W8 | the DPA is signed **at the current version** | `the data processing agreement is not signed` | `CLR09` |
| W9 | a payment row exists for this registration, **unconsumed** | `no completed payment for this registration` | `CLR09` |
| W10 | the caller carries an email claim | `a verified email claim is required` | `CLR04` |

Then, in one transaction, taking `select … from clara.firm_registration_requests where id =
p_registration for update` **first** — serializing concurrent callers exactly as
`approve_firm_registration` already does:

```
delete from clara.firm_admissions
  where registration_id = p_registration and consumed_at is null;      -- rotation, below
v_token := gen_random_uuid();
insert into clara.firm_admissions(token_hash, note, registration_id, bound_email, expires_at)
  values (sha256(convert_to(v_token::text,'UTF8')), 'self-serve checkout admission',
          p_registration, clara._jwt_email(), now() + interval '1 hour')
  returning id into v_admission;
update clara.firm_registration_payments
   set consumed_at = now(), consumed_admission = v_admission
 where registration_id = p_registration and consumed_at is null;
return jsonb_build_object('admission_token', v_token, 'registration_id', p_registration,
                          'firm_name', req.firm_name, 'expires_at', …);
```

**Rotation on replay, and why.** 裁-73 says the door "mints exactly one `firm_admissions` row and
returns its plaintext once". Three readings are possible and they are **not** equivalent. This
design takes the third; **gate question G1 puts the choice to the owner.**

- **(a) Refuse every call after the first.** If the browser dies between ⑧'s two RPCs, the
  customer has paid, holds a consumed payment row and an unusable token, and **no path exists to
  a firm** — the exact stranding the order forbids.
- **(b) Store the plaintext in a receipt and return it again.** Non-stranding, but it puts a live
  bearer credential **at rest** in the database, which is precisely what 裁-16b removed from
  `firm_admissions` in `0147`.
- **(c) Rotation — every call mints a fresh admission and invalidates the previous unconsumed
  one.** "Exactly one" holds as a *database* property (`uq_firm_admissions_registration`); "its
  plaintext once" holds because each token is returned on the one call that minted it and is
  never re-readable; **no plaintext is ever at rest**; and the customer can always retry. Two
  firms stay impossible regardless of how many tokens were minted, because `_create_firm_core`
  refuses the second on `uq_membership_active_user`.

The delete-then-insert is safe under W7: once `create_firm` has consumed an admission and
`close_paid_registration` has stamped `firm_id`, W7 refuses and no rotation can occur.

**`clara.close_paid_registration(p_registration uuid, p_firm uuid, p_op_key text) → jsonb`** ·
grant `clara_authenticated`. Walls W1–W6 as above, plus: the firm exists; the caller is its
**owner**, read from `clara.firm_memberships` (never from a claim); and the registration's
admission is the one that firm's creation consumed. Sets `status='approved'`,
`decided_by = the applicant`, `decided_at = now()`, `firm_id = p_firm`, and emits the two
registered event types below. Idempotent: a registration already carrying this `firm_id` returns
`{replay:true}`.

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
with a different value; replays on the same value.

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
already do (`docs/ops/DR-render.md:204-205`). **A compromised webhook credential can append a
Stripe event and run an applier that will refuse to resolve its metadata. It cannot create a
firm, mint an admission, or read one book.**

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

## 2 · The webhook route contract

**Home: `packages/runtime`, mounted BEFORE `express.json()`.** Survey §6 is the reason: the
runtime already holds privileged DSNs from the environment, while `apps/web` holds no service
credential at all and its own `build` proves the public env slot is publishable-class
(`apps/web/scripts/check-public-key.mjs`). *(Gate question G3 offers the owner the `apps/web` alternative
with its costs.)*

**The mechanical constraint is measured, not assumed.**
`app.use(express.json({ limit: "1mb" }))` sits at `packages/runtime/src/index.ts:55`, and
`intakeRoutes()` is mounted at `:53` precisely so no middleware can consume its body — the
comment at `:51-53` says so. **`stripeWebhookRoutes()` mounts in that same place, before line
55.** A router mounted after it is *silently* broken: the raw bytes are gone and
`Webhook.constructEvent` cannot verify a signature over a re-serialized body.

`POST /webhooks/stripe`:

1. Read the body as **raw bytes** — `express.raw({ type: 'application/json', limit: '1mb' })` on
   this route only. Over the limit → `413`.
2. `stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'],
   process.env.STRIPE_WEBHOOK_SECRET)`.
3. **On any throw — bad signature, absent header, stale timestamp — respond `400` and call NO
   door.** Nothing containing the payload is logged. This is cell W-A.
4. On success: `select clara.record_stripe_event($1,$2,$3)` with
   `(event.id, event.type, event as jsonb)`. **Respond `200` as soon as that returns**, whatever
   happens next — Stripe retries on a non-2xx, and an applier failure must not cause a
   redelivery storm.
5. Then, best-effort and outside the response path, `select clara.apply_stripe_events(100)`. Its
   failure is logged and swallowed **because step 6 is the real guarantee**, not because the
   error does not matter.
6. A periodic sweep on the runtime's existing reconciler cadence calls `apply_stripe_events()`
   every minute. **This is what makes step 5 optional and what recovers a webhook that arrived
   while the database was unavailable.**

**Event types.** `checkout.session.completed` is the only type the applier acts on at beta. Every
other type is still **recorded** — the store is the record — and applied by nothing; billing
Annex C.2's `invoice.paid` / `invoice.payment_failed` appliers arrive with PR-2's invoices, and
裁-58 means nothing invoices at RM0 today.

**The route has no session, no cookie and no user.** It is not in `apps/web`'s proxy path, it
issues no redirect, and it is the only surface in this train not called by a browser.

## 3 · The `apps/web` surfaces

**Every server-side entry below is a route.ts HTTP-method export; none is a `"use server"` Server
Action** — part 1 §1.1 has the reason (the census enumerates only `page.*`/`route.*` leaves, so an
action file is invisible to it); cell W-R pins it.

| route | what changes |
|---|---|
| /auth/confirm + /auth/confirm/verify | `code` replaces `token_hash`; `exchangeCodeForSession` replaces `verifyOtp`; `proveSameOrigin` is kept **verbatim** (part 1 §3.2). **`Referrer-Policy` on this page must be `strict-origin`, never `no-referrer`** — FS-2's NEW-A: `no-referrer` makes real browsers send `Origin: null` on the form POST, which this wall 403s. **`Origin: null` is never accepted.** |
| `/signup` step 2 | gains the DPA step: the text is fetched server-side from `dpa_documents` (body + sha), rendered, and `sign_dpa` is called with the sha the person was shown. The existing `NotBuiltNote` is **removed because the thing it names now exists** |
| `POST /checkout` (new, server-only) | reads the trusted client-IP header → digest → `open_checkout_intent` → creates the Stripe Checkout Session in **subscription mode** at the zero-amount price id the door returned, with `metadata: {clara_registration_id, clara_applicant, clara_intent_id}` → `record_checkout_session` → 303 to Stripe |
| /checkout/success (new, server-only route) | `claim_paid_admission` → `create_firm` → `close_paid_registration` → redirect to the firm home. Every refusal renders verbatim; **no optimistic UI** |
| `/pending` | the three new arms of part 1 §2.1 |

The Stripe **secret** key is used only by the server-only checkout route and the runtime; it is
never bundled. Doors are called with the caller's own session token over PostgREST RPC
(`apps/web/lib/doors.ts:86`), so every door sees `jwt_sub()` = the person — never a service
identity.

---

## 4 · Environment — and not one key in this document

| variable | set where | what it is |
|---|---|---|
| `STRIPE_SECRET_KEY` | runtime env (Fly secrets) + the checkout route's env | TEST-mode restricted key until the launch sitting (裁-81/87) |
| `STRIPE_WEBHOOK_SECRET` | runtime env | the endpoint's signing secret, from the endpoint object 裁-87 creates |
| `CLARA_STRIPE_WEBHOOK_DATABASE_URL` | runtime env | the `clara_stripe_webhook_login` DSN (§1.6) |
| `CLARA_RATE_WALL_PEPPER` | runtime env | part 1 §4 option B only |
| `CLARA_TRUSTED_CLIENT_IP_HEADER` | runtime env | the one header the courier reads; **absent ⇒ checkout refuses** |
| `CLARA_PUBLIC_ORIGINS` | already exists | the same-origin allowlist; fail-closed when unset |
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` | already exist | publishable class, proven by `apps/web/scripts/check-public-key.mjs` |

**No value appears in this repository, in any argv, or in any of the four documents of this
gate.** Secrets move env-to-env and are never printed (constraints 4 and 14).

**The Stripe objects (裁-87).** The orchestrating session's Stripe connector creates, in TEST
mode, **from DB rows**: one `Product` per plan line kind, one recurring **licensed** MYR `Price`
at zero amount for the beta plan, and the webhook endpoint. Every id is written into
`clara.stripe_object_map` by a mirror script; **the lane's code reads them and never authors
them** (裁-42, billing design §3.11). Which DB rows they are generated from is **gate question
G2** — `billing_plans` does not exist yet (survey §4).

---

## 5 · The acceptance battery — every wall, both polarities, RED-before

Each cell names its **mutant**: the change to the shipping code that must turn that cell red. A
cell whose mutant does not redden it is not evidence — and the mutant must land where the
mechanism actually decides, not merely somewhere in the file.

| # | wall | REFUSE cell | POSITIVE control | mutant |
|---|---|---|---|---|
| **W-A** | webhook signature | a forged or absent `stripe-signature` → **400**, and **`record_stripe_event` was never called** — asserted by a spy, **not** by the empty table, because an empty table is also what a call that inserted nothing looks like | a correctly signed event → 200, one row | delete the `constructEvent` try/catch |
| **W-B** | webhook replay | the same `event.id` twice → **exactly one** `stripe_events` row and **exactly one** payment row | two different ids for two registrations → two of each | `on conflict do nothing` → a plain insert |
| **W-C** | raw body | a real signed payload through a router mounted **after** `index.ts:55` → verification fails | the same payload mounted before it → verifies | move the mount below line 55 |
| **W-D** | cross-caller | caller B claims caller A's paid registration → `CLR04 not your registration request`, **and A's payment row is still unconsumed afterwards** | A claims it → a token | delete W6 |
| **W-E** | consumed admission | `create_firm` with an already-consumed token and a **different** op_key → `CLR04`; with the **same** op_key → the stored result, not a second firm | a fresh token → the firm | delete the `consumed_at` branch |
| **W-F** | 裁-26 email binding | an admission bound to `a@x` presented by a session whose `_jwt_email()` is `b@x` → `CLR04` | the bound email's own session → the firm | delete the `bound_email` conjunct |
| **W-F2** | the minter cannot forget it | insert a `registration_id`-carrying admission with `bound_email` NULL → the CHECK refuses | a bound one inserts | drop `ck_firm_admissions_selfserve_bound` |
| **W-G** | `Origin: null` | POST /auth/confirm/verify with `Origin: null` → **403** | the same POST from the deployment's own origin → 303 | make `proveSameOrigin` return `{ok:true}` on an unparseable origin |
| **W-H** | **the browser binding** | a `code` minted in browser context **A**, POSTed from a fresh context **B** with no verifier cookie → the exchange fails and **no session cookie is written to B** — asserted on the response's `Set-Cookie`, not on the redirect target | the same `code` POSTed from **A** → a session, 303 to `/signup` | replace `exchangeCodeForSession` with `verifyOtp` |
| **W-I** | DPA unsigned | `open_checkout_intent` with no signature → `CLR09`; **and `claim_paid_admission` likewise**, so a payment that somehow got through still cannot buy a firm | signed at the current version → both proceed | delete W8 / X7 |
| **W-I2** | DPA text integrity | `sign_dpa` with a `body_sha256` that is not the current document's → `CLR10` | the matching sha → recorded | delete the sha comparison |
| **W-J** | the rate wall, **both polarities** | a **second applicant** from the same digest within 24 h → `CLR09` | (a) a different digest → proceeds; (b) **the same applicant retrying their own registration → proceeds** | invert the "other applicants" predicate |
| **W-K** | one firm per registration | force two claim+create sequences on one registration → the second refuses, and `firm_admissions` holds exactly one row for it | one sequence → one firm | drop `uq_firm_admissions_registration` |
| **W-L** | one firm per person (and rate-wall limb ①) | a person with an active membership calls `create_firm` with a valid token → `CLR10 actor already belongs to a firm`, **and the token is still unconsumed** | a person with none → the firm | delete `_create_firm_core`'s membership check |
| **W-M** | the applier resolves or complains | an event whose `metadata.clara_registration_id` names nothing → **zero** payment rows and **one** `stripe_event_problems` row | resolving metadata → one payment, zero problems | make the applier `continue` silently |
| **W-N** | the applier cross-checks the intent | a signed event naming registration A but carrying A's *other* intent's session id, or a disagreeing applicant → a problem row, no payment | matching → applied | delete the intent cross-check |
| **W-O** | the webhook role's blast radius | `clara_stripe_webhook` attempts `create_firm`, `claim_paid_admission` and `select … from clara.firms` → **permission denied** on all three | it may EXECUTE exactly the two functions in §1.6 | grant it `clara_authenticated` |
| **W-P** | registration closure | after ⑧ the registration carries `status='approved'` and the firm id, and the holding page **redirects** instead of saying "not open yet" | — | delete the `close_paid_registration` call |
| **W-Q** | the intermediate page is not an open redirect (part 1 §3.2b step 2) | a confirmation-URL parameter whose origin is **not** the project's Supabase URL → the page renders `status=invalid` and **no link to it** | the project's own confirmation URL → the button renders | compare only the path, or only a suffix, instead of the origin |
| **W-R** | the transport rule (part 1 §1.1) | a whole-tree read of `apps/web` finds **zero** `"use server"` occurrences and **zero** `template.tsx` — a POSITIVE count assertion, since the scope census cannot see either | every server entry this train adds is reachable as a route.ts HTTP-method export the census **does** enumerate | add a `"use server"` file and watch this cell — not the 1253-test suite — go red |

**Non-wall cells the battery also owes.**

1. **`clara.event_types` gains exactly two rows**, and the registry's coverage is proven whole
   both before and after — the estate's registration discipline, not a count.
2. **A positive set equality, not an absence** (billing Annex D's T.2 discipline): the set of
   `clara` functions whose body text references `stripe_events` or `firm_registration_payments`
   equals exactly `{record_stripe_event, apply_stripe_events, claim_paid_admission,
   close_paid_registration}`, measured in **both** directions.
3. **`create_firm`'s recut delta** is proven by inverse re-substitution back to the pinned
   pre-image sha `59fa533d9c03`, with its `proacl`, owner, `search_path` and `SECURITY DEFINER`
   posture re-asserted unmoved.
4. **No `clara` role holds `BYPASSRLS` after this train** — a whole-roster read, not a check of
   the new role alone.
5. Every new table is read from the catalog as **RLS enabled AND forced with zero application
   role grants**, by property.

**The e2e (裁-86, orders §A step 2).** `pnpm --filter @clara/web build` → `next start` →
Playwright on the **built** app against a throwaway test firm (ADR-0075), axe riding the walk:
signup → confirm **in the initiating browser context** → `claim_identity` +
`request_firm_registration` → sign the DPA → checkout in Stripe TEST with a test card → the
webhook → the firm born → the firm home. **Plus the negative arm in a second browser context**
(W-H's refuse cell) — *that* is the leg which proves the binding; the happy path alone would pass
just as well with the hole open. The suite lands under apps/web/e2e/, which FS-2 creates.

**The instrument traps this train inherits.** A `fetch` from a test is not a browser; a `curl`
with a forged `Origin` is not the browser; the check runs against the built app, never
`next dev`. The sibling recorded with the CSRF finding — the e2e mock cannot prove single-use
replay — is closed by making the mock **consume** the token and adding a second-POST cell.
