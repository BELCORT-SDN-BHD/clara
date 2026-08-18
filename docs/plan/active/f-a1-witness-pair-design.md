# F-A1 — the LLM witness-pair extraction: design

> **Design doc of record for Wave-F Track A item F-A1** (`docs/plan/active/wave-f-contract.md`
> §F-A1). **v3, 2026-08-18** — two fresh-context adversarial lanes (attack + independent
> byte-verify, repo at 84d9c97) folded 48 findings across v1→v3, all confirmed on final
> bytes, both lanes unconditional MERGEABLE. **v3.1 (2026-08-18 night):** §5 RULED
> in-session (OQ-1 OpenAI-direct · OQ-2 ratified · cutover direct-release, dissent on
> file); PR-0 re-shaped by owner ruling to a third NATIVE adversarial lane — which RAN:
> MERGEABLE-WITH-CONDITIONS, every condition folded in below (the register + the estate
> survey live in `f-a1-annexes.md`); the §3.9 census verdict recorded. The BUILD's own
> adjudicated review round (2 blockers · 7 material, incl. B1's C2-overreach and B2's
> transition-trigger arm) folded PRE-FREEZE the same night — Annex B/C carry that
> record too. Binds under: ADR-0071 G1.1 + C1-C4; digest laws 71-76; PRD §6 (law 5 is the "§6.5"
> inert-data referent). Every build PR takes the uniform ADR-061 ladder; the predicate
> and every recut guard is judgement logic (review law 1).

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

## 2 · The estate as-built — moved to `f-a1-annexes.md` Annex A

The full survey (data plane · verdict machinery · the thirteen walls · runtime plane ·
reader lessons) lives in `docs/plan/active/f-a1-annexes.md`; wall numbers cited below
resolve there, and the adjudication registers are its Annex B/C.

## 3 · The design

### 3.1 One lane, one claim, two reads, one atomic idempotent persist

New lane **`llm_witness`**, one task per document, one new frozen workflow class
**witnessFacts.v1** (new files packages/runtime/workflows/witnessFacts.v1.ts +
.impl.ts + .behavior.mjs + .services.mjs + .prompts.mjs; adapters globalThis-injected).
**The prompts are FROZEN-closure members (M8, decided here):** witnessFacts.v1 imports
.prompts.mjs relatively, so a prompt edit IS a body edit — every tweak after deploy is
a witnessFacts.v2 + ceremony (runtime-workflows law). The corpus-tuning loop (D12's
measure-then-adjust) therefore runs BEFORE the first freeze/deploy; cost registered §8.
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
same-provider; the channel is the independence axis. **The pair join key, written out
(M15): `(document_id, engine_id, version_n)` resolving TWO rows distinguished by
engine_kind — both rows carry ONE shared engine_id.** This deliberately INVERTS the
statement pair's discriminator (there: one kind, two engine_ids, same-engine_id
refused — 0038:1769-1780); here the KIND discriminates, engine_id carries the shared
model identity, and the same-engine_id refusal shape is NOT mirrored (under two kinds
it could never fire — a probe that cannot say NO).
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
prefers the witness pair. **And WITHIN a regime the live ordering key is preserved
verbatim** — the task `version_n desc, id desc` of 0016:2270 for legacy, the pinned
pair for witness; `extracted_at` decides ONLY between the two regimes' per-regime
winners, so a multi-generation legacy document's resolution cannot silently move
(M6; §7's continuity cell covers exactly that document)); (c) `_write_entry_evidence`
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
with 0023's CONDITIONAL-append rule preserved: the six conditional keys (four
sales/SST + the two identity keys customer_name/customer_registration — N4) stay
appended only-when-non-null (0023:357-364's recorded exact-diff reason), so
byte-compatibility means the same emission RULES, never always-emit-all-17.
**Identity verdicts surface as region facts under the D10 vocabulary and as
WITNESS-REGIME-ONLY conditional keys — never as new keys on legacy outputs (the
live envelope has no vendor_* keys, 0023:348-364 — N5); `corroborated` stays an
AMOUNT verdict with no identity term (today's posture, unchanged).**
**The canonical `extraction_id` is the TEXT-witness row** — its regions carry the
verified citations (§3.4), so consumers that read regions off the bound extraction
(0022:1309-1328, 0036's shape checks) keep working against one designated row.
**The reference-value contract (M3):** `invoice_id`/`invoice_date` answers may
carry a normalized `value` beside the verbatim `raw` (write-verified:
substring-of-raw / ISO date); the envelope emits `coalesce(value, raw)` and DROPS
the key on cross-channel disagreement — the duplicate-bill/sales walls
(0015:1402/1425-1429) compare these keys by exact equality ACROSS regimes, and the
value slot is what keeps a legacy `INV-001` and a witness quote colliding.

**Conjunct census (v1 finding 3; COMPLETED at PR-0 B1 — every 0023 OCR-branch belt,
disposition stated):** per-field sen-exact agreement (text values from the canonical
row's server-VERIFIED regions; vision values from the vision row's persisted
ENVELOPE — region-less by §3.1, so its cents are envelope-asserted: the exact posture
0023:194-200 defends, INHERITED here rather than claimed stronger — B2) ·
region anchoring per C2 · the six-term arithmetic identity · `v_total > 0` ·
amount_due absent-or-equal · deposit absent-or-zero · the ineligibility envelope
gate (`corroboration_ineligible` null — 0023:309, B1) · net AND tax STATED, single
and non-negative (0023:310-311, 315-321 + the nil-tax law 0023:299-303: an unstated
tax NEVER infers zero — B1) ·
the component sign belt · `abs(rounding) <= 99` (the executed forge counterexample
becomes a battery cell) · present-but-unreadable guards · cardinality guards ·
`type_code='01'` required — CN/DN corroboration-ineligible (the structured branch's
0023:243-245 posture inherited; a witness reliably reports type_code where Azure
rarely did, closing the old OCR branch's silent gap — M12) · MYR
under the inherited asymmetry — **currency and type_code are TOKEN belts (PR-1
review B1): answered on both channels, citation OPTIONAL, NO geometry term — C2
anchors the NINE monetary members only; `RM`|`MYR` both confirm MYR
(confirm-or-refuse, never manufacture)**; absence or disagreement → not
corroborated; explicit foreign → explicit_non_myr → CLR21 currency_unsupported. No confidence term (postverify reasserted). The
structured `clara-%` branch stays byte-untouched inside the dispatching
`_invoice_fact_state_at`. **The required-answer rule (B1 — the belts keep their
FORCE under a supplier that chooses what to emit):** every belt field is REQUIRED in
both witness schemas, answered with a value or an explicit `not_printed` token; a
missing answer is a refused read (persisted whole per C4, but silence is NOT
corroborated), and `not_printed` takes the belt's absence arm. Silence is a refusal,
never a pass (law 27(2)).

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
INDEPENDENT DB-owned term the retirement leaves standing — RESTATED at PR-0 B3 (the
v3 wording read 0022's polarity SIGNAL as a refusal; 0022:1326-1342's `v_hard_ok` is
POSITIVE sales-direction evidence): the SELF-REFERENTIAL WITHDRAWAL.** A side
(vendor or customer) whose registration normalizes to the FILING CLIENT's own
`client_identifiers` value (kind tin/ssm) is the client's own block, not a
counterparty — that side is WITHDRAWN from counterparty corroboration. Not an error:
the region facts persist (C4) and 0022's direction evidence keeps reading them
(0022:1309-1341). Both sides matching withdraws both and flags contest. **The filing
client resolves via `clara.document_filings`' live filings** (`documents.client_id` is
GONE at the frontier — measured at build, prestate-pinned in 0091); ≠1 distinct live
filing client makes the withdrawal unevaluable and every identity verdict REFUSES
(fail-closed; assembly clarification, 2026-08-18).
Polarity-free by construction — no document_kind or direction input, so no
circularity with 0022:1307's derived polarity; the mislabelled-block defense is
preserved (a witness that cites the buyer's registration as vendor_registration on
a purchase document self-matches the client and is withdrawn). **Named
honest weakness:**
the anchor DESIGNATION (which block is the vendor's) is witness-supplied where Azure's
typed field supplied it independently before — so §7's battery gains a wrong-party
cell set covering BOTH defeat shapes — (i) buyer-registration-only documents (the
invoice-vendor-identity.mjs:37-48 shape) and (ii) the MISLABELLED-BLOCK shape: a
compact invoice whose bill-to block sits above the seller block, where a witness
cites the buyer's name region as vendor_name AND the adjacent buyer registration as
vendor_registration — the distance test then CONFIRMS the wrong pairing, so only
the self-referential withdrawal and the cell can catch it — both must NOT corroborate; and
the **decision rule is pre-committed**: if the wrong-party cells fail on the measured corpus,
identity fields are demoted to non-corroboration-bearing (drafts carry them; hard
counterparty resolution keeps its human) and that fallback ships without a new
design round. Accounting-correctness picks the fallback direction, not the schedule.

**Freeze discipline:** the v1 predicate registers in `clara.evaluator_versions` +
frozen-evaluators.json (append-only manifest; same-file registration row per
check-frozen-evaluators.mjs), under `set local search_path=pg_catalog,pg_temp` so the
stored hash reproduces (the 0059 recorded reason). **The closure is declared
minimal and explicit — FOUR members as built**: `evaluate_witness_fact_state_v1` +
`evaluate_witness_identity_v1` (the identity leaf, born at the build's file split;
own registry row + manifest entry so the `evaluate_*` lint covers it at review
time — PR-1 review M7) + `_fact_hash` +
`_normalize_invoice_cents`. The two shared
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
fact from (the two token belts excepted — citation optional, B1); **the numbering
PR-2's prompt builder uses comes from `clara.witness_citation_regions` — the write
resolver's own ordinal published as a reader (M5), never `get_document_extract`'s
DIFFERENT idx**; the server resolves idx → region uuid against the PINNED ocr extraction at
write time (the F9 discipline — uuids bound at write, idx never stored) and VERIFIES:
the quoted rendering occurs TOKEN-BOUNDED in the cited region's text_content
(monetary fields — a bare substring admits digit fragments, review M4/NC-3) AND
normalizes to the stored cents, re-derived from the rendering itself (PRD §6).
Verification beats content-search on all three v1 holes
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
permissive-writer/strict-reader split, kept deliberately. **What verification
proves — stated honestly (M13):** the citation is SELF-consistent (quote is a
substring of the cited region and parses to the claimed cents) — not alone that it
is the RIGHT region: on a multi-page document where a page-1 subtotal equals the
grand total, a wrong-page citation verifies clean. The independent anchors are the
vision channel's agreement, the arithmetic identity and the belts; the §7 corpus
carries a wrong-page equal-amount cell. The witness fact region carries
`locator_kind='page_polygon'` (0007:207-208's closed set). The `doc_review`
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
client documents flow at PR-3 cutover with NO paperwork hold (owner ruling 2026-08-18
— §5; the DPA rides the owner/legal backlog non-blocking); the build still proves
itself on ADR-048-labelled synthetic + firm-own documents. Both wb-0020
pinned bodies (`claim_document_processing_task`, `_enqueue_invoice_facts_core`) get
machine-derived restore pairs in the same PR (wall 12). **The claim body's
terminal-event case follows the LANE (M9):** an llm_witness attempt-cap failure must
not fire the invoice twin through the 0038:6918-6922 else branch — a lane-true event
is the default, decided at PR-1 WITH the subscriber census attached (the
0038:6915-6917 recorded class).

### 3.6 Metering without capping

No `_reserve_processing_call` (verified: nothing forces it — all ten call sites are
enqueue-side; the live 0038:7050 body would CLR18 an unlisted lane, so not calling it
is the only workable shape; the opted-into claim branch also calls
`_refund_processing_call` unconditionally at 0038:6914 — harmless by bytes, 0038:7128
returns null on no reservation — N3). Per-call usage rows (`clara.llm_usage_events`,
append-only, FORCE RLS) + envelope stamps; NO spend refusal (law 76). Engine-protective
bounds kept: the claim body's attempt cap and a concurrency window that is
**witness-OWN (M10)** — llm_witness gets its own counter/limit column, never the
shared `ocr_concurrency` default-2 window (0038:6926-6932, counted across
ocr/invoice_facts/statement_facts), which must not absorb the slowest lane;
engine-protective, not a spend cap; the interim both-regimes contention is §8's.
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
selection rule SPELLED OUT (M7) — widen the kind filter AND resolve the regimes
separately: the witness regime resolves via the pinned pair (task/version_n join),
never `Math.max(version_n)` across regimes (autoDraft.v7.tools.ts:98-99 would
silently drop a witness pair at version_n=1 beside a legacy v3); regime precedence
by `extracted_at`, which `get_document_extract` starts PUBLISHING in PR-1 (additive
read-seam widening — 0054:284-289 lacks it today). The stale confidence mirror
(autoDraft.v7.tools.ts:73,107 with the load-bearing `conf >= 0.95` at :110 — live
drift, pre-existing) is corrected in the successor, never compounded. Witness landings renumber every ocr region idx
(witness kinds sort before 'ocr' under 0054:280) — a new EVENT of the documented
instability; the frozen toolfaces already guard within-turn resolution by their
idx→id snapshot map (each entry tagged `idx:id@extraction_id#version_n`, resolved by
the idx FIELD inside the snapshot the model actually read, refusing otherwise —
autoDraft.v7.tools.ts:142-167, `evidenceIdxUnresolvedRefusal`), and §7 pins it with
a cell. Persisted evidence is immune outright: `_write_entry_evidence` stores region
uuids, never idx (0009:467-470). **The read-seam char budget (M14):** two new
envelopes enter `get_document_extract`'s no-allowlist distinct-on set, and the 20k
default budget spends envelopes FIRST (0054:207, 254-258) — a persist-whole vision
envelope could starve the OCR regions the frozen toolfaces cite. PR-1 bounds the
vision envelope or excludes witness envelopes from the budgeted set; §7 asserts
region coverage does not shrink after a witness persist.

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

**Census DONE + the PR-0 M1-M5 cluster folded (2026-08-18; each byte-confirmed):**
no production consumer depends on cross-kind supersede for correctness — the CLR31
opening-TB consumer keeps refusing, via `stale_extraction_version` instead of
`extraction_not_accepted` (§7 cell); every INSERT path into document_extractions is
a named SECURITY DEFINER writer (non-owner roles hold SELECT only — 0007:2740,
0008:36), so even the fallback shape's bypass argument would hold. The PREFERRED
kind-scoped shape proceeds under FIVE binding notes: **(1)** BOTH branches carry the
kind scope — the winner sweep (0017:1533-1535) AND the late-arrival demotion
(0017:1539-1541); scoping one lets the self-supersede return through the other (M1).
**(2)** The demotion's target is the newest done row OF THE NEW ROW'S OWN KIND —
never the cross-kind document pointer (M5). **(3)** The writer inserts the pair as
TWO separate INSERT statements (the 0038:1781/1790 precedent): AFTER-INSERT-FOR-
EACH-ROW triggers fire at end of STATEMENT, so a one-statement pair under the OLD
trigger superseded BOTH rows and left the pointer corrupt — permanently, CLR31
`opening_extraction_pointer_corrupt` on the next done extraction (M3; §7 exercises
the writer's real shape AND the multi-row variant). **(4)** Pointer determinism is
WRITER-controlled: explicit per-insert `extracted_at` via `clock_timestamp()`
(0007:194 is default-only; only UPDATE is trigger-guarded), vision first, text
last — the document-wide pointer lands on the TEXT row, never by uuid coin flip.
And the pointer is NOT the predicate's `extraction_id`: a later OCR re-extraction
may move `documents.authoritative_extraction_id` off the text row (kind-scoping
stops the supersede, not the pointer); consumers reach the pair through the
resolver dispatch, and 0017's own bodies are the pointer's only readers (verified
blast radius: 0017:1512, 1536, 1703, 1723 + its self-assertion battery) (M2).
**(5)** The same-kind statement pair self-supersedes TODAY — a LIVE pre-existing
production defect (0038:1781-1797: one transaction, same kind, default
`extracted_at`), which kind-scoping does NOT fix; it heals at PR-4's re-kinding,
and PR-1's prestate COUNTS and documents the existing coin-flipped rows without
repairing them (`superseded_by` is once-only — in-place repair is impossible, and
none is attempted) (M4).

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
  (§3.3) — measurement decides, accounting-correctness picks the fallback. The
  self-match term is the SELF-REFERENTIAL WITHDRAWAL (B3 as amended — polarity-free),
  never a refusal.

## 5 · Owner sitting questions — RULED (2026-08-18 night, in-session)

- **OQ-1 · The LLM vendor — RULED: OpenAI direct (option a;** option (b) Azure-hosted
  OpenAI, this doc's prior recommendation, DECLINED**).** The runtime's existing seam —
  classify/chat/autoDraft already call `openai()` directly (classify-llm.mjs:14,114-117,
  byte-checked at ruling time) — so the witness pair adds NO second provider; the
  genuinely new egress is the vision channel's original-image bytes. The ADR-011-grade
  paperwork (OpenAI DPA + engagement-letter disclosure) rides the owner/legal backlog,
  NON-BLOCKING per the cutover ruling below.
- **OQ-2 — RULED: RATIFIED.** `witness_extraction` (one typed purpose, both channels,
  sha-bound) joins the governed-egress registry — WB-R23 discharged.
- **Cutover posture — RULED: DIRECT RELEASE.** Real client documents flow at PR-3
  cutover with no paperwork hold ("直接放行"); the agent's DPA-first recommendation is
  on file as DISSENT (dissent-then-execute); the DPA stays owner-key, non-blocking.
- **PR-0 — RE-SHAPED (same ruling set):** the Codex cross-model pass is replaced for
  THIS build by a third native fresh-context adversarial lane; Codex re-enters at
  future builds when the vendor limit lifts (a standing rule since). §6.1 amended.

## 6 · Build sequencing (deploy order BINDING; every recut names its live body)

1. **PR-0 (gate)**: a third native fresh-context adversarial design pass (the owner's
   2026-08-18 substitution ruling — §5; Codex re-enters at future builds) — runs
   before PR-1 merges; its findings fold here first.
2. **PR-1 (DB)**: the 0017 trigger fix (hard precondition, §3.9) · kinds+lane+
   prefix CHECK recuts · claim-body lists ×3 + release ×2 (+ restore pairs for both
   wb-0020-pinned bodies) · purpose CHECKs by name + the witness doc_sha arm · BOTH
   refusal-code CHECKs · persist_witness_facts (idempotent) · the v1 predicate +
   evaluator_versions + frozen-evaluators.json (catalog search_path) · the TWO
   dispatch recuts (`_invoice_fact_state_at`, `_invoice_fact_state`) with a caller
   census tail · llm_usage_events · the witness-own concurrency column (M10) ·
   `get_document_extract` publishes `extracted_at` + the witness-envelope budget
   bound (M7/M14) · the full 22-path field_path census with an emit/retire
   disposition each (M11 — `invoice.customer_taxid` feeds 0022:1336-1338;
   contact_person and the two myinvois ids named) · the lane-true terminal event
   with its subscriber census (M9). **PR-1 mints no witness work** (no router change,
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

## 7 · Test battery sketch — moved to `f-a1-annexes.md` Annex C

The full cell list (contract-blind cells marked ▣) plus the review-fold additions
live in Annex C; every "§7 cell" reference in this doc resolves there.

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
  old) — named; F-A10 judges at wave close; the witness-own concurrency window (M10)
  prevents cross-lane starvation during the split, and the statement pair's LIVE
  self-supersede defect (§3.9 note 5) persists until PR-4.
- **Prompt freeze iteration cost (M8)** — prompts are frozen-closure members, so every
  post-deploy tweak is a new witnessFacts version + ceremony; the corpus-tuning loop
  runs PRE-freeze, and post-deploy tuning being ceremony-priced is the accepted trade.
- **Non-goals**: no structured-branch change, matcher widening, agent re-extraction,
  new field_path namespace, frozen-v1 edits, or touching the two §6.7-named leaves.
