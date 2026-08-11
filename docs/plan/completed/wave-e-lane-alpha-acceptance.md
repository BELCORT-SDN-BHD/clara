# Wave E · lane α — the as-run acceptance record (the E-R12 trio, migration 0055)

> **As-run record, 2026-08-11.** Build + ladder record: PR #226 (triple-CLEAN, 16/16
> battery — cite the PR body, don't restate it). Contract: ADR-065 E-R12 (`docs/plan/
> wave-e-contract.md`); design: `wave-e-design-skeleton-part4.md` §3; cells:
> `wave-e-acceptance-matrix.md` Section F. This file records the **EARLY ceremony**
> (0055 live) and the Section-F cells that close only on live evidence. The ceremony
> shared one D1 quiesce window with lane β's (0056) — the window narrative lives here,
> the β-side post-checks in `wave-e-lane-beta-acceptance.md`.

## §1 The ceremony (one window, two migrations)

| step | what was SEEN (positive reads only) |
|---|---|
| pre-flight: backup | `clara-backup` machine run to completion: bundle 19,614,538 bytes → `r2:clara-dr/db-snapshots/2026/2026-08-11T11-49-00-592Z/`, exit 0, plaintext staging purged (11:50:19Z) |
| pre-flight: runner | migrate source = the MAIN-PINNED worktree `clara-db3-pr`, fast-forwarded and read back at `0239811` (= origin/main, the #228 merge); `live_migrate_main.py` (the D-b ceremony law: never a wave checkout) |
| pre-flight: frontier | live `max(version)` read = `0054_region_ordinal`, 53 applied — 0055+0056 pending exactly |
| pre-flight: no deploy | the merged span's ONLY runtime-lib change is one comment word (`SIXTEEN`→`FIFTEEN` in `invoice-customer-identity.mjs`, extracted from the span diff); **v60 stays the intended release** — `fly status` read back v60, 2/2 checks, before and after |
| quiesce (D1) | `fly machine stop 48ee715b763048` 11:52Z; drain watched at 15s cadence to **heartbeats 99s stale · 0 non-idle runtime sessions · 0 advisory locks** (the 9 pre-stop advisory locks all released on stop) |
| apply | `live_migrate_main.py` → `applied 0055_client_facts_trio` then `applied 0056_wave_e_close_model`, **first attempt, zero rollbacks**; `migrate: 2 new migration(s) applied · 55 total`. The statement_timeout law is honored IN-FILE (`0055:54` `set local statement_timeout='2min'`; `0056:82` `'5min'`) — no runner patch needed |
| in-txn censuses | both migrations' own tails printed OK through the notice listener; 0055's S5 notices (verbatim): **"0055 S5 backfill: 3 entity_type fact(s) carried over from committed plans"** · **"0055 S5 backfill: 0 committed client(s) left WITHOUT an entity_type carryover (no answered/resolved item on the latest committed plan) -- each takes the door (record_client_fact), the design's own remedy"** |
| reload + resume | `notify pgrst, 'reload schema'` (NOTIFY read back); `fly machine start` 11:53:55Z → `/ready` 200 → heartbeats control/reconciler/world at 0–3s |
| post-apply frontier | `max(version)` = `0056_wave_e_close_model` |
| CVB (the ceremony verification balance — the RS trial-balance identity used as the cross-migrate invariant) | RS trial balance via the product's own instrument (`trial_balance_as_of('e054b797…', current_date)`): **3,396,500 = 3,396,500, difference 0 — read PRE-migrate and again POST-migrate**, both equal to the 2506-close pin |

## §2 The three MSIC codes through the door (F3a–F3c)

Owner session (sub `27ba34b6…`, self-mint under the standing grant). All calls via
PostgREST `record_client_fact` — no hand-written row anywhere.

| cell | client | code | fact_id | recorded_at (Z) | op_key |
|---|---|---|---|---|---|
| F3a | ROME PROPERTIES SDN BHD `e2b0f365…` | 68109 | `77cb965a-cf27-47f8-9fbc-84e8eacd065c` | 11:55:13 | `wave-e-ceremony-msic-rpr-68109` |
| F3b | ROME SECRETARY SDN BHD `e054b797…` | 82110 | `51d364a6-4c7e-496a-8216-f64055ebfec9` | 11:55:21 | `wave-e-ceremony-msic-rs-82110` |
| F3c | BEE CREATIVE SOLUTION `9e957c0f…` | 74101 | `a534e75b-cb66-4d57-930e-e4d7ba692001` | 11:55:27 | `wave-e-ceremony-msic-bee-74101` |

**The basis string, quoted verbatim (identical shape ×3, per-client code/name):**

> "Owner instruction (Tao, BELCORT): MSIC 68109 for ROME PROPERTIES SDN BHD -- the
> parked sanctioned-lane code ruled 2026-08-09 at the Wave E design close (ADR-065
> E-R12(3)), entering through the audited capture door; discharges the ADR-062
> MSIC-backfill debt."

Each receipt carried the who/basis/when trio verbatim, `basis_kind='owner_instruction'`,
`validated_against='format_only'`. **This discharges the ADR-062 sanctioned-lane MSIC
debt** (the C-a residual: "MSIC backfill for the three real clients").

**The replay proof (counted before and after all three):**

| instrument | before | after 3 calls | after 3 same-op_key replays |
|---|---|---|---|
| `clara.client_facts` rows | 3 | 6 | **6** |
| `audit_log` rows, `fn='record_client_fact'` | 0 | 3 | **3** |
| `domain_events`, `client.fact_recorded` | 0 | 3 | **3** |
| `domain_events` TOTAL | 7,751 | 7,754 | **7,754** |

Each replay returned the STORED receipt (fact_ids byte-identical: `77cb965a…` /
`51d364a6…` / `a534e75b…`); no second fact, no second audit row, no second event.
(F3f — same op_key, DIFFERENT args refused — is battery-proven on the rig, PR #226;
not re-exercised live.)

## §3 The carryover population + the one doored gap

The live S5 read (the migration's own notice — the number was ON SCREEN, not derived):
**3 carried over** — BEE `sole_prop` · RS `sdn_bhd` · the sandbox's fictional client
`sdn_bhd` (all `interview_carryover`, all `enum:ENTITY_TYPES_V2`) — and **0 committed
clients left without a carryover**. **RPR is OUTSIDE the population** (no committed
onboarding plan exists — the client predates the interview), so its `entity_type` took
the door, the design's own remedy:

- `f9513272-0a06-485a-8dda-4d11e000f262` — RPR `entity_type='sdn_bhd'`,
  `basis_kind='owner_instruction'`, op_key `wave-e-ceremony-entity-rpr-sdn-bhd`, basis
  (verbatim): *"Owner instruction (Tao, BELCORT): ROME PROPERTIES SDN BHD is a private
  limited company (sdn_bhd) -- per the owner-ratified Wave E acceptance matrix cell F2a
  (PR #223, merged 2026-08-09) and the registered client name; RPR predates the
  onboarding interview so no committed-plan carryover exists and the audited door is
  the design remedy."*

Final `client_facts` census: **7 rows** (3 carryover + 3 msic + 1 doored entity_type).

## §4 F2a — the real-corpus pack reads (asserted on the RETURNED pack, not the source)

`get_context_pack(client, 'ceremony-f2a')` on the owner session, full body parsed:

- **BEE**: `$.client.entity_type = "sole_prop"` · `$.client.msic = "74101"`
- **RPR**: `$.client.entity_type = "sdn_bhd"` · `$.client.msic = "68109"`

## §5 The record cells (V-OWNER)

- **F1d — the F-1 wall-scope record.** F-1 was discharged by **ratify-plus-regression on
  the live 0044 `allocate_*` wall PLUS exactly one new guard on the apply path** —
  0055's in-txn assertions re-proved the wall identity (census pinned, `item_date`
  NOT NULL held) and spliced `apply_before_item_date` (strict boundary) into
  `apply_open_items`. **No duplicate wall was written anywhere.** The 0055 tail's
  "F-1 verified" line printed at the live apply.
  — OWNER SIGN-OFF: **Tao (BELCORT) — SIGNED 2026-08-11**, in-session structured ruling
  (recorded at ADR-068).
- **F3e — the MSIC honesty record.** The door does **NOT** validate against an official
  MSIC registry — no `clara.msic_codes` table exists anywhere in 0001–0056 — codes are
  **format-checked only** (`^[0-9]{5}$`), the catalog label says so
  (`validated_against='format_only'`), and the compensating control is **basis capture**
  (§2's verbatim strings). Nothing here claims the codes were registry-validated.
  — OWNER SIGN-OFF: **Tao (BELCORT) — SIGNED 2026-08-11**, in-session structured ruling
  (recorded at ADR-068).

## §6 The two carried notes (from PR #226)

1. The apply guard's **unwind-narrowing consequence**: a future-dated original's
   sanctioned unwind waits for its date — E-R12(1) refuse-outright, by design.
2. The composite cell's **fixed 2026-09 statement period** — revisit at lane β's wall.
   *(This record's own note, not PR #226's: the wall is now LIVE and inert; the revisit
   stands for when closes activate.)*
