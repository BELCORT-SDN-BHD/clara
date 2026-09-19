# #642 — final report

**Branch** `impl/642-chat-stream-admission` · **worktree** `C:\Users\zhant\Desktop\clara-wt\642` · **HEAD** `566665f0` · **21 commits** · 41 files, +5114/−93.
`94eb14f9 b583de08 e35a497a 4a9197d5 b1ffe20a fa6e71b9 204f746a b6eb4d07 9df50d30 f44fbe7b b024fee0 46a84750` (implementation)
`23ead783 859950d6 bb10d532 40e4b2a0 debb156a f9155ed1 1209dc93 772ad7c9 566665f0` (fix round 1 — see `642-fixround-1.md`)

**NO MIGRATION** — no `.sql`, no `rig-meta` cohort, no gate module, no `packages/db/package.json` gate row, no `action.yml` row; `git diff --name-only origin/main..HEAD` touches exactly one file under `packages/db/`, a test. The door's idempotency arm already exists (`0006_runtime_core.sql:954-960` returns the original task with `'replayed', true`; `:998` returns `false`) and every defect here is above the database. `operation-census.test.mjs` / `rig-isolation.test.mjs` are **not applicable**: no SQL function is installed.

## This pass (a re-invocation): two defects in the landed work, both fixed

Nine commits were already on the branch. I re-ran every gate myself rather than inherit the prior report's numbers, and **two of its claims did not hold.**

1. **`lib/clara/intentKey.ts` and `intentKey.test.ts` were BINARY to git** (`Bin 0 -> 6161 bytes`; `file(1)`: `data`) — three literal U+0001 U+0000 pairs in source, one load-bearing inside the collision control. A binary file gets no diff, no blame and no three-way merge, so the two files carrying this ticket's idempotency identity would have reached the integrator as an opaque blob. Escaped (`f44fbe7b`): the branch diff now renders 220 text lines, cell still 7/7.
2. **AC5's scroll ownership cost the transcript a second commit per delta.** The census `components/clara/thread-live-stream-stability.test.tsx` — untouched by this branch — reds here and is green on `origin/main`: *"committed 401 times for 200 deltas over 2s (budget 215)"*, that suite's own phrase for "a component updating itself". `useTranscriptScroll`'s append effect runs once per delta and published `atBottom`/`hasMoreBelow` unconditionally on its following arm, so every streamed token rendered the transcript twice. Fixed by mirroring both flags in refs and writing only on a real transition (`b024fee0`); the census now measures ~203, that file 8/8. New owned cell `p642.web.scroll_render_budget` reds at *"the hook added 12 render(s) of its own"* with either guard removed. The prior report called this a "known under-load flake, green in isolation": it failed **in isolation, deterministically**, and the file it named (`thread-live-clarify.test.tsx`) is green.

## Per acceptance criterion

- **AC1 done** — `ClaraScopeBand.tsx` above the composer at both mounts; the `(full)` pages measure both names server-side through ordinary self-scoped reads, never the scope spine. Read-only by decision, never a stale client name. Attachment states re-measured green.
- **AC2 — behaviour done, component migration is the NAMED RESIDUAL** (D6 fallback); re-measured below.
- **AC3 done** — `intentKey.ts` (FNV-1a 128 over a length-prefixed canonical address, attachment ids de-duplicated and sorted) + `chatRoutes.ts` carrying `replayed` on the 202 + `markSent(null)`, so a replay draws no second bubble. Cells `p642.db.*`, `p642.runtime.*`, `p642.web.intent_key*`, `p642.e2e.duplicate_send`. **Fix round 1 (blocker):** the address also carries the conversation's POSITION. Content alone made every repeated utterance ("yes", "ok", "continue") collide with the first one for the life of the session and be answered with the turn already run — no bubble, no task, no error. A retry is unaffected, because a refused or lost send adds nothing to the transcript; `p642.web.repeated_utterance_is_a_NEW_intent`.
- **AC4 done; `queued` is the named residual** (G3) — four live states + *refused* from a measured chunk trace; no part kind registered, no link on a chip (G4).
- **AC5 done** — `useTranscriptScroll.ts`, plus the `revoked` reducer arm and the loop `return` that stops reattaching. `revoked` had been on the wire since B-M3 with no case at all, so a member removed mid-stream sat in front of "Reconnecting…" forever. **Fix round 1:** a revocation discovered when the read OPENS (403/404 — the route cannot write an SSE frame before its own authorisation) now delivers the same event instead of eight rounds of "Reconnecting…", and the smooth jump's landing correction no longer races its own trailing scroll event (the spec lens measured the transcript stranded 36px short).
- **AC6/AC7 partial, owed cells built** — 320px + 200% + axe (`p642.e2e.long_history_scroll`); composer on `Field`/`FieldGroup`, one accessible name, `aria-invalid` — and, after fix round 1, an `aria-describedby` that names the REASON as well as the hint, plus per-instance ids (`useId`) so two mounted composers cannot steal each other's label.
- **AC8 done locally** — DB cells under the author's own role; `chat-turn-v20-e2e.mjs` **PASS (4 legs)**. **Hosted evidence pending.**

**Historical rows.** UI-02 → residual (AC2). UI-06 verify-only. UI-10/UI-27 → AC4. UI-21/UI-22/CB-AE2E-008/H-24/H-26/H-32/C-42 verify-only, re-run. **UI-32 built.** C-45 corrected.

## Commands (all run this pass)

| Command | Result |
|---|---|
| `pnpm typecheck` · `pnpm lint` (root) | **green** · **green** |
| `node scripts/run-tests.mjs` (apps/web) | **4210 · 4208 pass · 0 fail · 2 skip**, exit 0 (re-measured after fix round 1) |
| 40-gate `tests/rig-runtime-lifecycle.test.mjs` | **12/12** |
| `node --test tests/chat-turn-replay-db.test.mjs` | **2/2** |
| `node tests/chat-turn-v20-e2e.mjs` (db `clara_rt_test`) | **PASS (4 legs)** |
| `pnpm --filter @clara/web e2e chat-parity` | **11/11 (37.0s)**; re-run twice after fix round 1: **11/11 (46.8s)** and **11/11 (58.6s)** |
| `check-frozen-workflows.mjs` · `check-parts-parity.mjs` | OK (296 files) · OK |

A whole-suite run *before* the two fixes measured 4190 · 4185 pass · **3 fail**; after them it is clean. Fix round 1 re-ran it three times: run 1 lost thirteen whole FILES to host process crashes (`STATUS_COMMIT_LIMIT` and friends) minutes after two `next build`s — all 84 of their tests pass in isolation — and caught one real regression, now fixed (`772ad7c9`); run 2 hit the leak cell below; run 3 is **4210 · 4208 · 0 fail**, exit 0.

**One flake I could not clear** (and fix round 1 measured it again: green in whole-suite runs 1 and 3, red in run 2 at *"a stop the door says had ALREADY FINISHED does not re-attach"* with 3 stream opens leaked in from earlier cells; **26/26 in isolation**, three times). `use-clara-thread-stop.test.ts` cell 22 counts stream opens and is load-sensitive: **4/4 green alone**; whole-file, an interleaved A/B gave **branch 4/5 vs main 5/5** (an earlier loaded pair, 1/3 vs 3/3). No changed module touches the reattach path for a non-`revoked` event, and the file's own preceding cell documents this cross-cell leak class. Green in the final whole-suite run.

## AC2 residual, re-measured (`ui:add --dry-run`, one at a time)

**message / bubble / marker / avatar** resolve for `base-nova`: **1 file each, create only**, dep `cn`. **attachment / message-scroller** — the guard **REFUSES**: each overwrites the protected `components/ui/button.tsx`; `CLARA_UI_ADD_OVERWRITE` not set.

Two costs the prior pass did not name. `apps/web/tests/focus-ring-contract.test.ts` walks **every** `.ts/.tsx` under `components/`+`app/` and requires each `ring-ring/NN` to equal the declared 70, while the generated `bubble.tsx` ships `ring-ring/50` — so any install reds that census until the vendored file is re-based (house practice, but work). And Bubble paints through `*:data-[slot=bubble-content]:bg-*` child selectors, which outrank a plain `bg-clara-muted` on the content: keeping the Clara palette means adding a variant to the vendored file, not passing a class, and `ClaraMessageBubble.tsx:43-53` carries live axe measurements on those grounds. The branch carries **no half-migration**, no `@shadcn/react`, no stray `cn` dep.

## Docs

`CONTEXT.md` — Turn key / Conversation scope / Tool outcome, the three ratified terms in house shape, no fourth. `apps/web/README.md` — the Clara transcript section, plus the render-budget contract added this pass. `packages/runtime/README.md` — the 202's shape, the measured stream vocabulary and (fix round 1) the two doors a revocation can arrive through. **No PRD/ARCHITECTURE edit.**

## Blueprint drift (verified this pass, not edited)

`ARCHITECTURE.md:182` says `workflowBodies` has 51; `registry.ts:928`'s frozen array has **53** (freeze-lint agrees). `:182-183`/`:293` pin `chatTurn_v19`/`claraWork_v3`; `registry.ts:173,270` pin **v20/v4**. `PRD.md:121` parks 对话车道在连接失联后的完整恢复 citing the closed #764 — AC5 builds part of that gap.

## Successor contract: NONE, positively

`chatTurn.v10.impl.ts:216-221` writes every part, `chatTurn.v20.impl.ts:148-157` calls it, `streamRoute.ts:139` relays each as `event: chunk` unfiltered — live tool state is a **web fold**, not a version cut; parity and freeze green are the proof. **Measured** (`ai@7.0.77`, real `streamText` + `MockLanguageModelV4` through the real `consumeChatTurnModelResult`): `tool-input-*` carry **`id`** while `tool-call`/`tool-result`/`tool-error` carry **`toolCallId`** — a fold written from the documented vocabulary would have shown nothing for *preparing*, silently, every turn. No admission event ⇒ no `queued`. #915/#847 own that slot.

## Assumptions

The World leg is hard-gated to `PGDATABASE ∈ {clara_rt_test, clara_wave_b_ci}`, so it ran on the `clara_642 → clara_rt_test` clone (RIG.md's recipe); `clara_642` keeps no World, so #866's T10b is untouched. `marker`/`avatar` were not installed because nothing here uses them. A height contract for the new scroll ownership belongs to `(firm)/layout.tsx` (#659's file) — raised as a question, never edited.

## Follow-ups

1. **The pinned `shadcn` CLI adds a bogus `cn` production dependency** on every resolved item, though this repo imports `cn` from `@/lib/utils`; the `ui:add` guard should strip or refuse it instead of leaving each caller to revert `package.json` and the lockfile.
2. **Finish AC2's component family**, carrying this measurement: `attachment`/`message-scroller` need `button.tsx` reviewed or the item taken without it, `message-scroller` needs `@shadcn/react` costed for the Workers bundle, and each installed file re-based onto `--focus-ring-alpha` before the census sees it.
3. **`use-clara-thread-stop.test.ts` leaks a reattach timer between cells** — the preceding cell aborts by task id and still does not contain it. A per-cell drain (or an injected `sleepImpl`) would stop a count-based absence cell inheriting another cell's stream.
4. **`queued` on the chat stream** needs a `chatTurn` cut emitting an admission event — the one thing this ticket deliberately did not take.

## Unverified

Hosted behaviour (everything here is local). Whether `@shadcn/react` is acceptable in the Workers bundle — never installed. The rendered output of `attachment`/`message-scroller` — read via `--view`, never written. Whether cell 22's flake predates this branch: unattributable by inspection, and 5 A/B pairs is not a proof.
