# F-A1 annexes — the estate as-built + the PR-0 adjudication register

> Companion of record to `f-a1-witness-pair-design.md` (split out at v3.1 under the
> 500-line harness file limit; the design doc is the law, these annexes are its
> evidence). Annex A is the estate survey the design binds against (verified twice at
> the bytes; live-body provenance stated; the N1/N2 cite fixes applied at the split).
> Annex B is the PR-0-native review's finding-by-finding adjudication (2026-08-18;
> verdict MERGEABLE-WITH-CONDITIONS; every condition folded into the design doc the
> same day). Annex C is the design's §7 test-battery sketch, moved and EXTENDED with
> the PR-0 fold's cells. Wall
> numbers (wall 1–13) and "§7 cell" references in the design doc resolve HERE.
> **Wall 13 was added at the adjudicated PR-1 review (2026-08-18, finding B2): the estate
> survey named the two refusal-code CHECKs but not the row-level UPDATE trigger that owns the
> queued→failed TRANSITION, and the enqueue gate flips a queued task in place.**

## Annex A · The estate as-built

**Data plane.** `documents`: sha256 + storage_path only, no bytes column
(0003:64-77, 0007:53-55). `document_extractions`: append-only-except-one-supersede
(0007:663-676); unique `(document_id, engine_id, version_n, engine_kind)`
(`uq_document_extractions_doc_engine_version_kind`, 0026:225-226; the load-bearing
comment at 0038:1769-1774). OCR raw text lives twice: whole-document
`envelope.content` (egress.mjs:150-156) and per-line `document_regions.text_content`
with page_polygon locators (egress.mjs:113-131; writer 0007:2163-2210). The read seam
is `get_document_extract` — newest done extraction per engine_kind, distinct-on, NO
allowlist (0054:242-245); dense per-call region `idx` (0054:280), UNSTABLE across
generations by documented contract (0054:32-42, 73-81).

**Verdict machinery.** `_invoice_fact_state_at` live body 0023:109-367 (0016:2127
superseded): structured `clara-%` branch geometry-exempt and byte-untouched since;
OCR branch = MYR + geometry + per-field agreement (`outcome='typed_collapsed'`,
0023:215-216, coalesced never-NULL 0023:208-214) + the arithmetic identity + **the
belt set §3.3 must carry in full**: `v_total > 0` · `amount_due` absent-or-equal
(0023:307) · `deposit` absent-or-zero (0023:308) · the ineligibility envelope gate
(0023:309) · net/tax stated-and-single (0023:310-311, the nil-tax law 0023:299-303) ·
`net,tax >= 0` (0023:315-321) ·
the service_charge/discount/delivery sign belt (0023:329-333) · `abs(rounding) <= 99`
(0023:334-341, carrying an EXECUTED forge counterexample) · present-but-unreadable
guards · cardinality guards. Confidence structurally excluded (postverify
0023:1245-1266). The 1-arg resolver `_invoice_fact_state` (live 0016:2259-2273) is
a FLAT select-then-delegate (generation-ordered, `version_n desc`, 0016:2270) joining
`engine_kind='invoice_facts'` + `lane in ('invoice_facts','local_facts')` — "CoR" in
this repo's migration headers means CHANGE OF RECORD, not a dispatch structure; ~30+
live call sites across 0011/0013/0015/0016 (autopost, duplicate walls 0015:1402/1425-1430,
lane routing 0011:1533-1548, tie-outs) reach corroboration ONLY through it — for any
document it cannot resolve it returns `'{}'::jsonb` and every consumer's check
silently passes (law 27(2): a derived absence falls to the permissive branch — the
central hazard §3.3 exists to close). `_write_entry_evidence` (0009:411-472, never
recut) hardcodes `_invoice_fact_state` at 0009:429 and mints tier 'verified' only on
the THREE-term conjunction corroborated ∧ field='invoice.total' ∧ cents-equal
(0009:462-466); `_corroboration_bound` (0009:211-225) requires tier='verified'
(0009:219) and re-derives `_fact_hash` (0009:222-223). The bank side:
`_persist_statement_core` (0038:1385-~1864) — two-reader agreement + CHAIN +
continuity write-time-only under CLR10; persists the pair as TWO rows under ONE kind
distinguished by engine_id with a same-engine_id refusal (0038:1777-1798).

**The walls a new lane must widen or join (live bodies named):**
1. engine_kind CHECK — five values (0038:7254-7259, tail 9226-9228).
2. lane CHECK — eight values (0038:7213-7215, tail 9174-9178).
3. lane↔engine prefix CHECK (0038:7238-7243) — disjunctive arms, unnamed lane refused;
   the `clara-fixture:%` first arm (0038:7239) is lane-blind by design (the rig's door).
4. claim-time gates in `claim_document_processing_task` (live 0038:6839): kill-switch
   triple (0038:6866-6867), legacy purpose-blind consent `lane='invoice_facts'` only
   (0038:6869-6881), **attempt cap** (0038:6907-6910), **concurrency accounting**
   (0038:6929-6931) — each with its own postcheck (0038:6959-6967). Plus two
   lane-sensitive sites the v3 inventory missed (PR-0 M9): the terminal-event case at
   0038:6918-6922 (`statement_facts` → its twin, ELSE the invoice twin — an llm_witness
   attempt-cap failure would fire the invoice event) and the unconditional
   `_refund_processing_call` at 0038:6914 (harmless by bytes — 0038:7128 returns null
   on no reservation). A lane in no list
   egresses with no kill switch and no consent: fail-OPEN by omission (F4 truth table
   0050:33-41, 92-113).
5. `release_held_document_tasks` (live body = 0050's recut of 0038:7143) is NESTED:
   outer lane list (0050:206) + inner kill-switch-only branch `lane in
   ('ocr','statement_facts')` (0050:214) — joining only the outer list stalls held
   witness tasks forever.
6. typed-purpose surface: three relations (0038:5470-5473), purpose CHECKs closed to
   ('wiki_synthesis','statement_extraction') (0038:5503-5505), the per-purpose doc_sha
   arm `ck_egress_dispatch_authorizations_doc_sha` (0038:5539-5544) with 0038:5520-5521
   stating a third purpose "must state its own" rule; drops are BY NAME per the
   0038:5462 contract. The claim body carries NO typed-consent call edge — asserted by
   the ADR-0020 §6 byte-identity battery (0038:6971-6976), which is why the statement
   lanes gate typed consent at ENQUEUE inside `_enqueue_invoice_facts_core` (0038's
   design 4.3/4.4 block). GOVERNED_EGRESS_PURPOSES (egress.mjs:193-206) is stale
   (wiki_synthesis only).
7. TWO refusal-code CHECKs, not one: `ck_processing_task_binding_0038`
   (0038:7298-7306, never-claimed set) AND `ck_processing_task_error_code_0038`
   (0038:7279-7286) — 0038:7200-7205 records that v1 of that design forgot the second.
8. matcher allowlist `engine_kind in ('ocr','structured_parse')` (0011:48, 0015:~430,
   preserved-verbatim comment 0015:401) — witness kinds excluded, fail-closed.
9. metering: `_reserve_processing_call` **live body 0038:7050-7082** (0009:581-610 is
   the pre-0038 body — 0038:8737; recutting from the dead body reverts the statement
   lane, the exact 0050:20-30 incident class); CLR18 on unlisted lanes; ten call
   sites, all enqueue-side, no trigger forces it. The agent token meter refuses
   `refused_budget` (0011:2442+, CLR29) — a shape law 76 forbids for automation.
   No model-usage column exists on document lanes; engine_id/engine_config is the
   stamping slot.
10. `request_reextraction` (live 0026:994-1250, third of three bodies): admission door
    `engine_kind='invoice_facts' and status='done'` (0026:1133-1134) with the receipt
    branch ordered after it (0026:1136); hardcoded retiring engine at 0026:1059;
    human-only triple-held (0022:330, 0025:554-564, 0026:1723); reserves the page
    budget only for `v_lane='invoice_facts'` (0026:1229-1238).
11. the 0017 kind-blind supersede trigger (0017:1506-1547, AFTER INSERT **FOR EACH
    ROW**; tie-break `(extracted_at,id)` at 0017:1532) + its CLR31 pointer consumer
    (0017:1719-1726). Both rows of a one-transaction pair share `now()`, so **the
    witness pair would supersede ITSELF by uuid coin flip** — and `superseded_by` is
    a one-way once-only transition (0007:663-676, CLR08).
12. the ADR-0020 §6 byte-identity battery (packages/db/tests/wave-b/wb-0020-legacy.test.mjs)
    pins `claim_document_processing_task` and `_enqueue_invoice_facts_core` by exact
    prosrc SHA-256 with machine-derived restore pairs — every recut owes a new pair
    under its stated discipline.
13. **the queued→failed TRANSITION ARM in `clara._tf_processing_task_update`** (live body =
    0040 S4.11a's recut of 0038 E2b's recut of 0011:1286; 0042/0044 only NAME it in their
    censuses and 0051 asserts it byte-UNCHANGED twice). **Missing from the v3 inventory and
    added at the adjudicated PR-1 review (B2).** Wall 7 widens the two refusal-code CHECKs so
    the VALUES `witness_consent_inactive` / `witness_multi_client` are storable; this trigger
    is what admits the MOVE. `_enqueue_invoice_facts_core`'s llm_witness gate does not insert
    a fresh row when a queued task already exists — it **flips that row in place**
    (`update … set status='failed', error_code=v_gate … where status='queued'`), and the
    transition table admitted queued→failed only for `('budget','attempt_cap')`, the two
    STATEMENT-scoped gate verdicts (0038 E2b) and lane-scoped `skipped_kind` (0040 S4.11a).
    The flip would therefore raise CLR16 the first time PR-3's router mints a witness task —
    the same half-wall shape 0038:7200-7205 records for the forgotten second refusal-code
    CHECK. The arm is LANE-SCOPED (`new.lane='llm_witness'`) exactly as its two predecessors
    are, so no future writer can flip a queued invoice/classify/ocr/statement task to a
    witness verdict. Shipped in 0090 section 10; battery cell `f-a1.q`.

**Runtime plane.** Frozen closure = @frozen files + RELATIVE imports only; the
adapters/services/reader family are globalThis-injected infra, absent from
frozen-workflows.json — **except `packages/runtime/lib/malaysian-registration.mjs`,
which IS in the manifest** and must not be touched by any retirement sweep. The
behavior triads are frozen AND deploy-locked; registry monotonicity enforced
(check-frozen-workflows.mjs:16-21, 32-35). The LIVE consumers of extraction facts are
frozen bodies: autoDraft.v7.tools.ts:96 filters `engine_kind === "invoice_facts"`;
the stale confidence mirror is autoDraft.v7.tools.ts:73,107 with the load-bearing
`conf >= 0.95` at :110 (live drift, pre-existing).
Provider seam: `resolveModel(modelId)` → `globalThis.__claraModelForTest ??
openai(modelId)`, uniformly OpenAI; no vision/image content-part usage exists in Clara
source (greenfield against AI SDK file parts). Structured-output precedent:
classify-llm.mjs (generateObject, zod, AbortSignal.timeout, no retry). Vision bytes
via `downloadCanonical` (storage.mjs:142-159, hash-verified to local disk). The
classify router and `enqueueForLane`'s EXPLICIT ALLOWLIST
(reconciler-documents.mjs:78-91) are the runtime's lane gate — the allowlist, not the
router's location, is the load-bearing protection.

**Reader lessons that must survive** (behavioural law, not implementation): currency
asymmetry (invoice-currency-reader.mjs:280-306 — confirm-or-refuse, never manufacture);
contest-withdraws (invoice-vendor-identity.mjs:458-472); the CLR23 wrong-counterparty
geometric defense (invoice-vendor-identity.mjs:22-55, 218-236 — §3.3's identity design
succeeds it); statement refusal ORDER (statement-corroboration.mjs:173-202); statement
currency posture is absence→MYR (statement-corroboration.mjs:41-43, WC-R5) — the
OPPOSITE of the invoice posture, preserved as-is; descriptions never load-bearing;
W3 geometry honesty; `invoice-amount-grammar.mjs` is a shared leaf
(opening-tb-grammar imports it) — excluded from retirement.

## Annex B · PR-0 adjudication register (2026-08-18)

The PR-0-native lane (owner-ruled Codex substitution) checked 53 of the design's
cites (51 clean, 1 off-by-one = N1, 1 semantically inverted = B3) and returned
MERGEABLE-WITH-CONDITIONS: 3 blockers, 15 material, 5 nits. Orchestrator
adjudication, each byte-spot-checked where load-bearing:

| id | finding (gist) | adjudication | folded at |
|---|---|---|---|
| B1 | conjunct census dropped 0023:309 (ineligibility gate) + :310-311 (net/tax stated-presence); absence-permissive belts go vacuous under a supplier that CHOOSES what to emit | CONFIRMED at bytes; ADOPTED + the required-answer rule | §3.3 |
| B2 | §3.1 (vision row region-less) contradicts §3.3 ("two persisted row sets") | CONFIRMED; ADOPTED — vision agreement reads the ENVELOPE, 0023's posture inherited | §3.3 |
| B3 | identity self-match term inverted vs 0022:1326-1342 (`v_hard_ok`: vendor_reg==client is POSITIVE sales-direction evidence, not a refusal) | CONFIRMED at bytes; disposition AMENDED — self-referential WITHDRAWAL (polarity-free; the review's document_kind scoping was itself unsound — kind does not encode direction) | §3.3 |
| M1 | BOTH trigger branches are kind-blind | CONFIRMED | §3.9 |
| M2 | pair pointer = uuid coin flip; no stated mechanism; pointer≠envelope-extraction_id conflation | CONFIRMED; writer clock-ordered `extracted_at` + pointer meaning stated | §3.9 |
| M3 | a one-statement pair INSERT supersedes BOTH rows + corrupts the pointer permanently | CONFIRMED; writer = two INSERTs, battery cell added | §3.9 |
| M4 | statement pairs self-supersede TODAY (live production defect, 0038:1781-1797) | CONFIRMED; reframed — PR-4 heals it, PR-1 prestate documents-not-repairs | §3.9 |
| M5 | else-branch kind-scoping under-specified | CONFIRMED; own-kind-max rule | §3.9 |
| M6 | a global `extracted_at` clock can reorder LEGACY generations | CONFIRMED; within-regime key preserved verbatim | §3.3 |
| M7 | v8 kind-widening alone drops the pair (cross-regime `Math.max(version_n)`, :98-99); 0054 publishes no extracted_at | CONFIRMED at :96-110; selection rule stated, PR-1 publishes `extracted_at` | §3.8, §6 |
| M8 | prompt freeze posture undecided | ADOPTED: FROZEN; corpus tuning runs pre-freeze | §3.1, §8 |
| M9 | terminal-event twin unstated; refund call uncovered by §3.6's evidence | ADOPTED as PR-1 obligation (lane-true event, subscriber census decides); N3 clause added | §3.5, §3.6 |
| M10 | llm_witness joins the shared ocr_concurrency cap of 2 | ADOPTED: own counter column; interim contention registered | §3.6, §8 |
| M11 | no field_path census (22 live `invoice.*` paths, 4 unnamed with live consumers) | ADOPTED: PR-1 carries the full census | §6 |
| M12 | CN/DN posture unstated; a witness RELIABLY reports type_code where Azure rarely did | ADOPTED: `type_code='01'` conjunct — CN/DN corroboration-ineligible | §3.3 |
| M13 | cite-verify proves SELF-consistency only (wrong-page equal-amount survives); no locator-class term | ADOPTED: locator term + honest restatement + corpus cell | §3.4, §7 |
| M14 | the vision envelope contends for `get_document_extract`'s 20k char budget | ADOPTED: bound/exclude at PR-1 + a coverage cell | §3.8, §7 |
| M15 | the pair join key is never written out; it INVERTS the statement pair's engine_id discriminator | ADOPTED: key written out with the inversion rationale | §3.1 |
| N1 | 0026:1135 off-by-one (receipt branch is :1136) | fixed | Annex A wall 10 |
| N2 | stale-mirror cite misses the load-bearing `conf >= 0.95` at :110 | fixed | Annex A runtime plane |
| N3 | §3.6's evidence names only `_reserve_processing_call`; the opted-into branch also calls `_refund_processing_call` | fixed (harmless-by-bytes clause) | Annex A wall 4, §3.6 |
| N4 | "six sales/SST keys" mislabels two identity keys | fixed | §3.3 |
| N5 | live envelope has NO vendor_* keys — where does the identity verdict surface? | fixed: witness-regime-only conditional keys; `corroborated` stays an amount verdict | §3.3 |

**B3's amended disposition, in full (the one place the review's own fix was refused):**
the review proposed scoping the self-match refusal by `documents.document_kind`; but the
kind vocabulary (invoice/receipt/…) does not encode purchase-vs-sales direction, and
direction is partly DERIVED from these same signals (0022:1307) — the circularity the
review itself flagged. The adopted shape needs no polarity input: a side (vendor or
customer) whose registration normalizes to the FILING CLIENT's own `client_identifiers`
(kind tin/ssm) is SELF-REFERENTIAL — it is the client's own block, not a counterparty —
so that side is WITHDRAWN from counterparty corroboration (not an error; the region
facts persist per C4 and 0022's direction evidence keeps reading them, 0022:1309-1341).
Both sides matching withdraws both and flags contest. The mislabelled-block defense is
preserved: a witness that cites the buyer's registration as vendor_registration on a
purchase document self-matches and is withdrawn. The wrong-party battery cells and
D12's pre-committed demotion rule stand unchanged.

**PR-1 assembly record (2026-08-18 late night; branch f-a1/pr1, migrations
0089-0095).** Four builder lanes, each rig-green on its own throwaway postgres:17;
adjudications made at assembly: (i) the ONE cross-lane defect — `f-a1-fixtures.mjs`
probed the pre-rename `_0038` constraint names while 0090 renames them to `_f_a1`;
caught by the writer lane's TRUE-merged-chain rig (the predicate lane had validated
against its authoring scaffold, since deleted) and fixed at assembly — the lesson is
the scaffold class itself: a stand-in the real dependency later diverges from. (ii)
The filing-client join (design silence): resolved via `document_filings` live
filings, ambiguity refuses — folded into §3.3. (iii) The M11 census dispositions:
`invoice.contact_person` / `invoice.myinvois_uuid` / `invoice.myinvois_longid` are
persisted-but-unread (allowlist-only, no reader) — RETIRED from the witness schema;
`invoice.tax_breakdown` stays a structured-branch-only key, promotion to a witness
belt is a `_v2` decision. (iv) 0090 ships at 1803 lines under the 0038=9529-line
migration precedent (the 500-line harness hook has no CI gate and self-contained
prestate/tail evidence outranks fragmentation — the predicate lane's 3-way split was
its own equally valid call). (v) `evaluator_versions.migration_version` trued to
`0092_f_a1_predicate` per the 0059 convention; every internal UNNUMBERED reference
renumbered in the claiming commit.

## Annex C · The test battery sketch (design §7; contract-blind cells ▣)

- Writer: idempotent replay returns the stored receipt ▣ · retry replays memoized
  envelopes (no second model call) · equal prompt hashes refused · missing input pins
  refused · conflicting duplicate forfeits within one read ▣ · failed citation
  persists geometry-less · post-persist: neither row superseded, pointer
  deterministic (§3.9) · CLR31 branch shift: an unsuperseded non-pointer row refuses
  `stale_extraction_version`, a superseded row `extraction_not_accepted` (census cell)
  · the pair lands as TWO INSERTs (the writer's real shape) and the one-statement
  multi-row variant still leaves both rows unsuperseded ▣ (M3).
- Predicate: sen-exact agreement corroborates ▣ · one-sen disagreement refuses ▣ ·
  missing region refuses (C2) · transposed net/tax refuses (0023's counterexample) ·
  **the rounding-forge counterexample refuses** (|rounding|≤99 carried) · negative
  component forge refuses (sign belt) · amount_due/deposit belts ▣ · MYR asymmetry ×3 ·
  identity: the wrong-party cell set — buyer-registration-only refuses AND the
  mislabelled-block shape refuses (via the self-referential withdrawal — B3) ·
  sales-doc vendor_reg==client → withdrawn while the counterparty side still
  corroborates ▣ · type_code≠'01' (CN/DN) refuses ▣ · a missing belt answer
  refuses and `not_printed` takes the absence arm ▣ (B1/M12) ·
  cross-regime precedence by `extracted_at` — a witness pair at version_n=1 minted
  AFTER a legacy v3 read WINS, and vice versa ▣ ·
  contest-withdraws · cross-generation pair refused (same task/version_n only) ▣ ·
  never-NULL corroborated ▣ · no confidence token (postverify) · structured branch
  byte-unmoved · resolver dispatch: a witness document resolves through
  `_invoice_fact_state` and the duplicate-bill wall FIRES for it ▣.
- End-to-end evidence: witness pair → cited region → provenance_tier='verified' →
  approve succeeds; and its negative twin (uncorroborated → 'model_read' → CLR21).
- Continuity: a pre-existing invoice_facts document's `_invoice_fact_state` output is
  byte-identical before and after the dispatch recuts (the 0023:357 exact-diff
  idiom) — including a MULTI-GENERATION legacy document (M6)
  · the inlined evidence digest (0009:456-459) and `_fact_hash` agree on one input set.
- Walls: lane/prefix CHECK refusals ▣ · claim holds without the switch · attempt cap
  + concurrency arms exercised nonvacuously · held witness task RELEASES when the
  switch returns (the inner-branch cell) · typed purpose absent → enqueue refusal
  receipt; present-for-other-doc → refused (sha arm) ▣ · OCR region idx pinned
  across a witness persist (the toolface idx→id snapshot-map cell) · region coverage
  across `get_document_extract` does not shrink after a witness persist (M14).
- E2E corpus: the 29-document capture set re-run; corroboration rate MEASURED vs the
  deterministic baseline; the wrong-party set is gating (D12's rule) · the
  wrong-page equal-amount shape rides the corpus (M13).
- Freeze: verify_evaluator_freeze green; FREEZE_GUARDS trips on a doctored body
  (throwaway); wb-0020 restore pairs prove reversal.

**PR-1 adjudicated-review fold (2026-08-18), the cells it added.** Each names the finding it
closes, so a later reader can tell a cell that guards a ruling from a cell that guards a shape:

- **B1 · the three field classes.** C2's geometry conjunct is scoped to the NINE MONETARY belt
  members; `invoice.currency` and `invoice.type_code` are TOKENS whose citation is OPTIONAL and
  which carry no geometry term. The gating cell is a GREEN one: an invoice whose OCR prints only
  `RM 103.75` — no MYR token anywhere to cite — CORROBORATES. Plus: an uncited type_code
  corroborates while an uncited CN still refuses; an uncited foreign token still sets
  `explicit_non_myr`; an unrecognisable token corroborates nothing and is not foreign either;
  and an uncited MONETARY field still refuses, which is what makes the class split the term
  under test rather than a general loosening.
- **B2 · wall 13** (`f-a1.q`): a queued llm_witness task flips to failed on either witness
  refusal code; an unlisted code is still CLR16; the same code on a queued invoice task is still
  CLR16 (the arm is lane-scoped).
- **M1** a cited `invoice.customer_taxid` persists as a verified region (0022:1336-1341 reads it).
- **M2** `"contest":"unknown"` is a structural refusal; boolean and absent are both accepted.
- **M3** the reference-value contract: a quoted `Invoice No.: INV-001` with `value` `INV-001`
  emits `INV-001`; a day-first date rendering plus its `2026-01-15` value emits the ISO form
  (the form the cross-regime duplicate walls compare); disagreeing channels DROP the
  key without touching the amount verdict; a `value` outside its `raw`, a non-existent ISO date,
  and an answer key outside the eleven-plus-two are all refused.
- **M4** the monetary citation match is token-bounded: `1,234.56` cited to `RM 11,234.56` does
  NOT verify (geometry-less), while the same rendering inside `Total: RM 1,234.56` does.
- **M5** parity: `clara.witness_citation_regions(ocr_extraction)`'s whole (idx → region_id) map
  equals what `_witness_resolve_citation` resolves, and is stable across a witness persist.
- **M6** a 30-digit rendering persists geometry-less with NULL cents and the predicate refuses —
  neither side raises 22003; a `raw` over 200 characters is a structural refusal.
- **M7** the identity leaf is `clara.evaluate_witness_identity_v1` with its own manifest entry
  AND its own one-member `clara.evaluator_versions` row (the source-side lint requires a version
  row in the same file for every `clara.evaluate_*` it discovers).
