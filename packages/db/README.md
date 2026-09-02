# @clara/db — data plane

Versioned migrations, seeds (synthetic only), the ephemeral test rig, and the
DR backup/restore tooling. The shared Postgres is Clara's single source of
truth (`docs/ARCHITECTURE.md` §3).

> **Scope.** Slice 1 landed the *pipeline* (migration `0001_smoke.sql` — a
> placeholder that only proves the runner works end-to-end). **Slice 2** (`0002`–
> `0004` + seed `0002_core_seed.sql`) lands the **governed DB core**: the six
> `clara_*` roles, identity/RBAC, forced RLS with role-pinned read policies, the
> two-lane audited writers (human vs. wake — the agent can never sign), the four
> structural invariants, the balance/immutability/append-only triggers, and
> money-as-cents. See `docs/plan/completed/rebuild-plan-history.md`.
>
> **Migration ledger — TRUED 2026-08-26 (counted, not remembered).** The repo carries **131
> migration files, `0001`–`0136`** (the sequence skips `0032`, which never existed, and the
> `0055`-era gaps), and **live is applied through the frontier `0136_fix_freeform_basis_types`**
> — matching `PROGRESS.md`'s posture line. *(Was: "97 migrations, `0001`–`0102`, frontier
> `0102_f_a2_statement_activation`, as of 2026-08-23" — stale by 34 files and 34 numbers.)* The
> paragraph below is the **2026-08-09 arrivals note**, kept as the record of that batch rather
> than rewritten:
>
> The most recent arrivals
> are the **F6–F9 batch** (ADR-066, applied 2026-08-08 23:24Z in ONE D1-quiesced ceremony):
> `0051_extraction_recovery_door.sql` (F6 — both failed populations get a lawful retry) ·
> `0052_customer_identity_facts.sql` (F7 — `invoice.contact_person` joins the CLR10
> allowlist) · `0053_autodraft_readmit_after_withdrawal.sql` (F8 — the five-conjunct
> re-admit arm) · `0054_region_ordinal.sql` (F9 — the stable `region_idx`). Before them:
> the §7-A pair `0046`/`0047` (ADR-063/064) and the post-close fix train `0048` (F5
> sweep-cap own-run) · `0049` (zero-evidence direction abstains; born
> `clara.migration_receipts`) · `0050_egress_release_skip_consent.sql` (F4).
>
> **This ledger is a snapshot and WILL go stale — verify before relying on it.**
> The authoritative reads are `select count(*), max(version) from clara.schema_migrations`
> against live, and `ls packages/db/migrations/` for the repo. Migration numbers are
> claimed at MERGE time (standing law), so the repo frontier can move without a deploy.
>
> **audit_log append-only — honesty boundary.** `clara.audit_log` is append-only,
> enforced by UPDATE/DELETE/TRUNCATE triggers so that no app role, agent, or even
> a SECURITY DEFINER bug can rewrite a receipt. This is defense in depth against
> *application-layer* tampering — **not** against a compromised database
> **superuser**, who can drop the trigger or the table and therefore sits outside
> the guarantee. That boundary belongs to the platform (Postgres role hardening,
> backups, DR), not to the schema.

## Layout

```
migrations/NNNN_name.sql   numeric-ordered, immutable once applied
seeds/NNNN_name.sql        SYNTHETIC data only, idempotent
lib/pg.mjs                 env-only connection helper (no DSN in code/argv)
scripts/migrate.mjs        runner: applies pending migrations in a tx each; records sha256
scripts/seed.mjs           runner: applies seeds
scripts/reset.mjs          drops ONLY the `clara` schema
scripts/backup.mjs         pg_dump -> timestamped plain-SQL file (default | --profile full)
scripts/restore.mjs        psql apply of a dump file
scripts/restore-full.mjs   full DR restore: roles-bootstrap -> restore -> ceremony checklist
scripts/dr-selftest.mjs    real dump+restore round-trip in a throwaway schema
scripts/dr-verify.mjs      full-profile restore verification battery (source<->target)
scripts/dr-verify-util.mjs · dr-verify-checks.mjs   the battery's helpers + §4 probes
deploy/roles-bootstrap.sql idempotent recreation of the 10 clara-custom roles (DR step 1; FRESH-TARGET-ONLY)
deploy/read-logins-ceremony.sql  runtime + read-pool LOGIN ceremony (post-restore; mirrors write-login)
deploy/acl-baseline.sql    HIGH-10 public-schema ACL baseline (ceremony; post-restore re-apply)
tests/pipeline.test.mjs    migrate -> seed -> assert (node --test)
```

## Connecting (no secrets in code)

Connection comes from the environment only. Either export libpq vars or a DSN:

```sh
# libpq vars (REQUIRED for backup/restore — pg_dump/psql don't read a DSN)
export PGHOST=... PGPORT=5432 PGUSER=... PGPASSWORD=... PGDATABASE=postgres
# or a DSN for the node scripts (Supabase SESSION pooler, port 5432)
export DATABASE_URL=...
```

See `.env.example`. `.env` is gitignored; never commit a credential.

## Commands

```sh
pnpm --filter @clara/db migrate    # apply pending migrations
pnpm --filter @clara/db seed       # load synthetic seed data
pnpm --filter @clara/db test       # migrate -> seed -> assert (needs a DB)
pnpm --filter @clara/db reset      # drop the clara schema (scoped, safe)
pnpm --filter @clara/db backup     # pg_dump the clara schema (default profile)
pnpm --filter @clara/db backup:full# FULL DR profile: 4 schemas + owners + privileges
pnpm --filter @clara/db restore:full # roles-bootstrap -> restore -> ceremony checklist
pnpm --filter @clara/db dr:selftest# exercise a full dump+restore round-trip
pnpm --filter @clara/db dr:verify  # restore verification battery (needs the two CLARA_DR_*_URL)
```

Root shortcuts: `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset`, `pnpm db:backup`,
`pnpm db:backup:full`, `pnpm db:restore:full`, `pnpm db:dr:verify`. Full-profile DR
runbook + tooling: `docs/ops/DR-full-drill.md`.

**Running `test` locally also needs `CLARA_ALLOW_DESTRUCTIVE=1`.** `tests/pipeline.test.mjs`
calls the real `seed()` (which truncates+reloads the smoke tables) as its own proof that the
pipeline works end to end, and `lib/guard.mjs` refuses any destructive op without the sentinel
— by design, the same wall every seed/reset/restore script carries, never weakened for a test's
convenience. CI's `db-estate` job sets this for the WHOLE job (`.github/workflows/ci.yml`), so
migrate, seed and test all share one env block there; a local run that exports the var for
migrate/seed but forgets it on the `test` invocation gets a single, correctly-worded refusal
from `pipeline.test.mjs` and nothing else. Export it once, for the whole session, before any of
the three commands above.

**Re-running `test` against the SAME already-tested database needs `CLARA_ESTATE_REUSED_DB=1`.**
A handful of one-way evaluator-ceremony cells (`clara._tf_evaluator_deploy_once`, 0060, admits
exactly one undeployed→deployed transition per `clara.evaluator_versions` row, EVER) prove a
"born undeployed" precondition that a second invocation against the same database can never
re-witness — that is the ceremony working as designed, not a defect. There is no `deployed_at`
column to tell that apart from a fixture illegitimately flipping a row early, so reuse must be
DECLARED, not inferred: `f-a5-reporting-agency-pr1.test.mjs` cell D hard-fails an unexplained
already-deployed row unless this var says the reuse is deliberate. Everywhere else in this
family the freshness check is derived (`evaluatorCeremonyUnwitnessed()`, `delta-fixtures.mjs`)
from the exact closed-world evaluator roster `delta-contract.test.mjs` pins by name and version
— not a blanket "any undeployed row" count, so migrating a reused database onto a NEW frontier
that registers one more evaluator does not get misread as "fresh" (it fails closed either way,
just loudly, rather than silently).

## The migration runner contract

- Migrations apply in numeric filename order, each in its **own transaction**.
- Each applied migration's `sha256` is recorded in `clara.schema_migrations`.
- **Migrations are immutable**: editing an already-applied file trips a checksum
  drift error — add a new migration instead.
- `reset` drops only the `clara` schema. It never touches `public`, `spike`,
  `workflow`, `graphile_worker`, or any Supabase-managed schema. (On the shared
  project the Slice-0 spike still holds a live parked run in `workflow` /
  `graphile_worker` — this is why the pipeline is schema-scoped.)

## Deploy contract (writer-body migrations) — rule D1

A migration that **replaces the body of an audited writer** (e.g. `0005_event_spine`
rewrites every `clara.*` writer to append its `domain_events` row in the same
transaction) carries a deploy-time obligation once a **live runtime** exists:

> **D1 — write-quiesce.** Any migration that replaces writer function bodies
> **requires an application write-quiesce for its deploy window.** PostgreSQL runs
> each in-flight PL/pgSQL execution to completion on the body it **started** with, so
> a writer call that begins *before* the migration commits and finishes *after* it
> runs on the OLD body — it would skip the new behaviour (e.g. emit no event). Quiesce
> the writers (stop accepting new wake/human write RPCs, let in-flight ones drain),
> apply the migration, then resume.

This was **materially zero-risk pre-Slice-4** — no runtime deployed, and
CI / throwaway targets have no concurrent writers — so `0005` needed no special
handling. The runtime is live since Slice 4: the rule binds every live deploy that
ships a writer-body change.
(Design authority: `docs/plan/completed/slice3-event-spine-contract.md` v2.2 §D1; the in-flight-body
behaviour is a PostgreSQL property, not a Clara mechanism.)

> **D2 — re-witness a witnessed control.** A migration that `CREATE OR REPLACE`s a body named in
> `clara.control_witnesses` **must re-witness it in the same file** — update that row's
> `prosrc_sha` to the sha256 of the reviewed new body. The registry exists because a control had
> been "proven" first by a migration ledger row (append-only, so permanently true long after
> `0118` dropped the control it named) and then by a marker string in the body (a text projection:
> a string literal, a nested dollar-quoted body or an unused variable all satisfy it). The gate
> now opens for the reviewed BYTES and nothing else, which means a recut without a re-witness
> **closes the gate and its door starts refusing** — deliberately, because a control whose body
> changed without review is a control nobody has reviewed. The instrument is
> `encode(sha256(convert_to(prosrc,'UTF8')),'hex')` — prosrc, never `pg_get_functiondef`.
> **The first witness is minted by 裁-18b PR-3** (`binding_pr_3_post_time_recheck`): it splices
> the post-time binding re-check into `clara._approve_entry_core` and, in the same file, mints
> `binding_post_time_recheck_v1` from the LIVE `prosrc` it just installed. Its tail independently
> pins the reviewed post-image (`9682cb13…`) in one constant and refuses unless BOTH the live sha
> and the witnessed sha equal it; tests read that one migration constant rather than copying it. That
> migration is itself a **D1 window**: `_approve_entry_core` is the estate's most-shared audited
> writer, and it carries its own quiesce guard (`clara.runtime_heartbeats` fresh ⇒ refuse).
> **It is also the file that CLOSES PR-1's deliberate refusal**: `0154` ships the registry empty,
> so `clara.sign_vendor_identity_binding` refuses `post_time_control_absent` until PR-3 lands.
> Either PR-1's ceremony follows PR-3's, or the refusal ships and PR-3 lifts it.
> `packages/db/tests/binding-proposal-pr-1.test.mjs`'s `bp1.C3-registry` cell asserts every
> registered witness still matches its live body, so a forgotten re-witness reds the suite rather
> than surfacing as a door that has quietly stopped working.

## Transaction-isolation pins

Every migration opens **READ COMMITTED**, stated explicitly on the `BEGIN` and then
**read back from the server** and refused on mismatch — `0019_wiki_boundary` refuses
outright under repeatable read (CLR32), so this is never a global switch.

`MIGRATION_ISOLATION_PINS` (`scripts/migration-atomicity.mjs`) is the one exception list,
keyed on a migration's **checksum** — its identity, not its number, so a renumbered file
still resolves. A pinned name arriving with unexpected bytes aborts in pre-flight, before
anything is applied. Today it holds exactly one entry: `0057_wave_e_registry_snapshots`
runs REPEATABLE READ, because its S0.9 birth sentinel asks whether the transaction's own
xid is visible in its own snapshot — a question with no stable answer under READ COMMITTED,
since any transaction completing after ours anywhere on the cluster pushes the snapshot's
`xmax` past our xid.

**Before adding a pin, read the trade recorded above the table.** A repeatable-read
transaction holds one snapshot for its whole life: the runner's before/after evidence reads
stop seeing third-party changes (accepted — a pinned migration only ever applies on a fresh
chain), and a **data backfill** under it silently skips rows committed after the snapshot
and raises 40001 on concurrently-modified rows. Backfills want the D1 write-quiesce window
or no pin at all.

## Evaluator deploy ceremony (two SEPARATE acts, both required)

A new frozen evaluator ships DARK (`deployed: false`) by construction. Flipping it live is
TWO halves, run in this order — neither substitutes for the other:

1. **`node packages/db/scripts/deploy-evaluator-version.mjs --name <n> --version <v>`** — the
   DB-side act. It flips `clara.evaluator_versions.deployed` for the named row, but only under
   the BARE migration principal: `clara._tf_evaluator_deploy_once` (`0060:93`) refuses the
   undeployed→deployed transition unless `current_user = session_user`, i.e. the deploying
   session holds NO active `SET ROLE`. `clara.verify_evaluator_freeze()` is checked before the
   flip commits. This transition is one-way and admitted exactly once per row, ever — no undo,
   and a second run is a no-op.
2. **`node scripts/check-frozen-evaluators.mjs --lock-deployed`** — the repo-side act. It stamps
   `frozen-evaluators.json` so a deployed body's hash becomes immutable versus `origin/main`.
   Skipping this after step 1 leaves a LIVE evaluator outside the append-only hash lock — missed
   once on 2026-08-24, caught and fixed 2026-08-26.

**`--lock-deployed` is BLANKET, not per-entry**: it stamps EVERY manifest entry whose `deployed`
flag is not already `true`. Run it only when every currently-dark entry in the manifest is
genuinely, deliberately intended to be deployed — never as a routine "sync the file" step.

## CI

CI applies every migration to a **throwaway `postgres:17` service container**
(never a live project), then runs the seed + smoke test against it. See
`.github/workflows/ci.yml` and the repo `README.md`.

## Typechecking

This package is intentionally plain ESM (`.mjs`) — no build step, runnable
directly by `node` in CI. It has no `tsc` typecheck; correctness is proven by
`tests/pipeline.test.mjs`. TypeScript packages (`@clara/runtime`,
`@clara/dashboard`) carry the `typecheck` gate.
