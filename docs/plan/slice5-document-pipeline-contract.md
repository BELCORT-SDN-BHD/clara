# Slice 5 design contract — the document pipeline core (v1.1 — post design-review round 1)

**Status:** DESIGN — round-1 findings integrated. Grilled with the owner 2026-07-18
(ten rulings S5-R1…R10) + three **owner-delegated** decisions (S5-D1…D3) resolved by
industry research + Codex (gpt-5.6-sol, xhigh) debate. Evidence:
`docs/plan/research/slice5/`. Design review round 1 (dual-lane: native Opus +
Codex xhigh, both FLAWED) produced 25 accepted findings — integrated below and
mapped in §12. Three fixes touch previously ratified semantics and are marked
**[DELTA-OWNER-1..3]** pending the owner's sign-off at the delta stage.
Ladder: delta re-review → build (contract-blind rig lane) → as-built review; §13
carries as-built amendments. **The migration design (§3.x) lives in the companion
`slice5-migration-0007-design.md` — same normativity, split only for the
500-line file cap.**

Slice frame (REBUILD-PLAN): upload (picker/drag/paste) → OCR with bounding-region
capture → persist-after-OCR always (unassigned lane) → assign/reassign → attachment
lifecycle chip; storage doctrine + registry; retention anchored at period-end+filing.
Slice 6 (Gate-3 demo) consumes this pipeline directly.

---

## 0. Ratified owner semantics (grilled 2026-07-18)

- **S5-R1 — OCR egress: two-tier gate.** Build + ship NOW against synthetic/firm-own
  data. Before any REAL client document flows to the OCR vendor, the owner evidences
  the egress bundle. **[DELTA-OWNER-1] The bundle is strengthened to match ADR-011's
  framework** (PRD invariant 16: ADR-011 governs on conflict): executed vendor DPA
  **+ specific client authorization** (the engagement-letter processor-disclosure
  clause is the mechanism — MIA By-Laws: a DPA alone does not confer disclosure
  authority) **+ documented PDPA cross-border basis** (once for the Singapore plane)
  **+ documented vendor no-training / limited-retention terms + a minimized-payload
  posture + a tested deletion procedure where the vendor offers one.** Recorded as a
  new ADR at merge (scoping how ADR-011's framework applies to the OCR channel).
  Enforced fail-closed by the §4.6 flag; the only bypass is a test adapter — never a
  generic "dev mode" against the real vendor.
- **S5-R2 — OCR engine pin.** Azure Document Intelligence **prebuilt-layout v4.0**,
  Southeast Asia region, **Standard (S0)**; pinned in the deploy doc with recorded
  limits (max size/pages/TPS). Engine id + config are **snapshotted per processing
  task** (§3.9). Adapter is PORT with the E-8 poll-deadline fix (429 branch included)
  and `boundingRegions` capture (J-18). Law stays vendor-agnostic; the pin lives in
  the deploy doc.
- **S5-R3 — Chat attachments ship in Slice 5.** This **AMENDS Slice-4 ruling 1 of
  record (owner-ratified in the Slice-5 grill)**: chat may never write **books**;
  **evidence ingestion is allowed**. One pipeline, two doors (Documents tab + chat
  composer). **[DELTA-OWNER-2] Honest Slice-5 scope:** the chat door is a **capture
  door** — chip + persist + lane. With `chatTurn` frozen at v1, Clara does NOT
  perceive an attachment in-turn (v1's history mapping keeps only text/clarify
  parts, and an unassigned document appears in no client pack). Clara's in-turn
  attachment awareness (a parts-aware `chatTurn_v2` + a firm-scoped
  unassigned-document read tool) lands in **Slice 6** with the write-capable floor.
  The chip's UI copy states this plainly ("Clara will see this document once it is
  filed" — honest-state law). The attachment part must be present in `p_user_parts`
  AT SUBMIT (chat_messages is append-only; there is no post-submit append): the
  composer blocks turn submission on intake **adoption** (document_id known); OCR
  completes out-of-band and is never awaited by a turn.
- **S5-R4 — Storage is content-addressed.** Bytes live once at
  `firms/{firm_id}/docs/{sha256}.{ext}`, write-once, never moved, never deleted.
  Assignment/reassignment is a pure audited registry change. **E-3's "bytes actually
  relocate" is superseded of record.** Delete-never holds for every routine
  application principal (platform/admin break-glass authority exists outside the
  application and is out of scope — §3.8).
- **S5-R5 — Multi-client filing ships now.** ONE document row per (firm, sha256) +
  historical **filings** (a document may be filed to several sibling clients).
  Provenance binds each entry to a specific filing (§3.1). Unassigned = zero active
  filings. Fixes E-13 structurally.
- **S5-R6 — Lane visibility.** Firm-visible the moment it persists (clarify-style
  framing copy). The lane shows the **uploader**, never the chat session — enforced
  by the same **mechanism** as agent_tasks masking: zero base-table grants for
  humans + a definer view that exposes `chat_session_id` NEVER, and intake rows
  only within the firm (§3.2).
- **S5-R7 — Document metering is a separate budget.** Per-firm docs/day + pages/day
  + OCR concurrency, operator-set + per-firm override, fail-closed **reservation
  semantics** (§3.6 — not naive begin/settle). OCR never occupies a chat compute
  slot.
- **S5-R8 — Admission (broader start).** Allowlist: PDF, PNG/JPEG/WebP/TIFF/HEIC,
  XML, **XLSX/CSV/DOCX** (structured-parse lane §4.3; never OCR). Chat: 5 × 20MB
  per turn. Documents tab: bulk queued, per-file retry; 100-file batch design
  target measured in Phase-5. Paste = clipboard files/images only; pasted TEXT is
  not a document in v1. Limits operator-set.
- **S5-R9 — Retention: §7a lands now, with honest states.** Anchored docs derive
  retain-until from client FY-end + statutory filing offset + 7 years (ITA
  s.82/82A, CA2016 s.245); recompute-on-close reserved; floor-never-shorten applies
  to ANCHORED values only. An unassigned document is **`unanchored`** (a state, not
  a far-future sentinel — a sentinel plus floor-never-shorten would trap it
  forever): retain_until is NULL and the document is simply undeletable while
  unanchored. First filing anchors it; multi-client docs take the MAX across active
  filings' clocks. Audited `legal_hold` place/release writers ship now (admin+
  floor, reason required), independent of the clock. No purge machinery; nothing
  auto-deletes in v1.
- **S5-R10 — MyInvois UBL XML: store-only carve-out.** Persists + enters the lane,
  skips both extraction lanes, flagged "e-invoice — stored, not parsed". Parsing
  arrives with the coding slice.

### Owner-delegated decisions (research + Codex debate; evidence archived)

- **S5-D1 — Transport: runtime-owned store-and-forward.** Browser streams to an
  authenticated intake endpoint ON the Fly runtime (never the Vercel proxy — 4.5MB
  body cap; never direct-to-storage — Supabase cannot enforce a checksum at upload
  and the canonical key needs the VERIFIED sha, known only at EOF). Runtime spools
  → hashes → **scans** (§4.1) → uploads once to the canonical key (`upsert=false`)
  → **downloads back and re-hashes** — the sha↔bytes bond is sealed by the runtime
  (HIGH-12). The browser never holds a storage credential; agent-plane custody
  end-to-end; no LLM in the ingest critical path (E-1/E-2). TUS resumable is staged
  behind the same intake abstraction.
- **S5-D2 — Attribution: deterministic two-lane; no model, no autonomous run.**
  A dedicated **matcher consumer** (§4.4 — net-new consumer infrastructure on the
  event spine, NOT the as-built router) runs after extraction: *Lane 1
  (authorizing):* a unique, role-aware HARD identifier hit (client TIN/SSM,
  bank-statement account number) against `client_identifiers` → the pipeline-only
  writer `record_rule_resolution(p_document, p_op_key)` recomputes the predicate
  server-side and records a `method='rule'` resolution (confidence hardcoded
  in-fn; callers never supply client or confidence). *Lane 2 (advisory):* unique
  exact registered-name/alias hits (a real `client_aliases` table, §3.4) become
  candidates — grouping input only; confirming one creates a `human` resolution.
  Conflicts (two clients named, ambiguous role, non-unique identifier) → **abstain
  with the conflict represented** in attempts/candidates, never hidden by a
  constraint. Assignment stays a human act in Slice 5 (even lane-1 matches are
  confirmed, not auto-filed). ALL model machinery waits behind the Phase-5 eval
  gate. Confidence displays as shaped bands, never percentages.
- **S5-D3 — Correction: refuse-until-reversed invariant + guided correction case.**
  `retire_document_filing(filing_id, reason, expected_revision, op_key)` REFUSES
  while live posted entries or live drafts of that client cite the document
  (structured blockers: entry refs, dates, period state, counts + cursor for large
  sets). The refusal opens: read-only **preview** (DB-computed blast radius incl.
  tax/closed-period/subledger impact) → **propose** (immutable hash-bound plan +
  books_version; no book effect; always high-stakes) → **approve** by a distinct
  eligible checker (or solo-attest) → ONE bounded transaction: per-entry linked
  reversal mirrors (whole-consequence, F3), drafts **withdrawn** (a real
  `withdrawn` journal status, §3.5 — never deleted), A's filing retired (filings
  are historical), B's filing ensured idempotently (requires an active same-firm
  client + a human/rule resolution), a re-code task row, one aggregate
  `document.correction_applied` event + ordinary child events. Stale plans reject.
  **Closed periods HARD-BLOCK approve in v1** (preview exposes them; execution
  refuses until a reopen/authority model exists). Lock discipline per the global
  lock order (§3.5). **Clara's role ladder:** detect/explain/preview (read-only)
  in Slice 5; an agent propose-writer is Slice 6; approve is human-only forever
  (no EXECUTE grant for the agent role).

---

## 1. Scope

**In:** migration `0007_document_pipeline.sql` (design: the companion §3 file);
intake transport + spool + scan + verify; Azure DI adapter + frozen
`documentIngest_v1` workflow + **durable processing tasks** (§3.9);
structured-parse lane; extraction + region persistence (ONE envelope — I-12;
tagged-union source locators); filings model + filing-bound provenance;
**generalized relay consumers** + the deterministic matcher +
`client_identifiers` + `client_aliases`; lane/triage + upload surfaces
(plumbing-level); assignment/un-filing writers + correction case (+ the
`withdrawn` journal status + global lock order); attachment chip; document
metering (reservation semantics); retention states + legal_hold writers;
document event types + taxonomy v2 (activated in-migration); freeze-manifest
addition; storage credential contract + object↔row reconciler.

**Out (recorded, not built):** doc_review overlay UI (Wave A); model attribution
(eval gate); coding/drafting from documents + `chatTurn_v2` + Clara's in-turn
attachment awareness (Slice 6); UBL parsing; TUS; PDF splitting; purge/disposal;
agent propose-correction writer; document-kind auto-classification;
export_artifacts retention inheritance; close-driven retention recompute.

**Gates:** deploys behind the ruling-7 ceremony; real client bytes behind the
S5-R1 bundle (§4.6). Build/test on local throwaways only; spike schemas untouched
until the ceremony.

---

## 2. Decision record (established by research + debates + round-1 verification)

- NO file-transport channel exists in the runtime (verified; `express.json` 1MB is
  the only ingress). An octet-stream route bypasses it — streaming 20MB is feasible.
- Supabase Storage cannot enforce a client-declared checksum; `upsert=false` is
  first-writer-wins, not WORM; `move` is destructive → readback verification +
  content-addressed-never-move.
- Vercel Functions cap bodies at 4.5MB → bytes go browser→Fly directly (CORS).
- Incumbent consensus: suggestions always run post-OCR; auto-action only via
  deterministic human-authored rules; no raw confidence numbers; abstention is
  structural → S5-D2.
- Correction precedents (Xero find-and-recode/recode-via-journal, Sage atomic
  reverse+repost, QBO privileged compound undo, Dext stepwise) → S5-D3 hybrid.
- Step-retry law (Slice-4, proven): whole-step re-invocation re-calls the vendor —
  OCR persistence idempotent by (document, engine, version); duplicate vendor
  spend bounded-accepted.
- Round-1 verified as-built facts now load-bearing: `_tf_validate_domain_event`
  reads `d.client_id` (0005:190-195); the documents stamp trigger reads
  `new.client_id` (0003:229); the relay is a single `router` consumer whose only
  action is wake-intent projection, `ignore ⇒ checkpoint only` (relay.mjs:357);
  chatTurn v1's history mapping keeps only text/clarify parts (impl.ts:324-338);
  `assert_books_current` treats null-client events as relevant to every client
  (0005:510-517); journal status allows only `draft|approved` (0003:101);
  reversal mirrors carry NO document_id (0004:576-583) — so filing-bound belt
  checks do not fire on mirrors; `parts[]` allows `{type:'attachment'}` today
  (0006:503-504); `agent_tasks` is closed-world (kind CHECK + triggers).

---

## 3. Migration `0007_document_pipeline.sql`

**The full migration design — §3.0 (documents evolution + client_id drop blast
radius), §3.1 (filings + filing-bound provenance), §3.2 (intakes), §3.3
(extractions/regions), §3.4 (attribution), §3.5 (correction + withdrawn + lock
order), §3.6 (metering reservations), §3.7 (events + taxonomy v2 +
[DELTA-OWNER-3]), §3.8 (storage credential contract), §3.9 (processing tasks),
§3.10 (RLS/grant matrix) — lives in `slice5-migration-0007-design.md`.** It is
part of this contract; §3.x citations elsewhere in this file resolve there.

---

## 4. Runtime design

### 4.1 Intake transport (S5-D1) — hardened
Routes as designed with §3.2's authz/token/lease semantics. Stream path: spool on
the Fly volume (encrypted-at-rest posture, quota, TTL sweep, snapshots disabled;
transport state only) → size/type caps + magic-byte sniff (CSV/TSV: extension +
parse-probe — no magic bytes) → **local malware scan** (scanner subprocess with
fresh signatures — e.g. clamd; NEVER a public scanning API for client PII) +
archive/entity bombs bounded (OOXML zip entry count/ratio/uncompressed caps; XML
entity expansion limits) → incremental sha256 → canonical upload → readback
re-hash → finalize. `malware_detected`/`quarantined` intakes never reach
canonical storage (delete-never is never threatened by hostile bytes); spool
unlinked immediately after successful finalize. Concurrency: global ingress 2,
browser 2, backpressure end-to-end, zero whole-file buffering. Failure windows +
recovery per the archived S5-D1 failure table + §3.9's reconciler.

### 4.2 `documentIngest_v1` (frozen workflow)
Input: `{task_id}` only. Steps: claim task → (lane ocr) mint storage read
credential INSIDE the step → download → Azure DI call with hard total deadline
surviving the 429 branch → normalize ONE envelope + regions → audited persist,
idempotent on (document, engine, version), emitting
`document.extraction_completed` same-txn → settle metering with actual pages.
(lane structured_parse) → §4.3 parser in a worker thread → same persist path.
(lane none — XML/e-invoice) → mark `stored_unparsed`, settle/refund. Bytes and
credentials never transit step IO. `chatTurn` remains v1.

### 4.3 Structured-parse lane (S5-R8)
Deterministic parser for XLSX/CSV/DOCX **isolated in a worker_thread** (the
supervisor's event loop must never run parse CPU — SSE liveness is a §6 gate),
concurrency 1, memory-capped; values only (macros never executed; formula
results only); encrypted/corrupt → `extraction_failed` with honest code.
Emits the same vendor-neutral extraction events + cell/row/paragraph locators.

### 4.4 The matcher consumer (net-new spine infrastructure)
The relay layer is **generalized to registered consumers**: each consumer has
its own name, leader advisory-lock key, `(consumer, firm)` checkpoint stream
(schema already carries `consumer`), batch loop, dead-letter lane, and a /ready
warn signal (consumer lag). The as-built `router` keeps its exact semantics
(taxonomy → wake intents). The new **`matcher`** consumer subscribes to
`document.extraction_completed` only, and per event runs the S5-D2 lanes inside
one idempotent transaction (attempt row is the replay key; writers per §3.4).
No wake credential, no LLM, no held tasks. Cross-tenant boundary: firm derived
from the event/document row; every query firm-scoped in SQL; nothing
client-scoped loads before assignment.

### 4.5 Chat + dashboard integration (S5-R3 as amended)
Composer → intake route (`origin='chat'`, session predicate enforced); submit
blocks on adoption; the `{type:'attachment', document_id, intake_id}` part is
included in `p_user_parts` at `begin_chat_turn`. The chip renders from the part
+ polls the masked intake/task status view; re-derives on hydrate (D-4/D-5);
content-hash dedupe (D-10); no success state before the DB row exists; copy
states Clara's Slice-5 non-perception honestly ([DELTA-OWNER-2]). `/documents`
plumbing page: FIFO lane + zero-client escape hatch (GAP5-7), bulk queue with
per-file retry, triage verbs (file/dismiss candidates), correction wizard entry.
JSON routes ride the Next proxy; bytes go browser→Fly (CORS allowlist).

### 4.6 Egress gate flag (S5-R1)
`CLARA_DOC_EGRESS_APPROVED` (default `0`): OCR-lane steps refuse pre-vendor-call
→ `extraction_status='held_egress'` (visible, retryable). The flag may be set to
`1` in a deployed environment ONLY against the evidenced S5-R1 bundle
([DELTA-OWNER-1]). Tests use a test adapter — the real vendor adapter has no
dev bypass. Structured-parse + store-only lanes never egress and run regardless.

### 4.7 Retention + legal hold (S5-R9)
As ruled: `unanchored` state (NULL retain_until, undeletable) → first filing
anchors (FY-end + filing offset + 7y; conservative when FY data is missing —
surfaced as a gap); MAX across active filings; floor-never-shorten on anchored
values; retiring the LAST filing returns the doc to `unanchored` (the anchored
history is preserved in audit; the clock never shortens on re-anchor).
`place_legal_hold`/`release_legal_hold`: admin+ floor, reason, audit_log.

### 4.8 Env contract additions
`AZURE_DI_ENDPOINT`, `AZURE_DI_KEY` (service layer only), `CLARA_DOC_EGRESS_APPROVED`,
storage: URL + the §3.8 role JWT (+ rotation), spool dir/quota, scanner socket.
Short DB txns ride the existing runtime pool (no third pool; no connection held
across upload/scan/vendor calls) — the 17-session budget stands.

---

## 5. Deploy

Behind the ruling-7 ceremony. Additions: Fly volume (snapshots disabled, quota,
TTL) — still ONE non-HA machine; CORS origin env; §4.8 secrets (names only);
**Fly transport limits configured + tested of record**: idle/request timeouts
for 20MB streams, route admission (the single machine gets no LB protection),
and the `fly-replay` 1MB body caveat noted (no replay-dependent routing on the
intake paths). PostgREST must expose `clara` (existing checklist item — filings/
corrections now exercise it). Deploy doc records the Azure DI pin (tier, region,
limits) + the scanner signature-update mechanism.

## 6. Tests / verification

Contract-blind rig lane (never reads 0007) + state-transition acceptance (an
observable UI + DB assertion per lifecycle transition and per failure code).
Round-1-driven additions: **belt-vs-correction commit proof** (correction txn
commits with the belt DEFERRED and the filing retired — the §3.1 two-layer
design's load-bearing test); **enqueue-crash drill** (kill between finalize
commit and workflow start → reconciler re-enqueues the queued task);
**reservation storms** (concurrent admissions cannot overshoot pages/day;
refund idempotency on every terminal path; adopted duplicates share one
charge); **retention state proofs** (unanchored→anchored→max-across-filings;
floor-never-shorten; last-filing-retired returns unanchored); **AV fixtures**
(EICAR, zip-bomb OOXML, entity-expansion XML → quarantined, storage untouched);
**intake token/lease proofs** (replay, concurrent PUT exclusion, non-oracular
404s, fixed op_key CAS finalize); **lock-order deadlock probe**
(pg_blocking_pids, posting-vs-retirement); matcher idempotency (re-delivered
event → one attempt); withdrawn-status predicate sweep (close gate/TB/listings
exclude it); cross-firm isolation on every new table; grant-matrix probes
(§3.10, incl. agent_ro pack reads and human-lane PostgREST writers); freshness
amendment proof (unassigned ingest no longer stales; document.filed does);
freeze-lint (documentIngest_v1 frozen + registered); taxonomy v2 full-coverage;
SSE liveness under ingest + parse load; load ceilings measured (100-file batch,
20MB files, dup storms, 429 throttling).

## 7. What does NOT change

Migrations 0001–0006; `chatTurn.v1` + closure; the chat book-write floor; the
four structural invariants' guarantees (provenance gains the stronger
filing-bound shape); sessions private-by-default + masking; trace vendor path
ABSENT; spike schemas + parked run until the ceremony; `main` PR-only; secrets
discipline.

## 8. Edge-case ledger (PM-rigor)

All v1.0 entries carry forward, amended/extended: password/corrupt/oversize →
intake FAILS pre-finalize (not evidence until verified) · malware/zip-bomb →
quarantined, never canonical · duplicate sha racing intakes → one finalize wins,
second adopts, ONE charge + task + event · shared HARD identifier across
sibling clients (one bank account, two related companies) → representable, lane-1
abstains with recorded conflict · legacy claim-only documents → filable,
visible, UNCITABLE for new drafts until verified re-upload · unassigned doc
retention → unanchored state (no sentinel) · last filing retired → back to
unanchored, clock preserved · correction touching closed periods → HARD-BLOCK
at approve (v1) · correction on a doc filed to A+B, only A wrong → B untouched ·
partially reversed sets → stale-plan reject; operate only on unreversed ·
pending reversal drafts → adopt on exact hash else supersede · withdrawn drafts
visible in history, excluded from gates/TB · uploader leaves firm mid-intake →
lease expires, intake fails honestly · chat session shared later → part carries
document_id only; doc was firm-visible from persist · intake during
drain/SIGTERM → intake stops first; spool + queued tasks survive restart ·
Azure regional outage → bounded retries → extraction_failed, batch continues ·
CSV with no magic bytes → parse-probe admission · XLSX formulas/macros → values
only · client with no FY-end → conservative anchor + surfaced gap ·
firm at pages/day mid-batch → per-file honest rejection, queue continues.

## 9. Document-kind taxonomy (proposal — owner red-line)

`invoice, receipt, credit_note, debit_note, bank_statement, payment_voucher,
claim_form, payroll_summary, tax_correspondence, ssm_company_doc,
agreement_contract, e_invoice_xml, management_account, opening_balance_doc,
knowledge_artifact, handwritten_note, other` — nullable at ingest; metadata,
never a gate, in v1.

## 10. Finding-integration map (audit)

As v1.0, amended: E-3 → superseded by S5-R4 (owner-ratified) · HIGH-12 → S5-D1
readback verify + **both** legacy ingest writers retired (§3.0.5) · E-9 →
S5-D2 + the §3.4 representable-conflict design · GAP3-4/3-5 → S5-R9 honest
states (§4.7) · E-5 → derived lane + derived extraction_status · E-6 →
supersede-with-lineage · E-8 → §4.2 deadline · E-13 → S5-R5 filings ·
MEDIUM-18 → §3.3 extraction facts · I-12 → ONE envelope · J-18 → regions +
locator union · D-5/D-10 → §4.5 chip · GAP5-7 → lane FIFO + escape hatch ·
E-10/E-11/E-12 → §4.1/§3.7 (unchanged from v1.0).

## 11. Follow-ups (recorded, not built)

As v1.0, plus: `chatTurn_v2` + firm-scoped unassigned-document read tool
(Slice 6, with the write floor) · reopen/authority model for closed-period
corrections · operator surface + global receipts for `activate_taxonomy_version`
beyond the migration path · TUS · storage-credential rotation automation ·
export_artifacts retention inheritance · eval-gated model attribution
(schema-ready: attempts/candidates carry matcher_version).

## 12. Delta log — design-review round 1 (all findings accepted)

Native lane (FLAWED): C1→§3.0.2 · C2→§3.7+§4.4 · C3→S5-R3/[DELTA-OWNER-2]+§4.5
· H1→§3.0.3/.5 · H2→§3.10 · M1→[DELTA-OWNER-3]§3.7 · M2→§3.7 ingested→ignore ·
M3→§3.7 full routing · M4→§4.3 worker isolation · M5→S5-R3 submit-blocks ·
L1→§3.2 explicit-selection filing · L2→§4.1 CSV probe · L3→§8 · L4→§3.0.1
no-resolution backfill · L5→§3.4 recorded surface. Codex lane (FLAWED):
C1→§3.0.5 both writers · C2→§3.0.1 + citability law · C3→§3.1 filing-bound
two-layer · C4→§3.9 durable tasks · C5→[DELTA-OWNER-1] S5-R1 bundle ·
H1→[DELTA-OWNER-2] · H2→§3.7/§4.4 · H3→§3.0.2 · H4/H5→§3.2 · H6→§3 house rule
+ §3.10 · H7→§3.5 withdrawn + lock order · H8→§3.6 reservations · H9→S5-R9
states · H10→§4.1 scan · M1→§3.3 events + locators · M2→§3.4 aliases/op-keys ·
M3→§3.7 migration-executed activation · M4→§3.8 credential contract.
Cross-check addendum: expected_revision→S5-D3 · closed-period block→S5-D3 ·
intake masking mechanism→§3.2 · fly limits→§5 · S5-R3 wording→§0 · matcher
net-new→§4.4 · AV→§4.1.

## 13. As-built amendments

*(Reserved — filled by the ladder's output.)*
