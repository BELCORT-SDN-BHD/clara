# Wave 2, lane 05 — ticket #965

Branch `riders/w2-lane05`, worktree `C:\Users\zhant\Desktop\clara-wt\655`, base
`23cfad947b5598214168ba9c43d391b4e16aa745`. HEAD `aa67d0ee84ec8142895f71cb05fa74fcad32891a`.

This ticket's commits (`git log 720d8a55c..HEAD`, on top of #964's four and #968's two, already
landed by the previous implementers):

```
aa67d0ee8 test(runtime): #965 the World leg's capacity wall now expects the member it used to assert absent
585e185ac docs: #965 the refused intake record, in the two module READMEs and CONTEXT
583805502 test(db): #965 the batch read shows a refused file as a capacity wait, never a silent absence
c13de347f feat(runtime): #965 a refused file inside an open batch is a waiting member, never a lost record
ceb62873a feat(runtime): #965 the creation door's caller handles the refusal as a returned outcome
0eb1f3650 test(db): #965 recut the two #636 cells that pinned the raising creation door
ce435d950 feat(db): #965 the refused record names its ceiling, firm, file and moment, and is audited
651b82f25 feat(db): #965 a ceiling refusal at intake creation commits its record instead of rolling it back
5bf39a346 test(db): #965 the at-creation ceiling refusal must leave a committed record, red against the rollback
```

## #965 — Decide whether a file refused by the daily ingest ceiling gets a durable record

**Status: done.**

Contract verified live on this branch via `gh api repos/BELCORT-SDN-BHD/clara/issues/965` and
`/comments`: the issue body (AI triage, the three options) plus ONE comment by `belcorttao` dated
`2026-09-19T19:47:44Z` carrying the **owner's ruling of 2026-09-20 (Option B)** and the newest —
and only — Agent Brief. That comment is the contract I built to.

Not already satisfied on this branch: measured on this lane's own rig (`clara_l05`, chain
0001→0253) before any change, `clara.create_document_intake`'s live body still read

```
  v_res := clara._reserve_document_ingest(v_firm,v_id,v_pages,p_expires_at);
```

with no exception arm, and a focused run of the new battery (gate temporarily bypassed) died on
`CLR18 document daily limit reached (docs)` at the second call — the raise rolling the freshly
inserted intake row back with the transaction, exactly the gap the ticket names.

### The seams tested (written down before the first test, per work order rule 4)

Taken from the Agent Brief's own "Key interfaces", all four are real public interfaces driven for
real — no prosrc reading was needed for behaviour this time (unlike #964's ungranted reservation
helpers), and no internal collaborator is touched:

1. **`clara.create_document_intake`** — the intake-creation door itself, a granted
   `SECURITY DEFINER` door (`clara_runtime` only). Driven through
   `roleQuery(ROLES.runtime, namedCall(...))` in `packages/db/tests/intake-refusal-record.test.mjs`.
2. **`clara.get_intake_batch`** — the batch read, a `SECURITY INVOKER` door reached through
   `humanQuery` under a real JWT, same file.
3. **`beginDocumentIntake(client, principal, input)`** — the runtime's only production caller of
   door 1, exported from `packages/runtime/lib/intake.mjs`. Driven against a stub connection and a
   real temp-dir spool in `packages/runtime/tests/intake-refusal-unit.test.mjs`.
4. **`beginIntakeInBatch({...})`** — the batch caller, exported from
   `packages/runtime/lib/intake-batches.mjs`, same file.

A fifth, `mapIntakeError(err)` (also exported from `lib/intake.mjs`), is the function
`sendError` actually calls, and is the seam at which "the uploader's message is unchanged" is
proved without a live HTTP server.

**Prosrc reading appears in exactly one place** and only where this repo's own documented standard
asks for it: migration 0254's §0 prestate pin and §T tail assertions (the house change-of-record
shape 0234/0252/0253 use), plus the recut census pin in `p636.census.no_recut`. Stated per rule 4's
"where this repo's own documented standard asks for a structural cell, that standard wins and you
say so".

### Acceptance criteria, each with its evidence

- [x] **Every file refused at intake creation by the daily ceiling leaves a committed record,
      distinguishable from a successful intake and not rolled back with the attempt.**
  Evidence: `p965.refusal.docs_ceiling_commits_a_record`
  (`packages/db/tests/intake-refusal-record.test.mjs`) — the second call on a firm whose
  `docs_per_day` is 1 returns `{refused:true, status:"failed", failure_code:"limit",
  reservation_id:null}` and **does not raise**; the row is then read back on a *different pooled
  connection* (`rootQuery`, and `roleQuery` is autocommit — `rig-helpers.mjs:120` opens no
  transaction unless asked), which is the strongest available proof that the door's own
  transaction committed it. The admitted sibling is asserted still `uploading`, and the refused
  intake is asserted to hold **zero** reservations — it is a record OF a refusal, not an admitted
  file. **PASS**. Confirmed **RED first**: the identical cell died on `CLR18` against the
  pre-migration body.
- [x] **The record captures the firm, enough to identify the attempted file, the timestamp, and
      which ceiling was hit.**
  Evidence: `p965.refusal.record_names_the_docs_ceiling_firm_file_and_moment` — the returned
  outcome carries `firm_id`, `filename`, `refused_at` (asserted inside the window the cell itself
  bracketed), `ceiling: "documents"` and the database's own sentence verbatim; the committed row
  carries `firm_id`, `original_filename`, `declared_mime`, `declared_bytes`, `created_at`. **PASS**
  (red first: `ceiling` came back `undefined`).
  `p965.refusal.pages_ceiling_is_named_apart_from_the_docs_ceiling` proves the two ceilings are
  distinguished, not collapsed: a firm with `pages_per_day` 10 admits one ≤1MB PDF (10 pages, the
  ladder's second rung) and the next is refused with `ceiling: "pages"` and
  `/document daily limit reached \(pages\)/`. **PASS**.
- [x] **It lands at the lane's existing failed status with its existing limit failure reason, not a
      new vocabulary.**
  Evidence: the same two cells assert `status='failed'` / `failure_code='limit'` on the committed
  row and in the outcome. Structurally: `uploading → failed` is `_tf_document_intake_update`'s
  first legal transition and `limit` is already one of the nine values in
  `document_intakes_failure_code_check`; migration 0254 adds **no** column, table, status or
  failure code, and §T asserts the exact update text. `ceiling` is a detail of the returned outcome
  and the audit row, never a second failure vocabulary (asserted by the pages cell's own
  `failure_code === "limit"` line).
- [x] **The message the uploader sees is unchanged in wording and timing.**
  Evidence: `p965.runtime.uploader_answer_unchanged`
  (`packages/runtime/tests/intake-refusal-unit.test.mjs`) — `mapIntakeError(intakeLimitRefusal())`
  is asserted `deepEqual` to `mapIntakeError(<a raised CLR18 error>)`, and both to
  `{status: 429, code: "limit", message: "intake limit reached"}`. That is the function
  `sendError` calls, so the wire answer is byte-identical. **PASS**. Timing: the throw is minted in
  the same route handler, in the same request, immediately after `withRuntime` returns — see
  `packages/runtime/src/intakeRoutes.ts`, the one added line inside the existing `try`.
  `mapIntakeError`'s own `CLR18 → 429` arm is left exactly where it was, because the *post-custody*
  resize refusal still raises and still maps there.
- [x] **The accepted-file path gains no new commit ordering, latency or failure mode.**
  Evidence: the splice wraps the ONE reservation call and nothing else; the insert, the audit and
  the `_finish_op` return are byte-unchanged and in the same order (proved by migration 0254's
  reverse-substitution: substituting the two replacements back reproduces the pinned pre-image sha
  exactly, so nothing else in the body moved). Behaviourally:
  `p965.runtime.begin_still_admits` is the control — an admitted receipt still mints an upload
  token and an expiry and still writes its sidecar; `p965.refusal.docs_ceiling_commits_a_record`
  asserts the first (admitted) file is untouched; `intake-db.test.mjs` **12/12 PASS** against a
  real database exercising the whole admitted transport. The one honest cost is stated rather than
  hidden: the accepted path now takes the exception block's **implicit savepoint** — no extra
  commit, no extra statement, no new refusal (see "Anything unverified").
- [x] **Every existing caller of the creation door handles the new refusal shape; none silently
      mishandles it.**
  Evidence: the callers were enumerated, not assumed. In SQL, the only `pg_proc` bodies mentioning
  the door are the door itself and `clara.open_intake_batch` — and in the latter it is a **prose
  comment** ("this door raises NO CLR18", 0229:685-696), not a call. In the repo, the only
  production callers are `beginDocumentIntake` (`packages/runtime/lib/intake.mjs`) and
  `beginIntakeInBatch` (`packages/runtime/lib/intake-batches.mjs`), both reached from
  `POST /api/intake/documents`; `apps/web` names the door only in a comment
  (`apps/web/lib/documents/intake-batch-doors.ts:4`). Both callers are proved:
  `p965.runtime.begin_returns_the_refusal` (the outcome is returned, no capability is minted, and
  — asserted through spool.mjs's own `readIntakeMeta` against a temp `CLARA_SPOOL_DIR`— **no
  sidecar is written**, so `recoverPendingDocumentIntakes` can never re-drive a refused intake) and
  the two batch cells below. **PASS**.
- [x] **A refused file uploaded into an open batch either reaches the batch read as a capacity wait
      or is stated as not a member; the batch read never shows a silent absence.**
  It reaches the read as a capacity **wait**. Evidence, end to end against real doors:
  `p965.refusal.batch_read_shows_a_capacity_wait_never_a_silent_absence` opens a real batch, fills
  the ceiling, takes the refusal, attaches through `clara.attach_intake_to_batch`, declares
  `awaiting_capacity` through `clara.set_intake_batch_member_dependency`, then calls
  `clara.get_intake_batch` through `humanQuery` and asserts the refused file is **present** in
  `facets.waiting.rows` by its uploaded filename, with `intake_status:'failed'`,
  `intake_failure_code:'limit'`, `dependency:'awaiting_capacity'` and the database's own sentence
  in `dependency_reason`; counted on **both** waiting bases
  (`waiting_basis.by_dependency.awaiting_capacity === 1` and `by_capacity_failure === 1`) and on
  **neither** failed one (`facets.failed.count === 0` — 0229's D4, "a quota block is WAITING, not
  dead"). **PASS**, red first.
  The runtime half that puts it there: `p965.runtime.refused_in_batch_is_a_waiting_member` (the
  transaction **commits**, never rolls back, and both governed doors are called) and
  `p965.runtime.refused_in_batch_keeps_the_record_when_the_batch_refuses` (a batch that closed
  between upload and refusal costs the *membership* — `member_id`/`dependency` come back null —
  and never the record, because every door call in that path sits under a SAVEPOINT).

### The Agent Brief's third key interface, answered explicitly

> "The batch-member capacity belt does not pick this up for free: it observes a failure-reason
> transition on an intake that already exists, so a record born refused does not move it."

Confirmed by reading the live trigger body: `clara._tf_intake_batch_member_intake_stamp` arm (b)
opens with `select … from clara.intake_batch_members b where b.intake_id = new.id; if not found
then return null; end if;`. At the moment the door writes `failure_code='limit'` the member cannot
exist yet — a member's identity IS its intake, so the attach can only follow the intake's own
insert. The arm therefore returns without acting, and the wait is declared **explicitly**, through
`clara.set_intake_batch_member_dependency` — the governed member-dependency path the brief names,
and the same door `recordCapacityWait` already uses for the post-custody refusal, carrying the same
verbatim reason. The belt is left in place untouched, as 0229's own belt for the day the database
raises `limit` on an intake that already has a member.

### Out of scope — confirmed untouched

- **The ceiling values, the reservation check and its time window.** `_reserve_document_ingest`,
  `_resize_document_reservation`, `_settle_document_reservation` and `clara.firm_document_limits`
  are named by **no DDL** in migration 0254; §T (T4) re-reads the reserve helper's live prosrc and
  asserts both CLR18 sentences and #964's `Asia/Kuala_Lumpur` window clause are still exactly where
  0252 left them. The two test firms use a per-firm `clara.firm_document_limits` row (labelled
  fixture DML on firms this file creates), never a change to the shipped 100/1000 defaults — which
  `p636.batch.capacity_refusal` still proves flush at a hundred ≤1MB PDFs.
- **Reconstructing refusals from before this record existed.** Not attempted.
- **A firm-facing UI to browse refused files.** No `apps/web` file is touched by any commit of this
  ticket (`git log 23cfad94..HEAD --name-only` shows the only `apps/web` entries belong to #964).
  See Follow-ups #2 for a consequence worth knowing about.

## Migration

`packages/db/migrations/0254_intake_refusal_record.sql` — one new file, at the number reserved.

**Prestate pin** (MEASURED on `clara_l05`, chain 0001→0253, PG 17.11, 2026-09-20, via
`encode(sha256(convert_to(prosrc,'UTF8')),'hex')` keyed by `to_regprocedure`, never transcribed
from file text — neither #964's 0252 nor #968's 0253 touched this function):

| signature | sha256(prosrc) before | sha256(prosrc) after |
|---|---|---|
| `clara.create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamptz,text)` | `09784b31f65ee230d2cf2e25426d43e6d529f1a5476468d96c4ef486a5c92e9d` | `813b886a2015f32788ca509d7f89d8e9b5a5077d415ebaa95f8f8b0ec5291b8b` |

The "before" pin is byte-identical to the one 0229 itself recorded for the same OID
(0229:157 and 0229:1604) — the body had not moved since 0007.

House shape followed throughout: header; §0 prestate DO block (accepts either the pinned pre-image
or this file's own already-landed target); one §A splice DO block with **two non-overlapping
anchors** in the one body (the `declare` line, and the single `_reserve_document_ingest` call),
each measured to occur exactly **once** before splicing (anchor spans 72 and 76 characters,
occurrence count asserted `= 1`), the `AS $function$` boundary check, the splice, the landed-target
check, and the **reverse substitution** proving the result maps back to the pinned pre-image sha;
a fresh `comment on function`; and a §T tail re-reading the committed catalog:

- **T1** the CLR18 arm is present, scoped to `sqlstate 'CLR18'` alone, and commits at
  `status='failed', failure_code='limit'` with `'refused',true` in the outcome;
- **T1b** the outcome names its ceiling, firm, file and moment (`get stacked diagnostics`,
  `position('(pages)' in v_reason)`, `'firm_id',v_firm,'filename',p_filename,'refused_at',v_at`)
  and there are exactly **two** `clara._audit(` calls — the admission's and the refusal's;
- **T2** exactly **one** `_reserve_document_ingest` call remains, i.e. the splice wrapped the call
  rather than duplicating it or leaving an unguarded second one;
- **T3** the ACL is byte-identical to `{clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner}`;
- **T4** the reservation check and #964's MYT window are untouched;
- **T5** `clara.get_intake_batch` still classifies a `limit` member as WAITING and excludes it from
  FAILED — the fact this migration *relies on* instead of editing.

**Preintegration gate module with a stable stem:**
`packages/db/tests/intake-refusal-record-preintegration-gate.mjs`, stem `intake_refusal_record$`,
env `CLARA_ALLOW_MISSING_INTAKE_REFUSAL_RECORD`. **Gate-chain entry in migration order**:
`packages/db/package.json`'s `test` script, appended after
`document-ingest-window-myt-preintegration-gate.mjs`; the chain goes 51 → **52** entries.

**No rig-meta cohort.** No function is added, removed or regranted — this file's only DDL is one
`create or replace function` on an existing signature plus its comment, and §T re-verifies the ACL
byte-identical to what §0 measured. `operation-census.test.mjs` / `rig-isolation.test.mjs` have
nothing new to track; both were run anyway because `packages/db/tests` was touched.

**Redo (#957), used twice and recorded.** `CLARA_MIGRATION_REDO=0254_intake_refusal_record` was run
for real twice, each time after restoring the pinned 0007 pre-image body on the lane rig (a rig
operation, executing the `pg_get_functiondef` text captured before any change — the restore was
verified to reproduce sha `09784b31…` exactly each time), so the splice ran against the same
pre-image it pins rather than over its own prior effect: once to land slice 2's richer outcome, and
once to restore the migration after the deliberate red-proof for the batch-read cell. Final ledger
state verified clean: a plain `pnpm db:migrate` afterwards reports
`0 new migration(s) applied · 232 total`, i.e. no checksum drift between the committed file and the
applied row.

## Gates, with counts

Run from the worktree, Node 22, on lane 05's rig (`127.0.0.1:55745` / `clara_l05`).

- **`intake-refusal-record.test.mjs` (new) + `intake-batch.test.mjs` (touched)**, together, with
  the package's **full 51-entry preintegration-gate chain in the FOCUSED shape** (every gate except
  this ticket's own, so the new file fails loudly rather than skipping): **40/40 PASS, 0 skipped**
  — 4 new `p965.refusal.*` cells and 36 in `intake-batch.test.mjs` (including the two recut ones
  and #968's four).
- **`operation-census.test.mjs`** (full chain): **10/10 PASS**.
- **`rig-isolation.test.mjs`** (full chain): **22/23 PASS, 1 skipped** — T19, the destructive
  role-reset drill, correctly skipped with `CLARA_RIG_ALLOW_RESET` / `CLARA_RIG_ALLOW_ROLE_SWEEP`
  deliberately unset per RIG.md. **Never run with the reset flags.**
- **`packages/runtime/tests/intake-refusal-unit.test.mjs` (new)**: **5/5 PASS**.
- **`packages/runtime/tests/intake-batch-unit.test.mjs`** (the touched module's own battery,
  regression): **14/14 PASS**.
- **`packages/runtime/tests/intake-recovery-unit.test.mjs`** (imports the touched
  `beginDocumentIntake`): **10/10 PASS**.
- **`packages/runtime/tests/intake-db.test.mjs`** (the touched `beginDocumentIntake` against a REAL
  database): **12/12 PASS**.
- **`packages/runtime/tests/intake-unit.test.mjs`** (the shipped intake router's own battery):
  **16/17 PASS, 1 FAIL** — `scanner rejects EICAR, encrypted PDF, and XML entity expansion`, which
  is the **known Windows-only red named in RIG.md** ("the Defender/EICAR skip"): the failure is
  `Error: UNKNOWN: unknown error, open '…\clara-intake-*\eicar.bin'`, Defender quarantining the
  fixture between the write and the read. It exercises `lib/scan.mjs`, which this ticket does not
  touch. Reported as a known red, not "fixed".
- **`node scripts/check-frozen-workflows.mjs`**: **OK** — 312 frozen files verified, **no manifest
  diff**.
- **`node packages/runtime/scripts/check-parts-parity.mjs`**: **OK, exit 0**.
- **`pnpm typecheck`** (repo root): `packages/runtime` **Done (pass)** — the half this ticket
  changes; `packages/db` has no typecheck script; `apps/web` **FAILS** on the same pre-existing,
  unrelated defect #964's and #968's reports already recorded
  (`components/documents/document-kind-dialog.tsx:95`, `TS2552` undefined `DOCUMENT_KINDS` +
  `TS7006`). Re-confirmed not mine:
  `git log 23cfad94..HEAD -- apps/web/components/documents/document-kind-dialog.tsx` is **empty**.
- **`pnpm lint`** (whole monorepo, run to completion twice — once mid-work, once as the final gate
  after every edit): **PASS, exit 0** both times.
  `wiki-dynamic-sql: OK — 1410 clara function definition(s) and 218 change-of-record patch(es)
  scanned, no dynamic wiki SQL outside the whitelist; 19 justified dynamic-SQL waiver(s)`
  (18 pre-existing + the one this ticket adds). `freeze-lint: OK`. `evaluator-freeze-lint: OK`.
- **`apps/web`**: **not touched** by any commit of this ticket, so rule 8's whole-unit-suite run and
  browser walks do not apply and none was run. (The pre-existing `next build` breakage that blocked
  #964's walk is therefore not on this ticket's path at all.)

**One lint finding this ticket had to answer**, since the CoR-patch idiom is unprovable by
construction: `scripts/wiki-lint-checks.mjs` gains ONE new `DYNAMIC_SQL_ALLOWLIST` entry for
`create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamp with time zone,text)`,
declaring the exact `clara.*` token set the LIVE installed body was measured to contain
(`_audit, _declared_page_ceiling, _finish_op, _hash, _reserve_document_ingest, _reserve_op,
role_rank` as calls; `chat_sessions, document_intakes, firm_memberships` as relations; measured
with the identical regex `claraTargets()` uses, and the body independently confirmed to carry no
word-bounded "wiki" token at all). The paired ratchet in
`scripts/check-wiki-dynamic-sql.selftest.mjs` ticks **18 → 19** pinned keys.

## Docs updated (same commits)

- `CONTEXT.md` — new entry **"Refused intake record"**, in the house `term` / `_Avoid_` shape,
  beside "Member dependency" and #968's "Batch cancellation re-issue".
- `packages/db/README.md` — the #636/#964/#968 capacity section gains the #965 paragraph: what 0254
  changes and why the insert survives, why the accepted path keeps its statement order, why there
  is no new column/table/vocabulary, why `get_intake_batch` needed no edit, and why 0229's belt
  still cannot declare the wait.
- `packages/runtime/README.md` — the capacity-wait section gains the at-CREATION half: the returned
  outcome, the unchanged 429, the no-sidecar rule, and the savepoints that keep the record when a
  closed batch refuses the membership.
- `packages/db/migrations/0254_intake_refusal_record.sql` — its own extensive header.
- `scripts/wiki-lint-checks.mjs` / `scripts/check-wiki-dynamic-sql.selftest.mjs` — the new waiver
  entry and the ratchet's own ledger comment, in the house style.

## Successor contract

**None needed.** Nothing this ticket changes is inside a frozen closure, and no frozen chat or Work
tool calls the door:

- `clara.create_document_intake` is an ordinary `SECURITY DEFINER` SQL door granted to
  `clara_runtime` only (ACL re-verified byte-identical by 0254 §T3). No workflow body calls it; the
  runtime HTTP route does, before any turn exists.
- The three code files changed — `packages/runtime/lib/intake.mjs`,
  `packages/runtime/lib/intake-batches.mjs`, `packages/runtime/src/intakeRoutes.ts` — are all
  **outside** the frozen closure (`lib/intake-batches.mjs`'s own header records the measurement, and
  `node scripts/check-frozen-workflows.mjs` ran clean with **no manifest diff** after every commit).
- `check-parts-parity.mjs` is clean: no part kind is added, changed or newly emitted, so no prompt
  stanza, no zod input and no new door call belongs in `chatTurn_v22` / `claraWork_v6`.

If a future frozen-tool cut ever wants to *surface* refused files to Clara, the shape is already
readable with no new door: `clara.document_intakes_visible` rows with
`status='failed' and failure_code='limit'`, and — for a file that was in a batch —
`clara.get_intake_batch`'s existing `facets.waiting.rows` entries carrying
`dependency='awaiting_capacity'`. That is an observation, not a contract this ticket is asking
anyone to cut.

## Follow-ups worth filing

1. **Pre-existing, unrelated, now confirmed by a third ticket in a row.**
   `apps/web/components/documents/document-kind-dialog.tsx:95` references an undefined
   `DOCUMENT_KINDS` (only `CLASSIFIABLE_DOCUMENT_KINDS` is imported). It fails `pnpm typecheck` for
   `apps/web`, fails `next build`'s TypeScript check, and therefore blocks **every** e2e browser
   walk on every lane cut from `23cfad94…`. One-line fix, but plausibly blocking several lanes at
   once, so it wants an orchestrator-level fix or one assigned ticket rather than N lanes racing the
   same patch. Not fixed here (work order rule 5).
2. **A consequence of #965 worth knowing about, deliberately not acted on.** The refused record is
   a row of `clara.document_intakes_visible`, which the Documents tab's upload-receipt list already
   reads (`apps/web/lib/documents/receipts.ts:106`, `INTAKE_RECEIPT_COLS` includes `status` and
   `failure_code`). The surface already renders failed intakes with their failure code
   (`components/documents/intake-receipts.tsx:152`, `lib/documents/useUploadQueue.ts:310`), so a
   refused file will now appear there as `failed` / `limit` with **no web change and no crash
   risk** — failed intakes already exist on that surface for `bad_type`, `storage_error` and the
   rest. This is consistent with the ticket ("a quota block stays a wait, never a silent loss") and
   is *not* the firm-facing "browse refused files" UI the ticket puts out of scope. Worth a
   deliberate design pass at some point (should a quota refusal read as "failed" on the upload
   list, or as "waiting for tomorrow"?), which is #635's territory, not this ticket's.
3. **`p636.batch.sweep_settles` starves on accumulated `cancelling` debris** — re-confirmed, and it
   bit this session. The cell's fixed `sweep(20)` picks the twenty oldest `cancelling` batches, and
   `p636.batch.cancel_blocked_after_revocation` deliberately leaves one permanently-blocked
   `cancelling` batch behind on **every** run of the file. Past twenty accumulated, the cell's own
   parent never reaches the worklist and it reds with "the cancelling parent is on the worklist" —
   a fixture fragility, not a defect in the sweep. #964's report flagged it; it recurred here after
   four runs of the file. Worth either scoping the cell's sweep to its own firm or having the file
   retire its own debris in `after`.

## Anything unverified

- **`packages/runtime/tests/intake-batch-e2e.mjs` leg 5 was recut but NOT dynamically re-run.** Its
  assertion `wallMembers === 0` recorded, as a named residual, exactly the absence this ticket
  closes ("a file refused BEFORE its intake exists never becomes a member"). It now asserts the one
  member the refusal leaves, by its intake status, failure code, dependency and reason; the 429 and
  its `limit` error code above it are byte-unchanged. The leg is a standalone script (not collected
  by `node --test`) needing a bootstrapped World and a live spawned engine over ~100 real HTTP
  admissions, and RIG.md forbids bootstrapping a World on a lane database (it makes
  `rig-isolation` T10b red afterwards, #866). The same fact is proved at the DB layer by
  `p965.refusal.batch_read_shows_a_capacity_wait_never_a_silent_absence` and at the runtime layer
  by `p965.runtime.refused_in_batch_is_a_waiting_member`. #964 recorded the same limitation for its
  own edit to this same file.
- **The route's one added line is verified by inspection plus the `mapIntakeError` equivalence
  cell, not by a live HTTP request.** `POST /api/intake/documents` cannot be driven through
  `intake-unit.test.mjs`'s `requestThroughShippedIntakeRouter` harness on this path because the
  handler reaches `withRuntime` and `authenticate`, neither of which is injectable — the harness
  only reaches the parser/error-middleware paths. What *is* proved is the part that could silently
  differ: the uploader's answer (`p965.runtime.uploader_answer_unchanged`) and both begin callers'
  returned shapes.
- **The accepted path's implicit savepoint is a real, stated cost.** A plpgsql block with an
  `exception` clause takes a subtransaction on every call, including successful ones, and the
  reservation insert inside it allocates one subxid per admitted intake. Each
  `create_document_intake` is its own transaction (or, in the batch path, shares one with a single
  attach), so this is one subxid per call and nowhere near the 64-subxid suboverflow threshold. It
  is not measured as a latency number here — no throughput measurement was taken — but it adds no
  commit, no statement and no new failure mode, which is what the acceptance criterion asks.
- **The ceiling is classified from the reserve helper's own message text**
  (`position('(pages)' in v_reason)` over `get stacked diagnostics … message_text`), not from a
  structured `detail`, because adding one would mean editing `_reserve_document_ingest` — this
  ticket's own out-of-scope line. The coupling is pinned in two places: migration 0254 §T4 asserts
  both sentences are byte-present in the live helper at apply time, and
  `p965.refusal.pages_ceiling_is_named_apart_from_the_docs_ceiling` /
  `…record_names_the_docs_ceiling…` assert the classification behaviourally on every test run. A
  future recut of those two sentences would red the tests, not pass silently.
- **Lane-database housekeeping, disclosed for the record.** Four runs of `intake-batch.test.mjs`
  during this ticket accumulated 42 batches stuck in `state='cancelling'` (follow-up #3), which
  starved `p636.batch.sweep_settles`. I retired them on `clara_l05` with a narrow, labelled update
  — `update clara.intake_batches set state='cancelled', cancelled_at=coalesce(cancelled_at, now())
  where state='cancelling'` — which touches no append-only table and deletes nothing (a gentler fix
  than the delete-and-disable-triggers cleanup #964's implementer performed for the same debris).
  Verified afterwards: zero `cancelling` batches, and the battery is **40/40** again. The lane
  database is left tidy for the integrator.
- **The shared scratchpad directory is shared between lanes.** A sibling lane overwrote a helper
  script I had written there (`q.mjs`, re-pointed at port 55744 / `clara_l04`); it failed loudly
  with `ERR_MODULE_NOT_FOUND` rather than silently reading the wrong database, and every
  measurement in this report was taken before that and re-verified after, from a lane-private
  subdirectory. Flagging it so the orchestrator knows the scratchpad is not lane-isolated.
