# As-run — the 0137+0138 apply ceremony (windowless), 2026-08-27

**Result: live advanced 131/`0136` → 133/`0138_f_a4_pr_1c_close_agent_limb`. Both prestates
and both tail censuses OK on live. No D1 window was taken, by derivation (below).**

## Why windowless

The D1 write-quiesce law binds a migration that **replaces a live writer's body**. Derived
independently and by the F-A4 PR-2a design lane's census, then borne out by the tails:
`0137` creates three masked views only (additive, owner-owned); `0138` is additive (three
tables · twelve wrappers · the settle door · the deferred Tier-C trigger) plus CoRs whose
only changed bodies are the two **read** oracles (`adjustment_run_due` /
`depreciation_run_due` — thin viewer-floor delegation, statement order preserved);
`attest_close_exception`, `finalize_close`, `mint_wake_credential`, `wake_context` and
`_close_gate_uncoded` were byte-identical to their prestate shas (asserted by the
migration's own prestate/tail). No live writer body moved → no window.

## Transport (one deviation from the runbook's letter, none from its discipline)

- Positive live leg first, both polarities: `openssl s_client` WITH the pinned CA →
  `Verification: OK`, peername `*.pooler.supabase.com`, exit 0; WITHOUT any CA → error 19
  self-signed-in-chain, exit 1.
- `clara-backup`'s machine was auto-stopped; started it (`fly machine start d895470c6024e8`).
- **`fly ssh console -C` failed with the known Windows "handle is invalid" quirk; the DSN
  was piped via `fly machine exec <id> "printenv DATABASE_URL"` instead** — same env-to-env
  path (stdout → `scripts/ops/dsn-pipe.mjs` stdin → child env only), DSN never in argv, a
  file, or a log, `sslmode=verify-full` + pinned CA forced by the bridge as always.
- `pnpm` as the bridge child failed `spawn ENOENT` (the Windows .cmd shim — the recorded
  dsn-pipe real-exe-child lesson); the child was `node packages/db/scripts/migrate.mjs`
  (cwd-independent by its own `import.meta.url` resolution).
- Run from the merged-main checkout `29d843d` (ceremonies run from `main`, never a branch).

## Evidence

1. Pre-frontier read through the bridge: `131 applied / frontier 0136_fix_freeform_basis_types`.
2. Apply: `0137` prestate clean (3 relations absent, premises live) → tail OK (3 masked
   views, exact ACL `{clara_authenticated=r}`, zero agent/wake/runtime reach) → applied.
   `0138` prestate OK (PR-1b ALTERs live, 14 delegates at pinned signatures, 7 prosrc shas,
   3 targets absent) → tail OK (forced RLS + owner+human-read pair on all three tables ·
   twelve wrappers at exact signatures with EXECUTE for `clara_wake_interactive` only ·
   exactly 12 new `close_prep` allowlist rows, no existing row moved · both due oracles
   assert `_assert_due_read_ctx` before delegating · `close_prep` engine-source row still
   registered-and-DISABLED · the parked thirteenth verb provably absent · frozen schemas:
   all new objects proven in `clara`, the parked Slice-0 population REPORTED not asserted —
   the `bed46f9` truing behaving correctly on real live data, constraint 15 honoured) →
   applied. `migrate: 2 new migration(s) applied · 133 total`.
3. Independent post-probe (separate session through the bridge):
   `133/0138_f_a4_pr_1c_close_agent_limb | views: 3 | 0138 tables: 3 | close_prep allowlist: 12`.
4. The backup machine auto-stops when its own process exits (observed mid-ceremony: it had
   already returned to stopped between the apply and the first post-probe attempt) — left to
   do so; no manual stop taken while a backup cycle might be mid-write.

Post-state: the close agent limb is live-inert by design — the `close_prep`
`wake_engine_sources` row ships `enabled=false`; the flip is PR-2a's, after its own ladder.
