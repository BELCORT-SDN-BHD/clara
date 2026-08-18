# F-A1 — the LLM witness-pair extraction: design

> **Design doc of record for Wave-F Track A item F-A1** (`docs/plan/active/wave-f-contract.md`
> §F-A1). **v3, 2026-08-18** — two fresh-context adversarial lanes (attack + independent
> byte-verify, repo at 84d9c97) reviewed v1 (34 findings folded) and RE-VERIFIED v2 (all
> resolved; one partial + their 12 new findings folded here). The Codex cross-model pass is BLOCKED by a
> vendor usage limit until 2026-08-20 — a **named precondition of build PR-1**, not of this
> doc. Binds under: ADR-0071 G1.1 + C1-C4; digest laws 71-76; PRD §6 (law 5 is the "§6.5"
> inert-data referent). Every build PR takes the uniform ADR-061 ladder; the predicate and
> every recut guard is judgement logic (review law 1).

## 1 · The ruled shape (what is fixed, not designable)

- **Two reads per document**: text-witness (LLM over stored OCR raw text + numbered
  regions) and vision-witness (LLM over the original image/PDF bytes) — same provider,
  two channels, distinct prompts *(G1.1; the independence axis is the CHANNEL)*.
- **C1** agreement decided by a NEW versioned deterministic DB predicate, to the sen.
  **C2** every witnessed amount binds server-side to a layout OCR region; no region →
  not corroborated → draft. **C3** arithmetic identity + the bank CHAIN stay required.
  **C4** both reads persist whole as `llm_text_facts`/`llm_vision_facts`, model+version
  stamped; prompts carry the inert-data posture.
- OCR demotes to coordinates+text behind a formalized ExtractionResult seam. Retires:
  `invoiceFacts.v1.azure`, `statementFacts.v1.engine`, the eight-reader family.

## 2 · The estate as-built (verified twice at the bytes; live-body provenance stated)

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
(0023:307) · `deposit` absent-or-zero (0023:308) · `net,tax >= 0` (0023:315-321) ·
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
   (0038:6929-6931) — each with its own postcheck (0038:6959-6967). A lane in no list
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
    branch ordered after it (0026:1135); hardcoded retiring engine at 0026:1059;
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

**Runtime plane.** Frozen closure = @frozen files + RELATIVE imports only; the
adapters/services/reader family are globalThis-injected infra, absent from
frozen-workflows.json — **except `packages/runtime/lib/malaysian-registration.mjs`,
which IS in the manifest** and must not be touched by any retirement sweep. The
behavior triads are frozen AND deploy-locked; registry monotonicity enforced
(check-frozen-workflows.mjs:16-21, 32-35). The LIVE consumers of extraction facts are
frozen bodies: autoDraft.v7.tools.ts:96 filters `engine_kind === "invoice_facts"`;
the stale confidence mirror is autoDraft.v7.tools.ts:73,107 (live drift, pre-existing).
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

## 3 · The design

### 3.1 One lane, one claim, two reads, one atomic idempotent persist

New lane **`llm_witness`**, one task per document, one new frozen workflow class
**witnessFacts.v1** (new files packages/runtime/workflows/witnessFacts.v1.ts +
.impl.ts + .behavior.mjs + .services.mjs + .prompts.mjs; adapters globalThis-injected).
Behavior: claim → downloadCanonical (vision bytes) + read the pinned ocr extraction
(text + numbered regions) → two model calls as separate memoized steps →
**clara.persist_witness_facts** once.

The writer inserts BOTH extraction rows (`llm_text_facts`, `llm_vision_facts`) in ONE
transaction. **Citable fact regions are written on the TEXT row only** (its citations
are server-verified, §3.4); the vision row persists whole in its envelope and carries
NO regions — so the canonical extraction_id (§3.3) is the only region-bearing row and
bound-extraction consumers can never bind the wrong one. **Idempotency (law 10):** keyed on the claimed
task's `version_n` (read off the task row, the 0038:1775-1776 precedent) under the
4-column unique (document_id, engine_id, version_n, engine_kind) — a replay detects
the existing pair and returns the stored receipt (the persist_invoice_facts
precedent); a step retry REPLAYS the memoized read
envelopes, never re-calls the model (the reads are their own steps). **Independence
receipt (checkable, not vacuous):** the text row's envelope must name the pinned OCR
extraction id as its input; the vision row's must name `documents.sha256`; both carry
prompt hashes, refused on equality. No distinct-model requirement — G1.1 chose
same-provider; the channel is the independence axis. The same-engine_id refusal shape
is NOT mirrored (under two kinds it could never fire — a probe that cannot say NO).
Conflicting-duplicate forfeiture applies within each read's own row set.

### 3.2 Engine identity and stamping

engine_id `llm-{provider}:{model}:{version}` (snapshot constant, the
AZURE_ENGINE_SNAPSHOT pattern), engine_config carries prompt hash + channel. The
prefix CHECK gains `lane='llm_witness' → engine_id like 'llm-%'`; the lane-blind
`clara-fixture:%` arm stands (the rig's door, unchanged and stated).

### 3.3 The successor predicate — and the dispatch that spares 30+ call sites

**clara.evaluate_witness_fact_state_v1(p_document, p_text_x, p_vision_x) → jsonb**,
pinned to BOTH ids. (The `evaluate_*` stem is load-bearing, not cosmetic:
check-frozen-evaluators.mjs:62 discovers ONLY `clara.evaluate_*` definitions — any
other name would be catalog-frozen but source-unfrozen, the exact half-freeze the
manifest's own note warns about.) **Repointing happens INSIDE the two existing
bodies, not at callers** (both review lanes converged here): PR-1 ships a change of
record of (a) `_invoice_fact_state_at(uuid,uuid)` — now dispatching on the passed
extraction's engine_kind: witness kinds resolve the pinned pair and delegate to the
v1 predicate; and (b) the flat 1-arg resolver `_invoice_fact_state` — CONVERTED into
a dispatcher that resolves the newest fact-bearing generation across BOTH regimes
(**precedence: the cross-regime clock is `extracted_at`** — the 0017 trigger's own
ordering key. `version_n` is a PER-LANE counter (0026:216-217; every mint is
lane-scoped), so a witness pair starts at 1 and a version_n rule would let a stale
legacy read outrank it forever; version_n orders within-lane only; a clock tie
prefers the witness pair); (c) `_write_entry_evidence`
inherits the fix through (b) automatically (its 0009:429 call is the wrapper), making
the verified tier reachable for witness-born documents — the three-term tier
conjunction (corroborated ∧ 'invoice.total' ∧ cents-equal) then holds unchanged. The
~30 consumer bodies stay untouched; the duplicate-bill/sales walls, lane routing,
and `_assert_supplier_bill_shape_at` (N1's future home) keep firing. A tail census
counts the call-site population and asserts the two recut bodies are the only changes.

**Pair resolution** joins the two rows on the SAME task/version_n — never independent
per-kind-latest (which could pair a v2 text read with a v1 vision read).

**Output envelope: byte-compatible with the FULL live key set** (0023:348-364), not a
subset: corroborated (coalesced never-NULL) · corroboration_ineligible ·
extraction_id · version_n · total_cents · total_region_id · total_fact_hash ·
currency · explicit_non_myr · type_code · tax_total_cents · total_excl_tax_cents ·
rounding_cents · invoice_id · invoice_date · customer_name · customer_registration —
with 0023's CONDITIONAL-append rule preserved: the six sales/SST keys stay appended
only-when-non-null (0023:357-364's recorded exact-diff reason), so byte-compatibility
means the same emission RULES, never always-emit-all-17.
**The canonical `extraction_id` is the TEXT-witness row** — its regions carry the
verified citations (§3.4), so consumers that read regions off the bound extraction
(0022:1309-1328, 0036's shape checks) keep working against one designated row.

**Conjunct census (v1 finding 3 — every 0023 OCR-branch belt, disposition stated):**
ALL CARRIED, none dropped: per-field sen-exact agreement (both witnesses, computed in
SQL from the two persisted row sets — strengthening 0023's envelope-assertion read) ·
region anchoring per C2 · the six-term arithmetic identity · `v_total > 0` ·
amount_due absent-or-equal · deposit absent-or-zero · net/tax non-negative ·
the component sign belt · `abs(rounding) <= 99` (the executed forge counterexample
becomes a battery cell) · present-but-unreadable guards · cardinality guards · MYR
under the inherited asymmetry (both witnesses must cite explicit MYR evidence;
absence or disagreement → not corroborated; explicit foreign → explicit_non_myr →
CLR21 currency_unsupported). No confidence term (postverify reasserted). The
structured `clara-%` branch stays byte-untouched inside the dispatching
`_invoice_fact_state_at`.

**Identity fields (the CLR23 hazard — v1 blocker 2).** Pairwise agreement alone is
refused as the wall: two same-provider reads fail correlatedly on exactly the layouts
that mislead. The successor keeps the defense GEOMETRIC and server-side: the
text-witness must cite the region it read vendor_name, customer_name,
vendor_registration and customer_registration from (§3.4's cite-and-verify); the
predicate then RE-COMPUTES the block-attribution test over the pinned OCR polygons —
a registration corroborates only when its cited region is strictly closer (2D box
distance, tie refuses, missing anchor refuses) to the vendor-name cited region than
to the customer-name cited region (and symmetrically for customer_registration).
A witness-reported contest marker withdraws the field. **Plus one genuinely
INDEPENDENT DB-owned term the retirement leaves standing: a candidate
vendor_registration that normalizes to the FILING CLIENT's own `client_identifiers`
value (kind tin/ssm) REFUSES** — on a purchase document the client IS the buyer;
0022:1326-1328 already runs this check's mirror for direction evidence. The SALES
mirror holds too: a candidate customer_registration that normalizes to the filing
client's own identifiers refuses (on a sales document the client is the seller). **Named
honest weakness:**
the anchor DESIGNATION (which block is the vendor's) is witness-supplied where Azure's
typed field supplied it independently before — so §7's battery gains a wrong-party
cell set covering BOTH defeat shapes — (i) buyer-registration-only documents (the
invoice-vendor-identity.mjs:37-48 shape) and (ii) the MISLABELLED-BLOCK shape: a
compact invoice whose bill-to block sits above the seller block, where a witness
cites the buyer's name region as vendor_name AND the adjacent buyer registration as
vendor_registration — the distance test then CONFIRMS the wrong pairing, so only
the self-match refusal and the cell can catch it — both must NOT corroborate; and
the **decision rule is pre-committed**: if the wrong-party cells fail on the measured corpus,
identity fields are demoted to non-corroboration-bearing (drafts carry them; hard
counterparty resolution keeps its human) and that fallback ships without a new
design round. Accounting-correctness picks the fallback direction, not the schedule.

**Freeze discipline:** the v1 predicate registers in `clara.evaluator_versions` +
frozen-evaluators.json (append-only manifest; same-file registration row per
check-frozen-evaluators.mjs), under `set local search_path=pg_catalog,pg_temp` so the
stored hash reproduces (the 0059 recorded reason). **The closure is declared
minimal and explicit**: `evaluate_witness_fact_state_v1` + `_fact_hash` +
`_normalize_invoice_cents` (+ `_is_explicit_non_myr` if called). The two shared
leaves are ALREADY de-facto immutable (every stored fact_hash depends on them);
the freeze makes that structural, and the design states the cost: they can never be
CoR'd again — a change is a `_v2` re-mint with a new registry row. The `_v1` name is
the versioning door the signature-pinned verifier requires. Named residual: the
freeze locks ONE of TWO fact-hash implementations — `_write_entry_evidence` INLINES
the identical digest (0009:456-459) rather than calling `_fact_hash`; the two must
stay byte-agreed or the verified tier silently evaporates, so §7 carries an
agreement cell.

### 3.4 C2: cite-and-verify, not search (v1 finding 11)

The text-witness receives NUMBERED regions and must CITE the region idx it read each
fact from; the server resolves idx → region uuid against the PINNED ocr extraction at
write time (the F9 discipline — uuids bound at write, idx never stored) and VERIFIES:
the witness's quoted rendering is a substring of the cited region's text_content AND
parses to the claimed cents. Verification beats content-search on all three v1 holes
(ambiguous equal amounts, flattened multi-amount lines, label ownership — the witness
reads labels in context and its citation is checkable). The vision-witness cannot
cite (it never sees regions); it contributes the VALUE only, and its agreement is on
cents. The witness fact region is written with: `text_content` = the document's exact
quoted rendering (so `_write_entry_evidence`'s substring test holds), `monetary_raw`
= the same rendering, `monetary_cents` = normalized cents (so `_corroboration_bound`'s
re-derived hash holds), polygon = the cited OCR region's polygon, the source OCR
region uuid inside the locator jsonb, and **`engine_confidence` = NULL** — stated so
no successor toolface mirror re-introduces the ≥0.95 term the DB gate excludes. A missing/failed citation persists the fact
geometry-less (C4's persist-whole duty — the writer never refuses a read for being
wrong) and the predicate's C2 wall refuses corroboration: the
permissive-writer/strict-reader split, kept deliberately. The `doc_review`
side-by-side surface highlights the CITED region — verified, so never the
wrong box.

### 3.5 Egress: fail-closed by construction, one new typed purpose, gated at ENQUEUE

The `llm_witness` lane joins **all five lane lists**: the claim body's kill-switch,
attempt-cap and concurrency lists (each postcheck recut) and BOTH levels of
`release_held_document_tasks` (outer pick + inner kill-switch-only branch — the lane
belongs beside 'ocr'/'statement_facts' there: its consent is typed, checked at
enqueue, so release needs only the switch). New typed purpose **`witness_extraction`**
covering BOTH channels (the text channel re-sends client content to the vendor — an
egress event under law 58's plain reading), sha-bound with its OWN doc_sha arm
(doc_sha forced NON-NULL — the statement shape; 0038:5520-5521 anticipated exactly
this). All purpose CHECKs recut by NAME (the 0038:5462 contract). **The consent gate
sits at ENQUEUE inside the recut router core** (the statement precedent: the 0020 §6
battery pins the claim body free of typed-consent edges), minting never-claimed
`consent_inactive`-family receipts; `prepare/consume_egress_dispatch` wrap each model
call at dispatch time. The legacy purpose-blind branch is NOT widened.
GOVERNED_EGRESS_PURPOSES is trued (statement_extraction + witness_extraction). Real
client documents stay held until the owner's processor paperwork exists (OQ-1); the
build proves itself on ADR-048-labelled synthetic + firm-own documents. Both wb-0020
pinned bodies (`claim_document_processing_task`, `_enqueue_invoice_facts_core`) get
machine-derived restore pairs in the same PR (wall 12).

### 3.6 Metering without capping

No `_reserve_processing_call` (verified: nothing forces it — all ten call sites are
enqueue-side; the live 0038:7050 body would CLR18 an unlisted lane, so not calling it
is the only workable shape). Per-call usage rows (`clara.llm_usage_events`,
append-only, FORCE RLS) + envelope stamps; NO spend refusal (law 76). Engine-protective
bounds kept: the claim body's attempt cap and concurrency window (§3.5 wires both).
New enqueue-refusal codes join BOTH refusal CHECKs (wall 7). **Registered exposure
(§8):** at cutover the firm daily page budget stops applying to the invoice path —
the attempt cap and concurrency window are the only structural brakes, and metering
visibility is the owner's instrument; this is law 76's ruled trade, stated not hidden.

### 3.7 Statements ride the same spine (second build PR)

statementFacts_v2: reader-2's Azure seat → the witness pair; reader-1's stored-geometry
re-read retires; the CHAIN, both-edge continuity, refusal ORDER and
descriptions-never-load-bearing survive verbatim in a repointed `_persist_statement_core`
successor. **The statement currency posture (absence→MYR, WC-R5) is preserved and is
behaviourally OPPOSITE to the invoice posture** — on the invoice side absence yields
`''` ≠ 'MYR' at 0023:306 and never corroborates. Beware
statement-corroboration.mjs:41-42's comment calling absence→MYR "the 0023 posture":
the words are misleading, the mechanisms differ — stated here so the divergence
cannot be silently unified in either direction. The pair persists under the two witness kinds;
`bank_statements.reader1/reader2_extraction_id` repoint. Statement egress moves to
witness_extraction (two dispatches per statement — the frozen v1 body assumed one
egressing reader, which is part of why v2 is a new version).

### 3.8 ExtractionResult, demotion, consumers, and the router

ExtractionResult: a TS type formalizing {pageCount, envelope, regions[]} in a new
packages/runtime/lib/extraction-result.mjs; egress.mjs's normalizeAzureLayout is the
reference producer; witness reads consume it. The classify router core recuts to mint
`llm_witness` tasks; `enqueueForLane`'s explicit allowlist gains the lane (named as
the real protection). **Consumer widening = NEW frozen versions, not edits** (v1's
plan collided with the freeze): autoDraft_v8 + chatTurn_v12 ship in PR-3a with the
engine_kind literal widened (autoDraft.v7.tools.ts:96) and the stale confidence
mirror fixed (live drift at autoDraft.v7.tools.ts:73,107 — pre-existing, corrected
in the successor, never compounded). Witness landings renumber every ocr region idx
(witness kinds sort before 'ocr' under 0054:280) — a new EVENT of the documented
instability; the frozen toolfaces already guard within-turn resolution by their
idx→id snapshot map (each entry tagged `idx:id@extraction_id#version_n`, resolved by
the idx FIELD inside the snapshot the model actually read, refusing otherwise —
autoDraft.v7.tools.ts:142-167, `evidenceIdxUnresolvedRefusal`), and §7 pins it with
a cell. Persisted evidence is immune outright: `_write_entry_evidence` stores region
uuids, never idx (0009:467-470).

### 3.9 The 0017 trigger — a HARD PR-1 precondition (v1 finding: intra-pair self-supersede)

The kind-blind FOR-EACH-ROW trigger makes a one-transaction pair supersede ITSELF by
uuid coin flip (equal `extracted_at` = transaction now()), permanently (CLR08
once-only), with the CLR31 pointer consumer then refusing the losing half. So PR-1
ships a trigger fix unconditionally, in one of two shapes: (preferred) the consumer
census PROGRESS requires, then kind-scoped supersede; (fallback if the census finds a
cross-kind-dependent consumer) the trigger learns to skip same-transaction sibling
inserts from the witness writer (txn-local GUC set by persist_witness_facts). Either
way §7 asserts: after a persist, NEITHER witness row carries superseded_by, and the
authoritative pointer is deterministic. The kind-scoped shape is PREFERRED partly
because it needs no GUC; if the fallback ships instead, it must carry its bypass
argument written out (the 0054 wake_secret precedent): a trigger conditional on a
txn-local GUC is safe only if no principal can INSERT into document_extractions
outside the SECURITY DEFINER writers — asserted by a tail census of INSERT grants,
never assumed (law 27(2)).

## 4 · Decision register (v3)

- **D1** one lane/claim/atomic idempotent two-row persist; independence receipt =
  input pins + distinct prompt hashes (checkable), not model stamps (vacuous).
- **D2** two engine KINDS per C4 — distinct-on surfaces both; no shield vs 0017 (D11).
- **D3** successor predicate named `evaluate_witness_fact_state_v1` (the
  `evaluate_*` stem is what the frozen-evaluators lint discovers), central-registry-
  frozen with a declared minimal closure; **dispatch shipped as a change of record
  of the two existing bodies** — zero caller repoints.
- **D4** permissive writer / strict reader kept; the verified tier reaches witness
  documents through the resolver dispatch, not by luck.
- **D5** one typed purpose, both channels, sha-bound, enqueue-gated; legacy branch
  never widened.
- **D6** meter-never-cap; engine-protective brakes only; page-budget lapse registered.
- **D7** `request_reextraction` stays human-only; the door widens to witness kinds
  INCLUDING the branch ORDER (a witness-done receipt admits via the primary branch,
  never mislabelled receipt_backfill); the hardcoded Azure engine constant
  (0026:1059) is replaced; moves to PR-3 (see D9).
- **D8** matcher allowlist unchanged.
- **D9** PR-1 mints no witness work (door widening moved to PR-3) but replaces two
  live bodies — it takes the D1 quiesce window (§6); invoice first, statements
  second; consumer re-versioning is PR-3a inside F-A1, not deferred to F-A2.
- **D10** field_path vocabulary reused — load-bearing: it keeps
  `_write_entry_evidence`'s congruence check and `_corroboration_bound`'s
  'invoice.total' pin working unchanged.
- **D11** the 0017 fix is a hard PR-1 precondition with a named fallback shape.
- **D12** identity fields: geometric successor with the pre-committed demotion rule
  (§3.3) — measurement decides, accounting-correctness picks the fallback.

## 5 · Owner sitting questions (narrow; accounting-safe defaults stated)

- **OQ-1 · The LLM vendor's processor status.** Vision sends original client bytes —
  and text sends OCR-derived client content — to the LLM provider. Options:
  (a) OpenAI under a new ADR-011-grade bundle (DPA, disclosure, PDPA basis,
  no-training retention, deletion); (b) Azure-hosted OpenAI models, staying inside
  the existing Azure processor relationship. **Default until ruled: fail-closed** —
  real-client documents hold; the build proves on labelled synthetic + firm-own.
  Recommendation: (b) if model availability suffices.
- **OQ-2 · Ratify the witness_extraction purpose** (one purpose, both channels,
  sha-bound per document) per WB-R23's typed-consent doctrine.

## 6 · Build sequencing (deploy order BINDING; every recut names its live body)

1. **PR-0 (gate)**: the Codex cross-model design pass (blocked until 2026-08-20 by
   vendor usage limit) — runs before PR-1 merges; its findings fold here first.
2. **PR-1 (DB)**: the 0017 trigger fix (hard precondition, §3.9) · kinds+lane+
   prefix CHECK recuts · claim-body lists ×3 + release ×2 (+ restore pairs for both
   wb-0020-pinned bodies) · purpose CHECKs by name + the witness doc_sha arm · BOTH
   refusal-code CHECKs · persist_witness_facts (idempotent) · the v1 predicate +
   evaluator_versions + frozen-evaluators.json (catalog search_path) · the TWO
   dispatch recuts (`_invoice_fact_state_at`, `_invoice_fact_state`) with a caller
   census tail · llm_usage_events. **PR-1 mints no witness work** (no router change,
   no re-extraction door change; an old runtime cannot mint the lane —
   enqueueForLane allowlist + lane CHECK) — but it is NOT inert: the two dispatch
   recuts replace LIVE hot-path bodies reached by every existing invoice document,
   so **the ceremony takes the D1 write-quiesce window** (an in-flight call runs to
   completion on the body it started with), and §7 carries the before/after
   byte-identity cell for the non-witness path. Full rig battery.
3. **PR-2 (runtime)**: witnessFacts.v1 (freeze:update, new class) · ExtractionResult ·
   prompts (inert-data, cite-by-idx, zod schemas) · egress dispatch wiring · usage
   recording. Bundle-grep after build.
4. **PR-3 (cutover, DB)**: router core recut to mint llm_witness (+ its restore pair) ·
   request_reextraction door widening (branch order included) · runs only after PR-2's
   image is verified live (positive-read law). Fail-closed both orders (verified:
   lane CHECK + prefix CHECK refuse an early insert; the DB-side router + the
   enqueueForLane allowlist make an old-image misroute structurally impossible).
5. **PR-3a (runtime)**: autoDraft_v8 + chatTurn_v12 (engine_kind widening, confidence
   mirror fix, idx-stability cell) — inside F-A1, not deferred.
6. **PR-4 (statements)**: statementFacts_v2 per §3.7.
7. Retirement sweep rides F-A2 (F-A10 owns the terminal check): reader family +
   adapters + their direct-import test estates; malaysian-registration.mjs and
   invoice-amount-grammar.mjs excluded by name.

## 7 · Test battery sketch (contract-blind cells ▣)

- Writer: idempotent replay returns the stored receipt ▣ · retry replays memoized
  envelopes (no second model call) · equal prompt hashes refused · missing input pins
  refused · conflicting duplicate forfeits within one read ▣ · failed citation
  persists geometry-less · post-persist: neither row superseded, pointer
  deterministic (§3.9).
- Predicate: sen-exact agreement corroborates ▣ · one-sen disagreement refuses ▣ ·
  missing region refuses (C2) · transposed net/tax refuses (0023's counterexample) ·
  **the rounding-forge counterexample refuses** (|rounding|≤99 carried) · negative
  component forge refuses (sign belt) · amount_due/deposit belts ▣ · MYR asymmetry ×3 ·
  identity: the wrong-party cell set — buyer-registration-only refuses AND the
  mislabelled-block shape refuses (via the client-registration self-match term) ·
  cross-regime precedence by `extracted_at` — a witness pair at version_n=1 minted
  AFTER a legacy v3 read WINS, and vice versa ▣ ·
  contest-withdraws · cross-generation pair refused (same task/version_n only) ▣ ·
  never-NULL corroborated ▣ · no confidence token (postverify) · structured branch
  byte-unmoved · resolver dispatch: a witness document resolves through
  `_invoice_fact_state` and the duplicate-bill wall FIRES for it ▣.
- End-to-end evidence: witness pair → cited region → provenance_tier='verified' →
  approve succeeds; and its negative twin (uncorroborated → 'model_read' → CLR21).
- Continuity: a pre-existing invoice_facts document's `_invoice_fact_state` output is
  byte-identical before and after the dispatch recuts (the 0023:357 exact-diff idiom)
  · the inlined evidence digest (0009:456-459) and `_fact_hash` agree on one input set.
- Walls: lane/prefix CHECK refusals ▣ · claim holds without the switch · attempt cap
  + concurrency arms exercised nonvacuously · held witness task RELEASES when the
  switch returns (the inner-branch cell) · typed purpose absent → enqueue refusal
  receipt; present-for-other-doc → refused (sha arm) ▣ · OCR region idx pinned
  across a witness persist (the toolface idx→id snapshot-map cell).
- E2E corpus: the 29-document capture set re-run; corroboration rate MEASURED vs the
  deterministic baseline; the wrong-party set is gating (D12's rule).
- Freeze: verify_evaluator_freeze green; FREEZE_GUARDS trips on a doctored body
  (throwaway); wb-0020 restore pairs prove reversal.

## 8 · Registered risks and named non-goals

- **Corpus-capture regression** — top product risk; the §7 measured cell gates PR-3,
  and the wrong-party cells gate identity corroboration (D12).
- **Spend exposure at cutover** — the page budget lapses; attempt cap + concurrency +
  metering visibility are the brakes; law 76's ruled trade, registered.
- **Identity anchor designation** is witness-supplied where Azure's typed field was
  independent — the named honest weakness behind D12's pre-committed fallback.
- **The agent token meter's refusal branch** (0011:2442+) violates law 76 for
  automation generally — F-A9's remit.
- **Interim architecture split** between PR-3 and PR-4 (invoice new-regime, statements
  old) — named; F-A10 judges at wave close.
- **Non-goals**: no structured-branch change, matcher widening, agent re-extraction,
  new field_path namespace, frozen-v1 edits, or touching the two §6.7-named leaves.
