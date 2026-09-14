# #631 SPEC review — model egress obeys purpose authorisation + redacted execution trace

Branch `impl/631-work-egress-trace` @ `b541b38b`, base `impl/643-periodic-adjustments` final tip
`46440525`. `git log 46440525..HEAD --oneline` — 6 commits, non-empty. `git diff 46440525...HEAD
--stat` — 49 files, +7214/−35, migration `0195_work_egress_purpose_and_execution_trace.sql` (1750
lines). Verified live against rig631b (127.0.0.1:55450, `clara_631`) and `clara_rt_test`: both
`work-egress-authority.test.mjs` (17/17) and `work-trace-redaction.test.mjs` (17/17) pass as run in
this review, matching the worker's report exactly. `check-parts-parity.mjs` reproduced as REFUSED
live. `provider-eval/work-journal-eval.mjs` reproduced its skip line and exit 0.

**Bottom line: this is an unusually strong closure.** Every claim I spot-checked against the live
rig or the source held. I found no fabricated evidence and no implemented-but-wrong logic. The
gaps are the ones the worker already disclosed, correctly labelled.

## (a) §3 slice — items (1)–(8)

| # | Requirement | Status | Location |
|---|---|---|---|
| 1 | Sixth purpose `accounting_work` on 3 CHECKs + derived (non-document) activation basis | **Present** | `0195_….sql:233–306` (CHECKs, doc-sha conjunct, evidence CHECK), `:562–604` (`_accounting_work_egress_live`) |
| 2 | Recut `prepare_egress_dispatch` w/ `accounting_work` arm (doc-sha forced NULL), prestate/tail pinned; `consume_egress_dispatch` untouched | **Present** | `:632–713` (recut), `:190–208` prestate pin, `:1639–1645` tail non-regression pin. Confirmed live: `w631.consume.*` cells exercise the byte-unmoved consume verb |
| 3 | `clara.work_execution_traces`: no payload column, append-only+no-truncate, RLS forced, owner policy + `clara_authenticated` firm-scoped SELECT, zero runtime DML | **Present** | `:783–870`; tail census `(T.6)` at `:1662–1707` proves it by re-reading the catalog, not by trusting the DDL text |
| 4 | `record_work_execution_trace` — DEFINER, `clara_runtime`-only, positive task→work→firm/client bind, closed `observed_revisions` vocabulary refused by name | **Present** | `:885–1010`; live-verified via `631.trace.vocabulary`, `631.trace.binding` |
| 5 | `get_work_execution_trace(p_work)` — `clara_authenticated`, firm-scoped, ordered by seq | **Present** | `:1020–1050`; live-verified via `631.trace.read` |
| 6 | Recut `_record_journal_entry_core` additively on the 0194 body, gate before `_reserve_op`, CLR13 `egress_not_authorized` | **Present** | `:1240–1277`; live-verified via `w631.write.refused/prepared_only/other_run/invalidated/authorised` — no entry, no receipt, `op_receipts` count 0 on refusal |
| 7 | Retention on the existing prune lane | **Present** | `:1057–1076` (`prune_work_execution_traces`, same shape as `prune_trace_spans`) |
| 8 | Retire the `chatTurn_v1` census waiver | **Absent, honestly** | `packages/runtime/workflows/chatTurn.impl.ts:112` still calls the bare `clara.get_journal_entry`; that file is `@frozen`/`deployed:true` (part of the deployed `chatTurn_v1` closure) and #631 has no standing to edit it. Confirmed by direct grep: it is the *only* remaining source caller. The waiver (`packages/db/tests/fixtures/operation-census-waivers.mjs:57–81`) is still live and still needed — deleting it reds `operation-census.test.mjs`'s `waivers_unused == []` assertion. |

Item 8 is a genuine miss against the brief's literal instruction ("so the … waiver can retire —
retire it"), but there is no honest way to satisfy it from this branch: retiring it requires
editing a frozen, deployed file, which would violate the freeze discipline every other ticket in
this wave depends on. HANDOFF.md already schedules the fix as `chatTurn_v19`, built alongside #631
into wave 3. **SHOULD** — track as a condition of the wave-3 merge (v19 must retire this waiver),
not a defect of this branch.

## (b) Scope creep

None found. Every file outside the core slice is either (i) an explicit §3/§4 line item (CI wiring
in `.github/actions/db-live-gates/action.yml`, the `WORK_EGRESS_0195_COHORT` in
`packages/db/tests/rig-meta.mjs`, `check-parts-parity.mjs`/`parts-parity-exemptions.mjs`, the
manifest/registry repoint) or (ii) collateral required to keep pre-existing shared fixtures working
under the new gate — e.g. `relay-fixtures.mjs`'s `buildFirm` now calls
`acceptPublishedLegal(owner)`, with the hunk itself explaining why: "From migration 0195 the
model-egress authority for `accounting_work` is DERIVED from exactly that fact plus an active
client … A rig firm without it would refuse every Work run for a reason unrelated to the cell under
test." That is exactly the right kind of change for a branch that widens a gate every existing test
must now clear.

## (c) Implemented but wrong

None found. I specifically hunted for a manual-JE regression (does every posting — including a
human-typed "manual" journal entry — now require a model-egress authorization even when no model
composed the basis?) since `workRoutes.ts:14–17` documents that *every* admitted JE, manual or
agent-composed, is posted "seconds later by a claraWork … run" — i.e. through the same agent
segment and hence the same gate. This is consistent with the pre-existing architecture (there is no
separate non-agent posting path), the activation basis is designed to be ambient (no per-client
switch, synthesised on first dispatch), and `manual-journal-walk.spec.ts`/the 3431/3431 web suite
the worker reports covers it. Not a defect.

## Six TDD seams

| # | File | Present | Asserts the seam |
|---|---|---|---|
| 1 | `packages/db/tests/work-egress-authority.test.mjs` | Yes, 17 tests | `granted`/`doc_sha`/`inactive`/`foreign`/`superseded`/`revoked` (prepare); `once`/`rebind`/`ttl`/`revoked` (consume); `wrap.binds`/`wrap.unknown`; `write.refused`/`prepared_only`/`other_run`/`invalidated`/`authorised`. **Live-verified 17/17 pass** against rig631b in this review |
| 2 | `packages/runtime/tests/work-trace-redaction.test.mjs` | Yes, 17 tests | Nested NRIC/bank/email/MY-phone/JWT/bearer/DSN/api-key planted at depths 1–7 inside arrays of objects (`SECRETS`/depth-1..7 fixture); digest-of-redacted-form (`631.redact`/`631.trace.persisted`); closed-vocabulary refusal by name (`631.trace.vocabulary`); phase/outcome vocabulary (`631.trace.phases`); replay idempotency (`631.trace.replay`); foreign-authorization drop (`631.trace.authority`); bookkeeper-floored firm-scoped read (`631.trace.read`); bounded prune (`631.trace.prune`); estate-wide leak probe (`631.trace.leak_probe`). **Live-verified 17/17 pass** against `clara_rt_test` in this review |
| 3 | `packages/runtime/tests/work-bundle.test.mjs` (extended) | Yes, +6 tests | Digest pin vs literal; envelope names v3 ids/text/same budgets, no vendor name; `buildClaraWorkToolsV3` returns exactly `{list_accounts, record_journal_entry, ask_question}`; negative control — a tool-shaped JSON declaration (`transfer_funds`) planted in `memo` **and** a line `description` adds no key and the recording tool's `.strict()` schema refuses an injected field |
| 4 | `packages/runtime/tests/work-egress-e2e.mjs` | Yes | Leg A: one entry, one receipt, `dispatch→model_call→tool_call→settle` on one run id, authorization consumed exactly once, human read returns every row with no `payload` key. Leg B: revoke after a warm prepare → admission still 202, Work refuses `egress_not_authorized`, no entry/receipt, no `model_call` trace row at all, retry mints a new run and refuses identically with no vendor name in the face. Leg C: the `world-e2e.mjs` leak probe widened to `work_execution_traces` with the full PII set. (Verified by source read and the CI wiring in `db-live-gates`; not re-executed live in this review — it needs the full relay/app harness, which the worker's report already ran with matching PASS lines) |
| 5 | `apps/web/e2e/journal-work-walk.spec.ts` + `apps/web/tests/journal-refusal-roster.test.ts` (extended) | Yes | `work-diagnostics.tsx` implements five faces (loading/empty/partial/denied/unreadable) with unit coverage in `work-diagnostics.test.tsx` (incl. `631.web.diag.partial`, `631.web.diag.faces`); step table has its own `role="region"` viewport so the page never scrolls sideways at 320px; `journal-refusal-roster.test.ts` asserts the `egress_not_authorized` face end-to-end (DB raises it → v3 classifies it `refusal`, not the inherited `state_changed` → `work-detail.tsx` renders an owner-facing title/body → the copy names the agreement, never a provider) |
| 6 | `packages/runtime/tests/provider-eval/work-journal-eval.mjs` | Yes | Gated on `CLARA_PROVIDER_EVAL=1` + a real key; **re-run live in this review** with neither set → `SKIPPED — CLARA_PROVIDER_EVAL is not 1`, exit 0, and names `LOCAL-SCRIPTED` as the real evidence class for this lane |

## Specific checks requested

- **`prepare_egress_dispatch`'s `accounting_work` arm, "unknown" uniformly.** Confirmed: doc-sha
  supplied → unknown (`:668–670`); inactive client → unknown via `_accounting_work_egress_live`
  returning `live:false` (`:576`); superseded legal version → unknown, since the join requires the
  *current published* version specifically (`:580–596`); foreign/nonexistent client → unknown,
  byte-identical (`w631.prep.foreign`, live-verified). "Second consume" and "after TTL" are
  properties of `consume_egress_dispatch` (unchanged, byte-pinned), not of `prepare_egress_dispatch`
  — the brief's own §4 seam-1 text draws that same line; both are covered (`w631.consume.once`,
  `w631.consume.ttl`), live-verified.
- **`_record_journal_entry_core` without a consumed authorization.** Confirmed CLR13
  `egress_not_authorized`, no entry, no receipt, `logical_op_id` unspent — `w631.write.refused`
  asserts entry/receipt counts unchanged and `op_receipts` row count 0, then proves the identity is
  genuinely unspent by authorising the same run and posting successfully on it. Live-verified.
- **`consume_egress_dispatch` byte-unmoved.** Confirmed: prestate (`:203–208`) and tail (`:1640–1645`)
  both pin its `prosrc` sha256 to the pre-0195 value and raise CLR10 if it drifted.
- **Trace rows dispatch→model_call→tool_call→settle, `observed_revisions` closed vocabulary incl.
  `knowledge_version`.** Confirmed in the table DDL (`:791` phase CHECK) and the writer's vocabulary
  array (`work-trace.mjs` `OBSERVED_REVISION_KEYS` = `knowledge_version, books_version,
  chart_revision, basis_digest, source_sha256, question_version`), matching the DB's own
  `c_keys` array in `record_work_execution_trace` exactly.
- **`record_work_execution_trace` binds task→work→firm positively and is `clara_runtime`-only.**
  Confirmed (`:955–962` join through `agent_tasks`/`accounting_work`; grant boundary tail `(T.7)`
  live-checks every other role is refused).
- **`get_work_execution_trace` firm-scoped for `clara_authenticated`.** Confirmed (`:1020–1031`
  `_human_ctx(role_rank('bookkeeper'))` + firm equality check; tail `(T.7)` proves no other role can
  execute it).
- **`buildClaraWorkToolsV3` fixed literal + injection negative cell.** Confirmed — see seam 3 above.
- **#737 pairs classify as the brief says.** Confirmed in `claraWork.v3.errors.ts`:
  `(CLR13,work_cancelled)→cancelled`, `(CLR13,work_settled)→refusal`,
  `(CLR13,egress_not_authorized)→refusal`, delegating every other pair to v2/v1 unchanged.
- **`client_id` on `work_status` parts.** Confirmed: `apps/web/lib/parts/types.ts:349` —
  `WorkStatusPart = { type: "work_status"; work_id: string; client_id?: string; status: string }`,
  optional so a v1 run's parts (no `client_id`) still parse.
- **Diagnostics faces + refusal face with no provider name.** Confirmed (see seam 5); the
  `egressRefusalPayload()` message and the e2e leg B both scan for `OpenAI/Anthropic/Azure/Gemini/
  gpt-/claude-/vendor` and assert none appear.
- **Negative "no AI-on switch" test.** Confirmed: `w631.prep.inactive` and the e2e leg B comment
  make the point structurally (the consent/activation pair does not exist until the *first
  dispatch* synthesises it — there is nothing to toggle before that, and nothing left to toggle
  after, since revocation only goes through the existing owner-revoke door). UI-28/UI-29 are marked
  REPLACED in the audit register, and the migration/tests spell that out verbatim.
- **The census waiver situation.** Addressed above (item 8). The honest resolution the worker
  states is correct and matches what I independently verified: retiring the waiver needs
  `chatTurn_v19` (already scheduled per HANDOFF.md), not a change #631 can make alone without
  editing a frozen, deployed file.

## Labelled findings

- **SHOULD** — the `chatTurn_v1` census-waiver retirement (brief §"Orchestrator decisions" and §3
  item 8) is not done and cannot be from this branch. Already tracked as a `chatTurn_v19`
  dependency in HANDOFF.md; make sure wave-3 integration does not close #631 as "waiver retired"
  without that companion change landing.
- **NOTE** — `check-parts-parity.mjs` REFUSES (reproduced live: `unclassifiable object spread at
  packages/runtime/lib/periodic-adjustment-basis.ts:73`). Confirmed by `git show
  46440525:…/periodic-adjustment-basis.ts` (not found) vs `41b48385` (#643's commit) that this file
  and defect are #643's, not #631's — it fails identically on both of #643's own tips. Not a #631
  regression, but it blocks CI on the merged branch as it stands; flag to #643's own review lane
  (r643-standards / r643-spec) rather than asking #631's worker to fix another ticket's file.
- **NOTE** — C88.11 descoped ("no temporary admin grant was needed") is a reasonable read: #631's
  slice never mints an admin grant, so the lint-watch positive control C88.11 asks for has nothing
  to attach to here.
- **NOTE** — AC5 (provider-eval never run against a real provider) is not a gap; it is exactly what
  the brief's own orchestrator decision asked for ("write it, run it in 'unconfigured → skip with
  named reason' mode, and say so"). Confirmed live.

## Closing line

The migration, the runtime closure and the web surface all hold up against direct re-execution on
rig631b and independent source reading; the one incomplete acceptance item (the census-waiver
retirement) is correctly diagnosed as blocked on a frozen file rather than glossed over, and the
one red gate in the tree (`check-parts-parity.mjs`) is #643's pre-existing defect, not #631's.
