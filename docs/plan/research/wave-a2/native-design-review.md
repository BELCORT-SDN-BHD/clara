# Wave A2 — independent native design review (live-verified)

**Reviewer:** independent native lane (fresh context, no authorship bias).
**Targets:** `docs/plan/wave-a2-ar-myinvois-contract.md` (DRAFT v0.1),
`docs/plan/wave-a2-migration-0015-design.md` (DRAFT v0.1).
**Method:** every load-bearing design claim checked against as-built code
(migrations 0002–0014, `packages/runtime/lib/*`, `packages/runtime/workflows/*`,
`frozen-workflows.json`), not against the briefs. Owner rulings WA2-R1..R13 taken
as fixed; the review asks only whether the design faithfully and safely realizes them.

**Verdict: SOUND-WITH-FINDINGS.** The architecture is coherent and mostly faithful
to the invariants — the AB-3 identity mechanics, the login-direct grant pattern, the
one-live/supersede rule machinery, and the frozen-`documentIngest` claim all hold up
against the code. But there is **one CRITICAL gap (C1)** that, as written, would
egress customer PII to Azure with the consent/kill-switch bypassed, and **one HIGH
gap (H1)** that would make the standing-rules feature simply never fire. Both are
fixable within the current architecture; neither is a design dead-end. Fix C1, H1,
H2, H3, H4 before ratification; land M1–M5 as delta amendments.

---

## What is genuinely sound (verified, not asserted)

- **Two-extraction AB-3 fidelity (identity pass).** `record_rule_resolution`
  (`0011:41-51`) matches attribution ONLY from `engine_kind in ('ocr','structured_parse')`
  with `field_path like '%tin%' | '%ssm%' | '%account%'`, and structurally excludes
  `invoice_facts`. So `myinvois.supplier_tin`/`supplier_brn` attributing and
  `myinvois.buyer_id_*` never attributing is correct **for the auto-matcher**. The
  0011/0013 AB-3 probes (`0011:86-135`, `0013:34-40`) are the right precedent for the
  S0 collision assertion.
- **Login-direct grant is a real precedent.** `clara_runtime_login` is a LOGIN role
  that is a member of `clara_runtime` `with inherit false, set true` (`0006:78`);
  `record_rule_resolution` is granted to the bare login and explicitly NOT to
  `clara_runtime` (`0011:591-597`). The agent lane authenticates as a *different*
  login (`clara_agent_read_login → clara_agent_ro`, `0006:79`) and the wake write
  path is a third login (`clara_wake_write_login`, `0009:52`). So "agent never signs"
  holds at the role level; `execute_rule_post` on `clara_runtime_login` is topology-consistent.
- **Rule machinery reuse.** `sign_coding_rule` (`0011:2144`, bookkeeper+), the
  `unique_violation`-on-one-live pattern (`0011:2166`), retire/supersede, and the
  `_assert_supplier_bill_shape` constraint-trigger-at-approve (`0009:533-537`) are all
  faithful templates for `sign_autopost_rule` (admin+), the autopost one-live index,
  and `_assert_sales_invoice_shape`.
- **Frozen-`documentIngest` claim holds.** `documentIngest.behavior.mjs` (frozen,
  manifest line 92) dispatches `lane!=='ocr' && lane!=='none' → parseStructured`
  generically (`behavior.mjs:46-48`), so flipping `xml → structured_parse` needs only
  `structured-worker.mjs` (NOT frozen) to gain a UBL branch. Correct.
- **Engine-id prefix scheme currently matches.** OCR = `azure-di:prebuilt-layout:2024-11-30`
  (`egress.mjs:172`), facts = `azure-di:prebuilt-invoice:2024-11-30`
  (`invoiceFacts.v1.azure.mjs:16`), local = `clara-structured:v1` / `clara-store-only:v1`
  (`intake.mjs:30,36`). So `azure-*`=egress / `clara-*`=local is *currently* true.
- **Same-arity via jsonb** is honored for `_resolve_counterparty` (kind rides
  `p_proposal`, `0011:1335`) and `execute_rule_post` mirrors the DEFINER shape.
- **engine_kind CHECK needs no change** — `structured_parse` + `invoice_facts` already
  exist; the design correctly reuses them (S1).

---

## CRITICAL

### C1 — The egress-class gate is claim-side only; the FROZEN facts PROCESSOR still calls Azure unconditionally, so a "no-egress" MyInvois task would silently egress.

**Design claim (contract §3.1/§3.4, companion S6):** the MyInvois facts pass "is
enqueued from the DB exactly as Azure's is, but claims under the no-egress class"; a
local (`clara-*`) claim "proceeds freely… nothing leaves the box"; "OCR/Azure behavior
byte-identical."

**Code evidence:** `claim_document_processing_task` only *gates the claim*
(`0011:2333-2362`). The actual network call is in `invoiceFacts.v1.behavior.mjs:55`:
```
const result = await services.analyzeInvoice(tempPath, doc.mime_type, doc);
```
This is **unconditional** — no engine branch — and `services.analyzeInvoice` binds to
the Azure adapter (`invoiceFacts.v1.services.mjs:10 → invoiceFacts.v1.azure.mjs`).
`invoiceFacts.v1.behavior.mjs` is **FROZEN** (`frozen-workflows.json:104`). So a
`clara-myinvois:v1` `invoice_facts` task that the new gate lets through as "local, no
egress" would be handed to `analyzeInvoice` and **POSTed to Azure Document
Intelligence** — a cross-border egress of an e-invoice that carries the customer's
identity/TIN, with the kill-switch and per-client consent deliberately skipped. This is
the exact failure the consent gate exists to prevent, inverted by the design's own
optimization.

**Why the design misses it:** it treats "claims under the no-egress class" as
sufficient, but egress happens in the *processor*, not the claim. The claim gate and the
router MUST be co-designed.

**Fix:** route the engine branch through the **non-frozen** services layer.
`invoiceFacts.v1.services.mjs` is NOT in the manifest — make `analyzeInvoice(tempPath,
mime, doc)` branch on `doc.engine_id`: `clara-myinvois:v1 → local UBL facts parse`;
`azure-di:* → Azure`. Then `behavior.mjs` stays byte-identical (prove with a hash diff
against the manifest). If a branch inside the frozen `behavior.mjs` is unavoidable,
ship `invoiceFacts_v2` + registry repoint + `freeze:update` (contract §10's escape
hatch) — but say so; "no frozen file touched" is NOT currently established for the
facts pass. Add a runtime assertion + rig test: a `clara-*` engine task must never
reach any `egress.mjs`/`*.azure.mjs` code path. Cross-model review is mandatory here,
as the design says — but on the ROUTER, not only the gate.

---

## HIGH

### H1 — Missing plumbing: no draft ever cites a live AUTOPOST rule, so `execute_rule_post` can never fire.

**Design claim (contract §6.3, companion S5):** eligibility = "a draft whose
`rule_decisions` row cites a LIVE `autopost` rule with `account_matched=true`."

**Code evidence:** `_draft_entry_core` writes `rule_decisions` **only for
`rule_type='vendor_account'`** (`0011:475-494`, the query filters
`r.rule_type='vendor_account' and r.status='live'`), and `account_matched` is computed
there (`0011:487-488`). The table has `uq_rule_decisions_entry_revision unique(entry_id,
revision_token)` (`0011:879`) — **at most ONE decision per (entry, revision)**. The
design never specifies (a) that `_draft_entry_core` also matches live autopost rules and
writes their decision, nor (b) how an autopost decision coexists with a vendor_account
decision under the single-row-per-revision constraint. As written, an autopost rule is
never cited → the gate is unsatisfiable → the whole standing-rules executor is dead code.

**Fix:** prefer having `execute_rule_post` **match the live autopost rule directly**
(`client_id + counterparty_id + direction`, `status='live'`, `for share`) and
**re-derive `account_matched` in-fn** from the draft's current lines vs the rule's
`account_code` — rather than depending on a pre-written `rule_decisions` row. If the
`rule_decisions` route is kept, add `rule_type` to the unique key and specify precedence
when both rule tiers exist for one counterparty.

### H2 — Self-growth evidence pollution: rule-posts feed the sighting pool, violating WA2-R9 "human-approved sightings only."

**Code evidence:** the split core is the current `approve_entry` body, which
**unconditionally** inserts `rule_sightings` and auto-proposes at exactly 3 sightings
(`0011:3157-3192`), counting `j.status='approved' and j.reversed_by is null`
(`0011:3170-3172`) — which **includes** rule-posted entries. The design routes
`execute_rule_post → _approve_entry_core` "through-the-core… verbatim" (T4). So every
auto-post writes a sighting and can trigger proposals. WA2-R9 requires autopost
self-growth to draw on **human-approved** sightings only; reusing the "approve-time
auto-proposal machinery" (companion S3) with a ≥5-sighting bar over a pool that now
contains auto-posts lets rules breed rules from their own output.

**Fix:** gate the sighting/auto-proposal block (`0011:3157-3192`) on human approval —
skip it when the approval is via-rule (`checked_via_rule_id is not null`). And the
autopost-proposal query must filter its sighting pool to human-checked entries. Note the
tension with the "verbatim core" claim (T4): the core is NOT byte-identical between the
human and rule paths here, so the design must explicitly carve this out.

### H3 — `direction` is client-relative but the design puts it in a client-agnostic function; adding it violates the same-arity law or must move.

**Design claim (contract §3.3, companion S6):** "`_invoice_fact_state` (extended)
computes `direction`: if the document's supplier identity matches the filed client's own
`client_identifiers`."

**Code evidence:** `_invoice_fact_state(p_document uuid)` (`0009:139`) takes **only the
document** — it has no client. Direction ("is *this client* the supplier or the buyer?")
is inherently client-relative (a document can be filed to multiple clients). Adding
direction there forces either a new `p_client` parameter — which breaks the companion's
own "**Never change arity**" rule (companion header) and the same-arity CoR law — or a
wrong/ambiguous answer. `_invoice_fact_state` is also called from `approve_entry`
(`0011:3087`), the duplicate check (`0011:3117`), and `_coding_lane_core` (`0009:1482`),
all of which would inherit the confusion.

**Fix:** keep `_invoice_fact_state` client-agnostic (have it emit the supplier-identity
facts only) and compute `direction` in the client-aware callers (`_coding_lane_core`,
`_draft_entry_core`, `approve_entry`), or add a separate
`_document_direction(p_document, p_client)` helper. Correct §3.3 and S6.

### H4 — The login-direct grant elevates `clara_runtime_login` from *attribution* to *posting authority*; containment is code-discipline, not structural.

**Analysis:** `record_rule_resolution` (the cited precedent) only writes a
deterministic hard-identifier `client_resolution` — it cannot fabricate a number.
`execute_rule_post` **approves journal entries** (posts money). Granting it to
`clara_runtime_login` puts book-posting authority on the general runtime substrate
identity (the same login the pool uses before `SET ROLE`), and "reachable only by the
spine consumer" is a **runtime-code guarantee**, not the structural kind the four
invariants promise ("enforced in the DB, not by model discipline", ARCHITECTURE §0).
The agent role genuinely gains nothing (verified), so the *invariant text* is preserved
— but the trusted surface grows.

The in-fn gates DO bound the blast radius to "replay a human-signed, bounded rule
within its cap/window/direction," which is a real structural bound. To make that bound
trustworthy:

**Fix:** (a) ADR-025 must explicitly name `clara_runtime_login` as the trusted-substrate
boundary and state that `execute_rule_post`'s *in-fn eligibility gates* — not the caller
identity — are the wall; (b) `execute_rule_post` must **RE-DERIVE** `is_high_stakes`
(`0009:1513`), `total ≤ amount_cap_cents`, direction, and `account_matched` inside the
function against live rows, never trust a draft-time flag (safe only because
`rule_decisions` is keyed to `(entry_id, revision_token)` and the "revision current"
gate holds — state this dependency); (c) keep the tail isolation matrix asserting NOT
executable by `clara_runtime`, every wake role, `clara_agent_ro`, `clara_authenticated`,
PUBLIC (mirror `0011:591-597`).

---

## MEDIUM

### M1 — Skipping consent for local facts silently re-scopes the ratified WA-D1 consent ruling; no WA2 ruling authorizes it.

`claim_document_processing_task` keys the consent hold on `t.lane='invoice_facts'`
(`0011:2336-2347`) — WA-D1 gated invoice_facts **as a lane**. The design reinterprets
consent as attaching to **egress**, so a local `clara-myinvois` facts task skips it
(§3.4). On the merits this is defensible (a local parse has no PDPA cross-border basis,
the 0014 precedent), **but it is a scope change to a ratified ruling** that no WA2-R#
grants. Precedent 0014 exempted a specific *document class*, not an entire *engine
class*. **Fix:** add an explicit owner ruling / ADR-025 clause scoping WA-D1 to
"cross-border egress," and record the residual (a locally-parsed e-invoice's customer
PII lands in the DB without a consent row). Do not land as a silent design fiat.

### M2 — The "gate failure → skip, never raise" contract doesn't cover exceptions raised by the core itself.

`execute_rule_post`'s skip discipline (companion S5) covers *gate* failures. But
`_approve_entry_core` **raises** on races the gates can't pre-empt: concurrent human
approve of the same draft (`0011:3004`, status≠draft → CLR10) and stale revision token
(`0011:3007`, CLR06), both after `select … for update` (`0011:3003`). If those propagate,
the spine consumer errors and retries under the same op-key. **Fix:** `execute_rule_post`
must wrap the core call and convert benign `CLR10 (not-a-draft)` / `CLR06 (stale)` into a
`rule_post_skips` row, not a raise.

### M3 — Structured Tier-A is a substantial rewrite of a hot predicate, not an "extension."

`_invoice_fact_state` hardcodes non-empty polygon geometry as a corroboration
**requirement** (`0009:185-188`: `v_poly_ok … and v_locator='page_polygon'`). The
geometry-less structured Tier-A (§3.5) needs an engine branch there plus new reads of
`total_excl_tax`/`tax_total`/`tax_breakdown` and the arithmetic-tie enforcement — inside
a function called by approve/lane/dup. **Fix:** land it as a CoR that keeps the OCR path
**byte-identical** (rig exact-diff on the RPR polygon corpus) and add the engine branch
only for `clara-*` facts.

### M4 — The egress class rests on an engine-id **naming convention**, a brittle security boundary.

All current engine ids comply (verified: `egress.mjs:172`, `invoiceFacts.v1.azure.mjs:16`,
`intake.mjs:30,36`), but a future mapper minting a mis-prefixed id silently reclassifies
egress. **Fix:** classify against an explicit **allowlist of egressing engine_ids**
(`azure-di:prebuilt-layout:*`, `azure-di:prebuilt-invoice:*`), default-deny, with a
migration-tail assertion — not a `like 'azure-%'` prefix test.

### M5 — Kind-scoping must land atomically across five queries + two hardcodes, or a customer resolves against a vendor row.

`_resolve_counterparty` has ~5 lookup blocks with **no kind filter** (`0011:1375-1428`);
`approve_entry` births with `kind='vendor'` hardcoded (`0011:3039-3041`) and stamps
counterparties only on `account_class='payable'` lines (`0011:3057-3067`). Once
uniqueness is kind-scoped (S2), a sales customer sharing an SSM with a vendor could
resolve to the vendor. **Fix:** S7 must add the `kind`/direction filter to **every**
`_resolve_counterparty` lookup and generalize both `approve_entry` hardcodes
(birth-kind per `coding_kind`, stamp payable OR receivable) in the same migration; add a
rig case for a vendor+customer sharing one registration under one client (probe P3).

---

## LOW / edge-case lens (standing directive)

- **L1 — buyer-side auto-attribution gap (state it).** A *purchase* MyInvois e-invoice
  (client is the buyer) won't auto-attribute because `myinvois.buyer_id_*` deliberately
  avoids `%tin%`; it falls to human filing (mirrors AP). Not a safety hole, but §3.1
  reads as if e-invoice attribution is automatic — say it isn't for the buyer direction.
- **L2 — SST invoices are structurally non-autopostable.** `is_high_stakes`
  (`0009:1515`) includes `tax_affecting`; if `_draft_entry_core` sets that on
  SST-bearing sales entries, they can never auto-post (consistent with cap ≤ high-stakes,
  but the design should state it). Also OCR-sourced SST **leg** splits rest on
  non-geometry-corroborated `SubTotal`/`TotalTax` facts (only `invoice.total` is
  polygon-Tier-A, `0009:161`); mitigated by high-stakes attestation, but note it.
- **L3 — sales duplicate protection is soft.** AP has a HARD approve-time duplicate
  refusal (`0011:3108-3121`, CLR21 `duplicate_bill`); the design gives sales only a
  *lane reason* (§4.3 "near-dup by customer+date/total"). A sales invoice can be
  double-posted with no hard refusal — consider a hard sales near-dup gate.
- **L4 — "one local parse → two extractions" is imprecise.** The identity pass
  (`structured_parse`) is produced at `documentIngest`; the facts pass (`invoice_facts`)
  is a separate DB-enqueued task claimed later through the egress gate — two parses at
  two lifecycle points. The framing hides that the facts pass is separately gated
  (directly relevant to C1).
- **L5 — S0 collision assertion must be PERMANENT.** Because the whole AB-3 boundary is
  the field_path naming convention, the collision assertion (no facts/buyer key matches
  `%tin%/%ssm%/%account%`) must run in **every** future migration and be a mapper-level
  test, not only 0015.
- **L6 — WA2-R10 nudge delivery surface unspecified.** `reconcile_autopost_rules` raises
  "a renew-or-retire notification" and a ¾-term nudge (companion S3), but the delivery
  surface (`record_notification` vs the /queue feed) isn't named; specify it so the nudge
  is actually seen.
- **L7 — `laneSnapshot` engine id.** Flipping `xml → structured_parse` currently yields
  the generic `clara-structured:v1` (`intake.mjs:155`), not `clara-myinvois:v1`; the
  identity pass needs a MyInvois-specific engine snapshot branch. Under-specified in the
  companion's runtime bullet.

---

## Findings table

| # | Sev | Design claim | Code/law evidence | Fix |
|---|-----|--------------|-------------------|-----|
| C1 | CRITICAL | MyInvois facts "claim under no-egress class; nothing leaves the box"; no frozen file touched (§3.1/§3.4, S6) | `invoiceFacts.v1.behavior.mjs:55` calls `analyzeInvoice` (Azure) unconditionally; file is FROZEN (`frozen-workflows.json:104`); claim gate ≠ processor (`0011:2333-2362`) | Branch on `engine_id` in the NON-frozen `analyzeInvoice` service (or ship `invoiceFacts_v2`); assert no `clara-*` task reaches any egress path; cross-model review on the router |
| H1 | HIGH | Eligibility = draft's `rule_decisions` cites a live AUTOPOST rule (§6.3, S5) | `_draft_entry_core` writes decisions only for `vendor_account` (`0011:475-494`); one decision per revision (`0011:879`) | Match the live autopost rule directly in `execute_rule_post` + re-derive `account_matched`; or add `rule_type` to the decision key |
| H2 | HIGH | Self-growth from human-approved sightings only (WA2-R9); core runs "verbatim" (T4) | Core inserts sightings + auto-proposes unconditionally, counting auto-posts (`0011:3157-3192`) | Gate the sighting/proposal block on human approval (`checked_via_rule_id is null`); filter the autopost pool to human-checked entries |
| H3 | HIGH | `_invoice_fact_state` computes client-relative `direction` (§3.3, S6) | Function takes only `p_document` (`0009:139`); adding a client breaks the same-arity law | Compute direction in client-aware callers or a `_document_direction(doc,client)` helper |
| H4 | HIGH | Login-direct grant preserves write-authorization; "reachable only by the consumer" (§6.3) | `execute_rule_post` posts money on `clara_runtime_login` (grant precedent `0011:591-597`); containment is code-discipline | ADR-025 documents the trusted substrate; re-derive high-stakes/cap/direction/account_matched in-fn; keep the isolation-matrix tail assert |
| M1 | MED | Local facts skip the consent hold (§3.4) | Consent keyed on `lane='invoice_facts'` (`0011:2336`); WA-D1 gated the lane, not egress | Explicit owner ruling / ADR-025 clause re-scoping WA-D1 to cross-border egress + record residual |
| M2 | MED | "Gate failure → skip, never raise" (S5) | Core raises on race/stale (`0011:3004,3007`) after `for update` (`0011:3003`) | Wrap the core call; convert benign CLR10/CLR06 to a `rule_post_skips` row |
| M3 | MED | Structured Tier-A "extension" (§3.5, S6) | Non-empty polygon is a hard corroboration requirement (`0009:185-188`) | CoR keeping OCR path byte-identical; engine branch for `clara-*` + arithmetic tie |
| M4 | MED | Egress class by `azure-`/`clara-` prefix (§3.4) | Prefix is a naming convention; ids at `egress.mjs:172`, `invoiceFacts.v1.azure.mjs:16`, `intake.mjs:30,36` | Explicit egressing-engine_id allowlist, default-deny, + migration assertion |
| M5 | MED | `_resolve_counterparty` kind-scoped, same-arity (§4.2, S7) | ~5 lookups have no kind filter (`0011:1375-1428`); approve hardcodes vendor/payable (`0011:3039,3057`) | Add kind/direction to every lookup + both approve hardcodes in one migration; rig the shared-registration case |
| L1 | LOW | e-invoice attribution (implied automatic) | buyer field avoids `%tin%` (`0011:49`) → purchase e-invoice won't auto-attribute | State the buyer-direction limitation (falls to human filing, mirrors AP) |
| L2 | LOW | SST split + Tier-A | `tax_affecting → is_high_stakes` (`0009:1515`); only `invoice.total` is polygon-corroborated (`0009:161`) | State SST invoices are non-autopostable; note OCR leg splits are attestation-mitigated |
| L3 | LOW | Sales near-dup (§4.3) | AP dup is a hard CLR21 refusal (`0011:3108-3121`); sales is only a lane reason | Consider a hard sales near-dup gate |
| L4 | LOW | "one parse → two extractions" (§3.1) | identity=ingest `structured_parse`; facts=separate enqueued task (`0009:659`, gate `0011:2333`) | Reframe as two lifecycle-separated parses; clarifies C1 |
| L5 | LOW | S0 collision assertion (companion S0) | AB-3 boundary is the naming convention (`0011:47-51`) | Make the assertion permanent (every migration + mapper test) |
| L6 | LOW | WA2-R10 renew/retire nudge (S3) | delivery surface unnamed | Specify `record_notification` vs /queue feed |
| L7 | LOW | `laneSnapshot xml → structured_parse` (companion runtime bullet) | yields `clara-structured:v1` (`intake.mjs:155`), not `clara-myinvois:v1` | Add a MyInvois engine-snapshot branch to `laneSnapshot` |
