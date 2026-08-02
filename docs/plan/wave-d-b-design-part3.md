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

---

## Round 6 (2026-08-02) — v6 dry-check, two lanes

**Lanes:** verify (native opus-5 xhigh) DO-NOT-SHIP 5B/4M/5m · Codex (gpt-5.6-sol xhigh)
DO-NOT-SHIP 5B/2M/1m. One genuine money defect (the solo-lane ramp hole) + spec
literalness; both SOUND lists confirm 12/13 round-5 folds landed clean. Labels: V6/C6.

### Folded — the v7 changes

1. **The UNIFIED ramp clock** [V6-1+V6-2 BLOCKER — the money defect]: the round-5 reset law
   covered only the pair lane; a solo (non-auto-reverse) occurrence corrected via plain
   `reverse_entry` mints no receipt, leaving the ramp earned — the sweep would re-post the
   corrected occurrence. v7: an occurrence counts only when `approved_at >
   coalesce(GREATEST(max completed_at of the template's COMPLETED pair receipts, max
   approved_at of the reversing MIRROR of any of the template's occurrence entries),
   '-infinity')` — both correction lanes reset the clock; the re-run DRAFTS. The receipt
   gains `template_id uuid NOT NULL` + `completed_at timestamptz` (the predicate was
   inexpressible without them — created_at is the PENDING moment on the high-stakes path).
   The predicate is written literally in §2.3; the solo-correction cell added.
2. **The stale "sole earner" parenthetical replaced** [V6-3+C6-1 BLOCKER] with the clock
   law verbatim.
3. **The poster admission law written out** [V6-4 BLOCKER + C6-5]: unmet(template, period)
   ⇔ no approved un-reversed role='occurrence' entry for the pair; blocked(template) ⇔
   `_adj_occurrence_outstanding(client, template)` (a draft outstanding — `blocked[]`'s
   only v1 reason); the window = [start_date, coalesce(end_date,'infinity')] with
   **start_date ALSO validated at propose as a cadence period-START** (the first eligible
   period begins at it); tokens `period_already_met` / `occurrence_draft_outstanding` /
   `period_out_of_window`. **The canonical period triple** {period_start, period_end,
   period_label} used by hashes, events, receipts and memos; labels: monthly
   `to_char(period_end,'Mon YYYY')`, annual `'FY'||to_char(period_end,'YYYY')` [V6-14].
4. **The §4/§9 settle-key contradiction fixed** [V6-5+C6-2 BLOCKER]: `<op>:settle` is
   composite-reserved pre-lock and spent by the core preheld; `<op>:settle:approve` is
   DELETED from the composite-reserved set (the allocate cores' own, inside the settle
   core's discipline). The matrix's NEW-key rows carry literal `jsonb_build_object` field
   lists; the callee-owned rows are ADJUDICATED as "the callee's live law — harvested at
   build, never duplicated into this doc" (duplication rots; the harvest step + x42 own
   the literals).
5. **Return envelopes + JSON schemas** [C6-3 BLOCKER, V6-8 MAJOR]: `p_draft` =
   {posting_date, memo, lines, counterparty?, resolution?}; the AF-2 disposition enum =
   ('matched_booking','written_off_adjustment'); `book_staff_advance_application` keeps the
   WCA-R7 branch with the envelope stated per-branch — posted → {status:'posted', entry_id,
   application_ids[]} (the hook ran in-verb); drafted → {status:'drafted', entry_id,
   application_ids: []} (ids born at the checker's approval). House convention stated once:
   every other envelope follows its cited precedent's live shape, pinned at harvest + x42.
6. **`ea1955_policy` uses the 0016 system-reference idiom** [C6-4 BLOCKER]: a GLOBAL table
   (no firm_id), system-maintained (writes only by migrations), authenticated-read policy —
   NOT the firm-scoped owner/human pair (§2.1's blanket sentence scoped to the six
   firm-scoped tables); the three literal seed rows written (effective_from 2026-08-01,
   effective_to null, note + source_note citing the EA 1955 primary text).
7. **The refusal-token table** [V6-6 MAJOR]: §9 gains one row per refusal (site → errcode →
   detail.reason) covering every §7 cell's token — the migration author and the
   contract-blind suite author must land on the same strings.
8. **Enrolment attestation is text** [V6-7+C6-7 MAJOR]: `p_attestation text` (non-blank
   required alongside `p_confirm_dedicated`) stored in `enrolment_attestation`; the
   `staff_advance_accounts` DDL block written (incl. person_label, retired_reason, actor +
   op-key columns); the `bank_matches` ALTER typed (`pending_resolution jsonb`,
   `resolution_exception_id uuid REFERENCES clara.bank_line_exceptions(id)`) [V6-9].
9. **Trigger-wording fixes** [V6-10/11/12 minor]: the receipt's MUTABLE set = {status,
   completed_at} (the 0041 idiom's subtracted array — everything else immutable after
   INSERT); the receipt is INSERTed `pending` with both correction ids AFTER the drafts are
   born, then → `approving`; the `resolution_exception_id` guard is immutable-once-non-null
   (old non-null AND distinct → raise), not null→value-only.
10. **Smalls**: the annual symmetry cell reworded to assert the FALSE pin [V6-13] · payload
    policy = a typed-primitive allowlist; the reopened payload = {exception_id, line_id,
    match_id} [C6-6] · the G13 citation fixed (the seven positions inlined by name) [C6-8].

### Verified sound in round 6 (cumulative)

12/13 round-5 folds landed clean (both lanes; the 13th — the op-key matrix — is the §4/§9
contradiction above) · the ramp-vs-mirror axis (role='reversal' never counts) · the
ramp-vs-catch-up axis (independent predicates; the boundary day ruled) · cancelled receipts
do not reset the clock; pair-corrected occurrences are doubly excluded · every cited
external anchor is real and says what the doc claims (both lanes re-verified the full
anchor set) · §9's signatures internally consistent outside the named findings · the AF-2
substrate matches the live code (dispositions, floors, 12/13-arg settle targets) · the
runtime increment arithmetic (the 5th due-check) · the seven admission sites + reopen
identity survive unchanged · `resolution_exception_id`'s writer/trigger/census re-pin ·
headers-FALSE + mirror copying · suggestion dedup · the temporal cap · the deferred
re-query shape · the edge set · mode-in-flags · the event+taxonomy contract · RLS ×7.

---

## Round 7 (2026-08-02) — v7 dry-check, two lanes

**Lanes:** verify (native opus-5 xhigh) **SHIP-WITH-FIXES** 0B/4M/7m — the ladder's first
non-blocking verdict · Codex (gpt-5.6-sol xhigh) DO-NOT-SHIP 5B/3M (the same finding set
labeled harder). **Zero mechanism defects on either lane; every item is ABI completion
with a determinate fix.** Both SOUND lists verified: the unified ramp clock is expressible
as written (journal_entries carries every needed column); the solo lane's concurrency is
already closed by reverse_entry's own client rung; all round-6 folds landed.

### Folded — the v8 changes (all surgical)

1. **Pre-lock-knowable hashes** [N1+C1, N2]: `<op>:draft:approve` hashes
   `('composite','resolve_and_book_bank_line','op_key',p_op_key,'leg','draft')` (the live
   0038 idiom — never an entry id); the pair half keys hash
   `('occurrence', p_occurrence, 'half', ...)` (knowable from the args; no pre-minted
   uuid needed).
2. **The matrix completes** [C2]: rows for `book_staff_advance_application`'s `<op>` +
   eager `<op>:approve` (the WCA-R7 spend/draft-branch closure) · literal hashes for the
   template/enrolment/particulars verbs · the composite's hash field list written out.
3. **`start_date` joins the sign-time revalidation** [N4+C3]: `template_fy_stale`; the
   propose→FYE-change→sign window closes; the cell rides §7.
4. **`p_advance_applications` schema pinned** [C4]: null | the exact
   `staff_advance_application` payload shape, copied VERBATIM into the hand-draft's flags;
   line_no refers to `p_draft.lines`; park-branch refusal unchanged.
5. **ABI §D completes** [C5+N8]: DDL blocks for ALL SEVEN new tables (the five state
   tables consolidated from prose into DDL form) + the typed `bank_matches` ALTER; §9's
   pointer reworded to match.
6. **Return envelopes + read shapes** [C6]: retire/particulars envelopes; the three reads'
   exact row schemas (summary + policy_notes · statement · tie incl. out_of_window +
   explained).
7. **The event payloads land in both files** [N5+N6+C7]: `adjustment.posted` carries
   period_start+period_end (the canonical pair — never a bare `period`);
   `bank.line_exception_reopened = {exception_id, line_id, match_id}`; ABI §G is the
   single owner.
8. **The token table completes** [N11+C8]: `disposition_unbooked` (inherited) ·
   `proposal_not_revisable` (the D-b revise arm; the FA arm keeps its live token) ·
   `template_duplicate` · `template_fy_stale` · `disposition_unsupported` (branch-neutral,
   argument-time — the live branch cell added).
9. **The hot-loop indexes** [N3]: the two partial indexes (the D-a F10 measured law)
   named in ABI §C, referenced in §2.3, §8-pinned.
10. **`ea1955_policy` posture exact** [N7]: no-truncate + enable/FORCE RLS + the OWNER
    policy + `GRANT SELECT TO clara_authenticated` + the migration-only-writes probe.
11. **Single-owner matrix** [N10]: §4's duplicate table cut to a pointer at ABI §E (the
    round-6 anti-duplication adjudication applied to ourselves).

### Verified sound in round 7 (cumulative)

The unified pair/solo ramp clock + `template_id`/`completed_at` + cancelled-exclusion +
both reset cells · the admission window/unmet/blocked definitions + start-date validation
+ label formulas · the settle-key single owner · the WCA-R7 envelopes · the enrolment text
attestation · the typed ALTER · the literal EA seeds · the pair-receipt mutable set /
INSERT order / re-query / immutable-once-non-null wording · parameter order + the three
flags schemas + headers-FALSE + the temporal cap + suggestion dedup + the seven-site
admission — all internally consistent (both lanes).

---

## Round 8 (2026-08-02) — the landing check; THE LADDER CLOSES

**Lane:** landing (native sonnet-5 xhigh) **SHIP-WITH-FIXES** — 0 blockers, 2 MAJORs, both
trivial: two §8 tail bullets other files promised were missing (the index-existence
assertion; the `ea1955_policy` migration-only-writes probe). Both folded on the spot. All
eleven round-7 folds verified landed; zero new inter-file contradictions; every
both-file item byte-consistent.

**CLOSURE ADJUDICATION (orchestrator, on the loop-until-dry law):** eight rounds, eighteen
lanes (9 native + 8 Codex sittings + 1 landing lens), ~170 findings — every round through 6
found genuine mechanism defects and every one is folded; rounds 7–8 decayed to determinate
spec fixes with zero mechanism findings on any lane and both final verdicts non-blocking.
The remaining literal-harvest class (callee-owned hashes, live envelope shapes) is
EXPLICITLY owned by the build's harvest step + the contract-blind x42 suite + the as-built
ladder — the same division of labor D-a ran. The design ladder is CLOSED at v8; the
as-built ladder re-opens scrutiny against the actual code.
