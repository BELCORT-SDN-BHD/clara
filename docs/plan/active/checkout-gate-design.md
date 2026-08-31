# The checkout / signup gate — design of record

*Written 2026-08-31 for the FS-4 design gate (R8). **v3** — amended to 裁-89, the owner's ruling
on G1: **the admission door is ONE transaction.** (v2 was the fold of the independent review's
3 BLOCKER / 14 MATERIAL / 9 NIT; that work stands, and the gate record of the two-step gate is the
record of the gate that ran.) Measurement:
[`checkout-gate-survey.md`](checkout-gate-survey.md). **Part 2** — the database objects:
[`checkout-gate-design-part2.md`](checkout-gate-design-part2.md). **Part 3** — the webhook
contract, the surfaces, the environment and the acceptance battery:
[`checkout-gate-design-part3.md`](checkout-gate-design-part3.md). *(The split is the estate's
500-line document gate, as in `fix-queue-design.md` and `sst-engine-design.md`.)* Owner questions:
[`checkout-gate-gate-record.md`](checkout-gate-gate-record.md) — **ten questions and two
declarations, and this design builds around none of them.***

> **What v3 changed.** 裁-89 folded `claim_paid_admission` + `create_firm` +
> `close_paid_registration` into **one door in one transaction** (part 2 §1.3). Working it out
> produced a consequence the ruling did not have to promise: **the folded door needs no admission
> token at all**, so `clara.firm_admissions` is untouched, **`create_firm` is not re-cut, and the
> D1 write-quiesce window disappears** — restoring 裁-73's own "unchanged, no D1 window"
> prediction. `reconcile_paid_registrations` retires unbuilt; seven acceptance cells retire with
> their subjects and one (W-E3) is added to keep those retirements honest. 裁-26's email-bound
> token is superseded rather than built (gate record G7 item 4). **What the fold does NOT remove:
> the double payment** — that is settled at ⑦, before the door runs.

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
(hard constraint 4) — part 3 §3 names the variables and never a value. Migration numbers are
claimed at MERGE, so every new migration is named `UNNUMBERED_*` (constraint 10). Every
`DoorRefusal` renders verbatim; no optimistic UI; hydrate-never-trust.

---

## 1 · The shape, end to end

```
  ①  /signup            supabase.auth.signUp  ──►  confirmation mail
  ②  /auth/confirm      POST {email, 6-digit code} ──► verifyOtp   ← 裁-92, and its walls (§3)
  ③  /signup            claim_identity  ──►  request_firm_registration (status=open)
  ④  /signup            sign_dpa                                      ← 裁-68①
  ⑤  POST /checkout     open_checkout_intent  ← THE RATE WALL (§4)
                        └─► Stripe Checkout Session (subscription mode, zero-amount price)
                        └─► record_checkout_session
  ⑥  Stripe ──► POST /webhooks/stripe   constructEvent(RAW body)  ← 400 and NO door on failure
                        └─► record_stripe_event(id, type, payload)   append-only, idempotent
  ⑦  the applier        apply_stripe_events()  ──►  firm_registration_payments row
  ⑧  /checkout/success  GET paints; its POST does the work (M9)
                        └─► claim_paid_firm(registration, op_key)    ──► ONE transaction (裁-89):
                              claim · _create_firm_core · close the registration · stamp the payment
  ⑨  redirect to the firm home
```

Steps ③–⑨ are refused by the database on its own authority. **Every route here is a courier**
that carries values to a door and renders the door's verdict. No route is a wall.

The **five** new doors, their exact signatures and every refusal code are **part 2 §1**; the
webhook route's contract is **part 3 §1**. *(v3: 裁-89 folded two doors into one and retired a
third, `reconcile_paid_registrations`, unbuilt.)*

### 1.1 · The transport is route handlers. NO Server Actions.

**Which steps this is even about.** The sentence needs its subject named, because two of the nine
steps are client-side and one is not in this app at all:

| step | where it runs |
|---|---|
| ① `signUp` | **client** — a client component calling Supabase directly |
| ② confirm | the GET page is a **code-entry form** (server component); **the verify POST is a route handler** ← *server entry* |
| ③ `claim_identity` + `request_firm_registration` | **client** — `signup-firm-form.tsx` opens `"use client"` and calls both doors through `callDoor`/PostgREST with the browser's own token |
| ④ the DPA step | the text is **read** by a server component; **`sign_dpa` is called the same way ③ calls its doors — from the client, over PostgREST** (decided below) |
| ⑤ POST /checkout | **route handler** ← *server entry*; it holds the Stripe secret and 303s |
| ⑥ the webhook | `packages/runtime`, not this app |
| ⑦ the applier | the database, on the runtime's sweep |
| ⑧ success | the GET is a **paint-only server component**; **its POST is a route handler** ← *server entry* |
| ⑨ redirect | — |

**So this train adds exactly three server entries to `apps/web`**, and every one of them is a
route.ts HTTP-method export. **④ is decided here rather than left unnamed** — an unnamed
server-side step sitting under a "no Server Actions" heading is precisely where a build lane
reaches for an action. `sign_dpa` is a governed door like ③'s two, the caller is the person, and
the client-RPC pattern already exists and is already reviewed; adding a route for it would buy
nothing. **If a later lane needs it server-side instead, that lane adds POST /signup/dpa as a
route handler and registers it — never an action.**

**The primary reason, which needs no instrument at all.** Next's own guidance is that page-level
authentication does not protect Server Actions, and that authentication and authorization must be
re-verified **inside each action**. An action is a POST endpoint wearing a function call's
clothes. On this train those endpoints are the ones that create a firm, so a missed
re-verification is a tenant created by a stranger.

**The second reason: a surface leaf MUST CLASSIFY, and an action escapes that entirely.** Every
`page.*` / `route.*` leaf is enumerated by the scope census (`LEAF`,
apps/web/tests/firm-scope-surfaces.test.ts:46) and has to be registered **with a written reason**
— and **the registry depends on the file kind**: a route leaf goes in `SCOPE_EXEMPT_SURFACES`
(or is an entrance), a page goes in `SCOPE_UNSCOPED_SURFACES`. Measured on the shipping tree:
`SCOPE_UNSCOPED_SURFACES` holds **zero** route files, `SCOPE_EXEMPT_SURFACES` holds three, and
this train's own confirm-verify route is **already** registered there
(`apps/web/lib/require-firm-scope.ts:403`).

**So this train adds four registry rows across two registries**, because /checkout/success is two
files: a paint-only `page.tsx` (unscoped registry) and its POST route.ts (exempt registry), plus
`POST /checkout`'s route and the already-present confirm route. **A `"use server"` file is
enumerated by nothing and therefore justifies nothing** — it is the declaration that never has to
be made.

> **A correction to how v1 argued this.** v1 said the census is blind to actions *for firm-scope
> coverage*. That is true in general and **is not the reason here**: none of this train's new
> surfaces are firm-scoped — the customer has no firm until ⑧ — so `requireFirmScope()` is not
> what guards `/checkout` at all. The census's real value on this train is the **forced
> declaration** above, and that is what cell W-R now asserts.

**Measured, so the rule's scope is honest.** Across `main` and all four open web branches:
**zero** `"use server"` modules and **no** `template.tsx`. This train is not repairing a hole — it
is declining to open the first one, on the most dangerous door in the system, while the instrument
that would catch it is known blind. **But the blind spot is not empty:** seven non-LEAF App Router
special files already live there (app/layout.tsx, app/not-found.tsx, and the five route-group
and client layouts). W-R therefore watches the **whole non-LEAF family as a roster**, not two
hand-picked names that happen to be zero — see part 3 §4.2.

**If a later reader believes a Server Action is right somewhere here, that is not a local call:**
it requires the census fix to have landed first, as a stated precondition on the build PR. Gate
record, "recorded constraints".

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

**Illegal by construction, not by procedure** — each is a database property, and part 3 §4 names
the mutant that must redden its cell:

- *two firms from one person* — `uq_membership_active_user` (survey F5). `_create_firm_core`
  refuses `CLR10 actor already belongs to a firm` before the insert **and** catches the
  `unique_violation` on the race.
- *two firms from one registration* — **the folded transaction itself.** The door reads the
  registration `FOR UPDATE`, refuses unless `firm_id IS NULL`, and sets `firm_id` before it
  commits, so a second caller either blocks and then sees a firm, or replays. Under 裁-89 this
  needs no index at all: v2 spent two partial unique indexes and a rotation rule buying a property
  the transaction boundary gives for free.
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

## 3 · Confirmation is a 6-DIGIT EMAIL CODE (裁-92) — and what that changes

*裁-92 ruled G10 against this design's own recommendation: **the owner chose cross-device
experience over the cryptographic binding.** That is a legitimate trade and this section designs it
honestly, including the walls it makes mandatory. The PKCE work v2/v3 specified is **superseded for
signup**; §3.7 says what survives.*

### 3.1 · What the hole was, and why the code closes it by removing the vector

The recorded finding: the confirmation POST proved only that a click came from a Clara page, never
that **this** browser initiated the signup the token belonged to. The attack needed **a link the
attacker could send** — their own legitimate confirmation link, clicked by a victim, installing the
attacker's session in the victim's browser.

**裁-92 deletes the link.** The mail carries a six-digit code (`{{ .Token }}`) and nothing to click.
There is no link to feed a victim, so the vector is gone — not walled, *absent*. What replaces it
as the binding is weaker but sufficient, and it is worth stating exactly why:

> **`verifyOtp` is called with `{ email, token }`. A code is only ever verified against the address
> it was issued to.** An attacker who mails a victim "your code is 123456" achieves nothing: the
> victim types it into a form carrying **the victim's own address**, and Supabase refuses the pair.
> For the attacker's session to be installed, the victim would have to type **the attacker's email
> address** — which a real person never does, because they type their own.

**So the binding is: the address is the person's own.** That is a property about what a human types,
not a cryptographic one, and §3.3's wall is what keeps it true.

> **What a future lane may not weaken, stated because the base narrowed.** Under PKCE, a
> same-origin forgery still failed for want of a verifier — the binding was a second, independent
> layer. **Under the code flow it is not:** `proveSameOrigin` plus §3.3's address wall are the
> WHOLE base. Weakening either one — accepting `Origin: null`, or letting the address arrive in a
> URL — does not degrade a defence-in-depth layer here; it removes the defence.

### 3.2 · Cross-device works fully, which was the point

The person reads the code on a phone and types it into the tab where they signed up — or into a
fresh tab, typing their own address alongside it. **Neither requires the original browser**, so the
regression G10 priced is gone. This is the whole gain 裁-92 bought.

### 3.3 · The one wall that makes §3.1 true — the address may never come from a URL

**The email field is typed by the person, or read from THIS browser's own signup state. It is
never populated from a query parameter, a path segment, or any other caller-supplied value.**

Without this wall the attack returns in a worse form: a page that pre-fills the address from a URL
lets the attacker choose it, and the victim then types the attacker's code beside the attacker's
address — exactly the pair Supabase accepts. **This is the same class as §4.1's client-settable
header:** a value the attacker fills in is not evidence. Cell **W-H** below.

### 3.4 · A six-digit code is guessable, so the rate wall is MANDATORY (裁-36 / 裁-68②)

One million codes is a small space. **Supabase's own documented posture is a 24-hour default expiry
and unspecified "rate limits against brute force"** — a real second layer, but vague, and 24 hours
is far too long for six digits. **This design does not rely on it as the wall.** Four walls, each
with both-polarity cells in part 3 §4:

| # | wall | value | refusal |
|---|---|---|---|
| **C1** | **attempts per address** | 5 rejected attempts per email digest per 15 minutes | `too many confirmation attempts` |
| **C2** | **attempts per origin** | the same window keyed on the **origin digest** — because a per-address lock alone lets an attacker spray one guess each across many addresses | `too many confirmation attempts from this location` |
| **C3** | **single use** | a consumed code cannot mint a second session — **this one is the platform's**, and is named as such rather than claimed as ours | *(Supabase refuses; our cell asserts the second POST mints nothing)* |
| **C4** | **expiry** | the project's OTP expiry is shortened from the 24-hour default to **10 minutes** | *(the code simply fails)* |

**The attempt is recorded BEFORE the verification, never after.** Otherwise an attacker aborts the
request after a failed guess and is never counted — the counter must survive a killed connection.
The objects and the two doors are part 2 §1.8.

**C4 is project configuration, not repository content, and this design will not pretend otherwise.**
No route, migration or CI job can read the project's OTP expiry — the same class as the email
template. There is no fail-closed trick available here: a 24-hour code still verifies. **So C4 is a
named Wave-G setup act with an owner receipt, and C1/C2 are what bound the exposure if it is
missed** — five guesses per fifteen minutes makes even a 24-hour window worth about 480 attempts
against a million-code space. The design states this rather than implying the expiry is enforced.

### 3.5 · Where the wall lives — the DB, reached server-to-server

裁-64① says the DB stays the wall. But the confirming caller **has no session yet** — they are
confirming in order to get one — so the doors cannot be `clara_authenticated`, and G3 established
that **`apps/web` holds no database credential**, a property worth keeping. So the runtime holds the
DSN, as it already does, and the confirm route reaches it.

**It reaches it DIRECTLY, server-to-server, reading `CLARA_RUNTIME_URL` itself — NOT through the
generic proxy.** An earlier draft routed it through `apps/web/app/api/runtime/[...path]/route.ts`,
and **that transport cannot run**:

- The proxy is **entrance 3 of the scope spine**, by name: `apps/web/lib/require-firm-scope.ts:17`
  lists it as *"app/api/runtime/[...path]/route.ts → 403, NEVER a redirect"*, `:257` registers it in
  `SCOPE_ENTRANCES` with `onDenial: "403"`, and the route itself calls `firmScopeGuard()`
  (`apps/web/app/api/runtime/[...path]/route.ts:131`, the guard at `require-firm-scope.ts:229`).
- `PUBLIC_PATH_PREFIXES` (`apps/web/lib/supabase/proxy.ts:62`) is
  `["/login", "/invite", "/signup", "/auth/confirm"]` — **/api/runtime is not in it**, so a session
  is required to reach the proxy at all.

**The confirming caller has no session and no firm BY DEFINITION, so that route refuses them twice
over** — and C1/C2 would have had no working home. **The proxy's guard is the feature, not an
obstacle:** it is a browser-facing, session-scoped surface, and the correct response to it refusing
a pre-session step is to stop using it there, never to widen it.

**The direct call adds no fourth server entry.** /auth/confirm is already public at the middleware
(the same `PUBLIC_PATH_PREFIXES` line), and the confirm POST is already one of §1.1's three named
server entries — it simply makes an outbound request of its own. **W-R's negative assertion is
untouched.** *Rejected alternative:* give `apps/web` its own DSN — it saves nothing and costs the
property G3 chose deliberately.

### 3.6 · What happens to #461's confirmation surface

**It keeps its shape and changes its input** — a materially smaller change than the PKCE redesign
would have been:

| | today (link flow) | under 裁-92 |
|---|---|---|
| the GET page | a landing card with an explicit button | **a code-entry form** (address + six digits) |
| the POST route | `proveSameOrigin` → `verifyOtp({type:'email', token_hash})` → seal | `proveSameOrigin` → **the C1/C2 wall** → `verifyOtp({email, token, type:'signup'})` → seal |
| `hasVerifiedSession` | kept verbatim | **kept verbatim** — a null session is still not evidence of success |

`proveSameOrigin` stays exactly as it is: it was never the binding, but it is still the CSRF wall on
a state-changing route, and `Origin: null` still 403s (cell W-G).

**The estate already does this.** The built invite-accept path verifies with `verifyOtp`, so this is
the shape the codebase uses for the adjacent journey — not a new mechanism.

**The three cards B3 specified for PKCE are superseded**, and the replacements map to the walls
rather than to an exchange's error classes:

| what happened | the card |
|---|---|
| the code does not match | *"that code is not right"* — **with the attempts remaining**, because the wall is the real defence and a person near lockout deserves to know |
| the code has expired | *"that code has expired"*, with a send-me-a-new-one control |
| C1 or C2 refused | *"too many attempts — wait N minutes, or request a new code"* |

### 3.7 · What survives, and what retires

- **RETIRED: the PKCE code exchange for signup**, the intermediate landing page, the
  `confirmation_url` origin check (**cell W-Q retires — there is no URL parameter to validate**),
  and the flow-id handling. There is no link, so none of it has a subject.
- **RETIRED: owner-batch item 85's amendment as this gate wrote it.** That paragraph told the owner
  to set the token-hash template, and v2 amended it to the PKCE intermediate-page form. **Under
  裁-92 the template emits `{{ .Token }}` and no link at all**, which moots the prefetch problem
  entirely — a mail scanner cannot consume a code it merely reads. The gate record carries the
  corrected setup line.
- **SURVIVES:** `flowType: "pkce"` remains the `@supabase/ssr` package default (it is hard-coded in
  both client factories; this design does not change it), and it still governs any *other* flow —
  password recovery, the invite magiclink arm. **Signup simply stops using the code exchange.**
- **SURVIVES:** every non-PKCE part of the confirmation surface — the same-origin wall, the explicit
  POST, the paint-only GET, `hasVerifiedSession`'s positive check.

### 3.8 · The residual, stated

**A person who can read the victim's mail can complete the signup.** That was true of the link flow
too. **What is new is that a person who can *guess* six digits inside the window can as well** —
which is what C1–C4 bound, and why they are walls with cells rather than settings. The cryptographic
binding PKCE would have given is genuinely gone; 裁-92 traded it for cross-device, knowingly, and
this design's job is to make the trade's cost small and visible rather than to relitigate it.

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
against the paying customer. Both polarities of this are cells (part 3 §4, W-J).

---

## 5 · Idempotency and partial failure

Every row is an acceptance cell, not a narrative. **No path may strand a paying customer without
a firm, and no path may mint two firms.**

> **v1 broke this guarantee; v2 repaired it; 裁-89 deletes the shape that could break it.** v1
> required an unconsumed payment while the minter consumed it, so the retry it called "rotation"
> was unreachable. v2 fixed that across three objects and a rotation rule. **v3 folds the door**,
> and the two rows that used to describe mid-journey states collapse into one that says *nothing
> partial exists* — the repair that needs no repairing.

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
| **anywhere inside ⑧** | **nothing partial exists.** The claim, the creation, the closure and the payment stamp are one transaction: it committed or it did not | the success or holding page | call ⑧ again. If it did not commit, W7 still passes and the whole thing runs; if it did, the registration carries `firm_id` and the door replays | **no** | no — the `FOR UPDATE` read plus `uq_membership_active_user` |
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
| **C-2** | `UNNUMBERED_checkout_gate_b` — `stripe_events`, `stripe_event_problems` (with its resolution columns), `stripe_object_map`, `record_stripe_event`, `apply_stripe_events`, **`list_stripe_event_problems` + `resolve_stripe_event_problem`**, the two roles, and the sweep role's **two** grants (the operator verbs are `clara_authenticated`, walled to the operator firm) | no | — |
| **C-3** | `UNNUMBERED_checkout_gate_c` — `uq_frr_id_applicant`, `checkout_intents` (with its pinned `dpa_version`), `firm_registration_payments` + `uq_frp_registration`, `open_checkout_intent`, `record_checkout_session`, **`claim_paid_firm`** (the folded door), the two `event_types` rows. **No `firm_admissions` change of any kind** | no | C-1, C-2 |
| ~~C-4~~ | **RETIRED by 裁-89.** The `create_firm` recut was the train's only D1 item and the fold cancels it — part 2 §1.4 | **none — the D1 inventory is EMPTY** | — |
| **C-5** | the runtime: the raw-body webhook router mounted **before** `src/index.ts:55`, the applier sweep, the trusted-IP courier | no | C-2 |
| **C-6** | `apps/web`: the **code-entry confirm route** (§3.6), the DPA step, the checkout and success routes (**route.ts handlers, never Server Actions — §1.1**), the holding page's three arms, the e2e | no | C-3, C-5 |

**D1 write-quiesce list: EMPTY.** No live body is replaced by this train. `clara.create_firm`
stays at `0147:497`, `prosrc` sha12 `59fa533d9c03`, **unrecut** — the folded door calls
`_create_firm_core` directly, exactly as `approve_firm_registration` already does. **Roster edits
land in the same PR as the objects they name** (`rig-meta.mjs`'s function and table rosters).

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
