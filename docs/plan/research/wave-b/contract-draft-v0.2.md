# Wave B — knowledge + onboarding: design contract DRAFT v0.2 (pre-grill; §7 = debate round 1)

**Status: DRAFT.** Produced 2026-07-23 from the 7-reader grounding fan-out (digest:
`Temp\clara-wave-b-grounding-digest.md`, raw: `Temp\clara-wave-b-grounding-raw.json`).
Not law. Path to law (house pattern, ADR-028): cross-model design debate on this draft →
owner grill (`/grillme`) → rulings WB-R* → ratified `docs/plan/wave-b-contract.md` v1.0 via PR.

Scope source: `docs/plan/REBUILD-PLAN.md:62`. Four build areas:

- **B-I — the client wiki (Layer 1):** ingest/query/lint; markdown pages in Storage +
  `wiki_pages` Postgres index; provenance-cited, versioned; injected into every context pack;
  scheduled lint surfacing contradictions/staleness to the owner.
- **B-II — onboarding interviews as durable runs:** firm + client onboarding as durable,
  parkable, resumable checkpointed workflow runs (kills the B-1/B-4 death class).
- **B-III — ongoing-client carry-down:** one-shot, idempotent, TB tie-out; opening GL +
  AR/AP open items + FA register rows + depreciation baseline (FA *workflows* are Wave D).
- **B-IV — bulk rule/knowledge seeding from prior GL:** per the Karpathy direction
  (ADR-004), never the superseded Desktop notes.

---

## 1. Binding pins (non-negotiable; deduped from PRD / ARCHITECTURE / Gate-1 / as-built)

P1. **Two-layer law:** the wiki informs; the typed layer decides. No wiki page may select an
    account, lower a gate, widen/create/trigger a rule, or authorise a write; wiki content is
    inert data on read. (PRD LAW 14 + §6a:142; ADR-004; ADR-025 Layer-2-only condition.)
P2. **Layer 1 = exactly three verbs** — ingest, query, lint — over immutable raw sources;
    pages interlinked, versioned, provenance-cited; page taxonomy: profile, counterparties,
    treatments, recurring patterns, open questions, period context. (PRD §6a:139; ARCH §5:134.)
P3. **Bounded wiki:** lint caps page count/size per client; packs inject by relevance budget;
    advisory-only so degradation is graceful. Numbers must be FIXED in this contract
    (REBUILD-PLAN Risk 4 — currently unnumbered anywhere).
P4. **Wiki injection = context-pack v4**, landed exactly like v2/v3: CREATE OR REPLACE same
    signature, prior body byte-identical, new block appended last, version literal bumped,
    prosrc self-check (0016:4252–4351 pattern). Pack body stays ONE data-reading statement
    (books_version shares the snapshot; N4). SECURITY DEFINER ⇒ the wiki join carries its own
    firm/client predicate — RLS will not backstop it.
P5. **Framed injection ships with (or before) the data** (WA21-R6 precedent): any injection/
    framing change = full new `chatTurn_v7` closure + registry repoint + append-only freeze
    manifest. Pack v4 and v7 ship in the same deploy ceremony.
P6. **Interviews are durable runs** (PRD invariant 13): DB-backed checkpoints, park at zero
    compute, resume ≥48h later, server-cancellable, idempotency keys; never store flawed
    data; dry-run review → commit. Interview bodies inherit Appendix A immutability (_vN).
P7. **Carry-down is one-shot + idempotent + correctable:** per-client seeded-once registry
    (double seed RAISES — Phase-5 negative test), per-item idempotency keys via op_receipts,
    supersede-not-duplicate correction verb designed TOGETHER with the guard (B-1 + B-8).
P8. **The salvaged opening model carries verbatim:** per-item `entry_kind='opening'` journals
    contra'd to the OBE marker account; net-credit tie to carried subledger equity
    (fail-loud); OBE plugs to exactly zero; controls resolved by marker, never literal codes;
    equity carries the CLOSING NET position as one line (the BEE example, TB 105,000.00 /
    150-000 Dr 65,747.97, becomes a tested fixture); FA items seed the depreciation baseline
    so Wave D's run_depreciation continues from NBV and never re-charges the past.
P9. **Opening balances are structurally high-stakes:** `is_opening_balance` forces
    distinct-human checker (or solo attestation); no wake approve exists; every granted
    draft writer hardcodes the flag false — carry-down needs a NEW audited writer family,
    human-lane by construction (closing_transfer precedent).
P10. **Seeding creates no signed rules and no sightings:** any live rule requires a human
    signature (ck_coding_rules_terminal); rule_sightings are written only inside
    approve_entry from human-approved unreversed entries on the NEW books — prior-GL
    evidence has no lawful path into the sighting pool. Confirm-vs-propose boundary: only
    human-ticked mappings seed confirmed @1.000 (seed_client_knowledge semantics carry);
    everything inferred stays advisory.
P11. **Knowledge writers are first-class:** same actor-attribution/validation/receipt
    discipline as book writes; per-sighting/per-fact provenance events, DB-transactional,
    never model-remembered tallies (A-9/A-3 fixes). client_memory_notes stays DROPPED —
    typed homes only (profile facts / open questions / low-evidence proposals).
P12. **Structural invariants bind every new surface:** assert_client_resolved in client-scoped
    writers; provenance binding (with a typed non-document provenance extension to design for
    keyed-in opening facts); wake_fn_allowlist rows for any wake-reachable fn; the agent role
    stays structurally read-only — wiki ingest/file-back rides audited writers or projections.
P13. **Storage doctrine:** wiki page bytes = firm-scoped keys, delete never granted,
    reverse-not-delete, retention anchored at period-end + filing.
P14. **Plan-as-document is Gate-2-ratified** (00-GATE-2-README:21): the onboarding interview
    lands its plan/progress on a first-class versioned DB object (intended-vs-actual).
P15. **Agent-native acceptance test** (DIRECTION §): remove the chat rail — the workbench
    still shows what Clara did, why, with what evidence, every action as object-level verbs.
P16. **Migrations 0017+ ride the deploy-ceremony discipline** (backup → quiesce → atomic
    apply → runtime vN+1), rig-validated on throwaway PG17 first; CI lesson: row-scoped
    tests, never global counts.

---

## 2. Tension register (each resolves by design choice [D] or owner ruling [R])

T1 [R] **Wiki write-path timing — F3 vs projection.** PRD (76/119) wants the KB/wiki update
   in the SAME audited transaction as the GL write; ARCHITECTURE (§2.2, §4.0a-6) makes the
   wiki an async at-least-once event-spine projection. Recommended resolution: the TYPED
   Layer-2 side-effects (sightings, open questions) stay same-txn (as-built today); Layer-1
   wiki page synthesis is an event-spine projection consumer (LLM synthesis must never sit
   inside a book-write txn), with F3 satisfied by: transactional event emission + a
   projection-lag surface + the books_version freshness token. Needs an owner ruling because
   it narrows PRD LAW F3 wording (precedent: LAW clarifications section of PROJECTLOG).

T2 [R] **What may bulk seeding create? (the central grill item.)** Sources allow wiki pages +
   typed profile facts + low-evidence rule PROPOSALS; signed rules only via per-rule human
   act. Open: (a) do GL-mined mappings land as a new typed proposal kind with a tick-list
   ceremony where each human tick = a signature (reusing seed_client_knowledge batch
   semantics, confirmed @1.000), plus proposals for the rest? (b) does the C-11 'candidate'
   tier return as the landing state for GL-mined rules, or is it deleted? (c) what
   evidence_count/confidence do seeded proposals carry (never sighting-pool entries — P10)?
   (d) sign floor: PRD says admin approves KB; as-built sign_coding_rule(vendor_account) is
   bookkeeper+ — which floor governs the seeding ceremony?

T3 [D/R] **Pack v4 budgets + purpose-branching.** The pack has NO char budget today
   (documents block unbounded since v2). Recommended: adopt the get_document_extract
   budgeted-CTE max_chars pattern for the wiki block (numbers to fix at grill, e.g. N pages /
   M chars by relevance rank); decide whether p_purpose starts branching ('coding' slim vs
   'chat'/'onboarding' full) — first-ever purpose branch, changes the byte-identical
   discipline; decide whether frozen v1–v6/autoDraft consumers may see the unframed wiki
   block or the block is purpose-gated to framed consumers only. autoDraft: recommended
   wiki-blind v2 stays (unattended lane), ruling to confirm.

T4 [D] **The OB writer family shape.** New audited fns (draft_opening_item / carry-down
   composite per subledger class + FA), admin+ floor, human-lane-only markers
   (closing_transfer precedent), per-item entries per P8 — NOT one composite journal.
   Approval load: dozens of per-item high-stakes approvals is operationally impossible —
   design a single dry-run review → ONE distinct-checker approval act that approves the SET
   (structurally: a batch approval object the checker signs; per-entry approvals recorded
   under it). Needs adversarial design attention (approval-path surface!).

T5 [D] **TB tie-out mechanics.** trial_balance(p_client) has no as-of cutoff and no period
   locks exist until Wave E. Recommended: add a dated TB read fn (as-of entry_date) for the
   tie-out; tie-out compares against an UPLOADED prior TB/management-accounts document
   (sha256 provenance — 'opening_balance_doc' kind exists) with keyed-in figures as the
   typed-provenance fallback; on mismatch the carry-down parks with an explicit delta
   surface (never partial-commits). Back-dating hazard pre-Wave-E: recorded as an accepted,
   documented gap + a lint check, not a new lock structure (Wave E owns locks).

T6 [D] **fixed_assets discipline.** Before Wave B writes to it: audited writer(s), append-only/
   immutability trigger parity with books tables, receipts, a read fn. accumulated_depreciation_cents
   is stored — only the audited seeder writes it, agent never computes it.

T7 [D/R] **Who executes wiki writes + governance.** Ingest/file-back = audited writer fns
   under the runtime/projection credential (agent role read-only); 'file the analysis back'
   (query verb) needs wake_fn_allowlist rows if wake-reachable. Open [R]: is any human gate
   required on wiki PAGE edits, or is lint-surfacing the only control (wiki is advisory —
   recommended: no human gate on pages, human gates stay on Layer 2 only)?

T8 [D] **Lint mechanics.** Recommended: a daily per-client belt consumer (sst_watch cadence
   pattern — per-client, never firm-wide lock) writing typed lint findings; surfacing rides
   the queue (needs_review) + owner notification, NOT open_questions (never block work on
   wiki hygiene — the ADR-028 lesson). Wake kind + allowlist rows if agent-invoked.

T9 [D] **0017 constraint swaps:** open_questions.origin gains 'onboarding'; scope_kind may
   need a firm-level value (firm interview must-asks); document-kind taxonomy already has
   knowledge/opening artefact kinds to verify against as-built 17-kind vocabulary.

T10 [R] **Salvage scope rulings** (each an explicit owner decision, per the audit's C-12
    discipline): B-9 SST takeover continuity model (pending-output-tax split on carried AR
    vs per-invoice continuity candidates — interacts with live A2 SST machinery); B-15
    uncleared bank items (carry per-item opening bank entries now vs defer to Wave C with a
    tracked to-do); B-14 structural fixtures (partnership PSR, recurring templates, recon
    hints — capture now vs explicit to-dos); C-13 pinned-tier decay exemption; HANDBOOK N8
    0.95-vs-0.97 promoted-rule confidence constant; GAP2-2 materials registry (subsumed by
    wiki ingest or separate deliverable); GAP2-4 curator/pattern-mining (absorbed into lint
    or deferred).

T11 [D] **Wiki replay-rebuildability.** §2.2 requires projections rebuildable by replay, but
    pages are LLM-synthesised. Recommended: page VERSIONS are durable artifacts (Storage
    objects + index rows); the event log re-indexes/re-orders them on replay; synthesis is
    never re-run to reconstruct state. 'Rebuildable' = artifact-replay, not re-synthesis.

T12 [D] **Interview state home.** In-progress answers live in the durable run's checkpoint
    state + a plan-as-document object (P14) — NOT in books/wiki tables until dry-run →
    commit; the commit is the only writer boundary (never-store-flawed-data). Incremental
    carry-down (B-12) = the same interview resumed later; 'still to capture' checklist
    persists on the plan object; client visibly onboarding-incomplete.

---

## 3. Proposed slicing (dependency-ordered; each keeps the app runnable)

- **B1 — wiki core:** 0017 wiki_pages index + wiki log + audited writers + Storage doctrine;
  ingest + query verbs; event-spine projection consumer; pack v4 + chatTurn_v7 (+ the
  framing prompt); budgets enforced.
- **B2 — lint:** the belt consumer + typed findings + queue/notification surfacing + caps.
- **B3 — onboarding interviews:** durable interview workflow family (firm 11-Q / client 13-Q
  content from salvage, validators + echo-back + dry-run gates carried); plan-as-document
  object; identity → COA seed (LHDN-verified, marker fixes incl. F12-11 SST markers) →
  client_identifiers writes; open_questions origin widening.
- **B4 — carry-down:** seeded-once registry + OB writer family + FA discipline + baseline
  rows + dated-TB read fn + tie-out + supersede verb + batch approval object; first-year
  clients skip (opening=0); opening state precondition for close (Wave E consumes).
- **B5 — bulk seeding:** prior-GL parse (rides Wave-A intake or a new kind — T2), the
  tick-list confirm ceremony + proposal lane + wiki seeding; counterparty birthing en masse
  (rename/merge/alias writers exist).

B3 → B4 → B5 are one interview spine (the plan object threads them); B1 precedes B5's wiki
seeding; B2 can trail B1. Adversarial-review effort concentrates on B4 + B5 (approval path,
money) per ADR-026/028/029 house law; budget ~6 cross-model rounds.

---

## 4. Live eval gates (draft — the wave closes ONLY here, ADR-027/WA21-R13 discipline)

Real documents only, never synthetic; a real ongoing client's takeover pack is the natural
eval vehicle (prior-year management accounts / signed TB from the real corpus, subject to
owner supply — same discipline as the S/P follow-on).

- **Gate O (onboarding):** a real client onboarded via the durable interview; kill the
  runtime mid-interview; resume ≥48h park; dry-run → distinct-checker commit; plan object
  shows intended-vs-actual; zero flawed rows pre-commit.
- **Gate K (carry-down):** opening GL + AR/AP items + FA rows + depreciation baseline seeded
  to the sen against the real prior TB; TB tie-out asserts; OBE nets to zero; re-run does
  ZERO writes; double-seed RAISES; supersede verb corrects one item cleanly; the BEE equity
  fixture passes in rig.
- **Gate W2 (wiki):** ingest of the takeover sources builds provenance-cited pages within
  caps; the pack v4 block appears framed in a live chatTurn_v7 turn; a wiki fact visibly
  informs a draft while the decision authority provably stays Layer-2 (probe: wiki text
  suggesting a different account does NOT move the draft).
- **Gate L (lint):** a seeded contradiction/stale claim surfaces on schedule to the owner;
  caps enforced visibly.
- **Gate R2 (seeding):** GL-mined mappings land per the T2 ruling (ceremony-confirmed rules
  @1.000 + proposals); zero sighting-pool entries from prior GL; a seeded rule participates
  in live coding under its human signature.

---

## 5. Grill agenda (G1–G10 → rulings WB-R*)

G1  T2 in full — the bulk-seeding creation rights, tick-list-as-signature shape, candidate
    tier (C-11), floors (PRD-vs-as-built), proposal fatigue bounds.
G2  T1 — ratify the F3 narrowing for Layer-1 (projection + freshness token) or demand
    same-txn wiki writes.
G3  Wiki budgets: pages-per-client cap, page-size cap, pack relevance budget (N pages /
    M chars), lint cadence. Concrete numbers.
G4  T3 — purpose-branching + frozen-consumer exposure + autoDraft wiki-blindness.
G5  T4 — the batch approval object for opening sets (one checker act approving the set):
    acceptable under the maker/checker LAW, or per-entry approvals demanded?
G6  T5 — tie-out source of truth (uploaded doc vs keyed-in + typed provenance) and the
    pre-Wave-E back-dating gap acceptance.
G7  T7 — human gate on wiki pages: none (lint-only) vs curator approval?
G8  T10 items, one by one (B-9, B-15, B-14, C-13, N8, GAP2-2, GAP2-4).
G9  Eval-gate vehicle: which real client + which real takeover documents; timing vs the
    S/P follow-on window.
G10 Slicing/sequencing sign-off (§3) + where the wave's PR/ceremony boundaries fall
    (0017 single migration vs split).

---

## 7. Debate round 1 amendments (v0.2 — the Codex adversarial memo, 2026-07-23)

The cross-model debate (gpt-5.6-sol xhigh, read-only, memo in the session record) returned
12 findings. Verified against the grounding evidence and folded in as amendments — §§1–6
above are preserved verbatim so the memo's line citations stay valid.

**A1 (memo 2+3 — the CLR26 class, ACCEPTED as new T14, top grill priority).** As-built,
every open client-scoped question except `rule_proposal` blocks ALL of that client's
approvals (0012:98-107 → CLR26), and `create_client` births an ACTIVE client that the
belts/queue/SST machinery immediately iterate. Wave B therefore needs BOTH: (a) an
onboarding question class that blocks only the onboarding commit, never daily work
(explicit blocking-scope, or a distinct object); (b) an explicit client lifecycle —
staging objects or an `onboarding` status structurally excluded from every operational
consumer — plus the activation boundary, and a receipt-idempotent story for
`create_firm`'s single-use admission token.

**A2 (memo 4 — frozen-run exposure, ACCEPTED; hardens P5/T3).** Co-deploying pack v4 +
chatTurn_v7 protects new runs only: parked v1–v6/autoDraft runs still call the global
`get_context_pack` and would render unframed wiki JSON. Recommended resolution: the wiki
block is gated on a NEW purpose literal that only v7 sends — v4 is additive-but-dark to
every existing consumer; rollback preflight re-checks non-terminal runs. (This makes T3's
purpose-branching question largely settled-by-necessity; grill confirms.)

**A3 (memo 1 — Gate W2 probe redesigned; P1 clarified, PARTIAL accept).** The memo
over-reads P1: wiki content informing draft PROPOSALS is the feature (PRD: "injected into
every pack", "informs every decision"). What must be structural: wiki text can never alter
AUTHORITY — gates, bounds, floors, autopost eligibility, approval requirements. Gate W2's
old probe ("wiki suggesting a different account does not move the draft") contradicted the
informs-law and is replaced: W2 now probes that (i) no authority surface reads wiki
content (structural: the wiki tables/pack block feed no gate fn), (ii) frozen consumers
stay wiki-dark (A2), (iii) a draft's authority path (human approval / signed-rule bounds)
is bit-identical with and without wiki presence.

**A4 (memo 5 — tie-out durability, ACCEPTED into T5 as a grill fork).** Post-tie-out
backdating invalidates the opening TB silently, and the as-built reversal mirror posts at
`current_date` — it cannot repair a historical position. Grill fork: (a) a minimal
per-client takeover-cutoff guard in the draft writers now (small structural check, NOT
Wave E's lock system) + an opening-dated supersede verb, vs (b) accept + lint-surface the
gap until Wave E. The memo argues (a); the draft's v0.1 lean (b) is likely too weak.

**A5 (memo 6 — set-approval concurrency, ACCEPTED into T4/P7).** The batch approval is
ONE serializable DB transaction: lock the client's seed-registry row, verify plan
revision + source hashes + every entry revision + checker separation, approve the set,
finalize the registry atomically. Same-op retry replays its receipt byte-identically; a
second semantic seed under a different op_key RAISES. Gate K asserts both.

**A6 (memo 7 — wiki-synthesis egress/consent, ACCEPTED as new T13).** LLM page synthesis
egresses client data; the as-built precedent is the claim-boundary consent hold
(0011:2315-2359). The contract must pin: provider + governed-egress registry entry,
consent scope, revocation → held/dead-letter state for pending synthesis, and a
deterministic ingest mode (index + provenance, no synthesis) that keeps onboarding
functional without consent.

**A7 (memo 8 — "confirmed @1.000" idiom retired, ACCEPTED; P10/T2 reworded).**
`coding_rules` carries no confidence/evidence column — a live rule's authority is the
human signature alone. The frozen-repo "@1.000" idiom does not carry. Prior-GL metrics +
provenance live on the PROPOSAL object; the tick-list ceremony mints one signature per
rule; nothing numeric transfers onto the live rule.

**A8 (memo 9 — as-built primitive gaps in the opening model, ACCEPTED into P8/T6).**
0017 must add the OBE marker (and decide retained-earnings marking) to `special_acc_type`
(as-built CHECK allows only rounding/SST-output/SST-purchase-cost), decide non-straight-
line depreciation policy at carry-down (widen vs refuse), and pin asset↔opening-entry
linkage (acquisition_entry_id + a per-asset cost/accum/NBV tie assertion).

**A9 (memo 10 — Storage/Postgres atomicity, ACCEPTED into T11).** Wiki artifact protocol:
deterministic immutable keys, content hashes, upload→verify→publish states, projection
receipts, orphan repair; events carry enough immutable metadata to rebuild the index.
Query stays pure; file-back dispatches the audited ingest writer.

**A10 (memo 11 — lint finding lifecycle, ACCEPTED into T8/B2).** Lint findings need:
identity/dedupe key, state transitions (open → superseded/resolved/recheck), a resolution
verb, exactly-once notification policy, a queue `row_kind` + hydration card (the queue
knows five row kinds; unknown kinds render a no-action placeholder).

**A11 (memo 12 — eval gates widened).** Added to §4: concurrent-seed and concurrent-answer
races; failure-after-N-items resume; interview cancellation/expiry; stale plan revision
after a 48h park; FIRM onboarding (not only client); consent revocation mid-synthesis;
cross-firm SECURITY DEFINER probes; a large-corpus token-ceiling run; old-run resume
across the v7 upgrade + rollback preflight. Destructive/fault-injection variants run in
the rig; live gates stay real-document-only. Gate L uses genuinely conflicting REAL
sources — never a fabricated source planted in live knowledge.

**Grill agenda additions:** G11 the structural authority boundary for wiki content (A3) ·
G12 onboarding lifecycle states + activation boundary + what blocks what (A1) · G13 the
opening-set transaction protocol + takeover cutoff fork (A4/A5) · G14 the wiki
synthesis/consent/freshness fail-closed protocol (A6/A9) · G15 the widened close-gate
set incl. firm onboarding + upgrade/rollback (A11).

## 6. Standing context (unchanged, for the record)

Canary `daba7f2e` ARMED, due 2026-08-02 — never answer. `main` PR-only; merge grant = green
CI + clean review. Next chat bump = chatTurn_v7; freeze manifest append-only. Supavisor
headroom (~26/60 sessions) re-verify before adding consumers (lint belt!). OpenAI quota
watch (429s kill chat/classify). S/P follow-on eval rides the next real invoice/bill cycle
and shares the live window with Wave B's ceremony.
