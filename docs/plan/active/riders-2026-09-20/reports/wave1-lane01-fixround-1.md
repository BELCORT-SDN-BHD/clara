# wave 1 · lane 01 · fix round 1

Branch `riders/w1-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\635`, db `clara_l01` (55741,
unused this round — no `packages/db` work in this lane). Playwright triple
`https://127.0.0.1:3500` / `3501` / `3502`.

```
f4c8f554 fix(web): wave1-lane01 fix round — #848 onReactivated re-read evidence,
          #863 collision cell, #865 README warning                              <- NEW HEAD
726bcfdd feat(web): #848 walk arm proving Reactivate reaches migration 0211's door
162b9a98 fix(web): #865 make the build-then-test path impossible to miss
9855331b fix(web): #853 the second Work fixture must not collide on label or object id
e8cdc6d4 fix(web): #853 activity-mock.mjs honours p_work, mirroring migration 0202
3ae738e0 feat(web): #902 scope the client-work-pack e2e mock by p_client
c9a3f284 fix(web): #863 widen the RPC verb-opener census past three dispatch spellings
c35d8199 fix(web): #862 repoint every lane mock's private body reader onto the shared cache
```

`git status` clean at hand-off; `git log --oneline origin/main..HEAD` read first, per rule 1 — the
seven landed commits were not redone. Findings resolved come from
`docs/plan/active/riders-2026-09-20/reports/wave1-lane01-review-spec.json`. No push, no PR, no
GitHub write, no other worktree touched, no subagent spawned, no process killed. Only three files
changed: `apps/web/e2e/journal-work-walk.spec.ts`, `apps/web/e2e/e2e-fixture-ownership.test.ts`,
`apps/web/e2e/README.md` — all test/doc, no lane mock's behaviour changed, no migration, no frozen
file.

---

## L01-S1 · major · #848 — the onReactivated re-read was claimed as proven, but the evidence measured the press

**FIXED.**

**Reproduced first.** The walk's own comment ("the press told the page to re-read... exactly one
real, non-empty op key reached the door") and the lane's final report both cited
`state.egressReactivateOpKeys` as evidence for the re-read. That array is pushed **inside** the
`reactivate_client_egress_purpose` handler itself
(`apps/web/e2e/journal-work-mock.mjs:1487`), so it records the PRESS reaching the door. A grep for
a read/poll counter on `state.` in that file returns nothing — no cell in the suite observed
whether `useWorkDetail`'s `reload()` (wired as `onReactivated={onConverge}` ->
`onConverge={() => state.reload()}`, `work-detail.tsx:547,1307`) ever fired.

**The fix** (test-only, `journal-work-walk.spec.ts`). Rather than adding a counter to the mock
(which the reviewer offered as one option), the walk now watches the actual wire request Playwright
already sees: a `page.on("request")` listener records every `GET .../rest/v1/accounting_work?
id=eq.<egressRefusedWorkId>` — the exact call `getAccountingWork` -> `reload()` issues — and an
`expect.poll` asserts exactly one more lands after the press. This mirrors the established pattern
`documents-viewer-walk.spec.ts`'s `byteReads` array already uses in this repo, rather than inventing
a new one, and needs no change to the shared mock or its `reset()` seeding. One real bug surfaced
while wiring this: the mock server strips its own `supabasePrefix` (`/e2e-supabase` by default)
before matching routes, so the raw pathname the browser requests still carries that prefix — the
listener matches with `.endsWith("/rest/v1/accounting_work")` rather than `===`, documented inline.

**Vacuity.** With `journal-work-walk.spec.ts` correct, `apps/web/components/work/work-detail.tsx`'s
`onReactivated={onConverge}` prop was removed for one real browser run: the new assertion failed —
`Expected: 1, Received: 0` (timeout waiting on the predicate) — while every other cell in the file
stayed green (22 passed, 1 failed, the correct one). Restored byte-for-byte
(`git diff --stat apps/web/components/work/work-detail.tsx` empty after restore); re-run: 23/23.

**Evidence:** `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3500 CLARA_E2E_NEXT_PORT=3501
CLARA_E2E_RUNTIME_PORT=3502 pnpm --filter @clara/web e2e journal-work-walk` -> 23 passed, 0 failed
(both before-vacuity-break and after-restore runs). Commit `f4c8f554`.

---

## L01-S2 · minor · #848 AC3 — the owner floor is simulated at the wire, so neither branch of the OR is delivered literally

**RECORDED (not code-fixed) — the reviewer's own second option.**

**Reproduced.** Confirmed the reviewer's read: the mock answers CLR04 purely on
`state.egressReactivateAnswer === "denied"` (an armed flag), never inspecting a caller. Branch (b)
(forcing a lower rank through the browser) is genuinely unreachable: every cell in this spec signs
in as the same owner persona, and `work-detail.tsx:543`'s `canReactivateEgress={ownerHere}` hides
the button from anyone else in the UI itself. Branch (a) (deriving the CLR04 answer from the
signed-in persona, the way `serve-built.mjs`'s own `/rest/v1/caller_context` derives `role_rank`
from the sign-in email prefix) is real and achievable in principle, but `journal-work-mock.mjs` has
no access to `serve-built.mjs`'s module-scoped `state.email` today — wiring it through would mean
changing `handleJournalWorkSupabase`'s call signature in `serve-built.mjs`, a file rule 7 names as
edited concurrently by nine other lanes this wave, for a single minor finding on a walk-arm ticket.
Judged out of #848's scope under rule 5 (scope discipline) rather than attempted.

**The fix.** Renamed the cell from "the mock enforces the owner floor" (a claim of literal
enforcement) to "a forced denial renders the database's own CLR04 owner-floor refusal", and
rewrote its header comment to state the substitution plainly: which branch is unreachable and why,
which branch was achievable and why it was not built, and that AC3 is met by simulation rather than
enforcement. No behavioural change; the assertions themselves are unchanged and still pass (part of
the 23/23 `journal-work-walk.spec.ts` run above).

**Evidence:** `apps/web/e2e/journal-work-walk.spec.ts`, the renamed test at (was) line 910; same
run as L01-S1, still green. Commit `f4c8f554`.

---

## L01-S3 · minor · #863 AC1 — the synthetic source was never carried through to a collision, only to verb extraction

**FIXED.**

**Reproduced.** The four `RPC-opener census` cells in `e2e-fixture-ownership.test.ts` all stop at
`assert.deepEqual(verbsInSource(synthetic), [...])` — none reaches `verbCollisions`, even though
`verbCollisions(census, declared)` takes a plain `Map` and the file's own "verb-ownership census
POSITIVE CONTROL" cell already builds one by hand a few hundred lines above.

**The fix** (test-only). New cell: two synthetic sources, one per #863 spelling
(`rpc === "list_entry_links"` and `path !== "/rest/v1/rpc/list_entry_links"`), run through
`verbsInSource` exactly as `rpcVerbCensus()` itself does, inverted into a `verb -> files` map, then
handed to `verbCollisions` against the REAL `SHARED_RPC_VERBS`. `list_entry_links` is deliberately
the real declared share (three real claimant files) — using it under two synthetic claimant NAMES
not on that declared list reproduces the exact shape a genuine regression would take, rather than a
verb no real collision gate would ever see. Assertion: both spellings are extracted (one verb key,
proven before the collision check even runs) and exactly one collision problem is reported, naming
the verb and both synthetic files.

**Vacuity.** `RPC_VERB_OPENER` reverted to the pre-#863 three-shape regex
(`verb ===` / `fn ===` only): the new cell failed (along with five others, for the same reason —
the census itself was reverted), confirming it is not vacuous. Restored byte-for-byte
(`diff` against a pre-edit backup: identical); re-run: 34/34 (was 33/34 before this round's
addition, now +1 new cell).

**Evidence:** `node --import ./test/bootstrap.mjs --import tsx --test
e2e/e2e-fixture-ownership.test.ts` (from `apps/web`) -> 34 tests, 34 pass, 0 fail. Commit
`f4c8f554`.

---

## L01-S5 · minor · #865 — the README a human reads before either file still carried no stale-build warning

**FIXED.**

**Reproduced.** `apps/web/e2e/README.md`'s opening "Run the default browser suite" section named
neither `BUILD_ID` nor `npx playwright`; the #865 warning lived only in
`serve-built.mjs`'s and `playwright.config.ts`'s own header comments, which a person reading the
README first would not see.

**The fix.** One sentence added to the README's run section, naming the trap (`npx playwright test`
/ an IDE runner skipping the build, citing the #648 19-minute-stale-build measurement by name, same
as the two file headers) and the correct invocation, plus a pointer to the BUILD_ID/age log line.

**Evidence:** `apps/web/e2e/README.md`, two-line diff. No test exercises README prose (the
acceptance criterion's own evidence is the two file headers, already proven in the lane's original
report); this is a docs-only completion of rule 9 ("the module README your change affects"), which
the original lane commit did for #848 but not #865. Commit `f4c8f554`.

---

## L01-S4 · minor · #862 — the body-reader census cannot see this repo's own stream-drain idiom

**REFUTED (the proposed fix), deferred as a follow-up — not applied.**

**Reproduced.** Confirmed the finding: `PRIVATE_BODY_READER_STREAM` only matches
`request.on("data"|"end")`; a grep for that shape across all 31 `*-mock.mjs` files plus
`mock-dispatch.mjs` returns zero hits. The idiom every real repointed reader (and the shared
`readCachedJson` itself) actually uses is `for await (const chunk of request)`, invisible to the
census unless it also matches the function-name half (`readJson`/`readBody`).

**Why the reviewer's own proposed fix does not survive a re-run.** The required_fix offered
"widen the stream pattern to `for await (const chunk of request)` ... with a named exception for
`documents-intake-mock.mjs`'s deliberate drain." Tried this and it fails on two counts, both
measured, not argued:

1. `grep -rln "for await" apps/web/e2e/*-mock.mjs` finds the phrase in **six** files, not one.
   Two are real, legitimate drains with the identical shape and rationale as
   `documents-intake-mock.mjs`'s (`chat-parity-mock.mjs:207`'s own `drain()`) — a second named
   exception the reviewer's evidence did not surface. The other four
   (`periodic-adjustment-mock.mjs:229`, `staff-expense-claim-mock.mjs:215`,
   `trade-invoice-mock.mjs:235`, `work-list-mock.mjs:214`) carry the exact phrase
   `` `for await (const chunk of request)` `` **verbatim inside backtick-quoted prose in a header
   comment**, describing the shared reader's own mechanism — not code at all.
2. The census (`bodyReaderViolation`) is a plain `.test(source)` over raw file text, not an
   AST or comment-stripped scan. A regex widened to catch the real idiom would, without further
   work, newly flag all four comment-only files as violations — breaking four currently-clean
   mocks to close one residual gap. Making it comment-aware (or otherwise able to tell "drains and
   discards" from "drains and parses") is a bigger structural change to a census file the whole
   wave depends on for body-reader correctness than a minor, ticket-scoped fix warrants, and #862's
   own newest Agent Brief (2026-09-19) already named exactly the two shapes this ticket widened —
   this third shape is new scope, not a residual of what was asked.

**Disposition:** left as a follow-up (the reviewer's own second option: "or file it as an issue
against the census"). No GitHub write is available to this lane worker, so it is recorded here
instead, with the exact evidence a future fix needs: the six-file list above, and the requirement
that any widening either exclude comments or accept the second named exception.

**Evidence:** `grep -rln "for await" apps/web/e2e/*-mock.mjs` -> 6 files; per-file `grep -n` shown
above distinguishes code (`chat-parity-mock.mjs`, `documents-intake-mock.mjs`) from comment-only
occurrences (the other four). No commit — no code or test changed for this finding.

---

## Gates re-run, with counts

| Gate | Result |
|---|---|
| `node --import ./test/bootstrap.mjs --import tsx --test e2e/e2e-fixture-ownership.test.ts` (from `apps/web`) | **34 tests, 34 pass, 0 fail** (was 33; +1 new cell, L01-S3) |
| `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3500 CLARA_E2E_NEXT_PORT=3501 CLARA_E2E_RUNTIME_PORT=3502 pnpm --filter @clara/web e2e journal-work-walk` | **23 passed, 0 failed** (×2: once mid-vacuity-break for L01-S1 showing 22 passed/1 failed at the right cell, once clean after restore) |
| `pnpm typecheck` (worktree root) | exit 0 (`apps/web` + `packages/runtime`, "Done") |
| `pnpm lint` (worktree root, whole chain) | exit 0 |
| Whole `apps/web` unit suite (`node scripts/run-tests.mjs`) | 3 runs: **4645/4645 pass, 2 skip** (×2); one run showed **4644 pass, 1 fail, 2 skip** — the RIG.md-documented `thread-live-clarify.test.tsx` load-flake-under-whole-suite, unrelated to any file this round touched, cleared on immediate re-run |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff |
| `git status` (worktree) | clean after commit |

`packages/db` and `packages/runtime` are untouched by this round (only `apps/web/e2e/*` and
`README.md`), so the db gate chain and `check-parts-parity.mjs` do not apply as separate gates,
consistent with the original lane report's own scoping.

## Files changed in `f4c8f554`

- `apps/web/e2e/journal-work-walk.spec.ts` — the L01-S1 request-listener + `expect.poll` re-read
  proof, and the L01-S2 test rename + honest-substitution comment. Net +52/-9 lines.
- `apps/web/e2e/e2e-fixture-ownership.test.ts` — the L01-S3 collision cell. +34 lines.
- `apps/web/e2e/README.md` — the L01-S5 stale-build sentence. +2 lines.

## Follow-ups worth filing

1. **L01-S4 (#862's census blind spot for `for await (const chunk of request)`)** needs either an
   AST-based or comment-stripped scan, or at minimum a second named exception
   (`chat-parity-mock.mjs`) beyond the one originally proposed — see the finding above for the
   measured six-file list. Not a five-minute regex change; worth its own ticket.
2. Everything else the original lane report already filed as follow-ups (the
   `intake-batch-mock.mjs` guard-and-return spelling being singular, and
   `work-knowledge-walk.spec.ts` being swept in by any `knowledge-walk` substring filter) is
   unchanged by this round.

## Unverified

- Hosted evidence: none. Everything above is local, on this Windows host, this lane's build
  (fresh `BUILD_ID` per `pnpm --filter @clara/web e2e` invocation during this round).
- Host contention: this Windows host may have run other wave-1 lanes concurrently during this
  session; no `0xc0000142` panic or other `RIG.md`-listed contention symptom was hit during any of
  this round's runs, so none is reported.
- The whole-suite unit run's one-time `thread-live-clarify.test.tsx`-shaped flake was not chased
  further than confirming it cleared on re-run and matches RIG.md's own documented entry for it —
  I did not re-run that single file in isolation to name it with certainty as that exact test,
  since the failing line was not captured before the log was overwritten by a subsequent run; the
  count arithmetic (one run at 4644/1/2, two runs at 4645/0/2, all totalling 4647) is what supports
  "exactly one test is flaky", not a captured name.
