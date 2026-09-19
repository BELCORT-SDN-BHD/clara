# #636 — the durable intake batch · final report

**Branch** `impl/636-work-batch` · **worktree** `C:\Users\zhant\Desktop\clara-wt\636` · **HEAD** `4b556649` · 8 commits, tree clean, nothing pushed, no PR.

> **Fix round 1 (2026-09-19) has landed on top of this report.** Eleven of thirteen review findings were applied
> red-first in `4b556649`; every claim they changed is corrected in place below and marked **[fixround-1]**. The
> finding-by-finding account, the deliberately-left list and three items raised for ratification are in
> `636-fixround-1.md`.

```
4b556649 fix(db,web,runtime): #636 fix round 1 — the terminal flip, the failed facet, the blocked stop, and the reverse row
23e6e687 ci: #636 give the new World leg the same line continuations its two siblings have
4596fd29 chore(web): #636 keep the two shared censuses to the lines this ticket owes
14916ba7 test(web): #636 the walk's URL cell asserts what the two parameters actually are
46617405 test(web): #636 keep the two census suites my diff moved green
b39a5cd8 feat(web,runtime,docs): #636 the e2e mock + walk, the CI World leg, and the sources of truth
f283cb51 feat(runtime,web): #636 the intake-batch runtime lane, the reconciler belt and the durable batch card
dbbd0ad7 feat(db): #636 0229 the durable intake batch — parent, member child, append-only ledger, six doors
```

**This was a re-invocation (WORK-ORDER rule 0).** Five commits had landed; I did not redo them. I re-measured every §6 gate on `clara_636`, found three shared-file deviations, repaired them (`4596fd29`, `23e6e687`), and re-ran.

## DECISIONS §6.1 — the sixth name, confirmed against the live catalog

Six granted names, exactly as ruled: `open_intake_batch`, `attach_intake_to_batch`, `set_intake_batch_member_dependency`, `cancel_intake_batch`, `sweep_intake_batch_cancellations(integer)` → `clara_runtime` (all SECURITY DEFINER); `get_intake_batch(uuid,integer)` → `clara_authenticated`, SECURITY **INVOKER** with 0189's three floor predicates restated inline (0214:262-274's reason). `rig-meta.mjs:2325-2340` counts six. Chain = **220 migrations, head `0229_intake_batches`**; all three relations carry `relrowsecurity` **and** `relforcerowsecurity`.

**Pins re-measured, not inherited:** I took `sha256(prosrc)` off `clara_636` for `cancel_accounting_work`, `finalize_document_intake`, `list_accounting_work` and `_declared_page_ceiling` and compared them to 0229's prestate table — byte-identical (`27c7295b…`, `8f9e0b19…`, `61bd9184…`, `82bc5e67…`). 0229 creates ten functions and recuts none.

## Per acceptance criterion / historical row

| Row | Status | Evidence |
|---|---|---|
| AC1 group + dependency | done | `p636.batch.attach_idempotent` / `.no_transaction` / `.dependency_lifecycle` / `.member_rls_child` |
| AC2 N−5 finish, 5 wait, poison isolation | done **[fixround-1]** | World leg re-run; `p636.poison.cross_firm` green. **The `failed 35` this row used to quote was the defect V636R-1 / ADV-636-02 found, not a measurement of five failures**: 31 of those 35 members held a committed receipt. The facet now excludes a member that posted and reads only the current attempt per lane, and the leg asserts an UPPER bound plus settled ∩ failed = ∅ instead of two lower bounds |
| AC3 derived progress, distinct ids, no % | done **[fixround-1]** — plus `.failed_excludes_settled` and `.settled_preview_is_newest`; the envelope gained `cancel_blocked` and `pending_members`, neither of which is a denominator | `.distinct_work_ids` / `.settled_is_a_receipt` / `.facets_overlap` / `.no_percentage` / `.preview_bound`; the card test asserts no `[role=progressbar]` and no `%`-shaped string in any of the eight states |
| AC4 answer / retry / cancel keeping receipts | done **[fixround-1]** | `.cancel_keeps_receipts` / `.cancel_while_settling` / `.one_receipt_through_retry`; World legs 2–3. **Plus `.cancel_before_admission`**: a batch stopped while its files were still in ingest used to flip terminal at once and stop nothing (ADV-636-01). `cancelled` now means no live child AND no member that can still become one |
| AC5 Documents + Work-detail addresses | done **[fixround-1]** | the walk (deep link, reload, facet filter); one `work-batch-origin` row on Work detail — **now rendered for a Work in ANY state**, not only a posted one (V636R-2), with `p636.work_detail.batch_row` ×2 proving it |
| AC6 state ladder, 320px, 200%, keyboard, SR | done | card 15, a11y 4, keyboard 5, url-state 7; the walk's axe / 320px / 200% / reduced-motion cells |
| AC7 least-privileged, durable, recovery | done | whole battery through `humanQuery` / `roleQuery`; belt after the kill: `{batchCancelChildren: 3, batchCancelFailed: 0}` |
| UI-30 / UI-31 (REDESIGN) | verify-only, re-measured **[fixround-1]** — the firm-leaf mount now actually reaches Cancel; the `readOnly` prop that hid it is gone | `p636.card.child_addresses`; the keyboard cell "focus returns into the table after a child row acts" |
| C51.1 one business receipt | done | `.one_receipt_through_retry` — exactly one committed receipt per `logical_op_id` |
| C51.4 authority through reclaim | done **[fixround-1]** | `.authority_revoked_midbatch` revokes before an **attach** (CLR04 `actor_not_active`, every committed sibling untouched) — ADV-636-03 was right that this names the attach door, not the reclaim path. The resume path is now its own cell, `.cancel_blocked_after_revocation`: the stored canceller loses authority mid-flight, every resumed child refuses CLR04, and the board NAMES it (`cancel_blocked`) instead of showing "stopping" for ever |
| C51.7 reservation atomicity + two findings | verify-only, both carried | `.reservation_atomicity` / `.capacity_refusal` / `.capacity_window_utc`; neither fixed (D4) |
| C77.1 poll helpers | verify-only | the card reuses `useSettlePoll` with its own `resetKey`; no new poll primitive is in the diff |
| C83.X2 re-derived inventory | done (discovery) | ladder 1/10/50; 100 (≤1MB PDF), 100 (image), 20 (≤5MB PDF). **`DECISIONS.md:243` said "World leg with 100 intakes"; the measurement independently lands on 100 for ≤1MB PDFs** — the figure is earned, not quoted |

10 done · 4 verify-only · 0 partial · 0 descoped.

## Commands re-run, with counts — **[fixround-1] every row below is the fix-round re-run at `88b5fb44`**

| Command | Result |
|---|---|
| `pnpm typecheck` (worktree root) | **exit 0** (twice — before and after the repairs) |
| `pnpm lint` (worktree root) | **exit 0** |
| whole `apps/web` suite, `node scripts/run-tests.mjs` | **4180 tests / 135 suites — 4178 pass, 0 fail, 2 skip** |
| `intake-batch.test.mjs`, own gate | **31/31 pass** (27 + the fix round's 4) |
| `operation-census.test.mjs` | **10/10 pass** |
| `rig-isolation.test.mjs` (no reset flags) | 21 — **19 pass, 1 fail, 1 skip**. The fail is **T10b** and its message names **only** `graphile_worker.*` (`add_job`, `complete_jobs`, …) ⇒ **#866**, post-World-bootstrap, not mine. The skip is T19 (reset-gated) |
| `intake-batch-unit.test.mjs` | **13/13 pass** (12 + 1) |
| `intake-batch-e2e.mjs` (real World) | **ALL LEGS PASSED**, exit 0, N=100, 5 children lost to the Windows spool race. Facets **`{admitted 90, settled 90, waiting 4, unassigned 4, failed 7}`** — the earlier `failed 35` was the defect, not a measurement. Run on **`clara_636_world`**, a `template clara_636` clone whose 1209 stale non-terminal processing tasks were cleared: the same leg on the rig itself could not finish (a 500 on the byte PUT at child 84 of 100, 45 minutes in, from the recovery belt opening every stale sidecar on every sweep). `clara_636` itself was not touched, so every DB number here is still the rig's |
| `pnpm --filter @clara/web e2e intake-batch` (3310/3311/3312) | **13 passed (21.5s)**, exit 0 |
| `check-frozen-workflows.mjs` | **OK — 296 frozen files** (expected no-op: no successor cut) |
| `check-parts-parity.mjs` | **OK** (expected no-op: no part kind registered) |
| `check-test-manifest.mjs` | **416 listed, each exactly once, alphabetical** |
| `e2e-fixture-ownership.test.ts` | **18/18 pass** |
| the five web unit files for this slice | card 20 / cancel 6 / a11y 4 / keyboard 5 / url-state 7 — **42/42 pass** (the card gained 5 cells and the cancel dialog 2; the keyboard file's read-only cell was inverted and is corrected) |
| `components/work/work-detail.test.tsx` | green, including the two new `p636.work_detail.batch_row` cells |

## Three shared-file repairs I made (WORK-ORDER rule 8)

1. **`e2e-fixture-ownership.test.ts`** — `LANE_MOCKS` is alphabetically sorted at base; `intake-batch-mock.mjs` had gone in between `documents-viewer-` and `firm-setup-`. Moved to its sorted position. Never red (the census sorts before comparing, `:508`) — but a lane off its sorted position is a merge conflict waiting for whichever of the other nine lands first. `LANE_DECLARATIONS` deliberately **not** moved: that map is lineage-grouped at base, not sorted.
2. **`test/manifest.txt`** — a whole-file re-sort had lifted #770's and #809's own inline attribution comments (put there by `a09e1689` and its #809 sibling) into the header block, rewriting eight lines belonging to two other tickets. Restored; #636's net diff against main is now exactly the five paths it adds, in two localised hunks.
3. **`.github/actions/db-live-gates/action.yml`** — the new step's `\`-newline continuations had been flattened onto one line, unlike its two siblings (`:46-48`, `:67-70`). Valid bash, never red; now matches. `bash -n` on the run block is clean and the file still parses to the same seven steps.

## Docs updated

`packages/db/README.md` ("The intake batch relation family"), `packages/db/tests/README.md` ("The intake-batch battery"), `packages/runtime/README.md` ("The intake batch lane"), `apps/web/README.md` ("The durable batch card vs the live upload queue"), `CONTEXT.md` (three terms in the house "term / _Avoid_" shape: *Intake batch*, *Batch member*, *Member dependency*).

## Blueprint drift (NOT edited — orchestrator decides)

- `docs/PRD.md:120` and `docs/ARCHITECTURE.md:530` go stale on this merge (a durable batch parent, its doors and its surface now exist).
- `docs/ARCHITECTURE.md:134-135` — firm-altitude batch *organising* still does not exist after this ticket: the batch is client/Documents-altitude and the firm leaf mounts the card read-only.

## Successor contract (written, NOT cut)

> tool `open_intake_batch` · `.strict()` zod `{ label: string().min(1).max(120), origin: enum(["chat"]),
> session_id: string().uuid() }` · door `clara.open_intake_batch(p_actor, p_origin, p_label, p_session,
> p_op_key)` in that argument order · refusals CLR04 `insufficient_role` → "needs a bookkeeper",
> CLR18 `daily_limit` → the operator remedy verbatim, CLR10 `invalid_label` → field error ·
> part kind `intake_batch_accepted` carrying `{ batch_id, label, admitted, waiting }` and NOTHING
> derived · `WORK_ACCEPTED_PURPOSES` needs **no** widening (children are `journal_entry` Works).

Beside the stanza: `open_intake_batch` itself raises no CLR18 — the CLR18 in the map is the attach half's, arriving from `create_document_intake`'s reservation. The part kind is **contract only**: nothing is registered, `lib/parts/*` and `PartRenderer.tsx` are untouched, parts-parity is green. **#642 and #664 own that entrance.** The live door's argument order was checked against the catalog and matches the stanza.

## Assumptions

1. `withRuntime` is autocommit, so "begin and attach commit together" required an EXPLICIT transaction. It opens only when `batch_id` is present, so the existing intake path is byte-unchanged.
2. `recordCapacityWait` **is** written (cell 2 measured `internal`) **and** the trigger arm stays as the belt — the superset of the brief's two branches, i.e. the conservative reading.
3. The World leg's kill is an ABANDONED fan-out, not a SIGKILL of a spawned engine. The durable state is identical; the transport of the interruption is the part not proven.
4. The facet filter is a `router.replace`, not a push; the walk asserts the replace rather than a Back the code never promised.
5. The e2e mock reuses `documents-intake-mock.mjs`'s client and mints none of its own (the `clientIdCensus` gate forbids two lanes minting one client).
6. `intake_batches.cancelled_at` carries a CHECK tying it to `state='cancelled'` — additive, beyond the brief's column list, and it makes the terminal state self-evidencing.

## Unverified / residual

- **Hosted evidence pending** for everything above; all of it is local (`clara_636`, PG 17.11, chain 0001→0229).
- **[fixround-1] The earlier "unidentified whole-suite flake" is now identified, and there were two different things.** In the fix round's first whole-suite run, one failure was **real** — `intake-batch-keyboard.test.tsx` asserted the very inversion STANDARDS reported — and one was a **process crash**, `components/work/attach-evidence-dialog.test.tsx` exiting `3221226505` (`0xC0000409`) while racing the World leg for the host; that file is **22/22 green in isolation** and green in the clean re-run. The second whole-suite run is **0 fail**.
- **CLR13 `operation_in_flight` is not reachable for `cancel_accounting_work` from a single session** (`_reserve_op` and `_finish_op` share a transaction), so that runtime arm is proven against a stubbed door, not against Postgres.
- **The frontier-gate proof (the battery FAILS LOUDLY below 0229) is inherited, not re-measured.** It was taken at chain 0224 before 0229 applied; re-taking it needs a pre-0229 database, and a from-scratch chain on this cluster is forbidden. The gate module itself is correct by inspection (`intake-batches-preintegration-gate.mjs` sets one env flag and nothing else).
- `messages/en.json` is **two** hunks / 117 added lines (a 4-line `batchOrigin` group inside the Work namespace at `:1621` plus the `IntakeBatch` namespace at `:6246`) — the earlier draft's "ONE 81-line hunk, 79 keys" was wrong; corrected here.
- `parts-parity-exemptions.mjs`: adding one spread to `runReconcilerSweep`'s return re-fingerprints **all fifteen** sibling tuples, because the fingerprint is the sha of the whole normalised statement (the #640 precedent, cited in the file). **A concurrent lane touching that same return will collide here** — integrator, take note.

## Follow-ups worth filing

1. **Move the document daily window to `Asia/Kuala_Lumpur`** (#635's surface). `_reserve_document_ingest` truncates a **UTC** day (`0007:1644`), so the firm's ceiling resets at 08:00 MYT while every other calendar boundary in the estate is MYT. `p636.batch.capacity_window_utc` pins today's behaviour, so the move reds there instead of silently shifting every firm's ceiling by eight hours.
2. **A file refused by the daily ceiling BEFORE its intake exists can never become a batch member**, because a member's identity IS its intake. The card says so and points at the upload list, which renders the database's own message — but the durable record of "this file was turned away" lives nowhere. Worth a relation or a widened `document_intakes` arm.
3. **The spool sidecar is opened by the recovery belt on every sweep**, which on Windows makes `writeIntakeMeta`'s `rename` fail EPERM under load (2 of 100 in the earlier run; 0 of 100 in mine, so it is load-dependent, not deterministic). A read that copies rather than holds a handle, or a belt that skips sidecars younger than its own age guard before opening them, would remove a whole class of Windows-only intake failures.
4. **`sweep_intake_batch_cancellations` has no cadence of its own.** It rides the leader's sweep, which is nudge-driven, so a batch cancelled on an idle estate waits for the next nudge. A due-probe (the `close_prep_due` shape) would make that latency a stated property rather than an emergent one.
5. **NEW — the CI World leg runs third on a database two earlier legs have already loaded.** `.github/actions/db-live-gates/action.yml` reuses one `clara_intake_ci` across `intake-e2e`, `intake-admission-e2e` and now `intake-batch-e2e`, and none of them drains its Workflow queue. My re-run on an already-used World produced hundreds of `document-processing concurrency limit reached` FatalErrors and `[classify] … exceeded 3 attempts` lines — 1.27M log lines — before it passed. It **did** pass, which is the good news about the leg's own resilience, but the step is one concurrency-limit change away from flaking and the noise would bury the real failure. Worth either a drain between legs or a separate database for the third.

## Riders and non-goals, as built

**#905 is not folded** — no `list_accounting_work` recut (its body is pinned byte-identical in 0229's prestate and tail); the Work LIST says nothing about batches, and the started-vs-posted divergence is stated beside the Work-detail row and in the card's two separate facets (`admitted` ≠ `settled`). **#876 is not folded** — the read does its own set-shaped filing join internally; no second batched filings reader. **#904 stays #904's** — the card polls with its own `resetKey` and refreshes without a reload. **#636 mints no Work and raises no quota**; no new `accounting_work` column, purpose, `source_refs` kind, needs-you row kind, part kind, `clara.event_types` / `clara.trigger_taxonomy` row or `clara._append_event` call, no new route and no `tree.ts` leaf.
