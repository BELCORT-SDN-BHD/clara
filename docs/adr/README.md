# Decision record — ADR index + the standing laws

This directory is Clara's decision log, one file per decision. It replaces
the former docs/PROJECTLOG.md and its five archive files, which were split here entry-by-entry
with **every entry's bytes preserved verbatim** — no reflow, no frontmatter, no edits.
Cite decisions by number exactly as before (`ADR-014`); the numbering is global and unchanged.

## The log's own law (carried forward from the deleted files' headers)

These conventions governed the append-only log and still govern this directory:

- **Append-only.** Supersede a decision with a NEW entry; never rewrite or prune an old
  one. Historical entries that name a since-changed fact (ADR-001's repo slug, for
  instance) are left intact deliberately.
- **Decisions only.** Build narrative, commit hashes and status do NOT belong in a decision
  record — those live in git, the plan, and `PROGRESS.md`.
- **Cite, don't duplicate.** The artifacts of record are `docs/product/PRD.md`,
  `docs/ARCHITECTURE.md` (+ Appendix A), `docs/design/PRODUCT_DESIGN.md`,
  `docs/plan/index.md`, `docs/audit/`, `docs/00-GATE-2-README.md`,
  `docs/phase2-research/`. A wave's contract/acceptance doc is the mechanism of record;
  the ADR minutes the ruling and points at it.
- **The fix for a log that outgrows a read is a split, never a rewrite or a prune.**
  This directory is that principle taken to its conclusion.

## How to read the status column

| Status | Meaning |
|---|---|
| **standing** | The entry's decision still binds specs, architecture or process today. |
| **discharged** | Executed and complete; no ongoing instruction. Any law it minted is lifted into the digest below and cited there. |
| **superseded** | Replaced by a later entry. *No ADR is wholly superseded* — every supersession in this log is clause-level, and is named in the hook. |
| *narrative* | Flag, not a status: the entry mixes its decision with build/status narrative. The decision stands; the state parts are superseded by `PROGRESS.md` and the live posture pins. |

## Index

| # | Title | Date | Status | Hook |
|---|---|---|---|---|
| [0001](0001-greenfield-rebuild-on-fresh-repo-and-project.md) | Greenfield rebuild on a fresh repo + fresh Supabase project | — | standing | The prior build stays frozen read-only audit evidence until Phase-5. Repo location superseded by 0021 (slug left intact by design). |
| [0002](0002-four-invariants-are-structural-db-guarantees.md) | The four firm-killing invariants are STRUCTURAL DB guarantees | — | standing | Cardinal. Everything judgement-flavored stays visibility-first (one exception since: 0065/E-R2). |
| [0003](0003-maker-checker-hard-gate-high-stakes-only.md) | Maker/checker: modelled always, hard-gate high-stakes only | — | standing | The agent can never satisfy a human sign-off. Scoped by 0071 to the surviving human acts (agentic lane exempt). |
| [0004](0004-kb-is-a-wiki-that-informs-never-decides.md) | KB = two-layer wiki that informs but never decides | — | standing | Made structural by WB-R6 (0032); the veto defect closed by 0039. |
| [0005](0005-counterparties-split-and-intrinsic-subledger.md) | Counterparties split + INTRINSIC same-transaction subledger | — | standing | The F3 law. Debt paid at 0052; the law binds. |
| [0006](0006-v1-scope-is-the-compliance-correct-core.md) | v1 scope = the compliance-correct core | — | standing | Incl. the MPERS cash-flow statement. Scope home is PRD §9 now. |
| [0007](0007-event-spine-context-packs-and-freshness.md) | Event-driven state layer + context packs + freshness | — | standing | The North-Star spine; realized by 0016/0017/0018. |
| [0008](0008-runtime-is-ai-sdk-plus-workflow-devkit.md) | Runtime = AI SDK 7 + Workflow DevKit, self-hosted | — | standing | Named fallback LangGraph JS + PostgresSaver; the provider seam stays. |
| [0009](0009-db-idempotency-keys-are-the-mandatory-floor.md) | Step memoization is NOT exactly-once; idempotency keys are the floor | — | standing | Proven by the Slice-0 spike's kill-after-commit test. |
| [0010](0010-binding-workflow-versioning-policy.md) | BINDING workflow-versioning policy (no run pinning) | — | standing | Every behavioural change is a new `_vN`; the freeze-lint enforces. |
| [0011](0011-tracing-stays-in-clara-controlled-storage.md) | Tracing: Clara-controlled storage; vendor export gated | — | standing | The C6 checklist (DPA · disclosure · PDPA) is still open owner/legal work. |
| [0012](0012-anti-misleading-green-ci.md) | Anti-"misleading-green" CI (test the REAL artifact) | — | standing | Real migrations on a throwaway `postgres:17`; deploy-onto-existing check. |
| [0013](0013-workspace-harness-relocated-to-rebuild-repo.md) | Workspace/harness relocated; prior parent doctrine deleted | 2026-07-17 | discharged | One-time cleanup, executed. |
| [0014](0014-runtime-host-is-fly.md) | Runtime host = Fly (a long-lived Node process) | 2026-07-17 | standing | Region `sin`, co-located with the Supabase project. |
| [0015](0015-write-authorization-is-lane-split-by-grant.md) | Write-authorization is lane-split by GRANT, not detected at runtime | — | standing | Agent-never-signs is the ABSENCE of an entry point — that clause superseded by 0071; the GRANT lane-split itself stands. |
| [0016](0016-event-spine-ratified-semantics.md) | The event spine's ratified semantics (Slice 3) | 2026-07-18 | standing | Clause (3)'s universal quantifier narrowed by 0017(10); its freshness asymmetry narrowed by 0018(11). |
| [0017](0017-durable-runtime-skeleton-ratified-semantics.md) | The durable runtime skeleton's ratified semantics (Slice 4) | 2026-07-18 | standing | Its "chat may never write books" ruling amended by 0018(3). Carries the canary watch. |
| [0018](0018-document-pipeline-ratified-semantics.md) | The document pipeline's ratified semantics (Slice 5) | 2026-07-18 | standing | Its managed-scanner FATAL law superseded by 0019(10). |
| [0019](0019-coding-floor-ratified-semantics.md) | The coding floor's ratified semantics (Slice 6) | 2026-07-19 | standing | Its S6-R1 RPR-only egress constraint superseded by WA-R2 (0022). |
| [0020](0020-dr-full-fidelity-profile-and-acl-baseline.md) | DR full-fidelity profile + the deployment ACL baseline | 2026-07-20 | standing | Production recovery is full-profile only; drill re-runs quarterly. |
| [0021](0021-repository-moves-to-the-company-org.md) | The repository moves to BELCORT-SDN-BHD | 2026-07-20 | discharged | Transfer executed. Standing residuals (PR-only gate, org-policy constraints) → digest. |
| [0022](0022-wave-a-daily-loop-design-contract.md) | The Wave-A daily-loop design contract | ~2026-07-20 | discharged · *narrative* | WA-R2 supersedes 0019's S6-R1; WA-R7 reopens the batch-approve deferral. |
| [0023](0023-wave-a-daily-loop-build-as-built.md) | The Wave-A daily-loop BUILD (as-built) | ~2026-07-21 | discharged · *narrative* | Its four open owner decisions were all resolved at 0024. |
| [0024](0024-wave-a-live-and-consent-evidence-provenance.md) | Wave A ships live; consent evidence goes full-provenance | 2026-07-21 | discharged · *narrative* | Migration 0014 supersedes 0012's owner-declaration weakening for evidence-backed consents. |
| [0025](0025-wave-a2-inserted-and-auto-post-law-scoped.md) | Wave A2 inserted; the auto-post law scoped; consent scoped to cross-border | 2026-07-21 | standing · *narrative* | "No auto-approve ever" → "no UNBOUNDED/agent-initiated auto-approve". WA2-R14 scopes the WA-D1 consent gate. The rule-as-posting-authority doctrine superseded by 0071. |
| [0026](0026-wave-a2-built-with-cross-model-hardening.md) | Wave A2 BUILT + MERGED; six-round cross-model hardening | 2026-07-22 | discharged · *narrative* | Minted the cross-model-review-before-money-merge law → digest. |
| [0027](0027-wave-a2-deployed-and-the-live-eval-ratified.md) | Wave A2 DEPLOYED + the §9 eval CLOSED | 2026-07-22 | standing · *narrative* | Ratifies the live eval as the standing acceptance gate for every wave. |
| [0028](0028-wave-a2-1-design-ratified-sst-watch.md) | Wave A2.1 design RATIFIED; purchase "input tax" corrected | 2026-07-22 | standing · *narrative* | SST has no input-tax credit; cross-model design debate becomes design-phase practice. |
| [0029](0029-migration-0016-built-and-merged.md) | Migration 0016 BUILT + MERGED; execution-truth ratified | 2026-07-23 | discharged · *narrative* | "Evidence, not authority" → digest. |
| [0030](0030-wave-a2-1-closed-on-gates-w-c-d.md) | Wave A2.1 CLOSED on Gates W/C/D; the 0016 ceremony executed | 2026-07-23 | discharged · *narrative* | Gates S/P split to a follow-on eval; both later re-scoped at 0062. |
| [0031](0031-queue-section-order-needs-you-first.md) | Queue section order: needs_you renders FIRST | 2026-07-23 | discharged | The rank-2 wrinkle it queued for 0017 has since landed. |
| [0032](0032-wave-b-design-ratified.md) | Wave B design RATIFIED (WB-R1..R18) | 2026-07-23 | discharged · *narrative* | WB-R6 (the wiki authority boundary) is lifted to the digest; the wave closed at 0046. |
| [0033](0033-migration-0017-built-merged-undeployed.md) | Migration 0017 (the Wave B DB heart) BUILT | 2026-07-23 | discharged · *narrative* | Minted the blind-lanes-need-filesystem-isolation law → digest. |
| [0034](0034-the-v25-runtime-lanes-built.md) | The v25 runtime lanes BUILT | 2026-07-23 | discharged · *narrative* | Merged undeployed behind the WB-R18 ceremony. |
| [0035](0035-wave-b-dashboard-surfaces-and-deploy-lock.md) | Wave-B dashboard surfaces; the freeze-lint gains the deploy-lock | 2026-07-24 | discharged · *narrative* | The freeze-lint's deploy-boundary refinement is standing → digest. |
| [0036](0036-the-wb-r18-ceremony-executed.md) | The WB-R18 ceremony EXECUTED: live 16→17, runtime v24→v25 | 2026-07-24 | discharged · *narrative* | `fly deploy` must run from the repo root → digest. |
| [0037](0037-ruling-batch-wb-r19-r27.md) | The nine open rulings adjudicated as batch WB-R19..R27 | 2026-07-24 | standing | WB-R22 (commit lane target), WB-R23 (typed consent), WB-R26 (drill cadence) and WB-R27 (`__Host-` + BFF before multi-user) all still bind. |
| [0038](0038-migration-0018-gate-k-domain-live.md) | Migration 0018 BUILT, RATIFIED, DEPLOYED same-day | 2026-07-24 | discharged · *narrative* | A PostgREST rpc probe must send `Content-Profile: clara`. |
| [0039](0039-migration-0019-wiki-authority-boundary.md) | Migration 0019 (the wiki authority boundary) DEPLOYED | 2026-07-25 | discharged · *narrative* | The runtime-image-first cutover law → digest. Closes WB-R21's boundary defect. |
| [0040](0040-migration-0020-typed-egress-consent-built.md) | Migration 0020 (typed egress consent) BUILT; Gate W2 closed | 2026-07-25 | discharged · *narrative* | Minted the load-bearing-verbs + fail-on-the-OLD-artifact review laws → digest. |
| [0041](0041-migration-0020-deployed-live-and-dark.md) | Migration 0020 DEPLOYED; typed egress consent live and DARK | 2026-07-25 | discharged · *narrative* | WB-R23 closed in production. |
| [0042](0042-migration-0021-the-human-counterparty-lane.md) | Migration 0021: the human counterparty lane | 2026-07-26 | discharged · *narrative* | `_resolve_counterparty` keeps its monopoly on identity resolution. |
| [0042a](0042a-ruling-batch-wb-r28-r30.md) | Ruling batch WB-R28..R30 *(not an ADR — see the note below)* | 2026-07-26 | discharged | WB-R28 superseded by 0062's Gate-P re-scope · WB-R29's date half by 0046 · WB-R30 discharged at 0045. WB-R29's "no delete verb exists" fact → digest. |
| [0043](0043-migration-0021-deployed-gate-k-closed.md) | Migration 0021 DEPLOYED; GATE K CLOSED on Bee Creative | 2026-07-26 | discharged · *narrative* | Names the open gap: the `opening_tb.line` producer still does not exist. |
| [0044](0044-belcort-high-stakes-threshold-rm100k.md) | BELCORT's high-stakes threshold raised to RM100,000 | 2026-07-27 | standing | Per-firm; the slice-era fixtures keep the RM10,000 default. |
| [0045](0045-gate-f-closed-rome-public-advisory-born.md) | GATE F CLOSED: Rome Public Advisory born through the durable 11-Q | 2026-07-27 | discharged | Firm `39008536` — the Gate-S synthetic sandbox. |
| [0046](0046-wave-b-closed-on-intent.md) | WAVE B CLOSED ON INTENT; the deferral register | 2026-07-27 | discharged · *narrative* | WB-R2's "no autopost rules from seeding, ever" → digest. Supersedes WB-R29's date half. WB-R2 moot at 0071 (the rules machine retires). |
| [0047](0047-extraction-slice-contract-ratified.md) | The extraction-slice contract RATIFIED v1.0 | 2026-07-27 | standing | Corroboration = two independent readers, not a model score; `request_reextraction` is human-invoked-only. Reader roster redefined by 0071 (the LLM witness pair); agreement-not-confidence stands. |
| [0048](0048-extraction-slice-closed-and-settlement-program.md) | The extraction slice CLOSED + the pre-Wave-C settlement program | 2026-07-28 | standing · *narrative* | The labelled-synthetic sanction (cited product-wide as "the ADR-048 sanction"). |
| [0049](0049-settlement-program-executed-gates-l-and-s.md) | THE SETTLEMENT PROGRAM EXECUTED: Gates L+S closed (synthetic) | 2026-07-28 | discharged · *narrative* | The vendor-binding design ratified; F3 ruled corroboration-not-option-B. |
| [0050](0050-the-first-production-autopost.md) | THE FIRST PRODUCTION AUTOPOST: RM350 posted unattended | 2026-07-29 | discharged · *narrative* | Minted: migration numbers claim at MERGE time; F2 is a consistency gate, never a selection key. |
| [0051](0051-wave-c-opened-and-c0-live.md) | WAVE C OPENED (WC-R1..R12); C0 built; migration 0036 live | 2026-07-30 | standing · *narrative* | WC-R5 (no multi-currency), WC-R7 (the chain is the second reader), WC-R10 (no employee counterparty) and the effective-dated-policy-table law all bind. |
| [0052](0052-wave-c-a-live-the-f3-debt-paid.md) | WAVE C-a LIVE: the AR/AP subledger + allocation; the F3 debt PAID | 2026-07-30 | discharged · *narrative* | WCA-R7 (high-stakes settlements park for a distinct checker) rides in the mechanism. |
| [0053](0053-wave-c-b-closed-and-accepted.md) | WAVE C-b CLOSED AND ACCEPTED: bank identity + ingest + matching | 2026-07-31 | discharged · *narrative* | Minted: unsigned single-column amounts are refused; `enter_bank_statement` binds a FILED document only. |
| [0054](0054-wave-c-closed.md) | WAVE C CLOSED: thirteen receipts at exact zero, the learn loop live | 2026-08-01 | discharged · *narrative* | Its F-1 finding was ruled at E-R12 (0065) and built in lane α; F-2 closed by 0058; F-3 documented. |
| [0055](0055-wave-d-opened.md) | WAVE D OPENED (WD-R1..R15); staff advances ruled B-lite | 2026-08-01 | standing · *narrative* | WD-R10 (no employee counterparty, the B-lite register), WD-R5/R8 (the authority doctrine) and WD-R11 (closing stock → Wave E) still bind. |
| [0056](0056-wave-d-a-closed.md) | WAVE D-a CLOSED: 0041 live; both real registers hold ZERO fixed assets | 2026-08-02 | discharged · *narrative* | The honest-empty precedent. Its real-half deferrals are partly discharged at 0062; the rest are open. |
| [0057](0057-wave-d-b-design-closed-at-v8.md) | WAVE D-b DESIGN CLOSED at v8 (WDB-G1..G16) | 2026-08-02 | discharged · *narrative* | G14's split-month law → digest. The design doc is design-time-only per 0058. |
| [0058](0058-wave-d-b-closed-as-a-four-slice-split.md) | WAVE D-b CLOSED as a FOUR-SLICE SPLIT | 2026-08-05 | discharged · *narrative* | Minted eight standing engineering laws → digest. `build/wave-d-b-0042`: NEVER MERGE. |
| [0059](0059-d-b2-closed-0045-live.md) | D-b2 CLOSED: 0045 LIVE; WAVE D-b COMPLETE | 2026-08-06 | discharged · *narrative* | The ceremony `statement_timeout` recipe + fail-closed-on-unknown armour law → digest. |
| [0060](0060-the-pre-beta-data-doctrine.md) | THE PRE-BETA DATA DOCTRINE | 2026-08-06 | standing | DATA-scoped only; mechanisms/process/secrets NOT relaxed; **expires at beta**. Narrowed by the §1 narrowing (see digest). |
| [0061](0061-review-intensity-stays-uniform.md) | REVIEW INTENSITY STAYS UNIFORM; risk-tiering DECLINED | 2026-08-06 | standing | The full ladder for every substantive change; Law 1 is the floor, not the ceiling. |
| [0062](0062-the-pre-e-clearing-day.md) | THE PRE-E CLEARING DAY: three structural gaps registered | 2026-08-06 | standing · *narrative* | Re-scopes Gate P **and** Gate S to operating runway; the ceremony now ends with `--lock-deployed`. Two of its three gaps are since discharged (0066, 0067). |
| [0063](0063-wave-7a-grilled-and-ratified.md) | §7-A GRILLED AND RATIFIED (7A-R1..R12) | 2026-08-06 | standing | Never re-grill. Registers the settlement-corroboration door; re-confirms three standing autopost refusals. |
| [0064](0064-wave-7a-closed-two-halves-acceptance.md) | §7-A CLOSED: the two-halves acceptance; four findings minted | 2026-08-07 | discharged · *narrative* | The four findings became F6–F9 and closed at 0066. The anti-circular floor exclusion → digest; moot at 0071 with the rules machine. |
| [0065](0065-wave-e-contract-and-invariant-1-amendment.md) | The Wave E contract (E-R1..E-R14) + **the invariant-1 law amendment** | 2026-08-08 | standing | E-R4 amends the cardinal invariant in all three of its homes. The contract is the mechanism of record. 0071 supersedes E-R5/E-R18 and amends E-R11 key ① in place. |
| [0066](0066-the-f6-f9-fix-batch-closed.md) | The F6–F9 fix batch BUILT, DEPLOYED and ACCEPTED | 2026-08-09 | discharged · *narrative* | Corrects E-R1's Gate-P expectation by measurement (seven documents, not four). "A wall that never refused anything…" → digest. |
| [0067](0067-lanes-alpha-and-beta-land.md) | Lanes α+β land; the CI gate survives on zero minutes | 2026-08-11 | discharged · *narrative* | The self-hosted runner is **private-repo only** → digest. Discharges the 0062 MSIC debt. |
| [0068](0068-the-evening-sitting-b3-ruled.md) | The evening sitting: B3 ruled; Gate-P defers to the Wave-G reset | 2026-08-11 | standing | The `ends_on` reopen variant + its named build trigger; supersedes 0066/PART-2's Gate-P reminder clause. |
| [0069](0069-harness-grand-refactor.md) | The harness grand refactor: the repo becomes the system of record | 2026-08-12 | standing | Repo-wins state authority; the docs-only review lane (the one ADR-061 amendment); ADRs per-file + this digest; pins hook-enforced; PROJECTLOG/REBUILD-PLAN dissolved. |
| [0070](0070-the-wave-e-night-run.md) | The Wave E night run: δ + the RS guard land LIVE; the whole-wave authorization | 2026-08-13/15 | standing · *narrative* | Thirteen rulings: the night run's nine (seal-currency, the numeral wall, machine-sealer attribution, the owner-only RS lift, η's deferred OBO chain, the op-key interpretation, same-family freeze imports, consumer-driven core splits, explicit effective dates) + the wave-close supplement's four — **guard polarity/ARM-0** (NULL principal is its own first arm; `is not distinct from`), **adoption semantics** (orphaned proposals approve only through the attestation door; maker/checker measures the DIRECTING human), **the isolation pin** (checksum-keyed per-migration, measured post-BEGIN; blanket raise refused), **requeue re-derives + immediate reap**. Field laws: guarded SUSET pin, session-pin nonce, CONFLICTING-silent-no-run, MAX_PATH staging, the wave presence-gate shape, number-migrations-IN-REPO, a-probe-that-cannot-say-NO. |
| [0071](0071-the-agentic-charter.md) | THE AGENTIC CHARTER: judgement becomes the posting authority; the LLM witness pair; the rules machine retires | 2026-08-18 | standing | Twelve rulings + one dissolution + two principles from the owner's vision grilling. Supersedes (exactly enumerated in-file): ADR-015's never-signs clause · ADR-025/laws 5+12 · law 4's agentic-lane reach + WCA-R7 · law 8's judgement half · ADR-047's roster + #25 · law 14's reader half · WB-R2 + 0064's anti-circular (moot) · E-R5/E-R18 · E-R11 key ① · the bank zero-grant law · PRD §8 budgets · ARCH §4.1 no-web. §6.1 and invariants (a)(b)(c) stand. Wave F re-scoped (`docs/plan/active/wave-f-contract.md`); laws 71-76 fold below. |
| [0072](0072-the-f-a2-rulings-and-the-corpus-sitting.md) | THE F-A2 RULINGS AND THE WAVE-G CORPUS SITTING: the old era is deleted; any-amount authority re-confirmed; the corpus splits into two tiers | 2026-08-20 | standing | Five ruling blocks. ① opener ⑥ ratified + **delete the old era** (execution tier retires inside Wave F · **the post-Window-A re-extraction is TWENTY documents, superseding the full-64 backfill** — so the legacy fallback arms' trigger falls through its own "whichever lands first" clause to the Wave-G reset, and F-A10 closes there · legacy DATA dies at that reset · the spike schemas DROP there too after a cold archive, so constraint 15's spike clause retires THEN, not now). ② high-stakes RE-CONFIRMED at any amount, no thresholds (ADR-0071/G1; the build's fail-closed ceiling on file as dissent; the HUMAN lane and ADR-0044 untouched). ③ **OQ-4 three exits** + **OQ-6 no category gate on the agent lane**, with the human lane's gate STANDING — mechanism of record is `docs/plan/active/f-a2-agentic-posting-design.md` §3.3.3/§4. ④ **R1 RULED** — a closing transfer is not turnover; Fix A to Track B, task #17 unblocked, OD-7 discharged. ⑤ the corpus sitting: two tiers (oracle + open-intake reality), OD-1 BEE two FYs + RS/RPR terminal single periods, OD-4 full permission (IC copy excluded · payroll tightest), OD-5 no second principal (B3's distinct-checker arm ships unexercised, named), OD-6/10 a WHOLE CLEAN DB on the live project (sandbox + fixtures not re-created — the RPA name collision dissolves), OD-11 the UX floor precedes the run, OD-2/8/9 defaulted. No standing law changes; 0071's scoping re-confirmed. |
| [0073](0073-ci-economics-overhaul.md) | THE CI ECONOMICS OVERHAUL: closed-wave drills demote to the weekly sweep; the monolith splits; the required check `ci` becomes a fail-closed meta-gate | 2026-08-21 | standing | Owner-ruled lever (1): per-PR CI *scope* amended — estate suite + deploy-onto-existing stay per-PR as backstop, a current wave's drill rides per-PR until its wave closes; ADR-061's uniform review ladder untouched. Closes two pre-existing fail-open shapes (lint never required; skipped-satisfies-protection on classifier failure). Hybrid runners DECLINED ($0 preference). Mechanism: `.github/workflows/ci.yml` + `.github/actions/*`. |
| [0074](0074-the-track-a-sitting.md) | THE TRACK-A SITTING: fourteen principle rulings for F-A3..F-A9; the roster becomes an OPEN REGISTER; attribution becomes JUDGEMENT | 2026-08-22 | standing | Fourteen rulings (TA-P1..P14) settling every Track-A authority question from the contract plus standing law. **Four CONSTITUTIONAL AMENDMENTS — RATIFIED by the owner 2026-08-22**, entering the set with laws 78-81 at that signature: law 71's "exactly" roster → an OPEN REGISTER (TA-P1 C) · invariant (a) attribution → the agent's JUDGEMENT under structural walls (TA-P7 C; PRD §6.2(a) · ARCH §0.1 · digest law 2 — `AGENTS.md`'s home FLAGGED, not drafted) · law 21 narrowed to periodic POSTING belts (TA-P5) · law 76's "LLM" drift trued (TA-P13). Also: three number-origins + a governed policy-table door relaxing `0016`'s migration-only assertion (TA-P2) · one purpose per processing class + a firm-level narrow purpose, C6 to critical path (TA-P3) · mechanically-bound receipts + a DEFINER read wrapper (TA-P4) · walls re-aim at the DIRECTING human, `agent_prepared` (TA-P6) · learned identifiers are context, never keys, + a promotion door (TA-P8) · a DECIDED freeform read surface closing GAP5-5 (TA-P9) · sandbox exports with a byte-burned watermark, aggregates narrative-only (TA-P10) · the one-architecture TEST — the bank rules machine retires whole (supersedes WCC-R5's bank arm), **7A-R3 + E-R13 recorded DISSOLVED** (TA-P11) · the brake census, three gates REMOVED (TA-P12) · ONE metering ledger, `client_id` added now (TA-P13) · closed-loop DONE (TA-P14). Orchestrator dissents on file: TA-P1, TA-P7. Laws 78-81 fold below (§11); mechanism of record `docs/plan/active/wave-f-contract.md` + the sitting record `docs/plan/active/track-a-sitting-1.md`. **The exact register — supersessions, what stands, the test-data delegation, the residue (R-A/R-D/R-F/R-OWNER), the boundary and TA-P1's dissent in full — split out verbatim 2026-08-23 to [`0074-annex-a-mechanisms.md`](0074-annex-a-mechanisms.md)** at the entry's 500-line ceiling; 0074 keeps the rulings, the amendments, the ratification stamps and the rider. |
| [0075](0075-test-data-authority-widened.md) | TEST-DATA AUTHORITY WIDENED: no real client exists before go-live; data is free, gates are walked by the delegate, mechanisms never move | 2026-08-23 | standing | Owner ruling (Tao, 2026-08-23, the alignment grill), amending **ADR-060**'s data authority and widening the 2026-08-22 identity grant. **(1)** Every client in the estate is TEST DATA authorised by its owner — BELCORT's ROME PROPERTIES · ROME SECRETARY · BEE CREATIVE SOLUTION, the synthetic ROME PUBLIC ADVISORY, the Alara/Borneo RLS fixtures — all factory-reset and re-run at the Wave-G e2e. **(2) DATA is free:** delete, reseed, reverse, re-run any client's data, documents, consents and close state, **live DB included**, without asking; the corpus is the owner's three folders and **no oracle exists beyond them or is required**. **(3) GATES are walked by the agent as the owner's DELEGATE** through the REAL audited doors, receipted — law-71 human acts, consent signatures, capability grants, password-bearing acts (secrets env-to-env, **never printed**); **e-filing excluded by nature**. **(4) MECHANISMS never move** — RLS, the attribution walls, receipts, roles/grants, the generic name-only wall are the product under test; weakening one for testing convenience is forbidden (the NARROW reading, owner-confirmed, and the operative clause on any collision). **(5) No client-specific mechanism or documentation for a test client:** hard constraint **12 RETIRED as a named constraint** (the GENERIC "a client may be flagged name-only, never enriched" wall stays — `0062`/`0063` untouched), constraint **13 REWRITTEN** (BELCORT is the operator firm; every other firm/client is a resettable test fixture; never repurpose the synthetic sandbox as a real firm), constraint **14's "expires at beta" STANDS**. **(6)** Every wave's validation still runs in full; nothing is deferred to the e2e except what is e2e by nature, and a Known-issues or Backlog row is the only lawful home for a deferral. Folds as digest **law 82** (§12). |
| [0076](0076-g1-universal-wake-execution-engine.md) | GATE G1 RULED: the universal wake-execution engine closes the stranded-row defect — one engine on the existing `kind='wake'` held projection, `close_prep` GRANDFATHERED as a second registered carrier shape | 2026-08-25 | standing | Owner ruling (Tao, 2026-08-25) on the cross-item register escalated by `bank-agency-gate-record.md` §6 item 1 (blocker B2), shared with F-A4/F-A5/F-A7. A `kind='wake'` `agent_task` is a HELD PROJECTION nothing can execute (`held→cancelled` its only legal transition) — one stranded row per cadence tick per client with no legal exit but a human cancel. **Mechanism (a) — heard, OVERRULED:** a dedicated `agent_tasks.kind` per source (the autodraft/`close_prep` precedent), paying a D1 trigger recut per item, forever. **Mechanism (b) — CHOSEN:** one universal engine on the held-wake projection, matrix delta paid once, `wake_engine_sources` a rows-only registry for every future source; `close_prep`'s already-shipped (`0120`) matrix is GRANDFATHERED, not retrofitted, and folds in as a SECOND, closed-world `direct_queue` carrier — never a third. Mechanism: migration `0133`, merged + W4-ceremonied 2026-08-26 (#349). `wake_engine_sources` ships EMPTY (`bank_agent`/`close_prep` seed rows `enabled=false`). **NARROWED in substance by 裁-40/裁-44/裁-59:** one combined G1 ceremony opens three switches (`bank_agent` · `close_prep` · binding-expiry); `tax_prep` is separated to its own later sitting. An ADR minute is owed for that narrowing. Folds as digest **law 83** (§13). |
| [0077](0077-the-beta-pivot-and-the-paid-launch.md) | THE BETA PIVOT: a paid launch at RM0, tax inert at launch, the cutover re-scoped, the G1 clocks deferred, Codex leads and reviews | 2026-08-31 | standing · **SIGNED 2026-08-31 evening (裁-93)** | Minutes the product-law rulings of the 2026-08-30 evening and 2026-08-31 morning sittings (裁-57 · 58 · 62 · 68 · 72→75 · 76 · 82 · 84): paid beta with no free tier, every plan RM0/"trial" until the pricing sitting, the standard-SaaS firm-creation path (Checkout → signed webhook → `firm_admissions` → `create_firm`), tax inert at beta, the cutover waiting on the measured residual + honest notes + the interview runner, the G1 three-switch ceremony post-beta (the 0076 narrowing minuted here), the seat kept in the Claude Code session with lanes chosen by fit (裁-82 → 裁-85), and the lean ladder — one fresh-context opus review leg plus a real-browser Playwright e2e leg on every frontend train, **law 28 kept** by the Codex-build/opus-review split (裁-84 → 裁-86). Folds as digest laws **84–85** (§14); the signature landed at the 2026-08-31 evening sitting (裁-93). |

**Note on `0042a`.** The source archive carries one interstitial entry that is *not* an
ADR — `### Ruling batch WB-R28..R30`, sitting between ADR-042 and ADR-043. It holds real
owner rulings, so it is preserved as a file rather than dropped; the `a` suffix keeps it
in source order without claiming an ADR number it never had. **The owner may wish to give
it a number** (it would be the only renumbering in this conversion) — flagged, not decided.

---

# THE STANDING LAWS DIGEST

Every law still binding TODAY, deduplicated, with its source. It is a reading of all
entries through ADR-0070, not a mechanical extraction. On any divergence, the cited ADR
governs.

> **SIGNED OFF — Tao (BELCORT), 2026-08-12.** Laws 1-67 below are ratified as the current standing set at the ADR-0069 harness refactor. Additions or supersessions land as new ADR entries; this digest is re-trued whenever one does.
> **Dated re-truing minutes live in [`README-log.md`](README-log.md)** — split out 2026-08-23 at this file's 500-line ceiling, verbatim and append-only. Ten minutes so far (2026-08-16 · 08-18 · 08-20 · 08-21 · 08-22 · 08-23 ×2 · 08-27 · 09-02 · 09-03). **The laws below govern; the log records when each was re-read and what the reading found.**

## 1 · Product law (the cardinal invariants)

1. **The DB owns every AUTHORITATIVE number.** The LLM may propose or independently check
   a calculation, but no model-generated numeral enters a durable report unless a
   versioned deterministic evaluator reproduces it from DB-owned inputs. *(0065/E-R4 —
   amended wording; homes: PRD §6, ARCHITECTURE §0, AGENTS.md hard constraint 2. The pre-amendment
   clarification survives in substance: an agent-proposed draft becomes authoritative
   only after exact-revision human approval.)*
2. **Four structural invariants, enforced in the DB, not by model discipline:** client attribution
   (~~≥0.95; a human click or an exact identifier match only~~), provenance binding
   (`source_doc_sha256` + `document_id` validated in-txn), wake authority (per-wake allowlist),
   write authorization (structural read-only agent role). *(0002; realized 0015. Invariant (d)
   amended by 0071: the agent's READ path stays structurally read-only; a wake-scoped, allowlisted
   agentic WRITE lane now exists. **Invariant (a) AMENDED by 0074/TA-P7 — law 79 — RATIFIED 2026-08-22
   (owner); PRD §6.2(a) / ARCH §0.1 AMENDED to match in #287.** (b)(c) untouched.)*
3. **Write authorization is lane-split by GRANT, never detected at runtime.** *(0015 —
   the lane-split-by-GRANT principle stands and is the mechanism of 0071's new verbs.
   The "agent-never-signs is the ABSENCE of an entry point" clause is SUPERSEDED by
   0071: wake-wrapped posting/matching entry points now exist for the agent.)*
4. **Maker/checker is modelled always**, hard distinct-approver gate on the high-stakes
   lane, solo firms record an attestation, and the agent can never satisfy a human
   sign-off. *(0003; BELCORT's threshold is RM100,000 per 0044. SCOPED by 0071: the
   HUMAN lane keeps all of this unchanged; the agentic lane's unattended writes route
   to no human checker at any amount, and "never satisfy a human sign-off" narrows to
   the surviving human acts — close keys ②③, `except_bank_line`, opening-seed
   approval, statutory wording, `canonical` definitions, capability grants, e-filing.)*
5. ~~**Auto-approve is scoped, not forbidden:** no *unbounded or agent-initiated*
   auto-approve. A human-signed rule IS the posting authority.~~ *(0025 — SUPERSEDED
   by 0071/G1: the agent's own judgement is the unattended posting authority, under
   the witness-pair and wall regime of law 71.)*
6. **Reverse-not-delete is structural** — there is no delete verb anywhere in the schema.
   *(0005, 0042a/WB-R29)*
7. **Visibility-first for everything judgement-flavored**, with exactly ONE ruled
   exception: the drawer-2 close gates. *(0002 + 0065/E-R2)*
8. **The wiki informs, never decides** — no gate/bound/floor/autopost function may read
   wiki; authority paths must be bit-identical with and without it. *(0004, 0032/WB-R6,
   0039. NARROWED by 0071: the mechanical half stands — no DB gate/bound/floor function
   reads wiki — but on the agentic lane the knowledge layer now lawfully informs the
   judgement that IS the posting authority, so the bit-identity guarantee is superseded
   there; the knowledge layer is that lane's learning loop, law 73.)*
9. **The subledger is intrinsic:** the audited write composes the GL leg and the open item
   in ONE transaction. *(0005; the debt paid at 0052)*
10. **Idempotency keys are the mandatory floor** — durable-engine step memoization is not
    exactly-once. *(0009)*
11. **Precedence on collision:** accounting-correctness > backend contracts > design
    look/motion. *(house law; applied as the grounds of the B3 ruling, 0068)*

## 2 · Accounting and domain law

12. ~~**Autopost eligibility.** Posting authority derives from verified in-system approvals
    only: no autopost rules from seeding, ever *(0046/WB-R2)*; hand-drafts are never
    autopost fuel and hand-created rules past the floor are refused *(0063)*; and an entry
    a rule posted itself can never count as evidence for its own authority — the
    anti-circular floor exclusion *(0064)*.~~ *(SUPERSEDED by 0071/G1.4: the rules
    machine's execution tier retires; WB-R2 and the anti-circular exclusion are moot
    with the machinery they governed. Unattended authority is law 71's.)*
13. **Corroboration is agreement, not confidence.** Two independent readers agreeing to
    the sen ∧ the document's own arithmetic identity ∧ the polygon wall ∧ MYR. Vendor
    self-reported confidence is gone; reader disagreement is a refusal, never a tie to
    adjudicate; `request_reextraction` is human-invoked-only, no machine caller ever.
    *(0047. ROSTER REDEFINED by 0071/G1.1: the readers are the LLM witness pair — one
    read of the OCR raw text, one of the original image, same provider, two channels —
    under the C1-C4 gates (law 72). "Agreement, not confidence" and
    refusal-on-disagreement stand; the re-extraction clause is untouched.)*
14. **For bank statements the running-balance CHAIN is the second reader** (structured);
    OCR needs two readers AND the chain. *(0051/WC-R7 — a deliberate strengthening of
    0047. AMENDED by 0071: the CHAIN requirement stands as a C3 mechanical identity;
    the `prebuilt-bankStatement` reader retires with the reader estate, its seat taken
    by the witness pair.)*
15. **Unsigned single-column amounts are REFUSED by design**, and `enter_bank_statement`
    binds to a FILED document only. *(0053)*
16. **Malaysian tax facts live in effective-dated policy tables, never in product-law
    prose** — rates, thresholds, phase dates. *(0051)*
17. **SST has no input-tax credit**; the purchase side is a *visibility* split. *(0028)*
18. **Multi-currency is ruled OUT**; non-MYR fails closed until its own post-G wave.
    *(0051/WC-R5, superseding WA2-R1's charter)*
19. **No employee counterparty kind, ever.** Staff advances ride the B-lite register; a
    sole proprietor is NOT an employee — his account is EQUITY. *(0051/WC-R10,
    0055/WD-R10)*
20. **The split-month law:** a day-1 revision gives the month to the successor; day-2+
    leaves it with the PREDECESSOR. No month is ever split; no day-level pro-rating.
    *(0057/G14)*
21. **The time-triggered ~~authority~~ POSTING doctrine:** sign once at admin+, the first firing DRAFTS
    (the ramp), receipt everything, high-stakes always to a distinct checker. *(0055/WD-R5, WD-R8.
    **NARROWED by 0074/TA-P5, in the owner's own words, to "periodic POSTING belts", RATIFIED 2026-08-22
    (owner) — whether a clock may WAKE her is law 71's question, answer YES: law 80.** 0071 recorded this law
    NOT REACHED; 0074 reaches that half.)*
22. **Never fabricate.** A gate whose evidence class does not exist in the world cannot be
    closed honestly, only deferred with its cause written down *(0046)*; synthetic
    evidence is sanctioned pre-go-live but is LABELLED synthetic and never claimed as real
    *(0048 — "the ADR-048 sanction")*.
23. **The never-backdate law stands for transaction reversals.** A year-end close pair is
    period machinery, not a business transaction: `reopen_fiscal_year` mints a dedicated
    reversal DATED the reopened year's `ends_on` under the target-bound close-write permit
    (M2), with the act's real timestamp/actor/receipt retained. *(0068)*
24. **MASB dual-version golden wording** — MPERS 2016 → MPERS 2025 for FYs beginning
    ≥ 2027-01-01; live 2025/26 clients stay on MPERS(2016). The tax-table pattern.
    *(0065/E-R14)*
25. **The close model's governance:** three-drawer gates; three keys with a
    firm-configurable authorization list (default owner-only, partners by explicit audited
    grant). *(0065/E-R2, E-R11. AMENDED by 0071/G2: key ① — begin/abandon + the whole
    preparation surface — is agent-holdable; keys ②③ stay owner/partner human acts and
    B3's segregation wall stands. "Structurally key-less" now describes keys ②③ only.)*

## 3 · Review and evidence law

26. **Review intensity stays UNIFORM** — the full ladder for every substantive change.
    Risk-tiering was proposed and DECLINED. *(0061)*
27. **The three laws minted 2026-08-06.** (1) A judgement-logic PR gets an independent
    review pass before merge — the floor, not the ceiling. (2) **Absence is not evidence,
    and a derived state is not evidence** — only what a read actually SAW counts; every
    absence and every derivation falls to the fail-closed branch. (3) **Spelling is not
    identity** — a guard that reads a NAME reads a projection; prove an identifier IS its
    import. *(minted in the open register; live exhibits at 0064/F1 and 0066)*
28. **Cross-model adversarial review before merging money-touching code** *(0026)*, and
    for the DESIGN of anything touching the approval path *(0028)*. **TIME-BOXED SUSPENDED
    until beta live (裁-111, owner, 2026-09-01)** — not repealed: the opus lane is the complete
    review gate for the sprint, Codex builds on, law 28 resumes at beta. Same-sitting standing
    review laws await ADR folds — 裁-107(a/b) seam↔door tables · 裁-108 unnumbered-migration arming ·
    裁-112 overclaim ownership · 裁-113 checked-not-trusted waivers (the `&&`-chain masking class banked alongside) — the ledger IS law meanwhile: `docs/plan/active/mohe-grill-rulings-2026-09-01-pm.md`. **AMENDED FURTHER by 裁-133 (owner, 2026-09-02, time-boxed until beta live): there is no Codex lane of ANY kind until beta live — the BUILD lane joins the already-suspended review leg, and every lane is native (sonnet-5 xhigh bounded · opus-5 xhigh judgement/security/review). Both resume at beta unless the owner rules otherwise; see §15 and `docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md`.**
29. **The live eval is the standing acceptance gate for every wave.** A wave is not done
    at merged-and-reviewed; it is done when its gates close on live books. *(0027;
    re-earned at 0053, 0064)*
30. **Execution truth outranks read-only review claims** — evidence, not authority, in
    both directions. *(0029)*
31. **A wall that never refused anything is not a wall that held — it is a wall that was
    never asked.** A review round must ask what the code has never been ASKED; a
    zero-count refusal head is a question to open, never a wall to bank. *(0066)*
32. **Read a document's load-bearing verbs** (*enforced · closed · only · reports*) and
    find the line that makes each true; **write the test against the artifact, then run it
    against the OLD artifact and require it to FAIL.** *(0040)*
33. **Blind lanes need FILESYSTEM isolation, not instructions.** *(0033)*
34. **The binding-gate exemption allowlist is EXACTLY ONE**, printed as an audit line; any
    addition is a review event. *(0058)*
35. **A probe that can error under `|| true` reports blank as success** — force the
    locale, never trust the ambient. *(0058)*
36. **Fail-closed-on-unknown:** deploy instruments name their verified grammar subset and
    refuse loudly outside it, with a diagnosis. Do not "fix" a red by loosening the guard.
    *(0059; the interview AST guard's named cost is the standing exhibit)*

- **The docs-only review lane** — a PR touching ZERO code paths (`AGENTS.md` / `CLAUDE.md`
  / `PROGRESS.md` / `docs/**` only) takes a single-lane review; the fence is the CI path
  classifier, never the author's claim. The ONE narrow amendment to the uniform ladder;
  everything touching code keeps the full ladder. *(0069)*

## 4 · Engineering and CI law

37. **`main` is PR-only with green CI.** Server-side branch protection is unavailable on
    the plan tier, so the git-base freeze-lint + CI ARE the gate. Two org policies must
    stay compatible or CI breaks silently: no allowed-actions allowlist (it would reject
    `actions/checkout@v4`) and no enforced SHA-pinning (it would reject `@v4`). *(0021)*
38. **The self-hosted CI runner (`clara-wsl`) is PRIVATE-REPO ONLY — decommission it
    BEFORE any repository visibility change.** The gate itself is unchanged. *(0067;
    runbook `docs/ops/ci-runner.md`)* **AMENDED by 裁-135 (owner, 2026-09-02, permanent until the owner reverses it at official launch): the repo IS public and CI is GitHub-hosted; the order of operations was honoured (hosted migration → full-history secret scan → the fork-PR approval wall → the flip), the four instances stay registered but no event routes to them, and the residual rule is "never re-point them at `pull_request` while the repo is public". See §10, §15 and `docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md`.**
39. **Anti-misleading-green CI:** real migrations onto a throwaway `postgres:17`, a
    deploy-onto-existing check so an edited historical migration fails, freeze-lint,
    leak-scan, and a real DR round-trip. Destructive DB scripts refuse without a
    disposable-target sentinel. *(0012)*
40. **Workflow bodies are immutable once deployed** — ship a behavioural change as a new
    `_vN` export and repoint the registry; never rename/delete an export with in-flight
    runs. The freeze-lint's boundary is the DEPLOY boundary, with a monotonic lock.
    *(0010 + 0035)*
41. **Migration numbers (and CLR codes) are claimed at MERGE time**, with the `RENUMBER.md`
    procedure: templates, an exhaustive stable-name inventory (never prefix-only), the
    version as a shared assembler input, and a mandatory dry run. *(0050, 0058)*
42. **A test for a granted verb belongs no later than the grant slice**; a fork's shipping
    set is the transitive closure of its prologue; the dashboard splits with the DB.
    *(0058)*
43. **A slice never rewrites a prior slice's installed comment**, and an optional
    cross-section patch is a PROPOSAL, not a patch. *(0058)*
44. **Scan any branch with CI's own pinned gitleaks config BEFORE pushing it**, and never
    commit a credential — connections come from the environment, never a DSN in code or
    argv. *(standing law from the #190 discharge; the leak-scan gate enforces)*
45. **DB changes are rig-validated on a throwaway**, never hand-applied to a live project
    blindly. *(0012 + house)*

- **The repo is the system of record; `PROGRESS.md` is the state authority.** Memory is a
  preferences-and-lessons cache; "memory wins" is abolished. *(0069)*
- **Named/built-in Workflow invocations are dispatches** — every dispatch pins an explicit
  `model`; omission inherits the main model, which is forbidden. *(owner directive, recorded
  at 0069)*

## 5 · Ceremony and deploy law

46. **The positive-read deploy law: a ceremony closes only on a POSITIVE read that the
    running release carries the intended commit** — release build-time versus the merge it
    must contain, plus the new code's own boot line. *(minted by the v54 belt-gap incident,
    2026-08-06; a Law-2 violation at the deploy layer)*
47. **The `statement_timeout` recipe:** a ceremony-local **session-level**
    `set statement_timeout` inside the migration connection (port 5432, session mode),
    reverted after. Role- and database-level settings are invisible through the pooler.
    *(0059)*
48. **Ceremonies run a MAIN-PINNED migrate runner, never the wave checkout.** *(0058)*
49. **`NOTIFY pgrst, 'reload schema'` after any ceremony that adds RPCs**, and a PostgREST
    rpc probe must send `Content-Profile: clara`. *(0058, 0038)*
50. **Every ceremony ends with freeze `--lock-deployed` + commit.** *(0062)*
51. **`fly deploy` must run from the repo root.** *(0036)*
52. **Runtime-image-first has a failure boundary DB-first does not** — and the cutover
    point is *exclusive new-binary lock acquisition*, never "the image is up". *(0039)*
53. **Production recovery is FULL-PROFILE only.** The default backup profile is a
    diagnostic books snapshot that must NEVER be started as an application database; roles
    restore via a reviewed ceremony, not globals; the ACL baseline is a mandatory
    post-restore re-application. *(0020)*
54. **Backup drills:** monthly LIGHT human-assisted + quarterly STRICT; the full-profile
    fresh-project DR drill re-runs quarterly. *(0037/WB-R26, 0020)*

- **The evaluator deploy ceremony is TWO SEPARATE halves, beside law 50.** `deploy-evaluator-version.mjs` flips the DB row's `deployed` flag under the bare migration principal; `check-frozen-evaluators.mjs --lock-deployed` separately stamps the manifest so the deployed body's hash becomes immutable versus `origin/main` — neither substitutes for the other. Exhibit: the 2026-08-24 flip shipped without its manifest lock; caught and fixed 2026-08-26. *(`packages/db/README.md` "Evaluator deploy ceremony"; `docs/ARCHITECTURE.md` Appendix A)*

## 6 · Data, security and confidentiality posture

55. **The pre-beta data doctrine (0060) IS IN FORCE.** Every firm/client row in the live
    Clara project is partner-authorized test state; the agent may delete, reverse, reseed
    and re-run it in service of wave validation, recording each reset. The authority is
    **DATA-scoped only** — the product's security MECHANISMS, the engineering gates and
    secrets discipline are never relaxed. **It expires at beta**, and the resumption is
    itself a named gate item.
56. **The 0060 §1 narrowing (operative).** The doctrine reaches **client and accounting
    data in the live Clara project ONLY**. It does NOT reach the frozen prior build
    (`initial acc software skillmd` + the `belcort-shared` Supabase, read-only audit
    evidence until Phase-5) or the Slice-0 spike's `workflow` / `graphile_worker` /
    `spike` schemas and its live parked run. *(recorded in the open register; 0001 is the
    frozen build's source)*
57. **Tracing stays in Clara-controlled storage.** Vendor trace export ships OFF and is
    enabled only after an executed DPA, firm-facing client authorization (MIA By-Laws
    require *specific* authority), a documented PDPA cross-border basis, short retention,
    tested deletion and field-level minimization. *(0011 — the C6 checklist is still open)*
58. **OCR egress is a two-tier gate**, and consent is **typed and purpose-scoped**,
    re-checked at the dispatch boundary — a grant alone does not authorize. A
    locally-parsed document skips the cross-border hold (no egress occurs). *(0018,
    0025/WA2-R14, 0037/WB-R23, 0040)*
59. **THE ENRICHMENT TRAP.** ROME SECRETARY's customers are NAME-ONLY (11 customers / 0
    registrations) because no RS invoice prints a buyer registration. **Never enrich them
    with registration numbers or TINs** — it would strand every subsequent invoice at
    `customer_ambiguous`, unattended and silently. *(standing OPS note; the F3 mechanism)*
60. **`__Host-` cookie + same-origin BFF is REQUIRED before staff/multi-user routine
    production.** *(0037/WB-R27)*
61. **The onboarding commit lane** stays the audited temp-admin ceremony; the target is a
    scoped review-attestation capability (reviewer ≠ activator, zero standing privilege).
    *(0037/WB-R22)*
62. **The wake-secret txn-local property is a RUNTIME POOL contract**, not DB-enforceable —
    the DB trusts the `clara.wake_secret` GUC within a request. *(Slice-4 clarification)*

## 7 · Permanent pins (never expire)

63. **Canary `daba7f2e` — NEVER answer it**, even past due (it was due 2026-08-02).
    *(0017/S4-V2)*
64. **The belt witness `d023b48c` — NEVER approve it** (the sandbox's first autonomous
    adjustment draft). *(0059 and the v54 incident record)*
65. **Archive branch `build/wave-d-b-0042` must NEVER be merged** — evidence only, with a
    named do-not-restore list. *(0058)*
66. **Four firms, not interchangeable.** BELCORT is the real firm (ROME PROPERTIES · ROME
    SECRETARY · BEE CREATIVE SOLUTION); ROME PUBLIC ADVISORY is the Gate-S synthetic
    sandbox *(0045)*; Alara Advisory and Borneo Books are slice-era RLS fixtures *(0044)* —
    never repurpose them.
67. **Never re-grill a ratified contract.** Wave E (0065/E-R1..E-R14) · §7-A
    (0063/7A-R1..R12) · Wave D and D-b (0055/WD-R1..R15, 0057/WDB-G1..G16) and any
    ladder's adjudications or settled residuals. Cite them; do not re-open them.

## 8 · The Wave-E close supplement (folded 2026-08-16; source ADR-0070 rulings 10-13)

68. **Guard polarity — the ARM-0 law.** An identity-measuring guard handles the NULL or
    absent principal as its own FIRST arm (refuse or route strictest), never by inference;
    NULL-reachable comparisons use `is not distinct from` — a CASE whose arms are all
    NULL-poisoned is an open door drawn as a wall. *(0070 §10; born of 0084's
    null-maker fail-open)*
69. **Adoption semantics.** An orphaned proposal (no directing human / departed /
    NULL proposer) is approvable only as an ADOPTION through a recorded attestation —
    never frictionless; maker/checker measures the DIRECTING human with standing re-read
    at approval time. The same arms extend to any later act that mints-and-approves in
    one call (B3's reopen applied them reopener-vs-closer). *(0070 §11; 0084; 0085)*
70. **The isolation pin + requeue-re-derives.** Migration isolation is a checksum-keyed
    PER-MIGRATION runner pin, MEASURED post-BEGIN by read-back (blanket raises refused,
    0019/CLR32); and a human requeue of a failed render RE-DERIVES pinned inputs
    recording both digests (drift consented via `p_accept_drift`), with expired render
    leases reaped immediately. *(0070 §12-13)*

## 9 · The Agentic Charter supplement (folded 2026-08-18; source ADR-0071)

71. **Judgement is the unattended posting authority; walls validate.** The agent posts, matches and
    adjusts unattended on her own judgement — no human-signed rule, no amount routing, no ramp, no
    sampling, no dark launch, permanently (the owner's G1.2/G1.3 rulings; the build's contrary
    recommendation is on file in 0071). What validates: the witness pair (law 72), invariants
    (a)(b)(c), balance, CLR19, and the receipts. The surviving HUMAN acts, ~~exactly~~ **BY
    RESERVATION**: close keys ②③ · `except_bank_line` · opening-seed approval · statutory wording ·
    `canonical` definitions · capability grants · e-filing. *(0071/G1-G3. **AMENDED by 0074/TA-P1,
    RATIFIED 2026-08-22 (owner) — the enumeration is a RESERVATION, not a census; law 78, which carries
    the rider R-TA-P1-walls.** Dissent on file.)*
72. **The LLM witness pair.** Unattended amounts require two independent LLM reads —
    the stored OCR raw text and the original image, same provider, two channels —
    agreeing to the sen under a versioned deterministic DB predicate (the model never
    grades its own agreement); every witnessed amount anchors to a layout region; the
    document's arithmetic identity and the bank chain stay as mechanical checks; both
    reads persist with model+version and injection-hardened prompts. OCR supplies
    coordinates and text fidelity only and is vendor-swappable. *(0071/G1.1, C1-C4)*
73. **The knowledge layer is the learning loop.** The rules machine's execution tier
    is retired; approved history and per-client patterns feed the context pack, and on
    the agentic lane knowledge lawfully informs the deciding judgement. No DB
    gate/bound/floor function reads wiki (law 8's mechanical half). *(0071/G1.4)*
74. **Reporting is two-tier.** The analysis sandbox is free — watermarked
    non-authoritative, structurally unreachable from the seal chain; on the formal
    side the agent self-promotes metric definitions to `firm_approved` and runs the
    open→evaluate→seal→render chain through the OBO lane. `canonical` stays
    migration-only; statutory wording stays owner-signed; the claim gate stays
    mechanical; e-filing stays human. The `0135`/`0136` substitution seam resolves durable
    placeholder blocks through DB-owned `cell` basis references before output. *(0071/G4)*
75. **The internet is two-tier.** Number-bearing facts (FX, rates, thresholds) enter
    only through effective-dated policy tables fed from named official sources; open
    web reading is otherwise unrestricted under three disciplines — fetched content is
    inert data, every web-derived basis is cited (URL + date + quote), official
    Malaysian sources are preferred for rules questions. A web page can never be a
    posting's source document (provenance binding). *(0071/G9; the FX three-moment
    principle P-FX rides the future FX wave, law 18 unchanged)*
76. **Meter, never cap.** Per-call ~~LLM~~ usage is metered and monthly per-firm spend is visible; no
    budget ever pauses automation. PRD §8's interim guardrail narrows to metering (engine-protective
    concurrency floors stand — they protect the durable engine, not spend). *(0071/G8. **WORDING
    TRUED by 0074/TA-P13, RATIFIED 2026-08-22 (owner):** 0071/G8 and contract F-A9 read "Per-call usage"
    unqualified — the digest added "LLM", never ruled; law 81.)*

## 10 · The CI-economics supplement (folded 2026-08-21; source ADR-0073)

77. **Per-PR CI scope is current-wave + backstop; closed-wave drills live on the weekly sweep.** Per-PR: lint (every event,
    docs-only included) · typecheck/build + the worker-path gate · the estate suite + deploy-onto-existing (the ruled backstop) ·
    the live-behavior e2es + the DR pair · the render drill · the partition gate · the CURRENT wave's drill while its wave is
    open. Sweep + manual dispatch only: every closed wave's upgrade/contract drill and the D-b frontier matrix. The required
    check `ci` is a fail-closed meta-gate over every job — success or lawfully-skipped, both directions asserted. After merging a
    PR that touches a closed drill or the pipeline itself, run the sweep by hand (`gh workflow run ci.yml`). Review intensity
    (law 26) is unaffected. *(0073)*

- **A retirement/move PR trues every closed-wave floor pinning the moved surface, in the SAME PR** (minted at PR #352, migration `0129`'s bank-rules retirement outran a stale D-b2 floor at the next sweep) — branch on a migration-STEM witness OR a catalog witness by exact signature (`to_regprocedure`, never a bare name — law 27(3)), assert exact-signature ABSENCE plus a positive control that a surviving overload still resolves. Mechanically documented `.claude/rules/db-tests.md`.
- **The four-runner CI expansion (`clara-wsl` … `-4`, 2026-08-23) is CONFIRMED STANDING, not provisional** — owner-ruled 2026-08-26, closing `harness-audit-2026-08-23.md` ambiguity #2. *(`docs/ops/ci-runner.md` "Runner count expansion to four")* **SUPERSEDED 2026-09-02 by 裁-135: CI runs on GitHub-hosted `ubuntu-latest`; the four instances stay registered but no event routes to them (`docs/ops/ci-runner.md` "Hosted from 2026-09-02"). Law 77 and ADR-0073's three levers are untouched — see the dated minute in `docs/adr/README-log.md`.**

## 11 · The Track-A sitting supplement (folded 2026-08-22; source ADR-0074 — the sitting's other ten rulings bind through the ADR and `docs/plan/active/wave-f-contract.md`)

78. **The human roster is an OPEN REGISTER.** Law 71's seven acts are a RESERVATION, not a census: any act they do not reserve is
    the agent's, adding one is an owner ruling, new authority arrives as a wake SIBLING verb (never a live-body rewrite),
    capabilities default-on, no per-firm dial. **Rider R-TA-P1-walls (2026-08-22): the open register ships WALLED — a run with a
    live `close_attestations` row cannot be abandoned by Clara (B6), a re-freeze refuses while a reopen's correction is in flight
    (B14), and every entrance's wall stays at its own door (the entrance seam); F-A5/F-A6/F-A7 inherit this scope.** *(0074/TA-P1; dissent on file)*
79. **Attribution is JUDGEMENT under walls.** Invariant (a) is satisfied by a human click, an exact identifier match, or her own judgement
    — walled by a hard-number contradiction refusal, a name-family collision guard, a correction path raising a named misrouted-egress
    event, and a firm-scoped carrier for the unattributable document. **Unsure → she asks**; a model never scores itself (law 72).
    **As-built caveat (TRUED 2026-08-27): the F-A7 α recut SHIPPED — the live body now admits `method in ('human','rule','judgement')`
    (`0125_f_a7_alpha2_judgement_recut.sql:184,209`); the `confidence >= 0.95` conjunct is RETAINED as a harmless failsafe (judgement
    rows mint pinned at 1.0, `0126`/D-2) until the R1 follow-up migration drops it for `method='judgement'` — owner-confirmed option B,
    `harness-audit-rulings-2026-08-26.md` R1; tracked in `PROGRESS.md` Backlog.** *(0074/TA-P7; dissent on file)*
80. **A clock may wake her; law 71 governs what she then does.** ONE time-triggered wake source, no ramp/first-draft/sampling; the
    WORK still triggers on data (a missing statement yields a chase notice, never a fabricated reconciliation); every clocked act
    is receipted; statutory PREPARATION is hers and submission stays human. *(0074/TA-P5; law 21 narrowed to posting belts)*
81. **One ledger, no brakes, one architecture.** Per-call usage records through a SINGLE ledger carrying `client_id` and the triggering
    actor from its first row; every usage gate that pauses automation is REMOVED and engine-protection refusals renamed off the budget
    string; and one deterministic core with one entrance per surface is ONE architecture — two mutually-unaware paths are two. *(0074/TA-P11, TA-P12, TA-P13)*

## 12 · The test-data authority supplement (folded 2026-08-23; source ADR-0075)
82. **Test data is free; law-71 gates are walked by the DELEGATE; mechanisms NEVER move.** Every client in the estate is test data (reset, reseed, reverse, re-run freely — live DB included); the agent walks law-71's gates as the owner's DELEGATE through the REAL audited doors, receipted, e-filing excluded by nature and secrets never printed; **no mechanism ever moves for testing convenience** (RLS, the attribution walls, receipts, roles/grants, the generic name-only wall — they are the product under test), and nothing client-specific is built or kept for a test client. Full text: `0075-test-data-authority-widened.md`. *(0075; expires at beta with hard constraint 14)*

## 13 · The G1 wake-execution engine supplement (folded 2026-08-27; source ADR-0076)
83. **One engine, two carrier shapes, forever, unless reopened.** The stranded-row defect (a `kind='wake'` `agent_task` is a HELD PROJECTION nothing can execute) is closed by ONE universal wake-execution engine on the existing held projection, its matrix delta paid once; mechanism (a) — a per-source `agent_tasks.kind` and its own trigger recut, forever — was heard and OVERRULED. `close_prep`'s already-shipped (`0120`) per-kind matrix is GRANDFATHERED as a second, closed-world `direct_queue` carrier, never retrofitted and never a template for a third. `wake_engine_sources` ships EMPTY (`bank_agent`/`close_prep` rows `enabled=false` at birth); registering a new source is INSERT rows only — never another trigger recut — and F-A3/F-A4 each owe their own INSERT-and-flip follow-up. **NARROWED in substance by 裁-40/裁-44/裁-59:** one combined ceremony opens `bank_agent`, `close_prep`, and binding-expiry; `tax_prep` gets its own later sitting. An ADR minute is owed. Mechanism: migration `0133`. *(0076)*

> Ledger: `docs/plan/active/mohe-grill-rulings-2026-08-29.md:347` and
> `docs/plan/active/mohe-grill-rulings-2026-08-30.md:159`; minuted by ADR-0077 (signed 2026-08-31, 裁-93).

## 14 · The beta-pivot supplement (source ADR-0077, 2026-08-31 — **SIGNED at the evening sitting, 裁-93**; law)
84. **The paid-beta gate** — three walls + Stripe checkout success; RM0/"trial" until the pricing sitting; nothing invoices until `amounts_ruled`. *(裁-57 · 58 · 68 · 73)* **85. Honest notes for a paused lane are a lawful permanent state**, swept against the lane's `PROGRESS.md` row. *(the 2026-08-31 direction)* **Law 28 KEPT** — the Codex-build/opus-review split is the cross-model pass; a native-built money surface adds a Codex read-only leg *(裁-84 → 裁-86)* — **the read-only leg then TIME-BOXED SUSPENDED until beta live by 裁-111 (owner, 2026-09-01; see law 28's own note)**; **every frontend train walks its journey in a real browser on the built app** *(裁-86)*; **law 83's ceremony is post-beta** *(裁-76)*. **The Codex BUILD lane is suspended too, by 裁-133 — see law 28 and §15.**

## 15 · Sprint-ruling amendments (裁-140, 2026-09-02; each ruling's TEXT stays in its ledger, which governs on any divergence)
86. **A sprint ruling enters the ADR system as a DIGEST ROW plus an "amended by" line on the ADR it amends — never as a new ADR** *(裁-140, owner, 2026-09-02 ~23:40; permanent)*. One row here, one dated line in [`README-log.md`](README-log.md), each stating its TIME BOX and pointing at the ledger entry; a new ADR is minted only when a ruling contradicts an ADR's text outright AND permanently. Rationale: the sprint's rulings are mostly time-boxed, so writing each as a permanent ADR would manufacture the next stale record; a consolidating ADR was offered and declined. **The rows — 裁-125/129/131 live in `docs/plan/active/mohe-grill-rulings-2026-09-02.md` and 裁-133/135/139/140/141 in its continuation `docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md` (the day's ledger split there at the 500-line ceiling); 裁-111's own file is named on its row:** **裁-111** *(2026-09-01; UNTIL BETA LIVE, resumes unless the owner rules otherwise)* — law 28's cross-family Codex adversarial leg is SUSPENDED, not repealed; the one fresh-context opus review is the complete gate meanwhile (ledger `docs/plan/active/mohe-grill-rulings-2026-09-01-pm.md`; amends ADR-0077 §14). **裁-125** *(2026-09-02; UNTIL OFFICIAL LAUNCH)* — every user-facing legal text ships as an agent template, lawyer-refined at launch, and is NEVER darkened or cut. **裁-129** *(2026-09-02; permanent, figure subject to the lawyer's pass)* — the beta terms are a SEPARATE document kind from the DPA (never one combined signature), an RM 5,000 liability floor, the courts of Kuala Lumpur. **裁-131** *(2026-09-02; permanent, value SET only once C-5's attempt wall is live)* — Email OTP expiry is 60 minutes for BOTH arms and `checkout-gate-design.md` C4 is amended. **裁-133** *(2026-09-02; UNTIL BETA LIVE)* — no Codex lane of any kind, builds included; native lanes only (amends ADR-0077 §14 / law 28). **裁-135** *(2026-09-02; permanent until the owner reverses it at official launch)* — the repo is PUBLIC and CI is GitHub-hosted, the owner OVERRIDING the 裁-134 recommendation; amends law 38 and supersedes 裁-134's slot cap (see §10 and the 2026-09-02 minute). **裁-139** *(2026-09-02; permanent)* — a firm member is REFUSED at `POST /checkout` before Stripe is called, under checkout design §5's "no path may strand a paying customer without a firm". **裁-141** *(2026-09-03 ~00:10; permanent — AMENDS 裁-37)* — the ⌘K "Do" palette pre-filters on the caller's DB-computed role rank plus each door's floor TRANSCRIBED into the web, re-read on every open, **with a required DRIFT GUARD** (a cell that reads every transcribed floor against the live door's and reds when they diverge — a projection of a door is law 27(3)'s class, so it must be pinned to its source); the door stays the only authority, `clara.wake_fn_allowlist` stays invisible to application roles, and the declined alternative was a new read door over it (literal on 裁-37's first half, a breach of its second).
