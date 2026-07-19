# CODEX AS-BUILT REVIEW — Clara Slice 6

**VERDICT: FLAWED**

Reviewed `main...slice6-coding-floor` at `f4c43ea`. The repository remained unchanged and clean. No CRITICAL privilege-escalation defect was found, but six HIGH findings violate ratified Slice-6 accounting, replay, or availability laws.

## Findings

1. **HIGH — The ratified amount-exception and governed override flow is absent.**

   The amendment requires `revise_entry(..., p_amount_override)` with reason and cited region, hash coverage, persisted `flags.amount_override`, high-stakes derivation, same-facts-version approval handling, and distinct-checker enforcement: `.tmp/slice6-build/INTERFACE-PINS.md:294-306`.

   Instead:

   - Drafting raises CLR21 inside the draft transaction, rolling the entire card/evidence write back: `packages/db/migrations/0009_coding_floor.sql:1245-1248`.
   - `revise_entry` has no override argument and its request hash cannot cover one: `packages/db/migrations/0009_coding_floor.sql:1618-1631`.
   - Revise also raises CLR21 instead of persisting an exception: `packages/db/migrations/0009_coding_floor.sql:1677-1680`.
   - The update cannot stamp an override flag: `packages/db/migrations/0009_coding_floor.sql:1700-1703`.
   - The runtime refuses before calling the writer: `packages/runtime/workflows/chatTurn.v2.tools.ts:83-90`.
   - The dashboard synthesizes an ephemeral panel from an error, then “resolves” it by ordinary revise+approve with no reason or override: `apps/dashboard/app/chat/JeReviewCard.tsx:67-76`, `apps/dashboard/app/chat/JeReviewCard.tsx:148-155`, `apps/dashboard/app/chat/JeReviewCard.tsx:270-279`.
   - Worse, every CLR21 is misclassified as `amount_conflict`, discarding the exact reason discriminant: `apps/dashboard/app/chat/JeReviewCard.tsx:92-100`.

   Live rollback probe against a corroborated RM5,000 document, proposing RM4,000:

   ```text
   amount_before_entries|0
   amount_error|sqlstate=CLR21|detail={"reason":"amount_conflict"}
   amount_after_entries|0
   amount_after_evidence|0
   ```

   The mismatch is therefore a terminal rollback, not the required persisted, reviewable exception.

2. **HIGH — Exact duplicate-bill prevention and governed duplicate override are absent.**

   FIX-SP-3 requires exact `(client, resolved counterparty, invoice_id)` blocking, CLR21 `duplicate_bill`, a reason-coded override, and surfaced near-duplicates: `.tmp/slice6-build/INTERFACE-PINS.md:307-318`.

   The current fact-state function does not resolve `invoice.invoice_id`: `packages/db/migrations/0009_coding_floor.sql:115-165`. Approval proceeds from stale-fact checks directly to bill-shape enforcement without a duplicate lookup: `packages/db/migrations/0009_coding_floor.sql:1492-1529`. `revise_entry` has no duplicate override argument, and `get_draft_review` has no `near_duplicates`: `packages/db/migrations/0009_coding_floor.sql:1618-1620`, `packages/db/migrations/0009_coding_floor.sql:2529-2555`. The frozen CLR21 union also lacks `duplicate_bill`: `packages/runtime/workflows/chatTurn.v2.errors.ts:17-25`.

   Live rollback probe created two documents with the same persisted facts invoice ID, same client, and same resolved vendor:

   ```text
   first_approve|approved
   second_approve_same_invoice_id|approved
   approved_duplicate_count|2
   ```

   Thus the exact duplicate the amendment says must block can be posted twice.

3. **HIGH — Tier-A corroboration does not implement all ratified conditions.**

   The implementation correctly distinguishes `InvoiceTotal`, checks confidence ≥0.95, MYR, one total row, deposit zero, and total-vs-due equality. It does not reliably enforce physical evidence, single top-level document, or credit-note/deposit classification:

   - Missing bounding geometry is fabricated as `{page:1, polygon:[]}`: `packages/runtime/workflows/invoiceFacts.v1.azure.mjs:117-120`.
   - Only `documents[0]` is used; `documents.length === 1` is never checked: `packages/runtime/workflows/invoiceFacts.v1.azure.mjs:134-137`.
   - The production mapping has no credit-note signal and never emits `invoice.deposit`: `packages/runtime/workflows/invoiceFacts.v1.azure.mjs:124-130`.
   - Persistence accepts any array/object polygon, including an empty array: `packages/db/migrations/0009_coding_floor.sql:1886-1904`.
   - `_invoice_fact_state` checks only `locator_kind='page_polygon'`, not whether geometry exists: `packages/db/migrations/0009_coding_floor.sql:155-159`.

   Live rollback probe persisted a total and currency with empty polygons:

   ```text
   claim|running
   persist|done
   fact_state|{"currency":"MYR","total_cents":1000,"corroborated":true,...}
   stored_total_locator|{"page":1,"polygon":[]}
   ```

   A fact with no physical region is therefore promoted to Tier A.

4. **HIGH — Runtime and SQL disagree on the extract shape, defeating Tier-A detection and Tier-B currency refusal.**

   SQL returns `{document, unassigned, filing, extractions, regions, max_chars}`: `packages/db/migrations/0009_coding_floor.sql:2466-2477`. The writer wrapper instead looks for top-level `invoice_facts`, `facts`, `invoice_total`, and `currency`: `packages/runtime/workflows/chatTurn.v2.tools.ts:26-41`.

   Consequences:

   - The ordinary first-pass card is labelled Tier B even when authoritative facts exist: `packages/runtime/workflows/chatTurn.v2.tools.ts:83-99`.
   - The visible badge uses that stale part value rather than hydrated review state: `apps/dashboard/app/chat/JeReviewCard.tsx:197-199`.
   - Explicit non-MYR evidence at Tier B is not refused because the DB currency check reads only completed invoice-facts state.

   Live shape probe:

   ```text
   extract_top_level_keys|document,extractions,filing,max_chars,regions,unassigned
   ```

   Live rollback probe added explicit `USD` evidence to a Tier-B document and drafted a supplier bill:

   ```text
   tier_b_non_myr_receipt|{"status":"draft","entry_id":"ef29225c-..."}
   tier_b_non_myr_evidence|[{"tier":"model_read","quote":"USD","field_path":"invoice.currency"}]
   ```

   This violates the contract’s “explicit non-MYR refuses at either tier” law.

   The unit test false-green is direct: it mocks the impossible top-level shape `{invoice_facts:{...}}`: `packages/runtime/tests/s6-closure-logic.test.mjs:156-170`.

5. **HIGH — One task can create multiple coding attempts, while recovery returns only one arbitrary card.**

   The database uniqueness law is `(task_id, filing_id)`, not `task_id`: `packages/db/migrations/0009_coding_floor.sql:869-883`. That permits multiple documents to be drafted by multiple tool calls in one model segment. Yet:

   - `get_coding_attempt(p_task)` is a scalar query with no ordering or aggregation: `packages/db/migrations/0009_coding_floor.sql:2599-2606`.
   - Recovery synthesizes exactly one `JeReviewPart`: `packages/runtime/workflows/chatTurn.v2.impl.ts:121-148`.
   - The model segment permits multiple tool steps and does not stop after the first successful draft: `packages/runtime/workflows/chatTurn.v2.impl.ts:190-199`.

   Live rollback probe called the same core for two different filings with stable `code-doc:<task>:<doc>` keys. The task already carried one attempt:

   ```text
   attempts_for_one_task|3
   recovery_scalar|0d4fb25e-0606-42a7-b155-956b912f6a40
   distinct_new_entries|true
   ```

   After rollback, the original single attempt remained. The probe demonstrates that two additional durable attempts are lawful but recovery exposes only one. A multi-tool-call crash can therefore leave unseen durable drafts and fail the one-document→one-card replay law.

6. **HIGH — clamd death after connection establishment can still crash the runtime or hang intake.**

   `scanFile` handles connection failure only while awaiting `"connect"`: `packages/runtime/lib/scan.mjs:281-292`. Once connected, it has no persistent socket `"error"` handler and no scan-wide timeout while streaming/waiting for close: `packages/runtime/lib/scan.mjs:293-305`.

   If clamd dies after connect but before `once(socket, "close")` installs its temporary error listener, the socket can emit an unhandled `"error"`. The process-wide handler deliberately exits the runtime: `packages/runtime/scripts/serve.mjs:28-37`.

   The new tests cover only connection refusal before connect and supervisor child restarts: `packages/runtime/tests/s6-scanner-degrade.test.mjs:10-27`, `packages/runtime/tests/s6-scanner-degrade.test.mjs:29-71`. They do not exercise mid-stream clamd death or a wedged scanner.

   PIN-AB-2’s no-bypass behavior is present, but its “no crash path” requirement is not closed.

7. **MEDIUM — Applied grant matrix contains an unsanctioned global table grant.**

   Companion §9 grants runtime only the three invoice-facts functions; it says the review must verify nothing else moved: `docs/plan/slice6-migration-0009-design.md:281-294`.

   Migration 0009 grants `clara_runtime` SELECT on `processing_call_reservations`: `packages/db/migrations/0009_coding_floor.sql:2613-2616`, with an unrestricted runtime policy: `packages/db/migrations/0009_coding_floor.sql:1030-1031`.

   Live catalog and role probes:

   ```text
   runtime_table_acl|processing_call_reservations|SELECT
   runtime_select_has|t
   runtime_reservation_visibility|rows_visible=694|firms_visible=152
   ```

   This is shipped authority without a companion mandate or recorded amendment. The schema test checks exact function grants but never table ACLs: `packages/db/tests/s6-schema.test.mjs:187-215`.

8. **MEDIUM — Several mandatory FIX-round interface changes were not applied.**

   - FIX-SP-1 requires “machine-corroborated,” but user/model-facing text still says “machine-verified”: `apps/dashboard/app/chat/JeReviewCard.tsx:197-198`, `apps/dashboard/app/chat/JeReviewCard.tsx:272-278`, `apps/dashboard/app/chat/review.ts:163`, `packages/runtime/workflows/chatTurn.v2.errors.ts:57-62`.
   - FIX-SP-5 requires `high_stakes_reasons`; SQL returns only the boolean: `packages/db/migrations/0009_coding_floor.sql:2529-2555`. The UI silently defaults the absent array: `apps/dashboard/app/chat/review.ts:165-167`.
   - FIX-SP-4 requires the result-entry ID client-side, but the input says “optional,” the Done button remains enabled, and `null` is sent: `apps/dashboard/app/documents/CodingSections.tsx:103-107`, `apps/dashboard/app/documents/api.ts:339-341`.
   - FIX-S-1 and FIX-S-2 require shared `_fact_hash` and corroboration helpers: `.tmp/slice6-build/INTERFACE-PINS.md:322-326`. They are absent; the equations/hashes remain copied inline.
   - New-vendor hydration misreads `proposal.new.name` as `proposal.name` and treats `decision='birth'` as unresolved: `apps/dashboard/app/chat/review.ts:84-98`, `apps/dashboard/app/chat/review.ts:109-126`.

   Live catalog/read probes:

   ```text
   draft_review_keys|counterparty,eligible_checker_count,entry,evidence,high_stakes,lines
   fact_hash_helper|null
   corroboration_helpers|0
   revise_args|p_entry,p_lines,p_proposed_counterparty,p_evidence,p_expected_revision,p_op_key
   ```

   A live draft returned:

   ```text
   proposal={"new":{"name":"SHAPE VENDOR SDN BHD","registration_no":"SHAPE-REG"}}
   current_outcome={"decision":"birth","name_normalized":"shapevendorsdnbhd",...}
   ```

   The current mapper therefore loses the human-facing vendor name/new-vendor badge.

9. **MEDIUM — The new tests contain material false-green gaps.**

   - `s6-locks` claims approval/correction/revise/reversal coverage but contains only facts↔approve, same-draft approve, and approve versus an unrelated reverse: `packages/db/tests/s6-locks.test.mjs:1-12`, `packages/db/tests/s6-locks.test.mjs:146-179`. No correction or revise schedule exists.
   - The Tier-A normalizer test uses only one top-level document and the behavior stub itself supplies `polygon:[]` without checking that it must not corroborate: `packages/runtime/tests/s6-invoice-facts.test.mjs:13-49`, `packages/runtime/tests/s6-invoice-facts.test.mjs:110-139`.
   - The stale-evidence test accepts CLR23 even though the ratified law calls for CLR25: `packages/db/tests/s6-invoice-facts.test.mjs:272-290`.
   - The dashboard parity test proves only that fixture markup is non-empty; it never exercises SQL hydration shape: `apps/dashboard/app/chat/partCatalog.test.tsx:23-41`.
   - The adapted §3.5 correction fixture now pre-reverses the approved entry before creating the draft: `packages/db/tests/rig-docs-correction.test.mjs:164-185`. At correction time it proves only draft withdrawal, not the prior combined “reverse live approved cite + withdraw draft in one bounded transaction” upgrade-world case. The §8 reordering is sound because it recreates the same final pre-state—one already-reversed cite plus one live cite: `packages/db/tests/rig-docs-correction.test.mjs:340-380`.

10. **LOW — PIN-AB-3 remains an actual, though currently benign, C-7 violation.**

    `record_rule_resolution` still reads all completed extraction kinds without pinning `engine_kind`: `packages/db/migrations/0007_document_pipeline.sql:2308-2317`. The runtime-side reader was correctly restricted to `ocr`/`structured_parse`: `packages/runtime/lib/matcher.mjs:117-124`.

    Current invoice-facts vocabulary has no matching TIN/SSM/account substring, so there is no present misattribution. It remains a required gate before MyInvois expands the facts vocabulary.

11. **LOW — Operational documentation is incomplete or misleading.**

    - `CLARA_INVOICE_FACTS_MAX_ATTEMPTS` is documented as configurable: `packages/runtime/.env.example:75-77`, `packages/runtime/README.md:104`, but the database hard-codes `3`: `packages/db/migrations/0009_coding_floor.sql:2005-2015`. Changing the environment variable has no effect.
    - `CLARA_CLAMD_HEALTHY_RUN_MS` is consumed but absent from `.env.example`/README: `packages/runtime/lib/scan.mjs:335-337`.
    - The write-login LOGIN/password ceremony is described only in prose; no tracked executable ceremony statement exists. The only shipped role statement keeps it NOLOGIN: `packages/db/migrations/0009_coding_floor.sql:37-45`.
    - `pools.mjs` still opens by calling itself the “two-login” pool and documents the old connection budget despite adding a third pool: `packages/runtime/lib/pools.mjs:1-7`, `packages/runtime/lib/pools.mjs:25-27`.

## FLAKE-1 adjudication

**Ruling: benign shared-test concurrency flake; no 0009 lock-order fix is indicated.**

The new reachable edges are:

1. `coding_attempts` insertion takes a parent-key lock through its composite FK to `agent_tasks`: `packages/db/migrations/0009_coding_floor.sql:880-883`. It occurs after filing/entry work. S4 task-transition writers lock `agent_tasks` but do not acquire filing or journal-entry locks, so there is no reverse edge back to the coding graph.

2. The bill-shape constraint trigger runs only on `status → approved` and reads lines/accounts/evidence; it does not touch `agent_tasks` or acquire a filing lock: `packages/db/migrations/0009_coding_floor.sql:434-447`.

3. `persist_invoice_facts` locks active filings in UUID order, then open drafts in entry-ID order, then its document-processing task: `packages/db/migrations/0009_coding_floor.sql:1858-1865`. Approval takes filing `FOR SHARE` before entry `FOR UPDATE`: `packages/db/migrations/0009_coding_floor.sql:1418-1435`. Wrong-client correction likewise locks filings by ID then entries by ID: `packages/db/migrations/0009_coding_floor.sql:2248-2254`.

Forced live schedules on the same filing produced the expected serialization in both directions:

```text
facts first:
asbuilt_approve_wait | Lock | transactionid | blocker_count=1
asbuilt_facts_first  | PgSleep              | blocker_count=0

approve first:
asbuilt_facts_wait    | Lock | transactionid | blocker_count=1
asbuilt_approve_first | PgSleep              | blocker_count=0
```

Both completed after release, with no 40P01.

A simulated coding-attempt FK `FOR KEY SHARE` held on an `agent_tasks` row did not block a non-key transition update:

```text
TRANSITION_ELAPSED_MS=68
asbuilt_fk_keyshare|PgSleep|blocker_count=0
```

That supports a contention/test-lifecycle explanation for the single S4-AB11 40P01, not a new cyclic lock graph. Finding 9 still applies because the required correction/revise schedules were not added.

## Security controls confirmed

The following priority controls were sound under inspection and live probes:

- Write login is non-superuser, non-bypass-RLS, NOLOGIN, and has exactly one membership:

  ```text
  role_shape|rolcanlogin=f|rolinherit=t|rolbypassrls=f|rolsuper=f
  membership|clara_wake_interactive|inherit_option=f|set_option=t
  ```

- Agent approval is structurally refused at role level:

  ```text
  ERROR: 42501: permission denied for function approve_entry
  ```

- PUBLIC execute sweep:

  ```text
  public_exec_count|0
  ```

- `withWriteWakeScoped` uses BEGIN, parameterized transaction-local secret, COMMIT/ROLLBACK, RESET, and destroy-on-connection/cleanup error: `packages/runtime/lib/pools.mjs:185-213`, `packages/runtime/lib/pools.mjs:315-330`. The task loader supplies `created_by` for OBO minting: `packages/runtime/workflows/chatTurn.v2.impl.ts:68-87`.

- D-L2-2 supplier-bill evidence scoping is sound. SQL null, JSON null, empty array, and a region belonging to another document all refused identically, with no surviving entry:

  ```text
  evidence_case|sql_null|CLR21|{"reason":"evidence_invalid"}
  evidence_case|json_null|CLR21|{"reason":"evidence_invalid"}
  evidence_case|empty_array|CLR21|{"reason":"evidence_invalid"}
  evidence_case|other_document|CLR21|{"reason":"evidence_invalid"}
  evidence_probe_surviving_entries|0
  ```

  The guards are at `packages/db/migrations/0009_coding_floor.sql:1156-1168`, `packages/db/migrations/0009_coding_floor.sql:337-384`, and `packages/db/migrations/0009_coding_floor.sql:1637-1661`.

- New read functions collapse cross-firm, nonexistent, and wrong-client reads to the same null result:

  ```text
  extract_oracle|cross_firm=t|nonexistent=t|same_firm_wrong_client=t
  draft_review_oracle|cross_firm=t|nonexistent=t
  entry_for_oracle|cross_firm=t|nonexistent=t
  ```

- PIN-AB-6 metadata is congruent with the task’s composite document/firm FK, and both fresh and replay claim branches carry it:

  ```text
  claim_metadata_match|t|status=running
  processing_task_document_fk|FOREIGN KEY (document_id,firm_id) REFERENCES documents(id,firm_id)
  claim_both_branches|first=running|replay=running|replayed=t|replay_has_all_metadata=t
  ```

- CLR25 stale-evidence enforcement works. A later contradicting facts completion rotated the token; approval using the rotated token refused exactly CLR25:

  ```text
  facts_rotated_token|t
  ERROR: CLR25: newer machine facts contradict the draft evidence
  ```

- Frozen-workflow law passed static verification: all 17 manifest hashes matched; zero pre-existing `main` frozen paths changed. Registry preserves and re-exports `chatTurn_v1`: `packages/runtime/workflows/registry.ts:9-26`. Invoice-facts step IO carries metadata but no database, storage, or Azure credentials: `packages/runtime/workflows/invoiceFacts.v1.impl.ts:28-38`, `packages/runtime/workflows/invoiceFacts.v1.impl.ts:58-83`.

## Verification limitations

`git diff --check main...HEAD` was clean, and the worktree remained clean.

The requested Node test files could not execute in this managed environment: Node failed before loading them with `EPERM: operation not permitted, lstat 'C:\Users\zhant'`. I therefore claim no package-suite result. All database outputs above came from live `psql` probes against only the specified `clara_test` instance; mutation probes used `BEGIN/ROLLBACK`.
