# Wave E — THE ACCEPTANCE MATRICES (minted BEFORE the build)

> **FALSIFIABLE MATRIX, 2026-08-09 — A PRE-BUILD INSTRUMENT, NOT AN EVIDENCE RECORD AND NOT A
> RULING.** E-R9's acceptance-discipline clause requires that *"before each acceptance runs, the
> build mints a falsifiable acceptance matrix … at the `wave-7a-acceptance-h1/h2.md` evidence
> grade."* This is that mint. It states what each acceptance run must be ASKED and what a pass
> must LOOK like, in advance, so that the run cannot grade itself after the fact.
> **Where this document and `docs/plan/wave-e-contract.md` disagree, the contract wins.**
> Siblings: `wave-e-design-skeleton.md` (campaign frame · E-a close model · the E-R12 trio) ·
> `wave-e-design-reporting.md` (E-b algebra/FS/render · E-c authoring). The as-run records that
> discharge these cells are written LATER, as their own files, at the h1/h2 grade.

> **THE LESSON THIS MATRIX IS SHAPED BY (ADR-066, minted by the A1 field failure, quoted verbatim
> once and never paraphrased again):**
>
> > **A wall that never refused anything is not a wall that held — it is a wall that was never
> > asked.**
>
> Ninety-six synthetic cells were green while the reader failed on the only two real documents it
> existed to fix. Every section below therefore carries **RIGHT-ANSWER cells** — "the mechanism
> produces the CORRECT figure/label on the target corpus" — beside its refusal cells. A refusal
> battery alone does not discharge a section.

---

## 0. How to read a cell

### 0.1 The seven fields (ruled — E-R9 acceptance discipline, verbatim column set)

`ruling → precondition → action → exact DB/artifact assertion → negative case → implementation
owner (lane) → independent verifier`. Every row below carries all seven. A cell with a blank
assertion is not a cell.

### 0.2 Outcome vocabulary (ruled by precedent — `wave-7a-acceptance-h2.md`; never conflate)

| token | means |
|---|---|
| **SEEN** | a read actually observed the receipt/row/byte. The only positive evidence class. |
| **NOT SEEN (structural reason)** | the read ran; the thing did not occur, and the run states the MEASURED reason it could not (e.g. a guard sits below another in evaluation order — proven by reading the order, not assumed). |
| **NOT REACHABLE** | no honest path from this lane reaches it; a harness that does not exist would be required. |
| **NOT CAPTURED** | reachable, but blocked by an external resource (an owner gate, a missing document). |
| **NOT PROVEN** | attempted, inconclusive. |

**Absence is not evidence; a derived state is not evidence** (standing law). A cell may be
discharged only by what a read SAW. Every absence and every derivation falls to the fail-closed
branch of its own cell.

### 0.3 The right-answer rule (ruled — ADR-066's standing lesson)

- A **zero-count refusal head is a question to open, never a wall to bank.** If a refusal cell
  counts zero on the live corpus, the cell is recorded **UNPROVEN IN THE FIELD** — never silently
  credited — and the run states whether the wall was never triggered or never *asked*.
- The **verify-before-approve gate is scored independently** of the mechanism under test: a wrong
  name / wrong figure = STOP, file the finding, approve nothing. A gate catch is a PASS of the
  gate and a FAIL of the mechanism, recorded as two separate facts.
- **Counts are re-measured at run time, never inherited.** E-R9's table says RS carries "19
  approved real invoices"; ADR-066 (`wave-e-f6f9-acceptance.md:131-136`) records a twentieth
  (`f6da5aff`, 60,000¢) and TB 3,116,500 = 3,116,500. A matrix cell that cites a count cites the
  count it MEASURED, with its query, at the moment it ran.

### 0.4 Standing constraints every cell inherits

- **E-R4 governs every numeral path.** No model-generated numeral reaches a durable artifact
  unless a versioned deterministic evaluator ORIGINATES it from DB-owned inputs. Money is
  `bigint` cents end to end; assertions are stated in cents.
- **No new EXECUTE grant to the agent role on any close/approve-class verb.** The mirror is
  `0004_governed_fns.sql:766-780` (human writers → `clara_authenticated`, including
  `approve_entry(uuid,uuid,text,text)` and `reverse_entry(uuid,text,text)`) against
  `0004:762-764` + `0004:796-797` (`clara_agent_ro` holds four accessors and three reads and
  nothing else). A write call under the agent role fails at **`42501`** before any body runs,
  because `0004:752-753` revokes EXECUTE from PUBLIC and default-privileges first.
- **Refusal-token convention.** Existing walls are quoted VERBATIM with file:line. New close/
  report refusals follow the standing shape — a `CLRnn` errcode plus
  `detail = jsonb_build_object('reason','<snake_case_token>', …)::text` (the live exemplar:
  `0044_wave_d_b3_af2_composite.sql:1266-1272`). **(builder choice)** the token spellings
  proposed below are defaults; the exact `CLRnn` code is claimed by the build against the live
  code roster and is never pre-assigned here — same discipline as migration numbers.
- **Migration numbers are claimed at MERGE.** Cells name build lanes (α..θ), never numbers.
- **Lane letters** (from the campaign frame): **α** E-R12 trio · **β** period spine + close model
  (DB) · **γ** month snapshots + staleness (DB) · **δ** metric algebra + catalog + evaluator (DB)
  · **ε** FS template layers + wording structure + claim assessment + sealed-artifact registry
  (DB) · **ζ** render worker + freeze-lint extension + DR §10 (runtime) · **η** E-c authoring lane
  · **θ** minimal surfaces (plumbing grade; all UX polish is Wave G per E-R10).

### 0.5 Independent verifier roster (builder choice — the ROLE assignments are adjustable; the
independence law is not)

| handle | who | law it obeys |
|---|---|---|
| **V-DB** | a contract-blind DB read lane, explicit model override, different model from the lane that built the object | must query a DIFFERENT table/angle than the one that produced the claim (`wave-7a-acceptance-h1.md` D5's precedent: predicted one token, measured another, then re-derived the gap from the guard's own precondition rather than editing the prediction away) |
| **V-RT** | a contract-blind runtime/artifact lane, explicit model override | reads bytes and hashes, not code comments |
| **V-CI** | a committed, re-runnable CI cell | a rejected predicate stays executable, per the `x7-path-a-rejected.mjs` precedent (`wave-e-f6f9-acceptance.md:242-243`) |
| **V-OWNER** | the owner's own act | only for cells that are a human professional judgement (attestations, wording verification, the sole-prop label) |

A cell verified only by the lane that built it is NOT discharged (ADR-061 Law 1 — judgement logic
gets an independent pass).

---

## 1. Section A — SANDBOX FULL BATTERY (ROME PUBLIC ADVISORY, the Gate-S synthetic sandbox)

E-R9 row 1: *close → reopen → guard activation → abuse drills.* The sandbox is the only place the
abuse drills may run; its only client is fictional (never confuse it with BELCORT's real ROME
pair). The battery does not yet exist on disk — `.tmp/h2/` (generator → corpus dir → driver) is
the PRECEDENT SHAPE for building one, not the battery itself.

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **A1** | E-R2, E-R3 | sandbox FY defined via `clients.fy_end_month/day` (`0041:774-779`; note the `fallback` boolean at `0041:4244-4245` — a defaulted 12/31 must never read as asserted) | close a clean FY | close receipt row exists ONCE; `verify_*`-style recompute returns `verified:true`; P&L→RE roll ties to the sen (closing(n) = opening(n+1), both cents, both read) | a receipt that verifies against its own stored snapshot instead of a fresh recompute is a FAIL (the `0040:4537-4644` law: recompute, never trust storage) | β | V-DB |
| **A2** | E-R2 drawer 1 | force a control tie break (AR ≠ Σ open items) | attempt close | refusal token fires; **no override argument exists in the signature** (proven by `pg_get_function_arguments`, not by reading a comment) | a drawer-1 break that an attestation clears is a FAIL of the drawer model | β | V-DB |
| **A3** | E-R2 drawer 2 | an unapproved in-period draft exists | close without attestation, then with | first call refuses (`reason` token verbatim); second call succeeds and the attestation is written into the close receipt PERMANENTLY with who/why/when | an attested override that leaves no permanent receipt row is a FAIL | β | V-DB |
| **A4** | E-R2 drawer 3 | a soft signal is red | close | close SUCCEEDS; the signal is present in the readiness read | a drawer-3 signal that blocks is a FAIL | β,θ | V-DB |
| **A5** | E-R11 key ③, ARCHITECTURE §3.6 | FY(n) closed, FY(n+1) close live | attempt to reverse an FY(n) entry | ordering guard refuses (`reason` token verbatim); reopen with stated reason + named correction target mints a reopen receipt | a reopen that records no correction target is a FAIL | β | V-DB |
| **A6a** | **E-R6** | close model live | correct an entry inside a CLOSED period | `clara._correction_period_state` returns a real closed-state token; the dormant guard raises **`CLR19` `'correction touches a closed period'`**. The guard text appears in three file generations (`0007:2558-2561`, `0009:2463-2466`, `0027:262-265`) but is **ONE live function** — `clara.approve_wrong_client_correction`, live body = the 0027 generation (skeleton §0.3 Correction 2b) — so the assertion reads the live `prosrc`, never file text | the guard NOT firing on a closed-period correction is the whole point of E-R6 and a hard FAIL | β | V-DB |
| **A6b** | **E-R6 — THE ACTIVATION TRAP** | close model live | correct an entry inside an **OPEN** period | the correction **SUCCEEDS**. The live predicate is `_correction_period_state(...) <> 'no_period_model'` → raise. A body that returns `'open'` for open periods makes **every** correction refuse. The skeleton pins the mechanism (`wave-e-design-skeleton-part2.md` §2.9) — `'no_period_model'` stays the PERMIT token, the live guard is not recut, and an honest twin fn serves every new consumer — but this cell asserts the OUTCOME either way | an activated model that breaks open-period corrections is a silent, total regression and a hard FAIL | β | V-DB + V-CI |
| **A6c** | E-R6 + Law 2 | as above | call the state fn with an entry id that does not exist | the state resolves **fail-closed**. Today the stub is `select 'no_period_model' where exists(...)` (`0007:2420-2424`) — a missing entry returns **NULL**, and `NULL <> 'no_period_model'` is NULL, so the guard does NOT raise: an absence reads as "not closed" | leaving the NULL path fail-open after activation is a FAIL (absence-is-not-evidence, applied to the guard itself) | β | V-DB |
| **A7** | E-R4, E-R8 | a close/period narrative is generated | ask the model to state a figure in prose | narration carries **placeholders only**; the rendered artifact's numerals all trace to evaluator cells with per-cell provenance (E-R5's ten fields) | a literal numeral typed by the model into narration and rendered is a FAIL of the cardinal law | δ,η | V-RT |
| **A8** | E-R4, E-R14 charts | a chart spec is authored | submit a spec containing an inline value / SQL / JS / a literal threshold line | the closed AST validator REJECTS it by name; every plotted series resolves to an approved metric version evaluated in the DB and PERSISTED before render | a chart that renders from an inline array is a FAIL | δ,ε | V-CI |
| **A9** | E-R11, invariant 4 | agent session under `clara_agent_ro` | `select <close_verb>(…)` | **`42501` insufficient_privilege**, raised before any body runs; and a diff of the lane's grant statements vs `0004:766-780`'s matrix shows **zero** new agent grants | any close/approve-class EXECUTE granted to `clara_agent_ro` is a FAIL, whether or not it is exercised | β | V-CI |
| **A10** | E-R11 key ② | a `bookkeeper`-rank actor (`role_rank`, `0002:326-331`) | attempt close | refused at the role floor; the same actor's key-① prepare acts SUCCEED (right-answer half — a boundary that refuses everything is not a boundary) | a bookkeeper who can close, or one who can no longer prepare, are both FAILs | β | V-DB |
| **A11** | E-R11 key ③ | bookkeeper-rank actor; then an owner-granted key-③ member | attempt reopen as each | first refused; second succeeds; the grant and the revoke are each their own audited act with actor + timestamp | a capability list mutable by anyone but the firm owner is a FAIL | β | V-DB |
| **A12** | E-R11 SoD / PRD §2 | sandbox firm with ≥2 eligible humans | same human prepares and closes | refused (maker = checker on the high-stakes lane); a solo-firm branch records an explicit self-approval attestation instead | an agent identity appearing as checker anywhere is a FAIL | β | V-DB |
| **A13** | E-R2 drawer 1 (serialized lock) | two sessions | both call close on the same client concurrently | exactly ONE close receipt exists; the loser refuses or waits — the winner is decided by `pg_advisory_xact_lock(<namespace>, hashtext(<scope>))` on an **unused** namespace constant. **SIX are observed live, not five** (`203005001`..`203005006` — the sixth is 0038's per-bank-account statement-chain lock, `0038:1351`, `:1628-1634`; skeleton §0.2's correction); there is no registry; the skeleton claims **`203005007`**, and the migration must re-grep in its own prestate probe because "free at design time" is a derived state by merge day | two receipts, or a namespace collision with an existing lane, are both FAILs | β | V-DB |
| **A14** | Appendix A finding 1 | a completed close | replay the SAME close call with the same `op_key` | `clara.op_receipts` (PK `firm_id,fn,op_key`, `0002:295-303`) returns the stored result; **no second receipt, no second entry, no second event** | a replay that mints a second close, or that silently returns a fresh unrecorded result, is a FAIL | β | V-DB |
| **A15** | E-R5 edge policies | catalog metric with a zero denominator, a negative denominator, missing data, a sign-flip case, and a rounding boundary | evaluate each | each of the **five named, versioned policies** resolves to its declared outcome, recorded per cell; the policy VERSION appears in the cell's provenance | an evaluator that silently returns NULL, 0, or an unlabelled sentinel for any of the five is a FAIL | δ | V-CI |
| **A16** | E-R5 lifecycle | a `draft` definition | render it into a management artifact, then attempt a statutory pack | management render succeeds **under the mandatory "uncertified" watermark**; statutory use is refused | a draft definition reaching a statutory pack, or a management render missing the watermark, are both FAILs | δ,ε | V-RT |
| **A17** | E-R14 seven-year reproducibility | a sealed sandbox artifact | re-render from the sealed manifest on a second machine/run | **pre-sign PDF SHA-256 is byte-identical**; the signed original (where one exists) is RETRIEVED, never regenerated | a "reproduced" artifact whose bytes differ, or a regenerated signature presented as the original, are FAILs | ζ | V-RT |
| **A18** | invariant: RLS isolation | sandbox and BELCORT credentials | run the whole battery | **zero writes to any other firm**, asserted by firm id; the sandbox lane never holds a BELCORT credential | any cross-firm row is a hard FAIL and a stop-the-batch event | all | V-DB |

**Section A right-answer anchors:** A1, A4, A10 (prepare half), A16 (management render), and the
positive half of A6b are the cells that prove the battery was *asked* something it should say YES
to. If Section A closes with refusals only, it is not discharged.

---

## 2. Section B — SYNTHETIC GOODS-TRADER FIXTURE (WD-R11 closing stock)

E-R9 row 2, verbatim: **Sandbox synthetic goods-trader fixture ONLY** — no real goods-trading
client exists; **NAMED DEBT:** the first real goods-trading client's onboarding carries the real
acceptance. The fixture does not exist on disk yet.

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **B1** | E-R2 drawer 2 item 2 | fixture client flagged goods-trading; no closing-stock entry in the FY | close | refuses with the completeness token verbatim; the refusal names the missing period | a goods-trader closing with no stock entry and no attestation is a FAIL | β | V-DB |
| **B2** | E-R2 drawer 2 | same, with a named human attestation | close | succeeds; who/why/when written permanently into the close receipt | an attestation that is not per-item, or not recoverable from the receipt years later, is a FAIL | β | V-DB |
| **B3** | **RIGHT ANSWER** · E-R4 | closing stock entered as a real fixture figure | close and render the FS pack | COGS and gross margin on the pack reproduce **to the cent** from DB-owned inputs through the versioned evaluator; opening stock + purchases − closing stock = COGS as an evaluator-originated identity | a correct refusal battery with no proven correct FIGURE does not discharge WD-R11 | δ,ε | V-DB |
| **B4** | E-R9 named debt | — | record | the acceptance record states in its own words that this is a SYNTHETIC discharge and that the **real** WD-R11 acceptance rides the first real goods-trading client's onboarding | claiming WD-R11 discharged on a synthetic fixture is a FAIL of the record, not of the code | β | V-OWNER |

---

## 3. Section C — BEE FY2025 · THE FIRST REAL CLOSE

E-R9 row 3 + row 6. BEE CREATIVE SOLUTION is the going-concern real client. **A sole proprietor is
NOT an employee — his account is EQUITY**, never a staff advance and never a counterparty (WC-R10).
Books are real; ADR-060's data authority is DATA-scoped and every mechanism stays at full force.

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **C1** | E-R2 drawer 2 item 1 (the WD-R6 answer) | depreciation not run through FY end | close FY2025 | **the gate's FIRST REAL FIRING**: refuses, default-refuse-attestable (NOT absolute), token verbatim | a real close that walks past un-run depreciation is a FAIL; so is an ABSOLUTE refusal with no attestation path (that is drawer 1, not drawer 2) | β | V-DB |
| **C2** | **RIGHT ANSWER** · E-R9 | draft **`3c05ab82`** exists (the 11-period catch-up, Feb-2025, 10,393¢; the 0041 ramp rule explains draft-vs-posted — a first-ever run under an authority always drafts) | pull it through human approval, then close | draft `3c05ab82` reaches `approved`; the drawer-2 depreciation gate then reads CLEAR **without** an attestation; TB re-ties to the sen after approval | approving the catch-up and finding the gate still red, or finding it clear only via attestation, is a FAIL | β | V-DB |
| **C3** | **RIGHT ANSWER** · E-R9 (the close-time FA continuity roll, the rolling posture's task #72) | asset **`dfd0fc52`** live (born from the real scanned ENOTEX invoice through acquisition-from-coding; authority live) | close FY2025 | FY2025 **closing NBV in cents = FY2026 opening NBV in cents**, both read (not derived from one another); the roll fires inside the same close act | a roll that reconstructs the opening figure from the closing figure by arithmetic in the agent, rather than reading both from the DB, is a FAIL of E-R4 | β | V-DB |
| **C4** | E-R2 drawer 1 (FA register tie, segment-aware rebuild) | as above | close | the FA tie asserts at the close boundary. Today `clara.fa_register_tie(p_client,p_as_of)` EXISTS (`0041_wave_d_a_fa_register.sql:4257-4399`) and is **visibility-only, never blocking**; the segment-aware `fa_control_tie_out` is **MISSING by name** (header `0041:4250-4256` defers it to "Wave E's close-segment primitive") — the cell asserts the NEW blocking tie, and separately that the old visibility read still reports | shipping the close with only the non-blocking `fa_register_tie` and calling drawer 1 satisfied is a FAIL | β | V-DB |
| **C5** | E-R14 sole-prop format | BEE FS pack generated | read the claim assessment | the pack is labelled **convention-based (P&L + SoFP + capital-account movement)** and its claim assessment is `not_applicable`/`stripped` — **never MPERS-claimed**; the label cannot be reintroduced via filename, cover, or metadata | any MPERS claim on a sole-prop pack is a FAIL. **Status until task #44 clears: NOT CAPTURED** — the positive primary check (LHDN/MIA/ROBA) has not run, and no authoritative sole-prop format was FOUND (UNRESOLVED, not proven-absent) | ε | V-OWNER + V-RT |
| **C6** | E-R9's own exclusion | — | record | the record states that C3 **does NOT discharge WD-R14's opening carry-down deferral**, and cites the measured reason: **BEE held ZERO assets at its 1/1/2025 opening**; the carry-down needs a client that owned assets at opening | folding C3 into a WD-R14 discharge is a FAIL of the record | β | V-OWNER |

---

## 4. Section D — RPR HISTORICAL FY · THE MPERS COMPANY-FORMAT PACK

E-R9 row 4: Sdn Bhd, **9 real months to the sen**; strike-off companies legitimately prepare
historical accounts. RPR carries **two documented allocation scars**.

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **D1** | **RIGHT ANSWER** · E-R9 | 9 real months booked | run TB + the pack | TB ties **to the sen**, both sides read directly (never one side derived from the other); every FS figure reproduces from the evaluator against the pinned books snapshot | a pack whose totals are assembled anywhere but the evaluator is a FAIL | δ,ε | V-DB |
| **D2** | **POSITIVE CELL** · E-R12 item 1 + E-R2 drawer 1 | the two scars stand at as-of **2025-08-31** (+10,000¢ × 1000) and **2025-09-30** | attempt a close at an as-of **earlier than 2026-08-01** | the close **FAILS drawer 1, with no override available**. This is **ruled-correct behaviour**, not a defect — the cell PASSES on the refusal | recording this refusal as a bug, or opening an override to clear it, is a FAIL of the drawer model | β | V-DB |
| **D3** | **RIGHT ANSWER** · E-R12 item 1 | as-of **≥ 2026-08-01** (the scars self-heal at that as-of) | close | the same close **SUCCEEDS**; the drawer-1 tie asserts clean; the receipt records the as-of | if D2 refuses and D3 also refuses, the wall is indiscriminate, not correct — D3 is what proves D2 was a wall and not a brick | β | V-DB |
| **D4** | E-R14 | pack sealed | re-render from the sealed manifest | **byte-reproduction: pre-sign PDF SHA-256 identical** across two independent renders; the manifest pins spec/profile/wording/style/chart versions + books snapshot + dataset hash + evaluator versions + renderer image digest + font/asset hashes | a pack that cannot be re-rendered byte-identically is NOT sealed, whatever the registry says | ζ | V-RT |
| **D5** | E-R14 wording | period begins before 2027-01-01 | generate | the pack resolves **MPERS(2016)** wording rows by effective date (the dual-version table is born two-versioned, on the `clara.sst_threshold_schedule` idiom — `0016_a21_compliance_watch.sql:237-248`, named as THE precedent by `0043_wave_d_b1_staff_advances.sql:617-618`) | **STATUS: NOT CAPTURED until task #43 clears.** The MASB illustrative PDF's automated extraction FAILED and only the failure was observed; a manual pull + HUMAN verify is REQUIRED before any wording enters the policy tables. **Structure cells may run on placeholder keys; wording-CONTENT cells may not run at all.** Inventing wording is a FAIL | ε | V-OWNER |
| **D6** | E-R8, E-R14 claim states | pack + a custom cut of it | assess both | assessments read `eligible` on the conforming pack and `stripped` on the custom cut; `stripped` **never blocks generation**; the claim cannot be smuggled back via filename, cover, or metadata | a custom cut that blocks, or one that silently keeps the claim, are both FAILs | ε | V-RT |
| **D7** | PRD §4 item 14 (the honest-FS law) | — | inspect the pack | the pack ships **SoFP + SoCI + SOCE + cash-flow + basic notes**, or it does not claim MPERS compliance — the two are one cell, asserted together | claiming compliance on an incomplete pack is a FAIL of the cardinal honest-FS law | ε | V-DB |
| **D8** | E-R5 per-cell provenance (capacity) | the RPR pack sealed + the RS snapshot minted | measure | the run records the **COUNT of `clara.metric_cells` rows** minted by the full pack + the snapshot witness, with its query, and projects seven-year growth at the ≤5,000-cells-per-run budget (CA 2016 s.245: seven-year retention, no pruning — the campaign's largest new table, `wave-e-design-reporting.md` §4.3) | closing the campaign with no measured capacity number leaves the seven-year table unsized — a FAIL of the record | δ,ε | V-DB |

---

## 5. Section E — RS SNAPSHOT + STALENESS WITNESS

E-R9 row 5. **ROME SECRETARY's customers are NAME-ONLY — never enrich them with registrations or
TINs** (the standing enrichment trap; `_resolve_counterparty` would then refuse every later
invoice at CLR23 `registration_conflict`, unattended and silently).

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **E1** | E-R3 (months never lock) | a month with real approved invoices | snapshot the month | a management-accounts artifact is minted: timestamped, durable, hash recorded; **the books stay OPEN** (a post into that month afterwards must succeed) | a snapshot that locks the month is a FAIL of E-R3 | γ | V-DB |
| **E2** | **E-R3 staleness, the load-bearing cell** | E1 artifact exists | post an approved entry whose effect intersects the snapshotted period | the artifact is marked **STALE in the SAME audited transaction** as the posting. The mechanism is pinned (`wave-e-design-skeleton-part2.md` §2.11): an `after` row trigger inside the mutating statement — so the assertion instrument is transactional identity: read `snapshot_state` = `'stale'` **inside the same uncommitted transaction** as the posting, or diff the assessment row's `xmin` against the entry's; never observe staleness "eventually" | any asynchronous window in which a stale artifact reads as current is a FAIL (Invariant-4 discipline) | γ | V-DB |
| **E3** | E-R3 immutability | after E2 | re-hash the artifact bytes | **bytes UNCHANGED**; staleness lives only in a separate append-only assessment row | mutating the artifact to express staleness is a FAIL — "change is free, silent change is impossible" | γ,ζ | V-RT |
| **E4** | §0.3 corpus-count discipline | — | measure | the run records the approved-invoice count **it measured**, with its query, at run time. E-R9's "19" was the ratification-day figure; ADR-066 records a twentieth (`f6da5aff`, DR `300-000` / CR `500-000`, 60,000¢) and TB **3,116,500 = 3,116,500** | citing 19 (or 20) without re-measuring is a FAIL of the discipline, even if the number happens to be right | γ | V-DB |
| **E5** | the enrichment trap | — | read at start and at end | **registrations = 0 across every RS customer**, positively read both times; the count of customers is re-measured, not inherited | one enriched RS customer is an irreversible field defect and a stop-the-batch event | γ | V-DB |
| **E6** | **RIGHT ANSWER** · E-R4 | E1 artifact | read a figure off the artifact | every figure on the snapshot reproduces from the evaluator against the artifact's pinned books watermark | a snapshot whose figures cannot be re-derived is not reproducible, whatever it is labelled | δ,γ | V-DB |

---

## 6. Section F — THE E-R12 CLIENT-FACTS TRIO

Lane **α**, the first strike of the campaign. This section is the one where the ADR-066 lesson
bites hardest: **F-1's wall already exists in the schema**, so a battery that only proves it
refuses would prove nothing new.

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **F1a** | **THE VERIFY-FIRST CELL** · E-R12 item 1 | before writing any code | prove the wall's IDENTITY, not its spelling | `pg_get_functiondef` on the LIVE `clara.allocate_receipt` / `clara.allocate_payment` (thin wrappers, `0044_wave_d_b3_af2_composite.sql:1642-1657` / `:1659-1674`) resolves to the `_core` bodies at `0044:1034` / `0044:1353`, and those bodies contain the unborn-item wall at **`0044:1266-1272`** (receipt) and **`0044:1557-1563`** (payment) | reading a matching STRING in a migration file and calling the wall live is exactly the "spelling is not identity" failure — a FAIL of method even if the conclusion is right | α | V-DB |
| **F1b** | **RIGHT ANSWER** · E-R12 item 1 | a legitimate advance/deposit scenario: money received BEFORE the bill exists | book the money as an advance, then `apply_open_items` once the item exists | the money **POSTS**; the open item settles; AR/aging ties at every as-of in cents. The sanctioned remedy the refusal message itself names must work | if the only proven behaviour is refusal, the guard is a brick: money-before-bill economics is served by the advances machinery, and this cell is what proves it | α | V-DB |
| **F1c** | E-R12 item 1 refusal | an open item dated later than the settlement | call `allocate_receipt` / `allocate_payment` with `p_posting_date < i.item_date` | **`errcode='CLR10'`**, `detail->>'reason' = 'allocation_to_unborn_item'`, carrying `item_id`, `item_date`, `posting_date` — quoted verbatim from the live raise at `0044:1266-1272`; **no override argument exists** (WD-R13 ruled no-override; asserted against the function's argument list, not its comments) | an override flag appearing anywhere on this path is a FAIL of the ruling | α | V-CI |
| **F1d** | E-R12 item 1 scope | — | record | the record states whether F-1 required NEW code or was ratify-plus-regression only. The wall is live since 0041 and carried byte-for-byte into 0044; **if a second, duplicate guard is written, the record must say why** | writing a duplicate wall without stating the reason is a FAIL of the record | α | V-OWNER |
| **F2a** | **RIGHT ANSWER** · E-R12 item 2 | BEE (sole prop) and RPR (Sdn Bhd) | call `clara.get_context_pack(client_id, purpose)` and **read the returned PACK** | the pack's `client` object carries `entity_type` with the correct value per client (`sole_prop` for BEE, `sdn_bhd` for RPR — from `ENTITY_TYPES_V2`, `packages/runtime/workflows/interview.v2.frameworks.ts:50-52`). **The assertion is on the pack JSON, not on the migration source** | asserting the splice landed by grepping the migration is derived-state-as-evidence and a FAIL of method | α | V-DB |
| **F2b** | E-R12 item 2 (the BEE lesson made structural) | F2a green | drive a coding/drafting prompt for BEE | the sole-prop signal reaches the model surface; a proprietor-draw draft codes to **EQUITY**, never to a staff advance and never to a counterparty | a proprietor draw coded as an employee advance is the exact WC-R10 defect this ruling exists to prevent | α,η | V-RT |
| **F2c** | patch-not-rebuild law | before the splice | harvest | the entity_type splice is applied against the **LIVE** `get_context_pack` body (harvested via `pg_get_functiondef`), whose current CoR is the msic-augmented literal at `0036_wave_c0_deferred_belts.sql:1554-1566` — never re-typed from an older migration's text | a from-file rebuild silently reverts the 0017/0018/0019/0036 splices — a quiet, total regression and a hard FAIL | α | V-DB |
| **F3a** | E-R12 item 3 | MSIC door built; RPR active | enter **68109** through the door | the fact is readable on RPR; the receipt carries **who** (actor id), **basis** (the owner's instruction/evidence), **when** (timestamp); the act appears in `clara.audit_log` (`0002:276-288`, committed-success-only) | a code written with no basis captured is a FAIL — who/when alone is not the ruled trio | α | V-DB |
| **F3b** | E-R12 item 3 | RS active | enter **82110** | as F3a | as F3a | α | V-DB |
| **F3c** | E-R12 item 3 | BEE active | enter **74101** | as F3a | as F3a | α | V-DB |
| **F3d** | E-R12 item 3 / ADR-062 | after F3a-c | attempt the OLD path | `clara.commit_client_onboarding` still refuses an active client — **`CLR10` `'client onboarding is not open'`** (`0017_wave_b.sql:2777-2779`). The new door is a NEW door, not a reopening of the interview commit | a door that reopens onboarding for an active client is a FAIL: it would let any committed fact be silently re-answered | α | V-CI |
| **F3e** | E-R4 / Law 2 | the three codes | validate | the door does **not** validate against an official MSIC registry, because **no `clara.msic_codes` reference table exists** — the record states this as a measured absence and names basis-capture as the compensating control | claiming the codes were "validated" when only their format was checked is a FAIL of the record | α | V-OWNER |

---

## 7. The eight mandatory coverage dimensions — sweep index

E-R9's closing sentence lists eight dimensions that must be swept **across** the corpus rows, not
treated as a ninth machine. This index is the proof of no orphaned dimension; each dimension must
close with at least one **SEEN** cell.

| # | dimension | cells |
|---|---|---|
| **D1** | role / RLS boundaries | A9, A10, A11, A12, A18, F3d |
| **D2** | concurrency | A13, E2 (same-transaction assertion) |
| **D3** | idempotency | A14, F3a-c (door replay under `op_key`) |
| **D4** | evaluator edge policies | A15, A16, B3, D1, E6 |
| **D5** | number-injection attempts | A7, A8, B3, D1 |
| **D6** | reopen ordering | A5, A6a, A6b, A6c, D2/D3 |
| **D7** | guard activation (E-R6) | A6a, A6b, A6c |
| **D8** | byte-reproduction of sealed artifacts | A17, D4, E3 |

A dimension whose only cells are refusals is flagged in the as-run record and re-asked with a
right-answer cell before the section closes.

---

## 8. Run order (E-R7 / E-R9 — dependency, not slicing)

E-R7's one stated dependency is binding: **statements cannot be accepted before a close model
exists.** The order below is the E-R9 corpus order plus that dependency; everything else is
**(builder choice)** and may be re-sequenced without reopening a ruling.

1. **Section F (lane α)** — the trio is independent of the close model and may ride early.
2. **Section A (β, then γ/δ/ε/ζ cells as their lanes land)** — the sandbox battery. A6a/A6b/A6c
   cannot run before β births the period model; A15/A16 wait on δ; A17 waits on ζ.
3. **Section B (β + δ/ε)** — the goods-trader fixture.
4. **Section C (β)** — BEE FY2025, the first REAL close. Runs only after Section A's close/reopen
   cells are SEEN in the sandbox.
5. **Section D (δ, ε, ζ)** — the RPR MPERS pack. D5's wording-content cells are **NOT CAPTURED**
   until task #43 clears; D1/D2/D3 do not depend on it.
6. **Section E (γ)** — the RS snapshot/staleness witness.

**Gate between 2 and 4:** no real-client close is attempted until the sandbox has SEEN close,
reopen, and all three guard-activation cells. The sandbox is fully controllable; BELCORT's books
are not.

---

## 9. Closing-Verification-Block — the template every acceptance session ends with

Copy verbatim into each as-run record; fill only with what a read SAW.

```
CLOSING VERIFICATION — <section> · <UTC timestamp> · <lane> · <model override>

1. TB TO THE SEN        <client>: debits <n>¢ = credits <n>¢, difference 0
                        (both sides read directly; NOT one derived from the other)
2. STRANDED COUNT       <query> -> 0 rows  (a POSITIVE read of zero, quoted with its query;
                        an empty result set is only evidence when the query is shown)
3. PROTECTED WITNESSES  canary daba7f2e   -> UNANSWERED (read again, still untouched)
                        b2 witness d023b48c -> status 'draft' (read again, unmoved)
                        RS registrations -> 0 across <n> customers (n re-measured today)
4. CROSS-FIRM ISOLATION zero writes outside firm <id>, asserted by firm id
5. COUNTS RE-MEASURED   every count in this record was measured today; none inherited
6. REFUSAL HEADS        <token>: <n> ; any head at 0 is listed here as an OPEN QUESTION,
                        never as a witnessed wall
7. GATE CATCHES         every verify-before-approve stop, with what it prevented
8. VOCABULARY           each claim tagged SEEN / NOT SEEN (reason) / NOT REACHABLE /
                        NOT CAPTURED / NOT PROVEN
9. SUPAVISOR            <n>/60, runtime pool <n>   (headroom re-checked before any deploy)
```

---

## 10. What this matrix does NOT claim

1. **Nothing here has run.** Every cell is a question minted before the build; not one is
   evidence. The as-run records are separate files.
2. **The sandbox battery, the goods-trader fixture, the close model, the algebra evaluator, the
   FS template layers, the render worker and the MSIC door do not exist on disk.** Cells that
   assert their behaviour assert an OUTCOME the build must produce, not a mechanism this document
   has read.
3. **Two owner gates block content cells, not structure cells:** task #43 (MASB golden-wording
   manual pull + HUMAN verify — D5) and task #44 (sole-prop positive primary check — C5). Both
   are **NOT CAPTURED**, not "absent therefore free to invent".
4. **Proposed refusal-token spellings and `CLRnn` codes in §0.4 are (builder choice)** and bind
   nothing; the as-run record quotes whatever the shipped code actually raises, verbatim.
5. **The lane→cell assignments and the verifier roster are (builder choice)**; the independence
   law behind them (ADR-061 Law 1, and a verifier that reads a different angle than the claim's
   producer) is not.
6. **Cell counts are not coverage.** A section with every cell green and no right-answer cell in
   it is not discharged — see the header lesson, which this document exists to obey.
