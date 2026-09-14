# Wave-3 — 0020 census fixes for 0195's derived purpose (#631)

Worktree `clara-wt/integration3`, branch `integration/wave-3`, commit `eb98d0c6`
(on top of `20290665`, PR #818). Not pushed.

## Cell 1 — `packages/db/tests/wave-b/wb-0020-relation.test.mjs`

Test: `[0020 §1.2 / 0195 §1,§3 (#631)]: clara.client_egress_purpose_consents — purpose
NON-NULL (admits SIX purposes as of 0195, wiki_synthesis among them), evidence NON-NULL
for the five document-tied purposes and NULL exactly for accounting_work (0195's
derived-purpose arm, authority = legal_acceptance_id), scope_note non-blank, the 0011
paired revocation CHECK`.

Change: the old body asserted `evidence_document_id` was column-level `NOT NULL`. 0195
dropped that column constraint and replaced it with a purpose-discriminated CHECK
(`ck_client_egress_purpose_consents_evidence`) plus a new nullable `legal_acceptance_id`
column — evidence NOT NULL / acceptance NULL for the five original purposes, evidence
NULL / acceptance NOT NULL for `accounting_work`. Rewrote the structural half
(`is_nullable` now asserted `"YES"`, plus CHECK-def assertions naming `accounting_work`
and `legal_acceptance_id`) and added the two behavioural halves the brief asked for, by
raw INSERT (root, bypassing the RPC's own `accounting_work` refusal): a NULL-evidence
`wiki_synthesis` row still refused (23514), and an `accounting_work` row naming a real
`evidence_document_id` also refused (23514) — proving both arms of the new CHECK.

## Cell 2 — `packages/db/tests/wave-b/wb-0020-tail.test.mjs`

Test: `[0020 §8]: the four purpose-discriminated event types are registered — and 0020
registered NOTHING else AT 20 MIGRATIONS` (title kept — the body already carries the
gamma/beta widening precedent and now explains the 0195 one too).

Change: added a third gate, `w631Applied`, keyed on the migration's stable stem
(`version ~ 'work_egress_purpose_and_execution_trace$'`) matching the existing
gamma/beta idiom (never gated on the migration number). When applied, the exact-set
`expected` array now includes `egress.purpose_consent_derived` and
`egress.purpose_consent_restored` beside the four 0020 names, and a per-name existence
check is added for both. `PURPOSE_EVENT_TYPES` (the shared four-name vocabulary constant
used elsewhere, e.g. `wb-0020-events.test.mjs`) was left untouched — the two new names
are asserted locally in this cell only.

## Verification

- `node --test` on both files (exact `--import ./tests/*-preintegration-gate.mjs` flags
  from `packages/db/package.json` "test") against rig187 (127.0.0.1:55460, `clara_187`,
  FINAL 0195, 190 migrations, `work_egress_purpose_and_execution_trace` confirmed
  applied): **27/27 pass**, including both fixed cells (`ok 3`, `ok 16`).
- Grepped `packages/db/tests` for other cells pinning the purpose count at five, the
  evidence CHECK, or the egress event-type roster. Found and checked two more:
  `wave-a-0012-consent-optional.test.mjs` (the LEGACY `client_egress_consents` table,
  0011/0012 — unrelated) and `web-reads-and-doors.test.mjs` wr.4/wr.5
  (`clara.client_egress_state`, defined in 0174 and untouched by 0195 — still hardcodes
  the original five purposes, so it does not red). `wb-0020-events.test.mjs` only checks
  existence of the four 0020 names, not a closed set. No other fix needed.
- Root `pnpm lint`: exit 0 (packages/db, packages/runtime, apps/web, reporting-render
  all green).

Worktree left clean; one commit, not pushed.
