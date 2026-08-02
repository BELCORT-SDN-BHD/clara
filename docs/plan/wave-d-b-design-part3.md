# Wave D-b design — part 3: the ladder record, rounds 5+

> Continuation of `wave-d-b-design-part2.md` (rounds 1–4), split at the 500-line ceiling.
> Same law: rounds, adjudications, cumulative verified-SOUND. The main doc carries only the
> resulting mechanism.

---

## Round 5 (2026-08-02) — v5 dry-check, two lanes

**Lanes:** verify (native opus-5 xhigh) DO-NOT-SHIP 2B/9M/4m · Codex (gpt-5.6-sol xhigh)
DO-NOT-SHIP 5B/1M. **Both lanes converge on the same diagnosis: the MECHANISMS are sound
(every round-4 fold verified landed); the remaining defects are two real design holes plus
builder-spec completeness.** Labels: V5/C5.

### Folded — the v6 changes

1. **The pair-correction ramp-reset law** [V5-1 BLOCKER — the round's one real money
   defect]: a pair-corrected (template, period) is unmet again, and with ≥2 approved
   occurrences the ramp stayed earned — the next sweep would AUTO-POST the identical
   occurrence, silently undoing the human's correction. v6 restores D-a's law ("a reversal
   un-earns until a fresh reviewed run passes") at template grain: **the ramp EXISTS counts
   only occurrence entries approved AFTER the template's latest completed
   `adjustment_pair_reversals` receipt** — a completed pair correction resets the ramp
   clock; the re-run DRAFTS for review. Cell: 3-occurrence template → pair-correct one →
   the next sweep drafts, never posts.
2. **`resolution_exception_id` gets its writer and its guard** [V5-2 BLOCKER]: the
   composite UPDATEs the group it just created (both paths, same transaction — "stamped in
   the creating transaction" replaces the ambiguous "at CREATION"); a NEW narrow
   `bank_matches` BEFORE-UPDATE trigger enforces the column set-once (null→value only) —
   additive, not a recut of absent machinery; **0038's four-name `bank_matches` INSERT
   census is re-pinned** at its new membership (`_settle_from_bank_line_core` replaces
   `settle_from_bank_line`).
3. **Occurrence high-stakes headers pinned** [C5-3 BLOCKER]: occurrences (and therefore
   mirrors and pair corrections) are born with `is_opening_balance = is_year_end =
   tax_affecting = FALSE, always` — templates are ordinary periodic adjustments; a
   year-end-flagged or tax-affecting adjustment is hand-draft territory (a stated v1
   boundary, visibility-first). CLR05 on the template lane is therefore amount-driven only.
4. **Suggestion dedup across approved states** [C5-4 BLOCKER]: a partial unique expression
   index over the line — one `bank_rule_suggested` entry per line across
   `status IN ('draft','approved') AND reversed_by IS NULL` — plus the friendly row-locked
   precheck; sequential AND concurrent approved-but-unmatched duplicate cells.
5. **The application cap is temporally defined** [C5-5 BLOCKER]: the hook's authoritative
   check is not current-net — **the new application must fit outstanding at ITS OWN
   effective_date, and the cap must hold at EVERY date boundary ≥ that date** (the running
   minimum absorbs it; a backdated application can never drive any historical outstanding
   negative). Backdated-after-application and backdated-before-later-correction cells.
6. **The deferred no-commit trigger shape** [V5-3 MAJOR]: re-query-by-id (the 0038:3255
   idiom) — raise only if the FINAL committed state is `approving`; a NEW-tuple test would
   refuse every lawful pending→approving→completed run. Tail probe asserts the re-query.
7. **The receipt edge set written out** [V5-4 MAJOR]: `pending→approving`,
   `approving→completed`, `pending→cancelled` — nothing else; the frozen-column set
   (occurrence_id, mirror_id, occurrence_correction_id, mirror_correction_id, maker,
   op_key) in the 0041:650-663 idiom.
8. **`mode` rides the flags** [V5-5 MAJOR]: the poster stamps `mode` into
   `flags.recurring_adjustment`; the axis refuses a `mode='post'` proposal when the
   forced-draft predicate or `is_high_stakes` NOW holds; the ramp is never re-derived at
   approve; the receipt reads `mode` from flags.
9. **The op-key matrix completed** [V5-6+C5-1 BLOCKER]: one row per individual key with
   its exact normalized request-hash expression; the poster's own `<op>` row; the
   draft-branch closer corrected to the ratified claimed-but-unfinished posture
   (0041:3412); the non-null rule stated once (derived pre-reservations RAISE
   `approve_key_collision`, never replay); `:mirror:approve` reserved UNCONDITIONALLY
   (deferral marker on the non-auto_reverse branch) [V5-14].
10. **The event contract completed** [V5-7+C5-6 MAJOR]: both types registered in
    `clara.event_types` AND `clara.trigger_taxonomy` at `taxonomy_active` (decision
    'ignore', the 0041:978-996 CTE); emission sites + counts pinned in the tail;
    identifiers-only payloads; ruled: staff-advance register mutations ride the generic
    `entry.*` events (no named register events in v1 — the register rows are
    hook-derived from entries, which carry the events).
11. **RLS everywhere** [V5-8 MAJOR]: enable + FORCE + the owner/human policy pair
    (0041:680-685) on ALL seven new tables (the six state tables + `ea1955_policy`); the
    tail asserts `relrowsecurity AND relforcerowsecurity` for each.
12. **The ABI appendix** [V5-9+C5-2 BLOCKER]: §9 of the main doc now carries every public
    verb's full signature (params, order, defaults-last, floors, return envelopes), the
    poster twins' names, the flags-key schemas (all three named — `recurring_adjustment`,
    `staff_advance_application`, `bank_rule_suggested`), the template `lines` JSON schema +
    `memo_template` grammar (verbatim text; no interpolation in v1), `content_hash`
    composition, `adjustment_runs.period` typing, the `ea1955_policy` DDL + seed, and
    `p_confirm_dedicated` persistence (an `enrolment_attestation` text column on the
    enrolment row).
13. **Bijection restorations** [V5-11 MAJOR]: the `withdraw_draft` pair refusal restored to
    §2.4 (token + remedy) + its cell; `complete_staff_advance_particulars` gains floor
    (bookkeeper+), op-key, already-set refusal + cell; `ea1955_policy` fully specified and
    counted (table #7); `adjustment.posted` emission site named (arm (2), after the
    receipt).
14. **Smalls** [V5-12/13/15]: "0040's S5 sighting carve-out" wording · the two 0017 site
    names + live-body caveat carried into §6.3 · `content_hash =
    _hash({name, cadence, start_date, end_date, auto_reverse, lines, memo_template})` ·
    the pair receipt's draft columns named (`occurrence_correction_id`,
    `mirror_correction_id`) · the reconciler op-key shape pinned
    (`adj:<client>:<template>:<period_start>:<rand8>`; the random suffix is load-bearing —
    claimed-but-unfinished reservations stay harmless).

### Verified sound in round 5 (cumulative with parts 1–2)

All round-4 folds landed (both lanes): the pair receipt channel (approving state · deferred
no-commit · hook membership · revise-by-membership · byte-exact re-derivation · signature
order · inline cancel) · `resolution_exception_id` at creation with seven evidence-channeled
sites · the leaf membership · the `scheduled_run` writers-at-three census ·
`origin='reversal'` pair corrections · the six-table trigger census · the four-caller/
depth-two hook census · mirror flag copying + post-update attestation sourcing +
whole-statement rollback + event-order assertion · the cross-transaction preheld spend of
the mirror key · CLR05 binding only under high stakes (the low-stakes same-actor double
approval is lawful) · the splice anchors + the six-marker census · `_wdb_reversal_blocked`
as the arithmetically-correct 7th splice · the D-a clone targets carry what the doc claims ·
the §8 tail list judged "unusually complete for a design doc" (native lens).
