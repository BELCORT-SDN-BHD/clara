# 磨合 · the owner's morning batch — 2026-08-29

*The overnight sprint's decisions for Tao, in the shape of the 08-28 sitting: one line of
大白话 per item, the recommendation, what it costs, and the fail-closed default that already
stands so that a deferral never blocks a build. Everything here was minted AFTER 裁-22 (the last
ruling of the night). The full records are in the named files; the rulings ledger is
`mohe-grill-rulings-2026-08-28.md`.*

> **THE SITTING RAN 2026-08-29 (morning) — 裁-23…裁-28.** Items **4** (T11 N2), **5** (裁-18b),
> **6** (裁-19), **7** (裁-21) and the **admission-token EMAIL WALL** in the record-only block are
> **RULED**, each marked below with its 裁 number. Item **8, the pricing amounts, was NOT ruled**:
> the owner will bring his own pricing plan, and the conductor owes a data-backed brief (裁-28).
> Everything else here stays as written. Ledger: `mohe-grill-rulings-2026-08-28.md` §裁-23…§裁-28.

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
3c. **The manual sweep after #414 (hardening B) went RED — a TEST-FIXTURE fault, not a product
   one — and it is now FIXED and the window has RUN.** The closed-wave drill **§4.11** and all
   four **D-b frontier legs** failed together: the shared `seedAdmission` fixture followed head
   and wrote `token_hash`, which does not exist at the pre-`0147` frontiers those legs replay.
   **#415 made the fixture frontier-aware (it probes the catalog) and its branch sweep turned the
   four frontier legs green**; product code was never wrong. **`0147` was then ceremonied the
   same day — LIVE 142/`0147`, a 47-second D1 window, `/ready` 200**; as-run
   `docs/plan/completed/mohe-0147-apply-asrun.md`. *(The LESSON stays in PROGRESS Known issues:
   the closed drills run only on the weekly sweep or a manual dispatch, so a PR that changes a
   shared fixture must `gh workflow run ci.yml` on its own branch before merge.)*
3d. **裁-21 research (裁-23/Q2): numbering landed on 4-digit blocks** (Bukku · Sage UBS · NCL ·
   QuickBooks guidance) — the majority-installed AutoCount/SQL/QNE "3-digit-dash" form was
   rejected because it is structurally ROME PROPERTIES' `300-000` shape the owner excluded;
   4-digit blocks resemble the estate seed's habit the owner ALSO excluded, so the research chose
   between the two exclusions by evidence. **Renumbering before publication is cheap; say so if
   you want a third form.** Dossier: `docs/plan/research/coa-template-research-2026-08-29.md` §2
   (the four legs, and the road not taken); the draft chart is
   `docs/plan/research/coa-template-2026-08-29.json`.

## Decisions that are YOURS (each: 大白话 · rec · cost · the default that stands)

4. **T11 N2 — can a human AMEND an onboarding item's resolution?** The DB door happily
   re-resolves any item; the card disables settled items; the card is the ONLY surface, so a
   mis-typed answer is uncorrectable from the product. **Rec:** allow "Amend resolution" on a
   settled item (append-only audit trail already exists), as a P6 polish item. **Default:**
   disabled (fail-closed). — **RULED 2026-08-29 (裁-27): arm (b), allow it** on a RESOLVED item,
   filed to **P6**; the amend is a new resolution row, never an edit of the old one.
5. **裁-18b design gate — 8 questions** (`binding-proposal-gate-record.md`; **G1/G2/G4 GATE the
   first PR**): G1 wake kind = existing `filing` + `interactive`, event + human ask, no sweep ·
   G2 the 裁-22 resolver takes a DOCUMENT SET (built that way overnight — confirm) · G3 no
   fingerprint count in `_coding_lane_core` · G4 receipt-registry key: widen to a `pb_*` family ·
   G5 the tenth row_kind AFTER 裁-17's ninth · G6 the vanished post-time binding re-check:
   RECORD, do not build here · G7 a `decline` verb rides; an expiry sweep does not · G8 the
   one-open-proposal index changes the HUMAN door's behaviour (a second manual proposal refuses
   `binding_conflict`) — take it.
   **RULED 2026-08-29 (裁-25) — all eight.** G1/G3/G4/G8 as recommended · **G2 closed by fact**
   (`0143` shipped the document-SET resolver, PR-2 does not hold) · **G5's premise changed** —
   裁-17's ninth `row_kind` is live at `0146`, so the tenth SHIPS as its own PR inside the item ·
   **G6 OVERRULED — the post-time re-check is RESTORED inside 裁-18**, its own PR and its own D1
   window (`_approve_entry_core` replaced), the item's dates move · **G7 WIDENED — BOTH ride**:
   the `decline` verb AND the expiry sweep (a new engine source + enable ceremony). **裁-18b is
   now FIVE PRs and two D1 windows minimum.**
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
   **RULED 2026-08-29 (裁-24) — OQ-1 came back PHYSICAL, in the append-only shape, and the
   orchestrator's DISSENT is on file.** For every OPEN item of the merged party in an UNFROZEN
   period the merge **appends a re-home pair** (old row superseded; new row under the survivor at
   the **ORIGINAL date**, back-pointing to the old); the un-merge appends the reverse pair;
   **frozen years are untouched and fold in the READ layer only**. So the read layer STAYS and a
   write door is ADDED — **D-01 becomes a hybrid, the design set is AMENDED, not superseded.**
   OQ-2/3/5/6/7 as recommended; **OQ-4 WIDENED** — admin-signed, and Clara MAY PROPOSE an
   un-merge as a needs-you item.
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
   **RULED 2026-08-29 (裁-23) — all twelve.** **Q1: there is no BELCORT chart, so the template is
   RESEARCH-DERIVED — official sources + Malaysian best practice + what mainstream Malaysian
   software ships, newest editions — and the owner WAIVED his review of the draft** (*"你自己找到了
   best practices 后不用我审, 直接用"*); it ships **published** and applies to no client until the
   human click, and **a research lane precedes PR-0**. **Q2 OVERRULED — neither legacy numbering
   convention** (*"两个都不要用旧的东西"*). **Q6 WIDENED — Clara asks first** when the industry is
   unknown. **Q8 and Q11 WIDENED — the add-back list and the statutory-payable names both come
   from the research**, not from the eight proposed / not from a BELCORT wording. Q3 (with the
   bookkeeper's edit made explicit), Q4, Q5, Q7, Q9, Q10, Q12 as recommended. **The COA
   maintenance model is ruled too:** not a background sync — propose at onboarding, copy
   versioning, a drift READ, single-account proposals in chat, structural changes always
   propose → human click.
8. **The pricing-amounts sitting** (before P4's UI tranche ships) — unchanged, still yours.
   **NOT RULED 2026-08-29 (裁-28): the owner will bring his own pricing plan.** The conductor
   owes a data-backed brief instead — the **cost floor measured from live LLM usage** and the
   **Malaysian market band**. Recorded impact: it does **not** block the build or beta; it blocks
   the **Stripe product/price objects, the checkout's price display and the first charged day**,
   so it is needed **before P4's checkout wiring**.

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
  — the tail prints the count for the ceremony operator: **0 on live at the 03:17Z window** (closed).
- The separation-of-duties wall (裁-18a) is per-user-uuid: one human with two accounts in one
  firm defeats it — identity provisioning is the real wall (for the 裁-18b design).
- `approve_opening_seed` / `approve_opening_correction` require a serializable pin that NO
  migration sets (the manual wave-b 0017 Part-A ceremony artifact) — **READ ON LIVE at the
  03:17Z window: both carry `default_transaction_isolation=serializable` in `proconfig`** — the
  pin is applied; closed. T2's operator hint stays as a belt.
- **EMAIL-WALL on the admission token (hardening B's finding, re-verified against 0145) — YOURS:**
  `create_firm` binds an admission token to NO identity: any non-agent subject with no active
  membership who holds the plaintext can consume it and become that firm's owner (a pure bearer
  credential; `accept_invite` is email-matched). 裁-16 hashes it at rest but does not change WHO
  may present it. **Rec:** bind admission tokens to an email at issue, in P4's UI tranche (the
  signup page already collects it). **Default until ruled:** unchanged (bearer).
  — **RULED 2026-08-29 (裁-26): bind the token to an email AT ISSUE, in P4's UI tranche**, as
  recommended. Until it ships the token stays a bearer credential.
- Record-only (裁-16): a REPLAY of `invite_member`'s op_key returns the hash-only receipt — no
  plaintext — so a courier that must re-send needs the token from the FIRST call (zero callers
  today; the invite door is cutover-owed). `p4-design-2026-08-27-annex.md:343`'s plaintext lookup
  line is trued in B's PR.
- The P4-2 battery left an agent-owned OPEN registration request behind on any DB it touched
  pre-fix (rev-p4t2 F5) — the Wave-G factory reset clears it.
- Docs to true at the next harness-sync: port-wave-plan part2 §12 OQ-1's claim that #375 wired
  four close doors is FALSE (#375 wired the firm needs-you-gap doors) — T1 built all nine; the
  fiscal-year contiguity rule lives in trigger `t_fiscal_years_contiguity`, not the core body.

---

# The SECOND batch (items 19-42) — minted 2026-08-29 by the alignment audit and the night's gates

> **RULED 2026-08-29 evening (裁-31…裁-34) and 2026-08-30 ~02:00 MYT (裁-35…裁-43).** Ledger:
> `mohe-grill-rulings-2026-08-29.md`. Everything below keeps its original wording as put to the
> owner, with the ruling written onto it. The **INFORM** items are conductor decisions under the
> autonomy mandate, taken so a build did not stall — each is reversible by saying so.

## Items ruled

19. **MBB-1 — Wave G's acceptance oracle: owner-evidence gaps with NO date, absent from every
    batch** (the highest-latency item in the queue, and the one with **zero engineering path**):
    BEE GL/TB both FYs + the full FY2025 document set (two different prior firms — ROME PUBLIC
    ADVISORY FY2024, LUXE WEALTH CONSULTANCY FY2025) · RPR Feb/Mar-2025 bank statements or a
    written none-exist · a named producer/certifier for RS and RPR · **the authoritative RPR series
    pick** (a choice between two series already in hand — cheap, do today; without it "the bank
    reconciliation sees every April–July transaction twice"). Ask: a delivery date per item.
    — **RULED 2026-08-29 (裁-31): NOT CHASED.** *"我有的就是 desktop 那些了, 总之 user flow 能走完就好,
    能出来报告 and 可以 accounting 周期延续就好."* Wave G's acceptance criterion becomes: **on the desktop
    corpus as-is, every user flow walks end to end, reports issue, and the accounting period rolls
    forward.** The **RPR series pick is the conductor's** under the DATA-scoped authority — by
    completeness, recorded in the Wave-G setup document. Both Wave-G docs must be **trued to this
    criterion before the run**.

20. **MBB-2 — F-T3's acceptance oracle (OQ-1) is unruled and its unruled default FAILS OPEN**
    (battery-only: "every cell can pass while the bottom line is wrong"; GB-1/GB-2 were exactly
    that). Rec: option (a) — ONE hand-worked YA as the golden bar, on a company with a disposal so
    capital allowances are exercised (owner labour, a few hours, lead time).
    — **RULED 2026-08-29 (裁-33): NO GOLDEN BAR.** The hand-worked ladder is declined and the
    fail-closed default becomes the shape: **tax computations reach DRAFT only and never `issued`**,
    walled by a named refusal. PR-7 (artifacts) is not built for beta; every other F-T3 PR may
    merge. *(Same question as item 28 below — one ruling covers both.)*

21. **MBB-3 — 裁-18b was build-authorised on owner Q&A alone**; the conductor RAN the independent
    design gate (an opus lens lane + a Codex adversarial pass) in parallel with PR-1's build. The
    owner may instead RULE the narrowing ("owner Q&A = the design gate", precedent F-A7b).
    — **ACTED, not ruled: the gate ran and MERGED as #422** (`binding-proposal-pr0-gate-2026-08-29.md`
    — 1 CRITICAL + 8 blockers, all folding into PR-1/PR-3). The narrowing was not taken and is not
    needed; the offer stands if the owner wants it as standing law.

22. **Tier-3 self-serve LIVE AT BETA — the security gate's contents are untracked**: the
    conductor's dissent's two limbs (per-firm DPA e-sign · anti-abuse/rate controls) appear in no
    row, no lane, no owner's queue. Rec: DPA e-sign at signup + a 1-firm/1-email/1-IP rate wall +
    the email-bound admission token (裁-26).
    — **RULED 2026-08-30 (裁-36): ① DPA e-sign at signup (no sign, no firm) + ② a rate wall (one
    firm per email, one firm per IP per day). NO trial quota — ③ declined**, because metering bills
    after the fact and a quota would answer 裁-42's question a second, contradictory way. Both limbs
    land in **P4's UI tranche**, beside 裁-26.

23. **P-1 — ⌘K "Do" never dispatches**; its remedy is an unruled, unowned open question in the
    port-wave plan. Rec: carry into P6's ruled scope ("light Do behind a live allowlist check").
    — **RULED 2026-08-30 (裁-37): into P6, lit ONLY for the DB-allowlisted wake verbs, with a live
    allowlist check per action** — the palette asks the database what it may do every time, rather
    than shipping a list that drifts when a grant changes. (The false "wires up in P3" label was
    being fixed regardless.)

24. **P-5 — an IA decision: where do the SST engine (F-T1), tax computation (F-T3) and the payroll
    deadline calendar (F-T2) LIVE in `apps/web`?** No design names a frontend home; F-T2's only page
    targets the retiring `apps/dashboard`. Rec: a Tax client tab + the calendar as a firm-level
    needs-you feed; one named row before three lanes invent three answers.
    — **RULED 2026-08-29 (裁-34): a `Tax` tab on the client workbench** (SST: registration status ·
    period output tax · SST-02 draft; income tax: the R1–R10 draft card + CP204 schedule, **draft
    only**) **+ the payroll statutory deadlines as a FIRM-level needs-you feed** (Clara reminds)
    **+ one line on the compliance register page**. **All of it in P6 with the backend; no new
    phase.** F-T2's `apps/dashboard` page target is dead.

25. **R9(c) — the storage-role re-examination** (`incident-2026-07-26-intake-storage.md`): unruled,
    in no batch. Can follow beta; ask for a yes/no on scheduling.
    — **RULED 2026-08-30 (裁-43): AFTER BETA.** It is a hardening review of a role that works and it
    gates no beta user. Ruled in the same breath: **BELCORT's operator flag (`is_operator`) joins the
    Wave-G setup checklist**, run in the same ceremony as 裁-40's three clock switches.

28. **OQ-1, F-T3's acceptance oracle — the concrete alternative now exists**: the corpus holds
    `RPR - Management Accounts`' YA2025 Trial Balance + P&L. Rec: **you or the tax agent hand-work
    ONE ladder (R1–R10) for ROME PROPERTIES YA2025** from figures already in hand as the golden bar.
    — **RULED 2026-08-29 (裁-33): NO golden bar** (see item 20 — the same question, one ruling).

29. **OQ-7 whose signature on the treatment codes** — rec: a named licensed tax agent, licence
    recorded. Default in force: codes seed UNSIGNED; every treatment refuses
    `treatment_code_unsigned`.
    — **RULED 2026-08-30 (裁-38): as recommended.**

30. **OQ-8 governance** — rec: a named tax lead with the owner as an automatic, self-announcing
    fallback. Default: the fallback.
    — **RULED 2026-08-30 (裁-38): as recommended.**

31. **OQ-10 the CA-class door**: `ca_class` FREEZES (CLR13) once depreciation particulars are
    complete → capital allowances unreachable for every existing asset. Rec: PR-3 adds a human
    `set_ca_classification` door. Default (do nothing): R5 never computes for existing assets.
    — **RULED 2026-08-30 (裁-38): as recommended — PR-3 adds the door**, inside the D1 window it
    already owns.

32. **OQ-11 s.44(6) donations — the 10%-of-aggregate-income cap** cannot be expressed by
    `fraction_bp × movement`. Rec: v1 REFUSES approved-institution donations by name. **Never
    default to 100% add-back** (silently overstates the charge).
    — **RULED 2026-08-30 (裁-38): as recommended — refused by name in v1**, the human keys it; the
    flat 100% add-back is refused as a default outright.

33. **OQ-12 CP204 has no period to stamp cells on** (`reporting_periods.grain` = month |
    fiscal_year). Rec: the pack requires `ya_target`'s fiscal year OPEN, refuses otherwise.
    — **RULED 2026-08-30 (裁-38): as recommended.**

34. **O4 — enabling the expiry-sweep engine source is a law-71 human act**: the fail-closed default
    leaves PR-4's sweep as dead code (a `wake_engine_sources` row with `enabled=false`). Rec: rule
    "yes, at the G1 rollout ceremony, by the operator owner through `set_wake_source_enabled`",
    together with the `bank_agent`/`close_prep` flips — one ceremony, three rows.
    — **RULED 2026-08-30 (裁-40): as recommended — the switches open TOGETHER at the G1 rollout
    ceremony, before Wave G**, by the operator owner, after each wake body is built and reviewed.
    **PR-4 is therefore BUILT, not held.** PR-1's in-door stale-`proposed` sweep still ships: the
    clock does not start until that ceremony. **AMENDED the same sitting by 裁-44 — the list is
    FOUR:** `bank_agent`, `close_prep`, binding-expiry and **`tax_prep`**.

36. **Product ruling surfaced by the duplicate-open-wall lane (MBB-7a):**
    `clara.client_identifiers` itself has NO uniqueness by design (`0007:235`), so two SEPARATELY
    settled confirms can still mint two identical identity rows that attribution matches on; the new
    wall closes the OPEN-proposal race only. Ask: make `(client_id, kind, value_normalized)` unique
    on the identity table (a migration + a pre-flight naming existing duplicates; refuses, never
    dedupes)? Rec: YES before beta, as its own small PR after this one merges.
    — **RULED 2026-08-30 (裁-41): YES, before beta.** A small migration, its own PR; the pre-flight
    **names existing duplicates and REFUSES — it never dedupes.** Which of two identical identity
    rows is the real one is a judgement about a client's identity, and a migration does not make it.

— **The pricing amounts (item 8 of the first batch) — the owner brought THE MODEL instead:
RULED 2026-08-30 (裁-42), and it SUPERSEDES R8c's "tier + overage" shape.** Vercel-style, billed per
firm: a base subscription (including N paid seats, N Active Client slots and an AI allowance) · paid
seats (owner/admin/bookkeeper paid, viewer/payments-only free; capacity, not people) · **an extra
firm-wide SHARED AI allowance per paid seat** · Active Client slots beyond the base (capacity, not
bound to a client) · an Archived-client retention fee (lower; archiving frees the slot; the archive
month keeps the active fee, retention from the next cycle; reactivation needs a free slot; never
both fees at once) · **scheduled-for-deletion keeps the retention fee until PURGED** (the click does
not stop billing) · AI overage = usage − allowance floored at 0, the allowance expiring monthly with
no rollover, transfer or refund, and **the service never auto-stopping** · mid-month proration for
additions **including their AI allowance**, removals from the next cycle, and **never** an
auto-archive or auto-delete to cut capacity · an invoice showing **every** line. **Draft clients are
free and slot-less but capped** (no bulk documents, no AI, no posting). **Every price, included
quantity, allowance and ratio is CONFIGURABLE — nothing hard-coded.** **The amounts are still open.**
Consequence: **a billing DESIGN set (survey → design → gate) precedes P4's checkout tranche** —
[`billing-model-brief-2026-08-30.md`](billing-model-brief-2026-08-30.md) — and the Stripe objects
mirror the configurable shape.

— **TAX IS AGENTIC — RULED 2026-08-30 (裁-44), asked by the owner rather than put to him.** Reading
裁-33 and 裁-38 back, he asked whether the fail-closed defaults were dulling the agentic vision, and
whether tax was inside the agentic scope at all. It was not: every tax ruling this sitting made was
about **walls**, and none said **who acts**. **RULING: a `tax_prep` wake shaped like `close_prep`** —
after a close seals Clara drafts R1–R10 + the CP204 estimate **unasked**, each rung with its
statutory citation and her explanation, pushed as a **tax-draft card** to the needs-you inbox; she
**PROPOSES** every account's treatment and **a human signs** (裁-38 unchanged); the SST-02 drafts
when the taxable period closes; CP204 reminders are proactive. **A FOURTH clock switch, opened with
the other three at the G1 ceremony.** Cost: **one more F-T3 PR** (wake body + card + allowlist rows),
the computation layer untouched, 裁-33's draft-only wall unmoved, and **PRD.md is NOT edited** —
§0 already says the lifecycle including tax is Clara's.

— **A STANDING RULE the owner extracted, binding every lane:** a fail-closed default **narrows only
the undecided cell, never the architecture**; **every one is an INFORM he can flip**; and **at P6's
ENTRY GATE the conductor presents ONE list of every agentic-facing default** for a single *"which of
these should Clara be bolder on?"* pass — at P6 deliberately, so the question is answered against
real data instead of imagination. 裁-44 is what that question produced when asked early.

## Items that stay INFORM (conductor decisions; say so if you want any the other way)

26. **Which app serves `app.clarabook.com` today**: the Pages deployment is the OLD
    `apps/dashboard`; `apps/web` (Workers) is not deployed until P6's cutover PR. A beta user today
    would reach the retiring app — the cutover is on the critical path and its date is not fixed.

27. **The F-A8 lane row is stale**: PROGRESS says `design` while 982 lines of built migration sit on
    branch f-a8/pr-1 with no review record; beta-era by 裁-29 — trued at the next docs sweep.

35. **裁-18b delegation rulings, issued so the build did not stall:** **O2** the proposal door writes
    NO refusal-receipt row (a raising door cannot; the refusal is evidenced on the wake task/turn
    path, and the dead vocabulary is DELETED rather than left unreachable) · **O1** C1's identity
    rungs are **not retroactive** — a read-only census of already-signed bindings ships, no
    auto-revoke · **O3** at post time a **REVOKED** binding refuses, an **EXPIRED** one annotates,
    and reversals bypass.

37. **裁-21 PR-a delegation rulings from the Codex pass:** **(a)** the three entity types the
    research left without an equity variant (`society`, `cooperative`, `other`) get a **PROVISIONAL**
    generic variant ("Accumulated funds" / "Capital & retained earnings"), basis recorded as *"not
    researched — owner review owed"*, so the tail can prove every live entity type is covered ·
    **(b)** the template's tax fields keep **CITATIONS ONLY** — every % and RM figure the research
    carried is stripped from structured columns (constraint 2; F-T3's effective-dated tables own
    numbers), while the research document keeps them for humans · **(c) CONTENT, as the reviewer
    measured it:** the 100-account starter lacked MPERS 4.2 minimum face items (PPE classes beyond
    motor vehicles, borrowings/HP/lease, current + deferred tax, directors' accounts, intangibles)
    and every "(Tax-Split)" family was `opt_in` with EMPTY trim keys — so Q8's "own accounts"
    benefit would never have planted. Since the platform starter is **unamendable in-product after
    merge** (only a v2 migration can change it), the conductor ruled the **LHDN add-back families
    CORE** and a research addendum added the MPERS 4.2 items (~25–40 accounts) **before merge**
    (landed as #424). *Say so if you would rather have shipped the 100 and added a v2 later, or want
    (a) researched properly before beta.*

38. **F-A9 PR-1B delegation ruling:** gate 7's REMOVE takes **BOTH** arms —
    `_reserve_processing_call` **and** `_settle_processing_call` (settle enforced the identical
    `pages_per_day` budget, so removing only reserve would relocate the brake to *after* the vendor
    pages were bought). **D1 is FIVE bodies, not the design's two** — the census was not
    closed-world; gate 6's "mandatory rename" has no subject at the bytes. *Say so if you want the
    settle arm kept.*

39. **P6 scope item (found by F-A9 PR-1B, read statically):** `apps/dashboard`'s `SweepReceiptCard`
    parses keys `get_sweep_run` never returns, so its five tiles render 0 today. The dashboard
    retires at P6, but **`apps/web`'s sweep panel must be checked against the real return shape**
    when 裁-20's card lands. Also five `refused_budget` read sites in `apps/web` (PR-1C's list),
    including one degrading to the raw token.

40. **Pre-beta backlog minted by the duplicate-open-wall review (the conductor schedules):**
    **(a)** `wake_open_firm_question` can still mint the FIRST `onboarding_proposed` question with a
    caller-supplied kind and candidates, **bypassing Door 2's egress authorisation (CLR28), the A14
    name-family wall and 裁-22's basis resolution** — the duplicate wall closes the duplicate half
    only. Rec: a small migration refusing `onboarding_proposed` (and any Door-2-owned kind) from
    `wake_open_firm_question`, so only Door 2 mints it; and the future accept verb must never trust
    a question's candidates blindly. **(b)** 99 `exception when unique_violation` handlers in the
    chain, only ~15 of which read `constraint_name` — one of them **relabels EVERY unique_violation
    as `binding_conflict`**; a sweep at the fix queue.

41. **Backlog minted by the F-A9 PR-1B review (the conductor schedules):** **(a)**
    `_approve_entry_core`'s refusal prose still names a "budget" gate that no longer exists after
    PR-1B — a sixth writer body, its own follow-up, with the drafting-trio test's exact-equality pin
    re-cut. **(b)** `packages/db/deploy/autopost-lane-unify-0031-postverify.sql` is **already RED at
    step 4/6** at the `0147` frontier on both sides ("the admitted path no longer reserves/settles an
    idempotent op-key receipt, or a second `_finish_op` site appeared") — **pre-existing, unrelated
    to F-A9**; a ceremony that runs this postverify today reds. Fix queue.

42. **裁-19 PR-1 (CLEAR), measured:** the canonicalising read layer adds **~15% to an aging read**
    (14–15 µs per open item end-to-end against the byte-identical pre-splice body, ~+14 ms on a
    1 000-item book) — paid per domain per close-gate evaluation and on each panel load; a
    `cross join lateral` rewrite removes about a third of it, in its own round. **P1: a merge made
    BEFORE this deploys carries no carrier row and is not reversible by PR-2's un-merge door** — in
    PROGRESS Known issues at merge.
