# Security pass — PR #493's doors, the runtime chat lane, the pre-session confirm surface

**Ordered by the owner 2026-09-02 (裁-120).** Fresh-context, read-only, adversarial, refute-first.
Nothing under the repo or its worktrees was edited.

| | |
|---|---|
| Scope A | PR #493 coa/fs4-c3-folded-door @ `8d3902ae` — migration packages/db/migrations/0161_checkout_gate_c3_folded_door.sql, nine new objects, against merged `0158` (C-1) and `0160` (C-2) |
| Scope B | `packages/runtime/lib/authz.mjs`, `packages/runtime/src/chatRoutes.ts`, `packages/runtime/src/streamRoute.ts`, `clara.begin_chat_turn`, the share door, `apps/web/lib/clara/*` |
| Scope C | the pre-session confirm surface **as shipped on `origin/main` `944cb586`** (NOT the stale local `main` `33e94855` — `#499` and `#495` landed after it) |
| Rig | throwaway `postgres:17` in WSL, `secpass-rig`, `127.0.0.1:56074`, migrated `0001→0161` (156 migrations) + seeded. Password generated in-container, env-only, never printed. **Torn down: y** (see the last line) |
| Instruments | `scratchpad/lanes/sec-pass/{attack-a,attack-b,probe-b,probe-b2,census}.mjs` — my own batteries, not the author's checkout-gate-c3.test.mjs |

**Bottom line: no BLOCKER against the nine new objects.** Every tenancy, ownership, replay and
ACL wall I attacked held on the rig, including the ones the brief named as likely soft spots
(cross-registration claim, foreign/consumed payment, second-firm mint, the 裁-107 M1 per-address
OTP keying, `SECURITY DEFINER` search_path pins, PUBLIC grants, forced RLS, the relacl and trigger
censuses). Eight MATERIAL findings follow, five of them money- or consent-shaped, plus the
cutover checklist. Three of the MATERIALs are **not `0161`'s to fix** — they are unwritten
obligations on C-5 that will be inherited silently if nobody records them now.

---

## Surface A — the nine new objects

### A-M1 · MATERIAL · `open_checkout_intent` takes an `op_key` that does nothing, and a double-click buys the firm twice

`packages/db/migrations/0161_checkout_gate_c3_folded_door.sql:411`

```sql
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
```

That is the **only** use of `p_op_key` in the whole body. It is never hashed, never reserved,
never compared. The same is true in `sign_dpa:357`, `record_checkout_session:502` and
`claim_paid_firm:558`. The file's own §4 header says why — *"Pre-firm idempotency is structural;
no firm-scoped `op_receipt` can exist yet"* — and for the other three doors that is true: they
replay off `uq_dpa_signatures_user_version`, off `checkout_intents.session_id`, and off
`firm_registration_requests.firm_id`. **`open_checkout_intent` has no such structure.** Every
call inserts a fresh `checkout_intents` row and a fresh `registration_rate_events` row.

**Attack run (attack-a.mjs §3, attack-b.mjs §9):**

```
OPKEY-NOT-IDEMPOTENT open_checkout_intent same op_key twice
  -> f7a5f457-9ec3-44ea-a849-a3959f566ca8 vs 3bd1f72e-6c62-4e49-87bd-a00cd2ef483c
info intents for regA = 3; rate events for A = 3
```

Then the money path, both sessions opened before either is paid (a double-click, a retry, two
tabs — no attacker needed):

```
info two intents from the SAME op_key: 3489b906-… / 46a1c408-…
info first paid session  -> {"applied":1,"examined":1,"problems":0}
info SECOND paid session -> {"applied":0,"examined":1,"problems":1}
info open problems: [{"problem":"duplicate_payment","n":1}, …]
info payment rows for G's registration = 1 (a second real charge with no second row)
```

`uq_frp_registration` correctly refuses the second payment row, and C-2 parks it as
`duplicate_payment` — the DB stays consistent. But the customer has been charged twice and the
estate holds one payment row plus one problem row, with no refund path in this cohort.

**Refutation attempted, and it failed.** I checked whether X10 closes the window: it does, but
only *after* the first payment lands (`attack-b.mjs §8`: opening a second intent post-payment
raises `CLR09 this registration is already paid` at `0161:457`). The double-pay window is the
interval between the two Stripe sessions being created and the first webhook arriving — i.e.
exactly the window a retry lives in. I also checked the design: `checkout-gate-design-part2.md:404-416`'s
X-cell table lists X1–X10 and specifies op_key only as *"op_key"* in the X1–X6 roll-up. **The
design never ruled idempotency for this door either**, so this is a design-level gap the door
faithfully implements, not a build defect.

**Fix shape.** Not a `0161` edit — the tail pins `checkout_intents`' column list at
`0161:120-128`, so an `op_key` column is a C-4/C-5 migration. Two candidates: (a) add
`checkout_intents.op_key` with `unique (registration_id, op_key)` and a replay branch returning
the existing `{intent_id, price_local_key, stripe_price_id}`; or (b) cheaper and no schema change
— reuse the caller's existing unstamped intent: `select … from checkout_intents where
registration_id = p_registration and applicant = v_actor and session_id is null … for update` and
return it instead of inserting. (b) also stops the unbounded `registration_rate_events` growth a
retry loop causes.

**Gates beta by my reading.** 裁-57 makes this a paid launch and hard constraint 1 puts
accounting-correctness above everything; a door that can take a second real charge it can never
reconcile is the wrong side of that line. The owner may reasonably rule it acceptable for a
zero-amount beta (`billing_plans.amount_cents = 0`, `amounts_ruled = false` at `0161:203-211`) —
at RM0 nobody is double-charged — in which case it becomes a hard blocker on the 裁-28 pricing
sitting instead. That is the owner's call, not mine.

---

### A-M2 · MATERIAL · `a verified email claim is required` is a null check, on the door that mints the firm

`packages/db/migrations/0161_checkout_gate_c3_folded_door.sql:567-570`

```sql
  v_email:=clara._jwt_email();
  if v_email is null then
    raise exception 'a verified email claim is required' using errcode='CLR04';
  end if;
```

`v_email` is never read again. It is not compared to `clara.users.email`, not to the
registration, not to anything. Every sibling use of `_jwt_email()` in the estate *compares* it —
`accept_invite` at `0145:707-710` refuses `'the signed-in email does not match this invite'`.
This one does not.

**Attack run (attack-b.mjs §10):**

```
OK  H claims with a jwt email that is NOT its own (db email=s2_H_d320592c@rig.test)
      -> {"firm_id":"75d3bf26-…","plan_id":"66db2005-…","registration_id":"1e32df03-…"}
ERR H claims with an empty-string email claim -> CLR04 a verified email claim is required
```

The firm was minted for a caller presenting `email: "attacker@evil.example"`.

**Refutation attempted.** The claim is not forgeable in production: the JWT is Supabase-signed and
`packages/runtime/lib/authz.mjs:104-131` pins issuer, audience and an algorithm allowlist, so a
caller cannot choose their own `email`. So this is **not an exploitable hole today** — it is a
*false wall*. Two consequences that are real: (1) the sentence tells a reader (and the next
build lane, and this pass's successor) that the DB enforces email verification on the money
door. It does not, and nothing else in the DB does either. That is law 3 exactly — spelling is
not identity. (2) `_jwt_email()` reads the `email` claim, which Supabase populates regardless of
confirmation state; `email_confirmed_at` is the verification signal and is never consulted.

**Fix shape.** Either bind it (`if v_email is distinct from (select lower(u.email) from
clara.users u where u.id = v_actor) then raise …`) or rename the refusal to what it checks
(`'an email claim is required'`) and add one line saying the *verification* wall lives in the auth
provider, not here. I recommend binding: it costs nothing and makes the sentence true.

**Does not gate merge.** It gates the cutover checklist (item 6 below), because the FS-10
acceptance line's whole subject is where the confirmation wall actually is.

---

### A-M3 · MATERIAL · `settle_confirmation_attempt` has no caller binding, and settling `'accepted'` resets the rate-limit budget

`packages/db/migrations/0161_checkout_gate_c3_folded_door.sql:781-802`. The verb takes a bare
`p_attempt uuid` and stamps it. It proves nothing about who claimed that attempt — structurally
it cannot, since the whole lane is pre-session. Combined with the counting predicate at
`:690` and `:695` (`a.outcome is distinct from 'accepted'`), an `'accepted'` stamp **removes the
row from both limbs' windows**.

**Attack run (attack-b.mjs §14 / attack-a.mjs §6):**

```
OK  auth_wall settles an ARBITRARY attempt id as accepted (no caller binding)
      -> {"outcome":"accepted","attempt_id":"3e9b7486-…"}
info after settling every attempt as ACCEPTED, next claim =
      {"allowed":true,"remaining":4,"scope":null,"retry_after_seconds":null}
```

A fully exhausted email digest went back to a full budget of five.

**Refutation attempted, and it holds for today.** The verb is reachable only by `clara_auth_wall`
(measured: `clara_auth_wall executable routines: ["clara.claim_confirmation_attempt(bytea,bytea)",
"clara.settle_confirmation_attempt(uuid,text)"]`, and `clara_authenticated` → `42501`). Today
nothing calls it: `apps/web/app/(entry)/auth/confirm/verify/confirmation-wall.ts:219` on
`origin/main` is `export const settleConfirmationAttempt: SettleConfirmationAttempt = async () =>
{};`. And in the shipped handler the whole claim→verify→settle sequence happens inside one
server-side POST (`…/verify/handler.ts:208-247`), so `attemptId` never reaches a browser. So
there is **no live exposure**.

**The finding is the unwritten obligation.** I searched the design pack for any rule constraining
how C-5's route handles the attempt id:

```
$ grep -rn "attempt_id\|attemptId" docs/plan/active/checkout-gate-design*.md \
      docs/plan/active/checkout-gate-gate-record.md
docs/plan/active/checkout-gate-design-part3.md:119: Returns `{attempt_id, allowed, remaining}` — …
```

One mention, as a return value. Nowhere does any document say the runtime route must never accept
a client-supplied `attempt_id`, must never expose settle as its own endpoint, and must never let
a caller choose the outcome. C-5 is being handed a verb whose only wall is a convention nobody
wrote down. That is how this class gets built wrong.

**Fix shape.** Add three sentences to `checkout-gate-design-part3.md` §2.1 and to C-5's work
order: the runtime exposes **one** endpoint that performs claim → `verifyOtp` → settle
server-side in a single request; `attempt_id` is request-scoped state and never crosses the wire
to a client; `outcome` is derived from `verifyOtp`'s own result, never from the request body.
Optionally harden the verb itself by having `claim_confirmation_attempt` return a short-lived
opaque settle token instead of the raw uuid — but the route contract is the cheaper and
sufficient wall.

**Gates C-5, not #493.**

---

### A-M4 · MATERIAL · a paid applicant who joins a firm before claiming is stranded, and no surface can see it

`_create_firm_core` (`0145`) refuses an actor who already holds an active membership. That wall is
correct and I am not asking for it to move. But `claim_paid_firm` reaches it **after** the
payment has landed and before consuming it.

**Attack run (attack-b.mjs §11):**

```
ERR K (paid, now a member elsewhere) claims its firm -> CLR10 actor already belongs to a firm
info K payment consumed_at after the refusal = null (money taken, no firm, no un-consume door)
```

The refusal is correct and the transaction rolls back cleanly. What is missing is anything that
can *see* the result. Census on the rig (census.mjs):

```
functions naming firm_registration_payments: apply_stripe_events, claim_paid_firm, open_checkout_intent
views/relations exposing payments: (none)
apply_stripe_events: clara_fn_owner,clara_stripe_webhook
claim_paid_firm:      clara_authenticated,clara_fn_owner
open_checkout_intent: clara_authenticated,clara_fn_owner
```

There is **no operator read door and no view** over `firm_registration_payments`. A row with
`consumed_at is null` whose registration can never be claimed is not a `stripe_event_problems`
row either — C-2's applier processed it perfectly. It is invisible.

**Refutation attempted.** I checked whether this state is only reachable by a contrived setup. It
is not: the applicant pays, then accepts a colleague's invite (or is added by `add_member`) before
returning to /checkout/success. That is an ordinary Tuesday for a two-person firm. I also
checked whether the replay branch rescues them — it does not; `v_req.firm_id` is still null, so
control reaches `_create_firm_core` every time.

**Fix shape.** One owner-only read (`clara.list_unconsumed_registration_payments()`, granted to
whatever the operator lane turns out to be) so the condition is *visible*, plus a line in the
support runbook. A refund/release door is a bigger question and should go to the owner rather
than be invented by a review lane.

**Gates beta operationally.** Not a merge blocker on #493. A paid launch cannot ship with a
money-taken-nothing-delivered state that no query in the estate can find.

---

### A-M5 · MATERIAL · `livemode` is stored and never read; a test-mode event mints a real firm

`packages/db/migrations/0160_checkout_gate_c2_stripe_events.sql:158` declares
`livemode boolean not null` and `:321` writes it. Census over the whole repo (ripgrep, all
`*.sql|*.ts|*.tsx|*.mjs|*.js|*.md`, excluding `node_modules` and worktrees) finds exactly four
non-test occurrences: the column, the write, and two design-doc lines. **No gate reads it** — not
`apply_stripe_events`, not `claim_paid_firm`, not `apps/web`, not the runtime.

**Refutation attempted, and it partly succeeds.** `checkout-gate-design-part2.md:74` rules the
intent: `livemode boolean not null, -- G13: a TEST-mode beta must be able to SEE that`. Storing
without gating is therefore *deliberate*, because the beta itself runs in Stripe TEST mode
(`docs/ops/wave-g-setup-checklist.md:60-65`: *"The Wave-G walk exercises checkout in Stripe TEST
mode at a non-zero test price"*, and `checkout-gate-design-part3.md` §3 pins `STRIPE_SECRET_KEY`
as a *"TEST-mode restricted key until the launch sitting (裁-81/87)"*). So this is not a defect
today.

**It becomes one at exactly one moment: the flip to live mode.** From then on, a test-mode
`checkout.session.completed` — free test card, no money — delivered to the same endpoint mints a
real firm, because nothing anywhere compares `livemode` to the mode the deployment believes it is
in. Stripe sends test and live events to separately-configured endpoints, so this needs a
misconfiguration to trigger; misconfiguring one webhook endpoint during a mode flip is a common
mistake, not an exotic one.

**Fix shape.** One environment-pinned conjunct in `apply_stripe_events` (or, cheaper and outside
the frozen applier body, in C-5's webhook route before `record_stripe_event`): refuse an event
whose `livemode` disagrees with `CLARA_STRIPE_LIVEMODE`. Cutover checklist item 9 below.

**Gates the cutover, not the merge.**

---

### A-N1 · NIT · `retry_after_seconds` can come back NULL under a concurrent settle

`0161:709-771`. `v_email_count` is computed at `:686-691`; the offset row is fetched at
`:735-745` with the *same* predicate. Under READ COMMITTED each statement takes a fresh snapshot.
`claim_confirmation_attempt` holds advisory locks on both digests (`:670-681`), but
`settle_confirmation_attempt` takes **neither** — so a settle to `'accepted'` landing between the
two statements shrinks the row set, `offset v_email_count-4` overshoots, `v_retry_email` stays
NULL, and `if v_retry_email>=v_retry_origin` at `:765` evaluates to NULL → the `else` arm →
`scope:'origin'` with a possibly-NULL `retry_after_seconds`. The seam types that field as
`number` (`confirmation-wall.ts`), so the page falls through to the generic `invalid` card
instead of the honest wait.

**Hand-traced, not reproduced** — I could not inject a statement between two statements inside a
plpgsql body without a lock to hold. Fails closed (`allowed` is already false); the damage is a
wrong card, not an admitted caller. Fix: `coalesce(v_retry_email,0) >= coalesce(v_retry_origin,0)`
and `coalesce(…, 0)` on the assignment, or take the same advisory locks in `settle`.

### A-N2 · NIT · the refused OTP claim leaks whether an address has recent attempts

`0161:702`. `remaining` is derived from `greatest(v_email_count, v_origin_count)` over a
caller-supplied email digest. Measured (attack-b.mjs §14): an unseen address returns
`remaining:4`; a hammered one returns `allowed:false, remaining:0, retry:900`. A caller who can
reach the C-5 route can therefore distinguish "this address has been in the confirm flow
recently" from "it has not", and can hold any known address locked out with five requests every
fifteen minutes. **Refutation:** this is the inherent cost of the per-address keying 裁-107 M1
*required*, and the seam's `rejected` arm deliberately carries only `scope` + `retryAfterSeconds`,
not `remaining`, so the refusal path leaks nothing. Only the `allowed` path carries `remaining`.
Worth one sentence in part 3 §2.1 acknowledging the trade rather than a code change.

### A-N3 · NIT · the origin limb is one registration per address per day, and a peppered digest cannot be diagnosed

`0161:437-445` refuses when *any other* applicant used the same `origin_digest` in 24h. Measured:
`D opens an intent from the SAME origin digest A used -> CLR09 too many firm registrations from
this location today`. Behind Malaysian mobile CGNAT or a shared office NAT, the first signup of
the day locks out everyone else at that address for 24 hours, and because the value at rest is
`sha256(pepper ‖ address)` (裁-64① option B, `checkout-gate-design.md:363-372`) an operator
handling the support call cannot tell which address it was. This is the ruled design, not a
defect — recorded so the support runbook expects the call.

### A-N4 · NIT · the role-census arithmetic in `roles-bootstrap.sql` is stale by two

`packages/db/deploy/roles-bootstrap.sql:20-33` (as amended by this PR) reads *"the census pre-0160
reproduced exactly (12 clara_% roles + clara_storage_docs); 0160 adds two more and C-3 adds two
more (18 schema-lane roles + clara_storage_docs)"*. 12 + 2 + 2 = 16, not 18. Measured on the rig
(census.mjs): **18** `clara_%` roles after `0161`, `clara_storage_docs` absent (it is
`packages/db/deploy/storage-provision.sql`'s). So the *final* number is right and the two intermediate
baselines are stale — pre-`0160` is 14, not 12. The number a drift check would read is correct;
the arithmetic a reader would check it against is not.

---

### Surface A — what held (positive evidence, all measured)

Every one of these is a `REFUSED-OK` line from attack-a.mjs / attack-b.mjs, not an inference.

- **Cross-registration claim.** `B claims A's PAID registration -> CLR04 not your registration
  request`. `N claims using M's paid registration id -> CLR04`.
- **Unpaid / consumed / foreign payment.** `C (unpaid, own reg) claims -> CLR09 no completed
  payment`. Re-claim on a consumed payment (registration forced back to `open` by superuser —
  a state no door can produce) → `CLR09`. Re-pointing a payment at another registration →
  `CLR10` from the consumption-stamp trigger.
- **Second firm.** `A active memberships after double-claim = 1`. Concurrent double claim:
  `{firm_id:4bd4486b…} || {replay:true, firm_id:4bd4486b…}`, one firm, `L active memberships = 1`.
- **裁-107 M1 (per-address digest, not a global value).** `confirmation_attempts.email_digest` is
  a 32-byte per-address digest with its own index (`0161:274-289`); the two limbs count
  independently. Measured budget: `remaining` runs 4,3,2,1,0 then `allowed:false` on the sixth —
  exactly five attempts, F5's arithmetic is right.
- **Consumption / append-only.** Un-consume → `CLR10`; delete → `CLR08`; truncate → `CLR08`;
  delete a confirmation attempt → `CLR08`. `t_frp_consumption_stamp`, `t_frp_append_only`,
  `t_frp_no_truncate` and the three `confirmation_attempts` twins all present and `tgenabled='O'`
  (裁-106 trigger census, measured from `pg_trigger`).
- **`SECURITY DEFINER` posture.** All nine functions: `prosecdef=true`,
  `proconfig=["search_path=clara, pg_temp"]`, owner `clara_fn_owner`.
- **PUBLIC / relacl.** A bare `secpass_nobody` role is refused at `permission denied for schema
  clara` on every door including the trigger functions. `relacl` on the three new tables lists
  `clara_fn_owner` and nothing else, for all eight privileges. RLS `enabled + forced` on all three
  with exactly one owner-only policy each.
- **Auth-wall confinement.** `clara_auth_wall` and `clara_auth_wall_login` are both
  `rolcanlogin=false, rolsuper=false, rolbypassrls=false, rolcreaterole=false, rolcreatedb=false,
  rolreplication=false`; effective EXECUTE is exactly the two verbs; zero effective relation
  privileges in `clara`; `clara_authenticated` → `42501` on both verbs; `clara_auth_wall` →
  `42501` on all five human doors and all three tables.
- **Agent identity.** `agent sign_dpa -> CLR04`; `agent claim_paid_firm -> CLR04`.
- **Session-id collision (my own hypothesis, refuted).** I expected user B to be able to stamp A's
  Stripe session id onto B's intent. `uq_checkout_intents_session_id` (`0158:229`) refuses it:
  `23505 duplicate key value violates unique constraint "uq_checkout_intents_session_id"`. C-2's
  applier additionally proves intent↔session↔registration↔applicant congruence
  (`0160:422-435`) before writing a payment row.
- **Refusal-code leakage (裁-109 N3 class).** `claim_paid_firm`'s refusals are `CLR04 not your
  registration request` for a foreign registration and `CLR10 unknown registration request` for a
  nonexistent one — these *are* distinguishable, but a registration id is a server-minted uuid the
  caller can only have if it is theirs, so this is not an oracle over anything guessable. Not
  raised as a finding.
- **裁-112(c) duplicated-predicate check.** I looked for cells that prove a wall by restating it.
  The one shape I found is the route's `assertSessionAccess` and `begin_chat_turn`'s own
  continuation check (surface B) expressing the same predicate — but those are two *enforcement*
  points at different layers, which is defence in depth, not a duplicated proof. `0161`'s tail
  re-reads the catalog positively after privileges are final rather than restating the DDL.

---

## Surface B — the runtime chat lane

### B-M1 · MATERIAL · the rail silently posts the user into a colleague's shared thread

`apps/web/lib/clara/useActiveThread.ts:29`

```ts
const match = sessions.find((s) => (clientId ? s.client_id === clientId : s.client_id === null));
```

`listSessions` is `chatRoutes.ts:104-108`, `order by created_at desc limit 200`, over
`visibility='firm' or created_by=$2`. So `find` returns **the newest visible session at that
altitude, which may be a colleague's firm-shared thread**. There is no `created_by === me` term.
The user's composer then posts into it.

**Measured on the rig (probe-b.mjs §B6, probe-b2.mjs §B3'):**

```
info B's visible list at firm …: [{"t":"A shared on client One","v":"firm","mine":false,"client":"…"}]
RAIL-REPOINT useActiveThreadId's find() for client One would pick "A shared on client One"
      (author is A (a colleague))
OK  B begins a turn on A's shared session -> {"status":"queued","task_id":"75656dd1-…"}
info A's shared thread now contains: [{"role":"user","t":"B speaks in A's thread","task_id":"75656dd1-…"}]
info A (the author) can read B's message: 1 row(s)
```

B never chose that thread. B's words are now in A's thread, readable by A and by every member of
the firm.

**Refutation attempted.** This is *permitted*: ruling 9 makes a firm-shared session continuable by
any member, and `begin_chat_turn:945` enforces exactly that. So it is not an authorisation
breach. It is a consent-and-attribution defect: the wall is right, the *default selection* is
wrong. And it is not self-correcting, because of B-M2's sibling fact below — sharing is one-way
(`_tf_chat_session_update`, measured: `owner sets a shared session back to private -> CLR08 a
chat session may only go private->firm`). Once any colleague shares a thread at an altitude,
every other member's rail at that altitude points at it **permanently**, until someone happens to
create a newer one.

**Fix shape.** `sessions.find((s) => matchesAltitude(s) && s.created_by === me)`, falling back to
`createSession` — the user's own thread, always. A colleague's shared thread should be reachable
by an explicit affordance ("open the firm's thread"), never as the silent default. `SessionRow`
already carries `created_by` (`apps/web/lib/clara/api.ts:26`), so the data is in hand.

**Gates beta by my reading.** Hard constraint 1's product side: the dashboard is the agent's body
language, and a composer that files your words somewhere you did not choose is the body language
lying. It is also a poor fit with a DPA the customer signs at signup.

### B-M2 · MATERIAL · a thread from client A opens under client B's URL, with client B's live doors beside it (IA-06 / IA-10)

The chain, end to end:

- `apps/web/app/(full)/clients/[clientId]/clara/[threadId]/page.tsx:22` passes the URL's
  `clientId` and the URL's `threadId` to `ClaraFullScreenThread` with no cross-check.
- `ClaraFullScreenThread.tsx:65` hands both down; `:34-37`'s own comment says `clientId` is
  *"the `OnboardingChecklistCard` mount"* — i.e. the URL's client mounts the live doors.
- `apps/web/lib/clara/api.ts:110-115` (`getMessages`) sends only the session id. No client.
- `packages/runtime/src/chatRoutes.ts:120-133` reads messages after `assertSessionAccess` only.
- `packages/runtime/lib/authz.mjs:183-196` selects `id, firm_id, visibility, created_by, title,
  created_at` — **`client_id` is not in the projection and not in the predicate.**

So the transcript is client A's and the checklist card beside it is client B's, and nothing at any
layer objects.

**The DB is not the problem, and I proved that rather than assuming it.** The brief asks what the
DB does if a turn on session A carries tool calls scoped to client B. Answer: the caller's value
is discarded. `_tf_agent_task_insert` (`0006_runtime_core.sql`, *"caller firm/client are
OVERWRITTEN"*) derives the task's client from the session. Measured (probe-b2.mjs §B4'):

```
OK  runtime inserts a chat_turn task claiming client TWO on a client-ONE session
      -> {"id":"3ab94506-…","client_id":"b4335e16-…"}
DERIVED-OVERWRITES-CALLER stored client_id=b4335e16-… (caller passed 999675e8-…, session carries b4335e16-…)
```

**So there is no cross-client tool-scope escape.** The defect is entirely in what the human sees:
a person reading client A's conversation while client B's doors sit next to it, one click from
acting on the wrong books. On an accounting product that is the failure mode hard constraint 1
exists for.

**Fix shape.** Cheapest honest fix: have the page load the session (`loadChatSession` already
exists at `apps/web/lib/firm-admin/chat-sharing.ts:47`, and `chat_sessions` carries a
`clara_authenticated` SELECT grant under the visibility policy) and render `not_found` when
`session.client_id !== clientId`. Structural fix: add `client_id` to `assertSessionAccess`'s
projection and let the route take an optional asserted client, 404-ing on mismatch — same
indistinguishable-404 discipline the module already keeps.

**Gates beta by my reading**, on the same product-integrity ground as B-M1.

### B-M3 · MATERIAL · SSE authorisation is evaluated once at attach and never again for up to 30 minutes

`packages/runtime/src/streamRoute.ts:33-45` runs `authenticate` + `assertTaskStreamAccess` inside
one `withRuntime` before the SSE loop. `:17` sets `STREAM_MAX_MS` to `30 * 60 * 1000`. Searching
the whole file for `authenticate` and `assertTaskStreamAccess` finds them at `:12`, `:35`, `:36`
only — nothing inside the poll loop.

`packages/runtime/lib/authz.mjs:11-14` promises the opposite: *"Principal resolution … evaluated
PER REQUEST (a revoked member's next turn is rejected — no cached membership)"*. That is true for
a turn. A stream **is** one request, so a member removed from the firm keeps receiving the live
agent transcript until the stream ends or the 30-minute deadline expires.

**Refutation attempted.** Bounded, requires an already-open stream, and covers only the one task
already authorised. Not a way in — a way to *stay* in. Fix: re-run `assertTaskStreamAccess` on the
existing poll tick (it already queries the DB every `POLL_MS`) and close the stream on
`AuthError`. Small change, and it makes the module header true.

**Does not gate beta** by my reading; it should ride the next runtime PR.

### Surface B — what held

- **No cross-firm path.** `Z (other firm) reads A's SHARED session -> rows=0`. `Z continues A's
  SHARED session -> CLR04 author is not a live active member of the session firm`. `resolvePrincipal`
  re-reads live membership per request (`authz.mjs:143-150`) and `uq_membership_active_user`
  makes `p.firmId` unambiguous.
- **No colleague can read or continue a PRIVATE session.** `B (same firm, not author) reads A's
  PRIVATE session -> rows=0`; its messages → `0`; `B continues A's PRIVATE session -> CLR11
  session not found` — the no-oracle refusal, indistinguishable from a missing session, matching
  `assertSessionAccess`'s own 404 contract.
- **The share door.** `clara.share_chat_session` (`0006:894-915`) is author-only
  (`s.created_by <> c.actor` → CLR04), in-firm, viewer-floor, idempotent, audited, and goes
  through PostgREST as `clara_authenticated` — not a runtime route.
- **Un-share is structurally impossible**, and so is re-pointing a session's client or deleting
  one: `CLR08 a chat session may only go private->firm`, `CLR08 only visibility may change on a
  chat session`, `CLR08 chat sessions are not deleted`.

---

## Surface C — the pre-session confirm surface, and the exposure order

**As shipped on `origin/main` `944cb586` the confirm surface is fail-closed and cannot be used at
all.** Both Lane-B seams refuse unconditionally:
`apps/web/app/(entry)/auth/confirm/verify/confirmation-wall.ts:209-211` returns
`{kind:"unavailable"}` for every claim, and `:219` makes settle a no-op. `#499` additionally
closed 裁-109's N1 (the forgeable status card) by moving the outcome into an httpOnly
`__Host-clara-confirm-flash` cookie with a nonce (`confirm-flash.ts`), and closed N3 (the
banned-account oracle) by collapsing the `expired` classification.

So the code-entry path is not the exposure. **Three other things are**, and they are the reason
the FS-10 acceptance line — `PROGRESS.md:385`, *"self-serve signup unreachable in the deployed
build until the wall is wired"* — has to be read as covering the whole `/signup` surface, not just
/auth/confirm:

1. **`/signup` step 1 sends email from the browser, unwalled.**
   `apps/web/components/entry/signup-account-form.tsx:1` is `"use client"` and `:167` calls
   `supabase.auth.signUp` directly with a user-typed address. `/signup` is public
   (`apps/web/lib/supabase/proxy.ts:62`). This is 裁-102's named "indirect resend" gap and it is
   still open — `0161` gives the DB two verbs but nothing rate-limits the *send*. An anonymous
   visitor can pump Supabase's project-wide hourly email budget, which is shared with every
   legitimate confirmation. `confirmation-resend.ts`'s header names this exact class as the
   reason its own control was made to refuse; the `signUp` sibling was not given the same
   treatment.
2. **The email template is a load-bearing security control.** 裁-92 deletes the link
   (`checkout-gate-design.md:200`: *"The mail carries a six-digit code (`{{ .Token }}`) and
   nothing to click"*). If the template still emits `ConfirmationURL`, clicking it hits Supabase's
   own verify endpoint, which mints a session and redirects — the C1/C2 wall lives only on our
   POST and is bypassed entirely. **`#493` fixes the operator instruction** (`docs/ops/wave-g-setup-checklist.md:45-46`,
   from the stale `?token_hash={{ .TokenHash }}` link to `{{ .Token }}` with no link) — a real
   security fix in this PR, and worth saying so.
3. **The paid journey cannot complete today, for a reason worth knowing before the cutover.**
   `apps/web/lib/registration/dpa-reads.ts:32,88` reads the `dpa_documents` **table** through
   PostgREST `getRows`. C-1 grants `clara_authenticated` nothing on it, so the read 42501s and
   `dpa-server-reads.ts` folds it into `{kind:"unavailable"}` — the honest degrade, working as
   designed. `#493` adds the door that fixes it (`get_current_dpa_document()`, `0161:324-334`,
   EXECUTE to `clara_authenticated`, measured ACL `[clara_authenticated, clara_fn_owner]`), and
   amends `checkout-gate-design-part3.md:75` to describe the server component reading *through*
   it — but **no web caller has been repointed**, and `#493` touches no `apps/web` file. Until a
   web PR lands that, the DPA step renders `unavailable` → no signature → `open_checkout_intent`
   refuses X7 → no checkout → no firm. Fail-closed and correct, but it means the end-to-end paid
   walk is not yet possible.

**One residual seam↔door mismatch is already closed:** `scope` is `'email'` in the door
(`0161:766`) and `"email" | "origin"` in the seam on `origin/main:172` — `#499` landed the F2
truing. My local `main` still said `"address"`; that was a stale checkout, not a live gap.

### The cutover checklist (C)

Tick every line before the deployed origin serves `/signup` at all. Items 1–4 are the
FS-10 acceptance line itself; 5–10 are what this pass adds.

1. [ ] **The C-5 runtime route exists and is wired**, replacing both stubs in
   `confirmation-wall.ts` — otherwise /auth/confirm refuses every legitimate applicant.
2. [ ] **That route performs claim → `verifyOtp` → settle inside one server request.**
   `attempt_id` is request-scoped and never crosses the wire to a client; there is no
   client-callable settle endpoint; the outcome is derived from `verifyOtp`, never from the
   request body. **(A-M3 — this obligation is currently written nowhere.)**
3. [ ] **The trusted client-IP courier is live**: `CLARA_TRUSTED_CLIENT_IP_HEADER` and
   `CLARA_RATE_WALL_PEPPER` set in `apps/web`, the digest computed where the header is readable,
   and `originDigest` no longer `undefined` at `verify/handler.ts:208`. Absent header ⇒ checkout
   refuses (design part 3 §3).
4. [ ] **`clara_auth_wall_login` is flipped to LOGIN with a password out of band** and its DSN is
   in the runtime env only. Both roles ship NOLOGIN by design (measured), and `0161`'s tail
   *refuses* `rolcanlogin`, so this is a deploy step the migration deliberately cannot do.
5. [ ] **`packages/db/deploy/acl-baseline.sql` has been run on the live project** after `0161`.
   The migration's own tail proves no `clara` relation privilege for the auth-wall pair, but it
   does **not** prove the absence of `public`-schema reach — measured on a migrations-only rig,
   `clara_auth_wall` still holds `public` USAGE. The baseline (widened to eleven confined roles by
   this PR) is what revokes it.
6. [ ] **`/signup`'s `supabase.auth.signUp` send path is walled server-side**, or the Supabase
   project's own email rate limits are configured and accepted in writing as the wall. Today the
   browser calls Supabase directly with a typed address and no wall of ours. **(裁-102, still
   open.)**
7. [ ] **A web PR has repointed the DPA read at `get_current_dpa_document()`** and the paid walk
   has been completed end to end at least once in TEST mode. Otherwise the journey dead-ends at
   the DPA step.
8. [ ] **The Supabase "Confirm signup" template emits `{{ .Token }}` with no link**, verified by a
   Management API read, not a screenshot of the editor. A link of any shape re-opens the bypass.
   (`docs/ops/wave-g-setup-checklist.md:45-46` as corrected by `#493`.)
9. [ ] **A `livemode` gate exists before any mode flip**, or the flip is explicitly deferred and
   recorded. `livemode` is stored and read by nothing. **(A-M5.)**
10. [ ] **An operator can see an unconsumed payment.** Today no door, view or query in the estate
    surfaces one. **(A-M4.)**
11. [ ] **HTTPS on the deployed origin** — already an FS-10 line (`PROGRESS.md:471`); restated
    because `__Host-clara-confirm-flash` (`confirm-flash.ts:80`) joins `__Host-clara-auth` in
    being silently dropped over plain HTTP, with no error at any layer.

---

## Could not verify

- **No HTTP-level test of the runtime routes.** Surface B was measured at the DB layer
  (`clara_runtime` / `clara_authenticated` sessions against my rig) plus source reading of
  `authz.mjs`, `chatRoutes.ts`, `streamRoute.ts` and the `apps/web` client. I did not stand up the
  express app or mint real Supabase JWTs, so the JWT layer (`validateJwt`, issuer/audience/alg
  pinning) is reviewed, not exercised.
- **No Stripe interaction.** The payment path was simulated by calling `record_stripe_event` and
  `apply_stripe_events` directly as `clara_stripe_webhook`. That deliberately skips C-5's
  signature verification (`W-A1`/`W-A2`), which does not exist yet.
- **A-N1 (the NULL `retry_after_seconds` race) is hand-traced, not reproduced.**
- **I did not run the author's packages/db/tests/checkout-gate-c3.test.mjs.** By design — an
  independent battery is worth more than re-running the instrument under review — and my rig is
  now polluted with attack state (registrations forced back to `open` by superuser) that suite
  would rightly object to. CI's estate suite covers it on a clean throwaway.
- **No live or staging origin exists**, so surface C is a source-and-config reading plus the
  checklist, not an exercised journey.
- **Absence claims** in this report name their instrument inline. The two broadest: the `livemode`
  census is ripgrep over the whole repo across `*.sql|*.ts|*.tsx|*.mjs|*.js|*.md`, excluding
  `node_modules` and .claude/worktrees; the "no operator read door over
  `firm_registration_payments`" claim is a `pg_proc.prosrc LIKE` census plus a `pg_class` viewdef
  scan on the live rig, which cannot see a run-time-assembled relation name (none exists in this
  cohort) but does see every function and view that names the table.

**Rig torn down: y** — `docker rm -f -v secpass-rig`, confirmed gone from `docker ps -a`. No
`wsl --shutdown`, no `pnpm install`, no live DSN, no repo file edited.
