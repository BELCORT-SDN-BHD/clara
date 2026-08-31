# The checkout / signup gate — design of record

*Written 2026-08-31 for the FS-4 design gate (R8). Measurement:
[`checkout-gate-survey.md`](checkout-gate-survey.md). The objects, the webhook contract, the
environment and the acceptance battery are **part 2**:
[`checkout-gate-design-part2.md`](checkout-gate-design-part2.md) (this file is split at the
estate's 500-line document gate, the same way `fix-queue-design.md` and `sst-engine-design.md`
are). Owner questions: [`checkout-gate-gate-record.md`](checkout-gate-gate-record.md) — **nine
questions, and this design builds around none of them.***

**Scope (裁-73 · 裁-74 · 裁-68 · 裁-26 · 裁-36 · 裁-64① · 裁-87).** A stranger's browser causes a
new FIRM to exist, exactly once, after paying. **In scope:** the signup→confirm browser binding,
the DPA e-sign record, the rate wall, the Stripe Checkout session, the signed idempotent webhook,
the event store, the applier, the admission minter, `create_firm`'s email wall, and the holding
page. **Out of scope, named:** invoicing, `evaluate_firm_billing_v1`, `firm_subscriptions`,
capacity walls, dunning — **nothing invoices at RM0** (裁-58), and billing PR-1/PR-2 stay where
they are.

**Constraints this design is written under.** The DB owns every authoritative number and the
browser computes no cents (hard constraint 2) — every amount on every surface is Stripe's own
rendering of a DB-generated Price, and the UI renders "Beta 试用期 / trial", **never the string
"RM0"** (裁-58, 裁-42's design wall). Keys are env-to-env only, never in the repo, never in argv
(hard constraint 4) — part 2 §4 names the variables and never a value. Migration numbers are
claimed at MERGE, so every new migration is named `UNNUMBERED_*` (constraint 10). Every
`DoorRefusal` renders verbatim; no optimistic UI; hydrate-never-trust.

---

## 1 · The shape, end to end

```
  ①  /signup            supabase.auth.signUp  ──►  confirmation mail
  ②  /auth/confirm      POST code  ──►  exchangeCodeForSession   ← THE BROWSER BINDING (§3)
  ③  /signup            claim_identity  ──►  request_firm_registration (status=open)
  ④  /signup            sign_dpa                                      ← 裁-68①
  ⑤  POST /checkout     open_checkout_intent  ← THE RATE WALL (§4)
                        └─► Stripe Checkout Session (subscription mode, zero-amount price)
                        └─► record_checkout_session
  ⑥  Stripe ──► POST /webhooks/stripe   constructEvent(RAW body)  ← 400 and NO door on failure
                        └─► record_stripe_event(id, type, payload)   append-only, idempotent
  ⑦  the applier        apply_stripe_events()  ──►  firm_registration_payments row
  ⑧  /checkout/success  claim_paid_admission(registration, op_key)  ──► admission token
                        └─► create_firm(name, token, op_key)         ──► the firm exists
                        └─► close_paid_registration(...)             ──► registration closed
  ⑨  redirect to the firm home
```

Steps ③–⑨ are refused by the database on its own authority. **Every route here is a courier**
that carries values to a door and renders the door's verdict. No route is a wall.

The six new doors, their exact signatures and every refusal code are **part 2 §1**; the webhook
route's contract is **part 2 §2**.

---

## 2 · The state machine

| state | positively read as | the only exits |
|---|---|---|
| `visitor` | no Supabase session | ① |
| `unconfirmed` | no session, the account exists | ② (or nothing — no reminder mail, 裁-74) |
| `confirmed` | a session, no `clara.users` row | ③ |
| `identified` | a `clara.users` row, no open registration | ③ |
| `registered` | `firm_registration_requests.status='open'`, no DPA signature | ④ |
| `signed` | a current `dpa_signatures` row, no payment | ⑤ |
| `checkout_open` | a `checkout_intents` row carrying a session id, no payment | ⑤ (resume), ⑥ |
| `paid` | a `firm_registration_payments` row, `consumed_at` null | ⑧ |
| `firm` | `firm_registration_requests.firm_id` is not null | — terminal |
| `rejected` | `status='rejected'` | — terminal (the operator road only) |

**Illegal by construction, not by procedure** — each is a database property, and part 2 §5 names
the mutant that must redden its cell:

- *two firms from one person* — `uq_membership_active_user` (survey F5). `_create_firm_core`
  refuses `CLR10 actor already belongs to a firm` before the insert **and** catches the
  `unique_violation` on the race.
- *two firms from one registration* — a new UNIQUE index
  `uq_firm_admissions_registration` on `firm_admissions(registration_id) WHERE registration_id
  IS NOT NULL`, asserted BY PROPERTY from `pg_index` (unique + valid + ready + live + key columns
  + predicate), never by name.
- *two open registrations* — `uq_firm_registration_requests_open_applicant` (survey F4).
- *two payment rows for one Stripe event* — `firm_registration_payments.stripe_event_id` UNIQUE,
  and the applier inserts `ON CONFLICT DO NOTHING`.

### 2.1 · The holding page (裁-74)

The four states above that are neither `visitor` nor `firm` all render `/pending`, whose existing
decision function already distinguishes `pending / approved / rejected / invite-expected /
unidentified / read-failed / member`. Three arms are added, each driven by a positively read
fact rather than by an absence:

| observed | the card says | the control |
|---|---|---|
| `registered`, no signature | "your firm is not open yet" | **continue to checkout** → ④ then ⑤ |
| `checkout_open`, no payment | "your firm is not open yet" | **resume checkout** → ⑤ again |
| `paid`, unconsumed | "payment received — finish opening your firm" | **finish opening** → ⑧ |

The accept-an-invitation path stays reachable from the same card, unchanged. **No reminder mail.
The pending registration is never deleted, and neither is a superseded checkout intent**
(裁-74; the estate is append-only). The `NotBuiltNote` this card carries today
(holding-card.tsx:47-83, which names the missing checkout route, plan flag and webhook) is
removed by this train **because the thing it names now exists** — not edited to say less.

---

## 3 · The login-CSRF binding — recommendation: **Supabase's native PKCE exchange**

*This is §FS-4's mandatory design input. The finding is recorded at `PROGRESS.md:398` and its
mechanism is confirmed at the source in survey §5.2.*

### 3.1 · The property that must hold

The confirmation POST must refuse unless **the browser presenting the token is the browser that
initiated the signup that token belongs to**. `proveSameOrigin` cannot supply that property by
construction: it proves the click came from a page served by this deployment's origin, and in
this attack the forged page *is* Clara's page. Widening or tightening the Origin check cannot
reach the property, which is why 裁-68③/裁-26 point at a binding instead.

### 3.2 · The recommendation, and the measurement behind it

**Adopt Supabase's PKCE confirmation exchange.** The decisive fact was measured in the shipped
package, not inferred from documentation: @supabase/ssr 0.12.5 — the installed version —
hard-codes `flowType: "pkce"` in **both** client factories
(`dist/main/createBrowserClient.js:44`, `dist/main/createServerClient.js:37`) and writes the
verifier to cookies under `<storageKey>-code-verifier` plus per-flow slots
(`dist/main/cookies.js:12-29`).

**The binding material already exists in this app and is simply never consulted.** The
confirmation mail carries `{{ .TokenHash }}` and the route calls `verifyOtp`, which is the
non-PKCE arm.

### 3.2a · The objection this must answer first — owner-batch item 85

**`mohe-owner-batch-2026-08-31.md` item 85 (from #461's Codex leg, N1) already ruled the template
the other way**, and its reason is correct as far as it goes: the *bare default*
ConfirmationURL points at Supabase's own verify endpoint, so **a mail scanner's GET consumes the
token before the customer ever clicks**. Supabase documents that limitation itself ("Email
prefetching" — some providers prefetch links, prematurely consuming the confirmation URL). For a
customer base of Malaysian accounting firms, largely on Microsoft 365, that is a real and
frequent failure, and it is why P4-3 built an intermediate page with an explicit button.

**But this is not a choice between the two properties.** Supabase's own documented mitigation for
prefetching is *exactly* the intermediate page P4-3 already built — an email link of the form
`{{ .SiteURL }}/confirm-signup?confirmation_url={{ .ConfirmationURL }}`, which the Auth
email-templates guide describes as redirecting "users to an intermediate landing page containing
a confirmation button to safeguard against automated link prefetchers". The emailed link points
at **our** page, a scanner's GET consumes nothing, and the explicit click carries the PKCE flow.

**Item 85's prefetch requirement and this gate's binding requirement are satisfied by the same
shape**; only the query parameter the page carries changes. Item 85's Wave-G setup line therefore
needs amending **before the owner performs that setup act** — carried in the gate record.

### 3.2b · The change, precisely

1. **The template** becomes the intermediate-page form above, pointing at /auth/confirm and
   carrying the confirmation URL as a query parameter. Prefetch-safe, unchanged in that respect.
2. **The confirm page's GET stays paint-only and token-inert** — a scanner may visit twice and
   consume nothing, exactly as today — and renders the button as a link to that URL. **NEW
   WALL:** the page renders the parameter **only if its origin equals the project's own Supabase
   URL**; anything else is refused as `status=invalid`. Without this the page is an open redirect
   whose destination an attacker fills in — the same class as the client-settable-header trap in
   §4.1.
3. **Supabase's verify endpoint redirects back** to /auth/confirm with `?code=…` — a **query**
   parameter the server sees, not the implicit flow's URL fragment that it never sees. That GET
   is *also* paint-only: it renders a "finish signing in" card whose button POSTs the code.
4. **The verify handler keeps `proveSameOrigin` verbatim** — it is still the CSRF wall on a
   state-changing route — and replaces `verifyOtp({type:"email", token_hash})` with
   `exchangeCodeForSession(code)`. `hasVerifiedSession`'s positive check on
   `(user, session, matching ids)` is kept exactly as written: a null session is still not
   evidence of success.

A browser holding no matching verifier cookie fails the exchange **at Supabase's own
`/token?grant_type=pkce` endpoint**. The refusal is the platform's, in the protocol — not a
branch we wrote and must then prove. **The explicit-click discipline, the same-origin wall and
the prefetch safety all survive; the binding is added underneath them.**

### 3.3 · Why not a hand-rolled nonce

| | native PKCE | hand-rolled nonce |
|---|---|---|
| new DB objects | none | a table, an expiry rule, a replay rule, a rotation rule |
| new secrets | none | a cookie we name, scope, set and expire ourselves |
| entropy | the platform's | `gen_random_uuid()` — **`pgcrypto` is not installed** (survey F9), so `gen_random_bytes` needs a new extension first |
| who refuses | Supabase's token endpoint | our own code, which then has to be proven |
| what it binds | the browser Supabase issued the flow to | a browser holding *our* cookie — which still has to be proven to be the browser Supabase issues the session to. **That is the same property again, one layer up.** |
| the recorded sibling finding | a `code` in an ingress log is inert without the verifier cookie | a `token_hash` stays in the URL and stays a session |
| review law 3 | the verifier **is** the flow | the nonce is a *name* for the browser; proving the name IS the thing is exactly the work PKCE already did |

The last two rows decide it. The sibling finding recorded with the hole — `token_hash` reaches
ingress/access logs before app code can redact it (`PROGRESS.md:398`) — is **closed as a side
effect** by PKCE and is **not closed at all** by a nonce. And a hand-rolled binding would be a
second implementation of a property the platform already implements underneath it, with the
platform's own version sitting unused directly below ours.

### 3.4 · The cost, and the fail-closed answer to it

**The email template is Supabase project configuration, not repository content. No repo gate, no
CI job and no migration can read it.** That is a real cost and it is answered structurally, not
by a runbook line:

> **The route accepts `code` and ONLY `code`. There is no `token_hash` arm, not even a
> fallback.**

If the template is ever mis-configured back to `{{ .TokenHash }}`, confirmation breaks **loudly**
for everybody — nobody can sign up — rather than silently reverting to an unbound flow that still
appears to work. A fallback arm would be this failure mode wearing the costume of resilience.
The e2e in part 2 §5 walks the real journey on the built app and is the standing detector.

The intermediate page's own new wall (§3.2b step 2) is fail-closed in the same direction: a
confirmation-URL parameter whose origin is not the project's Supabase URL renders
`status=invalid` and **no link at all**, rather than a link the page declined to check. Cell
W-Q.

### 3.5 · The second, independent layer

PKCE binds the *session* to the browser. 裁-26's email-bound admission binds the *firm* to the
email (part 2 §1.4). The two are independent: even if a session were somehow installed in the
wrong browser, an admission minted for `victim@…` is refused by `create_firm` when the caller's
`_jwt_email()` reads `attacker@…`. **裁-68's three walls map exactly onto this design:** ① the
DPA e-sign (part 2 §1.1), ② the rate wall (§4 below), ③ the email-bound token (part 2 §1.4) —
plus payment, which **is** the approval (裁-73; no operator queue for tier-3).

### 3.6 · What PKCE does not close, stated

An attacker can still create an account **with an email they do not control**. They will never
receive the confirmation link, so they never obtain a session, and `claim_identity` refuses any
caller with no verified email claim. The residual is that the victim receives an unexpected
confirmation mail — a nuisance, not an authorisation defect, and the rate wall bounds its volume.

---

## 4 · The rate wall (裁-36② · 裁-64①) — the DB stays the wall

**Limb ① is already enforced and this design builds no second mechanism for it.** "One firm per
email" holds through three measured facts (survey F5): `clara.users.email` carries
`users_email_key` (UNIQUE); `_claim_identity_core` translates a collision into `CLR10 that email
is already claimed by a different identity`; and `uq_membership_active_user` makes one active
membership per user a database property. **This is asserted positively in a test cell (part 2
§5, W-L) rather than re-implemented** — a second enforcement of an existing invariant is a second
thing that can disagree with it.

**Limb ② — one firm per IP per day — is genuinely new.** Survey F10 measured that no table in
the `clara` schema carries an address of any kind: no `inet`, no `cidr`, no column named
`ip_addr|ipaddr|remote_addr|client_ip`. 裁-64① fixes the *shape* — a server-only courier passes
the proxy-observed address into a door argument and **the DB stays the wall**. What is not ruled
is **what value crosses that boundary.** The sitting's two options:

**Option A — the address itself.** `open_checkout_intent(p_registration uuid, p_client_ip inet,
p_op_key text)`. The door counts distinct applicants from that address in the last 24 hours and
refuses beyond one.
*For:* the simplest thing that works; an operator investigating abuse can read the value.
*Against:* an IP address is personal data under the PDPA reasoning this repo already carries
(`docs/ops/legal/pdpa-cross-border-transfer-basis-memo.md`). The estate acquires a new category
of personal data, with its own retention question, on the most public table it owns.

**Option B — a peppered digest (recommended).** `open_checkout_intent(p_registration uuid,
p_origin_digest bytea, p_op_key text)`, where the courier passes
`sha256(pepper || normalized_address)` and the pepper lives only in the runtime's environment
(`CLARA_RATE_WALL_PEPPER`). The door counts distinct applicants per digest, identically.
*For:* the identical wall, identically in the database, with **no address at rest anywhere**. The
digest is unlinkable to an address without the pepper, and rotating the pepper simply resets the
24-hour window — the correct blast radius for a rate wall.
*Against:* one more secret to hold and to carry through DR; an operator cannot answer "which
address was this" from the database alone.

**Recommendation: Option B.** The wall is identical and the DB is equally the wall, and the
estate avoids taking on personal-data retention for an anti-abuse control that does not need it.
The design in part 2 is written for B; switching to A changes one argument's type and nothing
else. **Gate question G4.**

### 4.1 · The trap that binds either option

The "proxy-observed address" must be read from a **trusted** header for the deployment's actual
proxy — `CF-Connecting-IP` behind Cloudflare — and **never** from a bare `X-Forwarded-For`,
which any client can send. A wall keyed on a client-settable header is not a wall; it is a form
field the attacker fills in. This is the same class as the finding
`lib/same-origin.ts:37-58` already records against `x-forwarded-host` ("two untrusted headers
agreeing is not two pieces of evidence").

So the courier reads **one** header, named per deployment in
`CLARA_TRUSTED_CLIENT_IP_HEADER`, and **fails closed when that variable or that header is
absent** — refusing checkout rather than waving it through — exactly the posture
`readSameOriginConfig` already takes when `CLARA_PUBLIC_ORIGINS` is unset.

### 4.2 · The applicant's own retry is never rate-limited

The wall counts registrations by **other** applicants from the digest. A person who abandons
checkout and comes back must not be locked out of their own registration, or 裁-74's
resume-checkout arm refuses on the second attempt and the wall becomes a self-denial-of-service
against the paying customer. Both polarities of this are cells (part 2 §5, W-J).

---

## 5 · Idempotency and partial failure

Every row is an acceptance cell, not a narrative. **No path may strand a paying customer without
a firm, and no path may mint two firms.**

| the browser/network dies… | state on disk | what the customer sees | how it resolves | strand? | two firms? |
|---|---|---|---|---|---|
| before ① | nothing | the signup form | retry | no | no |
| between ① and ② | an unconfirmed Supabase user | "check your email" | click the link; it is unconsumed | no | no |
| during ② | the exchange either happened or it did not | `?status=invalid` if not | request a new confirmation | no | no |
| between ③'s two RPCs | a `clara.users` row, no registration | `/signup` step 2 | `claim_identity` replays structurally; `request_firm_registration` proceeds | no | no |
| after ③, before ④ | `status='open'`, no signature | the holding page: continue to checkout | ④ then ⑤ | no | no |
| after ⑤'s door, before Stripe returns | an intent with `session_id` NULL | the holding page: resume checkout | ⑤ again — a **new** intent opens; the old one is never deleted (裁-74) | no | no |
| the customer never pays | intents, no payment | the holding page, indefinitely | **nothing. No reminder mail, nothing deleted** (裁-74) | n/a | no |
| **the webhook arrives while the DB is down** | nothing recorded | the success page cannot claim yet | Stripe **retries**, and the one-minute applier sweep re-applies whatever landed | no | no |
| **the webhook is delivered twice** | one `stripe_events` row (PK), one payment row (UNIQUE) | — | the second `record_stripe_event` returns `recorded:false` | no | no |
| **between ⑥ and ⑧** — the customer closes the tab after paying | a payment row, unconsumed | the holding page: **"payment received — finish opening your firm"** | they return and ⑧ runs | **no** | no |
| **between `claim_paid_admission` and `create_firm`** | an unconsumed admission, a consumed payment | the success or holding page | ⑧ again: rotation (part 2 §1.3) mints a fresh token and the flow completes | **no** | no — `uq_membership_active_user` |
| **between `create_firm` and `close_paid_registration`** | the firm exists, `status` still `open` | the holding page **redirects to the firm home** — the live `holdingStateFrom` consults `caller_context` membership *before* registration history | the success route retries `close_paid_registration`; the sweep may also close it | **no** | no |
| ⑧ called twice concurrently | — | — | `for update` on the registration row serializes them; the loser sees W7 or rotates | no | no |
| **`create_firm` succeeds and its response is lost** | the firm exists, the admission is consumed **with a receipt** | — | `create_firm`'s **own live** replay (`consumed_op_key = p_op_key` → return `consumed_result`) hands back the same `{firm_id, plan_id}` | no | no |

**The one path this design deliberately leaves open** is a customer who pays and never returns.
They hold a paid, unconsumed payment row forever, because 裁-74 forbids both a reminder mail and
any deletion. That is the ruled behaviour; the holding page states it honestly rather than
pretending the money is unspent.

---

## 6 · Build sequence, D1, and what this train is not

| PR | contents | D1 | gated on |
|---|---|---|---|
| **C-1** | `UNNUMBERED_checkout_gate_a` — `dpa_documents`, `dpa_signatures`, `registration_rate_events`, `sign_dpa`; the DPA row seeded from `docs/ops/legal/` **after the owner confirms the text once** (裁-68①) | no | the owner's confirmation (gate G5) |
| **C-2** | `UNNUMBERED_checkout_gate_b` — `stripe_events`, `stripe_event_problems`, `stripe_object_map`, `record_stripe_event`, `apply_stripe_events`, the two roles and their two grants | no | — |
| **C-3** | `UNNUMBERED_checkout_gate_c` — `uq_frr_id_applicant`, `checkout_intents`, `firm_registration_payments`, the three `firm_admissions` columns + index + CHECK, `open_checkout_intent`, `record_checkout_session`, `claim_paid_admission`, `close_paid_registration`, the two `event_types` rows | no | C-1, C-2 |
| **C-4** | `UNNUMBERED_checkout_gate_d` — **the `create_firm` recut** (part 2 §1.4) | **YES — the one window** | C-3 |
| **C-5** | the runtime: the raw-body webhook router mounted **before** `src/index.ts:55`, the applier sweep, the trusted-IP courier | no | C-2 |
| **C-6** | `apps/web`: the PKCE confirm route (§3.2), the DPA step, the checkout and success routes, the holding page's three arms, the e2e | no | C-3, C-5 |

**D1 write-quiesce list — exactly one live body:** `clara.create_firm(text,uuid,text)`, live tip
`0147:497`, live `prosrc` sha12 **`59fa533d9c03`**. C-4 pins that sha **before** it re-cuts, and
reconciles a divergence rather than overwriting it — the estate has been bitten by a cross-PR
`CREATE OR REPLACE` silently reverting a live splice more than once. **Roster edits land in the
same PR as the objects they name** (`rig-meta.mjs`'s function and table rosters).

**Reviews.** Every PR here is judgement logic on its face (review law 1). C-2 · C-3 · C-4 · C-5
are money / auth / webhook / tenant-creation surfaces, so §A step 4's security lens is mandatory,
and **a Codex read-only leg is added if a native lane built them** (law 28, kept by 裁-86).

**Named non-goals.** No invoicing, no `issue_invoice`, no `firm_subscriptions`, no capacity
walls, no dunning; no operator queue for tier-3 (裁-43/裁-68); no reminder mail and no deletion
of an abandoned registration (裁-74); no real-money charge before the launch sitting (裁-81); and
**no `billing.meter_events` and no metered price, ever** — Stripe must never originate an
authoritative number (law 1, billing Annex A D12).

### 6.1 · The one measured contradiction with the ruled shape

裁-73 says the applier "marks the registration PAID".
`firm_registration_requests.status` admits exactly `open | approved | rejected` — a `CHECK`
measured at the live catalog (survey F3) — so a literal `paid` status is a CHECK widening on a
live table with a named successor constraint. **This design records payment in
`firm_registration_payments` instead and leaves the CHECK untouched**: the same fact, in a table
that also holds the Stripe ids a status column could not carry, and with a composite foreign key
binding the payment to its applicant. **This is reported, not resolved unilaterally — gate
question G7** puts the alternative (widen the CHECK to admit `paid`) to the owner.
