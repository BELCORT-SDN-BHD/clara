# Slice-6 BUILD — INTERFACE PINS (orchestrator-authored, pre-dispatch)

Binding on all five lanes. The spec of record is `docs/plan/slice6-thin-e2e-contract.md`
(v1.3) + `docs/plan/slice6-migration-0009-design.md` + `docs/plan/slice6-delegated-decisions.md`.
Where a pin conflicts with the spec, STOP and report to the orchestrator — do not pick a side.
Pins exist so five parallel lanes agree on every cross-lane name WITHOUT reading each
other's code. Grounding briefs (as-built facts, citeable): `.tmp/slice6-briefs/1..6`.

## 0. Lane ownership matrix (STRICT — never touch another lane's files)

| Lane | Owns (create/edit) | Never touches |
|---|---|---|
| L1 migration (Codex) | `packages/db/migrations/0009_coding_floor.sql` (ONE file) | everything else |
| L2 blind rig (native) | `packages/db/tests/s6-*.test.mjs` (new files only) | 0009 SOURCE (never open/print/diff it), all `REPORT-L*.md`, all other lanes' code |
| L3 runtime (native) | `packages/runtime/workflows/chatTurn.v2*.{ts,mjs}`, `workflows/invoiceFacts.v1*.{ts,mjs}`, `workflows/registry.ts`, `frozen-workflows.json` (via local `--update` ONLY), `lib/pools.mjs`, scanner-supervision file(s) (`scripts/serve.mjs` / the clamd adapter), `packages/runtime/tests/s6-*.test.mjs`, `packages/runtime/.env.example`, `packages/runtime/README.md` | `lib/matcher.mjs`, `lib/reconciler.mjs`, migrations, dashboard |
| L4 matcher-adjacent (native) | `packages/runtime/lib/matcher.mjs`, `packages/runtime/lib/reconciler.mjs`, `packages/runtime/tests/s6-matcher-*.test.mjs`, `s6-identity-*.test.mjs` | workflows/*, pools.mjs, migrations, dashboard |
| L5 dashboard (native) | `apps/dashboard/**` (incl. new `app/chat/partCatalog.ts`, parity test, `package.json` test script) | runtime, db |
| Orchestrator | CI workflow files, `docs/**`, adjudications, integration runs | — |

Shared files (`registry.ts`, `frozen-workflows.json`) belong to L3 alone. CI wiring for the
new parity test and db battery = orchestrator at integration. If your work seems to require
editing a file you don't own, STOP and report the interface gap instead.

**Local throwaway DBs (PG16 @ 127.0.0.1:5544, trust):** L1 → `clara_test`; L2 →
`clara_blind_test`; L3 → `clara_rt_test`; L4 → `clara_m_test`. Never point at anything but
127.0.0.1:5544. Reset via the schema-scoped pnpm scripts only. Rig gotcha (rig-proven): the
entry balance/provenance triggers are DEFERRABLE INITIALLY DEFERRED — entry+lines must be ONE
explicit transaction in tests. Destructive/reset tests gate behind `CLARA_RIG_ALLOW_RESET=1`.
Test namespace: anything prefixed `rig.%` is excluded from coverage sweeps (AB-7).

**Reports:** each lane writes `.tmp/slice6-build/REPORT-L<N>-<name>.md` — what was built,
evidence (test counts, gate output), interface deviations (should be NONE without an
orchestrator ruling), open questions.

## 1. Pinned DB surface (0009) — names + exact public signatures

New tables: `counterparties`, `coding_tasks`, `entry_evidence`, `coding_attempts`,
`processing_call_reservations` (NEW-4). Altered: `journal_lines` (+`counterparty_id` composite
FK), `journal_entries` (+`proposed_counterparty jsonb`, +`match_fingerprint jsonb`,
+`coding_kind text null check (coding_kind in ('supplier_bill'))` — immutable post-insert,
never in any transition allow-set), `coa_accounts` (+`account_class text null check
(account_class in ('payable'))`; account_code CHECK widened to
`^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$`), `document_processing_tasks` (lane CHECK +
`'invoice_facts'`), `document_extractions` (engine_kind CHECK + `'invoice_facts'`).

Masked view: **`coding_tasks_visible`** (house `_visible` pattern).

**Recreated with UNCHANGED signatures** (same-signature replace lawful): `approve_entry`,
`approve_wrong_client_correction`, `reverse_entry`, `file_document`,
`confirm_attribution_candidate`, `claim_document_processing_task`,
`release_held_document_tasks`, `_tf_entry_immutable`, `_active_document_filing` (if touched).

**Arity-changed (C-1 law: DROP old sig(s) → CREATE → REVOKE ALL FROM PUBLIC → re-grant §9
lanes; tail asserts ONE overload per public writer + PUBLIC-zero-execute sweep):**

```sql
-- appended args only; existing arg order/defaults byte-compatible with 0005/0007 as-built
clara.wake_draft_entry(
  p_client uuid, p_resolution uuid, p_posting_date date, p_memo text, p_lines jsonb,
  p_document uuid default null, p_sha256 text default null, p_flags jsonb default '{}',
  p_op_key text default null, p_books_version bigint default null,
  p_proposed_counterparty jsonb default null,   -- hashed [N-F5]
  p_evidence jsonb default null,                -- hashed; REQUIRED (CLR21) when p_document set
  p_coding jsonb default null,                  -- hashed [NEW-6]; {task_id uuid, part_payload jsonb}
  p_coding_kind text default null               -- hashed; only 'supplier_bill' lawful in v1
) returns jsonb  -- receipt {entry_id, revision_token, status:'draft', filing_id}

clara.draft_entry(  -- human lane; gains the first two only
  p_client uuid, p_resolution uuid, p_posting_date date, p_memo text, p_lines jsonb,
  p_document uuid default null, p_sha256 text default null, p_flags jsonb default '{}',
  p_op_key text default null,
  p_proposed_counterparty jsonb default null, p_evidence jsonb default null
) returns jsonb

clara.upsert_account(...existing args..., p_account_class text default null)  -- hashed

-- _draft_entry_core: internal (ungranted); L1 decides internals within companion law;
-- it writes entry_evidence + coding_attempts rows IN the draft transaction [C-9, NEW-6].
```

**New granted functions (exact pinned signatures):**

```sql
-- reads (security invoker, RLS-scoped; CLR03 raise when agent-lane wake_firm() is null [D-F1])
clara.list_unassigned_documents(p_limit int default 50) returns setof jsonb
  -- grants: clara_authenticated, clara_agent_ro
clara.get_document_extract(p_document uuid, p_client uuid default null,
  p_max_chars int default 20000) returns jsonb
  -- client-pinned per C-11; ONE aggregate char budget; grants: clara_authenticated, clara_agent_ro
clara.get_draft_review(p_entry uuid, p_client uuid default null) returns jsonb
  -- entry+lines+vendor resolution preview+evidence rows+eligible-checker count
clara.list_uncoded_filings(p_client uuid default null) returns setof jsonb
  -- ACTIVE filings, no draft AND no unreversed approved entry bound to THAT filing [C-15]
clara.get_journal_entry_for(p_entry uuid, p_client uuid) returns jsonb
  -- client-pinned agent variant; bare get_journal_entry(uuid) LOSES clara_agent_ro [C-11]
clara.get_coding_attempt(p_task uuid) returns jsonb
  -- recovery read for the v2 step [C-12]; grant clara_runtime ONLY. PIN-AB-1: not named in
  -- companion §9 — record as §13 as-built amendment; blind lane: do NOT flag as divergence.

-- human draft lifecycle (clara_authenticated, bookkeeper+, op-keyed)
clara.revise_entry(p_entry uuid, p_lines jsonb, p_proposed_counterparty jsonb,
  p_evidence jsonb, p_expected_revision uuid, p_op_key text) returns jsonb -- new token; stamps last_human_editor [C-4]
clara.withdraw_draft(p_entry uuid, p_reason text, p_expected_revision uuid,
  p_op_key text) returns jsonb

-- coding tasks (clara_authenticated, bookkeeper+)
clara.open_coding_task(p_client uuid, p_document uuid, p_filing uuid, p_reason text,
  p_op_key text) returns jsonb          -- origin='manual'
clara.complete_coding_task(p_task uuid, p_result_entry uuid, p_op_key text) returns jsonb
clara.dismiss_coding_task(p_task uuid, p_reason text, p_op_key text) returns jsonb

-- invoice-facts lane (clara_runtime)
clara.enqueue_invoice_facts(p_document uuid) returns jsonb
  -- backstop; structural idempotency partial unique (document_id, lane) live-states [N-F10]
clara.persist_invoice_facts(p_task uuid, p_fields jsonb, p_raw_sha256 text,
  p_normalization_version text, p_pages_used int) returns jsonb
  -- p_fields: [{field_path, value_raw, page, polygon, confidence}] — DB does deterministic
  -- cents normalization; takes FOR UPDATE on the doc's active filings (UUID order) then open
  -- entries (id order); rotates open drafts' revision_token [NEW-1, P2/P7]
clara.fail_invoice_facts(p_task uuid, p_reason text) returns jsonb
  -- task→failed + refund + document.invoice_facts_failed

-- internal ungranted: _validate_entry_lines, _assert_supplier_bill_shape, _resolve_counterparty
```

**Grants delta = companion §9 verbatim** plus PIN-AB-1 above. `clara_agent_ro` LOSES
`get_journal_entry(uuid)`. `clara_wake_write_login` created **NOLOGIN** in-migration, member of
`clara_wake_interactive` alone, `WITH SET TRUE, INHERIT FALSE` (single-membership law).

**Events (additive coupled pairs into the ACTIVE taxonomy v2 — event_type + trigger_taxonomy
rows [P5]):** `counterparty.created`, `entry.revised`, `entry.withdrawn`,
`coding_task.opened`, `coding_task.closed`, `document.invoice_facts_completed`,
`document.invoice_facts_failed`.

**Normalization (N-F6, one expression everywhere):**
`lower(regexp_replace(x, '[^a-zA-Z0-9]', '', 'g'))` → `name_normalized`,
`registration_normalized`.

**match_fingerprint jsonb:** `{decision: 'registration_match'|'name_match_unregistered'|'birth',
counterparty_id?: uuid, name_normalized: text, registration_normalized?: text}` — propose-time
persisted; approve re-resolves and compares the FULL object [NEW-3].

**coding_attempts:** `(id, firm_id, client_id, task_id, filing_id, document_id, entry_id,
part_payload jsonb, created_at)` — `unique(task_id, filing_id)`, `unique(entry_id)`; written
by the core from `p_coding`; SELECT via `get_coding_attempt` only.

**entry_evidence:** `(id, entry_id, firm_id, client_id, document_id, extraction_id,
region_id null, field_path, quote text, fact_hash, provenance_tier
'verified'|'model_read')` — region↔extraction↔document congruence DB-verified [C-9].

**One-open-draft law:** partial unique `journal_entries(filing_id) where status='draft' and
filing_id is not null` + migration pre-flight assert (no filing already carries two open
drafts) [C-15/P6].

## 2. Error-map pins (CLR21–25; per-layer [C-20])

- CLR21 (coding-tool law) carries a machine-readable reason token in the exception **DETAIL
  as json `{"reason": <token>}`**; message keeps the house CLR shape. Tokens (exact):
  `amount_conflict` (resolvable via the amount-exception flow), `currency_unsupported`,
  `vendor_malformed`, `evidence_invalid`, `double_coded` (all DB-raised);
  `session_unbound` is RUNTIME-labeled only (write tool without a client-bound session —
  never a DB raise).
- CLR22 draft-lifecycle (revise/withdraw on non-draft; withdraw without reason). NOTE the
  deliberate split [N-F15]: `approve_entry` on a non-draft KEEPS its as-built CLR10.
- CLR23 counterparty law (payable line w/o counterparty at approve; registration conflict;
  fingerprint mismatch at approve; bill-shape refusals, `reversal_of IS NULL` scoped [D-F6]).
- CLR24 coding_tasks transitions (off-matrix, result-entry proof failure, wrong-firm →
  not-found collapse).
- CLR25 stale evidence at approve [C-8].
- Native constraints mapped: 23505 one-open-draft → CLR21 `double_coded`; counterparty
  uniques → CLR23; composite-FK breaches → not-found collapse. The structural 42501 on an
  agent approve stays DISTINCT from business refusals.
- L1 ships the full DB-layer table (SQLSTATE/constraint → CLR) as the 0009 header comment;
  L3 ships the runtime mapping (`chatTurn.v2.errors.ts` or equivalent inside the closure)
  → typed refusal parts; L5 renders card behavior from the part, never re-derives.

## 3. Pinned runtime surface (L3)

- **Files:** `chatTurn.v2.ts` + companions, `// @frozen`, AB-16 pattern (infra via
  `globalThis`, never imported); v1 files BYTE-untouched; registry repoints `chatTurn:` →
  `chatTurn_v2` (keep `chatTurn_v1` export); NEW registry key `invoiceFacts:` →
  `invoiceFacts_v1` (`invoiceFacts.v1.ts` + companions). Manifest via
  `node scripts/check-frozen-workflows.mjs --update` locally, once, at the end.
- **MAX_SEGMENTS = 12** (v1 value, unchanged). **C-19 terminal invariant:** a coding-intent
  turn never settles silently — je_review part, typed clarify, or typed refusal.
- **Model-facing tools (v2):** existing `get_context_pack`, `trial_balance`,
  `list_journal_entries`, `get_journal_entry` (now → `get_journal_entry_for(entry, client)`),
  `clarify`; NEW `list_unassigned_documents()` and `read_document(document_id)` (→
  `get_document_extract`) — exposed even when client-unbound (plus clarify); NEW
  `draft_journal_entry` — exposed ONLY when client-bound. All reads via `withReadWakeScoped`
  minted **lazily inside the tool boundary, OBO `task.created_by`** [C-11/NEW-5]; CLR10/CLR03
  from the mint/fn are caught and returned as ONE typed refusal (oracle-safe, count-independent).
- **`draft_journal_entry` input schema (contract §3 verbatim):**
  `{posting_date, memo?, lines:[{account_code, debit_cents, credit_cents, description?}],
  document_id, vendor: {existing_id} | {new:{name, registration_no?}},
  evidence: [{region_id, quote, field_path?}], uncertainty?: {note, alternatives[]}}`.
  Wrapper (inside the closure): fetch doc row (sha256) + authoritative resolution + fresh
  pack `books_version` SERVER-side; tier check (§4: Tier A cross-check vs persisted
  `invoice.total` → CLR21 `amount_conflict` on mismatch; non-MYR → refusal EITHER tier);
  stamp `p_coding_kind='supplier_bill'`; op_key **`code-doc:<task_id>:<document_id>`**;
  execute via write pool → `wake_draft_entry` (pinned signature §1). Model NEVER supplies
  sha256, books_version, op_key, or resolution id.
- **Recovery [C-12]:** every step attempt calls `get_coding_attempt(task_id)` BEFORE any
  model call; a completed attempt short-circuits to the canonical card.
- **Part promotion [C-19]:** successful tool result ⇒ its `tool_result` part PLUS exactly one
  keyed top-level `je_review` part, deduped on replay in `toTypedParts_v2`.
- **v2 ClaraPart union (runtime):** `text | tool_call | tool_result | tool_error | clarify |
  clarify_closed | je_review | refusal`.
  `je_review` = `{type:'je_review', entry_id, revision_token, client_id, document_id,
  provenance_tier:'verified'|'model_read', uncertainty?:{note, alternatives:string[]}}`.
  `refusal` = `{type:'refusal', code:'CLR21'|..., reason?:string, message:string}`.
  Inbound user `attachment` parts render into model context as the structured stub
  `[attachment: <document_id>]` + standing instruction to call `read_document`; stub promises
  agent-readable fields only [N-F14].
- **Write floor:** `clara_wake_write_login` env DSN **`CLARA_WRITE_DATABASE_URL`** (joins
  prod fail-closed boot asserts); pool max 2; `withWriteWakeScoped(secret, fn)` = BEGIN →
  parameterised txn-local `set_config('clara.wake_secret',$1,true)` → `SET ROLE
  clara_wake_interactive` → write → COMMIT; shared cleanup ROLLBACK/RESET; P4
  destroy-on-error; mint per attempt OBO `task.created_by`; secret never crosses a step.
- **v2 task loader returns `created_by`** (+ model, client_id, firm_id, session_id).
- **invoiceFacts_v1:** engine snapshot id **`azure-di:prebuilt-invoice:2024-11-30`**;
  claims via `claim_document_processing_task` (lane `invoice_facts`); persists via
  `persist_invoice_facts` (pinned §1); failure/attempt-cap (3) → `fail_invoice_facts`;
  field_path vocabulary: `invoice.total`, `invoice.amount_due`, `invoice.currency`,
  `invoice.vendor_name`, `invoice.invoice_id`, `invoice.invoice_date`, `invoice.deposit`.
  Facts tasks NEVER touch `documents.extraction_status` [C-10].
- **Scanner degrade (PIN-AB-2, ops finding → §13 amendment):** clamd death is NO LONGER
  runtime-FATAL. Behavior: supervisor restarts clamd with bounded backoff; while scanner is
  unavailable, intake uploads FAIL CLOSED (refuse new spool admissions with an honest
  CLR15-family error; nothing bypasses scanning), `/ready` keeps `scanner.ok:false` as a
  WARNING (world stays ready), and recovery is automatic on clamd return. Live incident
  context: 1GB VM OOM-killed clamd post-signature-load; the FATAL law crash-looped the
  whole runtime. Flag loudly in REPORT-L3 for the as-built review.

## 4. Pinned dashboard surface (L5)

- **Wire union (`app/chat/api.ts`)** gains `je_review` + `refusal` (shapes in §3).
- **Three-place extension:** api.ts union + `applyChunk` (live; je_review needs no live-chunk
  branch [N-F16] — the card renders from the authoritative terminal message; refusal likewise)
  + `TranscriptParts` (persisted branches REQUIRED for both).
- **`app/chat/partCatalog.ts` (new):** exports the part-type registry; the parity test
  asserts every registered type has a persisted-render branch + one reachability fixture;
  unknown-type catch-all becomes an explicit "unsupported part" fallback chip (closing the
  silent-drop). Test: `apps/dashboard` gains a `test` script (node:test-compatible);
  orchestrator wires CI.
- **je_review card:** hydration law — re-derive via `get_draft_review(entry_id)` on every
  render; contents per contract §6 (lines, vendor "new vendor" badge / "matched existing",
  source chip + cited facts by tier, uncertainty, high-stakes flags). Actions = direct
  PostgREST RPC, fresh `crypto.randomUUID()` op_key per click, re-fetch after (house idiom):
  Approve → `approve_entry(entry, expected_revision, attestation?, op_key)`; Edit→approve →
  `revise_entry` then approve with the NEW token; Discard → `withdraw_draft` with reason.
  Approve gates on a readiness boolean; errors surfaced verbatim (CorrectionWizard idiom).
  Amount-exception state (CLR21 `amount_conflict` from approve/revise): render both values +
  regions; resolution path = revise (governed) with the HIGH-STAKES flag set.
- **/documents:** `list_uncoded_filings` section (read-only) + coding-tasks list
  (`coding_tasks_visible`; Done → `complete_coding_task` w/ result entry, Dismiss →
  `dismiss_coding_task` w/ reason; house act() re-load idiom).
- **Perception copy (supersedes DELTA-OWNER-2):** replace
  `ATTACHMENT_NON_PERCEPTION_COPY` with
  `ATTACHMENT_PERCEPTION_COPY = "Clara reads this document during this turn."`

## 5. L4 scope pins

- Audit EVERY as-built extraction/region reader for implicit-latest assumptions now that a
  second extraction row (engine_kind `invoice_facts`) exists per document [C-7]: matcher
  lane-2 inputs (0008 read surface), runtime consumers, dashboard queries. Runtime-side
  fixes land in L4-owned files; DB-side findings are REPORTED to the orchestrator (L1 owns
  0009) — do not edit migrations.
- Reconciler: stranded-run sweep + held-release coverage for lane `invoice_facts`; verify
  `release_held_document_tasks` call sites need no runtime change (DB body covers both lanes).
- Identity-law integration tests (runtime level): CLR23/CLR21 refusal shapes through the
  tool boundary, fingerprint congruence approve/revise round-trip, registration-dominant
  cases incl. name-match-ambiguity refusal [NEW-3].
- Taxonomy additive-pair verification (P5): coupled event_type + trigger_taxonomy rows into
  ACTIVE v2; coverage whole; routing untouched.

## 6. Blind-lane law (L2)

L2 reads: contract v1.3, both companions, THIS pins file, migrations 0001–0008 (shipped
law), existing db test helpers. L2 NEVER reads: `0009_coding_floor.sql`, any `REPORT-L*`,
any other lane's new code. L2 authors its battery from the spec; it may APPLY migrations via
the runner (`pnpm` db scripts) without opening 0009. The §11 six delta probes are REQUIRED
VERBATIM with their qualifiers. Divergences between expectation and observed behavior are
FINDINGS for orchestrator adjudication (house precedent decides), never silent test edits.

## 6.5 FIX-ROUND design rulings (orchestrator-adjudicated from the native review; 0009
is UNMERGED so in-place edits are lawful; C-1 law applies to any arity change)

- FIX-SP-1: user-facing label "machine-verified total" → "machine-corroborated total"
  everywhere a human reads it (JeReviewCard, review.ts amount_label, badges; sweep the
  v2 prompt text for the same wording facing the model). Internal enum
  provenance_tier='verified' UNCHANGED (schema/tests stable; S6-D1 forbids the word in
  OUTPUT framing).
- FIX-SP-2 (the S6-D1 amount-exception override; S6-D1 binds §4 per §0.5):
  `revise_entry` gains `p_amount_override jsonb default null` = {reason: nonempty
  text, region_id: uuid} (arity change ⇒ DROP/CREATE + ACL + the arg joins the
  request hash). Lawful ONLY on a supplier_bill draft whose corroborated machine
  total conflicts with the revised total; region_id must belong to the entry's
  document + be cited in the revised evidence. Effect: skip the conformance refusal;
  stamp `journal_entries.flags.amount_override = {reason, region_id, actor,
  machine_total_cents, proposed_cents, at}`; the high-stakes derivation (approve
  gate + get_draft_review) INCLUDES flags.amount_override ⇒ the distinct-checker law
  binds (CLR05). approve_entry's in-txn evidence re-verification honors a persisted
  override for the SAME facts version; a NEWER facts completion still rotates the
  token and voids the override (re-review forced). Card: the exception panel's
  resolve path calls revise with the override (reason + cited region) then re-fetch.
- FIX-SP-3 (the S6-D1 duplicate-bill control): at approve of a supplier_bill (early
  writer body, friendly), resolve the entry document's completed facts
  `invoice.invoice_id`; when present AND the resolved counterparty exists: another
  approved-unreversed supplier_bill entry of the same (client, counterparty) whose
  document's facts invoice_id matches EXACTLY ⇒ CLR21 DETAIL
  {"reason":"duplicate_bill"} (new token joins pins §2 + the 0009 header map) unless
  a revise-time governed override `flags.duplicate_override = {reason, actor, at}`
  (via `p_duplicate_override jsonb default null` on revise_entry, reason-coded,
  hash-covered) is stamped. Near-duplicates (same client+counterparty AND same facts
  invoice_date OR equal corroborated total) join get_draft_review as
  `near_duplicates: [{entry_id, document_id, invoice_id?, total_cents?,
  posting_date}]` — surfaced on the card, never blocking.
- FIX-SP-4: CodingSections requires the result-entry input client-side for Done.
- FIX-SP-5: get_draft_review adds `high_stakes_reasons: text[]` (same derivation
  terms as the boolean + 'amount_override' when stamped); card renders them.
- FIX-S-1: extract `clara._fact_hash(p_extraction uuid, p_region uuid, p_field text,
  p_quote text, p_cents bigint) returns text` (ungranted); replace all 5 inline
  copies byte-equivalently.
- FIX-S-2: extract the corroboration-equation check into one ungranted helper used
  by core/approve/revise (parameterized by raised code CLR21 vs CLR25).
- S-3/S-4: skipped (trivia; recorded).

## 6.6 FIX ROUND (post-review, binding; supersedes §6.5 where marked). Codex verdict
FLAWED (6 HIGH); native axes: no hard standards violations + 5 spec findings; the
security core CONFIRMED SOUND under live probes; FLAKE-1 adjudicated BENIGN (closed).
Work orders W1–W10, four lanes (FIX-DB, FIX-RT, L5, L2):

- W1 (F1, SUPERSEDES §6.5 FIX-SP-2 — the exception is PERSISTED AT DRAFT):
  supplier_bill + corroborated facts + total mismatch at DRAFT (core) or REVISE no
  longer raises — the draft PERSISTS carrying `flags.amount_exception =
  {machine_total_cents, proposed_cents, fact_hash, at}` (evidence still written;
  the receipt/part exposes exception:true). `approve_entry` refuses CLR21
  {"reason":"amount_conflict"} while amount_exception is present UNLESS
  `flags.amount_override = {reason, region_id, actor, at}` is stamped. Override is
  set ONLY via `revise_entry`'s new `p_amount_override jsonb default null`
  ({reason: nonempty, region_id: must be cited in the revised evidence and belong
  to the entry's document}); revise to a CONFORMING total clears both exception and
  override. High-stakes derivation (approve gate + get_draft_review) includes
  amount_override ⇒ distinct-checker binds. A newer facts completion (rotation)
  voids override + exception recompute (CLR25 logic unchanged). Runtime: REMOVE the
  wrapper's early mismatch refusal (chatTurn.v2.tools.ts:83-90) — draft and let the
  part carry exception state. Dashboard: exception panel renders from PERSISTED
  get_draft_review state (never synthesized from a caught error); the CLR21 handler
  parses the DETAIL reason token exactly (no blanket amount_conflict).
- W2 (F2 = FIX-SP-3 as designed in §6.5, plus): `_invoice_fact_state` resolves
  `invoice.invoice_id`; approve exact-dup ⇒ CLR21 {"reason":"duplicate_bill"}
  unless `flags.duplicate_override = {reason, actor, at}` (via revise's new
  `p_duplicate_override jsonb default null`); `get_draft_review` gains
  `near_duplicates`; the runtime Clr21Reason union gains 'duplicate_bill'.
- W3 (F3, Tier-A physical/single-doc/classification): the Azure mapper NEVER
  fabricates geometry (absent polygon ⇒ field emitted without locator eligibility);
  `_invoice_fact_state` requires a NON-EMPTY polygon on the total region for
  corroboration; `documents.length === 1` enforced in the mapper (multi-doc result
  ⇒ facts persist but corroborated=false — the INF-bundle rule); a credit-note
  doctype signal ⇒ corroborated=false; `invoice.deposit` emitted when the engine
  returns it. DB persist accepts empty polygon rows but they can never corroborate.
- W4 (F5, one-coding-per-TASK law): `coding_attempts` unique becomes `(task_id)`
  (drop the filing dimension; keep unique(entry_id)); the core's insert conflict ⇒
  CLR21 {"reason":"double_coded"} (one coding per turn — new turn for the next
  bill); the v2 segment STOPS after the first successful draft_journal_entry
  (stop condition, mirroring the clarify stop); scalar get_coding_attempt is then
  sound. S6-R11 one-doc→one-draft→one-card preserved exactly.
- W5 (F4, extract-shape truth): chatTurn.v2.tools.ts parses the REAL
  get_document_extract shape (regions[] with engine_kind/field_path/monetary_cents/
  engine_confidence joined to done extractions by version_n — the same parse pinned
  for L5); PLUS the DB closes the Tier-B currency hole: `_draft_entry_core` refuses
  CLR21 {"reason":"currency_unsupported"} when any SUBMITTED evidence row cites
  field_path='invoice.currency' whose quote normalizes to an explicit non-MYR
  currency (either tier, per contract §4 [C-20]); the closure-logic unit test mocks
  the REAL shape.
- W6 (F6, scanner no-crash law): scan.mjs installs a persistent socket 'error'
  handler for the whole scan lifetime + a scan-wide deadline; both paths resolve to
  the fail-closed refusal (never an unhandled 'error', never process exit, never a
  hang); tests add mid-stream clamd death + wedged-scanner timeout.
- W7 (F7): `clara_runtime` SELECT on processing_call_reservations + its unrestricted
  policy — FIX-DB determines usage: if nothing runtime-side reads the table, REVOKE
  grant + drop policy; if the reconciler needs it, keep grant but firm-scope is
  impossible for runtime (runtime is firm-agnostic) — then RECORD as PIN-AB-7 with
  rationale. Default = revoke (companion §9 is the law).
- W8 (F8 bundle): FIX-SP-1 wording sweep incl. the frozen chatTurn.v2.errors.ts
  text (lawful pre-merge; re-baseline manifest via --update once at the end);
  FIX-SP-4; FIX-SP-5 (`high_stakes_reasons text[]`, including 'amount_override'
  when stamped); FIX-S-1 `_fact_hash` helper (5 sites); FIX-S-2 corroboration
  helper (3 sites); review.ts vendor hydration: read `proposal.new.name` /
  `proposal.existing_id`, and treat `current_outcome.decision='birth'` as the
  "new vendor" badge (the fn RETURNS 'birth'; my earlier null-means-birth guidance
  was wrong).
- W9 (F9, test truth): s6-locks gains the correction and revise forced schedules
  (companion §11 probe 2 verbatim); the stale-evidence test pins CLR25 EXACTLY;
  the Tier-A behavior tests adopt the W3 polygon/single-doc rules (+ a
  no-geometry-never-corroborates case); the reset-gated s6-upgrade drill gains a
  LEGACY-STATE correction case (build approved-cite+draft-on-one-filing at 0008,
  apply 0009, run the correction — restores the §3.5 combined-case coverage the
  reorder lost).
- W10 (F11, ops honesty): remove the no-op CLARA_INVOICE_FACTS_MAX_ATTEMPTS from
  env/README (the DB owns the cap at 3 — say so); document CLARA_CLAMD_HEALTHY_RUN_MS;
  fix the pools.mjs "two-login" header + budget note; add the tracked operator
  ceremony artifact packages/db/deploy/write-login-ceremony.sql (ALTER ROLE ...
  LOGIN + password via psql prompt/env — placeholders only, no secrets).
- CROSS-LANE PINS ratified mid-round (FIX-RT ⇄ FIX-DB; BINDING):
  (i) `persist_invoice_facts(p_task uuid, p_fields jsonb, p_raw_sha256 text,
  p_normalization_version text, p_pages_used int, p_envelope jsonb default null)`
  — the 6th arg merges into document_extractions.envelope; `_invoice_fact_state`
  requires `envelope->>'corroboration_ineligible' IS NULL` AND a non-empty total
  polygon for corroborated=true. Arity change ⇒ DROP/CREATE + REVOKE/re-grant
  clara_runtime (C-1).
  (ii) the draft receipt (core/wake_draft_entry) carries `exception: true` when
  flags.amount_exception is stamped, plus `provenance_tier`; `get_coding_attempt`'s
  return exposes `exception` (the part_payload the core stores already carries what
  the wrapper passed — the DB additionally reflects the exception state so recovery
  is truthful even for a pre-crash attempt).
- Standing: PIN-AB-3 unchanged (pre-MyInvois gate). Parity-test depth (F9 note) is
  ACCEPTED as-is for S6 (it gates render branches; SQL hydration is covered by db
  suites) — recorded, not fixed.

## 7. Post-merge (NOT in any lane): RPR onboarding script + 17-bill replay eval + GATE-3
demo. op_key format pinned now: `onboard-rpr:<class>:<code>`.

## 8. Amendment register (orchestrator-maintained; feeds contract §13 + the as-built review)

- PIN-AB-1: `get_coding_attempt(p_task)` recovery read, grant clara_runtime — implied by
  C-12 but unnamed in companion §9.
- PIN-AB-2: scanner death degrades to fail-closed uploads instead of runtime-FATAL (ops
  finding; live incident 2026-07-19: clamd OOM at 1024MB crash-looped the runtime).
- PIN-AB-3 (L4 finding, 2026-07-19): `record_rule_resolution` (0007:2308-2317) joins
  extractions/regions without an engine_kind pin — a C-7 law violation. BENIGN today
  (the pinned invoice-facts field_path vocabulary shares no substring with the
  'tin'/'ssm'/'account' keys), latent misattribution hazard when the facts vocabulary
  gains registration/TIN/bank fields (MyInvois slice). DISPOSITION: adjudicate at the
  as-built review; recommended fold in the fix round (engine_kind pin on the read);
  MUST-FIX gate before the MyInvois slice regardless. Runtime-side twin already fixed
  by L4 (matcher readMatchInputs pinned).
- PIN-AB-6 (RULED 2026-07-19, the invoice-facts discovery gap): DB-enqueued
  invoice_facts tasks have no runtime spool sidecar. DISCOVERY is already lawful —
  0008:49 grants clara_runtime SELECT on document_processing_tasks (the reconciler
  snapshot uses it). METADATA rides the CLAIM RECEIPT: 0009's rebuilt
  `claim_document_processing_task` enriches BOTH the 'running' and 'replayed' return
  branches with `document_id, firm_id, lane, storage_path, sha256, mime_type,
  byte_size` (definer-internal read of clara.documents — ZERO grant delta; §9
  untouched; same-signature replace stays lawful). held_egress/failed branches
  unchanged. The SQL edit lands AFTER the author lane exits (orchestrator-applied,
  drills re-run). L3 consumes receipt metadata for invoice_facts (sidecar stays the
  documentIngest path). Blind lane: this enrichment is SANCTIONED, not a divergence.
- D-L2-1 (HIGH, RULED — L1 fix batch): the four new read fns evaluate `wake_firm()`
  unconditionally; wake_firm EXECUTE is agent-only, so the HUMAN lane 42501s (breaks
  the je_review card + uncoded list). FIX: evaluate wake_firm() ONLY under
  `current_role='clara_agent_ro'` (the D-F1 branch shape the companion already
  specifies); human path rides _human_ctx/RLS. Do NOT grant wake_firm to
  clara_authenticated.
- D-L2-2 (MEDIUM, RULED — L1 fix batch): core accepts a document-bound
  supplier_bill draft with NULL evidence (zero entry_evidence rows). RULING: the core
  raises CLR21 `evidence_invalid` when `p_coding_kind='supplier_bill'` AND p_evidence
  is null/empty — scoped to the coding flow so PLAIN human doc-bound drafts (no
  coding_kind, shipped S5 semantics) stay lawful evidence-less. §12's "document-bound
  draft" reads as "coding-flow draft"; the per-layer map notes this scoping.
- D-L2-3 RESOLVED-BENIGN (integration check done by inspection): pages_per_day
  carries CHECK (pages_per_day > 0) — a zero budget is UNREPRESENTABLE — and 0009's
  facts reservation (0009:501,533) uses the identical coalesce(pages_per_day,1000)
  pattern as all four 0007 OCR sites (1638,1667,1704,1765). Symmetric by
  construction; the L2 probe premise (=0) could not have bound. L2 re-run to confirm
  its test's premise; note stays for the as-built review as an observation only.
- L1 POST-CODEX FIX BATCH (orchestrator-applied after the author lane exits, drills
  re-run): PIN-AB-6 receipt enrichment · D-L2-1 wake_firm branch · D-L2-2 evidence
  raise. All same-signature body edits; zero grant deltas.
- FLAKE-1 (as-built review to adjudicate): ONE deadlock (40P01) in the S4-AB11
  transition-matrix test during a full cross-package concurrent sweep (db + runtime
  suites on one DB — the CI execution shape); the identical re-run was fully green.
  0009 added lock edges reachable from agent_tasks (coding_attempts composite FK →
  agent_tasks; the WHEN-scoped bill-shape constraint trigger; persist_invoice_facts
  filing→entry locks). Review should enumerate the new edges vs the S4 transition
  paths and rule: benign test-concurrency flake vs a rare real inversion needing a
  lock-order fix. Not papered over with a retry.
- PIN-AB-4 (L5): api.ts exceeded the 500-line cap → je_review wrappers split into
  `app/chat/review.ts`; `rpc` exported from api.ts. Cosmetic, recorded.
- PIN-AB-5 (L5): N-F18 realized WITHOUT a dedicated inbox (none exists as-built) — the
  coding-tasks list renders origin='correction' recodes + a taskId filter for future
  notification deep-links. If the contract's "inbox renders task state" implies a real
  inbox surface, that is NOT built — as-built review adjudicates.
- Integration checklist: final 0009 must end `reset role;` (runner bookkeeping runs as
  the superuser again; two lanes hit 42501 on the mid-draft file); verify via the
  runner on a clean throwaway, never psql -f. ALL throwaways (clara_test, clara_m_test,
  clara_rt_test, clara_blind_test) get a full runner reset on the FINAL 0009 —
  clara_m_test carries a DRAFT-0009 checksum row (c2bba837…) that will mismatch the
  final file. Foreign-line risk RESOLVED: L4 confirmed (precisely) it never wrote to 0009 —
  session-side execution of the file text only; L2 read-only. The final file is
  Codex-authored end to end; normal drill verification suffices. RECONCILE at integration vs L1's actual
  0009: (a) get_draft_review jsonb keys ↔ L5 `toDraftReview` in app/chat/review.ts;
  (b) coding_tasks_visible columns ↔ L5 CODING_TASK_COLS; (c) list_uncoded_filings
  jsonb keys ↔ L5 uncoded mapper; (d) CLR21 DETAIL `{"reason":<token>}` actually
  emitted by the DB and preserved through PostgREST + the L3 tool boundary.
