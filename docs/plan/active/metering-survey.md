# F-A9 — Metering: the estate survey

> **v2, 2026-08-22 — gate 1 folded (record: `metering-gate-record.md`).** The gate's
> byte lens re-derived every census in this file against the live migration sources; the
> two that were wrong are re-cut here (§A.5's gate census was not closed-world — it
> missed a whole second limits table; §A.7's exhaustiveness claim was scoped to the wrong
> grep universe), and §C's description of the x42 clock census was replaced with what the
> census actually measures. Every re-cut carries its own byte cite.
>
> Companion to `metering-design.md` (v2). Wave-F Track A, `wave-f-contract.md` §F-A9
> (lines 127-131). Ruled by **TA-P12** (the brake census) and **TA-P13** (one ledger),
> with **TA-P2** (spend = tokens × a versioned price table) as a cross-cutting input —
> all three are 2026-08-22 owner rulings, cited by id throughout. Sitting record of record:
> `docs/adr/0074-the-track-a-sitting.md`, with the member tables in
> `docs/plan/active/track-a-sitting-3.md` (TA-P12/TA-P13) and `track-a-sitting-1.md` (TA-P2);
> the orchestrator's own PR-1 ledger and the sitting agenda are session-local. Digest law 76 (§9),
> law 16 (effective-dated policy tables), law 1 (the DB owns every authoritative
> number). Every claim below is a Read of the cited file:line, or is named as a
> **PREDICTION** where the live catalog can only be confirmed by rig replay.

**Standing caveat** (the general form is F-A2's own, `f-a2-annexes-1-estate.md`'s
"Standing caveat": everything read from migration source is a *prediction* about the
live catalog, and a `base + dynamic splice` body is one of the three classes that
defeat source reading outright). **Corrected this pass** — the lineage this design
depends on is LONGER than first drafted: `clara.admit_autodraft_task` is a **base,
recreated three times, then dynamically spliced three further times** — `0011` create
→ `0031` → `0034` → `0036` (the last full textual `CREATE OR REPLACE`, per `0053`'s own
comment, `0053:299-300`) → `0046` S7.1 (dynamic splice #1: tri-state direction, registry
insert, audit widening) → `0048` S1 (dynamic splice #2: the concurrency cap excludes the
caller's own open run) → **`0053` S1 (dynamic splice #3, MISSED in the first draft of
this survey: the re-admit-after-withdrawal arm, `0053:792-962`)**. `0053`'s own header
states the reason for the earlier splices' existence in words identical to this
survey's own idiom (`0053:296-306`: *"PATCHED, NEVER REBUILT"* — a from-file
`CREATE OR REPLACE` here would silently revert both `0046`'s and `0048`'s splices) and
carries its own D1 write-quiesce obligation for the same body (`0053:317-320`). **Seven
generations, not six** — every line number below for this function is a **prediction
about what the migration source said at the point it ran**, not a measurement of the
live catalog's current text, and that prediction now correctly accounts for one more
splice than the first draft credited. PR-1 confirms the true tip by rig replay before
it CoRs anything, exactly as F-A2's own build does for `admit_autodraft_task`'s
siblings — this correction changes what the prestate must reconcile against, not
whether it must.

---

## A · The estate as-found

### A.1 · The one ledger that exists today: `clara.llm_usage_events` (F-A1, migration `0094`)

Built by F-A1 PR-1 (`packages/db/migrations/0094_f_a1_usage.sql`), already live (F-A1's
ceremony record: `docs/plan/completed/f-a1-pr1-ceremony-asrun.md`). Shape at the bytes
(`0094:53-70`):

| column | type | nullability | note |
|---|---|---|---|
| `id` | uuid | PK | |
| `firm_id` | uuid | **NOT NULL** | |
| `document_id` | uuid | **NOT NULL** | FK `(document_id,firm_id)` → `documents(id,firm_id)` |
| `task_id` | uuid | **NOT NULL** | FK `(task_id,firm_id)` → `document_processing_tasks(id,firm_id)` |
| `channel` | text | **NOT NULL** | CHECK `in ('text','vision')` |
| `engine_id` | text | NOT NULL | |
| `prompt_hash`, `input_tokens`, `output_tokens`, `duration_ms` | — | nullable | |
| `outcome` | text | NOT NULL | CHECK `in ('success','refused','error','timeout')` |
| `created_at` | timestamptz | NOT NULL | |

Append-only (`0094:74-77`), forced RLS with an owner policy + a firm-scoped human
SELECT policy (`0094:79-85`). The writer `clara.record_llm_usage_event(p_firm, p_document,
p_task, p_channel, p_engine_id, p_prompt_hash, p_input_tokens, p_output_tokens,
p_duration_ms, p_outcome)` (`0094:90-124`) is EXECUTE-granted to `clara_runtime` only, no
PUBLIC. Its own header states the law-76 posture already: **"NO SPEND REFUSAL ANYWHERE
... this table only ever RECORDS a call, it never gates one"** (`0094:15-17`). It carries
one positive-evidence consistency check (nit 3, `0094:102-113`): a task named must
belong to the named document, read positively, never inferred.

**Two live callers, both direct JS RPCs (not routed through `persist_witness_facts`):**
`witnessFacts.v1.dispatch.mjs:339` and `statementFacts.v2.dispatch.mjs:209`, each a
positional 10-argument call `select clara.record_llm_usage_event($1,...,$10)`. A third
path is optional and DB-internal: `clara.persist_witness_facts` (`0095_f_a1_writer.sql`)
forwards an inline `usage` blob to the same verb at `0095:625,631` **only when its
caller passes one** — the design comment at `witnessFacts.v1.behavior.mjs:375-379` /
`witnessFacts.v2.behavior.mjs:418-422` states why it is deliberately NOT passed there:
one row per call, at call time, never a second write that would double-count.

### A.2 · `witnessFacts.v1.dispatch.mjs` is inside `witnessFacts_v2`'s LIVE frozen closure

`registry.ts:69` points the live `witnessFacts:` class at `witnessFacts_v2`.
`witnessFacts.v2.behavior.mjs:14` states it in words: **"THE DISPATCH FILE IS REUSED,
NOT COPIED. ./witnessFacts.v1.dispatch.mjs is imported unchanged"** — i.e.
`packages/runtime/workflows/witnessFacts.v1.dispatch.mjs` (import at
`:107`). Per `.claude/rules/runtime-workflows.md`, "editing a … file that a frozen body
imports IS editing that frozen body." **So `witnessFacts.v1.dispatch.mjs`, despite its
filename, is live-frozen code today** — any edit to it needs a new `_v3`, not a v1/v2
patch. `statementFacts.v2.dispatch.mjs` is a **duplicate**, not a shared import
(`statementFacts.v2.dispatch.mjs:6-10`, "DUPLICATED … BY DESIGN, NOT BY OVERSIGHT"), so
it is separately live-frozen inside `statementFacts_v2`.

### A.3 · The task-identity gap — two disjoint "task" tables, one FK reaches only one

`clara.agent_tasks` (`0006_runtime_core.sql:138-159`) is the chat/wake task table:
`kind in ('chat_turn','wake')`, `client_id` nullable ("may be null (firm-level wake /
general chat)", `:141`), keyed with a composite `unique(id,firm_id,client_id)` added at
`0009_coding_floor.sql:810`. `clara.document_processing_tasks`
(`0007_document_pipeline.sql:148-179`) is the OCR/extraction task table, keyed
`unique(id,firm_id)` (`:168`). **`llm_usage_events.task_id`'s FK
(`0094:68-69`) can only ever resolve against the second table.** A chat turn or a wake
task has no row there at all — there is structurally no way to record a chat call's
task linkage through the existing FK shape, nullable or not. Reshaping "the two
mandatory FKs become nullable" is necessary but not sufficient; a **second, independent**
task reference is needed for the `agent_tasks` shape (design §3.1).

### A.4 · Chat is completely absent from the new ledger today

`clara.begin_chat_turn` / `clara.settle_chat_turn` (`0006_runtime_core.sql:923-999`,
`:1011-1067`) are the chat admission/settle pair. `settle_chat_turn` computes the
authoritative token total from `task_checkpoints` (`0006:1029`) and writes it ONLY into
`clara.task_usage` (`:1048-1050`) and `clara.firm_usage_daily` (`:1054-1057`) — **never**
into `llm_usage_events`. **It also READS `task_usage` (`0006:1025`)** to carry the token
count on the terminal-replay receipt — recorded here because the design's first draft
called §A.5's removed blocks "their only readers", which is false at the bytes (gate
fold GM-4; design §3.9 corrected). `chatTurn.v12.impl.ts:95-160` (`runModelSegmentStepV12`
— the real name, corrected this pass, `runChatTurnModel` exists nowhere in `packages/`)
computes `usageTokens` at `:146-149` from the AI SDK's `streamText` result and returns it
up the call chain,
but nothing in the chain forwards it to `clara.record_llm_usage_event`. **Chat is,
today, recorded ONLY in the ledger TA-P13 retires.** If the old ledger is dropped before
chat is wired into the new one, chat's spend — very likely the single largest usage
bucket, per TA-P13's own text — goes completely dark. This is the sharpest finding in
this survey (design §3.8 names the fix and its sequencing cost).

### A.5 · Every live usage gate, at the bytes (TA-P12's census)

**How this census was derived, and how far it reaches (re-cut at gate 1).** v1 enumerated
five gates and called that the census; it was not closed-world — it swept the
`firm_limits` family only and missed the document/processing lane's own limits table,
`clara.firm_document_limits` (`0007:364-371` + `0090`'s `llm_witness_concurrency`),
whose per-UTC-day page budget the migration's own comment calls the firm's **vendor
spend** (`0038:7056-7058`). The census below is now derived the other way round: every
`errcode='CLR14'`/`'CLR18'`/`refused_*` refusal in the live tree that reads a
per-firm LIMIT column, from both limits tables. **Eight gates, not three.**

**(1) Chat's daily token hard-cap.** `clara.begin_chat_turn`, `0006:962-974`: reads
`coalesce(daily_token_limit,1000000)` from `clara.firm_limits`, reads today's
`firm_usage_daily.tokens_used`, and `raise exception … using errcode = 'CLR14'` when
`tokens_used >= daily_token_limit`. This is the gate TA-P12 says is **already violating
G8 live today** — REMOVE, and as a **hotfix ahead of F-A9** (design §3.3/§5 PR-0).
**The removal is not a byte-delete of a contiguous range** (gate fold GB-2b): the limits
read at `0006:963-964` is ONE `select` that loads `daily_token_limit` into
`v_token_limit` **and** `max_concurrent_runs` into `v_run_cap`, and the KEPT concurrency
check at `:981` uses `v_run_cap`. PR-0 rewrites that select to read
`coalesce(max_concurrent_runs,3)` alone (and `:965`'s not-found fallback with it),
deletes `:967-974`, and drops the three declarations that die with the block —
`v_token_limit`/`v_tokens_used` (`:929`, `:931`) and **`v_today` (`:930`)**, whose only
two uses are `:970` and `:973`. Dropping `v_today` is what takes `begin_chat_turn` out of
the live bare-clock-token set — see §C.

**(2) Chat's concurrent compute-run cap.** Same function, `0006:976-985`: counts
`agent_tasks` in `('queued','running','cancel_requested')` for `kind='chat_turn'`,
raises CLR14 at `>= coalesce(max_concurrent_runs,3)`. **KEEP** — engine protection
(3 concurrent runs), not spend. No JSON `outcome` string is involved here (a raised
exception only), so no rename obligation on this arm.

**(3) The unattended lane's `refused_budget` at 60%/100%.** `clara.admit_autodraft_task`
(base body `0011_daily_loop.sql:2441-2597`; PREDICTION per the standing caveat above.
**The last full CREATE is `0036`, and its text differs from `0011`'s** — the two refusal
returns lost their `_finish_op` wrapper at `0034`'s retry-door rework, so the live
concurrency block is `0036:1397-1407` and the live token-budget block `0036:1408-1417`.
Both `0011` cites below are kept because they are the ones the ruling and the earlier
review rounds quote; the STRINGS are byte-identical in both generations, and PR-1B's
prestate reads the true tip anyway).
At `0011:2533-2538` it reads `daily_token_limit`, `sweep_budget_share`
(default 0.60, `0011:631`), `max_concurrent_sweeps` (default 2, `0011:632`). The
**concurrency** branch (`0011:2543-2554`) refuses at `sweep_runs` open-count
`>= v_cap`, outcome `'refused_budget'`, `refusal_token.reason='refused_budget'`,
`refusal_token.gate='concurrency'`. The **token-budget** branch (`0011:2555-2566`)
refuses when `v_used + p_reserve_tokens` exceeds `v_limit*v_share` (sweep origin, i.e.
60%) or `v_limit` (one_click origin, i.e. 100%) — **exactly** TA-P12's "60%/100%"
description. Both branches write the identical outcome string `'refused_budget'` into
`sweep_run_items.outcome` (CHECK enum at `0011:734-735`) and into the function's own
returned jsonb. **REMOVE the token-budget branch; the concurrency branch KEEPS its
function but loses the shared string** (design §3.3).

**(4) The concurrency floor's own later recut.** `0048_autodraft_sweep_cap_own_run.sql`
re-splices the SAME concurrency block (`0048:172-192`) to exclude the caller's own
open run from the count (H2 acceptance finding F5) — the bound itself is untouched,
only self-counting is fixed. This is the SECOND of the three dynamic splices in the
corrected standing-caveat lineage (0011 create→0031→0034→0036 full recreate→0046→0048
→0053, seven generations); its own header confirms the pattern in words (`0048:51`,
"already dynamically recut once since its last full CREATE") — and `0053` recuts the
same function a third time afterward (standing caveat above), for an arm unrelated to
either usage gate (the re-admit-after-withdrawal door), so it does not add a fourth
usage-gate branch, only a fourth generation to reconcile at rig replay.

**(5) The 15-drafts/day unattended sales quota.** `0046_wave_7a_sales_lane.sql:471-489`
adds `firm_limits.sales_admission_daily_cap` (CHECK `between 0 and 200`, comment at
`:480-485` states the fn-constant default is **15**). The check itself is a dynamic
splice into `admit_autodraft_task`. **The spliced text is THREE constructs, not one
range** (re-cut at gate 1 — v1 cited the whole `0046:2223-2259` span as "the block" while
also declaring part of that same span untouched, which is unbuildable either way it is
read; measured directly, PREDICTION per the standing caveat):

| `0046` lines | what it is | disposition |
|---|---|---|
| `:2223-2225` | ONE `select` loading **both** `sales_admission_watermark` → `v_wm` **and** `coalesce(sales_admission_daily_cap,15)` → `v_cap_sales`, plus `:2225`'s second coalesce | **REWRITE** to read the watermark alone (`v_cap_sales` and its coalesce go) |
| `:2226-2242` | the 7A-R5 backfill-batch door — the `sales_backfill_batches … for update` claim and the `sales_backlog_held` refusal (`:2235`, `:2239`), gated on `v_wm` | **UNTOUCHED, and must not be touched** |
| `:2245-2259` | the cap count over today's sales-direction `autodraft_attempts` (`:2245-2247`) and its `outcome='refused_budget'` / `reason='refused_sales_cap'` / `gate='sales_daily_cap'` refusal (`:2248-2259`) | **REMOVE** — a THIRD reason sharing the same outcome string |

Two failure modes the v1 wording admitted, both real, recorded so the builder cannot
re-enter either: delete the whole span and 7A-R5's human-recorded backfill door goes with
it (a governance door the ruling never reached); delete only `:2245-2259` and
`v_cap_sales`'s read of `sales_admission_daily_cap` stays live at `:2223` while §3.4 drops
that column in the same migration — PL/pgSQL is late-bound, so the DROP succeeds and the
FIRST sales-direction admission after the window raises `column … does not exist`.
**Order matters and is stated as a dependency in Annex B: the shared-select rewrite lands
in the same file, ahead of the column drop.** `v_today` (`0036:1168`) is NOT orphaned by
this removal — the reserve side (`0036:1394,1396,1455`) and `autodraft_attempts.usage_date`
(`0036:1461`) still use it, so `admit_autodraft_task` keeps its bare-clock-token roster
membership through PR-1B **and** PR-4 (§C).

**The honest cost of (5), stated rather than implied:** the daily cap is the ONLY per-day
pacing an already-open backfill batch has (`0046:472-482` says so in its own words) — the
door decides *whether* a backlogged filing may be admitted, the cap decided *how fast*.
Removing the cap means an open batch is bounded only by its own `batch_size`
(`0046:502`, CHECK `between 1 and 500`, re-asserted at `:1887`). That is the direct
consequence of TA-P12's REMOVE, not an over-reach: the ruling kills a spend-shaped
throttle and this is what killing it costs. It belongs in PR-1B's summary in these words.

**(6) The document lane's per-UTC-day doc/page budget.** `clara._reserve_document_ingest`
(`0007:1632-1654` — the only `create function` for this name in the tree, so `0007` IS the
live tip) reads `coalesce(docs_per_day,100)` / `coalesce(pages_per_day,1000)` from
`clara.firm_document_limits` at `:1638-1640` and raises `CLR18` "document daily limit
reached (docs)" at `:1645-1647` and "(pages)" at `:1648-1650`.

**(7) The processing lane's per-UTC-day page budget.** `clara._reserve_processing_call`'s
live tip is `0038:7050-7082` (a `create or replace` over `0009:581`): reads
`coalesce(pages_per_day,1000)` at `:7063-7064`, sums the day's reservations across both
reservation tables, and raises `CLR18` "processing-call daily page limit reached" at
`:7076-7078`. **Its own comment (`0038:7056-7058`) says the budget exists so as not to
"misstate the firm's vendor spend"** — i.e. this gate is, in its author's own words, a
spend gate, in non-token units, exactly the shape TA-P12 classified REMOVE for the
15/day sales quota. Live callers of (6)/(7): `0007:1729`, `0007:1852`, `0009:709`,
`0014:231`, `0015:3322`, `0016:3479`, `0022:307`, `0025:254`, `0025:440`, `0026:479`.

**(8) The document-processing concurrency floors.** `clara.claim_document_processing_task`
(`0090_f_a1_walls.sql`, body from `:328`) raises `CLR18` at `:421-428` on
`coalesce(ocr_concurrency,2)` over the shared `ocr`/`invoice_facts`/`statement_facts`
lanes, and again at `:434-442` on `coalesce(llm_witness_concurrency,2)` over
`lane='llm_witness'` alone. **KEEP** — engine protection, not spend, the same class as
(2) and (4) and squarely inside law 76's carve-out. No `outcome` string is involved
(raised exceptions only), so no rename obligation attaches, exactly as for (2).

**(6) and (7) are NOT classified here.** They are spend-shaped by their own comment but
they sit outside the token/draft lanes the ruling enumerated, and REMOVING them would put
two more live bodies in a D1 window on this lane's own say-so. Design §4 carries them as
an owner item with a fail-closed default (they stay live, and the acceptance record does
not claim "every live usage gate classified" until the owner rules).

### A.6 · The `refused_budget` string collision, end to end

Three unrelated refusal reasons — engine-protective concurrency, the token-budget
cap, the sales-count cap — write the **identical** `outcome`/`reason` string
`'refused_budget'` (`sweep_run_items.outcome` CHECK, `0011:734-735`; the function's own
returned jsonb). The dashboard reads this bucket directly: `SweepReceiptCard.tsx:60`
renders `<Tile n={data.counts.refused_budget} label="over budget" />`, fed by
`reviewCardTypes.ts:26,55` (`refused_budget: number`). Once the two spend-caps retire,
every future `refused_budget` row is a concurrency refusal, but the tile would still say
"over budget" — a record that visibly lies (law 22). Runtime consumers of the bare
string: `packages/runtime/lib/autodraft.mjs:58` (a doc-comment enumerating outcomes,
not a branch) and `packages/runtime/tests/wave-a-autodraft-consumer.test.mjs:53,91,100`
(fixtures pinning the concurrency case specifically — these do not need the SALES/
TOKEN cases to keep passing, confirmed by reading the cited assertions).

### A.7 · `firm_limits`' full column inventory and the ruling's disposition

Built across three files — `0006_runtime_core.sql:230-235` (create) →
`0011_daily_loop.sql:630-635` (alter) → `0046_wave_7a_sales_lane.sql:471-489` (alter).
No fourth ALTER exists (grep-confirmed against every migration file).

| column | added | sole reader(s) today | disposition |
|---|---|---|---|
| `firm_id` (PK) | 0006 | — | keep |
| `daily_token_limit` | 0006 | chat cap (§A.5.1) + sweep/one_click token-budget (§A.5.3) | **DISPOSE** — both readers retire |
| `max_concurrent_runs` | 0006 | chat concurrency floor (§A.5.2) | **KEEP** |
| `updated_at` | 0006 | — | keep |
| `sweep_budget_share` | 0011 | sweep/one_click token-budget only (§A.5.3) | **DISPOSE** |
| `max_concurrent_sweeps` | 0011 | sweep concurrency floor (§A.5.3/.4) | **KEEP** |
| `sales_lane_active` | 0046 | the sales-lane kill switch (7A-R1) — unrelated to the daily cap | **KEEP, out of scope** |
| `sales_admission_daily_cap` | 0046 | the 15/day quota (§A.5.5) | **DISPOSE** |
| `sales_admission_watermark` | 0046 | the backfill-batch door (7A-R5), untouched by this ruling | **KEEP, out of scope** |

**The second limits table, for completeness** (it was missing from v1 entirely):
`clara.firm_document_limits` (`0007:364-371`) — `docs_per_day` (100),
`pages_per_day` (1000), `ocr_concurrency` (2), plus `llm_witness_concurrency` (2, added
by `0090`). Readers: §A.5(6), (7), (8). **Disposition: none in this item** — the two
concurrency columns are KEEP by the ruling's own carve-out; the two day-budget columns
are the open owner item (§A.5's closing paragraph). No column of this table is dropped by
F-A9.

**The reader sweep, re-scoped (re-cut at gate 1).** v1 said the disposition table was
"exhaustive, not a sample" on a grep of `apps/dashboard` + `packages/runtime` only. That
universe is wrong for a DDL decision: the columns' loudest readers live in
`packages/db/tests`, and the sweep now covers `packages/db` (tests, seeds, deploy) as
well. Re-run, the five names have **zero** hits in `apps/dashboard` and
`packages/runtime` (v1's claim holds for that half) and the following hits in
`packages/db/tests` — **eight files, three classes, all of them PR-1B's own work**:

| class | files:lines | what PR-1B must do |
|---|---|---|
| (a) **fixture-only** — write or name a dropped column while proving something else | `wave-a-budget.test.mjs:34-45` (`setFirmLimit` writes all three), `:210`; `wave-b/wb-r2.test.mjs:272,276`; `x46-blind-contract.test.mjs:781`; `x47-settle-guard-identity.test.mjs:69-76`; `x54-transient-attempt-residual.test.mjs:42-45` | drop the column from the fixture write; the cell's own assertion is unaffected |
| (b) **premise-is-the-gate** — the cell PROVES a refusal this item removes | `wave-a-budget.test.mjs` (the two `refused_budget` cells, ~`:123-141` and `~:152-161`), `x46-blind-contract.test.mjs:789` (`refused_sales_cap`) | INVERT into C.10/C.11's positive-by-absence shape (law 31: the old cell is the pre-change half of the proof, run once against the pre-migration body, then replaced) |
| (c) **shape contract** — positively asserts the column EXISTS | `wave-a-shape.test.mjs:82-83` (`fl.has("sweep_budget_share")`), `:89-92` (its 0.60 default via `information_schema`) | delete those two assertions; a Slice-4 contract cell for a column the owner ruled dead is not a contract any more |
| (d) **outcome rosters** — closed-world allowlists the rename extends | `wave-a-helpers.mjs:217` (`ADMIT_OUTCOMES`, asserted at `wave-a-admission.test.mjs:59,79` and `wave-a-second-run.test.mjs:55`), `:213` (`ITEM_OUTCOMES`) | add `refused_concurrency`; keep `refused_budget` (history rows still carry it — law 6) |

`0048:188-190` names `wave-a-budget.test.mjs` as the battery pinning the concurrency
bound specifically, so class (b)'s inversion must leave that pin standing — it is the
KEEP half of the census.

### A.8 · No price table, no spend evaluator, anywhere

Grepped the full migration tree for `model_price|price_table|token_price|per_token|
cost_cents` (0 relevant hits — the ten incidental hits are unrelated asset/adjustment
pricing, none of them LLM spend). **F-A9-OQ-3 ("what is 'the money' number") is fully
open today**: `llm_usage_events` records tokens; nothing anywhere multiplies them by a
price. TA-P2 A+'s "calculations" origin — "model spend = tokens × a versioned price
table" — has no substrate to attach to yet.

### A.9 · No monthly rollup surface exists

Grepped `apps/dashboard` for every `firm_limits`/usage column name and for
`firm_usage_daily|task_usage\b`: zero hits. **TA-P13-OQ-2's "which screen, for whom" is
also fully open** — there is no reader of any kind (dashboard or otherwise) over
per-firm or per-client model spend today; "visible" (law 76) has nothing built to make
visible.

### A.10 · The reference-table read idiom this design should match

`clara.sst_threshold_schedule` (`0016_a21_compliance_watch.sql:237-244`) is the
estate's live precedent for "an effective-dated policy table, system-maintained." Its
RLS is FORCE-enabled with **only** the owner policy (`0016:398-411`'s loop, applying
`p_%s_owner … using(true)` to `sst_threshold_schedule` among others) — **no direct
`clara_authenticated` grant**. Every read in the file goes through a typed,
`clara_fn_owner`-owned evaluator function (e.g. `0016:1075`), never a raw table SELECT
from an app role. `0016:5216-5228`'s tail census independently asserts no granted
function writes it. This is the shape a new `llm_price_table` should copy: reads via a
typed function, not a table grant — `llm_usage_events` itself is the exception in this
estate (tenant-scoped data gets a direct scoped grant, `0094:83-85`; a firm-agnostic
reference table does not).

**The half of the idiom v1 copied wrong** (gate fold GB-3): "typed function" in this
estate means a `clara_fn_owner`-owned **SECURITY DEFINER** function — `0016:1075` is one.
A SECURITY *INVOKER* function or view over the same table is not the idiom, it is a dead
read path: a `security_invoker` relation makes the CALLER's grants govern every joined
relation, and the base-table GRANT check runs BEFORE RLS is ever consulted, so a
`clara_authenticated` session raises `42501 permission denied for table
llm_price_table` rather than being narrowed by RLS. `clara_authenticated` is the only
role a human session ever holds (`apps/dashboard/app/chat/api.ts:5`; PostgREST's single
`authenticator` login SETs ROLE from the JWT claim, `0006:72`,
`deploy/storage-provision.sql:57-58`) and it does not inherit `clara_fn_owner`
(`0002:112`, `inherit false`). Design §3.6/§3.7 is re-cut accordingly.

**The estate's owner-only DOOR idiom, for §3.5's approval verb.** It is not a
role-restricted EXECUTE grant. `clara.grant_firm_capability` (`0056:1130-1176`) is the
worked example: EXECUTE granted coarsely, `clara._human_ctx(clara.role_rank('viewer'))`
for identity, then an explicit positive read of `firm_memberships` for
`role='owner' and status='active'` as the REAL floor (`:1137-1142`, CLR04), then
`_reserve_op` → `_audit` → `_finish_op`. `0063:24-33` (the RS name-only lift) is the same
shape; `rig-meta.mjs:63` states the rule in one line — "coarse grant to
`clara_authenticated`; role floors are body-enforced".

---

## B · The seven-plus binding findings that bind the design

1. **Two disjoint "task" concepts, one FK.** `llm_usage_events.task_id` can only ever
   reach `document_processing_tasks`; `agent_tasks` (chat/wake) is structurally
   unreachable through it, nullable or not (§A.3). A second, independent nullable
   reference is required, not a relaxation of the existing one.
2. **Chat records nowhere the new ledger can see.** `settle_chat_turn` writes only the
   retiring ledger (§A.4) — the single highest-volume lane, by TA-P13's own text, is
   invisible to the "one ledger of record" until it is deliberately wired in.
3. **The unattended admission function is a seven-generation, three-times-dynamically-
   spliced live body** (§A.5.3-4; corrected this pass, was undercounted as "five-times-
   spliced" — `0053`'s own re-admit-after-withdrawal splice was missed) — its true tip
   is a rig-replay fact, not a migration-source fact (standing caveat).
4. **One outcome string, three unrelated meanings.** `'refused_budget'` covers
   concurrency, the token-budget cap and the sales-count cap (§A.5, §A.6); a rename
   that only reaches one migration's source text would leave the dashboard tile and
   two other refusal sites still lying.
5. **`firm_limits` carries three dead-after-ruling columns whose only PRODUCT readers are
   the retiring gates** (§A.7) — safe to dispose once those readers are gone, not before;
   but **eight `packages/db/tests` files read them too**, in three distinct classes, and
   two of those cells exist to PROVE the refusals this item removes. Disposing the
   columns is therefore also a decision about what the estate still proves (§A.7's
   re-scoped table) — PR-1B's work, not a mechanical roster edit.
6. **No price table and no spend evaluator exist** (§A.8) — TA-P2 A+'s calculation
   origin for model spend has no substrate; this design must build it, not adapt one.
7. **No monthly-visibility surface exists at all** (§A.9) — "meter, never cap" (law 76)
   has a meter with nothing reading it.
8. **`witnessFacts.v1.dispatch.mjs` is live-frozen code despite its filename** (§A.2) —
   any edit to the shared usage-recording call site inside it needs a new `_v3`, which
   is exactly the cost this design chooses to avoid (design §3.1's "why the old verb's
   body is never touched").
9. **There is a SECOND per-firm limits table** (`firm_document_limits`, §A.7) and it
   carries two live per-UTC-day budgets whose own migration comment calls them the firm's
   vendor spend (§A.5(6)-(7)). The census is eight gates, not three; two of them are
   unclassified pending an owner ruling on TA-P12's reach (design §4).
10. **The estate's "typed function" and "owner door" idioms are DEFINER-shaped, not
    invoker- or role-shaped** (§A.10) — a SECURITY INVOKER read over an ungranted table
    and an EXECUTE grant to a role no human session holds are both dead paths in this
    estate, and v1's §3.6/§3.7/§4 specified one of each.

## C · Closed-world censuses that will break or need extension

- **`packages/db/tests/x42-s5-helpers.mjs:146-177`** — `S5_25_BARE_TOKEN_ROSTER`
  (**re-described at gate 1; v1's description of this census was wrong in three ways and
  the instruction it gave would have turned the census RED**). What it actually is: a
  regex (`:146-147`) MEASURES, from the live catalog, every `clara` function whose body
  reads a bare clock token; the array at `:161-177` is the expected set; the two are
  compared as an **exact set equality in both directions**
  (`x42b2-s5c-clock.test.mjs:376-380`, `x42b2-r7-s5-clock.test.mjs:200-214`). Three
  consequences v1 got backwards:
  1. **Adding a name is only correct if the body really reads a clock.**
     `record_agent_usage_event` does NOT (its sibling's `created_at` is a table default,
     `0094:64`, and its INSERT never names the column) — nor do the price verbs or the
     rollup read as designed. **Appending them reddens the equality with a one-name
     diff.** F-A9 appends NOTHING to this roster unless the built body actually matches
     the regex, measured, not predicted.
  2. **A body edit DOES perturb it.** `begin_chat_turn` is on the roster only because of
     `v_today` (`0006:930`), whose only uses are inside the block PR-0 removes — so
     **PR-0 must remove `begin_chat_turn` from the roster in its own PR**, or the next
     estate run goes red. (`admit_autodraft_task` is safe both ways — §A.5(5).)
  3. **Any addition must be frontier-gated.** The helper's own comments (`:149-160`,
     `:401-434`) warn the next name-adder: cohorts are gated behind an
     `appliedStem('00NN_%')` check (the `WITNESS_F_A1_CLOCK_NAMES` /
     `SALES_LANE_0046_CLOCK_NAMES` pattern) precisely so a Postgres pinned at an earlier
     frontier does not see a name from a migration it has not applied. An ungated append
     reddens `db-slice-frontiers` (`.github/workflows/ci.yml:360`, weekly sweep +
     manual dispatch — so it fails LATER, not on the PR).
- **`packages/db/tests/rig-meta.mjs:57,247-249,934`** (corrected this pass — the
  earlier `176-177` cite pointed at an unrelated render-job roster, grep-confirmed) —
  separate name rosters for autodraft-family functions (`WAVE_A_RUNTIME_FNS`, `:56-59`,
  `admit_autodraft_task` named at `:57`), F-A1's own additions
  (`WITNESS_F_A1_RUNTIME_FNS`, `:247-249`: `record_llm_usage_event`,
  `persist_witness_facts`, `witness_citation_regions`), and table names (`:934`:
  `"firm_limits", "firm_usage_daily", "task_usage", …`). New F-A9 functions need their
  own entries; the table-name roster at `:934` is the one that will need editing
  **when** (not if) `firm_usage_daily`/`task_usage` are physically dropped in the
  follow-up PR (design §3.9) — not in PR-1, which only stops reading them.
- **Consumers of `rig-meta.mjs`** — `rig-docs-meta.mjs` and `rig-runtime-meta.mjs` (per
  F-A2's own citation of the same consumption chain) re-derive from the rosters above;
  they need no independent edit, only the source rosters do.
- **`apps/dashboard/app/shared/reviewCardTypes.ts` / `SweepReceiptCard.tsx`** — not a
  rig census, but a typed dashboard surface that will render a misleading label once
  the string's population changes (§A.6); named here because it is exactly the kind of
  surface a name-keyed sweep (rather than a verb/string-keyed one) would miss.
- **`packages/db/tests`' own fixtures and gate cells** — the eight files in §A.7's
  re-scoped table. Not a name roster, but closed-world in the same way: a dropped column
  or a renamed outcome string reddens them mechanically, and two of them PROVE the
  refusals this item removes, which is a judgement call about what the estate still
  proves — PR-1B's work, budgeted there, not a mechanical roster edit.
