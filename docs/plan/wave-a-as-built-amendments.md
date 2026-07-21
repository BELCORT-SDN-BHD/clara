# Wave-A — as-built amendments (§13 of the daily-loop contract) · v1.0

**This file IS §13 of `wave-a-daily-loop-contract.md`** — split out per the S5/S6
precedent (500-line cap). Same normativity: where an amendment below contradicts the
contract (`wave-a-daily-loop-contract.md` v1.1) or the companion
(`wave-a-migration-0011-design.md` v1.1), the amendment is the as-built law of record.
Process of record: interface-pins first (`INTERFACE-PINS.md` — PIN-DELTAs 1-4, PIN-ADDs
1-2, PIN-ANSWERS §5b, PIN-RESOLUTION-1) → five build lanes with a CONTRACT-BLIND rig lane
→ integration (a 58-failure triage on a clean-slate re-baseline: ENV 1 · LEGACY_ADAPT 17 ·
UNPINNED_0011 4 · REAL_DEFECT_0011 7 · BLIND_DIVERGENCE 12 · FIXTURE_DEFECT_B 15 · FLAKE 1;
the seven real 0011 defects folded — AB-8..AB-11) → as-built dual review (TWO independent
live-verifying native lanes, each FLAWED, each carrying one HIGH the other did NOT find —
AB-13, AB-14 — plus two LOWs; the Codex review lane failed twice, substituted) → a fix
round → final gates. Review evidence: `.tmp/wave-a-build/{asbuilt-review-native,
asbuilt-review-indep,FIX-ROUND-2-PLAN,TRIAGE-RESULTS}.md` and the five lane REPORTs.

## Interface-pin amendments (reconciliations surfaced at dispatch — INTERFACE-PINS.md)

- **AB-1 (PIN-DELTA-1 — the autodraft wake allowlist is SIX rows, not five).** Companion §4
  names five fns "exactly"; the §13 tail-asserted enumeration (the authoritative one) also
  grants `wake_open_question` to the autodraft kind, because `open_questions.origin` includes
  `sweep_refusal` and that path needs a writer. As-built `wake_fn_allowlist` carries six
  `('autodraft', …)` rows: `wake_draft_entry`, `get_document_extract`, `get_context_pack`,
  `get_draft_review`, `coding_lane`, `wake_open_question`. §4's "nothing else" reads as "no
  list fns, no approve-shaped anything". Opening a question only DEMOTES lanes (fail-safe), so
  the sixth row cannot widen the write floor.
- **AB-2 (PIN-DELTA-2 — read-surface allowlist enforcement for NEW wake kinds; the
  `_agent_read_admitted` helper added at integration).** As-built, `wake_fn_allowlist` bound
  only WRITERS (`assert_wake_allowed` was called by the `wake_*` writers), so nothing stopped
  an autodraft credential from calling a granted READ (`list_uncoded_filings`, etc.). Two
  enforcement shapes ship, both fail-closed for the new kinds and byte-identical for the two
  legacy kinds (`interactive`/`proactive`): (a) the three 0009 SECURITY INVOKER readers
  (`list_unassigned_documents`, `list_uncoded_filings`, `get_journal_entry_for`) gain a
  prologue calling the NEW `_agent_read_admitted(p_fn, p_client)` DEFINER helper (granted
  `clara_agent_ro` only, added at integration in fix round 1) — new wake kinds collapse onto
  the allowlist + the C-11 client-pin WITHOUT converting their RLS-scoped bodies (deliberate:
  no oracle rework); (b) the five converted DEFINER readers enforce the allowlist inline (see
  AB-8). `get_coding_attempt` stays the runtime-only recovery read.
- **AB-3 (PIN-DELTA-3 — the ClaraPart union is canonical DASHBOARD-side; runtime frozen
  unions untouched).** The runtime's three `ClaraPart` unions live in FROZEN
  `chatTurn*.prompt.ts` files (workflow immutability forbids editing them; freeze IMPORT-ESCAPE
  law forbids a frozen file importing a shared workspace package). The canonical union
  therefore lives in `apps/dashboard/app/shared/parts.ts` (9 existing + 5 new types:
  `doc_review`, `diff`, `sweep_receipt`, `kb_rule_proposal`, `open_question`); `app/chat/api.ts`
  (NOT frozen) re-exports from it; `partCatalog` covers the full union and the parity gate
  gains runtime-wire fixtures (closing the `attachment` cast-gap dashboard-side). Runtime frozen
  unions stay as-is; a future workflow version converges.
- **AB-4 (PIN-DELTA-4 — document bytes need a NEW runtime route).** The dashboard had no
  document byte-fetch (extraction-verified: `storage_path` was fetched but never used; no
  signed-URL helper existed) and the browser must never hold a storage credential. As-built:
  `GET /api/documents/:id/bytes` (new `src/documentRoutes.ts`) — human JWT → `resolvePrincipal`
  → the NEW DB fn `get_document_for_human_read(p_document, p_user)` (SECURITY DEFINER,
  `clara_runtime`-granted, validates an ACTIVE membership in the document's firm, returns
  `{storage_path, mime_type, byte_size, sha256}`, CLR11 single-shape) → the runtime streams
  bytes with its own `clara_storage_docs` credential. `doc_review` consumes this route
  (Bearer session JWT).
- **AB-5 (PIN-ADD-1 — `list_document_autodraft_candidates`).** The event-path resolver added
  to the pins AFTER Codex Lane A launched; PRESENT in the as-built 0011 (fn + grant + tail
  matrix). `document.invoice_facts_completed`/`_failed` carry NO client (P4), and `clara_runtime`
  holds no SELECT on `document_filings` (0007 grants it to authenticated/agent_ro only, and
  0008's runtime read surface omits filings), so the consumer resolves a document → its ACTIVE
  firm-scoped filings through this DEFINER fn. Minimal shape by design (raw active filings, not
  candidate-filtered): admission re-evaluates the lane (WA-L8).
- **AB-6 (PIN-ADD-2 — `get_doc_entry_diff` locator geometry).** ABSENT from Lane A's delivered
  0011; added at integration via a pre-merge migration edit (lawful — 0011 was applied nowhere
  durable; the polluted `clara_test` was dropped). The envelope now carries
  `doc_region_locator_kind` + `doc_region_locator` — the region's verbatim
  `document_regions.locator_kind`/`locator` jsonb, so a `page_polygon` carries page + polygon
  coords and the doc_review overlay can render polygon chips (contract §5/WA-R8); NULL on
  no-region rows. Geometry lives in the read ENVELOPE, never the UI — the contract's "region
  polygons" are unreachable without this field.
- **AB-7 (PIN-RESOLUTION-1 — interactive `wake_open_question` stays granted + allowlisted but
  FAILS CLOSED, CLR03).** A real pins contradiction, ratified. The
  `('interactive','wake_open_question')` allowlist row and the grant to
  `clara_wake_interactive` both exist (catalog law), but the interactive branch raises CLR03
  "client authority is not pinned" because interactive credentials carry `client_id = NULL`;
  only an autodraft credential with `w.client_id = p_client` proceeds. `chatTurn_v3` is frozen
  WITHOUT an open_question tool, so the interactive grant is unreachable in Wave A, and the
  chat-lane path for questions is `clarify → promote_clarify_to_question` (human-mediated) per
  contract. A future `chatTurn_v4` that adds the tool MUST first ship the client-bound
  chat-credential design.

## Integration fix-round amendments (the seven REAL_DEFECT_0011, on a clean re-baseline)

Seven `REAL_DEFECT_0011` test-failures collapsed to THREE code roots (AB-8..AB-10); two
`UNPINNED_0011` guard removals rode the same fix round (AB-11). All bootstrap-proven clean on a
fresh scratch DB after the edits; shared DBs re-baselined (checksum-drift law). Root cause of
the pollution that spawned the noisy 372/58 pre-triage run: the orchestrator's own full-suite
`pipeline.test.mjs` auto-applied the WIP 0011 sitting in `migrations/` against the shared
`clara_test` — an ops lesson (never run the full db suite against a shared baseline while a WIP
migration exists in the tree), not a defect signal.

- **AB-8 (THE BIG ONE — the dead `current_role='clara_agent_ro'` gate in the five converted
  DEFINER readers → a wake-secret GUC gate).** REPORT-A item 13 converted five formerly
  SECURITY INVOKER agent readers (`get_document_extract`, `get_context_pack`, `get_draft_review`,
  `get_entry_diff`, `get_doc_entry_diff`) to explicitly-scoped DEFINERS so the PIN-DELTA-2
  prologue could read the fn-fronted `wake_credentials`. But they kept the invoker-era lane
  detector `if current_role='clara_agent_ro'` — DEAD CODE under SECURITY DEFINER (ADR-015: SET
  ROLE is invisible; `current_role` inside a definer fn is the owner `clara_fn_owner`, never the
  caller), so EVERY agent read fell through to the human branch → `_human_ctx` → `jwt_sub()` null
  → CLR04 "no authenticated actor". The whole agent read lane was broken. **Fix:** gate on the
  wake-secret GUC presence (`current_setting('clara.wake_secret', true)`) — the structural lane
  marker — plus the inline `assert_wake_allowed` for new kinds. **Adjudicated semantics (both
  honest, documented divergence):** a garbage/invalid secret → CLR03 (agent branch;
  `wake_context()` finds no live credential — the hash+liveness check is the real gate); a
  SECRETLESS `clara_agent_ro` session (no identity at all) → the human branch's CLR04
  (legacy-preserving) in these GUC-gated readers; the new `coding_lane` (already correct) yields
  CLR03 there via a null `wake_firm()`. A HUMAN CAN set the GUC — it is a USERSET dotted GUC —
  but that is NOT a bypass: a human who sets a non-live value enters the agent branch and gets
  CLR03, never data. The oracle surface of all five readers was then adversarially
  live-confirmed SOUND by both dual-review lanes (every table access anchored on a
  firm-validated row).
- **AB-9 (`content_hash` bytea → hex on the sighting-threshold rule proposal).**
  `approve_entry`'s ≥3-distinct-sighting crossing INSERTed the proposed `coding_rules` row with
  `content_hash => clara._hash(...)`, but `clara._hash` returns BYTEA; coerced into the text
  column it rendered `\x`+64hex (66 chars) and violated `content_hash ~ '^[0-9a-f]{64}$'` →
  23514 on every third same-vendor+account approval (it also aborted unrelated concurrency
  probes that happened to be the crossing). **Fix:** `encode(clara._hash(...), 'hex')`, matching
  the merge/`propose_coding_rule` sibling idiom (bare 64-lowercase-hex).
- **AB-10 (the `c` → `hc` CTE-alias collision in `get_document_extract`).** The DEFINER
  conversion added a local `c record` (assigned `clara._human_ctx(...)` in the human branch), but
  the extract-building query reuses `c` as the `chosen c` CTE alias; PL/pgSQL bound the qualified
  `c.id` to the record VARIABLE (no `id` field) → 42703 "record c has no field id" on BOTH lanes,
  independent of the gate. **Fix:** rename the local record to `hc` (and its `_human_ctx`
  assignment); the `chosen c` alias and its `c.*` column references are untouched.
- **AB-11 (two UNPINNED_0011 guard removals).** (a) `mint_wake_credential` gained an unpinned
  TTL-positivity guard (raised CLR10 on non-positive TTL), which broke the legacy expired-credential
  mint technique (`ttl '-1 minute'`) the rig uses to exercise the expiry path; a repo-wide sweep
  found exactly one consumer and no runtime dependency (pools use positive TTLs) → REMOVED. (b)
  `list_review_queue` raised CLR10 for `p_limit > 200` — an unpinned cap neither §5a nor the
  companion mandate; the sibling `list_unassigned_documents` CLAMPS to 500 → changed to
  `least(greatest(coalesce(p_limit,50),1),500)`.
- **AB-12 (the WA-D1 egress lane-carve reshaped the rig — legacy adaptation of record).** Most
  of the 17 `LEGACY_ADAPT` failures were the invoice_facts consent gate working as pinned:
  `claim_document_processing_task` now fails CLOSED to `held_egress` (`{clr:'CLR28',
  reason:'no_consent'}`) unless EVERY active-filing client of the document holds a live
  `client_egress_consents` row (kill-switch AND consent). The pre-Wave-A fixtures
  (`readyFiling`, `s6-invoice-facts`, `s6-locks`, `s6-metering`) claimed without granting, so
  they now grant consent (`grant_client_egress` as the firm owner) before the claim. Two other
  WA laws drove adaptations: WA-D5 attestation (an agent-made high-stakes draft now needs a
  non-blank attestation — `rig-invariants` T7, `s6-writefloor`), and the new grant matrix (39
  new per-role EXECUTEs, all pin-correct — `rig-meta.mjs` ALLOWED extended, no lost grants). The
  migration is contract-correct in every case; the TESTS adapted (S5 legacy-adaptation
  precedent).

## As-built dual-review fix-round amendments (two independent HIGH + two LOW)

Two independent native lanes each returned FLAWED with a NON-OVERLAPPING HIGH — the dual-lane
value. Both HIGHs orchestrator-verified in-code and fixed; the security oracle surface
(the five DEFINER readers) was CONFIRMED-SOUND by both.

- **AB-13 (CLR26 document-scope was check-then-act; the shipped test was VACUOUS — native HIGH).**
  CLR26 serialization held for VENDOR and CLIENT scope (approve and the question writer both take
  an EXCLUSIVE `pg_advisory_xact_lock` — 203005003/203005004), but NOT for DOCUMENT scope: both
  approve and the document-scope question writer took only `_active_document_filing(..., true)` =
  FOR SHARE, and two FOR SHARE on one row are compatible → a live-reproduced window where a
  document-scope question commits mid-approve and the approval commits anyway (one approval past
  one question; recoverable — reversible, question stays open — hence HIGH not CRITICAL). **Fix
  (as-built of record):** the document-scope question writer is upgraded to take the filing FOR
  UPDATE while approve keeps FOR SHARE, so SHARE-vs-UPDATE conflicts and serializes the two.
  **An advisory-lock first attempt (a new constant 203005006) was REVERTED** — it flooded the
  lock graph and tripped the documented truncate-vs-writer harness deadlock (the
  rig-truncate-deadlock lesson: an AccessExclusive-seeking TRUNCATE test starves against
  continuous advisory-lock writers). The compounding half — `wave-a-clr26.test.mjs::bothOrders`
  early-returned on a null `counterpartyId` because counterparties are BORN at approve, not
  draft, so all three scope assertions asserted NOTHING — was fixed by pre-birthing the
  counterparty so the document-scope assertion genuinely fails pre-fix and passes post-fix.
- **AB-14 (a sweep run never finalizes when its expected set includes an in-flight filing —
  indep HIGH).** `admit_autodraft_task`'s three `noop_existing` short-circuit branches (the two
  active-registry returns + the unique-violation race branch) returned WITHOUT writing a
  `sweep_run_item`, unlike the parked branch — and `reconcile_sweep_runs` finalized only at
  `item_count >= expected_count` (expected is fixed + immutable at `open_sweep_run`). A filing
  that admits `noop_existing` (an in-flight task from a prior window, reachable on the normal 300s
  catch-up) left the run permanently one item short → open forever → accumulates → trips
  `max_concurrent_sweeps=2` → the autodraft lane wedges firm-wide (availability, not correctness;
  no wrong number, no leak). **Fix:** all three `noop_existing` branches now write a run-bound
  `noop_existing` `sweep_run_item` `on conflict do nothing` when `p_run_id` is non-null (mirrors
  parked); PLUS the PIN §5b(E) staleness finalize in `reconcile_sweep_runs` — an OPEN run older
  than 30 min with NO bound attempt still in a non-terminal task state finalizes with actual
  counts (guarded so it can never cut off an in-flight draft). Regression coverage added to the
  Lane B battery.
- **AB-15 (two LOWs applied; one benign idiom left as-is).** (a) `INVOICE_ID_LABEL` in
  `invoiceFacts.v1.azure.mjs` dropped `reference|ref|document|doc` — those broad anchors could
  recover a delivery-order/customer ref into `invoice.invoice_id` and arm the duplicate-bill key
  (already mitigated: same-vendor + human CLR21 + override, and never Tier-A since a
  content-recovered id carries an empty polygon and is non-monetary); dropping them removes a
  real false-positive surface on a gate-feeding value at zero known recall cost. (b) The five
  DEFINER readers' lane-gate COMMENT wrongly claimed a human "can never set" `clara.wake_secret`;
  rewritten to state the truth — a human CAN set the USERSET GUC, but a value that is not a live
  wake secret yields CLR03 via `wake_context()`; the credential check, not GUC unreachability, is
  the gate (a maintainer trusting the false comment could weaken the real control). (c) LEFT
  AS-IS: `get_entry_diff` echoes `{entry_id, revisions:[]}` for an in-scope-but-nonexistent entry
  vs the other four readers' bare `null` — benign (the query is firm+client-sealed; the object/null
  split falls only along the caller's OWN known binding, revealing nothing cross-tenant), an idiom
  inconsistency not worth a null-shape change that could confuse the diff consumer.

## Owner-visible product facts (as-built behavior, not a defect)

- **AB-16 (WA-R2 — registered vendors are NOT sweep-READY as-built because invoice_facts captures
  vendor NAME only).** `invoice_facts` records a vendor NAME with no registration field, and the
  registration-dominant identity law correctly treats a name-only match against a REGISTERED
  vendor as AMBIGUOUS (`registered_name_ambiguous`) → NEEDS REVIEW, never READY. On the real
  corpus (vendors birthed WITH registrations) the auto-draft sweep therefore admits few or zero
  bills, and contract §11's "17-bill replay THROUGH the sweep path (READY subset)" shows a small/
  empty READY subset until the vocabulary is widened. This is the registration-dominant law
  working as ratified — NOT a defect — but the sweep's real-world value depends on the owner
  ruling below. (Discovered when Lane B's `primeReadyFiling` never reached READY, revealing that
  every admitted-chain assert had been vacuous until a name-only vendor was used; the reserve→settle
  arithmetic is now genuinely proven.)

## Residuals — FOUR OPEN owner decisions (do NOT resolve without the owner)

1. **CLR26 rule-proposal blocking.** An auto-opened ≥3-sighting rule-PROPOSAL question currently
   BLOCKS the vendor's next approval (CLR26) until a human resolves it — so a ROUTINE vendor's
   bills start blocking exactly when the system learns the vendor is routine, inverting WA-R9's
   "proposal, not stop" intent (post-deploy this bites RPA's 6+ bills). BOTH dual-review lanes and
   the orchestrator recommend **option (a): exclude `origin='rule_proposal'` from
   `_open_question_blocks`** (a one-predicate change; `rule_conflict`, `clarify_promotion`,
   `manual`, `sweep_refusal` keep blocking; the paired rule stays `proposed`, never auto-applied).
   It SHIPS blocking (conservative, defensible either way) until the owner rules.
2. **Registered-vendor sweep readiness (AB-16).** Additive vocabulary follow-up: an
   `invoice.vendor_registration` facts field (Azure prebuilt-invoice `VendorTaxId` exists) + mapper
   + lane resolution — the AB-3 (S6) engine_kind pin already protects the matcher read. Owner
   chooses this vs accepting unregistered-vendor-only sweep coverage for the Wave-A ship.
3. **PDF-page polygon overlays.** doc_review renders polygon chips for IMAGE documents only;
   PDF-page geometry needs pdf.js and degrades honestly to a page-jump today (no fabricated
   geometry — PIN-ADD-2's envelope carries the coords when they exist).
4. **`keyValuePairs` billable extraction feature.** Left OFF; the shipped content-scan recovers
   every LABELLED invoice number (including the Malay "No. Invois" anchor) at zero billable cost —
   the KV delta is exactly ONE shape (an invoice number printed with no recognizable label).
   Owner-flippable (the `&features=keyValuePairs` request line + comment record billable +
   owner-flippable) only if live re-extraction shows unlabelled-number misses.

Standing Wave-A residuals also carried forward: contract §12 out-of-scope confirmations; the
per-client egress registry now SHIPS (WA-R2 superseded the S6-R1 RPR-only gate — owner-declared
2026-07-21); the AB-3 (S6) `engine_kind` pin remains the first statement block of migration 0011.
