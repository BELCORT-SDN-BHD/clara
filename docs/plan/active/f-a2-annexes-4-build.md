# F-A2 annex 4 of 4 — Annex J: the Track-A sitting's consequences for F-A2

> **Why this file exists.** The F-A2 design set (`f-a2-agentic-posting-design.md` +
> `f-a2-annexes-1-estate.md` / `-2-mechanics.md` / `-3-record.md`) is at its 500-line harness
> ceiling and under separate review, so the 2026-08-22 Track-A sitting's F-A2 consequences are
> recorded HERE rather than folded into it. **Nothing in this annex changes the F-A2 design's
> ruled shape** — D1-D43 stand exactly as `-3-record.md` §H carries them. Two items are
> RECORDS of a law that changed under F-A2's feet, one is a build obligation with a date, and
> one is an OPEN OWNER QUESTION that F-A2's own verifier raised.
>
> **Source of record for every ruling cited here: `docs/adr/0074-the-track-a-sitting.md`**
> (TA-P1 … TA-P14), with the agenda and member tables at `track-a-sitting-1.md` / `-2.md` /
> `-3.md`. On any divergence the ADR governs.

---

## J.1 — 7A-R3 and E-R13 are RECORDED as dissolved (TA-P11, ruled BEFORE PR-1 merges)

**The fact:** `7A-R3` ("a no-tax invoice never posts unattended", ADR-063) and **E-R13's
registered mechanical lift** (ADR-065) rested on the nine §4.95 controls that retire with the
rules machine. F-A2's breeding excision and the execution-tier retirement remove the machinery
they rode. **From the moment PR-1 merges, "no tax printed" is no longer an extra gate on the
agent lane** — not by a new decision, but because the thing that enforced it is gone.

**Why this paragraph exists at all.** ADR-0072① forbids a law lapsing by inertia. Without a
written record, 7A-R3 would have gone void unannounced — the exact silent-inheritance shape
that directive was minted to prevent. **This is a RECORD, not a silence, and the sitting ruled
it deliberately ahead of the merge** (the agenda asked for that timing precisely because after
the merge the ruling is in force in fact whether or not anyone wrote it down).

**The successor wall, named:** the witness pair's **nil-tax arm** plus the **SST-registrant
lock** — opener ②, lock 3, the one that fired on the corpus's only genuine registrant in the
2026-08-21 re-measure. The residual case that neither covers — a client who *ought* to charge
SST but issues no-tax invoices — belongs to **F-T1's SST engine**, not to a posting gate.

**The cost the owner accepted, on the record:** ROME SECRETARY's twenty-two all-no-tax invoices
begin posting unattended the moment F-A2 lands. If a client's SST registration status is judged
wrong, the error runs in the "should have charged tax, treated as no-tax" direction — a
tax-filing problem that posts quietly.

**Build obligation:** none in PR-1 beyond what the excision already does. The retirement census
in `f-a2-annexes-1-estate.md` Annex B keeps its dispositions; this annex adds the *law* record
the census could not carry.

## J.2 — the unattended lane's `refused_budget` gate (TA-P12, REMOVE)

**Ruled REMOVE**, and it is the gate G8 names literally: the unattended lane refuses scan-class
work at **60%** of the daily token budget and one-click-class work at **100%**, writing
`refused_budget` on the receipt. Two more go with it — the chat lane's daily token hard cap
(Slice-4) and the **15-unattended-sales-drafts-per-day quota** (a 7A launch-era trust
throttle: an automation-pausing quota whose unit simply is not tokens). **KEPT:** the
concurrency floors (3 concurrent runs, 2 concurrent scans) — engine protection, not spend, and
G8's own carve-out.

**Execution, two batches, and the F-A2 interaction:**
- The **chat token cap ships as a HOTFIX ahead of F-A9** — it is live behaviour already in
  violation of a ruling, and it does not wait for F-A2 or F-A9.
- The **unattended gate ships with F-A9, or with that lane's own retirement inside Wave F.**
  The owner heard and accepted that this work may be wasted if the lane retires first, rather
  than let an in-violation behaviour stand for weeks. **F-A2's retirement PR should therefore
  check whether it is already removing the gate's host body** — if it is, the F-A9 batch has
  nothing left to do and should say so rather than re-cut a body that no longer exists.
- **MANDATORY RENAME, and it is not cosmetic:** engine-protection refusals share the
  `refused_budget` receipt string with budget refusals. Once the budget gate is gone, a pure
  engine-protection refusal still prints "insufficient budget" to a human reading the receipt —
  **a visible record that lies, which digest law 22 forbids.** History rows are append-only and
  keep the old spelling by law; the read surfaces must explain the two spellings.

## J.3 — three sitting rulings that touch F-A2's neighbours (awareness, not scope change)

- **TA-P13's ONE metering ledger.** `llm_usage_events` becomes the sole ledger and gains
  `client_id` + the triggering actor, **nullable, before the first production row**. **F-A2 is
  named as one of the four features that must record through that one door** (with F-A6, F-A7b,
  F-A8). Nothing in PR-1 changes today; the obligation binds whenever F-A2's lane starts
  emitting usage rows.
- **TA-P4's receipt discipline** extends to every agent judgement act with model + version +
  rationale, and `via_wake_kind` stops being written NULL. F-A2's `entry_post_receipts` already
  carries the posting-lane shape; the widening lands on the close and report lanes, **but it
  shares `finalize_close` with Track B's task #17 Fix A and TA-P6's `segregation_mode` change —
  ONE migration or a strict ordering, ONE D1 write-quiesce window for all three.**
- **TA-P1's OPEN REGISTER** does not reach F-A2's verbs (posting authority was already ruled at
  ADR-0071/G1 and re-confirmed at ADR-0072②), but it does mean **F-A3's unmatch/void/register
  verbs arrive as wake SIBLING verbs** — the same authoring pattern PR-1 uses, so the estate
  idiom F-A2 establishes is the one F-A3 will copy.

## J.4 — R-OWNER: B15's second door — **OPEN, awaiting the owner's answer**

Raised by the **F-1 verifier AFTER the sitting closed**, so it is not one of the fourteen
rulings and **nothing here is decided.** It is recorded in both places a reader might look:
here, and in `docs/adr/0074-the-track-a-sitting.md`'s residue.

**The shape.** A supplier bill that **STATES a registration number** which is **untestable**
because the client file carries **neither a TIN nor an SSM** resolves to `none`
(`0049:986-988`). `0049:975-979` records that real Malaysian clients typically hold an **SSM
and no TIN** — so this is the common case, not an edge. With the registration resolving to
`none`, **B15's generic arm PASSES**, and **the GB-1 phantom-payment shape lands through D18's
door.** B15 was minted at the PR-0 gate to close the generic-on-directional hole; this is its
*second* door, and it is open.

**The options as put, unranked:**

| | Option | What it costs |
|---|---|---|
| **A** | **B15 also REFUSES when a registration is stated but unresolvable** — the fail-closed default | Bills from clients with no SSM/TIN on file stop at a draft until the file is completed; the safest reading, and the one the house default picks in silence |
| **B** | **Keep D18 and MEASURE the population under D37** | Nothing stops today; the exposure is quantified before it is closed, at the price of running the known shape live while the count comes in |
| **C** | **Fix the root — SSM alone suffices for resolution** | The correct long answer, but it changes identity resolution and needs **its own reviewed migration**, so it cannot ride PR-1 |

**Status: open.** The owner has not answered. Until he does, **no build lane may assume any of
the three** — a builder who needs the answer raises it rather than picking the convenient one,
and review law 2 applies: the absence of an answer is not an answer.
