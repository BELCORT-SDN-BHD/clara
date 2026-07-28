# Autopost vendor binding — DESIGN v3 — PART 2: machinery, attacks, build, findings register

**Part 1 is `docs/plan/autopost-vendor-binding-design.md`** (the authority object, its ceremony,
scope and lifecycle, and the §9/§10 owner rulings). This part carries the machinery and every claim
the reviews forced to change.

**Review history.** Round 1 returned ten findings against v1; v2 answered them. Round 2 **closed
findings 1 and 4** and left the other eight open with live-body evidence — including a reconstructed
deadlock from the real lock order and an invalid regex in v2's normalizer. v3 is written under an
orchestrator directive to **narrow before defending**: this design serves one binding at one firm
today, so every optional subsystem the reviewer kept breaching is **cut** rather than re-armoured.

**What v3 CUT outright:** auto-suspension on divergence · atomic supersession · admission stamping ·
cross-extraction geometry in F3. **What v3 WITHDREW as false:** "a three-attempt cap bounds
re-extraction" and "Slot C does not depend on the marker at all". Every cut names what it was
protecting and where that risk now lives.

## A. The gate machinery (replaces v1 §5)

### A.1 Precondition — X6 must have found nothing, not merely accepted nothing

**Round 2 closed this.** Restated for completeness. The binding is consulted only when **all** hold
on the pinned facts extraction:

1. `vendor_identity.outcome = 'absent'` — not `ambiguous`, `matched`, `typed_disagreement` or
   `multi_document` (the last from `workflows/invoiceFacts.v1.azure.mjs:466`);
2. `vendor_identity.candidates` is an empty array;
3. every refusal counter is zero — `below_band`, `height_missing`, `unit_unresolved`, `no_geometry`,
   `rejected_gate`, `label_continuation`, `no_vendor_anchor`, `vendor_anchor_far`,
   `closer_to_customer`, `ambiguous`, `typed_disagreement`, `typed_vs_ambiguous`;
4. no `invoice.vendor_registration` region on that extraction;
5. `_resolve_counterparty` on the page's own vendor name returns `birth`.

`outcome = "absent"` alone is set whenever the *accepted* list is empty
(`invoice-vendor-identity.mjs:405-408`), so it does not distinguish "found nothing" from "refused
nine things". Conditions 2–3 are what make it mean the former. The resolver additionally requires the
receipt's key set to be a subset of a version-stamped allowlist and refuses
`binding_receipt_unrecognized` on anything unknown, so a future X6 counter cannot be silently ignored.

### A.2 Slot A — admission, and the stamping v3 DROPPED

At `0015:2431-2447`, after the existing block yields `vendor_unresolved`, call
`clara._resolve_vendor_binding(p_client, f.document_id)`. On a hit, set `v_counterparty` and append
the visible reason `vendor_bound`; `0015:2484` adds `vendor_bound` to the `array_remove` exemption
that `rule_backed` already uses.

**v2 promised to stamp the binding and both pins onto `autodraft_attempts`. v3 cuts that**, and the
reviewer's own evidence is why it was never buildable as described: `_coding_lane_core` returns only
`(lane, reasons)` (`0015:2358`), so the value never reaches the caller, and delivering it would have
required widening that signature plus replacing `admit_autodraft_task` — a second subsystem in
service of a record nothing consults.

It is safe to cut because **admission is not an authority; it is a queue decision.** Slot B
re-resolves the binding independently before writing any draft (A.3), and Slot C re-resolves again
before any post (A.5). A task admitted under a binding that has since vanished simply produces no
draft — Slot B refuses — which is the outcome the stamp was meant to force. **Consequence, stated:**
there is no durable record of *why* a task was admitted, only of why a draft was written. For a lane
whose admission grants nothing, that is an acceptable gap; it is listed in §E's residuals. **This
deviation from the reviewer's build list was raised explicitly and accepted as final** — §10 ruling
10; the replacement is not to be built.

### A.3 Slot B — the draft, so the model never judges identity

Still not optional: `autoDraft.v3.tools.ts:141-163` passes the model's raw `vendor` proposal into
`wake_draft_entry`, so admitting an EZSEC bill without a DB-side override would let the model **birth
a junk counterparty** — worse than today's clean refusal.

**The fingerprint stays an ordinary fingerprint** (round 2 closed this). Writing
`proposed_counterparty` as the resolved `{"existing_id": <bound cp>, "kind":"vendor"}` yields an
ordinary `registration_match`, so `_approve_entry_core`'s recompute-and-compare (`0015:1313-1317`)
passes and R2's `vendor_account` snapshot survives its decision-value gate (`0016:4167`).

- proposal resolves to the **same** canonical counterparty → proceed; stamp `vendor_binding_id`;
- proposal resolves to a **different existing** counterparty → agent lane: `CLR23`
  `vendor_binding_conflict`;
- proposal would **birth** → agent lane: birth refused, resolved form written, `vendor_binding_id`
  stamped.

Every branch writes a `phase='draft'` resolution row with `raw_proposal` (the model's original claim)
and `entry_revision_token`, both **NOT NULL**. Human lane: advisory, never blocking (§10 amendment A).

### A.4 `revise_entry`, and the trigger that would have blocked it

`revise_entry` recomputes and overwrites `match_fingerprint` on every revision (`0015:2127`), so it
must re-derive the binding and either re-stamp `vendor_binding_id` or, when the human's revision
moves the counterparty away from a bound one, clear it and write a `phase='revision'` resolution row
with `outcome='divergence'`.

**That update is impossible today, and v2's build list missed it.** `_tf_entry_immutable`'s
draft→draft allowlist is exactly
`['revision_token','updated_at','proposed_counterparty','match_fingerprint','last_human_editor','flags','closing_transfer']`
(`0016:4950-4956`); any other column change raises `CLR08`. So **`vendor_binding_id` must be added to
that allowlist** — a recut of `_tf_entry_immutable`, now named in §D. (The draft→approved branch
needs no change: approval does not modify the column, and unchanged columns compare equal.)

### A.5 Slot C — one post-time re-resolution, unconditional, with its own receipt

This unifies findings 2, 3 and 8, which round 2 showed are one defect: **the post phase had no
receipt and no unconditional trigger.**

**v2's gate was conditional on A.1 still holding, and that was the hole.** Re-extract the page so it
now resolves vendor Y directly, or carries a registration region, or reads `matched` — A.1 becomes
false, v2's binding control is *skipped entirely*, and the live executor happily resolves the stored
proposal for X and posts under X's rule. The attack needs no forgery, only a re-extraction.

**v3: the control is keyed on the ENTRY, not on the evidence state.** If the entry carries
`vendor_binding_id`, then before any post, under the binding row lock (Part 1 §4):

1. pin the current facts and `ocr` extractions;
2. re-run **A.1 and F1/F2/F3** against those pins;
3. write a `phase='post'` resolution row carrying those pins, the outcome, and
   `compared_to_resolution_id` pointing at the `phase='draft'` row — **before the post proceeds**;
4. require **all** of: the same binding still matches and is live/unexpired/undrifted; it resolves to
   the same canonical counterparty as the draft; and F1/F2 still match. Any mismatch is a loud typed
   skip, never a silent pass;
5. **if A.1 is now false** — the page resolves an identity by itself — require that page resolution
   to equal the draft's counterparty. A document that has learned to name its own vendor must name
   *the same* vendor, or it goes to a human.

Slot C consults **that receipt chain**, never a marker. The `vendor_binding_id` comparison is a
consistency check inside step 4, not the trigger.

**v2's claim that Slot C "does not depend on the marker at all" is WITHDRAWN.** It does: the entry's
marker is what makes the control fire. That is fail-closed (a lost marker turns a postable document
into a refusal, never the reverse) but it is a dependency, and A.4's trigger recut is what keeps the
marker honest across revisions.

Named skips: `binding_revoked` · `binding_expired` · `binding_identity_drifted` · `binding_ambiguous`
· `binding_uncorroborated` · `binding_no_corroboration_source` · `binding_changed` ·
`binding_features_changed` (bare F1/F2 mismatch — v2 specified no skip for this) ·
`binding_page_resolves_other` (step 5) · `binding_receipt_unrecognized`.

Everything else in `execute_rule_post` is untouched: high-stakes, control-leg-ties-to-gross, account
identity enumeration, cap, window, expiry, revision, corroboration.

### A.6 Pins, locks, and no workflow body changes

F1/F2 read the pinned `invoice_facts` extraction; F3 reads the `ocr` extraction, band-only, inside
that extraction's own geometry (Part 1 §3.2 — v2's cross-extraction anchor comparison is cut). Both
ids are pinned once per phase and recorded per phase.

**The executor pins facts before locking the entry today** (`0023:403` reads the entry unlocked),
which lets a re-extraction commit between pinning and approval. 0028 fixes this by locking the entry
`FOR UPDATE` immediately after loading it — which is also what puts the executor into the global lock
order of Part 1 §4.

`autoDraft.v3` and its tools are **not** modified — the guard sits in the DB, so the frozen workflow
manifest stays untouched and no `_vN` bump is needed.

## B. What the auditor sees

Per phase (`draft`, `revision`, `post`) an append-only `vendor_binding_resolutions` row: the binding,
document, entry, **that phase's own pins**, `raw_proposal`, `entry_revision_token`, outcome, and for
post rows `compared_to_resolution_id`. Plus the spine event `counterparty.binding_resolved`, the lane
reason `vendor_bound`, and `journal_entries.vendor_binding_id` surviving approval.

**The pre-revision warning is wired by name into `clara.get_draft_review`** (finding 8): a bound
draft returns the binding id, its signer, and the counterparty it names, so the human sees the
warning *in the surface they are acting in* — a general binding read surface does not do that, which
was v2's gap. The binding read surface separately lists features, evidence window with pins, signer,
resolutions, and the divergence count **by distinct `document_id`** (§10 amendment A).

## C. The adversarial set (replaces v1 §7)

**Withdrawn claims, cumulative:** v1's "self-healing" and "structurally impossible" (round 1); v2's
"three-attempt cap bounds re-extraction" and "Slot C does not depend on the marker" (round 2, below).

**C.1 Issuer impersonation — the `c/o` attack. RESIDUAL, not closed.** A legitimate invoice from
company Y can print `c/o X`, `prepared by X`, or `company secretary X` in its page-1 letterhead band
while Y's own identity sits elsewhere. F3 is band-only and role-blind, so it passes. v2 claimed a
vendor-anchor comparison closed this; round 2 broke that on coordinate-frame grounds (X6 compares
anchors within one Azure result, v2 crossed two extractions), and v3 removed the geometry rather than
specify a frame reconciliation this slice cannot justify.

**This is a real, unclosed hole, and it is not necessarily forgery** — the document may be entirely
honest and simply belong to Y. What bounds it: the amount cap, the monthly window, the corroboration
requirement, the divergence surface (a bookkeeper who notices codes it to Y, and that shows up), and
the owner's bounded-forgery ruling at §10 (5). What does **not** bound it: anything structural.

**§10 ruling 9 does not close this.** That ruling settles that F3 *may exist* (it corroborates an
authority a human created rather than creating identity from the page). It says nothing about what
F3 *cannot see*, and role-blindness is exactly that. If this residual is later judged unacceptable,
the answer is a role-aware issuer test with a specified coordinate frame — a piece of work this slice
does not attempt.

**C.2 Shared or generic invoice-number prefix.** F2 is a stability feature that resolves nothing
alone; the v3 floor (≥6 chars, ≥3 alphabetic, denylist including `binv`) refuses `inv2`. Measured
unevenness is accepted and argued in Part 1 §3.2.

**C.3 A forged document mimicking the pattern.** Must clear filing, the full A.1 precondition, F1,
F2, F3, two-reader corroboration of net *and* tax (`0023:635-639`), MYR, the entry shape
(`0023:546-591`), the cap, the monthly window, high-stakes, non-expiry, **and** A.5's post-time
re-resolution. Bounded small-ticket exposure with a complete audit trail; compared to the status quo,
not to zero. Owner-ruled at §10 (5), which declined a probationary expiry.

**C.4 The client switches secretarial firm mid-year.** New letterhead and registration → F1 and F3
fail → human queue → three approvals over ≥14 days → a new binding. The practice-sale variant
(acquirer keeps template and numbering) is caught by F3 only if the acquirer prints its own
registration in the band; transitional stationery printing the old registration is **residual**,
watched by the divergence surface.

**C.5 Authoring a broad binding.** Features are DB-derived from a DB-chosen window; the authoring
surface offers no widening lever. Not "impossible" — C.1 shows page evidence itself can be ambiguous.

**C.6 Steering the features. The v2 bound was FALSE and the real one is different.** v2 said
re-extraction is "bounded by a 3-attempt cap". It is not: `request_reextraction` has **no numeric
cap**, explicitly and by ruling — ADR-047 Q4, written into the migration's own header
(`0022:163-172`: *"WHY NO CAP … the bound that matters is STRUCTURAL"*). The `1..3` loop in
`0025:396` is a concurrent-version retry, not a cap. The real bounds are three, and different in kind:

- the verb is granted to `clara_authenticated` **only** — no workflow, sweep, wake or machine caller
  can ever enqueue it (the structural bound 0022's header names);
- the firm-level page budget applies to re-extractions exactly as to first extractions;
- **the per-document `invoice_facts` attempt budget of 3** (`0014:210`, `sum(attempt_count) >= 3` →
  `attempt_cap`) does bound how many times a document's facts can be re-derived — measured live on
  `BINV202510-018`, which exhausted it.

v3's structural answer does not rely on any of them: **the proposal refuses `evidence_restated` if a
window document's evidence was re-extracted after its entry was approved** (Part 1 §3.3 cond. 4).
Evidence a human did not approve cannot found a binding.

**C.7 Recency takeover. Bounded, not closed.** Part 1 §3.3a requires three distinct posting dates
spanning ≥14 days. That prices the attack in calendar time and in three genuine human approvals; it
does **not** require actor diversity, and at a firm where one person is bookkeeper, admin and owner
there is no actor diversity to require. **Residual, tied to the human-approval cost:** an actor who
can approve three documents over two weeks can also revoke and re-sign at will, so this window buys
time and a trail, not prevention.

**C.8 Revocation race and deadlock.** Part 1 §4's lock law, rebuilt from the live bodies. v2's
ordering claim was false and produced a real cycle; v3 places the binding lock last in every acquirer
and states the falsifiable invariant.

**C.9 Counterparty merge or identity drift.** Refuses `binding_identity_drifted`.

**C.10 Rules breeding rules.** Untouched (`0015:1472-1476`); the evidence window excludes
rule-checked entries.

**C.11 Unregistered counterparty.** Refused at proposal (§10 ruling 3).

## D. Build shape, and the activation interlock

**Objects.** Three tables · `_binding_normalize` (immutable, enumerated strip list) ·
`_resolve_vendor_binding` (private, `revoke all from public`) · three verbs
(`propose`/`sign`/`revoke`, `clara_authenticated`, role-floored, op-key, audited, spine events) · the
binding read surface (§B) · `create or replace` of `_coding_lane_core` (A.2), `_draft_entry_core`
(A.3), `revise_entry` (A.4), `get_draft_review` (§B), `execute_rule_post` (A.5) · Part 1 §6.2's
skip-vocabulary split. Next free error code looks like **CLR35** — verify as-built before cutting.

**The build items v2 omitted, now named** (finding 10):

- **`_tf_entry_immutable` recut** — add `vendor_binding_id` to the draft→draft allowlist (A.4);
- the new `journal_entries.vendor_binding_id` column **plus a composite
  `(vendor_binding_id, firm_id, client_id)` FK** to the bindings table, so an entry can never point
  at another firm's or client's binding;
- **`alter table … force row level security` + explicit ACLs on all three new tables**, matching the
  posture every other `clara` table carries;
- congruence FKs on the resolutions table (Part 1 §3.1);
- **no `admit_autodraft_task` replacement and no `autodraft_attempts` columns** — admission stamping
  is cut (A.2), so `_coding_lane_core`'s signature is unchanged too. This deviates from the literal
  build list the reviewer derived from v2; it was raised as a deviation and **ACCEPTED AS FINAL**
  (§10 ruling 10) on the argument in A.2 — admission is a queue decision, both later slots re-resolve
  fail-closed, and a task admitted under vanished authority produces no draft. **Do not build it.**
  The admission-provenance gap stays in the residual register rather than being engineered away.

**The split** (§10 amendment C): **0027** = everything except A.5. **0028** = A.5 alone.

**The activation interlock, rebuilt.** v2 probed
`to_regprocedure('clara._assert_binding_post_control()')`. Round 2 was right that this proves almost
nothing: it checks no owner, return type or body, a stub passes, and — the real failure — a later
`execute_rule_post` recut could drop the binding gate while the helper survives, silently re-arming
every live binding. v3 replaces it with two checks that are about facts rather than names:

1. **`sign_vendor_identity_binding` refuses `post_control_absent` unless 0028's row exists in
   `clara.schema_migrations`.** Only the migration runner writes that ledger, and it records the
   applied `sha256` (`packages/db/README.md:87`) — a stub function cannot fake a ledger row. With no
   live binding, `_resolve_vendor_binding` returns nothing and Slots A and B are inert, so **0027
   alone confers no usable authority**.
2. **0028's postverify asserts the gate by name in comment-stripped `prosrc` of
   `execute_rule_post`** — the same grep-the-body idiom 0023 already uses on itself. A later recut
   that drops the binding gate fails that assertion instead of silently re-arming bindings.

Neither check proves correct behaviour; together they prove the *object* and the *gate text* exist,
which is what a migration boundary can honestly assert.

**Rig first, then live.** The A.1 precondition matrix (genuine-absent vs each refusal counter); Part 1
§3.2's refusal matrix; the F2 floor against the real RPA series; F3 against a `c/o` fixture —
**expected to PASS, recorded as the C.1 residual, so the hole is a tested known rather than a
surprise**; the Slot-B birth-refusal; **an approval test proving the first binding-resolved draft
approves without `CLR23`** (the finding-1 regression, still the most important test in the set); a
revise test proving the `vendor_binding_id` update does not raise `CLR08` (A.4); the A.5 matrix
including the re-extraction-changes-the-page case and the bare F1/F2 mismatch; a revocation-race test
under the lock; a **lock-order test** asserting no path holds a binding lock while acquiring another;
`evidence_restated` and `window_too_recent`; and an exact-diff proving `draft_entry` stays
byte-identical for unbound documents.

**Live vehicle standing:** counterparty `348dc9cd`, 3 approvals, rule `90a07e89` live, 8 corroborated
EZSEC documents, IV-00743 (`671786e5…`, filing `0586d531…`) filed with no open draft. Note against
Part 1 §3.3a: the three EZSEC approvals are dated 25/08, 25/08 and 29/08 2025 — **two distinct
posting dates spanning 4 days**, which does **not** satisfy the new dwell requirement. The first
production binding therefore needs a fourth approved EZSEC bill on a later date (IV-00744 and the
three Tier-3 bills are filed and corroborated). This is a cost the dwell rule imposes on the very
first binding, named here rather than discovered at ceremony time.

**Gates before build:** 0026 lands · this v3 clears re-review. *(§9 Q9 was a gate until the owner
ruled it 2026-07-28 — F3 stays, §10 ruling 9 / amendment D. It is closed, not waived.)*

## E. Finding register — round-2 dispositions

| # | round-2 state | v3 disposition |
|---|---|---|
| 1 | **CLOSED** | Untouched. Resolved-form proposal → ordinary `registration_match`; approval recompute passes; R2 snapshot survives |
| 2 | not closed — marker dependency overclaimed; `_tf_entry_immutable` omitted → `CLR08` | **Claim withdrawn** (A.5 states the dependency and why it is fail-closed) + **trigger recut named** (A.4, §D) |
| 3 | not closed — A.1-conditional gate skippable by re-extraction; no F1/F2 skip; admission stamp had no writer | **Control made unconditional on the entry marker** with a step-5 branch for pages that now self-resolve; `binding_features_changed` added; **admission stamping CUT** with its consequence named (A.2, A.5) |
| 4 | **CLOSED** | Untouched (A.1) |
| 5 | not closed — predicate-vs-reader not structural; role-blind attribution; frame mismatch; F2 unevenness | **Geometry CUT** (band-only, one extraction); **C.1 named as an unclosed residual**; F2 unevenness argued; the doctrine question was escalated as §9 Q9 and the **owner RULED F3 stays** (§10 ruling 9 / amendment D: option B is "page creates identity → identity creates authority"; F3 is "human creates authority → page corroborates"). The mechanism is settled; **C.1 stays open** — it was never about whether F3 may exist |
| 6 | not closed — recency takeover unargued; no-cap claim false; `\p{Cf}` invalid | **Dwell added** (3 distinct dates, ≥14 days) with the residual named (C.7); **false claim withdrawn**, real bounds cited (C.6); **normalizer rewritten** with an enumerated strip list, no property classes |
| 7 | not closed — no `superseded`/`retired` status; lock claim false; deadlock | **Supersession DEFERRED**, renewal = revoke-then-fresh with the coverage gap accepted as a stated cost; status vocabulary corrected; **lock order rebuilt from live bodies** with a falsifiable last-lock invariant (Part 1 §4) |
| 8 | not closed — no post-phase receipt; nullable columns; no congruence FKs; warning unwired | **`phase` column + post-phase receipt written before the post proceeds**; `raw_proposal`/`entry_revision_token` **NOT NULL**; congruence FKs; **warning wired into `get_draft_review` by name** (§B) |
| 9 | not closed — notification not guaranteed; counts rows not documents | **Auto-suspension CUT.** Visible-only, counted by distinct document, no state change, no delivery promise (§10 amendment A) |
| 10 | not closed — probe proves little; stale-helper reactivation; omitted build items | **Interlock rebuilt on `clara.schema_migrations` + a comment-stripped `prosrc` postverify**; FORCE RLS/ACLs, composite FK, trigger recut all named; `admit_autodraft_task` deliberately excluded with reasons (§D) |

**Residual register — the complete list, each either bounded or named as open.** C.1 legitimate `c/o`
attribution (**open, no structural bound** — the design's largest known hole; §10 ruling 9 settled
that F3 may exist, not that it can see roles) ·
C.7 recency takeover (bounded by dwell + three human approvals; no actor diversity possible at a
one-person firm) · C.4 transitional stationery after a practice sale · C.3 bounded small-ticket
forgery (owner-ruled) · C.6 pre-approval re-extraction steering (bounded by `evidence_restated`, the
human-only grant, the page budget and the per-document facts cap) · A.1's forward-compatibility
hazard (new X6 counters — fails closed) · **A.2's admission-provenance gap** (no durable record of
why a task was admitted) · **renewal coverage gap** (Part 1 §4, accepted cost of deferring atomic
supersession) · F2 denylist unevenness (Part 1 §3.2) · the pre-existing `file_document` /
`confirm_attribution_candidate` filing lock-order hazard (task #29 — untouched, no binding path takes
a filing lock).

## F. Q5 — writing down #30, and naming the missing field

**Where "hand-drafts are not autopost-eligible BY DESIGN" is written.** Primary home:
`docs/prd/PRD.md` §6a (`:135-142`), the typed-authority section, because autopost eligibility *is* a
typed-authority property and §6a is where "the typed layer decides" already lives. One sentence, as
LAW:

> Auto-posting is a machine-lane authority. Only a draft produced by the autodraft lane — carrying
> `coding_kind` — is autopost-eligible. A hand-authored draft is never auto-posted: a human who
> drafts has already exercised judgment, and the maker/checker path (invariant 9), not a rule,
> completes it.

Also: an ADR in `docs/PROJECTLOG.md` recording the 2026-07-28 ruling, and an intent comment on
`execute_rule_post`'s eligibility block, which today states the mechanism (`0023:411-415`) but not
the intent. Not `ARCHITECTURE.md` (it names DB objects; the object is `journal_entries.coding_kind`,
already described); not the 0020 design doc (unrelated surface).

**The skip-reason fix.** Today one reason covers three distinct missing fields (`0023:411-415`).
Split into `ineligible_no_coding_kind` / `ineligible_no_document` / `ineligible_no_counterparty`,
returned in the JSON as well as written to `rule_post_skips`. The column is free text with only a
non-blank CHECK (`0015:337-348`), the table is append-only, and **no runtime or dashboard code matches
on the literal** (grepped `packages/runtime`, `apps/`, `scripts/` — zero hits outside SQL and tests),
so widening the vocabulary breaks nothing. Approved at §10 ruling 7.

Hand-drafts on a client with a live rule will keep producing one skip row per draft — correct, since
the skip is the visible receipt that the sweep saw the draft and declined it, but only a specific
reason makes those rows filterable instead of noise.
