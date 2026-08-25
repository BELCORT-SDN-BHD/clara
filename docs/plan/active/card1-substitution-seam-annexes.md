# Card 1 substitution seam — annexes

> **v3 — final design fold, 2026-08-26**, alongside `card1-substitution-seam-design.md` +
> `-part2.md` + `-part3.md` (the design of record, three files). Companion to
> `docs/plan/research/card1-substitution-seam-survey.md` + `-part2.md` (the estate at the
> bytes, **S1-S48**). **Where this file and the design disagree, the design is right and this
> file is the bug.** Where this file and the *migration's printed line* disagree once built,
> **the printed line is right and this file is the bug** — the standing caveat every count in
> this repo carries (`sandbox-export-annexes.md:12-13`'s own wording, adopted verbatim).
>
> **v2 folded BL-1..BL-8, M1..M12, N2, N6. v3 folds the complete set**: **CD-14 APPROVED**;
> **M8 restated with both groupings named (seven textual sites, five kind-groups), no single
> number picked, per the coordinator's own ruling**; **N1, N3, N4, N5, N7, N8, N9** (the 7 nits
> the relay had referenced only by count); **all 9 battery gaps**, each tagged in Annex B by
> gap number; the M11/B2.3 reconciliation and the N2 `client_set_exact` assertions on BOTH
> B1.4 and B1.5, as instructed. This is **the final design fold before build** — the gate
> reviewer's narrow re-check runs against this complete set.

---

## Annex A · The surface

### A.1 · Relations — none new, three touched, **two by ALTER (corrected: BL-1, BL-6)**

No new TABLE is minted by stages (a)+(b) (design §4). **Corrected at the fold**: this build is
NOT DDL-free — two existing relations are widened by ALTER, not merely by function
`create or replace`:

| relation | how |
|---|---|
| `clara.sandbox_views` | no DDL change — its `body` blocks gain a new admitted `kind` value at the JSON-shape level, validated by the widened `_sandbox_client_set`, not by a new CHECK |
| `clara.metric_cells` | no DDL change — rows are inserted through the widened preview pathway exactly as v1 rows already are; no new column, no loosened CHECK |
| `clara.metric_primitives` | **BL-1: an ALTER** — the inline, unnamed CHECK on `primitive_key` (`0058.sql:67-69`) is dropped (name read live from `pg_constraint`, never guessed) and re-added widened to twelve literals, THEN one new DML row (`'cell'`) |
| `clara.sandbox_exports` | **BL-6: an ALTER** — `max_attempts`, `first_claimed_at`, `claim_delay_ms`, `dispatch_attempts`, `last_dispatch_at`, `last_dispatch_ok`, `last_dispatch_error` + the paired CHECK, mirroring `render_jobs`' own shape exactly |
| `clara.evaluator_versions` / `evaluator_version_members` | one new row set, `('evaluate_metric', 2, ...)`, additive beside the untouched v1 row, **born `deployed:false`** (BL-3) |

### A.2 · The verb enumeration

| # | verb | lane | grantee | mirrors |
|---|---|---|---|---|
| 1 | `clara.claim_sandbox_export(text, interval)` | worker, lease-scoped | `clara_runtime` | `claim_render_job`, `0081_wave_e_zeta_render_jobs_part3.sql:98-138` |
| 2 | `clara.sandbox_dispatch_begin(interval, int)` | leader | `clara_runtime` | `render_dispatch_begin`, `0081.sql:345-379` |
| 3 | `clara.sandbox_dispatch_record(uuid[], boolean, jsonb)` | leader | `clara_runtime` | `render_dispatch_record`, `0081.sql:381-414` |
| 4 | **`clara.reap_exhausted_sandbox_exports()`** (BL-6, the reap twin) | worker-lane hygiene | `clara_runtime` | `reap_exhausted_render_jobs`, `0081_wave_e_zeta_render_jobs_part3.sql:302-334` |
| 5 | `clara.wake_compose_metric_preview_v2(uuid, jsonb, uuid[], uuid, text)` | wake wrapper → ungranted core | the wake role, **allowlist `('interactive', ...)` alone, permanently (M2)** | `wake_compose_metric_preview`, `0078.sql:96-107` |
| 6 | **`clara.evaluate_metric_v2(uuid, uuid, uuid[], uuid, uuid)`** (BL-2, the real entrypoint) | canonical-path evaluator, currently no reachable caller (§6 item 5 of the design) | `clara_authenticated`, mirroring v1's own grant | `evaluate_metric_v1`, `0059.sql:112` |

Plus the ungranted cores: `_validate_metric_node_v2`, `_metric_eval_node_v2` (both reached only
as internal calls, never granted directly — the same containment posture S31/S33's v1
counterparts have), `_eta_compose_metric_preview_core_v2` — **granted to nobody**, reached
under `clara_fn_owner` exactly as `_eta_compose_metric_preview_core` v1 already is
(`0077.sql:22-29`'s containment rule). `clara.validate_metric_ast_v2` is `stable security
definer`, reached internally the same way `validate_metric_ast_v1` is (S31).

**No verb touches `sandbox_export_payload` or `_sandbox_client_set`'s SIGNATURE** — both are
`create or replace`d in place (design §2.2/§2.4), which is lawful because neither is a member
of any frozen evaluator closure and neither is `evaluate_*`-named (S23's scope note).
**`clara._tf_metric_cell_integrity` and `clara._tf_sandbox_export_lifecycle` are also
`create or replace`d in place** (design §3.2 item 6, §2.6) — the trigger FUNCTIONS are not
frozen the way the evaluator closure's members are; the migration FILES that first defined them
stay untouched.

**Allowlist rows: exactly one new row.** `('interactive', 'wake_compose_metric_preview_v2')` —
**permanently, never `interactive_client`** (M2, corrected from the pre-fold draft's stale
"once F-A2's D34 limb merges" framing — 0132's own live text at `0132.sql:1183-1206` already
measures `interactive_client` as capped at exactly one row, `wake_open_question`, and this cap
is itself tail-censused, `0132.sql:1379-1382`). `claim_sandbox_export`/`sandbox_dispatch_begin`/
`sandbox_dispatch_record`/`reap_exhausted_sandbox_exports` are `clara_runtime`-only, not wake
verbs, and carry no allowlist row at all — the same posture the existing sandbox worker verbs
already have (S13). `evaluate_metric_v2` is `clara_authenticated`-granted directly, matching
v1's own grant shape, not a wake verb either.

### A.3 · Grants, stated so a census has something to check

`clara_runtime` gains EXECUTE on items 1-4 (A.2) and on the widened `sandbox_export_payload` —
no new TABLE grant, anywhere, on `clara.metric_cells`, `clara.sandbox_views`, or
`clara.sandbox_exports`. `clara_authenticated` gains EXECUTE on item 6 (`evaluate_metric_v2`),
matching v1's own posture, and (via the wake role) reaches item 5. No new grant is made to
`clara_agent_ro` anywhere in this design (matching the existing sandbox lane's posture:
"no table SELECT is granted to `clara_agent_ro` on any of the three [sandbox] relations",
`sandbox-export-annexes.md` Annex A.1).

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
| B1.3 | **the non-`'ok'`-cell mint refusal** — a `placeholder` block citing a `preview_cell` basis element whose `metric_cells.cell_status` is `'undefined'`, then `'absent'`, then `'refused'` → each REFUSES `sandbox_placeholder_cell_not_ok`; the twin citing an `'ok'` cell succeeds. Three arms, one token, D3's mint-time door |
| **B1.4 (N2)** | **the mixed-body widening cell** — a body with one `placeholder` block (citing an `'ok'` preview cell for client A) and one `text` block (citing anything) → `client_set_basis='firm_closure'`, NOT `'exact'`, AND **`client_set_exact` (`0132.sql:709-716`'s NT-1 field) still reads `{A}` alone** — proving the widened `client_set` and the exact derivation diverge exactly where S30 says they must, not merely that the label reads `'firm_closure'`; the twin body with the `text` block removed (placeholder-only) → `client_set_basis='exact'` and `client_set_exact = client_set`, byte-identical. This is S30's boundary made a differential, asserted on BOTH returned fields |
| **B1.5 (N2)** | a body made ENTIRELY of `placeholder` blocks, each citing a distinct client's cell → **asserts against `client_set_exact` specifically** (the SAME NT-1 field, returned separately from the widened `client_set` precisely so this assertion is meaningful — asserting only against the widened `client_set` would pass even on a silently narrowed exact derivation, mirroring the parent lane's own B1.9 concern), derives the exact union of those clients |
| B1.6 | `sandbox_view_body_malformed` still refuses a block that is neither `'text'` nor `'placeholder'` (`block_kind_unsupported`) — the widened two-armed check, replayed against a third, unrecognised kind |
| **B1.7 (M4)** | a `placeholder` block carrying an extra key outside `{kind, basis_ref}` → REFUSE `sandbox_view_body_malformed`/`placeholder_unknown_key`; the DIFFERENTIAL twin — a `text` block carrying an equivalent extra, unrecognised key → SUCCEEDS (proves the closed-key rule is `placeholder`-only, never silently applied to `text`, per M4's own instruction) |

### B.2 · The pin-rule replay (design §2.4, S46)

| cell | forces |
|---|---|
| B2.1 | **the S46 pin-rule cell.** Mint a `placeholder`-only view citing cell C. Read `sandbox_export_payload` twice, at two different times, with nothing else in the estate changed → byte-identical `cells` object both times (P-3's replay shape, applied to the new payload field) |
| B2.2 | **the pin-rule's negative control** — mint a SECOND, unrelated `metric_cells` row D for the SAME `(client, definition)` pair C was minted against. The FIRST view's payload still resolves to C's `displayed_text`, never D's — proving the join key is the exact `id` in `sandbox_views.basis`, never a "latest cell for this definition" re-lookup |
| **B2.3 (M11)** | **the payload's `cells` map contains an entry ONLY for labels a `placeholder` block actually cites** — a basis element present in `p_basis` and cited ONLY by a `text` block (never by a `placeholder`) does NOT appear in the joined `cells` object. This is now the RULED shape (M11), not merely an aspiration — the corrected §2.4 SQL is written to pass exactly this cell |

### B.3 · The renderer (design §2.5)

| cell | forces |
|---|---|
| B3.1 | `layoutSandbox` on a `placeholder` block whose `basis_ref` resolves in the payload's `cells` map → emits `s(<the cell's displayed_text>)`, typeset verbatim, never reformatted (E-R8 floor 1's rule, replayed on this entrance) |
| B3.2 | **the ABSENT-entry cell** — the payload's `cells` map is mutated to DROP the entry for a `basis_ref` a block cites (simulating a payload-builder bug) → `layoutSandbox` REFUSES `sandbox_cell_unresolved`, no bytes produced; the twin with the entry present renders |
| **B3.3 (BL-8, battery gap 9)** | **the MALFORMED-entry cell, a distinct axis from B3.2 — the renderer's non-`'ok'`/non-string-`displayed_text` refusal.** — the payload's `cells` map carries an entry for the cited `basis_ref`, but with `cell_status` mutated to `'undefined'` → REFUSE `sandbox_cell_malformed`; a second arm with `cell_status='ok'` but `displayed_text` mutated to `null` → REFUSE the SAME token (never allowed to reach `typstString`, which would coerce `null` to `""` and render silently, `layout.mjs:73-79`'s fail-open shape); the twin with a well-formed `{cell_status:'ok', displayed_text: '<string>'}` entry renders |
| B3.4 | `layoutSandbox` never emits an `na_label`-shaped fallback for a `placeholder` block — a cell fixture is asserted to have NO code path producing anything other than `s(displayed_text)` or a `RenderRefusal`; the deliberate divergence from `metric_ref`'s NA-disclosure branch (design §2.5) is proven, not merely asserted in prose |

### B.4 · Stage (b) — the `cell` primitive and dimensional algebra (design §3.1)

| cell | forces |
|---|---|
| B4.1 | `_validate_metric_node_v2` on `{"node":"cell","cell_id":"<a definition-backed, 'ok' cell in this firm/client>"}` → succeeds, dimension vector equals that cell's `unit_key`'s `(currency_power,days_power,count_power)` read from `clara.metric_units`, **and `temp` equals the cited cell's OWN `metric_definition_versions.temporality_key`** (M7 — a differential twin citing a `point_in_time`-declared definition's cell must NOT come back `'flow'`) |
| B4.2 | cross-firm/cross-client cell reference — a `cell` node naming a `metric_cells.id` that exists but belongs to a DIFFERENT firm → REFUSE `metric_cell_reference_unknown`; the twin naming an id in a DIFFERENT client of the SAME firm → REFUSE the SAME token; the twin naming an absent id → REFUSE the SAME token again. Three arms, one token, indistinguishable |
| **B4.3 (BL-5, battery gap 1)** | **the definition-backed refusal, both polarities — a definition-backed cell admits, a preview-composed (`definition_version_id IS NULL`) one refuses.** A `cell` node naming a resolvable, `'ok'`, PREVIEW-composed cell (`definition_version_id IS NULL`, minted via `wake_compose_metric_preview` v1 or v2) → REFUSE `metric_cell_reference_not_definition_backed`, forced at `_validate_metric_node_v2` AND independently at `_metric_eval_node_v2` (two separate cells, since BL-5 names both doors); the twin naming a canonical, definition-backed `'ok'` cell → succeeds at both |
| B4.4 | a `cell` node naming a resolvable, DEFINITION-BACKED cell whose `cell_status <> 'ok'` → REFUSE `metric_cell_reference_not_ok`, at both doors |
| **B4.5 (M6, battery gap 5)** | **the context-mismatch cell, period axis** — a `cell` node citing a definition-backed, `'ok'` cell computed over periods `{P1,P2}`, composed inside a formula whose own context binds `{P1,P3}` → REFUSE `metric_cell_context_mismatch`; the twin with matching period sets succeeds |
| **B4.6 (M6, battery gap 5)** | **the context-mismatch cell, watermark axis** — a `cell` node citing a cell minted against `books_watermark = W1`, composed inside a formula whose snapshot's `books_watermark = W2` → REFUSE `metric_cell_context_mismatch`; the twin with matching watermarks succeeds |
| B4.7 | **the dimensional-algebra cell** — `divide({"node":"cell","cell_id":C_money}, {"node":"cell","cell_id":D_money})` → succeeds, dimension reduces to `ratio` (currency_power 1-1=0); the twin `multiply(C_money, D_money)` → REFUSE `dimension_overflow` (currency_power 1+1=2, `abs(cp)>1`), reusing v1's own overflow guard (`0059.sql:40`) unchanged against a `cell`-composed operand |
| B4.8 | a formula composing a `cell` operand against a `measure` operand of an INCOMPATIBLE unit (e.g. `subtract(cell_money, measure_count)`) → REFUSE `dimension_mismatch`, the same v1 guard (`0059.sql:39-40`), unchanged |
| **B4.9a (battery gap 6, polarity 1)** | against a fixture snapshot of the PRE-ALTER `metric_primitives` constraint (the eleven-literal CHECK, unmodified), `insert into clara.metric_primitives values ('cell','{}')` → REFUSES (a live Postgres constraint violation, not a typed CLR token — this is DDL, not a DEFINER body) |
| **B4.9b (battery gap 6, polarity 2)** | AFTER the ALTER runs, the identical insert → succeeds, and `select count(*) from clara.metric_primitives` reads `12`, never `11` — the twelfth-primitive census, proving the ALTER (not the insert alone) is what makes `'cell'` admissible |
| **B4.10 (battery gap 3)** | **the `evaluator_entrypoint` STAMP, not merely the trigger's re-derivation of it.** A `metric_cells` row minted through `_eta_compose_metric_preview_core_v2` carries `inputs->'composition'->>'evaluator_entrypoint' = 'clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)'` EXACTLY (BL-4 item 3's literal, `0060.sql:253`'s comparison target) — read directly off the inserted row, independent of whether `_tf_metric_cell_integrity` accepted it; the twin, a v1-composed row, carries the v1 literal instead. This is the WRITER-side proof the stamp is correct at the source, complementing B5.2's trigger-side proof that the stamp is what the trigger's branch selection depends on |

### B.5 · The evaluator-versioning freeze (design §3.2 — the delicate part)

| cell | forces |
|---|---|
| B5.1 | **v1 replay unchanged, the regression-safety cell.** Insert a v1-composed `metric_cells` row (no `cell` node anywhere in its composition) through `_eta_compose_metric_preview_core` (the UNTOUCHED v1 wrapper) both BEFORE and AFTER the widened `_tf_metric_cell_integrity` (design §3.2 item 6) lands → identical acceptance, identical resulting row, in both runs |
| B5.2 | **v2 replay via the new branch.** Insert a v2-composed `metric_cells` row (containing a `cell` node) through `_eta_compose_metric_preview_core_v2` → `_tf_metric_cell_integrity` resolves the v2 literal (BL-4 item 3) from `new.inputs->'composition'->>'evaluator_entrypoint'` and re-derives via `_validate_metric_node_v2`/`_metric_eval_node_v2`, accepting the row. The twin: hand-construct (bypassing the wrapper, direct insert as `clara_fn_owner`) a row claiming the v2 literal but whose `inputs->'composition'` hash does not match what v2's re-derivation produces → REFUSE `CLR11` |
| B5.3 | `clara.verify_evaluator_freeze()` passes, unchanged in its own body, after this migration lands — both `('evaluate_metric',1)` and `('evaluate_metric',2)` rows verify (**BL-2: `entry_count=1` for v2 now has a real target, `evaluate_metric_v2`, to count**), and re-running it a second time (idempotent, `stable`) produces the identical `verified_registered` count |
| B5.4 | `scripts/check-frozen-evaluators.mjs` passes on the new migration — **BL-2's corrected reasoning**: the new `evaluate_metric_v2` entry is found DIRECTLY by the lint's `evaluate_*` scan (not merely covered indirectly by the DB-side census), registered in `frozen-evaluators.json` with a matching hash, and re-running the lint against `origin/main` confirms append-only (no `deployed:true` entry's hash changed) |
| B5.5 | an attempt to `create or replace function clara._validate_metric_node_v1` or `clara._metric_eval_node_v1` (simulating an accidental in-place edit) causes the NEXT `clara.verify_evaluator_freeze()` call to REFUSE — the differential proof that the DB-side closure hash, not merely the repo-side lint, is what makes editing v1 in place mechanically impossible |
| **B5.6 (BL-3, battery gap 2)** | **the deploy-ceremony cell, both polarities.** `UPDATE clara.evaluator_versions SET deployed=true WHERE evaluator_name='evaluate_metric' AND version=2`, run under a session with `SET ROLE clara_fn_owner` active (`current_user <> session_user`) → REFUSE `'evaluator deployment requires the migration ceremony principal'` (CLR08); the twin, run under the bare migration-runner principal with no `SET ROLE` active → succeeds. **Then, explicitly the two named polarities of the CALL itself**: `wake_compose_metric_preview_v2` on a `cell`-referencing AST → REFUSES `evaluator_undeployed` BEFORE the flip; the IDENTICAL call, nothing else in the estate changed → mints successfully AFTER it |
| **B5.7 (battery gap 4)** | **`_normalize_metric_node_v1` round-trips a `cell` node byte-identically.** `_normalize_metric_node_v1({"node":"cell","cell_id":"<uuid>"})` → returns the input UNCHANGED, byte-for-byte (its `else return n` catch-all, BL-4 item 4) — proven behaviourally, not merely read from source, because this is the fact `_eta_compose_metric_preview_core_v2`'s own composition-identity hash and `_tf_metric_cell_integrity`'s re-derivation both depend on silently; the twin — a `divide`/`sum`/etc. node containing a nested `cell` leaf — normalizes its OWN commutative structure (e.g. `multiply`'s canonical-order swap) while leaving the nested `cell` leaf itself untouched, proving the recursion into a `cell`-containing subtree is correct, not merely the bare leaf case |

### B.6 · The claim/dispatch verbs and the ALTER (design §2.6, BL-6)

| cell | forces |
|---|---|
| **B6.1a (battery gap 7, dispatch cols writable)** | every NEW mutable column of `sandbox_exports` (`first_claimed_at`, `claim_delay_ms`, `dispatch_attempts`, `last_dispatch_at`, `last_dispatch_ok`, `last_dispatch_error`) accepts its lawful transition through the recut `_tf_sandbox_export_lifecycle`'s widened `mutable` array; `max_attempts` — deliberately NOT in the mutable array — REFUSES an UPDATE attempting to change it, mirroring `render_jobs`' own frozen-request-half precedent |
| **B6.1b (battery gap 7, request half still frozen)** | an UPDATE attempting to change any FROZEN request-half column (`firm_id`, `sandbox_view_id`, `recipient_id`, `coverage_proof`, `watermark_policy_version_id`, `locale`, `requested_by`, `on_behalf_of`, `op_key`) on a NON-terminal row → REFUSES `sandbox_export_request_immutable` — the recut trigger's widening touches ONLY the `mutable` array's membership, never the request-half wall around everything else |
| **B6.1c (battery gap 7, terminal freeze intact)** | on a `done` or `failed` row, an UPDATE attempting to change ANY column — including one of the six newly-mutable dispatch columns — → REFUSES `sandbox_export_terminal`; the recut trigger's `old.state in ('done','failed')` whole-row freeze (`0132.sql:358-364`) is unconditional and does not carve out an exception for the new columns |
| **B6.2 (battery gap 8)** | `claim_sandbox_export` transitions a `claimable` row to `running`, sets `claimed_by`/`claimed_at`/`lease_expires_at`/`first_claimed_at`/`claim_delay_ms`; a second concurrent claim attempt on the same row (simulated via `FOR UPDATE SKIP LOCKED` under two sessions) never double-claims. **The attempts ceiling, forced explicitly**: a row at `attempts = max_attempts` (the cap, not one below it) → never claimable, even with an expired lease (the predicate is `e.attempts < e.max_attempts`, strict); the twin at `attempts = max_attempts - 1` → claimable |
| B6.3 | `sandbox_dispatch_begin`/`_record` mirror `render_dispatch_begin`/`_record`'s own battery shape (one cell per frozen/moving column, reused against the sandbox job family), stamping `dispatch_attempts`/`last_dispatch_at`/`last_dispatch_ok`/`last_dispatch_error` |
| **B6.4 (BL-6, the reap twin)** | a `sandbox_exports` row `state='running'`, `lease_expires_at < now()`, `attempts >= max_attempts` → `reap_exhausted_sandbox_exports()` parks it `state='failed'`, `finished_at=now()`, clears the claim columns, stamps `last_error.reason='failed_at_cap_without_report'`; the twin row (attempts below the cap) is left untouched by the same call |
| **B6.5 (M9, restored)** | **the aclexplode bidirectional census, reproduced from 0132's own tail** (`0132.sql:1404-1447`) against the new verbs' grants — every EXECUTE `claim_sandbox_export`/`sandbox_dispatch_begin`/`sandbox_dispatch_record`/`reap_exhausted_sandbox_exports` grant is to `clara_runtime` and NO OTHER role, in both directions (no missing grant, no extra one) |

---

## Annex C · Decisions

| # | decision | ground |
|---|---|---|
| **CD-1** | Stage (b)'s "restricted read-only over raw books" is honored via the estate's existing closed AST vocabulary (measure/account-set/period/constant leaves), extended by ONE new leaf (`cell`) that itself resolves to a prior raw-books evaluation — never via SQL text as formula input | design §1's B-mapping paragraph; S31-S33, S38 |
| **CD-2 (resolves D1)** | The placeholder's value is pinned at MINT (the `basis` array's `cell_id` can never change) and resolved LAZILY at RENDER (the payload builder's join runs at worker-call time) — both true at once, because `metric_cells` rows and `sandbox_views.basis` are both immutable | S46; design §2.4 |
| **CD-3 (resolves D2)** | Stage (b) extends `wake_compose_metric_preview`'s existing preview-cell pathway with a NEW `_v2` sibling, never a parallel "ad hoc cells" table and never a loosened `model_proposal_id`/`human_approval_id`/`supersedes_cell_id` wall | the brief's own ruling; S17, S19, S35 |
| **CD-4 (resolves D3)** | A placeholder citing a non-`'ok'` cell refuses at MINT (typed, CLR10); the renderer mirrors the refusal at render as defense-in-depth against a payload-builder bug (**now TWO renderer checks, BL-8**: absence via `sandbox_cell_unresolved`, malformed shape via `sandbox_cell_malformed`), never against a live-data race (cells are immutable, so there is no race to cover) | design §2.2 item 3, §2.5; S15-S18 |
| **CD-5 (resolves D4)** | Stage (b)'s formula inputs are `metric_cells` references ONLY — a `freeform_read`-kind input is a named, unbuilt extension point, because `freeform_read_log` persists no result value a deterministic primitive could read | design §6 item 2 |
| **CD-6 (resolves D5)** | Charts are out of scope for both stages — placeholders are text-body only | the brief's own scoping; design §6 item 3 |
| **CD-7** | `_validate_metric_node_v2`/`_metric_eval_node_v2` carry NEW `p_firm`/`p_client` parameters v1 does not have, because `cell` is the first primitive to read firm-scoped OPERATIONAL data rather than firm-nullable catalog data | design §3.1/§3.2; **`0058.sql:329`**'s `using(true)` owner policy on `metric_cells`, the `0083:102-108` precedent class (N6: re-pinned, confirmed accurate at this exact line on re-read for the fold) |
| **CD-8 (BL-4, recut — FOUR hardcoded refs, not two)** | `_tf_metric_cell_integrity`'s `definition_version_id IS NULL` branch hardcodes: (1) `_metric_eval_node_v1`, (2) `validate_metric_ast_v1`, (3) the `evaluator_entrypoint` literal-string comparison (`0060.sql:253`), and (4) `_normalize_metric_node_v1` — verified BENIGN for `cell` (its `else return n` catch-all handles an unrecognised leaf node correctly) and needing NO `_v2` sibling. The widened trigger retargets (1)-(3); (4) is reused unchanged by both v1 and v2 | design §3.2's own read of `0060.sql:237-284` and `0059.sql:70` in full — not restated from the survey, which did not drill into the trigger's internal literal comparisons |
| **CD-9 (BL-4, new)** | The AST document tag `clara.metric/v1` and the composition schema tag `clara.metric-composition-inputs/v1` stay UNCHANGED — the grammar widens, the document format does not; vocabulary identity is carried by the EVALUATOR VERSION `(evaluator_name, version)`, never by a document-format string | design §3.1; S21's own `(name, version)` identity model |
| **CD-10 (BL-5)** | A `cell` AST node may cite ONLY a definition-backed (`definition_version_id IS NOT NULL`) cell, never a preview-composed one — this closes R-CD-3 (recursive composition) BY CONSTRUCTION: since every stage-(b) output is itself preview-composed, a `cell` node can never cite another `cell`-composed formula's own output. Composition depth is exactly one level, structurally | design §3.1; the fold's own ruling |
| **CD-11 (M6)** | A `cell` operand must match the composing context on TWO axes — period-set equality and `books_watermark` equality — both checked at evaluation time; cross-period/cross-context composition is a named, unbuilt extension point, because in-context time comparison already exists via `lag`/`percent_change` | design §3.1; the fold's own accounting-correctness ruling, not relitigated |
| **CD-12 (M7)** | A `cell` node's contribution to `account_set_version_ids`/`constant_version_ids`/`entry_ids`/`document_ids` is the EMPTY array — provenance is cited BY ID (`inputs.input_values.cell_id`), never inlined/merged from the cited cell's own `inputs` tree, avoiding both a key-collision risk and an unbounded-growth risk | design §3.1/§3.2; the fold's own composition-key-collision ruling |
| **CD-13 (M11)** | `sandbox_export_payload`'s `cells` object carries an entry ONLY for labels a `placeholder` block actually cites, never every `preview_cell`-kind basis element the view happens to carry | design §2.4; matches battery cell B2.3, which the pre-fold draft's SQL contradicted |
| **CD-14 — APPROVED 2026-08-26** | `clara.evaluate_metric_v2` is minted as a real, callable, correctly-hashed entrypoint — the "honest branch" satisfying the freeze machinery directly — but `propose_metric_definition`/`approve_metric_definition` stay v1-scoped, AND (N3, new at this fold) `_eta_save_metric_definition_draft_core`'s own `_validate_metric_ast_shape_v1` gate stays v1-scoped too, closing the draft-save door independently of the human proposal/approval verbs; no canonical, `cell`-referencing definition is buildable through this session, at either door | design §3.1 (N3)/§3.2 item 4; this design's own scope-boundary judgement call, RULED correct by the coordinator: "stage (b) works through the preview pathway, canonical-definition composition is a future card" |
| **CD-15 (BL-3)** | The deploy-once trigger GATES a manual `deployed:false → true` transition; it does not perform one. Stage (b) ships DARK — every `wake_compose_metric_preview_v2` call refuses `evaluator_undeployed` — until a separate ceremony (run by the bare migration-runner principal, no `SET ROLE`) flips it, matching `evaluate_fs_pack_agent_v1`'s own still-undeployed precedent | design §3.2, `0060.sql:93-103` read in full for the fold |
| **CD-16 (M2)** | `wake_compose_metric_preview_v2`'s allowlist row is `('interactive', ...)` alone, permanently — never `interactive_client`, regardless of F-A2 D34's own merge state, because `interactive_client` is tail-censused at exactly one row (`wake_open_question`) by 0132 itself | design §2.6; `0132.sql:1183-1206,1379-1382` read directly for the fold |

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
time, not silently. **PD-4** the render-time `sandbox_cell_unresolved`/`sandbox_cell_malformed`
refusals never fire in practice once B1.3/B4.3-B4.6's mint-time gates are proven — they exist
for defense-in-depth, not because a live path is expected to reach them. **PD-5 (new, BL-3)**
the deploy ceremony's `UPDATE` succeeds on the first attempt under the bare migration-runner
principal — **if wrong** (e.g. the migration-runner's own connection carries an unexpected
`SET ROLE` left over from a prior statement in the same session), the fix is a `RESET ROLE`
immediately before the `UPDATE`, not a change to the trigger. **Every prediction is a
prediction until the rig prints it** — none is banked as a green.

---

## Annex E · Risks

| # | risk | early warning |
|---|---|---|
| **R-1 (carried, not closed)** | screen/file divergence — a chart or figure shown in a chat turn and the same figure later exported are not structurally proven identical until Wave-G's on-screen half renders from `sandbox_views.body` | any support question of the form "the figure in the file differs from what I saw" — unchanged from `sandbox-export-annexes.md`'s own R-1; this build does not touch it |
| **R-CD-1 (still open)** | **the evaluator-versioning delicacy (design §3.2) remains the single highest-risk piece of this build** — a mistake in `_tf_metric_cell_integrity`'s version-branching widening could either (a) silently accept a malformed v2-composed cell or (b) silently break v1's existing re-derivation. B5.1/B5.2 are the two cells that must both be green before this migration is considered safe |
| **R-CD-2 (still open)** | **magnet-file collisions** — `_sandbox_client_set`, `sandbox_export_payload`, `_tf_metric_cell_integrity`, and (new at the fold) `_tf_sandbox_export_lifecycle` are each `create or replace`d by this design; if F-A5b PR-1's OWN later fix-rounds (still landing on `f-a5b/pr-1` as of this survey, tip `ee76f70`) touch the same function bodies before this design's migration is authored, the `create or replace` target drifts under this design and needs a re-read against the LIVE tip, not this doc's citations, before authoring |
| **~~R-CD-3~~ CLOSED BY STRUCTURE (BL-5)** | ~~a `cell`-composed formula's provenance chain could double-count or omit inputs if the referenced cell is ITSELF a `cell`-referencing formula (recursive composition)~~ — **BL-5's definition-backed requirement makes this impossible by construction**: a `cell` node may cite only `definition_version_id IS NOT NULL` cells, and every stage-(b) output is `definition_version_id IS NULL`, so a `cell`-of-`cell` chain can never form. B4.3 forces the refusal that makes this true. Retained here, struck through rather than deleted, so the closure is visible rather than silently un-mentioned | n/a — structurally closed; a regression would require BL-5's own check (B4.3) to itself regress, which B4.3 exists to catch |
| **R-CD-4 (new at the fold)** | **the deploy-ceremony gap (BL-3)** — until the manual flip runs, stage (b) is entirely unreachable (`evaluator_undeployed` on every call), which is BY DESIGN, but is a genuine operational risk if the ceremony is forgotten after this migration merges — a "the code shipped but nothing works" state that looks like a defect to anyone who does not know the ceremony is a separate, later act | `evaluator_undeployed` appearing in production logs the day after this migration's PR merges is the expected, correct signal, not a bug report — named here so it is not mistaken for one |
| **R-CD-5 (new at the fold, DOWNGRADED per N9)** | the render-time `need()`-shaped mirror (B3.2/B3.3) depends on the payload builder's `cells` object using the SAME label keys the mint-time `basis` array used, AND on M11's filter (`b.label in (select ... where kind='placeholder')`) staying in sync with `_sandbox_client_set`'s own placeholder-basis-ref validation. **N9: narrower than first framed** — labels round-trip RAW, with no normalization anywhere in the path that could make two representations of "the same" label diverge (`0132.sql:585-590`'s label check is a plain non-blank/uniqueness test, no trim/case-fold beyond a blank check; `0132.sql:647`'s `basis_ref` match is a bare `=`, not `ilike`/`btrim`-wrapped) — so a drift can only arise from an actual CODE defect in one of the two filter predicates, never from a representation mismatch on an otherwise-correct label. The risk is real but is a narrower CODE-CORRECTNESS class, not a data-representation class | the battery cell remains owed (asserting the two filters' label sets are identical on the same fixture view, alongside B2.3/B3.2) — downgraded severity does not mean untested |

---

## Annex F · Acceptance criteria

**Preconditions (BL-3, new at the fold) — done does NOT mean reachable until BOTH hold:**

0. **The migration(s) land AND the manual deploy ceremony has run** (`UPDATE clara.
   evaluator_versions SET deployed=true WHERE evaluator_name='evaluate_metric' AND version=2`,
   under the bare migration-runner principal). Before the ceremony, every acceptance item below
   involving `wake_compose_metric_preview_v2` correctly REFUSES `evaluator_undeployed` — that is
   the expected pre-ceremony state, not a failure of items 1-9, and a reviewer must not mark
   this build "done" on the strength of the migration alone.

Done means the loop is walkable (TA-P14 A's standard, inherited), **after** precondition 0:

1. A narrative sandbox view minted with a `placeholder` block citing an `'ok'` preview cell
   exports, renders, and the produced PDF's extracted text contains the cell's exact
   `displayed_text` — never a re-rounded or re-formatted figure.
2. The SAME view, re-rendered after nothing in the estate has changed, produces byte-identical
   substituted text (B2.1) — and after a SECOND, unrelated cell is minted for the same
   `(client, definition)` pair, still resolves to the ORIGINAL cell, never the new one (B2.2).
3. A placeholder citing a non-`'ok'` cell refuses at mint, named and typed, before any export
   record exists (B1.3).
4. A model-proposed `cell`-referencing expression, citing a DEFINITION-BACKED cell computed
   over the SAME period set and `books_watermark` as the composing context, validates,
   evaluates, and mints an ordinary immutable `metric_cells` row through
   `wake_compose_metric_preview_v2`, citable by a stage-(a) placeholder exactly like a canonical
   cell (B4.1, B5.2). The SAME expression citing a preview-composed cell, or a
   context-mismatched cell, refuses named and typed (B4.3, B4.5, B4.6).
5. A `cell`-referencing expression that violates the dimensional algebra (money × money) refuses
   with the SAME token the estate's existing eleven-primitive grammar already uses for the same
   violation (B4.7) — the twelfth primitive is not a second grammar bolted beside the first.
6. `clara.verify_evaluator_freeze()` passes with both `evaluate_metric` v1 and v2 registered,
   and a v1-composed cell's re-derivation through the widened `_tf_metric_cell_integrity` is
   proven byte-identical to its pre-widening behaviour (B5.1) — the regression-safety cell is
   green, not merely asserted.
7. `scripts/check-frozen-evaluators.mjs` passes; `evaluate_metric_v1`'s own hash is unchanged
   from the estate's current `frozen-evaluators.json` (append-only proven, not assumed);
   `evaluate_metric_v2` is present with a matching hash (B5.4).
8. `claim_sandbox_export`/`sandbox_dispatch_begin`/`sandbox_dispatch_record`/`reap_exhausted_
   sandbox_exports` end-to-end drive a claimable `sandbox_exports` row through `running` to
   `done`, with `packages/runtime/lib/leader.mjs`'s widened cadence wiring exercising the same
   path a live leader loop would (B6.1a-c, B6.2-B6.5).
9. The full estate suite is green on a pristine rig, tails unfiltered, every skip named and
   counted.
10. **R-1 stays an open, named risk in `PROGRESS.md`/the harness digest — not silently marked
    closed by this build.** R-CD-2 (magnet-file collision) and R-CD-4 (the ceremony-gap
    operational risk) are either closed by an added mitigation before merge, or explicitly
    carried forward as named risks — they do not ship unaddressed and unmentioned.
