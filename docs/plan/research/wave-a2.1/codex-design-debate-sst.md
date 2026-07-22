# Design memo — SST registration-threshold visibility

## A. Recommended shape

Ship an **async-first hybrid with a dedicated nonblocking compliance-watch object**.

Do not implement Candidate 1 literally. In the current schema, a client-scoped `open_questions` row is a hard workflow gate: [`_open_question_blocks`](/C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0011_daily_loop.sql:1438) returns every open client question, and [`_approve_entry_core`](/C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0015_ar_myinvois_rules.sql:1362) raises `CLR26`. Since [`execute_rule_post`](/C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0015_ar_myinvois_rules.sql:1754) calls the same core, the first SST warning would stop both human approvals and auto-posts client-wide.

Recommended sequence:

1. Add a deterministic DB function that computes the historical-method screening result from approved books.
   - Use calendar months: current month plus the preceding 11 months—not a 365-day cutoff.
   - Compute `credit_cents - debit_cents`.
   - Recompute every relevant month-end to find the earliest crossing, not only today’s rolling value.
2. Consume the existing `entry.approved` event after commit and evaluate that client.
   - `execute_rule_post` already causes `entry.approved`; key off that one event to avoid duplicate work from `entry.rule_posted`.
3. Add a daily full reconciler as the repair belt.
   - Catches missed events, deployment-before-existing-crossing, backdating, reversals, config changes, expired forecast attestations and deadline escalation.
   - Use a narrowly granted runtime `SECURITY DEFINER` function, following `reconcile_autopost_rules()`. No model wake is needed.
4. Persist:
   - current assessment;
   - append-only evaluation receipts;
   - a separate `compliance_watch` case with audited acknowledge/snooze/resolve actions.
5. Union `compliance_watch` into `list_review_queue` and render it with an OpenQuestionCard-like component, but never store it in `open_questions` or consult it from `_open_question_blocks`.
6. Add the cached assessment to `get_context_pack` as a secondary belt.

Keep the full scan out of `_approve_entry_core`. That function already holds a client advisory lock; `execute_rule_post` additionally holds the live rule row `FOR UPDATE`. A twelve-month scan there extends both serialization windows and trends toward O(N²) work as the ledger grows. If immediate signalling is needed, permit only an exception-isolated O(1) dirty-client upsert. The event consumer and daily reconciler remain authoritative.

For synchronous or evaluator scans, add and production-scale-test an approved/date index such as:

```sql
create index ix_je_client_approved_posting
  on clara.journal_entries(client_id, posting_date, id)
  where status = 'approved';
```

Require realistic `EXPLAIN (ANALYZE, BUFFERS)` evidence before putting even an indexed scan on an approval path.

## B. Per-shape failure modes

| Shape | Principal failures |
|---|---|
| Approve-time + belt | Hot-transaction latency; longer client/rule locks; swallowed failure becomes silent loss without repair; current-window scans miss historical crossings; config changes wait for another income approval; no future method; dismissal/re-arm ambiguity; literal client `open_question` blocks all subsequent posting. |
| Approve-time only | All of the above, plus no recovery from a single failed alert insert, no pre-existing-client scan, no deadline escalation, no stale-evaluator visibility, and no persistent warning after dismissal. Reject. |
| Async evaluator only | Event lag, stuck checkpoints, dead letters, scheduler death, duplicate at-least-once delivery and stale cached numbers. These are manageable with idempotency, run receipts, per-client error isolation and a daily checkpoint-independent repair sweep. |
| Recommended hybrid | Async evaluator is authoritative; daily sweep repairs operational rot; queue provides persistent human visibility; context pack gives the agent awareness; approve-time does at most a cheap dirty hint. |

Evaluator receipts should record clients examined/changed/failed, source event sequence, config version, started/completed timestamps and per-client `evaluated_at`. A stale evaluator must itself become visible.

Do not put the monetary figure inside `list_review_queue.counts`: those fields are integer row counts and the endpoint may cover multiple clients. Use `row_kind='compliance_watch'` plus a top-level client-keyed compliance summary.

## C. Q2–Q5

### 1. Taxable-turnover identification

“All income” is the safer initial **screen**, but it must never be labelled statutory taxable turnover. A single onboarding boolean is a durable false-negative switch and will rot.

Use effective-dated tri-state classification per income account:

- `included`
- `excluded`
- `unknown_or_mixed`

Missing rows default to `unknown_or_mixed`, never excluded. Expose separately:

- confirmed-included net turnover;
- unknown/mixed net turnover;
- all-income screening proxy;
- ledger coverage start and missing-history status.

Account-level classification remains coarse: one commission account can contain taxable, out-of-scope, intra-group and exempt transactions. Therefore even “confirmed” account classification remains a screening basis until transaction/service-level classification exists.

Other necessary controls:

- Exclude opening-balance entries from observed monthly turnover and surface the missing pre-onboarding history.
- Do not blindly exclude all `is_year_end` entries: that flag can cover both closing transfers and legitimate adjustments. Introduce a typed closing-transfer classification. Otherwise closing debits can erase revenue, while blanket exclusion can suppress genuine year-end revenue corrections.
- Include both originals and reversal mirrors; filtering originals by `reversed_by is null` can leave only the negative side. Preserve historical crossing evidence even if later credits reduce the current window.
- Exclude future-dated entries from an as-of historical evaluation.
- Inactive accounts remain classified historically.
- New income accounts create an `unknown` coverage condition automatically.

Authority:

- Agent/OCR: read-only.
- Bookkeeper: may propose or make a classification more conservative.
- Admin/owner: must approve any change that lowers the watch—`unknown/included → excluded`, exemption addition, threshold override—with effective date, reason and evidence.
- Near/crossed clients should preferably require a distinct reviewer; solo firms require explicit attestation.

Thresholds should come from an effective-dated, system-maintained service-group schedule. A freely editable client numeric threshold is an obvious silencing vector.

Also, do not implement one generic `exempt` switch. Current RMCD material treats B2B as an exemption from payment subject to conditions, while group relief is a different treatment and currently includes a 5% third-party tolerance—not simply “one external sale always evaporates relief.” Model legal effect, scope, evidence and effective dates separately. [RMCD B2B guidance](https://mysst.customs.gov.my/assets/document/Industry%20Guides/GI/Guide%20on%20Management%20Services%20%20V5%206.5.2026.pdf), [RMCD Group Relief Policy 8/2020](https://mysst.customs.gov.my/assets/document/Service%20Policy/STP%208_2020.pdf).

The future method cannot be inferred from ledger trends. Store a separate human-owned attestation containing expected amount, current-plus-next-11-month horizon, evidence, reviewer, as-of date and expiry. Without it, report `future_method_status='not_assessed'`, never “below threshold.” MySST confirms both historical and future methods; the Act sets the application deadline at the last day of the following month. [MySST registration guidance](https://mysst.customs.gov.my/registering-business/), [Service Tax Act 2018, ss.12–13](https://mysst.customs.gov.my/assets/document/SST%20Act/Service%20Tax%20Act%202018_b.pdf).

### 2. Re-arm semantics

Good compliance design separates:

- the detected condition;
- the human case;
- notification delivery.

Acknowledging a card must not erase the condition.

Recommended state machine:

- `<80%`: monitored.
- `≥80% and ≤ threshold`: early warning.
- `> threshold`: crossed review.
- Candidate application due date approaching/passed: escalated/overdue.
- Acknowledged: persistent banner remains; notifications are temporarily quiet.
- Resolved: requires a typed conclusion and evidence.

The statute says “exceeds,” so exactly RM500,000 is not the crossed state. Test RM500,000.00 and RM500,000.01 explicitly.

After acknowledgement or dismissal, re-arm when any occurs:

- 80% → crossed;
- another 10 percentage points of the statutory threshold are added;
- a backdated entry moves the first crossing earlier;
- the due-date state worsens;
- classification, service-group or threshold evidence changes;
- a bounded snooze—such as 30 days—expires.

Do not auto-resolve because the current rolling amount dips. The earlier crossing remains a professional-review fact.

Use a partial unique index to guarantee one open episode per client/service bucket, not one warning for the client’s lifetime. Store `next_rearm_cents` and `next_rearm_at`; do not infer policy from dismissal prose.

### 3. Context-pack belt

Include it, but do not call it the structural cure. The real cure is the deterministic persisted watch plus UI visibility. The model can still ignore fields.

The current context pack is schema version 2 and contains neither open questions nor SST status despite the target architecture. This is an explicit contract change in [`get_context_pack`](/C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0011_daily_loop.sql:3325); bump and test the schema version.

Suggested shape:

```json
{
  "sst_registration_watch": {
    "status": "early_warning|crossed|overdue|unknown|stale",
    "basis": "approved_book_income_screen",
    "confirmed_included_cents": 42000000,
    "unknown_or_mixed_cents": 9300000,
    "screening_proxy_cents": 51300000,
    "threshold_cents": 50000000,
    "window_start": "2024-07-01",
    "window_end": "2025-06-30",
    "earliest_candidate_crossing_month": "2025-06",
    "future_method_status": "not_assessed",
    "coverage_complete": false,
    "human_verified": false,
    "evaluated_at": "...",
    "evaluated_through_event_seq": "...",
    "permitted_use": "surface_and_request_professional_review_only"
  }
}
```

Framing: “DB-computed registration screening estimate from approved books; classification, exemptions, coverage and future-method expectation may require professional confirmation.”

The agent may quote it only with its basis and verification status. It must not:

- call it a legal determination;
- multiply it by 8%;
- compute tax due;
- infer registration status;
- imply exemptions were verified.

[`chatTurn_v5.ts`](/C:/Users/zhant/Desktop/clara-rebuild/packages/runtime/workflows/chatTurn.v5.ts:76) currently stringifies the whole context pack into the system message, so numeric anchoring is real. If prompt behaviour is changed to enforce the framing, that requires a new frozen workflow version. The dashboard should render the qualification independently of the model.

### 4. Anything that could move money or block work

Design out all of these:

- No `open_questions` row unless the ontology is explicitly split into blocking versus advisory. A separate table is safer.
- No call from `_assert_sales_invoice_shape`; it is a hard refusal surface and covers only document sales.
- No changes to journal entries/lines, AR balances, SST output accounts, `tax_affecting`, registration profile or invoice flags.
- No creation, widening or suspension of coding/autopost rules.
- No automatic SST leg, rate application, registration, SST-02 draft, filing or payment.
- No impact on draft, revise, approve, reverse, batch approve, close or `execute_rule_post`.
- No agent-written threshold, forecast, classification or exemption.
- Resolve/dismiss changes only the watch case—not books or configuration.
- `journal_entries.flags` remain excluded; this is client-scoped state.
- Notifications may deliver a reminder but are not authoritative state.
- Evaluator/notification failure must never roll back a legitimate approval.
- No external message or submission merely because a threshold state changed.

## D. Q6 — OCR sales-autopost compensating controls

The existing OCR `corroborated` signal is insufficient. In [`_invoice_fact_state`](/C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0015_ar_myinvois_rules.sql:725), OCR Tier A proves essentially a high-confidence polygon-backed total, MYR and due/deposit conditions. It does not prove document polarity. In [`_assert_sales_invoice_shape`](/C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0015_ar_myinvois_rules.sql:899), the positive type whitelist is inert when `type_code` is absent.

I would require:

1. A distinct `ocr_sales` evidence class bound into the signed rule and content hash. It must not inherit eligibility from structured UBL or purchase rules.
2. Positive polarity evidence independent of caller-selected `coding_kind`.
   - A verified document-type classifier or human type attestation.
   - No OCR credit-note/self-billed autopost without explicit corroborated type.
3. Hard direction evidence.
   - Supplier TIN/BRN match plus name/alias match to the client.
   - Existing name-only direction remains human review.
   - Buyer/customer must not resolve to the client.
4. Full sales corroboration, not total-only:
   - one total;
   - invoice number and date;
   - explicit net and tax, including explicit zero rather than missing;
   - exact `net + tax + rounding = gross`;
   - a second independent numeric anchor such as amount due or line/subtotal arithmetic.
5. Existing resolved customer only; no counterparty birth in this lane.
6. At least six qualifying human-approved OCR-sales sightings, across distinct documents/invoice numbers and a meaningful time span. Exclude overrides and rule-posted outputs; require two checkers when the firm has them.
7. A lower OCR-specific per-entry cap, a cumulative window-cents cap as well as count, shorter expiry and smaller window count.
8. Re-derive every control in `execute_rule_post`: exact control leg, signed revenue account, zero outside legs, bounded rounding, tied SST leg, gross tie, cap, window, expiry and live revision.
9. Any ambiguity produces a visible skip and leaves the draft for human review. Repeated direction/type failures should suspend the OCR-specific rule pending re-signature.

Without positive polarity evidence, “Tier-A polygon total + no type_code” remains manual review. Caller-selected `sales_invoice` is not evidence.

## E. Refuse to ship

I would refuse shipment if any of these remains:

- An SST warning is a client-scoped `open_questions` row under the current blocking predicate.
- The full twelve-month scan runs inside `_approve_entry_core`.
- Only today’s rolling window is evaluated; historical first crossing is ignored.
- There is no daily repair sweep, receipt or stale-evaluator signal.
- A missing taxable-account classification means excluded.
- A freeform threshold or exemption boolean can silence the watch.
- Opening-balance/mid-window coverage is hidden.
- Closing journals can erase turnover without an explicit closing-transfer type.
- Dismissal permanently suppresses later growth or deadline escalation.
- The future method is omitted or presented as assessed when it is not.
- An all-income proxy is labelled “taxable turnover” or “registration liability.”
- A context-pack amount lacks basis, as-of date, coverage, verification and staleness.
- Any active watch prevents human approval or `execute_rule_post`.
- OCR sales autopost relies on the current total-only `corroborated` boolean, name-only direction or caller-selected polarity.
- The live eval lacks: exact-threshold boundaries, backdated historical crossing, dismissal/re-arm, expired forecast, incomplete onboarding history, RLS isolation, evaluator failure, and successful human/rule approval while the watch remains active.

---
*Provenance: gpt-5.6-sol (xhigh reasoning), direct `codex exec` read-only over the repo, 2026-07-22 — the design-debate lane the owner directed for the Wave A2.1 SST-threshold check. Prompt: the three candidate shapes + as-built surfaces; this memo is the adversarial output that reshaped the design (notably the open_questions blocking-gate catch).*
