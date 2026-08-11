# Wave A2 — Sales-invoice/AR + MyInvois XML + Standing Rules: design contract

**Status: v1.0 — RATIFIED (owner delta-ratification 2026-07-21). THE CONTRACT OF RECORD for
the Wave-A2 build.** Ladder run: grill (WA2-R1..R13) → 9 grounding briefs → draft → DUAL design
review, both folded — native SOUND-WITH-FINDINGS (14: H1 direct rule match, H2 human-only
sighting pool, H3 `_document_direction`, H4 trusted-substrate honesty, M2–M5, L1–L7) +
adversarial FLAWED (12: **#1/#2 superseded the engine-class gate AND the services router → the
dedicated `local_facts` lane + non-frozen local consumer + LANE-keyed gate + lane↔engine DB
CHECK**; #3 the DB-enforced attribution write-gate; #4 FOR-UPDATE window serialization; #5
whole-entry constraint; #6 direction-aware account_matched; #7 `_approve_entry_core` lockdown;
#8 merge-retires-autopost; #9 tie-on-facts before rounding; #10 `sst_output` marker; #11/#12)
→ PROBE BATTERY 8/8 SUPPORTED + P12 (0 refuted; P9 deferred-to-build; the `fixture-engine`
finding folded to companion S1) → consolidated delta-ratification: **WA2-R12 resolved (bounds
final, intelligent proposals, no widening rate-limit) + WA2-R14 (consent scoped to cross-border
egress) + RATIFIED.** Review/probe evidence: `docs/plan/research/wave-a2/`.
Companion: `wave-a2-migration-0015-design.md`. Grounding evidence: `.tmp/wave-a2-briefs/A–I`
(9 lanes, 2026-07-21). ADR-025 (the wave-insertion + auto-post-law scoping ADR) lands with the
design PR.

**One line:** complete the daily loop's transaction symmetry — the AR half WA-R1 carved out of
Wave A — plus MyInvois UBL XML file-upload as a local no-egress structured engine, SST-split
capture and posting, credit/debit-note posting, human-signed bounded auto-POST (standing rules),
and the R2 off-site backup wiring as a parallel ops lane.

---

## §1 Owner rulings (WA2-R1..R13, taken 2026-07-21 — binding)

| # | Ruling |
|---|---|
| WA2-R1 | Target = the sales-invoice/AR wave, inserted BEFORE Wave B. Bundle: standing rules + R2 wiring. Deferred: multi-currency (→Wave C), MyInvois API pull + issuance, SST-02 engine (→Wave F). |
| WA2-R2 | Intake = PDF/image via the existing pipeline + MyInvois **XML/JSON file-upload** parsed locally. No MyInvois API, no issuance. (Promotes PRD Track-C "contract-only" to real — recorded in ADR-025.) |
| WA2-R3 | Eval corpus = `Rome Properties YA2025 Files` (local). This wave replays the 6 sales invoices + 6 JVs. The payroll subtree (incl. the IC copy) is **never uploaded or egressed** (S6-R1 consent exclusion); aggregate salary JVs are books vouchers, in scope. |
| WA2-R4 | **SST: build the full 3-leg split NOW** (owner override of the defer recommendation; the eval corpus carries zero tax → the rig battery + SDK fixtures carry the proof). |
| WA2-R5 | XML fixtures = **official LHDN SDK samples only** this wave. Residual: the parser ships spec-conformant but unproven against a real validated e-invoice until first live use. |
| WA2-R6 | R2 backup host = a **separate Fly app in `sin`** (always-on; custody tradeoff accepted: that app holds the near-admin DSN + service_role key as Fly secrets; NEVER the non-HA runtime machine). |
| WA2-R14 | **Consent re-scope RATIFIED (delta-ratification 2026-07-21, resolving review M1):** WA-D1's consent gate is scoped to CROSS-BORDER EGRESS. A locally-parsed document (the `local_facts` lane — nothing leaves the box) skips the per-client consent hold; every Azure/OCR path keeps it unchanged. Residual recorded in ADR-025: a locally-parsed e-invoice's customer PII lands in the DB without a consent row — governed by RLS + the books' controls, not the egress registry. |
| WA2-R7 | **Standing-rules authority model RATIFIED:** the rule's human signature IS the posting authority; a new audited DB function posts matching routine entries citing the rule; the agent never signs — it (or a sweep/consumer) only triggers; high-stakes + out-of-bounds structurally refused; every auto-post lands in a visible posted-by-rule feed and is reversible. Conditions: the authority stays **Layer-2-typed forever** (the Wave-B wiki may cite a rule, never create/widen/trigger one), and ADR-025 scopes the older "no auto-approve ever" wording to "no *unbounded/agent-initiated* auto-approve." |
| WA2-R8 | Posting-tier rule **sign rank = admin+** (bookkeepers may propose and benefit, never sign). |
| WA2-R9 | **Self-growth enabled** with structural safeguards: the agent proposes new posting-tier rules / widenings from **human-approved sighting evidence only**; a higher evidence bar than the 3-sighting account-choice floor; every widening = retire-old + fresh signature on a NEW row (append-only genealogy, never an edit); cap-growth rate-limited at sign time. |
| WA2-R10 | **Hard expiry**: `expires_at` is a hard DB bound — posting stops at expiry, no exceptions; a renew-or-retire nudge surfaces beforehand; renewal = a fresh signature. Never auto-renew. |
| WA2-R11 | **Credit/debit notes: build CN/DN posting NOW** (owner override; zero eval coverage → same rig-fixture mitigation as R4). |
| WA2-R12 | **RESOLVED at delta-ratification (2026-07-21):** KEEP the cap ceiling (min(rule cap, firm high-stakes threshold)), the monthly window limit, and the hard 12-month expiry + nudge. **DROP the sign-time widening rate-limit** (every widening already requires retire-old + a fresh admin signature — that is the control). **The proposal evidence bar is INTELLIGENT, not mechanical:** the agent proposes HIGH-CONFIDENCE autopost rules using professional accounting judgment + knowledge-lifecycle confidence mechanics (source count, recency, contradiction status — the owner's KB philosophy; KB-informed once Wave B lands), citing human-approved evidence; the only mechanical floor is a minimal gaming guard (≥3 congruent human-approved sightings cited). Authority unchanged: proposals advisory, wiki informs-never-decides, admin+ signature is the sole posting authority. |
| WA2-R13 | Eval customer identity: "D & DREAM PROPERTIES SDN BHD" (Apr) and "DARE TO DREAM REAL ESTATE SDN BHD" (May–Sep) = **ONE customer renamed**; the April name becomes a `former_name` alias — a deliberate alias/merge eval case. |

## §2 Scope

**In:** AR facts vocabulary + direction; the sales-invoice coding lane; customer counterparties
(birth-at-approval mirror); AR control account + receivable shape floor; SST 3-leg split; CN/DN
posting; the MyInvois XML local engine (upload → parse → facts + attribution); the egress-class
claim-gate CoR; posting-tier standing rules end-to-end (tables, lifecycle, executor, feed,
self-growth); queue/doc_review/card extensions; the RPR sales+JV replay eval; the R2 wiring lane.

**Out (recorded deferrals):** MyInvois API pull / issuance / authority(UUID) verification;
multi-currency; SST-02 returns engine; AR open-item/payment settlement + aging tables (Wave C
brings receipts; aging stays derivable from counterparty-tagged lines, as AP does); a posting-
period/lock-date gate (still absent system-wide — pre-existing, noted, not this wave); JSON-binding
MyInvois uploads (XML only in v1 — the UBL-JSON binding is deferred; `detectDocument` has no JSON
path); Azure `Items[]` line-item facts.

## §3 Facts & engines (the MyInvois XML lane + AR vocabulary)

### §3.1 The two-extraction model (mirrors AP's two-pass shape; kills the TIN-inversion risk)

An uploaded MyInvois XML produces **two lifecycle-separated extractions** (review L4: two
parses at two lifecycle points — the identity pass at ingest, the facts pass as a separately
enqueued + separately gated task), exactly parallel to AP's ocr-then-invoice_facts pair:

1. **Identity pass** — `engine_kind='structured_parse'`, engine `clara-myinvois:v1`. Emits ONLY
   the parties' identity regions with deliberate field_paths:
   - `myinvois.supplier_tin`, `myinvois.supplier_brn` — MATCH the attribution patterns
     (`%tin%`/`%ssm%`); the supplier of a sales e-invoice IS the client, so these attribute.
   - `myinvois.buyer_id_*` — deliberately named to NEVER match `%tin%`/`%ssm%`/`%account%`
     (e.g. `myinvois.buyer_id_primary`); the buyer's TIN must never attribute a client.
     **Naming alone is runtime discipline, not structure (adversarial #3):**
     `persist_document_extraction` writes structured_parse field_paths VERBATIM (0007:2190-2194,
     no whitelist), so the buyer-exclusion is made **DB-enforced**: the 0015 CoR adds a gate —
     for `engine_kind='structured_parse'`, any region whose field_path matches the attribution
     patterns must be ON the DB attribution-vocabulary allowlist
     (`myinvois.supplier_tin`, `myinvois.supplier_brn`) or the write REFUSES. A crafted XML or
     buggy mapper can then never smuggle a buyer TIN into an attribution-visible name.
     Recorded residual: the OCR lane shares the verbatim-field_path trust model today (inherited,
     pre-existing) — the new gate covers structured_parse; hardening OCR is a named follow-up,
     not silently claimed.
   - AB-3 stays intact: `record_rule_resolution` already reads
     `engine_kind in ('ocr','structured_parse')` (0011:47) — no predicate change; the 0015
     migration re-runs the AB-3 probe + adds a **field_path collision assertion** for the new
     vocabulary (0013's "AB-3 SAFETY" pattern).
2. **Facts pass** — `engine_kind='invoice_facts'`, engine `clara-myinvois:v1`, on a **NEW
   dedicated task lane `local_facts`** (adversarial #1/#2 — see §3.4: runtime dispatch is
   LANE-based and engine-blind, so a local facts task must never share `lane='invoice_facts'`
   with the frozen Azure consumer). It is claimed by a **new non-frozen matcher-pattern
   consumer** (plain lib code, the `record_rule_resolution`/matcher precedent — a local
   deterministic parse needs no durable WDK workflow, so NO frozen file exists on this path at
   all). `persist_invoice_facts` + `_invoice_fact_state` CoR to accept both facts lanes.
   The facts pass carries the full vocabulary (§3.2) incl. customer identity — attribution-
   excluded because `engine_kind='invoice_facts'` sits outside the AB-3 matcher predicate.

Both passes run in the existing **local worker thread** (`structured-worker.mjs` gains a UBL
branch; namespace-aware parse; XXE defense already present — `assertNoEntities`). `laneSnapshot`
flips `xml` from `lane='none'` to `structured_parse` **with a MyInvois-specific engine snapshot**
(`clara-myinvois:v1`, not the generic `clara-structured:v1` — review L7); the frozen
`documentIngest_v1` body is untouched (it already dispatches `structured_parse` to the local
parser). The facts pass is enqueued from the DB onto the NEW `local_facts` lane and claimed by
the new non-frozen local consumer — **the frozen Azure consumer can never see it, because
dispatch is lane-based** (`reconciler-documents.mjs:36` routes `invoice_facts` → the frozen
`invoiceFacts_v1`, everything else → `documentIngest`; the new lane gets its own route). This
supersedes the earlier services-layer-router idea (native C1): the frozen consumer's claim
receipt carries NO engine_id (behavior.mjs:84-95), so an engine branch downstream of the claim
was unsound — lane separation is the structural fix. A rig assertion still proves no local task
can reach any egress code path (`egress.mjs` / `*.azure.mjs`), and CI hash-diffs every frozen
body (untouched).
`document_kind='e_invoice_xml'` (the reserved 0007 slot) is stamped by the facts writer.
**Attribution honesty (L1):** only the SALES direction auto-attributes (supplier TIN = the
client); a purchase e-invoice (client is the buyer) does NOT auto-attribute — `buyer_id_*`
deliberately avoids the matcher patterns — and falls to human filing, mirroring AP today.
Parser conventions: `value_raw` byte-for-byte (DB owns cents); `page:1, polygon:[]` honest
markers; UTC→MYT date derivation; reject mixed/non-MYR `@currencyID` to the refusal lane;
strip the XAdES block before content-hashing; consolidated e-invoices (General TIN
`EI00000000010` / class `004`) → non-attributable, refused to NEEDS YOU.

### §3.2 Facts vocabulary extension (0015 whitelist CoR + mapper bumps)

Existing 8 keys unchanged. New keys (monetary keys cents-normalized by the DB only):

| Key | Class | Source |
|---|---|---|
| `invoice.customer_name` | identity | UBL buyer `RegistrationName` / Azure `CustomerName` |
| `invoice.customer_registration` | identity | UBL buyer BRN·NRIC / Azure `CustomerTaxId` (via `looksLikeRegistration`) |
| `invoice.customer_taxid` | identity | UBL buyer TIN (name deliberately avoids the `%tin%` pattern; lives only in invoice_facts rows regardless) |
| `invoice.type_code` | code | UBL `InvoiceTypeCode` (01/02/03/04/11–14); absent for OCR docs (CN inference stays `isCreditNote`) |
| `invoice.total_excl_tax` | monetary | UBL `TaxExclusiveAmount` / Azure `SubTotal` |
| `invoice.tax_total` | monetary | UBL `TaxTotal/TaxAmount` / Azure `TotalTax` |
| `invoice.tax_breakdown` | json-code | UBL per-type `TaxSubtotal` array, serialized `[{type,rate,taxable,amount,exempt_reason}]` — header-level v1; a child table is deferred until a real multi-type client needs it |
| `invoice.myinvois_uuid`, `.myinvois_longid` | provenance | envelope, when present — recorded as **authority-unverified** (no API check this wave) |

Azure mapper → `NORMALIZATION_VERSION` v5 (adds Customer*/SubTotal/TotalTax mapping). New
`invoiceFacts` MyInvois mapper (not frozen) mirrors it. Neither touches frozen bodies.

### §3.3 Direction — DB-determined, never mapper-asserted

Direction is **client-relative** (a document can be filed to multiple clients), so it does NOT
live in the client-agnostic `_invoice_fact_state(p_document)` (review H3 — adding a client
there would break the same-arity law). A new private helper
**`_document_direction(p_document, p_client)`** computes it: if the document's supplier
identity (`invoice.vendor_name`/`vendor_registration`, or `myinvois.supplier_*` normalized)
matches THAT client's own `client_identifiers`/registered name ⇒ **`sales`** (counterparty =
the customer facts); otherwise ⇒ **`purchase`** (counterparty = the vendor facts, as today).
Ambiguous/contradictory ⇒ direction-unresolved → NEEDS YOU (CLR30). The client-aware callers
(`_coding_lane_core`, `_draft_entry_core`, `approve_entry`) call the helper and branch;
`_invoice_fact_state` stays client-agnostic and same-arity. The agent never picks a side.

### §3.4 The egress claim gate stays LANE-keyed (security-critical CoR)

**Adversarial #1/#2 superseded the engine-class idea entirely.** Three source facts force it:
runtime dispatch is LANE-based and engine-blind (reconciler-documents.mjs:36; the frozen
consumer never reads engine_id); `engine_id` is a FREE caller parameter of
`finalize_document_intake` (0007:1977-1979) with no lane↔engine binding; so any engine-derived
class (prefix OR allowlist) is spoofable at intake and disagrees with what actually runs. The
design therefore keeps the gate keyed on **`lane` — the dispatch key, which structurally IS the
code path**:

- Egressing lanes = `ocr`, `invoice_facts` (the two Azure consumers): kill-switch + (for
  invoice_facts) per-client consent holds, byte-identical to as-built.
- Local lanes = `structured_parse`, `local_facts`, `none`: no kill-switch hold (they cannot
  egress — the worker thread and the local consumer have no vendor adapter), no consent hold
  (**the WA-D1 re-scope: OWNER RULING REQUIRED, review M1**). Freeing `structured_parse` from
  the kill-switch is a deliberate, declared change from as-built conservatism (it has never
  egressed; Lane-B-verified).
- **A new DB CHECK binds lane↔engine** (adversarial #2): `lane in ('ocr','invoice_facts') ⟹
  engine_id LIKE 'azure-%'`; `lane in ('structured_parse','local_facts','none') ⟹ 'clara-%'` —
  asserted in the migration tail, so a mis-declared task refuses at insert, not at claim.

Cross-model review is mandatory on the gate CoR + the lane CHECK + the new local consumer.

**RESOLVED — WA2-R14 (owner delta-ratification 2026-07-21):** consent is scoped to
CROSS-BORDER EGRESS; the local lane skips the consent hold, every Azure/OCR path keeps it
unchanged. ADR-025 records the residual: a locally-parsed e-invoice's customer PII lands in
the DB without a consent row — governed by RLS + the books' controls, not the egress registry.

### §3.5 Corroboration tiers

- OCR-sourced sales invoices (the whole RPR eval): the existing polygon Tier-A applies unchanged,
  reading the sales-side totals.
- Structured-source facts (MyInvois): a **structured Tier-A** — schema-parsed + the arithmetic
  tie holds in the DB (`total_excl_tax + tax_total (+ rounding) = total`; Σ tax_breakdown =
  tax_total) + single-doc + MYR + type_code ∈ {01} ⇒ corroborated without geometry. The
  empty-polygon wall stays for OCR engines (an OCR guess without geometry still never
  corroborates). CN/DN (02/03) and self-billed (11–14) are corroboration-ineligible for the
  invoice-total equation but carry their own tie checks. **Build honesty (review M3):** this is
  a substantial CoR of `_invoice_fact_state` (the polygon requirement is hardcoded, 0009:185-188,
  and the fn is called from approve/lane/dup) — the OCR path must stay byte-identical, proven by
  rig exact-diff on the RPR polygon corpus; the engine branch applies only to `clara-*` facts.

## §4 AR books core

### §4.1 Chart + control accounts

- `coa_accounts.account_class` CHECK widens to `('payable','receivable')`; **`300-000 TRADE
  DEBTORS`** promoted for RPR via the onboarding CSV (`origin=system_role`, owner-signed row —
  the exact 400-000 pattern; RPR's GL already reconciles through this code). Revenue accounts
  exist (500-000/530-000). **SST-payable**: a liability account carrying a definite chart
  marker — `special_acc_type` gains `'sst_output'` (adversarial #10: "a plain liability
  account" gives the shape floor no predicate; the marker mirrors `special_acc_type='rounding'`
  discovery, at most one per client) — added to the CSV template (not seeded for RPR — their
  books show none); the SST split refuses with `sst_account_missing` when a tax-bearing invoice
  meets a chart without one.
- The control-class rule generalizes: **any control-class line (payable OR receivable) requires
  a `counterparty_id`** — one generic assertion superseding the payable-only wording, same CLR23
  errcode surface.

### §4.2 Customers = counterparties with `kind='customer'`

Widen the `kind` CHECK; make BOTH uniqueness indexes kind-scoped (a vendor and a customer sharing
one SSM under a client are two rows — matching separate AR/AP subledger practice). Aliases,
`rename_counterparty`, `_canonical_counterparty` are kind-agnostic and reuse unchanged.
`merge_counterparties` needs ONE CoR (adversarial #8): as-built it retires/reissues only
`vendor_account` rules (0011:1868-1869) — it must also RETIRE the merged party's live
**autopost** rule (posting authority must never dangle on a retired identity; an optional
proposed successor on the survivor mirrors the vendor_account behavior). `_resolve_counterparty` gains a `p_kind` discriminator (registration-dominant
logic identical per kind). `approve_entry`'s birth branch births `kind` per the entry's
coding_kind (customer for sales_invoice) — same atomic birth+approve, same race handling.

### §4.3 Sales-invoice coding + shape floor + CN/DN

- `journal_entries.coding_kind` CHECK gains `'sales_invoice'` and `'sales_credit_note'`
  (debit note = a `sales_invoice` with the DN type code; it raises AR like an invoice).
- `_draft_entry_core` branches on coding_kind: sales requires document + **customer** proposal +
  evidence; the sales shape floor (`_assert_sales_invoice_shape`, trigger-fired at approve like
  AP's). **The tie equations, pinned (adversarial completeness + #9):**
  - `sales_invoice` (type 01, and DN type 03 — a debit note RAISES receivable like an invoice):
    receivable-debit = gross_fact; Σ revenue-credits (accounts `account_type='income'`) =
    net_fact; sst_output-credit = tax_fact (3-leg when tax facts exist; 2-leg with
    sst_output-credit = 0 when absent).
  - `sales_credit_note` (type 02): exact mirror — receivable-CREDIT = gross_fact, revenue-DEBIT
    = net_fact, sst_output-DEBIT = tax_fact. CN posting never requires the original invoice
    in-books (greenfield replay) but records `BillingReference`/inferred linkage as evidence.
  - **The tie is evaluated on STATED DOCUMENT FACTS, ordered BEFORE the generic ≤5-sen rounding
    append** (adversarial #9: otherwise a ≤5-sen `net+tax≠gross` mismatch silently drifts into
    the rounding account instead of surfacing `tax_tie_failed`; the rounding leg may absorb only
    a residual that the FACTS themselves declare, e.g. `PayableRoundingAmount`).
  - Every receivable line carries the customer (the generalized control-class rule).
- `_coding_lane_core` extends with the direction branch (§3.3): sales-direction filings read
  customer facts, resolve the customer counterparty (registration-dominant; name fallback), and
  reuse the same lane reasons (consent, tier-a, near-dup by customer+date/total, high-stakes,
  open-question). **Sales duplicates get the SAME hard approve-time refusal AP has** (review
  L3): a second sales invoice for the same customer + invoice number (or same date+total) on an
  approved entry refuses at approve (CLR21 family, override-able like `duplicate_bill`) — not a
  soft lane reason only. `get_doc_entry_diff` gains the receivable branch. **Kind-scoping lands
  atomically (review M5):** every `_resolve_counterparty` lookup block gains the kind filter AND
  both `approve_entry` hardcodes generalize (birth-kind per coding_kind; counterparty stamping on
  payable OR receivable lines) in the same migration; probe P3 rigs the vendor+customer
  shared-registration case.
- `je_review`, `/queue`, revisions, diffs, rounding auto-append, reverse-not-delete: reused
  unchanged (Lane D/E confirmed entry-generic).

## §5 SST split (WA2-R4)

The tax amounts are **document-stated facts** (§3.2) — never computed by agent or mapper; the DB
validates the tie and the 3-leg shape (§4.3). Refusals: arithmetic mismatch → `tax_tie_failed`
(NEEDS YOU); tax facts present but no SST-payable account → `sst_account_missing`; exemption
type `E` → 2-leg with the exemption recorded as evidence. Rig battery: synthetic SST fixtures
(8% service tax, exempt-E, mixed-type breakdown, rounding-line) + the SDK sample XMLs. The
SST-02 engine (returns, payable settlement) stays Wave F.

## §6 Standing rules — posting tier (WA2-R7..R10)

### §6.1 Objects

`coding_rules` gains `rule_type='autopost'` rows (distinct tier; the account-choice
`vendor_account` type is untouched) with NOT NULL bound columns for that tier:
`amount_cap_cents`, `frequency_window` (e.g. `monthly`: at most N posts per window —
count-bounded), `window_max_posts`, `expires_at` (hard), `direction` (purchase|sales),
`account_code`. One live autopost rule per (client, counterparty) — **already enforced by the
existing `uq_coding_rules_one_live_vendor (client, counterparty, rule_type) where status='live'`
index (adversarial #12: no new index needed; direction follows the counterparty's kind under
kind-scoped counterparties)**. Bounds are **immutable once live** (trigger refuses UPDATE on
bound columns of a live row); widening = retire + a NEW signed row citing the predecessor
(`supersedes_rule_id` genealogy). Sign-time rate-limit: a successor cap ≤ 2× the predecessor's
within 30 days unless the signer is owner-rank.

### §6.2 Lifecycle

Propose — **intelligent, not mechanical (WA2-R12 as resolved):** the agent proposes an autopost
rule when its professional-accounting judgment assesses the behavior as HIGH-CONFIDENCE routine
(knowledge-lifecycle confidence mechanics — source count, recency, contradiction status; KB
signals consumed as advisory input once Wave B lands, per the R7 condition the wiki informs but
never creates/widens/triggers). Structural floor (the gaming guard, DB-enforced): every
proposal must CITE ≥3 congruent human-approved unreversed sightings (the H2 filter applies —
`checked_via_rule_id is null`, never the rule's own output); the confidence rationale is
recorded on the proposal payload for the signer. Human-author path unchanged. → **sign
(admin+)** via `sign_autopost_rule` (distinct fn; re-verifies account postable, bounds sane,
one-live) → live → hard-expire / retire / supersede. Widening = retire + a fresh admin-signed
successor row (the `supersedes_rule_id` genealogy); **no sign-time cap-growth rate-limit**
(WA2-R12: the fresh-signature requirement IS the control). Expiry sweep flips expired rules terminal + raises a
renew-or-retire notification (never silent, never auto-renew). Non-use nudge at ¾ of the term.
Nudge/notification delivery surface (review L6): `record_notification` (the existing
notifications table) AND a /queue affordance on the rules surface — both, so it is actually seen.
The wiki (Wave B) may cite rules; nothing outside these typed rows creates, widens, or triggers
one (ADR-025 condition).

### §6.3 Executor — the spine-consumer shape (T1/T2 resolution)

A new DEFINER fn **`execute_rule_post(p_entry, p_op_key)`**:

- **Granted LOGIN-DIRECT to `clara_runtime_login` only** — the exact `record_rule_resolution`
  precedent (0011:128-133): NOT granted to the agent pool role, NOT a wake entry, asserted
  ungranted to `clara_runtime`/wake roles in the migration tail. Invoked by a new spine consumer
  on `entry.drafted` events (matcher pattern, idempotent op-key `rulepost:<entry>:<revision>`).
- Eligibility gate (all structural, in-fn, **everything RE-DERIVED against live rows at
  execution time — never trusted from a draft-time flag** (review H1+H4)): `execute_rule_post`
  matches the LIVE `autopost` rule DIRECTLY (`client + counterparty + direction`, `status='live'`,
  `for share`) — it does NOT depend on a pre-written `rule_decisions` row (as-built,
  `_draft_entry_core` writes decisions only for `vendor_account` and the table is unique per
  (entry, revision) — the decision-citing shape would never fire). In-fn re-derivations:
  `account_matched` — **direction-aware** (adversarial #6: purchase ⇒ the rule account carries
  the DEBIT side; sales ⇒ the CREDIT side — the as-built debit-only test would never fire for a
  revenue account); **the whole-entry constraint** (adversarial #5: EVERY non-control,
  non-rounding leg must hit the rule's account — effectively 2-leg entries + the auto rounding
  leg — so a rule signed for account A can never launder a split into unrelated accounts under
  the cap); NOT `is_high_stakes` (re-checked hard); total ≤ `amount_cap_cents`; the window
  count < `window_max_posts` **under `SELECT … FOR UPDATE` on the `coding_rules` row taken at
  the top of the fn** (adversarial #4: a bare count is race-prone — the row lock makes
  count-and-post atomic per rule); rule unexpired NOW; entry revision current. A
  `rule_decisions`-style snapshot of the matched rule is written AT POST TIME for the audit
  join.
- It then calls the **`approve_entry` core** through a new internal context path: the full
  predicate wall (CLR21/25/26, consent, attribution, shape floors, dup) runs through-the-core,
  never around it (T4) — with ONE explicit, declared carve-out (review H2): **the
  sighting/auto-proposal block runs ONLY on human approvals** (skipped when
  `checked_via_rule_id is not null`), and every sighting-pool query for autopost proposals
  filters to human-checked entries — otherwise rules breed rules from their own output,
  violating WA2-R9. So the core is verbatim for the predicate wall, and deliberately NOT
  verbatim for evidence-generation. `checker_actor = rule.signed_by`,
  `checked_via_rule_id = rule.id` stamped (a new column; maker=agent stays maker; the signature
  carries the checker authority per WA2-R7). `journal_entry_revisions` gains `actor_kind='rule'`.
- Failure of any gate = a quiet no-op (the draft simply stays in the queue for humans) plus a
  `rule_post_skips` reason row — never an error loop. **This skip discipline also covers
  core-raised race exceptions** (review M2): `execute_rule_post` wraps the core call and converts
  the benign race codes — CLR10 (no longer a draft: a human approved/withdrew concurrently) and
  CLR06 (stale revision: facts rotated) — into `rule_post_skips` rows; any OTHER exception
  propagates honestly.

**ADR-025 scoping (required, honest — review H4):** ADR-015's "no wake approve —
agent-never-signs is the absence of an entry point" is PRESERVED (no wake/agent role gains
approve; the agent role gains ZERO EXECUTE). But the ADR must own plainly that this grant moves
POSTING authority (not merely attribution, as `record_rule_resolution` did) onto
`clara_runtime_login` — the trusted runtime substrate identity — and that "reachable only by
the spine consumer" is runtime-code discipline, NOT the structural wall. The structural wall is
the **in-fn eligibility gate set** (everything re-derived live: high-stakes, cap, window,
direction, account, expiry, revision) bounding the blast radius of even a compromised runtime
process to "replay a human-signed bounded rule within its bounds." The migration tail carries
the isolation matrix (NOT executable by `clara_runtime`, any wake role, `clara_agent_ro`,
`clara_authenticated`, PUBLIC — the 0011 pattern) — **and the same zero-grant lockdown on
`_approve_entry_core` itself** (adversarial #7: the split creates a DEFINER fn whose ctx
carries `checker_actor`; reachable by ANY role it is a forged-approval bypass of `_human_ctx` —
`revoke all from public` + tail-assert ZERO grants, the `_open_question_core` precedent). A
further tail assertion: a HUMAN approve always leaves `checked_via_rule_id` NULL (adversarial
#11) — only the rule path sets it. "No auto-approve ever" (Wave-A contract §11) is scoped to
"no unbounded/agent-initiated auto-approve."

### §6.4 Feed + acknowledgement + reversal

Every rule-post lands in **`rule_post_runs`** receipts (sweep_runs pattern): visible in /queue as
a "Posted by rule" section, bookkeeper+ acknowledgement floor (`acknowledge_rule_posts`, agent
identities hard-refused, CLR03 pattern), reverse-not-delete as the only correction path. A typed
`entry.rule_posted` event.

### §6.5 Bound defaults (RESOLVED — WA2-R12, delta-ratification 2026-07-21)

- `amount_cap_cents` ceiling: **min(rule cap, firm high-stakes threshold)** — a rule can never
  cap above `high_stakes_amount_cents` (structural; the high-stakes refusal makes >threshold
  unreachable anyway, this makes the bound visible at sign time). Stated consequence (review
  L2): SST-bearing entries are structurally non-autopostable if `tax_affecting` is set (it
  feeds `is_high_stakes`) — deliberate and recorded, not an accident.
- `frequency_window='monthly'`, `window_max_posts=3` default.
- `expires_at` default: **12 months** from signing; non-use nudge at 9 months. Hard expiry.
- Proposal evidence: intelligent high-confidence judgment (§6.2) over a **≥3
  human-approved-sightings structural floor**. NO sign-time widening rate-limit (dropped —
  fresh-signature-per-widening is the control).

## §7 Dashboard

- `/queue`: sales drafts flow through the existing sections unchanged (row shape already
  polarity-agnostic); a "Posted by rule" receipts section + acknowledge action; batch approve
  untouched.
- `doc_review`: XML documents get a **structured-document view** (parsed field table + raw XML
  `<object>` fallback; no canvas — geometry-less facts show the honest `no_region` marker).
- Cards: `je_review`/`doc_review`/`diff` reused; new `rule_post_receipt` part (union + catalog +
  render branch + pinned hydrate fn, the compile-guarded 3-file pattern); the rule sign/retire
  surface = PostgREST `rpc()` (static-export constraint holds).

## §8 R2 wiring lane (parallel ops — WA2-R6)

A separate Fly app (`clara-backup`, `sin`, scheduled daily): image = pg17-client + age + rclone +
node; runs `db:backup:full` + globals + auth-data dump + the firm-docs byte mirror (Storage REST)
→ zstd → age (recipient key in repo; identity key = owner custody, off-repo/off-R2, multi-
recipient rotation) → `rclone sync` to the R2 bucket (single synced mirror prefix + 30-day dump
snapshots; R2 lifecycle pruning) → success ping. Alarm = **healthchecks.io primary (26h grace,
`tools@belcort.com`)** + a CF Worker freshness cron over the bucket as corroboration. Secrets =
Fly secrets on the backup app only (session-pooler DSN port 5432 + service_role key + R2 token +
ping URL). Verify cadence: monthly light restore into a local throwaway PG17; quarterly full
STRICT drill (existing DR.md §5b recipe). Owner inputs at wiring time: bucket + scoped token,
age keys, ping URL. All live-credential steps owner-run per the classifier pattern.

## §9 Eval + acceptance gates (RPR FY2025)

Greenfield sales replay on live (BELCORT/RPR, consent already live):

1. Upload the 6 sales-invoice PDFs → OCR → facts (mapper v5 emits customer fields) → direction
   resolves to `sales` (supplier = ROME PROPERTIES = the client) → customer lane → drafts →
   human approve (batch where routine; note invoices 1–6 all exceed RM10k high-stakes default →
   attested/distinct-checker approvals — a deliberate exercise of the high-stakes lane on AR).
2. **Gate A (exact):** `300-000` receivable debit total = Σ invoices = **RM 1,973,332.91** =
   `500-000` revenue credit total = the management-accounts P&L revenue. Customer identity
   resolves to ONE counterparty (Dare To Dream) with the April name as a `former_name` alias
   (WA2-R13) — the alias path exercised, not bypassed.
3. **Gate B (JVs, zero new build):** the 6 JVs replayed via chat → `je_review` → approve;
   salaries tie **RM 405,000**, EPF-er 52,200, SOCSO-er 2,187.15, EIS-er 249.90, share capital
   1,000 — all exact against the management accounts.
4. **Gate C (XML lane, rig-level per WA2-R5):** the LHDN SDK sample set (standard, consolidated,
   credit-note samples) parses to facts; arithmetic ties enforced; consolidated refused
   non-attributable; the two-extraction attribution proof (supplier TIN attributes on a synthetic
   client whose identifier matches; buyer identifiers NEVER attribute — the inversion test).
5. **Gate D (rules, rig + live-smoke):** a signed autopost rule on a synthetic routine vendor
   posts within bounds through the full predicate wall; out-of-bounds/high-stakes/expired/
   cap-exceeded each refuse; the feed + acknowledgement + reversal round-trip. (RPR's own books
   stay human-approved this wave — no live auto-post on real books until the owner signs a real
   rule post-deploy.)
6. **Rig batteries:** SST fixtures (WA2-R4) + CN/DN fixtures (WA2-R11) — full 3-leg/contra
   coverage the eval corpus cannot supply; contract-blind rig per house pattern.

Corpus notes of record: RPR AP-control turnover is RM 1,353,183.61 (the Gate-3 RM 1,350,938.21
was the 17-bill subset; Δ = 2,245.40 = the Dec strike-off Kok Liong bill, absent from the corpus
folder — the future full-replay north star needs that document or accepts the recorded delta).
The north star (full TB tie incl. bank receipts driving every BS account to 0) closes in Wave C.
The eval must also surface the professional flag: no SST charged on >RM500k Group-G commission —
an agent edge-case-visibility assertion, not a booked figure.

## §10 Invariants preserved

The four structural invariants unchanged (attribution ≥0.95 — the XML identity pass feeds the
same `record_rule_resolution` gate; provenance binding untouched; wake allowlists untouched —
autodraft's 5-fn allowlist gains nothing; write authorization — the agent role gains ZERO
EXECUTE anywhere in this wave). The DB owns every number (all monetary normalization, ties,
direction, and corroboration are DB-side). Workflow bodies immutable — **realized via the
non-frozen seams** (review C1): the MyInvois facts dispatch branches in
`invoiceFacts.v1.services.mjs` (not in the manifest), keeping every frozen body byte-identical
(hash-diff proven); new consumer code is non-frozen lib; the declared escape hatch if the seam
proves insufficient is `invoiceFacts_v2` + registry + `freeze:update`. Reverse-not-delete.
Migrations rig-validated on throwaway PG17.6 before live; 0015 opens by re-asserting the AB-3
probe, and the field_path collision assertion becomes PERMANENT (review L5: every future
migration touching the vocabulary re-runs it + a mapper-level test — the AB-3 boundary IS the
naming convention, so the assertion is that boundary's enforcement).

## §11 Build shape (for the build stage, after ratification)

Interface-pins first (Lane A §7 is the seed), then five contract-blind lanes on the house
ladder: (1) migration 0015 (Codex or native, ~the 0011 pattern); (2) the contract-blind DB rig
battery; (3) runtime — UBL parser branch + MyInvois mapper + mapper v5 + the rule-post spine
consumer; (4) dashboard; (5) the R2 backup app (independent ops lane). Then integration → dual
as-built review (two independent live-verifying lanes) → fix rounds → gates → PR → owner-gated
merge → live deploy ceremony (0015 + runtime image + CSV re-onboard for 300-000) → the §9 eval.

## §12 Open items routed to probes (before build)

P1 the LANE-keyed gate CoR + the lane↔engine CHECK — prove held/claim behavior per lane on a
throwaway (egressing lanes hold under kill-switch=0; local lanes claim; a mis-declared
lane/engine pair REFUSES AT INSERT; the reconciler re-drive path follows lanes). P2 the two-extraction XML parse — prove `record_rule_resolution` attributes from the
identity pass and NEVER from the facts pass (the inversion test). P3 kind-scoped uniqueness —
vendor+customer same-registration coexistence + merge/alias reuse under kind + the M5
resolution-crossing case (a customer proposal must never resolve to a vendor row). P4
`execute_rule_post` — login-direct grant isolation (agent pool + wake roles structurally
excluded), the predicate-wall inheritance, idempotent replay, the revision-rotation race
(facts complete between draft and rule-post → skip, not raise), the concurrent-human-approve
race (CLR10 → skip), and the direct-rule-match eligibility (H1 fix: no rule_decisions
dependency). P5 structured Tier-A — the arithmetic-tie corroboration on SDK samples incl. the
rounding line, AND the OCR-path byte-identical exact-diff (M3). P6 sales shape floor —
3-leg/2-leg/CN polarity + `sst_account_missing` + `tax_tie_failed` + the hard sales dup
refusal (L3). P7 high-stakes attestation on the RPR sales amounts (all six > RM10k) — the
approval ceremony the eval will actually hit. P8 `_coding_lane_core` direction branch — an AP
bill and an AR invoice filed to the same client never cross lanes. P9 the lane separation — a
`local_facts` task is claimed ONLY by the new local consumer and processes fully local
(rig-instrumented: zero calls into `egress.mjs`/`*.azure.mjs`; the frozen `invoiceFacts_v1`
consumer NEVER claims it), while a `lane='invoice_facts'` Azure task still routes to the frozen
consumer; frozen-file hash-diff clean. P10 the H2 carve-out — a rule-posted approval writes NO
sighting and triggers NO auto-proposal; a human approval still does. P11 the #3 write gate — a
structured_parse region whose field_path matches `%tin%`/`%ssm%`/`%account%` but is NOT on the
attribution allowlist REFUSES at `persist_document_extraction`; the two allowed supplier keys
persist and attribute. P12 the #5/#6 eligibility — a 3-way split draft under cap refuses
autopost (whole-entry constraint); a sales rule fires on the CREDIT side; two concurrent
`execute_rule_post` on one rule at window_max-1 post exactly ONE (the FOR-UPDATE serialization).
