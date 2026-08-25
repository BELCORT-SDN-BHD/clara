# Card 1 — the substitution seam: DESIGN (stages (a)+(b))

> **Implements the 2026-08-23 owner sitting's card-1 ruling**, recorded at
> `sandbox-export-design.md` §3.6b/§7 item 1: *"the model writes placeholders into `p_body`,
> never a typed numeral; the renderer substitutes each placeholder with the DB-read value...
> No model-typed numeral reaches the sealed bytes."* This doc is the mechanism the ruling names
> but does not build — **both stages, this backend session, before frontend integration** (the
> owner's own scoping). Where this file and the estate survey disagree, **the live catalog is
> right and this file is the bug**; every claim below that is not a direct code read is marked
> as this doc's own design choice, not a survey finding.
>
> **Companions.** `docs/plan/research/card1-substitution-seam-survey.md` +
> `-part2.md` — the estate at the bytes, findings **S1-S48**, the closed-world move list, and
> the open design questions **D1-D5** this file resolves. `card1-substitution-seam-annexes.md`
> — **A** the surface · **B** the battery · **C** decisions · **D** predictions · **E** risks ·
> **F** acceptance. **Split at the repo's 500-line convention**, the `sandbox-export-design.md`
> / `-part2.md` shape: this file carries §1-§3; `card1-substitution-seam-design-part2.md`
> carries §4-§7 (walls, the refusal-token table, extension points/non-goals, the migration +
> runtime + census move list). Section numbers are continuous across both.
>
> **Binds under** everything `sandbox-export-design.md` binds under (its front matter, §1's
> ruled shape, §3.1-§3.7's walls — this seam is built INSIDE that lane, not beside it), plus
> **hard constraint 2** (the DB owns every authoritative number — this is the mechanism that
> makes constraint 2 true for narrative exports) and **hard constraint 9**'s spirit, extended
> here to the evaluator-freeze machinery: §3.2 spells out why the DB-side freeze census, not
> merely the repo-side lint, is what makes "edit the v1 evaluator in place" mechanically
> impossible, not just discouraged. **§2 and §3 are judgement logic end to end** (review law 1)
> — every guard named here takes an independent review pass before merge.
>
> **Grounding.** Read from `main` at this worktree's checkout, except every `0132.sql:`
> citation, which is read from `origin/f-a5b/pr-1` at tip `ee76f70` (F-A5b PR-1, not yet
> merged) — the survey's own method note applies unchanged. `0077.sql`/`0059.sql`/`0058.sql`/
> `0060.sql`/`layout.mjs` citations are read from `main` directly.

---

## §1 · What, why, and the honest B-mapping

**What.** Card 1 is the substitution seam: the mechanism by which a narrative sandbox export
(F-A5b's `sandbox_views`/`sandbox_exports`, `0132.sql`) can carry a FIGURE — not just prose —
without a model ever typing that figure into `displayed_text`. Two stages, both in this
session's scope:

- **Stage (a).** A placeholder block cites a PRE-COMPUTED, already-minted `metric_cells` row
  by its pinned `id`. The renderer substitutes the cell's own `displayed_text` at render time,
  read through the exact same fail-closed accessor (`need()`, `layout.mjs:81-88`) every other
  DB-sourced string in the renderer already goes through. No new evaluation happens; the value
  already exists and is immutable (S15-S18).
- **Stage (b).** A model PROPOSES a deterministic expression — an AST, not free text — over
  values that are themselves already-minted `metric_cells` rows. A DEFINER core validates and
  evaluates the expression, exactly the shape `_eta_compose_metric_preview_core` already ships
  for metric-AST previews (S19, S35), and the RESULT becomes a new, ordinary, immutable
  `metric_cells` row — citable by a stage-(a) placeholder like any other cell. Stage (b) is not
  a second substitution mechanism; **it is a second WAY TO MINT the thing stage (a) cites.**

**Why.** TA-P10 C′ (4) permits exporting a free-query aggregate as narrative content; PRD §6
invariant 1 forbids a model-retyped numeral from reaching a durable artifact. Before this
ruling those two clauses collided the moment a chart or a sentence needed to show a number
(`sandbox-export-gate-record.md`'s owner card 1). The substitution seam reconciles them by
making the placeholder a POINTER the DB resolves, never a value the model states — the same
discipline `metric_ref` already enforces for the sealed lane (S8), extended to the sandbox
lane.

**The honest B-mapping — stated plainly, because a design that leaves this implicit invites a
builder to reach for the wrong primitive.** The owner's ruling for stage (b) was **"restricted
read-only over raw books"** — the model may propose a formula, but the formula's INPUTS must
be raw books, not another model's say-so. Mechanically, this design honors that choice via the
estate's existing **deterministic raw-data vocabulary**: the eleven AST primitives
`_validate_metric_node_v1` already admits (S31) — `measure`, `constant`, `days_in_period`,
`count`, `lag`, `average`, `sum`, `divide`, `subtract`, `multiply`, `percent_change` — resolve
exclusively against pre-materialized, immutable **snapshot** tables
(`metric_input_snapshot_*`), versioned **account sets**, and versioned **constants** (S33):
every leaf is a raw-books read, never a live table scan, never a caller-assembled column
reference. Stage (b)'s new twelfth primitive, `cell` (§3.1), extends this same closed
vocabulary by ONE more leaf kind — a reference to an already-minted `metric_cells` row, itself
the immutable output of a prior raw-books evaluation. **"Restricted read-only over raw books"
is satisfied because every leaf in the closed AST — including the new one — bottoms out in a
snapshot-bound fact or a previously-evaluated cell, never in caller-supplied SQL text, never in
a live-books scan the model could shape.** This is a mapping onto the estate's own vocabulary,
not a literal rebuild of "raw books" as a phrase — the design states it as such rather than
leaving it to be inferred.

**What this design does NOT build, named here so it is not silently assumed to be in scope
later.** Arbitrary SQL text — or any caller-composed expression outside the closed AST
grammar — as formula input has **no path into this design** and **no precedent anywhere in the
estate** (S38's headline finding: no `EXECUTE format(...)`-style DEFINER dynamic-SQL evaluator
guarded by a strict input allowlist exists for a general computation). This is registered here
as a **NAMED EXTENSION POINT** (§6), with its own refusal token
(`expression_forbidden_syntax`, §5) reserved for it, so that a future build reaching for
"just let the model write SQL" finds a wall and a name, not a silent gap it has to rediscover.

---

## §2 · Stage (a) mechanism — placeholder blocks citing pre-computed cells

### 2.1 The block kind

A new top-level `body` block kind, `kind='placeholder'`, admitted beside the existing
`kind='text'` (S24). **Not** placeholder syntax embedded inside `text`'s `displayed_text`
string — the survey's own reasoning (S29) is adopted verbatim: the validator's shape is
already a closed switch on `block.kind`, the estate's house style rejects string-interpolation
grammars in favour of typed AST nodes everywhere else (`layout.mjs:1-11`), and an embedded
grammar would need its own mini-parser twice (mint-time and render-time), doubling the
injection surface X11 already worries about. A typed block reuses the SAME validated-JSON-shape
discipline every other block/basis element already gets.

**Shape**, closed:

```json
{ "kind": "placeholder", "basis_ref": "<label naming a basis element>" }
```

No `displayed_text` field — a placeholder block carries no fallback string of its own (§2.6
explains why a `na_label`-shaped fallback is deliberately NOT mirrored here). No other field
is admitted; an unrecognised key is a `sandbox_view_body_malformed` refusal, the same posture
every other typed shape in `0132.sql` already takes (`block_shape`, S24's own `elsif` pattern).

### 2.2 Validation — the widened `_sandbox_client_set`

`clara._sandbox_client_set` (`0132.sql:549-733`) is `create or replace`d in a **new**
migration on top of 0132 — this is a plain ungranted core, not `evaluate_*`-named and not a
member of any frozen evaluator closure, so it carries no freeze obligation (S23's scope note).
The widening, inside the existing block-validation loop (`0132.sql:626-655`):

1. **`v_kind` admits `'placeholder'`** alongside `'text'` (replacing the single `elsif v_kind
   is distinct from 'text'` refusal at `0132.sql:632-635` with a two-armed check).
2. **A `placeholder` block's `basis_ref` must resolve to a basis element whose OWN `kind` is
   `'preview_cell'`** — never `'freeform_read'`. A `freeform_read` basis has no single numeric
   value to substitute (the closed-world list's item 2); citing one from a placeholder is a
   NEW typed refusal, `sandbox_placeholder_basis_not_cell` (§5), raised at the same point the
   existing `basis_ref` resolution already runs (`0132.sql:647-651`), after the label-exists
   check and before anything is derived.
3. **The referenced cell's `cell_status` must be `'ok'`** (D3). A second new check, in the same
   loop, once the basis element's `kind='preview_cell'` is confirmed: `select cell_status from
   clara.metric_cells where id = ... and firm_id = p_firm` (the SAME equality-on-`p_firm`
   pattern C-20 already mandates for every basis lookup in this core) — a non-`'ok'` status
   refuses `sandbox_placeholder_cell_not_ok` (CLR10 family; §5). **This is the mint-time half
   of D3's two-door posture** — the render-time half is §2.5.
4. **A `placeholder` block does NOT set `v_has_free_text`** (S30). This is the deliberate,
   non-side-effect code change the migration's own header predicted (`0132.sql:542-548`,
   quoted in the survey at S30): "a future placeholder block once the substitution seam
   lands... reversible the day a non-free-text block kind exists." A body made ENTIRELY of
   `placeholder` blocks (plus zero `text` blocks) derives the **exact** client set — S27's
   existing per-basis-kind derivation already does the right thing for a `preview_cell` label
   with zero new logic, because that derivation keys off the BASIS element's `kind`, never the
   block's `kind`. A MIXED body (any `text` block present) still widens to `firm_closure`,
   because a `text` block is still free text — this is not an oversight to fix later; it is
   the exact boundary S30 draws.
5. **`sandbox_view_body_malformed`'s figure-shaped-as-a-number reason** (already named as a
   re-cut target in `sandbox-export-design.md:411-413`, "from a TYPE assertion to a
   PROVENANCE assertion") is realized here: a `placeholder` block IS that provenance
   assertion — there is no code path left by which a numeral typed by the model can be
   admitted as a block's content, because a `placeholder` block carries no numeral-shaped
   field at all (2.1).

### 2.3 Derivation — zero new logic, confirmed

S27's existing per-basis-kind exact derivation (`0132.sql:667-672`) already resolves a
`preview_cell` label to `select client_id into v_preview_client from clara.metric_cells where
id = ... and firm_id = p_firm` — this is unconditional on the CITING block's kind. A
`placeholder` block citing a `preview_cell` basis element folds into the exact client set
through this SAME code path. **Nothing in §2.2 touches this derivation loop** — only the
`v_has_free_text` flag (2.2 item 4) and the block-kind admission (2.2 item 1) change.

### 2.4 Payload — pre-join by pinned `cell_id`, never re-derive

`clara.sandbox_export_payload` (`0132.sql:946-964`) widens, in the same new migration, to
carry resolved cell values pre-joined by the EXACT `cell_id`s recorded in the minted
`sandbox_views.basis` array — mirroring the exact pattern by which 0132 itself widened this
same function to carry the pinned `watermark_policy_version_id`'s resolved text (`0132.sql:
940-945`'s own comment, quoted in S42: *"the worker payload previously handed back only the
pinned... UUID — PR-3's renderer has no other door to the pinned TEXT... `clara_runtime` holds
no table grant on `watermark_policy_versions`... One join, resolved by the row's OWN frozen
id"*). The same reasoning applies unit-for-unit to `metric_cells`: `clara_runtime` holds **no
table grant** on `clara.metric_cells` anywhere in 0058-0061's grants (S42), and
`clara.get_context_pack` explicitly forbids returning cell payload fields (S42's additional
finding) — so a widened `sandbox_export_payload` is the **only lawful path** for the worker to
obtain a cell's value.

**The widening, concretely:**

```sql
'cells', (
  select coalesce(jsonb_object_agg(b.label, jsonb_build_object(
           'cell_id', b.id, 'cell_status', mc.cell_status, 'displayed_text', mc.displayed_text
         )), '{}'::jsonb)
    from jsonb_to_recordset(v.basis) as b(label text, kind text, id uuid)
    join clara.metric_cells mc on mc.id = b.id and mc.firm_id = e.firm_id
   where b.kind = 'preview_cell'
)
```

**This is the single load-bearing implementation rule (S46) restated as code**: the join key is
the EXACT `id` recorded in the MINTED `sandbox_views.basis` array — never a "latest cell for
this definition" re-lookup, never a re-run of any part of `_sandbox_client_set`'s derivation.
Because a `metric_cells` row is permanently immutable (S15) and the `basis` array is frozen at
mint (append-only, `0132.sql:277-280`), this join reproduces byte-identically whatever existed
at mint, at any later render time — no lock, no "as-of" column, no new mechanism (S46's own
conclusion, adopted here as the built rule). **This resolves D1**: the placeholder's value is
pinned at mint (the `cell_id` the basis names can never change) and resolved LAZILY at render
(the join runs when the worker calls `sandbox_export_payload`, not when the view was minted) —
both halves of S45's ambiguity are true simultaneously, because the estate's own immutability
guarantees make them equivalent. No new column on `sandbox_views` is needed.

### 2.5 Renderer — `layoutSandbox()`, mirroring `assemble()`

A new export from `packages/reporting-render/lib/layout.mjs` (or a sibling module, per the
package's own convention — the ceremony discipline in §7 covers either), `layoutSandbox(view,
decision)`, with its own closed block-kind switch admitting `text` and `placeholder` (mirrors
`assemble()`'s node-kind switch, `layout.mjs:196-218` for block-level and `layout.mjs:237-278`
for inline resolution). The `placeholder` case:

```js
case "placeholder": {
  const cell = need(cellsByBasisRef, content.basis_ref, "sandbox_cell");
  return `s(${typstString(cell.displayed_text)})`;
}
```

`cellsByBasisRef` is built by a new `shapeSandboxPayload()` (mirrors `shapePayload()`,
`render-worker.mjs:67-112`, per S43) straight off the widened `sandbox_export_payload` jsonb's
`cells` object (2.4). **This deliberately does NOT mirror `metric_ref`'s `na_label` fallback
branch** (`layout.mjs:249-261`) — a `placeholder` block has no fallback string to print. The
reason is not stylistic: §2.2 item 3 already refuses at MINT any placeholder citing a
non-`'ok'` cell, and because `metric_cells` rows are immutable (S15), a cell that was `'ok'` at
mint can never become not-`'ok'` by render time — there is no live-data race for a fallback to
cover. The render-time check is **pure defense-in-depth against a payload-builder bug**, not
against a state change, so a flat fail-closed map lookup (`need()`, throwing
`sandbox_cell_unresolved` — the same idiom `case "placeholder"`'s EXISTING
`protected_placeholder` resolution already uses, `layout.mjs:240-244`, S8) is the correct
mirror, not `metric_ref`'s richer NA-disclosure branch. **This is D3's render-time mirror,
built.**

The sandbox watermark burn (§3.6 of the sealed design, C-23) is unaffected — `layoutSandbox`
keeps its own unconditional watermark wall exactly as `sandbox-export-design.md` already
specifies; this seam adds a block kind, not a new entrance.

### 2.6 The claim verb + leader-dispatch pair — pulled into this build's scope

S13's registered gap stands: **no CLAIM verb ships in 0132**, and no
`render_dispatch_begin`/`_record`-equivalent exists for the `sandbox_exports` job family (S3,
S41). Without them, nothing built in §2.1-§2.5 is renderable end to end — a mint can succeed
and a payload function can exist, but no worker process ever transitions a
`sandbox_exports` row from `claimable` to `running` to reach it. The brief for this session is
explicit that this gap is **in scope here**, not deferred to a later PR: this design mints

- `clara.claim_sandbox_export(p_worker text, p_lease interval default '20 minutes')` — mirrors
  `clara.claim_render_job` (`0081.sql:98-138`) exactly: `FOR UPDATE SKIP LOCKED`, oldest-first,
  refuses at an attempts ceiling, granted to `clara_runtime` alone.
- A leader-side `clara.sandbox_dispatch_begin(p_cooldown interval, p_max int)` /
  `clara.sandbox_dispatch_record(p_job_ids uuid[], p_ok boolean, p_detail jsonb)` pair, mirroring
  `render_dispatch_begin`/`render_dispatch_record` (`0081.sql:345-414`, S3) — the LEADER's own
  due-read + outcome-receipt verbs, distinct from the worker's claim/payload/complete/fail
  quartet.
- `db.mjs`-equivalent sandbox worker wrappers (`claimSandboxJob`, `sandboxJobPayload`,
  `completeSandboxJob`, `failSandboxJob`) in the renderer package, each wrapping exactly one
  `clara.*` verb call, mirroring `db.mjs:57-90`'s shape (S3, item 9 of the closed-world list).

These are **new** verbs (a genuine relation surface addition, Annex A), not a widening of any
existing frozen body — `render_jobs`' own claim/dispatch verbs stay untouched (C-11's sibling
job family posture, unmoved).

---

## §3 · Stage (b) mechanism — the `cell` primitive and its evaluator version

### 3.1 The `cell` primitive — shape, validation, evaluation

**Shape**, admitted as node kind twelve, closed field set `{node, cell_id}` — the same
discipline every other primitive in `_validate_metric_node_v1` already enforces (S31: e.g.
`constant` admits only `['node','key']`):

```json
{ "node": "cell", "cell_id": "<uuid>" }
```

**Validation** — a NEW function, `clara._validate_metric_node_v2(n jsonb, d int default 1,
p_firm uuid, p_client uuid)`, described precisely in §3.2 (why it cannot be `v1` widened in
place). Its `cell` branch: confirms `cell_id` is a well-formed uuid; resolves
`select unit_key, cell_status from clara.metric_cells where id = (n->>'cell_id')::uuid and
firm_id = p_firm and client_id = p_client` — **equality on both `firm_id` and `client_id`,
never `is not distinct from`, never a lookup that omits either** (the C-20 pattern, applied
here for the identical reason: `clara.metric_cells`'s own RLS policy for `clara_fn_owner` is
`using(true)` — `0058.sql:329` — so an unscoped lookup inside a definer body would return
every firm's rows, exactly the `0083:102-108` class of bug both `sandbox-export-design.md`
and this doc's §2.2 already guard against). Absent, foreign, and cross-client all raise the
**same** token (`metric_cell_reference_unknown`, CLR11 family, §5) — no existence oracle,
matching the estate's posture everywhere else a foreign id is resolved (S20, B1.11's twin).
A resolved cell with `cell_status <> 'ok'` refuses too (`metric_cell_reference_not_ok`, CLR10
family) — **stage (b) refuses to build a formula on top of a value that is itself
undefined/absent/refused**, rather than propagating an ambiguous input silently.
Dimension is carried from the resolved `unit_key` through the existing `clara.metric_units`
lookup (`currency_power/days_power/count_power`, S31's `constant` branch does the identical
thing against `clara.metric_constants` — `0059.sql:34` — the `cell` branch mirrors it against
`clara.metric_units` directly since `metric_cells.unit_key` already names a registered unit).
Temporality: a cell is always `'flow'` for algebra purposes UNLESS the design later needs
point-in-time cell composition — out of this build's scope; a `cell` operand's `po` (period
offset) is `0` and its `lag` contribution is `0`, since a minted cell is not itself
period-relative the way a `measure` leaf is.

**Evaluation** — a NEW function, `clara._metric_eval_node_v2(p_firm uuid, p_client uuid,
p_snapshot uuid, p_context uuid, p_period uuid, n jsonb, p_allow_negative boolean,
p_average_key text, p_as_of date default null) returns clara.metric_value_v1`. Its `cell`
branch re-resolves the SAME `firm_id = p_firm and client_id = p_client` predicate
(independently of the validator — evaluation-time is the check that actually gates what gets
persisted; validation-time is fail-fast) and returns the cell's `exact_numerator`/
`exact_denominator` as the node's value, with `account_set_version_ids`/`constant_version_ids`/
`entry_ids`/`document_ids` threaded from the ORIGINAL cell's own `inputs` provenance where
present — so a `cell`-composed formula's own provenance chain remains walkable back through the
cell it cited, never truncated at the reference.

### 3.2 Evaluator versioning — the precise plan

**Why v1's functions cannot be edited in place — mechanically, not just by convention.**
`clara._validate_metric_node_v1` and `clara._metric_eval_node_v1` are registered members of the
`evaluator_versions` row `('evaluate_metric', 1)`, minted by the freeze DO block at
`0059.sql:246`: the row's `closure_sha256` is a hash-of-hashes over ten named member function
signatures, each with its own `body_sha256` in `evaluator_version_members`. `evaluate_metric`
v1 is `deployed:true` (S23's cross-checked roster read of `frozen-evaluators.json`). Once
deployed, `clara.verify_evaluator_freeze()` (`0059.sql:248`) — invoked between every migration
body and its commit by `scripts/migrate.mjs` (S22) — **re-derives `sha256(pg_get_functiondef(
member_signature))` LIVE from the catalog for every member and refuses on any mismatch**. This
is a mechanical block, not a style preference: a migration that edited `_validate_metric_node_v1`
or `_metric_eval_node_v1` in place would fail this exact check the moment it ran, independent of
whether `scripts/check-frozen-evaluators.mjs`'s repo-side, `evaluate_*`-name-pattern-only lint
(S23) happens to scope those two `_`-prefixed helpers or not. **The two enforcement layers
overlap only partially — the DB-side closure hash is the one that actually catches this,
because it hashes every registered member regardless of naming, while the repo-side lint's
exact-name-pattern scope is narrower.** This design relies on the DB-side layer and states so,
rather than relying on the narrower repo-side scope by omission.

**A second, independent reason `evaluate_metric_v1`'s pathway cannot simply be widened**, found
during this design's own read of `0060_wave_e_delta_metrics_security.sql:237-284`
(`clara._tf_metric_cell_integrity`, S17's trigger) rather than restated from the survey: the
`definition_version_id is null` branch of this trigger (the branch every preview-composed cell,
including every stage-(b) cell, takes) **hardcodes calls to `clara._metric_eval_node_v1` and
`clara.validate_metric_ast_v1` by name** (`0060.sql:257-258`), re-deriving the inserted row's
`resolved_inputs_sha256`/`cell_status`/`exact_numerator`/`exact_denominator`/`displayed_text`
and refusing (`CLR11`) on any disagreement. **A `cell`-referencing AST inserted through the v1
pathway would fail this trigger outright** — `_metric_eval_node_v1`'s own closed `elsif` chain
(S31, the eleven-primitive switch) has no `cell` case and raises `'metric primitive unknown'`
the moment it walks such a node. This is not a hypothetical: it means stage (b) needs the
trigger's re-derivation logic to be VERSION-AWARE, not merely a new evaluator + a new preview
wrapper. **This is the delicate part named in the brief, made concrete:**

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
   as `validate_metric_ast_v1` wraps `_validate_metric_node_v1` (`0059.sql:44`), same six-key
   top-level closure, same declared-vs-inferred unit/temporality match.
3. **`clara._metric_eval_node_v2(p_firm uuid, p_client uuid, p_snapshot uuid, p_context uuid,
   p_period uuid, n jsonb, p_allow_negative boolean, p_average_key text, p_as_of date default
   null) returns clara.metric_value_v1`** — v1's body plus the `cell` case (§3.1). Reuses the
   UNCHANGED v1 helper functions it needs verbatim (`_metric_selector_account_ids`,
   `_metric_context_sha256_v1`, `_metric_resolved_inputs_sha256_v1`, `_hash`) — these become
   members of BOTH the v1 and v2 evaluator closures simultaneously, which the freeze schema
   already supports (`evaluator_version_members`' PK is `(evaluator_version_id,
   member_signature)`, so one function signature can be a member of many evaluator versions).
4. **A new `evaluator_versions` row, `('evaluate_metric', 2, ...)`**, minted by this migration's
   OWN freeze DO block (reproducing `0059.sql:246`'s idiom, never editing it — migrations are
   immutable, `packages/db/README.md`): closure hash over
   `{_validate_metric_node_v2, validate_metric_ast_v2, _metric_eval_node_v2}` plus the reused
   v1 helpers named above. `deployed:false` at mint, flipped by `_tf_evaluator_deploy_once()`
   on the same undeployed→deployed transition trigger every other evaluator version already
   uses (`0060.sql:101`, S22) — no new deploy mechanism.
5. **`clara._eta_compose_metric_preview_core_v2`** and a sibling wake wrapper
   **`clara.wake_compose_metric_preview_v2`** — a NEW pair, never a rewrite of the v1 pair
   (constraint 9's spirit: a behavioural change ships as a new `_vN` export, the old one stays
   reachable and unmoved). The v2 core is `_eta_compose_metric_preview_core`'s body with three
   changes: it resolves `evaluator_versions` for `('evaluate_metric', 2, ...)` instead of
   version 1 (`0077.sql:160-161`'s exact query, version literal changed); it calls
   `clara.validate_metric_ast_v2(p_ast, p_firm, p_client)` instead of `validate_metric_ast_v1`;
   it calls `_metric_eval_node_v2(p_firm, p_client, ...)` instead of `_metric_eval_node_v1`. The
   receipt shape (`_reserve_op`/`_audit`/`_finish_op`), the cost ceilings, the policy-effectivity
   refusal-not-reselection discipline (`0077.sql:177-190`'s load-bearing comment) and the
   `metric_cells` insert shape (`definition_version_id=null`, the identical `na` provenance
   stamp `0077.sql:248-252`) are UNCHANGED — copied verbatim, not reinvented, because **D2's
   ruling keeps the S17 walls SHUT**: no new `model_proposal`/`human_approval` relation, no
   loosened CHECK, the preview path's existing "not_applicable" provenance stamp IS the (b)
   provenance, exactly as the brief specifies.
6. **`clara._tf_metric_cell_integrity` is `create or replace`d** (still not editing the
   0060.sql FILE — a new migration replaces the live function body; `packages/db/README.md`'s
   "applied files are immutable" governs the FILE, not the function it defines) to branch on
   the inserted cell's evaluator identity before choosing which pair of functions re-derives
   it: `select evaluator_name, version into ... from clara.evaluator_versions where id =
   new.evaluator_version_id`. When `('evaluate_metric', 1)`, the trigger's existing
   `definition_version_id is null` branch runs **completely unchanged** — a byte-for-byte
   regression-safety requirement, proven by a differential battery cell (Annex B) that replays
   a v1-composed cell through the widened trigger and asserts identical behaviour to the
   pre-widening trigger. When `('evaluate_metric', 2)`, the SAME re-derivation shape runs
   against `_validate_metric_node_v2`/`_metric_eval_node_v2` instead, threading `new.firm_id`/
   `new.client_id` (already columns on the row being checked) into the v2 calls. **This is
   judgement logic changing a security-critical wall — review law 1's floor applies in full,
   and it is the one piece of this design that most needs the independent pass before merge.**

**`clara.metric_primitives` widens 11→12, extend-only** — a new migration inserts
`('cell','{}')` (no structural integer fields, mirroring `measure`/`sum`/`divide`'s own empty
array, `0059.sql:17`) and reproduces `0059.sql:251`'s tail census with the count assertion
updated to `12` — **never editing `0059.sql`'s own `if n<>11` line**, which stays exactly as
printed forever (migration immutability). The new migration's own tail similarly reproduces (not
edits) the `primary_members`/`checker_members` closure-census shape at `0059.sql:251`, extended
to also assert the new `evaluate_metric` v2 row's member count.

### 3.3 Stage (b)'s refusal vocabulary

New tokens this stage introduces (full table with CLR codes in §5): `metric_cell_reference_
unknown` (CLR11 — absent, foreign, or cross-client, indistinguishable, the no-oracle rule) ·
`metric_cell_reference_not_ok` (CLR10 — the cited cell did not evaluate to `'ok'`) ·
`expression_forbidden_syntax` (CLR10 — reserved for the named extension point, §6; never
raised by this build, since no code path accepts anything but the closed AST). No new CLR
error CLASS is introduced — S37's own recommendation (CLR10 bad-request, CLR11
not-found-in-your-firm) is followed exactly, matching the vocabulary `_validate_metric_node_v1`
itself already uses for its eleven existing primitives.

---

*(Continued in `card1-substitution-seam-design-part2.md`: §4 walls unchanged, §5 the full
refusal-token table, §6 named extension points + non-goals, §7 the migration + runtime +
census move list. Section numbers continue.)*
