# Autopost vendor binding — DESIGN v4.1 · RATIFIED — PART 2: machinery, attacks, build, register

**Part 1 is `docs/plan/autopost-vendor-binding-design.md`** (the authority object, its ceremony,
scope and lifecycle, and the §9/§10 owner rulings). This part carries the machinery, the build spec,
and every claim the reviews forced to change.

**Review history.** R1 returned ten findings; v2 answered them. R2 closed 1 and 4, left eight open.
R3 — the **final design round** — closed 3 and 5 and left nine, having shifted character: the
reviewer is now half co-writing the build spec. v4's job is a shape with **no impossible laws and no
false claims**; the 0028/0029 SQL ladders are the next control and will re-verify every §D and §G
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
5. `_resolve_counterparty` on the page's own vendor name resolves to one of exactly two outcomes —
   see the amendment immediately below.

`outcome = "absent"` alone is set whenever the *accepted* list is empty
(`invoice-vendor-identity.mjs:405-408`), so it cannot distinguish "found nothing" from "refused nine
things"; conditions 2–3 are what make it mean the former. The resolver also requires the receipt's
key set to be a subset of a version-stamped allowlist, refusing `binding_receipt_unrecognized`
otherwise, so a future X6 counter cannot be silently ignored.

**A.1 AMENDMENT (task #36 build, two-level owner ruling, 2026-07-29) — condition 5 widens to two
admissible shapes, and the widening must happen at two levels.** Building the end-to-end live-match
cell surfaced why the first, single-level repair was dead code. The PRE-0028 `_coding_lane_core`
body wraps its own `_resolve_counterparty` call **and the entire birth/non-birth branch below it** in
one `begin … exception when sqlstate 'CLR23'` block. A clean bare name for an already-registered
vendor therefore raises `registration_conflict` into that outer handler, which appends
`vendor_ambiguous` and jumps past Slot A. `_resolve_vendor_binding` is never called at all. Catching
and parsing the same exception inside `_resolve_vendor_binding` cannot repair control flow that
never reaches the function.

Both admissible condition-5 shapes remain real. `decision='birth'` is the fragmented-letterhead case
the design was written against: the page name cleanly matches no counterparty. The clean-name case
is `CLR23` with `detail.reason='registration_conflict'`: the page name exactly identifies a
registered counterparty, but the ordinary resolver correctly refuses to choose it without a
registration number. The signed binding closes that corroboration gap only when the exception's
`candidate_id` agrees with the binding selected by F1/F2/F3.

**Level 1 — `_coding_lane_core`.** The CLR23 handler is narrowed to the
`_resolve_counterparty` call alone. Non-`registration_conflict` CLR23s retain the old result exactly:
append `vendor_ambiguous`, set the hard flag, and do no binding work. A registration conflict is
parsed fail-closed; absent, malformed, or non-UUID `candidate_id` gets that same
`vendor_ambiguous`+hard result. A valid candidate falls through beside the unchanged birth branch.
Those two paths make exactly one Slot-A call to
`_resolve_vendor_binding(client,document,page_candidate)`: NULL candidate for birth, parsed candidate
for registration conflict. The caller consumes the resolver's typed JSONB result:
`bound` → counterparty + `vendor_bound`; `unresolved` → `vendor_unresolved`; `ambiguous` (including a
unique F1 candidate that fails F2) → visible `binding_ambiguous` + hard.

**Level 2 — `_resolve_vendor_binding`.** Its signature is
`(p_client uuid,p_document uuid,p_page_candidate uuid default null)` and it no longer calls
`_resolve_counterparty` or parses exceptions. Conditions 1–4 remain local. Candidate selection then
uses F1 plus the structural/live/F3 predicates; a non-NULL page candidate adds the equality wall
`binding.counterparty_id = p_page_candidate`. F2 is applied only after that candidate set is proven
unique (§C.2). NULL candidate preserves the original birth behavior; a non-NULL candidate permits
only that page-identified counterparty's binding.

This candidate-equality wall makes the clean-name widening narrower than birth: birth has no
independent page candidate, while registration conflict supplies one that must agree. A genuine
two-binding ambiguity is therefore reachable only through birth—for example, distinct registered
vendors invoicing under one shared trading name that matches neither legal name.

**Safety invariant.** Vendors WITHOUT a live binding lose nothing: Slot A returns
null/unresolved and the draft lands `vendor_ambiguous`+hard exactly as before this fix for a
non-`registration_conflict` CLR23, and exactly as `vendor_unresolved` for a `birth` non-match. The R2
wall for ordinary (non-binding) resolution is completely untouched. The automation activates ONLY
when a signed binding exists AND F1 (+ F2, correctly two-phased per §C.2) AND F3 ALL hold AND either
shape of condition 5 holds. Migration 0029's post-time control re-runs the whole thing again, under
lock, before any money moves.

### A.2 Slot A — admission, and the stamping that was cut

At `0015:2431-2447`, the two-level condition-5 block above calls
`clara._resolve_vendor_binding(p_client,f.document_id,v_page_candidate)`. A `bound` result sets
`v_counterparty` and appends `vendor_bound`; an `ambiguous` result appends the visible hard reason
`binding_ambiguous`; an `unresolved` result appends `vendor_unresolved`. `0015:2484` adds
`vendor_bound` to the `array_remove` exemption that `rule_backed` already uses.

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

**Q-round clarification (task #36).** The frozen production tool schema legitimately admits
both `{existing_id}` and `{new:{name,registration_no?}}`; the wrapper passes either shape through
unchanged. Only `existing_id` is an explicit caller identity choice. On a bound path Slot B
canonicalizes and compares that id directly, raising `vendor_binding_conflict` on disagreement.
Every `new` shape is deferred identity: Slot B goes straight to the binding-selected
`{"existing_id":...,"kind":"vendor"}` and resolves only that safe form. It never re-runs the raw
clean-name proposal that already produced `registration_conflict`. The draft's control leg is
stamped with the binding counterparty before the revision snapshot is written.

The real wake-drive cell also found an event-order bug invisible to staged fixtures:
`counterparty.binding_resolved` originally preceded `entry.drafted`, so the wake's final
`assert_books_current(...,entry_drafted_seq)` treated that first event as an intervening write and
raised `CLR12`. The binding event now follows `entry.drafted` in the same transaction, outside that
stale-window interval. Human and unbound paths emit no binding event and remain unchanged.

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

### A.7 The total order — every acquirer's verified sequence

Part 1 §4 states the law; this is its evidence. The order is **op-receipt reservation →
`coding_rules` → `document_filings` → `journal_entries` → `vendor_identity_bindings`.**

Every live acquirer, read from the bodies:

| path | lock sequence, verified |
|---|---|
| `persist_invoice_facts` (`0022:452-459`) | `document_filings` **FOR UPDATE** → draft `journal_entries` **FOR UPDATE** → task FOR UPDATE |
| `_approve_entry_core` (`0016:1257,1265`) | filing **FOR SHARE** → entry **FOR UPDATE** → *(transition at `0016:1445-1449`)* |
| `execute_rule_post` (`0023:403,483-487`) | entry read **unlocked** → `coding_rules` **FOR UPDATE** → `_approve_entry_core` |
| `revise_entry` (`0016:4807`) | entry **FOR UPDATE** (no filing) |

The live system already agrees on **filing → entry**, and the rule is only ever taken by the
executor, first. v3's entry-before-rule created the cycle r3 reconstructed: post holds the entry and
waits on the filing inside the approve core, while `persist_invoice_facts` holds the filing and waits
on that entry.


Every acquirer takes a *prefix-consistent subsequence* of it, which is what makes the order
cycle-free:

- **`execute_rule_post` (recut in 0029):** one deterministic lock of the current live-rule set
  (capturing those IDs) → **filing FOR SHARE → entry FOR UPDATE (taken by the executor itself, in the
  live order)** → a plain exact-rule lookup restricted to the captured set → binding FOR UPDATE +
  the §A.5 re-resolution and its receipt → *then* `_approve_entry_core`, whose filing/entry locks are
  re-entrant no-ops in the same transaction. A rule that becomes live after the first snapshot is a
  `no_live_rule` retry, not a second acquisition after filing/entry. The binding control runs
  **before** the approval transition, which is what r3 finding 2 required, and the executor stops
  reading the entry unlocked (`0023:403`);
- **`persist_invoice_facts`:** filing → entry. A prefix. Unchanged;
- **`_approve_entry_core`:** filing → entry. A prefix. Unchanged;
- **`revise_entry`:** entry → binding. A subsequence. Consistent;
- **`revoke` / `sign`:** binding alone. The tail;
- **the resolver `_resolve_vendor_binding`: takes NO lock at all.** It is `stable` and read-only.
  v3 let lazy expiry write from inside it, which (as r3 noted) leaves a row lock held across the
  caller — and Slot B's subsequent FK checks take `FOR KEY SHARE` on parent rows, i.e. locks acquired
  *after* the binding. Making the resolver lock-free removes that whole class. Expiry is instead a
  status transition performed only by the verbs (`propose` / `sign` / `revoke`) and by a reconciler
  pass; every read path independently treats `expires_at <= now()` as not-live, so correctness never
  depends on the transition having happened yet.

**Why this is cycle-free, checkably.** Every path's sequence is a subsequence of the global order, and
no path takes a lock preceding one it already holds — stronger than v3's "binding last", and unlike
v3's it is compatible with the control running before the approval transition. The §D rig test
asserts it; the pre-existing `file_document` / `confirm_attribution_candidate` hazard (task #29) was
CLOSED live in migration 0027 (PR #132) before this build started — every acquirer of `documents` and
`document_filings` now takes `documents` FIRST, and 0027's own header enumerates the six writers
(`file_document`, `finalize_document_intake`, `_seed_verified_document`,
`confirm_attribution_candidate`, `approve_wrong_client_correction`, `retire_document_filing`) plus a
seventh reader (`resolve_and_ingest_wiki_source`, swapped in the same migration's P-round).

**§A.7 AMENDMENT (task #36 build note, re-verification against the post-0027 live catalog).** None
of this table's four rows are among 0027's edited functions, so the table above is unchanged and
still accurate for `persist_invoice_facts` / `_approve_entry_core` / `execute_rule_post` /
`revise_entry` as READ FROM THE LIVE CATALOG (0027 touches none of their bodies). But the
re-verification this task's build order requires — CoR against the live post-0027 bodies, not the
table's prose — surfaces a FIFTH participant this table never named: **`persist_invoice_facts`
(`0022`, unchanged by 0027) ALSO locks `clara.documents`, via an unconditional `UPDATE
clara.documents SET document_kind=..., financial_date=...` that runs AFTER its
`document_filings`/`journal_entries`/task locks, not before them.** 0027's CoR sweep never found this
because it classified writers strictly by INSERT/UPDATE/DELETE **on `document_filings`**;
`persist_invoice_facts` never writes `document_filings` (it only takes a `FOR UPDATE` lock on
existing rows for serialization), so it correctly fell outside that specific sweep — but it is a
genuine `documents`+`document_filings` two-lock participant in the OPPOSITE order from 0027's law,
and the same lock-order-inversion class 0027 exists to close is reachable between
`persist_invoice_facts` and any 0027-fixed function (or, going forward, any 0028/0029 binding-order
function) racing the same document. **Fixed in 0028** (this build), alongside the binding machinery,
using the identical hoist-the-lock pattern 0027 established — see 0028's own header for the CoR
detail. This amendment is the "if §A.7 needs an amendment for 0027's reality" case the task #36 work
order anticipated.

**Position 0 — the op-receipt (r4 finding 3b).** `_reserve_op` (`0004:46-59`) is
`insert … on conflict do nothing`, so a concurrent *uncommitted* insert of the same
`(firm_id, fn, op_key)` blocks the second caller on that row. `_approve_entry_core` reserves at
`0016:1247`, correctly before its own data locks — but v4 had the executor reach it only after
holding all four. The executor therefore reserves **both** receipts (`execute_rule_post` and
`approve_entry`, which are distinct `fn` values and so distinct rows) before any data lock, and
0029 recuts `_approve_entry_core` to skip its own reservation when `p_ctx` carries
`receipt_preheld: true`. No signature change — `p_ctx` is already `jsonb` — and a ctx without the
key reserves exactly as today, so the human `approve_entry` path stays byte-identical.

**Q-round skip settlement.** A reserved executor that returned a typed skip used to leave both
receipts at `result=NULL`, making a same-key replay return `{pending:true}` forever. Every skip now
routes through private `_settle_rule_post_skip`: it writes the existing `rule_post_skips` row,
deletes the never-consumed `approve_entry` reservation, and `_finish_op`s the
`execute_rule_post` receipt with the typed skip. The posted success path is unchanged.

**Executor op-keys are PREDICTABLE, and that is a nuisance, not a leak.** `rule-post.mjs` derives
`rulepost:<entry>:<seq>`, and `approve_entry` is granted to `clara_authenticated` with a
caller-supplied op-key, so a firm member *can* reserve `(firm,'approve_entry',K)` first. Reservation
by a non-executor is therefore **not** impossible by grant, and this design does not pretend it is.
What it costs: with position 0 in place the executor blocks (or replays) **holding no data locks**,
so there is no deadlock; the post attempt is skipped, and the next revision produces a new `seq` and
a new key. The attacker gains no ability to cause a *wrong* post — only a non-post, which is the safe
direction — and any actor who could do this could equally approve the entry themselves or revoke the
binding. **Residual: a single post attempt can be denied by an authenticated firm member.** Recorded
in §E, not engineered against.

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

**C.2 Shared or generic invoice-number prefix.** F2 is a consistency gate on the binding selected
by F1, never a selection or ambiguity-reduction key. Candidate selection and counting use F1 plus
the live/structural/F3 conditions only. Zero candidates means no match; more than one is ambiguous
regardless of every candidate's F2. Only when that set contains exactly one binding is the current
normalized invoice id checked with `starts_with(...,binding.f2_invoice_prefix)`; mismatch is a typed
refusal (`binding_ambiguous` at Slot A, `binding_features_changed` at Slot C), never fall-through and
never permission to choose a different candidate. F2 still resolves nothing alone; the floor (≥6
chars, ≥3 alphabetic, denylist including `binv`) refuses `inv2`. Measured unevenness against the real
corpus is accepted and argued in Part 1 §3.2.

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

**The split** (§10 amendment C): **0028** = everything except A.5. **0029** = A.5 alone.

**The interlock, in three layers** (R3 finding 8 — v3's two were not durable):

1. **Signing gate.** `sign_vendor_identity_binding` refuses `post_control_absent` unless 0029's row
   exists in `clara.schema_migrations`. The runner applies migration and ledger row in one
   transaction and records the applied `sha256` (`packages/db/README.md:87`), so a stub cannot fake
   it. With no live binding, `_resolve_vendor_binding` returns nothing and Slots A/B are inert —
   **0028 alone confers no usable authority.**
2. **0029 postverify** asserts the gate by name in comment-stripped `prosrc` of `execute_rule_post`.
   **Its limit, stated:** postverify runs *outside* the apply transaction, so signing opens the
   moment the ledger row commits, before postverify passes. The mitigating fact is layer 3 plus the
   D1 quiesce below — during the deploy window the application is write-quiesced, and signing is a
   human verb, so no binding can be signed inside that gap.
3. **A persistent CI assertion — the layer v3 lacked.** A new `scripts/check-binding-post-control.mjs`
   in the same lane as `scripts/check-frozen-workflows.mjs`, asserting that the *current* definition
   of `execute_rule_post` (the latest migration defining it, comment-stripped) contains the binding
   gate. **This is what catches a LATER migration's recut that drops the gate while the 0029 ledger
   row remains** — the failure mode R3 correctly said postverify alone cannot catch. It fails CI
   rather than silently re-arming every live binding. Q-round hardening resolves direct literals,
   literal-valued signature variables, and signature-constrained OID lookups; any genuinely
   unparseable post-0029 CoR target is itself a certification failure, never an ignored `null`.

**Deploy.** Both 0028 and 0029 replace writer function bodies, so **both require the repo-mandated
D1 write-quiesce** for their deploy windows (`packages/db/README.md:95-113`) — v3's list omitted this.
Two quiesced windows, not one, because the split is deliberate.

**0030 (F1 LCP, task #36 runway) — a third, independent D1 quiesce.** 0030 replaces
`_derive_vendor_binding_proposal` and `_resolve_vendor_binding` (both 0028) plus
`execute_rule_post` (0029, Slot C) — all three sit on the live posting path. Per the same
repo-mandated D1 discipline and the precedent above, 0030's deploy window is quiesced on its own,
not folded into either prior window, because the recut is deliberate and independent of both.

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
| **3b** *(r4)* | the op-receipt reservation sat outside the total order — a human reserving the predictable executor key then waiting on the entry lock deadlocks against an executor holding entry+binding and waiting on that key | **CLOSED by the v4.1 amendment.** The order gains **position 0**: receipt reservation precedes every data lock, for every acquirer. The executor reserves both receipts (distinct `fn` rows) before any data lock, and 0029 recuts `_approve_entry_core` to skip its own reservation on `p_ctx.receipt_preheld` — no signature change, human path byte-identical (§A.7) |
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
the D1 quiesce, not eliminated) · **predictable executor op-keys** (an authenticated firm member can
reserve `rulepost:<entry>:<seq>` under `approve_entry` and deny **one** post attempt; with position 0
this is a wait/replay holding no data locks, never a deadlock and never a wrong post — and the same
actor could approve or revoke anyway, so no privilege is gained; §A.7) · F2 denylist unevenness · the
pre-existing `file_document` / `confirm_attribution_candidate` filing-order hazard (task #29,
untouched — no binding path takes a filing lock).

**Task #36 build register — post-ratification findings, owner-ruled.** Findings surfaced building
0028/0029 against the v4.1 text, not R1–R3 review findings, so kept separate from the table above.

| # | Found | Disposition |
|---|---|---|
| A | `_coding_lane_core`'s outer CLR23 handler swallowed clean-name `registration_conflict` before Slot A; the attempted resolver-local repair was unreachable | Two-level fix: narrow the caller's catch, parse the candidate fail-closed, pass it to a resolver that no longer calls `_resolve_counterparty` |
| B | F2 in the candidate WHERE clause hid genuine F1 ambiguity by filtering non-prefix candidates before the count | Select/count on F1+structural+F3; apply F2 only to the unique selected binding, in both 0028 and 0029 |
| C | Both receipt allowlists omitted four always-present X6 keys and rejected every genuine receipt | Admit the full always-present vocabulary plus the producer's matched/ambiguous path keys identically; for `outcome='absent'`, require `absent=1`, `matched=typed_collapsed=emitted=0`, and no path-only keys |
| D | `execute_rule_post` reacquired an exact `coding_rules` row after filing/entry, leaving a proposed→live phantom outside the total order | Capture the initially locked live-rule IDs once; the later exact lookup is plain and limited to that set |
| E | A.5 step-5 equality success was pre-empted; Slot-A ambiguity was silent; UUID selection was unstable/invalid | Supply registration to page resolution, order equality before refusal classification, return typed resolver outcomes, surface hard `binding_ambiguous`, and use ordered `array_agg` |
| F | The persistent scanner accepted a dead gate string and was blind to later dynamic CoR recuts | Require assignment→use→approve source order and fail closed on post-0029 dynamic executor patches; runtime reachability remains an explicit static-analysis residual |
| G | Slot B re-ran the raw clean-name proposal after a binding matched, reproducing the same uncaught `registration_conflict` and aborting every common bound wake draft | Treat only `existing_id` as explicit and compare its canonical id directly; every `new` proposal goes straight to the binding-selected safe form, with a real wake positive and explicit-id conflict cell |
| H | Every executor skip orphaned both position-0 receipts, so same-key replay returned `{pending:true}` forever | Route all 32 skip returns through `_settle_rule_post_skip`, settle the executor result, and delete the unused approve reservation; replay and orphan queries are merge-blocking cells |
| I | A literal-valued variable passed to `pg_get_functiondef` parsed as target `null`, so the persistent checker silently ignored a later executor recut | Resolve every statically attributable real CoR shape; fail loud on unresolved targets; exercise the exact checker with computed-target and unresolved-target self-tests |
| J | The binding-resolution event preceded `entry.drafted`, so the wake stale-window check rejected its own new event as `CLR12` | Emit `counterparty.binding_resolved` immediately after `entry.drafted` in the same transaction; postverify pins event order and the unstaged wake-to-post cell proves it |
| K | The pre-existing-approve-receipt shortcut in `execute_rule_post` returned without finishing the just-reserved executor receipt, orphaning it at `result=NULL` exactly like finding H | The shortcut now finishes the executor's own receipt with the replayed `approve_entry` result before returning; a deterministic hash-matching cell reproduces the race without a two-session harness |
| L | `assignedRegprocedureIdentity` only matched literal-shaped assignments, so a variable first given a literal then reassigned to a computed value was reported by its stale literal — a decoy | Track every assignment to the target variable in program order; only the LATEST one decides the outcome, and a non-literal latest assignment is unresolved regardless of any earlier literal; reassignment self-tests added for both the binding checker and the wiki lint |
| M | The three new tables' redundant `revoke all ... from public, clara_authenticated, ...` (removing privileges nobody held) forced Postgres to materialize `relacl`, which requires the owner's own grants explicit; `pg_dump` never re-emits a redundant owner self-grant, so a DR full-profile backup/restore round-trip came back owner-implicit — CI's grant-matrix (check 4.6) correctly refused the mismatch | Drop the revoke statement entirely; a table untouched by any GRANT/REVOKE keeps `relacl` NULL from creation, matching the existing `coding_rules`/`op_receipts` convention. Verified by a real local two-database backup(full)→restore-full→acl-baseline→`dr-verify.mjs` round-trip: 254 PASS/0 FAIL, including the relation-grant matrix at 702 rows identical; both postverifies needed no change since probe (2) already asserts the real `role_table_grants` invariant, not the revoke statement's presence |
| N | (post-merge, live founding) F1's byte-equality claim did not hold in general — the real EZSEC evidence window's three `invoice.vendor_name` fragments are suffix-truncation variants of the same logo tagline (scan-dependent), so `propose_vendor_identity_binding` refused `features_unstable` on real evidence and blocked the founding | Migration 0030 (CoR patch against the live 0001-0029 catalog): F1 adopts F2's own LCP discipline — stored F1 = `_binding_common_prefix` of the window's three normalized fragments, floored (`_binding_f1_floor_holds`: ≥8 chars AND ≥1 non-filler token) under the same `features_unstable` refusal; matching everywhere becomes `starts_with(document's fragment, stored F1)`, mirroring F2's own `starts_with` exactly, at all three call sites (`_derive_vendor_binding_proposal`, `_resolve_vendor_binding` Slot A, and both of `execute_rule_post`'s post-time F1 sites). F1 remains a stability feature only; F3 alone carries identity, unchanged |

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
