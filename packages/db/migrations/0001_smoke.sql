-- 0001_smoke — Slice-1 pipeline smoke migration.
--
-- This is NOT the real schema (that is Slice 2 — the governed DB core). Its only
-- job is to prove the migration pipeline runs end-to-end against a real Postgres:
-- runner applies it, seed loads synthetic rows, the smoke test asserts state.
--
-- Everything lives under the dedicated `clara` schema so the pipeline is fully
-- isolated from anything else on the project (the frozen Slice-0 spike left
-- `spike` / `workflow` / `graphile_worker` schemas with a live parked run — we
-- must never touch those). `db:reset` drops only `clara`.
--
-- Money is bigint cents everywhere in Clara; the placeholder column below models
-- that convention so the invariant is visible from migration #1.

create schema if not exists clara;

create table if not exists clara.slice1_smoke (
  id           bigint generated always as identity primary key,
  note         text        not null,
  amount_cents bigint      not null default 0,
  is_synthetic boolean     not null default true,
  created_at   timestamptz not null default now()
);

comment on table clara.slice1_smoke is
  'Slice-1 pipeline smoke table. Synthetic data only. Replaced by the real schema in Slice 2.';
