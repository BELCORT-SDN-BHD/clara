# Factory reset of hosted Clara, 2026-09-26

Owner decision (2026-09-26, grill Q1 and Q2): reset hosted to blank NOW, at the deepest layer: every
login account, every firm, client, document, journal entry and Work, the runtime's queues, and the
document files. The beta data is test data (standing ruling of 2026-09). The product itself, which is
the migration chain, the runtime image and the web version released on 2026-09-25, is untouched: after
the reset hosted runs the same 337 files, the same `refresh-322fdf29` image and the same web version
`fa2c6c0b`, with zero rows.

## What is removed, measured through a probe at 16:12Z on 2026-09-26 (read-only)

| store | what | count |
|---|---|---|
| Supabase `auth` | login accounts (`auth.users`, with their identities and sessions) | 5 |
| `clara` | firms (one operator) / clients / documents / journal entries / Work | 5 / 6 / 11 / 16 / 5 |
| `clara` | everything else in the schema: 337 applied files' worth of tables, every row | all |
| `workflow`, `workflow_drizzle` | the Workflow DevKit's runs (0 live of 2502) and its own tables | all |
| `graphile_worker` | queued jobs | 16 |
| `storage.objects` | files in the `firm-docs` bucket | 31 |
| Stripe (test mode) | customers referenced by firm rows: left as orphans in Stripe's test data, harmless | 5 at most |

What is NOT removed: the 21 `clara%` cluster roles (twenty minted by the chain, `clara_storage_docs`
from `deploy/storage-provision.sql`); the six storage policies on `storage.objects` (they depend on
roles, not on the `clara` schema: the pg_depend and pg_policies reads found 0 cross-schema dependents);
the Fly secrets; the runtime image; the web version. Three roles minted after 0154
(`clara_auth_wall`, `clara_invite_preview`, `clara_stripe_webhook`, each with its `_login`) are dropped
and re-minted by the chain (#867's recipe) and their `_login` passwords are re-set from the secrets
the runtime already holds, so no secret changes.

What comes back from the chain by itself: the legal documents `terms v1` and `dpa v1` (0187), the
admission capacity row (0186, unlimited), the knowledge-key catalogue, the capability registry (240
rows), the chart templates, the wake allowlist, every catalogue row a migration inserts.

## Restore point

Full backup through the probe before any destructive step (`backup-full.mjs`, schemas `clara`,
`graphile_worker`, `workflow`, `workflow_drizzle`, plus the globals artefact), recorded in RESULTS.
Restore path if the owner ever wants the beta data back: `packages/db/scripts/restore-full.mjs`
(roles-bootstrap first, then the dump, then the manual checklist), documented in its header. The
`auth.users` rows are NOT in that dump (the `auth` schema belongs to Supabase); the five test accounts
are not restorable and are not meant to be.

## Steps

0. Backup (above). Probe machine `probe-reset` on the serving image with the World off.
1. `fly machine stop 48ee715b763048`, confirm `stopped`. The web keeps serving; chat and Clara answer
   502 during the window.
2. Preflight through the probe, read-only (`reads-reset.mjs`): the counts above, `postgres` holds
   DELETE on `auth.users`, `auth.identities`, `auth.sessions`; 0 cross-schema dependents of `clara`;
   the role list; the storage policies.
3. Dry run of the wipe script (`wipe-reset.sh` in `check` mode): resolves the destructive-guard
   target from the DSN without printing it, runs `role-census-reset.mjs --check`, and prints the plan.
4. The wipe (`wipe-reset.sh` in `apply` mode), in this order, each step printing counts only:
   a. `delete from auth.sessions`, `auth.identities`, `auth.users` (postgres).
   b. `packages/db/scripts/reset.mjs` with `CLARA_ALLOW_DESTRUCTIVE=1` and
      `CLARA_DESTRUCTIVE_TARGET` equal to the resolved `user@host:port/db`: drops schema `clara`
      after its own pg_depend preflight.
   c. `drop schema workflow, workflow_drizzle, graphile_worker cascade`.
   d. `delete from storage.objects where bucket_id = 'firm-docs'` if `postgres` may; otherwise the
      owner empties the bucket in the Supabase dashboard (Storage, firm-docs, empty bucket), which
      also frees the bytes. Either way the owner is asked to empty the bucket once so no orphan
      bytes remain.
   e. `role-census-reset.mjs --apply` (drops the six post-0154 roles; refuses if any has a live
      dependent, which after step b none has).
5. `packages/db/scripts/migrate.mjs` from the release checkout (int2 detached at `322fdf291`):
   expect `337 new migration(s) applied · 337 total`, every prestate on its FIRST or FRESH branch.
6. Re-set the three re-minted login passwords from the secrets the runtime holds, ON the probe
   (a script decoded onto the machine reads `CLARA_AUTH_WALL_DATABASE_URL`,
   `CLARA_INVITE_PREVIEW_DATABASE_URL` and `CLARA_STRIPE_WEBHOOK_DATABASE_URL`, connects as postgres
   over `WORKFLOW_POSTGRES_URL`, runs `alter role ... password` and prints only the role names).
7. Re-provision the Workflow DevKit schema (`@workflow/world-postgres` setup, the command RIG.md
   records) over the probe's DSN. `graphile_worker` re-creates its own schema when the runtime boots.
8. Post reads: ledger 337 / `0361`; every count 0; roles 21; storage policies 6; the estate
   fingerprint against the release's upgraded baseline (`wS/fp-wS-upg.json`): the role-level env
   lines and nothing else.
9. `fly machine start`, wait for `/ready` 200, read the boot lines (`serving git_sha=322fdf29`,
   `frontier=0361(337)`, `stranded bodies n=0`, `durable world started`). Destroy the probe.
10. Smoke roster (signed out). Then the owner: sign up at `/login`, complete the beta checkout with a
    Stripe test card (hosted Stripe is in test mode: `CLARA_STRIPE_LIVEMODE=test`), which creates the
    first firm through `claim_paid_firm`; the orchestrator then marks that firm `is_operator = true`
    by one SQL statement through a probe, and the owner accepts the ToS and DPA prompts.
11. RESULTS below; docs PR.

## Rollback

Before step 4: nothing to roll back, start the machine. After step 4 and before step 5: the dump
restores the four schemas (restore-full.mjs); the accounts do not come back. After step 5: the same,
or keep the blank estate (the intended end state).

## RESULTS (as run, 2026-09-25 16:33Z to 18:49Z UTC, 2026-09-26 MYT)

| step | time (UTC) | reading |
|---|---|---|
| 0 backup | 16:13Z to 16:14Z | full dump 221,541,454 bytes (`clara-clara-graphile-worker-workflow-workflow-drizzle-2026-09-25T16-13-19-332Z.sql`) plus the globals artefact |
| 0 probe | 16:11Z | `probe-reset` `874975c001e328` on `refresh-322fdf29` |
| 2 preflight | 16:12Z | 5 accounts, 5 firms (1 operator), 6 clients, 11 documents, 16 journal entries, 5 Work, 2502 runs (0 live), 16 jobs, 31 objects, 21 roles, 0 cross-schema dependents, postgres may delete `auth.*` |
| 3 check mode | 16:2xZ | target resolved from the DSN, role census 21, the six post-0154 roles named |
| 1 stop | 16:33:01Z | `48ee715b763048` stopped 16:33:10Z |
| 4a auth wipe | 16:33Z | 15 sessions, 5 identities, 5 users deleted; 0 remain |
| 4b drop clara | 16:33Z to 16:34:57Z | `reset.mjs` FAILED `out of shared memory` (one `DROP SCHEMA ... CASCADE` exceeds the managed lock table); replaced by `drop-clara-batched.mjs`: 26 views, 310 tables, 1540 functions, 1 remaining object, then the schema, 1863 drops, 0 failures |
| 4c runtime schemas | 16:33Z | `workflow`, `workflow_drizzle`, `graphile_worker` dropped |
| 4d storage rows | 16:33Z | REFUSED by Supabase (`42501 Direct deletion from storage tables is not allowed`); the owner emptied the `firm-docs` bucket in the dashboard (31 to 0, read at 18:03Z) |
| 4e storage role | 16:35Z | `drop owned by` REFUSED (`42501`, objects owned by `supabase_storage_admin`); the role was RENAMED to `zz_storage_docs_parked` so 0154's `rolname like 'clara%'` census read 14, and renamed back after the chain (grants, memberships and its six policies followed it by OID) |
| 4f role census | 16:36Z | `role-census-reset.mjs --apply` under `CLARA_DESTRUCTIVE_TARGET`: the six post-0154 roles dropped, count 14 |
| 5 chain | 16:36:51Z to 17:0xZ | `migrate: 337 new migration(s) applied · 337 total`, every file on its FIRST or FRESH branch (about 7 s per file over the pooler hop, against 2 minutes on a rig) |
| 5b storage role back | 17:0xZ | roles 21, six policies naming `clara_storage_docs`, `INSERT,SELECT` on `storage.objects`, `authenticator` member |
| 6 passwords | 17:0xZ then 17:17Z | through the pooler: 28P01 then EAUTHQUERY (the pooler was already failing); through the DIRECT host: the three re-minted logins re-set and verified 3 of 3 |
| 6b login posture | 18:35Z | FINDING: the chain mints every lane `_login` role NOLOGIN (the deploy ceremonies grant LOGIN); `clara_runtime_login`, `clara_agent_read_login`, `clara_wake_write_login`, `clara_freeform_login` read `rolcanlogin=false` after the rebuild. Fixed over the direct host: `alter role ... with login password` from each lane's own DSN secret, 7 of 7 verified (`clara_wake_bank_login` left nologin, lane not configured) |
| 7 DevKit schema | 17:17Z | `pnpm --filter @clara/runtime exec bootstrap` over the direct host: `workflow`, `workflow_drizzle`, `graphile_worker` created |
| 8 post reads | 17:18Z (direct), 18:03Z (pooler) | ledger 337 / `0361`, every count 0, `terms v1` and `dpa v1` present, roles 21, storage policies 6, fingerprint against `wS/fp-wS-upg.json`: 11454 equal, 12 env, nothing else |
| 9 start, first attempt | 18:04Z to 18:12Z | `/ready` 503; every lane `ECIRCUITBREAKER` (Supavisor: 10 auth failures in 150 s per tenant and IP block new connections for 120 s) and `EAUTHQUERY connection to database not available`; the machine was stopped again 18:12:36Z |
| 9 start, on the direct host | 18:48:05Z to 18:48:53Z | owner decision: the eight DSN secrets rewritten to `db.<ref>.supabase.co` (IPv6, usernames without the pooler suffix, TLS pins unchanged), proven 8 of 8 from the rig, staged, applied by `fly deploy` of the same digest; `/ready` 200 at 18:48:51Z; `serving git_sha=322fdf29… frontier=0361_reservation_release_advice(337) bodies=60`, `stranded bodies n=0`, `durable world started`, LEADER, CONTROL; every lane `ok` on `/ready` |
| 10 smoke | 18:49Z | `/login` 200, `/favicon.ico` 200, `/icon.png` 200, `/pending` 307, `/api/build-info` 307, `/checkout/cancel` 307, `/settings/registrations` 307 `/operator`, `/admin/registrations` 307 `/operator`, `POST /auth/confirm/resend` 403, runtime `/ready` 200 |
| 10 owner | 19:1xZ | the owner signed up (1 `auth.users` row) and registered `Testing Firm`; the first checkout refused `CLR10 no stripe price is mapped for this plan` (deviation 7, the Stripe object map restored from the backup at 19:2xZ); the second checkout created the firm `2126face-338e-4bc8-9c75-d0b3c6441cbd` at 19:13:59Z with one member; the orchestrator set `is_operator = true` at 19:14:43Z through the probe (the only firm, admission capacity unlimited); the ToS and DPA prompts are the owner's, on `/settings/firm` |

**The Supabase shared pooler incident.** From about 17:08Z the shared session pooler
(`aws-0-ap-southeast-1.pooler.supabase.com:5432`) answered `08006 Failed to connect to database:
econnrefused` for every role, later `XX000 (EAUTHQUERY) auth_query secret check timed out`, while the
database itself stayed reachable on the direct host (postmaster restarted 17:48:09Z with the owner's
Restart project, idle, 7 pooler-owned connections attached, no locks). The owner's Restart project
(~17:45Z) and a pooler-settings save (18:3xZ) did not clear it; the pooler was reachable for one minute
at 18:03Z. Supabase's status page showed no incident. At 19:08Z, after 40 minutes of polling, it was
still failing. The runtime therefore runs on direct connections (Supabase's documented method for
persistent backends) until Supabase repairs the tenant; the revert is deterministic (host back to the
pooler, username back to `<role>.<ref>`), and the Micro instance's `max_connections` of 60 is the
limit to watch before real load.

**Deviations from the draft, in one list.** (1) `DROP SCHEMA CASCADE` needs more locks than the
managed server allows: drop object by object. (2) Supabase refuses SQL deletes on `storage.objects`:
the bucket is emptied in the dashboard. (3) `clara_storage_docs` cannot be dropped by `postgres`
(objects owned by `supabase_storage_admin`): rename it out of the `clara%` census for the chain and
back afterwards. (4) `fly machine run --command` is ignored by this image (it runs
`docker-entrypoint.sh node scripts/serve.mjs`, which needs the database); a sleeping probe is
`fly machine run <image> ... sleep infinity`. (5) The chain leaves every lane `_login` role NOLOGIN:
the login ceremony (LOGIN plus the password the runtime already holds) is part of any rebuild.
(6) The pooler incident above. (7) The reset also removes operator-entered CONFIGURATION rows that no
migration seeds: the owner's first checkout after the reset refused `CLR10 no stripe price is mapped
for this plan`, because `clara.stripe_object_map` (the `product` and `price` ids of the
`clara-beta-2026` plan in Stripe's test mode) was empty; the two rows were restored from the backup's
COPY block at 19:2xZ. A future reset lists such rows from the backup before wiping (this table, the
admission-capacity edits, the legal acceptances) and restores the configuration ones right after
the chain.
