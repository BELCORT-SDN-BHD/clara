# docs/plan — index

Authored at the 2026-08-12 harness docs-tree refactor, when this directory split into
`active/` (the wave currently in build) and `completed/` (every closed wave and slice, plus the
former REBUILD-PLAN.md's archived chronology). `research/` is untouched by this refactor and
keeps its own tree of per-wave cross-model research dossiers.

**The path-stability convention (made explicit 2026-08-18, at the ADR-0071 harness sweep):**
a document minted under `active/` KEEPS its minted path when its wave closes — **status
lives in this index, never in the path** — because closed-wave paths are cited verbatim by
immutable artifacts (migrations `0064`/`0065`, hooks, test batteries cite
`docs/plan/active/wave-e-…` at file:line, and a migration's bytes can never be edited).
Documents authored AFTER a wave closes (ceremony as-runs, acceptance records) land in
`completed/` directly. The convention is FORWARD-ONLY from 2026-08-12: the wave contracts
and design docs already sitting in `completed/` were created at those paths by the harness
refactor itself (commit `1a66a61`), never renamed out of `active/` — no history contradicts
this paragraph. This sentence is the reconciliation of PRD line 3's
active-then-completed wording with the citation-stability that the immutable estate
requires — the same authority split as the ζ squash-subject precedent (the directory is
the authority; frozen testimony goes stale honestly).

**Wave contracts of CLOSED waves are historical records of record: never re-grill them, cite
them.** If you're building against a closed wave's mechanism, read the file below for what was
ratified and why — don't re-open the question with the owner. Only `active/` documents describe
work still open for negotiation.

Status key: **live** = current build target, changes expected · **historical** = closed, frozen,
cite-only · **superseded** = replaced/retired, kept only as a pointer to where its content went.

## `active/` — Wave F's live build (ADR-0071 ruled 2026-08-18; live frontier 92/`0097_f_a1_cutover`)

| File | Status | Hook |
|---|---|---|
| `wave-f-contract.md` | **live** | **The Wave-F contract of record** (ADR-0071 execution): Track A the agentic core, F-A1..A9 (witness-pair extraction; agentic posting; bank, close, reporting, freeform-read, filing+interview, internet agency; metering — F-A1→F-A2 is the only hard chain, the rest fan out) ∥ Track B tax (F-T1..T4), plus **F-A10 — the retirement completion condition** (two architectures never enter Wave G). |
| `f-a1-witness-pair-design.md` | **live** | **The F-A1 design doc of record** (v3.1, 2026-08-18 night): the witness-pair mechanics under C1-C4 (cite-and-verify snap, atomic idempotent two-kind persist, `evaluate_witness_fact_state_v1` in the central evaluator freeze, resolver dispatch sparing ~30 call sites, the five-list egress wiring + the `witness_extraction` typed purpose, meter-never-cap), the D1-D12 decision register, and the PR-0..PR-4+3a build sequence. **§5 RULED in-session** (OQ-1 OpenAI-direct · OQ-2 ratified · cutover direct-release, dissent on file); **PR-0 re-shaped by owner ruling to a third NATIVE adversarial lane — RUN same night** (MERGEABLE-WITH-CONDITIONS; 3 blockers + 15 material folded, incl. B3's self-referential-withdrawal restatement and the §3.9 five-note 0017 cluster); Codex re-enters at future builds. |
| `f-a1-annexes.md` | **live** | F-A1's companion of record (split under the 500-line harness limit): Annex A the estate-as-built survey (data plane · verdict machinery · the twelve walls · runtime plane · reader lessons), Annex B the PR-0 finding-by-finding adjudication register, Annex C the §7 test-battery sketch. Wall and §7-cell references in the design doc resolve here. |
| `roadmap.md` | live | Wave F/G forward roadmap (re-scoped two-track at ADR-0071), the top-8 risks table, and the Phase-5 verification plan — carried from REBUILD-PLAN at its deletion (ADR-0069). |
| `wave-g-e2e-corpus-design.md` | live | The Wave-G factory-reset + full E2E corpus DESIGN, for the owner's sitting (owner-directed 2026-08-16): the slot matrix (3–4 additional real clients at RPR rigor, two consecutive FY closes each, green-field vs brown-field), the golden-standard handover per client, the per-client run script, the exercise-every-gate rule against the vacuous-green class, the edge-case lens, and eleven marked owner decisions. **Nothing in it is ratified**, and its step-4 "standing rules earn autopost" wording takes a G1-alignment amendment at the sitting (ADR-0071). |

## `active/` — Wave E's citation-stable historical set (CLOSED 2026-08-16; pinned here PERMANENTLY by the path-stability convention above — `packages/db/migrations/0064_wave_e_theta_close_plan.sql`, `0065_wave_e_epsilon_reporting.sql`, `scripts/hooks/pinned-ids-guard-checks.mjs`, and the `x55`/`x56`/`x57`/`er9-corpus-fixtures` test batteries cite these ten paths verbatim by filename and can never be repointed)

| File | Status | Hook |
|---|---|---|
| `wave-e-contract.md` | historical | The Wave E contract of record, E-R1..E-R14 (ADR-065) — ratified, never re-grilled (digest law 67); cite-only now the wave is ceremonied. **ADR-0071 supersedes specific clauses in place** (E-R5/E-R18 approver, E-R11 key ①, E-R13 absorbed, #25) — the file's bytes stay; the ADR names the changes. |
| `wave-e-design-skeleton.md` | historical | Campaign design skeleton, §1–§2.8 (part 1 of 4) — as-built; the ceremony as-runs are the operative record. |
| `wave-e-design-skeleton-part2.md` | historical | Skeleton continued, §2.9–§2.12 (the E-R6 close-model / E-R12 client-facts hookup). |
| `wave-e-design-skeleton-part3.md` | historical | Skeleton continued, §3–§6. |
| `wave-e-design-skeleton-part4.md` | historical | Skeleton conclusion. |
| `wave-e-design-reporting.md` | historical | The FS/reporting-engine design half (part 1 of 2). |
| `wave-e-design-reporting-part2.md` | historical | Reporting design continued. |
| `wave-e-acceptance-matrix.md` | historical | The acceptance matrix (part 1 of 2) — the five `completed/` ceremony as-runs are now the acceptance evidence of record. |
| `wave-e-acceptance-matrix-part2.md` | historical | Matrix continued: Section F and the cross-section sweeps. |
| `wave-e-delta-handoff-2026-08-13.md` | historical | Clock-out checkpoint for δ final-finding closure — **discharged by the night run**; kept as the rulings' source of record. |

*(These ten stay physically in `active/` forever — see the path-stability convention above. Their ceremony as-run records, which physically live in `completed/` already, are listed there under "Wave E → F ceremony as-run chronology", not here.)*

## `completed/` — closed waves and slices

### Phase 3 (Slices 3–6)

| File | Status | Hook |
|---|---|---|
| `slice3-event-spine-contract.md` | historical | Slice 3: `domain_events` + outbox + relay contract. |
| `slice4-durable-runtime-contract.md` | historical | Slice 4: the durable WDK runtime-skeleton contract. |
| `slice5-document-pipeline-contract.md` | historical | Slice 5: upload → OCR → persist-unassigned → assign contract. |
| `slice5-migration-0007-design.md` | historical | Slice 5's migration `0007` design. |
| `slice5-as-built-amendments.md` | historical | Slice 5 as-built deviations from its contract. |
| `slice6-thin-e2e-contract.md` | historical | Slice 6 (GATE 3 thin end-to-end demo) contract. |
| `slice6-migration-0009-design.md` | historical | Slice 6's migration `0009` design. |
| `slice6-delegated-decisions.md` | historical | Slice 6 decisions delegated to build time. |
| `slice6-as-built-amendments.md` | historical | Slice 6 as-built deviations. |

### Wave A / A2 / A2.1 (CLOSED, ADR-022..030)

| File | Status | Hook |
|---|---|---|
| `wave-a-daily-loop-contract.md` | historical | Wave A: the daily coding loop contract. |
| `wave-a-migration-0011-design.md` | historical | Wave A's migration `0011` design. |
| `wave-a-as-built-amendments.md` | historical | Wave A as-built deviations. |
| `wave-a2-ar-myinvois-contract.md` | historical | Wave A2: AR / MyInvois UBL / SST 3-leg / CN-DN / purchase-only autopost contract. |
| `wave-a2-migration-0015-design.md` | historical | Wave A2's migration `0015` design. |
| `wave-a2.1-contract.md` | historical | Wave A2.1: the eval-finding ledger + ADR-026 deferrals, WA21-R13. |
| `wave-a2.1-migration-0016-design.md` | historical | Wave A2.1's migration `0016` design. |

### Wave B (CLOSED on intent, ADR-044..046)

| File | Status | Hook |
|---|---|---|
| `wave-b-contract.md` | historical | Wave B: knowledge + onboarding contract, WB-R1..R18 (ADR-032). |
| `wave-b-migration-0017-design.md` | historical | Wave B's migration `0017` design (part 1 of 3). |
| `wave-b-migration-0017-design-part2.md` | historical | Migration `0017` design continued. |
| `wave-b-migration-0017-design-part3.md` | historical | Migration `0017` design concluded. |
| `wave-b-migration-0018-design.md` | historical | Migration `0018` design (Gate-K domain). |
| `wave-b-migration-0019-design.md` | historical | Migration `0019` design (the wiki authority boundary). |
| `wave-b-migration-0020-design.md` | historical | Migration `0020` design (typed consent). |

### Wave C (CLOSED, ADR-051..054)

| File | Status | Hook |
|---|---|---|
| `wave-c-contract.md` | historical | Wave C: money movement contract, WC-R1..R12 (ADR-051). |
| `wave-c-a-subledger-design.md` | historical | C-a: AR/AP open-item subledger + allocation design, WCA-R1..R9. |
| `wave-c-b-bank-design.md` | historical | C-b: bank statement ingest + matching design (part 1 of 3). |
| `wave-c-b-bank-design-part2.md` | historical | C-b design continued. |
| `wave-c-b-bank-design-part3.md` | historical | C-b design concluded. |
| `wave-c-c-tieout-design.md` | historical | C-c: tie-out / aging / learn-loop design, WCC-R1..R8 (part 1 of 2). |
| `wave-c-c-tieout-design-part2.md` | historical | C-c design continued — the round record + ratified deviations. |

### Wave D (COMPLETE, ADR-055..059)

| File | Status | Hook |
|---|---|---|
| `wave-d-contract.md` | historical | Wave D: assets + adjustments contract, WD-R1..R15 (ADR-055). |
| `wave-d-a-fa-design.md` | historical | D-a: fixed-asset register design (part 1 of 2). |
| `wave-d-a-fa-design-part2.md` | historical | D-a design continued — the round-2 record. |
| `wave-d-b-design.md` | historical | D-b: adjustments + advances DESIGN-TIME record — banner: describes a monolith that never shipped as designed; see `wave-d-b-asbuilt.md` for the real shape. |
| `wave-d-b-design-abi.md` | historical | D-b's builder ABI (signatures, DDL blocks, op-key matrix) — DESIGN-TIME only, same banner. |
| `wave-d-b-design-part2.md` | historical | D-b design ladder record continued. |
| `wave-d-b-design-part3.md` | historical | D-b design ladder record concluded. |
| `wave-d-b-asbuilt.md` | historical | D-b AS-BUILT record — the real four-slice split (`0042`/`0043`/`0044`/`0045`), ADR-058/059. |
| `wave-d-b-asbuilt-part2.md` | historical | D-b as-built ladder record continued. |

### §7-A — the unattended sales drafter (CLOSED, ADR-063/064)

| File | Status | Hook |
|---|---|---|
| `wave-7a-contract.md` | historical | §7-A contract, 7A-R1..R12 (ADR-063). |
| `wave-7a-design-skeleton.md` | historical | §7-A design skeleton v2. |
| `wave-7a-acceptance-h1.md` | historical | §7-A acceptance, half 1 — 22 real ROME SECRETARY invoices. |
| `wave-7a-acceptance-h2.md` | historical | §7-A acceptance, half 2 — sandbox unattended posts + the nine-controls receipt battery. |

### The extraction slice + settlement program (CLOSED, ADR-047/048)

| File | Status | Hook |
|---|---|---|
| `extraction-slice-contract.md` | historical | Re-extract verb + governed high-stakes verb + two-reader-corroboration-last contract. |
| `extraction-slice-x7-field-record.md` | historical | The reader's field story on the 7 real affected documents. |

### Autopost vendor binding

| File | Status | Hook |
|---|---|---|
| `autopost-vendor-binding-design.md` | historical | The autopost vendor-binding design (part 1 of 2). |
| `autopost-vendor-binding-design-part2.md` | historical | Vendor-binding design continued. |

### The currency defect (task #24 — reader half SHIPPED, PR #133; override half deferred)

| File | Status | Hook |
|---|---|---|
| `currency-defect-design.md` | historical | The currency-reader design + measured defect (part 1 of 2). Archival note in-file: nothing here re-opens a shipped decision. |
| `currency-defect-design-part2.md` | historical | The remedy decision — reader now, override deferred behind a named trigger (part 2 of 2). |

### Wave E — first strike + closed lane records

| File | Status | Hook |
|---|---|---|
| `wave-e-f6f9-acceptance.md` | historical | The F6–F9 fix-batch acceptance record (ADR-066). |
| `wave-e-lane-alpha-acceptance.md` | historical | Lane α as-run acceptance record (`0055`, PR #226). |
| `wave-e-lane-beta-acceptance.md` | historical | Lane β as-run acceptance record (`0056`, PR #228). |
| `wave-e-lane-gamma-acceptance.md` | historical | Lane γ as-run ceremony record: `0057` applied quiesce-free, E5 taken live, the trap re-proven (PR #231). |

### Wave E → F ceremony as-run chronology

| File | Status | Hook |
|---|---|---|
| `wave-e-delta-ceremony-asrun.md` | historical | The 0058-0063 live ceremony as run: positive reads, the two field findings (SUSET, pooler-pid), deviations with grounds, the no-print DSN bridge. |
| `wave-e-theta-epsilon-ceremony-asrun.md` | historical | The 0064-0072 live ceremony as run (θ+ε together): 9/9 clean, backup-first, the Windows pnpm-shim trap, the probe-defect lesson, the live #43 gate. |
| `wave-e-final-ceremony-asrun.md` | historical | The 0077-0084 live ceremony as run (η wake wrappers + ζ render family + B4): D1 write-quiesce, the chatTurn v11 deploy, the freeze deploy-lock (140/140), positive reads throughout. |
| `b3-reopen-ceremony-asrun.md` | historical | The 0085-0086 live ceremony as run (B3): backup-first, D1 quiesce, ALL-PASS positive reads (81/`0086`, the segregated 5-arg body, the 4-arg form gone), two probe instrument defects owned in-line. |
| `masb-wording-ceremony-asrun.md` | historical | The 0087-0088 live ceremony as run (#43): backup-first, no quiesce, ALL-PASS reads (83/`0088`; en 5/5 + zh 5/5 verified — E-R14 OPEN; ms 4/5 per the sign-off), the owner's three dispositions of record. |
| `f-a1-pr1-ceremony-asrun.md` | historical | The 0089-0095 live ceremony as run (F-A1 PR-1, 2026-08-19): backup-first, D1 with the 110s staleness wait (the 0023-lineage in-file quiesce guard's first live FIRING), 28/28 positive reads (90/`0095`), evaluator deploy flip 2→4 + `--lock-deployed`, the sslmode deviation + dsn-pipe harness gap recorded, the live statement-pair coin-flip measured (15 docs/24 pairs). |

### The former REBUILD-PLAN.md + the PROGRESS archive

| File | Status | Hook |
|---|---|---|
| `rebuild-plan-history.md` | historical | The former REBUILD-PLAN.md's verbatim Phase-3 + Phase-4 dated STATUS chronology, archived at this refactor. |
| `progress-archive-2026-08.md` | historical | PROGRESS.md's split-out (the outgrow law, 2026-08-18): the sixteen terminal Wave-E lane rows + the session log through 2026-08-16, verbatim. |
| `pr232-body-notes.md` | historical | PR #232's body-notes material (the harness grand refactor) — re-homed at the 2026-08-18 sweep from the repo root, where it sat as *_PR-BODY-NOTES.md*; bytes untouched. |

## `docs/plan/` root

| File | Status | Hook |
|---|---|---|
| `research/` | reference | Supporting cross-model research dossiers, organized per wave/slice. Not restructured in this pass — cite the specific dossier inside it, not this line. |
| REBUILD-PLAN.md | **superseded (deleted)** | Retired at this refactor. Its dated chronology → `completed/rebuild-plan-history.md`; its `coding_kind` roadmap table → `../ARCHITECTURE.md` ("Roadmaps" section); its CURRENT posture → `PROGRESS.md`; Wave F/G + Risks + Phase 5 → `active/roadmap.md`. |
