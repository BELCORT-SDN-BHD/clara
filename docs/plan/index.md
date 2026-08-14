# docs/plan — index

Authored at the 2026-08-12 harness docs-tree refactor, when this directory split into
`active/` (the wave currently in build) and `completed/` (every closed wave and slice, plus the
former REBUILD-PLAN.md's archived chronology). `research/` is untouched by this refactor and
keeps its own tree of per-wave cross-model research dossiers.

**Wave contracts of CLOSED waves are historical records of record: never re-grill them, cite
them.** If you're building against a closed wave's mechanism, read the file below for what was
ratified and why — don't re-open the question with the owner. Only `active/` documents describe
work still open for negotiation.

Status key: **live** = current build target, changes expected · **historical** = closed, frozen,
cite-only · **superseded** = replaced/retired, kept only as a pointer to where its content went.

## `active/` — Wave E, in build (contract ratified ADR-065, campaign design landed PR #223)

| File | Status | Hook |
|---|---|---|
| `wave-e-contract.md` | live | The Wave E contract of record, E-R1..E-R14 (ADR-065). |
| `wave-e-design-skeleton.md` | live | Campaign design skeleton, §1–§2.8 (part 1 of 4). |
| `wave-e-design-skeleton-part2.md` | live | Skeleton continued, §2.9–§2.12 (the E-R6 close-model / E-R12 client-facts hookup). |
| `wave-e-design-skeleton-part3.md` | live | Skeleton continued, §3–§6. |
| `wave-e-design-skeleton-part4.md` | live | Skeleton conclusion. |
| `wave-e-design-reporting.md` | live | The FS/reporting-engine design half (part 1 of 2). |
| `wave-e-design-reporting-part2.md` | live | Reporting design continued. |
| `wave-e-acceptance-matrix.md` | live | The acceptance matrix, minted before build: how to read a cell, then Sections A–E (part 1 of 2). |
| `wave-e-acceptance-matrix-part2.md` | live | Matrix continued: Section F (the E-R12 client-facts trio) and the cross-section sweeps, run order and closing-verification template. |
| `roadmap.md` | live | Wave F/G forward roadmap, the top-8 risks table, and the Phase-5 verification plan — carried from REBUILD-PLAN at its deletion (ADR-0069). |
| `wave-e-delta-handoff-2026-08-13.md` | live | Clock-out checkpoint for δ final-finding closure: owner rulings, sole-writer ownership, acceptance hold, working-tree custody and exact resume order. **Discharged by the night run** — kept as the rulings' source of record. |
| `wave-e-delta-ceremony-asrun.md` | completed/ | The 0058-0063 live ceremony as run: positive reads, the two field findings (SUSET, pooler-pid), deviations with grounds, the no-print DSN bridge. |

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

### The former REBUILD-PLAN.md

| File | Status | Hook |
|---|---|---|
| `rebuild-plan-history.md` | historical | The former REBUILD-PLAN.md's verbatim Phase-3 + Phase-4 dated STATUS chronology, archived at this refactor. |

## `docs/plan/` root

| File | Status | Hook |
|---|---|---|
| `research/` | reference | Supporting cross-model research dossiers, organized per wave/slice. Not restructured in this pass — cite the specific dossier inside it, not this line. |
| REBUILD-PLAN.md | **superseded (deleted)** | Retired at this refactor. Its dated chronology → `completed/rebuild-plan-history.md`; its `coding_kind` roadmap table → `../ARCHITECTURE.md` ("Roadmaps" section); its CURRENT posture → `PROGRESS.md`; Wave F/G + Risks + Phase 5 → `active/roadmap.md`. |
