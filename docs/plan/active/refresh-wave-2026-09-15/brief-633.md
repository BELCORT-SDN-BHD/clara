# Brief: #633 — automatic intake and per-file custody after upload or attach

## Orchestrator decisions (binding)

- **Migration number: none** (DECISIONS §1.2 — "#633 none"). You have **no allocated number**. Zero SQL
  files. If you ever conclude a door is required, stop and report it; do not mint a number.
- **The settle-without-reload poll ships as a bounded re-read of the already-granted masked views**
  (`document_intakes_visible`, `document_processing_tasks_visible`, granted at
  `packages/db/migrations/0007_document_pipeline.sql:2747`; transport already written at
  `apps/web/lib/documents/intake.ts:136`, `:144`). Preferred: list-form re-read at mount + re-poll **only
  while a row is non-terminal**, stop on settle, backoff, paused when hidden, cleared on client/permission
  change. **Fallback, only with proof**: if the 0183 plan-cache pathology
  (`0183_activity_sweep_attribution.sql:1055-1061`; tail refuses without `plan_cache_mode =
  force_custom_plan` at `:1189-1192`; recorded 145 ms → 2.0-2.8 s from the 6th call on a pooled connection)
  reproduces on your rig, **descope settle-without-reload to a visible Refresh plus reload recovery**, mark
  that #606 obligation partial by name, and file the door as a follow-up. **Proof to pick**: ≥10 sequential
  calls of the exact read shape on `clara_633` through one `clara_authenticated` persona session that
  reuses its connection, timings reported; write "unverified on PostgREST" for what you cannot measure
  locally. A direct view read cannot pin `plan_cache_mode` — say so either way.
- **The four capability tiers on the intake surface ship from the already-granted registry table, not from
  a per-row `get_document_state`.** `clara.document_capabilities` is a **global 240-row catalog** (12
  formats × 20 kinds), `grant select … to clara_authenticated` (`0191_document_capability_registry.sql:271`)
  under a `for select … using (true)` policy (`:267-268`), columns at `:200-214`. Read it **once per mount**
  into a new `lib/documents/capability-registry.ts` and join per row in the browser: it is a static
  vocabulary with no tenant column, so it is **never polled** and never enters the bounded poll above. Do
  **not** call `clara.get_document_state(uuid,uuid)` (`:1344`) per list row — that is the detail panel's
  single-document read and per-row it is an N+1 under the user's JWT. **Join key**: the registry's
  `mime_type` is the ONE canonical mime per format (`:206`) and intake canonicalises the declared MIME
  through `MIME_ALIASES` before anything is stored (`packages/runtime/lib/intake.mjs:88`, table `:33-50`;
  `finalize_document_intake` copies `i.declared_mime` into `clara.documents` at `0007:2012`), so the queue
  row's `declared_mime` (`INTAKE_COLS`, `intake.ts:130`), a filed row's mime and
  `list_unassigned_documents`' projected `mime_type` (`0009:2601`) are the same spelling. An unresolvable
  mime or an unseeded pair renders the honest unknown-pair default — **never a guessed tier**.
- **Routes**: firm intake leaf `(firm)/documents` (DECISIONS §1.8) over the **existing** granted
  `clara.list_unassigned_documents(int)` (`packages/db/migrations/0009_coding_floor.sql:2590`, SECURITY
  INVOKER, `limit least(greatest(coalesce(p_limit,50),0),500)` at `:2610`, granted `clara_authenticated,
  clara_agent_ro` at `:2908-2914`) + `record_client_resolution` + `file_document` — already written as the
  two-step `fileToClient` (`apps/web/lib/documents/doors.ts:20`, `:48`, `:58`). **Do not re-mint that
  function.** #648 links to your leaf. Do **not** extend to firm-altitude chat attachments (that is
  `chatTurn_v20`, no product benefit; the existing refusal at `ClaraThreadView.tsx:575-591` and its
  assertion at `chat-parity-walk.spec.ts:229-234` stay unchanged).
- **Scope spine**: register the new leaf and pass both census walls (DECISIONS §1.6). Measure `classify()`
  (`apps/web/tests/firm-scope-surfaces.test.ts:232`) before editing a registry — a leaf under
  `app/(firm)/layout.tsx` classifies *ancestor-covered* and needs no `SCOPE_ENTRANCES` row; **any colocated
  non-leaf file beside `page.tsx` needs a `COLOCATED_MODULE_ROSTER` entry**
  (`firm-scope-fourth-entrance.test.ts:195`) with a substantial reason, and **no inline `"use server"`**
  (WALL 2, `:509`). An unregistered firm leaf is a scope hole, not a cosmetic miss. A census wall catches a
  **missing registration**, never a broken attribution flow — the leaf owes its own walk leg (§4.8).
- **Ownership** (DECISIONS §1.7): you own `apps/web/lib/documents/useUploadQueue.ts`,
  `apps/web/lib/documents/intake.ts` transport, and the upload half of
  `apps/web/components/clara/InterviewRunCard.tsx`. #649 edits none of them and re-composes on top of you —
  land first, keep the queue half of that card separable.
- **What NOT to touch**: no frozen body or closure (`touches_frozen_closure: false` — `intake.mjs`,
  `intake-lanes.mjs`, `autodraft.mjs`, `facts-gate.mjs`, `intakeRoutes.ts` are all outside the five
  `packages/runtime/lib` manifest entries). **No `documentIngest_v3`** — per-step progress from inside the
  frozen ingest body is refused (SYNTHESIS.md:114); read the honest DB task rows instead. **No
  `accounting_work` minting at intake** — `purpose` admits three values (`0178:305` widened by
  `0194:228-230`) and is a member of `_tf_accounting_work_immutable`'s frozen column array (the array
  literal is `0184_work_cancel_ordering.sql:449`; `0194:224` states the consequence — a Work's purpose is
  decided at admission and never moves). **No `SECURITY DEFINER` wrapper over
  `clara.entry_evidence_links`** — the grant exists (`0182_journal_work_evidence.sql:360`) under FORCE RLS
  `firm_id = clara.jwt_firm()` (`:358-359`); wrapping it *removes* that guarantee. Do not alter
  `document_intakes_visible` or `document_capabilities` (0007- and 0191-created, bytes immutable). Do not
  edit `docs/PRD.md` or `docs/ARCHITECTURE.md`. Do not touch the activity kind ladder (D13) — record a
  named residual.
- **Stable strings**: the queue's terminal word `'Filed'` (asserted at `apps/web/e2e/chat-parity-walk.spec.ts:209`)
  and `ComposerAttachmentControl.tsx:58`'s `IN_FLIGHT` state-string set stay stable, **or** you update that
  spec in the same commit and it stays green.
- **"Start processing again" stays per filing**, unchanged (#614 ruling, `components/documents/document-filings-history.tsx`).
  You own showing that admission already happened; you may not remove the only recovery path.
- **Aggregate batch progress is out of scope** — `docs/PRD.md:120` assigns it to #636. You deliver per-item
  independence only and say so in the report.
- **Detail-panel facts verdict stays as #624 built it** (`apps/web/lib/documents/document-state.ts:204`'s
  honest `pending`). `null` kind becomes actionable **on list and receipt rows only**, by mounting #646's
  existing `set_document_kind` control (`apps/web/lib/documents/doors.ts:84`) — a declared boundary crossing;
  name it in the report.
- **Successor contract: none owed.** Your journey needs no chat-lane or Work-lane tool. Say so explicitly
  under that heading so the integration worker does not look for one.
- **Playwright port triple**: `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3240`, `CLARA_E2E_NEXT_PORT=3241`,
  `CLARA_E2E_RUNTIME_PORT=3242`.
- **Rig row**: worktree `C:\Users\zhant\Desktop\clara-wt\633`, branch `impl/633-document-intake`,
  PostgreSQL `127.0.0.1:55502`, database `clara_633` (RIG.md).

## 1. Current state

**db — every read this ticket needs is already granted.** `clara.document_intakes` + masked view
`document_intakes_visible` (`0007:2233`, grant `:2747`; never-exposed columns listed at `0007:2231-2232`);
`document_processing_tasks_visible` (`0007:2238`, same grant). Identity is `unique (firm_id, sha256)`
(`0003_ledger_core.sql:76`) — same name, different bytes stay distinct. `_enqueue_invoice_facts_core`
returns `awaiting_extraction` until a `done` ocr/structured_parse extraction exists (`0177:44-58`,
self-pinned `:107-115`). The four capability tiers are **table rows the human lane already holds**:
`clara.document_capabilities` (`0191:200-214`, grant `:271`); `_document_capability` / `_document_format`
are the agent lane's definer path (`:507-508`) and `get_document_state` the detail panel's single-document
read (`:1344`). Codeability: `0165:204`, non-coding kinds `:232-249`, spliced out of the coding lane by
`0168`. `entry_evidence_links` carries `work_id` + unique `logical_op_id`
with `ix_entry_evidence_links_work` (`0182:333-348`). `list_spoken_for_documents(p_client)` (`0183:1051`)
returns `(document_id, entry_id, client_id, client_name, via)` — **no `work_id`**: it complements the
direct read, never replaces it. `list_unassigned_documents` projects `mime_type`, `document_kind`,
`extraction_status` and `unassigned:true` (`0009:2600-2606`).

**runtime — already automatic; no behaviour change owed.** `startWorld.ts:476` starts the facts-gate
consumer, `:390` the autodraft consumer; admission needs no human gate and no `request_autodraft`.
Transport `packages/runtime/src/intakeRoutes.ts`; 12-MIME allowlist and the 20 MB wall at
`packages/runtime/lib/intake.mjs:33-50`, `:28`; every admitted spelling canonicalises at `:88`. Lane
selection `intake-lanes.mjs:54-60`; **OFX is store-only at intake for the reason at `:45-51`** — an OFX
never classified as a bank statement produces no extraction, because OFX is read by the DB-routed
`statement_parse` task, not by this trip. `statement-parse.mjs:77` *does* have `parseStatementOfx`
(`:268-276`) — the old "no OFX reader" rationale is wrong on this commit; do not repeat it.

**web — the whole gap.** One transport, three callers: `upload-panel.tsx:22`,
`ComposerAttachmentControl.tsx:95`, `InterviewRunCard.tsx:408`. The queue lives in a React ref
(`useUploadQueue.ts:170`) and polls `readIntake` only inside `runOne` (`:211-212`), so a reload loses every
receipt. `remove` is cancel *and* delete in one function (`:303-330`). A row already carries
`errorStatus`/`errorKind` (`:76-77`) over `lib/wire-error-kind.ts`'s taxonomy (`unauthenticated` = 401,
`forbidden` = 403) — the permission face is a rendering gap, not a plumbing one. `putIntakeBytes` is a
single `fetch` PUT (`intake.ts:78`) — fetch has no upload-progress event in any shipping browser. Rows are
a hand-rolled `<ul>/<li>` (`upload-panel.tsx:58-97`) carrying only a phase word, while the accepted Data
Table composition sits in the same folder (`filed-document-list.tsx:5,38`; three columns `:41-43` — File /
Status / Filed, `extraction_status` and nothing else). **No intake-side surface renders any capability
tier**: `apps/web` reaches the registry only through `get_document_state` in `document-state.ts`.
`document-admin.tsx:77` renders each `document_kind` enum raw; `copy.ts:115-119` is the **written decision**
you overturn by name; `copy.ts:102-110`'s `queueRecoveryLabelKey` is the per-code idiom to copy.
`findEntryForDocument` (`lib/work/evidence.ts:398-404`) already selects from `entry_evidence_links` and
simply does not ask for `work_id`. The one `aria-live` region under `components/documents` is
`document-source-actions.tsx:271` ("ONE ANNOUNCEMENT OWNER AT A TIME") — copy it. No `(firm)/documents`
route exists and `apps/web` has never called `list_unassigned_documents`.

**tests.** A real browser upload walk already exists — `chat-parity-mock.mjs:450/:458/:462` serve
begin/PUT/finalize, `:274-288` the receipt view, `serve-built.mjs:18,571,912` dispatch it,
`chat-parity-walk.spec.ts:199-227` runs begin→PUT→finalize→"Filed"→axe. `documents-viewer-mock.mjs` serves
**no** intake leg. Real-World intake e2e `packages/runtime/tests/intake-e2e.mjs`, wired at
`.github/actions/db-live-gates/action.yml:37-48`.

## 2. Gaps / rows

| Row | Disposition |
|---|---|
| AC1 | **build** — cancel split from remove, real byte progress, mount-time receipt rehydration. Format/size/safety walls **verify-only** (`intake.mjs:28`, `:33-50`). |
| AC2 | **build** — 20 kind labels + `null` as "Needs classification"; overturn `copy.ts:115-119` by name in the report. |
| AC3 | **partial-with-named-residual** — build **both** holes, each with its own cell: (a) actionable `null` on list/receipt rows (via `doors.ts:84`); (b) the four tiers on the intake surface from the registry read (decision 3), seamed at §4.3, §4.7's `capability-registry.test.ts` and `upload-panel.test.tsx`. The defect being closed is gap-633.md's AC3(b): a payroll PDF reads `done` in the list while the detail panel says facts are unsupported for that kind. Residual: the **detail panel's** `pending` verdict stays (#624, orchestrator ruling). |
| AC4 | **verify-only** — the 0177 chain is live; prove it *on this journey* (failed/empty extraction never yields a kind) and write consumer-first + "hosted evidence pending". No new 0177 code. |
| AC5 | **build** the firm leaf **and its own walk leg** (§4.8: list → ask-once attribution → the row leaves the set → repeat attempt refused → below-floor denial face). **verify-only** client-scope auto-attribution, canonical-hash replay (0051 recovery fragment), same-name-different-bytes (`0003:76`). |
| AC6 | **build** nine `IntakeFailureCode` next-steps (`types.ts:127`); per-item independence and extraction≠accounting **verify-only** (`useUploadQueue.ts` CONCURRENCY 2; `document-state.ts:219`). |
| AC7 | **build** the four missing legs, each seamed: local cancel vs Work cancel; **in-flight permission loss** (§4.7's `p633.queue.authority_lost` — SYNTHESIS.md:247 and gap-633.md's #625 overlap row put this leg on you: #625 owns the revoke act, **#633 owns proving the in-flight upload and its filing afterwards refuse honestly**); 95/5 partial batch (per-item metric only); responsive/keyboard/announcement. Lost finalize and duplicate bytes **verify-only** (`useUploadQueue.ts:136`, `intake-e2e.mjs:180-195`). |
| AC8 | **build** all four: Data Table rows, document→Work link, bytes+counts progress, cancel separated. |
| AC9 | **build** the full state matrix and the a11y walk on **both** surfaces — the client documents tab and the firm leaf. |
| AC10 | **build** `intake-admission-e2e.mjs` and register it. |
| **H-53** (REDESIGN — re-measure, never copy) | **build** the intake-route cell: a `consent_evidence`/`identity_document` uploaded through this route keeps custody and source authority and never enters `list_uncoded_filings`/`list_review_queue`. |
| **C-37** (VERIFY) | **build** a real OFX and a real XLSX through begin→PUT→finalize with the four published tiers asserted **on the surface, from the registry read**; cite `intake-lanes.mjs:45-51` as the rationale. |
| **C-73** (VERIFY) | **partial-with-named-residual** — build a 40-file mixed-format queue cell (seamed transport) proving an exhausted poll settles as `error`/`timeout` and is never dressed as success, plus the 5-file real-World batch. Residual by name: hosted representative-scale load stays with #706/#760 (`brief-619.md:27`). |
| Aggregate batch progress | **out of scope** — `docs/PRD.md:120` assigns it to #636. |
| Activity-stream kind ladder misfiling | **out of scope** — DECISIONS D13; named residual, orchestrator files the issue. |
| `documentIngest_v3` per-step progress | **out of scope** — SYNTHESIS.md:114. |
| Firm-altitude chat attachments | **out of scope** — would force `chatTurn_v20`. |
| `interview-walk.spec.ts:38`'s written deferral (binary upload covered by the queue's own battery) | **honour it**, and say so — do not mutate the interview fixture. |

## 3. Slice (one branch)

**Migration**: none. No pins, tail assertions, preintegration gate, `rig-meta.mjs` cohort row,
`firm-scope-db-pins.corpus.ts` entry or `packages/db/package.json` gate (the db script already globs
`tests/**/*.test.mjs`). **Pins are measured, never transcribed** — you recut nothing, so you measure
nothing; these adjacent pinned bodies are off-limits: `_enqueue_invoice_facts_core` (self-pinned
`0177:107-115`, sha `42e8b0b4…`), `persist_document_extraction` (`0191:148-156`, `:659-660`),
`get_document_for_human_read` (`0190:128-132`), `_document_posting_entry` (`0197:219-223`, sha
`8ba5e67f…` — 0197's two serialisation walls depend on its exact ordering, so no read you add on
`entry_evidence_links` may become a write-path probe).

**Runtime**: no behaviour change. One standalone `packages/runtime/tests/intake-admission-e2e.mjs` on the
real Postgres World, on `intake-e2e.mjs`'s shape, registered as its own step in
`.github/actions/db-live-gates/action.yml` after the Slice-5 step (`:37-48`: throwaway `*_ci` DB, migrate,
seed, `pnpm --filter @clara/runtime exec bootstrap`, then `node tests/…`). Legs: (1) upload → ocr done →
classify → invoice facts → `admit_autodraft_task` with **zero** `request_autodraft` calls; (2) failed/empty
extraction never yields a kind; (3) duplicate bytes answer `adopted` with the 0051 recovery fragment bound
to the **existing** document; (4) five-file mixed batch (one `bad_type`, one `too_large`, three good)
settles independently; (5) SIGKILL between finalize and checkpoint leaves exactly one document and one
ingest task; (6) H-53 non-coding kind; (7) C-37 real OFX + real XLSX.

**Web**: rebuild `upload-panel.tsx` on `DataTableCard` + Table primitives (`filed-document-list.tsx:5,38`) —
File / Size / Kind / Phase / real byte progress / capability — with **three distinct controls**: Cancel
(abort this upload, keep the row), Retry, Remove. Progress is a real `role="progressbar"` with
`aria-valuenow/min/max`; there is no `components/ui/progress.tsx` in this app, so build it from the tokens
or add the primitive deliberately — never an indeterminate bar wearing a percentage. Bytes come from an
`XMLHttpRequest` + `upload.onprogress` browser path behind a seam in `intake.ts` (fetch stays for the Node
path); the count half is the existing `listProcessingTasksForDocument` (`intake.ts:144`). Split `cancel`
out of `remove` (`useUploadQueue.ts:303-330`) **without renaming a state string**; render the denied face
from the row's existing `errorKind`/`errorStatus` (`:76-77`) so a 401/403 mid-flight names the constraint
instead of reading as a transport blip. Rehydrate receipts at mount in `documents-workbench.tsx` with a
list-form query on the same masked view projecting exactly `INTAKE_COLS` (`intake.ts:130`); the predicate
is "filed to this client **or** mine-and-unattributed", never "my uploads" (`document_intakes` has no
client column). **Capability tiers** (decision 3): new `lib/documents/capability-registry.ts` reads
`document_capabilities` once per mount and resolves `(canonical mime → format, document_kind)` in the
browser. `custody` and `byte_extraction` are **format-intrinsic** — 0191's own column comment says the
intake lane does not know the kind yet (`:207-208`) — so a queue row publishes those two (OFX's honest
`stored_only` included) as soon as the mime is known; `typed_facts` and `business_operation` render as the
named **Needs classification** state until `document_kind` lands, then as that pair's published levels with
`limits` where present (`:214`). `extraction_status: done` alone never renders as facts support. New
`lib/documents/kind-label.ts` covering all 20 `DOCUMENT_KINDS` (`types.ts:171-178`) + null, consumed by
`document-admin.tsx:77`, `document-metadata.tsx:32`, the new Kind column and `uncoded-filings-list.tsx:83`.
New `ClientDocuments.queueFailure.*` keys, nine codes, one next step each, on `queueRecoveryLabelKey`'s
shape. Document→Work: add `work_id, logical_op_id` to `lib/work/evidence.ts:404`'s select and render it
beside the capability verdicts at `document-state-panel.tsx:154`, separating "this **file** was adopted"
from "this **Work** was accepted", with a **link** (not an inline control) to the Work cancel surface and an
honest "no Work yet". One `role="status" aria-live="polite"` region for per-file settlement, on
`document-source-actions.tsx:271`'s single-owner pattern. New firm leaf `app/(firm)/documents` calling
`list_unassigned_documents` + `fileToClient` (`doors.ts:58`) as an **ask-once** attribution act — one act
per document, no repeat nag, distinct from #647's counterparty question so one file is never asked twice —
rendering the same kind labels and tiers off the projected `mime_type`/`document_kind` and any refusal
verbatim. **Measure the effective read floor on the rig with viewer and bookkeeper personas**
(`list_unassigned_documents` is SECURITY INVOKER, so its floor is whatever RLS admits; `file_document`'s own
floor may be higher) and set the nav row's `minimumRole` from that measurement. States on every surface —
client tab **and** firm leaf: loading (Skeleton sized to content), successful-empty vs
filtered-no-results vs unavailable, partial/stale (labelled watermark), invalid/saving,
denied/failed (inline Alert naming the constraint), cancelled/recovery. 320 px and 200 % zoom with no
page-wide horizontal scroll, keyboard-only walk, focus **returned** after Cancel/Remove
(`filed-document-list.tsx`'s `rowRef` Map idiom), screen-reader names, reduced motion, stable URL/Back,
preserved drafts.

**Docs**: `apps/web/README.md` (app map: receipts region, firm documents leaf, "upload is adopted
automatically; Start processing again is recovery only"); `packages/db/README.md` (`list_unassigned_documents`
and `document_capabilities` now have web consumers — no new door); `packages/db/tests/README.md` (new
cells); `packages/runtime/README.md` (`intake-admission-e2e.mjs` in the recovery/verification list);
`CONTEXT.md` — two terms in the house "term / Avoid" shape: **Intake receipt** (the durable per-upload
record, recoverable at mount; *avoid* treating `finalizeIntake`'s advisory return as the receipt) and
**Unassigned source** (an adopted document with no live filing, firm-visible, awaiting one attribution act).

## 4. TDD seams (red first)

All db cells run through least-privileged `humanQuery` personas — never `rootQuery` for the assertion
under test (DECISIONS §1.10).

1. `packages/db/tests/document-intake-receipts.test.mjs` — **p633.receipt.mask**: the mount-time list read's
   key set equals `INTAKE_COLS` verbatim and carries none of `0007:2231-2232`'s masked columns.
   **p633.receipt.cross_firm**: firm-B persona → zero rows for firm-A ids, with a non-vacuity assertion that
   firm-A's persona sees them. **p633.receipt.unfiled_is_unassigned**: an adopted, unfiled intake reads as
   unassigned to its uploader and is attributed to no client.
2. `packages/db/tests/unassigned-intake-reuse.test.mjs` — **p633.unassigned.reuse**:
   `list_unassigned_documents(50)` under viewer and bookkeeper personas (**record the measured floor — the
   leaf's `minimumRole` comes from this number**); every row carries `unassigned:true`; filing removes a
   document from the set; `p_limit` clamps at 500 (`0009:2610`). **p633.unassigned.file_floor**: a persona
   that can *list* but not *file* is refused by `file_document` with its own CLR reason — the leaf must
   render that refusal, never a fabricated success.
3. `packages/db/tests/document-intake-capabilities.test.mjs` — **p633.capability.registry**: under a
   `clara_authenticated` persona the list-form read of `document_capabilities` returns the seeded pairs with
   exactly the four level columns plus `basis`/`limits`, and **every canonical mime the intake allowlist
   admits** (`intake.mjs:33-50`, the 12 spellings after `:88`'s canonicalisation) resolves to exactly one
   registry `format`; an unseeded pair yields no row, so the surface's unknown-pair default is the only
   honest answer. Non-vacuity: at least one `stored_only` (ofx) and one `supported` pair.
4. Extend `packages/db/tests/rig-docs-isolation-grants.test.mjs` — **p633.grants.nonregression**: the select
   grant on `entry_evidence_links` (`0182:360`), the two masked-view grants (`0007:2747`) and the
   `document_capabilities` select grant (`0191:271`) are this ticket's load-bearing reads, and no
   application role holds DML on any of them.
5. `packages/db/tests/document-intake-noncoding.test.mjs` — **p633.noncoding.custody** (H-53, re-measured):
   a `consent_evidence` document born on the intake route keeps custody and source authority and appears in
   neither `list_uncoded_filings` nor `list_review_queue`.
6. `packages/runtime/tests/intake-admission-e2e.mjs` — the seven legs above; red first on leg 1's
   `admit_autodraft_task` receipt with zero `request_autodraft` calls.
7. Web unit: extend `lib/documents/useUploadQueue.test.ts` — monotonic byte progress from the XHR seam;
   **cancel** pre-finalize removes the row, **cancel** past `finalizeSent` leaves `stopped`, **remove** is a
   separate verb; **p633.queue.authority_lost**: a 401 on the PUT leg and a 403 on the `fileToClient` leg
   each settle *that one row* with its own `errorStatus`/`errorKind` (`useUploadQueue.ts:76-77`;
   `lib/wire-error-kind.ts`'s `unauthenticated`/`forbidden`) — a denied face naming the constraint, never a
   generic transport error, never a silent retry — while the rest of the batch keeps running, and a 403
   *after* custody leaves the row honestly "adopted, not filed" with its receipt still readable at mount;
   plus a cell pinning `ComposerAttachmentControl.tsx:58`'s exact `IN_FLIGHT` strings. New
   `lib/documents/kind-label.test.ts` (key set equals `DOCUMENT_KINDS` + null; no raw enum reaches the DOM).
   New `lib/documents/capability-registry.test.ts` (mime→format resolution; an unknown mime and an unseeded
   pair both yield the honest default, never a tier; the registry is read once and never on the poll clock).
   New `components/documents/upload-panel.test.tsx` (Data Table semantics; **the four tiers readable per
   row — a payroll PDF at `extraction_status: done` renders custody + byte extraction from the format and
   Needs-classification for facts/operation until the kind lands, then `payroll_summary`'s published levels;
   `done` alone never renders as facts support**; nine per-code failure phrases; `role="progressbar"`
   values; one live region; focus return after Cancel). Extend `documents-workbench-refresh.test.tsx`
   (receipt rehydration at mount, bounded wire-read count, poll stops on settle). New 40-file mixed queue
   cell for C-73 (exhausted poll settles `error`/`errorPhase:"timeout"`, never success). Every new file →
   `apps/web/test/manifest.txt`.
8. Playwright: **extend** `apps/web/e2e/chat-parity-mock.mjs`'s intake legs into a documents_tab lane (do
   not build a new harness) + `apps/web/e2e/documents-intake-walk.spec.ts`. **Client-tab legs**: five-file
   batch (one `too_large`, one `bad_type`) settling independently; the three controls behaving differently;
   reload restores receipts; status settles without reload; the four tiers on a row; document→Work link and
   the honest "no Work yet"; Needs-classification opens `set_document_kind`; 320 px and 200 % zoom without
   horizontal scroll; keyboard-only completion with focus return; axe clean; stable URL/Back. **Firm-leaf
   legs (AC5's own walk, same spec file)**: `(firm)/documents` lists an unassigned document with its kind
   label and tiers; the ask-once attribution act files it; the row **leaves** the set on the next settled
   read; a second attribution attempt on the same row is refused verbatim and mints no second filing; a
   below-floor persona sees the denial face, not an empty list; loading / successful-empty / unavailable
   faces render; 320 px, keyboard and axe on this route too. If the mock can flip one leg to 401 without
   destabilising chat-parity, add the mid-batch permission-loss leg here as well; otherwise §4.7's cell is
   the seam and you say so. `chat-parity-walk.spec.ts` stays green.

## 5. Risks

1. One transport, three callers — byte progress or the cancel/remove split regresses chat attach and the
   interview card unless each has its own cell. `ComposerAttachmentControl.tsx:58` keys on exact strings.
2. `chat-parity-walk.spec.ts:209` asserts the terminal word `'Filed'` — a rename breaks a **shipped** walk.
3. The bounded poll issues PostgREST reads under the user's JWT. Unbounded, every open tab becomes a hot
   read loop; and a direct view read cannot pin `plan_cache_mode` (`0183:1055-1061`). Bound it hard. The
   capability registry is **not** part of that budget: one static read per mount, never re-polled — and
   never a per-row `get_document_state`, which would put an N+1 on the same hot path.
4. The receipt predicate is a cross-client leak if written as "my uploads" — `document_intakes` has no
   client column. Write the non-vacuity cell first.
5. The tier join leans on one canonicalisation (`intake.mjs:88` → `0007:2012` → the registry's `mime_type`,
   `0191:206`). If a future format reaches the allowlist before the registry, the surface must fall to the
   unknown-pair default — §4.3 is what keeps that honest instead of silently mislabelling a row.
6. Cross-ticket merge: `en.json` kind namespace is consumed by #646 (correction), #638 (`claim_form`) and
   #639 (invoice→asset) — you own the vocabulary; agree the namespace with #646 before landing.
   `lib/navigation/tree.ts` is also edited by #650 and #648; `InterviewRunCard.tsx` by #649 (you land first).
7. **Shared-file one-liners this ticket adds**: `lib/navigation/tree.ts` — one `FIRM_NAV` row `documents`
   at its sorted position (`:206-220`). `messages/en.json` — the `ClientDocuments.kind.*`,
   `ClientDocuments.queueFailure.*`, `ClientDocuments.capability.*` and new column/announcement keys, plus
   one `FirmDocuments` group. `apps/web/test/manifest.txt` — one alphabetical line per new test file.
   `apps/web/e2e/serve-built.mjs` — at most one import + three dispatch lines if a new mock is unavoidable
   (prefer extending chat-parity's). `apps/web/e2e/e2e-fixture-ownership.test.ts` — declare every RPC verb
   your mock answers; verbs another lane also answers are declared **shared** (`document_intakes_visible`,
   `rpc/record_client_resolution`, `rpc/file_document` already sit in the debt list at `:241-245`; add
   `document_capabilities` and `rpc/list_unassigned_documents`).
   `.github/actions/db-live-gates/action.yml` — one new step after the Slice-5 step.
   `apps/web/tests/firm-scope-fourth-entrance.test.ts` — one `COLOCATED_MODULE_ROSTER` entry per colocated
   module. `CONTEXT.md` — two terms.

## 6. Effort and rig

**Effort: L** (SYNTHESIS.md:443). Rig row: worktree `C:\Users\zhant\Desktop\clara-wt\633`, branch
`impl/633-document-intake`, PostgreSQL `127.0.0.1:55502`, database `clara_633`; Playwright triple
**3240 / 3241 / 3242**. Node 22 via the RIG.md PATH line on every call.

Run before the final report, and report counts for: the **whole `apps/web` unit suite**
(`node scripts/run-tests.mjs` from `apps/web`, ~5 min — `firm-scope-surfaces`,
`firm-scope-fourth-entrance`, `parity-holes`, `sql-oracle`, `e2e-fixture-ownership` red on files you never
touched); `packages/db/tests/operation-census.test.mjs` and `rig-isolation.test.mjs` **without** the reset
flags (non-regression evidence — you add no SQL); `node scripts/check-frozen-workflows.mjs` and
`node packages/runtime/scripts/check-parts-parity.mjs` from the worktree root (you work next to the ingest
lane — prove you moved no closure); `pnpm typecheck`, `pnpm lint`; `pnpm --filter @clara/web e2e
documents-intake` and `… e2e chat-parity` with the port triple set. Known Windows reds not to "fix":
#707, #693.

House shapes to copy, by path (all under `docs/plan/active/refresh-wave-2026-09-14/`): `brief-640.md`
(brief shape, decisions-first discipline) and `brief-643.md:5` (ship the non-frozen pieces now, name what a
later cut must wire); `reports/643-final.md` and `reports/640-fixround.md` for the final-report shape;
`reports/640-review-closure.md` for what the reviewer demands — every finding closed by a cell that would go
red, re-measured rather than copied, vacuity controls, honest per-run browser-flake accounting. The
0193/0194 migration ceremony (`packages/db/migrations/0193_accounting_plans.sql`,
`0194_periodic_adjustments.sql`) is the house standard you are **exempt from**: you ship no SQL.

## Verifier findings not applied

None. All four applied — AC3's intake-surface tiers (build + §4.3/§4.7 cells), AC7's in-flight
permission-loss cell, AC5's firm-leaf walk leg, and the `_tf_accounting_work_immutable` citation retargeted
from `0194:192-195` (the prestate sha-pin block) to the frozen array literal `0184:449` + `0194:224`. None
contradicted DECISIONS.md.
