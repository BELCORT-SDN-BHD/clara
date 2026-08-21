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
| `f-a2-agentic-posting-design.md` | **live** | **The F-A2 design doc of record** (v4, 2026-08-20): the one unattended coder that replaces draft-only `autoDraft` across every document class (`journal_entry` generic included, superseding 7A-R7/ADR-063) — the `wake_post_entry` wrapper over an ungranted core over the SHARED approve core, the **four-tier gate ladder** (A raise · B the fourteen-rung all-evaluated receipt vector · C `(errcode, reason)` pair conversion · D the deferred belts), acting identity on `entry_post_receipts`, N1/T3's receipt-keyed pin, the breeding excision (the 8th `_approve_entry_core` body), the pack's recomputed patterns block, chat parity via the extend-only `interactive_client` wake kind, the `posted` outcome chain, and the PR-0..PR-4 build sequence over two D1 windows. **§4 RULED:** OQ-1 (any amount, no thresholds — the agent's contrary recommendation on file as dissent) · **OQ-4 the three-exits shape** · **OQ-6 no category gate on the agent lane, with the human lane's gate STANDING** (ADR-0072). OQ-2/3/5 stay open with recommendations. |
| `f-a2-annexes-1-estate.md` | **live** | F-A2 annex 1 of 3 (the 500-line split): **Annex A** the estate as-found and the seven findings at the bytes · **Annex B** the retirement checklist — artifact dispositions, the closed-world rosters and the `appliedStem`-gated cohort, CI/lint/partition obligations, the two missed censuses, the WB-R2 assertion sites, the 0040 marker dispositions, PR-1's two files. |
| `f-a2-annexes-2-mechanics.md` | **live** | F-A2 annex 2 of 3: **Annex C** the test battery (C.1-C.16, contract-blind cells marked) · **Annex D** the tier census predicted from `pg_trigger` for rig replay, the `interactive_client` decision record with its reader census, T3's mechanism, OQ-4's re-derivation trigger, the context-pack splice, and every wake-kind-keyed wall with a disposition. |
| `f-a2-annexes-3-record.md` | **live** | F-A2 annex 3 of 3: **E** the closed refusal vocabulary + `entry_post_receipts`' column list · **F** the `posted` outcome chain (four layers + six sites) · **G** the change log, incl. **F33 — OQ-6's supplementary ruling that the HUMAN lane's category gate stands unchanged** · **H** the D1-D28 decision register · **I** B4's three formulas and their derivations. |
| `f-a2-statement-activation-spec.md` | **live** | **The F-A2 Window-B spec of record** — the bank-statement witness ACTIVATION, i.e. the bound follow-up F-A1 PR-4 shipped UNPOINTED: the router re-key (`bank_statement` arm's engine identity → the witness snapshot, `v_lane` UNMOVED per 0098's LANE DECISION) + the statement typed-consent re-key to `witness_extraction`, and the `statementFacts_v2` registry repoint. Carries §2 the migration + its whole-body prestate pin, **§5 the one-window ceremony recipe** (the machine stays STOPPED across BOTH the apply and the repoint deploy — the one gap with no DB-side guard), **§6 the per-client consent COVERAGE set difference** (a read that can say NO; a global count cannot), §7 the LANE DECISION and the precise scope of the coin-flip heal (routing-population effect, NOT an ancestor repair), §8 the battery + positive-read list, and §9's five adjudications. Built as `0102_f_a2_statement_activation.sql`. |
| `roadmap.md` | live | Wave F/G forward roadmap (re-scoped two-track at ADR-0071), the top-8 risks table, and the Phase-5 verification plan — carried from REBUILD-PLAN at its deletion (ADR-0069). |
| `wave-g-e2e-corpus-design.md` | **live** | **The Wave-G corpus's CONTRACT OF RECORD for what the 2026-08-20 sitting ruled** (ADR-0072 ⑤), and a design for what it did not. Ruled and binding: **§3.0's two-tier reshape** (an ORACLE tier — BEE across two FYs, ROME SECRETARY and ROME PROPERTIES as single terminal periods — plus an **open-intake REALITY tier**, because two of the three designated clients are terminal-period books for companies in strike-off and can never supply a second consecutive FY) · **§10's eleven OD rulings** (custody FULL PERMISSION with the IC copy excluded · **no second principal**, so B3's distinct-checker arm ships named-unexercised · a **whole clean product DB on the live project**, sandbox and fixtures not re-created · the **UX floor precedes the run**) · and **§5's step-4 G1 amendment** — *"standing rules earn autopost"* is dead, F-A2's agent judgement is the authority. Still design: the slot matrix's axes, the golden-standard package, the run script, the vacuous-green rule and the edge-case lens (now incl. **EC-14, the strike-off/terminal period**). |
| `wave-g-corpus-oracle-assessment.md` | **live** | The corpus's evidence companion (2026-08-20, read-only, nothing copied or modified): per-client verdicts against §4's seven-item package, **the named gaps that must close before an acceptance run can start** (BEE has no GL and no TB for either FY; RPR is missing two months of bank statements and has no accounts at a period end; neither RS nor RPR names a producer), what the assessment CONFIRMED (BEE's bar verified against the client's own papers; its bank ties to both balance sheets to the sen; RS and RPR genuinely greenfield), the exclusions and fixture sets (the IC copy · 68 byte-duplicates · the ~32 USD invoices, retained as the FX-lite fixture), the OCR-hardest classes, and the personal-data inventory behind OD-4. |

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
| `f-a2-window-ab-ceremony-asrun.md` | historical | **The F-A2 opener train's activation, as run (2026-08-21) — and the corpus re-measure in the same file.** Windows A and B were **COMBINED**, with the grounds recorded (a fully-merged train makes a split create a stall gap, not separate risk; both flips independently reviewed; machine STOPPED across both). Live 92/`0097` → **97/`0102`**, runtime v65 → **v66**. Carries: the backup banked first · the pre-window PROCESS reads **and the `$`-expansion instrument failure the positive control caught** · the tripwire ALL-PASS plus one abort taken BEFORE any stop · the 5-migration apply · the probe 20/21 with the one red owned as a **probe defect** (B3 precedent) · the evaluator flip 4/4→5/5 · **the `0102` coverage probe SAYING NO as designed**, naming the synthetic sandbox firm, adjudicated ACCEPTED · v66's in-VM bundle greps, `/ready` 200, zombie sweep 0 · **the re-measure: 12/20 vs 0/20 like-for-like, the denominator rule verbatim, prediction 14/20 with every miss named, lock 3 firing on the one genuine registrant, type_code 19×`01` + 1×`03` correct** · five findings for the next round · the deploy-lock of both manifests. |

### The former REBUILD-PLAN.md + the PROGRESS archive

| File | Status | Hook |
|---|---|---|
| `rebuild-plan-history.md` | historical | The former REBUILD-PLAN.md's verbatim Phase-3 + Phase-4 dated STATUS chronology, archived at this refactor. |
| `progress-archive-2026-08.md` | historical | PROGRESS.md's split-out (the outgrow law, 2026-08-18): the sixteen terminal Wave-E lane rows, the session log through 2026-08-16, the superseded posture bullets, the tombstones, and the 2026-08-20 backlog-disposition REASONING — all verbatim. **Itself split 2026-08-21** when it passed 500 lines; see part 2. |
| `progress-archive-2026-08-part2.md` | historical | The archive's own outgrow split (2026-08-21, the same SPLIT-never-prune law applied one level up): the 2026-08-18/19 F-A1 build-night session-log entries, the 2026-08-20 night's entry, and the two Known issues resolved at or before the combined Window A+B — BEE's opening-TB discrepancy, and the statement-pair coin flip whose ACTIVATION heal-point `0102` finally made real. Verbatim. |
| `pr232-body-notes.md` | historical | PR #232's body-notes material (the harness grand refactor) — re-homed at the 2026-08-18 sweep from the repo root, where it sat as *_PR-BODY-NOTES.md*; bytes untouched. |

## `docs/plan/` root

| File | Status | Hook |
|---|---|---|
| `research/` | reference | Supporting cross-model research dossiers, organized per wave/slice. Not restructured in this pass — cite the specific dossier inside it, not this line. |
| REBUILD-PLAN.md | **superseded (deleted)** | Retired at this refactor. Its dated chronology → `completed/rebuild-plan-history.md`; its `coding_kind` roadmap table → `../ARCHITECTURE.md` ("Roadmaps" section); its CURRENT posture → `PROGRESS.md`; Wave F/G + Risks + Phase 5 → `active/roadmap.md`. |
