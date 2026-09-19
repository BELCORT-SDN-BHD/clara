# #636 — fix round 1

**Branch** `impl/636-work-batch` · **worktree** `C:\Users\zhant\Desktop\clara-wt\636` · **HEAD before** `23e6e687` ·
**HEAD after** `88b5fb44` (three commits) · tree clean, nothing pushed, no PR.

```
88b5fb44 test(runtime,web): #636 the World leg's bound is over UPLOADED children, and the walk stops asserting a Chinese string
225c400e test(web): #636 the keyboard cell asserted the inversion it should have caught
4b556649 fix(db,web,runtime): #636 fix round 1 — the terminal flip, the failed facet, the blocked stop, and the reverse row
```

Thirteen findings across three lenses (spec 2, STANDARDS 2, adversarial 9) — **twelve distinct defects**, because
V636R-1 and ADV-636-02 are the same one found twice. **All thirteen were acted on and every repair is red-first.**
Within four of them a specific sub-recommendation was **deliberately left**, each with a measurement; and **four
items are raised for ratification** because applying them changed, or would change, what the brief specifies.

Nothing here was left unaddressed, and nothing was marked "fixed" on the strength of a reading: every repair carries
a cell that failed against the shipped build and passes against the new one. Where the cell is new, the **Red** line
names the run that failed; where a reviewer's own measurement was the red, it is quoted beside the number I
re-measured on this rig.

---

## Applied

### V636R-1 (spec, blocker) + ADV-636-02 (adversarial, major) — the same defect: `failed` counted children that had posted

**What I did.** `clara.get_intake_batch`'s `failed` facet now (i) excludes any member holding a **committed
`operation_receipts` row** outright, and (ii) reads only the **current attempt per lane**
(`distinct on (tv.lane) … order by tv.lane, tv.version_n desc, tv.updated_at desc`) rather than "any task row with an
`error_code`". A retry is a new row (`unique (document_id, engine_id, version_n)`, `0007:169`) and a terminally-failed
row is immutable (`0051`'s header), so the old predicate made one bad attempt permanent.
`packages/db/migrations/0229_intake_batches.sql` — the count and the preview arms both.

**Why `lane` and not `engine_id`.** The read goes through `clara.document_processing_tasks_visible`, whose columns are
the human-facing ones (`0007:2238`); `engine_id` is not among them. My first attempt used `engine_id` and the cell
failed `column tv.engine_id does not exist` — which is itself the evidence that the read never touches the base table.

**Evidence.**
- Red: the old predicate, run against the new cell's own fixture on `clara_636` — `old_failed_predicate = 2` of 2
  members, `new_failed_predicate = 1`. The member that had posted was counted as failed by the shipped code.
- Red (the reviewer's, re-measured by me on this rig before the repair): batch `0ac00d27-80ee-40a0-ac5c-c4b5fc24bb9b`
  — `members 100, settled_members 95, any_task_error 34, both 31`. Estate-wide the same query found the overlap in
  five batches. All 31 carried exactly one task row: `lane=ocr, status=failed, error_code=engine_error, version_n=1`.
- Green: `p636.batch.failed_excludes_settled` (new) — a member with a failed extraction **and** a committed receipt is
  `settled 1 / failed 0` and absent from the failed preview; a sibling that failed extraction and has **not** posted is
  `failed 1` and its row names `engine_error`.
- Green: `apps/web/components/documents/intake-batch-card.test.tsx` — "a child that POSTED is rendered as committed,
  never as a failure".

### ADV-636-01 (adversarial, blocker) — a batch stopped before its files became Work reported `cancelled` and stopped nothing

**What I did.** A new ungranted helper `clara._intake_batch_pending_members(p_batch)` returns the members that hold
**no Work yet and can still acquire one**: the intake is still arriving
(`status in ('uploading','received','verifying','verified')`) or the document still has a
`queued`/`held_egress`/`running` processing task. **Both** `cancel_intake_batch` and
`sweep_intake_batch_cancellations` now require live children **and** pending members to be empty before writing
`cancelled`. The decision returns `pending_members`, the sweep returns it per parent, and `get_intake_batch` reports
it so the surface can too.

**Why this is bounded.** Both arms terminate by construction — an intake leaves those four statuses for a terminal one
(`0007:109-111`) or expires, and a task leaves `queued/held_egress/running` for `done`/`failed` (`0007:156-157`, with
`clara.release_held_document_tasks` draining the held rung). A member merely sitting in custody with **nothing
running** is deliberately **not** pending: a Work another lane admits for it afterwards is that lane's own new
decision, taken after the stop, and the batch has no standing to cancel it. That is the line I drew, and it is stated
on the surface and here rather than left implicit.

**A bug the red cell caught inside the fix.** My first version named the returned key `pending`.
`clara._reserve_op` returns `{"pending": true}` for a reserved-but-unfinished key and the door tests
`v_dedupe ? 'pending'` — **key existence**. So a stored result carrying that key made every replay raise CLR13
`operation_in_flight`: `p636.batch.cancel_keeps_receipts` went red on the replay leg. Renamed `pending_members`, with
the reason written into the migration beside it.

**Evidence.**
- Red (mine, on the shipped build): `p636.batch.cancel_before_admission` failed at
  `decision.pending_members … undefined !== 2`, and the parent flipped to `cancelled` with an empty child list.
- Red (the reviewer's, quoted): two custody members, no Work → `{"state":"cancelled","children":[]}`; a Work admitted
  afterwards was stamped onto the cancelled batch; `sweep_intake_batch_cancellations(50)` did not list the parent.
- Green: `p636.batch.cancel_before_admission` — the decision reports `pending 2` and `state 'cancelling'`, the parent
  stays on the sweep's worklist, and a Work admitted **afterwards** is handed to the fan-out with the **stored** actor
  and key.
- Green: the dialog cell "a batch stopped DURING INGEST says how many files are still arriving" —
  `liveChildren 0, pendingMembers 100` renders "100 more files are still being taken in or read", replacing
  "0 operations are still running" on exactly the journey the ticket is named after.

### ADV-636-03 (adversarial, major) — a stop whose canceller loses authority never finishes, and nothing said so

**What I did, and what I did not.** `get_intake_batch` **derives** `cancel_blocked` from the live membership: a parent
in `cancelling` whose stored `cancel_requested_by` is no longer an active bookkeeper+ answers
`'canceller_not_active'`. No fourth parent state and no new column — the three-state set is an orchestrator narrowing
(brief §3 item 3) and stays three. The card renders a banner naming the condition and what a person can do about it,
and `reconciler-batches.mjs` counts such a parent as `batchCancelBlocked` (logged by name) instead of folding it into
`batchCancelFailed` beside a transient refusal.

**I did not build the remedy the reviewer sketched** ("a bookkeeper must re-issue") — see *Ratification requested* #3.

**Evidence.**
- Red: `p636.batch.cancel_blocked_after_revocation` failed at `live.cancel_blocked … undefined !== null` on the
  shipped build; `p636.runtime.belt_names_a_blocked_parent` failed with the reconciler file stashed.
- Green: with BOB's membership removed, the resumed child call raises CLR04 `actor_not_active` (re-measured here), the
  parent stays `cancelling`, the board answers `cancel_blocked='canceller_not_active'`, and the sweep still carries
  the parent (the blockage is reported, not hidden by dropping it).
- Green: the belt cell — an all-CLR04 fan-out counts `batchCancelBlocked 1` **once for the parent**, not once per
  child, and logs `BLOCKED … B1`.

### V636R-2 (spec, major) — the "part of batch" row was posted-only

**What I did.** Moved the row out of `PostedEntrySection` (rendered only when `entry !== null`, i.e.
`work.result?.entry_id`) and into the main return beside `WorkFacts`, so it renders whatever the Work's state is. It is
still **ONE row** and still the same link. A failed read remains indistinguishable from "not in a batch" — the page
never says a Work is *not* in one.

**Evidence.** `p636.work_detail.batch_row` ×2 (new, `apps/web/components/work/work-detail.test.tsx`). With
`work-detail.tsx` stashed: `not ok 1 … a refused Work still shows which batch it came from`. With the fix: both green.

### STANDARDS `chinese-string-in-en-json` — a Chinese phrase in the single `en` locale

**What I did.** `IntakeBatch.stopping.title` is `"Stopping this batch"`. The card test's `assert.match(text, /正在停止/)`
is gone; the cell now asserts the English string **and** that the rendered text contains no CJK at all.

**Evidence.** `apps/web/messages/en.json` carried exactly one CJK run (line 6294) on this branch and the base file
carries **1** CJK character total (line 293, a pre-existing mojibake in `statutoryDeadlinesNotBuilt`, not this
ticket's). After the fix the branch's count matches the base exactly — the branch adds zero CJK.

### STANDARDS `firm-leaf-cancel-unreachable` — the flag hid the one control it was meant to keep

**What I did.** Removed the `readOnly` prop rather than re-pointing it. It gated the Cancel trigger **and nothing
else** in the whole component, so passing it (as `unassigned-sources.tsx` did) hid the only act the firm leaf was
documented to keep and made its `onCancelled` handler dead code. The rows carry **navigation, not acts**, so there was
nothing else for the flag to withhold; the two mounts now differ by `clientId` alone (the firm leaf passes `null`, so a
row with no Work of its own says "No address yet" instead of linking into a client's workspace). A **terminal** batch
still offers no Stop on either mount.

**Evidence.** Two new card cells. With `intake-batch-card.tsx` stashed: `not ok … the FIRM-LEAF mount keeps Cancel`.
With the fix: green, and "a TERMINAL batch offers no Stop even on the firm-leaf mount" green beside it.
`pnpm lint` is what forced the choice between the two readings: re-pointing the flag left it assigned and unused
(`@typescript-eslint/no-unused-vars`), which is the linter saying the prop had no second job.

### ADV-636-04 (minor) — a tautological assertion

`assert.equal(out.already_stopping ?? out.status, out.already_stopping ?? out.status)` compared an expression with
itself. I measured what `0199:295-304` actually returns (`reason='already_stopping'`, `cancelled=false`,
`replayed=false`) and assert those three by name, so the converge-a-stopping-run arm reds if it regresses.

### ADV-636-05 (minor) — the World leg's lower bounds could not tell 35 from 4

`packages/runtime/tests/intake-batch-e2e.mjs` keeps `failed >= 1` and adds (i) an **upper** bound —
`failed.count <= landed - persistent.length`, i.e. a member that posted is never also failed — and (ii) a
**disjointness** assertion over the previews: no `work_id` appears in both `settled.rows` and `failed.rows`. Either one
would have caught ADV-636-02 in the very run the final report cited. It also pins the two new envelope keys.

### ADV-636-06 (note) — the facet comment contradicted its own constant

The comment claimed "the door's own five facets plus `all`" while `BATCH_FACETS` holds four plus `all`. **The comment
was wrong, not the constant** (the brief specifies a 5-way group: all / waiting / failed / unassigned / settled), so I
rewrote the comment to say why `admitted` is not a filter. The reviewer's second half is **deliberately left** — see
below.

### ADV-636-07 (note) — the ledger's transaction clock

`recorded_at default now()` is the transaction timestamp, so two events of one kind for one member inside one
transaction collapse. Unreachable today (every door call in `intake-batches.mjs` is its own transaction), so I wrote
the property down in the table's own comment, with what a future in-transaction caller must do instead (key on the op
key or a sequence — a migration, not a call-site choice).

### ADV-636-08 (note) — the sweep's worklist

`for update skip locked` added, with the note that the derived child key was already what made a double fan-out
harmless rather than the lock.

### ADV-636-09 (note) — the settled preview was the lowest uuids

The `limit` sat inside the `distinct on (m.work_id)` subquery; it is now an outer
`order by committed_at desc, work_id desc limit v_preview`. The new cell `p636.batch.settled_preview_is_newest`
**passed on its first run against the bug** — the ids are random uuids and "newest receipt" and "lowest uuid" coincide
once in N. I rewrote it to post members until the two diverge and to assert that they have, so the cell actually
discriminates. That lucky green is recorded here because it is exactly the failure mode ADV-636-05 is about.

---

## Deliberately left

| Finding | Why |
|---|---|
| **ADV-636-06**, second half — "drop the orphan message key `IntakeBatch.facet.admitted`" | **The key is not orphaned.** The card renders all five facet labels in its count tiles (`intake-batch-card.tsx`, the `INTAKE_BATCH_FACET_KINDS.map` over `t(\`facet.${kind}\`)`); only the toggle group maps `BATCH_FACETS`. The reviewer read the second and not the first. `pnpm lint`'s `check-message-keys.mjs` is green either way. |
| **ADV-636-01**, alternative fix (b) — "guard `_tf_intake_batch_member_work_stamp` against a parent in cancelling/cancelled" | Not taken. The stamp is lane-agnostic by ruling (`refresh-wave-2026-09-15/DECISIONS.md:32`; brief §3 item 8) and blocking it would hide a Work that genuinely exists — the batch would stop admitting rows while the Work ran and posted anyway. Keeping the parent in `cancelling` so the sweep *stops* the child is the fix that closes the journey; fix (b) only closes the bookkeeping. |
| **STANDARDS `firm-leaf-cancel-unreachable`**, the "mount the firm leaf" half of its suggested cell | Covered at the component boundary instead: with the prop gone, `unassigned-sources.tsx` passes exactly the props the new card cell passes (`clientId: null`, no flag), and `unassigned-sources.test.tsx` already mounts the leaf and is green (its router-context wiring is the implementer's). A second leaf-level mount would assert the same two lines through more fixture. |
| **ADV-636-03**, "give the sweep an attempt/age bound" | Not taken. The parent is already reported (`cancel_blocked`) and counted (`batchCancelBlocked`); an attempt cap would make the sweep *stop* re-emitting a parent that becomes fixable the moment the membership is restored, which is a worse failure than a bounded re-read of one row per cycle. The cost is one `_intake_batch_live_children` call per cycle per blocked parent. |

---

## Ratification requested

Four items. The first two I applied, because the shipped behaviour was wrong either way (the reviewers' point) — each
is one line for the orchestrator to reverse. The third I did **not** build. The fourth I applied and want confirmed.

1. **The terminal rule (ADV-636-01).** §3 item 10 says *"if none is live flips straight to `cancelled`"* and item 9
   defines live children as Work-holding members only. I narrowed the flip to "no live children **and** no pending
   members". The parenthetical's stated intent — *"cancelling a batch that already finished is terminal at once"* —
   still holds exactly: a batch whose members are all terminal still flips in the same call
   (`p636.batch.cancel_all_terminal` is green, untouched). What changed is the case the parenthetical never
   considered.
2. **Two new keys in the read envelope.** §3 item 12 fixes the envelope; it now also carries `cancel_blocked` (a named
   reason or `null`) and `pending_members` (a population count). Neither is a total, a denominator or a page length —
   `p636.batch.no_percentage` walks the whole envelope for banned keys and asserts the top-level key set explicitly,
   and the tail's `prosrc` probe is unchanged and green.
3. **The unbuilt half of ADV-636-03.** The honest remedy for a blocked stop is to let a *different* bookkeeper issue a
   fresh decision. `cancel_intake_batch` refuses CLR13 `batch_already_cancelling` under a different key **by binding
   ruling** (brief §3 item 10: *"so a second decision can never re-key the children"*), so I did not build it — the
   card says what happened and names the per-Work fallback instead. If the orchestrator wants the remedy, the smallest
   version is: permit a fresh key when the stored canceller is no longer active, which is a clean second decision
   (a new op key + a new author never collides with `_work_door_ctx`'s `{work, author}` hash).
4. **The Chinese string (STANDARDS).** The brief's Web section literally says a parent in `cancelling` *"shows 正在停止"*.
   I read that as the planning documents' own shorthand rather than product copy — the brief's English translation of
   the same UI contract says *"Show stopping and explain that already admitted operations are finishing"*, and
   `en.json` carries no other CJK. If the product does want a bilingual accountant-facing surface, that is an i18n
   decision and a separate ticket, not a hand-inserted phrase in the `en` locale.

---

## Commands re-run, with counts

| Command | Result |
|---|---|
| `pnpm typecheck` (worktree root) | **exit 0** |
| `pnpm lint` (worktree root) | **exit 0** (it caught the vestigial `readOnly` prop and two test titles beginning `#636 `, which the raw-colour rule reads as a 3-digit hex literal — both fixed) |
| `packages/db/tests/intake-batch.test.mjs`, own gate | **31/31 pass** (27 before this round + 4 new) |
| the five web unit files for this slice | card **20** / cancel **6** / a11y **4** / keyboard **5** / url-state **7** — 42/42 pass |
| `components/work/work-detail.test.tsx` | green, including the two new `p636.work_detail.batch_row` cells |
| `packages/db/tests/operation-census.test.mjs` | **10/10 pass** |
| `packages/db/tests/rig-isolation.test.mjs` (no reset flags) | 21 — **19 pass, 1 fail, 1 skip**. The fail is **T10b** and names only `graphile_worker.*` ⇒ **#866**, post-World-bootstrap, not this round's. The skip is T19 (reset-gated) |
| `packages/runtime/tests/intake-batch-unit.test.mjs` | **13/13 pass** (12 + 1 new) |
| `packages/runtime/tests/intake-batch-e2e.mjs` (real World) | **ALL LEGS PASSED, exit 0** — on a throwaway clone, see below. N=100, 5 lost to the host flake, facets **`{admitted 90, settled 90, waiting 4, unassigned 4, failed 7}`** (against `{… failed 35}` before the facet repair, of which 31 had posted). The belt after the interruption: `{batchCancelOk: true, batchCancelSettled: 0, batchCancelChildren: 23, batchCancelFailed: 0, batchCancelBlocked: 0}` — the new counter reporting zero, which is what a healthy resume looks like |
| whole `apps/web` suite (`node scripts/run-tests.mjs`) | **4180 tests / 135 suites — 4178 pass, 0 fail, 2 skip** |
| `pnpm --filter @clara/web e2e intake-batch` (3310/3311/3312) | **13 passed (21.5s)**, exit 0 |
| `node scripts/check-frozen-workflows.mjs` | **OK — 296 frozen files** (expected no-op) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** (expected no-op — no part kind) |

### Two things the whole-suite run found that the focused runs could not

1. **A cell that asserted the inversion.** `intake-batch-keyboard.test.tsx` carried
   `the READ-ONLY mount (the firm leaf) offers no Stop control at all` — the exact behaviour STANDARDS
   `firm-leaf-cancel-unreachable` reported as a bug, pinned as intended. It is not one of the five files this slice's
   own commands name, so only the whole suite reached it. Corrected in `225c400e` to assert the contract.
2. **A crash, not a failure.** `components/work/attach-evidence-dialog.test.tsx` exited `3221226505`
   (`0xC0000409`, STATUS_STACK_BUFFER_OVERRUN) in the first whole-suite run, which was racing the World leg for the
   host. I never touched that file; **22/22 green in isolation**, and green in the second whole-suite run. Reported as
   the host-contention family (WORK-ORDER rule 9 / #869), not as a defect.

### The World leg ran on a throwaway clone, and why

The first re-run on `clara_636` **failed at child 84 of 100 with a 500 on the byte PUT**, 45 minutes in. The cause is
in the log, not in the slice: `clara_636` had accumulated **1209 non-terminal `document_processing_tasks`** from every
earlier e2e run, and the intake-recovery belt opens every spool sidecar on every sweep
(`[reconcile] ingest task … has no transport metadata in its sidecar` — tens of thousands of lines), which is the
Windows `rename()` race the leg already counts for `finalize`. So:

- the leg now **counts a PUT flake exactly as it already counted a finalize flake** — one host flake at child 84
  should not throw away a run that has proven nothing yet, and the leg still refuses to speak on a run that lost too
  many children (`members.length >= 10`) and still accounts for every uploaded child;
- and the leg itself ran against **`clara_636_world`**, a `template clara_636` clone whose 1209 stale tasks were
  cleared. **`clara_636` was not touched**: every DB battery number above is from the rig itself. RIG.md and the
  brief's §4 both sanction the clone for exactly this. Upload time went from ~45 minutes (incomplete) to **90.6s**
  for 100 children, which is the measurement of what the backlog was costing.
- This is the same defect as the final report's follow-up #5 (the CI leg runs third on a database two earlier legs
  have loaded, and none of them drains its World). It is now measured rather than suspected: **1209 stale tasks, and
  a leg that cannot finish because of them.**

**Migration discipline.** `0229` is this branch's own, unmerged file, so the fixes are edits to it rather than a
`0230`. Each iteration tore its objects down on `clara_636` and re-applied the file through
`packages/db/scripts/migrate.mjs`, so every green above is against a **freshly applied** 0229, with all six tail
notices printing and the twelve non-regression pins re-read byte-identical (`#636 tail OK (5/6)`). Chain = **220
migrations, head `0229_intake_batches`**. No reset flag was ever set and no from-scratch chain was run.

## Rig state I leave behind

`clara_636` is as the wave expects it: chain **220, head `0229_intake_batches`**, no reset flag ever set, no
from-scratch chain run. **I also left a second database on the cluster, `clara_636_world`** — the throwaway World
clone the e2e leg ran against, created with `create database clara_636_world template clara_636` and then had its
1209 stale non-terminal `document_processing_tasks` deleted (triggers disabled for that one statement and re-enabled
immediately; nothing else was touched). It is ~90 MB and it is where the leg's green came from, so I did not drop it.
Drop it whenever the evidence is no longer wanted: `drop database clara_636_world`.

## Docs updated

`packages/db/README.md` (three new paragraphs: what "cancelled" means exactly; a stop that can never finish is named;
`settled` and `failed` are not compatible facets), `apps/web/README.md` (the firm leaf keeps Cancel; the stop dialog
counts what is arriving; a blocked stop says so), `packages/runtime/README.md` (the belt's counters distinguish a
refusal from a dead end). `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched; the final report's blueprint-drift
section is unchanged by this round.

---

## Fix round 2

### RECHECK-636-01 (recheck, minor, documentation-accuracy) — the README described a prop this same fix round deleted

**Finding.** `docs/plan/active/refresh-wave-2026-09-18/reports/636-recheck-1.json` (`new_findings[0]`): commit
`4b556649` — this fix round's own commit — added `apps/web/README.md:413-415` saying the firm leaf
(`components/firm/documents/unassigned-sources.tsx`) "mounts the same card with `readOnly`, which governs the row
affordances," but the **same commit** deleted the `readOnly` prop entirely (that is what STANDARDS
`firm-leaf-cancel-unreachable` *was*, earlier in this same file). The README contradicted the code it was describing,
in the same commit that made it wrong.

**What I did.** Re-read the two call sites directly rather than trust either the old sentence or the recheck's
one-line fix suggestion: `apps/web/components/firm/documents/unassigned-sources.tsx:109-111` mounts
`IntakeBatchCard` with `clientId={null}` and no `readOnly` (there is no such prop on the component any more);
`apps/web/components/documents/documents-workbench.tsx:287-289` mounts the identical card with the real client's
`clientId`. Rewrote the paragraph to state that mechanism — the two mounts differ **only** by `clientId`, nothing
gates Cancel/Stop on either one, and the row-is-navigation-not-acts reasoning from `firm-leaf-cancel-unreachable`'s
own fix is why there was never a second job for the flag to do. Left the next sentence ("A TERMINAL batch offers no
Stop on either mount") untouched — it was already correct and independent of the `readOnly` question.

**Evidence.**
- `grep -n readOnly apps/web/components/documents apps/web/components/firm/documents -r` → zero prop usages before
  and after this change (the prop was already gone; only the README lagged).
- `grep -n "IntakeBatchCard\|clientId\|readOnly" apps/web/components/firm/documents/unassigned-sources.tsx` →
  `clientId={null}` at the call site, no `readOnly`.
- `grep -n "IntakeBatchCard\|clientId\|readOnly" apps/web/components/documents/documents-workbench.tsx` →
  `clientId={clientId}` at the call site, no `readOnly`.
- `git diff apps/web/README.md` (this round) — the corrected paragraph, reviewed above committing.
- `git log --oneline -1` → `879125fd docs(web): #636 recheck-636-01 — the README no longer claims a deleted readOnly prop`.

**Commands re-run, with counts.**

| Command | Result |
|---|---|
| `pnpm --filter @clara/web lint` (worktree root, backgrounded) | **exit 0** — full log includes `check-token-contrast` (all WCAG AA pairs pass), `check-test-manifest.selftest` (all cases pass), `check-ui-add-guard.selftest` (all cases pass); no ESLint error or warning line anywhere in the output |

**Branch state.** `impl/636-work-batch`, HEAD before this round `88b5fb44`, HEAD after `879125fd` (one commit,
docs-only). Worktree `C:\Users\zhant\Desktop\clara-wt\636`, tree clean, nothing pushed, no PR — unchanged from round
1's discipline.
