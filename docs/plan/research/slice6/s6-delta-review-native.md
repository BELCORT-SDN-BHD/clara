# Slice 6 delta re-review — NATIVE lane (v1.2 fold-in)

**Targets:** v1.2 of `slice6-thin-e2e-contract.md` + `slice6-migration-0009-design.md`,
verifying faithful realization of native N-F1..19 + Codex C-1..20. Cross-read the Codex
report `.tmp/s6-design-review-codex.md`. Spot-verified against `0002/0004/0005/0007`.

## VERDICT: FINDINGS

The fold-in is largely faithful and the architecture is sound: the C-2 lock-order restore,
C-5 fingerprint congruence, C-6 composite FKs + merge-removal, C-7 own-extraction-row, C-8
token-rotation-on-facts, C-11 client-pinned reads, C-12 task-scoped op_key + coding_attempts,
C-13 invoiceFacts_v1, C-15 filing-keyed uniqueness, C-16 CoA-domain widening, and N-F1/2/3
are all genuinely designed, not just name-checked. Of the four flagged interaction risks,
**two are clean (C-5×S6-R8, C-15×evidence), one is clean-with-a-note (C-2×C-8), and one is a
real defect (C-11 refusal shape).** Beyond those, five MEDIUM "asserted-but-not-designed"
gaps remain where a v1.2 disposition names a fix the documents don't actually wire, plus
error-map hygiene. None are CRITICAL regressions; all are build-lane-closable.

---

## Flagged-interaction verdicts

### I-1 (C-2 lock order × C-8 facts-rotation touching entries) — CLEAN, with a note
No new AB-BA. `approve_entry` v3 locks filing→entry (companion §3, restoring 0007:1289-1299);
`persist_invoice_facts` rotates tokens on open drafts citing the document but does **not** lock
the filing, and approve locks exactly ONE entry, so approve-vs-persist serialize on the single
shared draft row (→ CLR06 or a lawful Tier-B commit, both benign, C-8's intent). persist-vs-persist
on one document is prevented by the `(document_id, lane)` idempotency unique (companion §5). Delta
probe #4 already requires the forced schedule. **Note (LOW):** the rotation `UPDATE journal_entries
… WHERE document_id=X AND status='draft'` can touch >1 row (shared doc); specify `ORDER BY id` for
determinism, and WHEN-scope the deferred bill-shape constraint trigger to the approved-transition so
a draft→draft rotation doesn't fire it.

### I-2 (C-5 fingerprint congruence × S6-R8 one-act birth) — CLEAN
The birth stays atomic in the approve txn; `match_fingerprint` only forces CLR23 re-hydration when
the match landscape changed between propose and approve (companion §2). `match_fingerprint` is in
both the draft→draft and draft→approved(cleared) allow-sets, so revise recomputes it and approve
clears it — consistent. No contradiction with "nothing exists if the draft dies."

### I-3 (C-15 filing-keyed uniqueness × document-keyed evidence) — CLEAN
Correct by construction: OCR/evidence is per-document (shared bytes across a shared doc's two
filings both legitimately cite the same `extraction_id`), while coding uniqueness is per-filing.
`entry_evidence` is keyed by `entry_id` (distinct per draft), so no clash; C-8's rotation hits both
of a shared doc's drafts, which is the intended behavior. The correction-destination case is handled
by `list_uncoded_filings` + the filing-keyed draft unique.

### I-4 (C-11 OBO minting × below-floor client-less session) — DEFECT (see F1)
The promised "honest refusal" is not what the mechanism produces. Verified below.

---

## FINDINGS

### F1 — C-11's "below-floor author gets an honest refusal" is a silent empty, not an audited refusal
**Severity: MEDIUM. Companion §7, §10.1; contract §3. Asserted-not-designed.**
`wake_context` (`0002:377-381`, verified) applies the bookkeeper+ OBO check as a `WHERE` predicate:
a below-floor `on_behalf_of` yields **no row** → `wake_firm()` returns null → the security-invoker
read fn's RLS `firm_id = wake_firm()` matches nothing → `list_unassigned_documents`/`get_document_extract`
return an **empty result**, not a refusal. Only the WRITE lane raises (`wake_draft_entry`:
`if credential_id is null then CLR03`, `0005:1101`); the read fns have no such guard. So the
bookkeeper+ floor on the unassigned tool (S6-R11: "fully audited") degrades to a silent empty that is
indistinguishable from "no unassigned docs" — an authz control rendered as an oracle-style not-found,
never audited as a denial. **Fix:** the v2 wrapper must check the initiating actor's rank before
minting (raise a labeled runtime refusal), or the read fns must detect null `wake_firm()` and raise
(CLR03/CLR11) so the denial is explicit and audited. Add the refusal shape to §12.

### F2 — the `draft_journal_entry` tool input (§3) omits the evidence array that §4/§2 require
**Severity: MEDIUM. Contract §3 vs §4; companion §2 (`entry_evidence`). Asserted-not-designed.**
C-9 (contract §4) states "the write tool carries an evidence array (region ids + exact quotes)
persisted as `entry_evidence` rows … DB-verified against the cited extraction," and companion §2 has
`_draft_entry_core` write `entry_evidence` "from the write-tool's evidence array." But §3's tool-input
schema is `posting_date, memo?, lines[…], document_id, vendor, uncertainty?` — **no evidence/citations
field**. Without it the model supplies no region ids/quotes and `entry_evidence` has nothing to persist,
so Tier-B citations remain unrecoverable (the very gap C-9 claims to close) and the Tier-A binding has
no stored evidence to re-verify at approve (C-8). **Fix:** add `evidence[]` (region_id, field_path,
quote, tier) to the §3 tool input, and state the wrapper's `document_id`/extraction congruence check.

### F3 — enqueue-at-filing (N-F3/C-7 timing) needs `file_document` + `confirm_attribution_candidate` recreated, but companion §1 omits them
**Severity: MEDIUM. Companion §5 vs §1. Same omission class as the original N-F1.**
§5 puts the invoice-facts enqueue "in-writer: `file_document`, candidate-confirm filing, correction
re-file." The correction re-file (`approve_wrong_client_correction`) IS in §1's Replaced list, but
`file_document` and `confirm_attribution_candidate` are in **neither** the Replaced list nor the
drop/create list — yet both must be modified to add the enqueue side effect. §9 asserts "the review
checks nothing else moved," so this is a live inconsistency between §1's object inventory and §5's
requirement. **Fix:** add `file_document` and `confirm_attribution_candidate` to §1's Replaced set
(same-signature CREATE OR REPLACE) and re-run the grant-diff assertion against the enlarged set.

### F4 — N-F2 was folded for revise/approve but NOT for the withdraw (draft→withdrawn) path
**Severity: MEDIUM. Companion §2, §8. Incomplete realization + unresolved ambiguity.**
The v1.2 allow-set changes add `proposed_counterparty, match_fingerprint` to draft→draft and
draft→approved (companion §2), but NOT to draft→withdrawn (as-built allow-set
`['status','withdrawn_by','withdrawn_at','withdrawal_reason','updated_at']`, `0007:1040`). §2 calls
`proposed_counterparty` "shape-checked; draft-only" without resolving my original N-F2 sub-question:
**is "draft-only" a table CHECK or a writer rule?** If it is a CHECK (`proposed_counterparty is null
or status='draft'`), then `withdraw_draft` on a vendor-carrying draft must set `proposed_counterparty
:= null` to satisfy it, but that column is not in the draft→withdrawn allow-set → CLR08 deadlock
(can't clear it, can't leave it). **Fix:** state explicitly that draft-only is writer-procedural (so
withdraw leaves a harmless stale value), OR add `proposed_counterparty, match_fingerprint` to the
draft→withdrawn allow-set so withdraw can clear them. Same applies to `match_fingerprint`.

### F5 — coding_attempts is asserted "written atomically with the draft" but its writer/grant/txn home is undesigned
**Severity: MEDIUM. Companion §1, §10.2 (C-12). Asserted-not-designed.**
`coding_attempts(task_id, document_id, entry_id, request_hash, part_payload, status)` must be inserted
"atomically with the draft/receipt" for the kill-demo card to survive a divergent replay. But the draft
write runs in the write pool under `SET ROLE clara_wake_interactive`, and the table's `task_id` is only
embedded inside the op_key string (`code-doc:<task_id>:<document_id>`), not a writer arg. Nothing
defines who inserts the row, under which grant, or how the writer receives `task_id` while staying in
the draft's transaction. **Fix:** give `coding_attempts` a concrete writer (e.g. a trailing arg to
`wake_draft_entry`/`_draft_entry_core` that inserts it in-body under the definer, or a
`clara_wake_interactive`-granted companion fn called in the same txn) and specify its DDL + grant in §2.

### F6 — the structural bill-shape floor's "≥1 payable CREDIT" clause is direction-specific; reversal/correction mirrors invert it
**Severity: LOW-MEDIUM. Companion §2 (C-3). Latent, currently masked by as-built.**
`_assert_supplier_bill_shape` requires "for an entry with `document_kind='invoice'` binding — at least
one payable-class CREDIT line; payable credit total == gross," enforced at "EVERY transition to
approved … covering reverse_entry's mirror and the correction's mirror." A reversal inverts the payable
leg to a DEBIT. As-built `reverse_entry` (`0005:919-923`, verified) does NOT copy `document_id` onto the
mirror, so the mirror has no invoice binding and is exempt from the credit clause — so it happens to
pass, but the design relies on this implicitly and never states it. The correction mirror's document
binding is not verified here. **Fix:** scope the "≥1 payable credit / credit==gross" clause explicitly
to forward postings (`reversal_of is null`), keeping the universal "every payable line carries
counterparty_id" clause on all paths. Delta probe #3 already covers the rig case — good — but the
scoping should be explicit in §2, not emergent from a missing column.

### F7 — §12 error-map hygiene: a dead reference, a missing mapping, a currency imprecision
**Severity: LOW. Contract §12. Coverage gaps introduced by the fold-in.**
(a) CLR23 still lists "merge/status violations," but C-6 REMOVED `merged`/`status` from v1 — a dead
refusal path (no merge writer exists). (b) The new `_assert_supplier_bill_shape` refusals (no payable
credit / credit≠gross, companion §2 "friendly CLR23s") are not named under CLR23's §12 description.
(c) §12 labels non-MYR a "Tier-A refusal," but §4 makes non-MYR refuse at BOTH tiers ("never lawful,
at either tier"). **Fix:** drop merge/status from CLR23 (defer with the merge slice), add the
bill-shape clauses to CLR23, and restate non-MYR as tier-independent.

### F8 — companion §9 "allowlist row updated to the new identity" is imprecise
**Severity: LOW. Companion §9. Harmless but wrong as stated.**
The `wake_fn_allowlist` is keyed by `(wake_kind, function_name)` on the fn NAME, not its signature
(`0002`; `assert_wake_allowed` matches `function_name = 'wake_draft_entry'`). A drop/create of
`wake_draft_entry` keeps the same name, so the allowlist row needs **no** change — "updated to the new
identity" would be a no-op (or an error if it tries to rewrite the name). **Fix:** reword to "the
allowlist row is unaffected (name-keyed); only the EXECUTE grant is re-applied to the new signature."

---

## §12 coverage check (dimension c)
Every NEW v1.2 refusal path maps EXCEPT the three F7 items and F1's below-floor read refusal (which the
design currently produces as a silent empty, not a coded refusal). CLR25 (stale evidence, C-8) is added
and correct. CLR24 covers C-14's result-entry proof. The per-layer SQLSTATE→CLR table (C-20) is
specified. Close F1 + F7 and the map is complete.

## Dispositions confirmed faithfully realized (spot-checked)
C-1 (drop/create + single-overload + PUBLIC sweep + hashed new args), C-2 (filing→entry restored),
C-4 (`last_human_editor` stamped in revise, in the draft→draft allow-set), C-5 (registration-dominant
`_resolve_counterparty` + fingerprint), C-6 (composite FKs, merge removed), C-7 (own extraction row,
physical locators, no fake 'semantic'), C-8 (rotation + in-txn re-verify + CLR25), C-13 (invoiceFacts_v1
new frozen class), C-15 (`list_uncoded_filings`, filing-keyed draft unique), C-16 (`^[0-9]{3}-[0-9A-Z]{2,4}$`
covers every RPR code `100-000`…`900-A01`, existing `{4,8}` preserved), C-18 (NOLOGIN, boot assert,
budget, teardown, created_by), N-F1 (claim+release cover both lanes), N-F6 (strip-all-non-alphanumeric),
N-F9/C-15 (double-code refusal), N-F12 (17-file manifest finalized from content).
