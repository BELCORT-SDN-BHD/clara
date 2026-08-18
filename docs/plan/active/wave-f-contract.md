# Wave F — the two-track contract (ADR-0071 execution)

> **Contract of record for Wave F**, minted 2026-08-18 from the owner's Agentic Charter
> rulings (`docs/adr/0071-the-agentic-charter.md`; digest laws 71-75). Wave F runs TWO
> PARALLEL TRACKS. Every item below takes the uniform ADR-061 ladder at build time; this
> contract scopes, it does not waive review. Live state lives in `PROGRESS.md`; this file
> is the scope authority until the wave closes.

## The one completion condition that outranks the item list

**F-A10 — retirement completes inside Wave F.** When Wave F closes, exactly ONE
architecture exists: the old lanes — `autoDraft`'s draft-only posture as the terminal
state, `execute_rule_post` + the rule signing/breeding estate, Azure `prebuilt-invoice`,
Azure `prebuilt-bankStatement`, the deterministic reader family — are RETIRED (workflow
versioning discipline: new `_vN` exports + registry repoints; frozen bodies stay
reachable for parked runs; rule/sighting HISTORY rows are kept as data — they are the
knowledge layer's fuel, never deleted). **Two architectures never enter Wave G**; the
corpus E2E tests the new one only.

---

## Track A — the agentic core

### F-A1 · The LLM witness-pair extraction (the foundation; builds first)

- Two reads per document: **text-witness** (LLM over the stored OCR raw text + numbered
  regions) and **vision-witness** (LLM over the original image/PDF bytes). Same
  provider, two channels, distinct prompts (owner's G1.1 configuration).
- **C1** the agreement verdict is a NEW versioned deterministic DB predicate (the
  `_invoice_fact_state_at` successor), to the sen; the model never grades its own
  agreement. **C2** every witnessed amount server-snaps to a layout region by content;
  no region → not corroborated → the document lands as a draft. **C3** the document's
  arithmetic identity (net + tax = gross) and the bank running-balance CHAIN stay
  required. **C4** both reads persist whole (`document_extractions` engine kinds
  `llm_text_facts` / `llm_vision_facts`), model+version stamped; reading prompts carry
  the §6.5 inert-data posture.
- OCR (Azure `prebuilt-layout` today) is demoted to coordinates+text only, behind the
  existing normalized envelope/regions seam — formalize the `ExtractionResult` shape so
  a vendor swap is an adapter, not a rewrite.
- Retires: `invoiceFacts.v1.azure`, `statementFacts.v1.engine`, and the reader family
  (`invoice-totals-reader`, `invoice-vendor-identity`, `invoice-customer-identity`,
  `invoice-currency-reader`, `invoice-id-recovery`, `invoice-party-grammar`,
  `invoice-anchor-sweep`, `statement-layout-reader`). `request_reextraction` invocation
  semantics may be revisited at this item's design (ADR-0071 leaves it human-only until
  then).

### F-A2 · The agentic posting lane

- ONE unattended coder replaces the draft-only `autoDraft`: reads (raw OCR + witness
  facts + context pack incl. wiki/history per law 73), decides, and **posts** when the
  walls pass — every document class, `journal_entry` generic included; what cannot
  lawfully post lands as a draft or a typed open question (fail-closed posture
  unchanged). Chat lane gains posting parity.
- Authority shape: a wake-wrapped post/approve path recording the agent as the acting
  identity with model+version + rationale on the receipt (law 71). No amount routing,
  no ramp, no sampling, no dark launch — permanent (G1.2/G1.3).
- Walls that remain and must be re-proven in this item's battery: invariants (a)(b)(c),
  balance, evidence/region (CLR21), currency, direction/type polarity, the witness-pair
  corroboration gate for unattended amounts, CLR19. **N1 lands here**: the supplier-bill
  SST leg-shape check runs at draft/post time, not approve-time-only.
- Retires: `execute_rule_post` + `rule_post` consumer, `propose/sign_coding_rule`,
  `propose/sign_autopost_rule`, sighting breeding inserts, the autopost-rule expiry
  belt. History rows stay as knowledge fuel; the context pack gains an
  approved-history/patterns block (the learning loop).

### F-A3 · Bank agency

- Statement facts ride F-A1 (witness pair + CHAIN). The agent matches unattended
  (N×M groups, zero-tolerance tie, parity/exclusivity walls unchanged) and books
  reconciliation adjustments under F-A2's regime; split settlements, partial
  allocations and loan-vs-settlement classification are in scope; same-amount
  ambiguity fails closed to an open question whose answer lands in the client KB.
- `except_bank_line` stays human at owner floor; the agent may PROPOSE an exception
  with its reason. The 0038/0040 zero-agent-grant tails are re-cut to the new roster
  (the probes stay, pointed at the new truth). E-R13's mechanical settlement door is
  ABSORBED here (its corroboration intent now rides the witness pair) — recorded, not
  silently dropped.

### F-A4 · Close key ①

- Grants + tools: `begin_close` / `abandon_close` agent-holdable (freeze-timing
  judgement included); `get_close_plan` / `get_close_readiness` / snapshot-family
  reads re-granted per 0064/0057's own reversal recipes (one-line grant + T17 roster
  pin naming the shipped consumer). The agent chases drawer-2 items, drafts
  attestation TEXTS, and proposes the close; keys ②③ and B3 stay human (G2).

### F-A5 · Reporting agency

- The **analysis sandbox**: free computation/charts over the books (rides F-A6's read
  surface), watermarked non-authoritative, structurally unreachable from the seal
  chain (the preview-cell pattern: no definition version, never claim-eligible).
- Definition self-approval to `firm_approved` (E-R5/E-R18 superseded); `canonical`
  migration-only; statutory wording owner-signed.
- The **OBO evaluator lane**: the open→evaluate→seal→render chain's wake-compatible
  closure (the fix 0077's own refusal payload names), so the agent runs a formal pack
  end to end; template list/authoring tools for the agent.
- **N3 lands here**: the renderer implements `line`/`area`/`stacked_bar` beside `bar`
  and branches on the declared `chart_kind`.

### F-A6 · The audited freeform read

- `ARCHITECTURE.md` §3.2's promised tool: parameterised reads on the structurally
  read-only role, every read receipted to `clara.freeform_read_log` (table + grant
  live since `0002`). The sandbox and the "ask anything about the books" experience
  sit on this. Judgement-logic ladder + cross-model adversarial pass (law 28 applies —
  it is an injection-surface design).

### F-A7 · The filing verb + the interview model layer

- **F-A7a** `wake_file_document`: the agent assigns a document to a client on her own
  judgement, riding the ≥0.95 client-attribution wall + content-pack cross-checks
  (SSM no., name, bank); below-wall lands as an open question.
- **F-A7b** the interview model layer (audit recommendation ①): the segment schema
  stays as the validation skeleton; a model normalizer/extractor fronts it — the
  human can hand Clara anything (an SSM cert, a WhatsApp message, one sentence) and
  every filled segment still walks validate → echo-confirm → persist.

### F-A8 · The internet lane (law 75)

- Tier 1: scheduled official-source feeds into effective-dated tables — `fx_rates`
  (BNM; the P-FX principle's future substrate), SST rates/thresholds on change,
  statutory tables. A used number is a versioned row, identical for every client.
- Tier 2: the open web read/search tool — no whitelist; fetched content inert-as-data;
  every web-derived basis cited (URL + accessed date + quote) in receipts/KB; prompts
  prefer official Malaysian sources for rules questions.

### F-A9 · Metering (law/G8)

- Per-call usage rows + monthly per-firm rollup, visible; NO cap ever pauses
  automation. Engine-protective concurrency floors unchanged.

## Track B — tax (content unchanged; P-TAX split governs)

- **F-T1** the SST engine: registration/taxable-period model incl. DG variations;
  service tax payment basis on real AR anchors + s.11(2) + bad-debt relief +
  credit/debit-note deductions; sales tax accrual; dual-registrant separation
  surviving export; the SST-02 return with per-field mapping + NIL validity +
  imported-taxable-services reverse charge.
- **F-T2** the payroll deadline calendar (documents→JV flow stays; no engine).
- **F-T3** (last; may slip v1.1) the draft tax computation: add-backs, capital
  allowances, chargeable income, Form C/P/B + CP204. The agent prepares and narrates
  (add-back judgement is hers, cited); the human reviews and e-files — always.
- **F-T4** the fix queue: task #17 `closing_transfer` Fix A (after the sitting's R1) ·
  P-3 bank registry-vs-ledger zero-census · N5 `fix`-field backfill to the coding
  lane's refusal mapper · the claims accounting class's account-convention design
  (E-R10 — the generic lane posts it unattended now; only the convention needs ruling).

## Sequencing + dependencies

F-A1 → F-A2 is the only hard chain (posting needs the witness pair). F-A3/4/5/6/7
fan out after F-A2's verb shape lands; F-A8/9 are independent; Track B is independent
throughout (its evaluators read the books regardless of who posted). The Wave-G corpus
runs only after F-A10.

## Deferred / not reached (owner sittings own these)

R1 (`closing_transfer` question) · corpus decisions OD-1..11 + P-1..3 (incl. the
corpus doc's step-4 G1-alignment amendment) · CI economics overhaul · FX-lite build
timing (principle pre-seeded, law 18 stands) · the WD-R5/R8 calendar-belt doctrine
(explicitly NOT re-ruled by 0071) · beta-boundary instruments (per `PROGRESS.md`).
