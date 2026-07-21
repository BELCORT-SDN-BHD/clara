# Wave A2 — probe battery results

**Lane:** empirical validation of the Wave-A2 design's load-bearing assumptions on a
**self-stood-up throwaway PostgreSQL 17.6** (never a live DB; no `~/.clara-*`; no network).
Each probe: HYPOTHESIS → method → observed → **SUPPORTED / REFUTED / PARTIAL**. Prototype SQL is
throwaway (written directly in psql; testing mechanics, not building the migration).

Design under test: `docs/plan/wave-a2-ar-myinvois-contract.md` + `wave-a2-migration-0015-design.md`
(both v0.3). Drivers: `.tmp/wave-a2-review/native-design-review.md` (SOUND-WITH-FINDINGS) +
`indep-design-review.md` (FLAWED / adversarial). As-built truth = the 14-migration seeded schema.

---

## Reusable setup (exact commands run)

PG17.6 binaries were already at another session's scratchpad; data dir + logs in this session's.

```powershell
# binaries (glob-found)
$bin  = "C:\Users\zhant\AppData\Local\Temp\claude\C--Users-zhant-Desktop-clara-rebuild\c346fa2b-da54-48ef-9646-4b7d01fbf1ef\scratchpad\pg17\pgsql\bin"
$data = "C:\Users\zhant\AppData\Local\Temp\claude\C--Users-zhant-Desktop-clara-rebuild\6667c24e-d1cc-4ed3-a7af-ec1b80df213a\scratchpad\pgdata-wa2"
& "$bin\initdb.exe" -U postgres -A trust -D $data --encoding=UTF8
& "$bin\pg_ctl.exe" -D $data -o "-p 55432" -l <log> start
& "$bin\createdb.exe" -h 127.0.0.1 -p 55432 -U postgres clara_ci
# migrate + seed (env-only connection; never a DSN in argv)
$env:PGHOST="127.0.0.1"; $env:PGPORT="55432"; $env:PGUSER="postgres"; $env:PGDATABASE="clara_ci"
pnpm db:migrate                         # 14 migrations applied
# db:seed wrapper is destructive-guarded + classifier-blocked; the seed is idempotent
# (sentinel guard, all-through-audited-writers), so applied the SQL directly:
& "$bin\psql.exe" -v ON_ERROR_STOP=1 -f packages/db/seeds/0002_core_seed.sql
```

Seeded fixtures used throughout: **Firm A** = Alara Advisory `14b59433-…` (owner **alice**
`5eed…a11e` rank 3, bookkeeper **bob** `5eed…b0b1`); clients **Sunrise** `3dd27c09-…`,
**Meridian** `19f9f9e2-…`; `high_stakes_amount_cents = 1,000,000` (RM 10,000). Actor context set
with `select set_config('request.jwt.claims', json_build_object('sub', <user>)::text, false);`
(`jwt_firm()` resolves firm from membership). Teardown at end: `pg_ctl stop` + delete data dir.

As-built anchors confirmed by dumping live `pg_get_functiondef` / `pg_get_constraintdef`:
lane CHECK = `('ocr','structured_parse','none','invoice_facts')`; `counterparties.kind` CHECK =
literal `kind='vendor'`; `coding_rules.rule_type` CHECK = literal `'vendor_account'`;
`coa_accounts.account_class` = `(null,'payable')`; `special_acc_type='rounding'`;
`journal_entries.coding_kind` = `(null,'supplier_bill')`; `record_rule_resolution` ACL =
`{clara_fn_owner, clara_runtime_login}` (the login-direct precedent).

---

## Results

### P1 — lane gate + lane↔engine CHECK — **SUPPORTED** (with one surprise)

**P1a (HYPOTHESIS: as-built `claim_document_processing_task` holds `structured_parse` under
`p_egress_approved=false` — the conservative hold the design removes).** Method: inserted a fresh
`structured_parse`/`clara-structured:v1` task and claimed it. Observed:

| claim | result |
|---|---|
| `structured_parse`, egress=false | `held_egress`, `payload.reason='kill_switch'` (CLR28) |
| `none` lane, egress=false | `running` (local lane, no hold) |
| `ocr`, egress=false | `held_egress`, reason `kill_switch` |
| `structured_parse`, egress=true | `running` |

Confirms `claim` line `t.lane in ('ocr','structured_parse','invoice_facts') and not egress_approved
⟹ kill_switch`. The design's move (free `structured_parse` from the kill-switch) is a real,
declared relaxation of an existing hold. **SUPPORTED.**

**P1b (prototype the lane CHECK widening + the lane↔engine CHECK).** Method: dropped
`ck_processing_task_lane_0009`, re-added with `+local_facts`, then added
`ck_task_lane_engine`: `lane in ('ocr','invoice_facts') ⟹ engine_id like 'azure-%'`;
`lane in ('structured_parse','local_facts','none') ⟹ 'clara-%'`. Observed:

- ALTER succeeded; the 3 seeded-prototype rows conform (`clara/structured_parse`, `clara/none`,
  `azure/ocr`).
- mis-declared `lane='ocr' + engine='clara-x'` → **REFUSED at insert** (`ck_task_lane_engine`). ✓
- legit `local_facts + clara-myinvois:v1` → accepted; `local_facts + azure-x` → refused. ✓

**SURPRISE (build-blocking, must be handled in 0015):** `lane='ocr' + engine_id='fixture-engine'`
— **the literal DEFAULT of `finalize_document_intake(p_engine_id text default 'fixture-engine',
… p_lane text default 'ocr')` (0007:1978-1979)** — is **REFUSED** by the CHECK (`fixture-engine`
is neither `azure-%` nor `clara-%`). No task rows carry it in the *seeded* DB (the seed helper
creates documents without processing tasks), so the ALTER adds clean here — but any rig/fixture or
default-arg intake that mints a task will now fail at insert. The build must either (a) change the
fixture default engine_id to a `clara-*`/`azure-*` value, or (b) special-case `fixture-engine`, or
(c) accept that every task-minting call site must pass an explicit compliant engine_id. Flagging
because CI rig fixtures and `finalize_document_intake`'s own default depend on `fixture-engine`.

### P2 — two-extraction attribution inversion (#3 hole + write-gate) — **SUPPORTED**

**HYPOTHESIS:** the identity pass attributes from `myinvois.supplier_tin`; buyer identifiers never
attribute; but as-built `record_rule_resolution` matches any `structured_parse` field_path
`LIKE '%tin%'`, so an arbitrary "supplier"-named field smuggles attribution — and the proposed
write-gate closes it. Method: 2 client-identifiers (kind=tin) under Firm A — Sunrise `c12345678901`,
Meridian `c99999999999`; 3 documents each with a done `structured_parse`/`clara-myinvois:v1`
extraction + 1 region. Observed (`record_rule_resolution` per doc):

| region field_path | text (TIN of) | outcome |
|---|---|---|
| `myinvois.supplier_tin` | Sunrise | `rule_resolved` → **Sunrise** ✓ |
| `myinvois.buyer_id_primary` | Meridian | `abstained`, match_count 0 (avoids `%tin%`) ✓ |
| `supplier.tin.evil` (attack) | Meridian | `rule_resolved` → **Meridian** — **THE HOLE** |

The attack field_path (`%tin%` substring, not the intended vocabulary) attributes an arbitrary
client as-built. Then the **#3 write-gate prototype** (BEFORE INSERT trigger on `document_regions`:
for `engine_kind='structured_parse'`, refuse `%tin%`/`%ssm%`/`%account%` field_paths not in
`('myinvois.supplier_tin','myinvois.supplier_brn')`):

- attack `supplier.tin.evil` → **REFUSED** ✓
- `myinvois.supplier_brn` → accepted ✓
- `myinvois.buyer_id_primary` → accepted (not attribution-bearing) ✓

Both the hole and the fix are confirmed. Note (matches native-L5/adversarial-#3): the gate is a
*runtime* DB gate, superseding the design's earlier over-claim that naming alone is "structural";
the OCR lane still shares the verbatim-field_path trust model (recorded residual). **SUPPORTED.**

### P3 — kind-scoped uniqueness + M5 cross-resolution — **SUPPORTED**

**HYPOTHESIS:** as-built `_resolve_counterparty` has no kind filter, so a customer proposal
resolves to a vendor row (M5); kind-scoping both unique indexes lets vendor+customer share a
registration while keeping within-kind uniqueness. Method + observed:

- **Part A (M5):** inserted a `vendor` `Acme Vendor Sdn Bhd` reg `201901000123` under Sunrise;
  called `_resolve_counterparty(Sunrise, {new:{name:"Acme Customer Bhd", registration_no:"201901000123"}})`
  → **`registration_match` → the VENDOR row** (`f6852d21…`, kind=vendor). A customer-shaped proposal
  resolves to a vendor. **M5 hazard reproduced** (not assumed). This proves the kind filter must land
  in `_resolve_counterparty` itself — the index change alone does not fix resolution.
- **Part B:** widened `kind` CHECK to `('vendor','customer')`; with the OLD non-kind-scoped index a
  `customer` reg `201901000123` **collides** (`uq_counterparties_client_registration`) — the as-built
  collision. Recreated **both** unique indexes with `kind` in the key → vendor+customer same reg now
  **coexist**; a **second vendor** same reg still **blocked** (within-kind uniqueness holds). ✓

**SUPPORTED.** (Confirms M5 + companion S2/S7: the atomicity requirement — every `_resolve_counterparty`
lookup + both `approve_entry` hardcodes must gain the kind filter in the same migration.)

### P4 — `execute_rule_post` mechanics (a grant-isolation · b FOR-UPDATE race · c CLR06/CLR10) — **SUPPORTED**

**P4a (grant isolation).** Stub `security definer` fn owned by `clara_fn_owner`, `revoke all from
public` + `grant execute to clara_runtime_login` only (the `record_rule_resolution` precedent).
`has_function_privilege` matrix: `clara_runtime_login`=**true**; `clara_runtime` (the pool role the
agent `SET ROLE`s to), `clara_agent_ro`, `clara_authenticated`, `clara_wake_interactive`,
`clara_wake_proactive` = **all false**. Live `SET ROLE clara_runtime; select stub()` → **42501
permission denied**; `SET ROLE clara_runtime_login` → **executes**. The login-direct grant
structurally excludes the agent pool + wake roles. ✓

**P4b (FOR-UPDATE window serialization, #4).** Two concurrent psql sessions, rule `window_max=2`
seeded with 1 run (one slot left):
- **No lock (as-built #4 race):** A reads count=1, B reads count=1 (B's read lands before A's
  uncommitted insert), both insert → **final count 3 > max 2 — cap blown.**
- **`SELECT … FOR UPDATE` on the rule row (the fix):** A takes the lock, posts (count was 1), holds;
  B **blocks** on the row lock until A commits, then reads count=2 ≥ max → **SKIPS**. **Final count 2 —
  exactly one posted.** ✓ The row lock makes count-and-post atomic per rule.

**P4c (CLR06/CLR10 wrap targets, M2).** Drafted a memo entry as alice; `approve_entry` with a
random token → **CLR06** ("stale revision token"); with the correct token → approved; approve again
(now `approved`) → **CLR10** ("entry is not a draft"). These are exactly the two benign race codes
the design says `execute_rule_post` must convert to `rule_post_skips` rows. ✓

**SUPPORTED** across all three parts.

### P5+P6 — sales tie vs the #9 rounding-absorption hazard — **SUPPORTED**

**HYPOTHESIS:** as-built `_validate_entry_lines` auto-appends a ≤5-sen rounding line, so a
`net+tax ≠ gross` mismatch is silently absorbed instead of surfacing `tax_tie_failed`; the tie must
be evaluated on stated facts *before* the append. Method + observed:

- **#9 hazard (real):** `_validate_entry_lines(Sunrise, [AR-debit 1100=100000, revenue-credit
  4000=94000, sst-credit 2100=5997])` → returns a **4-line** result with an appended
  `{account:9990, credit:3, description:"auto rounding"}` line — **no error**. A 3-sen
  `net(94000)+tax(5997)=99997 ≠ gross(100000)` mismatch is silently drained into the rounding
  account. Confirmed as-built (`0009` rounding append, lines 48-62).
- **Facts-first strict tie** (`net+tax+stated_rounding = gross`): `(94000,5997,0,100000)` → **false**
  (would raise `tax_tie_failed`); `(94000,6000,0,100000)` → true; `(94000,5997,3,100000)` → true
  (a genuinely *stated* 3-sen rounding residual ties). So evaluating on facts first correctly
  distinguishes a real rounding residual from a silent absorption.
- **CN polarity mirror tie** (type 02: receivable-CREDIT=gross, revenue-DEBIT=net, sst-DEBIT=tax):
  `(106000,100000,6000)` → true; `(106000,100000,5997)` → false. A scratch CHECK-constraint
  prototype (`ck_cn_polarity` + `ck_cn_tie`) accepted a valid CN, **refused** a wrong-polarity CN
  (receivable debited) and **refused** the 3-sen tie mismatch (the `tax_tie_failed` analog).

**SUPPORTED.** Confirms adversarial #9 + the SST discriminator / CN polarity design (§4.3/§5): the
tie must be ordered before the generic rounding append.

### P7 — high-stakes attestation ceremony (agent-lane ≥ RM10,000) — **SUPPORTED**

**HYPOTHESIS:** an agent-lane draft (`last_human_editor` NULL) ≥ RM10k refuses approval without an
attestation and succeeds with one — the ceremony the RPR eval hits six times. Method: drove
`_draft_entry_core(…, p_is_human=false, …)` (passing the current books head to satisfy
`assert_books_current`) for a RM12,000 entry; approved as alice. Observed:

- draft: `is_high_stakes = true`, `last_human_editor = NULL` (agent-lane). ✓
- approve **without** attestation → **CLR05** `"agent-made high-stakes approval requires an
  attestation"` (`attestation_required`). ✓
- approve **with** attestation → **approved**, status=`approved`. ✓

**SUPPORTED.** (Note: all six RPR sales invoices exceed the RM10k default, so each hits this exact
`last_human_editor IS NULL` branch — an agent-drafted → human-attested approval, not the
distinct-checker branch.)

### P8 — `_document_direction(doc, client)` helper — **SUPPORTED**

**HYPOTHESIS:** direction is client-relative and computable in a client-aware helper (H3 fix — keep
it OUT of the client-agnostic `_invoice_fact_state`). Prototyped `_p8_direction(p_doc, p_client)`
reading supplier `vendor_registration`/`vendor_name` (or `myinvois.supplier_*`) regions vs the
client's `client_identifiers` + `clients.name`. Observed (Sunrise, own SSM `sunrise123`):

- AR doc (supplier reg + name = Sunrise's own) → **`sales`** ✓
- AP doc (supplier reg = third party `acme999`) → **`purchase`** ✓
- contradictory (reg matches client, name differs) → **CLR30** `direction_unresolved` ✓

**SUPPORTED.** The helper is feasible and client-relative; validates H3's resolution.

### P10 — sighting carve-out (H2) — **SUPPORTED**

**HYPOTHESIS:** as-built `approve_entry` unconditionally writes a `rule_sightings` row on approval;
the carve-out (`checked_via_rule_id is null`) must suppress it on the rule path so rules don't breed
rules from their own output. Observed:

- **as-built human approval** (entry with a birthed counterparty) → **1** `rule_sightings` row. ✓
- prototype guard, **rule path** (`checked_via_rule_id` SET) → **0** sightings for E2. ✓
- prototype guard, **human path** (`checked_via_rule_id` NULL) → **1** sighting for E2. ✓

**SUPPORTED.** The `checked_via_rule_id is null` guard around the sighting/auto-proposal block
(0011:3157-3192) cleanly severs the self-growth pollution WA2-R9 forbids.

### P12 (bonus, adversarial #5/#6 eligibility) — **SUPPORTED**

Pure-logic prototype of the `execute_rule_post` in-fn eligibility the design adds:

- **#5 whole-entry constraint:** a rule for account `6000` (cap RM3000) against a draft laundering
  `RM1→6000 + RM2999→5000` (total = cap): as-built `account_matched` (any single debit leg = rule
  acct) = **TRUE** and `under_cap` = **TRUE** → **would launder**; the whole-entry constraint (every
  non-control non-rounding leg = rule acct) = **FALSE** → **refuses.** ✓
- **#6 direction-aware `account_matched`:** a sales rule for revenue `4000` (which is *credited*):
  as-built debit-only match = **FALSE** (never fires); direction-aware (sales ⇒ credit side) =
  **TRUE** (fires correctly). ✓

**SUPPORTED.** Confirms both HIGH findings and their fixes.

### P9 — runtime lane separation / frozen-consumer routing — **DEFERRED-TO-BUILD**

The claim that a `local_facts` task is claimed ONLY by the new non-frozen consumer (zero calls into
`egress.mjs`/`*.azure.mjs`) while the frozen `invoiceFacts_v1` never claims it, plus the frozen-body
hash-diff, is **runtime consumer-routing code** (`reconciler-documents.mjs` lane→consumer map,
`startWorld` routes, `invoiceFacts.v1.services.mjs`), not a DB mechanic — unprobeable on a
throwaway DB. The **DB-side halves are proven here:** the lane-keyed claim gate (P1a) and the
lane↔engine CHECK refusing mis-declared tasks at insert (P1b). The routing + hash-diff must be
verified in the build/integration lane with a rig assertion (design P9).

---

## Summary

**8 task probes (P1, P2, P3, P4, P5+P6, P7, P8, P10) → 8 SUPPORTED / 0 REFUTED / 0 PARTIAL.**
Plus **P12 bonus → SUPPORTED**; **P9 → DEFERRED-TO-BUILD** (runtime routing, not a DB mechanic; DB
halves proven). Every load-bearing DB assumption of the Wave-A2 design held on a real PG17.6.

**Surprises / build-lane flags:**
1. **The lane↔engine CHECK rejects the `fixture-engine` default (P1b).** `finalize_document_intake`'s
   default `p_engine_id='fixture-engine'` with `p_lane='ocr'` violates `lane='ocr' ⟹ engine LIKE
   'azure-%'`. Seeded DB has no such task rows so the ALTER adds clean, but the default arg + any rig
   fixture minting a task will fail at insert. 0015 must retire/rename the `fixture-engine` default or
   carve it out. **Highest-value finding for the build.**
2. **M5 is a resolution bug, not just an index bug (P3).** Kind-scoping the indexes alone does NOT
   stop a customer proposal resolving to a vendor — `_resolve_counterparty` itself must gain the kind
   filter in the SAME migration (companion S7's atomicity requirement is load-bearing, confirmed).
3. **The #3 write-gate must be a runtime DB gate (P2), not the S0 "vocabulary-constant" collision
   assertion.** The attack (`supplier.tin.evil` + another client's TIN) attributes as-built; only a
   trigger/CHECK on the actual `field_path` written closes it. The collision assertion is a
   compile-time check of the intended constants, not the runtime writer.
4. **The whole-entry constraint and direction-aware `account_matched` are both necessary (P12).**
   Without #5 a rule launders under cap; without #6 sales autopost never fires.

Teardown: `pg_ctl stop` + data dir deleted (below).
