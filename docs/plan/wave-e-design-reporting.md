# WAVE E · E-b + E-c DESIGN — THE REPORTING ENGINE, THE FS PACK, AND THE AUTHORING LANE

> **STATUS: design draft, pre-review.** The ratified law is `docs/plan/wave-e-contract.md`
> (E-R1..E-R14). **On any conflict the contract wins**; nothing here re-opens a ruling. Rulings
> are CITED (`E-R5`), never restated at length.
>
> **Siblings — refer, do not duplicate:** `wave-e-design-skeleton.md` (campaign frame · E-a period/close
> model · the E-R12 trio) · `wave-e-acceptance-matrix.md` (the falsifiable cells — this document names
> obligations, that one names oracles).
>
> **Scope:** lanes **δ** (metric algebra + catalog + evaluator), **ε** (FS template layers,
> wording structure, claim assessment, chart AST, sealed-artifact registry), **ζ** (render worker
> + freeze instrument + DR §10), **η** (E-c authoring lane). Lane letters, never migration
> numbers — **numbers claim at MERGE** (`packages/db/README.md:14-30`).
>
> **Two markers:** *(ruled — E-R#)* = contract law, not adjustable here. *(builder choice)* = a mechanic
> the contract left open; carries a one-line rationale, changeable in review without an ADR.

## 0. Verification ledger

Every EXISTS row was read at the cited line. MISSING rows were **searched**; a MISSING row is the absence of a found artifact, never positive evidence that the thing cannot exist.

| Claim | State | Evidence |
|---|---|---|
| The 0016 system-reference idiom (effective-dated fact table, no firm writer, mandatory `source_note`) | EXISTS | `0016_a21_compliance_watch.sql:234-248` (`clara.sst_threshold_schedule`, PK `(service_group, effective_from)`); re-used and NAMED "the 0016 idiom" by `0043_wave_d_b1_staff_advances.sql:617-618` |
| The EXECUTE grant matrix; `clara_agent_ro` holds **zero** write grants | EXISTS | `0004_governed_fns.sql:744-799` — public revoke `:752-753`, human writers `:766-780`, wake writers `:781-788`, reads `:795-797` |
| Immutable receipt + jsonb snapshot + prior-chain + recompute-and-diff `verify_*` | EXISTS | `0040_wave_c_c_tieout.sql:262-335`, `:351`/`:379` (immutability triggers), `:4537-4644` (`verify_bank_reconciliation`) |
| Content-addressed custody: key validation + overwrite-impossible PUT + streaming re-hash verify | EXISTS | `packages/runtime/lib/storage.mjs:16-22` (`safeKey`), `:40-62` (positive role-claim check), `putCanonical`/`hashCanonical`/`verifyCanonical` |
| Freeze-lint covers all of `packages/` but only **JS/TS** source | EXISTS | `scripts/check-frozen-workflows.mjs:107` (`SCAN_PATHSPEC="packages"`), `:108` (`SOURCE_EXT` — no `.sql`), `:102-103` (append-only vs `origin/main`) |
| Separate-Fly-app batch-worker precedent (no `[http_service]`, build-only+push, commands in ONE place) | EXISTS | `packages/backup/fly.toml` (whole file; it states that law itself) |
| DR.md ends at §9; live chat pin is `chatTurn_v10` | EXISTS | `docs/ops/DR.md:349` is the last `##` (zero mentions of render/report/sealed artifact); `packages/runtime/workflows/registry.ts:38-47` |
| Any metric-algebra, catalog, FS-template, chart, claim, sealed-artifact or render object | **MISSING** | repo-wide search for `evaluate_fs_pack`, `report_template_versions`, `statutory_profile`, `chart_template`, `report_claim_assessment`, and for a render/PDF module under `packages/runtime/lib/`, hit only the research file |
| A `.sql`-body freeze instrument · a reports storage prefix | **MISSING** | the lint's `SOURCE_EXT` (`:108`) excludes `.sql` and no sibling script exists; `storage.mjs` holds exactly two key families |

**Not assumed here:** the books-watermark/snapshot token type and the period-row shape are **E-a's**; everything below binds them by name, and columns marked `→ E-a` take E-a's shape.

## 1. Scope, non-goals, and the two dominating laws

**E-R4 governs every numeral path.** Its binding interpretation is the design premise:
"authoritative" reaches transient UI; the ratified sentence is a PERMISSION grant, not a
relaxation; "reproduces" means **ORIGINATES** (a model numeral is never an evaluator input, and
echoing a stored model numeral is not reproduction); a model check emits a **discrepancy signal
only**. One structural rule follows, enforced in six places (§2.4, §4.3, §7.2, §8, §9.2, §11.4):

> **No numeral enters a persisted or presented object except through a cell row minted by a
> versioned evaluator.** Prose and charts take figures by placeholder substitution from cells.

**Law 2 (absence is not evidence) is a schema property here, not a habit** — the missing-data edge
policy (§5.3), the claim-status read (§7.2) and the watermark read (§11.4) each fall to refuse on an
absent/NULL/unreadable input.

**Non-goals.** Tax computation is NOT in E (PRD §8's exclusion stands) — no tax computation, no
deferred-tax note engine; no consolidation, no perpetual inventory. ALL UX polish is Wave G
*(E-R10)*; lane θ's `/reports` is a plumbing-grade sibling of `/rules`. No MyInvois XML. The
settlement-corroboration door is design-only in E *(E-R13)*.

## 2. Lane δ · THE TYPED METRIC ALGEBRA (E-R5)

### 2.1 The AST
Schema tag **`clara.metric/v1`** *(builder choice — mirrors the ratified `clara.chart/v1` convention so
both ASTs version identically)*. Closed JSON schema: **unknown fields rejected**, no escape hatch, and
**no numeric-literal node** beyond the structural integers of §2.3.

```jsonc
{ "ast":"clara.metric/v1", "unit":"ratio", "temporality":"flow",   // declared, then checked
  "result_scale":4, "edge_policy_set":"eps_v1",                    //   against inference
  "root": { "node":"divide",
    "num": {"node":"measure","set":{"key":"revenue","kind":"account_set"},"aspect":"period_movement",
            "sign":"natural","scope":{"period":"$P0","entity":"$CLIENT","basis":"accrual"}},
    "den": {"node":"lag","periods":1,"of":{ /* the same measure */ }} } }
```

Periods and entity are **parameters** (`$P0`, `$P-1`, `$CLIENT`) bound at evaluation, so a definition is period-agnostic and reusable; the cell records the bound periods (field 2).

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

`count` is adopted as a first-class dimension *(builder choice — the ruled parenthetical is not framed as exhaustive; `algebra.md` (a) flags it as research-present/contract-absent. Flagged.)*

### 2.4 Validator obligations — the five proofs *(ruled — E-R5)*
1. **Syntax** — closed schema, unknown fields rejected, no literal numerals.
2. **Types** — §2.3; the refusal always names the fix.
3. **Scope** — every period/entity/basis resolves; every referenced account-set,
   presentation-map, constant and policy version **exists and is effective** for the target
   period; RLS-visible to the caller.
4. **Cost bounds** *(builder choice — `algebra.md` open (f)4)*: **static, provable at approval
   time** — nodes ≤ 64 · depth ≤ 12 · distinct `measure` leaves ≤ 32 · `lag` depth ≤ 24 periods ·
   account-set expansion ≤ 512 accounts/leaf. **Dynamic** — `set local statement_timeout` per cell
   batch (15s) and ≤ 5,000 cells per run. Rationale: the static bound means a definition can never
   be APPROVED that cannot be evaluated; the dynamic ceiling is the belt. Either breach is a
   `cost_exceeded` refusal — **never a truncated or partial result**.
5. **Provenance completeness** — a tree that would mint a cell missing any of the ten fields
   (§4.3) fails validation *before* it can be saved or evaluated.

The validator explicitly does **not** claim professional appropriateness *(ruled)*; the refusal copy must say so.

### 2.5 Exact-decimal semantics
Money is **`bigint` cents end to end** *(E-R5 / PRD invariant 6)*; there is no money-typed
division result (currency ÷ currency is a `ratio`). Ratios are `numeric` at a declared scale,
computed at `result_scale + 4` guard digits and rounded **once** at the end (§5.5) — no
intermediate rounding. **No float anywhere:** the evaluator body may contain no
`float4`/`float8`/`real`/`double precision`/`::float` token, enforced by a migration-tail lex
assertion over the created bodies *(builder choice — the §7-A roster-assertion instrument; it is a
positive read of `pg_get_functiondef`, not an absence claim about a file)*. `days_in_period`
returns an integer day count from the E-a period row (both ends inclusive → E-a).

## 3. Lane δ · THE CATALOG

### 3.1 Tables

| Table | Shape | Notes |
|---|---|---|
| `clara.metric_definitions` | `id, firm_id null, key, title, unit, temporality, created_by/at` | `firm_id is null` = product-curated. Partial uniques: `(key) where firm_id is null`, `(firm_id,key)` otherwise |
| `clara.metric_definition_versions` | `id, definition_id, revision, ast jsonb, normalized_ast jsonb, content_sha256, result_scale, edge_policy_set_id, state, applies_from/to, supersedes_version_id, proposed_by jsonb, approved_by/at, approved_content_sha256` | insert-once; trigger blocks UPDATE outside lifecycle columns and blocks DELETE (`0040:351`/`:379` idiom) |
| `clara.metric_constants` | `(constant_key, effective_from) PK, value_numeric, unit, effective_to, source_note not null` | **0016 idiom** (`0016:237-248`) — no granted writer |
| `clara.account_sets` / `_versions` | set key → selector (code ranges / types / explicit codes), `zero_when_no_rows bool` (§5.3), `content_sha256` | the leaf-resolution layer |
| `clara.presentation_maps` / `_versions` | FS line ↔ account-set binding per statutory profile | provenance field 3's second half |
| `clara.edge_policy_sets` / `clara.metric_edge_policies` | §5 | 0016 idiom |

**Normalized formula hash** *(builder choice — `algebra.md` open (f)6)*: `content_sha256 =
sha256(canonical_json(normalized_ast) ‖ unit ‖ temporality ‖ result_scale ‖ edge_policy_set_id ‖
sorted referenced-version ids)`; normalization = key ordering, whitespace elimination, canonical
parameter renaming, commutative-operand ordering. Title/description edits do NOT move the hash;
anything the evaluator reads does. Approval binds `approved_content_sha256 = content_sha256`
*(ruled — approval is bound to the exact content hash/revision)*; a mismatch refuses.

### 3.2 Lifecycle
The five states and their rendering rights are **ruled — E-R5**. This design adds only enforcement:
transitions ride named audited fns (`propose_metric_definition` → `draft`;
`approve_metric_definition(version_id, expected_content_sha256, reason)` → `firm_approved`;
`reject_…`; `supersede_…`), direct DML stays revoked (invariant 10), and **`canonical` has no
granted writer at all** — canonical rows arrive by migration only (0016 idiom), so neither a human
nor a model can mint one. **Statutory eligibility is a mechanical predicate** evaluated at seal
time: `definition_version_id is not null AND state in ('canonical','firm_approved') AND effective
for the reporting period`. Effective-dating keys off the reporting period's start, not the render
date.

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
`search_path`, EXECUTE to `clara_authenticated` only. **The algebra evaluator IS a reporting
evaluator for immutability purposes** (campaign-frame decision; resolves `algebra.md` open (f)3
conservatively): a behavioural change ships as `_v2`, never `CREATE OR REPLACE` on a referenced
body *(ruled — E-R14)*.

### 4.2 The freeze instrument
*(builder choice — the contract calls the lint "the natural enforcement instrument" and marks its
mechanics adjustable, `wave-e-contract.md:367-369`)*. Two halves, because neither alone suffices:

1. **DB half — `clara.evaluator_versions`** `(name, version, body_sha256, migration_version,
   deployed bool, created_at)` plus an **event trigger** on `ddl_command_end` that RAISES if a
   `clara.evaluate_%_v%` function is created-or-replaced while a `deployed` row holds a different
   `body_sha256`, unless the session set the one-shot unlock GUC that only a migration minting a
   **new** version sets. `body_sha256` is computed at apply time from `pg_get_functiondef(oid)` —
   a **positive read of the live catalog**, never an assertion copied from the file. Honesty
   boundary, stated in the same idiom as `packages/db/README.md:32-38`: this defends against
   application, agent and definer-bug mutation, not a DB superuser.
2. **CI half — `scripts/check-frozen-evaluators.mjs`**, a **sibling** of
   `check-frozen-workflows.mjs` with a `frozen-evaluators.json` manifest of the same shape. A
   sibling, not a widening, for a measured reason: the existing lint's `SOURCE_EXT` (`:108`) covers
   only JS/TS, so `.sql` migration bodies are outside its reach even though `SCAN_PATHSPEC`
   (`:107`) already includes `packages/db/migrations`. It reuses the durable half verbatim —
   **append-only vs `origin/main`** (`:102-103`): a removed entry or a rehash of a `deployed:true`
   entry is a hard reject; `--lock-deployed` stays a ceremony act, CI-refused.

The render worker's determinism-critical TS modules (§10) sit under `packages/`, so the EXISTING lint
covers them once marked `@frozen` *(digest-verified; re-verify the marker's directive-independence at
build time before relying on it)*.

### 4.3 `clara.metric_cells` — the ten ruled fields

| # | Ruled field | Column(s) |
|---|---|---|
| 1 | definition version / normalized formula hash | `definition_version_id uuid null`, `normalized_formula_sha256 bytea not null` |
| 2 | periods | `period_ids uuid[] not null` → E-a |
| 3 | account-set + presentation-map versions | `account_set_version_ids uuid[]`, `presentation_map_version_id` |
| 4 | input values and entry/document references | `inputs jsonb not null`, `entry_ids uuid[]`, `document_ids uuid[]` |
| 5 | books watermark | `books_watermark` → E-a's snapshot token |
| 6 | evaluator version | `evaluator_version_id` |
| 7 | exact result and displayed rounding | `result_cents bigint null`, `result_numeric null` (exactly one non-null, CHECKed against `unit`), `displayed_scale`, `displayed_text` |
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
into an `edge_policy_set` that a definition version references by id.

1. **Division by zero → `undefined_cell`.** Status `undefined`, reason `divide_by_zero`, value
   NULL, rendered as an em-dash plus a footnote key. **Never 0, never ∞, never silently omitted.**
   An `undefined` cell in a REQUIRED statutory slot makes the claim `failed` (§7).
2. **Negative denominators → `signed_ratio_refuse` (default).** Where the denominator is declared
   non-negative (revenue, equity, total assets), a negative value yields `undefined` +
   `negative_denominator`. A definition may opt into `allow_negative` explicitly — the opt-in
   lives on the version, so it is approved and versioned rather than implicit, and the cell carries
   a `negative_base` label. Rationale: negative-equity gearing is meaningful only when the reader
   is told it happened.
3. **Missing data → `absent_is_absent`.** A leaf with no rows resolves to `absent`, NOT zero,
   unless the account-set version declares `zero_when_no_rows = true` — an approved, versioned
   assertion that "no rows" genuinely means zero for that set (a live account with no postings),
   as distinct from an unbound or unresolvable reference. `absent` propagates through every node
   except a `sum` over a set declared complete. **This is Law 2 as a schema property:** the default
   reading of an empty result is refusal, and the exception must be positively asserted by a row.
4. **Sign normalization → `natural_then_declared`.** Every `measure` reads the DB's natural signed
   convention; the definition declares `present_as` (`natural`|`positive_expense`|
   `positive_revenue`); normalization happens **once, at the measure leaf**, is recorded in the
   cell's `inputs`, and is FORBIDDEN mid-tree (a validator rule). Rationale: two flips at two
   levels is the canonical silent-wrong-answer and is invisible in the output.
5. **Rounding → `half_up_once_at_declared_scale`.** Guard digits, then round exactly once at the end
   with numeric `round()` (half-away-from-zero; the negative-value behaviour is written into the policy
   row, not left to a reader's assumption). Money is never re-rounded — cents are exact. **Presentation
   rounding (e.g. RM'000) is a separate, per-cell recorded act (field 7); totals are computed from
   unrounded cents, never cross-cast from displayed values.**

## 6. Lane ε · THE SIX-LAYER TEMPLATE MODEL (E-R14)

Layers, edit authority and claim effect are **ruled — E-R14** (detail in
`docs/plan/research/wave-e/fs-template-design-codex-2026-08-08.md`). The research's table names are
a SKETCH; adoptions and amendments are named:

| Layer | Tables | ADOPT / AMEND | Writer |
|---|---|---|---|
| 1 statutory authority profile | `statutory_profiles`/`_versions`, `statutory_sections`, `statutory_slots` | ADOPT | **none** — migration-only. No curator UI in E. |
| 2 verified locale pack | `statutory_wording` | **AMEND** — a flat 0016-idiom fact table, PK `(profile_key, wording_key, locale, applies_to_periods_beginning_from)`, plus `…_to`, `wording_text`, `source_manifest jsonb`, `source_sha256`, `verification_state`, `source_note not null`. Rationale: system reference data, not a firm-editable object — the repo already names `sst_threshold_schedule` (`0016:237-248`) as the idiom for exactly this; the column names say *periods beginning* because E-R14's 2027-01-01 boundary is a period-beginning boundary, not a render-date one. | **none** — migration-only |
| 3 firm house style | `house_styles`/`_versions` | ADOPT | `publish_house_style_version` (admin+; LLM drafts, human publishes) |
| 4 registered firm template | `report_templates`/`_versions` (`report_class`, `claim_capability`, bound profile+style version ids) | ADOPT; immutable after publication | `publish_report_template_version` (admin+) |
| 5 report-instance overrides | `report_specs`/`_versions` **+ `report_runs`** | **AMEND** — split spec from run. Rationale: the seal binds a RUN (one snapshot, one dataset, one artifact); one spec legitimately runs against many snapshots. | `draft_report_spec` (bookkeeper+), `approve_report_for_issue` (owner/partner) |
| 6 management templates | the same `report_templates`, `report_class='management'` | **AMEND** — one registry, not a seventh table. Rationale: `claim_capability` stays the single decision point; a second registry is a second place to forget it. | `publish_report_template_version` (bookkeeper+) |

**Wording tables are BORN two-versioned** *(ruled)*: one act inserts both vintages' row sets — but only
once #43 has verified the text. Lane ε ships the STRUCTURE with zero MPERS rows and a CHECK forbidding
`verification_state='verified'` without `source_manifest`, `source_sha256`, `verified_by`,
`verified_at`. A profile whose required slot has no verified wording assesses **`failed`** and renders
nothing — it never emits a blank heading that reads as a real one.

**Grant matrix — the hard rule.** Mirror `0004:744-799` exactly: every new writer is granted to
`clara_authenticated` only; **`clara_agent_ro` receives zero new EXECUTE grants, and no new grants
of any kind are added on close- or approve-class verbs.** The model's only path into these tables
is the wake-verb draft lane (§11), which mints drafts only.

## 7. Lane ε · CLAIM ASSESSMENT, ANTI-SMUGGLING, PROTECTED PLACEHOLDERS

**The row.** `clara.report_claim_assessments(report_run_id, status, reason_codes jsonb, check_receipt
jsonb, claim_policy_version_id, evaluator_version_id, assessed_at)` — one immutable row per run. The
four states are **ruled — E-R14**; the label comes from versioned claim-policy rows, and the product's
own wording is "presentation-profile checks passed", never a certification.

**The enforcement point** *(builder choice — the states are ruled, the point was not)*:
`assess_report_claim(run_id)` runs **inside the same transaction that seals the dataset**, and
**before** any render job is enqueued; the manifest carries the assessment id + status. Three
fail-closed gates follow:

1. **Seal gate** — no `pre_sign` artifact for a run with no assessment row, or status ≠
   `eligible`/`not_applicable`. Absence of an assessment is refusal, not eligibility.
2. **Render gate** — the renderer refuses a manifest whose claim-status key is missing, unknown or
   unreadable (Law 2: "nothing said stripped" is a derived state, not a positive read).
3. **Post-assembly scan** — after assembly, before sealing, scan the whole byte stream **including
   PDF `Title`/`Subject`/`Keywords`/`Author` and XMP** against `clara.claim_phrase_lexicon` (a
   versioned EN/MY/ZH policy table, 0016 idiom) and refuse when status ≠ `eligible`. Data-driven so
   the lexicon is auditable and extensible without a code change.

**The filename vector is structurally closed:** the storage key is content-addressed
(`firms/{uuid}/reports/{sha256}.pdf`) and the download filename is DB-derived from the run row —
**no user- or model-supplied filename exists anywhere in the path** *(builder choice — the cheapest
kill for the ruled anti-smuggling requirement)*.

**Protected placeholders** — `clara.protected_placeholders` enumerates them (entity legal name,
registration identifiers, reporting period, currency/unit, statement titles, totals, note
references, claim wording), enforced twice: the layout-AST validator rejects any template or spec
binding a protected placeholder to a user-supplied literal (publish time), and the manifest
resolves them from DB values only (render time).

`stripped` **never blocks generation** *(ruled)*. A `failed` run may still render a **watermarked,
non-issuable** draft so the preparer can see what failed *(builder choice; the objection — that a
rendered failed pack is a smuggling surface — is answered by gate 3, which refuses the claim phrase
in that very artifact)*.

## 8. Lane ε · THE CHART AST

Adopt **`clara.chart/v1`** and the four-stage validation pipeline *(ruled shape — E-R14)*: (1)
closed JSON-schema validation, (2) DB semantic validation (RLS scope, metric versions, units, grain
compatibility, allowed filters, catalog effective dates), (3) versioned DB evaluator execution
against the **pinned** books snapshot, (4) **persistence of the typed dataset BEFORE rendering**.

Tables: `chart_templates`/`_versions` (firm-scoped, `chart_spec_ast`, content hash);
`report_datasets(report_run_id, chart_spec_version_id, books_snapshot_id, evaluator_version_id,
dataset_sha256)`; `report_dataset_points(dataset_id, metric_version_id, **cell_id** → the §4.3
provenance row, `value_cents bigint | value_numeric | value_date | value_text`, dimensions)`. The
`cell_id` FK is this design's one addition to the sketch *(builder choice — it makes "which cell is
this pixel" a join, not an inference)*.

**No inline values, SQL, JS or user formulas** *(ruled)*; threshold/target lines reference DB rows
(metric versions or `metric_constants`), never literals. **Named axis policies only** —
`include_zero` | `data_extent` | `symmetric` | `disclosed_manual` (the last renders a conspicuous
disclosure line); no arbitrary clipping. **Every chart carries an accessible same-source data
table** generated from the SAME `report_dataset_points` rows, with a CI parity test asserting
series-vs-table value equality *(builder choice — mirrors DIRECTION's card-catalog parity gate,
which exists precisely because two renderers of one truth drift)*. Model-generated image charts are
forbidden; charts are deterministic vector geometry.

## 9. Lane ε/ζ · SEALED ARTIFACTS

**The pin list, carried verbatim (14 lines, `fs-template.md` (e)):** report spec/version and
parameters · statutory profile, wording, house-style and chart version IDs + hashes · books
snapshot/event sequence · typed metric/fact dataset + dataset hash · all applicability and
claim-assessment receipts · evaluator function versions + definition hashes · assembler version ·
renderer OCI image digest and source commit · Node/OS/architecture/font-engine versions · every
font/logo/image hash · locale, timezone and deterministic document metadata · canonical
render-manifest hash · pre-sign PDF hash · signed-original PDF hash and signature evidence. Each is
a REQUIRED key of the manifest; a missing key is a seal refusal, not a default.

**The registry.** `clara.report_artifacts(id, report_run_id, kind
('draft_watermarked'|'pre_sign'|'signed_original'), storage_key, sha256, byte_size, manifest jsonb,
prior_artifact_id, sealed_by, sealed_at)` — insert-once, UPDATE/DELETE trigger-blocked, chained to
its predecessor: directly the `bank_reconciliations` shape (`0040:262-335`, `:351`, `:379`).
`clara.verify_report_artifact(id)` is the `verify_bank_reconciliation` analogue (`0040:4537-4644`)
with one honest limit written into its own comment: the DB half **recomputes dataset and manifest
hashes from source facts and diffs them** (strict) and reports the byte-level claim as
*unverified-by-this-function* — **byte reproduction is the render lane's drill (§10), because the
bytes are produced outside the database.** Any other split would let a green DB check imply a byte
claim nobody made.

**Custody.** `safeReportKey()` — a third key family beside `safeKey` (`storage.mjs:16-22`) and
`safeWikiKey`: `firms/{uuid}/reports/{sha256-hex}.{pdf|json}`, same `x-upsert:false`
overwrite-impossible PUT, same streaming re-hash verify, same positive role-claim check (`:40-62`).
**Same `firm-docs` bucket** *(builder choice — the wiki family made exactly this call so the daily R2
mirror covers the bytes for free; a new bucket needs its own mirror, restore drill and role)*. **The
signed original is retained and retrieved, never regenerated** *(ruled)*; the pre-sign bytes are
reproducible byte-exactly — a **CI obligation** (double render in one image → identical sha256) **and a
DR obligation** (§10).

## 10. Lane ζ · THE RENDER WORKER

**Shape.** `packages/reporting-render/` *(name: builder choice)* → a **separate Fly app**
`clara-render`, region `sin`, `[build] dockerfile`, **no `[http_service]`, no `[[services]]`** — a
batch job, not a server. Built **build-only + push from the repo root with `--dockerfile`
explicit**; the machine is created by `fly machine run`, whose flag set IS the runtime contract.
Per `packages/backup/fly.toml`'s own stated law, **the exact commands live in ONE place —
`docs/ops/DR.md` §10 — never restated in the toml.** Liveness is a dead-man's switch, not an HTTP
check. It must never ride `clara-runtime`'s machine: that app is explicitly non-HA (single-leader
advisory lock), and a font-loading, memory-spiky renderer there risks the durable engine.

**Trigger** *(builder choice — the contract specifies none)*: **a DB-queued `clara.render_jobs`
table, claimed with `for update skip locked`.** Four reasons: (a) the request is enqueued **inside
the same audited transaction** that seals the dataset and writes the claim assessment — no window
in which a render exists without a seal; (b) the worker needs **no inbound network** (it dials out
to Postgres and object storage only, which is what "offline at render time" requires); (c)
at-least-once is safe — the idempotency key is `(run_id, manifest_sha256)` and the output key is
content-addressed, so a duplicate render is a no-op write under `x-upsert:false`; (d) no new
authenticated HTTP surface. **Dispatch:** the runtime leader already holds a session and already
runs periodic sweeps (`lib/reconciler.mjs`'s five daily sweeps are the precedent), so it starts a
render machine when a claimable job exists — **the one place lane ζ touches runtime judgement
logic, so it carries a Law-1 independent review.** A coarse scheduled wake (Fly's granularity is
hourly at best per `packages/backup/fly.toml`) is the fallback, so a leader outage delays renders
rather than stranding them. The Fly API token is an environment secret — never argv, never code.

**Determinism obligations.** Network disabled during layout/PDF · content-addressed
fonts/logos/images, no system fonts · one pinned OS/CPU architecture and an exact renderer image
**digest**, not a tag · no ambient `now()`, randomness or mutable URLs — creation metadata,
document ids and timestamps derive from the manifest · deterministic font embedding/subsetting ·
normalized PDF metadata and trailer identifiers · archive the image or its reproducible build
inputs. **A declarative PDF layout engine is preferred over printing a live webpage**; if a browser
is ever used, the entire browser/OS/font stack must be pinned and archived. The engine choice is a
build-time spike; the **acceptance test is fixed either way** — double-render byte equality in CI,
re-render-from-archived-digest equality in the drill.

**DR.md §10 + Supavisor.** DR.md currently ends at §9 (`docs/ops/DR.md:349`); §10 lands after it,
structured like §5/§5b (described drill + exercised evidence) and joined to **§9's existing
cadence**: *monthly-light* = re-render the most recent sealed pre-sign artifact and compare sha256;
*quarterly-full* = re-render one artifact per pinned renderer image digest still referenced by a
retained artifact, plus a signed-original retrieval + hash check. In DR.md's own idiom: a sealed
artifact you have never re-rendered from its pinned dataset + evaluator + renderer digest is not
proven reproducible. **Supavisor: last measured 35/60** (`docs/plan/wave-e-f6f9-acceptance.md:51,196`).
The `clara-backup` shape adds **no standing sessions** — a short-lived DSN session per job, no pool,
no LISTEN client; worker concurrency capped at 1 in v1, so peak adds 1. **Re-verify headroom before
deploy** (the standing law every consumer-adding wave has followed).

## 11. Lane η · E-c, THE AD-HOC AUTHORING LANE

**Where it lives.** The chat lane is frozen (`chatTurn_v10`, `registry.ts:38-47`), so new tools ship
as **`chatTurn_v11`** — six files, registry repoint, `pnpm freeze:update`, deploy-lock AFTER the
ceremony *(Appendix A)*. Grep the built bundle after the edit (the WDK silent directive-swallow).

| Tool | Effect | Guard |
|---|---|---|
| `list_metric_catalog(client, as_of)` | read | RLS |
| `compose_metric_preview(ast, periods)` | validator + evaluator in **preview** mode; cells with `report_run_id is null` | numbers come from the evaluator (E-R4 satisfied); the model narrates by **placeholder substitution only** |
| `save_metric_definition_draft(ast, …)` | wake fn `wake_propose_metric_definition` → a `draft` version row | **SAVING a composition mints a draft** *(ruled — E-R5)* |
| `draft_report_spec(template_version_id, params, overrides)` | wake fn → a draft spec | never approves, never issues |
| `request_report_preview(spec_draft_id)` | a render job of kind `draft_watermarked` | can never produce `pre_sign` |

New wake verbs get `clara.wake_fn_allowlist` rows (`0002:247-251`) for the **interactive** wake kind
only — never proactive — with EXECUTE to `clara_wake_interactive` exactly as `0004:781-788` grants the existing four. **`clara_agent_ro` gains nothing** (`0004:744-799`).

**Human approval.** `approve_metric_definition(version_id, expected_content_sha256, reason)`
(admin+ floor *(builder choice — mirrors `role_rank` ≥ 2; E-R11's keys are close-scoped and belong
to E-a)*) · `publish_house_style_version` · `publish_report_template_version` ·
`approve_report_for_issue(run_id, expected_artifact_sha256)` (owner/partner floor; maker/checker per
PRD §2 — the attestation binds the **exact sealed artifact hash** *(ruled — E-R14)*, and the model
can never be checker).

**The uncertified watermark is enforced in the DB, not the prompt** — three fail-closed points: (1)
`assess_report_claim` sets `uncertified = true` whenever ANY contributing cell's definition version
is `draft`; (2) the **seal refuses** to mint a `pre_sign` artifact for a dataset referencing a
`draft` definition, so "draft never statutory" is structural, not a label; (3) the renderer stamps
every page from the manifest flag and **refuses to render when the flag is absent or unreadable**
(absence is not permission).

**Composition vs new definition.** Composing already-approved metrics ad hoc is **composition, not
a new definition** *(ruled)*: such a cell records `definition_version_id = NULL` with
`normalized_formula_sha256` populated — exactly what provenance field 1's disjunction ("definition
version / normalized formula hash") allows. Since statutory eligibility (§3.2) requires a non-null
definition version in `canonical`/`firm_approved`, an ad-hoc composition is mechanically barred
from a statutory pack with no extra rule. **Saving** it mints a `draft` on the approval lane.

## 12. E-R8's floors, the lane map, and what needs a decision

**The two floors** *(ruled — E-R8)*. Management report design is user sovereignty (layout, grouping,
comparatives, language, branding) with exactly two floors, bound mechanically here: ① **every cell's
figure comes from the DB/algebra** — so the layout AST has **no numeric literal node**, only structural
integers (column spans, row counts, font sizes); no user and no model can type a number into a report
in any layer, including layer 6. ② **every render is a durable reproducible artifact** — there is no
"preview-only, not persisted" path; every render mints a `report_artifacts` row with its full manifest,
watermarked drafts included.

| Lane | Contents | Size | Law-1 judgement PR? |
|---|---|---|---|
| **δ** | AST + validator + primitives · catalog + lifecycle fns · edge-policy rows · `evaluate_metric_v1` + `metric_cells` · DB freeze half + `check-frozen-evaluators.mjs` · ratio seeds | **XL** | **Yes** — validator, lifecycle, edge policies, freeze |
| **ε** | six template layers · wording STRUCTURE (zero MPERS rows) · claim assessment + protected placeholders + phrase lexicon · chart AST tables · `report_artifacts` + `verify_report_artifact` | **L** | **Yes** — claim assessment, anti-smuggling |
| **ζ** | `packages/reporting-render` + Fly app · `render_jobs` + leader dispatch · `safeReportKey` · DR.md §10 | **L** | **Yes** — the leader-dispatch touch |
| **η** | `chatTurn_v11` tools · wake verbs + allowlist rows · approval fns · watermark enforcement | **M** | **Yes** — watermark enforcement |

Acceptance order is **ruled — E-R7/E-R9** (sandbox battery → BEE FY2025 → RPR MPERS pack → RS snapshot witness); the falsifiable cells live in `wave-e-acceptance-matrix.md`, not here.

**Open questions — put to the orchestrator; RULED 2026-08-09 (the review reads decisions):**

1. **Draft-artifact byte retention — RULED: bytes kept indefinitely in v1.** The 90-day proposal
   is withdrawn — E-R8 floor ② is ruled, and stretching it buys a capacity win nobody measured a
   need for. A future retention policy is an ADR. §9's registry keeps every artifact's bytes.
2. **The three added primitives — RULED: approved as extensibility, not a ruling change.** The
   ruled list carries a trailing "…"; "closed" means closed at runtime, and each addition rides a
   migration + evaluator `_vN` + independent review, exactly as §2.2 binds.
3. **The classification seam — RULED: classification sets seed in δ** (structure, not wording);
   the owner's MASB sitting (task #43) also eyeballs the classification seed as a cross-check.
4. **`metric_cells` capacity — moved to the matrix:** cell **D8** measures the RPR pack + RS
   snapshot count and projects seven-year growth before the campaign closes.
5. **Renderer engine spike — RULED: inside lane ζ**; the fixed acceptance test (double-render byte
   equality in CI; re-render-from-archived-digest equality in the drill) is unchanged either way.
*End. §§2-11 are proposals at implementable precision; every ruled item is cited, never restated.*
