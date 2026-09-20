# Wave 1 · Lane 01 — final report

**Branch** `riders/w1-lane01` in `C:\Users\zhant\Desktop\clara-wt\635`, cut from `origin/main`
`dd3f8f1d`. Database `clara_l01` @ 127.0.0.1:55741 (unused — no `packages/db` work in this lane).
Playwright triple `https://127.0.0.1:3500` / `3501` / `3502`. Seven commits, all `apps/web`-only, no
migration, no frozen file, no push, no PR, no GitHub write.

```
c35d8199 fix(web): #862 repoint every lane mock's private body reader onto the shared cache
c9a3f284 fix(web): #863 widen the RPC verb-opener census past three dispatch spellings
3ae738e0 feat(web): #902 scope the client-work-pack e2e mock by p_client
e8cdc6d4 fix(web): #853 activity-mock.mjs honours p_work, mirroring migration 0202
9855331b fix(web): #853 the second Work fixture must not collide on label or object id
162b9a98 fix(web): #865 make the build-then-test path impossible to miss
726bcfdd feat(web): #848 walk arm proving Reactivate reaches migration 0211's door
```

`git status` clean at hand-off. `9855331b` is a same-session fix-up on `#853` (a real defect the
browser walk found, not a synthetic break) rather than an amend, per the harness's own "always a
new commit" rule.

**Base-drift note (not this lane's edit):** `git diff origin/main..HEAD --diff-filter=D` shows
`docs/PROGRESS.md`-adjacent and `rider-1008-legal-enforcement-mode`/`riders-2026-09-20` planning
files as changed/deleted. `git log --oneline -- <path>` on each shows they were touched by main's own
later commits (`75345631`, `f94a5fcf`, …) after this branch's `dd3f8f1d` cut point — the same base
drift lane 09's own review recorded independently. No lane-01 commit touches any doc file.

---

## Ticket order and the newest Agent Brief each was built against

Per rule 2, the newest comment (with its own "Verified at `65fde7f3`" / triage timestamp) on each
ticket is what was built, not the ticket body. No ticket had an owner ruling comment dated
2026-09-20 specifically; the newest triage comment on each (2026-09-17 through 2026-09-19) is
authoritative and is what is reported against below.

## #862 — Lane mocks read POST bodies without the shared cache — **DONE**

Newest comment (2026-09-19) superseded the ticket body: the originally-named `fixed-asset-mock.mjs`
instance was already fixed incidentally by `#651` (verified: `git log -S readCachedJson --
apps/web/e2e/fixed-asset-mock.mjs` shows `907d6e4c`). Live remaining scope, measured fresh on this
branch's cut point:

| Remaining scope item | Evidence |
|---|---|
| Repoint the four UNCACHED private readers (`accrual-mock.mjs:76`, `counterparty-identity-mock.mjs:59`, `knowledge-mock.mjs:73`, `operator-support-mock.mjs:52`) | All four now `import { readCachedJson } from "./mock-dispatch.mjs"`; local `readJson` function deleted; every call site renamed `readCachedJson(request)`. `node --check` on all four: OK. |
| Decide the three CACHED copies (`periodic-adjustment-mock.mjs:232`, `staff-expense-claim-mock.mjs:216`, `trade-invoice-mock.mjs:235`) | **Decided: repoint, not declare.** Their bodies were functionally identical to `readCachedJson` (parse-once, cache on `request.__e2eParsedBody`); repointing removes three duplicate implementations of the shared contract instead of adding a three-line exception list to a census. |
| Census cell over `LANE_MOCKS`, RED before / GREEN after, positive+negative controls | `e2e-fixture-ownership.test.ts`: `bodyReaderViolation`/`bodyReaderCensus` + 4 new cells. Real census: **RED before** the repoint (`node --import ./test/bootstrap.mjs --import tsx --test e2e/e2e-fixture-ownership.test.ts` → 1 fail, naming exactly the 7 files above), **GREEN after** (24/24, then 33 after later tickets add more cells). Two synthetic positive controls (a private `readJson` function; a raw `request.on("data")` reader) and one negative control (importing the shared reader does not trip the census). |
| Original AC3 ("`fixed-asset-walk` stays green") | `fixed-asset-acquisition-walk.spec.ts`: **8/8** pass (unchanged by this lane; already fixed by #651). |

**Walks re-run on this lane's Playwright triple**, all green, no behavioural change beyond the
plumbing repoint: `accrual-walk.spec.ts` 14/14, `counterparty-identity-walk.spec.ts` 17/17,
`knowledge-walk.spec.ts` 18/18, `knowledge-firm-walk.spec.ts` 14/14,
`operator-support-walk.spec.ts` 13/13, `periodic-adjustment-walk.spec.ts` 13/13,
`staff-expense-claim-walk.spec.ts` 13/13, `trade-invoice-walk.spec.ts` 12/12,
`fixed-asset-acquisition-walk.spec.ts` 8/8.

**Deliberately left:** no behavioural change to any lane's responses — every repoint is a pure
plumbing swap (verified: the seven files' RPC verb sets and fixture data are untouched; only the
body-reading mechanism changed).

## #863 — RPC verb-opener census recognises only three dispatch spellings — **DONE**

Newest comment (2026-09-17) is the live brief. `RPC_VERB_OPENER` recognised `verb === "…"`,
`fn === "…"`, and literal `path === "/rest/v1/rpc/…"`.

| Acceptance criterion | Evidence |
|---|---|
| Opener recognises every spelling measured across current lane mocks + the historical `rpc === ` spelling | Measured (not assumed): `grep -noE '\b[a-zA-Z_]+ === "[a-z0-9_]+"' *.mjs` over every `LANE_MOCKS` file found exactly one MORE real spelling in use — `intake-batch-mock.mjs:150`'s guard-and-return `path !== "/rest/v1/rpc/get_intake_batch"` — genuinely invisible to the pre-#863 opener (`[...src.matchAll(RPC_VERB_OPENER)]` on that file returned `[]`, confirmed by a scratch probe). Widened regex: `verb === "…"` \| `fn === "…"` \| `rpc === "…"` (the historical spelling) \| `path (?:===\|!==) "/rest/v1/rpc/…"`. |
| RED before / GREEN after, on a synthetic non-standard spelling + undeclared verb | 4 new cells: the `rpc ===` spelling recognised (synthetic), the `path !== …` spelling recognised (synthetic), all 5 spellings surviving in one mixed file (synthetic), and the REAL `intake-batch-mock.mjs`'s `get_intake_batch` no longer absent from `rpcVerbCensus()`. Regex temporarily reverted to the narrow 3-shape version → all 4 new cells failed with the exact expected-vs-actual diff (missing verb); widened regex restored **byte-for-byte** (`diff` against the pre-check backup: identical) → 28/28 green. |
| All existing lane mocks still census cleanly, no new false positives | `verb-ownership census` test still passes; `census.size` grew by exactly one (`get_intake_batch`, single-owner, no `SHARED_RPC_VERBS` change needed). |

**Deliberately left:** no general JS dispatch parser — the brief's own out-of-scope. Covered exactly
what is measured in-repo plus the one historical instance.

## #902 — Scope `get_client_work_pack` by `p_client` — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| Two client ids' responses provably differ | `home-board-mock.mjs` gains `HOME_WORK_PACK_CLIENT` ("Miri Seafood Bistro") and `POPULATED_WORK_PACK` (one active row, one recent-success row). Handler: `body?.p_client === HOME_WORK_PACK_CLIENT.id ? POPULATED_WORK_PACK : EMPTY_WORK_PACK`. Cell `#902 · the dedicated fixture client reads the POPULATED pack…` asserts `deepEqual`/`notDeepEqual` against both. |
| Every existing walk landing on an arbitrary `/clients/:id` stays green | The handler still answers UNCONDITIONALLY for every id (never `return false` — an unanswered id would 404 two "could not be read" tiles, per #650's own header). Cell `#902 · every other client id … keeps the honest-empty pack` proves the unscoped default and `p_client: null` both still get `EMPTY_WORK_PACK`, byte for byte. `home-board-walk.spec.ts`: **27/27** green (every existing cell unchanged). |
| `e2e-fixture-ownership.test.ts`'s declaration updated honestly | `LANE_DECLARATIONS["home-board-mock.mjs"].debt` **unchanged as a list** (still names `get_client_work_pack`) — the handler still never falls through, so the census's mechanical "scoped" test (a `return false` fall-through) does not apply; the row's own comment is rewritten to say so rather than silently staying stale. |
| Vacuity | Handler temporarily reverted to ignore `p_client` (kept the new exports so the file still loads) → the "reads the POPULATED pack" cell failed with the exact diff (empty envelope instead of populated); restored byte-for-byte (`diff`: identical) → 31/31 green. |

**Deliberately left:** no populated pack for every fixture client across every lane (the brief's own
out-of-scope) — one dedicated client proves scoping.

## #853 — `activity-mock.mjs`'s `list_activity` ignores `p_work` — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| Two `p_work` values return different, correctly scoped pages | A second Work (`ACTIVITY.secondWorkId`/`secondWorkReceiptId`/`secondWorkEntryId`) and its own receipt row (`SECOND_WORK_ROW`) added to the `PAGE_1` fixture. Handler mirrors migration 0202's own predicate (`p_work is null or work_id = p_work`): absent, no filter; present, `rows.filter(r => r.work_id === work)`. Cells: `#853 · two different p_work values…` — `[workReceiptId]` vs `[secondWorkReceiptId]`, `notDeepEqual` between the two pages. |
| Every existing `activity-feed-walk.spec.ts` cell (none sends `p_work`) stays green | `#853 · every existing shape (no p_work at all) is UNCHANGED` proves `{p_client}` and `{p_client, p_work: undefined}` produce byte-identical output, both carrying BOTH Work rows (the pre-#853 shape). `activity-feed-walk.spec.ts`: **17/17** green — see below for the one real defect this surfaced and fixed. |
| `e2e-fixture-ownership.test.ts` declaration unchanged or updated honestly | `"activity-mock.mjs": { unscopeable: [], debt: [] }` — **unchanged**: `list_activity` still scopes by client and falls through otherwise; nothing about ownership changed. |
| Vacuity | `p_work` handling temporarily reverted (regex-replaced back to the pre-#853 one-liner) → `#853 · two different p_work values…` failed, returning the WHOLE 15-row page for both values (exact diff captured); restored byte-for-byte (`diff`: identical) → 33/33 green. |

**A real defect the browser walk found, not a synthetic one (commit `9855331b`):**
`activity-feed-walk.spec.ts`'s pre-existing `initial read` cell broke on the FIRST full run:
`SECOND_WORK_ROW` shared `WORK_ROW`'s `event_type` (`journal_entry`), and
`lib/firm/activity.ts`'s `operation_receipt` label is `workPurposes.<purpose ?? event_type>` with no
id in it — two rows rendered the identical "Recorded a journal entry" sentence and
`page.getByText(…)` hit Playwright's strict-mode two-element violation. It also reused
`entryReplacementId` as its object id (the correction pair's own). Fixed by giving the second row
its own registered purpose (`periodic_stock_adjustment`, a real `accounting_work.purpose` value —
confirmed present in migrations 0194/0195/0204/0209/0212) and its own entry id
(`ACTIVITY.secondWorkEntryId`). Re-run: `activity-feed-walk.spec.ts` **17/17** (was 16/17).

**Deliberately left:** no Playwright walk arm that opens a Work Activity tab and asserts on filtered
rows — the brief's own out-of-scope ("a separate addition").

## #865 — Make the build-then-test path impossible to miss — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| A comment in `playwright.config.ts`'s `webServer` names the correct invocation and states a bare run does not build | Added, citing the #648 19-minute-stale-build measurement by name. |
| `serve-built.mjs` logs `BUILD_ID` and its age at startup | New header comment (does not build) + `logBuildFreshness()` (reads `.next/BUILD_ID`'s content and its `mtimeMs`-derived age in minutes; a missing/unreadable file logs the fact instead of throwing). Called once before `next start` spawns. **Recorded run evidence** (not a unit cell — the AC's own OR): every browser walk this session logged the line, e.g. `[e2e] serving .next BUILD_ID Nap6NtIU7ocso9kdRwwL3, built 0.0 min ago` (captured live via the Monitor tool during the #862/#902/#853/#848 verification run). |

**Deliberately left:** no hard refusal on a stale `BUILD_ID` — the brief's own out-of-scope.

## #848 — Walk arm proving Reactivate reaches migration 0211's door — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| A named walk cell presses Reactivate on an `egress_not_authorized` fixture and asserts the banner reads active | `journal-work-walk.spec.ts`: `#848: pressing Reactivate … converges the banner to active` — presses the button, asserts `"AI processing is on again for this client."` visible, the refused Work's own `CLR13 · egress_not_authorized` face UNCHANGED, and (the `onReactivated` contract) exactly one real, non-empty op key reached the door (`state.egressReactivateOpKeys`, read back via a new `egress_reactivate_keys` control op). |
| A verbatim refusal face from the door | `#848: a governed no_consent refusal renders VERBATIM, never paraphrased` — arms `state.egressReactivateAnswer = "no_consent"`, asserts migration 0211's own exact sentence ("no live typed egress consent for this client and purpose") on screen, no success receipt. |
| The mock enforces owner-only dispatch, or the door refusal renders for a forced lower rank | `#848: the mock enforces the owner floor — a forced denial answers the database's own CLR04` — a signed-in browser cannot demote its own session (every cell in this spec signs in as the same owner persona per `helpers.ts`'s `DEFAULT_SIGN_IN_EMAIL`), so the mock is armed to answer the exact refusal a below-owner caller would receive (`_human_ctx`'s own "insufficient role" message); asserted verbatim, no success receipt. |
| `e2e-fixture-ownership.test.ts` passes with the new verb declared | New verb IS scoped (`if (body?.p_client !== ours) return false;`), so it is picked up automatically by the general handler census (`N5`'s `handlerCensus`) as a "scoped" handler with no manual declaration needed — confirmed in the whole-suite run's own log: `scoped   /rest/v1/rpc/reactivate_client_egress_purpose`. Census: 33/33 still green. |

`journal-work-mock.mjs` gains the verb (mirroring migration 0211's four real answers: the 0020
success shape verbatim, CLR04, CLR28/`no_consent`, CLR28/`nothing_to_reactivate`; a CLR10 guard for
a missing `p_op_key`/wrong `p_purpose` runs first, matching the door's own order) and two new
`egress_ids` (`egressActivationId`/`egressConsentId`). `journal-work-walk.spec.ts`: **23/23** green
(20 pre-existing + 3 new). `apps/web/e2e/README.md`'s `journal-work-walk.spec.ts` row updated.

**Vacuity** (probed directly against `handleJournalWorkSupabase`, not through a full browser
rebuild): with the new RPC block temporarily removed, a fake POST to
`/rest/v1/rpc/reactivate_client_egress_purpose` returned `{handled: false, sent: null}` (unanswered
— exactly what a signed-in browser would have seen: `reactivateClientEgress()`'s `WireError` path,
rendering `reactivateUnavailable`, never the text any of the three new cells assert). Restored
byte-for-byte (`diff`: identical).

**Deliberately left:** the door's own behaviour beyond the mock's contract — the brief's own
out-of-scope, owned by `packages/db`.

---

## Gates, with counts

| Gate | Result |
|---|---|
| `e2e-fixture-ownership.test.ts` (`node --import ./test/bootstrap.mjs --import tsx --test e2e/e2e-fixture-ownership.test.ts`) | **33 tests, 33 pass** |
| `mock-dispatch.test.ts` (the shared reader's own test — sanity, not required by any single ticket) | 6/6 pass |
| `pnpm typecheck` (worktree root) | exit 0 (`apps/web` + `packages/runtime`, "Done") |
| `pnpm lint` (worktree root — the whole chain: frozen-workflow/evaluator selftests, leak/citation/wiki-sql checks, dsn-pipe/model-guard selftests, `eslint scripts eslint.config.mjs`, `pnpm -r lint` incl. `apps/web`'s eslint + token-contrast + test-manifest + message-keys + ui-add-guard, `packages/reporting-render` lint) | exit 0 |
| Whole `apps/web` unit suite (`node scripts/run-tests.mjs`, from `apps/web`) | **4646 tests, 4644 pass, 0 fail, 2 skip** (both skips: `CLARA_LIVE_SUPABASE_AUTH_URL`/`ANON_KEY` not configured — documented, pre-existing, unrelated to this lane), 177.2 s |
| `accrual-walk.spec.ts` | 14/14 |
| `counterparty-identity-walk.spec.ts` | 17/17 |
| `knowledge-walk.spec.ts` | 18/18 |
| `knowledge-firm-walk.spec.ts` | 14/14 |
| `operator-support-walk.spec.ts` | 13/13 |
| `periodic-adjustment-walk.spec.ts` | 13/13 |
| `staff-expense-claim-walk.spec.ts` | 13/13 |
| `trade-invoice-walk.spec.ts` | 12/12 |
| `fixed-asset-acquisition-walk.spec.ts` | 8/8 |
| `home-board-walk.spec.ts` | 27/27 |
| `activity-feed-walk.spec.ts` | 17/17 (first run: 16/17 — the #853 label-collision defect, fixed same session, re-run 17/17) |
| `journal-work-walk.spec.ts` | 23/23 |
| `work-knowledge-walk.spec.ts` (incidentally swept in — `knowledge-walk` is a substring of its filename; untouched by this lane) | 9/9, confirms no collateral damage |

`packages/db` and `packages/runtime` are untouched by this lane, so neither the db gate chain
(`operation-census.test.mjs`/`rig-isolation.test.mjs`), nor `check-frozen-workflows.mjs`/
`check-parts-parity.mjs` beyond what `pnpm lint` already runs, applies as a separate gate.
`node scripts/check-frozen-workflows.mjs --print-closure`: none of this lane's seven changed files
is a `.mjs`/`.ts` reachable from a frozen body (all are under `apps/web/e2e` or
`apps/web/playwright.config.ts`, outside every closure named in `AGENTS.md` rule 5).

No known Windows-only red from `RIG.md` was encountered.

## Docs updated

- `apps/web/e2e/README.md` — `journal-work-walk.spec.ts`'s row extended to name the new `#848`
  coverage (same commit as the code, `726bcfdd`).
- No other module README touched. `apps/web/e2e/README.md` does not document individual mock
  internals (`mock-dispatch.mjs`, the census file's own N4/N5/verb-ownership guards) at all today —
  those live in the files' own header comments, the house convention this repo already uses for
  every prior N4/N5/verb-ownership addition in `e2e-fixture-ownership.test.ts`. `#862`/`#863`/`#902`/
  `#853`/`#865` each carry their own rationale in the touched file's header instead.
- `CONTEXT.md` — **not touched, deliberately.** No new domain vocabulary: "body reader",
  "RPC verb opener", "work pack scoping" and "egress reactivation" are all either internal test
  infrastructure or (egress reactivation) vocabulary `#812` already recorded.
- `apps/web/test/manifest.txt` — no new `*.test.ts` file was added (only the existing
  `e2e-fixture-ownership.test.ts` was extended, already registered), so no entry needed.

## Successor contracts

None. No ticket in this lane needed a new chat-lane or Work-lane tool, a `_vN` cut, or any change
inside a frozen closure.

## Follow-ups worth filing

1. **`intake-batch-mock.mjs`'s `get_intake_batch` guard-and-return spelling is the only one of its
   kind.** #863 widened the census to see it, but no OTHER lane mock uses this shape today — worth a
   one-line style note (or a lint) if a future mock is tempted to copy it, since the literal
   `path === "…"` open form is what every other single-verb lane uses.
2. **`work-knowledge-walk.spec.ts` is swept in by any Playwright invocation naming `knowledge-walk`**
   as a substring filter (`work-knowledge-walk.spec.ts` contains that literal substring). Harmless
   here (it stayed green, confirming no collateral damage from the `knowledge-mock.mjs` repoint), but
   worth knowing for a future lane trying to scope a filtered run precisely.

## Unverified

- **Hosted evidence: none.** Everything above is local, on this Windows host and this lane's build
  (`.next/BUILD_ID` `Nap6NtIU7ocso9kdRwwL3` during verification).
- **`firm-navigation-walk.spec.ts`** imports `ACTIVITY_CLIENTS` from `activity-mock.mjs` but was not
  re-run: that export is untouched by the `#853` change (only `ACTIVITY`'s new keys and `PAGE_1`'s
  new row were added), and the whole `apps/web` unit suite plus every walk that DOES touch
  `activity-mock.mjs`'s changed surface passed, so the risk is judged covered rather than
  independently re-proven on this file.
- Host contention: this Windows host ran multiple wave-1 lanes concurrently during this session
  (observed via `tasklist`/`ps`); no `0xc0000142` panic or other contention symptom from `RIG.md`'s
  known list was hit, so none is reported, but wall-clock times above are not a clean-host baseline.
