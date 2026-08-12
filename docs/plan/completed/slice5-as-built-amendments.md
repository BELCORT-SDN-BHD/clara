# Slice 5 — as-built amendments (§13 of the design contract)

**This file IS §13 of `slice5-document-pipeline-contract.md` (v1.2)** — split out for
the 500-line file cap, exactly like the §3 companion. Same status, same review
ladder, same normativity. AB-N citations elsewhere resolve here.

**Build stage (2026-07-19; extended by the review round below):**
- **AB-1 (§3.10 completed by `0008_runtime_read_surface.sql`):** READ-ONLY runtime
  visibility added on (a) the matcher's lane-2 inputs (extractions/regions/clients —
  the aliases/identifiers runtime-SELECT row proved matcher-side computation was the
  intent) and (b) the runtime's own control tables (intakes/tasks/reservations — §3.9's
  reconciler requires seeing queued-unbound tasks; closes an otherwise-irreducible
  finalizer crash window). DML stays writer-only.
- **AB-2 (§3.4 wording resolved):** `record_rule_resolution` EXECUTE is held by the
  `clara_runtime_login` LOGIN directly (not the group) — a pooled SET-ROLE session
  cannot reach it; the matcher calls it in its raw-login identity scope.
- **AB-3 (S5-D3 destination attribution):** approve requires an unsuperseded ≥0.95
  human/rule `client_resolutions` row (subject_kind='document', subject=the document,
  client=to_client) — CLR01 otherwise; it must exist BEFORE propose (its own event
  stales the plan). The distinct-checker law follows 0004 (attestation never bypasses
  an available checker).
- **AB-4 (honest-state period model):** no period/close/subledger model exists as-built;
  `_correction_period_state` is the single extension point (reports 'no_period_model';
  the §3.5 hard-block never fires yet). Retention uses a conservative floor recorded as
  'missing-fy-conservative-0007' while clients carry no FY-end.
- **AB-5 (re-affirmation belt):** retire-blocks-on-live-drafts makes "filing retired
  between draft and approve" unreachable via governed paths; `approve_entry`'s
  citability re-affirmation stays as defense-in-depth.
- **AB-6 (S5 failure-code map, as-built):** CLR15 legacy-upgrade/transport-bypass ·
  CLR16 intake/processing/extraction transitions · CLR17 filing conflict/retention
  floor/CAS · CLR18 reservations/limits/concurrency · CLR19 correction authz/stale-plan/
  period · CLR20 attribution/candidate state. (Process lesson: enumerate at design time.)
  **Amended by the review round (AB-13): S5 writers no longer raise CLR14.**
- **AB-7 (`rig.%` = reserved test namespace):** taxonomy full-coverage assertions
  exclude it (the runtime relay suite registers a synthetic wake-bound type; shared-DB
  CI runs must not false-fail the real catalog's coverage law).
- **AB-8 (residuals):** object↔row reconciliation enumerates tracked/sidecar objects
  (verify-then-report; full bucket LIST adoption is a follow-up); the engine schema's
  PUBLIC-EXECUTE exposure on an engine-carrying DB falls under the recorded
  deployment-ACL-baseline deferral (PROJECTLOG HIGH-10) — re-examined at the as-built
  review against the live posture.

**Review round (as-built dual review 2026-07-19 — native APPROVE-WITH-NITS + Codex
13 findings, ALL closed; evidence: `research/slice5/asbuilt-*.md`):**
- **AB-9:** the S5-D3 "re-code task row" ships as a firm-visible `document_recode_required`
  notification (checker-attributed, correction+destination-referenced); the durable
  coding-TASK carrier lands with Slice 6's coding floor (F-06 stopgap, owner-visible).
- **AB-10:** storage doctrine = `packages/db/deploy/storage-provision.sql` (NOLOGIN role,
  bucket-scoped INSERT+SELECT only) executed AT THE CEREMONY on Supabase — the local rig
  has no storage schema; the runtime pins the designated role via `CLARA_STORAGE_ROLE`
  + future-exp validation (F-05).
- **AB-11:** op-receipt replay is reserve-FIRST in every S5 writer (a committed receipt
  replays after response loss) and the finalize op_key is the intake's creation-fixed key
  (F-03); intake enforces the bookkeeper+ floor and LIVE membership at every capability
  transition — revocation fails the intake honestly with refund (F-01); a DB-first
  reconciler sweep covers the begin-crash window (F-04).
- **AB-12:** attachment parts validate at admission (≤5/turn, same-firm, author-owned,
  adopted intake, document congruence, no oracle — F-08); shared-session attach follows
  the session predicate, private stays creator-only (F-11).
- **AB-13:** matcher conflicts record `outcome='abstained'` with candidates retained
  (F-09); identifier normalization strips ALL whitespace on write, matching the lane-1
  predicate (DC-1); ALL S5 limit refusals raise CLR18 (F-10 — amends AB-6).
- **AB-14:** propose requires the destination attribution (F-07, strengthens AB-3);
  approve adopts exact-hash pending reversals and withdraws mismatches
  ('superseded-by-correction'; `filing_correction_items.adopted_reversal`) (F-13).
- **AB-15:** PDF admission requires structural plausibility (startxref + obj/endobj +
  %%EOF); full semantic validation stays vendor-side — recorded boundary (F-12).
- **AB-16:** the freeze closure carries the workflow's BEHAVIORAL body
  (`documentIngest.behavior.mjs`; 8 frozen files); only infrastructure is injected —
  the chatTurn pools precedent, correctly scoped (F-02).
- **AB-17 (process/test notes):** the WDK world requires EXPLICIT bootstrap (CI runs the
  documented bin on its own throwaway; the ceremony runbook already carries it); the G5
  withdrawn-TB proof uses the net-total form (draft→withdrawn exists only via the
  correction, so per-account isolation is unstageable); intake chips say "Stored", never
  "Filed", pre-filing (MED-1); G8/max-across-filings distinctness + the closed-period
  block stay vacuous until the FY/close model (AB-4); review evidence of record is
  archived under `docs/plan/research/slice5/asbuilt-*.md`.
