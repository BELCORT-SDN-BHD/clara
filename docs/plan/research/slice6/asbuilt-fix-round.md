# Slice-6 fix round — lane reports (archived by the orchestrator from lane messages)

Fix round driven by the as-built dual review (native: no hard standards violations +
5 spec findings; Codex xhigh: FLAWED, 6 HIGH, security core confirmed sound). Work
orders W1–W10 in asbuilt-interface-pins.md §6.6. Four lanes; all complete.

## FIX-DB (0009 in place + deploy/write-login-ceremony.sql)

- W1: journal_entries.flags jsonb (+shape CHECK, draft→draft allow-set); mismatch
  PERSISTS flags.amount_exception (receipt + attempt carry exception:true); approve
  gates CLR21 amount_conflict with CLR25 checked FIRST (a genuine facts
  contradiction stays CLR25); revise_entry +p_amount_override (reason + region
  cited in revised evidence) → flags.amount_override, joins is_high_stakes +
  get_draft_review (distinct-checker binds); bill-shape gross-equation relaxed
  under override; conforming revise clears; facts rotation voids.
- W2: _invoice_fact_state resolves invoice.invoice_id (+invoice_date); approve
  refuses CLR21 duplicate_bill on exact (client, counterparty, facts invoice_id)
  vs another approved-unreversed supplier_bill unless flags.duplicate_override
  (revise +p_duplicate_override); get_draft_review.near_duplicates advisory
  (implemented inline — a granted underscore helper would trip the
  helpers-not-app-callable invariant).
- W3: corroborated=true requires a NON-EMPTY total polygon AND
  envelope->>'corroboration_ineligible' IS NULL; geometry-less rows persist but
  never corroborate.
- W4: coding_attempts unique(task_id) (dropped the (task_id,filing_id) pair; kept
  unique(entry_id)); insert conflict → CLR21 double_coded. ADJUDICATED deviation
  from companion §10 (AB-11).
- W5: CLR21 currency_unsupported when SUBMITTED evidence cites invoice.currency
  with an explicit non-MYR value — checked on RAW p_evidence BEFORE the
  recoverability validator (which would otherwise mis-refuse as evidence_invalid).
- W7: clara_runtime SELECT on processing_call_reservations REVOKED + runtime policy
  dropped (zero runtime readers; metering writers are definer) — AB-13.
- Cross-lane pins: persist_invoice_facts 6-arg (+p_envelope, DB-authoritative-last
  merge so the runtime can never spoof raw_sha256/normalization_version);
  receipt exception + provenance_tier; get_coding_attempt.exception.
- FIX-S-1 _fact_hash (5 sites deduped) · FIX-S-2 _corroboration_bound (3 sites,
  CLR21-vs-CLR25 parameterized) · FIX-SP-5 high_stakes_reasons text[].
- Evidence: fresh + upgrade runner drills clean (all tail asserts incl. the new
  8-arg/6-arg single-overload); behavioral tests for F1–F5 pass; orchestrator
  CI-shape battery 265/0/11; two isolated-only tests correctly skip in CI shape.

## FIX-RT (runtime)

- W1: early mismatch refusal REMOVED; je_review part +exception?:boolean; recovery
  reads get_coding_attempt().exception; Clr21Reason +'duplicate_bill'.
- W3: Azure mapper never fabricates geometry; documents.length>1 ⇒ envelope
  corroboration_ineligible='multi_document'; credit-note signal ⇒ 'credit_note';
  invoice.deposit only when returned.
- W4: segment stops after the first successful draft (stopWhen, mirrors clarify);
  a second call maps to the friendly one-bill-per-turn refusal.
- W5: the write-tool wrapper parses the REAL get_document_extract shape; the
  false-green closure-logic mock fixed to the real shape.
- W6: scan.mjs — persistent lifetime socket error handler + scan-wide deadline
  (CLARA_CLAMD_SCAN_DEADLINE_MS); mid-stream clamd death + wedged-scanner tests,
  both fail closed 503, never a process exit.
- W8/W10: "machine-corroborated" wording; env/README honesty (no-op var removed,
  CLAMD vars documented); pools.mjs three-login header (comment-only).
- Gates: typecheck/lint/build/freeze-lint green (one --update re-baselining exactly
  the 5 edited pre-merge frozen files); lane suites 31/31.

## L5 dashboard + L2 test lanes

L5: exception panel hydrates from persisted flags (never synthesized from errors);
exact CLR21 token branching; vendor hydration fixed (proposal.new.*, decision
'birth'); machine-corroborated labels; Done requires the result entry;
high_stakes_reasons + near_duplicates rendered; override evidence pre-seeded from
the machine-total region (region_id + quote). Gates green, parity 11/11.

L2: s6-locks +correction/revise forced schedules (6/6, pg_blocking_pids-proven);
stale-evidence pins CLR25 exactly; W1–W5 behaviors pinned (feature-marker-gated);
upgrade drill +the legacy-state correction case (approved cite + open draft built
at 0008 → 0009 applies → correction reverses+withdraws in one bounded txn).
FINAL PASS on the fix-batch 0009: 83/83 across the two runs (79+4 isolated), 0
fail, NO divergences — W1 exception/override/distinct-checker, W2 duplicate_bill +
near_duplicates, W3 no-geometry-Tier-B, W4 unique(task_id)+double_coded, W5
currency refusal, exact CLR25, probe-2 correction/revise schedules, and the
legacy-state correction all verified live; the transient mid-edit ordering issue
confirmed absent from the final file (clean fresh reset+migrate).

Orchestrator verification: db battery 265 pass / 0 fail / 11 skip (CI shape);
runtime 157/157 (0 skip); dashboard 11/11; typecheck/lint/build/freeze-lint green;
fixed 0009 runner-applied clean on all four throwaways.
