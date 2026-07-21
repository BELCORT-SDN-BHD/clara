# Migration 0015 — Wave A2 DB design companion (DRAFT v0.3 — BOTH design reviews folded; the adversarial review superseded the engine-class gate with the `local_facts` lane + LANE-keyed gate + lane↔engine CHECK)

Companion to `wave-a2-ar-myinvois-contract.md`. Ordered plan for `0015_ar_myinvois_rules.sql`;
the build lane writes the SQL. House CoR law applies throughout (same-arity `create or replace`
under `set role clara_fn_owner`, ACLs preserved, tail `do $$` assertions, throwaway-validated).
**Never change arity** — new inputs ride existing jsonb params.

## Ordered sections

**S0 — AB-3 first.** Re-run the 0011 AB-3 probe (the pin must hold before any vocabulary work);
add the field_path collision assertion for every NEW vocabulary key: none of the facts-pass keys
may match `%tin%`/`%ssm%`/`%account%` unless deliberately attribution-bearing
(`myinvois.supplier_tin`/`supplier_brn` are the ONLY intended matches, and they live in the
`structured_parse` identity pass). `invoice.customer_taxid` naming is load-bearing (avoids
`%tin%`); assert it. **This assertion is PERMANENT (review L5): every future migration touching
the facts vocabulary re-runs it, and a mapper-level unit test mirrors it** — the AB-3 boundary
is the naming convention, so the assertion is its only enforcement.

**S1 — CHECK widenings (table-owner role, outside fn-owner):**
- `counterparties.kind` → `('vendor','customer')`.
- `coa_accounts.account_class` → `(null,'payable','receivable')`.
- `journal_entries.coding_kind` → `(null,'supplier_bill','sales_invoice','sales_credit_note')`.
- `journal_entry_revisions.actor_kind` → `+ 'rule'`.
- New `journal_entries.checked_via_rule_id uuid null` (FK coding_rules) + extend
  `_tf_entry_immutable` allowsets (draft→approved may set it).
- `document_kind` needs no change (`e_invoice_xml` reserved since 0007). No new `engine_kind`
  values. **ONE new lane value (adversarial #1): `document_processing_tasks.lane` CHECK gains
  `'local_facts'`** — the MyInvois facts pass must never share `lane='invoice_facts'` with the
  frozen Azure consumer (dispatch is lane-based + engine-blind). **NEW lane↔engine CHECK
  (adversarial #2):** `lane in ('ocr','invoice_facts') ⟹ engine_id like 'azure-%'`;
  `lane in ('structured_parse','local_facts','none') ⟹ 'clara-%'` — refuses a mis-declared
  task at INSERT. **PROBE P1 FINDING (load-bearing build item): the CHECK rejects
  `finalize_document_intake`'s own `p_engine_id default 'fixture-engine'` (0007:1977) and every
  rig fixture that relies on it** — the seeded DB carries no violating task rows (the ALTER
  applies clean) but the default + fixtures fail at first insert. 0015 must retire the
  `fixture-engine` default (make the caller pass a real engine snapshot; rig fixtures move to
  `clara-fixture:v1` admitted under the local arm or an explicit test-namespace carve-in — the
  build lane picks, the rig proves).
- `special_acc_type` CHECK gains `'sst_output'` (adversarial #10; `uq_coa_special` already
  enforces at-most-one per (client, special type) — verify it covers the new value).

**S2 — counterparty uniqueness kind-scoping.** Drop + recreate
`uq_counterparties_client_registration` / `uq_counterparties_client_unregistered_name` with
`kind` in the key (partial predicates unchanged otherwise). Pre-assert no existing rows violate
(all live rows are `kind='vendor'` — vacuously safe).

**S3 — coding_rules posting tier.**
- ALTER: widen `rule_type` CHECK → `('vendor_account','autopost')`; add `amount_cap_cents bigint`,
  `frequency_window text`, `window_max_posts int`, `expires_at timestamptz`, `direction text`,
  `supersedes_rule_id uuid` (self-FK). Tier CHECK: `autopost` rows require ALL bound columns NOT
  NULL (+ `direction in ('purchase','sales')`); `vendor_account` rows require them NULL.
- One-live: the EXISTING `uq_coding_rules_one_live_vendor (client, counterparty, rule_type)
  where status='live'` already enforces one live autopost per counterparty (adversarial #12 —
  no new index; direction follows the counterparty's kind).
- Bound-immutability trigger: UPDATE on a live autopost row may touch ONLY status/retirement
  columns; bounds frozen (widening = supersede, WA2-R9).
- ~~Sign-time cap-growth rate limit~~ — **DROPPED (WA2-R12 as resolved): no rate limit in
  `sign_autopost_rule`; retire-old + fresh-admin-signature per widening is the control.**
- `sign_autopost_rule(p_rule, p_op_key)` — **admin+ floor** (`_human_ctx(role_rank('admin'))`),
  distinct from `sign_coding_rule` (bookkeeper+, untouched). `propose` path: extend the
  approve-time auto-proposal machinery with the posting tier's shape **as resolved by WA2-R12:
  the proposal DECISION is the agent's high-confidence professional judgment (runtime side,
  advisory; KB-informed post-Wave-B), the DB enforces only the structural floor — a proposal
  must cite ≥3 congruent human-approved unreversed sightings, and the sighting pool filters to
  HUMAN-checked entries only** (`checked_via_rule_id is null` — review H2; WA2-R9 made
  structural). Confidence rationale recorded in the proposal payload. No time-window column;
  no cap-growth rate limit. Human-author path `propose_autopost_rule` (bookkeeper+ may author;
  only admin+ signs).
- Expiry sweep `reconcile_autopost_rules()` (runtime reconciler-called, like
  `reconcile_sweep_runs`): expired live → `retired` (reason `expired`) + notification; ¾-term
  non-use nudge.

**S4 — rule_post surfaces.** `rule_post_runs` (receipts: rule_id, entry_id, posted_at,
acknowledged_by/at; agent-ack refusal mirror of CLR03) + `rule_post_skips` (entry_id, rule_id,
reason, at). `acknowledge_rule_posts(p_run_ids uuid[], p_op_key)` bookkeeper+ floor.
Typed event `entry.rule_posted`.

**S5 — the approve core split + `execute_rule_post`.**
- Refactor `approve_entry`'s body into private `_approve_entry_core(ctx jsonb, ...)`; PUBLIC
  surface `approve_entry(uuid,uuid,text,text)` unchanged (same arity, same grants, byte-identical
  behavior for human callers — rig exact-diff proof). **ONE declared behavioral carve-out inside
  the core (review H2): the sighting/auto-proposal block (0011:3157-3192 as-built) runs ONLY when
  the approval is human (`checked_via_rule_id is null`)** — rule-posted approvals write NO
  sighting and trigger NO proposal (probe P10).
- `execute_rule_post(p_entry uuid, p_op_key text)` DEFINER:
  **matches the LIVE autopost rule DIRECTLY** (client + counterparty + direction, status='live',
  `for share`) — NO dependency on a pre-written `rule_decisions` row (review H1: as-built,
  decisions are written only for `vendor_account` and unique per (entry,revision) — the
  decision-citing shape can never fire). **Opens with `SELECT … FOR UPDATE` on the matched
  `coding_rules` row** (adversarial #4 — count-and-post atomic per rule). ALL eligibility
  RE-DERIVED in-fn against live rows (review H4): `account_matched` DIRECTION-AWARE
  (purchase⇒debit side, sales⇒credit side — adversarial #6); the WHOLE-ENTRY constraint (every
  non-control non-rounding leg = the rule account — adversarial #5); NOT `is_high_stakes`
  (re-check `0009:1513` hard); total ≤ cap; window count < max under the row lock; unexpired
  NOW; revision current. Writes a rule snapshot row AT POST TIME for the audit join.
  Then → `_approve_entry_core` with rule context: `checker_actor = rule.signed_by`,
  `checked_via_rule_id = rule.id`, attestation NULL, full predicate wall inherited (CLR21/25/26,
  consent, shape floors, dup). Gate failure → `rule_post_skips` row, return skip (never raise).
  **Wrap the core call (review M2):** benign race exceptions — CLR10 (not-a-draft: concurrent
  human approve/withdraw) and CLR06 (stale revision: facts rotated) — convert to
  `rule_post_skips` rows; any other exception propagates. Idempotent op-key
  `rulepost:<entry>:<revision_token>`.
- **Grants:** login-direct to `clara_runtime_login` ONLY (the `record_rule_resolution` pattern);
  tail asserts NOT executable by `clara_runtime`, any wake role, `clara_agent_ro`,
  `clara_authenticated`, PUBLIC. **`_approve_entry_core` gets the SAME lockdown (adversarial
  #7): `revoke all from public` + tail-assert ZERO grants** (the `_open_question_core`
  precedent, 0011:1960-1961). Tail also asserts a human approve leaves `checked_via_rule_id`
  NULL (adversarial #11).

**S6 — facts vocabulary + writers.**
- **NEW attribution write-gate in `persist_document_extraction` (adversarial #3, CoR):** for
  `engine_kind='structured_parse'`, any region whose field_path matches
  `%tin%`/`%ssm%`/`%account%` must be ON the DB attribution allowlist
  (`myinvois.supplier_tin`, `myinvois.supplier_brn`) — else REFUSE (CLR10 family). Makes the
  buyer-exclusion structural, not naming discipline. OCR lane untouched (inherited residual,
  recorded).
- `persist_invoice_facts` CoR: accept `t.lane in ('invoice_facts','local_facts')`; whitelist +=
  the §3.2 keys; monetary set += `total_excl_tax`, `tax_total` (breakdown amounts validated
  inside the serialized value by the DB tie-check, not cents-normalized per-row in v1);
  engine_id taken from the TASK row (assert Azure snapshot on `invoice_facts`,
  `clara-myinvois:v1` on `local_facts` — no more hardcode); document_kind stamp branches
  (`invoice` for Azure tasks, `e_invoice_xml` for the MyInvois lane). AP/Azure path
  byte-identical (rig exact-diff).
- `_enqueue_invoice_facts_core` CoR: `application/xml` docs enqueue a **`lane='local_facts'`**
  task with `engine_id='clara-myinvois:v1'` (adversarial #1 — NEVER `lane='invoice_facts'`,
  which the frozen Azure consumer claims; pdf/image → Azure `invoice_facts` unchanged);
  consent_evidence exemption unchanged.
- `claim_document_processing_task` CoR (**security-critical, cross-model review mandatory**):
  **the gate stays LANE-keyed** (adversarial #1/#2 superseded the engine-class idea — dispatch
  is lane-based + engine-blind, engine_id a free intake param): kill-switch holds
  `lane in ('ocr','invoice_facts')`; consent holds `invoice_facts` (unchanged); local lanes
  (`structured_parse`,`local_facts`,`none`) claim without either hold — freeing
  `structured_parse` is a DECLARED change from as-built conservatism (it has never egressed),
  and the consent scope change is **owner-gated — review M1, delta-ratification item**. The S1
  lane↔engine CHECK refuses mis-declared tasks at insert. OCR/Azure behavior byte-identical;
  reconciler re-drive follows lanes. Probe P9 proves lane separation end-to-end.
- `_invoice_fact_state` CoR: read the latest done facts extraction across BOTH facts lanes
  (structured Tier-A applies to `local_facts` rows).
- `_invoice_fact_state` CoR: structured Tier-A (§3.5 arithmetic tie) + sales-side fields —
  **stays client-agnostic and same-arity** (review H3); the OCR path byte-identical (rig
  exact-diff on the RPR polygon corpus — review M3). NEW private helper
  `_document_direction(p_document uuid, p_client uuid)` computes direction (client-identity
  match, CLR30 `direction_unresolved`); the client-aware callers branch on it.

**S7 — AR books.**
- `_resolve_counterparty` CoR: `p_proposal` gains `kind` (default `'vendor'`) — same arity;
  resolution + birth scoped per kind. **ATOMICITY (review M5): the kind filter lands in EVERY
  lookup block (~5, 0011:1375-1428) AND both `approve_entry` hardcodes (birth `kind='vendor'`
  0011:3039-3041; payable-only counterparty stamping 0011:3057-3067 → payable OR receivable) in
  this same migration** — no intermediate state where a customer proposal can resolve to a
  vendor row.
- `_draft_entry_core` CoR: `sales_invoice`/`sales_credit_note` branches (document + customer
  proposal + evidence required; CN polarity).
- New `_assert_sales_invoice_shape` + constraint trigger; generalize the control-class
  counterparty rule (receivable OR payable line ⇒ counterparty_id, CLR23 preserved).
  Tie equations pinned per the contract §4.3 (01/03 vs 02 polarity); the tie evaluates on
  STATED FACTS ordered before the generic ≤5-sen rounding append (adversarial #9 — a tax
  mismatch surfaces `tax_tie_failed`, never silent rounding); SST legs discovered via
  `special_acc_type='sst_output'` (adversarial #10); `sst_account_missing` / `tax_tie_failed`
  refusals.
- `merge_counterparties` CoR (adversarial #8): ALSO retire the merged party's live `autopost`
  rule (+ optional proposed successor on the survivor) — posting authority never dangles on a
  retired identity.
- `approve_entry` core: birth `kind` per coding_kind; **sales duplicate = a HARD approve-time
  refusal** (customer + invoice_id, fallback customer+date+total; CLR21 family,
  override-flagged like `duplicate_bill` — review L3), plus the lane reason.
- `_coding_lane_core` CoR: direction branch; sales lane reads customer facts.
- `get_doc_entry_diff` CoR: receivable branch.

**S8 — tail assertions.** AB-3 probe + collision; every CoR'd fn: body-contains marker, zero
PUBLIC, pre-existing grants intact; `execute_rule_post` isolation matrix; the tier CHECK
round-trips; upgrade drill parity (fresh vs 0014→0015).

## Deploy artifacts (not in the migration)
- `deploy/rpr-coa.csv`: + `300-000 TRADE DEBTORS,asset,receivable,,system_role` row
  (owner-signed; re-run `onboard-rpr.mjs` — idempotent). SST-payable NOT added for RPR.
- Runtime: `laneSnapshot` xml→structured_parse **with a MyInvois engine snapshot branch**
  (`clara-myinvois:v1`, NOT the generic `clara-structured:v1` — review L7);
  `structured-worker.mjs` UBL branch (identity-pass emit); **a NEW `local_facts` consumer on
  the matcher pattern (plain non-frozen lib — supersedes the v0.2 services-router idea per
  adversarial #1): claims `lane='local_facts'` tasks, runs the UBL facts parse in the worker
  thread, calls `persist_invoice_facts` — NO frozen file on this path; the reconciler +
  `startWorld` route the new lane to it, and the frozen `invoiceFacts_v1` route is untouched
  (hash-diff in CI)**; MyInvois facts mapper; Azure mapper v5 (Customer*/SubTotal/TotalTax);
  the rule-post spine consumer (matcher pattern) + reconciler hooks; `/ready` extensions; the
  L6 nudge delivery via `record_notification` + the /queue rules surface.
- Dashboard: structured-doc view; `rule_post_receipt` part; rule sign/manage rpc surface.

## Errcode allocations
CLR30 `direction_unresolved`; reuse CLR10 (`sst_account_missing` — account-discovery family),
CLR21 (`tax_tie_failed` — amount-conflict family), CLR27 (autopost rule lifecycle refusals),
CLR03 (agent-ack refusal), CLR05 (high-stakes refusal — unchanged surface).
