# Autopost vendor binding — DESIGN v2 — PART 2: machinery, attacks, build, findings register

**Part 1 is `docs/plan/autopost-vendor-binding-design.md`** (the authority object: what a binding is,
how it is born, its scope and lifecycle, the §9/§10 owner rulings which remain law). This part
carries what v1 got wrong and what replaces it.

**Provenance of this part:** a Codex adversarial design review of v1 (branch tip `dcb6b8e`) returned
`VERDICT: FINDINGS` with ten design-level findings. Every load-bearing code claim in the review was
independently verified against the repo before redesigning; **all ten stand**, including one that
made the intended EZSEC autopost impossible. §E is the per-finding disposition register.

## A. The gate machinery (replaces v1 §5)

### A.1 Precondition — X6 must have found nothing, not merely accepted nothing

v1 fired the binding on `envelope.vendor_identity.outcome = 'absent'`. **That is far broader than
"the machine honestly found nothing"** (finding 4). `readVendorIdentityFromLines` sets
`outcome = "absent"` whenever the *accepted* list is empty
(`packages/runtime/lib/invoice-vendor-identity.mjs:405-408`) — which includes documents where
candidates *were* recognised and then refused for `below_band`, `height_missing`, `unit_unresolved`,
`no_geometry`, `rejected_gate`, `label_continuation`, `no_vendor_anchor`, `vendor_anchor_far`, or
`closer_to_customer`. A page carrying another company's *labelled* registration just below the top
band would be treated exactly like measured EZSEC, whose candidate list is genuinely empty.

v1 also mis-stated the vocabulary. The real outcomes are **`absent`, `ambiguous`, `matched`,
`typed_disagreement`** (`invoice-vendor-identity.mjs:406,415,422,480`) and **`multi_document`**
(`workflows/invoiceFacts.v1.azure.mjs:466`). `typed_collapsed` is a *counter* recorded under a
`matched` outcome, not an outcome.

**v2 precondition — all of these, on the pinned facts extraction:**

1. `vendor_identity.outcome = 'absent'`; **and**
2. `vendor_identity.candidates` is an empty array; **and**
3. every refusal counter is zero — `below_band`, `height_missing`, `unit_unresolved`, `no_geometry`,
   `rejected_gate`, `label_continuation`, `no_vendor_anchor`, `vendor_anchor_far`,
   `closer_to_customer`, `ambiguous`, `typed_disagreement`, `typed_vs_ambiguous`; **and**
4. no `invoice.vendor_registration` region exists on that extraction; **and**
5. `_resolve_counterparty` on the page's own vendor name returns `birth` (or the region is absent).

Anything else — a contested page, a refused candidate, a multi-document envelope — is a page the
machine had *something* to say about, and a standing authority must not speak over it. The measured
EZSEC receipt satisfies all five (`{"outcome":"absent","candidates":[],"absent":1}`, every other
counter `0`), so the intended vehicle still works; the widened cases no longer do.

**Forward-compatibility hazard, named:** condition 3 enumerates counters that live in runtime code,
so a future X6 counter would not be in the DB's list. The resolver therefore **fails closed on
unknown keys**: it requires the receipt's key set to be a subset of a version-stamped allowlist and
refuses `binding_receipt_unrecognized` otherwise, rather than ignoring what it does not know.

### A.2 Slot A — `_coding_lane_core`, admission

At `0015:2431-2447`, after the existing block yields `vendor_unresolved`, call
`clara._resolve_vendor_binding(p_client, f.document_id)`. On a hit, set `v_counterparty` and append
the visible reason `vendor_bound`; `0015:2484` adds `vendor_bound` to the `array_remove` exemption
that `rule_backed` already uses, so the reason is informational rather than blocking.

**Admission must persist the decision, not just a word** (finding 3). v1 recorded only the text
reason, so nothing tied the admitted task to the authority that admitted it: if the binding vanished
between admission and drafting, Slot B would silently fall back to the ordinary birth path — the very
path the admission bypassed. v2 stamps `binding_id`, `facts_extraction_id` and `ocr_extraction_id`
onto the `clara.autodraft_attempts` row, and **Slot B refuses (`binding_withdrawn`) if a task admitted
under a binding can no longer resolve through that same binding.** A task admitted by an authority
may only be completed by that authority.

### A.3 Slot B — the draft, so the model never judges identity

Unchanged from v1 in purpose, and still not optional: `autoDraft.v3.tools.ts:141-163` passes the
model's raw `vendor` proposal into `wake_draft_entry`, so admitting an EZSEC bill without a DB-side
override would let the model **birth a junk counterparty** — worse than today's clean refusal.

What changes is how the binding is recorded.

**The fingerprint stays an ordinary fingerprint.** v1's `match_fingerprint={"decision":"binding_match"…}`
breaks `_approve_entry_core`, which recomputes `_resolve_counterparty(proposed_counterparty)` and
raises `CLR23` unless the result equals the stored fingerprint *exactly* (`0015:1313-1317`) — the
first EZSEC approval would have failed, and `execute_rule_post` does not translate that `CLR23` into
a skip. It would also drop R2's signed `vendor_account` snapshot, gated on the decision being
`registration_match` / `name_match_unregistered` / `alias_match` (`0016:4167`). So:

- proposal resolves to the **same** canonical counterparty → proceed; stamp `vendor_binding_id`;
- proposal resolves to a **different existing** counterparty → agent lane: `CLR23`
  `vendor_binding_conflict`;
- proposal would **birth** → agent lane: birth refused, `proposed_counterparty` written as the
  resolved `{"existing_id": <bound cp>, "kind":"vendor"}` so `_resolve_counterparty` yields an
  ordinary `registration_match` fingerprint, R2's snapshot is preserved, and approval's
  recompute-and-compare passes.

**`journal_entries.vendor_binding_id`** (new, nullable) carries the authority marker. It is
provenance, never an input to resolution, and it is **not** nulled at approval. Every branch above —
including "proceed unchanged" — stamps it, closing v1's gap where the admitting authority left no
mark whenever the model happened to guess the right vendor (finding 2).

The resolutions row records `raw_proposal` (the model's original claim, which v1 destroyed by storing
only the resolved form) and `entry_revision_token` (the revision the resolution justified) — both
required by finding 8 for an auditor to reconstruct what was claimed versus what was decided.

Human lane: advisory, never blocking (§10 amendment A).

### A.4 `revise_entry` — the hole v1 left open

`revise_entry` recomputes and overwrites `match_fingerprint` on every human revision
(`0015:2127`). v1's Slot C keyed on a fingerprint marker, so the review's bypass was real: revise a
bound draft for X (changing only a memo or a line, keeping X), revoke the binding, and the post
proceeds because the marker is gone.

v2 closes it twice over. **Structurally** — Slot C no longer trusts any marker (A.5). **For the
audit trail** — `revise_entry` must re-derive the binding for the document and either re-stamp
`vendor_binding_id`, or, when the human's revision changes the counterparty away from a bound one,
clear it **and write a `divergence` resolutions row**, which is also what feeds the §10 amendment-A
suspension consumer.

### A.5 Slot C — re-resolve current evidence, not "is the binding still live"

This is the largest correction in v2 (finding 3). v1 rechecked liveness against a marker. That is
insufficient in two independent ways: the marker is mutable (A.4), and liveness says nothing about
whether the *document* still resolves through that binding. Migration 0026 widens the re-extraction
lanes, and `request_reextraction` already exists, so a document's newest facts extraction can change
after the draft is written — a later extraction may name a different vendor, alter F1/F2, fail F3, or
match a second binding, while the stored proposal for X still posts.

**The v2 post-time control is keyed on the DOCUMENT, not on the entry's marker:**

> If, at post time, the document's own page evidence does not resolve the counterparty — i.e. the
> A.1 precondition holds on the executor's **bound** extraction — then a live binding **must**
> currently match that document, **must** be the binding recorded on the entry, and **must** resolve
> to the same canonical counterparty the draft carries. Otherwise: a named skip.

Stated that way the control needs no trustworthy marker: it re-derives the same question admission
asked, against current evidence, under the binding row lock (Part 1 §4). The marker is compared as a
*consistency check*, not relied on as the trigger — so A.4's revision bypass cannot re-open it.

Named skips, beside the existing `not_corroborated` admission gate (`0023:635-639`):
`binding_revoked` · `binding_expired` · `binding_suspended` · `binding_identity_drifted` ·
`binding_ambiguous` · `binding_uncorroborated` · `binding_unattributable` ·
`binding_no_corroboration_source` · `binding_changed` (a different binding now matches) ·
`binding_receipt_unrecognized`.

Everything else in `execute_rule_post` is untouched: high-stakes, control-leg-ties-to-gross, account
identity enumeration, cap, window, expiry, revision, corroboration. **The binding changes who the
counterparty is; it changes no number and lowers no other gate.**

### A.6 Two pins, and no workflow body changes

F1/F2 read the pinned `invoice_facts` extraction; F3 reads the latest done `ocr` extraction. Both are
pinned once at the top of the resolver, by the same `order by version_n desc, id desc limit 1`
discipline, and both ids are recorded (§10 ruling 4). Zero done `ocr` extractions ⇒ refuse
`binding_no_corroboration_source`. Live coverage is 47/47.

`autoDraft.v3` and its tools are **not** modified — the guard sits in the DB, which cannot be prompted
around, so the frozen workflow manifest stays untouched and no `_vN` bump is needed.

## B. What the auditor sees

Per binding-resolved draft: a `vendor_binding_resolutions` row (binding, document, entry, **both
extraction pins**, `raw_proposal`, `entry_revision_token`, outcome `bound` or `divergence`); the spine
event `counterparty.binding_resolved`; the lane reason `vendor_bound`; and `journal_entries.vendor_binding_id`
surviving approval. Per binding: a read surface listing its features, its evidence window with pinned
extraction ids, its signer, its resolutions, and its divergence count — the consumer finding 9
required, and the input to the 3-in-30-days suspension.

## C. The v2 adversarial set (replaces v1 §7)

**Two v1 claims are withdrawn as false, not reworded.**

- v1 §7.1 called the design **"self-healing"**. It was not: v1 required F1 to agree across *every*
  qualifying historical approval, so one old letterhead variant blocked the binding permanently and
  fresh approvals could never clear it. v2 earns the claim instead of asserting it — the evidence
  window is the **three most recent** qualifying approvals (Part 1 §3.3), so three approvals of a
  changed format do heal it.
- v1 §7.5 called broad bindings **"structurally impossible."** False. The review derived the
  v1-permitted prefix `inv2` from the real RPA series, and showed an unattributed F3 passing on a
  sibling bill. v2 raises the F2 floor and attributes F3 (Part 1 §3.2); the honest claim is now
  *bounded*, below.

**C.1 Issuer impersonation — sibling company or "issued on behalf of" (the review's attack).**
Company Y bills the client using the group's shared logo (satisfying F1), a number in the family
(F2), and mentions bound firm X somewhere on the page as company secretary, preparer or payment
agent (satisfying v1's whole-text F3), while Y's own registration is unlabelled or X6-refused.
Result under v1: a valid, corroborated, under-cap bill posts against X's rule though it legally
belongs to Y. **v2 wall:** F3 is attributed — the bound identity must appear in the issuer block
(top band, nearer the typed `VendorName` anchor than `CustomerName`), where a secretary/preparer
mention does not sit. **Residual, named:** a document that prints X's identity *in the letterhead*
while being legally issued by Y is not distinguishable from a genuine X bill by any page-level test;
that is a forgery case (C.3), not an attribution case.

**C.2 Shared or generic invoice-number prefix.** F2 is a stability feature only (Part 1 §3.2) and
never resolves anything alone. The v2 floor (≥6 chars, ≥3 alphabetic, non-generic leading run) refuses
`inv2` twice over. Two live bindings matching one document is `binding_ambiguous`.

**C.3 A forged document mimicking the pattern.** To post, a forgery must clear: filing to the right
client; the full A.1 precondition (not merely `absent`); F1 exactly; the v2 F2 floor; **F3 attributed
in the issuer block**; two-reader corroboration of net *and* tax (`0023:635-639`); MYR; the entry
shape (one payable credit equal to the stated gross, ≥1 signed-account debit, zero outside legs —
`0023:546-591`); the cap; the monthly window; high-stakes; non-expiry; and the A.5 re-derivation at
post time. This remains a **bounded small-ticket exposure with a complete audit trail** naming the
binding and its signer, and it belongs compared to the status quo — today the same forgery reaches
the review queue and a bookkeeper approves it. The binding changes who is in the loop for recurring
bills under the cap. Owner-ruled at §10 (5), which declined a probationary expiry.

**C.4 The client switches secretarial firm mid-year.** New letterhead and registration → F1 and F3
both fail → human queue → three approvals → a new binding may be signed (and *can* be signed, now
that the window is most-recent-three). The practice-sale variant — acquirer keeps the template and
numbering — is caught by attributed F3, since the acquirer's letterhead prints its own registration.
**Residual:** transitional stationery still printing the old registration in the letterhead. The
invoice itself asserts the old entity; cap, window and 12-month expiry bound the damage; the
amendment-A divergence counter is the early-warning, and now it actually suspends (§10 amendment A).

**C.5 Authoring a broad binding.** Features are DB-derived from a DB-chosen window; there is no
caller input through which to widen a pattern. The honest statement is that **the authoring surface
offers no widening lever** — not that broad matching is impossible, since C.1's residual shows page
evidence itself can be made ambiguous.

**C.6 Steering features by re-extraction.** Derivation pins the approval-time extraction ids per
evidence document, and signing requires byte-equality with the proposal (Part 1 §3.3), so a
re-extraction between proposal and signature refuses `proposal_drifted` rather than activating stale
features. **Residual:** a re-extraction *before* proposal can influence which features get derived.
It is bounded by `request_reextraction` being audited and capped at 3 attempts per document
(`0014:210`), and by every window document still needing an independent human approval.

**C.7 Revocation race.** Closed by the single serialization point (Part 1 §4): the binding row is
locked by post, revoke, sign and lazy expiry alike.

**C.8 Counterparty merge or identity drift.** Resolution canonicalizes; a registration differing from
`registration_at_signing` refuses `binding_identity_drifted` and demands re-signature.

**C.9 Rules breeding rules.** Untouched — the sighting/auto-proposal block is human-only
(`0015:1472-1476`), and the binding's evidence window excludes rule-checked entries, so a binding can
never be born from autopost output.

**C.10 Unregistered counterparty.** Refused at proposal (§10 ruling 3).

## D. Build shape, and the activation interlock

**Objects.** Three tables (Part 1 §3.1) · `_binding_normalize` · `_resolve_vendor_binding` (private,
`revoke all from public`) · three verbs (`propose` / `sign` / `revoke`, `clara_authenticated`,
role-floored, op-key idempotent, audited, spine events) · the divergence-suspension consumer · a
binding read surface (§B) · `create or replace` of `_coding_lane_core` (A.2), `_draft_entry_core`
(A.3), `revise_entry` (A.4), `execute_rule_post` (A.5) · Part 1 §6.2's skip-vocabulary split · the new
`journal_entries.vendor_binding_id` column. Next free error code looks like **CLR35** — verify
against as-built before cutting.

**The split, per §10 amendment C:** 0027 = everything except A.5; **0028 = A.5 alone.**

**The activation interlock (finding 10).** The split creates a window in which 0027 has shipped
signing, Slot A and Slot B while 0028's post-time control does not exist — so a bound draft could
reach the *old* executor, which has no binding gate at all. Migrations are applied in order, but they
are released as separate artifacts and the runway has already seen a deploy sequenced across two
images, so the interlock must be structural rather than procedural:

> `sign_vendor_identity_binding` refuses `post_control_absent` unless the object 0028 installs is
> present — checked as `to_regprocedure('clara._assert_binding_post_control()') is not null`.

0027 alone therefore yields no `live` binding; with no live binding `_resolve_vendor_binding` returns
nothing; with no resolution Slots A and B are inert. **0027 confers no usable authority until 0028
lands**, and the interlock is a fact about the catalogue rather than a promise about release order.

**Rig first, then live.** The A.1 precondition matrix (genuine-absent vs each refusal counter); the
Part 1 §3.2 refusal matrix; F3 attribution against a sibling-mention fixture (C.1); the F2 floor
against the real RPA series (C.2); the Slot-B birth-refusal; **an approval test proving the first
binding-resolved draft approves without `CLR23`** (the finding-1 regression, and the single most
important test in the set); a revise-then-revoke test (A.4/A.5); a revocation-race test under the
lock; an atomic-supersession test; and an exact-diff proving `draft_entry` stays byte-identical for
unbound documents.

**Live vehicle already standing:** counterparty `348dc9cd`, 3 approvals, rule `90a07e89` live, 8
corroborated EZSEC documents, IV-00743 (`671786e5…`, filing `0586d531…`) filed with no open draft.
After both migrations deploy, the resume is a single `request_autodraft(0586d531…)`.

**Gates before build:** migration 0026 lands, **and** this v2 clears re-review.

## E. Finding register — disposition of all ten

| # | finding | disposition |
|---|---|---|
| 1 | `binding_match` breaks `_approve_entry_core`'s recompute-and-compare (`0015:1313-1317`); drops R2's rule snapshot (`0016:4167`) | **DESIGN CHANGE — verified against code.** Fingerprint stays ordinary; authority moves to `journal_entries.vendor_binding_id`. A.3, Part 1 §3.1. Regression test named in §D |
| 2 | Slot C's marker optional and mutable; `revise_entry` overwrites it (`0015:2127`); revoked binding still posts | **DESIGN CHANGE.** Marker stamped on *every* branch incl. "proceed unchanged"; `revise_entry` re-derives and records; and Slot C no longer depends on the marker at all. A.3, A.4, A.5 |
| 3 | Neither admission nor posting bound to the full resolution; 0026 re-extraction makes stored-proposal-still-posts real | **DESIGN CHANGE.** Admission stamps binding + both pins on `autodraft_attempts`; post time **re-resolves current evidence through the same binding**. A.2, A.5 |
| 4 | X6 `absent` conflates empty candidates with nine refusal reasons; vocabulary mis-stated | **DESIGN CHANGE — verified.** Five-part precondition incl. empty `candidates` and all-zero counters, plus fail-closed on unknown receipt keys. A.1 |
| 5 | F3 unattributed → sibling / on-behalf attack; F2 floor yields `inv2`; §7.5 claim false | **DESIGN CHANGE + CLAIM WITHDRAWN.** F3 attributed to the issuer block; F2 floor raised (≥6, ≥3 alpha, generic denylist); roles restated (F1/F2 stability, F3 identity); "structurally impossible" withdrawn. Part 1 §3.2, C.1, C.2, C.5 |
| 6 | Derivation not approval-pinned; "self-healing" false; no Unicode spec; signing not hash-bound | **DESIGN CHANGE + CLAIM WITHDRAWN.** Per-evidence extraction pins; most-recent-three window (which earns the healing claim); NFC + `Cf`-strip normalizer; signing requires byte-equality else `proposal_drifted`. Part 1 §3.2/§3.3, C.6 |
| 7 | Lifecycle not linearizable; expired rows squat the unique index; liveness read is not a brake | **DESIGN CHANGE.** Expiry becomes a status transition + universal read-time predicate; atomic supersession; one serialization point (the binding row lock) for post/revoke/sign/expire. Part 1 §4, C.7 |
| 8 | Provenance drops the raw model proposal and the revision token; `revise_entry` records no divergence | **DESIGN CHANGE.** `raw_proposal` + `entry_revision_token` on the resolutions row; `revise_entry` writes divergence. Part 1 §3.1, A.3, A.4 |
| 9 | Divergence early-warning has no consumer — decorative | **DESIGN CHANGE.** Binding read surface + **3-divergences-in-30-days → `suspended_pending_resignature`** and notify the signer, reusing `0023:684-698`. Explicitly does not touch the owner's advisory ruling. Part 1 §10 amendment A, §B |
| 10 | Free-form `features jsonb`; array evidence without congruence; no immutability; no split interlock | **DESIGN CHANGE.** Typed feature columns with CHECKs; evidence child table with composite firm/client FKs; freeze trigger once live; **activation interlock** via `to_regprocedure`. Part 1 §3.1, §D |

**Residuals carried, argued rather than closed:** C.1 (a letterhead that genuinely prints the bound
party's identity while another entity issues it), C.3 (bounded small-ticket forgery, owner-ruled),
C.4 (transitional stationery, now watched by the divergence counter), C.6 (re-extraction before
proposal, bounded by the audited 3-attempt cap and by every window document needing its own human
approval), and A.1's forward-compatibility hazard (new X6 counters, mitigated by failing closed on an
unrecognised receipt shape).
