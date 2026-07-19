# GATE-3 closing note — the Slice-6 beta on live (2026-07-19/20)

**VERDICT: GATE 3 CLOSED.** The full §10 checklist, run beta-real on live against
Rome Properties' FY2025 books under the owner's credential and direction.

## The §10 checklist

1. **The REBUILD-PLAN script end-to-end on live** ✓ — 17 real supplier bills:
   intake upload → verified finalize → human filing to RPR (owner credential) →
   in-writer invoice-facts enqueue → chat coding turns (perception → read tools →
   `draft_journal_entry` via the write floor) → `je_review` → human approval →
   approved entries with filing-bound provenance + vendor subledger rows (six
   vendors born through approvals). Two turns lawfully parked on clarifies
   (the INF seven-page bundle; a PKL registration read) and were answered on the
   human lane — the S6-R5 floor exercised for real.
2. **The kill-demo** ✓ — owner-directed machine restart mid-workflow (task
   22af36ef, the re-code of a deliberately-withdrawn draft). The run resumed
   through the WDK replay path, the `je_review` card arrived in the SAME
   session, and the ledger proved exactly-once: coding_attempts=1,
   open drafts=1 (+1 audited withdrawn), op_receipts=1, settle rows=1.
3. **The §9 replay eval** ✓ — `gate3-eval-report.md`: **17/17 approved, 17/17
   debit-leg reconciliations PASS** (incl. the INF one-draft-three-legs from
   backup pages; both stale-filename cases resolved by document truth), posting
   dates all match, **AP gate PASS**: the DB-owned `trial_balance` 400-000
   balance = Σ coded bills = **RM 1,350,938.21**. Zero exceptions.
4. **Audit trail inspectable** ✓ — every entry traces: op receipts (stable
   `code-doc:<task>:<doc>` keys), coding_attempts, entry_evidence with region
   cites, events, revision-token history through the revise/approve chain.
5. **Invariants held** ✓ — no agent write beyond the draft ceiling (every write
   through `wake_draft_entry`); no unreviewed figure (all totals document-cited;
   Tier-B labels honest); a human approved every draft (the owner's credential;
   solo-attest recorded on high-stakes); the structural agent-approve refusal
   (42501 at role level) live-probed at the as-built review.

## The three production defects the beta caught (all fixed + merged same-day)

- **Facts-lane discovery dead** (PR #21): the reconciler's DB-authority snapshot
  joined `clara.documents` (never runtime-readable — deliberate) → 42501 →
  silent sidecar fallback since S5; only the sidecar-less DB-enqueued
  invoice_facts lane exposed it. Fix: task-only snapshot + merged-meta return
  (a second clobber the join had masked). Zero grant changes.
- **Park-resume broken after restart** (PR #22, `chatTurn_v3`): the park-site
  assistant message re-sent collected stream OUTPUT (embedded tool-results,
  unpaired tool-calls, provider-metadata parts) — valid in-memory by luck,
  invalid as model INPUT after a WDK replay. Both parked clarifies died
  `model_error` when a deploy restarted the machine mid-park; v1 carries the
  same latent bug (its ceremony test never restarted mid-park). v3 sanitizes
  the park message to text + the clarify tool-call; the kill-demo then PROVED
  the fixed path end-to-end.
- **`get_draft_review` 22P02** (PR #23, migration 0010): `text[] || 'literal'`
  resolves as anyarray||anyarray — every above-threshold review read failed the
  moment a high-stakes reason fired. Fixed with `array_append`.

Also observed working as designed: the NEW-3 fingerprint congruence law — 11
drafts proposed before their shared vendors existed refused CLR23 at approve
("landscape changed") once sibling approvals birthed the vendors, and ALL
converged through the documented `revise_entry` → fresh fingerprint → approve
path. The S4 metering law fail-closed the firm at its 1M-token day (raised to
5M by the owner for the beta window via `clara.firm_limits`).

## Operational state at close

Live: 10 migrations; world ON; scanner green; egress flag =1 under the signed
S6-R1 RPR consent (payroll/IC never uploaded); BELCORT + RPR onboarded (27
accounts incl. the two owner-approved system roles); the S4-V2 canary
interruption daba7f2e UNTOUCHED (due 2026-08-02). The eval tooling +
state live in `.tmp/s6-eval/` (gitignored); the archived evidence is this
directory's `gate3-eval-report.md` + `gate3-eval-results.json`.
