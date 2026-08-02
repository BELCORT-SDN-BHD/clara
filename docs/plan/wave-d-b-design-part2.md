# Wave D-b design — part 2: the design review ladder record

> Companion to `wave-d-b-design.md`. This file is the ladder's record: round verdicts, the
> adjudication of every finding, and the deviations named for the owner. The main doc carries
> only the resulting mechanism (v2+); history lives here.

---

## Round 1 (2026-08-02) — v1, four lanes

**Lanes:** mechanism (native opus-5 xhigh) DO-NOT-SHIP 2B/10M/4m · edge-case (native sonnet-5
xhigh) DO-NOT-SHIP 2B/6M/2m · contract-fidelity (native sonnet-5 xhigh) SHIP-WITH-FIXES 4M/2m ·
Codex (gpt-5.6-sol xhigh, direct exec, read-only) DO-NOT-SHIP — 18 findings. ~50 findings
total; every one adjudicated below. Labels: M=mechanism, E=edge, K=contract, C=Codex.

### Folded — the v2 mechanism changes (grouped)

1. **Mirror birth restated as the reverse_entry shape** [M1, C11, K3 — BLOCKER]: INSERT
   status='draft' → leg-swapped lines → `_assert_balanced` → UPDATE draft→approved stamping
   `checker_actor` = the occurrence's approving actor + `approved_at` (the lawful transition;
   a direct approved-INSERT violates `_tf_lines_immutable`/`_tf_entry_immutable`), then
   `perform clara._subledger_on_approve(v_mirror)` (the reverse_entry H.2 precedent). 0042's
   tail re-pins the approve-path census at **FIVE**, naming `_adj_on_approve`'s flip.
2. **Auto-reversal linkage strengthened to relational** [C10 BLOCKER, M7, E5]: the mirror
   carries `auto_reversal_of` (FK → occurrence, UNIQUE); the occurrence is stamped
   `auto_reversed_by` (immutability-allowlist widened for this one hook-written column).
   `reversal_of`/`reversed_by` stay unused (v1 §2.4's two reasons stand — verified by the
   mechanism lane); the JSON-only linkage is dropped for FK integrity. A single verb-side
   splice `_wdb_reversal_blocked` (reverse_entry's 7th) + a hook arm refuse reversing EITHER
   half individually (`adjustment_pair_locked`); the pair-aware correction is the new
   `reverse_adjustment_pair` verb (both halves reversed in one transaction; ramp un-earns;
   due-ness re-opens).
3. **AF-2 composition law** [C1 BLOCKER, M9]: every derived sub-key (`:draft`,
   `:draft:approve`, `:settle`, `:settle:approve`, `:match`, `:resolve`) reserved BEFORE the
   first lock (the complete_pending_match discipline); the composite then pre-acquires the
   full rung set in the house order (203005003 where a counterparty is involved → 203005004 →
   203005006 → sorted row locks) so every inner verb's acquisition is same-transaction
   re-entrant — inversion impossible. Delegation to the public verbs stays (the
   settle_from_bank_line precedent). Build-time verification item: `_reserve_op`
   same-transaction re-reservation must replay (named in §8).
4. **AF-2 high-stakes branch = settlement leg ONLY** [C2 BLOCKER, M10]: `bank_matches` anchors
   exactly ONE draft; a second entry is unrepresentable on a pending group. The deferred
   branch refuses `p_draft`/`p_adjustments`/`p_advance_applications` by name
   (`pending_branch_ancillary_unsupported`; remedy: flip first, book ancillaries as their own
   acts).
5. **The pending_resolution widening is ONE predicate recut across ALL arms** [M2 BLOCKER,
   C3 BLOCKER, M11]: the `line_excepted` walls in `match_bank_line` (all arities) AND
   `settle_from_bank_line`, the belt's member-INSERT arm, the member-UPDATE pending→live
   cascade arm, `complete_pending_match`, and the exception arm — all admit an OPEN exception
   iff it is the one named by the group's `pending_resolution` declared in the same
   transaction (or being executed at the flip). `pending_resolution` is restricted to the two
   booking dispositions (refuse `bank_corrective_line` — use the direct verb), CHECK-bound to
   status='pending', and the flip re-reads the exception FOR UPDATE
   (`pending_resolution_stale` when no longer open or not this line). 0040 tail S4.Z re-pinned.
6. **Post-flip unmatch reopens the exception** [E1 BLOCKER]: `unmatch_bank_match` (CoR), when
   releasing a LIVE group whose line backs a resolved booking-disposition exception, flips
   that exception resolved→open in the same transaction (a single new lawful arm on the
   one-way transition trigger, scoped to this path). The completed-recon case already refuses
   (`recon_period_settled`) before this arm. Supersedes the x40.z-A1 stale-survives posture —
   that test is updated at build, named here.
7. **Advance reversal arithmetic → effective-dated signed effects** [C4 BLOCKER, C5 BLOCKER,
   E10]: outstanding never excludes-by-reversed-flag; original applications persist at every
   as-of ≥ their effective_date; corrections are negative effects dated at the reversal act;
   a reversed disbursement gains a set-once `voided_by_entry_id`/`void_effective_date` (the
   hook's reversal arm), historical as-ofs stay truthful. The hook dispatches reversal FIRST
   and returns (the `_fa_on_approve` arm order); soft-birth is gated
   `not is_opening_balance and reversal_of is null`; `_wdb_reversal_blocked` also refuses
   reversing a disbursement while its advance has net applications ≠ 0, and corrections from
   an application-entry reversal key on the ORIGINAL entry_id (one correction per original
   application row).
8. **Corrections state machine** [C6]: multiple leaf corrections per application (the unique
   constraint dropped); correction-of-correction refused; cumulative corrections ≤ the
   original amount; all under sorted advance row locks.
9. **Line-shaped allocations** [C7 — the D-a row-shape class]: proposals carry
   `{line_no, advance_id, amount_cents}`; the hook resolves line_no → the leg, requires the
   leg's account = the advance's enrolment account, per-line Σ = the leg's cents exactly.
10. **Approve-time re-derivation for advances** [M3, E4]: the per-advance cap, per-line
    coverage equality, and the predate test re-derive inside `_adv_on_approve` under the
    client rung the approve core already holds (0037 takes 203005003→203005004 before the
    hook) + sorted advance row locks; the in-verb copies stay as early friendly refusals.
11. **Occurrence proposal binding** [M8, C8 BLOCKER]: flags carry `period_start`/`period_end`;
    `_adj_on_approve` re-validates origin, the issuer op-receipt (request-hash re-derived from
    client+template+period), template liveness, line-set equality against the template,
    cadence alignment/ENDED, and mode — refusing `adjustment_stale` with a named axis. AND
    `revise_entry` is CoR-recut to refuse any draft carrying a D-b proposal flag (the
    0041 S4.9 precedent), covering all three keys.
12. **Suggestion binding** [C9 BLOCKER, E7]: flags = `{rule_id, line_id, line_fingerprint}`;
    the accept verb row-locks the line and refuses while an un-dead suggested draft exists for
    it; an approve-time arm re-validates (signed rule · line unmatched/unexcepted · statement
    live · predicate re-match · draft legs equal derived) refusing `suggestion_stale`.
13. **Enrol-clean-only** [C13 BLOCKER]: the v1 opening-seed arm is DELETED — it fabricated a
    disbursement identity WD-R10 forbids. Enrolment refuses a nonzero approved GL balance
    (`enrolment_balance_nonzero`); pre-existing balances defer to a future attested-baseline
    mechanism, named as a debt. (Zero real cases exist — G8 — so nothing is blocked.)
14. **Enrolment identity + retirement law** [C14, E2 BLOCKER]: advances/applications carry
    `enrolment_id` (immutable FK) beside account_code; `retire_staff_advance_account` refuses
    while any advance on the enrolment has outstanding > 0; the reservation predicate is
    status-blind over enrolment history ∪ register rows (the FA G4-class fix), and every
    eligibility check consults it — never "actively enrolled" alone.
15. **One shared account-role leaf** [M15, C18]: the advance domain REUSES the existing
    `client:fa-roles` leaf (no second leaf, no ordering hazard), through a message-neutral
    reader (`_acct_role_reserved` returning domain+role; callers own their refusal text); the
    leaf-LAST law restated for every new caller.
16. **MYT sign-date** [M5, E3, C12]: the catch-up boundary is
    `period_end < (signed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date` ⇒ forced-draft; the
    boundary day (period ends ON the MYT sign date) follows the normal ramp law — stated
    explicitly with the midnight-window test cell.
17. **Due oracle for many templates** [M6]: returns the oldest unmet (template, period) among
    live templates NOT draft-blocked, plus a `blocked` list for the advisory;
    `occurrence_draft_outstanding` is per-template, never client-wide.
18. **Receipts mirror-first** [M14]: the mirror is born before the receipt INSERT so
    `reversal_entry_id` is never an UPDATE on the immutable row.
19. **Splice + census plan** [M13, M16]: the `_adj/_adv` anchors named exactly (after
    `perform clara._fa_on_approve(p_entry);`, above the `settlement_allocation` early-return)
    with positional tail asserts; the `scheduled_run` census restated at its new counts.
20. **64-edge: THREE minting paths** [C15]: the K6 opening-item replacement path
    (`_draft_opening_item_core`, 0017:3439) gets the same pre-write depth guard as revise +
    partial-split (CoR, same token, 64/65 boundary cells).
21. **G12 recut covers BOTH 0017 sites + useful_life_months** [M12]: the CLR10 composer site
    AND the CLR31 seed/activation site, with explicit is-null disjuncts, anchors measured
    against the LIVE bodies (0041 already spliced their CLR31 arms).
22. **G14 escalation is a product mechanism** [K1, C16]: a computed `split_month_advisory`
    (derived, never stored — the DB does not judge materiality) returned by
    `revise_fixed_asset_particulars`, `get_fixed_asset`, and the close-readiness advisory
    family whenever a lineage's revision is effective past day 1 — naming the convention and
    the correcting-draft route.
23. **Template lifecycle guards** [E6, E8, E9]: `end_date` must be a cadence period-end for
    the client (validated at propose — no silent straddled partial period);
    `retire_adjustment_template` refuses while an occurrence draft is outstanding;
    `set_client_fy_end` (CoR) refuses while a live annual-cadence template or depreciation
    authority exists (remedy: retire → change → re-sign, which re-ramps).
24. **Smalls** [K4-typo, K5, K6]: "S6"→"S5"; WDB-G6's citation reworded to the autopost-rules
    analogue (deliberately stricter than fa_account_profiles' own bookkeeper+ enrolment);
    G2's mirror-legs disclosure satisfied by inference from the occurrence's visible lines +
    the explicit reversal_date — stated so no implementer guesses.

### Adjudicated (not folded as-written)

- **C17 (attribution for direct writers) — DOWNGRADED to a documented posture.** The
  ARCHITECTURE §0.1 letter ("no write path skips assert_client_resolved") is cited against
  the RATIFIED practice: 0041's poster and the 0037/0038 composites insert with no resolution
  row, through the full D-a/C-a ladders and acceptance. The practiced law: the attribution
  invariant binds where attribution is a QUESTION (the drafting lane); a writer whose client
  is structurally bound by an FK anchor (authority, template, enrolment, statement line)
  carries no resolution because there is nothing to resolve. Every D-b writer is
  FK-anchored; AF-2's free-form hand-draft — the only exception — mints one inline. Recorded
  in the main doc §4; the ARCHITECTURE wording is flagged for a doc-alignment note at the
  close (not a D-b code change).
- **M4's flags-exclusion on soft-birth — PARTIAL.** The reversal + opening-balance gates are
  folded (the FA shape); the additional `staff_advance_application`-flag exclusion is NOT — a
  proposal entry may legitimately disburse (debit) and apply (credit) in one entry; its debit
  legs soft-birth lawfully.
- **E3's strict-`>` push — REFUSED, boundary defined instead.** A period ending ON the MYT
  sign date was not "already ended at signing"; it follows the normal ramp law. The
  forced-draft predicate is strict `<` on the other side; the cell pins the boundary day.
- **K2 (G7 related-party is not structural) — FOLDED AS HONESTY + OWNER ITEM.** The vacuous
  open_items check is dropped; the doc now states plainly that the related-party clause is
  enforced by admin attestation (no DB fact exists to check) — pending the owner's explicit
  confirmation of that narrower posture (sign-off item 1).
- **K4 (the §8 boundary carve-out) — FOLDED AS OWNER ITEM.** The AF-2 recuts against the
  contract's "posters never touch the settlement belts" wording are now presented as a
  boundary INTERPRETATION awaiting sign-off (item 2), not self-granted.

### Verified sound in round 1 (do not re-litigate)

Direct-INSERT lawfulness vs the invariants (0041 precedent) · the FA-hook splice location ·
the §2.4 no-reversal_of reasoning (both legs) · the S5 carve-out exactness (key name + gates
+ postchecks) · the belt deferral-mode split (deferred movement / non-deferred enrolment) ·
the 64-threshold parity math (64 admits, 65 refuses, all readers) · G9's floor split
survives the belt (resolved_by rank read off the ROW) · the sub-key discipline precedent ·
pair arithmetic (leg swap + period_end+1) across month/FY/leap boundaries · sorted advance
row locks serialize over-application · non-control template lines keep the subledger/FA
hooks indifferent · the day-1/day-2 split-month pin itself.

---

## Round 2 (2026-08-02) — v2 delta, three lanes

**Lanes:** fold-integration (native opus-5 xhigh) DO-NOT-SHIP 4B/4M/3m · fresh-attack (native
sonnet-5 xhigh) DO-NOT-SHIP 3B/4M/1m · Codex (gpt-5.6-sol xhigh) DO-NOT-SHIP — 15 findings.
Round 2 attacked the round-1 folds themselves; convergence was high. Labels: FI/FA/C2.

### Folded — the v3 mechanism changes

1. **The composition law rebuilt on preheld-aware cores** [FI1+C2-1 BLOCKER]: `_reserve_op`'s
   live body RAISES CLR10 on a same-transaction re-reserve with a different hash (and returns
   a `{pending:true}` stub on a match — the delegate would no-op). v3: keys spent by a
   reserving PUBLIC verb (`:draft`,`:settle`,`:match`,`:resolve`) are NOT pre-reserved — the
   callee reserves them; keys spent through `receipt_preheld:true` core calls
   (`:draft:approve`,`:settle:approve`) ARE pre-reserved; unreachable branches finish their
   keys with the 0038 deferral-marker idiom. The §8 "re-reservation replays" item became a
   probe that it RAISES. AF-2's settle path goes through a factored preheld-aware
   `_settle_from_bank_line_core` (public wrapper reserves-then-delegates — CoR).
2. **The widening COLLAPSED to two touch points** [FI2+C2-3 BLOCKER]: on the non-high-stakes
   path the composite resolves FIRST, so every `line_excepted` wall sees status='resolved' —
   `match_bank_line` is untouched. Only (a) the settle core's wall (reads the declaration from
   its own p_ctx — no GUC, no table channel) and (b) the belt's member-INSERT arm (the pending
   group row exists by then; one join) widen. The flip/exception/cascade arms need no
   widening (resolved+live commit-lawfully). v2's "one predicate, six arms" was wrong twice
   over — two sites cannot read a group row that doesn't exist, and three don't need it.
3. **Pair correction rebuilt as a private pair core** [FI3+C2-5 BLOCKER, FA2 BLOCKER]:
   `reverse_adjustment_pair` does NOT call `reverse_entry` (whose splice-guard would refuse
   its own remedy, and whose high-stakes branch strands two separate drafts). A private
   `_pair_reverse_core` births both mirrors itself (the 13-column recipe, invoking the same
   guard HELPERS the splices use — allocation/bank-match/FA walls — without touching the
   monolith): low-stakes → both approved + both `reversed_by` stamped atomically; high-stakes
   → both mirrors DRAFT under a linked pair receipt, and ONE checker verb
   (`approve_pair_reversal`) approves both atomically (distinct-checker law intact).
   `_wdb_reversal_blocked` needs no bypass — `reverse_entry` is simply never the pair path.
4. **`auto_reversed_by` DELETED** [FI4+C2-4 BLOCKER, C2-13 MAJOR]: the occurrence-side stamp
   required an immutability-trigger recut that also contradicted the contract's
   "posters never touch journal_entries immutability". Pair state derives one-way from the
   mirror's UNIQUE `auto_reversal_of` FK — no occurrence column, no trigger recut, boundary
   clean.
5. **Corrections are hook-born ONLY** [C2-6 BLOCKER]: a manual correction-kind debit would
   misdispatch into soft-birth. The proposal kind set is `payroll_deduction`/`bank_return`/
   `claim`; `correction` rows are minted only by the reversal arm. The reversal-correction
   amount = the original's uncorrected remainder (original − Σ prior leaf corrections; zero
   remainder → no row) [FA1 BLOCKER, C2-7]; `reverse_entry` on a correction-carrying entry
   refuses (`correction_entry_irreversible`; remedy: book an offsetting application).
6. **Reopen-on-unmatch gets an identity + a ledger** [C2-10 BLOCKER, FI6]: the group gains an
   immutable `resolution_exception_id` (stamped at creation on the non-HS path, at the flip on
   the HS path; survives unmatch); reopen targets exactly that row; a pre-check refuses
   `exception_reopen_blocked` when a newer open exception exists on the line; the reopen
   erases the five resolution columns but mints `bank.line_exception_reopened` + an audit row
   carrying the erased owner act.
7. **The flip clears `pending_resolution` in its own UPDATE** [FI5] (and stamps
   `resolution_exception_id` in the same statement); the receipt carries the executed
   declaration.
8. **`_acct_role_reserved` is a LOCK-FREE stable reader** [FI7]; `_fa_lock_roles` is taken
   ONLY by enrolment/propose/retire doors — never on posting/approve paths; tail 13(c)
   re-pinned at the new membership. Advance-domain reservation admits RETIRED same-domain
   history for RE-ENROLMENT (a retired enrolment must not block its own code forever) while
   template/bank checks refuse only ACTIVE advance enrolments [C2-9 MAJOR]; the FA arm stays
   exactly 0041's law (active profiles ∪ register rows — v2 overstated it).
9. **The tie equation written out** [FA3 BLOCKER]: `staff_advance_tie` groups by ACCOUNT_CODE
   and walks EVERY enrolment generation that ever held the code (the FA G8 law restated for
   the enrolment_id key); the as-of base gates on issue_date [C2-8: base effect = amount only
   when issue_date <= as_of]; retire+re-enrol-at-historical-as-of is an acceptance drill.
10. **Row-lock-before-rung law for AF-2** [C2-2 MAJOR]: the composite row-locks every
    PRE-EXISTING journal entry it will pass to match BEFORE acquiring the rungs (the
    match_bank_line precondition); transaction-new entries are exempt by construction.
11. **The FYE guard scoped + race-closed + sign-time freshness** [FA4+C2-12 MAJOR]:
    "annual-cadence" qualifies BOTH nouns (a live MONTHLY authority does not block — the
    sandbox's live monthly authority is the acceptance cell); `set_client_fy_end` takes the
    203005004 rung; `sign_adjustment_template` revalidates cadence/end_date against the
    CURRENT FYE under the same rung (a proposed annual template survives an FYE change but
    cannot sign stale).
12. **`line_fingerprint` DROPPED** [FA5 MAJOR]: line_id points at immutable rows; the
    approve-time predicate re-match covers staleness; the flags are `{rule_id, line_id}`.
13. **The G12 recut narrows to cost_cents ONLY** [C2-11 MAJOR — corrects a round-1 over-fold]:
    the live 0041-recut validator bodies already check `useful_life_months` method-
    conditionally (a global null-refusal would break `method='none'`); both sites gain only
    `v_cost IS NULL OR` disjuncts.
14. **Surfaces named for S1 + the parked state** [FA6+FA7 MAJOR]: /rules gains the
    AdjustmentTemplatePanel (list/propose/sign/retire + per-template due/blocked from
    `adjustment_run_due` — the `blocked[]` list's named consumer); the recon exceptions table
    badges "resolution parked" via a read join on the group's `pending_resolution` (the /bank
    pending-group chase already surfaces the draft — C2 verified).
15. **Smalls**: arm (0) `role='reversal'` → return, stated + the nested-hook invocation note +
    the census wording (approve PATHS stay FOUR; the hook-CALLER census goes to FIVE; bounded
    recursion assert) [FI8, FI10] · ramp wording ("the corrected occurrence stops counting;
    the ramp un-earns only when it was the sole earner") + the two-occurrence cell [FI9] ·
    mirror `maker_actor = template.signed_by` [FI11] · `void_effective_date` = the reversal
    mirror's posting_date [FA8] · the G14 advisory pinned to one `_fa_split_month_advisory`
    helper invoked from `_fa_asset_json` + the revise response, qualifying edges = revision
    successors with effective_from past day 1 (partial-disposal splits excluded) [C2-14] ·
    the stale "awaiting sign-off" header language removed [C2-15].

### Verified sound in round 2 (cumulative with round 1's list)

The mirror hook re-entry is finite and mint-free (role='reversal' misses both mutation arms;
eligibility keeps every register indifferent) — the load-bearing dependency now stated in
§2.6 · mirror-never-earns for both mirror kinds · the advisory-rung re-entrancy half of the
composition law · the §2.6 splice anchor + hazard · void-after-corrections does not
double-subtract · concurrent-open reopen collisions are historical-only (the belt refuses
ordinary open+matched) · completed-recon refusal precedes the reopen arm · the K6 CoR anchor
is identifiable and the 64/65 math unchanged · end_date validation is expressible against
the live period helpers · G4 catch-up/ramp interaction (occurrence #1 always drafts,
including after retire+re-propose) · the pending-group chase surface exists (/bank).

---

## Round 3 (2026-08-02) — v3 dry-check, two lanes

**Lanes:** verify (native opus-5 xhigh) DO-NOT-SHIP 3B/6M/5m · Codex (gpt-5.6-sol xhigh)
DO-NOT-SHIP 3B/1M. Convergence near-total; the SOUND lists now cover most load-bearing
mechanisms. Labels: V/C3.

### Folded — the v4 mechanism changes

1. **Every D-b approval routes through `_approve_entry_core` + `receipt_preheld` + a
   pre-reserved derived key** — the ratified 0041:3559 poster shape — for the mirror flip,
   `_pair_reverse_core`'s low-stakes flips, and `approve_pair_reversal` [V1+V2 BLOCKER,
   C3-3]. Consequences: the approve-path census stays the pinned FOUR literally; the
   hook-CALLER census stays FOUR (no direct `_subledger_on_approve` call — the core makes
   it); CLR05 maker-checker is restored on the mirror. G2's one-act law under high stakes:
   the occurrence approval's attestation threads to the mirror's flip (same actor, same
   attestation; distinct-checker satisfied when checker ≠ signer since the mirror's
   last_human_editor = the signer). New §7 cell: signer-approves-own-occurrence at high
   stakes.
2. **The op-key table is written out, and the core factoring is complete** [V3+C3-1
   BLOCKER]: preheld-aware `_settle_from_bank_line_core` AND `_allocate_receipt_core` /
   `_allocate_payment_core` (public wrappers reserve-then-delegate; the S4.Z behavioral pins
   move to the cores; the public arities re-pin to delegation + defaults + ACLs). One table
   row per derived key: fn, single spender, closing branch; the settle core's own
   descendants (`:approve`, `:adj:i(:approve)`, `:charge:approve`) stay the core's, closed
   by its existing deferral markers — the composite never names them.
3. **The parked-declaration admission is recut across SIX arms, not two** [C3-2 BLOCKER]:
   the settle core's `line_excepted` wall (p_ctx declaration) · the belt's line-member
   INSERT arm · `complete_pending_match`'s settled-period guard · BOTH member pending→live
   cascade UPDATE arms · `unmatch_bank_match` + the line-member pending→unmatched cascade
   arm (the §7 parked-cancel escape is a promise, so cancellation admits the exact case
   too). Each admits ONLY the parked-declaration case (the Codex-verified predicate shape,
   `resolved_at > v_cover_at` semantics on the resolved door); ordinary groups and
   live→unmatched releases keep their unconditional refusals. Rationale of scope: an OPEN
   exception inside a COMPLETED reconciliation is lawful C-c state — precisely the class the
   parked resolution serves — so the settled-period machinery must admit the park's flip
   AND cancel.
4. **The pair machine gets a real receipt + single-half defenses** [C3-3+V5 BLOCKER]:
   `clara.adjustment_pair_reversals` (id, firm, client, occurrence_id, mirror_id, both
   correction-draft ids, maker, status `pending`→`completed`/`cancelled`, op_key,
   created_at; ONE active pair per occurrence via partial unique; transition trigger). Both
   correction mirrors stamp `maker_actor = last_human_editor =` the pair CALLER
   (reverse_entry's recipe) so exactly one distinct checker approves both.
   `approve_pair_reversal(p_client, p_pair, p_attestation default null, p_op_key)` — the
   solo-firm attestation branch exists. Single-half defenses: the hook defense arm refuses
   an ordinary `approve_entry` on a pair-correction draft (remedy names
   `approve_pair_reversal`); `withdraw_draft` (CoR) refuses a pair draft, remedy naming the
   atomic `cancel_pair_reversal` (withdraws both drafts + cancels the receipt).
5. **The high-stakes refusal set includes the charge** [C3-4 MAJOR]:
   `p_charge_cents`/`p_charge_account` join `pending_branch_ancillary_unsupported` (the AP
   path's separate charge entry would ride `pending_ancillaries` past the settlement-only
   boundary).
6. **`_pair_reverse_core`'s guard set itemized** [V4 MAJOR, C3-SOUND]: the three helper
   walls (`_subledger_allocated_items_present`, `_bank_live_match_present`,
   `_fa_reversal_blocked`) as defense-in-depth; the K-family boundary by VACUITY (pair
   members are origin='scheduled_run', never opening-balance — pinned as a tail probe, no
   0017 extraction); the 203005004 rung AFTER both JE row locks; MYT posting dates (no
   `current_date`); `_assert_balanced`; the double-reverse guards inline;
   `_wdb_reversal_blocked` deliberately NOT invoked (locking others out is its purpose).
7. **Enrolment takes the client rung** [V6 MAJOR]: `enrol_staff_advance_account` acquires
   203005004 BEFORE `_fa_lock_roles` (leaf stays last) and re-reads the approved balance
   under the rung — the concurrent-approval enrol race closes; concurrency cell added.
8. **The bank-side reservation belt widens to the shared union** [V7 MAJOR]:
   `_fa_assert_code_unreserved` (CoR) reads `_acct_role_reserved` (FA text kept, an
   advance-domain refusal added); a bank account can no longer bind to an actively enrolled
   advance code; cell added.
9. **The CoR register completes** [V8 MAJOR]: + `_subledger_on_approve` (the six-marker
   prestate census at measured counts + the multi-line anchor), `_fa_asset_json`, the
   bank-reserved belt, `withdraw_draft`, the allocate cores + settle core factorings.
10. **Per-table immutability named** [V9 MAJOR]: staff_advances (append-only; set-once
    allowlist {purpose, reference} via the completion verb; hook-only {voided_by_entry_id,
    void_effective_date}) · staff_advance_applications (pure append-only) ·
    adjustment_runs (fully immutable) · adjustment_pair_reversals (transition-only) ·
    the templates/enrolments clones as already stated — each with no-delete/no-truncate,
    pinned in the tails.
11. **Smalls** [V10-14]: the zero-charge-noop cell DROPPED (schema-impossible — template
    lines are positive and balanced; occurrences always charge) · seven missing cells added
    (end_date alignment · content-hash dedup · retire-with-outstanding ·
    correction-of-correction + cap · pending `bank_corrective_line` refusal · the
    parked-cancel drill · suggestion dedup) · the reopen clear-set is SIX columns
    (counterpart_line_id included — already null for booking dispositions, but the arm is
    written against the trigger's own comparison set) · a solo (non-auto-reverse)
    occurrence has NO pair: plain `reverse_entry` is its path, `_wdb_reversal_blocked` does
    not fire, and `reverse_adjustment_pair` refuses it by name (`not_an_auto_pair`) · the
    parked-state vacuity reason stated (the belt's open-branch arm is write-triggered on
    the exception row) + a tail probe pinning that predicate + the accidental-guard cell
    (direct resolve on a parked line refuses `disposition_unbooked`).

### Verified sound in round 3 (cumulative)

The belt member-INSERT widening predicate as-coded (deferred trigger re-queries by id; the
group INSERT precedes the member INSERT; `v_n = 0` short-circuit scopes it to reconciled
lines) · the rung order 203005003→203005004→203005006 is the as-built partial order · the
row-lock-before-rung law is 0037's ratified invariant (1) · the §2.6 splice anchor
(multi-line, pinned at one occurrence) · `_reserve_op` raises-on-mismatch (the §8 probe
measures the right thing) · the `:fa-roles` leaf reuse keeps taker-count at one · both legs
of the pair-linkage reasoning · the 13-column recipe count · resolve-first ordering (the
two-touch-point collapse for the UNRECONCILED case) · the guard-helper inventory (three
helpers; opening/allocation/bank/FA unreachable by template eligibility on a valid pair) ·
the remaining round-2 folds landed consistently (one-way linkage, hook-born corrections at
the remainder, generation-grouped tie, issue-date gating, FYE scoping, fingerprint drop,
cost-only G12, surfaces).
