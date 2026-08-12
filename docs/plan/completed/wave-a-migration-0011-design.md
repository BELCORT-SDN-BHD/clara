# Wave A — migration 0011 design companion (`0011_daily_loop.sql`)

*Status: **v1.1 (dual-review fold, owner-ratified)** · 2026-07-21 · companion to
`wave-a-daily-loop-contract.md` v1.1. One migration, never split. C-1 law on every
arity-changed function (DROP → CREATE → REVOKE ALL FROM PUBLIC → re-grant, same migration,
tail asserts); **exact old/new signatures + complete caller lists are published in the build
interface-pins file before any lane starts** (Codex 23 — no signature is left implicit).
Body-only changes at identical arity use CREATE OR REPLACE. AB-7 null-variant law and AB-20
`array_append` law apply to every new input/append.*

## §1 AB-3 pin (FIRST statement block)

`clara.record_rule_resolution`: pin the extraction read to
`engine_kind in ('ocr','structured_parse')` — body-only, CREATE OR REPLACE. Tail asserts:
(a) a planted `invoice_facts` extraction with a colliding `field_path` is NOT visible;
(b) the **login-direct EXECUTE grant to `clara_runtime_login` is preserved** (it is
load-bearing for the matcher's lane-1 role dance; assert it so a later refactor cannot
strand lane-1).

## §2 Counterparty aliases + identity-equivalence merge (WA-D3)

- **`clara.counterparty_aliases`**: (id, firm_id, client_id, counterparty_id composite
  tenant FK, alias_normalized [the house normalizer], alias_display, origin ∈ {former_name,
  trade_name, human}, created_by/at, retired_at). Partial unique (client_id,
  alias_normalized) where unretired. Aliases are NAME-LANE CANDIDATE inputs only:
  `_resolve_counterparty` consults unretired aliases under the SAME registration-dominant
  law — an alias hit against a differing-registration vendor is the existing
  conflict/ambiguity refusal. Alias hits surface as `alias_match` in
  `get_draft_review.current_outcome`.
- **Alias writers exist** (Codex 21 — v1.0 named none): `add_counterparty_alias` /
  `retire_counterparty_alias` (human lane, bookkeeper+, op_key-idempotent). Collision rules:
  normalized duplicate of a live alias OR of any counterparty's canonical `name_normalized`
  in the client → typed CLR23 refusal (never silent precedence). `rename_counterparty`
  updates display name only (audited); normalized identity history is carried by aliases
  (rename auto-creates a former-name alias, on-conflict-do-nothing — probe P5 precision: the
  collision hazard is the auto-alias INSERT, not a re-key).
- **`merge_counterparties(p_client, p_survivor, p_merged, p_reason, p_op_key)`** — human
  lane (bookkeeper+), audited, ONE transaction, **identity-equivalence semantics**:
  sets `counterparties.merged_into = survivor` (immutable once set; new column, nullable,
  self-FK) + `retired_at` on the merged row; auto-creates the former-name alias
  (on-conflict-do-nothing); **rewrites NO posted history** — `journal_lines`,
  `rule_sightings`, and signed `coding_rules` rows are never UPDATEd (posted-line
  immutability + governed-history law). Live-rule handling: the merged vendor's live rule is
  RETIRED (reason `merged`); if the survivor has no live rule, a fresh rule referencing the
  survivor is REISSUED as `proposed` (re-signing is a human act — content changed identity).
  Refusals: cross-client; survivor==merged; survivor retired/merged; **differing non-null
  registrations ALWAYS refuse (no override — WA-D3)**; an OPEN draft citing the merged
  vendor refuses (CLR23; resolve first); repeat merge → idempotent via op_key, a
  different-args repeat refuses.
- **Canonicalized reads**: `_resolve_counterparty`, `_open_question_blocks`, near-dup and
  duplicate-bill checks, and the sighting threshold computation all resolve
  `merged_into` chains to the survivor (bounded depth; a chain is compressed on write).
  Approve's fingerprint law is untouched: a merge between propose and approve diverges the
  re-resolution → existing CLR23 + revise convergence (rig case).
- `_resolve_counterparty` arity changes → C-1.

## §3 The lane function (DEFINER — probes P1/P8)

**`clara.coding_lane(p_client, p_filing)`** and **`clara.list_coding_lanes(p_client)`** are
**firm-scoped SECURITY DEFINER** reads owned by `clara_fn_owner` (non-BYPASSRLS), granted
`clara_authenticated` + `clara_agent_ro`: human lane scoped by `jwt_firm()`; agent lane
requires `wake_firm()` non-null (CLR03) AND **client-pinning** — `p_client` must equal the
wake credential's bound client or the single not-found shape returns (the C-11 floor; a
same-firm cross-client call is indistinguishable from absent). Internal calls to
`_resolve_counterparty` / `_invoice_fact_state` / `is_high_stakes` are lawful (definer);
the helpers stay ungranted (the P1 cross-firm oracle stays sealed). Returns (lane,
reasons text[]) — qualitative tokens only. The lane read is ADVISORY (contract WA-L8): no
locks; writers own correctness.

## §4 The autodraft task lane (full model — probe P3)

- **Kind + triggers:** `agent_tasks.kind` CHECK widens to ('chat_turn','wake','autodraft');
  `_tf_agent_task_insert` gains an explicit `autodraft` branch: requires firm_id, client_id
  (resolved by admission), params carrying (document_id, filing_id, origin ∈
  {sweep, one_click}, run_id), a pinned model snapshot (the house per-task model law),
  **no session_id** (no chat session exists; the one-live-turn unique is session-keyed and
  NULL-session rows do not collide), no origin_intent_id. `_tf_agent_task_update` gains the
  autodraft status machine: queued → running → done | failed | cancelled (+ the reconciler
  edges the chat_turn kind has); no held state (admission is synchronous). Health/reconcile/
  masked-view surfaces are extended to the new kind (enumerated at interface-pins; no
  existing chat/wake transition changes — asserted in the rig).
- **Admission writer:** `admit_autodraft_task(p_filing, p_origin, p_op_key)` — DEFINER,
  runtime lane (consumer) + a human-lane wrapper `request_autodraft(p_filing)` for
  one-click (bookkeeper+). Re-evaluates the lane; enforces the **active-attempt registry**:
  partial unique one autodraft task per filing in non-terminal state → a concurrent/repeat
  admission is an idempotent no-op (CLR29 shape, success-formed); **durable attempt
  counters** on the filing-keyed registry row: 2 terminal failures park (CLR29
  refused_attempts) until a human acts — survives restarts and new events; reserves budget
  (§5). Deterministic op_key `autodraft:<filing_id>:<origin>`; op-key args are admission
  facts only (never model output) so redelivery replays to the stored receipt without a
  request-hash mismatch.
- **Eligibility:** `_draft_entry_core` accepts task kind ∈ ('chat_turn','autodraft') on the
  coding branch (agent-lane only, unchanged human-lane rejection). `uq_coding_attempts_task`
  stands — one bill per task by construction.
- **Wake identity:** NEW wake_kind `autodraft` with EXACT allowlist rows:
  `wake_draft_entry`, `get_document_extract`, `get_context_pack`, `get_draft_review`,
  `coding_lane` — nothing else (no list fns, no approve-shaped anything). Enumerated in
  §13; minted OBO nobody (system-origin) with the client pinned from the admission row —
  the credential carries the client the reads are pinned to.

## §5 Sweep runs, budget (reserve-first — WA-D2, probe P10)

- **`clara.sweep_runs`**: (id, firm_id, state ∈ open|finalized, window bounds, expected
  count, drafted/skipped/refused counts, token_reserved/spent, checkpoint seq). PRE-CREATED
  `open` by the consumer with expected items; **finalized** only when every expected item is
  terminal (the catch-up pass reconciles committed drafts after a crash and finalizes stale
  runs). **`sweep_run_items`**: (run_id, filing_id) unique, outcome ∈ {drafted, skipped_lane,
  refused_budget, refused_attempts, noop_existing}, entry_id, refusal_token — written in the
  drafting settle path via the run_id threaded through admission.
- **`acknowledge_sweep_run(p_run, p_op_key)`** — human lane, bookkeeper+ role floor enforced
  in-fn against LIVE membership; refuses any agent/wake identity; refuses a non-finalized
  run; idempotent per (run, actor).
- **Budget primitives (NEW — the existing `begin_chat_turn` is chat_turn-only and
  read-then-act):** `begin_autodraft_task` / `settle_autodraft_task` — under the existing
  per-firm advisory budget lock, admission **RESERVES** a worst-case token estimate row
  (refuse CLR29 `refused_budget` when reservation would take spend past
  `firm_limits.sweep_budget_share` [new column, default 0.60] × daily limit); settle records
  actual + refunds the difference; failure refunds fully; a concurrent-sweep-run cap (new
  `firm_limits.max_concurrent_sweeps`, default 2) bounds overshoot; NULL-limit and
  day-rollover follow the existing `firm_usage_daily` conventions (same usage_date
  derivation as `settle_chat_turn`). One-click origin reserves identically (a human click is
  not exempt from the reserve, but is exempt from `sweep_budget_share` — it counts against
  the plain daily limit).

## §6 The queue read (single snapshot — Codex 22)

**`clara.list_review_queue(p_scope, p_cursor)`** — firm-scoped DEFINER, HUMAN lane only
(`clara_authenticated`), live-membership re-checked in-fn. Returns rows AND counts AND an
as-of watermark (max surfaced domain_events seq) from ONE statement snapshot. Total ordering
tuple: (section_rank, client_id, vendor_group, created_at, id); cursor = the tuple,
validated (malformed → typed refusal, never raw). No new table — it fronts existing state.

## §7 Coding rules (real keys, transactional sightings)

- **`clara.coding_rules`**: (id, firm_id, client_id, rule_type CHECK ('vendor_account'),
  counterparty_id composite tenant FK, **account_code with composite FK
  (client_id, account_code) → coa_accounts** [the real key — there is no `coa_accounts.id`;
  must exist + postable at signing AND re-verified at application], status
  (proposed|live|declined|retired), pinned, origin (proposed|authored), content_hash,
  created/signed/retired actor+time, retire_reason). Partial unique: one LIVE rule per
  (client_id, counterparty_id, rule_type).
- **`clara.rule_sightings`**: append-only, **unique (client_id, counterparty_id,
  account_code, entry_id)** — a split bill records every distinct (vendor→account) mapping.
  **Written INSIDE `approve_entry`'s transaction** (PRD invariants 4/13 — never an async
  consumer): after the status flip, one row per distinct debit account with a payable-side
  resolved counterparty; abort rolls both back; replay is op_key-idempotent. Reversal
  excludes the entry from threshold eligibility (the count is over approved-UNREVERSED
  entries, canonicalized through `merged_into`). The ≥3-distinct-entries threshold crossing
  INSERTs the rule-proposal `open_questions` row + `kb_rule.proposed` event in the same
  transaction.
- **Writers** (human lane, bookkeeper+): `propose_coding_rule`, `sign_coding_rule`,
  `decline_coding_rule`, `retire_coding_rule` (pinned → requires the conflict-question
  token; CLR27 otherwise).
- **Application (deterministic, proven — Codex 17, C-10):** `_draft_entry_core` resolves the
  live rule by (client, resolved counterparty, 'vendor_account') **FOR SHARE in the draft
  transaction**, and persists a **fired-decision record** (`rule_decisions`: entry_id +
  revision token + the FULL rule content snapshot + `account_matched` bool — did the drafted
  account equal the rule's). "Per your rule" renders only when `account_matched`. A rule
  signed after the draft leaves no snapshot (nothing fired); a rule retired after firing
  keeps its immutable snapshot. The model never selects the rule; sign/retire races
  serialize on the rule row lock (rig case).

## §8 Open questions (split lanes, serialized gate — Codex 8/9)

- **`clara.open_questions`**: (id, firm_id, client_id, scope_kind CHECK
  (document|vendor|client) with the scope-matching id NON-NULL by CHECK, origin
  (clarify_promotion|rule_proposal|rule_conflict|sweep_refusal|manual), question_text,
  status (open|resolved|dismissed), opened_by/at + opener_kind (human|wake),
  resolved_by/at, resolution_text, spawned_rule_id). Partial index on open per client.
- **Split entry points over an ungranted core** (ADR-015 — a single shared writer cannot
  detect its lane): `open_question(...)` human lane bookkeeper+ (a viewer cannot block a
  client); `wake_open_question(...)` agent lane, allowlisted per wake_kind, scope pinned to
  the credential's client (a wake can never open a question outside its client).
  `resolve_open_question` / `dismiss_open_question` human-only, bookkeeper+.
- **Serialization (the CLR26 gate is not check-then-act):** question writers take, BEFORE
  insert/resolve: document scope → the active-filing row lock (the existing serialization
  point); vendor scope → `pg_advisory_xact_lock(hash(client, counterparty))`; client scope →
  `pg_advisory_xact_lock(hash(client))`. `approve_entry` takes the SAME locks (its existing
  filing lock + the vendor/client advisory locks for the entry's resolved counterparty and
  client) before its CLR26 check — both commit orders rig-proved with deadlock bounds.
  `_open_question_blocks` is a firm-scoped DEFINER predicate (probe P8: invoker cannot read
  the fn-fronted table), canonicalizes `merged_into`, and is the ONE shared implementation
  for `approve_entry` + `coding_lane`.
- `promote_clarify_to_question(p_interruption, ...)` — one-way, audited.

## §9 Revision snapshots + diff reads (new state — Codex 12)

- **`clara.journal_entry_revisions`**: append-only — (entry_id, revision_no, revision_token,
  actor, reason, header snapshot, ordered legs jsonb [account_code, cents, side,
  counterparty_id], rule_decision_id, evidence refs, created_at); unique (entry_id,
  revision_no). Written in the SAME transaction at draft creation (rev 0), by every
  `revise_entry`, and by every facts-driven token rotation. `revise_entry` body change
  (arity unchanged → OR REPLACE; if arity changes for any fold reason → C-1).
- **`get_entry_diff(p_entry, p_client)`** — walks the revisions table (firm-scoped DEFINER;
  authenticated + agent_ro client-pinned; deltas computed in SQL).
- **`get_doc_entry_diff(p_entry, p_client)`** — document-side corroborated fields + regions
  vs entry legs, SQL deltas, honest no-region rows. Fronts `_invoice_fact_state` (definer)
  + `entry_evidence`; no new state.

## §10 Egress registry + lane-carve (WA-D1 — probe P2)

- **`clara.client_egress_consents`**: (id, firm_id, client_id, scope_note,
  evidence_document_id FK → a REAL ingested document owned by the same firm [asserted],
  granted_by/at, revoked_by/at, revoke_reason). Partial unique: one live row per client.
  Writers `grant_client_egress` / `revoke_client_egress` — human lane, **OWNER role floor**;
  grant→revoke→grant cycles produce distinct rows (audit history); a retired client refuses.
- **Lane-carve in `claim_document_processing_task` (definer-internal — the runtime passes
  ONLY the kill-switch boolean; it holds no consent read and never will):** `ocr` lane →
  kill-switch only (pre-attribution: probe P2 proved no client is reachable);
  `invoice_facts` lane → kill-switch AND a live consent row for EVERY active filing's
  client of the document (multi-filing partial consent refuses CLR28 and holds the task).
- **Last-boundary recheck (Codex 1):** the claim function re-verifies kill-switch + consent
  on EVERY branch that can dispatch — fresh claims, `running` re-claims, and replayed
  receipts return a consent-bound lease; the workflow re-claims immediately before the
  external call, so kill/restart/replay after a revocation yields ZERO post-revocation
  dispatch (rig case: revoke between claim and dispatch, kill, replay — count actual
  outbound calls).
- **Deploy ordering:** 0011 (gate live, zero rows → invoice_facts egress fails CLOSED) →
  seed consent rows for the owner-confirmed consented clients citing their evidence docs →
  deploy the image. The window between is fail-closed by construction.

## §11 Facts-capture fix

`captured_invoice_id` (null 14/17): root-cause in the invoiceFacts field mapping; fix at the
mapper; re-measure on the eval corpus; until ≥16/17 no lane predicate references it. Note
the duplicate-bill gate + near-dup surface key on facts invoice_id and are near-inert while
capture is lossy — the fix materially arms two existing controls.

## §12 Events + taxonomy (additive into ACTIVE — probe P7)

New event types: `sweep.run_completed`, `kb_rule.proposed/signed/retired`,
`open_question.opened/resolved`, `counterparty.merged`, `egress.consent_granted/revoked`.
**Additive-insert into the ACTIVE taxonomy version** (the true 0009 pattern — NO new
version, NO `taxonomy_active` flip): decision `ignore` except `kb_rule.proposed` +
`open_question.opened` → `notification`. Coupled-pair coverage assert in the tail. The
autodraft consumer subscribes DIRECTLY to `document.invoice_facts_completed/_failed`
(matcher precedent; no taxonomy dependency).

## §13 Grants delta (complete enumeration — nothing else moves)

| Object | authenticated | agent_ro | wake lanes | runtime |
|---|---|---|---|---|
| coding_lane / list_coding_lanes | EXECUTE (jwt_firm) | EXECUTE (CLR03 + client-pinned) | autodraft allowlist: coding_lane only | — |
| list_review_queue | EXECUTE | — | — | — |
| add/retire_counterparty_alias, rename_counterparty | EXECUTE | — | — | — |
| merge_counterparties | EXECUTE | — | — | — |
| admit_autodraft_task | — | — | — | EXECUTE |
| request_autodraft | EXECUTE | — | — | — |
| begin/settle_autodraft_task | — | — | — | EXECUTE |
| acknowledge_sweep_run | EXECUTE (bookkeeper+ in-fn, human-only) | — | — | — |
| propose/sign/decline/retire_coding_rule | EXECUTE | — | — | — |
| open_question | EXECUTE (bookkeeper+) | — | — | — |
| wake_open_question | — | — | via allowlist (autodraft + chat wake kinds) | — |
| resolve/dismiss_open_question, promote_clarify_to_question | EXECUTE | — | — | — |
| get_entry_diff / get_doc_entry_diff | EXECUTE | EXECUTE (client-pinned) | autodraft allowlist: get_entry_diff not granted | — |
| grant/revoke_client_egress | EXECUTE (OWNER in-fn) | — | — | — |
| approve_routine_entry | EXECUTE | — | — | — |
| _open_question_blocks | not granted (called by definer sites) | | | |
| **wake_kind `autodraft` allowlist rows** | n/a | n/a | wake_draft_entry, get_document_extract, get_context_pack, get_draft_review, coding_lane — EXACTLY these | n/a |
| All new TABLES | zero direct DML/SELECT — fn-fronted only | | | |

**§13a per-layer error table** (S6 §12 bar): every new SQLSTATE/constraint → CLR code +
reason → runtime result → card copy, including multiple-gate precedence
(CLR03 identity > CLR28 consent > CLR26 question > CLR21/23 business > CLR29 sweep no-op),
authored in full at interface-pins; no raw SQLSTATE reaches a card.

Tail asserts: one overload per public writer; PUBLIC-zero-execute on every new fn; the §13
matrix row-by-row; the §1 AB-3 probes; the WA-D5 attestation gate (an agent-made high-stakes
draft approved without attestation must refuse — the probe-P6 case inverted); the
`approve_routine_entry` high-stakes refusal; taxonomy coverage whole.

## §14 Concurrency + lock order

- Sweep vs chat draft: both funnel through `_draft_entry_core`; the filing row lock +
  one-open-draft unique serialize (probe P9: both orders, no deadlock); losers no-op.
- **Duplicate-bill serialization (Codex 7):** `approve_entry` takes
  `pg_advisory_xact_lock(hash(client, counterparty, facts_invoice_id))` BEFORE the
  duplicate EXISTS check — concurrent exact-duplicate approvals serialize; at most one
  commits approved-unreversed (rig: both orders + one batch worker vs one reviewer).
- **CLR26 lock protocol (Codex 8):** as §8 — question writers and approve share the
  filing/vendor/client locks; both orders rig-proved.
- Merge lock order: survivor then merged by deterministic id order → children reads;
  merge vs draft/approve/revise/sign schedules forced in both orders (rig).
- Budget: reservation under the existing per-firm advisory budget lock (same lock as
  `begin_chat_turn` — one budget authority).
- Deferrable-trigger law unchanged: entry + lines + evidence + revision snapshot in ONE
  explicit transaction.

## §15 Second-run ledger (executed, not reasoned)

Migration re-application is governed by the RUNNER's duplicate refusal (the house
migration model — 0011 is not self-reapplying; the misleading v1.0 "re-apply onto itself"
claim is withdrawn); CI proves fresh-bootstrap AND 0010→0011 upgrade parity by catalog dump
diff (overloads, ACLs, policies, triggers, taxonomy coverage). Executed-twice set: consumer
restart mid-backlog (checkpoint resume, zero double-draft); `acknowledge_sweep_run` twice;
merge repeat (same op_key idempotent; different args refuse); consent grant→revoke→grant;
poison-filing park across restarts + a NEW event (cap holds); run finalization after a
crash (catch-up reconciles); the §10 deploy ordering end-to-end on the rig before any live
window.
