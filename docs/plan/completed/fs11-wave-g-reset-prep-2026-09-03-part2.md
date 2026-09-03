*Part 2 of 3 of the FS-11 Wave-G reset PREP pack (2026-09-03) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: `fs11-wave-g-reset-prep-2026-09-03-part1.md` · Next: `fs11-wave-g-reset-prep-2026-09-03-part3.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

  | CLARA_ALLOW_DESTRUCTIVE=1 CLARA_DESTRUCTIVE_TARGET="<the exact string from step 1>" \
    node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/reset.mjs
```

> **Authority note (D-4).** `docs/ops/DR.md:397-402` classifies a `CLARA_ALLOW_DESTRUCTIVE=1` +
> `CLARA_DESTRUCTIVE_TARGET` act against a project as **owner-run**. Constraint 14 / ADR-0075
> (`AGENTS.md:78-84`) makes this project's estate test data the agent may reset without asking. **The
> ruling on which governs is D-1's sibling D-4 and must be recorded before this step opens** (P-16);
> the recommended sentence and its truing line are T-3.

**Pre-read first (this is what distinguishes a reset from a wrong-target no-op — R-11):**
`select to_regnamespace('clara') is not null as present;` → **true**, and
`select count(*) from clara.schema_migrations;` → **148**. Without this pre-read, a stale target
string makes `reset.mjs:63-68` short-circuit with *"schema \"clara\" does not exist — nothing to
drop"* and **exit 0**.

The script preflights `pg_depend` and **aborts** if any object outside `clara` would be cascaded
(`reset.mjs:20-53,71-76`) — that preflight is what keeps constraint 15 intact
(`workflow`/`graphile_worker`/`spike` are independent of `clara`, `reset.mjs:10-13`).

*Positive reads:* the script's own `reset: dropped schema "clara" · target …` line, then
`select to_regnamespace('clara') is null as gone;` → **true**, and
`select nspname from pg_namespace where nspname in ('workflow','workflow_drizzle','graphile_worker','spike') order by 1;`
→ all four still present (**constraint 15 proven by a read, not by the script's scope claim**).

*Recorded consequence (D-2):* the canary's clara-side rows are now gone. Write the as-run line here,
not later.

*Recorded consequence (D-3):* `auth.users` and the `firm-docs` Storage objects are **untouched** —
`docs/ops/DR-full-drill.md:149-157` ("no FK from clara"; bytes live outside Postgres). Record the
`auth.users` count and the orphaned-object count now, as the baseline the D-3 ruling acts on.

---

**Step 5 · [L] MIGRATE — the whole chain (§1.1).**

```sh
… | node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/migrate.mjs
```

*Positive reads:* the runner's summary line `migrate: 159 new migration(s) applied · 159 total`
(`packages/db/README.md:151-160` — the summary counts only files that passed the `NNNN_` filter, so
a silently-skipped `UNNUMBERED_*` would show here as a short count; P-4 is the guard) **and**
`select count(*), max(version) from clara.schema_migrations;` → **159 /
`0164_checkout_gate_c6_web_reads`**. Each migration applies in its own transaction and records its
`sha256` (`README.md:138-144`).

---

**Step 6 · [L] APPLY THE ACL BASELINE — `packages/db/deploy/acl-baseline.sql`. (NEW — folded.)**

*Why this step exists:* the security pass's cutover line 5 says it in terms —
*"`packages/db/deploy/acl-baseline.sql` has been run on the live project … the migration's own tail
proves no `clara` relation privilege for the auth-wall pair, but it does **not** prove the absence of
`public`-schema reach — measured on a migrations-only rig, `clara_auth_wall` still holds `public`
USAGE"* (`docs/plan/active/security-pass-2026-09-02.md:554-559`). FS-10's record deferred that line
to "FS-11" generically and pass 1 of this record named the baseline **only inside the rollback** —
so the act fell between two ceremonies. It is now a numbered step. `docs/ops/DR.md:256-259` says the
same from the other side: **the ACL baseline is carried by no dump**, so a rebuilt catalog does not
have it.

**It must run AFTER step 5 and never before:** the script's EXISTENCE CHECK block aborts fail-closed
if any confined role is absent (`acl-baseline.sql:51-70`), and four of the eleven —
`clara_stripe_webhook`, `clara_stripe_webhook_login`, `clara_auth_wall`, `clara_auth_wall_login` —
are minted by `0160` and `0163`.

```sh
… | node scripts/ops/dsn-pipe.mjs -- psql -v ON_ERROR_STOP=1 -f packages/db/deploy/acl-baseline.sql
```

Run **as the schema/db OWNER** (Supabase `postgres` — the bridge's own principal). The script's
PREFLIGHT asserts it: `deploy_is_dbowner_member = t`, *"else the public revoke will SILENTLY no-op"*
(`acl-baseline.sql:31-38`).

*Positive reads, all four:*
1. `ACL baseline verify: OK` — the notice the fail-closed VERIFY block raises (`acl-baseline.sql:194`);
   any failure raises `ACL BASELINE VERIFY FAILED: …` instead (`:193`).
2. The final roster select (`acl-baseline.sql:197-200`): **all ELEVEN confined roles**
   (`clara_agent_ro`, `clara_wake_interactive`, `clara_wake_proactive`, `clara_agent_read_login`,
   `clara_wake_write_login`, `clara_freeform_ro`, `clara_freeform_login`, `clara_stripe_webhook`,
   `clara_stripe_webhook_login`, `clara_auth_wall`, `clara_auth_wall_login` — `:166-170`) show
   `usage_public = f` **and** `temp_db = f`.
3. The preservation control: `clara_runtime` still shows **both** `t` (`:187-192`) — the
   snapshot-and-re-grant worked and no non-confined role lost anything.
4. `clara_auth_wall` specifically holds **no** `public` USAGE — the exact fact security-pass line 5
   says a migrations-only rig does **not** produce.

*Known residual, not a defect:* the `pg_catalog` residual (`pg_notify` / `pg_advisory_*` /
`pg_sleep` / `query_to_xml`) cannot be closed by a non-superuser and is an **accepted, documented
gap** on managed Supabase (`acl-baseline.sql:7-12`).

---

**Step 7 · [L, per D-4] SEED — synthetic only.**

```sh
… | CLARA_ALLOW_DESTRUCTIVE=1 CLARA_DESTRUCTIVE_TARGET="…" \
    node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/seed.mjs
```

(`seed.mjs:59` calls the same guard — it truncates + reloads synthetic data.)

*Positive read:* `select count(*) from clara.firms;` → the seed's two synthetic firms;
`select count(*) from clara.users where id = '5eed0000-0000-4000-8000-00000000a11e';` → 1 (the
sentinel, `0002_core_seed.sql:15,31-34`).

---

**Step 8 · [L] Re-deploy the nine evaluators (§1.3).**

Derive the roster from the DB, never from memory:
`select evaluator_name, version, deployed from clara.evaluator_versions order by 1,2;` — then, for
each name/version whose manifest entry says `deployed: true`:

```sh
… | node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/deploy-evaluator-version.mjs --name <n> --version <v>
```

Run under the bare principal — **no `SET ROLE`** (`packages/db/README.md:226-233`).
**Do not run `--lock-deployed`** (blanket; `README.md:239-241`).

*Positive read:* re-read `clara.evaluator_versions` → exactly those nine rows `deployed = true`,
and `clara.verify_evaluator_freeze()` clean. **The transition is one-way and admitted once per row —
there is no undo** (§5).

---

**Step 9 · [L] Start the runtime and prove the world is up.**

`fly machine start 48ee715b763048 -a clara-runtime` → `GET /health` 200 → `GET /ready` 200 with
`db`/`world`/`control`/`taxonomy`/`relay` ok (the shape the v71 as-run recorded,
`…/scratchpad/ceremonies/runtime-deploy-v17-c5.md:60-68`). C-5's two routes still answer **503** here
— correct and expected until step 12.

---

**Step 10 · [L] The `stripe_object_map` OPS ACT.**

`clara.stripe_object_map` has **forced** RLS with exactly one write-capable policy, for
`clara_fn_owner` (`0160_checkout_gate_c2_stripe_events.sql:258-270`) — so the `SET ROLE` is
mandatory, not stylistic.

```sh
… | node scripts/ops/dsn-pipe.mjs -- psql -v ON_ERROR_STOP=1
```
```sql
set role clara_fn_owner;
insert into clara.stripe_object_map(object_kind, local_key, stripe_id) values
  ('product','clara-beta-2026','prod_VBS7ZUaIFPedCs'),
  ('price',  'clara-beta-2026','price_1UB5DZHD90w0k86XNfkgYPWq');
```

Ids and local key from `docs/ops/wave-g-setup-checklist.md:184-189` and 裁-126
(`docs/plan/active/mohe-grill-rulings-2026-09-02.md:207-217`) — the map is **written by this ops act,
not by C-5**, which only reads it. **Sandbox ids only** (livemode `false`, P-12).

*Positive reads:* `select object_kind, local_key, stripe_id from clara.stripe_object_map order by 1;`
→ the two rows (the checklist's own named proof). The **binding** read is the resolution path:
`0163_checkout_gate_c3_folded_door.sql:465-476` resolves `billing_plans.local_key` where
`is_current` (that row is `('clara-beta-2026','Clara Beta',0,'MYR',false,true)`,
`0163:213-214`) and then looks the price up by `object_kind='price' and local_key=<that>`; a
mismatch raises `CLR10 no stripe price is mapped for this plan`. So the second proof is the
checklist's: one `open_checkout_intent` call that does **not** raise CLR10 — which lands in step 13.

> **裁-148 — settled, no arm to choose.** Walk checkout **ONCE at the seeded beta price (sandbox,
> MYR 0)**. **No second, non-zero price is minted and no `is_current` plan is temporarily switched at
> Wave-G** (裁-148 point 2). The checklist's *"non-zero test price … a zero-amount or skipped checkout
> does not satisfy this line"* (`docs/ops/wave-g-setup-checklist.md:190-193`) is **superseded** —
> truing line **T-2**; the non-zero walk belongs to the real-money switch ceremony with Stripe live
> mode and KYB (裁-125/126). Ruling record: `…/scratchpad/truing/ruling-148.md`, riding PR #538.

---

**Step 11 · [O, lead scripts and verifies] The two NOLOGIN→LOGIN role flips, then their DSNs.**

Both roles ship **NOLOGIN** deliberately and their migration tails refuse `rolcanlogin` at apply
time (`0160:120-131,855-861` for `clara_stripe_webhook_login`; `0163:165-185,1053+` for
`clara_auth_wall_login`) — which is exactly why the flip is a deploy ceremony **after** step 5 and
never repo-held DDL (`docs/ops/wave-g-setup-checklist.md:100-102`).

> **Number trap (truing line T-4):** `packages/runtime/lib/checkout-pools.mjs:45` says the auth-wall
> pair comes from `0161`. It does not — `0161` is Q-D6; the merged file that mints
> `clara_auth_wall_login` is `0163_checkout_gate_c3_folded_door.sql:165-185`. Numbers are claimed at
> merge (constraint 10); preflight against the file, not the comment.

**This is an [O] act** because it mints two passwords — crown-jewel secrets under
`docs/ops/DR.md:397-402`. The lead supplies the exact script and reads back the `pg_roles` proof
(which contains no secret). Use the estate's own idiom —
`packages/db/deploy/read-logins-ceremony.sql:24-44` — so no password ever reaches argv, a file, or
the transcript:

```sh
… | node scripts/ops/dsn-pipe.mjs -- psql -v ON_ERROR_STOP=1
```
```sql
\prompt 'clara_stripe_webhook_login password (run in a PRIVATE session): ' pw
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

The superuser guard is not decoration: PostgreSQL needs SUPERUSER to set SUPERUSER/BYPASSRLS/CREATEDB
**even when setting them false**, and Supabase's `postgres` is not one — unguarded, this aborts
42501 mid-ceremony. That defect was found by the DR drill and cost a real round
(`read-logins-ceremony.sql:32-35`; `docs/ops/DR.md:236-247`).

*Positive reads (lead, no secret):* `select rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreatedb,
rolcreaterole, rolreplication from pg_roles where rolname in ('clara_stripe_webhook',
'clara_stripe_webhook_login','clara_auth_wall','clara_auth_wall_login') order by 1;` → the two
`_login` shells `rolcanlogin = t` and every capability column `f`; the two group roles still
`rolcanlogin = f`. Then the membership read: each `_login` is a member of its group (`0160:129-131`,
`0163:174-176`). **Then re-read step 6's roster select** — the two `_login` roles must still show
`usage_public = f` after the flip.

Then the owner builds each DSN **env-to-env** — the login role's user + password on the same
session-pooler host/port/database as the app's existing `DATABASE_URL`, carrying the **same TLS
posture that DSN already carries** (read its shape env-to-env; `checkout-pools.mjs:93-114` uses the
string as given, and the bridge's `verify-full` pin is a *ceremony-tool* property, not a runtime one
— R-8). Never `sslmode=no-verify`. Never printed.

---

**Step 12 · [O] The C-5 secrets — every one an OWNER act. Lead: names-and-digests + the hash compare.**

*Folded from the critic pass:* pass 1 left `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` and
`STRIPE_SECRET_KEY` to the lead by default, which contradicts both FS-10's assignment
(`…/scratchpad/ceremonies/fs10-cutover-prep.md:136-146`, S7 marked **[O]**) and
`docs/ops/DR.md:397-402`. **Every row below is [O].** The lead's entire part is the receipt and the
comparison.

Nine names on `clara-runtime`, from the C-5 prep's table
(`…/scratchpad/ceremonies/runtime-deploy-v17-c5.md:106-123`), each read off the code:

| name | value | act |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | the `whsec_` from the owner's **sandbox** endpoint | **[O]** dashboard + `fly secrets set` in the owner's terminal |
| `CLARA_STRIPE_LIVEMODE` | `test` (**裁-126** — sandbox for the whole beta) | **[O]** (not a secret, but set in the same pass so one release carries all nine) |
| `CLARA_TRUSTED_CLIENT_IP_HEADER` **on the runtime** | **`X-Clara-Client-IP`** | **[O]** |
| `CLARA_RATE_WALL_PEPPER` | **the identical value `clara-web` already holds** — minted once at FS-10 (P-17) | **[O]** |
| `CLARA_AUTH_WALL_SERVICE_TOKEN` | **the identical value `clara-web` already holds** — minted once at FS-10 (P-17) | **[O]** |
| `CLARA_SUPABASE_URL` / `CLARA_SUPABASE_ANON_KEY` | from the Supabase project — **not** the three existing `SUPABASE_JWT_*` secrets (spelling is not identity, law 3) | **[O]** |
| `CLARA_STRIPE_WEBHOOK_DATABASE_URL` / `CLARA_AUTH_WALL_DATABASE_URL` | step 11's two DSNs | **[O]** |

**On `clara-web` (the Worker; `apps/web/wrangler.jsonc:3` names it `clara-web`) nothing is SET here.**
`CLARA_RATE_WALL_PEPPER`, `CLARA_AUTH_WALL_SERVICE_TOKEN`, `CLARA_TRUSTED_CLIENT_IP_HEADER`
(= **`CF-Connecting-IP`**), `STRIPE_SECRET_KEY` (TEST-mode restricted), `CLARA_PUBLIC_ORIGINS`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` and `INVITE_MAIL_FROM` are **FS-10's [O] acts**
(`docs/ops/wave-g-setup-checklist.md:89-138`). This record only **verifies** them by
names-and-digests — *every crown-jewel secret is an owner act in ONE record only*.

**Why the two header values differ, in one line:** `apps/web` sits between the browser and the
runtime, so it forwards the address ITS edge saw under the fixed name
`AUTH_WALL_CLIENT_IP_HEADER = "x-clara-client-ip"` (`apps/web/lib/rate-wall-courier.ts:96`), which
the runtime reads case-insensitively (`packages/runtime/lib/rate-wall-courier.mjs:65-70`). Set the
runtime to anything else and **every** confirmation answers 503 with nothing looking wrong in either
app's configuration (`docs/ops/wave-g-setup-checklist.md:117-124`).

*Positive reads (lead):*
- `fly secrets list -a clara-runtime` → **names and digests only**, all nine present.
- `wrangler secret list` for `clara-web` → the names, values redacted.
- **The hash comparison FS-10 had to defer** (its S7 could not run it — the runtime held neither
  value until now): for `CLARA_RATE_WALL_PEPPER` and `CLARA_AUTH_WALL_SERVICE_TOKEN` the owner
  computes a `sha256` of each value in their own terminal on each side and hands the lead **the two
  digests**; the lead asserts equality. **Compare a hash, never the values**
  (`docs/ops/wave-g-setup-checklist.md:132-133`).
- Then `/ready` 200 again after the release, and the two C-5 routes stop answering `503` on their
  configured branches.

---

**Step 13 · [O + L] The sandbox round trip — and (route (a), D-1) the act that mints BELCORT.**

**Opens only if P-15 read TRUE** — FS-4 closed (#517 `aa789d65`) *and* the deployed `/signup` route
measured reachable on the live build. **If that read fails, step 13 does not open**; D-1 falls back
to route (b) and the ceremony records why.

A **real** signup at the P-13 address → the six-digit code → DPA sign → registration →
`open_checkout_intent` (must NOT raise CLR10 — step 10's binding proof) → Stripe Checkout **at the
seeded beta price, sandbox, MYR 0** (裁-148) → a signed `checkout.session.completed` through C-5's
route → firm minted.

**Instrument — named, because the repo's rig cannot do it.** `pnpm --filter @clara/web e2e` serves a
**LOCAL** build and **mocks Supabase** at `${appOrigin}/e2e-supabase` (`apps/web/e2e/run.mjs:14-28`),
so it cannot drive the live origin — the sibling record states the same limit
(`…/scratchpad/ceremonies/fs10-cutover-prep.md:190-192`). **This walk is a MANUAL BROWSER WALK
against `https://app.clarabook.com`, driven from a written script file prepared before the window**
(one numbered line per act, each naming the read it captures), with a screenshot per act. Record in
the as-run **which instrument was actually used** — manual script, or a ceremony-written Playwright
script pointed at the remote origin — as FS-10's §7 does. 裁-86's "a real browser" is satisfied by
either; what is not satisfied is a claim made from the local rig.

*Positive reads:* the `clara.stripe_events` row for the delivered event; the
`clara.firm_registration_payments` row; the new `clara.firms` row; Stripe's own delivery log showing
a 2xx; and the runtime's route answering **200** where it answered 503.

> **Record what a MYR 0 sandbox Checkout actually collects.** The 16-step definition of done says
> "checkout (test price, test card)" (`docs/plan/active/frontend-sprint-handoff-2026-08-31.md:288`),
> but a zero-amount session may not ask for a card at all. That is **the 裁-148 posture, not a
> defect**: the card path moves to the real-money switch ceremony. Write down what the session asked
> for — it is the honest record of which arm this walk proved.

---

**Step 14 · [L] BELCORT's `is_operator` — its own ceremony step (裁-121③).**

Runbook: `docs/ops/g1-operator-firm-ceremony.md`. Walk its §0 preconditions in full — the column
exists (`:68-76`), **zero** firms currently carry the flag (`:82-91`), and BELCORT resolves to
**exactly one** row (`:93-109` — now satisfied, because step 13 minted it).

```sql
set role clara_fn_owner;
update clara.firms set is_operator = true where id = '<belcort-firm-id-from-§0>';
```

Expect `UPDATE 1`. Paste the **literal id looked up in §0** — never a name-matched subquery (law 3;
`:139-143`). No app role can write `clara.firms` at all, which is what makes this a raw act
(`:113-129`).

*Positive reads (all three, per `:169-198`):* `select id, name, is_operator from clara.firms where
is_operator;` → exactly one row, `name = 'BELCORT'`; the `uq_firms_one_operator` `indexdef` still
showing `UNIQUE … WHERE (is_operator)`; and `select count(*) … where is_operator;` → `1`.
**This act writes no `clara.audit_log` row** (`:158-165`) — the durable record is the as-run.

---

**Step 15 · [O eyes + L instrument] THE CORPUS WALK — Wave-G's acceptance criterion.**

*Folded from the critic pass (BLOCKER): pass 1's sixteen steps contained only the Stripe round trip,
while the FS-11 order's acceptance clause is the walk itself* —
*"the **sixteen-step walk on the desktop corpus** … driven end to end in a real browser (Playwright,
裁-86)"* (`docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:484-487`), recorded as
FS-11's item 29 in the conformance pass
(`docs/plan/active/clarabook-conformance-pass-3-2026-09-02.md:53`), with the criterion fixed at
`docs/ops/wave-g-setup-checklist.md:221-223`: *"every flow and every feature walks end-to-end on the
corpus already on the desktop. **There is no further owner evidence coming** — do not wait on it."*

**Same instrument as step 13** (manual browser walk from a written script against the live origin;
the repo rig serves a local build). Order matters — 15.0 and 15.4 are one-shot reads.

**15.0 · [L] The 裁-147 Stripe-problem line — BEFORE the walk starts.**
`select id, kind, noticed_at from clara.stripe_event_problems where resolved_at is null order by noticed_at;`
→ **EMPTY**. A non-empty result is resolved through `clara.resolve_stripe_event_problem(uuid,text,text)`
with its reason before the walk proceeds (`0160_checkout_gate_c2_stripe_events.sql:580-635`).
*Ordering fact:* the operator **door** `clara.list_stripe_event_problems(boolean)` requires an owner-rank
JWT **whose firm is `is_operator`** (`0160:562-576` — `_human_ctx(role_rank('owner'))` plus the
`f.is_operator` predicate, `CLR04` otherwise), so it is only callable after step 14; before that, use
the raw select above — which is exactly the alternative 裁-147 point 2 names
(`…/scratchpad/truing/ruling-147.md`). **No operator SCREEN exists — it is post-beta by 裁-147**, so
this line is manual by ruling, not by omission.

**15.1 · [L] The RPR bank-statement series pick — recorded with its reason.**
`docs/ops/wave-g-setup-checklist.md:224-226`: *"The RPR overlapping bank-statement series pick is
**the agent's, by measurement** (the series that covers Apr–Jul exactly once) — record which series
was picked, and why, in the Wave-G as-run."* → *Read:* the candidate series, the coverage
measurement that discriminates them, the chosen one, and the sentence that says why. A pick without
the measurement is not this line.

**15.2 · [L] The 资料缺失 marks — written, never silently absorbed.**
`docs/ops/wave-g-setup-checklist.md:227-229`: *"Every MBB-1 gap the corpus cannot supply (BEE GL/TB
for either FY, RPR Feb/Mar-2025 statements, named producer/certifier for RS/RPR) is marked
**资料缺失** in the acceptance record — never silently absorbed, never awaited."* → *Read:* each of
those four named gaps appears in the as-run carrying the literal mark.

**15.3 · [L] OPS.x — the parts union.**
`docs/ops/wave-g-setup-checklist.md:230-231` (裁-121②): the Workers deploy of `apps/web` carries a
parts union ⊇ the serving runtime's emittable kinds. The repo already ships this as a CI gate (the
parts-parity gate, `AGENTS.md:216-222`); re-run it against the deployed pair and name the result.

**15.4 · [L] The 裁-136 one-shot reads — IMMEDIATELY BEFORE the first render, not at the close.**
*Folded: pass 1 filed these as as-run lines in the closing step, but the fact is only checkable
before the first seal* (`docs/ops/wave-g-setup-checklist.md:252-254` — *"this is the last moment that
fact is checkable"*).
- **Before the first render:** `select count(*) from clara.report_artifacts;` → **0**. Record it.
  This is what makes *"no hash migration is owed"* a measurement rather than a memory.
- **Immediately after the first sealed artifact:** read the **first manifest's `extraction_tool`**
  and confirm it names **`-raw`** (`docs/ops/wave-g-setup-checklist.md:246-251`) — read it **off the
  artifact, not off the source**; the mode is pinned in
  `packages/reporting-render/lib/extract.mjs`'s `EXTRACT_FLAGS` and rides in the manifest string. *A
  manifest whose `extraction_tool` does not name `-raw` means the machine ran an older image and
  **the seal must be redone**.*
- From then on a change to the extraction mode is a **HASH MIGRATION**, not a flag edit
  (`:255-259`) — a fact for the as-run, not an act.

**15.5 · [O eyes] The sixteen-step happy path.** **What the repo actually enumerates is ELEVEN named
milestones under the "sixteen-step" label** — `docs/plan/active/frontend-sprint-handoff-2026-08-31.md:287-292`
and, identically, `docs/plan/active/dashboard-web-capability-diff-2026-09-02.md:36-40`:

| # | Step (verbatim from the repo) | Where it is walked |
|---|---|---|
| 1 | signup | step 13 |
| 2 | checkout (test price, test card) | step 13 — **at MYR 0, sandbox, per 裁-148** |
| 3 | firm born | step 13 |
| 4 | members invited | `/admin/members` + the Resend invite courier (`apps/web/lib/members/invite-mail.ts`) |
| 5 | client onboarded through the in-thread interview | step 16 line 1 |
| 6 | documents posted unattended | step 16 line 2 |
| 7 | bank matched in chat | step 16 lines 3–5 |
| 8 | fiscal year opened | step 16 line 5's neighbourhood — **surface not separately measured in this prep** |
| 9 | year-end closed with human keys | step 16 line 5 (law 71's human-only four) |
| 10 | management-accounts PDF downloaded | step 16 line 6 |
| 11 | FY2 opened | **not separately measured in this prep** |

**The remaining five of the "sixteen" are NOT ENUMERATED IN THE REPO** — the label appears in six
places and the list never reaches sixteen (§12 item 10). Do not invent them: walk the eleven named
milestones plus step 16's product walk, and record the count honestly in the as-run.

---

**Step 16 · [O eyes + L instrument] THE PRODUCT WALK — the owner's own ask.**

*Why this step exists:* every checklist line above it proves the **admission** path (signup → pay →
firm → invite → mail → secrets) and none proves the **product**. The owner asked for it directly at
≈18:25 MYT on 2026-09-03 (*"e2e 也有 onboard, upload doc, agentic/人手做帐, bank reconciliation, chat to
reconciliation … all core features 都可以实现 right?"*), and **truing-4 is adding the same section to
the checklist** — cite it as **checklist § Product walk (truing-4, PR #538)** and, once #538 merges,
re-read that section and defer to its text. Routes and doors below were measured on `main 5eab358d`.

**Rules for this step, from the owner's own framing:** *a failure becomes a Known-issues row for the
launch sitting — it does not silently block, and **no mechanism is touched to get past it***
(constraint 14's operative clause). Where no surface exists, write **"not shipped → Known issues"**
rather than improvising one.

| # | The owner sees | The lead's instrument (measured at `5eab358d`) |
|---|---|---|
| 1 | **A client company is onboarded** | `/clients`, plus the durable `clientOnboarding_v4` (registry pin `packages/runtime/workflows/registry.ts:129`), the chat lane's `apps/web/components/clara/OnboardingChecklistCard.tsx` and `InterviewRunCard.tsx`, and the ⌘K **Do** action `begin_client_onboarding`. **Known honest gap:** there is **no "add a client" control on `/clients`** — onboarding starts in the chat lane via the ⌘K Do action. Record it as *a discoverability finding for the launch sitting, not a build failure* |
| 2 | **A document is uploaded and its extraction is visible** | the Documents tab or the composer, over the Slice-5 intake pair (`packages/runtime/src/intakeRoutes.ts`); the extraction shows in `apps/web/components/documents/document-extract-panel.tsx` |
| 3 | **A bank statement is read and appears in the Bank tab** | `statement-parse.mjs` → `apps/web/components/bank/statements-section.tsx` |
| 4 | **The agent proposes and a human posts** | matcher/autodraft proposals **posted AND refused** in the Journals tab — both arms, because the refusal is the wall. PRD §6 invariant 1: the agent proposes, the human disposes; the agent roles hold **zero DML on the books** |
| 5 | **A chat-to-close proposal is adopted (or withdrawn)** | a close-prep turn on `chatTurn_v17` producing a proposal/receipt the human adopts or withdraws; **law 71's human-only four are the failure condition** — if any of them can be walked by the agent, STOP: that is a security finding, not a walk item |
| 6 | **A report renders and downloads** | `renderEnqueueDue` → `apps/web/components/reports/DownloadArtifactButton.tsx`. **After the reset**, because `0162`'s download door applies there. **Blocked if step 8 was skipped** — a dark evaluator refuses the figure (constraint 2) |
| 7 | **The fixture estate re-runs through the real doors** | constraint 13: `reset.mjs` / `seed.mjs` / `onboard-rpr.mjs`, with the RS trial-balance pin as the positive read |

*Proof line:* every one of the seven carries a screenshot or a receipt id in the as-run, and each
"not shipped" verdict names the census that establishes the absence (law 2 — absence is not evidence
unless a read saw it).

---

**Step 17 · [O] The Mail certification — the launch gate (裁-146 point 3).**

`docs/ops/wave-g-setup-checklist.md:79-84`: the section certifies **only** after a real signup
confirmation is **sent to and received at a NON-team address** through the custom SMTP, the six-digit
code arriving in about a minute and verifying on the confirm page. **A settings screenshot does not
certify it; a message to a team address does not either.** Step 13's own signup **is** this test when
P-13 holds.

**What is already proven and what is still owed (裁-146, measured 09-03):**
- **PROVEN ≈16:08 MYT** — custom SMTP enabled; host `smtp.resend.com`, sender
  `no-reply@mail.clarabook.com`, sender name `Clara` read back (`:24-46`).
- **PROVEN ≈16:55 MYT** — delivery to a **non-team** address, via the dashboard's **Invite user**
  arm (`:55-63`). *That retires the default mailer's wall as a measured fact but does **not**
  certify this section*: different template, a LINK not a CODE, fired from the dashboard rather than
  the app's own path.
- **OWED AT THE WALK** — the **/signup six-digit-code arm**. This is the gate.

**Also read back at the walk, all three reported-but-not-measured on 09-03** (`:64-71`): the test
user deleted; the **rate-limit raise — its value was never stated, so record the number now**; and
the *Confirm signup* template still `{{ .Token }}` — the last by **Management API read, not a
screenshot** (`docs/plan/active/security-pass-2026-09-02.md` item 8).

**The Resend half of the Mail section — three owner console acts + a proof line. (NEW — folded.)**
The FS-11 order puts *"the Supabase/**Resend**/Cloudflare items"* in this ceremony
(`docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:484`) and pass 1 carried none of them:

- **[O] The API key scope is `sending_access` ONLY — domain-restricted** to the one verified domain
