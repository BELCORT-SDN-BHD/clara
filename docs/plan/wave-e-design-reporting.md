# WAVE E · E-b + E-c DESIGN — THE REPORTING ENGINE, THE FS PACK, AND THE AUTHORING LANE

> **STATUS: design draft, ROUND-1 REVIEW APPLIED (2026-08-09).** The ratified law is
> `docs/plan/wave-e-contract.md` (E-R1..E-R14). **On any conflict the contract wins**; nothing here
> re-opens a ruling. Rulings are CITED (`E-R5`), never restated at length. Round-1 fixes carry the
> orchestrator ruling id they discharge *(R7..R15, R18)*.
>
> **ONE DOCUMENT IN TWO FILES** (the repo's 500-line discipline; the skeleton's split precedent).
> **This file = §0–§5** (verification ledger · scope + the two dominating laws · **lane δ**: the
> typed metric algebra, the catalog, the evaluator/freeze/cell record, the edge policies).
> **`wave-e-design-reporting-part2.md` = §6–§12** (lane ε · lane ζ · lane η · the floors, lane map
> and decision ledger). Section numbering is continuous; "reporting §7" resolves in Part 2.
>
> **Siblings — refer, do not duplicate:** `wave-e-design-skeleton.md` (+ `-part2.md`) (campaign frame ·
> E-a period/close model · the E-R12 trio) · `wave-e-acceptance-matrix.md` (the falsifiable cells —
> this document names obligations, that one names oracles).
>
> **Scope:** lanes **δ** (metric algebra + catalog + evaluator), **ε** (FS template layers,
> wording structure, claim assessment, chart AST, sealed-artifact registry), **ζ** (render worker
> + freeze instrument + DR §10), **η** (E-c authoring lane). Lane letters, never migration
> numbers — **numbers claim at MERGE** (`packages/db/README.md:30`).
>
> **Two markers:** *(ruled — E-R#)* = contract law, not adjustable here. *(builder choice)* = a mechanic
> the contract left open; carries a one-line rationale, changeable in review without an ADR.

## 0. Verification ledger

Every EXISTS row was read at the cited line **in this pass** (2026-08-09; the round-1 reviews proved
the first draft inherited stale generations — nothing below is inherited). A MISSING row is the
absence of a found artifact, never positive evidence that the thing cannot exist.

| Claim | State | Evidence |
|---|---|---|
| The 0016 system-reference idiom (effective-dated fact table, no firm writer, mandatory `source_note`) | EXISTS | `0016_a21_compliance_watch.sql:234-236` (the "NO firm-editable writer exists, asserted in the tail" sentence), table `:237-244`, PK `(service_group, effective_from)` `:243`; re-used and NAMED "the 0016 system-reference idiom" by `0043_wave_d_b1_staff_advances.sql:617-618` |
| The EXECUTE grant matrix | EXISTS | `0004_governed_fns.sql:744-799` — PUBLIC revoke `:752-753`, human writers `:766-780`, **wake writers `:782-788`** (interactive) + `:789` (proactive), runtime `:791-793`, reads `:795-797`. Internal helpers stay ungranted by design (`:749-750`) |
| A table SELECT (not EXECUTE) grant to `clara_agent_ro` is house style | EXISTS | `0005_event_spine.sql:408` (`grant select on clara.domain_events to clara_authenticated, clara_agent_ro, clara_runtime`) |
| `wake_fn_allowlist` — per-`wake_kind` belt on top of the EXECUTE grants | EXISTS | `0002_foundation.sql:245-251` (comment `:245-246`, table `:247-251`) |
| Immutable receipt + jsonb snapshot + transition/no-delete triggers + recompute-and-diff `verify_*` | EXISTS | `0040_wave_c_c_tieout.sql:262` (`bank_reconciliations`), `:351` (`_tf_bank_reconciliation_transition`), `:379` (`_tf_bank_reconciliation_no_delete`), `:4537-4644` (`verify_bank_reconciliation`, revoke at `:4644`) |
| Content-addressed custody: key validation + overwrite-impossible PUT + streaming re-hash verify | EXISTS | `packages/runtime/lib/storage.mjs:16-22` (`safeKey`, regex `firms/{uuid}/docs/{sha256}.{ext}`), `:40-62` (positive role-claim check — about the ROLE, not the key prefix) |
| Freeze-lint: `packages/` scope, JS/TS only, append-only vs base is the durable half | EXISTS | `scripts/check-frozen-workflows.mjs:107` (`SCAN_PATHSPEC="packages"`), `:108` (`SOURCE_EXT` — no `.sql`), `:102-103` (`BASE_REF` resolution **only**), **append-only enforcement `:424-441`** (`REMOVED-VS-BASE` `:432`, `UNLOCKED-VS-BASE` `:437`, `REHASHED-VS-BASE` `:440`), base-unavailable **fails closed under CI** `:442-455`, `--update` CI-refused `:311`, `--lock-deployed` CI-refused `:338` |
| `@frozen` selection is independent of the WDK workflow directive | EXISTS | `FROZEN_MARKER` `:82`; `computeFrozenSet` selects by marker + import closure `:276-293`; the directive scan is a separate filter `:300` |
| Separate-Fly-app batch-worker precedent (no `[http_service]`, build-only+push, commands in ONE place, coarse schedule) | EXISTS | `packages/backup/fly.toml:1-11` (separate app; "the exact commands live in ONE place — DR.md §9 step 6"), `:13-17` (`fly machine run` DISREGARDS fly.toml — its flag set IS the runtime contract), `:27-29` (batch, dead-man's-switch liveness), `:40-45` (Fly schedule granularity is hourly/daily/weekly/monthly, approximate) |
| DR.md's last `##` is §9; its verify cadence is **monthly-light + quarterly STRICT**; live chat pin is `chatTurn_v10` | EXISTS | `docs/ops/DR.md:349` is the last `##` (the file runs to `:497`); cadence named `:329`, `:344`, header `:491`; §5/§5b are the described-drill + exercised-evidence idiom (`:152`, `:203`); `packages/runtime/workflows/registry.ts:38-47` |
| Any metric-algebra, catalog, FS-template, chart, claim, sealed-artifact or render object | **MISSING** | repo-wide search for `evaluate_fs_pack`, `report_template_versions`, `statutory_profile`, `chart_template`, `report_claim_assessment`, and for a render/PDF module under `packages/runtime/lib/`, hit only the research file |
| A `.sql`-body freeze instrument · a reports storage prefix · **any event trigger** | **MISSING** | the lint's `SOURCE_EXT` (`:108`) excludes `.sql` and no sibling script exists; `storage.mjs` holds exactly two key families; a search for `create event trigger` / `ddl_command_end` across `packages/db/migrations/` returns **zero** hits (searched, not proven impossible — see §4.2) |

**Not assumed here:** the books-watermark/snapshot token type, the period-row shape and the period
REGISTRY are **E-a's** (lane γ); everything below binds them by name, and columns marked `→ γ` take
lane γ's shape.

## 1. Scope, non-goals, and the two dominating laws

**E-R4 governs every numeral path.** Its binding interpretation is the design premise
(`wave-e-contract.md:112-126`): "authoritative" reaches transient UI; the ratified sentence is a
PERMISSION grant, not a relaxation; "reproduces" means **ORIGINATES** (a model numeral is never an
evaluator input, and echoing a stored model numeral is not reproduction); a model check emits a
**discrepancy signal only**. The retained stricter operational law governs where the two could
diverge — `docs/prd/PRD.md:183`, "Model-computed numbers in any artifact | Every figure from DB
functions". One structural rule follows *(R15 — SCOPED)*:

> **No numeral in a REPORT or RENDERED quantitative claim enters a persisted or presented object
> except through a cell row minted by a versioned evaluator.** Prose and charts take figures by
> placeholder substitution from cells.

**The boundary, stated so the rule cannot be over-read** *(R15; Codex 17)*: the rule governs the
report/render domain — the cells, packs, charts, previews and artifacts of §§4, 7-11. It does **not**
reach (a) structural integers (column spans, row counts, font sizes, `lag.periods`, the §2.4 bounds),
(b) identifiers, hashes and counts, or (c) **E-a's close receipts**, whose P&L / TB / tie numerals are
persisted by the deterministic, audited close functions reading DB-owned inputs — already E-R4-compliant
by the same law, through a different evaluator. Nothing in E-b re-computes or restates those numerals;
a report that PRESENTS one takes it through a cell like any other figure.

The rule is enforced in five places, each a real section: **§2.4** (validator proof 5), **§4.3** (the
cell record), **§7** (claim assessment + protected placeholders), **§8** (charts plot `cell_id`-bound
points), **§11** (the authoring lane substitutes placeholders, never types figures).

**Law 2 (absence is not evidence) is a schema property here, not a habit** — the missing-data edge
policy (§5.3), the claim-status reads (§7) and the watermark read (§11) each fall to refuse on an
absent/NULL/unreadable input.

**Non-goals.** Tax computation is NOT in E (PRD §8's exclusion stands) — no tax computation, no
deferred-tax note engine; no consolidation, no perpetual inventory. ALL UX polish is Wave G
*(E-R10)*; lane θ's `/reports` is a plumbing-grade sibling of `/rules`. No MyInvois XML. The
settlement-corroboration door is design-only in E *(E-R13)*.

## 2. Lane δ · THE TYPED METRIC ALGEBRA (E-R5)

### 2.1 The AST
Schema tag **`clara.metric/v1`** *(builder choice — mirrors the ratified `clara.chart/v1` convention so
both ASTs version identically)*. Closed JSON schema: **unknown fields rejected**, no escape hatch, and
**no numeric-literal node** beyond structural integers (`lag.periods`, `result_scale`, the §2.4 bounds).

```jsonc
{ "ast":"clara.metric/v1", "unit":"ratio", "temporality":"flow",   // declared, then checked
  "result_scale":4, "edge_policy_set":"eps_v1",                    //   against inference
  "root": { "node":"divide",
    "num": {"node":"measure","set":{"key":"revenue","kind":"account_set"},"aspect":"period_movement",
            "sign":"natural","scope":{"period":"$P0","entity":"$CLIENT","basis":"accrual"}},
    "den": {"node":"lag","periods":1,"of":{ /* the same measure */ }} } }
```

Periods and entity are **parameters** (`$P0`, `$P-1`, `$CLIENT`) bound at evaluation, so a definition
is period-agnostic and reusable. **A bound period is a `clara.reporting_periods` row id** *(R7 — lane
γ owns the registry: `id, firm_id, client_id, period_start, period_end, grain 'month'|'fiscal_year'`,
minted refs)*; `$P-1` resolves to the prior row of the same grain for the same client. The cell records
the bound period ids (field 2).

### 2.2 The primitive set
**Ratified eight** *(E-R5)*: `measure` · `sum` · `average` · `lag` · `subtract` · `divide` ·
`days_in_period` · `percent_change`. **Three proposed additions** *(builder choice — the ruled set carries a trailing "…"; each is otherwise inexpressible)*:

| Node | Why needed | Why safe |
|---|---|---|
| `multiply` | debtor days = `divide(average(debtors), revenue) × days_in_period` | the dimension vector rejects currency×currency automatically — no special-casing |
| `constant` | E-R4 names "approved, versioned constants" as lawful inputs; otherwise they arrive as literals, which the AST forbids | resolves to a `metric_constants` row (effective-dated, 0016 idiom) |
| `count` | research names `count` as a dimension (`q4-…:272`); "number of open invoices" has no other producer | `divide(count,count)`→ratio, `divide(currency,count)`→currency-per-unit, both legal |

**Adding a primitive is a migration + an evaluator `_vN` bump + an independent review** — not a catalog
act *(builder choice; closes `algebra.md` open (f)7)*. Adding a **definition** is the draft→approve
lane (§3.2); adding a **primitive** changes the evaluator's own body.

### 2.3 Types, scopes, mechanical rejection
Every value carries a **dimension vector** `(currency^a · days^b · count^c)` (dimensionless = `ratio`),
a **temporality** (`point_in_time` | `flow` | `period_average`), **period**, **entity**, **basis**, and
the **account-set** + **presentation-map** versions that produced it.

| # | Rule | Refusal token → named fix *(E-R5: the validator names the fix)* |
|---|---|---|
| T1 | `subtract`/`sum` operands match on dimension, temporality and period | `dimension_mismatch`/`temporality_mismatch` → "wrap the stock leg in `average`" |
| T2 | `divide(point_in_time, flow)` REJECTED — the ruled closing-balance ÷ annual-flow case | `stock_over_flow` → "`average(...)` the numerator, `multiply` by `days_in_period`" |
| T3 | `average` of a `point_in_time` yields `period_average` (legal against a flow) | — |
| T4 | `multiply` may not produce `currency^2` | `dimension_overflow` |
| T5 | mixed `basis` or mixed `entity` in one tree | `scope_mismatch` (single-entity books, PRD §8) |
| T6 | declared `unit`/`temporality` ≠ inferred | `declaration_mismatch` — the declaration is the human-readable contract; silent inference is not |
| T7 | `lag` beyond the client's first period | `absent` per §5.3, never zero |

**T3 detail — the SAMPLING policy, because "average" alone is not deterministic** *(R12; builder
choice)*. Averaging a `point_in_time` needs a stated grain: opening/closing, month-end, and daily
averages give different debtor-days. **Versioned default `avg_month_end_v1`: the arithmetic mean of the
balance at each MONTH-END contained in the bound period** (n = month-ends in `[period_start,
period_end]`, each read from the pinned snapshot). Named alternates ship as sibling policy rows
(`avg_open_close_v1` = (opening + closing)/2; `avg_daily_v1` reserved, unimplemented in v1). The policy
id is a field of the definition version and is **hashed into the formula hash** (§3.1), so two
conforming evaluators cannot disagree and a change of grain is a new version. Rationale: the sampling
grain changes the answer, so it is an approved, versioned decision — never an evaluator's discretion.

`count` is adopted as a first-class dimension *(builder choice — the ruled parenthetical is not framed as exhaustive; `algebra.md` (a) flags it as research-present/contract-absent. Flagged.)*

### 2.4 Validator obligations — the five proofs *(ruled — E-R5)*
1. **Syntax** — closed schema, unknown fields rejected, no literal numerals.
2. **Types** — §2.3; the refusal always names the fix.
3. **Scope** — every period/entity/basis resolves; every referenced account-set,
   presentation-map, constant and policy version **exists and is effective** for the target
   period; RLS-visible to the caller.
4. **Cost bounds — split honestly into two classes** *(R12; builder choice — `algebra.md` open (f)4)*:
   - **Definition-static, provable at APPROVAL time** (properties of the tree itself, which cannot
     drift): nodes ≤ 64 · depth ≤ 12 · distinct `measure` leaves ≤ 32 · `lag` depth ≤ 24 periods ·
     **account-set expansion ≤ 512 accounts/leaf, measured against the FROZEN resolved account list**
     of each referenced `account_set_version` (below).
   - **Evaluation-time** (properties of the run, which depend on data and parameters): cells per run
     ≤ 5,000 · `set local statement_timeout` per cell batch (15s) · the account-set **drift check**.
   Either class's breach is a `cost_exceeded` refusal — **never a truncated or partial result**.
   **The account-set decision, stated** *(R12 — pick one and say it)*: an `account_set_version`
   **freezes its RESOLVED account-id list** (materialized and hashed at version creation), not merely
   its selector. So the expansion bound IS static, and a new chart account cannot silently join an
   approved set. The cost of that choice is paid explicitly: at evaluation the evaluator re-resolves
   the selector and compares hashes; on a difference the cell is `refused` with `account_set_drift`
   and the named fix "mint a new account-set version" *(fail-loud, because the alternative — silently
   omitting a new revenue account from a statutory pack — is the wrong-answer-that-looks-right class)*.
5. **Provenance completeness** — a tree that would mint a cell missing any of the ten fields
   (§4.3) fails validation *before* it can be saved or evaluated.

The validator explicitly does **not** claim professional appropriateness *(ruled)*; the refusal copy must say so.

### 2.5 Exact-decimal semantics
Money is **`bigint` cents end to end** *(E-R5 / PRD invariant 6)*; there is no money-typed division
result (currency ÷ currency is a `ratio`). **Division is EXACT RATIONAL until one final rounding**
*(R12 — the guard-digits phrasing is withdrawn; `result_scale + 4` guard digits already round an
intermediate)*: a `divide` node carries its numerator and denominator forward as an exact pair
(cents/cents, or `numeric` without a scale cast); composition multiplies through the pair
(`(a/b)·c → (a·c)/b`); the single division-and-round happens **once**, at the declared
`result_scale`, under §5.5's policy. **No float anywhere:** the evaluator body may contain no
`float4`/`float8`/`real`/`double precision`/`::float` token, enforced by a migration-tail lex
assertion over `pg_get_functiondef` **using word-boundary regexes** (`\mreal\M`, `\mdouble
precision\M`, …) so an identifier or comment containing `real` does not false-positive; the assertion
states its own exception handling *(builder choice — the §7-A roster-assertion instrument; it is a
positive read of the live catalog, not an absence claim about a file)*. `days_in_period` returns an
integer day count **from the bound `clara.reporting_periods` row** (`period_end - period_start + 1`,
both ends inclusive) *(R7 — γ owns the row; δ reads it)*.

## 3. Lane δ · THE CATALOG

### 3.1 Tables

| Table | Shape | Notes |
|---|---|---|
| `clara.metric_definitions` | `id, firm_id null, key, title, unit, temporality, created_by/at` | `firm_id is null` = product-curated. Partial uniques: `(key) where firm_id is null`, `(firm_id,key)` otherwise |
| `clara.metric_definition_versions` | `id, definition_id, revision, ast jsonb, normalized_ast jsonb, formula_sha256, result_scale, edge_policy_set_id, averaging_policy_id, allow_negative bool, state, applies_from/to, supersedes_version_id, proposed_by jsonb, approved_by/at, approved_formula_sha256` | insert-once; trigger blocks UPDATE outside lifecycle columns and blocks DELETE (`0040:351`/`:379` idiom) |
| `clara.metric_constants` | `(constant_key, effective_from) PK, value_numeric, unit, effective_to, source_note not null` | **0016 idiom** (`0016:237-244`) — no granted writer |
| `clara.account_sets` / `_versions` | set key → selector (code ranges / types / explicit codes) **+ the FROZEN resolved account-id list** and its hash, `zero_when_no_rows bool` (§5.3), `content_sha256` | the leaf-resolution layer; §2.4's drift check compares against the frozen list |
| `clara.presentation_maps` / `_versions` | FS line ↔ account-set binding per statutory profile | provenance field 3's second half |
| `clara.edge_policy_sets` / `clara.metric_edge_policies` | §5 (+ the §2.3 sampling policies) | 0016 idiom |

**Two hashes, two names — they answer different questions** *(R12; Codex 10 gap 3; builder choice —
`algebra.md` open (f)6)*:

- **`formula_sha256` — PERIOD-AGNOSTIC, the definition's identity.**
  `sha256(canonical_json(normalized_ast) ‖ unit ‖ temporality ‖ result_scale ‖ edge_policy_set_id ‖
  averaging_policy_id ‖ allow_negative ‖ sorted referenced catalog KEYS)` — keys, never resolved
  version ids, because those resolve per period. Normalization = key ordering, whitespace elimination,
  canonical parameter renaming, commutative-operand ordering. Title/description edits do NOT move it;
  anything the evaluator reads does. **Approval binds `approved_formula_sha256 = formula_sha256`**
  *(ruled — approval is bound to the exact content hash/revision)*; a mismatch refuses.
- **`resolved_inputs_sha256` — PER CELL, the evaluation's identity.**
  `sha256(bound period ids ‖ entity ‖ basis ‖ sorted RESOLVED version ids (account-set,
  presentation-map, constants, policies) ‖ evaluator_version_id ‖ books watermark)`. This is what makes
  "same definition, different period or different effective versions" a different, provable cell.

### 3.2 Lifecycle
The five states and their rendering rights are **ruled — E-R5**. This design adds only enforcement:
transitions ride named audited fns (`propose_metric_definition` → `draft`;
`approve_metric_definition(version_id, expected_formula_sha256, reason)` → `firm_approved`;
`reject_…`; `supersede_…`), direct DML stays revoked (invariant 10), and **`canonical` has no
granted writer at all** — canonical rows arrive by migration only (0016 idiom, `0016:234-236`), so
neither a human nor a model can mint one. **Approval carries PRD §2's segregation, not just a role
floor** *(R18; E-R5 `wave-e-contract.md:163-165`)*: the approver must be a different human from the
proposer (`proposed_by`), the hard-gate shape PRD names at `docs/prd/PRD.md:50`; a solo firm records
the explicit self-approval attestation on the same branch PRD uses. The model can never be approver
(it holds no such verb). **Statutory eligibility is a mechanical predicate** evaluated at seal time:
`definition_version_id is not null AND state in ('canonical','firm_approved') AND effective for the
reporting period`. Effective-dating keys off the reporting period's start, not the render date.

### 3.3 Canonical seeds — what seeds now, what waits
**Seeds in lane δ (no MASB dependency, no wording):** current ratio · quick ratio · gross margin %
· net margin % · revenue growth % · debtor days · creditor days · stock turnover · gearing ·
expense-to-revenue ratios. **Waits on the owner gates:** every wording-adjacent artifact —
statement titles, FS line captions, note headings, claim phrasing — is lane ε **structure** with
**zero seeded rows** until task #43 (MASB manual pull + HUMAN verify) and #44 (sole-prop positive
primary check) *(ruled — E-R14)*. **Seam for the reviewer** *(builder choice, flagged)*: a ratio
needs account-set bindings (`current_assets`, `trade_debtors`), and current/non-current
CLASSIFICATION is presentation STRUCTURE, not MASB WORDING — so classification sets seed in δ and
all human-facing text waits. If a reviewer reads classification as wording-adjacent, those seeds
move to ε behind the gate; no ruling is disturbed either way.

## 4. Lane δ · EVALUATOR, FREEZE, CELL RECORD

### 4.1 Shape
`clara.evaluate_metric_v1(p_client, p_definition_version_id, p_period_ids uuid[], p_snapshot_id,
p_run_id)` and the pack driver `clara.evaluate_fs_pack_v1(...)` — SECURITY DEFINER, pinned
`search_path`, EXECUTE to `clara_authenticated` only (the wake lane reaches them only as an internal,
ungranted call from a `wake_*` wrapper — §11). **The algebra evaluator IS a reporting evaluator for
immutability purposes** (campaign-frame decision; resolves `algebra.md` open (f)3 conservatively): a
behavioural change ships as `_v2`, never `CREATE OR REPLACE` on a referenced body *(ruled — E-R14)*.

### 4.2 The freeze instrument — the default design, plus one OPTIONAL hardening
*(builder choice — the contract calls the lint "the natural enforcement instrument" and marks its
mechanics adjustable, `wave-e-contract.md:367-369`.)* **The `ddl_command_end` event trigger comes OFF
the critical path** *(R8)*. Four parts ship as the default; the trigger is belt, probed live, never
inside a ceremony.

1. **DB registry — `clara.evaluator_versions`** `(name, version, body_sha256, migration_version,
   deployed bool, created_at)`: insert-once, a queryable record of what is frozen and what is live.
   `body_sha256` is computed at apply time from `pg_get_functiondef(oid)` — a **positive read of the
   live catalog**, never an assertion copied from the file.
2. **Migration-tail positive read (the enforcement that actually catches the realistic threat).**
   Every migration that creates or replaces a `clara.evaluate_%_v%` body recomputes
   `sha256(pg_get_functiondef(oid))` for each `deployed` evaluator in its own tail and RAISEs on any
   difference — the same tail-assertion idiom 0037/0038/0040/0042 use dozens of times. A later
   migration silently replacing a frozen body dies at apply time, in the transaction that did it.
3. **Ceremony-time `clara.verify_evaluator_freeze()` returns jsonb** — a positive deploy read joining
   the standing positive-deploy-read law and `--lock-deployed` (`check-frozen-workflows.mjs:338`
   refuses that flag under CI; it stays a local ceremony act).
4. **CI sibling — `scripts/check-frozen-evaluators.mjs`**, a sibling of `check-frozen-workflows.mjs`
   with a `frozen-evaluators.json` manifest of the same shape. A sibling, not a widening, for a
   measured reason: `SOURCE_EXT` (`:108`) covers only JS/TS, so `.sql` migration bodies are outside
   the existing lint's reach even though `SCAN_PATHSPEC` (`:107`) already includes
   `packages/db/migrations`. It reuses the durable half verbatim — **append-only vs `origin/main`**
   (`:424-441`; a removed entry `:432` or a rehash of a `deployed:true` entry `:440` is a hard
   reject), including the fail-CLOSED base-unavailable branch under CI (`:442-455`).

**Honesty boundary**, in `packages/db/README.md:32-38`'s own idiom: this defends against a later
migration and against application/agent/definer-bug mutation — **not** against a role that can
`CREATE OR REPLACE` outside the migration runner.

**OPTIONAL hardening — the event trigger, behind a LIVE PREFLIGHT** *(builder choice; the two round-1
reviews disagree and BOTH positions are recorded, per R8)*.
- **Position A (native):** zero event triggers exist in any migration (searched — §0's MISSING row);
  `CREATE EVENT TRIGGER` has no grantable privilege in core PostgreSQL; and this repo's deploy role is
  a **non-superuser Supabase `postgres`** off CI, stated in the schema's own words at
  `0002_foundation.sql:103-104`. Failure mode is the worst shape: CI (superuser) passes, the live
  apply fails mid-ceremony on the campaign's largest migration.
- **Position B (Codex):** a current managed Supabase project CAN create event triggers, because
  supautils grants that specifically to the project's `postgres` role; the migration must `RESET ROLE`
  first, since `clara_fn_owner` will not qualify. Vanilla CI is not evidence for the managed path.
- **Resolution: decide at BUILD time on a live probe** — a preflight that positively reads
  `current_user` / `is_superuser` and attempts a throwaway event trigger on the hosted project,
  run **outside and before** any ceremony window. Probe fails → the four-part default stands unchanged
  and nothing is lost. Probe passes → the trigger is added as belt, and its unlock path is a
  **migration-minted new version row**, never a caller-settable GUC (E-a's BL-2 lesson: session state
  is not authorization).

The render worker's determinism-critical TS modules (§10) sit under `packages/`, so the EXISTING lint
covers them once marked `@frozen` — verified this pass: `FROZEN_MARKER` at `:82` and `computeFrozenSet`
(`:276-293`) select by that marker plus the import closure, independently of the workflow-directive
scan (`:300`). *(The draft's hedge is withdrawn; the claim is proven.)*

### 4.3 `clara.metric_cells` — the ten ruled fields

| # | Ruled field | Column(s) |
|---|---|---|
| 1 | definition version / normalized formula hash | `definition_version_id uuid null`, `formula_sha256 bytea not null`, **`resolved_inputs_sha256 bytea not null`** (§3.1's two hashes) |
| 2 | periods | `period_ids uuid[] not null` → `clara.reporting_periods` (lane γ) |
| 3 | account-set + presentation-map versions | `account_set_version_ids uuid[]`, `presentation_map_version_id` |
| 4 | input values and entry/document references | `inputs jsonb not null`, `entry_ids uuid[]`, `document_ids uuid[]` |
| 5 | books watermark | `books_watermark` → lane γ's snapshot token |
| 6 | evaluator version | `evaluator_version_id` |
| 7 | exact result and displayed rounding | `result_cents bigint null`, `result_numeric null`, `displayed_scale`, `displayed_text`; **CHECK conditional on status** *(R18/MINOR 1)*: `cell_status='ok'` ⇒ exactly one of the two non-null and consistent with `unit`; any other status ⇒ **both null** |
| 8 | the model proposal | `model_proposal_id uuid null` (model + version + prompt hash). **Never a numeral.** |
| 9 | the human approval | `human_approval_id uuid null` |
| 10 | supersession links | `supersedes_cell_id uuid null` |

Plus `id, firm_id, client_id, report_run_id, cell_status ('ok'|'undefined'|'absent'|'refused'),
reason_code, created_at`; forced RLS; insert-once, UPDATE/DELETE trigger-blocked.

**No per-cell renderer-version column** — the contract dropped it deliberately from the per-cell
list (`algebra.md` (d)/(g)); renderer identity pins at the **seal** (§9), and conflating the two
lists is the exact error that digest warns against. **Retention: seven years, no pruning** (CA 2016
s.245) — the campaign's largest new table; a capacity item for the matrix, not a reason to summarize.

## 5. Lane δ · THE FIVE NAMED EDGE POLICIES

Five classes are **ruled — E-R5**; CONTENT was left open. Each proposal is a versioned row
(`policy_key, version, semantics jsonb, effective_from, source_note`) on the 0016 idiom, bundled
into an `edge_policy_set` that a definition version references by id. (§2.3's sampling policies ride
the same set; they are a SIXTH, separately-named class, flagged as an addition, not a re-cut of the
ruled five.)

1. **Division by zero → `undefined_cell`.** Status `undefined`, reason `divide_by_zero`, value
   NULL, rendered as an em-dash plus a footnote key. **Never 0, never ∞, never silently omitted.**
   An `undefined` cell in a REQUIRED statutory slot makes the claim `failed` (§7).
2. **Negative denominators → `signed_ratio_refuse` (default).** Where the denominator is declared
   non-negative (revenue, equity, total assets), a negative value yields `undefined` +
   `negative_denominator`. A definition may opt into `allow_negative` — **an explicit boolean field of
   the version, hashed into `formula_sha256`** *(R12; §3.1)*, so the opt-in is approved and versioned
   rather than implicit, and the cell carries a `negative_base` label. Rationale: negative-equity
   gearing is meaningful only when the reader is told it happened.
3. **Missing data → `absent_is_absent`.** A leaf with no rows resolves to `absent`, NOT zero,
   unless the account-set version declares `zero_when_no_rows = true` — an approved, versioned
   assertion that "no rows" genuinely means zero for that set (a live account with no postings),
   as distinct from an unbound or unresolvable reference. `absent` propagates through every node
   except a `sum` over a set declared complete. **This is Law 2 as a schema property.**
   **Statutory effect, stated** *(R18/MINOR 24)*: an `absent` cell in a REQUIRED statutory slot makes
   the claim **`failed`**, exactly as `undefined` does — a required figure the pack cannot produce is
   a failed presentation profile whichever way it failed. (T7's `lag`-before-first-period `absent` is
   the same rule; a comparative column is a required slot only where the profile says so.)
4. **Sign normalization → `natural_then_declared`.** Every `measure` reads the DB's natural signed
   convention; the definition declares `present_as` (`natural`|`positive_expense`|
   `positive_revenue`); normalization happens **once, at the measure leaf**, is recorded in the
   cell's `inputs`, and is FORBIDDEN mid-tree (a validator rule). Rationale: two flips at two
   levels is the canonical silent-wrong-answer and is invisible in the output.
5. **Rounding → `half_up_once_at_declared_scale`.** The exact rational pair of §2.5 is divided and
   rounded **exactly once**, at the declared scale, with numeric `round()` (half-away-from-zero; the
   negative-value behaviour is written into the policy row, not left to a reader's assumption). Money
   is never re-rounded — cents are exact. **Presentation rounding (e.g. RM'000) is a separate,
   per-cell recorded act (field 7); totals are computed from unrounded cents, never cross-cast from
   displayed values.**

---

*Part 1 ends at §5. **§6 onward — the six-layer template model, claim assessment and
anti-smuggling (§7), the chart AST (§8), sealed artifacts (§9), the render worker + DR §10 (§10),
the E-c authoring lane (§11) and the floors/lane-map/decision ledger (§12) — continue in
[`wave-e-design-reporting-part2.md`](./wave-e-design-reporting-part2.md).* Section numbering is
continuous; the two files are one document.*
