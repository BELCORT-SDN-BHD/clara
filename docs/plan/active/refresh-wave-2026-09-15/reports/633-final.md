# #633 — automatic intake and per-file custody after upload or attach — final

**Branch** `impl/633-document-intake` · **worktree** `C:\Users\zhant\Desktop\clara-wt\633` · rig PG17 `127.0.0.1:55502` / `clara_633` · Playwright 3240/3241/3242. **Zero SQL** (brief: no migration number). Worktree clean; nothing pushed.

**18 commits** (`git log --oneline origin/main..HEAD`): `da5c3f1a` `d5d1fec5` `f217203a` `0fceae25` (**fix round 1**, 2026-09-17) · `460c7369` `751150f9` `3fd224e4` `8f7c3b6a` `c2d6e022` `516e65d1` `b24128c6` `f7a0d073` `fb4bdb79` `ebf5b3da` `0c3bb4e4` `0061320d` `c3435786` `06f53d0a`. 62 files, +7482/−118.

> **FIX ROUND 1 (2026-09-17).** Four commits close two blockers, four shoulds and two notes from the
> three review lenses. Every row below that a fix changed is marked **†** and rewritten in place; the
> round's own finding-by-finding evidence table is `reports/633-fixround-1.md`.

## What the cut left, and what I did with it

No report existed; 10 commits and two uncommitted files. I read both hunks against the code they name and **kept both** (now `8f7c3b6a`): (a) `chat-parity-mock.mjs` consults the delegate *first* — its three intake legs answered unconditionally and sat ahead of it, so after #633 added a second browser upload every file that lane uploaded came back as chat-parity's document and a deliberately bad file reached "Filed" (a false green); (b) two walk selectors — a filed row is `role="button"` (`filed-document-list.tsx:51-61`), and sign-in must precede the 320 px resize because the narrow layout drops the "Main" landmark the wait uses. **Discarded nothing.** I then fixed three defects of my own finding: a **raw NUL byte** as the capability pair key made `capability-registry.ts` a *binary* file to git (`3fd224e4`); the settle-poll header carried plan-cache numbers I could not reproduce, so they are **re-measured** (below); and the lane mock never served the **detail bundle** (`751150f9`).

## Per criterion

| Row | State | Evidence |
|---|---|---|
| AC1 **†** | **done** | Cancel split from Remove with a `stopReason` discriminant (`useUploadQueue.ts` `cancel`), real bytes via the XHR seam (`intake.ts` `putIntakeBytesViaXhr`), receipts recovered at mount (`lib/documents/receipts.ts`, `intake-receipts.tsx`). Format/size/safety walls **verify-only** — World e2e leg 4 refuses 415/413/429 per item. |
| AC2 | **done** | `lib/documents/kind-label.ts`; 20 phrases + null, consumed by `document-admin.tsx`, `document-metadata.tsx`, the Kind column, `uncoded-filings-list.tsx`. `copy.ts:111-128` overturns its own prior ruling **by name**. |
| AC3 | **partial (as briefed)** | (a) null kind actionable on list/receipt rows via `document-kind-control.tsx`; (b) four tiers from the registry (`capability-registry.ts`, `capability-tiers.tsx`) — a payroll PDF at `extraction_status: done` shows custody+bytes from the *format* and Needs-classification until the kind lands, then **Not supported**. Residual: the detail panel's `pending` verdict stays as #624 built it. |
| AC4 **†** | **verify-only, on this journey** | World e2e leg 1, three arms, each able to go red alone: (a) an UNFILED upload's classify task settles `failed` with the estate's own `firm_narrow_consent_inactive` and invents no kind — the control; (b) with the client's `document_processing` consent granted through the real governed verbs and the document filed the way the browser's queue files it, the chain runs ingest → extraction `done` → classify **`done`** → `document_kind` set → exactly one `document.classified`, no human act in it; (c) a real MyInvois UBL invoice runs → `local_facts` `done` → `document.invoice_facts_completed` → the autodraft consumer calling **`clara.admit_autodraft_task`** for that document's live filing inside a sweep run it opened itself (origin `sweep`; a run-bound `one_click` is impossible by the door's own CLR10). Leg 2: a failed extraction yields `awaiting_extraction` and no kind. **Residual, named:** (c) proves the door is REACHED, not that a coding task is ADMITTED — `_coding_lane_core` refuses this fixture's document (`tier_a_fails`, `direction_unresolved`, `vendor_unresolved`, `no_consent`, measured) and routes it to `needs_you`; a Tier-A-complete fixture is the autodraft lane's, not this ticket's. Consumer-first; **hosted evidence pending**. |
| AC5 **†** | **done** | `(firm)/documents` + `unassigned-sources.tsx` over the existing `list_unassigned_documents` + `fileToClient`. Floor **measured**: a viewer reads the population, `record_client_resolution` refuses a viewer CLR04 and admits a bookkeeper → nav row `minimumRole: "viewer"`. **"Ask once" is now stated as the door actually holds it** (`p633.unassigned.second_attempt`): a repeat to the SAME client is refused CLR10 in the estate's own words and mints no second filing; a second attribution to a DIFFERENT client is ACCEPTED and leaves two live filings, which 0123 then refuses as `document_processing_multi_client`. The leaf's header, `apps/web/README.md` and the walk mock's refusal (previously an invented `CLR01 document_already_filed`) all carry that measurement. |
| AC6 | **done** | Nine `queueFailure.*` next steps + an unknown code that names itself. Per-item independence / extraction≠accounting verify-only. |
| AC7 **†** | **done** | Local cancel vs Work cancel (a **link**, no inline control — walk asserts `toHaveCount(0)`); in-flight permission loss (`p633.queue.authority_lost` ×3); 40-file partial batch; responsive/keyboard/announcement. Lost finalize + duplicate bytes verify-only (World legs 5, 3). **The mid-batch 401 is the unit cell, not a walk leg** — flipping one upload to 401 would teach a shared lane a second failure mode; §4.7 is the seam, as the brief allows. The shared-strings guard is now three cells against the LIVE source, not one against a copy of it: `COMPOSER_IN_FLIGHT_STATES` is exported from `ComposerAttachmentControl.tsx` and imported by `useUploadQueue.test.ts`; `components/clara/composer-attachment-control.test.tsx` mounts the control and drives its `blocked` contract; `composer-attachment.test.tsx` mounts the real `ClaraThreadView` and asserts **Send's `disabled` attribute** through `sendDisabled`'s own composition. Both mount cells were mutant-checked. |
| AC8 | **done** | Data Table (File/Size/Kind/Phase/Progress/Support/Actions); `role="progressbar"` bounded by *measured* bytes — no measurement, no number; task counts; document→Work from `entry_evidence_links` (`evidence.ts` now selects `work_id, logical_op_id`). |
| AC9 | **done, both surfaces** | Loading/empty/unavailable/denied/cancelled faces; 320 px + 200 % zoom; keyboard with focus return; axe clean; stable URL/Back. |
| AC10 | **done** | `packages/runtime/tests/intake-admission-e2e.mjs` + its `db-live-gates` step. |
| H-53 | **done (re-measured)** | `document-intake-noncoding.test.mjs` + World leg 6: `consent_evidence` keeps custody, enters neither `list_uncoded_filings` nor `list_review_queue`. |
| C-37 **†** | **done** | World leg 7: real OFX + a **genuinely real XLSX** — a stored-entry ZIP built in the file (local headers + central directory + EOCD, CRCs from `node:zlib`), verified against `scan.detectDocument`. The leg now ASSERTS `refusedAt === null`, a `document_id` on the receipt and an intake row with no quarantine code. Published levels `ofx(stored_only/unsupported)`, `xlsx(supported/stored_only)`; surface side in `upload-panel.test.tsx`. Before the fix round the fallback 45-byte `PK\x03\x04` stub was quarantined on every run while the leg printed `outcome: admitted`. |
| C-73 | **partial** | 40-file mixed cell (every 5th fails, every 3rd exhausts its poll → `error`/`timeout`, never success) + the 5-file World batch. Hosted representative-scale stays with #706/#760. |
| Out of scope, stated | — | Aggregate batch progress → #636. Activity kind ladder → D13 (residual). `documentIngest_v3` per-step progress. Firm-altitude chat attachments. `interview-walk.spec.ts:38`'s deferral honoured — fixture untouched. |

## Commands and counts (all LOCAL; **hosted evidence pending**)

- **db, 5 batteries with the 28 gate flags** (`packages/db`): **fix round 1** `tests 32 · pass 32 · fail 0 · skipped 0` (23.5 s) — the two new cells are `p633.unassigned.second_attempt` and the capability format-intrinsic invariant. (Cut run: 30/30, 382 s.)
- **operation-census + rig-isolation, no reset flags**: `tests 31 · pass 29 · fail 1 · skipped 1`. The one red is **rig state, not this branch**: `T10b` names `graphile_worker.*` EXECUTE reachable by `clara_agent_ro`/wake roles — the Workflow world bootstrap's own schema. Measured **before** my World run (the `workflow`/`graphile_worker` schemas already existed) and unchanged after. Rows before → after my World e2e: `document_intakes` 79→96, `documents` 86→99, `document_filings` 26→27. `T19` skips (destructive, correctly ungated).
- **runtime World e2e** (`node tests/intake-admission-e2e.mjs`, `clara_633`): **exit 0, 7/7 legs PASS** — re-run after the fix round, leg 1 logging `control refused firm_narrow_consent_inactive; consented chain classified as 'invoice'; admit_autodraft_task reached on its own for filing 3244bed8-… with outcome 'skipped_lane' ({"clr":"CLR29","lane":"needs_you","reason":"lane_changed","reasons":["tier_a_fails","direction_unresolved","vendor_unresolved","no_consent"]}); zero request_autodraft in the automatic lane`.
- **Playwright** (`pnpm --filter @clara/web e2e …`, ports 3240/3241/3242): **fix round 1** `documents-intake-walk` **12/12 passed (30.5 s)**; `chat-parity-walk` **7/7 passed (28.8 s)** — a quiet host, no contention. (Cut run: 12/12 in 3.2 m and 7/7 twice.)
- **Whole `apps/web` suite** (`node scripts/run-tests.mjs`): **fix round 1** `tests 3792 · suites 135 · pass 3789 · fail 1 · skipped 2` (212 s, exit 1). The one red is `components/clara/onboarding-checklist.test.tsx`'s `CB-AE2E-023` — a file this branch never touched; **14/14 alone**. Both runs reported. (+6 tests: two composer-control cells, the Send-disabled cell, the classify-control cell, and two settle-poll cells.)
- **`pnpm typecheck` exit 0**; **`pnpm lint` exit 0** (includes `check-test-manifest`: **373** files after the new test file). `check-frozen-workflows.mjs`: OK — 281 frozen files, 51 `"use workflow"` modules. `check-parts-parity.mjs`: OK. `e2e-fixture-ownership.test.ts`: 15/15. All re-run after the fix round.
- **Plan-cache probe** (brief's "proof to pick"): 28 sequential reads of the 12-column receipt projection of `document_intakes_visible` through ONE `clara_authenticated` session on one connection, 17 rows visible — 41.0 ms cold, then 6–9 ms flat; worst call from the 6th onward 8.8 ms ad-hoc / 7.0 ms named-prepared. The 0183 pathology **does not reproduce**, so the bounded poll ships. The session reads `plan_cache_mode = auto` and a plain view read has no body to pin it in — stated, not glossed.

## Browser reds, honestly (both runs reported)

- Run 1 of the walk: **7/12**, all five failures 30 s timeouts. Cause **measured, not guessed**: `Get-CimInstance Win32_Process` showed lanes 638/647/648/649/653 running their own Playwright walks concurrently. Run 2 (quieter): **11/12**, the same cells passing in 5–10 s.
- The one survivor was a **real defect in my lane mock**, not contention: `loadDocumentDetail` issues five reads in one `Promise.all` and the lane answered one, so the detail rendered "This isn't reachable today" and the file→Work panel never mounted. Fixed in `751150f9` (five reads + `get_document_state`, each scoped; body read through the shared `readCachedJson`). Run 3: **12/12**.
- Neighbour check after touching the shared harness: `chat-parity-walk` 7/7; `documents-viewer-walk` **22 passed / 7 failed (28 m)** — every failure is the sign-in landmark or a bare test timeout, with lane 650's walk running concurrently; the four cells that exercise the verb I now share (`get_document_state`, D1) all passed. Not re-run in isolation — named here rather than claimed green.
- Whole-suite run 1 had 5 reds: 3 real and fixed in `460c7369` (`app-sidebar.test.tsx` pins each role's firm destinations as an ordered list, so `/documents` joins all three; `brand-identity.test.tsx` R1 — my `queueFailure.internal` said "inside Clara", now ClaraBook). The other two (`journal-entries-table.test.tsx` aria-sort, `use-clara-thread-stop.test.ts` 630) are **load flakes**: 17/17 and 25/25 alone.
- #707 / #693 not touched.

## Docs updated

`apps/web/README.md` (new "The documents surfaces (#633)" section; fix round: what a settle-poll tick costs, and what the ask-once act actually guarantees); `packages/db/README.md` ("Web consumers added by #633 — no new door"); `packages/db/tests/README.md` (the four batteries; fix round: the three new/rewritten cells); `packages/runtime/README.md` (`intake-admission-e2e.mjs`, with its SIGKILL residual; fix round: leg 1's three arms and the Tier-A residual); `.github/actions/db-live-gates/action.yml` (the step comment now says what leg 1 proves and what it does not); `CONTEXT.md` (**Intake receipt**, **Unassigned source**, house term/Avoid shape). No blueprint edited. **Blueprint drift: none found.**

## Successor contract

**None owed.** This journey needs no chat-lane or Work-lane tool: every act is a human web door over an already-granted read or an existing door (`list_unassigned_documents`, `record_client_resolution`, `file_document`, `set_document_kind`). The integration worker should not look for one.

## Assumptions

1. `get_document_state` is now answered by a third lane mock (scoped, declared in the census) so the walk's detail leg is reachable; if the wave prefers one owner per verb, the alternative is asserting the Work panel on a surface that never opens the detail — weaker evidence.
2. AC7's "95/5" is delivered as *per-item independence at scale with mixed outcomes*, not that literal ratio; aggregate batch metrics are #636.
3. Leg 5 proves lost-finalize convergence, not a SIGKILL between finalize and checkpoint (that needs the spawned-engine shape) — recorded in `packages/runtime/README.md`.

## Follow-ups worth filing

1. **Lane mocks that read a POST body before deciding it is theirs.** `#722` built `readCachedJson`; this branch converted one more lane after finding the hazard live. A cheap census cell could assert no `*-mock.mjs` defines its own body reader.
2. **The browser suite is not runnable honestly while several lanes share this host.** Five concurrent Playwright lanes turned a 3.2-minute spec into 18.7 minutes of 30 s timeouts. Worth a serialising lock, or a documented "one browser lane at a time" rule in RIG.md.
3. **A poll-bound budget cell that never ticks is a vacuity class, not a one-off.** `useSettlePoll`
   waits 1.5 s before its first tick while the web harness's `settle()` is a 0 ms macrotask hop, so
   `documents-workbench-refresh.test.tsx`'s shipped "the poll stays inside its tick ceiling" cell was
   asserting a budget of ZERO ticks and would have passed against a poll that never ran. Fixed here by
   making the bounds a component option with the shipped values as defaults plus a `grew > 0`
   non-vacuity control. Any other cell in this repo that asserts an upper bound on timer-driven reads
   has the same shape and is worth a census.
4. **`document_filings` has no list-form read for a set of documents**, so the receipts cell issues one filings read per client and one `documents?id=in.(…)`; at real scale a single door would beat both.

## Residuals opened by the fix round

1. **A Tier-A-complete autodraft fixture.** World leg 1(c) proves `admit_autodraft_task` is reached
   automatically; the door answers `skipped_lane` / `lane_changed` because `_coding_lane_core` refuses
   this document (`tier_a_fails`, `direction_unresolved`, `vendor_unresolved`, `no_consent`). Proving an
   admitted CODING TASK needs counterparty resolution, a resolved direction and coding consent — the
   autodraft lane's own fixture. Named in the e2e file, `packages/runtime/README.md` and the CI step.
2. **`document-admin.tsx`'s classify Select still offers `consent_evidence`.** Fixed on #633's own
   list/receipt control; the #624/#646 detail surface is not this ticket's to change. Observation only.
3. **RIG.md is owed one line** (633-ADV-9): the #633 admission e2e bootstraps the Workflow world, which
   makes `rig-isolation.test.mjs`'s T10b red on that cluster afterwards. Left to the orchestrator — RIG.md
   is a shared wave document twelve branches would conflict on.

## Unverified

Everything hosted (no hosted run exists). The XHR upload-progress path is exercised by a stubbed `XMLHttpRequest` in unit cells and by Chromium in the walk; **byte counts from a real network** are unverified. `documents-viewer-walk`'s seven reds were not re-run in isolation. Nothing in this report rests on a skipped frontier-gated battery.
