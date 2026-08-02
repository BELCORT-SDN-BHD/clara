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
