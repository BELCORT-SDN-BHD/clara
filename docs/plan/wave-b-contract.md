# Wave B — knowledge + onboarding: design contract v1.0 (RATIFIED)

**Status: RATIFIED 2026-07-23** — owner rulings **WB-R1..WB-R18** (the grill of 2026-07-23),
on the v0.2 draft (7-reader grounding fan-out + the cross-model adversarial debate memo,
both under `docs/plan/research/wave-b/`). This document is the law for the Wave B build
lanes. Recorded as **ADR-032**. Scope source: `docs/plan/REBUILD-PLAN.md:62`.

Build areas: **B-I** the client wiki (Layer 1: ingest/query/lint, pack injection, lint
schedule) · **B-II** firm/client onboarding interviews as durable runs · **B-III**
ongoing-client carry-down (one-shot, idempotent, TB tie-out, FA baseline) · **B-IV** bulk
rule/knowledge seeding from prior GL (Karpathy direction).

---

## 1. The rulings (WB-R1..R18 — each is binding)

- **WB-R1 — client lifecycle.** Clients carry a new **`onboarding` status** from identity
  interview until the onboarding commit: the id/CoA/identifiers exist (real FKs for
  dry-run validation), but every operational consumer (belts, queue, coding lanes, SST
  watch, autodraft, classify) **structurally excludes non-active clients** via the shared
  client-enumeration guard — negative-tested per consumer. Activation flips exactly at
  commit. Interview must-asks live on the plan-as-document object and block ONLY the
  commit — they never enter `_open_question_blocks`/CLR26. `create_firm` gains a
  receipt-idempotent wrap story for the durable firm interview.
- **WB-R2 — bulk seeding = the tick-list ceremony.** The prior-GL seeder creates a typed
  **seeding-proposal batch** (new proposal kind; provenance + frequency metrics live ON
  THE PROPOSAL). At dry-run review an **admin ticks** the mappings they professionally
  confirm — each tick mints one real per-rule signature (`vendor_account` rules go live;
  counterparties birthed first); unticked mappings stay open proposals. The C-11
  candidate tier stays dead — the proposal object IS the landing state. No sighting-pool
  entries from prior GL, ever; no autopost rules from seeding, ever.
- **WB-R3 — F3 split by layer (LAW clarification).** Typed Layer-2 side-effects
  (sightings, open questions, profile facts) stay same-transaction. Layer-1 page
  synthesis is an **event-spine projection**: the F3-satisfying artifact is the
  transactional event emission; projection lag is SURFACED (the pack carries the wiki's
  last-projected marker vs `books_version`); the freshness token stays authoritative.
- **WB-R4 — atomic set approval for carry-down.** One distinct-human checker signs the
  reviewed dry-run ONCE; one serializable transaction locks the seed-registry row,
  verifies plan revision + source-document hashes + every entry revision + maker≠checker,
  approves the complete set, finalizes the registry. Per-entry approval rows are recorded
  under the batch object. Solo-firm attestation variant preserved. Same-op retry replays
  its receipt byte-identically; a second semantic seed RAISES.
- **WB-R5 — no takeover-cutoff guard in Wave B.** Post-tie-out back-dating is watched,
  not blocked: the daily lint belt re-checks the opening-TB tie and raises a named queue
  finding on breakage (visibility-over-constraint, the owner's standing preference);
  Wave E's lock system closes it structurally. The **opening supersede verb ships
  anyway** (required for corrections; posts at the governed opening date and re-asserts
  the tie-out atomically).
- **WB-R6 — the wiki authority boundary.** Wiki content MAY inform draft proposals (the
  feature). STRUCTURAL: (1) no gate/bound/floor/autopost fn reads wiki tables —
  dependency-audited + negative-tested; (2) pre-v7 consumers never see the wiki block;
  (3) a draft's authority path is bit-identical with and without wiki content; (4) a
  wiki-informed draft carries the wiki citation in its visible reasoning.
- **WB-R7 — autoDraft_v3 ships wiki-aware** in the same ceremony (sweep drafts are still
  human-reviewed under the acknowledgement floors). Cost accepted: the ceremony bumps
  BOTH `chatTurn_v7` and `autoDraft_v3`; the eval carries a sweep-specific W2 probe.
- **WB-R8 — budgets (mechanism = law; values = named config, retunable by ADR).**
  ≤40 pages/client · ≤8 KB/page · pack wiki block ≤6 pages AND ≤12 KB by relevance rank
  (the budgeted-CTE pattern) · lint daily on the per-client belt (never firm-wide locks).
- **WB-R9 — no human gate on wiki pages.** Controls: versioning (every edit reversible),
  provenance citation, daily lint to the owner, the WB-R6 boundary. Human gates live on
  Layer 2 only.
- **WB-R10 — consent/egress.** Wiki synthesis rides the existing WA2-R2 envelope +
  governed-egress registry; revocation/absence ⇒ the claim-boundary held state (visible);
  **deterministic ingest** (index + provenance, no synthesis) keeps onboarding functional
  without consent.
- **WB-R11 — SST continuity (B-9).** Carried open AR/AP items record their SST facts
  (portion, rate, basis) as typed columns at takeover; NO SST legs posted, no return
  logic — Wave F consumes the fields.
- **WB-R12 — uncleared bank items (B-15).** Carried **per-item** as opening bank entries
  in Wave B; Wave C's matching consumes item granularity.
- **WB-R13 — materials registry (GAP2-2).** SUBSUMED by the document pipeline + wiki
  ingest + provenance-cited pages; the scan-to-proposal lane arrives via WB-R2.
- **WB-R14 — curator (GAP2-4).** Mining DEFERRED; lint stays hygiene-only
  (contradictions, staleness, orphans, caps, the WB-R5 opening-TB tie watch).
- **WB-R15 — tie-out is document-primary.** The prior-year signed TB / management
  accounts upload (sha256, `opening_balance_doc`) is the tie target; dry-run shows
  computed-vs-document deltas per line. Keyed-in figures are the FALLBACK via the typed
  non-document provenance extension, attributed to the entering staff member.
- **WB-R16 — eval vehicles: BOTH.** A real second client runs the full journey (Gates
  O + K) as its real takeover pack arrives (same discipline as the S/P follow-on); RPR's
  real, unused management accounts close the **B-12 incremental carry-down** lane on the
  live books. Never synthetic documents.
- **WB-R17 — the close-gate set (the wave's DONE definition)** — §4 below, ratified.
- **WB-R18 — ONE ceremony.** A single migration **0017** (the wave's DB heart) + one
  owner-gated ceremony deploying runtime **v25** (`chatTurn_v7`, `autoDraft_v3`, the lint
  belt + wiki-projection consumers). Supavisor headroom check FIRST (~26/60 today).
- Dissolved/deferred en-route: **N8** moot (no rule-confidence exists; the signature is
  the authority — amendment A7) · **C-13** defers with decay itself (none exists live) ·
  **B-14** fixtures (PSR, recurring templates, recon hints) = explicit tracked to-dos on
  the plan object, not captured in Wave B.

## 2. Binding pins (carried from the draft, as amended by the debate)

P1–P16 of the v0.2 draft carry with these amendments: **P1** reads through WB-R6 (the
authority boundary is the structural meaning of "informs, never decides"); **P5** is
implemented via the purpose-literal gate (the wiki block renders ONLY for the new v7
purpose; v4 is additive-but-dark to every existing consumer; rollback preflight re-checks
non-terminal runs); **P8** additionally requires 0017 to add the **OBE marker** (and a
retained-earnings marker decision) to `special_acc_type`, decide non-straight-line
depreciation at carry-down (widen vs refuse per asset), and pin asset↔opening-entry
linkage (`acquisition_entry_id` + a per-asset cost/accum/NBV tie assertion); **P10**
drops the "@1.000" idiom — a live rule's authority is the human signature alone, all
metrics stay on the proposal object; **P7** gains the WB-R4 concurrency protocol.

Additional pins from the debate: **P17** wiki artifact protocol — deterministic immutable
Storage keys, content hashes, upload→verify→publish states, projection receipts, orphan
repair; events carry enough immutable metadata to rebuild the index by replay (never
re-synthesis); query stays pure — file-back dispatches the audited ingest writer. **P18**
lint findings are first-class: identity/dedupe key, open→superseded/resolved/recheck
transitions, a resolution verb, exactly-once notification, a queue `row_kind` +
hydration card (the queue's unknown-kind placeholder is not an acceptable surface).
**P19** interview outputs persist only in the durable run's checkpoints + the
plan-as-document object until commit (never-store-flawed-data); incremental carry-down
(B-12) resumes the same plan with the 'still to capture' checklist.

## 3. Slicing (dependency-ordered; adversarial-review budget concentrates on B4/B5)

- **B1 — wiki core:** 0017 wiki tables + audited writers + Storage doctrine + the
  projection consumer + deterministic ingest; pack v4 (purpose-gated) + `chatTurn_v7` +
  `autoDraft_v3` framing; budgets enforced.
- **B2 — lint:** the per-client belt + P18 findings lifecycle + caps + the WB-R5
  opening-TB tie watch.
- **B3 — onboarding interviews:** the durable interview family (salvaged 13-Q/11-Q
  content, validators, echo-back, dry-run gates) + `onboarding` status + the shared
  exclusion guard + plan-as-document + LHDN-verified CoA seed (incl. F12-11 marker
  fixes) + `open_questions` origin widening (0017 constraint swap).
- **B4 — carry-down:** seeded-once registry + the OB writer family (human-lane,
  per-item, OBE-plug, WB-R11 SST fields, WB-R12 bank items) + `fixed_assets` books-grade
  discipline + FA baseline + dated-TB read fn + WB-R15 tie-out + the supersede verb +
  the WB-R4 batch-approval object + B-12 incremental lane.
- **B5 — seeding:** prior-GL parse (rides the Wave-A intake classes) + the WB-R2
  tick-list ceremony + proposal lane + wiki seeding + mass counterparty birthing.

One migration (0017), one ceremony (WB-R18), runtime v25. Cross-model adversarial ladder
before merge on B4/B5 (money/approval-path; ~6-round budget per ADR-029); blind
contract-battery lanes per the ADR-029 pattern.

## 4. The close gates (WB-R17 — Wave B is DONE only here; real documents only)

**Live gates:** **O** — a real client onboarded via the durable interview: kill the
runtime mid-interview; resume a ≥48h park; dry-run → distinct-checker commit; plan shows
intended-vs-actual; zero flawed rows pre-commit; the client invisible to every
operational consumer until activation. **K** — carry-down to the sen against the real
prior TB document: tie-out asserts, OBE nets zero, re-run does ZERO writes, double-seed
RAISES, supersede corrects one item cleanly at the opening date; PLUS the RPR
incremental variant on its real management accounts (WB-R16). **W2** — the authority
boundary live: no authority fn reads wiki (dependency audit), frozen consumers wiki-dark,
authority path bit-identical with/without wiki, citations visible; PLUS the autoDraft_v3
sweep variant (WB-R7). **L** — a genuinely conflicting pair of REAL sources surfaces as
a lint finding on schedule; caps enforced visibly; the opening-TB tie watch live. **R2**
— the tick-list ceremony mints real per-rule signatures; zero sighting-pool entries from
prior GL; a seeded rule participates in live coding under its signature. **F** — FIRM
onboarding runs live as a durable run. **Rig-confined fault gates:** concurrent
seed/answer races; failure-after-N-items resume; interview cancellation/expiry;
stale-plan-after-park refusal; cross-firm SECURITY DEFINER probes; a large-corpus
token-ceiling run; v25 upgrade with parked runs + rollback preflight (non-terminal-run
check). Gate deferral needs an owner ruling; fabricated documents never.

## 5. Standing context

Canary `daba7f2e` ARMED, due 2026-08-02 — never answer. `main` PR-only; merge grant =
green CI + clean review. Freeze manifest append-only; next bumps: `chatTurn_v7`,
`autoDraft_v3` (v25). Supavisor headroom re-verify before the new consumers land. The
S/P follow-on eval shares the next real-document window with WB-R16's second-client
vehicle. OpenAI quota watch stands.
