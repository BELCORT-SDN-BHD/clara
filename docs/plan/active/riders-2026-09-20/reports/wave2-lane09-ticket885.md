# Wave 2 · lane 09 · ticket #885 — A document correction retires the Work waiting on it

**Status: DONE.** Branch `riders/w2-lane09`, worktree `C:\Users\zhant\Desktop\clara-wt\659`,
database `127.0.0.1:55749/clara_l09`, Playwright triple `https://127.0.0.1:3580 / 3581 / 3582`.
Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

My commits (newest first):

```
4dc9acac4 docs(db): #885 migration 0268 states which authority path the restatement now has
b703e7ac8 fix(web): #885 spell the ticket reference without a hash in a test name
c0ce1b20e feat(web): #885 a question retired by a source correction says so, instead of "state changed"
48c9e6387 test(db): #885 the three carve-outs, the feed's successor link, and p646.question.version rewritten
63358cd19 feat(db): #885 a document-fact correction cancels and re-admits the Work parked on it
```

The three lane tickets before mine were already landed when I started
(`git log 23cfad94..HEAD` showed `9df3f0df5`, `83324cceb`, `857cf3cb8`, `4977e0b31`,
`805240358`, `2b207c268`, `cbf86d907`; `git status` was clean), and their migrations
0265/0266/0267 were applied (ledger at 232 files, top `0267_work_list_receipt_window`).
Working tree is clean at `4dc9acac4`.

## The contract I built against, and that it was still live

The newest Agent Brief is the **2026-09-18** comment on issue #885 ("A document-fact correction
cancels and re-runs any Work parked on a question about that document"), and the **owner's ruling
comment dated 2026-09-20** on the same issue confirms it and adds one implementation preference:

> build cancel plus supersede, as ruled on 2026-09-17 … Implementation preference recorded by the
> 2026-09-20 scan: wire the cancel-and-admit inside the correcting door's own transaction rather
> than in a new runtime consumer, so no frozen document-ingest closure is touched.

**Still live, measured on this branch before I changed anything:**

- `clara.revise_document_fact` (live body, `sha256(prosrc)` = `b89a01ba9b5f029435afa6dfd450144c
  cb8dcc9d29f24ec9c96495e999c09d29`, i.e. 0217's own, untouched by 0265/0266/0267) named
  `clara.accounting_work` nowhere.
- `clara.answer_work_question` (live body `15a82c080d102e61ebdead2280577072a87c21720375174e83c86a
  7198fb07a7`, 0200's) converged on status, question version, deadline, Work state and
  `basis_digest` — none of which a fact revision moves.
- The `p646.question.version` cell in `packages/db/tests/rig-docs-source-revision.test.mjs`
  asserted, in so many words, that answering at the pre-revision version **SUCCEEDS**.
- #658's `WorkKnowledgeDriftBanner` does not discharge it: it is fed by
  `clara.work_knowledge_drift`, keyed on `clara.knowledge_records.knowledge_version`, and
  `0217:53` states a fact revision writes nothing on `clara.knowledge_records`. (I did not touch
  it; the ruling says it stays as it is.)

## The seams I tested at (written before the first test)

The brief's "Key interfaces" are the seams, and I tested at those and no others:

1. **`clara.revise_document_fact(uuid,text,jsonb,int,text,text)`** — the correcting door. Driven
   as a bookkeeper (`humanQuery`), observed through its own receipt and then through the COMMITTED
   rows, never through the helpers it calls.
2. **`clara.answer_work_question(uuid,int,jsonb,text)`** — the human answer door; observed as
   `(errcode, detail.reason, detail.current)`.
3. **`clara.cancel_accounting_work` / `clara.restate_accounting_work`** — used, never recut;
   observed only through their effects (`clara.accounting_work.supersedes` / `superseded_by`, the
   question row, the `work.cancelled` domain event).
4. **The activity feed** — `clara.list_activity` (the human read door) plus `clara.domain_events`
   for ordering; this is AC4's `#840` surface at the level this branch can reach (lane 08 owns
   #840 itself and its commits are not on this branch).
5. **`convergeKeyFor`** in `apps/web/components/work/work-question-form.tsx` — the exported pure
   reducer the rendered card itself calls (`work-question-form.tsx:381`), so the cell drives the
   real decision rather than a copy of the switch.

No test at a seam the brief does not give: I did not touch `clara.list_source_dependents` (a read
whose job is to show a human *everything* standing on the document, including the rows this rule
deliberately leaves alone), `clara.open_work_question`, the `#658` drift banner, or any
`packages/runtime` body.

## Vertical slices, in order

Every slice was a real red → green cycle. For the two recut SQL bodies the "deliberately broken
subject" is the pre-image itself (work order rule 4's vacuity control), restored byte-for-byte
afterwards and re-measured by sha.

| # | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 | `w885.supersede.cancels` — first against no migration at all, then against 0217's own body: `the revision receipt carries the supersessions it performed / expected true, actual false` | migration 0268's three helpers + the `revise_document_fact` recut |
| 2 | `w885.answer.superseded` — with `answer_work_question` reverted to its pinned pre-image (sha re-measured at `15a82c08…` before the run): `…named SUPERSEDED, not 'cancelled' / expected 'superseded', actual 'cancelled'` | 0268's `answer_work_question` recut (restored; green) |
| 3 | `w885.unrelated.untouched` — green on the shipped rule, then proven non-vacuous by removing the document term from `clara._source_corrected_work`: RED | no new code; the term already shipped in slice 1 (control) |
| 4 | `w885.posted.untouched` — green, then proven non-vacuous by removing `clara._work_committed_receipt(w.id) is null`: RED with `this Work already posted; a correction is a separate, linked operation` | as above (control) |
| 5 | `w885.terminal_residue.ignored` — green, then proven non-vacuous by removing `w.status in ('queued','running','awaiting_input')`: RED with `a Work in status failed is not restatable` | as above (control) |
| 6 | `w885.feed.successor` — green, driven through `clara.list_activity` and `clara.domain_events` | as above (control; 0199's payload already carries the link) |
| 7 | `885 a SUPERSEDED convergence gets its own sentence…` — RED (`convergeKeyFor` returned the generic `convergeStateChanged`) | `superseded` on `CONVERGE_REASONS`, one `case` in `convergeKeyFor`, `WorkQuestion.convergeSuperseded` in `en.json` |

`p646.question.version` was rewritten in the same commit as slices 3–6.

## What I built

### Migration `0268_work_source_correction_supersede.sql` (995 lines)

**Three new, UNGRANTED bodies** (reachable only from inside `clara.revise_document_fact`, itself a
SECURITY DEFINER door; the tail re-reads each ACL grantor-included):

| Object | What it is |
|---|---|
| `clara._source_corrected_work(uuid,uuid) -> uuid[]` | **The ONE rule.** A Work of this firm that (a) still has a PENDING question, (b) names this document in its own `source_refs`, (c) holds NO committed receipt, (d) is in `queued`/`running`/`awaiting_input`. The write-side twin of `clara.list_source_dependents`' `work_questions` arm, narrowed by (c) and (d). |
| `clara._lock_source_corrected_work(uuid,uuid) -> uuid[]` | Takes `accounting_work → agent_tasks → agent_interruptions` (0193:248) row by row in id order, and returns exactly the ids it locked. |
| `clara._supersede_source_corrected_work(uuid,uuid,uuid[],uuid,uuid) -> jsonb` | Re-asks the ONE rule under those locks, intersects with what was locked, and calls `clara.restate_accounting_work` once per Work. Returns one `{work_id, new_work_id, task_id, reason:'source_corrected', revision_id}` per Work. |

**Two recuts**, each the live body verbatim plus exactly three additions (I generated both from the
LIVE `pg_proc.prosrc`, which I first proved byte-identical to 0217's and 0200's file texts, so the
verbatim halves cannot drift by transcription):

- `clara.revise_document_fact` — two declare variables; the lock call placed **above** the document
  lock; the supersede call with `superseded_work` on the receipt and on the audit row. 0217's own
  `document.fact_revised` event and its audit row swap places so the CAUSE is appended before the
  effects it causes and the audit row can name them.
- `clara.answer_work_question` — `aw.superseded_by` joins the Work select; `superseded_by` joins
  `detail.current`; and ONE new `reason` **value** on the status arm that already existed:
  `superseded`, on the narrow condition `i.status = 'cancelled' and w.superseded_by is not null`.
  Every other refusal 0180/0200 gave it is unmoved and `already_answered` still wins.

**The four supersession writes are not re-spelled.** `clara.restate_accounting_work` (0200 §E)
already is "admit the successor → stamp `supersedes` → stamp `superseded_by` on the old Work →
cancel it through its own door", and 0199's `cancel_accounting_work` already appends the single
`work.cancelled` event carrying `outcome = 'superseded'` and the successor's id. The tail refuses a
body that re-spells `admit_journal_work`, `cancel_accounting_work`, `set supersedes` or
`set superseded_by`.

**The replacement carries the same admitted basis, `basis_origin` and `source_refs`, verbatim** —
the instruction did not change, the document did — and is admitted `queued`, so the run that picks
it up reads the corrected reading from the top.

**The lock order** is why `clara.documents` is no longer this door's first lock: the journal lane
already takes `clara.documents` while holding the `accounting_work` rung
(`clara._lock_document_binding`, 0197:329, from BEFORE ROW triggers on `clara.journal_entries` and
`clara.entry_evidence_links`), so a correction that took `clara.documents` first and reached for a
Work row afterwards would be the opposite direction of that same edge. 0217's own document lock is
**not moved by one line**; it simply is no longer the first lock the body takes. The tail asserts
the order POSITIONALLY in the committed text (0197 §F's idiom), and also that the revision row is
written before the supersede and that `document.fact_revised` is appended before it.

**Fail-closed:** `restate_accounting_work`'s own typed refusals propagate and the WHOLE correction
refuses; nothing half-done commits. Proven incidentally by the slice-4 and slice-5 vacuity controls
(removing a filter turned the correction into `this Work already posted` / `a Work in status failed
is not restatable`).

**No new relation, event type or taxonomy row.** The tail asserts `work.cancelled` is registered
and that this file registered zero `work.source%` types.

#### Prestate pins (all MEASURED on `clara_l09` at 0001→0267 on 2026-09-20, off `pg_proc.prosrc`)

Recut pre-images (each admits EITHER the pinned sha OR a body already carrying this file's `#885`
marker — redo-tolerance per #957; a foreign drift still refuses):

| Body | pinned pre-image |
|---|---|
| `clara.revise_document_fact(uuid,text,jsonb,int,text,text)` | `b89a01ba9b5f029435afa6dfd450144ccb8dcc9d29f24ec9c96495e999c09d29` |
| `clara.answer_work_question(uuid,int,jsonb,text)` | `15a82c080d102e61ebdead2280577072a87c21720375174e83c86a7198fb07a7` |

Non-regression pins (asserted in §0 **and** re-read unchanged in §T):

| Body | pinned sha |
|---|---|
| `clara.restate_accounting_work(uuid,uuid,text,jsonb,text,jsonb,text,text)` | `d3c5cc932d8ff63eb1b19aad22d8c54a74bf5a6a90cbb4776cee3c1a53c5be90` |
| `clara.cancel_accounting_work(uuid,uuid,text)` | `27c7295b656c779aa80878e30e5113b3512ae773ce64ab64450f44c98eed871b` |
| `clara._work_committed_receipt(uuid)` | `82700a7c43b7c08d19f6293d774ae61e623c9a6222394e93ca4c04398930de0c` |
| `clara.list_source_dependents(uuid)` | `f385e7843522d089141cdf64ccd97024eff0c4d6e81e5430dea7ce732278433a` |

Post-state, measured after the final apply (ledger: **233 files**, top
`0268_work_source_correction_supersede`):

```
clara.revise_document_fact             6301df5a59c1bff40a0402a04c0a31b99e883132fd211c131b08a00b0e0fea7f
clara.answer_work_question             1e9c2956c2e41ce14c811f505f48f1b80aa941fc4ffdf55828599596e171eed3
clara._source_corrected_work           ba646c9f90c270e0024106c4add935feb65a39bc5f2cce15ff3d83cdc7458532
clara._lock_source_corrected_work      8ea81da175c1e4d81050ed35530e5c6c594e031a0a5ac83ded0910b9bd47a60d
clara._supersede_source_corrected_work 51e12d9f63ee61e81d71e494e40bc2604a2006a8a4440ea9e2951654b4cd0039
```

**Redo (#957) was used, twice, and both are recorded.** Once to prove the file is redo-safe as the
work order requires (`CLARA_MIGRATION_REDO=0268_work_source_correction_supersede` with
`CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`: the prestate printed
`already carries this file's splice -- this is a REDO (#957) … which create-or-replace makes safe`
for both bodies, and the tail passed), and once to apply the comment-only header addition in
`4dc9acac4` (new checksum `8bcce96f0eaa58415e16870cbfa6fe6df0aac5dffa54101a55aa1c77128cbb7e`).
Every object the file creates is a `create or replace function`; it creates no table, type, event
type or taxonomy row.

### Web

- `apps/web/lib/work/questions.ts` — `superseded` joins `CONVERGE_REASONS`. (`mapAnswerRefusal`
  already converged any unknown CLR13, so the refusal was never mis-*handled*; the SENTENCE was.)
- `apps/web/components/work/work-question-form.tsx` — `convergeKeyFor` gains
  `case "superseded": return "convergeSuperseded";` above the default.
- `apps/web/messages/en.json` — one key, `WorkQuestion.convergeSuperseded`: *"The source this
  question was asked about has been corrected, so this Work was replaced. A new Work is already
  running on the corrected figures and will ask again if it needs to."*

### Rig plumbing

- `packages/db/tests/work-source-correction-supersede-preintegration-gate.mjs` (stable stem
  `work_source_correction_supersede$`, env `CLARA_ALLOW_MISSING_WORK_SOURCE_CORRECTION`), mirroring
  `work-question-admitted-basis-preintegration-gate.mjs`.
- `packages/db/package.json` — that gate appended at the end of the chain (migration order); one
  minimal hunk on a shared file.
- `packages/db/tests/rig-meta.mjs` — a new bimodal cohort
  `WORK_SOURCE_CORRECTION_0268_COHORT` (the three ungranted names) plus its `cohortFailures` call
  beside #646's; the two recut doors are deliberately NOT listed (0268 touches neither name,
  signature nor grant, and a second listing of a name from an earlier frontier is the
  partial-cohort condition the gate exists to catch).

## Acceptance criteria

| AC (2026-09-18 brief, restated by the 2026-09-20 ruling) | verdict | evidence |
|---|---|---|
| A cell corrects a fact a pending question cites: the old Work is cancelled with `source_corrected`, a new Work is admitted with the corrected facts, and answering the old question is refused as superseded | **done** | `w885.supersede.cancels` — receipt `superseded_work[0] = {work_id, new_work_id, reason:'source_corrected'}`; old row `superseded_by` = successor and status `stopping`; new row `supersedes` = old, status `queued`, `basis` and `source_refs` deep-equal the old ones; question row `cancelled`. `w885.answer.superseded` — answering at version 1 raises `CLR13` / `detail.reason = 'superseded'` / `detail.current.superseded_by` = the successor. Both in `packages/db/tests/work-source-correction-supersede.test.mjs`. |
| A cell proves a correction on an unrelated document leaves the Work untouched | **done** | `w885.unrelated.untouched` — `superseded_work` is `[]`, the Work is still `awaiting_input` with `superseded_by` null and its question `pending`, **and the question is still answerable** (`answer_work_question` returns `status: 'answered'`). Non-vacuous: removing the document term from the finder turns it RED. |
| A cell proves a Work with a committed receipt is untouched | **done** | `w885.posted.untouched` — the Work posts through `wake_record_journal_entry` under a real `interactive_client` credential, then a correction of that same document returns `superseded_work: []`, leaves the status, `superseded_by` and the committed receipt byte-unchanged and admits no successor, **while the correction itself succeeds** (`facts_version` 2). MEASURED here and worth recording: posting from a *parked* Work leaves it `awaiting_input` with its question still `pending`, so the committed-receipt term is load-bearing on its own, not shadowed by the status term. Non-vacuous: removing that term turns it RED with `this Work already posted; a correction is a separate, linked operation`. |
| The activity feed shows the cancellation with its successor link (#840) | **done at the level this branch can reach** | `w885.feed.successor` — exactly one `work.cancelled` row for the retired Work (and exactly one new row in the firm), `payload.outcome = 'superseded'`, `payload.superseded_by` = the successor, `payload.from_status = 'awaiting_input'`, attributed to the correcting human; `clara.list_activity(kinds => ['work'])` lists it once with `kind = 'work'` and `work_id` = the retired Work; and its `seq` is **after** the `document.fact_revised` that caused it. #840 itself is lane 08's ticket and its commits are not on this branch, so what I prove is the event and the feed door, not lane 08's surface. |
| `p646.question.version` is rewritten to the new refusal, not deleted | **done** | `packages/db/tests/rig-docs-source-revision.test.mjs` — the cell is rewritten in place (the file still runs exactly 16 cells, `EXPECTED_CELLS` unchanged). With 0268 applied it asserts the ruling; below that frontier it keeps the pre-0268 measurement, because a `db-slice-frontiers` leg pinned between 0217 and 0268 really does have 0217's behaviour and calling that a failure would say nothing about the chain under test. Lane note from the run: `p646.question.version MEASURED (#885 lane live): the question is cancelled at version 1, its Work is stopping superseded by e7b64d29-1ae; answering at the pre-revision version refused CLR13/superseded.` |
| From-scratch apply; the Work question and source-revision suites green | **partial by name** | A from-scratch 0001→0268 chain is **not** something a lane may run (RIG.md: never a second from-scratch chain on a lane cluster; the integrator runs that proof on a disposable cluster). What I did prove on this rig: the file applies cleanly from the 232-file frontier, and it **re-applies** cleanly over its own effects through the supported redo mode. The suites are green — counts below. |

Two more cells beyond the brief, both properties of code I wrote:

- `w885.answer.superseded` part B — the **narrowness control**: a Work cancelled with NO successor
  still answers `cancelled` and `detail.current.superseded_by` is null. Without it the new arm
  would silently re-label every cancelled question.
- `w885.terminal_residue.ignored` — a pending question left on a TERMINAL Work is not restated and
  never turns a professional's correction into a refusal. The pair is unreachable through any door
  (every terminaliser closes pending questions), and the immutability trigger refuses
  `cancelled -> pending` even to the superuser (MEASURED: `illegal interruption transition
  cancelled -> pending`), so the row is PLANTED as a fresh sibling at version 2 — the cell says so
  and says why, the same idiom `work-cancel.test.mjs` wc.1 states for the mirror pair.

## Gates, with counts

| Gate | Command | Result |
|---|---|---|
| The two db test files I added/touched, with the FULL 52-module gate chain | `node --test --test-concurrency=1 $GATES tests/work-source-correction-supersede.test.mjs tests/rig-docs-source-revision.test.mjs` from `packages/db` | **22 tests · 22 pass · 0 fail · 0 skipped** (6 + 16) |
| Operation census (new SQL functions) | `node --test --test-concurrency=1 tests/operation-census.test.mjs` | **10 · 10 · 0 · 0** |
| Rig isolation (new SQL functions; **no** reset flags set) | `node --test --test-concurrency=1 tests/rig-isolation.test.mjs` | **23 · 22 · 0 · 1 skipped** — T19 poison-role, skipped by design (needs `CLARA_RIG_ALLOW_RESET`, which this rig forbids) |
| Typecheck | `pnpm typecheck` from the worktree root | apps/web **Done**, packages/runtime **Done** |
| Lint | `pnpm lint` from the worktree root | apps/web, packages/db, packages/runtime, packages/reporting-render all **Done** |
| WHOLE web unit suite (I touched `apps/web`) | `node scripts/run-tests.mjs` from `apps/web` | **4762 tests · 138 suites · 4760 pass · 0 fail · 2 skipped** (92.7 s). Both skips are pre-existing and environmental: the two live-provider auth cells that need `CLARA_LIVE_SUPABASE_AUTH_URL` / `..._ANON_KEY`. No Windows-only red appeared — `thread-live-clarify.test.tsx` did not flake on this run. |
| The two web files I touched, focused | `node --import ./test/bootstrap.mjs --import tsx --test …` | `components/work/work-question-form.test.tsx` **25 · 25 · 0**; `lib/work/questions.test.ts` **11 · 11 · 0** |
| Frozen-workflow manifest | `node scripts/check-frozen-workflows.mjs` | **OK — 312 frozen file(s) verified, 55 "use workflow" modules all frozen+registered, no manifest diff** |
| Browser walks | — | **None touched.** I edited no `apps/web/e2e/*.spec.ts`. My web change is a new switch case, a new roster entry and a new message key; the new branch fires only on a `detail.reason` no walk produces. `check-message-keys.mjs` (inside `pnpm lint`) covers the `en.json` addition. |

Migration applied with `pnpm db:migrate` (`PGHOST=127.0.0.1 PGPORT=55749 PGUSER=postgres
PGDATABASE=clara_l09 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`):
`applied 0268_work_source_correction_supersede · 233 total`.

## Docs, in the same commits

- **`packages/db/README.md`** — a new section, *"A source correction retires the Work waiting on it
  (#885, migration 0268)"*, immediately after the #646/0217 section: the three objects and the ONE
  rule; why the four supersession writes are not re-spelled; what the replacement carries and where
  the `source_corrected` reason is durable; the lock order and the ABBA it avoids; the fail-closed
  posture; the one new word on `answer_work_question`; the D1 write-quiesce owed for both recut
  bodies; and what is deliberately NOT covered (#676, `docs/PRD.md:123`/#658/#663,
  `list_source_dependents`). The last line of the #646 section now points forward to it.
- **`CONTEXT.md`** — the new term **Source-corrected work**, in the house "term / _Avoid_" shape,
  beside "Restated work / supersedes".
- Both recut SQL bodies and all three new ones carry `comment on function` and in-body prose at the
  point of use.

## Successor contract

**Nothing a frozen body must have for the ruling to hold.** I checked before writing anything:
`clara.answer_work_question` is granted to `clara_authenticated` only, so no frozen chat or Work
tool calls it — the only consumer is the web, which I updated. `clara.revise_document_fact` is
likewise `clara_authenticated` only. The retired run learns it is going away through the mechanism
it already has: `clara.cancel_accounting_work` sets `agent_tasks.status = 'cancel_requested'` and
`pg_notify('clara_runtime_ctl','')`, exactly as a human's "Cancel Work" press does. No frozen file
changed (`check-frozen-workflows.mjs` shows no manifest diff).

**One optional item for the shared `chatTurn_v22` / `claraWork_v6` cut at the end of wave 4**, so
the replacement run can say *why* it exists instead of starting mute:

- **Name:** `get_work_supersession`
- **Zod input:** `z.object({ workId: z.string().uuid() })`
- **Door call (argument order):** `clara.get_work_supersession(p_work => workId)` — a NEW read this
  ticket does **not** build (it would be a second migration, outside #885's scope). Until it
  exists, the same facts are already reachable without a new door:
  `clara.accounting_work.supersedes` / `superseded_by` (both SELECT-granted to `clara_runtime`) and
  the `work.cancelled` domain event's payload (`outcome`, `superseded_by`); the REASON is the
  predecessor's restatement op key and the successor's `intent_key`, both literally
  `source_corrected:<revision id>:<retired work id>`.
- **Refusal mapping:** `CLR11 work_not_found` → `refusal` (terminal, same class the existing Work
  reads use); no other refusal.
- **Part kind:** `work_supersession` — `{ kind: "work_supersession", work_id, supersedes,
  superseded_by, reason: "source_corrected" | "restated", revision_id | null }`.
- **Prompt stanza:** *"If this Work supersedes another one because a source document was corrected,
  open by saying so in one sentence — which document changed and that you are re-reading it — and
  do not re-ask a question the retired run already had an answer to unless the corrected figures
  make it a different question."*

The web side needs no successor contract: `reviseDocumentFact` in
`apps/web/lib/documents/doors.ts` casts the receipt (`as SourceRevisionResult`) with no runtime
parse, so the added `superseded_work` key is ignored by the current build and is available to the
next one.

## Follow-ups worth filing

1. **The revision dialog should say what it retired.** `clara.revise_document_fact`'s receipt now
   carries `superseded_work: [{work_id, new_work_id, task_id, reason, revision_id}]`, and
   `apps/web/components/documents/document-revision-dialog.tsx` shows nothing of it. A person who
   corrects a figure should be told, in the same breath, that N pieces of Work were replaced and be
   able to open the successor. Not in this ticket's ACs; small, and the data is already there.
2. **A non-journal Work parked on a question about a corrected document blocks the correction.**
   `clara.restate_accounting_work` refuses `purpose <> 'journal_entry'` (CLR10
   `not_restatable_purpose`), so a `periodic_stock_adjustment` or `payroll_obligation` Work parked
   on such a question would make the whole correction refuse with that typed reason. That is
   fail-closed and visible, not silent, but it is a real hole in the ruling's coverage: those Works
   are *not* retired, they simply stop the correction. Closing it means either a sibling
   restatement door for the adjustment lane or widening `restate_accounting_work` — both bigger
   than #885 and neither asked for. **No cell drives this arm** (see "unverified" below).
3. **A Work that becomes parked on the document *after* the lock is not superseded by that call.**
   Nothing in the estate serialises `clara.open_work_question` against a document row, so this is a
   property of the world at the moment of correction rather than something locking harder could
   fix. The migration header states it. If it ever matters, the fix is a rung on `clara.documents`
   inside `open_work_question`, which is a Work-lane ticket.
4. **`clara.list_source_dependents` still projects a Work this rule will retire.** It is a read and
   deliberately shows everything, but a surface built on it may want the same four-term rule as a
   flag (`will_be_retired: true`) so a human sees the consequence before pressing Revise.

## Anything unverified

- **From-scratch 0001→0268 apply.** Not run, and not runnable from a lane: RIG.md forbids a second
  from-scratch chain on a lane cluster (0154 pins the cluster-wide role count) and assigns that
  proof to the integrator on a disposable cluster. What I did prove is a clean apply from the
  232-file frontier and a clean **redo** over the file's own effects.
- **Follow-up 2's arm is unexercised.** No cell admits a `periodic_stock_adjustment` Work, parks it
  on a question citing a document and then corrects that document. I deliberately wrote no code for
  it either (the refusal is `restate_accounting_work`'s own, not mine), so the claim "the whole
  correction refuses with `not_restatable_purpose`" is read off that door's committed body, not
  measured end to end.
- **Concurrency is reasoned, not raced.** I did not build a two-session schedule proving that a
  correction and a posting transaction no longer deadlock. The lock-order argument is stated in the
  migration header and asserted POSITIONALLY in its tail (the Work rungs are taken before
  `clara.documents` in the committed body text), and the direction of the existing edge is read off
  0197's own trigger bodies — but no `pg_blocking_pids` cell measures the pair. `work-cancel`'s
  wc.11 is the nearest existing precedent for how such a cell would be built.
- **#840's surface.** AC4 is proven at the event and at `clara.list_activity`; lane 08 owns #840
  and its commits are not on this branch, so I cannot and do not claim anything about the rendered
  feed component it ships.
- **Browser walks.** None run — I touched no walk. The web change is additive on a code path no
  walk drives, but that is a reasoned claim, not a measured one.
- **The `superseded` word now also reaches a #721 restatement**, not only a source correction. I
  judge that correct (the reason a question was retired is the same in both cases) and
  `w885.answer.superseded` part B pins that a cancel with no successor is unaffected — but no cell
  drives a plain `restate_accounting_work` and then answers its question, so the #721 path is
  reasoned from the shared arm rather than measured.
