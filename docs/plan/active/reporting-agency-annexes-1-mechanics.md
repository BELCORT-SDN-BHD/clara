# F-A5 annexes 1 — the verb table, the vocabulary, the doors, the battery, the censuses

> **RENAMED AT LANDING, 2026-08-22 → `reporting-agency-annexes-1-mechanics.md`** (integrator act;
> the reason is in `reporting-agency-survey.md`'s banner). Cross-references spell the landed names.
>
> **v2, 2026-08-22 — gate 2 folded (record: `reporting-agency-gate-record.md`).**
>
> Companion to `reporting-agency-design.md` (**v2, 2026-08-22**). **Annex A** the verb table, the
> closed refusal vocabulary, the receipt shape and the human-act doors · **Annex B** the battery ·
> **Annex C** the censuses and roster pins F-A5 re-cuts extend-never-weaken.
> Sibling: `reporting-agency-annexes-2-record.md` (D-G). Estate: `reporting-agency-survey.md`.

---

## Annex A · The verbs, the vocabulary, the receipt, the doors

### A.1 · The wrappers and their cores — **enumerated, and the count is this list** (design §3.1)

*(v1 headed this "the sixteen" and listed eighteen — GM-9, applied to ourselves. The rows below are
**seventeen** new wrappers after the sandbox severance; `wake_export_sandbox_view` left with §3.6.
Every downstream count — design §3.1, PR-2, census C.2 — reads THIS list, never a number.)*

Every wrapper: `SECURITY DEFINER` · `set search_path = clara, pg_temp` · `wake_context()` then
`assert_wake_allowed` · blank `p_op_key` / `p_rationale` / incomplete `p_model` refuse before any
work · **no DML text in the wrapper body** · `revoke all … from public` then a single
`grant execute … to clara_wake_interactive` · one `wake_fn_allowlist` row per admitted kind ·
**never `'proactive'`**.

| wrapper | core | core is | live body recut? |
|---|---|---|---|
| `wake_open_report_run(client, spec_version, snapshot, period, rationale, model, op_key)` | `_open_report_run_core(firm, actor, obo, wake_kind, …)` | **extracted** from `0070:210` | **yes — D1 #1** |
| `wake_evaluate_report_pack(run, definition_version_ids, period_ids, snapshot, rationale, model, op_key)` | `_agent_evaluate_fs_pack_core(firm, actor, obo, wake_kind, …)` | **new** orchestrator over the frozen **`_metric_eval_node_v1`** (`0077:222-226`'s idiom) — **never `evaluate_metric_v1`**, which opens with `_human_ctx` (`0059:112`) | no |
| `wake_seal_report_dataset(run, chart_template_version_ids, rationale, model, op_key)` | `_seal_report_dataset_core(firm, actor, obo, wake_kind, …)` | **extracted** from `0070:437` | **yes — D1 #3** |
| `wake_assess_report_claim(run, rationale, model, op_key)` | `_assess_report_claim_core(firm, actor, obo, wake_kind, …)` | **extracted** from `0070:279` | **yes — D1 #2** |
| `wake_seal_report_artifact(run, kind, ext, sha256, byte_size, manifest, prior, rationale, model, op_key)` | `_seal_report_artifact_core(firm, actor, **obo, wake_kind**, …)` (`0071:121`) | **EXTENDED** — the estate's only `insert into clara.report_artifacts` (`0071:432`) now writes `directed_by`/`prepared_by_agent` and the receipt | **yes — D1 #6** |
| `wake_requeue_render_job(job, why, **accept_drift**, rationale, model, op_key)` | `_requeue_render_job_core(...)` extracted from `0083:169` | extracted; **`p_accept_drift` passes through** (TA-P1 C) | yes (non-D1: no live writer displaced mid-flight — **[PREDICTION]** P7) |
| `wake_approve_metric_definition(version, expected_formula_sha256, reason, rationale, model, op_key)` | `_agent_approve_metric_definition_core` | new | no (but see D1 #5, the trigger) |
| `wake_supersede_metric_definition(version, successor, reason, rationale, model, op_key)` | `_agent_supersede_metric_definition_core` | new | no |
| `wake_reject_metric_definition(version, reason, rationale, model, op_key)` | `_agent_reject_metric_definition_core` | new | no |
| `wake_create_account_set(key, title, members, …, rationale, model, op_key)` | `_agent_create_account_set_core` | new | no |
| `wake_mint_metric_input_snapshot(client, period_ids, rationale, model, op_key)` | `_agent_mint_metric_input_snapshot_core` | new; calls `_metric_input_dataset_v1`; **appended producer version** | no |
| `wake_publish_chart_template_version(key, title, spec_ast, effective_from, rationale, model, op_key)` | `_publish_chart_template_core(firm, actor, obo, wake_kind, …)` | **extracted** from `0069:214` — the validator, the effective-window refusal (`:236-239`), the supersede and the hash derivation exist ONCE (`0069:261-266`) | **yes — D1 #8** |
| `wake_publish_report_template_version(…, report_class, …)` | `_publish_report_template_core(firm, actor, obo, wake_kind, …)` | **extracted** from `0069:109`; **refuses `statutory`** (the `0069:121` floor branch) | **yes — D1 #7** |
| `wake_report_run_state(run)` · `wake_report_claim_state(run)` · `wake_report_artifact_index(client)` · `wake_metric_definition_index(client)` | four `stable`-shaped definer readers that each write a receipt row and return jsonb | new | no |

*(The four readers are not `stable` in the catalog sense — they WRITE their receipt, exactly as
`verify_report_artifact` writes its own (`0072:136-141`: "a verification that leaves no trace is not
evidence that anyone verified"). The estate has the precedent; F-A5 follows it rather than inventing
a receipt-free read.)*

**Repointed, not retired:** `wake_request_report_preview` (`0078:162`) keeps its name, grant and
allowlist row and delegates to a `draft_watermarked` run of the chain.
`_eta_request_report_preview_core` keeps its name and becomes the preview core. **Not a new
wrapper** — it already holds a grant, so the granted wake surface at the end is 17 + 1 = **18**.

**One more extracted body carries no wrapper:** `clara.enqueue_render_job` (`0080:254`) moves into
`_enqueue_render_job_core(firm, actor, obo, wake_kind, run, kind)` (**D1 #9**) so the seal core's
S9 enqueue audits as Clara-on-behalf-of rather than as the directing human (`0080:352`). The public
name stays the delegate the leader's sweep calls; **no new grant, no new allowlist row.**

**Severed with §3.6:** `wake_export_sandbox_view` + `_sandbox_export_core`.

### A.2 · The closed refusal vocabulary

**Tier A — authority and shape. RAISE.** `CLR03` no wake credential / kind not allowlisted ·
`CLR11` object not in your firm · `CLR10` blank op key (`invalid_request/op_key`), blank rationale
(`invalid_request/rationale`), incomplete model stamp (`invalid_request/model`) · `CLR04` a
capability the agent does not hold.

**Tier B — the lane's own typed refusals. RECEIPT + RAISE with `detail.reason`.** Every token below
is new, is forced non-vacuously by a battery cell, and never overlaps an existing one:

| token | raised by | means |
|---|---|---|
| `statutory_template_human` | `_publish_report_template_core` | `report_class='statutory'` is a human act (`0069:121`'s floor split) |
| `statutory_wording_human` | any core reaching `clara.statutory_wording` | never writable on this lane (law 71) |
| `canonical_migration_only` | the definition cores | `canonical` is not a state a verb may reach (law 74) |
| `self_run_pack_requires_independent_issuer` | `approve_report_for_issue` ARM 0 | a self-run pack's issuer must be a human who did not prepare (TA-P6 A (2)) |
| `report_issue_segregation_violation` | ARM 1 | **existing token** (`0072:98`), now also fired by `directed_by` / `art.directed_by` |
| `agent_prepared_attestation_required` | ARM 1/2 | an `agent_prepared` issue needs its attestation text |
| `definition_evidence_kind_unknown` | `_tf_metric_definition_lifecycle_v1` | the extended arm's fall-through — a fifth evidence kind refuses (law 36) |
| `agent_self_approval_incomplete` | the lifecycle arm | agent evidence missing `model` or `rationale` |
| `watermark_policy_absent` | the sealed render path (PR-4) | no effective `artifact_watermark` row for the locale — **renders nothing** (TA-P10 (3)) |
| `sandbox_authority_refused` | the receipt schema | a sandbox figure cited where an authoritative basis is typed |
| `chart_kind_unknown` | `renderChart` (N3) | a declared kind the renderer has no geometry for — refuses, never falls back to bars |
| `definition_directed_self_approval` | `_agent_approve_metric_definition_core` ARM 1′ | the approval wake's director is the draft's effective maker and a distinct checker exists (law 69; `0084:13-16`'s named hole) |
| `agent_self_approval_attestation_required` | ARM 2′ | solo firm, director = maker, no `p_self_approval_attestation` text (OQ-5's fail-closed default) |
| `evaluator_undeployed` | `_agent_evaluate_fs_pack_core` | its own `evaluate_fs_pack_agent` v1 closure row is absent or undeployed — the ceremony gate, mechanical (`0077:161-164`'s shape) |
| `pack_inputs_incomplete` | the self-run gate | a named missing input; a chase notice, never a pack |
| `not_evaluable` | any three-valued rung | law 68 — an absent input is REPORTED DISTINCTLY, never read as `pass` |

**Severed with §3.6:** `recipient_coverage_short` and the `sandbox_watermark` half of
`watermark_policy_absent` — they belong to the export item's own vocabulary.
**Retired, not reused:** `report_preview_deferred` (`0077:390` — v1 cited `:386`; `draft_watermarked`
is at `:392`, v1 cited `:387`). Its retirement is a battery cell — the token must no longer appear
in any live body.

### A.3 · `clara.report_agent_receipts` — the column list

`id` uuid pk · `firm_id` not null · `client_id` · `report_run_id` · `definition_version_id` ·
`act` text not null (a closed world of **fourteen**: `open_run`, `evaluate_pack`, `assess_claim`,
`seal_dataset`, `seal_artifact`, `approve_definition`, `supersede_definition`, `reject_definition`,
`create_account_set`, `mint_snapshot`, `publish_chart_template`, `publish_report_template`,
`typed_read`, `requeue_render` — `sandbox_export` **severed with §3.6**, and the world is extended
by migration when it returns) · `outcome` text not null
(`done` / `refused`) · `refusal_token` text (Annex A.2; NOT NULL when `outcome='refused'`) ·
`rung_vector` jsonb (three-valued: `pass` / `fail` / `not_evaluable`) · **`acting_identity` uuid not
null** (always `clara.agent_user_id()` on this lane — never a human) · **`directed_by` uuid** (the
OBO human, NULL on a self-run) · `via_wake_kind` text not null · `wake_credential_id` uuid not null
· `wake_task_id` text · `chat_turn_id` uuid · **`model` text not null** · **`model_version` text not
null** · **`rationale` text not null check (btrim(rationale) <> '')** · `op_key` text not null ·
`basis_citations` jsonb (query text + source for any narrative aggregate cited — TA-P10 (4);
the **narrative-authority wall** lives here — a sandbox figure named in a field typed as an
authoritative basis refuses `sandbox_authority_refused`) · `self_approval_attestation` text (ARM 2′)
· `at` timestamptz not null default now().

Append-only + no-truncate triggers, RLS forced, owner policy plus a **bookkeeper+ read policy**
(TA-P4 (4)). **`acting_identity` is NOT NULL and never a human id** — the honesty wall: this table
can never be made to say a person did what Clara did.

### A.4 · The human acts F-A5 manufactures, and the door each one gets (TA-P14 (2))

Derived from the sitting's **R-C human-act roster for F-A5**, not invented here. *"UI may be crude,
never absent"* — the door column says what PR-3 ships; anything richer is Wave G.

| human act | floor | the door PR-3 ships |
|---|---|---|
| **Issue the pack** (`approve_report_for_issue`) | bookkeeper+ **and** the `close_and_attest` key-2 capability (`0072:61-63`); ≥2 humans ⇒ approver ∉ {requester, director, sealer}; solo ⇒ attestation text | the `/reports` **issue card**: run + period, the **sealed `pre_sign` sha256 the approval must name** (`0072:87-92`), claim status, the `agent_prepared` disclosure, the attestation box, the reason field |
| **Archive the signed original** | bookkeeper+ | the **archive form** over `clara.archive_signed_original` (design §3.8): signed-PDF sha256, byte size, signature evidence, the `pre_sign` hash it answers |
| **Retrieve a signed original** | bookkeeper+, audited | a **retrieve** action on the run row → `clara.retrieve_signed_original`; it returns key + hash and **regenerates nothing** (`0080:258-261`) |
| **Consent to render drift** | **NO LONGER a reserved human act** — TA-P1 C devolved it (ADR-0074:33; `wave-f-contract.md:214`), and law 70's digest text is a mechanism description, not a reservation | the **requeue** card keeps the human's own drift checkbox; Clara reaches the same consent through `wake_requeue_render_job(p_accept_drift)`, receipted with model + rationale (TA-P4). *v1 hard-refused this and was narrower than the ruling — corrected, no dissent recorded.* |
| **Sign the watermark wording** (en/ms/zh) | owner, once | not a UI act — a migration seeded from the owner's returned text (§3.6.1, OQ-1) |
| **Publish a statutory template / house style; enter MASB statutory wording; mint a `canonical` definition** | admin / owner / migration-only | **no agent door at all** — the existing human verbs; statutory wording stays *manually extracted and manually verified* |
| **Grant the agent's new capabilities + allowlist rows** | owner, as a ceremony from merged `main` | not a UI act — PR-2's grants plus the PR-2→PR-3 **evaluator deploy-flip ceremony** |
| **Reopen a sealed/issued period** | key ③ (F-A4's) | out of scope here; named so it is not read as missing |
| **e-file to LHDN** | human, always (law 71) | out of scope; never automated |

*(The tenth act on R-C's list — minting the metric input snapshot — **stops being a human act** under
TA-P1 C and becomes `wake_mint_metric_input_snapshot`. Its human verb stays for the human lane.)*

### A.5 · The signed-original archive — the DB half (design §3.8)

- **`clara.archive_signed_original(p_report_run_id, p_sha256, p_byte_size, p_signature_evidence,
  p_answers_pre_sign_sha256, p_op_key)`** — a thin **human** door (bookkeeper+) over
  `_seal_report_artifact_core`, so the archive act has a named verb rather than a raw RPC call. It
  passes NULLs for `(obo, wake_kind)` like every other human delegate; `report_artifacts`'
  one-`signed_original`-per-run constraint (`0066:308-311`) is the wall that makes a second attempt
  refuse.
- **`clara.retrieve_signed_original(p_report_run_id)`** — an **audited retrieval**: it writes its own
  audit row (who asked, when, which artifact) **before** returning `storage_key` + `sha256`, and
  **regenerates nothing** — *"retained and retrieved, never regenerated"*, which `0080:258-261`
  already states as the render lane's refusal.
- **Storage + retention:** the `reports/` prefix keeps its no-UPDATE policy pair
  (`PROGRESS.md:69-71`); **seven years for artifacts and for every renderer image digest** (E-R14)
  is written into `docs/ops/DR-render.md` as part of PR-4. **UI is Wave G** (F5-OQ-12's ruled
  split), except the minimal doors of design §3.9.

---

## Annex B · The battery (design §6; contract-blind cells marked ▣)

**B.1 · The wrappers** (every cell runs over the **enumerated A.1 list**, never a count). No credential → CLR03 ▣ · a kind without its allowlist row → CLR03 ▣ · **a
`'proactive'` credential ATTEMPTING each verb is refused** ▣ *(the call is made and refused — a
roster read proves the row absent, not the door shut; F-A2's C.1 lesson)* · blank op key ▣ · blank
rationale ▣ · `p_model` missing a required key ▣ · **each wrapper body carries no DML** (catalog
cell) ▣ · replay under the same op key returns the stored receipt byte-identically ▣.

**B.2 · The OBO chain, positively.** A full agent run: open → evaluate → assess → seal dataset →
seal artifact → enqueue, on a rig client with a minted snapshot and two approved definitions, ending
at `dataset_sealed` with a `draft_watermarked` (and, when claim-eligible, `pre_sign`) render job
enqueued ▣ — **this cell goes RED against today's estate at FIVE points, not three** (`_human_ctx`
CLR04 at `open_report_run`, `assess_report_claim`, `seal_report_dataset`, `seal_report_artifact`'s
delegate, **and — the one v1 missed — `evaluate_metric_v1` itself at `0059:112`**) and is the proof
the closure landed. **Pre-ceremony twin:** the same call with the `evaluate_fs_pack_agent` row
undeployed refuses `evaluator_undeployed` ▣ *(the cell that makes §5's ceremony a gate rather than a
belief — it would pass vacuously under v1, which read that row nowhere)*. Negative twins: an unpublished spec version refuses CLR11 ▣ · a
snapshot from another client refuses CLR11 ▣ · a period the snapshot never captured refuses
`period_not_in_snapshot` ▣ (`0070:230-235`, unchanged behaviour through the new core).

**B.3 · The human lane is byte-unchanged.** The three extracted verbs are re-run through the HUMAN
door on the rig **before and after** the extraction and every returned payload, audit row and op
receipt is compared field by field ▣. *(This is the cell that catches R1; a diff read is not
evidence.)*

**B.4 · The evaluator identity.** Cells minted by `_agent_evaluate_fs_pack_core` — which calls
`_metric_eval_node_v1`, never `evaluate_metric_v1` — carry the **same** `evaluator_version_id` as
cells minted by `evaluate_fs_pack_v1` ▣ *(forced by reading `metric_cells.evaluator_version_id` from
both lanes and asserting equality, not by asserting the code path)* · **a wake credential calling
`clara.evaluate_metric_v1` directly still raises CLR04** ▣ *(the negative control that proves why the
node-level entrypoint is the design and not a preference)* · a run **half human-evaluated, half
agent-evaluated, seals** ▣ *(the cell that would go RED under a second metric evaluator, and
the operative proof of TA-P11's one-architecture test)* · `verify_evaluator_freeze()` returns ok
after the appended closure row ▣ · **`pg_get_functiondef('clara.evaluate_fs_pack_v1(...)')` hashes
to its `evaluator_version_members` row after every F-A5 migration** ▣ (S2's tripwire).

**B.5 · The issue wall, both polarities** (law 31 — the wall must be seen refusing AND admitting):
two-human firm, agent-prepared pack directed by Alice → **Alice's issue refuses**
`report_issue_segregation_violation` naming `directed_by` ▣ · **the ARTIFACT-side arm is forced
separately**: a pack whose RUN identities clear but whose sealed artifact carries
`art.directed_by = Alice` refuses too ▣ *(unforceable under v1, whose artifact columns had no
writer — the cell is the proof blocker 2 is folded)* · the same pack issued by Bob
**succeeds**, `issue_mode='agent_prepared'`, receipt naming Clara as preparer and Bob as sole human
signer ▣ · **the negative control that proves the wall is the reason**: the same pack with
`prepared_by_agent=false` and `directed_by=null` lets Alice issue as `two_person` ▣ · self-run pack
(no director) → ARM 0 refuses `self_run_pack_requires_independent_issuer` for a firm with no other
human ▣, and admits an independent human with the attestation ▣ · **solo firm**: one human issues an
agent-prepared pack with the attestation, mode `agent_prepared`; without the text →
`agent_prepared_attestation_required` ▣ · **the auto-upgrade**: adding a second active bookkeeper+
flips the same run's issue from the solo arm to ARM 1 with no data migration ▣ · **ARM-0 polarity**:
`directed_by` NULL is compared with `is not distinct from` and no arm silently falls through ▣
(law 68) · **the hash binding still bites on an agent-prepared pack**: an issue naming any hash but
the sealed `pre_sign` one refuses `artifact_hash_mismatch` ▣ · **the key-2 gate still bites**: a
bookkeeper without `close_and_attest` refuses CLR04, and **no wake role can reach the verb at all**
▣ (a live grant read, per table, not a group probe).

**B.6 · Definition self-promotion.** An agent draft self-approves to `firm_approved` with
`agent_self_approval` evidence ▣ · the same transition with `{"kind":"human_approval"}` written by
the agent core **is refused** ▣ *(the anti-fabrication cell — law 22)* · agent evidence missing
`model` → `agent_self_approval_incomplete` ▣ · a **human** approval is byte-unchanged through the
extended trigger ▣ · a fifth evidence kind → `definition_evidence_kind_unknown` ▣ · **`0084`'s four
arms still fire on the HUMAN lane** ▣ *(the exemption is the agent lane's own path, not a weakening
of `0084`)* · **the re-aimed wall, forced in both polarities**: Alice drafts on the human lane and
directs Clara to approve → `definition_directed_self_approval` ▣, and the SAME draft directed by Bob
approves clean ▣ *(the differential cell — a one-sided cell would pass on a wall that refuses
everything)* · Clara drafts under Alice's direction and Alice directs the approval in the same wake
→ refused ▣ *(law 69's mints-and-approves-in-one-call case)* · solo firm, director = maker, no
attestation text → `agent_self_approval_attestation_required` ▣, with the text → approves and the
receipt carries it ▣ · an **undirected** agent draft self-approves with no attestation ▣ *(the
fall-through: TA-P1 C is not narrowed)* · the agent **rejects a human's draft** and the receipt records `subject_author='human'`
▣ · `canonical` is unreachable from every agent verb ▣ · **the definition-writer census is still
four** ▣ (C1).

**B.7 · Reads.** Each typed reader returns its payload **and** commits a receipt row in the same
transaction ▣ · a reader that cannot write its receipt performs no read ▣ *(forced by revoking the
receipt insert in a probe transaction)* · **`clara_agent_ro` still holds zero privilege on all ten
report/metric tables, per table, with a live refused read** ▣ (C4) · the bookkeeper+ read surface
over `report_agent_receipts` returns own-firm rows and zero foreign-firm rows, with a foreign row
positively observed first ▣.

**B.8 · What survives the sandbox severance.** The export cells (watermark-in-the-bytes,
`recipient_coverage_short` both ways, the export record naming both client ids, "never writes
`report_artifacts`, never enqueues a render job") **move to the severed item's own battery** — they
are not dropped, they are not this train's. **Staying here, because their subject stays here:** a
sandbox figure cited as a posting amount / a KB fact / a formal cell is refused
`sandbox_authority_refused` ▣ ×3 · a narrative aggregate IS citable in a receipt with its query
text ▣ · a preview cell is invisible to `assess_report_claim` ▣ (`0077:114-117`, re-proven) · and
in **PR-4**, the sealed lane's own watermark cells: a missing `artifact_watermark` row for the
locale renders nothing, `watermark_policy_absent` ▣, and **the string is in the BYTES** — asserted
against the rendered PDF's extracted text, never against the layout source ▣.

**B.9 · The renderer (PR-4).** Each of `line`, `area`, `stacked_bar` renders its own geometry and
**the four kinds produce four different byte streams from the same points** ▣ *(the differential
cell — a self-referential "it rendered" cell would pass today)* · an unknown kind refuses
`chart_kind_unknown` ▣ · the chart receipt records the kind ▣ · **the double-render drill is
byte-identical per kind** ▣ · the three retired literals appear **nowhere** in the renderer source ▣.

**B.10 · The self-run pack (PR-5).** A month with no mintable snapshot yields a chase notice and
**no run** ▣ · a client with the hold switch on yields nothing ▣ · a replayed wake task does not
open a second run ▣ *(and the derived op key is asserted EQUAL across two ticks of the same month —
a key containing `now()` or a task id would pass a single-replay cell and fail this one)* · a
self-run pack stops at `dataset_sealed` and never issues ▣ · the run is **not** subject to `0084`
orphan adoption ▣.

**B.11 · The human doors (PR-3).** The issue card renders the sealed hash the approval must name,
read from `report_artifacts`, never recomputed in the client ▣ · `archive_signed_original` writes
exactly one `signed_original` per run and a second attempt refuses (`0066:308-311`) ▣ ·
`retrieve_signed_original` (A.5) writes its audit row **before** returning, and a retrieval whose
audit insert fails returns nothing ▣ · no door anywhere calls the render lane for a `signed_original`
(`render_kind_unknown` is provoked once, positively) ▣.

---

## Annex C · The censuses and roster pins, extend-never-weaken

- **C.1 (survey C1) — four definition writers.** `tests/eta-contract.test.mjs:172-190` is
  **re-run unchanged** and must stay green: F-A5 adds no granted body carrying definition DML. A
  new cell asserts the four **agent cores** are ungranted to all six application roles plus the two
  non-inheriting login shells (`clara_agent_read_login`, `clara_wake_write_login` — named
  explicitly, because a group probe cannot answer for them; `0077:398-404`'s method).
- **C.2 — the ten-verb ε census** (`0072:259-282`) is re-expressed as a **live-catalog test** in
  F-A5's own battery: the ten human verbs keep `clara_authenticated` as their only grantee, and
  **every wrapper NAMED in A.1** has exactly one grantee (`clara_wake_interactive`), with the
  wake/runtime/agent-role count on the ten still **zero**. **Written against the name list, never
  against a count** — v1's "the sixteen new wrappers" left `wake_assess_report_claim` and
  `wake_export_sandbox_view` outside the census that exists to prove the grant roster, one of them
  the law-28 egress surface. The test enumerates A.1 and fails if the catalog holds a `wake_*`
  reporting verb A.1 does not name, **or** if A.1 names one the catalog does not hold — both
  directions, because a roster that can only find extras cannot find omissions.
- **C.3 — the agent SELECT set** (`tests/epsilon-grants-phase.mjs:153-173`) is re-run unchanged and
  must stay at delta's nine. **If it moves, the design is wrong**, because typed reads were chosen
  precisely so it would not.
- **C.4 — the one-architecture census (new, TA-P11 A).** A test that enumerates, from the live
  catalog: every body containing arithmetic over `metric_cells`/`report_dataset_points` values, and
  asserts the set is exactly the frozen closure's members plus the two payload builders — so a
  second computation of a reported figure cannot appear without reddening a test. Plus the
  renderer-side twin: `chart.mjs` exports exactly the geometry functions the two entrances share.
- **C.5 — the freeze tripwires.** After every F-A5 migration the rig asserts
  `clara.verify_evaluator_freeze()` and `clara.verify_metric_input_producer_freeze()` return ok
  **and** that `evaluate_fs_pack_v1`'s and `_audit`'s live `pg_get_functiondef` hashes equal their
  recorded member rows (S2, S8). The migration runner already does this
  (`packages/db/scripts/migrate.mjs:243-252`); the battery asserts it **positively** so a future
  guard regression is visible as a red test and not only as a silent green.
- **C.6 — T17 roster pins.** Every new grant names its shipped consumer (ADR-0064/T17): each
  wrapper's pin names the chat tool or the `reportPack.v1` step that calls it. A grant whose
  consumer does not ship in the same train does not ship.
- **C.7 — the wake-kind rosters.** F-A5 adds allowlist ROWS only. The `ck_wake_credentials_kind_0011`
  / `_client_0011` swap belongs to **F-A4** (TA-P5's new kind) and is **extend-only after F-A2's
  D34 swap** — the existing enumeration rows stay byte-identical in meaning, which the rig proves
  rather than this file asserting. F-A5's PR-5 asserts the row set for the new kind is **exactly**
  the self-run verbs and nothing else (F-A2's D34 "exactly one row" cell, generalised).
- **C.8 (new, gate 2) — the identity-write census.** For every column an identity wall READS, a
  live-catalog test names its writer: `report_runs.directed_by`/`prepared_by_agent` ←
  `_open_report_run_core`; `report_artifacts.directed_by`/`prepared_by_agent` ←
  `_seal_report_artifact_core` (`0071:432`, the only INSERT). **A wall column with no writer fails
  the test**, which is the mechanical form of the blocker-2 lesson: v1 drew the artifact-side arm of
  ARM 1 and armed nothing, and no census could see it because none looked for writers.
