# 磨合 grill rulings — 2026-08-29 (the second ledger; continues `mohe-grill-rulings-2026-08-28.md`, which closed at its 500-line cap after 裁-28)

*Same shape as the first ledger: one question per turn, 大白话 each, the owner's words where he
gave them, the ruling, the consequences. The first ledger carries 裁-1 … 裁-28; this one carries
**裁-29 … 裁-44** — the 08-29 morning census (裁-29/30), the 08-29 evening sitting (裁-31 … 裁-34)
and the 08-30 ~02:00 MYT sitting (裁-35 … 裁-44).*

## 裁-29 · The backend residuals are PULLED INTO the sprint — "🔴+⚠️ 全拉进冲刺"

**What the owner asked.** Whether PROGRESS Next-4's "remaining" line (*F-A8 · F-A9 PR-1A · F-A5b
PR-3 · F-A6 v2 · Track B · G1 flips · the F-A4/F-A6 runtime halves · the R2 PRD wording*) was
stale, drifted or wrong — and whether any of it affects the product's experience or features.

**The census (verified against branches, migrations, runtime code and the design docs — not
from PROGRESS).**

| Item | Measured state | Product impact |
|---|---|---|
| R2 PRD wording | SHAPE ruled 2026-08-26 (card R2); the two sentences drafted 2026-08-27 with BOTH owner checkboxes unticked; `PRD.md` untouched. PROGRESS's "owner-approved" was an overstatement. | none — the mechanism (0132/0135) is live; docs only → **裁-30 below** |
| F-A9 PR-1A | **STALE** — `0110` merged (#317) and live. Remaining: PR-1B (brake census DB half: remove the unattended 60%/100% token-budget block, `refused_budget`→`refused_concurrency`, one D1 window) · PR-1C (dashboard rename) · PR-3 (acceptance on real usage). PR-2 is done (`chatTurn.v14.usage.ts`). | ⚠️ unattended drafting still hits the old cap (laws 76/81: meter, never cap) |
| G1 wake sources | live read 2026-08-29: `bank_agent` and `close_prep` both `enabled=false`; F-A3/F-A4 owe the wake workflow bodies + the INSERT-and-flip | 🔴 Clara does not run bank matching / close prep on the clock — only the human-triggered half of the agentic thesis is live |
| F-A6 PR-2 runtime | `packages/runtime` has ZERO callers of `wake_freeform_read`; the DB verb (`0131`/`0136`) is live, the runtime never wired it | 🔴 Clara cannot free-read the books in chat (typed reads only) |
| F-A4 PR-2b runtime | `prepayment_schedule_v1` `deployed=false`; the limb live-inert | ⚠️ no prepayment-schedule proposals (MPERS 17.19) |
| F-A5b PR-3 render worker | unbuilt (sequenced after card-1 by ruling); the frontend's "byte-download door" gap recorded at P3. Also: the FORMAL seal chain has never carried a run (`report_run` zero rows; DR re-render drill unrun) | 🔴 report download dead; the formal chain unexercised |
| F-T3 draft tax computation | design v1.2 gated, ALL-IN ruled; both hard gates (F-A5 PR-1 `0111`, F-A4 `close_receipts` `0120`) now live; no branch | 🔴 the "tax" stage of the lifecycle is manual without it |
| F-T1 SST engine | branch f-t1/pr-1 built + reviewed 2026-08-24, main ~124 commits ahead; owner's B-variant "pre-beta if it fits" | ⚠️ SST-registered clients only |
| F-T2 payroll calendar | `statutory_deadlines` live-EMPTY (`0139`); rows + chase unbuilt; 8 owner questions open | ⚠️ the deadline reminders are empty |
| F-T4 fix queue | PR-1 merged; remainder beta-era by ruling | 🟢 low |
| F-A8 internet lane | partial branch f-a8/pr-1 (2026-08-23, an UNNUMBERED Tier-1 substrate), depends on F-T1's SST table | 🟢 low unless FX clients (FX timing is the owner's open item) |
| F-A6 v2 cross-client | design gated; v1 refuses `cross_client_unavailable` naming the deferred action | ⚠️ HOME chat cannot answer firm-level cross-client questions |
| (found) chat parts | 10 part types render id-only summaries (`PartRenderer.tsx:28`) | ⚠️ thin chat cards; P6's `chatTurn_v15`+ covers part |

**RULING (owner, ~09:20): "🔴+⚠️ 全拉进冲刺（推荐）".** ALL EIGHT are pulled into the sprint,
before Wave G: G1 clock flips (the F-A3/F-A4 wake bodies + INSERT-and-flip) · F-A6 PR-2 runtime
(freeform read in chat, H-4/H-5/S-1) · the reports chain walked end to end + F-A5b PR-3 · F-T3
(PR-0 gate → build) · F-A9 PR-1B · F-A4 PR-2b · F-T1 (rebase → merge → window) · F-T2 rows (its
eight owner questions go to the next batch). **Beta-era: F-A8 · F-A6 v2 · F-T4's remainder.**
Cost stated to the owner: ~8 lanes, 3–4 D1 windows, one runtime deploy; the sprint lengthens.

**Consequences.** Lanes dispatched the same hour: F-A9 PR-1B · F-T1 rebase + re-verify · F-T3
PR-0 replay gate · F-A6 PR-2 (`chatTurn_v15`). The G1 wake bodies + F-A4 PR-2b, F-A5b PR-3 and
F-T2's questions follow as the first builds report. PROGRESS Next-4 trued (this ruling);
the lane rows' "not owed to 磨合" phrasing is superseded by this ruling wherever it appears.

## 裁-30 · The R2 PRD two-tier wording — APPROVED VERBATIM ("批准，照原文进 PRD")

The two proposed texts in `r2-prd-two-tier-wording-draft-2026-08-27.md` were put to the owner
word by word (English original + a 大白话 gloss) and approved unedited. Landed in the same docs
PR: PRD §4 capability item 15 replaced; PRD §6 invariant 1's sentence appended. The draft's two
checkboxes are ticked and it stays as the provenance record. No mechanism changes — digest law
74's two tiers, the `sandbox_watermark` trio (`0132`) and the card-1 seam (`0135`) were already
live.

---

# The 2026-08-29 evening sitting — 裁-31 … 裁-34

*Four rulings taken between the alignment audit's report and the night's builds. Two of them
(裁-31, 裁-33) close acceptance-oracle questions the audit ranked as its highest-latency items;
two (裁-32, 裁-34) answer a build that had already started.*

## 裁-31 · Wave G's acceptance evidence — RE-SCOPED to the desktop corpus as it stands

**What the owner was asked.** The alignment audit's **MBB-1** — the highest-latency item in the
whole queue, because it has **zero engineering path**: four owner-evidence gaps in the Wave-G
corpus with no delivery date and no home in any batch. BEE's GL and TB for **both** fiscal years
plus the full FY2025 document set (two different prior firms produced them: ROME PUBLIC ADVISORY
for FY2024, LUXE WEALTH CONSULTANCY for FY2025) · ROME PROPERTIES' **February and March 2025 bank
statements**, or a written statement that none exist · a **named producer/certifier** for the RS
and RPR packs · and **the authoritative RPR series pick** — a choice between two series already
in hand, cheap, and without it "the bank reconciliation sees every April–July transaction twice".
The ask was a delivery date per item.

**The recommendation.** Give a date for each of the first three; make the fourth today.

**The owner's words.** *"我有的就是 desktop 那些了, 总之 user flow 能走完就好, 能出来报告 and
可以 accounting 周期延续就好."*

**RULING.** The oracle gaps are **NOT chased**. Wave G's acceptance criterion is re-scoped to what
the desktop corpus can actually prove: **on the corpus as-is, every user flow walks end to end,
reports issue, and the accounting period rolls forward.** Nothing is blocked waiting on a document
that may not exist. The **RPR authoritative-series pick is the conductor's**, taken under the
DATA-scoped authority (constraint 14 / ADR-0075): choose by completeness and record the choice in
the Wave-G setup document, so the pick is a recorded act rather than an accident of load order.

**Consequences.** [`wave-g-corpus-oracle-assessment.md`](wave-g-corpus-oracle-assessment.md) and
[`wave-g-e2e-corpus-design.md`](wave-g-e2e-corpus-design.md) must be **trued to this criterion
before the run** — both were written against a bar that assumed the missing evidence would arrive.
PROGRESS's standing "corpus oracle-tier gaps" line under Next-5 narrows to the RPR series pick,
which is now a conductor act, not an owner one. The e2e still fails honestly if a flow cannot
walk; what it no longer does is wait.

## 裁-32 · Who is the proposer when a human "lets Clara propose" — the FULL version

**What the owner was asked.** 裁-18b's PR-0 gate found **B1**: the `interactive` path defeats
signer≠proposer. A human can ask Clara to propose a vendor binding and then sign it himself — the
DB sees an agent-created row and a human signer, and 裁-18a's wall passes by construction, while
the separation of duties it exists to enforce has been walked around in one sentence. Standing law
69 already said the maker is the human who directed the act.

**RULING (the owner, in full).** **The directing human is the effective proposer.**

- **Multi-human firm:** a human **cannot sign a proposal he directed**. Another admin signs it, or
  the firm waits for Clara's own filing-time proposal, which no human directed.
- **Solo firm** (exactly one eligible human): he **may** sign — with **PRD §2's self-approval
  attestation** written onto the binding and into the audit trail, and **visible on the card**. The
  attestation is the price of the exception, not a formality that can be skipped.
- **Two accounts, one person:** **not walled.** That is identity provisioning's boundary, not this
  door's; recorded here so nobody later reads the silence as an oversight.

**The conductor's technical rulings under the same delegation** (each fail-closed, each folded into
PR-1): the 14-day corroboration predicate means **distinct documents, distinct shas, distinct
invoice ids and a trusted `approved_at` span** — never three rows a bookkeeper can date at will ·
**decline is a durable suppression in BOTH proposal writers**, reset only by a named human door ·
the one-open wall covers `proposed` **and** `live`, with an advisory key closing the propose-vs-sign
race · the basis must cover **all three documents'** `vendor_name` and `invoice_id` regions, not one
· `name_family_is_ambiguous` is called at **eligibility and at proposal**, the two places the ROME
family can slip through.

**Consequences.** Recorded on the gate record at
[`binding-proposal-pr0-gate-2026-08-29.md`](binding-proposal-pr0-gate-2026-08-29.md) §B1. The
solo-firm arm is the one that changes shipped behaviour: the binding card gains an attestation
line, and PR-1's battery gains the solo cell.

## 裁-33 · F-T3's acceptance oracle — NO golden bar; tax computations reach DRAFT only

**What the owner was asked.** The audit's **MBB-2**, and the F-T3 PR-0 replay's card D.1 (OQ-1).
F-T3 has no oracle: the corpus holds no Form C, no computation worksheet, no CP204, no fixed-asset
register. The battery proves **walls**, and the gate demonstrated that its two worst historical
defects — a ladder wired to the wrong key (GB-1) and two rungs in each other's place (GB-2) —
**would both have passed the entire battery**. A wall test cannot catch a ladder error. The
recommendation was option **(a)**: the owner or the firm's tax agent hand-works **one** ladder
(R1–R10) for ROME PROPERTIES YA2025, from a Trial Balance and P&L already in the folder — a few
hours, no new client data — as a permanent regression bar.

**RULING.** **No golden bar.** The owner declined the hand-worked ladder, and the fail-closed
default already in force becomes the standing shape: **PR-1 through PR-6 may merge; PR-7 (the
artifacts) is NOT built for beta, and no tax computation reaches `issued`.** The `issued`
transition is **walled by a named refusal**, not by convention — a wall a later lane has to
deliberately remove, not a gap it can drift through.

**Consequences.** F-T3 ships as a **draft-only** capability: the ladder computes, a human reads it,
and nothing seals. That is honest — an unbarred number never becomes a signed statement — and it
costs the lane its last PR. If the bar is ever worked, PR-7 is the item that unblocks.

## 裁-34 · Track B's frontend home — a Tax tab, a firm-level deadline feed, one register line

**What the owner was asked.** The audit's **P-5**, an information-architecture decision nobody
owned: where do the SST engine (F-T1), the tax computation (F-T3) and the payroll deadline calendar
(F-T2) **live** in `apps/web`? No design named a frontend home for any of the three, and F-T2's
only page targeted the retiring `apps/dashboard`. The stated cost of not ruling: three lanes invent
three answers.

**RULING.** One home each, all of it in **P6, with the backend — no new phase.**

- **A `Tax` tab on the client workbench.** SST (F-T1): registration status · the period's output tax
  · the SST-02 draft. Income tax (F-T3): the R1–R10 draft card + the CP204 schedule, **draft only**
  (裁-33's wall is what that phrase means here).
- **The payroll statutory deadlines as a FIRM-level needs-you feed** — Clara reminds; the deadline
  is not a page the firm has to remember to open.
- **One line on the compliance register page**, so the register stays the single place a
  professional can see what is owed.

**Consequences.** F-T2's `apps/dashboard` page target is dead; the feed is the target. P6's scope
grows by three surfaces, all of them reading doors that already exist or that their lanes are
building. The three lanes stop needing to guess.

---

# The 2026-08-30 ~02:00 MYT sitting — 裁-35 … 裁-44

*Ten rulings, taken after the owner asked the fair question:* **"为什么裁决好像永远都裁不完?"**
*The honest answer, given before the sitting started, is that they come from three different
places, and only one of them is endless-looking by mistake:* **(1) build-time discoveries** — a
lane measures something the design could not know, and most of those are handled by delegation
plus an INFORM line, never a sitting; **(2) registered-but-unscheduled items** — questions that
were written down correctly and then never given a date, which is what the alignment audit exists
to surface, and which is a **finite backlog being drained**; **(3) genuine product calls** — what
the thing should DO, which only the owner can answer and which will keep arriving as long as the
product grows. *This sitting is mostly (2).*

**A STANDING RULE the owner extracted from the sitting, and it binds every lane from here.** He
asked the sharper version of the same question: *do all these fail-closed defaults quietly dull the
agentic vision?* The answer, recorded as a rule rather than a reassurance:

1. **A fail-closed default narrows only the UNDECIDED CELL — never the architecture.** It is the
   safe-side answer to one open question, not a decision that the agent should do less.
2. **Every fail-closed default is an INFORM the owner can flip**, at any time, by saying so. None of
   them is a ruling he has already given.
3. **At P6's ENTRY GATE the conductor presents ONE list of every agentic-facing default** — all of
   them, in one place, for a single *"which of these should Clara be bolder on?"* pass. It sits at
   P6 deliberately: by then real data has walked the flows, so the question is answered against
   evidence instead of against imagination.

*裁-44 below is what happens when that question is asked early — an entire lane's posture changed
in one turn.*

## 裁-35 · 裁-19's re-home WRITE door — S0, no write door

**What the owner was asked.** A **ruling-vs-ruling collision**, minted by 裁-19 PR-1's own build.
裁-24 ruled the merge PHYSICAL in the append-only shape: append a re-home pair for every open item.
But the subledger belts canonicalise on every ladder, so a minted re-home row **doubles the group
sum** and is refused by `_tf_subledger_item_belt`. The lawful superseded-exclusion predicate would
have to enter every body that reads open items — including `_metric_input_dataset_v1`, which
**OQ-3 (裁-24) ruled "leave"**. Three arms were put:

- **S1 · ruling-literal.** The independent reviewer re-measured the closed-world census: **23
  bodies, not the ~10 the build first estimated** — both belts, the classifier and every allocator
  — plus a supersession column on an append-only table, **every journal approve in the estate
  inside the D1 quiesce**, and a **doubled sealed metric** (`_metric_input_dataset_v1` reads
  `open_items` directly). The OQ-1-vs-OQ-3 collision is real, not rhetorical.
- **S2 · the net-zero PAIR** on a new entry carrying the ORIGINAL `item_date` (D-13 verified:
  nothing constrains `item_date`). Small blast radius, breaks nothing — but a **permanent
  presentational fiction**: three item rows per re-homed debt, the merged invoice still open in
  every picker, and real journal entries minted for a hygiene act.
- **S0 · keep the read layer, decline the write half.** PR-1's measurements show **all three of
  裁-19's own stated outcomes already hold**: aging consolidates, both reports read the same money,
  and an un-merge is the carrier reversed.

**The recommendation.** S0, with S2 as the physical fallback if the owner insisted on rows moving;
**S1 refused on measurement.**

**RULING. S0 — no write door.** The read layer plus the carrier meet the outcomes 裁-19 asked for,
measured rather than argued. **S1 is refused on measurement** (23 bodies, the sealed-metric
doubling, the OQ-3 collision); **S2 is declined** — a fiction that is cheap today is a fiction
forever.

**A definition the owner asked for, recorded because it will be used again.** He asked what
**"fail-closed"** means. It is **not** "pick the worst option". It is **the safe-side default while
undecided**: when the answer is not yet known, **refuse rather than pass** — so an unmade decision
can never quietly become a wrong number.

**Consequences.** 裁-24's D-01 hybrid narrows back to the read layer; the write half is closed, not
deferred. Recorded on
[`counterparty-merge-gate-record.md`](counterparty-merge-gate-record.md) §2.2 as OQ-8.

## 裁-36 · The tier-3 self-serve security gate — DPA e-sign + a rate wall, no trial quota

**What the owner was asked.** The audit's **MBB-2 sibling** finding: tier-3 self-serve is ruled
LIVE AT BETA, but the conductor's own dissent had named two limbs of a security gate that appear
in **no row, no lane and no owner's queue** — per-firm DPA e-sign, and anti-abuse controls. Three
candidates were put: ① a DPA e-signature at signup · ② a rate wall · ③ a trial quota.

**RULING.** **① and ②. ③ declined.**

- **① DPA e-sign at signup — no signature, no firm.** The firm does not exist until the data
  processing agreement is signed; the signature is a condition of creation, not a follow-up email.
- **② A rate wall: one firm per email, and one firm per IP per day.** The cheapest control that
  stops the obvious abuse without touching a real customer.
- **③ A trial quota is DECLINED** — the metering model **bills after the fact**, so a quota would
  be a second, contradictory answer to a question 裁-42 already answers.

**Consequences.** Both limbs land in **P4's UI tranche**, alongside 裁-26's email-bound admission
token — the signup page already collects the email that both walls key on.

## 裁-37 · ⌘K "Do" — into P6, behind a live allowlist check

**What the owner was asked.** The audit's **P-1**: ⌘K's "Do" mode has never dispatched anything.
It shipped honestly inert in P2, its remedy was written as an unruled, unowned open question in the
port-wave plan, and the interface has been carrying a promise nothing keeps.

**RULING.** **Into P6**, lit **only for the DB-allowlisted wake verbs**, with a **live allowlist
check per action** — the palette asks the database what it may do, every time, rather than shipping
a hard-coded list that drifts the day a verb's grant changes.

**Consequences.** P6 gains the Do wiring; the stale "wires up in P3" copy was already being
corrected regardless. The allowlist read is the same shape the rest of the estate uses, so this
mints no new mechanism.

## 裁-38 · F-T3's remaining five — all per recommendation

**What the owner was asked.** The five cards the PR-0 replay put to the sitting, three standing and
two newly measured. Each is ruled **as recommended**:

- **OQ-7 · whose signature signs a treatment code** → **a named licensed tax agent** (who may be
  the owner), **with the licence reference recorded** on the signature row. Until a code is signed
  it is unusable: every treatment refuses `treatment_code_unsigned`.
- **OQ-8 · who owns the annual duty to true the law** → **a named tax lead**, with **the owner as
  an automatic, self-announcing fallback** — the fallback says that it fell back, so "nobody named"
  cannot happen by drift.
- **OQ-10 · the CA-classification door** → **PR-3 adds the human `set_ca_classification` door**.
  Measured, not predicted: `ca_class` freezes (CLR13) once depreciation particulars are complete,
  so **every asset in the estate today is permanently unclassifiable** and R5 would refuse for all
  of them. The door rides a D1 window PR-3 already owns.
- **OQ-11 · s.44(6) donations** → **v1 REFUSES an approved-institution donation by name**
  (`s44_6_relief_unmodelled`) and the human keys it. The 10%-of-aggregate-income cap is a
  return-level figure that `fraction_bp × movement` structurally cannot express. **A flat 100%
  add-back is never the default** — it is the only arm that produces a wrong number silently, on a
  return a human signs.
- **OQ-12 · CP204's missing period** → **the pack requires the target YA's fiscal year to be
  OPEN**, and refuses otherwise. No third `reporting_periods.grain` value, and no cell stamped on a
  year it is not about.

**Consequences.** PR-1 seeds the treatment codes unsigned and they stay unusable until the tax
agent signs; PR-3 grows the CA door; the donation refusal is F-T3's seventh named refusal. All five
were already the fail-closed defaults in force, so no lane changes course — they are now ruled
rather than defaulted.

## 裁-39 · F-T2's eight — all per the Annex D defaults

**What the owner was asked.** The eight payroll-calendar questions carried since the design gate
(`payroll-calendar-annexes.md` Annex D), each with its recommendation and cost.

**RULING — all eight, as recommended.**

- **OQ-1 staff allowances:** their own contract item, **not folded into F-T2** — an allowance is a
  *coding* question and F-T2 is a *calendar*. **Coded, never computed.**
- **OQ-2 Form E:** the **statutory 31 March** is the date of record, with the e-Filing grace month
  **annotated** beside it and the payment-side exclusion stated on the row. The calendar never
  silently relies on a concession reissued each December.
- **OQ-3 the CP21/CP22/CP22A/CP22B family: IN**, as reference rows — visible, with no clock and no
  chase, because nothing in the books says an employee was hired, left or died.
- **OQ-4 CP58: stays**, and its verdict is **`unknown` when the fact is absent — never a verdict**.
  An unconditional "applies" on every company client is a chase the firm would learn to ignore.
- **OQ-5 the payroll-JV roles:** taken from **the COA template's `statutory` marks** (裁-21), not
  invented here — one convention, one owner.
- **OQ-6 the HRD Corp conflict:** **both dates shown, flagged `conflict`** — the earlier one
  governs the reminder, because the earlier date cannot make a client late and the later one can.
- **OQ-7 the weekend rule:** **EPF rolls FORWARD to Monday** (its published concession), **every
  other obligation rolls BACK to Friday**, and **public holidays are explicitly unhandled** —
  `working_day_basis` says so on the screen. A half-right holiday table is worse than none: it
  produces a date that looks computed and is wrong in Sarawak.
- **OQ-8: no fourth Tier-1 rate table.** F-T2 narrates a deadline; it does not compute a
  contribution, so it does not need a rate.

**Consequences.** F-T2's rows are unblocked — the lane contributes seed rows against a DDL that has
been live and empty since `0139`. The HRD Corp letter (asking for the deadline in writing) stays a
standing, unscheduled follow-up.

## 裁-40 · The three clock switches — opened together at the G1 rollout ceremony

**What the owner was asked.** The 裁-18b gate's **O4**, the one question the delegation did not
take: enabling a wake engine source is a **law-71 human act**, so the fail-closed default left
PR-4's expiry sweep as dead code — a `wake_engine_sources` row with `enabled=false` and nothing to
turn it on. The same is true of `bank_agent` and `close_prep`, both sitting disabled on live since
their lanes shipped.

**RULING.** The **switches open together at the G1 rollout ceremony, before Wave G**, by the
**operator owner** through `set_wake_source_enabled` — the conductor walks the audited door as his
delegate (constraint 14 / ADR-0075), receipted. **After the wake bodies are built and reviewed**,
never before. **PR-4 (the expiry sweep) is therefore BUILT**, not held.

**Consequences.** One ceremony, one record. PR-1's in-door stale-`proposed` sweep stays load-bearing
until the clock actually runs, so it ships regardless. The `bank_agent`/`close_prep` INSERT-and-flip
follow-ups that F-A3 and F-A4 each owe converge on this single ceremony instead of separate ones.

> **AMENDED the same sitting by 裁-44: the list is FOUR, not three** — `bank_agent`, `close_prep`,
> the binding-expiry sweep, and **`tax_prep`**. Same ceremony, same door, same operator, same
> precondition that each source's wake body is built and reviewed first.

## 裁-41 · `client_identifiers` gains a uniqueness wall before beta

**What the owner was asked.** Surfaced by the duplicate-open-wall lane: `clara.client_identifiers`
itself has **no uniqueness by design** (`0007:235`). The new wall closes the **open-proposal** race
only — two **separately settled** confirms can still mint two identical identity rows, and
attribution matches on both.

**RULING.** **A UNIQUE `(client_id, kind, value_normalized)` before beta** — a small migration, its
own PR after the duplicate-open wall merges. The **pre-flight NAMES existing duplicates and
REFUSES**; it **never dedupes**. Which of two identical identity rows is the real one is a
judgement about a client's identity, and the migration does not get to make it.

**Consequences.** If live carries duplicates, the migration stops and a human resolves them — which
is the correct failure, and the only one that cannot silently delete an identity.

## 裁-42 · THE BILLING MODEL — Vercel-style, billed per FIRM

**What the owner was asked.** 裁-28 left the pricing amounts with the owner, who said he would bring
his own plan; the conductor owed a cost-floor and market-band brief. He brought **the model**, which
is the larger half — and **it supersedes R8c's "tier + overage" shape**. **The amounts are still
open.**

**The model, as he gave it.**

**① The base subscription** — one per firm. It **includes** a number of paid seats, a number of
Active Client slots, and an AI allowance. Everything above those included quantities is billed as
its own line.

**② Paid seats** — **owner, admin and bookkeeper are paid**; **viewer and payments-only are free**.
A seat is **capacity, not a person**: the firm buys N seats and fills them however it likes.

**③ Per paid seat, an extra SHARED firm-wide AI allowance** — a seat does not carry its own private
quota. Each paid seat **adds** to one firm-wide pool, and every member draws from that pool. Nobody
is throttled because a colleague was busy; the firm is billed as one.

**④ Active Client slots** beyond the base — again **capacity, not identity**: a slot is not bound to
a particular client, so a firm can move a client out and another in without buying anything.

**⑤ Archived clients carry a lower RETENTION fee.** Archiving **frees the Active slot**. The
**month in which a client is archived keeps the active fee**; retention starts **from the next
cycle**. **Reactivation needs a free slot.** A client is **never billed both fees at once**.

**⑥ Scheduled-for-deletion keeps the retention fee until the data is PURGED** — clicking delete does
**not** stop the billing, because the data is still held. Billing stops when the holding stops.

**⑦ AI overage** = **usage − allowance, floored at 0**. The allowance **expires monthly**: no
rollover, no transfer between firms, no refund. **The service never auto-stops** — an overage is
billed, never enforced by cutting a professional off mid-close.

**⑧ Mid-month proration.** An addition is **prorated**, and **its AI allowance is prorated with
it** — a seat added on the 20th does not hand the firm a full month's tokens. **Removals take
effect from the next cycle.** The system **never auto-archives or auto-deletes a client to cut
capacity**; reducing capacity is always a human act.

**⑨ The invoice shows EVERY line** — base · seats · extra active clients · archived clients ·
the allowance · the usage · the overage · tax · total. A firm owner can reconstruct the bill from
the invoice without asking anyone.

**⑩ Draft clients are FREE and slot-less — and capped.** A draft consumes no Active slot and costs
nothing, but it **cannot take bulk documents, cannot use AI and cannot post**. Free is not a side
door into the product.

**THE CONFIGURABILITY LAW.** **Every price, every included quantity, every allowance and every
ratio is CONFIGURABLE. Nothing is hard-coded.** The model above is the *shape*; the numbers are
data, and they are expected to change without a migration.

**RULING.** The model above is adopted **as the billing model of record**, superseding **R8c's
shape**. The **amounts remain open** — they are the one thing this ruling does not settle.

**Consequences.** A **billing DESIGN set (survey → design → gate) precedes P4's checkout tranche** —
the brief is [`billing-model-brief-2026-08-30.md`](billing-model-brief-2026-08-30.md). **Stripe's
product and price objects mirror the configurable shape**, rather than the shape being bent to fit
whatever Stripe makes easy. The DB-owned artefacts the model implies (a configuration relation
holding every price and quantity · the client state machine · a monthly rollup over
`llm_usage_events`) are named in the brief and are the design set's first input. Until the amounts
land, nothing charges: the Stripe objects, the checkout's price display and the first charged day
all still wait on them — exactly the dependency 裁-28 recorded.

## 裁-43 · R9(c) after beta; BELCORT's operator flag joins the Wave-G setup checklist

**What the owner was asked.** Two loose ends the audit found with no date. **R9(c)**, the
storage-role re-examination from the 2026-07-26 intake-storage incident — unruled, in no batch. And
BELCORT's operator flag (`is_operator`), which has been an owner-timed act with no scheduled moment.

**RULING.** **R9(c) → after beta.** It is a hardening review of a role that is working; it does not
gate a beta user. **BELCORT's operator flag → the Wave-G setup checklist**, run in **the same
ceremony as 裁-40's three clock switches** — one operator sitting, four acts.

**The owner's clarification, recorded because it corrects a common misreading.** Registration
**APPROVAL is a tier-2 thing only**. **Tier-3 is: pay through Stripe and start** — there is no
approval queue in front of it. The **operator flag matters for the engine switches**, not for
tier-3 signup; nobody at BELCORT approves a self-serve firm into existence.

**Consequences.** The Wave-G setup checklist gains the flag; the G1 ceremony gains another act.
R9(c) joins the post-beta hardening queue with a date attached to it for the first time.

## 裁-44 · TAX IS AGENTIC — a `tax_prep` wake, and a fourth clock switch

**What the owner asked.** Two questions in one turn, and they are the reason this ruling exists:
*do all these fail-closed defaults dull the agentic vision?* and — reading 裁-33 and 裁-38 back —
*is tax even inside the agentic scope, or is it a calculator a human drives?* The honest answer to
the second was that **nothing in F-T3's design made Clara the one who starts it.** Every ruling this
sitting made about tax was about **walls** — who signs a treatment code, which door reopens a CA
class, what refuses. None of them said **who acts**, and a lane with only walls quietly becomes a
form.

**RULING. Tax is agentic, on the same shape as the close.** A **`tax_prep` wake**, built like
`close_prep`:

- **After a close seals, Clara drafts the income-tax computation (R1–R10) and the CP204 estimate** —
  unasked. **Every rung carries its statutory citation and her own explanation** of why the rung
  reads the way it does, so a professional reviews reasoning, not just a number.
- The draft is pushed as a **"tax draft card" to the needs-you inbox**. It is a needs-you item
  because it needs a human, not because Clara could not start it.
- **She PROPOSES each account's treatment** — entertainment at 50%, and the rest of the add-back
  families — **and a human signs**, exactly as 裁-38 ruled. Propose is hers; sign is his. The
  signature wall does not move; what moves is who does the work before it.
- **SST likewise: the SST-02 is drafted when the taxable period closes**, not when someone remembers.
- **CP204 due-date reminders are proactive.**
- **A FOURTH clock switch**, opened with the other three at the G1 ceremony (**裁-40, amended above**).

**What this does NOT change.** The computation layer is untouched: 裁-33's draft-only wall still
holds (nothing reaches `issued`), 裁-38's five rulings all stand, and the DB still owns every
number. **Clara starting the work and a human signing it were never in tension** — the design had
simply left the starting half unassigned.

**Consequences.**

- **F-T3 gains a PR**: the `tax_prep` wake body + the tax-draft card + the allowlist rows. The
  computation PRs are unaffected, and `tax-computation-design.md`'s PR ladder is trued to name it.
- **裁-40's ceremony list becomes four sources**, and the fourth's wake body joins the "built and
  reviewed first" precondition.
- **`docs/product/PRD.md` is NOT edited.** §0 already says the lifecycle — onboarding → ongoing
  close → **tax** → reporting — is what Clara runs under professional human control. This ruling
  builds what the PRD already promised; it does not widen it.
- The standing rule in this sitting's preamble is what generalises it: **at P6's entry gate, every
  agentic-facing default goes to the owner in one list**, so the rest of the estate gets the same
  question tax just got.
