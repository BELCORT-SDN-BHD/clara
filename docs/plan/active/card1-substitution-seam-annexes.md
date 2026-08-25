# Card 1 substitution seam — annexes

> Companion to `card1-substitution-seam-design.md` + `-part2.md` (the design of record) and
> `docs/plan/research/card1-substitution-seam-survey.md` + `-part2.md` (the estate at the
> bytes, **S1-S48**). **Where this file and the design disagree, the design is right and this
> file is the bug.** Where this file and the *migration's printed line* disagree once built,
> **the printed line is right and this file is the bug** — the standing caveat every count in
> this repo carries (`sandbox-export-annexes.md:12-13`'s own wording, adopted verbatim).

---

## Annex A · The surface

### A.1 · Relations — none new, three touched

No new TABLE is minted by stages (a)+(b) (design §4). Three existing relations are touched:

| relation | how |
|---|---|
| `clara.sandbox_views` | no DDL change — its `body` blocks gain a new admitted `kind` value at the JSON-shape level, validated by the widened `_sandbox_client_set`, not by a new CHECK |
| `clara.metric_cells` | no DDL change — rows are inserted through the widened preview pathway exactly as v1 rows already are; no new column, no loosened CHECK |
| `clara.metric_primitives` | one new DML row (`'cell'`), extend-only 11→12 |
| `clara.evaluator_versions` / `evaluator_version_members` | one new row set, `('evaluate_metric', 2, ...)`, additive beside the untouched v1 row |

### A.2 · The verb enumeration

| # | verb | lane | grantee | mirrors |
|---|---|---|---|---|
| 1 | `clara.claim_sandbox_export(text, interval)` | worker, lease-scoped | `clara_runtime` | `claim_render_job`, `0081.sql:98-138` |
| 2 | `clara.sandbox_dispatch_begin(interval, int)` | leader | `clara_runtime` | `render_dispatch_begin`, `0081.sql:345-379` |
| 3 | `clara.sandbox_dispatch_record(uuid[], boolean, jsonb)` | leader | `clara_runtime` | `render_dispatch_record`, `0081.sql:381-414` |
| 4 | `clara.wake_compose_metric_preview_v2(uuid, jsonb, uuid[], uuid, text)` | wake wrapper → ungranted core | the wake role | `wake_compose_metric_preview`, `0078.sql:96-107` |

Plus the ungranted cores: `_validate_metric_node_v2`, `_metric_eval_node_v2` (both reached only
as internal calls, never granted directly — the same containment posture S31/S33's v1
counterparts already have), `_eta_compose_metric_preview_core_v2` — **granted to nobody**,
reached under `clara_fn_owner` exactly as `_eta_compose_metric_preview_core` v1 already is
(`0077.sql:22-29`'s containment rule). `clara.validate_metric_ast_v2` is `stable security
definer`, callable the same way `validate_metric_ast_v1` is (S31: revoked from public, reached
internally — check its actual grant posture against `validate_metric_ast_v1`'s own at build
time; this annex does not assert a grant this design has not decided).

**No verb touches `sandbox_export_payload` or `_sandbox_client_set`'s SIGNATURE** — both are
`create or replace`d in place (design §2.2/§2.4), which is lawful because neither is a member
of any frozen evaluator closure and neither is `evaluate_*`-named (S23's scope note).

**Allowlist rows**: `('interactive', 'wake_compose_metric_preview_v2')`, and the
`interactive_client` triple once F-A2's D34 limb merges — never a `'proactive'` row (design
§7 item 7). `claim_sandbox_export`/`sandbox_dispatch_begin`/`sandbox_dispatch_record` are
`clara_runtime`-only, not wake verbs, and carry no allowlist row at all — the same posture the
existing three sandbox worker verbs already have (S13).

### A.3 · Grants, stated so a census has something to check

`clara_runtime` gains EXECUTE on items 1-3 (A.2) and on the widened `sandbox_export_payload` —
no new TABLE grant, anywhere, on `clara.metric_cells`, `clara.sandbox_views`, or
`clara.sandbox_exports` (design §4). `clara_authenticated` gains no new grant from this design
— every new verb here is either `clara_runtime`-only or wake-role-reached, matching the
existing sandbox lane's posture (Annex A.1 of `sandbox-export-annexes.md`: "no table SELECT is
granted to `clara_agent_ro` on any of the three [sandbox] relations").

---

## Annex B · The battery — what each cell forces

**Standing rules, inherited from `sandbox-export-annexes.md`'s own Annex B header, unchanged:**
a forced cell asserts its precondition or exits via a NAMED, COUNTED `skipHere`; never
`noteLane`+return, never a `.catch` swallowing a premise, never an OR between two walls.
Fixtures THROW on construction failure. **Differential cells over self-referential ones.** A
wall's proof is a cell that makes the wall REFUSE — never a substring match on source text.

### B.1 · Stage (a) block/basis validation (design §2.2)

| cell | forces |
|---|---|
| B1.1 | a `placeholder` block whose `basis_ref` names a `preview_cell`-kind basis element pointing at a `cell_status='ok'` cell → the mint succeeds |
| B1.2 | a `placeholder` block whose `basis_ref` names a `freeform_read`-kind element → REFUSE `sandbox_placeholder_basis_not_cell`; the twin naming a `preview_cell` element succeeds |
| **B1.3** | **the non-`'ok'`-cell mint refusal** — a `placeholder` block citing a `preview_cell` basis element whose `metric_cells.cell_status` is `'undefined'`, then `'absent'`, then `'refused'` → each REFUSES `sandbox_placeholder_cell_not_ok`; the twin citing an `'ok'` cell succeeds. Three arms, one token, D3's mint-time door |
| B1.4 | **the mixed-body widening cell** — a body with one `placeholder` block (citing an `'ok'` preview cell) and one `text` block (citing anything) → `client_set_basis='firm_closure'`, NOT `'exact'`; the twin body with the `text` block removed (placeholder-only) → `client_set_basis='exact'`. This is S30's boundary made a differential: a single free-text block anywhere in the body is what widens, and only that |
| B1.5 | a body made ENTIRELY of `placeholder` blocks, each citing a distinct client's cell → derives the exact union of those clients, `'exact'` — confirms S27's zero-new-logic claim behaviourally, not just by code inspection |
| B1.6 | `sandbox_view_body_malformed` still refuses a block that is neither `'text'` nor `'placeholder'` (`block_kind_unsupported`) — the widened two-armed check, replayed against a third, unrecognised kind |

### B.2 · The pin-rule replay (design §2.4, S46)

| cell | forces |
|---|---|
| **B2.1** | **the S46 pin-rule cell.** Mint a `placeholder`-only view citing cell C. Read `sandbox_export_payload` twice, at two different times, with nothing else in the estate changed → byte-identical `cells` object both times (P-3's replay shape, applied to the new payload field) |
| **B2.2** | **the pin-rule's negative control** — mint a SECOND, unrelated `metric_cells` row D for the SAME `(client, definition)` pair C was minted against (a second preview compose call). The FIRST view's payload still resolves to C's `displayed_text`, never D's — proving the join key is the exact `id` in `sandbox_views.basis`, never a "latest cell for this definition" re-lookup. Without this cell, an implementation that joined on `(client_id, run_id, definition_version_id)` instead of `id` would pass B2.1 and still be wrong |
| B2.3 | the payload's `cells` map contains an entry ONLY for labels a `placeholder` block actually cites — a basis element present in `p_basis` but never referenced by any block does not appear in the joined `cells` object (no over-resolution) |

### B.3 · The renderer (design §2.5)

| cell | forces |
|---|---|
| B3.1 | `layoutSandbox` on a `placeholder` block whose `basis_ref` resolves in the payload's `cells` map → emits `s(<the cell's displayed_text>)`, typeset verbatim, never reformatted (E-R8 floor 1's rule, replayed on this entrance) |
| **B3.2** | **the renderer fail-closed cell** — the payload's `cells` map is mutated to DROP the entry for a `basis_ref` a block cites (simulating a payload-builder bug) → `layoutSandbox` REFUSES `sandbox_cell_unresolved`, no bytes produced; the twin with the entry present renders. Mirrors B3.6 of `sandbox-export-annexes.md` (the watermark payload-content axis) applied to cell resolution |
| B3.3 | `layoutSandbox` never emits an `na_label`-shaped fallback for a `placeholder` block — a cell fixture is asserted to have NO code path producing anything other than `s(displayed_text)` or a `RenderRefusal`; the deliberate divergence from `metric_ref`'s NA-disclosure branch (design §2.5) is proven, not merely asserted in prose |

### B.4 · Stage (b) — the `cell` primitive and dimensional algebra (design §3.1)

| cell | forces |
|---|---|
| B4.1 | `_validate_metric_node_v2` on `{"node":"cell","cell_id":"<an 'ok' cell in this firm/client>"}` → succeeds, dimension vector equals that cell's `unit_key`'s `(currency_power,days_power,count_power)` read from `clara.metric_units` |
| **B4.2** | **cross-firm/cross-client cell reference** — a `cell` node naming a `metric_cells.id` that exists but belongs to a DIFFERENT firm → REFUSE `metric_cell_reference_unknown`; the twin naming an id in a DIFFERENT client of the SAME firm → REFUSE the SAME token; the twin naming an absent id → REFUSE the SAME token again. Three arms, one token, indistinguishable (mirrors B1.11 of `sandbox-export-annexes.md`) |
| B4.3 | a `cell` node naming a resolvable cell whose `cell_status <> 'ok'` → REFUSE `metric_cell_reference_not_ok`, both at `_validate_metric_node_v2` (fail-fast) and independently at `_metric_eval_node_v2` (the door that actually gates persistence) — forced as TWO separate cells so a passing validator check can never be mistaken for the evaluator's own gate |
| **B4.4** | **the dimensional-algebra cell** — `divide({"node":"cell","cell_id":C_money}, {"node":"cell","cell_id":D_money})` → succeeds, dimension reduces to `ratio` (currency_power 1-1=0); the twin `multiply(C_money, D_money)` → REFUSE `dimension_overflow` (currency_power 1+1=2, `abs(cp)>1`), reusing v1's own overflow guard (`0059.sql:40`) unchanged against a `cell`-composed operand — proves the new primitive plugs into the EXISTING dimensional algebra rather than needing its own copy of it |
| B4.5 | a formula composing a `cell` operand against a `measure` operand of an INCOMPATIBLE unit (e.g. `subtract(cell_money, measure_count)`) → REFUSE `dimension_mismatch`, the same v1 guard (`0059.sql:39-40`), unchanged |
| B4.6 | the twelfth primitive census: `select count(*) from clara.metric_primitives` reads `12` after this migration, never `11` (reproducing, not editing, `0059.sql`'s own `if n<>11` line's INTENT in a new file) |

### B.5 · The evaluator-versioning freeze (design §3.2 — the delicate part)

| cell | forces |
|---|---|
| **B5.1** | **v1 replay unchanged, the regression-safety cell.** Insert a v1-composed `metric_cells` row (no `cell` node anywhere in its composition) through `_eta_compose_metric_preview_core` (the UNTOUCHED v1 wrapper) both BEFORE and AFTER the widened `_tf_metric_cell_integrity` (design §3.2 item 6) lands → identical acceptance, identical resulting row, in both runs. This is the cell that proves the trigger widening is additive, not a rewrite |
| **B5.2** | **v2 replay via the new branch.** Insert a v2-composed `metric_cells` row (containing a `cell` node) through `_eta_compose_metric_preview_core_v2` → `_tf_metric_cell_integrity` resolves `('evaluate_metric', 2)` from `new.evaluator_version_id` and re-derives via `_validate_metric_node_v2`/`_metric_eval_node_v2`, accepting the row. The twin: hand-construct (bypassing the wrapper, direct insert as `clara_fn_owner`) a row claiming `evaluator_version_id` for v2 but whose `inputs->'composition'` hash does not match what v2's re-derivation produces → REFUSE `CLR11`, exactly as v1's own forged-composition twin already does today |
| B5.3 | `clara.verify_evaluator_freeze()` passes, unchanged in its own body, after this migration lands — both `('evaluate_metric',1)` and `('evaluate_metric',2)` rows verify, and re-running it a second time (idempotent, `stable`) produces the identical `verified_registered` count |
| B5.4 | `scripts/check-frozen-evaluators.mjs` passes on the new migration — the new `evaluate_metric` v2 entry is registered in `frozen-evaluators.json` with a matching hash, and re-running the lint against `origin/main` confirms append-only (no `deployed:true` entry's hash changed) |
| B5.5 | an attempt to `create or replace function clara._validate_metric_node_v1` or `clara._metric_eval_node_v1` (simulating an accidental in-place edit) causes the NEXT `clara.verify_evaluator_freeze()` call to REFUSE — the differential proof that the DB-side closure hash, not merely the repo-side lint, is what makes editing v1 in place mechanically impossible (design §3.2's own claim, forced as a cell rather than left as prose) |

### B.6 · The claim/dispatch verbs (design §2.6)

| cell | forces |
|---|---|
| B6.1 | `claim_sandbox_export` transitions a `claimable` row to `running`, sets `claimed_by`/`claimed_at`/`lease_expires_at`; a second concurrent claim attempt on the same row (simulated via `FOR UPDATE SKIP LOCKED` under two sessions) never double-claims |
| B6.2 | `sandbox_dispatch_begin`/`_record` mirror `render_dispatch_begin`/`_record`'s own battery shape (P-4-style: one cell per frozen/moving column, reused against the sandbox job family) |
| B6.3 | an expired lease is reclaimed by a second `claim_sandbox_export` call — the same at-least-once reclaim `render_jobs`' own claim verb already proves |

---

## Annex C · Decisions

| # | decision | ground |
|---|---|---|
| **CD-1** | Stage (b)'s "restricted read-only over raw books" is honored via the estate's existing closed AST vocabulary (measure/account-set/period/constant leaves), extended by ONE new leaf (`cell`) that itself resolves to a prior raw-books evaluation — never via SQL text as formula input | design §1's B-mapping paragraph; S31-S33, S38 |
| **CD-2 (resolves D1)** | The placeholder's value is pinned at MINT (the `basis` array's `cell_id` can never change) and resolved LAZILY at RENDER (the payload builder's join runs at worker-call time) — both true at once, because `metric_cells` rows and `sandbox_views.basis` are both immutable | S46; design §2.4 |
| **CD-3 (resolves D2)** | Stage (b) extends `wake_compose_metric_preview`'s existing preview-cell pathway with a NEW `_v2` sibling, never a parallel "ad hoc cells" table and never a loosened `model_proposal_id`/`human_approval_id`/`supersedes_cell_id` wall | the brief's own ruling; S17, S19, S35 |
| **CD-4 (resolves D3)** | A placeholder citing a non-`'ok'` cell refuses at MINT (typed, CLR10); the renderer mirrors the refusal at render as defense-in-depth against a payload-builder bug, never against a live-data race (cells are immutable, so there is no race to cover) | design §2.2 item 3, §2.5; S15-S18 |
| **CD-5 (resolves D4)** | Stage (b)'s formula inputs are `metric_cells` references ONLY — a `freeform_read`-kind input is a named, unbuilt extension point, because `freeform_read_log` persists no result value a deterministic primitive could read | design §6 item 2 |
| **CD-6 (resolves D5)** | Charts are out of scope for both stages — placeholders are text-body only | the brief's own scoping; design §6 item 3 |
| **CD-7** | `_validate_metric_node_v2`/`_metric_eval_node_v2` carry NEW `p_firm`/`p_client` parameters v1 does not have, because `cell` is the first primitive to read firm-scoped OPERATIONAL data rather than firm-nullable catalog data | design §3.1/§3.2; `0058.sql:329`'s `using(true)` owner policy on `metric_cells`, the `0083:102-108` precedent class |
| **CD-8** | `_tf_metric_cell_integrity` is widened to branch on the inserted cell's evaluator `(name, version)` before choosing which function pair re-derives it — the ONE existing wall this design edits in place (via `create or replace function` in a new migration, never editing 0060.sql itself) | design §3.2 item 6 — the trigger hardcodes v1 calls by name (`0060.sql:257-258`), discovered by this design's own read, not restated from the survey |
| **CD-9** | The claim verb + leader-dispatch pair for `sandbox_exports` (S13's registered gap) is built in THIS session, not deferred — nothing in §2.1-§2.5 is renderable without it | the brief's explicit scoping |

---

## Annex D · Predictions

**PD-1** the widened `_sandbox_client_set` derives the exact set for a placeholder-only body
with zero change to S27's existing per-basis-kind loop — **if this prediction is wrong**, the
loop's keying assumption (basis-element kind, not block kind) was misread and the fix is a
targeted correction to design §2.3, not a rebuild. **PD-2** `_tf_metric_cell_integrity`'s v1
branch, after widening, behaves byte-identically to its pre-widening self on every v1-composed
row in the estate's existing test fixtures — **if wrong**, B5.1 catches it before merge. **PD-3**
the v2 evaluator's closure hash registration succeeds against `verify_evaluator_freeze()` on
the first attempt, because the member-reuse pattern (v1 helpers as members of both closures)
is exactly what the schema's `(evaluator_version_id, member_signature)` PK already
accommodates — **if wrong**, the PK constraint itself refuses the insert, loudly, at migration
time, not silently. **PD-4** the render-time `sandbox_cell_unresolved` refusal never fires in
practice once B1.3's mint-time gate is proven — it exists for defense-in-depth, not because a
live path is expected to reach it. **Every prediction is a prediction until the rig prints it**
(`sandbox-export-annexes.md`'s own standing line, adopted here) — none is banked as a green.

---

## Annex E · Risks

| # | risk | early warning |
|---|---|---|
| **R-1 (carried, not closed)** | screen/file divergence — a chart or figure shown in a chat turn and the same figure later exported are not structurally proven identical until Wave-G's on-screen half renders from `sandbox_views.body` | any support question of the form "the figure in the file differs from what I saw" — unchanged from `sandbox-export-annexes.md`'s own R-1; this build does not touch it |
| **R-CD-1** | **the evaluator-versioning delicacy (design §3.2) is the single highest-risk piece of this build** — a mistake in `_tf_metric_cell_integrity`'s version-branching widening could either (a) silently accept a malformed v2-composed cell (a correctness failure, hard constraint 2's direct concern) or (b) silently break v1's existing re-derivation (a regression). B5.1/B5.2 are the two cells that must both be green before this migration is considered safe, and review law 1's independent pass is non-negotiable here specifically |
| **R-CD-2** | **magnet-file collisions** — `_sandbox_client_set`, `sandbox_export_payload`, and `_tf_metric_cell_integrity` are each `create or replace`d by this design; if F-A5b PR-1's OWN later fix-rounds (still landing on `f-a5b/pr-1` as of this survey, tip `ee76f70`) touch the same function bodies before this design's migration is authored, the `create or replace` target drifts under this design and needs a re-read against the LIVE tip, not this doc's citations, before authoring | re-read `origin/f-a5b/pr-1`'s tip immediately before authoring the migration, not merely before writing this design |
| **R-CD-3** | a `cell`-composed formula's provenance chain (design §3.1's "threaded from the ORIGINAL cell's own inputs") could double-count or omit `account_set_version_ids`/`constant_version_ids` if the referenced cell is ITSELF a `cell`-composed cell (recursive composition) — this design does not forbid citing a v2-composed cell from another v2-composed cell, and the provenance-threading rule as stated has not been proven correct for that recursive case | a battery cell proving `cell`-of-`cell` composition's provenance union is complete and non-duplicated is owed before this ships, and is not yet in Annex B — named here so it is not silently missing |
| **R-CD-4** | the render-time `need()`-shaped mirror (B3.2) depends on the payload builder's `cells` object using the SAME label keys the mint-time `basis` array used — a label-casing or whitespace mismatch between mint-time validation and payload-time joining would produce a false `sandbox_cell_unresolved` on an otherwise-correct export | a battery cell asserting label round-trip fidelity (the exact string minted is the exact string the payload's `cells` object keys on) is owed alongside B3.2 |

---

## Annex F · Acceptance criteria

Done means the loop is walkable (TA-P14 A's standard, inherited):

1. A narrative sandbox view minted with a `placeholder` block citing an `'ok'` preview cell
   exports, renders, and the produced PDF's extracted text contains the cell's exact
   `displayed_text` — never a re-rounded or re-formatted figure.
2. The SAME view, re-rendered after nothing in the estate has changed, produces byte-identical
   substituted text (B2.1) — and after a SECOND, unrelated cell is minted for the same
   `(client, definition)` pair, still resolves to the ORIGINAL cell, never the new one (B2.2).
3. A placeholder citing a non-`'ok'` cell refuses at mint, named and typed, before any export
   record exists (B1.3).
4. A model-proposed `cell`-referencing expression validates, evaluates, and mints an ordinary
   immutable `metric_cells` row through `wake_compose_metric_preview_v2`, citable by a
   stage-(a) placeholder exactly like a canonical cell (B4.1, B5.2).
5. A `cell`-referencing expression that violates the dimensional algebra (money × money) refuses
   with the SAME token the estate's existing eleven-primitive grammar already uses for the same
   violation (B4.4) — the twelfth primitive is not a second grammar bolted beside the first.
6. `clara.verify_evaluator_freeze()` passes with both `evaluate_metric` v1 and v2 registered,
   and a v1-composed cell's re-derivation through the widened `_tf_metric_cell_integrity` is
   proven byte-identical to its pre-widening behaviour (B5.1) — the regression-safety cell is
   green, not merely asserted.
7. `scripts/check-frozen-evaluators.mjs` passes; `evaluate_metric_v1`'s own hash is unchanged
   from the estate's current `frozen-evaluators.json` (append-only proven, not assumed).
8. The full estate suite is green on a pristine rig, tails unfiltered, every skip named and
   counted.
9. **R-1 stays an open, named risk in `PROGRESS.md`/the harness digest — not silently marked
   closed by this build.** R-CD-3's recursive-provenance gap (Annex E) is either closed by an
   added battery cell before merge, or explicitly carried forward as a second named risk — it
   does not ship unaddressed and unmentioned.
