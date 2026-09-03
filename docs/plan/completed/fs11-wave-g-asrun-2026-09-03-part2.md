*Part 2 of 6 of the FS-11 Wave-G factory-reset as-run (2026-09-04) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: `fs11-wave-g-asrun-2026-09-03-part1.md` · Next: `fs11-wave-g-asrun-2026-09-03-part3.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

app tables)"*), so the ledger went with it and the migrator re-applies every file from the floor.
`PROGRESS.md` and the FS-11 order say the apply is *"`0154`…`0164`"* — **true of what is unapplied
today, false of what the reset tooling produces.** There is **no delta apply and no data-only reset
anywhere in the repo** (**NOT IN REPO**).

**Reads, both:**
1. the runner's own summary line, whose exact shape is
   `migrate: <N> new migration(s) applied · <M> total · target <label>` (`migrate.mjs:524`) →
   expect **`159 new migration(s) applied · 159 total`**. The summary counts only files that passed
   the `NNNN_` filter, so a silently-skipped `UNNUMBERED_*` would show here as a short count (P-6 is
   the guard);
2. `select count(*), max(version) from clara.schema_migrations;` → **159 /
   `0164_checkout_gate_c6_web_reads`**.

Each migration applies in its own transaction and records its `sha256`.

**Note, not an act:** `0155`'s UNIQUE constraint (裁-41/45/67) lands mid-chain on empty tables. The
checklist's ordering line (`:266-269`) is satisfied by construction.

`[ ]` `159 new migration(s) applied · 159 total`.  as run: ____________
`[ ]` `schema_migrations` → 159 / `0164_checkout_gate_c6_web_reads`.  as run: ____________

---

### Step 6 · **[L]** APPLY THE ACL BASELINE — **discharges security-pass line 5** (裁-153)

Security-pass cutover line **5** (`docs/plan/active/security-pass-2026-09-02.md:566-571`) says it in
terms: the migration's own tail proves no `clara` relation privilege for the auth-wall pair, but it
does **not** prove the absence of `public`-schema reach — measured on a migrations-only rig,
`clara_auth_wall` still holds `public` USAGE. `docs/ops/DR.md:256-259` says the same from the other
side: **the ACL baseline is carried by no dump**.

**It must run AFTER step 5 and never before:** the script's EXISTENCE CHECK aborts fail-closed if
any confined role is absent (`acl-baseline.sql:51-70`), and four of the eleven —
`clara_stripe_webhook`, `clara_stripe_webhook_login`, `clara_auth_wall`, `clara_auth_wall_login` —
are minted by `0160` and `0163`.

```sh
… | node scripts/ops/dsn-pipe.mjs -- psql -v ON_ERROR_STOP=1 -f packages/db/deploy/acl-baseline.sql
```

Run **as the schema/db OWNER** (Supabase `postgres`, the bridge's own principal). The PREFLIGHT
asserts it: `deploy_is_dbowner_member = t`, *"else the public revoke will SILENTLY no-op"*
(`acl-baseline.sql:31-38`).

**Reads, all four:**
1. **`ACL baseline verify: OK`** — the notice the fail-closed VERIFY block raises
   (`acl-baseline.sql:194`); any failure raises `ACL BASELINE VERIFY FAILED: …` instead (`:193`);
2. the final roster select (`acl-baseline.sql:197-200`, which returns **every** `clara%` role):
   the **ELEVEN confined roles** — `clara_agent_ro`, `clara_wake_interactive`,
   `clara_wake_proactive`, `clara_agent_read_login`, `clara_wake_write_login`, `clara_freeform_ro`,
   `clara_freeform_login`, `clara_stripe_webhook`, `clara_stripe_webhook_login`, `clara_auth_wall`,
   `clara_auth_wall_login` — every one showing `usage_public = f` **and** `temp_db = f`;
3. the **preservation control**: `clara_runtime` still shows **both `t`** — the snapshot-and-re-grant
   worked and no non-confined role lost anything;
4. `clara_auth_wall` specifically holds **no** `public` USAGE — the exact fact a migrations-only rig
   does not produce.

*Known residual, not a defect:* the `pg_catalog` residual (`pg_notify` / `pg_advisory_*` /
`pg_sleep` / `query_to_xml`) cannot be closed by a non-superuser and is an accepted, documented gap
on managed Supabase (`acl-baseline.sql:7-12`).

`[ ]` `ACL baseline verify: OK`.  as run: ____________
`[ ]` Eleven confined roles `usage_public = f`, `temp_db = f`.  as run: ____________
`[ ]` `clara_runtime` keeps both `t`.  as run: ____________
`[ ]` **Security-pass cutover line 5 TICKED HERE** (裁-153).  as run: ____________

---

### Step 7 · **[L, per 裁-162]** SEED — synthetic only

```sh
… | CLARA_ALLOW_DESTRUCTIVE=1 CLARA_DESTRUCTIVE_TARGET="…" \
    node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/seed.mjs
```

`seed.mjs` calls the same destructive guard (it truncates and reloads synthetic data). Each seed
file runs in its **own transaction**.

**Reads:**
1. the per-file lines `seeded 0001_smoke_seed.sql` and `seeded 0002_core_seed.sql`, then the
   summary `seed: 2 seed file(s) applied · target <label>` (`seed.mjs`) — **two** seed files at
   `9d5d844e`, counted at `packages/db/seeds/`;
2. `select count(*) from clara.firms;` → the seed's two synthetic firms;
3. `select count(*) from clara.users where id = '5eed0000-0000-4000-8000-00000000a11e';` → **1**
   (the sentinel, `0002_core_seed.sql`).

`[ ]` Two seed files applied.  as run: ____________
`[ ]` Two synthetic firms; sentinel user present.  as run: ____________

---

### Step 8 · **[L]** RE-DEPLOY THE EVALUATORS — **scoped by step 3b.2, not by a remembered number**

> **NOT IN REPO:** this obligation appears in **no checklist**. `docs/ops/wave-g-setup-checklist.md`
> has no evaluator line at all. It gates step 16 line 6 (a report cannot render if its evaluator is
> dark — constraint 2).

**The act list is step 3b.2's `deployed = true` rows.** Do not derive it from
`frozen-evaluators.json` (see the mapping table at 3b.2 — three of its nine entries have no registry
row, and two registry rows are absent from it).

For each `(name, version)` on that list:

```sh
… | node scripts/ops/dsn-pipe.mjs -- \
    node packages/db/scripts/deploy-evaluator-version.mjs --name <evaluator_name> --version <N>
```

`--name` takes the **registry `evaluator_name`** (no `clara.` prefix, no `_vN` suffix — the script
validates `^[a-z][a-z0-9_]{0,62}$`) and `--version` a positive integer. Run under the **BARE
principal — no `SET ROLE`**: `clara._tf_evaluator_deploy_once` (`0060:93`) refuses the
undeployed→deployed transition unless `current_user = session_user`, and the script reads that
positively before doing anything and refuses with its own message if a `SET ROLE` is active.

**DO NOT run `node scripts/check-frozen-evaluators.mjs --lock-deployed`.** It is **BLANKET** — it
stamps every manifest entry whose `deployed` flag is not already `true` (`packages/db/README.md`,
"Evaluator deploy ceremony"). The repo-side half is already done: the manifest's nine entries
already read `deployed: true` at `9d5d844e`.

**Reads:**
1. re-read `select evaluator_name, version, deployed from clara.evaluator_versions order by 1,2;`
   → exactly the rows from 3b.2 now `deployed = true`, and **no others**;
2. `select clara.verify_evaluator_freeze();` → clean, its `verified_deployed` count matching (1).

**One-way, no undo.** The transition is admitted exactly **once per row, ever**; a second run is a
no-op rather than an error. A row flipped in error cannot be un-flipped (§5 rollback).

`[ ]` The act list came from 3b.2, not from the manifest.  as run: ____________
`[ ]` Every act ran under the bare principal (no `SET ROLE`).  as run: ____________
`[ ]` Post-read: the same set `deployed = true`, nothing extra.  as run: ____________
`[ ]` `verify_evaluator_freeze()` clean.  as run: ____________

---

### Step 9 · **[L]** START THE RUNTIME AND PROVE THE WORLD IS UP

```sh
fly machine start 48ee715b763048 -a clara-runtime
```

**Reads:** `GET /health` → **200**; `GET /ready` → **200** with `ready: true`. The v71 baseline read
`ok` on all fifteen consumer checks (`db`, `world`, `control`, `taxonomy`, `relay`, `matcher`,
`autodraft`, `wakeEngine`, `localFacts`, `sstWatch`, `factsGate`, `classify`, `wikiProjection`,
`intake`, `storage`) and carried **two warnings alongside `ready: true` — `held_outbox` 119 and the
wake-engine lag — both pre-existing, not new** (as-run §4/§6). Do not read a standing warning as a
new fault.

**Expected here and correct:** C-5's two routes still answer **503** per request until step 12.

`[ ]` `/health` 200 · `/ready` 200 · warnings noted against the baseline.  as run: ____________
`[ ]` C-5's two routes still 503 — expected.  as run: ____________

---

### Step 10 · **[L]** THE `stripe_object_map` OPS ACT

`clara.stripe_object_map` has **forced** RLS with exactly one write-capable policy, for
`clara_fn_owner` (`0160_checkout_gate_c2_stripe_events.sql:258-270`) — the `SET ROLE` is mandatory,
not stylistic.

```sh
… | node scripts/ops/dsn-pipe.mjs -- psql -v ON_ERROR_STOP=1
```
```sql
set role clara_fn_owner;
insert into clara.stripe_object_map(object_kind, local_key, stripe_id) values
  ('product','clara-beta-2026','prod_VBS7ZUaIFPedCs'),
  ('price',  'clara-beta-2026','price_1UB5DZHD90w0k86XNfkgYPWq');
```

**Sandbox ids only** (livemode `false`, P-14; 裁-126 keeps the sandbox for the whole beta). The map
is written by **this ops act**, not by C-5, which only reads it.

**Reads:**
1. `select object_kind, local_key, stripe_id from clara.stripe_object_map order by 1;` → the two
   rows;
2. **the BINDING read**: one `open_checkout_intent` call that does **NOT** raise
   `CLR10 no stripe price is mapped for this plan`. `0163_checkout_gate_c3_folded_door.sql:465-476`
   resolves `billing_plans.local_key` where `is_current` — that row is
   `('clara-beta-2026','Clara Beta',0,'MYR',false,true)` (`0163:213-214`) — and then looks the price
   up by `object_kind='price' and local_key=<that>`. **This lands inside step 13.**

**裁-148, settled — no arm to choose.** Checkout is walked **ONCE at the seeded beta price, sandbox,
MYR 0**. No second, non-zero price is minted and **no `is_current` plan is temporarily switched at
Wave-G**. The checklist's own line was re-cut at truing-4 and now reads that way
(`docs/ops/wave-g-setup-checklist.md:190` — *"exercises checkout ONCE at the SEEDED BETA PRICE —
Stripe sandbox, MYR 0"*), so the old truing line **T-2 is PAID**.

`[ ]` Two rows written as `clara_fn_owner`.  as run: ____________
`[ ]` The two-row select read back.  as run: ____________

---

### Step 11 · **[O]** THE TWO NOLOGIN→LOGIN FLIPS — **discharges security-pass line 4** (裁-153)

Both roles ship **NOLOGIN** deliberately and their migration tails refuse `rolcanlogin` at apply
time — which is exactly why the flip is a deploy ceremony **after** step 5 and never repo-held DDL.

> **Number trap (truing line T-B / T-4).** `packages/runtime/lib/checkout-pools.mjs:45` and
> `security-pass-2026-09-02.md` items 4 and 5 say the auth-wall pair comes from `0161`. **It does
> not** — `0161` is Q-D6; the merged file that mints `clara_auth_wall_login` is
> `0163_checkout_gate_c3_folded_door.sql`. Numbers are claimed at merge (constraint 10). Preflight
> against the FILE, never the comment. (Law 3: spelling is not identity.)

**This is an `[O]` act** because it mints two passwords — crown jewels under `DR.md:397-402`, which
裁-162 does **not** supersede. The lead supplies the script and reads back the `pg_roles` proof,
which contains no secret. Use the estate's own idiom (`packages/db/deploy/read-logins-ceremony.sql:24-44`)
so no password reaches argv, a file, or the transcript:

```sh
… | node scripts/ops/dsn-pipe.mjs -- psql -v ON_ERROR_STOP=1
```
```sql
-- NOTE: \prompt ECHOES. Run in a PRIVATE session (read-logins-ceremony.sql:24 says so in terms).
\prompt 'clara_stripe_webhook_login password (echoes -- private session): ' pw
alter role clara_stripe_webhook_login login password :'pw';
alter role clara_stripe_webhook_login nocreaterole inherit;
do $$ begin
  if current_setting('is_superuser') = 'on' then
    alter role clara_stripe_webhook_login nosuperuser nobypassrls nocreatedb;
  end if;
end $$;
\unset pw
-- …then the identical block for clara_auth_wall_login.
```

**The superuser guard is not decoration.** PostgreSQL needs SUPERUSER to set
SUPERUSER/BYPASSRLS/CREATEDB **even when setting them false**, and Supabase's `postgres` is not one
— unguarded, this aborts **42501** mid-ceremony. That defect was found by the DR drill and cost a
real round (`read-logins-ceremony.sql:32-35`).

**Reads (lead, no secret):**
1. `select rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
   from pg_roles where rolname in ('clara_stripe_webhook','clara_stripe_webhook_login',
   'clara_auth_wall','clara_auth_wall_login') order by 1;` → the two `_login` shells
   `rolcanlogin = t` and **every capability column `f`**; the two **group** roles still
   `rolcanlogin = f`;
2. the membership read: each `_login` is a member of its group (`0160:129-131`, `0163:174-176`);
3. **re-read step 6's roster select** — the two `_login` roles must **still** show
   `usage_public = f` after the flip.

Then the owner builds each DSN **env-to-env** — the login role's user and password on the same
session-pooler host/port/database as the app's existing `DATABASE_URL`, carrying **the same TLS
posture that DSN already carries** (read its shape env-to-env). `checkout-pools.mjs:93-114` uses the
string as given; the bridge's `verify-full` pin is a **ceremony-tool** property, not a runtime one
(**NOT IN REPO**: there is no documented TLS posture for these two DSNs). **Never
`sslmode=no-verify`.** Never printed.

`[ ]` Both flips ran in a private session; no password reached a transcript.  as run: ____________
`[ ]` `pg_roles` proof: `_login` × 2 `rolcanlogin = t`, capabilities all `f`.  as run: ____________
`[ ]` Groups still NOLOGIN.  as run: ____________
`[ ]` Roster re-read: both `_login` still `usage_public = f`.  as run: ____________
`[ ]` Two DSNs built env-to-env, TLS posture matched, never printed.  as run: ____________
`[ ]` **Security-pass cutover line 4 TICKED HERE** (裁-153).  as run: ____________

---

### Step 12 · **[O]** THE NINE C-5 SECRETS + **[L]** THE HASH COMPARE — **discharges security-pass line 3** (裁-153)

**Every row below is `[O]`.** The lead's entire part is the receipt and the comparison.

The nine names, measured at `9d5d844e` in the v71 as-run (`docs/ops/runtime-deploy-2026-09-03-v71-chatturn-v17-c5.md:52-58`
— `fly secrets list -a clara-runtime` carried **19** names and **none** of these nine):

| # | name on `clara-runtime` | value | `[ ]` |
|---|---|---|---|
| 1 | `STRIPE_WEBHOOK_SECRET` | the `whsec_` from the owner's **sandbox** endpoint | `[ ]` |
| 2 | `CLARA_STRIPE_LIVEMODE` | **`test`** (裁-126 — sandbox for the whole beta) | `[ ]` |
| 3 | `CLARA_TRUSTED_CLIENT_IP_HEADER` | **`X-Clara-Client-IP`** — see the trap below | `[ ]` |
| 4 | `CLARA_RATE_WALL_PEPPER` | **the identical bytes `clara-web` holds**, minted once at FS-10 S8 (裁-152) | `[ ]` |
| 5 | `CLARA_AUTH_WALL_SERVICE_TOKEN` | **the identical bytes `clara-web` holds**, minted once at FS-10 S8 (裁-152) | `[ ]` |
| 6 | `CLARA_SUPABASE_URL` | from the Supabase project — **not** the three existing `SUPABASE_JWT_*` secrets (law 3) | `[ ]` |
| 7 | `CLARA_SUPABASE_ANON_KEY` | same | `[ ]` |
| 8 | `CLARA_STRIPE_WEBHOOK_DATABASE_URL` | step 11's first DSN | `[ ]` |
| 9 | `CLARA_AUTH_WALL_DATABASE_URL` | step 11's second DSN | `[ ]` |

Shape (in the owner's own terminal, env-to-env, never in chat):
`fly secrets set <NAME>=… -a clara-runtime` — **each `fly secrets set` triggers its own release**,
so set them in one pass.

**On `clara-web` (the Worker; `apps/web/wrangler.jsonc:3` names it `clara-web`) NOTHING is set
here.** `CLARA_RATE_WALL_PEPPER`, `CLARA_AUTH_WALL_SERVICE_TOKEN`, `CLARA_TRUSTED_CLIENT_IP_HEADER`
(= **`CF-Connecting-IP`**), `STRIPE_SECRET_KEY` (TEST-mode restricted), `CLARA_PUBLIC_ORIGINS`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` and `INVITE_MAIL_FROM` are **FS-10's `[O]` acts**
(checklist `:89-138`). This record only **verifies** them by names and digests.

> **The trap — same NAME, two correct VALUES.** `apps/web` sits between the browser and the runtime,
> so it forwards the address ITS edge saw under the fixed name
> `AUTH_WALL_CLIENT_IP_HEADER = "x-clara-client-ip"` (`apps/web/lib/rate-wall-courier.ts:96`), which
> the runtime reads case-insensitively (`packages/runtime/lib/rate-wall-courier.mjs:65-70`). Set the
> runtime to anything else and **every** confirmation answers **503** with nothing looking wrong in
> either app's configuration (checklist `:114-124`).

**Reads (lead):**
1. `fly secrets list -a clara-runtime` → **names and digests only**, all nine present (19 + 9 = **28**
   names expected; count them);
2. `wrangler secret list` for `clara-web` → the names, values redacted;
3. **THE HASH COMPARISON FS-10 COULD NOT RUN** (裁-152; checklist `:132-133`). This is the **first
   moment it has two operands** — the runtime held neither value until now. For
   `CLARA_RATE_WALL_PEPPER` and `CLARA_AUTH_WALL_SERVICE_TOKEN`, the owner computes a `sha256` of
   each value **in the owner's own terminal on each side** and hands the lead **the two digests**;
   the lead asserts equality. **Compare a hash, never the values.**

| shared value | digest as held by `clara-web` | digest as held by `clara-runtime` | EQUAL? |
|---|---|---|---|
| `CLARA_RATE_WALL_PEPPER` | `________________` | `________________` | `[ ]` |
| `CLARA_AUTH_WALL_SERVICE_TOKEN` | `________________` | `________________` | `[ ]` |

4. `/ready` **200** again after the release, and **C-5's two routes stop answering 503** on their
   configured branches.

`[ ]` All nine names present on `clara-runtime` (digests only).  as run: ____________
`[ ]` `clara-web`'s names read back, values redacted.  as run: ____________
`[ ]` **Both hash equalities asserted.**  as run: ____________
`[ ]` `/ready` 200 post-release; the two routes no longer 503.  as run: ____________
`[ ]` **Security-pass cutover line 3 TICKED HERE** (裁-153).  as run: ____________

---

### Step 13 · **[O] with the owner's own eyes, [L] instrument** — **THE SELF-SERVE WALK**

**This ONE step carries four things at once (裁-159 · 裁-146 pt 3 · 裁-148 · 裁-153 line 7):**
it **mints BELCORT**, it **IS the Mail certification**, it is the **only** checkout walk at Wave-G,
and it ticks security-pass line 7's walk half.

**Opens only if P-18 read TRUE.** If `/signup` is not reachable on the deployed build, **step 13
does not open**; 裁-159's route (b) (a hand-made `clara.users` row + an unconsumed admission token +
`create_firm` + a manual Supabase auth-user step) is the fallback the owner ruled **against**, and
the ceremony records why it was reached.

**The walk, in order, at `https://app.clarabook.com/signup`:**

| | act | read | `[ ]` |
|---|---|---|---|
| 1 | Sign up with the P-15 address (never-before-registered, non-team) | the "check your email" state | `[ ]` |
| 2 | **Receive the six-digit code** — arriving in **about a minute** | the mail itself, with **nothing to click** (`{{ .Token }}`, not a link) | `[ ]` |
| 3 | Type the code into the confirm card | the account **confirms** | `[ ]` |
| 4 | Sign the DPA | the signature recorded | `[ ]` |
| 5 | Registration → `open_checkout_intent` | **does NOT raise `CLR10`** — step 10's binding proof | `[ ]` |
| 6 | Stripe Checkout at the **seeded beta price, sandbox, MYR 0** | the session completes | `[ ]` |
| 7 | The signed `checkout.session.completed` reaches C-5's route | the route answers **200** where it answered 503 | `[ ]` |
| 8 | **The firm is born** | a new `clara.firms` row — **this is BELCORT** | `[ ]` |

**Instrument — named, because the repo's rig cannot do this.**
`pnpm --filter @clara/web e2e` serves a **LOCAL** build and **mocks Supabase** at
`${appOrigin}/e2e-supabase` (`apps/web/e2e/run.mjs:14-28`), so it cannot drive the live origin.
**NOT IN REPO:** nothing in the repo walks a remote origin. This is a **manual browser walk against
the live origin, driven from a written script prepared before the window** (one numbered line per
act, each naming the read it captures), with a screenshot per act. **Record in the as-run which
instrument was actually used** — the manual script, or a ceremony-written Playwright script pointed
at the remote origin. 裁-86's "a real browser" is satisfied by either; what is **not** satisfied is a
claim made from the local rig.

**Reads that close the step:** the `clara.stripe_events` row for the delivered event; the
`clara.firm_registration_payments` row; the new `clara.firms` row and **its id**; Stripe's own
delivery log showing a **2xx**; the runtime route answering **200**.

> **Record what a MYR 0 sandbox Checkout actually collects.** The definition of done says "checkout
> (test price, test card)", but a zero-amount session may not ask for a card at all — the plan row
> drives `payment_method_collection='if_required'` while the amount is 0. That is **the 裁-148
> posture, not a defect**: the card path moves to the real-money switch ceremony. Write down what
> the session asked for — it is the honest record of which arm this walk proved.

`[ ]` Instrument named (manual script / ceremony Playwright).  as run: ____________
`[ ]` **Mail certification: a six-digit code at a NON-team address, ≤ ~1 min, verified on the
page, nothing to click.** This is 裁-146 point 3 and nothing else certifies it — not a settings
screenshot, not the 16:55 *Invite user* proof (different template, a LINK, fired from the
dashboard).  as run: address ____________ · sent ______ · received ______ · verified ______
`[ ]` `open_checkout_intent` did not raise `CLR10`.  as run: ____________
`[ ]` Stripe delivery 2xx; C-5 route 200.  as run: ____________
`[ ]` **BELCORT firm id:** ____________________________________
`[ ]` What the MYR 0 session collected: ____________________________
`[ ]` **Security-pass cutover line 7's walk half TICKED HERE** (裁-153; its DPA-read half is already
MET on the tree).  as run: ____________

---

### Step 14 · **[L]** BELCORT's `is_operator` (裁-121③ · 裁-159)

Runbook: `docs/ops/g1-operator-firm-ceremony.md`. Walk its §0 preconditions **in full**:

| precondition | read | `[ ]` |
|---|---|---|
| the column exists | `select count(*) from information_schema.columns where table_schema='clara' and table_name='firms' and column_name='is_operator';` → **1** | `[ ]` |
| the G1 migration is in the live ledger under its exact stem | `select version from clara.schema_migrations where version = '0133_g1_wake_engine';` → **exactly one row** | `[ ]` |
| **zero** firms currently carry the flag | `select id, name, is_operator from clara.firms where is_operator;` → **zero rows** | `[ ]` |
| BELCORT resolves to **exactly one** row | `select id, name, created_at from clara.firms where name = 'BELCORT';` → **one row** (satisfied because step 13 minted it — the runbook refuses on zero rows, which is why this step is **after** 13) | `[ ]` |
| the canary is untouched, never answered | the read-only counts from 3b.3, and constraint 11 | `[ ]` |

```sql
set role clara_fn_owner;
update clara.firms set is_operator = true where id = '<the literal id from step 13>';
```

Expect **`UPDATE 1`**. **Paste the literal id looked up above — never a name-matched subquery**
(law 3: a name is a projection, not the row's identity; `name` is not unique on `clara.firms`).
`UPDATE 0` means the id was wrong: **stop**, do not retry against a re-resolved name lookup.

**Reads, all three:**
1. `select id, name, is_operator from clara.firms where is_operator;` → exactly one row,
   `name = 'BELCORT'`;
2. `select indexdef from pg_indexes where schemaname='clara' and tablename='firms' and
   indexname='uq_firms_one_operator';` → still shows `UNIQUE … WHERE (is_operator)` — the **partial**
   form, re-derived from the catalog rather than assumed from having just run the UPDATE;
3. `select count(*) from clara.firms where is_operator;` → **1**.

**This act writes no `clara.audit_log` row** — there is no generic trigger on `clara.firms` and this
ceremony deliberately calls no governed writer (there isn't one; that is the point). **The durable
record is this as-run.**

`[ ]` All five preconditions read.  as run: ____________
`[ ]` `UPDATE 1` against the literal id.  as run: ____________
`[ ]` Three verification reads.  as run: ____________

---

### Step 15 · **[L] instrument, [O] eyes** — THE CORPUS WALK

Order matters — **15.0 and 15.4 are one-shot reads.**

**15.0 · [L] The 裁-147 Stripe-problem line — BEFORE the walk starts.**
```sql
select id, kind, noticed_at from clara.stripe_event_problems
 where resolved_at is null order by noticed_at;
```
→ **EMPTY.** A non-empty result is resolved through
`clara.resolve_stripe_event_problem(problem, resolution, op_key)` **with its reason** before the walk
proceeds (`0160:580-635`).
*Ordering fact:* the operator **door** `clara.list_stripe_event_problems(boolean)` requires an
owner-rank JWT **whose firm is `is_operator`** (`0160:562-576`, `CLR04` otherwise), so it is only
callable after step 14. Before that, use the raw select — exactly the alternative 裁-147 names.
**No operator SCREEN exists — post-beta by 裁-147**, so this line is manual **by ruling**, not by
omission. *(Do not read the door's `CLR04` as "no problems".)*
`[ ]` as run: ____________

**15.1 · [L] The RPR bank-statement series pick — recorded WITH its measurement.**
Checklist `:224-226`: the pick is *"the agent's, by measurement (the series that covers Apr–Jul
exactly once)"*. Record the candidate series, **the coverage measurement that discriminates them**,
the chosen one, and the sentence that says why. **A pick without the measurement is not this line.**
`[ ]` as run: candidates ____________ · measurement ____________ · chosen ____________ · why ____________

**15.2 · [L] The 资料缺失 marks — written, never silently absorbed.**
Checklist `:227-229`. Each of the four named gaps appears in the as-run carrying the **literal mark**:
| gap | marked 资料缺失 | `[ ]` |
|---|---|---|
| BEE GL/TB for either FY | | `[ ]` |
| RPR Feb-2025 statements | | `[ ]` |
| RPR Mar-2025 statements | | `[ ]` |
| named producer/certifier for RS and RPR | | `[ ]` |

> **NOT IN REPO:** the desktop corpus itself is **not inventoried** anywhere in the repo, so *"every
> flow on the corpus"* cannot be checked against a manifest. **The as-run should carry one.**

**15.3 · [L] OPS.x — the parts union** (裁-121②, checklist `:230-231`): the Workers deploy of
`apps/web` carries a parts union ⊇ the serving runtime's emittable kinds. The repo ships this as a
CI gate (the parts-parity gate); re-run it against the **deployed pair** and name the result.
`[ ]` as run: ____________

**15.4 · [L] The 裁-136 one-shot reads — IMMEDIATELY BEFORE the first render, not at the close.**
- **Before the first render:** `select count(*) from clara.report_artifacts;` → **0**. Record it.
  Checklist `:252-254`: *"this is the last moment that fact is checkable"*, and it is what makes
  *"no hash migration is owed"* a **measurement** rather than a memory.
- **Immediately after the first sealed artifact:** read the **first manifest's `extraction_tool`**
  and confirm it names **`-raw`** — read it **off the artifact, not off the source**. The mode is
  pinned in `packages/reporting-render/lib/extract.mjs`'s `EXTRACT_FLAGS` and rides in the manifest
  string. **A manifest whose `extraction_tool` does not name `-raw` means the machine ran an older
  image and the seal must be redone.**
- From then on a change to the extraction mode is a **HASH MIGRATION**, not a flag edit — a fact for
  the as-run, not an act.
