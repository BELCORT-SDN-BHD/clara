# Wave 2 · lane 09 · ticket #880 — Label a staff-expense claim on the Work LIST, not only the detail

**Status: DONE.** Branch `riders/w2-lane09`, worktree `C:\Users\zhant\Desktop\clara-wt\659`,
database `127.0.0.1:55749/clara_l09`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
4977e0b31 feat(web): #880 the Work list shows a staff-expense claim's own label
805240358 feat(db): #880 list_accounting_work/get_accounting_work_row gain the claim label
2b207c268 feat(web): #839 offer restate from the Clara rail's work-question cards
cbf86d907 feat(db): #839 clara.get_work_question gains the admitted basis
```

Working tree clean. `git log 23cfad94..HEAD` at start showed #839's two commits already landed
(`2b207c268`, `cbf86d907`); nothing of mine preceded me. `gh issue view 880 --comments` carries
exactly one comment, the 2026-09-17 "Agent Brief" (`author: belcorttao`, `association: member`) —
there is no owner ruling comment dated 2026-09-20 on this ticket. **The ticket was still live**:
measured on the lane rig before any change, `clara.list_accounting_work` (last recut by
0203/#809) projected `purpose` alone with no claim field, `clara.get_work_claim_origin` (0221)
was single-Work and called only by the Work detail, and
`apps/web/components/work/accounting-work-list.tsx`'s own header comment recorded the exact gap
the triage note describes (`git diff 23cfad94..HEAD` before my commits was empty for every file
this ticket touches).

## The seams I tested at (written before the first test)

The brief names two key-interface shapes and picks neither for me ("A batched claim-origin read
… **or** an additive claim projection … (the two are asserted to move together)"). I chose the
additive projection — see "Why the additive projection" in the migration's own header — which
makes the seams:

- **`clara.list_accounting_work` / `clara.get_accounting_work_row`** — the two doors, tested
  through the doors themselves (`packages/db/tests/work-list.test.mjs` wl.29), never through the
  internal join directly. `clara.get_work_claim_origin` (the Work detail's own door) is a
  **different** seam this ticket does not touch — proved by non-edit, not by a test.
- **The Work list's compact-line label** — `workRowKindLabel`, the pure decision
  `apps/web/components/work/accounting-work-list.tsx` now exports, tested directly (four cells,
  no render) and once more end-to-end through the rendered list
  (`accounting-work-list.test.tsx`).

No test at a seam the brief does not give: I did not touch `work-detail.tsx`,
`lib/work/staff-expense-claim-reads.ts` (`getWorkClaimOrigin`), or
`clara.get_work_claim_origin` itself.

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 (db) | wl.29's `claimRow.claim_id` — after reverting the live bodies to the 0203 pre-image (extracted from the 0203 file itself, sha-verified against the measured pin, never retyped), `actual: undefined` vs the real claim id | migration 0266's `create or replace` widen of both doors, adding `claim_id`/`claimant_label` via `left join clara.staff_expense_claims sec` |
| 2 (web) | `workRowKindLabel`'s three claim-branch cells, red with the `if (row.claim_id !== null) { … }` branch removed (`actual: "Journal entry"` vs the expected claim label; the DOM cell showed no claimant text) | `workRowKindLabel`'s claim branch, wired into `WorkRow`'s compact line |

Both slices' vacuity controls are recorded under "Migration" and "Gates" below.

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| A cell proves a page containing claims resolves every claim label from at most one additional round trip | **done — stronger than asked: zero additional round trips** | `wl.29` admits a claim Work and a plain Work on the SAME client, reads ONE page via `listWork`, and asserts the claim row's `claim_id`/`claimant_label` are already on that page (`claimRow.claim_id === claimed.claim_id`, `claimRow.claimant_label === "Farah binti Idris"`) — no second door call anywhere in the test. The web side proves the same fact from the render boundary: `workRowKindLabel` takes only the row already on the page. |
| A cell proves non-claim rows are unchanged | **done** | `wl.29`'s `plainRow` (same page) asserts `claim_id`/`claimant_label` are both `null` and `memo` is untouched; `wl.1`–`wl.28` (28/28 green, unchanged) prove every other field's behaviour is unmoved. On the web: `workRowKindLabel: a plain row (claim_id null) with a KNOWN purpose is unchanged` and the "purpose newer than KNOWN_PURPOSES" verbatim-fallback cell both pass; `purpose.four` (a pre-existing shared guard across all four purpose-label surfaces) still passes unmodified. |
| The Work detail's existing single-Work read is untouched | **done** | `git diff 23cfad94..HEAD -- apps/web/components/work/work-detail.tsx apps/web/lib/work/staff-expense-claim-reads.ts` is empty. `wl.29`'s own last assertion re-reads `clara.get_work_claim_origin(uuid)` from `pg_proc` and confirms it still resolves; migration 0266 never names it. |
| If the list door is recut: the migration applies on a from-scratch chain and the two Work projections still match | **done, at the seam a lane can reach — from-scratch is the integrator's own gate (RIG.md)** | The list door WAS recut. Migration 0266's own §T step 7 re-reads `clara.get_accounting_work_row`'s committed body and asserts it projects `'claim_id', sec.id, 'claimant_label', sec.claimant_label` — the identical expression the list uses — and `wl.29` re-proves it from the outside (`claimAddressed.claim_id === claimed.claim_id`, same for `claimant_label`, on BOTH the claim and the plain Work). The from-scratch proof itself is the integrator's own disposable-cluster gate (RIG.md: "Lanes never need it"); not run here, exactly as #839 recorded for the same reason. |

## The migration

`packages/db/migrations/0266_work_list_claim_label.sql` — the number reserved for this ticket.
Applied to `clara_l09`; chain now 231 files (`migrate: 1 new migration(s) applied · 231 total`).

**Prestate pins, MEASURED on this rig now** (`encode(sha256(convert_to(prosrc,'UTF8')),'hex')` keyed
by `to_regprocedure`, never transcribed from the 0203 file text):

- `clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)` =
  `61bd9184fe271e081af426647c4081155c6d086368411478d1f2be88a1f4ca5a`.
- `clara.get_accounting_work_row(uuid)` =
  `989ee55e52ec724a07fedff6fdf2f4cff22bf60562fe92e249f60dc8c8f801d8`.

Both matched the 0203 file's own text byte-for-byte (confirmed separately: no migration between
0203 and my own prestate touches either function — `grep -l "create or replace function
clara.list_accounting_work\|clara.get_accounting_work_row" packages/db/migrations/*.sql` returns
only 0189 and 0203).

**What it changes.** Both doors gain `claim_id` (`sec.id`) and `claimant_label`
(`sec.claimant_label`), `LEFT JOIN clara.staff_expense_claims sec on sec.work_id = w.id and
sec.firm_id = w.firm_id` — at most one row per Work (`uq_staff_expense_claims_work`, 0221),
firm-correlation restated explicitly (belt-and-braces over the FK that already enforces it, same
style as the existing `clara.clients` join). No basis object, no money field, no item field is
projected — only the two label fields, per the brief's own "Out of scope" line and 0189's "a list
of operations is not a ledger". The #809 `intent_key` widen survives unmoved (re-asserted in both
the prestate and the tail, exact-count-checked at 2 mentions as before). Owner, ACL, `SECURITY
INVOKER`, `search_path` and `plan_cache_mode` are all restated and re-read unchanged.

**Why the additive projection, not a batched door** (the brief named both): zero round trips
beats "at most one"; it is the estate's own precedent (0203 did the identical two-doors-move-
together widen for `intent_key`); it needs no new SECURITY DEFINER re-derivation of
`clara.staff_expense_claims`'s own firm-scoping, because the join runs under the SAME RLS policy
(`p_staff_expense_claims_read`, `for select to clara_authenticated using (firm_id =
clara.jwt_firm())`) the door's SECURITY INVOKER posture already relies on for `clara.clients`.
Full rationale is in the migration file's own header.

**No new rig-meta cohort name**, matching 0203's own precedent (function names and arities did
not change) — but `WORK_LIST_0189_COHORT`'s own descriptive comment DID need a fix, since it
enumerated its sources by name ("three already-granted, firm-scoped sources
(clara.accounting_work, clara.agent_interruptions, clara.clients)") and #880 adds a fourth. I
updated that sentence (`packages/db/tests/rig-meta.mjs`) rather than leaving it silently stale.

**No new preintegration-gate module.** 0203 (the identical-shape precedent) added none either —
it is absent from `packages/db/package.json`'s gate-chain list — and used a lightweight inline
`schema_migrations`-stem check (`gateIntentKey`) instead. I added the same shape,
`gateClaimLabel`/`claimLabelReady`, keyed to `work_list_claim_label$`, in
`packages/db/tests/work-list.test.mjs`. `clara.staff_expense_claims` (0221) sits BELOW 0266 on the
chain, so this one frontier check is honest by itself: strict migration ordering guarantees 0221
is applied wherever 0266 is.

**Redo.** Used once, deliberately, as the vacuity control's restore step (not a mistake this
time — see "Gates"). `CLARA_MIGRATION_REDO=0266_work_list_claim_label` (the version string is the
full filename stem, not the bare number — the redo refused `266` first with "has no migration
file on disk", which is how I found the right form). The redo's own §0 prestate re-verified the
by-hand revert reproduced the exact pinned sha before proceeding, then re-applied and re-tailed
cleanly; `wl.29` went green again immediately after.

## Vacuity control

**DB (slice 1).** `clara.list_accounting_work` and `clara.get_accounting_work_row` were recut on
the rig, by hand (a short Node script, never a second migration file), back to their EXACT
pre-0266 text — extracted programmatically from the 0203 migration FILE itself (never retyped),
and self-verified: the script sha256'd its own extraction before applying and refused to proceed
unless it matched the pinned prestate hashes exactly (it did, both). `wl.29` was then run: it
failed on `claimRow.claim_id` (`actual: undefined` vs the real claim id it expected) — red for
exactly the reason the migration exists to fix. The bodies were restored via
`CLARA_MIGRATION_REDO=0266_work_list_claim_label` (see above), and `wl.29` (and the rest of
`work-list.test.mjs`, 29/29) re-ran green.

**Web (slice 2).** `workRowKindLabel`'s claim branch (`if (row.claim_id !== null) { … }`) was
deleted by hand. Re-running `accounting-work-list.test.tsx` turned exactly the three new
claim-branch cells red (`workRowKindLabel: a claim row …`, `… claim_id set with a null
claimant_label …`, and the end-to-end DOM cell) while the two new non-claim cells and every
pre-existing cell stayed green — proving the new cells are not vacuous and are not silently
coupled to anything else. The branch was restored byte-for-byte and the file re-ran 22/22 green.

## Gates, with counts

Every db command ran with `PGHOST=127.0.0.1 PGPORT=55749 PGUSER=postgres PGDATABASE=clara_l09
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`; every battery ran with the **full gate chain** from
`packages/db/package.json`. `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never
set.

| gate | result |
|---|---|
| `tests/work-list.test.mjs` (touched: +1 test, +2 gate helpers) | **29 pass / 0 fail / 0 skipped** (wl.1–wl.29) |
| `tests/staff-expense-claim.test.mjs` (regression — the relation my join reads) | **24 pass / 0 fail / 0 skipped** |
| `tests/operation-census.test.mjs` (touched `packages/db/tests`) | **10 pass / 0 fail / 0 skipped** |
| `tests/rig-isolation.test.mjs` (touched `packages/db/tests`; no reset flags) | **22 pass / 0 fail / 1 skipped** — the skip is T19 `poison-role`, which demands `CLARA_RIG_ALLOW_RESET`; RIG.md forbids it. T17 (grant matrix) and T18 (definer hygiene + governed RLS) both pass, confirming the widen needed no grant/cohort change. |
| `apps/web` — `components/work/accounting-work-list.test.tsx` (touched, +6 cells) | **22 pass / 0 fail / 0 skipped** |
| `apps/web` — `lib/work/work-list.test.ts` (touched fixture) | **9 pass / 0 fail / 0 skipped** |
| `apps/web` — `lib/plans/api.test.ts` (touched fixture) | ran together with the above two: **37 pass / 0 fail / 0 skipped** combined |
| `apps/web` — `lib/work/staff-expense-claim.test.ts` (regression — the shared purpose-label guard) | **15 pass / 0 fail / 0 skipped** |
| `node scripts/run-tests.mjs` (the WHOLE `apps/web` unit suite, once) | **4738 pass / 20 fail / 2 skipped / 4760 total** — all 20 failures are the SAME pre-existing, unrelated `DOCUMENT_KINDS` cascade #839 and #846 already documented (see below) |
| `pnpm typecheck` (worktree root) | **FAILS — inherited, not mine.** Same two lines as #839's report, same file I never touched. |
| `pnpm lint` (worktree root) | **exit 0**, across `apps/web`, `packages/db`, `packages/runtime` and `packages/reporting-render` — including `check-message-keys` (my new `WorkList.claimLabel` key resolves) and `check-test-manifest` (no new test file added, so no manifest edit was owed) |

No browser walk was owed: I touched no `.spec.ts` file under `apps/web/e2e` (work order rule 8
requires only the walks a lane touched).

### A real regression I caused, found, and fixed before reporting it

My first draft of `workRowKindLabel`'s doc-comment wrote `` `clara.staff_expense_claims.claimant_label` ``
by name. `apps/web/lib/work/staff-expense-claim.test.ts`'s pre-existing `purpose.four` cell does a
raw substring scan of `accounting-work-list.tsx`'s own source text and asserts it never contains
`"staff_expense_claim"` — a guard against a FIFTH surface inventing a fourth purpose value. My
mention was a table name in a comment, not a purpose literal, but the guard cannot tell the two
apart (by design: DECISIONS §1.7 wants it blunt). The whole-suite run's first pass caught this as
21 failures instead of the expected 20; I reworded the comment to say "the claim relation's own
`claimant_label` column" instead, re-ran `purpose.four` (green) and the whole suite (back to
exactly 20, all pre-existing) before committing. Recorded here rather than silently fixed, per
work order rule 6's evidence discipline.

### The typecheck red and the 20 unit-suite fails are inherited from the base

Identical to #839's own report: `apps/web/components/documents/document-kind-dialog.tsx(95,22):
error TS2552: Cannot find name 'DOCUMENT_KINDS'`. `git diff 23cfad94..HEAD --
apps/web/components/documents/document-kind-dialog.tsx` is empty. Already recorded as a follow-up
in `wave2-lane03-ticket846.md` ("blocks the typecheck gate for every wave-2 lane") and re-confirmed
independently in `wave2-lane09-ticket839.md`; not re-filed a third time.

## Docs, in the same commits

- **`packages/db/README.md`**: no new section added. Neither 0189 nor 0203 (the migrations this
  ticket recuts a third body-only widen of) has its own dedicated subsystem section — confirmed by
  `grep -n "^## \|^### "` finding no "Work list" heading at all — and a two-field additive splice
  to an already-documented internal projection does not meet that bar, matching 0203's and #839's
  own finding for the identical shape.
- **`CONTEXT.md`**: no new term added. `claim_id`/`claimant_label` are projected fields, not new
  domain vocabulary; "Accounting work" already covers the concept.
- **`packages/db/tests/rig-meta.mjs`**: `WORK_LIST_0189_COHORT`'s own descriptive comment was
  corrected to name the fourth source table (see "The migration" above) — a real fix, not a
  "nothing needed" finding.
- Shared files touched, minimally and at the sorted position: `packages/db/package.json` untouched
  (no preintegration-gate module added — see "The migration"); `apps/web/messages/en.json` (one
  new key, `WorkList.claimLabel`, at the sorted position beside `unknownClient`);
  `apps/web/test/manifest.txt` untouched (no new test FILE was added — every new cell lives in an
  already-listed file).

## Successor contract

**None is owed.** Neither door changed signature, `clara.get_work_claim_origin` is untouched, and
nothing here is a frozen chat or Work tool concern — this is a read-side list projection, not a
door a chat turn or a Work tool calls.

## Follow-ups worth filing

1. **No browser walk exercises the claim label on `/work`.** `apps/web/e2e/work-list-walk.spec.ts`
   exists but does not mount a claim row; adding one would need a claim fixture in
   `apps/web/e2e/work-list-mock.mjs` beyond this ticket's own scope (the brief's ACs are unit/db
   level, and #839 left e2e equally untouched for its own surface).
2. (Not mine to re-file — already tracked twice) `apps/web/components/documents/document-kind-dialog.tsx`'s
   `DOCUMENT_KINDS` typecheck break.

## Anything unverified

- **The hosted estate.** Nothing here is hosted evidence; hosted evidence is pending and not mine
  to claim.
- **A true from-scratch 0001→0266 chain.** Not run: RIG.md reserves one from-scratch chain per
  cluster for the integrator's own disposable cluster. 0266's own prestate and tail both ran on
  every apply here (the ordinary apply, and again inside the redo).
- **The real Playwright triple** (`https://127.0.0.1:3580` / `3581` / `3582`) was provisioned for
  this lane but never exercised — no `.spec.ts` file was touched, so no walk was owed (see
  "Gates").
