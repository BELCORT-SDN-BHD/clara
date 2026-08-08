# The Extraction Slice — contract v1.0 (RATIFIED 2026-07-27, ADR-047)

**Status: LAW.** Grilled and ratified by the owner 2026-07-27; the five rulings are in §5 and
folded into the component text below. Authored after the
adversarial refusal of the naive build (`docs/plan/research/wave-b/gate-p-build-refused-2026-07-27.md`);
every constraint below traces to a measured fact or a refusal ground from that record.

**What it serves (one slice, four gates):** Gate P's 3-leg SST close · the auto-draft lane's
first production fire · Gate R2 claim (3) · W2's journey claims — and Phase 5 §6's
*auto-post precision* gate, which cannot measure a lane that has never run. **Why before
Wave C:** bank statements are the most extraction-hungry documents in the product; building
reconciliation on an extraction tier that corroborates 0/29 real documents builds on sand.

---

## 1. The measured problem (all on live, 2026-07-26/27)

| fact | measurement |
|---|---|
| `invoice.tax_total` / `total_excl_tax` produced | **0 / 29 extractions** (v5 mapper live — `customer_name` ×6 proves it; Azure never returns `TotalTax` on these layouts) |
| Tier-A corroboration passes | **0 / 29** — the ONLY failing term is vendor self-reported confidence (0/29 ≥ 0.95, max 0.837; polygon 29/29 ✓, MYR 29/29 ✓) |
| Auto-draft production drafts | **0** across 55 sweeps / 29 admissions — `tier_a_fails` 29/29 **and** `vendor_unresolved/ambiguous` 29/29 (TWO independent blockers) |
| Re-extraction path | **none** — no add-region or re-extract verb in 0001–0021; `509e788d` (the Gate-P vehicle) is unreachable by any new mapper |
| `anchor_missing` (0016:2704-2721) | an **unconditional** refusal on OCR-sales unattended posting — *solely because* the tax fields are never emitted; emitting them would switch it off as a side effect |
| The sales tie `net+tax+rounding=gross` | **wrong for documents carrying a service charge** (real case: 94.30+5.66+0.02 = 99.98 ≠ 103.75); four dormant ties wake the moment tax fields appear, none accepts `amount_override` |
| Firm high-stakes verb | none — RM100k change (PR #109) was a hand-run file; a governed verb is owed |

## 2. The five components, staged — one live block moves at a time

**X1 — migration 0022 (DB, first).**
- `clara.request_reextraction(p_document, p_reason, p_op_key)` — human-floor
  (**bookkeeper**, ruled ADR-047 Q2), audited, op-key idempotent. Enqueues a NEW
  `invoice_facts` task version for an already-extracted document; the new done extraction
  supersedes on the invoice_facts chain exactly as version_n already composes.
  **Deploy shape (amended after adversarial round 2, 2026-07-27): a BRIEF RUNTIME
  QUIESCE during apply** — stop `clara-runtime`, apply 0022, start. The draft expected
  the 0021 no-quiescence shape; that rested on "the pre-X2 mapper cannot emit net/tax",
  which is FALSE (v5's FIELD_MAP has carried `SubTotal→total_excl_tax` /
  `TotalTax→tax_total` since Wave A2 — the 0/29 is an Azure-layout fact, not a producer
  impossibility), so an in-flight pre-0022 executor call could finish under the old
  anchor law (D1). The quiesce closes that window structurally. **0022 before X2 stays
  binding** regardless.
  **Cost policy (ruled ADR-047 Q4): NO per-document cap, audit-only** — the structural
  bound is that the verb is **human-invoked only**: no workflow, sweep, or machine caller
  may enqueue it, ever. Churn cannot mint authority regardless (corroboration is
  deterministic agreement; posting still passes human approval).
  **Build-time verification (not assumption):** an open draft binds its specific
  extraction version, so a mid-review re-extraction cannot swap figures under an
  approver — provenance binding should already guarantee this; prove it in the rig.
- `clara.set_firm_high_stakes_threshold(p_cents, p_op_key)` — owner-floor, audited; pays
  the debt left by PR #109's hand-run file.
- **X3 lands in the same migration** (below) so no sales document can meet the new fields
  before the corrected tie exists.

**X2 — the deterministic totals reader (runtime, second).**
In `invoiceFacts.v1.azure.mjs` — **verified NOT frozen** (three ways, including running the
freeze lint; the earlier "v1 is frozen" claim was wrong and is retracted in the repo).
- Emits `invoice.total_excl_tax` / `invoice.tax_total` / `invoice.rounding` from the layout
  regions, label-anchored, geometry-bound (the `prior-gl-cells.mjs` precedent).
- **Conservative accept:** a token must match a strict subset of
  `_normalize_invoice_cents`'s grammar or the field is OMITTED — 0016:3638-3646 refuses the
  whole persist on a present-but-unparseable value, which would turn today's working
  29/29 `invoice.total` capture into a hard failure.
- **Uniqueness-or-nothing:** two distinct candidate values for one field ⇒ emit neither
  (0016:3609-3615 forfeits the extraction on conflicting duplicates).
- **One region shape** (`pages[].lines[]`), SST rate as a **parameter** (6% and 8% both
  exist in the corpus), refusal counters returned (matched / ambiguous / unparseable /
  absent — no silent caps), `NORMALIZATION_VERSION` bumped so v5 and v6 extractions stay
  distinguishable.
- **Step zero, before any code:** capture ONE real Azure prebuilt-invoice payload offline
  and verify `pages[].lines[]` carries polygons on the *invoice* model — every repo fixture
  stubs pages as `[{pageNumber:1}]`, so this is an assumption, not an observation.
- **DONE 2026-07-27** (`docs/plan/research/extraction-slice/step-zero-capture-2026-07-27.md`):
  verified on two real documents. **Ratified from the measurements + the adversarial fix
  round (as-built law):**
  (i) label→amount pairing is THREE-term — reading-order adjacency ∧ |Δy| ≤ 0.15in ∧
  vertical-box overlap > 0 (each term has a measured counterexample when dropped; all
  three are opts with these defaults); a dash may waive adjacency ONLY when the dash
  itself satisfies the pairing geometry;
  (ii) a DASH amount = ABSENT, never 0.00 — and a printed dash is a FIRST-CLASS reading:
  it WITHDRAWS a contradicting typed-field row (`typed_vs_dash`); ambiguous/unparseable
  are non-readings and do not reconcile (typed stands — v5 semantics);
  (iii) a reader/typed-field disagreement emits NEITHER (typed fields measured to vary
  run-to-run);
  (iv) **REWRITTEN after adversarial F5 (the earlier "unsigned rounding is refusal-safe"
  claim was PROVEN FALSE on taxless supplier bills — the auto rounding-leg derivation
  consumes the fact with no identity in the way): rounding emits ONLY with an
  affirmatively captured sign (the detached-minus case, emitted `-x.xx`); an unsigned
  rounding token is counted `sign_unknown` and NEVER emitted.** The sign-capture question
  (better OCR features, sign-agnostic identity, materiality bound) remains an
  X5-design-time owner ruling;
  (v) a Tax Summary heading opens an exclusion band (opt, default 1.0in vs the 0.61in
  measured block) — summary-block labels anchor nothing (refusal-only; kills the
  taxable-as-tax mispair). The heading match is a NORMALIZED PREFIX match — collapse ALL
  Unicode whitespace FIRST, then noise-strip, then lowercase-prefix — and that ORDER is
  load-bearing (G3b: a leading NBSP otherwise shields noise from the stripper and the
  band never opens). Refusal triggers normalize WIDE; the accept-side vocabulary keeps
  the opposite order deliberately (failing to match is the safe direction there);
  (vi) geometry is normalized to page-width fractions — algebraically identical on inch
  pages; pixel pages carry the inch tolerances across via the A4-nominal width (recorded
  as an ASSUMPTION; a pixel page with no width refuses);
  (vii) the accept grammar is ASCII-explicit (never `\s` and never Unicode `trim()` — a
  U+FEFF at a token EDGE would pass JS and refuse at the DB, killing the whole persist)
  and every emission re-validates the EXACT composed bytes through the DB-aligned cents
  parser (strict-subset is invariant-by-test, not by construction). Cents comparison is
  EXACT BigInt, parsed lexically — Number/Math.round collapsed values a sen apart beyond
  2^53 into a false agreement. Blankness is DB-ALIGNED (btrim strips spaces, not tabs —
  a typed `"\t"` is present-and-malformed to Postgres and withdrawable by a dash);
  (viii) a multi-document analyzeResult disables the reader entirely
  (`reason:"multi_document"` — typed fields keep v5 behavior).

**X3 — the sales-tie correction (in 0022).**
Replace `net + tax + rounding = gross` with **sum-of-stated-components = total**, where a
stated service charge / discount / delivery line is a first-class component read off the
document. The identity stays DB-owned and exact; it stops being wrong about Malaysian F&B
and retail layouts. The supplier floor's exact `sst_purchase_cost = tax_total` tie is
untouched. **Component taxonomy (recorded at ratification): a CLOSED enumeration read off
the document's face** — subtotal · service charge · discount · delivery/handling · tax ·
rounding — and the tie is *sum equals stated total exactly, else refuse*: every failure
mode is a refusal, never a wrong post.

**X4 — `anchor_missing`, decided, not drifted (in 0022, with X3).**
The barrier's *intent* (no unattended OCR-sales post without a complete, arithmetically
consistent anchor set) is preserved verbatim; what changes is that its conditions become
*satisfiable*. It must be IMPOSSIBLE for it to pass before X5 ships: 0022 adds an explicit
`and false /* until corroboration v2 */`-shaped guard (or equivalent flag) so the lane
stays structurally shut, with a receipt, until the ratified corroboration change removes it
deliberately.

**X5 — corroboration by agreement (its own micro-migration, LAST and ALONE).**
The OCR tier's `corroborated` becomes: **two independent readers agree to the sen**
(Azure's field value vs the deterministic layout reader) **and** the document's own
arithmetic identity holds **and** the polygon wall and MYR checks stay. **The vendor
confidence score is dropped from gating ENTIRELY (ruled ADR-047 Q1)** — it survives only
as diagnostic metadata in the payload; reader disagreement is a refusal, never a tie to
adjudicate by a self-reported score. Ships alone because it is the one change that
opens posting authority; its own adversarial review; rig exact-diff proving all 29
existing extractions stay `corroborated=false` until deliberately re-extracted.

**X6 — the `vendor_unresolved` second blocker: diagnose AND fix in-slice (ruled ADR-047
Q3, expanded from diagnose-only).** After `509e788d` re-extracts, re-run one sweep and
read exactly why vendor resolution fails against the registered counterparty registry.
**Data and logic fixes are both pre-authorized**, under two absolute constraints:
the fix is its **own block** — never inside X5's micro-migration; X5 stays LAST and
ALONE — and a resolution-LOGIC change carries its **own cross-model adversarial review**
before merge (house law for live-lane code).

**X7 — the deterministic CUSTOMER-identity reader.** *(X7 added by the F6–F9 fix batch,
2026-08-09 — see the batch ADR. The ADR-047 ratification above closed at X6; this block is an
AMENDMENT to that closed list, not a re-grill of it.)*

**The measured defect (F7, ADR-064 §3 / ledger task #32).** ROME SECRETARY issued two real
invoices to **KONG CHENG RESTAURANTS SDN BHD**. Both print the company in the bill-to box and a
separate `Attn : Lim Xiao Shan` contact line under it. Azure typed `CustomerName` as **the
person** on BOTH, so `invoice.customer_name` was captured as `"Lim Xiao Shan"` and both drafts
(`53504c0e-…` RM2,800 and `7995b1a3-…` RM600) sit `status='draft'` skip=`counterparty_unresolved`
to this day (`docs/plan/wave-7a-acceptance-h1.md` exhibit E7 + manifest rows 1 and 12).

**Why this is NEW-BUILD, not a lexicon re-rank.** Before X7 there was **no deterministic
customer-identity reader at all** — `invoice.customer_name` was a byte-for-byte pass-through of
Azure's typed field, so an ML model's pick of which line in the bill-to box is "the customer"
reached the books unchallenged. X7 supplies the missing second reader.

- **Ranking (the fix):** a positively-identified **boxed / labelled party block outranks
  Attn-line adjacency** for `customer_name`. It is structural, not a tie-break: an `Attn` line is
  claimed as a CONTACT before party candidacy is considered, so the person is never in the race.
  The person is emitted as the **new `invoice.contact_person` fact**.
- **Twins X6's architecture** (`lib/invoice-customer-identity.mjs` + `lib/invoice-party-grammar
  .mjs`): uniqueness-or-nothing · the label + party-name gate · **customer-block attribution**
  (a candidate must sit next to the typed `CustomerName` region and closer to it than to
  `VendorName`) · reconciliation against the typed emission. **X6's insight re-applied is what
  makes it work on the very documents it fixes:** Azure's typed CustomerName picked the wrong
  LINE but a line *inside* the bill-to box — its content is wrong, its **geometry** is sound.
- **No top-band analogue**, deliberately: a bill-to block has no positional convention
  comparable to a letterhead, and an unmeasured band is a guess wearing a threshold.
- **Reconciliation matrix:** reader absent/refused → typed stands (pre-X7 behaviour) · reader
  ambiguous → typed stands · typed empty → reader supplies · agreement → ONE row, the typed one ·
  **typed == the reader's own Attn person → the party overrides (the F7 branch)** · unexplained
  disagreement → **emit neither** (X6's semantics; a contested buyer resolves no counterparty on
  its own authority).
- **DB half is mandatory, not optional:** `invoice.contact_person` joins `persist_invoice_facts`'
  **CLOSED** allowlist and its conflicting-duplicate text set in its own migration. Without it
  the first extraction carrying the fact does not drop it — it raises **CLR10** and forfeits the
  whole persist. `NORMALIZATION_VERSION` → **v10**.
- **Two honest limits, recorded rather than discovered later.** (i) The thresholds are
  **UNMEASURED** — the KONG CHENG captures are real client documents and are not in this repo, so
  unlike X6 the defaults are conservative opts and the reader is built to ABSTAIN when one is
  wrong; the **live replay is the measurement**. (ii) Attribution anchors on the typed
  `CustomerName` region, so X7 can never supply a name where Azure typed none — the **FINCARE**
  row (acceptance-h1 row 10, held `customer_name_missing`) is NOT fixed by F7, and relaxing the
  anchor to "far from the vendor" would be absence-as-evidence, which review law 2 forbids.

## 3. Falsifiable gates

| gate | claim |
|---|---|
| **XG1** | **AMENDED (owner ruling 2026-07-27**, after step zero found the vehicle's Service Tax (8%) amount is a printed DASH — nil tax; receipt: `step-zero-capture-2026-07-27.md`**):** `request_reextraction('509e788d')` yields a v6 extraction proving the verb + supersede chain + `total_excl_tax` emission, with `tax_total` correctly ABSENT (dash ≠ 0.00) and rounding correctly REFUSED (`sign_unknown` — the face's minus glyph never survives OCR). **Gate P's SST 3-leg close retargets to the FIRST genuinely SST-charging real supplier bill that arrives** (operating runway — "if got sst bill then try it"); on that bill the `sst_purchase_cost` leg ties EXACTLY and Gate P closes with a TB tie to the sen |
| **XG2** | **AMENDED (as-built, 2026-07-27):** the corrected component tie is rig-proven with every LAI LOU MEI figure (x1-tie cell 1: 94.30+3.77+5.66+0.02=103.75 EXACT). On LIVE documents, the reader's sign-capture law (as-built (iv)) means a service-charge document with an UNSIGNED rounding refuses to the human lane by design (reads 103.73 vs stated 103.75 — the two-sen gap IS the suppressed rounding); a service-charge document without a rounding line, or with a sign-captured one, passes fully live |
| **XG3** | The auto-draft lane produces its **first production draft** end-to-end on a re-extracted document — and the receipt names **which of the two blockers fell AND what X6 fix (data or logic) was applied**, with vendor resolution measured against the registered counterparty registry (measured, not assumed) |
| **XG4** | Zero regression: all 29 pre-existing extractions byte-stable until deliberately re-extracted; the XML tier byte-identical; `sst_output` sales path and `purchase_sst_not_autopostable` unchanged |
| **XG5** | `anchor_missing` outcomes change ONLY at X5's deploy, never at X2's — measured on live before/after each |

## 4. Explicitly out of scope

The `opening_tb.line` producer (Phase 5, synthetic — no client with both a free seed slot
and a codes-and-columns prior TB exists), `interview_v2` (F1/F2), hybrid wiki search, and
any change to the ≥3 / 6-6-60 sighting floors.

## 5. Rulings (owner grilling, 2026-07-27 — ADR-047)

1. **X5 vendor confidence: DROPPED from gating entirely.** Diagnostic metadata only.
   Reader disagreement = refusal. No tie-break bar exists, so no bar can ever be lowered.
2. **`request_reextraction` floor: BOOKKEEPER** (draft proposed admin; owner widened it —
   the person doing intake fixes bad extractions without escalation).
3. **`vendor_unresolved`: diagnose AND fix in-slice; data + logic both pre-authorized**
   (draft proposed diagnose-only). Constraints: own block, never inside X5; a logic fix
   gets its own cross-model adversarial review. → X6.
4. **Cost policy: NO cap, audit only** (draft offered a cap of 3; owner ruled the
   per-page cost is noise). Structural bound = human-invoked only, no machine caller.
5. **(Dependency branch)** Engineering shapes recorded: X3's closed component taxonomy
   with exact-sum-or-refuse; the open-draft-binds-extraction-version rig verification.
