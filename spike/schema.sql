-- Slice-0 spike domain schema (engine tables are separate: see README "Engine schema").
-- Idempotent: safe to re-run.
--
-- Money is bigint cents. The op_key UNIQUE constraint is the DB-level
-- idempotency key that T4 (kill-after-commit) exercises: a replayed step
-- re-invocation must land on ON CONFLICT and return the original row.

create schema if not exists spike;

create table if not exists spike.postings (
  id           bigint generated always as identity primary key,
  op_key       text not null unique,
  amount_cents bigint not null,
  created_at   timestamptz not null default now()
);

create table if not exists spike.receipts (
  id         bigint generated always as identity primary key,
  posting_id bigint not null references spike.postings (id),
  receipt_no text not null unique,
  created_at timestamptz not null default now()
);

-- Completion marker written by step B (finalize), keyed to the run.
create table if not exists spike.completions (
  id         bigint generated always as identity primary key,
  run_id     text not null,
  op_key     text not null unique,
  approved   boolean not null,
  approver   text,
  created_at timestamptz not null default now()
);

-- Canary side-effect table: one row per step-body invocation (including
-- engine retries/replays). T3 asserts post_entry stays at 1 invocation;
-- T4 asserts it reaches exactly 2 (original + idempotent replay).
create table if not exists spike.step_invocations (
  id         bigint generated always as identity primary key,
  op_key     text not null,
  step_name  text not null,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists step_invocations_op_key_idx
  on spike.step_invocations (op_key, step_name);
