# 磨合 · the owner's morning batch — 2026-08-29

*The overnight sprint's decisions for Tao, in the shape of the 08-28 sitting: one line of
大白话 per item, the recommendation, what it costs, and the fail-closed default that already
stands so that a deferral never blocks a build. Everything here was minted AFTER 裁-22 (the last
ruling of the night). The full records are in the named files; the rulings ledger is
`mohe-grill-rulings-2026-08-28.md`.*

## What landed overnight (no decision needed — for your confirmation of state)

- **Wave C, the last three port-wave trains, are on main or armed:** T11 (in-thread
  onboarding checklist, #405) and T1 (close lifecycle + fiscal year, #406) MERGED; T2 (opening
  balances & carry-down, #407) auto-merge armed. **11/11 trains.** Every car went FIX-REQUIRED
  → fixed → same-reviewer CLEAR, every fix with a named RED mutant. T1 performed the estate's
  FIRST `open_fiscal_year` on a rig and both refusals it hit were judged honest retries.
- **The pre-beta backend queue is built and in its final re-verifies:** P4 tranche-2 (firm
  registration + approval queue + the role ceiling + 裁-11's alias read) · 裁-22 (DB-resolved
  proposal bases, both doors — **CLEAR**) · 裁-17 (the ninth needs-you row_kind) · the
  hardening batch A (裁-15 + 裁-18a). Hardening B (裁-16 hash-only tokens) is authored and held
  until tranche-2 merges (they touch the same two bodies).
- **The three design sets you asked for are merged as gate-OPEN documents:** 裁-18b
  (`binding-proposal-*`), 裁-19 (`counterparty-merge-*`), 裁-21 (`coa-template-*`). Their gate
  questions are below. None starts building until you answer the ones marked GATING.

## Decisions I made overnight under your autonomy mandate (INFORM — say so if you disagree)

1. **裁-15 widened from "six" barrier views to the catalog-derived family of ELEVEN.** "Six"
   was MY count when I briefed you, not your choice. The reviewer DEMONSTRATED cross-tenant
   leaks on four of the five uncovered views (`agent_tasks_visible`, `coding_tasks_visible`,
   `document_processing_tasks_visible`, `document_intakes_visible`): a low-cost non-leakproof
   function in a WHERE clause saw another firm's rows under a planner setting any caller can
   set. Five more one-line `ALTER VIEW`s, zero behaviour change, view text and grants
   byte-unchanged; the census now enumerates the family from the catalog so a twelfth view fails
   loudly. *If you want six only, the five come out as a booked debt.*
2. **裁-18a's refusal uses your ruled words verbatim** ("let Clara propose it, or add a second
   admin") — the build had "a different admin signs it". **Ordering note:** 裁-18a lands BEFORE
   裁-18b's Clara-proposal door, so until 18b merges a firm whose only bookkeeper+ member is also
   its only admin+ member has ONE real exit: add a second member. Pre-beta that is test fixtures
   + BELCORT only. *If you want 18a HELD until 18b, say so.*
3. **Raw model `sightings` numbers are DROPPED, not kept as an annotation** (裁-22): one of the
   two was reachable by two human read views, showing "1" and "3" side by side with nothing
   marking which is authoritative. PRD §6 invariant 1's spirit; your ruling's letter.
3b. **裁-11's alias read ships as a masked VIEW (`counterparty_aliases_visible`), not a direct
   table grant.** The full estate suite caught that `counterparty_aliases` sits in the Wave-A
   "fn-fronted only" table set (a standing invariant test); the sibling you told us to copy
   (`counterparties`) does not. Same purpose (humans list aliases; `retire_counterparty_alias`
   gets an honest id), same idiom as the tranche's other read, the invariant kept.

## Decisions that are YOURS (each: 大白话 · rec · cost · the default that stands)

4. **T11 N2 — can a human AMEND an onboarding item's resolution?** The DB door happily
   re-resolves any item; the card disables settled items; the card is the ONLY surface, so a
   mis-typed answer is uncorrectable from the product. **Rec:** allow "Amend resolution" on a
   settled item (append-only audit trail already exists), as a P6 polish item. **Default:**
   disabled (fail-closed).
5. **裁-18b design gate — 8 questions** (`binding-proposal-gate-record.md`; **G1/G2/G4 GATE the
   first PR**): G1 wake kind = existing `filing` + `interactive`, event + human ask, no sweep ·
   G2 the 裁-22 resolver takes a DOCUMENT SET (built that way overnight — confirm) · G3 no
   fingerprint count in `_coding_lane_core` · G4 receipt-registry key: widen to a `pb_*` family ·
   G5 the tenth row_kind AFTER 裁-17's ninth · G6 the vanished post-time binding re-check:
   RECORD, do not build here · G7 a `decline` verb rides; an expiry sweep does not · G8 the
   one-open-proposal index changes the HUMAN door's behaviour (a second manual proposal refuses
   `binding_conflict`) — take it.
6. **裁-19 design gate — 7 questions; OQ-1 GATES the item** (`counterparty-merge-gate-record.md`):
   **OQ-1 — 裁-19 said the merge "moves" open items: is that the OUTCOME or the MECHANISM?**
   Rec: a canonicalising READ layer (aging/statements/list-by-counterparty resolve through
   `_canonical_counterparty`) — a physical move either weakens the append-only wall (constraint
   14 forbids) or re-dates every debt into `current` and is refused by the period wall for
   frozen years. OQ-2 keep a visible `recorded_counterparty_id` → YES · OQ-3 sealed snapshots
   keep the recorded party → LEAVE · OQ-4 un-merge floor → ADMIN, human-only · OQ-5 a closed-FY
   rung → NO · OQ-6 fix M9 inside PR-1 → YES · OQ-7 the `counterparty.unmerged` taxonomy →
   `context_update`. **Live defect M9 (independent of 裁-19, now in Known issues):
   `list_open_items_by_counterparty` passes the FIRM id where a CLIENT id is expected → `[]`
   for every counterparty, dead since 0038.**
7. **裁-21 design gate — 12 one-line questions** (`coa-template-gate-record.md`): **Q1 do you
   already have a standard chart — hand it over and it becomes the template** (else an
   MPERS-grounded draft you publish) · Q2 4-digit blocks or `300-000` (rec 4-digit) · Q3
   bookkeeper applies, admin publishes · Q4 a takeover client with books: BELCORT's chart wins,
   the predecessor's TB mapped onto it · Q5 auto-apply at client creation → NO · Q6 industry
   unknown → core families only · Q7 add a `trade_nature` interview question → yes · Q8
   entertainment / donations / fines / depreciation / leave passage / proprietor expenses /
   motor running in their OWN accounts → yes (F-T3 add-backs) · Q9 re-word the unsupportable
   "LHDN-aligned" claim → yes · Q10 equity section by entity type → yes (the BEE
   sole-proprietor case) · Q11 the firm's statutory-payable names (EPF/SOCSO/EIS/PCB/SST) — your
   wording · Q12 MSIC 2008 or 2025 → 2008 + an edition stamp. **Shipped-promise finding:** the
   interview asks "Apply the standard LHDN-aligned MPERS Chart of Accounts seed?" (required to
   commit) and NOTHING consumes the answer — 裁-21 closes it.
8. **The pricing-amounts sitting** (before P4's UI tranche ships) — unchanged, still yours.

## Record-only (no ruling; here so nobody chases them as product rows)

- Receipt contract looseness: 0126's four writers + 0142 write `trigger_id = the CREDENTIAL uuid`
  where the contract says the task/turn — backlog (an honest `wake_credential` kind or
  task-binding via 0138:781).
- The wake allowlist is NAME-bound (0002/0004): a same-name overload granted to a wake role
  would inherit the reviewed authorization — safe today (one `pg_proc` row per name, and the
  0143 tail asserts it); backlog: key on `regprocedure`.
- `wake_propose_identifier_promotion` has NO duplicate-open wall (0103) — two concurrent
  proposals both admitted; Door 2 and 裁-18b carry a partial unique; backlog.
- 裁-22's changed replay fingerprint refuses any `op_receipts` row reserved BEFORE the migration
  — the tail prints the count for the ceremony operator (0 on every rig; live unknown).
- The separation-of-duties wall (裁-18a) is per-user-uuid: one human with two accounts in one
  firm defeats it — identity provisioning is the real wall (for the 裁-18b design).
- `approve_opening_seed` / `approve_opening_correction` require a serializable pin that NO
  migration sets (the manual wave-b 0017 Part-A ceremony artifact) — verified on LIVE at the
  next sleeper read; T2 renders the operator hint on that exact refusal.
- The P4-2 battery left an agent-owned OPEN registration request behind on any DB it touched
  pre-fix (rev-p4t2 F5) — the Wave-G factory reset clears it.
- Docs to true at the next harness-sync: port-wave-plan part2 §12 OQ-1's claim that #375 wired
  four close doors is FALSE (#375 wired the firm needs-you-gap doors) — T1 built all nine; the
  fiscal-year contiguity rule lives in trigger `t_fiscal_years_contiguity`, not the core body.
