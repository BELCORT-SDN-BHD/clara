# Slice 6 — as-built amendments (§13 of the design contract) · v1.0

**This file IS §13 of `slice6-thin-e2e-contract.md`** — split out per the S5 §13
precedent (500-line cap). Same normativity: where an amendment below contradicts the
contract/companion body, the amendment is the as-built law of record. Process of
record: five build lanes (interface-pins first) → integration → as-built dual review
(native two-axis: no hard standards violations + 5 spec findings; Codex xhigh
live-verifying: FLAWED, 6 HIGH — security core CONFIRMED SOUND under live probes) →
this fix round. Review evidence: `docs/plan/research/slice6/asbuilt-*` (archived from
`.tmp/slice6-build/REPORT-*.md`).

## Build-stage amendments

- **AB-1 (recovery read).** `clara.get_coding_attempt(p_task)` (SECURITY DEFINER,
  granted `clara_runtime` only) — the C-12 recovery read the companion implies
  ("every step attempt RECOVERS a completed attempt") but §9 did not name.
- **AB-2 (scanner fail-closed degrade — supersedes the S5 managed-scanner FATAL
  law).** clamd death no longer kills the runtime: supervisor restarts it with
  bounded backoff; NEW intake admissions fail closed while unavailable (nothing
  bypasses scanning); `/ready` keeps `scanner.ok:false` as a warning. Driven by the
  live 2026-07-19 incident (1024MB VM OOM-killed clamd post-signature-load; the
  FATAL law crash-looped the runtime; VM now 2048MB, restart=always). The review's
  F6 hardening: a persistent socket error handler for the whole scan lifetime + a
  scan-wide deadline — mid-stream clamd death or a wedged scanner resolves to the
  fail-closed refusal, never a process exit or hang.
- **AB-3 (deferral, MUST-FIX pre-MyInvois).** `record_rule_resolution`
  (0007:2308-2317) reads extractions without an engine_kind pin — a C-7 violation
  that is BENIGN today (the pinned invoice-facts field_path vocabulary shares no
  substring with its 'tin'/'ssm'/'account' keys) and stays as-built this slice
  (the fn is not recreated by 0009). HARD GATE: pin it before any slice that widens
  the facts vocabulary (MyInvois issuer/receiver IDs). The runtime-side twin
  (matcher readMatchInputs) IS pinned to ('ocr','structured_parse').
- **AB-4 (cosmetic).** Dashboard api.ts split: je_review wrappers live in
  `app/chat/review.ts` (500-line cap); `rpc` exported from api.ts.
- **AB-5 (N-F18 realization).** No dedicated inbox exists as-built; "one surface,
  two rows" is realized as the /documents coding-tasks list rendering
  origin='correction' recodes, with a taskId filter for future notification
  deep-links. A real inbox surface remains future work.
- **AB-6 (claim-receipt metadata).** DB-enqueued invoice_facts tasks have no spool
  sidecar; `claim_document_processing_task`'s 'running' AND 'replayed' branches
  carry `document_id, firm_id, lane, storage_path, sha256, mime_type, byte_size`
  (definer-internal read; ZERO grant delta — the runtime holds no SELECT on
  clara.documents). Discovery rides the existing 0008 SELECT on
  document_processing_tasks. held_egress/failed receipts carry no metadata.
- **AB-7 (D-L2-2 scoping).** The evidence array is HARD-REQUIRED (CLR21
  `evidence_invalid`) only on the coding flow — `coding_kind='supplier_bill'` with
  null/empty/malformed evidence refuses at draft AND revise; PLAIN doc-bound drafts
  (no coding_kind) keep their shipped 0005/0007 evidence-less lawfulness (the
  correction writer's internal mirrors depend on it). §12's "document-bound draft"
  clause reads as "coding-flow draft". Root cause fixed: a SQL-null p_evidence
  previously skipped the guard via three-valued logic; all four null-variants now
  refuse identically (live-probed).

## Fix-round amendments (from the as-built dual review)

- **AB-8 (persisted amount exception — implements S6-D1; supersedes contract §4's
  bare-refusal wording per §0.5 precedence).** A supplier_bill draft whose total
  conflicts with the corroborated machine total PERSISTS, carrying
  `flags.amount_exception = {machine_total_cents, proposed_cents, fact_hash, at}`;
  `approve_entry` refuses CLR21 `amount_conflict` while the exception stands;
  resolution = `revise_entry` with the NEW `p_amount_override jsonb`
  ({reason, region_id cited in the revised evidence}) which stamps
  `flags.amount_override`, joins the high-stakes derivation (distinct-checker law
  binds), or a conforming revise which clears both. A newer facts completion voids
  the override (token rotation + CLR25 unchanged). The runtime wrapper no longer
  pre-refuses; the card renders the exception from hydrated state and pre-seeds the
  override evidence citation from the machine-total region.
- **AB-9 (duplicate-bill control — implements S6-D1).** `_invoice_fact_state`
  resolves `invoice.invoice_id`; at approve, an exact (client, resolved
  counterparty, facts invoice_id) match against another approved-unreversed
  supplier_bill refuses CLR21 `duplicate_bill` (NEW §12 reason token) unless a
  reason-coded `flags.duplicate_override` (via revise's NEW `p_duplicate_override
  jsonb`) is stamped; near-duplicates (same vendor + same invoice date or equal
  corroborated total) surface non-blocking in `get_draft_review.near_duplicates`.
- **AB-10 (Tier-A physical/single-doc/classification — implements S6-D1's ALL-of
  gate).** The Azure mapper never fabricates geometry; corroboration requires a
  NON-EMPTY polygon on the total region; a multi-document engine result or a
  credit-note doctype persists facts with envelope
  `corroboration_ineligible: <reason>` ⇒ never Tier A (the INF-bundle rule);
  `invoice.deposit` is emitted when returned. Geometry-less facts persist but
  cannot corroborate.
- **AB-11 (one-coding-per-task — supersedes companion §10's
  `unique(task_id, filing_id)`).** `coding_attempts` is unique on `(task_id)`
  (+ unique(entry_id)); a second draft attempt in one turn refuses CLR21
  `double_coded`; the v2 segment stops after the first successful draft. Rationale:
  the companion's own scalar recovery design (C-12) and S6-R11's
  one-document→one-draft→one-card law jointly require exactly one attempt per
  task — the two-column unique permitted durable drafts recovery could never
  surface (review F5, live-proven).
- **AB-12 (extract-shape truth + Tier-B currency law).** The v2 write-tool wrapper
  parses the REAL `get_document_extract` shape (regions[] joined to completed
  extractions); the fictional top-level facts parse (review F4) is gone. The DB
  additionally refuses CLR21 `currency_unsupported` when SUBMITTED evidence cites
  `invoice.currency` with an explicit non-MYR value — closing the Tier-B currency
  hole at the source (contract §4 [C-20] honored at either tier).
- **AB-13 (grant hygiene: REVOKED).** The review-flagged `clara_runtime` SELECT on
  `processing_call_reservations` (+ its unrestricted runtime policy) was
  unsanctioned by §9 and had ZERO runtime readers (tree-wide sweep; the reconciler
  reads document_processing_tasks, never the metering carrier; the metering
  writers are SECURITY DEFINER and unaffected). Both revoked/dropped in 0009. If a
  future reconciler needs the table, re-grant with a recorded amendment.
- **AB-14 (naming).** Every user/model-facing "machine-verified" is
  "machine-CORROBORATED" (S6-D1's naming ruling binds §4's wording). The internal
  `provenance_tier='verified'` enum is unchanged.
- **AB-15 (legacy-test adaptations).** Nine pre-S6 tests updated to ratified S6
  law with per-edit citations: the §9/C-11 grant matrix (incl. agent SELECT on
  counterparties/entry_evidence BY DESIGN; get_journal_entry agent revoke), N-F8's
  CLR10 line-shape refusals (pre-empting the table CHECK's 23514), and C-15
  correction fixtures reworked by REORDERING (reverse-first frees the filing under
  the one-coding law; §8's partially-reversed scenario recreates the identical
  pre-state). The combined legacy-state case (approved cite + open draft on one
  filing, only creatable pre-0009) moved to the reset-gated upgrade drill: built at
  0008, 0009 applied over it (pre-flight tolerates it — only two OPEN drafts
  abort), correction exercised over genuine legacy state.
- **AB-16 (FLAKE-1 adjudication: benign).** One 40P01 in the S4-AB11 transition
  test under a full concurrent sweep; re-run green. Codex enumerated every new lock
  edge 0009 makes reachable from agent_tasks and live-forced both serialization
  orders (clean) + the FK key-share probe (non-blocking, 68ms): a shared-test
  contention artifact, not a lock-order inversion. No fix indicated.
- **AB-17 (ops honesty).** `CLARA_INVOICE_FACTS_MAX_ATTEMPTS` removed from
  env/README (the DB owns the cap: 3, in the claim fn); `CLARA_CLAMD_HEALTHY_RUN_MS`
  documented; pools.mjs header names three logins; the write-login LOGIN ceremony is
  a TRACKED artifact `packages/db/deploy/write-login-ceremony.sql` (placeholders
  only). Also folded: `storage-provision.sql` gains the ceremony-proven
  `grant clara_storage_docs to authenticator`.

## Beta amendments (the GATE-3 live run, 2026-07-19/20 — see
`research/slice6/gate3-closing-note.md` for the full account)

- **AB-18 (facts-lane discovery, PR #21).** The document-task sweep's
  DB-authority snapshot is TASK-COLUMNS-ONLY (the clara.documents join was never
  runtime-readable and silently killed the path since S5), and the index returns
  MERGED sidecar metas (the raw-row return let the re-enqueue write clobber
  sidecar transport fields). `deps.graceMs` override added for tests.
- **AB-19 (`chatTurn_v3`, PR #22).** The park-site assistant message is
  sanitized to its text parts + ONLY the clarify tool-call, rebuilt plain — the
  collected stream output is not valid model INPUT after a WDK replay. v1/v2
  carry the latent form; registry repointed v3 with v1/v2 exports kept.
- **AB-20 (migration 0010, PR #23).** `get_draft_review`'s reason appends use
  `array_append` — `text[] || 'literal'` parses the untyped literal as an array
  literal (22P02) the moment any high-stakes reason fires.
- **AB-21 (beta operations).** BELCORT `clara.firm_limits.daily_token_limit`
  raised to 5,000,000 for the beta window (owner-directed; the 1M default
  fail-closed mid-eval — the metering law working). The eval driver runs ONE
  SESSION PER BILL (a parked clarify holds its session's one-live-turn slot —
  a shared session wedges everything behind it: a UX lesson for Phase-4 chat).
  The NEW-3 CLR23 landscape refusal + revise-convergence path was exercised 11×
  in production and behaved exactly as ratified.

- **AB-22 (destructive-guard contract: the named target is now USER-QUALIFIED).**
  Found while verifying the DR drill driver, BEFORE the drill ran. `targetLabel()`
  rendered a target as `host:port/db`, dropping the username — but on a managed
  Supabase pooler the **project ref lives in the username**
  (`postgres.<ref>@aws-0-<region>.pooler.supabase.com:5432/postgres`), so host, port
  and db are **byte-identical for every project in a region**. `guard.mjs`'s
  `named === label` confirmation therefore **could not distinguish two projects**: an
  operator who set `CLARA_DESTRUCTIVE_TARGET` to the scratch label while
  `DATABASE_URL` still pointed at LIVE would have had a restore **waved through** —
  precisely the ambient-DSN footgun the guard exists to defeat, defeated by the
  pooler's shared-host architecture. Same exposure applied to `reset.mjs` (drops
  schema clara) and `restore.mjs`/`restore-full.mjs`. **Law now:** `resolveTarget()`
  also returns `user`; the new `destructiveTargetLabel()` renders
  `user@host:port/db` and is what the named-target confirmation **and the refusal
  message** compare, so the printed copy-paste string is already the safe form.
  `targetLabel()` keeps its `host:port/db` shape (it is the human/log label in many
  call sites and in dr-verify's refusal logic), and `targetIsEphemeral()` stays
  host/db-based so the localhost / `*_ci` / `*_test` paths — and therefore CI — are
  unaffected. Proven both ways on Supabase-shaped DSNs: the sabotage case (named
  scratch, DSN live) REFUSES; the legitimate case ACCEPTS; the ephemeral path still
  needs no named target; the db suite is unchanged at 265/0/11. The drill driver
  computes the same user-qualified string, so it never asks the operator to
  copy-paste an identity. **Not closable by the guard alone:** post-connect identity
  (db oid + `pg_control_system().system_identifier`, as `dr-verify` does) is
  strictly stronger, but the guard authorizes **child** processes (`psql`/`pg_dump`)
  *before* any connection exists — a probe connection would prove only that the
  parent could reach a target, not where the child lands (TOCTOU), and would force
  the operator to supply an opaque identifier. The username is the discriminator
  already present in the DSN, at zero operator cost.

## Residuals (recorded, not built)

Per contract §11 unchanged, plus: a dedicated notification inbox surface (AB-5);
AB-3's engine_kind pin (pre-MyInvois gate); the parity test gates render branches
only (SQL hydration shape is covered by the db suites — accepted for S6); agent
visibility of attribution candidates; the per-client egress registry.
