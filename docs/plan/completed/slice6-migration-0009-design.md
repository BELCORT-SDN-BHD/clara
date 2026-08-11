# Slice 6 — migration `0009_coding_floor.sql` design (companion to the contract §3–§7) · v1.3

**Status:** DESIGN RATIFIED (full ladder: dual design review + dual delta re-review
folded — native N-F/D-F + Codex C-/NEW- series; rig probes P1–P7 SUPPORTED; S6-D1/D2
ratified — see the contract §14 and `slice6-delegated-decisions.md`). Same normativity as `slice6-thin-e2e-contract.md`. One
migration, own transaction, runner-applied (deploy-onto-existing CI drill covers it).
House laws binding every section: one audited fn per mutation class; reverse-not-delete;
reserve-first op receipts; no tenant oracle; events through the spine with taxonomy
coverage; RLS + GRANT lane split (ADR-015); `rig.%` excluded from coverage sweeps (AB-7).

---

## §1 Objects overview

New tables: `counterparties`, `coding_tasks`, `entry_evidence`, `coding_attempts`.
Altered: `journal_lines` (+`counterparty_id` w/ composite FK), `journal_entries`
(+`proposed_counterparty jsonb`, +`match_fingerprint jsonb`), `coa_accounts`
(+`account_class`; **account_code CHECK domain widened** — §6), `document_processing_tasks`
(lane CHECK gains `'invoice_facts'`), `document_extractions` (`engine_kind` CHECK gains
`'invoice_facts'`), `document_regions` (locator stays PHYSICAL — semantic meaning lives
in `field_path`; NO new locator_kind [C-7]).

**Signature-change law [C-1 — CRITICAL; rig-proven P1]:** every arity-changed function
follows the 0005 precedent (0005:949-955): **DROP the old signature(s) → CREATE the new
→ REVOKE ALL FROM PUBLIC → re-grant exactly the §9 lanes** — never CREATE OR REPLACE
across arity (rig-proven: it creates a SECOND pg_proc row keeping the old ACL, and an
unqualified call then throws 42725 ambiguous — breaking existing call sites outright).
**P1 caveat (rig-proven): DROP+recreate RESETS the ACL to the PUBLIC-EXECUTE default**
— the REVOKE/re-grant pair in the same migration is MANDATORY for every recreated
function, and the migration tail's PUBLIC-zero-execute sweep is the belt. Applies
to: `_draft_entry_core`, `wake_draft_entry`, `draft_entry`, `upsert_account`. Migration
tail asserts via `pg_proc`: exactly ONE overload per public writer name, and a
PUBLIC-zero-execute sweep over every function this migration touches. All optional args
follow required args. New hashed-request args: `p_proposed_counterparty` (draft core)
and `p_account_class` (upsert_account) BOTH participate in `_reserve_op`'s request hash
[C-1, N-F5].

Replaced (drop/create or same-signature replace as lawful): `approve_entry` (v3, §3),
`approve_wrong_client_correction` (§4), `reverse_entry` (counterparty copy-down, §2),
`file_document` + `confirm_attribution_candidate` (both gain the in-writer
invoice-facts enqueue — §5) [D-F3], `claim_document_processing_task` +
`release_held_document_tasks` (egress hold + concurrency + release cover
`lane in ('ocr','invoice_facts')` [N-F1]), `_tf_entry_immutable` (§2 allow-sets).
New fns: `list_unassigned_documents`, `get_document_extract`, `get_draft_review`,
`list_uncoded_filings`, `revise_entry`, `withdraw_draft`, `open_coding_task`,
`complete_coding_task`, `dismiss_coding_task`, `enqueue_invoice_facts`,
`persist_invoice_facts` (+ failure twin `fail_invoice_facts`), internal ungranted
`_validate_entry_lines`, `_assert_supplier_bill_shape`, `_resolve_counterparty`.
New events (inserted into the ACTIVE taxonomy's coverage set — additive, no repoint;
VERIFY-ON-RIG probe stands [N-F13]): `counterparty.created`, `entry.revised`,
`entry.withdrawn`, `coding_task.opened`, `coding_task.closed`,
`document.invoice_facts_completed`, `document.invoice_facts_failed`.

## §2 Counterparties, evidence, and entry alterations

```sql
create table clara.counterparties (
  id uuid pk default gen_random_uuid(),
  firm_id uuid not null, client_id uuid not null,   -- composite FK to clients(id,firm_id)
  kind text not null default 'vendor' check (kind in ('vendor')),
  name text not null check (btrim(name) <> ''),
  name_normalized text not null,       -- lower + strip ALL non-alphanumeric [N-F6]
  registration_no text null, registration_normalized text null,  -- same normalization
  tin text null,
  created_by uuid not null, created_at/updated_at timestamptz,
  unique (id, firm_id, client_id)                    -- congruence anchor [C-6]
);
unique (client_id, registration_normalized) where registration_normalized is not null;
unique (client_id, name_normalized) where registration_normalized is null;  -- [C-5]
```
**No `merged` state in v1** [C-6] — no merge writer exists; the status column and
`merged_into` are REMOVED from this slice (a merge slice adds them with their writer
and state machine). RLS: firm-scoped SELECT for `clara_authenticated` + `clara_agent_ro`
(`wake_firm()`); ALL writes via definer writers only.

**Identity law [C-5 — registration dominates]:** `_resolve_counterparty(client, proposal)`
— (1) registration_normalized equal → THAT row, always; (2) proposal carries a
registration but a name-equal row carries a DIFFERENT non-null registration →
**CLR23 conflict-refusal, never reuse**; (3) proposal carries NO registration and a
REGISTERED vendor matches the name → **ambiguity refusal** (the candidate is
surfaced; the human decides — a duplicate unidentified vendor is never silently
born beside a registered one) [NEW-3]; (4) name_normalized equal among
registration-null rows → reuse; (5) else birth. Birth wraps `unique_violation` →
re-run once → still unresolved ⇒ CLR23 [N-F4-race]. The propose-time decision
persists as `journal_entries.match_fingerprint` (`{decision, counterparty_id?,
name_normalized, registration_normalized?}`); **approve re-resolves and compares the
FULL canonical fingerprint** — ANY divergence (including existing-A→existing-B)
refuses with CLR23 [NEW-3]. The convergent next act is `revise_entry`, which
re-resolves, persists the fresh fingerprint, and rotates the token — read-only
re-hydration never rebinds reviewed identity [NEW-3].

- `journal_lines.counterparty_id uuid null` + composite FK
  `(counterparty_id, firm_id, client_id) → counterparties(id, firm_id, client_id)`
  — a line structurally cannot cite another client's vendor [C-6].
- `journal_entries.proposed_counterparty jsonb null` (shape-checked; **draft-only is
  writer-procedural, NOT a table CHECK** [D-F4]) and `match_fingerprint jsonb null`.
  `_tf_entry_immutable` allow-set changes [N-F2]: draft→draft gains
  `proposed_counterparty, match_fingerprint, last_human_editor` [C-4]; draft→approved
  AND **draft→withdrawn** [D-F4] gain `proposed_counterparty, match_fingerprint`
  (cleared) — a vendor-carrying draft is always withdrawable.
- `coa_accounts.account_class text null check (account_class in ('payable'))`;
  `upsert_account` (drop/create per §1) gains `p_account_class` (hashed).
- **`entry_evidence`** [C-9]: `(id, entry_id FK, firm_id, client_id, document_id,
  extraction_id FK, region_id FK nullable, field_path, quote text, fact_hash,
  provenance_tier 'verified'|'model_read')` — written in the SAME transaction as the
  draft by `_draft_entry_core` from the write-tool's evidence array; the writer
  VERIFIES each cited region belongs to the cited extraction and document. This is
  what makes Tier-B citations recoverable and Tier-A binding checkable at approve.
- **One-open-draft law is FILING-keyed [C-15; rig-proven P6]:** partial unique
  `journal_entries(filing_id) where status='draft' and filing_id is not null`
  (immediate 23505 on the concurrent second draft; a different filing of the same
  document succeeds) — two clients' lawful filings of one shared document each get
  their own coding; the correction destination is never blocked by the reversed
  original. **Migration pre-flight: assert no existing filing already carries two
  open drafts before creating the index** (deploy-onto-existing safety).

**The supplier-bill floor [C-3 — structural, not writer-discipline]:**
`_assert_supplier_bill_shape(entry_id)` (ungranted): keyed on the entry's own
immutable **`journal_entries.coding_kind='supplier_bill'`** marker — stamped by
`_draft_entry_core` from the governed write-tool wrapper, NEVER derived from
`documents.document_kind` [NEW-2: document_kind is stamped by the facts pass, whose
absence IS Tier B — keying on it would exempt exactly the Tier-B bills; the marker
must exist independently of facts completion] — **and `reversal_of IS NULL`** [D-F6:
reversal/correction mirrors lawfully invert the payable leg to a debit] — at least
one payable-class CREDIT line;
payable credit total == the supported gross (the Tier-A equation, §5) when a verified
total exists; EVERY payable-class line (any entry, any path) carries `counterparty_id`.
Enforced at EVERY transition to approved by a **deferred constraint trigger** on
`journal_entries` (status flip) PLUS early writer-body calls for friendly CLR23s —
covering `approve_entry`, `reverse_entry`'s direct low-stakes mirror approval, and the
correction's direct mirror approval. `reverse_entry` and
`approve_wrong_client_correction` are RECREATED to copy `counterparty_id` onto mirror
lines [C-3]. Non-invoice drafts (plain memo drafts) are exempt from the bill-shape
clause but never from the payable-line-needs-vendor clause.

## §3 `approve_entry` v3 — the 0007 lock order RESTORED [C-2]

Same signature. Body order: (1) `_human_ctx(bookkeeper)`; UNLOCKED identity read;
(2) **active-filing lock/re-affirmation FIRST** (`_active_document_filing(..., lock)`,
CLR02) — the as-built 0007:1289-1299 order; (3) entry `FOR UPDATE`; `status='draft'`
else CLR10; **token check** (CLR06); (4) adopted-reversal / reversal-ORIGINAL lock
(0007 order preserved: originals before slots); (5) vendor resolution per §2 (CLR23
paths) + fingerprint congruence; (6) stamp `counterparty_id` on payable lines while
draft (mid-txn rotation harmless — validated by review [C-2]); (7)
`_assert_supplier_bill_shape` + **evidence re-verification [C-8]: re-read the
document's completed invoice-facts state IN-TXN; if a verified Tier-A total now exists
and contradicts the entry's evidence `fact_hash`/amounts ⇒ CLR25 stale-evidence
refusal** — a Tier-B approval can never silently override newer machine facts; (8)
maker/checker gate (CLR05/solo-attest); (9) flip draft→approved clearing
`proposed_counterparty`/`match_fingerprint`; events/audit/receipt unchanged.
**Facts↔approval serialization protocol [NEW-1; lock strength per rig probe P2]:** the
ACTIVE FILING row is the single serialization point. Rig-proven nuance: the as-built
`_active_document_filing(..., lock)` takes **FOR SHARE** (approve/draft deliberately
don't contend with each other), so `persist_invoice_facts` must take **FOR UPDATE**
on the document's active filings (UUID order) — FOR UPDATE conflicts with FOR SHARE,
which is exactly the approve↔persist serialization we need, while approve↔approve
stays uncontended (their entry FOR UPDATE serializes those). Then persist locks the
affected open entries (id order), writes the facts extraction, and rotates their
`revision_token` (the lawful rotation form per rig probe P7: an explicit
`SET revision_token = gen_random_uuid(), updated_at = now()` on draft rows — both
columns in the draft→draft allow-set; nothing else touched). Approve's evidence re-read therefore happens
under the filing lock: whichever transaction wins the filing lock, the loser observes
its committed effect (facts-first ⇒ approve sees CLR25 or the rotated token;
approve-first ⇒ persist rotates nothing open and future drafts read the new facts).
Rig both winning orders + the correction interaction with lock snapshots and a hard
deadlock timeout. The bill-shape constraint trigger is **WHEN-scoped to
approved-transitions only** [D-I1] so the rotation UPDATE never fires it.

## §4 `coding_tasks` [C-14]

`(id, firm_id, client_id, document_id, filing_id, origin 'correction'|'manual',
correction_id unique-when-not-null, status 'open'→'done'|'dismissed', opened_by,
closed_by, closed_reason, result_entry_id, timestamps)` — composite FKs: (client_id,
firm_id) → clients; (document_id, firm_id) → documents; filing_id → document_filings;
result_entry FK composite (id, firm_id, client_id). **v1 matrix: open→done|dismissed
only** (no `in_progress` — no start writer exists; reachability over states) [C-14].
`complete_coding_task` PROVES the result entry: same client + bound to the task's (or
its correction-destination's) ACTIVE filing + status approved-unreversed, else CLR24.
`dismiss` requires reason. RLS firm-scoped; masked view; writers `clara_authenticated`
bookkeeper+, op-keyed. Correction insertion point [C-14]: INSIDE
`approve_wrong_client_correction` after filing retire/ensure + retention recompute
(locks held), BEFORE the audit/event tail; `coding_task.opened` joins the event tail;
the `document_recode_required` notification payload AND the correction receipt carry
`coding_task_id`. VERIFY-ON-RIG: correction vs concurrent file/approve schedules
with the new FKs/indexes in place.

## §5 The invoice-facts lane (engine-honest, metered, race-closed)

- **Own extraction row [C-7]:** a completed invoice-facts task inserts a NEW
  `document_extractions` row (`engine_kind='invoice_facts'` — CHECK extended;
  `engine_id='azure-di:prebuilt-invoice:2024-11-30'`; own version_n). Regions FK to
  THAT row, keep PHYSICAL locators (`page_polygon` as returned) with semantic meaning
  in `field_path` (`invoice.total`, `invoice.currency`, `invoice.vendor_name`,
  `invoice.invoice_id`, `invoice.invoice_date`, `invoice.amount_due`,
  `invoice.deposit`…), `monetary_raw`/`monetary_cents` populated by deterministic SQL
  normalization. NO 'semantic' locator_kind. Reads always select an EXPLICIT completed
  (engine_kind, version) — never an implicit "current".
- **Enqueue at filing** (in-writer: `file_document`, candidate-confirm filing,
  correction re-file; pdf/image only; skip if completed facts exist) + the
  coding-time backstop `enqueue_invoice_facts` (`clara_runtime`). Structural
  idempotency: partial unique `(document_id, lane) where status in
  ('queued','held_egress','running')`, insert on-conflict-nothing [N-F10].
- **Egress + caps:** claim fn + release fn cover `lane in ('ocr','invoice_facts')`
  [N-F1]; the OCR concurrency cap counts both lanes.
- **Metering [C-10, carrier fixed per NEW-4]:** the live
  `document_ingest_reservations` cannot carry a second pass (unique non-null
  intake_id, docs_reserved=1 hard-coded) — 0009 adds
  **`processing_call_reservations`** keyed UNIQUELY to the invoice-facts task:
  pages-only (`docs_reserved=0` semantics — the document was already counted once),
  reserved under the SAME per-firm advisory lock with the AB-6 arithmetic
  (settled_pages for settled rows + pages_reserved for unsettled, both carriers
  summed) → settle at actual on success; refund on failure; every limit path CLR18.
  **Filing NEVER blocks on enrichment budget** — an unaffordable facts task lands
  `failed('budget')` honestly and coding proceeds Tier B. `fail_invoice_facts` is the
  failure terminal writer (task→failed + refund + `document.invoice_facts_failed`);
  the reconciler's stranded-run sweep covers the new lane; **per-document vendor-call
  cap (3 attempts) → terminal failed** — Tier B remains the honest permanent
  fallback. Arithmetic VERIFY-ON-RIG.
- **Status honesty [C-10]:** invoice-facts tasks do NOT touch
  `documents.extraction_status` (that reflects the PRIMARY layout lane only); the
  facts state is read from the extraction row itself.
- **Workflow home [C-13]:** a NEW registered frozen class **`invoiceFacts_v1`** (own
  closure, AB-16 pattern; registry entry; every enqueue site resolves through the
  registry; freeze-lint fixtures added). `documentIngest` v1 files stay byte-identical.

## §6 Chart-of-accounts domain [C-16 — RPR cannot load today]

As-built CHECK: `account_code ~ '^[0-9]{4,8}$'` + five account types (0003:47-56).
RPR uses `100-000` / `900-A01` style codes. 0009 widens the domain DELIBERATELY:
`account_code ~ '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$'` (existing data passes;
tests enumerate EVERY reviewed RPR code + hostile inputs). Display codes preserved
exactly — no renumbering. The reviewed CSV carries an explicit
`classification → account_type` mapping column (`expense_cogs→expense`, etc.).
Deploy-onto-existing drill + FK/context-pack/coverage suites re-run post-widening.

## §7 Read fns (`security invoker`, RLS-scoped; client-pinned per [C-11])

- `list_unassigned_documents(p_limit)` — the anti-join; granted
  `clara_authenticated, clara_agent_ro`. The v2 wrapper mints its read credential
  **OBO the task's `created_by`** (the v2 task loader returns it) so the bookkeeper+
  floor + live revalidation bind [C-11]; a below-floor author gets an honest refusal.
- `get_document_extract(p_document, p_client, p_max_chars)` — client-pinned: assigned
  docs resolve only for a matching active filing; unassigned resolve firm-wide;
  the filing projection returns ONLY the requested client's filing + an
  `unassigned` flag (never the other clients of a shared doc); ONE aggregate char
  budget across envelope + regions [C-11].
- `get_draft_review(p_entry, p_client)` — client-pinned for the agent grant (the
  session's client must equal the entry's client, else not-found); the HUMAN lane may
  call with its broader RLS. Returns entry+lines+vendor resolution preview (fingerprint
  + current outcome), evidence rows (tier, quotes, region ids), eligible-checker count.
- `list_uncoded_filings(p_client default null)` [C-15] — ACTIVE filings with no
  draft AND no unreversed approved entry bound to THAT filing; optional client filter.
  (Replaces `list_uncoded_documents`; the correction destination appears, the
  reversed-original's retired filing does not.)
- v2 client-scoped tools call NEW client-pinned read fns (`get_journal_entry_for` /
  `list_journal_entries` already client-keyed); the bare `get_journal_entry(uuid)`
  LOSES its `clara_agent_ro` grant (human grant unchanged) — closes the same-firm
  entry oracle [C-11].
- **Agent-lane refusal, never silent empty [D-F1 + NEW-5]:** each of the four new
  read fns raises CLR03 when `current_role = 'clara_agent_ro'` and `clara.wake_firm()`
  is null; AND the v2 wrapper mints the OBO credential **lazily inside the tool
  boundary** (never at segment setup — the live mint rejects a below-bookkeeper OBO
  with CLR10 and an uncaught setup-time mint would fail the whole segment). The
  wrapper catches CLR10/CLR03 and returns ONE typed refusal part, identical
  regardless of document existence/count (no oracle), no raw SQL text exposed.
  Rig viewer/bookkeeper/demoted/removed/null-client for identical refusal shape.
  Human-lane callers are unaffected (`_human_ctx` path).

## §8 Draft lifecycle writers

- `revise_entry(p_entry, p_lines, p_proposed_counterparty, p_evidence, p_expected_revision,
  p_op_key)` — ALL required-before-optional [C-1]; bookkeeper+; draft-only (CLR22);
  token check (CLR06); `_validate_entry_lines` (shared with `_draft_entry_core`,
  INCLUDING the rounding auto-append [N-F8]); replaces lines + evidence;
  **stamps `last_human_editor = actor` in the same statement** [C-4 — an edited agent
  draft is thereafter the editor's work, so the high-stakes self-approval gate binds];
  returns the new token.
- `withdraw_draft(p_entry, p_reason, p_expected_revision, p_op_key)` — as v1.1;
  CLR22/CLR06.

## §9 Grants delta (complete; the review checks nothing else moved)

`clara_authenticated`: + `revise_entry, withdraw_draft, open/complete/dismiss_coding_task,
list_unassigned_documents, get_document_extract, get_draft_review, list_uncoded_filings`
+ SELECT `counterparties`, `coding_tasks` masked view, `entry_evidence` (own-firm RLS).
`clara_agent_ro`: + the four read fns (client-pinned variants) + SELECT
`counterparties`, `entry_evidence`; **− `get_journal_entry(uuid)`** [C-11].
`clara_runtime`: + `enqueue_invoice_facts, persist_invoice_facts, fail_invoice_facts`.
`clara_wake_interactive`: the recreated `wake_draft_entry` (drop/create) is re-granted
here — the allowlist is NAME-keyed so its existing row needs no change [D-F8]; the
coding attempt rides INSIDE the core [NEW-6], so no new wake grant and no new
allowlist row exist.
NOT granted: `_validate_entry_lines`, `_assert_supplier_bill_shape`,
`_resolve_counterparty`. Migration tail: PUBLIC-zero-execute + single-overload asserts.

## §10 Runtime deltas outside the migration

1. `pools.mjs`: login `clara_wake_write_login` created **NOLOGIN** in-migration (the
   0006 pattern), LOGIN+password enabled at the operator ceremony [C-18];
   `CLARA_WRITE_DATABASE_URL` joins the production fail-closed boot assertions; small
   pool max (2) inside the connection budget; pool joins teardown/health;
   `withWriteWakeScoped` = mint OBO `task.created_by` per attempt → BEGIN →
   parameterised txn-local secret → SET ROLE clara_wake_interactive → write → COMMIT;
   shared cleanup ROLLBACK/RESET; connection/cleanup errors destroy (precise P4).
2. `chatTurn.v2.*` closure: v2 task loader returns `created_by`; op_key =
   `code-doc:<task_id>:<document_id>` [C-12]; **the coding attempt is written BY THE
   CORE [NEW-6, supersedes D-F5's separate writer]:** the recreated
   `wake_draft_entry`/`_draft_entry_core` signatures carry `p_coding jsonb`
   ({task_id, part_payload}) — hash-covered — and the core inserts the
   `coding_attempts` row (composite tenant FKs; **unique (task_id, filing_id); unique
   (entry_id)**) in the SAME transaction as the draft: one call, one atomic unit, a
   structural one-attempt proof; no separate writer, no extra allowlist row —
   every step attempt RECOVERS a completed attempt before any model call and
   synthesizes the canonical card [C-12]; **part promotion law [C-19]:** a successful
   `draft_journal_entry` tool result yields its `tool_result` PLUS exactly one keyed
   top-level `je_review(entry_id)` part, deduped on replay in `toTypedParts_v2`; the
   live UI intentionally renders the card only from the authoritative terminal
   message; **coding-intent terminal invariant:** card, typed clarify, or typed
   refusal — never silent completion at the 8-step segment cap.
3. `invoiceFacts_v1` workflow class + registry entry + freeze fixtures [C-13].
4. Dashboard: je_review card + persisted-branch parity/reachability test;
   uncoded-filings + coding-tasks sections; perception copy supersedes DELTA-OWNER-2.
5. `.env.example`/README: `CLARA_WRITE_DATABASE_URL`; egress-flip note.
6. Ops: `onboard_rpr` — discovers/reuses existing firm/client (create only when
   absent; `create_firm` has NO op-receipt — never assume idempotent create [C-17]);
   plan-manifest + checksum + `--dry-run`; every receipt verified; the additive AP
   account + rounding account are LABELED augmentations requiring explicit owner
   sign-off (owner question at delta ratification); no FY/retention claims in S6.

## §11 Test battery expectations (delta probes are REQUIRED, not advisory)

The Codex delta-probe list binds VERBATIM [NEW-8 — the qualifiers are load-bearing]:
(1) **VERIFY-ON-RIG** exact 0009 DDL compile on fresh AND 0001→0008 databases;
`pg_proc` overload/ACL dump; PUBLIC zero-execute sweep. (2) **VERIFY-ON-RIG** forced
approval/correction/revise/reversal schedules with lock snapshots **and a hard
deadlock timeout** (the C-2 AB-BA case + the NEW-1 protocol, both winning orders).
(3) **VERIFY-ON-RIG** payable-floor behavior on `approve_entry`, low-stakes
`reverse_entry`, high-stakes reversal approval, pending-mirror adoption, and
wrong-client correction, incl. zero-payable drafts. (4) **VERIFY-ON-RIG**
facts-completion/approval race **including mismatching late facts** and transaction
abort after line stamping. (5) **VERIFY-ON-RIG** correction task insertion **with the
exact FK/index DDL in place** against concurrent file/approve, **asserting the 0007
lock order and the event tail remain intact**. (6) taxonomy additive insert —
**rig-proven (P5): event_type + trigger_taxonomy rows are a COUPLED pair into the
ACTIVE version (which is v2)**; coverage stays whole, routing untouched.
**Build-lane rig gotcha (rig-proven):** the entry balance/provenance triggers are
DEFERRABLE INITIALLY DEFERRED — on an autocommit connection a bare entry INSERT
fails CLR07 before its lines exist; entry+lines are always ONE explicit transaction
in tests. Probes P1–P7 evidence: `.tmp/s6-probe-report.md` (archived with the
review evidence). Plus v1.1's battery (birth races incl. same-name/different-reg,
filing-keyed uniqueness incl. shared-doc A+B and correction A→B, invoice-facts
metering OFF/limit/miss/refund/settle-once/dual-lane, currency refusals, read-fn
isolation A/B + null-client + demotion + not-found-shape equality, evidence
region↔extraction congruence, replay: commit→ACK-loss / divergent model output /
same turn_key two sessions).
