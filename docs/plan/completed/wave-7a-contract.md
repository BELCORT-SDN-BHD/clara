# Wave §7-A — THE UNATTENDED SALES DRAFTER · CONTRACT

> **STATUS: RATIFIED (owner-grilled 2026-08-06, session `fd311e06`). NEVER RE-GRILL.**
> The design mechanism stays `wave-7a-design-skeleton.md` (v2, ADR-062); this document records
> the §6 rulings that resolve it, the measured preflights, and the build/ceremony shape. On any
> conflict, THIS document wins over the skeleton's recommendations (it supersedes exactly one:
> §3.2's shape-(A) lean — see 7A-R1).
>
> **Grill provenance:** skeleton v2 §6 agenda → owner interview (Chinese-language rounds; the
> owner's clarification arc covered draft-vs-autopost authority, seeded-rule refusal (WB-R2
> re-confirmed), CN risk asymmetry, shape-wall doctrine, the nine controls, and the product
> vision) → nine substantive rulings + four small-item confirmations, all recorded here.
> ADR-063 is the log entry.

---

## §1 Rulings (7A-R1 .. 7A-R12)

**7A-R1 — Rollout shape: (B) ONE continuous quiesce ceremony, WITH a kill-switch.**
Supersedes the skeleton §3.2 recommendation (A). One migration, one ceremony:
`quiesce writes (D1) → apply migration (activation flag ships OFF) → deploy v6 → verify v6 is
the live registry pin → flip activation ON (audited flip, inside the window) → resume writes`.
The sales path is never open to v5 because the flag is OFF until v6 is verified live.
**Mid-window deploy failure:** do NOT flip; resume writes on v5 (the inert DB additions are
harmless); retry the deploy later — no migration revert under pressure. Thereafter the flag is
an **emergency de-activation switch only** — flipping it is an operational act, never a second
ceremony, and never a bypass of any other gate.

**7A-R2 — Q1: the DB-authoritative TRI-STATE direction contract.**
Direction ∈ {`sales` | `purchase` | `unresolved`}, computed at task/admission time from hard
document evidence (issuer-identity exact-match per `_document_direction`), **binding the
allowed coding-kind family**, and **revalidated in the DB draft writer**. The model's
`coding_kind` is a proposal checked against the bound family — never routing authority.
`unresolved` never drafts (falls to the human lanes). A contradictory coding-kind /
counterparty-kind pair is **rejected in the DB writer** (the only authority layer); the tool
derives `kind` from `coding_kind` and the zod schema rejects mismatches as ergonomics on top
(skeleton §2a's three layers). The `sales_direction` receipt token keeps its name so
historical `sweep_run_items` stay readable.

**7A-R3 — tax-silent sales may draft (narrow `tier_a_fails` bypass, DRAFT-ONLY).**
On the sales lane only, `tier_a_fails` is removed from the admission `ready` blockers the same
way `rule_backed`/`vendor_bound` already are (0031:519-520 pattern). **Every posting path keeps
the full gate** — corroboration remains necessary for autopost fuel and for autopost execution;
a tax-silent document can therefore draft (human approves each entry) and can never autopost.
Rationale recorded: all 22 real RS sales invoices are tax-silent (sub-threshold non-SST
registrants are routine Malaysian reality); without drafts they accrue no approval history at
all, which starves every future automation of fuel.

**7A-R4 — Floor purity: sales posting authority is earned from sales invoices only.**
`_ocr_sales_floor`'s authority terms count only entries with `coding_kind='sales_invoice'` —
on top of the `corroborated >= 6` ROOT-fix term (owner-ruled 2026-08-06 pre-skeleton, binding).
This closes the generic-JE provenance hole (skeleton §0.1): a corroborated generic
`journal_entry` with an income credit and a customer counterparty no longer feeds sales
autopost authority.

**7A-R5 — Q2: the catch-up stampede gets a cursor, a cap, and an explicit backfill door.**
A durable per-firm cursor + daily cap governs steady-state admission; the historical backlog
moves ONLY via an explicit, recorded, batched, pausable **backfill operation**. No date cutoff
(v1's shape is rejected — it strands old filings permanently).

**7A-R6 — Q7: RS's sales side is APPROVED — Half 1 stays real-document.**
Create ROME SECRETARY's revenue + trade-debtors accounts; the 12 customers are born through
the approval flow (never pre-seeded); approved drafts post to RS's real YA2025 books. This is
genuine books work (the YA2025 corpus is real work needing doing), executed under ADR-060's
data authority for any resets, with every mechanism at full force.

**7A-R7 — Q9/Q10: the unattended lane's coding-kind menu.**
`sales_invoice` + `sales_credit_note` only. `sales_credit_note` is schema-accepted (the DB
already accepts it) with **no acceptance built this wave** (zero CNs exist in the corpus) and
stays **never-autopostable** (`cn_not_autopostable`, wave-a2.1-contract §3.2). **No
`journal_entry`** in the unattended lane — free-form entries have no shape for walls and stay
with the human-present lanes.

**7A-R8 — Q11: no classifier changes.** Selection = `document_kind='invoice'` + the 7A-R2
direction contract.

**7A-R9 — Q12: the nine OCR controls are restated in §4 below** with the current enforcement
map; §4 **supersedes the inaccurate control-7 summary** at `wave-a2.1-contract.md:17` (the §3.3
numbered list there remains the authoritative origin text).

**7A-R10 — Wave E is sequential.** No parallel contract drafting during this build; Wave E's
grill opens after §7-A acceptance closes. (Reverses the close-of-session offer the owner had
provisionally accepted on 2026-08-06.)

**7A-R11 — ROADMAP REGISTRATION (not this wave): the settlement-corroboration door.**
Owner product vision, recorded verbatim in intent: **autopost is to encompass every accounting
behavior class over time — each class earning its own envelope**. The registered design path
for tax-silent documents: **the bank-settlement receipt as an independent second reader**
(money received at the invoice's exact amount corroborates the invoice), extending
corroboration — and eventually autopost eligibility — to documents that state no tax. Sits
with E/F-adjacent planning; ADR-063 registers it; nothing in §7-A depends on it.

**7A-R12 — Standing refusals re-confirmed during the grill (no change, recorded for the
record):** autopost-from-seeding stays REFUSED (WB-R2/ADR-046 — external GL/management-account
history never seeds autopost authority); rules cannot be hand-created past the floor by any
actor (propose/sign/post all re-verify); hand-drafts stay never-autopost-eligible.

---

## §2 Measured preflights (state at ratification)

| Preflight | Status | Evidence |
|---|---|---|
| Sandbox `sst_output` account exists (Half-2 positive-tax precondition) | **MET** — `2300 · SST output tax payable`, active | live read 2026-08-06 ~13:05Z (`coa_accounts`, client `9ab680ea…`) |
| Fresh signed credit-sighting counts (Q5) | **OPEN — measured at Slice 1** (the skeleton downgraded the 3/3/3/0 figures to unverified preflight) | build lane takes the signed production query |
| RS `invoice.vendor_registration` exact-value probe | **OPEN — at acceptance preflight**: ingest ONE RS invoice, read the PERSISTED value (capture depends on Azure typed `VendorTaxId`; the fallback identity reader cannot emit the unlabeled SSM line) | skeleton §4.1 |
| RS chart + customers | **APPROVED to create** (7A-R6); revenue + trade-debtors accounts at build; 12 customers born via approvals only | — |
| Belt double witness (B2 July draft + BEE catch-up) | **PENDING the ≈16:09Z 2026-08-06 tick** — monitor armed; pre-tick baseline recorded (sandbox: no July draft, one May `adjustment_runs` receipt; BEE: zero `scheduled_run` rows) | session `fd311e06` |

---

## §3 Build + ceremony shape (as ruled)

**Review/merge units (ADR-061 full ladder each; Law 1 independent review on every
judgement-logic PR):**
1. **PR-DB** — ONE migration (number claims at MERGE): floor drop/recreate
   (`+corroborated`, `+coding_kind='sales_invoice'`, `-distinct_docs`; lateral-join factored
   state; KL-time literal PRESERVED so the 0042/0044 roster assertions stand; ACL re-established;
   same-transaction; tail asserts the exact live caller set and that each authority caller
   gates `corroborated>=6`) · three caller recuts + the preview verb as caller four ·
   the 6-arity `settle_autodraft_task` (preserving 0036 semantics; two-signature tail; ACL
   parity on both overloads) · the `_coding_lane_core` recut (tri-state contract, sales-aware
   customer resolution — no vendor-binding path for sales, the 7A-R3 bypass, cursor/cap +
   backfill op) · the activation flag (ships OFF; audited flip verb).
2. **PR-RUNTIME** — `autoDraft.v6.*` ×6 (deltas per skeleton §2a only) + `.errors.ts` three
   new tokens + direction-neutral generics + the `.impl.ts` settle move to 6-arity with
   `getWorkflowMetadata().workflowRunId` + registry repoint · `freeze:update` (add-only).
3. **PR-CHATTURN** — `chatTurn.v9.*` ×6 + repoint (severable; rides the wave per skeleton
   §2f). Grep the built bundle after the edit (the WDK silent directive-swallow law).
4. **PR-DASHBOARD** — the signing-time evidence preview (integer counts, advisory,
   `AutopostRulePanel.tsx` via `reviewApi.ts`).

**ONE ceremony (7A-R1):** D1 write-quiesce (`packages/db/README.md:99-118`) spanning
apply → deploy → verify → flip → resume · session-level `statement_timeout` INSIDE the
migration connection (the floor tail's `pg_proc`-wide scan makes the ADR-059 recipe apply) ·
rig-validate on a throwaway `postgres:17` first; record resets per ADR-060 · freeze sequence:
locked manifest → `freeze:update` adds v6/v9 → ceremony ends `node
scripts/check-frozen-workflows.mjs --lock-deployed` + commit.

**Acceptance: Half 2 (sandbox, labelled-synthetic tax-stating, ADR-048 sanction) FIRST, then
Half 1 (RS real 22)** — Half 1 only after the §2 open preflights and per skeleton §4.1's
fixtures (#12, #15, #16 — a refusal is a PASS on #15). Claimable/not-claimable exactly per
skeleton §4.2.

---

## §4 The nine OCR compensating controls — restated (7A-R9)

Origin: `wave-a2.1-contract.md` §3.3 (Codex Q6, all nine adopted). This restatement carries
the current enforcement map and supersedes that file's `:17` summary (which misstates
control 7). Post-time skip receipts are named, never inferred (Law 2).

1. **Distinct `ocr_sales` evidence class** bound into the signed rule + content hash;
   inherits nothing from structured or purchase rules. Post-time: the evidence class is
   **re-derived from the lane**, not read from the rule.
2. **Positive polarity evidence** independent of caller-selected `coding_kind` (classifier's
   verified kind or explicit human type attestation). No OCR CN / self-billed autopost ever
   (`cn_not_autopostable`). Skip receipt: `polarity_unverified`.
3. **Hard direction evidence** — supplier TIN/BRN + name/alias match to the client; buyer must
   not resolve to the client; name-only direction stays human. Requires a `tin`/`ssm`
   `client_identifiers` row (`0030:881-933`). Skip receipts: `direction_unproven`,
   `buyer_mismatch`.
4. **Full multi-anchor corroboration** — the `0023:304-346` predicate: total + invoice number +
   date + explicit net and tax (explicit zero counts; missing does not) + exact
   `net+tax+rounding=gross` + a second independent numeric anchor. Gated at post via
   `_invoice_fact_state` `corroborated` (`0030:815`); receipts `anchor_missing`,
   `not_corroborated` (checked last).
5. **Existing resolved customer only** — no counterparty birth in this lane (`0030:633-672`);
   post-time control requires a live `kind='customer'` row (`0030:1014-1021`); receipt
   `customer_unresolved`.
6. **The earned floor** — ≥6 qualifying human-approved OCR-sales sightings across distinct
   documents/stated invoice numbers, ≥60-day posting-date span; overrides + rule-posted outputs
   excluded (`_ocr_sales_floor`, `0016:1579`; callers propose/sign/post + the new preview =
   caller four). **Hardened this wave: `+ corroborated>=6` and `+ coding_kind='sales_invoice'`
   (7A-R4).** Post-time re-check under `pg_advisory_xact_lock(203005004, hashtext(client_id))`;
   receipt `floor_lost`.
7. **Bounds per WA21-R10 — same as the structured class** (monthly cadence / ≤3 posts /
   12-month rule expiry / cap ≤ the firm's high-stakes line). The envelope's other controls,
   not tighter bounds, differentiate OCR — this is the owner override the `:17` summary
   misstates.
8. **`execute_rule_post` re-derives every control at post time** — no trust in signing-time
   state.
9. **Ambiguity ⇒ visible skip + the draft stays for human review**; repeated direction/type
   failures (three `direction_unproven` skips in 30 days) **suspend the rule pending
   re-signature**.

---

*Contract ends. The skeleton's §0–§5/§7 carry all mechanism detail; §6 is resolved by §1
above. ADR-063 is the log entry; PART 2 carries the open register.*
