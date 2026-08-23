# F-A9 annexes — register, build, battery, risks, change log, the price machine

> Companion to `metering-design.md` (**v2, 2026-08-22 — gate 1 folded; record:
> `metering-gate-record.md`**). **Annex A** decision register · **Annex B** the build
> sequence, the D1 body list and the cross-item sequencing obligations · **Annex C** the
> test battery manifest · **Annex D** risks and named non-goals · **Annex E** change log ·
> **Annex F** the price machine in full (moved here at v2 from design §3.5, unchanged in
> substance except where a gate fold says otherwise).

---

## Annex A · Decision register

| # | question | chosen | why | alternative refused |
|---|---|---|---|---|
| D1 | Rename `llm_usage_events` to something call-kind-neutral? | **No — keep the name** | It is a live, forced-RLS, triggered, indexed, tenant-scoped table; renaming it is cosmetic churn the ruling never asks for. `call_kind` carries the new semantics | Rename to `agent_usage_events` or similar |
| D2 | Widen `record_llm_usage_event`'s own signature with trailing DEFAULTs? | **No — a new sibling verb instead** | Adding declared params changes the function's `regprocedure` identity, breaking two live capability probes inside `witnessFacts.v1.dispatch.mjs:86` and `statementFacts.v2.dispatch.mjs:68` — BOTH inside live-frozen closures, forcing two purely-mechanical `_v3` bumps for zero behaviour change | Widen in place; ship `witnessFacts_v3` + `statementFacts_v3` to fix the probes |
| D3 | How does a chat/wake call link to its task row? | **A second, independent nullable FK (`agent_task_id` → `agent_tasks(id)`), firm-checked in the writer body** | `agent_tasks` has no `unique(id,firm_id)` alone (only the triple, `0009:810`), and `client_id` is nullable there — a composite FK through it would skip validation exactly when `client_id` is null | Add `unique(id,firm_id)` to `agent_tasks` to support a composite FK |
| D4 | Backfill `client_id` for legacy `document_extraction` rows via a trigger? | **No — resolve by join at read time in the rollup** | `documents.client_id` is itself nullable (`0003:67`); a write-side backfill would either fabricate a value or duplicate a column that can drift | A trigger copying `documents.client_id` at INSERT |
| D5 | Where do reads of `llm_price_table` go — direct grant or typed function? | **Typed function only; FORCE RLS with owner-policy only, no `clara_authenticated` grant** | Matches `sst_threshold_schedule` (`0016:398-411`); `llm_usage_events`'s direct grant is the tenant-data EXCEPTION | Grant SELECT to `clara_authenticated` directly |
| — | | **v2 note:** D5 stands; **v1's §3.6/§3.7 did not implement it** — see D16, which supplies the DEFINER shape D5 always implied | | |
| D6 | Fold the token-budget AND sales-cap removal into one CoR of `admit_autodraft_task`? | **Yes, one window (now PR-1B)** | Both blocks live in the same spliced function and TA-P12 rules both REMOVE in the same batch | Split into two migrations/windows |
| D7 | Rename `'refused_budget'` in place (UPDATE existing rows) or extend-only? | **Extend-only — new value for future rows, history rows keep the old string** | Law 6 and law 22 point the same way — the past really was called `refused_budget` at the time | UPDATE historical `sweep_run_items` rows |
| D8 | Drop `firm_usage_daily`/`task_usage` in the same window as the gate removal? | **No — a deliberately deferred, separately reviewed PR (§3.9)** | TA-P13's own wording splits "gates gone" from "schema retirement rides its own reviewed migration" | Drop both tables in the census PR |
| — | | **v2 correction (GM-4):** v1's reason said "the write side has no reader after PR-1". **False at the bytes** — `settle_chat_turn` READS `task_usage` (`0006:1025`) and writes both tables (`:1048-1050`, `:1054-1057`). The decision is unchanged; its stated ground is | |
| D9 | Two mechanical price-agreement sources, or one cited source? | **Two, both cited, both required to agree numerically** | TA-P2 A+'s own wording: "two independent official sources agree" as a MECHANICAL check | Accept one URL + a note |
| — | | **v2 qualifier (GM-1):** the check is **hygiene, not corroboration** — both numerals arrive from the same caller in one call. Said plainly in §3.5 and in the verb's comment | |
| D10 | Who may approve a price proposal — reuse `firm_capability_grants`? | **No — a model's price is firm-agnostic; the per-FIRM capability shape has no natural answer** | `firm_capability_grants`' whole shape is owner-per-FIRM | Extend it with a firm-agnostic capability kind |
| — | | **v2: the `clara_price_approver` ROLE half is WITHDRAWN (GM-5) — superseded by D17** | | |
| D11 | Currency for the price table and the evaluator? | **USD only, enforced by a CHECK** | Vendor billing is USD; MYR conversion needs the FX wave (law 18/P-FX) | Store MYR via an ad-hoc FX rate |
| D12 | Ship a monthly-usage dashboard screen in this item? | **No — the read function ships; the screen does not (TA-P13-OQ-2 stays open)** | The ruling scopes F-A9 to visibility as a CAPABILITY, not a screen | Design and ship a dashboard card now |
| **D13** | Classify the document/processing lane's per-UTC-day doc/page budgets (gates 6-7)? | ~~Not here — an owner item, with KEEP as the fail-closed default~~ **RULED 2026-08-23 (owner), SPLIT: gate 6 (document ingest, `0007:1638-1650`) = KEEP, re-classified ENGINE PROTECTION + the mandatory `refused_budget` rename; gate 7 (processing call, `0038:7063-7078`) = REMOVE, a spend brake under G8. Only `_reserve_processing_call` joins the D1 list; the census is eight-of-eight, four REMOVE (1·3·5·7) / four KEEP (2·4·6·8).** | They are spend-shaped in their own author's words (`0038:7056-7058`) but sit outside the lanes TA-P12 enumerated, and REMOVING them adds two live bodies to a D1 window. The lane will not infer a removal the owner did not name, nor hide a live brake behind a census called complete | Classify REMOVE by analogy with the 15/day quota · Leave them unnamed (v1's silence) |
| **D14** | How is the sales cap removed, given it shares one SELECT with the backfill door's watermark? | **Rewrite `0046:2223-2225` to read the watermark alone; delete only `:2245-2259`; the door at `:2226-2242` is byte-untouched** | Deleting the cited span kills 7A-R5's human-recorded backfill door; deleting only the cap branch strands a read of a column §3.4 drops in the same migration (PL/pgSQL late binding → the first sales admission after the window dies) | Delete `0046:2223-2259` wholesale (v1's literal wording) |
| **D15** | Do gates 6-8 change `firm_document_limits`? | **No column of that table is touched by F-A9** | Gate 8 is KEEP by the ruling's carve-out; gates 6-7 are pending D13 | Dispose its columns with `firm_limits`' |
| **D16** | Privilege shape of the priced read path | **`get_llm_usage_summary` is SECURITY DEFINER (owned by `clara_fn_owner`) with an explicit `p_firm = clara.jwt_firm()` refusal; the view is owner-executed, EXECUTE granted to `clara_authenticated`** | A `security_invoker` relation makes the CALLER's grants govern, and the base-table GRANT check precedes RLS — so v1's shape raised `42501` for the only role a human session holds. This is the estate's own typed-read idiom (`0016:1075`) and what D5 always implied | SECURITY INVOKER view + function (v1) · grant SELECT on `llm_price_table` to `clara_authenticated` (breaks D5) |
| **D17** | Grant shape of the approval door | ~~Coarse EXECUTE to `clara_authenticated` + an OWNER-rank floor read inside the DEFINER body + `_reserve_op` + `_audit` — the `0056:1130-1176` / `0063:24-33` idiom; WHICH firm's owner remains the owner's ruling (§4), PR-1E severed until it lands.~~ **RULED 2026-08-23 (owner, R-L19) — THE DOOR IS NOT BUILT AT ALL: price rows are DEVELOPER-SEEDED platform data, a versioned effective-dated migration seed through the full PR ladder; a price change is a ticket/PR. `approve_llm_price_proposal` and the "Clara drafts a price proposal" limb are DROPPED (not deferred) with PR-1E; the evaluator prices from seeded rows and the unpriced-count rollup stays as the tripwire. C.17 retires with the verb.** | KEPT AS THE RECORD OF WHY THE DOOR WAS NEVER BUILT: no human session ever holds a role other than `clara_authenticated` (`0006:72`, `deploy/storage-provision.sql:57-58`, `0002:112` non-inheriting), so a role-gated verb is a psql ceremony, not a one-click door — and C.17 would have proved only that nobody can approve. The successor question ("an owner of WHICH firm may approve a cross-tenant fact?") is DISSOLVED rather than answered | The `clara_price_approver` role + ops ceremony (v1, withdrawn at gate 1 as GM-5); the owner-floor door (v2, dropped by R-L19) |
| **D18** | One flag or two for the price checks? | **Two nullable columns (`sources_agree`, `band_ok`) + a `check_note`; NULL means "not checkable", never "fine"** | v1 wrote three distinguishable states into one nullable boolean — the same "one string, three meanings" defect survey §A.6 raises against `refused_budget` | One `plausibility_band_ok` boolean (v1) |
| **D19** | Overlap / inverted-range wall for `llm_price_table` | **`check (effective_to is null or effective_to >= effective_from)` + a partial unique index on `(engine_id) where effective_to is null` + approve REFUSING a non-forward `effective_from`** | `btree_gist` is installed nowhere in this estate and the estate says so itself (`0056:266-269`, `0057:305-313`) — an EXCLUDE would add an extension to a ceremony. Contiguity by construction is the house idiom | `EXCLUDE USING gist (engine_id with =, daterange(...) with &&)` |
| **D20** | Who repairs the eight `packages/db/tests` files? | **PR-1B, budgeted there, in survey §A.7's three classes** | Two of them PROVE the refusals this item removes — deciding what the estate still proves is judgement logic, not a roster edit | Leave them to PR-1C's roster edits (v1's implicit position) |
| **D21** | What does F-A9 add to `S5_25_BARE_TOKEN_ROSTER`? | **Nothing, unless the built body is MEASURED to read a bare clock token — and PR-0 REMOVES `begin_chat_turn` from it** | The census is an exact set equality against a live regex scan, not a name registry; an unmeasured append reddens it, and dropping `v_today` with PR-0's block takes `begin_chat_turn` out of the measured set | Append the new function names (v1's instruction) |
| **D22** | Ship PR-1 as one window? | **No — severed into PR-1A…PR-1E, exactly one D1 window (PR-1B)** | Only the census limb touches a live body or live tables under it; bundling let an owner-gated, not-yet-buildable price door hold a write-quiesce window hostage and mixed two judgement-logic changes into a policy-table review | One PR-1 (v1) |

## Annex B · Build sequence, D1 list, and cross-item sequencing

### B.1 · The train

1. **PR-0 — the chat token-cap hotfix.** Own small D1 window; ships ahead of everything
   else, per TA-P12's two-batch instruction. Contents: rewrite `begin_chat_turn`'s limits
   select (`0006:963-965`) to load `max_concurrent_runs` alone; delete `:967-974`; drop
   the three dead declarations (`v_token_limit`, `v_tokens_used`, **`v_today`**); remove
   `begin_chat_turn` from `S5_25_BARE_TOKEN_ROSTER` **in the same PR** (D21). The
   concurrency check at `:976-985` is byte-unchanged.
2. **PR-1A — the ledger reshape and the new door.** DDL 3 (below) + `record_agent_usage_event`
   + the extraction-shape wall. **No D1**: the only writers of `llm_usage_events` are two
   frozen dispatch closures calling an untouched verb. Ships early because every
   downstream lane's recording obligation waits on this door. If the table is large at
   merge time, the two new CHECKs ship `NOT VALID` and are `VALIDATE`d in a following
   statement, so the ACCESS EXCLUSIVE hold stays short.
3. **PR-1B — the brake census, DB half. THE ONE D1 WINDOW.** Body #1 + DDL 1 + DDL 2
   below, in that order in one file, plus the eight-file test repair (D20) and the roster
   edits. **Judgement logic — independent review before merge (law 1).**
4. **PR-1C — the dashboard rename surface.** `reviewCardTypes.ts:26,55`,
   `SweepReceiptCard.tsx:60`. No D1. Lands with or immediately after PR-1B.
5. **PR-1D — the price machine, minus the approval door.** `llm_price_table` (+ D19's two
   walls), `llm_price_proposals`, `propose_llm_price`, `reject_llm_price_proposal`,
   `llm_usage_events_priced`, `get_llm_usage_summary`. No D1 (all brand-new objects).
6. ~~**PR-1E — the approval door alone.** `approve_llm_price_proposal` + D17's floor.~~ **DROPPED 2026-08-23
   (owner, R-L19)** — price rows are developer-seeded migration data; PR-1D's table ships with its first
   effective-dated seed and a price change is a ticket/PR.
   **Gated on the owner's D13/§4 ruling on who may approve.** No D1.
7. **PR-2 — the chat retrofit.** A new `chatTurn_vN` (N ≥ 14, see B.3). New frozen export
   + registry repoint; bundle-grep after build per `.claude/rules/runtime-workflows.md`.
8. **PR-3 — acceptance.** Real BELCORT usage (constraint 13); the unpriced count
   published, not hidden; §3.9's three conditions recorded met-or-not; ~~the census is reported as
   six-of-eight classified while D13 is open~~ **RULED 2026-08-23 (owner) — D13 is CLOSED, so the
   census is reported as EIGHT of eight: four REMOVE (1·3·5·7), four KEEP (2·4·6·8).**
9. **PR-4 — schema retirement.** Deferred, own reviewed migration, own D1 window.

### B.2 · The D1 body list

**PR-0's window (its own, not counted below):** `clara.begin_chat_turn`.

**PR-1B's window — ONE CoR'd live body, one CHECK swap, one column-drop DDL:**

| # | object | why it is on the list |
|---|---|---|
| 1 | `clara.admit_autodraft_task` (live tip per the seven-generation lineage; standing caveat) | removes the token-budget block (`0011:2555-2566` / live `0036:1408-1417`); **rewrites** the shared select at `0046:2223-2225` and removes ONLY `0046:2245-2259` (D14); renames the concurrency block's outcome/reason strings; leaves `0053`'s re-admit arm and `0046:2226-2242`'s backfill door untouched — the prestate must positively confirm both survive the recut, not assume it |
| DDL 1 | `ALTER TABLE clara.sweep_run_items`, `outcome` CHECK | drop+add, adds `'refused_concurrency'` — ACCESS EXCLUSIVE, validates trivially |
| DDL 2 | `ALTER TABLE clara.firm_limits` | drops `daily_token_limit`, `sweep_budget_share`, `sales_admission_daily_cap`. **ORDER-DEPENDENT on body #1's shared-select rewrite landing earlier in the same file** (D14). Their two CHECKs fall with their columns — no separate DROP CONSTRAINT (GN-2) |

**PR-1A's DDL (no D1):** DDL 3 — `ALTER TABLE clara.llm_usage_events`: relax three NOT
NULLs, add five columns, add the extraction-shape CHECK and the call-kind roster CHECK.
Every existing row satisfies the new shape.

**Not on any D1 list, each for a stated reason.** `clara.record_llm_usage_event` — body
byte-unchanged (D2). `record_agent_usage_event`, `llm_price_table`,
`llm_price_proposals`, the three price verbs, `llm_usage_events_priced`,
`get_llm_usage_summary` — brand-new objects, no writer displaced (the `0094` precedent).

**PR-4's window (deferred) will carry:** `clara.admit_autodraft_task` (the now-dead
reserve INSERT/UPDATE against `firm_usage_daily`), `clara.settle_autodraft_task` (both
overloads), **`clara.settle_chat_turn` — added at v2 (GM-4): it READS `task_usage` at
`0006:1025` and writes both tables at `:1048-1050`/`:1054-1057`, so dropping the tables
without recutting it kills every ordinary chat-turn settle**, the retry-door refund
blocks in `0034`/`0036`/`0053`, and the two `DROP TABLE`s. `clara.begin_chat_turn` is NOT
on this list — after PR-0 it has no remaining reference to either table (grep-confirmed).
Line numbers are deliberately not fixed here: PR-4's own design stage re-derives the
then-current tips by rig replay. **Roster consequence to re-measure at PR-4**:
`admit_autodraft_task` keeps `v_today` even after the reserve side goes
(`autodraft_attempts.usage_date`, `0036:1461`), so it stays on the bare-token roster —
measure, do not assume.

### B.3 · Cross-item sequencing obligations (stated, never assumed)

1. **`chatTurn_v13` is F-A2's.** The owner's D34 ruling put chat parity on F-A2's main
   train, and F-A2's PR-2 claims `chatTurn_v13` (`f-a2-agentic-posting-design.md` §5 step
   4). **F-A9's PR-2 claims `v14` or later, after that merge.** If both lanes claimed the
   same number the collision is caught by `check-frozen-workflows.mjs` at merge, loudly —
   but the ordering is an obligation, not a safety net.
2. **`settle_autodraft_task` (both overloads) is on F-A2's PR-1 D1 list**
   (`f-a2-annexes-1-estate.md:416-420`) **and** on F-A9's PR-4 list. PR-4's design stage
   re-derives its tip after F-A2's PR-1 has merged; it may not carry a line number
   predicted across that merge.
3. **`admit_autodraft_task` is NOT touched by F-A2** — checked at gate 1 against F-A2's
   full retirement inventory (Annex B, 31 named artifacts) and its PR-1 D1 list: zero
   hits. The two lanes' D1 windows share no live body. Recorded so the question is not
   re-opened, and so a future change to F-A2's scope is visibly a change to this fact.
4. **F-A2's J.2 already assigns itself the reciprocal check** ("whether its retirement PR
   is already removing the gate's host body"); per (3) it resolves to no.
5. **The `call_kind` roster is extended by each later lane's own migration**, not by
   F-A9. F-A9 ships the enum and the door; F-A2/F-A5/F-A6/F-A7/F-A8 each add their value.
6. ~~**PR-1E waits on an owner ruling, and nothing else waits on PR-1E.**~~ **RULED 2026-08-23 (R-L19):
   PR-1E is DROPPED.** The evaluator and rollup were always able to ship without it; they now price from
   the seeded rows and publish the unpriced count for any day with no effective row.

## Annex C · Test battery manifest

Every row is a REGRESSION or a NEW cell; "contract-blind" cells are written against the
verb's documented contract, never against today's implementation detail.

| cell | asserts | kind |
|---|---|---|
| C.1 | `record_llm_usage_event`'s 10-arg call, unchanged, still inserts with `call_kind='document_extraction'` by column default | regression, contract-blind |
| C.2 | its `to_regprocedure('...(uuid,uuid,uuid,text,text,text,int,int,int,text)')` probe (the exact string `witnessFacts.v1.dispatch.mjs:86` / `statementFacts.v2.dispatch.mjs:68` use) still resolves non-null after the migration | regression — the hazard D2 refused, proven closed |
| C.3 | `record_agent_usage_event(p_call_kind:='document_extraction', …)` REFUSES (CLR10) | new, negative |
| C.4 | `record_agent_usage_event` with a `p_client` from a DIFFERENT firm REFUSES on the FK | new, negative |
| C.5 | `record_agent_usage_event` with a `p_agent_task` of another firm REFUSES (the manual positive check) | new, negative |
| C.6 | `record_agent_usage_event` with an INACTIVE-member `p_triggering_actor` REFUSES | new, negative |
| C.7 | `call_kind='chat'`, `document_id`/`task_id` NULL, `agent_task_id` set — INSERTS cleanly | new, positive |
| C.8 | extraction-shape CHECK: a `document_extraction` row with NULL `channel` REFUSES | new, negative |
| C.9 | `begin_chat_turn` post-hotfix: a firm over yesterday's `daily_token_limit` still admits a new turn; the concurrency cap alone still refuses at its own bound | regression, contract-blind. **Runs between PR-0 and PR-1B's DDL 2; RETIRES when the column drops** (it cannot set a column that no longer exists) — its successor is C.9b |
| C.9b | after DDL 2: `begin_chat_turn` admits under load with no `firm_limits` token column in existence, and its concurrency refusal is unchanged | new, positive-by-absence |
| C.10 | `admit_autodraft_task`: a firm at 61% of the old `sweep_budget_share` bound now ADMITS | new, positive-by-absence (law 31 — refused once in the pre-change fixture, admitted after) |
| C.11 | the 16th sales-direction draft in one UTC day now ADMITS | new, same shape as C.10 |
| C.12 | the concurrency cap STILL refuses at `max_concurrent_sweeps` open runs, with the RENAMED string `'refused_concurrency'` | regression + rename, one cell |
| C.13 | a pre-existing `sweep_run_items` row with `outcome='refused_budget'` (fixtured pre-migration) reads back UNCHANGED | regression — extend-never-weaken proof for D7 |
| C.14 | `llm_usage_events_priced`: a usage row in a GAP between two price rows computes `spend_cents IS NULL` | new, negative-by-construction. Price rows are staged by the table owner in the rig — no dependency on PR-1E |
| C.15 | `propose_llm_price`: input-price sources disagreeing sets `sources_agree=false`, leaves `band_ok` on its own merits, names the check in `check_note`, and does NOT average | new, negative (re-cut at v2 for D18) |
| C.16 | a value at 6× the prior active row sets `band_ok=false` with `sources_agree` untouched; **a brand-new `engine_id` gets `band_ok IS NULL` and a `check_note` saying "not checkable"** | new, negative + the three-state proof |
| C.17 | `approve_llm_price_proposal` called by an ACTIVE non-owner member REFUSES on the body's rank floor (CLR04), and the proposal stays `'proposed'` | new, negative — **PR-1E's cell, re-cut at v2 (GM-5): the v1 grant-level cell was vacuous because no human session can hold a non-`clara_authenticated` role** |
| C.17b | EXECUTE on the three price verbs is granted to no PUBLIC and no `clara_runtime` — a catalog census, not a call | new, closed-world |
| C.18 | approve SUPERSEDES the prior row's `effective_to` in the same transaction as the INSERT — no window with two open-ended rows for one `engine_id` (and the partial unique index makes it structural) | new, positive |
| C.18b | **approve REFUSES a backdated `effective_from`** (equal to or earlier than the active row's), and a hand-built inverted range is refused by `ck_llm_price_range` | new, negative (D19) |
| C.19 | `get_llm_usage_summary`: firm B naming firm A's id is **REFUSED** by the body's `jwt_firm()` check (CLR11) — and firm B's own call returns firm B's rows | new, negative — **re-cut at v2 (GB-3): under DEFINER, `p_firm` IS the boundary; the v1 cell proved an RLS behaviour that no longer applies and could not have run at all** |
| C.20 | the `S5_25_BARE_TOKEN_ROSTER` census: **the live regex-derived set EQUALS the roster** after this item's PRs — including that `begin_chat_turn` has LEFT it (PR-0) and that no F-A9 function was added without being measured | closed-world census, **re-specified at v2 (GM-3)**; any cohort this item does add is `appliedStem`-gated so pinned frontiers stay green |
| C.21 | `llm_usage_events_priced` returns an IDENTICAL `spend_cents` for a boundary-day call under five hostile session `TimeZone`s (the `x42b0-s5c-clock.test.mjs:88-93` pattern) | new, determinism proof (GB-4) |
| C.22 | after PR-1B: a sales filing older than the watermark with NO open backfill batch still refuses `sales_backlog_held` — the 7A-R5 door survives the cap's removal byte-for-byte | new, positive-by-survival (D14) |
| C.23 | after PR-1B: a sales-direction admission SUCCEEDS with no `sales_admission_daily_cap` column in existence — the shared select was rewritten, not stranded | new, the late-binding trap proven closed (D14) |

## Annex D · Risks and named non-goals

**Risks, registered rather than priced away:**

- **The seven-generation lineage's true tip is unmeasured until rig replay** — every line
  number this design cites for `admit_autodraft_task` is a prediction (survey standing
  caveat). PR-1B's prestate re-derives the tip before touching anything.
- ~~**Two live usage gates are unclassified** (D13).~~ **RULED 2026-08-23 (owner): gate 6 KEEP as
  ENGINE PROTECTION (with the mandatory `refused_budget` rename, alongside gate 4's
  `refused_concurrency`), gate 7 REMOVE as a spend brake.** The census is CLOSED-WORLD: eight of
  eight classified, and only `_reserve_processing_call` joins the D1 list — PR-1B's window becomes
  two bodies, not three. **The two KEEP rows that a shorter reproduction of this census had
  dropped — gate 4 and gate 6, the two that carry rename obligations — are named here in full.**
- **PR-1B stops reading the old ledger but keeps writing it** — a deliberate, named waste
  until PR-4's three conditions are met. `settle_chat_turn` also keeps reading it.
- **The chat retrofit's `chatTurn_vN` depends on F-A2's merge order** (B.3.1).
- ~~**The price-approval door is designed but not ruled** (D17); PR-1E is severed.~~ **RULED 2026-08-23
  (R-L19): the door is DROPPED — price rows are developer-seeded migration data.** The money column reads
  honestly empty for any day with no seeded effective row, which is the tripwire, not a gap.
- ~~**A brand-new `engine_id` cannot be plausibility-checked** — `band_ok IS NULL` and the owner is told so.~~
  **Moot under R-L19:** a new engine's first price arrives in a reviewed migration, so the plausibility band
  and its human judgement call are replaced by the PR ladder.
- **`db-slice-frontiers` fails LATE.** An ungated roster addition reddens the weekly
  sweep / manual dispatch (`ci.yml:360`), not the PR — so the `appliedStem` gate is part
  of the change, not a follow-up (GM-3).

**Non-goals, stated so nobody reads their absence as an oversight:**

- No MYR/FX conversion of model spend — USD only, pending the FX wave (law 18/P-FX).
- No cross-firm operator dashboard and **no new DB role at all** (v2: the
  `clara_price_approver` role is withdrawn, D17) — TA-P13-OQ-4 stays open.
- No monthly-usage dashboard SCREEN — the read function ships; the UI does not
  (TA-P13-OQ-2). **The price door is not a screen either, and that is not a deferral**:
  in this estate "one-click" means the audited verb, the shape TA-P8 and law 61's
  ceremony already ship without a list-reader (`metering-gate-record.md` §6, refuted).
- No retrofit of F-A2/F-A6/F-A7b/F-A8's own model calls — this item ships the door.
- No physical DROP of `firm_usage_daily`/`task_usage` inside this build sequence.
- No change to any concurrency BOUND (3 runs / 2 sweeps / 2 OCR / 2 llm_witness) — only
  the unattended lane's refusal STRING moves.
- No re-litigation of TA-P11's retirement, TA-P7's attribution wall, or any other item's
  ruling.

## Annex E · Change log

- **v1, 2026-08-22.** First design, built from the 2026-08-22 sitting rulings (TA-P12,
  TA-P13, TA-P2) and a from-the-bytes estate survey. No prior version.
- **v1 self-review pass, same day.** ~25 byte-level spot-checks; three defects corrected
  in place: (1) §3.8 named `runChatTurnModel`, which exists nowhere — corrected to
  `runModelSegmentStepV12`; (2) survey §C's `rig-meta.mjs` cite `176-177` → `247-249`;
  (3) the `admit_autodraft_task` lineage undercounted — `0053`'s splice was missed, so
  "seven generations, three dynamic splices", not six/two.

### v1 → v2 — gate 1 (4 blockers, 6 materials, 2 nits; record: `metering-gate-record.md`)

**The gate ran 2026-08-22 on two lenses** — a byte lens re-deriving every citation and
census against the live migration/runtime sources, and a rulings lens against TA-P1…P14 —
with every finding adversarially verified by an independent verifier, and the verifier's
re-graded severity governing. **What HELD is recorded too, so it is not re-argued:** the
corrected seven-generation lineage (independently confirmed at `0053:299-306` /
`0048:51`); D2's whole argument (both `to_regprocedure` probes really do sit inside live
frozen closures); the extraction-shape wall genuinely closing the hole the NOT NULL
relaxation opens; the rename's full surface; the `0094` shape/grant/trigger cites; the
law-1 posture of the price calculation (fail-closed to NULL, never a guess).

**GB-1 — the brake census was not closed-world.** A whole second limits table
(`firm_document_limits`) with two live per-UTC-day budgets — one of which its own
migration comment calls the firm's *vendor spend* (`0038:7056-7058`) — plus two
concurrency floors in `0090`, were absent from a census the acceptance record would have
called complete. **Fold:** survey §A.5 re-derived from refusal sites rather than from one
table; §3.3 now carries **eight** gates; the concurrency pair is classified KEEP by the
ruling's own carve-out; the two day budgets went to the owner as D13 with KEEP as the
fail-closed default. **RULED 2026-08-23: gate 6 KEEP (engine protection, + rename), gate 7 REMOVE
(spend). PR-3 reports "eight of eight classified".**

**GB-2 — the sales-cap removal was unbuildable in both readings.** The cited range
`0046:2223-2259` CONTAINS the 7A-R5 backfill door the same cell declared untouched, and
the cap read shares one SELECT with the watermark read. Delete the span → the governance
door dies; delete only the branch → a dropped column stays referenced and the first sales
admission after the window raises *column does not exist* (PL/pgSQL late binding).
**Fold:** D14's three-construct disposition (rewrite `:2223-2225`, keep `:2226-2242`,
remove `:2245-2259`), the order dependency written into Annex B's DDL 2, and two new
cells (C.22 the door survives, C.23 the late-binding trap is closed). The honest cost —
an open backfill batch is no longer per-day paced, only `batch_size`-bounded — is stated
in survey §A.5(5) rather than left implicit.
**GB-2b (derived at fold time, same class):** PR-0's own removal has the identical
shared-select shape — `0006:963-965` loads `daily_token_limit` AND `max_concurrent_runs`
in one statement, and PR-1B drops the former. §3.3's row now says rewrite, not delete,
and names the three declarations that die with the block.

**GB-3 — the priced read path could not return a row for its only caller.** A SECURITY
INVOKER view + function over a FORCE-RLS table with an owner-only policy and no grant
raises `42501` for `clara_authenticated`, the only role a human session holds; the base
GRANT check precedes RLS, so v1's "RLS already confines a normal caller" was unreachable
code, and C.19 could not pass. **Fold:** D16 — DEFINER function owned by
`clara_fn_owner`, owner-executed view, EXECUTE to `clara_authenticated`, and an explicit
`p_firm = clara.jwt_firm()` refusal as the first statement. §3.7's "`p_firm` is not a
privilege boundary" is REVERSED: under DEFINER it is the boundary, so C.19 is re-cut to
prove that wall.

**GB-4 — the spend evaluator was session-`TimeZone` dependent.** `timestamptz >= date`
casts the date at midnight in the caller's GUC, so one boundary-day call priced against
September for a UTC session and August for an Asia/Kuala_Lumpur one — two money numbers
from one "versioned deterministic evaluator" (law 1), with no error. Nothing in the repo
pins a session TimeZone. **Fold:** both bounds anchored
`(u.created_at at time zone 'utc')::date`, the upper bound inclusive; C.21 adds the
five-zone hostile battery the estate already uses for this class.

**GM-1 — the price door's two checks collapsed into one boolean, and "agreement" is not
corroboration.** **Fold:** D18's two nullable columns plus `check_note` (NULL = not
checkable); and §3.5 says plainly that the checks are hygiene — both numerals come from
the same caller in one call, the DB read neither source (review law 2), and the owner's
approval is the authority. C.15/C.16 re-cut.

**GM-2 — the exhaustiveness claim was scoped to the wrong universe.** The grep covered
`apps/dashboard` + `packages/runtime` only; eight `packages/db/tests` files read the
doomed columns, two of them PROVING the removed refusals, one positively asserting a
dropped column EXISTS. **Fold:** survey §A.7's re-scoped table in four classes, and D20
puts the repair inside PR-1B where the judgement lives.

**GM-3 — survey §C mis-described the x42 census.** It is a bare-clock-token set equality
measured from the live catalog, not a name registry: appending `record_agent_usage_event`
would have reddened it; a body edit DOES perturb it (PR-0 orphans `begin_chat_turn`'s
`v_today`); and an ungated append reddens every pinned frontier. **Fold:** D21, the
rewritten §C bullet, PR-0's roster removal, and C.20 re-specified as the equality plus
the frontier gate.

**GM-4 — "their only readers" was false.** `settle_chat_turn` reads `task_usage`
(`0006:1025`) and writes both tables. **Fold:** §3.9's sentence corrected, D8's stated
ground corrected, and `settle_chat_turn` added to PR-4's body list — dropping the tables
without recutting it would kill the highest-volume lane's ordinary completion path.
(`begin_chat_turn` is NOT added: after PR-0 it references neither table.)

**GM-5 — the approval door was granted to a role no human session holds.** **Fold:** D17
withdraws the `clara_price_approver` role for the estate's coarse-grant + body-enforced
owner-rank idiom (`0056:1130-1176`, `0063:24-33`), narrows the open question to WHICH
firm's owner, severs PR-1E behind that ruling, and re-cuts C.17 (the v1 cell would have
proved only that nobody can approve).

**GM-6 — no wall against overlapping or inverted price ranges.** A backdated approval set
an open row's `effective_to` below its own `effective_from`, or produced two rows matching
one usage row — the view then double-counts a money number. **Fold:** D19's CHECK +
partial unique index + approve's forward-only refusal, deliberately NOT an `EXCLUDE`
(no `btree_gist` in this estate, `0056:266-269`); C.18b added.

**GN-1 / GN-2 and the trued nits.** `runChatTurnModel` removed from its two surviving
occurrences (survey §A.4, §5's build step) and `chatTurn.v12.ts:81` → `:80`;
`usageTokens` re-cited `:146-149`; §3.4 says the two CHECKs fall with their columns
(a literal DROP CONSTRAINT after DROP COLUMN aborts the migration); the per-table FORCE
RLS sentence is written for both new tables rather than inherited from §3.5's heading;
C.9 gains an explicit retirement clause and a successor (C.9b); the live `0036` line
numbers are recorded beside the `0011` cites for both admit blocks.

**Width — PR-1 severed (D22).** v1's PR-1 was four independent subsystems in one window.
It is now PR-1A (ledger, no D1) → PR-1B (the census, **the one D1 window**, judgement
logic) → PR-1C (dashboard) → PR-1D (price machine + evaluator, no D1) → PR-1E (the
approval door, owner-gated). The rulings lens judged v1's six-PR shape adequate; the
bytes lens's severance was adopted because it is grounded in buildability — one limb was
not yet designed to a buildable point and would otherwise have held a write-quiesce
window hostage.

**Companion-file reconciliation.** Where `metering-survey.md` v1 and this design
disagreed, **the design doc of record wins and the survey was trued to it** — the
`runChatTurnModel` naming (§A.4), the "exhaustive" reader claim (§A.7), the x42 census
description (§C), and the three-gate census (§A.5). No survey text was left standing
against a design decision.

## Annex F · The price machine, in full (moved from design §3.5 at v2)

**`clara.llm_price_table`** — the effective-dated-policy-table idiom
(`sst_threshold_schedule`, survey §A.10): FORCE RLS, owner policy only, no
`clara_authenticated` grant; reads only through §3.7's DEFINER function.

```
clara.llm_price_table(
  engine_id text, effective_from date, effective_to date,
  input_price_cents_per_million_tokens  bigint not null check (… >= 0),
  output_price_cents_per_million_tokens bigint not null check (… >= 0),
  currency text not null default 'USD' check (currency = 'USD'),   -- scope boundary, D11
  source_note text not null, source_urls jsonb not null default '[]',
  approved_by uuid references clara.users(id), approved_at timestamptz not null,
  primary key (engine_id, effective_from),
  constraint ck_llm_price_range check (effective_to is null or effective_to >= effective_from)
);
create unique index uq_llm_price_open on clara.llm_price_table(engine_id)
  where effective_to is null;
```

**`clara.llm_price_proposals`** — the durable draft carrier (TA-P14 clause 3). Same RLS
posture; no table grant; reachable only through the verbs.

```
clara.llm_price_proposals(
  id uuid primary key, engine_id text, effective_from date,
  input_price_cents_per_million_tokens bigint, output_price_cents_per_million_tokens bigint,
  source_a_url text, source_a_value_cents bigint, source_b_url text, source_b_value_cents bigint,
  source_note text,
  sources_agree boolean,   -- null = NOT CHECKABLE (never "fine")
  band_ok       boolean,   -- null = no prior active row to compare against
  check_note text,         -- names which check fired, and on which price
  status text default 'proposed' check (status in ('proposed','approved','rejected')),
  proposed_at timestamptz, decided_by uuid references clara.users(id), decided_at timestamptz,
  model_snapshot text
)
```

**`clara.propose_llm_price(p_engine_id, p_effective_from, p_source_a_url,
p_source_a_value_cents, p_source_b_url, p_source_b_value_cents, p_source_note,
p_model_snapshot) returns uuid`** — Clara-callable; returns the proposal id so Clara can
hand the owner the exact thing to approve. Both checks are computed in the body, never
asserted by the caller: **`sources_agree`** = the two values match for BOTH the input and
the output price (a disagreement is recorded and flagged, never averaged);
**`band_ok`** = the proposed value sits within 0.2×–5× the currently-active row, or NULL
when there is no prior row. **The body's own comment states that these are hygiene, not
corroboration** — both numerals arrive from the same caller in one call, the DB read
neither source (review law 2), and the owner's approval is what makes the number usable
(constraint 2). It also REFUSES an `effective_from` that is not strictly later than the
active row's, so no unapprovable proposal ever reaches the owner.

**`clara.approve_llm_price_proposal(p_proposal uuid) returns uuid`** (PR-1E) — SECURITY
DEFINER; EXECUTE to `clara_authenticated` with the OWNER-rank floor read inside the body
(D17), `_reserve_op` for idempotency, `_audit` for the record. It SUPERSEDES the open row
for that `engine_id` (setting its `effective_to` to the day before the new
`effective_from`) and INSERTs the new row in one transaction — immutable + supersede,
never an in-place UPDATE (law 16). **It REFUSES a non-forward `effective_from`**: a
backdated correction restates a durable money number, so it is its own owner act with its
own record, not a side effect of approve. Without that refusal, the supersede would either
invert a range (now caught by `ck_llm_price_range`, aborting the transaction) or leave one
usage row matching two price rows, doubling its spend in the view.

**`clara.reject_llm_price_proposal(p_proposal uuid, p_reason text) returns void`** (PR-1D)
— same floor shape, records the reason; the proposal row is kept, never deleted (law 6).
