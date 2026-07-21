# Lane D — The books core an AR side plugs into (as-built)

Grounding brief for Wave A2 (sales-invoice/AR + MyInvois + standing-rules auto-POST).
FACTS ONLY, with `file:line`. All DB objects live in schema `clara`; money is **bigint cents** everywhere.
Repo paths relative to `C:/Users/zhant/Desktop/clara-rebuild`.

---

## 1. Journal shape, money, balance (0003)

**Tables** (`packages/db/migrations/0003_books_core.sql`):
- `clara.journal_entries` (0003:101) — key cols: `client_id` (NOT NULL FK), `status`, `posting_date date NOT NULL`, `memo`, `origin`, `document_id`+`source_doc_sha256` (provenance pair), `resolution_id`, `is_opening_balance`/`is_year_end`/`tax_affecting` (risk flags), `maker_actor`, `checker_actor`, `revision_token uuid`, `reversal_of`/`reversed_by`, `created_at`/`updated_at`. `firm_id` is **stamped by trigger**, never trusted from caller.
  - `status` was `('draft','approved')` in 0003:105; **widened to add `'withdrawn'`** in 0009 (see the `_tf_entry_immutable` draft→withdrawn branch, 0009:555) — as-built states are **draft / approved / withdrawn**.
  - `ck_je_basis` (0003:127): every entry needs a bound document **OR** a non-empty memo.
  - `ck_je_doc_pair` (0003:126): `(document_id IS NULL) = (source_doc_sha256 IS NULL)`.
- `clara.journal_lines` (0003:137) — `entry_id`, `line_no`, `client_id`, `firm_id`, `account_code`, `debit_cents bigint`, `credit_cents bigint`, `description`. `ck_jl_one_side` (0003:147): exactly one of debit/credit `> 0` (zero-amount and both-sides rejected). `fk_jl_account (client_id, account_code)` → `coa_accounts` (0003:148). `client_id`+`firm_id` stamped from the parent entry (`_tf_stamp_line_from_entry`, 0003:213).

**Balance** — `clara._assert_balanced(p_entry)` (0003:258): `Σdebit = Σcredit AND Σ > 0` for **every** entry (no skip lane; errcode `CLR07`). Enforced two ways: called synchronously by the writers, AND by `DEFERRABLE INITIALLY DEFERRED` constraint triggers `t_je_balance` / `t_jl_balance` (0003:480–483) that fire at COMMIT (backstop even against raw/superuser DML).

**Immutability / reverse-not-delete law** — `_tf_entry_immutable` (0003:356, replaced 0009:539): DELETE always raises `CLR08` ("journal entries are never deleted (reverse, not delete)"); the only legal UPDATEs are draft→approved (sets checker/approved_at/attestation), approved→approved as a one-time reversal-linkage pair, draft→withdrawn, and token/updated_at bumps. Every other column delta is rejected by diffing `to_jsonb(new) - allowset` vs old. Lines of an approved entry are frozen (`_tf_lines_immutable`, 0003:311, `CLR08`). One approved reversal per original: `uq_je_one_approved_reversal` (0003:131).

**Posting-date rules** — **NONE beyond `date NOT NULL`.** A repo-wide grep for any `posting_date` CHECK / future-bound / `current_date` guard returns nothing. No open/closed-period gate exists. (UNVERIFIED that any period lock is intended; today posting_date is unconstrained.)

---

## 2. Chart of accounts + the control-account pattern

**`clara.coa_accounts`** (0003:47, evolved 0009:757): PK `(client_id, account_code)`. Columns:
- `account_type` — CHECK `in ('asset','liability','equity','income','expense')` (0003:52). This is the whole taxonomy; no sub-types.
- `account_code` — regex **widened in 0009:760** from `^[0-9]{4,8}$` to `^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$`, so RPR display codes like `400-000`, `999-R00`, `500-000` are legal.
- `account_class` — **added 0009:763**, CHECK `null | 'payable'` (`ck_coa_account_class`, 0009:764). **This is the control-account marker.** `'payable'` = the AP control class.
- `special_acc_type` — CHECK `null | 'rounding'` (0003:53); `uq_coa_special` (0003:58) = at most one rounding account per client.
- `is_active boolean` — accounts are **deactivated, never deleted** (no delete path anywhere).
- **No `origin` column.** The CSV's `origin` (tb/gl/system_role) is NOT persisted — it lives only in the onboarding CSV + the op_key.

**How 400-000 AP works** (`packages/db/deploy/rpr-coa.csv`, last row + header comment):
- `400-000 TRADE CREDITORS`, `account_type=liability`, `account_class=payable`, `origin=system_role`. It is the postable AP control account — the "intrinsic-subledger floor".
- "Owner-approved locked system role" is **governance + writer guards, not a dedicated lock trigger**: (a) it enters only via a `system_role`-origin CSV row requiring explicit owner sign-off (CSV comment / S6-D2); (b) `upsert_account` refuses to change the type/class of an account that already has lines — `"cannot change type/class of an account that has lines"` `CLR10` (0009:1480–1484); (c) there is no audited delete-account fn. There is **no `_tf_coa_*` immutability trigger** — the "locked against deletion/retag after first use" is exactly those two writer guards.
- The **S6 AP gate** — `400-000 balance == Σ vendor-tagged open approved supplier-bill credits` — is an **eval/test assertion computed from lines** (CLAUDE.md: "AP gate exact RM 1,350,938.21"), NOT a stored balance or a DB constraint.

**999-R00 rounding**: `special_acc_type=rounding`, typed `expense`, `origin=system_role`. Discovered at draft time by `where special_acc_type='rounding'` (see §4). PRD invariant 7.

**Account taxonomy for AR is already partly present on RPR**: `500-000 REVENUE` and `530-000 OTHER INCOME` exist (`account_type=income`). The CSV explicitly **excludes** `300-000 TRADE DEBTORS` ("the AR-side control-footer plug (twin of 400-000)… NOT promoted… Add it in a later slice if an AR flow needs it" — rpr-coa.csv comment). That is Wave A2's job.

---

## 3. How RPR's 27-account chart was onboarded + the audited add-account path

**Onboarding**: `packages/db/scripts/onboard-rpr.mjs` loads `packages/db/deploy/rpr-coa.csv` (27 rows) and creates each account **only through the audited writer `clara.upsert_account`** (no hand-written rows). CSV columns: `account_code,account_name,account_type,account_class,special_acc_type,origin`. Discover-then-create + op-receipt idempotency; a stored row that diverges from the CSV aborts with a diff (`accountDiff`, onboard-rpr.mjs:336). The script validates `account_class ∈ {null,'payable'}` and `origin ∈ {tb,gl,system_role}` (onboard-rpr.mjs:42–44) — client-side mirrors of the DB checks.

**Audited add-account fn (post-onboarding)** — `clara.upsert_account(p_client, p_code, p_name, p_type, p_special_acc_type default null, p_op_key default null, p_account_class default null)` (0009:1460). Requires a **human bookkeeper+** actor (`_human_ctx(role_rank('bookkeeper'))`, 0009:1466). **Grant: `clara_authenticated` only (0009:1504) — NOT wake/agent-callable.** Op-receipt idempotent. Emits `account.upserted` event + audit. Retag guard at 0009:1480. So **yes, account creation after onboarding has an audited path, but it is human-only.**

**There are ZERO account-code literals seeded in migrations or `seeds/`** (grep clean). Every account is born from onboarding CSV rows or a live `upsert_account` call.

---

## 4. The AP composite writer (the `code_and_open_ap`-shaped thing) + same-txn side effects

There is **no fn named `code_and_open_ap`**. The composite writer is **`clara._draft_entry_core(...)`** — live version at `0011_daily_loop.sql:301` (supersedes 0009:1204). Signature:

```
clara._draft_entry_core(p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text,
  p_is_human boolean, p_client uuid, p_resolution uuid, p_posting_date date,
  p_memo text, p_lines jsonb, p_document uuid, p_sha256 text, p_flags jsonb,
  p_op_key text, p_books_version bigint, p_proposed_counterparty jsonb,
  p_evidence jsonb, p_coding jsonb, p_coding_kind text) returns jsonb
```

Public entry points that call it: `clara.draft_entry` / `clara.wake_draft_entry` (0009:1414/1432). `p_coding_kind` is the discriminator — CHECK `ck_je_coding_kind` currently allows **`null | 'supplier_bill'`** only (0009:853). Supplier-bill mode requires a document + a vendor proposal + a cited evidence array (0011:354–364).

**Intrinsic same-txn side effects, in order** (0011:301–548):
1. `_reserve_op` op-receipt dedupe (0011:318).
2. Client/firm/archived checks; books-version optimistic lock for the agent lane (`assert_books_current`, 0011:335).
3. Active-filing double-code guard (0011:340).
4. `assert_client_resolved` (invariant 1, 0011:350).
5. **`_resolve_counterparty(p_client, p_proposed_counterparty)`** (0011:386 → body 0011:1335) — resolves/creates the vendor in `clara.counterparties`; returns a `match_fingerprint`.
6. **`_validate_entry_lines(p_client, p_lines)`** (0011:387 → body 0009:257) — validates each line codes to an active account, and **auto-appends the ≤5c rounding leg** (see below).
7. INSERT `journal_entries` (draft) + `journal_lines` from the validated lines; `_assert_balanced` (0011:415–421).
8. If document-bound: `_write_entry_evidence` (provenance-tier binding into `clara.entry_evidence`, 0011:429), non-MYR rejection, corroboration binding (`_corroboration_bound`), and an `amount_exception` stamp into `flags` when the proposed payable/expense totals differ from the machine-corroborated `invoice.total` (0011:436–468).
9. **Standing-rule pinning**: if the fingerprint matched a live `vendor_account` coding_rule, insert a `clara.rule_decisions` snapshot (0011:471–494).
10. `clara.coding_attempts` insert when a coding-task/autodraft task is bound (0011:500–515).
11. **`clara.journal_entry_revisions` revision #0 `'drafted'`** (0011:517–533) — the append-only revision log.
12. `_audit` + `_append_event('entry.drafted')` (0011:535–538). Returns receipt `{entry_id, revision_token, status:'draft', filing_id, exception, provenance_tier, rule_decision_id, rule_account_matched}`.

**Rounding auto-append** — inside `_validate_entry_lines` (0009:300–314): residual `= |Σdr − Σcr|`; `>5c` ⇒ reject `CLR07`; `1..5c` ⇒ discover the client's rounding account (`where special_acc_type='rounding' and is_active`; missing ⇒ `rounding_account_missing` `CLR10`) and append a balancing leg. Generic — works for any entry, AR included.

**Supplier-bill structural floor** — `clara._assert_supplier_bill_shape(p_entry)` (0009:477), fired at approve by constraint trigger `t_je_supplier_bill_shape` (0009:533):
- **Every `account_class='payable'` line MUST carry a `counterparty_id`** (else `CLR23`, 0009:488–490). *(This is the AP rule that an AR/receivable analog must mirror.)*
- A `coding_kind='supplier_bill'` entry needs a payable credit `> 0` and (unless `amount_override`) payable-credit == expense-debit == the verified `invoice.total` (0009:492–520).

---

## 5. The subledger / aging surface (the AR mirror target)

**There is NO subledger or aging table.** The AP "subledger" is entirely:
- `clara.journal_lines.counterparty_id` (**added 0009:881**; composite FK `(counterparty_id, firm_id, client_id)` → `counterparties`, 0009:909) — the intrinsic per-line tag.
- `clara.counterparties` (0009:812): `kind` CHECK **`in ('vendor')` only** (0009:817), `name`/`name_normalized`, `registration_no`/`registration_normalized`, `tin`; dedup indexes `uq_counterparties_client_registration` + `uq_counterparties_client_unregistered_name` (0009:840/843); `merged_into`/`retired_at` (0011:606). Resolver: `_resolve_counterparty` (0011:1335), canonicaliser `_canonical_counterparty` (0011:1316), alias table `counterparty_aliases` (0011:651).
- Aging / open-balance is **computed on the fly from counterparty-tagged approved lines**, never materialised. There is **no payment/settlement/open-item-matching flow** for AP either — bills accrue to 400-000 but nothing applies payments against them yet.

**Balance surface**: the only reporting fn is `clara.trial_balance(p_client)` (0004:730) — per-account `Σdebit_cents`/`Σcredit_cents` over `status='approved'` lines, client-scoped, security-invoker. No AR-aging view exists.

---

## 6. Draft lifecycle writers the AR flow reuses (revise / withdraw / diff / approve)

- **`clara.revise_entry(p_entry, p_lines, p_proposed_counterparty, p_evidence, p_expected_revision, p_op_key, p_amount_override, p_duplicate_override)`** (0011:2815). Human bookkeeper+ only; draft-only (`CLR22`); optimistic `revision_token` check (`CLR06`, 0011:2843); re-runs line validation + counterparty resolution + evidence rebind, appends a new `journal_entry_revisions` row. supplier-bill still requires vendor + evidence (0011:2846–2854).
- **`clara.withdraw_draft(p_entry, p_reason, p_expected_revision, p_op_key)`** (0009:1882). Human bookkeeper+; draft→withdrawn; reason required; clears `proposed_counterparty`/`match_fingerprint`.
- **`clara.journal_entry_revisions`** (0011:886): append-only, `revision_no` monotonic (`uq…_no`), `revision_token` unique, `actor_kind ∈ {human,agent,facts}`, `header jsonb` + `legs jsonb` snapshots, `rule_decision_id`, `evidence_refs`. Revision 0 = the draft.
- **`clara.get_entry_diff(p_entry, p_client)`** (0011:3621): walks the revision log, emits per-revision `deltas_vs_prev` over `posting_date/memo/status/flags/revision_token` + `total_debit_cents`. Human viewer+ or agent (wake-secret) lane.
- **`clara.get_doc_entry_diff(p_entry, p_client)`** (0011:3681): compares the entry against the latest `invoice_facts` extraction regions (invoice.total = **payable-class credit sum**, vendor_name, date), emits per-field `delta_cents` + region locators for overlay. **Note: `invoice.total` is hard-wired to `account_class='payable'` (0011:3715–3722)** — an AR analog needs a receivable branch.

**Approval / bounded auto-POST**:
- `clara.approve_entry(p_entry, p_expected_revision, p_attestation, p_op_key)` (0011:2965) — maker/checker, high-stakes distinct-checker law (`CLR05` reasons: `attestation_required`/`distinct_checker`/`self_attestation`, 0011:3131–3140).
- **`clara.approve_routine_entry(p_entry, p_expected_revision, p_op_key)`** (0011:3211) — the **bounded auto-POST primitive**: delegates to `approve_entry` but **refuses `is_high_stakes` entries** (`CLR05 routine_refuses_high_stakes`, 0011:3225). This is the surface Wave A2's "standing rules → bounded auto-POST" builds on. Standing rules themselves: `propose_coding_rule`/`sign_coding_rule`/`decline_coding_rule`/`retire_coding_rule` (0011:2106–2243), table `clara.coding_rules` `rule_type` CHECK `in ('vendor_account')` only (0011:757).

**High-stakes definition + threshold** — `clara.is_high_stakes(p_entry)` (0009:1513): `is_opening_balance OR is_year_end OR tax_affecting OR (flags ? 'amount_override') OR Σdebit_cents >= firms.high_stakes_amount_cents`. The amount threshold is the per-firm column **`clara.firms.high_stakes_amount_cents bigint NOT NULL DEFAULT 1000000`** (= RM 10,000.00), CHECK `> 0` (0002:204). Reason array mirrored in `get_draft_review` (0010:65–72).

---

## 7. The `je_review` card contract (dashboard side)

Card catalog: `apps/dashboard/app/chat/partCatalog.ts:54`. The persisted part is **identifier-only** and the card hydrates authoritative state on mount:

```
{ type:"je_review", entry_id, revision_token, client_id, document_id,
  provenance_tier:"model_read"|"verified", uncertainty?, exception? }
```

Renderer `apps/dashboard/app/chat/JeReviewCard.tsx`; hydration reads `clara.get_draft_review(p_entry, p_client)` (0010:9) which returns `{entry, lines[] (with account_name/account_type/account_class/counterparty_id), counterparty{proposal,fingerprint,current_outcome}, evidence[], eligible_checker_count, high_stakes, high_stakes_reasons[], flags, near_duplicates[]}`. Related Wave-A parts: `doc_review`, `diff`, `kb_rule_proposal`, `open_question`, `sweep_receipt` (partCatalog.ts:96–115). The catalog has a compile-time parity guard — adding a new part type without a render branch fails typecheck (partCatalog.ts:128). **`je_review` is entry-generic**: a sales-invoice draft can reuse it as-is; only new *semantics* (customer counterparty, revenue lines) flow through the same envelope.

---

## 8. Deliverable — what an AR side requires

**New system/chart accounts (per client):**
- **AR control account** (e.g. `300-000 TRADE DEBTORS`), `account_type=asset`. Requires a **new `account_class` value `'receivable'`** — the CHECK at `0009:765` currently allows only `null|'payable'`, so a migration must widen `ck_coa_account_class`.
- **Revenue account(s)**: already exist for RPR (`500-000`, `530-000`, type `income`); new clients supply theirs via onboarding.
- **SST-payable account**: a plain `liability` account. **No tax engine exists** (grep for sst/gst/tax_code/tax_rate/tax_payable/myinvois = zero hits; `tax_affecting` is only a high-stakes boolean). "DB owns every number" ⇒ any SST split must be a *provided* line or a *new DB function*, never agent-computed. There is no tax-code/rate table to seed.

**Three seeding paths (as-built), pick per case:**
1. **Migration-seeded literals** — *not a pattern here* (zero account literals in migrations/seeds). Prefer only for a genuinely universal system account if introduced.
2. **Onboarding-script addition** — amend `deploy/rpr-coa.csv` with `origin=system_role` rows (300-000, SST-payable) and re-run `onboard-rpr.mjs` (idempotent; owner reviews the CSV). This is how 400-000/999-R00 landed.
3. **Audited add-account fn** — live `clara.upsert_account(...)` calls by a **human bookkeeper+** (agent cannot). Best for post-onboarding, per-client additions.

**Exact mirror surface for "Dr AR (customer counterparty) / Cr revenue":**
- Widen `clara.counterparties.kind` CHECK (`0009:817`) to include `'customer'`; teach `_resolve_counterparty` (0011:1335) the customer lane (or generalise it).
- Widen `ck_je_coding_kind` (`0009:853`) to add e.g. `'sales_invoice'`; branch `_draft_entry_core` (0011:301) on it (document + customer proposal + evidence, mirroring the supplier-bill path).
- Add a **receivable structural floor** mirroring `_assert_supplier_bill_shape` (0009:477): every `account_class='receivable'` line requires a `counterparty_id`; the AR total ties to the invoice total on the **debit** (asset) side. Either add a parallel assertion or generalise the existing payable-only rule to "any control-class line requires a counterparty."
- `get_doc_entry_diff` (0011:3681) `invoice.total` mapping is payable-hard-wired (0011:3715) — add a receivable/credit-revenue branch.
- `journal_lines.counterparty_id`, `entry_evidence`, rounding auto-append, balance/immutability triggers, `revise_entry`/`withdraw_draft`/diffs/`approve_entry`/`approve_routine_entry`, `je_review` card, `journal_entry_revisions` — **all reusable unchanged**.

**Subledger/aging:** no new table is strictly required — AR aging is derivable from customer-tagged approved receivable lines exactly as AP is. A dedicated open-item / payment-application table would be *new* ground (AP doesn't have one either). Decide whether AR needs settlement matching before adding storage.

---

## Open questions for design

1. **`account_class` = the control-account axis.** Add `'receivable'` to `ck_coa_account_class` (0009:765) and keep the "control-class line requires a counterparty" rule generic, or hard-code a receivable twin of `_assert_supplier_bill_shape`? Generic is cleaner but changes AP's existing errcode surface (`CLR23`).
2. **SST is greenfield.** Is SST a *provided* journal line the human/agent supplies (DB just validates balance), or does the DB need a tax-computation fn + a tax-code/rate table so "the DB owns the number"? What SST rate model applies to RPR (registered? exempt? mixed)? No tax machinery exists to extend.
3. **MyInvois XML as a `structured_parse` engine.** The `document_extractions.engine_kind` CHECK is `('ocr','structured_parse','invoice_facts')` (0009:793) and processing-task `lane` allows `structured_parse` (0009:773) — but note the **HARD pre-MyInvois AB-3 `engine_kind` gate** flagged in CLAUDE.md/PROJECTLOG. Does a MyInvois XML upload reuse `structured_parse` + the invoice_facts/region model, or need a new engine_kind? Where do the LHDN-mandated fields (TIN, e-invoice UUID, classification codes) land — new region field_paths or a dedicated facts shape?
4. **Customer identity.** `counterparties` dedups vendors by registration/name (0009:840/843). Customers key on the same (SSM reg / TIN)? Any overlap where one party is both a customer and a vendor — same row (add a kind, or allow multi-kind) or two rows?
5. **Bounded auto-POST scope for AR.** `approve_routine_entry` (0011:3211) refuses high-stakes; sales invoices routinely exceed `high_stakes_amount_cents` (RM 10k default). Do standing sales rules auto-POST above threshold (needs a policy change), or is AR auto-POST intentionally rare? `coding_rules.rule_type` is `'vendor_account'` only (0011:757) — add `'customer_revenue_account'`?
6. **AR open-items vs pure ledger.** Ship AR as counterparty-tagged lines only (aging computed, matching AP), or does Wave A2 need payment application / open-item settlement — which would be the first such table in the system?
7. **`300-000` reuse.** RPR's `300-000 TRADE DEBTORS` is a deliberately-excluded GL footer plug (rpr-coa.csv). Promote that exact code to postable (twin of the 400-000 promotion), or mint a fresh AR control code?
8. **Posting-period gate.** There is still no posting-date/period lock anywhere. Do AR (and MyInvois-dated invoices) force the period question now, or stay unconstrained like AP?
