# F-A1 corpus measurement — as-run report (2026-08-20)

**The PR-3 gating obligation** (design annex C: "the 29-document capture set re-run;
corroboration rate MEASURED vs the deterministic baseline; the wrong-party set is gating").
Run live, post-cutover, real model calls on the Fly runtime. Population widened from the
historic 29 to **all 64 BELCORT invoice-kind documents** with a done legacy extraction (the
population the cutover now owns); the owner stopped the tail at N=33 measured ("A2 re-runs
it anyway" — 24 stopped through the audited claim→fail door, code `internal`, op
`operator-stop-fa1-corpus`).

## Headline

| Metric | Witness regime | Legacy (Azure) baseline |
|---|---|---|
| Corroborated (unattended-post ticket) | **0 / 33** | 28 / 92 |
| Field capture (id/date/total/party) | clean on every measured doc | clean |
| Model-call failures | **0 / 69 calls** (~405k tokens total) | — |
| D12 wrong-party false positives | **0** (gate PASSES; identity stays) | — |

## Why zero — the two binding conjuncts (both named, neither a bug)

1. **The NIL-TAX LAW** (0092, inherited verbatim from 0023): `tax_total`/`total_excl_tax`
   must be PRINTED values. The real corpus is dominated by tax-silent service invoices
   (non-SST issuers print one gross line). Both channels honestly answer `not_printed` →
   refusal. The legacy 28 corroborated only because **Azure inferred** SubTotal/TotalTax
   where nothing was printed — the witness is stricter because it is more honest.
2. **The type_code conjunct** (M12, NEW in the witness evaluator): explicit `'01'` required,
   absence never defaults. The frozen prompt asks "what code is printed" — paper invoices
   print no type code, so every channel answers `not_printed` and the conjunct can never
   pass. This is a **prompt-intent mismatch** (the question should be a classification —
   "what KIND of document is this" — which is what M12's "a witness reliably reports
   type_code" assumed). The corpus-tuning loop was designed to run pre-freeze (M8); the
   cutover sequencing ran it post-freeze — lesson recorded.

**Live impact until F-A2:** every invoice routes to the human-confirm draft lane
(fail-closed; Clara drafts, a human clicks). No data risk; a capability regression vs the
legacy 28 until the two F-A2 items land.

## Failure taxonomy (31 failed tasks)

- 24 × `internal` — the operator stop-sweep (not measurement failures).
- 7 × `internal` — infrastructure casualties of the run's own incident (below); **zero**
  model-level or evaluator-level failures.

## The incident the run exposed (F-A2 riders, all registered)

Driving 63 re-extractions at once exposed three real weaknesses:

1. **Reconciler thundering herd**: every sweep re-mints a run for EVERY queued task with a
   terminal prior run; on a 2-slot lane, ~46 runs/sweep die on CLR18 while their retries
   saturate the runtime's pg pool (heartbeat starvation, health-check flap). Fix: lane-aware
   pacing — mint at most (free lane slots) runs per sweep.
2. **Zombie pooler sessions after a hard restart**: the dead VM left 15 idle
   `clara_runtime_login` sessions in the Supabase session pooler, starving the new VM's
   connects entirely. Cure (now a runbook step): `pg_terminate_backend` on that login's
   idle sessions after any hard restart.
3. **No adapter timeout on witness model calls**: four calls hung 30-95 minutes, each
   wedging one of the lane's two slots (settled via `fail_witness_facts('internal')`). The
   timeout knob lives in the NON-frozen `witnessFacts.v1.services.mjs` by design (AB-16) —
   a one-line config PR, no new workflow version needed.

## Owner rulings taken during the run (2026-08-20, in-session)

- **The three-locks nil-tax arm is directionally ratified** ("可以"): tax unprinted →
  tax=0 corroborates only when (page coverage complete) ∧ (both channels answer
  `not_printed`) ∧ (no SST registration number printed on the document); receipt stamped
  "document tax-silent, presumed non-registrant". Parameters tune against this report.
  Ships as `evaluate_witness_fact_state_v2` + ceremony (F-A2 opener #1).
- **The type_code prompt-intent fix** ships as the witnessFacts prompt successor
  (F-A2 opener #2; prompts are frozen-by-decision M8, so this is a v2 + ceremony).
- Corpus tail stopped at N=33; the A2 re-measurement re-runs the corpus after both
  openers land — expected: every complete single-page gross-printed invoice corroborates.
