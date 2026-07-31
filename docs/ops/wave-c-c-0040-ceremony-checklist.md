# Wave C-c (migration 0040) — ceremony checklist

> Deploy order is BINDING (house law): **runtime image FIRST** (this wave ships runtime
> ride-alongs + the bank-tieout RPC client surface; the image boots dormant on a 0039 DB),
> **then migration 0040** under a D1 quiesce, then restart → `/ready` green.

## Pre-ceremony probes (run BEFORE the quiesce — read-only)

1. **The opening-anchor census (B1/B3 — the tie is deliberately UNCONDITIONAL).** An
   account whose FIRST live statement opens nonzero with no Gate-K opening world on its
   COA will refuse `recon_opening_mismatch` forever — by design, not by accident. Per live
   `bank_accounts` row:
   - `S_first.opening_cents` (the earliest live statement's printed opening), and
   - the `opening_items` census on that account's COA (`gl_balance` + `bank_uncleared`
     kinds, `state='active'`).
   **Expected today: RPR `310-000/…1867` opens 2025-04 at 0 · the sandbox `1100/…0001`
   opens at 0 — both safe.** A future takeover account must carry its K opening world
   before its first recon is attempted.
2. **Supavisor session headroom** — re-measure (31/60 measured 2026-07-29; C-c adds read
   RPC consumers).
3. Heartbeat staleness probe (`clara.runtime_heartbeats` — columns `(component, beat_at)`)
   before treating the quiesce as settled (>90s).

## Ceremony

4. `fly deploy -c packages/runtime/fly.toml` from REPO ROOT → new image live (dormant
   features on 0039).
5. Quiesce: stop machine `48ee715b763048` → beats stale >90s.
6. `live_migrate.py` → 0040 (39 total). §0 probes + the full tail (incl. the T1
   allocation-writer census + the effective_date backfill window over the 36 live rows —
   the x40-0040-upgrade drill is its rehearsal) run in-txn.
7. Postverify: the three new tables + RLS/zero-agent-grants · the ten read RPCs granted
   `clara_authenticated` only · `verify_bank_reconciliation` resolves · the seven
   `bank.*`/exception event types registered · `open_item_allocations.effective_date`
   NOT NULL with 36 backfilled rows · the 41 unmatched lines + 34→ current open items
   untouched.
8. Start → `/ready` 200 all-green (clamd may take ~3 min).

## Post-ceremony (the acceptance program, WCC-R6)

Sandbox labelled-synthetic first (3-month recurring corpus → breed → owner signs →
suggestions → drafts → matches → three recons complete → void/re-complete drill) · then
RPR: terms → sign the recurring rules → book via suggested drafts → IWIFI four per WCC-R7 →
ROME PUBLIC per the owner's ledger pull (**Aug/Oct/Dec gated on that answer**) → complete
Apr→Dec at exact zero → aging ties to control → statements render.
