# WB-R18 ceremony runbook — live 16→17 + runtime v24→v25 (OWNER-`!`-GATED)

**One ceremony, one owner confirmation.** Nothing below runs until the owner explicitly
confirms in-session (the `!` gate). Preconditions and every probe are listed so the
confirmation is informed. Sources: design part 3 §post-verify · the v25 memo's ceremony
extras · the settled dashboard plan F10/F12/F13 · `packages/db/deploy/wave-b-0017-ceremony.sql`.

## 0. Preconditions (verify before asking for the gate)

- [ ] The dashboard-lanes PR is MERGED with green CI + clean dual review; Pages deployed.
- [ ] Full rig battery green on the merge commit (DB 754+/0 · runtime 500+/0).
- [ ] The two OPEN OWNER RULINGS are surfaced (neither blocks, both shape post-ceremony
      behavior): (a) the projection consumer's runtime READ surface — until ruled, wiki
      MODEL synthesis stays fail-closed DARK (held, visible) and document.classified
      ingest self-skips; (b) the commit-lane shape — until ruled, owner+bookkeeper firms
      commit via the documented temp-admin manual ceremony (the dashboard shows the
      refusal + explanation only).
- [ ] Rollback preflight BEFORE: `select name, count(*) from workflow.workflow_runs
      where status not in ('completed','failed','cancelled') group by name;` — v25 adds
      workflow classes v24 lacks; confirm the revert story is understood: **v25 is
      forward-only once the first interview parks.**
- [ ] Canary `daba7f2e` untouched. Backups green as of today.

## 1. Supavisor headroom (FIRST — WB-R18's pinned first step)

Walked session count for v25 = **27** dedicated+pooled (10 LISTEN/persistent incl. the
new wiki_projection + 17 pooled) against the 60 ceiling. Verify live:
project dashboard → Database → Pooler stats; require current usage + 27 ≤ 60 with
comfortable margin (the v24 world stops during the deploy, so the steady-state swap is
26→27, not additive — the check is for the overlap window).

## 2. Backup (fresh, verified)

One-off backup run: `fly machine start d895470c6024e8` (NEVER plain `fly deploy` on the
backup app). Confirm the run's zero-501 log + object count vs yesterday's.

## 3. Write-quiesce

Stop the runtime world: scale `clara-runtime` to the maintenance posture (the 0016
ceremony precedent — stop the machine so no consumer holds a session; the dashboard
shows PostgREST reads only). Confirm zero non-idle `clara_runtime` sessions.

## 4. Atomic 0017 apply (16 → 17)

From the repo root with the LIVE env (DSN discipline: env only, never argv; TLS via the
committed CA-pinned bridge, `docs/ops/dsn-bridge.md` — `sslmode=verify-full`, never `no-verify`):

```sh
<secret source> | node scripts/ops/dsn-pipe.mjs -- pnpm db:migrate
```

expect exactly `applied 0017_wave_b · 17 total`. The migration is ONE transaction with its
in-txn tail battery; any failure aborts atomically → stop, diagnose on the rig, never hand-patch
live.

## 5. Ceremony SQL (packages/db/deploy/wave-b-0017-ceremony.sql)

- 5a. Part A + C via psql against the project (the serializable proconfig pin + assert;
  the wiki_projection checkpoint seed-at-head).
  **Part A is a NO-OP on any database that has taken the chain past DB-A's
  `opening_approval_isolation_pin` migration (CB-AE2E-004, 2026-09-04)** — the pin is applied
  by that migration, and `alter function … set` is idempotent, so running it again changes
  nothing. Run 5a anyway on a target restored from an older dump. Step 7's live probe is
  unchanged and still the check that matters.
- 5b. Part B (the Storage wiki policy pair) in the **Supabase SQL editor** (storage
  schema — not reachable from the rig).

## 6. Runtime v25 deploy

`fly deploy` on `clara-runtime` (the standard image path), then restart into the normal
posture. Watch boot: all TEN loops start; `wiki_projection` must log **acquired** (not
dormant — the surface + seed now both exist); `/ready` green.

## 7. Wiki cold-start belts

- 7a. `node scripts/relay.mjs wiki-backfill --sources <pairs.json>` — the ceremony
  supplies `{clientId, documentId}` pairs for pre-0017 finalized documents (there is
  deliberately no runtime document→client link). Deterministic ingest only.
- 7b. `node scripts/relay.mjs wiki-repair` to convergence (put-409 idempotent).

## 8. Post-verify (design part 3 §post-verify + the F10 probe; all owner-visible)

1. Catalog sweep: the G5(a) constraintdefs; new tables under `clara_fn_owner`;
   FORCE RLS + policies on every new table. Re-run G5(b)–(g) out-of-txn.
2. Pack probe: `get_context_pack(<client>,'chat')` → schema 4, NO wiki key; the v7
   purpose + `clara.pack_consumer='v25'` path → wiki block with the lag marker.
3. Queue probe: envelope carries `lint` + `counts.lint_findings`; the deployed
   dashboard renders (the catalog parity test already gates this in CI).
4. Replay probes: one K5 approval, one W3 publish, one S4 tick re-invoked with the SAME
   op_key → byte-identical receipts, zero new rows.
5. `rule_sightings` count unchanged across the whole pass; `wiki_budgets` = the four
   WB-R8 values (this runbook is the **0017** ceremony — migration 0020 amendment A5 adds a
   FIFTH row, `max_source_pages_per_client = 50000`, and leaves all four WB-R8 values alone,
   so on a 20-migration database expect **five** rows, four of them these);
   `wake_fn_allowlist` row count unchanged from 0016.
6. Storage probe: one wiki put → re-download → sha match (5b took).
7. **Serializable probe (F10):** via the dashboard (or PostgREST curl) call
   `approve_opening_seed` with a CURRENT plan revision and ONE STALE ENTRY token →
   expect the typed `revision_mismatch` refusal. A `not_serializable` refusal = the pin is
   absent (5a did not take, or the target predates the migration that carries it) → STOP and
   investigate before any real approval. `pnpm --filter @clara/db dr:verify`'s §4.11 cell
   answers the same question against a restored target, absolutely and without a source to
   compare to.
8. Rollback preflight AFTER (same query as §0) — record the run counts.
9. Backup re-proof: the next daily run zero-501 WITH wiki objects present.

## 9. Aftermath

- **Deploy-lock the freeze manifest IMMEDIATELY (same sitting as the deploy):**
  `node scripts/check-frozen-workflows.mjs --lock-deployed` then commit
  `frozen-workflows.json` via PR and merge it before anything else lands — every v25
  workflow entry becomes immutable forever (the monotonic deploy-lock). The window
  between the deploy and this merge is the one interval where a live v25 body is
  not yet hash-locked; keep it minutes, not days.
- Update `PROGRESS.md` (live = 17 migrations, v25) + add the ceremony ADR under `docs/adr/`.
- The live gates O/K/W2/L/R2/F then run on REAL documents (WB-R16 vehicles: the real
  second client full-journey; RPR's management accounts → bootstrap_client_plan → the
  B-12 lane). Gate K rides document-primary if R2's parse lane shipped feasible, else
  the attributed keyed fallback (the settled plan F12 record states which).
