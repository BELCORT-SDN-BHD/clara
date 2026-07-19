# Lane 3 — S5 document surfaces the coding flow consumes (ground truth)

Sources read: `packages/db/migrations/0007_document_pipeline.sql` (full, 2807 lines),
`0008_runtime_read_surface.sql` (full), `packages/runtime/lib/{matcher,egress,structured,structured-worker}.mjs`,
`packages/runtime/workflows/{documentIngest.impl.ts,documentIngest.behavior.mjs,chatTurn.impl.ts,chatTurn.prompt.ts}`,
`packages/runtime/lib/{pools,reconciler}.mjs`, `apps/dashboard/app/documents/{page,DocumentDetail}.tsx`,
`apps/dashboard/app/chat/parts.tsx`.

---

## (a) Extraction storage shape — what a reader actually gets

**Tables:** `clara.document_extractions` (one row per document×engine×version_n; `envelope jsonb`,
`status`, `page_count`, `superseded_by`) and `clara.document_regions` (one row per OCR line / table
cell; `locator_kind`, `locator jsonb`, `field_path`, `text_content`, `engine_confidence`,
`monetary_raw`, `monetary_cents`). Writer: `clara.persist_document_extraction` (0007:2163-2210),
called only from `processDocumentTaskBehavior` (documentIngest.behavior.mjs:49-61).

**The engine is Azure DI `prebuilt-layout`** (`packages/runtime/lib/egress.mjs:4`, confirmed again
at `AZURE_ENGINE_SNAPSHOT.engineId = "azure-di:prebuilt-layout:2024-11-30"`, line 172) — **not**
`prebuilt-invoice` or any semantic document model. `normalizeAzureLayout` (egress.mjs:113-159) walks
`analyzeResult.pages[].lines[]` and `.tables[].cells[]` only. Consequence, stated exactly:

- `document_regions.field_path` is a **positional locator**, e.g. `pages.1.lines.7` or
  `tables.0.cells.12` — never a semantic key like `invoice_number` or `total_amount`.
- `document_regions.text_content` is the **raw OCR line/cell string** as Azure read it — no field
  typing, no normalization beyond `String(...)`.
- `monetary_raw` / `monetary_cents` columns **exist in the schema but the Azure-layout normalizer
  never populates them** (egress.mjs:126-127, 141-142 hard-code both to `null` for every region it
  emits). Nothing else writes them either — grepped every `document_regions` insert in 0007; the
  single writer is `persist_document_extraction`, fed only by this normalizer or by
  `structured.mjs`/`structured-worker.mjs` (spreadsheet/CSV structured-parse lane — also produces
  the same `{locator_kind, field_path, text_content, ...}` shape, not semantic fields).
- `document_extractions.envelope` carries `{schema_version, engine, content (the full concatenated
  page text), pages[] (page_number/width/height/unit), tables[] (Azure's raw table JSON — rows of
  cells, not "invoice lines")}`. No invoice-number/date/total keys anywhere in the envelope either.
- `clara.documents.document_kind` (enum incl. `'invoice'`) and `financial_date` **exist as columns**
  but are **never set by the live ingest path**. `finalize_document_intake` (0007:1977-2050), the
  one production writer of new `clara.documents` rows, takes no `document_kind`/`financial_date`
  params at all. Only the test/seed helper `_seed_verified_document` (1567-1622) accepts and stamps
  them. **In real operation `document_kind` is NULL until a human (or a future classifier) sets it —
  no such setter function exists yet** (no `set_document_kind`/classifier writer found in 0007).

**What this means for Slice 6:** a reader gets raw OCR text positionally located on the page/table,
plus a full-document text blob (`envelope.content`). There is **no structured "invoice number / date
/ total" fact to cite** — any such fact the coding flow presents as "cited" must be the model's own
read of `envelope.content` / region `text_content`, quoting the literal source string and its
`region_id`/`field_path` (which the schema *can* carry back per `attribution_candidate_regions`-style
region citation), not a pre-extracted structured field. This is a real gap if the contract wants
"cite invoice #X, dated Y, total Z cents" as a DB-verified fact — Slice 5 gives no such row anywhere.

---

## (b) Citability law — what must be true before a document is codable

**The exact predicate**, `clara._active_document_filing(p_document, p_sha256, p_client, p_lock)`
(0007:982-1003), required by both `_draft_entry_core` (line 1211, when `p_document is not null`) and
`approve_entry` (line 1293-1294, re-checked at approval time against the entry's stored `filing_id`):

```sql
select f.id from clara.document_filings f join clara.documents d on d.id = f.document_id
where f.document_id = p_document and f.client_id = p_client and f.retired_at is null
  and d.sha256 = p_sha256 and d.bytes_verified_at is not null
```

So: **an ACTIVE (non-retired) `document_filings` row to the exact target client, AND
`documents.bytes_verified_at is not null`** (bytes verified against the declared sha256 at intake
finalize/upgrade time — stamped once, immutably, by `finalize_document_intake` or
`_upgrade_legacy_document`; see 0007:2010-2021). Absent either condition → `CLR02` ("active verified
filing provenance not established"). This is re-asserted at `approve_entry` time too (line 1294:
`if v_filing <> e.filing_id then raise 'entry is not bound to the active filing'`), so a filing
retired between draft and approve blocks the approval, not just the draft.

**The assign/filing act:** `clara.file_document(p_document, p_client, p_resolution, p_op_key)`
(0007:1367-1432) is the ONLY general-purpose filing writer reachable outside test/seed/legacy-backfill
code paths (grepped every `insert into clara.document_filings` in 0007 — six sites total: legacy
backfill §3, `file_document`, `_seed_verified_document`, `_upgrade_legacy_document`,
`confirm_attribution_candidate` (§9's optional `p_file_document:=true` path), and
`approve_wrong_client_correction`'s correction-driven re-file). **All of these except the one-time
legacy backfill are gated behind `clara._human_ctx(clara.role_rank('bookkeeper'))`** — i.e. a real
logged-in human at bookkeeper rank or above. Confirmed at the grant level too (0007:2761-2773):
`file_document`, `confirm_attribution_candidate`, `retire_document_filing`,
`propose/approve_wrong_client_correction` etc. are granted **only to `clara_authenticated`** — none
of them are granted to `clara_agent_ro`, `clara_wake_interactive/proactive`, or `clara_runtime`.
**The agent cannot file a document, under any wake kind, full stop.** `record_rule_resolution`
(the matcher's lane-1 writer) explicitly documents this in a comment (line 2346-2347): *"A rule
resolution is attribution evidence, not a filing."*

**Practical consequence for the coding-flow contract:** the target document must already carry an
active filing to the client the coding flow is drafting under, before `wake_draft_entry` (the
agent-callable entry-drafting fn, confirmed below) will accept it. A document sitting in the
"unassigned" lane cannot be cited by an agent-drafted entry — a human must file it first (via the
`/documents` page's `fileToClient`, or `confirmCandidate` with `p_file_document=true`, or a future
Slice-6 UI affordance), *or* the Slice-6 write floor must add a new human-gated filing act inside the
coding-flow turn itself (still human-executed, e.g. via a card action, not agent-executed).

---

## (c) `client_resolutions` rows after matcher lane-1 / lane-2 vs human assignment

Confirmed by reading `record_rule_resolution` (2296-2352), `record_attribution_attempt` +
`matcher.mjs`'s `applyMatcherEffects` (2251-2294 / matcher.mjs:180-215), and
`confirm_attribution_candidate` / `dismiss_attribution_candidate` (2354-2414):

| Path | Writes `client_resolutions`? | Writes `document_filings`? | Row left behind |
|---|---|---|---|
| **Lane 1** (`record_rule_resolution`, hard identifier — tin/ssm/bank_account — exactly one unique client hit) | **Yes** — `method='rule', confidence=1.0, subject_kind='document', subject_id=doc` | **No** | A `rule` resolution exists but the document is *still unassigned* until a human files it |
| Lane 1, zero or >1 hits | No (only an `attribution_attempts` row, `outcome='abstained'`, `conflict_reason` set) | No | Nothing citable; visible only as an abstained attempt |
| **Lane 2** (`record_attribution_attempt` + `matchCandidates`, name/alias exact match) | **No** | **No** | Only `attribution_attempts` (`outcome='candidate'` or `'abstained'` on ambiguous) + `attribution_candidates` rows, `disposition='open'` |
| **Human confirm** (`confirm_attribution_candidate`) | **Yes** — `method='human', confidence=1.0`, evidence `{candidate_id}` | **Only if** `p_file_document=true` is passed (optional 3rd arg, default `false`) | Candidate flips to `disposition='confirmed'`; filing is a *second, optional* step bundled in the same call |
| **Human explicit** (`file_document`) | Yes, if no matching resolution already exists — self-creates one (`method='human', confidence=1.0`) | **Yes, always** | This is the "assign" act proper |

So after the matcher runs, the *most* an agent's read tool will ever see for an unfiled document is:
an `attribution_attempts` row (outcome `candidate`/`abstained`/`rule_resolved`) and, for lane-2,
`attribution_candidates` rows with `disposition='open'` pointing at 1+ client_ids ranked by
`rule_kind` (`name_exact` > `alias_exact`), each backed by `attribution_candidate_regions` (which
regions triggered the hit). **None of this is filing** — `document_filings` stays empty for that
document until a human acts. The coding flow's `approve` step will require `wake_draft_entry` to have
already resolved a `filing_id` (via `_active_document_filing`), which in turn requires the human-only
filing act above to have already happened — the coding flow cannot bootstrap client attribution by
itself even when lane-1/lane-2 found a confident candidate.

---

## (d) Masked read views + 0008 runtime read grants — what's already readable vs the gap

**Two read roles exist; do not conflate them:**

1. **`clara_agent_ro`** — the **chat-turn wake role** (per-attempt, firm-scoped via
   `clara.wake_firm()` in RLS `USING`, minted through `pools.mintWakeCredential(firmId)` +
   `withReadWakeScoped`, `packages/runtime/lib/pools.mjs:195-233`). This is what `chatTurn_v1`'s
   `buildReadTools` actually executes on.
2. **`clara_runtime`** — the **pooled workflow/matcher/relay role**, RLS policies are `using(true)`
   (firm scoping is NOT the RLS boundary for this role — every consumer/writer hard-scopes firm in
   its own SQL instead; see matcher.mjs's extensive comments on this, lines 26-35).

**`clara_agent_ro` already has SELECT on** (confirmed grants, firm-scoped by `wake_firm()`):
`clients`, `coa_accounts`, `documents`, `client_resolutions`, `journal_entries`, `journal_lines`,
`fixed_assets`, `notifications` (0003_books_core.sql:507-525) **plus, from 0007** (2740-2741):
`document_filings`, `document_extractions`, `document_regions`.

**`clara_agent_ro` does NOT have SELECT on:** `attribution_attempts`, `attribution_candidates`,
`attribution_candidate_regions`, `client_identifiers`, `client_aliases`, `filing_corrections`,
`filing_correction_items`, `firm_document_limits`, `document_intakes`, `document_processing_tasks`,
`document_ingest_reservations` (all of these are `clara_authenticated`-only or `clara_runtime`-only
grants — 0007:2742-2746, 2747-2748, 0008:36-57). **`document_intakes_visible` /
`document_processing_tasks_visible`** (the two masked human views, 0007:2233-2241, columns:
id/uploaded_by/origin/filename/mime/bytes/status/document_id/failure_code/expires_at/created_at/
updated_at for intakes; id/document_id/lane/status/version_n/attempt_count/error_code/timestamps for
tasks — deliberately never expose `chat_session_id`, `token_hash`, `storage_key`, `engine_config`,
`vendor_op_ref`, `workflow_run_id`) are **granted to `clara_authenticated` only**, not
`clara_agent_ro` (2747-2748).

**0008's two amendments** only extended **`clara_runtime`**, not `clara_agent_ro`: (1) SELECT on
`document_extractions`/`document_regions`/`clients` (for the matcher's lane-2 computation), (2)
SELECT on the runtime's own control tables `document_intakes`/`document_processing_tasks`/
`document_ingest_reservations` (for the reconciler's DB-first sweep). **0008 did nothing for the
chat-turn read role** — it was scoped purely to close two runtime-internal read gaps, unrelated to
what a chat session can see.

**Gap for a firm-scoped unassigned-document read tool:**
- **Base listing works today with zero new grants.** `documents` + `document_filings` are both
  already SELECT-granted to `clara_agent_ro`, both firm-scoped via `wake_firm()` RLS. 0007 even left
  a purpose-built index for exactly this query: `ix_document_filings_active_lane` on
  `document_filings(firm_id, document_id) where retired_at is null`, with the comment *"The
  unassigned lane is an anti-join against this active-filing index"* (0007:1110-1112) — i.e. `select
  d.* from documents d where not exists (select 1 from document_filings f where f.document_id=d.id
  and f.retired_at is null)`.
- **No governed function does this yet.** Grepped every `create function clara.list_*` /
  `get_*` read fn across 0004-0008 — nothing named `list_unassigned_documents` or similar exists. A
  new `security invoker` SQL function analogous to `list_journal_entries`/`get_journal_entry`
  (0004_governed_fns.sql:716-728, both `security invoker`, relying on RLS for scoping) is a clean,
  precedented shape to add — genuinely new, but low-risk (no new grants needed for the base case).
- **Real gap #1:** surfacing *why* a document is unassigned (attribution candidates/conflict reason)
  to help a human or the model choose a client needs `attribution_attempts`/`attribution_candidates`
  — **not granted to `clara_agent_ro`**. Either add a 0009-style grant (mirroring 0008's pattern) or
  wrap the join inside a `security definer` function that the agent calls (narrower, auditable).
- **Real gap #2 (workflow-level, not DB):** `chatTurn_v1`'s `buildReadTools` (chatTurn.impl.ts:63,
  198-203) is only invoked `if (clientId)` — i.e. **no read tools exist at all in a chat session that
  is not already bound to a client.** Since unassigned documents by definition have no client, an
  "unassigned document" tool needs either (a) a firm-scoped tool set built independent of `clientId`
  (the wake credential itself is already firm-scoped — `mintWakeCredential(firmId)` takes no
  client — so this is architecturally free, just not wired), or (b) the flow only fires once a
  client is already selected in the chat session. This is a `chatTurn_v2` design decision, not a
  Slice-5 constraint.

---

## (e) `/documents` page + attachment chip as-built

**`/documents` page** (`apps/dashboard/app/documents/page.tsx`) is explicitly "plumbing-grade, NOT
the Phase-4 design build" (file header comment), reading via the **direct PostgREST human lane**
(`clara_authenticated`, pasted dev JWT) — not through the chat runtime at all. Data sources:
`listDocuments`, `listActiveFilings`, `listClients` (api.ts, PostgREST reads on the granted tables/
views). **Unassigned/Filed split is computed client-side in React**, identical logic to the
"anti-join" described above: `activeFiledIds = new Set(filings.map(f => f.document_id))`;
`unassigned = documents.filter(d => !activeFiledIds.has(d.id))` sorted oldest-first (FIFO comment:
"GAP5-7 zero-client escape hatch: the lane is reachable/complete with NO client selected" —
page.tsx:48-59). `DocumentDetail.tsx` per-document pane pulls `filingsForDocument`,
`attemptsForDocument`, `openCandidates(attempt ids)`, `readProcessingTasks` — i.e. the full human-role
read surface (`attribution_attempts`/`attribution_candidates` included, since this is the
`clara_authenticated` lane, not `clara_agent_ro`).

**No "documents cited by entries" inverse view exists in the dashboard.** `journal_entries` carries
`document_id`/`filing_id`/`source_doc_sha256` (added 0007:405-409), so the inverse relation ("which
filed documents have zero journal entries citing them" = candidate "uncoded bills") is derivable by
a plain anti-join against `journal_entries.document_id`, but **no query/view/function does this
today** — genuinely new for Slice 6 if the coding flow needs an "uncoded bills" worklist rather than
working off one document named in the chat turn.

**Attachment chip** (`apps/dashboard/app/chat/parts.tsx:105-163`): this is the single most important
as-built constraint for Slice 6. Explicit comment: *"Honest-state law ([DELTA-OWNER-2]): the chat
door is a CAPTURE door in Slice 5 — Clara does not perceive the attachment in-turn."*
`ATTACHMENT_NON_PERCEPTION_COPY = "Clara will see this document once it is filed."` is rendered
under every attachment chip. The chip itself only enriches `{filename, status}` from
`document_intakes_visible` — it carries `intake_id`/`document_id` (validated at insert time by
`_tf_validate_chat_attachments`, 0007:601-634: up to 5 attachments/turn, each must reference an
**adopted** intake, i.e. `status in ('finalized','adopted')`, owned by the same author/firm) but
**the model never receives the document's bytes, extraction text, or region content inside the
turn** — `chatTurn_v1`'s tool set (get_context_pack/trial_balance/list_journal_entries/
get_journal_entry) has no attachment-reading tool at all. **"In-turn attachment perception" is 100%
new Slice-6 scope**, not a partial capability to extend — Slice 5 built capture/admission/masked-
status only, by explicit design ruling.

---

## (f) Processing task states + `held_egress` + `CLARA_DOC_EGRESS_APPROVED`

**States** (`document_processing_tasks.status` CHECK, 0007:156-157): `queued → running → done|failed`,
plus `held_egress` as an alternate post-`queued` state **only for the `lane='ocr'` (Azure DI) lane**.
`lane='structured_parse'` (in-process CSV/XLSX worker) and `lane='none'` (store-only, e.g. e-invoice
XML — `stored_unparsed`) are **never held** — confirmed in `claim_document_processing_task`
(0007:2100-2127): the held-egress branch is gated `if t.lane='ocr' and not
coalesce(p_egress_approved,false)`.

**Who reads the flag, and when:**
1. **Workflow claim time** — `documentIngest.impl.ts:48`, `claimDocumentTaskStep` reads
   `process.env.CLARA_DOC_EGRESS_APPROVED === "1"` live and passes it as `p_egress_approved` into
   `claim_document_processing_task`'s CAS. If false, a freshly-claimed OCR task flips straight to
   `held_egress` (never calls Azure DI; `document.extraction_status` also set to `held_egress`) —
   this is a one-shot check at claim time, not a standing hold.
2. **Reconciler leader-guarded sweep** — `packages/runtime/lib/reconciler.mjs:416-432`,
   `reconcileDocumentTasks`. When the flag is `"1"`, the sweep (a) calls
   `clara.release_held_document_tasks(1000)` (0007:2129-2144) which bulk-flips every DB row
   `held_egress → queued` (and `documents.extraction_status → pending`), then (b) also flips its own
   in-memory task-metadata sidecar and re-drives the documentIngest workflow so those tasks are
   actually re-claimed and sent to Azure DI. This runs on the reconciler's normal cycle interval —
   **not instantaneous** on flag flip; the actual Azure DI egress starts once the next reconcile
   cycle (or a fresh claim) observes the flag.

**Operationally, flipping `CLARA_DOC_EGRESS_APPROVED` from unset/`0` to `1` means:** every OCR-lane
document sitting in `held_egress` across the firm gets bulk-released and re-queued, and the
first real outbound HTTP calls to Azure Document Intelligence begin (this is exactly the "egress
flag OFF" gate the T2-48h ceremony run-sheet references — Slice 5 shipped with external network
egress structurally possible but operator-gated off by default; `structured_parse`/`none`-lane
documents are unaffected either way since they never touch this flag).
