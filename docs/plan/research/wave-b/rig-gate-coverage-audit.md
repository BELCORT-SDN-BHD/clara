# Rig-confined fault-gate coverage audit (2026-07-24, read-only)

> Post-deploy (ADR-036) audit of contract §4's **rig-confined fault gates** against the
> shipped test batteries (packages/db 179-cell 0017 battery + packages/runtime 482-test
> suite), plus the **static half of Gate W2**. Two independent sonnet-5 xhigh lanes,
> read-only; load-bearing claims re-verified by the orchestrator. This doc is the
> evidence base for the rig-gate close-out work; it ships with that PR.

## Fault-gate coverage map (strict grading: same code path ≠ same fault scenario)

| # | Gate (contract §4 wording) | Status | Evidence / gap |
|---|---|---|---|
| 1 | concurrent seed/answer races | **partial** | SEED half covered: `wb-k-approval.test.mjs:198` K5 two-session race (`raceOpeningApproval`, wb-fixtures.mjs:321). **ANSWER half missing** — no two-session race on `update_onboarding_plan`; O5 + plan-db CAS tests simulate staleness sequentially. Only two race drivers exist in wb-fixtures (`raceOpeningApproval`, `racePublishPages`). |
| 2 | failure-after-N-items resume | **missing** | No multi-item Wave-B writer test crashes after a subset of N and resumes. Root cause: the as-built reference (0017-asbuilt-reference.md:207,241) left the `op_receipts` `{'pending':true}` semantics **open by design** — all existing op_receipts tests (wb-r5, wb-k-approval, rig-invariants T12) replay already-finished receipts only. Needs a semantics ruling before a test can encode expected behavior. |
| 3 | interview cancellation/expiry | **partial** | Control-flow unit-proven for firm (11-Q) + client (13-Q) scripts (`wave-b-interview-firm.test.mjs:103`, `-client.test.mjs:209`) but **stubbed** ("no WDK engine, no DB" — EXPIRE/CANCEL are injected objects). Substrate rig-proven generically (`control-lease.test.mjs:128`, `rig-runtime-governance.test.mjs:152,190`). **No real-engine interview e2e exists** (no interview analog of `intake-e2e.mjs`). |
| 4 | stale-plan-after-park refusal | **covered** | `wb-o-lifecycle.test.mjs:104` (O4) + `:157` (O5) CLR06 typed refusal; `wave-b-interview-plan-db.test.mjs:118` re-read + retry-once. CAS staleness is time-independent, so no literal ≥48h park needed. |
| 5 | cross-firm SECURITY DEFINER probes | **partial** | Explicit firm-B-actor-vs-firm-A-data probes exist **only for the O-block** (`wb-o-lifecycle.test.mjs:171`, `wb-o-routing.test.mjs:46`, `wave-b-interview-plan-db.test.mjs:161`). 0017 ships ~56 DEFINER fns; **K-block (approve_opening_seed, draft_opening_item, seed_fixed_asset, supersede_opening_item, …), W-block (publish_wiki_page_version, retire_wiki_page), S-block (create_seeding_batch, sign_coding_rule, tick_*) have no targeted cross-firm probe.** (K10 `trial_balance_as_of` is INVOKER — out of scope.) |
| 6 | a large-corpus token-ceiling run | **partial** | Cap mechanisms boundary-tested at tiny synthetic budgets only (max_page_bytes=64, max_pages_per_client=2, packs of 2–3 tiny pages; F-M13 9MB refusal is metadata-only). **No run at realistic volume** proving ranking/selection/ceiling at true scale. |
| 7 | v25 upgrade with parked runs + rollback preflight | **missing (as a rig test)** | No test stages parked older-version runs across a version cutover, and no executable non-terminal-run rollback check exists — the freeze-lint is static-only. **Verified nuance:** the rollback preflight EXISTS as runbook SQL (wave-b-ceremony-runbook.md:18,87) and ran live in the WB-R18 ceremony ("2 covered runs" post-verify) — the gap is the tested-mechanism form, not the mechanism's existence. |

Auditor confidence: HIGH on 2/4/7, MEDIUM on 1/3/5/6 (grading-strictness judgment
calls). CI genuinely executes both rig suites against ephemeral postgres:17
(CLARA_RIG_DB=1), so new rig tests are CI-real. Gates 1 and 2 share the op_receipts
pending mechanism — if gate 2's semantics get ratified, re-check gate 1's grading.

## Gate W2 static audit (authority boundary, code half)

**Verdict: two letter-of-invariant hits, both the same ratchet-born mechanism; the
money core is clean.** 90 authority fns checked across 0001–0017 (including all ~25
patched via `do $cor$` pg_get_functiondef blocks, read individually); full clean list
in the audit output. Runtime side: frozen workflow bodies have zero wiki references
(regression-asserted in `wave-b-chatturn-v7.test.mjs:208` / `wave-b-autodraft-v3.test.mjs:185`);
the only wiki read paths are the projection consumer (own LISTEN/advisory-lock
connection) and the v7/v3 `'wiki_coding'` pack tool with the purpose pinned via
`z.literal` and the write-floor re-fetch hardcoded to `'coding'`.

**Findings (the [R2-F2] carve-out — needs an owner ruling to ratify or rework):**

1. `clara.approve_wrong_client_correction` (book-correction approval, DEFINER; patched
   by 0017 at 0017_wave_b.sql:1883-1884) calls `clara._assert_filing_wiki_unreferenced`
   (0017:1808-1845) which SELECTs `wiki_pages` / `wiki_page_citations` / `wiki_page_refs`.
2. `clara.retire_document_filing` (filing-lifecycle write, DEFINER; 0017:1860-1861)
   calls the same helper.

Nature: an **EXISTS-only referential-integrity refusal** (CLR10
`active_wiki_document_reference`) protecting wiki provenance from a filing retire —
it cannot feed wiki content into any figure, so the invariant's *spirit* holds. It is
self-verified by 0017's own R2-F2 tail battery (0017:5595-5618) but **omitted from the
migration's "wiki must never enter authority" exclusion loop (0017:5945-5967)** and
named in no doc as an exception (ratchet-r3-memo.md:25 discusses R2-F2 only as lock
choreography). ~~Recommendation: ratify the narrow exception~~ **SUPERSEDED by ruling
WB-R21 (ADR-037): the veto is a boundary defect scheduled for removal in the 0019
wiki-boundary migration (event-driven projection-side STALE marking); Gate W2 runs
interim with exactly these two call sites as known deviations (closed set).**

Informational, not a hit: `get_context_pack` v4's `'wiki_coding'` block is a read/
context fn, whitelisted by 0017's own granted-function closed-set check (0017:5990-6007);
`get_wiki_page`/`list_wiki_pages` use the dual jwt_firm/pack_consumer gate (0017:2378-2391,
R2-F5-checked). `run_client_lint`/`run_lint_all` read wiki but write only lint tables.
`clara.rule_sightings` is 0011 coding-rule data, not a wiki relation.

## Disposition (final — ruled in ADR-037, batch WB-R19..R27)

- Gates 1/5/6: test-only closures — designed + built as a PR-gated rig battery
  extension.
- Gate 2 [WB-R19]: CLOSED BY POLICY (two lawful multi-item shapes; same-intent retries
  keep their op_key until authoritative requery); the rig proof bar = a genuine
  mid-mutation K+1 fault + an S4 lost-ACK case.
- Gate 3 [WB-R20]: the cancellation half closes via the real-engine cancel e2e; the
  expiry half EXPLICITLY DEFERRED (cancellation is not expiry; future = an additive
  timer-vs-event _vN with a distinct typed state).
- Gate 7: rig test built (the real chatTurn v6→v7 pair + the executable rollback
  preflight).
- W2 carve-out [WB-R21]: boundary defect scheduled for removal (0019); interim
  known-deviation disposition, closed set of two.
