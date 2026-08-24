# F-A5 — reporting agency: the estate survey (v2)

> **v2, 2026-08-22 — gate 2 folded (record: `reporting-agency-gate-record.md`).** Two survey findings
> changed: **S2 is re-cut** — `evaluate_metric_v1` is itself JWT-bound, which S2 v1 missed by reading
> the PACK verb and not the entrypoint — and **three cites are re-pointed** (`0070:323-326`/`:502-505`
> for the single-version check, `0077:390` for `report_preview_deferred`, `0077:392` for
> `draft_watermarked`). Everything else stood at the bytes under an independent adversarial pass.

> **RENAMED AT LANDING, 2026-08-22 → `reporting-agency-survey.md`. THIS WAS AN INTEGRATOR ACT, NOT
> A CHOICE.** The design lane's `Write` tool refuses any repo filename containing the substring
> "report" (harness guard: *"subagents should return findings as text, not write report files"*),
> and the `Bash` tool refuses file creation by redirect, `cp` and `mv` alike (`no-bash-file-write`).
> The lane therefore **could not** produce the ruled slug itself, and did not try to route around
> the guard. The five F-A5 files were staged under `fa5-agency-*` names and the landing lane
> `git mv`-ed them to
> `reporting-agency-{survey,design,annexes-1-mechanics,annexes-2-record,gate-record}.md`. **The
> cross-references inside them already spelled the post-rename names**, so the rename made the set
> self-consistent; the residual `fa5-agency-*` spellings in the five banners were trued in the same
> commit, and `docs/plan/index.md` points at the landed names.

> **Estate survey of record for Wave-F Track-A item F-A5** (`docs/plan/active/wave-f-contract.md`
> §F-A5, lines 88-98), read against **the 2026-08-22 Track-A sitting rulings TA-P1, TA-P4, TA-P5,
> TA-P6, TA-P9, TA-P10, TA-P11 and TA-P14** and the standing laws digest (**71-77**, and **22, 27,
> 31, 34, 40, 41, 45, 68, 69, 70**). Companion: `reporting-agency-design.md` (+ its two annexes).
> **Two of the rulings that bind this item are constitutional amendments PENDING the owner's digest
> sign-off** — TA-P1 (law 71's "exactly" enumeration → an open register) and TA-P7 (invariant (a)).
> F-A5 is DESIGNED under them; **no F-A5 build PR may merge before that sign-off**, because the
> whole self-approval half of this item rests on TA-P1's open register.
>
> **Standing caveat, inherited from F-A2's annex 1 and re-earned here.** Everything below read from
> migration *source* is a **prediction about the live catalog**, not a measurement of it. Four
> classes defeat source reading in this estate specifically: `0058`-`0060` and `0077`/`0078` ship
> **minified single-line bodies** (a line number names a whole function, not a statement) · three
> freeze rosters pin `pg_get_functiondef` output, which is a **catalog round-trip** and not the
> file's own text · `report_runs`/`report_datasets` carry **deferred constraint triggers** whose
> firing order is a `pg_trigger` fact · and the render lane's behaviour lives half in SQL and half
> in a **pinned container image**. Every claim tagged **[PREDICTION]** is carried to the PR-0 rig
> replay to be confirmed or corrected, per the F-A2 method lesson.
>
> **Landing verification pass (2026-08-22).** Before this file was landed, ~30 of its load-bearing
> `file:line` cites were re-read at the bytes with an instrument that prints line numbers, not from
> the notes that produced them: `0077:379-395` (the refusal payload, verbatim) · `0070:210-220` ·
> `0071:121-125` and `:450-460` · `0069:272` / `:340` · `0059:26` / `:82-91` / `:112` / `:118` /
> `:246` (member ordinal **9** confirmed by enumerating the `values(n,'clara.…')` list) ·
> `0058:483-487` (fifteen members, enumerated) · `0072:49-110` · `0004:81-86` · `0065:378-404` ·
> `0066:64` / `:81-85` · `0068:383-385` · `0080:225-236` / `:254-261` · `0083:306-307` ·
> `0002:334` · `0011:1133` · `render-worker.mjs:87-99` · `layout.mjs:176-188` ·
> `migrate.mjs:63-82` / `:243-252` · `eta-contract.test.mjs:172-190` · `registry.ts:40-72` ·
> `reportsApi.ts:1-12,55-62` · `PROGRESS.md:74-75,87-89,275-280`. **One correction was made** (S9's
> characterisation of `0081:65`). Everything else stood as written. A byte-verified source cite is
> still a source cite — the [PREDICTION] tags above are not discharged by it.

---

## 1 · What this survey covers, and the one thing it found first

F-A5's surface is four estates built by four different Wave-E lanes that have never been made to
meet: **delta** (metric definitions + the evaluator, `0058`-`0060`, `0084`), **epsilon** (the report
registry, the open→evaluate→seal chain, the claim gate, issue, `0065`-`0072`), **zeta** (render
jobs, the worker, the human doors, `0079`-`0083` + `packages/reporting-render`), and **eta** (the
agent's authoring wrappers, `0077`/`0078`, whose report-preview verb refuses BY NAME and names its
own fix in the refusal payload).

**The finding that reorders everything else: the chain has never been run.** Not "run and found
wanting" — never asked. `clara.reporting_periods` and `clara.period_snapshots` hold **zero rows**
on the live estate (`PROGRESS.md:87-89`), so no `report_run` has ever been opened; the dashboard's
`/reports` page is **read-only metadata with no door for any chain verb**
(`apps/dashboard/app/reports/reportsApi.ts:1-98`); and the seven-year byte-reproduction drill ran
against a **fixture**, never a real sealed artifact (`PROGRESS.md:74-75`;
`docs/ops/DR-render.md:111-130`). Digest **law 31** governs the reading: this is not a green estate,
it is an unasked one. TA-P14's clause (4) and its renderer clause are therefore not extra work
bolted onto F-A5 — they are the first thing F-A5 owes.

---

## 2 · The nine binding findings, at the bytes

*(Nine, not seven — the count is derived from the estate, not copied from F-A2's survey.)*

### S1 · The OBO blocker is three JWT bodies, one already-solved step, and one body that can never move

`clara._eta_request_report_preview_core` (`0077:379-395`) refuses every agent call with
`CLR10 / reason='report_preview_deferred'` and names its own fix in the payload:
`blocked_on = ['clara.open_report_run','clara.evaluate_fs_pack_v1','clara.seal_report_dataset']`,
`why = 'every verb in the open-evaluate-seal chain resolves a human JWT context'`, `fix = '... or
wait for the context-validated OBO evaluator core shipping as a new evaluator closure'`. Measured
against the bytes, that list is **right about three verbs and silent about a fourth that needs
nothing**:

| step | live body | context | what the OBO lane costs |
|---|---|---|---|
| open | `clara.open_report_run` | `_human_ctx(bookkeeper)` at **`0070:216`** | extract a `(firm, actor, obo, wake_kind)` core; thin human delegate |
| evaluate (pack) | `clara.evaluate_fs_pack_v1` | `_human_ctx` inside the minified body, **`0059:118`** | **cannot be recut — see S2** |
| evaluate (metric) | `clara.evaluate_metric_v1` | `_human_ctx(bookkeeper)` as its **first statement**, **`0059:112`** | **cannot be recut and cannot be CALLED from a wake lane** — S2 (v2). The wake-lane entrypoint is `_metric_eval_node_v1` |
| assess | `clara.assess_report_claim` | `_human_ctx(bookkeeper)` at **`0070:287`** | same extraction (it runs inside seal, and standalone) |
| seal dataset | `clara.seal_report_dataset` | `_human_ctx(bookkeeper)` at **`0070:449`** | same extraction |
| seal artifact | `clara.seal_report_artifact` | `_human_ctx(bookkeeper)` at **`0071:456`** | **NOTHING — already a thin delegate** |
| issue | `clara.approve_report_for_issue` | `_human_ctx(bookkeeper)` at **`0072:55`** | **stays human (TA-P14 (5); law 71)** |

`clara._seal_report_artifact_core(p_firm, p_actor, ...)` (`0071:121-125`) was built to take firm and
actor as ARGUMENTS so zeta's render worker could reach gate 1 with no JWT, and
`clara.seal_report_artifact` (`0071:450-460`) is nine lines of context resolution over it. **The
idiom F-A5 needs already exists in this estate, twice** — the second instance is
`clara._draft_report_spec_core(p_actor, p_firm, p_obo, p_wake_kind, ...)` (`0069:272`) with its
human door at `0069:340`, whose header states the rule verbatim: *"THE HUMAN DOOR. Signature
unchanged, so no caller moves; it resolves the context and delegates."*

### S2 · `evaluate_fs_pack_v1` is body-frozen for as long as the deployed closure stands

`clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)` is **member ordinal 9** of the
`evaluate_metric` **v1** frozen closure (`0059:246`). `clara.verify_evaluator_freeze()`
(`0059:248`) re-derives every member's `sha256(pg_get_functiondef(...))` and raises `CLR10` on any
mismatch, and **the migration runner executes that verifier after every run and fails the migration
on a raise** (`packages/db/scripts/migrate.mjs:63-82` declares the guard, `:243-252` runs it as a
rollback-only probe). So a chain-of-responsibility recut of the pack orchestrator does not merely
"move a pin" — **it permanently reds `pnpm db:migrate`**.

Three facts make this survivable, and all three are load-bearing for the design:

1. **The pack verb is an orchestrator, not the evaluator.** `clara.evaluate_metric_v1` (`0059:112`)
   resolves the stamped closure by a **hardcoded literal** — `evaluator_name='evaluate_metric' and
   version=1 and firm_id is null and deployed`. Anything that resolves that same row stamps cells
   with the **same** `evaluator_version_id`.
2. **RE-CUT (gate 2, blocker 1). `evaluate_metric_v1` is ITSELF human-bound and is ordinal 0 of the
   same frozen closure.** Its first executable statement is
   `c := clara._human_ctx(clara.role_rank('bookkeeper'))` (`0059:112`), and `0059:246` registers it
   at ordinal **0** beside `evaluate_fs_pack_v1` at 9. η states the consequence in its own words at
   `0077:369-375`: these bodies resolve `request.jwt.claims`, *"a wake credential carries
   clara.wake_secret instead, so each raises CLR04 before doing any work."* **v1 of this survey
   proved the PACK verb was an orchestrator and never read the entrypoint's first line** — the
   design built its whole OBO closure on calling it. **The estate's working wake-lane idiom is one
   level down:** `_eta_request_report_preview_core` resolves the `evaluate_metric` v1 row itself
   (`0077:160-164`), mints its own `metric_evaluation_contexts` rows, and calls the frozen
   **`_metric_eval_node_v1`** (`0077:226`) — never `evaluate_metric_v1`.
3. **Assess and seal each refuse a run whose cells span two evaluator versions** —
   `evaluator_version_ambiguous` at **`0070:323-326`** (assess) and **`0070:502-505`** (seal).
   *(v1 cited `0070:78-82`; that range is the `dataset_point_provenance_mismatch` raise inside
   `_tf_report_dataset_point_provenance` — a different wall entirely.)* Because of (1), a
   human-half/agent-half run still seals — provided the agent lane stamps the same closure row
   rather than minting its own metric evaluator.

**One nuance that does NOT rescue a recut.** The runner's evaluator guard protects only rows where
`deployed is true` (`migrate.mjs:68`), rows are **born undeployed**, and the flip is a **ceremony
act, never a migration act** (`clara._tf_evaluator_deploy_once`, `0060:93-100`; stated verbatim at
`0100:596-600`). But `verify_evaluator_freeze()` itself **loops every row regardless of `deployed`**
(`0059:248`) and the runner executes it whenever it exists (`migrate.mjs:243-247`) — so a moved
member body reds the migration either way. The `deployed` flag has a different consequence for
F-A5: `evaluate_metric_v1` resolves its closure with `and deployed`, so **the agent lane's new
closure row is born undeployed and needs its own ceremony flip** — a named human act (design §5,
Annex E P1).

### S3 · The definition-lifecycle trigger structurally forbids an agent approval

`clara._tf_metric_definition_lifecycle_v1` (`0059:26`, trigger
`t_metricdefinitionversions_lifecycle`) admits `draft -> firm_approved` only when
`new.approval_evidence @> '{"kind":"human_approval","version":1}'::jsonb`, else `CLR16 'approved
definition transition lacks positive evidence'`. TA-P1 C + digest **law 74** hand definition
self-promotion to Clara; this trigger says no, in the durable half, for every writer including a
future ungranted core. **The only two ways through are (a) extend the evidence closed world with an
agent kind, or (b) write `human_approval` for a machine act** — and (b) is a **law 22** fabrication
that would also defeat `0084`'s whole maker/checker apparatus. (a) is a CoR on a **live trigger
function** => a D1 write-quiesce item.

The four human lifecycle floors, for the sibling verbs to mirror: `propose_metric_definition`
(`0059:82`), **`approve_metric_definition` = admin** (`0059:85`), **`reject` = owner** (`0059:88`),
**`supersede` = owner** (`0059:91`). `0084:113` replaced the approve body (maker/checker re-aimed at
`proposal_evidence.on_behalf_of`; ARM 0 = the orphan-adoption arm, `0084:21-23`, `:35-46`).

### S4 · The definition-writer census is FOUR, asserted three ways, and one of them reads the LIVE catalog

- apply-time, delta's own security tail: `0060:476-483` — exactly four app-executable functions
  whose `prosrc` carries DML against `metric_definitions`/`metric_definition_versions`, **plus a
  `prosrc` sha256 pin on each of the four bodies**;
- apply-time, eta's prestate: `0077:87-96` (`expected 4`), re-measured in its tail;
- **live-catalog, in a test that runs on every estate suite:** `tests/eta-contract.test.mjs:172-190`
  asserts the sorted four signatures by name.

Eta's own header states the mechanism that keeps it at four (`0077:23-29`): **every INSERT lives in
an ungranted core**, the granted wrapper carries no DML text. F-A5's definition-lifecycle siblings
inherit that obligation exactly. *(`0060`'s sha pin on `approve_metric_definition` is a
point-in-time apply assertion; `0084` legitimately moved it and re-pinned in its own prestate —
`tests/delta-catalog-phase.mjs:394-403` records that reasoning in words.)*

### S5 · The issue wall loses its bite silently the moment a machine fills one end

`clara.approve_report_for_issue` (`0072:93-108`):

```
if clara.eligible_checker_count(c.firm) >= 2 then
  if c.actor = r.requested_by or c.actor = art.sealed_by then  -- CLR05 report_issue_segregation_violation
  v_mode := 'two_person';
else                                   -- solo: p_self_attestation required, else CLR05
  v_mode := 'solo_self_attested';
```

`clara.eligible_checker_count` (`0004:81-86`) counts active bookkeeper+ memberships **`and
u.is_agent = false`** — so the agent never inflates the threshold, and that half of TA-P6 A already
holds. What does **not** hold: `clara.open_report_run` writes `requested_by = c.actor`
(`0070:246-247`) and `_seal_report_artifact_core` writes `sealed_by = p_actor` (`0071:433-436`). An
agent-run pack puts `clara.agent_user_id()` (`0002:334`, the fixed uuid ending `00c1a7a0`) into
both, **so neither comparison can ever match a human approver** — the wall does not refuse, it
evaporates, and the human who directed the run regains the right to approve their own request. That
is verbatim the failure the sitting agenda called *"the sharpest one in this group"*
(F-A5-M-requested_by).

Three more bytes bind the repair: `report_runs.requested_by` is **`not null references
clara.users(id)`** (`0065:379`) — there is no NULL to fall back on for a self-run;
`issue_mode text check (issue_mode in ('two_person','solo_self_attested'))` (`0065:384`) is a
**closed world of two** with no `agent_prepared`, guarded further by `ck_rr_issue_paired`
(`0065:398-402`) and `ck_rr_solo_attested` (`0065:403-404`); and `_tf_report_run_lifecycle`
(`0066:413-425`) freezes **every** `report_runs` column outside the seven issue columns, so a new
identity column must be written at INSERT or added to that trigger's frozen list.

### S6 · `chart_kind` is validated at publish and then thrown away — N3 is a three-file change

- **Declared and closed:** `_validate_chart_spec_ast_v1` (`0068:327`) admits exactly
  `('line','bar','stacked_bar','area')` at `0068:383-385` and closes the six-key grammar.
- **Transported:** `clara.render_job_payload` (`0081:153`) ships `chart_spec_ast` whole
  (`0081:186-190`), so the kind DOES reach the worker.
- **Dropped:** `shapePayload` (`packages/reporting-render/scripts/render-worker.mjs:87-99`) copies
  `axis_policy`, `chart_spec_ast?.manual_bounds`, `points`, `resolved_thresholds` — and **not
  `chart_kind`**.
- **Ignored:** `renderChart` (`packages/reporting-render/lib/layout.mjs:310-378`) calls
  `barGeometry` (`lib/chart.mjs:239`) unconditionally and emits `rect(...)` bars at `:344-346`. The
  chart receipt it pushes (`:331-342`) records axis policy and thresholds and **not the kind**.

So N3 is: carry the kind (worker), branch on it (layout), add three geometries beside `barGeometry`
(chart.mjs), and put the kind in the chart receipt so the byte-reproduction story can name it.

### S7 · The sealed renderer already hardcodes the strings TA-P10 forbids

`layout.mjs:178-186` authors three literals in code — `"DRAFT — CHECKS FAILED — NOT FOR ISSUE"`,
`"DRAFT — NOT FOR ISSUE"`, `"UNCERTIFIED — NOT FOR ISSUE"`, and the boxed
`"UNCERTIFIED: this pack references at least one metric definition that has not been approved."`
— and they are burned into the PDF (`layout.mjs:136`, a rotated Typst background; `:149-153` the
box). Meanwhile epsilon's own rule, at `0066:64`, is *"The LABEL comes from versioned policy rows,
never a literal in a body or a prompt (E-R14)"*, and it is honoured only for the **claim status
label**, resolved from `clara.claim_policy_versions` at `0070:425-426`.

TA-P10 C-prime's watermark clause ("a versioned claim-policy row the owner signs once in three
languages; code carries no default string; a missing row refuses render") therefore lands on
**both** renderers, and it cannot land in the existing table: `claim_policy_versions` carries
`ck_cpv_four_ruled_states` (`0066:81-84`) — `status_labels` must hold **exactly**
`eligible/not_applicable/stripped/failed` and nothing else — plus
`ck_claim_policy_versions_curated check (firm_id is null)` (`0066:84`). A watermark row has nowhere
to go without weakening the CHECK that stops a claim label falling through to a default.

### S8 · The freeze wall reaches five shared primitives, and the snapshot mint

`clara.metric_input_producer_versions` v1 (`0058:483-485`) pins **fifteen** member bodies, and the
migration runner protects it **unconditionally** (`migrate.mjs:74-81`, `protectedRows: "true"` —
unlike the evaluator guard, which protects only `deployed is true` rows). The members include:

`clara.mint_metric_input_snapshot_v1(uuid,uuid[],text)` · `clara._metric_input_dataset_v1` ·
**`clara._human_ctx(integer)`** · `clara.role_rank` · `clara.jwt_sub` · `clara.jwt_firm` ·
`clara.actor_role_rank` · **`clara._reserve_op`** · **`clara._hash(jsonb)`** ·
**`clara._finish_op`** · **`clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)`** ·
`clara.verify_metric_input_snapshot` · two trigger bodies · `clara._active_document_filing`.

Consequences the design must obey rather than discover:

- **`clara._audit` may not gain a parameter.** TA-P4's model+version+rationale must ride the
  existing `audit_log.args jsonb` (`0002:276-288`; the table already carries `on_behalf_of` and
  `via_wake_kind`) or a NEW receipt relation — never an `_audit` signature change. *(A cross-item
  warning: F-A4's and F-A6's receipt work inherits it.)*
- **`clara.mint_metric_input_snapshot_v1` may not be recut**, so F5-OQ-3's agent snapshot mint must
  be a sibling that calls the same `_metric_input_dataset_v1` and registers its own **appended**
  producer-version row — the verifier's hardcoded roster branch keys on
  `producer_name='metric_input_snapshot' and version=1` and lets any other row through the generic
  member-hash check. **[PREDICTION]** — PR-0 replays an appended producer row on the rig.
- `clara._hash`, `_reserve_op`, `_finish_op` are callable but immovable: the op-key idiom is used
  as-is.

### S9 · The seal→render integration line was never landed, and no draft render is enqueued by anything

`0080:225-236` states the contract in words: *"Epsilon's `clara.seal_report_dataset` calls it with
ONE line, immediately before its final audit, inside the sealing transaction: `perform
clara.enqueue_render_job(r.id, 'pre_sign');`"* — and then, honestly, *"Until that line lands, Z4's
fallback sweep enqueues the same job from the leader within its cadence."* **The line never landed:**
a repo-wide search finds `enqueue_render_job` called from nowhere outside zeta's own estate. Its
only in-tree CALL is `0080:385`, inside the leader's fallback sweep — `0080:230` is the contract
stated in a comment, `0081:65` is a `to_regprocedure(...) is null` **existence** probe (not a call),
and every remaining hit is a zeta test calling it as the owner
(`packages/db/tests/zeta-render-queue.test.mjs`, `packages/db/tests/zeta-render-walls.test.mjs`,
`packages/db/tests/zeta-fixtures.mjs`)
— *the tests are the only thing that has ever exercised this door*. So today:

- a `pre_sign` render appears only when the leader's `clara.enqueue_missing_render_jobs(int)`
  (`0080:369-385`, granted to `clara_runtime` at `0080:400`) next runs;
- **a `draft_watermarked` render is enqueued by nothing at all** — no verb in the estate asks for
  one, which is why `_eta_request_report_preview_core`'s refusal names `draft_watermarked` as the
  kind it *would* have asked for (`0077:392`; the sibling refusal `report_preview_deferred` is at
  `0077:390` — both re-pointed at gate 2, v1 cited `:387`/`:386`);
- `enqueue_render_job` audits under `r.requested_by` as the acting identity (`0080:352`), so the
  identity written by S5's repair also decides who the render enqueue is attributed to.

The "render" leg of open→evaluate→seal→render is therefore **not a leg F-A5 inherits working** — it
is a leg F-A5 must close, in the seal core it is already recutting.

---

## 3 · The estate roster F-A5 touches

**Human verbs (all `clara_authenticated`-only; the epsilon census at `0072:243-330` asserts exactly
ten and asserts zero non-human EXECUTE on any of them):** `publish_house_style_version` (owner,
`0069:56`) · `publish_report_template_version` (**admin for `statutory`, bookkeeper for
`management`** — the branch is at `0069:121`) · `publish_chart_template_version` (bookkeeper,
`0069:219`) · `draft_report_spec` (bookkeeper, `0069:347`) · `open_report_run` ·
`assess_report_claim` · `seal_report_dataset` · `seal_report_artifact` · `approve_report_for_issue`
· `verify_report_artifact` (`0072:142`, a writing verifier that raises nothing).

**delta verbs:** `mint_metric_input_snapshot_v1` (bookkeeper, `0058:424`) · `create_account_set_v1`
(granted `0059:10`) · `propose/approve/reject/supersede_metric_definition` (`0059:82/85/88/91`,
approve replaced at `0084:113`) · `evaluate_metric_v1` (`0059:112`) · `evaluate_fs_pack_v1`
(`0059:118`) · `assess_metric_cell_independent_v1` (`0059:179`) ·
`record_metric_evaluation_attempt_v1` (`0059:190`) · `verify_evaluator_freeze` (`0059:248`).

**eta's agent surface (the precedent):** three ungranted cores (`0077:128/299/379`) and four
wrappers granted **only** to `clara_wake_interactive` with one `wake_fn_allowlist` row each for
`'interactive'` and never `'proactive'` (`0078:96/109/141/162`, grants+rows at `0078:184-197`).
Live chat carries all five eta tools: `chatTurn.v11.tools.ts:186/210/241/272` reached through
`buildToolsV12`'s import of `buildToolsV11` (`chatTurn.v12.tools.ts:49,322-325`), registry pin
`chatTurn: chatTurn_v12` (`registry.ts:46`).

**zeta:** `enqueue_render_job` (`0080:254`; kinds `('draft_watermarked','pre_sign')` only —
*"a signed original is retained and retrieved, never rendered"*, `0080:258-261`) ·
`enqueue_missing_render_jobs` -> `clara_runtime` (`0080:369`, `0080:400`) · the worker quartet
the claim, payload, fail and reap verbs + the dispatch pair -> `clara_runtime` (`0081:418-425`) ·
`complete_render_job` -> `clara_runtime` (`0082:266`) · the human doors `replay_render_inputs` /
`requeue_render_job(uuid,text,boolean)` -> `clara_authenticated` (`0083:306-307`, the third argument
being law 70's `p_accept_drift`).

**Tables and their closed worlds:** `report_runs` (state `('drafting','dataset_sealed','issued')`,
`0065:378`; `issue_mode` two values, `0065:384`) · `report_spec_versions` (state
`('published','superseded')`, `0065:348`; `draft_report_spec` inserts **`published` directly**,
`0069:324-329` — there is no separate publish step for a spec) · `report_artifacts` (kind
`('draft_watermarked','pre_sign','signed_original')`, `0066:269`; `ck_ra_kind_extension` forces PDF
for the last two, `0066:296-298`; one `pre_sign` and one `signed_original` per run, `0066:308-311`;
`storage_key` is **CHECK-derived**, `0066:290-291`, so no filename vector exists) ·
`claim_policy_versions` (S7) · `evaluator_versions` / `_members` (`0058:213`) ·
`metric_input_producer_versions` / `_members` (S8) · `clara.freeform_read_log` (`0002:308-315`, all
columns nullable, RLS-forced at `0002:487-493`) — F-A6's, and the sandbox's receipt substrate.

**Triggers:** `_tf_metric_definition_lifecycle_v1` (S3) · `_tf_report_run_lifecycle` (`0066:413`) ·
`_tf_report_dataset_seal_stamp` (`0066:390`) · `_tf_report_publication_freeze` (`0066:362`) ·
`_tf_report_dataset_point_provenance` (`0070:72`) · `_tf_report_dataset_reconstruct` (`0070:186`,
deferred to commit) · `_tf_render_job_lifecycle` (`0079:183`) · delta's eight integrity triggers
(`0060:93-322`).

**Dashboard:** `apps/dashboard/app/reports/page.tsx` + `reportsApi.ts` — snapshots via PostgREST,
sealed artifacts via PostgREST, the `snapshot_state` RPC, and **nothing else**; the file's own
header says it *"ships no signed-download door for it yet (finding 6: no fabricated link)"*
(`reportsApi.ts:57-60`).

**Runtime:** no report workflow exists (`packages/runtime/workflows/registry.ts:45-72`);
`reconciler-render.mjs:109` points a stranded render at `clara.requeue_render_job`.

---

## 4 · The closed-world censuses that break, or must be kept true by construction

| # | census | where | what F-A5 does to it |
|---|---|---|---|
| C1 | four definition writers, by signature | `tests/eta-contract.test.mjs:172-190` (**live catalog**) | **stays four** — all sibling DML in ungranted cores (eta's idiom, `0077:23-29`) |
| C2 | four definition-writer body sha pins | `tests/delta-catalog-phase.mjs:394-403`; `0060:479-483` | **unmoved** — no human lifecycle body is recut |
| C3 | ten epsilon verbs, `clara_authenticated` the only grantee, **zero** non-human EXECUTE on any of them | `0072:259-282`; `tests/epsilon-grants-phase.mjs:144-151` | **stays ten** — siblings are new names granted to the wake role; **no epsilon verb is ever granted to a wake role** |
| C4 | `clara_agent_ro` holds **zero privilege at all** on `report_runs`, `report_datasets`, `report_dataset_points`, `report_artifacts`, `report_claim_assessments`, `report_spec_versions`, `report_template_versions`, `metric_cells`, `metric_cell_periods`, `metric_input_snapshots` — per table AND by a live refused read | `tests/epsilon-grants-phase.mjs:163-173`; `0072:296-315` | **untouched** — TA-P4 A / F5-OQ-13's typed reads are SECURITY DEFINER verbs granted to the WAKE role, never table SELECT |
| C5 | the agent's reporting SELECT set is **exactly** delta's nine catalog tables | `tests/epsilon-grants-phase.mjs:153-160`; `0072:297-312` | **unmoved**, same reason |
| C6 | no granted function writes a curated reference table | `tests/epsilon-grants-phase.mjs:133-142`; `0067:219` | the watermark rows are **seeded by migration**, never by a verb |
| C7 | evaluator closure completeness, every member body re-hashed | `0059:248`, run by `migrate.mjs:243-252` | **extend-never-weaken:** a new closure row is APPENDED; no existing member body moves |
| C8 | metric-input producer closure, fifteen members, protected unconditionally | `0058:487`, `migrate.mjs:74-81` | same — an appended producer version for the agent mint |
| C9 | `wake_fn_allowlist` rows per kind; `ck_wake_credentials_kind_0011` / `_client_0011` | `0011:623-628` | F-A5 adds rows only; **the kind CHECK is F-A4's to extend** (TA-P5's new wake kind) — F-A5 consumes it |
| C10 | zeta's render-kind closed world `('draft_watermarked','pre_sign')` | `0080:258-261` | **unmoved** — the sandbox never enters the render-job lane |

---

## 5 · The N2 re-scan (TA-P14 clause 6)

N2 is a **lost record**: `PROGRESS.md:64` disposes "N2/N3 -> F-A5" but the finding's content is
gone. Per TA-P14 (6) the old id is **retired** and this survey IS its re-scan. What the re-scan
found in the reporting estate, registered anew as **R-N1..R-N5**, each with a home:

- **R-N1 — the watermark literals** (S7). Home: F-A5, PR-4 (renderer), after the drill.
- **R-N2 — the chart kind is dropped in the worker, not merely unimplemented** (S6). Home: F-A5 N3.
- **R-N3 — no human door exists for any chain verb, issue included** (§1). Home: F-A5, TA-P14 (2).
- **R-N4 — delta's window-blind policy resolution makes eta's preview core fail-closed on a FALSE
  refusal** (`PROGRESS.md:275-280`; `clara._tf_metric_cell_integrity` resolves policies with no
  effective-window filter, so a window-filtering core would `CLR11` every preview). Home: F-A5
  design cell; the honest posture (a false refusal, never a false preview) **stands** in v1.
- **R-N5 — the seal→enqueue integration line was never landed; no draft render is enqueued by
  anything** (S9). Home: F-A5, **PR-1**, inside the seal core recut. *(Trued at PR-1: this row said
  PR-2, which went stale when gate 2 moved the seal core into PR-1's D1 window — design §3.2's
  "render" bullet, §4 D1 #3 and §5's PR-1 line all put it there. **LANDED**: the core now carries
  `perform clara._enqueue_render_job_core(p_firm, p_actor, p_obo, p_wake_kind, r.id, 'pre_sign')`
  immediately before its final audit, inside the sealing transaction, exactly as `0080:225-236`
  states the contract in words.)*

**N3 is not lost** — it is the contract's own renderer clause and is designed here.

---

## 6 · What the survey did NOT find, said positively

- **No agent-side authority exists anywhere in epsilon or zeta today.** The census at
  `0072:259-282` is a positive read of that absence, and it is why F-A5 is additive rather than
  corrective.
- **No second computation of any reported figure exists.** One evaluator node
  (`_metric_eval_node_v1`, reached today by two entrances — `evaluate_metric_v1` on the human lane
  and η's preview core on the wake lane), one dataset payload recipe shared by sealer and verifier
  (`0070:44-56`, header: *"One recipe, shared by the sealer and the verifier so they cannot
  drift"*), one geometry library. TA-P11's one-architecture test is currently **passed**; F-A5's
  agent orchestrator adds a THIRD entrance over the same node, which is still one architecture and
  is the surface census C.4 watches.
- **No delete verb anywhere in this estate** (digest law 6): `report_runs` refuse DELETE
  (`0066:418-420`), `report_artifacts` are insert-once, definition versions are historical
  (`0059:26`, `CLR08`).
