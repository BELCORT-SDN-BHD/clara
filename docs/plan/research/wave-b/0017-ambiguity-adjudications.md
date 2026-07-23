# 0017 pin-ambiguity adjudications (BINDING — orchestrator, 2026-07-23)

The contract-blind battery lane surfaced 17 pin ambiguities ([AMB-n] markers in
`packages/db/tests/wave-b/`, ledger in `wb-helpers.mjs`). Per the ADR-029 discipline each
becomes a binding adjudication. The implementation must conform; where the built tree
already diverges, the ADJUDICATION wins (reconcile pass), except AMB-17 where the impl's
verified numbering wins by design.

1. **AMB-1 — the v7 purpose literal = `'wiki_coding'`** (the battery's encoded default;
   `CLARA_WB_V7_PURPOSE` stays unset). Used by chatTurn_v7 turn-pack fetches AND
   autoDraft_v3; the server-side draft-wrapper re-fetch keeps `'coding'` (wiki-dark —
   it only needs `books_version`).
2. **AMB-2 — `clara.pack_consumer` marker value = `'v25'`.**
3. **AMB-3 — `p_entry_revisions` = an OBJECT MAP** `{"<entry_id>":"<revision_token>"}`.
4. **AMB-4 — K3 authoring split as encoded:** `gl_balance` passes its GL leg(s) in
   `p_lines` (fn adds the OBE contra); `ar`/`ap`/`equity_net`/`obe_plug` pass `p_lines`
   NULL with the amount in `p_item.amount_cents` (fn resolves control/RE/OBE by marker —
   never literal codes).
5. **AMB-5 — `equity_net` sign = balance-sheet sign:** positive = Cr, negative = Dr
   (the BEE fixture: Dr 65,747.97 → `-6574797`).
6. **AMB-6 — the cancel verb exists as encoded:** `cancel_opening_seed(p_seed, p_reason,
   p_op_key)`, admin+; a cancelled seed frees the slot.
7. **AMB-7 — S2 proposal element = `{proposal_kind, proposal_key, payload, evidence}`;**
   the management-account source is the explicit `p_source_kind` arg.
8. **AMB-8 — `seed_fixed_asset` is ONE call** creating the register row + its OB entry +
   the `opening_items` row in the same txn (`acquisition_entry_id` NOT NULL forces it);
   `p_asset` keys = the as-built 0003 column names + `item_key`. (Preserves the salvaged
   FA-baseline atomicity lesson.)
9. **AMB-9 — plan-CAS errcode = CLR06** (the revision/CAS class); CLR30 stays the SEED
   family's stale_plan per K14.
10. **AMB-10 — `run_client_lint` NEVER RAISES**, including on a null op_key (non-ok
    receipt records it). The belt never-raise law outranks the generic CLR10-on-null —
    a raising lint fn could wedge the belt (the SST-belt precedent).
11. **AMB-11 — opening-position mechanisms ride plan items** with item_keys
    `'first_year_zero_opening'` / `'carry_down_deferred'`; the deferred item is the
    commit vehicle.
12. **AMB-12 — `skipped_client_onboarding` surfacing as encoded:** zero live
    classify/facts tasks for an onboarding client; any recorded task row carries the
    token.
13. **AMB-13 — K3 event emission follows the AS-BUILT draft-family convention exactly**
    (the OB writers are siblings of `_draft_entry_core`'s family; consistency beats
    novelty — the pin's "no event until approval" wording yields). The battery encodes
    no assert either way; the ratchet locks the final behavior.
14. **AMB-14 — batch approval emission as encoded:** per-entry emissions consecutive at
    the tail, the batch event LAST (highest seq) — the C4 append-event-last law applied
    to a set.
15. **AMB-15 — `p_replacement` = K3-style `{item, lines}`.**
16. **AMB-16 — maker=checker refusal errcode = CLR05** (the as-built high-stakes checker
    class carried; not CLR30+reason).
17. **AMB-17 — CLR30–33 numbering: the impl lane's verified next-free assignment WINS;**
    the battery updates to the exact codes in the reconcile pass, mechanically, citing
    this adjudication in-file.

Reconcile-pass notes: the design doc's queue section-order flag is RESOLVED — ADR-031/
WA21-R14 was ruled before build, so per the design's own conditional the **sort-tuple
alignment is FOLDED into 0017's list_review_queue CoR** (draft rows rank by lane, the
filing_rows pattern; drift-guard extended; design part3 amended). One battery cell to add
from the amended pin text: a needs_you-lane draft row carries sort_tuple[0]='1' in the
envelope.

Reconcile round 1 (the battery audit, same day): 9 impl edits classified — 1 sanctioned-
mechanical (AMB-17 renumbering), 2 sanctioned-interface (battery mis-encodings corrected,
prestate-verified: the CLR26 block fires at APPROVE not draft; CLR13 joins the K8
immutability set), 3 WEAKENINGS restored (dead-code gating of the S4 tick-replay/decline
probes; two WB-R6 dependency-scan regex narrowings → restored as the word-bounded
seven-table-family scan, which also clears the impl's legitimate inert wiki_* vocabulary
trigger), 3 justified-other kept. Independent re-run 132/135 → three impl defects, ALL
FIXED by the orchestrator in-place: DEF-1 the K5 checker-separation verification hoisted
into the revision loop before the tie assert (CLR05, helper retained as defense-in-depth);
DEF-2/3 plan-CAS CLR31→CLR06 in commit_client_onboarding + update_onboarding_plan (AMB-9).
Battery shape notes for the design set: N-1 pin get_opening_dryrun's delta key shape
({delta_debit, delta_credit, target_/actual_ per side, account_code}); N-2 adjudicate a
fixture route for the Gate-R2 hand-signed comparator (propose/sign refuses on an
onboarding client); D-c design note — retire_document_filing structurally refuses retiring
a cited tie filing, so the L4 'opening_doc_unfiled' edge only arises via future lanes;
N-3 the envelope's tuple key is `sort` (not "sort_tuple" — design prose should match);
N-4 (behavioral, probed): a BARE uncorroborated wake draft rides needs_you at ANY amount
(the needs_review tier requires Tier-A corroboration) — confidence-ladder-coherent,
worth stating in the design set so future staging doesn't mis-encode it.

Reconcile round 2 (ADR-031 cell): the 136th cell landed in wb-l-lint (high-stakes bare
wake draft ranks '1'/needs_you; cited routine draft ranks '2'; rank-1-before-rank-2 total
order asserted). **Battery final: 136/136 green** on the fixed 0017; ratchet-ready.

**AMB-4 CLARIFICATION (ruled at fix-round 1, 2026-07-23): the `obe_plug` is one plug
ITEM, not one journal LINE.** A single-line entry cannot satisfy `_assert_balanced` /
the 0003 deferred balance triggers (double-entry law is cardinal). The plug item mints
one BALANCED entry: the OBE leg + the marker-resolved retained-earnings contra, amount
from `p_item.amount_cents`, polarity from sign, `p_lines` refused. The battery's
[R1-F9] one-line assertion updates under this ruling.

Fix-round 1 cell invalidations (each by a SANCTIONED fix, cells update citing the tag):
[R1-F1] a21-watch §2 must stop approving an opening entry via generic `approve_entry`
(the refusal IS the fix); [R1-F2] the K3 keyed-fallback cell stages a NO-document seed
(keyed is only lawful without a tie document); [R1-F4] the W8 runtime read carries the
trusted `v25` marker + runtime role (claimless reads refuse).

**OPEN OWNER ITEM (flagged at R3 reconcile, 2026-07-23): the commit-lane shape for
owner+bookkeeper firms.** As-built (each rule individually ratified), no existing member
of an owner+one-bookkeeper firm can commit a client onboarding: the bookkeeper fails the
admin floor (CLR04) and the opener's self-attestation is refused while an eligible
checker exists (CLR05). The lawful route — probed end-to-end — is a TEMPORARY clean
admin (add_member → commit → remove_member, fully audited). Coherent but operationally
clunky for the commonest firm shape; surfaces at Gate O. Candidate future ruling: widen
the attestation route to "no non-contributor ADMIN exists" (would need its own guard
design). NOT changed in 0017 — flagged, not absorbed.

R3-reconcile residual for R4's static re-verify: the pure-NULL supersede path is
position-blocked at commit (closing that laundering window), so its contributor RECORD
rests on the migration tail's certification — verify statically.

**AMB-R3 (ruled 2026-07-23 evening): the pre-0017 plan-bootstrap verb is named
`bootstrap_client_plan(p_client uuid, p_op_key text)`** — the battery's encoding wins
(first-encoder precedent for a NEW verb neither pin named); if the fix lane chose a
different name it renames at reconcile, mechanically, citing this line.

Fix-round 2 record (ratchet R2 memo → fixes R2-F1..F6): extraction-FACT binding (real
region + wrong cents/account/sign each refuse; stale versions refuse); filing retirement
refuses NAMED on live wiki citations (orchestrator pin: refuse, never auto-cascade);
single-active-asset law through the correction interval (pending→active/superseded
atomic swap); CONTRIBUTOR tracking (substantive answerer CLR05-refused as committer);
regression-sensitive tail asserts; reconcile_sweep_runs inactive-guard both branches.
Both round disputes resolved IMPL-side (battery fixture defects, acknowledged in-file);
the [R1-F1b] 40001 transient closed with the pin's own retry-with-same-op_key semantics.
**Battery: 165/165 wave-b · full suite 755/740-pass/0-fail/15-skip.** R2-F5's SQL-tail
semantic half deferred to the round-3 memo (not blind-rig-verifiable).

Fix-round 1 verification record: battery re-run 149/149 + full suite 739/0-fail/15-skip;
follow-on cells closed the F5/F6/F8 gaps (wave-b **156/156**) — the five missed WB-R1
enumerators hold (incl. reconcile_autopost_rules proven-executing-yet-excluding), replay
rebuilds from EVENTS ONLY across both publication paths with a bijection check, and
cross-client citations refuse as **CLR02** (sanctioned existing-class reuse — the
provenance-binding class — noted in-file). F1–F12 all behaviorally verified SQL-blind;
F15 via the stronger external scan. Zero impl defects in the follow-on round. Pins outside the rig's reach (W4 consumer half, W5(3)
storage policies, W9 egress wiring, WB-R6(4) prompt law, FORK-8, O7 runtime mint, FORK-7
plan-todo half, L5 dashboard degrade, G5(e) upgrade-image diff) are accepted as
runtime/dashboard/ceremony-scope obligations — they land in the v25 lanes and the
ceremony checklist, not the DB battery.
