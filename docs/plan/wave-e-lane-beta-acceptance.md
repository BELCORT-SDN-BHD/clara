# Wave E · lane β — the ceremony as-run record (the close model, migration 0056)

> **As-run record, 2026-08-11.** The build + ladder record of record is **PR #228's
> body** (8 review rounds · 8 fix batches · 35 defects killed pre-merge, 0 through ·
> the 9-axes × 2-lanes cross-lane coverage exhibit · the 69-cell/14-file battery green
> ×2 under both invocations) — **cite it, don't restate it.** This file records only
> the live ceremony: 0056 rode the SAME D1 quiesce window as lane α's 0055 (one
> `live_migrate_main.py` run applied both; the window narrative + backup + quiesce
> drain evidence live in `wave-e-lane-alpha-acceptance.md` §1).

## §1 What 0056's own tail printed at the live apply (verbatim)

> "0056 OK: period spine + gate trio + permit + wall family + drawer-1 probes + six
> verbs + E-R6 activated (guard untouched, twin repointed) + E-R11 keys + the
> opening-seed pin splice -- INERT ON ARRIVAL (zero fiscal_years rows; activation is
> the first human open_fiscal_year)."

First attempt, zero rollbacks; the in-file `set local statement_timeout='5min'`
(0056:82) honored the ADR-059 ceremony recipe without a runner patch.

## §2 Independent post-apply reads (each a positive read; instrument named)

| claim | instrument | SEEN |
|---|---|---|
| frontier | `max(version)` from `clara.schema_migrations` | `0056_wave_e_close_model` (55 applied) |
| inert on arrival | `count(*) from clara.fiscal_years` | 0 |
| door ACL | `has_function_privilege` on `record_client_fact` | human `t` · agent `f` |
| agent zero on the close model | `role_table_grants`, `clara_agent_ro`, the 8 tables (`fiscal_years`, `close_runs`, `close_gate_results`, `close_gate_attestations`, `close_write_permits`, `close_receipts`, `firm_capability_grants`, `client_facts`) | **0 grants** |
| S9c — the FA belt learned the closing entry | `_tf_fa_movement_belt` prosrc | carries `close_receipt_id is not null` |
| S9 — the seed door's pin splice | token count in the LIVE `approve_opening_seed(uuid,uuid,text,jsonb,text,text)` body | `_assert_seed_matches_prior_pin` appears **exactly 1×**; the helper's own body carries the `closing_position` pin logic |
| S9b — the restatement door | `approve_opening_correction` prosrc | carries BOTH `_assert_opening_tie` and `_assert_correction_pin_neutral` |
| E-R6 — guard untouched, twin repointed | exact token counts (substring-safe: `_correction_period_state` counted separately from the bare twin name) | `approve_wrong_client_correction`: guard **1×** · `preview_wrong_client_correction`: guard **0**, twin **1×** · `retire_document_filing`: guard **0**, twin **1×** |
| CVB unchanged (the ceremony verification balance — see the α record §1) | `trial_balance_as_of` (RS) | 3,396,500 = 3,396,500, diff 0 post-apply |
| runtime resumed | `fly status` + `/ready` + heartbeats | v60 · 2/2 checks · `/ready` 200 · beats 0–3s; Supavisor 38 total, runtime pool 11 |

A method note the record keeps on purpose: the first S9/E-R6 probes were
WRONG-INSTRUMENT (grepping the door for the helper's internal literal; a `LIKE` with
an unescaped `_` wildcard) — both re-derived against 0056's own splice text before any
conclusion was drawn. Spelling is not identity, including in verification probes.

## §3 Observations (named, non-blocking)

1. **A dead re-apply tell in S0.6.** The prestate's idempotence tell greps the literal
   `closing_position` in the seed door's body, but the splice deliberately inserts only
   the one-line helper call (`_assert_seed_matches_prior_pin`) — post-apply the door
   never contains that literal, so the tell cannot fire on a manual re-run. **Fails
   closed anyway**: a re-run's S9 would count the pin assertion twice and abort, and the
   production path (`migrate.mjs`) checksum-skips applied migrations entirely. Cosmetic;
   recorded, not fixed (migrations are immutable — a future migration may true the tell
   if S0.6's grammar is ever re-derived).
2. **B3 — the today-dated reopen mirror — remains the OWNER's ruling** (two lane
   positions attached, PR #228 body, residual 3). Nothing in the ceremony forecloses
   either variant.
3. **Activation posture:** the close model is live but INERT — zero `fiscal_years`
   rows; the first human `open_fiscal_year` (admin floor, key ①) is the activation
   act; the agent holds no key and no grant (E-R11, structurally).
4. **`closing_stock` producer verb** (PR #228 residual 5): ship before any real
   goods-trader close — carried as a REBUILD-PLAN item.
