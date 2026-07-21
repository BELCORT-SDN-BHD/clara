# Wave A2 — Independent adversarial design review

**Reviewer lane:** adversarial / attack lens (assume ≥1 exploitable or money/egress-corrupting flaw and hunt it).
**Targets:** `docs/plan/wave-a2-ar-myinvois-contract.md` (DRAFT v0.1) + `docs/plan/wave-a2-migration-0015-design.md` (DRAFT v0.1).
**Rulings WA2-R1..R13 are FIXED** — I attack the design's *realization*, not the rulings.
**Method:** every claim live-verified against primary source (migrations 0004/0007/0009/0011/0012/0013/0014, `packages/runtime/**`). Briefs treated as maps, not truth. READ-ONLY; no live DB, no `~/.clara-*`, no network.

**Verdict: FLAWED.** At least one exploitable path (un-consented cross-border egress) plus two money-adjacent structural over-claims. All are design-stage fixable before build.

---

## The load-bearing chain (how dispatch, egress, and attribution actually bind)

Three facts from source drive most findings:

1. **The runtime dispatches document work by `lane`, never by `engine_id`.**
   - `reconciler-documents.mjs:36` `enqueueForLane(deps, lane)` → `lane==="invoice_facts" ? deps.enqueueInvoiceFacts : deps.enqueueDocumentIngest`; used at `:213`.
   - `startWorld.ts:115` `enqueueInvoiceFacts: (taskId) => start(workflows.invoiceFacts, …)` — the **frozen** Azure consumer.
   - `invoiceFacts.v1.behavior.mjs:55` calls `services.analyzeInvoice(...)` (Azure DI) for **any** claimed invoice_facts task; the claim receipt carries **no engine_id** (`docFromReceipt` :84-95 extracts `lane`, not engine_id), so the consumer *cannot* branch on engine.

2. **The current egress gate is keyed on `lane`** (`claim_document_processing_task`, 0011:2333 holds `lane in ('ocr','structured_parse','invoice_facts')` on kill-switch; invoice_facts additionally requires per-client consent, 0011:2336-2347). The design (§3.4 / 0015-S6) **re-keys it on engine_id prefix** (`azure-*` egress-gated, `clara-*` local free).

3. **`engine_id` is caller-chosen, not lane-bound.** `finalize_document_intake(p_engine_id text default 'fixture-engine', …, p_lane text default 'ocr')` (0007:1977-1979) writes both to the task (0007:2025-2028). No DB CHECK binds lane ↔ engine prefix. The only thing that keeps them consistent today is runtime `laneSnapshot` (intake.mjs:153-158) — discipline, not structure.

Re-keying the egress gate onto engine prefix while dispatch stays lane-based, and while engine_id is a free parameter, is the root of findings D1/D2.

---

## Attack scenarios worked through

### A. Money-out-by-rule
- **Direct call outside the spine consumer:** `execute_rule_post` is granted LOGIN-DIRECT to `clara_runtime_login` (§6.3 / S5, the `record_rule_resolution` precedent 0011:128-133). The runtime therefore *can* call it directly, not only via the consumer. Damage is bounded by the in-fn eligibility wall (live rule cited, account_matched, direction, not-high-stakes, total ≤ cap, unexpired, revision current, entry still `draft`). Re-post after withdraw/approve is blocked because `_approve_entry_core` inherits `status='draft'` (0011:3004). Idempotent op-key `rulepost:<entry>:<revision>` blocks double-post of the same revision. **These hold.**
- **window_max_posts race — FINDING (HIGH, #4).** The design specifies "window count < window_max_posts" with **no per-rule serialization**. `rule_post_runs` is a receipts table (S4); the count is a `SELECT count(*)`. Two concurrent `execute_rule_post` calls each read `count = N-1 < max` and both post → the window cap is blown. Everything else in the claim path serializes (e.g. `pg_advisory_xact_lock` 0011:2370); the rule-post window does not.
- **Amount-launder via revise-down-then-facts-rotate:** handled. `persist_invoice_facts` rotates the draft `revision_token` (0011:264-266) without minting a new rule_decision at the new token, so a post-draft facts change strands the rule_decision → the revision-current gate fails → skip. Conservative and safe.

### B. Authority-laundering
- **Signer checked a template, not the entry** — this is WA2-R7's ratified model; not re-litigated. But the *realization* leaks:
- **Other legs are unconstrained — FINDING (HIGH, #5).** `account_matched` is TRUE if **any single** debit line hits the rule account (`_draft_entry_core` 0011:487-488: `exists(… l.account_code=v_rule.account_code and l.debit_cents>0)`), and `is_high_stakes` bounds only `SUM(debit_cents)` (0009:1515-1518). So a rule "vendor X → account A, cap RM3k" auto-posts an entry booking RM1→A and RM2,999→an unrelated account: total < cap, not high-stakes, account_matched true. The signer authorized A, not the split.
- **Sales autopost is under-specified and the reused matcher is debit-only — FINDING (HIGH, #6).** `account_matched` checks `debit_cents>0`; a sales rule's revenue account is *credited*, so account_matched is false → sales autopost never fires unless keyed to the receivable control account (not a coding choice). Also `_draft_entry_core` writes rule_decisions **only** for `rule_type='vendor_account'` (0011:475-476); nothing writes a rule_decision citing an `autopost` rule, which `execute_rule_post` requires (§6.3). Direction-aware account_matched + the autopost rule_decision path are unspecified.
- **Stale/retired rule_decision:** the snapshot in `rule_decisions.snapshot` (0011:489-493) must NOT authorize; `execute_rule_post` must re-read `coding_rules.status='live'` + unexpired at execution (design says "LIVE … unexpired at execution time" — acceptable **iff** implemented as a live JOIN, not a snapshot read).

### C. Attribution-poisoning — **the point flagged for specific verification.**
- **`persist_document_extraction` does NOT whitelist `field_path` for `structured_parse`.** 0007:2190-2194 inserts `elem->>'field_path'` **verbatim** from the caller's `p_regions`. Contrast `persist_invoice_facts` which hard-whitelists (0011:199-202 `if v_path not in (…) raise`). The identity pass is `engine_kind='structured_parse'` (0007:2182) — an **attribution source**: `record_rule_resolution` reads `engine_kind in ('ocr','structured_parse')` (0011:48) and matches on `field_path LIKE '%tin%' / '%ssm%' / '%account%'` **substrings** (0011:49-51).
- **FINDING (HIGH, #3):** the design's claim that buyer/customer identifiers are "structurally attribution-excluded … can never leak into attribution by construction" (§3.1) is **false for the identity pass**. Only the *facts* pass (`engine_kind='invoice_facts'`) is structurally excluded (it is outside the record_rule_resolution predicate). The identity pass's buyer fields are excluded **only** by the mapper naming `buyer_id_primary` — runtime discipline, which the house law forbids for a structural invariant (attribution ≥0.95). Any structured_parse region whose field_path contains `tin` (e.g. a buggy/compromised mapper, or a crafted XML that misroutes a buyer TIN into a supplier-named region) and whose `text_content` normalizes to another client's `client_identifiers` value would attribute (`v_n=1`). The 0015-S0 "field_path collision assertion" tests the *intended vocabulary constants*, not the runtime writer — it is a compile-time check, not a runtime gate. **This is the exact gap the task named.** *Note:* the OCR/AP path shares this trust model today, so this is an inherited weakness the design newly leans on as "structural," not a Wave-A2-unique regression.

### D. Egress-gate downgrade — **the sharpest flaw.**
- **D1 — un-consented cross-border egress (CRITICAL, #1).** The MyInvois **facts** pass is created as a `lane='invoice_facts'` task carrying `engine_id='clara-myinvois:v1'` (0015-S6; `persist_invoice_facts` requires `lane='invoice_facts'` 0011:149, and `_invoice_fact_state` keys on `lane='invoice_facts'` 0009:155). But dispatch is lane-based (chain-fact 1): the **frozen** `invoiceFacts_v1` consumer claims it and calls `analyzeInvoice` → Azure. Meanwhile the new engine-prefix gate (chain-fact 2) sees `clara-*` and **skips both kill-switch and per-client consent**. Net: a sales e-invoice XML (customer identity + amounts) is shipped to Azure with **no consent and kill-switch=1** — precisely the egress the "no-egress class" exists to prevent. The frozen consumer cannot be taught to reject non-Azure engines (it never reads engine_id and is immutable).
- **D2 — engine prefix ≠ egress path (CRITICAL/HIGH, #2).** Because `engine_id` is a free parameter of `finalize_document_intake` (chain-fact 3) and no CHECK binds `lane ↔ engine prefix`, a `lane='ocr'` task (Azure egress) carrying a `clara-*` engine_id would skip the kill-switch yet still egress. The gate is spoofable at the intake boundary.

### E. Tie/shape & CN polarity
- **Rounding-append can absorb an SST tie discrepancy — FINDING (MEDIUM, #9).** `_validate_entry_lines` auto-appends a rounding line for any `abs(dr-cr)` in 1..5 sen at draft/revise (0009:300-314). If `_assert_sales_invoice_shape` (new) validates *line sums* (post-append) rather than *document facts*, a ≤5-sen `net+tax≠gross` drifts into the rounding account instead of surfacing `tax_tie_failed`. The tie must be on stated facts (`net_fact + tax_fact (+stated rounding) = gross_fact`), ordered before/around the generic append.
- **SST account discriminator unspecified — FINDING (MEDIUM, #10).** The floor sums "revenue credits" and "the SST-payable credit," but SST-payable is described only as "a plain liability account" (§4.1) with **no** stated chart marker; `sst_account_missing` (§5) needs a definite predicate (mirror `special_acc_type='rounding'` 0009:305-306). The existing supplier-bill floor keys the debit tie on `account_type='expense'` (0009:512-515); the sales floor needs an equally concrete revenue/SST discriminator.
- **CN polarity / DN type-code** (§4.3): the reversed-polarity tie for `sales_credit_note` and the "DN = sales_invoice with the DN type code" branch (type_code 03 vs 02) are asserted but not pinned to a 3-leg/2-leg equation. Under-specified (completeness).

### F. Freshness / race
- **Facts complete between draft and rule-post:** safe (revision-token rotation strands the rule_decision, above).
- **merge_counterparties vs an autopost rule — FINDING (MEDIUM, #8).** `merge_counterparties` retires/reissues **only** `rule_type='vendor_account'` rows (0011:1868-1869), yet §4.2 says it "reuses unchanged." A merged party's **live autopost** rule dangles keyed to a now-retired counterparty. New drafts canonicalize away from it (so it is not directly firable), but leaving a live posting-authority row on a retired identity violates the append-only genealogy intent and is a latent hazard. 0015-S7 omits `merge_counterparties` from the CoR list.
- **Consent revoked between draft and rule-post:** not a defect — approval is a local books op; consent gates egress at claim time, not approval.

### G. Migration-order & grant surface
- **`_approve_entry_core` grant surface — FINDING (HIGH, #7).** The `approve_entry → _approve_entry_core(ctx jsonb, …)` split (S5) creates a DEFINER function whose `ctx` carries `checker_actor`/`checked_via_rule_id`. If it is reachable by any login role (`clara_runtime_login`, agent pool, PUBLIC), an attacker forges an approval with an arbitrary checker, bypassing `_human_ctx` (0011:2975). The design asserts the `execute_rule_post` isolation matrix (S8) but does **not** explicitly revoke/assert `_approve_entry_core` from all roles. It MUST `revoke all … from public` + tail-assert zero grants (the `_open_question_core` precedent 0011:1960-1961).
- **`_tf_entry_immutable` allowset widening (LOW, #11).** Adding `checked_via_rule_id` to the draft→approved allowset (S1) is safe — writer-controlled, same shape as `self_approval_attestation` (0009:553). Add a tail assertion that a **human** approve leaves `checked_via_rule_id` NULL, so the column cannot become a runtime-set laundering field on a human path.
- **One-live index redundancy (LOW, #12).** The pre-existing `uq_coding_rules_one_live_vendor (client_id,counterparty_id,rule_type) WHERE status='live'` (0011:791) already enforces one-live autopost per (client,counterparty); the new `uq_coding_rules_one_live_autopost` adds `direction`, which is redundant given kind-scoped counterparties (direction follows counterparty kind). Harmless; verify the two indexes don't surprise the migration author.
- **Tier CHECK vs live rows / kind-scoped index rebuild:** S2/S3 correctly pre-assert existing rows are `kind='vendor'` (vacuously safe) and add the tier CHECK requiring bound columns; no live-data hazard found. AB-3 re-probe first (S0) is correct.

---

## Completeness pass

**Rulings lacking a fully-specified mechanism:**
- **WA2-R7** (execute_rule_post authority): per-rule window serialization (#4), `_approve_entry_core` lockdown (#7), and the autopost rule_decision creation + direction-aware `account_matched` (#6) are the load-bearing mechanisms and are all under-specified.
- **WA2-R9** (self-growth): `supersedes_rule_id` genealogy + retire-old/fresh-sign is specified; but the ≥5-sighting/60-day window is not shown to be *applied* in the extended approve-time proposal (current `v_seen` has no time window, 0011:3168-3172), and the "cap-growth rate limit" is only a ≤2× heuristic.
- **WA2-R4** (SST): account discriminator (#10) + tie/rounding ordering (#9).
- **WA2-R11** (CN/DN): the CN/DN tie equations and type-code branch (§4.3) not pinned.

**Design elements exceeding what a ruling authorizes:**
- The **egress-class-by-engine-prefix** CoR (§3.4) is the design's own realization, not a ruling. WA2-R2 required only "parsed locally, no API." The prefix gate introduces D1/D2; the **lane-based** gate that already exists satisfies the ruling and is safer. This is the one place the design over-reaches into a weaker posture than the rulings demand.
- Otherwise the design is faithful to the rulings.

**R2 backup lane (§8):** custody blast radius (backup app holds service_role + near-admin DSN) is explicitly accepted by WA2-R6; the `age` recipient-key-in-repo / identity-key-off-repo split is sound (repo exposure allows encrypt-only). No finding against the design here.

---

## Findings table

| # | Sev | Claim / hole | Evidence (file:line) | Concrete fix |
|---|-----|--------------|----------------------|--------------|
| 1 | CRITICAL | MyInvois facts on `lane='invoice_facts'`+`clara-*` engine is claimed by the frozen Azure consumer (lane-routed, engine-blind) AND exempted from consent/kill-switch by the new prefix gate → un-consented cross-border egress with kill-switch on | 0015-S6; 0011:149; 0009:155; reconciler-documents.mjs:36,213; startWorld.ts:115; invoiceFacts.v1.behavior.mjs:55,84-95; design §3.4 | Don't route local facts through `lane='invoice_facts'`. Add a dedicated local-facts lane with its own consumer; teach `persist_invoice_facts`/`_invoice_fact_state` to read it; keep `lane='invoice_facts'` Azure-only and egress-gated. |
| 2 | CRITICAL/HIGH | Egress class keyed on engine_id **prefix** is not bound to the actual egress path (lane); `engine_id` is a free param of `finalize_document_intake` with no lane↔engine CHECK → spoofable (`lane='ocr'`+`clara-*` egresses un-gated) | 0007:1977-1979,2025-2028; intake.mjs:153-158; design §3.4/S6 | Gate on `lane` (the dispatch key), OR add a DB CHECK: `lane='ocr'⟹engine LIKE 'azure-%'`, `lane in ('structured_parse','none')⟹'clara-%'`; assert in the migration tail. |
| 3 | HIGH | "Structurally attribution-excluded" buyer/customer identifiers are actually runtime naming-discipline: `persist_document_extraction` writes `field_path` verbatim for structured_parse (no whitelist); attribution matches `field_path LIKE '%tin%'` substring | 0007:2190-2194 (vs 0011:199-202); 0011:48-51; design §3.1 | Whitelisted structured_parse writer / field_path allowlist, OR narrow `record_rule_resolution` to an EXACT attribution-field allowlist (not `%tin%` LIKE); add a runtime-enforced DB assertion, not just the S0 vocabulary-constant probe. |
| 4 | HIGH | `window_max_posts` count-check has no per-rule serialization → concurrent posts blow the cap | design §6.3, S5 (no lock); race pattern 0011:2370 | `FOR UPDATE` on the `coding_rules` row (or advisory lock on rule id) at the top of `execute_rule_post`; count-and-post atomic per rule. |
| 5 | HIGH | Autopost account binding doesn't constrain other legs: `account_matched` true on any single debit leg; `is_high_stakes` bounds only SUM(debit) → laundering into unrelated accounts under cap | 0011:487-488; 0009:1515-1518 | Require the rule account to carry the entire non-control amount (restrict autopost to 2-leg entries) or every expense/revenue leg to equal the rule account. |
| 6 | HIGH | Sales autopost unspecified + reused `account_matched` is debit-only (revenue is credited) → never fires or fires on wrong leg; no path writes an autopost rule_decision that `execute_rule_post` needs | 0011:475-476,487; design §6.3 | Add the autopost rule_decision creation to the draft path; make `account_matched` direction-aware (debit=purchase, credit=sales). |
| 7 | HIGH | `_approve_entry_core(ctx jsonb,…)` split creates a DEFINER fn carrying checker_actor; not explicitly revoked/asserted from all roles → forged-approval bypass of `_human_ctx` | S5/S8; 0011:2975; precedent 0011:1960-1961 | `revoke all on _approve_entry_core from public`; tail-assert zero grants to runtime/agent/wake/authenticated/PUBLIC. |
| 8 | MEDIUM | `merge_counterparties` retires only `vendor_account` rules; design says "reuse unchanged" → merged party's live **autopost** rule dangles on a retired counterparty | 0011:1868-1869; design §4.2; 0015-S7 omits it | Extend `merge_counterparties` to retire the merged party's live autopost rule (+ optional proposed successor); add to the S7 CoR list. |
| 9 | MEDIUM | ≤5-sen rounding auto-append can absorb an SST `net+tax≠gross` mismatch if the tie is checked on line sums instead of document facts | 0009:300-314; design §4.3/§5 | Evaluate the SST tie on stated facts before/around the generic append; specify ordering so a ≤5-sen tax mismatch surfaces `tax_tie_failed`, not silent rounding. |
| 10 | MEDIUM | SST-payable account discriminator unspecified ("plain liability account") → `sst_account_missing` and the revenue/SST credit split lack a definite predicate | design §4.1/§5 (vs `special_acc_type='rounding'` 0009:305-306) | Define a chart marker (e.g. `special_acc_type='sst_output'`); the floor sums SST vs revenue by it. |
| 11 | LOW | `checked_via_rule_id` in the draft→approved allowset is safe but must be NULL on human approve | S1; 0009:553 | Tail-assert a human approve leaves `checked_via_rule_id` NULL; only the rule path sets it. |
| 12 | LOW | `uq_coding_rules_one_live_autopost` direction is redundant vs the pre-existing `uq_coding_rules_one_live_vendor` given kind-scoped counterparties | 0011:791; S3 | No change required; confirm no unintended interaction. |

**Highest-priority before build:** #1 and #2 (egress downgrade), #3 (attribution "structural" over-claim), #7 (`_approve_entry_core` lockdown). Fix these and the design is buildable; ship as design-stage amendments to the DRAFT contract + 0015 companion.
