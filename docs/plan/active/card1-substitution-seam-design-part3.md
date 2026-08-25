# Card 1 — the substitution seam: DESIGN (stages (a)+(b)), part 3

> **Part 3 of `card1-substitution-seam-design.md`** — v3, the final design fold before build
> (2026-08-26). **Part 1 carries §1-§2**; **part 2 carries §3** (stage (b)); **this file
> carries §4-§7** — walls that do not move, the full refusal-token table, named extension
> points/non-goals (§6 item 5 gains N3's second-door finding), and the migration + runtime +
> census move list. Section
> numbers continue; read parts 1-2 first — nothing here restates their premises.

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
model-proposal/human-approval relation pair is minted.

**Corrected at the fold (BL-1, BL-6): this build is NOT DDL-free.** An earlier draft of this
section (and of Annex A.1) claimed no DDL beyond the three untouched relations named there —
**wrong on two counts, both struck**: `clara.metric_primitives.primitive_key`'s CHECK needs an
ALTER before `'cell'` can be inserted at all (§3.2's BL-1), and `clara.sandbox_exports` needs an
ALTER adding the dispatch/cap columns a lawful claim/dispatch pair requires (§2.6's BL-6). Both
ALTERs are stated explicitly here rather than left for §7 alone to carry, because "no DDL" was
asserted as a WALL-STABILITY claim in the original draft and that claim is corrected, not
merely supplemented.

**`clara.metric_cells`'s `agent_catalog=false` posture stays exactly as `_delta_security_roster`
set it** (`0060.sql:25`) — no policy is added granting `clara_agent_ro` a raw SELECT on
`metric_cells`, in either stage. **`clara_runtime`'s no-table-grant posture on `metric_cells`
stays exactly as 0058-0061 left it** — the widened `sandbox_export_payload` (§2.4) is the ONLY
new door by which the render worker's role ever touches a cell's value, and it touches it
through a `security definer` function call, never a table grant. Both are unmoved.

**`freeform_read_log`'s null-`firm_id` three-valued arm stays exactly as C-20 already handles
it.** Stage (a)/(b) touch `preview_cell`-kind basis elements only (§2.2 item 2 forbids a
`placeholder` from citing a `freeform_read`-kind element at all) — nothing here reopens the
`freeform_read` basis-kind's own null-firm handling, which remains `sandbox-export-design.md`
§3.2's to own.

**No governed table gains a manual RLS-census entry.** Every new object this design mints
(§7's list) is either an ungranted core (reached under `clara_fn_owner`, never itself a table)
or a function — the two ALTERs above widen EXISTING tables, they do not mint a new one. The
RLS-forced-relation census (`GOVERNED_TABLES`, `rig-meta.mjs:1074-1091`) is therefore untouched
by this design; only §7's grant-cohort census (item 13's manual roster) needs a new entry,
because that census IS manual by construction.

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
| `sandbox_view_body_malformed` (`placeholder_unknown_key`) | 10 | mint | a `placeholder` block carries a key outside `{kind, basis_ref}` (M4, `placeholder`-only) |
| `sandbox_placeholder_basis_not_cell` | 10 | mint | a `placeholder` block's `basis_ref` resolves to a basis element whose `kind` is `'freeform_read'`, not `'preview_cell'` — §2.2 item 2 |
| `sandbox_placeholder_cell_not_ok` | 10 | mint | a `placeholder` block's cited `preview_cell` basis element resolves to a `metric_cells` row whose `cell_status <> 'ok'` — D3's mint-time door, §2.2 item 3. **Cell_status only** — a placeholder's own citation is never checked for definition-backing (§1's asymmetry) |
| `sandbox_cell_unresolved` | n/a (`RenderRefusal`) | **renderer** (`layoutSandbox`) | the widened `sandbox_export_payload`'s `cells` map does not resolve a `placeholder` block's `basis_ref` at all — an ABSENT key. D3's render-time mirror, §2.5 |
| `sandbox_cell_malformed` | n/a (`RenderRefusal`) | **renderer** (`layoutSandbox`) | **BL-8** — the payload's resolved entry for a `placeholder` block's `basis_ref` IS present but `cell_status !== 'ok'` or `displayed_text` is not a string — raised BEFORE `typstString`, which would otherwise silently coerce a malformed value to `""` (`layout.mjs:73-79`'s fail-open shape) |
| `metric_cell_reference_unknown` | 11 | `_validate_metric_node_v2` / `_metric_eval_node_v2` | a `cell` node's `cell_id` does not resolve a `metric_cells` row under the exact `(firm_id, client_id)` predicate — absent, foreign, and cross-client answer IDENTICALLY, no oracle (§3.1, mirrors S20/C-20) |
| `metric_cell_reference_not_definition_backed` | 10 | `_validate_metric_node_v2` / `_metric_eval_node_v2` | **BL-5** — a `cell` node cited a cell whose `definition_version_id IS NULL` (a preview-composed cell) — a `cell` node may cite only a canonical, definition-backed cell, never another composition's output |
| `metric_cell_reference_not_ok` | 10 | `_validate_metric_node_v2` / `_metric_eval_node_v2` | the resolved (definition-backed) cell's `cell_status <> 'ok'` — stage (b) refuses to build on an undefined/absent/refused input rather than propagate it |
| `metric_cell_context_mismatch` | 10 | `_metric_eval_node_v2` | **M6** — the cited cell's `metric_cell_periods` set or `books_watermark` does not match the composing formula's own context |
| `evaluator_undeployed` | 10 | `_eta_compose_metric_preview_core_v2` | `('evaluate_metric', 2, ...)` is not yet `deployed` — **BL-3: this is the EXPECTED state until the manual deploy ceremony runs** (§7), not a defect. The same token `_eta_compose_metric_preview_core` v1 already raises (`0077.sql:163-164`), reused as-is |
| `expression_forbidden_syntax` | 10 | **reserved, never raised by this build** | the named extension point for a future arbitrary-expression-input capability, §6 — registered here so a future builder finds a name and a wall, not a silent gap |

**Unmoved, inherited exactly as 0132/0059/0060 already raise them**: `sandbox_view_basis_
absent`, `sandbox_view_basis_unknown`, `sandbox_view_block_basis_absent`, `sandbox_view_block_
basis_unknown`, `sandbox_view_client_set_empty` (S1's block-level walls, unaffected by the
`placeholder` addition beyond §2.2's checks) · `numeric_literal_forbidden`, `cost_exceeded`,
`metric primitive unknown` (renamed nowhere — the TWELFTH primitive is admitted, the refusal
for a THIRTEENTH-and-beyond unknown kind is the same message, same code, same
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
4. **Cross-period / cross-context `cell` composition (M6, new at the fold).** A `cell` node
   today refuses (`metric_cell_context_mismatch`) unless the cited cell's own periods and
   `books_watermark` exactly match the composing formula's context. A future primitive letting
   a formula deliberately compare facts across two DIFFERENT reporting moments or two different
   snapshot freshnesses — the accounting equivalent of "this quarter's composed ratio vs last
   quarter's" where BOTH sides are themselves `cell`-composed — is a materially different,
   larger capability than `lag`/`percent_change` already provide over RAW measures, and is not
   built here.
5. **A canonical, firm-approved, `cell`-referencing metric definition (BL-2's scope boundary
   — CD-14 APPROVED 2026-08-26).** `evaluate_metric_v2` is minted as a real, correctly-hashed
   entrypoint (§3.2 item 4), but `propose_metric_definition`/`approve_metric_definition` stay
   v1-scoped — no human can propose or approve a durable, canonical definition containing a
   `cell` node through this build. **This is enforced at TWO independent doors today (N3, §3.1),
   not merely by the human verbs staying unedited**: `_validate_metric_ast_shape_v1`, the
   proposal-time structural gate `_eta_save_metric_definition_draft_core` calls
   (`0077.sql:299-330`), is ALSO v1-only and closes on the same eleven primitives — a
   `cell`-containing AST is refused at DRAFT-SAVE time, before a canonical proposal could even
   exist. A future `propose_metric_definition_v2`/`approve_metric_definition_v2` pair, admitting
   the twelve-primitive grammar into the maker-checker lifecycle `_tf_metric_definition_
   lifecycle_v1` already governs, would need its OWN `_validate_metric_ast_shape_v2` twin as
   well — named here so a future builder does not stop at the human verbs and miss the
   draft-save door.
6. **Point-in-time composition of cells.** A future build wanting to `average()` a chain of
   `cell`-composed point-in-time values is not precluded by this design (M7's real-temporality
   fix makes a `point_in_time` cell operand dimensionally sound), but no such formula is built
   or tested by this session.

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
  design (§6 item 5), because `_tf_metric_definition_lifecycle_v1` (S34) governs that lifecycle
  independently and this design does not touch it.

---

## §7 · Migration + runtime + census move list — corrected in full at the fold

**M1 — the grounding rule, restated precisely.** Every citation below that names an object
F-A5b PR-1 itself mints, touches, or supersedes is read from *the f-a5b/pr-1 branch* at tip
`ee76f70`, never from `main` — `main` does not yet carry PR-1's own additions, and reading it
alone silently under-reports what already exists on the tip this design actually builds on top
of (this is the correction M1 forces on the survey's own S13, which was accurate for `main` and
is not accurate for the PR-1 branch).

**Migrations (one or more new files on top of 0132 once it merges — the conductor's call on
exact sequencing/splitting):**

1. `create or replace function clara._sandbox_client_set` — §2.2's changes (block-kind
   admission, `sandbox_placeholder_basis_not_cell`, `sandbox_placeholder_cell_not_ok`,
   `v_has_free_text` exemption, the closed-key check, the malformed-reason re-cut).
2. `create or replace function clara.sandbox_export_payload` — §2.4's `cells` widening,
   M11-corrected to placeholder-cited labels only.
3. **BL-1 — the `metric_primitives` CHECK ALTER** (name read from `pg_constraint` live, never
   guessed) + the extend-only `'cell'` insert (§3.2).
4. `create function clara._validate_metric_node_v2`, `clara.validate_metric_ast_v2`,
   `clara._metric_eval_node_v2` — §3.1/§3.2 items 1-3, M6/M7's corrected temporality and
   context-match logic.
5. **BL-2 — `create function clara.evaluate_metric_v2`** — the real, honest entrypoint (§3.2
   item 4), minted in the SAME migration as the `evaluator_versions` freeze DO block below
   (`check-frozen-evaluators.mjs`'s class-4 rule, S23, corrected reasoning below).
6. The freeze DO block minting `evaluator_versions('evaluate_metric', 2, ...)` +
   `evaluator_version_members` — §3.2 item 4, reproducing `0059.sql:246`'s idiom. **Born
   `deployed:false`** (BL-3) — this migration does NOT flip it.
7. `create function clara._eta_compose_metric_preview_core_v2`,
   `clara.wake_compose_metric_preview_v2` — §3.2 item 5. The wake wrapper carries its own
   `assert_wake_allowed('interactive', 'wake_compose_metric_preview_v2')` allowlist row —
   **`'interactive'` alone, permanently (M2)** — never `'interactive_client'`, never a
   `'proactive'` row.
8. `create or replace function clara._tf_metric_cell_integrity` — §3.2 item 6, the
   evaluator-version-branching widening (BL-4's four retargeted references, BL-5's
   definition-backed re-check, M6's context-match re-check). **This is the one judgement-logic
   change in this migration set that most needs the independent review pass (review law 1)
   before merge.**
9. **BL-6 — the `sandbox_exports` ALTER** (§2.6: `max_attempts`, `first_claimed_at`,
   `claim_delay_ms`, `dispatch_attempts`, `last_dispatch_at`, `last_dispatch_ok`,
   `last_dispatch_error`, the paired CHECK) + `create or replace function clara._tf_sandbox_
   export_lifecycle` (widening the EXISTING trigger's mutable array — `0132.sql:345-368`, not
   a new trigger).
10. `create function clara.claim_sandbox_export`, `clara.sandbox_dispatch_begin`,
    `clara.sandbox_dispatch_record`, `clara.reap_exhausted_sandbox_exports` (BL-6's reap twin)
    — §2.6, mirroring `0081_wave_e_zeta_render_jobs_part3.sql:98-138,302-334` and
    `0081_wave_e_zeta_render_verbs.sql:345-414` (S3).

**BL-2's own correction to the repo-side lint reasoning (item 16 below, restated here because
the pre-fold draft's reasoning was inverted).** The pre-fold draft argued
`check-frozen-evaluators.mjs`'s narrow, `evaluate_*`-exact-name-pattern scope meant this
design's new functions could stay OUTSIDE the lint's reach by never literally naming anything
`evaluate_*`. **That reasoning is now moot, deliberately** — item 5 above mints a real
`clara.evaluate_metric_v2`, so the lint's scope DOES apply directly to it (not merely
indirectly via the DB-side closure hash), and its class-4 rule ("every migration NEW vs base
that defines an `evaluate_*` function must mint its own `clara.evaluator_versions` row in the
SAME file", S23) is satisfied by construction: item 5 and item 6 above live in the same
migration file. `_validate_metric_node_v2`/`_metric_eval_node_v2` themselves still stay OUT of
the lint's narrower scope (their names carry no `evaluate_` stem, exactly as their v1
counterparts do) — but that is no longer this design's ONLY defense, since the real entrypoint
gives the lint a direct, honest target.

**BL-3 — the deploy ceremony, a new step, never bundled into the migrations above.**

11. **The manual deploy-ceremony flip** — run separately, later, by the migration-runner
    principal with no `SET ROLE` active (`current_user = session_user`, `0060.sql:98`'s own
    requirement): `UPDATE clara.evaluator_versions SET deployed = true WHERE evaluator_name =
    'evaluate_metric' AND version = 2`. **Stage (b) ships DARK — `evaluator_undeployed` refuses
    every `wake_compose_metric_preview_v2` call — until this ceremony runs**, matching
    `evaluate_fs_pack_agent_v1`'s own still-undeployed precedent (S23). A small wrapping script
    (`--lock-deployed`, new tooling this design names but does not find pre-existing anywhere
    in the repo) is the natural shape; a bare manual `UPDATE` under the correct principal is the
    fallback if no script is built. A D1-ish window, not a code change.

**Runtime (`packages/reporting-render`):**

12. `layoutSandbox()` export — §2.5, mirrors `assemble()`, BL-8's `sandbox_cell_malformed`
    guard included.
13. `shapeSandboxPayload()` — §2.5, mirrors `shapePayload()`
    (`packages/reporting-render/scripts/render-worker.mjs:67-112`, M10's corrected path).
14. `db.mjs`-equivalent sandbox worker wrappers in `packages/reporting-render/lib/db.mjs`
    (M10's corrected path — the exact file `db.mjs:57-90`'s render-lane wrappers already live
    in) — §2.6 item 4.
15. **M10/M12 — the leader/reconciler pair, named precisely.** `packages/runtime/lib/
    leader.mjs` (the single-leader loop) imports `reconcileRenderDispatch`/
    `reconcileRenderEnqueue` from `packages/runtime/lib/reconciler-render.mjs`
    (`leader.mjs:24-30`, read directly for this fold) and wires them on their own cadence,
    distinct from the general `runReconcilerSweep` phase (`leader.mjs:1-8`'s own header
    comment: *"the two render belts run on different cadences anyway (dispatch every fast
    cycle, enqueue daily)"*). This design needs a sibling `reconcileSandboxDispatch`/
    `reconcileSandboxEnqueue` pair inside `reconciler-render.mjs` (or a new sibling module, the
    same file-size-budget pressure that already split `reconciler-sst.mjs`/`-lint.mjs`/`-fa.mjs`/
    `-adjustments.mjs` out of the general `reconciler.mjs` applies here too), wired into
    `leader.mjs` on the same "dispatch every fast cycle" cadence, calling item 10's new
    `sandbox_dispatch_begin`/`_record` verbs.
16. Ceremony discipline (Annex I of `sandbox-export-annexes.md`) applies unchanged: a fresh,
    checksum-pinned image digest, run from merged `main`, sequenced after F-A5 PR-4 (C-16) so
    two renderer ceremonies do not contend. This build's renderer changes are additive to that
    same ceremony, not a second one.

**Tests/censuses** (survey items 13-20, corrected):

17. **M1/M9 — `packages/db/tests/rig-meta.mjs`'s cohort pattern, corrected.** The pre-fold
    draft's claim that the estate "carries ZERO entries for F-A5b/sandbox" was read from
    `main` only; the f-a5b/pr-1 branch's own `rig-meta.mjs` already exports `F_A5B_PR1_WAKE_FNS`
    (`["wake_mint_sandbox_view", "wake_request_sandbox_export", "wake_sandbox_export_state"]`),
    `F_A5B_PR1_RUNTIME_FNS` (the three worker verbs), `F_A5B_PR1_HUMAN_FNS` (the three human
    doors), and `F_A5B_PR1_COHORT = [...WAKE_FNS, ...RUNTIME_FNS, ...HUMAN_FNS]`
    (`rig-meta.mjs:395-398`, read directly on the PR-1 tip for this fold), asserted by
    `cohortFailures("wave F F-A5b PR-1 sandbox export lane", F_A5B_PR1_COHORT, liveNames)`
    (`:1231`) and spliced into the `ROLES` grant sets (`:1014,1026,1077`). **Card 1's own new
    verbs JOIN this SAME established tier pattern** — a new `CARD1_SEAM_WAKE_FNS =
    ["wake_compose_metric_preview_v2"]`, `CARD1_SEAM_RUNTIME_FNS = ["claim_sandbox_export",
    "sandbox_dispatch_begin", "sandbox_dispatch_record", "reap_exhausted_sandbox_exports"]`,
    `CARD1_SEAM_COHORT = [...WAKE_FNS, ...RUNTIME_FNS]` (no `HUMAN_FNS` — card 1 mints no new
    human door), asserted by its own `cohortFailures(...)` call and spliced into the same
    `ROLES` sets, following the identical shape rather than inventing a new one.
18. **No manual RLS-forced-relation entry is needed** (§4) — no new table is minted; both ALTERs
    (BL-1, BL-6) widen existing forced-RLS tables, which stay covered by their existing rows.
19. `scripts/check-frozen-evaluators.mjs` + `frozen-evaluators.json` gain a new entry for
    `evaluate_metric` version 2, triggered directly by item 5's real `evaluate_metric_v2`
    definition (BL-2's corrected reasoning, above) — the lint's class-3 rule is satisfied by
    item 5+6 sharing one migration file.
20. `packages/db/tests/epsilon-grants-phase.mjs`'s curated-table writer census — **not
    triggered**; no new curated (owner-signed, migration-seeded) reference table is minted (the
    `metric_primitives` row insert, BL-1's ALTER notwithstanding, is still a widening of an
    EXISTING table, not a new relation).
21. `packages/db/tests/f-a2-grants.test.mjs`'s D34 `interactive_client` census — item 7's new
    wrapper stays OFF that allowlist kind, **permanently** (M2) — 0132 itself already respects
    this wall (`0132.sql:1203-1214`) and this design's own verb must too, without exception.
22. A NEW, migration-scoped both-direction census (following the per-wave pattern S19 names,
    e.g. `f-a5-reporting-agency-pr2-census.test.mjs:100-116`'s shape) for this migration's own
    allowlist rows — no single shared file exists to add rows to instead.
23. **BL-7 — the x42 "non-finding" is DELETED, and replaced with its own actual finding.**
    `packages/db/tests/x42-s5-helpers.mjs` (read on *the f-a5b/pr-1 branch's* tip for this fold,
    diffed against `main`'s own copy) already carries `SANDBOX_EXPORT_F_A5B_PR1_CLOCK_NAMES =
    ["_recipient_covers", "sandbox_export_payload", "complete_sandbox_export",
    "fail_sandbox_export", "supersede_export_recipient"]`, gated `appliedStem(
    "f_a5b_pr1_sandbox_export$")` — the roster of PR-1's own functions whose body derives a
    business-relevant timestamp from the session clock (`now()`), not from a caller-supplied
    date, following the exact same idiom every other group in that file already uses (e.g.
    `RENDER_0081_CLOCK_NAMES = ["claim_render_job", "fail_render_job", "render_dispatch_begin",
    ...]`). **Card 1 adds its own `CARD1_SEAM_CLOCK_NAMES` roster**, gated on card 1's own
    migration stem, containing `claim_sandbox_export`, `sandbox_dispatch_begin`,
    `sandbox_dispatch_record`, `reap_exhausted_sandbox_exports` — the four new functions that
    stamp `claimed_at`/`lease_expires_at`/`last_dispatch_at`/`finished_at` from `now()` inside
    their own body (mirroring `RENDER_0081_CLOCK_NAMES`'s exact membership rationale, since
    these are the same shape of verb on the sandbox lane's own job family).
24. 0132's OWN SECTION 9/10 tail census pattern must be REPRODUCED, not edited, inside the new
    migration(s) — **M9, restored** (dropped from the pre-fold draft's own §7 list): this
    includes the bidirectional `aclexplode` EXECUTE-grant check 0132's own tail already runs
    (`0132.sql:1404-1447`, cited at S40), reproduced against the new verbs' grants in both
    directions, and the wake-kind-ambiguity guards (0132's own tail refuses if any new wake
    verb lands on an unexpected allowlist kind, `0132.sql:1203-1214`'s shape) — reproduced
    against `wake_compose_metric_preview_v2`.
25. **This design's own new battery** (Annex B) — the S46 pin-rule cell, the mixed-body
    widening cell, the non-`'ok'`-cell mint refusal (both doors, mint and render), the (b)
    dimensional-algebra cells, the definition-backed-refusal cells (BL-5), the context-match
    cells (M6), the two new-evaluator-version freeze cells (v1 replay unchanged / v2 replay via
    the new branch), the both-polarity deploy-ceremony cells (BL-3), the payload pre-join cell
    (M11-corrected), the renderer fail-closed cells (BL-8) — enumerated in full in
    `card1-substitution-seam-annexes.md` Annex B.

**Docs:**

26. `docs/plan/active/sandbox-export-design.md` §3.6b gains a forward pointer to this design
    once it lands (the ruling stays as recorded; this doc is the implementation the ruling
    named but did not build).
27. **M9, restored** (dropped from the pre-fold draft) — `docs/plan/active/sandbox-export-
    annexes.md` gains rows in **Annex A** (the verb enumeration widens by card 1's new verbs),
    **Annex B** (the parent lane's own battery gains a cross-reference to card 1's new cells,
    where the parent lane's own censuses — e.g. the wake grant roster, G-3 — are what actually
    re-run against the widened surface), **Annex C** (a decision cross-reference to CD-1..CD-9/
    BL-1..BL-8/M1..M12, since the parent design's own §3.6b ruling is what this whole build
    implements), and **Annex H** (the censuses-that-move list gains card 1's ALTERs and new
    functions to its counts).
28. `PROGRESS.md` — lane status once card 1 stages (a)/(b) land (constraint 8/clock-out
    protocol).
29. `docs/references/codebase-memory-graph.md` re-index after the code lands (AGENTS.md
    clock-out step 5).

**Non-finding, stated so it is not silently re-assumed** (survey item 21, narrowed by BL-7).
**Correction on re-verify: this design's own earlier draft cited a file, `x42-blind-
contract.test.mjs`, that does not exist** — `packages/db/tests/x42-r7-fa-stamp.test.mjs` is
real and representative of the family meant; the rest of the x42-prefixed advances/
adjustments/period-close residuals test SUITE (`packages/db/tests/x42-*.test.mjs`, dozens of
files, none named `x42-blind-contract`) remains unrelated to this seam and gains no entries
from this work — **but `x42-s5-helpers.mjs`
specifically, a shared HELPER file the x42 test files import, is not "unrelated"**: it already
carries F-A5b PR-1's own clock-names roster and now gains card 1's, per item 23 above. The
distinction is between the x42 TEST SUITE (still unrelated) and the x42-prefixed HELPER FILE
(shared infrastructure this and every clock-sensitive lane's tests use) — conflating the two
was the pre-fold draft's own error, corrected here.
