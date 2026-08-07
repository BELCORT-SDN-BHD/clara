# §7-A — THE UNATTENDED SALES DRAFTER · DESIGN SKELETON **v2**

> **STATUS: §6 RESOLVED — see `wave-7a-contract.md` (7A-R1..R12, owner-grilled 2026-08-06).**
> This document remains the mechanism of record for §0–§5/§7; on any conflict with the
> contract's rulings, the contract wins (it supersedes exactly one lean: §3.2 → shape (B) with
> a kill-switch, 7A-R1).
>
> **REVIEW PROVENANCE**
> `v1` (design lane, 2026-08-06) → native orchestrator read (**clean**) → **Codex `gpt-5.6-sol`
> xhigh cross-model verdict: NOT-READY**, 4 invalidating mechanics + 8 required changes
> (`scratchpad/codex-7a-verdict.txt`) → **v2 = this fold**. Every Codex finding below was
> re-verified against the cited code by the design lane before acceptance; two of them correct
> v1 errors, and the fold added two findings Codex did not have (§0.3).
>
> **Owner rulings (2026-08-06, binding, NOT re-openable):** both halves get acceptance · the
> floor/corroboration mismatch gets the ROOT fix on both layers · full house arc as an
> independent mini-wave · "sales drafted as supplier_bill" is VERIFIED NOT A BUG · ADR-061 keeps
> review intensity UNIFORM.

---

## 0. Verification ledger

### 0.1 The three headline facts — all CONFIRMED (v1 + Codex agree)

| Claim | Evidence |
|---|---|
| `"supplier_bill"` hardcoded in a `@frozen` file | `autoDraft.v5.tools.ts:174` (arg 14 of `wake_draft_entry`); `// @frozen` line 1; registered in `frozen-workflows.json` |
| credit-sighting accrual has no `coding_kind` term | `0037:2046-2061` — the OUTER guard excludes only receipts/payments; the credit INSERT accepts any active `income` credit |
| corroboration requires `v_tax is not null` | `0023:311`, inside `clara._invoice_fact_state_at`; rationale `0023:299-303` |

**Codex's added consequence — ACCEPTED and load-bearing.** Neither the sighting insert nor the
floor requires `j.coding_kind='sales_invoice'`. A corroborated, document-backed **generic
`journal_entry`** with a customer counterparty and an income credit contributes to
`_ocr_sales_floor` exactly like a sales invoice. **Adding `corroborated` alone does not prove the
posting authority was earned from sales-invoice approvals.** See §6 Q4b.

### 0.2 Where v1 was WRONG (owned, corrected)

1. **`settle_autodraft_task` IS recut** — live body is `0036:856-990`, not `0011:2642`. v1 said
   "never recut"; that came from a `grep | head -20` that truncated away the 0036 hit. *A
   truncated search is not evidence of absence.*
2. **"An un-recut floor caller fails at runtime" is FALSE, and the truth is worse.** All three
   callers select named columns (`qualifying`, `distinct_invoices`, `span_days`) that survive the
   proposed shape (`0016:1732-1742`, `0016:1817-1826`, `0030:1022-1035`). An un-recut caller
   **succeeds while silently omitting the `corroborated>=6` gate.** Silent, not loud.
3. **The counterparty "two halves" reading was inverted.** Live source (`0028:1201-1217`, the
   latest `_draft_entry_core` recut chain ending `0016:3970`) gives the **explicit proposal kind
   precedence**, then derives from coding_kind. So *either half alone yields `customer`*; the
   dangerous case is **CONTRADICTION** (`sales_invoice` + `kind:'vendor'` → vendor;
   `supplier_bill` + `kind:'customer'` → customer). Fix is to derive, not to require both.
4. **Settlement lives in `.impl.ts`** (`autoDraft.v5.impl.ts:223-242`), not `.tools.ts`.
5. **Freeze-check numbering:** import-escape is **2b** (`check-frozen-workflows.mjs:402-422`),
   registry monotonicity **4** (:461-469), enqueue provenance **5** (:471-483).
6. **The `slices/forks/RENUMBER.md` path is dangling in this checkout.** Cite `CLAUDE.md:175-182`
   and `.github/workflows/ci.yml:961-963` for the claim-at-merge law instead.
7. **v1's "these 22 will never accrue a qualifying sighting" contradicted v1's own design** —
   `qualifying` stays unfiltered, and human approval writes the sighting regardless of tax. They
   **do** accrue qualifying sightings and contribute **zero** to `corroborated`.
8. **v1 missed rule D1 entirely** (§3).

### 0.3 Two findings this fold adds (neither in v1 nor the verdict)

- **`_ocr_sales_floor` is pinned in two historical roster assertions.** `0042:5536` and
  `0044:6525` assert the set of clara bodies spelling the Asia/Kuala_Lumpur conversion is exactly
  `_book_today _ocr_sales_floor ack_compliance_watch evaluate_sst_watch evaluate_sst_watches_all
  record_future_attestation reverse_entry`. The floor's `(now() at time zone
  'Asia/Kuala_Lumpur')::date` is why it is on that list. The drop/recreate must **either preserve
  that literal expression or switch to `clara._book_today()` and acknowledge the roster change** —
  0042's own text says a MISSING name "means a recorded pre-existing copy moved, which this
  migration must acknowledge rather than discover later."
- **A third refusal for v6's map: `sst_account_missing`, and it is CLR10 not CLR21**
  (`0016:2006-2013`), fired only when `v_tax is not null and v_tax > 0`. Confirms Codex's
  "conditional on POSITIVE tax" and adds a mapping v1 and the verdict both omitted.

---

## 1. Scope & non-goals

**The asymmetry.** `chatTurn.v8.tools.ts:174` and `autoDraft.v5.tools.ts:174` are the same
positional argument of the same DB call — one passes the model's `coding_kind`, one passes a
constant. chatTurn had this exact defect fixed by the v3→v4 repoint; autoDraft never did.

**But v1 oversold "nothing new is invented."** The DB *draft door* is ready (`wake_draft_entry`
takes `p_coding_kind` and forwards it with `p_is_human=false`; the allowlist row exists as one of
exactly six, count-asserted at `0011:4169-4175`; the role grant is held; `_document_direction` and
`_assert_sales_invoice_shape` are built). **The DB *admission path* is not** — see §4.1's four
blockers. This wave therefore **does** change judgement logic in `_coding_lane_core`, and §1's v1
sentence "no relaxation of any mechanism" was wrong as written. The honest statement:

> **Mechanism SCOPE changes; mechanism STRENGTH does not.** `tier_a_fails` and the vendor-binding
> customer path must gain a sales-aware branch. That is a deliberate, reviewed policy change to a
> gate — not a bypass, not a weakening, and not covered by ADR-060's data-only authority.

**OUT of scope:** MyInvois/e-invoice XML (zero XML exists in any corpus; Gate S's real-XML leg was
re-scoped to operating runway 2026-08-06 — **do not claim it**) · Wave E surface · new structural
invariants, wake rows, roles or grants on the draft path · any real/production autopost claim (the
autopost half is labelled-synthetic under the ADR-048 sanction) · Gate P's capitalised/mixed
purchase allocation.

---

## 2. The six-item bundle

### (a) `autoDraft_v6` + the counterparty-kind contract · **L**

**Sites.** Six new `autoDraft.v6.*` files + `registry.ts:40` repointed v5→v6. Freeze check 2b
(IMPORT-ESCAPE) forbids sharing across versions, which is why every prior version duplicates all
six files.

**Delta vs v5** (everything else is a byte-identical version rename):

| File | Change |
|---|---|
| `.prompt.ts` | `draftJournalEntryInputSchema` gains `coding_kind`; `vendor` generalises to a counterparty shape; `lines`/`document_id` `.describe()` stop being purchase-only; sales shape guidance added |
| `.tools.ts` | arg 14 becomes `input.coding_kind`; **the proposal `kind` is DERIVED in the tool from `coding_kind`, never a second model choice**; tool description generalised |
| `.impl.ts` | **the settle step** (`:223-242`) moves to the 6-arity call carrying `getWorkflowMetadata().workflowRunId` (item d) |
| `.errors.ts` | adds `tax_leg_missing`, `type_polarity_mismatch`, `sst_account_missing`; **and makes the generic messages direction-neutral** — today `:47-58,66-74,103-107` say "bill", "supplier", "vendor" |
| `.infra.ts` / `.ts` | version rename only |

**THE COUNTERPARTY CONTRACT (rewritten — v1 had this backwards).** Live precedence is
`coalesce(explicit proposal kind, derive-from-coding_kind)`. Explicit **wins**. So the failure mode
is not omission, it is **contradiction**. Three-layer fix:

1. **Tool** derives `kind` from `coding_kind`; the model never chooses it independently.
2. **Zod schema** rejects a mismatched pair outright.
3. **DB** rejects a contradictory coding-kind/counterparty-kind pair in the draft writer — the
   only layer that is authority. (Layers 1-2 are ergonomics; a model cannot be the guard.)

**Why it matters:** post-time control 5 (`0030:1014-1021`) refuses `customer_unresolved` without a
live `kind='customer'` row. Worse, `_draft_entry_core` enters the **production vendor-binding
resolver** only when `not p_is_human` AND a document exists AND `v_kind='vendor'`
(`0028:1212-1274`) — so a sales invoice mislabeled vendor **enters vendor binding and can be
stamped as a vendor** (`0028:1275-1341`), while a supplier bill mislabeled customer **bypasses
vendor binding entirely**. Both are quiet wrong answers.

**Risks.** The contradiction path above · prompt bloat degrading the *already-live* purchase lane
(acceptance must re-prove purchase) · `_assert_sales_invoice_shape`'s type whitelist (inert for
OCR docs, live for structured) · the `sst_output` chart precondition on positive tax.

### (b) The signing-time evidence preview · **M**

**Sites.** DB: a new SECURITY DEFINER read verb in the migration. Dashboard:
`apps/dashboard/app/rules/AutopostRulePanel.tsx` (owner of the SIGN act) via `shared/reviewApi.ts`.

**Specification (v1 left all of this undefined — Codex's §2(b) MISSING verdict accepted):**
- Calls `_human_ctx(viewer)` and scopes through `firm_id = c.firm`, matching
  `list_autopost_rules` (`0015:2852-2866`).
- Returns not-applicable for non-sales / non-`ocr_sales` / inaccessible rules.
- **Defines** what `tax_silent_documents` counts — recommend: distinct documents among the
  *qualifying* entries that fail corroboration.
- Carries an evaluation timestamp and is labelled **advisory**; sign re-checks the live floor.
- **Calls the centralised floor rather than duplicating its predicate — which makes it the FOURTH
  live caller**, and it must be counted as one in the migration's caller census.
- Renders as **integer counts, not through `fmtCents`** (the panel's `:73-80` currency formatter is
  for caps).

**Advisory, because (c) makes the floor itself the block.** Mechanism in the DB, explanation in the
UI.

### (c) `corroborated` inside `_ocr_sales_floor` + the two doc defects · **M**

**Sites.** `_ocr_sales_floor` (`0016:1579`, never recut) + its **three live callers** — propose
`0016:1732-1742`, sign `0016:1817-1826`, post `0030:1022-1035` — **plus the new preview as caller
four**.

**Mechanism.** The floor already evaluates `_invoice_fact_state(j.document_id)` for `invoice_id`;
`corroborated` is a sibling key of that same jsonb (the exact signal `execute_rule_post` gates on
at `0030:815`). **Codex correction accepted:** two *textual* calls are not guaranteed to be one
evaluation, so the revised query must **factor the state explicitly** (lateral join) rather than
rely on "same object ⇒ no new cost".

**Proposed shape:** `returns table(qualifying int, distinct_invoices int, corroborated int, span_days int)`
— adds `corroborated`, deletes the never-read `distinct_docs` (doc defect 2). Keep `qualifying`
and `distinct_invoices` unfiltered so (b) can show the gap; all four callers add
`coalesce(corroborated,0) >= 6` as a **positive** gate. Doc defect 1 (header says "human
approvals span", body measures `posting_date`) is corrected in the recut comment.

**SIGNATURE + SAFETY HAZARDS — the full list:**
- `CREATE OR REPLACE` cannot change a `RETURNS TABLE` shape; this is DROP + CREATE.
- The body is a string-literal SQL body, so PostgreSQL establishes **no dependency** — the drop is
  silent. The migration runner gives one transaction per migration (`packages/db/scripts/migrate.mjs:143-156`),
  so the recut must be same-transaction.
- **v1's proposed "no old 4-column shape in prosrc" assertion is insufficient** — existing callers
  never mention `distinct_docs`, so there is no reliable caller token. **The tail must instead
  assert the exact live caller set AND positively require each authority writer to select
  `corroborated` and gate it at six.**
- **Drop/recreate does not preserve the ACL.** Re-establish owner, `SECURITY DEFINER`, pinned
  `search_path`, and `REVOKE ALL … FROM PUBLIC` (`0016:1595`).
- **Preserve the Asia/Kuala_Lumpur expression or acknowledge the 0042/0044 roster change** (§0.3).
- The corpus holds **seven historical invocation texts** (`0016:1737,1821,2738` · `0022:1453` ·
  `0023:854` · `0029:966` · `0030:1029`) — only three are current caller definitions. A text-based
  prestate will hit all seven and must not "fix" the dead ones.

**Purchase isolation CONFIRMED by both lanes:** the purchase evidence floor is the separate
`v_seen<3` branch (`0016:1714-1725`); the OCR floor sits under `v_evc='ocr_sales'`
(`0016:1727-1743`); `structured` sales never calls it.

### (d) Caller-run-identity on `settle_autodraft_task` · **S**

**v1's identity was WRONG. Corrected:**
- `autodraft_attempts.run_id` is a **uuid** FK to `sweep_runs` (`0011:699-708`) — the sweep id.
- `agent_tasks.workflow_run_id` is **text**, the engine run id (`0006:138-147`).
- `begin_autodraft_task` stores the workflow run id while *returning* the sweep uuid as `run_id`
  (`0011:2615-2639`), and `0036:927-933` states the missing comparison is against
  `agent_tasks.workflow_run_id`.
- The workflow **already holds the right identity** — `getWorkflowMetadata()` at
  `autoDraft.v5.impl.ts:69-75`.

**Required signature: 6th argument `p_workflow_run_id text`, REQUIRED (no default), sourced from
`getWorkflowMetadata().workflowRunId`.** Not the admission-time uuid.

**Overload safety CONFIRMED:** a 6-arity with all six required does not overlap a 5-arg call, and
PostgREST dispatches named-JSON RPC by parameter set — but note `settle_autodraft_task` is **not
called through PostgREST at all** (direct node-postgres at `autoDraft.v5.impl.ts:223-242` and
`reconciler.mjs:311-319`; granted to `clara_runtime`, not `clara_authenticated`, at
`0011:4045-4054`). PostgreSQL forbids a required parameter after defaulted ones, so `p_entry` and
`p_refusal` must also be non-defaulted in the new overload.

**Other corrections:** the new body must **preserve 0036's** terminal/supersession no-ops and
shared attempt cap, not clone 0011 · reconciler correctly **stays** on the 5-arity · the new tail
must positively assert **exactly two signatures** (0011's one-overload assertion will not rerun) ·
**both overloads need identical runtime-only ACLs**, because `rig-meta.mjs:753-777` sweeps every
function OID while keying expected roles **by name**.

### (e) Refusal copy · **S**

`autoDraft.v6.errors.ts` only (never v5 — frozen, and a version must not couple to another's file).
Add `tax_leg_missing` (real, `0036:828`, pinned `0036:1642-1659`; a **purchase** belt narrowed to a
purely expense-typed debit side), `type_polarity_mismatch` (sales `0016:1986-2003`, supplier
`0016:4121-4129`) and `sst_account_missing` (CLR10, positive-tax only, `0016:2006-2013`).
**And make the generic messages direction-neutral** — adding tokens while leaving "bill/supplier/
vendor" wording leaves sales refusals purchase-worded.

### (f) `chatTurn_v9`, one prompt line · **S**

Six new `chatTurn.v9.*` files + `registry.ts:36` repoint. Genuinely behavioural: v8 teaches every
supplier bill as AP-backed (`chatTurn.v8.prompt.ts:137-156`) and reserves `journal_entry` for
voucher-shaped documents (`:167-172`). Severable — but no other chatTurn bump is scheduled, so it
rides this wave or waits. Grep the built bundle after the edit (the WDK silent directive-swallow).

---

## 3. Migration plan and rollout

**ONE DB migration; number claimed at MERGE** (`CLAUDE.md:175-182`, `.github/workflows/ci.yml:961-963`
— the `slices/forks/RENUMBER.md` path v1 cited is dangling in this checkout). Frontier is 0045.

| Layer | Items |
|---|---|
| **DB** | (c) floor drop/recreate + four caller recuts · (b) preview verb + grants · (d) the 6-arity + ACL parity + two-signature tail · **the `_coding_lane_core` recut and the admission direction contract (§6 Q1)** |
| **Runtime** | `autoDraft.v6.*` ×6 + repoint · `chatTurn.v9.*` ×6 + repoint · `freeze:update` · `.impl.ts` settle change |
| **Dashboard** | the preview readout |

### 3.1 Rule D1 — write-quiesce (v1 MISSED THIS ENTIRELY)

`packages/db/README.md:99-118`: **any migration that replaces audited writer bodies requires an
application write-quiesce for its deploy window**, because PostgreSQL runs each in-flight PL/pgSQL
execution to completion on the body it *started* with. This migration replaces propose, sign,
execute, settle, admission and coding-lane writers — **D1 binds.**

### 3.2 The deployment-order hazard — v1's slice order was UNSAFE

v1 put the DB (Slice 1) before the runtime (Slice 2). **In that interval the DB sales path is open
while `autoDraft_v5` — still the live registry pin — hardcodes `supplier_bill`.** Sales documents
would route into the purchase-only drafter. Two acceptable shapes; pick one at grilling:

- **(A) Expansion / activation split.** Migration 1 ships everything *inert* (new floor shape, new
  overload, preview verb, lane branch behind a disabled predicate). Deploy and verify v6. Migration
  2 flips activation. Two ceremonies, no open interval. **RECOMMENDED** — it is the only shape
  where the sales path is never open to v5, and it degrades safely if the deploy is slow.
- **(B) One continuous quiesce** spanning DB-activation → verified-v6-deploy: stop runtime,
  admission and human write paths, drain in-flight work, apply, deploy, verify, resume. One
  ceremony, but the quiesce window is the length of a deploy.

**The quiesce must span the activation-to-v6-ready interval, not merely the migration transaction.**

### 3.3 Ceremony notes

- **`statement_timeout` recipe (ADR-059)** applies only if a whole-schema lex pass exists. No
  migration currently sets it. The floor tail's "assert the exact live caller set" **is** a
  `pg_proc`-wide scan (the `pronamespace='clara'::regnamespace` shape at `0045:811/954/1107`), so
  **plan for the recipe**; targeted `p.oid = v_sig::regprocedure` probes alone would not need it.
- **Freeze manifest sequence:** lock the already-shipped manifest **before** any rebaseline → add
  v6/v9 via `freeze:update` → lock the new entries **after** their deploy ceremony.
  `freeze:update` preserves `deployed:true` but never grants it (`check-frozen-workflows.mjs:308-333`);
  `--lock-deployed` sets every flagless entry and is CI-refused (`:336-343`).
- Rig-validate on a throwaway `postgres:17` before anything live. Record the reset per ADR-060.

---

## 4. Acceptance — both halves rewritten

### 4.1 Half 1 — the drafter on the 22 real RS invoices · **CANNOT RUN AS v1 WROTE IT**

**Client: ROME SECRETARY SDN BHD** (`e054b797-…`), firm BELCORT. Corpus
`C:\Users\zhant\Desktop\RS - YA2025\RS - YA2025\RS - Sales Invoice\` — 22 PDFs, all with a text
layer, 12 distinct customers, RM27,315.00, 06/06/2025→09/12/2025 (~186 days), **0 of 22 state SST**.
Ingest is the ADR-050 chain (`POST /api/intake/documents` → bytes → finalize → `documentIngest_v2`
→ matcher → **human `file_document`** → classify → facts gate → `invoiceFacts_v1` → event →
admission → drafter).

**FOUR MEASURED ADMISSION BLOCKERS — all verified this session:**

1. **`tier_a_fails`.** A non-corroborated document appends `tier_a_fails` (`0031:340-342`), and the
   `ready` decision removes only `rule_backed` and `vendor_bound` (`0031:519-520`). **All 22 are
   tax-silent ⇒ none can ever reach `ready`.**
2. **Customer birth routes through vendor binding.** The lane *does* read
   `invoice.customer_name` for sales direction (`0031:350-365`) — but the resolution branch then
   calls `_resolve_vendor_binding` regardless of kind (`0031:428`) and an unresolved binding
   appends **`vendor_unresolved`** (`0031:453`), which also blocks `ready`. **All 12 unknown
   customers are rejected before v6 ever runs.**
3. **Admission returns `lane_changed`** for anything not `ready` (`0036:1364-1375`).
4. **No authoritative direction/coding-kind is carried** into admission or the workflow context
   (`0036:1454-1470`; `autoDraft.v5.impl.ts:57-67,90-101`).

⇒ **Half 1 requires the `_coding_lane_core` recut and the §6 Q1 direction contract as
preconditions.** It is not an acceptance run that can be scheduled independently of the build.

**The RS identifier precondition needs EXACT-VALUE handling** (v1 flagged it; Codex sharpened it):
the SSM prints as an **unlabeled standalone line** beneath the issuer name, and the fallback
identity reader recognises only a closed label set ("Company No", "SSM No" —
`packages/runtime/lib/invoice-vendor-identity.mjs:87-109,331-352`), so **that reader will not emit
it.** Capture depends on Azure producing a typed `VendorTaxId` (`invoiceFacts.v1.azure.mjs:385-398`).
If captured, `_document_direction` compares **normalised values for exact equality**
(`0015:503-529`). ⇒ **The preflight must ingest one document, read the PERSISTED
`invoice.vendor_registration`, and store its exact equivalent** — never a pre-chosen "an RS SSM".

**Chart preconditions:** RS has no revenue account and no trade-debtors account (its entire
3xx/4xx/5xx range is `400-000 TRADE CREDITORS`) and zero customers.

**The three adversarial fixtures — Codex verified #15 and #16 against the real PDFs; keep all three:**

| # | Fixture | PASS | FAIL |
|---|---|---|---|
| 12 | filename "RESTAURANT" vs content "RESTAURANTS" | counterparty from content; #1 and #12 resolve to ONE counterparty | a near-duplicate is born |
| 16 | filename "LUMINOUS" vs content "LUMINOUS EVENTS" | same | same |
| 15 | addressed INF ADVISORY, stray body line `Client Name: FINCARE SDN BHD` | INF ADVISORY **or** a named refusal | **a silent FINCARE booking** |

Fixture 15 is the real one — FINCARE is a genuine other customer in the same corpus (#10), so the
wrong answer is plausible and quiet. **A refusal is a PASS.** Exactly Law 2's shape.

**Corrected claim.** The 22 **do** accrue `qualifying` sightings on approval (the insert is
tax-blind) and contribute **zero** to `corroborated`. v1's "will never accrue" was inconsistent
with v1's own unfiltered-`qualifying` design.

### 4.2 Half 2 — autopost on labelled-synthetic tax-stating invoices

**Client "Fictional Test Services" under ROME PUBLIC ADVISORY `39008536`** — the ADR-048 sanction.
The sandbox is the **only** place this can run: control 3 needs a `tin`/`ssm` `client_identifiers`
row (`0030:881-933`); the sandbox has both, neither real client has either, and control 9 suspends
a rule after three `direction_unproven` skips in 30 days.

**"States explicit tax" is NECESSARY BUT NOT SUFFICIENT.** The synthetic generator and the
acceptance assertions must satisfy the **full `0023:304-346` predicate**: exactly one positive
gross with page-polygon geometry · MYR · amount-due absent or equal to gross · deposit absent or
zero · no ineligibility marker · unique net and tax · **two-reader agreement on each** ·
non-negative net/tax/components · bounded rounding · the exact `net+sc+dlv+tax+round−disc = gross`
identity.

**Floor accrual** (currently 3/3/3/0 against 6/6/60 + the new `corroborated>=6`): ≥6 human-approved
entries, each with a credit leg on an active `income` account and a bound `kind='customer'`
counterparty; `approved`, unreversed, `checked_via_rule_id is null`, document-bound, no
`amount_override`/`duplicate_override`; ≥6 **distinct stated invoice numbers** (no document-UUID
fallback); ≥60 days of **posting-date** span — back-datable in one sitting; **and ≥6 corroborating**.

**`sst_output` preflight is conditional on POSITIVE tax** (`0016:2006-2013`, CLR10
`sst_account_missing`) — not on a merely non-null tax statement. The live sandbox chart is an
**external** preflight; the repo cannot prove that account exists.

**Post-time controls that must be SEEN firing** (named receipts, never inferred): evidence-class
re-derived from the lane · `polarity_unverified` · `direction_unproven` · `buyer_mismatch` ·
`anchor_missing` · **`customer_unresolved`** (the payoff of §2a) · `floor_lost` under
`pg_advisory_xact_lock(203005004, hashtext(client_id))` · `not_corroborated` last.

**Claimable:** an `ocr_sales` rule proposed → signed → posted unattended on labelled-synthetic
tax-stating invoices — the envelope's first exercise ever. **Not claimable:** any real-document
autopost; anything about MyInvois XML.

---

## 5. The ladder (ADR-061 — UNIFORM, full ladder on both halves)

design grilling → build (sliced per §7) → per-slice two-lens rounds (implementation + a
**contract-blind** test lane, run to CLEAN on both) → cross-model (Codex `gpt-5.6-sol` xhigh via
direct `codex exec`, never the companion queue) → merge gate (green CI incl. freeze-lint checks
2b/4/5, leak scan, typecheck, build, DB smoke; the owner-ruled native merge-gate substitute;
`main` PR-only) → **ceremony per §3.2's chosen shape, with D1 quiesce** → acceptance.

**Law 1 binds every item here** — (a), (c), (d) and the Q1 lane recut are all judgement logic and
each needs an independent review pass before merge.

---

## 6. Open questions for grilling

**Q1 — the routing contract. REWRITTEN: "make the walls kind-aware" is not implementable.**
`_autodraft_sales_direction` is boolean and collapses CLR30 to false (`0036:490-518`), so clean
sales gets `sales_direction` while a CLR30 contradiction proceeds to `_coding_lane_core` and is
recorded as `lane_changed`/`direction_unresolved` — **a different token than v1 assumed**
(`0031:344-350`; `0036:1335-1345,1364-1374`).
**RECOMMEND: a DB-authoritative TRI-STATE direction contract** — `sales` | `purchase` |
`unresolved` — with the **allowed coding-kind family bound at task/admission and revalidated in
the DB draft writer**. Model-selected `coding_kind` is *not* routing authority; it is a proposal
checked against the bound family. Keep both existing defences; keep `sales_direction` by name so
historical `sweep_run_items` receipts stay readable.
**SUB-QUESTION THE OWNER MUST RULE:** *may tax-silent sales bypass `tier_a_fails` for
DRAFT-ONLY use?* Recommend **yes, narrowly** — a draft is a human-review artifact, not authority,
and `tier_a_fails` still blocks every posting path. But it is a gate policy change and belongs to
the owner, not the build.

**Q2 — the catch-up stampede. Real, but v1 misstated it.** Candidate selection is estate-wide with
no limit (`0011:2771-2783`, patched at `0017:136-150`, `0036:1119-1149`); the runtime loads all
rows and processes each firm in ONE transaction (`autodraft.mjs:250-276`); default reserve is
40,000 tokens (`:33-37`) against a 60%-of-1,000,000 sweep share (`0036:1387-1418`) ⇒ **up to ~15
successful admissions from an empty daily budget**. Budget-refused rows still write sweep items but
**do not consume an attempt** (attempts increment only when a running task settles `failed`,
`0036:962-973`). **RECOMMEND a durable per-firm cursor/cap plus an explicit backfill operation —
NOT v1's date cutoff, which risks permanently stranding old sales filings.**

**Q3 — customer birth. CONFIRMED, after the routing fix.** Birth happens only at approval and
records the approving actor as `created_by` (`0037:1846-1870`); the post executor refuses a birth
before selecting a rule (`0030:633-672`); control 5 requires a live customer (`0030:1014-1021`).
Acceptance must prove: no counterparty row before approval → a birth decision on the draft → the
row created by the approving human → only later sightings/rule use.

**Q4 — blast radius. CONFIRMED for the three current callers; the proof sketch needed work.** Seven
historical invocation texts, not four; the preview is a legitimate fourth post-migration caller.
**Q4b (NEW, from §0.1):** `corroborated` does not close the **generic-JE provenance hole** — a
corroborated `journal_entry` with a customer counterparty and an income credit still feeds the
floor. **RECOMMEND deciding explicitly whether the floor should additionally require
`coding_kind='sales_invoice'`.** My lean: yes — posting authority for sales invoices should be
earned from sales invoices. Flagging it as the open decision it is.

**Q5 — DOWNGRADED to unverified preflight.** The historical sequence holds: six RPR sales invoices
approved 2026-07-22 during the 0015 live eval (`PROJECTLOG-ARCHIVE-ADR-022-043.md:38-40`),
credit-sighting insertion introduced in 0016 (`0016:1456-1479`), 0016 deployed 2026-07-23
(`REBUILD-PLAN.md:47-53`), credit pool empty at that close (`wave-a2.1-contract.md:28`).
**That proves zero credit sightings AT THE 0016 CLOSE — not "zero real sightings today", and not
the 7-synthetic/3-qualifying counts.** Those need a **fresh signed production query at build time**
and stay "unverified preflight" in the design. *(v1 asserted them as current fact; that was a
derived state presented as evidence.)*

**Q6 — reconciler stays on the 5-arity.** CONFIRMED by both lanes.

**Q7 — is creating RS's sales side in scope?** Explicit owner yes/no before Half 1. If no, Half 1
moves to the sandbox and loses its "real documents" claim — a material downgrade the owner should
choose knowingly.

**Q8 — DISCHARGED.** PR **#198** ("chore: deploy-lock the 26 live-but-unlocked frozen workflow
entries") is open and mergeable with CI running; Codex independently derived the same
lock-before-rebaseline sequence. **Only the forward half stays live: lock v6/v9 AFTER their deploy
ceremony.** (Note the gap was broader than v1 said — documentIngest v2, statementFacts v1,
firmInterview v3 and clientOnboarding v3 were flagless too, all covered by #198.)

**Q9 — `journal_entry` in v6's enum?** RECOMMEND no for the unattended lane.
**Q10 — `sales_credit_note`?** RECOMMEND accept in schema (the DB already does), build no acceptance.
**Q11 — classifier changes?** RECOMMEND none; select on `document_kind='invoice'` + direction.
**Q12 — the nine controls** live in `wave-a2.1-contract.md:150-168`, whose own summary at `:17` is
**inaccurate about control 7**. RECOMMEND this wave's design doc restates all nine with the current
0016/0030 enforcement map and supersedes the bad summary.

---

## 7. Sizes and build order

| Item | Size | Note |
|---|---|---|
| (a) `autoDraft_v6` + counterparty contract | **L** | now carries the Q1 routing contract |
| **the `_coding_lane_core` recut** | **M→L** | **new in v2** — Half 1 cannot run without it |
| (c) floor + defects | **M** | drop/recreate, four callers, ACL, roster, lex tail |
| (b) preview | **M** | caller four |
| (d) 6-arity settle | **S** | identity corrected to `p_workflow_run_id text` |
| (e) refusal copy | **S** | three tokens + direction-neutral generics |
| (f) `chatTurn_v9` | **S** | severable |

**BUILD ORDER — restructured for §3.2 (v1's order was unsafe):**

- **Slice 1 — DB EXPANSION (inert).** Floor drop/recreate + four caller recuts + the 6-arity
  overload + the preview verb + the `_coding_lane_core` sales branch **behind a disabled
  activation predicate**. Nothing routes yet. D1 quiesce; ceremony 1. **Q5's measurement is taken
  here** and may reorder what follows.
- **Slice 2 — RUNTIME.** `autoDraft_v6` + (e) + the `.impl.ts` settle move + registry repoint;
  deploy and **verify v6 is live** before anything activates. The judgement-logic heart — heaviest
  review budget.
- **Slice 3 — ACTIVATION.** The second migration flips the direction contract on. D1 quiesce;
  ceremony 2. The sales path opens only once v6 is proven deployed.
- **Slice 4 — dashboard preview.** Depends on Slice 1's verb.
- **Slice 5 — severable `chatTurn_v9`.**

**Acceptance last: Half 2 (sandbox, fully controllable) BEFORE Half 1 (real RS documents),** and
Half 1 only after the Q7 chart decision, the exact-value identifier preflight, and the Q1
`tier_a_fails` ruling.

---

*v2 ends. §6 is the grilling agenda. §2-4 are proposals, not decisions. The four Codex blockers
are folded as structural changes, not annotations: §2a's contract, §2d's identity, §3.2's order,
§4.1's four blockers.*
