# Card 1 — the substitution seam: DESIGN (stages (a)+(b)), part 2

> **Part 2 of `card1-substitution-seam-design.md`** — v2, gate-folded 2026-08-26, split into
> THREE files at the fold (§3 alone grew past the two-file budget once BL-1..BL-4/M6/M7/M8
> folded in). **Part 1 carries §1-§2** (the honest B-mapping, stage (a)'s complete mechanism);
> **this file carries §3** (stage (b): the `cell` primitive, its evaluator-versioning plan, and
> the fold's four blocker-level corrections to it); **part 3** carries §4-§7. Section numbers
> continue; read part 1 first — nothing here restates its premises.

---

## §3 · Stage (b) mechanism — the `cell` primitive and its evaluator version

### 3.1 The `cell` primitive — shape, validation, evaluation

**Shape**, admitted as node kind twelve, closed field set `{node, cell_id}` — the same
discipline every other primitive in `_validate_metric_node_v1` already enforces (S31: e.g.
`constant` admits only `['node','key']`):

```json
{ "node": "cell", "cell_id": "<uuid>" }
```

**BL-5 — RULED: a `cell` node may reference only a DEFINITION-BACKED cell** (`metric_cells.
definition_version_id IS NOT NULL`) — **never** a preview-composed cell
(`definition_version_id IS NULL`, S19's own shape). This is the one place stage (b) is
STRICTER than stage (a) (§1's asymmetry sentence): a `placeholder` block may cite either kind
of `'ok'` cell, but a `cell` AST node — an INPUT to a NEW composition — may cite only a
canonical, human-lineage-traceable fact, never another model composition's own un-reviewed
output. **This closes R-CD-3 (the recursive cell-of-cell provenance question) by construction,
not by a new battery cell alone**: since every stage-(b) composition's OWN output is itself
`definition_version_id IS NULL` (S19's shape, unchanged — §3.2 item 5), and a `cell` node may
never cite such a row, **a `cell`-referencing formula can never be composed from another
`cell`-referencing formula's output.** Composition depth is exactly one level, structurally,
forever — not merely by convention. The refusal, raised at both validation and evaluation time
(defense in depth, matching BL-5's "in BOTH v2 validator and eval"): **`metric_cell_reference_
not_definition_backed`** (CLR10 — §5).

**Cross-period / cross-context composition is explicitly OUT of this build (M6's ruling,
below) and registered as a named extension point (§6)** — not silently absent.

**M6 — RULED (accounting-correctness; the one real design decision in this fold, not
relitigated): a `cell` operand must MATCH the composing context.** Two independent equalities,
both checked at evaluation time (validation time cannot see the composing context — no period/
snapshot arguments are available to `_validate_metric_node_v2`, exactly as v1's own validator
never sees them either):

1. **Period-set equality** — the cited cell's own `metric_cell_periods` rows
   (`period_id, ordinal`, `0058.sql:265-ff`) must be the EXACT SET the composing formula's own
   `metric_evaluation_context_periods` binds, compared as sets (order-independent — a cell
   computed over the same periods in a different ordinal arrangement is still the same set, but
   this design does not build a use case that would produce one, so the comparison is a plain
   set-equality, not an ordinal-aware one).
2. **`books_watermark` equality** — the cited cell's own `books_watermark` (frozen at the
   cell's own mint, `0058.sql:171`) must equal the composing formula's snapshot's
   `books_watermark` (`s.books_watermark`, already resolved in `_eta_compose_metric_preview_
   core_v2`'s own snapshot lookup, §3.2 item 5).

A mismatch on either axis refuses **`metric_cell_context_mismatch`** (CLR10 — §5) — a `cell`
node may not silently splice together facts computed against different books-freshness or
different reporting windows into one formula. **Why this is sufficient without a general
cross-period primitive**: in-context TIME comparison already exists in the closed grammar via
`lag`/`percent_change` (S31) — a formula that wants "this period vs three months ago" uses
`lag`, not a `cell` reference to a different-period cell. A `cell` node's whole purpose is to
let a NEW formula read an ALREADY-COMPUTED fact from the SAME reporting moment, not to become a
second, parallel time-travel primitive competing with `lag`.

**BL-4 — DECISION, ruled: the AST document tag (`clara.metric/v1`) and the composition schema
tag (`clara.metric-composition-inputs/v1`) stay UNCHANGED.** The AST GRAMMAR is extended (a
twelfth node kind admitted); the DOCUMENT FORMAT is not — every existing field of the top-level
`{ast, unit, temporality, result_scale, edge_policy_set, root}` object (`0059.sql:44`) keeps
its exact shape and its exact literal string comparisons (`a->>'ast' <> 'clara.metric/v1'`
still refuses on anything else). **The vocabulary identity is carried by the EVALUATOR
VERSION** (`evaluator_versions('evaluate_metric', 2)`, §3.2), never by the document tag — this
is the estate's own existing precedent for what a "version" means in this closure: S21's own
identity model is `(evaluator_name, version)`, not a document-format string, and
`_eta_compose_metric_preview_core_v2` resolves `('evaluate_metric', 2)` explicitly rather than
inferring grammar version from anything inside the AST body. A future genuinely NEW AST
document shape (a different top-level key set, not merely a wider node vocabulary) would be the
occasion for a `clara.metric/v2` tag; admitting one more closed node kind under the SAME
top-level shape is not that occasion.

**Validation** — a NEW function, `clara._validate_metric_node_v2(n jsonb, d int default 1,
p_firm uuid, p_client uuid)`. Its `cell` branch: confirms `cell_id` is a well-formed uuid;
resolves `select unit_key, definition_version_id, cell_status from clara.metric_cells where id
= (n->>'cell_id')::uuid and firm_id = p_firm and client_id = p_client` — **equality on both
`firm_id` and `client_id`, never `is not distinct from`, never a lookup that omits either** (the
C-20 pattern, applied here for the identical reason: `clara.metric_cells`'s own RLS policy for
`clara_fn_owner` is `using(true)` — `0058.sql:329` — so an unscoped lookup inside a definer body
would return every firm's rows, exactly the `0083:102-108` class of bug both
`sandbox-export-design.md` and this doc's §2.2 already guard against). Absent, foreign, and
cross-client all raise the **same** token (`metric_cell_reference_unknown`, CLR11 family, §5)
— no existence oracle, matching the estate's posture everywhere else a foreign id is resolved
(S20, B1.11's twin). **Then, in order:** `definition_version_id is null` refuses
`metric_cell_reference_not_definition_backed` (BL-5, structural gate at validation time —
fail-fast; the EVALUATOR's own check at §3.2 item 5 is the door that actually gates
persistence, matching the design's own two-door discipline elsewhere). `cell_status <> 'ok'`
refuses `metric_cell_reference_not_ok` (CLR10). Dimension is carried from the resolved
`unit_key` through the existing `clara.metric_units` lookup (`currency_power/days_power/
count_power`, S31's `constant` branch does the identical thing against `clara.metric_constants`
— `0059.sql:34` — the `cell` branch mirrors it against `clara.metric_units` directly since
`metric_cells.unit_key` already names a registered unit).

**M7 — the full `r` object, temporality corrected (not hardcoded).** This design's v1 draft
hardcoded the `cell` node's `temp` to `'flow'` and its `po` to `0` — **wrong**, per the fold:
a cited cell's REAL temporality is whatever its OWN `metric_definition_versions.temporality_
key` says (`point_in_time`, `flow`, or `period_average` — a `closing_balance`-aspect measure
composed into a canonical definition can be `point_in_time`, and hardcoding `'flow'` would
silently mis-declare it, corrupting every dimensional-algebra check downstream). The corrected
`cell` branch of `_validate_metric_node_v2`:

```sql
elsif k = 'cell' then
  if exists(select 1 from jsonb_object_keys(n) q where q <> all(array['node','cell_id'])) ...
  -- resolve + the four checks above (unknown / not-definition-backed / not-ok) ...
  select mu.currency_power, mu.days_power, mu.count_power, dv.temporality_key
    into v_cp, v_dp, v_np, v_temp
    from clara.metric_units mu, clara.metric_definition_versions dv
   where mu.unit_key = v_cell_unit_key and dv.id = v_dv_id;
  -- po=0 is DERIVED, not assumed: given M6's period-set-equality requirement (enforced at
  -- EVALUATION time, not here -- this validator has no period context), the cited cell's
  -- periods necessarily align with the composing context's own root period once M6 passes,
  -- so po=0 is the correct, honestly-reasoned value for a validator that cannot itself see
  -- the composing context -- not a shortcut. Stated so a future loosening of M6 does not
  -- silently inherit this assumption unexamined.
  r := jsonb_build_object('cp', v_cp, 'dp', v_dp, 'np', v_np, 'temp', v_temp, 'po', 0,
    'nodes', 1, 'leaves', 0, 'lag', 0);
```

**Evaluation** — a NEW function, `clara._metric_eval_node_v2(p_firm uuid, p_client uuid,
p_snapshot uuid, p_context uuid, p_period uuid, n jsonb, p_allow_negative boolean,
p_average_key text, p_as_of date default null) returns clara.metric_value_v1`. Its `cell`
branch re-resolves the SAME `firm_id = p_firm and client_id = p_client` predicate
(independently of the validator — evaluation-time is the check that actually gates what gets
persisted), re-confirms `definition_version_id is not null` and `cell_status = 'ok'`
(BL-5's evaluation-time door), then **M6's context-match check** (period-set equality against
`metric_cell_periods`, `books_watermark` equality against the snapshot), refusing
`metric_cell_context_mismatch` on either failure. On success, the FULL `clara.metric_value_v1`
contract, every field named (M7):

```sql
r.status := 'ok'; r.reason_key := null;
r.numerator := v_cited.exact_numerator; r.denominator := v_cited.exact_denominator;
r.currency_power := v_cp; r.days_power := v_dp; r.count_power := v_np;   -- from metric_units
r.temporality := v_temp;                                                 -- from the cited
                                                                           -- cell's OWN
                                                                           -- definition_version,
                                                                           -- never hardcoded
r.period_id := p_period;
-- M7: THE COMPOSITION-KEY-COLLISION DECISION, ruled -- cite by id, do NOT inline. A cell
-- node's contribution to account_set_version_ids/constant_version_ids/entry_ids/document_ids
-- is the EMPTY array on this node -- the cited cell's OWN provenance (its metric_cell_
-- account_sets/_constants/_entries/_documents rows) is NOT re-attributed to the composing
-- formula's result row by flattening it in here. Provenance stays NORMALIZED: a reader walks
-- composing-cell -> (inputs.input_values.cell_id) -> cited-cell -> its OWN child provenance
-- tables, rather than a duplicated, ever-growing inline copy. This also removes the key-
-- collision risk `_tf_metric_cell_integrity`'s own re-derivation (SS3.2) would otherwise face
-- if a cited cell's inputs happened to carry a 'composition' key of its own -- it cannot,
-- since BL-5 forbids citing a composed cell at all, but citing by id rather than inlining
-- means this holds even if that wall were ever loosened, not merely by the current absence
-- of the case.
r.account_set_version_ids := '{}'; r.constant_version_ids := '{}';
r.entry_ids := '{}'; r.document_ids := '{}';
r.inputs := jsonb_build_object('sign_normalizations', '[]'::jsonb,
  'input_values', jsonb_build_object('node', 'cell', 'cell_id', v_cited.id,
    'value', jsonb_build_object('numerator', v_cited.exact_numerator,
                                 'denominator', v_cited.exact_denominator)));
```

This mirrors the `constant` branch's own shape exactly (`0059.sql:99`: `'node','constant',
'key',...,'version_id',cv.id,'value',...`) — a `cell` node cites its source BY ID, echoes only
the numeric value, and stops.

### 3.2 Evaluator versioning — the precise plan (v2, corrected on four points)

**Why v1's functions cannot be edited in place — mechanically, not just by convention.**
`clara._validate_metric_node_v1` and `clara._metric_eval_node_v1` are registered members of the
`evaluator_versions` row `('evaluate_metric', 1)`, minted by the freeze DO block at
`0059.sql:246`. `evaluate_metric` v1 is `deployed:true` (S23's cross-checked roster read).
Once deployed, `clara.verify_evaluator_freeze()` (`0059.sql:248`) — invoked between every
migration body and its commit by `scripts/migrate.mjs` (S22) — **re-derives
`sha256(pg_get_functiondef(member_signature))` LIVE from the catalog for every member and
refuses on any mismatch.** This is a mechanical block, independent of the repo-side
`check-frozen-evaluators.mjs`'s narrower, exact-name-pattern scope (S23).

**BL-4 — CD-8's recut, FOUR hardcoded v1 references, not two (this fold's own re-read of
`_tf_metric_cell_integrity` found two the pre-fold draft missed).** The
`definition_version_id is null` branch of `clara._tf_metric_cell_integrity`
(`0060_wave_e_delta_metrics_security.sql:237-284`) — the branch every preview-composed cell,
canonical or `cell`-referencing, takes — hardcodes:

1. `clara._metric_eval_node_v1(...)` (`0060.sql:258`) — the re-derivation call itself.
2. `clara.validate_metric_ast_v1(z->'ast')` (`0060.sql:257`) — the re-validation call.
3. **`z->>'evaluator_entrypoint' is distinct from 'clara.evaluate_metric_v1(uuid,uuid,uuid[],
   uuid,uuid)'`** (`0060.sql:253`) — a literal STRING comparison against v1's own entrypoint
   signature, embedded in the composition-identity check. This is version-dispatched, not
   merely called: for a v2-composed cell, the trigger must compare against
   `'clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)'` instead — the SAME literal-string
   idiom, retargeted, never generalized into a lookup (matching the estate's own preference for
   explicit literals over indirection in a security-critical wall).
4. **`clara._normalize_metric_node_v1(...)`** — used inside `_eta_compose_metric_preview_core`
   (`0077.sql:205`) to build the normalized AST the composition hash covers, and (by the same
   shape) inside `_tf_metric_cell_integrity`'s own re-derivation via the `composition` object's
   own `z#>'{ast,root}' is distinct from clara._normalize_metric_node_v1(z#>'{ast,root}')`
   check (`0060.sql:253`). **Read in full for this fold** (`0059.sql:70`, quoted verbatim
   below): `_normalize_metric_node_v1(n jsonb)` recurses on `sum`/`average`'s `terms`,
   `lag`/`average`'s `of`, `divide`'s `num`/`den`, `percent_change`'s `current`/`prior`, and
   `subtract`/`multiply`'s `left`/`right` (with a canonical-order swap on `multiply`'s
   operands) — **it has NO branch for any node kind outside these seven, and its
   `else return n` catch-all returns an unrecognised node UNCHANGED, verbatim, with no
   recursion into it.** For a `cell` node (a leaf with no sub-nodes to normalize), this
   catch-all is exactly correct: `_normalize_metric_node_v1({"node":"cell","cell_id":"..."})`
   returns the node byte-identically, which is the right normalization for a leaf carrying no
   commutative or nested structure. **`_normalize_metric_node_v1` is therefore VERIFIED BENIGN
   for the `cell` primitive and needs NO `_v2` sibling** — it is called by BOTH v1 and v2
   compositions unchanged, and this claim is grounded in having read its full body, not
   assumed from its name pattern.

**The plan, five new objects, one widened trigger, all in a single new migration on top of
0132 (or a migration immediately following it — sequencing is the conductor's call, not this
design's):**

1. **`clara._validate_metric_node_v2(n jsonb, d int default 1, p_firm uuid, p_client uuid)`** —
   a new function. Its body is v1's closed `elsif` chain **plus one new `elsif k='cell'`
   branch** (§3.1) admitting the SAME eleven v1 primitives unchanged, extend-only to twelve —
   mirroring the `metric_primitives` 11→12 row-widening (below) exactly. **`p_firm`/`p_client`
   are new, deliberate signature additions v1 does not carry** — v1's structural validator never
   needed them because none of its eleven primitives read firm-scoped OPERATIONAL data (S31's
   catalog reads — `metric_constants`, `edge_policy_sets` — are firm-nullable CATALOG tables,
   never RLS-forced operational rows); `cell` is the first primitive that does, so v2's
   signature genuinely widens rather than merely being copied.
2. **`clara.validate_metric_ast_v2(a jsonb, p_firm uuid, p_client uuid)`** — wraps (1) exactly
   as `validate_metric_ast_v1` wraps `_validate_metric_node_v1` (`0059.sql:44`), the SAME
   six-key top-level closure, the SAME `a->>'ast' = 'clara.metric/v1'` literal check (BL-4,
   unchanged), the same declared-vs-inferred unit/temporality match.
3. **`clara._metric_eval_node_v2(p_firm uuid, p_client uuid, p_snapshot uuid, p_context uuid,
   p_period uuid, n jsonb, p_allow_negative boolean, p_average_key text, p_as_of date default
   null) returns clara.metric_value_v1`** — v1's body plus the `cell` case (§3.1, M6, M7).
   Reuses the UNCHANGED v1 helper functions it needs verbatim
   (`_metric_selector_account_ids`, `_normalize_metric_node_v1` (BL-4 item 4, verified benign),
   `_metric_context_sha256_v1`, `_metric_resolved_inputs_sha256_v1`, `_hash`) — these become
   members of BOTH the v1 and v2 evaluator closures simultaneously, which the freeze schema
   already supports (`evaluator_version_members`' PK is `(evaluator_version_id,
   member_signature)`, so one function signature can be a member of many evaluator versions).
   **M8 — the recursive call-site retargets, counted precisely, not asserted.** Every point in
   v1's body (`0059.sql:95-105`, read in full for this fold) where `_metric_eval_node_v1` calls
   ITSELF must retarget to `_metric_eval_node_v2` in the v2 body. **This design counts SEVEN
   distinct textual call sites, not six** — stated as a discrepancy against the fold's own
   count rather than silently matched, per review law 2/3 (a count is evidence only once
   verified against the actual body, and this design verified it): `lag`'s tail-call (1,
   `0059.sql:102`) · `average ... of`'s loop-body call (1, `:103`) · `sum`/`average ...
   terms`'s loop-body call (1, `:104`) · `percent_change`'s two operand calls, `prior` then
   `current` (2, `:105`) · `divide`/`subtract`/`multiply`'s two shared operand calls, the
   num-or-left then den-or-right (2, `:105`). **`_validate_metric_node_v2` needs the identical
   retargeting at the identical seven shapes within `_validate_metric_node_v1`'s own body**
   (`0059.sql:37-40`) — fourteen retargets total across the two v2 functions. **If the gate
   reviewer's count of six was scoped differently (e.g. by node-KIND rather than by textual
   call site — five kind-groups recurse: `lag`, `average-of`, `sum`/`average`-terms,
   `percent_change`, `divide`/`subtract`/`multiply`), that reconciles to five, not six or
   seven either — this design flags the three-way count discrepancy for the coordinator rather
   than picking whichever number is convenient.**
4. **BL-2 — RULED: `clara.evaluate_metric_v2(p_client uuid, p_definition_version_id uuid,
   p_period_ids uuid[], p_snapshot_id uuid, p_run_id uuid) returns jsonb` is minted as the
   REAL, honest entrypoint** — the same signature as `evaluate_metric_v1`
   (`0059.sql:112`), its body mirroring v1's shape line-for-line with every `_v1` call
   retargeted to `_v2` (M8's fourteen retargets apply inside it transitively, via
   `_metric_eval_node_v2`). **This is the "honest branch" the fold names**: rather than relying
   only on the DB-side closure hash (which would leave `verify_evaluator_freeze()`'s
   `entry_count = 1` requirement — `0059.sql:248`'s own count, `count(*) filter (where
   member_signature = r.entrypoint_signature)` — with no literal target to count), a real,
   callable, correctly-typed `evaluate_*`-named function exists, and `check-frozen-
   evaluators.mjs`'s scan (S23) finds and hashes it directly, exactly as it does
   `evaluate_metric_v1`. **Scope boundary, stated as a decision this design makes rather than
   one the fold dictated:** `propose_metric_definition`/`approve_metric_definition`
   (`0059.sql:82,85`) stay v1-scoped, unedited — no human-proposable, firm-approved,
   `cell`-referencing CANONICAL definition is buildable through this session's scope.
   `evaluate_metric_v2` is therefore real, correctly hashed, and callable, but has **no
   currently-reachable caller other than being the evaluator-identity anchor** the freeze
   machinery requires — its canonical-path caller (a `propose_metric_definition_v2`/
   `approve_metric_definition_v2` pair admitting `cell`-referencing definitions) is a **named
   future extension** (§6), not built here. This scope boundary is this design's own judgement
   call, not a ruled DECISION from the fold, and is flagged for sign-off precisely because it
   narrows what "the real entrypoint" does in practice.
5. **`clara._eta_compose_metric_preview_core_v2`** and a sibling wake wrapper
   **`clara.wake_compose_metric_preview_v2`** — a NEW pair, never a rewrite of the v1 pair. The
   v2 core is `_eta_compose_metric_preview_core`'s body with three changes: it resolves
   `evaluator_versions` for `('evaluate_metric', 2, ...)` instead of version 1 (`0077.sql:
   160-161`'s exact query, version literal changed); it calls `clara.validate_metric_ast_v2(
   p_ast, p_firm, p_client)` instead of `validate_metric_ast_v1`; it calls
   `_metric_eval_node_v2(p_firm, p_client, ...)` instead of `_metric_eval_node_v1`. The receipt
   shape (`_reserve_op`/`_audit`/`_finish_op`), the cost ceilings, the policy-effectivity
   refusal-not-reselection discipline (`0077.sql:177-190`'s load-bearing comment) and the
   `metric_cells` insert shape (`definition_version_id=null`, the identical `na` provenance
   stamp `0077.sql:248-252`) are UNCHANGED — copied verbatim, not reinvented, because **D2's
   ruling keeps the S17 walls SHUT**: no new `model_proposal`/`human_approval` relation, no
   loosened CHECK, the preview path's existing "not_applicable" provenance stamp IS the (b)
   provenance, exactly as the brief specifies. **The allowlist row is `('interactive',
   'wake_compose_metric_preview_v2')` alone, permanently** (M2, §2.6).
6. **`clara._tf_metric_cell_integrity` is `create or replace`d** (the FILE `0060.sql` stays
   immutable; the LIVE function it defines is replaced by a new migration —
   `packages/db/README.md`'s "applied files are immutable" governs the file, not the object) to
   branch on the inserted cell's evaluator identity — via BL-4 item 3's retargeted literal
   comparison — before choosing which pair of functions re-derives it. When the composition's
   `evaluator_entrypoint` matches v1's literal, the trigger's existing branch runs **completely
   unchanged** — a byte-for-byte regression-safety requirement, proven by a differential
   battery cell (Annex B) that replays a v1-composed cell through the widened trigger and
   asserts identical behaviour to the pre-widening trigger. When it matches v2's literal, the
   SAME re-derivation shape runs against `_validate_metric_node_v2`/`_metric_eval_node_v2`
   instead, threading `new.firm_id`/`new.client_id` (already columns on the row being checked)
   into the v2 calls, and additionally re-checks BL-5's definition-backed requirement and M6's
   context-match on every `cell` node the composition's AST contains. **This is judgement logic
   changing a security-critical wall — review law 1's floor applies in full, and it is the one
   piece of this design that most needs the independent pass before merge.**

**BL-1 — RULED: `clara.metric_primitives.primitive_key`'s CHECK requires an ALTER, not a plain
INSERT (§4/Annex A.1 corrected — this build is NOT DDL-free).** `0058.sql:67-69` (re-read for
this fold): `create table clara.metric_primitives(primitive_key text primary key check(
primitive_key in('measure','sum','average','lag','subtract','divide','days_in_period',
'percent_change','multiply','constant','count')), ...)` — an INLINE, UNNAMED CHECK on the
`primitive_key` column, closed to the eleven existing literals. **Inserting `'cell'` against
this CHECK as-is fails outright** — this design's pre-fold draft treated the 11→12 widening as
a plain DML insert, which is wrong. The new migration must:

```sql
-- The constraint name is READ FROM THE LIVE CATALOG, never guessed (BL-1's own instruction --
-- Postgres's default auto-naming for an unnamed single-column CHECK is predictable
-- (`<table>_<column>_check`) but this migration does not assume it; it looks the name up.
do $$ declare v_conname text; begin
  select conname into v_conname from pg_constraint
   where conrelid = 'clara.metric_primitives'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%primitive_key%';
  execute format('alter table clara.metric_primitives drop constraint %I', v_conname);
end $$;
alter table clara.metric_primitives add constraint metric_primitives_primitive_key_check
  check (primitive_key in ('measure','sum','average','lag','subtract','divide',
    'days_in_period','percent_change','multiply','constant','count','cell'));
insert into clara.metric_primitives(primitive_key, structural_integer_fields)
  values ('cell', '{}');
```

`clara.metric_primitives` widens **11→12, extend-only** — the new migration reproduces (not
edits) `0059.sql:251`'s tail-census shape with the count assertion updated to `12`, **never
editing `0059.sql`'s own `if n<>11` line**, which stays exactly as printed forever (migration
immutability). The new migration's own tail similarly reproduces (not edits) the
`primary_members`/`checker_members` closure-census shape at `0059.sql:251`, extended to also
assert the new `evaluate_metric` v2 row's member count (BL-2's real closure, item 3's helper
reuse, item 4's own entrypoint — the exact member count depends on the final function list,
asserted by the migration's own printed line, not guessed here).

**BL-3 — RULED: the deploy-once trigger GATES a manual transition; it does not FLIP one
itself. Stage (b) ships DARK until a separate ceremony runs.** `clara._tf_evaluator_deploy_
once()` (`0060.sql:93-103`, read in full for this fold) is a `BEFORE INSERT OR UPDATE OR
DELETE` trigger that: refuses an INSERT carrying `deployed=true` (evaluator versions are BORN
undeployed); refuses a DELETE outright; and, on UPDATE, **refuses unless `current_user =
session_user`** (`0060.sql:98`: *"evaluator deployment requires the migration ceremony
principal"*) **and** the update is EXACTLY the one legal `deployed: false → true` transition
with every other column unchanged, THEN calls `clara.verify_evaluator_freeze()` itself before
allowing it through. **`current_user = session_user` means the deploying session must hold NO
active `SET ROLE`** — most migrations run under `set role clara_fn_owner;` (e.g. `0059.sql:13`)
for their whole body, which makes `current_user <> session_user` for their duration and would
make an in-migration flip refuse. **The flip is therefore a SEPARATE, LATER, manual ceremony
act — never bundled into the same migration that mints the undeployed row** — matching the
estate's own existing precedent exactly: `evaluate_fs_pack_agent_v1` (0111) has sat
`deployed:false` since that migration landed, "pending its own ceremony" (S23's own words, this
fold's grounding). `evaluate_metric` v2 joins it in the SAME posture. §7 gains the ceremony as
an explicit step (a D1-ish window, run by the migration-runner principal with no `SET ROLE`
active, executing `UPDATE clara.evaluator_versions SET deployed = true WHERE evaluator_name =
'evaluate_metric' AND version = 2` — a small wrapping script, named here `--lock-deployed` per
the fold's own flag naming, is new tooling this design mints, not something already in the
repo: no existing script does this today, confirmed by a repo-wide search for
`lock-deployed`/`lock_deployed` finding zero hits). Annex F gains this as an explicit
PRECONDITION of acceptance, and Annex B gains both-polarity cells: the flip succeeds under the
bare migration-runner principal and refuses under `clara_fn_owner`/any `SET ROLE`'d session.

### 3.3 Stage (b)'s refusal vocabulary

New tokens this stage introduces (full table with CLR codes in §5): `metric_cell_reference_
unknown` (CLR11 — absent, foreign, or cross-client, indistinguishable, the no-oracle rule) ·
`metric_cell_reference_not_definition_backed` (CLR10 — BL-5, a `cell` node cited a
preview-composed cell, never a canonical one) · `metric_cell_reference_not_ok` (CLR10 — the
cited cell did not evaluate to `'ok'`) · `metric_cell_context_mismatch` (CLR10 — M6, the cited
cell's periods or `books_watermark` do not match the composing context) ·
`expression_forbidden_syntax` (CLR10 — reserved for the named extension point, §6; never
raised by this build, since no code path accepts anything but the closed AST). No new CLR
error CLASS is introduced — S37's own recommendation (CLR10 bad-request, CLR11
not-found-in-your-firm) is followed exactly, matching the vocabulary `_validate_metric_node_v1`
itself already uses for its eleven existing primitives.

---

*(Continued in `card1-substitution-seam-design-part3.md`: §4 walls unchanged, §5 the full
refusal-token table, §6 named extension points + non-goals, §7 the migration + runtime + census
move list. Section numbers continue.)*
