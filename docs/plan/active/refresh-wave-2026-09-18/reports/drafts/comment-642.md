Landed on `main` via merge commit `ede1df83` (PR #954, "Wave 2026-09-18", merged 2026-09-19T13:59Z), branch `impl/642-chat-stream-admission` @ `566665f0` (21 commits, `5b320ea8` the merge — first of the ten, zero conflicts). **No migration** — no `.sql`, no `rig-meta` cohort, no gate module; the door's idempotency arm already existed in `0006_runtime_core.sql:954-960`, and `git diff origin/main..HEAD` touches exactly one file under `packages/db/` (a test). All evidence below is LOCAL; hosted evidence pending — this ticket stays open until the hosted release.

**Acceptance criteria**

| AC | Criterion | State | Evidence |
|---|---|---|---|
| AC1 | Scope beside composer; send/attachment idle/uploading/processing/error/done states | Done | 642-final.md AC1; `ClaraScopeBand.tsx`, both mounts |
| AC2 | Native shadcn Message/Scroller/Bubble/Attachment/Marker/Avatar | **Partial — named residual**: behaviour shipped, component migration deferred (D6 fallback) | 642-final.md AC2; digest §3 ticket-specific follow-up "Finish AC2's shadcn native-chat component migration" |
| AC3 | Duplicate send after lost ack resolves one intent | Done | `p642.web.repeated_utterance_is_a_NEW_intent`; 642-recheck-1.json ADV-642-1 (18/18, independently confirmed by revert-and-red: only that cell reds) |
| AC4 | Observable tool queued/running/refused/failed + source links | **Done — named residual**: no `queued` admission event this wave | 642-final.md AC4, follow-up #4; digest §3 cross-cutting row |
| AC5 | Preserve scroll, jump-to-latest, replace stream state on reconnect, `revoked` | Done | `useTranscriptScroll.ts`; 642-recheck-1.json spec F1 — real browser walk `chat-parity` 11/11 (45.2s), incl. `p642.e2e.long_history_scroll` |
| AC6 | Real reconnect/late attachment/long history/remount/draft/log/focus/reduced-motion | Partial, owed cells built | `p642.e2e.long_history_scroll`; `chat-parity` 11/11 |
| AC7 | Journey states incl. 320px/200% zoom/keyboard/screen-reader/URL/drafts | Partial, owed cells built | `composer-field-wiring.test.tsx` 18/18 (`aria-describedby` names the reason; `useId` per instance) |
| AC8 | Production-facing door, least-privileged roles, real Postgres World | Done locally; **hosted pending** | `chat-turn-v20-e2e.mjs` PASS (4 legs); `rig-runtime-lifecycle` 12/12; `chat-turn-replay-db` 2/2 |

**Historical obligations**

| Row(s) | Disposition | Evidence |
|---|---|---|
| UI-02 | Residual (folds into AC2's component migration) | 642-final.md "Historical rows" |
| UI-06 | Verify-only | 642-final.md |
| UI-10, UI-27 | → AC4, done | 642-final.md |
| UI-21, UI-22, CB-AE2E-008, H-24, H-26, H-32, C-42 | Verify-only, re-run clean | 642-final.md; `chat-parity` 11/11 |
| UI-32 | Built | 642-final.md |
| C-45 | Corrected | 642-final.md |

**Rulings that shaped it** — D6 (§0): ship behaviour first, component migration second, same tests (XL); migration became AC2's named residual at close. §6.2.1: intent key gains `transcriptPosition` (ratified — closes a blocker where repeated identical utterances collided forever); three refusal fixtures re-encoded off 404 (two → 502 `runtime_unreachable`, one unit cell → 500), ratified. §6.2.2: fix round 2 corrected the report's own "all three → 502" overstatement to the accurate split. §6 (implicit rulings): G4 — source links hang on the result card, never the tool chip.

**Integration and successor cut** — Merged first, no conflicts, added **no** `@shadcn/react` to the lockfile (integration-merge.md §2 — confirms the component migration genuinely wasn't shipped). #642 is **excluded by design** from both `chatTurn_v21` and `claraWork_v5`: live tool state is documented as a web fold, not a version cut (642-final.md "Successor contract: NONE, positively"; successors-final.md carries no #642 stanza). Nothing else in the cut touches this ticket.

**Named residuals (follow-ups to be filed, issue numbers do not exist yet)**
- Finish AC2's shadcn native-chat component migration (`attachment`, `message-scroller` overwrite the protected `button.tsx`)
- A `queued` admission event on the chat stream (needs a `chatTurn` cut)
- The pinned `shadcn` CLI adds a bogus `cn` production dependency on every resolved item
- `use-clara-thread-stop.test.ts` leaks a reattach timer between cells (feeds the cross-cutting whole-suite flake also hit by 8 of the wave's 10 tickets)

**Blueprint drift for #683's sync** — `PRD.md:121` parks "对话车道在连接失联后的完整恢复" citing closed #764; AC5 builds part of that gap (typed `revoked` on both mid-stream and attach-time paths), full reconnect semantics remain #764/#915's. `ARCHITECTURE.md:182-183,293` pin `chatTurn_v19`/`claraWork_v3`; live pins are already `chatTurn_v20`/`claraWork_v4` before this wave's own v21/v5 cut, and `workflowBodies` holds 53 frozen bodies where `:182` says 51.

**Verify locally**
```
pnpm typecheck && pnpm lint
node scripts/run-tests.mjs                     # apps/web: 4210 · 4208 pass · 0 fail · 2 skip
node tests/chat-turn-v20-e2e.mjs                # db clara_rt_test — PASS (4 legs)
pnpm --filter @clara/web e2e chat-parity        # 11/11
```
