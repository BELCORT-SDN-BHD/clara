# The checkout / signup gate — design of record, part 3

*Part 1 — the shape, the transport rule, the state machine, the CSRF binding, the rate wall, the
partial-failure analysis, the build sequence: [`checkout-gate-design.md`](checkout-gate-design.md).
Part 2 — the database objects:
[`checkout-gate-design-part2.md`](checkout-gate-design-part2.md). Owner questions:
[`checkout-gate-gate-record.md`](checkout-gate-gate-record.md).*

**This part carries the webhook contract, the surfaces, the environment and the acceptance
battery.** **v2, 2026-08-31** — the battery was rewritten in the fix round after the review proved four of its
mutants **non-discriminating on a rig**. Each cell now names a mutant that lands where
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
| /auth/confirm + /auth/confirm/verify | `code` replaces `token_hash`; `exchangeCodeForSession` replaces `verifyOtp`; `proveSameOrigin` is kept **verbatim** (part 1 §3.2). **`Referrer-Policy` on this page must be `strict-origin`, never `no-referrer`** — FS-2's NEW-A: `no-referrer` makes real browsers send `Origin: null` on the form POST, which this wall 403s. **`Origin: null` is never accepted.** |
| `/signup` step 2 **(client door call)** | gains the DPA step. The text is **read** by a server component from `dpa_documents` (body + sha) and passed down as props; **`sign_dpa` is then called from the client over PostgREST, exactly as step ③ already calls `claim_identity` and `request_firm_registration`** — `signup-firm-form.tsx` is `"use client"` and uses `callDoor`. **This is a decision, not an omission:** an unnamed server-side step under a no-Server-Actions heading is where a build lane reaches for an action. `sign_dpa` is a governed door, the caller is the person, and the client-RPC pattern is already built and reviewed. If a later lane needs it server-side, it adds POST /signup/dpa as a route handler and registers it — never an action. The sha submitted is the one the person was shown. The existing `NotBuiltNote` is **removed because the thing it names now exists**. **With zero `dpa_documents` rows** — the fail-closed default while gate question G5 is open — the step renders a `NotBuiltNote` saying the agreement is not yet published and checkout cannot open, and the checkout control is **absent, not disabled-looking**: nothing on the page may imply a signature was recorded when none was (NIT-8) |
| POST /checkout (new, server-only) | reads the trusted client-IP header → digest → `open_checkout_intent` → creates the Stripe Checkout Session in **subscription mode** at the zero-amount price id the door returned, with `payment_method_collection: 'always'` (NIT-1 — 裁-58/裁-73's ruled "card collected, nothing charged" must be *stated*, not left resting on a Stripe default that differs for zero-amount sessions) and `metadata: {clara_registration_id, clara_applicant, clara_intent_id}` → `record_checkout_session` → 303 to Stripe |
| /checkout/success (new) | **Stripe's `success_url` is a top-level navigation, so this arrives as a GET.** The GET is therefore **paint-only** — it renders "your payment went through; open your firm" with an explicit button — and a sibling route.ts POST does the work: `claim_paid_admission` → `create_firm` → `close_paid_registration` → redirect to the firm home. **This is the same GET-is-inert discipline the confirm page already has, applied to the route that CREATES THE FIRM** (M9); the first draft applied it to the confirmation and not here. Every refusal renders verbatim; **no optimistic UI**. The firm name passed to `create_firm` is the one `claim_paid_admission` returned from `firm_registration_requests.firm_name` — **the registration is the authority, never a form field re-typed on the success page** (NIT-6) |
| `/pending` | the three new arms of part 1 §2.1 |

The Stripe **secret** key is used only by the server-only checkout route and the runtime; it is
never bundled. Doors are called with the caller's own session token over PostgREST RPC
(`apps/web/lib/doors.ts:86`), so every door sees `jwt_sub()` = the person — never a service
identity.

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
| **W-D** | cross-caller | caller B claims caller A's paid registration → `CLR04 not your registration request`, **and A's payment row is untouched** | A claims it → a token | delete W6 |
| **W-E** | consumed admission | `create_firm` with an already-consumed token and a different op_key → `CLR04`; with the **same** op_key → the stored result, not a second firm | a fresh token → the firm | delete the `consumed_at` branch |
| **W-E2** | **superseded** admission | a token superseded by a later rotation → `CLR04`, same refusal string | the current token → the firm | delete the `superseded_at` conjunct from the recut |
| **W-F** | 裁-26 email binding | an admission bound to `a@x` presented by a session whose `_jwt_email()` is `b@x` → `CLR04` | the bound email's own session → the firm | delete the `bound_email` conjunct |
| **W-F2** | the minter cannot forget the binding | insert a `registration_id`-carrying admission with `bound_email` NULL → the CHECK refuses | a bound one inserts | drop `ck_firm_admissions_selfserve_bound` |
| **W-F3** | the minter cannot forget the **DPA** (M14) | insert a `registration_id`-carrying admission with `dpa_signature_id` NULL → the CHECK refuses | one carrying a signature inserts | drop `ck_firm_admissions_selfserve_dpa` |
| **W-G** | `Origin: null` | POST the verify route with `Origin: null` → **403** | the deployment's own origin → 303 | make `proveSameOrigin` return `{ok:true}` on an unparseable origin |
| **W-H** | **the browser binding** | a `code` minted in browser context **A**, POSTed from a fresh context **B** with no verifier cookie → the exchange fails and **no session cookie is written to B** (asserted on `Set-Cookie`, not on the redirect target) | the same `code` POSTed from **A** → a session, 303 | **the realistic wrong implementation:** resolve the verifier from a *server-side store keyed at signUp time* instead of the browser's cookie. That makes the exchange **succeed** for a verifier-less browser, so the refuse limb goes red while the positive control stays green. *(Replacing `exchangeCodeForSession` with `verifyOtp` was the previous mutant and is rejected: it reddens the POSITIVE control while the refuse limb still refuses — for the wrong reason.)* |
| **W-H2** | the cross-device refusal is **distinguishable** (BLOCKER-3) | a verifier-less exchange renders the *"open this on the device where you signed up"* card with its resend control — **not** the generic `status=invalid` | a mis-configured template and a stale code each render their own distinct card | collapse the three error classes into one `status=invalid` |
| **W-I** | DPA unsigned | `open_checkout_intent` with no signature → `CLR09`; **and `claim_paid_admission` likewise**, so a payment that somehow arrived still cannot buy a firm | signed at the intent's own version → both proceed | delete W8 / X7 |
| **W-I2** | DPA text integrity | `sign_dpa` with a `body_sha256` that is not the document's → `CLR10` | the matching sha → recorded | delete the sha comparison |
| **W-I3** | a DPA supersede does not strand a mid-flow customer (M8) | supersede the version after the intent opened → `claim_paid_admission` **still succeeds**, because W8 reads `checkout_intents.dpa_version` | a signature for a *different* version → refuse | bind W8 to the CURRENT version instead of the intent's |
| **W-J** | the rate wall, **both polarities** | a **second applicant** from the same digest within 24 h → `CLR09` | (a) a different digest → proceeds; (b) **the same applicant retrying → proceeds** | invert the "other applicants" predicate |
| **W-K** | one firm per registration | force two claim→create sequences on one registration → the second refuses; `firm_admissions` holds exactly one **consumed** row for it | one sequence → one firm | drop `uq_firm_admissions_registration_consumed` |
| **W-L** | **one firm per person** — see the panel below | | | |
| **W-M** | the applier resolves or complains | metadata naming nothing → **zero** payment rows and **one** `stripe_event_problems` row | resolving metadata → one payment, zero problems | make the applier `continue` silently |
| **W-N** | the applier cross-checks the intent | a signed event naming registration A but carrying A's *other* intent's session id, or a disagreeing applicant → a problem row, no payment | matching → applied | delete the intent cross-check |
| **W-M2** | a problem row does not exclude an event forever (M4) | resolve the problem row → the next sweep applies the event | an unresolved problem → still skipped | make the applier read the table without the `resolved_at is null` filter |
| **W-O** | the webhook role's blast radius | `clara_stripe_webhook` attempts `create_firm`, `claim_paid_admission`, `close_paid_registration` and `select … from clara.firms` → **permission denied** on all four | it may EXECUTE exactly the three functions in part 2 §1.6 | grant it `clara_authenticated` |
| **W-O2** | **what the webhook DSN CAN do, stated honestly** (M11) | holding the DSN, forge a `checkout.session.completed` naming a real `(registration, applicant, intent, session)` tuple → **the applier applies it.** The cell asserts this *is* the behaviour, so the threat model is written down rather than assumed away | — | **a MUST-NOT-RED control**: it pins the measured truth that the webhook DSN is equivalent in power to the signing secret |
| **W-P** | registration closure | after ⑧ the registration carries `status='approved'` and the firm id | — | delete the `close_paid_registration` call. **Only the `status`/`firm_id` limb discriminates** — the holding page's redirect does NOT redden, because `holdingStateFrom` returns `{kind:"member"}` from `caller_context` before it reads any registration row (NIT-4). The redirect is therefore asserted as a control, not as a mutant limb |
| **W-P2** | the closer is reachable by a principal that exists (M5) | kill the success route between `create_firm` and the close → the one-minute sweep's `reconcile_paid_registrations` closes it | a registration with no consumed admission is left alone | narrow the sweep's grant to the two webhook verbs |
| **W-Q** | the intermediate page is not an open redirect | a confirmation-URL parameter whose origin is **not** the project's Supabase URL → `status=invalid` and **no link rendered** | the project's own URL → the button renders | compare only the path, or a suffix, instead of the origin |
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
| **m1** | delete the exists-check **AND** drop `uq_membership_active_user` | **MUST GO RED** — a second firm is created for a user who already holds an active membership |
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

**A · The primary assertion — train-scoped.** For each of §1.1's **three** server entries (the
confirm verify POST, POST /checkout, the /checkout/success POST):

| limb | assertion |
|---|---|
| **it is a route leaf** | the file's basename matches the census's **own** `LEAF` regex, imported from the census module rather than re-typed, and the module exports an HTTP method |
| **it is declared** | its route path appears in `SCOPE_UNSCOPED_SURFACES` **with a non-empty reason** — the forced declaration §1.1 leans on |
| **mutant** | re-implement any one of the three as a `"use server"` export → **RED on both limbs**: it is no longer a route leaf, and it cannot be registered as one |
| **MUST-NOT-RED control** | adding an unrelated legitimate `page.tsx` or route.ts elsewhere in the app must **not** redden this cell — the assertion is about *this train's* entries, not the repo's shape |

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
`'use server'` in single quotes**, which is equally valid. The tripwire uses the census's own
`stripComments(src, { blankStrings: true })` (imported, not reimplemented) and checks the module's
**first statement**, not any occurrence.

**The planting demonstration is re-run with four plants, and the instrument must get all four
verdicts right:** a double-quoted directive → **RED** · a single-quoted directive → **RED** · the
literal inside a comment → **NOT red** · the literal inside a string constant → **NOT red**. Two
of those are the decoys that would have fooled v1's grep.

---

## 5 · The non-wall cells

1. **`clara.event_types` gains exactly two rows**, and the registry's coverage is proven whole
   both before and after — the estate's registration discipline, not a count.
2. **A positive set equality, in both directions** (billing Annex D's T.2 discipline): the set of
   `clara` functions whose body references `stripe_events` or `firm_registration_payments` equals
   exactly `{record_stripe_event, apply_stripe_events, claim_paid_admission,
   close_paid_registration, reconcile_paid_registrations}`.
3. **`create_firm`'s recut delta** is proven by inverse re-substitution back to the pinned
   pre-image sha `59fa533d9c03`, with `proacl`, owner, `search_path` and the `SECURITY DEFINER`
   posture re-asserted unmoved.
4. **No `clara` role holds `BYPASSRLS` after this train** — a whole-roster read, not a check of
   the new role alone.
5. Every new table read from the catalog **by property** as RLS enabled AND forced with zero
   application-role grants.
6. **Nothing is deleted** (裁-74): a superseded admission is asserted still present with
   `superseded_at` set, and `firm_admissions` row counts only ever rise across the whole battery.

---

## 6 · The e2e (裁-86, orders §A step 2)

`pnpm --filter @clara/web build` → `next start` → Playwright on the **built** app against a
throwaway test firm (ADR-0075), axe riding the walk: signup → confirm **in the initiating browser
context** → `claim_identity` + `request_firm_registration` → sign the DPA → checkout in Stripe
TEST with a test card → the webhook → the firm born → the firm home.

**Three negative arms, each in its own browser context — these are the legs that prove the
walls; the happy path alone passes just as well with every hole open:**

1. **W-H's refuse limb** — the same `code` from a second context, asserting no `Set-Cookie`.
2. **W-H2** — that the second context sees the *cross-device* card, not the generic invalid one.
3. **W-D** — a second signed-in test user attempting the first's paid registration.

The suite lands under apps/web/e2e/, which FS-2 creates.

**The instrument traps this train inherits.** A `fetch` from a test is not a browser; a `curl`
with a forged `Origin` is not the browser; the check runs against the built app, never
`next dev`. The sibling recorded with the CSRF finding — the e2e mock cannot prove single-use
replay — is closed by making the mock **consume** the token and adding a second-POST cell.
