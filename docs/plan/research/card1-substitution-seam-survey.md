# Card 1 substitution seam — estate survey (stages (a)+(b))

> **ESTATE SURVEY, read-only.** Ground for F-A5b card 1 (the substitution seam ruled at the
> 2026-08-23 owner sitting, `sandbox-export-design.md` §3.6b + `-part2.md` §7 item 1). Every
> claim below carries a file:line the instrument printed; nothing here is asserted from prose.
> **Split at the repo's own 500-line-per-file convention** (the `sandbox-export-design.md` /
> `-part2.md` shape) — **this file carries the render entrance and `metric_cells`/evaluator
> findings (S1-S23); `card1-substitution-seam-survey-part2.md` carries the block/basis
> machinery, the expression-engine precedents, the renderer runtime, the freshness wall, the
> closed-world move list and the open design questions (S24-S48 + move list + questions).**
> Finding numbers are continuous across both files; read part 1 first.
>
> **Method note:** F-A5b PR-1 (branch `f-a5b/pr-1`, PR #345, tip `ee76f70`, migration
> `0132_f_a5b_pr1_sandbox_export.sql`) is **NOT on `main`** as of this survey — confirmed
> independently (this worktree's `main` checkout carries migrations only through `0128`; a repo
> grep for `0132`/`sandbox_views`/`sandbox_exports` outside the fetched branch ref finds
> nothing). Every `0132.sql:` citation below is read from `origin/f-a5b/pr-1` at that tip, not
> from a merged file. Everything else cited is read from `main` at the worktree's checkout.
> Four parallel research lanes (metric_cells/evaluator, render chain, expression-engine
> precedents, censuses) independently re-derived and cross-checked large parts of this survey;
> their findings are folded in below, credited where a claim is theirs rather than this lane's
> own direct read.

Stage (a) = placeholder blocks referencing PRE-COMPUTED deterministic values (`metric_cells`
rows, canonical or agent-composed preview). Stage (b) = model-PROPOSED deterministic
expressions over such values, validated + executed by a DEFINER engine, receipted, then
substituted like (a). **0132 builds neither** — its own header says so at `0132:43-53`: PR-1
is "the PROVENANCE HALF," never "a numeral-substitution engine," and every block kind it admits
is free text (`kind='text'`), so the fail-safe interim (widen to `firm_closure` whenever free
text is present) is what ships instead.

---

## S1-S13 · The render entrance — how a sandbox export becomes a PDF today (and doesn't, yet)

**S1.** `clara.sandbox_exports` is the lifecycle row 0132 mints (SECTION 3): REQUEST half frozen
(`firm_id, sandbox_view_id, recipient_id, coverage_proof, watermark_policy_version_id, locale,
requested_by, on_behalf_of, op_key`), MOVING half (`state, attempts, claimed_by, claimed_at,
lease_expires_at, last_error`), SET-ONCE-at-completion (`artifact_sha256, byte_size,
storage_key`) — `0132.sql:288-330`. This is the `render_jobs` idiom transplanted (design C-1);
it is a **sibling** relation, never a widened `render_jobs` row (`render_jobs.kind` stays closed
to `('draft_watermarked','pre_sign')`, `0079_wave_e_zeta_render_jobs.sql:105`, unmoved by 0132).

**S2.** `clara.render_jobs`'s lifecycle wall is an explicit `mutable` column array diffed out of
`to_jsonb(new)` vs `to_jsonb(old)` in trigger `clara._tf_render_job_lifecycle()`
(`0079.sql:183-214`; `state, attempts, claimed_by, claimed_at, lease_expires_at,
first_claimed_at, claim_delay_ms, dispatch_attempts, last_dispatch_at, last_dispatch_ok,
last_dispatch_error, artifact_id, last_error, finished_at`) — everything else (`firm_id,
client_id, report_run_id, kind, request_manifest, manifest_sha256, requested_by`, the succession
link) is frozen at insert; once `state in ('done','failed')` the WHOLE row freezes
(`0079.sql:205-212`). State machine `claimable → running → done|failed`
(`0079.sql:113-114`), with at-least-once reclaim on an expired lease.

**S3.** The worker/leader verb split (render-chain lane, cross-checked against the migration
text directly): `clara.claim_render_job(p_worker text, p_lease interval default '20
minutes')` (`0081.sql:98-138`, `FOR UPDATE SKIP LOCKED`, oldest-first, refuses jobs at
`attempts >= max_attempts`) · `clara.render_job_payload(p_job uuid, p_worker text)`
(`0081.sql:153-240`, lease-checked) · `clara.fail_render_job(p_job uuid, p_worker text, p_reason
jsonb)` (`0081.sql:248-284`) · **`clara.render_dispatch_begin(p_cooldown interval, p_max int)` /
`clara.render_dispatch_record(p_job_ids uuid[], p_ok boolean, p_detail jsonb)`** —
`0081.sql:345-414` — **the LEADER's own due-read + outcome-receipt verbs, distinct from the
worker's five**, which is the concrete mechanism S41/S2 (part 2) inferred must exist ·
`clara.reap_exhausted_render_jobs()` (`0081.sql:302-334`) · `clara.complete_render_job(p_job
uuid, p_worker text, p_sha256 text, p_byte_size bigint, p_manifest jsonb)` (`0082.sql:155-262`,
granted to `clara_runtime` alone at `0082.sql:266`). All SECURITY DEFINER,
`search_path=clara,pg_temp`; `clara_runtime` holds **no table privilege at all** on
`clara.render_jobs` — reachable only through these verbs.

**S4.** `clara._seal_report_artifact_core(p_firm uuid, p_actor uuid, p_report_run_id uuid,
p_kind text, p_key_extension text, p_sha256 text, p_byte_size bigint, p_manifest jsonb,
p_prior_artifact_id uuid, p_op_key text)` — `0071_wave_e_epsilon_reporting_security_seal_
artifacts.sql:121-124`. **The PDF-bytes hash comes IN as an argument** (`p_sha256`); the DB
never computes it. **Refinement (render-chain lane):** the DB *does* compute a DIFFERENT hash —
`render_manifest_sha256`, the hash of the manifest JSON itself (not the PDF bytes) — inside
`complete_render_job` via `clara._hash(v_base)` (`0082.sql:211-216`), explicitly so the seal
does not depend on a cross-language reproduction of Postgres's own jsonb text form
(`canonical-json.mjs:20-25`'s own stated reason). **So: PDF-bytes hash is worker-computed and
handed in; manifest hash is DB-computed. Both are real, and they hash different things.** 0132's
`complete_sandbox_export(p_export, p_worker, p_sha256, p_byte_size, p_storage_key)` —
`0132.sql:973-975` — repeats only the PDF-bytes-hash-IN half; the sandbox lane's `body_sha256`
(pinned at mint, `0132.sql:245,759`) plays the manifest-hash role already, computed by the DB
directly from the frozen `body` — no worker round-trip needed for that half.

**S5.** The render worker (`render-worker.mjs`) computes the PDF hash itself, after Typst
produces bytes: `renderPdf(...)` (`:164-168`) → `const sha256 = bytesSha256(bytes);` (`:171`) →
`completeJob(client, { jobId, workerId, sha256, byteSize: bytes.length, manifest })`
(`:215-217`) → `select clara.complete_render_job($1,$2,$3,$4::bigint,$5::jsonb)`
(`db.mjs:80-84`). `bytesSha256` = `createHash("sha256").update(buf).digest("hex")`
(`canonical-json.mjs:109-111`).

**S6.** The worker's DB session: `SET ROLE clara_runtime` after connecting (`db.mjs:43`), one
short-lived `pg.Client` per job, **no pool**, `DATABASE_URL` from `process.env` only, never
argv, never logged (`db.mjs:16-45`). `claimJob`/`jobPayload`/`leaseAlive`/`completeJob`/
`failJob` each wrap exactly one `clara.*` verb call (`db.mjs:57-90`).

**S7.** `assemble({ layoutAst, payload, decision, style, fonts })` — `layout.mjs:95-175` — is
called (`render-worker.mjs:130-136`) **before** `renderPdf` (S5), which is **before** the hash
(S5). **This is where a substitution hook structurally belongs**: any value resolution inside
`assemble()` (or a sandbox sibling of it) is automatically baked into the bytes the worker later
hashes — the artifact_sha256-of-substituted-bytes requirement (task point 1) falls out of the
existing call order for free; no new invariant is needed.

**S8.** `layout.mjs` already has a closed node-kind switch a placeholder seam would extend.
`case "placeholder"` (`:209,240-244`) resolves `need(placeholders, content.key,
"protected_placeholder")` from a map built off `p.protected_placeholders` (request-manifest
values, `render-worker.mjs:100-110`) — **not** cell values. `case "metric_ref"`
(`:249-271`) is the ACTUAL numeral path today: resolves `need(metrics, content.definition_key,
"metric")` from `metricsByKey` (built off `p.dataset_points`, `render-worker.mjs:67-83`), and
prints `m.displayed_text` verbatim, refusing on a decimal-place disagreement rather than
re-rounding (`:263-269`, the E-R8-floor-1 guard). Confirmed end-to-end by the render-chain lane
(S4 of its own report): the DB column feeding this is `report_dataset_points.value_text` →
`render_job_payload` emits `'displayed_text', p.value_text` (`0081.sql:178,198`) → `shapePayload`
copies it straight through (`render-worker.mjs:72`) → `typstString(m.displayed_text)`
(`layout.mjs:270`) — never reformatted at any hop. **A sandbox `metric_ref`-shaped resolution
keyed by a body block's `basis_ref` label is the natural mirror of this existing mechanism.**

**S9.** `need(map, key, kind)` (`layout.mjs:81-88`) is the fail-closed accessor every DB-sourced
string in this file goes through: absent or not-own-property throws `RenderRefusal
("${kind}_unresolved")`. C-23 (`sandbox-export-annexes.md:195`) already names this exact idiom
for the render-time watermark guard.

**S10.** The watermark burn: `layout.mjs:136` — `background: rotate(-30deg, text(60pt,
fill: rgb("#00000014"), ${typstString(watermarkText(decision))}))`, gated on
`decision.watermark`. `watermarkText(d)`/`uncertifiedText()` are local closures returning one of
three English literals (`:178-185`) — the SEALED lane's own strings; **no sandbox-side burn
exists anywhere in this package today** (a repo-wide grep for `sandbox` under
`packages/reporting-render` returns zero hits, confirmed independently by the render-chain
lane). Matches 0132's own scope statement: "the byte-burn... is F-A5b's OWN PR-3... out of
scope here" — `0132.sql:38-41`.

**S11.** `chart.mjs` exports `AXIS_POLICIES, readSeries, axisBounds, sameSourceTable,
assertChartTableParity, readThresholds, thresholdGeometry, barGeometry`
(`chart.mjs:21-239`). **Correction from the render-chain lane, load-bearing for point 6/7:**
a repo-wide grep for `chart.mjs`/its import path finds only **one** production caller —
`layout.mjs:25-28`'s import, used inside `renderChart()` (`layout.mjs:310-378`) — plus a prose
comment and a test file. **"One geometry library, two entrances" is NOT yet a checkable fact: no
second production entrance exists in code today.** The design's own G-1 census
(`sandbox-export-annexes.md:399-403`, "every `chart.mjs` export reachable from both entrances or
neither") has nothing on the "second entrance" side to check against until `layoutSandbox` (or
equivalent) is actually built — it is a forward commitment the design states, not yet a
mechanically provable invariant.

**S12.** The Typst engine is a **static binary**, spawned via `execFile` — never a shell string,
never WASM, network disabled (`engine.mjs:3,26,31,37,42`). Render-chain lane's closer read:
`typst compile --font-path <dir> --ignore-system-fonts src out` (`engine.mjs:68-74`), the binary
itself pinned by version AND sha256 in the Dockerfile (`PINNED_TYPST_VERSION=0.12.0`,
`PINNED_TYPST_SHA256=605130a7...`, checksum-verified at image build).

**S13.** 0132's own worker verbs (SECTION 7, `0132.sql:938-1028`) mirror the sealed lane's shape:
`sandbox_export_payload(p_export uuid, p_worker text)` (`stable`, lease-checked identically to
`render_job_payload`) returns `jsonb_build_object('sandbox_export_id', e.id, 'firm_id',
e.firm_id, 'sandbox_view_id', e.sandbox_view_id, 'body', v.body, 'body_sha256', v.body_sha256,
'locale', e.locale, 'watermark_policy_version_id', e.watermark_policy_version_id, 'watermark',
v_watermark)` — `0132.sql:946-964`. **This payload carries the raw `body` and the watermark and
NOTHING ELSE — no resolved cell values.** `complete_sandbox_export`/`fail_sandbox_export` mirror
`complete_render_job`/`fail_render_job` (hash IN, lease-checked, set-once). **No CLAIM verb
ships in 0132** — a registered, named gap for the sandbox family (`0132.sql:928-936`); a
sandbox-side `render_dispatch_begin`/`render_dispatch_record` analogue (S3) is equally absent.
Confirmed zero occurrences of `sandbox` anywhere under `packages/reporting-render` (S10,
cross-checked by both this lane and the render-chain lane independently).

---

## S14-S23 · `metric_cells` + evaluator outputs

**S14.** `clara.metric_cells` DDL — `0058_wave_e_delta_metrics.sql:239-264`:
```
id uuid pk, firm_id uuid not null, client_id uuid not null, run_id uuid not null,
evaluation_context_id uuid not null, definition_version_id uuid references metric_definition_versions(id),
formula_sha256 bytea(32), resolved_inputs_sha256 bytea(32), evaluator_version_id uuid not null
  references evaluator_versions(id), books_watermark text, cell_status text check in
  ('ok','undefined','absent','refused'), na_reason_version_id uuid, exact_numerator numeric,
  exact_denominator numeric, unit_key text not null, displayed_scale smallint, displayed_text text,
  inputs jsonb not null, model_proposal_id uuid, model_proposal_provenance jsonb not null default
  '{"kind":"not_applicable",...}', human_approval_id uuid, human_approval_provenance jsonb not null
  default '{"kind":"not_applicable",...}', supersedes_cell_id uuid references metric_cells(id),
  created_at timestamptz,
  unique(id,firm_id,client_id), unique(client_id,run_id,definition_version_id)
```
**A cell is addressed uniquely and immutably by its `id` (uuid)**, scoped by `(firm_id,
client_id)` via composite unique key; `(client_id,run_id,definition_version_id)` is the "one
cell per run per definition" uniqueness the reuse logic (S16) relies on. Child provenance tables
(`metric_cell_periods/snapshots/account_sets/constants/entries/documents/presentation_maps/
assessments`, `0058.sql:265-301`) all FK to `metric_cells(id,firm_id,client_id)`.

**S15.** `metric_cells` is under the generic append-only + no-truncate wall, confirmed two ways.
This lane: it is listed in `_delta_security_roster` (`0060_wave_e_delta_metrics_security.sql:
5-30`, row `('metric_cells',false)` at `:25`) and the census loop attaches/measures
`_tf_append_only()`/`_tf_no_truncate()` for every roster row not individually excepted
(`:47-60,420-432`); the only per-table exceptions in this family are `metric_definition_versions`
and `evaluator_versions`, each given a narrower LIFECYCLE trigger instead — `metric_cells` is
NOT among them. **The metric_cells lane's own report independently confirms and sharpens this:**
0060's security-tail census asserts exactly `v_append=35` of 38 tables retain the generic
append-only trigger (35 = 38 minus the three tables with bespoke lifecycle triggers —
`metric_definition_versions`, `account_set_versions`, `evaluator_versions`), and `metric_cells`
is counted among the 35. **No UPDATE or DELETE on `clara.metric_cells` succeeds, for any role,
ever** — the trigger fires unconditionally before update/delete.

**S16.** Cell REUSE, not recomputation, confirmed at two independent write sites. This lane
already had `0111_f_a5_reporting_agency_pr1.sql:1372-1390` (pass 2 of
`evaluate_fs_pack_agent_v1`: an existing `(firm_id,client_id,run_id,definition_version_id)` row
is read and returned `'reused':true`, never recomputed; a DIFFERENT `evaluator_version_id` on an
existing row refuses `evaluator_version_ambiguous` rather than overwrite,
`0111.sql:1381-1385`). **The metric_cells lane's own grep independently confirms this is one of
only 2-3 total INSERT call sites for this table in the whole migration history, and finds ZERO
UPDATE call sites anywhere**: `0077_wave_e_eta_wake_wrappers.sql:256` (the composition/preview
path, `definition_version_id` null) and `0111.sql:1430-1448` (the pack-evaluation writer) are
the only writers. **A cell for a given (client, run, definition) triple is written exactly
once, full stop — there is no code path in this estate that overwrites one.**

**S17.** `supersedes_cell_id uuid references clara.metric_cells(id)` (S14) exists in the schema
but is **doubly walled shut today**, not merely CHECK-closed. This lane found the table-level
CHECK (`0058.sql:259-260`: `model_proposal_id is null and ... provenance @>
'{"kind":"not_applicable",...}'`, and the `human_approval_id` twin). **The metric_cells lane's
own report adds a second, independent wall this lane had not read**: `clara._tf_metric_cell_
integrity` (`0060_wave_e_delta_metrics_security.sql:246-249`) is a TRIGGER, fired on every
insert/update, that ALSO rejects (CLR11) any row where `new.supersedes_cell_id is not null`, or
`model_proposal_id`/`human_approval_id` is not null, or the provenance JSON isn't the exact
"not_applicable" literal. **So today, no cell can ever point to a superseded cell or carry a
model-proposal/human-approval identity — the schema has the columns, but BOTH a table CHECK and
a BEFORE trigger currently force them to stay empty.** This sharpens S18/D2 below: loosening
this pathway for stage (b) means editing a CHECK **and** a trigger body, not just a CHECK.

**S18.** Combining S15-S17: **a metric_cells row, once inserted, is permanently immutable, and
supersession/model-proposal/human-approval are schema-reserved but currently disabled
features.** This directly answers "what pins a cell's value at view-mint time": a cell's own row
can never change (S15), and even the schema's own designed supersession lever is presently
inert (S17) — so today there is no mechanism by which an already-minted view's substitution
could silently change; the only way a NEW value for "the same metric" appears is a brand-new
`metric_cells.id` (from a new `definition_version_id` and/or a new `run_id`), which a
placeholder pinned to the OLD `id` would simply never see.

**S19.** The ad-hoc-computed-value precedent already exists and is agent-reachable:
`clara.wake_compose_metric_preview(p_client uuid, p_ast jsonb, p_period_ids uuid[], p_snapshot_id
uuid, p_op_key text)` — `0078_wave_e_eta_wake_wrappers_part2.sql:96-107` — delegates to
`clara._eta_compose_metric_preview_core` — `0077_wave_e_eta_wake_wrappers.sql:128-292`. The
core: validates the caller-supplied AST via `clara.validate_metric_ast_v1(p_ast)` (`:159`,
S31-S32 in part 2), resolves the deployed `evaluate_metric` evaluator (`:160-165`), evaluates
via `clara._metric_eval_node_v1` (`:226`, S33), and **inserts a `metric_cells` row with
`definition_version_id = null`** (`:256-259`) with `human_approval_provenance` stamped
`{"reason":"no_numeric_approval"}` (`:251`). This IS the "ad-hoc computed value" precedent: a
caller proposes a closed-grammar expression, a DEFINER core validates + evaluates it
deterministically, and the result is receipted (`_reserve_op`/`_audit`/`_finish_op`,
`:211-214,285-290`) and persisted as an ordinary, immutable, non-canonical `metric_cells` row —
subject to every wall in S14-S18 exactly like a canonical cell.

**S20.** 0132's own `_sandbox_client_set`'s `preview_cell` basis kind resolves **any**
`metric_cells` row by `id` + `firm_id`, with no filter on `cell_status`, `definition_version_id`
(null or not), or evaluator: `if not exists(select 1 from clara.metric_cells where id =
v_label_id::uuid and firm_id = p_firm) then raise ... sandbox_view_basis_unknown` —
`0132.sql:599-603`; the exact-derivation join reads `client_id` the same unfiltered way —
`0132.sql:667-672`. **A `wake_compose_metric_preview`-minted preview cell (S19) is therefore
ALREADY a valid `preview_cell` basis element for a sandbox view today** — the plumbing that
would let stage (a)'s placeholder reference a pre-computed value exists on both ends (mint the
cell via S19, cite it via S20) except for the block-kind admission itself (S24-S30, part 2).

**S21.** `clara.evaluator_versions` — `0058.sql:213-218`: `id, firm_id, evaluator_name, version
int check(>0), entrypoint_signature text, closure_sha256 bytea(32), migration_version text,
deployed boolean default false`, unique on `(firm_id, evaluator_name, version)` (nulls not
distinct). `clara.evaluator_version_members` — `:219-223`: `(evaluator_version_id, firm_id,
ordinal, member_signature, body_sha256)`, PK `(evaluator_version_id, member_signature)`. An
evaluator's identity is `(name, version)`; its integrity is a **closure hash** — a hash-of-hashes
over every member function's own live body, not just the entrypoint's.

**S22.** `clara.verify_evaluator_freeze()` (`0059_wave_e_delta_metrics_behavior.sql:248`, one
long statement) walks every `evaluator_versions` row: confirms `entrypoint_signature` resolves
live; recomputes `member_count`/`entry_count` and an `aggregate_hash =
sha256(string_agg(encode(body_sha256,'hex'),'' order by ordinal))` against the stored
`closure_sha256`; **re-derives `sha256(pg_get_functiondef(member_signature))` LIVE from the
catalog for every member and compares to its stored `body_sha256`** — the actual golden-hash
check against the live function body, not the manifest text. Requires ≥2 registered evaluators
including `evaluate_metric` v1 and `assess_metric_cell_independent` v1. **Invocation sites**
(expression-engine lane's more complete sweep): the deploy-flip trigger
`_tf_evaluator_deploy_once()` (`0060.sql:101`) on every undeployed→deployed transition; the
generic migration-runner guard `scripts/migrate.mjs` (registry `clara.evaluator_versions`,
verifier `clara.verify_evaluator_freeze()`) run between every migration body and its commit;
and explicit tail `perform`s inside migrations that touch an evaluator
(`0091.sql:288`, `0092.sql:610`, `0093.sql:75,389`, `0100.sql:87,728`, `0101.sql:243,1179`,
`0111.sql:1545,1815`).

**S23.** The **repo-side** half, `scripts/check-frozen-evaluators.mjs` (full file read),
regex-scans every migration for `create (or replace) function clara.evaluate_*`
(`:62`), hashes each definition's dollar-quoted body, and checks against
`frozen-evaluators.json`: (1) every evaluator in the tree registered with a matching hash, (2)
append-only vs `origin/main` — a `deployed:true` entry's hash may never change (`:237-260`), (3)
**every migration NEW vs base that defines an `evaluate_*` function must mint its own
`clara.evaluator_versions` row in the SAME file**, checked per-evaluator-name (`:262-294`).
**Scope is exact-name-pattern only**: `clara._validate_metric_node_v1`/`_metric_eval_node_v1`
(both `_`-prefixed, no `evaluate_` stem) are explicitly OUT of this lint's scope — the file
says so of `assess_metric_cell_independent_v1` by the same logic (`:57-61`). **Cross-checked
roster** (metric_cells/evaluator lane read `frozen-evaluators.json` in full): 8 evaluators
registered — `evaluate_fs_pack_agent_v1` (0111, `deployed:false` still, F-A5's agent-lane
entrypoint pending its own ceremony), `evaluate_fs_pack_v1`/`evaluate_metric_v1` (0059,
`deployed:true`), `evaluate_sst_watch`/`evaluate_sst_watches_all` (0016, `deployed:true`,
predate the registry — "asymmetry recorded" in the manifest itself), `evaluate_witness_fact_
state_v1`/`v2` (0092/0100, `deployed:true`), `evaluate_witness_identity_v1` (0091,
`deployed:true`).
