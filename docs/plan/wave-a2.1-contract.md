# Wave A2.1 contract — the eval finding ledger + the ADR-026 deferrals

**Status: DRAFT v0.9 — awaiting the owner grill; ratifies as v1.0 by ADR.**
Inputs of record: ADR-026 (deferrals) · ADR-027 (finding ledger + the ratified live-eval
doctrine) · the owner rulings of 2026-07-22 (purchase = visibility split; sales autopost =
all corroborated sales; ONE bundle) · `docs/plan/research/wave-a2.1/sst-registration-factsheet.md`
(statutory research, official sources; §6 = unverified list) · `codex-design-debate-sst.md`
(the cross-model adversarial design lane — its "refuse to ship" list is this contract's
acceptance floor) · the five-lane as-built grounding maps (session 2026-07-22).

## §0 Rulings

| # | Ruling |
|---|---|
| WA21-R1 | **Purchase SST = a VISIBILITY split, never a recoverable asset.** Malaysian SST has no input-tax credit (regime doctrine of record); the ADR-026 wording "input tax" is hereby corrected. A tied SST-portion-of-cost leg stays inside P&L expense via a NEW `special_acc_type` (never `sst_output`), count ≤ 1, tied exactly to the stated tax fact, **human lanes only — no autopost sanction in this wave**. |
| WA21-R2 | **Sales-direction autopost lifts for ALL corroborated sales** (owner override of the MyInvois-only recommendation) — but the OCR class ships ONLY inside the §3.3 compensating-control envelope (distinct evidence class, positive polarity evidence, hard direction evidence, multi-anchor corroboration, tighter bounds). Caller-selected `coding_kind` is never polarity evidence. |
| WA21-R3 | **The SST-threshold check is the Codex-shape hybrid**: a dedicated **non-blocking `compliance_watch`** object (NOT `open_questions` — that is a blocking gate via `_open_question_blocks`/CLR26), fed by an `entry.approved` event consumer + a daily repair reconciler, computing the **statutory month-end rolling test with earliest-crossing detection**, surfaced via the review queue (new `row_kind`) + a context-pack block. Nothing in it may ever move money or block an approval/autopost. |
| WA21-R4 | **ONE bundle** (owner ruling): all seven ledger items ride this wave — but the build train sequences the live-invariant items first (§7 reconciler wiring, §6 hydration fix) so their exposure window is shortest. |
| WA21-R5 | **Turnover classification is tri-state and effective-dated** (`included` / `excluded` / `unknown_or_mixed`; missing = `unknown_or_mixed`, never excluded); thresholds come from an **effective-dated service-group schedule** (versioned reference data), not a free-editable per-client number; watch-lowering changes (→excluded, exemption, override) are admin-approved audited actions with effective date + reason + evidence. |
| WA21-R6 | **The future method is human-attested or `not_assessed`** — never inferred from ledger trends, never displayed as "below threshold" when unassessed. Attestations carry amount, horizon, evidence, reviewer, as-of + expiry; expiry re-arms the watch. |
| WA21-R7 | **The doc-type classifier is a dependency of the OCR-sales autopost lane** (§3.3 control 2) and gates the facts engines (§5). Classification uses the existing chat-model lane over already-extracted layout text (no NEW egress class); XML stays rule-classified. `persist_invoice_facts` stops stamping `document_kind` unconditionally (only-if-null). |
| WA21-R8 | **Freeze law holds**: every behavioural prompt/tool change ships as new frozen versions (`chatTurn_v6`, `autoDraft_v2` where touched) + registry repoint + append-only manifest; `_approve_entry_core`/floor changes are same-arity CoR migrations (0016+) with tail assertions maintained, throwaway-validated before live. |

## §1 Scope (seven items) + non-goals

1. **SST registration-threshold structural visibility** (§2) — the headline.
2. **Sales-direction autopost + credit-side sightings** (§3).
3. **Purchase-side SST visibility split** (§4).
4. **Doc-type classifier gating the facts engines** (§5).
5. **`je_review`/`doc_review` terminal-state hydration fix** (§6.1).
6. **Direction-aware vocabulary on customer flows** (§6.2).
7. **Ops pair: `reconcile_autopost_rules` runtime wiring + modern rclone in the backup image** (§7).

**Non-goals:** SST-02 returns engine, payable settlement, registration filing (Wave F);
the intra-group 5% de-minimis **computed** watch (v1 records the exemption analysis as
evidence on the watch case; the computed forward monitor is a recorded Wave-F candidate);
CN autopost (explicit skip, §3.2); autopost sanction for the purchase SST leg (WA21-R1);
any MyInvois API pull/issuance.

## §2 The SST registration watch (WA21-R3/R5/R6)

### 2.1 Data plane (migration 0016)

- **`clara.sst_threshold_schedule`** — effective-dated service-group reference rows
  (`service_group` e.g. 'G','I'; `threshold_cents` 50_000_000; `effective_from/to`;
  `source_note` citing the Act/guide). Seeded from the fact-sheet; system-maintained
  (migration-shipped), not firm-editable.
- **`clara.client_turnover_accounts`** — effective-dated tri-state classification per
  (client, account_code): `included`/`excluded`/`unknown_or_mixed` + `service_group`,
  `reason`, `evidence_note`, `set_by`, effective dates. Missing row ⇒ `unknown_or_mixed`.
  Writers: bookkeeper+ may propose/make-more-conservative; admin+ (audited fn, op_key)
  for anything watch-lowering. Agent role: read-only (zero EXECUTE, as everywhere).
- **`clara.sst_future_attestations`** — human-owned future-method records (client,
  service_group, expected_cents, horizon, evidence, reviewer, as_of, expires_at).
- **`clara.compliance_watches`** + **`clara.compliance_watch_events`** — the durable
  per-(client, service_group) case: state machine
  `monitored → early_warning(≥80%) → crossed → overdue(app-deadline passed)` with
  audited transitions; `acknowledged`/`snoozed(bounded, dated)` as overlays that never
  erase the condition; `resolved` only with a typed conclusion + evidence (registration
  recorded / documented not-liable analysis). Append-only events = the disposition trail
  (who/when/figure-at-moment/schedule-version/rationale). Partial unique index: one open
  episode per (client, service_group). `next_rearm_cents`/`next_rearm_at` stored — policy
  is data, not dismissal prose.
- **Evaluation fn** — `clara.evaluate_sst_watch(p_client)` (SECURITY DEFINER, runtime-
  granted only): calendar-month windows (month + 11 preceding), `credit-debit` over
  approved entries joined to the classification, **recomputed at every month-end since
  ledger coverage start → EARLIEST crossing**, exact statutory boundary (**"exceeds": RM
  500,000.00 is NOT crossed; 500,000.01 is**); emits confirmed-included, unknown_or_mixed,
  and the all-income screening proxy as SEPARATE figures + coverage flags (opening-balance
  entries excluded from observed turnover and surfaced as missing-history; future-dated
  entries excluded; reversal mirrors included; `is_year_end` handled via a typed
  closing-transfer classification, not a blanket exclusion). Backdated postings that move
  the earliest crossing re-arm the watch. Append-only **evaluation receipts** (clients
  examined/changed/failed, event seq, schedule version, timestamps) — a stale evaluator
  is itself a visible condition.
- **Supporting index** (required, EXPLAIN-evidenced on realistic volume):
  `ix_je_client_approved_posting on journal_entries(client_id, posting_date, id) where status='approved'`.

### 2.2 Evaluation triggers

- **Authoritative:** a spine consumer on **`entry.approved`** (post-commit; the pattern
  of `matcher.mjs`/`autodraft.mjs`) evaluates that client. (`execute_rule_post` drives the
  same core → same event; keyed off `entry.approved` only to avoid double work.)
- **Repair belt:** a **daily reconciler** sweep (beside the §7 reconcile wiring) re-evaluates
  all clients — catches missed events, pre-existing crossings at deploy, backdating,
  reversals, classification/schedule changes, expired attestations, deadline escalation.
- **NOT in `_approve_entry_core`**: no rolling scan on the approval hot path (it holds the
  client advisory lock; `execute_rule_post` additionally holds the rule row FOR UPDATE).
  At most a cheap exception-isolated dirty-client hint if latency ever demands it.

### 2.3 Surfaces (the unmissable part)

- **Review queue:** `list_review_queue` unions the open watch as `row_kind='compliance_watch'`
  (never a monetary figure inside the integer `counts`) + a client-keyed compliance summary;
  dashboard renders an OpenQuestionCard-like **ComplianceWatchCard** — persistent banner at
  `early_warning`, top-of-queue at `crossed`/`overdue` with acknowledge-requires-rationale.
- **Context pack:** `get_context_pack` gains an `sst_registration_watch` block (schema
  version bump + tests): status, the three figures with basis labels, window, earliest
  candidate crossing month, `future_method_status`, coverage/verification flags,
  `evaluated_at`, and `permitted_use: surface_and_request_professional_review_only`.
  Framed as a **DB-computed screening estimate** — the agent may quote it only with basis
  + verification status; it must never present it as a legal determination, multiply by
  8%, compute tax due, or infer registration status. (Prompt framing rides `chatTurn_v6`;
  the dashboard renders the qualification independently of the model.)
- **Deadline engine:** on `crossed` in month M the case carries the statutory countdown —
  application due last day of M+1 (s.13(1)), tax chargeable ~first day of M+2 (s.13(3)) —
  with citations, plus the growing retroactive-exposure figure that makes lateness concrete.
- **Registration status is sticky human-recorded state** (s.18–20: no auto-deregistration);
  a sustained dip may raise an advisory note, never a status change.

### 2.4 Hard nots (Codex Q5, all designed out)

Never blocks approval/revise/reverse/autopost/close · never writes journal entries, legs,
balances, rules, flags, or registration state · no automatic SST leg / rate application /
SST-02 / filing / external message · agent writes nothing (no threshold, forecast,
classification, exemption) · evaluator or notification failure never rolls back an approval
· resolve/dismiss touches only the watch case.

## §3 Sales-direction autopost + credit-side sightings (WA21-R2)

### 3.1 Credit-side sightings (prerequisite, same migration)

`rule_sightings` gains `side ('debit'|'credit')` (backfill 'debit'; uniqueness widened to
include side) **in the same migration** as the `_approve_entry_core` CoR that records
credit-leg sightings (income-class credit legs on approved, unreversed, non-rule-checked
entries; the H2 rules-can't-breed-rules carve-out and reversal guard verbatim). The
3-sighting vendor_account auto-proposal stays debit-scoped; all sighting-floor queries
become direction-aware. (Preserves the adversarial-#12 ruling: no direction-scoped
uniqueness on `coding_rules` — direction follows counterparty kind.)

### 3.2 The lift

New migration CoRs `propose_autopost_rule` + `sign_autopost_rule` to accept
`direction='sales'` for the **structured (MyInvois) class** under the existing bounds, and
for the **OCR class only per §3.3**. `execute_rule_post`'s existing sales branches carry
the posting (rig-proven; re-proven on throwaway + live-eval before any live rule).
**`sales_credit_note` is explicitly non-autopostable** — the incidental control-shape skip
becomes a named skip reason (`cn_not_autopostable`). Dashboard rules surface + reviewApi
gain the sales direction + credit-sighting counts. Same bounds as purchase for structured
sales (monthly / ≤3 posts / 12-month expiry / cap ≤ firm high-stakes).

### 3.3 The OCR compensating-control envelope (Codex Q6, all nine adopted)

1. Distinct **`ocr_sales` evidence class** bound into the signed rule + content hash —
   inherits nothing from structured or purchase rules.
2. **Positive polarity evidence** independent of caller-selected `coding_kind`: the §5
   classifier's verified kind (or an explicit human type attestation). No OCR CN/self-billed
   autopost ever.
3. **Hard direction evidence**: supplier TIN/BRN + name/alias match to the client;
   buyer must not resolve to the client; name-only direction stays human.
4. **Full multi-anchor corroboration**: total + invoice number + date + explicit net and
   tax (explicit zero, not missing) + exact `net+tax+rounding=gross` + a second independent
   numeric anchor (amount-due or line arithmetic).
5. **Existing resolved customer only** — no counterparty birth in this lane.
6. **≥6 qualifying human-approved OCR-sales sightings** across distinct documents/invoice
   numbers and a meaningful time span; overrides + rule-posted outputs excluded; two
   checkers where the firm has them, **solo-attest where it does not** (Gate-1 pattern).
7. **Tighter bounds**: lower per-entry cap, a cumulative window-**cents** cap alongside
   count, shorter expiry, smaller window count (exact numbers = grill item G2).
8. `execute_rule_post` re-derives every control at post time (no trust in signing-time state).
9. Ambiguity ⇒ visible skip + draft stays for human review; repeated direction/type
   failures suspend the OCR rule pending re-signature.

## §4 Purchase-side SST visibility split (WA21-R1)

New `special_acc_type` (working name `sst_purchase_cost`, expense-typed so the
expense=gross tie survives verbatim) widened into the 0015 CHECK; `_assert_supplier_bill_shape`
converts the outright sst refusal into an optional **tied** leg (≤1, = stated
`invoice.tax_total` from `_invoice_fact_state`) — answering the FIX-2 item-7 laundering
revert with count+tie+corroboration; `sst_output` stays sales-only in all three pinned
places (tail assertions consciously superseded where wording must change). Executor: **no
purchase sanction this wave** — a purchase draft carrying the new leg is simply not
autopostable (visible skip). `onboard-rpr.mjs` `SPECIAL_TYPES` fixed to include
`sst_output` (already stale — the ADR-027 #44 class repeats) + the new type. Prompt
guidance (3-leg purchase coding when facts show tax) rides `chatTurn_v6`/`autoDraft_v2`.

## §5 Doc-type classifier gating the facts engines (WA21-R7)

- New `document_processing_tasks` lane **`classify`** (lane↔engine CHECK per the 0015
  pattern), enqueued after layout/structured extraction completes; engine snapshot
  `clara-classify-llm:v1` + model in `engine_config`; verdict persisted as a
  `document_extractions` row (`engine_kind='doc_classify'`, outside the AB-3 exemption
  set) + `documents.document_kind` set via a new audited `clara.classify_document(...)`
  (DEFINER, runtime-granted; agent role: nothing).
- Taxonomy = the existing 18-value CHECK; XML stays deterministically `e_invoice_xml`.
- **The facts gate** (`_enqueue_invoice_facts_core` CoR, consent-evidence branch preserved
  verbatim per the 0014 tail assert): `invoice/credit_note/debit_note` + pdf/image →
  `invoice_facts`; xml → `local_facts`; other kinds → `skipped_kind` receipt; **NULL kind →
  classify-first with the existing attempt-cap/failed-task pattern** (never strands a doc).
- `persist_invoice_facts` stamps `document_kind` **only-if-null**.
- Low-confidence classification opens a review question (ADR-023 lane); humans may
  override kind via the audited fn; misclassification is a visible exception in the
  documents surface (PM-rigor).
- **Backfill:** the live docs mis-stamped `invoice` (the eval JVs) are re-classified via
  the audited fn during the deploy ceremony — grill item G3 confirms.

## §6 Dashboard fixes

**6.1 Terminal-state hydration:** 0016 CoRs `get_draft_review` to return a slim settled
payload on the **human lane** (wake/agent lane behavior unchanged); `toDraftReview(null)`
stops fabricating `status:'unknown'`; `JeReviewCard` + `DocReviewCard` render a true
terminal receipt keyed on hydrated status (approved/withdrawn wording), honest
"settled/no-longer-accessible" fallback.

**6.2 Direction-aware vocabulary:** the queue envelope gains `coding_kind` (DB extension);
`toDraftReview` maps it; "NEW VENDOR" chip, `LANE_REASON_COPY` (`vendor_unresolved`),
CLR21 copy and sibling strings become direction-aware (vendor/customer). Full site
inventory = the grounding map (session evidence).

## §7 Ops pair

- **`reconcile_autopost_rules` wiring** (FIRST in the build train — live-invariant gap):
  the runtime reconciler loop calls it on the daily cadence; receipts logged; rig test
  proves expiry/nudge fire.
- **Modern rclone** in `packages/backup` image (replace Debian 1.60 with the current
  release binary) — kills the first-attempt-501 noise; dry-run + a supervised live run
  re-verify (§9 DR runbook unchanged).

## §8 Invariants preserved

The four structural invariants unchanged (attribution ≥0.95; provenance binding; wake
allowlists — the new consumer/reconciler fns are runtime-granted DEFINERs, nothing enters
the wake allowlist for the agent; write authorization — **the agent role gains ZERO
EXECUTE anywhere in this wave**). The DB owns every number (rolling sums, crossings,
caps, ties — all DB-computed; the model only narrates labeled figures). The six-round
anti-laundering posture is preserved and EXTENDED by §3.3. Workflow bodies immutable
(WA21-R8). Reverse-not-delete untouched. The compliance watch can never block or post
(§2.4) — visibility-as-safety, structurally.

## §9 Verification + the live eval (the wave closes ONLY here — ADR-027 doctrine)

**Rig batteries (contract-blind lanes per house pattern):** watch-boundary tests (RM
500,000.00 vs .01; earliest-crossing with backdating; re-arm ladder incl. +10pp and
expired attestation; coverage/opening-balance; evaluator-failure isolation; RLS);
credit-sighting + direction-aware floor tests; OCR-envelope tests (each of the nine
controls fail-pre/pass-post); purchase-split tie tests; classifier-gate tests (JV
payroll-summary never reaches invoice_facts); hydration tests; reconcile wiring test.

**Live eval gates (owner-driven, on live books):**
- **Gate W (the headline):** onboarding RPR's turnover classification + running the
  evaluator over the real 2025–26 books raises the watch with the **correct earliest
  crossing month (~June-2025 per ADR-027)** and the correct rolling figures to the sen;
  the card + queue banner + context-pack block all show it; the agent, asked an unrelated
  coding question, **surfaces the watch unprompted** (the §9-A2 assertion, now structural);
  acknowledge/snooze/re-arm exercised with the audited trail; approvals + a purchase
  autopost run **while the watch is open** (nothing blocks).
- **Gate S:** a structured (MyInvois) sales rule proposed→signed→posts a real invoice
  within bounds; an OCR sales draft **without** classifier polarity evidence is skipped
  visibly; CN draft skips `cn_not_autopostable`.
- **Gate P:** a supplier bill with stated tax books the 3-leg visibility split tied to the
  sen; TB ties.
- **Gate C:** a re-filed payroll-summary JV classifies correctly, invoice_facts does NOT
  run, `document_kind` populated + backfill applied.
- **Gate D:** settled cards render terminal state after reload; customer flows show
  customer vocabulary.
- Boundary/failure drills from the Codex refuse-list (exact threshold, dismissal/re-arm,
  evaluator-kill) run against the throwaway first, spot-checked live.

## §10 Grill items (owner, before v1.0)

- **G1:** Future-method attestation cadence — who records it and when (per-client at
  onboarding + on material mandate signings?), and the expiry default (12 months?).
- **G2:** The OCR-lane numbers: per-entry cap (suggest ≤ RM10k?), cumulative window cents
  cap, expiry (6 months?), window posts (2?) — your risk appetite, my suggestions attached.
- **G3:** Backfill ruling — re-classify the six mis-stamped eval docs live (recommended) or
  grandfather.
- **G4:** The eval-gate list above — approve/amend (it is the wave's definition of DONE).
