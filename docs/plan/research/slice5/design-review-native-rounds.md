# Native-lane design review — rounds 1 + 2 (verbatim reports)

Reviewer: fresh-context native Opus subagent (`s5-design-review-native`),
adversarial, read-only, live-verifying against the as-built SQL/runtime.
Round 1 targets contract v1.0; the delta round targets v1.1 (+ companion).
Every load-bearing claim in both reports was independently re-verified by the
orchestrator against the cited SQL/runtime lines before acceptance.

---

## Round 1 (v1.0) — VERDICT: FLAWED

- **S5-NR-C1 CRITICAL** — Dropping documents.client_id breaks the domain-event
  append path: `_tf_validate_domain_event` (0005:190-195) reads `d.client_id`
  on EVERY domain_events insert carrying a document_id; plpgsql is late-bound,
  so every Slice-5 document event fails at runtime. Fix: replace the validator
  with a filings lookup before the drop.
- **S5-NR-C2 CRITICAL** — The DD-2 matcher does not fit the as-built relay:
  single `router` consumer (relay.mjs:35); the only per-event action is
  taxonomy→wake_intent; `ignore ⇒ checkpoint only` (relay.mjs:357) — under the
  contract's own routing the matcher would never fire. Net-new consumer
  infrastructure required.
- **S5-NR-C3 CRITICAL** — Chat attachments invisible to Clara with chatTurn v1
  frozen: `messageFromParts` keeps only text/clarify (impl.ts:324-338); an
  attachment-only user message is dropped from history; an unassigned document
  appears in no client pack; no unassigned-doc read tool exists.
- **S5-NR-H1** — client_id drop also strands `_ingest_document_core` (inserts
  client_id, 0005:777) + the documents stamp trigger `_tf_stamp_from_client_or_
  session` (reads new.client_id, 0003:229-242).
- **S5-NR-H2** — RLS/read grants for new tables unspecified; get_context_pack
  is SECURITY INVOKER (0005:528) — agent_ro needs policies/grants on filings/
  extractions or packs read empty; clara_runtime RLS is using(true) → matcher
  SQL must hard-scope firm_id.
- **S5-NR-M1** — Freshness over-invalidation: post-S5 every ingest is
  unassigned → null-client event → `assert_books_current` (0005:510-517)
  stales EVERY client on every upload.
- **S5-NR-M2** — document.ingested→background_review leaves one held wake row
  per document with no consumer (contradicts DD-2).
- **S5-NR-M3** — Taxonomy routing for filed/retired/correction unspecified
  (full-coverage law; router dead-letters uncovered types).
- **S5-NR-M4** — CPU-bound structured parse on the shared machine stalls SSE;
  no isolation mechanism named.
- **S5-NR-M5** — chat_messages is append-only; the user row inserts at
  begin_chat_turn — "append attachment on adoption" is impossible; the part
  must be present at submit.
- **S5-NR-L1** — Finalizer "optional filing" contradicts every-filing-human.
- **S5-NR-L2** — CSV has no magic bytes; sniff cannot validate it.
- **S5-NR-L3** — Shared hard identifier across sibling clients unrepresentable
  under UNIQUE(firm, kind, value).
- **S5-NR-L4** — Backfilled method='human' resolutions dishonest for wake
  ingests (uploaded_by = agent).
- **S5-NR-L5** — record_rule_resolution widens the runtime's write surface
  into client_resolutions — record it; keep confidence in-fn.
- Verified-sound list: reversal mirrors carry no document_id (belt does not
  fire on them); streaming intake feasible; {type:'attachment'} DB-legal;
  agent_tasks masking precedent real; taxonomy activation gap real;
  filing-based provenance mapping sound if validator+fns replaced together.

Cross-check addendum (sub-agent): ADR/contract wording + research-verdict
gaps — AV scan omitted from §4.1; Fly transport limits unaddressed;
retire primitive missing expected_revision; closed-period exposure ≠ block;
intake masking mechanism unspecified; S5-R3 "narrows of record" wording; the
matcher is net-new vs the single-consumer relay; taxonomy activation fn gap
is genuinely open at code level (PROJECTLOG :105).

## Delta round (v1.1) — Part A: ALL 25 round-1 findings RESOLVED (each with
mechanism, verified). Part B — NEW findings:

- **S5-ND-1 HIGH** — journal_entries.filing_id backfill unaddressed: existing
  document-citing APPROVED entries violate the paired CHECK at ADD CONSTRAINT,
  and `_tf_entry_immutable` (0003:371-390) rejects the backfill UPDATE itself
  (only the reversal-linkage pair may change). Migration-apply blocker: lock →
  add nullable → backfill (trigger disabled in-txn) → CHECK NOT VALID →
  VALIDATE.
- **S5-ND-2 MED** — Two-layer provenance needs the WRITER rework specified:
  `_draft_entry_core` (0004:127; shared by both lanes) must derive+stamp
  filing_id server-side; approve_entry re-affirms.
- **S5-ND-3 MED** — Post-0007 nothing can create a citable document in pure
  SQL: seeds + the contract-blind rig lose their document path; a
  no-app-role-EXECUTE seed helper + a transport-true fixture are required.
- **S5-ND-4 MED** — "retain_until NULL iff unanchored" contradicts
  "clock never shortens on re-anchor": a monotonic trigger cannot floor
  against a NULLed value; keep the value populated across unanchor.
- **S5-ND-5 MED** — Withdrawn-exclusion sweep omits get_context_pack
  recent_entries (0005:557-564 — no status filter).
- **S5-ND-6 LOW** — Reservation precedes hashing: duplicates consume a
  docs/day slot until refunded; near-limit spurious rejection — document it.
- **S5-ND-7 LOW** — The matcher runner adds a persistent leader session:
  re-derive the 17-session budget.
- **S5-ND-8 LOW** — activate_taxonomy_version is an un-audited privileged
  surface: schedule the global-receipts follow-up concretely.

Part C: **ANOTHER-ROUND (narrow)** — ND-1/2/3 (ideally 4/5) resolved in the
contract before build; 6/7/8 may ride to as-built.

*(Both rounds' full texts are preserved in the session transcript; this file
is the archived evidence of record. Round-2 resolutions: contract §12.)*
