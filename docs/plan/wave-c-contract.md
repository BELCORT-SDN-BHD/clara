# Wave C — money movement: the slice contract

> **Status: RATIFIED IN PART, 2026-07-29.** The owner ruled every fork in §2 during the Wave-C
> grilling session. §3 (ground truth) is verified. §4 (the slicing) follows from §2 and is the
> build order of record. §7 items remain open and are named as open.
>
> **Authority:** the owner's rulings in §2 govern. On any conflict between this document and an
> earlier plan artifact, this document governs for Wave C only; `docs/prd/PRD.md` §6 (LAW) governs
> over this document always.
>
> **Evidence grading used throughout:** **[V]** = verified by the orchestrator against the cited
> file:line this session · **[L]** = reported by a worker lane, not independently re-verified ·
> **[R]** = recalled/secondary, NOT verified from a primary source.

---

## 1. What Wave C is, and the debt it pays

Wave C is the money-movement slice: statement ingest, parity-checked matching with entry
exclusivity, reconciliation tie-out, receipt/payment allocation, aging and statements, and the
self-reconcile learn loop (`REBUILD-PLAN.md:125`). **[V]**

**It also pays an outstanding F3 debt, and should say so in its opening line.** Every
`supplier_bill` posted today — *including the ADR-050 production autopost* — credits a payable
control account with **no open item, no aging, no settlement, no statement**. By the wording of
`PRD.md:119` ("A workflow **fails** if it posts or codes GL lines while leaving any required
AR/AP/fixed-asset/reconciliation/reporting/knowledge state stale") that is a failing workflow. **[V]**
It was deferred to Wave C, not satisfied — and the deferral is **not recorded as an F3 exception
anywhere**. **[L]**

**Wave C also silently inherited two deferrals** that were chartered here and must not be
rediscovered mid-build:
- **AR/AP open-item subledger** → *"Open-item subledger (due dates/allocation/aging) stays Wave C
  per S6-D2"* (`wave-a-daily-loop-contract.md:22`, WA-R1). **[L]**
- **Multi-currency** → *"Deferred: multi-currency (→Wave C)"* (`wave-a2-ar-myinvois-contract.md:31`,
  WA2-R1). **[L]** — **re-ruled OUT by the owner, see WC-R5.**

---

## 2. Owner rulings (ratified 2026-07-29)

| # | Ruling | Rationale of record |
|---|---|---|
| **WC-R1** | **Wave C splits.** C-a = AR/AP open-item subledger + allocation. C-b = bank identity, statement ingest, matching, tie-out. Each gate-closable alone. | Allocation and aging are structurally downstream of the subledger, and the F3-3 double-count fix lives there. Matching *without* a subledger can only match GL entries — the shallow shape that produced GAP1-1/1-2 in the prior build. |
| **WC-R2** | **Match model = match group.** Line ↔ group is 1:1; N:M inside the group. **Exclusivity is a CENTS INVARIANT enforced DB-side** (Σ allocated ≤ the entry's net movement), *not* row uniqueness. | A Malaysian bank line routinely clears N invoices (batch payment) and one invoice is routinely paid across N lines (partials). Strict `UNIQUE(entry_id)` forbids the second outright, and bookkeepers would work around it by inventing fake entries — strictly worse than what it prevents. |
| **WC-R3** | **Tie-out ships as a receipt shaped for a future close wave.** The PRD's "gates year-end close" clause moves to a close wave. **Match state stays OFF `journal_entries`.** | No close model exists to gate: `clara._correction_period_state` is a permanent stub returning `'no_period_model'` (`0007:2423`) and every guard comparing `<> 'no_period_model'` is therefore dead code (`0007:2559`, `0009:2464`, `0027:263`). **[V]** A half close model bolted onto Wave C is how GAP2-1/GAP5-3 were built the first time. Keeping match state off entries also means a future close gate can never strand an unpresented cheque, and `_tf_entry_immutable` (`0003:356-392`) is never touched. |
| **WC-R4** | **Statement ingest takes BOTH paths, structured first.** Structured CSV/OFX importer *and* an OCR statement-line producer. | Owner's domain call: clients cannot reliably produce CSV, so an OCR tier is not optional. Cost accepted knowingly — C-b carries a full statement-line extraction producer under the two-reader law, not just a deterministic importer. |
| **WC-R5** | **Multi-currency is OUT. Fail closed with an honest refusal.** WA2-R1 is explicitly re-ruled here so the deferral is deliberate, not forgotten. | No BELCORT client holds a non-MYR bank account. Verified there is **no currency column anywhere** in 34 migrations; `currency` exists only as a plpgsql local in extraction parsing where `v_currency='MYR'` is a hard corroboration gate with `explicit_non_myr` surfaced (`0023:150-151,256,306,355`). **[L]** Adding a currency dimension to `journal_lines` is the most invasive schema change available at this stage. |
| **WC-R6** | **Exact-zero tie-out.** A per-line difference is admitted **only if it posts an adjustment entry in the same transaction** (bank charge / FX loss). | The difference never vanishes into a tolerance — it becomes a coded entry, so the books still tie to the sen and the DB still owns every number. Handles real inward-TT charges without friction and never creates a free bucket. Note the textual tension this resolves: `ARCHITECTURE.md:88` authorises an "amount-beyond-tolerance" RAISE while `PRD.md:122` only ever authorises a ≤5¢ *journal-balance* rounding auto-post. **[L]** |
| **WC-R7** | **Corroboration bar for a statement line:** structured → **the running-balance chain IS the second reader**. OCR → **two readers AND the chain must close.** | The balance chain (opening + Σmovements = closing) is *strictly stronger* evidence than a second OCR read, because it catches an **omitted** line — which two agreeing readers structurally cannot. OCR needs both because OCR can silently drop an entire row. **This is a deliberate strengthening of ADR-047's doctrine and should be recorded as one.** |
| **WC-R8** | **Attempt budget: the shared cap of 2 STAYS; make it VISIBLE.** Surface attempts used / remaining / who spent them before a human triggers a retry. | The cap exists to bound spend on a genuinely un-draftable document, and that reason does not care who spent the attempt. The defect is invisibility: a park must never be a surprise attributable to an actor the user never saw act. (Register item #53.) |
| **WC-R9** | **Taxonomy: `coding_kind` is retained and its meaning is fixed as *"which control account this entry touches, and in which direction"*** — not "what kind of document this is". C-a adds exactly **two** values: `customer_receipt` (zero income legs) and `supplier_payment` (zero expense legs). `cash_purchase` / `cash_sale` / `supplier_credit_note` are added later **purely additively**; nothing is ever renamed or removed. | Chosen over a multi-dimensional `posting_profile` replacement (the competing cross-model proposal) because it is faithful to the codebase's actual grain: the DB enforces a shape only where a *wrong* posting silently corrupts a subledger — which is why there are three today, not seventeen. The `customer_receipt` zero-income clause structurally forecloses the Gate-1 F3-3 defect, where a bank receipt auto-posted `Dr Bank / Cr Revenue` and double-counted income. |
| **WC-R10** | **No `employee` counterparty kind.** Staff claims ride the generic lane, crediting a **non-`payable`-class** "amount due to employee / director" liability by GL account convention. | Three verified reasons and one professional one. (i) `counterparties.kind` is `('vendor','customer')` **[V]** `0015:144-150` and the kind is *derived from direction*, which returns only those two — a third kind is dead on arrival. (ii) **It would poison the rule pool:** the vendor-account auto-proposal breeds for `kind='vendor'`, so an employee registered as a vendor would, after 3 sightings, breed an autopost rule binding a **natural person** to an expense account. (iii) Personal-data retention columns exist on `documents`, not `counterparties`. **[L]** (iv) A staff claim is either a reimbursement or an allowance/perquisite — a *professional judgement* Clara must never make silently. The account-convention approach also **fails safe**: a claim credit to a non-payable liability is already refused as a `supplier_bill` (`0009:497-498`) **[L]**, which is the correct answer, and it never enters trade-creditor aging. |
| **WC-R11** | **Acceptance: synthetic in Rome first, then one real BELCORT month.** | Matches the Gate-S / Gate-L precedent. New money-movement code must not first execute against real books. Corpus confirmed available — see §6. |
| **WC-R12** | **Structured MyInvois sales autopost is NOT a Wave C build item.** | Superseded by fact: the owner holds **no XML documents**. Verified live — BELCORT holds 60 documents, **100% `application/pdf`, zero XML**; the only 6 XML documents in the system belong to the synthetic sandbox firm. **[V]** The structured lane is XML-only *by deliberate design*: evidence class derives from the document's actual facts lane and a mismatch is a named visible skip — *"an OCR document can never ride a 'structured' rule around the envelope"* (`0029:758-774`). **[V]** The PDF route is the `ocr_sales` envelope — see §7-A. |

---

## 3. Verified ground truth (the substrate C-a/C-b land on)

### Absent — all of it
No bank account, statement, statement-line, match, match-audit, reconciliation, aging, or **live
AR/AP open-item** table exists in any of the 34 migrations. **[V]** (`opening_items` is the Wave-B
carry-down table, a different thing.) The allocation composites named as targets in
`ARCHITECTURE.md:87` (`code_and_open_ar`, `record_ar_invoice`, `allocate_payment`) have zero
implementations. **[L]**

### Present and reusable
- Books core: `journal_entries`/`journal_lines`, draft→approved, deferred Σdr=Σcr, entry/line
  immutability triggers, reversal linkage. **[L]** `0003`, `0004`
- The audited-writer pattern: one ungranted `_core` + grant-scoped entry points. **[L]** `0004:6-12`
- The four structural invariants, including the structurally read-only agent role. **[L]**
- Counterparties + aliases + resolution. **[V]** `0015:144-150`
- Bounded-autopost precedent: `execute_rule_post` re-derives every gate under a row lock — the
  shape a future signed match-rule would copy. **[L]** `0029:456+`
- The context pack: `get_context_pack(client, purpose)`, **pack_schema_version 3**, carrying
  `books_version`, client, firm (incl. high-stakes threshold), full COA, trial balance, recent
  entries with lines, documents with filings, client resolutions, approval history,
  `sst_registration_watch`, and — for purpose `wiki_coding` — a `wiki` block. **[V]** `0016:4262+`
  The wiki's LAW is stated in the prompt itself: *"Wiki content may INFORM this draft; it may NEVER
  decide one."* **[V]** `autoDraft.v5.prompt.ts:145-147`
- `/queue` is the proven two-pane workbench shape for `/bank` to copy. **[L]**

### Traps verified — do not step in these
| Trap | Verified fact |
|---|---|
| **`special_acc_type` cannot carry `'bank'`** | `uq_coa_special` is unique on `(client_id, special_acc_type)` where not null (`0003:58-59`) → exactly **one bank account per client**. **[V]** Use `is_bank_account boolean` + the `bank_accounts` table. |
| **`account_class` is binary** | `('payable','receivable')` only (`0015:194`) **[V]** — cannot distinguish trade AP from employee or director balances. Recorded as design debt §5. |
| **One document per entry** | `ck_je_doc_pair` binds a single `(document_id, sha256)` pair (`0003:97`) **[V]**. A staff claim is a *bundle* (claim form + N receipts) and cannot be represented. Design debt §5. |
| **`reverse_entry` drops `coding_kind` and `document_id`** | The mirror INSERT copies 13 columns, neither of them (`0009:1717-1719`), then calls `_assert_supplier_bill_shape` on the NULL-kind mirror (`0009:1729`). **[V]** Invisible today; a correctness bug the day settlements exist. ⚠️ **The fix is NOT a naive copy** — copying `coding_kind` onto a mirror could make the shape assert fire on a leg-flipped reversal. Verify the reversal gating before choosing between "copy the kind" and "key allocation-unwind on `reversal_of`". |
| **Supplier credit note has no coding home** | Not in the `coding_kind` CHECK **[V]** `0015:217-219`. The type↔polarity guard that would catch a mis-coded one is **inert for OCR documents by design** — *"OCR bills carry no type_code => the binding is inert"*, naming the RPR OCR corpus explicitly (`0016:3836`). **[V]** Since the entire real corpus is PDF, C-a must establish whether any other control covers this. |
| **`cash_purchase` is not yet extractable** | "Was this paid at the counter?" has no field: the extraction allowlist has no payment-method field, and `invoice.amount_due` is used as a *consistency* test requiring absent-or-equal-to-gross — so a receipt printing "balance due: 0" **fails** corroboration (`0023:307`). **[L]** Hence WC-R9 defers the kind. |

---

## 4. The build order

### C0 — clear the ledger and the latent defects (1 migration, function recuts only)
Lands **before** any Wave C schema. Bundled to avoid migration-number contention.

1. **#52 — the nonzero-tax belt. SAFETY-CRITICAL, land first.** `_assert_supplier_bill_shape_at`
   wraps its entire tax tie in `if v_sstp_legs > 0 then … end if` with **no else branch**
   (`0016:3916-3933`) **[V]** — a bill whose document states nonzero tax but is drafted as a plain
   2-leg passes cleanly. Safe today only because the one bound vendor genuinely states zero tax.
   **TRIGGER-BOUND: must land before any binding or rule on a vendor whose bills state nonzero tax.**
2. **#51 — `settle_autodraft_task` gates only on `t.status`, with no `workflow_run_id` check**
   (`0011:2653-2660`) **[V]**. A losing dispatch is normal, not an error → a non-owning settle must
   be a **no-op with an honest receipt**, never an exception.
3. **#53 — attempt-budget visibility** per WC-R8.
4. **The sales mis-route gate.** `list_autodraft_candidates` has **no direction filter**
   (`0011:2771-2783`) **[V]**, and the unattended drafter passes a hardcoded `"supplier_bill"`
   (`autoDraft.v5.tools.ts:174`) **[V]** — a sales document reaching ready would be handed to a
   purchase-only prompt. Probed live: 9 candidates, all `direction='purchase'` → **real defect, no
   victim yet.** Gate `admit_autodraft_task` consistently.

**Pre-checks discharged:** graph re-indexed ✅ · **Supavisor headroom read live: 31/60 sessions,
29 free, runtime holds 11** ✅ (the runbook's `~27` was a code walk of v25; live is v38).

### C-a — the subledger slice

**Owner-ruled additions (2026-07-30, from the C0 review ladder's out-of-scope findings):**
- **`reconcile_sweep_runs` force-complete guard.** The recovery pass (0011:2709) force-completes
  tasks in `('running','cancel_requested')` with **no `exists(coding_attempts)` guard** — one
  recovered filing completes every other still-running task in the run, the live run's real outcome
  is discarded on the `completed` replay branch, and its attempt row wedges (`state='active'` with a
  live reservation, which 0034 then reads as `already_done` forever). A stronger literal match for
  "the reconciler double-dispatch" than anything in settle. Fix = one predicate
  (`and exists(select 1 from clara.coding_attempts ca where ca.task_id=t.id)`), plus a test that a
  recovered filing completes ONLY tasks that actually drafted. **[V]** by the C0 implement lane.
- **`admissionNeedsStart` recognises `re_admitted`.** `packages/runtime/lib/autodraft.mjs:48`
  returns true only for `"admitted"`, so 0034's `re_admitted` outcome mints an `agent_tasks` row
  that is **never enqueued** — the one-click retry §C made visible may never actually run. Runtime
  fix (non-frozen lib) + the missing outcome in the consumer unit test's enumeration
  (`wave-a-autodraft-consumer.test.mjs:44`). Pre-existing 0034 defect; it blunts §C. **[V]**
1. Taxonomy per **WC-R9**: `customer_receipt` + `supplier_payment`, with their shape asserts.
2. Open items: **signed** subledger items + **signed** allocations. Partial settlement, credit
   items, overpayment/on-account residue, reversal lineage, control-account tie-out.
3. The open item materialises at **approve**, not draft — only approved is in the books. Extends
   `_approve_entry_core`.
4. Backfill from existing approved `supplier_bill`/`sales_invoice` **and** from `opening_items`
   (whose `entry_id` is `not null unique` (`0017:1133`) **[L]** — every carried item already owns
   its own entry and is matchable on day one).
5. **`execute_rule_post` must be taught the subledger** — otherwise every autopost becomes an F3
   breach the day C-a lands.
6. `allocate_receipt` / `allocate_payment` composites: GL entry + allocation + open-item movement
   in ONE audited transaction.
7. **`autopost_eligible = false` for every new kind**, asserted at the migration tail. Which of
   three open bills a RM5,000 payment settles is a *judgement*, not a document fact.
8. Resolve the `reverse_entry` gap (§3 trap — design it, do not assume the naive fix).
9. **Negative gates**, including the three-way acceptance case: the same RM100 restaurant receipt
   entered as a **company-card purchase / employee claim / director-paid expense** must produce
   respectively **no open item / an employee-payable (non-`payable`-class) / a director current
   account** — and **none may appear in supplier AP aging**.

### C-b — bank identity, ingest, matching
1. `bank_accounts` + `coa_accounts.is_bank_account boolean` (**never** `special_acc_type`, §3 trap).
2. `bank_statements` + `bank_statement_lines`: provenance-bound, with the balance-chain identity.
3. **`statementFacts_v1`** — a brand-new frozen workflow class (cannot extend `invoiceFacts_v1`;
   bodies are immutable) + registry repoint + `pnpm freeze:update`. Also opens the
   `bank_statement` → `skipped_kind` dead end (`0026:392-410`) **[L]**.
4. Both ingest paths per **WC-R4**, corroborated per **WC-R7**.
5. `bank_matches` (match-group model, cents invariant per **WC-R2**) + `bank_match_audit`
   (**PORT**, not rebuild — `02-salvage-manifest.md:43`) **[L]**.
6. `match_bank_line` / `unmatch_bank_line` with the four parity RAISEs: wrong account, wrong
   period, amount beyond tolerance, already matched. Re-match requires explicit unmatch.
7. Per-line difference posts its adjustment entry in the same transaction per **WC-R6**.
8. `/bank` two-pane workbench copying `/queue`'s shape; new `ClaraPart` member + catalog entry (the
   compile-time exhaustiveness guard will force it).
9. ⚠️ **Do not name the matcher `reconciler`** — `lib/reconciler.mjs` is the crash-recovery
   scheduler.

### C-c — tie-out, aging, learn loop
1. `bank_reconciliations`, period-chained per account (opening = prior closing, outstanding carried
   forward — fixes GAP1-3). Consumes `opening_items.bank_uncleared` at item granularity.
2. The tie-out receipt, shaped per **WC-R3**.
3. Aging 30/60/90 + customer/supplier statements, close-segment-aware.
4. The self-reconcile learn loop: advisory, owner-signed, never blocking. **Give `bank_matches`
   `matched_via_rule_id` + `origin` from day one** so future bounded authority is a function change,
   not a migration.

### Explicit boundaries C-a/C-b must not cross
- **Do NOT widen `_coding_lane_core`** — its body assumes an invoice-shaped document. Settlements
  enter the bank-match lane, not the autodraft coding lane. **[L]**
- **Do NOT blanket-extend the duplicate guards** — they key on invoice numbers; payments have none.
  Bank-line exclusivity is the settlement duplicate control. **[L]**
- **Do NOT split `sales_invoice` into invoice vs debit note** — DN riding `sales_invoice` is
  deliberate, tested and documented, and the subledger effect is identical. **[L]**
- **Do NOT reach for a generic/flexible transaction schema.** The one named accounting case study of
  fully-generic transaction typing produced *"You haven't done a valid month-end closing since this
  new system started"* and *"We've never been able to get our reconciliation data."* **[L]** When
  transaction typing goes dynamic, the first casualty is exactly the close and reconciliation this
  wave builds.

---

## 5. Design debts recorded (not fixed in Wave C unless they block)

1. **`account_class` is binary** — trade AP is indistinguishable from employee/director balances.
   WC-R10's account convention routes around it; the tie-out will eventually have to face it.
2. **One document per entry** — a staff claim is a bundle. Needs either a first-class
   `expense_claim` header linked to multiple filed documents, or a governed
   `entry_source_documents` join with primary + supporting roles. Every supporting document still
   needs firm/client/filing/hash validation.
3. **Sighting-pool segregation.** Pools must be segregated by posting shape, subledger domain, party
   role, polarity and account. *An approved staff claim must never help a vendor invoice rule reach
   its sighting floor.* This is a control requirement, not a nicety.
4. **MSIC is collected and then dropped — LANDED, 0036 §E (2026-07-30).** It appeared only in
   `interview.v1/v2`; zero occurrences in migrations 0001..0035, so it never reached
   `get_context_pack`. **[V]** Fixed as a CoR **patch** (not a rebuild — 0017/0018/0019 each
   rewrote the live pack body via dynamic SQL; a rebuild would have reverted all three): the pack's
   `client` object gains one `msic` key read from the latest committed client plan's
   answered/resolved `msic` item; absent reads null. Live prestate probes verified 2026-07-30
   (anchor exactly once · 0016/0017 markers present · not yet applied). Test `x36c0.i` proves it
   end-to-end in the human lane. Note the live data reality: only the synthetic sandbox client has
   an answered MSIC today — the three real BELCORT clients predate the interview_v2 question, so
   their backfill is an owner action through a sanctioned verb, never a hand INSERT.

---

## 6. Acceptance

Per **WC-R11**: labelled-synthetic in the Rome sandbox first, then one real BELCORT month.

**Corpus confirmed available** — `ROME PROPERTIES SDN BHD` (a real BELCORT client, `e2b0f365-…`,
not to be confused with the synthetic `ROME PUBLIC ADVISORY` firm):
- **9 consecutive monthly bank statements, 202504 → 202512** (`RPR - Bank Statement`, 4 further
  files in subfolders) **[V]**
- 17 supplier invoices · 10 sales invoices · 6 journal vouchers · 4 management accounts ·
  67 payroll files **[V]**
- Already ingested: 23 invoices, 6 other, 2 management accounts, **1 bank statement** **[V]**

So Wave C does **not** end built-but-unfired like Gate P. The north star on record stands: *"full TB
tie incl. bank receipts driving every BS account to 0"* (`wave-a2-ar-myinvois-contract.md:436`). **[L]**

⚠️ **To verify before C-b:** every real document currently has `financial_date = NULL` (only the
synthetic XML carries dates) **[V]**. Reconciliation assigns lines to periods — establish whether
the date lives elsewhere or this is a gap.

---

## 7. Open items

### A. The OCR-sales autopost lane is BLOCKED, and the floor is NOT accruing
The nine-control envelope **is built** (`0016` §3.3; floor `_ocr_sales_floor` at `0016:1579`;
sign-time check `0016:1728-1745`; post-time re-derivation `0029:755-790`) **[V]** — contrary to
CLAUDE.md and the prior handoff, which describe it as a future post-C slice.

**But three things block it, and the second was an orchestrator error worth recording:**
1. **There is no unattended sales drafter.** `autoDraft.v5.tools.ts:174` passes the hardcoded
   literal `"supplier_bill"`; its schema has no `coding_kind` input at all. **[V]** A signed
   `ocr_sales` rule has nothing to fire on. Closing it needs a new frozen `autoDraft_vN` taking
   `coding_kind`, a sales prompt shape, a **customer** counterparty proposal — plus C0 item 4's
   direction gate.
2. **Approving sales invoices the ordinary way accrues nothing usable.** The counterparty kind is
   `coalesce(proposal's stated kind, coding_kind-derived default)`, and the default for a NULL
   `coding_kind` is **`'vendor'`** (`0035:222-227`) **[V]**, while the human `draft_entry` verb
   passes `coding_kind = NULL`. Post-time control requires a live `kind='customer'` row. **Only a
   chatTurn-v8 draft tagged `coding_kind='sales_invoice'` produces a correctly-attributed customer
   sighting.** *(The orchestrator earlier advised the owner that the clock would fill on its own.
   That was wrong and is corrected here.)*
3. **A signed rule may refuse most invoices.** Corroboration requires `v_tax is not null` —
   *"A document that does not state a tax has proven nothing about its tax"* (`0023:299-303`) **[L]**
   — but the floor does **not** require corroboration. So tax-silent invoices *do* accrue toward the
   floor while `execute_rule_post` will skip them as `not_corroborated`. **This must be surfaced at
   signing time**, or the owner reaches the floor, signs, and watches it refuse.

**Two documentation defects in the floor** (code wins in both): the 60-day span is measured on
**`posting_date`**, not approval date, while the function header says *"whose human approvals span
>=60 days"* (`0016:1589-1603`) **[L]** — so six back-dated invoices spanning 60 posting-days can
satisfy that leg in one sitting. And the advertised "6 distinct documents" is not what runs:
`distinct_docs` is returned but **no caller reads it**; all three sites bind `distinct_invoices`
**[L]** — the enforced rule is *stricter* than advertised.

### B. The structural hole this audit found: `coding_kind` has no roadmap
The classifier recognises **17 document kinds**; the books can code **3**. Searching PRD,
REBUILD-PLAN, ARCHITECTURE and all three project logs for a statement of where the other 14 land
returns **zero hits**. **[L]** That absence is what produced the receipt-routing seam: the owner
ruled (0025) that *every* receipt be routed into the paid OCR lane because "the facts lane excludes
'receipt', where Malaysian SST actually lives" — and those receipts are now read, then hit a wall,
because a counter purchase has no payable credit and so cannot be a `supplier_bill`. **The OCR spend
buys visibility, not automation, until a landing kind exists.**

**The cheapest fix for the hole is a roadmap row in `REBUILD-PLAN.md`** naming which document kinds
earn a typed lane in which wave — *including the explicit decision that `claim_form` and
`payment_voucher` stay generic forever*, if that is the intent.

**Five behaviours have no home in any artifact** (real holes, not deferrals): staff advances · staff
allowances · self-billed e-Invoice obligation detection · withholding tax *as a mechanic* · foreign
currency. **[L]**

**Worth knowing, on the credit side:** the COA template already carries an expert Malaysian
treatment vocabulary built *ahead* of the engines that will consume it — a four-way entertainment
split for the s.39(1)(l) add-back, donations split by whether approval evidence exists, a `430-WHT`
payable, director and related-party ladders. **[L]** This is not an unexamined gap; the engines are
simply not built yet.

### C. The three agentic tiers — state them out loud
| Tier | What the agent may do | Authority |
|---|---|---|
| **1. Instance** | Transcribe any document's stated lines into the generic lane, interactively, citing regions. **Live today.** | A human approves each one |
| **2. Pattern** | Notice a recurring shape and *propose* a rule after ≥3 human-approved sightings. **Live for vendors only.** | A human **signs** it |
| **3. Shape** | **Never.** A new `coding_kind` is a migration. | The migration file *is* the audit record of a schema-level accounting decision |

**What is missing is tier 2 for anything that is not a supplier bill or a sales invoice** — sightings
breed only on control-account entries, and generic-lane entries breed nothing. **That, not tier 3,
is the thing worth building.**

### D. Malaysian tax facts — RESOLVED, see the verification record
**→ `docs/plan/research/wave-c/my-tax-verified-2026-07-29.md`** — a two-lane cross-model
verification (Codex `gpt-5.6-sol` + a native workflow with an independent opus adjudicator) against
primary LHDN/RMCD sources. **Both lanes converged on every load-bearing answer.** That document
supersedes what this section previously said.

Headlines that bear on Clara's design:
- **The RM10,000 rule is a CONSOLIDATION EXCLUSION, not an abolition of consolidation** — per single
  transaction, strictly `>` RM10,000, all industries, from 1 Jan 2026. Both circulating claims were
  partly wrong.
- **§16 interim relaxation:** taxpayers up to RM5m may consolidate everything, *including* the §3.7
  activities, **through 31 Dec 2027**. Any "31 Dec 2026" value is a year stale.
- **"30 Nov 2025" was never a bad-debt rule** — a closed transitional refund window. The standing
  SST bad-debt limit is **six YEARS** from the date the tax was paid. **There is no six-month
  waiting period in the Acts or Regulations** — that is a GST-era carry-over. Do not encode it.
- **Two engineering traps:** a pinned LHDN URL is not a pinned version (`/media/uwwehxwq/…` still
  serves stale v4.7 while `/wp-content/uploads/…` serves v4.8); and **Table 3.6 row numbers are not
  stable** (item 8 → item 7) — key policy records on the rule TEXT, never the item number.
- **One thing Clara must NOT auto-decide:** whether the RM10,000 rule is genuinely waived for a
  ≤RM5m client during the relaxation. §16.2(a) says yes; v4.8 Example 24 reads as if unconditionally
  live. **Surface it, do not infer it** — confirm with LHDN in writing first.

**Standing rule for this project: tax rates, thresholds and phase dates belong in effective-dated
policy tables, never in product-law prose.** `PRD.md:175` currently embeds rates and a simplified
RM1m e-Invoice exemption statement in prose; correct it when the tax policy tables are built (Wave F).

### E. Housekeeping
Four stale git worktrees survive from closed work — `.claude/worktrees/agent-ac319494de900ebb2`
(`feat/gate-l-rig`, inside the repo and polluting greps), `C:/Users/zhant/Desktop/clara-wt-gates`
(detached), `C:/wt-filings-lock`, `C:/wt-vendor-binding`. **[V]** Owner's call to prune.
