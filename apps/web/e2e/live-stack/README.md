# apps/web/e2e/live-stack — the real-backend browser walk

FS-5's 裁-86 mandatory browser leg for `interview-walk.spec.ts` needs more than
`../serve-built.mjs`'s mocked Supabase (which has no DB or runtime behind it
at all — fine for the pre-auth entry-faces walk, insufficient here). This
directory is a real, from-scratch, throwaway stack: real Postgres, real WDK
runtime, real PostgREST, real fixtures, one shared JWT secret — everything
`interview-walk.spec.ts`'s env-gate (`CLARA_E2E_INTERVIEW_{COMPLETE,CANCEL,
RACE}_{CLIENT_ID,THREAD_ID}`) actually asks for, provisioned by
`run-live-walk.mjs`.

**Why this lives here and why it's worth building once:** FS-11's sixteen-step
Wave-G walk needs exactly this shape (real browser → real web app → real
runtime + Postgres → a real REST read path → real JWT fixtures). This ceremony
is written so that walk can lift it directly rather than re-deriving it.

## Files

- `run-live-walk.mjs` — the orchestrator. Bootstraps the WDK world, builds and
  boots the runtime in-process, starts a real PostgREST container, creates
  three fixtures (COMPLETE/CANCEL/RACE) via `packages/runtime/tests/rig.mjs`'s
  already-exported helpers, then runs Playwright with every env var those
  fixtures produced, then tears PostgREST down.
- `serve-live.mjs` — a file-disjoint sibling of `../serve-built.mjs` (same
  TLS/HTTPS-proxy shell). Two real differences: `/auth/v1/verify` mints a
  REAL HS256 JWT (via `jose`, matching the runtime's own `SUPABASE_JWT_SECRET`)
  instead of a placeholder signature, and `/rest/v1/*` proxies to the real
  PostgREST instance instead of an in-memory fake.
- `playwright.live.config.ts` — the live-stack variant of `../../
  playwright.config.ts`: `testMatch` runs `interview-walk.spec.ts` alone (the
  other two specs are written against the mock and must not run against a
  real backend); `webServer.command` boots `serve-live.mjs`.

## Running it

No connection string is ever written as a literal anywhere in this directory
(hard constraint 4) — `run-live-walk.mjs` REQUIRES a DSN as environment input
and refuses to start without it (see its own header). Build it from the same
PG* values you use to stand up the rig — never hand-write the combined form
into a file. It is deliberately left password-less in the DSN text itself
(the libpq/`pg` fallback convention this repo already uses elsewhere): export
`PGPASSWORD` alongside it and every consumer — `pnpm --filter @clara/db`,
the runtime, and PostgREST — picks it up.

1. Stand up a throwaway Postgres and migrate/seed it — the same local recipe
   `packages/runtime/tests/interview-e2e.mjs`'s own header documents. Export
   `PGHOST` (loopback), `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`
   (one of `clara_rt_test` / `clara_wave_b_ci` — `run-live-walk.mjs` refuses
   any other target), start `postgres:17` in Docker with those same values,
   then `CLARA_ALLOW_DESTRUCTIVE=1 pnpm --filter @clara/db migrate` and
   `...seed` against it.

2. Export `WORKFLOW_POSTGRES_URL`, assembled from the PG* values above at
   your shell (protocol `postgres:`, user, host, port, database — no
   password segment), then run:

   ```sh
   node apps/web/e2e/live-stack/run-live-walk.mjs
   ```

   This host's `docker` lives inside a WSL2 distro (Ubuntu), not on the
   Windows PATH — the script detects `win32` and routes every docker
   invocation through `wsl -d Ubuntu -- docker ...` automatically. PostgREST
   runs with `--network host`, so `WORKFLOW_POSTGRES_URL`'s own loopback
   address reaches the rig directly — no bridge network, no
   `host.docker.internal` gateway mapping, no second DSN. **This only works
   because the host's docker is genuine Linux-in-WSL2**, not Docker
   Desktop's Hyper-V VM; porting this ceremony to a host where that isn't
   true needs the bridge-network form back (publish the rig's port on
   `0.0.0.0` rather than `127.0.0.1`, and give PostgREST a DSN using
   `host.docker.internal:host-gateway` instead of the loopback host).

3. Tear the Postgres rig down when done (`run-live-walk.mjs` tears PostgREST
   and the runtime down itself, but owns no lifecycle over the Postgres
   container it was told about): `docker rm -f fs5-interview-rig` (or
   whatever name you started it under).

## The one caveat to carry into any reuse (FS-11 included)

**PostgREST here authenticates as the rig's own Postgres superuser**
(`WORKFLOW_POSTGRES_URL`'s own user), so its `SET ROLE <jwt role claim>`
needs no prior role-membership grant — this is **harness-grade, not
production-shape**. Production PostgREST connects as a narrow
`authenticator` role granted membership in exactly the roles it may switch
to, never as a superuser.

This does **not** invalidate the walk's evidence: every query still executes
*after* `SET ROLE`, under the target role's own RLS — the superuser only
changes who is *allowed* to make that switch, not what the switched-to role
can see. But **do not copy the superuser connection shape into anything
durable.** A more faithful future harness (or FS-11 itself, if it wants to
close this gap) should provision a real `authenticator` login the same way
`packages/db/deploy/roles-bootstrap.sql` provisions every other Clara role,
and grant it membership in `clara_authenticated` (and any other role a
fixture needs to impersonate) explicitly.

## What this does NOT cover

- The other two specs in `../` (`entry-faces-walk.spec.ts`,
  `signup-confirm-pending.spec.ts`) keep running against `../serve-built.mjs`
  unchanged — they are pre-auth flows the mock already covers faithfully.
- `sample_invoices` binary upload transport is exercised by
  `useUploadQueue.test.ts`'s own battery, not this walk (see
  `interview-walk.spec.ts`'s own header).
- CI wiring for this leg is FS-12's, not this file's — see `../README.md`'s
  own "Why the CI browser leg is not wired up yet" section, which applies here
  identically.
