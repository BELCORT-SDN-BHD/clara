# F-A4 PR-1c — double-review synthesis + fix order (2026-08-27)

*Conductor's synthesis of the two independent reviews of `f-a4/pr-1c` at frozen tip
`a035c58`: the Codex `gpt-5.6-sol` read-only adversarial pass (recorded on `main` in
`docs/plan/active/fa4-pr1c-codex-review-2026-08-27.md`, merged with PR #366) and the
fresh-context native opus lane, rig-instrumented, whose verdict this file is the in-repo
record of (§Native). Both verdicts: **FIX-REQUIRED**. This file is the single fix order
the build lane executes on this branch.*

## Codex HIGH-1 (the law-71 reading collision) — OUT OF SCOPE for this fix round

The owner ruling is still pending (see the Codex record's §Conflict). Both reviewers state
everything else is independent of it, so the fix round proceeds. **Nothing in this fix
order touches the five preparation wrappers' grants or allowlist rows.** Evidence relevant
to the ruling, recorded here without ruling: the native lane independently re-derived all
four law-71 walls at the live catalog (roster resolving 49/49, non-vacuous) and ran the
full bypass battery — forged-ctx calls at the ungranted cores, a live wake session reaching
for `settle_close_proposal` / `finalize_close` / its own brake — every attempt refused with
42501 or a typed CLR. The walls are exactly as the gated design specified.

## §Native — the native review's verdict (condensed record)

**FIX-REQUIRED — 2 HIGH, 3 MINOR, 7 notes.** Method: own instance-unique throwaway rig
(torn down after), a differential-control baseline DB, and a deploy-onto-existing at the
TRUE merge frontier (origin/main's 132 migrations incl. 0137, then the PR file as 0138 —
prestate held, tail passed, frontier 133). Estate suite 3144 tests / 3059 pass / 84 skip;
the single red is a Windows-host `spawnSync grep ENOENT` artifact, not a PR defect.
`pnpm lint` exit 0. Both bypass attempts run against the build rig (55977) and its own.

- **F1 (HIGH, = Codex HIGH-2 confirmed and broadened):** `_agent_close_receipt`
  (migration :1230-1237) — `on conflict … do nothing` then a read-back that selects
  `verdict` and never compares it; the comment at :1196-1198 claims a law-3 guard that was
  designed and never written. Reachable on **9 of 12 wrappers** (all six reads,
  `wake_propose_close`, `wake_abandon_close`, `wake_run_depreciation_catchup`); safe by
  differing subject on `begin_close`/`open_fy`/`mint_snapshot`. **Rig-reproduced both
  directions on both rigs** via the migration's own intended G.2 retry sequence:
  refused→acted returns `status='acted'` naming a REFUSED receipt (a durable act with no
  acted receipt — for the depreciation catch-up that is real journal entries posted with
  the ledger denying it); acted→refused returns the earlier ACTED receipt and the refusal
  leaves no trace. `wake_abandon_close` instead hits its own Tier-C wall at COMMIT (CLR08,
  full rollback) — that task can never abandon its run; a new task can.
- **F2 (HIGH, native-only — CI RED):** the three read CoRs make `adjustment_run_due` a
  thin delegate, adding a hop that pushes `_wdb_rerun_breach`'s unprovable
  `to_jsonb(e.collision)` out of the dashboard seam census's depth-2 closure
  (`apps/dashboard/app/shared/dbSeamCensus.ts` :161-197, `maxDepth = 2`; ledger
  `dbSeamCensus.bindings.ts` :42/:209). Differential-proven: the census test is green on
  the 0136 baseline, red with the PR applied, red at the true merge frontier. Deleting the
  `OPAQUE_READS` row just moves the failure to Direction 2 (measured) — patching the
  ledgers to the shrunken closure would be proof deletion, not a fix.
- **F3 (MINOR, = Codex LOW-9):** three battery cells send `set role …; <dml> … $1` as one
  parameterized query — extended protocol rejects it at Parse (42601, measured), so
  `assert.ok(err)` passes without the trigger ever firing
  (close-agent :427, settle-door :182, walls-census :319). The walls themselves are sound —
  the reviewer proved all six with separate statements against real rows.
- **F4 (MINOR):** four rungs of judgement logic ship with no cell that fires them —
  B3's `drawer1_not_clean`, B14's `reopen_correction_in_flight`, B13 arms 1/3
  (`fa_period_due`, `adj_period_due`). Grading: B13 arm 1 ACCEPTABLE to carry forward by
  name (needs a real FA register; the arm fails closed); **B3, B14, C-5 must close now** —
  C-5's ACTED catch-up path is the one place this limb writes to the books and is exactly
  F1's worst-case scenario, never driven.
- **F5 (MINOR):** the migration header (:96-97) promises six design-doc line re-cuts "in
  this train's PR"; the diff carries no docs change. All six verified still false at the
  live frontier; two are acceptance cells that can never pass as written
  (close-key-1 annex C-17/C-19 pinning the pre-recut `depreciation_run_due` prosrc).
- **Notes N1-N7:** T.5's "proven by a difference" computes no difference (:2598) · header
  says THREE deviations, numbers four out of order · §I.2 says "TWO new event types",
  inserts three (:2263/:2280) · x42-s5-helpers prose says FIVE bare-clock readers, array
  has six (:287/:319) · T.11 prints "(0 expected)" over the parked Slice-0 spike schemas,
  false on live (:2764) · T.1b2/settle-door S3 select the state CHECK by
  `like '%state = ANY%'` not `conname` · fa4c.D1(e) asserts zero against a possibly-empty
  table (non-vacuous only in suite order).
- **Passed (independently re-derived):** law-71 four walls + full bypass battery (above) ·
  all five CoR'd bodies byte-verified (answer bodies moved verbatim, statement order
  preserved, ACLs survived; `attest_close_exception`, `finalize_close`,
  `mint_wake_credential`, `wake_context`, `_close_gate_uncoded`, `_assert_due_read_ctx`
  sha-identical) · `p_from_proposal` provenance triple end-to-end · the settle door's
  floor/tenancy/op-key order (foreign id burns nothing) · Tier-C clean-path proofs (agent
  run refused CLR08 at COMMIT with zero receipts; human run commits) · placeholder
  normalizer refusal-only · allowlist diff exactly +12, ACL diff exactly +18, +44
  functions / +3 tables / +3 event types / +3 taxonomy rows and nothing else · S5.25 arm-D
  roster exactly the six declared names · wrapper 13's park honest (positive-absence cell
  reads `pg_proc`).

## The fix order (FIX-1..12; every wall change ships with a cell AND a mutant)

1. **FIX-1 (F1 / Codex HIGH-2) — the receipt read-back must prove the standing row IS
   this act.** Default form: after the `on conflict do nothing` read-back, compare the
   existing row's `verdict` (and the semantic fields — task, actor, rung vector) to the
   incoming act and **fail closed with a typed CLR refusal on mismatch** (raising inside
   an act aborts the transaction, so nothing durable can carry a lying receipt; a
   subsequent NEW task acts normally, matching the existing `wake_abandon_close`/R3.4
   semantics). **If** the design's G.2 contract genuinely requires same-task
   retry-to-act, use the alternative both reviewers allow: add `verdict` to the receipt
   unique key so a refused and an acted receipt coexist per op key and the read-back
   matches on verdict too. Check the design annex first, state the chosen form and why in
   the commit body. Either way `fa4c.G3`'s legitimate same-verdict replay stays green.
   **Required cells:** refused→acted (must now refuse or mint an honest acted receipt —
   never return the refused id under `status='acted'`); acted→refused (the refusal must
   leave a trace); the `wake_abandon_close` retry shape; and FIX-10's C-5 ACTED catch-up
   cell asserting the receipt census afterward (1 acted, honest verdict).
2. **FIX-2 (F2) — restore the seam census's reach past a pure-delegate hop.** In
   `apps/dashboard/app/shared/dbSeamCensus.ts`, make the emitted-closure traversal treat a
   pure delegate (a body whose answer is one nested call) as transparent rather than
   depth-consuming — or an equivalent that keeps `_wdb_rerun_breach`'s opaque projection
   inside the measured closure. **Both ledgers stay byte-identical** — do not touch
   `dbSeamCensus.bindings.ts`. Acceptance is the differential: census test green on the
   0136 baseline, green with the PR applied, green at the true merge frontier.
3. **FIX-3 (Codex MED-3) — Tier-C `close_runs` classification.** INSERT classifies as
   `begin_close` only when `state='in_progress'` with null terminal fields (else refuse);
   UPDATE handles every transition, not only `abandoned` (unknown transitions refuse).
4. **FIX-4 (Codex MED-4) — bind the Tier-C receipt match tighter:** firm + actor + task
   (+ transaction where derivable), not act kind + subject + verdict alone, so a
   pre-planted or foreign receipt cannot satisfy the wall.
5. **FIX-5 (Codex MED-5) — close the `SET CONSTRAINTS` schedule bypass:** a partial
   unique index over ACTED close-run transitions and/or a mirrored deferred trigger on
   receipt insert, so forcing the trigger immediate then inserting a second matching
   receipt cannot satisfy the one-receipt rule. Cell attacks with
   `SET CONSTRAINTS ... IMMEDIATE` exactly as the reviewer described.
6. **FIX-6 (Codex MED-6) — the bookkeeper floor on receipt reads must hold on the direct
   path.** Census the consumers first (dashboard, agent lanes, the gated reader), then
   either fold the rank floor into the RLS read policy or revoke direct SELECT in favour
   of the gated reader. Cell: a below-floor viewer must NOT read model/rationale/task
   metadata, and every legitimate consumer keeps working.
7. **FIX-7 (Codex MED-7) — `adopted` must prove its attestations.** `settle_close_proposal`
   verifies the required `attest_close_exception(p_from_proposal)` attestations atomically
   before marking `adopted` (or `adopted` becomes reachable only from the attest flow).
   Cell: settle-to-adopted with zero linked attestations refuses.
8. **FIX-8 (Codex MED-8) — proposal coverage + lifecycle serialization.** Unique
   `(proposal, check_key, item_key)`; a canonical-coverage guard (or the latitude
   documented in-code with a supersede rule that requires a real state change); a row or
   advisory lock in the lifecycle writers so attestation cannot race a
   concurrently-terminal proposal. Cells for the supersede-by-subset and the race.
9. **FIX-9 (F3 / Codex LOW-9) — true the three protocol-broken cells:** separate
   statements, real target rows, and assert the CLR08/CLR10 typed refusals — not
   `assert.ok(err)`.
10. **FIX-10 (F4) — close B3, B14 and C-5 now.** B3: one drawer-1 check forced off `pass`
    → the refusal path fires. B14: reopened-year-with-draft → gate 2 refuses, and the same
    `_close_gate_drafts` predicate proves rung and `close_prep_due` clause (1) agree
    (TA-P11's claim). C-5: the with-authority ACTED depreciation catch-up through the
    12-iteration loop, journal entries verified and the receipt census honest (couples to
    FIX-1). B13 arm 1 stays parked BY NAME: add it to the migration header's carried-
    forward list for PR-2/PR-3 acceptance.
11. **FIX-11 (F5) — land the six design-doc line re-cuts in this PR**, exactly the lines
    the migration header (:96-97) enumerates, including the C-17/C-19 acceptance cells
    that pin the superseded prosrc.
12. **FIX-12 (Codex LOW-10 + N1-N7) — census honesty truing:** allowlist probes by exact
    `regprocedure`, constraint selection by `conname` (T.1b2, settle-door S3), policy
    assertions with arm expressions, T.5's difference actually computed (or the claim
    cut), header/prose counts trued (deviations, event types, x42 reader count), T.11
    asserts what is actually expected on live (the spike schemas hold a parked run —
    constraint 15), D1(e) gets a positive control.

## Verification protocol (before the PR goes up)

1. Full estate suite green on the rig (`clara-rig-fa4pr1c` at 55977 is up and yours) +
   `pnpm lint` + typecheck/build.
2. The FIX-2 differential (baseline / PR-applied / merge frontier — all green).
3. Every new or flipped cell re-runs its mutant AFTER the fix (the mutant law).
4. Then the fix diff goes back to the SAME reviewers for the targeted verification rung
   (the fix round is judgement logic — review law 1): the native lane re-verifies FIX-1/2
   with fresh positive controls; Codex re-reads the receipt path if available.
