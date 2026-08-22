# Wave F — the two-track contract (ADR-0071 execution)

> **Contract of record for Wave F**, minted 2026-08-18 from the owner's Agentic Charter
> rulings (`docs/adr/0071-the-agentic-charter.md`; digest laws 71-76). Wave F runs TWO
> PARALLEL TRACKS. Every item below takes the uniform ADR-061 ladder at build time; this
> contract scopes, it does not waive review. Live state lives in `PROGRESS.md`; this file
> is the scope authority until the wave closes.
>
> **AMENDED 2026-08-22 — the Track-A sitting (`docs/adr/0074-the-track-a-sitting.md`, TA-P1 …
> TA-P14).** Fourteen principle rulings scope F-A3 … F-A9 and widen F-A10's completion
> criterion. Amendments are marked in place as `[TA-2026-08-22]` blocks under the item they
> change — **appended, never a silent rewrite**: the pre-amendment text stands above each block
> so the delta is readable. Four of the sitting's rulings are **constitutional amendments
> pending the owner's next digest sign-off** (ADR-0074's own preamble names them); the items
> below are scoped as ruled, and a design may not start on the unratified half of TA-P7 before
> that signature. The full agenda with its member tables — the consequence map for each item's
> design — is `track-a-sitting-1.md` / `-2.md` / `-3.md`.

## The one completion condition that outranks the item list

**F-A10 — retirement completes inside Wave F.** When Wave F closes, exactly ONE
architecture exists: the old lanes — `autoDraft`'s draft-only posture as the terminal
state, `execute_rule_post` + the rule signing/breeding estate, Azure `prebuilt-invoice`,
Azure `prebuilt-bankStatement`, the deterministic reader family — are RETIRED (workflow
versioning discipline: new `_vN` exports + registry repoints; frozen bodies stay
reachable for parked runs; rule/sighting HISTORY rows are kept as data — they are the
knowledge layer's fuel, never deleted). **Two architectures never enter Wave G**; the
corpus E2E tests the new one only.

**[TA-2026-08-22] F-A10 gains a TEST and one more machine (ADR-0074/TA-P11).** The test:
*a shared deterministic core with one entrance per surface is ONE architecture; two
mutually-unaware computations of the same fact, or two mutually-unaware authority paths to
it, are TWO.* Three consequences bind this criterion: **(1)** the **BANK rules machine
retires whole** and joins the list above — propose/sign/retire bank rules, the sightings
table and its three-sighting breeding, `accept_bank_rule_suggestion` (the `0044`/D-b3
producer) and the four dashboard surfaces (RuleCandidatesCard · BankRuleProposalCard ·
StatementDetail's coding chip · chat's `bank_rule_proposal` part); writes stop, history rows
stay as knowledge fuel. This supersedes **WCC-R5**'s bank arm (ADR-054). **(2)** 7A-R3 and
E-R13's registered lift are **recorded DISSOLVED** with it — see F-A3. **(3)** **SST-02's own
form producer is NOT a second architecture** — it sits outside the seal/claim chain but shares
the deterministic evaluators and the bigint arithmetic beneath, and this sentence is part of
F-A10's closing criterion. TA-P10's sandbox render path is the standing watch item: one
geometry library, two entrances, checked against this test at review.

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

**[TA-2026-08-22] F-A3 scope, from TA-P1 · TA-P3 · TA-P5 · TA-P11 · TA-P14.**
- **Verbs that become the agent's** under the OPEN REGISTER (TA-P1 C — law 71 reserves seven
  acts and nothing else): `enter_bank_statement` and `void_bank_statement` · the
  reconciliation certification · **unmatching any pair, not only her own** · resolving an
  exception including write-off, and voiding a reconciliation · both waiver flags, the
  cross-period ack AND **the 60-day stale-open-item waiver** · `upsert_account` **and
  `add_bank_account`** (bank-account registration) · the staff-advance application leg.
  `except_bank_line` STAYS human at owner floor — it is one of the seven. New authority
  arrives as **wake SIBLING verbs**, never by rewriting a live human body, so no D1 window is
  needed to add a grant; capabilities are default-on with no per-firm dial.
- **Two walls the design must carry** (riders, fail-closed): a **mechanical duplicate-payment
  wall** on the 60-day waiver, and the COA-binding check that `add_bank_account` now needs —
  a wrong account↔COA binding reconciles a whole month into the wrong account while the
  screen still reads "reconciled". **The 60-day figure itself stays 60** on both lanes for
  now; F-A3's acceptance battery records the real stopping frequency and the owner tunes it
  once, on data (ADR-0074 R-A — the sitting's only standalone residue).
- **Consent (TA-P3 A):** a NEW named purpose `bank_matching`, signed + activated per client
  at onboarding with the purpose list complete; an unsigned client's bank agency lane stays
  **stopped**, never silently downgraded.
- **Wake source (TA-P5 A):** the bank lane is event- AND clock-driven under law 71 — no ramp,
  no first-run draft, no sampling. A clock means *wake and look*: a missing statement produces
  a chase notice, never a fabricated reconciliation. An ambiguous line may be revisited days
  later automatically. Every clocked act is receipted per TA-P4.
- **Retirement (TA-P11 A):** the bank rules machine retires whole inside F-A3's scope (see
  F-A10 above) — and **7A-R3 ("a no-tax invoice never posts unattended", ADR-063) plus
  E-R13's registered mechanical lift (ADR-065) are formally RECORDED as DISSOLVED with it.**
  The successor wall is the witness pair's nil-tax arm plus the SST-registrant lock (opener ②,
  lock 3); a client who *ought* to charge SST but issues no-tax invoices is F-T1's problem,
  not a posting gate's.
- **Gate repair (TA-P14 clause 1):** F-A3 owns the **drawer-2 bank gate's vacuous green** by
  measurement origin (`0056:1360-1361` enumerates only `bank_statements` while 0 accounts are
  registered against RM 39,252.03 of real balance). Drawer-1's P-3 stays with F-T4.
- **Identifiers (TA-P8 B):** a payer account number Clara learns by judgement is knowledge-layer
  CONTEXT, never an exact-match key. Hard constraint 12 is NOT widened; RS bank matching runs
  on amount + date until a human confirms, or Clara's promotion proposal is one-click accepted.

### F-A4 · Close key ①

- Grants + tools: `begin_close` / `abandon_close` agent-holdable (freeze-timing
  judgement included); `get_close_plan` / `get_close_readiness` / snapshot-family
  reads re-granted per 0064/0057's own reversal recipes (one-line grant + T17 roster
  pin naming the shipped consumer). The agent chases drawer-2 items, drafts
  attestation TEXTS, and proposes the close; keys ②③ and B3 stay human (G2).

**[TA-2026-08-22] F-A4 scope, from TA-P1 · TA-P2 · TA-P4 · TA-P5 · TA-P6 · TA-P14.**
- **The calendar wake source is F-A4's to mint (TA-P5 A):** the product's FIRST time-triggered
  wake — a new wake kind, a CHECK pair and six roster surfaces (the D34 live-CHECK swap is the
  precedent). It runs under law 71, not law 21: **no ramp, no first-run draft, no sampling.**
  It carries a visible notice and a human "hold" button on its first lanes. **Law 21 is
  narrowed to periodic POSTING belts** and does not govern whether a clock may wake her.
- **Verbs that become the agent's** (TA-P1 C): opening a new fiscal year (with an honest
  `fy_end_source` value when she accepts the derived date) · abandoning a close **including
  one she did not open**, and re-freezing after a reopen · minting the month snapshot. Keys
  ②③ stay human, and **drawer 1's identity failure keeps NO declaration channel for anyone —
  no agent back door may be designed for it.**
- **Minimal human doors are IN SCOPE (TA-P14 clause 2):** finalize, abandon, a "Clara proposes
  close" review card, and the durable carrier for that proposal (the open-question closed
  worlds extended only-widening, D34's precedent, or a close-proposal object). **The UI may be
  crude; it may not be absent** — today no caller for finalize/abandon/reopen/open-year exists
  anywhere in dashboard or runtime, so without this F-A4 ships a path nobody can walk.
- **Numbers with no document (TA-P2 A+):** year-end adjustments post unattended only where a
  **versioned deterministic evaluator** exists (depreciation off the posted FA register,
  amortisation off the posted prepayment). Judgement accruals — provisions, bad debt — are
  drafts carrying her rationale that one human click makes the human's judgement. Depreciation
  catch-up executes EXISTING authority only; an unsigned client gets a chased question.
- **Receipts + walls (TA-P4 A · TA-P6 A):** freeze/abandon receipts carry model + version +
  rationale and `via_wake_kind` stops being NULL; `segregation_mode` gains **`agent_prepared`**
  ("prepared by Clara, sole human signer X") and never says `two_person` for an agent-prepared
  year. **`finalize_close` is the same live body as Track B's task #17 Fix A and TA-P4's
  receipt columns — ONE migration or a strict ordering, ONE D1 write-quiesce window.** The
  human-side begin/abandon floor is untouched.
- **Gate repair (TA-P14 clause 1):** F-A4 owns the **uncoded-voucher gate's vacuous green**
  (`0056:1397`'s BETWEEN never satisfied by NULL `financial_date`; `:1404-1405` makes the miss
  permanent). **Acceptance:** a full synthetic round — open → chase → propose → human key ②
  finalize — labelled per ADR-048, with the real-books deferral to the Wave-G reset RECORDED.
- **N4 is treated as LOST** (TA-P14 clause 6): re-scanned at F-A4's design stage, any
  rediscovery registered anew, the old id retired.

### F-A5 · Reporting agency

- The **analysis sandbox**: free computation/charts over the books (rides F-A6's read
  surface), watermarked non-authoritative, structurally unreachable from the seal
  chain (the preview-cell pattern: no definition version, never claim-eligible).
- Definition self-approval to `firm_approved` (E-R5/E-R18 superseded); `canonical`
  migration-only; statutory wording owner-signed.
- The **OBO evaluator lane**: the open→evaluate→seal→render chain's wake-compatible
  closure (the fix 0077's own refusal payload names), so the agent runs a formal pack
  ~~end to end~~ **open→evaluate→seal→render** *(amended below)*; template list/authoring
  tools for the agent.
- **N3 lands here**: the renderer implements `line`/`area`/`stacked_bar` beside `bar`
  and branches on the declared `chart_kind`.

**[TA-2026-08-22] F-A5 scope, from TA-P14 · TA-P1 · TA-P5 · TA-P6 · TA-P10.**
- **"End to end" is REWRITTEN (TA-P14 clause 5):** the agent's reach is
  **open → evaluate → seal → render**, and **ISSUE IS A HUMAN ACT** (key ②). Acceptance
  records and batteries are written against that boundary; "end to end" never again means
  through issue.
- **The two-person wall re-arms on the DIRECTING human (TA-P6 A):** the OBO channel writes
  the directing human into `requested_by` so the issue wall keeps biting; on a **self-run with
  no director the issue step fails closed to a human act by someone who did not prepare the
  work.** The report-issue segregation wall gains a **solo arm** to match the close wall's,
  auto-upgrading to distinct-checker when a second human joins. This is judgement logic —
  review law 1's independent pass, and it shares `finalize_close`'s D1 window.
- **Self-run packs (TA-P5 A):** the monthly management pack may run on the clock. Two named
  consequences: `clara-render` bills hourly and `reports/` only grows; and **`0084`'s
  orphan-adoption rule does NOT apply to report runs**, or a self-run pack waits forever to be
  adopted.
- **Verbs that become the agent's** (TA-P1 C): minting the metric-input snapshot · publishing
  management and chart templates (statutory templates and house style stay human — they go
  effective outside the firm) · the definition lifecycle **including REJECT** ·
  `create_account_set_v1` · render re-queue **including drift consent**.
- **The sandbox's reach (TA-P10 C′):** exports are free with the **watermark burned into the
  bytes** plus an export record; **cross-client export is allowed when a mechanical check
  proves the recipient covers every `client_id` in the file**; the watermark string is a
  versioned claim-policy row the owner signs once in three languages — **no default string in
  code, a missing row refuses the render**. A free-query aggregate is narrative and citable in
  a receipt (with its query text) but **never an authoritative number in a durable artifact**.
- **Signed-original archive:** F-A5 builds the DB half (archive + retrieval audit verbs +
  storage policy); UI is Wave G. The original is **preserved and retrieved, never regenerated**.
- **Renderer clause (TA-P14):** the **first real seal + byte-reproduction drill comes BEFORE
  N3's chart work** — it closes DR-render's unrun boundary. Every renderer image is retained
  seven years (E-R14) and a renderer change runs as a ceremony. **N2 is treated as LOST** —
  re-scanned at design stage, rediscoveries registered anew, the old id retired.

### F-A6 · The audited freeform read

- `ARCHITECTURE.md` §3.2's promised tool: parameterised reads on the structurally
  read-only role, every read receipted to `clara.freeform_read_log` (table + grant
  live since `0002`). The sandbox and the "ask anything about the books" experience
  sit on this. Judgement-logic ladder + cross-model adversarial pass (law 28 applies —
  it is an injection-surface design).

**[TA-2026-08-22] F-A6 scope, from TA-P9 · TA-P4 · TA-P1.**
- **The read surface is DECIDED, not inherited (TA-P9 A).** **(1)** A free read from a
  client-bound session is **server-side scoped to that client** — the range is compiled into
  the query, never asked of the prompt. **(2)** A cross-client read is a **separately named,
  separately receipted action** — answered, not refused. **(3)** The **HOME chat with no client
  pinned is firm-wide by design**; cross-firm never (invariant (c)). **(4)** The readable table
  list is **enumerated in code and printed as an audit line** (law 34), never inherited from
  seventy migrations of accumulated `clara_agent_ro` grants — **this closes audit GAP5-5
  (HIGH), unclaimed since the first audit.** **(5)** `interactive` wake ONLY at first;
  unattended lanes use typed reads until a separate named ruling, which will force a batch of
  new typed read verbs out of the F-A2/F-A5 designs. **(6)** No per-asker RBAC tiering and
  **no per-firm signature gate** (TA-P1's default-on capabilities).
- **A DEFINER read wrapper, not a bare read-only connection (TA-P4 A.3).** The read and its
  receipt commit in ONE transaction — **no receipt, no read.** The wrapper still takes SQL text
  as a parameter, so this does not contradict ADR-0071's parameterised-SELECT shape; what it
  adds is atomicity. It is also the only mechanism that can enforce clause (5): the wake
  allowlist keys on function names and **structurally cannot reach a bare SELECT.**
- **Receipt fields:** `firm_id` / `query_text` / `purpose` NOT NULL, with who/why/from-where
  **bound mechanically to the triggering chat turn or wake task** — the model's sentence is an
  annotation, never the only evidence. A **bookkeeper+ human read surface** over the receipt
  table ships with it (today not even the owner can read it), at `audit_log`'s floor.
- **XLSX/DOCX content** (values-only today, `monetary_cents: null`) becomes reachable by
  AI-assisted read here — registered in `PROGRESS.md`, restated so the design does not
  rediscover it.

### F-A7 · The filing verb + the interview model layer

- **F-A7a** `wake_file_document`: the agent assigns a document to a client on her own
  judgement, riding the ≥0.95 client-attribution wall + content-pack cross-checks
  (SSM no., name, bank); below-wall lands as an open question.
- **F-A7b** the interview model layer (audit recommendation ①): the segment schema
  stays as the validation skeleton; a model normalizer/extractor fronts it — the
  human can hand Clara anything (an SSM cert, a WhatsApp message, one sentence) and
  every filled segment still walks validate → echo-confirm → persist.

**[TA-2026-08-22] F-A7 scope, from TA-P7 · TA-P3 · TA-P8 · TA-P4 · TA-P14.**
- **Attribution is the agent's JUDGEMENT, and when she is unsure she clarifies with the user
  (TA-P7 C, the owner's own ruling).** The ≥0.95 human-click-or-exact-identifier wall opens to
  her judgement. **This is a CONSTITUTIONAL AMENDMENT and F-A7a's judgement half may not build
  before the owner signs the digest** — ADR-0074 carries the proposed PRD §6.2(a) /
  ARCHITECTURE §0.1 wording, and the `AGENTS.md` home is FLAGGED, not drafted. Four
  walls-validate riders are part of the item: **(1)** a hard-number CONTRADICTION wall — a
  printed registration mapping to a DIFFERENT client refuses and asks; **(2)** a name-family
  COLLISION guard — more than one candidate must clarify (BELCORT's own ROME family, plus RPR
  returning as a real counterparty after the reset); **(3)** the correction path — unposted →
  re-attribute, posted → reverse and raise a question, and **a re-attribution raises a named
  misrouted-egress event, because attribution routes CONSENT**; **(4)** a **firm-scoped
  unattributed-document question carrier** — `wake_open_question` requires an attributed client
  today, so an unattributed document cannot by construction reach the fallback. **(4) ships
  WITH F-A7a**, or "it falls to a human queue" is an empty promise. The orchestrator's
  DB-judged hard-number corroboration is on file as dissent (ADR-0074/TA-P7).
- **Egress (TA-P3 A), the narrow purpose:** BELCORT signs ONCE a **firm-level NARROW purpose**
  covering the two structurally client-less moments — the pre-attribution read and the
  onboarding interview — walled by output: **an attribution verdict or a form suggestion only,
  never an accounting fact, never an amount**, over a **closed admissible-document list**
  (SSM/ROB cert · SST cert · bank statement or bank letter · LHDN correspondence · engagement
  letter; **IC and passport REFUSED**, OD-4's exclusion promoted to a standing product rule).
  **PREREQUISITE, now critical path: the C6 checklist — DPA · written client disclosure · a
  documented PDPA cross-border basis — closes BEFORE this door opens.** **`classify`'s live
  ungoverned egress is brought under the document-processing purpose, and F-A7a may not be
  built on it until that is closed.** Dual-attributed related-party documents read once under
  BOTH sides' authorization. A pre-activation document class with its disposition (never
  deleted, retention extend-only, no purge verb) ships with the narrow door.
- **The promotion door (TA-P8 B + owner grant):** identifiers she learns by judgement are
  knowledge-layer CONTEXT, never exact-match keys. Keys come from a human confirmation or from
  a printed identifier read identically by both witness channels. Clara may **PROPOSE**
  "promote to hard fact" as a typed card (seen N times, judgement stable); **one human click**
  writes it through the audited counterparty door (`0063`'s shape) and the receipt records the
  confirmer. Hard constraint 12 stays RS-pinned and is NOT widened.
- **F-A7b scope (TA-P14):** the **CLIENT onboarding interview only** — the firm's own first-run
  setup interview is a named follow-on. Interview-v3's three residuals clear here, above all
  the **runtime-contract receipt gap** (a server-authored per-`(run, park, submission)` receipt
  replaces today's "a higher park index ⇒ my answer landed" inference). Echo-confirm stays
  per-field for legal name, entity type, FY end, opening stance and CoA seed (TA-P4).

### F-A8 · The internet lane (law 75)

- Tier 1: scheduled official-source feeds into effective-dated tables — `fx_rates`
  (BNM; the P-FX principle's future substrate), SST rates/thresholds on change,
  statutory tables. A used number is a versioned row, identical for every client.
- Tier 2: the open web read/search tool — no whitelist; fetched content inert-as-data;
  every web-derived basis cited (URL + accessed date + quote) in receipts/KB; prompts
  prefer official Malaysian sources for rules questions.

**[TA-2026-08-22] F-A8 scope, from TA-P2 · TA-P3 · TA-P4.**
- **DEPENDENCY, now explicit (TA-P2 / F-A8-OQ-5): the SST rate table is built by F-T1**, the
  side with a named consumer (SST-02's real needs shape the schema). **F-A8 only attaches the
  scheduled fetch to a table that already exists** — it does not create it. This contradicts
  the "Track B is independent throughout" line in Sequencing, which is corrected there.
- **Tier-1 CLOSES to three tables** for Wave F: `fx_rates` + the SST rate table + the SST
  threshold table. Income-tax bands, capital allowances, EPF/SOCSO/EIS, stamp duty and MTD are
  explicitly out until their own consumers land (F-T2/F-T3).
- **How a Tier-1 row lands (TA-P2 A+):** Clara fetches the official sources and **DRAFTS the
  row**; it lands through an **audited owner ONE-CLICK door — NOT a PR** — behind two mechanical
  checks (two independent official sources agree; the value inside a plausibility band). This
  **relaxes migration `0016`'s migration-only write assertion for the Tier-1 tables into a
  governed verb**, which takes its own design and its own review pass; the assertion stands
  everywhere else. Rows are **immutable + supersede** (revision · `superseded_by` · actor); a
  backdated effective date **triggers a downstream impact scan** that names affected entries
  for a human rather than recomputing silently; **a missing row for the day REFUSES by name and
  stops in the open — never carries the previous row forward.** The table carries a
  fetch-attempt/health relation so "nothing was fetched today" is itself a readable record.
- **Tier 2 carries no client identity in v1 (TA-P3 A):** general and regulatory questions only.
  Carrying client identity needs its own named purpose and is unscheduled work. The `fetch`
  tool's non-public-address deny list (localhost · RFC1918 · fly 6PN · cloud metadata) is
  **not** a domain whitelist — law 75's "no whitelist" governs content sources.
- **Citation becomes a TOOL-BOUNDARY mechanism (TA-P4 A):** the fetch tool mints its own
  citation row (URL + accessed date + quote), and **a receipt whose act called the tool but
  carries zero citation rows is REFUSED.** Hard constraint 2 requires structural enforcement,
  not a prompt line.

### F-A9 · Metering (law/G8)

- Per-call usage rows + monthly per-firm rollup, visible; NO cap ever pauses
  automation. Engine-protective concurrency floors unchanged.

**[TA-2026-08-22] F-A9 scope, from TA-P13 · TA-P12 · TA-P2.**
- **ONE ledger of record (TA-P13 A).** `llm_usage_events` becomes the sole ledger, reshaped to
  hold ANY call kind — the two mandatory foreign keys become nullable, a call-kind discriminator
  is added, and **every new feature (F-A2, F-A6, F-A7b, F-A8) records through this one door**.
  **`client_id` and the triggering actor are added NOW, nullable** — the irreversible half: on
  an append-only table, months recorded without them can never be split per client afterwards,
  and "which client cost me how much" is the on-billing number a Malaysian firm's profitability
  turns on. This must be done **before the first production row is written.** No cross-firm
  operator UI this time, but the model is not hard-wired to a single firm.
- **The Slice-4 daily/per-task ledger + its reserve/reconcile machinery RETIRE** once TA-P12's
  gates are gone, and `firm_limits`' dead cap columns are disposed with them rather than left
  as a loaded gun. **This deletes live real data; the owner's ruling is recorded as that
  sentence** (ADR-0074/TA-P13). ADR-060's authority is DATA-scoped, so the schema retirement
  rides its own reviewed migration.
- **The brake census (TA-P12 A) is F-A9 design's FIRST deliverable:** one page listing every
  live refusal gate, each classified KEEP/REMOVE, returned for one owner signature. Already
  ruled: **REMOVE** the chat daily token hard cap · the unattended lane's `refused_budget` at
  60%/100% · the 15-unattended-sales-drafts/day quota. **KEEP** the concurrency floors (3 runs,
  2 scans — engine protection, G8's carve-out). **The chat cap ships as a HOTFIX AHEAD of
  F-A9**, being live behaviour already in violation of a ruling; the unattended gate ships with
  F-A9 or with that lane's retirement, the owner having accepted possibly-wasted work over
  weeks of in-violation behaviour. **A RENAME IS MANDATORY:** engine-protection refusals must
  stop sharing the `refused_budget` receipt string, or a pure engine refusal keeps printing
  "insufficient budget" to a human reader. History rows are append-only and keep the old
  spelling; read surfaces explain both.
- **Cost is a computed number, not an estimate (TA-P2):** spend = tokens × a **versioned
  effective-dated price row**, so the first version builds the price table (it may cover only
  the one or two models in use). Registering prices is a standing human maintenance duty.

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

**[TA-2026-08-22] Four sequencing corrections.** **(1) Track B is NOT independent on one
table:** **F-A8 → F-T1** — the SST rate table is F-T1's to build and F-A8 only attaches the
fetch (TA-P2 / F-A8-OQ-5). **(2) ONE D1 write-quiesce window carries three lines that touch
`finalize_close`:** Track B's task #17 Fix A, TA-P4's close-side receipt columns and TA-P6's
`segregation_mode`/CHECK-domain change — one migration or a strict ordering, never three
windows. **(3) Two items ship ahead of their parent:** TA-P12's **chat token-cap hotfix
precedes F-A9**, and TA-P14's **first real seal + byte-reproduction drill precedes N3's chart
work in F-A5**. **(4) TA-P7's judgement half waits on the owner's digest sign-off** — the
constitutional amendment is drafted in ADR-0074 but unratified, and F-A7a's other pieces (the
firm-scoped question carrier, the correction path, the collision guard) can proceed meanwhile.

## Deferred / not reached (owner sittings own these)

R1 (`closing_transfer` question) · corpus decisions OD-1..11 + P-1..3 (incl. the
corpus doc's step-4 G1-alignment amendment) · CI economics overhaul · FX-lite build
timing (principle pre-seeded, law 18 stands) · the WD-R5/R8 calendar-belt doctrine
(explicitly NOT re-ruled by 0071) · beta-boundary instruments (per `PROGRESS.md`).

**[TA-2026-08-22] Trued.** ~~R1~~, ~~the corpus decisions~~ and ~~the CI economics overhaul~~
were ruled at ADR-0072 / ADR-0073. **The WD-R5/R8 calendar-belt doctrine is now REACHED** —
TA-P5 narrows law 21 to periodic POSTING belts and mints the clock; it leaves this list. Still
deferred: FX-lite build timing · the C6 checklist's own execution and the OpenAI processor
bundle · beta-boundary instruments. **Newly open and owner-facing:** the four constitutional
amendments awaiting the digest sign-off, and **R-OWNER — B15's second door** (a stated but
unresolvable supplier registration resolving to `none`, so the generic arm passes and GB-1's
phantom-payment shape lands through D18; options A/B/C in ADR-0074's residue and in
`docs/plan/active/f-a2-annexes-4-build.md` Annex J). The 60-day figure runs at 60 until F-A3's
battery gives the owner data to tune it on.
