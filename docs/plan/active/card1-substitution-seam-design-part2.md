# Card 1 — the substitution seam: DESIGN (stages (a)+(b)), part 2

> **Part 2 of `card1-substitution-seam-design.md`** — one design in two files, split at the
> repo's 500-line convention (the `sandbox-export-design.md`/`-part2.md` shape). **Part 1
> carries §1-§3** (the honest B-mapping, stage (a)'s mechanism, stage (b)'s `cell` primitive and
> its evaluator-versioning plan); **this file carries §4-§7**. Section numbers continue. Read
> part 1 first; nothing here restates its premises.

---

## §4 · Walls that do not move

**S17's double wall stays exactly shut.** `metric_cells.model_proposal_id`,
`human_approval_id`, and `supersedes_cell_id` remain forced null by both the table-level CHECK
(`0058.sql:259-260`) and `clara._tf_metric_cell_integrity`'s own rejection of any non-null value
there (`0060.sql:246-249`) — **this design edits `_tf_metric_cell_integrity` (§3.2 item 6) ONLY
to add evaluator-version branching to its re-derivation logic; the provenance-column CHECK it
also enforces is untouched.** D2's ruling is explicit that the preview path's existing
`"not_applicable"` provenance stamp (`0077.sql:248-252`, unchanged and reused verbatim by
`_eta_compose_metric_preview_core_v2`) IS the stage-(b) provenance — no supersession lever, no
model-proposal/human-approval relation pair is minted. A future build that wants a genuine
maker-checker lane over composed cells is a **different, larger decision** than this one, and
this design does not open that door.

**`clara.metric_cells`'s `agent_catalog=false` posture stays exactly as `_delta_security_roster`
set it** (`0060.sql:25`) — no policy is added granting `clara_agent_ro` a raw SELECT on
`metric_cells`, in either stage. **`clara_runtime`'s no-table-grant posture on `metric_cells`
stays exactly as 0058-0061 left it** — the widened `sandbox_export_payload` (§2.4) is the ONLY
new door by which the render worker's role ever touches a cell's value, and it touches it
through a `security definer` function call, never a table grant. Both are unmoved; §7's
migration list adds no roster row that would suggest otherwise.

**`freeform_read_log`'s null-`firm_id` three-valued arm stays exactly as C-20 already handles
it.** Stage (a)/(b) touch `preview_cell`-kind basis elements only (§2.2 item 2 forbids a
`placeholder` from citing a `freeform_read`-kind element at all) — nothing here reopens the
`freeform_read` basis-kind's own null-firm handling, which remains `sandbox-export-design.md`
§3.2's to own.

**No governed table gains a manual RLS-census entry.** Every new object this design mints
(§7's list) is either an ungranted core (reached under `clara_fn_owner`, never itself a table)
or a function — no new TABLE is minted by stages (a)/(b). The RLS-forced-relation census
(`GOVERNED_TABLES`, `rig-meta.mjs:1074-1091`, S14's citation via the survey's item 14) is
therefore untouched by this design; only §7's grant-cohort census (item 13's manual roster)
needs a new entry, because that census IS manual by construction.

**`sandbox_views.authority = 'narrative'` and the frozen absence of a `definition_version_id`/
`cell_id` column on that table (design §3.7, gate B4.4) stay exactly as ruled.** A `placeholder`
block's `basis_ref` points into the view's OWN `basis` array (a `preview_cell` id), never into
a new authority-typed column on `sandbox_views` itself — the narrative-authority wall at the
export boundary (G-3, `sandbox-export-annexes.md` Annex H) is completely unaffected by this
seam, because nothing here gives `sandbox_views` a new FK any posting/reporting/knowledge
relation could point at. **No new item is owed to G-3's catalog census.**

---

## §5 · The full refusal-token vocabulary (stages a+b)

Every token below is typed, raised with `using errcode = 'CLR<nn>'`, `detail =
jsonb_build_object('reason', '<token>', ...)` — the estate's standing idiom (S37). CLR codes
follow `0002_foundation.sql:39-42`'s legend; new tokens use **CLR10** (bad-request, a
structural/semantic refusal) or **CLR11** (not-found-in-your-firm, the no-existence-oracle
refusal) exactly as S37 recommends — no new error class is minted.

| token | CLR | raised by | means |
|---|---|---|---|
| `sandbox_view_body_malformed` (`block_kind_unsupported`) | 10 | mint (widened `_sandbox_client_set`) | `v_kind` is neither `'text'` nor `'placeholder'` — unmoved from 0132, now two-armed |
| `sandbox_placeholder_basis_not_cell` | 10 | mint | a `placeholder` block's `basis_ref` resolves to a basis element whose `kind` is `'freeform_read'`, not `'preview_cell'` — §2.2 item 2 |
| `sandbox_placeholder_cell_not_ok` | 10 | mint | a `placeholder` block's cited `preview_cell` basis element resolves to a `metric_cells` row whose `cell_status <> 'ok'` — D3's mint-time door, §2.2 item 3 |
| `sandbox_cell_unresolved` | n/a (`RenderRefusal`) | **renderer** (`layoutSandbox`) | the widened `sandbox_export_payload`'s `cells` map does not resolve a `placeholder` block's `basis_ref` — D3's render-time mirror, §2.5. Defense-in-depth: a payload-builder bug, never a live-data race (cells are immutable) |
| `metric_cell_reference_unknown` | 11 | `_validate_metric_node_v2` / `_metric_eval_node_v2` | a `cell` node's `cell_id` does not resolve a `metric_cells` row under the exact `(firm_id, client_id)` predicate — absent, foreign, and cross-client answer IDENTICALLY, no oracle (§3.1, mirrors S20/C-20) |
| `metric_cell_reference_not_ok` | 10 | `_validate_metric_node_v2` / `_metric_eval_node_v2` | the resolved cell's `cell_status <> 'ok'` — stage (b) refuses to build on an undefined/absent/refused input rather than propagate it |
| `evaluator_undeployed` | 10 | `_eta_compose_metric_preview_core_v2` | `('evaluate_metric', 2, ...)` is not yet `deployed` — the same token `_eta_compose_metric_preview_core` v1 already raises (`0077.sql:163-164`), reused as-is |
| `expression_forbidden_syntax` | 10 | **reserved, never raised by this build** | the named extension point for a future arbitrary-expression-input capability, §6 — registered here so a future builder finds a name and a wall, not a silent gap |

**Unmoved, inherited exactly as 0132/0059/0060 already raise them**: `sandbox_view_basis_
absent`, `sandbox_view_basis_unknown`, `sandbox_view_block_basis_absent`, `sandbox_view_block_
basis_unknown`, `sandbox_view_client_set_empty` (S1's block-level walls, unaffected by the
`placeholder` addition beyond 2.2's two new checks) · `numeric_literal_forbidden`,
`cost_exceeded`, `metric primitive unknown` (renamed nowhere — the TWELFTH primitive is admitted,
the refusal for a THIRTEENTH-and-beyond unknown kind is the same message, same code, same
`_validate_metric_node_v2` `else` branch) · `sandbox_export_lease_not_held`,
`sandbox_export_already_completed` (§2.6's new claim verb reuses these unchanged).

---

## §6 · Named extension points and non-goals

**Named extension points — registered so a future build finds a wall and a name, not a
rediscovery:**

1. **Arbitrary-SQL (or any non-AST expression syntax) as formula input.** No path into this
   design; `expression_forbidden_syntax` (§5) is reserved for it. Per S38's headline finding,
   no precedent exists anywhere in the estate for a DEFINER body that parses or dynamically
   executes caller-supplied expression text — the closed-AST + pure-interpreter shape this
   design extends (§3) is, per the survey, the estate's own argument for what such a capability
   SHOULD look like if it is ever built, never a stopgap this design apologizes for.
2. **Numeric input from a `freeform_read`-kind basis element.** D4 (survey) asked whether a
   stage-(b) expression's inputs should be citable from a prior freeform read, not only from a
   `metric_cells` row. **This design answers D4: no — not in this session.**
   `_metric_eval_node_v2`'s `cell` primitive resolves `metric_cells` exclusively; a
   `freeform_read_log` row carries a query TEXT and no result rows at all (`0002.sql:308-315`),
   so there is no deterministic VALUE such a primitive could even read. Building this later
   means `freeform_read_log` itself would need to start persisting a result value under the
   same immutability discipline `metric_cells` already has — a materially larger, separate
   decision.
3. **Chart-value substitution.** D5 (survey): `chart.mjs` has exactly one production caller
   today (S11); this design's stage (a)/(b) placeholders are TEXT-BODY only (D5 in the brief).
   A `layoutSandbox` chart path — and the G-1 "two entrances" census it would finally make
   checkable rather than aspirational — is explicitly out of this build.
4. **Point-in-time composition of cells.** §3.1 fixes a `cell` operand's temporality to
   `'flow'` for algebra purposes. A future build wanting to `average()` a chain of
   `cell`-composed point-in-time values is not precluded by this design, but is not built by
   it either.

**Non-goals, restated so nothing is inferred:**

- **R-1 (screen/file divergence) is NOT closed by this build.** `sandbox-export-design.md`'s
  own §3.1 states the seam so the Wave-G on-screen half can close the divergence "for free"
  once it renders from `sandbox_views.body` — this build does not touch the on-screen half.
  Carried forward as a named risk (Annex E), not silently claimed closed. Nothing in stages
  (a)/(b) makes R-1 worse OR better than `sandbox-export-design.md` already left it.
- **Charts** — §6 item 3, restated: out of scope.
- **A maker-checker lane over composed cells** — §4, restated: S17's walls stay shut; this
  build does not mint the relation pair those FKs would need.
- **Any change to `render_jobs`, the seal chain, or `report_artifacts`** — untouched; §2.6's
  new claim/dispatch verbs are a sibling job family exactly as C-11 already rules for the
  sandbox lane generally.
- **Any widening of `evaluate_fs_pack_v1`/`_agent_v1`'s canonical, firm-approved-definition
  pathway.** Stage (b) extends the PREVIEW pathway only (`wake_compose_metric_preview_v2`
  alongside `evaluate_metric_v1`'s canonical pathway, untouched) — a `cell`-referencing formula
  can never become a `firm_approved`/`canonical` `metric_definition_versions` row through this
  design, because `_tf_metric_definition_lifecycle_v1` (S34) governs that lifecycle
  independently and this design does not touch it.

---

## §7 · Migration + runtime + census move list — the survey's closed-world list, made concrete

**Migrations (one or more new files on top of 0132 once it merges — the conductor's call on
exact sequencing/splitting):**

1. `create or replace function clara._sandbox_client_set` — §2.2's five changes (block-kind
   admission, `sandbox_placeholder_basis_not_cell`, `sandbox_placeholder_cell_not_ok`,
   `v_has_free_text` exemption, the malformed-reason re-cut).
2. `create or replace function clara.sandbox_export_payload` — §2.4's `cells` widening.
3. `create function clara.claim_sandbox_export`, `clara.sandbox_dispatch_begin`,
   `clara.sandbox_dispatch_record` — §2.6, mirroring `0081.sql:98-138,345-414`.
4. `insert into clara.metric_primitives values ('cell','{}')` + the reproduced (not edited)
   tail census asserting `count(*)=12` — §3.2's extend-only widening.
5. `create function clara._validate_metric_node_v2`, `clara.validate_metric_ast_v2`,
   `clara._metric_eval_node_v2` — §3.1/§3.2 items 1-3.
6. The freeze DO block minting `evaluator_versions('evaluate_metric', 2, ...)` +
   `evaluator_version_members` — §3.2 item 4, reproducing `0059.sql:246`'s idiom.
7. `create function clara._eta_compose_metric_preview_core_v2`,
   `clara.wake_compose_metric_preview_v2` — §3.2 item 5. The wake wrapper carries its own
   `assert_wake_allowed('interactive', 'wake_compose_metric_preview_v2')` allowlist row (and
   the `interactive_client` triple once F-A2's D34 limb merges, matching
   `sandbox-export-annexes.md` Annex A.2's own posture for this lane's verbs) — never a
   `'proactive'` row.
8. `create or replace function clara._tf_metric_cell_integrity` — §3.2 item 6, the
   evaluator-version-branching widening. **This is the one judgement-logic change in this
   migration set that most needs the independent review pass (review law 1) before merge.**

**Runtime (`packages/reporting-render`):**

9. `layoutSandbox()` export — §2.5, mirrors `assemble()`.
10. `shapeSandboxPayload()` — §2.5, mirrors `shapePayload()`.
11. `db.mjs`-equivalent sandbox worker wrappers — §2.6 item 3.
12. The leader/dispatch process gains a sibling entry for the `sandbox_exports` job family,
    wired to §2.6's new verbs.
13. Ceremony discipline (Annex I of `sandbox-export-annexes.md`) applies unchanged: a fresh,
    checksum-pinned image digest, run from merged `main`, sequenced after F-A5 PR-4 (C-16) so
    two renderer ceremonies do not contend. This build's renderer changes are additive to that
    same ceremony, not a second one.

**Tests/censuses** (survey items 13-20, made concrete):

14. `packages/db/tests/rig-meta.mjs`'s `*_FNS`/`ALLOWED` arrays gain a new stage-(a)/(b)-named
    cohort array (e.g. `CARD1_SEAM_COHORT`) covering every verb minted at items 3, 6-7 above —
    the survey's item 13 finding stands: omitting this cohort entry does not create a silent
    gap (the estate-wide `grantMatrixFailures()` backstop still flags an unaccounted grant),
    but the entry is required for the census to pass cleanly.
15. **No manual RLS-forced-relation entry is needed** (§4, survey item 14) — no new table is
    minted.
16. `scripts/check-frozen-evaluators.mjs` + `frozen-evaluators.json` gain a new entry for
    `evaluate_metric` version 2 (triggered because `_eta_compose_metric_preview_core_v2`'s
    migration mints a NEW `evaluator_versions` row — the lint's own rule 3, S23: "every
    migration NEW vs base that defines an `evaluate_*` function must mint its own
    `clara.evaluator_versions` row in the SAME file" — satisfied by item 6 living in the same
    migration as item 7's wrapper). **Note precisely**: `_validate_metric_node_v2`/
    `_metric_eval_node_v2` themselves stay OUT of the repo-side lint's scope exactly as their
    v1 counterparts do (S23) — it is the DB-side `verify_evaluator_freeze()` census, invoked
    automatically by `scripts/migrate.mjs` between every migration body and its commit, that
    is the actual mechanical gate on their bodies (§3.2's own point).
17. `packages/db/tests/epsilon-grants-phase.mjs`'s curated-table writer census — **not
    triggered**; no new curated (owner-signed, migration-seeded) reference table is minted (the
    `metric_primitives` row insert at item 4 is an ordinary DML insert into an existing table,
    not a new relation).
18. `packages/db/tests/f-a2-grants.test.mjs`'s D34 `interactive_client` census — item 7's new
    wrapper stays OFF that allowlist kind unless/until F-A2's own D34 limb explicitly adds it,
    matching 0132's own posture (`0132.sql:1203-1214`).
19. A NEW, migration-scoped both-direction census (following the per-wave pattern S19 names,
    e.g. `f-a5-reporting-agency-pr2-census.test.mjs:100-116`'s shape) for this migration's own
    allowlist rows — no single shared file exists to add rows to instead.
20. `apps/dashboard/app/shared/dbSeamCensus.bindings.ts` gains entries the first time the
    dashboard surface (out of THIS session's scope per the brief) reads any verb minted here —
    named so it is not silently forgotten when that later work begins.
21. **This design's own new battery** (Annex B) — the S46 pin-rule cell, the mixed-body
    widening cell, the non-`'ok'`-cell mint refusal (both doors, mint and render), the (b)
    dimensional-algebra cells, the two new-evaluator-version freeze cells (a v1-composed cell
    replays unchanged through the widened trigger; a v2-composed cell replays through the new
    branch), the payload pre-join cell, the renderer fail-closed cells — enumerated in full in
    `card1-substitution-seam-annexes.md` Annex B.

**Docs:**

22. `docs/plan/active/sandbox-export-design.md` §3.6b gains a forward pointer to this design
    once it lands (the ruling stays as recorded; this doc is the implementation the ruling
    named but did not build).
23. `PROGRESS.md` — lane status once stages (a)/(b) land (constraint 8/clock-out protocol).
24. `docs/references/codebase-memory-graph.md` re-index after the code lands (AGENTS.md
    clock-out step 5).

**Non-finding, stated so it is not silently assumed** (survey item 21, carried forward
unchanged): `packages/db/tests/x42-*.mjs` is unrelated to this seam and gains no entries from
this work.
