# The 0064-0072 ceremony — as run (2026-08-14 morning)

**Scope:** nine migrations from merged `main` (θ #237 squash `6cb6e461` + ε #235 squash
`c29abc16`) applied to the live project. **Result: 9/9 applied clean, zero stops, positive
reads PASS.** Live frontier moved 62/`0063` → **71/`0072`**.

## Pre-flight, recorded before the apply

- **Additivity proven, not assumed:** zero `create or replace function` across all nine files
  (checked at `origin/main`), and ε's author verified zero `alter table`/`drop`/`truncate`
  against any pre-existing relation — so **no D1 write-quiesce window** (no live writer body
  replaced, no existing table locked) and **no Supavisor interaction** (zero standing
  consumers wired; nothing pools at apply time).
- **Backup banked FIRST, off-machine:** the `clara-backup` machine ran on demand — run
  `2026-08-14T07-54-02-433Z`, raw full-profile dump **207,790,932 bytes** (all four
  authoritative schemas: `clara`, `graphile_worker`, `workflow`, `workflow_drizzle`),
  age-encrypted bundle 20,186,938 bytes → `r2:clara-dr/db-snapshots/2026/…`, firm-docs mirror
  unchanged (147 objects), plaintext staging purged, healthcheck pinged. The pre-ceremony
  migration head recorded by the bundle: 62 migrations — the exact state the apply moved from.
- **The author's brief was taken up front** (ε, unprompted): ranked watchlist — 0067's
  empty-tables assertion (the one place a resumed ceremony bites), 0066's 21-table census,
  per-file `clara_fn_owner` set/reset tails. None fired.

## The apply

Fresh clone of merged `main` at a short path (`-c core.longpaths=true` at CLONE time — a
post-clone config cannot save the first checkout). DSN from the `clara-backup` app's secret
env via an on-demand sleeper machine + `fly ssh console … printenv` piped into the
`dsn-pipe.mjs` bridge (value in child env only; never printed, never argv, never disk).
`DSN_APPEND=sslmode=verify-full` (load-bearing — the bare DSN carries no sslmode) with the
pinned pooler CA chain via `NODE_EXTRA_CA_CERTS`. Port 5432 session mode. Runner invoked as
`node scripts/migrate.mjs` — **not** `pnpm migrate`: `spawnSync("pnpm")` finds no `.cmd` shim
on Windows without a shell and dies silently with no output (one lost attempt; recipe updated).

Runner discipline observed live: the guarded SUSET pin fired its non-superuser branch
(`session_replication_role could not be SET … verified already at the required value`);
every file rode one pooled backend (pid 2967978) with the session-pin nonce as the freshness
proof — the exact shape PR #236 was built for.

Applied in order, each with its in-file census NOTICE: `0064` (θ get_close_plan — T17 shape:
`clara_authenticated` only, live-inert until the first `fiscal_years` row) · `0065` (12
tables born empty; wording rows = 0 measured) · `0066` (21 tables forced-RLS; `clara_agent_ro`
SELECT set unchanged) · `0067` (seeds: 2 profiles / 3 versions meeting at 2027-01-01 / 13
sections / 13 slots / 8 placeholders / 6 lexicon phrases / 1 claim policy; statutory packs
assess `failed` until owner task #43 lands wording — **a DB state, not a promise**) · `0068`
(7 validators, ungranted) · `0069` (4 publishing verbs, floors per SS6) · `0070` (run +
claim + dataset seal) · `0071` (the seal core, granted to NOBODY — ζ's JWT-less door) ·
`0072` (10 audited verbs; `clara_agent_ro`'s reporting SELECT = exactly δ's nine catalog
tables).

## Positive reads (asserted by script, not eyeballed — `live-read2.mjs` + `rs-check.mjs`)

`{ledger 71/0072 · evaluators registered 2 deployed 2 · get_close_plan SECURITY DEFINER
auth_execute 1 agent_execute 0 · ε forced-RLS tables 21/21 · seeds 2/3/13/13/8/6/1 ·
statutory_wording rows 0 · RS guard armed 1 · pgrst NOTIFY sent}` → **POSITIVE-READS-PASS**.

One probe defect, named for the record: the first RS-guard read queried
`fact_value->>'policy'` (an object shape written from memory) and returned 0; `0062:230`
stores a **bare JSON string** `'"name_only"'::jsonb`. The corrected probe read **armed = 1**.
Spelling is not identity — this time the misspelled projection was the operator's own probe,
and only the read-the-bytes rule caught it before it was reported as a regression.

## Deviations and their grounds

- `pnpm migrate` → `node scripts/migrate.mjs` (the Windows spawnSync shim trap above).
- The r2-restore rehearsal was not run — same grounds as the 0058-0063 ceremony (fresh
  backup banked minutes earlier; pure-additive DDL; every failure mode a transactional
  abort), which remain the standing recipe boundary: any ceremony that backfills or mutates
  data runs the rehearsal.
- `freeze --lock-deployed` not run — no runtime image deployed and no workflow body changed;
  the runtime redeploy rides lane η's own ceremony (unchanged from the δ record).

## Residue

- **The #43 gate is live**: all 13 required slots lack verified wording, so every statutory
  pack assesses `failed` and cannot seal a `pre_sign` until verified rows land. The verified
  wording packet (research + codex cross-check complete, 2026-08-14) supplies most rows; its
  seeding rides its own reviewed migration, with four items held for the owner sitting.
- ε's layer is **inert on arrival**: zero rows in every firm-scoped table; the first live
  report run is owner-key territory (E-R9 corpus).
- The ceremony ran on the owner's standing full-permission grant (2026-08-13/14);
  password-bearing acts were structurally avoided rather than performed.
