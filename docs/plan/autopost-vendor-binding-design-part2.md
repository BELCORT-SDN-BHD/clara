# Autopost vendor binding — DESIGN v4 — PART 2: machinery, attacks, build, findings register

**Part 1 is `docs/plan/autopost-vendor-binding-design.md`** (the authority object, its ceremony,
scope and lifecycle, and the §9/§10 owner rulings). This part carries the machinery, the build spec,
and every claim the reviews forced to change.

**Review history.** R1 returned ten findings; v2 answered them. R2 closed 1 and 4, left eight open.
R3 — the **final design round** — closed 3 and 5 and left nine, having shifted character: the
reviewer is now half co-writing the build spec. v4's job is a shape with **no impossible laws and no
false claims**; the 0027/0028 SQL ladders are the next control and will re-verify every §D and §G
claim against the rig.

**Cumulative CUTS:** auto-suspension · atomic supersession (now including its column and status) ·
admission stamping · cross-extraction geometry. **Cumulative WITHDRAWN CLAIMS:** "self-healing" ·
"structurally impossible" · "a three-attempt cap bounds re-extraction" (v3's version — see §C.6,
which v4 corrects *again* because v3's withdrawal was itself half-wrong) · "Slot C does not depend on
the marker at all" · **v3's lock-order law**, which the design could not obey.

## A. The gate machinery

### A.1 Precondition — X6 must have found nothing, not merely accepted nothing

**Closed at R2, re-confirmed at R3.** The binding is consulted only when **all** hold on the pinned
facts extraction:

1. `vendor_identity.outcome = 'absent'` — not `ambiguous`, `matched`, `typed_disagreement` or
   `multi_document` (`workflows/invoiceFacts.v1.azure.mjs:466`);
2. `vendor_identity.candidates` is an empty array;
3. every refusal counter is zero — `below_band`, `height_missing`, `unit_unresolved`, `no_geometry`,
   `rejected_gate`, `label_continuation`, `no_vendor_anchor`, `vendor_anchor_far`,
   `closer_to_customer`, `ambiguous`, `typed_disagreement`, `typed_vs_ambiguous`;
4. no `invoice.vendor_registration` region on that extraction;
5. `_resolve_counterparty` on the page's own vendor name returns `birth`.

`outcome = "absent"` alone is set whenever the *accepted* list is empty
(`invoice-vendor-identity.mjs:405-408`), so it cannot distinguish "found nothing" from "refused nine
things"; conditions 2–3 are what make it mean the former. The resolver also requires the receipt's
key set to be a subset of a version-stamped allowlist, refusing `binding_receipt_unrecognized`
otherwise, so a future X6 counter cannot be silently ignored.

### A.2 Slot A — admission, and the stamping that was cut

At `0015:2431-2447`, after the existing block yields `vendor_unresolved`, call
`clara._resolve_vendor_binding(p_client, f.document_id)`. On a hit set `v_counterparty` and append
the visible reason `vendor_bound`; `0015:2484` adds `vendor_bound` to the `array_remove` exemption
that `rule_backed` already uses.

**Admission stamping is CUT** — `_coding_lane_core` returns only `(lane, reasons)` (`0015:2358`), so
the value never reaches the caller, and delivering it would need a widened signature plus a replaced
`admit_autodraft_task`: a second subsystem serving a record nothing consults. Safe because admission
is a queue decision, not an authority — Slot B re-resolves before writing a draft and Slot C
re-resolves before any post, so a task admitted under a vanished binding simply produces no draft.
**Raised as a deviation and ACCEPTED AS FINAL (§10 ruling 10); the replacement is not to be built.**
The consequence — no durable record of *why* a task was admitted — is in §E's residuals.

### A.3 Slot B — the draft, so the model never judges identity

`autoDraft.v3.tools.ts:141-163` passes the model's raw `vendor` proposal into `wake_draft_entry`, so
admitting an EZSEC bill without a DB-side override would let the model **birth a junk counterparty**.

**The fingerprint stays ordinary** (R1 finding 1, closed at R2): writing `proposed_counterparty` as
the resolved `{"existing_id": <bound cp>, "kind":"vendor"}` yields an ordinary `registration_match`,
so `_approve_entry_core`'s recompute-and-compare (`0015:1313-1317`) passes and R2's `vendor_account`
snapshot survives its decision-value gate (`0016:4167`).

- same canonical counterparty → proceed; stamp `vendor_binding_id`;
- different existing counterparty → agent lane: `CLR23 vendor_binding_conflict`;
- would **birth** → agent lane: birth refused, resolved form written, `vendor_binding_id` stamped.

Every branch writes a `phase='draft'` resolution row carrying `raw_proposal` and
`entry_revision_token`, both NOT NULL. Human lane: advisory, never blocking (§10 amendment A).

### A.4 `revise_entry` — divergence must also remove autopost eligibility

R3 finding 1 is the sharpest of the round. v3 had `revise_entry` clear `vendor_binding_id` on
divergence while leaving `coding_kind` and `document_id` intact. **Attack:** revise a binding-backed
draft from X to Y where Y has a live autopost rule and compatible lines; the executor then sees an
ordinary eligible draft, Slot C never fires, and it posts with no binding control and no post-phase
receipt.

**v4 fix — divergence strips `coding_kind`.** A draft whose vendor identity was decided by a human is
a **hand-coded draft**, and #30's doctrine already says hand-drafts are never autopost-eligible. So
divergence does not need a new ineligibility concept; it returns the draft to the class it now
belongs to, and the executor's existing eligibility gate (`0023:411-415`, split per §F into
`ineligible_no_coding_kind`) refuses it by name. No new machinery, and the doctrine is the one the
owner already ruled.

**This does not touch the advisory ruling.** The human's counterparty choice stands unchanged and
unblocked; only the *machine's* permission to post it without a human is withdrawn — which is what
"the human decided this one" has always meant here.

**Both column updates need the trigger recut.** `_tf_entry_immutable`'s draft→draft allowlist is
exactly `['revision_token','updated_at','proposed_counterparty','match_fingerprint',
'last_human_editor','flags','closing_transfer']` (`0016:4950-4956`); anything else raises `CLR08`.
So **`vendor_binding_id` AND `coding_kind` must both be added** — v3 named only the first, and would
have shipped a repair that could not execute. (The draft→approved branch is unchanged: approval
modifies neither, and unchanged columns compare equal.)

### A.5 Slot C — one post-time re-resolution, before the approval transition

**v3's placement was internally impossible** (R3 finding 2): A.5 requires the binding control to run
before the post, while §4's law put the binding lock *after* `_approve_entry_core` — the function
that performs `status='approved'` (`0016:1445-1449`). v4 fixes it by having the executor take the
filing and entry locks **itself**, in the live order, before the binding (Part 1 §4's total order),
so the control precedes the core rather than following it.

**The control is keyed on the ENTRY marker, not on the evidence state.** If the entry carries
`vendor_binding_id`, then before any post, under the binding row lock:

1. pin the current facts and `ocr` extractions;
2. re-run **A.1 and F1/F2/F3** against those pins;
3. write a `phase='post'` resolution row carrying those pins, the outcome, and
   `compared_to_resolution_id` naming the `phase='draft'` row — **before the post proceeds**;
4. require **all** of: the same binding still matches and is live/unexpired/undrifted; it resolves to
   the same canonical counterparty as the draft; and F1/F2 still match. Any mismatch is a loud typed
   skip;
5. **if A.1 is now false** — the page has learned to resolve an identity by itself — require that
   page resolution to equal the draft's counterparty, else `binding_page_resolves_other`.

Step 5 is what closes R3's re-extraction bypass of the v2 design: the control fires on the marker, so
changing the evidence cannot switch it off, only change which branch refuses.

**The marker dependency is stated, not denied.** v2 claimed Slot C "does not depend on the marker at
all"; withdrawn. It does. A cleared or absent marker turns a postable document into a refusal, never
the reverse — fail-closed — and A.4 is what keeps the marker honest across revisions.

Named skips: `binding_revoked` · `binding_expired` · `binding_identity_drifted` · `binding_ambiguous`
· `binding_uncorroborated` · `binding_no_corroboration_source` · `binding_changed` ·
`binding_features_changed` · `binding_page_resolves_other` · `binding_receipt_unrecognized`.
(`binding_suspended` is purged — R3 finding 9.)

Everything else in `execute_rule_post` is untouched: high-stakes, control-leg-ties-to-gross, account
identity enumeration, cap, window, expiry, revision, corroboration.

### A.6 Pins and workflow bodies

F1/F2 read the pinned `invoice_facts` extraction; F3 reads the `ocr` extraction, band-only, inside
that extraction's own geometry. Both ids are pinned once per phase and recorded per phase. The
executor's pre-existing unlocked entry read (`0023:403`) is closed by the A.5 recut.

`autoDraft.v3` and its tools are **not** modified — the guard is in the DB, so the frozen workflow
manifest stays untouched and no `_vN` bump is needed.

## B. What the auditor sees, as a read contract

Per phase (`draft`, `revision`, `post`) an append-only `vendor_binding_resolutions` row (§G). Plus
the spine event `counterparty.binding_resolved`, the lane reason `vendor_bound`, and
`journal_entries.vendor_binding_id` surviving approval.

**The pre-revision warning is wired by name into `clara.get_draft_review`**: a bound draft returns
`vendor_binding_id`, the binding's `signed_by`, and the counterparty it names, so the human sees it
*in the surface they are acting in*.

**The binding read surface, specified as a contract** (R3 finding 9 — v3 named fields but no
function, so "visible-only" was not implementable):

```
clara.list_vendor_bindings(p_client uuid) returns table(
  binding_id uuid, counterparty_id uuid, counterparty_name text, status text,
  f1_vendor_name_norm text, f2_invoice_prefix text, registration_at_signing text,
  signed_by uuid, signed_at timestamptz, expires_at timestamptz,
  evidence_count int, resolution_count int, divergence_documents int)
  -- floor: _human_ctx(role_rank('bookkeeper')); GRANT EXECUTE to clara_authenticated only
  -- filter: p_client must belong to c.firm (else CLR11); all rows firm-scoped by RLS
  -- divergence_documents := count(DISTINCT document_id) FILTER (WHERE outcome='divergence')
  --                         over resolutions in the last 30 days  [distinct DOCUMENT, not row]
  -- order by: status='live' desc, created_at desc

clara.get_vendor_binding(p_binding uuid) returns jsonb
  -- same floor/grant; adds the evidence window (entry_id, document_id, both pins, posting_date)
  -- and the resolution list (phase, outcome, pins, compared_to_resolution_id, created_at)
```

Counting by distinct document is the correction from §10 amendment A: one draft revised three times
must count once, not three times.

## C. The adversarial set

**C.1 Issuer impersonation — the `c/o` attack. OPEN RESIDUAL, no structural bound.** A legitimate
invoice from company Y can print `c/o X`, `prepared by X`, or `company secretary X` in its page-1
letterhead band while Y's own identity sits elsewhere; F3 is band-only and role-blind, so it passes.
v2's vendor-anchor comparison was broken on coordinate-frame grounds (X6 compares anchors within one
Azure result; v2 crossed two extractions), and v3 removed the geometry rather than specify a frame
reconciliation this slice cannot justify. R3 confirmed F3 is implementable as written — line
text/polygons live in `document_regions`, page height/unit in the OCR envelope — and that the
residual is honestly stated.

Bounded by: the cap, the window, corroboration, the divergence surface, and §10 (5). **Not** bounded
structurally. §10 ruling 9 settled that F3 *may exist*; it says nothing about what F3 cannot see.

**C.2 Shared or generic invoice-number prefix.** F2 is a stability feature that resolves nothing
alone; the floor (≥6 chars, ≥3 alphabetic, denylist including `binv`) refuses `inv2`. Measured
unevenness against the real corpus is accepted and argued in Part 1 §3.2.

**C.3 A forged document mimicking the pattern.** Must clear filing, the full A.1 precondition, F1,
F2, F3, two-reader corroboration of net *and* tax (`0023:635-639`), MYR, the entry shape
(`0023:546-591`), the cap, the window, high-stakes, non-expiry, **and** A.5. Bounded small-ticket
exposure with a complete audit trail; owner-ruled at §10 (5).

**C.4 The client switches secretarial firm mid-year.** New letterhead and registration → F1 and F3
fail → human queue → three approvals over ≥14 days → a new binding. The practice-sale variant is
caught by F3 only if the acquirer prints its own registration in the band; transitional stationery
printing the old registration is **residual**, watched by the divergence surface.

**C.5 Authoring a broad binding.** Features are DB-derived from a DB-chosen window; the authoring
surface offers no widening lever. Not "impossible" — C.1 shows page evidence itself can be ambiguous.

**C.6 Version farming — the bound, corrected TWICE and now stated from both live bodies.**
v2 claimed a three-attempt cap. v3 withdrew that as false, citing `request_reextraction`'s explicit
no-cap ruling. **v3's withdrawal was itself half-wrong**, and the runway had already measured the
counter-evidence: `509e788d` was re-extracted successfully (200, `version_n 4`) and then its task
**failed `attempt_cap`**. There are two caps, at two phases, and only one is bypassed:

| phase | site | binds re-extraction? |
|---|---|---|
| **enqueue** | `_enqueue_invoice_facts_core` (`0014:206-216`) | **No** — `request_reextraction` owns its own logic and never calls it (`0022:155-172`, ADR-047 Q4 "WHY NO CAP") |
| **claim / settle** | `clara.claim_document_processing_task` (latest `0024:210`; predicate at `0015:3396-3406`) | **Yes** — for `lane='invoice_facts'` it sums `attempt_count` across **all** tasks for the document and, at `>= 3`, marks the task `failed`/`attempt_cap`, refunds the call, and emits `document.invoice_facts_failed` |

So the honest bound is: **a document can never have more than three `invoice_facts` attempts in its
lifetime, enforced where the work is actually claimed** — regardless of who enqueued it or how many
op keys they burn. Version farming yields **at most three distinct renders per document**, not
arbitrarily many. The other bounds stand: `request_reextraction` is granted to `clara_authenticated`
only, and the firm page budget applies.

v4's structural answer does not lean on any of them: **`evidence_restated` refuses a window document
whose evidence was re-extracted after its entry was approved** (Part 1 §3.3 cond. 4). The authority
anchor is *the render a human looked at and approved*, not the number of renders that exist.

**Residual, named:** within those ≤3 renders, a single actor who both farms and approves can steer
F1/F2 among their own approvals. F3 is **not** steerable this way — re-extraction cannot put the
bound party's registered identity onto a page that does not carry it. And that same actor can revoke
and re-sign a binding at will, so the binding grants them no power they lack; the residual is real
but adds no privilege.

**C.7 Recency takeover. Bounded, not closed.** Part 1 §3.3a requires three distinct posting dates
spanning ≥14 days. That prices the attack in calendar time and three human approvals; it does not
require actor diversity, and at a one-person firm there is none to require.

**C.8 Revocation race and deadlock.** Part 1 §4's total order, rebuilt in v4 from every live
participant including `persist_invoice_facts` (`0022:452-459`), whose filing→entry order v3's
entry-before-rule proposal would have deadlocked against.

**C.9 Counterparty merge or identity drift.** Refuses `binding_identity_drifted`.

**C.10 Rules breeding rules.** Untouched (`0015:1472-1476`); the window excludes rule-checked entries.

**C.11 Unregistered counterparty.** Refused at proposal (§10 ruling 3).

## D. Build shape, interlock, and deploy

**Objects.** Three tables (§G) · `_binding_normalize` (immutable, enumerated strip list) ·
`_resolve_vendor_binding` (private, `revoke all from public`, **lock-free and `stable`**) · three
verbs (`propose`/`sign`/`revoke`, `clara_authenticated`, role-floored, op-key, audited, spine
events) · the §B read surface · `create or replace` of `_coding_lane_core` (A.2), `_draft_entry_core`
(A.3), `revise_entry` (A.4), `_tf_entry_immutable` (A.4), `get_draft_review` (§B),
`execute_rule_post` (A.5) · §F's skip-vocabulary split · `journal_entries.vendor_binding_id` with its
composite FK. Next free error code looks like **CLR35** — verify as-built before cutting.

**The split** (§10 amendment C): **0027** = everything except A.5. **0028** = A.5 alone.

**The interlock, in three layers** (R3 finding 8 — v3's two were not durable):

1. **Signing gate.** `sign_vendor_identity_binding` refuses `post_control_absent` unless 0028's row
   exists in `clara.schema_migrations`. The runner applies migration and ledger row in one
   transaction and records the applied `sha256` (`packages/db/README.md:87`), so a stub cannot fake
   it. With no live binding, `_resolve_vendor_binding` returns nothing and Slots A/B are inert —
   **0027 alone confers no usable authority.**
2. **0028 postverify** asserts the gate by name in comment-stripped `prosrc` of `execute_rule_post`.
   **Its limit, stated:** postverify runs *outside* the apply transaction, so signing opens the
   moment the ledger row commits, before postverify passes. The mitigating fact is layer 3 plus the
   D1 quiesce below — during the deploy window the application is write-quiesced, and signing is a
   human verb, so no binding can be signed inside that gap.
3. **A persistent CI assertion — the layer v3 lacked.** A new `scripts/check-binding-post-control.mjs`
   in the same lane as `scripts/check-frozen-workflows.mjs`, asserting that the *current* definition
   of `execute_rule_post` (the latest migration defining it, comment-stripped) contains the binding
   gate. **This is what catches a later 0029 recut that drops the gate while the 0028 ledger row
   remains** — the failure mode R3 correctly said postverify alone cannot catch. It fails CI rather
   than silently re-arming every live binding.

**Deploy.** Both 0027 and 0028 replace writer function bodies, so **both require the repo-mandated
D1 write-quiesce** for their deploy windows (`packages/db/README.md:95-113`) — v3's list omitted this.
Two quiesced windows, not one, because the split is deliberate.

**Rig first, then live.** The A.1 precondition matrix (genuine-absent vs each refusal counter); Part 1
§3.2's refusal matrix; the F2 floor against the real RPA series; F3 against a `c/o` fixture,
**expected to PASS and recorded as the C.1 residual**; the Slot-B birth-refusal; **an approval test
proving the first binding-resolved draft approves without `CLR23`**; **a revise test proving both
`vendor_binding_id` and `coding_kind` updates execute without `CLR08`** (A.4); **a
revise-then-post test proving a diverged draft is refused `ineligible_no_coding_kind` and never
reaches Slot C** (the R3 finding-1 regression); the A.5 matrix including the re-extraction case and
step 5; a revocation-race test under the lock; **a lock-order test asserting the Part 1 §4 total
order across `persist_invoice_facts` / `execute_rule_post` / `revise_entry` concurrently**;
`evidence_restated`, `window_too_recent`, `prefix_too_weak`, `features_unstable`; and an exact-diff
proving `draft_entry` stays byte-identical for unbound documents.

**Live vehicle:** counterparty `348dc9cd`, rule `90a07e89` live, 8 corroborated EZSEC documents. See
Part 1 §10's corrected operational note for which fourth bill satisfies the dwell rule.

**Gates before build:** 0026 landed (`d5d86a3` on `main`, 2026-07-28) · this v4 clears re-review.

## E. Finding register — R3 dispositions

| # | R3 state | v4 disposition |
|---|---|---|
| 1 | **CLOSED** (R2) | Untouched |
| 2 | leaking — marker not fail-closed through revise; `_tf_entry_immutable` would `CLR08` | **Divergence strips `coding_kind`**, returning the draft to the hand-draft class #30 already covers; trigger recut now names **both** columns (A.4) |
| 3 | leaking — A.1-conditional gate; Slot C skippable | **Control keyed on the marker, unconditional**, with step 5 for self-resolving pages (A.5) |
| 4 | **CLOSED** (R2) | Untouched (A.1) |
| 5 | **CLOSED** (R3) — band-only F3 and the C.1 residual are honest | Untouched; C.1 remains open and named |
| 6 | leaking — false attempt bound; Unicode residual unregistered | **Both caps stated with their phases** — enqueue bypassed, **claim-time binds at 3/document** (`0024:210`), matching the measured `509e788d` failure; U+2061–2064 added; completeness registered as a residual (§C.6, Part 1 §3.2) |
| 7 | leaking — deadlock; stale supersession ceremony | **Total order rebuilt** with `persist_invoice_facts` included and the binding no longer last (Part 1 §4); **supersession purged from both ends** — condition 8 flat, signing touches no predecessor, column and status removed |
| 8 | leaking — receipt-chain/congruence incomplete | **§G rebuilt against the live anchors** (`0009:798-810`): extraction FKs use `(id, firm_id, document_id)`; bindings gain the `(id, firm_id, client_id)` anchor; evidence and `compared_to_resolution_id` get congruent FKs; append-only + no-TRUNCATE triggers named |
| 9 | leaking — `binding_suspended` remained; read contract underspecified | **Purged**; read surface specified as functions with signature, floor, grant, filter, ordering, and distinct-document counting (§B) |
| 10 | leaking — postverify is not an enduring interlock | **Third layer added**: a persistent CI assertion on the current `execute_rule_post` body; postverify's outside-the-transaction limit stated; **D1 quiesce added for both migrations** (§D) |

**Residual register — complete.** C.1 legitimate `c/o` attribution (**open, no structural bound** —
the largest known hole) · C.6 in-window version farming by a single farm-and-approve actor (bounded
to ≤3 renders; F3 not steerable; no privilege gained) · **Unicode strip-list completeness**
(enumerable not provable; a repeated unknown invisible makes F1 compare equal, never refuse; F3 still
gates identity) · C.7 recency takeover (bounded by dwell; no actor diversity at a one-person firm) ·
C.4 transitional stationery after a practice sale · C.3 bounded small-ticket forgery (owner-ruled) ·
**A.2 admission-provenance gap** (no durable record of why a task was admitted; accepted, §10 ruling
10) · **renewal coverage gap** (supersession deferred; accepted operational cost) · **postverify
timing gap** (signing opens on ledger commit, before postverify; mitigated by the CI assertion and
the D1 quiesce, not eliminated) · F2 denylist unevenness · the pre-existing `file_document` /
`confirm_attribution_candidate` filing-order hazard (task #29, untouched — no binding path takes a
filing lock).

## F. Q5 — writing down #30, and naming the missing field

**Where "hand-drafts are not autopost-eligible BY DESIGN" is written.** Primary home:
`docs/prd/PRD.md` §6a (`:135-142`), the typed-authority section, because autopost eligibility *is* a
typed-authority property. One sentence, as LAW:

> Auto-posting is a machine-lane authority. Only a draft produced by the autodraft lane — carrying
> `coding_kind` — is autopost-eligible. A hand-authored draft is never auto-posted: a human who
> drafts has already exercised judgment, and the maker/checker path (invariant 9), not a rule,
> completes it.

Also an ADR in `docs/PROJECTLOG.md`, and an intent comment on `execute_rule_post`'s eligibility block
(`0023:411-415`), which states the mechanism but not the intent. **A.4 now leans on this sentence**:
stripping `coding_kind` on divergence is only coherent because this is law.

**The skip-reason fix.** Split `not_eligible_shape` into `ineligible_no_coding_kind` /
`ineligible_no_document` / `ineligible_no_counterparty`, returned in the JSON and written to
`rule_post_skips`. The column is free text with a non-blank CHECK (`0015:337-348`), the table is
append-only, and **no runtime or dashboard code matches the literal** (grepped `packages/runtime`,
`apps/`, `scripts/`). Approved at §10 ruling 7.

## G. The DDL contract (build spec)

Rebuilt in v4 against the **live** constraint anchors, which `0009:798-810` fixes as
`journal_entries (id, firm_id, client_id)` · `document_filings (id, firm_id, client_id, document_id)`
· `document_extractions (id, firm_id, document_id)` · `document_regions (id, firm_id, extraction_id)`.
v3's FKs referenced `(id, document_id)` for extractions and would simply have failed to create.

```
clara.vendor_identity_bindings
  id uuid pk · firm_id uuid not null · client_id uuid not null · counterparty_id uuid not null
  status text not null default 'proposed'
    check (status in ('proposed','live','revoked','declined','expired'))
  f1_vendor_name_norm text not null check (btrim(f1_vendor_name_norm) <> '')
  f2_invoice_prefix   text not null check (length(f2_invoice_prefix) >= 6)
  registration_at_signing text not null check (btrim(registration_at_signing) <> '')
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$')
  created_by uuid not null · created_at timestamptz not null default now()
  signed_by uuid · signed_at timestamptz · revoked_by uuid · revoked_at timestamptz
  revoke_reason text · expires_at timestamptz not null
  -- NO supersedes_binding_id and NO 'superseded' status (r3 finding 6)
  constraint uq_vendor_bindings_id_firm_client unique (id, firm_id, client_id)   -- the FK anchor
  constraint fk_vib_counterparty foreign key (counterparty_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id)
  constraint uq_vib_one_live unique (client_id, counterparty_id) where status='live'
  constraint ck_vib_expiry check (expires_at <= created_at + interval '12 months')
  constraint ck_vib_revoked check ((status='revoked') = (revoked_at is not null))
  trigger t_vib_frozen — once status='live', UPDATE of f1/f2/registration_at_signing/
    content_hash/expires_at RAISES (the _tf_coding_rule_update idiom, 0015:1096)
  FORCE ROW LEVEL SECURITY + firm/client policies + explicit ACLs

clara.vendor_identity_binding_evidence            -- the three approvals, one row each
  id uuid pk · binding_id uuid not null · firm_id uuid not null · client_id uuid not null
  entry_id uuid not null · document_id uuid not null
  facts_extraction_id uuid not null · ocr_extraction_id uuid not null
  constraint fk_vibe_binding foreign key (binding_id, firm_id, client_id)
    references clara.vendor_identity_bindings(id, firm_id, client_id) on delete cascade
  constraint fk_vibe_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id)
  constraint fk_vibe_facts foreign key (facts_extraction_id, firm_id, document_id)
    references clara.document_extractions(id, firm_id, document_id)
  constraint fk_vibe_ocr foreign key (ocr_extraction_id, firm_id, document_id)
    references clara.document_extractions(id, firm_id, document_id)
  constraint uq_vibe_binding_entry unique (binding_id, entry_id)
  FORCE RLS + ACLs

clara.vendor_binding_resolutions                  -- append-only, one row per phase
  id uuid pk · binding_id uuid not null · firm_id uuid not null · client_id uuid not null
  document_id uuid not null · entry_id uuid not null
  phase text not null check (phase in ('draft','revision','post'))
  facts_extraction_id uuid not null · ocr_extraction_id uuid not null
  compared_to_resolution_id uuid                  -- post rows -> the draft row
  entry_revision_token uuid not null              -- NOT NULL (r2 finding 8)
  raw_proposal jsonb not null                     -- NOT NULL; '{}' when the lane supplied none
  outcome text not null check (outcome in ('bound','divergence','refused'))
  refusal_reason text · divergence jsonb · created_at timestamptz not null default now()
  constraint uq_vbr_id_firm_client unique (id, firm_id, client_id)   -- anchors the self-FK
  constraint fk_vbr_binding foreign key (binding_id, firm_id, client_id)
    references clara.vendor_identity_bindings(id, firm_id, client_id)
  constraint fk_vbr_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id)
  constraint fk_vbr_facts foreign key (facts_extraction_id, firm_id, document_id)
    references clara.document_extractions(id, firm_id, document_id)
  constraint fk_vbr_ocr foreign key (ocr_extraction_id, firm_id, document_id)
    references clara.document_extractions(id, firm_id, document_id)
  constraint fk_vbr_compared foreign key (compared_to_resolution_id, firm_id, client_id)
    references clara.vendor_binding_resolutions(id, firm_id, client_id)   -- same-tenant self-FK
  constraint ck_vbr_compared_phase check (compared_to_resolution_id is null or phase='post')
  trigger t_vbr_append_only  (the _tf_append_only idiom, 0015:367-370)
  trigger t_vbr_no_truncate  (the rule_sightings no-TRUNCATE idiom, 0011:1076)
  FORCE RLS + ACLs

clara.journal_entries
  add column vendor_binding_id uuid   -- nullable; provenance only, never an input to resolution
  constraint fk_je_vendor_binding foreign key (vendor_binding_id, firm_id, client_id)
    references clara.vendor_identity_bindings(id, firm_id, client_id)
```

Every cross-table reference carries `firm_id` (and `client_id` or `document_id` as the live anchor
allows), so a receipt chain cannot span tenants or documents — which is what R3 finding 7 required
and what the weaker v3 sketch would have permitted.
