# The checkout / signup gate — estate survey (FS-4 rung 0)

*Written 2026-08-31 for the FS-4 design gate (R8, 2026-08-26: the self-serve tenant-creation
door takes its own design gate and security review). Companion documents:
[`checkout-gate-design.md`](checkout-gate-design.md) (the design of record) and
[`checkout-gate-gate-record.md`](checkout-gate-gate-record.md) (the owner's questions).*

**Every table below was measured at the LIVE catalog**, not read from a migration's first
`CREATE` — several of these bodies were replaced by a later `CREATE OR REPLACE` and the first
definition is the wrong body. The rig: a throwaway `postgres:17` named `fs4-design-rig` on
`127.0.0.1:56072`, migrated with `node packages/db/scripts/migrate.mjs` (150 migrations applied,
frontier `0155_client_identifiers_unique`) and seeded with `node packages/db/scripts/seed.mjs`
(`0001_smoke_seed.sql`, `0002_core_seed.sql`). The DSN was supplied env-to-env
(`DATABASE_URL` + `CLARA_ALLOW_DESTRUCTIVE=1`), never in argv and never written to a file. The rig
was torn down when the census closed.

Where a document line cites `NNNN:LLL` it is the **live lineage tip** — the last
`create or replace` for that name in `packages/db/migrations/`, verified against the rig's own
`prosrc` sha, not the first `create`.

---

## 0 · The one-paragraph answer

**There is no path from a paying stranger to a born firm, and the reason is a single measured
absence: nothing in the product mints a `clara.firm_admissions` row.** `clara.create_firm`
(live body `0147:497`) refuses without an admission token, and a whole-repo census of every
`insert into clara.firm_admissions` finds exactly two kinds of writer — the seed file
`packages/db/seeds/0002_core_seed.sql:55-59` and four test fixtures. No door, no route, no
runtime path, no ceremony mints one. The operator road (`approve_firm_registration`,
`0145:766`) bypasses admissions entirely by re-entering `_create_firm_core` directly, and it is
gated on `firms.is_operator`, which only a raw ops act sets. So 裁-73's ruling is not a
preference between two working paths; it is the construction of the only one. Everything the
checkout train needs downstream of "the customer paid" — a Stripe event store, an object map, a
payment record, an admission minter, a DPA signature, a rate wall — was measured **absent from
the live catalog under every schema and every arity**.

---

## 1 · The eleven findings that bind the design

**F1 · `create_firm`'s admission token is a pure bearer credential with no identity binding.**
The live body (`0147:497`, rig `prosrc` sha12 `59fa533d9c03`) looks the token up by
`token_hash = sha256(convert_to(p_admission_token::text,'UTF8'))` and consumes it. It never reads
`clara._jwt_email()`. 裁-26 ruled an email wall onto this token on 2026-08-28 and it is not
built — `0147`'s own header says so at line 60 ("`firm_admissions` has no such column").
`clara.firm_admissions` carries seven columns and none of them is an email, an expiry, or a
pointer to a registration. **Consequence:** anyone who obtains the plaintext becomes a firm's
owner. *(Design consequence, trued after 裁-89: the two-step door would have minted exactly such
a credential on every payment, which is why 裁-26's wall was owed. **The folded door mints no
token at all**, so the finding stands as a measurement of the existing bearer-credential shape
and stops being a hazard this train creates.)*

**F2 · Nothing in the product mints an admission.** Whole-repo census (§4, absence A1). Two
seed inserts, four test-fixture inserts, zero product writers.

**F3 · `firm_registration_requests.status` admits exactly three values, and `paid` is not one.**
`CHECK (status = ANY (ARRAY['open','approved','rejected']))`, measured from `pg_constraint`.
The ruled shape's "a separate audited applier marks the registration PAID" therefore cannot be
expressed as a status value without widening that CHECK — a named successor-constraint edit.
The design instead records payment in its own table and leaves the CHECK alone (design part 2 §1.3).

**F4 · One open registration per applicant is already a database wall.**
`uq_firm_registration_requests_open_applicant`, a UNIQUE index on `(applicant)` `WHERE status =
'open'`. A second concurrent registration cannot exist. `request_firm_registration` (`0145:370`)
additionally catches the `unique_violation` and replays it as the typed refusal.

**F5 · One firm per person is already a database wall, and it is the two-firms wall the design
leans on.** `uq_membership_active_user` — UNIQUE on `firm_memberships(user_id)` `WHERE status =
'active'`. `clara._create_firm_core` (`0145:463`) checks it before the insert *and* catches the
`unique_violation` on the racing path, both raising `CLR10 actor already belongs to a firm`.
**Measured consequence: a single identity can never own two firms, whatever a checkout bug
does.** 裁-36's rate-wall limb ① ("one firm per email") is therefore *already enforced*, because
`clara.users.email` carries `users_email_key` (UNIQUE) and `_claim_identity_core` (`0141:219`)
translates a collision into `CLR10 that email is already claimed by a different identity`. Only
limb ② (one firm per IP per day) needs new mechanism.

**F6 · `op_receipts` cannot serve a pre-firm door.** `clara.op_receipts` is
`PRIMARY KEY (firm_id, fn, op_key)` with `firm_id` **NOT NULL** and no foreign key onto
`clara.firms`. `clara._reserve_op` (`0004:46`) takes `p_firm` as its first argument. Every
pre-firm door in the estate therefore uses *structural* idempotency instead, and says so in its
own body: `create_firm` replays from `firm_admissions.consumed_op_key`/`consumed_result`,
`request_firm_registration` replays from `(applicant, op_key)` on its own table, and
`claim_identity` is a select-then-branch. **Any new pre-firm door must do the same** — it may
not call `_reserve_op`.

**F7 · The pre-firm half of the journey writes NO audit row and NO domain event, and it
structurally cannot.** Measured positively by reading `prosrc` for the calls, not by absence of a
grep hit:

| door | calls `clara._audit` | calls `clara._append_event` |
|---|---|---|
| `claim_identity` | **no** | **no** |
| `_claim_identity_core` | **no** | **no** |
| `request_firm_registration` | **no** | **no** |
| `create_firm` | yes | yes |
| `approve_firm_registration` | yes | yes |
| `reject_firm_registration` | yes | yes |

The reason is structural: `clara.audit_log.firm_id` is **NOT NULL**, and
`clara.domain_events` is `PRIMARY KEY (firm_id, seq)` with `firm_id` NOT NULL, sequenced through
`clara.firm_event_seq` per firm. **There is no firm to scope a pre-firm act under.** The most
dangerous door in the system currently has no audit trail until the instant the firm exists.
This is design part 2 §1.7 and gate question G6.

**F8 · `domain_events.event_type` is foreign-keyed to a registry and validated by a trigger.**
`domain_events_event_type_fkey → clara.event_types(name)`, plus
`t_domain_events_validate → clara._tf_validate_domain_event()`, which raises
`CLR10 unknown event_type %` for an unregistered name. 117 types are registered; the firm-family
is exactly three: `firm.created`, `firm_registration.approved`, `firm_registration.rejected`.
**Any new event type this train emits must be registered in the same migration that emits it.**

**F9 · `pgcrypto` is not installed.** `pg_extension` holds exactly one row: `plpgsql`. So
`gen_random_bytes()`, `digest()` and `crypt()` are unavailable; `sha256()` and
`gen_random_uuid()` are PostgreSQL built-ins and were probed working on the rig. A hand-rolled
nonce would have to draw its entropy from `gen_random_uuid()` (122 bits) or add an extension —
a cost recorded against that option in the design's part 1 §3.3.

**F10 · No table in the `clara` schema carries an IP address.** A census over `pg_attribute`
for `inet`/`cidr` types **and** for column names matching `ip_addr|ipaddr|remote_addr|client_ip`
returned zero rows. 裁-36's limb ② has no storage today, and 裁-64① (the server-only courier
passes the proxy-observed address into a door argument) is unbuilt in every part.

**F11 · The estate's server-side principal idiom is a NOLOGIN role plus a `_login` member.**
Measured from `pg_auth_members`: `clara_runtime_login → clara_runtime`,
`clara_agent_read_login → clara_agent_ro`, `clara_freeform_login → clara_freeform_ro`,
`clara_wake_bank_login → clara_wake_bank`, `clara_wake_write_login → clara_wake_interactive`.
Fourteen `clara*` roles exist; **none carries `BYPASSRLS` or `SUPERUSER`**. The DSNs come from
the environment (`CLARA_RUNTIME_DATABASE_URL` is "the `clara_runtime_login` DSN",
`packages/runtime/README.md:293`) and the worker executes `set role clara_runtime`
(`docs/ops/DR-render.md:204-205`). The webhook's principal follows this idiom exactly
(design part 2 §1.6).

---

## 2 · The doors, measured at the live body

Every row: measured on `fs4-design-rig` via `pg_get_functiondef` / `pg_proc`. Every one of these
is `SECURITY DEFINER`, `plpgsql`, `VOLATILE`, owned by `clara_fn_owner`, with
`search_path = clara, pg_temp`. `proacl` on all six is exactly
`clara_fn_owner=X/clara_fn_owner ; clara_authenticated=X/clara_fn_owner` — **PUBLIC EXECUTE is
revoked on every one**, and `clara_runtime` holds EXECUTE on **none** of them (probed
individually with `has_function_privilege`).

### 2.1 · `clara.create_firm(p_name text, p_admission_token uuid, p_op_key text) → jsonb`
Live tip `0147:497` · rig `prosrc` sha12 `59fa533d9c03` · grant `clara_authenticated`

**Note the second argument is `uuid`, not `text`.** 裁-16b hashed the credential at rest but
deliberately kept the argument type so every caller keeps passing the same plaintext value.

| refusal | errcode | condition |
|---|---|---|
| `no authenticated actor` | `CLR04` | `clara.jwt_sub()` is null |
| `unknown actor` | `CLR04` | no `clara.users` row for the subject |
| `the agent identity cannot own a firm` | `CLR04` | the actor's `users.is_agent` |
| `firm name and op_key are required` | `CLR10` | either blank |
| `invalid or consumed admission token` | `CLR04` | no `firm_admissions` row for `sha256(token::text)` |
| `invalid or consumed admission token` | `CLR04` | the row is consumed **and** `consumed_op_key <> p_op_key` (or no stored result) |
| *(from `_create_firm_core`)* `actor already belongs to a firm` | `CLR10` | an active membership exists, or the insert races into `uq_membership_active_user` |
| *(from `_create_firm_core`)* `firm name is required` | `CLR10` | blank after `btrim` |

**Replay:** the admission row is selected `FOR UPDATE` (so concurrent consumers serialize); a
consumed row whose `consumed_op_key` equals this call's `p_op_key` returns the stored
`consumed_result` verbatim. **Returns** `{firm_id, plan_id}`. **Side effects:** creates the firm,
the owner membership, a firm-scope `onboarding_plans` row and its revision 1 snapshot; stamps the
admission consumed; writes one `audit_log` row (`fn='create_firm'`) and one `domain_events` row
(`firm.created`).

**What it does NOT do:** it does not read `_jwt_email()` (F1); it does not touch
`firm_registration_requests` — **a self-serve firm born through `create_firm` leaves its
registration row `open` forever** unless something else closes it (design part 2 §1.3).

### 2.2 · `clara._create_firm_core(p_actor uuid, p_name text) → jsonb`
Live tip `0145:463` · ungranted (internal) · called by both `create_firm` and
`approve_firm_registration`, the latter passing the **applicant** as the actor, never the
operator.

### 2.3 · `clara.request_firm_registration(p_firm_name text, p_note text, p_op_key text) → jsonb`
Live tip `0145:370` · grant `clara_authenticated`

| refusal | errcode |
|---|---|
| `no authenticated actor` | `CLR04` |
| `unknown actor` | `CLR04` |
| `the agent identity cannot request a firm registration` | `CLR04` |
| `op_key is required` | `CLR10` |
| `firm name is required` | `CLR10` |
| `actor already belongs to a firm` | `CLR09` |
| `op_key reused with different args` | `CLR10` |
| `an open registration request already exists` | `CLR09` |

**Replay:** looks up `(applicant, op_key)` across **all** statuses; identical args return
`{request_id, status}`; different args refuse. The `unique_violation` path re-runs the same
lookup so a concurrent identical call replays rather than refusing. **Returns**
`{request_id, status}`. **Writes no audit row and no event** (F7).

### 2.4 · `clara.claim_identity(p_display_name text, p_op_key text) → jsonb`
Live tip `0141:250` · grant `clara_authenticated` · delegates to `_claim_identity_core`
(`0141:219`)

| refusal | errcode | raised by |
|---|---|---|
| `no authenticated actor` | `CLR04` | `claim_identity` |
| `op_key is required` | `CLR10` | `claim_identity` |
| `a verified email claim is required` | `CLR04` | `claim_identity` — a JWT with no `email` claim fails closed |
| `the agent identity cannot claim a session` | `CLR04` | core |
| `display name is required` | `CLR10` | core |
| `identity already claimed with a different email` | `CLR10` | core, compared **case-insensitively** |
| `that email is already claimed by a different identity` | `CLR10` | core, from `users_email_key` |

`p_op_key` is validated for signature consistency only; idempotency is structural
(select-then-branch), because there is no firm to scope an `op_receipts` row under (F6). The
email comes from `clara._jwt_email()`, which reads `request.jwt.claims ->> 'email'` and
lowercases it. **Returns** `{user_id, display_name}`.

### 2.5 · `clara.approve_firm_registration(p_request uuid, p_op_key text) → jsonb`
Live tip `0145:766` · grant `clara_authenticated`, but walled to the operator firm

Floor `clara._human_ctx(role_rank('owner'))` **plus** `exists (select 1 from clara.firms f where
f.id = clara.jwt_firm() and f.is_operator)`; refusals `insufficient role` (`CLR04`),
`op_key is required` (`CLR10`), `unknown registration request` (`CLR10`),
`cannot decide your own registration request` (`CLR04`),
`this request is no longer open (status: %)` (`CLR09`), plus `_create_firm_core`'s own set. It
**does** use `_reserve_op`/`_finish_op` — it can, because the operator's own firm scopes the
receipt. **This is the tier-2 road and 裁-73 rules it out as a product path** (裁-43/裁-68: no
operator queue for tier-3); it stays operator tooling. Its sibling
`reject_firm_registration` (`0145:832`) mirrors it and additionally requires a non-blank reason.

### 2.6 · `clara.add_member(p_firm uuid, p_user uuid, p_role text, p_op_key text) → jsonb`
Live tip `0145:671` · grant `clara_authenticated` · floor admin, with a role ceiling
(`cannot assign a role above your own rank`, `CLR04`) and a `not your firm` wall (`CLR11`).
Not on the checkout path; censused because the order names it and because it is the shape a
post-firm invite takes.

---

## 3 · The two tables the journey already has

### 3.1 · `clara.firm_admissions` (created `0002:255`, reshaped `0147:342-358`)

| # | column | type | not null | default |
|---|---|---|---|---|
| 7 | `id` | uuid | yes | `gen_random_uuid()` |
| 8 | `token_hash` | bytea | yes | — |
| 2 | `note` | text | no | — |
| 3 | `consumed_at` | timestamptz | no | — |
| 5 | `consumed_op_key` | text | no | — |
| 6 | `consumed_result` | jsonb | no | — |
| 4 | `created_at` | timestamptz | yes | `now()` |

*(attnum order reflects `0147`'s drop-and-add of the old `token` column.)*

`PRIMARY KEY (id)`; `uq_firm_admissions_token_hash` UNIQUE on `(token_hash)`;
`ck_firm_admissions_consumed_receipt_0017` admits exactly three shapes — unconsumed / consumed
with no receipt / consumed with a full `(op_key, jsonb-object result)` receipt. **RLS enabled AND
forced**, one policy `p_firm_admissions_owner` with `USING (true)`, owner `clara_fn_owner`, and
**the only table grant in `information_schema.role_table_grants` is `clara_fn_owner`** — no
application role can read or write it at all. Live rows on a freshly seeded rig: 2, of which 0
unconsumed.

**Absent — and under 裁-89 NOT needed by this train.** An email binding (裁-26), a link to the
registration, and an expiry were all owed by the two-step door, which had to hand a credential
across a gap. The folded door has no gap, mints no token, and **adds nothing to this table**; the
three absences remain true of the estate and are simply no longer this train's to fill.

### 3.2 · `clara.firm_registration_requests` (created `0145:324`)

`id` · `applicant` (FK → `users`) · `firm_name` · `note` · `op_key` · `status` (default `open`,
CHECK `open|approved|rejected`) · `decided_by` (FK → `users`) · `decided_at` · `reason` ·
`firm_id` (FK → `firms`) · `created_at`. `PRIMARY KEY (id)` plus
`uq_firm_registration_requests_open_applicant` (F4). **RLS enabled AND forced**, one owner
policy, `clara_fn_owner` the only table grantee.

**There is no unique index on `(id, applicant)`**, so a composite foreign key from a new payment
table onto "this registration AND its applicant" cannot be declared today — the design adds that
index (design part 2 §1.3).

### 3.3 · `clara.firm_registration_requests_visible` (view, `SELECT` to `clara_authenticated`)

`WHERE applicant = clara.jwt_sub() OR (actor_role_rank() >= role_rank('owner') AND the caller's
firm is_operator)`, with `decided_by` masked to NULL for the self arm. **The predicate is a
disjunction with an operator arm**, which is why `apps/web`'s own read filters by applicant a
second time (lib/registration/reads.ts's header) — an unfiltered "my requests" read issued by
an operator-firm owner returns the whole estate's queue.

---

## 4 · The absences, each with the method that proved it

Law 2: an absence is not evidence unless a read positively saw nothing where it would have seen
something. Every row below is a **live-catalog** read on the rig over `pg_proc` and `pg_class`
across **every schema and every arity**, not a repo grep.

| name | as a function | as a relation |
|---|---|---|
| `record_stripe_event` | ABSENT | ABSENT |
| `claim_paid_admission` | ABSENT | ABSENT |
| `stripe_events` | ABSENT | ABSENT |
| `stripe_object_map` | ABSENT | ABSENT |
| `billing_plans` · `billing_usage_rates` · `firm_subscriptions` | ABSENT | ABSENT |
| `invoices` · `invoice_lines` · `issue_invoice` · `evaluate_firm_billing_v1` | ABSENT | ABSENT |
| `client_lifecycle_events` | ABSENT | ABSENT |
| `dpa_signatures` | ABSENT | ABSENT |
| `firm_registration_payments` | ABSENT | ABSENT |
| `registration_rate_limits` | ABSENT | ABSENT |
| `mint_firm_admission` · `firm_admission_grants` · `signup_bindings` | ABSENT | ABSENT |
| `firm_admissions` | ABSENT | **PRESENT** (`clara.firm_admissions`, `r`) |
| `firm_registration_requests` | ABSENT | **PRESENT** (`clara.firm_registration_requests`, `r`) |

**Broader than the name list, so a differently-spelled object could not hide:**

- **A2 — every `clara`/`public` relation matching
  `stripe|billing|invoic|admission|registrat|dpa|consent|rate_limit|throttl|signup|checkout|payment|subscription`**
  returns exactly six: `client_egress_consents`, `client_egress_purpose_consents`,
  `firm_admissions`, `firm_egress_purpose_consents`, `firm_registration_requests`, and the
  `firm_registration_requests_visible` view. **No billing, Stripe, DPA, rate-limit or payment
  relation exists under any spelling.**
- **A3 — every function matching the same pattern** returns 29 names, all of which are the
  accounting senses of the words (`_allocate_payment_core`, `_assert_sales_invoice_shape`,
  `_adv_enrolment_admission`, …) plus the three registration doors. None is a billing or Stripe
  verb.
- **A4 — every `clara` function whose BODY text matches `stripe|checkout|\mdpa\M`: zero rows.**
  This is the strong form: not "no function is named that", but "no function's executable text
  mentions it".
- **A5 — every `insert into clara.firm_admissions` in the whole repository** (`*.sql`, `*.mjs`,
  `*.ts`, `*.js`, excluding `node_modules`): nine hits, all accounted for —
  `packages/db/seeds/0002_core_seed.sql:55` and `:59` (the two branches of a catalog-shape fork),
  `packages/db/tests/hrd-b-upgrade-kit.mjs:133,360,365`,
  `packages/db/tests/rig-fixtures.mjs:355,359`,
  `packages/runtime/tests/relay-fixtures.mjs:392,396`. **Zero product writers.** *(This one is a
  text census over files and is NOT closed-world — it cannot see a run-time-assembled statement.
  The live-catalog reads A1/A4 are what bind: no function body mentions the table in a way A4
  would have caught, and no application role holds INSERT on it.)*
- **A6 — no `inet`/`cidr` column and no `ip_addr|ipaddr|remote_addr|client_ip` column anywhere
  in `clara`**: zero rows (F10).
- **A7 — `pg_extension` holds exactly `plpgsql`**: no `pgcrypto` (F9).

---

## 5 · The signup path as built (web/p4-3-entry-group, PR #461)

Read read-only from the worktree .claude/worktrees/p4-3-cx at tip `655fb54b`
("fix(web): confirmation redirects use the proven Origin, not request.url").

### 5.1 · The five surfaces

| file | what it is |
|---|---|
| `apps/web/app/(entry)/signup/page.tsx` | the fork: no session → `SignupAccountForm`; session → `SignupFirmForm`. Public; in `PUBLIC_PATH_PREFIXES` and `SCOPE_UNSCOPED_SURFACES`; deliberately calls no `requireFirmScope()` |
| apps/web/components/entry/signup-account-form.tsx | `supabase.auth.signUp({email, password, options:{emailRedirectTo: <origin>/auth/confirm}})`, then "check your email". Gates submit on a DPA checkbox that **records nothing** and says so on the page via `NotBuiltNote` |
| `apps/web/app/(entry)/auth/confirm/page.tsx` | paint-only GET; consumes no token; reads only `token_hash` and its own `status=invalid` marker |
| `apps/web/app/(entry)/auth/confirm/verify/{route,handler}.ts` | the sole token-consuming root: `proveSameOrigin` → `verifyOtp({type:"email", token_hash})` → 303 to `/signup` or back with `status=invalid` |
| `apps/web/app/(entry)/pending/page.tsx` | the holding page. Reads `firm_registration_requests_visible` applicant-filtered **and** `caller_context`; `holdingStateFrom` maps to `pending / approved / rejected / invite-expected / unidentified / read-failed / member` |

Doors are called over PostgREST RPC with **the caller's own session token** as bearer
(`apps/web/lib/doors.ts:86`, `callDoor(fn, args, opts)`), which is why a door sees `jwt_sub()` =
the person. `apps/web` references **no service-role credential at all**, and
`apps/web/scripts/check-public-key.mjs` (wired into that package's `build`) proves the value in the public
env slot is of the publishable class.

### 5.2 · The login-CSRF hole, mechanism confirmed at the source

`handleEmailConfirmationPost` (`handler.ts:67-107`) does exactly two things before installing a
session: it calls `proveSameOrigin(request.headers, request.url)` and it reads one `token_hash`
form field. **`proveSameOrigin` proves the POST was made from a page served by this deployment's
own origin. It cannot prove that THIS browser is the browser that initiated the signup the
`token_hash` belongs to** — the forged page *is* Clara's page. `verifyOtp` then writes whatever
session results into this browser's cookies via `sealResponse`.

So: an attacker signs up with credentials they control, takes their own legitimate confirmation
link, and gets the victim to click it on a Clara page. The victim's browser now holds the
attacker's session; the victim types their firm's details into `claim_identity` and
`request_firm_registration` under the attacker's identity; the attacker signs in later with the
password they chose. **Recorded in `PROGRESS.md:398` and in the orders' §FS-4 as this gate's
mandatory design input.**

### 5.3 · The measurement that decides the remedy

@supabase/ssr 0.12.5 is the installed version (apps/web/node_modules/@supabase/ssr is a
junction to node_modules/.pnpm/@supabase+ssr@0.12.5_@supabase+supabase-js@2.112.4), and its
shipped `dist` was read directly:

- `dist/main/createBrowserClient.js:44` → `flowType: "pkce"`
- `dist/main/createServerClient.js:37` → `flowType: "pkce"`
- `dist/main/cookies.js:12-29` documents the verifier cookie keys:
  `<storageKey>-code-verifier` (the fixed key written for every flow),
  `<storageKey>-flow-<flowId>-code-verifier` (per-flow slots) and
  `<storageKey>-flows-code-verifier` (the pending-flow index).

**PKCE is already on, in both clients, by construction of the package — the app never sets
`flowType` because it never needs to.** The browser therefore already writes a code-verifier
cookie when it calls `signUp`, and the server client can already read it. The binding material
exists and is simply not consulted, because the confirmation email carries a `token_hash` and
the route calls `verifyOtp`, which is the non-PKCE arm. This measurement is what makes the
design's recommendation a *configuration and route* change rather than a new mechanism
(design part 1 §3).

### 5.4 · `Origin: null` is already a 403, measured at the source

`proveSameOrigin` (`apps/web/lib/same-origin.ts:110-189`) refuses when `sec-fetch-site` is
present and not `same-origin`; when `Origin` is absent; when `new URL(origin)` throws — **which
is exactly what the literal string `null` does** — when the scheme is not `https:` (loopback
only under an explicit opt-in); and when the origin is neither in `CLARA_PUBLIC_ORIGINS` nor
equal to the host the browser addressed. The allowlist is read from the environment and is
fail-closed when unset (`x-forwarded-host` is then not consulted at all). **The `Origin: null`
→ 403 cell this design owes is a regression pin on behaviour that already holds**, not a new
wall. FS-2's NEW-A is the adjacent hazard: `Referrer-Policy: no-referrer` on the confirmation
page makes real browsers send `Origin: null` on the form POST, so the wall 403s every genuine
user; the fix there is `strict-origin`, and **`Origin: null` is never accepted**.

### 5.5 · The holding page already names its own gap

`apps/web/components/entry/holding-card.tsx:47-83` carries a `NotBuiltNote` reading, in the
person's own words, that under 裁-68 checkout is the approval and there is no checkout route, no
plan flag and no webhook. **The design fills exactly that note.**

---

## 6 · The runtime, and the one mechanical fact the webhook turns on

`packages/runtime` is an Express app (`packages/runtime/src/index.ts`). Two measurements matter:

1. **It already holds privileged database credentials, from the environment only.**
   `packages/runtime/lib/pools.mjs:37-38,91-92` reads `CLARA_RUNTIME_DATABASE_URL` /
   `CLARA_READ_DATABASE_URL` / `CLARA_WRITE_DATABASE_URL`;
   `packages/runtime/README.md:293` names the first as "the `clara_runtime_login` DSN"; the
   worker executes `set role clara_runtime` (`docs/ops/DR-render.md:204-205`). `apps/web` holds
   nothing of the kind.

2. **`app.use(express.json({ limit: "1mb" }))` is mounted at `src/index.ts:55` and applies to
   every route registered after it.** A Stripe webhook must verify its signature against the
   **raw** body; a JSON-parsed body cannot be re-serialized byte-identically and
   `Webhook.constructEvent` will fail. The estate already has the precedent and states it in a
   comment at `src/index.ts:51-53`: *"Intake owns its own tiny JSON parser and its byte PUT stays
   a raw backpressured stream. Mount it before the global JSON parser so no middleware can
   consume it."* **A webhook router mounted after line 55 is silently broken.** No
   `express.raw`/`rawBody`/`bodyParser.raw` usage exists anywhere in `packages/runtime/src`
   today (grep census: zero hits), so the raw-body handling is genuinely new code.

---

## 7 · Predictions this survey makes that the build's rig replay must confirm

Each is a *prediction from this measurement*, not a measurement of the future body — the build
pins and reconciles rather than overwriting (the estate's standing prestate discipline).

1. `clara.create_firm(text,uuid,text)` live `prosrc` sha256 begins `59fa533d9c03`. **TRUED
   2026-08-31 evening (裁-89): the train does NOT replace this body.** The prediction as written —
   a recut carrying 裁-26's email wall, and the train's one D1 item — was correct for the two-step
   door and is void under the fold: the folded door calls `_create_firm_core` directly, as
   `approve_firm_registration` already does, so `create_firm` is untouched and **the D1 inventory
   is EMPTY**. *The measurement stands; only the prediction about what the train does with it
   changed.* The build still pins the sha as its prestate control, to prove the body did **not**
   move.
2. `clara.firm_admissions` carries exactly the seven columns in §3.1 and exactly two indexes.
   **Under 裁-89 the train adds none and changes none** — this is now an *unmoved* assertion, and
   part 3's cell W-E3 is where it is proven after the battery runs.
3. `clara.firm_registration_requests` carries no unique index over `(id, applicant)`; the train
   adds one so a composite FK can bind a payment to its registration *and* its applicant.
4. `clara.event_types` holds 117 rows, of which exactly three are the `firm`/`firm_registration`
   family. The train registers its new types in the same file that emits them.
5. `clara.op_receipts.firm_id` is NOT NULL with no FK onto `clara.firms`. **A sentinel firm id
   would technically insert** — the design forbids it explicitly (§3.4) rather than relying on
   the absent FK.
6. No `clara` role holds `BYPASSRLS`. The new webhook role must not be the first.

---

## 8 · What this survey did NOT measure, and why

- **The Stripe account.** 裁-87 moved account-level object creation to the orchestrating Claude
  session's Stripe connector. No Stripe object exists yet; this survey asserts nothing about the
  live account, and the design names what must be created rather than claiming it was.
- **The Supabase project's email-template configuration.** It is project configuration, not
  repo content, and no read from this rig or this checkout can see it. That is precisely why
  the design's part 1 §3.4 makes the route fail closed rather than trusting the template.
- **A behavioural probe of `create_firm` end to end.** The rig has the seeded firms already
  consuming both admission tokens (§3.1: 0 unconsumed), and a probe would have needed a
  synthetic JWT claim set. The bodies were read instead; the design's acceptance battery is
  where the behaviour gets proven, with a RED-before mutant per wall.
