# #631 — model/OCR/other egress obeys current purpose authorisation · FINAL REPORT

**Branch** `impl/631-work-egress-trace` · worktree `C:\Users\zhant\Desktop\clara-wt\631` · **clean**, never pushed, no PR. **HEAD `b541b38b`.** Mine, on #643's final tip `46440525`:
`892bb1b7` feat(db) 0195 · `2f189c00` feat(runtime) claraWork_v3 + capability registry + trace writer · `b152213d` test(runtime) World e2e + CI leg + provider-eval · `720a8d17` merge #643 final · `9b4d8a6a` feat(web) Diagnostics + refusal face + walks + docs · `b541b38b` test(runtime) control-work-cancel dispatch.

**0195's core pin, as finally used: `eca58b99c45b53fe3c36dcd1b238a1d94b2b8c01a305e8debc4f0a6ca03d4ade`** — re-derived from the **merged** 0194 file text (recipe validated by first re-deriving the old `bebee4e4…` from `06637a8b`); SECTION 12's recut regenerated from the merged body with the `#631` insertion re-applied, not hand-patched.

## THE ACTIVATION ASSUMPTION — **the owner must confirm this**

Verbatim in 0195's header, ARCHITECTURE §10 and here:

> Authority for `accounting_work` = **(a)** the firm's current accepted Terms **and** DPA — an **active OWNER** holding a `clara.legal_acceptances` row for the **current published** version of both kinds (0185/0187) — **and (b)** the client being **active**.
> **Revocation** = a newer legal version published and unaccepted; the client inactive/archived; an explicit owner withdrawal via the existing `clara.revoke_client_egress_purpose`; or, at the write, the initiator losing firm membership.
> **"Exhausted"** ≡ consumed or TTL-expired; **no quota**. **No per-client "AI on" switch** (UI-28/UI-29 REPLACED); the normal path needs **no** manual `grant`/`activate`. One coarse token.

Two consequences: the consent/activation pair is **synthesised on first dispatch** from the legal acceptance (`legal_acceptance_id` records it; `evidence_document_id` NULL behind a purpose-discriminated CHECK — the other five purposes still require a bytes-verified document, and the owner `grant` verb is unchanged); and **an owner revoke is sticky** — prepare never re-mints over an existing consent row (follow-up 3).

## Per AC

- **AC1 registry — done.** `packages/runtime/lib/capability-registry.mjs` (capability → purpose, data class, model-bound?, scope; `clara-capability-registry/v1`, on every trace row). Structural half: `buildClaraWorkToolsV3` is a fixed literal — `work-bundle.test.mjs`'s negative cell plants a tool-shaped JSON declaration in the memo *and* a line description; roster unmoved, `.strict()` still refuses an injected key. C55.19/C83.21: negative half only.
- **AC2 two separate checks — done.** `clara.prepare_work_egress_dispatch(task, run)` derives the intent from the task; `consume_egress_dispatch` is **byte-unmoved** (prestate + tail pin its sha) and runs in its own committed transaction immediately before `agent.generate`. `_record_journal_entry_core` re-verifies independently, after the client check and before `_reserve_op`: CLR13 `egress_not_authorized`, no entry, no receipt, identity unspent (`w631.write.refused` then posts on that identity). Bound to **(work, run)** by the immutable `clara._work_egress_event_seq`, computed twice.
- **AC3 — done.** `clara.work_execution_traces`, one row per step, four phases, **no payload column** (tail T.6; `631.trace.no_payload_column`).
- **AC4 — done.** `work-trace-redaction.test.mjs` plants NRIC/bank/email/MY phone/JWT/bearer/DSN/api-key at depths 1–7 inside arrays of objects and scans **every stored column**; `input_digest` hashes the **redacted** form (two NRICs → same digest, so no oracle). Export off **by absence** (tail T.8). C77.7 closed.
- **AC5 — partial, honestly.** `tests/provider-eval/work-journal-eval.mjs`: opt-in, never in CI, `[provider-eval]`-labelled, scored not asserted. **Run only in its two skip modes** (no key here); both exit 0 with a named reason. Labels: LOCAL-SCRIPTED / LOCAL-PROVIDER / HOSTED.
- **AC6 — done.** `journal-work-walk.spec.ts` **19/19** (4 new cells): versioned identity behind a labelled disclosure; empty vs denied as different answers; the refusal face with a whole-page vendor scan; 320 px with the table in its own `role=region` viewport, page not scrolling, axe clean. Units: `work-diagnostics.test.tsx` 6/6, `diagnostics.test.ts` 7/7.
- **AC7 — done locally.** DB cells post under a real `interactive_client` credential OBO the initiator; the e2e drives real HTTP + a real Postgres World. **Hosted pending.**
- **UI-28/UI-29, H-17 verify-only — done** (`w631.prep.granted`). **C-20 recorded, not built.** **C82.2/C82.3 done** (`w631.consume.*`). **C88.12/C88.18 done.** **C88.11 descoped** — no temporary admin grant was needed.

## Tests and exact commands

Local only, Node 22.23.2. **Authoritative rig `rig631b` 127.0.0.1:55450 / `clara_631`** — from-scratch 184-migration chain over the **merged** 0194, seeded, 242 s. db runs use `node --test --test-concurrency=1 $GATES <files>` with `$GATES` the verbatim `--import …-preintegration-gate.mjs` list from `packages/db/package.json` `"test"`.

| run | result |
|---|---|
| db, 9 files: `work-egress-authority`, `work-journal-admission`, `work-journal-post`, `journal-work-evidence`, `work-cancel`, `work-question`, `periodic-adjustment`, `close-closing-stock-producer`, `operation-census` | **206 / 0 fail / 0 skip** |
| runtime unit, 12 files: `work-trace-redaction`, `work-bundle`, `work-journal-db`, `work-errors`, `work-errors-v2`, `work-routes-unit`, `control-work-cancel`, `control-work-question`, `l9-build-info`, `registry-view`, `periodic-adjustment-unit`, `reconcile-work-unit` | **171 / 0 / 0** |
| World e2e on `clara_rt_test` (rig631b): `work-egress-e2e` · `work-journal-e2e` · `work-cancel-e2e` · `periodic-adjustment-e2e` | **PASS** 3 legs · **PASS** 8 · **PASS** 9 · **PASS** 6 |
| `check-frozen-workflows.mjs` · `check-workflow-bundle.mjs` (after runtime build) · `check-worker-paths.mjs` | **OK** (273 frozen, additions-only vs origin/main) · **OK** · **OK** |
| `check-parts-parity.mjs` | **REFUSED — pre-existing, #643's (blocker below)**; with that file aside **OK** |
| `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3200 CLARA_E2E_NEXT_PORT=3201 CLARA_E2E_RUNTIME_PORT=3202 pnpm --filter @clara/web e2e journal-work` | **19 passed (1.7 m)** |
| `node scripts/run-tests.mjs` (whole apps/web suite) | **3431 / 3431 / 0 fail / 0 skip** |
| `pnpm typecheck` · `pnpm lint` | **exit 0** · **exit 0** |

`CLARA_RIG_ALLOW_RESET`/`…_ROLE_SWEEP` never set; no rig reset. #707/#693 appeared in nothing I ran.

**Added:** `work-egress-authority.test.mjs` (17) + `work-egress-fixtures.mjs`; `work-trace-redaction.test.mjs` (17); `work-bundle.test.mjs` +6; `work-egress-e2e.mjs`; the provider-eval lane; `work-diagnostics.test.tsx` (6), `lib/work/diagnostics.test.ts` (7), `journal-refusal-roster.test.ts` +5, `journal-work-walk.spec.ts` +4.
**Neighbours the recut moved** (all green): `wakeRecordJournalEntry` now dispatches by default (`egress:false` opts out); `buildWorkWorld`/`rig.buildFirm` accept the published legal texts as the owner; five raw-SQL posting sites do it by hand with the same run id.
**Two findings the e2e caught, fixed at the cause:** the wrapper returned `event_seq` as a jsonb **number**, which JSON parsers round — the consume then refused a dispatch it had itself authorised; and the settle trace supplied only an end instant, which `ck_work_execution_traces_ended` compared against the server's `now()` and dropped.

## Docs

ARCHITECTURE §5, §10, §11 rows **Agent 与宿主** and **准入与运行保障**; CONTEXT: **Capability registry**, **Purpose authorisation**, **Execution trace**. Hosted claims written as pending.

## Collisions vs 0188–0193 (read-only scan)

**None on any object 0195 writes.** 0190/0191 touch nothing of mine; 0188 mentions `accounting_work`/`operation_receipts` in prose; **0189** adds *reads* (`list_accounting_work`, `get_accounting_work_row`, `_work_run_attempts`) — no ALTER, and 0195 adds no column there; **0192** references `accounting_work` in reads/comments; **0193** names `_record_journal_entry_core` in **comments only**. Only 0194 recuts the core, and 0195 derives from its merged text. Name adjacency: 0191's `clara.document_capabilities` is the document lane's, unrelated to `lib/capability-registry.mjs`.

## #637 and the v19 worker

**#637:** re-run the drill **v2→v3**; v3's manifest entries are **not** deploy-locked (`--lock-deployed` after release). **Rollback is NOT free while 0195 is live** — a v2 image never prepares, so the recut core refuses every Work; roll back only with a migration relaxing the egress arm, or accept a parked lane. No old-run resume proof claimed.
**v19:** v3 emits `work_status` (now with `client_id`, #738), `work_result`, `work_question`. The **declarer set changed** — `check-parts-parity.mjs` lists `claraWork.v3.parts.ts` **instead of** `claraWork.v1.parts.ts` (one file per discriminant; v1's is frozen); the v3 shape is a strict superset, so the reader's `client_id` is optional. `confirmEntryStep` is v1's and already uses `get_journal_entry_for`. Roster unchanged; v19 must **not** mint a claraWork bundle. Roster pairs: `(CLR13, work_cancelled)→cancelled`, `(CLR13, work_settled)→refusal`, `(CLR13, egress_not_authorized)→refusal`, plus v2's `source_conflict`. The gate is on the **write**, not admission (leg B: admission still succeeds after a withdrawal).

## Follow-ups

1. **Per-operation purpose tokens** — also narrows the stated residual (a run whose first segment consumed still satisfies the write gate if a later consume is refused).
2. **`clara.consume_firm_egress_dispatch` (C-20)** — the firm-narrow family mints what nothing can consume. Real since 0123.
3. **A restore door** for a revoked `accounting_work` purpose.
4. **Trace export, separately authorised** — absent by design; needs its own purpose and audit.
5. **Runtime knowledge withdrawal door** (#644's deferral; this trace was its prerequisite).
6. **`lib/work-trace.mjs` and `lib/capability-registry.mjs` are now FROZEN** (imported by a frozen body) — a redaction hardening needs a new module or a v4 closure. Worth a ruling.

## BLOCKER, not mine

`check-parts-parity.mjs` — CI's `build` job (`ci.yml:193`) — **REFUSES**: `unclassifiable object spread at packages/runtime/lib/periodic-adjustment-basis.ts:73` (`...sharedShape`). That file is **absent on main**, introduced by #643's `41b48385`, and fails on both #643 tips (`06637a8b`, `46440525`). Not fixed: another ticket's file, and an exemption row would assert a review of their schema I did not perform.

## Unverified / not claimed

- All **hosted** evidence; the whole db estate suite and whole browser suite.
- **The `chatTurn_v1` census waiver did NOT retire and cannot from this ticket.** Measured: the only remaining caller of the bare `clara.get_journal_entry` is `chatTurn.impl.ts:112`, `@frozen`/`deployed`; claraWork v1/v2/v3 all use `get_journal_entry_for`. `operation-census.test.mjs` asserts `waivers_unused == []` and passes 10/10 — the waiver still suppresses a **live** finding, so deleting it would red the census. Retiring it needs `chatTurn_v19` or a deliberate grant.
- The **provider-eval lane has never run against a real provider**; only its skip paths are exercised.
- Retention is proven by a db cell (`631.trace.prune`), not by a live reconciler pass.
- The parts-parity observations were taken with #643's file temporarily moved aside and restored byte-identically (`git diff` empty).
