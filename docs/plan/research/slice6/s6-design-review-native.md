# Slice 6 design review — NATIVE lane

**Targets:** `docs/plan/slice6-thin-e2e-contract.md` (v1.0) + `docs/plan/slice6-migration-0009-design.md`.
**Evidence base:** `.tmp/slice6-briefs/1..6` (file:line cited), spot-verified against
`packages/db/migrations/0003,0004,0005,0007` and `packages/runtime/lib/matcher.mjs`.

## VERDICT: SOUND-WITH-FINDINGS

The core architecture is sound and law-abiding: the write floor rides the *existing* complete
`wake_draft_entry`/`_draft_entry_core` lane with only runtime plumbing added (no new books-writer,
no wake approve variant — invariant 4 intact); `approve_entry` v3's token-check-then-stamp-then-flip
order is genuinely correct against the real trigger bodies; the counterparty core, `coding_tasks`,
and chatTurn_v2 freeze mechanics are precedented. **But there are three build-blocking HIGH defects**
where the design is internally contradictory or omits a required migration change, plus a cluster of
MEDIUM gaps. None invalidate the architecture; all have concrete fixes. The three HIGH items must be
resolved before build, and F1 (egress-gate hole) is a safety-control breach that gates any world-off
operation.

---

## HIGH

### F1 — invoice_facts lane escapes the egress gate; §1 omits the function that must change
**Severity: HIGH.** Contract §4 / companion §5, §1. As-built: `claim_document_processing_task`
(`0007:2112`) hard-codes the held-egress branch to **`if t.lane='ocr' and not p_egress_approved`**,
and the OCR concurrency cap (`0007:2118-2122`) is likewise `lane='ocr'` only. The new `invoice_facts`
lane is an Azure-DI (`prebuilt-invoice`) *egress* lane (companion §5). Companion §5 asserts "the
held_egress claim-gate branch applies to it EXACTLY as to 'ocr'," but companion §1's "Replaced"
list does **not** include `claim_document_processing_task`. As written, an `invoice_facts` task
claimed while `CLARA_DOC_EGRESS_APPROVED=0` is **not** held — it proceeds to `running` and the
normalizer calls Azure DI, egressing a client document while the operator gate is OFF. This breaks
the world-off guarantee the T2-48h ceremony depends on and the S6-R1 "flag is all-or-nothing"
discipline. (`release_held_document_tasks` `0007:2129` *is* lane-agnostic, so the release-parity
claim is true — the hole is purely on the claim/hold side.) **Fix:** add `claim_document_processing_task`
to §1's Replaced set; gate held-egress on `lane in ('ocr','invoice_facts')` and decide whether the
concurrency cap covers the new lane. Cross-refs §8's release-count verification.

### F2 — `revise_entry` cannot change `proposed_counterparty`; the vendorless-payable draft is a dead-end
**Severity: HIGH.** Contract §5 / companion §2, §7. `_tf_entry_immutable` (`0007:1021-1056`, verified)
diffs `to_jsonb(new) - v_allowed` vs `old`; the **draft→draft** allow-set is exactly
`array['revision_token','updated_at']` (`0007:1028-1029`). Companion §2 adds `proposed_counterparty`
to the **draft→approved** allow-set *only* ("...gains `proposed_counterparty` (cleared) + nothing
else"). But companion §7 requires `revise_entry` to "replace `proposed_counterparty`" on a **draft**
(a draft→draft UPDATE) — which `_tf_entry_immutable` will reject with **CLR08**. This is a hard
build-time failure for any revise that touches the vendor. It also creates a dead-end: if a payable-
class line reaches approve without a `counterparty_id`, step 6 raises **CLR23**, the human cannot add
a vendor via approve (no vendor arg), and cannot add one via `revise_entry` (CLR08) — the only escape
is withdraw + re-draft. (`t_je_immutable` fires on `update or delete` only, `0003:468`, so the
initial `_draft_entry_core` INSERT is fine; the problem is confined to UPDATEs.) **Fix:** add
`proposed_counterparty` to the draft→draft allow-set too (not just draft→approved). Also reconcile
the withdraw path: draft→withdrawn's allow-set (`0007:1040`) omits `proposed_counterparty`, so
withdraw leaves it non-null on a withdrawn entry — harmless *iff* "must be null unless status='draft'"
is a writer-procedural rule; if it is ever promoted to a table CHECK, withdraw deadlocks (can't clear
it, can't leave it). State which it is.

### F3 — two-tier provenance's Tier A is unreachable on the first coding turn (async lane vs sync draft)
**Severity: HIGH.** Contract §4 (D-1, an owner delta-flag) / companion §5. §4 enqueues the
`invoice_facts` lane "ON DEMAND when coding starts" and reuses the `document_processing_tasks` +
reconciler machinery — an **asynchronous** claim→Azure→normalize→done cycle. But the draft happens
**synchronously in the same chat turn** ("code the bill" → perceive → `draft_journal_entry` →
`je_review`), and §2 forbids a new park/hook kind and says the turn ends when the draft is proposed.
So the semantic `invoice.total` region the Tier-A cross-check (CLR21) reads is **not persisted yet**
when the draft is created → the first coding pass is **always Tier B** (model-read); Tier A/CLR21
only engages on a later re-code after the lane completes. The contract presents Tier A as the primary
"machine-verified total" path (and the GATE-3 demo bill would code Tier B). **Fix:** either enqueue
`invoice_facts` earlier (at filing/finalize or intake, so facts are ready by coding time), or
explicitly re-scope §4 so Tier B is the acknowledged first-pass default and Tier A is a re-code
backstop — and stop presenting Tier A as the in-turn norm. This is a flagged delta the owner would
otherwise ratify on a false premise.

---

## MEDIUM

### F4 — counterparty birth race: §3 step 4 is a bare INSERT; §10 assumes CLR23-retry-with-match
**Severity: MEDIUM.** Companion §3 step 4 / §10. Two concurrent approvals of different drafts both
proposing the same new vendor (same `registration_no` or `name_normalized`) each lock only their own
entry row (FOR UPDATE, no contention), both miss the match, both INSERT → the partial unique
(`unique (client_id, registration_no) where ... active`) raises 23505 on the loser, aborting the
whole approve txn with a raw unique-violation, not CLR23. §10's battery expects "unique-violation
surfaces as CLR23 retry-with-match," but §3 step 4 specifies no catch/re-match. **Fix:** specify the
writer-body handling (catch 23505 → re-match the now-existing active row → reuse, else CLR23).

### F5 — draft request-hash excludes `proposed_counterparty`; a vendor-only change silently dedupes
**Severity: MEDIUM.** Companion §1 / `_reserve_op` (`0004:46-60`, verified: same op_key + **different**
request_hash ⇒ CLR10; same hash ⇒ returns stored receipt). `_draft_entry_core`'s hash
(`0007:1192-1194`) covers `{c,r,d,m,l,doc,sha,f}` — **not** the new `p_proposed_counterparty`. With
the tool's op_key `code-doc:<document_id>:<turn_key>` stable across a turn, a re-draft that changes
only the vendor keeps the same hash → returns the *old* receipt, silently ignoring the new vendor.
**Fix:** include `p_proposed_counterparty` in the request-hash payload.

### F6 — vendor dedup breaks on legal-suffix punctuation; the corpus already contains a variant
**Severity: MEDIUM.** Companion §2 / brief 6(c). `matcher.mjs:62` `norm = trim().toLowerCase()`
(verified) — no punctuation strip, not even internal-whitespace collapse (so the contract's
"lower + collapse/strip whitespace" description is itself imprecise). The RPR corpus renders the same
vendor as "BRIGHTPATH CONSULTANCY **SDN. BHD.**" (GL, brief 6 line 94) and "SDN BHD" (manifest, line
160); the two BRIGHTPATH bills (Oct + Nov) would birth **duplicate** `name_normalized` counterparties
unless `registration_no` is present. **Fix:** require the `invoice_facts` lane to extract
`registration_no` (the hard key), and/or strip punctuation + legal-suffix in `name_normalized`.
Mark the exact `norm` behavior VERIFY-ON-RIG.

### F7 — `get_document_extract` is firm-scoped, contradicting S6-R11's in-session client isolation
**Severity: MEDIUM.** Contract §3 / §0 S6-R11 / brief 3(d),4(e). `read_document` →
`get_document_extract` is `security invoker` on `clara_agent_ro`, whose RLS is firm-scoped via
`wake_firm()` (the wake credential carries no client — `mintWakeCredential(firmId)`). So a session
bound to client RPR can read the raw extraction text of a document filed to a **different** client in
the same firm — but S6-R11 rules "client isolation holds in-session; the only cross-client surface is
the firm-scoped unassigned-document read tool." The DB fn cannot know the session's client (runtime
concept), so the wrapper must gate it. **Fix:** the runtime `read_document` wrapper must restrict
returnable documents to {unassigned} ∪ {filed to the session's bound client}, or the contract must
explicitly re-scope S6-R11 to permit firm-wide extract reads. Same concern applies to
`get_draft_review` on other clients' drafts (lower risk).

### F8 — `_validate_entry_lines` refactor risks the very drift it prevents (rounding auto-append)
**Severity: MEDIUM.** Companion §7. `_draft_entry_core` auto-appends a rounding leg for a 1–5c residual
(`0007:1239-1244,1261-1264`) and raises CLR07 only above 5c. If the factored `_validate_entry_lines`
only *checks* the rounding law but the auto-append stays in `_draft_entry_core`, then `revise_entry`
on a 1–5c-off line set raises CLR07 where a fresh draft would have silently balanced — the two drift
exactly where the refactor claims they won't. **Fix:** the shared helper must include the rounding-leg
auto-append (and the ≥2-line / COA-existence / balance checks), not just validation.

### F9 — no guard against two approved entries citing the same document (double-coding a bill)
**Severity: MEDIUM.** Contract §7 / §2 / brief 5(c). `list_uncoded_documents` anti-joins against
non-withdrawn `journal_entries.document_id`, so a document drops off the worklist after the first
**draft**. But two drafts for one document across two turns are permitted (op_key differs per
`turn_key`), and both can be approved → two approved entries expensing the same bill. Nothing enforces
"≤1 non-withdrawn entry per document." **Fix:** decide the rule (e.g. a partial unique or an approve-time
check on `document_id` among non-withdrawn entries) or explicitly accept + name the risk. This is the
duplicate-bill edge the §10 PM lens calls for.

### F10 — `enqueue_invoice_facts` idempotency guard is unspecified (op_key ≠ per-document)
**Severity: MEDIUM.** Companion §5. "Idempotent per (document, engine, version)" but the fn takes a
`p_op_key`; two coding turns (different op_keys) could each enqueue an `invoice_facts` task for the
same document → double Azure egress. Op_key (per-turn) does not enforce per-document idempotency.
**Fix:** add a concrete guard — a partial unique on `document_processing_tasks(document_id, lane)`
where status active, or on (document, engine, version).

### F11 — RPR onboarding operator script: live-books idempotency + ceremony sequencing unspecified
**Severity: MEDIUM.** Contract §9 / companion §9.6 / CLAUDE.md shared-project caution. The script runs
audited fns against **live** books on the shared project (which holds the spike's parked run + world-off
state). If it uses random op_keys, a re-run after partial failure double-creates; `create_firm` on the
already-real BELCORT firm errors/duplicates. §9 specifies neither deterministic op_keys nor where the
script sits relative to the T2-48h/world-on gate. **Fix:** mandate deterministic op_keys (idempotent
re-run), create-or-skip for the firm, and state the run ordering against the ceremony.

### F12 — GATE-3 eval rests on supplier-invoice PDF contents nobody has read
**Severity: MEDIUM.** Contract §9 / brief 6(c),(header). The 20-file manifest and its adjudication rules
were built from **filenames listed, not opened** (brief 6 header; `RPR - Supplier Invoice/**` "listed
only"). Rule (ii)'s RPA Jul–Dec 10× resolution assumes the PDFs show RM5,000 (plausible — GL descriptions
add "& payroll services") but this is **unverified**; rule (iii)'s BRIGHTPATH 560-variance likewise.
The eval's pass/fail correctness depends on document contents that have not been confirmed. Also rule
(i) "binds on … the AP total" is ambiguous: RPR posted no per-bill AP (all direct to 310-000 CASH),
and 400-000 is a control plug that doesn't foot cleanly (brief 6 oddity 6) — "the AP total" must mean
the sum of Clara's own AP credits over the eval set, not RPR's 400-000 figure. **Fix:** open + confirm
the manifest's expected values before the eval is authoritative; disambiguate "AP total."

### F13 — event-taxonomy: additive rows to the ACTIVE version vs 0007's v2 cutover
**Severity: MEDIUM (VERIFY-ON-RIG).** Companion §1. New event types are to be added to "the ACTIVE
taxonomy version's coverage set in-migration … additive rows, unlike 0007's v2 cutover." Verified:
`trigger_taxonomy` blocks only UPDATE/DELETE (`0005:298`), so INSERT of new (version, event_type,
decision) rows for the active version is *not* trigger-blocked, and `domain_events` validates the
triple on insert (`0005:236-239`); same-txn insertion of event_type + coverage avoids any window. So
this is likely lawful — but 0007 deliberately chose a version repoint for its new events, and the
companion should justify the deviation and confirm no "full-coverage-at-all-times" assertion is
violated. **Fix:** justify additive-to-active in the companion; VERIFY-ON-RIG.

### F14 — perception stub promises `filename`/`status` not reachable on the workflow's read role
**Severity: MEDIUM/LOW.** Contract §3 / brief 1(b),3(d). `messageFromParts_v2` renders
`[attachment: <document_id> | <filename?> | <status>]`, but the attachment part carries only
`{intake_id, document_id}` (brief 1(b)) and `messageFromParts` is a pure fold (no DB read). The
enrichment source `document_intakes_visible` is `clara_authenticated`-only — **not** granted to
`clara_agent_ro`/`clara_runtime` (brief 3(d)), so the workflow cannot source `filename`. **Fix:** make
the stub `document_id` + a standing "call `read_document`" instruction only (drop filename/status it
cannot source), or add a granted read.

---

## LOW

### F15 — error-code inconsistency: "not a draft" is CLR10 in approve, CLR22 in revise/withdraw
**Severity: LOW.** Contract §12 / companion §3,§7. `approve_entry` keeps CLR10 for non-draft
(`0007:1298`; companion §3 step 1 preserves it), while `revise_entry`/`withdraw_draft` use CLR22 for
the same condition. `approve_entry` v3 is being replaced anyway, so it could harmonize — or §12 should
explicitly note the split. Also CLR21 is overloaded across three distinct classes (Tier-A mismatch,
malformed vendor, no-client-session); acceptable but note it.

### F16 — card-catalog parity test scope vs the live `applyChunk` path
**Severity: LOW.** Contract §3 / brief 5(a),(summary 1). The parity test is scoped to "a
persisted-render branch + one reachability fixture." `je_review` is produced at end-of-segment by
`toTypedParts` and delivered via the persisted terminal `message` event, so it does not need an
AI-SDK-native `applyChunk` (live) branch — but the contract calls the extension "three-place" while
brief 5 enumerates four surfaces (runtime union, dashboard union, applyChunk, TranscriptParts). **Fix:**
state explicitly that `je_review` has no live-chunk branch (appears on terminal), and ensure the parity
test asserts exactly the surfaces it needs.

### F17 — multi-currency is silent and not a named deferral
**Severity: LOW.** Contract §4, §11. The Tier-A cross-check and companion §5 cents-normalization are
currency-blind; a foreign-currency bill would false-trip CLR21 or mis-normalize. The RPR corpus is
all-MYR (brief 6 line 16) so the beta is unaffected, but multi-currency should be an explicit **named
deferral** in §11 rather than unstated.

### F18 — notification/coding_task dual-emit is intentional but unreconciled at the surface
**Severity: LOW.** Contract §7 / companion §4. `approve_wrong_client_correction` v2 emits **both** the
`document_recode_required` notification and the `coding_tasks` row for the same recode. Intentional
(inbox visibility + authoritative task), but if both the inbox and the coding-tasks list render, the
recode appears twice. **Fix:** name which surface owns display; optionally mark the notification
superseded-by-task.

### F19 — RPR strike-off / FYE inference touches the AB-4 retention anchor
**Severity: LOW.** Contract §9 / brief 6(c line 118),(d). RPR is mid strike-off application (KOK LIONG
Dec fee "for the company's strike-off application") and its FYE is *inferred* 31/12/2025, not stated.
Neither blocks the beta, but the retention anchor (AB-4) on a striking-off entity plus the unconfirmed
FYE compound — §9 already flags "CONFIRM with the owner"; keep it explicit before the retention anchor
matters.

---

## Things checked and found SOUND (earning the pass on the hard dimensions)

- **`approve_entry` v3 order (dimension 1).** Verified against the real trigger bodies: `approve_entry`
  checks the token *once* (`0007:1299`) and never re-reads it; the step-5 line-stamp fires
  `_tf_rotate_token` (`0003:334-347`) rotating the draft's token, but at the step-7 flip both OLD and
  NEW carry the *rotated* token (revision_token ∉ draft→approved allow-set, but OLD==NEW ⇒ no diff), so
  the mid-txn rotation is **genuinely harmless**. `_tf_lines_immutable` permits the stamp (parent still
  draft). The entry-row FOR UPDATE (`0007:1297`) serializes concurrent approve/revise. Token-check-then-
  stamp-then-flip is correct; doing it in the other order would self-invalidate (CLR06). The
  proposed_counterparty→null clear on the flip is covered by §2's draft→approved allow-set addition.
- **The write floor (dimension 2, structural).** Shape 1 is exactly the existing complete lane:
  `wake_draft_entry` (`0005:1094`) → `_draft_entry_core`, granted `clara_wake_interactive` only,
  allowlisted, `p_books_version` mandatory (CLR10 if null, `0005:1103`). No new books-writer, no wake
  approve variant — invariant 4 and agent-never-signs intact. The third login (single-membership
  `WITH SET TRUE, INHERIT FALSE`) + write pool + txn-local secret + `SET ROLE` + COMMIT + P4 mirrors
  the verified ADR-017 pool contract. op_key idempotency correctly covers the kill-demo crash-after-
  commit gap (reserve-first byte-identical replay), and per-segment `checkpoint_turn` idempotency keeps
  metering at one charge.
- **coding_tasks / agent_tasks separation (dimension 5).** New table, `agent_tasks` kind CHECK
  untouched — correct (the as-built kind CHECK admits only chat_turn/wake, brief 2(d)); appending the
  task insert at the end of `approve_wrong_client_correction` is low deadlock risk (same-txn, end of
  the existing lock order) — VERIFY-ON-RIG.
- **chatTurn_v2 freeze (dimension 7).** New files + registry repoint + `--update` manifest append +
  keep-v1-export matches the freeze-lint's REHASHED-VS-BASE / registry-monotonicity / enqueue-provenance
  checks exactly (brief 1(c),(f)); the DELTA-OWNER-2 perception reversal is legitimately anticipated by
  ADR-018(3).
- **Read fns / grants (dimension 6).** `list_unassigned_documents` on the 0007 anti-join index with zero
  new grants is correct (brief 3(d),4(e)); the not-found tenant-oracle collapse is preserved.
