*Part 4 of 6 of the FS-11 Wave-G factory-reset as-run (2026-09-04) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: `fs11-wave-g-asrun-2026-09-03-part3.md` · Next: `fs11-wave-g-asrun-2026-09-03-part5.md`.*
*Parts 1–3 are the step TEMPLATE, written before the ceremony opened. Parts 4 and 5 are the AS-RUN, written at the final truing from the lead's own as-run notes; every stamp, id and count below is transcribed from those notes and nothing is derived. Where the notes are silent, the line says "not recorded".*

# FS-11 · Wave-G factory reset — AS RUN, steps 1 → 14

**Window:** the FS-11 ceremony opened ≈01:32 MYT 2026-09-04 (immediately after 裁-177 waived the
pre-reset dump) and step 14 closed at 03:10:11 MYT. The runtime quiesce window — the interval in
which every route on `app.clarabook.com` errored, recorded rather than covered by a maintenance
page (裁-157) — opened at the machine stop, **01:30:46 MYT**, and closed at the healthy restart,
**02:09:03 MYT** (≈38 minutes), with a second rolling restart at step 12 and a third at the
裁-179 TLS re-import.

**Actors.** Steps 2/2b are WAIVED (裁-177). Steps 4, 5, 6, 7, 8, 10, 14, 15 and 16's instrument
half were run by the LEAD as the owner's delegate through the real audited doors (裁-162, the
FS-11-scoped supersession of `docs/ops/DR.md`'s owner-run classifier; the authority is DATA-scoped
and expires at beta live). Steps 4b, 11, 12, 13 and every dashboard act were the OWNER's. Every
DSN was piped through `scripts/ops/dsn-pipe.mjs` against a throwaway `clara-backup` sleeper
machine; no DSN, password or token is written anywhere in this record.

---

## Pre-reads — 01:29:02, sleeper `fs11-sleeper` (machine `6834e7da567358`)

| read | result |
|---|---|
| P-8 non-terminal `workflow.workflow_runs` | **0** — the cancelled "Do" onboarding had ended terminal |
| P-9 `clara_runtime_login` sessions | 11, all idle |
| 3b.1 applied frontier | **148 / `0153_f_t1_sst_reference_tables`** |
| 3b.2 evaluator roster | **8 rows, SEVEN `deployed=true`** — `assess_metric_cell_independent` v1 · `evaluate_fs_pack_agent` v1 · `evaluate_metric` v1 · `evaluate_metric` v2 · `evaluate_witness_fact_state` v1 · `evaluate_witness_fact_state` v2 · `evaluate_witness_identity` v1; `prepayment_schedule` v1 = false → **step 8 is exactly SEVEN deploy acts**, not nine and not eight (the launch-prep's carried contradiction 1 is settled here, by measurement) |
| 3b.3 (by status; the file's `resolved_at` column does not exist — re-taken by `status`) | `agent_interruptions`: answered 7 · cancelled 2 · expired 4. `agent_tasks`: held 111 · completed 98 · failed 20 · cancelled 12 · expired 4 |
| 3b.4 firms | **4** — Alara Advisory Sdn Bhd · BELCORT `cde5917c-7861-4a2d-95e3-91d8a7230053` · Borneo Books & Co · ROME PUBLIC ADVISORY SDN. BHD.; **all `is_operator = f`** (the G1 flag was never set on live). Clients **9** — BEE CREATIVE SOLUTION `9e957c0f…` · Do `991e7844…` (the archived test client) · Fictional Test Services · Highland Coffee · Meridian Logistics · ROME PROPERTIES `e2b0f365…` · ROME SECRETARY `e054b797…` · Sunrise Retail · TESTING 123. **The constraint-13 fixtures are CLIENTS under the four firms, not firms** |
| 3b.5 signature | `trial_balance_as_of(p_client uuid, p_as_of date)` |
| 15.4-pre | `report_artifacts` = **0** |
| step-4 pre-read | schema `clara` PRESENT |
| constraint-15 schemas on live | `graphile_worker` · `workflow` · `workflow_drizzle` — **no `spike` schema exists on this project** (3 of the 4 named in constraint 15; recorded, not assumed) |
| 4b BEFORE | `auth.users` = **3** · `storage.objects` = **156**, all in `firm-docs` (the only bucket, private) |
| heartbeats | control · reconciler · world all alive (< 8 s) |

Three `\echo` lines carrying apostrophes tripped psql's quoting (cosmetic, no read lost).

---

## Step 1 · the destructive target, named from the refusal's own text

`postgres.bzecqklouchkmdmdxlln@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` — read back
from `reset.mjs`'s own refusal message; no password anywhere in the transcript. Later commands read
the target from a local file outside the repo because the no-secrets hook (correctly) refuses a
`user@host:port/db` shape on a command line.

## Steps 2 / 2b · WAIVED by 裁-177

No pre-reset dump, no restore-proof. The throwaway PG17 `fs11_restore_pg17_1044322` (started in WSL
docker on 127.0.0.1:55432 at the FS-11 pre-reads) was **torn down unused**. Recorded as WAIVED, not
skipped: the owner's ground is that everything in `clara` is test data (constraint 14), and the
dissent — that the old database then survives only in the encrypted nightly R2 bundle whose
decryptability is unproven since 2026-07-22 — is filed on 裁-177 and carried as a Known-issues row.

## Step 3 · quiesce — 01:30:43 → 01:32:31

`fly machine stop 48ee715b763048` → stopped **17:30:46Z**; checks 2 warning (expected for a stopped
machine). After 100 s: heartbeats control 106 s · reconciler 106 s · world 109 s — all past the 90 s
floor. Non-idle `clara_%` sessions **0** (in fact no `clara_%` sessions at all: the 11 idle ones went
with the machine, leaving no corpses to wait on). **3b.5, the standing RS books pin, read one last
time before the drop: `trial_balance_as_of(ROME SECRETARY, current_date)` = DR 3,396,500 / CR
3,396,500 across 7 rows — the checklist's figure reproduced exactly.**

## Step 4 · the reset — 01:32:53 (attempt 1, FAILED) → 01:35:45 (staged, DONE)

**Attempt 1 failed: `reset: FAIL — out of shared memory`.** A single-transaction `DROP SCHEMA clara
CASCADE` over the whole estate exhausted Postgres's lock table. Settings read immediately after:
`max_locks_per_transaction` 64 × `max_connections` 60 ≈ 3,840 lock slots, against a schema holding
**243 tables · 704 indexes · 23 views · 8 sequences · 1 composite type · 1,013 functions · 267 types
· 537 policies · 608 triggers**. `clara` was still PRESENT and the 4b counts were unchanged, so
nothing was half-dropped.

**The fix was a STAGED drop, one statement per transaction** via psql `\gexec` (views → tables
cascade → functions → sequences → types), strictly inside `clara` — constraint 15 held by
construction, because no other namespace is named anywhere in the script.

Result, 01:34:44 → 01:35:45: **DROP VIEW 23 · DROP TABLE 243 · DROP FUNCTION 1,010 (+3 by cascade) ·
DROP TYPE 1**, sequences with their tables, **zero errors** → `clara` relations 0 / functions 0 /
types 0. `reset.mjs` then dropped the near-empty schema through its own `pg_depend` preflight:
`reset: dropped schema "clara"`. Read-back: `to_regnamespace('clara') is null` = **t**;
`graphile_worker` · `workflow` · `workflow_drizzle` all PRESENT; `workflow.workflow_runs` **2,455
rows survive**.

**裁-160's line, written here at step 4 as the ruling requires:** the parked S4-V2 canary's
clara-side rows (`clara.agent_interruptions` and `clara.agent_tasks`, the ids hard-coded at
`packages/db/scripts/dr-verify-checks.mjs:398-399` and `:414-415`) went with the schema. Accepted by
裁-160. The `workflow.workflow_runs` row survives under constraint 15 as an orphaned durable run.
**Constraint 11 is untouched — nothing was answered, nothing was approved, and no preserve attempt
was made.** The DR STRICT `4.9` parity probe therefore loses its subject; the replacement is named
in part 5 under 裁-172.

## Step 4b · the purges (OWNER, dashboard) — read back 01:36:54

`auth.users` = **0** · `storage.objects` = **0** · bucket `firm-docs` present (`public = f`) ·
storage policies = **6, untouched**. 裁-161 discharged on both halves, with the bucket and its
policies deliberately left alone (mechanisms under test). DR probe `4.10`'s baseline is now zero
rather than an orphan count.

## Step 5 · migrate — three runs, DONE 01:58:53

**Attempt 1 (01:37:03)** was killed by the tool's 10-minute ceiling at migration **68 /
`0069_wave_e_epsilon_reporting_security`** (≈9 s per migration over the pooler from Windows; the
chained 5–6–7 command was too long for one call — the lead's own error). Each migration is its own
transaction, so at most the in-flight one was lost and it rolled back; `pg_stat_activity` showed no
migrator session and no `migrate.mjs` process remained.

**Attempt 2 (01:47:48 → 01:55:30)** applied through `0153` and then **FAILED at
`0154_binding_proposal_pr_1`**. Its tail (`:3788-3790`) raises CLR10 when
`count(*) from pg_roles where rolname like 'clara%'` is not exactly **14**; the live cluster holds
**15** — the 14 the migration chain mints by `0154` plus **`clara_storage_docs`**, which is minted
only by the deploy scripts (`roles-bootstrap.sql`, `storage-provision.sql`) and by no migration.
This is the same multi-chain-one-cluster class the CI sweep met (#525 derived the CI roster from
`roles-bootstrap.sql`); on a LIVE cluster the roles outlive `DROP SCHEMA`. Only `0154` carries such
an absolute census in the `0150`–`0164` span. The ledger stayed at 148 / `0153` (the failed
migration rolled back whole).

**The workaround touched no mechanism:** `alter role clara_storage_docs rename to
zz_fs11_storage_docs` (the OID is kept, and Storage's policies reference the OID, not the name),
apply the chain, rename back, verify OID + policies + ledger.

**Attempt 3 (DONE 01:58:53):** rename (OID **19697**; `clara%` count 14) → `migrate: 11 new
migration(s) applied · 159 total` (`0154`…`0164`) → rename back (OID 19697 = `clara_storage_docs`).
`clara%` roles now **19** (the 14 + the four minted by `0160`/`0163` + `clara_storage_docs`); the
six storage policies still reference the role's OID; **`schema_migrations` = 159 /
`0164_checkout_gate_c6_web_reads`**.

*Runbook truing owed (T-L's sibling): "a re-migration on a cluster carrying deploy-minted `clara%`
roles must rename them past `0154`'s absolute census" belongs in `docs/ops/DR.md` and the ceremony
practices. The migration-authoring law that would have prevented it — roster MAPS, never counts —
postdates `0154`.*

## Step 6 · the ACL baseline — 01:59:15 → 01:59:19

`ACL baseline verify: OK`. The 19-role roster read back: **14 confined roles** at
`usage_public = f / temp_db = f`; the preservation control `clara_runtime` t/t (as are
`clara_authenticated`, `clara_fn_owner`, `clara_runtime_login`, `clara_storage_docs`);
**`clara_auth_wall` holds NO public USAGE → security-pass line 5 TICKED** (裁-153).

## Step 7 · seed — 01:59:21 → 01:59:38

`seed: 2 seed file(s) applied` (`0001_smoke_seed`, `0002_core_seed`). Firms = **2** (Alara Advisory
Sdn Bhd, Borneo Books & Co); the sentinel user present (1); clients = **3**.

## Step 8 · the evaluator deploys — 02:00:11 → 02:00:47

The **seven** acts named by pre-read 3b.2, run under the bare principal, each printing the script's
own `verify_evaluator_freeze — registered 8, deployed N`. Post-read: the same seven `deployed = t`,
`prepayment_schedule` v1 still `f`, and `verify_evaluator_freeze()` → `{"ok": true,
"verified_deployed": 7, "verified_registered": 8}`. **`--lock-deployed` was NOT run** — the manifest
already reads true and the as-run forbids a blanket stamp.

## Step 9 · the runtime back up — 02:00:51 (unhealthy) → 02:09:03 (healthy)

`fly machine start` at 18:00:54Z brought the machine up **unhealthy**: checks "1 passing, 1
critical", `/health` **503**, `/ready` empty, the C-5 confirm route 503.

**ROOT CAUSE (02:05–02:07), read from the logs and `pg_authid`, not guessed:** the pooler's circuit
breaker — *"(ECIRCUITBREAKER) too many authentication failures, new connections are temporarily
blocked"* — on every consumer (control, world heartbeat, MATCHER, AUTODRAFT, LEADER, WAKE-ENGINE, …).
`pg_authid` showed **every `clara_%` role at `rolcanlogin = f`**: the full re-migration re-minted the
ceremonied login roles NOLOGIN (e.g. `0009_coding_floor.sql:55 alter role clara_wake_write_login
nologin`, and the create-role tails for the others) **while their PASSWORDS survived**
(`rolpassword is not null` for `clara_runtime_login`, `clara_agent_read_login`,
`clara_freeform_login`, `clara_wake_write_login`; `clara_wake_bank_login` was never ceremonied, so it
has no password and stays NOLOGIN by design). The Fly secrets still held the right passwords, so the
fix was LOGIN re-flips only — no secret moved.

The machine was stopped at 02:06:49 to let the breaker cool. **02:07:15 → 02:09:03:** `alter role …
login` ×4 (`clara_runtime_login`, `clara_agent_read_login`, `clara_freeform_login`,
`clara_wake_write_login` — every capability column f, passwords intact); restart at 18:07:41Z →
**checks 2/2 passing, `/health` 200, `/ready` 200 `ready: true`**: db ok · world ok (age 5.8 s) ·
control ok · taxonomy ok · relay ok (**`held_outbox` 0** — the 119 held rows went with the schema;
pending_intents 0; dead letters 0) · matcher / autodraft / wakeEngine / sstWatch / factsGate ok,
firmsTracked 2 (the two seed firms) · localFacts / classify ok · wikiProjection ok (lag 71,
firmsTracked 0, warming) · intake spool ok (0 / 512 MiB) · scanner clamd ok. The C-5 routes stayed
503 until step 12, as designed.

**RECORD DEFECT (truing line T-L):** the FS-11 template lists `read-logins-ceremony.sql` /
`write-login-ceremony.sql` only for a throwaway drill. **A LIVE re-migration also flips the
ceremonied roles back to NOLOGIN**, so a "re-enable LOGIN on the ceremonied roles" step belongs
immediately after MIGRATE in `docs/ops/wave-g-setup-checklist.md` and `docs/ops/DR.md`.

## Step 10 · the Stripe object map — 02:03:59

`set role clara_fn_owner` → `INSERT 0 2` → read back: price `price_1UB5DZHD90w0k86XNfkgYPWq` ·
product `prod_VBS7ZUaIFPedCs` for `clara-beta-2026` (sandbox). This is the OPS act 裁-126 requires;
C-5 only reads the map.

*Owner finding at the same hour, recorded for the sitting:* the Stripe SANDBOX carries **TWO webhook
endpoints** on `https://clara-runtime.fly.dev/api/stripe/webhook` — #1 API version
`2026-08-26.dahlia`, payload **snapshot**, 233 events; #2 with no API version, payload **thin**, 24
events. The C-2 handler verifies and reads snapshot event objects (`stripeRoutes.ts`), so **#1 is
the endpoint** and its signing secret is step 12's `STRIPE_WEBHOOK_SECRET`. **#2 should be deleted**
— a duplicate endpoint double-delivers (the op_key idempotency absorbs it, but it is noise and a
second secret nobody holds).

## Step 12 · the runtime secrets (OWNER) — 02:16:51, then re-run at 02:18 and 02:38

`fly secrets import` of the **nine** names in ONE release; the machine rolled (stopped → started →
healthy 2/2). `fly secrets list` showed all nine Deployed with digests:
`CLARA_AUTH_WALL_DATABASE_URL b4e97d00…` · `CLARA_AUTH_WALL_SERVICE_TOKEN 0eaa9ed1…` ·
`CLARA_RATE_WALL_PEPPER d5bc3fda…` · `CLARA_STRIPE_LIVEMODE 4c0aa095…` ·
`CLARA_STRIPE_WEBHOOK_DATABASE_URL 268394e4…` · `CLARA_SUPABASE_ANON_KEY 874ddeb2…` ·
`CLARA_SUPABASE_URL 3a125252…` · `CLARA_TRUSTED_CLIENT_IP_HEADER 005798d6…` ·
`STRIPE_WEBHOOK_SECRET 1722b584…`. Total secret names on the machine afterwards: **28** (19 + 9).

**裁-152's hash compare.** The script printed `sha256(CLARA_RATE_WALL_PEPPER) =
2eb757a8d728ab11668d10a74c0e4431e3fcb2c6e71083578be0462ca97ff812` and
`sha256(CLARA_AUTH_WALL_SERVICE_TOKEN) =
bd1aec1e3c404b1e6a3fa95a7d030197a7793fcc39515258bca63216dc64fe72` for the bytes sent to Fly. **The
clara-web side is not readable back**, so the two-operand comparison the ruling anticipated could not
run as written: the owner pasted the same password-manager values at FS-10 S8 and here, and the
FUNCTIONAL equality proof is step 13's confirmation answering through the C-5 route. Recorded as
such — digests on the record, the functional proof at step 13. **The pepper and the auth-wall service
token were minted by the owner at FS-10 S8 on 2026-09-03 ≈22:38 MYT; FS-11 step 12 reused those bytes
verbatim (裁-152's minting sentence).**

## Step 11 · the two login roles (OWNER) — three attempts, DONE 02:30:37

**02:18:21 read: STEP 11 HAD NOT BEEN RUN** — `clara_stripe_webhook_login` and
`clara_auth_wall_login` were `rolcanlogin = f` with `rolpassword` NULL, while the Fly DSNs from step
12 already carried passwords no role held. Memberships were correct (each `_login` in its group).
The runtime after the release: `/health` 200, `ready: true`; **the C-5 confirm route answered 401 to
an empty POST — no longer 503 — so the service token was set and the wall was UP**; the Stripe
webhook route answered 400 to an unsigned empty POST (correct).

**INCIDENT 02:14 (step 11 v1) — TWO ROLE PASSWORDS WERE ECHOED TO THE TERMINAL AND INTO THE SESSION
TRANSCRIPT.** Cause: the lead's v1 script put `\set ON_ERROR_STOP on` INSIDE the `-c` string; psql
parsed the whole payload as that meta-command's argument, refused ("Boolean expected") and **echoed
the argument** — with `:'pw1'`/`:'pw2'` already interpolated. The ALTERs never executed (the roles
were still NOLOGIN with no password at 02:18), so **nothing on the database ever carried the leaked
bytes**; the two Fly DSNs imported at step 12 DID.

**裁-178 (owner, ≈02:2x, verbatim 「不用rotate le, I DONT CARE」): the two leaked role passwords are NOT
rotated.** Step 11 v2 sets the same values step 12 already put in the Fly DSNs; the planned step 12b
re-import was withdrawn and its script deleted. **The lead's dissent is on the record and is carried
as a Known-issues row:** the values sit in this session's chat transcript and log, and both should be
rotated before the first REAL client's data lands — the owner's call on timing.

**Two more shape failures before it worked.** v2 (02:26) failed with `syntax error at or near ":"` —
psql does not interpolate `:'var'` inside `-c` strings, only in `-f` files and stdin. v3
(`fs11-step11.sql` + `-f`, no secret in the file) was **dry-run through the real pipe with a dummy
value at 02:28** (`interpolated = t`, `current_user` postgres, `login_roles_now` 0) before the owner
typed anything.

**DONE 02:30:37 (v3, owner):** four `ALTER ROLE`; `pg_authid` → `clara_auth_wall_login` and
`clara_stripe_webhook_login` both `rolcanlogin t · has_pw t`, with rolsuper / bypassrls / createdb /
createrole / replication all f; the two PARENT roles stay `rolcanlogin f` with no password;
membership confirmed (each `_login` a member of its parent, 2 rows). **Security-pass line 4 TICKED.**

*Lesson minted here: a secret-prompt script is DRY-RUN against its own ERROR path, through the real
pipe, with a dummy value, before an owner types a real one — psql echoes interpolated statements on
error, and `\`-commands never belong inside `-c`.*

## The 裁-179 TLS finding — 02:31 → 02:39

**(1)** The C-5 applier belt logged `self-signed certificate in certificate chain` every ~2 s from
step 12 onward: the two new DSNs carried `?sslmode=require`, which `pg-connection-string` 2.14 in
non-libpq mode treats as *verify against Node's bundled roots* — and the pooler chain roots in
"Supabase Root 2021 CA", which is not in that store. Every C-5 pool connection failed; the webhook
and auth-wall lanes were dead until fixed.

**(2) MEASURED on the machine** (a `pg` Client probe printing only the stream class): the FOUR
existing lanes — `CLARA_READ/RUNTIME/WRITE/FREEFORM_DATABASE_URL` — carried **no `sslmode` at all**
and connected over a plain `Socket`, `encrypted = false`. **Production credentials and data were
crossing Fly (sin) → AWS (ap-southeast-1) in PLAINTEXT.** The as-run's instruction to "match the
existing TLS posture" would have matched plaintext; "never no-verify" had been written on the
assumption that the posture was verified. The image ships no CA (`/app/ops/tls` absent), so
`verify-full` needs a Dockerfile COPY — a code PR.

Options put to the owner: (a) the verify-full PR now (≈45–60 min); (b) two lanes only; (c) an
env-to-env re-import of all six tonight with `uselibpqcompat=true&sslmode=require` (encrypted, cert
unverified), verify-full right after beta.

**裁-179 (owner, 02:37): (c).** Executed 02:38 — `fs11-tls-reimport.mjs` rewrote all SIX lane DSNs
env-to-env (query `?uselibpqcompat=true&sslmode=require`; the four had no query, the two had
`?sslmode=require`), one `fly secrets import` release, machine `48ee715b763048` rolled, healthy 2/2.
**Proof 02:39:** `/ready` true (db/relay ok, `held_outbox` 0, warnings []); the on-machine `pg` probe
read READ / RUNTIME / WRITE / STRIPE_WEBHOOK / AUTH_WALL all as `TLSSocket encrypted=true
authorized=false` (cert unverified, exactly as ruled), `current_user` correct per lane; the applier's
self-signed lines stopped after the 18:38Z restart.

**A SIXTH-LANE FINDING in the same probe: `CLARA_FREEFORM_DATABASE_URL` → "password authentication
failed for user clara_freeform_login".** The role was `rolcanlogin t · has_pw t`, so the Fly DSN's
password did not match the role's. **Cause settled by reading `0131:425-435`:** the re-run only does
`alter role … nologin nocreaterole inherit` and never touches a password — so the mismatch was
LATENT from the F-A6 ceremony (or a later out-of-band change) and had never surfaced, because the
lane is lazy and the boot assert checks env PRESENCE only. **Fixed 02:52:01** (owner, one hidden
entry setting role + secret together): `pg_authid` `clara_freeform_login t / has_pw t`, membership
`clara_freeform_ro` alone, secret re-imported (digest `dca244729695a19a`), machine rolled healthy
2/2, `/ready` true. The on-machine probe still failed at 02:52:30 and **passed at 02:54:32**
(`FREEFORM ok user=clara_freeform_login encrypted=true`) — **Supavisor caches a role's auth verifier
for ~1–2 minutes after an `ALTER ROLE … PASSWORD`**, and `pgbouncer.get_auth` is not callable by
`postgres`, so the cache can only be waited out. **All six lanes: TLS on, authenticated.**

*Two rows minted here (both in the handover): the verify-full Dockerfile PR (owner, 裁-179) as the
first post-beta code item; and a `/ready`-or-boot PROBE per lane DSN (`select 1` per pool) so a
mismatched credential surfaces at boot instead of at first use.*

## Step 13 · BELCORT re-minted through the product's own door — 02:55 → 03:07:27

Walked in the browser by the OWNER (the form takes a password; the lead never enters one), with the
lead's bridge reads as the instrument.

- **02:55 pre-look:** `/signup` renders Email + Password + "Create account" + a sign-in link. One
  console error: `/favicon.ico` **404** (no favicon shipped — cosmetic Known issue).
- **02:56 signup.** The post-signup page is the "exists-unconfirmed" variant — *"Your account exists,
  but it isn't active until you confirm it · We've sent you a six-digit code. Enter it on the next
  screen…"* — **with no control to that next screen**; the lead navigated the tab to `/auth/confirm`.
  (The same defect was seen at FS-10 S21; `signup-account-form.tsx` links only `/login` at `:265`
  and `:325`.) **DEVIATION, recorded not decided:** the confirm page prefilled `tools@belcort.com` —
  the owner signed up with the OPERATOR address, not the non-team private Gmail the plan named.
  Custom SMTP (Resend) is on, so delivery still rode the Resend path; **whether that, plus the
  private-Gmail code that arrived at FS-10 S21, satisfies 裁-146 point 3's "non-team address"
  condition is the OWNER's call, taken at the sitting.**
- **02:56 → 02:58 the code and the confirm.** `auth.users` `tools@belcort.com` created
  **18:56:25.153Z**, confirmation sent **18:56:25.199Z**, `email_confirmed_at` **18:58:10.340Z**
  (sent → verified 1 m 45 s, the owner reading the code from the inbox in between).
  `clara.confirmation_attempts` **ONE row, outcome `accepted`**, attempted 18:58:10.227Z, settled
  18:58:10.394Z — **167 ms through the folded door, and the C-5 route answered where it had answered
  503: security-pass line 3's functional half PROVEN (裁-152's pepper and token are live and
  agreeing).**
- **02:59 "Register my firm" → `/pending`.** `firm_registration_requests` ONE row
  `c17fee1e-fef3-4e83-8b0d-b076476d067b`, applicant `4648ac2a-7947-42ad-bf40-24ed8ac30564`, firm_name
  BELCORT, status **open**, op_key `76fe57bd-c718-4fa0-ba35-256c3cd4b3b6`, firm_id null,
  18:59:44.140Z; `dpa_signatures` **0**.
- **03:01 the DPA page.** *"One more thing before checkout … [This is Clara's beta data-processing
  agreement, pending review by the owner's lawyer before launch.] · Clara's beta terms of service is
  a separate document and is not covered by this signature…"* Verified against the tree: the live
  `dpa_documents` row IS v1 as law — `clara-beta-2026-08-a`, **99 bytes**, sha `6d1c97a5…7b3` = the
  sha stated in `docs/ops/legal/clara-beta-dpa.md` §2, `source_path` naming that file, effective_from
  2026-08-31 00:00+08. **The byte-identity law (裁-90) HOLDS.** The real bilingual v2 body is
  "proposed" and swaps with the lawyer at launch (§3) — **a Backlog row, before the first EXTERNAL
  applicant**, not a defect tonight: BELCORT signs v1.
- **03:03 signed, and the intent opened.** `dpa_signatures` ONE row
  `8bf8364c-33f1-4ed6-b47f-510ec97de27f`, user `4648ac2a…`, version `clara-beta-2026-08-a`, signed
  **19:03:28.732Z** (security-pass line 7's DPA half met in the FIELD, not only on the tree).
  `checkout_intents` ONE row `d827718e-ee95-496a-95a0-094eb78d8963`, registration `c17fee1e…`,
  `price_local_key` `clara-beta-2026`, session `cs_test_a17omeNI35Oczqya…`, opened **19:03:36.088Z**
  — **`open_checkout_intent` did NOT raise CLR10, so step 10's `stripe_object_map` binding is
  PROVEN.**
- **The Stripe Checkout page** (sandbox): *"BELCORT 沙盒 · Sandbox · Subscribe to Clara Beta · MYR 0.00
  per month · Start for free · Email [EMPTY] · Subscribe…"*. **What the MYR 0 session collects is an
  EMAIL only — no card** (`payment_method_collection: if_required`; the 裁-148 posture). Two findings
  for the sitting: **(i)** `customer_email` is not passed into the session, so the applicant retypes
  their address and a typo births a Stripe customer under a different email (a runtime Backlog row);
  **(ii)** the Stripe PRODUCT description reads *"ClaraBook beta plan — paid beta at the ruled trial
  price (裁-57/58); amounts not yet ruled."* — **internal ruling numbers on a customer-facing page**
  (a Stripe dashboard copy fix, owner, before the first external applicant).
- **03:05 Subscribe → "Your payment went through".** `firm_registration_payments` ONE row
  `fdb776c0-1c4a-449e-bc8e-a59e58a94fba` (registration `c17fee1e…`, event
  `evt_1UBfwbHD90w0k86X72Dqh1XW`, session `cs_test_a17om…`, customer `cus_VC44laOmGi3MkK`,
  subscription `sub_1UBfwaHD90w0k86XJpwZVqiA`, recorded **19:05:06.002Z**, `consumed_*` null). The
  applied row: `stripe_events` `evt_1UBfwbHD90w0k86X72Dqh1XW` · `checkout.session.completed` ·
  livemode **f** · amount_total **0 myr** · payment_status paid · mode subscription · session_status
  complete · received 19:05:05.972Z. **Envelope census: 8 event types × 1** — checkout.session.completed,
  customer.created, customer.updated, customer.subscription.created, invoice.created,
  invoice.finalized, invoice.paid, invoice.payment_succeeded — each logged "UNRECOGNISED … recorded
  as envelope only, applied by nothing", the designed posture. **Stripe's own delivery log (owner's
  screenshot): all EIGHT events `200 OK` at 19:05:06 UTC, body `{"received": true, …}`, API
  2026-08-26.dahlia — the 2xx is PROVEN.**
- **STEP 13 CLOSED 03:07:27 — BELCORT IS BORN.** "Open my firm" → Firm home. Reads at 03:08:50:
  `clara.firms` **`04daf86c-3aaf-4c59-9442-cce93f3582af` · BELCORT · `is_operator` f ·
  19:07:27.385Z**; `firm_registration_payments` `fdb776c0…` consumed 19:07:27.385Z →
  `consumed_firm_id` `04daf86c…`, `consumed_dpa_signature` `8bf8364c…`;
  `firm_registration_requests` `c17fee1e…` **approved**, firm_id `04daf86c…`, decided 19:07:27.385Z,
  `decided_by` **null** (the self-serve door, no operator — 裁-159 route (a) walked as ruled);
  `firm_memberships` `86c6e996-716a-4d67-a454-df6e106cdc6d` · firm `04daf86c…` · user `4648ac2a…` ·
  **owner · active**. **Security-pass line 7's walk half TICKED; line 3 TICKED (functional).**

## Step 14 · `is_operator` — 03:10:11

Preconditions read first (all five, 03:09): P1 `is_operator` column count 1 · P2
`0133_g1_wake_engine` exactly one `schema_migrations` row · P3 **zero** firms flagged · P4 BELCORT
exactly one row (`04daf86c-3aaf-4c59-9442-cce93f3582af`, 19:07:27Z) · P5 the canary **by shape** —
`agent_interruptions` 0 rows, `agent_tasks` 0 rows (their clara-side rows died at step 4 under
裁-160; never answered; the workflow-side run row untouched under constraint 15). Pre-image:
`uq_firms_one_operator … USING btree ((true)) WHERE is_operator` (partial).

`set role clara_fn_owner; update clara.firms set is_operator = true where id =
'04daf86c-3aaf-4c59-9442-cce93f3582af'` → **UPDATE 1**. Reads: the one flagged row = `04daf86c…`
BELCORT **t**; `uq_firms_one_operator` still the same partial index (re-derived from the catalog);
`count(*) where is_operator` = **1**. **No audit_log row by design — this as-run is the record**
(裁-121③ · 裁-159).

*(The preconditions file's P5 shape had used a `resolved_at` column that does not exist on
`agent_interruptions` — the columns are `status` / `answered_at`. Corrected by reading the catalog,
not by guessing.)*

---

*Steps 15 → 19, the product walk under 裁-180…184, and the ceremony's verdicts continue in
`fs11-wave-g-asrun-2026-09-03-part5.md`.*
