# F-A9 — Metering: design v2

> Design doc of record for Wave-F Track A item **F-A9** (`docs/plan/active/wave-f-contract.md`
> §F-A9, lines 347-378; slug `metering`). **v2, 2026-08-22 — gate 1 folded
> (record: `metering-gate-record.md`).** Ruled shape: **TA-P13 = A**
> (one ledger), **TA-P12 = A** (the brake census), **TA-P2 = A+** (spend as a versioned-
> policy-table calculation) — all owner rulings, 2026-08-22 sitting
> (record of record `docs/adr/0074-the-track-a-sitting.md`; member tables in
> `docs/plan/active/track-a-sitting-3.md`). Binds under digest **law 76/§9** (meter, never
> cap), **law 16** (effective-dated policy tables), **law 1** (the DB owns every
> authoritative number), **law 6** (reverse-not-delete / append-only), **law 22** (a
> visible record must not lie). Every build PR takes the uniform ADR-061 ladder;
> **the brake-census removal (§3.3) and the `firm_limits` disposition (§3.4) are
> judgement logic** (review law 1 — they decide which live refusal an operator still
> sees) and get an independent review pass before merge.
>
> **Companion**: `metering-survey.md` v2. **Annex**: `metering-annexes.md` v2 (A decision
> register · B build sequence + D1 list + sequencing · C battery · D risks/non-goals ·
> E change log · **F the price machine in full**). **Gate record**:
> `metering-gate-record.md`.
>
> **What gate 1 changed.** Four blockers and six materials bind this version: the brake
> census was not closed-world (a second limits table with two live per-day vendor-spend
> budgets was missing); the sales-cap removal was unbuildable in both readings; the
> priced read path could not return a row for the only role that would call it; and the
> spend evaluator's join was session-`TimeZone` dependent — a "deterministic evaluator"
> whose money number moved with the caller's GUC. **PR-1 is severed** (§5): exactly one
> limb takes a D1 write-quiesce window.

## 1 · The ruled shape (fixed, not designable)

- **TA-P13 = A — one ledger.** `clara.llm_usage_events` (F-A1) becomes the SOLE record
  of per-call usage, reshaped to hold ANY call kind: the two mandatory FKs become
  nullable, and a call-kind discriminator is added. **`client_id` + a triggering-actor
  column are added NOW, nullable** — the ruling names this irreversible if missed
  (months recorded without them can never be split per client). Every future lane
  (F-A2/F-A6/F-A7b/F-A8) records through this one ledger. The Slice-4 daily/per-task
  usage ledger (`firm_usage_daily`, `task_usage`) and its reserve/reconcile machinery
  RETIRE once TA-P12's gates are gone — **this deletes live real data; the owner's
  choice of A is recorded as that sentence** — and schema retirement rides its own
  reviewed migration (§3.9). `firm_limits`' dead cap columns are disposed with it. No
  cross-firm operator view (no UI, no new role); the model is not hard-wired to one firm.
- **TA-P12 = A — the brake census.** Every live usage gate is listed and classified
  KEEP/REMOVE (survey §A.5). REMOVE: the chat daily token hard-cap (as a **hotfix ahead
  of F-A9** — it is already-violating live behaviour), the unattended lane's
  `refused_budget` at 60%/100%, the 15-drafts/day unattended sales quota. KEEP: the
  concurrency floors (3 concurrent runs / 2 concurrent sweeps) — engine protection, not
  spend (law 76's carve-out). **Mandatory rename**: the engine-protective refusal must
  stop sharing the `refused_budget` string — history rows stay, read surfaces explain
  the two spellings.
- **TA-P2 = A+ — calculations are automatic.** "Model spend = tokens × a versioned price
  table" is the worked example of TA-P2's CALCULATION origin. ~~Clara fetches official pricing sources and
  DRAFTS a price row; it lands through an **audited owner one-click door** (not a PR) with two mechanical
  checks.~~ **RULED 2026-08-23 (R-L19): price rows are DEVELOPER-SEEDED — a versioned, effective-dated
  migration seed through the full PR ladder; a price change is a ticket/PR.** Rows are immutable +
  supersede; a missing row for the day REFUSES, never carries forward. Monthly per-firm
  AND per-client visibility; meter never cap (law 76, "per-call usage", no LLM
  qualifier).

## 2 · The estate findings that bind §3 (survey §B, in full — cites there)

1. Two disjoint "task" tables, one FK — `agent_tasks` (chat/wake) is unreachable through
   the live `task_id` FK, nullable or not. · 2. Chat records nowhere the new ledger can
   see. · 3. `admit_autodraft_task` is a seven-generation, three-times-spliced live body;
   its tip is a rig-replay fact. · 4. `'refused_budget'` covers three unrelated meanings
   across two tables and a dashboard tile. · 5. `firm_limits`' three dead-after-ruling
   columns also have **eight `packages/db/tests` readers in three classes** (re-scoped at
   gate 1). · 6. No price table or spend evaluator exists. · 7. No monthly-visibility
   surface exists. · 8. `witnessFacts.v1.dispatch.mjs` is live-frozen code inside
   `witnessFacts_v2` despite its filename.
2. **New at gate 1 — 9.** A SECOND per-firm limits table exists (`firm_document_limits`)
   carrying two live per-UTC-day budgets the migration's own comment calls the firm's
   vendor spend, plus two concurrency floors: **eight live usage gates, not three.**
   **10.** The estate's "typed function" and "owner door" idioms are both SECURITY
   DEFINER with a body-enforced floor — not a SECURITY INVOKER read, not a
   role-restricted EXECUTE grant; `clara_authenticated` is the only role a human session
   ever holds.

## 3 · The design

### 3.1 · The ledger reshape — `clara.llm_usage_events`, ALTER in place, name unchanged

**Decision (Annex A, D1):** the table keeps its name — renaming a live, forced-RLS,
triggered, tenant-scoped table for cosmetics the ruling never asked for is churn;
`call_kind` carries the semantics now.

**New columns** (all additive; `document_id`/`task_id` relaxed):

| column | type | default | wall |
|---|---|---|---|
| `document_id` | uuid | — | **NOT NULL dropped** (was `0094:56`); FK unchanged (MATCH SIMPLE skips on NULL) |
| `task_id` | uuid | — | **NOT NULL dropped** (was `0094:57`); FK unchanged, same MATCH SIMPLE behaviour |
| `channel` | text | — | **NOT NULL dropped**; CHECK becomes `channel is null or channel in ('text','vision')` |
| `call_kind` | text | `'document_extraction'` | CHECK against the roster below; NOT NULL (a call always has a kind, even the legacy one) |
| `client_id` | uuid | null | FK `(client_id,firm_id)` → `clara.clients(id,firm_id)` (the same composite shape `documents`/`journal_entries` already use, `uq_clients_id_firm`, `0007:59`) — nullable so an attribution-pending or firm-wide call still records |
| `triggering_actor` | uuid | null | FK → `clara.users(id)`; the human who caused the call, when there is one |
| `agent_task_id` | uuid | null | FK → `clara.agent_tasks(id)` (simple; firm consistency is a manual positive check in the writer, per finding 1 — no composite unique on `agent_tasks(id,firm_id)` alone exists to FK against) |
| `via_wake_kind` | text | null | free text, mirrors `entry_post_receipts.via_wake_kind` (F-A2 design §3.3) — the wake kind when the call was unattended |

**The shape wall — the one new CHECK that matters most:**
`ck_llm_usage_events_extraction_shape: call_kind <> 'document_extraction' or
(document_id is not null and task_id is not null and channel is not null)`. Without it,
relaxing the three NOT NULLs silently removes a safety net the ORIGINAL author relied
on: `record_llm_usage_event`'s nit-3 comment (`0094:107-108`) reads *"both columns are
NOT NULL on the table, so the FKs catch that case with their own error"* — false the
moment the table relaxes, unless a replacement wall takes over exactly that case. It is
call-kind-scoped, which is the point of the reshape: every OTHER kind may omit what a
document-extraction call cannot.

**The call-kind roster (extend-only, closed enum, mirrors the `wake_credentials`
CHECK-extension idiom — F-A2 design §3.7.2):** `document_extraction` (live, F-A1) ·
`chat` · `unattended_posting` (F-A2's own coder, distinct from chat) · `freeform_read`
(F-A6) · `interview_extraction` (F-A7b) · `filing_attribution` (F-A7a) · `web_fetch`
(F-A8 tier 2) · `tier1_policy_fetch` (F-A8 tier 1) · `reporting` (F-A5). Each later
item's own design adds its value via a one-line CHECK extension: `call_kind` is
descriptive metadata, never authority-bearing, so widening it is not a
"narrows an enumeration" hazard.

**`client_id` resolution is per-lane, never backfilled by a trigger** (Annex A, D4).
Lanes holding a client at record time pass it; legacy `document_extraction` rows are
resolved by the rollup joining `documents` (whose own `client_id` is nullable,
`0003:67`) where the stored value is null and `document_id` is not — a computed join,
never a driftable stored copy. An unattributed document's spend rolls up under
"unattributed", which is visibility, not a gap to paper over.

### 3.2 · Two doors into one ledger, not one door with a changed identity

**Rejected: widening `record_llm_usage_event`'s own signature** (Annex A, D2). A
function's IDENTITY in Postgres is its full declared parameter type list, so trailing
DEFAULTed parameters would break every
`to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)')`
capability probe — including the two INSIDE live frozen closures
(`witnessFacts.v1.dispatch.mjs:86`, imported unchanged by `witnessFacts_v2`, survey §A.2;
`statementFacts.v2.dispatch.mjs:68`). Fixing those probes costs a new frozen `_v3` of
BOTH workflows for zero behaviour change. **Adopted instead: the old verb stays
byte-identical and a new sibling carries the new shape** — TA-P1's own rider (new
authority ships as a sibling verb, never a rewrite of a live body) applied to a
signature-identity hazard: zero blast radius, at the cost of one extra small function.

- **`clara.record_llm_usage_event(...)` — UNCHANGED, 10-arg, byte-identical.** Its INSERT
  never names `call_kind`, so its rows take the column DEFAULT `'document_extraction'` —
  correct: its only two live callers are exactly that kind. **No D1 obligation.**
- **`clara.record_agent_usage_event(p_firm uuid, p_call_kind text, p_engine_id text,
  p_outcome text, p_client uuid default null, p_document uuid default null,
  p_document_task uuid default null, p_agent_task uuid default null,
  p_triggering_actor uuid default null, p_via_wake_kind text default null,
  p_channel text default null, p_prompt_hash text default null,
  p_input_tokens int default null, p_output_tokens int default null,
  p_duration_ms int default null) returns uuid`** — the general door every future lane
  calls. Walls: `p_call_kind` **must not** be `'document_extraction'` (CLR10 — one
  call-kind, one door, TA-P11's one-architecture instinct); `p_document`/
  `p_document_task` consistency re-uses `0094:109-113`'s positive-read pattern;
  `p_agent_task`, when given, is checked against `agent_tasks.firm_id` by a manual
  positive read (no composite FK exists, per finding 1); `p_triggering_actor`, when
  given, must be an ACTIVE `firm_memberships` row of `p_firm` (mirrors
  `begin_chat_turn`, `0006:938-940`); `p_client`'s firm consistency is structural
  (the new composite FK). **NO SPEND REFUSAL ANYWHERE**, in the body's own comment —
  same law-76 posture as its sibling. Grant: EXECUTE to `clara_runtime` only, no PUBLIC.
  **Brand-new object; no D1 obligation (the 0094 precedent).**

### 3.3 · The brake census, executed (TA-P12)

**Eight gates, not three** (re-cut at gate 1 — the census now sweeps BOTH per-firm limits
tables, `firm_limits` and `firm_document_limits`; survey §A.5 carries the derivation and
every byte cite):

| gate | live site | disposition | batch |
|---|---|---|---|
| 1 · Chat daily token hard-cap | `begin_chat_turn`, `0006:967-974` | **REMOVE** the block. The limits read at `:963-965` is a SHARED select — it must be **rewritten** to load `max_concurrent_runs` alone, never deleted (the KEPT concurrency check reads `v_run_cap` from it, and leaving `daily_token_limit` in it strands a read of a column PR-1B drops). Three declarations die with the block: `v_token_limit`, `v_tokens_used`, and **`v_today` (`:930`)** — dropping `v_today` takes `begin_chat_turn` OUT of the bare-clock-token roster, so PR-0 edits that roster in its own PR (survey §C) | **PR-0, hotfix, own D1 window, ships ahead of F-A9** |
| 2 · Chat concurrent compute-run cap | `begin_chat_turn`, `0006:976-985` | **KEEP**, byte-unchanged | — |
| 3 · Unattended token-budget 60%/100% | `admit_autodraft_task`, `0011:2555-2566` / live text `0036:1408-1417` (both predictions; the tip is a rig-replay fact) | **REMOVE** the block | PR-1B |
| 4 · Unattended concurrency floor | `admit_autodraft_task`, `0011:2543-2554` / live text `0036:1397-1407`, + `0048:172-192`'s own-run fix | **KEEP** the bound; **RENAME** the outcome/reason string `'refused_budget'` → `'refused_concurrency'` (new value on the `sweep_run_items.outcome` CHECK, drop+add, ACCESS EXCLUSIVE, validates trivially — every existing row keeps its historical string; only future rows use the new one) | PR-1B |
| 5 · 15-drafts/day sales quota | `admit_autodraft_task`'s 0046 splice — **three constructs, not one range** (survey §A.5(5)'s table): REWRITE `0046:2223-2225`, UNTOUCHED `:2226-2242`, REMOVE `:2245-2259` (all predicted) | **REMOVE the cap only.** The shared select is rewritten to read `sales_admission_watermark` alone; the 7A-R5 backfill door keeps its `sales_backlog_held` refusal byte-for-byte. **Order-dependent**: the rewrite lands ahead of §3.4's column drop in the same file. **Untouched**: `sales_lane_active`, `sales_backfill_batches`, `sales_admission_watermark`, `sales_backlog_held` | PR-1B |
| 6 · Document ingest per-UTC-day docs/pages | `_reserve_document_ingest`, `0007:1638-1650` (`docs_per_day`, `pages_per_day` on `firm_document_limits`) | ~~UNCLASSIFIED — owner item (§4)~~ **RULED 2026-08-23 (owner): KEEP, re-classified ENGINE PROTECTION** — it bounds how much work the intake engine takes at once, which is law 76's own carve-out, the same class as gates 2, 4 and 8. **MANDATORY RENAME with it:** the refusal must stop sharing the `refused_budget` string (law 22 — a visible record must not lie about why it refused) | PR-1B (rename only; the bound is byte-unchanged) |
| 7 · Processing-call per-UTC-day pages | `_reserve_processing_call` live tip `0038:7063-7078`; its own comment (`:7056-7058`) calls the budget the firm's **vendor spend** | ~~UNCLASSIFIED — same owner item, same default~~ **RULED 2026-08-23 (owner): REMOVE** — its own author calls it the firm's vendor spend, so it is a SPEND brake and G8's meter-never-cap reaches it | PR-1B (the body joins the D1 list) |
| 8 · Document-processing concurrency floors | `claim_document_processing_task`, `0090:421-428` (`ocr_concurrency`) and `:434-442` (`llm_witness_concurrency`) | **KEEP** — engine protection, law 76's own carve-out, the same class as gates 2 and 4. No `outcome` string is involved (raised CLR18 only), so no rename obligation | — |

~~**If the owner rules gates 6/7 REMOVE**, two more live bodies join the D1 list…~~
**RULED 2026-08-23, and the answer is SPLIT, so only ONE body joins:** gate 7's
`_reserve_processing_call` is REMOVED and enters the D1 list; gate 6's `_reserve_document_ingest`
is KEPT as engine protection and is recut only for the `refused_budget` rename. **PR-1B's window
grows from one body to two, not three.** The census is now CLOSED-WORLD and complete: **eight gates,
four REMOVE (1 · 3 · 5 · 7) and four KEEP (2 · 4 · 6 · 8)** — and **two of the four KEEPs carry the
mandatory rename off `refused_budget`: gate 4 (`refused_concurrency`) and gate 6.** Gate 8 raises
CLR18 only and writes no outcome string, so it carries no rename.

**The rename's full surface** (law 22 — a visible record must not lie): the CHECK
extension on `sweep_run_items.outcome`; the concurrency block's own literal strings
(`reason`/the top-level jsonb `outcome`); `apps/dashboard/app/shared/
reviewCardTypes.ts:26,55` (`refused_budget` → `refused_concurrency` in the typed
summary, the coercion at `:55` updated to read the new key going forward while a
historical-rows explainer stays); `SweepReceiptCard.tsx:60`'s tile label ("over budget"
→ "engine busy" or equivalent — a one-line UI change, not a judgement-logic one).
History rows are append-only and untouched (law 6) — old `sweep_run_items` rows keep
`outcome='refused_budget'` forever, and the read surface says so rather than silently
re-labelling the past.

### 3.4 · `firm_limits` disposition — after the readers are gone, in the same window

DROP `daily_token_limit`, `sweep_budget_share`, `sales_admission_daily_cap` — **only
after** §3.3's bodies are already CoR'd earlier in the same migration file, so no live
function is left reading a column that no longer exists (the late-binding trap: PL/pgSQL
does not resolve embedded SQL against the catalog until first execution, so a stranded
read passes the migration and dies on the first real call). The dependency is strict for
two reads in particular: `begin_chat_turn`'s `:963-965` select (PR-0, earlier PR) and
`admit_autodraft_task`'s `0046:2223` shared select (gate 5, same file).

**Their two CHECKs are NOT dropped separately** (gate 1, nit).
`ck_firm_limits_sales_admission_daily_cap` (`0046:488-489`) and
`ck_firm_limits_sweep_budget_share` (`0011:633-634`) are single-column CHECKs, so
`DROP COLUMN` removes them; a literal `drop constraint` afterwards raises *constraint …
does not exist* and aborts the migration (reproduced on a scratch Postgres at gate 1).
Say they fall with their columns, or use `IF EXISTS`.
**`ck_firm_limits_max_concurrent_sweeps` (`0011:635`) is explicitly untouched**, as are
`max_concurrent_runs`, `max_concurrent_sweeps`, `sales_lane_active` and
`sales_admission_watermark` — and **no column of `firm_document_limits`** (gates 6-8).

**The eight test files that read these columns are PR-1B's own work** (survey §A.7's
re-scoped table): five fixture-only edits; one shape contract to delete
(`wave-a-shape.test.mjs:82-92` positively asserts `sweep_budget_share` EXISTS with its
0.60 default); two gate-behaviour cells whose PREMISE is the removed refusal, inverted
into C.10/C.11's positive-by-absence shape; two outcome rosters gaining
`refused_concurrency`.

### 3.5 · The price table + the owner one-click door (TA-P2 A+)

**The full DDL, the four verbs and their walls are in Annex F** (moved there at v2 to
keep this file inside its line budget; nothing was dropped in the move). The shape, and
the five things gate 1 changed about it:

- **`clara.llm_price_table`** — the estate's effective-dated-policy-table idiom
  (`sst_threshold_schedule`, survey §A.10): `(engine_id, effective_from)` primary key, an
  open-ended `effective_to`, a mandatory `source_note`, USD-only by CHECK, FORCE RLS with
  **only** an owner policy — no `clara_authenticated` grant, reads through a typed
  DEFINER function (§3.7).
- **Two range walls, house-idiom, no extension** (gate 1, GM-6): a CHECK that
  `effective_to >= effective_from`, and a partial unique index giving at most ONE
  open-ended row per engine. `btree_gist` is installed nowhere in this estate — the
  estate says so itself (`0056:266-269`; `0057:305-313` reaches the same conclusion), so
  an `EXCLUDE` over a `daterange` would add an extension to a ceremony. Contiguity by
  construction instead, with the residual overlap refused inside the only verb that can
  create one.
- **`clara.llm_price_proposals`** — the durable draft carrier (TA-P14's DoD: a proposal
  needs a home, not a chat sentence). Both new tables carry FORCE RLS + owner policy
  explicitly, no table grant on either.
- **Two checks, two columns, three states each** (gate 1, GM-1): `sources_agree` and
  `band_ok`, both nullable, NULL meaning *not checkable* — plus a `check_note` naming
  which check fired. v1 collapsed a source disagreement, a band failure and a
  brand-new-engine into ONE boolean: the identical "one string, three meanings" defect
  survey §A.6 raises against `refused_budget`, reproduced in the file that fixes it.
- **The checks are hygiene, not corroboration** — both numerals arrive as arguments of
  the same call from the same model turn; the DB never read either source, so a model
  that misreads a page twice passes "agreement" (review law 2, applied to our own
  design). **The owner's approval is the authority** that turns a model-typed numeral
  into a usable price (constraint 2; TA-P2's own pattern (2)). Annex F says this in the
  verb's own comment, so it cannot be lost in a later UI that renders only the flags.
- **Approve REFUSES a backdated `effective_from`** (gate 1, GM-6) — a restatement of a
  durable money number is its own owner act with its own record, never a side effect of
  approve. Annex F carries the two failure paths this closes.

**The door itself is the audited verb, not a screen** (TA-P2's "one-click" as this
estate uses the term — the same shape TA-P8 ships for the counterparty key, and law 61's
audited ceremony, which is screen-less by design). `propose_llm_price` returns the
proposal's uuid so Clara can hand the owner the exact id to approve. ~~**What is NOT settled is who may
execute approve at the DB layer — §4, and PR-1E is severed for it.**~~ **RULED 2026-08-23 (R-L19): the whole
propose/approve limb is DROPPED — price rows are developer-seeded migration data (§4).**

**Missing-day discipline (TA-P2, a wall, not a convention):** the evaluator (§3.6) never
carries a price past its `effective_to`; a call landing in a gap computes NULL spend,
never the nearest row's value — a visible "unpriced" count, not a silent guess.

### 3.6 · The spend evaluator — a versioned deterministic calculation (law 1)

`clara.llm_usage_events_priced` — a view computing, per usage row:
`spend_cents = round((coalesce(input_tokens,0)::numeric *
input_price_cents_per_million_tokens + coalesce(output_tokens,0)::numeric *
output_price_cents_per_million_tokens) / 1000000)`. A row with no matching price returns
`spend_cents = null` — never zero, never the nearest neighbour's rate. This is the
"versioned deterministic evaluator … from DB-owned inputs" law 1 asks for: the
CALCULATION lives in one named, reviewable SQL object, not scattered inline arithmetic
in a dashboard query.

**The join is anchored to UTC explicitly** (gate 1, GB-4 — v1's form was not
deterministic):

```
on p.engine_id = u.engine_id
and (u.created_at at time zone 'utc')::date >= p.effective_from
and (p.effective_to is null or (u.created_at at time zone 'utc')::date <= p.effective_to)
```

v1 compared a `timestamptz` (`created_at`, `0094:65`) against a `date`
(`effective_from`/`effective_to`). Postgres resolves that by casting the date to
`timestamptz` at midnight **in the caller's session `TimeZone`** — so a call recorded
2026-09-01 03:00 UTC prices against September's row for a UTC session and August's for
an Asia/Kuala_Lumpur one. Two different money numbers out of one "deterministic
evaluator", with no error anywhere, exactly on the boundary day where a price change
lands. Nothing in this repo pins a session `TimeZone` (grep-confirmed: no `SET TimeZone`,
no `ALTER DATABASE/ROLE … TimeZone`), and the estate's own idiom is the explicit cast
(`0006:930`, `0007:1644`) with a five-zone hostile battery
(`x42b0-s5c-clock.test.mjs:88-93`) policing exactly this class. C.21 adds that battery
cell here.

**The view is `security_invoker = false`** (i.e. owner-executed), reached only through
§3.7's DEFINER function — never granted to `clara_authenticated` directly. See §3.7 for
why the invoker form was a dead read path.

### 3.7 · The monthly rollup — visible, per-firm and per-client, not hard-wired to one firm

`clara.get_llm_usage_summary(p_firm uuid, p_period date, p_client uuid default null)
returns table(call_kind text, calls bigint, input_tokens bigint, output_tokens bigint,
priced_calls bigint, unpriced_calls bigint, spend_cents bigint)` — **SECURITY DEFINER,
owned by `clara_fn_owner`**, over `llm_usage_events_priced`, grouped by `call_kind`,
`client_id` resolved per §3.1's join rule for extraction rows. EXECUTE granted to
`clara_authenticated`; the firm wall is the FIRST statement of the body:

```
if p_firm is distinct from clara.jwt_firm() then
  raise exception 'usage summary is readable for your own firm only'
    using errcode = 'CLR11', detail = '{"reason":"client_not_in_firm"}';
end if;
```

**Why DEFINER, and what changed at gate 1 (GB-3).** v1 specified a SECURITY INVOKER
function over a SECURITY INVOKER view, reasoning that "RLS already confines a normal
caller". It does not get that far: an invoker relation makes the CALLER's grants govern
every joined relation, and the base-table GRANT check runs **before** RLS is consulted —
so a `clara_authenticated` session (the only role a human session ever holds,
`apps/dashboard/app/chat/api.ts:5`, non-inheriting per `0002:112`) raises
`42501 permission denied for table llm_price_table` on **every** priced read, and battery
cell C.19 could not pass as written. The estate's typed-read idiom is DEFINER
(`0016:1075`), and §3.5's own D5 already ruled "typed function only, no table grant" —
v1's invoker wording contradicted its own decision rather than implementing it.

**The consequence for `p_firm`, stated because v1 said the opposite:** under DEFINER,
RLS no longer narrows the caller, so **`p_firm` IS the boundary** and the body's own
check above is the wall. C.19 is re-cut to prove that wall (firm B naming firm A's id is
REFUSED, not silently narrowed) instead of proving an RLS behaviour that no longer
applies. **"Not hard-wired to a single
firm"** means the function's own shape groups by firm/client rather than
assuming one firm's row is the only row that can exist, so a future genuinely
cross-firm operator surface (its own item, its own role, its own review — named as a
non-goal, Annex D) would call the SAME function per firm, not need a rewrite.
**No dashboard page ships in this design** — the read exists; the screen does not
(TA-P13-OQ-2 is left open, §4).

### 3.8 · Chat retrofit — wiring the highest-volume lane into the one ledger

**The function is `runModelSegmentStepV12`, not `runChatTurnModel`** — the v1 draft named
a function that exists nowhere in `packages/` (grep-confirmed, zero hits); the "spelling
is not identity" law applies to a design's own citations as much as to a guard. *(v2
finished the correction: survey §A.4 and §5's build step still carried the dead name
after v1's self-review — gate 1, nit.)* The real
shape, at the bytes: `runModelSegmentStepV12` (`chatTurn.v12.impl.ts:95-160`) already
takes `taskId`, `model`, `clientId`, `firmId`, `createdBy` as its first five parameters,
so all five are in scope at the point `usageTokens` is computed (`:146-149`) from the
AI SDK's `usage.inputTokens`/`usage.outputTokens` before they collapse into one total.
Its sole caller, `chatTurn_v12` (`chatTurn.v12.ts:88-89`), holds the same five values
(off `task`, loaded at **`:80`**) immediately after the call returns, one line before
`checkpointStep`. **The call site is inside the segment LOOP** (`chatTurn.v12.ts:87`,
`for (; segment < MAX_SEGMENTS; segment++)`), so the retrofit records **one row per
model call**, not one per turn — which is what "per-call usage" means and what the
sibling verb already does for extraction. The retrofit adds one call — inside
`runModelSegmentStepV12` right after `usageTokens` is computed, or at the caller right
after it returns; either is the same frozen closure — `clara.record_agent_usage_event(
p_firm := firmId, p_call_kind := 'chat', p_engine_id := model, p_outcome := <mapped from
finishReason>, p_client := clientId, p_agent_task := taskId, p_triggering_actor :=
createdBy, p_channel := null, p_input_tokens := usage.inputTokens, p_output_tokens :=
usage.outputTokens)` — mirroring where `witnessFacts.v1.dispatch.mjs` and
`statementFacts.v2.dispatch.mjs` already call the sibling verb (survey §A.1).
**This edits a live frozen closure**
(`chatTurn.v12.impl.ts`/`chatTurn.v12.ts` under `chatTurn_v12`, confirmed the live tip
via `registry.ts:46`, per `.claude/rules/runtime-workflows.md`), so it ships as a new
`chatTurn_vN`, never a v12 patch. **The exact `N` is not claimed here** — workflow
version numbers, like migration numbers, are claimed at merge. **The dependency is
one-directional and dated**: the owner's D34 ruling put chat parity back on F-A2's main
train, so F-A2's PR-2 claims `chatTurn_v13` (`f-a2-agentic-posting-design.md` §5 step 4)
— F-A9's PR-2 therefore claims `v14` or later, **after** that merge, never racing it.
Annex B carries it as a sequencing obligation, not an assumption.

**Sequencing consequence, stated as a wall on §3.9, not a suggestion:** the old ledger
(`firm_usage_daily`/`task_usage`) may not be physically dropped until this retrofit is
live — otherwise the highest-volume lane's spend visibility regresses to zero with no
record of the regression (survey finding 2).

### 3.9 · Schema retirement — its own reviewed migration, deliberately deferred

TA-P13's own wording separates "the gates are gone" from "schema retirement rides its
own reviewed migration." This design honours that split rather than folding both into
PR-1:

- **PR-1B stops reading `firm_usage_daily`/`task_usage` FOR BUDGET PURPOSES** — §3.3's
  removed blocks are their only remaining BUDGET readers, **but not their only readers**
  (corrected at gate 1, GM-4: v1 and Annex A's D8 both claimed the write side would have
  no reader after PR-1, which is false at the bytes). **`clara.settle_chat_turn` still
  READS `task_usage` at `0006:1025`** — the terminal-replay receipt carries the stored
  token count — and still WRITES both tables (`:1048-1050`, `:1054-1057`). PR-1B does not
  touch it. The reserve/refund increments in `admit_autodraft_task`,
  `settle_autodraft_task` (both overloads) and the retry-door refund logic (`0034`,
  `0036`, `0053`) also keep writing. Harmless, wasteful, and explicitly named rather than
  silently left (a "why the ruling isn't fully executed yet" line, not an oversight) —
  and §3.9's condition (3) cross-check has a named source precisely because something
  still reads and writes there.
- **PR-4 (owner-gated, its own D1 window) drops the write side and the two tables** —
  gated on THREE checkable conditions: (1) §3.3's read-side removal is live and stable;
  (2) §3.8's chat retrofit is live (chat's spend has a home in the new ledger); (3) a
  bake period has passed with the new ledger's monthly numbers cross-checked against the
  old one's last live figures, so the drop is not also the first time anyone looked.
  **`settle_chat_turn` is on PR-4's body list** (Annex B) — dropping the tables without
  recutting it kills every ordinary chat-turn settle, the highest-volume lane's
  completion path. `rig-meta.mjs:934`'s table-name roster is edited here, and the owner's
  "this deletes real data" sentence is spent here.

## 4 · Owner questions not settled here (recommendation + fail-closed default)

- ~~**WHICH human may approve a price proposal, and how is that gated at the DB layer?**~~
  **RULED 2026-08-23 (owner) — R-L19. The question is DISSOLVED, not answered: price rows are
  DEVELOPER-SEEDED PLATFORM DATA.** A price is a versioned, effective-dated **migration seed**
  that lands through the **full PR ladder**; **a price change is a ticket and a PR**, reviewed
  like any other migration. Consequences: **PR-1E (`approve_llm_price_proposal` + D17's owner
  floor) is DROPPED, not deferred**, and **the "Clara drafts a price proposal" limb is dropped
  with it** — with no proposal there is no approval door, and the cross-tenant "owner of WHICH
  firm" question disappears rather than being settled. The **evaluator prices from the seeded
  rows**, and the **unpriced-count rollup STAYS as the tripwire**: a call whose day has no
  effective row still publishes as *unpriced*, never a guess. The withdrawn v1 recommendation
  and GM-5's role-dodge finding are recorded in `metering-annexes.md` Annex A (D17) — the
  reason the door was designed and then never built.
- **Do TA-P12's REMOVE classes reach the document/processing lane's per-UTC-day doc and
  page budgets?** (§3.3 gates 6-7, new at gate 1.) The ruling enumerated three gates and
  opened with "at least three", so it reads as a floor, not an exhaustive list — and
  `pages_per_day` is spend-shaped in its own author's words (`0038:7056-7058`, "misstate
  the firm's vendor spend"), the same shape as the already-REMOVE'd 15/day sales quota.
  But it also paces a lane the ruling never discussed, and REMOVING it puts two more live
  bodies (`_reserve_document_ingest`, `_reserve_processing_call`) into a D1 window.
  **RULED 2026-08-23 (owner), and SPLIT — the two gates are not the same animal.**
  **Gate 6 (document ingest, `0007:1638-1650`) = KEEP, re-classified ENGINE PROTECTION**, the
  same class as gates 2, 4 and 8; it bounds engine work, not spend. **Gate 7 (processing call,
  `0038:7063-7078`) = REMOVE** — its own author calls the budget the firm's vendor spend, so
  G8's meter-never-cap reaches it. Consequences: **only ONE extra body joins the D1 list**
  (`_reserve_processing_call`), not two; **gate 6 carries the mandatory `refused_budget` rename**
  with gate 4; and the census is now **CLOSED-WORLD and COMPLETE — eight gates, four REMOVE
  (1·3·5·7), four KEEP (2·4·6·8)**, so **PR-3's acceptance says "eight of eight classified"**,
  not "six of eight, two pending". The concurrency pair (gate 8) was never part of this question
  — KEEP by the ruling's own carve-out, decided at gate 1.
- **Is the initial `call_kind` roster (§3.1) complete?** It cannot be, by construction
  — F-A2/F-A6/F-A7b/F-A8 have not reached their own design stages yet.
  **Recommendation**: ship the roster above; each later item's own design adds its
  value via a one-line CHECK extension. **Fail-closed default**: an unrecognised
  `call_kind` is refused by the CHECK at INSERT time — a lane that forgets to register
  its kind fails loudly, never silently mislabels itself as an existing one.
- **Currency scope for `llm_price_table`.** Vendor billing is USD; the books are
  MYR-only until the FX wave (law 18/P-FX, untouched). **Recommendation**: USD-only for
  v1 (the CHECK `currency = 'USD'` is a deliberate, named, single-value floor rather
  than an unenforced convention), spend visibility ships in USD; MYR conversion is a
  named non-goal (Annex D) pending the FX wave. **Fail-closed default**: identical — the
  CHECK already forecloses any other currency from being proposed.
- **Where does the monthly rollup surface, and for whom (TA-P13-OQ-2)?** Not settled —
  the ruling scopes F-A9 to building the READ, not the screen. **Recommendation**: a
  firm-settings-adjacent dashboard card, bookkeeper+ visible, is the natural home once
  a dashboard slice is scheduled; not this item's build. **Fail-closed default**: the
  function exists and is callable; no screen ships until one is designed.

## 5 · Build sequence — severed at gate 1 into limbs, one D1 window

**The severance, and why** (gate 1's width ruling; full sequence, per-limb contents,
sequencing obligations and the D1 body list: **Annex B**). v1's PR-1 bundled four
independent subsystems into one window: a pure schema extension, the judgement-logic
brake census, a policy-table machine with an unresolved owner door, and a read path.
Only the census touches a live body or a live table under it. Bundling let a limb that
is *not yet designed to a buildable point* hold a D1 write-quiesce window hostage, and
put two judgement-logic changes (which refusal an operator still sees) in the same
review as a policy-table schema.

| PR | contents | D1 | gated on |
|---|---|---|---|
| **PR-0** | the chat token-cap hotfix (§3.3 gate 1) + its roster edit | **yes**, own small window | TA-P12's own two-batch instruction |
| **PR-1A** | ledger reshape (§3.1) + `record_agent_usage_event` (§3.2) + the extraction-shape wall | no | — · unblocks every downstream lane's recording obligation, so it ships FIRST after PR-0 |
| **PR-1B** | the brake census's DB half (§3.3 gates 3-5, §3.4) + the eight-file test repair + the roster edits | **yes — the ONE window in this item** | PR-0 landed; judgement logic, independent review (law 1) |
| **PR-1C** | dashboard rename surface (§3.3): `reviewCardTypes.ts`, `SweepReceiptCard.tsx` | no | lands with or immediately after PR-1B |
| **PR-1D** | price table + proposals + `propose_llm_price` + `reject_llm_price_proposal` + the priced view + the rollup read (§3.5-§3.7) | no | independent of PR-1B; needs no ruling |
| ~~**PR-1E**~~ | ~~the approval door alone — `approve_llm_price_proposal` and its grant/floor shape~~ | — | **DROPPED, not deferred — RULED 2026-08-23 (owner, R-L19): price rows are developer-seeded migration data, so there is no proposal and no approval door. The "Clara drafts a price proposal" limb is dropped with it; PR-1D's price table is populated by an effective-dated seed through the PR ladder.** |
| **PR-2** | the chat retrofit, a new `chatTurn_vN` (§3.8) | no | **F-A2's PR-2 claims `chatTurn_v13` first** (Annex B) |
| **PR-3** | acceptance on real BELCORT usage (constraint 13); the "unpriced calls" count published, not hidden; §3.9's three gate conditions recorded met-or-not | no | PR-1A…PR-2 |
| **PR-4** | schema retirement — drops `firm_usage_daily`/`task_usage` and their write sites | **yes**, its own reviewed migration | §3.9's three conditions; deliberately undated |

PR-1D ships the price table **with its first effective-dated seed** (R-L19). A day with no effective row is
still the correct visible state, not a gap: the evaluator returns `spend_cents IS NULL` and the rollup
publishes an *unpriced* count — the tripwire the ruling explicitly keeps. The battery's price cells stage rows
as the table owner in the rig (exactly what the FORCE-RLS owner policy allows), so no cell ever depended on
the dropped approval door to be runnable.

## 6 · Annex map

**`metering-annexes.md`**: **A** decision register · **B** build sequence in full, the D1
body list, cross-item sequencing · **C** battery manifest · **D** risks and named
non-goals · **E** change log · **F** the price machine (DDL + the four verbs' walls).
