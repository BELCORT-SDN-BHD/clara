# Gates P and L — the evidence does not exist (2026-07-26)

Pinned: **21 migrations (`0021_counterparty_human_lane`) · runtime v27.**
Both findings are hard-evidence blockers, established by exhaustive scan rather than sampling.
**Never fabricate a document or a figure** — so neither gate can be closed by manufacturing what
the corpus lacks.

---

## GATE P — blocked on MULTI-CURRENCY, not on SST evidence

**WB-R28 accepted the 8 OpenAI invoices as the proof standard, and that ruling stands** — they
carry genuine Malaysian service tax. What blocks the gate is a different property of the same
documents.

### The documents, read from the face of `Invoice-NJQKBGFJ-0008.pdf`

| field | value |
|---|---|
| supplier | **OpenAI, LLC**, 548 Market Street, San Francisco — a US entity |
| Malaysian registration | **MY FRP 24000037** (Foreign Registered Person) |
| bill-to | **TAN LIK PIN**, a residential address in Kepong — the proprietor **personally** |
| line | ChatGPT Plus Subscription (per seat), 1 × **$20.00**, tax **8%** |
| tax | **SST - MALAYSIA (8% on $20.00) = $1.60 (RM6.61)** |
| total | **$21.60 USD** |

### Why it cannot be posted

**The invoice states an RM equivalent for the TAX LINE ONLY** — `RM6.61`. There is **no RM figure
for the $20.00 base or the $21.60 total.** And:

- **`clara` has no currency or FX column anywhere.** Searched every column in the schema for
  `%currency%` / `%fx%`: the sole match is `firm_document_limits.ocr_concurrency`, a false
  positive on the substring. The books are single-currency RM cents by construction.
- Posting the expense therefore requires **deriving** the RM base from the tax line — arithmetic
  on a rate the document does not state. That is precisely the cardinal invariant's prohibition:
  *"the agent never computes a figure."*

Gate P requires the **chat 3-leg split with a TB tie to the sen** (WA21-R13). Two of the three
legs have no RM value on any document, so there is nothing to tie *to*.

### The alternative was checked exhaustively, not sampled

A real **RM-denominated** SST-stated supplier bill would close the gate cleanly. None exists:

| corpus | invoices scanned | with an SST / service-tax line |
|---|---|---|
| Bee Creative (288 files, earlier sweep) | all | **8** — the OpenAI invoices, all USD |
| Rome Properties supplier + sales invoices | **424** | **0** |

712 documents; the only SST-stated ones anywhere are the eight USD invoices.

### What the owner has to decide

1. **DEFER Gate P on multi-currency.** PRD §9 already defers multi-currency explicitly, and this
   is that deferral arriving with a concrete case attached. Cleanest.
2. **Owner-keyed FX rate as a human act.** The keyed-provenance lane already exists for figures a
   human supplies (WB-R15), so the *provenance* model fits — but there is nowhere to put a rate
   and no verb to apply one. That is a migration, not a journey.
3. **Wait for a real RM SST-stated bill.** Honest, and unbounded: zero in 712.

**Recommendation: 1, with 2 recorded as the design note when multi-currency lands.** The SST
*evidence* question is settled and WB-R28 needs no revisiting.

---

## GATE L — no genuinely conflicting pair of real sources exists

Gate L requires *"a genuinely conflicting pair of REAL sources surfaces as a lint finding on
schedule."* The obvious candidate was tested and **agrees**.

Bee Creative holds management accounts for **both** YA2024 and YA2025, so YA2025's opening must
restate YA2024's closing — the natural place for two real documents to disagree.

| | |
|---|---|
| YA2024 closing net position | **(65,747.97)** |
| YA2025 `CAPITAL — BALANCE B/F` | **(65,747.97)** |
| what Clara posted at 2025-01-01 | **Dr capital 65,747.97** |

**All three agree to the sen.** That is a *corroboration*, not a conflict — and a valuable one:
it independently confirms the Gate-K carry-down figure against a second client document Clara has
never ingested.

So Gate L's trigger condition is absent from the corpus. Manufacturing a conflict would be
fabrication, which is never permitted. Gate L's other two halves — **caps enforced visibly** and
the **opening-TB tie watch live** — are not blocked by this and could be evidenced separately if
the owner wants the gate split.

---

## Consequence for the wave

Wave B **cannot be declared finished today.** Honest status of the six live gates:

| gate | state |
|---|---|
| **O** | CLOSED twice (Rome Secretary, Bee Creative) |
| **K** | CLOSED twice; B-12's incremental lane closed on the still-to-capture checklist |
| **W2** | claim (1) + (2)-structural CLOSED; (2)-behavioural, (3), (4) need a live wake credential |
| **P** | **BLOCKED — multi-currency.** Evidence exists and is genuine; the system cannot express it |
| **L** | **BLOCKED — no conflicting real pair exists** (the candidate agrees to the sen) |
| **R2** | **feasible, not started** — RPR's real prior GL is the seeding source; needs the tick-list ceremony |
| **F** | **BLOCKED on owner provisioning** (`docs/ops/gate-f-provisioning.md`) |

**Two gates remain genuinely closeable by engineering: R2 and W2's journey claims.** P and L are
blocked on evidence that does not exist, and F on three acts only the owner can perform.
