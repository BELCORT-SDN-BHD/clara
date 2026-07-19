# Slice-6 Grounding Brief — LANE 2: DB write path + approval law

Ground truth for the coding flow (one supplier bill → one balanced draft → je_review card →
human approve with exact-revision token). Citations are `file:line`. "GAP" = Slice 6 must add it;
"CONSTRAINT" = as-built law the design must obey.

Files: `packages/db/migrations/0003_books_core.sql`, `0004_governed_fns.sql`, `0005_event_spine.sql`,
`0006_runtime_core.sql`, `0007_document_pipeline.sql`; `docs/PROJECTLOG.md` ADR-015 (line 70).

---

## (a) draft / _core / approve signatures + revision-token mechanics

**Live `_draft_entry_core`** (replaced by 0007) — `0007:1180-1276`. Signature (15 args, ungranted internal):
```
_draft_entry_core(p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text, p_is_human boolean,
  p_client uuid, p_resolution uuid, p_posting_date date, p_memo text, p_lines jsonb,
  p_document uuid, p_sha256 text, p_flags jsonb, p_op_key text, p_books_version bigint)
```
Guard order (`0007:1191-1272`): op_key required (CLR10) → reserve/dedupe → client-in-firm (CLR11) →
archived-client hard block (`1201`, CLR10) → **agent lane only** `assert_books_current` freshness
gate (`1204`, CLR12) → doc/sha both-or-neither → if doc: `_active_document_filing` lock (`1211`) →
`assert_client_resolved` (`1215`) → memo-required for non-doc → line sum/count (≥2 lines) →
COA-account existence → **rounding law** (0 fine; 1–5c auto-append rounding leg; >5c ⇒ CLR07,
`1237-1244`) → insert entry (status `'draft'`, stamps `filing_id`) + lines → `_assert_balanced`
(synchronous CLR07) → audit → emit `entry.drafted` event → agent-lane post-seq freshness recheck
(`1272`). Receipt: `{entry_id, revision_token, status:'draft', filing_id}` (`1273`).

**Human `draft_entry`** (live = `0005:1080-1088`, NOT redefined in 0007). Bookkeeper+ only:
```
draft_entry(p_client, p_resolution, p_posting_date, p_memo, p_lines,
  p_document default null, p_sha256 default null, p_flags default '{}', p_op_key default null)
```
Calls core with `p_is_human=true`, `p_books_version=null` (humans skip the freshness gate).

**Wake `wake_draft_entry`** (live = `0005:1094-1108`). Adds trailing `p_books_version bigint default null`;
RAISES CLR10 if null (`0005:1103`). Actor is always the global agent user; `p_is_human=false`.

**`approve_entry`** (replaced by 0007) — `0007:1278-1335`. Bookkeeper+ human ONLY; **no wake variant
exists** (ADR-015, `PROJECTLOG:70-72`: agent-never-signs is the *absence of an entry point*). Signature:
```
approve_entry(p_entry uuid, p_expected_revision uuid, p_attestation text default null, p_op_key text default null)
```
Revision-token binding: reads entry, must be `status='draft'` else CLR10 (`1298`); **`e.revision_token
<> p_expected_revision ⇒ CLR06` "stale revision token"** (`1299`). If doc-bound, re-affirms the active
filing and that `filing_id` still matches (`1292-1294`, CLR02). High-stakes maker=checker gate: needs a
distinct checker if ≥2 eligible (CLR05), else a solo attestation (`1305-1311`). Sets
`status='approved', checker_actor, approved_at` (`1318`); emits `entry.approved`.

**Revision-token minting / rotation** (`0003`): `journal_entries.revision_token uuid not null default
gen_random_uuid()` (`0003:119`). Trigger `_tf_rotate_token` (`0003:334-347`, `after insert/update/delete on
journal_lines`) rotates the token to a fresh uuid **whenever a DRAFT entry's lines change** (no-op on
approved parents; a line MOVE rotates BOTH touched draft parents). So: any edit to a draft's lines ⇒ the
previously-read token is stale ⇒ a later `approve_entry` with the old token fails CLR06. **This IS the
exact-revision mechanic** the je_review card must carry: read `revision_token` at render, pass it to
`approve_entry`; any intervening edit invalidates the approval.

**revise / discard:** there is **no `revise_entry` writer** — a draft is edited by DML on its lines
(runtime/definer lane), which the rotate-token trigger tracks. See (e) for discard.

---

## (b) Counterparty / vendor model — DOES NOT EXIST (hard GAP for S6-R8)

**There is NO vendor/counterparty/supplier/subledger/contact table anywhere** (grep of all migrations
returns none). The only account structure is the client-scoped chart of accounts `coa_accounts`
(`0003:47-59`), PK `(client_id, account_code)`. `journal_lines` (`0003:137-151`) has **no counterparty
column** — a line is `(account_code, debit_cents, credit_cents, description)` only. `journal_entries`
(`0003:101-128`) has **no counterparty/vendor field**.

- **Intrinsic same-txn subledger law: NOT BUILT.** `preview_wrong_client_correction` literally returns
  `'subledger_model','not_built'` (`0007:2462`).
- **"pending counterparty carried by a draft" shape: does not exist.** No column, no side table, no
  staging row. A draft is entry+lines against existing COA accounts only.
- **How a counterparty is created today: it isn't.** The nearest analog is `upsert_account` (`0004:367-398`,
  bookkeeper+ human lane) creating a COA account — but that is a GL account, not a counterparty entity.

**S6-R8 ("approval births entry+vendor in one act") is a net-new capability.** Nothing in the write path
today can create a counterparty at all, let alone atomically with the entry. The design must introduce
the counterparty table + writer AND decide how a draft carries a "pending vendor" through to
`approve_entry`. Note the hard constraint: `approve_entry`'s `_tf_entry_immutable` (`0007:1021-1056`) only
permits the exact draft→approved column allow-set (`status, checker_actor, approved_at,
self_approval_attestation, updated_at`) — so any vendor-birth must happen in the writer body around the
entry update, not by widening the entry row's allowed transition columns, and journal_lines are frozen at
approval (`0007:1058-1075`).

---

## (c) GRANT matrix — which lane can lawfully host the coding-flow draft write

Lane split is by GRANT, not runtime detection (ADR-015, `PROJECTLOG:70-72`). Roles: `clara_authenticated`
(human), `clara_agent_ro` (read-only agent), `clara_wake_interactive` / `clara_wake_proactive` (wake
credential lanes), `clara_runtime` (runtime group), `clara_runtime_login` (the non-inheriting login shell).

- `draft_entry(...)` (human) → **`clara_authenticated` only** (`0004:776`).
- `wake_draft_entry(...,bigint)` → **`clara_wake_interactive` only** (`0005:1143-1145`).
- `approve_entry(...)` → **`clara_authenticated` only** (`0004:777`). No wake grant — structural.
- `clara_agent_ro` and `clara_runtime` hold **zero EXECUTE on any books writer**; the read-only agent
  role has SELECT only (`0003:522-525`). Books tables have **zero write grants to any app role**
  (`0004` header; only the definer owner writes).

**Which lane hosts the coding-flow draft today:** the agent authoring a draft must go through
**`wake_draft_entry` on the `clara_wake_interactive` lane** (a minted interactive wake credential,
`mint_wake_credential` `0004:687-704`, `clara_runtime` only), supplying `p_books_version`. There is **no
runtime-direct or chat-direct book-write path** — the runtime login (`clara_runtime`) cannot call any
draft writer, and chat/`chatTurn` is read-only per ADR-017(1) (`PROJECTLOG:78-79`), amended by ADR-018(3)
to a capture-only door with **perception deferred to Slice 6** (`PROJECTLOG:83`). So the coding flow's
write must acquire an interactive wake credential and call `wake_draft_entry`; the **draft alone is the
agent's authority ceiling** — approval is human-only forever (MEDIUM-18 note, `0004:610-616`; ADR-015).
Approval (`approve_entry`) rides the human `clara_authenticated` PostgREST lane, exactly as the je_review
card's human-approve action must.

---

## (d) agent_tasks (0006) — shape, lifecycle, masked view; suitability as AB-9 carrier

Table `agent_tasks` (`0006:138-166`). Columns: `id, firm_id, client_id, kind('chat_turn'|'wake'),
origin_intent_id, session_id, turn_key, workflow_run_id, model_snapshot, status, created_by, trace_id,
error_code, cancelled_by, cancelled_at, created_at, updated_at`. **`kind` is a 2-value CHECK
(`chat_turn`,`wake`) — there is no `coding`/`recode` kind** (`0006:142`). firm/client are DERIVED +
stamped by `_tf_agent_task_insert` (`0006:391-432`); caller values overwritten.

Lifecycle / transition matrix `_tf_agent_task_update` (`0006:444-480`, CLR13 off-matrix):
- chat_turn: `queued→running|cancel_requested|cancelled`; `running→awaiting_input|cancel_requested|
  completed|failed`; `awaiting_input→running|cancel_requested|expired|cancelled`;
  `cancel_requested→completed|failed|cancelled`.
- wake: `held→cancelled` only.
Identity/config columns immutable post-insert (`0006:451-462`). One-live-turn unique index per session
(`0006:165-166`).

Masked human view `agent_tasks_visible` (`0006:684-694`): humans hold **zero grant on the base table**
(`0006:780`); the view exposes `id, kind, status, client_id, error_code, timestamps, cancelled_*` and
reveals `session_id`/`created_by` only for firm-visible or own sessions; **`trace_id` never exposed**.
Grants: `clara_runtime` writes the base; `clara_authenticated` reads only the view (`0006:779-781`).

**Suitability as the AB-9 durable recode-task carrier / coding-task rows:** as-built, `agent_tasks`
**cannot yet carry a coding/recode task** — its `kind` CHECK admits only `chat_turn`/`wake`, its inserts
require a `session_id` (chat) or `origin_intent_id` (wake) parent, and there is no payload column for a
correction/document reference. The AB-9 stopgap therefore does NOT use agent_tasks: it emits a durable
**`notifications` row** `kind='document_recode_required'` with payload `{correction_id, document_id,
to_client, work_kind:'recode_document', status:'pending', carrier:'slice6-coding-floor'}`
(`0007:2621-2628`). ADR-018(AB-9) explicitly says "Slice 6 replaces this stopgap with the coding-floor
task while preserving this correction linkage." So Slice 6 must either extend `agent_tasks` (new `kind`
+ payload/immutability-matrix rows) or define a new coding-task carrier, and adopt the pending
`document_recode_required` notification as its inbound signal.

---

## (e) Journal statuses incl. withdrawn; what "discard a draft" means as-built

Status domain (0007) = **`('draft','approved','withdrawn')`** (`0007:1012-1014`; was `('draft','approved')`
`0003:105`). `withdrawn` is a frozen evidence state: **`draft→withdrawn` only**, requiring
`withdrawn_by, withdrawn_at, withdrawal_reason` (CHECK `0007:1015-1019`; transition allow-set in
`_tf_entry_immutable` `0007:1035-1040`). Withdrawn lines are frozen exactly like approved
(`_tf_lines_immutable` `0007:1058-1075`). Withdrawn entries are excluded from book-effect reads but kept
in history (ADR-018(8), `PROJECTLOG:83`).

**There is NO standalone audited discard/withdraw writer.** The `draft→withdrawn` transition is reachable
ONLY inside `approve_wrong_client_correction` (`0007:2580-2605`, sets `withdrawal_reason=
'superseded-by-correction'` for superseded reversal mirrors / drafts of a corrected filing). A generic
"discard this draft" act does **not exist**: `reverse_entry` only operates on `approved` entries
(`0004:571`); entries are never deleted (`_tf_entry_immutable` DELETE ⇒ CLR08, `0007:1025-1026`). An
abandoned draft simply stays `draft` (its stale token makes it un-approvable after edits). **GAP if the
coding flow needs to discard a rejected draft** — Slice 6 must add an audited `draft→withdrawn` (or
equivalent) writer, since none is reachable outside the correction path.

---

## (f) Provenance args the coding flow must supply

A doc-bound draft (`p_document is not null`) triggers **filing-bound, two-layer provenance** (ADR-018(5),
`PROJECTLOG:83`):

1. `_draft_entry_core` requires `p_document` **and** `p_sha256` both set or both null (`0007:1206-1208`,
   CLR10). With a document it calls **`_active_document_filing(p_document, p_sha256, p_client, true)`**
   (`0007:982-1009`, `0007:1211`) which demands an **ACTIVE filing** (document→client, not retired) **AND
   `bytes_verified_at` set** — the citability law; else CLR02 "active verified filing provenance not
   established". It returns and stamps `filing_id` onto the entry (`0007:1247-1249`).
2. `assert_client_resolved(p_client, p_resolution, p_document)` (`0004:91-101`) still requires a
   **human/rule resolution ≥0.95** about this document (CLR01). Callers must pass a valid `p_resolution`.
3. `approve_entry` **re-affirms** the active filing + `filing_id` congruence at approval (`0007:1292-1294`).
4. Belt: deferrable `_tf_check_provenance` validates congruence against the BOUND filing even if retired
   (`0007:963-976`).

So the coding flow (supplier bill → draft) must supply, per doc-bound draft: **`p_client`,
`p_resolution` (an authoritative ≥0.95 document-subject resolution for that client), `p_posting_date`,
`p_lines`, `p_document`, `p_sha256` (must match the verified filing's bytes), `p_op_key`**, and on the
wake lane a fresh **`p_books_version`** token. There must already exist an **ACTIVE, bytes-verified
`document_filings` row** for (document, client) — created via `finalize_document_intake` /
`upgrade_legacy_document` / `file_document` / `record_rule_resolution` (`0007` §7-9). A supplier bill that
is still unassigned (zero active filings) **cannot be drafted against** until a filing is established
(the unassigned lane is the anti-join `0007:1108-1111`). A non-doc draft instead needs a non-empty
`p_memo` as its basis (`0007:1219-1221`).

**Net for the coding flow:** the write itself is fully supported by the existing `wake_draft_entry` →
`_draft_entry_core` path **provided** (i) an active bytes-verified filing already binds the bill to the
client and (ii) an authoritative resolution exists. The NEW work concentrates in (b) counterparty/vendor
birth (nothing exists) and (e) draft discard, plus (d) the coding-task carrier.
