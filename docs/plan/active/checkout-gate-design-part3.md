# The checkout / signup gate — design of record, part 3

*Part 1 — the shape, the transport rule, the state machine, the CSRF binding, the rate wall, the
partial-failure analysis, the build sequence: [`checkout-gate-design.md`](checkout-gate-design.md).
Part 2 — the database objects:
[`checkout-gate-design-part2.md`](checkout-gate-design-part2.md). Owner questions:
[`checkout-gate-gate-record.md`](checkout-gate-gate-record.md).*

**This part carries the webhook contract, the surfaces, the environment and the acceptance
battery.** **v3, 2026-08-31** — amended to 裁-89's fold: W-D/W-K/W-P rewrite against the folded
door, W-E/W-E2/W-F/W-F2/W-F3/W-P2 retire with their subjects and W-E3 is added to keep that
honest (§4.3). **v2** had rewritten the battery after the review proved four of its mutants
**non-discriminating on a rig**. Each cell now names a mutant that lands where
the mechanism actually decides, and where one mutant cannot discriminate the cell carries a
**panel** with a MUST-NOT-RED control. A cell whose mutant does not redden it is not evidence, and
a non-discriminating mutant fails both ways — **the false PASS is the expensive one.**

## 1 · The webhook route contract

**Home: `packages/runtime`, mounted BEFORE `express.json()`.**

**The reason, corrected (M3).** An earlier draft said `apps/web` "references no service credential
at all". **This design's own §4 falsifies that** — it gives `apps/web` the `STRIPE_SECRET_KEY` for
the checkout route. The two honest reasons are (i) **the raw-body constraint**, measured below,
for which the estate already has a precedent; and (ii) **not adding a DATABASE credential to the
browser-facing app**, which is a sharper and more defensible property than "no secrets at all".
`apps/web` keeps holding zero database credentials, and its `build` still proves the one public
env slot is publishable-class (`apps/web/scripts/check-public-key.mjs`). *(Gate question G3 carries
the alternative and its cost.)*

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

## 2 · The `apps/web` surfaces

**This train adds exactly three server entries, and each is a route.ts HTTP-method export; none is
a `"use server"` Server Action** — part 1 §1.1 names which steps are server-side and why (a route
leaf is forced to declare itself in `SCOPE_UNSCOPED_SURFACES`; an action file is forced to declare
nothing), and cell W-R §4.2 pins it. **Two rows below are client-side and W-R does not apply to
them** — they are marked.

| route | what changes |
|---|---|
| /auth/confirm + /auth/confirm/verify **(裁-92)** | the GET becomes a **code-entry form** (address + six digits, the address typed or read from this browser's own signup state — **never from a URL parameter**, part 1 §3.3). The POST keeps its shape and changes its input: `proveSameOrigin` **verbatim**, then the C1/C2 attempt wall through the runtime (§2.1), then `verifyOtp({email, token, type:'signup'})`, then seal. `hasVerifiedSession` unchanged. **`Referrer-Policy` on this page must be `strict-origin`, never `no-referrer`** — FS-2's NEW-A: `no-referrer` makes real browsers send `Origin: null` on the form POST, which this wall 403s. **`Origin: null` is never accepted.** |
| `/signup` step 2 **(client door call)** | gains the DPA step. The text is **read** by a server component from `dpa_documents` (body + sha) and passed down as props; **`sign_dpa` is then called from the client over PostgREST, exactly as step ③ already calls `claim_identity` and `request_firm_registration`** — `signup-firm-form.tsx` is `"use client"` and uses `callDoor`. **This is a decision, not an omission:** an unnamed server-side step under a no-Server-Actions heading is where a build lane reaches for an action. `sign_dpa` is a governed door, the caller is the person, and the client-RPC pattern is already built and reviewed. If a later lane needs it server-side, it adds POST /signup/dpa as a route handler and registers it — never an action. The sha submitted is the one the person was shown. The existing `NotBuiltNote` is **removed because the thing it names now exists**. **Under 裁-90 the beta row SHIPS**, so the step renders the delegated text with an honest placeholder note — *"this is Clara's beta data-processing agreement, pending review by the owner's lawyer before launch"* — wording that says review is **owed**, never that it happened. **The fail-closed successor still stands and is structural, not a default:** `sign_dpa` refuses `unknown dpa version` and `that dpa version is not current`, so an absent or fully-superseded table still refuses X7 → no checkout → no firm. With no current row the step renders a `NotBuiltNote` and the checkout control is **absent, not disabled-looking**: nothing may imply a signature was recorded when none was (NIT-8) |
| POST /checkout (new, server-only) | reads the trusted client-IP header → digest → `open_checkout_intent` → creates the Stripe Checkout Session in **subscription mode** at the zero-amount price id the door returned, with **`payment_method_collection` read from the plan row** — `'if_required'` while the plan's amount is 0, `'always'` once 裁-28's amounts are ruled. **裁-88's configurability rule is the law here, and G13 (test-mode beta) is why it bites now rather than later — this is config-driven, not the flat `'always'` v2 pinned:** at RM0 a real beta customer would otherwise be asked for a card in TEST mode, i.e. a test card, to open a real firm. The value is a column on the plan row the Session is built from (the billing brief's configurability law), so it flips at the pricing sitting with no code change; Wave G still exercises the `'always'` arm against a non-zero test price and `metadata: {clara_registration_id, clara_applicant, clara_intent_id}` → `record_checkout_session` → 303 to Stripe |
| /checkout/success (new) | **Stripe's `success_url` is a top-level navigation, so this arrives as a GET.** The GET is therefore **paint-only** — it renders "your payment went through; open your firm" with an explicit button — and a sibling route.ts POST calls **one door**, `claim_paid_firm` (裁-89), which claims, creates and closes in a single transaction, then redirects to the firm home. **This is the same GET-is-inert discipline the confirm page already has, applied to the route that CREATES THE FIRM** (M9); the first draft applied it to the confirmation and not here. Every refusal renders verbatim; **no optimistic UI**. The firm name is read **inside the door** from `firm_registration_requests.firm_name` — **the registration is the authority, and no name crosses the wire at all**, never a form field re-typed on the success page (NIT-6) |
| `/pending` | the three new arms of part 1 §2.1 |

The Stripe **secret** key is used only by the server-only checkout route and the runtime; it is
never bundled. Doors are called with the caller's own session token over PostgREST RPC
(`apps/web/lib/doors.ts:86`), so every door sees `jwt_sub()` = the person — never a service
identity.

### 2.1 · The confirmation attempt wall (裁-92 · 裁-36 · 裁-64①)

A six-digit code is guessable, so the walls part 1 §3.4 names need objects. **The caller has no
session yet** — they are confirming in order to get one — so these doors are not
`clara_authenticated`; they are reached by the runtime on `apps/web`'s behalf (part 1 §3.5), under a
new NOLOGIN role `clara_auth_wall` + `clara_auth_wall_login` on the estate's measured idiom, granted
EXECUTE on **exactly the two verbs below and nothing else**.

```
clara.confirmation_attempts(
  id            uuid primary key default gen_random_uuid(),
  email_digest  bytea not null,             -- sha256(pepper ‖ lower(email)) -- NOT the address
  origin_digest bytea not null,             -- the same digest the rate wall uses (part 1 §4 opt B)
  outcome       text,                       -- null until settled: 'accepted' | 'rejected'
  attempted_at  timestamptz not null default now(),
  settled_at    timestamptz,
  constraint ck_confirmation_attempt_outcome
    check ((outcome is null and settled_at is null)
        or (outcome in ('accepted','rejected') and settled_at is not null)))
-- append-only except the ONE settle stamp; indexes on (email_digest, attempted_at desc) and
-- (origin_digest, attempted_at desc).
-- 裁-91's posture applied here too: the ADDRESS never lands, only its peppered digest.
```

**`clara.claim_confirmation_attempt(p_email_digest bytea, p_origin_digest bytea) → jsonb`** —
appends the attempt row **first**, then evaluates C1 and C2 over the preceding window.

**As-built correction (NIT8, #493 opus review): C1/C2 do not `raise` — they return.** The digest
CHECK below is the only limb of this door that raises an exception; C1 and C2 are read from the
attempt row's own evidence and reported back as data (`allowed:false`, plus `scope` and
`retry_after_seconds` below), never thrown, because the caller still needs a live `attempt_id` and
a wait to render even on refusal — an exception would have nothing to attach either to. The table
below names which wall a given refusal came from, not a literal error the door raises for it:

| # | wall | as-reported when it fires | (only the digest-shape limb raises) |
|---|---|---|---|
| C1 | ≤ 5 rejected attempts per **email digest** per 15 minutes | `allowed:false, scope:'email'` | — |
| C2 | ≤ 5 rejected attempts per **origin digest** per 15 minutes | `allowed:false, scope:'origin'` | — |
| — | both digests are exactly 32 bytes | — | `a digest is required`, `CLR10` |

**Returns `{attempt_id, allowed, remaining, scope, retry_after_seconds}`** (`scope`/
`retry_after_seconds` folded in at 裁-103, #488's seam review — the original `{attempt_id,
allowed, remaining}` left the caller to infer WHICH wall fired from an errcode or message string,
exactly the law-3 trap, and gave no DB-owned wait at all).

- **`remaining`** is attempts remaining **after this one** — the card renders once this guess has
  already been spent, so the last allowed attempt (the 5th) reports `0`, never `1` (F5, #493 opus
  review: an earlier build reported "attempts remaining before this one," which showed a nonzero
  count to a caller who in fact had none left).
- **`scope`** is `null` on the allowed path; `'email'` or `'origin'` on refusal, naming which wall
  fired. `'email'` takes precedence when both limbs are simultaneously over threshold, matching
  this table's own C1-then-C2 ordering. (F2, #493 opus review: the door's token is `'email'`, not
  `'address'` as an earlier seam draft assumed — `'email'` matches this table's own column and the
  `email_digest` name; the seam's union is trued to match the door, not the reverse.)
- **`retry_after_seconds`** is `null` on the allowed path; on refusal, the whole seconds until
  enough of the counted attempts age out of the 15-minute window to admit a retry — derived from
  attempt timestamps the DB already owns (hard constraint 2). Its range is `(0, 900]` — **inclusive
  of exactly 900**, not strictly less: the value rounds a fractional wait UP to the next whole
  second, and when the true wait is already an exact 900-second boundary that rounds to 900 itself,
  never higher. A UI clamp on the displayed wait must therefore treat `900` as a real, reachable
  value, not an overflow.

**The row is written BEFORE the verification, not after, and that ordering is the wall.** If the
attempt were recorded on the way back, an attacker would abort the request after each failed guess
and never be counted. **A killed connection must still cost an attempt.**

**`clara.settle_confirmation_attempt(p_attempt uuid, p_outcome text) → jsonb`** — stamps the one
outcome; refuses a re-settle. An attempt that is never settled stays `outcome IS NULL` and **counts
against C1/C2 as if rejected**, which is the fail-closed reading.

**C2 is why C1 is not enough.** A per-address lock bounds an attacker hammering one victim; it does
nothing against one guess sprayed across ten thousand addresses, which at 10⁻⁶ per guess is a real
expected yield at scale. Keying the same window on the origin is what closes that shape.

---

## 3 · Environment — and not one key in this document

| variable | set where | what it is |
|---|---|---|
| `STRIPE_SECRET_KEY` | **`apps/web`** (the checkout route) **and** the runtime | TEST-mode restricted key until the launch sitting (裁-81/87) |
| `STRIPE_WEBHOOK_SECRET` | runtime env | the endpoint's signing secret, from the endpoint object 裁-87 creates |
| `CLARA_STRIPE_WEBHOOK_DATABASE_URL` | runtime env | the `clara_stripe_webhook_login` DSN (§1.6) |
| `CLARA_RATE_WALL_PEPPER` | **`apps/web`** | part 1 §4 option B only. **M3: it sits with its READER.** The digest is computed by the checkout route, which lives in `apps/web`; an earlier draft assigned this to the runtime, where nothing reads it, so as written the courier could not have computed a digest at all |
| `CLARA_TRUSTED_CLIENT_IP_HEADER` | **`apps/web`** | the one header the courier reads; **absent ⇒ checkout refuses** |
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

---

## 4 · The walls

| # | wall | REFUSE cell | POSITIVE control | mutant |
|---|---|---|---|---|
| **W-A1** | webhook signature → 400 | forged or absent `stripe-signature` → **400** | a correctly signed event → 200 | delete the `constructEvent` try/catch → the throw escapes as **500**, so this cell reddens on status |
| **W-A2** | webhook signature → **no door call** | the same forged request: `record_stripe_event` **was not called**, asserted by a spy | signed → the spy sees exactly one call | **its own mutant:** call `record_stripe_event` *before* verification. W-A1's mutant leaves this limb unexercised, which is why the two are separate cells |
| **W-B** | webhook replay | the same `event.id` twice → **exactly one** `stripe_events` row, **exactly one** payment row, **and the second call returns `recorded:false`** | two different ids → two of each, both `recorded:true` | `on conflict do nothing` → a plain insert. **The return-value assertion is load-bearing:** the mutant makes the second call *raise*, so row counts alone are unchanged and the cell would stay green |
| **W-C** | raw body | a real signed payload through a router mounted **after** `index.ts:55` → verification fails | the same payload mounted before it → verifies | **no discriminating mutant exists** — the refuse arm and the mutant are the same edit. **The positive control is the whole cell**; it is recorded as a control, not as a mutant panel |
| **W-D** | cross-caller | caller B calls `claim_paid_firm` on caller A's paid registration → `CLR04 not your registration request`, **and A's payment row is untouched and A's firm does not exist** | A calls it → the firm | delete W6 |
| ~~W-E · W-E2 · W-F · W-F2 · W-F3~~ | **RETIRED by 裁-89** — every one of them tested the `create_firm` recut or a `firm_admissions` column this train no longer adds. **They retire because their subject does, not because they were satisfied**: there is no token to consume, supersede or bind, and no recut to regress. `create_firm`'s pre-existing behaviour is not this train's to test. See §4.3 | | | |
| **W-E3** | **`firm_admissions` is untouched** — the positive form of the five retirements above | after the whole battery runs, `clara.firm_admissions` has the **same column set, the same two indexes and the same row count** as a freshly seeded rig | — | add any column to `firm_admissions` in this train's migrations |
| **W-G** | `Origin: null` | POST the verify route with `Origin: null` → **403** | the deployment's own origin → 303 | make `proveSameOrigin` return `{ok:true}` on an unparseable origin |
| **W-H2b** | **the address wall, as a DERIVED tripwire** (NIT-1) — W-H covers today's surface; this covers the surface a future lane adds | over **every module under the confirm surface**, derived rather than listed, assert that none reads the address from `searchParams`, `params`, or a route segment — using the shared oracle's `stripComments`, the same machinery W-R's roster uses | the surface as built passes | add a page that pre-fills the address from `searchParams` — the lane that does this will not have read §3.3, which is the whole reason the tripwire is derived rather than a review note |
| **W-H** | **the address never comes from a URL** (part 1 §3.3 — the wall that keeps the code bound to its owner) | load the confirm page with the address supplied as a **query parameter** and a valid code for THAT address → the form does not pre-fill it and the POST does not accept it; **no session is written** (asserted on `Set-Cookie`) | the address typed by the person, or read from this browser's own signup state → a session, 303 | make the page read the address from `searchParams` — the realistic wrong implementation, and the one that would restore the whole login-CSRF class in a worse form |
| **W-H2** | the three refusals are **distinguishable** | a wrong code, an expired code and a C1/C2 lockout each render **their own card**, the lockout one carrying the wait | a correct code inside the window → a session | collapse them into one generic invalid state |
| **W-H3** | **C1 · attempts per address** | 6 rejected codes for one email digest inside the window → the 6th refuses `CLR09 too many confirmation attempts`, **and the refusal happens before `verifyOtp` is called** (asserted by a spy, not by the outcome) | 5 rejects then the correct code → a session | raise the ceiling, or move the attempt append to AFTER the verification |
| **W-H4** | **C2 · attempts per origin** | one guess each against 6 different addresses from one origin digest → the 6th refuses `CLR09 too many confirmation attempts from this location` | the same 6 from 6 different origin digests → each proceeds | drop the origin limb, keeping only C1 — **the mutant that proves C1 alone is not enough** |
| **W-H5** | the attempt is counted even if the caller vanishes | claim an attempt, then abandon the request without settling → the row persists with `outcome IS NULL` **and counts against C1/C2** | a settled `accepted` attempt does not count against the window | make an unsettled attempt not count |
| **W-H6** | **C3 · single use** *(the platform's wall, named as such)* | POST the same correct code twice → the second mints **no** second session | the first → a session | — **a MUST-NOT-RED control**: it records that single-use is Supabase's property, not ours, so nobody later claims this design enforces it |
| **W-I** | DPA unsigned | `open_checkout_intent` with no signature → `CLR09`; **and `claim_paid_firm` likewise**, so a payment that somehow arrived still cannot buy a firm | signed at the intent's own version → both proceed | delete W8 / X7 |
| **W-I2** | DPA text integrity | `sign_dpa` with a `body_sha256` that is not the document's → `CLR10` | the matching sha → recorded | delete the sha comparison |
| **W-I3** | a DPA supersede does not strand a mid-flow customer (M8) | supersede the version after the intent opened → `claim_paid_firm` **still succeeds**, because W8 reads `checkout_intents.dpa_version` through the payment's own session id | a signature for a *different* version → refuse | bind W8 to the CURRENT version instead of the intent's |
| **W-J** | the rate wall, **both polarities** | a **second applicant** from the same digest within 24 h → `CLR09` | (a) a different digest → proceeds; (b) **the same applicant retrying → proceeds** | invert the "other applicants" predicate |
| **W-K** | **what the `FOR UPDATE` actually buys** — see §4.4, because "the lock is the wall" was measured FALSE | two concurrent `claim_paid_firm` calls on one registration → the loser's refusal is **exactly `CLR09` (W7's typed refusal)**, and the loser's re-read under the lock **saw `firm_id` ALREADY SET** | one call → one firm | **remove the `FOR UPDATE`**: the loser's read then sees `firm_id` NULL and its refusal arrives as `CLR10 actor already belongs to a firm` — semantically wrong for "someone already opened your firm". **Only these two limbs discriminate**; the one-firm limbs do not (§4.4) |
| **W-L** | **one firm per person** — see the panel below | | | |
| **W-M** | the applier resolves or complains | metadata naming nothing → **zero** payment rows and **one** `stripe_event_problems` row | resolving metadata → one payment, zero problems | make the applier `continue` silently |
| **W-N** | the applier cross-checks the intent | a signed event naming registration A but carrying A's *other* intent's session id, or a disagreeing applicant → a problem row, no payment | matching → applied | delete the intent cross-check |
| **W-M2** | a problem row does not exclude an event forever (M4) | resolve the problem row → the next sweep applies the event | an unresolved problem → still skipped | make the applier read the table without the `resolved_at is null` filter |
| **W-O** | the webhook role's blast radius | `clara_stripe_webhook` attempts `create_firm`, `claim_paid_firm` and `select … from clara.firms` → **permission denied** on all three | it may EXECUTE **exactly the two** functions in part 2 §1.6 — asserted as a set equality over its grants, not a spot check | grant it `clara_authenticated` |
| **W-O2** | **what the webhook DSN CAN do, stated honestly** (M11) | holding the DSN, forge a `checkout.session.completed` naming a real `(registration, applicant, intent, session)` tuple → **the applier applies it.** The cell asserts this *is* the behaviour, so the threat model is written down rather than assumed away | — | **a MUST-NOT-RED control**: it pins the measured truth that the webhook DSN is equivalent in power to the signing secret |
| **W-P** | registration closure is **atomic with creation** | abort the transaction after `_create_firm_core` returns → **neither** the firm nor the closure survives; the registration is still `open` with `firm_id` NULL, and a re-call completes normally | the uninterrupted call leaves `status='approved'` + `firm_id` set | move the closure UPDATE into its own transaction — the cell then finds a firm with an open registration, which is exactly the state 裁-89 makes unreachable. **Only the on-disk state discriminates**; the holding page's redirect does NOT redden, because `holdingStateFrom` returns `{kind:"member"}` from `caller_context` before it reads any registration row (NIT-4) |
| ~~W-P2~~ | **RETIRED by 裁-89** — it asserted that a principal existed who could close a registration whose firm already existed. That state is unreachable under the fold, and `reconcile_paid_registrations` retires unbuilt with it | | | |
| ~~W-Q~~ | **RETIRED by 裁-92** — it validated the origin of a `confirmation_url` query parameter on the intermediate landing page. **There is no link and no such parameter**, so the cell has no subject. Its replacement in spirit is **W-H**, which walls the one caller-supplied value the code flow still has: the address |
| **W-R** | the transport rule (part 1 §1.1) | **see the panel at §4.2** — the cell asserts the TRAIN's property, not a global count | | |
| **W-S** | `record_checkout_session` ownership (M2) | caller B stamps caller A's unstamped intent → `CLR04 not your checkout intent`, **and the intent is still stampable by A afterwards** | A stamps it → recorded | delete the applicant comparison |
| **W-T** | one paid session per registration (M7) | two Checkout Sessions for one registration both complete → the **first** writes a payment row; the second writes a `stripe_event_problems` row of kind `duplicate_payment` and **no second payment** | one session → one payment | drop `uq_frp_registration` |

### 4.1 · W-L — the two-mutant panel (BLOCKER-2)

W-L is the cell the whole *"two firms stay impossible however many tokens were minted"* argument
rests on, and **its single stated mutant was proved non-discriminating on a rig**: the live
`_create_firm_core` carries **two** guards — an `exists(...)` pre-check *and* a
`unique_violation` catch backed by `uq_membership_active_user` — and deleting the pre-check alone
produces the same refusal, the same errcode and zero leaked firms. The cell stayed green under
its own mutant, so by this battery's own rule it was not evidence.

| limb | mutant | required outcome |
|---|---|---|
| **m1** | delete the exists-check **AND** drop `uq_membership_active_user` | **MUST GO RED** — a second firm is created for a user who already holds an active membership. **Operationally: `uq_membership_active_user` is a SHARED estate index.** m1 runs inside a savepoint that is rolled back, or on a dedicated throwaway rig — **never beside a live panel**, where dropping it would expose every other lane's fixtures to a real double-membership |
| **m2** | delete the exists-check **alone** | **MUST NOT RED** — the refusal still comes, from the index. This is the positive assertion that *the index is the real wall*, not the procedural check |
| **control** | unmutated | a person with no membership creates a firm; a person with one is refused `CLR10` |

m2 is the limb that carries the knowledge. A panel where every limb reddens proves only that
*something* refuses; this one proves **which mechanism does**.

### 4.2 · W-R — the transport cell, inverted (the addendum's six)

**v1's W-R asserted the wrong proposition.** §1.1 states *"every server-side step OF THIS TRAIN is
a route.ts HTTP-method export"*; the cell asserted a **whole-repo count** of two file kinds. Those
come apart in both directions — **false GREEN** if a train step is implemented inside a `page.tsx`
server-component body or a layout (neither an action nor a route handler: §1.1 violated, count
untouched), and **false RED** on any unrelated special file a future train adds. The correct
assertion was already sitting in v1's own positive-control column, in prose.

**Home, so the cell cannot be quietly dropped (E).** It lives in
apps/web/tests/checkout-transport.test.ts, its path is **required in
`apps/web/test/manifest.txt`**, and **it may not be `.skip`-ed**. `check-test-manifest.mjs` rides
`apps/web`'s own `lint` script — which runs on every PR, docs-only included — and fails when a
real test file is missing from the manifest, so a named-and-manifested cell cannot vanish silently.

**A precondition this cell needs, because `LEAF` is not importable (W-R-1).** It is
`const LEAF = …` at apps/web/tests/firm-scope-surfaces.test.ts:46 — **not exported**, and living in
a test module whose import would re-register the census suite as a side effect. **`LEAF` (and
ideally a `routeLeaves` helper) moves into apps/web/test/sourceOracle.ts** — the dependency-free
shared oracle the census already imports from at its own line 22 — and both suites import that one
definition. B's derived roster inherits the same correction: it too reads `LEAF` from the oracle.

**A · The primary assertion — train-scoped.** For each of §1.1's **three** server entries (the
confirm verify POST, `POST /checkout`, the /checkout/success POST):

| limb | assertion |
|---|---|
| **it is a route leaf** | the file's basename matches `LEAF` **imported from the shared oracle**, and the module exports an HTTP method |
| **it is declared, in the registry its FILE KIND belongs to** | a **route** leaf appears in `SCOPE_EXEMPT_SURFACES` or `SCOPE_ENTRANCES`; a **page** appears in `SCOPE_UNSCOPED_SURFACES` — each with a **non-empty reason**, and **the `pending?: true` flag is not acceptable for any of these entries** |
| **mutant** | re-implement any one of the three as a `"use server"` export → **RED on both limbs**: it is no longer a route leaf, and it cannot be registered as one |
| **MUST-NOT-RED control (N1)** | adding an unrelated legitimate `page.tsx` or route.ts elsewhere must **not** redden **cell A** — A is about *this train's* entries. **It says nothing about B, and must not be read as licence to silence B:** an unrelated `error.tsx` must not red A and **MUST** red B |

> **W-R-2 — why limb (ii) is written by file kind.** An earlier draft said every entry must appear
> in `SCOPE_UNSCOPED_SURFACES`. **Measured, that registry holds zero route files**, all three
> route entries live in `SCOPE_EXEMPT_SURFACES`, and this train's own
> `app/(entry)/auth/confirm/verify/route.ts` is **already registered there**
> (`apps/web/lib/require-firm-scope.ts:403`). So the limb as written **failed on unmutated
> shipping code** — a control red before any mutant — and a lane going green literally would have
> moved a route into the pages registry and reddened the census's own cell 1. **This train adds
> four registry rows across two registries**: /checkout/success is two files (a paint-only page →
> unscoped registry; its POST route → exempt registry), plus `POST /checkout`'s route, beside the
> confirm route already there.

> **N3 — nothing else asserts ④ stays client-side, and the assertion is NEGATIVE.** The cell
> asserts that **no server entry exists beyond the three named** — walking the route leaves and
> the registries and finding nothing else — rather than counting to three. That is what the mutant
> actually tests: a lane quietly moving `sign_dpa` behind a `POST /signup/dpa` adds a *fourth*
> entry, and a negative assertion reddens on it whereas a count could be satisfied by any three.

**B · The secondary tripwire — a ROSTER, derived, with its remedy in the message.** The global
shape still deserves a tripwire, but v1's version would rot: `template.tsx` is Next's standard
per-navigation remount file — for an animated two-pane route-group app that is a *when*, not an
*if* — and `error.tsx` / `loading.tsx` are likelier still and v1 counted neither.

- The watched family is **derived from the census's own `LEAF` regex** (every file under
  `apps/web/app` whose basename does *not* match it), never a hard-coded pair, so the instrument
  cannot drift from the thing it compensates for.
- It is a **roster, not a count** (the estate's "roster MAPS not counts" rule). The seven current
  members are named: app/layout.tsx · app/not-found.tsx · (entry)/layout.tsx ·
  (firm)/layout.tsx · (firm)/clients/[clientId]/layout.tsx · (full)/layout.tsx ·
  (full)/clients/[clientId]/layout.tsx. **The blind spot already has seven residents** — v1
  counted the two members that happen to be zero and called the rule pinned.
- **The assertion message carries the reason AND the remedy**, because the lane that adds an
  `error.tsx` is by definition not working on checkout and has no reason to have read §1.1. It
  says: *a non-LEAF file is invisible to the scope census; do NOT bump this roster, allowlist the
  path, or narrow the glob to go green — each of those retires a security wall while looking like
  housekeeping. Either register the file where it can be classified, or land the census fix that
  widens `LEAF` and update this roster in the same PR.*

**C · A directive is a parse fact, not a string (D — review law 3 again).** "Zero `"use server"`
occurrences" matches the literal in a comment, a fixture or a Markdown file, and **misses
`'use server'` in single quotes**, which is equally valid. The tripwire uses the oracle's own
`stripComments(src)` — imported, not reimplemented — and checks the module's **first statement**,
not any occurrence.

> **W-R-3 — `{ blankStrings: true }` is NOT passed, and the four plants are why.** An earlier
> draft specified that option. Run against the real import, **all four plants come back not-red
> under it**: the option blanks the *contents* of string literals, and a `"use server"` directive
> **is** a string literal, so it blanks precisely the thing being detected. Under plain
> `stripComments(src)` the four verdicts are RED / RED / not-red / not-red — correct. *(Confirmed
> on this machine against the shipping sourceOracle.ts, not reasoned from the docstring.)*

**The planting demonstration is re-run with four plants, and the instrument must get all four
verdicts right:** a double-quoted directive → **RED** · a single-quoted directive → **RED** · the
literal inside a comment → **NOT red** · the literal inside a string constant → **NOT red**. Two
of those are the decoys that would have fooled v1's grep — and the pair of RED verdicts is what
refutes `blankStrings`.

**N2 · The no-`.skip` rule needs an enforcer, not a sentence.** The file carries a **count
control** in the estate's own `VACUITY CONTROL` idiom: an assertion that the number of *executed*
cells in this file equals the expected number. A `.skip` (or a cell quietly deleted) drops the
count and reddens the control, so the prohibition is mechanical rather than a comment nobody
re-reads.

### 4.3 · What 裁-89 retired from this battery, and why that is not a weakening

Seven cells left this battery when the door folded. **A retired cell is only honest if its
subject retired with it** — a cell dropped because it was inconvenient is a deleted proof, which
this estate has a named lesson about. Each row states which:

| retired | its subject | what covers the property now |
|---|---|---|
| **W-E** consumed admission | the `create_firm` recut | nothing to cover — there is no token, and `create_firm` is not modified by this train |
| **W-E2** superseded admission | the rotation rule | rotation retires; the transaction replaces it |
| **W-F** 裁-26 email binding | `firm_admissions.bound_email` | **W-D** — `req.applicant = jwt_sub()` is a stronger statement than an email match, and it was always the wall that mattered |
| **W-F2 / W-F3** the minter cannot forget | two CHECKs on a row that is no longer written | **structural**: the door that verifies the DPA is the door that creates the firm, in one transaction. There is no separate minter left to forget |
| **W-P2** the closer is reachable | `reconcile_paid_registrations` | the verb retires unbuilt; the state it recovered is unreachable |
| **W-Q** the open-redirect check | the intermediate page's `confirmation_url` parameter | **W-H** — 裁-92 removes the link, and the one caller-supplied value left is the address |
| **W-H/W-H2 as v3 wrote them** | the PKCE verifier exchange | **W-H…W-H6** — the same cells rewritten against the code flow: the address wall, three distinguishable refusals, and the four attempt walls a guessable code makes mandatory |

**And one cell was ADDED to keep the retirements honest: W-E3.** Five of the seven retire because
this train stops touching `firm_admissions`, so the battery now asserts that positively — same
columns, same indexes, same row count as a freshly seeded rig after the whole battery runs. **A
claim that "we no longer touch that table" is exactly the kind of absence this estate does not
accept on trust.**

### 4.4 · W-K — why "the lock is the wall" was wrong, and what the lock does buy

**Measured on a rig by the independent review, and re-derived here against the live body:** across
all four variants (lock/no-lock × W7/no-W7) of two interleaved calls, **exactly one firm exists
every time.** The reason is `clara._create_firm_core`'s own two guards — the
`exists(… firm_memberships … status='active')` pre-check and the `unique_violation` catch backed by
`uq_membership_active_user` (survey §2.2). The winner commits a membership for the applicant; the
loser then calls the core for **that same applicant**, whose membership now exists, and is refused
`CLR10`. **The lock never gets to be the wall, and `uq_membership_active_user` already has a cell —
W-L.**

So v3's W-K asserted a property its mutants could not isolate: both collapsed to `CLR10`, and the
one-firm limbs stayed green under every mutant. **A non-discriminating mutant fails both ways, and
the false PASS is the expensive one** — this battery's own rule, applied to this battery.

**What the lock genuinely buys, and what W-K now asserts:**

| | with `FOR UPDATE` | without |
|---|---|---|
| the loser's read of `firm_id` | **already SET** — it blocked until the winner committed | still NULL — it read before the winner committed |
| the loser's refusal | **`CLR09`**, W7's typed *"this registration is no longer open"* | `CLR10 actor already belongs to a firm`, from deep inside the core — true, but the wrong sentence for a person whose firm was just opened in another tab |
| the number of firms | one | one |

**The lock buys a correct refusal, not a correctness guarantee.** That is worth having and worth
asserting; it is simply not the two-firms wall, and the design no longer says it is.

---

## 5 · The non-wall cells

1. **`clara.event_types` gains exactly ONE row** (`firm_registration.paid` — `firm.created`
   already exists), **and `clara.trigger_taxonomy` gains exactly one at the ACTIVE version**, both
   asserted in the migration tail on the `0145:1311-1316` precedent. Registering one without the
   other is the half-registration the coverage census refuses by name. The registry's coverage is
   proven whole before and after.
2. **`firm.created` is seq 1** for a firm born through this door — the same assertion
   `rig-events.test.mjs:263` already makes for the other two entrances, extended to the third.
2. **A positive set equality, in both directions** (billing Annex D's T.2 discipline): the set of
   `clara` functions whose body references `stripe_events` or `firm_registration_payments` equals
   exactly `{record_stripe_event, apply_stripe_events, claim_paid_firm}` — three, not five,
   because 裁-89 folded two of them into one and retired the third unbuilt.
3. **`create_firm`'s recut delta** is proven by inverse re-substitution back to the pinned
   pre-image sha `59fa533d9c03`, with `proacl`, owner, `search_path` and the `SECURITY DEFINER`
   posture re-asserted unmoved.
4. **No `clara` role holds `BYPASSRLS` after this train** — a whole-roster read, not a check of
   the new role alone.
5. Every new table read from the catalog **by property** as RLS enabled AND forced with zero
   application-role grants.
6. **Nothing is deleted** (裁-74): across the whole battery, `checkout_intents`,
   `firm_registration_payments`, `stripe_events` and `dpa_signatures` row counts only ever rise,
   and no row of any of them is ever updated except through its one permitted stamp. *(The
   v2 form of this cell asserted a superseded admission was still present; under 裁-89 no
   admission is written at all, which W-E3 asserts positively instead.)*

---

## 6 · The e2e (裁-86, orders §A step 2)

`pnpm --filter @clara/web build` → `next start` → Playwright on the **built** app against a
throwaway test firm (ADR-0075), axe riding the walk: signup → **confirm by typing the emailed
six-digit code, in a SECOND browser context** — the cross-device journey 裁-92 bought, so the happy
path now proves it *works* rather than that it is forbidden → `claim_identity` +
`request_firm_registration` → sign the DPA → checkout in Stripe **TEST mode** (裁-93/G13; at RM0 the
zero-amount price collects no card, so the walk completes without one) → the webhook → the firm
born → the firm home.

**Three negative arms, each in its own browser context — these are the legs that prove the
walls; the happy path alone passes just as well with every hole open:**

1. **W-H's refuse limb** — the confirm page loaded with the address in a query parameter,
   asserting the form does not pre-fill it and no `Set-Cookie` is written.
2. **W-H3** — six wrong codes, asserting the sixth is refused by the wall *before* `verifyOtp` is
   reached, and that the card names the wait.
3. **W-D** — a second signed-in test user calling `claim_paid_firm` on the first's paid
   registration, asserting no firm is born and the first's payment is untouched.

The suite lands under apps/web/e2e/, which FS-2 creates.

**The instrument traps this train inherits.** A `fetch` from a test is not a browser; a `curl`
with a forged `Origin` is not the browser; the check runs against the built app, never
`next dev`. The sibling recorded with the CSRF finding — the e2e mock cannot prove single-use
replay — is closed by making the mock **consume** the token and adding a second-POST cell.
