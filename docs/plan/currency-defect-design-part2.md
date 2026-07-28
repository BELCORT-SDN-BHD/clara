# The currency defect — design part 2: the remedy decision (DRAFT, 2026-07-28)

**Status: DESIGN ONLY.** Continues `docs/plan/currency-defect-design.md` (part 1 — the measured
defect, the reader design, the economics, the adversarial section). Split because part 1 reached
the repo's 500-line ceiling, following the precedent this repo already sets
(`autopost-vendor-binding-design.md` + `-part2.md`; PROJECTLOG's own split note: *"the fix is a
split, never a rewrite or a prune"*). Nothing in part 1 was edited.

**What this part answers:** the question the task assignment added and part 1 did not address —
*"Decide whether the remedy is a currency reader, a governed human override, or both."* Plus two
premise corrections measured against live on 2026-07-28.

## 8. The decision: reader now, override deferred behind a named trigger

**Recommendation: build the currency reader (part 1 §3/§4) and do NOT build a currency override
now.** Not "both", and not "override first" — with a written fallback design (§10) if the owner
overrules, because the override's *verb shape* matters more than whether it exists.

Four reasons, in the order they should be weighed.

**(1) The reader reaches every affected document; the override's unique customer set is empty.**
The one thing an override can do that a reader cannot is rescue a document that can never be
re-extracted — the `509e788d` class, at the 3-attempt cap. Measured (part 1 §5.2): **all 7
affected documents hold 2 of their 3 attempts**, and the only document at cap is typed `MYR` and
was never affected. So today the override has **zero** documents only it can serve. A governed
verb built for an empty set is a verb whose first real use will be its first test.

**(2) The reader fixes future ingestions; an override is a manual act repeated per document.**
This is where the assignment's scope note bites (§9.1): the Lucy family is 6 documents ingested
of ~22 real bills, and every future one arrives mistyped by the same deterministic path. A
reader applied at extraction handles all of them, including bills nobody has uploaded yet. An
override handles exactly the document a human is looking at, 22+ times, forever — and the 23rd
time somebody forgets is a silent wrong-currency coding rather than a refusal.

**(3) The override carries an accounting-correctness hazard the reader does not, and
accounting-correctness is the top of the precedence order** (`CLAUDE.md`:
*accounting-correctness > backend contracts > design*). Clara is MYR-only — there is no FX
machinery anywhere in the ledger. The CLR21 wall is not an inconvenience guarding a
nice-to-have; it exists because **there is no correct way to book a foreign-currency invoice in
this system**. An override phrased as "treat this document as MYR" hands a bookkeeper a button
that books USD 500 as RM 500, and the pressure to press it is highest exactly when the person is
tired and the bill is small. The reader introduces no such button.

**(4) The existing override machinery cannot be extended to cover this anyway.** Measured in
`0009_coding_floor.sql`: `revise_entry(…, p_amount_override, p_duplicate_override)` handles its
overrides at `:1836`, but the non-MYR refusal is raised at **`:1799`** — at the very top of the
`if e.document_id is not null` block, *before* any override is read. The same ordering holds in
`draft_entry` (`:1329`, before `_write_entry_evidence`). So "just add a third override" is not a
small change to an existing pattern; it is a new refusal-relief path threaded ahead of an
existing guard, in the two functions that own coding authority. That is a migration with real
blast radius, proposed to serve zero current documents.

**What would flip this decision.** Any one of: (a) a currency-affected document reaches the
attempt cap; (b) the reader ships and measurably fails to rescue a document whose page evidence
is unanimous; (c) the owner judges the operational cost of waiting for the deploy + re-extract
cycle to exceed the hazard. (c) is a legitimate business call and is recorded as owner question
O6 — it is not an engineering objection, and this design should not pretend otherwise.

## 9. Two premise corrections from the assignment

### 9.1 "All 22 Lucy bills" — 6 are ingested, and that strengthens the reader case

> `select … from clara.documents where original_filename ilike '%lucy%' or ~* '(JAN|FEB|…) 20(24|25)-Invoice'`

Six documents exist live, **all six typed `USD`**:

| document | file | typed |
|---|---|---|
| `39d786a0` / `882fc179` / `4406fd56` | `JAN` / `FEB` / `MAR 2025-Invoice.pdf` | USD |
| `434a6cf1` / `93fb8243` | `Lucy Artistry Lab_RM1550_Jan 24.pdf` / `_RM3090_Jan 24.pdf` | USD |
| `75b54473` | `Lucy Artistry Lab_RM1130_Apr 24.pdf` | USD |

So "22 Lucy bills" is the client's real bill set, not the live corpus — **6 ingested, ~16 still
to arrive**. The correction does not shrink the problem; it sharpens the remedy choice. A defect
whose population is still growing through a deterministic ingestion path is precisely the kind
that wants a fix at the producer, not a manual relief per document. It also means the reader's
value is understated by part 1's "7 documents" figure: the true figure is 7 today plus every
future bill of this shape, at zero marginal cost.

Note the family spans amounts (RM500 on the 2025 monthly bills, RM1,130 / RM1,550 / RM3,090 on
the 2024 ones), so it is not a single-amount artefact — the mistyping tracks the *layout*, which
is what makes it family-wide and what a layout-reading fix answers.

### 9.2 "request_reextraction cannot help" — true alone, and not what part 1 proposes

The assignment is right that re-extraction *by itself* changes nothing: Azure is asked the same
question about the same bytes and the typed field is not something `request_reextraction`
influences. Part 1 does not propose re-extraction as the fix. **Re-extraction is the delivery
vehicle for the new reader** — the only way an already-extracted document can be re-read under
v9 semantics, which is why part 1 §5 counts the attempt budget so carefully. The order is
strict: deploy the v9 reader first, then re-extract; re-extracting before the deploy spends an
attempt to reproduce the same wrong answer.

One honest uncertainty, recorded rather than resolved: **whether Azure's `currencyCode` is
deterministic run-to-run is unmeasured.** The extraction-slice contract records that typed
fields *do* vary run-to-run (`SubTotal` returned a value on a re-call where production had
none), so determinism should not be assumed for `currencyCode` either. The design does not
depend on the answer in either direction — if it varies, an occasional lucky `MYR` would be luck
rather than a fix, and the reader's agreement/withdrawal law handles both cases identically.

### 9.3 The live receipt confirms part 1 §1.2, and closes half of CG7 early

The assignment's `draft_entry(… op_key runway-draft-lucy-250001-1)` → **400 CLR21
`currency_unsupported`** is the "before" measurement CG7 asked for, taken on a real bill by a
real attempt to code it. Part 1 inferred the terminal block by reading `0009:1326-1341`; this
receipt makes it observed. CG7 now needs only its "after" half: the same call on the same
document, post-v9-re-extraction, succeeding. Recommend re-running it with the identical op_key
shape on `39d786a0` so the before/after pair is exact.

## 10. If the owner overrules: the only override shape that is safe

Recorded so the fallback is designed rather than improvised. **The verb must withdraw an
assertion, never assert a currency.**

**Wrong shape — `p_currency_override: {"currency":"MYR", …}`.** A human declares the document's
currency. This is what "governed human override" most naturally suggests and it is the shape to
refuse: it lets a genuinely-USD invoice be booked in ringgit, it asks a bookkeeper to certify a
fact they often cannot verify, and the resulting entry carries no signal that its unit was
asserted rather than read.

**Right shape — `p_currency_unsupported_override: {"reason": …}`,** meaning: *the typed currency
assertion is not supported by this document's face.* Its effect is **not** to set MYR; it is to
suppress the `explicit_non_myr` refusal for this entry, leaving the currency **absent**.
Measured consequence (part 1 §4): `explicit_non_myr` false → the refusal lifts; `v_currency=''`
→ `corroborated` stays false → the entry gains no posting authority and must be hand-coded and
approved like any un-corroborated document. The human never states a currency, so the verb
cannot mislabel one.

**Governance, inherited verbatim from the `amount_override` precedent** rather than invented:

- **Stamped with `{reason, actor, at}`**, reason required, malformed → CLR10 (`0009:1836-1840`).
- **Joined into the op-key request hash** so a replay cannot silently change it
  (`0009:1763-1768`, the C-1 law).
- **Raises the entry to high-stakes** so the distinct-checker law CLR05 binds on the approval
  that clears it — exactly as `is_high_stakes` already does for `amount_override`
  (`0009:1513-1519`). A currency the machine could not confirm is at least as
  approval-worthy as an amount the machine disputed.
- **Voided by a newer facts completion**, mirroring the recorded amount-override behaviour
  (*"A newer facts completion voids the override and recomputes the exception"*, `0009:30-31`).
  This is what makes the override and the reader compose instead of collide: once a document is
  re-extracted under v9 and the false row is gone, the override is moot and disappears rather
  than lingering as a standing permission.
- **Recomputed fresh each revise**, like `v_new_flags := flags - 'amount_exception' -
  'amount_override'` (`0009:1796`) — never inherited silently across revisions.

**Placement, which is the hard part.** The refusal is raised at `draft_entry:1329` and
`revise_entry:1799`, both *before* the override-reading code. The override must be read ahead of
those raises in both functions, which means both coding-authority functions change in one
migration. It cannot ride along with anything else, and it wants its own adversarial review —
the house rule for live-lane code that opens a refusal.

**Residual even in the right shape:** a human withdraws a *correct* USD assertion and then
hand-codes a foreign invoice as though it were ringgit. No wall exists for that; it is the same
residual as any hand-coded entry, differing only in that the audit trail names the reason and
the actor, and the approval is forced to high-stakes.

## 11. Falsifiable gates added by this part

| gate | claim |
|---|---|
| **CG9** | The reader alone clears all 7 affected documents — after v9 + re-extraction, **zero** documents remain where `explicit_non_myr` is true on page-unanimous MYR evidence. If any remain, §8's reason (1) is falsified and the override returns to the table. |
| **CG10** | A newly-ingested Lucy bill (one of the ~16 outstanding) extracts under v9 with **no** `invoice.currency` row and codes without CLR21 — proving the fix reaches future documents, which is §8 reason (2)'s whole claim. |
| **CG11** | Before/after on `39d786a0` with the assignment's own op-key shape: `draft_entry` returns CLR21 `currency_unsupported` pre-fix (already observed) and succeeds post-fix. |

## 12. Open questions added

**O6 — Is waiting for the deploy + re-extract cycle acceptable?** §8's recommendation assumes
yes. If the bookkeeper needs these bills coded before the reader can ship, that is a legitimate
business call the owner should make explicitly, not something engineering should decide by
shipping an override pre-emptively. If ruled yes-build-it, §10 is the shape — and it should
still ship *after* the reader, never instead of it.

**O7 — Should the reader's withdrawal be visible in the coding UI?** Related to O1 (part 1) but
sharper now: a bookkeeper coding a Lucy bill post-fix sees a document with no stated currency
and no corroboration. Nothing tells them Azure claimed USD and the page contradicted it. Worth a
line in the review card — cheap, and it is the difference between "the system is quiet" and "the
system told me what it did".
