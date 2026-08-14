# Wave E δ + RS guard — the 0058-0063 ceremony, as run (2026-08-14, ~02:15-10:25 MYT)

The live apply of migrations `0058_wave_e_delta_metrics` … `0063_rs_name_only_lift_floor` onto
the production estate, from merged `main`, ending at the one-way evaluator deploy ceremony.
Every claim below is a read the run actually took; the transcript lives in the session record.

## Final positive reads (the closing state)

- `clara.schema_migrations`: **62 rows, max `0063_rs_name_only_lift_floor`.**
- `clara.evaluator_versions`: **registered 2 / deployed 2** (`evaluate_metric`,
  `assess_metric_cell_independent`), flipped in ONE transaction under the direct session
  principal (`current_user = session_user = postgres`), preconditions verified first
  (`metric_cells` = 0, registry at 2-registered-0-deployed).
- `clara.verify_evaluator_freeze()`: **`ok: true, verified_deployed: 2, verified_registered: 2`.**
- ROME SECRETARY armed: **1** live `customer_identity_policy = "name_only"` fact, recorded
  through `clara.record_client_fact` by an admin+ member with the full basis receipt
  (fact `f79c3da0-…`).
- `clara.metric_evaluation_attempt_receipts`: **0** (born empty, correctly).
- `NOTIFY pgrst, 'reload schema'` sent after the flip.

## The live evidence worth keeping

- **0062's S4.5 behavioural self-proof fired ON THE REAL BOOKS**: a registration-bearing
  CUSTOMER insert for the pinned RS client was refused by the guard in-transaction
  (`customer_identity_name_only`) and rolled back. Hard constraint 12 is structural now.
- 0062's S3 premise check read **0 pre-enriched RS customers** — the recorded premise held.
- 0063's S2.5 stated its live unavailability honestly (the firm has no active non-owner
  member to stage an admin lift; the rig cells carry that proof).
- Every δ tail census printed green on live (38/38 forced-RLS pairs, 11 authenticated-only
  entrypoints incl. the A30b receipt writer, `get_context_pack` v5, agent raw tables 0).

## The two field findings (each stopped the ceremony cleanly, ledger intact both times)

1. **SUSET on a managed cluster.** The hardened runner's session baseline pins
   `session_replication_role`; Supabase's managed `postgres` role is not superuser, so the
   SET was refused (SQLSTATE 42501) at session pinning — before any transaction. This is the
   registered Slice-2 HIGH 8/9 gap met in the field. Fix: PR #234 — the guarded pin (attempt;
   on 42501 for exactly that parameter, read-and-assert `'origin'`, recorded as
   *verified-not-set*; denial cached per client because a retry inside the open post-body
   transaction would 25P02-poison the migration it protects). The live pre-read
   (`show session_replication_role` → `origin`) was taken before resuming — looked at, not
   expected.
2. **Pooled backends defeat pid-distinctness.** Through Supavisor session pooling a brand-new
   client legitimately receives a recycled server backend, so the runner's
   "fresh client ⇒ distinct `pg_backend_pid`" refusal fired on 0059 (0058 committed; 0059
   rolled back whole; ledger stopped honestly at 57/0058). The instrument asserted connection
   topology, not session state. Fix: PR #236 — the **session-pin nonce** (stamped by
   `pinMigrationSession` as its last act, read back server-side as a body precondition,
   refusing by name on mismatch/absence; pid demoted to an informational pooled-backend
   note). Side effect worth the record: under TRANSACTION pooling the advisory-lock
   serialization and the `pg_temp` execution wrapper would both fail silently — the nonce
   converts that topology into a loud statement-one refusal.

## Deviations from the standing recipe, with grounds

- **The r2-restore rehearsal was not run.** Grounds, recorded before the apply: a fresh
  206 MB full-profile backup was banked minutes earlier (run `2026-08-13T19-26-54-925Z`);
  0058-0063 mutate zero existing rows (pure additive DDL + one conditional fact-arming
  through the audited door); every failure mode in the RS pair is a transactional abort
  (the B6 hardening made even the soft arming paths abort); and the S4.5 probe's insert
  shape had been verified against the full 0001-0057 chain. The runner-axis half of what a
  rehearsal proves was separately covered by PR #234's non-superuser owner-login rehearsal
  (a real `migrate()` end-to-end as a Supabase-shaped login). The restore rehearsal remains
  the standing recipe for any ceremony that backfills or mutates data.
- **`freeze --lock-deployed` was a no-op for this ceremony** — no runtime image deployed and
  no workflow body changed in the merged content; the runtime redeploy rides lane η's own
  ceremony. The freeze manifest was verified clean by CI on every constituent PR.
- **The D1 write-quiesce window was not required** — no audited writer body was replaced
  (`get_context_pack` v4→v5 is a read-surface splice, explicitly not a books-writer).

## The connection mechanism (no credential ever entered the operator context)

The live DSN was sourced from the `clara-backup` Fly app's secret env via
`fly ssh console … printenv` piped directly into an in-process bridge
(`dsn-pipe.mjs`) that spawns the runner with the value in child env only — never printed,
never on argv, never on disk. TLS: `sslmode=verify-full` with the pooler's CA chain pinned
(`NODE_EXTRA_CA_CERTS`), proven in both directions (verifies with the CA; refuses without).
Port 5432 session mode, per the standing ceremony law. The bare DSN carries no `sslmode`
parameter, so an unmodified runner connection would have been plaintext — the append is
load-bearing and belongs in the next ceremony's recipe.

## Residue

- The evaluator closures are live-and-frozen but **unexercised on live books** — the first
  live cells arrive with the FS-pack acceptance (owner-key territory, E-R9 corpus).
- The ceremony ran at a quiet hour on the authority of the owner's 2026-08-13 full-permission
  night-run grant; password-bearing acts were structurally avoided rather than performed.
