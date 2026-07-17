-- 0001_smoke_seed — SYNTHETIC data only (never real client books).
-- Idempotent: truncates then re-inserts, so repeated seeding is deterministic.
truncate table clara.slice1_smoke restart identity;

insert into clara.slice1_smoke (note, amount_cents, is_synthetic) values
  ('synthetic opening balance', 100000, true),
  ('synthetic invoice INV-0001', 45050, true),
  ('synthetic payment RCPT-0001', -45050, true);
