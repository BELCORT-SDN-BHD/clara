# Wave 2, lane 07, ticket #974 — "A blocked depreciation queue has no Needs-you row"

Branch `riders/w2-lane07`, base `23cfad947b5598214168ba9c43d391b4e16aa745`. Two commits:

- `c7b434584` — `db(depreciation): #974 splice list_review_queue for a depreciation_authority_pending row`
- `d50857c08` — `web(firm): #974 wire depreciation_authority_pending into the Needs-you closed world`

Status: **done**.

## The seam

`clara.list_review_queue` (`packages/db/migrations/0260_depreciation_authority_pending_rowkind.sql`),
the one read the Agent Brief names, plus its closed-world mirrors on the web side:
`apps/web/lib/firm/needs-you.ts` (`REVIEW_QUEUE_ROW_KINDS`, `ReviewQueueRow`), `needs-you-affordances.tsx`
(`NEEDS_YOU_AFFORDANCES`), `needs-you-links.ts` (`OWNING_TAB`) and `messages/en.json`
(`NeedsYou.rowKind.*` / `NeedsYou.openTab.*`).

## Acceptance criteria

1. **A client with a proposed, unsigned authority produces exactly one queue row, with its own
   label and its own affordance opening to where the authority can be signed or withdrawn, each
   distinct from every other kind's.** — Evidence: `p974.row.appears` and `p974.row.distinct`
   (`packages/db/tests/depreciation-authority-pending-rowkind.test.mjs`), both green, asserting
   `row_kind='depreciation_authority_pending'`, `section='needs_you'`, `lane='needs_you'`,
   `id === authority_id === authorityId`, and `question_text` naming "awaiting signature" and the
   actual cadence. Label: `NeedsYou.rowKind.depreciation_authority_pending` = "Depreciation
   authority awaiting signature" (`apps/web/messages/en.json`), proven reachable by
   `needs-you.test.ts`'s generic "every REVIEW_QUEUE_ROW_KINDS member has a real ... label" cell.
   Affordance: the row's link (`needs-you-links.ts`'s `OWNING_TAB.depreciation_authority_pending =
   "/registers"`) opens the fixed-assets register tab, where `DepreciationAuthorityPanel` already
   carries the sign/withdraw controls (#651) — proven by `needs-you-links.test.ts`'s new named case
   plus its pre-existing generic "every emitted href is a path CLIENT_ROUTES actually serves" sweep.
2. **Signing or withdrawing the authority removes the row on the next read.** — Evidence:
   `p974.row.withdraw_removes` (retire_depreciation_authority) and `p974.row.sign_removes`
   (sign_depreciation_authority, through the real `signAuthorityCompat` shim with a minted
   `chat_task` reference) — both green, both real doors, both re-reading `list_review_queue`
   afterward. The migration's own tail also proves the withdraw half inside a forced-rollback
   behavioural probe (`0260...sql`'s `$p974_probe$` block, `migrate` output: "BEHAVIOURAL probe
   OK... retire_depreciation_authority (withdraw) removed it").
3. **No existing row kind's label, affordance, tally or row set changes.** — Evidence: the
   migration's prestate/postcheck marker roster re-derives all ten pre-existing row_kind literals
   at their exact pre-splice counts (`migrate` output: "the ten pre-existing row kinds survive at
   their EXACT pre-splice marker counts"); `p974.counts.needs_you` asserts `open_drafts`,
   `open_questions`, `open_tasks`, `compliance_watches`, `lint_findings` are byte-identical before
   and after, and that no new `counts.*` key was minted; `packages/db/tests/
   ninth-rowkind-seeding-proposal.test.mjs` (4/4 green) and `work-question-reads.test.mjs` (19/19
   green) — both re-run in full after the splice — prove the seeding_proposal and work_question
   kinds' own shapes and behaviour are untouched.
4. **Every place the closed row-kind vocabulary is pinned admits the new kind, and the membership
   predicate accepts it.** — All five pins updated: (1) `needs-you.ts`'s `REVIEW_QUEUE_ROW_KINDS` +
   `ReviewQueueRow.authority_id`; (2) the migration's own prestate/postcheck marker roster; (3)
   **both** `ninth-rowkind-seeding-proposal.test.mjs`'s and `work-question-reads.test.mjs`'s own
   `FULL_ROW_KEYS` rosters (#629 had already restated pin (3) as a second file-local copy rather
   than importing the first — both are kept in sync here); (4) `NEEDS_YOU_AFFORDANCES`'s exhaustive
   `Record<ReviewQueueRowKind, ...>` (a missing entry is a **typecheck failure**, not a silent
   nothing-renders — confirmed: `pnpm typecheck` reds without the entry, greens with it) plus a new
   named case in `needs-you-affordances.test.ts`; (5) `messages/en.json`'s label map.
   `isKnownReviewQueueRowKind` needs no code change — it is a membership test against array (1),
   which now includes the new literal.
5. **The queue's role floor is unchanged: no caller who cannot read the queue today sees the new
   row.** — I did not touch the `_human_ctx(clara.role_rank('viewer'))` call that opens
   `list_review_queue` (outside my splice's two anchors). Evidence: `p974.role_floor` — a second
   bookkeeper (`grace`) who neither proposed nor will sign/retire the authority still reads the row
   at the queue's existing floor.
6. **The queue read is recut by a new migration at the next free number; no already-applied
   migration is edited.** — `packages/db/migrations/0260_depreciation_authority_pending_rowkind.sql`,
   the exact reserved number. No existing migration file was edited.

## Migration

`0260_depreciation_authority_pending_rowkind.sql` — an additive splice of the LIVE
`clara.list_review_queue(jsonb,jsonb,integer)` body (born 0011, replaced 0016, spliced by
0017/0036/0041/0043/0146/0168/0180 to date), following the exact `pg_get_functiondef` →
`replace()` → `execute` idiom 0146/0180 use for the same function.

**Prestate pin, measured on `clara_l07` before writing the file**, off `pg_proc.prosrc` (not
`pg_get_functiondef`'s wrapper text, per the house `sha256(prosrc)` convention 0227 set):
`29deb82d1609441d40a5be6131ffac12dc6b0ee8f1d37645dd9de986ce3eaf40`. The migration hard-asserts this
value before touching anything, plus the usual marker-roster witness (all ten pre-existing
`row_kind` literals, `null::int open_proposal_count` at 9, `_is_codeable_kind`,
`_autodraft_attempt_budget`, the exact `advance_id`/`autodraft` json-builder anchor), each
cross-checked raw-vs-comment-stripped (the 0141/0146 HIGH-1 guard).

**The change:** one new `authority_rows` CTE (section `needs_you`, lane `needs_you`,
active-client-guarded, `fda.status='proposed'`) unioned into `all_rows`; one new
`'authority_id',case when p.row_kind='depreciation_authority_pending' then p.id end` gate in the
row-json builder, following the `asset_id`/`advance_id` idiom (0041 S4.9 / 0043 S3.8) rather than
`seeding_proposal`'s dedicated-column shape — a client carries at most one `status='proposed'`
authority (`uq_fa_authorities_proposed`, a partial unique index), so no aggregation is needed. No
new `counts.*` key (matching `seeding_proposal`'s own precedent of minting none; the row already
counts toward `counts.needs_you` through the existing `lane='needs_you'` filter).

**Tail:** a behavioural probe (0146's forced-rollback-subtransaction idiom) that proposes a real
authority through `clara.propose_depreciation_authority`, reads the real installed
`clara.list_review_queue`, asserts the row's shape, then calls the real
`clara.retire_depreciation_authority` and re-reads to prove the row is gone — all inside a
`begin...exception...end` block that rolls back to its implicit savepoint, so no fixture survives
the migration's own commit. This ran and passed at `pnpm migrate` time (see notice text above).

**No rig-meta cohort, no new grant.** This migration adds zero new callable SQL objects — it
recuts the body of an already-granted function in place, exactly as 0146 and 0180 (the two direct
precedents for this same operation) did; neither of those carries a rig-meta cohort either, because
cohorts audit GRANT correctness on newly-introduced objects and there is none here. I did add this
migration's own preintegration gate
(`depreciation-authority-pending-rowkind-preintegration-gate.mjs`) and frontier-gated my new test
file on the migration's stable stem (`depreciation_authority_pending_rowkind$`), since unlike
0146/0180 this ticket ships a NEW test file that needs to quiet-skip rather than hard-fail a
package-wide sweep against a pre-0260 chain.

Applied with `pnpm migrate` (no redo needed — applied once, cleanly, first try):

```
[notice] #974 prestate OK: clara.list_review_queue pinned at prosrc sha256 29deb82d...
[notice] #974: clara.list_review_queue spliced -- ... prosrc sha256: 5b6665...ca32a -> eb54cb8a...cf3e9.
[notice] #974 BEHAVIOURAL probe OK: ... Fixtures discarded.
applied 0260_depreciation_authority_pending_rowkind · backend pid 358212
migrate: 1 new migration(s) applied · 230 total · target 127.0.0.1:55747/clara_l07
```

## Gates, with counts

**DB test files touched/added, with the full gate chain** (`packages/db`, `$GATES` = the 52
`--import` flags now in `package.json`'s `test` script, including my own new one appended at the
sorted/migration-order tail position):

- `depreciation-authority-pending-rowkind.test.mjs` (new): 6/6 pass — `p974.row.appears`,
  `p974.row.distinct`, `p974.row.withdraw_removes`, `p974.row.sign_removes`,
  `p974.counts.needs_you`, `p974.role_floor`. Ran RED first (focused, no gate preloaded — all 6
  failed loudly with "migration is NOT applied... a skip is not evidence", the correct reason)
  before `pnpm migrate`, then GREEN after.
- `ninth-rowkind-seeding-proposal.test.mjs` (touched — `FULL_ROW_KEYS`): 4/4 pass. Confirmed RED
  first (`... carries a DIFFERENT key set...`, listing `authority_id` as the extra key) before the
  fix.
- `work-question-reads.test.mjs` (touched — `FULL_ROW_KEYS`): 19/19 pass.
- `operation-census.test.mjs`: 10/10 pass (no ungranted/uncohorted new object — expected, since
  0260 adds none).
- `rig-isolation.test.mjs`: 22/23 pass, 1 skipped (`T19 poison-role`, the destructive reset cell —
  correctly skipped; `CLARA_RIG_ALLOW_RESET` was never set, per RIG.md's own rule).

**apps/web:**

- `pnpm typecheck`: clean except one **pre-existing, unrelated** error —
  `components/documents/document-kind-dialog.tsx(95,22): Cannot find name 'DOCUMENT_KINDS'` —
  verified present byte-for-byte at the wave's own base commit
  (`git show 23cfad9...:apps/web/components/documents/document-kind-dialog.tsx`), before this
  ticket touched anything. Not fixed (out of lane/ticket scope).
- `pnpm lint`: clean, exit 0 (includes `check-message-keys`, confirming no dangling/missing
  `t(...)` key from this change).
- Whole unit suite (`node scripts/run-tests.mjs`, once): **4728 pass / 20 fail / 2 skipped** out of
  4750. All 20 failures trace to the SAME pre-existing `DOCUMENT_KINDS is not defined` `ReferenceError`
  cascading through every test that renders `DocumentKindDialog` as a descendant (documents
  intake-polling and correction-wizard tests) — none touches `needs-you`/`depreciation`/`authority`.
  The 2 skips are the known live-Supabase-auth env skips (unconfigured `CLARA_LIVE_SUPABASE_AUTH_*`),
  unrelated. The known `thread-live-clarify.test.tsx` whole-suite load flake (RIG.md) did **not**
  appear this run.
- Targeted run of the three primary files (`needs-you.test.ts`, `needs-you-links.test.ts`,
  `needs-you-affordances.test.ts`): 36/36 pass.
- `firm-scope-db-pins.test.ts` (the reviewed-dynamic-SQL-barrier census, initially red on my new
  migration — "unmodelled: unreviewed dynamic-SQL barrier at
  0260_depreciation_authority_pending_rowkind.sql"): fixed by registering the barrier in
  `firm-scope-db-pins.corpus.ts` with the migration file's own content sha256
  (`d84659c80b4aee33f46038660ee97e2f322a7e6861cdc5874ebfb79507cde81f`); 22/22 pass after.
- No Playwright walk owed: this ticket touches no `*.spec.ts`/`*-mock.mjs` file and no rendering
  component (`needs-you-row.tsx` was not touched — it already renders every row_kind generically
  through the closed-world lookups this ticket extends).

## Docs

No `CONTEXT.md` change: "depreciation authority" is already a defined term (from #651); a
`row_kind` literal is an implementation detail, not domain vocabulary, and neither 0146 nor 0180
(the two direct precedents) added one either. No `packages/db/README.md` or
`packages/db/tests/README.md` section: both are reserved for complex/adversarial batteries
(0227, 0233/0234's pinning convention, race conditions) — neither 0146 nor 0180 has an entry for
this exact same kind of change, and mine is proportionately simpler than either. The documentation
that exists is in the code itself: the migration's own header, `needs-you.ts`'s corrected grounding
comment (the stale "NINE values"/"TENTH row_kind, 裁-18b deferred" note is fixed in place, since I
was already editing the adjacent lines and leaving it wrong beside my own addition would mislead
the next reader), and each new/edited test file's own header.

## Successor contract

None owed. This ticket touches no frozen workflow body and no closure module — the row is read
straight off an existing table by an existing (spliced) reader, and its affordance is a same-page
link, not a Clara/chat-lane door.

## Follow-ups worth filing

- `needs-you.ts`'s own "EXTENSION POINT" note observes that pin (3) — the structural census's
  `FULL_ROW_KEYS` roster — now lives in **two** file-local copies (`ninth-rowkind-seeding-proposal
  .test.mjs` and `work-question-reads.test.mjs`) that must be kept in sync by hand. A twelfth kind
  should collapse these into one shared exported const rather than adding a third copy.
- The pre-existing `DOCUMENT_KINDS is not defined` break in `document-kind-dialog.tsx` currently
  fails 20 tests in the whole-suite run. Unrelated to this ticket; worth its own ticket given the
  blast radius (documents intake polling, correction wizard, URL-state, filing candidates).

## Unverified

- I did not exercise the `sign_depreciation_authority` / `retire_depreciation_authority` doors
  through the actual web UI (`apps/web/lib/registers/depreciation.ts`) end-to-end in a browser —
  only through the real DB doors directly (per the ticket's own out-of-scope line: "Any change to
  how a depreciation authority draft is proposed, signed or withdrawn" is not this ticket's
  concern, and the existing register UI for those doors is unchanged).
- I have not independently re-verified that every one of the 20 whole-suite `document-kind-dialog`
  failures pre-dates this ticket beyond the one `git show` diff I pulled and the shared
  `ReferenceError` stack trace each carries; I did not check out the base commit and run the full
  suite there.
