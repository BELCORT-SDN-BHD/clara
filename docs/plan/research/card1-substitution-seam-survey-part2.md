# Card 1 substitution seam — estate survey, part 2

> **Part 2 of `card1-substitution-seam-survey.md`** — one survey in two files, split at the
> repo's own 500-line-per-file convention. **Part 1 carries S1-S23** (the render entrance,
> `metric_cells` + the evaluator framework); **this file carries S24-S48**, the block/basis
> machinery, the expression-engine precedents, the renderer's runtime/privilege, the
> freshness/consistency wall, the closed-world move list, and the open design questions.
> Finding numbers continue from part 1; read part 1 first — nothing here restates its premises.

---

## S24-S30 · The block/basis machinery in 0132

**S24.** Block kinds admitted today: **exactly `'text'`**, closed by an `elsif` refusal — `if
v_kind is distinct from 'text' then raise ... sandbox_view_body_malformed /
block_kind_unsupported` — `0132.sql:632-635`. Any block sets `v_has_free_text := true`
unconditionally (`:636`) — there is no branch that would NOT set it, because there is no other
admitted kind yet.

**S25.** The basis element shape: `{"label":"<str>", "kind":"preview_cell"|"freeform_read",
"id":"<uuid>"}` — validated per-element for non-blank+unique label (`0132.sql:585-590,619-623`),
well-formed-uuid `id` (`:592-596`), and same-firm resolution keyed on `kind` (`preview_cell` →
`clara.metric_cells`, `:599-603`; `freeform_read` → `clara.freeform_read_log`, `:604-613`; any
other `kind` → `sandbox_view_basis_unknown`, `:614-617`). **A basis element referencing a
`metric_cells` row is already a first-class, validated citation kind** — nothing new is needed
on the basis side for stage (a) to cite a pre-computed cell.

**S26.** A block's own `basis_ref` (`0132.sql:641-654`) must name a label present in the view's
own `basis` array or the mint refuses (`sandbox_view_block_basis_unknown`). This wall is
kind-agnostic — it operates on the block object regardless of `kind`, so a NEW `placeholder`
block kind would use the identical `basis_ref` field and the identical validation path.

**S27.** The per-basis-kind EXACT client-set derivation (`0132.sql:657-700`) walks
`v_used_labels` (labels actually referenced by SOME block's `basis_ref`) and, for a
`preview_cell`-kind label, does `select client_id into v_preview_client from clara.metric_cells
where id = ... and firm_id = p_firm; v_client_set := v_client_set || v_preview_client`
(`:667-672`). **This derivation keys off the BASIS element's `kind`, never the BLOCK's `kind`.**
A `placeholder` block citing a `preview_cell` basis element would be folded into the exact
client set by this SAME existing code path with zero new logic — confirming the survey prompt's
expectation ("that cell's client joins the exact set") is already mechanically true, contingent
only on block-kind admission.

**S28.** The fail-safe interim (`0132.sql:718-728`, `v_has_free_text`) is what decides whether
the RETURNED `client_set` is the exact derivation or the widened `firm_closure`: `if
v_has_free_text then v_uses_firm_closure := true; ... v_client_set := coalesce(v_firm_all,
'{}');`. **Because every admitted block sets `v_has_free_text` today (S24), every 0132 mint
widens** — by construction, not because placeholders don't exist yet.

**S29.** Given S24-S28: the **more natural** extension is a **new top-level block kind**
(`kind='placeholder'`), not placeholder syntax embedded inside `kind='text'`'s
`displayed_text`. Reasons, all grounded: (i) the validator's own shape is already a closed
switch on `block.kind` (S24) — adding a case is the idiom this file already uses for
basis-element `kind` (S25); (ii) the estate's house style elsewhere explicitly rejects
string-interpolation grammars in favour of typed AST nodes — `layout.mjs:1-11,164-166`: "DB text
never becomes markup... refuse what is not a plain identifier rather than sanitise it"; and
`_validate_metric_node_v1`'s own closed node-kind switch (S31) is the DB-side precedent for the
same discipline; (iii) a placeholder embedded in free text would need its OWN mini-parser+
escaping inside `_sandbox_client_set` and again inside a future `layoutSandbox`, doubling the
injection surface X11 already worries about (`sandbox-export-survey.md:181-194`), where a typed
block kind reuses the SAME validated-JSON-shape discipline every other block/basis element
already gets.

**S30.** A `placeholder`-kind block must NOT set `v_has_free_text` (S28) if stage (a)'s intent
(placeholder-only bodies get the EXACT client set, never the firm-wide widening) is to hold —
this is a deliberate, explicit code change to `0132.sql:626-654`'s loop, not a side effect: a
MIXED body (placeholder blocks + any `text` block) must still widen, because `text` blocks are
still free text. This matches the migration's own header's prediction: "coverage can only widen
while free text is present, never narrow it below what the exact derivation already
proved... Reversible the day a non-free-text block kind exists... a future placeholder block
once the substitution seam lands" — `0132.sql:542-548`.

---

## S31-S38 · Precedents for a validated-expression engine (stage b)

**Headline (expression-engine lane's own summary, cross-checked and adopted here): there is NO
general-purpose "caller submits a formula, DB validates+evaluates it" engine anywhere in the
estate.** The only real precedent is a closed-grammar JSON-AST interpreter that sidesteps the
dynamic-SQL/arbitrary-expression problem entirely by fixing the node vocabulary to eleven
hardcoded kinds rather than parsing free text.

**S31.** `clara._validate_metric_node_v1(n jsonb, d int default 1)` —
`0059_wave_e_delta_metrics_behavior.sql:30-41` (one long statement) — is a **closed recursive
AST validator** over `clara.metric_definition_versions.ast` (`0058.sql:142`). It: forbids
numeric literals outright (`if k='literal' or n?'value' then raise 'numeric literal
forbidden'... use an approved versioned constant`); bounds recursion depth (≤12), total AST
nodes (≤64), measure leaves (≤32), and cumulative lag (≤24 periods) with typed `cost_exceeded`
refusals; admits **exactly** the node kinds `measure, constant, days_in_period, count, lag,
average, sum, divide, subtract, multiply, percent_change` — any other value raises `'metric
primitive unknown'`. **The set is machine-counted, not merely documented**: `clara.
metric_primitives` is seeded with exactly these 11 rows and a census asserts `count(*)=11`
(`0059.sql:251`, per the expression-engine lane's read). Each kind's own field set is closed too
(e.g. `measure` admits only `['node','set','aspect','present_as','scope']`, `:33`). Dimension
algebra (`currency_power/days_power/count_power`) and temporality compatibility are checked per
operator.

**S32.** `clara.validate_metric_ast_v1(a jsonb)` — `0059.sql:44` — wraps S31 as the
**approval-time semantic validator**: the top-level object is closed to exactly six keys (`ast,
unit, temporality, result_scale, edge_policy_set, root`), `result_scale` bounded 0-12,
`edge_policy_set` must resolve live, and the DECLARED `unit`/`temporality` must match what S31's
recursive walk INFERRED — a mismatch raises `'metric declaration mismatch'`. **A SEPARATE,
earlier-stage validator also exists** (expression-engine lane's finding, not previously read by
this lane): `clara._validate_metric_ast_shape_v1(a jsonb)` —
`0059.sql:49-67` — is a **proposal-time, structural-ONLY** validator (closed key-sets per node,
a depth ceiling of 24, a byte-size ceiling of 262144, the same numeric-literal-forbidden rule),
run when a definition is first proposed/saved as a draft, BEFORE the full semantic/dimensional
proof S31/S32 run at approval time. **This two-phase shape — cheap structural gate at
proposal, expensive semantic gate at approval/execution — is itself a precedent worth mirroring**
for a stage-b expression that might be proposed once (in chat) and validated more than once
(at propose time, and again at substitution/render time).

**S33.** `clara._metric_eval_node_v1(p_client uuid, p_snapshot uuid, p_context uuid, p_period
uuid, n jsonb, p_allow_negative boolean, p_average_key text, p_as_of date default null) returns
clara.metric_value_v1` — `0059.sql:95` — `stable security definer`, called only after S31/S32
have passed, and reads **only pre-materialized, immutable snapshot tables**
(`metric_input_snapshot_*`), never live books directly, and **constructs no dynamic SQL at
all** — every leaf value resolves through a pre-registered, versioned DB entity
(`metric_constants`, `account_set_versions`); there is no path for a raw literal or an arbitrary
column reference to enter the computation (expression-engine lane's characterization, confirmed
against the node-kind closure in S31). `0111_f_a5_reporting_agency_pr1.sql:1215` names it
explicitly as "THE LAWFUL ENTRYPOINT... `clara._metric_eval_node_v1`," and its frozen identity
is pinned in the golden-hash census at `0111.sql:111` and re-proven byte-unmoved at
`0111.sql:1802-1811`.

**S34.** `clara.metric_definition_versions` has a lifecycle: `state check in ('draft',
'firm_approved','canonical','superseded','rejected')` (`0058.sql:146`), enforced by
`clara._tf_metric_definition_lifecycle_v1` (`0059.sql:26-27`) — a `draft → firm_approved`
transition REQUIRES `approved_by, approved_at, approval_reason, self_approval_attestation`
non-null and `approval_evidence @> '{"kind":"human_approval","version":1}'`, or the trigger
refuses `CLR16`. **A durable, canonical/formally-approved definition needs a human in the loop;
only the PREVIEW path (S19, S35) bypasses this** — by minting a `metric_cells` row with
`definition_version_id=null` rather than by relaxing this trigger.

**S35.** `clara.wake_compose_metric_preview` → `_eta_compose_metric_preview_core` (S19) is the
concrete, already-shipped shape a stage-b "model proposes, DEFINER validates+executes, result
receipted" door follows end to end (full call sequence, `0077.sql:128-292`): refuse blank inputs
→ `perform clara.validate_metric_ast_v1(p_ast)` (`:159`) → resolve deployed evaluator + effective
policy versions, **refusing on ANY ambiguity rather than silently re-selecting** (`:160-204`; the
"POLICY EFFECTIVITY, ENFORCED BY REFUSAL RATHER THAN BY RE-SELECTION" comment at `:177-190` is a
load-bearing house-style statement worth quoting verbatim to a builder) → `z :=
clara._reserve_op(...)` (`:211-214`) → evaluate via `_metric_eval_node_v1` (`:226`) → insert the
`metric_cells` row (`:256-275`) → `perform clara._audit(...)` (`:285-286`) → `return
clara._finish_op(...)` (`:287-290`). Cost ceilings are enforced up front, before any work:
`evaluate_fs_pack_v1`/`_agent_v1` cap at ≤5000 cells/run, ≤25 periods (`0059.sql:122-129`,
`0111.sql:1264-1279`).

**S36.** The receipt idiom's exact primitives — `0004_governed_fns.sql:32-79`:
`clara._hash(p jsonb) returns bytea` = `sha256(convert_to(p::text,'UTF8'))` (`:32-33`);
`clara._audit(p_firm, p_actor, p_obo, p_wake_kind, p_fn, p_entry, p_args) returns void` inserts
into `audit_log`, `outcome` hard-coded `'ok'` (`:35-41`; any `RAISE` aborts the whole
transaction including this insert, so only committed successes are ever recorded);
`clara._reserve_op(p_firm, p_fn, p_op_key, p_req_hash) returns jsonb` — `insert into
clara.op_receipts(...) on conflict (firm_id, fn, op_key) do nothing`; `null` on a fresh
reservation, the prior result (or `{"pending":true}`) on replay, `CLR10 'op_key reused with
different args'` on a hash mismatch (`:46-60`); `clara._finish_op(p_firm, p_fn, p_op_key,
p_result) returns jsonb` writes and returns the result (`:62-68`). The canonical **reserve →
guards → work → audit → finish** shape recurs verbatim across `clara._draft_entry_core`
(`0004.sql:127-212`), `evaluate_metric_v1`/`_pack_v1` (`0059.sql:112,118-161`), and 0132's own
mint/request cores.

**S37.** The CLR errcode legend — `0002_foundation.sql:39-42` (expression-engine lane's read):
CLR01 client-attribution · CLR02 provenance · CLR03 wake-authority · CLR04 authz/role-floor ·
CLR05 maker-checker · CLR06 revision-token · CLR07 balance · CLR08 immutability · CLR09
last-owner · **CLR10 bad-request** (the catch-all a new expression engine's structural/semantic
refusals should use) · **CLR11 not-found-in-your-firm** (the no-existence-oracle refusal a new
engine's input-resolution refusals should use). Typed-refusal idiom, sampled: `raise exception
'<human sentence>' using errcode = 'CLR10', detail = jsonb_build_object('reason','<token>',
...)::text` — e.g. `0132.sql:566-568` (`sandbox_view_basis_absent`), `0059.sql:32`
(`numeric_literal_forbidden`, `cost_exceeded`). New tokens (`expression_unparseable`,
`expression_forbidden_function`, `expression_input_not_found`) would land under
`detail->>'reason'` on CLR10/CLR11 exactly this way.

**S38.** The "wiki dynamic-SQL gate" (`scripts/check-wiki-dynamic-sql.mjs` +
`scripts/wiki-lint-checks.mjs`) is **not** a precedent for validating a caller-influenced
COMPUTATION — it is a CI-time STATIC scanner defending a different authority boundary (migration
0019's wiki-table access wall) against `EXECUTE format(...)`-constructed relation names invisible
to a plain `prosrc` token scan. Its fail-closed-on-non-reconstructible posture is philosophically
adjacent ("prove it's safe before it ships") but it protects exactly seven named wiki relations,
not arbitrary computation, and it runs at review time over migration TEXT, never at runtime over
a caller's request. **Confirmed independently by the expression-engine lane: no `EXECUTE
format(...)`-style DEFINER dynamic-SQL evaluator guarded by a strict input allowlist exists
anywhere in the estate for a general computation.** The metric-AST engine (S31-S33) avoids the
question entirely by never building SQL text from the AST — every leaf resolves through a
pre-bound, versioned DB entity, never a column reference assembled from caller input. **This is
the estate's own argument for the shape a stage-b engine should take**: closed node-kind
JSON-AST + two-phase structural/semantic validator (S32) + pure-interpreter evaluator over
pre-bound DB facts (S33) — never a string-parsed or dynamically-executed alternative, which has
no precedent or review history in this codebase at all.

---

## S39-S44 · The renderer's language/runtime, and what DB access it has

**S39.** Node.js process; Typst is a pinned static binary invoked via `execFile` (S12). No
shell-string spawn, no WASM.

**S40.** DB role: `clara_runtime` (via `SET ROLE`, `db.mjs:43`, S6). One short-lived `pg.Client`
per job, no pool, `DATABASE_URL` from environment only. `clara_runtime`'s EXECUTE grants on the
sandbox lane are exactly the three worker verbs and nothing else — `0132.sql:1221-1230`,
re-proven in the tail census's ACL check (`:1404-1447`, both directions via `aclexplode`).

**S41.** `clara-render` is a separate Fly app, a batch job with no inbound service (`fly.toml`
header, S12). `render_dispatch_begin`/`render_dispatch_record` (S3) are the LEADER's own
due-read + outcome-receipt verbs — a distinct process from the worker, confirmed directly rather
than merely inferred from bookkeeping columns.

**S42.** `sandbox_export_payload`'s CURRENT return shape carries `sandbox_export_id, firm_id,
sandbox_view_id, body, body_sha256, locale, watermark_policy_version_id, watermark` —
`0132.sql:959-962` — **no cell values, no resolved placeholders**. A stage-(a)/(b) build would
widen this jsonb the same way F-A5b PR-1 itself widened `sandbox_export_payload` to carry the
pinned watermark (`0132.sql:940-945`'s own comment frames this as the established pattern: "the
worker payload previously handed back only the pinned `watermark_policy_version_id` UUID...
`clara_runtime` holds no table grant on `watermark_policy_versions`; humans-only per 0111. One
join, resolved by the row's OWN frozen id"). The same shape applies to cell values:
`clara_runtime` holds **no table grant on `clara.metric_cells`** anywhere in 0058-0061's
grants, so resolved values MUST arrive pre-joined inside the payload jsonb, via a widened
`sandbox_export_payload`, exactly as the watermark does today. **Additional wall found by the
metric_cells lane**: `clara.get_context_pack` (the estate's general-purpose read-back verb,
patched by `0061.sql:166-171`) explicitly FORBIDS returning `payload`/`books_watermark`/
`dataset_sha256` — i.e. there is no generic "read a cell's value" door outside the
evaluator/preview verbs and RLS-scoped direct table access either; a payload-builder function is
genuinely the only lawful path for `clara_runtime` to obtain a cell's value.

**S43.** `render-worker.mjs`'s `shapePayload(p, documentMeta)` (`:67-112`) is the concrete
WIDENING PATTERN a sandbox worker script would mirror: builds `metricsByKey` from
`p.dataset_points` (keyed by `series_key`, carrying `point_status, displayed_text,
displayed_scale, na_label, cell_id`, `:69-83`) and `placeholderValues` from
`p.protected_placeholders` cross-referenced against the request manifest (`:103-110` — the
comment there states explicitly: "There is no user- or model-supplied string anywhere in this
map"). A sandbox-side `shapeSandboxPayload` would build an analogous `cellsByBasisRef` map
straight off the widened `sandbox_export_payload` jsonb.

**S44.** No sandbox counterpart to `assemble()`/`shapePayload()`/`db.mjs`'s wrappers exists
anywhere in `packages/reporting-render` today (S10, S13 — zero occurrences of `sandbox`,
confirmed by two independent lanes). Fully consistent with 0132's own scope statement — PR-3 is
where this lands.

---

## S45-S48 · Freshness/consistency — the design tension, named precisely

**S45.** The design's own text is not perfectly self-consistent on WHEN substitution happens.
`sandbox-export-design.md:404-406` (§3.6b): "the renderer substitutes each placeholder with the
DB-read value **at mint time**" — but `sandbox_exports` (S1) is an async
CLAIMABLE→RUNNING→DONE queue row, and 0132's own SECTION 6 comment states the render is
explicitly a LATER step than the mint. `wake_mint_sandbox_view` never calls into
`packages/reporting-render` at all (confirmed: zero cross-references between 0132 and
`packages/reporting-render` in either direction). So "at mint time" cannot literally mean the
render happens then; it must mean **the VALUE is pinned/resolved at mint time** (i.e., inside
`_sandbox_view_mint_core`/`_sandbox_client_set`, which already run at mint) and the render step
merely REPLAYS that pinned resolution later. **This is the precise ambiguity a stage-(a)/(b)
design doc must resolve explicitly**: does the placeholder carry (i) a pointer resolved lazily
at render time (a plain `basis_ref` → live `metric_cells.id` lookup, exactly like `metric_ref`
today), or (ii) a value baked into `sandbox_views.body` (or a new column) at mint and never
re-read?

**S46.** Given S15-S18 (a `metric_cells` row is immutable once written; supersession is
currently disabled entirely) and given `sandbox_views` is itself append-only with its `basis`
array frozen at mint (`0132.sql:250,277-280`) — **option (i) above is ALREADY race-free,
provided the placeholder's `basis_ref` resolves to a `preview_cell`-kind basis element whose
pinned `id` (S25) is the EXACT `metric_cells.id`, never a "latest cell for this definition"
re-lookup.** Since a cell's `id` can never change value (S15) and the basis array naming that
`id` can never change either (append-only), **the renderer reading that exact `id` at ANY later
time reproduces byte-identically what existed at mint** — no new mechanism, no lock, no "as-of"
column is needed beyond what 0132 already ships for the `preview_cell` basis kind. **This is
the single load-bearing implementation rule a stage-(a) build must not get wrong: resolve by
pinned `cell_id`, never by re-deriving "the current value for this definition."**

**S47.** What S46 does NOT close: whether the human who approved exporting a chart in chat ever
SAW the resolved value the export will carry, and whether that seen-value is provably the same
`cell_id` the export later reads. Nothing in 0132's schema records a "the human confirmed THIS
exact chart, citing THESE exact cell ids" event distinct from the mint itself —
`wake_mint_sandbox_view` takes `p_body`/`p_basis` directly from the caller with no intermediate
"preview, then confirm" round-trip recorded durably (`0132.sql:856-874`). The design's own Annex
J (`sandbox-export-annexes.md:414-424`) describes only a READ-ONLY human panel (list + refusal
text), never an approval gate on an individual mint. This is exactly risk **R-1** already on
file (screen/file divergence, `sandbox-export-annexes.md:281,467-472`, owner question 6,
`:267-271`) — the substitution seam (S46) guarantees the EXPORT is internally consistent with
its own mint, but not that the mint's basis matches what the chat turn displayed.

**S48.** Render-time DB access constraint (S40, S42): the worker cannot itself query
`clara.metric_cells`; any cell resolution must be pre-joined into the payload by a widened
`sandbox_export_payload`, which runs under definer privilege whenever the worker calls it (i.e.
at render time, not mint time). **This means the payload builder itself, not the renderer, is
the second place the "resolve by pinned `cell_id`, never by re-derivation" rule (S46) must be
enforced** — its future body must join `clara.metric_cells` by the exact `id` values recorded in
the MINTED `sandbox_views.basis` array, never by re-running any part of `_sandbox_client_set`'s
per-basis-kind derivation.

---

## Closed-world list — everything that must move for stages (a)+(b)

**Migrations (new, on top of 0132 once it merges):**
1. `_sandbox_client_set` (0132 SECTION 5c) — widen the block-`kind` admission (`:632-635`) to
   accept `kind='placeholder'` (or whatever the ruled design names it), and make it NOT set
   `v_has_free_text` (S30) — a `create or replace function` in a NEW migration (this core is a
   plain ungranted core, not `evaluate_*`-named, so it is not freeze-lint-frozen).
2. A new typed refusal for a `placeholder` block whose `basis_ref` resolves to a basis element
   that is NOT `kind='preview_cell'` (stage (a) needs the referenced value to be a pre-existing
   DB-computed cell; a `freeform_read` basis has no single numeric value to substitute).
3. `sandbox_view_body_malformed`'s "figure arrived as a number" reason needs the re-cut the
   design already names — from a TYPE assertion to a PROVENANCE assertion
   (`sandbox-export-design.md:411-413`) — inside this same widened core.
4. **Stage (b) only** — a genuine open decision (D2 below): either (a) loosen `metric_cells`'s
   `model_proposal_id`/`human_approval_id` CHECK **and** the `_tf_metric_cell_integrity` trigger
   (S17 — both must move together) and mint whatever relation(s) those FKs should point at, or
   (b) extend `wake_compose_metric_preview`'s existing preview-cell pathway (S19, S35) with a
   new/extended AST grammar rather than a parallel table. **No "ad hoc cells" relation exists
   today; minting one is a NEW object, not a widening.**
5. `sandbox_export_payload` (0132 SECTION 7) widened to carry resolved cell values, pre-joined by
   the exact pinned `cell_id`s in the minted `sandbox_views.basis` (S42, S48, S46) — mirrors the
   exact pattern by which 0132 itself widened this function to carry the pinned watermark row.
6. A CLAIM verb for `sandbox_exports`, and a `render_dispatch_begin`/`_record`-equivalent for the
   sandbox job family (S3, S13, S41) — still unbuilt even for PR-1's existing 'text'-only bodies;
   a prerequisite for ANY render to happen at all, not stage-(a)/(b)-specific, but blocking.

**Runtime (`packages/reporting-render`):**
7. A `layoutSandbox()` export (or equivalent) mirroring `assemble()` (S7), with its own closed
   block-kind switch admitting at least `text` and `placeholder`, and its own `need()`-shaped
   resolution for placeholder values (mirrors `case "metric_ref"`, S8).
8. A `shapeSandboxPayload()` (mirrors `shapePayload()`, S43) building a `cellsByBasisRef`-shaped
   map off the widened `sandbox_export_payload`.
9. `db.mjs`-equivalent sandbox worker wrappers (`claimSandboxJob`, `sandboxJobPayload`,
   `completeSandboxJob`, `failSandboxJob`) once item 6's claim verb exists.
10. The leader/dispatch process (S3, S41) needs a sibling entry for the `sandbox_exports` job
    family — `sandbox_exports` already carries `claimed_by`/`lease_expires_at` (S1), so the SHAPE
    is ready; only the leader's own dispatch logic and its verb pair (item 6) need widening.
11. Ceremony discipline (Annex I): any change to `layout.mjs`/`engine.mjs`/`render-worker.mjs` is
    a renderer change needing a fresh, checksum-pinned image digest, run from merged `main`
    (S12), sequenced after F-A5 PR-4 (C-16) — applies to this build too.
12. **A second production caller of `chart.mjs`** (S11) — if stage (a)/(b) charts are in scope
    (not merely narrative text placeholders), a `layoutSandbox` chart path is what would finally
    make "one geometry library, two entrances" a checkable G-1 census rather than a forward
    commitment.

**Tests/censuses:**
13. `packages/db/tests/rig-meta.mjs`'s `*_FNS`/`ALLOWED` arrays and its per-wave `*_COHORT`
    rosters (censuses lane's findings: `grantMatrixFailures()`, `rig-meta.mjs:1163-1216`, called
    from `rig-isolation.test.mjs:533` — the ONE estate-wide, bidirectional EXECUTE-grant census,
    derived from live `pg_proc`; `cohortFailures()`, `rig-meta.mjs:1153-1159`, the
    wholly-present-or-wholly-absent check backing every `*_COHORT`, e.g.
    `METRICS_0058_COHORT` at `:143`/`:1201`, `AUTHORING_0077_COHORT` at `:229`/`:1204`) —
    **CONFIRMED, by two independent greps (this lane and the censuses lane), to carry ZERO
    entries for F-A5b/sandbox today.** A new stage-(a)/(b) verb needs its OWN cohort array here;
    omitting it does not create a silent gap (the estate-wide `grantMatrixFailures()` backstop
    still flags an unaccounted grant as an "extra"), but the cohort entry is still required for
    the census to pass cleanly.
14. **Correction from the censuses lane, important**: the RLS-forced-relation census
    (`GOVERNED_TABLES`, `rig-meta.mjs:1074-1091`, `governedRlsFailures()`,
    `rig-meta.mjs:1236-1271`, called from `rig-isolation.test.mjs:573`) is **genuinely
    bidirectional** — it derives the live `pg_class` set and force-checks anything NOT already in
    the roster/`RLS_EXEMPT`. **A brand-new governed table (e.g. a stage-(b) "ad hoc cells" or
    "model proposals" relation, if that path is chosen) needs NO manual entry here — it is
    auto-caught.** This narrows item 13 above: grants need a manual cohort; RLS-forcing does
    not.
15. `packages/db/tests/epsilon-grants-phase.mjs`'s curated-table writer census (C6, `:121-150`,
    and its bidirectional sibling `DELTA_CATALOG_NINE` per the censuses lane,
    `epsilon-grants-phase.mjs:18-22`) — only if stage (b) mints a NEW curated (owner-signed,
    migration-seeded) reference table; not needed if stage (b) just extends
    `validate_metric_ast_v1`'s existing closed grammar.
16. `scripts/check-frozen-evaluators.mjs` + `frozen-evaluators.json`, and the DB-side
    `evaluator_versions`/`evaluator_version_members`/`verify_evaluator_freeze()` (S21-S23) —
    triggered ONLY if a NEW function literally named `clara.evaluate_*` is minted; extending
    `_validate_metric_node_v1`/`_metric_eval_node_v1` does not trigger this lint by its own
    documented scope.
17. `packages/db/tests/f-a2-grants.test.mjs`'s D34 census (`interactive_client` == exactly one
    row, `wake_open_question`) — a stage-(a)/(b) verb must stay OFF this allowlist kind; 0132
    itself already respects this wall (`0132.sql:1203-1214`) and any new verb must too.
18. 0132's OWN SECTION 9/10 tail census pattern must be REPRODUCED (not edited — 0132 is
    immutable once merged) inside whatever NEW migration mints stage-(a)/(b) objects.
19. No single global `wake_fn_allowlist` census exists (censuses lane's finding) — each wave
    ships its own name-scoped both-direction check (e.g.
    `f-a5-reporting-agency-pr2-census.test.mjs:100-116`); a stage-(a)/(b) migration would need
    its own such check for any NEW allowlist rows, following that per-wave pattern rather than a
    single shared file.
20. `apps/dashboard/app/shared/dbSeamCensus.bindings.ts` — confirmed EMPTY of any sandbox-export
    verb today (zero grep matches). PR-4's human-doors panel and any stage-(a)/(b)
    dashboard surface will need entries here the first time the dashboard reads
    `list_sandbox_exports`'s envelope or a new placeholder-debug read.
21. **Non-finding, stated so it is not silently assumed:** `packages/db/tests/x42-*.mjs` (the
    family the task prompt named as an example) is a DIFFERENT lane's test prefix entirely
    (advances/adjustments/period-close residuals) — unrelated to the sandbox-export/substitution
    seam. It gains no entries from this work.

**Docs:**
22. `docs/plan/active/sandbox-export-design.md` §3.6b / `-part2.md` need a follow-on section
    documenting the ACTUAL stage-(a)/(b) mechanism once built — today §3.6b only records the
    2026-08-23 RULING, not an implementation.
23. `docs/plan/active/sandbox-export-annexes.md` — Annex A (verb enumeration, +1 block kind,
    maybe +1 verb for stage b), Annex B (new battery cells: placeholder-basis validation, the
    cell-immutability-at-render-time replay proof per S46, the "mixed body still widens" proof
    per S30), Annex C (new decisions), Annex H (censuses gain rows per items 13-20 above).
24. `PROGRESS.md` — lane status once card 1 stages (a)/(b) land (constraint 8/clock-out
    protocol).
25. `docs/references/codebase-memory-graph.md` re-index after the code lands (AGENTS.md
    clock-out step 5).

---

## Open questions — design decisions (not owner decisions)

**D1. Where does the render-time value get pinned: at mint (a value baked into the row) or at
render (a pointer resolved lazily by immutable `cell_id`)?** S46 shows the pointer approach is
ALREADY race-free given the estate's existing immutability guarantees (S15-S18) and needs no new
mechanism — but the design text's own "at mint time" phrasing (S45) reads as if it expects the
former. This should be resolved explicitly in the design doc, not left to the builder to infer;
the pointer approach is markedly cheaper (no new column, no re-resolution logic) and is what
this survey recommends, but it is a design call, not something this survey can rule.

**D2. Stage (b)'s data model: extend `metric_cells` (loosen S17's CHECK **and** its enforcing
trigger, mint a `model_proposal`/`human_approval` relation pair those FKs would reference) — or
mint a wholly separate "ad hoc cells" relation the task prompt itself floated?** S19/S35 show
`wake_compose_metric_preview` already IS a working "propose an expression, validate, execute,
receipt" door that writes ordinary `metric_cells` rows (with `definition_version_id=null`)
today — extending that pathway (a new/widened AST grammar via a sibling of
`validate_metric_ast_v1`, still targeting `metric_cells`) reuses live, freeze-hashed, immutable,
RLS'd, well-tested machinery, and — per item 14 above — a NEW governed relation would need no
manual RLS-census entry either way. A parallel "ad hoc cells" table would duplicate S14-S23's
guarantees from scratch for no evident gain UNLESS stage-(b)'s expression domain is fundamentally
different from a metric AST's domain (e.g., expressions over ALREADY-MINTED cells — cell-to-cell
arithmetic — rather than over ledger primitives, account sets and constants, which
`_metric_eval_node_v1` does not support today, S33). This distinction — "expressions over ledger
primitives" vs. "expressions over other cells" — is the crux the design must settle before
choosing.

**D3. Does a `placeholder` block need its OWN `displayed_text`-shaped fallback field (for a
human-readable label before substitution, or for the case a cited cell is `cell_status <>
'ok'`), mirroring `metric_ref`'s `na_label` handling (`layout.mjs:249-261`)?** The sealed lane
REFUSES rather than inventing disclosure text for a non-`ok` cell (`na_label_unsealed`,
`layout.mjs:256-261`) — the survey recommends the sandbox seam adopt the identical refusal
posture (never silently print "N/A" or a blank), but this is a design call about the block's own
schema, not something 0132's existing shape already answers.

**D4. Should the `placeholder` block's basis-kind be restricted to `preview_cell` only, or
should a stage-(b) expression's INPUTS (the values it reads to compute a new result) also be
citable via `freeform_read`-kind basis elements?** `_eta_compose_metric_preview_core`'s domain
(S35) reads account-set/constant/snapshot primitives, never a `freeform_read_log` row — so if
stage (b) wants to let a model write an expression over the RESULT of a prior freeform read,
that is a new capability this estate's evaluator framework does not have a precedent for at all,
and is a materially larger scope decision than the survey's own framing suggested.

**D5 (new, from the render-chain lane's finding).** **"One geometry library, two entrances" is
currently a forward commitment, not a checkable fact** — `chart.mjs` has exactly one production
caller today (S11). If stage-(a)/(b) placeholders are text-only (no chart substitution), this
tension stays dormant for card 1's own scope; if chart-value substitution is in scope, the
design should say so explicitly, since it would be `layoutSandbox`'s chart path that FIRST makes
G-1 a real, both-directions-provable census rather than an aspiration.
